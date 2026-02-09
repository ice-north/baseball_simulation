// ============================================================
// 試合ロジック - simulation-logic.js
// 野球シミュレーションの物理計算と判定ロジック
// ============================================================
import { PITCHING_FORM_EFFECTS } from './utils/constants.js';

/**
 * 物理衝突モデルによるコンタクト計算
 * @param {Object} pitcher - 投手データ（velocity必須）
 * @param {Object} batter - 打者データ（power, meet必須）
 * @param {boolean} isGuessRight - 球種予測が的中したか
 * @param {Object} pitch - 投球データ（type, level, velocity）
 * @param {number} tunnelingEffect - トンネリング効果（0-0.2程度）
 * @param {Object} handEffect - 左右相性効果
 */
export const calculatePhysicsContact = (pitcher, batter, isGuessRight, pitch, tunnelingEffect = 0, handEffect = {}) => {
  // 【1】スイングスピードの算出 (Powerを物理量へ)
  // Power 0 → 100km/h, Power 100 → 140km/h
  let v_swing = 100 + (batter.power * 0.4);

  // 左右相性でスイングスピード微調整
  if (handEffect.powerBonus) {
    v_swing += handEffect.powerBonus * 0.3;
  }

  // 【2】タイミング・ウィンドウ (ms)
  const pitchVelocity = pitch.velocity || pitcher.velocity;

  // ★修正: 係数は投手の「素の球速」で決定（変化球の減速を無視）
  const basePitcherVelocity = pitcher.velocity;
  let windowCoef;
  if (basePitcherVelocity >= 155) {
    windowCoef = 0.20;
  } else if (basePitcherVelocity >= 150) {
    windowCoef = 0.26;
  } else if (basePitcherVelocity >= 145) {
    windowCoef = 0.32;
  } else {
    windowCoef = 0.38;
  }

  // 窓の計算は実際の球速で（速い変化球は打ちにくい）
  let timingWindow = (1000 / (pitchVelocity / 3.6)) * windowCoef;

  // ミート窓ボーナス（ミート力が高いと窓が広がる）
  const meetBonus = (batter.meet / 100) * 0.20;  // 最大+20%（打率+0.5割相当の強化）
  timingWindow *= (1 + meetBonus);

  // 読みが当たれば窓が広がる（準備ができている）
  if (isGuessRight) {
    timingWindow *= 1.3;  // ×1.3
  }

  // トンネリング効果で窓が狭まる（錯覚で準備が遅れる）
  timingWindow *= (1 - tunnelingEffect * 0.3);  // 30%

  // 変化球はさらに窓を狭める（軌道予測が難しい、レベルが高いほど曲がる）
  if (pitch.type !== 'straight' && pitch.level) {
    const breakingBallPenalty = (pitch.level / 100) * 0.18;  // 18%（強化: 旧10%）
    timingWindow *= (1 - breakingBallPenalty);
  }

  // 投球フォームの効果を適用（サイドスロー・アンダースローは同じ利き腕の打者に強い）
  const pitchingFormEffect = PITCHING_FORM_EFFECTS[pitcher.form] || PITCHING_FORM_EFFECTS.threeQuarter;
  if (pitchingFormEffect.whiffBonus > 0) {
    // サイドスロー・アンダースローの空振りボーナスは同じ利き腕の打者に対してのみ適用
    // 例: 左サイドスローは左打者に強い、右アンダースローは右打者に強い
    // スイッチヒッターは常に投手と逆の打席に立つため影響を受けない
    const isSameHandedness = (pitcher.throws === 'right' && batter.bats === 'right') ||
                              (pitcher.throws === 'left' && batter.bats === 'left');

    if (isSameHandedness) {
      timingWindow *= (1 - pitchingFormEffect.whiffBonus);  // フォームによる空振りボーナス
    }
  }

  // 【3】スイングの誤差発生 (ミリ秒単位)
  // 打者のmeet値が高いほど、誤差のバラツキが抑えられる
  // Meet 0 → ±10ms, Meet 100 → ±5ms
  const maxError = 10 - (batter.meet * 0.055);  // ±10～4.5ms（ミート強化）

  // 左右相性でミート精度調整
  const meetAdjust = (handEffect.meetBonus || handEffect.meetPenalty || 0) * 0.02;
  const adjustedMaxError = Math.max(1.5, maxError - meetAdjust);  // 最小1.5ms

  const timingError = (Math.random() - 0.5) * 2 * adjustedMaxError;

  // 【4】芯へのミート率 (0.0 ～ 1.0)
  // タイミング誤差がウィンドウ内なら高品質コンタクト
  let meetQuality = Math.max(0, 1 - Math.abs(timingError) / timingWindow);

  // 【5】空振り判定
  // meetQuality が 0.02 以下の時のみ空振り
  const isContact = meetQuality > 0.02;  // 空振り閾値

  // 【6】打球初速の計算 (物理衝突モデル - 修正版)
  // MLB平均Exit Velocity: 約140km/h (88mph)
  // 最大Exit Velocity: 約190km/h (120mph) - 極めて稀
  // ミート品質と打者パワーで決定
  let exitVelocity = 0;
  if (isContact) {
    // 基本初速: パワーに強く依存（80-110km/h）
    const baseVelocity = 80 + (batter.power * 0.30);

    // ミート品質ボーナス: 最大+50km/h（芯を捉えた時）
    const qualityBonus = meetQuality * 50;

    // 投球速度の反発ボーナス: 最大+15km/h
    const pitchBonus = (pitchVelocity - 130) * 0.25;

    exitVelocity = baseVelocity + qualityBonus + pitchBonus;

    // ランダム要素（±5km/h）
    exitVelocity += (Math.random() * 10 - 5);

    // 現実的な範囲に制限: 70-180km/h
    exitVelocity = Math.max(70, Math.min(180, exitVelocity));
  }

  return {
    isContact,
    exitVelocity: Math.round(exitVelocity),
    meetQuality,
    timingError: Math.round(timingError * 10) / 10,
    timingWindow: Math.round(timingWindow * 10) / 10,
    v_swing: Math.round(v_swing)
  };
};

/**
 * トンネリング（軌道錯覚）効果の計算
 * 前球との軌道・速度の連動性が打者のタイミングに影響
 */
export const getTunnelingEffect = (lastPitch, currentPitch, catcherLead) => {
  if (!lastPitch) return 0;

  // 球速差による錯覚効果
  const veloDiff = Math.abs(lastPitch.velocity - currentPitch.velocity);

  // 球種の軌道近似性（ストレートから変化球への切り替えが効果的）
  const orbitCloseness = (lastPitch.type === 'straight' && currentPitch.type !== 'straight') ? 0.8 :
                        (lastPitch.type !== 'straight' && currentPitch.type === 'straight') ? 0.6 : 0.2;

  // 捕手のリードが高いほど効果増大
  const leadMultiplier = 1 + (catcherLead / 100);

  return Math.min(0.25, (veloDiff * 0.003 + orbitCloseness * 0.025) * leadMultiplier);
};

/**
 * 打出し角度の計算（コンタクト品質から）
 */
export const calculateLaunchAngle = (meetQuality, batter) => {
  let baseLaunchAngle;

  if (meetQuality > 0.8) {
    // 完璧なコンタクト: バレルゾーン（25-35度）
    baseLaunchAngle = 25 + Math.random() * 10;
  } else if (meetQuality > 0.6) {
    // 高品質: ライナー〜適正フライ（10-40度）
    baseLaunchAngle = 10 + Math.random() * 30;
  } else if (meetQuality > 0.4) {
    // 中品質: 幅広い分布（-5〜50度）
    baseLaunchAngle = -5 + Math.random() * 55;
  } else {
    // 低品質: ポップフライかボテボテ
    if (Math.random() < 0.5) {
      baseLaunchAngle = -15 + Math.random() * 20;  // ボテボテゴロ
    } else {
      baseLaunchAngle = 55 + Math.random() * 30;  // ポップフライ
    }
  }

  // パワー打者は角度がつきやすい傾向
  const powerAngleBonus = (batter.power - 60) / 100 * 5;

  return Math.round(baseLaunchAngle + powerAngleBonus);
};

/**
 * 物理エンジン：打球パラメータの計算
 */
export const calculateBattedBallPhysics = (batter, pitcher, pitch, physicsResult) => {
  const { exitVelocity, meetQuality } = physicsResult;

  // 打出し角度
  const launchAngle = calculateLaunchAngle(meetQuality, batter);

  // 物理シミュレーション（飛距離・滞空時間）
  const rad = launchAngle * Math.PI / 180;
  const v = exitVelocity / 3.6;  // km/h to m/s
  const g = 9.8;

  // 滞空時間（秒）
  const hangTime = Math.max(0.5, (2 * v * Math.sin(Math.max(0, rad))) / g);

  // 飛距離（メートル）
  let distance;
  if (launchAngle <= 0) {
    // ゴロ: 内野を転がる距離
    distance = 15 + exitVelocity * 0.15 + Math.random() * 20;
  } else {
    // フライ/ライナー
    const optimalAngleFactor = 1 - Math.abs(launchAngle - 30) / 60;
    distance = v * Math.cos(rad) * hangTime * (0.8 + optimalAngleFactor * 0.4);
    distance *= (0.9 + batter.power / 500);
  }

  // 打球方向（-45〜45度）- 中央（遊撃・二塁・中堅方向）に偏る分布
  // 正規分布的に中央を重くする（実際の打球分布に近い）
  const r1 = Math.random(), r2 = Math.random();
  const normalish = (r1 + r2 + Math.random()) / 3; // 0-1の中央寄り分布
  const direction = (normalish * 90) - 45;

  return {
    exitVelocity,
    launchAngle,
    distance: Math.round(distance),
    hangTime,
    direction,
    meetQuality: Math.round(meetQuality * 100)
  };
};

/**
 * 守備の「時間競合」モデル
 * 野手が打球地点に物理的に到達できるかで判定
 * アウト率は旧モデル基準に調整
 */
export const judgeFielderReach = (battedBall, defense, batter) => {
  // 防御的チェック: defenseがnullまたはundefinedの場合はデフォルト値を使用
  const safeDefense = defense || {};
  const { exitVelocity, launchAngle, distance, hangTime, direction } = battedBall || {};

  // 本塁打判定（バレルゾーン）
  // MLB基準: 打球速度158km/h以上、角度26-30度で.500以上の打率
  if (distance > 105 && launchAngle >= 22 && launchAngle <= 38 && exitVelocity >= 155) {
    return { result: 'homerun', bases: 4, description: 'ホームラン！' };
  }

  // 長打圏フライ（98m以上の深いフライ、パワー依存確率）
  if (distance > 98 && launchAngle >= 22 && launchAngle <= 42 && exitVelocity >= 143) {
    const hrProb = 0.09 + Math.max(0, (batter.power || 50) - 40) * 0.004;
    if (Math.random() < hrProb) {
      return { result: 'homerun', bases: 4, description: 'ホームラン！（フェンス越え）' };
    }
  }

  // ポップフライ（60度以上）- 旧モデル: 95-97%アウト
  if (launchAngle >= 60) {
    const catchProb = 0.95 + (safeDefense.catcher?.defense || 70) / 2000;
    if (Math.random() < catchProb) {
      return { result: 'out', bases: 0, description: 'フライアウト（ポップフライ）', isOutfieldFly: false };
    }
    return { result: 'single', bases: 1, description: 'ポテンヒット' };
  }

  // 担当野手の決定（守備重要度: SS/CF > 2B/RF > LF/3B > 1B）
  // 足が速い野手は守備範囲が広がる（隣接ゾーンの打球もカバー）
  let fielder, position, isOutfield;

  if (distance < 40) {
    // 内野 - 遊撃手の守備範囲を広く設定
    isOutfield = false;
    if (distance < 15) {
      position = 'pitcher';
    } else if (direction < -20) {
      // 三塁側 - 遊撃手の足で範囲拡張
      const ssSpeed = safeDefense.short?.speed || 60;
      const ssExpand = (ssSpeed - 60) / 100 * 8; // 足90→+2.4度拡張（走力強化）
      if (direction >= -20 - ssExpand) {
        position = 'short'; // 遊撃手がカバー
      } else {
        position = 'third';
      }
    } else if (direction < 5) {
      position = 'short'; // -20〜+5: 遊撃手の広い範囲（25度幅）
    } else if (direction < 20) {
      position = 'second'; // +5〜+20: 二塁手（15度幅）
    } else {
      // 一塁側 - 二塁手の足で範囲拡張
      const sbSpeed = safeDefense.second?.speed || 60;
      const sbExpand = (sbSpeed - 60) / 100 * 7; // 走力強化
      if (direction < 20 + sbExpand) {
        position = 'second';
      } else {
        position = 'first';
      }
    }
    fielder = safeDefense[position] || { defense: 70, speed: 60, arm: 65 };
  } else {
    // 外野 - 中堅手の守備範囲を広く設定
    isOutfield = true;
    const cfSpeed = safeDefense.center?.speed || 65;
    const cfExpand = (cfSpeed - 65) / 100 * 12; // 足90→+3度拡張（走力強化）
    const cfLeft = -15 - cfExpand;  // 中堅の左端（基準-15）
    const cfRight = 15 + cfExpand;  // 中堅の右端（基準+15）

    if (direction < cfLeft) {
      // 左翼側 - 左翼手の足でもカバー拡張
      const lfSpeed = safeDefense.left?.speed || 65;
      const lfExpand = (lfSpeed - 65) / 100 * 7; // 走力強化
      position = (direction >= cfLeft - lfExpand) && Math.random() < 0.3 ? 'center' : 'left';
    } else if (direction <= cfRight) {
      position = 'center'; // 中堅手の広い範囲（30度幅＋足で拡張）
    } else {
      // 右翼側 - 右翼手の足でもカバー拡張
      const rfSpeed = safeDefense.right?.speed || 65;
      const rfExpand = (rfSpeed - 65) / 100 * 7; // 走力強化
      position = (direction <= cfRight + rfExpand) && Math.random() < 0.3 ? 'center' : 'right';
    }
    fielder = safeDefense[position] || { defense: 70, speed: 65, arm: 70 };
  }

  // ポジション別守備重要度係数（SS/CF > 2B/RF > LF/3B > 1B）
  const positionWeight = {
    short: 1.5, center: 1.5,
    second: 1.2, right: 1.2,
    left: 1.0, third: 1.0,
    first: 0.7, pitcher: 0.5, catcher: 0.8
  };
  const weight = positionWeight[position] || 1.0;

  // ===== ゴロの場合 =====
  if (launchAngle < 10) {
    if (distance < 40) {
      // 内野ゴロ - 守備重要度で係数を強化
      const baseOutRate = 0.975;
      const defenseBonus = (fielder.defense - 70) / 100 * 0.04 * weight;  // 重要ポジションほど守備力が効く
      const speedBonus = (fielder.speed - 60) / 100 * 0.05 * weight;     // 足で守備範囲拡大（走力強化）
      const batterSpeedPenalty = (batter.speed - 60) / 100 * 0.04;
      const catchProb = Math.min(0.995, Math.max(0.90, baseOutRate + defenseBonus + speedBonus - batterSpeedPenalty));

      if (Math.random() < catchProb) {
        // エラー判定
        const errorRate = 0.003 + (100 - fielder.defense) / 2000;
        if (Math.random() < errorRate) {
          return { result: 'single', bases: 1, description: 'エラー（ヒット扱い）', isError: true };
        }
        return { result: 'out', bases: 0, description: `${position === 'pitcher' ? '投' : position === 'first' ? '一' : position === 'second' ? '二' : position === 'short' ? '遊' : '三'}ゴロ`, isOutfieldFly: false };
      }
      return { result: 'single', bases: 1, description: '内野安打' };
    } else {
      // 外野への速いゴロ - 足と守備で大きく変動
      const catchProb = 0.25 + (fielder.speed / 100) * 0.20 * weight + (fielder.defense / 100) * 0.10 * weight;
      if (Math.random() < catchProb) {
        return { result: 'out', bases: 0, description: '外野ゴロアウト', isOutfieldFly: false };
      }
      return { result: 'single', bases: 1, description: '外野への安打' };
    }
  }

  // ===== ライナーの場合 =====
  if (launchAngle < 25) {
    if (distance < 40) {
      // 内野ライナー - ポジション重要度で守備力の効きが変わる
      const baseOutRate = 0.88;
      const defenseBonus = (fielder.defense - 70) / 100 * 0.08 * weight;
      const speedBonus = (fielder.speed - 60) / 100 * 0.06 * weight; // 走力強化
      const catchProb = Math.min(0.96, baseOutRate + defenseBonus + speedBonus);

      if (Math.random() < catchProb) {
        return { result: 'out', bases: 0, description: 'ライナーアウト', isOutfieldFly: false };
      }
      return { result: 'single', bases: 1, description: 'ヒット！' };
    } else {
      // 外野ライナー - CF/RFの守備・足が大きく効く
      const baseOutRate = 0.78;
      const defenseBonus = (fielder.defense - 70) / 100 * 0.12 * weight;
      const speedBonus = (fielder.speed - 65) / 100 * 0.14 * weight; // 走力強化
      const catchProb = Math.min(0.94, baseOutRate + defenseBonus + speedBonus);

      if (Math.random() < catchProb) {
        return { result: 'out', bases: 0, description: 'ライナーアウト', isOutfieldFly: true, tagupThrowbackChance: (fielder.arm / 100) * 0.5 };
      }
      // 長打判定
      if (distance > 70 && exitVelocity >= 140) {
        return { result: 'double', bases: 2, description: '二塁打！' };
      }
      return { result: 'single', bases: 1, description: 'ヒット！' };
    }
  }

  // ===== フライの場合 =====
  if (distance < 40) {
    // 内野フライ - 旧モデル: 97%アウト
    const catchProb = 0.97 + (fielder.defense / 100) * 0.02;
    if (Math.random() < catchProb) {
      return { result: 'out', bases: 0, description: 'フライアウト', isOutfieldFly: false };
    }
    return { result: 'single', bases: 1, description: 'ポテンヒット' };
  }

  // 外野フライ
  let baseOutRate;
  if (distance < 70) {
    // 浅いフライ - 旧モデル: 99.5%アウト
    baseOutRate = 0.995;
  } else if (distance < 90) {
    // 中堅フライ - 旧モデル: 95%アウト
    baseOutRate = 0.95;
  } else {
    // 深いフライ - 旧モデル: 80%アウト
    baseOutRate = 0.80;
  }

  const defenseBonus = (fielder.defense - 70) / 100 * 0.06 * weight;
  const speedBonus = (fielder.speed - 65) / 100 * 0.14 * weight; // 走力強化
  const catchProb = Math.min(0.995, baseOutRate + defenseBonus + speedBonus);

  if (Math.random() < catchProb) {
    const isDeepFly = distance > 70;
    return {
      result: 'out',
      bases: 0,
      description: 'フライアウト',
      isOutfieldFly: isDeepFly,
      tagupThrowbackChance: isDeepFly ? (fielder.arm / 100) * 0.6 : 0
    };
  }

  // 安打判定
  if (distance > 80 && launchAngle >= 15 && launchAngle <= 35) {
    if (exitVelocity >= 145 && distance > 90) {
      return { result: 'triple', bases: 3, description: '三塁打！' };
    }
    return { result: 'double', bases: 2, description: '二塁打！' };
  }

  return { result: 'single', bases: 1, description: 'ヒット！' };
};

/**
 * 守備適性計算関数
 * 選手の能力に基づいて各守備位置への適性を計算
 */
export const calculateDefensiveFitness = (player, position) => {
  const defense = player.fielding?.defense || 50;
  const speed = player.physical?.speed || 50;
  const arm = player.fielding?.arm || 50;

  let fitness = 0;
  let comments = [];

  switch (position) {
    case 'pitcher':
      // 投手は守備力と制球力が重要
      fitness = defense;
      if (defense < 30) comments.push('守備力不足');
      break;

    case 'catcher':
      // 捕手は守備力とリード、肩が重要
      fitness = (defense * 0.5 + arm * 0.5);
      if (defense < 40) comments.push('守備力不足');
      if (arm < 40) comments.push('肩が弱い');
      break;

    case 'first':
      // 一塁は守備力が重要、足はあまり必要ない
      fitness = defense;
      if (defense < 30) comments.push('守備力不足');
      if (speed > 70) comments.push('足が活かせない');
      break;

    case 'second':
    case 'short':
      // 二遊間は守備力、足、肩すべて重要
      fitness = (defense * 0.4 + speed * 0.3 + arm * 0.3);
      if (defense < 40) comments.push('守備力不足');
      if (speed < 40) comments.push('足が遅い');
      if (arm < 40) comments.push('肩が弱い');
      break;

    case 'third':
      // 三塁は守備力と肩が重要
      fitness = (defense * 0.5 + arm * 0.5);
      if (defense < 40) comments.push('守備力不足');
      if (arm < 40) comments.push('肩が弱い');
      break;

    case 'left':
    case 'right':
      // 両翼は足と肩が重要
      fitness = (defense * 0.3 + speed * 0.4 + arm * 0.3);
      if (speed < 40) comments.push('足が遅い');
      if (arm < 40) comments.push('肩が弱い');
      break;

    case 'center':
      // センターは特に足が重要
      fitness = (defense * 0.3 + speed * 0.5 + arm * 0.2);
      if (speed < 50) comments.push('⚠️足が遅い');
      if (speed < 30) comments.push('🔴センター不適');
      if (arm < 30) comments.push('肩が弱い');
      break;

    default:
      fitness = 50;
  }

  // 適性評価
  let grade = 'C';
  if (fitness >= 80) grade = 'S';
  else if (fitness >= 70) grade = 'A';
  else if (fitness >= 60) grade = 'B';
  else if (fitness >= 40) grade = 'C';
  else grade = 'D';

  return {
    fitness: Math.round(fitness),
    grade,
    comments: comments.length > 0 ? comments.join(', ') : '適性良好'
  };
};

// ES module exports
