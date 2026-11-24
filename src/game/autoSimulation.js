import { tacticalChance } from '../online/tactics.js';
import { createDecisionLog, observeDecisionLog, decisionsFromResult, recordDecisions } from './pitcherDecisions.js';
import { TEAMS_DATA, LEAGUE_SETTINGS, normalizeMaxExtraInnings } from '../teams-data.js';
import { getThrowErrorRate } from '../simulation-logic.js';
import { adjustGrowthModifier, applyFatigueGrowthPenalty, isPitcherPlayer, addFatigue } from '../utils/constants.js';
import { lineupConditionMod, batterFatiguePenalty } from './condition.js';
import { getPositionFitness } from '../utils/physics.js';
import { getTeamStaffBonus } from '../corporate/staffData.js';
import { createSequence, lastCall } from './pitchSequence.js';
import { hitByPitchFatigue } from './pitchZone.js';
import { resolveGroundOutAdvance, tryExtraAdvance } from './baserunning.js';
import { stealSuccessRate, stealAttemptRate } from './stealing.js';
import { classifyBuntContact, rollBuntQuality, buntFieldDefense, buntThrowOutChance, squeezeHomeThrowChance } from './bunting.js';
import { withSeededRandom } from './rng.js';
import { simulatePitch, pitchArsenalOf, fieldDefenseOf } from './pitchEngine.js';
import { createCpuTactics } from './cpuTactics.js';
import { forceAdvance } from './baseState.js';
import { nextRotationStarterId, bestFieldAssignment, applyBattingOrderEntries } from './lineup.js';

// CPU の打順作りで、守備の適性がこれ未満の守備に就けるときの減点の境（オンラインの代役の下限と同じ値）
const AI_LINEUP_MIN_FITNESS = 60;

// 投手疲労閾値: この値以上の疲労なら先発起用しない
const PITCHER_REST_FATIGUE_THRESHOLD = 40;

// AI監督がスタメンを自動生成する機能（エクスポート）
// 毎試合呼ばれ、ローテーション・疲労を考慮して合理的なラインナップを組む。
// 返り値は今日の先発投手（`teamData.players` の中の人。選べなければ undefined）
export const generateAILineup = (teamData, teamName) => {
  const players = teamData.players || [];
  if (players.length === 0) {
    return;
  }


  // 全員の打順をリセット
  // ⚠ **DH の印（`_isDH`）も一緒に外す**。下で印を付け直すのは打順に入る人だけなので、
  //    前の打順の DH が控えに回ると印が残り、守備固めで入ると印付きのまま守備位置を受け取って
  //    「DH が2人・その守備位置が空」になっていた（守備の検索は `!p._isDH` で探す）
  players.forEach(p => { p.battingOrder = 0; delete p._isDH; });

  // 先発投手を先に決定（二刀流選手のフィールド配置に影響するため）
  const rotation = teamData.pitchingRotation;
  const allPitchers = players.filter(p => isPitcherPlayer(p) && p.isActive !== false);
  let starter = null;

  if (rotation?.starters?.length > 0) {
    const index = rotation.currentStarterIndex || 0;

    if (rotation._userSelectedStarter) {
      // ユーザーが簡易スタメンで指定した先発を優先（疲労チェックなし）
      const starterId = rotation.starters[index];
      const candidate = allPitchers.find(p => p.id === starterId);
      if (candidate) {
        starter = candidate;
        if (TEAMS_DATA[teamName]?.pitchingRotation) {
          TEAMS_DATA[teamName].pitchingRotation.currentStarterIndex =
            (index + 1) % rotation.starters.length;
        }
      }
    }

    if (!starter) {
      for (let i = 0; i < rotation.starters.length; i++) {
        const candidateIdx = (index + i) % rotation.starters.length;
        const candidateId = rotation.starters[candidateIdx];
        const candidate = allPitchers.find(p => p.id === candidateId);
        if (candidate && (candidate.fatigue || 0) < PITCHER_REST_FATIGUE_THRESHOLD) {
          starter = candidate;
          if (TEAMS_DATA[teamName]?.pitchingRotation) {
            // index+1 でローテを進める（candidateIdx+1 だとwrap時に同じ位置に戻るバグを防ぐ）
            TEAMS_DATA[teamName].pitchingRotation.currentStarterIndex =
              (index + 1) % rotation.starters.length;
          }
          break;
        }
      }
    }
  }

  if (!starter) {
    const availablePitchers = allPitchers.filter(p => (p.fatigue || 0) < PITCHER_REST_FATIGUE_THRESHOLD);
    if (availablePitchers.length > 0) {
      availablePitchers.sort((a, b) => {
        const staminaA = a.pitching?.stamina || 100;
        const staminaB = b.pitching?.stamina || 100;
        if (staminaA !== staminaB) return staminaB - staminaA;
        return (a.fatigue || 0) - (b.fatigue || 0);
      });
      starter = availablePitchers[0];
    } else {
      allPitchers.sort((a, b) => (a.fatigue || 0) - (b.fatigue || 0));
      starter = allPitchers[0];
    }
  }

  const useDH = LEAGUE_SETTINGS.useDH;

  if (starter) {
    starter.battingOrder = useDH ? 0 : 9;
    starter.position = 'pitcher';
  }

  // 野手を取得（投手登録の二刀流は今日の先発でなければ野手として起用）
  const fieldPlayers = players.filter(p => {
    if (starter && p.id === starter.id) return false;
    if (p.isTwoWay) return true;
    return !isPitcherPlayer(p);
  });

  // コンディション・疲労による実効打撃力の計算
  const getEffectiveBatting = (p) => {
    const condMod = lineupConditionMod(p.condition);
    const fatiguePenalty = batterFatiguePenalty(p.fatigue);
    const meet = (p.batting?.meet || 50) + condMod - fatiguePenalty;
    const power = (p.batting?.power || 50) + condMod - fatiguePenalty;
    return { meet, power, condMod, fatiguePenalty };
  };

  // ポジションごとに最適な選手を選ぶ（守備適性+打撃力+調子+疲労の総合判断）
  // ⚠ **8つの守備をまとめて決める**（`bestFieldAssignment`）。以前は遊撃→二塁→中堅→捕手…と
  //    1か所ずつ一番の人を取っていたので、遊撃も守れる捕手が遊撃に取られて捕手に外野手が入る、
  //    疲れたレギュラーの代わりに捕手が二塁に入る、のように後ろの守備ほど穴になっていた。
  //    1人ずつの点（下の `score`）は前と同じで、合計がいちばん高い組を選ぶ。
  //    適性60未満の守備には足りない分を引く（ほかに組みようがあれば穴を作らない）
  const lineup = [];
  const usedPlayers = new Set();
  // 疲労41以上から段階的に成長ペナルティ(-0.01/-0.02/-0.03)が発生するため休養を促す。
  // fatiguePenalty = 疲労²/1200 なので 疲労41→1, 61→3, 81→5 に対応する
  const fatigueMalus = (fp) => (fp >= 5 ? -50 : fp >= 3 ? -25 : fp >= 1 ? -8 : 0);
  const score = (p, pos) => {
    const fit = getPositionFitness(p, pos);
    const eff = getEffectiveBatting(p);
    return fit * 0.6 + (eff.meet + eff.power) * 0.4 + fatigueMalus(eff.fatiguePenalty)
      - Math.max(0, AI_LINEUP_MIN_FITNESS - fit) * 2;
  };
  const priorityPositions = ['short', 'second', 'center', 'catcher', 'third', 'first', 'left', 'right'];
  const plan = bestFieldAssignment([], fieldPlayers, priorityPositions, score);
  if (plan) {
    for (const pos of priorityPositions) {
      const selected = fieldPlayers.find(p => plan.assign.get(p.id) === pos);
      lineup.push({ player: selected, position: pos });
      usedPlayers.add(selected.id);
    }
  } else {
    // 野手が8人に満たない（埋められない）ときは、前と同じく1か所ずつ取る
    priorityPositions.forEach(pos => {
      const available = fieldPlayers.filter(p => !usedPlayers.has(p.id));
      if (available.length === 0) return;
      available.sort((a, b) => score(b, pos) - score(a, pos));
      const selected = available[0];
      lineup.push({ player: selected, position: pos });
      usedPlayers.add(selected.id);
    });
  }

  // DH制: 打撃専門のDHをベンチから選出
  if (useDH) {
    const dhCandidates = fieldPlayers.filter(p => !usedPlayers.has(p.id));
    if (dhCandidates.length > 0) {
      dhCandidates.sort((a, b) => {
        const aEff = getEffectiveBatting(a);
        const bEff = getEffectiveBatting(b);
        return (bEff.meet + bEff.power) - (aEff.meet + aEff.power);
      });
      lineup.push({ player: dhCandidates[0], position: 'dh' });
      usedPlayers.add(dhCandidates[0].id);
    }
  }

  // 打順を決定
  const battingOrder = [];
  const remaining = [...lineup];
  const maxBattingOrder = useDH ? 9 : 8;

  // 1番: 出塁率重視（ミート+選球眼+足）※調子・疲労込み
  remaining.sort((a, b) => {
    const aEff = getEffectiveBatting(a.player);
    const bEff = getEffectiveBatting(b.player);
    const aVal = aEff.meet * 0.4 + (a.player.batting?.eye || 50) * 0.3 + (a.player.physical?.speed || 50) * 0.3;
    const bVal = bEff.meet * 0.4 + (b.player.batting?.eye || 50) * 0.3 + (b.player.physical?.speed || 50) * 0.3;
    return bVal - aVal;
  });
  if (remaining.length > 0) battingOrder.push({ ...remaining.shift(), battingOrder: 1 });

  // 2番: ミート重視
  remaining.sort((a, b) => {
    const aEff = getEffectiveBatting(a.player);
    const bEff = getEffectiveBatting(b.player);
    const aVal = aEff.meet * 0.5 + (a.player.batting?.eye || 50) * 0.3 + (a.player.physical?.speed || 50) * 0.2;
    const bVal = bEff.meet * 0.5 + (b.player.batting?.eye || 50) * 0.3 + (b.player.physical?.speed || 50) * 0.2;
    return bVal - aVal;
  });
  if (remaining.length > 0) battingOrder.push({ ...remaining.shift(), battingOrder: 2 });

  // 3番: 総合力
  remaining.sort((a, b) => {
    const aEff = getEffectiveBatting(a.player);
    const bEff = getEffectiveBatting(b.player);
    return (bEff.meet * 0.5 + bEff.power * 0.5) - (aEff.meet * 0.5 + aEff.power * 0.5);
  });
  if (remaining.length > 0) battingOrder.push({ ...remaining.shift(), battingOrder: 3 });

  // 4番: パワー最重視
  remaining.sort((a, b) => getEffectiveBatting(b.player).power - getEffectiveBatting(a.player).power);
  if (remaining.length > 0) battingOrder.push({ ...remaining.shift(), battingOrder: 4 });

  // 5番: パワー2番手
  remaining.sort((a, b) => getEffectiveBatting(b.player).power - getEffectiveBatting(a.player).power);
  if (remaining.length > 0) battingOrder.push({ ...remaining.shift(), battingOrder: 5 });

  // 6-最終番: 残りを総合打力順
  remaining.sort((a, b) => {
    const aEff = getEffectiveBatting(a.player);
    const bEff = getEffectiveBatting(b.player);
    return (bEff.meet + bEff.power) - (aEff.meet + aEff.power);
  });
  let nextOrder = 6;
  while (remaining.length > 0 && nextOrder <= maxBattingOrder) {
    battingOrder.push({ ...remaining.shift(), battingOrder: nextOrder++ });
  }

  // 打順を選手に適用（DHは打順のみ設定し、選手の守備ポジションは変更しない）
  applyBattingOrderEntries(teamData.players, battingOrder.map(entry => ({
    playerId: entry.player.id, battingOrder: entry.battingOrder, position: entry.position,
  })));

  // 今日の先発（DH制では打順に入らないので、呼ぶ側はこれで先発を知る。`gameSetup.js`）
  return starter;
};

// ユーザーチームに推奨スタメンを設定
export const setRecommendedLineup = (teamData, teamName) => {
  // AI同様の最適配置を作成し、lineupSettingsに保存
  const players = teamData.players || [];
  if (players.length === 0) return;

  // generateAILineupはcurrentStarterIndexを進めてしまうので保存・復元
  const savedIndex = TEAMS_DATA[teamName]?.pitchingRotation?.currentStarterIndex || 0;

  // 一旦AIロジックでスタメンを組む
  generateAILineup(teamData, teamName);

  if (TEAMS_DATA[teamName]?.pitchingRotation) {
    TEAMS_DATA[teamName].pitchingRotation.currentStarterIndex = savedIndex;
  }

  // 結果をlineupSettingsに保存
  if (!teamData.lineupSettings) {
    teamData.lineupSettings = { battingOrder: [], benchPlayers: [], substitutionRules: { pinchHitter: [], pinchRunner: [] } };
  }

  const starters = players.filter(p => p.battingOrder > 0 && p.battingOrder <= 9);
  // ⚠ DH は守備位置ではなく `_isDH` の印で持つ（position は本来の守備位置のまま）。
  //    打順の保存には「dh」で書くこと。本来の位置で書くと同じ守備位置が2人になり、
  //    日付進行の補完（`ensureCompleteLineup`）が重なった人を空いた位置へ順に回して、
  //    左翼手が捕手・捕手が一塁…と守備が連鎖してずれていた（独立リーグの開幕で見つかった）
  teamData.lineupSettings.battingOrder = starters.map(p => ({
    playerId: p.id,
    battingOrder: p.battingOrder,
    position: p._isDH ? 'dh' : p.position
  }));

};

/**
 * 1試合に出た打者の経験を積む（出場1 + 打数/3、ポジション別・打順別の出場数）。
 * ⚠ **自動試合（`updatePlayerSeasonStats`）と采配試合（`gameSetup` の
 *    `updateManagedGameStats`）で共有する**。以前は自動試合にしか無く、采配した試合では
 *    経験値が一切増えなかった（キャンプの覚醒率・ポジション別の伸びが采配するほど損）。
 * ⚠ **DH はポジションの経験に数えない**（DH は守備位置ではなく `_isDH` の印。position は
 *    本来の守備位置のままなので、以前は守っていない位置の経験として積まれていた）。
 *    打順の経験と経験値は DH でも積む。
 * @param {Object} playerData - TEAMS_DATA の選手（書き込む先）
 * @param {Object} gamePlayer - 試合中の選手（position・battingOrder・_isDH を読む）
 * @param {number} atBats - この試合の打数
 */
export function accrueBatterExperience(playerData, gamePlayer, atBats) {
  playerData.experience = (playerData.experience || 0) + 1 + Math.floor((atBats || 0) / 3);

  if (!playerData.positionExperience) playerData.positionExperience = {};
  if (!gamePlayer._isDH) {
    const pos = gamePlayer.position || 'unknown';
    playerData.positionExperience[pos] = (playerData.positionExperience[pos] || 0) + 1;
  }

  if (!playerData.battingOrderExperience) playerData.battingOrderExperience = {};
  const bo = gamePlayer.battingOrder || 0;
  if (bo >= 1 && bo <= 9) {
    playerData.battingOrderExperience[bo] = (playerData.battingOrderExperience[bo] || 0) + 1;
  }
}

/** 1試合に登板した投手の経験値（登板1 + 投球回）。自動試合と采配試合で共有する */
export function accruePitcherExperience(playerData, outs) {
  playerData.experience = (playerData.experience || 0) + 1 + Math.floor((outs || 0) / 3);
}

/**
 * 1試合の成績をシーズン成績（TEAMS_DATA の選手）へ書き戻す。自動の試合と采配の試合で共用する正本。
 * ⚠ 以前は采配の試合（gameSetup.js）に写しがあり、疲労と成長の補正の順番や犠飛の扱いが
 *    少しずつ違っていた（2026-11-24 に自動の側へそろえた）。
 * 出場の印（_playedToday）・打撃・投手・守備の集計、疲労、成長の補正、経験値、QS まで行う。
 * 勝敗・セーブ・ホールドは別（recordDecisions）。
 *
 * @param {object} playerData TEAMS_DATA の選手（書き込む先）
 * @param {object} teamData TEAMS_DATA の球団（投手の役割を読む）
 * @param {object} player 試合の中の選手（position・battingOrder・_isDH を読む）
 * @param {object} game その試合の成績 { batting, pitching, fielding, wasStarter }
 *   batting: atBats・hits・doubles…（自動の gameStats.batting の形）
 *   pitching: outs・pitches・runsAllowed…（自動の gameStats.pitching の形）
 *   fielding: chances（失策を含む）・errors・assists
 *   wasStarter: この試合の先発だったか
 */
export function writeBackGameStats(playerData, teamData, player, { batting = {}, pitching = {}, fielding = null, wasStarter = false }) {
  // seasonStats が未初期化の場合（新加入選手など）に安全に初期化
  if (!playerData.seasonStats) playerData.seasonStats = { batting: {}, pitching: {} };
  if (!playerData.seasonStats.batting) playerData.seasonStats.batting = {};
  if (!playerData.seasonStats.pitching) playerData.seasonStats.pitching = {};

  // 出場した選手はその日の疲労回復を行わない（recoverAllPitcherFatigueでスキップ）。
  // 打席・登板が無くても、打順を持っていれば途中出場（代走・守備固め）とみなす。
  {
    const gb = batting;
    const gp = pitching;
    const appeared = (gb.atBats || 0) > 0 || (gb.walks || 0) > 0 || (gb.hitByPitch || 0) > 0
      || (gb.sacrificeFlies || 0) > 0
      || (gp.outs || 0) > 0 || (gp.pitches || 0) > 0
      || (player.battingOrder || 0) > 0;
    if (appeared) playerData._playedToday = true;
  }

  // 打撃成績の集計
  // ⚠ 条件を atBats>0 だけにすると「0打数2四球」の試合の四球・死球が
  //    シーズン成績から丸ごと落ちる（実測で死球が9%欠けていた）
  if ((batting.atBats || 0) > 0
      || (batting.walks || 0) > 0
      || (batting.hitByPitch || 0) > 0
      || (batting.sacrificeBunts || 0) > 0     // 犠打だけの試合も出場
      || (batting.sacrificeFlies || 0) > 0) {  // 犠飛だけの試合も
    const b = batting;
    const season = playerData.seasonStats.batting;

    season.games = (season.games || 0) + 1;
    season.atBats = (season.atBats || 0) + (b.atBats || 0);
    season.hits = (season.hits || 0) + (b.hits || 0);
    season.doubles = (season.doubles || 0) + (b.doubles || 0);
    season.triples = (season.triples || 0) + (b.triples || 0);
    season.homeruns = (season.homeruns || 0) + (b.homeruns || 0);
    season.rbis = (season.rbis || 0) + (b.rbis || 0);
    season.walks = (season.walks || 0) + (b.walks || 0);
    season.hitByPitch = (season.hitByPitch || 0) + (b.hitByPitch || 0);
    season.strikeouts = (season.strikeouts || 0) + (b.strikeouts || 0);
    season.stolenBases = (season.stolenBases || 0) + (b.stolenBases || 0);
    season.caughtStealing = (season.caughtStealing || 0) + (b.caughtStealing || 0);
    season.sacrificeBunts = (season.sacrificeBunts || 0) + (b.sacrificeBunts || 0);
    // 犠飛は打った選手にだけ項目を足す（保存を膨らませない。読む側は無ければ 0）
    if (b.sacrificeFlies) season.sacrificeFlies = (season.sacrificeFlies || 0) + b.sacrificeFlies;

    // 経験値・ポジション別・打順別の経験（采配試合と共有）
    accrueBatterExperience(playerData, player, b.atBats || 0);

    // 野手疲労蓄積: スタメン出場(3打席以上)のみ疲労が溜まる
    // 代打(1-2打席)や守備固めは疲労の蓄積なし（ただし回復もしない）
    // 基礎疲労 7〜15（体力100→7, 体力1→15）。オンラインは別の式（`withFielderGameFatigue`）
    const baseFatigue = fielderGameFatigue(playerData.physical?.bodyStamina || 50, b);
    if (baseFatigue > 0) addFatigue(playerData, baseFatigue);
    // 死球の疲労は打席数に関わらず乗る（代打の1打席で当たっても痛い）
    if (b.hbpFatigue) addFatigue(playerData, b.hbpFatigue);

    // 成長率変動: 10試合出場ごとに+0.01
    // 摩耗ペナルティはスタメン出場(3打席以上)時のみ、疲労度に応じて段階的に適用
    // （代打・代走・守備固めではペナルティ無し）
    applyFatigueGrowthPenalty(playerData, (b.atBats || 0) >= 3);
    if (season.games % 10 === 0) adjustGrowthModifier(playerData, 0.01);
  }

  // 投手成績の集計
  // ⚠ **アウトを1つも取れなかった登板も数える**（采配試合の `gameSetup` と同じ条件）。
  //    以前は `outs > 0` だけで、打者に投げて1死も取れずに降りた投手の
  //    失点・被安打・四球・登板数・疲労がまるごと消えていた（防御率が良く見える）。
  if ((pitching.outs || 0) > 0 || (pitching.pitches || 0) > 0) {
    const p = pitching;
    const season = playerData.seasonStats.pitching;

    season.games = (season.games || 0) + 1;
    season.inningsPitched = (season.inningsPitched || 0) + (p.outs || 0);
    season.runsAllowed = (season.runsAllowed || 0) + (p.runsAllowed || 0);
    // 自責点は試合中に失策を考慮して積算済み（p.earnedRuns）。
    // 万一未設定なら失点で代替する（旧セーブ・想定外経路の保険）。
    season.earnedRuns = (season.earnedRuns || 0) + (p.earnedRuns ?? p.runsAllowed ?? 0);
    season.hits = (season.hits || 0) + (p.hits || 0);
    season.homeruns = (season.homeruns || 0) + (p.homeruns || 0);
    season.strikeouts = (season.strikeouts || 0) + (p.strikeouts || 0);
    season.walks = (season.walks || 0) + (p.walks || 0);
    season.hitBatters = (season.hitBatters || 0) + (p.hitBatters || 0);
    season.pitches = (season.pitches || 0) + (p.pitches || 0);
    season.wildPitches = (season.wildPitches || 0) + (p.wildPitches || 0);

    // 成長率変動: 摩耗ペナルティは10球以上投げた登板のみ、疲労度に応じて段階的に適用
    // （10球以下のワンポイント起用ではペナルティ無し）
    applyFatigueGrowthPenalty(playerData, (p.pitches || 0) >= 10);

    // 投手疲労蓄積: bodyStaminaが高いほど疲労が溜まりにくい
    // 先発かどうかはリリーフリストに含まれないかで判定（投球回数ではなく登板種別）
    // ショートスターターも先発登板扱いにしてリリーフより多く疲労が溜まる
    const bodyStamina = playerData.physical?.bodyStamina || 50;
    const staminaBonus = (bodyStamina / 100) * 1.5;
    const baseDivisor = wasStarter ? 1.5 : 3;
    const pitchFatigue = Math.floor((p.pitches || 0) / (baseDivisor + staminaBonus));
    // startBonusは先発として1イニング以上投げた場合のみ付与（短命降板でもペナルティがつかないよう）
    const startBonus = (wasStarter && (p.outs || 0) >= 3) ? 30 : 0;
    const fatigueGain = wasStarter ? pitchFatigue + startBonus : Math.max(11, pitchFatigue);
    addFatigue(playerData, fatigueGain);

    // 成長率変動: 先発はイニング数ベース、リリーフは登板数ベース
    if (wasStarter) {
      // 先発: 15イニング(45アウト)ごとに+0.01
      const prevTotalOuts = season.inningsPitched - (p.outs || 0);
      if (Math.floor(season.inningsPitched / 45) > Math.floor(prevTotalOuts / 45)) {
        adjustGrowthModifier(playerData, 0.01);
      }
    } else {
      // リリーフ: 登板数ベース（守護神/セットアッパー/中継ぎエースは4登板、その他は5登板ごと）
      const pitcherRoles = teamData.pitchingRotation?.pitcherRoles || {};
      const role = pitcherRoles[player.id] || '';
      const highPressureRoles = ['closer', 'setup', 'ace_relief'];
      const threshold = highPressureRoles.includes(role) ? 4 : 5;
      if (season.games % threshold === 0) {
        adjustGrowthModifier(playerData, 0.01);
      }
    }

    // 経験値蓄積（登板1 + 投球回数。采配試合と共有）
    accruePitcherExperience(playerData, p.outs || 0);

    // QS/HQS判定（先発投手のみ）
    if (wasStarter) {
      season.gamesStarted = (season.gamesStarted || 0) + 1;
      const innings = p.outs || 0; // アウト数（18アウト = 6回）
      const earnedRuns = p.earnedRuns ?? p.runsAllowed ?? 0; // QS/HQSは自責点で判定
      // QS: 6回以上 && 自責点3以下
      if (innings >= 18 && earnedRuns <= 3) {
        season.qualityStarts = (season.qualityStarts || 0) + 1;
      }
      // HQS: 7回以上 && 自責点2以下
      if (innings >= 21 && earnedRuns <= 2) {
        season.highQualityStarts = (season.highQualityStarts || 0) + 1;
      }
    }

    // 勝敗・セーブ・ホールドは試合の最後に `recordDecisions` がまとめて記録する
  }

  // 守備成績の集計
  if (fielding) {
    const f = fielding;
    if ((f.chances || 0) > 0 || (f.errors || 0) > 0 || (f.assists || 0) > 0) {
      const season = playerData.seasonStats.batting;
      season.fieldingChances = (season.fieldingChances || 0) + (f.chances || 0);
      season.errors = (season.errors || 0) + (f.errors || 0);
      season.assists = (season.assists || 0) + (f.assists || 0); // 捕殺
    }
  }
}

// 野手が1試合（3打席以上）で溜める疲労。一人用は体力100→7・体力1→15。
// ⚠ オンラインは休養日（4ターンに1回）があるので、この式だと疲労が溜まらない（先方指摘 2026-11-15）。
//    オンラインの1日の処理だけ `withFielderGameFatigue` で式を差し替える（一人用の数字は変えない）。
// `batting` はその試合の打撃成績（`gameStats.batting`）。溜まらない出場（代打など）は 0 を返す。
// 采配した試合（`gameSetup.js`）も同じ式を使う（一人用なので差し替えは見ない）。
export const singleFielderGameFatigue = (bodyStamina, batting) =>
  batting.atBats >= 3 ? Math.round(15 - (bodyStamina / 100) * 8) : 0;
let fielderGameFatigue = singleFielderGameFatigue;
/** `run` の間だけ、野手の1試合の疲労を `gain(体力, その試合の打撃成績)` にする（終われば必ず戻す） */
export const withFielderGameFatigue = (gain, run) => {
  const previous = fielderGameFatigue;
  fielderGameFatigue = gain;
  try {
    return run();
  } finally {
    fielderGameFatigue = previous;
  }
};

// 全チームの疲労を回復（日次処理）
//
// ⚠ **既定値は実ゲームと同じ 20 にすること**。以前は既定25で、実ゲームだけ
//    `dateProgression` が 20 を明示的に渡していた。ハーネスは引数なしで呼ぶので
//    **25で回っており、実ゲームより25%も回復の速いブルペンを測っていた**。
//    実測でロール別の登板数が変わる（守護神 37 → 54 / ビハインド 58 → 50）。
//    `reliefFatigue` もこの量で減るので、リリーフの起用分散に直接効く。
//
// ⚠ 野手はこの引数を使わない。体力比例の別式（下記）で回復する。
//
// スタッフの身体ケア能力で回復量にボーナス（0→×1.0、50→×1.1、100→×1.2）
export const recoverAllPitcherFatigue = (recoveryAmount = 20) => {
  Object.entries(TEAMS_DATA).forEach(([teamName, team]) => {
    if (!team || !team.players) return;

    // スタッフの身体ケアボーナス
    const staffBonus = team.corporateData?.staff ? getTeamStaffBonus(team.corporateData.staff) : null;
    const bodyCare = staffBonus ? (staffBonus.bodyCare || 0) : 0;
    const bodyCareMult = 1.0 + (bodyCare / 100) * 0.2;

    // 選手個人の疲労回復（回復能力が高いほど多く回復）
    // 出場した選手はその日は回復しない（代打・代走・守備固め・ワンポイントも含む）。
    // 試合処理で _playedToday が立つ → ここで消費してスキップする。
    team.players.forEach(player => {
      if (player._playedToday) {
        delete player._playedToday;
        return;
      }
      if (player.fatigue && player.fatigue > 0) {
        const recoveryAbility = player.physical?.recovery || 50;
        let actualRecovery;
        if (player.position === 'pitcher') {
          // 投手: ベース回復 recoveryAmount（既定20）×(0.7〜1.3)（ローテ維持のため従来式）
          const recoveryMult = 0.7 + (recoveryAbility / 100) * 0.6;
          actualRecovery = Math.round(recoveryAmount * recoveryMult * bodyCareMult);
        } else {
          // 野手: 1日回復 = 体力 ×(0.25 + 回復力/100×0.60)（回復0→25%,50→55%,100→85%）
          const body = player.physical?.bodyStamina ?? 50;
          const pct = 0.25 + (recoveryAbility / 100) * 0.60;
          actualRecovery = Math.round(body * pct * bodyCareMult);
        }
        player.fatigue = Math.max(0, player.fatigue - actualRecovery);
      }
    });

    // リリーフ投手の疲労回復
    if (team.pitchingRotation && team.pitchingRotation.reliefFatigue) {
      Object.keys(team.pitchingRotation.reliefFatigue).forEach(id => {
        team.pitchingRotation.reliefFatigue[id] = Math.max(0,
          team.pitchingRotation.reliefFatigue[id] - recoveryAmount
        );
      });
    }
  });
};

// 試合シミュレーション用のチーム複製。試合中に一切参照しない重い履歴/通算系
// フィールドを除外して複製することで、1試合あたりのディープコピーを約2倍高速化する。
// 成績は最後に TEAMS_DATA（原本）へ書き戻すため、コピーに履歴がなくても問題ない。
/** 塁の走者を数にする（一塁＝1・二塁＝2・三塁＝4 の和）。対人版の観測だけが使う */
const basesMask = (bases) => bases.reduce((n, r, i) => (r ? n | (1 << i) : n), 0);

const SIM_CLONE_OMIT = new Set([
  'growthHistory', 'statsHistory', 'careerHistory', 'careerStats', 'previousSeasonStats',
]);
const cloneTeamForSim = (team) =>
  JSON.parse(JSON.stringify(team, (k, v) => (SIM_CLONE_OMIT.has(k) ? undefined : v)));

const simulateGame = (homeTeamName, awayTeamName, isCupGame = false, observer = null) => {

  // TEAMS_DATAからチームデータを取得
  if (!TEAMS_DATA || !TEAMS_DATA[homeTeamName] || !TEAMS_DATA[awayTeamName]) {
    // ⚠ どちらが欠けているか出さないと追えない（0-0引分で静かに返してしまうため）
    const missing = [!TEAMS_DATA?.[homeTeamName] && homeTeamName, !TEAMS_DATA?.[awayTeamName] && awayTeamName]
      .filter(Boolean).join(' / ');
    console.error(`チームデータが見つかりません: ${missing}（${awayTeamName} @ ${homeTeamName}）`);
    return { homeScore: 0, awayScore: 0, result: '引分 0-0', winner: null };
  }

  const homeTeamData = cloneTeamForSim(TEAMS_DATA[homeTeamName]);
  const awayTeamData = cloneTeamForSim(TEAMS_DATA[awayTeamName]);
  // 登録が捕手の選手。⚠ 打順を当てる・代打・守備固めで position を書き換えるので、その前に控える
  //    （`restoreRealCatcher`。捕手に出した代打がそのままマスクをかぶっていた）
  const registeredCatchers = new Set(
    [...homeTeamData.players, ...awayTeamData.players].filter(p => p.position === 'catcher').map(p => p.id),
  );


  // スタメン設定を適用（なければAI生成）
  // AI監督は毎試合新しくスタメンを決める
  const applyLineupSettings = (teamData, teamName) => {
    const settings = teamData.lineupSettings;
    const isUserTeam = settings?.battingOrder?.length > 0;

    if (!isUserTeam) {
      // AI監督が毎試合スタメンを決定
      // currentStarterIndex は selectStarterFromRotation が進める責務を持つため、
      // generateAILineup が進めた分を復元して二重進行を防ぐ
      const rot = TEAMS_DATA[teamName]?.pitchingRotation;
      const savedIdx = rot?.currentStarterIndex;
      generateAILineup(teamData, teamName);
      if (rot && savedIdx !== undefined) rot.currentStarterIndex = savedIdx;
      return;
    }


    // まず全員の打順を0にリセット（DH の印も外す。`generateAILineup` の説明を参照）
    teamData.players.forEach(p => { p.battingOrder = 0; delete p._isDH; });

    // lineupSettingsから打順と守備位置を適用（DHは打順のみ、ポジション変更しない）
    applyBattingOrderEntries(teamData.players, settings.battingOrder);
  };

  applyLineupSettings(homeTeamData, homeTeamName);
  applyLineupSettings(awayTeamData, awayTeamName);
  // 先発で捕手に就いた選手（人やCPUが打順で決めた形。登録が捕手でなくても試合中に替えない）
  const startingCatchers = new Set(
    [...homeTeamData.players, ...awayTeamData.players]
      .filter(p => p.position === 'catcher' && p.battingOrder > 0 && !p._isDH).map(p => p.id),
  );

  const useDH = LEAGUE_SETTINGS.useDH;
  const pitcherBattingOrder = useDH ? 0 : 9;

  // 投手ローテーションから先発投手を選択
  const selectStarterFromRotation = (teamData, teamName) => {
    const rotation = teamData.pitchingRotation;
    const userSelected = rotation?._userSelectedStarter;

    // ユーザー指定 or カスタムラインナップ: ローテの今の順番から先発する（疲労チェックなし）
    // ⚠ 先発は `nextRotationStarterId`（`ensureCompleteLineup` が DH制で打順から外す選手・
    //    非DH制で9番に入れる選手と**同じ決め方**）。以前は今の番の選手だけを見て、
    //    抹消中なら下の疲労チェック付きの選び方に落ちていた。すると次の番が疲れているとき
    //    別の選手が投げ、DH制では打順から外した選手は投げず、打順に残した二刀流の選手が
    //    投げて打順から抜け、8人で戦っていた。
    if ((userSelected || teamData.lineupSettings?.battingOrder?.length > 0) && rotation?.starters?.length > 0) {
      const starterId = nextRotationStarterId(teamData);
      const starter = starterId === undefined ? null : teamData.players.find(p => p.id === starterId);
      const index = starter ? rotation.starters.indexOf(starter.id) : -1;
      // _userSelectedStarter は非アクティブ時でも必ずクリア（無効指名が永続しないよう）
      const teamsRot = TEAMS_DATA[teamName]?.pitchingRotation;
      if (teamsRot) delete teamsRot._userSelectedStarter;
      if (starter) {
        // generateAILineupで既にindex進行済みの場合があるので、重複進行を防止
        // カップ戦はローテ進行しない（リーグ戦のインデックスを維持）
        if (teamsRot && !isCupGame) {
          teamsRot.currentStarterIndex = (index + 1) % rotation.starters.length;
        }
        teamData.players.forEach(p => {
          if (p.id === starter.id) {
            p.battingOrder = pitcherBattingOrder;
            p.position = 'pitcher';
          } else if (!useDH && p.battingOrder === 9 && p.id !== starter.id) {
            p.battingOrder = 0;
          }
        });
        return starter;
      }
    }

    // AIチーム / ローテーション未設定: 疲労チェック付きで先発を選択
    if (!rotation || !rotation.starters || rotation.starters.length === 0) {
      const fallback = teamData.players.filter(p => isPitcherPlayer(p) && p.isActive !== false).sort((a, b) => (a.fatigue || 0) - (b.fatigue || 0))[0];
      if (fallback) {
        fallback.battingOrder = pitcherBattingOrder;
        fallback.position = 'pitcher';
      }
      return fallback;
    }

    const isEligible = (p) => p && p.isActive !== false && (p.fatigue || 0) < PITCHER_REST_FATIGUE_THRESHOLD;
    // 全員疲労/ベンチ外のフォールバック: 最も疲労の少ない登録中の投手
    const getLeastTiredPitcher = () => {
      const all = teamData.players.filter(p => isPitcherPlayer(p) && p.isActive !== false);
      all.sort((a, b) => (a.fatigue || 0) - (b.fatigue || 0));
      return all[0];
    };

    let starter = null;

    if (isCupGame) {
      // カップ戦: ローテ上位（エース級）から疲労の少ない投手を選ぶ
      // ローテ進行なし（リーグ戦のローテに影響させない）
      const topCount = Math.min(3, rotation.starters.length);
      const candidates = rotation.starters
        .map((id, idx) => ({ id, idx, player: teamData.players.find(p => p.id === id) }))
        .filter(({ player }) => isEligible(player))
        .sort((a, b) => {
          const aTop = a.idx < topCount;
          const bTop = b.idx < topCount;
          if (aTop !== bTop) return aTop ? -1 : 1;
          return (a.player.fatigue || 0) - (b.player.fatigue || 0);
        });
      if (candidates.length > 0) {
        starter = candidates[0].player;
      } else {
        starter = getLeastTiredPitcher();
      }
      // カップ戦はローテ進行しない（リーグ戦のインデックスを維持）
    } else {
      // リーグ戦: ローテーション順に疲労・ベンチ外チェックして選択
      const index = rotation.currentStarterIndex || 0;
      let selectedIdx = index;

      for (let i = 0; i < rotation.starters.length; i++) {
        const candidateIdx = (index + i) % rotation.starters.length;
        const candidateId = rotation.starters[candidateIdx];
        const candidate = teamData.players.find(p => p.id === candidateId);
        if (isEligible(candidate)) {
          starter = candidate;
          selectedIdx = candidateIdx;
          break;
        }
      }

      if (!starter) starter = getLeastTiredPitcher();

      if (starter) {
        // selectedIdx+1 でローテを進める（選んだ投手の次から開始してスキップ連鎖を防ぐ）
        TEAMS_DATA[teamName].pitchingRotation.currentStarterIndex =
          (selectedIdx + 1) % rotation.starters.length;
      }
    }

    if (starter) {
      teamData.players.forEach(p => {
        if (p.id === starter.id) {
          p.battingOrder = pitcherBattingOrder;
          p.position = 'pitcher';
        } else if (!useDH && p.battingOrder === 9 && p.id !== starter.id) {
          p.battingOrder = 0;
        }
      });
    }

    return starter;
  };

  const homeStarter = selectStarterFromRotation(homeTeamData, homeTeamName);
  const awayStarter = selectStarterFromRotation(awayTeamData, awayTeamName);

  // 試合状態の初期化
  let gameState = {
    // 回ごとの得点（表＝away、裏＝home）。サヨナラの回は決まった時点までの得点
    lineScore: { away: [], home: [] },
    inning: 1,
    isTopInning: true,
    outs: 0,
    bases: [false, false, false],
    // 自責点判定用: そのイニングで失策により免れたアウト数（本来なら発生していたアウト）
    inningErrorOuts: 0,
    score: { home: 0, away: 0 },
    count: { balls: 0, strikes: 0 },
    homeTeam: {
      ...homeTeamData,
      currentBatterOrder: 1,
      players: homeTeamData.players.map(p => {
        const maxStamina = p.pitching?.stamina || 100;
        const fatigue = p.fatigue || 0;
        // 疲労によりスタミナ上限が低下（最低50%まで）
        const startStamina = Math.max(Math.floor(maxStamina * 0.5), maxStamina - fatigue);
        return {
        ...p,
        currentStamina: startStamina,
        gameStats: {
          batting: { atBats: 0, hits: 0, homeruns: 0, rbis: 0, walks: 0, hitByPitch: 0, strikeouts: 0, stolenBases: 0, caughtStealing: 0 },
          pitching: { outs: 0, runsAllowed: 0, earnedRuns: 0, strikeouts: 0, walks: 0, hitBatters: 0, pitches: 0, wildPitches: 0 },
          fielding: { chances: 0, errors: 0, assists: 0 }
        }
      };})
    },
    awayTeam: {
      ...awayTeamData,
      currentBatterOrder: 1,
      players: awayTeamData.players.map(p => {
        const maxStamina = p.pitching?.stamina || 100;
        const fatigue = p.fatigue || 0;
        const startStamina = Math.max(Math.floor(maxStamina * 0.5), maxStamina - fatigue);
        return {
        ...p,
        currentStamina: startStamina,
        gameStats: {
          batting: { atBats: 0, hits: 0, homeruns: 0, rbis: 0, walks: 0, hitByPitch: 0, strikeouts: 0, stolenBases: 0, caughtStealing: 0 },
          pitching: { outs: 0, runsAllowed: 0, earnedRuns: 0, strikeouts: 0, walks: 0, hitBatters: 0, pitches: 0, wildPitches: 0 },
          fielding: { chances: 0, errors: 0, assists: 0 }
        }
      };})
    },
    // リリーフ投手追跡（登板制限用）
    reliefTracking: {
      home: {
        starterLeftInning: null,  // 先発が降板したイニング
        currentRelieverId: null,  // 現在のリリーフ投手ID
        relieverOutsPitched: 0,   // 現在のリリーフの投球アウト数
        relieverBattersFaced: 0   // 現在のリリーフの対戦打者数
      },
      away: {
        starterLeftInning: null,
        currentRelieverId: null,
        relieverOutsPitched: 0,
        relieverBattersFaced: 0
      }
    },
    // イニング開始時の失点記録（イニング失点計算用）
    inningStartRuns: { home: 0, away: 0 },
    // 先発投手のダメージポイント積算（降板判定用）
    // 単打/四球=4点、長打=6点、失点=10点。イニングまたぎで-10（最低0）
    starterDamagePoints: { home: 0, away: 0 },
    // 投手登板記録（セーブ・ホールド判定用）
    pitcherAppearances: { home: [], away: [] },
    // 守り終えた直後に決めた継投を、次に守る直前まで持ち越す（攻撃中に投手を代えない）
    pendingPitcherChange: { home: null, away: null },
    // 投手交代記録（理由表示用）
    pitcherChanges: [],
    // 現在の投手ID（DH制で複数pitcher判別用）
    currentPitcherId: { home: homeStarter?.id || null, away: awayStarter?.id || null },
    // 交代で退いた選手（再出場させない）。⚠ battingOrder=0 だけだと控えと区別できず、
    //    代打で退いた選手が次の打席でまた代打に出てこられた
    removedIds: new Set(),
    // 投手に代打を出したチーム → { slot, phId, phPos }。イニング終了処理で必ず継投する
    //    （⚠ 以前は代打に position='pitcher' を渡すだけで currentPitcherId が変わらず、
    //       打順から外れた投手がそのまま投げ続けていた）
    pitcherPinchHit: { home: null, away: null },
    // 勝敗・セーブ・ホールドの判定用（登板順とリードの移り変わり。pitcherDecisions.js）
    decisionLog: createDecisionLog()
  };
  observer?.start?.({ homeTeam: gameState.homeTeam, awayTeam: gameState.awayTeam });
  const observeDecisions = () => observeDecisionLog(gameState.decisionLog, {
    score: gameState.score, pitcherIds: gameState.currentPitcherId,
  });

  // 現在の打者を取得
  const getCurrentBatter = (team) => {
    return team.players.find(p => p.battingOrder === team.currentBatterOrder) || team.players[0];
  };

  // 現在の投手を取得
  const getCurrentPitcher = (team) => {
    // currentPitcherIdで追跡（DH制で複数pitcherがbattingOrder=0を持つ問題を回避）
    const teamKey = team === gameState.homeTeam ? 'home' : 'away';
    const currentId = gameState.currentPitcherId?.[teamKey];
    if (currentId) {
      const tracked = team.players.find(p => p.id === currentId);
      if (tracked) return tracked;
    }
    // フォールバック: position + battingOrder
    const pitcher = team.players.find(p => p.position === 'pitcher' && (p.battingOrder === pitcherBattingOrder || p.battingOrder === 9));
    if (pitcher) return pitcher;

    const reliever = team.players.find(p => isPitcherPlayer(p) && p.pitching && p.isActive !== false);
    if (reliever) return reliever;

    return team.players.find(p => p.pitching?.stamina >= 100);
  };

  // 現在の捕手を取得
  const getCurrentCatcher = (team) => {
    // ⚠ 出場中の捕手を先に探す（代打・守備固めで退いた捕手も position='catcher' のまま残る）
    return team.players.find(p => p.position === 'catcher' && p.battingOrder > 0 && !p._isDH)
      || team.players.find(p => p.position === 'catcher') || team.players[0];
  };

  // 守備データを構築（中身は pitchEngine.js の fieldDefenseOf。采配の試合と共用）
  const buildDefense = (team) => fieldDefenseOf(team, getCurrentPitcher(team));

  // 直前の1球で打者が狙い球を当てたか（対人の記録だけが読む。試合の判定には使わない）
  let lastGuessRight = false;
  // 一球シミュレーション。中身は pitchEngine.js（采配の試合と共用の正本）
  const simulateOnePitch = (batterPlayer, pitcherPlayer, catcherPlayer, defense, count, pitcherStamina, bases, sequence, offenseStrategy, defenseStrategy, pitchArsenal) => {
    const { result, guessRight } = simulatePitch({
      batterPlayer, pitcherPlayer, catcherPlayer, defense, count, pitcherStamina, bases,
      outs: gameState.outs, sequence, offenseStrategy, defenseStrategy, pitchArsenal, observer,
    });
    lastGuessRight = guessRight;
    return result;
  };

  // 守備機会（刺殺・補殺）を1つ記録する。守備位置が取れないものは無視する
  const addFieldingChance = (team, position) => {
    if (!position || !team) return;
    const f = team.players.find(p => p.position === position && p.battingOrder >= 1 && !p._isDH);
    if (f?.gameStats?.fielding) f.gameStats.fielding.chances++;
  };

  // 走者進塁処理（外野手の肩で進塁を抑制）
  // bases配列にはプレイヤーオブジェクト or false が格納される
  // hitType に応じて走者を進める。
  // 自責点判定のため、失策で出塁した走者には _reachedOnError を立てておき（塁の移動に追随する）、
  // 生還した非自責走者の数を unearnedRunsScored として返す。
  // extraAdvance: 悪送球・中継ミスで既存の走者が余分に1つ進むケース
  // fieldingPosition: 打球を処理した野手（捕殺の記録先）
  // 戻り値の outsMade / assistBy は呼び出し側でアウト加算・捕殺記録に使う
  const advanceRunners = (hitType, bases, defense, batter, extraAdvance = false, fieldingPosition = null, currentOuts = 0) => {
    const newBases = [false, false, false];
    let runsScored = 0;
    let unearnedRunsScored = 0;
    let outsMade = 0;
    let assistBy = null;
    const isUnearnedRunner = (r) => !!(r && r._reachedOnError);

    if (hitType === 'homerun') {
      runsScored = 1 + bases.filter(b => b).length;
      unearnedRunsScored = bases.reduce((n, b) => n + (isUnearnedRunner(b) ? 1 : 0), 0)
        + (isUnearnedRunner(batter) ? 1 : 0);
      return { bases: [false, false, false], runsScored, unearnedRunsScored, outsMade: 0, assistBy: null };
    }

    const advancement = hitType === 'single' ? 1 : hitType === 'double' ? 2 : 3;

    // 外野手の平均肩力（進塁抑制に使用）
    const ofArms = ['left', 'center', 'right'].map(p => defense?.[p]?.arm || 60);
    const avgArm = ofArms.reduce((a, b) => a + b, 0) / 3;

    for (let i = 2; i >= 0; i--) {
      if (bases[i]) {
        let newBase = i + advancement;

        // 肩による進塁抑制: シングルで1塁走者が3塁を狙う、2塁走者がホームを狙う等
        // 強肩の場合、余分な進塁（1塁→3塁、2塁→本塁on single）をブロック
        // 積極進塁（単打で1塁→3塁 / 2塁→本塁）の駆け引き。
        // 足が速い走者ほど狙い、外野の肩が強いほど自重する。狙って失敗すれば捕殺で刺される。
        const runner = bases[i];
        const runnerSpeed = (runner && typeof runner === 'object' && runner.physical?.speed) || 55;
        // 積極進塁（単打で 2塁→本塁 / 1塁→3塁、二塁打で 1塁→本塁）。詳細は baserunning.js 参照
        if (!extraAdvance && outsMade === 0) {
          const thrower = fieldingPosition ? (defense?.[fieldingPosition] || null) : null;
          const cutoff = defense?.short || defense?.second || { defense: 60 };
          const { attempt, thrownOut } = tryExtraAdvance({
            hitType, fromBase: i, runnerSpeed, avgArm, currentOuts,
            throwerArm: thrower?.arm ?? null, cutoffDefense: cutoff.defense || 60,
          });
          if (attempt && thrownOut) {
            outsMade++;
            assistBy = fieldingPosition || null;
            continue; // 刺された → 進塁も得点もしない
          }
          // 賭けに勝って余分に進塁。ただし先を走る走者がその塁に止まっていたら進まない
          // （以前は同じ塁に2人が重なり、先の走者が黙って消えていた。手動試合と同じ門番）
          if (attempt && (newBase + 1 >= 3 || !newBases[newBase + 1])) newBase++;
        }
        // 悪送球・中継ミス: 送球が乱れているので走者が余分に1つ進む
        if (extraAdvance) newBase++;

        if (newBase >= 3) {
          runsScored++;
          if (isUnearnedRunner(bases[i])) unearnedRunsScored++;
        } else {
          newBases[newBase] = bases[i]; // プレイヤー参照を維持（_reachedOnError も追随）
        }
      }
    }

    // 打者自身を塁に配置（三塁打は三塁に残る。本塁打は上で先に返している。
    // 以前は `advancement < 3` で分けていたので、三塁打の打者が必ず生還していた）
    newBases[advancement - 1] = batter || true;

    return { bases: newBases, runsScored, unearnedRunsScored, outsMade, assistBy };
  };

  // 得点を投手の自責点に計上する（失点は呼び出し側で別途加算済み）。
  //   非自責となるのは
  //     (a) 失策で出塁した走者が生還した分
  //     (b) 失策が無ければ既に3アウトだった後の得点（そのイニングは以降すべて非自責）
  const creditRuns = (pitcher, runsScored, unearnedRunsScored = 0) => {
    if (!pitcher || runsScored <= 0) return;
    const ps = pitcher.gameStats.pitching;
    const inningOver = (gameState.outs + (gameState.inningErrorOuts || 0)) >= 3;
    const earned = inningOver ? 0 : Math.max(0, runsScored - (unearnedRunsScored || 0));
    ps.earnedRuns = (ps.earnedRuns || 0) + earned;
  };

  // 走者1人の生還: 攻撃側の得点・投手の失点・自責の内訳（`unearned` が 1 なら非自責）。
  // 打点は付かない場面（暴投・捕逸など）があるので呼ぶ側で足す。
  // ⚠ 1人ずつの生還はここを通す（以前は同じ4行が7か所に写してあった）。複数人の生還（安打）は打席の終わりでまとめて足す
  const scoreRun = (pitcher, unearned) => {
    if (gameState.isTopInning) gameState.score.away++;
    else gameState.score.home++;
    if (!pitcher?.gameStats?.pitching) return;
    pitcher.gameStats.pitching.runsAllowed++;
    creditRuns(pitcher, 1, unearned);
  };

  // 四球・死球の押し出し（`baseState.forceAdvance`。詰まっている走者だけが1つ進む）。
  // 満塁なら三塁走者が生還し、失点と打点が付く（押し出しも打点）。失策で出た走者
  // （`_reachedOnError`）の生還は非自責。塁の配列は入れ替えず中身を書き換える。
  // 戻り値は生還した人数
  const forceAdvanceOnWalk = (batter, pitcher) => {
    const { bases, scored } = forceAdvance(gameState.bases, batter);
    for (const runner of scored) {
      scoreRun(pitcher, runner?._reachedOnError ? 1 : 0);
      batter.gameStats.batting.rbis++;
    }
    for (let i = 0; i < 3; i++) gameState.bases[i] = bases[i];
    return scored.length;
  };

  // 盗塁判定（AI監督）- 走者の実際の走力を使用
  const attemptStolenBase = (offenseTeam, defenseTeam) => {
    if (offenseTeam.strategy?.baseRunning === 'never') return null;
    const pitcher = getCurrentPitcher(defenseTeam);
    const catcher = getCurrentCatcher(defenseTeam);

    for (let base = 0; base < 2; base++) {
      if (gameState.bases[base] && !gameState.bases[base + 1]) {
        // 塁上の走者オブジェクトから直接走力を取得
        const runner = gameState.bases[base];
        const runnerSpeed = (typeof runner === 'object' && runner?.physical?.speed)
          ? runner.physical.speed
          : offenseTeam.players.filter(p => p.battingOrder > 0 && p.battingOrder <= 9)
              .reduce((sum, p) => sum + (p.physical?.speed || 50), 0) / 9;

        const catcherArm = catcher?.physical?.arm || 50;
        // 盗塁の判断・成否は采配モードと共有する（stealing.js）。
        // 以前は2エンジンが別式で、しかもこちらは盗塁スキル(steal)を見ていなかった
        const runnerSteal = (typeof runner === 'object' && runner?.batting?.steal) ?? 50;
        const successChance = stealSuccessRate({
          runnerSpeed, runnerSteal, catcherArm,
          pitcherControl: pitcher?.pitching?.control || 50,
          pitcherThrows: pitcher?.physical?.throws || 'right',
          toBase: base + 2,
        });
        const attemptRate = stealAttemptRate({
          successRate: successChance, runnerSteal, outs: gameState.outs, toBase: base + 2,
          strategy: offenseTeam.strategy?.baseRunning || 'normal',
        });

        if (Math.random() < attemptRate) {
          if (Math.random() < successChance) {
            const stolenRunner = gameState.bases[base];
            gameState.bases[base] = false;
            gameState.bases[base + 1] = stolenRunner;
            // 盗塁成功を実際の走者の成績に記録
            if (typeof stolenRunner === 'object' && stolenRunner?.gameStats?.batting) {
              stolenRunner.gameStats.batting.stolenBases = (stolenRunner.gameStats.batting.stolenBases || 0) + 1;
            }
            const runnerName = typeof stolenRunner === 'object' ? stolenRunner.name : '走者';
            return { success: true, base };
          } else {
            // 刺すはずの送球が乱れると走者は生き、さらに次の塁まで進む（捕手の失策）。
            // 送り手＝捕手の肩、受け手＝二塁/三塁カバーの守備で判定する。
            const coverPos = base === 0 ? 'second' : 'third';
            const cover = defenseTeam.players.find(p => p.position === coverPos && p.battingOrder >= 1 && !p._isDH);
            const throwErr = getThrowErrorRate(catcherArm, cover?.fielding?.defense ?? 60, 0.4);
            if (Math.random() < throwErr) {
              const runnerObj = gameState.bases[base];
              gameState.bases[base] = false;
              // 悪送球で1つ余分に進む。⚠ 先の塁が埋まっていたら盗んだ塁で止まる
              //    （以前は三塁走者を上書きして消していた）
              const dest = (base + 2 <= 2 && gameState.bases[base + 2]) ? base + 1 : base + 2;
              if (dest <= 2) {
                gameState.bases[dest] = runnerObj;
              } else {
                // 生還（失策絡みなので非自責）
                if (runnerObj && typeof runnerObj === 'object') runnerObj._reachedOnError = true;
                scoreRun(getCurrentPitcher(defenseTeam), 1);
              }
              if (catcher?.gameStats?.fielding) {
                catcher.gameStats.fielding.errors++;
                catcher.gameStats.fielding.chances++;
              }
              return { success: true, base, throwError: true };
            }
            gameState.bases[base] = false;
            gameState.outs++;
            // ⚠ 盗塁死のアウトも投手の投球回に入る（以前は抜けていて、投球回が試合で26や23になった）
            if (pitcher?.gameStats?.pitching) pitcher.gameStats.pitching.outs++;
            // 盗塁死を走者の成績に記録する（従来は記録されておらず成功率が常に100%だった）
            if (typeof runner === 'object' && runner?.gameStats?.batting) {
              runner.gameStats.batting.caughtStealing = (runner.gameStats.batting.caughtStealing || 0) + 1;
            }
            // 盗塁刺は捕手の補殺＋塁のカバーの刺殺
            if (catcher?.gameStats?.fielding) {
              catcher.gameStats.fielding.chances++;
              catcher.gameStats.fielding.assists = (catcher.gameStats.fielding.assists || 0) + 1;
            }
            if (cover?.gameStats?.fielding) cover.gameStats.fielding.chances++;
            return { success: false, base };
          }
        }
      }
    }
    return null;
  };

  // バント実行（結果判定）
  const executeBunt = (buntType, batterPlayer, pitcherPlayer, catcherPlayer, defense, bases, outs) => {
    const buntSkill = batterPlayer.batting?.bunt || 30;
    const meet = batterPlayer.batting?.meet || 50;
    const speed = batterPlayer.physical?.speed || 50;

    // Step 1: フェア/ファウル/フライ判定（式は `bunting.js` で采配モードと共有）
    const contact = classifyBuntContact(Math.random() * 100, buntSkill, meet);
    if (contact === 'popup') return { type: 'bunt_popup' };
    if (contact === 'foul') return { type: 'bunt_foul' };

    // Step 2: バントの質
    const quality = rollBuntQuality(buntSkill, meet);

    // Step 3: 守備の送球アウト判定
    const avgFieldDef = buntFieldDefense(
      defense.pitcher?.defense, defense.first?.defense,
      defense.third?.defense, catcherPlayer?.fielding?.defense);
    const batterOut = Math.random() * 100 < buntThrowOutChance(buntType, speed, quality, avgFieldDef);

    // スクイズ時の本塁送球判定（3塁走者のセーフ/アウト）
    let squeezeRunnerSafe = true;
    if (buntType === 'squeeze' && bases[2]) {
      squeezeRunnerSafe = Math.random() * 100 >= squeezeHomeThrowChance(quality, avgFieldDef);
    }

    return { type: 'bunt_fair', batterOut, quality, buntType, squeezeRunnerSafe };
  };

  // バントAI判定
  const decideBunt = (batter, offenseTeam, gameState) => {
    const { bases, outs } = gameState;
    const myScore = gameState.isTopInning ? gameState.score.away : gameState.score.home;
    const oppScore = gameState.isTopInning ? gameState.score.home : gameState.score.away;
    const scoreDiff = myScore - oppScore;
    const isCloseGame = Math.abs(scoreDiff) <= 2;
    const buntSkill = batter.batting?.bunt || 30;
    const batterTotal = (batter.batting?.meet || 0) + (batter.batting?.power || 0);
    const batterSpeed = batter.physical?.speed || 50;
    // ⚠ 「投手が打席に立っている」は**その試合の守備位置**で見る。登録や能力
    //    （`isPitcherPlayer` はスタミナ100以上も投手とみなす）で見ると、野手で出ている
    //    二刀流の投手まで投手扱いになり、送りバントや代打の対象になっていた
    const isPitcherBatter = batter.position === 'pitcher';

    // スクイズ: 3塁ランナー、1アウト、接戦、バント能力40以上
    if (bases[2] && outs === 1 && isCloseGame && buntSkill >= 40) {
      const squeezeChance = isPitcherBatter ? 0.60 :
                            (buntSkill >= 60 && batterTotal < 110) ? 0.40 :
                            (buntSkill >= 50) ? 0.25 : 0.10;
      if (Math.random() < tacticalChance(squeezeChance, offenseTeam.onlineTactics?.squeeze)) return 'squeeze';
    }

    // 犠打: 1塁or2塁ランナー、0-1アウト、弱打者or投手
    if ((bases[0] || bases[1]) && !bases[2] && outs <= 1) {
      const shouldSacrifice = isPitcherBatter ||
                              (batterTotal < 100 && buntSkill >= 35) ||
                              (buntSkill >= 60 && batterTotal < 120);
      if (shouldSacrifice) {
        const sacChance = isPitcherBatter ? 0.70 :
                          (gameState.inning >= 7 && isCloseGame) ? 0.50 : 0.35;
        if (Math.random() < tacticalChance(sacChance, offenseTeam.onlineTactics?.sacrificeBunt)) return 'sacrifice';
      }
    }

    // セーフティ: 俊足+バント巧者、0-1アウト
    if (batterSpeed >= 75 && buntSkill >= 55 && outs <= 1) {
      if (!bases[0] || (bases[0] && !bases[1] && !bases[2])) {
        const safetyChance = 0.05 + (batterSpeed - 75) * 0.003 + (buntSkill - 55) * 0.002;
        if (Math.random() < tacticalChance(safetyChance, offenseTeam.onlineTactics?.safetyBunt)) return 'safety';
      }
    }

    return null;
  };

  // 代打判定（AI監督）- 状況判断・理由付き版
  // CPU の采配（代打・守備固め・継投）。中身は cpuTactics.js（采配の試合と共用の正本）
  const { considerPinchHitter, considerMidInningPitcherChange, recoverStarterDamage, afterHalfInning } =
    createCpuTactics({ gameState, homeTeamName, awayTeamName, useDH, registeredCatchers, startingCatchers, getCurrentPitcher });

  // バント安打の走者の進め方。⚠ 以前は `bases[2]=bases[1]` の後に二塁を空けておらず、
  //    同じ走者が二・三塁の両方に残っていた（600試合で26件）。
  //    一塁走者は押し出されて二塁へ、二塁走者は一塁が空いていても三塁へ進む（送りバントの形）。
  const advanceOnBuntHit = (batter, pitcher) => {
    pitcher.gameStats.pitching.hits = (pitcher.gameStats.pitching.hits || 0) + 1;
    const b = gameState.bases;
    if (b[0]) {
      if (b[1]) {
        if (b[2]) {   // 満塁の押し出し
          batter.gameStats.batting.rbis++;
          scoreRun(pitcher, b[2]?._reachedOnError ? 1 : 0);
        }
        b[2] = b[1];
      }
      b[1] = b[0];
    } else if (b[1] && !b[2]) {
      b[2] = b[1];
      b[1] = false;
    }
    b[0] = batter;
  };

  // 打席シミュレーション
  const simulateAtBat = () => {
    const offenseTeam = gameState.isTopInning ? gameState.awayTeam : gameState.homeTeam;
    const defenseTeam = gameState.isTopInning ? gameState.homeTeam : gameState.awayTeam;

    let batter = getCurrentBatter(offenseTeam);
    let pitcher = getCurrentPitcher(defenseTeam);

    if (!batter) {
      console.error('打者が取得できません', offenseTeam);
      return;
    }
    if (!pitcher) {
      console.error('投手が取得できません', defenseTeam);
      return;
    }

    const scheduledBatterId = observer ? batter.id : null;
    // AI監督: 代打を検討
    batter = considerPinchHitter(offenseTeam, batter);
    // 失策で出た印は塁に居る間だけのもの。⚠ 以前はイニングの頭でしか消さず、
    //    打者一巡で同じ回にまた打席に立つと、安打で出ても非自責の走者のままだった
    delete batter._reachedOnError;

    // AI監督: 打席間のピンチ投手交代（ランナー状況・スタミナ考慮）
    considerMidInningPitcherChange(defenseTeam, pitcher, gameState);
    // ⚠ 交代したらこの打者には**新しい投手**が投げる。以前は交代前に取った
    //    `const pitcher` のまま打席を進めており、全打席の約6%で交代済みの投手が投げていた
    //    （左のワンポイントは狙った左打者ではなく次の打者と対戦していた）
    pitcher = getCurrentPitcher(defenseTeam) || pitcher;
    observeDecisions();   // この打者に投げる投手を登板順に記録（登板時の点差つき）
    const catcher = getCurrentCatcher(defenseTeam);
    const defense = buildDefense(defenseTeam);

    // 対人版から明示的に指定された時だけ観測する。通常試合の記録・判定・乱数には触れない。
    const observed = observer ? {
      before: { ...batter.gameStats.batting },
      pitcherOuts: pitcher.gameStats.pitching.outs,
      batterId: batter.id, batterName: batter.name, pitcherId: pitcher.id, pitcherName: pitcher.name,
      // 捕手の成績（マスクをかぶった時の投手成績）のため。失点・自責点はこの打席で増えたぶん
      catcherId: catcher?.id ?? null,
      runsBefore: pitcher.gameStats.pitching.runsAllowed || 0,
      earnedBefore: pitcher.gameStats.pitching.earnedRuns || 0,
      calls: 0, reads: 0,
      offense: offenseTeam.name, defense: defenseTeam.name,
      inning: gameState.inning, pinchHit: batter.id !== scheduledBatterId,
      scoreBefore: { ...gameState.score },
      throws: pitcher.physical?.throws || 'right',
      starter: pitcher.id === (defenseTeam === gameState.homeTeam ? homeStarter?.id : awayStarter?.id),
      pitches: 0, twoStrikes: false, fouls: 0, result: null,
    } : null;
    const observeReplay = (kind, extra = {}) => {
      if (!observer?.replay) return;
      observer.replay({
        kind, inning: gameState.inning, top: gameState.isTopInning,
        outs: gameState.outs, balls: gameState.count.balls, strikes: gameState.count.strikes,
        homeScore: gameState.score.home, awayScore: gameState.score.away,
        batterId: batter.id, pitcherId: pitcher.id, order: batter.battingOrder,
        bases: gameState.bases.map(r => r ? (r.id ?? true) : null),
        stamina: pitcher.currentStamina ?? null,
        pitcherPitches: pitcher.gameStats?.pitching?.pitches || 0,
        homeHits: gameState.homeTeam.players.reduce((n,p) => n + (p.gameStats?.batting?.hits || 0), 0),
        awayHits: gameState.awayTeam.players.reduce((n,p) => n + (p.gameStats?.batting?.hits || 0), 0),
        homeErrors: gameState.homeTeam.players.reduce((n,p) => n + (p.gameStats?.fielding?.errors || 0), 0),
        awayErrors: gameState.awayTeam.players.reduce((n,p) => n + (p.gameStats?.fielding?.errors || 0), 0),
        ...(kind === 'matchup' ? { lineups: Object.fromEntries([offenseTeam, defenseTeam].map(t => [t.name, t.players.filter(p => p.battingOrder > 0).map(p => ({ id: p.id, order: p.battingOrder, position: p.position }))])) } : {}),
        ...extra,
      });
    };
    observeReplay('matchup', { pinchHit: batter.id !== scheduledBatterId });
    const observeSituation = () => {
      if (!observed) return;
      observed.risp = !!(gameState.bases[1] || gameState.bases[2]);
      observed.dpPossible = gameState.outs < 2 && !!gameState.bases[0];
      observed.resultStartOuts = pitcher.gameStats.pitching.outs;
      // 最後の1球の前の得点（その打席の途中に暴投などで入った点を、打者の点と分けるため。
      // オンラインの「回の攻撃」が読む。⚠ 2026-11-20 監査「三振 1点」）
      observed.resultScore = { ...gameState.score };
      // 最後の1球の前の塁（一塁＝1・二塁＝2・三塁＝4 の和）。打席の途中に暴投などで点が入った後の塁
      observed.resultBases = basesMask(gameState.bases);
    };

    let atBatOver = false;
    let pitchCount = 0;
    const maxPitches = 20;
    // 打席ごとの配球メモリ（前球の位置・球速・引き出し）。pitchSequence.js
    const sequence = createSequence();
    const pitchArsenal = pitchArsenalOf(pitcher);
    gameState._stolenAttempted = false;
    let atBatDamagePoints = 0; // この打席で先発に蓄積するダメージポイント

    // AI監督: バント判定（投球ループ前に決定）
    const buntDecision = decideBunt(batter, offenseTeam, gameState);
    if (buntDecision) {
      // `pitcher` は `defenseTeam.players` の中の選手そのもの（`getCurrentPitcher`）
      pitcher.currentStamina = Math.max(0, pitcher.currentStamina - 1);
      pitcher.gameStats.pitching.pitches++;

      observeSituation();
      const buntResult = executeBunt(buntDecision, batter, pitcher, catcher, defense, gameState.bases, gameState.outs);
      if (observed) {
        observed.bunt = buntDecision;
        observed.buntOutcome = buntResult.type;
        observed.pitches++;
        observed.result = buntResult;
      }

      if (buntResult.type === 'bunt_popup') {
        batter.gameStats.batting.atBats++;
        pitcher.gameStats.pitching.outs++;
        gameState.outs++;
        atBatOver = true;
      } else if (buntResult.type === 'bunt_foul') {
        // ファウル → 0-1カウントで通常打席へ
        gameState.count = { balls: 0, strikes: 1 };
      } else if (buntResult.type === 'bunt_fair') {
        if (buntDecision === 'squeeze') {
          if (buntResult.squeezeRunnerSafe && gameState.bases[2]) {
            batter.gameStats.batting.rbis++;
            scoreRun(pitcher, gameState.bases[2]?._reachedOnError ? 1 : 0);
            atBatDamagePoints += 10;
            gameState.bases[2] = false;
          } else if (!buntResult.squeezeRunnerSafe && gameState.bases[2]) {
            gameState.outs++;
            pitcher.gameStats.pitching.outs++;
            gameState.bases[2] = false;
          }
          if (buntResult.batterOut) {
            pitcher.gameStats.pitching.outs++;
            gameState.outs++;
            batter.gameStats.batting.sacrificeBunts = (batter.gameStats.batting.sacrificeBunts || 0) + 1;
          } else {
            batter.gameStats.batting.atBats++;
            batter.gameStats.batting.hits++;
            // 走者進塁 + 打者1塁
            advanceOnBuntHit(batter, pitcher);
          }
          atBatDamagePoints += 4;
          atBatOver = true;
        } else if (buntDecision === 'sacrifice') {
          if (buntResult.batterOut) {
            pitcher.gameStats.pitching.outs++;
            gameState.outs++;
            batter.gameStats.batting.sacrificeBunts = (batter.gameStats.batting.sacrificeBunts || 0) + 1;
            // 走者進塁（アウト3未満の場合）
            if (gameState.outs < 3) {
              if (gameState.bases[1]) {
                gameState.bases[2] = gameState.bases[1];
                gameState.bases[1] = false;
              }
              if (gameState.bases[0]) {
                gameState.bases[1] = gameState.bases[0];
                gameState.bases[0] = false;
              }
            }
          } else {
            batter.gameStats.batting.atBats++;
            batter.gameStats.batting.hits++;
            advanceOnBuntHit(batter, pitcher);
          }
          atBatDamagePoints += 4;
          atBatOver = true;
        } else {
          // セーフティバント
          if (buntResult.batterOut) {
            batter.gameStats.batting.atBats++;
            pitcher.gameStats.pitching.outs++;
            gameState.outs++;
          } else {
            batter.gameStats.batting.atBats++;
            batter.gameStats.batting.hits++;
            advanceOnBuntHit(batter, pitcher);
            atBatDamagePoints += 4;
          }
          atBatOver = true;
        }
      }
    }

    const isWalkOff = () => !gameState.isTopInning && gameState.inning >= 9
      && gameState.score.home > gameState.score.away;
    if (buntDecision) observeReplay('bunt', { result: observed?.buntOutcome || null, completed: atBatOver });
    while (!atBatOver && pitchCount < maxPitches) {
      // 暴投・盗塁の悪送球でサヨナラの走者が還ったら、その時点で試合終了
      if (isWalkOff()) break;
      pitchCount++;

      // AI監督: 盗塁を検討（各球で検討、ただし1打席1回まで）
      if (pitchCount <= 3 && gameState.outs < 2 && !gameState._stolenAttempted) {
        const stealBefore = observed ? {outs:pitcher.gameStats.pitching.outs,risp:!!(gameState.bases[1] || gameState.bases[2])} : null;
        const stealResult = attemptStolenBase(offenseTeam, defenseTeam);
        if (observed && pitcher.gameStats.pitching.outs > stealBefore.outs) observer.runnerOut?.({...observed,risp:stealBefore.risp,outs:pitcher.gameStats.pitching.outs-stealBefore.outs,endBases:basesMask(gameState.bases)});
        if (stealResult) gameState._stolenAttempted = true;
        if (stealResult) observeReplay('steal', { success: stealResult.success, base: stealResult.base });
        if (stealResult && !stealResult.success && gameState.outs >= 3) {
          // 盗塁死で3アウトなら打席終了
          atBatOver = true;
          break;
        }
      }

      // 暴投・捕逸（走者がいる時のみ）: 投手の制球と捕手の守備で決まる。
      // 守備の良い捕手はワンバウンドを確実に止め、走者の進塁を防ぐ。
      if (gameState.bases.some(Boolean)) {
        const pControl = pitcher.pitching?.control ?? pitcher.control ?? 50;
        const cDef = catcher?.fielding?.defense ?? 50;
        // 制球50・捕手守備60 で1球あたり約0.8%。捕手守備が低いほど後逸が増える
        const wpRate = Math.max(0.001,
          0.010 * (1 - pControl / 200) * (1 - (cDef - 30) / 140));
        if (Math.random() < wpRate) {
          if (pitcher.gameStats?.pitching) pitcher.gameStats.pitching.wildPitches = (pitcher.gameStats.pitching.wildPitches || 0) + 1;
          // 全走者が1つ進塁（三塁走者は生還）
          for (let b = 2; b >= 0; b--) {
            if (!gameState.bases[b]) continue;
            const r = gameState.bases[b];
            gameState.bases[b] = false;
            if (b === 2) {
              scoreRun(getCurrentPitcher(defenseTeam), (r && r._reachedOnError) ? 1 : 0);
            } else {
              gameState.bases[b + 1] = r;
            }
          }
          observeReplay('wild_pitch');
        }
      }

      // ⚠ 盗塁の悪送球・暴投でサヨナラの走者が還ったら、この球の結果は出さない。
      //    ループ先頭の判定だけだと、同じ球の中で決まったサヨナラの後にもう1球投げ、
      //    打席の結果（三振・安打など）まで記録していた
      if (isWalkOff()) break;

      // 投手のスタミナを取得
      const pitcherStamina = pitcher.currentStamina;

      // チームの作戦設定を取得
      const offenseStrategy = (gameState.isTopInning ? gameState.awayTeam : gameState.homeTeam).strategy;
      const defenseStrategy = (gameState.isTopInning ? gameState.homeTeam : gameState.awayTeam).strategy;

      // 一球シミュレーション（simulation-logic.jsの物理エンジンを使用）
      // 前球の記録は simulateOnePitch 内で sequence に積まれる（緩急・対角の判定に使う）
      if (observed) {
        observeSituation();
        observed.twoStrikes ||= gameState.count.strikes >= 2;
      }
      const result = simulateOnePitch(batter, pitcher, catcher, defense, gameState.count, pitcherStamina, gameState.bases, sequence, offenseStrategy, defenseStrategy, pitchArsenal);
      if (observed) {
        observed.pitches++;
        observed.calls++;
        if (lastGuessRight) observed.reads++;
        observed.result = result;
        if (result.type === 'foul') {
          observed.fouls++;
          if (gameState.count.strikes >= 2) observed.twoStrikeFouls=(observed.twoStrikeFouls || 0)+1;
        }
      }

      // スタミナ減少
      pitcher.currentStamina = Math.max(0, pitcher.currentStamina - 1);
      pitcher.gameStats.pitching.pitches++;

      // 結果処理
  
      switch (result.type) {
        case 'ball':
          gameState.count.balls++;
          if (gameState.count.balls === 4) {
            // 四球
            batter.gameStats.batting.walks++;
            pitcher.gameStats.pitching.walks++;
            atBatDamagePoints += 4; // 四球=4ダメージ
            atBatDamagePoints += 10 * forceAdvanceOnWalk(batter, pitcher); // 押し出しの失点=10ダメージ
            atBatOver = true;
          }
          break;

        case 'hit_by_pitch': {
          // 死球。四球と同じ押し出し進塁だが、打数にも四球にも計上しない
          batter.gameStats.batting.hitByPitch++;
          pitcher.gameStats.pitching.hitBatters++;
          // 故障は作らないが、**疲労は大きく溜まる**（速い球ほど・体力が無いほど）
          batter.gameStats.batting.hbpFatigue =
            (batter.gameStats.batting.hbpFatigue || 0)
            + hitByPitchFatigue(result.velocity, batter.physical?.bodyStamina ?? 50);
          atBatDamagePoints += 4;
          atBatDamagePoints += 10 * forceAdvanceOnWalk(batter, pitcher);
          atBatOver = true;
          break;
        }

        case 'called_strike':
        case 'swinging_strike':
          gameState.count.strikes++;
          if (gameState.count.strikes === 3) {
            // 三振
            batter.gameStats.batting.atBats++;
            batter.gameStats.batting.strikeouts++;
            addFieldingChance(defenseTeam, 'catcher');   // 三振は捕手の刺殺
            pitcher.gameStats.pitching.outs++;
            pitcher.gameStats.pitching.strikeouts++;
            gameState.outs++;
            atBatOver = true;
          }
          break;

        case 'foul':
        case 'foul_2strike':
          if (gameState.count.strikes < 2) {
            gameState.count.strikes++;
          }
          // 2ストライク時のファウルはカウント変わらず
          break;

        case 'out': {
          batter.gameStats.batting.atBats++;
          pitcher.gameStats.pitching.outs++;
          gameState.outs++;

          // 守備機会を記録（アウトにした野手）
          addFieldingChance(defenseTeam, result.fieldingPosition);
          // **送球を受けた側にも刺殺が付く**。内野ゴロのアウトは
          // 「捕った野手の補殺 ＋ 一塁手の刺殺」の2つが記録される。
          // これが無いと一塁手の守備機会が実NPBの9.5に対し1.1しか出ず、
          // 守備率が事実上測定できない（三振の捕手も同様）
          if (result.isGroundOut && result.fieldingPosition && result.fieldingPosition !== 'first') {
            addFieldingChance(defenseTeam, 'first');
          }

          // 内野ゴロでの走者進塁（ゴロGO・進塁打）。詳細は baserunning.js 参照
          if (result.isGroundOut && gameState.outs < 3) {
            const inf = ['first', 'second', 'third', 'short'].map(p => defense[p]?.defense ?? 50);
            const adv = resolveGroundOutAdvance({
              hasThird: !!gameState.bases[2], hasSecond: !!gameState.bases[1],
              infieldDefense: inf.reduce((a, b) => a + b, 0) / inf.length,
              // ⚠ 塁上は選手そのもの（走力は physical.speed）。以前は `.speed` を読んで
              //    常に 50 になり、俊足でも鈍足でもゴロでの進塁率が同じだった
              thirdSpeed: gameState.bases[2]?.physical?.speed ?? 50,
              secondSpeed: gameState.bases[1]?.physical?.speed ?? 50,
            });
            if (adv.scoreFromThird) {
              const unearned = gameState.bases[2]?._reachedOnError ? 1 : 0;
              gameState.bases[2] = false;
              batter.gameStats.batting.rbis++;
              scoreRun(pitcher, unearned);
              atBatDamagePoints += 10; // 失点=10ダメージ
            }
            if (adv.secondToThird) {
              gameState.bases[2] = gameState.bases[1];
              gameState.bases[1] = false;
            }
          }

          // 外野フライでのタッグアップ（犠牲フライ・進塁）
          if (result.isOutfieldFly && gameState.outs < 3) {
            // 3塁走者のタッグアップ（犠牲フライ）
            if (gameState.bases[2]) {
              const throwbackChance = result.tagupThrowbackChance || 0;
              if (Math.random() >= throwbackChance) {
                // 送球間に合わず得点
                const sfUnearned = gameState.bases[2]?._reachedOnError ? 1 : 0;
                gameState.bases[2] = false;
                batter.gameStats.batting.rbis++;
                // 犠牲フライは打数に入れない（上で足した1を戻し、犠飛として数える）
                batter.gameStats.batting.atBats--;
                batter.gameStats.batting.sacrificeFlies = (batter.gameStats.batting.sacrificeFlies || 0) + 1;
                scoreRun(pitcher, sfUnearned);
                atBatDamagePoints += 10; // 失点=10ダメージ
              } else {
                gameState.bases[2] = false;
                gameState.outs++;
                pitcher.gameStats.pitching.outs++;
              }
            }
            // 2塁走者のタッグアップ進塁（深いフライ時）
            if (gameState.bases[1] && !gameState.bases[2] && gameState.outs < 3) {
              const advanceChance = 0.4 - (result.tagupThrowbackChance || 0) * 0.5;
              if (Math.random() < advanceChance) {
                gameState.bases[2] = gameState.bases[1]; // 走者参照を維持
                gameState.bases[1] = false;
              }
            }
          }

          atBatOver = true;
          break;
        }

        case 'double_play':
          // 二塁のピボット(fieldingPosition)＋一塁でのアウトで刺殺2つ
          addFieldingChance(defenseTeam, 'first');
          batter.gameStats.batting.atBats++;
          pitcher.gameStats.pitching.outs += 2;
          gameState.outs += 2;
          gameState.bases[0] = false;
          atBatOver = true;
          break;

        case 'single':
        case 'double':
        case 'triple':
        case 'homerun':
          // 失策による出塁は「ヒット扱い」で単打として処理されるが、自責点上は非自責走者。
          // また失策が無ければアウトだったので、そのイニングの想定アウト数を1つ増やす。
          // 中継ミス（`hitWithError`）は安打のあとの失策なので、打者は安打で出塁している
          const reachedOnError = !!result.isError && !result.hitWithError;
          if (reachedOnError) {
            batter._reachedOnError = true;   // 失策出塁の走者＝この走者の生還は非自責
            gameState.inningErrorOuts++;     // 失策が無ければアウトだった＝想定アウトを1つ加算
          }
          const { bases: newBases, runsScored, unearnedRunsScored, outsMade, assistBy } =
            advanceRunners(result.type, gameState.bases, defense, batter, !!result.extraAdvance,
              result.fieldingPosition || null, gameState.outs);
          batter.gameStats.batting.atBats++;
          // 失策での出塁は「安打」ではない（打数のみ加算し、打点も付かない）。
          // ここを安打扱いにすると失策が増えるほどリーグ打率が上振れする。
          if (!reachedOnError) {
            batter.gameStats.batting.hits++;
            batter.gameStats.batting.rbis += runsScored;
            if (result.type === 'double') batter.gameStats.batting.doubles = (batter.gameStats.batting.doubles || 0) + 1;
            if (result.type === 'triple') batter.gameStats.batting.triples = (batter.gameStats.batting.triples || 0) + 1;
            if (result.type === 'homerun') batter.gameStats.batting.homeruns++;
          }
          // ダメージポイント: 単打=4, 長打(二塁打/三塁打/本塁打)=6, 失点=10×得点数
          atBatDamagePoints += (result.type === 'single') ? 4 : 6;
          atBatDamagePoints += runsScored * 10;

          // 投手の被安打・被本塁打を記録（失策出塁は被安打にしない）
          if (!reachedOnError) {
            pitcher.gameStats.pitching.hits = (pitcher.gameStats.pitching.hits || 0) + 1;
            if (result.type === 'homerun') pitcher.gameStats.pitching.homeruns = (pitcher.gameStats.pitching.homeruns || 0) + 1;
          }

          // エラー記録（守備側の該当野手）
          if (result.isError && result.errorPosition) {
            const errorFielder = defenseTeam.players.find(p => p.position === result.errorPosition && p.battingOrder >= 1 && !p._isDH);
            if (errorFielder) {
              errorFielder.gameStats.fielding.errors++;
              errorFielder.gameStats.fielding.chances++;
            }
          }

          if (gameState.isTopInning) gameState.score.away += runsScored;
          else gameState.score.home += runsScored;

          pitcher.gameStats.pitching.runsAllowed += runsScored;
          // 自責点: 失策で出塁した走者の生還は除外。さらに失策が無ければ既に3アウトだった場合、
          // そのイニングの以降の得点は全て非自責（公式のイニング再構成ルール）。
          creditRuns(pitcher, runsScored, unearnedRunsScored);
          // 捕殺（走者を本塁/塁上で刺した）→ アウトを加算し、送球した野手に記録
          if (outsMade > 0) {
            gameState.outs += outsMade;
            pitcher.gameStats.pitching.outs = (pitcher.gameStats.pitching.outs || 0) + outsMade;
            if (assistBy) {
              const assistFielder = defenseTeam.players.find(p => p.position === assistBy && p.battingOrder >= 1 && !p._isDH);
              if (assistFielder?.gameStats?.fielding) {
                assistFielder.gameStats.fielding.assists = (assistFielder.gameStats.fielding.assists || 0) + 1;
                assistFielder.gameStats.fielding.chances++;
              }
            }
          }
          gameState.bases = newBases;
          atBatOver = true;
          break;
      }
      observeReplay('pitch', {
        pitchResult: result.type,
        result: result.isError && !result.hitWithError ? 'error' : result.type === 'ball' && gameState.count.balls >= 4 ? 'walk'
          : ['called_strike', 'swinging_strike'].includes(result.type) && gameState.count.strikes >= 3 ? 'strikeout' : result.type,
        completed: atBatOver,
        pitch: lastCall(sequence) ? { ...lastCall(sequence) } : null,
      });
    }

    if (observed) {
      const after = batter.gameStats.batting;
      const delta = Object.fromEntries(['atBats','hits','doubles','triples','homeruns','rbis','walks','hitByPitch','strikeouts','sacrificeBunts','sacrificeFlies'].map(key=>[key,(after[key] || 0)-(observed.before[key] || 0)]));
      // 盗塁死や暴投サヨナラ、球数上限の未完了打席は対戦打席へ加えない。
      const completed = delta.atBats + delta.walks + delta.hitByPitch + delta.sacrificeBunts + delta.sacrificeFlies > 0;
      // endBases: 打席の後の塁（オンラインの打席速報が読む）
      observer.plateAppearance({ ...observed, delta, completed, scoreAfter: { ...gameState.score }, endBases: basesMask(gameState.bases), outs: pitcher.gameStats.pitching.outs - (observed.resultStartOuts ?? pitcher.gameStats.pitching.outs),
        runs: (pitcher.gameStats.pitching.runsAllowed || 0) - observed.runsBefore,
        earnedRuns: (pitcher.gameStats.pitching.earnedRuns || 0) - observed.earnedBefore });
    }

    // 先発投手のダメージポイント積算（先発のみに適用）
    const dmgTeamKey = defenseTeam === gameState.homeTeam ? 'home' : 'away';
    const isStarterOnMound = !gameState.reliefTracking[dmgTeamKey].currentRelieverId;
    if (isStarterOnMound && atBatDamagePoints > 0) {
      gameState.starterDamagePoints[dmgTeamKey] += atBatDamagePoints;
    }

    // リリーフ投手の対戦打者数を追跡
    const teamKeyForReliefBatter = defenseTeam === gameState.homeTeam ? 'home' : 'away';
    const reliefTrackBatter = gameState.reliefTracking[teamKeyForReliefBatter];
    if (reliefTrackBatter.currentRelieverId === pitcher.id) {
      reliefTrackBatter.relieverBattersFaced++;
    }

    // カウントリセット & 打順進行
    gameState.count = { balls: 0, strikes: 0 };
    offenseTeam.currentBatterOrder++;
    if (offenseTeam.currentBatterOrder > 9) offenseTeam.currentBatterOrder = 1;
  };

  // イニングシミュレーション
  const simulateInning = () => {
    gameState.outs = 0;
    gameState.bases = [false, false, false];
    // 自責点判定はイニング単位でリセットする。
    // 塁が空になるこのタイミングで、失策出塁フラグも全選手からクリアしておく
    // （次のイニング以降に持ち越さないため）。
    gameState.inningErrorOuts = 0;
    gameState.homeTeam.players.forEach(p => { if (p._reachedOnError) delete p._reachedOnError; });
    gameState.awayTeam.players.forEach(p => { if (p._reachedOnError) delete p._reachedOnError; });

    const inningLabel = `${gameState.inning}回${gameState.isTopInning ? '表' : '裏'}`;
    const offenseTeam = gameState.isTopInning ? gameState.awayTeam.name : gameState.homeTeam.name;
    // 回ごとの得点（紙面の「逆転」「先制」に使う）。⚠ 乱数は引かない（記録するだけ）
    const offenseKey = gameState.isTopInning ? 'away' : 'home';
    const runsBeforeInning = gameState.score[offenseKey];

    // イニング開始時の失点を記録（イニング失点計算用）
    // 守備チーム = 攻撃チームの反対
    const defenseKey = gameState.isTopInning ? 'home' : 'away';
    const defenseTeamForInning = gameState.isTopInning ? gameState.homeTeam : gameState.awayTeam;
    const defPitcher = getCurrentPitcher(defenseTeamForInning);
    if (defPitcher) {
      const defPitcherData = defenseTeamForInning.players.find(p => p.id === defPitcher.id);
      gameState.inningStartRuns[defenseKey] = defPitcherData?.gameStats?.pitching?.runsAllowed || 0;
    }

    let atBats = 0;
    while (gameState.outs < 3 && atBats < 50) {  // 無限ループ防止（打席数制限）
      simulateAtBat();
      atBats++;
      observeDecisions();   // リードが入れ替わったら、その時の両チームの投手を責任投手として記録
      // サヨナラ: 9回以降の裏にホームが勝ち越した時点で試合終了。
      // ⚠ 以前は3アウトまで攻撃が続き、余分な得点が打者・投手の成績と勝敗に混ざっていた
      if (!gameState.isTopInning && gameState.inning >= 9
          && gameState.score.home > gameState.score.away) {
        gameState.walkOff = true;
        break;
      }
    }

    if (atBats >= 50) {
      console.error(`${inningLabel}: 異常な打席数（${atBats}打席）。強制終了します。`);
      // ゲーム状態を正常化: アウトを3にしてベースをクリア
      gameState.outs = 3;
      gameState.bases = [false, false, false];
    }

    gameState.lineScore[offenseKey].push(gameState.score[offenseKey] - runsBeforeInning);
    // イニング終了処理
    if (gameState.isTopInning) {
      gameState.isTopInning = false;
    } else {
      gameState.isTopInning = true;
      gameState.inning++;
    }

    recoverStarterDamage();

    // ⚠ **試合が終わった半イニングの後は、継投も守備固めもしない**。以前はここが
    //    試合終了後にも走り、投げない投手に登板記録と救援疲労（+50）が付き、
    //    守備固めで入った控えは「出場した」扱いで翌日の回復を失っていた。
    //    判定は下の試合ループと同じ `isGameOver`（サヨナラもここで終わりになる）。
    if (isGameOver()) return;

    // 投手スタミナ回復 & AI監督機能（役割ベースの投手交代・登板制限）
    [gameState.homeTeam, gameState.awayTeam].forEach(afterHalfInning);
  };

  // 半イニングを終えた時点で試合が終わったか（`isTopInning` は反転済み）。
  // 半イニングの後の継投・守備固め（`simulateInning`）と下の試合ループが共用する。
  // サヨナラ（`walkOff`）は「9回以降の裏を終えて差がある」に含まれる
  const isGameOver = () => {
    const endedTop = !gameState.isTopInning;  // いま終わったのが表か
    const inn = endedTop ? gameState.inning : gameState.inning - 1;
    if (inn < 9) return false;
    const { home, away } = gameState.score;
    return endedTop ? home > away : (home !== away || inn >= MAX_INNINGS);
  };

  // 試合実行
  // ⚠ 終了判定は**半イニングごと**に行うこと。以前は
  //    `inning <= 9 || (inning > 9 && 同点)` だったので、延長の表に勝ち越した瞬間に
  //    （裏を打たせずに）試合が終わっていた（延長で決着した試合の約6%＝全試合の約6%）。
  //    9回以降: 表の終了時にホームがリード → 裏は不要 / 裏の終了時に差がある → 決着。
  //    延長は規定の上限まで（既定12回。その回の裏を終えて同点なら引き分け）
  // ⚠ 勝ち抜きの大会（`isCupGame`）は規定の上限を使わず、従来どおり12回まで。
  //    規定はリーグ戦のためのもので、上限を9回にすると、裏で回っている
  //    大会の試合まで引き分けが増え、勝者が強さのくじ（`simulateQuickMatch`）で決まっていた
  const MAX_INNINGS = isCupGame ? 12 : normalizeMaxExtraInnings(LEAGUE_SETTINGS.maxExtraInnings);
  for (;;) {
    simulateInning();                         // 終わると isTopInning が反転済み
    if (isGameOver()) break;
  }

  // 試合結果
  const homeScore = gameState.score.home;
  const awayScore = gameState.score.away;
  let result;
  let winner;

  if (homeScore > awayScore) {
    result = `${homeTeamName} ${homeScore}-${awayScore}`;
    winner = homeTeamName;
  } else if (awayScore > homeScore) {
    result = `${awayTeamName} ${awayScore}-${homeScore}`;
    winner = awayTeamName;
  } else {
    result = `引分 ${homeScore}-${awayScore}`;
    winner = null;
  }


  // 試合終了後、選手のシーズン成績と通算成績を更新
  const updatePlayerSeasonStats = (team) => {
    // 先発投手のIDを特定（pitcherAppearancesはリリーフ投手のみ記録されるため、
    // リリーフリストに含まれない＆投球イニングがある投手＝先発投手）
    const teamKey = team === gameState.homeTeam ? 'home' : 'away';
    const reliefIds = new Set(gameState.pitcherAppearances[teamKey].map(a => a.id));

    team.players.forEach(player => {
      if (!player.gameStats) return;

      // TEAMS_DATAの該当選手を取得（参照を更新）
      const teamData = TEAMS_DATA[team.name];
      if (!teamData) return;

      const playerData = teamData.players.find(p => p.id === player.id);
      if (!playerData) return;

      // 中身は writeBackGameStats（采配の試合と共用）
      writeBackGameStats(playerData, teamData, player, {
        batting: player.gameStats.batting || {},
        pitching: player.gameStats.pitching || {},
        fielding: player.gameStats.fielding || null,
        // 先発かどうかはリリーフリストに含まれないかで判定（投球回数ではなく登板種別）
        wasStarter: !reliefIds.has(player.id),
      });
    });
  };

  // ホームチームとアウェイチームの成績を更新
  updatePlayerSeasonStats(gameState.homeTeam);
  updatePlayerSeasonStats(gameState.awayTeam);

  // 勝利・敗戦・セーブ・ホールド（リードの移り変わりから。pitcherDecisions.js）
  const decisions = decisionsFromResult({
    homeScore, awayScore, homeTeam: gameState.homeTeam, awayTeam: gameState.awayTeam,
    decisionLog: gameState.decisionLog,
  });
  if (winner) {
    recordDecisions(decisions, {
      winTeam: winner, loseTeam: winner === homeTeamName ? awayTeamName : homeTeamName,
    }, TEAMS_DATA);
  }

  return {
    homeScore,
    awayScore,
    result,
    winner,
    homeTeam: gameState.homeTeam,
    awayTeam: gameState.awayTeam,
    pitcherChanges: gameState.pitcherChanges,
    decisionLog: gameState.decisionLog,
    decisions,
    lineScore: gameState.lineScore,
    walkOff: !!gameState.walkOff,
    pitcherAppearances: gameState.pitcherAppearances
  };
};

export const autoSimulateGame = (homeTeamName, awayTeamName, isCupGame = false, seed = null, observer = null) =>
  seed === null ? simulateGame(homeTeamName, awayTeamName, isCupGame, observer)
    : withSeededRandom(seed, () => ({ ...simulateGame(homeTeamName, awayTeamName, isCupGame, observer), rngSeed: seed }));

