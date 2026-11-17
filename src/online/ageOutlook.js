// ============================================================
// 年齢構成と「3年後の見込み」（自球団だけ）。
//
// ⚠ 先方回答（2026-11-16）「すぐやりたい」B4。トライアウトで「若手を取るか、即戦力か」を
//    考える材料。数字はサーバーが作り（`projectLeague` の `ageOutlook`）、PC・スマホWeb・
//    アプリは並べるだけ（文が同じになる）。
// ⚠ 伸びの見込みは一人用の将来性の札と同じ `projectPeak` / `estimatePeakAge`（成長力とプロ意識から決まる
//    ピーク年齢。乱数なし）。成長力は自球団の選手にしか見せていないので、**他球団には作らない**。
// ⚠ 引退が近い年齢（35歳〜）は、オンラインの退団の起きやすさ（`rosterProgression.js` の
//    `IND_LEAVE_BY_AGE`: 30代前半6% → 35歳から12% → 40歳から25%）の段に合わせた目安。
// ============================================================
import { projectPeak, estimatePeakAge } from '../season/potential.js';
import { calcPlayerOverall } from '../season/dispatchSystem.js';

/** 年齢の段（見出し・下限・上限） */
export const AGE_BANDS = [
  { label: '〜22歳', min: 0, max: 22 },
  { label: '23〜25歳', min: 23, max: 25 },
  { label: '26〜28歳', min: 26, max: 28 },
  { label: '29〜31歳', min: 29, max: 31 },
  { label: '32〜34歳', min: 32, max: 34 },
  { label: '35歳〜', min: 35, max: 99 },
];
/** 何年後を見るか */
export const OUTLOOK_YEARS = 3;
/** 主力として見る人数（総合力の上から。野手・投手） */
export const CORE_FIELDERS = 9;
export const CORE_PITCHERS = 6;
/** 引退が近い年齢の目安 */
export const VETERAN_AGE = 35;
/** 「これから伸びる」とみなす伸びしろ（総合力で何点上がる見込みか） */
const RISING_UPSIDE = 6;

const isPitcher = (p) => p.position === 'pitcher';
const avg = (list) => (list.length ? list.reduce((s, x) => s + x, 0) / list.length : null);
const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

/**
 * 3年後の見込み（その選手1人）。
 * - rising: ピーク年齢まで3年以上ある（まだ伸びる）
 * - peak: 3年後もピークの近く（ピーク年齢＋3年まで）
 * - decline: 3年後はピークを過ぎて4年以上（下り坂の見込み）
 */
export function outlookOf(player, years = OUTLOOK_YEARS) {
  const age = player.age ?? 22;
  const { upside } = projectPeak(player);
  // ⚠ ピーク年齢は `estimatePeakAge` から取る。`projectPeak` はピークを過ぎた人に「いまの年齢」を返すので、
  //    33歳でも3年後が「ピークの近く」に見えてしまう
  const peakAge = estimatePeakAge(Math.max(0.3, player.growthPotential ?? 1.0), player.personality?.discipline ?? 50);
  const later = age + years;
  const kind = later <= peakAge ? 'rising' : later <= peakAge + 3 ? 'peak' : 'decline';
  return { age, later, peakAge, upside, kind, veteran: later >= VETERAN_AGE };
}

/**
 * 自球団の年齢構成と3年後の見込み。
 * @param players 自球団の名簿
 * @param leagueAges リーグ全体の選手の年齢（平均と比べる）
 */
export function ageOutlook(players, leagueAges = []) {
  const list = (players || []).filter((p) => Number.isFinite(p?.age));
  if (!list.length) return null;
  const bands = AGE_BANDS.map((b) => ({
    label: b.label,
    pitchers: list.filter((p) => isPitcher(p) && p.age >= b.min && p.age <= b.max).length,
    fielders: list.filter((p) => !isPitcher(p) && p.age >= b.min && p.age <= b.max).length,
  }));
  const byOverall = (a, b) => calcPlayerOverall(b) - calcPlayerOverall(a) || String(a.name).localeCompare(String(b.name), 'ja');
  const core = [
    ...list.filter((p) => !isPitcher(p)).sort(byOverall).slice(0, CORE_FIELDERS),
    ...list.filter(isPitcher).sort(byOverall).slice(0, CORE_PITCHERS),
  ];
  const coreRows = core.map((p) => ({ id: p.id, name: p.name, position: p.position || null, ...outlookOf(p) }));
  const declining = coreRows.filter((r) => r.kind === 'decline' || r.veteran);
  // 主力の外で、これから伸びる若手（24歳以下で伸びしろの大きい人。伸びしろの大きい順に3人まで）
  const coreIds = new Set(core.map((p) => p.id));
  const rising = list
    .filter((p) => !coreIds.has(p.id) && p.age <= 24)
    .map((p) => ({ id: p.id, name: p.name, position: p.position || null, ...outlookOf(p) }))
    .filter((r) => r.upside >= RISING_UPSIDE)
    .sort((a, b) => b.upside - a.upside || a.age - b.age)
    .slice(0, 3);
  const teamAvg = round1(avg(list.map((p) => p.age)));
  const leagueAvg = round1(avg(leagueAges.filter(Number.isFinite)));
  const coreAvg = round1(avg(core.map((p) => p.age)));
  const lines = [];
  lines.push(
    `平均年齢は${teamAvg}歳${leagueAvg != null ? `（リーグ全体は${leagueAvg}歳）` : ''}、主力${core.length}人は${coreAvg}歳。`,
  );
  if (declining.length)
    lines.push(
      `${OUTLOOK_YEARS}年後に下り坂か引退が近い年齢になる主力が${declining.length}人: ${declining.map((r) => `${r.name}（${r.later}歳）`).join('、')}。`,
    );
  else lines.push(`${OUTLOOK_YEARS}年後も主力に下り坂の見込みの人はいません。`);
  if (rising.length)
    lines.push(`控えから伸びそうな若手: ${rising.map((r) => `${r.name}（${r.age}歳）`).join('、')}。`);
  else lines.push('控えに、伸びしろの大きい24歳以下の若手がいません。');
  // ひとことの助言（取るなら若手か即戦力か）
  const share = core.length ? declining.length / core.length : 0;
  const advice =
    share >= 0.4
      ? '主力の入れ替わりが近い時期です。トライアウトでは若手を多めに見ておくと、数年後に困りません。'
      : share <= 0.15 && rising.length === 0
        ? '主力はまだ若い一方、控えの伸びしろは小さめです。トライアウトで伸びしろのある若手を足す余地があります。'
        : share <= 0.15
          ? '主力は若く、控えにも伸びる若手がいます。いまは即戦力を足して勝ちに行ける時期です。'
          : '若手と中堅の釣り合いは取れています。抜けそうな位置だけ、トライアウトで手当てしておきましょう。';
  return {
    years: OUTLOOK_YEARS,
    bands,
    core: coreRows,
    rising,
    lines,
    advice,
  };
}
