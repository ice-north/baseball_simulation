// ============================================================
// 試合ロジック - simulation-logic.js
// 野球シミュレーションの物理計算と判定ロジック
// ============================================================
import { PITCHING_FORM_EFFECTS } from './utils/constants.js';
import { BALL_EFFECTS } from './utils/constants.js';

// ============================================================
// 打球初速（Exit Velocity）— **実データと同じ km/h スケール**
//
// 飛距離の式 `carryBase = (EV - 75) × 1.1 + 28` は実測に合わせて較正されている
// （EV153→114m / EV161→123m は実際の 95mph→113m / 100mph→122m と一致）。
// つまりEVは実物の単位なのに、旧係数では中央値が128km/hしか出ておらず
// （実MLB 145km/h）、ハードヒット率(153km+)が **1.8%**（実35-40%）だった。
//
// **それでも本塁打率が合っていたのは、バレル帯(26-34度)に入る打球が
// 18.7%（実MLB 約13%）と多かったため**。「そこまで強くない当たりが完璧な角度で
// 入る」ことで帳尻が合っていた（本作の本塁打の平均初速147km/h。実MLB 166km/h）。
//
// 実測のmeetQuality分布に対して分位が実データと一致するよう当てはめた値。
// **バレル帯の割合（calculateLaunchAngle）とセットで較正すること**。
// 片方だけ動かすと本塁打が激変する。
//   分位 5% 105 / 25% 125 / 中央 143 / 75% 160 / 95% 177（実 103/126/145/161/175）
// ============================================================
const EV_PTR = 1.20;           // パワー伝達効率の指数。大きいほど「崩されると飛ばない」
const EV_SWEET = 33;           // 芯を捉えたときのミート由来の上乗せ
const EV_BASE = 86;            // 当たっただけの打球の下限あたり
const EV_POWER = 0.31;         // パワーの寄与（伝達効率が掛かる）
const EV_QUALITY = 37;         // 芯品質そのものの寄与
const EV_QUALITY_POWER = 0.38; // 芯品質 × パワーの寄与

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
  // 基準係数 0.42。**一連のコースシステム（段階1〜8）で捕手が段階的に賢くなり、
  // その累積で打者が不利になったぶんを戻す再較正**。
  // 弱点狙い・場面別の目的・球種に合ったコース要求…はどれも「捕手が良い仕事を
  // する」方向なので、全捕手が行うぶんリーグ全体が投手寄りに寄っていた。
  //   0.40 のまま: 打率.2334 / 三振23.5% / 失点3.46（三振が実データ帯19-22%を超過）
  //   0.42:        打率.2386 / 三振21.9% / 失点3.69（実NPB 失点3.70 に一致）
  // 打者個々の能力ではなく物理の基準を動かしているので、能力の相対関係は不変。
  const windowCoef = 0.42 - (clampedVel - 120) * 0.00511;

  // 窓の計算は実際の球速で（速い変化球は打ちにくい）
  let timingWindow = (1000 / (pitchVelocity / 3.6)) * windowCoef;

  // ミート窓ボーナス（ミート力が高いと窓が広がる）
  const meetBonus = (batter.meet / 100) * 0.20;  // 最大+20%（打率+0.5割相当の強化）
  timingWindow *= (1 + meetBonus);

  // 読みが当たれば窓が広がる（準備ができている）。
  // **球種とコースの両方を張り当てると別格**（1つ=×1.30 / 両方=×1.50）。
  // 采配モードでプレイヤーが張って外した場合は負の値が来る（×0.84）。
  // 旧来の boolean もそのまま「1つ的中」として動く。
  const guessLevel = isGuessRight === true ? 1 : (Number(isGuessRight) || 0);
  if (guessLevel >= 2) timingWindow *= 1.50;
  else if (guessLevel >= 1) timingWindow *= 1.30;
  else if (guessLevel <= -2) timingWindow *= 0.72;   // 球種もコースも張り外し
  else if (guessLevel <= -1) timingWindow *= 0.84;   // どちらかを張り外し

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

  // 球種固有の空振り性能（BALL_EFFECTS.whiffBonus）。
  // 従来この値は捕手の球種選択スコアでしか使われておらず、物理エンジンは
  // 読んでいなかった。そのため「スライダーは空振りが取れる」という設定が
  // 結果に一切反映されず、球種はレベルと球速差でしか差が出ていなかった。
  const ballEffect = BALL_EFFECTS[pitch.type];
  if (ballEffect && pitch.level) {
    const lv = pitch.level / 100;
    // ツーシームのように whiffBonus が負の球種は逆に当てやすくなる
    timingWindow *= (1 - (ballEffect.whiffBonus || 0) * lv * (1 - meetDeceptionResistance));
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
    // meetQuality=1.0 → 100%, 0.5 → 44%, 0.2 → 15%, 0.02 → 1%
    const powerTransferRate = Math.pow(meetQuality, EV_PTR);

    // 基本初速: パワーが主体、ミートは芯を捉えた時に大きく寄与
    // sweetSpotBonus: ミート100で完璧な芯を捉えた時に最大+33km/h
    // → ミート打者が長打圏EVに到達する唯一の経路
    const sweetSpotBonus = (batter.meet / 100) * Math.pow(meetQuality, 1.5) * EV_SWEET;
    const baseVelocity = EV_BASE + (batter.power * EV_POWER * powerTransferRate) + sweetSpotBonus;

    // ミート品質ボーナス: パワー主体
    const qualityBonus = meetQuality * (EV_QUALITY + batter.power * EV_QUALITY_POWER);

    // 投球速度の反発ボーナス: 最大+15km/h
    // 詰まった打球には反発も乗らない
    const pitchBonus = (pitchVelocity - 130) * 0.25 * powerTransferRate;

    exitVelocity = baseVelocity + qualityBonus + pitchBonus;

    // 球種固有の凡打誘発（BALL_EFFECTS.weakBonus）。
    // シンカー/シュート(0.23)のような手元で動く球は打球が弱くなる。
    // 芯を捉えられた時ほど影響は小さい（差し込まれるから弱くなる）。
    const weakEff = BALL_EFFECTS[pitch.type];
    if (weakEff && pitch.level) {
      const weakness = (weakEff.weakBonus || 0) * (pitch.level / 100) * (1 - meetQuality * 0.5);
      exitVelocity -= weakness * 26;   // weakBonus 0.23 / level100 / 芯外し → 最大 -6.0km/h
    }

    // ランダム要素（±5km/h）
    exitVelocity += (Math.random() * 10 - 5);

    // 現実的な範囲に制限: 70-190km/h（実MLBの最大は約190km/h）
    exitVelocity = Math.max(70, Math.min(190, exitVelocity));
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
// 芯を捉えた打球のうちバレル帯(26-34度)に入る割合。
// **打球初速(EV_*)とセットで較正すること**。EVを上げると本塁打が増えるので、
// ここを下げて戻す。実MLBの全打球に占めるバレル帯の割合は約13%。
// NPB公認球の飛距離係数（MLB球=1.0）
export const NPB_CARRY = 0.94;

const BARREL_SHARE = 0.26;
// バレル帯の下端と幅。**狭いとフライが最適角に密集して本塁打が増える**。
// 実データのフライ(25-50度)のうち26-34度に入るのは約35%だが、
// 26-34度に決め打ちすると本作では56%が集中していた。
const BARREL_LO = 24;
const BARREL_W = 15;

export const calculateLaunchAngle = (meetQuality, batter) => {
  // 打出し角度は「バットのどこに当たったか（上下方向）」で決まり、タイミングの良さとは
  // 半ば独立している。芯を捉えても上を叩けばゴロになるため、どの品質帯でも広い分布を持たせる。
  // 分布は実際の野球（ゴロ44% / ライナー21% / フライ30% / ポップ5%）に較正済み。
  // ※旧実装は meetQuality>0.8 を全てバレル(25-35度)にしていたため、フライが55%まで
  //   膨らみ、ゴロが23%しか出ず内野に打球が飛ばない状態になっていた。
  let baseLaunchAngle;

  if (meetQuality > 0.8) {
    // 芯を捉えた打球: 一部がバレル帯、残りは上下のズレでゴロ〜高いフライに散る。
    // ⚠ 上端は**必ず45度以上まで伸ばす**こと。以前は 32度で頭打ちだったため
    // 「飛距離の出ない高いフライ(40-50度)」がほとんど存在せず、フライが全部
    // 最適角に密集して本塁打が実データの3倍出ていた。
    baseLaunchAngle = Math.random() < BARREL_SHARE
      ? BARREL_LO + Math.random() * BARREL_W   // バレル帯
      : -18 + Math.random() * 62;  // 強いゴロ〜高いフライ
  } else if (meetQuality > 0.6) {
    // 高品質: ゴロとライナー〜フライが半々
    baseLaunchAngle = Math.random() < 0.50
      ? -10 + Math.random() * 23   // 硬いゴロ〜低いライナー
      : -6 + Math.random() * 50;   // ライナー〜高いフライ
  } else if (meetQuality > 0.4) {
    // 中品質: 幅広い分布（ゴロ寄り）
    baseLaunchAngle = -14 + Math.random() * 72;
  } else {
    // 低品質: ボテボテゴロが主、残りはポップフライ
    baseLaunchAngle = Math.random() < 0.42
      ? -18 + Math.random() * 26   // ボテボテゴロ
      : 50 + Math.random() * 35;   // ポップフライ
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
// ============================================================
// 投球コース → 打球傾向（25分割グリッド 段階5）
//
//   内角 → 引っ張り / 外角 → 流し打ち（バットが出る位置で打球方向が決まる）
//   低め → ゴロ     / 高め → フライ  （スイング平面と球の高さの関係）
//
// **打者から見た向きで効かせる**（col 4 = その打者にとっての内角）。
// 引っ張り方向は右打者=三塁側(負)・左打者=一塁側(正)なので `batSide` で反転する。
//
// 中心値は「打球になった投球」の平均コース。ここがずれるとリーグ全体の
// ゴロ率・引っ張り率が動いてしまう（打球種別は較正済みの数字）。
// **実測すると両方ほぼ0だった**（13048打球で colAxis -0.001 / rowAxis +0.009）。
// 誘い球は外角低めに偏っているが、そもそも打球になりにくいので効いてこない。
// 誘い球の配分や弱点狙いを変えたときは測り直すこと。
const LOC_COL_MEAN = 0.00;
const LOC_ROW_MEAN = 0.01;
const LOC_PULL_DEG = 11;      // 内角/外角いっぱいで±11度      // 内角/外角いっぱいで±11度
const LOC_ANGLE_DEG = 5;      // 高め/低めいっぱいで±5度      // 高め/低めいっぱいで±6度

const locAxis = (v) => Math.max(-1, Math.min(1, v - 2));

export const calculateBattedBallPhysics = (batter, pitcher, pitch, physicsResult, pitchLoc = null) => {
  const { exitVelocity, meetQuality } = physicsResult;
  const locCol = pitchLoc ? locAxis(pitchLoc.col) - LOC_COL_MEAN : 0;
  const locRow = pitchLoc ? locAxis(pitchLoc.row) - LOC_ROW_MEAN : 0;

  // 打出し角度（投手の回転数で補正）
  const spinAngleAdj = getSpinRateAngleAdjust(pitch.type, pitcher.spinRate);
  // 球種固有のゴロ誘発（BALL_EFFECTS.groundballBonus）。
  // シンカー(0.15)/チェンジアップ(0.14)/ツーシーム(0.12) は打球が上がりにくい。
  const gbEff = BALL_EFFECTS[pitch.type];
  const ballGroundAdj = gbEff
    ? -(gbEff.groundballBonus || 0) * ((pitch.level ?? 50) / 100) * 34   // 0.15/level100 → -5.1度
    : 0;
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
  // 低めはゴロ・高めはフライ
  const locAngleAdj = -locRow * LOC_ANGLE_DEG;
  const launchAngle = calculateLaunchAngle(meetQuality, batter)
    + spinAngleAdj + velocityAngleAdj + ballGroundAdj + locAngleAdj;
  // 物理シミュレーション（飛距離・滞空時間）
  const rad = launchAngle * Math.PI / 180;
  const v = exitVelocity / 3.6;  // km/h to m/s
  const g = 9.8;

  // 滞空時間（秒）
  const hangTime = Math.max(0.5, (2 * v * Math.sin(Math.max(0, rad))) / g);

  // 打球方向（-45〜45度）- NPBデータ準拠（振り遅れ効果含む）
  // スイッチヒッターは投手と逆の打席に立つ（`throwingArm` は誰も設定しておらず、
  // 実際のフィールドは `throws`。従来スイッチは常に右打者扱いになっていた）
  const batSide = batter.bats === 'left' ? -1
    : batter.bats === 'switch' ? ((pitcher.throws || pitcher.throwingArm) === 'left' ? 1 : -1)
    : 1;
  const velDiff = pitchVelocity - 142;
  const velShift = (velDiff >= 0 ? velDiff * 0.67 : velDiff * 0.50) * batSide;
  // 打者傾向: power>meetなら引っ張り、meet>powerなら広角（逆方向に打てる）
  // RHBの引っ張り=負方向なのでpower優位で負にシフト
  const pullTendency = ((batter.power || 50) - (batter.meet || 50)) * -0.12 * batSide;
  // 内角は引っ張り、外角は流し打ち（引っ張り＝右打者は負・左打者は正）
  const locPullAdj = -locCol * LOC_PULL_DEG * batSide;
  // C型（方向決定型）: 引っ張ると決めていれば引っ張り方向へ寄る（batterType.js）
  const dirBiasAdj = -(batter.dirBias || 0) * 9 * batSide;
  // 打球方向は**ベル型**にする。以前は ±45度の一様分布だったため、
  // フライの半分が両翼寄り（フェンスが100mと短い側）へ飛んでいた。
  // 実測: |方向| の中央値 25.0度 → 実データは約15度。これが本塁打が
  // 実データの4倍出ていた最大の原因で、飛距離やEVの問題ではなかった。
  // 三角分布（一様2つの和）で SD 18.4度・範囲は±45度（フェアゾーン）ちょうど。
  const spray = (Math.random() + Math.random() - 1) * 45;
  let direction = spray + pullTendency + velShift + locPullAdj + dirBiasAdj;
  direction = Math.max(-45, Math.min(45, direction));

  // 飛距離（メートル）- MLB実測値ベース（空気抵抗込み）
  // EV155→112m, EV145→102m, EV135→91m, EV125→80m, EV115→69m
  let distance;
  if (launchAngle <= 0) {
    // ゴロ: 内野を転がる距離。弱い打球は投手前で止まるため下限を設けない
    // （旧式は必ず15m以上になり、投手ゴロの条件 distance<15 が構造的に成立しなかった）
    distance = 2 + exitVelocity * 0.17 + Math.random() * 20;
  } else {
    // フライ/ライナー: EV基準の標準飛距離
    // 実測点に合わせた較正: EV145→99m / 153→108m / 161→116m
    // （MLB Statcast 90mph→100m / 95mph→110m / 100mph→117m）
    // そこに NPB_CARRY を掛ける。**NPBの公認球はMLB球より飛ばない**（反発係数が低い）。
    // 実際 HR/フライは MLB 12-14% に対し NPB 8-10%、本塁打も 1.2 対 0.70/試合。
    // MLBの物理をそのまま使うとNPBの2倍近い本塁打が出るので、ここで吸収する。
    const carryBase = Math.max(0, ((exitVelocity - 75) * 1.06 + 25) * NPB_CARRY);
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

// ============================================================
// 打球種別ごとの捕球率の基準値
//
// 【なぜ分けて持つか】実データの安打率は打球種別で桁違いに違う。
//   ゴロ .240 / ライナー .660 / フライ .210(本塁打込) / ポップ .020
// **ライナーが最も安打になる打球**で、ゴロの3倍近い。ここを揃えないと
// 「強い当たりが正面を突かれた」と「ボテボテが抜けた」が同じ価値になり、
// 打者の質が打球の質に反映されない。
//
// ⚠ 4つは**必ずセットで較正する**こと。リーグ全体のBABIPは
//   Σ(打球種別の割合 × 安打率) で決まるので、1つだけ動かすと打率が壊れる。
// ============================================================
const CATCH = {
  groundFront: 0.915,   // 内野ゴロ・正面
  groundSide:  0.85,   // 内野ゴロ・横（difficulty で減衰）
  linerInfield: 0.60,  // 内野ライナー
  linerOutfield: 0.44, // 外野ライナー
  flyInfield: 0.97,    // 内野フライ
  popup: 0.95,         // ポップフライ（50度以上）
  flyShallow: 0.985,    // 浅い外野フライ (<70m)
  flyMedium: 0.96,     // 中間 (70-90m)
  flyDeep: 0.93,       // 深い (90m~)
};

/**
 * 守備の「時間競合」モデル
 * 野手が打球地点に物理的に到達できるかで判定
 * アウト率は旧モデル基準に調整
 */
/**
 * 守備力に応じた失策率を返す（1守備機会あたり）。
 * 守備力の水準イメージ:
 *   20=小学生 / 30=中学生 / 40=高校生 / 50=大学生 / 60=プロの及第点
 * 60を基準に、下回るほど急激に、上回るほど緩やかに失策率が変わる。
 *   守備20→約10.6% / 30→8.4% / 40→6.2% / 50→4.0% / 60→1.8% / 70→1.2% / 80→0.8%
 * @param {number} defense 守備力
 * @param {number} arm 肩力（送球ミスの寄与。省略時は守備力に準ずる）
 * @param {number} difficulty 打球の難易度 0〜1（横っ飛び等ほど高い）
 */
export const getErrorRate = (defense, arm = null, difficulty = 0) => {
  const d = typeof defense === 'number' ? defense : 50;
  const a = typeof arm === 'number' ? arm : d;
  const base = d >= 60
    ? Math.max(0.004, 0.018 - (d - 60) * 0.0006)
    : 0.018 + (60 - d) * 0.0022;
  // 肩が弱いと送球エラーが増える（守備力ほどではない）
  const armPenalty = Math.max(0, (60 - a)) * 0.0004;
  // 難しい打球ほど失敗しやすい（最大2倍）
  return (base + armPenalty) * (1 + difficulty);
};

/**
 * 送球エラー率。捕球とは独立した判定で、送り手の肩と受け手の守備の両方が効く。
 * 「肩は強いが受け手が下手」「連携の良い内野」といった差を作るための係数。
 * 捕球エラー(getErrorRate)より低めに設定し、二重に厳しくならないようにする。
 * @param {number} throwerArm 送球する野手の肩力
 * @param {number} receiverDefense 受け手（一塁手・各塁のカバー）の守備力
 * @param {number} difficulty 体勢の悪さ 0〜1
 */
export const getThrowErrorRate = (throwerArm, receiverDefense, difficulty = 0) => {
  const a = typeof throwerArm === 'number' ? throwerArm : 60;
  const r = typeof receiverDefense === 'number' ? receiverDefense : 60;
  // 肩60・受け手60を基準に、双方が下回るほど悪送球・捕り損ねが増える
  const throwPart = a >= 60 ? Math.max(0.002, 0.008 - (a - 60) * 0.00025) : 0.008 + (60 - a) * 0.0010;
  const receivePart = r >= 60 ? Math.max(0.001, 0.004 - (r - 60) * 0.00015) : 0.004 + (60 - r) * 0.0007;
  return (throwPart + receivePart) * (1 + difficulty);
};

/**
 * 打球方向から担当する外野手を返す。中堅手は左右両翼より広い範囲を守る。
 *
 * **内野を抜けた打球を「誰が拾うか」にも使う**。ゴロやライナーが内野手の脇を
 * 抜けたとき、記録上の担当は抜かれた内野手ではなく**回り込んだ外野手**。
 * ここを内野手のままにすると、積極進塁の判定（走者の足 対 外野の肩）に
 * 内野手の肩が使われてしまい、強肩の外野手を置く意味がなくなる。
 */
export function pickOutfielder(direction, defense = {}) {
  const cfSpeed = defense.center?.speed || 65;
  const cfExpand = (cfSpeed - 65) / 100 * 9;    // 足90→+2.3度拡張
  const cfLeft = -11 - cfExpand;
  const cfRight = 11 + cfExpand;
  if (direction < cfLeft) {
    const lfExpand = ((defense.left?.speed || 65) - 65) / 100 * 7;
    return (direction >= cfLeft - lfExpand) && Math.random() < 0.3 ? 'center' : 'left';
  }
  if (direction <= cfRight) return 'center';
  const rfExpand = ((defense.right?.speed || 65) - 65) / 100 * 7;
  return (direction <= cfRight + rfExpand) && Math.random() < 0.3 ? 'center' : 'right';
}

export const judgeFielderReach = (battedBall, defense, batter) => {
  // 防御的チェック: defenseがnullまたはundefinedの場合はデフォルト値を使用
  const safeDefense = defense || {};
  const { exitVelocity, launchAngle, distance, hangTime, direction } = battedBall || {};

  // スタジアム形状: ポール際99m, センター122m, 方向で補間
  // direction 0°=センター→122m, ±45°=ポール際→99m をcos²で補間
  const absDir = Math.abs(direction || 0);
  // スタジアム形状: 両翼100m / 左中間・右中間116m / 中堅122m（実NPBの平均的な球場規模）。
  // 以前は cos² 補間で 99m/110m/122m としていたが、中間(パワーアレイ)が浅すぎて
  // 引っ張った打球が実際より容易にスタンドインし、逆に中堅方向は遠すぎた。
  const fenceDistBase = 100 + 22 * Math.cos(absDir * Math.PI / 90);

  // ===== 本塁打判定 =====
  // 【重要】飛距離がフェンスを越えていて打出し角度がHR帯なら、原則そのまま本塁打。
  // 旧実装は「越えていても球速とパワーで20〜40%しかHRにしない」確率判定だったため、
  // フェンス超えの打球の6割以上が外野フライに落とされていた（実測: 塀を越える打球は
  // 打球全体の2.69% = 0.72本/試合ありながら、HRは0.24本/試合しか出ていなかった）。
  // 飛距離側（carryBase × 角度補正 × パワー補正）で既に能力差は表現されている。
  if (distance > fenceDistBase && launchAngle >= 20 && launchAngle <= 45) {
    // 塀際の好捕・向かい風でごく稀に阻まれる。余裕が小さいほど阻まれやすい
    const margin = distance - fenceDistBase;
    const robbedRate = Math.min(0.22, 0.04 + Math.max(0, 5 - margin) / 5 * 0.16);
    if (Math.random() >= robbedRate) {
      return { result: 'homerun', bases: 4, description: margin > 10 ? 'ホームラン！' : 'ホームラン！（フェンス越え）' };
    }
  }

  // ギリギリ届かない打球（フェンス6m手前から）は打球の伸び・追い風で越えることがある
  if (distance > fenceDistBase - 6 && launchAngle >= 22 && launchAngle <= 40) {
    const carryProb = (distance - (fenceDistBase - 6)) / 6 * 0.20;
    if (Math.random() < carryProb) {
      return { result: 'homerun', bases: 4, description: 'ホームラン！（フェンス直撃）' };
    }
  }

  // 担当野手の決定（守備重要度: SS/CF > 2B/RF > LF/3B > 1B）
  // 足が速い野手は守備範囲が広がる（隣接ゾーンの打球もカバー）
  let fielder, position, isOutfield;

  // ゴロは飛距離に関わらず内野手がまず処理する（抜けて初めて外野への安打になる）。
  // 以前は distance>=40 のゴロが外野手の担当になり、内野の打球が全体の1割しか
  // 発生しないという不自然な分布になっていた。
  const isGrounder = launchAngle < 10;
  if (distance < 40 || isGrounder) {
    // 内野 - 遊撃手の守備範囲を広く設定
    isOutfield = false;
    if (distance < 13 || (launchAngle >= 70 && distance < 25)) {
      // ホーム目前で止まった打球（バント性の当たり）と、ほぼ真上に打ち上げた
      // 高角度のポップフライは捕手が処理する
      position = 'catcher';
    } else if (distance < 29 && Math.abs(direction) < 14) {
      // 投手正面の弱い打球（マウンドは本塁から18.4m。中央方向の緩い当たりは投手が処理）
      position = 'pitcher';
    } else if (direction < -23) {
      // 三塁側 - 遊撃手の足で範囲拡張
      const ssSpeed = safeDefense.short?.speed || 60;
      const ssExpand = (ssSpeed - 60) / 100 * 8; // 足90→+2.4度拡張（走力強化）
      if (direction >= -23 - ssExpand) {
        position = 'short'; // 遊撃手がカバー
      } else {
        position = 'third';
      }
    } else if (direction < 3) {
      position = 'short'; // -24〜+3: 遊撃手の広い範囲
    } else if (direction < 23) {
      position = 'second'; // +3〜+26: 二塁手（一塁手は線寄りのみを守るため二塁の範囲を広く取る）
    } else {
      // 一塁側 - 二塁手の足で範囲拡張
      const sbSpeed = safeDefense.second?.speed || 60;
      const sbExpand = (sbSpeed - 60) / 100 * 7; // 走力強化
      position = direction < 23 + sbExpand ? 'second' : 'first';
    }
    fielder = safeDefense[position] || { defense: 70, speed: 60, arm: 65 };
  } else {
    isOutfield = true;
    position = pickOutfielder(direction, safeDefense);
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
  // ゴロは常に内野手が最初に処理を試みる。抜けたら外野への安打になる。
  if (launchAngle < 10) {
    {
      // 内野ゴロ - 打球方向と野手定位置の角度差で正面/横を判定
      const pw = posStatWeights[position] || { defense: 1.0, speed: 1.0, arm: 1.0 };
      const homeAngle = fielderHomeAngles[position] || 0;
      const offset = Math.abs(direction - homeAngle);

      // 正面ゾーン: 足が速いほど広い（多くの打球をルーティンで処理）
      const frontZone = 5 + (fielder.speed - 50) / 100 * 5 * pw.speed;

      let catchProb;
      if (offset <= frontZone) {
        // 正面: ルーティンプレー（守備力で微調整）
        catchProb = CATCH.groundFront + (fielder.defense - 50) / 100 * 0.02;
        catchProb -= (batter.speed - 60) / 100 * 0.04;
      } else {
        // 横の打球: 距離に応じて難易度が上がり、守備力が重要になる
        const difficulty = Math.min(1.0, (offset - frontZone) / 14);
        catchProb = CATCH.groundSide - difficulty * 0.30;
        catchProb += (fielder.defense - 50) / 100 * 0.20 * pw.defense * (1 + difficulty * 0.5);
        catchProb += (fielder.speed - 50) / 100 * 0.06 * pw.speed;
        catchProb += ((fielder.arm || 60) - 50) / 100 * 0.05 * pw.arm;
        catchProb -= (batter.speed - 60) / 100 * 0.12;
        catchProb -= Math.max(0, (batter.meet || 50) - 30) / 100 * 0.10;
      }
      // 強い打球ほど反応が難しく、内野を抜けやすい（初速130km/hから効き始める）
      catchProb -= Math.max(0, (exitVelocity - 147)) / 100 * 1.2;
      catchProb = Math.min(0.995, Math.max(0.10, catchProb));

      if (Math.random() < catchProb) {
        // 横っ飛びなど難しい打球ほど失策率が上がる
        const errDifficulty = offset <= frontZone ? 0 : Math.min(1.0, (offset - frontZone) / 14);
        if (Math.random() < getErrorRate(fielder.defense, fielder.arm, errDifficulty)) {
          return { result: 'single', bases: 1, description: 'エラー（ヒット扱い）',
            isError: true, errorPosition: position, fieldingPosition: position };
        }
        // 捕球成功後の「一塁への送球」を別判定にする。
        // 送り手の肩・受け手（一塁手）の守備の両方が効くので、内野の連携精度が結果に出る。
        // 一塁手自身の打球はベースを踏むだけなので送球判定を行わない。
        if (position !== 'first') {
          const firstBase = defense?.first || { defense: 60, arm: 60 };
          const throwErr = getThrowErrorRate(fielder.arm, firstBase.defense, errDifficulty);
          if (Math.random() < throwErr) {
            return {
              result: 'single', bases: 1, description: 'エラー（悪送球）',
              isError: true, errorPosition: position, fieldingPosition: position,
              isThrowingError: true,
            };
          }
        }
        return { result: 'out', bases: 0, description: `${position === 'pitcher' ? '投' : position === 'first' ? '一' : position === 'second' ? '二' : position === 'short' ? '遊' : '三'}ゴロ`, isOutfieldFly: false, fieldingPosition: position };
      }
      // 内野を処理できず → 内野安打 or 外野へ抜ける安打（強い打球は外野を転がり二塁打も）
      if (distance >= 40) {
        // **抜けた打球を拾うのは外野手**。抜かれた内野手を担当にすると、
        // 積極進塁の判定に内野手の肩が使われてしまう
        const of = pickOutfielder(direction, safeDefense);
        if (exitVelocity >= 167 && Math.abs(direction) > 28 && Math.random() < 0.25) {
          return { result: 'double', bases: 2, description: '左右を破る二塁打！', fieldingPosition: of };
        }
        return { result: 'single', bases: 1, description: '外野への安打', fieldingPosition: of };
      }
      return { result: 'single', bases: 1, description: '内野安打', fieldingPosition: position };
    }
  }

  // ===== ライナーの場合 =====
  if (launchAngle < 25) {
    if (distance < 40) {
      // 内野ライナー - ポジション重要度で守備力の効きが変わる
      const baseOutRate = CATCH.linerInfield;
      const defenseBonus = (fielder.defense - 70) / 100 * 0.13 * weight;
      const speedBonus = (fielder.speed - 60) / 100 * 0.10 * weight;
      // ミートが高い打者は鋭いライナーで野手の正面を避けやすい（ミート30以上から段階的に効果）
      const meetPlacementBonus = Math.max(0, (batter.meet || 50) - 30) / 100 * 0.18;
      const catchProb = Math.min(0.96, baseOutRate + defenseBonus + speedBonus - meetPlacementBonus);

      if (Math.random() < catchProb) {
        // 内野ライナーは捕球が難しく、弾くことがある
        if (Math.random() < getErrorRate(fielder.defense, fielder.arm, 0.5)) {
          return { result: 'single', bases: 1, description: 'エラー（ヒット扱い）',
            isError: true, errorPosition: position, fieldingPosition: position };
        }
        return { result: 'out', bases: 0, description: 'ライナーアウト', isOutfieldFly: false, fieldingPosition: position };
      }
      // 内野手の脇を抜けたライナーも、拾うのは外野手
      return { result: 'single', bases: 1, description: 'ヒット！',
        fieldingPosition: pickOutfielder(direction, safeDefense) };
    } else {
      // 外野ライナー - CF/RFの守備・足が大きく効く
      const baseOutRate = CATCH.linerOutfield;
      const defenseBonus = (fielder.defense - 70) / 100 * 0.18 * weight;
      const speedBonus = (fielder.speed - 65) / 100 * 0.18 * weight;
      // ミートが高い打者は野手の間を抜く鋭いライナーを打てる（ミート30以上から段階的に効果）
      const meetPlacementBonus = Math.max(0, (batter.meet || 50) - 30) / 100 * 0.20;
      const catchProb = Math.min(0.94, baseOutRate + defenseBonus + speedBonus - meetPlacementBonus);

      if (Math.random() < catchProb) {
        // 外野ライナーの目測・捕球ミス
        if (Math.random() < getErrorRate(fielder.defense, fielder.arm, 0.5)) {
          return { result: 'single', bases: 1, description: 'エラー（ヒット扱い）',
            isError: true, errorPosition: position, fieldingPosition: position };
        }
        return { result: 'out', bases: 0, description: 'ライナーアウト', isOutfieldFly: true, tagupThrowbackChance: (fielder.arm / 100) * 0.5, fieldingPosition: position };
      }
      // 長打判定
      if (distance > 70 && exitVelocity >= 157) {
        return { result: 'double', bases: 2, description: '二塁打！', fieldingPosition: position };
      }
      return { result: 'single', bases: 1, description: 'ヒット！', fieldingPosition: position };
    }
  }

  // ===== ポップフライ（50度以上。実データの定義に合わせる）=====
  // ほぼアウト。以前は無条件に「捕手」で記録していたが、実際は打球の位置に応じて
  // 内野手（時に外野手）が処理する。上で決定した担当野手をそのまま使う。
  if (launchAngle >= 50) {
    const catchProb = CATCH.popup + (fielder.defense || 70) / 2000;
    if (Math.random() < catchProb) {
      return { result: 'out', bases: 0, description: 'フライアウト（ポップフライ）', isOutfieldFly: isOutfield, fieldingPosition: position };
    }
    return { result: 'single', bases: 1, description: 'ポテンヒット', fieldingPosition: position };
  }

  // ===== フライの場合 =====
  if (distance < 40) {
    // 内野フライ - 旧モデル: 97%アウト
    const catchProb = CATCH.flyInfield + (fielder.defense / 100) * 0.02;
    if (Math.random() < catchProb) {
      return { result: 'out', bases: 0, description: 'フライアウト', isOutfieldFly: false, fieldingPosition: position };
    }
    return { result: 'single', bases: 1, description: 'ポテンヒット', fieldingPosition: position };
  }

  // 外野フライ
  let baseOutRate;
  if (distance < 70) {
    // 浅いフライ（ポテンヒットがたまに発生）
    baseOutRate = CATCH.flyShallow;
  } else if (distance < 90) {
    // 中堅フライ（ポテンヒット多め）
    baseOutRate = CATCH.flyMedium;
  } else {
    // 深いフライ
    baseOutRate = CATCH.flyDeep;
  }

  const defenseBonus = (fielder.defense - 70) / 100 * 0.10 * weight;
  const speedBonus = (fielder.speed - 65) / 100 * 0.18 * weight;
  // ミート打者は野手の間を狙って打てる（ミート30以上から段階的に効果）
  const meetPlacementBonus = Math.max(0, (batter.meet || 50) - 30) / 100 * 0.14;
  // 強い打球ほど野手の頭を越えやすい
  const exitVeloBonus = Math.max(0, (exitVelocity - 147) / 100) * 0.18;
  const catchProb = Math.min(0.995, baseOutRate + defenseBonus + speedBonus - meetPlacementBonus - exitVeloBonus);

  if (Math.random() < catchProb) {
    const isDeepFly = distance > 70;
    // 落球（深い打球ほど難しい）。守備力の低い外野手は目測を誤る
    if (Math.random() < getErrorRate(fielder.defense, fielder.arm, isDeepFly ? 0.5 : 0.2)) {
      return { result: 'single', bases: 1, description: 'エラー（落球）',
        isError: true, errorPosition: position, fieldingPosition: position };
    }
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

  // 三塁打: コーナー寄り（＝外野手が追う距離が長い）+ 深い打球 + 足のある走者
  if (isCorner && distance > 84 && batterSpeed >= 55) {
    const tripleProb = 0.85 + (batterSpeed - 55) / 100 * 1.4;
    if (Math.random() < tripleProb) {
      return { result: 'triple', bases: 3, description: '三塁打！', fieldingPosition: position };
    }
  }

  // 二塁打: 野手から遠く落ちるほど、打球が強いほど、走者が速いほど二塁を狙える。
  // 旧実装は「95m超かつEV142+」の階段状の閾値で、外野の間を抜ける当たりの大半が
  // 単打になっていた（二塁打が安打の12%。実際は18%前後）。
  if (launchAngle >= 12 && launchAngle <= 42) {
    let doubleProb = 0;
    if (distance > 78) doubleProb += (distance - 78) / 25 * 1.10;   // 78m→0 / 103m→+1.10
    if (exitVelocity > 147) doubleProb += (exitVelocity - 147) / 20 * 0.55; // 167km→+0.55
    doubleProb += (batterSpeed - 60) / 100 * 0.30;
    if (Math.random() < Math.min(0.85, doubleProb)) {
      return { result: 'double', bases: 2, description: '二塁打！', fieldingPosition: position };
    }
  }

  // それ以外は単打（野手の前に落ちた or 弱い打球が抜けた）
  // 中継ミス: 外野手の返球〜内野の中継が乱れると走者が余分に進む。
  // 送り手＝外野手の肩、受け手＝遊撃/二塁の守備（カットマン）で判定する。
  const cutoff = defense?.short || defense?.second || { defense: 60 };
  if (Math.random() < getThrowErrorRate(fielder.arm, cutoff.defense, 0.3)) {
    return {
      result: 'single', bases: 1, description: 'ヒット！（中継ミス）',
      isError: true, errorPosition: position, fieldingPosition: position,
      isThrowingError: true, extraAdvance: true,
    };
  }
  return { result: 'single', bases: 1, description: 'ヒット！', fieldingPosition: position };
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
