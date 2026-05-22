// ============================================================
// 社会人野球 スタッフデータ（コーチ・マネージャー・トレーナー）
// ============================================================

// スタッフ能力項目
export const STAFF_ABILITIES = {
  battingCoach:    { name: '打撃指導', category: 'coaching' },
  fieldingCoach:   { name: '守備指導', category: 'coaching' },
  baserunCoach:    { name: '走塁指導', category: 'coaching' },
  batteryCoach:    { name: 'バッテリー指導', category: 'coaching' },
  motivation:      { name: 'モチベーション管理', category: 'management' },
  scoutingEye:     { name: 'スカウト眼', category: 'scouting' },
  fitness:         { name: 'フィットネス', category: 'medical' },
  bodyCare:        { name: '身体ケア', category: 'medical' },
  managing:        { name: 'マネージング', category: 'management' },
  negotiation:     { name: '交渉', category: 'management' },
};

export const STAFF_ABILITY_KEYS = Object.keys(STAFF_ABILITIES);

// スタッフの役職別・能力傾向
// weights: 各能力の「得意度」。高いほどその能力が高く生成されやすい
export const STAFF_ROLE_PROFILES = {
  coach: {
    name: 'コーチ',
    weights: {
      battingCoach: 1.5, fieldingCoach: 1.5, baserunCoach: 1.3, batteryCoach: 1.3,
      motivation: 1.0, scoutingEye: 1.0, fitness: 0.7, bodyCare: 0.5,
      managing: 0.5, negotiation: 0.5,
    },
    salaryBase: 300,
  },
  manager: {
    name: 'マネージャー',
    weights: {
      battingCoach: 0.5, fieldingCoach: 0.5, baserunCoach: 0.5, batteryCoach: 0.5,
      motivation: 1.3, scoutingEye: 1.2, fitness: 0.7, bodyCare: 0.7,
      managing: 1.5, negotiation: 1.5,
    },
    salaryBase: 250,
  },
  trainer: {
    name: 'トレーナー',
    weights: {
      battingCoach: 0.5, fieldingCoach: 0.5, baserunCoach: 0.8, batteryCoach: 0.5,
      motivation: 0.8, scoutingEye: 0.5, fitness: 1.5, bodyCare: 1.5,
      managing: 0.5, negotiation: 0.5,
    },
    salaryBase: 200,
  },
};

// スタッフのグレード（能力の基準値）
export const STAFF_GRADES = {
  S: { label: 'S級', baseMin: 70, baseMax: 95, salaryMult: 3.0 },
  A: { label: 'A級', baseMin: 55, baseMax: 80, salaryMult: 2.0 },
  B: { label: 'B級', baseMin: 40, baseMax: 65, salaryMult: 1.3 },
  C: { label: 'C級', baseMin: 25, baseMax: 50, salaryMult: 0.8 },
  D: { label: 'D級', baseMin: 10, baseMax: 35, salaryMult: 0.5 },
};

// ============================================================
// スタッフ生成
// ============================================================

let nextStaffId = 5000;

export const generateStaff = (role, grade = null) => {
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

  const g = STAFF_GRADES[grade];
  const abilities = {};

  for (const key of STAFF_ABILITY_KEYS) {
    const weight = profile.weights[key] || 1.0;
    const base = g.baseMin + Math.floor(Math.random() * (g.baseMax - g.baseMin + 1));
    const weighted = Math.round(base * weight);
    abilities[key] = Math.min(99, Math.max(1, weighted));
  }

  const salary = Math.round(profile.salaryBase * g.salaryMult / 10) * 10;

  return {
    id,
    name: generateStaffName(),
    role,
    grade,
    age: role === 'trainer' ? 28 + Math.floor(Math.random() * 20) : 35 + Math.floor(Math.random() * 20),
    abilities,
    salary, // 万円/年
    experience: 0,
    personality: randomPersonality(),
  };
};

// 市場に出回るスタッフ候補を生成
export const generateStaffMarket = (count = 15) => {
  const market = [];
  const roles = ['coach', 'coach', 'coach', 'manager', 'manager', 'trainer', 'trainer'];
  for (let i = 0; i < count; i++) {
    const role = roles[Math.floor(Math.random() * roles.length)];
    market.push(generateStaff(role));
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
export const getTeamStaffBonus = (staffList) => {
  const bonus = {};
  for (const key of STAFF_ABILITY_KEYS) {
    bonus[key] = 0;
  }

  if (!staffList || staffList.length === 0) return bonus;

  for (const staff of staffList) {
    for (const key of STAFF_ABILITY_KEYS) {
      bonus[key] += staff.abilities[key] || 0;
    }
  }

  // 平均値ベースだが、人数が多いほどわずかにボーナス（最大+10%）
  const headcountBonus = 1.0 + Math.min(0.10, (staffList.length - 1) * 0.02);
  for (const key of STAFF_ABILITY_KEYS) {
    bonus[key] = Math.round((bonus[key] / staffList.length) * headcountBonus);
  }

  return bonus;
};

// 練習効率（0.5〜1.5倍）を返す
export const getTrainingEfficiency = (staffBonus, type) => {
  const abilityMap = {
    batting: 'battingCoach',
    fielding: 'fieldingCoach',
    baserunning: 'baserunCoach',
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

// ============================================================
// ユーティリティ
// ============================================================

const STAFF_LAST_NAMES = [
  '山田', '田中', '佐藤', '鈴木', '高橋', '渡辺', '中村', '小林', '加藤', '吉田',
  '松本', '井上', '木村', '林', '清水', '山口', '池田', '橋本', '阿部', '森',
  '石川', '前田', '藤田', '小川', '後藤', '岡田', '長谷川', '村上', '近藤', '石井',
];
const STAFF_FIRST_NAMES = [
  '太郎', '一郎', '正義', '浩二', '秀樹', '勝', '和夫', '茂', '博', '誠',
  '修', '豊', '清', '進', '弘', '明', '実', '隆', '昭', '幸男',
];

const generateStaffName = () =>
  STAFF_LAST_NAMES[Math.floor(Math.random() * STAFF_LAST_NAMES.length)] +
  STAFF_FIRST_NAMES[Math.floor(Math.random() * STAFF_FIRST_NAMES.length)];

const PERSONALITIES = ['熱血', '冷静', '理論派', '経験派', '面倒見', '厳格', '温和', '情熱家', '策士', '堅実'];

const randomPersonality = () =>
  PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];
