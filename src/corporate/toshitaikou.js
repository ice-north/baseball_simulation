// 都市対抗野球大会 - 社会人野球のメイントーナメント
// 予選: 各地域でトーナメント（勝者側＋敗者復活）→ 本戦: 32チーム
//
// 流れ:
//  1. 各地域16チーム(上限)でシングルエリミネーション予選
//  2. 勝者側の優勝チーム＋敗者復活の上位が代表枠を獲得
//  3. 全12地域の代表31チーム＋前年優勝(推薦)1 = 32チームで本戦

import { getTeamsByRegion } from './corporateTeamsData.js';
import { autoSimulateGame } from '../game/autoSimulation.js';

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

// 標準シード配置: #1が最上段、#2が最下段、#3・#4が中央
// 全てのフェイバリットが勝てば#1 vs #2が決勝になる配置
function generateSeedOrder(n) {
  if (n === 2) return [0, 1];
  const half = n / 2;
  const subOrder = generateSeedOrder(half);
  const result = [];
  for (let i = 0; i < half; i++) {
    const seed = subOrder[i];
    const complement = n - 1 - seed;
    if (i < half - 1) {
      result.push(seed, complement);
    } else {
      result.push(complement, seed);
    }
  }
  return result;
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
// 試合シミュレーション（autoSimulateGame使用、一球ごとの対戦）
// ============================================================

export function simulateQuickMatch(team1Def, team2Def) {
  const t1Name = team1Def.displayName || team1Def.name;
  const t2Name = team2Def.displayName || team2Def.name;

  const result = autoSimulateGame(t1Name, t2Name);
  if (result && (result.homeScore !== undefined)) {
    const homeWon = result.homeScore > result.awayScore;
    return {
      winner: homeWon ? t1Name : t2Name,
      loser: homeWon ? t2Name : t1Name,
      score: [result.homeScore, result.awayScore],
    };
  }

  // フォールバック: TEAMS_DATAにチームがない場合はランクベース
  const str1 = RANK_STRENGTH[team1Def.rank] || 50;
  const str2 = RANK_STRENGTH[team2Def.rank] || 50;
  const p1 = str1 / (str1 + str2);
  const t1Wins = Math.random() < p1;
  const winRuns = 2 + Math.floor(Math.random() * 5);
  const loseRuns = Math.floor(Math.random() * Math.max(1, winRuns));
  return {
    winner: t1Wins ? t1Name : t2Name,
    loser: t1Wins ? t2Name : t1Name,
    score: t1Wins ? [winRuns, loseRuns] : [loseRuns, winRuns],
  };
}

// ブラケットを全自動消化
// teamDefsMap: { [teamName]: teamDef } チーム名→定義のマップ
// excludeTeam: このチーム名が含まれる試合はスキップ
export function autoPlayBracket(bracket, teamDefsMap, excludeTeam = null) {
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < bracket.rounds.length; r++) {
      for (let m = 0; m < bracket.rounds[r].length; m++) {
        const match = bracket.rounds[r][m];
        if (match.winner || match.isBye || !match.team1 || !match.team2) continue;
        if (excludeTeam && (match.team1 === excludeTeam || match.team2 === excludeTeam)) continue;
        const def1 = teamDefsMap[match.team1];
        const def2 = teamDefsMap[match.team2];
        if (!def1 || !def2) continue;
        const result = simulateQuickMatch(def1, def2);
        recordResult(bracket, r, m, result.winner, result.score);
        changed = true;
      }
    }
  }
  return bracket;
}

// ユーザーチームの次の未消化試合を取得
export function getUserNextMatch(bracket, userTeamName) {
  if (!bracket || !userTeamName) return null;
  for (let r = 0; r < bracket.rounds.length; r++) {
    for (let m = 0; m < bracket.rounds[r].length; m++) {
      const match = bracket.rounds[r][m];
      if (!match.winner && !match.isBye && match.team1 && match.team2) {
        if (match.team1 === userTeamName || match.team2 === userTeamName) {
          return { roundIdx: r, matchIdx: m, match };
        }
      }
    }
  }
  return null;
}

// ユーザーチームがまだブラケットに残っているか
export function isUserEliminated(bracket, userTeamName) {
  if (!bracket || !userTeamName) return true;
  for (const round of bracket.rounds) {
    for (const match of round) {
      if (match.loser === userTeamName) return true;
    }
  }
  // まだ試合が残っているか
  return getUserNextMatch(bracket, userTeamName) === null && bracket.champion !== userTeamName;
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

// 地域予選を全自動消化（ユーザーチームの試合はスキップ）
export function autoPlayQualifier(qualifier, userTeamName = null) {
  autoPlayBracket(qualifier.mainBracket, qualifier.teamDefsMap, userTeamName);
  if (isBracketComplete(qualifier.mainBracket)) {
    qualifier.qualifiedTeams = [qualifier.mainBracket.champion];
    if (qualifier.slots > 1) {
      buildLosersBracket(qualifier);
      autoPlayBracket(qualifier.losersBracket, qualifier.teamDefsMap, userTeamName);
      if (isBracketComplete(qualifier.losersBracket)) {
        const losersRankings = getBracketRankings(qualifier.losersBracket);
        qualifier.qualifiedTeams.push(...losersRankings.slice(0, qualifier.slots - 1));
        qualifier.phase = 'done';
      }
    } else {
      qualifier.phase = 'done';
    }
  }
  return qualifier;
}

// ユーザーの試合結果を記録（同ラウンドの他AI試合も消化）
export function advanceQualifierWithResult(qualifier, roundIdx, matchIdx, winnerName, score, userTeamName) {
  recordResult(qualifier.mainBracket, roundIdx, matchIdx, winnerName, score);
  // 同じラウンドの残りAI試合を消化
  const round = qualifier.mainBracket.rounds[roundIdx];
  for (let m = 0; m < round.length; m++) {
    const match = round[m];
    if (match.winner || match.isBye || !match.team1 || !match.team2) continue;
    if (match.team1 === userTeamName || match.team2 === userTeamName) continue;
    const def1 = qualifier.teamDefsMap[match.team1];
    const def2 = qualifier.teamDefsMap[match.team2];
    if (!def1 || !def2) continue;
    const result = simulateQuickMatch(def1, def2);
    recordResult(qualifier.mainBracket, roundIdx, m, result.winner, result.score);
  }

  // ユーザーが敗退した場合、以降の全ラウンドを自動消化
  const userLost = winnerName !== userTeamName;
  if (userLost) {
    autoPlayBracket(qualifier.mainBracket, qualifier.teamDefsMap);
  }

  if (isBracketComplete(qualifier.mainBracket)) {
    qualifier.qualifiedTeams = [qualifier.mainBracket.champion];
    if (qualifier.slots > 1) {
      if (!qualifier.losersBracket) buildLosersBracket(qualifier);
      autoPlayBracket(qualifier.losersBracket, qualifier.teamDefsMap);
      if (isBracketComplete(qualifier.losersBracket)) {
        const losersRankings = getBracketRankings(qualifier.losersBracket);
        qualifier.qualifiedTeams.push(...losersRankings.slice(0, qualifier.slots - 1));
      }
    }
    qualifier.phase = 'done';
  }
  return qualifier;
}

// ============================================================
// 本戦（32チームトーナメント）
// ============================================================

export function createMainTournament(qualifiedByRegion, defendingChampionName, calendarYear = 2024) {
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

  const bracket = createBracket(teamNames);
  // 本戦は8月1日から2日おきにラウンド進行
  assignBracketDates(bracket, { year: calendarYear, month: 8, day: 1 }, 2);

  return {
    bracket,
    teams: allQualified.slice(0, 32),
    teamDefsMap,
    defendingChampion: defendingChampionName || null,
    champion: null,
    runnerUp: null,
    phase: 'playing',
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

// ブラケットの各ラウンドに日付を割り当て
// startDate: {year, month, day}, intervalDays: ラウンド間の日数
export function assignBracketDates(bracket, startDate, intervalDays = 2) {
  if (!bracket) return;
  bracket.roundDates = [];
  let d = new Date(startDate.year, startDate.month - 1, startDate.day);
  for (let r = 0; r < bracket.rounds.length; r++) {
    bracket.roundDates.push({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });
    d.setDate(d.getDate() + intervalDays);
  }
}

// 予選ブラケットに日程を割り当て（勝者側+敗者復活）
export function assignQualifierDates(qualifier, startDate, intervalDays = 2) {
  assignBracketDates(qualifier.mainBracket, startDate, intervalDays);
  // 敗者復活は勝者側の最終ラウンドの次の日程
  const mainRounds = qualifier.mainBracket.rounds.length;
  const d = new Date(startDate.year, startDate.month - 1, startDate.day + mainRounds * intervalDays);
  qualifier.losersStartDate = { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

// 指定日に該当するラウンドのAI試合を消化
// 戻り値: そのラウンドで試合が行われたか
export function simulateBracketRoundOnDate(bracket, teamDefsMap, dateObj, userTeamName = null) {
  if (!bracket || !bracket.roundDates) return false;
  let played = false;
  for (let r = 0; r < bracket.rounds.length; r++) {
    const rd = bracket.roundDates[r];
    if (!rd || rd.year !== dateObj.year || rd.month !== dateObj.month || rd.day !== dateObj.day) continue;
    // このラウンドの試合を消化
    for (let m = 0; m < bracket.rounds[r].length; m++) {
      const match = bracket.rounds[r][m];
      if (match.winner || match.isBye || !match.team1 || !match.team2) continue;
      if (userTeamName && (match.team1 === userTeamName || match.team2 === userTeamName)) continue;
      const def1 = teamDefsMap[match.team1];
      const def2 = teamDefsMap[match.team2];
      if (!def1 || !def2) continue;
      const result = simulateQuickMatch(def1, def2);
      recordResult(bracket, r, m, result.winner, result.score);
      played = true;
    }
  }
  return played;
}

// 予選を日付ベースで進行（勝者側＋敗者復活）
export function simulateQualifierOnDate(qualifier, dateObj, userTeamName = null) {
  const isUserRegion = userTeamName && qualifier.teamDefsMap[userTeamName];
  const utn = isUserRegion ? userTeamName : null;

  simulateBracketRoundOnDate(qualifier.mainBracket, qualifier.teamDefsMap, dateObj, utn);

  // 勝者側が完了したら代表1人目を確定＋敗者復活を生成
  if (isBracketComplete(qualifier.mainBracket) && qualifier.phase === 'main') {
    qualifier.qualifiedTeams = [qualifier.mainBracket.champion];
    if (qualifier.slots > 1) {
      buildLosersBracket(qualifier);
      // 敗者復活に日程を割り当て
      if (qualifier.losersStartDate) {
        assignBracketDates(qualifier.losersBracket, qualifier.losersStartDate, 2);
      }
    } else {
      qualifier.phase = 'done';
    }
  }

  // 敗者復活の消化（ユーザーが敗者復活にいる場合はその試合をスキップ）
  if (qualifier.losersBracket && qualifier.phase === 'losers') {
    const userInLosers = utn && isUserEliminated(qualifier.mainBracket, utn);
    simulateBracketRoundOnDate(qualifier.losersBracket, qualifier.teamDefsMap, dateObj, userInLosers ? utn : null);
    if (isBracketComplete(qualifier.losersBracket)) {
      const losersRankings = getBracketRankings(qualifier.losersBracket);
      qualifier.qualifiedTeams.push(...losersRankings.slice(0, qualifier.slots - 1));
      qualifier.phase = 'done';
    }
  }
}

// 本戦ブラケットを日付ベースで進行
export function simulateMainTournamentOnDate(tournament, dateObj, userTeamName = null) {
  if (!tournament || tournament.phase === 'done') return;
  simulateBracketRoundOnDate(tournament.bracket, tournament.teamDefsMap, dateObj, userTeamName);
  if (isBracketComplete(tournament.bracket)) {
    const rankings = getBracketRankings(tournament.bracket);
    tournament.champion = rankings[0] || null;
    tournament.runnerUp = rankings[1] || null;
    tournament.phase = 'done';
  }
}

// 指定日にユーザーのトーナメント試合があるかチェック
export function getUserMatchOnDate(toshitaikou, dateObj, userTeamName) {
  if (!toshitaikou || !userTeamName) return null;

  // 予選チェック（勝者側＋敗者復活）
  if (!toshitaikou.qualifiersDone && toshitaikou.userRegionId) {
    const q = toshitaikou.qualifiers[toshitaikou.userRegionId];
    // 勝者側ブラケット
    if (q && q.mainBracket?.roundDates) {
      for (let r = 0; r < q.mainBracket.rounds.length; r++) {
        const rd = q.mainBracket.roundDates[r];
        if (!rd || rd.year !== dateObj.year || rd.month !== dateObj.month || rd.day !== dateObj.day) continue;
        for (let m = 0; m < q.mainBracket.rounds[r].length; m++) {
          const match = q.mainBracket.rounds[r][m];
          if (!match.winner && !match.isBye && match.team1 && match.team2) {
            if (match.team1 === userTeamName || match.team2 === userTeamName) {
              return { type: 'qualifier', regionId: toshitaikou.userRegionId, roundIdx: r, matchIdx: m, match, bracketType: 'main' };
            }
          }
        }
      }
    }
    // 敗者復活ブラケット
    if (q && q.losersBracket?.roundDates) {
      for (let r = 0; r < q.losersBracket.rounds.length; r++) {
        const rd = q.losersBracket.roundDates[r];
        if (!rd || rd.year !== dateObj.year || rd.month !== dateObj.month || rd.day !== dateObj.day) continue;
        for (let m = 0; m < q.losersBracket.rounds[r].length; m++) {
          const match = q.losersBracket.rounds[r][m];
          if (!match.winner && !match.isBye && match.team1 && match.team2) {
            if (match.team1 === userTeamName || match.team2 === userTeamName) {
              return { type: 'qualifier', regionId: toshitaikou.userRegionId, roundIdx: r, matchIdx: m, match, bracketType: 'losers' };
            }
          }
        }
      }
    }
  }

  // 本戦チェック
  if (toshitaikou.mainTournament && toshitaikou.mainTournament.phase !== 'done') {
    const mt = toshitaikou.mainTournament;
    if (mt.bracket?.roundDates) {
      for (let r = 0; r < mt.bracket.rounds.length; r++) {
        const rd = mt.bracket.roundDates[r];
        if (!rd || rd.year !== dateObj.year || rd.month !== dateObj.month || rd.day !== dateObj.day) continue;
        for (let m = 0; m < mt.bracket.rounds[r].length; m++) {
          const match = mt.bracket.rounds[r][m];
          if (!match.winner && !match.isBye && match.team1 && match.team2) {
            if (match.team1 === userTeamName || match.team2 === userTeamName) {
              return { type: 'main', roundIdx: r, matchIdx: m, match, bracketType: 'main_tournament' };
            }
          }
        }
      }
    }
  }

  return null;
}

// トーナメント日程をカレンダー表示用に取得
// 戻り値: [{date, label, isUserMatch, type}]
export function getTournamentDatesForCalendar(toshitaikou, userTeamName) {
  if (!toshitaikou) return [];
  const dates = [];

  // 予選日程
  if (toshitaikou.qualifiers) {
    for (const regionId of Object.keys(toshitaikou.qualifiers)) {
      const q = toshitaikou.qualifiers[regionId];
      const isUserRegion = regionId === toshitaikou.userRegionId;
      if (q.mainBracket?.roundDates) {
        q.mainBracket.roundDates.forEach((rd, ri) => {
          const matches = q.mainBracket.rounds[ri]?.filter(m => !m.isBye && (m.team1 || m.team2));
          if (!matches || matches.length === 0) return;
          const hasUserMatch = isUserRegion && matches.some(m =>
            !m.winner && m.team1 && m.team2 && (m.team1 === userTeamName || m.team2 === userTeamName)
          );
          const allDone = matches.every(m => m.winner || m.isBye);
          dates.push({
            date: rd,
            label: isUserRegion ? '予選' : null,
            isUserMatch: hasUserMatch,
            isUserRegion,
            type: 'qualifier',
            regionId,
            done: allDone,
          });
        });
      }
      // 敗者復活ブラケットの日程
      if (q.losersBracket?.roundDates) {
        q.losersBracket.roundDates.forEach((rd, ri) => {
          const matches = q.losersBracket.rounds[ri]?.filter(m => !m.isBye && (m.team1 || m.team2));
          if (!matches || matches.length === 0) return;
          const hasUserMatch = isUserRegion && matches.some(m =>
            !m.winner && m.team1 && m.team2 && (m.team1 === userTeamName || m.team2 === userTeamName)
          );
          const allDone = matches.every(m => m.winner || m.isBye);
          dates.push({
            date: rd,
            label: isUserRegion ? '敗者復活' : null,
            isUserMatch: hasUserMatch,
            isUserRegion,
            type: 'qualifier_losers',
            regionId,
            done: allDone,
          });
        });
      }
    }
  }

  // 本戦日程
  if (toshitaikou.mainTournament?.bracket?.roundDates) {
    const mt = toshitaikou.mainTournament;
    mt.bracket.roundDates.forEach((rd, ri) => {
      const roundName = getRoundName(mt.bracket, ri);
      const matches = mt.bracket.rounds[ri]?.filter(m => !m.isBye && (m.team1 || m.team2));
      if (!matches || matches.length === 0) return;
      const hasUserMatch = matches.some(m =>
        !m.winner && m.team1 && m.team2 && (m.team1 === userTeamName || m.team2 === userTeamName)
      );
      const allDone = matches.every(m => m.winner || m.isBye);
      dates.push({
        date: rd,
        label: roundName,
        isUserMatch: hasUserMatch,
        type: 'main',
        done: allDone,
      });
    });
  }

  return dates;
}

// 全12地域の予選＋本戦を生成（日付ベース進行対応版）
export function generateToshitaikou(options = {}) {
  const {
    defendingChampionName = null,
    userTeamName = null,
    calendarYear = 2024,
  } = options;

  const qualifiers = {};
  let userRegionId = null;

  // 各地域の予選を生成
  for (const regionId of Object.keys(REGIONAL_SLOTS)) {
    const qualifier = createRegionalQualifier(regionId);

    if (userTeamName && qualifier.teamDefsMap[userTeamName]) {
      userRegionId = regionId;
    }

    qualifiers[regionId] = qualifier;
  }

  // 予選に日程を割り当て（6月1日から2日おきにラウンド進行）
  for (const regionId of Object.keys(qualifiers)) {
    assignQualifierDates(qualifiers[regionId], { year: calendarYear, month: 6, day: 1 }, 2);
  }

  const userQualifierDone = !userRegionId || qualifiers[userRegionId]?.phase === 'done';

  return {
    qualifiers,
    mainTournament: null,
    userRegionId,
    userQualifierDone,
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
