// ============================================================
// 派遣システム（大学野球留学・プロ研修）
// 大学派遣はパイプ（OB繋がり）のある大学を指定して派遣可能
// ============================================================

import { getNestedValue, setNestedValueMut } from './growthUtils.js';
import { getPitchTypeName } from './campTraining.js';
import { getAvailableUniversityDispatches, getRemainingDispatchSlots } from '../university/universityPipeSystem.js';
import { getUniversityTeamById, getSpecialtyLabel, SPECIALTY_LABELS, SPECIALTY_RANK_BOOST, hasUniversitySpecialty } from '../university/universityTeamsData.js';


/** 派遣先の定義 */
export const DISPATCH_DESTINATIONS = {
  university: {
    name: '大学野球留学',
    icon: '🎓',
    desc: 'OBのいる大学へ派遣。大学の得意分野で成長',
    maxAge: 22,         // 22歳以下
    maxOverall: 55,     // 総合力55以下
    growthProfile: 'physical', // デフォルトプロファイル（大学specialtiesで上書き）
  },
  proCamp: {
    name: 'プロ研修',
    icon: '🏟️',
    desc: 'キャンプ期間にプロ球団で特訓。技術系が大きく伸びる',
    maxAge: 24,         // 24歳以下
    maxOverall: 50,     // 総合力50以下
    growthProfile: 'technical', // 技術系メイン
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
    // 大学派遣: 得意項目はランク別ブースト、非得意は80%
    let specialties = [];
    let rankBoost = 1.0;
    if (player.dispatchUniversityId) {
      const uni = getUniversityTeamById(player.dispatchUniversityId);
      if (uni) {
        specialties = uni.specialties || [];
        rankBoost = SPECIALTY_RANK_BOOST[uni.rank] || 1.0;
      }
    }

    // 'pitching' specialtyは球速・制球・スタミナに適用
    const getStatMult = (statKey) => {
      if (specialties.length === 0) return 1.0;
      const specKey = ['velocity', 'control', 'stamina'].includes(statKey) ? 'pitching' : statKey;
      return specialties.includes(specKey) ? rankBoost : 0.8;
    };
    const applyStatGrowth = (statKey, base) => applyGrowthMult(Math.max(1, Math.round(base * getStatMult(statKey))));

    if (player.position === 'pitcher') {
      const velGrowth = applyStatGrowth('velocity', Math.floor(Math.random() * 3) + 1);
      const vBefore = player.pitching.velocity;
      player.pitching.velocity = Math.max(vBefore, Math.min(158, vBefore + velGrowth));
      growthReport.push({ statName: '球速', before: vBefore, after: player.pitching.velocity, growth: player.pitching.velocity - vBefore });

      const ctrlGrowth = applyStatGrowth('control', Math.floor(Math.random() * 4) + 2);
      const cBefore = player.pitching.control;
      player.pitching.control = Math.min(99, cBefore + ctrlGrowth);
      growthReport.push({ statName: '制球', before: cBefore, after: player.pitching.control, growth: player.pitching.control - cBefore });

      const staGrowth = applyStatGrowth('stamina', Math.floor(Math.random() * 8) + 5);
      const staBefore = player.pitching.stamina;
      player.pitching.stamina = Math.min(200, staBefore + staGrowth);
      growthReport.push({ statName: 'スタミナ', before: staBefore, after: player.pitching.stamina, growth: player.pitching.stamina - staBefore });
    } else {
      const stats = [
        { key: 'meet', name: 'ミート', base: () => Math.floor(Math.random() * 4) + 2, get: () => player.batting.meet, set: v => { player.batting.meet = v; }, max: 99 },
        { key: 'power', name: 'パワー', base: () => Math.floor(Math.random() * 5) + 3, get: () => player.batting.power, set: v => { player.batting.power = v; }, max: 99 },
        { key: 'speed', name: '走力', base: () => Math.floor(Math.random() * 4) + 2, get: () => player.physical.speed, set: v => { player.physical.speed = v; }, max: 99 },
        { key: 'defense', name: '守備', base: () => Math.floor(Math.random() * 3) + 2, get: () => player.fielding.defense, set: v => { player.fielding.defense = v; }, max: 99 },
        { key: 'arm', name: '肩力', base: () => Math.floor(Math.random() * 3) + 1, get: () => player.physical.arm, set: v => { player.physical.arm = v; }, max: 99 },
        { key: 'eye', name: '選球眼', base: () => Math.floor(Math.random() * 3) + 2, get: () => player.batting.eye, set: v => { player.batting.eye = v; }, max: 99 },
      ];
      for (const stat of stats) {
        const growth = applyStatGrowth(stat.key, stat.base());
        const before = stat.get() || 30;
        const newVal = Math.min(stat.max, before + growth);
        stat.set(newVal);
        growthReport.push({ statName: stat.name, before, after: newVal, growth: newVal - before });
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

