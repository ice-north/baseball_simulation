import {
  TRADE_SLOTS,
  rosterSlotScores,
  fielderAssignment,
  pitchingStaff,
  BULLPEN_SIZE,
} from "./tradeSearch.js";
import { normalizedVelocity, normalizedStamina } from "./tryoutPlan.js";

// ============================================================
// 球団の穴（先方要望 #6「監督の戦略方針をチームに組み込む」第1段。2026-11-27）
//
// 【何をするものか】その球団に**何が足りないか**を、リーグのほかの球団と比べて
//   - 持ち場ごとの不足（`slots`。捕手が薄い・抑えが居ない）
//   - 能力の種類ごとの不足（`stats`。足が無い・長打が無い・制球が悪い）
//   の2つで、0（足りている）〜1（大きく足りない）で返す。
//   育成の的（`coaches.js` の `campAim`）がこれを読む。コンバート・トレード・ドラフトも
//   ここを読む形にする（第3段）。
//
// ⚠ **持ち場の力は `tradeSearch.js` の `rosterSlotScores` をそのまま使う**（補強ポイントと
//    同じ数え方）。ここに式の写しを持たない（物差しを二重に作らない）。
// ⚠ 能力の種類は、レギュラー（野手は8つの持ち場の一番手、投手はローテと中継ぎ）の平均を、
//    比べる球団の平均と比べる。控えの能力は数えない（穴は試合に出る人で空く）。
// ⚠ 監督の型はここでは見ない（どの監督が見ても同じ穴）。型の重みは読む側（`campAim`）で掛ける。
// ⚠ トレードの値段（`needFactors`）は今までどおり。ここを変えても CPU のトレードは変わらない。
// ============================================================

/** 能力の種類（野手と投手）。値は試合の物差し（球速・スタミナは 0〜100 に直した値） */
export const NEED_STATS = {
  hitter: ["meet", "power", "eye", "speed", "defense"],
  pitcher: ["control", "velocity", "stamina"],
};

const STAT_OF = {
  meet: (p) => p.batting?.meet,
  power: (p) => p.batting?.power,
  eye: (p) => p.batting?.eye,
  speed: (p) => p.physical?.speed,
  defense: (p) => p.fielding?.defense,
  control: (p) => p.pitching?.control,
  velocity: (p) => (p.pitching?.velocity ? normalizedVelocity(p.pitching.velocity) : null),
  stamina: (p) => (p.pitching?.stamina ? normalizedStamina(p.pitching.stamina) : null),
};

/** 能力の値（球速・スタミナは 0〜100 に直した値）。無ければ null */
export const needStatValue = (player, stat) => {
  const v = STAT_OF[stat]?.(player);
  return Number.isFinite(v) ? v : null;
};

/**
 * 「大きく足りない」とみなす差。レギュラーの平均がリーグの平均よりこれだけ低ければ満額（1）。
 * ⚠ 球団ごとのレギュラーの平均の散らばりは、能力1つでおおむね ±4〜6。
 */
export const NEED_STAT_SCALE = 6;
/** 持ち場の力で「大きく足りない」とみなす差（持ち場での力は実測でおおむね 40〜65） */
export const NEED_SLOT_SCALE = 8;

const mean = (list) => {
  const xs = list.filter((v) => Number.isFinite(v));
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
};
const isActive = (p) => p?.isActive !== false;

/** レギュラー（野手は持ち場の一番手、投手はローテと中継ぎ） */
export function regularsOf(roster) {
  const list = (roster || []).filter(isActive);
  const fielders = Object.values(fielderAssignment(list))
    .map((e) => e.holder)
    .filter(Boolean);
  const { rotation, pen } = pitchingStaff(list);
  return { hitters: fielders, pitchers: [...rotation, ...pen.slice(0, 1 + BULLPEN_SIZE)] };
}

/** その名簿のレギュラーの、能力の種類ごとの平均 */
export function regularStatMeans(roster) {
  const { hitters, pitchers } = regularsOf(roster);
  const out = {};
  for (const stat of NEED_STATS.hitter)
    out[stat] = mean(hitters.map((p) => needStatValue(p, stat)));
  for (const stat of NEED_STATS.pitcher)
    out[stat] = mean(pitchers.map((p) => needStatValue(p, stat)));
  return out;
}

const shortfall = (mine, ref, scale) =>
  mine == null || ref == null ? 0 : Math.max(0, Math.min(1, (ref - mine) / scale));

/**
 * 球団の穴。`others` は比べる球団の名簿の並び（同じリーグのほかの球団。自分を含めてもよい）。
 * 比べる球団が無ければ穴は全部0（比べようがない）。
 * @returns {{ slots: Record<string, number>, stats: Record<string, number> }}
 */
export function teamNeeds(roster, others = []) {
  const rosters = (others || []).filter((r) => r && r !== roster && r.length);
  const slots = {};
  const stats = {};
  const own = rosterSlotScores((roster || []).filter(isActive));
  const theirs = rosters.map((r) => rosterSlotScores(r.filter(isActive)));
  for (const slot of TRADE_SLOTS) {
    const ref = mean(theirs.map((t) => t[slot.key]?.score ?? 0));
    slots[slot.key] = shortfall(own[slot.key]?.score ?? 0, ref, NEED_SLOT_SCALE);
  }
  const mine = regularStatMeans(roster);
  const refs = rosters.map(regularStatMeans);
  for (const stat of [...NEED_STATS.hitter, ...NEED_STATS.pitcher])
    stats[stat] = shortfall(mine[stat], mean(refs.map((r) => r[stat])), NEED_STAT_SCALE);
  return { slots, stats };
}
