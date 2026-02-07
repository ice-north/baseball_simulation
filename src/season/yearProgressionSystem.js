// ============================================================
// 年間進行システム - yearProgressionSystem.js
// シーズン終了処理、年度更新、引退、解雇
// 年齢カーブによる成長・衰退システム
// ============================================================

import { createSeasonData, initializeStandings } from './seasonManager.js';
import { generateFullSeasonSchedule } from './scheduleGenerator.js';

/**
 * シーズン終了処理
 * @param {Object} seasonData - シーズンデータ
 * @param {Object} allTeams - 全チームデータ
 * @returns {Object} - 表彰結果と統計
 */
export function processSeasonEnd(seasonData, allTeams) {
  const awards = {
    champion: null,           // 優勝チーム
    battingChampion: null,    // 首位打者
    homeRunKing: null,        // 本塁打王
    rbiKing: null,            // 打点王
    stolenBaseKing: null,     // 盗塁王
    eraChampion: null,        // 最優秀防御率
    winsLeader: null,         // 最多勝
    savesLeader: null,        // 最多セーブ
    strikeoutKing: null       // 最多奪三振
  };

  // 優勝チーム確定
  if (seasonData.standings && seasonData.standings.length > 0) {
    const sortedStandings = [...seasonData.standings].sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (a.losses !== b.losses) return a.losses - b.losses;
      return b.winRate - a.winRate;
    });
    awards.champion = sortedStandings[0].team;
  }

  // 個人タイトル集計
  const allPlayers = [];
  Object.entries(allTeams).forEach(([teamName, team]) => {
    team.players.forEach(player => {
      allPlayers.push({
        ...player,
        teamName: teamName
      });
    });
  });

  // 打撃タイトル
  const qualifiedBatters = allPlayers.filter(p =>
    p.seasonStats.batting.atBats >= 100
  );

  if (qualifiedBatters.length > 0) {
    // 首位打者（最高打率）
    const battingLeader = qualifiedBatters.reduce((best, p) => {
      const avg = p.seasonStats.batting.atBats > 0
        ? p.seasonStats.batting.hits / p.seasonStats.batting.atBats
        : 0;
      const bestAvg = best.seasonStats.batting.atBats > 0
        ? best.seasonStats.batting.hits / best.seasonStats.batting.atBats
        : 0;
      return avg > bestAvg ? p : best;
    });
    awards.battingChampion = {
      name: battingLeader.name,
      team: battingLeader.teamName,
      avg: (battingLeader.seasonStats.batting.hits / battingLeader.seasonStats.batting.atBats).toFixed(3)
    };

    // 本塁打王
    const hrLeader = qualifiedBatters.reduce((best, p) =>
      p.seasonStats.batting.homeruns > best.seasonStats.batting.homeruns ? p : best
    );
    awards.homeRunKing = {
      name: hrLeader.name,
      team: hrLeader.teamName,
      homeruns: hrLeader.seasonStats.batting.homeruns
    };

    // 打点王
    const rbiLeader = qualifiedBatters.reduce((best, p) =>
      p.seasonStats.batting.rbis > best.seasonStats.batting.rbis ? p : best
    );
    awards.rbiKing = {
      name: rbiLeader.name,
      team: rbiLeader.teamName,
      rbis: rbiLeader.seasonStats.batting.rbis
    };

    // 盗塁王
    const sbLeader = qualifiedBatters.reduce((best, p) =>
      p.seasonStats.batting.stolenBases > best.seasonStats.batting.stolenBases ? p : best
    );
    awards.stolenBaseKing = {
      name: sbLeader.name,
      team: sbLeader.teamName,
      stolenBases: sbLeader.seasonStats.batting.stolenBases
    };
  }

  // 投手タイトル
  const qualifiedPitchers = allPlayers.filter(p =>
    p.seasonStats.pitching.inningsPitched >= 30
  );

  if (qualifiedPitchers.length > 0) {
    // 最優秀防御率
    const eraLeader = qualifiedPitchers.reduce((best, p) => {
      const era = p.seasonStats.pitching.inningsPitched > 0
        ? (p.seasonStats.pitching.earnedRuns * 27) / p.seasonStats.pitching.inningsPitched
        : 99.99;
      const bestEra = best.seasonStats.pitching.inningsPitched > 0
        ? (best.seasonStats.pitching.earnedRuns * 27) / best.seasonStats.pitching.inningsPitched
        : 99.99;
      return era < bestEra ? p : best;
    });
    const era = (eraLeader.seasonStats.pitching.earnedRuns * 27) / eraLeader.seasonStats.pitching.inningsPitched;
    awards.eraChampion = {
      name: eraLeader.name,
      team: eraLeader.teamName,
      era: era.toFixed(2)
    };

    // 最多勝
    const winsLeader = qualifiedPitchers.reduce((best, p) =>
      p.seasonStats.pitching.wins > best.seasonStats.pitching.wins ? p : best
    );
    awards.winsLeader = {
      name: winsLeader.name,
      team: winsLeader.teamName,
      wins: winsLeader.seasonStats.pitching.wins
    };

    // 最多セーブ
    const savesLeader = allPlayers.reduce((best, p) =>
      p.seasonStats.pitching.saves > best.seasonStats.pitching.saves ? p : best
    );
    if (savesLeader.seasonStats.pitching.saves > 0) {
      awards.savesLeader = {
        name: savesLeader.name,
        team: savesLeader.teamName,
        saves: savesLeader.seasonStats.pitching.saves
      };
    }

    // 最多奪三振
    const soLeader = qualifiedPitchers.reduce((best, p) =>
      p.seasonStats.pitching.strikeouts > best.seasonStats.pitching.strikeouts ? p : best
    );
    awards.strikeoutKing = {
      name: soLeader.name,
      team: soLeader.teamName,
      strikeouts: soLeader.seasonStats.pitching.strikeouts
    };
  }

  return awards;
};

/**
 * 全選手の年齢を1歳増やす
 * @param {Object} allTeams - 全チームデータ
 * @returns {Object} - 更新されたチームデータ
 */
export function updateAllPlayerAges(allTeams) {
  const updatedTeams = {};

  Object.entries(allTeams).forEach(([teamName, team]) => {
    updatedTeams[teamName] = {
      ...team,
      players: team.players.map(player => ({
        ...player,
        age: (player.age || 20) + 1
      }))
    };
  });

  return updatedTeams;
};

/**
 * NPBドラフト候補条件を判定
 * 投手: 通算30勝以上、または通算450奪三振以上、または通算50セーブ以上
 * 野手: 通算打率.280以上、または通算70本塁打以上、または通算500安打以上
 * @param {Object} player - 選手データ
 * @returns {Object} - { isDraftEligible: boolean, reasons: string[] }
 */
export function checkNPBDraftEligibility(player) {
  const isPitcher = player.position === 'pitcher';
  const reasons = [];

  // 通算成績
  const careerStats = player.careerStats || { batting: {}, pitching: {} };
  const careerWins = careerStats.pitching?.wins || 0;
  const careerStrikeouts = careerStats.pitching?.strikeouts || 0;
  const careerSaves = careerStats.pitching?.saves || 0;
  const careerHits = careerStats.batting?.hits || 0;
  const careerAtBats = careerStats.batting?.atBats || 0;
  const careerHomeruns = careerStats.batting?.homeruns || 0;
  const careerAvg = careerAtBats > 0 ? careerHits / careerAtBats : 0;

  if (isPitcher) {
    if (careerWins >= 30) reasons.push(`通算${careerWins}勝`);
    if (careerStrikeouts >= 450) reasons.push(`通算${careerStrikeouts}奪三振`);
    if (careerSaves >= 50) reasons.push(`通算${careerSaves}セーブ`);
  } else {
    if (careerAvg >= 0.280 && careerAtBats >= 300) reasons.push(`通算打率${careerAvg.toFixed(3)}`);
    if (careerHomeruns >= 70) reasons.push(`通算${careerHomeruns}本塁打`);
    if (careerHits >= 500) reasons.push(`通算${careerHits}安打`);
  }

  return {
    isDraftEligible: reasons.length > 0,
    reasons
  };
}

/**
 * NPBドラフト処理
 * 全チームの選手をチェックし、ドラフト対象者を抽出・処理
 * @param {Object} allTeams - TEAMS_DATA
 * @returns {Object} - { draftedPlayers, nearMissPlayers }
 */
export function processNPBDraft(allTeams) {
  const NPB_TEAMS = [
    '読売ジャイアンツ', '阪神タイガース', '横浜DeNAベイスターズ',
    '広島東洋カープ', '中日ドラゴンズ', 'ヤクルトスワローズ',
    'オリックス・バファローズ', 'ソフトバンクホークス', '西武ライオンズ',
    '楽天ゴールデンイーグルス', '千葉ロッテマリーンズ', '日本ハムファイターズ'
  ];

  const draftedPlayers = [];
  const nearMissPlayers = [];

  Object.entries(allTeams).forEach(([teamName, team]) => {
    if (!team.players) return;
    team.players.forEach(player => {
      const { isDraftEligible, reasons } = checkNPBDraftEligibility(player);
      if (isDraftEligible) {
        const npbTeam = NPB_TEAMS[Math.floor(Math.random() * NPB_TEAMS.length)];
        draftedPlayers.push({
          player,
          teamName,
          npbTeam,
          reasons,
          position: player.position,
          age: player.age,
          name: player.name,
          playerId: player.id
        });
      } else {
        // 惜しかった選手の判定（条件の60%以上達成）
        const isPitcher = player.position === 'pitcher';
        const career = player.careerStats || { batting: {}, pitching: {} };
        const nearReasons = [];

        if (isPitcher) {
          const wins = career.pitching?.wins || 0;
          const ks = career.pitching?.strikeouts || 0;
          const sv = career.pitching?.saves || 0;
          if (wins >= 18 && wins < 30) nearReasons.push(`通算${wins}勝（あと${30 - wins}勝）`);
          if (ks >= 270 && ks < 450) nearReasons.push(`通算${ks}奪三振（あと${450 - ks}）`);
          if (sv >= 30 && sv < 50) nearReasons.push(`通算${sv}セーブ（あと${50 - sv}）`);
        } else {
          const hits = career.batting?.hits || 0;
          const ab = career.batting?.atBats || 0;
          const hr = career.batting?.homeruns || 0;
          const avg = ab > 0 ? hits / ab : 0;
          if (avg >= 0.260 && avg < 0.280 && ab >= 300) nearReasons.push(`通算打率${avg.toFixed(3)}（.280まであと${(0.280 - avg).toFixed(3)}）`);
          if (hr >= 42 && hr < 70) nearReasons.push(`通算${hr}本塁打（あと${70 - hr}本）`);
          if (hits >= 300 && hits < 500) nearReasons.push(`通算${hits}安打（あと${500 - hits}本）`);
        }

        if (nearReasons.length > 0) {
          nearMissPlayers.push({
            name: player.name,
            teamName,
            position: player.position,
            age: player.age,
            reasons: nearReasons
          });
        }
      }
    });
  });

  // ドラフト対象者をチームから除外
  draftedPlayers.forEach(({ playerId, teamName }) => {
    const team = allTeams[teamName];
    if (team) {
      team.players = team.players.filter(p => p.id !== playerId);
    }
  });

  return { draftedPlayers, nearMissPlayers };
}

/**
 * 殿堂入り条件を判定
 * 投手: 通算100勝、または通算30セーブ、または通算600奪三振
 * 野手: 通算打率.300以上、または通算150本塁打、または通算1000安打
 * @param {Object} player - 選手データ
 * @returns {Object} - { isHallOfFame: boolean, reason: string }
 */
export function checkHallOfFame(player) {
  const isPitcher = player.position === 'pitcher';

  // 通算成績
  const careerStats = player.careerStats || { batting: {}, pitching: {} };
  const careerWins = careerStats.pitching?.wins || 0;
  const careerStrikeouts = careerStats.pitching?.strikeouts || 0;
  const careerSaves = careerStats.pitching?.saves || 0;
  const careerHits = careerStats.batting?.hits || 0;
  const careerAtBats = careerStats.batting?.atBats || 0;
  const careerHomeruns = careerStats.batting?.homeruns || 0;
  const careerAvg = careerAtBats > 0 ? careerHits / careerAtBats : 0;

  if (isPitcher) {
    if (careerWins >= 100) return { isHallOfFame: true, reason: `通算${careerWins}勝の名投手` };
    if (careerSaves >= 30) return { isHallOfFame: true, reason: `通算${careerSaves}セーブの守護神` };
    if (careerStrikeouts >= 600) return { isHallOfFame: true, reason: `通算${careerStrikeouts}奪三振のストライカー` };
  } else {
    if (careerAvg >= 0.300 && careerAtBats >= 500) return { isHallOfFame: true, reason: `通算打率${careerAvg.toFixed(3)}の安打製造機` };
    if (careerHomeruns >= 150) return { isHallOfFame: true, reason: `通算${careerHomeruns}本塁打のスラッガー` };
    if (careerHits >= 1000) return { isHallOfFame: true, reason: `通算${careerHits}安打の名選手` };
  }

  return { isHallOfFame: false, reason: '' };
}

/**
 * 引退・殿堂入り判定
 * @param {Object} player - 選手データ
 * @returns {Object} - { shouldRetire: boolean, hallOfFame: boolean, reason: string, draftEligible: boolean, draftReasons: string[] }
 */
export function checkRetirement(player) {
  const age = player.age || 20;

  // 殿堂入り判定（新しい条件を使用）
  const { isHallOfFame: hallOfFame, reason: hofReason } = checkHallOfFame(player);

  // NPBドラフト候補判定
  const { isDraftEligible: draftEligible, reasons: draftReasons } = checkNPBDraftEligibility(player);

  // 引退判定
  let shouldRetire = false;
  let reason = hofReason;

  // 1. 40歳以上は必ず引退
  if (age >= 40) {
    shouldRetire = true;
    if (!reason) reason = '年齢による引退';
  }
  // 2. 35歳以上で成績不振
  else if (age >= 35) {
    const recentGames = (player.seasonStats?.batting?.games || 0) + (player.seasonStats?.pitching?.games || 0);
    if (recentGames < 10) {
      shouldRetire = true;
      if (!reason) reason = '出場機会減少のため引退';
    }
  }
  // 3. ランダム引退（30歳以上で5%）
  else if (age >= 30 && Math.random() < 0.05) {
    shouldRetire = true;
    if (!reason) reason = '自己都合による引退';
  }

  return { shouldRetire, hallOfFame, reason, draftEligible, draftReasons };
};

/**
 * 全チームの引退処理
 * @param {Object} allTeams - 全チームデータ
 * @returns {Object} - { updatedTeams, retirements }
 */
export function processRetirements(allTeams) {
  const updatedTeams = {};
  const retirements = [];

  Object.entries(allTeams).forEach(([teamName, team]) => {
    const remainingPlayers = [];

    team.players.forEach(player => {
      const { shouldRetire, hallOfFame, reason } = checkRetirement(player);

      if (shouldRetire) {
        retirements.push({
          name: player.name,
          team: teamName,
          age: player.age,
          position: player.position,
          hallOfFame,
          reason,
          careerStats: player.careerStats
        });
      } else {
        remainingPlayers.push(player);
      }
    });

    updatedTeams[teamName] = {
      ...team,
      players: remainingPlayers
    };
  });

  return { updatedTeams, retirements };
};

/**
 * 選手解雇
 * @param {Object} team - チームデータ
 * @param {number} playerId - 解雇する選手のID
 * @returns {Object} - 更新されたチームデータ
 */
export function releasePlayer(team, playerId) {
  return {
    ...team,
    players: team.players.filter(p => p.id !== playerId)
  };
};

/**
 * シーズン統計をリセット
 * @param {Object} allTeams - 全チームデータ
 * @returns {Object} - 更新されたチームデータ
 */
export function resetSeasonStats(allTeams) {
  const updatedTeams = {};

  Object.entries(allTeams).forEach(([teamName, team]) => {
    updatedTeams[teamName] = {
      ...team,
      players: team.players.map(player => {
        // シーズン成績を通算成績に加算
        const updatedCareerBatting = {
          games: player.careerStats.batting.games + player.seasonStats.batting.games,
          atBats: player.careerStats.batting.atBats + player.seasonStats.batting.atBats,
          hits: player.careerStats.batting.hits + player.seasonStats.batting.hits,
          doubles: player.careerStats.batting.doubles + player.seasonStats.batting.doubles,
          triples: player.careerStats.batting.triples + player.seasonStats.batting.triples,
          homeruns: player.careerStats.batting.homeruns + player.seasonStats.batting.homeruns,
          rbis: player.careerStats.batting.rbis + player.seasonStats.batting.rbis,
          walks: player.careerStats.batting.walks + player.seasonStats.batting.walks,
          strikeouts: player.careerStats.batting.strikeouts + player.seasonStats.batting.strikeouts,
          stolenBases: player.careerStats.batting.stolenBases + player.seasonStats.batting.stolenBases
        };

        const updatedCareerPitching = {
          games: player.careerStats.pitching.games + player.seasonStats.pitching.games,
          wins: player.careerStats.pitching.wins + player.seasonStats.pitching.wins,
          losses: player.careerStats.pitching.losses + player.seasonStats.pitching.losses,
          saves: player.careerStats.pitching.saves + player.seasonStats.pitching.saves,
          holds: player.careerStats.pitching.holds + player.seasonStats.pitching.holds,
          inningsPitched: player.careerStats.pitching.inningsPitched + player.seasonStats.pitching.inningsPitched,
          runsAllowed: player.careerStats.pitching.runsAllowed + player.seasonStats.pitching.runsAllowed,
          earnedRuns: player.careerStats.pitching.earnedRuns + player.seasonStats.pitching.earnedRuns,
          hits: player.careerStats.pitching.hits + player.seasonStats.pitching.hits,
          homeruns: player.careerStats.pitching.homeruns + player.seasonStats.pitching.homeruns,
          walks: player.careerStats.pitching.walks + player.seasonStats.pitching.walks,
          strikeouts: player.careerStats.pitching.strikeouts + player.seasonStats.pitching.strikeouts,
          pitches: player.careerStats.pitching.pitches + player.seasonStats.pitching.pitches
        };

        // シーズン成績をリセット
        return {
          ...player,
          careerStats: {
            batting: updatedCareerBatting,
            pitching: updatedCareerPitching
          },
          seasonStats: {
            batting: { games: 0, atBats: 0, hits: 0, doubles: 0, triples: 0, homeruns: 0, rbis: 0, walks: 0, strikeouts: 0, stolenBases: 0 },
            pitching: { games: 0, wins: 0, losses: 0, saves: 0, holds: 0, inningsPitched: 0, runsAllowed: 0, earnedRuns: 0, hits: 0, homeruns: 0, walks: 0, strikeouts: 0, pitches: 0 }
          }
        };
      })
    };
  });

  return updatedTeams;
};

/**
 * タイトル獲得記録を選手に追加
 * @param {Object} allTeams - 全チームデータ
 * @param {Object} awards - 表彰結果
 * @returns {Object} - 更新されたチームデータ
 */
export function recordAwardsToPlayers(allTeams, awards) {
  const updatedTeams = {};

  Object.entries(allTeams).forEach(([teamName, team]) => {
    updatedTeams[teamName] = {
      ...team,
      players: team.players.map(player => {
        const achievements = [...(player.professionalCareer?.achievements || [])];

        // 各タイトルをチェック
        if (awards.battingChampion?.name === player.name) {
          achievements.push({ year: 0, title: '首位打者' }); // yearは後で設定
        }
        if (awards.homeRunKing?.name === player.name) {
          achievements.push({ year: 0, title: '本塁打王' });
        }
        if (awards.rbiKing?.name === player.name) {
          achievements.push({ year: 0, title: '打点王' });
        }
        if (awards.stolenBaseKing?.name === player.name) {
          achievements.push({ year: 0, title: '盗塁王' });
        }
        if (awards.eraChampion?.name === player.name) {
          achievements.push({ year: 0, title: '最優秀防御率' });
        }
        if (awards.winsLeader?.name === player.name) {
          achievements.push({ year: 0, title: '最多勝' });
        }
        if (awards.savesLeader?.name === player.name) {
          achievements.push({ year: 0, title: '最多セーブ' });
        }
        if (awards.strikeoutKing?.name === player.name) {
          achievements.push({ year: 0, title: '最多奪三振' });
        }

        return {
          ...player,
          professionalCareer: {
            ...(player.professionalCareer || {}),
            achievements
          }
        };
      })
    };
  });

  return updatedTeams;
};

/**
 * 次年度への完全移行
 * @param {Object} seasonData - 現在のシーズンデータ
 * @param {Object} allTeams - 全チームデータ
 * @returns {Object} - { newSeasonData, updatedTeams, awards, retirements }
 */
export function advanceToNextYear(seasonData, allTeams) {
  // 1. シーズン終了処理（表彰）
  const awards = processSeasonEnd(seasonData, allTeams);

  // 2. タイトルを選手に記録
  let updatedTeams = recordAwardsToPlayers(allTeams, awards);

  // 3. シーズン統計を通算に加算してリセット
  updatedTeams = resetSeasonStats(updatedTeams);

  // 4. 選手の年齢を更新
  updatedTeams = updateAllPlayerAges(updatedTeams);

  // 4.5. 年齢カーブによる成長・衰退を適用
  const { updatedTeams: teamsAfterAgeCurve, ageReports } = applyAgeCurveChanges(updatedTeams);
  updatedTeams = teamsAfterAgeCurve;

  // 5. 引退処理
  const { updatedTeams: teamsAfterRetirement, retirements } = processRetirements(updatedTeams);

  // 6. 新シーズンデータ作成
  const newYear = seasonData.year + 1;
  const newSeasonData = createSeasonData(newYear);
  newSeasonData.settings = { ...seasonData.settings };

  // スケジュールはレギュレーション設定後に生成するため、ここでは空のまま
  // 順位表のみ初期化
  const teams = Object.keys(teamsAfterRetirement);
  newSeasonData.schedule = [];
  newSeasonData.standings = initializeStandings(teams);

  return {
    newSeasonData,
    updatedTeams: teamsAfterRetirement,
    awards,
    retirements,
    ageReports
  };
};

// ============================================================
// 年齢カーブによる成長・衰退システム
// 若い: フィジカル成長しやすい、24歳前後: 技術が伸びやすい
// 28歳前後: 微成長、32歳: 衰え開始、36歳: 顕著な衰え
// ただし個人差が大きく、例外的な選手も出る
// ============================================================

// フィジカル系能力（若いほど伸びやすい）
const PHYSICAL_STATS = ['speed', 'arm', 'stamina', 'velocity'];
// 技術系能力（24歳前後でピーク成長）
const TECHNICAL_STATS = ['meet', 'power', 'eye', 'control', 'defense', 'steal'];

/**
 * 年齢に基づく成長・衰退の基礎値を算出
 * 返り値は -3.0 〜 +3.0 程度の範囲（ランダム偏差含まず）
 */
function getAgeGrowthBase(age, isPhysical) {
  if (isPhysical) {
    // フィジカル: 18-22で大きく伸びる、23-27で微増、28以降は衰退
    if (age <= 20) return 2.5;
    if (age <= 22) return 1.8;
    if (age <= 25) return 0.8;
    if (age <= 28) return 0.1;
    if (age <= 31) return -0.5;
    if (age <= 34) return -1.2;
    if (age <= 37) return -2.0;
    return -3.0;
  } else {
    // 技術: 18-21で微増、22-26でよく伸びる、27-30で微増、31以降衰退
    if (age <= 21) return 1.0;
    if (age <= 24) return 2.2;
    if (age <= 27) return 1.5;
    if (age <= 30) return 0.3;
    if (age <= 33) return -0.3;
    if (age <= 36) return -1.0;
    return -2.0;
  }
}

/**
 * シーズン終了時の年齢カーブによる能力変動を適用
 * 個人差を大きくし、傾向からの逸脱を許容する
 * @param {Object} allTeams - 全チームデータ
 * @returns {Object} - { updatedTeams, ageReports }
 */
export function applyAgeCurveChanges(allTeams) {
  const updatedTeams = {};
  const ageReports = [];

  Object.entries(allTeams).forEach(([teamName, team]) => {
    updatedTeams[teamName] = {
      ...team,
      players: team.players.map(player => {
        const age = player.age || 20;
        let updatedPlayer = JSON.parse(JSON.stringify(player));
        const changes = [];

        // 全能力について年齢カーブを適用
        const allStats = [...PHYSICAL_STATS, ...TECHNICAL_STATS];

        allStats.forEach(stat => {
          const isPhysical = PHYSICAL_STATS.includes(stat);
          const base = getAgeGrowthBase(age, isPhysical);

          // 個人差: 標準偏差2.0のランダム偏差（大きな個人差を出す）
          // Box-Muller変換で正規分布を生成
          const u1 = Math.random() || 0.001;
          const u2 = Math.random();
          const normalRandom = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
          const variance = normalRandom * 2.0;

          // 最終変動値（四捨五入、±0の場合もある）
          let change = Math.round(base + variance);

          // 能力値を取得・更新
          const statPath = getStatPath(stat);
          if (!statPath) return;

          const currentValue = getNestedValue(updatedPlayer, statPath);
          if (currentValue == null) return;

          // 球速は変動幅を2倍に（スケールが大きいため）
          if (stat === 'velocity') change = Math.round((base + variance) * 1.5);
          // スタミナも変動幅を2倍
          if (stat === 'stamina') change = Math.round((base + variance) * 1.5);

          const newValue = Math.max(1, currentValue + change);

          if (change !== 0) {
            updatedPlayer = setNestedValue(updatedPlayer, statPath, newValue);
            changes.push({
              stat, statName: getStatName(stat),
              before: currentValue, after: newValue, change
            });
          }
        });

        if (changes.length > 0) {
          ageReports.push({
            name: player.name, team: teamName, age, changes
          });
        }

        return updatedPlayer;
      })
    };
  });

  return { updatedTeams, ageReports };
}

// ============================================================
// キャンプ練習システム（経験値→成長、年齢カーブ考慮）
// ============================================================

/**
 * 練習メニュー定義
 * 各練習メニューは特定の能力値を成長させる
 */
export const TRAINING_MENUS = {
  batting: {
    name: '打撃練習',
    icon: '🏏',
    description: 'ミート・パワーを強化',
    targets: ['meet', 'power'],
    category: 'batting'
  },
  baserunning: {
    name: '走塁練習',
    icon: '🏃',
    description: '走力・盗塁を強化',
    targets: ['speed', 'steal'],
    category: 'batting'
  },
  fielding: {
    name: '守備練習',
    icon: '🧤',
    description: '守備力・肩力を強化',
    targets: ['defense', 'arm'],
    category: 'fielding'
  },
  stamina: {
    name: 'スタミナ練習',
    icon: '💪',
    description: '投手スタミナを強化',
    targets: ['stamina'],
    category: 'pitching'
  },
  control: {
    name: '制球練習',
    icon: '🎯',
    description: '制球力を強化',
    targets: ['control'],
    category: 'pitching'
  },
  velocity: {
    name: '球速練習',
    icon: '⚡',
    description: '球速を強化（投手のみ）',
    targets: ['velocity'],
    category: 'pitching'
  },
  eye: {
    name: '選球眼練習',
    icon: '👁️',
    description: '選球眼を強化',
    targets: ['eye'],
    category: 'batting'
  },
  breaking: {
    name: '変化球練習',
    icon: '🌀',
    description: '変化球レベルを強化',
    targets: ['breaking'],
    category: 'pitching'
  },
  newpitch: {
    name: '新球種習得',
    icon: '✨',
    description: '新しい変化球を覚える',
    targets: ['newpitch'],
    category: 'pitching'
  }
};

/**
 * シーズン終了時に経験値を集計
 * 投手: 登板数 + 投球回数
 * 野手: 出場試合数 + 打席数/3
 * フル稼働で年間約250ポイント
 * @param {Object} player - 選手データ
 */
export function calculateSeasonExperience(player) {
  const pitchingStats = player.seasonStats?.pitching || {};
  const battingStats = player.seasonStats?.batting || {};

  const pitcherExp = (pitchingStats.games || 0) + Math.floor(pitchingStats.inningsPitched || 0);
  const batterExp = (battingStats.games || 0) + Math.floor((battingStats.atBats || 0) / 3);

  // 投手はピッチング経験を、野手はバッティング経験を採用
  const isPitcher = player.position === 'pitcher';
  return isPitcher ? pitcherExp : batterExp;
}

/**
 * 全選手の経験値を更新（シーズン終了時に呼ぶ）
 * @param {Object} allTeams - 全チームデータ
 */
export function updateAllPlayersExperience(allTeams) {
  const updatedTeams = {};

  Object.entries(allTeams).forEach(([teamName, team]) => {
    updatedTeams[teamName] = {
      ...team,
      players: team.players.map(player => {
        const gainedExp = calculateSeasonExperience(player);
        return {
          ...player,
          experience: (player.experience || 0) + gainedExp
        };
      })
    };
  });

  return updatedTeams;
}

/**
 * ポジション経験による成長ボーナス倍率を算出
 * 外野: バランス成長、二塁/遊撃: 走力・守備、三塁/一塁: 打撃、捕手: 守備・肩
 */
function getPositionGrowthBonus(player, targetStat) {
  const posExp = player.positionExperience || {};
  const totalGames = Object.values(posExp).reduce((a, b) => a + b, 0);
  if (totalGames === 0) return 1.0;

  // 各ポジションの成長傾向（stat → bonus倍率）
  const positionBonusMap = {
    // 二塁・遊撃: 走力、守備が伸びやすい
    second:  { speed: 1.4, defense: 1.4, steal: 1.3, arm: 1.1, meet: 1.0, power: 0.9 },
    short:   { speed: 1.4, defense: 1.4, steal: 1.3, arm: 1.2, meet: 1.0, power: 0.9 },
    // 三塁・一塁: 打撃が伸びやすい
    third:   { power: 1.4, meet: 1.3, arm: 1.2, defense: 1.0, speed: 0.9, steal: 0.9 },
    first:   { power: 1.5, meet: 1.4, eye: 1.2, defense: 0.9, speed: 0.9, steal: 0.8 },
    // 外野: バランス成長
    left:    { speed: 1.2, meet: 1.1, power: 1.1, arm: 1.1, defense: 1.1, steal: 1.1 },
    center:  { speed: 1.3, defense: 1.2, meet: 1.1, steal: 1.2, arm: 1.0, power: 1.0 },
    right:   { arm: 1.3, power: 1.2, meet: 1.1, speed: 1.1, defense: 1.1, steal: 1.0 },
    // 捕手: 守備・肩が伸びやすい
    catcher: { defense: 1.5, arm: 1.4, meet: 1.0, power: 0.9, speed: 0.8, steal: 0.8 },
  };

  // 加重平均でボーナスを計算
  let weightedBonus = 0;
  Object.entries(posExp).forEach(([pos, games]) => {
    const bonusMap = positionBonusMap[pos] || {};
    const bonus = bonusMap[targetStat] || 1.0;
    weightedBonus += bonus * (games / totalGames);
  });

  return weightedBonus || 1.0;
}

/**
 * 打順経験による成長ボーナス倍率を算出
 * 1番: 走力、2-3番: バランス、4番: パワー、5番: パワー/打撃、下位: 守備
 */
function getBattingOrderGrowthBonus(player, targetStat) {
  const boExp = player.battingOrderExperience || {};
  const totalGames = Object.values(boExp).reduce((a, b) => a + b, 0);
  if (totalGames === 0) return 1.0;

  const orderBonusMap = {
    1: { speed: 1.4, steal: 1.4, meet: 1.2, eye: 1.2, power: 0.9 },
    2: { meet: 1.3, speed: 1.2, eye: 1.2, steal: 1.1, power: 1.0, defense: 1.0 },
    3: { meet: 1.3, power: 1.2, eye: 1.1, speed: 1.1, defense: 1.0 },
    4: { power: 1.5, meet: 1.2, eye: 1.1, speed: 0.9, steal: 0.8 },
    5: { power: 1.3, meet: 1.2, eye: 1.1, arm: 1.0 },
    6: { defense: 1.2, meet: 1.1, power: 1.1, arm: 1.1 },
    7: { defense: 1.2, arm: 1.1, meet: 1.0, speed: 1.1 },
    8: { defense: 1.3, arm: 1.2, speed: 1.1 },
    9: { /* 投手枠: ボーナスなし */ },
  };

  let weightedBonus = 0;
  Object.entries(boExp).forEach(([order, games]) => {
    const bonusMap = orderBonusMap[parseInt(order)] || {};
    const bonus = bonusMap[targetStat] || 1.0;
    weightedBonus += bonus * (games / totalGames);
  });

  return weightedBonus || 1.0;
}

// 利用可能な全変化球（新球種習得用）
const ALL_PITCH_TYPES = [
  'slider', 'curve', 'fork', 'changeup', 'sinker', 'shoot',
  'cutter', 'splitter', 'twoSeam', 'palm', 'knuckle'
];

/**
 * キャンプ練習を実行（1クール分）
 * 成長量は1/4に調整済み
 * @param {Object} player - 選手データ
 * @param {string} trainingType - 練習メニューのキー
 * @param {string} [newPitchType] - 新球種習得時の球種キー
 * @returns {Object} - 成長結果 { player, growthReport }
 */
export function executeCampTraining(player, trainingType, newPitchType) {
  const menu = TRAINING_MENUS[trainingType];
  if (!menu) {
    console.warn(`Unknown training type: ${trainingType}`);
    return { player, growthReport: [] };
  }

  const experience = player.experience || 0;
  const age = player.age || 20;
  const growthReport = [];
  let updatedPlayer = JSON.parse(JSON.stringify(player));

  // 変化球練習の場合
  if (trainingType === 'breaking') {
    const arsenal = updatedPlayer.pitching?.arsenal || [];
    const nonStraight = arsenal.filter(p => p.type !== 'straight');
    if (nonStraight.length > 0) {
      nonStraight.forEach(pitch => {
        const ageBase = getAgeGrowthBase(age, false);
        const ageMultiplier = Math.max(0.3, 1.0 + ageBase * 0.15);
        // 成長量1/4: 元(1-3 + 1-4) → 1/4
        const rawGrowth = (Math.floor(Math.random() * 3) + 1 + Math.floor(Math.random() * 4) + 1) * ageMultiplier;
        const growth = Math.max(1, Math.round(rawGrowth * 0.25));
        const before = pitch.level;
        pitch.level = before + growth; // 上限なし
        growthReport.push({
          stat: 'breaking',
          statName: `${getPitchTypeName(pitch.type)}`,
          before, after: pitch.level, growth: pitch.level - before, isAwakening: false
        });
      });
    }
    return { player: updatedPlayer, growthReport };
  }

  // 新球種習得の場合
  if (trainingType === 'newpitch') {
    const arsenal = updatedPlayer.pitching?.arsenal || [];
    const existingTypes = arsenal.map(p => p.type);
    const targetType = newPitchType || ALL_PITCH_TYPES.find(t => !existingTypes.includes(t));
    if (targetType && !existingTypes.includes(targetType)) {
      const newId = arsenal.length > 0 ? Math.max(...arsenal.map(a => a.id)) + 1 : 1;
      const startLevel = Math.floor(Math.random() * 10) + 10; // 10-19
      arsenal.push({ id: newId, type: targetType, level: startLevel });
      updatedPlayer.pitching.arsenal = arsenal;
      growthReport.push({
        stat: 'newpitch',
        statName: `${getPitchTypeName(targetType)}習得`,
        before: 0, after: startLevel, growth: startLevel, isAwakening: false
      });
    } else {
      growthReport.push({
        stat: 'newpitch',
        statName: '習得失敗（全球種習得済み）',
        before: 0, after: 0, growth: 0, isAwakening: false
      });
    }
    return { player: updatedPlayer, growthReport };
  }

  // 通常の能力練習（成長量1/4）
  menu.targets.forEach(targetStat => {
    const isPhysical = PHYSICAL_STATS.includes(targetStat);
    const ageBase = getAgeGrowthBase(age, isPhysical);
    const ageMultiplier = Math.max(0.3, 1.0 + ageBase * 0.15);
    const posBonus = getPositionGrowthBonus(player, targetStat);
    const boBonus = getBattingOrderGrowthBonus(player, targetStat);
    const expBonus = posBonus * boBonus;

    // 元の成長量を1/4に: (base + focus) * 0.25
    const rawBase = (Math.floor(Math.random() * 3) + 1) * ageMultiplier * expBonus;
    const rawFocus = (Math.floor(Math.random() * 4) + 1) * ageMultiplier * expBonus;
    const baseGrowth = Math.round((rawBase + rawFocus) * 0.25);

    // 覚醒判定
    const awakeningChance = Math.floor(experience / 10);
    const isAwakening = Math.random() * 100 < awakeningChance;
    const awakeningGrowth = isAwakening ? Math.round((Math.floor(Math.random() * 10) + 5) * 0.25) : 0;

    const totalGrowth = Math.max(0, baseGrowth + awakeningGrowth);

    const statPath = getStatPath(targetStat);
    if (statPath) {
      const currentValue = getNestedValue(updatedPlayer, statPath) || 50;
      const newValue = currentValue + totalGrowth; // 上限なし
      updatedPlayer = setNestedValue(updatedPlayer, statPath, newValue);
      growthReport.push({
        stat: targetStat,
        statName: getStatName(targetStat),
        before: currentValue, after: newValue,
        growth: newValue - currentValue, isAwakening
      });
    }
  });

  // 経験値を消費（練習に使った分の一部をリセット）
  updatedPlayer.experience = Math.floor(experience * 0.3);
  updatedPlayer.positionExperience = {};
  updatedPlayer.battingOrderExperience = {};

  return { player: updatedPlayer, growthReport };
}

/**
 * 球種名を取得
 */
function getPitchTypeName(type) {
  const names = {
    straight: 'ストレート', slider: 'スライダー', curve: 'カーブ',
    fork: 'フォーク', changeup: 'チェンジアップ', sinker: 'シンカー',
    shoot: 'シュート', cutter: 'カッター', splitter: 'スプリッター',
    twoSeam: 'ツーシーム', palm: 'パーム', knuckle: 'ナックル'
  };
  return names[type] || type;
}
export { ALL_PITCH_TYPES, getPitchTypeName };

/**
 * チーム全体のキャンプ練習を実行
 * @param {Object} team - チームデータ
 * @param {Object} trainingAssignments - { playerId: trainingType } の形式
 * @param {Object} [newPitchSelections] - { playerId: pitchType } 新球種選択
 * @returns {Object} - { updatedTeam, allReports }
 */
export function executeTeamCampTraining(team, trainingAssignments, newPitchSelections = {}) {
  const allReports = [];
  const updatedPlayers = team.players.map(player => {
    const trainingType = trainingAssignments[player.id];
    if (!trainingType) {
      const autoTraining = player.position === 'pitcher' ? 'stamina' : 'batting';
      const { player: trained, growthReport } = executeCampTraining(player, autoTraining);
      allReports.push({ player: trained, trainingType: autoTraining, growthReport });
      return trained;
    }

    const newPitchType = trainingType === 'newpitch' ? newPitchSelections[player.id] : undefined;
    const { player: trained, growthReport } = executeCampTraining(player, trainingType, newPitchType);
    allReports.push({ player: trained, trainingType, growthReport });
    return trained;
  });

  return {
    updatedTeam: { ...team, players: updatedPlayers },
    allReports
  };
}

// ヘルパー関数
function getStatPath(statKey) {
  const pathMap = {
    meet: 'batting.meet',
    power: 'batting.power',
    eye: 'batting.eye',
    steal: 'batting.steal',
    speed: 'physical.speed',
    arm: 'physical.arm',
    defense: 'fielding.defense',
    velocity: 'pitching.velocity',
    control: 'pitching.control',
    stamina: 'pitching.stamina'
  };
  return pathMap[statKey];
}

function getStatName(statKey) {
  const nameMap = {
    meet: 'ミート',
    power: 'パワー',
    eye: '選球眼',
    steal: '盗塁',
    speed: '走力',
    arm: '肩力',
    defense: '守備',
    velocity: '球速',
    control: '制球',
    stamina: 'スタミナ'
  };
  return nameMap[statKey] || statKey;
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((o, k) => (o || {})[k], obj);
}

function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  const result = JSON.parse(JSON.stringify(obj));
  let current = result;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
  return result;
}
