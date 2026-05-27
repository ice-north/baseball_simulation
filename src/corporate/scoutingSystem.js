// ============================================================
// 社会人野球 入退団システム (scoutingSystem.js)
// 退団: 11月末に引退+戦力外通告
// 入団: スカウトによる選手獲得（トライアウトとは異なる仕組み）
// ============================================================

import { TEAMS_DATA, releasedPlayersPool } from '../teams-data.js';
import { checkRetirement } from '../season/yearProgressionSystem.js';
import { getTeamStaffBonus, getNegotiationBonus } from './staffData.js';
import { getReputationScoutBonus, getReputationRecruitBonus } from './corporateInit.js';
import { universityPool, highSchoolPool } from '../season/universityPool.js';

// ============================================================
// 退団システム
// ============================================================

/**
 * 社会人チームの退団処理（11月末）
 * - 自動引退判定
 * - AI自動戦力外
 * @param {Object} allTeams - TEAMS_DATA
 * @param {string} userTeamName - ユーザーチーム名
 * @returns {{ retirements: Array, aiReleases: Object }}
 */
export function processCorporateRetirements(allTeams, userTeamName) {
  const retirements = [];
  const aiReleases = {};

  Object.entries(allTeams).forEach(([teamName, team]) => {
    if (!team?.players) return;

    const retired = [];
    team.players.forEach(player => {
      const result = checkRetirement(player);
      if (result.shouldRetire) {
        retired.push({
          id: player.id,
          name: player.name,
          team: teamName,
          age: player.age,
          position: player.position,
          reason: result.reason,
          hallOfFame: result.hallOfFame,
          careerStats: player.careerStats
        });
      }
    });

    if (retired.length > 0) {
      retirements.push(...retired);
    }

    // AIチームの自動戦力外
    if (teamName !== userTeamName) {
      const releases = getCorporateAIReleases(team.players, retired.map(r => r.id));
      if (releases.length > 0) {
        aiReleases[teamName] = releases;
      }
    }
  });

  return { retirements, aiReleases };
}

const CORPORATE_MIN_ROSTER = 18;
const CORPORATE_TARGET_ROSTER = 24;

/**
 * AIチームの戦力外候補を選出
 */
function getCorporateAIReleases(players, retiredIds) {
  const active = players.filter(p => !retiredIds.includes(p.id));
  if (active.length <= CORPORATE_MIN_ROSTER) return [];

  const maxRelease = Math.max(0, active.length - CORPORATE_MIN_ROSTER);
  const targetRelease = Math.max(0, active.length - CORPORATE_TARGET_ROSTER);
  const releaseCount = Math.min(maxRelease, Math.max(1, targetRelease + 1));

  const scored = active.map(p => {
    let score = 0;
    const age = p.age || 20;
    const isPitcher = p.position === 'pitcher';

    if (age >= 38) score += 50;
    else if (age >= 36) score += 40;
    else if (age >= 34) score += 25;
    else if (age >= 32) score += 15;
    else if (age >= 30) score += 10;

    if (isPitcher) {
      const overall = ((p.pitching?.velocity || 130) - 115) * 2 + (p.pitching?.control || 50) + ((p.pitching?.stamina || 100) / 2);
      if (overall / 3 < 35) score += 30;
      else if (overall / 3 < 45) score += 15;
    } else {
      const overall = ((p.batting?.meet||0) + (p.batting?.power||0) + (p.physical?.speed||0) + (p.physical?.arm||0) + (p.fielding?.defense||0)) / 5;
      if (overall < 35) score += 30;
      else if (overall < 45) score += 15;
    }

    // 出場が少ない選手
    const games = (p.seasonStats?.batting?.games || 0) + (p.seasonStats?.pitching?.games || 0);
    if (games === 0) score += 20;
    else if (games < 5) score += 10;

    return { id: p.id, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, releaseCount).map(s => s.id);
}

/**
 * 退団を確定する（引退+戦力外選手をロスターから除外、プールに追加）
 * @param {Object} allTeams - TEAMS_DATA
 * @param {Array} retiredIds - 引退選手ID配列
 * @param {Object} releases - { teamName: [playerId, ...] } 戦力外選手
 * @param {number} currentYear - 現在の年
 */
export function executeDepartures(allTeams, retiredIds, releases, currentYear) {
  const retiredSet = new Set(retiredIds);

  Object.entries(allTeams).forEach(([teamName, team]) => {
    if (!team?.players) return;
    const releaseIds = new Set(releases[teamName] || []);

    team.players.forEach(p => {
      if (releaseIds.has(p.id) && !retiredSet.has(p.id)) {
        const age = p.age || 20;
        if (age < 35) {
          const snapshot = JSON.parse(JSON.stringify(p));
          snapshot.isStarter = false;
          snapshot.battingOrder = 0;
          snapshot.releasedYear = currentYear;
          snapshot.previousTeam = teamName;
          snapshot.attemptsInPool = 0;
          releasedPlayersPool.push(snapshot);
        }
      }
    });

    const removeIds = new Set([...retiredSet, ...releaseIds].filter(id =>
      team.players.some(p => p.id === id)
    ));
    team.players = team.players.filter(p => !removeIds.has(p.id));
  });
}

// ============================================================
// 入団（スカウト）システム
// スカウトがプール（大学・リリース）から有望選手を発掘し、候補に提示
// ============================================================

/**
 * プールから選手の総合力を算出（スカウト候補のソート用）
 */
function evaluatePlayerScore(player) {
  const isPitcher = player.position === 'pitcher';
  const gp = player.growthPotential || 1.0;

  let score;
  if (isPitcher) {
    const v = player.pitching?.velocity || 130;
    const c = player.pitching?.control || 40;
    const s = player.pitching?.stamina || 60;
    score = (v - 120) * 1.5 + c + s * 0.4;
  } else {
    const m = player.batting?.meet || 0;
    const p = player.batting?.power || 0;
    const spd = player.physical?.speed || 0;
    const def = player.fielding?.defense || 0;
    const arm = player.physical?.arm || 0;
    score = m + p + spd * 0.5 + def * 0.3 + arm * 0.3;
  }
  return score + (gp - 0.9) * 30;
}

/**
 * 大学プールから在学中の有望選手を取得（3-4年生のみ）
 * @param {number} currentYear - 現在の年度
 * @returns {Array} { player, source: 'university', enrollYear, poolIndex }
 */
function getUniversityScoutPool(currentYear) {
  const pool = [];
  Object.entries(universityPool).forEach(([enrollYear, cohort]) => {
    const yr = parseInt(enrollYear);
    cohort.forEach((entry, idx) => {
      const yearsIn = currentYear - yr;
      // 3年生以上（在学2年以上）がスカウト対象
      if (yearsIn >= 2) {
        pool.push({
          player: entry.player,
          source: 'university',
          enrollYear: yr,
          poolIndex: idx,
          yearsInUni: yearsIn
        });
      }
    });
  });
  return pool;
}

/**
 * リリースプールからスカウト対象の選手を取得
 * @returns {Array} { player, source: 'released', poolIndex }
 */
function getReleasedScoutPool() {
  return releasedPlayersPool.map((p, idx) => ({
    player: p,
    source: 'released',
    poolIndex: idx
  }));
}

/**
 * 高校生プールからスカウト対象の選手を取得
 * 4月に生成された高校3年生が対象
 * @returns {Array} { player, source: 'highschool', poolIndex }
 */
function getHighSchoolScoutPool() {
  if (!highSchoolPool.players || highSchoolPool.players.length === 0) return [];
  return highSchoolPool.players.map((p, idx) => ({
    player: p,
    source: 'highschool',
    poolIndex: idx
  }));
}

/**
 * スカウト候補者をプールから発掘
 * scoutingEye で発見数と精度が変わる。reputation で有望な選手が見つかりやすくなる。
 * @param {Object} teamData - チームデータ
 * @param {number} year - 年度
 * @returns {Array} スカウト候補者（scoutAccuracy, scoutedAbilities, _poolRef 付き）
 */
export function generateScoutCandidates(teamData, year) {
  const staffBonus = getTeamStaffBonus(teamData.staff || []);
  const scoutEye = staffBonus.scoutingEye || 50;
  const reputation = teamData.corporateData?.reputation || 30;

  // 候補者数: スカウト能力で6〜12人
  const baseCount = 6;
  const bonusCount = Math.floor(scoutEye / 20);
  const candidateCount = baseCount + bonusCount;

  // 注目度が高いほど上位選手にアクセスしやすい
  const reputationMult = getReputationScoutBonus(reputation);

  // 大学プール + リリースプール + 高校生プール を統合
  const uniPool = getUniversityScoutPool(year);
  const relPool = getReleasedScoutPool();
  const hsPool = getHighSchoolScoutPool();
  const allPool = [...uniPool, ...relPool, ...hsPool];

  if (allPool.length === 0) return [];

  // 総合力でスコアリングし、注目度補正+ランダムノイズでソート
  const scored = allPool.map(entry => {
    const base = evaluatePlayerScore(entry.player);
    const noise = (Math.random() - 0.5) * 30;
    const repBonus = (reputationMult - 1.0) * 20;
    return { ...entry, score: base + noise + repBonus };
  });
  scored.sort((a, b) => b.score - a.score);

  // 上位からcandidateCount人を選出
  const selected = scored.slice(0, candidateCount);

  return selected.map(entry => {
    const p = JSON.parse(JSON.stringify(entry.player));
    const accuracy = calculateScoutAccuracy(scoutEye);
    p.scoutAccuracy = accuracy;
    p.scoutedAbilities = obscureAbilities(p, accuracy);
    // プールからの除去用の参照情報
    p._poolRef = { source: entry.source, poolIndex: entry.poolIndex, enrollYear: entry.enrollYear };
    // 出身表示用
    if (entry.source === 'highschool') {
      p._scoutSource = '高校3年';
    } else if (entry.source === 'university') {
      p._scoutSource = `大学${entry.yearsInUni + 1}年`;
    } else {
      p._scoutSource = p.origin === 'university' ? '大学卒'
        : p.origin === 'corporate_candidate' ? '社会人候補'
        : p.origin === 'independent_candidate' ? '独立L候補'
        : p.previousTeam ? `元${p.previousTeam}` : 'フリー';
    }
    // 交渉成功率を事前計算
    p.recruitRate = calculateRecruitSuccessRate(p, teamData);
    return p;
  });
}

/**
 * スカウト精度を計算（0〜100）
 */
function calculateScoutAccuracy(scoutEye) {
  const base = 40 + Math.floor(scoutEye * 0.5);
  const variance = Math.floor(Math.random() * 15) - 7;
  return Math.max(20, Math.min(95, base + variance));
}

/**
 * 能力値をスカウト精度に応じてぼかす
 */
function obscureAbilities(player, accuracy) {
  const blur = (val, maxVal = 99) => {
    const errorRange = Math.floor((100 - accuracy) / 5);
    const error = Math.floor(Math.random() * (errorRange * 2 + 1)) - errorRange;
    return Math.max(1, Math.min(maxVal, val + error));
  };

  return {
    batting: {
      meet: blur(player.batting?.meet || 0),
      power: blur(player.batting?.power || 0),
      eye: blur(player.batting?.eye || 0)
    },
    physical: {
      speed: blur(player.physical?.speed || 0),
      arm: blur(player.physical?.arm || 0)
    },
    fielding: {
      defense: blur(player.fielding?.defense || 0)
    },
    pitching: {
      velocity: blur(player.pitching?.velocity || 130, 165),
      control: blur(player.pitching?.control || 30),
      stamina: blur(player.pitching?.stamina || 60, 200)
    }
  };
}

// ============================================================
// 交渉成功率システム
// 注目度・ランク・交渉力と選手の質で成功率が決まる
// ============================================================

const RANK_RECRUIT_BONUS = { S: 0.10, A: 0.05, B: 0, C: -0.05, D: -0.10 };

/**
 * 選手獲得の成功率を計算（0〜100）
 * @param {Object} player - スカウト候補者
 * @param {Object} teamData - チームデータ（corporateData を持つ）
 * @returns {number} 成功率（0-100）
 */
export function calculateRecruitSuccessRate(player, teamData) {
  const cd = teamData?.corporateData;
  const reputation = cd?.reputation || 0;
  const rank = cd?.rank || 'C';
  const staffBonus = getTeamStaffBonus(cd?.staff || []);
  const negotiation = staffBonus.negotiation || 0;

  // ベース: 注目度 0→30%, 50→60%, 100→90%
  const baseRate = 0.30 + (reputation / 100) * 0.60;

  // 選手の質ペナルティ: 総合力が高いほど交渉が難しい
  const playerScore = evaluatePlayerScore(player);
  // スコア30(弱)→+10%, 60(平均)→0%, 90(有力)→-15%, 120(超有力)→-30%
  const qualityPenalty = Math.max(-0.10, Math.min(0.30, (playerScore - 60) / 200));

  // 交渉力ボーナス: 0〜15%
  const negotiationBonus = (negotiation / 100) * 0.15;

  // ランク補正
  const rankBonus = RANK_RECRUIT_BONUS[rank] || 0;

  const rate = baseRate - qualityPenalty + negotiationBonus + rankBonus;
  return Math.max(5, Math.min(95, Math.round(rate * 100)));
}

/**
 * 交渉を試みて成否を判定
 * @param {Object} team - チームオブジェクト
 * @param {Object} player - スカウト候補者
 * @param {Object} teamData - チームデータ（corporateData付き）
 * @returns {{ success: boolean, rate: number }}
 */
export function attemptRecruitment(team, player, teamData) {
  const rate = calculateRecruitSuccessRate(player, teamData);
  const roll = Math.random() * 100;
  const success = roll < rate;

  if (success) {
    recruitPlayer(team, player);
  }

  return { success, rate };
}

/**
 * 獲得した選手をプールから除去
 * @param {Object} player - _poolRef を持つスカウト候補者
 */
function removeFromPool(player) {
  const ref = player._poolRef;
  if (!ref) return;

  if (ref.source === 'highschool') {
    const idx = highSchoolPool.players.findIndex(p => p.id === player.id);
    if (idx >= 0) highSchoolPool.players.splice(idx, 1);
  } else if (ref.source === 'university') {
    const cohort = universityPool[ref.enrollYear];
    if (cohort) {
      const idx = cohort.findIndex(e => e.player.id === player.id);
      if (idx >= 0) cohort.splice(idx, 1);
      if (cohort.length === 0) delete universityPool[ref.enrollYear];
    }
  } else if (ref.source === 'released') {
    const idx = releasedPlayersPool.findIndex(p => p.id === player.id);
    if (idx >= 0) releasedPlayersPool.splice(idx, 1);
  }
}

/**
 * ユーザーがスカウト候補者を獲得
 * プールから除去し、チームに追加
 */
export function recruitPlayer(team, player) {
  removeFromPool(player);
  const recruit = { ...player };
  delete recruit.scoutAccuracy;
  delete recruit.scoutedAbilities;
  delete recruit._poolRef;
  delete recruit._scoutSource;
  recruit.origin = 'scout';
  recruit.isStarter = false;
  recruit.battingOrder = 0;
  recruit.fatigue = 0;
  team.players.push(recruit);
}

/**
 * AIチームのスカウト入団処理
 * 各AIチームが自チームの候補から選手を獲得
 */
export function processAIScoutRecruitment(allTeams, userTeamName, year) {
  const results = {};

  Object.entries(allTeams).forEach(([teamName, team]) => {
    if (teamName === userTeamName) return;
    if (!team?.players) return;

    const currentSize = team.players.length;
    if (currentSize >= CORPORATE_TARGET_ROSTER) return;

    const need = Math.min(3, CORPORATE_TARGET_ROSTER - currentSize);
    if (need <= 0) return;

    const candidates = generateScoutCandidates(team, year);
    if (candidates.length === 0) return;
    const acquired = [];

    // ポジション不足を分析
    const posCount = { pitcher: 0, catcher: 0, infield: 0, outfield: 0 };
    team.players.forEach(p => {
      if (p.position === 'pitcher') posCount.pitcher++;
      else if (p.position === 'catcher') posCount.catcher++;
      else if (['first', 'second', 'third', 'short'].includes(p.position)) posCount.infield++;
      else posCount.outfield++;
    });

    // 必要ポジションの選手を優先獲得
    const sortedCandidates = [...candidates].sort((a, b) => {
      const scoreA = getPositionNeedScore(a.position, posCount);
      const scoreB = getPositionNeedScore(b.position, posCount);
      return scoreB - scoreA;
    });

    for (let i = 0; i < sortedCandidates.length && acquired.length < need; i++) {
      const { success } = attemptRecruitment(team, sortedCandidates[i], team);
      if (success) {
        acquired.push({ name: sortedCandidates[i].name, position: sortedCandidates[i].position });
      }
    }

    if (acquired.length > 0) {
      results[teamName] = acquired;
    }
  });

  return results;
}

function getPositionNeedScore(position, posCount) {
  if (position === 'pitcher' && posCount.pitcher < 8) return 30;
  if (position === 'catcher' && posCount.catcher < 2) return 40;
  if (['first', 'second', 'third', 'short'].includes(position) && posCount.infield < 5) return 20;
  if (['left', 'center', 'right'].includes(position) && posCount.outfield < 4) return 20;
  return 0;
}
