// ============================================================
// 器用さ(dexterity)が「新しい形を身につける」判定にどれだけ効くかを測る
//
// 対象は4つ: フォーム改造 / 球種習得 / 打席変更 / サブポジ習得。
// ⚠ **2つを同時に見ること**——
//   ① 選手間で差が付いているか（付いていなければ入れた意味がない）
//   ② リーグ全体の習得率が動いていないか（動くと球種数・左右比率が釣られる）
// 中心は50なので、母集団平均（実測48.9）では ② はほぼ不変になるはず。
//
// 使い方: node tools/sim-harness/dexterity-probe.mjs [試行数]
// ============================================================
import { SRC } from './lib/bootstrap.mjs';

const N = Number(process.argv[2]) || 20000;
const { executeSubTraining, executeCampTraining } = await import(SRC + '/season/campTraining.js');

const basePitcher = (dex) => ({
  id: 1, name: '投手', age: 22, position: 'pitcher',
  physical: { dexterity: dex, muscle: 50, speed: 50, arm: 55, bodyStamina: 60, recovery: 50, throws: 'right' },
  pitching: { velocity: 140, control: 55, stamina: 90, spinRate: 50, form: 'threeQuarter',
              arsenal: [{ id: 1, type: 'straight', level: 60 }, { id: 2, type: 'slider', level: 40 }] },
  batting: { meet: 20, power: 15, eye: 20, steal: 20, bunt: 30, bats: 'right' },
  fielding: { defense: 45 }, catching: { lead: 30 },
  positionFitness: { pitcher: 100, catcher: 30, first: 30, second: 30, third: 30, short: 30, left: 30, center: 30, right: 30 },
  personality: { discipline: 50, mental: 50 }, growthPotential: 1.0,
});
const baseFielder = (dex) => ({
  id: 2, name: '野手', age: 22, position: 'second',
  physical: { dexterity: dex, muscle: 50, speed: 55, arm: 50, bodyStamina: 60, recovery: 50, throws: 'right' },
  batting: { meet: 55, power: 45, eye: 50, steal: 50, bunt: 50, bats: 'right' },
  fielding: { defense: 55 }, catching: { lead: 30 },
  positionFitness: { catcher: 20, first: 40, second: 100, third: 45, short: 55, left: 35, center: 30, right: 30 },
  personality: { discipline: 50, mental: 50 }, growthPotential: 1.0,
});
const clone = (o) => structuredClone(o);

// 実測の代表点（チーム所属15845人: 平均48.9 / σ13.8 / p5 27 / p95 72）
const POINTS = [5, 27, 40, 50, 60, 72, 87];

const pct = (n, d) => `${(n / d * 100).toFixed(1)}%`;

console.log(`\n■ 器用さの効き（各${N.toLocaleString()}回）`);
console.log('─'.repeat(70));
console.log('  器用さ        5    27    40    50    60    72    87   ← p5 …… p95');
console.log('─'.repeat(70));

// --- ① フォーム改造の成功率 ---
{
  const row = POINTS.map(dex => {
    let ok = 0;
    for (let i = 0; i < N; i++) {
      const p = basePitcher(dex);
      const before = p.pitching.control;
      executeSubTraining(p, 'form_change', {});
      if (p.pitching.control > before) ok++;   // 成功時だけ制球が上がる
    }
    return pct(ok, N);
  });
  console.log('  フォーム改造 ' + row.map(v => v.padStart(6)).join(''));
}

// --- ② 新球種習得（サブ練習）の成功率 ---
{
  const row = POINTS.map(dex => {
    let ok = 0;
    for (let i = 0; i < N; i++) {
      const p = basePitcher(dex);
      executeSubTraining(p, 'newpitch', {});
      if ((p.pitching.arsenal || []).length > 2) ok++;
    }
    return pct(ok, N);
  });
  console.log('  球種習得(サブ)' + row.map(v => v.padStart(6)).join('').slice(1));
}

// --- ③ 打席変更（右→両打）の成功率 ---
{
  const row = POINTS.map(dex => {
    let ok = 0;
    for (let i = 0; i < N; i++) {
      const p = baseFielder(dex);
      executeSubTraining(p, 'switch_hit', { targetBats: 'switch' });
      if (p.batting.bats === 'switch') ok++;
    }
    return pct(ok, N);
  });
  console.log('  打席変更     ' + row.map(v => v.padStart(6)).join(''));
}

// --- ④ サブポジ習得の伸び幅 ---
{
  const row = POINTS.map(dex => {
    let sum = 0;
    for (let i = 0; i < N / 10; i++) {
      const p = baseFielder(dex);
      const before = p.positionFitness.short;
      executeSubTraining(p, 'subposition', { targetPosition: 'short' });
      sum += p.positionFitness.short - before;
    }
    return (sum / (N / 10)).toFixed(1);
  });
  console.log('  サブポジ+   ' + row.map(v => v.padStart(6)).join(''));
}

// --- ⑤ メイン練習の新球種（5段階の抽選）---
console.log('\n■ 新球種習得（メイン練習）の結果の内訳');
console.log('─'.repeat(70));
console.log('  器用さ    覚醒   大成功   成功   習得(Lv1-20)   失敗   平均Lv');
for (const dex of POINTS) {
  const c = { awakening: 0, great: 0, success: 0, learned: 0, fail: 0 };
  let lvSum = 0;
  for (let i = 0; i < N / 4; i++) {
    const p = basePitcher(dex);
    const { player: after } = executeCampTraining(p, 'newpitch', 'curve');
    const got = (after.pitching.arsenal || []).find(a => a.type === 'curve');
    if (!got) { c.fail++; continue; }
    lvSum += got.level;
    if (got.level >= 61) c.awakening++;
    else if (got.level >= 41) c.great++;
    else if (got.level >= 21) c.success++;
    else c.learned++;
  }
  const n = N / 4;
  console.log(`  ${String(dex).padStart(5)}` +
    `${pct(c.awakening, n).padStart(8)}${pct(c.great, n).padStart(8)}${pct(c.success, n).padStart(8)}` +
    `${pct(c.learned, n).padStart(12)}${pct(c.fail, n).padStart(10)}` +
    `${(lvSum / Math.max(1, n - c.fail)).toFixed(1).padStart(9)}`);
}

// --- ⑥ リーグ全体は動いていないか（実測の分布から引いた母集団で平均を取る）---
console.log('\n■ 母集団全体の平均（実測の分布 平均48.9/σ13.8 を再現して1万人）');
console.log('─'.repeat(70));
const gauss = () => { let u = 0; while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); };
const sample = () => Math.max(5, Math.min(95, Math.round(48.9 + gauss() * 13.8)));
let formOk = 0, pitchOk = 0, switchOk = 0, subSum = 0;
const M = 10000;
for (let i = 0; i < M; i++) {
  const d = sample();
  const p1 = basePitcher(d); const c0 = p1.pitching.control;
  executeSubTraining(p1, 'form_change', {});
  if (p1.pitching.control > c0) formOk++;

  const p2 = basePitcher(d);
  executeSubTraining(p2, 'newpitch', {});
  if ((p2.pitching.arsenal || []).length > 2) pitchOk++;

  const f1 = baseFielder(d);
  executeSubTraining(f1, 'switch_hit', { targetBats: 'switch' });
  if (f1.batting.bats === 'switch') switchOk++;

  const f2 = baseFielder(d); const s0 = f2.positionFitness.short;
  executeSubTraining(f2, 'subposition', { targetPosition: 'short' });
  subSum += f2.positionFitness.short - s0;
}
// ⚠ 基準は**器用さ50の実測値**を使うこと。器用さ50は倍率1.0＝従来の挙動そのもの。
//    定数を手で書くと、フォーム適性など他の項が乗っている経路で比較にならない
//    （球種習得は 12% ではなく適性込みで18%前後が素の値）。
let b = { form: 0, pitch: 0, sw: 0, sub: 0 };
for (let i = 0; i < M; i++) {
  const p1 = basePitcher(50); const c0 = p1.pitching.control;
  executeSubTraining(p1, 'form_change', {});
  if (p1.pitching.control > c0) b.form++;
  const p2 = basePitcher(50);
  executeSubTraining(p2, 'newpitch', {});
  if ((p2.pitching.arsenal || []).length > 2) b.pitch++;
  const f1 = baseFielder(50);
  executeSubTraining(f1, 'switch_hit', { targetBats: 'switch' });
  if (f1.batting.bats === 'switch') b.sw++;
  const f2 = baseFielder(50); const s0 = f2.positionFitness.short;
  executeSubTraining(f2, 'subposition', { targetPosition: 'short' });
  b.sub += f2.positionFitness.short - s0;
}
const d2 = (a, c) => `${a >= c ? '+' : ''}${(a - c).toFixed(1)}pt`;
console.log(`                母集団   器用さ50(=従来)    差`);
console.log(`  フォーム改造   ${pct(formOk, M).padStart(6)}${pct(b.form, M).padStart(12)}${d2(formOk / M * 100, b.form / M * 100).padStart(10)}`);
console.log(`  球種習得(サブ) ${pct(pitchOk, M).padStart(6)}${pct(b.pitch, M).padStart(12)}${d2(pitchOk / M * 100, b.pitch / M * 100).padStart(10)}`);
console.log(`  打席変更       ${pct(switchOk, M).padStart(6)}${pct(b.sw, M).padStart(12)}${d2(switchOk / M * 100, b.sw / M * 100).padStart(10)}`);
console.log(`  サブポジ+      ${(subSum / M).toFixed(2).padStart(6)}${(b.sub / M).toFixed(2).padStart(12)}${((subSum - b.sub) / M).toFixed(2).padStart(10)}`);
console.log('\n  ⚠ 母集団の平均は48.9で50より 1.1 低いので、わずかに下へ出るのが正しい。');
console.log();
