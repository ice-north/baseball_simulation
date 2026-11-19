// ============================================================
// プロ野球への道（オンラインのNPBドラフト）。
//
// ⚠ 先方要望（2026-11-16）: 一度外したプロからの指名を解禁する。ただし以前（一人用の
//    `processNPBDraft` をそのまま回していた頃）は各球団2〜3人ずつ抜かれていたので、
//    **リーグ全体で年に0〜5人**（線を越えた選手だけ。枠は5人）。若さ・能力・顕著な成績（タイトル）を見て選ぶ。
// ⚠ 抜かれた球団が戦力を失うだけの罰にならないよう、ご褒美を付ける:
//    - チームメイトのプロ意識 +5（`TEAMMATE_DISCIPLINE`）
//    - チームメイトの経験 +30試合分（`TEAMMATE_EXPERIENCE_GAMES`。キャンプの覚醒の起きやすさに効く）
//    - 球団史に刻む（`league.chronicle.proDrafted`。球団史・記録の「プロ入りした選手」と入退団履歴）
//    プロ入りした選手はリーグ便り（お知らせ `draft`）と、球団史・記録の「リーグからプロへ」に出る。
// ⚠ **誰が指名されるかに乱数は使わない**（いしだ 2026-11-19「指名は能力値がプロに達した
//    から行われるものです。確率ではありません」）。`PRO_DRAFT_THRESHOLD` を越えた選手を
//    点の高い順に、枠（`PRO_DRAFT_MAX`）まで。乱数はどのNPB球団が獲るかだけで、それも
//    リーグの種×年で決める（`hashSeed`）ので、同じ年度をやり直せば同じ結果になる。
// ⚠ 保存に足すのは `league.chronicle.proDrafted` だけ（無ければ作る）。古いリーグもそのまま読める
// ============================================================
import { hashSeed } from '../src/game/rng.js';
import {
  checkNPBDraftEligibility,
  computeSeasonAwardBonuses,
} from '../src/season/yearProgressionSystem.js';
import { FULL_SEASON_EXPERIENCE } from '../src/season/campTraining.js';
import { draftRankText } from '../src/online/chronicleText.js';

/**
 * 1年に指名される上限（いしだ 2026-11-19「指名数は最大を5名程度に。ただし現実的には
 * 厳しく、0名の年もあるように」）。
 * ⚠ これは**枠の上限**（NPBの指名枠）で、厳しさの本体ではない。厳しさは
 *    `PRO_DRAFT_THRESHOLD` だけで決まる。上限を上げても当たり年の人数が増えるだけ
 */
export const PRO_DRAFT_MAX = 5;
/**
 * **プロに達した能力の線**（`checkNPBDraftEligibility` の総合点。年齢・能力・成長力・知名度込み）。
 *
 * ⚠ 指名は**確率ではない**（いしだ 2026-11-19「あくまでも、指名は能力値がプロに達した
 *    から行われるものです。確率ではありません」）。この線を越えた選手は越えた年に指名される
 *    （枠 `PRO_DRAFT_MAX` を超えた分は点の低い方からその年は残り、翌年また候補になる）。
 *    以前はしきい値258＋確率（基準8%・越えた分で加算）で決めていたが、
 *    「越えても抜かれない年がある」のは筋が通らないので確率を外した。
 * ⚠ **厳しさを決めるのはここだけ**。確率を外すと同じ258では年3.3人も抜かれるので、
 *    線を上げて釣り合わせてある。80リーグぶんの実測（初期セットの名簿、成績の加点なし）:
 *     258 … 年平均3.33人・0人 0%   （確率を外す前と同じ線）
 *     270 … 年平均1.84人・0人11%
 *     **278 … 年平均1.13人・0人31%・1人39%・2人20%・3人8%・4人以上2%** ←いま
 *     285 … 年平均0.66人・0人49%
 *    確率で決めていたときの釣り合い（平均1.13人・0人36%）をそのまま引き継いでいる。
 *    変えたら `online-pro-draft-check` で測り直すこと。
 */
export const PRO_DRAFT_THRESHOLD = 278;
/** タイトル（1位+10・2位+5、`computeSeasonAwardBonuses`）に掛ける倍率。顕著な成績を重く見る */
const AWARD_WEIGHT = 1.5;
/** ご褒美: チームメイトのプロ意識 */
export const TEAMMATE_DISCIPLINE = 5;
/** ご褒美: チームメイトの経験（何試合分か） */
export const TEAMMATE_EXPERIENCE_GAMES = 30;
/** 球団史に残す件数（リーグ全体。年0〜5人なので数十年分） */
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
 * ⚠ 線は**実測のしきい値超え**に合わせてある。しきい値278で指名された90人の超え幅は
 *    25%点3・中央10・75%点21・90%点50・最大85。この帯だと
 *    **上位（1〜3位）9%・中位（4〜7位）48%・育成43%**。
 *    `PRO_DRAFT_THRESHOLD` や能力の出方を変えたら測り直すこと（`online-pro-draft-check`）。
 */
const DRAFT_RANKS = [
  { min: 80, round: 1 },
  { min: 66, round: 2 },
  { min: 54, round: 3 },
  { min: 38, round: 4 },
  { min: 26, round: 5 },
  { min: 16, round: 6 },
  { min: 8, round: 7 },
  // ここから下は育成指名（支配下ではない契約）
  { min: 3, round: 1, ikusei: true },
  { min: -Infinity, round: 2, ikusei: true },
];
export const rankOf = (margin) => DRAFT_RANKS.find((r) => margin >= r.min);
/** 「4位」「育成2位」。画面と同じ関数（`chronicleText.js`）。⚠ アプリ（`Chronicle.kt`）も同じ書き方 */
export const rankLabel = draftRankText;

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

/** プロに達しているか（`PRO_DRAFT_THRESHOLD` を越えた能力。確率は挟まない） */
export const isProLevel = (score) => score >= PRO_DRAFT_THRESHOLD;

/**
 * その年の指名を決める（名簿はまだ変えない）。
 * **プロに達した選手（`isProLevel`）を点の高い順に、枠（`PRO_DRAFT_MAX`）まで**。
 * ⚠ 確率は挟まない。達していなければ0人の年になる
 * @returns {{ teamName, player, score, awards, round, npbTeam }[]}
 */
export function chooseProDraft(league, teams, skip = new Set()) {
  const picks = [];
  // `processSeasonEnd` と同じ試合数の取り方
  const totalGames =
    league.season?.settings?.gamesPerSeason || league.season?.schedule?.length || 0;
  for (const c of proDraftCandidates(teams, skip, { totalGames })) {
    if (picks.length >= PRO_DRAFT_MAX) break;
    if (!isProLevel(c.score)) break;
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
