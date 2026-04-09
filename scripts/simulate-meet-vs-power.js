// ============================================================
// ミート vs パワー 1000打席シミュレーション
// ------------------------------------------------------------
// ミート10・パワー100 の打者と
// ミート100・パワー10 の打者を比較
// ------------------------------------------------------------
// 実行: node scripts/simulate-meet-vs-power.js
// ============================================================
import {
  calculatePhysicsContact,
  calculateBattedBallPhysics,
  judgeFielderReach,
} from '../src/simulation-logic.js';

// 標準的な投手（145km/h, スリークォーター）
const PITCHER = {
  velocity: 145,
  throws: 'right',
  form: 'threeQuarter',
};

// 標準的な球（ストレート）
const PITCH = {
  type: 'straight',
  level: 0,
  velocity: 145,
};

// 標準的な守備陣（全員能力70）
const DEFENSE = {
  pitcher: { defense: 70, speed: 60, arm: 70 },
  catcher: { defense: 70, speed: 55, arm: 70 },
  first:   { defense: 70, speed: 60, arm: 70 },
  second:  { defense: 70, speed: 65, arm: 70 },
  third:   { defense: 70, speed: 60, arm: 70 },
  short:   { defense: 70, speed: 70, arm: 70 },
  left:    { defense: 70, speed: 65, arm: 70 },
  center:  { defense: 70, speed: 75, arm: 70 },
  right:   { defense: 70, speed: 65, arm: 70 },
};

/**
 * 1打席をシミュレート（最大6球、空振り3つで三振）
 */
function simulateAtBat(batter) {
  let strikes = 0;
  for (let pitchNo = 0; pitchNo < 6; pitchNo++) {
    // コンタクト計算（素の状態: トンネリングや読みなし）
    const contact = calculatePhysicsContact(PITCHER, batter, false, PITCH, 0, {});

    if (!contact.isContact) {
      strikes++;
      if (strikes >= 3) {
        return { result: 'strikeout', bases: 0, description: '三振' };
      }
      continue;
    }

    // コンタクト成立 → 打球計算
    const battedBall = calculateBattedBallPhysics(batter, PITCHER, PITCH, contact);

    // ファウル判定（打球方向が±45度の外）
    if (battedBall.direction < -45 || battedBall.direction > 45) {
      if (strikes < 2) strikes++; // 2ストライク後のファウルはカウント変わらず
      continue;
    }

    // 守備の到達判定
    const outcome = judgeFielderReach(battedBall, DEFENSE, batter);
    return { ...outcome, exitVelocity: contact.exitVelocity };
  }
  // 6球決まらない場合はフェアゾーンで判定（稀）
  return { result: 'strikeout', bases: 0, description: 'カウント切れ' };
}

/**
 * 打者の1000打席分の統計を集計
 */
function runSimulation(name, batter, trials = 1000) {
  const stats = {
    pa: 0,
    ab: 0,
    hits: 0,
    single: 0,
    double: 0,
    triple: 0,
    hr: 0,
    strikeout: 0,
    out: 0,
    totalBases: 0,
    exitVelocitySum: 0,
    contactCount: 0,
  };

  for (let i = 0; i < trials; i++) {
    const r = simulateAtBat(batter);
    stats.pa++;
    stats.ab++;

    if (r.exitVelocity) {
      stats.exitVelocitySum += r.exitVelocity;
      stats.contactCount++;
    }

    switch (r.result) {
      case 'single':
        stats.hits++; stats.single++; stats.totalBases += 1; break;
      case 'double':
        stats.hits++; stats.double++; stats.totalBases += 2; break;
      case 'triple':
        stats.hits++; stats.triple++; stats.totalBases += 3; break;
      case 'homerun':
        stats.hits++; stats.hr++; stats.totalBases += 4; break;
      case 'strikeout':
        stats.strikeout++; break;
      case 'out':
        stats.out++; break;
    }
  }

  const avg = stats.hits / stats.ab;
  const slg = stats.totalBases / stats.ab;
  const ops = avg + slg; // 四球なしなのでOBP=AVG

  return { name, batter, stats, avg, slg, ops };
}

function pct(n, d) {
  return ((n / d) * 100).toFixed(1) + '%';
}

function rate(n) {
  return n.toFixed(3).replace(/^0/, '');
}

function printResult(r) {
  const s = r.stats;
  const avgEV = s.contactCount > 0 ? (s.exitVelocitySum / s.contactCount).toFixed(1) : '-';
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`■ ${r.name}  (ミート${r.batter.meet} / パワー${r.batter.power})`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`打席     : ${s.pa}`);
  console.log(`安打     : ${s.hits} (${pct(s.hits, s.ab)})`);
  console.log(`  単打   : ${s.single}`);
  console.log(`  二塁打 : ${s.double}`);
  console.log(`  三塁打 : ${s.triple}`);
  console.log(`  本塁打 : ${s.hr}`);
  console.log(`三振     : ${s.strikeout} (${pct(s.strikeout, s.ab)})`);
  console.log(`凡打     : ${s.out} (${pct(s.out, s.ab)})`);
  console.log(`─────────────────────────────`);
  console.log(`打率     : ${rate(r.avg)}`);
  console.log(`長打率   : ${rate(r.slg)}`);
  console.log(`OPS(仮)  : ${rate(r.ops)}`);
  console.log(`平均打球速度 : ${avgEV} km/h`);
}

// ============ 実行 ============
console.log('\n╔══════════════════════════════════════════════╗');
console.log('║   ミート vs パワー  1000打席シミュレーション ║');
console.log('╚══════════════════════════════════════════════╝');
console.log(`投手: 球速${PITCHER.velocity}km/h (スリークォーター), ストレートのみ`);
console.log(`守備: 全員 守備70/走力60-75/肩70 の標準守備`);
console.log(`※ 四球・死球・盗塁・読み・トンネリングは考慮しない`);

// パワータイプ
const powerHitter = {
  name: 'パワーヒッター',
  meet: 10,
  power: 100,
  speed: 60,
  bats: 'right',
};

// ミートタイプ
const contactHitter = {
  name: 'アベレージヒッター',
  meet: 100,
  power: 10,
  speed: 60,
  bats: 'right',
};

const result1 = runSimulation('パワー型 (Power 100 / Meet 10)', powerHitter, 1000);
const result2 = runSimulation('ミート型 (Meet 100 / Power 10)', contactHitter, 1000);

printResult(result1);
printResult(result2);

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`■ 比較サマリ`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`               パワー型    ミート型`);
console.log(`打率         :  ${rate(result1.avg)}      ${rate(result2.avg)}`);
console.log(`長打率       :  ${rate(result1.slg)}      ${rate(result2.slg)}`);
console.log(`OPS          :  ${rate(result1.ops)}      ${rate(result2.ops)}`);
console.log(`本塁打       :  ${String(result1.stats.hr).padStart(4)}        ${String(result2.stats.hr).padStart(4)}`);
console.log(`三振         :  ${String(result1.stats.strikeout).padStart(4)}        ${String(result2.stats.strikeout).padStart(4)}`);
console.log(`安打数       :  ${String(result1.stats.hits).padStart(4)}        ${String(result2.stats.hits).padStart(4)}`);
console.log();
