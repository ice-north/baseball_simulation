// ============================================================
// 大学野球 全チームデータ（全日本大学野球連盟 / 14リーグ）
// 東都のみ2部制(12校) + 13リーグ×6校 = 90校
// 首都圏7リーグ(48校) + 地方7リーグ(42校)
// ============================================================

export const UNIVERSITY_REGIONS = [
  // === 首都圏 ===
  { id: 'tokyo_big6', name: '東京六大学', teamCount: 6 },
  { id: 'tokyoto', name: '東都大学', teamCount: 12 },
  { id: 'shuto', name: '首都大学', teamCount: 6 },
  { id: 'tokyo_new', name: '東京新大学', teamCount: 6 },
  { id: 'chiba_ken', name: '千葉県大学', teamCount: 6 },
  { id: 'kanagawa', name: '神奈川大学', teamCount: 6 },
  { id: 'kankoshin', name: '関甲新', teamCount: 6 },
  // === 地方 ===
  { id: 'tohoku_n', name: '北東北大学', teamCount: 6 },
  { id: 'tohoku', name: '仙台六大学', teamCount: 6 },
  { id: 'aichi', name: '愛知大学', teamCount: 6 },
  { id: 'kansai', name: '関西学生', teamCount: 6 },
  { id: 'kansai_rk', name: '関西六大学', teamCount: 6 },
  { id: 'hiroshima_rk', name: '広島六大学', teamCount: 6 },
  { id: 'fukuoka_rk', name: '福岡六大学', teamCount: 6 },
];

// rank: S=超強豪, A=強豪, B=中堅, C=育成型, D=弱小
export const UNIVERSITY_TEAMS = [
  // ========== 東京六大学（固定制）==========
  { id: 1, name: '早稲田大学', region: 'tokyo_big6', rank: 'S', budget: 90 },
  { id: 2, name: '慶應義塾大学', region: 'tokyo_big6', rank: 'S', budget: 90 },
  { id: 3, name: '明治大学', region: 'tokyo_big6', rank: 'S', budget: 85 },
  { id: 4, name: '法政大学', region: 'tokyo_big6', rank: 'A', budget: 80 },
  { id: 5, name: '立教大学', region: 'tokyo_big6', rank: 'A', budget: 75 },
  { id: 6, name: '東京大学', region: 'tokyo_big6', rank: 'D', budget: 60 },

  // ========== 東都大学 1部（入替制）==========
  { id: 7, name: '亜細亜大学', region: 'tokyoto', rank: 'S', budget: 85 },
  { id: 8, name: '東洋大学', region: 'tokyoto', rank: 'S', budget: 85 },
  { id: 9, name: '駒澤大学', region: 'tokyoto', rank: 'A', budget: 75 },
  { id: 10, name: '中央大学', region: 'tokyoto', rank: 'A', budget: 75 },
  { id: 11, name: '國學院大學', region: 'tokyoto', rank: 'A', budget: 70 },
  { id: 12, name: '青山学院大学', region: 'tokyoto', rank: 'B', budget: 65 },

  // ========== 東都大学 2部（入替制）==========
  { id: 13, name: '日本大学', region: 'tokyoto', rank: 'B', budget: 65 },
  { id: 14, name: '専修大学', region: 'tokyoto', rank: 'B', budget: 60 },
  { id: 15, name: '立正大学', region: 'tokyoto', rank: 'B', budget: 55 },
  { id: 16, name: '国士舘大学', region: 'tokyoto', rank: 'C', budget: 50 },
  { id: 17, name: '東京農業大学', region: 'tokyoto', rank: 'C', budget: 45 },
  { id: 18, name: '拓殖大学', region: 'tokyoto', rank: 'C', budget: 45 },

  // ========== 首都大学 1部（入替制）==========
  { id: 19, name: '東海大学', region: 'shuto', rank: 'S', budget: 85 },
  { id: 20, name: '日本体育大学', region: 'shuto', rank: 'A', budget: 75 },
  { id: 21, name: '筑波大学', region: 'shuto', rank: 'A', budget: 70 },
  { id: 22, name: '帝京大学', region: 'shuto', rank: 'B', budget: 60 },
  { id: 23, name: '桜美林大学', region: 'shuto', rank: 'B', budget: 60 },
  { id: 24, name: '城西大学', region: 'shuto', rank: 'C', budget: 50 },

  // ========== 東京新大学 1部（入替制）==========
  { id: 25, name: '創価大学', region: 'tokyo_new', rank: 'B', budget: 55 },
  { id: 26, name: '東京国際大学', region: 'tokyo_new', rank: 'B', budget: 55 },
  { id: 27, name: '流通経済大学', region: 'tokyo_new', rank: 'B', budget: 55 },
  { id: 28, name: '駿河台大学', region: 'tokyo_new', rank: 'C', budget: 45 },
  { id: 29, name: '杏林大学', region: 'tokyo_new', rank: 'C', budget: 45 },
  { id: 30, name: '共栄大学', region: 'tokyo_new', rank: 'C', budget: 45 },

  // ========== 千葉県大学 1部（入替制）==========
  { id: 31, name: '国際武道大学', region: 'chiba_ken', rank: 'B', budget: 55 },
  { id: 32, name: '中央学院大学', region: 'chiba_ken', rank: 'B', budget: 55 },
  { id: 33, name: '城西国際大学', region: 'chiba_ken', rank: 'C', budget: 45 },
  { id: 34, name: '東京情報大学', region: 'chiba_ken', rank: 'C', budget: 45 },
  { id: 35, name: '千葉経済大学', region: 'chiba_ken', rank: 'C', budget: 40 },
  { id: 36, name: '清和大学', region: 'chiba_ken', rank: 'D', budget: 35 },

  // ========== 神奈川大学 1部（入替制）==========
  { id: 37, name: '桐蔭横浜大学', region: 'kanagawa', rank: 'A', budget: 70 },
  { id: 38, name: '神奈川大学', region: 'kanagawa', rank: 'B', budget: 60 },
  { id: 39, name: '関東学院大学', region: 'kanagawa', rank: 'B', budget: 55 },
  { id: 40, name: '横浜商科大学', region: 'kanagawa', rank: 'C', budget: 45 },
  { id: 41, name: '神奈川工科大学', region: 'kanagawa', rank: 'C', budget: 45 },
  { id: 42, name: '横浜国立大学', region: 'kanagawa', rank: 'D', budget: 40 },

  // ========== 関甲新 1部（入替制）==========
  { id: 43, name: '上武大学', region: 'kankoshin', rank: 'A', budget: 70 },
  { id: 44, name: '白鷗大学', region: 'kankoshin', rank: 'B', budget: 55 },
  { id: 45, name: '山梨学院大学', region: 'kankoshin', rank: 'B', budget: 55 },
  { id: 46, name: '新潟医療福祉大学', region: 'kankoshin', rank: 'C', budget: 45 },
  { id: 47, name: '作新学院大学', region: 'kankoshin', rank: 'C', budget: 45 },
  { id: 48, name: '高崎健康福祉大学', region: 'kankoshin', rank: 'C', budget: 45 },

  // ========== 北東北大学（入替制）==========
  { id: 49, name: '富士大学', region: 'tohoku_n', rank: 'A', budget: 65 },
  { id: 50, name: '八戸学院大学', region: 'tohoku_n', rank: 'B', budget: 55 },
  { id: 51, name: 'ノースアジア大学', region: 'tohoku_n', rank: 'C', budget: 45 },
  { id: 52, name: '青森大学', region: 'tohoku_n', rank: 'C', budget: 45 },
  { id: 53, name: '盛岡大学', region: 'tohoku_n', rank: 'C', budget: 40 },
  { id: 54, name: '岩手大学', region: 'tohoku_n', rank: 'D', budget: 35 },

  // ========== 仙台六大学（固定制）==========
  { id: 55, name: '東北福祉大学', region: 'tohoku', rank: 'S', budget: 85 },
  { id: 56, name: '仙台大学', region: 'tohoku', rank: 'B', budget: 55 },
  { id: 57, name: '東北学院大学', region: 'tohoku', rank: 'C', budget: 45 },
  { id: 58, name: '東北工業大学', region: 'tohoku', rank: 'C', budget: 40 },
  { id: 59, name: '東北大学', region: 'tohoku', rank: 'D', budget: 40 },
  { id: 60, name: '宮城教育大学', region: 'tohoku', rank: 'D', budget: 35 },

  // ========== 愛知大学 1部（入替制）==========
  { id: 61, name: '中京大学', region: 'aichi', rank: 'A', budget: 75 },
  { id: 62, name: '愛知学院大学', region: 'aichi', rank: 'B', budget: 60 },
  { id: 63, name: '愛知工業大学', region: 'aichi', rank: 'B', budget: 55 },
  { id: 64, name: '名城大学', region: 'aichi', rank: 'B', budget: 60 },
  { id: 65, name: '中部大学', region: 'aichi', rank: 'B', budget: 55 },
  { id: 66, name: '愛知東邦大学', region: 'aichi', rank: 'C', budget: 45 },

  // ========== 関西学生（固定制）==========
  { id: 67, name: '近畿大学', region: 'kansai', rank: 'S', budget: 85 },
  { id: 68, name: '同志社大学', region: 'kansai', rank: 'A', budget: 75 },
  { id: 69, name: '立命館大学', region: 'kansai', rank: 'A', budget: 75 },
  { id: 70, name: '関西学院大学', region: 'kansai', rank: 'A', budget: 70 },
  { id: 71, name: '関西大学', region: 'kansai', rank: 'A', budget: 70 },
  { id: 72, name: '京都大学', region: 'kansai', rank: 'D', budget: 55 },

  // ========== 関西六大学（固定制）==========
  { id: 73, name: '大阪商業大学', region: 'kansai_rk', rank: 'A', budget: 70 },
  { id: 74, name: '京都産業大学', region: 'kansai_rk', rank: 'A', budget: 70 },
  { id: 75, name: '龍谷大学', region: 'kansai_rk', rank: 'B', budget: 55 },
  { id: 76, name: '大阪経済大学', region: 'kansai_rk', rank: 'B', budget: 55 },
  { id: 77, name: '大阪学院大学', region: 'kansai_rk', rank: 'C', budget: 45 },
  { id: 78, name: '神戸学院大学', region: 'kansai_rk', rank: 'C', budget: 45 },

  // ========== 広島六大学（固定制）==========
  { id: 79, name: '広島経済大学', region: 'hiroshima_rk', rank: 'B', budget: 55 },
  { id: 80, name: '広島修道大学', region: 'hiroshima_rk', rank: 'B', budget: 55 },
  { id: 81, name: '広島工業大学', region: 'hiroshima_rk', rank: 'C', budget: 45 },
  { id: 82, name: '広島国際大学', region: 'hiroshima_rk', rank: 'C', budget: 40 },
  { id: 83, name: '近畿大学工学部', region: 'hiroshima_rk', rank: 'C', budget: 45 },
  { id: 84, name: '広島大学', region: 'hiroshima_rk', rank: 'D', budget: 40 },

  // ========== 福岡六大学（固定制）==========
  { id: 85, name: '九州産業大学', region: 'fukuoka_rk', rank: 'A', budget: 70 },
  { id: 86, name: '九州共立大学', region: 'fukuoka_rk', rank: 'B', budget: 55 },
  { id: 87, name: '福岡工業大学', region: 'fukuoka_rk', rank: 'C', budget: 45 },
  { id: 88, name: '日本経済大学', region: 'fukuoka_rk', rank: 'C', budget: 45 },
  { id: 89, name: '福岡教育大学', region: 'fukuoka_rk', rank: 'D', budget: 35 },
  { id: 90, name: '九州工業大学', region: 'fukuoka_rk', rank: 'D', budget: 35 },
];

// ============================================================
// ランク別成長倍率
// 大学のランクによって在学中の成長速度が変わる
// ============================================================

export const UNIVERSITY_RANK_GROWTH = {
  S: 1.25,
  A: 1.10,
  B: 1.00,
  C: 0.90,
  D: 0.80,
};

// ============================================================
// ランク別設定（将来の大学モード初期化で使用）
// corporateInit.js の RANK_CONFIG に相当
// ============================================================

export const UNIVERSITY_RANK_CONFIG = {
  S: {
    teamOffset: 5,
    starCount: [3, 5],
    starBoost: [10, 16],
    starGrowth: 0.10,
    eliteChance: 0.18,
    eliteBoost: [8, 14],
    eliteGrowth: 0.12,
  },
  A: {
    teamOffset: 3,
    starCount: [2, 3],
    starBoost: [8, 14],
    starGrowth: 0.08,
    eliteChance: 0.10,
    eliteBoost: [8, 12],
    eliteGrowth: 0.10,
  },
  B: {
    teamOffset: 0,
    starCount: [0, 1],
    starBoost: [6, 12],
    starGrowth: 0.05,
    eliteChance: 0.05,
    eliteBoost: [6, 10],
    eliteGrowth: 0.08,
  },
  C: {
    teamOffset: -2,
    starCount: [0, 1],
    starBoost: [4, 8],
    starGrowth: 0.03,
    eliteChance: 0.02,
    eliteBoost: [4, 8],
    eliteGrowth: 0.05,
  },
  D: {
    teamOffset: -4,
    starCount: [0, 0],
    starBoost: [0, 0],
    starGrowth: 0.00,
    eliteChance: 0.00,
    eliteBoost: [0, 0],
    eliteGrowth: 0.00,
  },
};

// ============================================================
// ヘルパー関数
// ============================================================

export function getUniversityTeamsByRegion(regionId) {
  return UNIVERSITY_TEAMS.filter(t => t.region === regionId);
}

export function getUniversityTeamById(id) {
  return UNIVERSITY_TEAMS.find(t => t.id === id);
}

export function getUniversityTeamByName(name) {
  return UNIVERSITY_TEAMS.find(t => t.name === name);
}

export function getAllUniversityTeams() {
  return UNIVERSITY_TEAMS;
}

export function getUniversityTeamsByRank(rank) {
  return UNIVERSITY_TEAMS.filter(t => t.rank === rank);
}

export function getUniversityGrowthMultiplier(rank) {
  return UNIVERSITY_RANK_GROWTH[rank] || 1.0;
}
