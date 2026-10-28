// 試合の一覧・成績で共用する短い表記。表示専用で、保存データや計算には使わない。
import { INDEPENDENT_LEAGUES } from '../corporate/independentLeagueData.js';

const ABBREVIATIONS = new Map(
  Object.values(INDEPENDENT_LEAGUES).flatMap((league) =>
    league.teams.map((team) => [team.name, team.abbreviation]),
  ),
);
export const teamShort = (name) => ABBREVIATIONS.get(name) || name;

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
