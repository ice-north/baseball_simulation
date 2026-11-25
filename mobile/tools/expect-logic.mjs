// アプリの共通部（Kotlin）に写した計算が Web 版と同じ答えを出すかの検査用に、期待値を書き出す。
//   node mobile/tools/expect-logic.mjs > mobile/shared/src/jvmTest/resources/logic-expected.json
import { emitExpected } from './expected.mjs';
import fs from 'node:fs';
import { resolveTraining, playerWish, describeMood, recommendedPolicy } from '../../src/season/trainingPolicy.js';
// 画面（CampPlanner.jsx）と同じ判定を読む（以前は JSX から読めないので写していた）
import { clampMenu, clampSub } from '../../src/online/campMenus.js';
import {
  plannedPicks, weightedRanked, DEFAULT_WEIGHTS, addToPlan, removeFromPlan, shiftInPlan, moveInPlan, planSummary,
  signTotal, wishedCount, minimumShort,
} from '../../src/online/tryoutPlan.js';
import { pitchingFromLineup, reliefGroups, moveRelief, reliefOrderOf } from '../../src/online/pitchingEdit.js';
import { planRest } from '../../src/online/restPlan.js';
import { tradeMerits, meritSummaryText } from '../../src/online/tradeMerit.js';
import { playingTimeShares, givingTradeValues } from '../../src/online/tradeSearch.js';

const view = JSON.parse(fs.readFileSync(new URL('../shared/src/jvmTest/resources/view-running.json', import.meta.url)));
const roster = view.roster;
const camp = {};
for (const direction of ['sharpen', 'balanced', 'patch'])
  for (const phase of ['physique', 'skill'])
    for (const p of roster) {
      const r = resolveTraining(p, direction, phase);
      camp[`${direction}:${phase}:${p.id}`] = [clampMenu(r.main, p), clampSub(r.sub, p), describeMood(p, direction, phase).tone];
    }
const wish = Object.fromEntries(roster.map((p) => [p.id, playerWish(p)]));
const recommended = Object.fromEntries(roster.map((p) => [p.id, recommendedPolicy(p)]));
// トライアウト: 名簿の後ろ12人を候補、残りを名簿として扱う
const candidates = roster.slice(12);
const have = roster.slice(0, 12);
const ranked = weightedRanked(candidates, DEFAULT_WEIGHTS, have);
const count = 6;
const picks = plannedPicks(ranked, candidates, count, have).map((p) => p.id);
// 希望リストは交渉する10人まで（Web 版の「交渉」の形）。出し入れと並べ替えは配列そのものを動かす
const added = addToPlan(ranked.slice(0, 5), ranked.at(-1));
const removed = removeFromPlan(ranked, ranked[0]);
const shifted = shiftInPlan(ranked, 2, -1);
const moved = moveInPlan(ranked, ranked.at(-1), 0);
// 獲得する人数（無ければ空き枠いっぱい・範囲に収める）と、交渉から取りにいく人数
const totals = [signTotal({}, 7), signTotal({ total: 3 }, 7), signTotal({ total: 20 }, 7), signTotal({ total: -1 }, 7), signTotal({}, 7, 5), signTotal({ total: 6 }, 7, 5), wishedCount(ranked, 4)];
// 最低限に足りない人数（画面の「獲得後の名簿」）: 投手だけ3人／捕手のいない野手だけ／そろった名簿
const pitchersOnly = roster.filter((p) => p.position === 'pitcher').slice(0, 3);
const noCatcher = roster.filter((p) => p.position !== 'pitcher' && p.position !== 'catcher').slice(0, 9);
const shorts = [minimumShort(pitchersOnly, []), minimumShort(noCatcher, []), minimumShort(roster, [])];
const summary = planSummary(ranked, candidates, count, have);
// 注意（warnings）は獲得したあとの名簿で数える。上の例は野手が足りず注意が出ないので、
// 名簿に投手がそろっている場合（注意なし）と、投手が3人しかいない場合（注意あり）も比べる
const fullStaff = planSummary(weightedRanked(candidates, DEFAULT_WEIGHTS, have), candidates, candidates.length, have);
const fewPitchers = (() => {
  const own = roster.slice(0, 3);
  const pool = roster.slice(11);
  return planSummary(weightedRanked(pool, DEFAULT_WEIGHTS, own), pool, pool.length, own);
})();
// 救援の同じ役割の中の順番（いしだ 2026-11-20。PC の投手起用の▲▼）。見本の球団は役割が1人ずつなので、
// 同じ役割に3人・2人を置き、保存した順（名簿に居ない id を混ぜる）から始める
const reliefIds = (state) => reliefGroups(state, roster).map((g) => [g.role, g.players.map((p) => p.id)]);
const relief = (() => {
  const roles = { ...view.lineup.pitcherRoles };
  const byRole = (role) => Object.keys(roles).filter((id) => roles[id] === role).map(Number);
  const [setupA] = byRole('setup');
  const [aceRelief] = byRole('ace_relief');
  const [long] = byRole('long');
  const [behind] = byRole('behind');
  const [mopup] = byRole('mopup');
  roles[aceRelief] = 'setup';
  roles[long] = 'setup';
  roles[mopup] = 'behind';
  const lineup = { ...view.lineup, pitcherRoles: roles, pitcherOrder: [long, 1, mopup] };
  const plain = pitchingFromLineup(view.lineup, roster);
  const start = pitchingFromLineup(lineup, roster);
  const moves = [
    [setupA, -1], [long, -1], [long, 1], [aceRelief, 1], [behind, -1], [mopup, 1], [setupA, 1],
  ];
  let state = start;
  const steps = moves.map(([id, delta]) => {
    state = moveRelief(state, id, delta, roster);
    return { id, delta, order: state.order, groups: reliefIds(state) };
  });
  return {
    roles,
    saved: lineup.pitcherOrder,
    plainOrder: plain.order,
    startOrder: start.order,
    startGroups: reliefIds(start),
    steps,
    // 保存の順の整え方（名簿に居ない id は落とし、載っていない選手は名簿の並びで後ろへ）
    tidy: [reliefOrderOf(undefined, roster.slice(0, 4)), reliefOrderOf([roster[3].id, 5, roster[1].id], roster.slice(0, 4))],
  };
})();
// 疲れた野手を休ませる守備の組み直し（`planRest`）。保存済みの打順の野手8人のうち、
// 1人ずつ疲労100・2人ずつ疲労100と130・全員疲労90 にした場面（ほかの先発は疲労0、控えはそのまま）
const field = view.lineup.battingOrder.filter((e) => e.position !== 'pitcher');
const inOrder = new Set(view.lineup.battingOrder.map((e) => e.playerId));
const restBench = roster.filter((p) => !inOrder.has(p.id));
const restCase = (levels, leaving = null) => {
  const starters = field.map((e, i) => ({
    player: { ...roster.find((p) => p.id === e.playerId), fatigue: levels[i] ?? 0 },
    position: e.position,
  }));
  const plan = planRest(starters, restBench, leaving);
  return plan && { resting: plan.resting, assign: Object.fromEntries([...plan.assign].map(([id, pos]) => [String(id), pos])) };
};
const restPlans = [];
for (let i = 0; i < field.length; i += 1) restPlans.push(restCase(field.map((_, j) => (j === i ? 100 : 0))));
for (let i = 0; i < field.length; i += 1)
  for (let j = i + 1; j < field.length; j += 1) restPlans.push(restCase(field.map((_, k) => (k === i ? 100 : k === j ? 130 : 0))));
restPlans.push(restCase(field.map(() => 90)));
// 二刀流の先発の日（i 番目の野手がその日の先発として抜け、j 番目が疲労100）
const restPlansTwoWay = [];
for (let i = 0; i < field.length; i += 1)
  for (let j = 0; j < field.length; j += 1)
    if (i !== j) restPlansTwoWay.push(restCase(field.map((_, k) => (k === j ? 100 : 0)), field[i].playerId));
// 相手に与えるメリット（`tradeMerit.js`）。名簿を偶数番と奇数番の2球団に分け、偶数番を相手、奇数番を自球団とする。
// 出す選手の組（野手1人・投手1人・野手2人・投手2人・捕手）と、相手が出す選手（無し・1人・2人）の組み合わせ
const meritTheirs = roster.filter((_, i) => i % 2 === 0);
const meritMine = roster.filter((_, i) => i % 2 === 1);
const mineFielders = meritMine.filter((p) => p.position !== 'pitcher');
const minePitchers = meritMine.filter((p) => p.position === 'pitcher');
const meritGives = [
  [], mineFielders.slice(0, 1), minePitchers.slice(0, 1), mineFielders.slice(1, 3), minePitchers.slice(1, 3),
  meritMine.filter((p) => p.position === 'catcher'), meritMine.slice(-3),
];
const meritGets = [[], [meritTheirs[0].id], meritTheirs.slice(1, 3).map((p) => p.id)];
const tradeMerit = [];
for (const give of meritGives)
  for (const get of meritGets)
    for (const others of [{}, { mine: meritMine }]) {
      const m = tradeMerits(meritTheirs, give, get, others);
      tradeMerit.push({
        give: give.map((p) => p.id),
        get,
        others: Object.keys(others).length > 0,
        players: m.players.map((p) => ({ id: p.id, role: p.role.kind, slot: p.role.slot, tags: p.tags })),
        tags: m.tags,
        summary: meritSummaryText(m),
      });
    }
// CPU球団が受け取る選手の値段（`givingTradeValues`。出番の上乗せを1人ずつ順に足した分だけ乗せる）。
// 名簿の分け方と組み合わせは上のメリットと同じ。値段は名簿の並び i から 40 + 3i（ビューの名簿に値段が無いため）。
// 野手をまとめて出す組（同じ持ち場に重なる）も足す
const priceOf = (p) => 40 + 3 * roster.indexOf(p);
const givingGives = [...meritGives, mineFielders, meritMine];
const giving = [];
for (const give of givingGives)
  for (const get of meritGets) {
    const after = meritTheirs.filter((p) => !get.includes(p.id));
    giving.push({
      give: give.map((p) => p.id),
      get,
      shares: playingTimeShares(after, give),
      values: givingTradeValues(after, give, priceOf),
    });
  }
const text = JSON.stringify({ restPlans, restPlansTwoWay, camp, wish, recommended, relief, tryout: { ranked, picks, added, removed, shifted, moved, totals, shorts, blocking: summary.blocking, warnings: summary.warnings, warningCases: [fullStaff.warnings, fewPitchers.warnings] }, tradeMerit, giving });
emitExpected(text, { script: 'expect-logic.mjs', file: 'logic-expected.json', also: 'アプリの共通部も揃えること' });
