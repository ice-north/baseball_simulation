// ============================================================
// ワールドデータ - 独立リーグ・社会人リーグ・選手プールの統合管理
// ============================================================

// グローバルミュータブルオブジェクト（TEAMS_DATAと同じパターン）
export const WORLD_DATA = {
  initialized: false,
  mode: null,            // 'independent' | 'corporate'
  userLeagueId: null,    // ユーザーが所属するリーグID ('shikoku','bc','kyushu','hokkaido','corporate')
  year: 1,

  // 選手プール（全リーグ共通）
  playerPools: {
    highSchool: [],      // 高卒候補（18歳）
    college: [],         // 大卒候補（22歳）
    free: [],            // フリー選手（解雇・退団）
  },

  // 独立リーグの状態（リーグIDごとに管理）
  // { shikoku: { teams: [...], schedule: [...], standings: [...] }, bc: {...}, ... }
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
// 選手プール管理
// ============================================================

// 高卒候補を生成してプールに追加（毎年オフシーズンに呼ばれる）
export const generateHighSchoolPool = (count = 50) => {
  const pool = [];
  for (let i = 0; i < count; i++) {
    pool.push(createPoolPlayer('highSchool', WORLD_DATA.year));
  }
  WORLD_DATA.playerPools.highSchool = pool;
  return pool;
};

// 大卒候補を生成してプールに追加（毎年オフシーズンに呼ばれる）
export const generateCollegePool = (count = 40) => {
  const pool = [];
  for (let i = 0; i < count; i++) {
    pool.push(createPoolPlayer('college', WORLD_DATA.year));
  }
  WORLD_DATA.playerPools.college = pool;
  return pool;
};

// フリー選手プールに追加（解雇時に呼ばれる）
export const addToFreePool = (player, fromLeague, fromTeam) => {
  WORLD_DATA.playerPools.free.push({
    ...player,
    poolEntryYear: WORLD_DATA.year,
    previousLeague: fromLeague,  // 'independent' | 'corporate'
    previousTeam: fromTeam,
    yearsInPool: 0,
  });
};

// フリー選手プールから取得（獲得時）
export const removeFromFreePool = (playerId) => {
  const idx = WORLD_DATA.playerPools.free.findIndex(p => p.id === playerId);
  if (idx === -1) return null;
  return WORLD_DATA.playerPools.free.splice(idx, 1)[0];
};

// プールの年次更新（2年経過で引退扱い）
export const updateFreePools = () => {
  WORLD_DATA.playerPools.free = WORLD_DATA.playerPools.free.filter(p => {
    p.yearsInPool = (p.yearsInPool || 0) + 1;
    return p.yearsInPool <= 2;
  });
};

// ============================================================
// プール選手の生成
// ============================================================

let nextPoolPlayerId = 10000;

const createPoolPlayer = (type, year) => {
  const id = nextPoolPlayerId++;
  const age = type === 'highSchool' ? 18 : 22;
  const isPitcher = Math.random() < 0.35;
  const position = isPitcher ? 'pitcher' : randomFieldPosition();

  // 高卒: ポテンシャル高いが現在能力低め
  // 大卒: 即戦力寄り、ポテンシャルはやや低い
  const abilityMod = type === 'highSchool'
    ? { current: -10, potential: 15 }
    : { current: 5, potential: -5 };

  const baseAbility = 30 + Math.floor(Math.random() * 25);

  return {
    id,
    type,  // 'highSchool' | 'college'
    year,
    age,
    name: generatePoolPlayerName(),
    position,
    potential: Math.min(99, Math.max(1, baseAbility + 20 + abilityMod.potential + Math.floor(Math.random() * 20))),
    scouted: false,       // スカウト済みか
    scoutAccuracy: 0,     // スカウト精度 0-100（何回視察したか）
    visibleStats: {},     // スカウトで判明した能力
    actualStats: generateActualStats(isPitcher, baseAbility + abilityMod.current),
    throws: Math.random() < 0.25 ? 'left' : 'right',
    bats: Math.random() < 0.30 ? 'left' : (Math.random() < 0.1 ? 'switch' : 'right'),
    claimed: false,       // いずれかのチームが獲得済み
    claimedBy: null,
  };
};

const FIELD_POSITIONS = ['catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'];

const randomFieldPosition = () =>
  FIELD_POSITIONS[Math.floor(Math.random() * FIELD_POSITIONS.length)];

const generateActualStats = (isPitcher, base) => {
  const r = (min, max) => Math.min(99, Math.max(1, min + Math.floor(Math.random() * (max - min + 1))));
  const b = Math.max(1, base);

  if (isPitcher) {
    return {
      batting: { meet: r(b - 15, b), power: r(b - 20, b - 5), eye: r(b - 15, b), bunt: r(15, 40), steal: r(10, 30) },
      pitching: { velocity: r(130 + Math.floor(b / 5), 142 + Math.floor(b / 3)), control: r(b, b + 20), stamina: r(80 + b, 120 + b) },
      physical: { speed: r(b - 10, b + 5), arm: r(b + 5, b + 20) },
      fielding: { defense: r(b - 5, b + 10) },
    };
  }
  return {
    batting: { meet: r(b, b + 20), power: r(b - 5, b + 15), eye: r(b - 5, b + 15), bunt: r(b - 5, b + 15), steal: r(b - 10, b + 10) },
    pitching: { velocity: r(110, 130), control: r(20, 40), stamina: r(40, 70) },
    physical: { speed: r(b - 5, b + 15), arm: r(b - 5, b + 15) },
    fielding: { defense: r(b, b + 15) },
  };
};

// 仮の名前生成（後で playerNames.js と統合）
const generatePoolPlayerName = () => {
  const lastNames = ['田中', '佐藤', '鈴木', '高橋', '渡辺', '伊藤', '山本', '中村', '小林', '加藤',
    '吉田', '山田', '佐々木', '松本', '井上', '木村', '林', '斎藤', '清水', '山口',
    '森', '池田', '橋本', '阿部', '石川', '山崎', '中島', '藤田', '小川', '後藤',
    '岡田', '長谷川', '村上', '近藤', '石井', '坂本', '遠藤', '青木', '藤井', '西村',
    '福田', '太田', '三浦', '岡本', '松田', '中野', '原田', '小野', '田村', '竹内'];
  const firstNames = ['翔太', '大輝', '健太', '拓也', '直樹', '雄大', '和也', '達也', '隼人', '大地',
    '陸', '悠真', '蓮', '颯太', '大翔', '優斗', '海斗', '陽太', '奏太', '結斗',
    '翼', '駿', '遼太', '慶太', '航', '光', '瞬', '匠', '凌', '樹'];
  return lastNames[Math.floor(Math.random() * lastNames.length)] +
         firstNames[Math.floor(Math.random() * firstNames.length)];
};

// ============================================================
// ワールド初期化・リセット
// ============================================================

export const initializeWorld = (mode, userLeagueId = null) => {
  WORLD_DATA.initialized = true;
  WORLD_DATA.mode = mode;
  WORLD_DATA.userLeagueId = userLeagueId;
  WORLD_DATA.year = 1;
  WORLD_DATA.playerPools.highSchool = [];
  WORLD_DATA.playerPools.college = [];
  WORLD_DATA.playerPools.free = [];
  WORLD_DATA.independentLeagues = {};
  WORLD_DATA.universityLeagues = {};
  WORLD_DATA.corporateLeague = { teams: {}, userTeam: null };
  WORLD_DATA.draft = { draftedPlayers: [], history: [] };
  nextPoolPlayerId = 10000;
};

export const resetWorld = () => {
  WORLD_DATA.initialized = false;
  WORLD_DATA.mode = null;
  WORLD_DATA.userLeagueId = null;
  WORLD_DATA.year = 1;
  WORLD_DATA.playerPools = { highSchool: [], college: [], free: [] };
  WORLD_DATA.independentLeagues = {};
  WORLD_DATA.universityLeagues = {};
  WORLD_DATA.corporateLeague = { teams: {}, userTeam: null };
  WORLD_DATA.draft = { draftedPlayers: [], history: [] };
  nextPoolPlayerId = 10000;
};

// ============================================================
// ワールド年次進行
// ============================================================

export const advanceWorldYear = () => {
  WORLD_DATA.year++;
  updateFreePools();
  generateHighSchoolPool();
  generateCollegePool();
};
