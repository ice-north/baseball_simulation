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
          if (!snapshot.careerHistory) snapshot.careerHistory = [];
          snapshot.careerHistory.push({ type: 'released', year: currentYear, label: `${teamName}退団` });
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
export function evaluatePlayerScore(player) {
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
 * スカウトおすすめ度をS〜Fで算出
 * 「自チームのランクに対して実力が上回っており、競合が少なく、交渉成功率が高い選手」を高評価
 */
const RANK_BASELINE = { S: 90, A: 75, B: 60, C: 48, D: 35 };
export function getScoutRecommendation(player, teamRank, teamData) {
  const rank = teamRank || 'C';
  const score = evaluatePlayerScore(player);
  const gp = player.growthPotential || 1.0;
  const age = player.age || 22;
  const rivals = estimateRivalCount(player);
  const baseline = RANK_BASELINE[rank] || 55;

  // 自チーム基準との差分
  const aboveTeamBonus = (score - baseline) * 1.2;

  // 競合ペナルティ
  const rivalPenalty = rivals === 0 ? 15 : rivals === 1 ? 0 : rivals === 2 ? -20 : -40;

  // 若さボーナス
  const youthBonus = Math.max(-10, (26 - age) * 2);

  // 成長力ボーナス
  const gpBonus = (gp - 1.0) * 50;

  // 交渉成功率による補正
  const rate = teamData ? calculateRecruitSuccessRate(player, teamData) : 50;
  const ratePenalty = (rate - 50) * 0.5;

  const total = aboveTeamBonus + rivalPenalty + youthBonus + gpBonus + ratePenalty;

  // 交渉成功率が低い場合、スコアに関係なく推薦ランクに上限を設ける
  // 獲れない選手を推薦しても意味がない
  const maxByRate = rate < 5 ? 'D' : rate < 15 ? 'C' : rate < 30 ? 'B' : rate < 50 ? 'A' : 'S';
  const grades = ['F', 'D', 'C', 'B', 'A', 'S'];
  const rawGrade = total >= 35 ? 'S' : total >= 20 ? 'A' : total >= 8 ? 'B' : total >= -5 ? 'C' : total >= -20 ? 'D' : 'F';
  const rawIdx = grades.indexOf(rawGrade);
  const capIdx = grades.indexOf(maxByRate);

  return grades[Math.min(rawIdx, capIdx)];
}

/**
 * 他球団の推定接触数を算出（決定論的、レンダリング安定）
 * 選手のスコアと知名度からライバル数を推定
 */
export function estimateRivalCount(player) {
  const score = evaluatePlayerScore(player);
  const fame = player.fame || 0;
  const interest = score * 0.5 + fame * 0.3;
  // idのハッシュで微小ノイズ（安定的なランダム）
  const hash = (player.id || 0) % 10;
  const adjusted = interest + hash * 0.5;

  if (adjusted >= 65) return 3;
  if (adjusted >= 50) return 2;
  if (adjusted >= 35) return 1;
  return 0;
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
      // 4年生のみスカウト対象（在学3年以上 = 4年目）
      if (yearsIn >= 3) {
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

  // 候補者数: スカウト能力で6〜12人（赤字ペナルティで減少）
  const baseCount = 6;
  const bonusCount = Math.floor(scoutEye / 20);
  const scoutPenalty = teamData.corporateData?.scoutPenalty || 0;
  const candidateCount = Math.max(3, baseCount + bonusCount - scoutPenalty);

  // 注目度が高いほど上位選手にアクセスしやすい
  const reputationMult = getReputationScoutBonus(reputation);

  // 大学プール + リリースプール + 高校生プール を統合
  const uniPool = getUniversityScoutPool(year);
  const relPool = getReleasedScoutPool();
  const hsPool = getHighSchoolScoutPool();
  const allPool = [...uniPool, ...relPool, ...hsPool];

  if (allPool.length === 0) return [];

  // 総合力でスコアリングし、知名度+注目度補正+ランダムノイズでソート
  // 知名度が高い選手 → 誰でも見つけられる
  // 知名度が低い＋能力高い → scoutingEyeが高いスカウトだけが発掘できる
  const scored = allPool.map(entry => {
    const base = evaluatePlayerScore(entry.player);
    const fame = entry.player.fame || 0;
    const noise = (Math.random() - 0.5) * 30;
    const repBonus = (reputationMult - 1.0) * 20;
    // 知名度が低い選手は、スカウト能力が低いと見落とされる
    // fame 0 → discoveryPenalty = -(100-scoutEye)*0.3 = 最大-30（scoutEye=0の時）
    // fame 100 → discoveryPenalty = 0（有名なので誰でも見つかる）
    const discoveryPenalty = -((100 - fame) / 100) * ((100 - scoutEye) * 0.3);
    return { ...entry, score: base + noise + repBonus + discoveryPenalty };
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
    p._poolRef = { source: entry.source, poolIndex: entry.poolIndex, enrollYear: entry.enrollYear, teamName: entry.teamName };
    // 出身表示用
    if (entry.source === 'highschool') {
      p._scoutSource = p.highSchool?.name || '高校3年';
    } else if (entry.source === 'university') {
      p._scoutSource = p.universityTeamName || `大学${entry.yearsInUni + 1}年`;
    } else {
      p._scoutSource = p.origin === 'university' ? (p.universityTeamName ? `${p.universityTeamName}卒` : '大学卒')
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
 * stage: 'primary'=概要のみ, 'secondary'=主要能力, 'full'=全能力
 */
function obscureAbilities(player, accuracy, stage = 'full') {
  const blur = (val, maxVal = 99) => {
    const errorRange = Math.floor((100 - accuracy) / 5);
    const error = Math.floor(Math.random() * (errorRange * 2 + 1)) - errorRange;
    return Math.max(1, Math.min(maxVal, val + error));
  };
  const hidden = '?';

  const isPitcher = player.position === 'pitcher';

  if (stage === 'primary') {
    // 概要: 全能力からランダムに2つだけ見える
    const pitcherKeys = ['velocity', 'control', 'stamina'];
    const hitterKeys = ['meet', 'power', 'eye', 'speed', 'defense'];
    const pool = isPitcher ? pitcherKeys : hitterKeys;
    // ランダムに2つ選出
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const visible = new Set(shuffled.slice(0, 2));

    return {
      batting: {
        meet: visible.has('meet') ? blur(player.batting?.meet || 0) : hidden,
        power: visible.has('power') ? blur(player.batting?.power || 0) : hidden,
        eye: visible.has('eye') ? blur(player.batting?.eye || 0) : hidden,
      },
      physical: {
        speed: visible.has('speed') ? blur(player.physical?.speed || 0) : hidden,
        arm: hidden,
      },
      fielding: {
        defense: visible.has('defense') ? blur(player.fielding?.defense || 0) : hidden,
      },
      pitching: {
        velocity: visible.has('velocity') ? blur(player.pitching?.velocity || 130, 165) : hidden,
        control: visible.has('control') ? blur(player.pitching?.control || 30) : hidden,
        stamina: visible.has('stamina') ? blur(player.pitching?.stamina || 60, 200) : hidden,
      },
    };
  }

  if (stage === 'secondary') {
    // 主要能力: 投手は球速+制球+スタミナ、野手はミート+パワー+走力+守備
    return {
      batting: {
        meet: blur(player.batting?.meet || 0),
        power: blur(player.batting?.power || 0),
        eye: isPitcher ? hidden : blur(player.batting?.eye || 0),
      },
      physical: {
        speed: isPitcher ? hidden : blur(player.physical?.speed || 0),
        arm: hidden,
      },
      fielding: {
        defense: isPitcher ? hidden : blur(player.fielding?.defense || 0),
      },
      pitching: {
        velocity: blur(player.pitching?.velocity || 130, 165),
        control: blur(player.pitching?.control || 30),
        stamina: isPitcher ? blur(player.pitching?.stamina || 60, 200) : hidden,
      },
    };
  }

  // full: 全能力を開示
  return {
    batting: {
      meet: blur(player.batting?.meet || 0),
      power: blur(player.batting?.power || 0),
      eye: blur(player.batting?.eye || 0),
    },
    physical: {
      speed: blur(player.physical?.speed || 0),
      arm: blur(player.physical?.arm || 0),
    },
    fielding: {
      defense: blur(player.fielding?.defense || 0),
    },
    pitching: {
      velocity: blur(player.pitching?.velocity || 130, 165),
      control: blur(player.pitching?.control || 30),
      stamina: blur(player.pitching?.stamina || 60, 200),
    },
  };
}

// ============================================================
// 交渉成功率システム
// 注目度・ランク・交渉力と選手の質で成功率が決まる
// 他球団からのスカウトも来ている場合、ランクの高い方が有利
// ============================================================

const RANK_RECRUIT_BONUS = { S: 0.10, A: 0.05, B: 0, C: -0.05, D: -0.10 };
const RANK_ORDER = ['S', 'A', 'B', 'C', 'D'];
const RANK_WEIGHT = { S: 50, A: 35, B: 20, C: 10, D: 5 };

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

  // 交渉力ボーナス: 0〜25%
  const negotiationBonus = (negotiation / 100) * 0.25;

  // ランク補正
  const rankBonus = RANK_RECRUIT_BONUS[rank] || 0;

  // 調査ボーナス: 1回調査ごとに+7%
  const investigationBonus = ((player._investigationCount || 0) * 0.07);

  // お気に入りボーナス: 週ごとに+3%蓄積
  const favBonus = (getFavoriteBonus(teamData, player.id) / 100);

  const rate = baseRate - qualityPenalty + negotiationBonus + rankBonus + investigationBonus + favBonus;
  return Math.max(1, Math.min(95, Math.round(rate * 100)));
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
  } else if ((ref.source === 'independent' || ref.source === 'corporate_team' || ref.source === 'club_team') && ref.teamName) {
    const srcTeam = TEAMS_DATA[ref.teamName];
    if (srcTeam?.players) {
      const idx = srcTeam.players.findIndex(p => p.id === player.id);
      if (idx >= 0) srcTeam.players.splice(idx, 1);
    }
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
  if (!recruit.careerHistory) recruit.careerHistory = [];
  recruit.careerHistory.push({ type: 'corporate', year: null, label: team.name });
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

// ============================================================
// スカウト派遣システム
// スタッフを選んで派遣先に送り、帰還後に候補をリストアップ
// 発見した選手は段階的に能力が判明する（初回は概要のみ）
// ============================================================

const SCOUT_TARGETS = {
  highschool:   { label: '高校',       days: 14 },
  university:   { label: '大学',       days: 14 },
  independent:  { label: '独立リーグ', days: 10 },
  corporate:    { label: '社会人',     days: 10 },
};

export { SCOUT_TARGETS };

// ============================================================
// スカウト継続タスクシステム
// 各スカウトに「巡回」「自動調査」タスクを割り当て
// キャンセルされるまで自動で繰り返す
// ============================================================

export const MAX_FAVORITES_PER_SCOUT = 3;

/**
 * スカウトに継続タスクを割り当て、初回ミッションを開始する
 * @param {'dispatch'|'investigation'} taskType
 * @param {Object} params - dispatch: { target }, investigation: {}
 */
export function assignScoutTask(teamData, staffId, taskType, params, currentDate, gameYear) {
  const cd = teamData?.corporateData;
  if (!cd) return { success: false, message: '社会人チームではありません' };

  const staff = (cd.staff || []).find(s => s.id === staffId);
  if (!staff) return { success: false, message: 'スタッフが見つかりません' };

  if (!cd.scoutTasks) cd.scoutTasks = {};

  if (cd.scoutTasks[staffId]) {
    cancelScoutTask(teamData, staffId);
  }

  cd.scoutTasks[staffId] = {
    type: taskType,
    target: params?.target || null,
    active: true,
    staffName: staff.name,
    assignedDate: currentDate ? { ...currentDate } : null,
  };

  if (taskType === 'dispatch') {
    const result = dispatchScout(teamData, params.target, staffId, currentDate);
    if (!result.success) {
      delete cd.scoutTasks[staffId];
      return result;
    }
    const targetLabel = SCOUT_TARGETS[params.target]?.label || params.target;
    return { success: true, message: `${staff.name}を${targetLabel}の巡回に配置しました` };
  } else if (taskType === 'investigation') {
    const result = autoStartNextInvestigation(teamData, staffId, currentDate);
    if (result?.success) {
      return { success: true, message: `${staff.name}の自動調査を開始しました` };
    }
    return { success: true, message: `${staff.name}を自動調査に配置しました（調査対象が見つかり次第開始）` };
  }

  return { success: true };
}

/**
 * スカウトの継続タスクをキャンセル（進行中ミッションも中止）
 */
export function cancelScoutTask(teamData, staffId) {
  const cd = teamData?.corporateData;
  if (!cd?.scoutTasks) return;
  delete cd.scoutTasks[staffId];

  if (cd.scoutMissions) {
    cd.scoutMissions.forEach(m => {
      if (m.staffId === staffId && !m.completed) {
        m.completed = true;
        m.cancelled = true;
      }
    });
  }
}

export function getScoutTask(teamData, staffId) {
  return teamData?.corporateData?.scoutTasks?.[staffId] || null;
}

export function getAllScoutTasks(teamData) {
  return teamData?.corporateData?.scoutTasks || {};
}

/**
 * スカウト派遣を開始（スタッフ指定）
 * @param {Object} teamData - TEAMS_DATA[teamName]
 * @param {string} target - 派遣先キー
 * @param {number} staffId - 派遣するスタッフのID
 * @param {{ year, month, day }} currentDate
 */
export function dispatchScout(teamData, target, staffId, currentDate) {
  const cd = teamData?.corporateData;
  if (!cd) return { success: false, message: '社会人チームではありません' };

  const targetDef = SCOUT_TARGETS[target];
  if (!targetDef) return { success: false, message: '無効な派遣先です' };

  const staff = (cd.staff || []).find(s => s.id === staffId);
  if (!staff) return { success: false, message: 'スタッフが見つかりません' };

  if (!cd.scoutMissions) cd.scoutMissions = [];

  // 同じスタッフが既に派遣中なら不可
  if (cd.scoutMissions.find(m => !m.completed && m.staffId === staffId)) {
    return { success: false, message: `${staff.name}は既に派遣中です` };
  }
  // 同じ派遣先に既に派遣中なら不可
  if (cd.scoutMissions.find(m => !m.completed && m.target === target)) {
    return { success: false, message: `${targetDef.label}には既に派遣中です` };
  }

  const returnDate = addDays(currentDate, targetDef.days);
  cd.scoutMissions.push({
    target,
    staffId,
    staffName: staff.name,
    staffScoutEye: staff.abilities?.scoutingEye || 30,
    dispatchDate: { ...currentDate },
    returnDate,
    completed: false,
    results: null,
  });

  return { success: true, message: `${staff.name}を${targetDef.label}に派遣しました（${returnDate.month}/${returnDate.day}帰還予定）` };
}

/**
 * 日付進行時にスカウト派遣の完了をチェック（発掘+調査の両方を処理）
 */
export function checkScoutMissionCompletion(teamData, currentDate, gameYear) {
  const cd = teamData?.corporateData;
  if (!cd?.scoutMissions) return [];

  const completed = [];
  cd.scoutMissions.forEach(mission => {
    if (mission.completed) return;
    if (!isDatePassed(currentDate, mission.returnDate)) return;

    mission.completed = true;

    if (mission.type === 'investigation') {
      const targetId = mission.targetPlayerId;
      for (const m of cd.scoutMissions) {
        if (m.type === 'investigation' || !m.results) continue;
        const found = m.results.find(p => p.id === targetId);
        if (found) {
          const prevAbilities = JSON.parse(JSON.stringify(found.scoutedAbilities || {}));
          investigatePlayer(found);
          found.recruitRate = calculateRecruitSuccessRate(found, teamData);
          // 新たに判明した能力を記録
          const newAbilities = found.scoutedAbilities || {};
          const revealed = [];
          const abilityLabels = { meet: 'ミート', power: 'パワー', eye: '選球眼', speed: '走力', defense: '守備', velocity: '球速', control: '制球', stamina: 'スタミナ' };
          const checkPairs = [
            ['batting', 'meet'], ['batting', 'power'], ['batting', 'eye'],
            ['physical', 'speed'], ['fielding', 'defense'],
            ['pitching', 'velocity'], ['pitching', 'control'], ['pitching', 'stamina'],
          ];
          for (const [cat, key] of checkPairs) {
            const prev = prevAbilities[cat]?.[key];
            const curr = newAbilities[cat]?.[key];
            if ((prev === '?' || prev === undefined) && curr !== '?' && curr !== undefined) {
              revealed.push(abilityLabels[key] || key);
            }
          }
          mission._revealedAbilities = revealed;
          mission._newRevealLevel = found._revealLevel;
          break;
        }
      }
    } else {
      mission.results = generateScoutReport(teamData, mission.target, mission.staffScoutEye, gameYear);
    }
    completed.push(mission);

    // Auto-restart for continuous tasks
    const task = cd.scoutTasks?.[mission.staffId];
    if (task?.active && !mission.cancelled) {
      if (task.type === 'dispatch' && !mission.type) {
        dispatchScoutInternal(teamData, task.target, mission.staffId, currentDate);
      } else if (task.type === 'investigation' && mission.type === 'investigation') {
        autoStartNextInvestigation(teamData, mission.staffId, currentDate);
      }
    }
  });

  return completed;
}

/**
 * 発見済み選手を追加調査して能力を明らかにする
 * revealLevel: 0=概要のみ → 1=主要能力 → 2=全能力
 */
export function investigatePlayer(player) {
  const current = player._revealLevel || 0;
  if (current >= 2) return { success: false, message: 'これ以上調査できません' };

  player._revealLevel = current + 1;
  player._investigationCount = (player._investigationCount || 0) + 1;

  const accuracy = player.scoutAccuracy || 50;
  if (player._revealLevel === 1) {
    player.scoutedAbilities = obscureAbilities(player, Math.min(95, accuracy + 15), 'secondary');
  } else if (player._revealLevel === 2) {
    player.scoutedAbilities = obscureAbilities(player, Math.min(99, accuracy + 30), 'full');
  }

  return { success: true, level: player._revealLevel };
}

const INVESTIGATION_DAYS = 3;

/**
 * スカウトを選手の能力調査に派遣する
 * 調査中のスカウトは発掘に行けない
 */
export function startInvestigation(teamData, playerId, playerName, staffId, currentDate) {
  const cd = teamData?.corporateData;
  if (!cd) return { success: false, message: '社会人チームではありません' };

  const staff = (cd.staff || []).find(s => s.id === staffId);
  if (!staff) return { success: false, message: 'スタッフが見つかりません' };

  if (!cd.scoutMissions) cd.scoutMissions = [];

  if (cd.scoutMissions.find(m => !m.completed && m.staffId === staffId)) {
    return { success: false, message: `${staff.name}は現在別の任務中です` };
  }

  const returnDate = addDays(currentDate, INVESTIGATION_DAYS);
  cd.scoutMissions.push({
    type: 'investigation',
    targetPlayerId: playerId,
    targetPlayerName: playerName,
    staffId,
    staffName: staff.name,
    staffScoutEye: staff.abilities?.scoutingEye || 30,
    dispatchDate: { ...currentDate },
    returnDate,
    completed: false,
  });

  return { success: true, message: `${staff.name}が${playerName}の調査を開始しました（${returnDate.month}/${returnDate.day}完了）` };
}

/**
 * 自動調査フィルタを設定し、条件に合う選手を順次調査する
 * フィルタ: 年齢範囲、ポジション、能力値範囲
 * スカウトが空いていれば自動的に次の対象を調査開始
 */
export function setAutoInvestigationFilter(teamData, filter) {
  const cd = teamData?.corporateData;
  if (!cd) return;
  cd.autoInvestFilter = filter; // { ageMin, ageMax, positions, abilityMin, abilityMax }
}

export function getAutoInvestigationFilter(teamData) {
  return teamData?.corporateData?.autoInvestFilter || null;
}

/**
 * 自動調査を実行
 * 1. 継続調査タスクを持つ待機中スカウトの次ターゲットを開始
 * 2. グローバルフィルタでタスク未割当スカウトも調査開始
 */
export function processAutoInvestigation(teamData, currentDate) {
  const cd = teamData?.corporateData;
  if (!cd) return [];
  if (!cd.scoutMissions) cd.scoutMissions = [];

  const busyIds = new Set(cd.scoutMissions.filter(m => !m.completed).map(m => m.staffId));
  const started = [];

  // 1. 継続調査タスクを持つ待機中スカウト
  if (cd.scoutTasks) {
    for (const [staffIdStr, task] of Object.entries(cd.scoutTasks)) {
      if (task.type !== 'investigation' || !task.active) continue;
      const staffId = parseInt(staffIdStr);
      if (busyIds.has(staffId)) continue;

      const result = autoStartNextInvestigation(teamData, staffId, currentDate);
      if (result?.success) {
        busyIds.add(staffId);
        started.push({ playerName: result._targetName || '?', staffName: task.staffName });
      }
    }
  }

  // 2. グローバルフィルタ（タスク未割当スカウトのみ）
  if (!cd.autoInvestFilter) return started;
  const filter = cd.autoInvestFilter;
  const allPlayers = getAllScoutedPlayers(cd);
  const pendingInvIds = new Set(cd.scoutMissions.filter(m => m.type === 'investigation' && !m.completed).map(m => m.targetPlayerId));
  const availableStaff = (cd.staff || []).filter(s => !busyIds.has(s.id) && !(cd.scoutTasks || {})[s.id]);

  if (availableStaff.length === 0) return started;

  const targets = filterInvestigationTargets(allPlayers, pendingInvIds, filter);

  for (const target of targets) {
    if (availableStaff.length === 0) break;
    const scout = availableStaff.shift();
    const result = startInvestigation(teamData, target.id, target.name, scout.id, currentDate);
    if (result.success) started.push({ playerName: target.name, staffName: scout.name });
  }
  return started;
}

/**
 * 選手をお気に入りに指定（担当スカウト付き、毎週交渉ボーナス蓄積）
 * assignedStaff: { id, name, negotiation } - 担当スカウト情報
 * 解除時はボーナスを保持し、再登録時に引き継ぐ
 */
export function toggleFavoritePlayer(teamData, playerId, assignedStaff) {
  const cd = teamData?.corporateData;
  if (!cd) return { success: false, message: '社会人チームではありません' };
  if (!cd.favoritePlayerIds) cd.favoritePlayerIds = {};
  if (!cd._favoriteHistory) cd._favoriteHistory = {};

  if (cd.favoritePlayerIds[playerId]) {
    cd._favoriteHistory[playerId] = cd.favoritePlayerIds[playerId].bonus || 0;
    delete cd.favoritePlayerIds[playerId];
    return { success: true, action: 'removed' };
  } else {
    if (assignedStaff?.id) {
      const assignmentCount = Object.values(cd.favoritePlayerIds)
        .filter(f => f.staffId === assignedStaff.id).length;
      if (assignmentCount >= MAX_FAVORITES_PER_SCOUT) {
        return { success: false, message: `${assignedStaff.name}は既に${MAX_FAVORITES_PER_SCOUT}人の選手を担当しています` };
      }
    }
    const prevBonus = cd._favoriteHistory[playerId] || 0;
    cd.favoritePlayerIds[playerId] = {
      startDate: null,
      bonus: prevBonus,
      staffId: assignedStaff?.id || null,
      staffName: assignedStaff?.name || null,
      staffNegotiation: assignedStaff?.negotiation || 0,
    };
    return { success: true, action: 'added' };
  }
}

/**
 * お気に入り選手の週次ボーナス加算（日付進行で毎週呼ぶ）
 * 担当スカウトの交渉力が高いほどボーナス蓄積が大きい
 * 基本+3%/週、交渉力50以上で+4%、80以上で+5%
 */
export function advanceFavoriteBonus(teamData, currentDate) {
  const cd = teamData?.corporateData;
  if (!cd?.favoritePlayerIds) return;

  const dayNum = currentDate.year * 10000 + currentDate.month * 100 + currentDate.day;
  for (const [pid, info] of Object.entries(cd.favoritePlayerIds)) {
    if (!info.startDate) {
      info.startDate = dayNum;
      info.lastAdvance = dayNum;
      continue;
    }
    // 担当スカウトが退団していないか確認し、最新の交渉力を反映
    if (info.staffId) {
      const assignedStaff = (cd.staff || []).find(s => s.id === info.staffId);
      if (assignedStaff) {
        info.staffNegotiation = assignedStaff.abilities?.negotiation || 0;
      }
    }
    if (!info.lastAdvance) info.lastAdvance = info.startDate;
    const daysSince = dateDiffDays(info.lastAdvance, dayNum);
    if (daysSince >= 7) {
      const weeks = Math.floor(daysSince / 7);
      const neg = info.staffNegotiation || 0;
      const weeklyRate = neg >= 80 ? 5 : neg >= 50 ? 4 : 3;
      info.bonus = (info.bonus || 0) + weeks * weeklyRate;
      info.lastAdvance = dayNum;
    }
  }
}

function dateDiffDays(d1Num, d2Num) {
  const y1 = Math.floor(d1Num / 10000), m1 = Math.floor((d1Num % 10000) / 100), day1 = d1Num % 100;
  const y2 = Math.floor(d2Num / 10000), m2 = Math.floor((d2Num % 10000) / 100), day2 = d2Num % 100;
  const a = new Date(y1, m1 - 1, day1);
  const b = new Date(y2, m2 - 1, day2);
  return Math.round((b - a) / 86400000);
}

/**
 * お気に入りボーナスを取得（解除中でも蓄積分は残る）
 */
export function getFavoriteBonus(teamData, playerId) {
  const cd = teamData?.corporateData;
  if (cd?.favoritePlayerIds?.[playerId]) {
    return cd.favoritePlayerIds[playerId].bonus || 0;
  }
  return cd?._favoriteHistory?.[playerId] || 0;
}

/**
 * 全スカウトレポートから発見済み選手を統合取得
 */
export function getAllScoutedPlayers(cd) {
  const players = [];
  const seenIds = new Set();
  (cd.scoutMissions || []).forEach(m => {
    if (m.type === 'investigation' || !m.results) return;
    m.results.forEach(p => {
      if (!seenIds.has(p.id)) {
        seenIds.add(p.id);
        players.push(p);
      }
    });
  });
  return players;
}

/**
 * スカウト派遣結果を生成（スタッフ個人の能力で判定）
 * 派遣回数に関わらず安定した候補数を返す。
 * 毎回異なる視点（能力重視/交渉容易/将来性/掘り出し物）でピックする。
 */
function generateScoutReport(teamData, target, staffScoutEye, gameYear) {
  const scoutEye = staffScoutEye || 30;
  const reputation = teamData.corporateData?.reputation || 30;
  const reputationMult = getReputationScoutBonus(reputation);

  let pool = [];
  if (target === 'highschool') {
    pool = getHighSchoolScoutPool();
  } else if (target === 'university') {
    pool = getUniversityScoutPool(gameYear);
  } else if (target === 'independent') {
    pool = getIndependentScoutPool(teamData);
  } else if (target === 'corporate') {
    pool = [...getCorporateScoutPool(teamData), ...getClubScoutPool(teamData)];
  }

  if (pool.length === 0) return [];

  const candidateCount = Math.min(pool.length, 5 + Math.floor(scoutEye / 20)); // 5〜10人

  // 既にスカウト済みのIDを除外
  const existingIds = new Set();
  (teamData.corporateData?.scoutMissions || []).forEach(m => {
    if (m.results) m.results.forEach(p => existingIds.add(p.id));
  });
  const freshPool = pool.filter(e => !existingIds.has(e.player.id));
  const usePool = freshPool.length >= candidateCount ? freshPool : pool;

  // 4つの視点でスコアリングし、各視点から候補を選出
  const strategies = [
    { name: 'ability', weight: 0.35, score: (entry) => {
      const base = evaluatePlayerScore(entry.player);
      const noise = (Math.random() - 0.5) * 15;
      return base + noise + (reputationMult - 1.0) * 15;
    }},
    { name: 'negotiable', weight: 0.25, score: (entry) => {
      const base = evaluatePlayerScore(entry.player);
      const quality = Math.max(0, 80 - base) * 0.5;
      const age = entry.player.age || 22;
      const ageBonus = age <= 22 ? 10 : age >= 28 ? -5 : 0;
      return quality + ageBonus + (Math.random() - 0.5) * 20;
    }},
    { name: 'growth', weight: 0.2, score: (entry) => {
      const gp = entry.player.growthPotential || 1.0;
      const age = entry.player.age || 22;
      const youth = Math.max(0, (25 - age) * 5);
      return gp * 40 + youth + (Math.random() - 0.5) * 20;
    }},
    { name: 'hidden', weight: 0.2, score: (entry) => {
      const base = evaluatePlayerScore(entry.player);
      const fame = entry.player.fame || 0;
      const hiddenGem = (100 - fame) * 0.3 + base * 0.3;
      const eyeBonus = scoutEye * 0.2;
      return hiddenGem + eyeBonus + (Math.random() - 0.5) * 25;
    }},
  ];

  const selectedMap = new Map();
  strategies.forEach(strat => {
    const count = Math.max(1, Math.round(candidateCount * strat.weight));
    const scored = usePool.map(e => ({ ...e, _stratScore: strat.score(e) }));
    scored.sort((a, b) => b._stratScore - a._stratScore);
    for (const entry of scored) {
      if (selectedMap.size >= candidateCount) break;
      if (!selectedMap.has(entry.player.id)) {
        selectedMap.set(entry.player.id, { ...entry, _strategy: strat.name });
        if ([...selectedMap.values()].filter(e => e._strategy === strat.name).length >= count) break;
      }
    }
  });

  // まだ足りなければ能力順で補充
  if (selectedMap.size < candidateCount) {
    const byAbility = usePool.map(e => ({ ...e, _s: evaluatePlayerScore(e.player) + (Math.random() - 0.5) * 20 }));
    byAbility.sort((a, b) => b._s - a._s);
    for (const entry of byAbility) {
      if (selectedMap.size >= candidateCount) break;
      if (!selectedMap.has(entry.player.id)) selectedMap.set(entry.player.id, entry);
    }
  }

  return [...selectedMap.values()].map(entry => {
    const p = JSON.parse(JSON.stringify(entry.player));
    const accuracy = calculateScoutAccuracy(scoutEye);
    p.scoutAccuracy = accuracy;
    const initialStage = scoutEye >= 90 ? 'full' : scoutEye >= 70 ? 'secondary' : 'primary';
    const initialLevel = initialStage === 'full' ? 2 : initialStage === 'secondary' ? 1 : 0;
    p.scoutedAbilities = obscureAbilities(p, accuracy, initialStage);
    p._revealLevel = initialLevel;
    p._poolRef = { source: entry.source, poolIndex: entry.poolIndex, enrollYear: entry.enrollYear, teamName: entry.teamName };
    p._scoutSource = getSourceLabel(entry);
    p._dispatchTarget = target;
    p._strategy = entry._strategy;
    // 交渉成功率を事前計算
    p.recruitRate = calculateRecruitSuccessRate(p, teamData);
    return p;
  });
}

/**
 * 独立リーグの選手プールを取得
 */
function getIndependentScoutPool(excludeTeam) {
  const pool = [];
  const excludeName = Object.keys(TEAMS_DATA)[0];
  Object.entries(TEAMS_DATA).forEach(([teamName, team]) => {
    if (!team?.players || !team.independentLeagueId) return;
    if (teamName === excludeName) return;
    team.players.forEach((p, idx) => {
      pool.push({ player: p, source: 'independent', teamName, poolIndex: idx });
    });
  });
  return pool;
}

/**
 * 社会人チーム（企業チーム）の選手プールを取得
 */
function getCorporateScoutPool(excludeTeam) {
  const pool = [];
  const excludeName = Object.keys(TEAMS_DATA)[0];
  Object.entries(TEAMS_DATA).forEach(([teamName, team]) => {
    if (!team?.players || !team.corporateData) return;
    if (team.corporateData.type === 'club') return;
    if (teamName === excludeName) return;
    team.players.forEach((p, idx) => {
      pool.push({ player: p, source: 'corporate_team', teamName, poolIndex: idx });
    });
  });
  return pool;
}

/**
 * クラブチームの選手プールを取得（社会人視察で発見可能）
 */
function getClubScoutPool(excludeTeam) {
  const pool = [];
  const excludeName = Object.keys(TEAMS_DATA)[0];
  Object.entries(TEAMS_DATA).forEach(([teamName, team]) => {
    if (!team?.players || !team.corporateData) return;
    if (team.corporateData.type !== 'club') return;
    if (teamName === excludeName) return;
    team.players.forEach((p, idx) => {
      pool.push({ player: p, source: 'club_team', teamName, poolIndex: idx });
    });
  });
  return pool;
}

/**
 * スカウトリストの選手に対する他球団の興味を生成
 * 選手の知名度・能力が高いほど、高ランクチームからの関心が多い
 */
export function generateRivalInterest(scoutedPlayers) {
  return scoutedPlayers.map(player => {
    const score = evaluatePlayerScore(player);
    const fame = player.fame || 0;

    // 有力選手ほど多くのチームが関心を寄せる（0〜3チーム）
    const interestScore = score * 0.5 + fame * 0.3;
    let rivalCount;
    if (interestScore >= 60) rivalCount = 2 + (Math.random() < 0.5 ? 1 : 0);
    else if (interestScore >= 40) rivalCount = 1 + (Math.random() < 0.4 ? 1 : 0);
    else if (interestScore >= 25) rivalCount = Math.random() < 0.5 ? 1 : 0;
    else rivalCount = 0;

    const rivals = [];
    for (let i = 0; i < rivalCount; i++) {
      // 有力選手には高ランクチームが来る
      const roll = Math.random() * 100;
      let rank;
      if (interestScore >= 50) {
        rank = roll < 20 ? 'S' : roll < 55 ? 'A' : roll < 80 ? 'B' : roll < 95 ? 'C' : 'D';
      } else if (interestScore >= 30) {
        rank = roll < 5 ? 'S' : roll < 25 ? 'A' : roll < 55 ? 'B' : roll < 85 ? 'C' : 'D';
      } else {
        rank = roll < 10 ? 'B' : roll < 50 ? 'C' : 'D';
      }
      rivals.push({ rank });
    }

    player._rivals = rivals;
    return player;
  });
}

/**
 * 他球団との競合を考慮した交渉
 * ユーザーのランクが高い → 有利、ライバルのランクが高い → 不利
 */
export function negotiateWithCompetition(team, player, teamData) {
  const userRank = teamData?.corporateData?.rank || 'C';
  const rivals = player._rivals || [];

  // まず基本の交渉成功率を算出
  const baseRate = calculateRecruitSuccessRate(player, teamData);

  if (rivals.length === 0) {
    // ライバル不在：基本成功率をそのまま使う
    const roll = Math.random() * 100;
    const success = roll < baseRate;
    if (success) recruitPlayer(team, player);
    return { success, rate: baseRate, rivalResult: null };
  }

  // ライバルがいる場合：重み付き抽選で獲得先を決める
  const userWeight = RANK_WEIGHT[userRank] || 10;
  const staffBonus = getTeamStaffBonus(teamData?.corporateData?.staff || []);
  const negotiationBoost = (staffBonus.negotiation || 0) * 0.2;
  const contenders = [
    { type: 'user', weight: userWeight + negotiationBoost },
    ...rivals.map((r, i) => ({ type: `rival_${i}`, rank: r.rank, weight: RANK_WEIGHT[r.rank] || 10 })),
    { type: 'none', weight: 15 }, // どこにも行かない
  ];

  const totalWeight = contenders.reduce((sum, c) => sum + c.weight, 0);
  let roll = Math.random() * totalWeight;
  let winner = contenders[contenders.length - 1];
  for (const c of contenders) {
    roll -= c.weight;
    if (roll <= 0) { winner = c; break; }
  }

  const success = winner.type === 'user';
  const adjustedRate = Math.round((userWeight + negotiationBoost) / totalWeight * 100);

  if (success) recruitPlayer(team, player);

  return {
    success,
    rate: adjustedRate,
    rivalResult: success ? null : (winner.type === 'none' ? 'declined' : winner.rank),
  };
}

/**
 * スカウトリストから交渉可能な選手を集約
 * 完了済みの全派遣ミッションから候補を統合
 */
export function getScoutedCandidates(teamData) {
  const cd = teamData?.corporateData;
  if (!cd?.scoutMissions) return [];

  const candidates = [];
  const seenIds = new Set();
  cd.scoutMissions.forEach(mission => {
    if (!mission.completed || !mission.results) return;
    mission.results.forEach(p => {
      if (!seenIds.has(p.id)) {
        seenIds.add(p.id);
        candidates.push(p);
      }
    });
  });
  return candidates;
}

function getSourceLabel(entry) {
  if (entry.source === 'highschool') return entry.player?.highSchool?.name || '高校3年';
  if (entry.source === 'university') return entry.player?.universityTeamName || `大学${(entry.yearsInUni || 0) + 1}年`;
  if (entry.source === 'independent') return `独立L(${entry.teamName || ''})`;
  if (entry.source === 'corporate_team') return `社会人(${entry.teamName || ''})`;
  if (entry.source === 'club_team') return `クラブ(${entry.teamName || ''})`;
  return 'フリー';
}

// ============================================================
// 継続タスク内部ヘルパー
// ============================================================

function dispatchScoutInternal(teamData, target, staffId, currentDate) {
  const cd = teamData?.corporateData;
  if (!cd) return;
  const targetDef = SCOUT_TARGETS[target];
  if (!targetDef) return;
  const staff = (cd.staff || []).find(s => s.id === staffId);
  if (!staff) return;
  if (!cd.scoutMissions) cd.scoutMissions = [];

  const returnDate = addDays(currentDate, targetDef.days);
  cd.scoutMissions.push({
    target,
    staffId,
    staffName: staff.name,
    staffScoutEye: staff.abilities?.scoutingEye || 30,
    dispatchDate: { ...currentDate },
    returnDate,
    completed: false,
    results: null,
    isAutoRedispatch: true,
  });
}

function autoStartNextInvestigation(teamData, staffId, currentDate) {
  const cd = teamData?.corporateData;
  if (!cd) return null;

  const filter = cd.autoInvestFilter;
  const allPlayers = getAllScoutedPlayers(cd);
  const pendingInvIds = new Set(
    (cd.scoutMissions || [])
      .filter(m => m.type === 'investigation' && !m.completed)
      .map(m => m.targetPlayerId)
  );

  const targets = filterInvestigationTargets(allPlayers, pendingInvIds, filter);
  if (targets.length === 0) return null;

  const target = targets[0];
  const result = startInvestigation(teamData, target.id, target.name, staffId, currentDate);
  if (result) result._targetName = target.name;
  return result;
}

function filterInvestigationTargets(allPlayers, pendingInvIds, filter) {
  const getVisibleVal = (p, key) => {
    const sa = p.scoutedAbilities || {};
    const map = {
      velocity: sa.pitching?.velocity, control: sa.pitching?.control, stamina: sa.pitching?.stamina,
      meet: sa.batting?.meet, power: sa.batting?.power, eye: sa.batting?.eye,
      speed: sa.physical?.speed, defense: sa.fielding?.defense,
    };
    const v = map[key];
    return (v === '?' || v === undefined) ? null : (typeof v === 'number' ? v : parseInt(v));
  };

  return allPlayers.filter(p => {
    if ((p._revealLevel || 0) >= 2) return false;
    if (pendingInvIds.has(p.id)) return false;
    if (!filter) return true;
    if (filter.ageMin && p.age < filter.ageMin) return false;
    if (filter.ageMax && p.age > filter.ageMax) return false;
    if (filter.positions && filter.positions.length > 0 && !filter.positions.includes(p.position)) return false;
    if (filter.abilities) {
      for (const [key, range] of Object.entries(filter.abilities)) {
        const val = getVisibleVal(p, key);
        if (val === null) continue;
        if (range.min != null && val < range.min) return false;
        if (range.max != null && val > range.max) return false;
      }
    }
    return true;
  });
}

function addDays(date, days) {
  const d = new Date(date.year, date.month - 1, date.day);
  d.setDate(d.getDate() + days);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

function isDatePassed(current, target) {
  const c = current.year * 10000 + current.month * 100 + current.day;
  const t = target.year * 10000 + target.month * 100 + target.day;
  return c >= t;
}
