// ============================================================
// キャンプ練習システム
// メイン練習・サブ練習・チーム一括実行
// ============================================================

import { PHYSICAL_STATS, getAgeGrowthBase, getStatPath, getStatName, getNestedValue, setNestedValue } from './growthUtils.js';
import { PITCHING_FORM_EFFECTS, getPitchTypeName } from '../utils/constants.js';
import { syncPositionToFitness, getVelocityCap, getVelocityCatchupMult } from '../utils/physics.js';

// 集中練習が1点に集約する倍率。通常メニューは3〜4能力に分散するので、
// ここが 1.0 だと「集中しても総量は同じ・他能力に減点だけ付く」＝常に損になる。
// 分散先の数（3〜4）より小さくしてあるのは、集中には減点という別の代償があるため。
const INTENSIVE_FOCUS = 2.4;

// 練習カテゴリ → スタッフ指導能力のマッピング
const CATEGORY_TO_STAFF_ABILITY = {
  batting: 'battingCoach',
  fielding: 'fieldRunCoach',
  pitching: 'pitchingCoach',
};


// ============================================================
// メニューが「何のために」効くか（`serves`）
//
// ⚠ **キャンプの判断は物差しによって答えが逆になる**。実測（1チームだけ
//    3年鍛えて90試合×4シード / 同じ選手を3年鍛えてドラフト評価）:
//
//      メニュー   勝率     得点   失点  ｜ ドラフト評価
//      打撃練習   0.640    4.18   2.79 ｜ **286〜298（最善）**
//      ノック     0.673    3.43  **2.06** ｜ 270〜285
//      走塁練習  **0.682**  3.52   2.35 ｜ 260〜278（最低）
//
//    **チームを勝たせるなら守備・走塁、選手をドラフトへ送り出すなら打撃**。
//    走塁が勝率で最良なのは、走力が `judgeFielderReach` の守備範囲にも効くため。
//    この対立は既にモデルに存在していたが、**画面に何も出ていなかった**ので
//    プレイヤーには「打撃を選んでおけば良い」ようにしか見えなかった。
//    ⚠ 片方の物差しだけで係数を較正しないこと。
const SERVE_WIN = '勝敗';
const SERVE_DRAFT = 'ドラフト';

/**
 * 練習メニュー定義
 * 各練習メニューは特定の能力値を成長させる
 * `serves`: 実測でどちらの目的に効くか（上記）
 */
export const TRAINING_MENUS = {
  batting: {
    name: '打撃練習',
    icon: '🏏',
    description: 'ミートを強化、パワー・選球眼・バントを微増',
    targets: ['meet', 'power', 'eye', 'bunt'],
    serves: SERVE_DRAFT,   // 実測: 得点+0.75/試合だが失点+0.73。ドラフト評価は最善
    // 能力ごとの成長倍率: パワーは才能依存のため半減、選球眼は副次効果として半減
    // ミートは1.0倍維持（+0〜2）、パワー/選球眼/バントは0.3〜0.5倍（+0〜1）
    growthMultipliers: { power: 0.7, eye: 0.5, bunt: 0.3 },
    category: 'batting'
  },
  baserunning: {
    name: '走塁練習',
    icon: '🏃',
    description: '走力・盗塁・バントを強化',
    targets: ['speed', 'steal', 'bunt'],
    serves: SERVE_WIN,     // 実測: 勝率0.682で最良（走力は守備範囲にも効く）
    growthMultipliers: { speed: 0.75, bunt: 0.5 },
    category: 'batting'
  },
  fielding: {
    name: 'ノック',
    icon: '🧤',
    description: '守備力と肩力を強化（投手野手共通）',
    targets: ['defense', 'arm'],
    serves: SERVE_WIN,     // 実測: 失点2.06で最少
    growthMultipliers: { arm: 1.5 },
    category: 'fielding'
  },
  control: {
    name: '投げ込み',
    icon: '🎯',
    description: '制球力を強化し、スタミナも向上（投手向け）',
    targets: ['control', 'stamina'],
    growthMultipliers: { stamina: 0.5 },
    category: 'pitching'
  },
  velocity: {
    name: '球速練習',
    icon: '🔥',
    description: '球速を強化（肩力上限・フォーム適性あり）、スタミナも微増（投手向け）',
    targets: ['velocity', 'stamina'],
    growthMultipliers: { stamina: 0.3 },
    category: 'pitching'
  },
  newpitch: {
    name: '新球種習得',
    icon: '✨',
    description: '新しい変化球を覚える（投手のみ）',
    targets: ['newpitch'],
    category: 'pitching'
  },
  // 集中練習コース: +1確定 + 50%で+1〜2上乗せ / 25%で他1能力-1 / 25%で他2能力-1
  intensive_power: {
    name: '長打集中',
    icon: '💥',
    description: 'パワー+1確定、50%で+2〜3。25%で他-1、25%で他2つ-1',
    targets: ['power'],
    category: 'batting',
    intensive: true,
    penaltyPool: ['meet', 'eye', 'speed', 'defense']
  },
  intensive_meet: {
    name: 'ミート集中',
    icon: '🎯',
    description: 'ミート+1確定、50%で+2〜3。25%で他-1、25%で他2つ-1',
    targets: ['meet'],
    category: 'batting',
    intensive: true,
    penaltyPool: ['power', 'eye', 'speed', 'defense']
  },
  intensive_speed: {
    name: '走力集中',
    icon: '⚡',
    description: '走力+1確定、50%で+2〜3。25%で他-1、25%で他2つ-1',
    targets: ['speed'],
    category: 'batting',
    intensive: true,
    penaltyPool: ['meet', 'power', 'eye', 'defense']
  },
  intensive_control: {
    name: '制球集中',
    icon: '🎯',
    description: '制球+1確定、50%で+2〜3。25%で他-1、25%で他2つ-1',
    targets: ['control'],
    category: 'pitching',
    intensive: true,
    penaltyPool: ['velocity', 'stamina', 'meet', 'defense']
  },
  intensive_velocity: {
    name: '球速集中',
    icon: '🔥',
    description: '球速+1確定、50%で+2〜3。25%で他-1、25%で他2つ-1',
    targets: ['velocity'],
    category: 'pitching',
    intensive: true,
    penaltyPool: ['control', 'stamina', 'meet', 'defense']
  },
  intensive_defense: {
    name: '守備集中',
    icon: '🛡️',
    description: '守備+1確定、50%で+2〜3。25%で他-1、25%で他2つ-1',
    targets: ['defense'],
    category: 'fielding',
    intensive: true,
    penaltyPool: ['meet', 'power', 'eye', 'speed']
  },
  intensive_eye: {
    name: '選球眼集中',
    icon: '👁️',
    description: '選球眼+1確定、50%で+2〜3。25%で他-1、25%で他2つ-1',
    targets: ['eye'],
    category: 'batting',
    intensive: true,
    penaltyPool: ['meet', 'power', 'speed', 'defense']
  }
};

/**
 * サブ練習メニュー（基礎体力・弱点補強系）
 */
export const SUB_TRAINING_MENUS = {
  physique: {
    name: '基礎体力',
    icon: '🏃',
    description: '体力+2〜4・体幹+2〜3/クール確定（投手：スタミナ+1〜2も）',
  },
  weight: {
    name: 'ウエイト',
    icon: '🏋️',
    description: '体幹+1〜3（確定）・パワー+0〜1・肩力+0〜1',
  },
  stretch: {
    name: 'ストレッチ',
    icon: '🧘',
    description: '野手：ミート/パワー/走力/肩/守備からランダム1能力+1。投手：制球/球速/肩/守備/ミートからランダム1能力+1。回復力30%UP',
    targets: ['all_minor', 'recovery_sub'],
  },
  defense_sub: {
    name: '守備補強',
    icon: '🧤',
    description: '非適正ポジションの守備練習・バント微増',
    targets: ['defense', 'fitness', 'bunt'],
    growthMultipliers: { bunt: 0.3 },
  },
  form_change: {
    name: 'フォーム改造',
    icon: '🔄',
    description: '投球フォーム変更に挑戦（成功20%: フォーム変更+能力UP / 失敗: フォーム変更+制球低下）',
    targets: ['control', 'meet'],
  },
  switch_hit: {
    name: '打席変更',
    icon: '↔️',
    description: '打席変更に挑戦（失敗でミート低下リスク）',
    targets: ['switch_bats'],
  },
  breaking: {
    name: '変化球練習',
    icon: '🌀',
    description: '変化球レベルを強化（1球種を選んで集中練習も可）',
    targets: ['breaking'],
  },
  subposition: {
    name: 'サブポジ練習',
    icon: '🔀',
    description: '指定ポジションの守備練習（適正大幅UP）',
    targets: ['subposition'],
  },
  clead_study: {
    name: 'Cリード学習',
    icon: '🧠',
    description: 'キャッチャーリード向上（リード+1~3）',
    targets: ['clead'],
  },
  long_throw: {
    name: '遠投',
    icon: '🎯',
    description: '肩力を重点強化（+0〜3）投手は球速連動',
    targets: ['arm'],
  },
  eye: {
    name: '選球眼練習',
    icon: '👁️',
    description: '選球眼を強化（+0〜2）',
    targets: ['eye'],
  },
  newpitch: {
    name: '新球種習得',
    icon: '✨',
    description: '新球種習得に挑戦（成功率12%、ランダム球種）',
    targets: ['newpitch'],
  },
  spin_analysis: {
    name: 'スピン解析',
    icon: '🎥',
    description: '高速カメラで回転を分析・スピン+1〜3（器用さ係数）、変化球Lv向上、制球微増（投手のみ）',
  },
};

/**
 * 技術系能力(meet/power/eye/defense等)の高能力値成長減衰を適用
 * 70(プロ級)以上で超過1ごとに5%減衰、下限10%（サブ練習用）
 */
function applyTechStatDecay(currentValue, growth) {
  if (growth <= 0 || currentValue < 70) return growth;
  const overAmount = currentValue - 70;
  const dampFactor = Math.max(0.10, 1.0 - overAmount * 0.05);
  return Math.max(0, Math.round(growth * dampFactor));
}

/**
 * サブ練習を実行（メイン練習の半分程度の効果）
 * @param {Object} player - 選手
 * @param {string} subType - サブ練習タイプ
 * @param {Object} options - オプション { targetPosition, targetForm, targetBats, targetPitch }
 */
export function executeSubTraining(player, subType, options = {}, staffBonus = null) {
  const menu = SUB_TRAINING_MENUS[subType];
  if (!menu) return { player, growthReport: [] };

  const growthReport = [];
  const growthAmount = () => Math.random() < 0.4 ? (Math.random() < 0.3 ? 2 : 1) : 0;

  switch (subType) {
    case 'physique': {
      // 体力+2〜4（確定）
      if (player.physical) {
        const bsBefore = player.physical.bodyStamina ?? 50;
        if (bsBefore < 99) {
          const bsGrowth = Math.floor(Math.random() * 3) + 2; // 2〜4
          player.physical.bodyStamina = Math.min(99, bsBefore + bsGrowth);
          growthReport.push({ statName: '体力', before: bsBefore, after: player.physical.bodyStamina, growth: player.physical.bodyStamina - bsBefore });
        }
        // 体幹+2〜3（確定）
        const oldMuscle = player.physical.muscle ?? 50;
        if (oldMuscle < 100) {
          const mGrowth = Math.floor(Math.random() * 3) + 1; // 1〜3
          player.physical.muscle = Math.min(100, oldMuscle + mGrowth);
          growthReport.push({ statName: '体幹', before: oldMuscle, after: player.physical.muscle, growth: player.physical.muscle - oldMuscle });
        }
      }
      // 投手はスタミナ+1〜2も上昇
      if (player.pitching) {
        const staGrowth = Math.random() < 0.4 ? 2 : 1;
        const before = player.pitching.stamina || 80;
        player.pitching.stamina = Math.min(200, before + staGrowth);
        growthReport.push({ statName: 'スタミナ', before, after: player.pitching.stamina, growth: staGrowth });
      }
      break;
    }
    case 'weight': {
      // 体幹 +1〜3（確定）
      if (player.physical) {
        const oldMuscle = player.physical.muscle ?? 50;
        if (oldMuscle < 100) {
          const mGrowth = Math.floor(Math.random() * 3) + 1;
          player.physical.muscle = Math.min(100, oldMuscle + mGrowth);
          growthReport.push({ statName: '体幹', before: oldMuscle, after: player.physical.muscle, growth: player.physical.muscle - oldMuscle });
        }
        // 肩力 +0〜1（40%で+1）投手は球速連動
        if (Math.random() < 0.4) {
          const oldArm = player.physical.arm || 50;
          if (oldArm < 100) {
            player.physical.arm = Math.min(100, oldArm + 1);
            growthReport.push({ statName: '肩力', before: oldArm, after: player.physical.arm, growth: 1 });
            if (player.pitching) {
              const armNow = player.physical.arm;
              const velChange = Math.round(0.5 * getVelocityCatchupMult(armNow, player.pitching.velocity || 120));
              if (velChange > 0) {
                const oldVel = player.pitching.velocity || 120;
                const newVel = Math.min(getVelocityCap(armNow), oldVel + velChange);
                if (newVel > oldVel) {
                  player.pitching.velocity = newVel;
                  growthReport.push({ statName: '球速', before: oldVel, after: newVel, growth: newVel - oldVel, isLinked: true });
                }
              }
            }
          }
        }
      }
      // パワー +0〜1（40%で+1）
      if (player.batting && Math.random() < 0.4) {
        const oldPower = player.batting.power || 0;
        const powerGrowth = applyTechStatDecay(oldPower, 1);
        if (powerGrowth > 0) {
          player.batting.power = Math.min(100, oldPower + powerGrowth);
          growthReport.push({ statName: 'パワー', before: oldPower, after: player.batting.power, growth: powerGrowth });
        }
      }
      break;
    }
    case 'stretch': {
      // 投手は制球・球速含む5能力、野手はミート・パワー・走力・肩力・守備からランダム1つ+1
      const isPitcher = player.position === 'pitcher';
      const stats = isPitcher ? [
        { key: 'pitching.control', name: '制球', isTech: true },
        { key: 'pitching.velocity', name: '球速', isTech: false, isVelocity: true },
        { key: 'physical.arm', name: '肩力', isTech: false },
        { key: 'fielding.defense', name: '守備', isTech: true },
        { key: 'batting.meet', name: 'ミート', isTech: true },
      ] : [
        { key: 'batting.meet', name: 'ミート', isTech: true },
        { key: 'batting.power', name: 'パワー', isTech: true },
        { key: 'physical.speed', name: '走力', isTech: false },
        { key: 'physical.arm', name: '肩力', isTech: false },
        { key: 'fielding.defense', name: '守備', isTech: true },
      ];
      const picked = stats[Math.floor(Math.random() * stats.length)];
      const [obj, prop] = picked.key.split('.');
      if (player[obj]) {
        const old = player[obj][prop] ?? (picked.isVelocity ? 120 : 50);
        let gain;
        if (picked.isVelocity) {
          const armVal = player.physical?.arm || 50;
          gain = old < getVelocityCap(armVal) ? 1 : 0;
        } else {
          gain = picked.isTech ? applyTechStatDecay(old, 1) : 1;
        }
        if (gain > 0) {
          const maxVal = picked.isVelocity ? getVelocityCap(player.physical?.arm || 50) : 100;
          player[obj][prop] = Math.min(maxVal, old + gain);
          growthReport.push({ statName: picked.name, before: old, after: player[obj][prop], growth: gain });
          if (picked.key === 'physical.arm' && !isPitcher) {
            const armNow = player.physical?.arm || 50;
            const velChange = Math.round(gain * 0.5 * getVelocityCatchupMult(armNow, player.pitching?.velocity || 120));
            if (velChange > 0 && player.pitching) {
              const oldVel = player.pitching.velocity || 120;
              const newVel = Math.min(getVelocityCap(armNow), oldVel + velChange);
              if (newVel !== oldVel) {
                player.pitching.velocity = newVel;
                growthReport.push({ statName: '球速', before: oldVel, after: newVel, growth: newVel - oldVel, isLinked: true });
              }
            }
          }
        }
      }
      // 回復力UP（30%の確率で+1）
      if (player.physical && Math.random() < 0.3) {
        const recBefore = player.physical.recovery || 50;
        player.physical.recovery = Math.min(99, recBefore + 1);
        growthReport.push({ statName: '回復', before: recBefore, after: player.physical.recovery, growth: 1 });
      }
      break;
    }
    case 'defense_sub': {
      const defRaw = growthAmount();
      if (defRaw > 0 && player.fielding) {
        const oldDef = player.fielding.defense || 50;
        const def = applyTechStatDecay(oldDef, defRaw);
        if (def > 0) {
          player.fielding.defense = Math.min(100, oldDef + def);
          growthReport.push({ statName: '守備', before: oldDef, after: player.fielding.defense, growth: def });
        }
      }
      // バント微増（30%で+1）
      if (player.batting && Math.random() < 0.3) {
        const oldBunt = player.batting.bunt || 30;
        const buntGrowth = applyTechStatDecay(oldBunt, 1);
        if (buntGrowth > 0) {
          player.batting.bunt = Math.min(100, oldBunt + buntGrowth);
          growthReport.push({ statName: 'バント', before: oldBunt, after: player.batting.bunt, growth: buntGrowth });
        }
      }
      // 守備適正: 現在ポジションを確定で+4〜8
      if (player.positionFitness && player.position && player.position !== 'pitcher') {
        const curPos = player.position;
        const old = player.positionFitness[curPos] || 0;
        if (old < 100) {
          const gain = Math.floor(Math.random() * 5) + 4;
          player.positionFitness[curPos] = Math.min(100, old + gain);
          const gained = player.positionFitness[curPos] - old;
          growthReport.push({ statName: `${POSITION_NAMES_MAP[curPos] || curPos}適正`, before: old, after: player.positionFitness[curPos], growth: gained });
        }
      }
      break;
    }
    case 'form_change': {
      if (player.position === 'pitcher' && player.pitching) {
        const currentForm = player.pitching.form || 'threeQuarter';
        const forms = ['overhand', 'threeQuarter', 'sidearm', 'submarine'];
        const targetForm = options.targetForm && options.targetForm !== currentForm
          ? options.targetForm
          : forms.filter(f => f !== currentForm)[Math.floor(Math.random() * (forms.length - 1))];
        const FORM_NAMES = { overhand: 'オーバー', threeQuarter: 'スリークォーター', sidearm: 'サイド', submarine: 'アンダー' };
        // 成功/失敗にかかわらずフォームは変わる
        player.pitching.form = targetForm;
        if (Math.random() < 0.20) {
          // 成功: フォーム変更 + 制球+3~5 大幅アップ
          growthReport.push({ statName: 'フォーム改造成功', before: FORM_NAMES[currentForm], after: FORM_NAMES[targetForm], growth: 0, isAwakening: true });
          const bonus = Math.floor(Math.random() * 3) + 3;
          const oldCtrl = player.pitching.control || 50;
          player.pitching.control = oldCtrl + bonus;
          growthReport.push({ statName: '制球', before: oldCtrl, after: player.pitching.control, growth: bonus });
        } else {
          // 失敗: フォーム変更 + 制球-1~3 ダウン
          growthReport.push({ statName: 'フォーム改造', before: FORM_NAMES[currentForm], after: FORM_NAMES[targetForm], growth: 0 });
          const penalty = Math.floor(Math.random() * 3) + 1;
          if (player.pitching.control > 20) {
            const oldCtrl = player.pitching.control;
            player.pitching.control = Math.max(15, oldCtrl - penalty);
            growthReport.push({ statName: '制球', before: oldCtrl, after: player.pitching.control, growth: player.pitching.control - oldCtrl });
          }
        }
      } else if (player.batting) {
        // 野手のフォーム改造: ミート微増（70以上は減衰）
        const mtRaw = growthAmount();
        if (mtRaw > 0) {
          const oldMeet = player.batting.meet || 50;
          const mt = applyTechStatDecay(oldMeet, mtRaw);
          if (mt > 0) {
            player.batting.meet = Math.min(100, oldMeet + mt);
            growthReport.push({ statName: 'ミート', before: oldMeet, after: player.batting.meet, growth: mt });
          }
        }
      }
      break;
    }
    case 'switch_hit': {
      const currentBats = player.batting?.bats || player.physical?.bats || 'right';
      const targetBats = options.targetBats && options.targetBats !== currentBats
        ? options.targetBats
        : (currentBats === 'switch' ? null : 'switch');
      const BATS_NAMES = { right: '右打', left: '左打', switch: '両打' };
      if (!targetBats || targetBats === currentBats) {
        growthReport.push({ statName: '打席変更', before: BATS_NAMES[currentBats], after: '変更不要', growth: 0 });
        break;
      }
      // ハイリスクハイリターン: switch→片打は30%、片打→switchは15%、片打→反対は20%
      const isToSwitch = targetBats === 'switch';
      const isFromSwitch = currentBats === 'switch';
      const successRate = isToSwitch ? 0.15 : isFromSwitch ? 0.30 : 0.20;
      if (Math.random() < successRate) {
        if (!player.batting) player.batting = {};
        player.batting.bats = targetBats;
        growthReport.push({ statName: '打席', before: BATS_NAMES[currentBats], after: BATS_NAMES[targetBats], growth: 0, isAwakening: true });
        // ミート微減リスク（switchへの場合のみ）
        if (isToSwitch && player.batting.meet > 30) {
          const penalty = Math.floor(Math.random() * 3) + 1;
          const oldMeet = player.batting.meet;
          player.batting.meet = Math.max(20, oldMeet - penalty);
          growthReport.push({ statName: 'ミート', before: oldMeet, after: player.batting.meet, growth: player.batting.meet - oldMeet });
        }
      } else {
        growthReport.push({ statName: '打席変更', before: BATS_NAMES[currentBats], after: '変更失敗', growth: 0 });
        // 失敗ペナルティ: ミート-1~2
        if (player.batting?.meet > 25) {
          const penalty = Math.floor(Math.random() * 2) + 1;
          const oldMeet = player.batting.meet;
          player.batting.meet = Math.max(20, oldMeet - penalty);
          growthReport.push({ statName: 'ミート', before: oldMeet, after: player.batting.meet, growth: player.batting.meet - oldMeet });
        }
      }
      break;
    }
    case 'breaking': {
      // 変化球練習（サブ練習版）
      // 合計4〜8ポイントを保有変化球に分配。1球種のみの投手は集中練習として一気に上昇
      if (player.position === 'pitcher' && player.pitching) {
        const arsenal = player.pitching?.arsenal || [];
        const nonStraight = arsenal.filter(p => p.type !== 'straight');
        const playerForm = player.pitching?.form;
        const battVal = staffBonus ? (staffBonus.batteryCoach || 50) : 50;
        const battMult = 0.9 + (battVal / 100) * 0.2;

        if (nonStraight.length > 0) {
          const age = player.age || 20;
          const ageBase = getAgeGrowthBase(age, false);
          const ageMult = Math.max(0.6, 1.0 + ageBase * 0.12); // 0.6〜1.1
          const dext = player.physical?.dexterity ?? 50;
          const dextMult = 0.85 + (dext / 100) * 0.30; // 0.85〜1.15

          // 基本プール4〜8ポイント、補正後も整数に丸める
          const rawPool = Math.floor(Math.random() * 5) + 4;
          const effectivePool = Math.max(1, Math.round(rawPool * ageMult * dextMult * battMult));

          // MAXに達した球種は配分対象から除外（プールを無駄にしない）
          const growable = nonStraight.filter(p => p.level < 100);
          const maxed = nonStraight.filter(p => p.level >= 100);

          // MAX球種はレポートに表示するだけ
          maxed.forEach(pitch => {
            growthReport.push({ statName: `${getPitchTypeName(pitch.type)} [MAX]`, before: pitch.level, after: pitch.level, growth: 0 });
          });

          // **1球種を指定して集中練習できる**（options.targetPitch）。
          // 分散させず1つに全ポイントを注ぎ込むので伸びが速い。
          // 習熟度の低い球は「防御率は変わらず四球だけ増える」ので、
          // 封印しつつ1つを集中して磨く、という育成が成立する。
          const focus = options.targetPitch
            ? growable.find(p => p.type === options.targetPitch) : null;
          if (focus) {
            const formAff = getFormPitchAffinity(playerForm, focus.type);
            // 集中練習は分散させないぶん +2（適性があればさらに +1）
            const growth = effectivePool + 2 + (formAff ? 1 : 0);
            const before = focus.level;
            focus.level = Math.min(100, before + growth);
            growthReport.push({
              statName: `${getPitchTypeName(focus.type)}${formAff ? ' [適性]' : ''} [集中]`,
              before, after: focus.level, growth: focus.level - before,
            });
          } else if (growable.length > 0) {
            // プールをレベルアップ可能な球種で均等分配し、余りはランダムな球種に+1
            const count = growable.length;
            const base = Math.floor(effectivePool / count);
            const extraCount = effectivePool - base * count;
            const extraSet = new Set(
              [...Array(count).keys()].sort(() => Math.random() - 0.5).slice(0, extraCount)
            );

            growable.forEach((pitch, i) => {
              const formAff = getFormPitchAffinity(playerForm, pitch.type);
              const formBonus = formAff ? 1 : 0;
              const growth = base + (extraSet.has(i) ? 1 : 0) + formBonus;
              const before = pitch.level;
              pitch.level = Math.min(100, before + growth);
              const affinityTag = formAff ? ' [適性]' : '';
              growthReport.push({ statName: `${getPitchTypeName(pitch.type)}${affinityTag}`, before, after: pitch.level, growth: pitch.level - before });
            });
          }
        }
      }
      break;
    }
    case 'newpitch': {
      // 新球種習得（サブ練習版 - 成功率低め、フォーム適性で確率UP）
      if (player.position === 'pitcher' && player.pitching) {
        const allPitchTypes = ['slider', 'curve', 'fork', 'changeup', 'sinker', 'cutter', 'knuckle', 'shoot'];
        const currentArsenal = (player.pitching.arsenal || []).map(a => a.type);
        const available = allPitchTypes.filter(t => !currentArsenal.includes(t));
        // フォーム適性のある球種を優先的に選ぶ（50%の確率で適性球種を選択）
        const playerForm = player.pitching?.form;
        const affinityTypes = available.filter(t => getFormPitchAffinity(playerForm, t));
        const useAffinity = affinityTypes.length > 0 && Math.random() < 0.5;
        const candidates = useAffinity ? affinityTypes : available;
        if (available.length > 0) {
          const newType = candidates[Math.floor(Math.random() * candidates.length)];
          const formAff = getFormPitchAffinity(playerForm, newType);
          const baseRate = 0.12;
          const successRate = formAff ? Math.min(0.25, baseRate + formAff.affinity) : baseRate;
          if (Math.random() < successRate) {
            const level = 20 + Math.floor(Math.random() * 20);
            if (!player.pitching.arsenal) player.pitching.arsenal = [{ type: 'straight', level: 50 }];
            player.pitching.arsenal.push({ type: newType, level });
            const affinityTag = formAff ? ' [適性]' : '';
            growthReport.push({ statName: '新球種', before: '-', after: `${getPitchTypeName(newType)}Lv${level}${affinityTag}`, growth: 0, isAwakening: true });
          } else {
            growthReport.push({ statName: '新球種', before: '-', after: '習得失敗', growth: 0 });
          }
        } else {
          growthReport.push({ statName: '新球種', before: '-', after: '習得済み', growth: 0 });
        }
      }
      break;
    }
    case 'spin_analysis': {
      if (!player.pitching) break;
      // スピン（回転数）+1〜3（器用さ係数）
      const oldSpin = player.pitching.spinRate || 50;
      if (oldSpin < 100) {
        const dex = player.physical?.dexterity || 50;
        const dexMult = 0.5 + (dex / 100) * 1.0; // 器用さ0→0.5倍, 50→1.0倍, 100→1.5倍
        const rawSpin = Math.floor(Math.random() * 3) + 1; // 1〜3
        const spinGrowth = Math.max(1, Math.min(3, Math.round(rawSpin * dexMult)));
        const newSpin = Math.min(100, oldSpin + spinGrowth);
        player.pitching.spinRate = newSpin;
        growthReport.push({ statName: 'スピン', before: oldSpin, after: newSpin, growth: newSpin - oldSpin });
      }
      // 既習得変化球1球種のレベルを +2〜4
      const arsenal = player.pitching.arsenal || [];
      const upgradeable = arsenal.filter(a => a.type !== 'straight' && (a.level || 0) < 100);
      if (upgradeable.length > 0) {
        const tgt = upgradeable[Math.floor(Math.random() * upgradeable.length)];
        const oldLv = tgt.level || 0;
        const lv = Math.floor(Math.random() * 3) + 2;
        tgt.level = Math.min(100, oldLv + lv);
        growthReport.push({ statName: `${getPitchTypeName(tgt.type)}LV`, before: oldLv, after: tgt.level, growth: tgt.level - oldLv });
      }
      // 制球 +0〜1（40%の確率・高能力値減衰あり）
      if (Math.random() < 0.4) {
        const oldCtrl = player.pitching.control || 50;
        const ctrlGain = applyTechStatDecay(oldCtrl, 1);
        if (ctrlGain > 0) {
          player.pitching.control = Math.min(100, oldCtrl + ctrlGain);
          growthReport.push({ statName: '制球', before: oldCtrl, after: player.pitching.control, growth: ctrlGain });
        }
      }
      break;
    }
    case 'clead_study': {
      if (!player.catching) player.catching = {};
      const batteryValue = staffBonus ? (staffBonus.batteryCoach || 50) : 50;
      const batteryMult = 0.7 + (batteryValue / 100) * 0.6;
      const rawGain = Math.floor(Math.random() * 3) + 1; // 1~3
      const gain = Math.max(1, Math.round(rawGain * batteryMult));
      const old = player.catching.lead || 40;
      player.catching.lead = Math.min(100, old + gain);
      growthReport.push({ statName: 'Cリード', before: old, after: player.catching.lead, growth: gain });
      break;
    }
    case 'long_throw': {
      if (player.physical) {
        // 肩力は才能依存が強いため半減（50%の確率で適用）
        const armRaw = Math.random() < 0.5 ? (Math.random() < 0.35 ? 3 : Math.random() < 0.5 ? 2 : 1) : (Math.random() < 0.3 ? 1 : 0);
        const armRawHalved = Math.random() < 0.5 ? armRaw : 0;
        if (armRawHalved > 0) {
          const oldArm = player.physical.arm || 50;
          const armGain = Math.min(armRawHalved, 100 - oldArm);
          if (armGain > 0) {
            player.physical.arm = oldArm + armGain;
            growthReport.push({ statName: '肩力', before: oldArm, after: player.physical.arm, growth: armGain });
            if (player.pitching) {
              const armNow = player.physical.arm;
              const velChange = Math.round(armGain * 0.6 * getVelocityCatchupMult(armNow, player.pitching.velocity || 120));
              if (velChange > 0) {
                const oldVel = player.pitching.velocity || 120;
                const newVel = Math.min(getVelocityCap(armNow), oldVel + velChange);
                if (newVel > oldVel) {
                  player.pitching.velocity = newVel;
                  growthReport.push({ statName: '球速', before: oldVel, after: newVel, growth: newVel - oldVel, isLinked: true });
                }
              }
            }
          }
        }
      }
      // 回転（ノビ）: 投手は遠投で回転数を伸ばせる（20%で+0、40%で+1、30%で+2、10%で+3）
      if (player.pitching) {
        const spinRoll = Math.random();
        const spinRaw = spinRoll < 0.2 ? 0 : spinRoll < 0.6 ? 1 : spinRoll < 0.9 ? 2 : 3;
        if (spinRaw > 0) {
          const oldSpin = player.pitching.spinRate || 50;
          if (oldSpin < 100) {
            const spinGain = Math.min(spinRaw, 100 - oldSpin);
            player.pitching.spinRate = oldSpin + spinGain;
            growthReport.push({ statName: '回転/ノビ', before: oldSpin, after: player.pitching.spinRate, growth: spinGain });
          }
        }
      }
      break;
    }
    case 'eye': {
      const eyeRaw = growthAmount();
      if (eyeRaw > 0 && player.batting) {
        const old = player.batting.eye || 50;
        const eyeGain = applyTechStatDecay(old, eyeRaw);
        if (eyeGain > 0) {
          player.batting.eye = Math.min(100, old + eyeGain);
          growthReport.push({ statName: '選球眼', before: old, after: player.batting.eye, growth: eyeGain });
        }
      }
      break;
    }
    case 'subposition': {
      // サブポジション練習 - 指定ポジションまたはランダムの適正を上げる（成長3倍）
      if (!player.positionFitness) player.positionFitness = {};
      const allPos = ['catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'];
      const nonMainPos = allPos.filter(p => p !== player.position);
      let picked = options.targetPosition;
      if (!picked || picked === player.position || !allPos.includes(picked)) {
        // 指定なしならランダム（弱いポジション優先）
        const weakPositions = nonMainPos.filter(p => (player.positionFitness[p] || 0) < 80);
        const targets = weakPositions.length > 0 ? weakPositions : nonMainPos;
        picked = targets[Math.floor(Math.random() * targets.length)];
      }
      if (picked) {
        // 3倍成長: 元(50%で0,30%で3,20%で5) → 常に成長、9-15程度
        const baseGain = Math.floor(Math.random() * 7) + 9; // 9-15
        const old = player.positionFitness[picked] || 0;
        player.positionFitness[picked] = Math.min(100, old + baseGain);
        const actual = player.positionFitness[picked] - old;
        growthReport.push({ statName: `${POSITION_NAMES_MAP[picked] || picked}適正`, before: old, after: player.positionFitness[picked], growth: actual });
        syncPositionToFitness(player);
      }
      break;
    }
  }

  return { player, growthReport };
}

const POSITION_NAMES_MAP = { pitcher: '投', catcher: '捕', first: '一', second: '二', third: '三', short: '遊', left: '左', center: '中', right: '右' };

/**
 * シーズン終了時に経験値を集計
 * 投手: 登板数 + 投球回数
 * 野手: 出場試合数 + 打席数/3
 * フル稼働で年間約250ポイント
 * @param {Object} player - 選手データ
 */
export function calculateSeasonExperience(player) {
  const pitchingStats = player.seasonStats?.pitching || {};
  const battingStats = player.seasonStats?.batting || {};

  const pitcherExp = (pitchingStats.games || 0) + Math.floor(pitchingStats.inningsPitched || 0);
  const batterExp = (battingStats.games || 0) + Math.floor((battingStats.atBats || 0) / 3);

  // 投手はピッチング経験を、野手はバッティング経験を採用
  const isPitcher = player.position === 'pitcher';
  return isPitcher ? pitcherExp : batterExp;
}

/**
 * 全選手の経験値を更新（シーズン終了時に呼ぶ）
 * @param {Object} allTeams - 全チームデータ
 */
export function updateAllPlayersExperience(allTeams) {
  const updatedTeams = {};

  Object.entries(allTeams).forEach(([teamName, team]) => {
    updatedTeams[teamName] = {
      ...team,
      players: team.players.map(player => {
        const gainedExp = calculateSeasonExperience(player);
        return {
          ...player,
          experience: (player.experience || 0) + gainedExp
        };
      })
    };
  });

  return updatedTeams;
}

/**
 * ポジション経験による成長ボーナス倍率を算出
 * 外野: バランス成長、二塁/遊撃: 走力・守備、三塁/一塁: 打撃、捕手: 守備・肩
 */
function getPositionGrowthBonus(player, targetStat) {
  const posExp = player.positionExperience || {};
  const totalGames = Object.values(posExp).reduce((a, b) => a + b, 0);
  if (totalGames === 0) return 1.0;

  // 各ポジションの成長傾向（stat → bonus倍率）
  const positionBonusMap = {
    // 二塁・遊撃: 走力、守備が伸びやすい
    second:  { speed: 1.4, defense: 1.4, steal: 1.3, bunt: 1.2, arm: 1.1, meet: 1.0, power: 0.9 },
    short:   { speed: 1.4, defense: 1.4, steal: 1.3, bunt: 1.2, arm: 1.2, meet: 1.0, power: 0.9 },
    // 三塁・一塁: 打撃が伸びやすい
    third:   { power: 1.4, meet: 1.3, arm: 1.2, defense: 1.0, speed: 0.9, steal: 0.9, bunt: 0.9 },
    first:   { power: 1.5, meet: 1.4, eye: 1.2, defense: 0.9, speed: 0.9, steal: 0.8, bunt: 0.8 },
    // 外野: バランス成長
    left:    { speed: 1.2, meet: 1.1, power: 1.1, arm: 1.1, defense: 1.1, steal: 1.1, bunt: 1.0 },
    center:  { speed: 1.3, defense: 1.2, meet: 1.1, steal: 1.2, bunt: 1.1, arm: 1.0, power: 1.0 },
    right:   { arm: 1.3, power: 1.2, meet: 1.1, speed: 1.1, defense: 1.1, steal: 1.0, bunt: 0.9 },
    // 捕手: 守備・肩が伸びやすい
    catcher: { defense: 1.5, arm: 1.4, meet: 1.0, bunt: 1.0, power: 0.9, speed: 0.8, steal: 0.8 },
  };

  // 加重平均でボーナスを計算
  let weightedBonus = 0;
  Object.entries(posExp).forEach(([pos, games]) => {
    const bonusMap = positionBonusMap[pos] || {};
    const bonus = bonusMap[targetStat] || 1.0;
    weightedBonus += bonus * (games / totalGames);
  });

  return weightedBonus || 1.0;
}

/**
 * 打順経験による成長ボーナス倍率を算出
 * 1番: 走力、2-3番: バランス、4番: パワー、5番: パワー/打撃、下位: 守備
 */
function getBattingOrderGrowthBonus(player, targetStat) {
  const boExp = player.battingOrderExperience || {};
  const totalGames = Object.values(boExp).reduce((a, b) => a + b, 0);
  if (totalGames === 0) return 1.0;

  const orderBonusMap = {
    1: { speed: 1.4, steal: 1.4, bunt: 1.3, meet: 1.2, eye: 1.2, power: 0.9 },
    2: { meet: 1.3, bunt: 1.3, speed: 1.2, eye: 1.2, steal: 1.1, power: 1.0, defense: 1.0 },
    3: { meet: 1.3, power: 1.2, eye: 1.1, speed: 1.1, defense: 1.0, bunt: 0.9 },
    4: { power: 1.5, meet: 1.2, eye: 1.1, speed: 0.9, steal: 0.8, bunt: 0.7 },
    5: { power: 1.3, meet: 1.2, eye: 1.1, arm: 1.0, bunt: 0.8 },
    6: { defense: 1.2, meet: 1.1, power: 1.1, arm: 1.1, bunt: 1.0 },
    7: { defense: 1.2, arm: 1.1, bunt: 1.1, meet: 1.0, speed: 1.1 },
    8: { defense: 1.3, arm: 1.2, bunt: 1.2, speed: 1.1 },
    9: { bunt: 1.2 },
  };

  let weightedBonus = 0;
  Object.entries(boExp).forEach(([order, games]) => {
    const bonusMap = orderBonusMap[parseInt(order)] || {};
    const bonus = bonusMap[targetStat] || 1.0;
    weightedBonus += bonus * (games / totalGames);
  });

  return weightedBonus || 1.0;
}

// 利用可能な全変化球（新球種習得用）
const ALL_PITCH_TYPES = [
  'slider', 'curve', 'fork', 'changeup', 'sinker', 'shoot',
  'cutter', 'splitter', 'twoSeam', 'palm', 'knuckle'
];

// フォーム別の変化球適性（習得しやすさ・成長ボーナス）
// affinity: 習得成功率ボーナス(加算), growth: 変化球練習の成長倍率
const FORM_PITCH_AFFINITY = {
  overhand: {
    fork: { affinity: 0.15, growth: 1.5 },
    curve: { affinity: 0.10, growth: 1.3 },
    splitter: { affinity: 0.10, growth: 1.3 },
  },
  threeQuarter: {
    slider: { affinity: 0.10, growth: 1.3 },
    changeup: { affinity: 0.10, growth: 1.3 },
    cutter: { affinity: 0.10, growth: 1.3 },
  },
  sidearm: {
    sinker: { affinity: 0.15, growth: 1.5 },
    slider: { affinity: 0.10, growth: 1.3 },
    shoot: { affinity: 0.10, growth: 1.3 },
  },
  submarine: {
    sinker: { affinity: 0.20, growth: 1.7 },
    changeup: { affinity: 0.10, growth: 1.3 },
    twoSeam: { affinity: 0.10, growth: 1.3 },
  },
};

function getFormPitchAffinity(form, pitchType) {
  return FORM_PITCH_AFFINITY[form]?.[pitchType] || null;
}

// 速球系変化球・緩急系変化球の分類
const FAST_PITCH_TYPES = ['slider', 'cutter', 'sinker', 'twoSeam', 'shoot'];
const SLOW_PITCH_TYPES = ['curve', 'changeup', 'fork', 'splitter', 'palm', 'knuckle'];

// 保有球種の緩急バランスから第2適性を算出（球種習得のたびに動的更新）
// 速球系≥緩急系なら緩急系から、逆なら速球系から補完するよう選ぶ
export function calcSecondAffinity(arsenal) {
  const existingTypes = arsenal.map(p => p.type);
  const fastCount = existingTypes.filter(t => FAST_PITCH_TYPES.includes(t)).length;
  const slowCount = existingTypes.filter(t => SLOW_PITCH_TYPES.includes(t)).length;
  const pool = fastCount >= slowCount ? SLOW_PITCH_TYPES : FAST_PITCH_TYPES;
  const candidates = pool.filter(t => !existingTypes.includes(t));
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * キャンプ練習を実行（1クール分）
 * 成長量は1/4に調整済み
 * @param {Object} player - 選手データ
 * @param {string} trainingType - 練習メニューのキー
 * @param {string} [newPitchType] - 新球種習得時の球種キー
 * @returns {Object} - 成長結果 { player, growthReport }
 */
export function executeCampTraining(player, trainingType, newPitchType, staffBonus = null, awakeningMult = 1.0) {
  const menu = TRAINING_MENUS[trainingType];
  if (!menu) {
    console.warn(`Unknown training type: ${trainingType}`);
    return { player, growthReport: [] };
  }

  const experience = player.experience || 0;
  const age = player.age || 20;
  const growthReport = [];
  let updatedPlayer = JSON.parse(JSON.stringify(player));

  // 全選手があらゆる練習を受けられるよう、不足する能力オブジェクトをデフォルト値で初期化
  if (!updatedPlayer.batting) {
    updatedPlayer.batting = { meet: 0, power: 0, eye: 0, steal: 0, bunt: 0, bats: 'right' };
  }
  if (!updatedPlayer.pitching) {
    updatedPlayer.pitching = { velocity: 110, control: 30, stamina: 80, spinRate: 30, form: 'threeQuarter', arsenal: [{ id: 1, type: 'straight', level: 30 }] };
  }
  if (!updatedPlayer.fielding) {
    updatedPlayer.fielding = { defense: 0 };
  }

  // スタッフ指導補正: 練習カテゴリに対応するスタッフ能力で0.7〜1.3倍
  const staffAbilityKey = CATEGORY_TO_STAFF_ABILITY[menu.category];
  const staffAbilityValue = staffBonus && staffAbilityKey ? (staffBonus[staffAbilityKey] || 50) : 50;
  const coachingMult = 0.7 + (staffAbilityValue / 100) * 0.6;

  // フィットネス補正: フィジカル系能力の練習に0.8〜1.2倍
  const fitnessValue = staffBonus ? (staffBonus.fitness || 50) : 50;
  const fitnessMult = 0.8 + (fitnessValue / 100) * 0.4;

  // バッテリー指導補正: 制球練習に0.9〜1.1倍（投手コーチが主、バッテリーは補助）
  const batteryValue = staffBonus ? (staffBonus.batteryCoach || 50) : 50;
  const batteryMult = 0.9 + (batteryValue / 100) * 0.2;

  // 新球種習得の場合（覚醒10%/大成功15%/成功20%/習得25%/失敗30%）
  if (trainingType === 'newpitch') {
    const arsenal = updatedPlayer.pitching?.arsenal || [];
    const existingTypes = arsenal.map(p => p.type);
    // newPitchTypeが指定されていても既習得済みなら無視して自動選択（クール間の選択状態が古くなる場合の対策）
    const validNewPitchType = newPitchType && !existingTypes.includes(newPitchType) ? newPitchType : null;
    const targetType = validNewPitchType || ALL_PITCH_TYPES.find(t => !existingTypes.includes(t));
    if (targetType && !existingTypes.includes(targetType)) {
      // フォーム適性ボーナス（適性球種は失敗率が下がる）
      const formAff = getFormPitchAffinity(updatedPlayer.pitching?.form, targetType);
      const formBonus = formAff ? formAff.affinity : 0;
      // 第2適性（緩急補完）ボーナス
      const hasSecondAffinity = updatedPlayer.pitching?.secondAffinity === targetType;
      const affinityBonus = formBonus + (hasSecondAffinity ? 0.08 : 0);
      // 基本: 覚醒10%, 大成功15%, 成功20%, 習得25%, 失敗30%
      // 適性ボーナス分だけ失敗率が減り、成功率に上乗せ
      const failRate = Math.max(0.05, 0.30 - affinityBonus);
      const learnedRate = 0.25 + affinityBonus * 0.5;
      const roll = Math.random();
      const outcome = roll < 0.10 ? 'awakening'
        : roll < 0.25 ? 'great_success'
        : roll < 0.45 ? 'success'
        : roll < (0.45 + learnedRate) ? 'learned'
        : 'failure';
      const affinityTag = (formAff && hasSecondAffinity) ? ' [フォーム+緩急適性]'
        : formAff ? ' [フォーム適性]'
        : hasSecondAffinity ? ' [緩急適性]'
        : '';
      if (outcome === 'failure') {
        growthReport.push({
          stat: 'newpitch',
          statName: `${getPitchTypeName(targetType)}習得失敗${affinityTag}`,
          before: 0, after: 0, growth: 0, isAwakening: false
        });
      } else {
        const newId = arsenal.length > 0 ? Math.max(...arsenal.map(a => a.id)) + 1 : 1;
        let startLevel, label;
        if (outcome === 'awakening') {
          startLevel = Math.floor(Math.random() * 20) + 61;
          label = '(覚醒!!)';
        } else if (outcome === 'great_success') {
          startLevel = Math.floor(Math.random() * 20) + 41;
          label = '(大成功!)';
        } else if (outcome === 'success') {
          startLevel = Math.floor(Math.random() * 20) + 21;
          label = '';
        } else {
          startLevel = Math.floor(Math.random() * 20) + 1;
          label = '';
        }
        arsenal.push({ id: newId, type: targetType, level: startLevel });
        updatedPlayer.pitching.arsenal = arsenal;
        // 球種構成が変わったので第2適性を動的に再計算
        updatedPlayer.pitching.secondAffinity = calcSecondAffinity(arsenal);
        growthReport.push({
          stat: 'newpitch',
          statName: `${getPitchTypeName(targetType)}習得${label}${affinityTag}`,
          before: 0, after: startLevel, growth: startLevel, isAwakening: outcome === 'awakening'
        });
      }
    } else {
      growthReport.push({
        stat: 'newpitch',
        statName: '習得失敗（全球種習得済み）',
        before: 0, after: 0, growth: 0, isAwakening: false
      });
    }
    return { player: updatedPlayer, growthReport };
  }

  // 成長停止年齢: gp(個人差) + 疲労管理(growthModifier) + プロ意識で延長
  // 停止後もdisciplineが高ければ練習で微量カバー可能
  const _gp = player.growthPotential ?? 1.0;
  const _growthMod = player.growthModifier || 0;
  const _discipline = player.personality?.discipline ?? 50;
  const _stopAge = Math.min(32, Math.max(22,
    Math.round(26 + (_gp - 1.0) * 15)
    + Math.min(2, Math.max(0, _growthMod * 5))              // 疲労管理: 良管理で最大+2歳
    + Math.min(2, Math.max(0, (_discipline - 60) * 0.05))   // プロ意識80→+1, 100→+2歳
  ));
  // stopAge到達後: discipline次第で衰えをカバー（discipline 50→0%, 80→9%, 100→15%）
  const _postStopFloor = Math.max(0, (_discipline - 50) * 0.003);
  // stopAge4年前から緩やかに減衰 → 停止後はpostStopFloorのみ
  const stopAgeGate = age >= _stopAge
    ? _postStopFloor
    : Math.max(_postStopFloor, 1.0 - Math.max(0, age - (_stopAge - 4)) / 4 * (1.0 - _postStopFloor));

  // 通常の能力練習（成長量抑制: プロ級へ到達しにくくする）
  menu.targets.forEach((targetStat, targetIdx) => {
    const isPhysical = PHYSICAL_STATS.includes(targetStat);
    const ageBase = getAgeGrowthBase(age, isPhysical);
    const ageMultiplier = Math.max(0.3, 1.0 + ageBase * 0.10);
    const posBonus = getPositionGrowthBonus(player, targetStat);
    const boBonus = getBattingOrderGrowthBonus(player, targetStat);
    const expBonus = posBonus * boBonus;

    // 技術系は経験で伸びる、フィジカル系は若さで伸びる
    let aptitudeFactor = 1.0;
    if (isPhysical) {
      // フィジカル: 若いほど鍛えやすい
      if (age <= 20) aptitudeFactor = 1.3;
      else if (age <= 23) aptitudeFactor = 1.1;
      else if (age <= 26) aptitudeFactor = 1.0;
      else if (age <= 29) aptitudeFactor = 0.8;
      else aptitudeFactor = 0.6;
    } else {
      // 技術系: 経験で伸びる。初年度でも基本練習の効果が出るよう最低1.0に設定
      // 旧0.7スタートは他の掛け算(0.14×discipline等)と組み合わさって常に0になっていた
      aptitudeFactor = Math.min(1.2, 1.0 + (experience / 300));
    }

    // 才能依存の能力は練習だけでは伸びにくい（グローバル補正）
    const TALENT_STAT_MULTIPLIERS = {
      arm: 0.5,       // 肩力: 生まれ持った体格に依存
      speed: 0.6,     // 走力: 先天的な筋繊維に依存
      power: 0.8,     // パワー: 体幹トレーニングで伸びる余地あり
      velocity: 0.8,  // 球速: フォーム改善等で伸びる余地あり
    };
    const talentMult = TALENT_STAT_MULTIPLIERS[targetStat] ?? 1.0;

    // 体幹/器用さによる成長方向の補正（0.5〜1.5倍）
    const MUSCLE_STATS = ['power', 'arm', 'speed', 'velocity', 'bodyStamina'];
    const DEXTERITY_STATS = ['meet', 'eye', 'defense', 'control', 'steal', 'bunt'];
    const muscle = player.physical?.muscle ?? 50;
    const dexterity = player.physical?.dexterity ?? 50;
    let physiqueMult = 1.0;
    if (MUSCLE_STATS.includes(targetStat)) {
      physiqueMult = 0.5 + (muscle / 100) * 1.0;
    } else if (DEXTERITY_STATS.includes(targetStat)) {
      physiqueMult = 0.5 + (dexterity / 100) * 1.0;
    }
    // プロ意識による練習効率（プロ意識0=50%, 50=100%, 100=150%）
    const discipline = player.personality?.discipline ?? 50;
    const disciplineMult = 0.5 + (discipline / 100) * 1.0;
    // 成長率のキャンプ影響（30%: 成長率1.4→1.12倍, 0.6→0.88倍）
    const potential = Math.max(0.3, Math.min(1.8, (player.growthPotential ?? 1.0) + (player.growthModifier || 0)));
    const campPotMult = 0.7 + 0.3 * potential;

    let baseGrowth, isAwakening, awakeningGrowth;

    if (menu.intensive && menu.penaltyPool) {
      // 集中練習＝「長所を伸ばす」の実体。
      // ⚠ 以前はここが **+1確定・50%で+1〜2 の固定値**で、年齢・プロ意識・
      //    コーチ・成長力・体格をすべて**素通り**していた。1クールあたり約1.75しか
      //    入らないのに他能力に減点が付くので、**どの水準の選手でも
      //    「満遍なく」に負ける**（実測 ドラフト評価 211 対 230）。
      //    集中する意味が数字の上で一度も無かった。
      // 通常メニューと同じ式で出してから1点に集約する。これで
      //   ・能力が低い（減衰なし）→ 集中が満額入って一芸が作れる
      //   ・能力が高い（75以上で4%/pt減衰）→ 集中しても伸びず、満遍なくが勝つ
      // という反転が**既存の減衰カーブだけで**成立する（新しい係数を作らない）。
      const rawBase = (Math.floor(Math.random() * 3) + 1) * ageMultiplier * expBonus;
      const rawFocus = (Math.floor(Math.random() * 4) + 1) * ageMultiplier * expBonus;
      baseGrowth = Math.round((rawBase + rawFocus) * 0.14 * INTENSIVE_FOCUS
        * talentMult * aptitudeFactor * physiqueMult * disciplineMult
        * campPotMult * coachingMult * (isPhysical ? fitnessMult : 1.0) * stopAgeGate);
      isAwakening = false;
      awakeningGrowth = 0;
    } else {
      const rawBase = (Math.floor(Math.random() * 3) + 1) * ageMultiplier * expBonus;
      const rawFocus = (Math.floor(Math.random() * 4) + 1) * ageMultiplier * expBonus;
      const statMultiplier = menu.growthMultipliers?.[targetStat] ?? 1.0;
      const physFitMult = isPhysical ? fitnessMult : 1.0;
      const battCoachMult = targetStat === 'control' ? batteryMult : 1.0;
      baseGrowth = Math.round((rawBase + rawFocus) * 0.14 * statMultiplier * talentMult * aptitudeFactor * physiqueMult * disciplineMult * campPotMult * coachingMult * physFitMult * battCoachMult * stopAgeGate);
      if ((targetStat === 'stamina' || targetStat === 'bodyStamina') && baseGrowth < 1) baseGrowth = 1;
      // 覚醒判定（経験値 × プロ意識の相乗効果）
      // discipline < 30: 努力しない選手は飛躍しない（係数0）
      // discipline = 50: 標準(1.0倍), 70→2.0倍, 100→2.5倍（上限）
      const awakeningDisciplineFactor = discipline < 30
        ? 0
        : Math.min(2.5, (discipline - 30) / 20);
      const awakeningChance = experience >= 30
        ? Math.floor(experience / 15) * awakeningMult * awakeningDisciplineFactor
        : 0;
      isAwakening = awakeningMult > 0 && Math.random() * 100 < awakeningChance;
      // 才能依存の能力は覚醒量も抑制
      const rawAwakening = isAwakening ? Math.floor(Math.random() * 4) + 3 : 0;
      awakeningGrowth = isAwakening ? Math.max(1, Math.round(rawAwakening * talentMult)) : 0;
    }

    const statPath = getStatPath(targetStat);
    if (statPath) {
      const currentValue = getNestedValue(updatedPlayer, statPath) ?? 0;

      // フォーム別成長補正（オーバー→球速伸びやすい、アンダー→制球伸びやすい）
      const formEffect = PITCHING_FORM_EFFECTS[updatedPlayer.pitching?.form] || PITCHING_FORM_EFFECTS.threeQuarter;
      let formAdjustedGrowth = baseGrowth;
      if (targetStat === 'velocity' && formEffect.velocityGrowthMult !== 1.0) {
        formAdjustedGrowth = Math.round(baseGrowth * formEffect.velocityGrowthMult);
      } else if (targetStat === 'control' && formEffect.controlGrowthMult !== 1.0) {
        formAdjustedGrowth = Math.round(baseGrowth * formEffect.controlGrowthMult);
      }

      // 肩力ポテンシャルとのギャップによるキャッチアップ（球速のみ）
      if (targetStat === 'velocity') {
        const armVal = getNestedValue(updatedPlayer, getStatPath('arm')) || 50;
        formAdjustedGrowth = Math.round(formAdjustedGrowth * getVelocityCatchupMult(armVal, currentValue));
      }

      // 高能力値の成長減衰（覚醒分は減衰しない）
      let adjustedBaseGrowth = formAdjustedGrowth;
      if (targetStat === 'velocity') {
        // 球速155km以上は伸びにくくなる（超過1kmごとに成長量20%減衰）
        if (currentValue >= 155) {
          const overAmount = currentValue - 155;
          const dampFactor = Math.max(0.1, 1.0 - overAmount * 0.2);
          adjustedBaseGrowth = Math.max(0, Math.round(baseGrowth * dampFactor));
        }
      } else if (isPhysical) {
        // フィジカル系(speed/arm/stamina/bodyStamina/recovery): 能力値80以上で成長減衰（超過1ごとに3%減衰）
        if (currentValue >= 80) {
          const overAmount = currentValue - 80;
          const dampFactor = Math.max(0.1, 1.0 - overAmount * 0.03);
          adjustedBaseGrowth = Math.max(0, Math.round(baseGrowth * dampFactor));
        }
      } else {
        // 技術系(meet/power/eye/control/defense/steal): 能力値75以上で成長減衰
        // 超過1ごとに4%減衰、下限15%
        if (currentValue >= 75) {
          const overAmount = currentValue - 75;
          const dampFactor = Math.max(0.15, 1.0 - overAmount * 0.04);
          adjustedBaseGrowth = Math.max(0, Math.round(baseGrowth * dampFactor));
        }
      }

      let totalGrowth = Math.max(0, adjustedBaseGrowth + awakeningGrowth);
      // 主対象能力（targets[0]）は最低+1を保証（投手が打撃練習、野手が球速練習でも必ず効果が出る）
      if (targetIdx === 0 && totalGrowth < 1 && !menu.intensive) totalGrowth = 1;
      if ((targetStat === 'stamina' || targetStat === 'bodyStamina') && totalGrowth < 1) totalGrowth = 1;
      if (targetStat === 'defense' && totalGrowth < 1) totalGrowth = 1;
      const armForCap = getNestedValue(updatedPlayer, getStatPath('arm')) || 50;
      const maxValue = targetStat === 'velocity' ? getVelocityCap(armForCap) : targetStat === 'stamina' ? 200 : 100;
      const newValue = Math.min(maxValue, currentValue + totalGrowth);
      updatedPlayer = setNestedValue(updatedPlayer, statPath, newValue);
      growthReport.push({
        stat: targetStat,
        statName: getStatName(targetStat),
        before: currentValue, after: newValue,
        growth: newValue - currentValue, isAwakening
      });

      // 球速⇔肩力の連動
      if (targetStat === 'velocity' && newValue !== currentValue) {
        // 球速変動→肩力50%連動
        const armChange = Math.round((newValue - currentValue) * 0.5);
        if (armChange !== 0) {
          const armPath = getStatPath('arm');
          const currentArm = getNestedValue(updatedPlayer, armPath) || 50;
          const newArm = Math.max(1, Math.min(99, currentArm + armChange));
          if (newArm !== currentArm) {
            updatedPlayer = setNestedValue(updatedPlayer, armPath, newArm);
            growthReport.push({ stat: 'arm', statName: getStatName('arm'), before: currentArm, after: newArm, growth: newArm - currentArm, isAwakening: false, isLinked: true });
          }
        }
      }
      // 肩力→球速の連動はサブ練習「遠投」(long_throw)で処理。メイン練習では肩力のみ成長
    }
  });

  // 集中練習のペナルティ処理: 50%で±0、25%で1能力-1、25%で2能力-1
  if (menu.intensive && menu.penaltyPool) {
    const pool = menu.penaltyPool.filter(s => !menu.targets.includes(s));
    const roll = Math.random();
    const penaltyCount = roll < 0.5 ? 0 : roll < 0.75 ? 1 : 2;
    if (penaltyCount > 0 && pool.length > 0) {
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      const chosen = shuffled.slice(0, Math.min(penaltyCount, shuffled.length));
      chosen.forEach(penaltyStat => {
        const penaltyPath = getStatPath(penaltyStat);
        if (penaltyPath) {
          const currentVal = getNestedValue(updatedPlayer, penaltyPath) || 50;
          const newVal = Math.max(1, currentVal - 1);
          updatedPlayer = setNestedValue(updatedPlayer, penaltyPath, newVal);
          growthReport.push({
            stat: penaltyStat,
            statName: getStatName(penaltyStat),
            before: currentVal, after: newVal,
            growth: newVal - currentVal, isAwakening: false, isPenalty: true
          });
        }
      });
    }
  }

  // ノック: 現在ポジションの適正を確定で+4〜8（野手のみ）
  if (trainingType === 'fielding' && updatedPlayer.position !== 'pitcher' && updatedPlayer.positionFitness) {
    const curPos = updatedPlayer.position;
    const curFit = updatedPlayer.positionFitness[curPos] || 0;
    if (curFit < 100) {
      const gain = Math.floor(Math.random() * 5) + 4;
      const newFit = Math.min(100, curFit + gain);
      updatedPlayer.positionFitness[curPos] = newFit;
      growthReport.push({
        stat: 'positionFitness',
        statName: `${POSITION_NAMES_MAP[curPos] || curPos}適正`,
        before: curFit, after: newFit, growth: newFit - curFit, isAwakening: false
      });
    }
  }

  // 経験値を消費（練習に使った分の一部をリセット）
  updatedPlayer.experience = Math.floor(experience * 0.3);
  updatedPlayer.positionExperience = {};
  updatedPlayer.battingOrderExperience = {};

  return { player: updatedPlayer, growthReport };
}

// getPitchTypeName は utils/constants.js（BALL_EFFECTS が出典）から取り込んで再輸出する
export { ALL_PITCH_TYPES, getPitchTypeName, FORM_PITCH_AFFINITY };

/**
 * チーム全体のキャンプ練習を実行
 * @param {Object} team - チームデータ
 * @param {Object} trainingAssignments - { playerId: trainingType } の形式
 * @param {Object} [newPitchSelections] - { playerId: pitchType } 新球種選択
 * @returns {Object} - { updatedTeam, allReports }
 */
/**
 * スタッフのモチベーション管理が選手のプロ意識に影響（キャンプ1クールごと）
 * motivation 0→変化なし, 50→+0~1, 100→+1~2（1クールあたり）
 */
export function applyMotivationEffect(players, staffBonus) {
  if (!staffBonus) return [];
  const motivation = staffBonus.motivation || 0;
  if (motivation < 20) return [];

  const reports = [];
  const baseChance = motivation / 100;

  players.forEach(p => {
    if (!p.personality) return;
    const current = p.personality.discipline ?? 50;
    if (current >= 95) return;
    if (Math.random() < baseChance) {
      const gain = motivation >= 70 ? (Math.random() < 0.4 ? 2 : 1) : 1;
      const newVal = Math.min(99, current + gain);
      p.personality.discipline = newVal;
      if (gain > 0) {
        reports.push({ name: p.name, before: current, after: newVal, gain });
      }
    }
  });
  return reports;
}

/**
 * バッテリー指導が投手・捕手の精神力に影響（キャンプ1クールごと）
 * batteryCoach 0→変化なし, 50→+0~1, 100→+1~2
 */
export function applyBatteryMentalEffect(players, staffBonus) {
  if (!staffBonus) return [];
  const battery = staffBonus.batteryCoach || 0;
  if (battery < 20) return [];

  const reports = [];
  const baseChance = battery / 100;

  players.forEach(p => {
    if (p.position !== 'pitcher' && p.position !== 'catcher') return;
    if (!p.personality) return;
    const current = p.personality.mental ?? 50;
    if (current >= 95) return;
    if (Math.random() < baseChance) {
      const gain = battery >= 70 ? (Math.random() < 0.4 ? 2 : 1) : 1;
      const newVal = Math.min(99, current + gain);
      p.personality.mental = newVal;
      if (gain > 0) {
        reports.push({ name: p.name, before: current, after: newVal, gain });
      }
    }
  });
  return reports;
}

export function executeTeamCampTraining(team, trainingAssignments, newPitchSelections = {}, staffBonus = null, awakeningMult = 1.0) {
  const allReports = [];
  const updatedPlayers = team.players.map(player => {
    const trainingType = trainingAssignments[player.id];
    if (!trainingType) {
      const autoTraining = player.position === 'pitcher' ? 'control' : 'batting';
      const { player: trained, growthReport } = executeCampTraining(player, autoTraining, undefined, staffBonus, awakeningMult);
      allReports.push({ player: trained, trainingType: autoTraining, growthReport });
      return trained;
    }

    const newPitchType = trainingType === 'newpitch' ? newPitchSelections[player.id] : undefined;
    const { player: trained, growthReport } = executeCampTraining(player, trainingType, newPitchType, staffBonus, awakeningMult);
    allReports.push({ player: trained, trainingType, growthReport });
    return trained;
  });

  return {
    updatedTeam: { ...team, players: updatedPlayers },
    allReports
  };
}
