#!/usr/bin/env node
// ============================================================
// 自然成長の検査（`expectedNaturalGrowth` と年齢による衰えの形）
//
// ⚠ いしだ 2026-11-20:
//    「成長係数1.0が主要な能力が平均1程度自然に上がる、0.0で平均0成長、
//      マイナスで衰えを表現したいと思っていました」
//    「表示を自然成長の平均と合わせたい」「衰えをもう2年ほど早めたいが、効果は緩やかに」
//
//    これを数字で固定する。見るのは4つ。
//      1. **表示＝実際**。画面に出す `expectedNaturalGrowth` が、本番の `grow` を
//         何千回回した平均と合う（画面は `src/utils/naturalGrowth.js`・
//         オンラインは `server/projection.mjs` の `naturalGrowth`）。
//      2. **係数1.0で平均+1**。若くて能力がまだ低い選手は主要な能力が平均+1前後伸びる。
//      3. **衰え始めの年齢**。素質が高いほど遅い、という並びが崩れない。
//      4. **衰えは緩やか**。40歳でも1年で平均-1を超えて落ちない。
//    加えて、表示の計算が**選手を書き換えない**こと（`makeGrower` の `peek`）。
//
// ⚠ 能力が高いと天井（`growthThreshold`）で伸びが削られるので、素質を見る検査は
//    **能力40**（独立リーグの若手の実際の帯）で測る。能力55以上は別に並びだけ見る。
// 終了コード: 全PASSで0、FAILで1。
// ============================================================
import assert from 'node:assert/strict';
import {
  makeGrower,
  expectedNaturalGrowth,
  CATEGORY_GROWTH,
} from '../../src/season/growthSystem.js';
import { createCandidatePlayer } from '../../src/season/tryoutSystem.js';
import { naturalGrowthOf, naturalGrowthText, naturalGrowthColor } from '../../src/utils/naturalGrowth.js';

/** 平均を取る能力（`expectedNaturalGrowth` の野手側と同じ6つ） */
const FIELDER_KEYS = [
  ['batting', 'meet', 'meet'],
  ['batting', 'power', 'power'],
  ['batting', 'eye', 'eye'],
  ['physical', 'speed', 'speed'],
  ['physical', 'arm', 'arm'],
  ['fielding', 'defense', 'defense'],
];
const RANK_MULT = 0.90; // 独立リーグ＝ランクC相当（`applyCorporatePlayerGrowth`）

const seedFielder = createCandidatePlayer({ position: 'shortstop' });
const seedPitcher = createCandidatePlayer({ position: 'pitcher' });

function fielder(age, gp, discipline, base) {
  const p = structuredClone(seedFielder);
  p.age = age;
  p.growthPotential = gp;
  p.growthModifier = 0;
  p.personality = { ...(p.personality || {}), discipline, mental: 50 };
  for (const [box, key] of FIELDER_KEYS) p[box][key] = base;
  p.physical.dexterity = 50;
  p.stats = { ...(p.stats || {}), games: 100 };
  return p;
}

/** 本番の `grow` を n 回回したときの、主要な能力1つあたりの平均の動き */
function simulate(age, gp, discipline, base, category, n = 2500) {
  const prof = CATEGORY_GROWTH[category];
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    const p = fielder(age, gp, discipline, base);
    const { grow } = makeGrower(p, prof, RANK_MULT);
    let sum = 0;
    for (const [box, key, growKey] of FIELDER_KEYS) {
      const before = p[box][key];
      p[box][key] = grow(p[box][key], growKey);
      sum += p[box][key] - before;
    }
    total += sum / FIELDER_KEYS.length;
  }
  return total / n;
}

const PROFILES = [
  { gp: 0.6, discipline: 50 },
  { gp: 1.0, discipline: 50 },
  { gp: 1.0, discipline: 70 },
  { gp: 1.4, discipline: 70 },
  { gp: 1.8, discipline: 70 },
];
const CATEGORIES = ['independent', 'online'];

// --- 1. 表示＝実際 ---
let compared = 0;
let worst = 0;
for (const category of CATEGORIES) {
  for (const { gp, discipline } of PROFILES) {
    for (const base of [40, 55]) {
      for (const age of [19, 25, 31, 36, 40]) {
        const shown = expectedNaturalGrowth(fielder(age, gp, discipline, base), category, RANK_MULT);
        const real = simulate(age, gp, discipline, base, category);
        const gap = Math.abs(shown - real);
        worst = Math.max(worst, gap);
        compared += 1;
        assert.ok(
          gap <= 0.08,
          `表示と実際がずれている（${category} 素質${gp} 意識${discipline} 能力${base} ${age}歳）: `
            + `表示${shown.toFixed(2)} 対 実際${real.toFixed(2)}`,
        );
      }
    }
  }
}
assert.ok(compared >= 100, '見た組み合わせが少なすぎる（検査の作りが壊れている）');

// --- 2. 係数1.0で主要な能力が平均+1前後 ---
for (const category of CATEGORIES) {
  const young = simulate(19, 1.0, 50, 40, category);
  assert.ok(
    young >= 0.60 && young <= 1.30,
    `${category}: 素質1.0の19歳（能力40）の自然成長が ${young.toFixed(2)}。`
      + '「係数1.0で主要な能力が平均1程度上がる」から外れている',
  );
  // 0.0 付近＝横ばいの年齢が、選手生活の真ん中（27〜32歳）に来ること
  const flat = [27, 28, 29, 30, 31, 32]
    .map((age) => Math.abs(expectedNaturalGrowth(fielder(age, 1.0, 50, 40), category, RANK_MULT)))
    .reduce((a, b) => Math.min(a, b));
  assert.ok(flat <= 0.10, `${category}: 素質1.0が横ばい（±0.10）になる年齢が27〜32歳に無い`);
}

// --- 3. 衰え始めの年齢 ---
const onsetOf = (gp, discipline, base, category) => {
  for (let age = 19; age <= 46; age += 1)
    if (expectedNaturalGrowth(fielder(age, gp, discipline, base), category, RANK_MULT) < 0) return age;
  return 99;
};
const onsets = {};
for (const category of CATEGORIES) {
  const row = PROFILES.map(({ gp, discipline }) => onsetOf(gp, discipline, 40, category));
  onsets[category] = row;
  // 素質が高いほど遅い（意識70は同じ素質の意識50より遅い）
  for (let i = 1; i < row.length; i += 1)
    assert.ok(
      row[i] >= row[i - 1],
      `${category}: 衰え始めの並びが崩れている（${JSON.stringify(row)}）。素質が高いほど遅いこと`,
    );
  // ⚠ いしだ「衰えをもう2年ほど早めたい」。素質1.0・意識50は**30歳前後**で下を向く
  //    （前は33歳だった）。早すぎ・遅すぎの両側を止める
  const standard = onsetOf(1.0, 50, 40, category);
  assert.ok(
    standard >= 29 && standard <= 32,
    `${category}: 素質1.0・意識50の衰え始めが${standard}歳（29〜32歳に収めること）`,
  );
  // 素質1.8は30代を通して伸び続ける
  assert.ok(
    onsetOf(1.8, 70, 40, category) >= 38,
    `${category}: 素質1.8が38歳より前に衰え始めている`,
  );
}

// --- 4. 衰えは緩やか（いしだ「効果は緩やかに」） ---
for (const category of CATEGORIES) {
  for (const { gp, discipline } of PROFILES) {
    for (const age of [36, 40]) {
      const v = expectedNaturalGrowth(fielder(age, gp, discipline, 40), category, RANK_MULT);
      assert.ok(
        v >= -1.0,
        `${category}: 素質${gp}の${age}歳が1年で平均${v.toFixed(2)}。-1.0 より急な衰えにしない`,
      );
    }
    // 年を取るほど下がる（上がり直さない）
    let prev = Infinity;
    for (let age = 24; age <= 42; age += 1) {
      const v = expectedNaturalGrowth(fielder(age, gp, discipline, 40), category, RANK_MULT);
      assert.ok(
        v <= prev + 0.02,
        `${category}: 素質${gp}の${age}歳で自然成長が上がり直した（${prev.toFixed(2)} → ${v.toFixed(2)}）`,
      );
      prev = v;
    }
  }
}

// --- 5. 表示の計算は選手を書き換えない（`peek`） ---
for (const seed of [seedFielder, seedPitcher]) {
  const p = structuredClone(seed);
  p.age = 24;
  p.growthPotential = 1.2;
  const before = JSON.stringify(p);
  for (const category of CATEGORIES) expectedNaturalGrowth(p, category, RANK_MULT);
  naturalGrowthOf(p);
  assert.equal(JSON.stringify(p), before, '自然成長の表示を出すと選手の中身が変わる（`peek` が効いていない）');
}

// --- 6. 投手も数字が出る（能力の組が違う） ---
{
  const p = structuredClone(seedPitcher);
  p.age = 20;
  p.growthPotential = 1.3;
  p.growthModifier = 0;
  const young = expectedNaturalGrowth(p, 'independent', RANK_MULT);
  const old = expectedNaturalGrowth({ ...structuredClone(p), age: 38 }, 'independent', RANK_MULT);
  assert.ok(Number.isFinite(young) && Number.isFinite(old), '投手の自然成長が数字にならない');
  assert.ok(young > old, `投手の自然成長が年齢で下がらない（20歳${young} 38歳${old}）`);
}

// --- 7. 画面の見た目（符号付き・色） ---
assert.equal(naturalGrowthText(0.42), '+0.42', '自然成長の表示に + が付かない');
assert.equal(naturalGrowthText(-0.06), '-0.06', '自然成長のマイナスの表示が違う');
assert.equal(naturalGrowthText(0.001), '±0.00', '横ばいが ±0.00 で出ない');
assert.notEqual(naturalGrowthColor(0.9), naturalGrowthColor(-0.3), '伸びと衰えが同じ色になっている');
assert.equal(naturalGrowthColor(-0.3), 'text-blue-400', '衰えが青で出ない');

console.log(
  `■ 自然成長: OK（表示と実際の差は最大${worst.toFixed(3)}・${compared}組 / `
    + `衰え始め 独立${onsets.independent.join('・')}歳 オンライン${onsets.online.join('・')}歳 `
    + `＝素質0.6・1.0・1.0意識70・1.4・1.8）`,
);
