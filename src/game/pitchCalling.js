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
import { resolvePitchCell, pickTargetCell } from './pitchZone.js';
import { objectiveAimShift, objectiveBallWeight } from './pitchSituation.js';

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
  pitcherControl = 50, objective = null,
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
  // 基礎項を持たせず canExecute だけに掛けている。制球50（リーグ平均）では
  // 配分が動かず、際どい要求は制球の高い投手に対してのみ発生する。
  // この経路は測るたびに四球のコストが利得を上回った。リードの価値は
  // 球種選択と失投抑制で出すこと。
  const canExecute = Math.max(0, (pitcherControl - 50) / 50);   // 制球50で0 / 100で1
  const lead = (catcherLead - 50) / 100 * (canExecute * 0.25);
  w = { zone: w.zone - lead, edge: w.edge + lead, chase: w.chase };

  // 選球眼の高い打者に誘い球は通じない → 際どいコースへ切り替える
  const eyeShift = (batterEye - 50) / 100 * 0.22;
  if (eyeShift > 0) { w.chase -= Math.min(w.chase, eyeShift); w.edge += Math.min(w.chase + eyeShift, eyeShift); }
  else { w.chase -= eyeShift; w.edge += eyeShift; }

  // 投球方針
  if (strategy === 'strikeout') { w.zone -= 0.08; w.chase += 0.08; }
  else if (strategy === 'contact') { w.zone += 0.10; w.chase -= 0.10; }

  // 場面による補正（走者一塁=併殺狙い / 走者三塁=三振狙い / 満塁=押し出し回避）。
  // **三振狙いだけは四球のコストを払う**が、それは1点を防ぐ価値がある場面に
  // 限られるから成立する。満塁では逆にゾーンへ寄せる（objectiveAimShift 参照）。
  // 3ボールのときは押し出し・四球が最優先なので場面補正を掛けない。
  if (objective && balls < 3) {
    const shift = objectiveAimShift(objective);
    if (shift) { w.zone += shift.zone; w.edge += shift.edge; w.chase += shift.chase; }
  }

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
 * @param {Object} batterZone 打者のコース適性（batterZone.js の getZoneProfile）
 * @param {number} catcherLead 捕手のリード（弱点を突く精度）
 * @returns {{inZone: boolean, quality: 'meatball'|'good'|'edge'|'waste'}}
 */
export function resolvePitchLocation({
  aim = 'edge', control = 50, catcherDefense = 50,
  batterZone = null, catcherLead = 0,
  sequence = null, velocity = 145, isBreaking = false, objective = 'normal',
} = {}) {
  // 【段階1】5×5=25ゾーンのグリッドで位置を決める（pitchZone.js）。
  // 捕手が狙うセルを決め、投手の制球でそこからのばらつきが決まる。
  // 従来の (inZone, quality) はセルから導出するので、下流のコードは変更不要。
  //
  // 失投(meatball)は投手の制球の問題であって捕手には防げない。
  // 捕手に出来るのは 1)最も効果的な球種とコースを要求する 2)際どい球をストライクに
  // する(フレーミング) 3)盗塁を刺す の3つ。
  //
  // 【段階3】同じ狙いの中で「どのセルを要求するか」を打者の弱点で選ぶ（pitchZone.js）。
  // zone/edge/chase の配分は動かさないので、ボールになる確率＝四球のコストは増えない。
  const c = clamp(control, 0, 100);
  const target = pickTargetCell(aim, {
    profile: batterZone, lead: catcherLead,
    // 【段階4】前球との関係（対角へ動かす／同じ引き出しを続けない）
    sequence, velocity, isBreaking,
    // 【段階6】場面による高さの要求（併殺狙い=低め / 三振狙い=高め）
    objective,
  });
  const cell = resolvePitchCell(target.cell, c);
  let { inZone, quality, col, row } = cell;

  // 【段階7】打者がコースを張れる度合い。
  // 捕手の要求が偏っているほど（＝softmaxの確率が高いほど）読まれる。
  // ただし**投手が狙った帯に投げられた場合だけ**。目標を外した球は張っていても
  // そこに来ないので、制球の低い投手は「読みにくい」という形になる。
  //
  // 判定はセル単位ではなく**帯（外/中/内 × 高/中/低）**。打者は
  // 「外角低め」に張るのであって「(1,3)のセル」に張るわけではない。
  // セル一致にすると発火率が1割程度にしかならず、機構が実質死ぬ。
  const band = (v) => (v <= 1 ? 0 : v === 2 ? 1 : 2);
  const onTarget = band(target.cell[0]) === band(col) && band(target.cell[1]) === band(row);
  const uni = target.uniform ?? 0.25;
  const readSignal = onTarget
    ? Math.max(0, (target.p - uni) / Math.max(1e-6, 1 - uni))
    : 0;

  // フレーミング: 際どい球の判定が捕手の守備力で動く。基準はリーグ平均の捕手(=50)
  const framing = (catcherDefense - 50) * 0.0018;
  if (quality === 'edge') {
    if (!inZone && framing > 0 && Math.random() < framing) inZone = true;
    else if (inZone && framing < 0 && Math.random() < -framing) inZone = false;
  }

  return { inZone, quality, col, row, readSignal };
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
    p = quality === 'meatball' ? 0.76 : quality === 'good' ? 0.64
      : quality === 'corner' ? 0.56 : 0.47;
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
  // ストライクゾーンの隅。ゾーン外の際どい球ほどではないが打ちにくい
  if (quality === 'corner') return { meet: -7, power: -5 };
  return { meet: 0, power: 0 };
}

// ============================================================
// 打者の狙い球（プレイヤーが張る場合） - 采配モード専用
// ============================================================

export const GUESS_TYPE_LABEL = { straight: '直球', breaking: '変化球' };
export const GUESS_ZONE_LABEL = { in: '内角', out: '外角', high: '高め', low: '低め' };

// 張っていた通りに来たとき、実際に「読み切れた」ことにする確率。
// 1.0 にしてはいけない。プレイヤーが半面に張るだけで全球読み切れてしまい、
// 内外角のどちらかに張り続けるのが常に得になる。
const COMMIT_HIT = 0.86;

/**
 * プレイヤーが張った狙い球の結果を、読みレベルの増減に変換する。
 *
 * 【設計】張るのは**賭け**であること。当たれば準備ができている（+1）、
 * 外せば張った方に体が動いていて対応が遅れる（-1）。
 * `おまかせ` は従来どおり捕手との読み合いをAIに任せる（0）。
 *
 * コースは「半面」で張る。5×5のセルを指定させるのは操作として重すぎるし、
 * 打者の実際の意識も「外角を待つ」という粒度だから。
 *
 * @param {'auto'|'straight'|'breaking'} typeGuess
 * @param {'auto'|'in'|'out'|'high'|'low'} zoneGuess
 * @param {{isBreaking:boolean, col:number, row:number}} pitch
 * @returns {{delta:number, typeHit:boolean|null, zoneHit:boolean|null}}
 */
export function resolveBatterGuess(typeGuess, zoneGuess, { isBreaking, col, row }) {
  let delta = 0, typeHit = null, zoneHit = null;

  if (typeGuess === 'straight' || typeGuess === 'breaking') {
    typeHit = (typeGuess === 'breaking') === !!isBreaking;
    if (typeHit) { if (Math.random() < COMMIT_HIT) delta += 1; }
    else delta -= 1;
  }

  if (zoneGuess && zoneGuess !== 'auto') {
    // 帯（外/中/内・高/中/低）で判定する。
    // **真ん中に来た球は中立**（当たりでも外れでもない）。ここを外れ扱いにすると、
    // 3分割なので正解の側に張っても期待値が負になり、機能として使う理由が無くなる
    // （実測: 捕手が内角を狙ってくる場面で「内角に張る」が OPS -0.013）。
    // 内角に張って真ん中に来ても致命傷ではない、という実感とも合う。
    const cb = col <= 1 ? 'out' : col === 2 ? 'mid' : 'in';
    const rb = row <= 1 ? 'high' : row === 2 ? 'mid' : 'low';
    const axisBand = (zoneGuess === 'in' || zoneGuess === 'out') ? cb : rb;
    if (axisBand === 'mid') zoneHit = null;
    else {
      zoneHit = zoneGuess === axisBand;
      if (zoneHit) { if (Math.random() < COMMIT_HIT) delta += 1; }
      else delta -= 1;
    }
  }

  return { delta, typeHit, zoneHit };
}

/**
 * 高さと球種の相性。**空振りを取れる高さは球種で逆になる**。
 *
 *   高めの速球  … 打者がバットの下を振る（三振が取れる古典的な球）
 *   低めの変化球 … 落ちる球。バットの上を振る
 *   低めの速球  … 抜け球と同じで、いちばん打たれる
 *   高めの変化球 … 「抜けたスライダー」。長打になる
 *
 * 対称なので母集団の平均は0＝リーグ成績は動かず、
 * 「どの高さにどの球種を要求するか」という配球の判断だけが効く。
 * これが無いと三振狙いの高め要求がフライを増やすだけで空振りを取れない。
 *
 * @param {number} row 0=高めボール 〜 4=低めボール
 * @param {boolean} isBreaking 変化球か
 */
export function getHeightPitchEffect(row, isBreaking) {
  const r = Math.max(-1, Math.min(1, row - 2));   // -1=高め / +1=低め
  const v = isBreaking ? r : -r;                  // 変化球は低いほど / 速球は高いほど有効
  return { meet: -v * 6, power: -v * 4 };
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
function scoreBall(ball, form, strategy, ballEffects, objective = 'normal') {
  const eff = ballEffects[ball.type] || ballEffects.straight || {};
  const levelFactor = (ball.level ?? 50) / 100;
  let score = ((eff.whiffBonus || 0) + (eff.groundballBonus || 0) + (eff.weakBonus || 0)) * levelFactor;
  // 未熟な球種は制球を損なう（breakingControlPenalty = (100-level)×0.20）。
  // これを score に入れないと、捕手が「効くが投げられない球」を要求してしまい、
  // 四球が増えて良い捕手ほど成績が悪化する（実測 BB/9 3.90→4.12）。
  score -= (1 - levelFactor) * 0.20;

  // フォーム相性: 縦変化はオーバーハンド、横変化はサイドスロー等
  const formEffect = PITCHING_FORM_EFFECTS[form] || PITCHING_FORM_EFFECTS.threeQuarter || {};
  if ((FORM_PITCH_SYNERGY[form] || []).includes(ball.type)) {
    if (VERTICAL_PITCHES.includes(ball.type)) score += (formEffect.verticalBreakBonus || 0) * levelFactor;
    if (HORIZONTAL_PITCHES.includes(ball.type)) score += (formEffect.horizontalBreakBonus || 0) * levelFactor;
  }

  // 投球方針: 三振狙いは空振りを、打たせて取るならゴロを重く見る
  if (strategy === 'strikeout') score += (eff.whiffBonus || 0) * 0.8 * levelFactor;
  else if (strategy === 'contact') score += (eff.groundballBonus || 0) * 0.8 * levelFactor;

  // 場面による重み。走者一塁ならシンカー、走者三塁ならフォークを選ぶ、という判断。
  // 「その球を持っていれば」効くので、球種構成がそのまま場面対応力になる。
  const ow = objectiveBallWeight(objective);
  if (ow.groundball) score += (eff.groundballBonus || 0) * ow.groundball * levelFactor;
  if (ow.whiff) score += (eff.whiffBonus || 0) * ow.whiff * levelFactor;

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
  lastWasBreaking = null, objective = 'normal',
} = {}) {
  const list = arsenal.length ? arsenal : [{ type: 'straight', level: 50 }];
  const straight = list.find(a => a.type === 'straight') || { type: 'straight', level: 50 };
  const breaking = list.filter(a => a.type !== 'straight');
  if (breaking.length === 0) return straight;

  const strategyBonus = strategy === 'strikeout' ? 0.12 : strategy === 'contact' ? -0.08 : 0;
  // 追い込んだ場面では、リードの高い捕手ほど決め球（変化球）を要求する
  const twoStrikeBonus = strikes >= 2 ? (catcherLead - 50) / 100 * 0.15 : 0;
  // 【奥行き】速球のあとは変化球、変化球のあとは速球。緩急も配球の1次元。
  // リードが高いほど意識的に球速帯を入れ替える。リード50では従来どおり動かない。
  const depthBonus = lastWasBreaking === null ? 0
    : (lastWasBreaking ? -1 : 1) * ((catcherLead - 50) / 100) * 0.30;
  const breakingChance = 0.35 + breaking.length * 0.06 + strategyBonus + twoStrikeBonus + depthBonus;
  if (Math.random() >= breakingChance) return straight;

  // どの変化球にするか。リードが高いほど「効く球」を選べる
  if (Math.random() < clamp(catcherLead / 100, 0, 1)) {
    const scored = breaking
      .map(b => ({ ball: b, score: scoreBall(b, form, strategy, ballEffects, objective) }))
      .sort((a, b) => b.score - a.score);
    const top = scored.slice(0, Math.max(1, Math.ceil(scored.length / 2)));
    return top[Math.floor(Math.random() * top.length)].ball;
  }
  return breaking[Math.floor(Math.random() * breaking.length)];
}

/**
 * 打者の球種予測（狙い球）が的中する確率。
 *
 * 【なぜここが捕手のリードの本体か】
 * 的中すると `calculatePhysicsContact` でタイミング窓が **1.3倍** に広がる。
 * 球種固有の空振り効果（whiffBonus 最大0.10）や制球ペナルティより桁が大きく、
 * 「配球で打者の狙いを外す」という捕手の仕事がそのまま結果に効く経路になる。
 *
 * 従来:
 *   - 自動シミュレーションは 0.3/0.2 の固定値で、リードも球種数も無視していた
 *   - 采配モードはリードを見ていたが係数0.02で、3球種の投手だと
 *     リード100でも的中率が 0.313→0.273 と13%しか下がらなかった
 *
 * リーグ平均のリード50で従来の中心値(0.25)に一致するよう中心を合わせてある。
 *
 * @param {number} arsenalSize 持ち球の総数（ストレート込み）
 */
/**
 * AI打者が「ヤマを張る」確率（カウント別）。
 *
 * 【なぜ必要か】従来のAI打者は読みが外れても代償が無く、0 か +1 しか取らなかった。
 * つまり良い捕手は「読ませない」ことしかできず、**読み違えさせることができなかった**。
 * リードの価値が頭打ちになっていた原因がここにある。
 *
 * 張れば当たったとき大きい（+2 = タイミング窓×1.50）が、外せば -1（×0.84）。
 * 打者有利のカウントほど張り、追い込まれたら当てにいく（張らない）という
 * 実際の打者の行動に合わせてある。
 */
export function batterCommitRate({ balls = 0, strikes = 0 } = {}) {
  if (strikes >= 2) return 0.08;          // 追い込まれたら当てにいく
  if (balls > strikes) return 0.40;       // 打者有利。狙い球を絞れる
  if (strikes > balls) return 0.15;
  return 0.25;
}

export function guessSuccessRate({ catcherLead = 50, arsenalSize = 3, batterEye = 50 } = {}) {
  // 持ち球が1種類なら何が来るか分かる
  if (arsenalSize <= 1) return 0.95;

  // リード0 = 配球が完全にランダム。打者は持ち球数ぶんの1で当てられる
  //   （2種類なら50% / 3種類33% / 4種類25%）
  // リード100 = その8割を外す（2種類→10% / 3種類→6.7% / 4種類→5%）
  // 「的中率20%」という絶対値にすると、持ち球5種類以上の投手では
  // 完全ランダム(20%)と同じになりリードが無意味になるため、割合で定義する。
  const chance = 1 / arsenalSize;
  const t = clamp(catcherLead, 0, 100) / 100;
  const base = chance * (1 - 0.8 * t);

  // 選球眼の高い打者は球種を読む
  const eyeMult = 1 + (clamp(batterEye, 0, 100) - 50) / 100 * 0.4;
  return clamp(base * eyeMult, 0.02, 0.8);
}
