#!/usr/bin/env node
// ============================================================
// 自然成長の検査（`naturalAgeCoef` の年齢曲線と `expectedNaturalGrowth` の表示）
//
// ⚠ いしだ 2026-11-20 の指定（この表を正本とする）:
//    「基本、成長係数は23歳まで徐々に上がり、出場試合数によってプラス変動、
//      疲労があるのに出場することでマイナス変動、26歳から徐々に減り始めます」
//    素質1.0の高卒選手（主要な能力1つあたり・1年の点）:
//      19歳 1.00 / 20 1.05 / 21 1.10 / 22 1.15 / 23〜25 1.20 /
//      26 1.15 / 27 1.05 / 28 0.90 / 29 0.70 / 30 0.45 / 31 0.15 /
//      32 -0.20 / 33 -0.60 / 34 -1.05 / 35 -1.55 / 36 -2.10 /
//      37 -2.70 / 38 -3.35 / 39 -4.05 / 40 -4.80
//    きっかけは「実際プレイしていると、なかなか衰えず、ずっとベテランが居座ります」。
//
// ⚠ **2つの基準で比べる**。伸びと衰えは別の要素で削られるので、同じ能力値では測れない。
//    伸びる側 … 能力38（天井の減衰にかからない若手の帯）
//    衰える側 … 能力50（`STAT_GROWTH[].ref` と同じ水準。`declineScale` が1倍になる）
//    どちらも 素質1.0・プロ意識50・レギュラー出場（450打数）・独立リーグのランクC。
//
// 見るのは7つ。
//   1. **表示＝実際**。`expectedNaturalGrowth` が本番の `grow` の平均と合う。
//   2. **指定の表に乗る**（上の2基準で）。
//   3. **山は23〜27歳**。19歳より23歳の方が伸びる（指定どおり上がってから下がる）。
//   4. **素質が高いほど長持ちし、若いうちもよく伸びる**。
//   5. **プロ意識と出場の変動で曲線が後ろにずれる**（大事に使うと長持ちする）。
//   6. **30代後半は年2点以上落ちる**（ベテランが席を明け渡す）。
//   7. 表示の計算が選手を書き換えない（`peek`）・投手でも出る・画面の見た目。
// 終了コード: 全PASSで0、FAILで1。
// ============================================================
import assert from 'node:assert/strict';
import {
  makeGrower,
  expectedNaturalGrowth,
  naturalAgeCoef,
  CATEGORY_GROWTH,
} from '../../src/season/growthSystem.js';
import { createCandidatePlayer } from '../../src/season/tryoutSystem.js';
import { naturalGrowthOf, naturalGrowthText, naturalGrowthColor } from '../../src/utils/naturalGrowth.js';

/** いしだ指定の表（素質1.0・1能力あたり・1年） */
const TARGET = {
  19: 1.00, 20: 1.05, 21: 1.10, 22: 1.15, 23: 1.20, 24: 1.20, 25: 1.20,
  26: 1.15, 27: 1.05, 28: 0.90, 29: 0.70, 30: 0.45, 31: 0.15,
  32: -0.20, 33: -0.60, 34: -1.05, 35: -1.55, 36: -2.10,
  37: -2.70, 38: -3.35, 39: -4.05, 40: -4.80,
};
/** 平均を取る能力（`expectedNaturalGrowth` の野手側と同じ6つ） */
const KEYS = [
  ['batting', 'meet', 'meet'],
  ['batting', 'power', 'power'],
  ['batting', 'eye', 'eye'],
  ['physical', 'speed', 'speed'],
  ['physical', 'arm', 'arm'],
  ['fielding', 'defense', 'defense'],
];
const RANK_MULT = 0.90;  // 独立リーグ＝ランクC相当（`teamRankMult`）
const GROW_BASE = 38;    // 伸びる側を測る能力値（天井の減衰にかからない）
const DECLINE_BASE = 50; // 衰える側を測る能力値（`ref` と同じ＝比例が1倍）

const seedFielder = createCandidatePlayer({ position: 'shortstop' });
const seedPitcher = createCandidatePlayer({ position: 'pitcher' });

function fielder(age, gp, discipline, base, atBats = 450, modifier = 0) {
  const p = structuredClone(seedFielder);
  p.age = age;
  p.growthPotential = gp;
  p.growthModifier = modifier;
  p.personality = { ...(p.personality || {}), discipline, mental: 50 };
  for (const [box, key] of KEYS) p[box][key] = base;
  p.physical.dexterity = 50;
  p.physical.muscle = 50;
  p.physical.build = 'medium';
  p.seasonStats = {
    ...(p.seasonStats || {}),
    batting: { ...(p.seasonStats?.batting || {}), atBats },
  };
  return p;
}

/** 本番の `grow` を n 回回したときの、主要な能力1つあたりの平均の動き */
function simulate(player, category, n = 2500) {
  const prof = CATEGORY_GROWTH[category];
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    const p = structuredClone(player);
    const { grow } = makeGrower(p, prof, RANK_MULT);
    let sum = 0;
    for (const [box, key, growKey] of KEYS) {
      const before = p[box][key];
      p[box][key] = grow(p[box][key], growKey);
      sum += p[box][key] - before;
    }
    total += sum / KEYS.length;
  }
  return total / n;
}
const shownOf = (player, category = 'independent') =>
  expectedNaturalGrowth(player, category, RANK_MULT);

// --- 1. 表示＝実際 ---
let compared = 0;
let worstGap = 0;
for (const category of ['independent', 'online']) {
  for (const gp of [0.6, 1.0, 1.4]) {
    for (const base of [GROW_BASE, DECLINE_BASE]) {
      for (const age of [19, 25, 31, 36, 40]) {
        const p = fielder(age, gp, 50, base);
        const gap = Math.abs(shownOf(p, category) - simulate(p, category));
        worstGap = Math.max(worstGap, gap);
        compared += 1;
        assert.ok(
          gap <= 0.10,
          `表示と実際がずれている（${category} 素質${gp} 能力${base} ${age}歳）: 差 ${gap.toFixed(2)}`,
        );
      }
    }
  }
}
assert.ok(compared >= 60, '見た組み合わせが少なすぎる（検査の作りが壊れている）');

// --- 2. 指定の表に乗る ---
const fit = [];
for (let age = 19; age <= 31; age += 1) {
  const got = shownOf(fielder(age, 1.0, 50, GROW_BASE));
  fit.push([age, got]);
  assert.ok(
    Math.abs(got - TARGET[age]) <= 0.35,
    `伸びる側が指定の表から外れている（${age}歳・能力${GROW_BASE}）: `
      + `${got.toFixed(2)} 対 指定 ${TARGET[age].toFixed(2)}`,
  );
}
for (let age = 32; age <= 40; age += 1) {
  const got = shownOf(fielder(age, 1.0, 50, DECLINE_BASE));
  fit.push([age, got]);
  assert.ok(
    Math.abs(got - TARGET[age]) <= 0.85,
    `衰える側が指定の表から外れている（${age}歳・能力${DECLINE_BASE}）: `
      + `${got.toFixed(2)} 対 指定 ${TARGET[age].toFixed(2)}`,
  );
}

// --- 3. 山は23〜27歳（19歳より23歳の方が伸びる） ---
{
  const at = (age) => shownOf(fielder(age, 1.0, 50, GROW_BASE));
  assert.ok(at(23) > at(19), `19歳(${at(19).toFixed(2)})より23歳(${at(23).toFixed(2)})の方が伸びること`);
  const peak = [19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]
    .map((age) => [age, at(age)])
    .sort((a, b) => b[1] - a[1])[0][0];
  assert.ok(peak >= 23 && peak <= 27, `山が${peak}歳にある（23〜27歳に来ること）`);
  // 曲線そのものも指定どおり（丸めの外側で確かめる）
  assert.equal(Math.round(naturalAgeCoef(19) * 100) / 100, 1.00, '曲線の19歳が1.00でない');
  assert.equal(Math.round(naturalAgeCoef(23) * 100) / 100, 1.20, '曲線の23歳が1.20でない');
  assert.equal(Math.round(naturalAgeCoef(25) * 100) / 100, 1.20, '曲線の25歳が1.20でない');
  for (const age of [26, 30, 32, 36, 40])
    assert.equal(
      Math.round(naturalAgeCoef(age) * 100) / 100,
      TARGET[age],
      `曲線の${age}歳が指定（${TARGET[age]}）でない`,
    );
}

// --- 4. 素質（0歳の順序と、衰え始めの年齢） ---
const crossOf = (gp, discipline = 50, modifier = 0) => {
  for (let age = 20; age <= 50; age += 1)
    if (shownOf(fielder(age, gp, discipline, DECLINE_BASE, 450, modifier)) < 0) return age;
  return 99;
};
{
  const young = [0.6, 1.0, 1.4].map((gp) => shownOf(fielder(19, gp, 50, GROW_BASE)));
  assert.ok(
    young[0] < young[1] && young[1] < young[2],
    `19歳の伸びが素質の順になっていない（${young.map((v) => v.toFixed(2)).join(' / ')}）`,
  );
  const cross = [0.6, 1.0, 1.4].map((gp) => crossOf(gp));
  assert.ok(
    cross[0] < cross[1] && cross[1] < cross[2],
    `衰え始めが素質の順になっていない（${cross.join(' / ')}歳）`,
  );
  assert.ok(
    cross[1] >= 29 && cross[1] <= 33,
    `素質1.0の衰え始めが${cross[1]}歳（指定の表は31〜32歳で0を割る）`,
  );
}

// --- 5. プロ意識と変動で長持ちする（いしだ「大事に使われたら毎年+0.1程度増える」） ---
{
  const base = crossOf(1.0, 50, 0);
  assert.ok(crossOf(1.0, 90, 0) > base, 'プロ意識が高くても衰え始めが遅くならない');
  assert.ok(crossOf(1.0, 20, 0) < base, 'プロ意識が低くても衰え始めが早くならない');
  // ⚠ `growthModifier`（出場で積み・疲労で削れる変動）が**年度替わりの成長に効くこと**。
  //    以前は `makeGrower` が `growthPotential` しか読まず、変動は効いていなかった
  const withUse = shownOf(fielder(30, 1.0, 50, DECLINE_BASE, 450, 0.3));
  const plain = shownOf(fielder(30, 1.0, 50, DECLINE_BASE, 450, 0));
  const abused = shownOf(fielder(30, 1.0, 50, DECLINE_BASE, 450, -0.3));
  assert.ok(withUse > plain, `変動プラスが効いていない（${withUse.toFixed(2)} 対 ${plain.toFixed(2)}）`);
  assert.ok(abused < plain, `変動マイナスが効いていない（${abused.toFixed(2)} 対 ${plain.toFixed(2)}）`);
  // 出場量（控えはレギュラーより伸びない）
  const bench = shownOf(fielder(22, 1.0, 50, GROW_BASE, 120));
  const regular = shownOf(fielder(22, 1.0, 50, GROW_BASE, 450));
  assert.ok(regular > bench, `出場量が伸びに効いていない（${regular.toFixed(2)} 対 ${bench.toFixed(2)}）`);
}

// --- 6. 30代後半は席を明け渡す（いしだ「なかなか衰えず、ずっとベテランが居座ります」） ---
for (const age of [37, 38, 39, 40]) {
  const v = shownOf(fielder(age, 1.0, 50, DECLINE_BASE));
  assert.ok(
    v <= -2.0,
    `${age}歳・素質1.0・能力${DECLINE_BASE}の衰えが${v.toFixed(2)}。`
      + '年2点以上落ちないとベテランが席を明け渡さない',
  );
}
{
  // 素質1.4のベテランは長持ちする（40歳でも年1点台まで）
  const star = shownOf(fielder(40, 1.4, 70, DECLINE_BASE));
  assert.ok(star > -2.6, `素質1.4・意識70の40歳が${star.toFixed(2)}。素質が高い選手は長持ちすること`);
}

// --- 7. 表示の計算は選手を書き換えない（`peek`）・投手・見た目 ---
for (const seed of [seedFielder, seedPitcher]) {
  const p = structuredClone(seed);
  p.age = 24;
  p.growthPotential = 1.2;
  const before = JSON.stringify(p);
  for (const category of ['independent', 'online']) shownOf(p, category);
  naturalGrowthOf(p);
  assert.equal(JSON.stringify(p), before, '自然成長の表示を出すと選手の中身が変わる（`peek` が効いていない）');
}
{
  const p = structuredClone(seedPitcher);
  p.age = 21;
  p.growthPotential = 1.2;
  p.growthModifier = 0;
  const young = shownOf(p);
  const old = shownOf({ ...structuredClone(p), age: 38 });
  assert.ok(Number.isFinite(young) && Number.isFinite(old), '投手の自然成長が数字にならない');
  assert.ok(young > 0 && old < 0, `投手の自然成長が年齢で裏返らない（21歳${young} 38歳${old}）`);
}
assert.equal(naturalGrowthText(0.42), '+0.42', '自然成長の表示に + が付かない');
assert.equal(naturalGrowthText(-0.06), '-0.06', '自然成長のマイナスの表示が違う');
assert.equal(naturalGrowthText(0.001), '±0.00', '横ばいが ±0.00 で出ない');
assert.equal(naturalGrowthColor(-0.3), 'text-blue-400', '衰えが青で出ない');
assert.notEqual(naturalGrowthColor(0.9), naturalGrowthColor(-0.3), '伸びと衰えが同じ色になっている');

console.log(
  `■ 自然成長: OK（表示と実際の差は最大${worstGap.toFixed(2)}・${compared}組 / `
    + `素質1.0の実測 ${fit.filter(([a]) => [19, 23, 27, 31, 35, 40].includes(a))
      .map(([a, v]) => `${a}歳${v >= 0 ? '+' : ''}${v.toFixed(2)}`).join('・')} / `
    + `衰え始め 素質0.6・1.0・1.4 で ${[0.6, 1.0, 1.4].map((gp) => crossOf(gp)).join('・')}歳）`,
);
