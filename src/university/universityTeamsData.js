// ============================================================
// 大学野球 全チームデータ（全日本大学野球連盟 / 16リーグ）
// 東都のみ2部制(12校) + 15リーグ×6校 = 102校
// 首都圏7リーグ(48校) + 地方9リーグ(54校)
// ============================================================
// divisions: 部制の数（1=単独リーグ, 2=2部制）。デフォルト1。
// 2部制の場合、UNIVERSITY_TEAMSの同region内で先頭から teamCount/divisions 人が1部。
// 将来のリーグ追加: UNIVERSITY_REGIONS に追加 + UNIVERSITY_TEAMS にチーム追加するだけ。
// 将来の3部制: divisions: 3 にして、チームを18校登録すれば自動で3分割。
// ============================================================

export const UNIVERSITY_REGIONS = [
  // === 首都圏 ===
  { id: 'tokyo_big6', name: '東京六大学野球リーグ', teamCount: 6, divisions: 1 },
  { id: 'tokyoto', name: '東都大学野球リーグ', teamCount: 12, divisions: 2 },
  { id: 'shuto', name: '首都大学野球リーグ', teamCount: 6, divisions: 1 },
  { id: 'tokyo_new', name: '東京新大学野球リーグ', teamCount: 6, divisions: 1 },
  { id: 'chiba_ken', name: '千葉県大学野球リーグ', teamCount: 6, divisions: 1 },
  { id: 'kanagawa', name: '神奈川大学野球リーグ', teamCount: 6, divisions: 1 },
  { id: 'kankoshin', name: '関甲新学生野球リーグ', teamCount: 6, divisions: 1 },
  // === 地方 ===
  { id: 'hokkaido', name: '北海道学生野球リーグ', teamCount: 6, divisions: 1 },
  { id: 'tohoku_n', name: '北東北大学野球リーグ', teamCount: 6, divisions: 1 },
  { id: 'tohoku', name: '仙台六大学野球リーグ', teamCount: 6, divisions: 1 },
  { id: 'aichi', name: '愛知大学野球リーグ', teamCount: 6, divisions: 1 },
  { id: 'kansai', name: '関西学生野球リーグ', teamCount: 6, divisions: 1 },
  { id: 'kansai_rk', name: '関西六大学野球リーグ', teamCount: 6, divisions: 1 },
  { id: 'keiji', name: '京滋大学野球リーグ', teamCount: 6, divisions: 1 },
  { id: 'hiroshima_rk', name: '広島六大学野球リーグ', teamCount: 6, divisions: 1 },
  { id: 'fukuoka_rk', name: '福岡六大学野球リーグ', teamCount: 6, divisions: 1 },
];

// rank: S=超強豪, A=強豪, B=中堅, C=育成型, D=弱小
// specialties: 大学の得意な育成分野（ランク別: S=5, A=4, B=3, C=2, D=1）
// 7分野: pitching(投手力), meet(ミート), power(パワー), speed(走力), defense(守備), arm(肩力), eye(選球眼)
// specialtiesに含まれる分野は100%の成長ボーナス、含まれない分野は80%（低ランクはSPECIALTY_RANK_BOOSTで補正）
export const UNIVERSITY_TEAMS = [
  // ========== 東京六大学（固定制）==========
  { id: 1, name: '早稲田大学', region: 'tokyo_big6', rank: 'S', budget: 90, specialties: ['meet', 'power', 'defense', 'eye', 'pitching'] },
  { id: 2, name: '慶應義塾大学', region: 'tokyo_big6', rank: 'S', budget: 90, specialties: ['meet', 'eye', 'pitching', 'defense', 'speed'] },
  { id: 3, name: '明治大学', region: 'tokyo_big6', rank: 'S', budget: 85, specialties: ['power', 'pitching', 'arm', 'meet', 'speed'] },
  { id: 4, name: '法政大学', region: 'tokyo_big6', rank: 'A', budget: 80, specialties: ['power', 'pitching', 'arm', 'speed'] },
  { id: 5, name: '立教大学', region: 'tokyo_big6', rank: 'A', budget: 75, specialties: ['meet', 'eye', 'defense', 'pitching'] },
  { id: 6, name: '東京大学', region: 'tokyo_big6', rank: 'D', budget: 60, specialties: ['eye'] },

  // ========== 東都大学 1部（入替制）==========
  { id: 7, name: '亜細亜大学', region: 'tokyoto', rank: 'S', budget: 85, specialties: ['defense', 'arm', 'speed', 'meet', 'pitching'] },
  { id: 8, name: '東洋大学', region: 'tokyoto', rank: 'S', budget: 85, specialties: ['pitching', 'defense', 'power', 'arm', 'eye'] },
  { id: 9, name: '駒澤大学', region: 'tokyoto', rank: 'A', budget: 75, specialties: ['speed', 'defense', 'pitching', 'arm'] },
  { id: 10, name: '中央大学', region: 'tokyoto', rank: 'A', budget: 75, specialties: ['meet', 'defense', 'pitching', 'eye'] },
  { id: 11, name: '國學院大學', region: 'tokyoto', rank: 'A', budget: 70, specialties: ['meet', 'power', 'eye', 'arm'] },
  { id: 12, name: '青山学院大学', region: 'tokyoto', rank: 'B', budget: 65, specialties: ['speed', 'defense', 'eye'] },

  // ========== 東都大学 2部（入替制）==========
  { id: 13, name: '日本大学', region: 'tokyoto', rank: 'B', budget: 65, specialties: ['power', 'arm', 'pitching'] },
  { id: 14, name: '専修大学', region: 'tokyoto', rank: 'B', budget: 60, specialties: ['defense', 'arm', 'meet'] },
  { id: 15, name: '立正大学', region: 'tokyoto', rank: 'B', budget: 55, specialties: ['pitching', 'defense', 'meet'] },
  { id: 16, name: '国士舘大学', region: 'tokyoto', rank: 'C', budget: 50, specialties: ['speed', 'arm'] },
  { id: 17, name: '東京農業大学', region: 'tokyoto', rank: 'C', budget: 45, specialties: ['pitching', 'defense'] },
  { id: 18, name: '拓殖大学', region: 'tokyoto', rank: 'C', budget: 45, specialties: ['speed', 'power'] },

  // ========== 首都大学 1部（入替制）==========
  { id: 19, name: '東海大学', region: 'shuto', rank: 'S', budget: 85, specialties: ['pitching', 'power', 'arm', 'speed', 'defense'] },
  { id: 20, name: '日本体育大学', region: 'shuto', rank: 'A', budget: 75, specialties: ['speed', 'power', 'arm', 'defense'] },
  { id: 21, name: '筑波大学', region: 'shuto', rank: 'A', budget: 70, specialties: ['meet', 'defense', 'eye', 'pitching'] },
  { id: 22, name: '帝京大学', region: 'shuto', rank: 'B', budget: 60, specialties: ['power', 'pitching', 'arm'] },
  { id: 23, name: '桜美林大学', region: 'shuto', rank: 'B', budget: 60, specialties: ['meet', 'defense', 'eye'] },
  { id: 24, name: '城西大学', region: 'shuto', rank: 'C', budget: 50, specialties: ['speed', 'pitching'] },

  // ========== 東京新大学 1部（入替制）==========
  { id: 25, name: '創価大学', region: 'tokyo_new', rank: 'B', budget: 55, specialties: ['pitching', 'meet', 'eye'] },
  { id: 26, name: '東京国際大学', region: 'tokyo_new', rank: 'B', budget: 55, specialties: ['speed', 'defense', 'arm'] },
  { id: 27, name: '流通経済大学', region: 'tokyo_new', rank: 'B', budget: 55, specialties: ['speed', 'pitching', 'power'] },
  { id: 28, name: '駿河台大学', region: 'tokyo_new', rank: 'C', budget: 45, specialties: ['defense', 'arm'] },
  { id: 29, name: '杏林大学', region: 'tokyo_new', rank: 'C', budget: 45, specialties: ['eye', 'meet'] },
  { id: 30, name: '共栄大学', region: 'tokyo_new', rank: 'C', budget: 45, specialties: ['pitching', 'speed'] },

  // ========== 千葉県大学 1部（入替制）==========
  { id: 31, name: '国際武道大学', region: 'chiba_ken', rank: 'B', budget: 55, specialties: ['defense', 'arm', 'speed'] },
  { id: 32, name: '中央学院大学', region: 'chiba_ken', rank: 'B', budget: 55, specialties: ['meet', 'eye', 'pitching'] },
  { id: 33, name: '城西国際大学', region: 'chiba_ken', rank: 'C', budget: 45, specialties: ['speed', 'power'] },
  { id: 34, name: '東京情報大学', region: 'chiba_ken', rank: 'C', budget: 45, specialties: ['pitching', 'eye'] },
  { id: 35, name: '千葉経済大学', region: 'chiba_ken', rank: 'C', budget: 40, specialties: ['meet', 'defense'] },
  { id: 36, name: '清和大学', region: 'chiba_ken', rank: 'D', budget: 35, specialties: ['pitching'] },

  // ========== 神奈川大学 1部（入替制）==========
  { id: 37, name: '桐蔭横浜大学', region: 'kanagawa', rank: 'A', budget: 70, specialties: ['pitching', 'power', 'arm', 'defense'] },
  { id: 38, name: '神奈川大学', region: 'kanagawa', rank: 'B', budget: 60, specialties: ['meet', 'power', 'eye'] },
  { id: 39, name: '関東学院大学', region: 'kanagawa', rank: 'B', budget: 55, specialties: ['defense', 'arm', 'pitching'] },
  { id: 40, name: '横浜商科大学', region: 'kanagawa', rank: 'C', budget: 45, specialties: ['power', 'arm'] },
  { id: 41, name: '神奈川工科大学', region: 'kanagawa', rank: 'C', budget: 45, specialties: ['pitching', 'defense'] },
  { id: 42, name: '横浜国立大学', region: 'kanagawa', rank: 'D', budget: 40, specialties: ['eye'] },

  // ========== 関甲新 1部（入替制）==========
  { id: 43, name: '上武大学', region: 'kankoshin', rank: 'A', budget: 70, specialties: ['power', 'pitching', 'arm', 'speed'] },
  { id: 44, name: '白鷗大学', region: 'kankoshin', rank: 'B', budget: 55, specialties: ['speed', 'defense', 'meet'] },
  { id: 45, name: '山梨学院大学', region: 'kankoshin', rank: 'B', budget: 55, specialties: ['meet', 'power', 'arm'] },
  { id: 46, name: '新潟医療福祉大学', region: 'kankoshin', rank: 'C', budget: 45, specialties: ['pitching', 'defense'] },
  { id: 47, name: '作新学院大学', region: 'kankoshin', rank: 'C', budget: 45, specialties: ['defense', 'speed'] },
  { id: 48, name: '高崎健康福祉大学', region: 'kankoshin', rank: 'C', budget: 45, specialties: ['arm', 'power'] },

  // ========== 北海道学生（入替制）==========
  { id: 91, name: '東農大北海道オホーツク', region: 'hokkaido', rank: 'A', budget: 70, specialties: ['power', 'pitching', 'arm', 'meet'] },
  { id: 92, name: '函館大学', region: 'hokkaido', rank: 'B', budget: 55, specialties: ['pitching', 'speed', 'defense'] },
  { id: 93, name: '旭川市立大学', region: 'hokkaido', rank: 'C', budget: 45, specialties: ['defense', 'arm'] },
  { id: 94, name: '釧路公立大学', region: 'hokkaido', rank: 'C', budget: 40, specialties: ['pitching', 'speed'] },
  { id: 95, name: '帯広畜産大学', region: 'hokkaido', rank: 'D', budget: 35, specialties: ['pitching'] },
  { id: 96, name: '北洋大学', region: 'hokkaido', rank: 'B', budget: 55, specialties: ['pitching', 'arm', 'power'] },

  // ========== 北東北大学（入替制）==========
  { id: 49, name: '富士大学', region: 'tohoku_n', rank: 'A', budget: 65, specialties: ['power', 'pitching', 'meet', 'arm'] },
  { id: 50, name: '八戸学院大学', region: 'tohoku_n', rank: 'B', budget: 55, specialties: ['speed', 'defense', 'pitching'] },
  { id: 51, name: 'ノースアジア大学', region: 'tohoku_n', rank: 'C', budget: 45, specialties: ['arm', 'defense'] },
  { id: 52, name: '青森大学', region: 'tohoku_n', rank: 'C', budget: 45, specialties: ['speed', 'power'] },
  { id: 53, name: '盛岡大学', region: 'tohoku_n', rank: 'C', budget: 40, specialties: ['defense', 'meet'] },
  { id: 54, name: '岩手大学', region: 'tohoku_n', rank: 'D', budget: 35, specialties: ['pitching'] },

  // ========== 仙台六大学（固定制）==========
  { id: 55, name: '東北福祉大学', region: 'tohoku', rank: 'S', budget: 85, specialties: ['pitching', 'meet', 'defense', 'eye', 'arm'] },
  { id: 56, name: '仙台大学', region: 'tohoku', rank: 'B', budget: 55, specialties: ['speed', 'pitching', 'arm'] },
  { id: 57, name: '東北学院大学', region: 'tohoku', rank: 'C', budget: 45, specialties: ['defense', 'meet'] },
  { id: 58, name: '東北工業大学', region: 'tohoku', rank: 'C', budget: 40, specialties: ['arm', 'pitching'] },
  { id: 59, name: '東北大学', region: 'tohoku', rank: 'D', budget: 40, specialties: ['pitching'] },
  { id: 60, name: '宮城教育大学', region: 'tohoku', rank: 'D', budget: 35, specialties: ['defense'] },

  // ========== 愛知大学 1部（入替制）==========
  { id: 61, name: '中京大学', region: 'aichi', rank: 'A', budget: 75, specialties: ['pitching', 'power', 'speed', 'arm'] },
  { id: 62, name: '愛知学院大学', region: 'aichi', rank: 'B', budget: 60, specialties: ['meet', 'power', 'eye'] },
  { id: 63, name: '愛知工業大学', region: 'aichi', rank: 'B', budget: 55, specialties: ['pitching', 'arm', 'power'] },
  { id: 64, name: '名城大学', region: 'aichi', rank: 'B', budget: 60, specialties: ['defense', 'pitching', 'meet'] },
  { id: 65, name: '中部大学', region: 'aichi', rank: 'B', budget: 55, specialties: ['pitching', 'meet', 'defense'] },
  { id: 66, name: '愛知東邦大学', region: 'aichi', rank: 'C', budget: 45, specialties: ['speed', 'defense'] },

  // ========== 関西学生（固定制）==========
  { id: 67, name: '近畿大学', region: 'kansai', rank: 'S', budget: 85, specialties: ['power', 'pitching', 'speed', 'arm', 'meet'] },
  { id: 68, name: '同志社大学', region: 'kansai', rank: 'A', budget: 75, specialties: ['meet', 'eye', 'pitching', 'defense'] },
  { id: 69, name: '立命館大学', region: 'kansai', rank: 'A', budget: 75, specialties: ['power', 'pitching', 'arm', 'speed'] },
  { id: 70, name: '関西学院大学', region: 'kansai', rank: 'A', budget: 70, specialties: ['meet', 'defense', 'eye', 'pitching'] },
  { id: 71, name: '関西大学', region: 'kansai', rank: 'A', budget: 70, specialties: ['meet', 'power', 'eye', 'arm'] },
  { id: 72, name: '京都大学', region: 'kansai', rank: 'D', budget: 55, specialties: ['eye'] },

  // ========== 関西六大学（固定制）==========
  { id: 73, name: '大阪商業大学', region: 'kansai_rk', rank: 'A', budget: 70, specialties: ['power', 'meet', 'arm', 'eye'] },
  { id: 74, name: '京都産業大学', region: 'kansai_rk', rank: 'A', budget: 70, specialties: ['speed', 'defense', 'pitching', 'meet'] },
  { id: 75, name: '龍谷大学', region: 'kansai_rk', rank: 'B', budget: 55, specialties: ['meet', 'eye', 'defense'] },
  { id: 76, name: '大阪経済大学', region: 'kansai_rk', rank: 'B', budget: 55, specialties: ['power', 'arm', 'pitching'] },
  { id: 77, name: '大阪学院大学', region: 'kansai_rk', rank: 'C', budget: 45, specialties: ['meet', 'eye'] },
  { id: 78, name: '神戸学院大学', region: 'kansai_rk', rank: 'C', budget: 45, specialties: ['pitching', 'defense'] },

  // ========== 広島六大学（固定制）==========
  { id: 79, name: '広島経済大学', region: 'hiroshima_rk', rank: 'B', budget: 55, specialties: ['meet', 'eye', 'power'] },
  { id: 80, name: '広島修道大学', region: 'hiroshima_rk', rank: 'B', budget: 55, specialties: ['defense', 'pitching', 'arm'] },
  { id: 81, name: '広島工業大学', region: 'hiroshima_rk', rank: 'C', budget: 45, specialties: ['pitching', 'arm'] },
  { id: 82, name: '広島国際大学', region: 'hiroshima_rk', rank: 'C', budget: 40, specialties: ['pitching', 'speed'] },
  { id: 83, name: '近畿大学工学部', region: 'hiroshima_rk', rank: 'C', budget: 45, specialties: ['power', 'meet'] },
  { id: 84, name: '広島大学', region: 'hiroshima_rk', rank: 'D', budget: 40, specialties: ['defense'] },

  // ========== 京滋大学（入替制）==========
  { id: 97, name: '佛教大学', region: 'keiji', rank: 'A', budget: 70, specialties: ['meet', 'pitching', 'defense', 'eye'] },
  { id: 98, name: 'びわこ成蹊スポーツ大学', region: 'keiji', rank: 'B', budget: 55, specialties: ['speed', 'arm', 'power'] },
  { id: 99, name: '花園大学', region: 'keiji', rank: 'B', budget: 55, specialties: ['defense', 'meet', 'pitching'] },
  { id: 100, name: '京都先端科学大学', region: 'keiji', rank: 'C', budget: 45, specialties: ['eye', 'pitching'] },
  { id: 101, name: '大谷大学', region: 'keiji', rank: 'C', budget: 40, specialties: ['pitching', 'meet'] },
  { id: 102, name: '京都教育大学', region: 'keiji', rank: 'D', budget: 35, specialties: ['meet'] },

  // ========== 福岡六大学（固定制）==========
  { id: 85, name: '九州産業大学', region: 'fukuoka_rk', rank: 'A', budget: 70, specialties: ['power', 'arm', 'speed', 'pitching'] },
  { id: 86, name: '九州共立大学', region: 'fukuoka_rk', rank: 'B', budget: 55, specialties: ['pitching', 'power', 'arm'] },
  { id: 87, name: '福岡工業大学', region: 'fukuoka_rk', rank: 'C', budget: 45, specialties: ['pitching', 'defense'] },
  { id: 88, name: '日本経済大学', region: 'fukuoka_rk', rank: 'C', budget: 45, specialties: ['meet', 'speed'] },
  { id: 89, name: '福岡教育大学', region: 'fukuoka_rk', rank: 'D', budget: 35, specialties: ['eye'] },
  { id: 90, name: '九州工業大学', region: 'fukuoka_rk', rank: 'D', budget: 35, specialties: ['arm'] },
];

// ============================================================
// 得意分野の定義
// ============================================================

export const SPECIALTY_LABELS = {
  pitching: '投手力',
  meet: 'ミート',
  power: 'パワー',
  speed: '走力',
  defense: '守備',
  arm: '肩力',
  eye: '選球眼',
};

export const SPECIALTY_ICONS = {
  pitching: '⚾', meet: '🏏', power: '💥',
  speed: '⚡', defense: '🛡️', arm: '💪', eye: '👁️',
};

// ============================================================
// ランク別得意分野の非得意ブースト倍率
// 低ランク大学は得意分野外でも底上げされる（格差緩和）
// 得意分野は常に100%。非得意分野に対してこの倍率が適用される。
// ============================================================

export const SPECIALTY_RANK_BOOST = {
  S: 1.0,
  A: 1.0,
  B: 1.1,
  C: 1.2,
  D: 1.3,
};

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
// ヘルパー関数
// ============================================================

export function getUniversityGrowthMultiplier(rank) {
  return UNIVERSITY_RANK_GROWTH[rank] || 1.0;
}

export function getUniversityTeamById(id) {
  return UNIVERSITY_TEAMS.find(t => t.id === id);
}

export function getUniversityTeamsByRank(rank) {
  return UNIVERSITY_TEAMS.filter(t => t.rank === rank);
}

/**
 * 大学の得意分野リストを返す
 * 新システム: pitching, meet, power, speed, defense, arm, eye の7種
 * specialtiesに含まれる分野は100%成長、含まれない分野は80%（SPECIALTY_RANK_BOOSTで補正）
 */
export function getUniversitySpecialties(universityId) {
  const team = UNIVERSITY_TEAMS.find(t => t.id === universityId);
  return team?.specialties || [];
}

/**
 * 指定した能力が大学の得意分野かどうか判定する
 * pitching は velocity/control/stamina のいずれかでもマッチする
 */
export function hasUniversitySpecialty(universityId, stat) {
  const specialties = getUniversitySpecialties(universityId);
  if (specialties.length === 0) return true; // 得意分野未定義ならすべてOK
  if (specialties.includes(stat)) return true;
  // pitching は velocity/control/stamina をカバー
  if (['velocity', 'control', 'stamina'].includes(stat) && specialties.includes('pitching')) return true;
  return false;
}

/**
 * 大学の得意分野ブースト値を返す（非得意分野の底上げ倍率）
 */
export function getSpecialtyRankBoost(rank) {
  return SPECIALTY_RANK_BOOST[rank] || 1.0;
}

export function getSpecialtyLabel(key) {
  return SPECIALTY_LABELS[key] || key;
}
