// ============================================================
// 大学野球 全チームデータ（全日本大学野球連盟 / 26連盟）
// 将来の大学モード用データ定義
// ============================================================

export const UNIVERSITY_REGIONS = [
  { id: 'hokkaido_s1', name: '北海道学生', teamCount: 0 },
  { id: 'hokkaido_s2', name: '札幌学生', teamCount: 0 },
  { id: 'tohoku', name: '仙台六大学', teamCount: 0 },
  { id: 'tohoku_n', name: '北東北大学', teamCount: 0 },
  { id: 'tohoku_s', name: '南東北大学', teamCount: 0 },
  { id: 'tokyo_big6', name: '東京六大学', teamCount: 0 },
  { id: 'tokyoto', name: '東都大学', teamCount: 0 },
  { id: 'shuto', name: '首都大学', teamCount: 0 },
  { id: 'kanto', name: '関東五連盟', teamCount: 0 },
  { id: 'chiba_ken', name: '千葉県大学', teamCount: 0 },
  { id: 'kanagawa', name: '神奈川大学', teamCount: 0 },
  { id: 'hokushinetsu', name: '北陸大学', teamCount: 0 },
  { id: 'aichi', name: '愛知大学', teamCount: 0 },
  { id: 'tokai', name: '東海地区大学', teamCount: 0 },
  { id: 'kansai', name: '関西学生', teamCount: 0 },
  { id: 'kansai_rk', name: '関西六大学', teamCount: 0 },
  { id: 'hanshin', name: '阪神大学', teamCount: 0 },
  { id: 'kinki', name: '近畿学生', teamCount: 0 },
  { id: 'kyoto', name: '京滋大学', teamCount: 0 },
  { id: 'chugoku', name: '中国地区大学', teamCount: 0 },
  { id: 'shikoku', name: '四国地区大学', teamCount: 0 },
  { id: 'kyushu_n', name: '九州北部大学', teamCount: 0 },
  { id: 'kyushu_s', name: '九州南部大学', teamCount: 0 },
  { id: 'fukuoka_rk', name: '福岡六大学', teamCount: 0 },
  { id: 'okinawa', name: '沖縄地区大学', teamCount: 0 },
];

// rank: S=超強豪, A=強豪, B=中堅, C=育成型, D=弱小
export const UNIVERSITY_TEAMS = [
  // ========== 東京六大学 ==========
  { id: 1, name: '早稲田大学', region: 'tokyo_big6', rank: 'S', budget: 90 },
  { id: 2, name: '慶應義塾大学', region: 'tokyo_big6', rank: 'S', budget: 90 },
  { id: 3, name: '明治大学', region: 'tokyo_big6', rank: 'S', budget: 85 },
  { id: 4, name: '法政大学', region: 'tokyo_big6', rank: 'A', budget: 80 },
  { id: 5, name: '立教大学', region: 'tokyo_big6', rank: 'A', budget: 75 },
  { id: 6, name: '東京大学', region: 'tokyo_big6', rank: 'D', budget: 60 },

  // ========== 東都大学 ==========
  { id: 7, name: '亜細亜大学', region: 'tokyoto', rank: 'S', budget: 85 },
  { id: 8, name: '東洋大学', region: 'tokyoto', rank: 'S', budget: 85 },
  { id: 9, name: '駒澤大学', region: 'tokyoto', rank: 'A', budget: 75 },
  { id: 10, name: '中央大学', region: 'tokyoto', rank: 'A', budget: 75 },
  { id: 11, name: '國學院大學', region: 'tokyoto', rank: 'A', budget: 70 },
  { id: 12, name: '青山学院大学', region: 'tokyoto', rank: 'B', budget: 65 },
  { id: 13, name: '専修大学', region: 'tokyoto', rank: 'B', budget: 60 },
  { id: 14, name: '立正大学', region: 'tokyoto', rank: 'B', budget: 55 },
  { id: 15, name: '日本大学', region: 'tokyoto', rank: 'B', budget: 65 },
  { id: 16, name: '拓殖大学', region: 'tokyoto', rank: 'C', budget: 45 },

  // ========== 首都大学 ==========
  { id: 17, name: '東海大学', region: 'shuto', rank: 'S', budget: 85 },
  { id: 18, name: '日本体育大学', region: 'shuto', rank: 'A', budget: 75 },
  { id: 19, name: '筑波大学', region: 'shuto', rank: 'A', budget: 70 },
  { id: 20, name: '帝京大学', region: 'shuto', rank: 'B', budget: 60 },
  { id: 21, name: '武蔵大学', region: 'shuto', rank: 'C', budget: 45 },

  // ========== 関西学生 ==========
  { id: 22, name: '同志社大学', region: 'kansai', rank: 'A', budget: 75 },
  { id: 23, name: '立命館大学', region: 'kansai', rank: 'A', budget: 75 },
  { id: 24, name: '関西学院大学', region: 'kansai', rank: 'A', budget: 70 },
  { id: 25, name: '関西大学', region: 'kansai', rank: 'A', budget: 70 },
  { id: 26, name: '近畿大学', region: 'kansai', rank: 'S', budget: 85 },
  { id: 27, name: '京都大学', region: 'kansai', rank: 'D', budget: 55 },

  // ========== 仙台六大学 ==========
  { id: 28, name: '東北福祉大学', region: 'tohoku', rank: 'S', budget: 85 },
  { id: 29, name: '仙台大学', region: 'tohoku', rank: 'B', budget: 55 },
  { id: 30, name: '東北学院大学', region: 'tohoku', rank: 'C', budget: 45 },
  { id: 31, name: '東北大学', region: 'tohoku', rank: 'D', budget: 40 },
  { id: 32, name: '宮城教育大学', region: 'tohoku', rank: 'D', budget: 35 },

  // ========== 愛知大学 ==========
  { id: 33, name: '中京大学', region: 'aichi', rank: 'A', budget: 75 },
  { id: 34, name: '愛知学院大学', region: 'aichi', rank: 'B', budget: 60 },
  { id: 35, name: '愛知工業大学', region: 'aichi', rank: 'B', budget: 55 },
  { id: 36, name: '名城大学', region: 'aichi', rank: 'B', budget: 60 },
  { id: 37, name: '名古屋大学', region: 'aichi', rank: 'D', budget: 45 },

  // ========== 福岡六大学 ==========
  { id: 38, name: '九州産業大学', region: 'fukuoka_rk', rank: 'A', budget: 70 },
  { id: 39, name: '福岡大学', region: 'fukuoka_rk', rank: 'A', budget: 70 },
  { id: 40, name: '西南学院大学', region: 'fukuoka_rk', rank: 'B', budget: 55 },
  { id: 41, name: '九州大学', region: 'fukuoka_rk', rank: 'D', budget: 40 },

  // ========== 北海道学生 ==========
  { id: 42, name: '北海学園大学', region: 'hokkaido_s1', rank: 'B', budget: 55 },
  { id: 43, name: '東海大学札幌', region: 'hokkaido_s2', rank: 'A', budget: 65 },
  { id: 44, name: '北海道大学', region: 'hokkaido_s2', rank: 'D', budget: 40 },

  // ========== 神奈川大学 ==========
  { id: 45, name: '神奈川大学', region: 'kanagawa', rank: 'B', budget: 60 },
  { id: 46, name: '横浜商科大学', region: 'kanagawa', rank: 'C', budget: 45 },
  { id: 47, name: '桐蔭横浜大学', region: 'kanagawa', rank: 'A', budget: 70 },

  // ========== 関東五連盟 ==========
  { id: 48, name: '上武大学', region: 'kanto', rank: 'A', budget: 70 },
  { id: 49, name: '白鷗大学', region: 'kanto', rank: 'B', budget: 55 },
  { id: 50, name: '国際武道大学', region: 'kanto', rank: 'B', budget: 55 },
  { id: 51, name: '流通経済大学', region: 'kanto', rank: 'B', budget: 55 },
  { id: 52, name: '城西大学', region: 'kanto', rank: 'C', budget: 45 },

  // ========== 阪神大学 ==========
  { id: 53, name: '大阪商業大学', region: 'hanshin', rank: 'A', budget: 70 },
  { id: 54, name: '大阪体育大学', region: 'hanshin', rank: 'B', budget: 60 },
  { id: 55, name: '天理大学', region: 'hanshin', rank: 'B', budget: 55 },

  // ========== 中国地区 ==========
  { id: 56, name: '広島経済大学', region: 'chugoku', rank: 'B', budget: 55 },
  { id: 57, name: '環太平洋大学', region: 'chugoku', rank: 'A', budget: 65 },
  { id: 58, name: '広島大学', region: 'chugoku', rank: 'D', budget: 40 },

  // ========== 四国地区 ==========
  { id: 59, name: '四国学院大学', region: 'shikoku', rank: 'B', budget: 55 },
  { id: 60, name: '高知大学', region: 'shikoku', rank: 'C', budget: 40 },
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
