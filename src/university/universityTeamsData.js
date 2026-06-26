// ============================================================
// 大学野球 全チームデータ（全日本大学野球連盟 / 27リーグ）
// 2部制リーグ7連盟 + 1部制リーグ20連盟 = 204校
// 首都圏7リーグ(72校) + 地方20リーグ(132校)
// ============================================================
// divisions: 部制の数（1=単独リーグ, 2=2部制）。デフォルト1。
// 2部制の場合、UNIVERSITY_TEAMSの同region内で先頭から teamCount/divisions 人が1部。
// 将来のリーグ追加: UNIVERSITY_REGIONS に追加 + UNIVERSITY_TEAMS にチーム追加するだけ。
// 将来の3部制: divisions: 3 にして、チームを18校登録すれば自動で3分割。
// ============================================================

export const UNIVERSITY_REGIONS = [
  // === 北海道・東北 ===
  { id: 'hokkaido', name: '北海道学生野球リーグ', teamCount: 6, divisions: 1 },
  { id: 'sapporo', name: '札幌学生野球リーグ', teamCount: 6, divisions: 1 },
  { id: 'tohoku_n', name: '北東北大学野球リーグ', teamCount: 6, divisions: 1 },
  { id: 'tohoku', name: '仙台六大学野球リーグ', teamCount: 6, divisions: 1 },
  { id: 'tohoku_s', name: '南東北大学野球リーグ', teamCount: 6, divisions: 1 },
  { id: 'kankoshin', name: '関甲新学生野球リーグ', teamCount: 12, divisions: 2 },
  // === 関東 ===
  { id: 'tokyo_big6', name: '東京六大学野球リーグ', teamCount: 6, divisions: 1 },
  { id: 'tokyoto', name: '東都大学野球リーグ', teamCount: 12, divisions: 2 },
  { id: 'shuto', name: '首都大学野球リーグ', teamCount: 12, divisions: 2 },
  { id: 'tokyo_new', name: '東京新大学野球リーグ', teamCount: 12, divisions: 2 },
  { id: 'chiba_ken', name: '千葉県大学野球リーグ', teamCount: 12, divisions: 2 },
  { id: 'kanagawa', name: '神奈川大学野球リーグ', teamCount: 6, divisions: 1 },
  // === 中部 ===
  { id: 'hokuriku', name: '北陸大学野球リーグ', teamCount: 6, divisions: 1 },
  { id: 'tokai', name: '東海地区大学野球リーグ', teamCount: 6, divisions: 1 },
  { id: 'aichi', name: '愛知大学野球リーグ', teamCount: 12, divisions: 2 },
  // === 関西 ===
  { id: 'keiji', name: '京滋大学野球リーグ', teamCount: 6, divisions: 1 },
  { id: 'kansai', name: '関西学生野球リーグ', teamCount: 6, divisions: 1 },
  { id: 'kansai_rk', name: '関西六大学野球リーグ', teamCount: 6, divisions: 1 },
  { id: 'hanshin', name: '阪神大学野球リーグ', teamCount: 6, divisions: 1 },
  { id: 'kinki', name: '近畿学生野球リーグ', teamCount: 6, divisions: 1 },
  // === 中国・四国 ===
  { id: 'hiroshima_rk', name: '広島六大学野球リーグ', teamCount: 6, divisions: 1 },
  { id: 'chugoku', name: '中国地区大学野球リーグ', teamCount: 12, divisions: 2 },
  { id: 'shikoku', name: '四国地区大学野球リーグ', teamCount: 6, divisions: 1 },
  // === 九州 ===
  { id: 'fukuoka_rk', name: '福岡六大学野球リーグ', teamCount: 6, divisions: 1 },
  { id: 'kyushu_rk', name: '九州六大学野球リーグ', teamCount: 6, divisions: 1 },
  { id: 'kyushu_area', name: '九州地区大学野球リーグ', teamCount: 6, divisions: 1 },
  { id: 'nanbu_kyushu', name: '南部九州大学野球リーグ', teamCount: 6, divisions: 1 },
];

// rank: S=超強豪, A=強豪, B=中堅, C=育成型, D=弱小
// specialties: 大学の得意な育成分野（ランク別: S=5, A=4, B=3, C=2, D=1）
// 7分野: technique(技巧), power(パワー), stamina(体力), defense(守備), versatility(適応), athletic(身体), mental(精神)
// specialtiesに含まれる分野は100%の成長ボーナス、含まれない分野は80%（低ランクはSPECIALTY_RANK_BOOSTで補正）
export const UNIVERSITY_TEAMS = [
  // ========== 東京六大学（固定制）==========
  { id: 1, name: '早稲田大学', region: 'tokyo_big6', rank: 'S', budget: 90, specialties: ['technique', 'power', 'defense', 'mental', 'stamina'] },
  { id: 2, name: '慶應義塾大学', region: 'tokyo_big6', rank: 'S', budget: 90, specialties: ['technique', 'mental', 'defense', 'versatility', 'athletic'] },
  { id: 3, name: '明治大学', region: 'tokyo_big6', rank: 'S', budget: 85, specialties: ['power', 'technique', 'athletic', 'stamina', 'defense'] },
  { id: 4, name: '法政大学', region: 'tokyo_big6', rank: 'A', budget: 80, specialties: ['power', 'athletic', 'technique', 'stamina'] },
  { id: 5, name: '立教大学', region: 'tokyo_big6', rank: 'A', budget: 75, specialties: ['technique', 'mental', 'defense', 'versatility'] },
  { id: 6, name: '東京大学', region: 'tokyo_big6', rank: 'D', budget: 60, specialties: ['mental'] },

  // ========== 東都大学 1部（入替制）==========
  { id: 7, name: '亜細亜大学', region: 'tokyoto', rank: 'S', budget: 85, specialties: ['defense', 'athletic', 'technique', 'stamina', 'mental'] },
  { id: 8, name: '東洋大学', region: 'tokyoto', rank: 'S', budget: 85, specialties: ['technique', 'defense', 'power', 'athletic', 'versatility'] },
  { id: 9, name: '駒澤大学', region: 'tokyoto', rank: 'A', budget: 75, specialties: ['athletic', 'defense', 'technique', 'stamina'] },
  { id: 10, name: '中央大学', region: 'tokyoto', rank: 'A', budget: 75, specialties: ['technique', 'defense', 'mental', 'versatility'] },
  { id: 11, name: '國學院大學', region: 'tokyoto', rank: 'A', budget: 70, specialties: ['technique', 'power', 'mental', 'athletic'] },
  { id: 12, name: '青山学院大学', region: 'tokyoto', rank: 'B', budget: 65, specialties: ['athletic', 'defense', 'mental'] },

  // ========== 東都大学 2部（入替制）==========
  { id: 13, name: '日本大学', region: 'tokyoto', rank: 'A', budget: 70, specialties: ['power', 'athletic', 'stamina', 'technique'] },
  { id: 14, name: '専修大学', region: 'tokyoto', rank: 'B', budget: 60, specialties: ['defense', 'technique', 'mental'] },
  { id: 15, name: '立正大学', region: 'tokyoto', rank: 'B', budget: 55, specialties: ['technique', 'defense', 'versatility'] },
  { id: 16, name: '国士舘大学', region: 'tokyoto', rank: 'C', budget: 50, specialties: ['athletic', 'power'] },
  { id: 17, name: '東京農業大学', region: 'tokyoto', rank: 'C', budget: 45, specialties: ['stamina', 'defense'] },
  { id: 18, name: '拓殖大学', region: 'tokyoto', rank: 'C', budget: 45, specialties: ['athletic', 'power'] },

  // ========== 首都大学 1部（入替制）==========
  { id: 19, name: '東海大学', region: 'shuto', rank: 'S', budget: 85, specialties: ['power', 'athletic', 'stamina', 'defense', 'technique'] },
  { id: 20, name: '日本体育大学', region: 'shuto', rank: 'A', budget: 75, specialties: ['athletic', 'power', 'stamina', 'defense'] },
  { id: 21, name: '筑波大学', region: 'shuto', rank: 'A', budget: 70, specialties: ['technique', 'defense', 'mental', 'versatility'] },
  { id: 22, name: '帝京大学', region: 'shuto', rank: 'B', budget: 60, specialties: ['power', 'stamina', 'athletic'] },
  { id: 23, name: '桜美林大学', region: 'shuto', rank: 'B', budget: 60, specialties: ['technique', 'defense', 'mental'] },
  { id: 24, name: '城西大学', region: 'shuto', rank: 'C', budget: 50, specialties: ['athletic', 'stamina'] },

  // ========== 東京新大学 1部（入替制）==========
  { id: 25, name: '創価大学', region: 'tokyo_new', rank: 'B', budget: 55, specialties: ['technique', 'mental', 'versatility'] },
  { id: 26, name: '東京国際大学', region: 'tokyo_new', rank: 'B', budget: 55, specialties: ['athletic', 'defense', 'stamina'] },
  { id: 27, name: '流通経済大学', region: 'tokyo_new', rank: 'B', budget: 55, specialties: ['athletic', 'power', 'stamina'] },
  { id: 28, name: '駿河台大学', region: 'tokyo_new', rank: 'C', budget: 45, specialties: ['defense', 'athletic'] },
  { id: 29, name: '杏林大学', region: 'tokyo_new', rank: 'C', budget: 45, specialties: ['mental', 'technique'] },
  { id: 30, name: '共栄大学', region: 'tokyo_new', rank: 'C', budget: 45, specialties: ['stamina', 'athletic'] },

  // ========== 千葉県大学 1部（入替制）==========
  { id: 31, name: '国際武道大学', region: 'chiba_ken', rank: 'B', budget: 55, specialties: ['defense', 'athletic', 'stamina'] },
  { id: 32, name: '中央学院大学', region: 'chiba_ken', rank: 'B', budget: 55, specialties: ['technique', 'mental', 'versatility'] },
  { id: 33, name: '城西国際大学', region: 'chiba_ken', rank: 'C', budget: 45, specialties: ['athletic', 'power'] },
  { id: 34, name: '東京情報大学', region: 'chiba_ken', rank: 'C', budget: 45, specialties: ['technique', 'mental'] },
  { id: 35, name: '千葉経済大学', region: 'chiba_ken', rank: 'C', budget: 40, specialties: ['technique', 'defense'] },
  { id: 36, name: '清和大学', region: 'chiba_ken', rank: 'D', budget: 35, specialties: ['stamina'] },

  // ========== 神奈川大学 1部（入替制）==========
  { id: 37, name: '桐蔭横浜大学', region: 'kanagawa', rank: 'A', budget: 70, specialties: ['technique', 'power', 'athletic', 'defense'] },
  { id: 38, name: '神奈川大学', region: 'kanagawa', rank: 'B', budget: 60, specialties: ['technique', 'power', 'mental'] },
  { id: 39, name: '関東学院大学', region: 'kanagawa', rank: 'B', budget: 55, specialties: ['defense', 'athletic', 'versatility'] },
  { id: 40, name: '横浜商科大学', region: 'kanagawa', rank: 'C', budget: 45, specialties: ['power', 'athletic'] },
  { id: 41, name: '神奈川工科大学', region: 'kanagawa', rank: 'C', budget: 45, specialties: ['stamina', 'defense'] },
  { id: 42, name: '横浜国立大学', region: 'kanagawa', rank: 'D', budget: 40, specialties: ['mental'] },

  // ========== 関甲新 1部（入替制）==========
  { id: 43, name: '上武大学', region: 'kankoshin', rank: 'A', budget: 70, specialties: ['power', 'stamina', 'athletic', 'technique'] },
  { id: 44, name: '白鷗大学', region: 'kankoshin', rank: 'B', budget: 55, specialties: ['athletic', 'defense', 'technique'] },
  { id: 45, name: '山梨学院大学', region: 'kankoshin', rank: 'B', budget: 55, specialties: ['technique', 'power', 'athletic'] },
  { id: 199, name: '平成国際大学', region: 'kankoshin', rank: 'B', budget: 55, specialties: ['power', 'athletic', 'stamina'] },
  { id: 200, name: '関東学園大学', region: 'kankoshin', rank: 'C', budget: 45, specialties: ['athletic', 'defense'] },
  { id: 129, name: '常磐大学', region: 'kankoshin', rank: 'C', budget: 40, specialties: ['technique', 'athletic'] },

  // ========== 北海道学生（入替制）==========
  { id: 91, name: '東農大北海道オホーツク', region: 'hokkaido', rank: 'A', budget: 70, specialties: ['power', 'stamina', 'athletic', 'technique'] },
  { id: 92, name: '函館大学', region: 'hokkaido', rank: 'B', budget: 55, specialties: ['stamina', 'athletic', 'defense'] },
  { id: 93, name: '旭川市立大学', region: 'hokkaido', rank: 'C', budget: 45, specialties: ['defense', 'athletic'] },
  { id: 94, name: '釧路公立大学', region: 'hokkaido', rank: 'C', budget: 40, specialties: ['stamina', 'athletic'] },
  { id: 95, name: '帯広畜産大学', region: 'hokkaido', rank: 'D', budget: 35, specialties: ['stamina'] },
  { id: 96, name: '北洋大学', region: 'hokkaido', rank: 'B', budget: 55, specialties: ['power', 'athletic', 'stamina'] },

  // ========== 北東北大学（入替制）==========
  { id: 49, name: '富士大学', region: 'tohoku_n', rank: 'A', budget: 65, specialties: ['power', 'technique', 'stamina', 'athletic'] },
  { id: 50, name: '八戸学院大学', region: 'tohoku_n', rank: 'B', budget: 55, specialties: ['athletic', 'defense', 'technique'] },
  { id: 51, name: 'ノースアジア大学', region: 'tohoku_n', rank: 'C', budget: 45, specialties: ['athletic', 'defense'] },
  { id: 52, name: '青森大学', region: 'tohoku_n', rank: 'C', budget: 45, specialties: ['athletic', 'power'] },
  { id: 53, name: '盛岡大学', region: 'tohoku_n', rank: 'C', budget: 40, specialties: ['defense', 'technique'] },
  { id: 54, name: '岩手大学', region: 'tohoku_n', rank: 'D', budget: 35, specialties: ['technique'] },

  // ========== 仙台六大学（固定制）==========
  { id: 55, name: '東北福祉大学', region: 'tohoku', rank: 'S', budget: 85, specialties: ['technique', 'defense', 'mental', 'athletic', 'stamina'] },
  { id: 56, name: '仙台大学', region: 'tohoku', rank: 'B', budget: 55, specialties: ['athletic', 'technique', 'power'] },
  { id: 57, name: '東北学院大学', region: 'tohoku', rank: 'C', budget: 45, specialties: ['defense', 'technique'] },
  { id: 58, name: '東北工業大学', region: 'tohoku', rank: 'C', budget: 40, specialties: ['athletic', 'technique'] },
  { id: 59, name: '東北大学', region: 'tohoku', rank: 'D', budget: 40, specialties: ['mental'] },
  { id: 60, name: '宮城教育大学', region: 'tohoku', rank: 'D', budget: 35, specialties: ['defense'] },

  // ========== 愛知大学 1部（入替制）==========
  { id: 61, name: '中京大学', region: 'aichi', rank: 'A', budget: 75, specialties: ['technique', 'power', 'athletic', 'stamina'] },
  { id: 62, name: '愛知学院大学', region: 'aichi', rank: 'B', budget: 60, specialties: ['technique', 'power', 'mental'] },
  { id: 63, name: '愛知工業大学', region: 'aichi', rank: 'B', budget: 55, specialties: ['power', 'athletic', 'stamina'] },
  { id: 64, name: '名城大学', region: 'aichi', rank: 'B', budget: 60, specialties: ['defense', 'technique', 'mental'] },
  { id: 65, name: '中部大学', region: 'aichi', rank: 'B', budget: 55, specialties: ['technique', 'defense', 'versatility'] },
  { id: 66, name: '愛知東邦大学', region: 'aichi', rank: 'C', budget: 45, specialties: ['athletic', 'defense'] },

  // ========== 関西学生（固定制）==========
  { id: 67, name: '近畿大学', region: 'kansai', rank: 'S', budget: 85, specialties: ['power', 'technique', 'athletic', 'stamina', 'defense'] },
  { id: 68, name: '同志社大学', region: 'kansai', rank: 'A', budget: 75, specialties: ['technique', 'mental', 'defense', 'versatility'] },
  { id: 69, name: '立命館大学', region: 'kansai', rank: 'A', budget: 75, specialties: ['power', 'technique', 'athletic', 'stamina'] },
  { id: 70, name: '関西学院大学', region: 'kansai', rank: 'A', budget: 70, specialties: ['technique', 'defense', 'mental', 'versatility'] },
  { id: 71, name: '関西大学', region: 'kansai', rank: 'A', budget: 70, specialties: ['technique', 'power', 'mental', 'athletic'] },
  { id: 72, name: '京都大学', region: 'kansai', rank: 'D', budget: 55, specialties: ['mental'] },

  // ========== 関西六大学（固定制）==========
  { id: 73, name: '大阪商業大学', region: 'kansai_rk', rank: 'A', budget: 70, specialties: ['power', 'technique', 'athletic', 'mental'] },
  { id: 74, name: '京都産業大学', region: 'kansai_rk', rank: 'A', budget: 70, specialties: ['athletic', 'defense', 'technique', 'stamina'] },
  { id: 75, name: '龍谷大学', region: 'kansai_rk', rank: 'B', budget: 55, specialties: ['technique', 'mental', 'defense'] },
  { id: 76, name: '大阪経済大学', region: 'kansai_rk', rank: 'B', budget: 55, specialties: ['power', 'athletic', 'technique'] },
  { id: 77, name: '大阪学院大学', region: 'kansai_rk', rank: 'C', budget: 45, specialties: ['technique', 'mental'] },
  { id: 78, name: '神戸学院大学', region: 'kansai_rk', rank: 'C', budget: 45, specialties: ['technique', 'defense'] },

  // ========== 広島六大学（固定制）==========
  { id: 79, name: '広島経済大学', region: 'hiroshima_rk', rank: 'B', budget: 55, specialties: ['technique', 'mental', 'power'] },
  { id: 80, name: '広島修道大学', region: 'hiroshima_rk', rank: 'B', budget: 55, specialties: ['defense', 'technique', 'athletic'] },
  { id: 81, name: '広島工業大学', region: 'hiroshima_rk', rank: 'C', budget: 45, specialties: ['stamina', 'athletic'] },
  { id: 82, name: '広島国際大学', region: 'hiroshima_rk', rank: 'C', budget: 40, specialties: ['technique', 'athletic'] },
  { id: 83, name: '近畿大学工学部', region: 'hiroshima_rk', rank: 'C', budget: 45, specialties: ['power', 'technique'] },
  { id: 84, name: '広島大学', region: 'hiroshima_rk', rank: 'D', budget: 40, specialties: ['defense'] },

  // ========== 京滋大学（入替制）==========
  { id: 97, name: '佛教大学', region: 'keiji', rank: 'A', budget: 70, specialties: ['technique', 'defense', 'mental', 'versatility'] },
  { id: 98, name: 'びわこ成蹊スポーツ大学', region: 'keiji', rank: 'B', budget: 55, specialties: ['athletic', 'power', 'stamina'] },
  { id: 99, name: '花園大学', region: 'keiji', rank: 'B', budget: 55, specialties: ['defense', 'technique', 'mental'] },
  { id: 100, name: '京都先端科学大学', region: 'keiji', rank: 'C', budget: 45, specialties: ['mental', 'technique'] },
  { id: 101, name: '大谷大学', region: 'keiji', rank: 'C', budget: 40, specialties: ['technique', 'stamina'] },
  { id: 102, name: '京都教育大学', region: 'keiji', rank: 'D', budget: 35, specialties: ['technique'] },

  // ========== 福岡六大学（固定制）==========
  { id: 85, name: '九州産業大学', region: 'fukuoka_rk', rank: 'A', budget: 70, specialties: ['power', 'athletic', 'technique', 'stamina'] },
  { id: 86, name: '九州共立大学', region: 'fukuoka_rk', rank: 'B', budget: 55, specialties: ['technique', 'power', 'athletic'] },
  { id: 87, name: '福岡工業大学', region: 'fukuoka_rk', rank: 'C', budget: 45, specialties: ['stamina', 'defense'] },
  { id: 88, name: '日本経済大学', region: 'fukuoka_rk', rank: 'C', budget: 45, specialties: ['technique', 'athletic'] },
  { id: 89, name: '福岡教育大学', region: 'fukuoka_rk', rank: 'D', budget: 35, specialties: ['mental'] },
  { id: 90, name: '九州工業大学', region: 'fukuoka_rk', rank: 'D', budget: 35, specialties: ['athletic'] },

  // ========== 首都大学 2部 ==========
  { id: 103, name: '武蔵大学', region: 'shuto', rank: 'C', budget: 45, specialties: ['technique', 'mental'] },
  { id: 104, name: '大東文化大学', region: 'shuto', rank: 'C', budget: 45, specialties: ['athletic', 'power'] },
  { id: 105, name: '明星大学', region: 'shuto', rank: 'C', budget: 40, specialties: ['defense', 'stamina'] },
  { id: 106, name: '成蹊大学', region: 'shuto', rank: 'D', budget: 40, specialties: ['mental'] },
  { id: 107, name: '玉川大学', region: 'shuto', rank: 'D', budget: 35, specialties: ['technique'] },
  { id: 108, name: '東京経済大学', region: 'shuto', rank: 'D', budget: 35, specialties: ['mental'] },

  // ========== 東京新大学 2部 ==========
  { id: 109, name: '東京工科大学', region: 'tokyo_new', rank: 'C', budget: 40, specialties: ['technique', 'defense'] },
  { id: 110, name: '東京工芸大学', region: 'tokyo_new', rank: 'C', budget: 40, specialties: ['athletic', 'stamina'] },
  { id: 111, name: '嘉悦大学', region: 'tokyo_new', rank: 'D', budget: 35, specialties: ['athletic'] },
  { id: 112, name: '明治学院大学', region: 'tokyo_new', rank: 'C', budget: 45, specialties: ['mental', 'defense'] },
  { id: 113, name: '東京成徳大学', region: 'tokyo_new', rank: 'D', budget: 35, specialties: ['technique'] },
  { id: 114, name: '尚美学園大学', region: 'tokyo_new', rank: 'D', budget: 35, specialties: ['versatility'] },

  // ========== 千葉県大学 2部 ==========
  { id: 115, name: '千葉商科大学', region: 'chiba_ken', rank: 'C', budget: 40, specialties: ['technique', 'mental'] },
  { id: 116, name: '千葉工業大学', region: 'chiba_ken', rank: 'C', budget: 40, specialties: ['stamina', 'athletic'] },
  { id: 117, name: '敬愛大学', region: 'chiba_ken', rank: 'D', budget: 35, specialties: ['defense'] },
  { id: 118, name: '千葉大学', region: 'chiba_ken', rank: 'D', budget: 40, specialties: ['mental'] },
  { id: 119, name: '淑徳大学', region: 'chiba_ken', rank: 'D', budget: 35, specialties: ['technique'] },
  { id: 120, name: '明海大学', region: 'chiba_ken', rank: 'D', budget: 35, specialties: ['athletic'] },

  // ========== 関甲新学生 2部 ==========
  { id: 47, name: '作新学院大学', region: 'kankoshin', rank: 'C', budget: 45, specialties: ['defense', 'athletic'] },
  { id: 46, name: '新潟医療福祉大学', region: 'kankoshin', rank: 'C', budget: 45, specialties: ['stamina', 'defense'] },
  { id: 128, name: '松本大学', region: 'kankoshin', rank: 'C', budget: 40, specialties: ['stamina', 'defense'] },
  { id: 201, name: '高崎経済大学', region: 'kankoshin', rank: 'D', budget: 35, specialties: ['mental'] },
  { id: 202, name: '宇都宮大学', region: 'kankoshin', rank: 'D', budget: 35, specialties: ['technique'] },
  { id: 132, name: '信州大学', region: 'kankoshin', rank: 'D', budget: 40, specialties: ['stamina'] },

  // ========== 愛知大学 2部 ==========
  { id: 133, name: '名古屋商科大学', region: 'aichi', rank: 'B', budget: 55, specialties: ['technique', 'power', 'mental'] },
  { id: 134, name: '名古屋学院大学', region: 'aichi', rank: 'C', budget: 45, specialties: ['athletic', 'defense'] },
  { id: 135, name: '東海学園大学', region: 'aichi', rank: 'C', budget: 45, specialties: ['technique', 'stamina'] },
  { id: 136, name: '名古屋大学', region: 'aichi', rank: 'D', budget: 40, specialties: ['mental'] },
  { id: 137, name: '日本福祉大学', region: 'aichi', rank: 'C', budget: 40, specialties: ['defense', 'versatility'] },
  { id: 138, name: '南山大学', region: 'aichi', rank: 'D', budget: 40, specialties: ['mental'] },

  // ========== 阪神大学 1部（新規リーグ）==========
  { id: 139, name: '天理大学', region: 'hanshin', rank: 'A', budget: 70, specialties: ['athletic', 'power', 'defense', 'stamina'] },
  { id: 140, name: '大阪体育大学', region: 'hanshin', rank: 'B', budget: 55, specialties: ['athletic', 'stamina', 'power'] },
  { id: 141, name: '大阪産業大学', region: 'hanshin', rank: 'B', budget: 55, specialties: ['power', 'technique', 'athletic'] },
  { id: 142, name: '甲南大学', region: 'hanshin', rank: 'C', budget: 45, specialties: ['technique', 'mental'] },
  { id: 143, name: '大阪電気通信大学', region: 'hanshin', rank: 'C', budget: 40, specialties: ['stamina', 'defense'] },
  { id: 144, name: '関西国際大学', region: 'hanshin', rank: 'C', budget: 45, specialties: ['versatility', 'athletic'] },

  // ========== 近畿学生 1部（新規リーグ）==========
  { id: 145, name: '奈良学園大学', region: 'kinki', rank: 'C', budget: 45, specialties: ['defense', 'technique'] },
  { id: 146, name: '大阪大谷大学', region: 'kinki', rank: 'C', budget: 45, specialties: ['technique', 'stamina'] },
  { id: 147, name: '帝塚山大学', region: 'kinki', rank: 'C', budget: 45, specialties: ['athletic', 'defense'] },
  { id: 148, name: '和歌山大学', region: 'kinki', rank: 'D', budget: 40, specialties: ['mental'] },
  { id: 149, name: '大阪工業大学', region: 'kinki', rank: 'C', budget: 40, specialties: ['power', 'stamina'] },
  { id: 150, name: '摂南大学', region: 'kinki', rank: 'C', budget: 45, specialties: ['technique', 'versatility'] },

  // ========== 四国地区大学（新規リーグ）==========
  { id: 151, name: '四国学院大学', region: 'shikoku', rank: 'B', budget: 55, specialties: ['athletic', 'technique', 'defense'] },
  { id: 152, name: '松山大学', region: 'shikoku', rank: 'C', budget: 45, specialties: ['technique', 'mental'] },
  { id: 153, name: '高知大学', region: 'shikoku', rank: 'C', budget: 40, specialties: ['stamina', 'athletic'] },
  { id: 154, name: '徳島大学', region: 'shikoku', rank: 'D', budget: 35, specialties: ['mental'] },
  { id: 155, name: '香川大学', region: 'shikoku', rank: 'D', budget: 35, specialties: ['defense'] },
  { id: 156, name: '高知工科大学', region: 'shikoku', rank: 'D', budget: 35, specialties: ['technique'] },

  // ========== 九州六大学（新規リーグ）==========
  { id: 157, name: '西南学院大学', region: 'kyushu_rk', rank: 'B', budget: 55, specialties: ['technique', 'mental', 'defense'] },
  { id: 158, name: '福岡大学', region: 'kyushu_rk', rank: 'B', budget: 55, specialties: ['athletic', 'power', 'stamina'] },
  { id: 159, name: '久留米大学', region: 'kyushu_rk', rank: 'C', budget: 45, specialties: ['technique', 'defense'] },
  { id: 160, name: '九州大学', region: 'kyushu_rk', rank: 'D', budget: 40, specialties: ['mental'] },
  { id: 161, name: '北九州市立大学', region: 'kyushu_rk', rank: 'D', budget: 35, specialties: ['athletic'] },
  { id: 162, name: '九州国際大学', region: 'kyushu_rk', rank: 'C', budget: 45, specialties: ['power', 'athletic'] },

  // ========== 九州地区大学（入替制）==========
  { id: 163, name: '日本文理大学', region: 'kyushu_area', rank: 'B', budget: 55, specialties: ['power', 'athletic', 'technique'] },
  { id: 164, name: '別府大学', region: 'kyushu_area', rank: 'C', budget: 45, specialties: ['defense', 'stamina'] },
  { id: 167, name: '長崎国際大学', region: 'kyushu_area', rank: 'D', budget: 35, specialties: ['versatility'] },
  { id: 213, name: '長崎総合科学大学', region: 'kyushu_area', rank: 'D', budget: 35, specialties: ['technique'] },
  { id: 214, name: '大分大学', region: 'kyushu_area', rank: 'D', budget: 40, specialties: ['mental'] },
  { id: 215, name: '佐賀大学', region: 'kyushu_area', rank: 'D', budget: 35, specialties: ['stamina'] },

  // ========== 南部九州大学（入替制）==========
  { id: 166, name: '東海大学九州', region: 'nanbu_kyushu', rank: 'A', budget: 70, specialties: ['technique', 'athletic', 'power', 'stamina'] },
  { id: 165, name: '鹿屋体育大学', region: 'nanbu_kyushu', rank: 'B', budget: 55, specialties: ['athletic', 'stamina', 'power'] },
  { id: 168, name: '宮崎産業経営大学', region: 'nanbu_kyushu', rank: 'C', budget: 45, specialties: ['athletic', 'technique'] },
  { id: 216, name: '沖縄大学', region: 'nanbu_kyushu', rank: 'C', budget: 45, specialties: ['athletic', 'defense'] },
  { id: 217, name: '志學館大学', region: 'nanbu_kyushu', rank: 'C', budget: 45, specialties: ['technique', 'mental'] },
  { id: 218, name: '琉球大学', region: 'nanbu_kyushu', rank: 'D', budget: 40, specialties: ['mental'] },

  // ========== 札幌学生（新規リーグ）==========
  { id: 169, name: '北海学園大学', region: 'sapporo', rank: 'B', budget: 55, specialties: ['technique', 'defense', 'mental'] },
  { id: 170, name: '札幌大学', region: 'sapporo', rank: 'C', budget: 45, specialties: ['athletic', 'stamina'] },
  { id: 171, name: '北星学園大学', region: 'sapporo', rank: 'C', budget: 45, specialties: ['technique', 'mental'] },
  { id: 172, name: '北海道教育大学札幌', region: 'sapporo', rank: 'D', budget: 35, specialties: ['mental'] },
  { id: 173, name: '酪農学園大学', region: 'sapporo', rank: 'D', budget: 35, specialties: ['stamina'] },
  { id: 174, name: '札幌国際大学', region: 'sapporo', rank: 'D', budget: 35, specialties: ['athletic'] },

  // ========== 南東北大学（新規リーグ）==========
  { id: 175, name: '東日本国際大学', region: 'tohoku_s', rank: 'B', budget: 55, specialties: ['power', 'athletic', 'technique'] },
  { id: 176, name: '石巻専修大学', region: 'tohoku_s', rank: 'C', budget: 45, specialties: ['defense', 'stamina'] },
  { id: 177, name: '福島大学', region: 'tohoku_s', rank: 'D', budget: 40, specialties: ['mental'] },
  { id: 178, name: '医療創生大学', region: 'tohoku_s', rank: 'D', budget: 35, specialties: ['athletic'] },
  { id: 179, name: '山形大学', region: 'tohoku_s', rank: 'D', budget: 35, specialties: ['stamina'] },
  { id: 180, name: '東北公益文科大学', region: 'tohoku_s', rank: 'D', budget: 35, specialties: ['mental'] },

  // ========== 東海地区大学（入替制）==========
  { id: 181, name: '常葉大学', region: 'tokai', rank: 'B', budget: 55, specialties: ['technique', 'athletic', 'defense'] },
  { id: 203, name: '中部学院大学', region: 'tokai', rank: 'C', budget: 45, specialties: ['defense', 'technique'] },
  { id: 204, name: '朝日大学', region: 'tokai', rank: 'B', budget: 55, specialties: ['power', 'athletic', 'technique'] },
  { id: 182, name: '静岡大学', region: 'tokai', rank: 'C', budget: 45, specialties: ['mental', 'technique'] },
  { id: 183, name: '岐阜聖徳学園大学', region: 'tokai', rank: 'C', budget: 45, specialties: ['defense', 'stamina'] },
  { id: 184, name: '皇學館大学', region: 'tokai', rank: 'C', budget: 45, specialties: ['mental', 'technique'] },

  // ========== 北陸大学（新規リーグ）==========
  { id: 187, name: '福井工業大学', region: 'hokuriku', rank: 'B', budget: 55, specialties: ['power', 'stamina', 'athletic'] },
  { id: 188, name: '金沢学院大学', region: 'hokuriku', rank: 'B', budget: 55, specialties: ['technique', 'defense', 'athletic'] },
  { id: 189, name: '金沢星稜大学', region: 'hokuriku', rank: 'C', budget: 45, specialties: ['technique', 'mental'] },
  { id: 190, name: '富山大学', region: 'hokuriku', rank: 'D', budget: 35, specialties: ['mental'] },
  { id: 191, name: '新潟大学', region: 'hokuriku', rank: 'D', budget: 35, specialties: ['stamina'] },
  { id: 192, name: '北陸大学', region: 'hokuriku', rank: 'C', budget: 45, specialties: ['athletic', 'defense'] },

  // ========== 中国地区大学 1部（入替制）==========
  { id: 193, name: '環太平洋大学', region: 'chugoku', rank: 'A', budget: 70, specialties: ['athletic', 'power', 'stamina', 'defense'] },
  { id: 194, name: '東亜大学', region: 'chugoku', rank: 'B', budget: 55, specialties: ['power', 'athletic', 'technique'] },
  { id: 195, name: '吉備国際大学', region: 'chugoku', rank: 'C', budget: 45, specialties: ['defense', 'technique'] },
  { id: 205, name: '周南公立大学', region: 'chugoku', rank: 'C', budget: 45, specialties: ['defense', 'technique'] },
  { id: 206, name: '至誠館大学', region: 'chugoku', rank: 'D', budget: 35, specialties: ['athletic'] },
  { id: 207, name: '広島文化学園大学', region: 'chugoku', rank: 'C', budget: 40, specialties: ['technique', 'defense'] },

  // ========== 中国地区大学 2部 ==========
  { id: 208, name: '岡山商科大学', region: 'chugoku', rank: 'C', budget: 45, specialties: ['technique', 'mental'] },
  { id: 209, name: '岡山理科大学', region: 'chugoku', rank: 'C', budget: 45, specialties: ['technique', 'athletic'] },
  { id: 210, name: '福山大学', region: 'chugoku', rank: 'C', budget: 40, specialties: ['stamina', 'defense'] },
  { id: 197, name: '島根大学', region: 'chugoku', rank: 'D', budget: 35, specialties: ['mental'] },
  { id: 211, name: '鳥取大学', region: 'chugoku', rank: 'D', budget: 35, specialties: ['mental'] },
  { id: 212, name: '岡山大学', region: 'chugoku', rank: 'D', budget: 40, specialties: ['mental'] },
];

// ============================================================
// 得意分野の定義
// ============================================================

export const SPECIALTY_LABELS = {
  technique: '技巧',
  power: 'パワー',
  stamina: '体力',
  defense: '守備',
  versatility: '適応',
  athletic: '身体',
  mental: '精神',
};

export const SPECIALTY_ICONS = {
  technique: '🎯', power: '💥', stamina: '💪',
  defense: '🛡️', versatility: '🔄', athletic: '⚡', mental: '🧠',
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
  S: 1.55,
  A: 1.35,
  B: 1.15,
  C: 1.00,
  D: 0.85,
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
 * 7分野: technique, power, stamina, defense, versatility, athletic, mental
 * specialtiesに含まれる分野は100%成長、含まれない分野は80%（SPECIALTY_RANK_BOOSTで補正）
 */
export function getUniversitySpecialties(universityId) {
  const team = UNIVERSITY_TEAMS.find(t => t.id === universityId);
  return team?.specialties || [];
}

/**
 * 指定した得意分野キーが大学の得意分野に含まれるか判定する
 * stat→specialty のマッピングは呼び出し側（dispatchSystem等）で行うこと
 */
export function hasUniversitySpecialty(universityId, specialtyKey) {
  const specialties = getUniversitySpecialties(universityId);
  if (specialties.length === 0) return true; // 得意分野未定義ならすべてOK
  return specialties.includes(specialtyKey);
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
