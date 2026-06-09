// ============================================================
// ワールドデータ - 独立リーグ・社会人リーグ・選手プールの統合管理
// ============================================================

// グローバルミュータブルオブジェクト（TEAMS_DATAと同じパターン）
export const WORLD_DATA = {
  initialized: false,
  mode: null,            // 'independent' | 'corporate' | 'university'
  userLeagueId: null,    // ユーザーが所属するリーグID ('shikoku','bc','kyushu','hokkaido','corporate','tokyo_big6',...)
  year: 1,

  // 独立リーグの状態（リーグIDごとに管理）
  independentLeagues: {},

  // 大学リーグの状態（リージョンIDごとに管理）
  universityLeagues: {},

  // 社会人リーグの状態
  corporateLeague: {
    teams: {},           // チーム名→TEAMS_DATA参照
    userTeam: null,
  },

  // プロ（NPB）ドラフト関連
  draft: {
    draftedPlayers: [],  // 今年ドラフトされた選手
    history: [],         // 過去のドラフト履歴
  },
};

// ============================================================
// ワールド初期化・リセット
// ============================================================

export const initializeWorld = (mode, userLeagueId = null) => {
  WORLD_DATA.initialized = true;
  WORLD_DATA.mode = mode;
  WORLD_DATA.userLeagueId = userLeagueId;
  WORLD_DATA.year = 1;
  WORLD_DATA.independentLeagues = {};
  WORLD_DATA.universityLeagues = {};
  WORLD_DATA.corporateLeague = { teams: {}, userTeam: null };
  WORLD_DATA.draft = { draftedPlayers: [], history: [] };
};
