// ============================================================
// チーム能力値（チーム分析のレーダーチャート。先方要望 2026-11-20「先発投手力・リリーフ投手力・攻撃力・
// 守備力・機動性・控え戦力といったチーム能力値をレーダーチャートで分析」）。
//
// ⚠ **見せるだけ**。試合・CPU の判断・トレードの値段には使わない（強さを変えない）。乱数も引かない。
// ⚠ 中身は**いまの起用**（スタメン・先発ローテ・リリーフの役割）に就いている選手の能力の平均。
//    同じ名簿でも、起用を変えれば値が変わる（打てる人を控えに置けば攻撃力が下がり、控え戦力が上がる）。
// ⚠ 値は 0〜100（選手の能力と同じ目盛り。球速・スタミナは `normalizeAbility` で揃える）。
//    サーバーが全球団ぶん作り（`projectLeague` の `teamRatings`）、画面は部の平均と並べる。
//    入力は画面に出す形（`projectLineup` の起用と、`playerView` の選手）なので、画面の側でも同じ式で作れる。
// ============================================================
import { normalizeAbility } from '../utils/constants.js';
import { positionFitness } from './lineupEdit.js';
import { defenseRange } from '../utils/defenseRange.js';

/** レーダーの軸（並び順＝時計回り）。`label` は画面の言葉 */
export const RATING_AXES = [
  { key: 'starters', label: '先発投手力' },
  { key: 'relief', label: 'リリーフ投手力' },
  { key: 'offense', label: '攻撃力' },
  { key: 'defense', label: '守備力' },
  { key: 'speed', label: '機動性' },
  { key: 'bench', label: '控え戦力' },
];
/** リリーフ・控えで数える人数（多すぎると出番の無い人で薄まる） */
const RELIEF_COUNT = 7;
const BENCH_COUNT = 5;

const n = (v, fallback = 50) => (Number.isFinite(v) ? v : fallback);
const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
const clamp = (v) => Math.max(0, Math.min(100, v));

/** 変化球の力（いちばん良い球6割＋2番目4割。直球は数えない） */
function breakingOf(p) {
  const levels = (p.pitching?.arsenal || [])
    .filter((x) => x?.type && x.type !== 'straight' && !x.sealed)
    .map((x) => n(x.level, 0))
    .sort((a, b) => b - a);
  return n(levels[0], 0) * 0.6 + n(levels[1], 0) * 0.4;
}
/** 投手の力（先発はスタミナも入れる） */
export function pitcherScore(p, starter = false) {
  const pt = p.pitching || {};
  const parts = [normalizeAbility(n(pt.velocity, 140), true), n(pt.control), breakingOf(p)];
  if (starter) parts.push(normalizeAbility(n(pt.stamina, 100), false, true));
  return clamp(mean(parts));
}
/** 打つ力（ミート4割・パワー3.5割・選球眼2.5割） */
export function hitterScore(p) {
  const b = p.batting || {};
  return clamp(n(b.meet) * 0.4 + n(b.power) * 0.35 + n(b.eye) * 0.25);
}
/**
 * 守る力。スタメン設定の守備図と同じ守備範囲（守備・走力・肩を位置ごとの重みで足し、適性で割り引く。
 * `defenseRange.js`）を 0〜100 にしたもの。⚠ 別の式にすると、守備図の「チーム守備」とずれる
 */
export function fielderScore(p, position) {
  return clamp(defenseRange(p, position, positionFitness(p, position)) * 100);
}

/**
 * @param players 名簿（`playerView` の形）
 * @param lineup 起用（`projectLineup` の形: battingOrder・starters・pitcherRoles）
 * @returns {{ starters, relief, offense, defense, speed, bench } | null} 0〜100 の整数。起用が無ければ null
 */
export function teamRatings(players = [], lineup = null) {
  if (!lineup || !players.length) return null;
  const byId = new Map(players.filter((p) => p.isActive !== false).map((p) => [p.id, p]));
  const order = (lineup.battingOrder || []).filter((e) => e.position !== 'pitcher' && byId.has(e.playerId));
  const fielders = order.map((e) => ({ p: byId.get(e.playerId), position: e.position }));
  const starterIds = (lineup.starters || []).filter((id) => byId.has(id));
  const roles = lineup.pitcherRoles || {};
  const relievers = Object.keys(roles)
    .map(Number)
    .filter((id) => byId.has(id) && !starterIds.includes(id))
    .map((id) => pitcherScore(byId.get(id)))
    .sort((a, b) => b - a)
    .slice(0, RELIEF_COUNT);
  const used = new Set([...order.map((e) => e.playerId), ...starterIds, ...Object.keys(roles).map(Number)]);
  // 控え: スタメンにも投手起用にも入っていない野手（打つ力6割・守る力4割の上位）
  const bench = [...byId.values()]
    .filter((p) => p.position !== 'pitcher' && !used.has(p.id))
    .map((p) => hitterScore(p) * 0.6 + fielderScore(p, p.position) * 0.4)
    .sort((a, b) => b - a)
    .slice(0, BENCH_COUNT);
  const out = {
    starters: mean(starterIds.map((id) => pitcherScore(byId.get(id), true))),
    relief: mean(relievers),
    offense: mean(fielders.map(({ p }) => hitterScore(p))),
    defense: mean(fielders.map(({ p, position }) => fielderScore(p, position))),
    speed: mean(fielders.map(({ p }) => n(p.physical?.speed))),
    bench: bench.length ? mean(bench) : 0,
  };
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v == null ? null : Math.round(v)]));
}
