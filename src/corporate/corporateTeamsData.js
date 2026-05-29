// ============================================================
// 社会人野球 全チームデータ（企業チーム＋クラブチーム / 12地区連盟）
// ============================================================

export const REGIONS = [
  { id: 'hokkaido', name: '北海道', teamCount: 0 },
  { id: 'tohoku', name: '東北', teamCount: 0 },
  { id: 'kitakanto', name: '北関東', teamCount: 0 },
  { id: 'minamikanto', name: '南関東', teamCount: 0 },
  { id: 'tokyo', name: '東京', teamCount: 0 },
  { id: 'kanagawa', name: '西関東', teamCount: 0 },
  { id: 'hokushinetsu', name: '北信越', teamCount: 0 },
  { id: 'tokai', name: '東海', teamCount: 0 },
  { id: 'kinki', name: '近畿', teamCount: 0 },
  { id: 'chugoku', name: '中国', teamCount: 0 },
  { id: 'shikoku', name: '四国', teamCount: 0 },
  { id: 'kyushu', name: '九州', teamCount: 0 },
];

// type: 'corporate'=企業チーム, 'club'=クラブチーム
// rank: S=超強豪, A=強豪, B=中堅, C=育成型, D=弱小
export const CORPORATE_TEAMS = [
  // ========== 北海道 (企業3 + クラブ16 = 19) ==========
  { id: 1, name: '日本製鉄室蘭シャークス', city: '室蘭', region: 'hokkaido', type: 'corporate', rank: 'B', budget: 50 },
  { id: 2, name: '北海道ガス', city: '札幌', region: 'hokkaido', type: 'corporate', rank: 'B', budget: 50 },
  { id: 3, name: 'JR北海道', city: '札幌', region: 'hokkaido', type: 'club', rank: 'B', budget: 50 },
  { id: 4, name: '航空自衛隊千歳', city: '千歳', region: 'hokkaido', type: 'corporate', rank: 'C', budget: 35 },
  { id: 5, name: '札幌ホーネッツ', city: '札幌', region: 'hokkaido', type: 'club', rank: 'C', budget: 35 },
  { id: 6, name: 'TRANSYS', city: '千歳', region: 'hokkaido', type: 'club', rank: 'D', budget: 20 },
  { id: 7, name: 'WEEDしらおい', city: '白老', region: 'hokkaido', type: 'club', rank: 'D', budget: 20 },
  { id: 8, name: 'ウイン北広島', city: '北広島', region: 'hokkaido', type: 'club', rank: 'D', budget: 20 },
  { id: 9, name: 'オール苫小牧', city: '苫小牧', region: 'hokkaido', type: 'club', rank: 'D', budget: 20 },
  { id: 10, name: 'トッキュウブルーローズ', city: '岩見沢', region: 'hokkaido', type: 'club', rank: 'D', budget: 20 },
  { id: 11, name: 'ブレーブくしろ', city: '釧路', region: 'hokkaido', type: 'club', rank: 'D', budget: 20 },
  { id: 12, name: '旭川グレートベアーズ', city: '旭川', region: 'hokkaido', type: 'club', rank: 'D', budget: 20 },
  { id: 13, name: '伊達ウォリアーズ', city: '伊達', region: 'hokkaido', type: 'club', rank: 'D', budget: 20 },
  { id: 14, name: '札幌倶楽部', city: '札幌', region: 'hokkaido', type: 'club', rank: 'D', budget: 20 },
  { id: 15, name: '小樽野球協会', city: '小樽', region: 'hokkaido', type: 'club', rank: 'D', budget: 20 },
  { id: 16, name: '帯広倶楽部VICROSS', city: '帯広', region: 'hokkaido', type: 'club', rank: 'D', budget: 20 },
  { id: 17, name: '東北海道サンライズ', city: '釧路', region: 'hokkaido', type: 'club', rank: 'D', budget: 20 },
  { id: 18, name: '函館太洋倶楽部', city: '函館', region: 'hokkaido', type: 'club', rank: 'D', budget: 20 },
  { id: 19, name: '北海ブルーウェーブ', city: '恵庭', region: 'hokkaido', type: 'club', rank: 'D', budget: 20 },

  // ========== 東北 (企業9 + クラブ22 = 31) ==========
  { id: 20, name: 'JR東日本東北', city: '仙台', region: 'tohoku', type: 'corporate', rank: 'A', budget: 70 },
  { id: 21, name: 'TDK', city: 'にかほ', region: 'tohoku', type: 'corporate', rank: 'A', budget: 55 },
  { id: 22, name: '七十七銀行', city: '仙台', region: 'tohoku', type: 'corporate', rank: 'B', budget: 50 },
  { id: 23, name: '日本製紙石巻', city: '石巻', region: 'tohoku', type: 'corporate', rank: 'B', budget: 55 },
  { id: 24, name: 'JR秋田', city: '秋田', region: 'tohoku', type: 'corporate', rank: 'C', budget: 15 },
  { id: 25, name: 'JR盛岡', city: '盛岡', region: 'tohoku', type: 'corporate', rank: 'C', budget: 20 },
  { id: 26, name: 'トヨタ自動車東日本', city: '金ケ崎', region: 'tohoku', type: 'corporate', rank: 'C', budget: 75 },
  { id: 27, name: 'マルハン北日本', city: '仙台', region: 'tohoku', type: 'corporate', rank: 'C', budget: 15 },
  { id: 28, name: '自衛隊青森', city: '青森', region: 'tohoku', type: 'corporate', rank: 'C', budget: 35 },
  { id: 29, name: 'エフコムBC', city: '伊達', region: 'tohoku', type: 'club', rank: 'C', budget: 18 },
  { id: 30, name: 'ゴールデンリバース', city: '秋田', region: 'tohoku', type: 'club', rank: 'C', budget: 35 },
  { id: 31, name: '東北マークス', city: '仙台', region: 'tohoku', type: 'club', rank: 'C', budget: 15 },
  { id: 32, name: 'ALL北嶺', city: '会津若松', region: 'tohoku', type: 'club', rank: 'D', budget: 20 },
  { id: 33, name: 'B-net/yamagata', city: '山形', region: 'tohoku', type: 'club', rank: 'D', budget: 20 },
  { id: 34, name: 'いわき菊田クラブ', city: 'いわき', region: 'tohoku', type: 'club', rank: 'D', budget: 20 },
  { id: 35, name: 'オールいわきクラブ', city: 'いわき', region: 'tohoku', type: 'club', rank: 'D', budget: 12 },
  { id: 36, name: 'オール江刺', city: '奥州', region: 'tohoku', type: 'club', rank: 'D', budget: 20 },
  { id: 37, name: 'キングブリザード', city: '五所川原', region: 'tohoku', type: 'club', rank: 'D', budget: 20 },
  { id: 38, name: '一関BC', city: '一関', region: 'tohoku', type: 'club', rank: 'D', budget: 20 },
  { id: 39, name: '釜石野球団', city: '釜石', region: 'tohoku', type: 'club', rank: 'D', budget: 20 },
  { id: 40, name: '久慈クラブ', city: '久慈', region: 'tohoku', type: 'club', rank: 'D', budget: 20 },
  { id: 41, name: '郡山BC', city: '郡山', region: 'tohoku', type: 'club', rank: 'D', budget: 20 },
  { id: 42, name: '弘前アレッズ', city: '弘前', region: 'tohoku', type: 'club', rank: 'D', budget: 12 },
  { id: 43, name: '水沢駒形野球倶楽部', city: '奥州', region: 'tohoku', type: 'club', rank: 'D', budget: 12 },
  { id: 44, name: '盛友クラブ', city: '盛岡', region: 'tohoku', type: 'club', rank: 'D', budget: 20 },
  { id: 45, name: '青葉クラブ', city: '仙台', region: 'tohoku', type: 'club', rank: 'D', budget: 20 },
  { id: 46, name: '大崎トリプルクラウン', city: '大崎', region: 'tohoku', type: 'club', rank: 'D', budget: 20 },
  { id: 47, name: '鶴岡野球クラブ', city: '鶴岡', region: 'tohoku', type: 'club', rank: 'D', budget: 20 },
  { id: 48, name: '福島硬友クラブ', city: '福島', region: 'tohoku', type: 'club', rank: 'D', budget: 20 },
  { id: 49, name: '片山商会BC', city: '山形', region: 'tohoku', type: 'club', rank: 'D', budget: 20 },
  { id: 50, name: '由利本荘BC', city: '由利本荘', region: 'tohoku', type: 'club', rank: 'D', budget: 20 },

  // ========== 北関東 (企業7 + クラブ22 = 29) ==========
  { id: 51, name: 'SUBARU', city: '太田', region: 'kitakanto', type: 'corporate', rank: 'A', budget: 70 },
  { id: 52, name: '日本製鉄鹿島', city: '鹿嶋', region: 'kitakanto', type: 'corporate', rank: 'A', budget: 35 },
  { id: 53, name: '日立製作所', city: '日立', region: 'kitakanto', type: 'corporate', rank: 'A', budget: 70 },
  { id: 54, name: 'エイジェック', city: '小山', region: 'kitakanto', type: 'corporate', rank: 'B', budget: 50 },
  { id: 55, name: '茨城トヨペット', city: '水戸', region: 'kitakanto', type: 'corporate', rank: 'C', budget: 15 },
  { id: 56, name: '茨城ゴールデンゴールズ', city: '稲敷', region: 'kitakanto', type: 'club', rank: 'C', budget: 18 },
  { id: 57, name: '全足利クラブ', city: '足利', region: 'kitakanto', type: 'club', rank: 'C', budget: 12 },
  { id: 58, name: 'JR水戸', city: '水戸', region: 'kitakanto', type: 'corporate', rank: 'D', budget: 20 },
  { id: 59, name: '茨城日産', city: '水戸', region: 'kitakanto', type: 'corporate', rank: 'D', budget: 15 },
  { id: 60, name: 'TSK宇都宮', city: '宇都宮', region: 'kitakanto', type: 'club', rank: 'D', budget: 20 },
  { id: 61, name: 'Tsukuba Club', city: 'つくば', region: 'kitakanto', type: 'club', rank: 'D', budget: 20 },
  { id: 62, name: 'UKクラブ', city: '宇都宮', region: 'kitakanto', type: 'club', rank: 'D', budget: 20 },
  { id: 63, name: 'オール高崎', city: '高崎', region: 'kitakanto', type: 'club', rank: 'D', budget: 20 },
  { id: 64, name: 'オール日立ドリームズ', city: '日立', region: 'kitakanto', type: 'club', rank: 'D', budget: 20 },
  { id: 65, name: 'コットンウェイ', city: '真岡', region: 'kitakanto', type: 'club', rank: 'D', budget: 20 },
  { id: 66, name: '伊勢崎硬建クラブ', city: '伊勢崎', region: 'kitakanto', type: 'club', rank: 'D', budget: 20 },
  { id: 67, name: '宇工OBクラブ', city: '宇都宮', region: 'kitakanto', type: 'club', rank: 'D', budget: 20 },
  { id: 68, name: '宇都宮大学OB', city: '宇都宮', region: 'kitakanto', type: 'club', rank: 'D', budget: 20 },
  { id: 69, name: '鹿沼39', city: '鹿沼', region: 'kitakanto', type: 'club', rank: 'D', budget: 20 },
  { id: 70, name: '鹿嶋レインボーズ', city: '鹿嶋', region: 'kitakanto', type: 'club', rank: 'D', budget: 20 },
  { id: 71, name: '全鹿嶋', city: '鹿嶋', region: 'kitakanto', type: 'club', rank: 'D', budget: 20 },
  { id: 72, name: '全神栖', city: '神栖', region: 'kitakanto', type: 'club', rank: 'D', budget: 20 },
  { id: 73, name: '全栃木', city: '宇都宮', region: 'kitakanto', type: 'club', rank: 'D', budget: 20 },
  { id: 74, name: '全那北', city: '那須塩原', region: 'kitakanto', type: 'club', rank: 'D', budget: 20 },
  { id: 75, name: '太田球友', city: '太田', region: 'kitakanto', type: 'club', rank: 'D', budget: 20 },
  { id: 76, name: '太田暁工業', city: '太田', region: 'kitakanto', type: 'club', rank: 'D', budget: 20 },
  { id: 77, name: '大宮クラブ', city: '常陸大宮', region: 'kitakanto', type: 'club', rank: 'D', budget: 12 },
  { id: 78, name: '日本ウェルネスSPU', city: '利根', region: 'kitakanto', type: 'club', rank: 'D', budget: 20 },
  { id: 79, name: '白山クラブ', city: '取手', region: 'kitakanto', type: 'club', rank: 'D', budget: 20 },

  // ========== 南関東 (企業8 + クラブ23 = 31) ==========
  { id: 80, name: 'Honda', city: '狭山', region: 'minamikanto', type: 'corporate', rank: 'S', budget: 90 },
  { id: 81, name: 'JFE東日本', city: '千葉', region: 'minamikanto', type: 'corporate', rank: 'A', budget: 70 },
  { id: 82, name: '日本製鉄かずさマジック', city: '君津', region: 'minamikanto', type: 'corporate', rank: 'A', budget: 70 },
  { id: 83, name: '日本通運', city: 'さいたま', region: 'minamikanto', type: 'corporate', rank: 'A', budget: 75 },
  { id: 84, name: 'SUN-HD EAST', city: '越谷', region: 'minamikanto', type: 'corporate', rank: 'C', budget: 18 },
  { id: 85, name: 'オールフロンティア', city: '春日部', region: 'minamikanto', type: 'corporate', rank: 'C', budget: 20 },
  { id: 86, name: 'テイ・エス テック', city: '行田', region: 'minamikanto', type: 'corporate', rank: 'C', budget: 15 },
  { id: 87, name: 'BIG WINGS印西', city: '印西', region: 'minamikanto', type: 'club', rank: 'C', budget: 35 },
  { id: 88, name: 'ハナマウイ', city: '富里', region: 'minamikanto', type: 'club', rank: 'C', budget: 35 },
  { id: 89, name: '所沢グリーンBC', city: '所沢', region: 'minamikanto', type: 'club', rank: 'C', budget: 35 },
  { id: 90, name: '全浦和野球団', city: 'さいたま', region: 'minamikanto', type: 'club', rank: 'C', budget: 12 },
  { id: 91, name: 'JR千葉', city: '千葉', region: 'minamikanto', type: 'corporate', rank: 'D', budget: 15 },
  { id: 92, name: 'INVENTIVE', city: '川越', region: 'minamikanto', type: 'club', rank: 'D', budget: 20 },
  { id: 93, name: 'JFFシステムズ千葉', city: '千葉', region: 'minamikanto', type: 'club', rank: 'D', budget: 20 },
  { id: 94, name: 'Oceans', city: '千葉', region: 'minamikanto', type: 'club', rank: 'D', budget: 20 },
  { id: 95, name: 'YBC柏', city: '柏', region: 'minamikanto', type: 'club', rank: 'D', budget: 20 },
  { id: 96, name: 'サウザンリーフ市原', city: '市原', region: 'minamikanto', type: 'club', rank: 'D', budget: 20 },
  { id: 97, name: 'ヌーベルBC', city: '柏', region: 'minamikanto', type: 'club', rank: 'D', budget: 20 },
  { id: 98, name: 'レジェンズ', city: 'さいたま', region: 'minamikanto', type: 'club', rank: 'D', budget: 20 },
  { id: 99, name: '一球幸魂倶楽部', city: 'さいたま', region: 'minamikanto', type: 'club', rank: 'D', budget: 20 },
  { id: 100, name: '所沢WARRIORS 41', city: '所沢', region: 'minamikanto', type: 'club', rank: 'D', budget: 20 },
  { id: 101, name: '新座ダイヤモンドドッグス', city: '新座', region: 'minamikanto', type: 'club', rank: 'D', budget: 20 },
  { id: 102, name: '千葉熱血MAKING', city: '千葉', region: 'minamikanto', type: 'club', rank: 'D', budget: 20 },
  { id: 103, name: '川口ゴールデンドリームス', city: '川口', region: 'minamikanto', type: 'club', rank: 'D', budget: 20 },
  { id: 104, name: '船橋中央クラブ', city: '船橋', region: 'minamikanto', type: 'club', rank: 'D', budget: 20 },
  { id: 105, name: '全熊谷', city: '熊谷', region: 'minamikanto', type: 'club', rank: 'D', budget: 20 },
  { id: 106, name: '全三郷硬式野球部', city: '三郷', region: 'minamikanto', type: 'club', rank: 'D', budget: 20 },
  { id: 107, name: '全大宮野球団', city: 'さいたま', region: 'minamikanto', type: 'club', rank: 'D', budget: 20 },
  { id: 108, name: '都幾川倶楽部', city: 'ときがわ', region: 'minamikanto', type: 'club', rank: 'D', budget: 20 },
  { id: 109, name: '東金レキオスBC', city: '東金', region: 'minamikanto', type: 'club', rank: 'D', budget: 20 },
  { id: 110, name: '八千代AgeBC', city: '八千代', region: 'minamikanto', type: 'club', rank: 'D', budget: 20 },

  // ========== 東京 (企業7 + クラブ22 = 29) ==========
  { id: 111, name: 'JR東日本', city: '東京', region: 'tokyo', type: 'corporate', rank: 'S', budget: 95 },
  { id: 112, name: 'NTT東日本', city: '東京', region: 'tokyo', type: 'corporate', rank: 'S', budget: 90 },
  { id: 113, name: 'セガサミー', city: '東京', region: 'tokyo', type: 'corporate', rank: 'A', budget: 75 },
  { id: 114, name: '東京ガス', city: '東京', region: 'tokyo', type: 'corporate', rank: 'A', budget: 80 },
  { id: 115, name: '鷺宮製作所', city: '東京', region: 'tokyo', type: 'corporate', rank: 'B', budget: 55 },
  { id: 116, name: '明治安田', city: '八王子', region: 'tokyo', type: 'corporate', rank: 'B', budget: 75 },
  { id: 117, name: 'JPアセット証券', city: '東京', region: 'tokyo', type: 'corporate', rank: 'C', budget: 50 },
  { id: 118, name: 'エスプライド鉄腕', city: '東京', region: 'tokyo', type: 'club', rank: 'C', budget: 15 },
  { id: 119, name: 'ゴールドジムBC', city: '東京', region: 'tokyo', type: 'club', rank: 'C', budget: 35 },
  { id: 120, name: '全府中野球倶楽部', city: '府中', region: 'tokyo', type: 'club', rank: 'C', budget: 35 },
  { id: 121, name: 'ABC東京野球クラブ', city: '東京', region: 'tokyo', type: 'club', rank: 'D', budget: 20 },
  { id: 122, name: 'HIOKI COMBINE', city: '東京', region: 'tokyo', type: 'club', rank: 'D', budget: 20 },
  { id: 123, name: 'REVENGE99', city: '東京', region: 'tokyo', type: 'club', rank: 'D', budget: 15 },
  { id: 124, name: 'TOKYO METS ', city: '東京', region: 'tokyo', type: 'club', rank: 'D', budget: 12 },
  { id: 125, name: 'WEEDしらさぎ', city: '東京', region: 'tokyo', type: 'club', rank: 'D', budget: 20 },
  { id: 126, name: '羽村クラブ', city: '羽村', region: 'tokyo', type: 'club', rank: 'D', budget: 20 },
  { id: 127, name: '駒込特急', city: '東京', region: 'tokyo', type: 'club', rank: 'D', budget: 20 },
  { id: 128, name: '警視庁野球部', city: '東京', region: 'tokyo', type: 'club', rank: 'D', budget: 20 },
  { id: 129, name: '西多摩倶楽部', city: 'あきる野', region: 'tokyo', type: 'club', rank: 'D', budget: 40 },
  { id: 130, name: '全調布', city: '調布', region: 'tokyo', type: 'club', rank: 'D', budget: 35 },
  { id: 131, name: '太田クラブ', city: '東京', region: 'tokyo', type: 'club', rank: 'D', budget: 20 },
  { id: 132, name: '東京L.B.C', city: '東京', region: 'tokyo', type: 'club', rank: 'D', budget: 20 },
  { id: 133, name: '東京ウイングス', city: '東京', region: 'tokyo', type: 'club', rank: 'D', budget: 20 },
  { id: 134, name: '東京好球倶楽部', city: '東京', region: 'tokyo', type: 'club', rank: 'D', budget: 20 },
  { id: 135, name: '東京消防庁野球部', city: '東京', region: 'tokyo', type: 'club', rank: 'D', budget: 20 },
  { id: 136, name: '東京弥生クラブ', city: '東京', region: 'tokyo', type: 'club', rank: 'D', budget: 20 },
  { id: 137, name: '日本硬式野球倶楽部', city: '東京', region: 'tokyo', type: 'club', rank: 'D', budget: 20 },
  { id: 138, name: '品川熱球クラブ', city: '東京', region: 'tokyo', type: 'club', rank: 'D', budget: 20 },
  { id: 139, name: '武蔵野クラブ', city: '武蔵野', region: 'tokyo', type: 'club', rank: 'D', budget: 12 },

  // ========== 西関東 (企業5 + クラブ25 = 30) ==========
  { id: 140, name: 'ENEOS', city: '横浜', region: 'kanagawa', type: 'corporate', rank: 'S', budget: 90 },
  { id: 141, name: '三菱重工East', city: '横浜', region: 'kanagawa', type: 'corporate', rank: 'S', budget: 85 },
  { id: 142, name: '東芝', city: '川崎', region: 'kanagawa', type: 'corporate', rank: 'S', budget: 90 },
  { id: 143, name: 'JFE京浜', city: '川崎', region: 'kanagawa', type: 'corporate', rank: 'A', budget: 70 },
  { id: 144, name: '日産自動車', city: '横須賀', region: 'kanagawa', type: 'corporate', rank: 'B', budget: 50 },
  { id: 145, name: 'ジェイファム', city: '横浜', region: 'kanagawa', type: 'club', rank: 'C', budget: 35 },
  { id: 146, name: '横浜球友クラブ', city: '横浜', region: 'kanagawa', type: 'club', rank: 'C', budget: 20 },
  { id: 147, name: '横浜金港クラブ', city: '横浜', region: 'kanagawa', type: 'club', rank: 'C', budget: 15 },
  { id: 148, name: '全川崎クラブ', city: '川崎', region: 'kanagawa', type: 'club', rank: 'C', budget: 50 },
  { id: 149, name: 'WIEN BC', city: '鎌倉', region: 'kanagawa', type: 'club', rank: 'D', budget: 15 },
  { id: 150, name: '横浜ベイブルース', city: '横浜', region: 'kanagawa', type: 'club', rank: 'D', budget: 20 },
  { id: 151, name: '横浜中央クラブ', city: '横浜', region: 'kanagawa', type: 'club', rank: 'D', budget: 12 },
  { id: 152, name: '横浜隼人OB', city: '横浜', region: 'kanagawa', type: 'club', rank: 'D', budget: 20 },
  { id: 153, name: '茅ヶ崎サザンカイツ', city: '茅ヶ崎', region: 'kanagawa', type: 'club', rank: 'D', budget: 12 },
  { id: 154, name: '京浜野球倶楽部', city: '川崎', region: 'kanagawa', type: 'club', rank: 'D', budget: 20 },
  { id: 155, name: '峡南BC', city: '富士川', region: 'kanagawa', type: 'club', rank: 'D', budget: 20 },
  { id: 156, name: '甲斐府中クラブ', city: '甲府', region: 'kanagawa', type: 'club', rank: 'D', budget: 20 },
  { id: 157, name: '甲府第一高OB', city: '甲府', region: 'kanagawa', type: 'club', rank: 'D', budget: 20 },
  { id: 158, name: '国際総合伊勢原クラブ', city: '伊勢原', region: 'kanagawa', type: 'club', rank: 'D', budget: 20 },
  { id: 159, name: '山梨球友クラブ', city: '甲府', region: 'kanagawa', type: 'club', rank: 'D', budget: 20 },
  { id: 160, name: '湘南ひらつかマルユウ', city: '平塚', region: 'kanagawa', type: 'club', rank: 'D', budget: 20 },
  { id: 161, name: '上野原クラブ', city: '上野原', region: 'kanagawa', type: 'club', rank: 'D', budget: 20 },
  { id: 162, name: '神奈川大学OB', city: '神奈川', region: 'kanagawa', type: 'club', rank: 'D', budget: 20 },
  { id: 163, name: '相模原クラブ', city: '相模原', region: 'kanagawa', type: 'club', rank: 'D', budget: 20 },
  { id: 164, name: '大月クラブ', city: '大月', region: 'kanagawa', type: 'club', rank: 'D', budget: 20 },
  { id: 165, name: '都留BC', city: '都留', region: 'kanagawa', type: 'club', rank: 'D', budget: 20 },
  { id: 166, name: '南アルプス硬式', city: '南アルプス', region: 'kanagawa', type: 'club', rank: 'D', budget: 20 },
  { id: 167, name: '韮崎クラブ', city: '韮崎', region: 'kanagawa', type: 'club', rank: 'D', budget: 20 },
  { id: 168, name: '富士河口湖硬式', city: '富士河口湖', region: 'kanagawa', type: 'club', rank: 'D', budget: 20 },
  { id: 169, name: '北杜クラブ', city: '北杜', region: 'kanagawa', type: 'club', rank: 'D', budget: 20 },

  // ========== 北信越 (企業5 + クラブ19 = 24) ==========
  { id: 170, name: 'バイタルネット', city: '新潟', region: 'hokushinetsu', type: 'corporate', rank: 'B', budget: 50 },
  { id: 171, name: '伏木海陸運送', city: '高岡', region: 'hokushinetsu', type: 'corporate', rank: 'B', budget: 45 },
  { id: 172, name: 'JR新潟', city: '新潟', region: 'hokushinetsu', type: 'corporate', rank: 'C', budget: 35 },
  { id: 173, name: 'フェデックス', city: '塩尻', region: 'hokushinetsu', type: 'corporate', rank: 'C', budget: 30 },
  { id: 174, name: 'ロキテクノ富山', city: '富山', region: 'hokushinetsu', type: 'corporate', rank: 'C', budget: 50 },
  { id: 175, name: '信越硬式野球クラブ', city: '長野', region: 'hokushinetsu', type: 'club', rank: 'C', budget: 35 },
  { id: 176, name: '富山BC', city: '富山', region: 'hokushinetsu', type: 'club', rank: 'C', budget: 15 },
  { id: 177, name: 'Hard Ball Club 金沢', city: '金沢', region: 'hokushinetsu', type: 'club', rank: 'D', budget: 15 },
  { id: 178, name: 'IMF BANDITS 富山', city: '富山', region: 'hokushinetsu', type: 'club', rank: 'D', budget: 12 },
  { id: 179, name: 'オール飯豊', city: '飯豊', region: 'hokushinetsu', type: 'club', rank: 'D', budget: 20 },
  { id: 180, name: '越配ファイティング', city: '新潟', region: 'hokushinetsu', type: 'club', rank: 'D', budget: 20 },
  { id: 181, name: '金沢ワイセンベルグ', city: '金沢', region: 'hokushinetsu', type: 'club', rank: 'D', budget: 20 },
  { id: 182, name: '五泉クラブ', city: '五泉', region: 'hokushinetsu', type: 'club', rank: 'D', budget: 20 },
  { id: 183, name: '佐久コスモスターズ', city: '佐久', region: 'hokushinetsu', type: 'club', rank: 'D', budget: 12 },
  { id: 184, name: '佐渡軍団', city: '佐渡', region: 'hokushinetsu', type: 'club', rank: 'D', budget: 20 },
  { id: 185, name: '上田硬式野球クラブ', city: '上田', region: 'hokushinetsu', type: 'club', rank: 'D', budget: 20 },
  { id: 186, name: '新潟クラブ野球団', city: '新潟', region: 'hokushinetsu', type: 'club', rank: 'D', budget: 20 },
  { id: 187, name: '新潟コンマーシャル', city: '新潟', region: 'hokushinetsu', type: 'club', rank: 'D', budget: 20 },
  { id: 188, name: '石川BC', city: '金沢', region: 'hokushinetsu', type: 'club', rank: 'D', budget: 20 },
  { id: 189, name: '千曲川硬式', city: '小諸', region: 'hokushinetsu', type: 'club', rank: 'D', budget: 20 },
  { id: 190, name: '全新潟ブラックス', city: '新潟', region: 'hokushinetsu', type: 'club', rank: 'D', budget: 20 },
  { id: 191, name: '長野好球倶楽部', city: '長野', region: 'hokushinetsu', type: 'club', rank: 'D', budget: 12 },
  { id: 192, name: '福井ミリオンドリームズ', city: '池田', region: 'hokushinetsu', type: 'club', rank: 'D', budget: 20 },
  { id: 193, name: '野田サンダーズ', city: '新潟', region: 'hokushinetsu', type: 'club', rank: 'D', budget: 20 },

  // ========== 東海 (企業11 + クラブ16 = 27) ==========
  { id: 194, name: 'トヨタ自動車', city: '豊田', region: 'tokai', type: 'corporate', rank: 'S', budget: 100 },
  { id: 195, name: 'ヤマハ', city: '浜松', region: 'tokai', type: 'corporate', rank: 'S', budget: 90 },
  { id: 196, name: 'Honda鈴鹿', city: '鈴鹿', region: 'tokai', type: 'corporate', rank: 'A', budget: 75 },
  { id: 197, name: '王子', city: '春日井', region: 'tokai', type: 'corporate', rank: 'A', budget: 70 },
  { id: 198, name: '三菱自動車岡崎', city: '岡崎', region: 'tokai', type: 'corporate', rank: 'A', budget: 70 },
  { id: 199, name: '西濃運輸', city: '大垣', region: 'tokai', type: 'corporate', rank: 'A', budget: 70 },
  { id: 200, name: '東邦ガス', city: '名古屋', region: 'tokai', type: 'corporate', rank: 'A', budget: 70 },
  { id: 201, name: 'JR東海', city: '名古屋', region: 'tokai', type: 'corporate', rank: 'B', budget: 75 },
  { id: 202, name: 'ジェイプロジェクト', city: '名古屋', region: 'tokai', type: 'corporate', rank: 'B', budget: 50 },
  { id: 203, name: '東海理化', city: '名古屋', region: 'tokai', type: 'corporate', rank: 'B', budget: 55 },
  { id: 204, name: '日本製鉄東海REX', city: '東海', region: 'tokai', type: 'corporate', rank: 'B', budget: 50 },
  { id: 205, name: '寿々硬式野球クラブ', city: '名古屋', region: 'tokai', type: 'club', rank: 'C', budget: 35 },
  { id: 206, name: '矢場とんブースターズ', city: '名古屋', region: 'tokai', type: 'club', rank: 'C', budget: 40 },
  { id: 207, name: 'BLITZ', city: '東海', region: 'tokai', type: 'club', rank: 'D', budget: 20 },
  { id: 208, name: 'CENTRAL ARCH', city: '一宮', region: 'tokai', type: 'club', rank: 'D', budget: 20 },
  { id: 209, name: 'TJクラブ', city: '名古屋', region: 'tokai', type: 'club', rank: 'D', budget: 20 },
  { id: 210, name: 'ジェイグループ', city: '名古屋', region: 'tokai', type: 'club', rank: 'D', budget: 20 },
  { id: 211, name: 'スポーツ総合学園SEED', city: '岩倉', region: 'tokai', type: 'club', rank: 'D', budget: 20 },
  { id: 212, name: 'ヤマハ発動機野球部', city: '磐田', region: 'tokai', type: 'club', rank: 'D', budget: 20 },
  { id: 213, name: '愛知BB倶楽部', city: '名古屋', region: 'tokai', type: 'club', rank: 'D', budget: 20 },
  { id: 214, name: '奥伊勢クラブ', city: '大台', region: 'tokai', type: 'club', rank: 'D', budget: 20 },
  { id: 215, name: '岐阜硬式野球倶楽部', city: '安八', region: 'tokai', type: 'club', rank: 'D', budget: 20 },
  { id: 216, name: '三重高虎BC', city: '津', region: 'tokai', type: 'club', rank: 'D', budget: 20 },
  { id: 217, name: '山岸ロジスターズ', city: '島田', region: 'tokai', type: 'club', rank: 'D', budget: 20 },
  { id: 218, name: '焼津マリーンズ', city: '焼津', region: 'tokai', type: 'club', rank: 'D', budget: 15 },
  { id: 219, name: '静岡硬式野球倶楽部', city: '静岡', region: 'tokai', type: 'club', rank: 'D', budget: 20 },
  { id: 220, name: '富士クラブ', city: '富士', region: 'tokai', type: 'club', rank: 'D', budget: 20 },

  // ========== 近畿 (企業12 + クラブ17 = 29) ==========
  { id: 221, name: 'パナソニック', city: '門真', region: 'kinki', type: 'corporate', rank: 'S', budget: 90 },
  { id: 222, name: '日本生命', city: '大阪', region: 'kinki', type: 'corporate', rank: 'S', budget: 90 },
  { id: 223, name: 'NTT西日本', city: '大阪', region: 'kinki', type: 'corporate', rank: 'A', budget: 75 },
  { id: 224, name: '大阪ガス', city: '大阪', region: 'kinki', type: 'corporate', rank: 'A', budget: 85 },
  { id: 225, name: '日本新薬', city: '京都', region: 'kinki', type: 'corporate', rank: 'A', budget: 70 },
  { id: 226, name: 'カナフレックス', city: '大阪', region: 'kinki', type: 'corporate', rank: 'B', budget: 50 },
  { id: 227, name: 'ニチダイ', city: '京田辺', region: 'kinki', type: 'corporate', rank: 'B', budget: 50 },
  { id: 228, name: 'ミキハウス', city: '八尾', region: 'kinki', type: 'corporate', rank: 'B', budget: 55 },
  { id: 229, name: '三菱重工West', city: '神戸', region: 'kinki', type: 'corporate', rank: 'B', budget: 80 },
  { id: 230, name: '島津製作所', city: '京都', region: 'kinki', type: 'corporate', rank: 'B', budget: 50 },
  { id: 231, name: '日本製鉄瀬戸内', city: '姫路', region: 'kinki', type: 'corporate', rank: 'B', budget: 55 },
  { id: 232, name: '大和高田クラブ', city: '大和高田', region: 'kinki', type: 'club', rank: 'B', budget: 20 },
  { id: 233, name: 'ルネス紅葉SP柔整', city: '甲賀', region: 'kinki', type: 'corporate', rank: 'C', budget: 50 },
  { id: 234, name: 'NOMO BC', city: '堺', region: 'kinki', type: 'club', rank: 'C', budget: 35 },
  { id: 235, name: 'マツゲン箕島硬式', city: '有田', region: 'kinki', type: 'club', rank: 'C', budget: 35 },
  { id: 236, name: 'BBCジェッツ', city: '門真', region: 'kinki', type: 'club', rank: 'D', budget: 20 },
  { id: 237, name: '宇治BC', city: '宇治', region: 'kinki', type: 'club', rank: 'D', budget: 15 },
  { id: 238, name: '京都ジャガーズ', city: '京都', region: 'kinki', type: 'club', rank: 'D', budget: 20 },
  { id: 239, name: '京都フルカウンツ', city: '京都', region: 'kinki', type: 'club', rank: 'D', budget: 20 },
  { id: 240, name: '県警桃太郎', city: '神戸', region: 'kinki', type: 'club', rank: 'D', budget: 20 },
  { id: 241, name: '神戸レールスターズ', city: '神戸', region: 'kinki', type: 'club', rank: 'D', budget: 20 },
  { id: 242, name: '泉州大阪野球団', city: '堺', region: 'kinki', type: 'club', rank: 'D', budget: 20 },
  { id: 243, name: '全播磨硬式野球団', city: '姫路', region: 'kinki', type: 'club', rank: 'D', budget: 20 },
  { id: 244, name: '大阪HDBC', city: '東大阪', region: 'kinki', type: 'club', rank: 'D', budget: 20 },
  { id: 245, name: '大阪ペーシェンスC', city: '大阪', region: 'kinki', type: 'club', rank: 'D', budget: 20 },
  { id: 246, name: '東山クラブ', city: '京都', region: 'kinki', type: 'club', rank: 'D', budget: 20 },
  { id: 247, name: '奈良アンビシャス', city: '奈良', region: 'kinki', type: 'club', rank: 'D', budget: 20 },
  { id: 248, name: '八尾BC', city: '八尾', region: 'kinki', type: 'club', rank: 'D', budget: 15 },
  { id: 249, name: '兵庫ホワイトシャークス', city: '三田', region: 'kinki', type: 'club', rank: 'D', budget: 20 },

  // ========== 中国 (企業9 + クラブ8 = 17) ==========
  { id: 250, name: 'JFE西日本', city: '福山', region: 'chugoku', type: 'corporate', rank: 'A', budget: 70 },
  { id: 251, name: 'JR西日本', city: '広島', region: 'chugoku', type: 'corporate', rank: 'A', budget: 70 },
  { id: 252, name: 'シティライト岡山', city: '岡山', region: 'chugoku', type: 'corporate', rank: 'B', budget: 55 },
  { id: 253, name: '三菱自動車倉敷オーシャンズ', city: '倉敷', region: 'chugoku', type: 'corporate', rank: 'B', budget: 50 },
  { id: 254, name: '伯和ビクトリーズ', city: '東広島', region: 'chugoku', type: 'corporate', rank: 'B', budget: 50 },
  { id: 255, name: 'MSH医療専門学校', city: '広島', region: 'chugoku', type: 'corporate', rank: 'C', budget: 35 },
  { id: 256, name: 'ショウワコーポレーション', city: '美作', region: 'chugoku', type: 'corporate', rank: 'C', budget: 12 },
  { id: 257, name: 'ツネイシブルーパイレーツ', city: '福山', region: 'chugoku', type: 'corporate', rank: 'C', budget: 40 },
  { id: 258, name: '日本製鉄山口', city: '光', region: 'chugoku', type: 'corporate', rank: 'C', budget: 35 },
  { id: 259, name: '広島鯉城クラブ', city: '広島', region: 'chugoku', type: 'club', rank: 'C', budget: 15 },
  { id: 260, name: 'MJG島根', city: '松江', region: 'chugoku', type: 'club', rank: 'D', budget: 35 },
  { id: 261, name: '岩国五橋クラブ', city: '岩国', region: 'chugoku', type: 'club', rank: 'D', budget: 20 },
  { id: 262, name: '広島BC', city: '広島', region: 'chugoku', type: 'club', rank: 'D', budget: 12 },
  { id: 263, name: '三原ヤッサBC', city: '三原', region: 'chugoku', type: 'club', rank: 'D', budget: 15 },
  { id: 264, name: '山口防府BC', city: '防府', region: 'chugoku', type: 'club', rank: 'D', budget: 25 },
  { id: 265, name: '倉敷ピーチジャックス', city: '倉敷', region: 'chugoku', type: 'club', rank: 'D', budget: 10 },
  { id: 266, name: '福山ローズファイターズ', city: '福山', region: 'chugoku', type: 'club', rank: 'D', budget: 12 },

  // ========== 四国 (企業3 + クラブ3 = 6) ==========
  { id: 267, name: 'JR四国', city: '高松', region: 'shikoku', type: 'corporate', rank: 'B', budget: 50 },
  { id: 268, name: '四国銀行', city: '高知', region: 'shikoku', type: 'corporate', rank: 'B', budget: 45 },
  { id: 269, name: 'アークバリア', city: '高松', region: 'shikoku', type: 'corporate', rank: 'C', budget: 35 },
  { id: 270, name: 'イワキテック', city: '上島', region: 'shikoku', type: 'club', rank: 'D', budget: 18 },
  { id: 271, name: '松山フェニックス', city: '松山', region: 'shikoku', type: 'club', rank: 'D', budget: 20 },
  { id: 272, name: '徳島野球倶楽部', city: '徳島', region: 'shikoku', type: 'club', rank: 'D', budget: 15 },

  // ========== 九州 (企業13 + クラブ15 = 28) ==========
  { id: 273, name: 'Honda熊本', city: '大津', region: 'kyushu', type: 'corporate', rank: 'A', budget: 75 },
  { id: 274, name: '西部ガス', city: '福岡', region: 'kyushu', type: 'corporate', rank: 'A', budget: 70 },
  { id: 275, name: 'JR九州', city: '北九州', region: 'kyushu', type: 'corporate', rank: 'B', budget: 70 },
  { id: 276, name: 'KMGホールディングス', city: '福岡', region: 'kyushu', type: 'corporate', rank: 'B', budget: 50 },
  { id: 277, name: '沖縄電力', city: '那覇', region: 'kyushu', type: 'corporate', rank: 'B', budget: 30 },
  { id: 278, name: '宮崎梅田学園', city: '宮崎', region: 'kyushu', type: 'corporate', rank: 'B', budget: 50 },
  { id: 279, name: '日産自動車九州', city: '苅田', region: 'kyushu', type: 'corporate', rank: 'B', budget: 50 },
  { id: 280, name: 'エナジック', city: '名護', region: 'kyushu', type: 'corporate', rank: 'C', budget: 50 },
  { id: 281, name: '沖データコンピュータ', city: '福岡', region: 'kyushu', type: 'corporate', rank: 'C', budget: 35 },
  { id: 282, name: '宮崎福祉医療カレッジ', city: '日南', region: 'kyushu', type: 'corporate', rank: 'C', budget: 40 },
  { id: 283, name: '九州工科自動車専門', city: '熊本', region: 'kyushu', type: 'corporate', rank: 'C', budget: 50 },
  { id: 284, name: '九州総合スポーツC', city: '宇佐', region: 'kyushu', type: 'corporate', rank: 'C', budget: 35 },
  { id: 285, name: '日本製鉄九州', city: '大分', region: 'kyushu', type: 'corporate', rank: 'C', budget: 55 },
  { id: 286, name: 'ビッグ開発BC', city: '那覇', region: 'kyushu', type: 'club', rank: 'C', budget: 35 },
  { id: 287, name: '熊本ゴールデンラークス', city: '熊本', region: 'kyushu', type: 'club', rank: 'C', budget: 35 },
  { id: 288, name: '鹿児島ドリームウェーブ', city: '鹿児島', region: 'kyushu', type: 'club', rank: 'C', budget: 35 },
  { id: 289, name: 'BAN BASEBALL CLUB', city: '大分', region: 'kyushu', type: 'club', rank: 'D', budget: 20 },
  { id: 290, name: 'REXパワーズ', city: '久留米', region: 'kyushu', type: 'club', rank: 'D', budget: 20 },
  { id: 291, name: 'クリード安仁屋BC', city: '那覇', region: 'kyushu', type: 'club', rank: 'D', budget: 20 },
  { id: 292, name: 'ビクトリークロウ', city: '佐賀', region: 'kyushu', type: 'club', rank: 'D', budget: 20 },
  { id: 293, name: '嘉麻市バーニングヒーローズ', city: '嘉麻', region: 'kyushu', type: 'club', rank: 'D', budget: 20 },
  { id: 294, name: '宮崎灼熱フェニックス', city: '宮崎', region: 'kyushu', type: 'club', rank: 'D', budget: 20 },
  { id: 295, name: '佐賀魂', city: '佐賀', region: 'kyushu', type: 'club', rank: 'D', budget: 20 },
  { id: 296, name: '薩摩ライジング', city: '鹿児島', region: 'kyushu', type: 'club', rank: 'D', budget: 20 },
  { id: 297, name: '福岡BC', city: '福岡', region: 'kyushu', type: 'club', rank: 'D', budget: 20 },
  { id: 298, name: '福岡オーシャンズ9', city: '福津', region: 'kyushu', type: 'club', rank: 'D', budget: 20 },
  { id: 299, name: '福岡トヨタFTサンダース', city: '福岡', region: 'kyushu', type: 'club', rank: 'D', budget: 20 },
  { id: 300, name: '北九州市民硬式', city: '北九州', region: 'kyushu', type: 'club', rank: 'D', budget: 20 },
];

// REGIONS.teamCount を自動計算
REGIONS.forEach(r => {
  r.teamCount = CORPORATE_TEAMS.filter(t => t.region === r.id).length;
});

// ランク別の基本能力レンジ（選手自動生成時に使用）
export const RANK_ABILITY_RANGE = {
  S: { min: 45, max: 85, starChance: 0.20 },
  A: { min: 40, max: 75, starChance: 0.12 },
  B: { min: 35, max: 65, starChance: 0.06 },
  C: { min: 25, max: 55, starChance: 0.03 },
  D: { min: 20, max: 45, starChance: 0.01 },
};

export const BUDGET_UNIT = 100;

// 地区別の都市対抗代表枠数
export const REGION_SLOTS = {
  hokkaido: 1,
  tohoku: 3,
  kitakanto: 2,
  minamikanto: 2,
  tokyo: 4,
  kanagawa: 2,
  hokushinetsu: 2,
  tokai: 5,
  kinki: 4,
  chugoku: 3,
  shikoku: 1,
  kyushu: 3,
};

// ============================================================
// チームオーバーライド（マスター設定、セーブデータに含めない）
// ============================================================

const OVERRIDES_STORAGE_KEY = 'corpTeamOverrides';
const NAMES_STORAGE_KEY = 'corpTeamNames'; // 後方互換用

const loadOverrides = () => {
  try {
    const raw = localStorage.getItem(OVERRIDES_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
    // 旧形式からの移行
    const oldNames = localStorage.getItem(NAMES_STORAGE_KEY);
    if (oldNames) {
      const names = JSON.parse(oldNames);
      const migrated = {};
      for (const [id, name] of Object.entries(names)) {
        migrated[id] = { name };
      }
      localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(migrated));
      localStorage.removeItem(NAMES_STORAGE_KEY);
      return migrated;
    }
    return {};
  } catch { return {}; }
};

const saveOverrides = (overrides) => {
  try {
    localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
  } catch { /* ignore */ }
};

// オーバーライド可能フィールド: name, region, type, rank, city
export const getTeamOverride = (teamId, field) => {
  const overrides = loadOverrides();
  return overrides[teamId]?.[field] ?? null;
};

export const setTeamOverride = (teamId, field, value) => {
  const overrides = loadOverrides();
  const team = CORPORATE_TEAMS.find(t => t.id === teamId);
  if (!overrides[teamId]) overrides[teamId] = {};

  if (team && value === team[field]) {
    delete overrides[teamId][field];
    if (Object.keys(overrides[teamId]).length === 0) delete overrides[teamId];
  } else {
    overrides[teamId][field] = value;
  }
  saveOverrides(overrides);
};

export const resetTeamOverrides = (teamId) => {
  const overrides = loadOverrides();
  delete overrides[teamId];
  saveOverrides(overrides);
};

export const resetAllOverrides = () => {
  localStorage.removeItem(OVERRIDES_STORAGE_KEY);
  localStorage.removeItem(NAMES_STORAGE_KEY);
};

export const getAllOverrides = () => loadOverrides();

// 後方互換: getTeamDisplayName / setTeamDisplayName
export const getTeamDisplayName = (teamId) => {
  return getTeamOverride(teamId, 'name') || CORPORATE_TEAMS.find(t => t.id === teamId)?.name || '';
};

export const setTeamDisplayName = (teamId, newName) => {
  setTeamOverride(teamId, 'name', newName.trim());
};

export const resetTeamDisplayName = (teamId) => {
  const overrides = loadOverrides();
  if (overrides[teamId]) {
    delete overrides[teamId].name;
    if (Object.keys(overrides[teamId]).length === 0) delete overrides[teamId];
    saveOverrides(overrides);
  }
};

export const resetAllTeamDisplayNames = () => resetAllOverrides();
export const getAllNameOverrides = () => {
  const all = loadOverrides();
  const names = {};
  for (const [id, o] of Object.entries(all)) {
    if (o.name) names[id] = o.name;
  }
  return names;
};

// ============================================================
// カスタムチーム追加・削除（マスター設定、セーブデータに含めない）
// ============================================================

const CUSTOM_TEAMS_KEY = 'corpCustomTeams';
const DELETED_TEAMS_KEY = 'corpDeletedTeams';

const loadCustomTeams = () => {
  try {
    const raw = localStorage.getItem(CUSTOM_TEAMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

const saveCustomTeams = (teams) => {
  try {
    localStorage.setItem(CUSTOM_TEAMS_KEY, JSON.stringify(teams));
  } catch { /* ignore */ }
};

const loadDeletedTeamIds = () => {
  try {
    const raw = localStorage.getItem(DELETED_TEAMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

const saveDeletedTeamIds = (ids) => {
  try {
    localStorage.setItem(DELETED_TEAMS_KEY, JSON.stringify(ids));
  } catch { /* ignore */ }
};

export const addCustomTeam = (teamData) => {
  const customs = loadCustomTeams();
  const allIds = [...CORPORATE_TEAMS.map(t => t.id), ...customs.map(t => t.id)];
  const newId = Math.max(0, ...allIds) + 1;
  const budgetByRank = { S: 90, A: 70, B: 50, C: 35, D: 20 };
  const newTeam = {
    id: newId,
    name: teamData.name,
    city: teamData.city,
    region: teamData.region,
    type: teamData.type || 'club',
    rank: teamData.rank || 'C',
    budget: budgetByRank[teamData.rank] || 35,
    isCustom: true,
  };
  customs.push(newTeam);
  saveCustomTeams(customs);
  return newTeam;
};

export const updateCustomTeam = (teamId, fields) => {
  const customs = loadCustomTeams();
  const idx = customs.findIndex(t => t.id === teamId);
  if (idx >= 0) {
    for (const field of ['name', 'city', 'region', 'type', 'rank']) {
      if (fields[field] !== undefined) customs[idx][field] = fields[field];
    }
    const budgetByRank = { S: 90, A: 70, B: 50, C: 35, D: 20 };
    customs[idx].budget = budgetByRank[customs[idx].rank] || 35;
    saveCustomTeams(customs);
  }
};

export const deleteTeam = (teamId) => {
  // カスタムチームの場合は完全削除
  const customs = loadCustomTeams();
  const customIdx = customs.findIndex(t => t.id === teamId);
  if (customIdx >= 0) {
    customs.splice(customIdx, 1);
    saveCustomTeams(customs);
    // オーバーライドも削除
    const overrides = loadOverrides();
    delete overrides[teamId];
    saveOverrides(overrides);
    return;
  }
  // 既存チームの場合は削除済みリストに追加
  const deleted = loadDeletedTeamIds();
  if (!deleted.includes(teamId)) {
    deleted.push(teamId);
    saveDeletedTeamIds(deleted);
  }
  // オーバーライドも削除
  const overrides = loadOverrides();
  delete overrides[teamId];
  saveOverrides(overrides);
};

export const restoreTeam = (teamId) => {
  const deleted = loadDeletedTeamIds();
  const idx = deleted.indexOf(teamId);
  if (idx >= 0) {
    deleted.splice(idx, 1);
    saveDeletedTeamIds(deleted);
  }
};

export const getDeletedTeams = () => {
  const deletedIds = loadDeletedTeamIds();
  return CORPORATE_TEAMS.filter(t => deletedIds.includes(t.id));
};

// ============================================================
// ゲームセッション用チーム追加・削除（NEW GAMEごとにリセット）
// CorporateNameEditScreen の永続編集とは別管理
// ============================================================

const SESSION_CUSTOM_KEY = 'corpSessionCustomTeams';
const SESSION_DELETED_KEY = 'corpSessionDeletedTeams';

const loadSessionCustomTeams = () => {
  try {
    const raw = localStorage.getItem(SESSION_CUSTOM_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

const loadSessionDeletedIds = () => {
  try {
    const raw = localStorage.getItem(SESSION_DELETED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

export const clearGameSessionTeams = () => {
  localStorage.removeItem(SESSION_CUSTOM_KEY);
  localStorage.removeItem(SESSION_DELETED_KEY);
};

export const addGameSessionCustomTeam = (teamData) => {
  const customs = loadSessionCustomTeams();
  const allBase = [...CORPORATE_TEAMS, ...loadCustomTeams(), ...customs];
  const allIds = allBase.map(t => t.id);
  const newId = Math.max(0, ...allIds) + 1;
  const budgetByRank = { S: 90, A: 70, B: 50, C: 35, D: 20 };
  const newTeam = {
    id: newId,
    name: teamData.name,
    city: teamData.city,
    region: teamData.region,
    type: teamData.type || 'club',
    rank: teamData.rank || 'C',
    budget: budgetByRank[teamData.rank] || 35,
    isCustom: true,
    isSessionTeam: true,
  };
  customs.push(newTeam);
  try { localStorage.setItem(SESSION_CUSTOM_KEY, JSON.stringify(customs)); } catch {}
  return newTeam;
};

export const deleteGameSessionTeam = (teamId) => {
  const deleted = loadSessionDeletedIds();
  if (!deleted.includes(teamId)) {
    deleted.push(teamId);
    try { localStorage.setItem(SESSION_DELETED_KEY, JSON.stringify(deleted)); } catch {}
  }
};

// オーバーライド適用済みのチームデータを取得
const getEffectiveTeam = (team) => {
  const overrides = loadOverrides();
  const o = overrides[team.id] || {};
  return {
    ...team,
    name: o.name || team.name,
    displayName: o.name || team.name,
    region: o.region || team.region,
    type: o.type || team.type,
    rank: o.rank || team.rank,
    city: o.city || team.city,
    hasOverrides: Object.keys(o).length > 0,
    originalName: team.name,
    originalRegion: team.region,
    originalType: team.type,
    originalRank: team.rank,
    originalCity: team.city,
  };
};

// 全チームを統合して返す（既存 + 永続カスタム + セッションカスタム - 永続削除 - セッション削除）
const getMergedTeams = () => {
  const deletedIds = new Set([...loadDeletedTeamIds(), ...loadSessionDeletedIds()]);
  const base = CORPORATE_TEAMS.filter(t => !deletedIds.has(t.id));
  const customs = loadCustomTeams().filter(t => !deletedIds.has(t.id));
  const sessionCustoms = loadSessionCustomTeams();
  return [...base, ...customs, ...sessionCustoms];
};

// エディット用: セッションチームを除外（永続チームのみ）
const getMasterTeams = () => {
  const deletedIds = new Set(loadDeletedTeamIds());
  const base = CORPORATE_TEAMS.filter(t => !deletedIds.has(t.id));
  const customs = loadCustomTeams().filter(t => !deletedIds.has(t.id));
  return [...base, ...customs];
};

// ============================================================
// ヘルパー関数
// ============================================================

export const getTeamsByRegion = (regionId) =>
  getMergedTeams()
    .map(t => getEffectiveTeam(t))
    .filter(t => t.region === regionId);

export const getAllTeamsEffective = () =>
  getMergedTeams().map(t => getEffectiveTeam(t));

// エディット画面用: セッションチームを含まないマスターデータのみ
export const getAllMasterTeamsEffective = () =>
  getMasterTeams().map(t => getEffectiveTeam(t));

export const getMasterTeamsByRegion = (regionId) =>
  getMasterTeams()
    .map(t => getEffectiveTeam(t))
    .filter(t => t.region === regionId);

export const getRegionName = (regionId) =>
  REGIONS.find(r => r.id === regionId)?.name || regionId;

export const getTeamById = (teamId) => {
  const all = getMergedTeams();
  const team = all.find(t => t.id === teamId);
  if (!team) return null;
  return getEffectiveTeam(team);
};

export const getRegionSlots = (regionId) =>
  REGION_SLOTS[regionId] || 1;
