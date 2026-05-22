// ============================================================
// 社会人野球 企業チームデータ（全96チーム / 12地区連盟）
// ============================================================

export const REGIONS = [
  { id: 'hokkaido', name: '北海道', teamCount: 1 },
  { id: 'tohoku', name: '東北', teamCount: 6 },
  { id: 'kitakanto', name: '北関東', teamCount: 4 },
  { id: 'minamikanto', name: '南関東', teamCount: 4 },
  { id: 'tokyo', name: '東京', teamCount: 10 },
  { id: 'kanagawa', name: '神奈川', teamCount: 4 },
  { id: 'hokushinetsu', name: '北信越', teamCount: 5 },
  { id: 'tokai', name: '東海', teamCount: 13 },
  { id: 'kinki', name: '近畿', teamCount: 13 },
  { id: 'chugoku', name: '中国', teamCount: 10 },
  { id: 'shikoku', name: '四国', teamCount: 1 },
  { id: 'kyushu', name: '九州', teamCount: 25 },
];

// rank: S=超強豪, A=強豪, B=中堅, C=育成型, D=弱小
export const CORPORATE_TEAMS = [
  // ========== 北海道 (1) ==========
  { id: 1, name: '北海道ガステック', region: 'hokkaido', rank: 'B', budget: 50 },

  // ========== 東北 (6) ==========
  { id: 2, name: 'TDR', region: 'tohoku', rank: 'B', budget: 55 },
  { id: 3, name: 'JA東日本東北', region: 'tohoku', rank: 'A', budget: 70 },
  { id: 4, name: '七十八銀行', region: 'tohoku', rank: 'B', budget: 50 },
  { id: 5, name: '日本紙業石巻', region: 'tohoku', rank: 'B', budget: 55 },
  { id: 6, name: 'トヤタ自動車東日本', region: 'tohoku', rank: 'A', budget: 75 },
  { id: 7, name: '東北マークス', region: 'tohoku', rank: 'C', budget: 35 },

  // ========== 北関東 (4) ==========
  { id: 8, name: 'SUBARA', region: 'kitakanto', rank: 'A', budget: 70 },
  { id: 9, name: '日立製造所', region: 'kitakanto', rank: 'A', budget: 70 },
  { id: 10, name: 'エイジェス', region: 'kitakanto', rank: 'B', budget: 50 },
  { id: 11, name: '太田重工業', region: 'kitakanto', rank: 'C', budget: 35 },

  // ========== 南関東 (4) ==========
  { id: 12, name: 'Handa', region: 'minamikanto', rank: 'S', budget: 90 },
  { id: 13, name: '日本通商', region: 'minamikanto', rank: 'A', budget: 75 },
  { id: 14, name: 'JFD東日本', region: 'minamikanto', rank: 'A', budget: 70 },
  { id: 15, name: '日本製金かずさマジック', region: 'minamikanto', rank: 'A', budget: 70 },

  // ========== 東京 (10) ==========
  { id: 16, name: 'NTD東日本', region: 'tokyo', rank: 'S', budget: 90 },
  { id: 17, name: 'JA東日本', region: 'tokyo', rank: 'S', budget: 95 },
  { id: 18, name: '東京ガステック', region: 'tokyo', rank: 'A', budget: 80 },
  { id: 19, name: 'セガタミー', region: 'tokyo', rank: 'A', budget: 75 },
  { id: 20, name: '明治安国', region: 'tokyo', rank: 'A', budget: 75 },
  { id: 21, name: '鷹宮製作所', region: 'tokyo', rank: 'B', budget: 55 },
  { id: 22, name: '東都信用金庫', region: 'tokyo', rank: 'B', budget: 50 },
  { id: 23, name: '新東京通信', region: 'tokyo', rank: 'B', budget: 50 },
  { id: 24, name: '帝都建設工業', region: 'tokyo', rank: 'C', budget: 40 },
  { id: 25, name: '中央商事', region: 'tokyo', rank: 'C', budget: 35 },

  // ========== 神奈川 (4) ==========
  { id: 26, name: 'ENEAS', region: 'kanagawa', rank: 'S', budget: 90 },
  { id: 27, name: '東芝重工', region: 'kanagawa', rank: 'S', budget: 90 },
  { id: 28, name: '三菱重工イースト', region: 'kanagawa', rank: 'S', budget: 85 },
  { id: 29, name: '横浜金属工業', region: 'kanagawa', rank: 'B', budget: 50 },

  // ========== 北信越 (5) ==========
  { id: 30, name: 'バイタルネック', region: 'hokushinetsu', rank: 'B', budget: 50 },
  { id: 31, name: 'ロキテクノ富士', region: 'hokushinetsu', rank: 'B', budget: 50 },
  { id: 32, name: '伏木海陸運商', region: 'hokushinetsu', rank: 'B', budget: 45 },
  { id: 33, name: '信越化成工業', region: 'hokushinetsu', rank: 'C', budget: 35 },
  { id: 34, name: '北陸電設', region: 'hokushinetsu', rank: 'C', budget: 30 },

  // ========== 東海 (13) ==========
  { id: 35, name: 'トヤタ自動車', region: 'tokai', rank: 'S', budget: 100 },
  { id: 36, name: 'ヤマバ', region: 'tokai', rank: 'S', budget: 90 },
  { id: 37, name: 'JA東海', region: 'tokai', rank: 'A', budget: 75 },
  { id: 38, name: '西濃運商', region: 'tokai', rank: 'A', budget: 70 },
  { id: 39, name: '皇子製紙', region: 'tokai', rank: 'A', budget: 70 },
  { id: 40, name: '三菱自工岡崎', region: 'tokai', rank: 'A', budget: 70 },
  { id: 41, name: '東邦ガステック', region: 'tokai', rank: 'A', budget: 70 },
  { id: 42, name: 'Handa鈴鹿', region: 'tokai', rank: 'A', budget: 75 },
  { id: 43, name: '東海理研', region: 'tokai', rank: 'B', budget: 55 },
  { id: 44, name: '中部電設工業', region: 'tokai', rank: 'B', budget: 50 },
  { id: 45, name: '名古屋鉄道工業', region: 'tokai', rank: 'B', budget: 50 },
  { id: 46, name: '浜松ホトテクノ', region: 'tokai', rank: 'C', budget: 40 },
  { id: 47, name: '静岡瓦斯工業', region: 'tokai', rank: 'C', budget: 35 },

  // ========== 近畿 (13) ==========
  { id: 48, name: 'パナソニクス', region: 'kinki', rank: 'S', budget: 90 },
  { id: 49, name: '大阪ガステック', region: 'kinki', rank: 'S', budget: 85 },
  { id: 50, name: '日本生保', region: 'kinki', rank: 'S', budget: 90 },
  { id: 51, name: 'NTD西日本', region: 'kinki', rank: 'A', budget: 75 },
  { id: 52, name: '日本新製薬', region: 'kinki', rank: 'A', budget: 70 },
  { id: 53, name: 'ミキハウン', region: 'kinki', rank: 'B', budget: 55 },
  { id: 54, name: '三菱重工ウエスト', region: 'kinki', rank: 'A', budget: 80 },
  { id: 55, name: '関西電設工業', region: 'kinki', rank: 'B', budget: 50 },
  { id: 56, name: '京都セラミクス', region: 'kinki', rank: 'B', budget: 55 },
  { id: 57, name: '住友金工', region: 'kinki', rank: 'B', budget: 50 },
  { id: 58, name: '阪神重機', region: 'kinki', rank: 'B', budget: 50 },
  { id: 59, name: '神戸製鉄所', region: 'kinki', rank: 'B', budget: 50 },
  { id: 60, name: '紀州化成', region: 'kinki', rank: 'C', budget: 35 },

  // ========== 中国 (10) ==========
  { id: 61, name: 'JFD西日本', region: 'chugoku', rank: 'A', budget: 70 },
  { id: 62, name: 'JA西日本', region: 'chugoku', rank: 'A', budget: 70 },
  { id: 63, name: 'シティライク岡山', region: 'chugoku', rank: 'B', budget: 55 },
  { id: 64, name: '伯和ビクトリアズ', region: 'chugoku', rank: 'B', budget: 50 },
  { id: 65, name: '広島ガステック', region: 'chugoku', rank: 'B', budget: 50 },
  { id: 66, name: '山陰合同製紙', region: 'chugoku', rank: 'C', budget: 40 },
  { id: 67, name: '中国電設工業', region: 'chugoku', rank: 'C', budget: 35 },
  { id: 68, name: '岡山製鉄所', region: 'chugoku', rank: 'C', budget: 35 },
  { id: 69, name: '山口フィナンシャル', region: 'chugoku', rank: 'C', budget: 35 },
  { id: 70, name: '鳥取エナジー', region: 'chugoku', rank: 'D', budget: 25 },

  // ========== 四国 (1) ==========
  { id: 71, name: '四国信用銀行', region: 'shikoku', rank: 'B', budget: 45 },

  // ========== 九州 (25) ==========
  { id: 72, name: 'Handa熊本', region: 'kyushu', rank: 'A', budget: 75 },
  { id: 73, name: 'JA九州', region: 'kyushu', rank: 'A', budget: 70 },
  { id: 74, name: '西部ガステック', region: 'kyushu', rank: 'A', budget: 70 },
  { id: 75, name: '宮崎梅田学院', region: 'kyushu', rank: 'B', budget: 50 },
  { id: 76, name: 'エナジッグ', region: 'kyushu', rank: 'B', budget: 50 },
  { id: 77, name: '新海堂', region: 'kyushu', rank: 'C', budget: 35 },
  { id: 78, name: '九州電設工業', region: 'kyushu', rank: 'B', budget: 50 },
  { id: 79, name: '福岡フィナンシャル', region: 'kyushu', rank: 'B', budget: 55 },
  { id: 80, name: '北九州製鉄', region: 'kyushu', rank: 'B', budget: 50 },
  { id: 81, name: '大分石油化学', region: 'kyushu', rank: 'C', budget: 40 },
  { id: 82, name: '長崎造船工業', region: 'kyushu', rank: 'B', budget: 50 },
  { id: 83, name: '鹿児島信金', region: 'kyushu', rank: 'C', budget: 35 },
  { id: 84, name: '熊本運輸', region: 'kyushu', rank: 'C', budget: 35 },
  { id: 85, name: '沖縄テレコム', region: 'kyushu', rank: 'C', budget: 30 },
  { id: 86, name: '宮崎食品工業', region: 'kyushu', rank: 'D', budget: 25 },
  { id: 87, name: '佐賀セラミクス', region: 'kyushu', rank: 'C', budget: 35 },
  { id: 88, name: '博多運輸', region: 'kyushu', rank: 'C', budget: 35 },
  { id: 89, name: '九州旅客サービス', region: 'kyushu', rank: 'B', budget: 50 },
  { id: 90, name: '沖縄エナジー', region: 'kyushu', rank: 'D', budget: 20 },
  { id: 91, name: '南九州化成', region: 'kyushu', rank: 'D', budget: 25 },
  { id: 92, name: '福岡建設工業', region: 'kyushu', rank: 'C', budget: 35 },
  { id: 93, name: '大牟田製鉄', region: 'kyushu', rank: 'C', budget: 30 },
  { id: 94, name: '久留米通商', region: 'kyushu', rank: 'D', budget: 25 },
  { id: 95, name: '別府観光開発', region: 'kyushu', rank: 'D', budget: 20 },
  { id: 96, name: '那覇ロジスティクス', region: 'kyushu', rank: 'D', budget: 20 },
];

// ランク別の基本能力レンジ（選手自動生成時に使用）
export const RANK_ABILITY_RANGE = {
  S: { min: 45, max: 85, starChance: 0.20 },
  A: { min: 40, max: 75, starChance: 0.12 },
  B: { min: 35, max: 65, starChance: 0.06 },
  C: { min: 25, max: 55, starChance: 0.03 },
  D: { min: 20, max: 45, starChance: 0.01 },
};

// 予算レンジ（budget値を実際の金額に変換する際の目安）
// budget 100 = 年間1億円、budget 20 = 年間2000万円
export const BUDGET_UNIT = 100; // 万円

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
// チーム名オーバーライド（マスター設定、セーブデータに含めない）
// localStorage 'corpTeamNames' に { id: 表示名 } のマップを保存
// ============================================================

const NAMES_STORAGE_KEY = 'corpTeamNames';

const loadNameOverrides = () => {
  try {
    const raw = localStorage.getItem(NAMES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
};

const saveNameOverrides = (overrides) => {
  try {
    localStorage.setItem(NAMES_STORAGE_KEY, JSON.stringify(overrides));
  } catch { /* ignore */ }
};

// チームの表示名を取得（オーバーライドがあればそちら、なければデフォルト）
export const getTeamDisplayName = (teamId) => {
  const overrides = loadNameOverrides();
  if (overrides[teamId]) return overrides[teamId];
  const team = CORPORATE_TEAMS.find(t => t.id === teamId);
  return team ? team.name : '';
};

// チーム名を変更（マスター設定に保存）
export const setTeamDisplayName = (teamId, newName) => {
  const overrides = loadNameOverrides();
  const team = CORPORATE_TEAMS.find(t => t.id === teamId);
  if (team && newName.trim() === team.name) {
    delete overrides[teamId];
  } else {
    overrides[teamId] = newName.trim();
  }
  saveNameOverrides(overrides);
};

// チーム名をデフォルトにリセット
export const resetTeamDisplayName = (teamId) => {
  const overrides = loadNameOverrides();
  delete overrides[teamId];
  saveNameOverrides(overrides);
};

// 全チーム名をデフォルトにリセット
export const resetAllTeamDisplayNames = () => {
  localStorage.removeItem(NAMES_STORAGE_KEY);
};

// 全オーバーライドを取得（設定画面用）
export const getAllNameOverrides = () => loadNameOverrides();

// ============================================================
// ヘルパー関数
// ============================================================

export const getTeamsByRegion = (regionId) =>
  CORPORATE_TEAMS.filter(t => t.region === regionId).map(t => ({
    ...t,
    displayName: getTeamDisplayName(t.id),
  }));

export const getRegionName = (regionId) =>
  REGIONS.find(r => r.id === regionId)?.name || regionId;

export const getTeamById = (teamId) => {
  const team = CORPORATE_TEAMS.find(t => t.id === teamId);
  if (!team) return null;
  return { ...team, displayName: getTeamDisplayName(teamId) };
};

export const getRegionSlots = (regionId) =>
  REGION_SLOTS[regionId] || 1;
