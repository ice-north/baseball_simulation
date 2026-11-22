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
/**
 * 指名時の能力を残す件数（新しい順）。⚠ いしだ 2026-11-20「ドラフト結果で、選手名を
 * クリックすると、その選手の詳細能力が見られるようにしてください」。抜かれた選手は
 * 名簿から消えるので、**指名した時点の能力をここに写して**おく（1人約700B）。
 * ⚠ 全120件に付けると芯が約86KB増える（上限1830KBのうち、いま1523KB）。
 *    押せるのは新しい指名だけで足りるので24件（年0〜5人なので5年以上）に絞る。
 */
const KEEP_PRO_DRAFTED_PLAYERS = 24;

/**
 * 指名された選手の能力の写し。⚠ **画面の選手情報（`PlayerPerformance.jsx` の `Detail`）が
 * そのまま開ける形**にすること（`server/projection.mjs` の `playerView` と同じ並び）。
 * 成績は入れない（記録の方に残っている）。
 */
export function draftSnapshot(player) {
  if (!player) return null;
  const pick = (obj, keys) =>
    obj && Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
  return {
    id: player.id,
    name: player.name,
    age: player.age,
    position: player.position,
    number: player.number,
    batting: player.batting,
    pitching: player.pitching,
    fielding: player.fielding,
    physical: pick(player.physical, [
      'speed', 'arm', 'throws', 'bodyStamina', 'recovery', 'muscle', 'dexterity', 'build',
    ]),
    catching: player.catching && { lead: player.catching.lead },
    personality: player.personality && {
      discipline: player.personality.discipline,
      mental: player.personality.mental,
    },
    positionFitness: player.positionFitness,
    growthPotential: player.growthPotential,
  };
}

const NPB_TEAMS = [
  '読売ジャイアンツ', '阪神タイガース', '横浜DeNAベイスターズ',
  '広島東洋カープ', '中日ドラゴンズ', 'ヤクルトスワローズ',
  'オリックス・バファローズ', 'ソフトバンクホークス', '西武ライオンズ',
  '楽天ゴールデンイーグルス', '千葉ロッテマリーンズ', '日本ハムファイターズ',
];

/** 0〜1 の決まった乱数（リーグの種×年×用途） */
const unit = (league, tag) =>
  hashSeed(`${league.seed ?? 0}:${league.season.year}:proDraft:${tag}`) / 4294967296;

/** 紙面・バッジに出す NPB 球団の短い呼び名（`NPB_TEAMS` と同じ並び） */
const NPB_SHORT = {
  '読売ジャイアンツ': '巨人', '阪神タイガース': '阪神', '横浜DeNAベイスターズ': 'DeNA',
  '広島東洋カープ': '広島', '中日ドラゴンズ': '中日', 'ヤクルトスワローズ': 'ヤクルト',
  'オリックス・バファローズ': 'オリックス', 'ソフトバンクホークス': 'ソフトバンク', '西武ライオンズ': '西武',
  '楽天ゴールデンイーグルス': '楽天', '千葉ロッテマリーンズ': 'ロッテ', '日本ハムファイターズ': '日本ハム',
};
export const npbShort = (name) => NPB_SHORT[name] || name;
/**
 * その年にこの選手を追っている NPB 球団。⚠ **指名するときと同じ式**（`chooseProDraft`）なので、
 * 噂の出た球団がそのまま指名する（「西武が熱視線」の選手を中日が獲ることはない）
 */
export const npbTeamFor = (league, playerId) =>
  NPB_TEAMS[Math.floor(unit(league, `npb:${playerId}`) * NPB_TEAMS.length)];

/**
 * ドラフトの気配（先方要望 2026-11-21「どの球団が誰に注目しているかの記事が欲しい。
 * 噂が出たあと、選手に黄色でプロ球団のバッジが付いてもいい」）。
 *
 * - 線より `PRO_WATCH_MARGIN` 下から「注目」（`watch`）、`PRO_HOT_MARGIN` 下から「接触」（`hot`）。
 *   指名そのものは `PRO_DRAFT_THRESHOLD` だけで決まる（ここは見え方だけで、指名に効かない）。
 *   実測（初期セット30リーグ・開幕時・成績の加点なし）: 線−25 以上はリーグに平均4.7人、
 *   線−8 以上は約1.6人、線以上は1.0人。シーズンが進むとタイトルの加点で少し増える。
 * - 噂が出る日は選手ごとに決まっている（5月1日〜7月31日。リーグの種×年×選手）。
 *   その日より前は出さない。指名の日（`_draftDone`）を過ぎたら消える（指名された人は球団史へ）。
 * - 乱数は使わない（同じ日を何度見ても同じ）。
 */
export const PRO_WATCH_MARGIN = 25;
export const PRO_HOT_MARGIN = 8;
const WATCH_START_DAYS = 92; // 5/1 から 7/31 まで
const dayOfSeason = (d) => {
  const lengths = [31, 30, 31, 30, 31, 31, 30]; // 4月〜10月
  const m = (d?.month ?? 0) - 4;
  if (m < 0) return -1;
  return lengths.slice(0, m).reduce((a, b) => a + b, 0) + (d?.day ?? 1) - 1;
};
const MAY_FIRST = 30;
export function proWatchList(league, teams, skip = new Set()) {
  const season = league.season;
  if (!season || season._draftDone) return [];
  const today = dayOfSeason(season.currentDate);
  if (today < MAY_FIRST) return [];
  const totalGames = season.settings?.gamesPerSeason || season.schedule?.length || 0;
  const rows = [];
  for (const c of proDraftCandidates(teams, skip, { totalGames })) {
    const margin = c.score - PRO_DRAFT_THRESHOLD;
    if (margin < -PRO_WATCH_MARGIN) break;
    const start = MAY_FIRST + Math.floor(unit(league, `watch:${c.player.id}`) * WATCH_START_DAYS);
    if (today < start) continue;
    rows.push({
      id: c.player.id,
      name: c.player.name,
      team: c.teamName,
      npb: npbShort(npbTeamFor(league, c.player.id)),
      level: margin >= -PRO_HOT_MARGIN ? 'hot' : 'watch',
    });
  }
  return rows;
}

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
    const npbTeam = npbTeamFor(league, c.player.id);
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
      // 指名した時点の能力（名簿から消えるので、ここに写しておく。新しい24件だけ残る）
      player: draftSnapshot(p),
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
  // ⚠ 能力の写しは**新しい方から `KEEP_PRO_DRAFTED_PLAYERS` 件だけ**残す（芯を膨らませない）。
  //    写しの落ちた古い指名は、画面で名前を押せないだけ（文の情報はそのまま残る）
  chronicle.proDrafted = [...rows, ...(chronicle.proDrafted || [])]
    .slice(0, KEEP_PRO_DRAFTED)
    .map((row, i) => {
      if (i < KEEP_PRO_DRAFTED_PLAYERS || !row.player) return row;
      const { player, ...rest } = row;
      return rest;
    });
  if (rows.length)
    league.notices.unshift({
      type: 'draft',
      year,
      picks: rows.map((r) => ({ round: rankLabel(r), name: r.name, team: r.team, npbTeam: r.npbTeam })),
    });
  return rows;
}
