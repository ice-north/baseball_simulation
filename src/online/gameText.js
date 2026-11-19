// 試合の一覧・成績で共用する短い表記。表示専用で、保存データや計算には使わない。
import { INDEPENDENT_LEAGUES } from '../corporate/independentLeagueData.js';

const ABBREVIATIONS = new Map(
  Object.values(INDEPENDENT_LEAGUES).flatMap((league) =>
    league.teams.map((team) => [team.name, team.abbreviation]),
  ),
);
// 球団の**表示名**。内部名は記録の選手キーまで貫いているので変えられないが、
// 参加した人が付けた名前は画面に出す。
// ⚠ **表示専用**。保存データ・日程・順位表の照合は内部名のまま行うこと。
// ⚠ モジュールの変数に置いている。画面は一度に1つのリーグしか出さないので足りる。
//    `OnlineApp` がビューを受け取るたびに差し替える。
let LABELS = {};
export function setTeamLabels(map) {
  LABELS = map || {};
}
export const teamLabel = (name) => LABELS[name]?.label || name;
export const teamShort = (name) =>
  LABELS[name]?.short || ABBREVIATIONS.get(name) || name;
/**
 * 球団名を「都市」と「愛称」に分ける（折り返す位置を決めるため）。
 * ⚠ 既定の名前は「都市＋愛称」で、略称が都市（`pyramidLeague.js`）。狭い欄で折ると
 *    「姫路シー／ホース」「那覇ハリ／ケーンズ」と愛称の途中で割れていた（再監査 F18）。
 *    名前を付け替えた球団（表示名が内部名と違う）は分け目が分からないので分けない
 */
export function teamNameParts(name) {
  const label = teamLabel(name);
  const short = teamShort(name);
  return label === name &&
    short &&
    short.length < label.length &&
    label.startsWith(short)
    ? [short, label.slice(short.length)]
    : [label];
}

// 自球団から見た勝敗。自球団の試合でなければnull。
export function ownOutcome(game, teamName) {
  if (game.homeScore == null || game.awayScore == null) return null;
  const own =
    game.home === teamName ? 'home' : game.away === teamName ? 'away' : null;
  if (!own) return null;
  const diff =
    own === 'home'
      ? game.homeScore - game.awayScore
      : game.awayScore - game.homeScore;
  return diff > 0
    ? { mark: '勝', tone: 'win' }
    : diff < 0
      ? { mark: '敗', tone: 'loss' }
      : { mark: '分', tone: 'draw' };
}

// 勝・敗・S・Hを区切り付きの1行にする。
export function decisionText(decisions) {
  if (!decisions) return '';
  return [
    decisions.winningPitcher && `勝 ${decisions.winningPitcher.name}`,
    decisions.losingPitcher && `敗 ${decisions.losingPitcher.name}`,
    decisions.savePitcher && `S ${decisions.savePitcher.name}`,
    decisions.holdPitchers?.length &&
      `H ${decisions.holdPitchers.map((p) => p.name).join('・')}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

// 勝率は野球の慣例どおり先頭の0を省く（1.000はそのまま）。
export const formatRate = (value) =>
  Number.isFinite(value) ? value.toFixed(3).replace(/^0\./, '.') : '—';
