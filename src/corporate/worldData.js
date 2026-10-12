// ============================================================
// ワールドデータ - 独立リーグ・社会人リーグ・選手プールの統合管理
// ============================================================

import { resetUniversityTeamsState } from '../university/universityTeamsData.js';

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

  // 夏の甲子園の結果（操作はできないが観られる階層）。src/season/koshien.js が書き込む
  koshien: null,

  // 注目選手リスト（playerId で階層をまたいで追跡する）。src/game/watchList.js が管理
  watchList: [],
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
  WORLD_DATA.koshien = null;
  WORLD_DATA.watchList = [];
  WORLD_DATA.corporateToshitaikou = null;
  WORLD_DATA.corporateNihonSenshuken = null;
  WORLD_DATA.corporateClubSenshuken = null;
  WORLD_DATA.corporateRegionalTournament = null;
  // ⚠ 後から足されたキーもここで必ず戻すこと。以前は戻しておらず、タイトルから
  //    新しく始めると**前のゲームの監督履歴・チームランキング・推薦スカウト・
  //    大学全国大会の結果**が引き継がれていた（ページの再読込をしない限り）
  WORLD_DATA.managerCareer = [];
  WORLD_DATA._teamRanking = null;
  WORLD_DATA._universityScout = null;
  WORLD_DATA.universityLeague = null;
  WORLD_DATA._uniTournaments = null;
  WORLD_DATA.grandChampionship = null;
  resetUniversityTeamsState();
};
