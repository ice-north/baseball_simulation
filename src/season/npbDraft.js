// ============================================================
// NPBドラフト処理 - src/season/npbDraft.js
//
// yearProgressionSystem.js から最大の単一関数 processNPBDraft を抽出したもの。
// 全ソース（高校/大学/社会人/独立）の候補を統一スコアで評価し上位を指名する。
// 評価・殿堂・清掃・表彰ボーナスの各ヘルパーは yearProgressionSystem 側に残し、
// こちらから一方向に import する（yps は本関数を内部呼び出ししないため循環参照なし）。
// ============================================================

import { generateHighSchoolClass, universityPool, highSchoolPool, HIGH_SCHOOL_CLASS_SIZE } from './universityPool.js';
import { WORLD_DATA } from '../corporate/worldData.js';
import { checkNPBDraftEligibility, checkHallOfFame, cleanupPlayerReferences, computeSeasonAwardBonuses } from './yearProgressionSystem.js';
import { addToObRegistry } from '../game/obRegistry.js';
import { buildToolNorms, toolProfile, toolHuntRateForRound, TOOL_HUNT_RATE_IKU,
         HUNT_SCORE_W, scoreStats, randomHuntTool, toolDevOf, isSpecialist,
         TOOL_LABELS, TOOL_NOUNS } from '../game/scoutTools.js';

/**
 * NPBドラフト処理（統一評価・グローバルTop-N方式）
 *
 * 全ソース（高校/大学/社会人/独立）から候補を収集し、
 * 統一スコアで評価して上位~120名をドラフト指名する。
 * 各ソースの比率は選手の質から自然に決まる。
 *
 * 目標比率（タレント調整の指標）:
 *   高校30%, 大学35%, 社会人20%, 独立14%, その他1%
 *   1位は高校+大学80%, 社会人20%が自然に実現される（生成能力差による）
 *
 * @param {Object} allTeams - TEAMS_DATA
 * @param {number} gameYear - 現在のゲーム年度
 * @returns {Object} - { draftedPlayers, nearMissPlayers, proBonus, draftBySource }
 */
export function processNPBDraft(allTeams, gameYear = 1) {
  const NPB_TEAMS = [
    '読売ジャイアンツ', '阪神タイガース', '横浜DeNAベイスターズ',
    '広島東洋カープ', '中日ドラゴンズ', 'ヤクルトスワローズ',
    'オリックス・バファローズ', 'ソフトバンクホークス', '西武ライオンズ',
    '楽天ゴールデンイーグルス', '千葉ロッテマリーンズ', '日本ハムファイターズ'
  ];
  const DRAFT_ROUND_LABELS = ['育成指名', 'ドラフト6位', 'ドラフト5位', 'ドラフト4位', 'ドラフト3位', 'ドラフト2位', 'ドラフト1位'];

  const awardBonusMap = computeSeasonAwardBonuses(allTeams);

  // === 安全策: 高校生プールが空なら即座に生成 ===
  if (highSchoolPool.players.length === 0 && gameYear >= 1) {
    console.warn(`[NPBDraft] 高校生プールが空です（Year ${gameYear}）。自動生成します。`);
    const hsPlayers = generateHighSchoolClass(gameYear, HIGH_SCHOOL_CLASS_SIZE);
    highSchoolPool.players = hsPlayers;
    highSchoolPool.year = gameYear;
  }

  // === 全ソースから候補を収集し、統一スコアで評価 ===
  const allCandidates = [];

  // 1. チーム選手（社会人 / 独立リーグ / 大学）
  Object.entries(allTeams).forEach(([teamName, team]) => {
    if (!team.players) return;
    const source = team.independentLeagueId ? 'independent'
                 : team.corporateData ? 'corporate'
                 : team.universityData ? 'university_team'
                 : 'independent';
    team.players.forEach(player => {
      if (player.age >= 30) return;
      if (source === 'university_team') {
        // 大学: 4年生（22歳）のみ指名対象
        if (player.age < 22 || (player.universityYear && player.universityYear < 4)) return;
      } else if (source === 'corporate') {
        // 社会人: 高卒3年目(21歳〜)、大卒2年目(24歳〜)
        // 大卒社会人は23歳で入社→2年目の24歳でドラフト、翌年25歳でNPB入り
        const hasUniHistory = player.careerHistory?.some(h => h.type === 'university');
        if (hasUniHistory) {
          if (player.age < 24) return;
        } else {
          if (player.age < 21) return;
        }
      }
      // 独立リーグ: 年齢制限なし（1年目から指名対象）
      const baseBonus = awardBonusMap[player.id]?.bonus || 0;
      // 大卒社会人経験ボーナス: age25-26はageBonus(-10〜-22)を補正
      const hasUniHistoryForBonus = source === 'corporate' && player.careerHistory?.some(h => h.type === 'university');
      const corpExpBonus = hasUniHistoryForBonus && player.age >= 25 && player.age <= 26
        ? Math.max(0, (27 - player.age) * 5)  // 25歳:+10, 26歳:+5
        : 0;
      const bonus = baseBonus + corpExpBonus;
      const awards = awardBonusMap[player.id]?.awards || [];
      const { totalScore } = checkNPBDraftEligibility(player, bonus);
      const isClub = source === 'corporate' && team.corporateData?.type === 'club';
      allCandidates.push({
        player, teamName, score: totalScore, bonus, awards, source, isClub,
        hofResult: checkHallOfFame(player),
      });
    });
  });

  // 2. 高校生プール
  highSchoolPool.players.forEach(player => {
    const { totalScore } = checkNPBDraftEligibility(player, 0);
    allCandidates.push({
      player, teamName: player.highSchool?.name ? player.highSchool.name + '高' : '高校', score: totalScore, bonus: 0, awards: [],
      source: 'highschool',
    });
  });

  // 3. 大学4年生（22歳）のみ
  Object.entries(universityPool).forEach(([enrollYear, cohort]) => {
    if (!cohort) return;
    const ey = parseInt(enrollYear);
    cohort.forEach(entry => {
      const yearsInUni = gameYear - ey;
      if (yearsInUni >= 4 || entry.player.age >= 22) {
        const { totalScore } = checkNPBDraftEligibility(entry.player, 0);
        allCandidates.push({
          player: entry.player, teamName: entry.universityTeamName || '大学', score: totalScore,
          bonus: 0, awards: [], source: 'university',
          enrollYear: ey, universityRank: entry.universityRank,
        });
      }
    });
  });

  // === ソース別の指名到達性補正 ===
  // 独立リーグ選手は年齢的に将来性倍率(potentialMult)や年齢ボーナスが乗らず、
  // 素材が良くてもスコアが低く出るため、掲載上位でも指名までほとんど届かなかった
  // （掲載選手の指名率: 独立19% ⇔ 高校/社会人ほぼ100%）。
  // ソース内順位は保ったまま一律で底上げし、「注目選手の約8割がいずれ指名される／
  // 漏れた選手は次カテゴリで飛躍して再挑戦」という設計に近づける。
  const SOURCE_DRAFT_BONUS = { independent: 35 };
  allCandidates.forEach(c => {
    const b = SOURCE_DRAFT_BONUS[c.source];
    if (b) c.score += b;
  });

  // === 「一芸」の計測（scoutTools.js）===
  // 総合点だけで上から取ると必ず「全部そこそこ高い選手」が並ぶ。
  // 下位・育成では1つの道具で勝負する選手を拾えるよう、
  // 候補プールそのものから群×道具の平均・σを作り、各候補の尖りを付ける。
  // ⚠ ここで足すのは**巡目ごとの並べ替えキー**だけ。`c.score`（＝選手の価値）は変えない。
  const toolNorms = buildToolNorms(allCandidates, c => c.player);
  allCandidates.forEach(c => {
    const prof = toolProfile(c.player, toolNorms);
    c.toolDevs = prof.devs;
    c.topTool = prof.topTool;
    c.spike = prof.spike;   // 表示（一芸バッジ）専用。指名の並べ替えには使わない
  });

  // === 候補数の診断ログ ===
  const sourceCounts = { highschool: 0, university: 0, university_team: 0, corporate: 0, independent: 0 };
  allCandidates.forEach(c => { sourceCounts[c.source] = (sourceCounts[c.source] || 0) + 1; });
  console.log(`[NPBDraft Year${gameYear}] 候補数: 高校${sourceCounts.highschool} 大学pool${sourceCounts.university} 大学team${sourceCounts.university_team} 社会人${sourceCounts.corporate} 独立${sourceCounts.independent} 合計${allCandidates.length}`);

  // === スコア順にソートし、候補の質に応じて指名 ===
  allCandidates.sort((a, b) => b.score - a.score);

  const numTeams = NPB_TEAMS.length;
  const MIN_DRAFT_SCORE = 80;
  const MIN_IKU_SCORE = 65;
  const eligible = allCandidates.filter(c => c.score >= MIN_IKU_SCORE);
  const mainEligible = allCandidates.filter(c => c.score >= MIN_DRAFT_SCORE);
  // 一芸指名で総合点を偏差に直すための分布（固定の表を持たず毎回測る）
  const mainScoreStats = scoreStats(mainEligible.map(c => c.score));

  // 候補の質で本指名巡数を決定（良い候補が多いほど多巡）
  const mainCandPerTeam = Math.floor(mainEligible.length / numTeams);
  const baseMainRounds = mainCandPerTeam >= 8 ? 6 : mainCandPerTeam >= 6 ? 5 : 4;

  // 球団ごとの指名枠を個別に設定
  const IKU_HEAVY_TEAMS = new Set(['読売ジャイアンツ', 'ソフトバンクホークス', '西武ライオンズ', 'オリックス・バファローズ']);
  const teamDraftLimits = {};
  NPB_TEAMS.forEach(team => {
    // 本指名: baseMainRounds ± 1のバラつき
    const mainVariance = Math.floor(Math.random() * 3) - 1;
    const mainPicks = Math.max(3, Math.min(7, baseMainRounds + mainVariance));
    // 育成: 全球団が参加。育成積極球団は2-4名、それ以外は1-2名
    const isIkuHeavy = IKU_HEAVY_TEAMS.has(team);
    const ikuPicks = isIkuHeavy
      ? 2 + Math.floor(Math.random() * 3)
      : 1 + Math.floor(Math.random() * 2);
    teamDraftLimits[team] = { mainPicks, ikuPicks, mainDone: 0, ikuDone: 0 };
  });
  const eligibleSourceCounts = { highschool: 0, university: 0, corporate: 0, independent: 0 };
  eligible.forEach(c => {
    const src = c.source === 'university_team' ? 'university' : c.source;
    eligibleSourceCounts[src] = (eligibleSourceCounts[src] || 0) + 1;
  });
  const totalMainSlots = Object.values(teamDraftLimits).reduce((s, t) => s + t.mainPicks, 0);
  const totalIkuSlots = Object.values(teamDraftLimits).reduce((s, t) => s + t.ikuPicks, 0);
  console.log(`[NPBDraft Year${gameYear}] eligible(≥${MIN_IKU_SCORE}): 高校${eligibleSourceCounts.highschool} 大学${eligibleSourceCounts.university} 社会人${eligibleSourceCounts.corporate} 独立${eligibleSourceCounts.independent} 合計${eligible.length} / 本指名枠=${totalMainSlots} 育成枠=${totalIkuSlots}`);

  // === スコア分布の診断ログ ===
  const scoresBySource = { highschool: [], university: [], corporate: [], independent: [] };
  eligible.forEach(c => {
    const src = c.source === 'university_team' ? 'university' : c.source;
    if (scoresBySource[src]) scoresBySource[src].push(c.score);
  });
  for (const [src, scores] of Object.entries(scoresBySource)) {
    if (scores.length === 0) continue;
    scores.sort((a, b) => b - a);
    const top5 = scores.slice(0, 5).map(s => Math.round(s));
    const median = scores.length > 0 ? Math.round(scores[Math.floor(scores.length / 2)]) : 0;
    console.log(`[NPBDraft] ${src} scores: top5=[${top5}] median=${median} count=${scores.length}`);
  }
  const top12 = eligible.slice(0, 12);
  const top12Sources = { highschool: 0, university: 0, corporate: 0, independent: 0 };
  top12.forEach(c => {
    const src = c.source === 'university_team' ? 'university' : c.source;
    top12Sources[src] = (top12Sources[src] || 0) + 1;
  });
  console.log(`[NPBDraft] Top12(1st round pool): HS=${top12Sources.highschool} 大学=${top12Sources.university} 社会人=${top12Sources.corporate} 独立=${top12Sources.independent}`);
  const top120 = eligible.slice(0, Math.min(120, eligible.length));
  const top120Sources = { highschool: 0, university: 0, corporate: 0, independent: 0 };
  top120.forEach(c => {
    const src = c.source === 'university_team' ? 'university' : c.source;
    top120Sources[src] = (top120Sources[src] || 0) + 1;
  });
  console.log(`[NPBDraft] Top120(full draft): HS=${top120Sources.highschool} 大学=${top120Sources.university} 社会人=${top120Sources.corporate} 独立=${top120Sources.independent}`);

  const maxMainRounds = Math.max(...NPB_TEAMS.map(t => teamDraftLimits[t].mainPicks));
  const maxIkuRounds = Math.max(...NPB_TEAMS.map(t => teamDraftLimits[t].ikuPicks));

  // === 指名エントリ生成ヘルパー ===
  const createDraftEntry = (candidate, npbTeam, roundLabel, huntTool = null) => {
    const { player, teamName, score, bonus = 0, awards = [], source, hofResult } = candidate;
    const isPitcher = player.position === 'pitcher';
    const reasons = [];
    if (source === 'highschool') reasons.push(`高卒ドラフト: 潜在能力${Math.round(score)}pt`);
    else if (source === 'university' || source === 'university_team') reasons.push(`大卒ドラフト: 総合力${Math.round(score)}pt`);
    else reasons.push(`${isPitcher ? '投手' : '野手'}力${Math.round(score)}pt`);
    if (bonus > 0) reasons.push(`成績ボーナス+${bonus}pt`);
    // 一芸で拾った選手は「何を買ったか」を出す。総合点だけ出していると
    // 下位指名が「なぜこの選手？」に見えてしまう
    const devs = candidate.toolDevs || {};
    const shownTool = (huntTool && isSpecialist(devs[huntTool], candidate.spike)) ? huntTool
      : (isSpecialist(devs[candidate.topTool], candidate.spike) ? candidate.topTool : null);
    if (shownTool) reasons.push(TOOL_NOUNS[shownTool] || TOOL_LABELS[shownTool]);
    return {
      player, teamName, npbTeam, reasons, draftRound: roundLabel,
      huntTool: huntTool || null, huntToolDev: huntTool ? (devs[huntTool] || 0) : 0,
      scoutTool: shownTool, spike: candidate.spike || 0,
      topTool: candidate.topTool || null,
      scoutToolLabel: shownTool ? (TOOL_LABELS[shownTool] || '') : '',
      scoutToolDev: shownTool ? (devs[shownTool] || 0) : 0,
      position: player.position, age: player.age,
      name: player.name, playerId: player.id,
      hallOfFame: hofResult?.isHallOfFame || false,
      hofReason: hofResult?.reason || null,
      careerStats: player.careerStats ? JSON.parse(JSON.stringify(player.careerStats)) : null,
      yearsPlayed: player.yearsPlayed || (source === 'highschool' || source === 'university' ? 0 : 1),
      awardBonus: candidate.bonus || 0, seasonAwards: candidate.awards || [],
      source, score, isClub: candidate.isClub || false,
    };
  };

  const draftedPlayers = [];
  const nearMissPlayers = [];
  const shuffledTeams = [...NPB_TEAMS].sort(() => Math.random() - 0.5);
  const takenIds = new Set();

  // === チーム構成バランス追跡 ===
  const teamDraftTracker = {};
  NPB_TEAMS.forEach(team => {
    teamDraftTracker[team] = { pitchers: 0, batters: 0, highschool: 0, university: 0, corporate: 0, independent: 0, total: 0, ageYoung: 0, ageMid: 0, ageOld: 0 };
  });

  const updateDraftTracker = (team, candidate) => {
    const tracker = teamDraftTracker[team];
    if (!tracker) return;
    tracker.total++;
    if (candidate.player.position === 'pitcher') {
      tracker.pitchers++;
    } else {
      tracker.batters++;
    }
    const src = candidate.source === 'university_team' ? 'university' : candidate.source;
    if (tracker[src] !== undefined) tracker[src]++;
    // 年齢グループ追跡
    const age = candidate.player.age || 20;
    if (age <= 19) tracker.ageYoung++;
    else if (age <= 22) tracker.ageMid++;
    else tracker.ageOld++;
  };

  const getBalancePenalty = (team, candidate, tracker) => {
    const t = tracker[team];
    if (!t || t.total < 2) return 0;
    let penalty = 0;
    const isPitcher = candidate.player.position === 'pitcher';
    const pitcherRatio = t.pitchers / t.total;
    const batterRatio = t.batters / t.total;

    // 投手/野手バランス: 65%超で強ペナルティ、75%超でさらに強化
    if (isPitcher && t.total >= 2) {
      if (pitcherRatio >= 0.75) penalty += -40 - (t.pitchers - 2) * 15;
      else if (pitcherRatio >= 0.65) penalty += -20;
    }
    if (!isPitcher && t.total >= 2) {
      if (batterRatio >= 0.75) penalty += -40 - (t.batters - 2) * 15;
      else if (batterRatio >= 0.65) penalty += -20;
    }

    // ソース別バランス: 60%超で同一ソース偏りペナルティ、75%超でさらに強化
    const src = candidate.source === 'university_team' ? 'university' : candidate.source;
    const srcCount = t[src] || 0;
    if (t.total >= 2 && srcCount >= 2) {
      const sourceRatio = srcCount / t.total;
      if (sourceRatio >= 0.75) penalty += -35 - (srcCount - 2) * 10;
      else if (sourceRatio >= 0.60) penalty += -15;
    }

    // 年齢グループバランス: 60%超で偏りペナルティ、75%超でさらに強化
    const age = candidate.player.age || 20;
    const ageGroup = age <= 19 ? 'ageYoung' : age <= 22 ? 'ageMid' : 'ageOld';
    const ageCount = t[ageGroup] || 0;
    if (t.total >= 2 && ageCount >= 2) {
      const ageRatio = ageCount / t.total;
      if (ageRatio >= 0.75) penalty += -30 - (ageCount - 2) * 10;
      else if (ageRatio >= 0.60) penalty += -12;
    }

    return penalty;
  };

  // === 球団別好み（チーム固有の選手評価バイアス） ===
  // 各球団がランダムに好みを持ち、1巡目・2巡目以降の指名に影響
  const teamPreferences = {};
  NPB_TEAMS.forEach(team => {
    const pitcherBias = (Math.random() - 0.5) * 30;   // -15〜+15: 投手好き/野手好き
    const youthBias = (Math.random() - 0.5) * 20;     // -10〜+10: 若手好き/即戦力好き
    const powerBias = (Math.random() - 0.5) * 16;     // -8〜+8: パワー重視/技巧重視
    const speedBias = (Math.random() - 0.5) * 12;     // -6〜+6: 俊足重視/鈍足許容
    const sourceBias = {};
    ['highschool', 'university', 'university_team', 'corporate', 'independent'].forEach(s => {
      sourceBias[s] = (Math.random() - 0.5) * 14;     // -7〜+7: ソース別好み
    });
    // 球団ごとに「欲しい道具」を1つ持つ。下位で一芸を買うとき、
    // 12球団が同じ順に並べないための散らし（守備型を好む球団／強肩を好む球団…）。
    const favoriteTool = randomHuntTool();
    teamPreferences[team] = { pitcherBias, youthBias, powerBias, speedBias, sourceBias, favoriteTool };
  });

  const getTeamPreferenceScore = (team, candidate) => {
    const pref = teamPreferences[team];
    if (!pref) return 0;
    const p = candidate.player;
    let bonus = 0;
    bonus += p.position === 'pitcher' ? pref.pitcherBias : -pref.pitcherBias;
    bonus += (p.age <= 20 ? pref.youthBias : p.age >= 24 ? -pref.youthBias : 0);
    if (p.position !== 'pitcher') {
      bonus += ((p.batting?.power || 0) >= 55 ? pref.powerBias : -pref.powerBias * 0.5);
      bonus += ((p.physical?.speed || 0) >= 65 ? pref.speedBias : -pref.speedBias * 0.5);
    }
    bonus += pref.sourceBias[candidate.source] || 0;
    return bonus;
  };

  // その指名で「探しに行く道具」を決める。6割は球団の好み、
  // 残りはその場の必要（＝ランダム）。12球団が同じ道具に殺到しないための散らし。
  const pickHuntTool = (team) => {
    const fav = teamPreferences[team]?.favoriteTool;
    if (fav && Math.random() < 0.6) return fav;
    return randomHuntTool();
  };

  // セ・パ別に順位をランダム決定（NPBシーズンは未シミュレーションのため）
  const CE_TEAMS = NPB_TEAMS.slice(0, 6);
  const PA_TEAMS = NPB_TEAMS.slice(6, 12);
  const ceStandings = [...CE_TEAMS].sort(() => Math.random() - 0.5);
  const paStandings = [...PA_TEAMS].sort(() => Math.random() - 0.5);
  // セパの左右配置を半々でランダム決定
  const ceFirst = Math.random() < 0.5;
  // グリッド表示用（セ1位,パ1位,セ2位,パ2位,...の順 or パ1位,セ1位,...の順）
  const npbStandings = [];
  for (let i = 0; i < 6; i++) {
    if (ceFirst) {
      npbStandings.push(ceStandings[i], paStandings[i]);
    } else {
      npbStandings.push(paStandings[i], ceStandings[i]);
    }
  }
  // ウェーバー制: 右下→左上（下位球団から指名）
  const waiverOrder = [...npbStandings].reverse();
  // 逆ウェーバー制: 左上→右下（上位球団から指名）
  const reverseWaiverOrder = [...npbStandings];

  // === 1巡目: 同時指名 + 抽選 + 外れ再指名ループ ===
  const firstRoundData = { phases: [] };
  const MAX_CONTESTED = 8;
  const MAX_PHASES = 5;

  const settledTeams = {};
  let teamsToProcess = [...shuffledTeams];

  for (let phaseI = 0; phaseI < MAX_PHASES && teamsToProcess.length > 0; phaseI++) {
    const phase = { picks: [], lotteryResults: [] };

    const teamPick = {};
    teamsToProcess.forEach(team => {
      let bestCand = null, bestPref = -Infinity;
      // 上位候補に絞って評価（全候補を見るのは不要）
      const topN = eligible.filter(c => !takenIds.has(c.player.id)).slice(0, 40);
      for (const c of topN) {
        const prefBonus = getTeamPreferenceScore(team, c);
        const noise = (Math.random() - 0.5) * 20;
        const pref = c.score + prefBonus + noise;
        if (pref > bestPref) { bestPref = pref; bestCand = c; }
      }
      teamPick[team] = bestCand;
    });

    const playerCompetitors = {};
    for (const [team, cand] of Object.entries(teamPick)) {
      if (!cand) continue;
      const id = cand.player.id;
      if (!playerCompetitors[id]) playerCompetitors[id] = [];
      playerCompetitors[id].push(team);
    }

    if (phaseI === 0) {
      const allPickedIds = new Set(Object.values(teamPick).filter(Boolean).map(c => c.player.id));
      const countContested = () => {
        let c = 0;
        for (const teams of Object.values(playerCompetitors)) {
          if (teams.length > 1) c += teams.length;
        }
        return c;
      };
      while (countContested() > MAX_CONTESTED) {
        let maxId = null, maxLen = 0;
        for (const [id, teams] of Object.entries(playerCompetitors)) {
          if (teams.length > maxLen) { maxLen = teams.length; maxId = id; }
        }
        if (!maxId || maxLen <= 1) break;
        const team = playerCompetitors[maxId].pop();
        const altCands = eligible.filter(c => !allPickedIds.has(c.player.id) && !takenIds.has(c.player.id)).slice(0, 30);
        let bestCand = null, bestScore = -Infinity;
        for (const c of altCands) {
          const prefBonus = getTeamPreferenceScore(team, c);
          const pref = c.score + prefBonus + (Math.random() - 0.5) * 15;
          if (pref > bestScore) { bestScore = pref; bestCand = c; }
        }
        if (!bestCand) break;
        allPickedIds.add(bestCand.player.id);
        teamPick[team] = bestCand;
        if (!playerCompetitors[bestCand.player.id]) playerCompetitors[bestCand.player.id] = [];
        playerCompetitors[bestCand.player.id].push(team);
      }
    }

    for (const team of teamsToProcess) {
      const cand = teamPick[team];
      if (!cand) continue;
      const id = cand.player.id;
      const contested = (playerCompetitors[id]?.length || 0) > 1;
      phase.picks.push({
        npbTeam: team, name: cand.player.name, position: cand.player.position,
        teamName: cand.teamName, source: cand.source, playerId: id, contested,
      });
    }

    const phaseLosers = new Set();
    for (const [playerId, teams] of Object.entries(playerCompetitors)) {
      if (teams.length <= 1) continue;
      const winner = teams[Math.floor(Math.random() * teams.length)];
      teams.filter(t => t !== winner).forEach(t => phaseLosers.add(t));
      phase.lotteryResults.push({
        playerName: teamPick[teams[0]].player.name,
        playerId: parseInt(playerId),
        competitors: [...teams], winner,
      });
    }

    for (const team of teamsToProcess) {
      if (!phaseLosers.has(team) && teamPick[team]) {
        settledTeams[team] = teamPick[team];
        takenIds.add(teamPick[team].player.id);
      }
    }

    firstRoundData.phases.push(phase);
    teamsToProcess = [...phaseLosers];
  }

  if (teamsToProcess.length > 0) {
    const fallbackPhase = { picks: [], lotteryResults: [] };
    for (const team of teamsToProcess) {
      const remaining = eligible.filter(c => !takenIds.has(c.player.id)).slice(0, 30);
      let bestCand = null, bestScore = -Infinity;
      for (const c of remaining) {
        const prefBonus = getTeamPreferenceScore(team, c);
        const pref = c.score + prefBonus + (Math.random() - 0.5) * 15;
        if (pref > bestScore) { bestScore = pref; bestCand = c; }
      }
      if (bestCand) {
        settledTeams[team] = bestCand;
        takenIds.add(bestCand.player.id);
        fallbackPhase.picks.push({
          npbTeam: team, name: bestCand.player.name, position: bestCand.player.position,
          teamName: bestCand.teamName, source: bestCand.source, playerId: bestCand.player.id, contested: false,
        });
      }
    }
    if (fallbackPhase.picks.length > 0) firstRoundData.phases.push(fallbackPhase);
  }

  for (const team of shuffledTeams) {
    const cand = settledTeams[team];
    if (!cand) continue;
    draftedPlayers.push(createDraftEntry(cand, team, 'ドラフト1位'));
    updateDraftTracker(team, cand);
    if (teamDraftLimits[team]) teamDraftLimits[team].mainDone++;
  }

  // === 2巡目以降（本指名のみ）: ウェーバー/逆ウェーバー交互制 ===
  for (let round = 1; round < maxMainRounds; round++) {
    const teamOrder = round % 2 === 1 ? waiverOrder : reverseWaiverOrder;
    for (const npbTeam of teamOrder) {
      const limits = teamDraftLimits[npbTeam];
      if (limits.mainDone >= limits.mainPicks) continue;
      const remaining = mainEligible.filter(c => !takenIds.has(c.player.id));
      if (remaining.length === 0) continue;
      // ⚠ 道具の加点は**窓を切る前**に足すこと。`remaining` は総合点順なので、
      //    窓を切ってから足しても、総合点の低い一芸型は最初から窓に入っていない。
      const pickOrder = limits.mainDone + 1;
      const huntTool = Math.random() < toolHuntRateForRound(pickOrder) ? pickHuntTool(npbTeam) : null;
      // ⚠ ロスターバランスの減点は**並べ替えにも掛けること**。窓の中でしか
      //    引かないと、道具の加点で窓が投手だけで埋まり、投手8割のチームが出る
      // ⚠ 一芸指名のときは**総合点も偏差に直して重みを下げる**（HUNT_SCORE_W）。
      //    素点のまま足すと総合点の幅（8σ）に道具が埋もれ、一芸型が上がってこない
      const huntScore = (c) => {
        const base = c.score + getBalancePenalty(npbTeam, c, teamDraftTracker);
        if (!huntTool) return base;
        return toolDevOf(c.toolDevs, huntTool)
          + ((base - mainScoreStats.mean) / mainScoreStats.sd) * HUNT_SCORE_W;
      };
      const ranked = huntTool ? [...remaining].sort((a, b) => huntScore(b) - huntScore(a)) : remaining;
      const searchWindow = ranked.slice(0, Math.max(8, Math.ceil(ranked.length * 0.15)));
      // 好み・ゆらぎは並べ替えと同じ単位にする（一芸指名では偏差、通常は素点）
      const unit = huntTool ? mainScoreStats.sd : 1;
      let bestCand = null, bestPref = -Infinity;
      for (const c of searchWindow) {
        const prefBonus = getTeamPreferenceScore(npbTeam, c);
        const noise = (Math.random() - 0.5) * 10;
        const pref = huntScore(c) + (prefBonus * 0.7 + noise) / unit;
        if (pref > bestPref) { bestPref = pref; bestCand = c; }
      }
      if (!bestCand) continue;
      takenIds.add(bestCand.player.id);
      draftedPlayers.push(createDraftEntry(bestCand, npbTeam, `ドラフト${pickOrder}位`, huntTool));
      updateDraftTracker(npbTeam, bestCand);
      limits.mainDone++;
    }
  }

  // === 育成指名: 純粋ウェーバー制（全球団参加、下位から指名） ===
  // 育成スコア: 成長力・プロ意識・出身源（高校/独立/クラブ）を重視した再評価
  const ikuEligible = allCandidates
    .filter(c => !takenIds.has(c.player.id))
    .map(c => {
      const gp = c.player.growthPotential || 1.0;
      const discipline = c.player.personality?.discipline || 50;
      let ikuScore = c.score                                   // 現在能力ベース
        + Math.max(0, gp - 1.0) * 60                          // 成長力ボーナス（gp1.3→+18, gp1.5→+30）
        + Math.max(0, discipline - 40) * 0.6;                 // プロ意識ボーナス（80→+24）
      // 大穴出身ボーナス: 高校・独立・クラブを優先
      if (c.source === 'highschool') ikuScore += 22;
      else if (c.source === 'independent') ikuScore += 18;
      else if (c.isClub) ikuScore += 18;
      return { ...c, ikuScore };
    })
    .sort((a, b) => b.ikuScore - a.ikuScore);
  const ikuScoreStats = scoreStats(ikuEligible.map(c => c.ikuScore));

  for (let ikuRound = 1; ikuRound <= maxIkuRounds; ikuRound++) {
    // 1巡目: ウェーバー（下位から）、2巡目: 逆ウェーバー（上位から）
    const teamOrder = ikuRound % 2 === 1 ? waiverOrder : reverseWaiverOrder;
    for (const npbTeam of teamOrder) {
      const limits = teamDraftLimits[npbTeam];
      if (limits.ikuDone >= limits.ikuPicks) continue;
      const remaining = ikuEligible.filter(c => !takenIds.has(c.player.id));
      if (remaining.length === 0) continue;
      // 育成は「今は使えないが1つだけ図抜けている」を取りに行く枠なので最も道具寄り
      const huntTool = Math.random() < TOOL_HUNT_RATE_IKU ? pickHuntTool(npbTeam) : null;
      const huntScore = (c) => {
        const base = c.ikuScore + getBalancePenalty(npbTeam, c, teamDraftTracker);
        if (!huntTool) return base;
        return toolDevOf(c.toolDevs, huntTool)
          + ((base - ikuScoreStats.mean) / ikuScoreStats.sd) * HUNT_SCORE_W;
      };
      const ranked = huntTool ? [...remaining].sort((a, b) => huntScore(b) - huntScore(a)) : remaining;
      const searchWindow = ranked.slice(0, 20);
      const unit = huntTool ? ikuScoreStats.sd : 1;
      let bestCand = null, bestPref = -Infinity;
      for (const c of searchWindow) {
        const prefBonus = getTeamPreferenceScore(npbTeam, c);
        const noise = (Math.random() - 0.5) * 12;
        const pref = huntScore(c) + (prefBonus * 0.5 + noise) / unit;
        if (pref > bestPref) { bestPref = pref; bestCand = c; }
      }
      if (!bestCand) continue;
      const ikuPickRound = limits.ikuDone + 1;
      takenIds.add(bestCand.player.id);
      draftedPlayers.push(createDraftEntry(bestCand, npbTeam, `育成${ikuPickRound}巡目`, huntTool));
      updateDraftTracker(npbTeam, bestCand);
      limits.ikuDone++;
    }
  }

  // === 惜しかった選手 ===
  const draftedIds = new Set(draftedPlayers.map(d => d.playerId));
  const lowestDraftedScore = draftedPlayers.length > 0 ? Math.min(...draftedPlayers.map(d => d.score)) : 0;
  const nearThreshold = lowestDraftedScore * 0.90;
  allCandidates.forEach(candidate => {
    if (draftedIds.has(candidate.player.id)) return;
    if (candidate.score >= nearThreshold && candidate.score < lowestDraftedScore) {
      const isPitcher = candidate.player.position === 'pitcher';
      const sourceLabel = { highschool: '高校', university: '大学', corporate: '', independent: '' }[candidate.source] || '';
      nearMissPlayers.push({
        name: candidate.player.name,
        teamName: candidate.teamName,
        position: candidate.player.position,
        age: candidate.player.age,
        source: candidate.source,
        reasons: [`${sourceLabel}${isPitcher ? '投手' : '野手'}力${Math.round(candidate.score)}pt（あと${Math.round(lowestDraftedScore - candidate.score)}pt）`]
      });
    }
  });

  // === プロ輩出ボーナス（チーム所属選手のみ） ===
  const teamDraftCounts = {};
  draftedPlayers.forEach(({ teamName, source }) => {
    if (source === 'highschool' || source === 'university') return;
    teamDraftCounts[teamName] = (teamDraftCounts[teamName] || 0) + 1;
  });

  // === OB名鑑への記録（プロへ送り出した教え子を能力込みで永久保存） ===
  // 資料室のOB名鑑で閲覧し、サンドボックスモードで再登場させて遊べるようにする。
  // セーブ肥大を避けるため、成績ログは持たず能力・素質のみを保持する。
  const newAlumniForRegistry = [];
  draftedPlayers.forEach((entry) => {
    if (entry.source === 'highschool' || entry.source === 'university') return;
    const team = allTeams[entry.teamName];
    const p = entry.player;
    if (!team || !p) return;
    if (!Array.isArray(team.npbAlumni)) team.npbAlumni = [];
    if (team.npbAlumni.some(a => a.playerId === p.id && a.draftYear === gameYear)) return;
    const clone = (o) => (o ? JSON.parse(JSON.stringify(o)) : null);
    const record = {
      playerId: p.id,
      name: p.name,
      age: p.age,
      position: p.position,
      draftYear: gameYear,
      npbTeam: entry.npbTeam,
      draftRound: entry.draftRound,
      draftScore: Math.round(entry.score ?? 0),
      fame: p.fame || 0,
      // 能力一式（サンドボックス再現用）
      batting: clone(p.batting),
      pitching: clone(p.pitching),
      physical: clone(p.physical),
      fielding: clone(p.fielding),
      catching: clone(p.catching),
      positionFitness: clone(p.positionFitness),
      growthPotential: p.growthPotential,
      personality: clone(p.personality),
      traits: clone(p.traits),
      careerHistory: clone(p.careerHistory),
    };
    team.npbAlumni.push(record);
    newAlumniForRegistry.push({ ...record, fromTeam: entry.teamName });
  });
  // セーブ横断のグローバル名鑑にもミラー（サンドボックスから呼び出せるように）
  if (newAlumniForRegistry.length > 0) addToObRegistry(newAlumniForRegistry);

  const proBonus = [];
  Object.entries(teamDraftCounts).forEach(([teamName, count]) => {
    const team = allTeams[teamName];
    if (!team) return;

    if (!team.developmentReputation) team.developmentReputation = 0;
    if (!team.totalProPlayersProduced) team.totalProPlayersProduced = 0;
    team.totalProPlayersProduced += count;

    // 注目度・ランク計算で参照できるようプロ輩出数を記録する。
    // proDraftCount=通算 / proDraftCountSeason=今季分（年度末にリセット）
    const holder = team.corporateData || team.universityData;
    if (holder) {
      holder.proDraftCount = (holder.proDraftCount || 0) + count;
      holder.proDraftCountSeason = (holder.proDraftCountSeason || 0) + count;
    }
    const reputationGain = count * 3;
    team.developmentReputation = Math.min(100, team.developmentReputation + reputationGain);

    const youngPlayers = team.players.filter(p => p.age <= 25);
    let boostedCount = 0;
    youngPlayers.forEach(player => {
      const boostAmount = Math.floor(Math.random() * 3) + 1;
      if (player.position === 'pitcher') {
        const stat = ['control', 'stamina'][Math.floor(Math.random() * 2)];
        if (stat === 'stamina') {
          player.pitching.stamina = Math.min(200, player.pitching.stamina + boostAmount * 2);
        } else {
          player.pitching[stat] = Math.min(100, player.pitching[stat] + boostAmount);
        }
      } else {
        const stats = ['meet', 'power', 'eye'];
        const stat = stats[Math.floor(Math.random() * stats.length)];
        player.batting[stat] = Math.min(100, player.batting[stat] + boostAmount);
      }
      boostedCount++;
    });

    proBonus.push({
      teamName, draftCount: count, reputationGain,
      currentReputation: team.developmentReputation,
      totalProduced: team.totalProPlayersProduced,
      boostedYoungPlayers: boostedCount
    });
  });

  // === プロ輩出アラムナイの記録（チーム所属選手のみ、永続保存） ===
  draftedPlayers.forEach(({ teamName, source, name, position, npbTeam, draftRound }) => {
    if (source === 'highschool' || source === 'university') return;
    const team = allTeams[teamName];
    if (!team) return;
    if (!team.npbAlumni) team.npbAlumni = [];
    team.npbAlumni.push({ name, position, npbTeam, draftRound, year: gameYear });
  });

  // === 各プールから指名者を除去 ===
  draftedPlayers.forEach(({ playerId, teamName, source }) => {
    if (source === 'corporate' || source === 'independent' || source === 'university_team') {
      const team = allTeams[teamName];
      if (team) {
        cleanupPlayerReferences(team, playerId);
        team.players = team.players.filter(p => p.id !== playerId);
      }
    }
  });

  const hsDraftedIds = new Set(draftedPlayers.filter(d => d.source === 'highschool').map(d => d.playerId));
  if (hsDraftedIds.size > 0) {
    highSchoolPool.players = highSchoolPool.players.filter(p => !hsDraftedIds.has(p.id));
  }

  // 大学スポーツ推薦スカウトリストの候補にNPB指名情報を付与（候補はdeep copyのためpool削除では反映されない）
  if (WORLD_DATA._universityScout?.candidates) {
    const hsDraftMap = new Map();
    draftedPlayers.forEach(({ playerId, npbTeam, draftRound, source }) => {
      if (source === 'highschool') hsDraftMap.set(playerId, { team: npbTeam, round: draftRound });
    });
    if (hsDraftMap.size > 0) {
      WORLD_DATA._universityScout.candidates.forEach(c => {
        const info = hsDraftMap.get(c.id);
        if (info) {
          c._npbDrafted = info;
          c._approaching = false; // 接近中止
        }
      });
    }
  }

  const uniDraftedIds = new Set(draftedPlayers.filter(d => d.source === 'university').map(d => d.playerId));
  if (uniDraftedIds.size > 0) {
    Object.keys(universityPool).forEach(enrollYear => {
      const cohort = universityPool[enrollYear];
      if (!cohort) return;
      universityPool[enrollYear] = cohort.filter(entry => !uniDraftedIds.has(entry.player.id));
      if (universityPool[enrollYear].length === 0) delete universityPool[enrollYear];
    });
  }

  const draftBySource = {
    highschool: draftedPlayers.filter(d => d.source === 'highschool').length,
    university: draftedPlayers.filter(d => d.source === 'university' || d.source === 'university_team').length,
    corporate: draftedPlayers.filter(d => d.source === 'corporate' && !d.isClub).length,
    independent: draftedPlayers.filter(d => d.source === 'independent').length,
    club: draftedPlayers.filter(d => d.isClub).length,
    total: draftedPlayers.length,
  };
  const firstRoundSources = { highschool: 0, university: 0, corporate: 0, independent: 0, club: 0 };
  draftedPlayers.filter(d => d.draftRound === 'ドラフト1位').forEach(d => {
    const src = (d.source === 'university_team') ? 'university' : (d.isClub ? 'club' : d.source);
    firstRoundSources[src] = (firstRoundSources[src] || 0) + 1;
  });
  console.log(`[NPBDraft] 結果: 総数${draftBySource.total} | 高校${draftBySource.highschool} 大学${draftBySource.university} 社会人${draftBySource.corporate} 独立${draftBySource.independent} クラブ${draftBySource.club}`);
  console.log(`[NPBDraft] 1位: 高校${firstRoundSources.highschool} 大学${firstRoundSources.university} 社会人${firstRoundSources.corporate} 独立${firstRoundSources.independent}`);

  return { draftedPlayers, nearMissPlayers, proBonus, draftBySource, firstRoundData, npbStandings, highSchoolDrafted: draftBySource.highschool };
}
