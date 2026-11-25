// CPU の采配（代打・守備固め・継投）。自動の試合と采配の試合で共用する正本。
//
// ⚠ 以前は采配の試合（一人用で自分で采配する試合）に別の決まり（aiManager.js）があり、
//    継投の時機・守備固め・代打の決め方が自動の試合と違っていた。オンラインと一人用の
//    自動の試合はここで動き、数字の調整もこちらで行ってきたので、こちらを正本にした（2026-11-24）。
//
// `createCpuTactics(env)` は1試合ぶんの采配を作る。env.gameState は自動の試合の形
// （homeTeam / awayTeam / inning / isTopInning / outs / score / bases /
//  currentPitcherId / reliefTracking / pitcherAppearances / pitcherChanges / removedIds /
//  pitcherPinchHit / pendingPitcherChange / starterDamagePoints / inningStartRuns）。
// 采配の試合は画面の状態からこの形の写しを作って呼ぶ（managedTactics.js）。
// 自動の試合の乱数を引く順番は変えないこと（replay-hash-check が見張る）。
import { TEAMS_DATA, LEAGUE_SETTINGS } from '../teams-data.js';
import { tacticalPitchLimit, tacticalDamageLimit } from '../online/tactics.js';
import { isPitcherPlayer } from '../utils/constants.js';
import { getPositionFitness } from '../utils/physics.js';

// ロール別球数制限
const PITCH_LIMITS = {
  // 先発
  complete: 120, ace: 110, quality: 100, short: 65, opener: 40, auto_s: 100,
  // リリーフ
  closer: 40, setup: 35, ace_relief: 40, long: 60,
  onepoint: 15, behind: 50, mopup: 50, auto_r: 35
};

// 先発の球数上限はスタミナで決める（`quality` / `ace` / 自動）。
// ⚠ 固定の100球だと、スタミナ110でも150でも同じ所で降りて投球回がスタミナに依存しない。
//    スタミナ100→95球 / 120→102球 / 140→109球、エースは+8（上限はどちらも120）。
//    完投型・ショート・オープナーは起用法そのものなので固定値のまま
const STAMINA_PITCH_ROLES = new Set(['quality', 'ace', 'auto_s']);
const pitchLimitFor = (role, isReliever, stamina = 100) => {
  if (!isReliever && (STAMINA_PITCH_ROLES.has(role) || !role)) {
    const base = 60 + stamina * 0.35 + (role === 'ace' ? 8 : 0);
    return Math.round(Math.min(120, base));
  }
  return PITCH_LIMITS[role] || (isReliever ? 35 : 100);
};

// イニング別ダメージ閾値（残りスタミナで伸び縮みする。下の `damageThreshold`）
// ⚠ 旧値は 45→5 と5刻みで落ち、7回15・8回10・9回5 だった。終盤は単打1本と失点1で
//    必ず降板になり、スタミナが残っていても7回以降を投げられなかった（スタミナ130〜150で平均5.3回）
const INNING_DAMAGE_THRESHOLDS = [45, 40, 36, 32, 28, 25, 22, 19, 16];
// ⚠ **ダメージの許容量は残りスタミナで伸び縮みさせる**。
//    旧実装はイニングだけで決まり、先発の降板理由の約半分がダメージだった
//    （スタミナ120以上でも平均4.9回・78球で降りていた）。これだと投球回が
//    **打たれ方だけで決まってスタミナに依存しない**。（×0.7〜1.7）余力のある投手は多少打たれても
//    続投し、疲れてきた投手は少しの綻びで代える（スタミナで判断する考え方。
//    以前の采配モードの別の決まり aiManager.js もそうしていた。いまは消して、ここに1本化）。
const damageThreshold = (inning, staminaRate) =>
  Math.round((INNING_DAMAGE_THRESHOLDS[Math.min(inning - 1, 8)] || 5) * (0.7 + Math.max(0, Math.min(1, staminaRate))));

// リリーフを reliefFatigue の少ない順に並べるための比較関数。
// ⚠ **守護神だけは最後に回す**。守護神はセーブ場面（実測で1チーム110試合あたり
//    32.6回）でしか呼ばれないので、**常にブルペンで最も疲労が少ない**。
//    疲労順の緊急フォールバックがそれを毎回拾い、セーブ場面が32.6回しか
//    無いのに登板が61回まで膨らんでいた（実NPBの守護神は35〜42%の試合）。
//    除外ではなく末尾送りにするのは、本当に誰も居ないときに投げられなくなるのを防ぐため。
const closerLast = (fatigue, closerId, tieBreak = null) => (a, b) => {
  const ac = a.id === closerId ? 1 : 0, bc = b.id === closerId ? 1 : 0;
  if (ac !== bc) return ac - bc;
  const d = (fatigue[a.id] || 0) - (fatigue[b.id] || 0);
  return d || (tieBreak ? tieBreak(a, b) : 0);
};

// 9回の「守護神を投入」を出してよいか＝守護神がいまマウンドに上がれるか。
// ⚠ **上がれないときに交代の合図だけ出さないこと**。以前は「いまの投手が守護神で
//    ない」だけで合図していたため、守護神が既に投げて降りた・疲れている・いない
//    ときは、**打者ごと（延長なら回ごと）に別の中継ぎを呼び続け**、先発まで
//    使い切っていた。上がれないなら、いまの投手に任せる（他の条件の継投は残る）。
const closerCanEnter = (rotation, gs, teamKey, currentPitcherId, players) => {
  const id = rotation?.closer;
  if (!id || id === currentPitcherId) return false;
  if (gs.removedIds?.has(id)) return false;
  if ((gs.pitcherAppearances?.[teamKey] || []).some(a => a.id === id)) return false;
  if (((rotation.reliefFatigue || {})[id] || 0) >= 50) return false;
  return canEnterRelief(players, id, currentPitcherId, gs.removedIds);
};

// 試合で既に退いた選手（降板した先発を含む）を再登板の候補から外す。
// ⚠ 先発は `pitcherAppearances`（救援の記録）に入らないので、それだけで判定すると
//    緊急時の経路で**降板した先発がもう一度マウンドに上がっていた**。
const addRemovedIds = (ids, gs) => {
  for (const id of gs.removedIds || []) ids.add(id);
  return ids;
};

// 野手から救援に回すときの代役。退いた選手や抹消中の選手は戻さない。
// 控え野手が尽きていれば、投手も野手の枠を埋められる。
const reliefFieldReplacement = (players, reliever, currentPitcherId, removedIds) =>
  (players || []).filter(p =>
    p.isActive !== false && p.battingOrder === 0 &&
    p.id !== reliever.id && p.id !== currentPitcherId && !removedIds?.has(p.id)
  ).sort((a, b) =>
    Number(isPitcherPlayer(a)) - Number(isPitcherPlayer(b)) ||
    getPositionFitness(b, reliever.position, 0) - getPositionFitness(a, reliever.position, 0)
  )[0];

// 野手の打順（守備に就いている）に居るか。⚠ DH制では9番も野手（投手は打順0）。
// 「9番＝投手」とみなすと、DH制で9番を打つ二刀流の選手が代役なしに登板して打順に穴が開く
const inFieldSlot = (player) => {
  const order = player?.battingOrder || 0;
  return order > 0 && (LEAGUE_SETTINGS.useDH || order < 9);
};

const canEnterRelief = (players, id, currentPitcherId, removedIds) => {
  const player = players?.find(p => p.id === id);
  return !!player && player.isActive !== false && !removedIds?.has(id) &&
    (!inFieldSlot(player) ||
      !!reliefFieldReplacement(players, player, currentPitcherId, removedIds));
};


export const createCpuTactics = ({ gameState, homeTeamName, awayTeamName, useDH, registeredCatchers, startingCatchers, getCurrentPitcher }) => {
  const considerPinchHitter = (offenseTeam, batter) => {
    if (offenseTeam.onlineTactics?.pinchHit === 'never' || gameState.inning < (offenseTeam.onlineTactics?.pinchHitFrom || 0)) return batter;
    // ⚠ 控えに残った**最後の捕手**は、捕手以外の打順の代打に使わない（実際の監督と同じく残しておく）。
    //    使うと、あとで捕手に代打を出したときに替わりの捕手が居らず、野手がマスクをかぶっていた
    const benchAll = offenseTeam.players.filter(p =>
      p.isActive !== false && p.battingOrder === 0 && !isPitcherPlayer(p) && !gameState.removedIds.has(p.id)
    );
    const benchCatchers = benchAll.filter(p => registeredCatchers.has(p.id));
    // 同じ理由で、控えに捕手が残っていなければ捕手には代打を出さない
    if (batter.position === 'catcher' && !batter._isDH && registeredCatchers.has(batter.id) && !benchCatchers.length) return batter;
    const keepCatcher = batter.position !== 'catcher' && benchCatchers.length === 1 ? benchCatchers[0].id : null;
    const benchFielders = benchAll.filter(p => p.id !== keepCatcher);
    if (benchFielders.length === 0) return batter;
    const offenseKey = offenseTeam === gameState.homeTeam ? 'home' : 'away';

    // 控え選手の中から最強打者を選ぶヘルパー
    const getBestBench = () => benchFielders.reduce((best, p) => {
      const total = (p.batting?.meet || 0) + (p.batting?.power || 0);
      const bestTotal = (best.batting?.meet || 0) + (best.batting?.power || 0);
      return total > bestTotal ? p : best;
    }, benchFielders[0]);

    // 代打実行ヘルパー
    const executePinchHit = (pinchHitter, reason) => {
      const batterData = offenseTeam.players.find(p => p.id === batter.id);
      const phData = offenseTeam.players.find(p => p.id === pinchHitter.id);
      if (batterData && phData) {
        const forPitcher = batterData.id === gameState.currentPitcherId[offenseKey];
        if (forPitcher) {
          // ⚠ 代打を出すのは**次の守備で実際に選ばれる投手が居るとき**だけ。継投の選び方と
          //    同じ範囲で見る: 救援の欄（登録を問わない）で疲労50未満の人か、打順に居ない
          //    投手（緊急の登板）。ローテの野手は救援に選ばれないので数えない。数えると
          //    代打の後に誰も上がれず、退いた投手が投げ続け、代打が9番に残っていた
          const removed = new Set([...gameState.removedIds, batterData.id, phData.id]);
          const rotation = offenseTeam.pitchingRotation || {};
          const reliefFatigue = rotation.reliefFatigue || {};
          const bullpen = new Set([
            ...(rotation.middleRelievers || []), ...(rotation.setupMen || []), rotation.closer,
          ].filter(Boolean));
          if (!offenseTeam.players.some(p =>
            ((isPitcherPlayer(p) && (p.battingOrder || 0) === 0) ||
              (bullpen.has(p.id) && (reliefFatigue[p.id] || 0) < 50)) &&
            canEnterRelief(offenseTeam.players, p.id, batterData.id, removed)
          )) return batter;
        }
        phData.battingOrder = batterData.battingOrder;
        if (forPitcher) {
          // 投手の打順に入った代打は、次の守備で継投の投手と入れ替わる（守備には就かない）
          gameState.pitcherPinchHit[offenseKey] = { slot: batterData.battingOrder, phId: phData.id };
        } else if (batterData._isDH) {
          // ⚠ **DHへの代打はDHのまま**（守備には就かない）。以前は守備位置だけ写して
          //    DHの印を付けず、代打が本来の野手と同じ守備位置に重なっていた
          //    （守備の記録がDHに付く・捕手が二人になる、など）
          phData._isDH = true;
        } else {
          phData.position = batterData.position;
          delete phData._isDH;
        }
        batterData.battingOrder = 0;
        gameState.removedIds.add(batterData.id);
        return pinchHitter;
      }
      return batter;
    };

    const batterTotal = (batter.batting?.meet || 0) + (batter.batting?.power || 0);
    const bestBench = getBestBench();
    const bestBenchTotal = bestBench ? (bestBench.batting?.meet || 0) + (bestBench.batting?.power || 0) : 0;

    const myScore = gameState.isTopInning ? gameState.score.away : gameState.score.home;
    const oppScore = gameState.isTopInning ? gameState.score.home : gameState.score.away;
    const scoreDiff = myScore - oppScore;
    const runnersOn = gameState.bases.filter(Boolean).length;
    const isScoring = gameState.bases[1] || gameState.bases[2];

    // 1. 投手の打順：代打を出すと**その投手は降板する**（次の守備で継投）。
    //    ⚠ 「6回以降・控えの方が少しでも打てる」だけで出すと、控えは必ず投手より打てるので
    //    好投中の先発まで6回で降ろしてしまう（実測 先発の平均投球回 5.20→4.51回、
    //    6回以上 41%→24%）。代打は「点が欲しい場面」か「先発がもう限界」のときだけ。
    // ⚠ 打席の投手は**その試合の守備位置**で見る（上の `isPitcherBatter` と同じ理由）
    if (batter.position === 'pitcher') {
      const stRate = (batter.currentStamina || 0) / Math.max(1, batter.pitching?.stamina || 100);
      const tired = stRate < 0.40 || (batter.gameStats?.pitching?.pitches || 0) >= 95;
      const needRuns = scoreDiff <= 0 && (isScoring || gameState.inning >= 8);
      if (gameState.inning >= 6 && (tired || needRuns)
          && bestBench && ((bestBench.batting?.meet || 0) > (batter.batting?.meet || 0) + 5)) {
        return executePinchHit(bestBench,
          needRuns ? `${gameState.inning}回、投手に代打（${scoreDiff < 0 ? '反撃' : '勝ち越し'}の好機）`
                   : `${gameState.inning}回、疲れの見える投手に代打`);
      }
      // ⚠ 投手の打席には以下の汎用ルールを当てない（どれも「控えの方が打てる」で成立するため）
      return batter;
    }

    // 2. 7回以降、得点圏にランナーがいて打撃力差が大きい
    if (gameState.inning >= 7 && isScoring && bestBenchTotal > batterTotal + 10) {
      const runnerDesc = gameState.bases[2] ? '三塁' : '二塁';
      return executePinchHit(bestBench, `チャンス(${runnerDesc}にランナー)で打撃力の高い代打`);
    }

    // 3. 8回以降、ビハインドで下位打線に代打
    if (gameState.inning >= 8 && scoreDiff < 0 && batter.battingOrder >= 6 && bestBenchTotal > batterTotal + 5) {
      return executePinchHit(bestBench, `${Math.abs(scoreDiff)}点ビハインド、反撃のため代打起用`);
    }

    // 4. 9回以降、接戦でランナーあり、少しでも打力が上がるなら代打
    if (gameState.inning >= 9 && Math.abs(scoreDiff) <= 2 && runnersOn > 0 && bestBenchTotal > batterTotal + 3) {
      const situationDesc = scoreDiff < 0 ? `${Math.abs(scoreDiff)}点ビハインド最終回の勝負` :
                           scoreDiff === 0 ? '同点の勝負所' : 'リード守る一打';
      return executePinchHit(bestBench, `${situationDesc}、${bestBench.name}に託す`);
    }

    // 5. 7回以降、接戦でランナー2人以上、控えの方が打撃力が高い
    if (gameState.inning >= 7 && Math.abs(scoreDiff) <= 3 && runnersOn >= 2 && bestBenchTotal > batterTotal) {
      return executePinchHit(bestBench, `接戦の大チャンス(ランナー${runnersOn}人)で代打起用`);
    }

    return batter;
  };

  // 試合の途中から捕手でない選手がマスクをかぶっていたら、控えの捕手に替える。
  // ⚠ 捕手に代打を出すと、代打の野手が捕手の守備位置をそのまま継いでいた（`executePinchHit` は
  //    退いた選手の守備位置を写す）。リード・捕手の守備がその野手の値で回り、捕手別の記録にも
  //    野手が載っていた（1年で約280打席）。実際の野球と同じく、次の守備で控えの捕手が入る。
  //    控えの捕手が先に代打で出て別の守備位置に居れば、守備位置を入れ替える。
  //    どちらも居なければそのまま（代打の側で、控えの捕手を使い切らないようにしている）。
  //    ⚠ 一人用も同じ試合の式なので同じく効く。
  //    ⚠ 「守備固めをしない」設定でも替える（采配の好みではなく、守備位置を埋め直すだけ）
  const restoreRealCatcher = (team) => {
    const masked = team.players.find(p => p.position === 'catcher' && p.battingOrder > 0 && !p._isDH);
    if (!masked || registeredCatchers.has(masked.id) || startingCatchers.has(masked.id)) return;
    const sub = team.players.find(p =>
      registeredCatchers.has(p.id) && p.battingOrder === 0 && p.isActive !== false
      && !gameState.removedIds.has(p.id) && !isPitcherPlayer(p));
    if (!sub) {
      // 控えの捕手を先に代打で使い、その人が別の守備位置に就いている（捕手→外野などの
      // 写しで）ときは、守備位置だけを入れ替える
      const fielding = team.players.find(p =>
        registeredCatchers.has(p.id) && p.battingOrder > 0 && !p._isDH && p.position !== 'pitcher'
        && p.position !== 'catcher');
      if (fielding) {
        masked.position = fielding.position;
        fielding.position = 'catcher';
      }
      return;
    }
    sub.battingOrder = masked.battingOrder;
    sub.position = 'catcher';
    delete sub._isDH;
    masked.battingOrder = 0;
    // 守る前に退いたので、捕手の守備経験に数えない（`accrueBatterExperience`）
    masked._neverFielded = true;
    gameState.removedIds.add(masked.id);
  };

  // 守備固め判定（AI監督）- イニング終了時に呼ばれる
  const considerDefensiveReplacement = (defenseTeam) => {
    restoreRealCatcher(defenseTeam);
    if (defenseTeam.onlineTactics?.defensiveSub === 'never' || gameState.inning < (defenseTeam.onlineTactics?.defenseFrom || 0)) return;
    // ⚠ **その球団の点差で見ること**。半イニングの終わりに両球団へ呼ばれるので、
    //    以前の「次に守る側（isTopInning）の点差」では負けている球団まで
    //    「リードしている」として守備固め・大差の控え起用をしていた
    const scoreDiff = defenseTeam === gameState.homeTeam
      ? gameState.score.home - gameState.score.away
      : gameState.score.away - gameState.score.home;
    const isLeading = scoreDiff > 0;

    const benchFielders = defenseTeam.players.filter(p =>
      p.isActive !== false && p.battingOrder === 0 && !isPitcherPlayer(p) && !gameState.removedIds.has(p.id)
    );
    if (benchFielders.length === 0) return;

    // 1. 7回以降リード時: 守備力が低いスタメンを守備固め（閾値緩め）
    if (gameState.inning >= 7 && isLeading) {
      defenseTeam.players.forEach(starter => {
        if (starter.battingOrder > 0 && starter.position !== 'pitcher' && !starter._isDH) {
          const starterDef = starter.fielding?.defense || 50;
          if (starterDef < 60) {
            // ⚠ 捕手の守備固めは捕手で（野手にマスクをかぶせない）
            const replacement = benchFielders.find(p =>
              p.battingOrder === 0 &&
              (p.fielding?.defense || 0) > starterDef + 8 &&
              (starter.position !== 'catcher' || registeredCatchers.has(p.id))
            );
            if (replacement) {
              replacement.battingOrder = starter.battingOrder;
              replacement.position = starter.position;
              // 守備に就く（DH の印が残っていると守備の検索に掛からず、その位置が空になる）
              delete replacement._isDH;
              starter.battingOrder = 0;
              gameState.removedIds.add(starter.id);
            }
          }
        }
      });
    }

    // ⚠ 旧「2. 8回以降リード時の代走」は撤去した。この関数はイニング終了時に呼ばれるので
    //    塁上は**終わった攻撃の残塁**で、代走の意味が無いうえ、残塁していた投手を
    //    代走と入れ替えて position='pitcher' の野手を打順9に作り、継投時に打順が重複していた

    // 3. 6回以降大量リード: 控え野手を順番に出場させる（経験積ませる）
    if (gameState.inning >= 6 && scoreDiff >= 5) {
      const activeBench = benchFielders.filter(p => p.battingOrder === 0);
      if (activeBench.length > 0) {
        // 出場機会が少ない控えを優先
        const leastUsed = activeBench.reduce((best, p) => {
          // ⚠ 出場数は seasonStats.batting.games（seasonStats.games は無く、いつも 0 だった）
          const pGames = (p.seasonStats?.batting?.games || 0);
          const bGames = (best.seasonStats?.batting?.games || 0);
          return pGames < bGames ? p : best;
        }, activeBench[0]);

        // 打撃が最も弱いスタメンと交代（投手・DHは守備固め対象外）
        // ⚠ 控えが捕手でなければ、捕手とは替えない（野手にマスクをかぶせない）
        const starters = defenseTeam.players.filter(p => p.battingOrder > 0 && p.position !== 'pitcher' && !p._isDH
          && (p.position !== 'catcher' || registeredCatchers.has(leastUsed.id)));
        if (starters.length > 0) {
          const weakest = starters.reduce((w, p) => {
            const wBat = (w.batting?.meet || 0) + (w.batting?.power || 0);
            const pBat = (p.batting?.meet || 0) + (p.batting?.power || 0);
            return pBat < wBat ? p : w;
          }, starters[0]);

          leastUsed.battingOrder = weakest.battingOrder;
          leastUsed.position = weakest.position;
          delete leastUsed._isDH;
          weakest.battingOrder = 0;
          gameState.removedIds.add(weakest.id);
        }
      }
    }
  };

  // 救援を登板させる: 交代の記録・登板記録（セーブ・ホールド判定用）・打順と守備の入れ替え・
  // 二刀流の救援の野手の穴埋め・継投の追跡・登板疲労。
  // ⚠ 打席間の交代（`considerMidInningPitcherChange`）とイニング終わりの継投（`simulateInning`）で共用する
  //    （以前は同じ約70行が2か所に写してあり、登板疲労の足し方が片方だけ違っていたことがある）。
  // `takePinchHitSlot`: 投手の打順に代打が出ていたら、救援はその代打の打順に入り、代打は退く（イニング終わりだけ）
  const bringInReliever = ({ defenseTeam, teamName, teamKey, pitcherData, reliever, outName, roleLabel, reason, takePinchHitSlot }) => {
    const reliefTrack = gameState.reliefTracking[teamKey];
    // 投手交代記録を保存
    gameState.pitcherChanges.push({
      inning: gameState.inning,
      isTop: gameState.isTopInning,
      team: teamName,
      out: outName,
      in: reliever.name,
      role: roleLabel,
      reason
    });

    if (!reliefTrack.starterLeftInning) {
      reliefTrack.starterLeftInning = gameState.inning;
    }

    // 登板記録を追加（セーブ・ホールド判定用）
    gameState.pitcherAppearances[teamKey].push({
      id: reliever.id,
      entryInning: gameState.inning,
      entryIsTop: gameState.isTopInning,
      entryScore: { ...gameState.score },
      isStarter: false
    });

    const relieverData = defenseTeam.players.find(p => p.id === reliever.id);
    const relieverOldOrder = relieverData.battingOrder;
    const relieverOldPos = relieverData.position;
    const relieverWasDH = !!relieverData._isDH;
    const isTwoWaySwap = inFieldSlot(relieverData);
    const replacement = isTwoWaySwap
      ? reliefFieldReplacement(defenseTeam.players, relieverData, pitcherData.id, gameState.removedIds)
      : null;

    const ph = takePinchHitSlot ? gameState.pitcherPinchHit[teamKey] : null;
    const pitcherSlot = useDH ? 0 : (ph ? ph.slot : (pitcherData.battingOrder || 9));
    if (ph) {
      const phData = defenseTeam.players.find(p => p.id === ph.phId);
      if (phData) { phData.battingOrder = 0; gameState.removedIds.add(phData.id); }
      gameState.pitcherPinchHit[teamKey] = null;
    }
    pitcherData.battingOrder = 0;
    pitcherData.position = 'pitcher';
    gameState.removedIds.add(pitcherData.id);

    relieverData.battingOrder = pitcherSlot;
    relieverData.position = 'pitcher';
    delete relieverData._isDH;
    relieverData.currentStamina = relieverData.pitching?.stamina || 80;

    // 二刀流リリーフ: 空いた野手スロットをベンチから補充
    // ⚠ DH の枠なら代わりも DH（守備には就かない）。印を写さないと本来の野手と守備位置が重なる
    if (replacement && relieverOldPos) {
      replacement.battingOrder = relieverOldOrder;
      replacement.position = relieverOldPos;
      if (relieverWasDH) replacement._isDH = true; else delete replacement._isDH;
    }

    reliefTrack.currentRelieverId = reliever.id;
    reliefTrack.relieverOutsPitched = 0;
    reliefTrack.relieverBattersFaced = 0;
    // この回の失点の基準を救援自身の失点に置き直す（「この回に失点したら交代」を救援の失点で見る）。
    // ⚠ 前の投手の回の頭の失点のままだと、回の途中に入った救援は失点しても差が0以下で、交代しなかった
    if (gameState.inningStartRuns) {
      gameState.inningStartRuns[teamKey] = relieverData.gameStats?.pitching?.runsAllowed || 0;
    }

    // currentPitcherId を更新
    gameState.currentPitcherId[teamKey] = reliever.id;

    if (TEAMS_DATA[teamName]?.pitchingRotation?.reliefFatigue) {
      // 登板疲労。回復は1日25なので、+30 では 50 のゲートに永久に届かず、
      // 同じリリーフが100試合中97登板するという偏りが生まれていた。
      // +50 にすると2連投で頭打ちになり、最多登板が中央値で62→50登板に収まる。
      // これ以上（+70等）にすると全員がゲートに掛かり、疲労を見ない緊急経路へ
      // 流れて（22%→55%）かえって偏りが悪化する。
      // 上限を設ける。相対ゲートを入れたことで疲労が溜まり続けても登板できるため、
      // 無制限だと 4210 のような値になり、他の箇所の絶対値判定（左ワンポイント投入の
      // `< 50` など）が永久に無効化されてしまう。3登板ぶんで頭打ちにする（采配の試合で人が継投したときも同じ +50・上限150。managedTactics.js）。
      TEAMS_DATA[teamName].pitchingRotation.reliefFatigue[reliever.id] = Math.min(150,
        (TEAMS_DATA[teamName].pitchingRotation.reliefFatigue[reliever.id] || 0) + 50);
    }
  };

  // AI監督: 打席間のピンチ投手交代（ロールベース対応）
  const considerMidInningPitcherChange = (defenseTeam, currentPitcher, gs) => {
    const teamName = defenseTeam === gs.homeTeam ? homeTeamName : awayTeamName;
    const teamKey = defenseTeam === gs.homeTeam ? 'home' : 'away';
    const team = TEAMS_DATA[teamName];
    if (!team) return;
    const rotation = team.pitchingRotation;
    if (!rotation) return;
    const fatigue = rotation.reliefFatigue || {};
    const pitcherRoles = rotation.pitcherRoles || {};
    const reliefTrack = gs.reliefTracking[teamKey];

    const pitcherData = defenseTeam.players.find(p => p.id === currentPitcher.id);
    if (!pitcherData) return;
    const staminaRate = pitcherData.currentStamina / (currentPitcher.pitching?.stamina || 80);

    const scoreDiff = defenseTeam === gs.homeTeam
      ? gs.score.home - gs.score.away
      : gs.score.away - gs.score.home;

    const runnersOn = gs.bases.filter(Boolean).length;
    const isLate = gs.inning >= 7;

    let shouldChange = false;
    let situation = 'middle';
    let changeReason = '';

    // ワンポイント投手の1打者制限チェック
    const currentPitcherRole = pitcherRoles[currentPitcher.id] || '';
    if (currentPitcherRole === 'onepoint' && reliefTrack.currentRelieverId === currentPitcher.id) {
      if (reliefTrack.relieverBattersFaced >= 1) {
        shouldChange = true;
        situation = 'middle';
        changeReason = `ワンポイント${currentPitcher.name}が1打者対戦済み、交代`;
      }
    }

    // セットアッパー/中継ぎエース: 失点したら即交代（イニング途中でも）
    if (!shouldChange && reliefTrack.currentRelieverId === currentPitcher.id) {
      if (currentPitcherRole === 'setup' || currentPitcherRole === 'ace_relief') {
        const currentRuns = pitcherData.gameStats?.pitching?.runsAllowed || 0;
        const inningStartRuns = gs.inningStartRuns?.[teamKey] || 0;
        const inningRuns = currentRuns - inningStartRuns;
        if (inningRuns > 0) {
          shouldChange = true;
          situation = 'middle';
          changeReason = `${currentPitcherRole === 'setup' ? 'セットアッパー' : '中継ぎエース'}${currentPitcher.name}が失点、緊急交代`;
        }
      }
    }

    // === 新降板ルール: 打席間チェック（対戦中の勝負が終わったタイミング） ===
    const isRelieverMid = reliefTrack.currentRelieverId === currentPitcher.id;
    const totalPitchesMid = pitcherData.gameStats?.pitching?.pitches || 0;

    // 条件1: 球数制限（ロール別）
    if (!shouldChange) {
      const pitchLimit = tacticalPitchLimit(pitchLimitFor(currentPitcherRole, isRelieverMid, currentPitcher.pitching?.stamina), isRelieverMid, defenseTeam.onlineTactics);
      if (totalPitchesMid >= pitchLimit) {
        shouldChange = true;
        situation = Math.abs(scoreDiff) <= 2 ? 'hold' : 'middle';
        changeReason = `${currentPitcher.name}が球数制限到達(${totalPitchesMid}/${pitchLimit}球)`;
      }
    }

    // 条件2: スタミナ25%以下
    if (!shouldChange && staminaRate < 0.25) {
      shouldChange = true;
      situation = 'middle';
      changeReason = `${currentPitcher.name}のスタミナ限界(${Math.round(staminaRate * 100)}%)`;
    }

    // 条件3: ダメージポイント制（先発のみ）
    if (!shouldChange && !isRelieverMid) {
      const threshold = tacticalDamageLimit(damageThreshold(gs.inning, staminaRate), defenseTeam.onlineTactics);
      const currentDamage = gs.starterDamagePoints[teamKey];
      if (currentDamage >= threshold) {
        shouldChange = true;
        situation = Math.abs(scoreDiff) <= 2 ? 'hold' : 'middle';
        changeReason = `先発${currentPitcher.name}がダメージ蓄積で降板(DP:${currentDamage}/${threshold})`;
      }
    }

    // 9回リード時→クローザー必須。
    // ⚠ **同点(0点差)も含める**。実際の監督は9回同点でも守護神を投入する。
    //    セーブ機会（1チーム110試合あたり32.6回）だけだと登板が28%に留まり、
    //    実NPBの35〜42%に届かない。同点を足して34%になる。
    if (!shouldChange && gs.inning >= 9 && scoreDiff >= 0 && scoreDiff <= 3) {
      if (closerCanEnter(rotation, gs, teamKey, currentPitcher.id, defenseTeam.players)) {
        shouldChange = true;
        situation = 'save';
        changeReason = scoreDiff === 0 ? `9回同点、クローザーを投入` : `9回${scoreDiff}点リード、クローザーを投入`;
      }
    }
    // 8回僅差→セットアッパー
    if (!shouldChange && gs.inning === 8 && Math.abs(scoreDiff) <= 2) {
      const isSetup = (rotation.setupMen || []).includes(currentPitcher.id);
      const isCloser = rotation.closer && currentPitcher.id === rotation.closer;
      if (!isSetup && !isCloser && staminaRate < 0.60) {
        shouldChange = true;
        situation = 'hold';
        changeReason = `8回僅差(${scoreDiff > 0 ? scoreDiff + '点リード' : Math.abs(scoreDiff) + '点ビハインド'})、セットアッパーへ`;
      }
    }
    // ピンチ場面: ランナー2人以上+アウト1以下+後半+スタミナ低い
    if (!shouldChange && runnersOn >= 2 && gs.outs <= 1 && isLate && staminaRate < 0.45) {
      shouldChange = true;
      situation = 'middle';
      changeReason = `ピンチ(ランナー${runnersOn}人・${gs.outs}アウト)でスタミナ${Math.round(staminaRate * 100)}%`;
    }
    // 満塁+アウト1以下（回に関係なく）でスタミナ低い
    else if (runnersOn === 3 && gs.outs <= 1 && staminaRate < 0.50) {
      shouldChange = true;
      situation = 'middle';
      changeReason = `満塁のピンチでスタミナ${Math.round(staminaRate * 100)}%、緊急交代`;
    }

    // 左打者にワンポイント左投手を送り込む判定
    // 条件: 7回以降、僅差、現在の投手が右投げ、次の打者が左打ち
    const offenseTeamForOnepoint = defenseTeam === gs.homeTeam ? gs.awayTeam : gs.homeTeam;
    const nextBatter = offenseTeamForOnepoint.players.find(p => p.battingOrder === offenseTeamForOnepoint.currentBatterOrder);
    const nextBatterBats = nextBatter?.batting?.bats || 'right';
    const currentPitcherThrows = currentPitcher.physical?.throws || 'right';
    if (!shouldChange && gs.inning >= 7 && Math.abs(scoreDiff) <= 3 && nextBatterBats === 'left' && currentPitcherThrows !== 'left') {
      // 左投げのワンポイント投手が使えるか確認
      const onepointIds = (rotation.middleRelievers || []).filter(id =>
        pitcherRoles[id] === 'onepoint' && (fatigue[id] || 0) < 50 && id !== currentPitcher.id
      );
      for (const opId of onepointIds) {
        const opPlayer = defenseTeam.players.find(p => p.id === opId);
        if (opPlayer && (opPlayer.physical?.throws === 'left')) {
          shouldChange = true;
          situation = 'lefty';
          changeReason = `左打者${nextBatter.name}に対し左ワンポイント投入`;
          break;
        }
      }
    }

    if (!shouldChange) return;

    // リリーフ投手選択（ロールベース、再登板防止）
    let reliever = null;
    let selectedRoleLabel = '';

    // 今試合で既に登板した投手のIDセット（再登板防止）
    const alreadyPitchedIds = addRemovedIds(new Set(
      gs.pitcherAppearances[teamKey].map(a => a.id)
    ), gs);
    alreadyPitchedIds.add(currentPitcher.id);
    // 登板間隔のゲート。絶対値50だけで判定すると、全員が50を超えた時点で
    // ロール別の経路が総崩れになり、疲労を見ない緊急経路へ流れる（実測24%）。
    // 「50未満」か「今日まだ投げていない中で最も疲労の少ない投手」なら通す
    // 相対ゲートにして、ブルペンが枯れても必ずロール別の選択が働くようにする。
    const bullpenIds = [...(rotation.middleRelievers || []), ...(rotation.setupMen || []),
      rotation.closer].filter(Boolean).filter(id => !alreadyPitchedIds.has(id) &&
        canEnterRelief(defenseTeam.players, id, currentPitcher.id, gs.removedIds));
    const freshest = bullpenIds.length
      ? Math.min(...bullpenIds.map(id => fatigue[id] || 0)) : 0;
    const fatigueGate = Math.max(50, freshest + 1);
    const isAvailableMid = (id) => !alreadyPitchedIds.has(id) && (fatigue[id] || 0) < fatigueGate &&
      canEnterRelief(defenseTeam.players, id, currentPitcher.id, gs.removedIds);

    // 左打者対策: ワンポイント左投手を優先選択
    if (situation === 'lefty') {
      // 疲労の少ない順。ロスター順に break すると、左のワンポイントが1人しか
      // 居ないチームでは左打者のたびに毎回その1人が呼ばれ、
      // 100試合中69登板というような突出した起用になる
      const onepointIds = (rotation.middleRelievers || []).filter(id =>
        pitcherRoles[id] === 'onepoint' && isAvailableMid(id)
      ).sort((a, b) => (fatigue[a] || 0) - (fatigue[b] || 0));
      for (const opId of onepointIds) {
        const opPlayer = defenseTeam.players.find(p => p.id === opId);
        if (opPlayer && opPlayer.physical?.throws === 'left') {
          reliever = opPlayer;
          selectedRoleLabel = 'ワンポイント(左)';
          break;
        }
      }
    }

    if (situation === 'save' && rotation.closer) {
      const closerData = defenseTeam.players.find(p => p.id === rotation.closer);
      if (closerData && isAvailableMid(rotation.closer)) {
        reliever = closerData;
        selectedRoleLabel = 'クローザー';
      }
    }

    if (!reliever && (situation === 'hold' || situation === 'save')) {
      const setupIds = (rotation.setupMen || [])
        .filter(id => isAvailableMid(id))
        .sort((a, b) => (fatigue[a] || 0) - (fatigue[b] || 0));
      for (const setupId of setupIds) {
        const setupData = defenseTeam.players.find(p => p.id === setupId);
        if (setupData) {
          reliever = setupData;
          selectedRoleLabel = 'セットアッパー';
          break;
        }
      }
    }

    // 接戦ピンチ: 中継ぎエースを優先
    if (!reliever && Math.abs(scoreDiff) <= 3) {
      const aceRelievers = (rotation.middleRelievers || [])
        .filter(id => pitcherRoles[id] === 'ace_relief' && isAvailableMid(id))
        .sort((a, b) => (fatigue[a] || 0) - (fatigue[b] || 0))
        .map(id => defenseTeam.players.find(p => p.id === id))
        .filter(Boolean);
      if (aceRelievers.length > 0) {
        reliever = aceRelievers[0];
        selectedRoleLabel = '中継ぎエース';
      }
    }

    if (!reliever) {
      const sortedMiddle = (rotation.middleRelievers || [])
        .filter(id => {
          const p = defenseTeam.players.find(pl => pl.id === id);
          return p && isAvailableMid(id) && pitcherRoles[id] !== 'onepoint';
        })
        .sort((a, b) => (fatigue[a] || 0) - (fatigue[b] || 0));
      if (sortedMiddle.length > 0) {
        reliever = defenseTeam.players.find(p => p.id === sortedMiddle[0]);
        const role = pitcherRoles[sortedMiddle[0]];
        selectedRoleLabel = role === 'long' ? 'ロングリリーフ' :
                           role === 'ace_relief' ? '中継ぎエース' : '中継ぎ';
      }
    }

    if (!reliever) {
      // 疲労の少ない順に選ぶ。ロスター順に .find() すると同じ投手が
      // 毎試合指名され、1人だけ100試合中97登板というような偏りが生まれる
      const starterIds = new Set(rotation.starters || []);
      reliever = defenseTeam.players
        .filter(p =>
          isPitcherPlayer(p) &&
          p.battingOrder === 0 &&
          p.isActive !== false &&
          !alreadyPitchedIds.has(p.id) &&
          !starterIds.has(p.id) &&
          (p.currentStamina || 80) > 40
        )
        // reliefFatigue（登板間隔の管理値）の少ない順。p.fatigue はシーズン疲労で
        // リリーフではほとんど溜まらないため、ここで使うと選択が偏る
        // ⚠ **守護神は最後に回す**（`closerLast`）。セーブ場面でしか投げないので
        //    常にブルペンで最も疲労が少なく、疲労順のこの経路が毎回拾ってしまう。
        .sort(closerLast(fatigue, rotation.closer))[0];
      if (reliever) selectedRoleLabel = '緊急中継ぎ';
    }

    // 最終フォールバック: 先発ローテーション投手を除いた上で最もスタミナの残っている投手を選ぶ
    // （先発をpitcherAppearancesに入れるとセーブ・ホールド判定が狂うため先発は最後の手段）
    if (!reliever) {
      const starterIdsSet = new Set(rotation.starters || []);
      const nonStarterPitchers = defenseTeam.players
        .filter(p => isPitcherPlayer(p) && p.isActive !== false && p.battingOrder === 0 && !alreadyPitchedIds.has(p.id) && !starterIdsSet.has(p.id))
        // currentStamina は登板のたびにリセットされるため、スタミナ順だと常に同じ投手が
        // 選ばれてしまう。reliefFatigue の少ない順を主キーにする（守護神は最後）
        .sort(closerLast(fatigue, rotation.closer, (a, b) => (b.currentStamina || 0) - (a.currentStamina || 0)));
      if (nonStarterPitchers.length > 0) {
        reliever = nonStarterPitchers[0];
        selectedRoleLabel = '緊急登板';
      } else {
        // 本当に誰もいない場合のみ先発投手を緊急起用
        const starterPitchers = defenseTeam.players
          .filter(p => isPitcherPlayer(p) && p.isActive !== false && p.battingOrder === 0 && !alreadyPitchedIds.has(p.id))
          .sort((a, b) => ((fatigue[a.id] || 0) - (fatigue[b.id] || 0)) || ((b.currentStamina || 0) - (a.currentStamina || 0)));
        if (starterPitchers.length > 0) {
          reliever = starterPitchers[0];
          selectedRoleLabel = '緊急登板(先発)';
        }
      }
    }

    if (reliever) {
      bringInReliever({
        defenseTeam, teamName, teamKey, pitcherData, reliever,
        outName: currentPitcher.name, roleLabel: selectedRoleLabel, reason: changeReason,
        takePinchHitSlot: false,
      });
    }
  };

  // 先発ダメージポイントのイニングまたぎ回復（-10、最低0）
  const recoverStarterDamage = () => {
  ['home', 'away'].forEach(key => {
    if (!gameState.reliefTracking[key].currentRelieverId) {
      gameState.starterDamagePoints[key] = Math.max(0, gameState.starterDamagePoints[key] - 10);
    }
  });
  };

  // 半イニングの後の投手のスタミナ回復・継投・守備固め（両球団それぞれに呼ぶ）。
  // ⚠ isTopInning・inning は次の半イニングへ進めてから呼ぶこと
  // `allowChanges: false` はスタミナの回復と救援の記録だけ（人が采配する球団。采配の試合で使う）
  const afterHalfInning = (team, { allowChanges = true } = {}) => {
    const pitcher = getCurrentPitcher(team);
    const teamName = team === gameState.homeTeam ? homeTeamName : awayTeamName;
    const teamKey = team === gameState.homeTeam ? 'home' : 'away';
    const scoreDiff = team === gameState.homeTeam
      ? gameState.score.home - gameState.score.away
      : gameState.score.away - gameState.score.home;
    const reliefTrack = gameState.reliefTracking[teamKey];

    if (pitcher) {
      const pitcherData = team.players.find(p => p.id === pitcher.id);
      if (pitcherData) {
        // スタミナ回復（イニング間の休憩）
        pitcherData.currentStamina = Math.min(
          pitcherData.currentStamina + 3,
          pitcher.pitching.stamina
        );

        // このイニングで守備したかどうかを判定
        // ※ isTopInning は既に反転済み
        // 表終了後: isTopInning = false → home が守備していた
        // 裏終了後: isTopInning = true, inning++ → away が守備していた
        const defendedThisInning = (!gameState.isTopInning && teamKey === 'home') ||
                                   (gameState.isTopInning && teamKey === 'away');
        // 次の半イニングで守備に就くか（継投はその直前にだけ行う）
        const defendsNext = !defendedThisInning;

        // リリーフ投手のイニング追跡。⚠ 実際に取ったアウトで数えること。
        //    以前は半イニングごとに**守備していない側にも** +3 を足しており、
        //    守護神の「2イニング」が実質1イニング、ロングの3イニングが約1.5で打ち切られていた
        if (reliefTrack.currentRelieverId === pitcher.id && defendedThisInning) {
          reliefTrack.relieverOutsPitched = pitcherData.gameStats?.pitching?.outs || 0;
        }
        if (!allowChanges) return;
        // AI監督: ロール別の投手交代判定（pitcherRoles対応）
        const staminaRate = pitcherData.currentStamina / pitcher.pitching.stamina;
        const rotation = TEAMS_DATA[teamName]?.pitchingRotation;
        const pitcherRoles = rotation?.pitcherRoles || {};
        const currentRole = pitcherRoles[pitcher.id] || '';
        let shouldChange = false;
        let situation = 'middle';
        let changeReason = '';

        // 球数制限チェック（先発投手用）
        const totalPitches = pitcherData.gameStats?.pitching?.pitches || 0;
        const isReliever = reliefTrack.currentRelieverId === pitcher.id;

        // 投手に代打を出した → 次の守備は必ず継投（打順から外れた投手は投げられない）
        const phForPitcher = gameState.pitcherPinchHit[teamKey];
        if (phForPitcher) {
          shouldChange = true;
          situation = scoreDiff > 0 && scoreDiff <= 3 && gameState.inning >= 8 ? 'hold'
            : scoreDiff < 0 ? 'behind' : 'middle';
          changeReason = `${pitcher.name}に代打が出たため継投`;
        }

        // リリーフ投手の役割完了チェック（登板制限を役割ベースに変更）
        if (!shouldChange && isReliever && defendedThisInning) {
          const relieverRole = pitcherRoles[pitcher.id] || 'auto_r';
          const inningRuns = (pitcherData.gameStats?.pitching?.runsAllowed || 0) - (gameState.inningStartRuns[teamKey] || 0);

          if (relieverRole === 'onepoint') {
            // ワンポイント: 打っても抑えても必ず交代（イニング終了時のフォールバック）
            shouldChange = true;
            changeReason = `ワンポイント${pitcher.name}の仕事完了、交代`;
            situation = 'middle';
          } else if (relieverRole === 'setup' || relieverRole === 'ace_relief') {
            // セットアッパー/中継ぎエース: イニングを抑えたら交代、失点でも交代
            if (inningRuns > 0) {
              shouldChange = true;
              changeReason = `${relieverRole === 'setup' ? 'セットアッパー' : '中継ぎエース'}${pitcher.name}が失点、交代`;
              situation = 'middle';
            } else if (reliefTrack.relieverOutsPitched >= 3) {
              // 1イニング完了で交代（好投でも役割完了）
              shouldChange = true;
              changeReason = `${relieverRole === 'setup' ? 'セットアッパー' : '中継ぎエース'}${pitcher.name}が1イニング完了、交代`;
              situation = 'middle';
            }
          } else if (relieverRole === 'closer') {
            // クローザー: イニングを抑えたら交代、最大2イニング
            if (reliefTrack.relieverOutsPitched >= 6) {
              shouldChange = true;
              changeReason = `クローザー${pitcher.name}が2イニング投球、交代`;
              situation = 'middle';
            }
          } else if (relieverRole === 'long' || relieverRole === 'mopup' || relieverRole === 'behind') {
            // ロング/敗戦処理/ビハインド: イニングイーター、多少の失点はOK
            const maxOuts = relieverRole === 'long' ? 9 : // ロング: 3イニング
              (reliefTrack.starterLeftInning || 9) <= 3 ? 12 : 6; // 早期降板なら4回、通常2回
            if (reliefTrack.relieverOutsPitched >= maxOuts) {
              const inningsStr = Math.floor(reliefTrack.relieverOutsPitched / 3);
              changeReason = `${pitcher.name}が登板制限(${inningsStr}回)に到達`;
              shouldChange = true;
              situation = 'middle';
            } else if (inningRuns >= 3) {
              // さすがに3失点以上は交代
              changeReason = `${pitcher.name}が${inningRuns}失点、交代`;
              shouldChange = true;
              situation = 'middle';
            }
          } else {
            // auto_r / 未設定: 従来どおりのアウト数制限
            const starterLeft = reliefTrack.starterLeftInning || 9;
            const maxOuts = starterLeft <= 3 ? 12 : 6;
            if (reliefTrack.relieverOutsPitched >= maxOuts) {
              const inningsStr = Math.floor(reliefTrack.relieverOutsPitched / 3);
              changeReason = `${pitcher.name}が登板制限(${inningsStr}回)に到達`;
              shouldChange = true;
              situation = 'middle';
            }
          }
        } else if (!shouldChange && isReliever && !defendedThisInning) {
          // 守備していないイニングでもワンポイントのフォールバックチェック
          const relieverRole = pitcherRoles[pitcher.id] || 'auto_r';
          if (relieverRole === 'onepoint' && reliefTrack.relieverBattersFaced >= 1) {
            changeReason = `ワンポイント${pitcher.name}が1打者対戦済み、交代`;
            shouldChange = true;
            situation = 'middle';
          }
        }

        // === 新降板ルール: 3条件のいずれか1つで降板 ===
        // 条件1: 球数制限（ロール別）
        // 条件2: スタミナ25%以下
        // 条件3: ダメージポイント制（先発のみ）

        // --- 条件1: 球数制限（先発・リリーフ共通） ---
        if (!shouldChange) {
          const pitchLimit = tacticalPitchLimit(pitchLimitFor(currentRole, isReliever, pitcher.pitching?.stamina), isReliever, team.onlineTactics);
          if (totalPitches >= pitchLimit) {
            shouldChange = true;
            situation = Math.abs(scoreDiff) <= 2 ? 'hold' : 'middle';
            const roleLabel = {
              complete: '完投型', ace: 'ゲームメーカー', quality: '勝ち権利型',
              short: 'ショートスターター', opener: 'オープナー', closer: 'クローザー', setup: 'セットアッパー',
              ace_relief: '中継ぎエース', long: 'ロングリリーフ', onepoint: 'ワンポイント',
              behind: 'ビハインド', mopup: '敗戦処理'
            }[currentRole] || (isReliever ? 'リリーフ' : '先発');
            changeReason = `${roleLabel}${pitcher.name}が球数制限到達(${totalPitches}/${pitchLimit}球)`;
          }
        }

        // --- 条件2: スタミナ25%以下（先発・リリーフ共通） ---
        if (!shouldChange && staminaRate < 0.25) {
          shouldChange = true;
          situation = 'middle';
          changeReason = `${pitcher.name}のスタミナ限界(${Math.round(staminaRate * 100)}%)`;
        }

        // --- オープナー: 2イニング（6アウト）投げたら役割完了、ロングへ繋ぐ ---
        if (!shouldChange && !isReliever && currentRole === 'opener' && defendedThisInning) {
          const openerOuts = pitcherData.gameStats?.pitching?.outs || 0;
          if (openerOuts >= 6) {
            shouldChange = true;
            situation = 'middle';
            changeReason = `オープナー${pitcher.name}が役割完了、ロングリリーフへ`;
          }
        }

        // --- 条件3: ダメージポイント制（先発のみ） ---
        if (!shouldChange && !isReliever && defendedThisInning) {
          const threshold = tacticalDamageLimit(damageThreshold(gameState.inning, staminaRate), team.onlineTactics); // 延長は9回の閾値
          const currentDamage = gameState.starterDamagePoints[teamKey];
          if (currentDamage >= threshold) {
            shouldChange = true;
            situation = Math.abs(scoreDiff) <= 2 ? 'hold' : 'middle';
            changeReason = `先発${pitcher.name}がダメージ蓄積で降板(DP:${currentDamage}/${threshold})`;
          }
        }
        // 9回、同点〜3点差以内のリード → クローザー（同点を含める理由は上記）
        // ⚠ 勝ちパターン・温存の継投は「次に守るチーム」にだけ行う（攻撃前に守護神を
        //    登板扱いにすると、投げないのに登板記録と疲労だけが付く）
        if (!shouldChange && defendsNext && gameState.inning >= 9 && scoreDiff >= 0 && scoreDiff <= 3) {
          if (closerCanEnter(rotation, gameState, teamKey, pitcher.id, team.players)) {
            shouldChange = true;
            situation = 'save';
            changeReason = scoreDiff === 0 ? `9回同点、クローザーを投入` : `9回セーブ場面、クローザーを投入`;
          }
        }
        // 8回で僅差リード → セットアッパー
        if (!shouldChange && defendsNext && gameState.inning === 8 && scoreDiff > 0 && Math.abs(scoreDiff) <= 2 && !isReliever) {
          shouldChange = true;
          situation = 'hold';
          changeReason = `8回僅差リード、セットアッパーへ`;
        }
        // 6回以降、大量リードで先発温存
        if (!shouldChange && !isReliever && gameState.inning >= 6 && Math.abs(scoreDiff) >= 5 && staminaRate < 0.50) {
          shouldChange = true;
          situation = scoreDiff < 0 ? 'behind' : 'middle';
          changeReason = scoreDiff >= 5 ? `大量リードで先発${pitcher.name}を温存` : `大量ビハインドで先発${pitcher.name}を温存`;
        }

        // ⚠ **これから攻撃する側の投手は、ここでは代えない**。守り終えた直後に決めた
        //    継投は、次に守りに就く直前（次の半イニングの終わり）まで持ち越す。
        //    以前はその場で代えていたため、投げない救援投手に登板記録と疲労が付き、
        //    その攻撃で勝ち越すと**1球も投げていない投手に勝ちが付いていた**
        //    （本来は直前の回を投げた投手の勝ち）。
        if (!defendsNext) {
          if (shouldChange) gameState.pendingPitcherChange[teamKey] = { situation, changeReason };
          shouldChange = false;
        } else {
          const pending = gameState.pendingPitcherChange[teamKey];
          gameState.pendingPitcherChange[teamKey] = null;
          if (!shouldChange && pending) {
            shouldChange = true;
            situation = pending.situation;
            changeReason = pending.changeReason;
          }
        }

        if (shouldChange) {
          let reliever = null;
          const fatigue = rotation?.reliefFatigue || {};
          let selectedRoleLabel = '';

          // 今試合で既に登板した投手のIDセット（再登板防止）
          const alreadyPitchedIds = addRemovedIds(new Set(
            gameState.pitcherAppearances[teamKey].map(a => a.id)
          ), gameState);
          // 現在の投手も除外対象に追加
          alreadyPitchedIds.add(pitcher.id);
          // 選手が起用可能かチェック（未登板 & 疲労OK & 現在の投手でない）
          const isAvailable = (id) => !alreadyPitchedIds.has(id) && (fatigue[id] || 0) < 50 &&
            canEnterRelief(team.players, id, pitcher.id, gameState.removedIds);

          // セーブ場面: クローザー最優先（既にマウンドにいる場合は交代不要）
          if (situation === 'save' && rotation?.closer) {
            if (pitcher.id === rotation.closer) {
              shouldChange = false;
            } else {
              const closerData = team.players.find(p => p.id === rotation.closer && p.id !== pitcher.id);
              if (closerData && isAvailable(rotation.closer)) {
                reliever = closerData;
                selectedRoleLabel = 'クローザー';
              }
            }
          }

          // ホールド場面: セットアッパー優先
          if (shouldChange && !reliever && (situation === 'hold' || situation === 'save')) {
            for (const setupId of (rotation?.setupMen || [])) {
              const setupData = team.players.find(p => p.id === setupId);
              if (setupData && isAvailable(setupId)) {
                reliever = setupData;
                selectedRoleLabel = 'セットアッパー';
                break;
              }
            }
          }

          // ビハインド場面: ビハインドロール優先
          if (shouldChange && !reliever && situation === 'behind') {
            const behindPitchers = (rotation?.middleRelievers || [])
              .filter(id => pitcherRoles[id] === 'behind' && isAvailable(id))
              .map(id => team.players.find(p => p.id === id))
              .filter(Boolean);
            if (behindPitchers.length > 0) {
              reliever = behindPitchers[0];
              selectedRoleLabel = 'ビハインド';
            }
          }

          // 大量リード: 敗戦処理ロール優先
          if (shouldChange && !reliever && scoreDiff >= 5) {
            const mopupPitchers = (rotation?.middleRelievers || [])
              .filter(id => pitcherRoles[id] === 'mopup' && isAvailable(id))
              .map(id => team.players.find(p => p.id === id))
              .filter(Boolean);
            if (mopupPitchers.length > 0) {
              reliever = mopupPitchers[0];
              selectedRoleLabel = '敗戦処理';
            }
          }

          // ショートスターター・オープナー後: ロングリリーフ優先
          if (shouldChange && !reliever && (currentRole === 'short' || currentRole === 'opener')) {
            const longRelievers = (rotation?.middleRelievers || [])
              .filter(id => pitcherRoles[id] === 'long' && isAvailable(id))
              .map(id => team.players.find(p => p.id === id))
              .filter(Boolean);
            if (longRelievers.length > 0) {
              reliever = longRelievers[0];
              selectedRoleLabel = 'ロングリリーフ';
            }
          }

          // 中継ぎエース→通常中継ぎ（疲労が少ない順、ロール別ラベル付き）
          // ワンポイント投手は左打者対策専用なので一般選択から除外
          if (shouldChange && !reliever) {
            const sortedMiddle = (rotation?.middleRelievers || [])
              .filter(id => {
                const p = team.players.find(pl => pl.id === id);
                return p && isAvailable(id) && pitcherRoles[id] !== 'onepoint';
              })
              .sort((a, b) => {
                // 中継ぎエースを接戦時に優先
                const aIsAce = pitcherRoles[a] === 'ace_relief' ? -1 : 0;
                const bIsAce = pitcherRoles[b] === 'ace_relief' ? -1 : 0;
                if (Math.abs(scoreDiff) <= 3) return aIsAce - bIsAce || (fatigue[a] || 0) - (fatigue[b] || 0);
                return (fatigue[a] || 0) - (fatigue[b] || 0);
              });

            if (sortedMiddle.length > 0) {
              reliever = team.players.find(p => p.id === sortedMiddle[0]);
              const role = pitcherRoles[sortedMiddle[0]];
              selectedRoleLabel = role === 'long' ? 'ロングリリーフ' :
                                 role === 'ace_relief' ? '中継ぎエース' :
                                 role === 'mopup' ? '敗戦処理' :
                                 role === 'behind' ? 'ビハインド' : '中継ぎ';
            }
          }

          // フォールバック（先発ローテーション投手・登板済み投手は除外）
          if (shouldChange && !reliever) {
            const starterIds = new Set(rotation?.starters || []);
            // ⚠ `.find()` はロスター順なので同じ投手が毎試合指名される。
            //    reliefFatigue の少ない順にし、守護神は最後へ回す（`closerLast`）
            reliever = team.players
              .filter(p =>
                isPitcherPlayer(p) &&
                p.battingOrder === 0 &&
                p.isActive !== false &&
                !alreadyPitchedIds.has(p.id) &&
                !starterIds.has(p.id) &&
                (p.currentStamina || 80) > 40
              )
              .sort(closerLast(fatigue, rotation?.closer))[0];
            if (reliever) selectedRoleLabel = '緊急中継ぎ';
            if (!reliever) {
              // 最終手段: 先発ローテーション投手も除外せず最もスタミナの残っている投手を選ぶ
              // （先発がpitcherAppearancesに入るとセーブ判定が狂うため、先発は除外して探す）
              const allPitchers = team.players
                .filter(p => isPitcherPlayer(p) && p.battingOrder === 0 && p.isActive !== false && !alreadyPitchedIds.has(p.id) && !starterIds.has(p.id))
                .sort(closerLast(fatigue, rotation?.closer, (a, b) => (b.currentStamina || 0) - (a.currentStamina || 0)));
              if (allPitchers.length > 0) {
                reliever = allPitchers[0];
                selectedRoleLabel = '緊急登板';
              } else {
                // 本当に誰もいない場合のみ先発投手を緊急起用
                const starterPitchers = team.players
                  .filter(p => isPitcherPlayer(p) && p.battingOrder === 0 && p.isActive !== false && !alreadyPitchedIds.has(p.id) && starterIds.has(p.id))
                  .sort((a, b) => (b.currentStamina || 0) - (a.currentStamina || 0));
                if (starterPitchers.length > 0) {
                  reliever = starterPitchers[0];
                  selectedRoleLabel = '緊急登板(先発)';
                }
              }
            }
          }

          if (reliever) {
            bringInReliever({
              defenseTeam: team, teamName, teamKey, pitcherData, reliever,
              outName: pitcher.name, roleLabel: selectedRoleLabel, reason: changeReason,
              // 投手に代打が出ていたら、継投の投手はその代打の打順に入り、代打は退く
              takePinchHitSlot: true,
            });
          }
        }
      }
    }

    // AI監督: 守備固めを検討
    considerDefensiveReplacement(team);
  };

  return {
    considerPinchHitter, considerDefensiveReplacement, considerMidInningPitcherChange,
    bringInReliever, restoreRealCatcher, recoverStarterDamage, afterHalfInning,
  };
};
