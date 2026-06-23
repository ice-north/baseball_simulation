// ============================================================
// 派遣システム（大学野球留学・プロ研修）
// 大学派遣はパイプ（OB繋がり）のある大学を指定して派遣可能
// ============================================================

import { getNestedValue, setNestedValueMut } from './growthUtils.js';
import { getPitchTypeName } from './campTraining.js';
import { getAvailableUniversityDispatches, getRemainingDispatchSlots } from '../university/universityPipeSystem.js';
import { getUniversityTeamById, getSpecialtyLabel, SPECIALTY_LABELS, SPECIALTY_RANK_BOOST } from '../university/universityTeamsData.js';

const POSITION_NAMES_SHORT = { catcher: '捕', first: '一', second: '二', third: '三', short: '遊', left: '左', center: '中', right: '右' };

/** 派遣先の定義 */
export const DISPATCH_DESTINATIONS = {
  university: {
    name: '大学野球留学',
    icon: '🎓',
    desc: 'OBのいる大学へ派遣。大学の得意分野で成長',
    maxAge: 26,         // 26歳以下
    maxOverall: 60,     // 総合力60以下
    growthProfile: 'physical',
  },
  proCamp: {
    name: 'プロ研修',
    icon: '🏟️',
    desc: 'キャンプ期間にプロ球団で特訓。技術系が大きく伸びる',
    maxAge: 26,         // 26歳以下
    maxOverall: 60,     // 総合力60以下
    growthProfile: 'technical',
  },
};

/**
 * ゲームモードごとの派遣可能先
 * 独立リーグ: プロ研修OK、大学OK（各1枠固定）
 * 社会人: 大学のみ（パイプベース、プロとアマの交わりは禁止）
 * クラブチーム: 派遣なし（高いプロ意識と成長率で自力成長）
 * 大学: 派遣なし（高品質キャンプで成長）
 * @param {string} gameMode
 * @param {boolean} clubMode
 */
export function getAvailableDispatchKeys(gameMode, clubMode) {
  if (gameMode === 'university') return [];
  if (gameMode === 'corporate' && clubMode) return [];
  if (gameMode === 'corporate') return ['university'];
  return ['university', 'proCamp'];
}

/**
 * 選手の総合力を計算（派遣適格判定用）
 * 投手: (velocity-115)*1.5 + control + stamina/3 を3で割った平均
 * 野手: (meet + power + speed + defense) / 4
 */
export function calcPlayerOverall(player) {
  if (player.position === 'pitcher') {
    const vel = ((player.pitching?.velocity || 130) - 115) * 1.5;
    const ctrl = player.pitching?.control || 40;
    const sta = (player.pitching?.stamina || 80) / 3;
    return Math.round((vel + ctrl + sta) / 3);
  } else {
    const meet = player.batting?.meet || 30;
    const power = player.batting?.power || 30;
    const speed = player.physical?.speed || 30;
    const defense = player.fielding?.defense || 30;
    return Math.round((meet + power + speed + defense) / 4);
  }
}

/** 派遣枠の上限 */
export const DISPATCH_LIMITS = {
  perTeamPerDest: 1,  // プロ研修: 各チーム1人
  leagueTotal: 8,     // リーグ全体で合計8人（プロ研修のみ）
};

/**
 * 派遣可能かどうか判定
 * 社会人モード大学派遣: パイプのある大学ごとにOB人数で枠が決まる
 * 独立リーグ大学派遣: 固定1枠（パイプ不要）
 * プロ研修: 各チーム1人（独立リーグのみ）
 * @param {Object} player - 選手データ
 * @param {string} destKey - 派遣先キー ('university' or 'proCamp')
 * @param {Object} options - { teamPlayers, allTeams, teamData, universityId, gameMode }
 * @returns {{ eligible: boolean, reason: string }}
 */
export function checkDispatchEligibility(player, destKey, options = {}) {
  const dest = DISPATCH_DESTINATIONS[destKey];
  if (!dest) return { eligible: false, reason: '不明な派遣先' };

  if (player.dispatchedThisCamp) return { eligible: false, reason: '今キャンプで派遣済み' };
  if ((player.age || 20) > dest.maxAge) return { eligible: false, reason: `${dest.maxAge}歳以下のみ` };

  const overall = calcPlayerOverall(player);
  if (overall > dest.maxOverall) return { eligible: false, reason: `総合力${dest.maxOverall}以下のみ (現在${overall})` };

  if (destKey === 'university') {
    const gameMode = options.gameMode;

    if (gameMode === 'corporate') {
      // 社会人: パイプベース（OBのいる大学に枠数分）
      const teamData = options.teamData;
      if (!teamData) return { eligible: false, reason: 'チームデータなし' };
      const pipes = getAvailableUniversityDispatches(teamData);
      if (pipes.length === 0) return { eligible: false, reason: 'OBのいる大学がありません' };
      if (options.universityId) {
        const remaining = getRemainingDispatchSlots(teamData, options.universityId);
        if (remaining <= 0) {
          const uni = getUniversityTeamById(options.universityId);
          return { eligible: false, reason: `${uni?.name || '大学'}の派遣枠が満員` };
        }
      }
      return { eligible: true, reason: '' };
    }

    // 独立リーグ: 固定1枠
    const teamPlayers = options.teamPlayers || [];
    const uniCount = teamPlayers.filter(p => p.dispatchedThisCamp === 'university').length;
    if (uniCount >= 1) {
      return { eligible: false, reason: '大学野球留学の枠は各チーム1人まで' };
    }
    return { eligible: true, reason: '' };
  }

  // プロ研修: 各チーム1人
  const teamPlayers = options.teamPlayers || [];
  const teamDestCount = teamPlayers.filter(p => p.dispatchedThisCamp === destKey).length;
  if (teamDestCount >= DISPATCH_LIMITS.perTeamPerDest) {
    return { eligible: false, reason: `${dest.name}の枠は各チーム${DISPATCH_LIMITS.perTeamPerDest}人まで` };
  }

  return { eligible: true, reason: '' };
}

/**
 * チームの大学派遣可能先一覧を取得（UI用）
 * @param {Object} teamData - TEAMS_DATA[teamName]
 * @returns {Array<{ universityId, universityName, rank, specialties, slots, remaining, obCount, obPlayers }>}
 */
export function getUniversityDispatchOptions(teamData) {
  const pipes = getAvailableUniversityDispatches(teamData);
  return pipes.map(pipe => ({
    ...pipe,
    remaining: getRemainingDispatchSlots(teamData, pipe.universityId),
    specialtyLabels: pipe.specialties.map(s => getSpecialtyLabel(s)),
  }));
}

/**
 * 選手をキャンプ中に派遣登録する（成長はキャンプ終了時に適用）
 * @param {Object} player - 選手データ（直接変更）
 * @param {string} destKey - 派遣先キー ('university' or 'proCamp')
 * @param {Object} options - { universityId } 大学派遣時に派遣先大学を指定
 */
export function executeDispatchTraining(player, destKey, options = {}) {
  const dest = DISPATCH_DESTINATIONS[destKey];
  if (!dest) return;

  const experience = player.experience || 0;
  const leapChance = 0.25 + Math.min(0.15, experience / 250);
  const minorChance = Math.max(0.05, 0.15 - experience / 300);
  const roll = Math.random();
  let outcome;
  if (roll < leapChance) {
    outcome = 'great_success';
  } else if (roll < 1 - minorChance) {
    outcome = 'success';
  } else {
    outcome = 'minor';
  }

  player.dispatchedThisCamp = destKey;
  player.dispatchOutcome = outcome;

  if (destKey === 'university' && options.universityId) {
    player.dispatchUniversityId = options.universityId;
    const uni = getUniversityTeamById(options.universityId);
    player.dispatchUniversityName = uni?.name || null;
  }
}

/**
 * キャンプ終了時に派遣結果を適用し、成長レポートを返す
 * 大学派遣: 全能力が成長。得意分野はランク別ブースト、非得意は80%
 * プロ研修: 技術系メインで成長
 * @param {Object} player - 派遣済みの選手データ（直接変更）
 * @returns {{ growthReport: Array, outcome: string, universityName: string|null }}
 */
export function resolveDispatchTraining(player) {
  const destKey = player.dispatchedThisCamp;
  const outcome = player.dispatchOutcome || 'success';
  const dest = DISPATCH_DESTINATIONS[destKey];
  if (!dest) return { growthReport: [], outcome, universityName: null };

  const growthReport = [];
  const universityName = player.dispatchUniversityName || null;

  const initialVelocity = player.position === 'pitcher' ? (player.pitching?.velocity || 0) : null;

  const multiplier = outcome === 'great_success' ? 1.5
                   : outcome === 'minor' ? 0.5
                   : 1.0;
  const applyGrowthMult = (base) => Math.floor(base * multiplier);

  if (destKey === 'university') {
    // 大学派遣: 7カテゴリの得意/非得意でブースト
    // technique:技巧, power:パワー, stamina:体力, defense:守備,
    // versatility:適応, athletic:身体, mental:精神
    let specialties = [];
    let rankBoost = 1.0;
    if (player.dispatchUniversityId) {
      const uni = getUniversityTeamById(player.dispatchUniversityId);
      if (uni) {
        specialties = uni.specialties || [];
        rankBoost = SPECIALTY_RANK_BOOST[uni.rank] || 1.0;
      }
    }

    const specMult = (category) => {
      if (specialties.length === 0) return 1.0;
      return specialties.includes(category) ? rankBoost : 0.8;
    };
    const sg = (category, base) => applyGrowthMult(Math.max(1, Math.round(base * specMult(category))));

    if (player.position === 'pitcher') {
      // technique → 制球
      const ctrlGrowth = sg('technique', Math.floor(Math.random() * 4) + 2);
      const cBefore = player.pitching.control;
      player.pitching.control = Math.min(99, cBefore + ctrlGrowth);
      growthReport.push({ statName: '制球', before: cBefore, after: player.pitching.control, growth: player.pitching.control - cBefore });

      // power → 球速
      const velGrowth = sg('power', Math.floor(Math.random() * 3) + 1);
      const vBefore = player.pitching.velocity;
      player.pitching.velocity = Math.max(vBefore, Math.min(158, vBefore + velGrowth));
      growthReport.push({ statName: '球速', before: vBefore, after: player.pitching.velocity, growth: player.pitching.velocity - vBefore });

      // stamina → スタミナ
      const staGrowth = sg('stamina', Math.floor(Math.random() * 8) + 5);
      const staBefore = player.pitching.stamina;
      player.pitching.stamina = Math.min(200, staBefore + staGrowth);
      growthReport.push({ statName: 'スタミナ', before: staBefore, after: player.pitching.stamina, growth: player.pitching.stamina - staBefore });

      // defense → 変化球Lv UP
      const arsenal = player.pitching?.arsenal || [];
      const breakings = arsenal.filter(p => p.type !== 'straight');
      if (breakings.length > 0) {
        for (const pitch of breakings) {
          const pGrowth = sg('defense', Math.floor(Math.random() * 3) + 1);
          const pBefore = pitch.level;
          pitch.level = pBefore + pGrowth;
          growthReport.push({ statName: `${getPitchTypeName(pitch.type)}`, before: pBefore, after: pitch.level, growth: pitch.level - pBefore });
        }
      }

      // versatility → 新球種習得チャンス
      const versMult = specMult('versatility');
      const newPitchChance = versMult >= 1.0 ? 0.25 : 0.10;
      if (Math.random() < newPitchChance) {
        const existing = arsenal.map(p => p.type);
        const ALL_TYPES = ['slider', 'curve', 'fork', 'sinker', 'cutter', 'changeup', 'screwball', 'knuckle', 'palmball', 'shuuto'];
        const candidates = ALL_TYPES.filter(t => !existing.includes(t));
        if (candidates.length > 0) {
          const newType = candidates[Math.floor(Math.random() * candidates.length)];
          const newLevel = Math.floor(Math.random() * 20) + 20;
          arsenal.push({ type: newType, level: newLevel });
          growthReport.push({ statName: `${getPitchTypeName(newType)}(習得!)`, before: 0, after: newLevel, growth: newLevel, isAwakening: true });
        }
      }

      // athletic → 肩力・回復力
      const armGrowth = sg('athletic', Math.floor(Math.random() * 3) + 1);
      const aBefore = player.physical?.arm || 50;
      player.physical = player.physical || {};
      player.physical.arm = Math.min(99, aBefore + armGrowth);
      growthReport.push({ statName: '肩力', before: aBefore, after: player.physical.arm, growth: player.physical.arm - aBefore });

      const recGrowth = sg('athletic', Math.floor(Math.random() * 2) + 1);
      const rBefore = player.physical?.recovery || 50;
      player.physical.recovery = Math.min(99, rBefore + recGrowth);
      growthReport.push({ statName: '回復力', before: rBefore, after: player.physical.recovery, growth: player.physical.recovery - rBefore });

      // mental → 精神・プロ意識
      const menGrowth = sg('mental', Math.floor(Math.random() * 2) + 1);
      const mnBefore = player.mental || 50;
      player.mental = Math.min(99, mnBefore + menGrowth);
      growthReport.push({ statName: '精神力', before: mnBefore, after: player.mental, growth: player.mental - mnBefore });

      const proGrowth = sg('mental', Math.floor(Math.random() * 2) + 1);
      const prBefore = player.professionalism || 50;
      player.professionalism = Math.min(99, prBefore + proGrowth);
      growthReport.push({ statName: 'プロ意識', before: prBefore, after: player.professionalism, growth: player.professionalism - prBefore });
    } else {
      // 野手
      // technique → ミート
      const meetGrowth = sg('technique', Math.floor(Math.random() * 4) + 2);
      const mBefore = player.batting.meet;
      player.batting.meet = Math.min(99, mBefore + meetGrowth);
      growthReport.push({ statName: 'ミート', before: mBefore, after: player.batting.meet, growth: player.batting.meet - mBefore });

      // power → パワー
      const powGrowth = sg('power', Math.floor(Math.random() * 5) + 3);
      const pBefore = player.batting.power;
      player.batting.power = Math.min(99, pBefore + powGrowth);
      growthReport.push({ statName: 'パワー', before: pBefore, after: player.batting.power, growth: player.batting.power - pBefore });

      // stamina → 体力
      const bsGrowth = sg('stamina', Math.floor(Math.random() * 3) + 2);
      const bsBefore = player.physical?.bodyStamina || 50;
      player.physical = player.physical || {};
      player.physical.bodyStamina = Math.min(99, bsBefore + bsGrowth);
      growthReport.push({ statName: '体力', before: bsBefore, after: player.physical.bodyStamina, growth: player.physical.bodyStamina - bsBefore });

      // defense → 守備
      const defGrowth = sg('defense', Math.floor(Math.random() * 3) + 2);
      const dBefore = player.fielding.defense;
      player.fielding.defense = Math.min(99, dBefore + defGrowth);
      growthReport.push({ statName: '守備', before: dBefore, after: player.fielding.defense, growth: player.fielding.defense - dBefore });

      // versatility → サブポジ適性UP
      const versMult = specMult('versatility');
      const subPosChance = versMult >= 1.0 ? 0.40 : 0.15;
      if (Math.random() < subPosChance) {
        const positions = ['catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'];
        const candidates = positions.filter(pos => pos !== player.position);
        const target = candidates[Math.floor(Math.random() * candidates.length)];
        player.positionFitness = player.positionFitness || {};
        const fBefore = player.positionFitness[target] || 0;
        const fGrowth = Math.floor(Math.random() * 10) + 8;
        player.positionFitness[target] = Math.min(100, fBefore + fGrowth);
        growthReport.push({ statName: `適性:${POSITION_NAMES_SHORT[target] || target}`, before: fBefore, after: player.positionFitness[target], growth: player.positionFitness[target] - fBefore, isAwakening: true });
      }

      // athletic → 走力・盗塁
      const spdGrowth = sg('athletic', Math.floor(Math.random() * 4) + 2);
      const sBefore = player.physical.speed;
      player.physical.speed = Math.min(99, sBefore + spdGrowth);
      growthReport.push({ statName: '走力', before: sBefore, after: player.physical.speed, growth: player.physical.speed - sBefore });

      const stlGrowth = sg('athletic', Math.floor(Math.random() * 3) + 1);
      const stlBefore = player.fielding?.steal || 30;
      player.fielding = player.fielding || {};
      player.fielding.steal = Math.min(99, stlBefore + stlGrowth);
      growthReport.push({ statName: '盗塁', before: stlBefore, after: player.fielding.steal, growth: player.fielding.steal - stlBefore });

      // mental → 選球眼・精神・プロ意識
      const eyeGrowth = sg('mental', Math.floor(Math.random() * 3) + 2);
      const eBefore = player.batting.eye;
      player.batting.eye = Math.min(99, eBefore + eyeGrowth);
      growthReport.push({ statName: '選球眼', before: eBefore, after: player.batting.eye, growth: player.batting.eye - eBefore });

      const menGrowth = sg('mental', Math.floor(Math.random() * 2) + 1);
      const mnBefore = player.mental || 50;
      player.mental = Math.min(99, mnBefore + menGrowth);
      growthReport.push({ statName: '精神力', before: mnBefore, after: player.mental, growth: player.mental - mnBefore });

      const proGrowth = sg('mental', Math.floor(Math.random() * 2) + 1);
      const prBefore = player.professionalism || 50;
      player.professionalism = Math.min(99, prBefore + proGrowth);
      growthReport.push({ statName: 'プロ意識', before: prBefore, after: player.professionalism, growth: player.professionalism - prBefore });

      // Cリード（捕手のみ）
      if (player.position === 'catcher') {
        const clGrowth = sg('mental', Math.floor(Math.random() * 2) + 1);
        const clBefore = player.catching?.lead || 30;
        player.catching = player.catching || {};
        player.catching.lead = Math.min(99, clBefore + clGrowth);
        growthReport.push({ statName: 'Cリード', before: clBefore, after: player.catching.lead, growth: player.catching.lead - clBefore });
      }
    }
  } else {
    // プロ研修: 技術系メイン
    if (player.position === 'pitcher') {
      const ctrlGrowth = applyGrowthMult(Math.floor(Math.random() * 6) + 4);
      const before = player.pitching.control;
      player.pitching.control = Math.min(99, before + ctrlGrowth);
      growthReport.push({ statName: '制球', before, after: player.pitching.control, growth: player.pitching.control - before });

      const velGrowth = applyGrowthMult(Math.floor(Math.random() * 2) + 1);
      const vBefore = player.pitching.velocity;
      player.pitching.velocity = Math.max(vBefore, Math.min(155, vBefore + velGrowth));
      growthReport.push({ statName: '球速', before: vBefore, after: player.pitching.velocity, growth: player.pitching.velocity - vBefore });

      const arsenal = player.pitching?.arsenal || [];
      arsenal.filter(p => p.type !== 'straight').forEach(pitch => {
        const pGrowth = applyGrowthMult(Math.floor(Math.random() * 5) + 3);
        const pBefore = pitch.level;
        pitch.level = pBefore + pGrowth;
        growthReport.push({ statName: `${getPitchTypeName(pitch.type)}`, before: pBefore, after: pitch.level, growth: pitch.level - pBefore });
      });

      const staBefore = player.pitching.stamina;
      const staGrowth = applyGrowthMult(Math.floor(Math.random() * 6) + 3);
      player.pitching.stamina = Math.min(200, staBefore + staGrowth);
      growthReport.push({ statName: 'スタミナ', before: staBefore, after: player.pitching.stamina, growth: player.pitching.stamina - staBefore });
    } else {
      const meetGrowth = applyGrowthMult(Math.floor(Math.random() * 6) + 4);
      const mBefore = player.batting.meet;
      player.batting.meet = Math.min(99, mBefore + meetGrowth);
      growthReport.push({ statName: 'ミート', before: mBefore, after: player.batting.meet, growth: player.batting.meet - mBefore });

      const eyeGrowth = applyGrowthMult(Math.floor(Math.random() * 5) + 3);
      const eBefore = player.batting.eye;
      player.batting.eye = Math.min(99, eBefore + eyeGrowth);
      growthReport.push({ statName: '選球眼', before: eBefore, after: player.batting.eye, growth: player.batting.eye - eBefore });

      const defGrowth = applyGrowthMult(Math.floor(Math.random() * 4) + 3);
      const dBefore = player.fielding.defense;
      player.fielding.defense = Math.min(99, dBefore + defGrowth);
      growthReport.push({ statName: '守備', before: dBefore, after: player.fielding.defense, growth: player.fielding.defense - dBefore });

      const powGrowth = applyGrowthMult(Math.floor(Math.random() * 2) + 1);
      const pBefore = player.batting.power;
      player.batting.power = Math.min(99, pBefore + powGrowth);
      growthReport.push({ statName: 'パワー', before: pBefore, after: player.batting.power, growth: player.batting.power - pBefore });
    }
  }

  // 覚醒チャンス
  const awakeChance = outcome === 'great_success' ? 0.3 : outcome === 'minor' ? 0.1 : 0.2;
  if (Math.random() < awakeChance) {
    if (player.position === 'pitcher') {
      const awakeStats = [
        { path: 'pitching.velocity', name: '球速', max: 160 },
        { path: 'pitching.control', name: '制球', max: 99 },
      ];
      const pick = awakeStats[Math.floor(Math.random() * awakeStats.length)];
      const current = getNestedValue(player, pick.path) || 50;
      const baseBonus = pick.path === 'pitching.velocity'
        ? Math.floor(Math.random() * 2) + 1
        : Math.floor(Math.random() * 4) + 3;
      const bonus = applyGrowthMult(baseBonus);
      const newVal = Math.min(pick.max, current + bonus);
      setNestedValueMut(player, pick.path, newVal);
      growthReport.push({ statName: `${pick.name}(覚醒!)`, before: current, after: newVal, growth: newVal - current, isAwakening: true });
    } else {
      const awakeStats = [
        { path: 'batting.meet', name: 'ミート', max: 99 },
        { path: 'batting.power', name: 'パワー', max: 99 },
        { path: 'physical.speed', name: '走力', max: 99 },
      ];
      const pick = awakeStats[Math.floor(Math.random() * awakeStats.length)];
      const current = getNestedValue(player, pick.path) || 30;
      const bonus = applyGrowthMult(Math.floor(Math.random() * 4) + 3);
      const newVal = Math.min(pick.max, current + bonus);
      setNestedValueMut(player, pick.path, newVal);
      growthReport.push({ statName: `${pick.name}(覚醒!)`, before: current, after: newVal, growth: newVal - current, isAwakening: true });
    }
  }

  // 球速総成長量の上限: 最大13km
  const MAX_VELOCITY_GROWTH = 13;
  if (initialVelocity != null && player.pitching && player.pitching.velocity > initialVelocity + MAX_VELOCITY_GROWTH) {
    const cappedVelocity = initialVelocity + MAX_VELOCITY_GROWTH;
    let overflow = player.pitching.velocity - cappedVelocity;
    player.pitching.velocity = cappedVelocity;
    for (let i = growthReport.length - 1; i >= 0 && overflow > 0; i--) {
      if (growthReport[i].statName.includes('球速')) {
        const reduction = Math.min(overflow, growthReport[i].growth);
        growthReport[i].after -= reduction;
        growthReport[i].growth -= reduction;
        overflow -= reduction;
      }
    }
  }

  // 派遣先大学情報のクリーンアップ
  delete player.dispatchUniversityId;
  delete player.dispatchUniversityName;

  return { growthReport, outcome, universityName };
}

