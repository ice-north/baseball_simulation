// ============================================================
// CPU球団が自分から動くトレード（CPU同士の交換・人の球団への提案）の組み立て。
//
// ⚠ 先方指摘「CPUチームからの提案と、CPUチーム同士のトレードも行ってほしい」。
//    以前はCPU球団は人の提案に答えるだけ（`cpuTradeDecision`）で、自分からは一度も動かなかった。
// ⚠ **受ける側の判断は人の提案と同じ関数**（`cpuDecisionFor` → `cpuTradeDecision`。値段の上乗せ・
//    戦力の開きの線 `STRENGTH_GAP_LIMIT`）を通す。ここで別の線を引くと、人が同じ交換を出したら
//    断られるのにCPU同士なら通る、ということが起きる（human-win-rate-2026-11 の直しを回り込む）。
//      - CPU同士 … 相手（受ける側のCPU）がその関数で「受ける」と答えた交換だけ成立させる
//      - 人の球団へ … 人がその内容で出したら**CPUが受ける**交換だけを提案する（人が受けたときも
//                      同じ関数でもう一度確かめる。`respondTrade`）
// ⚠ 動く側（言い出したCPU）の理由は**戦力の伸び**（`squadStrength`）。弱い持ち場（`reinforcePoints`）を
//    埋める選手をもらい、伸びが無い交換はしない。値段だけで動くと、上乗せを取れる相手から主力を
//    抜いては戻す、を繰り返す。
// ⚠ **人の球団への提案は、人の側から見ても釣り合うものだけ**（いしだ 2026-11-20「こちらの一番の主力を
//    駄選手と交換しようとする無茶な要求ばかり」）。以前は「人が出したらCPUが受けるか」しか見ず、
//    CPUの伸びがいちばん大きい案を選んでいたので、人の一番手を若い控え1人で取る案ばかりになった
//    （実測7件中7件。CPU +11〜24・人 −18〜24、人から見た値段は 0.6〜0.74倍）。いまは
//      - 戦力の開きの線を**両向き**に引く（CPUばかり伸びる案も出さない。`STRENGTH_GAP_LIMIT`）
//      - 人が手放す選手の値段（人の球団の事情こみ）に、CPUが出す選手の値段が見合う（`fair`）
//      - 出す候補に「相手の弱い持ち場を埋めるCPUの選手」を足し、両方の伸びの合計が大きい案を選ぶ
// ⚠ **乱数を引かない**（`Math.random` はその日の試合の種で回っている）。いつ・誰が動くかは
//    リーグの種と日付のハッシュで決める（`hashSeed`）。同じ日をやり直せば同じ結果になる。
// ============================================================
import { hashSeed } from '../src/game/rng.js';
import {
  fielderAssignment,
  pitchingStaff,
  reinforcePoints,
  slotStrength,
  squadStrength,
  STRENGTH_GAP_LIMIT,
} from '../src/online/tradeSearch.js';

/** CPU同士の交換を試す間隔（日。平均） */
export const CPU_TRADE_EVERY = 8;
/** 人の球団へ提案する間隔（日。球団ごとの平均） */
export const CPU_OFFER_EVERY = 10;
/** CPUからの提案の期限（日）。過ぎたら取り下げる（`pruneTrades`） */
export const CPU_OFFER_DAYS = 7;
/** この月までに限る（7月末。終盤に順位を動かす補強はさせない） */
export const CPU_TRADE_LAST_MONTH = 7;
/** 動く側の伸びの下限（`squadStrength` の点）。これ未満の交換はしない */
export const CPU_TRADE_MIN_GAIN = 0.5;
/** 人の球団へ出した提案の覚え（球団>欲しがった選手）の件数。同じ提案を繰り返さないため */
export const CPU_OFFER_LOG = 30;
/** 覚えの1件のキー */
export const offerLogKey = (fromTeam, playerId) => `${fromTeam}>${playerId}`;
/** 1回の判断で見る相手の球団の数（全部見ると重い） */
const PARTNERS = 3;
/** 1つの持ち場で見るもらう選手の数 */
const TARGETS = 4;
/** 出す選手の候補の数 */
const GIVES = 5;
/** 人の球団へ提案するとき、相手の弱い持ち場ごとに足す出す候補の数 */
const HELPS = 2;
/** 人の球団へ提案するときに見る幅の倍率（弱い持ち場・もらう選手・出す候補の数） */
const WIDE = 2;
/**
 * 人の球団への提案の値段の下限。CPUが出す選手の値段（事情を抜いた値段）が、人が手放す選手の
 * 値段（人の球団の事情こみ。`setValuesOf`）のこの倍以上であること。
 * ⚠ CPUの受ける線（`CPU_ACCEPT_MARGIN`）は逆向きに1.05倍を求めるので、上げすぎると提案が出なくなる。
 */
export const CPU_OFFER_VALUE_FLOOR = 0.85;

/** その日のその用件のサイコロ（0〜1）。乱数を引かない */
export function dayRoll(league, tag) {
  const d = league.season?.currentDate || {};
  return hashSeed(`${league.seed ?? 0}:${d.year}-${d.month}-${d.day}:${tag}`) / 4294967296;
}

/** 名簿だけから見た起用（打順の守備位置・先発ローテ・抑え）。`teamUsage` と同じ形 */
export function rosterUsage(players) {
  const fielders = {};
  for (const [pos, top] of Object.entries(fielderAssignment(players)))
    if (top?.holder) fielders[pos] = top.holder.id;
  const { rotation, pen } = pitchingStaff(players);
  const starters = rotation.map((p) => p.id);
  const closer = pen[0]?.id ?? null;
  const ids = new Set(
    [...Object.values(fielders), ...starters, closer].filter((id) => id != null).map(String),
  );
  return { fielders, starters, closer, ids };
}

/** 交換したあとの名簿（並びは `rostersAfterTrade` と同じ: 残った選手のあとに来た選手） */
const after = (mine, theirs, give, get) => [
  ...mine.filter((p) => !give.includes(p.id)),
  ...theirs.filter((p) => get.includes(p.id)),
];

/**
 * 言い出す球団 `from` の交換案を1つ選ぶ（無ければ null）。
 *
 * @param teams `{ 球団名: 選手[] }`（いまの名簿）
 * @param partners 相手にする球団名（並びの順に見る）
 * @param accept `(partner, give, get) => boolean` 相手がその交換を受けるか（CPU同士なら相手の判断、
 *        人の球団へ提案するなら「人がこれを出したら自分が受けるか」）
 * @param valueOf 出す候補を並べる値段（高い順に見る）
 * @param balanced 人の球団への提案なら true。戦力の開きを両向きに見て、相手の弱い持ち場を埋める
 *        選手も出す候補に入れ、両方の伸びの合計が大きい案を選ぶ
 * @param fair `(partner, give, get) => boolean` 相手から見て値段が見合うか（省略なら見ない）
 * @param avoid もらう候補から外す選手のid（前に同じ球団が欲しがった選手。同じ提案を繰り返さない）
 * @returns `{ partner, give, get, gain, partnerGain }`（`give` は `from` が出す選手のid）
 */
export function planCpuTrade({ from, teams, partners, accept, valueOf, balanced = false, fair = null, avoid = null }) {
  const mine = teams[from] || [];
  if (!mine.length) return null;
  const usage = rosterUsage(mine);
  const others = Object.fromEntries(Object.entries(teams).filter(([n]) => n !== from));
  // 弱い持ち場から2つ
  // ⚠ 人の球団へは見る幅を広げる（釣り合う案は少ないので、狭いと提案がほとんど出ない。相手は1球団だけ）
  const wide = balanced ? WIDE : 1;
  const needs = reinforcePoints(mine, usage, others).slice(0, 2 * wide);
  const base = squadStrength(mine);
  // 出す候補: 起用の外の選手（値段の高い順）と、弱い持ち場のいまの一番手
  const bench = mine
    .filter((p) => p.isActive !== false && !usage.ids.has(String(p.id)))
    .sort((a, b) => valueOf(b) - valueOf(a) || a.id - b.id)
    .slice(0, GIVES * wide);
  let best = null;
  for (const partner of partners) {
    const theirs = teams[partner] || [];
    if (!theirs.length) continue;
    const theirBase = squadStrength(theirs);
    // 相手の弱い持ち場を埋めるこちらの選手（起用の中の選手も。こちらが伸びない案は下で落ちる）
    const helps = [];
    if (balanced) {
      const theirUsage = rosterUsage(theirs);
      for (const need of reinforcePoints(theirs, theirUsage, { [from]: mine }).slice(0, 2 * wide)) {
        const floor = (need.holder ? slotStrength(need.holder, need.slot.key) : 0) ?? 0;
        mine
          .filter((p) => p.isActive !== false && (slotStrength(p, need.slot.key) ?? -1) > floor)
          .sort((a, b) => slotStrength(b, need.slot.key) - slotStrength(a, need.slot.key) || a.id - b.id)
          .slice(0, HELPS)
          .forEach((p) => helps.push(p));
      }
    }
    for (const need of needs) {
      const holder = need.holder;
      const floor = (holder ? slotStrength(holder, need.slot.key) : 0) ?? 0;
      const targets = theirs
        .filter((p) => p.isActive !== false && !avoid?.has(p.id) && (slotStrength(p, need.slot.key) ?? -1) > floor)
        .sort((a, b) => slotStrength(b, need.slot.key) - slotStrength(a, need.slot.key) || a.id - b.id)
        .slice(0, TARGETS * wide);
      const gives = [
        ...bench.map((p) => [p.id]),
        ...(holder && !bench.includes(holder) ? [[holder.id]] : []),
        ...helps.filter((p) => !bench.includes(p) && p !== holder).map((p) => [p.id]),
        // 控え2人で1人
        ...bench.slice(0, 3).flatMap((p, i) => bench.slice(i + 1, 3).map((q) => [p.id, q.id])),
      ];
      for (const target of targets)
        for (const give of gives) {
          const get = [target.id];
          const gain = squadStrength(after(mine, theirs, give, get)) - base;
          if (gain < CPU_TRADE_MIN_GAIN) continue;
          const partnerGain = squadStrength(after(theirs, mine, get, give)) - theirBase;
          // ⚠ 相手ばかり伸びる交換もしない（受ける側の判断は「言い出した側ばかり伸びる」しか見ない）
          if (partnerGain - gain > STRENGTH_GAP_LIMIT) continue;
          // ⚠ 人の球団へは、こちらばかり伸びる案も出さない（主力を控え1人で取る案になる）
          if (balanced && gain - partnerGain > STRENGTH_GAP_LIMIT) continue;
          const score = balanced ? gain + partnerGain : gain;
          if (best && score <= best.score) continue;
          if (fair && !fair(partner, give, get)) continue;
          if (!accept(partner, give, get)) continue;
          best = { partner, give, get, gain, partnerGain, score };
        }
    }
  }
  return best;
}

/** 相手の候補をその日のサイコロで並べる（同じ日は同じ並び） */
export function partnerOrder(league, from, names, tag) {
  return names
    .filter((n) => n !== from)
    .map((n) => ({ n, r: dayRoll(league, `${tag}:${from}:${n}`) }))
    .sort((a, b) => a.r - b.r || a.n.localeCompare(b.n))
    .slice(0, PARTNERS)
    .map((x) => x.n);
}

/** 期限の日付キー（年×10000＋月×100＋日）。日数は暦どおりではなく、日付の通し番号で足す */
export function offerExpiry(date, days = CPU_OFFER_DAYS) {
  const d = new Date(Date.UTC(2000 + (date?.year || 0), (date?.month || 1) - 1, date?.day || 1));
  d.setUTCDate(d.getUTCDate() + days);
  return (d.getUTCFullYear() - 2000) * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}
export const dateKey = (date) => (date?.year || 0) * 10000 + (date?.month || 0) * 100 + (date?.day || 0);
