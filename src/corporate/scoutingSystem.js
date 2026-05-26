// ============================================================
// 社会人野球 入退団システム (scoutingSystem.js)
// 退団: 11月末に引退+戦力外通告
// 入団: スカウトによる選手獲得（トライアウトとは異なる仕組み）
// ============================================================

import { generateRandomPlayerName } from '../data/playerNames.js';
import { TEAMS_DATA, releasedPlayersPool } from '../teams-data.js';
import { checkRetirement } from '../season/yearProgressionSystem.js';
import { getTeamStaffBonus, getScoutAccuracyGain } from './staffData.js';
import { getReputationScoutBonus, getReputationRecruitBonus } from './corporateInit.js';
import { generatePositionFitness, generateRandomArsenal } from '../season/tryoutSystem.js';

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
// ============================================================

/**
 * スカウト候補者を生成
 * 独立リーグのトライアウトとは異なり、スカウトが見つけてくる選手。
 * チームの注目度とスカウト能力で候補の質と数が変わる。
 * @param {Object} teamData - チームデータ（corporateData, staff を持つ）
 * @param {number} year - 年度
 * @returns {Array} スカウト候補者
 */
export function generateScoutCandidates(teamData, year) {
  const staffBonus = getTeamStaffBonus(teamData.staff || []);
  const scoutEye = staffBonus.scoutingEye || 50;
  const reputation = teamData.corporateData?.reputation || 30;

  // 候補者数: スカウト能力で6〜12人
  const baseCount = 6;
  const bonusCount = Math.floor(scoutEye / 20); // 0〜4
  const candidateCount = baseCount + bonusCount;

  // 質: 注目度で基礎能力にボーナス
  const reputationBonus = getReputationRecruitBonus(reputation);
  const scoutBonus = getReputationScoutBonus(reputation);

  const candidates = [];
  const idBase = (year || 1) * 10000 + 5000;

  for (let i = 0; i < candidateCount; i++) {
    const player = generateScoutedPlayer(idBase + i, reputationBonus, year);
    // スカウト精度: 能力の見え方を制御
    player.scoutAccuracy = calculateScoutAccuracy(scoutEye);
    player.scoutedAbilities = obscureAbilities(player, player.scoutAccuracy);
    candidates.push(player);
  }

  return candidates;
}

/**
 * スカウト精度を計算（0〜100）
 * scoutingEye が高いほど正確に能力が見える
 */
function calculateScoutAccuracy(scoutEye) {
  // 基礎精度40 + scoutEye * 0.5 → 最大90
  const base = 40 + Math.floor(scoutEye * 0.5);
  const variance = Math.floor(Math.random() * 15) - 7;
  return Math.max(20, Math.min(95, base + variance));
}

/**
 * 能力値をスカウト精度に応じてぼかす（ユーザーに見せる値）
 * 精度が低いと実際の値から大きくずれる
 */
function obscureAbilities(player, accuracy) {
  const blur = (val, maxVal = 99) => {
    const errorRange = Math.floor((100 - accuracy) / 5); // 0〜16
    const error = Math.floor(Math.random() * (errorRange * 2 + 1)) - errorRange;
    return Math.max(1, Math.min(maxVal, val + error));
  };

  return {
    batting: {
      meet: blur(player.batting.meet),
      power: blur(player.batting.power),
      eye: blur(player.batting.eye)
    },
    physical: {
      speed: blur(player.physical.speed),
      arm: blur(player.physical.arm)
    },
    fielding: {
      defense: blur(player.fielding.defense)
    },
    pitching: {
      velocity: blur(player.pitching.velocity, 165),
      control: blur(player.pitching.control),
      stamina: blur(player.pitching.stamina, 200)
    }
  };
}

/**
 * スカウトされた選手を生成
 * 大学/社会人/元プロなど多様な経歴の選手
 */
function generateScoutedPlayer(id, reputationBonus, year) {
  const name = generateRandomPlayerName();

  // 年齢: 社会人野球は22〜28歳が中心
  const ageWeights = [
    { age: 18, weight: 3 },
    { age: 19, weight: 5 },
    { age: 20, weight: 8 },
    { age: 21, weight: 10 },
    { age: 22, weight: 25 },  // 大���
    { age: 23, weight: 15 },
    { age: 24, weight: 12 },
    { age: 25, weight: 10 },
    { age: 26, weight: 7 },
    { age: 27, weight: 3 },
    { age: 28, weight: 2 },
  ];
  const totalWeight = ageWeights.reduce((sum, w) => sum + w.weight, 0);
  const roll = Math.random() * totalWeight;
  let cumulative = 0;
  let age = 22;
  for (const entry of ageWeights) {
    cumulative += entry.weight;
    if (roll < cumulative) { age = entry.age; break; }
  }

  // 利き手
  const handRoll = Math.random() * 100;
  let throws, bats;
  if (handRoll < 40) { throws = 'right'; bats = 'right'; }
  else if (handRoll < 70) { throws = 'right'; bats = 'left'; }
  else if (handRoll < 92) { throws = 'left'; bats = 'left'; }
  else if (handRoll < 98) { throws = 'right'; bats = 'switch'; }
  else { throws = 'left'; bats = 'right'; }

  // ポジション
  const fieldPositions = ['catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'];
  let isPitcher = Math.random() < 0.45;
  let position;

  if (throws === 'left') {
    const leftPositions = ['pitcher', 'first', 'left', 'center', 'right'];
    position = leftPositions[Math.floor(Math.random() * leftPositions.length)];
    isPitcher = position === 'pitcher';
  } else {
    position = isPitcher ? 'pitcher' : fieldPositions[Math.floor(Math.random() * fieldPositions.length)];
  }

  // 投球フォーム
  const formRand = Math.random() * 100;
  let pitchingForm;
  if (formRand < 45) pitchingForm = 'overhand';
  else if (formRand < 85) pitchingForm = 'threeQuarter';
  else if (formRand < 95) pitchingForm = 'sidearm';
  else pitchingForm = 'submarine';

  const isSideOrUnder = pitchingForm === 'sidearm' || pitchingForm === 'submarine';
  const controlAdjust = isSideOrUnder ? 12 : 0;
  const ageBonus = Math.min(18, Math.max(0, (age - 18) * 2));
  const repBonus = Math.max(0, reputationBonus);

  // 能力生成（社会人レベル: 独立リーグより少し高め）
  const randStat = (min, max) => {
    const base = Math.floor(Math.random() * (max - min + 1)) + min;
    const bonus = Math.floor(ageBonus * 0.3) + Math.floor(repBonus * 0.5);
    return Math.max(1, Math.min(99, base + bonus));
  };

  let abilities;
  if (isPitcher) {
    const arm = randStat(62, 88);
    const velocity = Math.round(95 + Math.pow(arm / 100, 1.2) * 69);
    abilities = {
      meet: randStat(15, 35),
      power: randStat(10, 30),
      eye: randStat(20, 45),
      steal: randStat(10, 30),
      speed: randStat(30, 55),
      arm,
      defense: randStat(35, 60),
      bodyStamina: randStat(45, 75),
      recovery: randStat(45, 75),
      velocity: Math.max(120, Math.min(160, velocity)),
      control: Math.min(85, randStat(38, 68) + controlAdjust),
      stamina: randStat(70, 130)
    };
  } else {
    abilities = {
      meet: randStat(35, 65),
      power: randStat(25, 60),
      eye: randStat(30, 60),
      steal: randStat(20, 55),
      speed: randStat(35, 70),
      arm: randStat(30, 70),
      defense: randStat(35, 70),
      bodyStamina: randStat(40, 75),
      recovery: randStat(40, 70),
      velocity: randStat(120, 140),
      control: randStat(25, 50),
      stamina: randStat(50, 80)
    };
  }

  // 成長力
  const u1 = Math.random() || 0.001;
  const u2 = Math.random();
  const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const skewed = normal > 0 ? normal * 0.7 : normal;
  let growthPotential = 0.90 + skewed * 0.2;
  if (age <= 20) growthPotential += 0.08;
  growthPotential = Math.max(0.5, Math.min(1.45, growthPotential));

  const player = {
    id,
    name,
    age,
    position,
    battingOrder: 0,
    isStarter: false,
    batting: {
      meet: abilities.meet,
      power: abilities.power,
      eye: abilities.eye,
      bats,
      steal: abilities.steal,
      bunt: Math.floor(Math.random() * 30) + 20
    },
    physical: {
      speed: abilities.speed,
      arm: abilities.arm,
      throws,
      bodyStamina: abilities.bodyStamina,
      recovery: abilities.recovery,
      muscle: randStat(35, 70),
      dexterity: randStat(35, 70)
    },
    fielding: {
      defense: abilities.defense
    },
    catching: {
      lead: position === 'catcher' ? Math.floor(Math.random() * 36) + 35 : Math.floor(Math.random() * 26) + 20
    },
    pitching: {
      velocity: abilities.velocity,
      control: abilities.control,
      stamina: abilities.stamina,
      spinRate: Math.floor(Math.random() * 40) + 30,
      form: pitchingForm,
      arsenal: isPitcher ? generateRandomArsenal(0, false) : generateFielderArsenalSimple()
    },
    growthPotential,
    growthModifier: 0,
    positionFitness: generatePositionFitness(position),
    fatigue: 0,
    experience: 0,
    seasonStats: {
      batting: { games: 0, atBats: 0, hits: 0, doubles: 0, triples: 0, homeruns: 0, rbis: 0, walks: 0, strikeouts: 0, stolenBases: 0, sacrificeBunts: 0 },
      pitching: { games: 0, wins: 0, losses: 0, saves: 0, holds: 0, inningsPitched: 0, runsAllowed: 0, earnedRuns: 0, hits: 0, homeruns: 0, walks: 0, strikeouts: 0, pitches: 0 }
    },
    careerStats: {
      batting: { games: 0, atBats: 0, hits: 0, doubles: 0, triples: 0, homeruns: 0, rbis: 0, walks: 0, strikeouts: 0, stolenBases: 0, sacrificeBunts: 0 },
      pitching: { games: 0, wins: 0, losses: 0, saves: 0, holds: 0, inningsPitched: 0, runsAllowed: 0, earnedRuns: 0, hits: 0, homeruns: 0, walks: 0, strikeouts: 0, pitches: 0 }
    },
    origin: 'scout', // スカウト経由入団マーカー
    scoutYear: year
  };

  return player;
}

function generateFielderArsenalSimple() {
  const types = ['slider', 'curve', 'fork', 'changeup', 'sinker', 'cutter'];
  const type = types[Math.floor(Math.random() * types.length)];
  return [
    { id: 1, type: 'straight', level: 100 },
    { id: 2, type, level: Math.floor(Math.random() * 21) + 20 }
  ];
}

/**
 * AIチームのスカウト入団処理
 * 各AIチームが自動で候補者から選手を獲得
 * @param {Object} allTeams - TEAMS_DATA
 * @param {string} userTeamName - ユーザーチーム名
 * @param {number} year - 年度
 * @returns {Object} { teamName: [acquired players] }
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

    for (let i = 0; i < need && i < sortedCandidates.length; i++) {
      const recruit = { ...sortedCandidates[i] };
      delete recruit.scoutAccuracy;
      delete recruit.scoutedAbilities;
      team.players.push(recruit);
      acquired.push(recruit);
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

/**
 * ユーザーがスカウト候補者を獲得
 * @param {Object} team - チームデータ
 * @param {Object} player - 獲得する選手
 */
export function recruitPlayer(team, player) {
  const recruit = { ...player };
  delete recruit.scoutAccuracy;
  delete recruit.scoutedAbilities;
  team.players.push(recruit);
}
