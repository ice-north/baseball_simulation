// ============================================================
// 社会人野球 スタッフデータ（コーチ・マネージャー・トレーナー）
// ============================================================

import { getRandomSurname, getRandomGivenName } from '../data/playerNames.js';

// スタッフ能力項目（10項目）
export const STAFF_ABILITIES = {
  battingCoach:    { name: '打撃指導', category: 'coaching' },
  fieldRunCoach:   { name: '守備走塁指導', category: 'coaching' },
  pitchingCoach:   { name: '投手指導', category: 'coaching' },
  batteryCoach:    { name: 'バッテリー指導', category: 'coaching' },
  motivation:      { name: 'モチベーション管理', category: 'management' },
  scoutingEye:     { name: 'スカウト眼', category: 'scouting' },
  fitness:         { name: 'フィットネス', category: 'medical' },
  bodyCare:        { name: '身体ケア', category: 'medical' },
  managing:        { name: 'マネージング', category: 'management' },
  negotiation:     { name: '交渉', category: 'management' },
};

export const STAFF_ABILITY_KEYS = Object.keys(STAFF_ABILITIES);

// スタッフの役職別・得意になりやすい能力プール
export const STAFF_ROLE_PROFILES = {
  coach: {
    name: 'コーチ',
    strongPool: ['battingCoach', 'fieldRunCoach', 'pitchingCoach', 'batteryCoach', 'motivation', 'fitness'],
    weakPool: ['managing', 'negotiation'],
  },
  manager: {
    name: 'マネージャー',
    strongPool: ['motivation', 'scoutingEye', 'managing', 'negotiation', 'bodyCare'],
    weakPool: ['battingCoach', 'pitchingCoach'],
  },
  trainer: {
    name: 'トレーナー',
    strongPool: ['fitness', 'bodyCare', 'motivation', 'fieldRunCoach', 'scoutingEye'],
    weakPool: ['battingCoach', 'pitchingCoach', 'managing'],
  },
};

// スタッフの専門タイプ（生成時にランダム付与、得意分野を極端に尖らせる）
const STAFF_SPECIALTIES = {
  batting_expert:    { label: '打撃特化', primary: ['battingCoach'], secondary: ['motivation'], weak: ['pitchingCoach', 'scoutingEye', 'negotiation'] },
  pitching_expert:   { label: '投手特化', primary: ['pitchingCoach'], secondary: ['batteryCoach'], weak: ['battingCoach', 'scoutingEye', 'negotiation'] },
  defense_expert:    { label: '守備走塁特化', primary: ['fieldRunCoach'], secondary: ['fitness'], weak: ['battingCoach', 'pitchingCoach', 'negotiation'] },
  battery_expert:    { label: 'バッテリー特化', primary: ['batteryCoach'], secondary: ['pitchingCoach'], weak: ['battingCoach', 'fieldRunCoach', 'negotiation'] },
  scout_expert:      { label: 'スカウト特化', primary: ['scoutingEye'], secondary: ['negotiation'], weak: ['battingCoach', 'pitchingCoach', 'fitness'] },
  negotiation_expert:{ label: '交渉特化', primary: ['negotiation'], secondary: ['managing'], weak: ['battingCoach', 'pitchingCoach', 'fitness'] },
  conditioning:      { label: 'コンディション特化', primary: ['fitness', 'bodyCare'], secondary: ['motivation'], weak: ['battingCoach', 'pitchingCoach', 'negotiation'] },
  motivator:         { label: 'モチベーター', primary: ['motivation'], secondary: ['managing'], weak: ['pitchingCoach', 'scoutingEye', 'fitness'] },
  strategist:        { label: '戦略家', primary: ['managing'], secondary: ['motivation', 'scoutingEye'], weak: ['fitness', 'bodyCare'] },
  allrounder:        { label: '万能型', primary: [], secondary: [], weak: [] },
};

// ランク別の専門タイプ出現確率
// D/C: 尖った専門家が多い  B: バランス  A: やや万能  S: 万能型が中心
const SPECIALTY_WEIGHTS = {
  S: { allrounder: 50, batting_expert: 5, pitching_expert: 5, defense_expert: 5, battery_expert: 5, scout_expert: 5, negotiation_expert: 5, conditioning: 5, motivator: 5, strategist: 10 },
  A: { allrounder: 25, batting_expert: 8, pitching_expert: 8, defense_expert: 8, battery_expert: 5, scout_expert: 10, negotiation_expert: 10, conditioning: 8, motivator: 8, strategist: 10 },
  B: { allrounder: 10, batting_expert: 12, pitching_expert: 12, defense_expert: 10, battery_expert: 8, scout_expert: 12, negotiation_expert: 10, conditioning: 10, motivator: 8, strategist: 8 },
  C: { allrounder: 5, batting_expert: 15, pitching_expert: 15, defense_expert: 12, battery_expert: 8, scout_expert: 12, negotiation_expert: 10, conditioning: 10, motivator: 8, strategist: 5 },
  D: { allrounder: 3, batting_expert: 15, pitching_expert: 15, defense_expert: 12, battery_expert: 10, scout_expert: 12, negotiation_expert: 10, conditioning: 12, motivator: 8, strategist: 3 },
};

const pickSpecialty = (grade) => {
  const weights = SPECIALTY_WEIGHTS[grade] || SPECIALTY_WEIGHTS.C;
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (const [key, w] of Object.entries(weights)) {
    roll -= w;
    if (roll <= 0) return key;
  }
  return 'allrounder';
};

// スタッフのグレード（能力の基準値）
export const STAFF_GRADES = {
  S: { label: 'S級', baseMin: 70, baseMax: 95 },
  A: { label: 'A級', baseMin: 55, baseMax: 80 },
  B: { label: 'B級', baseMin: 40, baseMax: 65 },
  C: { label: 'C級', baseMin: 25, baseMax: 50 },
  D: { label: 'D級', baseMin: 10, baseMax: 35 },
};

// チームランク → 雇用できるスタッフの最大グレード
export const STAFF_GRADE_CAP = { S: 'S', A: 'S', B: 'A', C: 'B', D: 'C' };
const GRADE_ORDER = ['D', 'C', 'B', 'A', 'S'];

export const canHireGrade = (teamRank, staffGrade) => {
  const cap = STAFF_GRADE_CAP[teamRank] || 'C';
  return GRADE_ORDER.indexOf(staffGrade) <= GRADE_ORDER.indexOf(cap);
};

export const MAX_STAFF = 10;

// 給与計算: スタッフは年齢ベース、選手は年功+能力ベース
const BASE_SALARY = 400;
const SALARY_PER_AGE = 20;

export const getStaffSalary = (staff) =>
  BASE_SALARY + ((staff.age || 35) - 18) * SALARY_PER_AGE;

const getPlayerOverall = (player) => {
  if (player.position === 'pitcher') {
    const v = player.pitching?.velocity || 0;
    const c = player.pitching?.control || 0;
    const s = player.pitching?.stamina || 0;
    return Math.round((v - 100) * 1.5 + c * 0.8 + s * 0.3);
  }
  const m = player.batting?.meet || 0;
  const p = player.batting?.power || 0;
  const e = player.batting?.eye || 0;
  const sp = player.physical?.speed || 0;
  const d = player.fielding?.defense || 0;
  return Math.round(m + p + e * 0.5 + sp * 0.3 + d * 0.3);
};

export const getPlayerSalary = (player) => {
  const age = player.age || 18;
  const seniority = Math.min(15, Math.max(0, age - 18));
  const overall = Math.max(0, getPlayerOverall(player));
  return BASE_SALARY + seniority * 8 + overall * 2;
};

// ============================================================
// スタッフ生成
// ============================================================

let nextStaffId = 5000;

export const generateStaff = (role, grade = null, maxGrade = null) => {
  const id = nextStaffId++;
  const profile = STAFF_ROLE_PROFILES[role];
  if (!profile) return null;

  if (!grade) {
    const roll = Math.random();
    if (roll < 0.05) grade = 'S';
    else if (roll < 0.20) grade = 'A';
    else if (roll < 0.50) grade = 'B';
    else if (roll < 0.80) grade = 'C';
    else grade = 'D';
  }

  // グレードキャップ適用
  if (maxGrade) {
    const capIdx = GRADE_ORDER.indexOf(maxGrade);
    const gradeIdx = GRADE_ORDER.indexOf(grade);
    if (gradeIdx > capIdx) {
      grade = maxGrade;
    }
  }

  const g = STAFF_GRADES[grade];
  const abilities = {};

  // 専門タイプを決定
  const specialtyKey = pickSpecialty(grade);
  const specialty = STAFF_SPECIALTIES[specialtyKey];

  // 個人の強み: 専門タイプの primary + 役職 strongPool から選出
  const combinedStrong = [...new Set([...(specialty.primary || []), ...profile.strongPool])];
  const strongCount = specialtyKey === 'allrounder'
    ? Math.min(combinedStrong.length, 5 + Math.floor(Math.random() * 3))
    : 2 + (Math.random() < 0.5 ? 1 : 0);
  const shuffledStrong = [...combinedStrong].sort(() => Math.random() - 0.5);
  const personalStrengths = new Set(shuffledStrong.slice(0, strongCount));
  // 専門の primary は必ず含める
  if (specialty.primary) specialty.primary.forEach(k => personalStrengths.add(k));
  if (specialty.secondary) specialty.secondary.forEach(k => { if (Math.random() < 0.6) personalStrengths.add(k); });

  // 弱み: 専門タイプの weak + 役職 weakPool
  const combinedWeak = [...new Set([...(specialty.weak || []), ...profile.weakPool])];
  const weakCount = specialtyKey === 'allrounder' ? 0 : (Math.random() < 0.7 ? 2 : 1);
  const shuffledWeak = combinedWeak.filter(k => !personalStrengths.has(k)).sort(() => Math.random() - 0.5);
  const personalWeaknesses = new Set(shuffledWeak.slice(0, weakCount));

  for (const key of STAFF_ABILITY_KEYS) {
    let base = g.baseMin + Math.floor(Math.random() * (g.baseMax - g.baseMin + 1));

    if (personalStrengths.has(key)) {
      if (specialty.primary?.includes(key)) {
        // 専門の主力: +20〜35（極端に尖る）
        base += 20 + Math.floor(Math.random() * 16);
      } else {
        base += 15 + Math.floor(Math.random() * 16);
      }
    } else if (personalWeaknesses.has(key)) {
      base -= 15 + Math.floor(Math.random() * 11);
    }

    // S級万能型: 全能力の下限を引き上げ
    if (grade === 'S' && specialtyKey === 'allrounder') {
      base = Math.max(base, 65 + Math.floor(Math.random() * 10));
    }

    abilities[key] = Math.min(99, Math.max(1, base));
  }

  const experience = Math.floor(Math.random() * 10);

  return {
    id,
    name: generateStaffName(),
    role,
    grade,
    specialty: specialtyKey,
    specialtyLabel: specialty.label,
    age: role === 'trainer' ? 28 + Math.floor(Math.random() * 20) : 35 + Math.floor(Math.random() * 20),
    abilities,
    strengths: [...personalStrengths],
    experience,
    personality: randomPersonality(),
  };
};

// 引退選手をスタッフに転向（チーム内情を知る分、市場スタッフより有利）
export const convertPlayerToStaff = (player) => {
  const id = nextStaffId++;
  const isPitcher = player.position === 'pitcher';
  const isCatcher = player.position === 'catcher';

  // 選手の総合力からグレードを判定し、1段階昇格（チーム貢献ボーナス）
  let overall;
  if (isPitcher) {
    overall = ((player.pitching?.velocity || 130) - 120) * 1.5
      + (player.pitching?.control || 40) + (player.pitching?.stamina || 80) * 0.4;
    overall /= 3;
  } else {
    overall = ((player.batting?.meet || 30) + (player.batting?.power || 30)
      + (player.physical?.speed || 30) + (player.physical?.arm || 30)
      + (player.fielding?.defense || 30)) / 5;
  }

  let baseGrade;
  if (overall >= 65) baseGrade = 'S';
  else if (overall >= 52) baseGrade = 'A';
  else if (overall >= 40) baseGrade = 'B';
  else if (overall >= 28) baseGrade = 'C';
  else baseGrade = 'D';

  const UPGRADE = { D: 'C', C: 'B', B: 'A', A: 'S', S: 'S' };
  const grade = UPGRADE[baseGrade];
  const g = STAFF_GRADES[grade];

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  // 選手能力 → スタッフ指導能力への変換（0~99 → 0~40のボーナス）
  const statToBonus = (stat, scale = 0.4) => Math.round((stat || 0) * scale);

  const abilities = {};
  for (const key of STAFF_ABILITY_KEYS) {
    abilities[key] = g.baseMin + Math.floor(Math.random() * (g.baseMax - g.baseMin + 1));
  }

  // 選手の得意分野を指導力に反映
  const strengths = [];
  if (isPitcher) {
    abilities.pitchingCoach += statToBonus(player.pitching?.control, 0.45);
    abilities.batteryCoach += statToBonus(player.pitching?.control, 0.3);
    strengths.push('pitchingCoach');
    if ((player.pitching?.control || 0) >= 55) strengths.push('batteryCoach');
  } else {
    abilities.battingCoach += statToBonus(player.batting?.meet, 0.35)
      + statToBonus(player.batting?.power, 0.15);
    abilities.fieldRunCoach += statToBonus(player.fielding?.defense, 0.25)
      + statToBonus(player.physical?.speed, 0.2);
    strengths.push('battingCoach');
    if ((player.fielding?.defense || 0) >= 50) strengths.push('fieldRunCoach');
  }
  if (isCatcher) {
    abilities.batteryCoach += statToBonus(player.fielding?.defense, 0.4);
    if (!strengths.includes('batteryCoach')) strengths.push('batteryCoach');
  }

  // チーム内情ボーナス: 全能力に+8〜15
  const familiarityBonus = 8 + Math.floor(Math.random() * 8);
  for (const key of STAFF_ABILITY_KEYS) {
    abilities[key] = clamp(abilities[key] + familiarityBonus, 1, 99);
  }

  // プロ意識の高い選手はモチベーション管理も得意
  const discipline = player.personality?.discipline || 50;
  if (discipline >= 60) {
    abilities.motivation += Math.round(discipline * 0.2);
    abilities.motivation = clamp(abilities.motivation, 1, 99);
    if (discipline >= 75) strengths.push('motivation');
  }

  // 経験年数 = 選手としてのキャリア（年齢-18を目安に、最大15）
  const experience = Math.min(15, Math.max(1, (player.age || 30) - 18));

  // 専門タイプを選手の得意分野から決定
  const specialtyKey = isPitcher
    ? (isCatcher ? 'battery_expert' : 'pitching_expert')
    : strengths.includes('fieldRunCoach') ? 'defense_expert' : 'batting_expert';
  const specialtyLabel = STAFF_SPECIALTIES[specialtyKey]?.label || '万能型';

  return {
    id,
    name: player.name,
    role: 'coach',
    grade,
    specialty: specialtyKey,
    specialtyLabel,
    age: player.age || 35,
    abilities,
    strengths: [...new Set(strengths)],
    experience,
    personality: player.personality?.type || randomPersonality(),
    isFormerPlayer: true,
  };
};

// 市場に出回るスタッフ候補を生成（チームランクで雇用可能グレードをフィルタ）
export const generateStaffMarket = (count = 15, teamRank = null) => {
  const maxGrade = teamRank ? (STAFF_GRADE_CAP[teamRank] || 'C') : null;
  const market = [];
  const roles = ['coach', 'coach', 'coach', 'manager', 'manager', 'trainer', 'trainer'];
  for (let i = 0; i < count; i++) {
    const role = roles[Math.floor(Math.random() * roles.length)];
    market.push(generateStaff(role, null, maxGrade));
  }
  return market.sort((a, b) => {
    const gradeOrder = { S: 0, A: 1, B: 2, C: 3, D: 4 };
    return gradeOrder[a.grade] - gradeOrder[b.grade];
  });
};

// ============================================================
// スタッフの効果算出
// ============================================================

// チーム全スタッフの合算能力を返す
// 最高値ベース: エースコーチの実力が基盤、サブスタッフは補助的に底上げ
export const getTeamStaffBonus = (staffList) => {
  const bonus = {};
  for (const key of STAFF_ABILITY_KEYS) {
    bonus[key] = 0;
  }

  if (!staffList || staffList.length === 0) return bonus;

  for (const key of STAFF_ABILITY_KEYS) {
    const values = staffList.map(s => s.abilities[key] || 0);
    const maxVal = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const headcountBonus = Math.min(0.10, (staffList.length - 1) * 0.02);
    bonus[key] = Math.round(maxVal * 0.8 + avg * 0.2 + maxVal * headcountBonus);
  }

  return bonus;
};

// 練習効率（0.5〜1.5倍）を返す
export const getTrainingEfficiency = (staffBonus, type) => {
  const abilityMap = {
    batting: 'battingCoach',
    fielding: 'fieldRunCoach',
    baserunning: 'fieldRunCoach',
    pitching: 'pitchingCoach',
    battery: 'batteryCoach',
    physical: 'fitness',
  };
  const key = abilityMap[type] || 'battingCoach';
  const val = staffBonus[key] || 50;
  return 0.5 + (val / 100);
};

// スカウト精度ボーナス（1回の視察で得る精度ポイント）
export const getScoutAccuracyGain = (staffBonus) => {
  const eye = staffBonus.scoutingEye || 50;
  return Math.round(15 + (eye / 100) * 25); // 15〜40pt/回
};

// 交渉成功率ボーナス
export const getNegotiationBonus = (staffBonus) => {
  const neg = staffBonus.negotiation || 50;
  return neg / 100; // 0〜1.0
};

// 年次更新: 全スタッフの経験+1、高齢退職判定、AIチーム自動補充
// 返り値: 退職者リスト（UIでの通知用）
export const advanceStaffYear = (staffList, autoReplenish = false, teamRank = null) => {
  if (!staffList) return [];
  const retired = [];
  for (const staff of staffList) {
    staff.experience = (staff.experience || 0) + 1;
    staff.age = (staff.age || 35) + 1;
  }
  // 60歳以上で退職判定（60歳:20%, 65歳:60%, 70歳:100%）
  for (let i = staffList.length - 1; i >= 0; i--) {
    const s = staffList[i];
    const age = s.age || 35;
    if (age < 60) continue;
    const retireChance = age >= 70 ? 1.0 : age >= 65 ? 0.6 : 0.2;
    if (Math.random() < retireChance) {
      retired.push({ name: s.name, role: s.role, age, grade: s.grade });
      staffList.splice(i, 1);
    }
  }
  // AI自動補充: 退職分と同じ役職で補充（グレードキャップ適用）
  if (autoReplenish && retired.length > 0) {
    const maxGrade = teamRank ? (STAFF_GRADE_CAP[teamRank] || 'C') : null;
    for (const r of retired) {
      const replacement = generateStaff(r.role, null, maxGrade);
      if (replacement) staffList.push(replacement);
    }
  }
  return retired;
};

// ============================================================
// ユーティリティ
// ============================================================

const usedStaffNames = new Set();

const generateStaffName = () => {
  for (let i = 0; i < 20; i++) {
    const name = getRandomSurname() + ' ' + getRandomGivenName();
    if (!usedStaffNames.has(name)) {
      usedStaffNames.add(name);
      return name;
    }
  }
  return getRandomSurname() + ' ' + getRandomGivenName();
};

const PERSONALITIES = ['熱血', '冷静', '理論派', '経験派', '面倒見', '厳格', '温和', '情熱家', '策士', '堅実'];

const randomPersonality = () =>
  PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];
