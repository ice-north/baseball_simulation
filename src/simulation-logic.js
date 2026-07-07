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

  // ★修正: 係数は投手の「素の球速」で連続的に決定
  const basePitcherVelocity = pitcher.velocity;
  const clampedVel = Math.max(120, Math.min(165, basePitcherVelocity));
  const windowCoef = 0.40 - (clampedVel - 120) * 0.00511;

  // 窓の計算は実際の球速で（速い変化球は打ちにくい）
  let timingWindow = (1000 / (pitchVelocity / 3.6)) * windowCoef;

  // ミート窓ボーナス（ミート力が高いと窓が広がる）
  const meetBonus = (batter.meet / 100) * 0.20;  // 最大+20%（打率+0.5割相当の強化）
  timingWindow *= (1 + meetBonus);

  // 読みが当たれば窓が広がる（準備ができている）
  if (isGuessRight) {
    timingWindow *= 1.3;  // ×1.3
  }

  // ミート力による「緩急・変化球への耐性」
  // ミートが高い打者はタイミングを外されにくい（最大50%軽減）
  // 例: meet=100 → 緩急/変化球の影響が半減 / meet=0 → 影響フル
  const meetDeceptionResistance = (batter.meet / 100) * 0.5;

  // トンネリング効果で窓が狭まる（錯覚で準備が遅れる）
  // ミート高打者は騙されにくい
  timingWindow *= (1 - tunnelingEffect * 0.3 * (1 - meetDeceptionResistance));

  // 変化球はさらに窓を狭める（軌道予測が難しい、レベルが高いほど曲がる）
  // ミート高打者は変化球にも対応しやすい
  if (pitch.type !== 'straight' && pitch.level) {
    const breakingBallPenalty = (pitch.level / 100) * 0.18 * (1 - meetDeceptionResistance);  // 最大18%
    timingWindow *= (1 - breakingBallPenalty);
  }

  // 回転数によるタイミング窓補正（MLB Statcast準拠）
  // 高回転ストレート: ホップ成分が大きく打者の予測軌道とズレる → 空振り増
  // 高回転変化球: 変化量が大きく軌道予測が困難 → 空振り増
  const spinRate = pitcher.spinRate ?? 50;
  if (spinRate !== 50) {
    const spinDeviation = (spinRate - 50) / 100;
    let spinEffect;
    if (pitch.type === 'straight' || pitch.type === 'twoSeam') {
      spinEffect = spinDeviation * 0.36;
    } else {
      spinEffect = spinDeviation * 0.38;
    }
    // 遅い球は滞空時間が長く、回転による変化量が増幅される
    const spinVelocityBoost = 1 + Math.max(0, (150 - pitchVelocity) / 50);
    spinEffect *= spinVelocityBoost;
    timingWindow *= (1 - spinEffect * (1 - meetDeceptionResistance));
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
  // Meet 0 → ±15ms (頻繁に芯を外す), Meet 100 → ±4ms (精密)
  const maxError = 15 - (batter.meet * 0.11);  // ±15～4ms（ミート差を拡大）

  // 左右相性でミート精度調整
  const meetAdjust = (handEffect.meetBonus || handEffect.meetPenalty || 0) * 0.02;
  const adjustedMaxError = Math.max(1.5, maxError - meetAdjust);  // 最小1.5ms

  const timingError = (Math.random() - 0.5) * 2 * adjustedMaxError;

  // 【4】芯へのミート率 (0.0 ～ 1.0)
  // タイミング誤差がウィンドウ内なら高品質コンタクト
  let meetQuality = Math.max(0, 1 - Math.abs(timingError) / timingWindow);

  // 【5】空振り判定
  // ミート力連動の動的閾値: ミート0→0.28(厳しい), ミート100→0.05(緩い)
  // 低ミート打者は頻繁に空振り、高ミート打者はまず空振りしない
  const contactThreshold = 0.28 - (batter.meet / 100) * 0.23;
  const isContact = meetQuality > contactThreshold;

  // 【6】打球初速の計算 (物理衝突モデル - 修正版)
  // MLB平均Exit Velocity: 約140km/h (88mph)
  // 最大Exit Velocity: 約190km/h (120mph) - 極めて稀
  // ミート品質と打者パワーで決定
  let exitVelocity = 0;
  if (isContact) {
    // 【パワー伝達効率】タイミングを外されるとパワーが打球に乗らない
    // 泳がされ・詰まり時はフルスイングできず、パワーが活きない
    // meetQuality=1.0 → 100%, 0.5 → 66%, 0.2 → 38%, 0.02 → 11%
    const powerTransferRate = Math.pow(meetQuality, 0.6);

    // 基本初速: パワーが主体、ミートは芯を捉えた時に大きく寄与
    // sweetSpotBonus: ミート100で完璧な芯を捉えた時に最大+18km/h
    // → ミート打者が長打圏EVに到達する唯一の経路
    const sweetSpotBonus = (batter.meet / 100) * Math.pow(meetQuality, 1.5) * 18;
    const baseVelocity = 90 + (batter.power * 0.17 * powerTransferRate) + sweetSpotBonus;

    // ミート品質ボーナス: パワー主体
    const qualityBonus = meetQuality * (30 + batter.power * 0.17);

    // 投球速度の反発ボーナス: 最大+15km/h
    // 詰まった打球には反発も乗らない
    const pitchBonus = (pitchVelocity - 130) * 0.25 * powerTransferRate;

    exitVelocity = baseVelocity + qualityBonus + pitchBonus;

    // ランダム要素（±5km/h）
    exitVelocity += (Math.random() * 10 - 5);

    // 現実的な範囲に制限: 70-175km/h
    exitVelocity = Math.max(70, Math.min(175, exitVelocity));
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

  // 球速差による錯覚効果（比率ベース: 遅い投手ほど体感の緩急が大きい）
  const veloDiff = Math.abs(lastPitch.velocity - currentPitch.velocity);
  const baseVelocity = Math.max(lastPitch.velocity, currentPitch.velocity);
  const veloDiffRatio = baseVelocity > 0 ? veloDiff / baseVelocity : 0;

  // 球種の軌道近似性（ストレートから変化球への切り替えが効果的）
  const orbitCloseness = (lastPitch.type === 'straight' && currentPitch.type !== 'straight') ? 0.8 :
                        (lastPitch.type !== 'straight' && currentPitch.type === 'straight') ? 0.6 : 0.2;

  // 捕手のリードが高いほど効果増大
  const leadMultiplier = 1 + (catcherLead / 100);

  return Math.min(0.25, (veloDiffRatio * 0.45 + orbitCloseness * 0.025) * leadMultiplier);
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
    // 高品質: ライナー中心だが硬いゴロも出る（NPB準拠）
    if (Math.random() < 0.30) {
      baseLaunchAngle = -5 + Math.random() * 15;  // 硬いゴロ〜低いライナー
    } else {
      baseLaunchAngle = 10 + Math.random() * 30;  // ライナー〜フライ
    }
  } else if (meetQuality > 0.4) {
    // 中品質: 幅広い分布（-10〜50度、ゴロ寄り）
    baseLaunchAngle = -10 + Math.random() * 60;
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
 * 回転数による打球角度補正を計算
 * 高回転ストレート → フライ傾向（+角度）、低回転 → ゴロ傾向（-角度）
 * 変化球は回転数が高いほど打ち損じやすい（角度が極端になる）
 */
export const getSpinRateAngleAdjust = (pitchType, spinRate) => {
  if (spinRate == null) return 0;
  const deviation = (spinRate - 50) / 100;
  if (pitchType === 'straight' || pitchType === 'twoSeam' || pitchType === 'cutter') {
    return deviation * 26;
  }
  return deviation * -13;
};

/**
 * 物理エンジン：打球パラメータの計算
 */
export const calculateBattedBallPhysics = (batter, pitcher, pitch, physicsResult) => {
  const { exitVelocity, meetQuality } = physicsResult;

  // 打出し角度（投手の回転数で補正）
  const spinAngleAdj = getSpinRateAngleAdjust(pitch.type, pitcher.spinRate);
  // 速球で差し込まれるとゴロになりやすい（NPBデータ: 160+で50.7%GB）
  const pitchVelocity = pitch.velocity || pitcher.velocity;
  let velocityAngleAdj = 0;
  if (meetQuality < 0.75) {
    const deficit = 1 - meetQuality;
    if (pitchVelocity > 140) {
      velocityAngleAdj = -((pitchVelocity - 140) / 20) * deficit * 22;
    } else if (pitchVelocity < 135) {
      velocityAngleAdj = -((135 - pitchVelocity) / 15) * deficit * 8;
    }
  }
  const launchAngle = calculateLaunchAngle(meetQuality, batter) + spinAngleAdj + velocityAngleAdj;

  // 物理シミュレーション（飛距離・滞空時間）
  const rad = launchAngle * Math.PI / 180;
  const v = exitVelocity / 3.6;  // km/h to m/s
  const g = 9.8;

  // 滞空時間（秒）
  const hangTime = Math.max(0.5, (2 * v * Math.sin(Math.max(0, rad))) / g);

  // 打球方向（-45〜45度）- NPBデータ準拠（振り遅れ効果含む）
  const batSide = batter.bats === 'left' ? -1
    : batter.bats === 'switch' ? (pitcher.throwingArm === 'left' ? -1 : 1)
    : 1;
  const velDiff = pitchVelocity - 142;
  const velShift = (velDiff >= 0 ? velDiff * 0.67 : velDiff * 0.50) * batSide;
  // 打者傾向: power>meetなら引っ張り、meet>powerなら広角（逆方向に打てる）
  // RHBの引っ張り=負方向なのでpower優位で負にシフト
  const pullTendency = ((batter.power || 50) - (batter.meet || 50)) * -0.12 * batSide;
  let direction = Math.random() * 90 - 45 + pullTendency + velShift;
  direction = Math.max(-45, Math.min(45, direction));

  // 飛距離（メートル）- MLB実測値ベース（空気抵抗込み）
  // EV155→112m, EV145→102m, EV135→91m, EV125→80m, EV115→69m
  let distance;
  if (launchAngle <= 0) {
    // ゴロ: 内野を転がる距離
    distance = 15 + exitVelocity * 0.15 + Math.random() * 20;
  } else {
    // フライ/ライナー: EV基準の標準飛距離
    const carryBase = Math.max(0, (exitVelocity - 75) * 1.1 + 28);
    // 打出し角度補正: 30度が最適
    const angleFactor = Math.max(0.3, 1 - Math.abs(launchAngle - 30) / 60);
    distance = carryBase * angleFactor;
    // パワーボーナス（スイングの強さ分の微調整）
    distance *= (0.95 + batter.power / 1000);

    // 引っ張り/流し打ちによる飛距離補正
    // 引っ張り: フルスイングでジャストミート → 飛距離+5%
    // 流し打ち: ミートが低いほどペナルティ大（meet30以下=-10%, meet99=0%）
    const pullDirection = direction * batSide; // 負=引っ張り、正=流し
    if (pullDirection < -15) {
      distance *= 1.03 + Math.min(0.02, (-pullDirection - 15) / 30 * 0.02);
    } else if (pullDirection > 15) {
      const m = Math.min(99, Math.max(30, batter.meet || 50));
      const oppoMaxPenalty = 0.10 * (1 - (m - 30) / 69);
      distance *= 1.0 - Math.min(oppoMaxPenalty, (pullDirection - 15) / 30 * oppoMaxPenalty);
    }
  }

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
  // MLB基準: EV154km/h以上かつフェンス越えの飛距離
  if (distance > 108 && launchAngle >= 23 && launchAngle <= 37 && exitVelocity >= 153) {
    // 確率的HR: EV高いほど確実、境界EVでは取られることもある
    // EV153: 42%, EV163: 80%, EV173: 95%（上限）
    const hr1Prob = Math.min(0.95, 0.42 + (exitVelocity - 153) / 27);
    if (Math.random() < hr1Prob) {
      return { result: 'homerun', bases: 4, description: 'ホームラン！' };
    }
  }

  // 長打圏フライ（100m以上の深いフライ、速度とパワー依存確率）
  // 中堅〜パワー型の境界HRを底上げしつつ、過度なHR量産は抑える
  if (distance > 100 && launchAngle >= 22 && launchAngle <= 38 && exitVelocity >= 144) {
    // 速度要因: EV144-162で 0→1
    const velocityFactor = Math.max(0, (exitVelocity - 144) / 18);
    // パワー要因: power 30-95 で 0→1（低パワーでも芯を食えばHRの可能性）
    const powerFactor = Math.max(0, ((batter.power || 50) - 30) / 65);
    // velocity主体 + power補正（最大約25%）
    const hrProb = velocityFactor * 0.16 + powerFactor * 0.09;
    if (Math.random() < hrProb) {
      return { result: 'homerun', bases: 4, description: 'ホームラン！（フェンス越え）' };
    }
  }

  // 風や打球の伸びによるフェンスギリギリHR（低パワーでもごく稀に出る）
  if (distance > 88 && launchAngle >= 24 && launchAngle <= 36 && exitVelocity >= 127) {
    const evFactor = Math.max(0, (exitVelocity - 127) / 22);
    const distFactor = Math.max(0, (distance - 88) / 16);
    const hrProb = evFactor * distFactor * 0.055;
    if (Math.random() < hrProb) {
      return { result: 'homerun', bases: 4, description: 'ホームラン！（フェンス直撃）' };
    }
  }

  // ポップフライ（60度以上）- 旧モデル: 95-97%アウト
  if (launchAngle >= 60) {
    const catchProb = 0.95 + (safeDefense.catcher?.defense || 70) / 2000;
    if (Math.random() < catchProb) {
      return { result: 'out', bases: 0, description: 'フライアウト（ポップフライ）', isOutfieldFly: false, fieldingPosition: 'catcher' };
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

  // ポジション別守備重要度係数（ライナー・フライ用の総合係数）
  const positionWeight = {
    short: 1.5, center: 1.5,
    second: 1.2, right: 1.2,
    left: 1.0, third: 1.0,
    first: 0.7, pitcher: 0.5, catcher: 0.8
  };
  const weight = positionWeight[position] || 1.0;

  // ポジション別・能力別の重み（内野ゴロ用）
  const posStatWeights = {
    short:   { defense: 1.3, speed: 1.5, arm: 1.5 },  // 広範囲+長い送球
    second:  { defense: 1.2, speed: 1.4, arm: 0.8 },  // 広範囲、送球距離は短い
    third:   { defense: 1.0, speed: 0.7, arm: 1.5 },  // 強肩が最重要
    first:   { defense: 1.3, speed: 0.5, arm: 0.3 },  // 捕球が最重要
    pitcher: { defense: 0.5, speed: 0.3, arm: 0.3 },
    catcher: { defense: 0.8, speed: 0.3, arm: 0.5 },
  };

  // 内野手の定位置角度（ホームから見た方向）
  const fielderHomeAngles = {
    pitcher: 0, catcher: 0,
    third: -30, short: -8, second: 12, first: 30,
  };

  // ===== ゴロの場合 =====
  if (launchAngle < 10) {
    if (distance < 40) {
      // 内野ゴロ - 打球方向と野手定位置の角度差で正面/横を判定
      const pw = posStatWeights[position] || { defense: 1.0, speed: 1.0, arm: 1.0 };
      const homeAngle = fielderHomeAngles[position] || 0;
      const offset = Math.abs(direction - homeAngle);

      // 正面ゾーン: 足が速いほど広い（多くの打球をルーティンで処理）
      const frontZone = 5 + (fielder.speed - 50) / 100 * 5 * pw.speed;

      let catchProb;
      if (offset <= frontZone) {
        // 正面: ルーティンプレー（守備力で微調整）
        catchProb = 0.97 + (fielder.defense - 50) / 100 * 0.02;
        catchProb -= (batter.speed - 60) / 100 * 0.04;
      } else {
        // 横の打球: 距離に応じて難易度が上がり、守備力が重要になる
        const difficulty = Math.min(1.0, (offset - frontZone) / 14);
        catchProb = 0.88 - difficulty * 0.30;
        catchProb += (fielder.defense - 50) / 100 * 0.20 * pw.defense * (1 + difficulty * 0.5);
        catchProb += (fielder.speed - 50) / 100 * 0.06 * pw.speed;
        catchProb += ((fielder.arm || 60) - 50) / 100 * 0.05 * pw.arm;
        catchProb -= (batter.speed - 60) / 100 * 0.12;
        catchProb -= Math.max(0, (batter.meet || 50) - 30) / 100 * 0.10;
      }
      catchProb = Math.min(0.995, Math.max(0.40, catchProb));

      if (Math.random() < catchProb) {
        const errorRate = 0.002 + (100 - fielder.defense) / 1500 + (100 - (fielder.arm || 60)) / 3000;
        if (Math.random() < errorRate) {
          return { result: 'single', bases: 1, description: 'エラー（ヒット扱い）', isError: true, errorPosition: position };
        }
        return { result: 'out', bases: 0, description: `${position === 'pitcher' ? '投' : position === 'first' ? '一' : position === 'second' ? '二' : position === 'short' ? '遊' : '三'}ゴロ`, isOutfieldFly: false, fieldingPosition: position };
      }
      return { result: 'single', bases: 1, description: '内野安打', fieldingPosition: position };
    } else {
      // 外野への速いゴロ - 足と守備で大きく変動
      const catchProb = 0.25 + (fielder.speed / 100) * 0.25 * weight + (fielder.defense / 100) * 0.15 * weight;
      if (Math.random() < catchProb) {
        return { result: 'out', bases: 0, description: '外野ゴロアウト', isOutfieldFly: false, fieldingPosition: position };
      }
      return { result: 'single', bases: 1, description: '外野への安打' };
    }
  }

  // ===== ライナーの場合 =====
  if (launchAngle < 25) {
    if (distance < 40) {
      // 内野ライナー - ポジション重要度で守備力の効きが変わる
      const baseOutRate = 0.88;
      const defenseBonus = (fielder.defense - 70) / 100 * 0.13 * weight;
      const speedBonus = (fielder.speed - 60) / 100 * 0.10 * weight;
      // ミートが高い打者は鋭いライナーで野手の正面を避けやすい（ミート30以上から段階的に効果）
      const meetPlacementBonus = Math.max(0, (batter.meet || 50) - 30) / 100 * 0.18;
      const catchProb = Math.min(0.96, baseOutRate + defenseBonus + speedBonus - meetPlacementBonus);

      if (Math.random() < catchProb) {
        return { result: 'out', bases: 0, description: 'ライナーアウト', isOutfieldFly: false, fieldingPosition: position };
      }
      return { result: 'single', bases: 1, description: 'ヒット！' };
    } else {
      // 外野ライナー - CF/RFの守備・足が大きく効く
      const baseOutRate = 0.78;
      const defenseBonus = (fielder.defense - 70) / 100 * 0.18 * weight;
      const speedBonus = (fielder.speed - 65) / 100 * 0.18 * weight;
      // ミートが高い打者は野手の間を抜く鋭いライナーを打てる（ミート30以上から段階的に効果）
      const meetPlacementBonus = Math.max(0, (batter.meet || 50) - 30) / 100 * 0.20;
      const catchProb = Math.min(0.94, baseOutRate + defenseBonus + speedBonus - meetPlacementBonus);

      if (Math.random() < catchProb) {
        return { result: 'out', bases: 0, description: 'ライナーアウト', isOutfieldFly: true, tagupThrowbackChance: (fielder.arm / 100) * 0.5, fieldingPosition: position };
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
      return { result: 'out', bases: 0, description: 'フライアウト', isOutfieldFly: false, fieldingPosition: position };
    }
    return { result: 'single', bases: 1, description: 'ポテンヒット' };
  }

  // 外野フライ
  let baseOutRate;
  if (distance < 70) {
    // 浅いフライ（ポテンヒットがたまに発生）
    baseOutRate = 0.93;
  } else if (distance < 90) {
    // 中堅フライ（ポテンヒット多め）
    baseOutRate = 0.84;
  } else {
    // 深いフライ
    baseOutRate = 0.71;
  }

  const defenseBonus = (fielder.defense - 70) / 100 * 0.10 * weight;
  const speedBonus = (fielder.speed - 65) / 100 * 0.18 * weight;
  // ミート打者は野手の間を狙って打てる（ミート30以上から段階的に効果）
  const meetPlacementBonus = Math.max(0, (batter.meet || 50) - 30) / 100 * 0.14;
  // 強い打球ほど野手の頭を越えやすい
  const exitVeloBonus = Math.max(0, (exitVelocity - 130) / 100) * 0.18;
  const catchProb = Math.min(0.995, baseOutRate + defenseBonus + speedBonus - meetPlacementBonus - exitVeloBonus);

  if (Math.random() < catchProb) {
    const isDeepFly = distance > 70;
    return {
      result: 'out',
      bases: 0,
      description: 'フライアウト',
      isOutfieldFly: isDeepFly,
      tagupThrowbackChance: isDeepFly ? (fielder.arm / 100) * 0.6 : 0,
      fieldingPosition: position
    };
  }

  // 安打判定: EV・飛距離・方向から単打/二塁打/三塁打を区別
  const batterSpeed = batter.speed || 60;
  const isCorner = Math.abs(direction) > 26;

  // 三塁打: コーナー寄り + 速い打球 + 足の速い走者 のみ
  if (isCorner && distance > 95 && exitVelocity >= 144 && batterSpeed >= 65) {
    const tripleProb = 0.20 + (batterSpeed - 65) / 100 * 0.3;
    if (Math.random() < tripleProb) {
      return { result: 'triple', bases: 3, description: '三塁打！' };
    }
  }

  // 二塁打: 深いフライ(95m+)かつ速い打球(EV 142+) または非常に速い打球(EV 148+)
  // 打球が本当に強くないと二塁打にはならない
  if (launchAngle >= 15 && launchAngle <= 40) {
    if ((distance > 95 && exitVelocity >= 142) || exitVelocity >= 148) {
      return { result: 'double', bases: 2, description: '二塁打！' };
    }
  }

  // それ以外は単打（野手の前に落ちた or 弱い打球が抜けた）
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
