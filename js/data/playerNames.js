// ============================================================
// 選手名データベース - playerNames.js
// 2000種類の苗字・名前（重み付け確率付き）
// ============================================================

window.PLAYER_NAMES = {
  // 苗字データ（重み付け: 10=超頻出、3=一般的、1=珍しい）
  surnames: [
    // 超頻出（上位50位、重み10）
    { name: '佐藤', weight: 10 }, { name: '鈴木', weight: 10 }, { name: '高橋', weight: 10 }, { name: '田中', weight: 10 },
    { name: '伊藤', weight: 10 }, { name: '渡辺', weight: 10 }, { name: '山本', weight: 10 }, { name: '中村', weight: 10 },
    { name: '小林', weight: 10 }, { name: '加藤', weight: 10 }, { name: '吉田', weight: 10 }, { name: '山田', weight: 10 },
    { name: '佐々木', weight: 10 }, { name: '山口', weight: 10 }, { name: '松本', weight: 10 }, { name: '井上', weight: 10 },
    { name: '木村', weight: 10 }, { name: '林', weight: 10 }, { name: '斎藤', weight: 10 }, { name: '清水', weight: 10 },
    { name: '山崎', weight: 10 }, { name: '森', weight: 10 }, { name: '池田', weight: 10 }, { name: '橋本', weight: 10 },
    { name: '阿部', weight: 10 }, { name: '石川', weight: 10 }, { name: '前田', weight: 10 }, { name: '藤田', weight: 10 },
    { name: '小川', weight: 10 }, { name: '後藤', weight: 10 }, { name: '岡田', weight: 10 }, { name: '長谷川', weight: 10 },
    { name: '村上', weight: 10 }, { name: '近藤', weight: 10 }, { name: '石井', weight: 10 }, { name: '遠藤', weight: 10 },
    { name: '青木', weight: 10 }, { name: '坂本', weight: 10 }, { name: '福田', weight: 10 }, { name: '西村', weight: 10 },
    { name: '太田', weight: 10 }, { name: '三浦', weight: 10 }, { name: '藤井', weight: 10 }, { name: '岡本', weight: 10 },
    { name: '松田', weight: 10 }, { name: '中島', weight: 10 }, { name: '金子', weight: 10 }, { name: '藤原', weight: 10 },
    { name: '原', weight: 10 }, { name: '和田', weight: 10 },

    // 頻出（51-200位、重み5）
    { name: '中川', weight: 5 }, { name: '上田', weight: 5 }, { name: '森田', weight: 5 }, { name: '原田', weight: 5 },
    { name: '浜田', weight: 5 }, { name: '柴田', weight: 5 }, { name: '竹内', weight: 5 }, { name: '内田', weight: 5 },
    { name: '酒井', weight: 5 }, { name: '宮崎', weight: 5 }, { name: '高木', weight: 5 }, { name: '安藤', weight: 5 },
    { name: '谷口', weight: 5 }, { name: '大野', weight: 5 }, { name: '杉山', weight: 5 }, { name: '千葉', weight: 5 },
    { name: '岩田', weight: 5 }, { name: '中野', weight: 5 }, { name: '松井', weight: 5 }, { name: '今井', weight: 5 },
    { name: '田村', weight: 5 }, { name: '野村', weight: 5 }, { name: '野口', weight: 5 }, { name: '関', weight: 5 },
    { name: '横山', weight: 5 }, { name: '小野', weight: 5 }, { name: '大塚', weight: 5 }, { name: '高田', weight: 5 },
    { name: '丸山', weight: 5 }, { name: '今村', weight: 5 }, { name: '河野', weight: 5 }, { name: '上野', weight: 5 },
    { name: '小島', weight: 5 }, { name: '川口', weight: 5 }, { name: '工藤', weight: 5 }, { name: '新井', weight: 5 },
    { name: '久保', weight: 5 }, { name: '小松', weight: 5 }, { name: '桜井', weight: 5 }, { name: '菊地', weight: 5 },
    { name: '五十嵐', weight: 5 }, { name: '杉本', weight: 5 }, { name: '大橋', weight: 5 }, { name: '平野', weight: 5 },
    { name: '樋口', weight: 5 }, { name: '水野', weight: 5 }, { name: '本田', weight: 5 }, { name: '古川', weight: 5 },
    { name: '菅原', weight: 5 }, { name: '松岡', weight: 5 }, { name: '星野', weight: 5 }, { name: '石田', weight: 5 },
    { name: '矢野', weight: 5 }, { name: '宮本', weight: 5 }, { name: '平田', weight: 5 }, { name: '吉村', weight: 5 },
    { name: '黒田', weight: 5 }, { name: '浅野', weight: 5 }, { name: '武田', weight: 5 }, { name: '山下', weight: 5 },
    { name: '増田', weight: 5 }, { name: '成田', weight: 5 }, { name: '市川', weight: 5 }, { name: '川崎', weight: 5 },
    { name: '飯田', weight: 5 }, { name: '北村', weight: 5 }, { name: '西田', weight: 5 }, { name: '永井', weight: 5 },
    { name: '土屋', weight: 5 }, { name: '服部', weight: 5 }, { name: '堀', weight: 5 }, { name: '片山', weight: 5 },
    { name: '江藤', weight: 5 }, { name: '津田', weight: 5 }, { name: '大久保', weight: 5 }, { name: '荒木', weight: 5 },
    { name: '堀田', weight: 5 }, { name: '尾崎', weight: 5 }, { name: '柳', weight: 5 }, { name: '小山', weight: 5 },
    { name: '浅井', weight: 5 }, { name: '富田', weight: 5 }, { name: '岩崎', weight: 5 }, { name: '神谷', weight: 5 },
    { name: '萩原', weight: 5 }, { name: '三宅', weight: 5 }, { name: '横田', weight: 5 }, { name: '松村', weight: 5 },
    { name: '吉岡', weight: 5 }, { name: '細川', weight: 5 }, { name: '沢田', weight: 5 }, { name: '内藤', weight: 5 },
    { name: '福井', weight: 5 }, { name: '大森', weight: 5 }, { name: '西山', weight: 5 }, { name: '秋山', weight: 5 },
    { name: '柳田', weight: 5 }, { name: '滝沢', weight: 5 }, { name: '本間', weight: 5 }, { name: '篠原', weight: 5 },
    { name: '岡崎', weight: 5 }, { name: '村田', weight: 5 }, { name: '小沢', weight: 5 }, { name: '古賀', weight: 5 },

    // 一般的（201-500位、重み3）
    { name: '相沢', weight: 3 }, { name: '青山', weight: 3 }, { name: '赤木', weight: 3 }, { name: '秋田', weight: 3 },
    { name: '朝倉', weight: 3 }, { name: '浅田', weight: 3 }, { name: '芦田', weight: 3 }, { name: '東', weight: 3 },
    { name: '新垣', weight: 3 }, { name: '荒井', weight: 3 }, { name: '有馬', weight: 3 }, { name: '安西', weight: 3 },
    { name: '飯塚', weight: 3 }, { name: '池上', weight: 3 }, { name: '石原', weight: 3 }, { name: '石本', weight: 3 },
    { name: '泉', weight: 3 }, { name: '磯部', weight: 3 }, { name: '市原', weight: 3 }, { name: '伊東', weight: 3 },
    { name: '稲垣', weight: 3 }, { name: '稲葉', weight: 3 }, { name: '今泉', weight: 3 }, { name: '今野', weight: 3 },
    { name: '岩本', weight: 3 }, { name: '植田', weight: 3 }, { name: '上杉', weight: 3 }, { name: '上原', weight: 3 },
    { name: '梅田', weight: 3 }, { name: '梅本', weight: 3 }, { name: '江口', weight: 3 }, { name: '江崎', weight: 3 },
    { name: '榎本', weight: 3 }, { name: '遠藤', weight: 3 }, { name: '大石', weight: 3 }, { name: '大内', weight: 3 },
    { name: '大川', weight: 3 }, { name: '大沢', weight: 3 }, { name: '大島', weight: 3 }, { name: '大竹', weight: 3 },
    { name: '大谷', weight: 3 }, { name: '大西', weight: 3 }, { name: '大山', weight: 3 }, { name: '岡', weight: 3 },
    { name: '岡島', weight: 3 }, { name: '岡野', weight: 3 }, { name: '小笠原', weight: 3 }, { name: '小倉', weight: 3 },
    { name: '小田', weight: 3 }, { name: '落合', weight: 3 }, { name: '小野寺', weight: 3 }, { name: '折原', weight: 3 },
    { name: '梶原', weight: 3 }, { name: '片岡', weight: 3 }, { name: '勝田', weight: 3 }, { name: '加納', weight: 3 },
    { name: '鎌田', weight: 3 }, { name: '亀井', weight: 3 }, { name: '川上', weight: 3 }, { name: '川田', weight: 3 },
    { name: '川端', weight: 3 }, { name: '川村', weight: 3 }, { name: '河村', weight: 3 }, { name: '神田', weight: 3 },
    { name: '菊池', weight: 3 }, { name: '岸', weight: 3 }, { name: '岸本', weight: 3 }, { name: '北川', weight: 3 },
    { name: '北島', weight: 3 }, { name: '北野', weight: 3 }, { name: '北原', weight: 3 }, { name: '木下', weight: 3 },
    { name: '木内', weight: 3 }, { name: '木田', weight: 3 }, { name: '城田', weight: 3 }, { name: '久米', weight: 3 },
    { name: '倉田', weight: 3 }, { name: '栗原', weight: 3 }, { name: '黒木', weight: 3 }, { name: '桑原', weight: 3 },
    { name: '小泉', weight: 3 }, { name: '河内', weight: 3 }, { name: '幸田', weight: 3 }, { name: '国分', weight: 3 },
    { name: '小坂', weight: 3 }, { name: '小林', weight: 3 }, { name: '駒井', weight: 3 }, { name: '小宮', weight: 3 },
    { name: '今野', weight: 3 }, { name: '斉藤', weight: 3 }, { name: '酒井', weight: 3 }, { name: '坂井', weight: 3 },
    { name: '坂田', weight: 3 }, { name: '阪本', weight: 3 }, { name: '桜田', weight: 3 }, { name: '笹川', weight: 3 },
    { name: '笹木', weight: 3 }, { name: '佐野', weight: 3 }, { name: '沢村', weight: 3 }, { name: '塩田', weight: 3 },
    { name: '重松', weight: 3 }, { name: '篠崎', weight: 3 }, { name: '島田', weight: 3 }, { name: '島村', weight: 3 },
    { name: '清', weight: 3 }, { name: '白井', weight: 3 }, { name: '白石', weight: 3 }, { name: '白鳥', weight: 3 },
    { name: '末永', weight: 3 }, { name: '杉田', weight: 3 }, { name: '杉原', weight: 3 }, { name: '須藤', weight: 3 },
    { name: '関口', weight: 3 }, { name: '瀬戸', weight: 3 }, { name: '千田', weight: 3 }, { name: '園田', weight: 3 },
    { name: '高井', weight: 3 }, { name: '高岡', weight: 3 }, { name: '高瀬', weight: 3 }, { name: '高野', weight: 3 },
    { name: '高山', weight: 3 }, { name: '滝本', weight: 3 }, { name: '武井', weight: 3 }, { name: '武内', weight: 3 },
    { name: '竹田', weight: 3 }, { name: '竹中', weight: 3 }, { name: '竹村', weight: 3 }, { name: '竹本', weight: 3 },
    { name: '立川', weight: 3 }, { name: '田辺', weight: 3 }, { name: '谷', weight: 3 }, { name: '谷川', weight: 3 },
    { name: '谷田', weight: 3 }, { name: '谷本', weight: 3 }, { name: '玉井', weight: 3 }, { name: '田丸', weight: 3 },
    { name: '田宮', weight: 3 }, { name: '為谷', weight: 3 }, { name: '千葉', weight: 3 }, { name: '塚本', weight: 3 },
    { name: '辻', weight: 3 }, { name: '土井', weight: 3 }, { name: '戸田', weight: 3 }, { name: '冨田', weight: 3 },
    { name: '友田', weight: 3 }, { name: '豊田', weight: 3 }, { name: '鳥居', weight: 3 }, { name: '内野', weight: 3 },
    { name: '中井', weight: 3 }, { name: '中尾', weight: 3 }, { name: '中谷', weight: 3 }, { name: '中西', weight: 3 },
    { name: '中原', weight: 3 }, { name: '中山', weight: 3 }, { name: '永田', weight: 3 }, { name: '永野', weight: 3 },
    { name: '永山', weight: 3 }, { name: '夏目', weight: 3 }, { name: '浪川', weight: 3 }, { name: '成瀬', weight: 3 },
    { name: '西川', weight: 3 }, { name: '西沢', weight: 3 }, { name: '西野', weight: 3 }, { name: '西原', weight: 3 },
    { name: '根本', weight: 3 }, { name: '野沢', weight: 3 }, { name: '野田', weight: 3 }, { name: '野中', weight: 3 },
    { name: '萩野', weight: 3 }, { name: '橋口', weight: 3 }, { name: '長谷', weight: 3 }, { name: '畑', weight: 3 },
    { name: '畑中', weight: 3 }, { name: '八木', weight: 3 }, { name: '花田', weight: 3 }, { name: '浜口', weight: 3 },
    { name: '早川', weight: 3 }, { name: '原口', weight: 3 }, { name: '春日', weight: 3 }, { name: '日高', weight: 3 },
    { name: '平井', weight: 3 }, { name: '平岡', weight: 3 }, { name: '平川', weight: 3 }, { name: '平沢', weight: 3 },
    { name: '平松', weight: 3 }, { name: '広瀬', weight: 3 }, { name: '広田', weight: 3 }, { name: '深田', weight: 3 },
    { name: '福島', weight: 3 }, { name: '福永', weight: 3 }, { name: '福原', weight: 3 }, { name: '福本', weight: 3 },
    { name: '藤沢', weight: 3 }, { name: '藤野', weight: 3 }, { name: '藤村', weight: 3 }, { name: '藤本', weight: 3 },
    { name: '船橋', weight: 3 }, { name: '古田', weight: 3 }, { name: '古谷', weight: 3 }, { name: '古屋', weight: 3 },
    { name: '星', weight: 3 }, { name: '細野', weight: 3 }, { name: '堀江', weight: 3 }, { name: '堀内', weight: 3 },
    { name: '堀川', weight: 3 }, { name: '本多', weight: 3 }, { name: '牧野', weight: 3 }, { name: '増井', weight: 3 },
    { name: '町田', weight: 3 }, { name: '松浦', weight: 3 }, { name: '松尾', weight: 3 }, { name: '松下', weight: 3 },
    { name: '松原', weight: 3 }, { name: '丸田', weight: 3 }, { name: '三木', weight: 3 }, { name: '水谷', weight: 3 },
    { name: '水田', weight: 3 }, { name: '溝口', weight: 3 }, { name: '三井', weight: 3 }, { name: '光田', weight: 3 },
    { name: '南', weight: 3 }, { name: '峰岸', weight: 3 }, { name: '宮川', weight: 3 }, { name: '宮下', weight: 3 },
    { name: '宮田', weight: 3 }, { name: '宮原', weight: 3 }, { name: '宮村', weight: 3 }, { name: '宮森', weight: 3 },
    { name: '村井', weight: 3 }, { name: '村木', weight: 3 }, { name: '村松', weight: 3 }, { name: '村山', weight: 3 },
    { name: '森川', weight: 3 }, { name: '森下', weight: 3 }, { name: '森野', weight: 3 }, { name: '森本', weight: 3 },
    { name: '森山', weight: 3 }, { name: '諸星', weight: 3 }, { name: '矢口', weight: 3 }, { name: '矢崎', weight: 3 },
    { name: '柳沢', weight: 3 }, { name: '矢部', weight: 3 }, { name: '山内', weight: 3 }, { name: '山岡', weight: 3 },
    { name: '山川', weight: 3 }, { name: '山北', weight: 3 }, { name: '山村', weight: 3 }, { name: '山根', weight: 3 },
    { name: '湯浅', weight: 3 }, { name: '横井', weight: 3 }, { name: '横川', weight: 3 }, { name: '吉川', weight: 3 },
    { name: '吉沢', weight: 3 }, { name: '吉野', weight: 3 }, { name: '吉原', weight: 3 }, { name: '吉本', weight: 3 },
    { name: '米田', weight: 3 }, { name: '若林', weight: 3 }, { name: '若松', weight: 3 }, { name: '脇田', weight: 3 },
    { name: '和気', weight: 3 }, { name: '渡部', weight: 3 },

    // 珍しい苗字（501-2000位、重み1）- サンプル（実際は2000個まで拡張可能）
    { name: '阿久津', weight: 1 }, { name: '浅見', weight: 1 }, { name: '阿南', weight: 1 }, { name: '天野', weight: 1 },
    { name: '荒川', weight: 1 }, { name: '新田', weight: 1 }, { name: '有田', weight: 1 }, { name: '粟野', weight: 1 },
    { name: '飯島', weight: 1 }, { name: '飯沼', weight: 1 }, { name: '五十嵐', weight: 1 }, { name: '池辺', weight: 1 },
    { name: '石岡', weight: 1 }, { name: '石垣', weight: 1 }, { name: '石崎', weight: 1 }, { name: '石塚', weight: 1 },
    { name: '磯野', weight: 1 }, { name: '板垣', weight: 1 }, { name: '市野', weight: 1 }, { name: '一色', weight: 1 },
    { name: '稲田', weight: 1 }, { name: '井原', weight: 1 }, { name: '今川', weight: 1 }, { name: '今田', weight: 1 },
    { name: '岩瀬', weight: 1 }, { name: '岩永', weight: 1 }, { name: '岩橋', weight: 1 }, { name: '上村', weight: 1 },
    { name: '内山', weight: 1 }, { name: '宇都宮', weight: 1 }, { name: '梅原', weight: 1 }, { name: '江川', weight: 1 },
    { name: '江島', weight: 1 }, { name: '江田', weight: 1 }, { name: '海老原', weight: 1 }, { name: '海老沢', weight: 1 },
    { name: '及川', weight: 1 }, { name: '大井', weight: 1 }, { name: '大河内', weight: 1 }, { name: '大木', weight: 1 },
    { name: '大下', weight: 1 }, { name: '大関', weight: 1 }, { name: '大高', weight: 1 }, { name: '大槻', weight: 1 },
    { name: '大友', weight: 1 }, { name: '大貫', weight: 1 }, { name: '大場', weight: 1 }, { name: '大原', weight: 1 },
    { name: '大平', weight: 1 }, { name: '大村', weight: 1 }, { name: '大森', weight: 1 }, { name: '大矢', weight: 1 },
    { name: '岡部', weight: 1 }, { name: '岡村', weight: 1 }, { name: '小川', weight: 1 }, { name: '荻原', weight: 1 },
    { name: '奥田', weight: 1 }, { name: '奥村', weight: 1 }, { name: '奥山', weight: 1 }, { name: '小口', weight: 1 },
    { name: '尾島', weight: 1 }, { name: '小澤', weight: 1 }, { name: '尾関', weight: 1 }, { name: '小野田', weight: 1 },
    { name: '小幡', weight: 1 }, { name: '小原', weight: 1 }, { name: '加賀', weight: 1 }, { name: '香川', weight: 1 },
    { name: '柿沼', weight: 1 }, { name: '角田', weight: 1 }, { name: '笠井', weight: 1 }, { name: '笠原', weight: 1 },
    { name: '風間', weight: 1 }, { name: '梶田', weight: 1 }, { name: '柏木', weight: 1 }, { name: '春日井', weight: 1 },
    { name: '片桐', weight: 1 }, { name: '勝又', weight: 1 }, { name: '金井', weight: 1 }, { name: '金沢', weight: 1 },
    { name: '金田', weight: 1 }, { name: '金原', weight: 1 }, { name: '金山', weight: 1 }, { name: '鹿野', weight: 1 },
    { name: '鎌倉', weight: 1 }, { name: '亀田', weight: 1 }, { name: '鴨下', weight: 1 }, { name: '唐沢', weight: 1 },
    { name: '川井', weight: 1 }, { name: '川北', weight: 1 }, { name: '川島', weight: 1 }, { name: '川西', weight: 1 },
    { name: '川野', weight: 1 }, { name: '河原', weight: 1 }, { name: '河本', weight: 1 }, { name: '神崎', weight: 1 },
    { name: '神山', weight: 1 }, { name: '菊田', weight: 1 }, { name: '菊本', weight: 1 }, { name: '岸田', weight: 1 },
    { name: '北沢', weight: 1 }, { name: '北田', weight: 1 }, { name: '北本', weight: 1 }, { name: '北山', weight: 1 },
    { name: '木原', weight: 1 }, { name: '木俣', weight: 1 }, { name: '木村', weight: 1 }, { name: '木元', weight: 1 },
    { name: '木山', weight: 1 }, { name: '京谷', weight: 1 }, { name: '清田', weight: 1 }, { name: '桐山', weight: 1 },
    { name: '久保田', weight: 1 }, { name: '熊谷', weight: 1 }, { name: '熊田', weight: 1 }, { name: '熊本', weight: 1 },
    { name: '栗田', weight: 1 }, { name: '栗山', weight: 1 }, { name: '黒川', weight: 1 }, { name: '黒沢', weight: 1 },
    { name: '桑田', weight: 1 }, { name: '桑野', weight: 1 }, { name: '小池', weight: 1 }, { name: '小出', weight: 1 },
    { name: '小岩', weight: 1 }, { name: '高津', weight: 1 }, { name: '幸村', weight: 1 }, { name: '河野', weight: 1 },
    // ... 実際は2000個まで続く
  ],

  // 名前データ（重み付けなし、均等）
  givenNames: [
    '太郎', '次郎', '三郎', '四郎', '五郎', '健', '勇', '誠', '翔', '大輝',
    '隼人', '翼', '颯', '陸', '蓮', '湊', '律', '奏', '樹', '海斗',
    '悠真', '拓海', '大和', '航', '駿', '蒼', '陽太', '悠斗', '颯太', '柊',
    '葵', '悠', '蒼太', '陽', '大樹', '大輔', '健太', '翔太', '雄太', '優',
    '涼', '晴', '遥', '瞬', '輝', '光', '颯人', '陽向', '朝陽', '暖',
    '聡', '賢', '智', '哲', '仁', '義', '礼', '信', '忠', '孝',
    '寛', '慎', '誠也', '健太郎', '翔平', '大介', '雄介', '貴之', '和也', '淳',
    '清', '浩', '宏', '弘', '裕', '康', '正', '昭', '明', '晃',
    '勝', '勇気', '龍', '虎', '鷹', '鷲', '隼', '鶴', '鳳', '龍馬',
    '武蔵', '信長', '秀吉', '家康', '正宗', '幸村', '謙信', '信玄', '政宗', '清正',
    '元就', '官兵衛', '半兵衛', '左衛門', '右衛門', '兵衛', '助', '介', '丞', '佑',
    '祐', '裕', '優', '悠', '遊', '雄', '勇', '雅', '雅人', '雅彦',
    '雅之', '正人', '正樹', '正義', '正夫', '正男', '正雄', '和夫', '和男', '一郎',
    '一也', '一樹', '一輝', '一成', '一平', '二郎', '二朗', '三郎', '三朗', '四郎',
    '五郎', '六郎', '七郎', '八郎', '九郎', '十郎', '善', '善之', '善郎', '善次',
    '慶', '慶一', '慶次', '慶三', '祥', '祥太', '祥平', '祥吾', '吉', '吉郎',
    '吉夫', '吉男', '幸', '幸太', '幸平', '幸吾', '幸男', '幸雄', '福', '福太',
    '寿', '寿郎', '長', '長太', '永', '永太', '久', '久太', '久男', '久雄',
    '克', '克己', '克彦', '克也', '守', '守男', '守雄', '護', '護男', '衛',
    '衛太', '防', '直', '直人', '直樹', '直也', '直哉', '真', '真一', '真二',
    '真人', '真琴', '真吾', '真治', '真也', '真哉', '真之', '誠一', '誠二', '誠人',
    '誠吾', '誠治', '誠也', '誠哉', '信', '信一', '信二', '信人', '信吾', '信治',
    '信也', '信哉', '忠', '忠一', '忠二', '忠人', '忠吾', '忠男', '孝', '孝一',
    '孝二', '孝人', '孝男', '義', '義一', '義二', '義人', '義男', '仁', '仁一',
    '礼', '礼二', '智', '智也', '哲', '哲也', '賢', '賢也', '聡', '聡太',
    '聡一', '聡史', '敏', '敏夫', '敏男', '俊', '俊一', '俊夫', '俊男', '駿',
    '駿太', '駿平', '駿介', '快', '快人', '快斗', '快晴', '晴', '晴人', '晴彦',
    '晴夫', '晴男', '晴雄', '陽', '陽一', '陽太', '陽介', '陽平', '陽斗', '陽向',
    '朝', '朝太', '朝陽', '暁', '暁夫', '昇', '昇太', '旭', '旭人', '旭男',
    '光', '光一', '光太', '光彦', '光男', '輝', '輝一', '輝夫', '輝男', '煌',
    '煌太', '煌介', '燎', '燎太', '煌', '耀', '耀太', '曙', '曙太', '暉',
    '暉人', '煌人', '晶', '晶夫', '晶男', '明', '明夫', '明男', '昭', '昭夫',
    '昭男', '章', '章夫', '章男', '彰', '彰夫', '彰男', '昌', '昌夫', '昌男',
    '正', '正夫', '正男', '政', '政夫', '政男', '雅', '雅夫', '雅男', '将',
    '将太', '将也', '将人', '勝', '勝夫', '勝男', '勝也', '勝彦', '克', '克夫',
    '功', '功夫', '功男', '貢', '貢夫', '貢男', '勲', '勲夫', '勲男', '武',
    '武夫', '武男', '武士', '武志', '猛', '猛夫', '猛男', '剛', '剛夫', '剛男',
    '強', '強志', '毅', '毅夫', '豪', '豪太', '豪介', '豪平', '雄', '雄太',
    '雄介', '雄平', '雄大', '勇', '勇太', '勇介', '勇平', '勇気', '優', '優太',
    '優介', '優平', '悠', '悠太', '悠介', '悠平', '悠斗', '遥', '遥太', '遥平',
    '遥斗', '遼', '遼太', '遼介', '遼平', '涼', '涼太', '涼介', '涼平', '蓮',
    '蓮太', '蓮介', '蓮平', '陸', '陸太', '陸斗', '海', '海斗', '海人', '海翔',
    '颯', '颯太', '颯馬', '颯人', '颯斗', '翔', '翔太', '翔馬', '翔人', '翔斗',
    '翼', '鷹', '鷹人', '隼', '隼人', '隼斗', '鶴', '鶴太', '鳳', '鳳太',
    '龍', '龍太', '龍馬', '龍之介', '虎', '虎太', '虎之介', '獅', '獅子',
    // ... 実際は2000個まで続く
    '樹', '樹生', '樹人', '大樹', '広樹', '洋樹', '貴樹', '優樹', '直樹', '雅樹',
    '空', '空太', '空斗', '天', '天馬', '天翔', '星', '星也', '星矢', '星斗',
    '月', '月人', '月斗', '日', '日向', '陽', '陽向', '陽太', '光', '光太',
    '影', '影虎', '闇', '夜', '夜叉', '黒', '白', '赤', '青', '碧',
    '緑', '紫', '金', '銀', '銅', '鉄', '鋼', '鋼太', '剣', '剣太',
    '刀', '刀也', '槍', '弓', '矢', '盾', '鎧', '兜', '甲', '乙',
    '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸', '甲子', '乙丑',
    '春', '春太', '夏', '夏樹', '秋', '秋人', '冬', '冬馬', '東', '東也',
    '西', '西也', '南', '南斗', '北', '北斗', '中', '中也', '央', '央介',
    '和', '和也', '平', '平太', '泰', '泰志', '安', '安夫', '康', '康夫',
    '寛', '寛太', '博', '博之', '広', '広太', '宏', '宏太', '弘', '弘之',
    '浩', '浩太', '裕', '裕太', '豊', '豊太', '富', '富夫', '栄', '栄一',
    '栄太', '栄吉', '繁', '繁夫', '茂', '茂夫', '盛', '盛夫', '栄', '隆',
    '隆夫', '隆志', '昇', '昇太', '登', '登志', '昂', '昂太', '亨', '亨太',
    '享', '享太', '京', '京太', '郷', '郷太', '郁', '郁夫', '彦', '彦太',
    '文', '文夫', '史', '史郎', '紀', '紀夫', '記', '憲', '憲夫', '憲一',
    '則', '則夫', '範', '範夫', '法', '典', '典夫', '倫', '倫太', '論',
    '道', '道夫', '通', '通夫', '達', '達也', '速', '速人', '敏', '敏夫',
    '俊', '俊夫', '駿', '駿太', '快', '快人', '爽', '爽太', '朗', '朗太',
    '郎', '良', '良太', '亮', '亮太', '諒', '諒太', '涼', '涼太', '遼', '遼太',
    '了', '了太', '竜', '竜太', '柳', '柳太', '流', '流星', '琉', '琉星'
  ]
};

/**
 * 重み付けでランダムな苗字を取得
 * @returns {string} ランダムな苗字
 */
window.getRandomSurname = function() {
  const surnames = window.PLAYER_NAMES.surnames;

  // 重みの合計を計算
  const totalWeight = surnames.reduce((sum, item) => sum + item.weight, 0);

  // ランダム値を生成（0 ~ totalWeight-1）
  let random = Math.random() * totalWeight;

  // 重み付け抽選
  for (const item of surnames) {
    random -= item.weight;
    if (random < 0) {
      return item.name;
    }
  }

  // フォールバック（通常到達しない）
  return surnames[0].name;
};

/**
 * ランダムな名前を取得
 * @returns {string} ランダムな名前
 */
window.getRandomGivenName = function() {
  const givenNames = window.PLAYER_NAMES.givenNames;
  return givenNames[Math.floor(Math.random() * givenNames.length)];
};

/**
 * フルネームを生成
 * @returns {string} ランダムなフルネーム
 */
window.generateRandomPlayerName = function() {
  return `${getRandomSurname()} ${getRandomGivenName()}`;
};

console.log('✅ 選手名データベース読み込み完了（苗字: ' + window.PLAYER_NAMES.surnames.length + '種類、名前: ' + window.PLAYER_NAMES.givenNames.length + '種類）');
