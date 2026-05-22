// 都市対抗野球大会 - 社会人野球のメイントーナメント
// 予選: 各地域でトーナメント（勝者側＋敗者復活）→ 本戦: 32チーム
//
// 流れ:
//  1. 各地域16チーム(上限)でシングルエリミネーション予選
//  2. 勝者側の優勝チーム＋敗者復活の上位が代表枠を獲得
//  3. 全12地域の代表31チーム＋前年優勝(推薦)1 = 32チームで本戦

import { getTeamsByRegion } from './corporateTeamsData.js';

// ============================================================
// 定数
// ============================================================

// 各地域の本選出場枠（合計31、＋推薦1＝32）
export const REGIONAL_SLOTS = {
  hokkaido: 1,
  tohoku: 2,
  hokushinetsu: 1,
  kitakanto: 2,
  tokyo: 4,
  minamikanto: 3,
  kanagawa: 2,   // 西関東
  tokai: 6,
  kinki: 5,
  chugoku: 2,
  shikoku: 1,
  kyushu: 2,
};

export const TOSHITAIKOU_REGION_NAMES = {
  hokkaido: '北海道', tohoku: '東北', hokushinetsu: '北信越',
  kitakanto: '北関東', tokyo: '東京', minamikanto: '南関東',
  kanagawa: '西関東', tokai: '東海', kinki: '近畿',
  chugoku: '中国', shikoku: '四国', kyushu: '九州',
};

const MAX_QUALIFIER_TEAMS = 16;
const RANK_ORDER = { S: 0, A: 1, B: 2, C: 3, D: 4 };
const RANK_STRENGTH = { S: 88, A: 73, B: 58, C: 43, D: 30 };

// ============================================================
// ユーティリティ
// ============================================================

const nextPowerOf2 = (n) => {
  let p = 1;
  while (p < n) p *= 2;
  return p;
};

// 標準シード配置: #1 vs #N, #N/2 vs #N/2+1, ...
// 全てのフェイバリットが勝てば#1 vs #2が決勝になる配置
function generateSeedOrder(n) {
  if (n === 1) return [0];
  const half = generateSeedOrder(n / 2);
  return half.flatMap(s => [s, n - 1 - s]);
}

// ============================================================
// ブラケット（トーナメント表）
// ============================================================

// teamNames: ランク順（シード順）の配列
// 戻り値: { size, teamCount, rounds, champion }
export function createBracket(teamNames) {
  const n = teamNames.length;
  if (n < 2) return null;

  const size = nextPowerOf2(n);
  const order = generateSeedOrder(size);
  const totalRounds = Math.log2(size);

  const firstRound = [];
  for (let i = 0; i < order.length; i += 2) {
    const t1 = order[i] < n ? teamNames[order[i]] : null;
    const t2 = order[i + 1] < n ? teamNames[order[i + 1]] : null;

    const match = {
      team1: t1, team2: t2,
      winner: null, loser: null,
      score: null, isBye: false,
    };

    if (t1 && !t2) {
      match.winner = t1;
      match.isBye = true;
    } else if (!t1 && t2) {
      match.winner = t2;
      match.isBye = true;
    }

    firstRound.push(match);
  }

  const rounds = [firstRound];
  for (let r = 1; r < totalRounds; r++) {
    const count = size / Math.pow(2, r + 1);
    const round = [];
    for (let m = 0; m < count; m++) {
      round.push({
        team1: null, team2: null,
        winner: null, loser: null,
        score: null, isBye: false,
      });
    }
    rounds.push(round);
  }

  // 不戦勝の勝者を次ラウンドに反映
  for (let r = 0; r < rounds.length - 1; r++) {
    for (let m = 0; m < rounds[r].length; m++) {
      if (rounds[r][m].winner) {
        const nm = Math.floor(m / 2);
        if (m % 2 === 0) rounds[r + 1][nm].team1 = rounds[r][m].winner;
        else rounds[r + 1][nm].team2 = rounds[r][m].winner;
      }
    }
  }

  return { size, teamCount: n, rounds, champion: null };
}

// 試合結果を記録し、勝者を次ラウンドに進める
export function recordResult(bracket, roundIdx, matchIdx, winnerName, score) {
  const match = bracket.rounds[roundIdx][matchIdx];
  match.winner = winnerName;
  match.loser = match.team1 === winnerName ? match.team2 : match.team1;
  match.score = score;

  if (roundIdx < bracket.rounds.length - 1) {
    const nm = Math.floor(matchIdx / 2);
    if (matchIdx % 2 === 0) bracket.rounds[roundIdx + 1][nm].team1 = winnerName;
    else bracket.rounds[roundIdx + 1][nm].team2 = winnerName;
  } else {
    bracket.champion = winnerName;
  }

  return bracket;
}

// 次の未消化試合を取得（team1, team2が揃っていてwinnerが未定のもの）
export function getNextUnplayedMatch(bracket) {
  for (let r = 0; r < bracket.rounds.length; r++) {
    for (let m = 0; m < bracket.rounds[r].length; m++) {
      const match = bracket.rounds[r][m];
      if (!match.winner && !match.isBye && match.team1 && match.team2) {
        return { roundIdx: r, matchIdx: m, match };
      }
    }
  }
  return null;
}

export function isBracketComplete(bracket) {
  return bracket != null && bracket.champion != null;
}

// ============================================================
// 簡易試合シミュレーション（ランクベース、AI同士用）
// ============================================================

export function simulateQuickMatch(team1Def, team2Def) {
  const str1 = RANK_STRENGTH[team1Def.rank] || 50;
  const str2 = RANK_STRENGTH[team2Def.rank] || 50;
  const p1 = str1 / (str1 + str2);

  const t1Wins = Math.random() < p1;
  const stronger = t1Wins ? str1 : str2;
  const weaker = t1Wins ? str2 : str1;
  const gap = stronger - weaker;

  const winRuns = 2 + Math.floor(Math.random() * 5) + (gap > 15 ? Math.floor(Math.random() * 3) : 0);
  const maxLose = Math.max(0, winRuns - 1);
  const loseRuns = Math.floor(Math.random() * (maxLose + 1));

  const t1Name = team1Def.displayName || team1Def.name;
  const t2Name = team2Def.displayName || team2Def.name;

  return {
    winner: t1Wins ? t1Name : t2Name,
    loser: t1Wins ? t2Name : t1Name,
    score: t1Wins ? [winRuns, loseRuns] : [loseRuns, winRuns],
  };
}

// ブラケットを全自動消化
// teamDefsMap: { [teamName]: teamDef } チーム名→定義のマップ
export function autoPlayBracket(bracket, teamDefsMap) {
  let next;
  while ((next = getNextUnplayedMatch(bracket)) !== null) {
    const { roundIdx, matchIdx, match } = next;
    const def1 = teamDefsMap[match.team1];
    const def2 = teamDefsMap[match.team2];
    if (!def1 || !def2) break;

    const result = simulateQuickMatch(def1, def2);
    recordResult(bracket, roundIdx, matchIdx, result.winner, result.score);
  }
  return bracket;
}

// ブラケットの順位を取得
// [0]=優勝, [1]=準優勝, [2-3]=SF敗退, [4-7]=QF敗退, ...
export function getBracketRankings(bracket) {
  if (!bracket || !bracket.champion) return [];

  const rankings = [];
  const finalMatch = bracket.rounds[bracket.rounds.length - 1][0];
  rankings.push(finalMatch.winner);
  if (finalMatch.loser) rankings.push(finalMatch.loser);

  for (let r = bracket.rounds.length - 2; r >= 0; r--) {
    for (const match of bracket.rounds[r]) {
      if (match.loser && !match.isBye) rankings.push(match.loser);
    }
  }

  return rankings;
}

// ============================================================
// 地域予選（勝者側トーナメント＋敗者復活トーナメント）
// ============================================================

export function createRegionalQualifier(regionId) {
  const allTeams = getTeamsByRegion(regionId);
  const sorted = [...allTeams].sort((a, b) =>
    (RANK_ORDER[a.rank] ?? 3) - (RANK_ORDER[b.rank] ?? 3)
  );
  const teams = sorted.slice(0, MAX_QUALIFIER_TEAMS);
  const slots = REGIONAL_SLOTS[regionId] || 1;

  const teamNames = teams.map(t => t.displayName || t.name);
  const teamDefsMap = {};
  teams.forEach(t => { teamDefsMap[t.displayName || t.name] = t; });

  return {
    regionId,
    regionName: TOSHITAIKOU_REGION_NAMES[regionId],
    slots,
    teamDefs: teams,
    teamDefsMap,
    mainBracket: createBracket(teamNames),
    losersBracket: null,
    qualifiedTeams: [],
    phase: 'main', // 'main' → 'losers' → 'done'
  };
}

// 勝者側完了後に敗者復活トーナメントを生成
// 敗者復活のシード: 勝者側で長く勝ち残ったチームが上位シード
export function buildLosersBracket(qualifier) {
  const mainRankings = getBracketRankings(qualifier.mainBracket);
  const losersTeamNames = mainRankings.slice(1);
  if (losersTeamNames.length < 2) return qualifier;

  qualifier.losersBracket = createBracket(losersTeamNames);
  qualifier.phase = 'losers';
  return qualifier;
}

// 地域予選を全自動消化
export function autoPlayQualifier(qualifier) {
  autoPlayBracket(qualifier.mainBracket, qualifier.teamDefsMap);
  qualifier.qualifiedTeams = [qualifier.mainBracket.champion];

  if (qualifier.slots > 1) {
    buildLosersBracket(qualifier);
    autoPlayBracket(qualifier.losersBracket, qualifier.teamDefsMap);
    const losersRankings = getBracketRankings(qualifier.losersBracket);
    const additionalSlots = qualifier.slots - 1;
    qualifier.qualifiedTeams.push(...losersRankings.slice(0, additionalSlots));
  }

  qualifier.phase = 'done';
  return qualifier;
}

// ============================================================
// 本戦（32チームトーナメント）
// ============================================================

export function createMainTournament(qualifiedByRegion, defendingChampionName) {
  const allQualified = [];
  const teamDefsMap = {};

  for (const regionId of Object.keys(REGIONAL_SLOTS)) {
    const q = qualifiedByRegion[regionId];
    if (!q || !q.qualifiedTeams) continue;

    for (const name of q.qualifiedTeams) {
      const def = q.teamDefsMap[name];
      if (def) {
        allQualified.push({ name, def, region: regionId });
        teamDefsMap[name] = def;
      }
    }
  }

  // 前年優勝チーム（推薦枠）
  if (defendingChampionName) {
    const alreadyIn = allQualified.some(t => t.name === defendingChampionName);
    if (!alreadyIn) {
      let champDef = null;
      for (const q of Object.values(qualifiedByRegion)) {
        const found = q.teamDefsMap?.[defendingChampionName];
        if (found) { champDef = found; break; }
      }
      if (champDef) {
        allQualified.unshift({ name: defendingChampionName, def: champDef, region: champDef.region, isDefending: true });
        teamDefsMap[defendingChampionName] = champDef;
      }
    }
  }

  // ランク順でシード
  allQualified.sort((a, b) =>
    (RANK_ORDER[a.def?.rank] ?? 3) - (RANK_ORDER[b.def?.rank] ?? 3)
  );

  const teamNames = allQualified.slice(0, 32).map(t => t.name);

  return {
    bracket: createBracket(teamNames),
    teams: allQualified.slice(0, 32),
    teamDefsMap,
    defendingChampion: defendingChampionName || null,
    champion: null,
    runnerUp: null,
    phase: 'playing', // 'playing' → 'done'
  };
}

export function autoPlayMainTournament(tournament) {
  autoPlayBracket(tournament.bracket, tournament.teamDefsMap);
  const rankings = getBracketRankings(tournament.bracket);
  tournament.champion = rankings[0] || null;
  tournament.runnerUp = rankings[1] || null;
  tournament.phase = 'done';
  return tournament;
}

// ============================================================
// 統合: 都市対抗大会の全工程を生成
// ============================================================

// 全12地域の予選＋本戦を生成（自動消化あり/なし選択可）
export function generateToshitaikou(options = {}) {
  const {
    defendingChampionName = null,
    userTeamName = null,
    autoSimulate = true,
  } = options;

  const qualifiers = {};
  let userRegionId = null;

  // 各地域の予選を生成
  for (const regionId of Object.keys(REGIONAL_SLOTS)) {
    const qualifier = createRegionalQualifier(regionId);

    // ユーザーチームの地域を特定
    if (userTeamName && qualifier.teamDefsMap[userTeamName]) {
      userRegionId = regionId;
    }

    qualifiers[regionId] = qualifier;
  }

  if (autoSimulate) {
    // 全予選を自動消化
    for (const regionId of Object.keys(qualifiers)) {
      autoPlayQualifier(qualifiers[regionId]);
    }

    // 本戦を生成・自動消化
    const mainTournament = createMainTournament(qualifiers, defendingChampionName);
    autoPlayMainTournament(mainTournament);

    return {
      qualifiers,
      mainTournament,
      userRegionId,
      champion: mainTournament.champion,
      runnerUp: mainTournament.runnerUp,
    };
  }

  // 手動進行モード: 予選ブラケットだけ生成、消化は呼び出し側が制御
  return {
    qualifiers,
    mainTournament: null,
    userRegionId,
    champion: null,
    runnerUp: null,
  };
}

// ============================================================
// ラウンド名称
// ============================================================

export function getRoundName(bracket, roundIdx) {
  const fromFinal = bracket.rounds.length - 1 - roundIdx;
  if (fromFinal === 0) return '決勝';
  if (fromFinal === 1) return '準決勝';
  if (fromFinal === 2) return '準々決勝';
  return `${roundIdx + 1}回戦`;
}
