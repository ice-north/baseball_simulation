// ============================================================
// プロ野球への道（オンラインのNPBドラフト）。
//
// ⚠ 先方要望（2026-11-16）: 一度外したプロからの指名を解禁する。ただし以前（一人用の
//    `processNPBDraft` をそのまま回していた頃）は各球団2〜3人ずつ抜かれていたので、
//    **リーグ全体で年に0〜3人**に絞る。若さ・能力・顕著な成績（タイトル）を見て選ぶ。
// ⚠ 抜かれた球団が戦力を失うだけの罰にならないよう、ご褒美を付ける:
//    - チームメイトのプロ意識 +5（`TEAMMATE_DISCIPLINE`）
//    - チームメイトの経験 +30試合分（`TEAMMATE_EXPERIENCE_GAMES`。キャンプの覚醒の起きやすさに効く）
//    - 球団史に刻む（`league.chronicle.proDrafted`。球団史・記録の「プロ入りした選手」と入退団履歴）
//    プロ入りした選手はリーグ便り（お知らせ `draft`）と、球団史・記録の「リーグからプロへ」に出る。
// ⚠ **乱数はリーグの種×年で決める**（`hashSeed`）。同じ年度をやり直せば同じ結果になる。
// ⚠ 保存に足すのは `league.chronicle.proDrafted` だけ（無ければ作る）。古いリーグもそのまま読める
// ============================================================
import { hashSeed } from '../src/game/rng.js';
import {
  checkNPBDraftEligibility,
  computeSeasonAwardBonuses,
} from '../src/season/yearProgressionSystem.js';
import { FULL_SEASON_EXPERIENCE } from '../src/season/campTraining.js';

/** 1年に指名される上限 */
export const PRO_DRAFT_MAX = 3;
/**
 * 指名を考える点のしきい値（`checkNPBDraftEligibility` の総合点。年齢・能力・成長力・知名度込み）。
 * ⚠ 初期セットの12球団（288人）で上位1%ほどがここを越える（99%点 252〜264）。30リーグ×3年の実測（2026-11-16、成績の加点なし）で 年平均1.27人・0人23%/1人38%/2人21%/3人16%
 */
export const PRO_DRAFT_THRESHOLD = 258;
/** しきい値を越えた分の確率の傾き（越えた点 ÷ これ、を基準の確率に足す） */
const PRO_DRAFT_SLOPE = 50;
/** しきい値ちょうどの選手が指名される確率と、どれだけ越えても届かない上限 */
const PRO_DRAFT_BASE_P = 0.12;
const PRO_DRAFT_MAX_P = 0.7;
/** タイトル（1位+10・2位+5、`computeSeasonAwardBonuses`）に掛ける倍率。顕著な成績を重く見る */
const AWARD_WEIGHT = 1.5;
/** ご褒美: チームメイトのプロ意識 */
export const TEAMMATE_DISCIPLINE = 5;
/** ご褒美: チームメイトの経験（何試合分か） */
export const TEAMMATE_EXPERIENCE_GAMES = 30;
/** 球団史に残す件数（リーグ全体。年0〜3人なので数十年分） */
const KEEP_PRO_DRAFTED = 120;

const NPB_TEAMS = [
  '読売ジャイアンツ', '阪神タイガース', '横浜DeNAベイスターズ',
  '広島東洋カープ', '中日ドラゴンズ', 'ヤクルトスワローズ',
  'オリックス・バファローズ', 'ソフトバンクホークス', '西武ライオンズ',
  '楽天ゴールデンイーグルス', '千葉ロッテマリーンズ', '日本ハムファイターズ',
];

/** 0〜1 の決まった乱数（リーグの種×年×用途） */
const unit = (league, tag) =>
  hashSeed(`${league.seed ?? 0}:${league.season.year}:proDraft:${tag}`) / 4294967296;

/**
 * 何位で指名されたか（点が高いほど上位。`ikusei` は育成指名）。
 *
 * ⚠ **独立リーグからの指名は中位〜育成が大半**（いしだ 2026-11-18「ドラフト順位が
 *    甘すぎます。独立リーガーのドラフトは中位から育成指名が大半だと思います」）。
 *    以前は `margin >= 25` で1位だったので、実測（40リーグ×3年・161人）で
 *    **1位32%・2位24%・3位24%** と上位指名ばかりだった。
 * ⚠ 線は**実測のしきい値超え**（中央16・75%点30・最大105）に合わせてある。
 *    `PRO_DRAFT_THRESHOLD` や能力の出方を変えたら測り直すこと（`online-pro-draft-check`）。
 */
const DRAFT_RANKS = [
  { min: 90, round: 1 },
  { min: 70, round: 2 },
  { min: 52, round: 3 },
  { min: 38, round: 4 },
  { min: 27, round: 5 },
  { min: 18, round: 6 },
  { min: 11, round: 7 },
  // ここから下は育成指名（支配下ではない契約）
  { min: 5, round: 1, ikusei: true },
  { min: -Infinity, round: 2, ikusei: true },
];
export const rankOf = (margin) => DRAFT_RANKS.find((r) => margin >= r.min);
/** 「4位」「育成2位」。⚠ 画面（`chronicleText.js`）・アプリ（`Chronicle.kt`）と同じ書き方 */
export const rankLabel = (r) => `${r?.ikusei ? '育成' : ''}${r?.round ?? ''}位`;

/**
 * 候補の点（高い順）。`teams` は対人リーグの球団名 → 球団。
 * 初期メンバーを待っている球団（`skip`）は外す（名簿はキャンプで入れ替わる）。
 * ⚠ タイトルの規定は本物のタイトル（`processSeasonEnd` → `season.frozenAwards`）と同じ
 *    規定打席・規定投球回（`totalGames` から決める）。以前は固定の100打数・10回で、
 *    10回で防御率0.00の中継ぎが「最優秀防御率」として指名の理由に出ていた
 */
export function proDraftCandidates(teams, skip = new Set(), { totalGames } = {}) {
  const awards = computeSeasonAwardBonuses(teams, { totalGames });
  const list = [];
  for (const [teamName, team] of Object.entries(teams)) {
    if (skip.has(teamName)) continue;
    for (const player of team?.players || []) {
      if ((player.age || 20) >= 30) continue;
      const award = awards[player.id];
      const { totalScore } = checkNPBDraftEligibility(player, (award?.bonus || 0) * AWARD_WEIGHT);
      list.push({ teamName, player, score: totalScore, awards: award?.awards || [] });
    }
  }
  return list.sort((a, b) => b.score - a.score || String(a.player.name).localeCompare(String(b.player.name), 'ja'));
}

/** 指名される確率（しきい値を越えた分で上がる） */
export const proDraftChance = (score) =>
  score < PRO_DRAFT_THRESHOLD
    ? 0
    : Math.min(PRO_DRAFT_MAX_P, PRO_DRAFT_BASE_P + (score - PRO_DRAFT_THRESHOLD) / PRO_DRAFT_SLOPE);

/**
 * その年の指名を決める（名簿はまだ変えない）。高い順に確率で決め、3人で打ち切る。
 * @returns {{ teamName, player, score, awards, round, npbTeam }[]}
 */
export function chooseProDraft(league, teams, skip = new Set()) {
  const picks = [];
  // `processSeasonEnd` と同じ試合数の取り方
  const totalGames =
    league.season?.settings?.gamesPerSeason || league.season?.schedule?.length || 0;
  for (const c of proDraftCandidates(teams, skip, { totalGames })) {
    if (picks.length >= PRO_DRAFT_MAX) break;
    const p = proDraftChance(c.score);
    if (p <= 0) break;
    if (unit(league, `pick:${c.player.id}`) >= p) continue;
    const npbTeam = NPB_TEAMS[Math.floor(unit(league, `npb:${c.player.id}`) * NPB_TEAMS.length)];
    const rank = rankOf(c.score - PRO_DRAFT_THRESHOLD);
    picks.push({ ...c, round: rank.round, ikusei: !!rank.ikusei, npbTeam });
  }
  return picks;
}

/** 指名の理由（画面と記録に出す短い文） */
function reasonOf(pick) {
  const p = pick.player;
  const parts = [];
  if ((p.age || 99) <= 22) parts.push(`${p.age}歳の将来性`);
  // 「首位打者1位」→「首位打者」、「本塁打王2位」→「本塁打王争い2位」
  if (pick.awards.length)
    parts.push(pick.awards.map((a) => (a.endsWith('1位') ? a.slice(0, -2) : a.replace(/2位$/, '争い2位'))).join('・'));
  return parts.join('、') || '能力を評価';
}

/**
 * 指名を当てる: 名簿から外し、チームメイトにご褒美を渡し、球団史とリーグ便りに残す。
 *
 * @param remove (teamName, player) => void 名簿から外す処理（打順・ローテの後始末まで。呼ぶ側の流儀に合わせる）
 * @returns 球団史に足した行
 */
export function applyProDraft(league, teams, picks, { remove, gamesPerSeason = 120 } = {}) {
  if (!picks.length) return [];
  const year = league.season.year;
  const perGame = FULL_SEASON_EXPERIENCE / Math.max(1, gamesPerSeason);
  const rows = [];
  for (const pick of picks) {
    const team = teams[pick.teamName];
    if (!team?.players?.some((x) => x.id === pick.player.id)) continue;
    const p = pick.player;
    rows.push({
      year,
      team: pick.teamName,
      name: p.name,
      key: p.onlinePlayerId || null,
      position: p.position || null,
      age: p.age ?? null,
      npbTeam: pick.npbTeam,
      round: pick.round,
      // ⚠ 育成指名（支配下ではない契約）。画面とアプリは「育成2位」と出す
      ...(pick.ikusei ? { ikusei: true } : {}),
      reason: reasonOf(pick),
    });
    remove(pick.teamName, p);
  }
  // ご褒美（同じ球団から2人出ても1回ずつ効く＝球団の誉れが重なる）
  for (const row of rows) {
    for (const mate of teams[row.team]?.players || []) {
      if (mate.personality) {
        const d = mate.personality.discipline ?? 50;
        mate.personality.discipline = Math.min(100, d + TEAMMATE_DISCIPLINE);
      }
      mate.experience = (mate.experience || 0) + Math.round(TEAMMATE_EXPERIENCE_GAMES * perGame);
    }
  }
  const chronicle = (league.chronicle ||= { milestones: [], retired: [], world: [] });
  chronicle.proDrafted = [...rows, ...(chronicle.proDrafted || [])].slice(0, KEEP_PRO_DRAFTED);
  if (rows.length)
    league.notices.unshift({
      type: 'draft',
      year,
      picks: rows.map((r) => ({ round: rankLabel(r), name: r.name, team: r.team, npbTeam: r.npbTeam })),
    });
  return rows;
}
