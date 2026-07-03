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
import { getUniversityPipes } from '../university/universityPipeSystem.js';
import { WORLD_DATA } from './worldData.js';
import { UNIVERSITY_TEAMS } from '../university/universityTeamsData.js';

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
  if (player._rivals) return player._rivals.length;
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
        if (entry.universityTeamName) {
          entry.player.universityTeamName = entry.universityTeamName;
        }
        if (entry.universityTeamId) {
          entry.player.universityTeamId = entry.universityTeamId;
        }
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

  // 候補者数: スカウト眼で4〜12人（赤字ペナルティで減少）
  const baseCount = 4;
  const bonusCount = Math.floor(scoutEye / 12);
  const scoutPenalty = teamData.corporateData?.scoutPenalty || 0;
  const candidateCount = Math.max(3, baseCount + bonusCount - scoutPenalty);

  // 注目度が高いほど上位選手にアクセスしやすい
  const reputationMult = getReputationScoutBonus(reputation);

  // パイプ大学のIDセット（OBの繋がりで情報が入りやすい）
  const pipes = getUniversityPipes(teamData);
  const pipeMap = {};
  for (const p of pipes) pipeMap[p.universityId] = p.pipeStrength;

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
    const discoveryPenalty = -((100 - fame) / 100) * ((100 - scoutEye) * 0.3);
    // パイプボーナス: OBの繋がりで情報が入る（強度1→+10, 2→+15, 3→+20）
    const uniId = entry.player.universityTeamId;
    const pipeBonus = uniId && pipeMap[uniId] ? 5 + pipeMap[uniId] * 5 : 0;
    return { ...entry, score: base + noise + repBonus + discoveryPenalty + pipeBonus, _pipeStrength: pipeMap[uniId] || 0 };
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
    // パイプ強度を候補者に付与（交渉成功率計算で使用）
    p._pipeStrength = entry._pipeStrength || 0;
    // 出身表示用
    if (entry.source === 'highschool') {
      p._scoutSource = p.highSchool?.name ? p.highSchool.name + '高' : '高校';
    } else if (entry.source === 'university') {
      p._scoutSource = p.universityTeamName || '大学';
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

  const discipline = player.personality?.discipline ?? player.professionalism ?? 50;
  const mental = player.personality?.mental ?? 50;

  if (stage === 'primary') {
    // 概要: 全能力からランダムに2つだけ見える
    const pitcherKeys = ['velocity', 'control', 'stamina'];
    const hitterKeys = ['meet', 'power', 'eye', 'speed', 'defense'];
    const pool = isPitcher ? pitcherKeys : hitterKeys;
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
        dexterity: hidden,
        recovery: hidden,
      },
      fielding: {
        defense: visible.has('defense') ? blur(player.fielding?.defense || 0) : hidden,
      },
      pitching: {
        velocity: visible.has('velocity') ? blur(player.pitching?.velocity || 130, 165) : hidden,
        control: visible.has('control') ? blur(player.pitching?.control || 30) : hidden,
        stamina: visible.has('stamina') ? blur(player.pitching?.stamina || 60, 200) : hidden,
      },
      professionalism: hidden,
      mental: hidden,
    };
  }

  if (stage === 'secondary') {
    return {
      batting: {
        meet: blur(player.batting?.meet || 0),
        power: blur(player.batting?.power || 0),
        eye: isPitcher ? hidden : blur(player.batting?.eye || 0),
      },
      physical: {
        speed: isPitcher ? hidden : blur(player.physical?.speed || 0),
        arm: blur(player.physical?.arm || 0),
        dexterity: blur(player.physical?.dexterity || 50),
        recovery: hidden,
      },
      fielding: {
        defense: isPitcher ? hidden : blur(player.fielding?.defense || 0),
      },
      pitching: {
        velocity: blur(player.pitching?.velocity || 130, 165),
        control: blur(player.pitching?.control || 30),
        stamina: isPitcher ? blur(player.pitching?.stamina || 60, 200) : hidden,
      },
      professionalism: blur(discipline),
      mental: blur(mental),
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
      dexterity: blur(player.physical?.dexterity || 50),
      recovery: blur(player.physical?.recovery || 50),
    },
    fielding: {
      defense: blur(player.fielding?.defense || 0),
    },
    pitching: {
      velocity: blur(player.pitching?.velocity || 130, 165),
      control: blur(player.pitching?.control || 30),
      stamina: blur(player.pitching?.stamina || 60, 200),
    },
    professionalism: blur(discipline),
    mental: blur(mental),
  };
}

// ============================================================
// 交渉成功率システム
// 注目度・ランク・交渉力と選手の質で成功率が決まる
// 他球団からのスカウトも来ている場合、ランクの高い方が有利
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

  // 交渉力ボーナス: 0〜25%
  const negotiationBonus = (negotiation / 100) * 0.25;

  // ランク補正
  const rankBonus = RANK_RECRUIT_BONUS[rank] || 0;

  // 調査ボーナス: 1回調査ごとに+7%
  const investigationBonus = ((player._investigationCount || 0) * 0.07);

  // お気に入りボーナス: 週ごとに+3%蓄積
  const favBonus = (getFavoriteBonus(teamData, player.id) / 100);

  // パイプボーナス: OBの繋がりで入団しやすい（強度1→+5%, 2→+8%, 3→+12%）
  const ps = player._pipeStrength || 0;
  const pipeBonus = ps >= 3 ? 0.12 : ps === 2 ? 0.08 : ps === 1 ? 0.05 : 0;

  const rate = baseRate - qualityPenalty + negotiationBonus + rankBonus + investigationBonus + favBonus + pipeBonus;
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
/**
 * AIチームの残りスカウト入団処理
 * ユーザー交渉フェーズでライバルとして入団済みの分を考慮し、
 * まだ定員に達していないチームのみ追加獲得
 */
export function processAIScoutRecruitment(allTeams, userTeamName, year) {
  const results = {};

  Object.entries(allTeams).forEach(([teamName, team]) => {
    if (teamName === userTeamName) return;
    if (!team?.players) return;

    const currentSize = team.players.length;
    if (currentSize >= CORPORATE_TARGET_ROSTER) return;

    const need = Math.min(2, CORPORATE_TARGET_ROSTER - currentSize);
    if (need <= 0) return;

    const candidates = generateScoutCandidates(team, year);
    if (candidates.length === 0) return;
    const acquired = [];

    const posCount = { pitcher: 0, catcher: 0, infield: 0, outfield: 0 };
    team.players.forEach(p => {
      if (p.position === 'pitcher') posCount.pitcher++;
      else if (p.position === 'catcher') posCount.catcher++;
      else if (['first', 'second', 'third', 'short'].includes(p.position)) posCount.infield++;
      else posCount.outfield++;
    });

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

  const candidateCount = Math.min(pool.length, 3 + Math.floor(scoutEye / 14)); // 3〜10人

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
/**
 * AIチームの入札を生成し、各スカウト候補に実際のライバルチーム情報を付与
 * AIチームはポジション不足に応じて候補者を狙う
 */
export function generateRivalInterest(scoutedPlayers) {
  const userTeamName = Object.keys(TEAMS_DATA)[0] || '';
  const playerIdSet = new Set(scoutedPlayers.map(p => p.id));

  // AIチームのポジション需要を分析し、入札を生成
  const bidsPerPlayer = {};
  scoutedPlayers.forEach(p => { bidsPerPlayer[p.id] = []; });

  Object.entries(TEAMS_DATA).forEach(([teamName, team]) => {
    if (teamName === userTeamName) return;
    if (!team?.players || !team.corporateData) return;
    const currentSize = team.players.length;
    if (currentSize >= CORPORATE_TARGET_ROSTER) return;

    const need = Math.min(3, CORPORATE_TARGET_ROSTER - currentSize);
    if (need <= 0) return;

    const rank = team.corporateData?.rank || 'C';
    const reputation = team.corporateData?.reputation || 0;

    // ポジション不足を分析
    const posCount = { pitcher: 0, catcher: 0, infield: 0, outfield: 0 };
    team.players.forEach(p => {
      if (p.position === 'pitcher') posCount.pitcher++;
      else if (p.position === 'catcher') posCount.catcher++;
      else if (['first', 'second', 'third', 'short'].includes(p.position)) posCount.infield++;
      else posCount.outfield++;
    });

    // スカウト候補をポジション需要＋能力でスコアリング
    const scored = scoutedPlayers.map(p => {
      const posNeed = getPositionNeedScore(p.position, posCount);
      if (posNeed <= 0) return null;
      const ability = evaluatePlayerScore(p);
      const interestChance = (posNeed * 2 + ability + reputation * 0.3) / 150;
      if (Math.random() > Math.min(0.8, interestChance)) return null;
      return { player: p, score: posNeed + ability * 0.5 + Math.random() * 20 };
    }).filter(Boolean);

    scored.sort((a, b) => b.score - a.score);
    const bidCount = Math.min(need, scored.length);
    for (let i = 0; i < bidCount; i++) {
      const pid = scored[i].player.id;
      if (bidsPerPlayer[pid]) {
        bidsPerPlayer[pid].push({ teamName, rank, reputation });
      }
    }
  });

  return scoutedPlayers.map(player => {
    player._rivals = bidsPerPlayer[player.id] || [];
    return player;
  });
}

/**
 * 他球団との競合を考慮した交渉
 * player.recruitRate が設定されていれば（スカウトボーナス等含む）それを使う
 * ライバルがいる場合、表示成功率をベースに競合ペナルティを適用
 * 他チームに入団と判定された場合、実際にそのチームに入団させる
 */
export function negotiateWithCompetition(team, player, teamData) {
  const rivals = player._rivals || [];

  // 表示済みの成功率を使う（スカウトボーナス・調査・絆を含む）
  const displayedRate = player.recruitRate ?? calculateRecruitSuccessRate(player, teamData);

  if (rivals.length === 0) {
    // ライバルなし: 行き先がないため交渉が有利（+12%）
    const noRivalBonus = 12;
    const boostedRate = Math.min(95, displayedRate + noRivalBonus);
    const roll = Math.random() * 100;
    const success = roll < boostedRate;
    if (success) recruitPlayer(team, player);
    return { success, rate: boostedRate, rivalResult: null, rivalTeamName: null, noRivalBonus };
  }

  // ライバルがいる場合：表示成功率に競合ペナルティを適用
  // ライバル1社ごとに成功率×0.75（2社で×0.56、3社で×0.42）
  const rivalPenalty = Math.pow(0.75, rivals.length);
  const adjustedRate = Math.max(1, Math.min(95, Math.round(displayedRate * rivalPenalty)));

  const roll = Math.random() * 100;
  const success = roll < adjustedRate;

  if (success) {
    recruitPlayer(team, player);
    return { success, rate: adjustedRate, rivalResult: null, rivalTeamName: null };
  }

  // 失敗時：条件折り合わず(再交渉可) / 他チーム入団 / 辞退
  // ライバルが多いほど他チームに取られやすい
  const rivalTakeChance = Math.min(0.7, rivals.length * 0.2);
  const declineChance = 0.15;

  const fate = Math.random();
  if (fate < rivalTakeChance) {
    // ライバルチームが獲得 → 実際にそのチームに入団させる
    const winnerRival = rivals[Math.floor(Math.random() * rivals.length)];
    const rivalTeam = TEAMS_DATA[winnerRival.teamName];
    if (rivalTeam) {
      recruitPlayerToTeam(rivalTeam, player);
    }
    return { success: false, rate: adjustedRate, rivalResult: winnerRival.rank, rivalTeamName: winnerRival.teamName };
  } else if (fate < rivalTakeChance + declineChance) {
    // 辞退 → ライバルがいればそのチームへ、いなければランダムなチームへ
    const destTeam = pickRandomDestination(player, team);
    return { success: false, rate: adjustedRate, rivalResult: 'declined', rivalTeamName: destTeam };
  }
  // 条件折り合わず → 再交渉可能（candidatesから除去しない）
  return { success: false, rate: adjustedRate, rivalResult: null, rivalTeamName: null };
}

export function pickRandomDestination(player, excludeTeam) {
  const rivals = player._rivals || [];
  if (rivals.length > 0) {
    const pick = rivals[Math.floor(Math.random() * rivals.length)];
    return pick.teamName;
  }
  return null;
}

/**
 * 指定チームに選手を入団させる（ライバルチーム用）
 */
function recruitPlayerToTeam(team, player) {
  removeFromPool(player);
  const recruit = { ...player };
  delete recruit.scoutAccuracy;
  delete recruit.scoutedAbilities;
  delete recruit._poolRef;
  delete recruit._scoutSource;
  delete recruit._rivals;
  delete recruit._investigationCount;
  delete recruit._revealLevel;
  recruit.origin = 'scout';
  recruit.isStarter = false;
  recruit.battingOrder = 0;
  recruit.fatigue = 0;
  if (!recruit.careerHistory) recruit.careerHistory = [];
  recruit.careerHistory.push({ type: 'corporate', year: null, label: team.name });
  team.players.push(recruit);
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
  if (entry.source === 'highschool') return entry.player?.highSchool?.name ? entry.player.highSchool.name + '高' : '高校';
  if (entry.source === 'university') return entry.player?.universityTeamName || '大学';
  if (entry.source === 'independent') return entry.teamName || '独立L';
  if (entry.source === 'corporate_team') return entry.teamName || '社会人';
  if (entry.source === 'club_team') return entry.teamName || 'クラブ';
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

// ============================================================
// 大学モード スカウトシステム
// 4月から高校生をスカウトし、調査・注目で交渉率を上げ、推薦枠で確保
// ============================================================

const UNI_SCOUT_SLOTS = { S: 8, A: 7, B: 5, C: 4, D: 3 };

export function getUniversityScoutSlots(rank) {
  return UNI_SCOUT_SLOTS[rank] || 5;
}

// ランク別初期スカウト候補数: 強豪は広く発掘、弱小は絞り込まれた候補のみ
// 接触数(5人)は全ランク共通 → 弱小ほど候補に占める接触割合が高い
const INITIAL_SCOUT_COUNT = { S: 16, A: 13, B: 11, C: 9, D: 8 };

export function initUniversityScoutList(teamData, rank) {
  if (!highSchoolPool.players || highSchoolPool.players.length === 0) return [];

  const reputation = teamData?.universityData?.reputation || 30;
  const initialCount = INITIAL_SCOUT_COUNT[rank] || 10;

  // 4月初期発見は20%スタート（以前から目をつけていた選手）
  const candidates = discoverCandidatesFromPool(initialCount, rank, reputation, 20);
  return candidates;
}

function discoverCandidatesFromPool(count, rank, reputation, initialGauge = 0) {
  if (!highSchoolPool.players || highSchoolPool.players.length === 0) return [];

  const existingIds = new Set(
    (WORLD_DATA._universityScout?.candidates || []).map(c => c.id)
      .concat((WORLD_DATA._universityScout?.recruited || []).map(c => c.id))
  );

  const available = highSchoolPool.players
    .filter(p => !p._universityReserved && !existingIds.has(p.id));
  if (available.length === 0) return [];

  // ランク別スカウト帯: 大学ランクに応じて高校生プールのどの層が見えるかを決める
  // S大学=上位層(トップ人材)、D大学=中下位層(入部しやすい選手)
  // 帯はオーバーラップあり。「無名の逸材」はどのランクでも帯内で発掘可能
  const BAND_LO = { S: 0.00, A: 0.10, B: 0.22, C: 0.38, D: 0.55 };
  const BAND_HI = { S: 0.40, A: 0.58, B: 0.72, C: 0.84, D: 0.96 };
  const bandLo = BAND_LO[rank] ?? 0.38;
  const bandHi = BAND_HI[rank] ?? 0.84;

  // 全選手を能力順にソートして帯を切り出す
  const byAbility = [...available]
    .map((p, idx) => ({ player: p, poolIndex: highSchoolPool.players.indexOf(p), ability: evaluatePlayerScore(p) }))
    .sort((a, b) => b.ability - a.ability);

  const n = byAbility.length;
  const loIdx = Math.floor(n * bandLo);
  const hiIdx = Math.min(n, Math.floor(n * bandHi));
  const band = byAbility.slice(loIdx, hiIdx);

  // 帯内では知名度・成長力・ランダムで選手を発見
  // 低知名度の逸材(fame低+growthPotential高)は鋭いスカウトが見つけられる
  const reputationMult = 0.8 + (reputation / 100) * 0.4;
  const scored = band.map(({ player: p, poolIndex, ability }) => {
    const fame = p.fame || 0;
    const gp = p.growthPotential || 1.0;
    const noise = (Math.random() - 0.5) * 30;
    const repBonus = (reputationMult - 1.0) * 10;
    // 知名度が高い選手=見つかりやすい、低い選手=埋もれがち
    const fameScore = fame * 0.5;
    // 成長力が高い選手=素材の良さが滲み出て目に留まりやすい
    const gemBonus = (gp - 1.0) * 25;
    return { player: p, poolIndex, score: fameScore + gemBonus + noise + repBonus };
  });
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, count).map(entry => {
    const p = JSON.parse(JSON.stringify(entry.player));
    const accuracy = 40 + Math.floor(reputation * 0.2) + Math.floor(Math.random() * 10);
    p.scoutAccuracy = Math.min(75, accuracy);
    p.scoutedAbilities = obscureAbilities(p, p.scoutAccuracy, 'primary');
    p._poolRef = { source: 'highschool', poolIndex: entry.poolIndex };
    p._scoutSource = p.highSchool?.name ? p.highSchool.name : '高校';
    p._revealLevel = 0;
    p._investigationCount = 0;
    p._watchBonus = 0;
    p._investigating = false;
    p._investigateReturn = null;
    p.recruitRate = calculateUniversityRecruitRate(p, rank, reputation, 0);
    p._approachGauge = initialGauge;
    p._approaching = false;
    p._rivals = generateRivals(p, rank);
    return p;
  });
}

/**
 * 月初に新候補を発見（高校生プールから追加）
 * 月が進むほどスカウト網が広がり、発見数が増える
 */
// ランク別月次追加発掘数（ベース）
const MONTHLY_SCOUT_BASE = { S: 6, A: 5, B: 4, C: 3, D: 2 };

export function discoverNewScoutCandidates(rank, reputation, month) {
  // 4月=初期化済、5月〜10月に毎月追加発見
  if (month < 5 || month > 10) return [];
  const base = MONTHLY_SCOUT_BASE[rank] || 3;
  // 後半ほど少し増える（スカウト網が広がる）
  const phaseBonus = month >= 8 ? 1 : 0;
  const count = base + phaseBonus;

  // 月次追加は10%スタート（途中から注目した選手）
  return discoverCandidatesFromPool(count, rank, reputation, 10);
}

/**
 * セレクション候補を高校生プールから生成
 * スポーツ推薦で取れなかった枠を一般入部試験で埋める
 * 推薦候補より能力は低めの層が中心
 */
export function generateSelectionCandidates(rank, reputation, count = 15) {
  if (!highSchoolPool.players || highSchoolPool.players.length === 0) return [];

  const existingIds = new Set(
    (WORLD_DATA._universityScout?.candidates || []).map(c => c.id)
      .concat((WORLD_DATA._universityScout?.recruited || []).map(c => c.id))
  );

  // セレクション=推薦より一段下の帯から選ぶ（推薦で取れる上位層は除く）
  // ランク別に推薦帯の下半分〜さらに下位層を対象とする
  const SEL_BAND_LO = { S: 0.20, A: 0.32, B: 0.46, C: 0.60, D: 0.72 };
  const SEL_BAND_HI = { S: 0.60, A: 0.76, B: 0.88, C: 0.94, D: 1.00 };
  const selLo = SEL_BAND_LO[rank] ?? 0.60;
  const selHi = SEL_BAND_HI[rank] ?? 0.94;

  const available = highSchoolPool.players.filter(p => !p._universityReserved && !existingIds.has(p.id));
  const byAbility = [...available]
    .map(p => ({ player: p, ability: evaluatePlayerScore(p) }))
    .sort((a, b) => b.ability - a.ability);

  const n = byAbility.length;
  const band = byAbility.slice(Math.floor(n * selLo), Math.min(n, Math.floor(n * selHi)));

  // 投手比率を約32%に調整（投手過多バグ対策）
  const pitcherCount = Math.round(count * 0.32);
  const fielderCount = count - pitcherCount;
  const bandPitchers = band.filter(e => e.player.position === 'pitcher').sort(() => Math.random() - 0.5);
  const bandFielders = band.filter(e => e.player.position !== 'pitcher').sort(() => Math.random() - 0.5);
  const selected = [
    ...bandPitchers.slice(0, pitcherCount),
    ...bandFielders.slice(0, fielderCount),
  ].sort(() => Math.random() - 0.5);

  return selected.slice(0, count).map(entry => {
    const p = JSON.parse(JSON.stringify(entry.player));
    // セレクションでは能力がほぼ見える状態
    p.scoutAccuracy = 80;
    p.scoutedAbilities = obscureAbilities(p, 80, 'full');
    p._selectionCandidate = true;
    return p;
  });
}

function calculateUniversityRecruitRate(player, uniRank, reputation, watchBonus = 0) {
  const baseRate = 0.30 + (reputation / 100) * 0.50;
  const playerScore = evaluatePlayerScore(player);
  const rawPenalty = Math.max(-0.05, Math.min(0.30, (playerScore - 50) / 200));
  const qualityMult = { S: 0.15, A: 0.45, B: 1.0, C: 1.25, D: 1.5 }[uniRank] || 1.0;
  const qualityPenalty = rawPenalty * qualityMult;
  const rankBonus = { S: 0.15, A: 0.08, B: 0, C: -0.06, D: -0.12 }[uniRank] || 0;
  const invBonus = (player._investigationCount || 0) * 0.08;
  const wBonus = (watchBonus || player._watchBonus || 0) / 100;
  const rate = baseRate - qualityPenalty + rankBonus + invBonus + wBonus;
  return Math.max(5, Math.min(95, Math.round(rate * 100)));
}

export function startUniversityInvestigation(candidate, currentDate) {
  if (candidate._investigating) return false;
  if ((candidate._revealLevel || 0) >= 2) return false;
  candidate._investigating = true;
  const d = new Date(currentDate.year, currentDate.month - 1, currentDate.day);
  d.setDate(d.getDate() + 5);
  candidate._investigateReturn = { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
  return true;
}

export function processUniversityScoutDay(candidates, currentDate, uniRank, reputation) {
  if (!candidates) return [];
  const completed = [];
  const cd = currentDate.year * 10000 + currentDate.month * 100 + currentDate.day;

  // 月初（1日）に新候補を発見して追加
  if (currentDate.day === 1 && currentDate.month >= 5 && currentDate.month <= 10) {
    const lastDiscoveryMonth = WORLD_DATA._universityScout?._lastDiscoveryMonth || 4;
    if (currentDate.month > lastDiscoveryMonth) {
      const newCandidates = discoverNewScoutCandidates(uniRank, reputation, currentDate.month);
      if (newCandidates.length > 0) {
        candidates.push(...newCandidates);
        if (WORLD_DATA._universityScout) {
          WORLD_DATA._universityScout._lastDiscoveryMonth = currentDate.month;
          WORLD_DATA._universityScout._newDiscoveries = newCandidates.length;
        }
      }
    }
  }

  for (const c of candidates) {
    if (c._investigating && c._investigateReturn) {
      const rd = c._investigateReturn.year * 10000 + c._investigateReturn.month * 100 + c._investigateReturn.day;
      if (cd >= rd) {
        c._investigating = false;
        c._investigateReturn = null;
        c._investigationCount = (c._investigationCount || 0) + 1;
        c._revealLevel = Math.min(2, (c._revealLevel || 0) + 1);
        const stage = c._revealLevel === 1 ? 'secondary' : 'full';
        const newAccuracy = Math.min(90, (c.scoutAccuracy || 50) + 10);
        c.scoutAccuracy = newAccuracy;
        c.scoutedAbilities = obscureAbilities(c, newAccuracy, stage);
        c.recruitRate = calculateUniversityRecruitRate(c, uniRank, reputation);
        completed.push(c);
      }
    }
  }

  // Weekly watch bonus
  for (const c of candidates) {
    if (c._watching) {
      if (!c._watchStart) {
        c._watchStart = cd;
        c._lastWatchAdvance = cd;
      }
      if (c._lastWatchAdvance) {
        const diff = dateDiffDays(c._lastWatchAdvance, cd);
        if (diff >= 7) {
          const weeks = Math.floor(diff / 7);
          c._watchBonus = (c._watchBonus || 0) + weeks * 4;
          c._lastWatchAdvance = cd;
          c.recruitRate = calculateUniversityRecruitRate(c, uniRank, reputation);
        }
      }
    }
  }

  // ライバル大学のゲージ進行 → 先に100%到達で横取り
  const rivalStolen = advanceRivalGauges(candidates, uniRank);
  if (rivalStolen.length > 0 && WORLD_DATA._universityScout) {
    const wd = WORLD_DATA._universityScout;
    if (!wd._rivalStolen) wd._rivalStolen = [];
    for (const s of rivalStolen) {
      const c = s.candidate;
      const orig = highSchoolPool.players?.find(hp => hp.id === c.id);
      if (orig) orig._universityReserved = s.rivalName;
      // リストから削除せず_reservedByを付与して残す（競合欄に進学先を表示するため）
      c._reservedBy = s.rivalName;
      c._approaching = false;
      wd._rivalStolen.push({ name: c.name, position: c.position, rivalName: s.rivalName, rivalRank: s.rivalRank });
    }
  }

  // 接近ゲージの日次蓄積
  const gaugeCompleted = [];
  for (const c of candidates) {
    if (!c._approaching) continue;
    const rate = calculateDailyGaugeRate(c, uniRank, reputation);
    c._approachGauge = Math.min(100, (c._approachGauge || 0) + rate);
    if (c._approachGauge >= 100) {
      gaugeCompleted.push(c);
    }
  }

  // ゲージMAXの選手を確定待ち状態に（手動確定に変更 → 自動追加しない）
  if (gaugeCompleted.length > 0 && WORLD_DATA._universityScout) {
    const wd = WORLD_DATA._universityScout;
    for (const c of gaugeCompleted) {
      c._gaugeComplete = true;
      c._approaching = false;
    }
    wd._gaugeCompleteCount = (wd._gaugeCompleteCount || 0) + gaugeCompleted.length;
  }

  return completed;
}

export function toggleUniversityWatch(candidate) {
  candidate._watching = !candidate._watching;
  if (!candidate._watching) {
    candidate._watchStart = null;
    candidate._lastWatchAdvance = null;
  }
  return candidate._watching;
}

export function attemptUniversityRecruit(player, uniRank, reputation) {
  const rate = player.recruitRate || calculateUniversityRecruitRate(player, uniRank, reputation);
  const roll = Math.random() * 100;
  return { success: roll < rate, rate };
}

// ============================================================
// 接近ゲージシステム
// 候補に「接近」して毎日ゲージを蓄積、100%で推薦確定
// ============================================================

// 同時接触数は全ランク共通5人。差別化は候補数（S=16人中5、D=8人中5）
const MAX_CONCURRENT_APPROACHES = { S: 5, A: 5, B: 5, C: 5, D: 5 };

export function getMaxApproaches(rank) {
  return MAX_CONCURRENT_APPROACHES[rank] || 3;
}

export function startUniversityApproach(candidate) {
  if (candidate._approaching) return false;
  candidate._approaching = true;
  if (candidate._approachGauge == null) candidate._approachGauge = 0;
  return true;
}

export function stopUniversityApproach(candidate) {
  candidate._approaching = false;
  return true;
}

/**
 * 1日あたりのゲージ蓄積量を計算
 * 選手の質が高いほど遅く、大学ランク・注目度・調査で加速
 */
export function calculateDailyGaugeRate(player, uniRank, reputation) {
  const baseRate = 2.5 + (reputation / 100) * 2.0;
  const rankBonus = { S: 1.5, A: 0.5, B: 0, C: -0.3, D: -0.5 }[uniRank] || 0;
  const playerScore = evaluatePlayerScore(player);
  const qualityPenalty = Math.max(0, (playerScore - 30) * 0.04);
  const invBonus = (player._investigationCount || 0) * 0.5;
  const watchBonus = ((player._watchBonus || 0) / 100) * 2.0;
  const rate = baseRate + rankBonus - qualityPenalty + invBonus + watchBonus;
  return Math.max(0.5, Math.round(rate * 10) / 10);
}

// ============================================================
// ライバル大学競合システム
// 他大学も同じ高校生に接近 → 先にゲージ100%にした方が獲得
// ============================================================

const RANK_REPUTATION_BASE = { S: 85, A: 65, B: 40, C: 20, D: 5 };
const RANK_ORDER = ['S', 'A', 'B', 'C', 'D'];

function generateRivals(player, userRank) {
  const score = evaluatePlayerScore(player);
  const fame = player.fame || 0;

  // 知名度が低い選手は他大学のスカウトに発見されにくい
  // 高校生の知名度は最大30程度なので30を基準にスケール
  // fame=0: 10% / fame=10: 37% / fame=20: 63% / fame=30: 90%
  const discoverChance = Math.min(0.90, 0.10 + (fame / 30) * 0.80);
  if (Math.random() > discoverChance) return [];

  // 知名度で上限人数を制限（無名選手が多数のライバルから注目されるのは不自然）
  const maxByFame = fame < 8 ? 1 : fame < 18 ? 2 : 3;
  const maxByScore = score >= 70 ? 3 : score >= 50 ? 2 : score >= 30 ? 1 : (Math.random() < 0.4 ? 1 : 0);
  const rivalCount = Math.min(maxByScore, maxByFame);
  if (rivalCount === 0) return [];

  const userTeamName = Object.keys(TEAMS_DATA)[0] || '';
  const userTeamId = UNIVERSITY_TEAMS.find(t => t.name === userTeamName)?.id;

  const eligibleRanks = [];
  if (score >= 60) eligibleRanks.push('S', 'A', 'B');
  else if (score >= 40) eligibleRanks.push('A', 'B', 'C');
  else eligibleRanks.push('B', 'C', 'D');

  const pool = UNIVERSITY_TEAMS.filter(t =>
    t.id !== userTeamId && eligibleRanks.includes(t.rank)
  );
  if (pool.length === 0) return [];

  const shuffled = pool.sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, rivalCount);

  return picked.map(t => {
    const rep = RANK_REPUTATION_BASE[t.rank] || 40;
    const fameOffset = Math.floor((100 - (player.fame || 0)) * 0.3); // 知名度100→+0日, 知名度0→+30日
    const startDelay = Math.floor(Math.random() * 30) + 30 + fameOffset;
    // 知名度100: 30-59日(5月〜6月初) / 知名度50: 45-74日(5月中〜6月中) / 知名度0: 60-89日(6月〜7月)
    return {
      universityName: t.name,
      rank: t.rank,
      reputation: rep,
      gauge: 0,
      approaching: false,
      _startDelay: startDelay,
      _daysPassed: 0,
    };
  });
}

function advanceRivalGauges(candidates, userRank) {
  const stolen = [];
  for (const c of candidates) {
    if (!c._rivals || c._rivals.length === 0) continue;
    for (const rival of c._rivals) {
      rival._daysPassed = (rival._daysPassed || 0) + 1;
      if (!rival.approaching && rival._daysPassed >= rival._startDelay) {
        rival.approaching = true;
      }
      if (!rival.approaching) continue;
      const rate = calculateRivalGaugeRate(c, rival.rank, rival.reputation);
      rival.gauge = Math.min(100, rival.gauge + rate);
      if (rival.gauge >= 100) {
        stolen.push({ candidate: c, rivalName: rival.universityName, rivalRank: rival.rank });
        break;
      }
    }
  }
  return stolen;
}

function calculateRivalGaugeRate(player, rivalRank, rivalRep) {
  const baseRate = 2.5 + (rivalRep / 100) * 2.0;
  const rankBonus = { S: 1.5, A: 0.5, B: 0, C: -0.3, D: -0.5 }[rivalRank] || 0;
  const playerScore = evaluatePlayerScore(player);
  const qualityPenalty = Math.max(0, (playerScore - 30) * 0.04);
  const rate = baseRate + rankBonus - qualityPenalty;
  return Math.max(0.5, Math.round(rate * 10) / 10);
}

export function getRivalInfo(candidate) {
  if (!candidate._rivals || candidate._rivals.length === 0) return null;
  const active = candidate._rivals.filter(r => r.approaching);
  if (active.length === 0) return { count: 0, maxGauge: 0, rivals: [] };
  const maxGauge = Math.max(...active.map(r => r.gauge));
  return {
    count: active.length,
    maxGauge,
    rivals: active.map(r => ({ name: r.universityName, rank: r.rank, gauge: Math.floor(r.gauge) })),
  };
}

export function getUniversityScoutRecommendation(player, uniRank) {
  const score = evaluatePlayerScore(player);
  const baseline = { S: 80, A: 65, B: 50, C: 40, D: 30 }[uniRank] || 50;
  const diff = score - baseline;
  if (diff >= 30) return 'S';
  if (diff >= 15) return 'A';
  if (diff >= 0) return 'B';
  if (diff >= -15) return 'C';
  return 'D';
}

/**
 * 選手検索から高校生をスカウト候補リストに追加する
 * 直接検索で見つけているため _revealLevel=2（能力完全開示）
 */
export function addHighSchoolPlayerToScoutList(player, uniRank, reputation) {
  // スカウトシステム未初期化なら空リストで自動初期化（4月前・年度末リセット後に対応）
  if (!WORLD_DATA._universityScout) {
    WORLD_DATA._universityScout = { candidates: [], recruited: [], initialized: false };
  }

  const existingIds = new Set(
    (WORLD_DATA._universityScout.candidates || []).map(c => c.id)
      .concat((WORLD_DATA._universityScout.recruited || []).map(c => c.id))
  );
  if (existingIds.has(player.id)) return { success: false, reason: 'already_exists' };

  const p = JSON.parse(JSON.stringify(player));
  p.scoutAccuracy = 95;
  p.scoutedAbilities = obscureAbilities(p, 95, 'full');
  p._scoutSource = p.highSchool?.name ? p.highSchool.name : '高校（検索）';
  p._revealLevel = 2;
  p._investigationCount = 2;
  p._watchBonus = 0;
  p._investigating = false;
  p._investigateReturn = null;
  p.recruitRate = calculateUniversityRecruitRate(p, uniRank, reputation, 0);
  p._approachGauge = 0;
  p._approaching = false;
  p._rivals = generateRivals(p, uniRank);
  p._addedBySearch = true;

  if (highSchoolPool.players) {
    const idx = highSchoolPool.players.findIndex(hp => hp.id === player.id);
    if (idx !== -1) p._poolRef = { source: 'highschool', poolIndex: idx };
  }

  if (!WORLD_DATA._universityScout.candidates) WORLD_DATA._universityScout.candidates = [];
  WORLD_DATA._universityScout.candidates.push(p);
  return { success: true };
}
