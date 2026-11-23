import { humanTeamNames } from './teamControl.js';
import { TEAMS_DATA, LEAGUE_SETTINGS } from '../teams-data.js';
import { autoStarterRole, isPitcherPlayer } from '../utils/constants.js';
import { lineupConditionMod, batterFatiguePenalty } from './condition.js';

// ポジション別の攻守バランス重み
const POSITION_WEIGHTS = {
  standard: {
    catcher:  { offenseWeight: 0.35, defenseWeight: 0.65 },
    short:    { offenseWeight: 0.40, defenseWeight: 0.60 },
    center:   { offenseWeight: 0.45, defenseWeight: 0.55 },
    second:   { offenseWeight: 0.45, defenseWeight: 0.55 },
    third:    { offenseWeight: 0.55, defenseWeight: 0.45 },
    right:    { offenseWeight: 0.60, defenseWeight: 0.40 },
    left:     { offenseWeight: 0.65, defenseWeight: 0.35 },
    first:    { offenseWeight: 0.75, defenseWeight: 0.25 },
    dh:       { offenseWeight: 1.00, defenseWeight: 0.00 },
  },
  offense: {
    catcher:  { offenseWeight: 0.60, defenseWeight: 0.40 },
    short:    { offenseWeight: 0.65, defenseWeight: 0.35 },
    center:   { offenseWeight: 0.70, defenseWeight: 0.30 },
    second:   { offenseWeight: 0.70, defenseWeight: 0.30 },
    third:    { offenseWeight: 0.80, defenseWeight: 0.20 },
    right:    { offenseWeight: 0.85, defenseWeight: 0.15 },
    left:     { offenseWeight: 0.90, defenseWeight: 0.10 },
    first:    { offenseWeight: 0.95, defenseWeight: 0.05 },
    dh:       { offenseWeight: 1.00, defenseWeight: 0.00 },
  },
  defense: {
    catcher:  { offenseWeight: 0.00, defenseWeight: 1.00 },
    short:    { offenseWeight: 0.00, defenseWeight: 1.00 },
    center:   { offenseWeight: 0.00, defenseWeight: 1.00 },
    second:   { offenseWeight: 0.00, defenseWeight: 1.00 },
    third:    { offenseWeight: 0.00, defenseWeight: 1.00 },
    right:    { offenseWeight: 0.00, defenseWeight: 1.00 },
    left:     { offenseWeight: 0.00, defenseWeight: 1.00 },
    first:    { offenseWeight: 0.00, defenseWeight: 1.00 },
    dh:       { offenseWeight: 1.00, defenseWeight: 0.00 },
  },
};

// ============================================================
// 【疲労と調子を織り込む】いしだ 2026-11-22「スタメン設定の疲労による自動設定が
// 効いていないように感じます」。
//
// ⚠ **実際に一度も見ていなかった**。CPU の組むスタメン（`autoSimulation.js` の
//    `generateAILineup`）は疲労と調子で選手を入れ替えるのに、一人用の「自動: 標準/
//    打撃重視/守備重視」はここを通り、`fatigue` も `condition` も読んでいなかった。
//    疲れた主力がいつまでもスタメンに残り、休ませる導線が無かった。
// ⚠ **式は CPU と同じにすること**（`getEffectiveBatting`・`fatigueMalus`。補正の式は `condition.js` の1か所）。
//    片方だけ直すと、自軍と相手で「疲れたら誰を使うか」の判断が食い違う。
// ============================================================
/** 疲労と調子を織り込んだ打撃（この関数を通してから点を付ける）。補正は CPU と同じ（`condition.js`） */
const effBatting = (p) => {
  const b = p?.batting || {};
  const d = lineupConditionMod(p?.condition) - batterFatiguePenalty(p?.fatigue);
  return {
    meet: (b.meet || 0) + d,
    power: (b.power || 0) + d,
    eye: (b.eye || 0) + d,
    speed: p?.physical?.speed || 0,
  };
};
/**
 * 疲れをどれだけ気にするか（スタメン設定で選ぶ。`team.restPolicy` に残る）。
 *
 * ⚠ いしだ 2026-11-22「もっと敏感に、疲労を感じ取ってほしいです。設定方法も
 *    スタメン設定でできるように」。最初の実装（疲労41で0.95倍・61で0.85倍・81で0.70倍）は
 *    鈍すぎて、控えより10高い主力が疲労55まで出続けた。
 * ⚠ `from` から**1ごとに `rate`** 落ちる倍率を守備位置の点に掛ける。`floor` が下限。
 *    倍率が「控えとの実力の比」を下回ると入れ替わるので、**実力差は覆らない**。
 * ⚠ 打撃の目減り（`effBatting`。疲労²/1200）は**どの設定でも掛かる**。
 *    疲れた選手の打撃が落ちるのは実際に起きることで、好みの問題ではない。
 */
export const REST_POLICIES = {
  none:   { label: '見ない',   from: 999, rate: 0,     floor: 1.00 },
  low:    { label: '控えめ',   from: 50,  rate: 0.012, floor: 0.70 },
  normal: { label: '標準',     from: 30,  rate: 0.012, floor: 0.55 },
  high:   { label: '積極的',   from: 15,  rate: 0.016, floor: 0.35 },
};
export const DEFAULT_REST_POLICY = 'normal';
/** 設定の名前 → 中身（知らない名前・未設定は標準） */
export const restPolicyOf = (key) => REST_POLICIES[key] || REST_POLICIES[DEFAULT_REST_POLICY];
/** 疲れた選手を外へ押す倍率（休養を促す） */
const fatigueRestMult = (p, policy) => {
  const r = policy || REST_POLICIES[DEFAULT_REST_POLICY];
  const over = (p?.fatigue || 0) - r.from;
  return over <= 0 ? 1.0 : Math.max(r.floor, 1.0 - over * r.rate);
};

// 打撃力スコア（疲労・調子こみ）
const calcOffenseScore = (player) => {
  const b = effBatting(player);
  return b.meet * 1.0 +
         b.power * 1.3 +
         b.eye * 0.7 +
         b.speed * 0.3;
};

// 守備力スコア（ポジション別）
const calcDefenseScore = (player, position, mode = 'standard') => {
  const f = player.fielding || {};
  const ph = player.physical || {};
  const fitness = player.positionFitness?.[position] || 0;

  // 適性曲線（ラインナップ生成専用。ゲームシミュレーション本体は別計算）
  // defense: fitness²曲線 — 30→0.09, 50→0.25, 70→0.49, 100→1.0
  // standard/offense: fitness^1.5 — 30→0.16, 50→0.35, 70→0.59, 100→1.0 (旧:0.5+f/200で30→0.65)
  const fitnessMult = mode === 'defense'
    ? (fitness / 100) ** 2
    : (fitness / 100) ** 1.5;

  let baseDefense;
  if (position === 'catcher') {
    baseDefense = (f.defense || 0) * 0.5 + (player.catching?.lead || 0) * 0.5;
  } else if (position === 'center' || position === 'left' || position === 'right') {
    baseDefense = (f.defense || 0) * 0.5 + (ph.speed || 0) * 0.3 + (ph.arm || 0) * 0.2;
  } else if (position === 'short' || position === 'second') {
    baseDefense = (f.defense || 0) * 0.6 + (ph.speed || 0) * 0.25 + (ph.arm || 0) * 0.15;
  } else {
    baseDefense = (f.defense || 0) * 0.6 + (ph.arm || 0) * 0.25 + (ph.speed || 0) * 0.15;
  }

  // 守備重視モードでは適性ボーナスを追加（適性100で+20pt、80で+12pt、60以下で0）
  const fitnessBonus = mode === 'defense'
    ? Math.max(0, (fitness - 60) / 40) * 20
    : 0;

  return baseDefense * fitnessMult + fitnessBonus;
};

// ポジションでの総合価値
const calcPositionValue = (player, position, mode = 'standard', policy = null) => {
  const weights = POSITION_WEIGHTS[mode] || POSITION_WEIGHTS.standard;
  const w = weights[position] || { offenseWeight: 0.5, defenseWeight: 0.5 };
  const offense = calcOffenseScore(player);
  const defense = calcDefenseScore(player, position, mode);

  // 適性ペナルティ: 打撃力で適性のなさを穴埋めできないようにする
  // sqrt(fitness/100): 適性30→×0.55, 50→×0.71, 70→×0.84, 100→×1.0
  // これにより適性30の外野手がファーストで高打撃力を持っていても不適切
  const fitness = player.positionFitness?.[position] || 0;
  const fitnessPenalty = position === 'dh' ? 1.0 : Math.sqrt(fitness / 100);

  // ⚠ 疲れた選手は**同じ点では残らない**（`fatigueRestMult`）。打撃の目減り
  //    （`calcOffenseScore`）だけだと守備重視の枠で疲労が素通りする
  return (offense * w.offenseWeight + defense * w.defenseWeight) * fitnessPenalty
    * fatigueRestMult(player, policy);
};

// 貪欲法によるポジション割り当て
function greedyAssignment(candidates, positions, trialSeed, mode = 'standard', policy = null) {
  const assigned = new Set();
  const assignment = {};

  const posOrder = [...positions];
  if (trialSeed > 0) {
    const priorityOrder = mode === 'offense'
      ? ['dh', 'first', 'left', 'right', 'third', 'center', 'second', 'short', 'catcher']
      : ['catcher', 'short', 'center', 'second', 'third', 'right', 'left', 'first', 'dh'];
    const shuffled = priorityOrder.filter(p => posOrder.includes(p));
    if (trialSeed % 3 === 1) {
      shuffled.reverse();
    } else if (trialSeed % 3 === 2) {
      const mid = Math.floor(shuffled.length / 2);
      const reordered = [...shuffled.slice(mid), ...shuffled.slice(0, mid)];
      shuffled.length = 0;
      shuffled.push(...reordered);
    }
    posOrder.length = 0;
    posOrder.push(...shuffled);
  } else {
    const priorityOrder = mode === 'defense'
      ? ['catcher', 'short', 'center', 'second', 'third', 'right', 'left', 'first', 'dh']
      : mode === 'offense'
      ? ['dh', 'first', 'left', 'right', 'third', 'center', 'second', 'short', 'catcher']
      : ['catcher', 'short', 'center', 'second', 'third', 'right', 'left', 'first', 'dh'];
    posOrder.length = 0;
    posOrder.push(...priorityOrder.filter(p => positions.includes(p)));
  }

  posOrder.forEach(pos => {
    let bestCandidate = null;
    let bestValue = -Infinity;

    candidates.forEach(ps => {
      if (assigned.has(ps.player.id)) return;

      const fitness = ps.player.positionFitness?.[pos] || 0;
      if (pos !== 'dh') {
        // 守備重視: 適性70未満は除外（ファースト/レフトは50）
        // 標準: 本来ポジションは0以上、難ポジ(短/捕/中/二)は40以上、ファースト/レフトは40以上、他は20以上
        // 打撃重視: 10未満除外（ファースト/レフトは除外なし）
        const isLenient = pos === 'first' || pos === 'left';
        const isNative = ps.player.position === pos;
        const hardPos = pos === 'short' || pos === 'catcher' || pos === 'center' || pos === 'second';
        const threshold = mode === 'defense' ? (isLenient ? 50 : 70)
          : mode === 'offense' ? (isLenient ? 0 : 10)
          : (isNative ? 0 : hardPos ? 40 : 40);
        if (fitness < threshold) return;
      }

      // 本来のポジションには優先ボーナス
      // standard: 30（同程度なら本来ポジション優先）
      // offense/defense: 5（モード特化スコアが本来ポジション優先を上回れるように）
      const nativeBonus = ps.player.position === pos ? (mode === 'standard' ? 30 : 5) : 0;
      const value = calcPositionValue(ps.player, pos, mode, policy) + nativeBonus;
      if (value > bestValue) {
        bestValue = value;
        bestCandidate = ps;
      }
    });

    if (bestCandidate) {
      assignment[pos] = bestCandidate;
      assigned.add(bestCandidate.player.id);
    }
  });

  if (Object.keys(assignment).length < positions.length) {
    const remaining = positions.filter(p => !assignment[p]);
    const unassignedPlayers = candidates.filter(ps => !assigned.has(ps.player.id));
    remaining.forEach(pos => {
      if (unassignedPlayers.length === 0) return;
      let best = null;
      let bestValue = -Infinity;
      // フォールバックでも適性30未満は除外（ただしDHは除く）
      const fallbackThreshold = pos === 'dh' ? 0 : 30;
      const eligible = unassignedPlayers.filter(ps =>
        (ps.player.positionFitness?.[pos] || 0) >= fallbackThreshold || ps.player.position === pos
      );
      const pool = eligible.length > 0 ? eligible : unassignedPlayers; // 全員除外なら緊急措置
      for (const ps of pool) {
        const nativeBonus = ps.player.position === pos ? (mode === 'standard' ? 30 : 5) : 0;
        const value = calcPositionValue(ps.player, pos, mode, policy) + nativeBonus;
        if (value > bestValue) {
          bestValue = value;
          best = ps;
        }
      }
      if (best) {
        assignment[pos] = best;
        assigned.add(best.player.id);
        unassignedPlayers.splice(unassignedPlayers.indexOf(best), 1);
      }
    });
  }

  return Object.keys(assignment).length === positions.length ? assignment : null;
}

// 打順編成（野球セオリーに基づく）
function assignBattingOrder(lineupPlayers, mode = 'standard') {
  const players = [...lineupPlayers];
  const order = [];

  // 点の高い順に並べる比較（`score` は選手を受け取る）。`byBatting` は疲労と調子を織り込んだ打撃に点を付ける
  const byScore = (score) => (a, b) => score(b.player) - score(a.player);
  const byBatting = (score) => byScore(p => score(effBatting(p)));

  const pick = (sortFn) => {
    if (players.length === 0) return null;
    players.sort(sortFn);
    const picked = players[0];
    players.splice(0, 1);
    order.push(picked);
    return picked;
  };

  if (mode === 'offense') {
    // 打撃重視: パワー・ミート最優先の打順
    // 1番: 出塁+走力
    pick(byBatting(e => e.meet * 1.0 + e.eye * 1.2 + e.speed * 0.8));
    // 2番: 強打者（最強バランス）
    pick(byBatting(e => e.meet * 1.1 + e.power * 1.0 + e.eye * 0.6));
    // 3番: パワー+ミート
    pick(byBatting(e => e.power * 1.2 + e.meet * 1.0));
    // 4番: 最強パワー
    pick(byBatting(e => e.power * 1.5 + e.meet * 0.5));
    // 5番: パワー2番手
    pick(byBatting(e => e.power * 1.3 + e.meet * 0.7));
    // 6-9: 残りを打力順
    while (players.length > 0) {
      pick(byScore(calcOffenseScore));
    }
  } else if (mode === 'defense') {
    // 守備重視: 守備力の低い選手を上位打線に（打席多く回す）、守備力高い選手は下位で守備集中
    const withScores = players.map(p => ({
      ...p,
      offScore: calcOffenseScore(p.player),
      defScore: calcDefenseScore(p.player, p.position, 'defense'),
    }));

    // 打力でソートし、上位から打順を決める
    withScores.sort((a, b) => b.offScore - a.offScore);

    // 1番: 出塁+走力
    const leadoff = withScores.reduce((best, p) => {
      const s = (p.player.batting?.meet || 0) * 0.8 + (p.player.batting?.eye || 0) * 1.0 + (p.player.physical?.speed || 0) * 1.2;
      const bs = (best.player.batting?.meet || 0) * 0.8 + (best.player.batting?.eye || 0) * 1.0 + (best.player.physical?.speed || 0) * 1.2;
      return s > bs ? p : best;
    });
    order.push(leadoff);
    const remaining = withScores.filter(p => p !== leadoff);

    // 2番: つなぎ（ミート+選球眼）
    remaining.sort(byBatting(e => e.meet * 1.2 + e.eye * 0.8 + e.speed * 0.5));
    order.push(remaining.shift());

    // 3番: バランス
    remaining.sort(byBatting(e => e.meet * 1.0 + e.power * 1.0 + e.eye * 0.5));
    order.push(remaining.shift());

    // 4番: パワー最優先
    remaining.sort(byBatting(e => e.power * 1.5 + e.meet * 0.5));
    order.push(remaining.shift());

    // 5-9: 残りを打力順
    remaining.sort((a, b) => b.offScore - a.offScore);
    order.push(...remaining);
    players.length = 0;
  } else {
    // 標準: 従来のセオリー打順
    // 1番: 出塁率+走力（俊足巧打）
    pick(byBatting(e => e.meet * 0.8 + e.eye * 1.0 + e.speed * 1.2));
    // 2番: ミート+選球眼（つなぎ役）
    pick(byBatting(e => e.meet * 1.2 + e.eye * 0.8 + e.power * 0.3 + e.speed * 0.5));
    // 3番: 最強打者（ミート+パワー）
    pick(byBatting(e => e.meet * 1.0 + e.power * 1.2 + e.eye * 0.5));
    // 4番: 最強パワーヒッター
    pick(byBatting(e => e.power * 1.5 + e.meet * 0.7 + e.eye * 0.3));
    // 5番: パワー2番手
    pick(byBatting(e => e.power * 1.3 + e.meet * 0.8 + e.eye * 0.4));
    // 6番: バランス型
    pick(byBatting(e => e.meet + e.power + e.eye * 0.5));
    // 7番: 残り打力順
    pick(byScore(calcOffenseScore));
    // 8番: 残り打力順（非DH時は8番に弱い打者を置き9番投手の前で走者を出す）
    pick(byBatting(e => e.speed * 0.5 + e.meet * 0.5));
    // 9番: 残り
    if (players.length > 0) {
      order.push(players[0]);
      players.splice(0, 1);
    }
  }

  return order;
}

// AIオーダー編成関数
// mode: 'standard' | 'offense' | 'defense'
// ⚠ `given` を渡せば TEAMS_DATA を引かない。オンライン版は名簿をサーバーから
//    受け取るので TEAMS_DATA に居ない（渡さないと黙って何もしない関数になる）
export const generateOptimalLineup = (teamName, mode = 'standard', given = null, restKey = null) => {
  const team = given || TEAMS_DATA?.[teamName];
  if (!team) {
    console.error('チームデータが見つかりません:', teamName);
    return;
  }
  // 疲れをどれだけ気にするか。スタメン設定で選んだ値が球団に残る（`team.restPolicy`）。
  // ⚠ 呼び出しで渡せば球団の設定より優先（画面がボタンごとに試すとき用）
  const policy = restPolicyOf(restKey ?? team.restPolicy);

  const useDH = LEAGUE_SETTINGS.useDH;
  // isActive=false（練習生）は除外。未設定は全員有効（大学モード以外の後方互換）
  const fielders = team.players.filter(p =>
    (!p.position || p.position !== 'pitcher' || p.isTwoWay) && p.isActive !== false
  );
  const positions = ['catcher', 'first', 'second', 'short', 'third', 'left', 'center', 'right'];

  // 全選手×全ポジションの価値マトリクスを構築
  const playerScores = fielders.map(p => ({
    player: p,
    offense: calcOffenseScore(p),
    positions: {}
  }));

  playerScores.forEach(ps => {
    positions.forEach(pos => {
      ps.positions[pos] = calcPositionValue(ps.player, pos, mode, policy);
    });
  });

  // 候補選出: モードに応じてソート基準を変える
  const sortedCandidates = [...playerScores].sort((a, b) => {
    if (mode === 'defense') {
      // 守備重視: 各ポジションで発揮できる最大守備スコアでソート
      const aVal = Math.max(...positions.map(pos => calcDefenseScore(a.player, pos, mode)));
      const bVal = Math.max(...positions.map(pos => calcDefenseScore(b.player, pos, mode)));
      return bVal - aVal;
    }
    if (mode === 'offense') {
      // 打撃重視: ミート+パワーの合計でソート（ユーザー要望通り）
      const aOff = effBatting(a.player).meet + effBatting(a.player).power;
      const bOff = effBatting(b.player).meet + effBatting(b.player).power;
      return bOff - aOff;
    }
    return b.offense - a.offense;
  });
  const numSlots = useDH ? 9 : 8;
  const candidatePoolSize = mode === 'defense'
    ? Math.min(numSlots + 8, fielders.length)
    : Math.min(numSlots + 4, fielders.length);
  const candidates = sortedCandidates.slice(0, candidatePoolSize);

  // 難守備ポジション（捕手・遊撃・二塁・中堅）: 適性の高い選手が候補にいない場合、ロスターから追加
  // 閾値50で判定（元80は高すぎて適性79の本来の遊撃手が追加されないバグがあった）
  const candidateIds = new Set(candidates.map(ps => ps.player.id));
  for (const mustPos of ['catcher', 'short', 'second', 'center', 'third', 'first', 'left', 'right']) {
    // まず本職がプールに居ることを保証する。適性50以上が1人居れば良しとすると、
    // 例えば「遊撃(二塁適性77)が1人」でこの条件を満たしてしまい、その選手が
    // 遊撃に入った結果、二塁に適性30の選手が回る、という編成が出来ていた。
    if (candidates.some(ps => ps.player.position === mustPos)) continue;
    const native = sortedCandidates.find(ps => !candidateIds.has(ps.player.id) && ps.player.position === mustPos);
    if (native) { candidates.push(native); candidateIds.add(native.player.id); continue; }
    // 本職がロスターに居ない場合だけ、適性50以上の選手で代替する
    if (candidates.some(ps => (ps.player.positionFitness?.[mustPos] || 0) >= 50)) continue;
    const best = sortedCandidates.find(ps => !candidateIds.has(ps.player.id) && (ps.player.positionFitness?.[mustPos] || 0) >= 50);
    if (best) { candidates.push(best); candidateIds.add(best.player.id); }
  }

  // 最適なポジション割り当てを探索
  let bestAssignment = null;
  let bestTotalValue = -Infinity;

  const targetPositions = useDH ? [...positions, 'dh'] : positions;

  for (let trial = 0; trial < 20; trial++) {
    const assignment = greedyAssignment(candidates, targetPositions, trial, mode, policy);
    if (!assignment) continue;

    let totalValue = Object.entries(assignment).reduce((sum, [pos, ps]) => {
      return sum + calcPositionValue(ps.player, pos, mode, policy);
    }, 0);

    // 難守備ポジションを適性のない選手で埋めた編成は採らない。
    // 試行ごとに割り当て順を入れ替える（trialSeed % 3 === 1 で反転）ため、
    // 捕手が最後に回った試行では「捕手を守れる選手が既に他へ取られ、
    // 適性30の右翼手が捕手に入る」編成が出来る。他の8人が最適に収まるので
    // calcPositionValue の適性ペナルティ(√)だけでは総合値で勝ててしまう。
    // 適性55未満は「本来そこを守れない選手」なので強く減点する。守備の難しい
    // ポジションほど重い。全トライアルが低適性なら最もマシな案が残るだけなので、
    // ロスターが薄くて埋められない場合に編成が失敗することはない。
    const HARD_POSITION_WEIGHT = { catcher: 2.0, short: 1.2, second: 1.2, center: 1.0 };
    for (const [pos, ps] of Object.entries(assignment)) {
      if (pos === 'dh') continue;
      const fit = ps.player.positionFitness?.[pos] ?? 0;
      if (fit >= 55) continue;
      totalValue -= (55 - fit) * 5 * (HARD_POSITION_WEIGHT[pos] ?? 0.6);
    }

    if (totalValue > bestTotalValue) {
      bestTotalValue = totalValue;
      bestAssignment = assignment;
    }
  }

  if (!bestAssignment) return;

  // 打順決定
  const lineupPlayers = Object.entries(bestAssignment).map(([pos, ps]) => ({
    player: ps.player,
    position: pos,
    offense: ps.offense
  }));

  const lineupOrder = assignBattingOrder(lineupPlayers, mode);

  // lineupSettingsに保存
  if (!team.lineupSettings) {
    team.lineupSettings = {
      battingOrder: [],
      benchPlayers: [],
      substitutionRules: { pinchHitter: [], pinchRunner: [] }
    };
  }

  // splice で直接変更（新配列を作るとバグが出る）
  team.lineupSettings.battingOrder.length = 0;

  lineupOrder.forEach((entry, index) => {
    team.lineupSettings.battingOrder.push({
      playerId: entry.player.id,
      battingOrder: index + 1,
      position: entry.position,
    });
  });

  // 非DH: 投手を9番に追加
  if (!useDH) {
    const pitchers = team.players.filter(p => p.position === 'pitcher');
    if (pitchers.length > 0) {
      const starterId = team.pitchingRotation?.starters?.[0] || pitchers[0].id;
      team.lineupSettings.battingOrder.push({
        playerId: starterId,
        position: 'pitcher',
        battingOrder: 9,
      });
    }
  }

  // 旧形式の打順も維持（DH の印も外す。打順に入る人だけ付け直す。`generateAILineup` の説明を参照）
  team.players.forEach(p => { p.battingOrder = 0; delete p._isDH; });

  team.lineupSettings.battingOrder.forEach(entry => {
    const teamPlayer = team.players.find(p => p.id === entry.playerId);
    if (teamPlayer) {
      teamPlayer.battingOrder = entry.battingOrder;
      if (entry.position === 'dh') {
        teamPlayer._isDH = true;
      } else if (entry.position !== 'pitcher') {
        teamPlayer.position = entry.position;
        delete teamPlayer._isDH;
      }
    }
  });
};

// 全チームのオーダーと投手ローテーションを自動で組む（⚠ 画面の言葉に「AI」は出さない）
export const generateAllTeamsLineup = (allTeams) => {
  allTeams.forEach(teamName => {
    generateOptimalLineup(teamName);
    generatePitchingRotation(teamName);
  });
  alert('全チームのオーダーと投手ローテーションを自動で組みました');
};

// 投手ローテーション生成関数（AI監督用）
// ⚠ `given` の扱いは generateOptimalLineup と同じ（オンライン版から渡る）
export const generatePitchingRotation = (teamName, given = null) => {
  const team = given || TEAMS_DATA?.[teamName];
  if (!team) {
    console.error('チームデータが見つかりません:', teamName);
    return;
  }

  // 投手判定は試合と同じ `isPitcherPlayer`。野手も pitching.stamina を持つ（40〜93程度）ため
  // 「stamina > 0」で拾うと全野手が投手集合に混入し、余った野手が敗戦処理ロールに
  // 割り当てられてしまう（大学モードのロスター再登録で顕在化していた不具合）。
  // コンバートで野手にした選手（`registeredAsFielder`）もそこで外れる
  const pitchers = team.players.filter(isPitcherPlayer);

  const starterScore = (p) =>
    (p.pitching?.stamina || 0) * 0.45 +
    (p.pitching?.control || 0) * 0.30 +
    (p.pitching?.velocity || 130) * 0.25;

  const reliefScore = (p) =>
    (p.pitching?.velocity || 130) * 0.45 +
    (p.pitching?.control || 0) * 0.35 +
    (p.pitching?.stamina || 0) * 0.20;

  const sortedByStamina = [...pitchers].sort((a, b) => (b.pitching?.stamina || 0) - (a.pitching?.stamina || 0));
  const medianStamina = sortedByStamina.length > 0 ? (sortedByStamina[Math.floor(sortedByStamina.length / 2)]?.pitching?.stamina || 80) : 80;
  const starterThreshold = Math.max(60, Math.min(130, medianStamina));
  const starterCandidates = pitchers
    .filter(p => (p.pitching?.stamina || 0) >= starterThreshold)
    .sort((a, b) => starterScore(b) - starterScore(a));
  const starters = starterCandidates.slice(0, 5);
  const starterIds = new Set(starters.map(p => p.id));

  if (starters.length < 3) {
    const needed = 3 - starters.length;
    const remaining = sortedByStamina.filter(p => !starterIds.has(p.id));
    for (let i = 0; i < Math.min(needed, remaining.length); i++) {
      starters.push(remaining[i]);
      starterIds.add(remaining[i].id);
    }
  }

  const relievers = pitchers.filter(p => !starterIds.has(p.id));
  const scoredRelievers = relievers
    .map(p => ({ ...p, score: reliefScore(p) }))
    .sort((a, b) => b.score - a.score);

  const pitcherRoles = {};
  const assigned = new Set();

  const scoredStarters = starters
    .map(p => ({ ...p, score: starterScore(p) }))
    .sort((a, b) => b.score - a.score);

  scoredStarters.forEach((p, i) => {
    pitcherRoles[p.id] = autoStarterRole(i, p.pitching?.stamina || 80);
  });

  const closer = scoredRelievers[0] || null;
  if (closer) {
    pitcherRoles[closer.id] = 'closer';
    assigned.add(closer.id);
  }

  const setupMen = [];
  if (scoredRelievers[1]) {
    setupMen.push(scoredRelievers[1]);
    pitcherRoles[scoredRelievers[1].id] = 'setup';
    assigned.add(scoredRelievers[1].id);
  }

  const unassigned = scoredRelievers.filter(p => !assigned.has(p.id));
  if (unassigned[0]) {
    pitcherRoles[unassigned[0].id] = 'ace_relief';
    assigned.add(unassigned[0].id);
  }

  const unassigned2 = scoredRelievers.filter(p => !assigned.has(p.id));
  const onepointCandidate = unassigned2.find(p =>
    p.physical?.throws === 'left' && (p.pitching?.stamina || 0) < 110
  );
  if (onepointCandidate) {
    pitcherRoles[onepointCandidate.id] = 'onepoint';
    assigned.add(onepointCandidate.id);
  }

  const unassigned3 = scoredRelievers.filter(p => !assigned.has(p.id));
  const longCandidate = [...unassigned3].sort((a, b) =>
    (b.pitching?.stamina || 0) - (a.pitching?.stamina || 0)
  )[0];
  if (longCandidate) {
    pitcherRoles[longCandidate.id] = 'long';
    assigned.add(longCandidate.id);
  }

  const unassigned4 = scoredRelievers.filter(p => !assigned.has(p.id));
  unassigned4.forEach((p, i) => {
    pitcherRoles[p.id] = i === 0 ? 'behind' : 'mopup';
    assigned.add(p.id);
  });

  const middleRelievers = scoredRelievers.filter(p =>
    p.id !== closer?.id && !setupMen.some(s => s.id === p.id)
  );

  if (!team.pitchingRotation) {
    team.pitchingRotation = {};
  }

  team.pitchingRotation.starters = starters.map(p => p.id);
  team.pitchingRotation.closer = closer ? closer.id : null;
  team.pitchingRotation.setupMen = setupMen.map(p => p.id);
  team.pitchingRotation.middleRelievers = middleRelievers.map(p => p.id);
  team.pitchingRotation.currentStarterIndex = 0;
  team.pitchingRotation.reliefFatigue = {};
  team.pitchingRotation.pitcherRoles = pitcherRoles;
};

/**
 * 全チームのローテーションとオーダーが揃っているか確かめ、無ければ作る。
 * ⚠ 同じ `Object.keys(TEAMS_DATA).forEach(...)` が3箇所に書かれていた
 *    （`ManagementScreen` の1箇所と `GameFlowScreens` の newgame_camp / sandbox_setup の
 *     onComplete に2箇所。後者2つは29行が完全に同一）。
 * ⚠ **3つは同じではなかった**。自チームのオーダーについて
 *      - ManagementScreen … 既に組んであれば **触らない**（プレイヤーの編成を保つ）
 *      - GameFlowScreens … 常に `setRecommendedLineup` で上書き
 *    という違いがある。新規ゲーム直後は編成が無いので実質同じだが、意味は違うので
 *    `preserveUserLineup` で明示する。**既定を変えないこと**。
 */
export function ensureAllTeamsReady({
  userTeamName,
  generatePitchingRotation: genRotation,
  setRecommendedLineup: setUserLineup,
  generateAILineup: genAILineup,
  preserveUserLineup = false,
}) {
  const humanTeams = new Set(humanTeamNames(TEAMS_DATA, userTeamName));
  Object.keys(TEAMS_DATA).forEach(teamName => {
    const teamData = TEAMS_DATA[teamName];
    if (!teamData?.players?.length) return;
    if (!teamData.pitchingRotation || !teamData.pitchingRotation.starters?.length) {
      genRotation(teamName);
    }
    if (humanTeams.has(teamName)) {
      const alreadySet = teamData.lineupSettings?.battingOrder?.length > 0;
      if (!preserveUserLineup || !alreadySet) setUserLineup(teamData, teamName);
    } else {
      genAILineup(teamData, teamName);
    }
  });
}
