// ============================================================
// sim-harness フルワールド構築 & 年次進行
//
// 独立リーグモードの新規ゲームと同じ世界（ユーザーリーグ + 社会人179 +
// 他独立リーグ + 大学234校 + 高校生プール）をヘッドレスで構築し、実物の
// 年次進行シーケンス（表彰→ドラフト→advanceToNextYear→翌年高校生生成）を回す。
//
// 実ゲームの年次フローは複数UI画面に分散している。ここでは React state を除いた
// 実質シーケンスを再現する:
//   ManagementScreen(draft): frozenAwards = processSeasonEnd → finalRankings =
//                            snapshotRankings → processNPBDraft
//   OffSeasonScreen:         advanceToNextYear
//   翌4月:                    generateAprilHighSchoolClass
//
// 【近似】ユーザーリーグや社会人/大学の実試合は消化しない。CPU成績は
// advanceToNextYear 内の simulateParallelWorldStats が注入し、ドラフト評価は
// 能力ベースで成立する。よって出場数由来の growthModifier や表彰 fame は過小評価
// 気味になる（多年次のドラフト比率が徐々に高校寄りに漂流するのはこの影響を含む）。
// 人口保存・年齢ピラミッド・引退規模・クラブ指名・無クラッシュ性の検証には十分。
// ============================================================

import { SRC } from './bootstrap.mjs';

const { TEAMS_DATA, initializeTeamsForCount, initializeAllPitchingRotations } =
  await import(SRC + '/teams-data.js');
const { generateExpansionRoster } = await import(SRC + '/season/tryoutSystem.js');
const { initializeParallelWorldForIndependent } = await import(SRC + '/corporate/corporateInit.js');
const { generateAprilHighSchoolClass, processSeasonEnd, snapshotRankings,
        processNPBDraft, advanceToNextYear } = await import(SRC + '/season/yearProgressionSystem.js');
const { createSeasonData } = await import(SRC + '/season/seasonManager.js');

export { TEAMS_DATA };

// 内部診断ログを黙らせて関数を実行する。
function quiet(fn) {
  const orig = console.log;
  console.log = () => {};
  try { return fn(); } finally { console.log = orig; }
}

// 独立リーグモードのフルワールドを構築する。戻り値 { seasonData, userTeams }。
export function bootstrapWorld(opts = {}) {
  const { userLeagueId = 'shikoku', userTeamNames = ['高知', '徳島', '愛媛', '香川'], rosterSize = 28 } = opts;

  const userTeams = initializeTeamsForCount(userTeamNames.length, userTeamNames);
  for (const n of userTeams) {
    TEAMS_DATA[n].players = generateExpansionRoster(1, rosterSize).map(p => ({ ...p, number: p.id }));
  }
  initializeAllPitchingRotations();

  quiet(() => initializeParallelWorldForIndependent(userLeagueId, userTeams));
  generateAprilHighSchoolClass(1);

  const seasonData = createSeasonData(1);
  seasonData.settings = { teamNames: userTeams, preset: userLeagueId };
  return { seasonData, userTeams };
}

// 1年ぶんの年次進行を実行する。戻り値は当年のメトリクス、副作用でグローバル更新。
// 引数の seasonData は当年のもの。新 seasonData を返り値 .nextSeasonData に含める。
export function advanceYear(seasonData) {
  const year = seasonData.year;
  const result = quiet(() => {
    seasonData.frozenAwards = processSeasonEnd(seasonData, TEAMS_DATA);
    seasonData.finalRankings = snapshotRankings(TEAMS_DATA, seasonData.settings?.teamNames);
    const draft = processNPBDraft(TEAMS_DATA, year);
    const adv = advanceToNextYear(seasonData, TEAMS_DATA);
    generateAprilHighSchoolClass(adv.newSeasonData.year);
    return { draft, adv };
  });

  // 選手プール漏れ（過去にあった「大学卒業生のリリースプール消失」等）を模擬する
  // 自己検証モード。毎年ロスターから一定割合を静かに落とし、人口保存トリップワイヤが
  // 発火するか確認する。数年で初年比88%を割り込むはず。
  if (process.env.SIM_HARNESS_LEAK === '1') {
    for (const name of Object.keys(TEAMS_DATA)) {
      const players = TEAMS_DATA[name].players;
      if (Array.isArray(players) && players.length > 4) {
        players.splice(0, Math.ceil(players.length * 0.04)); // 毎年4%漏らす
      }
    }
  }

  const { draft, adv } = result;
  const s = draft.draftBySource || {};
  const drafted = draft.draftedPlayers || [];

  return {
    year,
    nextSeasonData: adv.newSeasonData,
    draftTotal: drafted.length,
    draftClub: drafted.filter(p => p.isClub).length,
    bySource: {
      highschool: s.highschool || 0,
      university: (s.university || 0) + (s.university_team || 0),
      corporate: s.corporate || 0,
      independent: s.independent || 0,
    },
    retirements: adv.retirements?.length || 0,
    population: countPopulation(),
    ageGroups: ageGroups(),
    positions: positionShares(),
  };
}

export function countPopulation() {
  let n = 0;
  for (const name of Object.keys(TEAMS_DATA)) n += (TEAMS_DATA[name].players?.length || 0);
  return n;
}

// 全チーム選手のポジション別シェア（%）。多年次でのポジション偏り
// （捕手不足・投手過多）を検出するため。
export function positionShares() {
  const c = {};
  let total = 0;
  for (const name of Object.keys(TEAMS_DATA)) {
    for (const p of (TEAMS_DATA[name].players || [])) {
      c[p.position] = (c[p.position] || 0) + 1;
      total++;
    }
  }
  if (total === 0) return { pitcher: 0, catcher: 0, infield: 0, outfield: 0 };
  const inf = (c.first || 0) + (c.second || 0) + (c.third || 0) + (c.short || 0);
  const outf = (c.left || 0) + (c.center || 0) + (c.right || 0);
  return {
    pitcher: (c.pitcher || 0) / total * 100,
    catcher: (c.catcher || 0) / total * 100,
    infield: inf / total * 100,
    outfield: outf / total * 100,
  };
}

// 全チーム選手を年齢帯にまとめる（デモグラフィ健全性チェック用）。
export function ageGroups() {
  const g = { '18-21': 0, '22-25': 0, '26-29': 0, '30-33': 0, '34+': 0 };
  for (const name of Object.keys(TEAMS_DATA)) {
    for (const p of (TEAMS_DATA[name].players || [])) {
      const a = p.age || 0;
      if (a < 18) continue;
      if (a <= 21) g['18-21']++;
      else if (a <= 25) g['22-25']++;
      else if (a <= 29) g['26-29']++;
      else if (a <= 33) g['30-33']++;
      else g['34+']++;
    }
  }
  return g;
}
