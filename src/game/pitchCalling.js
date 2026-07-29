// ============================================================
// 配球と投球位置の決定 - pitchCalling.js
//
// 采配モード（App.jsx の simulateSinglePitch）と自動シミュレーション
// （autoSimulation.js）で共有する、1球ごとの「狙い → 結果」モデル。
//
// 【設計】制球は「ストライク率」ではなく「狙った所へ投げられる再現性」。
//   ① 捕手が狙いを決める（callPitchTarget）
//        zone  = ゾーンで勝負       edge = 際どいコース
//        chase = 誘い球（意図的なボール球）
//   ② 制球で狙い通りに行くかが決まる（resolvePitchLocation）
//        狙い通り → ストライク or 有効な釣り球
//        外れる   → 四球になるボール、あるいは甘く入った失投（長打リスク）
//   ③ 打者が振るかを判定（decideSwing）
//
// これにより「制球100 = ストライク率100%」ではなく
// 「制球100 = 狙い通りに投げられる（勝負球はゾーン94%・誘い球はゾーンすぐ外87%）」
// になり、ストライク率75%・四球率5%という実在の好投手像が自然に出る。
//
// 【実データの目標値】
//   ゾーン率 48-50% / ゾーン内スイング率 65-68% / ボール球スイング率(chase) 28-31%
//   ストライク率 62-63%（加藤貴之クラスで75%）/ 四球率 8.5% / 三振率 19-22%
// ============================================================

import { BALL_EFFECTS, PITCHING_FORM_EFFECTS, FORM_PITCH_SYNERGY } from '../utils/constants.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 制球の効き（リーグ平均の制球57を支点にした -1.0〜+1.0 の正規化値）。
// 線形にすると四球数の幅が 制球20で6.6個 / 制球100で1.4個 にしか開かない。
// 四球は「1球ごとのボール率」に対して指数的に反応するため、両端を引き離すには
// 支点から離れるほど効きを強める必要がある（上位帯は特に加速させる）。
//   制球20→×1.34 / 40→×1.04 / 57→0 / 80→×1.87 / 100→×2.20
// 結果: 9イニングあたりの四球が 制球20で7.3個 → 制球100で0.69個 まで開く。
// 上限は加藤貴之2022（148回2/3で与四球11＝BB/9 0.67）を基準にしている。
// ここをさらに下げるとゾーン率が実データの上限55%を大きく超えてしまう。
const cc = (c) => { const t = (clamp(c, 0, 100) - 57) / 43;
  return t >= 0 ? t * (1 + 1.2 * t) : t * (1 - 0.10 * t); };

export const AIM_LABEL = { zone: '勝負', edge: '際どく', chase: '誘い' };

/**
 * 捕手の配球（狙いの決定）。
 * カウント・打者の選球眼・捕手のリード・投球方針で「どこを狙うか」を決める。
 * @returns {'zone'|'edge'|'chase'}
 */
export function callPitchTarget({
  balls = 0, strikes = 0, batterEye = 50, catcherLead = 50, strategy = 'normal',
  pitcherControl = 50,
} = {}) {
  // カウント別の基本方針。3ボールならストライクを取りに行き、
  // 追い込んでいれば誘い球を増やす（実際の配球と同じ）
  let w;
  if (balls >= 3)          w = { zone: 0.66, edge: 0.32, chase: 0.02 };
  else if (strikes === 2)  w = { zone: 0.20, edge: 0.42, chase: 0.38 };
  else if (strikes > balls) w = { zone: 0.26, edge: 0.46, chase: 0.28 };
  else if (balls > strikes) w = { zone: 0.48, edge: 0.42, chase: 0.10 };
  else                      w = { zone: 0.34, edge: 0.48, chase: 0.18 };

  // 捕手のリード: 際どいコースを要求できるのは配球が上手い捕手。
  // ただし**投手が投げ切れる時に限る**。制球の低い投手に無闇にコーナーを
  // 要求しても四球が増えるだけで、実測では良い捕手ほど防御率が悪化した
  // （係数を0.20→0.80にすると リード30で3.07 / リード90で3.39）。
  // 良い捕手は投手の制球を見て、勝負どころを選ぶ。
  const canExecute = Math.max(0, (pitcherControl - 50) / 50);   // 制球50で0 / 100で1
  const lead = (catcherLead - 50) / 100 * (0.12 + canExecute * 0.6);
  w = { zone: w.zone - lead, edge: w.edge + lead, chase: w.chase };

  // 選球眼の高い打者に誘い球は通じない → 際どいコースへ切り替える
  const eyeShift = (batterEye - 50) / 100 * 0.22;
  if (eyeShift > 0) { w.chase -= Math.min(w.chase, eyeShift); w.edge += Math.min(w.chase + eyeShift, eyeShift); }
  else { w.chase -= eyeShift; w.edge += eyeShift; }

  // 投球方針
  if (strategy === 'strikeout') { w.zone -= 0.08; w.chase += 0.08; }
  else if (strategy === 'contact') { w.zone += 0.10; w.chase -= 0.10; }

  const zone = Math.max(0.02, w.zone), edge = Math.max(0.02, w.edge), chase = Math.max(0, w.chase);
  const total = zone + edge + chase;
  const r = Math.random() * total;
  if (r < zone) return 'zone';
  if (r < zone + edge) return 'edge';
  return 'chase';
}

/**
 * 狙いと制球から実際の投球位置を決定する。
 * quality は打球品質に反映される（meatball=失投で長打、edge=打ち損じ）。
 * @param {'zone'|'edge'|'chase'} aim 狙い
 * @param {number} control 実効制球（スタミナ・球種レベルのペナルティ適用後）
 * @param {number} catcherDefense 捕手の守備力（フレーミング。リーグ平均50が基準）
 * @returns {{inZone: boolean, quality: 'meatball'|'good'|'edge'|'waste'}}
 */
export function resolvePitchLocation({ aim = 'edge', control = 50, catcherDefense = 50 } = {}) {
  const c = clamp(control, 0, 100);
  let inZone, quality;

  if (aim === 'zone') {
    // ゾーンで勝負。制球が低いと入っても真ん中（甘い球）になる
    if (Math.random() < 0.704 + cc(c) * 0.146) {          // 制球20→57% / 57→70% / 100→102%(=ほぼ必ず)
      inZone = true;
      quality = Math.random() < 0.42 - c * 0.0032 ? 'meatball' : 'good';
    } else {
      inZone = false; quality = 'edge';                // ゾーンすぐ外 → 釣り球として機能する
    }
  } else if (aim === 'edge') {
    // 際どいコース。決まればストライク、外し方は制球次第
    if (Math.random() < 0.4294 + cc(c) * 0.181) {          // 制球20→22% / 57→43% / 100→83%
      inZone = true; quality = 'edge';
    } else if (Math.random() < 0.30 - c * 0.0022) {   // 制球40→21% / 100→8%
      inZone = true; quality = 'meatball';             // 甘く入った失投
    } else {
      inZone = false;
      quality = Math.random() < 0.7495 + cc(c) * 0.151 ? 'edge' : 'waste';
    }
  } else {
    // 誘い球（意図的なボール）。制球が高いほど「ゾーンすぐ外」に決まり振ってもらえる
    if (Math.random() < 0.7665 + cc(c) * 0.194) {          // 制球20→54% / 57→77% / 100→>100%(=必ず)
      inZone = false; quality = 'edge';
    } else if (Math.random() < 0.34 - c * 0.0026) {   // 制球40→24% / 100→8%
      inZone = true; quality = 'meatball';             // 抜けて甘く入る
    } else {
      inZone = false; quality = 'waste';               // 明らかなボール
    }
  }

  // フレーミング: 際どい球の判定が捕手の守備力で動く。基準はリーグ平均の捕手(=50)
  const framing = (catcherDefense - 50) * 0.0018;
  if (quality === 'edge') {
    if (!inZone && framing > 0 && Math.random() < framing) inZone = true;
    else if (inZone && framing < 0 && Math.random() < -framing) inZone = false;
  }

  return { inZone, quality };
}

/**
 * 打者がスイングする確率。采配モード（打撃方針・エンドラン等の補正を掛ける）で使う。
 */
export function swingProbability({
  inZone, quality, strikes = 0, batterEye = 50, pitcherControl = 50,
  isBreaking = false, breakingLevel = 50,
} = {}) {
  let p;
  if (inZone) {
    p = quality === 'meatball' ? 0.76 : quality === 'good' ? 0.64 : 0.47;
    p += strikes * 0.10;                       // 追い込まれたら振る
    p += (50 - batterEye) * 0.0006;            // 選球眼が低いと闇雲に振る（効果は小）
  } else if (quality === 'edge') {
    // ゾーンすぐ外の釣り球。実データのchase率28-31%の主役
    p = 0.44 - batterEye * 0.0036 + strikes * 0.09;
    // 制球の良い投手のボール球は「ストライクに見える」ため振ってもらえる。
    // 加藤貴之のようにストライク率70%超に達する投手はこの経路で四球が減る
    p += cc(pitcherControl) * 0.060;
    if (isBreaking) p += breakingLevel * 0.0010;
  } else {
    // 明らかなボール球。よほど選球眼が悪くないと振らない
    p = 0.11 - batterEye * 0.0009 + strikes * 0.04;
  }
  return clamp(p, 0.02, 0.97);
}

/**
 * 打者がスイングするかを判定する（自動シミュレーション用のbool版）。
 * ゾーン内スイングはカウントが進むほど増える（追い込まれたら守りに入る）。
 * 以前は「2ストライクで振らなくなる」逆向きの式だった。
 */
export function decideSwing({ approachMult = 1, ...opts } = {}) {
  return Math.random() < clamp(swingProbability(opts) * approachMult, 0.02, 0.97);
}

/**
 * ボール球に手を出したときバットに当たる確率。
 * 自動シミュレーションは従来「20%ファウル / 80%空振り」で打球が一切発生せず、
 * chase率を上げると三振だけが増えてしまう構造だった。
 */
export function ballZoneContactChance(batterEye = 50) {
  return 0.68 + (100 - batterEye) / 100 * 0.14;   // 選球眼50→75% / 20→79% / 85→70%
}

/**
 * 投球位置の質を打者能力の補正に変換する。
 * 甘く入った失投は長打され、際どいコースは打ち損じる。
 */
export function getPitchQualityEffect(quality) {
  if (quality === 'meatball') return { meet: 5, power: 3 };
  if (quality === 'edge') return { meet: -10, power: -8 };
  return { meet: 0, power: 0 };
}

/** ボール球を打ったときの打球品質ペナルティ（泳いだ・引っ掛けた当たり） */
export const BALL_ZONE_PENALTY = { meet: -4, power: -2 };

// ============================================================
// 球種の選択（捕手のリード）
// ============================================================

/**
 * 球種1つの「効き」をスコア化する。
 * 球種固有の効果(空振り/ゴロ/凡打誘発) × 球種レベル + 投球フォームとの相性。
 */
function scoreBall(ball, form, strategy, ballEffects) {
  const eff = ballEffects[ball.type] || ballEffects.straight || {};
  const levelFactor = (ball.level ?? 50) / 100;
  let score = ((eff.whiffBonus || 0) + (eff.groundballBonus || 0) + (eff.weakBonus || 0)) * levelFactor;

  // フォーム相性: 縦変化はオーバーハンド、横変化はサイドスロー等
  const formEffect = PITCHING_FORM_EFFECTS[form] || PITCHING_FORM_EFFECTS.threeQuarter || {};
  if ((FORM_PITCH_SYNERGY[form] || []).includes(ball.type)) {
    if (VERTICAL_PITCHES.includes(ball.type)) score += (formEffect.verticalBreakBonus || 0) * levelFactor;
    if (HORIZONTAL_PITCHES.includes(ball.type)) score += (formEffect.horizontalBreakBonus || 0) * levelFactor;
  }

  // 投球方針: 三振狙いは空振りを、打たせて取るならゴロを重く見る
  if (strategy === 'strikeout') score += (eff.whiffBonus || 0) * 0.8 * levelFactor;
  else if (strategy === 'contact') score += (eff.groundballBonus || 0) * 0.8 * levelFactor;

  return score;
}

const VERTICAL_PITCHES = ['curve', 'fork', 'splitter', 'knuckle', 'sinker', 'palm'];
const HORIZONTAL_PITCHES = ['slider', 'shoot', 'cutter', 'twoSeam'];

/**
 * 捕手が球種を要求する。
 *
 * 【設計】ストレートか変化球かは球種構成と投球方針で決まり、
 * **捕手のリードは「どの変化球を選ぶか」に効く**。
 * リードでストレートまで含めて最良の1球を選ばせると、スコア上ストレートは
 * 常に最下位（whiff 0 / gb 0 / weak -0.04）なので、リードの高い捕手のチームが
 * 変化球しか投げなくなり、実データの速球率45-55%から大きく外れる。
 *
 * 従来、自動シミュレーションは変化球を完全ランダムに選んでおり、
 * 捕手のリードは球種選択に一切効いていなかった（采配モードだけがスコアで
 * 選んでいた）。リーグ成績を作るのは自動側なので、リード能力が成績に
 * 反映されない状態だった。
 *
 * @returns {Object} arsenal の中から選ばれた球種
 */
export function selectPitchType({
  arsenal = [], catcherLead = 50, form = 'threeQuarter',
  strategy = 'normal', strikes = 0, ballEffects = BALL_EFFECTS,
} = {}) {
  const list = arsenal.length ? arsenal : [{ type: 'straight', level: 50 }];
  const straight = list.find(a => a.type === 'straight') || { type: 'straight', level: 50 };
  const breaking = list.filter(a => a.type !== 'straight');
  if (breaking.length === 0) return straight;

  const strategyBonus = strategy === 'strikeout' ? 0.12 : strategy === 'contact' ? -0.08 : 0;
  // 追い込んだ場面では、リードの高い捕手ほど決め球（変化球）を要求する
  const twoStrikeBonus = strikes >= 2 ? (catcherLead - 50) / 100 * 0.15 : 0;
  const breakingChance = 0.35 + breaking.length * 0.06 + strategyBonus + twoStrikeBonus;
  if (Math.random() >= breakingChance) return straight;

  // どの変化球にするか。リードが高いほど「効く球」を選べる
  if (Math.random() < clamp(catcherLead / 100, 0, 1)) {
    const scored = breaking
      .map(b => ({ ball: b, score: scoreBall(b, form, strategy, ballEffects) }))
      .sort((a, b) => b.score - a.score);
    const top = scored.slice(0, Math.max(1, Math.ceil(scored.length / 2)));
    return top[Math.floor(Math.random() * top.length)].ball;
  }
  return breaking[Math.floor(Math.random() * breaking.length)];
}
