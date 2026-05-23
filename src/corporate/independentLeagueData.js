// ============================================================
// 独立リーグ定義データ
// 4リーグ計20チーム（地名ベースの自動生成名）
// ============================================================

export const INDEPENDENT_LEAGUES = {
  shikoku: {
    id: 'shikoku',
    name: '四国アイランドリーグplus',
    useDH: false,
    gamesPerSeason: 75,
    leagueFormat: 'single',
    playoffFormat: 'short',
    teams: [
      { id: 'il_shikoku_1', name: '徳島インディゴソックス', abbreviation: '徳島', city: '徳島', rank: 'B' },
      { id: 'il_shikoku_2', name: '香川オリーブガイナーズ', abbreviation: '香川', city: '高松', rank: 'B' },
      { id: 'il_shikoku_3', name: '愛媛マンダリンパイレーツ', abbreviation: '愛媛', city: '松山', rank: 'B' },
      { id: 'il_shikoku_4', name: '高知ファイティングドッグス', abbreviation: '高知', city: '高知', rank: 'B' },
    ],
  },
  bc: {
    id: 'bc',
    name: 'BCリーグ',
    useDH: false,
    gamesPerSeason: 50,
    leagueFormat: 'two',
    leagueNames: ['ルートインBC信越', 'ルートインBC北陸'],
    playoffFormat: 'short',
    teams: [
      { id: 'il_bc_1', name: '信濃グランセローズ', abbreviation: '信濃', city: '長野', rank: 'B' },
      { id: 'il_bc_2', name: '新潟アルビレックスBC', abbreviation: '新潟', city: '新潟', rank: 'B' },
      { id: 'il_bc_3', name: '群馬ダイヤモンドペガサス', abbreviation: '群馬', city: '高崎', rank: 'C' },
      { id: 'il_bc_4', name: '富山サンダーバーズ', abbreviation: '富山', city: '富山', rank: 'B' },
      { id: 'il_bc_5', name: '石川ミリオンスターズ', abbreviation: '石川', city: '金沢', rank: 'B' },
      { id: 'il_bc_6', name: '福井ワイルドラプターズ', abbreviation: '福井', city: '福井', rank: 'C' },
    ],
  },
  kyushu: {
    id: 'kyushu',
    name: '九州アジアリーグ',
    useDH: false,
    gamesPerSeason: 75,
    leagueFormat: 'single',
    playoffFormat: 'tournament',
    teams: [
      { id: 'il_kyushu_1', name: '火の国サラマンダーズ', abbreviation: '火国', city: '熊本', rank: 'B' },
      { id: 'il_kyushu_2', name: '大分B-リングス', abbreviation: '大分', city: '大分', rank: 'C' },
      { id: 'il_kyushu_3', name: '北九州下関フェニックス', abbreviation: '北九', city: '北九州', rank: 'B' },
      { id: 'il_kyushu_4', name: '宮崎サンシャインズ', abbreviation: '宮崎', city: '宮崎', rank: 'C' },
    ],
  },
  hokkaido: {
    id: 'hokkaido',
    name: '北海道フロンティアリーグ',
    useDH: false,
    gamesPerSeason: 57,
    leagueFormat: 'single',
    playoffFormat: 'full',
    teams: [
      { id: 'il_hokkaido_1', name: '石狩レッドフェニックス', abbreviation: '石狩', city: '石狩', rank: 'C' },
      { id: 'il_hokkaido_2', name: '美唄ブラックダイヤモンズ', abbreviation: '美唄', city: '美唄', rank: 'C' },
      { id: 'il_hokkaido_3', name: '士別サムライブレイズ', abbreviation: '士別', city: '士別', rank: 'D' },
      { id: 'il_hokkaido_4', name: '別海パイロットスピリッツ', abbreviation: '別海', city: '別海', rank: 'D' },
    ],
  },
};

export const ALL_INDEPENDENT_LEAGUE_IDS = Object.keys(INDEPENDENT_LEAGUES);

export const getIndependentLeague = (leagueId) => INDEPENDENT_LEAGUES[leagueId] || null;

export const getAllIndependentTeams = () => {
  const teams = [];
  for (const league of Object.values(INDEPENDENT_LEAGUES)) {
    teams.push(...league.teams);
  }
  return teams;
};
