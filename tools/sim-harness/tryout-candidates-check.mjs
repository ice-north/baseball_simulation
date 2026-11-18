#!/usr/bin/env node
// ============================================================
// トライアウトの受験者の顔ぶれの検査（釣り合いの検査）。
//
// 【なぜ】いしだ 2026-11-18「トライアウトを受けに来る高卒選手が、軒並み大学生より
//   弱い。9割くらい大学生が強くていいが、一部強い高校生や、強くはないが荒削りな、
//   足・肩・体幹など素材型の選手がいてもいい」。
//
//   直す前の実測（12球団・3回ぶん 358人）:
//     高卒が大学生の評価の中央値を超える割合 … 力で4.7% / 評価で12.1%
//     大学生の最大を超えた高卒 … **0人**
//     走か肩が80以上の高卒 … 1%（大学生は6%、クラブは21%）
//   原因は**抽出帯**だった。高校生は評価順の上位30〜68%からしか引いておらず、
//   プール5000人のうち「走か肩80以上」の48人は**36人が帯より上**に居て来られない。
//
// 【いまの作り】高校生だけ、帯の外から来る2枠を混ぜる（`tryoutSystem.js`）。
//   - 逸材枠 … プールの最上位から（いまの力で並べ、上へ寄せて抽選）
//   - 素材枠 … 走・肩・球速・体幹のどれかが図抜けた、総合では目立たない選手
//
// ⚠ ここは**釣り合いの検査**（`season-check` と同じ性格）。1人ずつの正解ではなく、
//    何回も引いたときの割合を見る。乱数は固定していないので、線は緩めに引く。
// 使い方: node tools/sim-harness/tryout-candidates-check.mjs [回数]
// ============================================================
import './lib/bootstrap.mjs';
import assert from 'node:assert/strict';
import { bootstrapWorld } from './lib/world.mjs';
import { highSchoolPool } from '../../src/season/universityPool.js';
import { generateTryoutCandidates } from '../../src/season/tryoutSystem.js';
import { weightedScore, DEFAULT_WEIGHTS } from '../../src/online/tryoutPlan.js';

const RUNS = Number(process.argv[2]) || 21;
const TEAMS = 12;
/**
 * 世界の数。⚠ **1つの世界で回数だけ増やさないこと**。プール（＝その年の高校生）は
 * 世界ごとに違うので、1つの世界だけだと「最上位が高卒になる年の割合」が
 * 45%〜85% と大きく振れる（実測）。世界をまたいで平均する。
 */
const WORLDS = 3;

const log = console.log;
const warn = console.warn;
const quiet = (fn) => {
  console.log = () => {};
  console.warn = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
    console.warn = warn;
  }
};


const isPitcher = (p) => p.position === 'pitcher';
/** 荒削りな素材の線。実測で素材枠が出してくる値（走73〜79・肩76〜82・球速136〜141・体68〜79）より少し下 */
const RAW_TOOL = [
  { label: '走', of: (p) => p.physical?.speed, min: 68, pitcher: false },
  { label: '肩', of: (p) => p.physical?.arm, min: 72, pitcher: false },
  { label: '球速', of: (p) => p.pitching?.velocity, min: 134, pitcher: true },
  { label: '体幹', of: (p) => p.physical?.bodyStamina, min: 66, pitcher: null },
];
const rawTools = (p) =>
  RAW_TOOL.filter(
    (t) =>
      (t.pitcher === null || t.pitcher === isPitcher(p)) &&
      (t.of(p) ?? -1) >= t.min,
  );

const runs = [];
for (let w = 0; w < WORLDS; w += 1) {
  quiet(() => bootstrapWorld());
  assert.ok(
    (highSchoolPool.players || []).length > 1000,
    `前提: 高校生プールが作られている（${(highSchoolPool.players || []).length}人）`,
  );
  for (let i = 0; i < Math.ceil(RUNS / WORLDS); i += 1) runs.push(drawOnce());
}

function drawOnce() {
  const candidates = quiet(() => generateTryoutCandidates(2, TEAMS, false, 'B', 0));
  const score = new Map(candidates.map((c) => [c, weightedScore(c, DEFAULT_WEIGHTS)]));
  const hs = candidates.filter((c) => c._tryoutSource === 'highschool');
  const uni = candidates.filter((c) => c._tryoutSource === 'university');
  const uniScores = uni.map((c) => score.get(c)).sort((a, b) => a - b);
  const median = uniScores[Math.floor(uniScores.length / 2)] ?? 0;
  const top = [...candidates].sort((a, b) => score.get(b) - score.get(a));
  return {
    candidates,
    score,
    hs,
    uni,
    median,
    uniMax: Math.max(...uniScores),
    hsMax: Math.max(...hs.map((c) => score.get(c))),
    hsMean: hs.reduce((a, c) => a + score.get(c), 0) / hs.length,
    uniMean: uni.reduce((a, c) => a + score.get(c), 0) / uni.length,
    beatMedian: hs.filter((c) => score.get(c) > median).length / hs.length,
    top10hs: top.slice(0, 10).filter((c) => c._tryoutSource === 'highschool').length,
    elite: hs.filter((c) => c._tryoutKind === 'elite'),
    tool: hs.filter((c) => c._tryoutKind === 'tool'),
    raw: hs.filter((c) => rawTools(c).length),
  };
}
const mean = (f) => runs.reduce((a, r) => a + f(r), 0) / runs.length;

// --- 前提 ---------------------------------------------------------------
for (const r of runs) {
  assert.ok(r.candidates.length >= TEAMS * 8, `受験者が少ない: ${r.candidates.length}人`);
  assert.ok(r.hs.length >= 20, `高卒の受験者が少ない: ${r.hs.length}人`);
  assert.ok(r.uni.length >= 20, `大学生の受験者が少ない: ${r.uni.length}人`);
}

// --- ① 大勢は大学生のほうが強い（いしだ「9割くらい大学生が強くていい」）------
// ⚠ **上げすぎの検出がここの仕事**。枠を増やしすぎると高卒全体が強くなる
assert.ok(
  mean((r) => r.hsMean) < mean((r) => r.uniMean) - 3,
  `高卒の平均評価が大学生に近すぎる（高卒${mean((r) => r.hsMean).toFixed(1)} / 大学生${mean((r) => r.uniMean).toFixed(1)}）`,
);
assert.ok(
  mean((r) => r.beatMedian) <= 0.25,
  `高卒が大学生の中央値を超える割合が多すぎる: ${(mean((r) => r.beatMedian) * 100).toFixed(1)}%`,
);
assert.ok(
  mean((r) => r.top10hs) <= 5,
  `受験者の上位10人が高卒に寄りすぎ: 平均${mean((r) => r.top10hs).toFixed(1)}人`,
);

// --- ② 一部は強い高校生（逸材枠）-----------------------------------------
// ⚠ 直す前は**0人**だった（帯の上限で切っていたので、強い高校生は来られない）
const eliteCount = mean((r) => r.elite.length);
assert.ok(eliteCount >= 1, `逸材枠の高校生が来ていない: 平均${eliteCount.toFixed(1)}人`);
assert.ok(
  eliteCount <= mean((r) => r.hs.length) * 0.15,
  `逸材枠が多すぎる: 平均${eliteCount.toFixed(1)}人 / 高卒${mean((r) => r.hs.length).toFixed(0)}人`,
);
const eliteMean = mean(
  (r) => r.elite.reduce((a, c) => a + r.score.get(c), 0) / Math.max(1, r.elite.length),
);
assert.ok(
  eliteMean > mean((r) => r.median),
  `逸材枠が大学生の中央値を超えていない（逸材${eliteMean.toFixed(1)} / 中央値${mean((r) => r.median).toFixed(1)}）`,
);
// 受験者のいちばん上が高卒になる年がときどきある（毎年ではない）
const topYears = runs.filter((r) => r.hsMax > r.uniMax).length / runs.length;
assert.ok(
  topYears >= 0.1 && topYears <= 0.9,
  `受験者で高卒が最上位になる年の割合がおかしい: ${(topYears * 100).toFixed(0)}%`,
);

// --- ③ 荒削りな素材型（走・肩・球速・体幹）-------------------------------
// ⚠ 直す前は、走か肩が80以上の高卒は1%（プールには48人居るのに帯の外だった）
const rawCount = mean((r) => r.raw.length);
assert.ok(
  rawCount >= 2,
  `一芸の図抜けた高卒が少ない: 平均${rawCount.toFixed(1)}人（走68/肩72/球速134/体幹66 以上）`,
);
// ⚠ **素材型は「強くはない」こと**。強い選手ばかりになると逸材枠と見分けが付かない
const toolMean = mean(
  (r) => r.tool.reduce((a, c) => a + r.score.get(c), 0) / Math.max(1, r.tool.length),
);
assert.ok(
  toolMean < mean((r) => r.median),
  `素材枠が強すぎる（素材${toolMean.toFixed(1)} / 大学生の中央値${mean((r) => r.median).toFixed(1)}）`,
);
// 一芸は**どれかに偏らない**（実測で、まとめて無作為に引くと体力型の投手ばかりになった）
const labels = new Set();
for (const r of runs) for (const c of r.tool) for (const t of rawTools(c)) labels.add(t.label);
assert.ok(
  labels.size >= 3,
  `素材型の一芸が偏っている: ${[...labels].join('・') || 'なし'}`,
);

log(
  `■ トライアウトの受験者: OK（${runs.length}回・${WORLDS}世界・12球団 / 高卒の平均評価${mean((r) => r.hsMean).toFixed(1)} 対 大学生${mean((r) => r.uniMean).toFixed(1)}` +
    ` / 高卒が中央値超え${(mean((r) => r.beatMedian) * 100).toFixed(0)}% / 上位10人の高卒${mean((r) => r.top10hs).toFixed(1)}人` +
    ` / 逸材枠${eliteCount.toFixed(1)}人（評価${eliteMean.toFixed(1)}）・最上位が高卒の年${(topYears * 100).toFixed(0)}%` +
    ` / 素材型${rawCount.toFixed(1)}人（${[...labels].join('・')}）)`,
);
