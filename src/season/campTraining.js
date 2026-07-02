// ============================================================
// キャンプ練習システム
// メイン練習・サブ練習・チーム一括実行
// ============================================================

import { PHYSICAL_STATS, getAgeGrowthBase, getStatPath, getStatName, getNestedValue, setNestedValue } from './growthUtils.js';
import { PITCHING_FORM_EFFECTS } from '../utils/constants.js';
import { syncPositionToFitness, getVelocityCap, getVelocityCatchupMult } from '../utils/physics.js';

// 練習カテゴリ → スタッフ指導能力のマッピング
const CATEGORY_TO_STAFF_ABILITY = {
  batting: 'battingCoach',
  fielding: 'fieldRunCoach',
  pitching: 'pitchingCoach',
};


/**
 * 練習メニュー定義
 * 各練習メニューは特定の能力値を成長させる
 */
export const TRAINING_MENUS = {
  batting: {
    name: '打撃練習',
    icon: '🏏',
    description: 'ミートを強化、パワー・選球眼・バントを微増',
    targets: ['meet', 'power', 'eye', 'bunt'],
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
    growthMultipliers: { speed: 1.5, bunt: 0.5 },
    category: 'batting'
  },
  fielding: {
    name: '守備練習',
    icon: '🧤',
    description: '守備力と肩力を強化（投手野手共通）',
    targets: ['defense', 'arm'],
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
    icon: '⚡',
    description: '球速を強化（投手のみ）',
    targets: ['velocity'],
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
  running: {
    name: 'ランニング',
    icon: '🏃',
    description: '走力+体力UP（投手はスタミナも強化）',
    targets: ['speed', 'stamina', 'bodyStamina_sub'],
  },
  muscle: {
    name: '筋トレ',
    icon: '💪',
    description: 'パワー/肩力/走力のいずれか微増',
    targets: ['power', 'arm', 'speed'],
  },
  stretch: {
    name: 'ストレッチ',
    icon: '🧘',
    description: '怪我予防・回復力UP・全能力微増',
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
    description: '投球フォーム変更に挑戦（成功20%/失敗で制球低下）',
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
    description: '変化球レベルを強化（投手のみ）',
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
 * @param {Object} options - オプション { targetPosition, targetForm, targetBats }
 */
export function executeSubTraining(player, subType, options = {}, staffBonus = null) {
  const menu = SUB_TRAINING_MENUS[subType];
  if (!menu) return { player, growthReport: [] };

  const growthReport = [];
  const growthAmount = () => Math.random() < 0.4 ? (Math.random() < 0.3 ? 2 : 1) : 0;

  switch (subType) {
    case 'running': {
      const spd = growthAmount();
      if (spd > 0 && player.physical) {
        player.physical.speed = Math.min(100, (player.physical.speed || 50) + spd);
        growthReport.push({ statName: '走力', before: player.physical.speed - spd, after: player.physical.speed, growth: spd });
      }
      // 投手スタミナ: サブ練習標準確率（40%で+1、そのうち30%で+2）
      if (player.position === 'pitcher' && player.pitching) {
        const stmGain = growthAmount();
        if (stmGain > 0) {
          const before = player.pitching.stamina || 80;
          player.pitching.stamina = Math.min(200, before + stmGain);
          growthReport.push({ statName: 'スタミナ', before, after: player.pitching.stamina, growth: stmGain });
        }
      }
      // 体力UP（100%で+1〜4）
      if (player.physical) {
        const bsBefore = player.physical.bodyStamina || 50;
        const bsGrowth = Math.floor(Math.random() * 4) + 1; // 1〜4
        player.physical.bodyStamina = Math.min(99, bsBefore + bsGrowth);
        growthReport.push({ statName: '体力', before: bsBefore, after: player.physical.bodyStamina, growth: bsGrowth });
      }
      break;
    }
    case 'muscle': {
      // パワー/肩力/走力のいずれか1つをランダムに強化（+0〜2）
      // パワー特化を緩和し、打撃練習との重ね掛けによるパワーヒッター量産を抑制
      const statChoices = ['power', 'arm', 'speed'];
      const chosenStat = statChoices[Math.floor(Math.random() * statChoices.length)];
      const gainRaw = growthAmount();
      if (gainRaw > 0) {
        if (chosenStat === 'power' && player.batting) {
          const oldPwr = player.batting.power || 50;
          const pwr = applyTechStatDecay(oldPwr, gainRaw);
          if (pwr > 0) {
            player.batting.power = Math.min(100, oldPwr + pwr);
            growthReport.push({ statName: 'パワー', before: oldPwr, after: player.batting.power, growth: pwr });
          }
        } else if (chosenStat === 'arm' && player.physical) {
          const oldArm = player.physical.arm || 50;
          player.physical.arm = Math.min(100, oldArm + gainRaw);
          growthReport.push({ statName: '肩力', before: oldArm, after: player.physical.arm, growth: gainRaw });
        } else if (chosenStat === 'speed' && player.physical) {
          const oldSpd = player.physical.speed || 50;
          player.physical.speed = Math.min(100, oldSpd + gainRaw);
          growthReport.push({ statName: '走力', before: oldSpd, after: player.physical.speed, growth: gainRaw });
        }
      }
      break;
    }
    case 'stretch': {
      // ランダムに1能力を選んで確定+1、回復は30%で+1
      const stats = [
        { key: 'batting.meet', name: 'ミート', isTech: true },
        { key: 'batting.power', name: 'パワー', isTech: true },
        { key: 'physical.speed', name: '走力', isTech: false },
        { key: 'physical.arm', name: '肩力', isTech: false },
        { key: 'fielding.defense', name: '守備', isTech: true },
      ];
      const picked = stats[Math.floor(Math.random() * stats.length)];
      const [obj, prop] = picked.key.split('.');
      if (player[obj]) {
        const old = player[obj][prop] || 50;
        const gain = picked.isTech ? applyTechStatDecay(old, 1) : 1;
        if (gain > 0) {
          player[obj][prop] = Math.min(100, old + gain);
          growthReport.push({ statName: picked.name, before: old, after: old + gain, growth: gain });
          if (picked.key === 'physical.arm' && player.position !== 'pitcher') {
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
      // 守備適正も微増
      if (player.positionFitness && Math.random() < 0.3) {
        const positions = Object.keys(player.positionFitness);
        const weakPos = positions.filter(p => (player.positionFitness[p] || 0) < 70);
        if (weakPos.length > 0) {
          const pos = weakPos[Math.floor(Math.random() * weakPos.length)];
          const old = player.positionFitness[pos] || 0;
          player.positionFitness[pos] = Math.min(100, old + 3);
          growthReport.push({ statName: `${POSITION_NAMES_MAP[pos] || pos}適正`, before: old, after: old + 3, growth: 3 });
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
        // ハイリスクハイリターン: 20%で成功、成功時は制球+球速ボーナス、失敗時は制球低下
        if (Math.random() < 0.20) {
          player.pitching.form = targetForm;
          growthReport.push({ statName: 'フォーム', before: FORM_NAMES[currentForm], after: FORM_NAMES[targetForm], growth: 0, isAwakening: true });
          // 成功ボーナス: 制球+3~5
          const bonus = Math.floor(Math.random() * 3) + 3;
          const oldCtrl = player.pitching.control || 50;
          player.pitching.control = oldCtrl + bonus;
          growthReport.push({ statName: '制球', before: oldCtrl, after: player.pitching.control, growth: bonus });
        } else {
          growthReport.push({ statName: 'フォーム改造', before: FORM_NAMES[currentForm], after: '変更失敗', growth: 0 });
          // 失敗ペナルティ: 制球-1~3
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
      // 変化球練習（サブ練習版）- フォーム適性で成長ボーナス + バッテリー指導補正
      if (player.position === 'pitcher' && player.pitching) {
        const arsenal = player.pitching?.arsenal || [];
        const nonStraight = arsenal.filter(p => p.type !== 'straight');
        const playerForm = player.pitching?.form;
        const battVal = staffBonus ? (staffBonus.batteryCoach || 50) : 50;
        const battMult = 0.9 + (battVal / 100) * 0.2;
        if (nonStraight.length > 0) {
          nonStraight.forEach(pitch => {
            const age = player.age || 20;
            const ageBase = getAgeGrowthBase(age, false);
            const ageMultiplier = Math.max(0.3, 1.0 + ageBase * 0.15);
            const formAff = getFormPitchAffinity(playerForm, pitch.type);
            const formMult = formAff ? formAff.growth : 1.0;
            const dext = player.physical?.dexterity ?? 50;
            const dextMult = 0.5 + (dext / 100) * 1.0;
            const rawGrowth = (Math.floor(Math.random() * 3) + 1 + Math.floor(Math.random() * 4) + 1) * ageMultiplier;
            const growth = Math.max(1, Math.round(rawGrowth * 0.167 * formMult * dextMult * battMult));
            const before = pitch.level;
            pitch.level = before + growth;
            const affinityTag = formAff ? ' [適性]' : '';
            growthReport.push({ statName: `${getPitchTypeName(pitch.type)}${affinityTag}`, before, after: pitch.level, growth: pitch.level - before });
          });
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
        const armRaw = Math.random() < 0.5 ? (Math.random() < 0.35 ? 3 : Math.random() < 0.5 ? 2 : 1) : (Math.random() < 0.3 ? 1 : 0);
        if (armRaw > 0) {
          const oldArm = player.physical.arm || 50;
          const armGain = Math.min(armRaw, 100 - oldArm);
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
    const targetType = newPitchType || ALL_PITCH_TYPES.find(t => !existingTypes.includes(t));
    if (targetType && !existingTypes.includes(targetType)) {
      // フォーム適性ボーナス（適性球種は失敗率が下がる）
      const formAff = getFormPitchAffinity(updatedPlayer.pitching?.form, targetType);
      const affinityBonus = formAff ? formAff.affinity : 0;
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
      const affinityTag = formAff ? ' [適性]' : '';
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
      // 技術系: 経験が生きる
      aptitudeFactor = Math.min(1.2, 0.7 + (experience / 300));
    }

    // 才能依存の能力は練習だけでは伸びにくい（グローバル補正）
    const TALENT_STAT_MULTIPLIERS = {
      arm: 0.5,       // 肩力: 生まれ持った体格に依存
      speed: 0.6,     // 走力: 先天的な筋繊維に依存
      power: 0.8,     // パワー: 筋力トレーニングで伸びる余地あり
      velocity: 0.8,  // 球速: フォーム改善等で伸びる余地あり
    };
    const talentMult = TALENT_STAT_MULTIPLIERS[targetStat] ?? 1.0;

    // 筋力/器用さによる成長方向の補正（0.5〜1.5倍）
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
      // 集中練習: +1確定、50%で+1〜2上乗せ
      const bonus = Math.random() < 0.5 ? (Math.floor(Math.random() * 2) + 1) : 0;
      baseGrowth = 1 + bonus;
      isAwakening = false;
      awakeningGrowth = 0;
    } else {
      const rawBase = (Math.floor(Math.random() * 3) + 1) * ageMultiplier * expBonus;
      const rawFocus = (Math.floor(Math.random() * 4) + 1) * ageMultiplier * expBonus;
      const statMultiplier = menu.growthMultipliers?.[targetStat] ?? 1.0;
      const physFitMult = isPhysical ? fitnessMult : 1.0;
      const battCoachMult = targetStat === 'control' ? batteryMult : 1.0;
      baseGrowth = Math.round((rawBase + rawFocus) * 0.14 * statMultiplier * talentMult * aptitudeFactor * physiqueMult * disciplineMult * campPotMult * coachingMult * physFitMult * battCoachMult);
      if ((targetStat === 'stamina' || targetStat === 'bodyStamina') && baseGrowth < 1) baseGrowth = 1;
      // 覚醒判定（経験値依存、プロ経験浅い選手は覚醒しにくい）
      const awakeningChance = experience >= 30 ? Math.floor(experience / 15) * awakeningMult : 0;
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
      // 主対象能力（targets[0]）は最低+1を保証（クロスポジション練習でも効果が出る）
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

  // 経験値を消費（練習に使った分の一部をリセット）
  updatedPlayer.experience = Math.floor(experience * 0.3);
  updatedPlayer.positionExperience = {};
  updatedPlayer.battingOrderExperience = {};

  return { player: updatedPlayer, growthReport };
}

/**
 * 球種名を取得
 */
function getPitchTypeName(type) {
  const names = {
    straight: 'ストレート', slider: 'スライダー', curve: 'カーブ',
    fork: 'フォーク', changeup: 'チェンジアップ', sinker: 'シンカー',
    shoot: 'シュート', cutter: 'カッター', splitter: 'スプリッター',
    twoSeam: 'ツーシーム', palm: 'パーム', knuckle: 'ナックル'
  };
  return names[type] || type;
}
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
