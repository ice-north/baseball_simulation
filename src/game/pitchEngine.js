// 1球の計算（自動の試合と采配の試合で共用する正本）。
//
// ⚠ ここが**ただ1つの**1球の計算。以前は采配の試合（App.jsx の simulateSinglePitch）が
//    別の写しを持っていて、スタミナの効き方・カウントの補正・守備の値の作り方が
//    自動の試合と食い違っていた。オンラインと一人用の自動の試合はここで動き、
//    数字の調整もこちらで行ってきたので、こちらを正本にした（2026-11-24）。
//
// 自動の試合は `control` を渡さない。采配の試合だけが `control` で
// 人の指示（球種・コース・狙い球・打撃の指示・エンドラン）を差し込む。
// `control` が無いときの乱数を引く順番は変えないこと（replay-hash-check が見張る）。
import { STRATEGY_MODS } from '../online/tactics.js';
import { calculatePhysicsContact, calculateBattedBallPhysics, judgeFielderReach, getTunnelingEffect, spinAdjustedArsenal } from '../simulation-logic.js';
import { PITCHING_FORM_EFFECTS, DP_BASE, pitchVelocityDrop, isUnreadablePitch } from '../utils/constants.js';
import { conditionBattingMod, CONDITION_PITCHING_MODIFIER, CONDITION_LEVELS, batterFatiguePenalty } from './condition.js';
import { getPositionFitness, getHandednessEffect } from '../utils/physics.js';
import { contactFoulProbability, isDirectionalFoul } from './contactRules.js';
import { callPitchTarget, resolvePitchLocation, decideSwing, ballZoneContactChance, getPitchQualityEffect, getHeightPitchEffect, BALL_ZONE_PENALTY, selectPitchType, infieldDefenseOf, guessSuccessRate, resolveBatterGuess } from './pitchCalling.js';
import { getZoneProfile, getZoneMatchupEffect, combineBatterEffects, zoneWeaknessAt } from './batterZone.js';
import { decideSwingPower, getSwingPowerEffect } from './swingType.js';
import { pushCall, lastCall, sequenceShift, shiftMeetAdjust, locationReadChance,
  pushSwingQuality, decayFooled, fooledLevel } from './pitchSequence.js';
import { decidePitchObjective } from './pitchSituation.js';
import { hitByPitchChance } from './pitchZone.js';
import { getBatterType, resolveAiBatterGuess } from './batterType.js';
import { getDeception, deceptionAxis } from './deception.js';
import { effectiveArsenalSize, activeArsenal } from './arsenal.js';

// 投手の持ち球（打席の間は変わらないので、打席の頭で1回だけ作って `simulateOnePitch` に渡す）。
// 封印した球は投げない（arsenal.js）。練習・成長からは消さない。
// 回転数を変化量へ織り込む（回転の高い投手は変化球も少し曲がる）。
// ここで一度だけ掛けることで、球種選択・球速減・コース・スイング判断・
// 物理エンジンのすべてが同じ実効変化量で動く（simulation-logic.js）。
// `arsenalSize` は似た球を打ち消した実効的な持ち球数（狙い球の的中率に使う）。乱数は引かない
export const pitchArsenalOf = (pitcherPlayer) => {
  const arsenal = spinAdjustedArsenal(
    activeArsenal(pitcherPlayer.pitching?.arsenal), pitcherPlayer.pitching?.spinRate ?? 50);
  return { arsenal, arsenalSize: effectiveArsenalSize(arsenal) };
};

/**
 * 守備の値（守備位置の適性を反映: 適性100→100%、適性0→50%）。守備方針の得と損も乗せる。
 * 守るのは出場中の野手（DH を除く）と、いまマウンドにいる投手。
 */
export const fieldDefenseOf = (team, currentPitcher) => {
  const defense = {};
  const defStrat = team.strategy?.defense || 'normal';
  // 守備方針の得と損（数字は tactics.js の STRATEGY_MODS。画面の説明も同じ表から）
  const defMod = STRATEGY_MODS.defense[defStrat] || {};
  const infieldBonus = defMod.infield || 0;
  const outfieldBonus = defMod.outfield || 0;
  const infieldPositions = ['first', 'second', 'short', 'third', 'catcher', 'pitcher'];

  // DH制: 投手はbattingOrder=0だが守備参加、DHはbattingOrder>0だが守備不参加
  team.players.filter(p =>
    (p.battingOrder > 0 && p.battingOrder <= 9 && !p._isDH) ||
    (p.position === 'pitcher' && p.id === currentPitcher?.id)
  ).forEach(player => {
    const fitness = getPositionFitness(player, player.position);
    const fitnessMult = 0.5 + (fitness / 100) * 0.5;
    const posBonus = infieldPositions.includes(player.position) ? infieldBonus : outfieldBonus;
    defense[player.position] = {
      defense: Math.round((player.fielding?.defense || 50) * fitnessMult) + posBonus,
      speed: Math.round((player.physical?.speed || 50) * fitnessMult),
      arm: Math.round((player.physical?.arm || 50) * fitnessMult),
      throws: player.physical?.throws || 'right'
    };
  });
  return defense;
};

/**
 * 1球を投げる。
 *
 * @param {object} a
 * @param {object} a.batterPlayer / a.pitcherPlayer / a.catcherPlayer 選手そのもの
 * @param {object} a.defense `fieldDefenseOf` の形
 * @param {{balls:number, strikes:number}} a.count
 * @param {number} a.pitcherStamina この球を投げる前の残りスタミナ（満タン＝pitching.stamina）
 * @param {Array} a.bases 塁（走者そのもの、または false）
 * @param {number} a.outs
 * @param {object} a.sequence 打席の配球メモリ（pitchSequence.js）
 * @param {object} [a.offenseStrategy] / [a.defenseStrategy] 球団の方針（team.strategy）
 * @param {{arsenal:Array, arsenalSize:number}} a.pitchArsenal `pitchArsenalOf` の答え
 * @param {object} [a.observer] 記録用（pitchDetail だけ読む）
 * @param {object} [a.control] 采配の試合の人の指示。無ければ全部おまかせ
 *   - pitchIndex: 持ち球の何番目を投げるか（null=捕手のリード）
 *   - aim: コースの狙い（null=捕手のリード）
 *   - guessType / guessZone: 打者の狙い球（'auto'=打者の型に任せる）
 *   - swingMult: 振る確率に掛ける（待て=0.55 / 積極=1.3）
 *   - swingFloor: 振る確率の下限（エンドラン=0.92）
 *   - approach: 振り方の方針（'take' | 'balanced' | 'aggressive'）
 * @returns {{result:object, guessRight:boolean, info:object}}
 *   result は打席の処理が読む結果。info は画面の表示だけが読む（球種・球速・コース・打球）
 */
export const simulatePitch = (a) => {
  const state = { guessRight: false, info: {} };
  const result = pitchCore(a, state);
  return { result, guessRight: state.guessRight, info: state.info };
};

const pitchCore = ({ batterPlayer, pitcherPlayer, catcherPlayer, defense, count, pitcherStamina, bases, outs,
  sequence, offenseStrategy, defenseStrategy, pitchArsenal, observer = null, control = null }, state) => {
  const info = state.info;
  // 前球（打席内の配球メモリ。詳細は pitchSequence.js）
  const lastPitch = lastCall(sequence);
  // この場面で捕手が求める結果（併殺狙い / 三振狙い / 通常。pitchSituation.js）
  const objective = decidePitchObjective(bases, outs);
  const battingStrat = offenseStrategy?.batting || 'balanced';
  const pitchingStrat = defenseStrategy?.pitching || 'balanced';

  // 打撃方針の効果
  const batMod = STRATEGY_MODS.batting[battingStrat] || {};
  const stratMeetMod = batMod.meet || 0;
  const stratPowerMod = batMod.power || 0;
  const stratEyeMod = batMod.eye || 0;

  // コンディション補正
  const batterCondition = batterPlayer.condition ?? CONDITION_LEVELS.NORMAL;
  const pitcherCondition = pitcherPlayer.condition ?? CONDITION_LEVELS.NORMAL;
  const batterCondMod = conditionBattingMod(batterCondition);
  const pitcherCondMod = CONDITION_PITCHING_MODIFIER[pitcherCondition] || 0;

  // 疲労による能力低下（疲労0→0%, 疲労50→-5%, 疲労100→-15%）
  const fatiguePenalty = batterFatiguePenalty(batterPlayer.fatigue);

  // 精神力によるチャンス/ピンチ補正
  const isClutch = bases[1] || bases[2]; // 得点圏にランナー
  const batterMental = batterPlayer.personality?.mental ?? 50;
  const pitcherMental = pitcherPlayer.personality?.mental ?? 50;
  const batterClutchMod = isClutch ? Math.round((batterMental - 50) / 10) : 0;
  const pitcherClutchMod = isClutch ? Math.round((pitcherMental - 50) / 10) : 0;

  const batter = {
    meet: (batterPlayer.batting?.meet || 50) + stratMeetMod + batterCondMod.meet - fatiguePenalty + batterClutchMod,
    power: (batterPlayer.batting?.power || 50) + stratPowerMod + batterCondMod.power - fatiguePenalty + batterClutchMod,
    eye: (batterPlayer.batting?.eye || 50) + stratEyeMod - Math.floor(fatiguePenalty * 0.5),
    speed: (batterPlayer.physical?.speed || 50) - fatiguePenalty,
    bats: batterPlayer.batting?.bats || 'right',
    // コース適性（内外角・高低の得手不得手）。25セルは持たず2数値から導出する
    zone: getZoneProfile(batterPlayer),
  };

  // 投手の疲労ペナルティ（打者と同じ二次曲線: 疲労0→0, 50→-4, 100→-15）
  const pitcherFatigue = pitcherPlayer.fatigue || 0;
  const pitcherFatiguePenalty = pitcherFatigue > 0 ? Math.round(pitcherFatigue * pitcherFatigue / 670) : 0;

  const pitcherFormEffect = PITCHING_FORM_EFFECTS[pitcherPlayer.pitching?.form] || PITCHING_FORM_EFFECTS.threeQuarter;
  const pitcher = {
    velocity: Math.round((pitcherPlayer.pitching?.velocity || 140) * (pitcherFormEffect.velocityMult || 1.0)) - pitcherFatiguePenalty,
    control: (pitcherPlayer.pitching?.control || 50) + pitcherCondMod - pitcherFatiguePenalty + pitcherClutchMod,
    throws: pitcherPlayer.physical?.throws || 'right',
    spinRate: pitcherPlayer.pitching?.spinRate ?? 50
  };

  // スタミナによる能力低下（2次曲線: スタミナ50%以下で急激に低下）
  const pitcherMaxStamina = pitcherPlayer.pitching?.stamina || 100;
  const staminaRatio = Math.max(0, Math.min(pitcherStamina / pitcherMaxStamina, 1));
  const staminaCurve = staminaRatio * staminaRatio; // 0→0, 0.5→0.25, 0.7→0.49, 1.0→1.0
  const effectiveControl = pitcher.control * (0.6 + 0.4 * staminaCurve);
  const effectiveVelocity = pitcher.velocity * (0.88 + 0.12 * staminaCurve);

  // 左右相性
  const handEffect = getHandednessEffect(pitcher.throws, batter.bats);

  // 投球する球種を選択（捕手のリードが効く。詳細は pitchCalling.js）。
  // 従来はここで変化球を完全ランダムに選んでおり、采配モードだけが
  // リードでスコア選択していた。リーグ成績を作るのは自動側なので、
  // 捕手のリード能力が成績にまったく反映されていなかった。
  // 持ち球（`arsenal`・`arsenalSize`）は打席の頭で1回だけ作る（`pitchArsenalOf`）
  const { arsenal, arsenalSize } = pitchArsenal;
  const aiPitch = selectPitchType({
    arsenal,
    catcherLead: catcherPlayer?.catching?.lead ?? 50,
    form: pitcherPlayer.pitching?.form || 'threeQuarter',
    strategy: pitchingStrat,
    strikes: count.strikes,
    // 奥行き: 速球のあとは変化球、変化球のあとは速球（リードが高いほど意識する）
    lastWasBreaking: lastPitch ? lastPitch.isBreaking : null,
    // 場面: 走者一塁ならゴロ系、走者三塁なら空振り系の決め球を選ぶ
    objective: objective.goal,
    // 到達球速で曲がりの効き(breakEfficiency)が変わるので投手の速球を渡す
    velocity: effectiveVelocity,
    // 崩した直後は球速帯を替えずに畳み掛けてよい（pitchSequence.js）
    fooled: fooledLevel(sequence),
    // 守備の堅いチームではゴロ・凡打を狙う球の値打ちが上がる
    infieldDefense: infieldDefenseOf(defense),
  });
  // 采配: 人が球種を指定していればそれを投げる（捕手のリードは使わない）
  const selectedPitch = (control?.pitchIndex != null && arsenal[control.pitchIndex]) || aiPitch;
  info.pitch = selectedPitch;


  // 変化球の球速減速（緩急効果）
  // 球種ごとの球速減。**采配モードと同じ式を使う**（constants.js）。
  // 以前はここだけ `8 + level/100×15` で、Lv100なら全球種が一律 -23 だった
  let pitchVelocityFinal = effectiveVelocity
    - pitchVelocityDrop(selectedPitch.type, selectedPitch.level ?? 50);

  // 緩急ペナルティ: **前球との**球速差で打者のタイミングが狂う（比率ベース）。
  // 遅い投手ほど同じ球速差でも体感の緩急が大きくなる。
  // 従来は前球ではなく「その投手のストレート」と比べていたうえ、そもそも
  // lastPitch が常に null だったため一度も発火していなかった。
  let speedDiffPenalty = 0;
  if (lastPitch && lastPitch.velocity) {
    const veloDiff = Math.abs(lastPitch.velocity - pitchVelocityFinal);
    const speedDiffRatio = veloDiff / Math.max(lastPitch.velocity, pitchVelocityFinal);
    speedDiffPenalty = speedDiffRatio * 22;
  }

  // ===== 配球 → 投球位置 → スイング判定 =====
  // 制球は「ストライク率」ではなく「狙った所へ投げられる再現性」として効く。
  // 詳細は pitchCalling.js 参照。采配の試合もこの関数で投げる（useManagedGame.jsx）。
  const isBreaking = selectedPitch.type !== 'straight';
  // 変化球のばらつきは pitchShape.shapeSigma に一本化した
  // （旧 breakingControlPenalty。自動と采配で係数が 0.20 / 0.30 と食い違っていた）
  // 投球方針は配球だけを変える（contact=ゾーンで勝負しやすく / strikeout=誘い球を増やす。
  // callPitchTarget・selectPitchType 側）。⚠ 以前は打たせて取るに制球+4が付いていた
  // （選ぶだけで勝率 .524。いしだ 2026-11-13「型で強さを変えない」で外した）

  // 采配: 人がコースを指定していればそこを狙う
  const aim = control?.aim || callPitchTarget({
    balls: count.balls, strikes: count.strikes, batterEye: batter.eye,
    catcherLead: catcherPlayer?.catching?.lead ?? 50, strategy: pitchingStrat,
    pitcherControl: effectiveControl, objective,
  });
  const loc = resolvePitchLocation({
    aim,
    control: effectiveControl,
    catcherDefense: catcherPlayer?.fielding?.defense ?? 50,
    // 捕手は打者の弱点コースを要求する（狙いの配分は変えない）
    batterZone: batter.zone,
    catcherLead: catcherPlayer?.catching?.lead ?? 50,
    // 前球との関係（対角へ動かす／同じ引き出しを続けない）
    sequence, velocity: pitchVelocityFinal, isBreaking,
    // 場面: 併殺が欲しければ低め、三振が欲しければ高め
    objective: objective.goal,
    // 球種に合ったコース（速球=高め / スライダーは逃げる側）と、
    // 変化球レベルによる決まりやすさ
    pitchType: selectedPitch.type, pitchLevel: selectedPitch.level ?? 50,
    pitcherThrows: pitcher.throws, batterBats: batter.bats,
  });

  // 揺さぶれた球は打ちにくく、同じ所へ続けた球は打たれやすい（リーグ平均で±0）
  const shift = sequenceShift(lastPitch,
    { col: loc.col, row: loc.row, velocity: pitchVelocityFinal });
  const shiftMeet = shiftMeetAdjust(shift);
  // 同じ引き出しが続くと打者に読まれる。的中の効果は球種の読みと同じ
  // 打者の狙い球（コース）。捕手の要求の偏りと、同じ引き出しの繰り返しで読む
  const locationRead = Math.random()
    < locationReadChance(sequence, loc.col, loc.row, isBreaking, batter.eye, loc.readSignal);

  // 打者の型（野村の4分類）ごとの狙い方。batterType.js
  const aiGuess = resolveAiBatterGuess({
    type: getBatterType(batterPlayer), player: batterPlayer,
    balls: count.balls, strikes: count.strikes,
    isBreaking, col: loc.col, sequence, batterEye: batter.eye,
    // ナックルは読み合いが成立しない（誰にもどこへ来るか分からない）
    // ⚠ 代入は記録（捕手の「狙い球を外した率」）のためだけ。乱数を引く順番は変えない
    guessRight: (state.guessRight = !isUnreadablePitch(selectedPitch.type) && Math.random() < guessSuccessRate({
      catcherLead: catcherPlayer?.catching?.lead ?? 50,
      // **何球種持っているかではなく、どれだけ幅があるか**（arsenal.js）。
      // 似た球（スライダー＋カット等）は同じ引き出しとして数えない
      arsenalSize, batterEye: batter.eye,
      // 崩された直後は球種を読むどころではない
      fooled: fooledLevel(sequence),
      // 出どころが見えなければ球種も判断できない（deception.js）
      deception: deceptionAxis(getDeception(pitcherPlayer)),
    })),
  });
  // 采配: 人が狙い球を張った打者は、打者の型の読みを使わない（当たれば+1 / 外せば-1）。
  // ナックルは球種を張っても当たり外れが付かず、コースだけが残る
  const guessType = control?.guessType || 'auto';
  const guessZone = control?.guessZone || 'auto';
  const committed = guessType !== 'auto' || guessZone !== 'auto';
  const userGuess = committed
    ? resolveBatterGuess(isUnreadablePitch(selectedPitch.type) ? 'auto' : guessType, guessZone,
        { isBreaking, col: loc.col, row: loc.row })
    : null;
  const guessLevel = committed
    ? Math.max(-2, Math.min(2, userGuess.delta + (guessZone === 'auto' && locationRead ? 1 : 0)))
    : Math.max(-2, Math.min(2, aiGuess.level + (locationRead ? 1 : 0)));
  const dirBias = committed ? 0 : aiGuess.dirBias;
  const aiSwingMult = committed ? 1 : (aiGuess.swingMult ?? 1);
  pushCall(sequence, {
    col: loc.col, row: loc.row, isBreaking,
    velocity: pitchVelocityFinal, type: selectedPitch.type,
  });

  observer?.pitchDetail?.({ type: selectedPitch.type, velocity: pitchVelocityFinal, col: loc.col, row: loc.row });
  info.velocity = pitchVelocityFinal;
  info.loc = loc;

  // そのセルが打者にとってどれだけ苦手か。スイング判断・打撃補正・振り方で共有する
  const weakness = zoneWeaknessAt(loc, batter.zone);
  const swung = decideSwing({
    inZone: loc.inZone, quality: loc.quality, strikes: count.strikes, batterEye: batter.eye,
    pitcherControl: effectiveControl, isBreaking, breakingLevel: selectedPitch.level || 50,
    // 高めの速球は振ってもらえ、低めの速球は手が出ない（`heightSwingBias`）
    row: loc.row,
    // 打者は自分の得意コースをより振る
    zoneWeakness: weakness,
    // B型は張っていないコースを見送る。采配の打撃の指示（待て/積極）もここに掛かる
    approachMult: control?.swingMult != null ? aiSwingMult * control.swingMult : aiSwingMult,
    // 采配: エンドランは打者を必ず打ちにいかせる
    swingFloor: control?.swingFloor ?? null,
    // 崩された打者はゾーンを広げる（pitchCalling.js）
    fooled: fooledLevel(sequence),
  });

  // 打球の解決。投球位置の質（甘い球=meatball / 際どい球=edge / ボール球）で
  // 打者の実効ミート・パワーを補正してから物理エンジンに渡す。
  const resolveContact = (mod) => {
    const effBatter = {
      ...batter,
      meet: Math.max(1, Math.min(100, batter.meet + (mod?.meet || 0))),
      power: Math.max(1, Math.min(100, batter.power + (mod?.power || 0))),
      // C型（方向決定型）が決めた打球方向
      dirBias,
    };
    const pitchData = {
      type: selectedPitch.type,
      velocity: pitchVelocityFinal,
      level: selectedPitch.level || 50
    };
    const tunnelingEffect = lastPitch ? getTunnelingEffect(lastPitch, pitchData, catcherPlayer?.catching?.lead || 50) : 0;

    // 物理コンタクト計算
    const physicsResult = calculatePhysicsContact(
      { velocity: effectiveVelocity, throws: pitcher.throws, form: pitcherPlayer.pitching?.form || 'threeQuarter', spinRate: pitcherPlayer.pitching?.spinRate ?? 50,
        deception: deceptionAxis(getDeception(pitcherPlayer)) },
      effBatter,
      // 打者の狙い球。球種とコースを別々に張り、当たった数で効果が変わる
      // （1つ=タイミング窓×1.30 / 両方=×1.50。simulation-logic.js）。
      // 従来は球種だけで、しかも 0.3/0.2 の固定値だった。
      guessLevel,
      pitchData,
      tunnelingEffect,
      handEffect
    );

    info.timingWindow = physicsResult.timingWindow;
    info.timingError = physicsResult.timingError;
    // 崩されたか（芯品質）を打席の記憶に残す。次の球の振り方に効く
    pushSwingQuality(sequence, physicsResult.isContact ? physicsResult.meetQuality : null);
    if (!physicsResult.isContact) {
     
      return { type: 'swinging_strike' };
    }

    // ファウル: タイミングを外した打球は左右のファウルゾーンへ切れる。
    // 実データでは全投球の約17%（＝コンタクトの4割弱）がファウルで、打席が長引く。
    // これが無いとコンタクトが即座に打席を終わらせてしまい、四球が構造的に出ない。
    const foulProb = contactFoulProbability(physicsResult.meetQuality, count.strikes);
    if (Math.random() < foulProb) {
      return { type: 'foul' };
    }

    // 打球物理パラメータ計算
    // 緩急（前球との速度差）を打球方向に効かせるため lastPitch を渡す
    const battedBall = calculateBattedBallPhysics(effBatter, pitcher, pitchData, physicsResult, loc, lastPitch);

    if (isDirectionalFoul(battedBall.direction)) return { type: 'foul' };

    // 守備判定
    const fieldResult = judgeFielderReach(battedBall, defense, effBatter);
    // 画面の表示用（采配の試合の投球ログ・打球の文）。判定には使わない
    info.contact = {
      exitVelocity: battedBall.exitVelocity, launchAngle: battedBall.launchAngle,
      distance: battedBall.distance, meetQuality: battedBall.meetQuality,
      description: fieldResult.description,
    };
    // 打球の向き・飛距離・角度と処理した野手（オンラインの打席速報が読む。表示専用で、判定には使わない）
    const batted = {
      direction: battedBall.direction, distance: battedBall.distance, launchAngle: battedBall.launchAngle,
      fielder: fieldResult.fieldingPosition || null,
    };

    if (fieldResult.result === 'homerun') {
      return { type: 'homerun', batted };
    } else if (fieldResult.result === 'out') {
      // 2アウトからは併殺が成立しない（打者アウトで3アウト目）。
      // outs のチェックが無かったため、2アウトから「4アウト目」が記録され
      // 投手の投球回がわずかに水増しされていた。
      // 併殺。**内野ゴロのアウトなら距離は問わない**。
      // 以前は `distance < 40` も条件にしていたが、この分岐に来た時点で
      // 内野手が捕球している（外野へ抜けた打球は 'out' にならない）ので
      // 二重の門番になっており、実NPBの1/4しか併殺が出ていなかった。
      if (bases[0] && outs < 2 && battedBall.launchAngle < 10
          && !fieldResult.isOutfieldFly) {
        const ifDefense = ['second', 'short'].map(p => defense[p]?.defense || 50);
        const ifAvg = ifDefense.reduce((a, b) => a + b, 0) / 2;
        // 走者の足が速いと二塁が間に合わない／一塁がセーフになる
        const runnerSpeed = bases[0]?.physical?.speed ?? 55;
        const dpBase = DP_BASE + (ifAvg - 50) * 0.35 - (runnerSpeed - 55) * 0.30;
        if (Math.random() * 100 < dpBase) {
          return { type: 'double_play', batted };
        }
      }
      return {
        type: 'out',
        isOutfieldFly: fieldResult.isOutfieldFly || false,
        // 内野ゴロは走者を進める（ゴロGO・進塁打）。フライ・ライナーは進まない
        isGroundOut: battedBall.launchAngle < 10 && !fieldResult.isOutfieldFly,
        tagupThrowbackChance: fieldResult.tagupThrowbackChance || 0,
        fieldingPosition: fieldResult.fieldingPosition,
        batted,
      };
    } else if (fieldResult.result === 'triple') {
      return { type: 'triple', fieldingPosition: fieldResult.fieldingPosition, batted };
    } else if (fieldResult.result === 'double') {
      return { type: 'double', fieldingPosition: fieldResult.fieldingPosition, batted };
    } else {
      return {
        type: 'single',
        isError: fieldResult.isError || false,
        hitWithError: !!fieldResult.hitWithError,
        errorPosition: fieldResult.errorPosition,
        fieldingPosition: fieldResult.fieldingPosition,
        // 悪送球・中継ミスは走者が余分に1つ進む
        extraAdvance: !!fieldResult.extraAdvance || !!fieldResult.isThrowingError,
        batted,
      };
    }
  };

  // コース適性: 苦手なコースに来るとミート・パワーが落ちる（得意なら上がる）。
  // 母集団の平均は0なのでリーグ成績は動かず、打者ごとの差だけが出る。
  // コース適性 + 前球からの揺さぶり（どちらもリーグ平均では±0）
  // 振り方: 得意コース・打者有利カウントならフルスイング、
  // 苦手コース・2ストライクなら当てにいく（swingType.js）
  const swingPower = swung ? decideSwingPower({
    weakness, balls: count.balls, strikes: count.strikes,
    // 前の球で崩されていれば当てにいく（pitchSequence.js）
    fooled: fooledLevel(sequence),
    meet: batter.meet, power: batter.power, approach: control?.approach ?? battingStrat,
  }) : 0;
  info.swung = swung;
  info.swingPower = swingPower;
  const matchup = combineBatterEffects(
    combineBatterEffects(
      combineBatterEffects(getZoneMatchupEffect(loc, batter.zone),
        // 高めの速球・低めの変化球は空振りを取れる（逆は打たれる）
        getHeightPitchEffect(loc.row, isBreaking)),
      getSwingPowerEffect(swingPower)),
    { meet: shiftMeet, power: shiftMeet * 0.6 });

  if (loc.inZone) {
    if (!swung) { decayFooled(sequence); return { type: 'called_strike' }; }
    const q = combineBatterEffects(getPitchQualityEffect(loc.quality), matchup);
    const breakingPenalty = isBreaking ? (selectedPitch.level || 50) * 0.12 : 0;
    const contactChance = 82 + (batter.meet + q.meet) * 0.45
      + (handEffect.meetBonus || handEffect.meetPenalty || 0) - breakingPenalty - speedDiffPenalty;
    if (Math.random() * 100 >= contactChance) { pushSwingQuality(sequence, null); return { type: 'swinging_strike' }; }
    return resolveContact(q);
  }

  // ボールゾーン。振ってしまった場合は半分以上バットに当たり、凡打になる。
  // 以前は「20%ファウル / 80%空振り」で打球が一切発生せず、chase率を上げると
  // 三振だけが増えてしまう構造だった。
  if (!swung) {
    decayFooled(sequence);
    // あまりにも内角へ外れた球は打者に当たる（pitchZone.js）。
    // 振って当たればストライクなので、見送った球にだけ問う
    if (Math.random() < hitByPitchChance(loc.col, loc.row)) {
      return { type: 'hit_by_pitch', velocity: pitchVelocityFinal };
    }
    return { type: 'ball' };
  }
  if (Math.random() >= ballZoneContactChance(batter.eye)) { pushSwingQuality(sequence, null); return { type: 'swinging_strike' }; }
  if (Math.random() < 0.56) return { type: 'foul' };
  return resolveContact(combineBatterEffects(BALL_ZONE_PENALTY, matchup));
};
