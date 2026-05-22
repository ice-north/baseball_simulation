// ============================================================
// 社会人野球 全チームデータ（企業チーム＋クラブチーム / 12地区連盟）
// ============================================================

export const REGIONS = [
  { id: 'hokkaido', name: '北海道', teamCount: 0 },
  { id: 'tohoku', name: '東北', teamCount: 0 },
  { id: 'kitakanto', name: '北関東', teamCount: 0 },
  { id: 'minamikanto', name: '南関東', teamCount: 0 },
  { id: 'tokyo', name: '東京', teamCount: 0 },
  { id: 'kanagawa', name: '神奈川', teamCount: 0 },
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
  // ========== 北海道 (企業3 + クラブ13 = 16) ==========
  { id: 1, name: '北海道ガス', city: '札幌', region: 'hokkaido', type: 'corporate', rank: 'B', budget: 50 },
  { id: 2, name: 'JR北海道硬式野球クラブ', city: '札幌', region: 'hokkaido', type: 'club', rank: 'C', budget: 20 },
  { id: 3, name: '室蘭シャークス', city: '室蘭', region: 'hokkaido', type: 'club', rank: 'C', budget: 20 },
  { id: 4, name: '函館太洋倶楽部', city: '函館', region: 'hokkaido', type: 'club', rank: 'D', budget: 15 },
  { id: 5, name: '旭川ビートス', city: '旭川', region: 'hokkaido', type: 'club', rank: 'D', budget: 15 },
  { id: 6, name: '帯広倶楽部', city: '帯広', region: 'hokkaido', type: 'club', rank: 'D', budget: 12 },
  { id: 7, name: '釧路倶楽部', city: '釧路', region: 'hokkaido', type: 'club', rank: 'D', budget: 12 },
  { id: 8, name: '苫小牧ベアーズ', city: '苫小牧', region: 'hokkaido', type: 'club', rank: 'D', budget: 12 },
  { id: 9, name: '北見倶楽部', city: '北見', region: 'hokkaido', type: 'club', rank: 'D', budget: 10 },
  { id: 10, name: '千歳ダイヤモンズ', city: '千歳', region: 'hokkaido', type: 'club', rank: 'D', budget: 10 },
  { id: 180, name: 'サッポロビール', city: '札幌', region: 'hokkaido', type: 'corporate', rank: 'C', budget: 35 },
  { id: 181, name: '北洋銀行', city: '札幌', region: 'hokkaido', type: 'corporate', rank: 'C', budget: 30 },
  { id: 182, name: '稚内ノーススターズ', city: '稚内', region: 'hokkaido', type: 'club', rank: 'D', budget: 12 },
  { id: 183, name: '小樽シーガルズ', city: '小樽', region: 'hokkaido', type: 'club', rank: 'D', budget: 10 },
  { id: 184, name: '恵庭ブリーズ', city: '恵庭', region: 'hokkaido', type: 'club', rank: 'D', budget: 10 },
  { id: 185, name: '岩見沢クラブ', city: '岩見沢', region: 'hokkaido', type: 'club', rank: 'D', budget: 10 },

  // ========== 東北 (企業6 + クラブ10 = 16) ==========
  { id: 11, name: 'TDK', city: 'にかほ', region: 'tohoku', type: 'corporate', rank: 'B', budget: 55 },
  { id: 12, name: 'JR東日本東北', city: '仙台', region: 'tohoku', type: 'corporate', rank: 'A', budget: 70 },
  { id: 13, name: '七十七銀行', city: '仙台', region: 'tohoku', type: 'corporate', rank: 'B', budget: 50 },
  { id: 14, name: '日本製紙石巻', city: '石巻', region: 'tohoku', type: 'corporate', rank: 'B', budget: 55 },
  { id: 15, name: 'トヨタ自動車東日本', city: '大和', region: 'tohoku', type: 'corporate', rank: 'A', budget: 75 },
  { id: 16, name: 'きらやか銀行', city: '山形', region: 'tohoku', type: 'corporate', rank: 'C', budget: 35 },
  { id: 17, name: '仙台市民球団フォレスト', city: '仙台', region: 'tohoku', type: 'club', rank: 'C', budget: 20 },
  { id: 18, name: '秋田ノーザンハピネッツBC', city: '秋田', region: 'tohoku', type: 'club', rank: 'D', budget: 15 },
  { id: 19, name: '盛岡倶楽部', city: '盛岡', region: 'tohoku', type: 'club', rank: 'D', budget: 15 },
  { id: 20, name: '郡山ナインスターズ', city: '郡山', region: 'tohoku', type: 'club', rank: 'D', budget: 12 },
  { id: 21, name: '青森アストロス', city: '青森', region: 'tohoku', type: 'club', rank: 'D', budget: 12 },
  { id: 22, name: 'いわきマリンスターズ', city: 'いわき', region: 'tohoku', type: 'club', rank: 'C', budget: 18 },
  { id: 23, name: '福島ウィンズ', city: '福島', region: 'tohoku', type: 'club', rank: 'D', budget: 15 },
  { id: 24, name: '山形グリズリーズ', city: '山形', region: 'tohoku', type: 'club', rank: 'D', budget: 12 },
  { id: 186, name: '八戸ダイヤモンズ', city: '八戸', region: 'tohoku', type: 'club', rank: 'D', budget: 12 },
  { id: 187, name: '会津オールスターズ', city: '会津若松', region: 'tohoku', type: 'club', rank: 'D', budget: 12 },

  // ========== 北関東 (企業6 + クラブ10 = 16) ==========
  { id: 25, name: 'SUBARU', city: '太田', region: 'kitakanto', type: 'corporate', rank: 'A', budget: 70 },
  { id: 26, name: '日立製作所', city: '日立', region: 'kitakanto', type: 'corporate', rank: 'A', budget: 70 },
  { id: 27, name: 'エイジェック', city: '小山', region: 'kitakanto', type: 'corporate', rank: 'B', budget: 50 },
  { id: 28, name: '新日本製薬', city: '前橋', region: 'kitakanto', type: 'corporate', rank: 'C', budget: 35 },
  { id: 29, name: '水戸クラブ', city: '水戸', region: 'kitakanto', type: 'club', rank: 'C', budget: 20 },
  { id: 30, name: '高崎サンダース', city: '高崎', region: 'kitakanto', type: 'club', rank: 'D', budget: 15 },
  { id: 31, name: '宇都宮クリアーズ', city: '宇都宮', region: 'kitakanto', type: 'club', rank: 'D', budget: 15 },
  { id: 32, name: 'つくばエクスプレスBC', city: 'つくば', region: 'kitakanto', type: 'club', rank: 'D', budget: 12 },
  { id: 33, name: '足利フェニックス', city: '足利', region: 'kitakanto', type: 'club', rank: 'D', budget: 12 },
  { id: 34, name: '茨城ゴールデンホークス', city: '土浦', region: 'kitakanto', type: 'club', rank: 'C', budget: 18 },
  { id: 188, name: '常陽銀行', city: '水戸', region: 'kitakanto', type: 'corporate', rank: 'C', budget: 30 },
  { id: 189, name: '群馬ダイヤモンドペガサス', city: '前橋', region: 'kitakanto', type: 'club', rank: 'C', budget: 20 },
  { id: 190, name: '桐生スターズ', city: '桐生', region: 'kitakanto', type: 'club', rank: 'D', budget: 12 },
  { id: 191, name: '栃木グリーンナイツ', city: '栃木', region: 'kitakanto', type: 'club', rank: 'D', budget: 12 },
  { id: 192, name: '古河電工', city: '古河', region: 'kitakanto', type: 'corporate', rank: 'D', budget: 15 },
  { id: 193, name: '伊勢崎ブレーブス', city: '伊勢崎', region: 'kitakanto', type: 'club', rank: 'D', budget: 10 },

  // ========== 南関東 (企業6 + クラブ10 = 16) ==========
  { id: 35, name: 'Honda', city: '狭山', region: 'minamikanto', type: 'corporate', rank: 'S', budget: 90 },
  { id: 36, name: '日本通運', city: 'さいたま', region: 'minamikanto', type: 'corporate', rank: 'A', budget: 75 },
  { id: 37, name: 'JFE東日本', city: '千葉', region: 'minamikanto', type: 'corporate', rank: 'A', budget: 70 },
  { id: 38, name: '日本製鉄かずさマジック', city: '君津', region: 'minamikanto', type: 'corporate', rank: 'A', budget: 70 },
  { id: 39, name: '千葉ウイングス', city: '市川', region: 'minamikanto', type: 'club', rank: 'C', budget: 20 },
  { id: 40, name: 'さいたまブルーシャークス', city: 'さいたま', region: 'minamikanto', type: 'club', rank: 'C', budget: 18 },
  { id: 41, name: '川越ナインブリッジ', city: '川越', region: 'minamikanto', type: 'club', rank: 'D', budget: 15 },
  { id: 42, name: '船橋ブレイブス', city: '船橋', region: 'minamikanto', type: 'club', rank: 'D', budget: 15 },
  { id: 43, name: '所沢ライジング', city: '所沢', region: 'minamikanto', type: 'club', rank: 'D', budget: 12 },
  { id: 194, name: '太平洋セメント', city: '秩父', region: 'minamikanto', type: 'corporate', rank: 'B', budget: 50 },
  { id: 195, name: '日本ウェルネス', city: '船橋', region: 'minamikanto', type: 'corporate', rank: 'C', budget: 35 },
  { id: 196, name: '大宮アロウズ', city: 'さいたま', region: 'minamikanto', type: 'club', rank: 'C', budget: 20 },
  { id: 197, name: '市原マリンスターズ', city: '市原', region: 'minamikanto', type: 'club', rank: 'D', budget: 15 },
  { id: 198, name: '柏レイソルBC', city: '柏', region: 'minamikanto', type: 'club', rank: 'D', budget: 12 },
  { id: 199, name: '越谷ツインズ', city: '越谷', region: 'minamikanto', type: 'club', rank: 'D', budget: 12 },
  { id: 200, name: '木更津クラブ', city: '木更津', region: 'minamikanto', type: 'club', rank: 'D', budget: 10 },

  // ========== 東京 (企業10 + クラブ6 = 16) ==========
  { id: 44, name: 'NTT東日本', city: '東京', region: 'tokyo', type: 'corporate', rank: 'S', budget: 90 },
  { id: 45, name: 'JR東日本', city: '東京', region: 'tokyo', type: 'corporate', rank: 'S', budget: 95 },
  { id: 46, name: '東京ガス', city: '東京', region: 'tokyo', type: 'corporate', rank: 'A', budget: 80 },
  { id: 47, name: 'セガサミー', city: '東京', region: 'tokyo', type: 'corporate', rank: 'A', budget: 75 },
  { id: 48, name: '明治安田', city: '東京', region: 'tokyo', type: 'corporate', rank: 'A', budget: 75 },
  { id: 49, name: '鷺宮製作所', city: '東京', region: 'tokyo', type: 'corporate', rank: 'B', budget: 55 },
  { id: 50, name: 'スリーボンド', city: '東京', region: 'tokyo', type: 'corporate', rank: 'B', budget: 50 },
  { id: 51, name: 'ハナマウイ', city: '東京', region: 'tokyo', type: 'corporate', rank: 'B', budget: 50 },
  { id: 52, name: '東京都信用金庫協会', city: '東京', region: 'tokyo', type: 'corporate', rank: 'C', budget: 40 },
  { id: 53, name: '中央商事', city: '東京', region: 'tokyo', type: 'corporate', rank: 'C', budget: 35 },
  { id: 54, name: '府中アスレチクス', city: '府中', region: 'tokyo', type: 'club', rank: 'C', budget: 20 },
  { id: 55, name: '立川ルーキーズ', city: '立川', region: 'tokyo', type: 'club', rank: 'D', budget: 15 },
  { id: 56, name: '八王子グリーンズ', city: '八王子', region: 'tokyo', type: 'club', rank: 'D', budget: 15 },
  { id: 57, name: '調布レッドソックス', city: '調布', region: 'tokyo', type: 'club', rank: 'D', budget: 12 },
  { id: 58, name: '町田ゼルバス', city: '町田', region: 'tokyo', type: 'club', rank: 'D', budget: 12 },
  { id: 201, name: '国分寺クラブ', city: '国分寺', region: 'tokyo', type: 'club', rank: 'D', budget: 12 },

  // ========== 神奈川 (企業7 + クラブ9 = 16) ==========
  { id: 59, name: 'ENEOS', city: '横浜', region: 'kanagawa', type: 'corporate', rank: 'S', budget: 90 },
  { id: 60, name: '東芝', city: '川崎', region: 'kanagawa', type: 'corporate', rank: 'S', budget: 90 },
  { id: 61, name: '三菱重工East', city: '横浜', region: 'kanagawa', type: 'corporate', rank: 'S', budget: 85 },
  { id: 62, name: '横浜金属工業', city: '横浜', region: 'kanagawa', type: 'corporate', rank: 'B', budget: 50 },
  { id: 63, name: '相模原クラブ', city: '相模原', region: 'kanagawa', type: 'club', rank: 'C', budget: 20 },
  { id: 64, name: '横須賀マリンスターズ', city: '横須賀', region: 'kanagawa', type: 'club', rank: 'D', budget: 15 },
  { id: 65, name: '藤沢サザンクロス', city: '藤沢', region: 'kanagawa', type: 'club', rank: 'D', budget: 15 },
  { id: 66, name: '厚木グリフィンズ', city: '厚木', region: 'kanagawa', type: 'club', rank: 'D', budget: 12 },
  { id: 67, name: '小田原ウェーブ', city: '小田原', region: 'kanagawa', type: 'club', rank: 'D', budget: 12 },
  { id: 202, name: '日産自動車', city: '横浜', region: 'kanagawa', type: 'corporate', rank: 'A', budget: 70 },
  { id: 203, name: '三菱パワー', city: '横浜', region: 'kanagawa', type: 'corporate', rank: 'B', budget: 50 },
  { id: 204, name: '川崎フロンテック', city: '川崎', region: 'kanagawa', type: 'corporate', rank: 'C', budget: 35 },
  { id: 205, name: '横浜ベイブルース', city: '横浜', region: 'kanagawa', type: 'club', rank: 'C', budget: 20 },
  { id: 206, name: '茅ヶ崎サザンビーチ', city: '茅ヶ崎', region: 'kanagawa', type: 'club', rank: 'D', budget: 12 },
  { id: 207, name: '平塚ツインズ', city: '平塚', region: 'kanagawa', type: 'club', rank: 'D', budget: 12 },
  { id: 208, name: '大和クラブ', city: '大和', region: 'kanagawa', type: 'club', rank: 'D', budget: 10 },

  // ========== 北信越 (企業5 + クラブ11 = 16) ==========
  { id: 68, name: 'バイタルネット', city: '新潟', region: 'hokushinetsu', type: 'corporate', rank: 'B', budget: 50 },
  { id: 69, name: 'ロキテクノ富山', city: '富山', region: 'hokushinetsu', type: 'corporate', rank: 'B', budget: 50 },
  { id: 70, name: '伏木海陸運送', city: '高岡', region: 'hokushinetsu', type: 'corporate', rank: 'B', budget: 45 },
  { id: 71, name: '信越硬式野球クラブ', city: '長野', region: 'hokushinetsu', type: 'corporate', rank: 'C', budget: 35 },
  { id: 72, name: '北陸電力', city: '金沢', region: 'hokushinetsu', type: 'corporate', rank: 'C', budget: 30 },
  { id: 73, name: '新潟アルビレックスBC', city: '新潟', region: 'hokushinetsu', type: 'club', rank: 'C', budget: 20 },
  { id: 74, name: '金沢サムライズ', city: '金沢', region: 'hokushinetsu', type: 'club', rank: 'D', budget: 15 },
  { id: 75, name: '長野ブレイズ', city: '長野', region: 'hokushinetsu', type: 'club', rank: 'D', budget: 15 },
  { id: 76, name: '福井ファイアーバーズ', city: '福井', region: 'hokushinetsu', type: 'club', rank: 'D', budget: 12 },
  { id: 77, name: '上越クラブ', city: '上越', region: 'hokushinetsu', type: 'club', rank: 'D', budget: 12 },
  { id: 78, name: '松本クラブ', city: '松本', region: 'hokushinetsu', type: 'club', rank: 'D', budget: 12 },
  { id: 209, name: '富山GRNサンダーバーズ', city: '富山', region: 'hokushinetsu', type: 'club', rank: 'D', budget: 15 },
  { id: 210, name: '福井ネクサスエレファンツ', city: '福井', region: 'hokushinetsu', type: 'club', rank: 'D', budget: 12 },
  { id: 211, name: '上田クラブ', city: '上田', region: 'hokushinetsu', type: 'club', rank: 'D', budget: 10 },
  { id: 212, name: '石川ミリオンスターズ', city: '白山', region: 'hokushinetsu', type: 'club', rank: 'C', budget: 18 },
  { id: 213, name: '砺波チューリップス', city: '砺波', region: 'hokushinetsu', type: 'club', rank: 'D', budget: 10 },

  // ========== 東海 (企業13 + クラブ3 = 16) ==========
  { id: 79, name: 'トヨタ自動車', city: '豊田', region: 'tokai', type: 'corporate', rank: 'S', budget: 100 },
  { id: 80, name: 'ヤマハ', city: '浜松', region: 'tokai', type: 'corporate', rank: 'S', budget: 90 },
  { id: 81, name: 'JR東海', city: '名古屋', region: 'tokai', type: 'corporate', rank: 'A', budget: 75 },
  { id: 82, name: '西濃運輸', city: '大垣', region: 'tokai', type: 'corporate', rank: 'A', budget: 70 },
  { id: 83, name: '王子', city: '春日井', region: 'tokai', type: 'corporate', rank: 'A', budget: 70 },
  { id: 84, name: '三菱自動車岡崎', city: '岡崎', region: 'tokai', type: 'corporate', rank: 'A', budget: 70 },
  { id: 85, name: '東邦ガス', city: '名古屋', region: 'tokai', type: 'corporate', rank: 'A', budget: 70 },
  { id: 86, name: 'Honda鈴鹿', city: '鈴鹿', region: 'tokai', type: 'corporate', rank: 'A', budget: 75 },
  { id: 87, name: '東海理化', city: '名古屋', region: 'tokai', type: 'corporate', rank: 'B', budget: 55 },
  { id: 88, name: '中部電力', city: '名古屋', region: 'tokai', type: 'corporate', rank: 'B', budget: 50 },
  { id: 89, name: '名古屋鉄道', city: '名古屋', region: 'tokai', type: 'corporate', rank: 'B', budget: 50 },
  { id: 90, name: '浜松ホトニクス', city: '浜松', region: 'tokai', type: 'corporate', rank: 'C', budget: 40 },
  { id: 91, name: '静岡ガス', city: '静岡', region: 'tokai', type: 'corporate', rank: 'C', budget: 35 },
  { id: 92, name: '岐阜クラブ', city: '岐阜', region: 'tokai', type: 'club', rank: 'C', budget: 20 },
  { id: 97, name: '沼津マリナーズ', city: '沼津', region: 'tokai', type: 'club', rank: 'D', budget: 12 },
  { id: 98, name: '永和商事ウイング', city: '刈谷', region: 'tokai', type: 'club', rank: 'D', budget: 10 },

  // ========== 近畿 (企業13 + クラブ3 = 16) ==========
  { id: 99, name: 'パナソニック', city: '門真', region: 'kinki', type: 'corporate', rank: 'S', budget: 90 },
  { id: 100, name: '大阪ガス', city: '大阪', region: 'kinki', type: 'corporate', rank: 'S', budget: 85 },
  { id: 101, name: '日本生命', city: '大阪', region: 'kinki', type: 'corporate', rank: 'S', budget: 90 },
  { id: 102, name: 'NTT西日本', city: '大阪', region: 'kinki', type: 'corporate', rank: 'A', budget: 75 },
  { id: 103, name: '日本新薬', city: '京都', region: 'kinki', type: 'corporate', rank: 'A', budget: 70 },
  { id: 104, name: 'ミキハウス', city: '八尾', region: 'kinki', type: 'corporate', rank: 'B', budget: 55 },
  { id: 105, name: '三菱重工West', city: '神戸', region: 'kinki', type: 'corporate', rank: 'A', budget: 80 },
  { id: 106, name: 'カナフレックス', city: '大阪', region: 'kinki', type: 'corporate', rank: 'B', budget: 50 },
  { id: 107, name: '京セラ', city: '京都', region: 'kinki', type: 'corporate', rank: 'B', budget: 55 },
  { id: 108, name: '住友金属', city: '大阪', region: 'kinki', type: 'corporate', rank: 'B', budget: 50 },
  { id: 109, name: 'ニチダイ', city: '京田辺', region: 'kinki', type: 'corporate', rank: 'B', budget: 50 },
  { id: 110, name: '神戸製鋼所', city: '神戸', region: 'kinki', type: 'corporate', rank: 'B', budget: 50 },
  { id: 111, name: '和歌山箕島球友会', city: '和歌山', region: 'kinki', type: 'corporate', rank: 'C', budget: 35 },
  { id: 112, name: '堺ブレイザーズ', city: '堺', region: 'kinki', type: 'club', rank: 'C', budget: 20 },
  { id: 117, name: '伊丹スカイウイング', city: '伊丹', region: 'kinki', type: 'club', rank: 'D', budget: 12 },
  { id: 118, name: '豊中クラブ', city: '豊中', region: 'kinki', type: 'club', rank: 'D', budget: 10 },

  // ========== 中国 (企業10 + クラブ6 = 16) ==========
  { id: 119, name: 'JFE西日本', city: '福山', region: 'chugoku', type: 'corporate', rank: 'A', budget: 70 },
  { id: 120, name: 'JR西日本', city: '広島', region: 'chugoku', type: 'corporate', rank: 'A', budget: 70 },
  { id: 121, name: 'シティライト岡山', city: '岡山', region: 'chugoku', type: 'corporate', rank: 'B', budget: 55 },
  { id: 122, name: '伯和ビクトリーズ', city: '東広島', region: 'chugoku', type: 'corporate', rank: 'B', budget: 50 },
  { id: 123, name: '広島ガス', city: '広島', region: 'chugoku', type: 'corporate', rank: 'B', budget: 50 },
  { id: 124, name: '山陰合同銀行', city: '出雲', region: 'chugoku', type: 'corporate', rank: 'C', budget: 40 },
  { id: 125, name: '中国電力', city: '広島', region: 'chugoku', type: 'corporate', rank: 'C', budget: 35 },
  { id: 126, name: 'JFEスチール倉敷', city: '倉敷', region: 'chugoku', type: 'corporate', rank: 'C', budget: 35 },
  { id: 127, name: '山口フィナンシャルグループ', city: '下関', region: 'chugoku', type: 'corporate', rank: 'C', budget: 35 },
  { id: 128, name: '鳥取ガス', city: '鳥取', region: 'chugoku', type: 'corporate', rank: 'D', budget: 25 },
  { id: 129, name: '呉マリンクラブ', city: '呉', region: 'chugoku', type: 'club', rank: 'D', budget: 15 },
  { id: 130, name: '松江レイクス', city: '松江', region: 'chugoku', type: 'club', rank: 'D', budget: 15 },
  { id: 131, name: '福山ローズスターズ', city: '福山', region: 'chugoku', type: 'club', rank: 'D', budget: 12 },
  { id: 132, name: '周南フレアーズ', city: '周南', region: 'chugoku', type: 'club', rank: 'D', budget: 12 },
  { id: 133, name: '倉敷マスカッツBC', city: '倉敷', region: 'chugoku', type: 'club', rank: 'D', budget: 12 },
  { id: 134, name: '山口ウォリアーズ', city: '山口', region: 'chugoku', type: 'club', rank: 'D', budget: 10 },

  // ========== 四国 (企業1 + クラブ5 = 6) ==========
  { id: 135, name: '四国銀行', city: '高知', region: 'shikoku', type: 'corporate', rank: 'B', budget: 45 },
  { id: 136, name: '松山フェニックス', city: '松山', region: 'shikoku', type: 'club', rank: 'C', budget: 20 },
  { id: 137, name: '高松クラブ', city: '高松', region: 'shikoku', type: 'club', rank: 'C', budget: 18 },
  { id: 142, name: '丸亀クラブ', city: '丸亀', region: 'shikoku', type: 'club', rank: 'D', budget: 10 },
  { id: 143, name: '西条ブルーウイングス', city: '西条', region: 'shikoku', type: 'club', rank: 'D', budget: 10 },
  { id: 144, name: '宇和島パールズ', city: '宇和島', region: 'shikoku', type: 'club', rank: 'D', budget: 10 },

  // ========== 九州 (企業16 + クラブ0 = 16) ==========
  { id: 145, name: 'Honda熊本', city: '大津', region: 'kyushu', type: 'corporate', rank: 'A', budget: 75 },
  { id: 146, name: 'JR九州', city: '北九州', region: 'kyushu', type: 'corporate', rank: 'A', budget: 70 },
  { id: 147, name: '西部ガス', city: '福岡', region: 'kyushu', type: 'corporate', rank: 'A', budget: 70 },
  { id: 148, name: '宮崎梅田学園', city: '宮崎', region: 'kyushu', type: 'corporate', rank: 'B', budget: 50 },
  { id: 149, name: 'エナジック', city: '沖縄', region: 'kyushu', type: 'corporate', rank: 'B', budget: 50 },
  { id: 150, name: '新海屋', city: '福岡', region: 'kyushu', type: 'corporate', rank: 'C', budget: 35 },
  { id: 151, name: '九州電力', city: '福岡', region: 'kyushu', type: 'corporate', rank: 'B', budget: 50 },
  { id: 152, name: '福岡フィナンシャルグループ', city: '福岡', region: 'kyushu', type: 'corporate', rank: 'B', budget: 55 },
  { id: 153, name: '日本製鉄八幡', city: '北九州', region: 'kyushu', type: 'corporate', rank: 'B', budget: 50 },
  { id: 154, name: '大分石油', city: '大分', region: 'kyushu', type: 'corporate', rank: 'C', budget: 40 },
  { id: 155, name: '三菱重工長崎', city: '長崎', region: 'kyushu', type: 'corporate', rank: 'B', budget: 50 },
  { id: 156, name: '鹿児島銀行', city: '鹿児島', region: 'kyushu', type: 'corporate', rank: 'C', budget: 35 },
  { id: 158, name: '沖縄電力', city: '那覇', region: 'kyushu', type: 'corporate', rank: 'C', budget: 30 },
  { id: 160, name: '佐賀セラミクス', city: '佐賀', region: 'kyushu', type: 'corporate', rank: 'C', budget: 35 },
  { id: 161, name: '博多運輸', city: '福岡', region: 'kyushu', type: 'corporate', rank: 'C', budget: 35 },
  { id: 162, name: '九州旅客鉄道', city: '福岡', region: 'kyushu', type: 'corporate', rank: 'B', budget: 50 },

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

// 全チームを統合して返す（既存 + カスタム - 削除済み）
const getMergedTeams = () => {
  const deletedIds = new Set(loadDeletedTeamIds());
  const base = CORPORATE_TEAMS.filter(t => !deletedIds.has(t.id));
  const customs = loadCustomTeams();
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
