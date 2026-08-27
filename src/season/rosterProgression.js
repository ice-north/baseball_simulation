// ============================================================
// CPU並行世界のロスター管理 - src/season/rosterProgression.js
//
// yearProgressionSystem.js から、大学チームの卒業/新入生補充と、社会人/独立リーグ
// チームの戦力外/補充を担う関数群を抽出したもの。相互に閉じたグループで、他の年間
// 進行ロジックを呼ばないため循環参照はない（import は生成・プール・ロスター系のみ）。
//
// 公開エントリポイント: processUniversityTeamGraduation / releaseCPUCorporatePlayers /
// replenishCorporateRosters / replenishIndependentLeagueRosters（advanceToNextYearから利用）。
// ============================================================

import { highSchoolPool } from './universityPool.js';
import { generateCatcherLead } from '../utils/constants.js';
import { generatePositionFitness } from './tryoutSystem.js';
import { syncPositionToFitness } from '../utils/physics.js';
import { generateHandedness, generateBats } from '../utils/handedness.js';
import { releasedPlayersPool, TEAMS_DATA } from '../teams-data.js';
import { addToReleasedPool, replaceReleasedPool, removeFromReleasedPoolByIds } from '../state/pools.js';
import { addToRoster, replaceRoster } from '../state/roster.js';
import { generateRandomPlayerName } from '../data/playerNames.js';
import { homeBlockOf, blockOfCorporate, HOME_BONUS, HOME_WINDOW } from '../data/regions.js';

/**
 * 大学モード: TEAMS_DATA上のチームから4年生を卒業させ、新入生を補充
 * - 4年生(age>=22)は卒業 → NPBドラフト済みは除去済み、残りは進路振り分け
 * - 全チームに推薦入学+一般入部で新1年生を補充
 */
export function processUniversityTeamGraduation(allTeams, seasonData, currentYear) {
  const userTeamName = seasonData.userTeamName || Object.keys(allTeams)[0];
  const report = {
    graduated: [],    // ユーザーチームの卒業生のみ
    recruited: [],    // ユーザーチームの新入生のみ
    npbDrafted: [],
    postGradPaths: { corporate: 0, independent: 0, club: 0, retired: 0 },
    clubGraduates: [], // クラブ行き卒業生（step 5.65で使用）
  };

  // === Pass 1: 全チームの卒業生を収集し合算スコアで相対評価 ===
  // 絶対値閾値ではなく順位ベースで振り分けることで、ランクに関係なく適切な比率が保たれる
  const allGradsScored = [];
  const perTeamData = {};

  for (const [teamName, teamData] of Object.entries(allTeams)) {
    if (!teamData?.players || !teamData.universityData) continue;
    const rank = teamData.universityData.rank || 'C';
    const isUserTeam = teamName === userTeamName;

    const graduates = [];
    const remaining = [];
    teamData.players.forEach(p => {
      if (p.age >= 23 || (p.universityYear && p.universityYear >= 4)) {
        graduates.push(p);
      } else {
        remaining.push(p);
      }
    });

    graduates.forEach(grad => {
      const abilityScore = grad.position === 'pitcher'
        ? ((grad.pitching?.velocity || 120) - 120) * 1.5 + (grad.pitching?.control || 0) + (grad.pitching?.stamina || 0) * 0.4
        : (grad.batting?.meet || 0) + (grad.batting?.power || 0) + (grad.batting?.eye || 0) * 0.5 + (grad.physical?.speed || 0) * 0.3;

      const gp = grad.growthPotential || 1.0;
      const discipline = grad.personality?.discipline ?? 50;
      // 成長力・プロ意識ボーナス: 低能力でも伸びしろがある選手が一定数残れるように
      // gp1.0→+5, gp1.2→+15, gp1.5→+30 / disc60→+6, disc80→+12, disc100→+18
      const gpBonus = Math.max(0, (gp - 0.9) * 50);
      const discBonus = Math.max(0, (discipline - 40) * 0.3);
      allGradsScored.push({ player: grad, teamName, abilityScore, gp, discipline,
        compositeScore: abilityScore + gpBonus + discBonus });
    });

    perTeamData[teamName] = { graduates, remaining, rank, isUserTeam, teamData };
  }

  // スコア降順ソート → パーセンテージで進路振り分け
  allGradsScored.sort((a, b) => b.compositeScore - a.compositeScore);
  const total = allGradsScored.length;
  const corpCut = Math.floor(total * 0.22);  // 上位22%→社会人
  const indCut  = Math.floor(total * 0.37);  // 次の15%→独立リーグ
  // 残り: gp≥1.1かつdiscipline≥60 → クラブ、それ以外 → 引退

  allGradsScored.forEach(({ player: grad, gp, discipline }, idx) => {
    grad.isStarter = false;
    grad.battingOrder = 0;
    grad.origin = 'university';
    grad.isReleasedCandidate = true;

    if (idx < corpCut) {
      grad.postGradPath = 'corporate';
      addToReleasedPool(grad);
    } else if (idx < indCut) {
      grad.postGradPath = 'independent';
      addToReleasedPool(grad);
    } else if (gp >= 1.1 && discipline >= 60) {
      grad.postGradPath = 'club';
      report.clubGraduates.push(grad);
    } else {
      grad.postGradPath = 'retired';
    }
  });

  // === Pass 2: チームごとにロスター更新 / ユーザーチームのみレポート生成 ===
  for (const [teamName, { graduates, remaining, rank, isUserTeam, teamData }] of Object.entries(perTeamData)) {
    if (isUserTeam) {
      graduates.forEach(grad => {
        report.postGradPaths[grad.postGradPath]++;
        report.graduated.push({
          name: grad.name,
          team: teamName,
          position: grad.position,
          age: grad.age,
          path: grad.postGradPath,
          gp: grad.growthPotential,
          discipline: grad.personality?.discipline,
          stats: grad.position === 'pitcher'
            ? { velocity: grad.pitching?.velocity, control: grad.pitching?.control, stamina: grad.pitching?.stamina }
            : { meet: grad.batting?.meet, power: grad.batting?.power, eye: grad.batting?.eye, speed: grad.physical?.speed },
          careerStats: grad.careerStats ? {
            batting: { atBats: grad.careerStats.batting?.atBats || 0, hits: grad.careerStats.batting?.hits || 0, homeruns: grad.careerStats.batting?.homeruns || 0 },
            pitching: { wins: grad.careerStats.pitching?.wins || 0, saves: grad.careerStats.pitching?.saves || 0, inningsPitched: grad.careerStats.pitching?.inningsPitched || 0 },
          } : null,
          _playerRef: grad, // 配属完了後に nextYearTeam を転記するための一時参照
        });
      });
    }

    remaining.forEach(p => {
      if (p.universityYear) p.universityYear++;
    });

    // スカウト推薦入部者（ユーザーチームのみ）
    const scoutedPlayers = [];
    if (isUserTeam && highSchoolPool.players) {
      const reserved = highSchoolPool.players.filter(p => p._universityReserved === teamName);
      reserved.forEach(p => {
        delete p._universityReserved;
        p.universityTeamId = teamData.universityTeamId;
        p.universityTeamName = teamName;
        p.universityYear = 1;
        p.recruitType = p._isSelectionPick ? 'selection' : 'scouted';
        p.age = 19;
        p.isStarter = false;
        p.battingOrder = 0;
        if (!p.positionFitness) p.positionFitness = generatePositionFitness(p.position);
        syncPositionToFitness(p);
        if (!p.careerHistory) p.careerHistory = [];
        p.careerHistory = p.careerHistory.filter(h => h.type !== 'university');
        p.careerHistory.push({ type: 'university', year: currentYear + 1, label: teamName });
        p.seasonStats = { batting: { atBats: 0, hits: 0, doubles: 0, triples: 0, homeruns: 0, walks: 0, strikeouts: 0, rbis: 0, stolenBases: 0, caughtStealing: 0, sacrificeBunts: 0 }, pitching: { inningsPitched: 0, hits: 0, walks: 0, strikeouts: 0, earnedRuns: 0, wins: 0, losses: 0, saves: 0, gamesStarted: 0, gamesRelieved: 0, battersFaced: 0, homeruns: 0 } };
        if (!p.careerStats) p.careerStats = { batting: { atBats: 0, hits: 0, doubles: 0, triples: 0, homeruns: 0, walks: 0, strikeouts: 0, rbis: 0, stolenBases: 0 }, pitching: { inningsPitched: 0, hits: 0, walks: 0, strikeouts: 0, earnedRuns: 0, wins: 0, losses: 0, saves: 0, gamesStarted: 0, gamesRelieved: 0 } };
        scoutedPlayers.push(p);
      });
      highSchoolPool.players = highSchoolPool.players.filter(p => p._universityReserved !== teamName);
    }

    const maxRoster = isUserTeam ? 60 : Infinity;
    const targetSize = Math.min(getUniversityTargetRosterSize(rank), maxRoster);
    const rawNeeded = Math.max(0, Math.max(graduates.length, targetSize - remaining.length) - scoutedPlayers.length);
    const neededCount = (isUserTeam && scoutedPlayers.length > 0)
      ? Math.min(rawNeeded, Math.ceil(scoutedPlayers.length / 2))
      : rawNeeded;
    const newPlayers = generateUniversityFreshmen(neededCount, rank, teamName, teamData, currentYear);
    const allNewPlayers = [...scoutedPlayers, ...newPlayers];

    if (isUserTeam) {
      report.recruited.push(...allNewPlayers.map(p => ({
        name: p.name, team: teamName, position: p.position, type: p.recruitType,
      })));
      allNewPlayers.forEach(p => { p.isActive = false; });
    }

    const finalRoster = [...remaining, ...allNewPlayers];
    if (isUserTeam && finalRoster.length > 60) finalRoster.splice(60);
    replaceRoster(teamData, finalRoster);
  }

  return report;
}

// ランク別目標ロスターサイズ
function getUniversityTargetRosterSize(rank) {
  // 学年あたり人数×4学年（S:14, A:12, B:10, C:8, D:6）
  const sizes = { S: 56, A: 48, B: 40, C: 32, D: 24 };
  return sizes[rank] || 32;
}

// 選手能力の簡易スコア（円環インポート回避のためローカル定義）
function calcFreshmanScore(p) {
  if (p.position === 'pitcher') {
    return ((p.pitching?.velocity || 130) - 120) * 1.5 + (p.pitching?.control || 40) + (p.pitching?.stamina || 60) * 0.4;
  }
  return (p.batting?.meet || 0) + (p.batting?.power || 0) + (p.physical?.speed || 0) * 0.5 + (p.fielding?.defense || 0) * 0.3;
}

// 新入生を高校生プールから選出（セレクション・一般入部ともにプール由来）
function generateUniversityFreshmen(count, rank, teamName, teamData, currentYear) {
  if (count <= 0) return [];
  const newPlayers = [];

  if (highSchoolPool.players && highSchoolPool.players.length > 0) {
    const available = highSchoolPool.players.filter(p => !p._universityReserved);

    // ランク別能力帯（セレクション帯より若干下位）
    const GEN_BAND_LO = { S: 0.35, A: 0.48, B: 0.60, C: 0.70, D: 0.78 };
    const GEN_BAND_HI = { S: 0.85, A: 0.90, B: 0.93, C: 0.96, D: 1.00 };
    const lo = GEN_BAND_LO[rank] ?? 0.70;
    const hi = GEN_BAND_HI[rank] ?? 0.96;

    const scored = available
      .map(p => ({ p, score: calcFreshmanScore(p) }))
      .sort((a, b) => b.score - a.score);

    const n = scored.length;
    const band = scored.slice(Math.floor(n * lo), Math.min(n, Math.ceil(n * hi)));

    // 投手比率を約35%に制限（能力スコアで投手に偏らないよう位置別均等選出）
    const pitcherTarget = Math.round(count * 0.35);
    const fielderTarget = count - pitcherTarget;
    const bandPitchers = band.filter(e => e.p.position === 'pitcher').sort(() => Math.random() - 0.5);
    const bandFielders = band.filter(e => e.p.position !== 'pitcher').sort(() => Math.random() - 0.5);
    const picks = [
      ...bandPitchers.slice(0, pitcherTarget),
      ...bandFielders.slice(0, fielderTarget),
    ].sort(() => Math.random() - 0.5);

    if (picks.length > 0) {
      const takenIds = new Set(picks.map(({ p }) => p.id));
      // 選んだ選手をプールから即除去（他チームとの重複を防ぐ）
      highSchoolPool.players = highSchoolPool.players.filter(p => !takenIds.has(p.id));

      for (const { p: orig } of picks) {
        const p = JSON.parse(JSON.stringify(orig));
        p.universityTeamId = teamData.universityTeamId;
        p.universityTeamName = teamName;
        p.universityYear = 1;
        p.recruitType = 'general';
        p.age = 19;
        p.isStarter = false;
        p.battingOrder = 0;
        if (!p.positionFitness) p.positionFitness = generatePositionFitness(p.position);
        syncPositionToFitness(p);
        if (!p.careerHistory) p.careerHistory = [];
        p.careerHistory.push({ type: 'university', year: currentYear + 1, label: teamName });
        p.seasonStats = { batting: { atBats: 0, hits: 0, doubles: 0, triples: 0, homeruns: 0, walks: 0, strikeouts: 0, rbis: 0, stolenBases: 0, caughtStealing: 0, sacrificeBunts: 0 }, pitching: { inningsPitched: 0, hits: 0, walks: 0, strikeouts: 0, earnedRuns: 0, wins: 0, losses: 0, saves: 0, gamesStarted: 0, gamesRelieved: 0, battersFaced: 0, homeruns: 0 } };
        if (!p.careerStats) p.careerStats = { batting: { atBats: 0, hits: 0, doubles: 0, triples: 0, homeruns: 0, walks: 0, strikeouts: 0, rbis: 0, stolenBases: 0 }, pitching: { inningsPitched: 0, hits: 0, walks: 0, strikeouts: 0, earnedRuns: 0, wins: 0, losses: 0, saves: 0, gamesStarted: 0, gamesRelieved: 0 } };
        newPlayers.push(p);
      }
    }
  }

  // プール不足時のフォールバック生成
  if (newPlayers.length < count) {
    const remaining = count - newPlayers.length;
    const maxId = Object.values(TEAMS_DATA).flatMap(t => t.players || []).reduce((max, p) => Math.max(max, p.id || 0), 10000);
    for (let i = 0; i < remaining; i++) {
      const player = generateFreshmanPlayer(maxId + newPlayers.length + i + 1, rank, false);
      player.universityTeamId = teamData.universityTeamId;
      player.universityTeamName = teamName;
      player.universityYear = 1;
      player.recruitType = 'general';
      if (!player.careerHistory) player.careerHistory = [];
      player.careerHistory.push({ type: 'university', year: currentYear + 1, label: teamName });
      newPlayers.push(player);
    }
  }

  return newPlayers;
}

// 新入生1人を生成
function generateFreshmanPlayer(id, teamRank, isRecommended) {
  const name = generateRandomPlayerName();

  const isPitcher = Math.random() < 0.35;
  const position = isPitcher ? 'pitcher' : ['catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'][Math.floor(Math.random() * 8)];

  // 左右比率は src/utils/handedness.js に一元化（右打56% / 左打41% / 両打3%）
  const { throws, bats } = generateHandedness();

  // 推薦入学は能力が高い、一般入部は低め
  const rankBase = { S: 40, A: 35, B: 30, C: 25, D: 20 };
  const base = (rankBase[teamRank] || 25) + (isRecommended ? 10 : 0);
  const variance = () => Math.floor(Math.random() * 15) - 5;

  const meet = Math.max(5, base + variance());
  const power = Math.max(5, base + variance());
  const eye = Math.max(5, base - 5 + variance());
  const speed = Math.max(5, base + variance());
  const arm = Math.max(5, base + variance());
  const defense = Math.max(5, base + variance());
  const steal = Math.max(5, base - 10 + variance());

  const velBase = { S: 138, A: 135, B: 131, C: 127, D: 123 };
  const velocity = (velBase[teamRank] || 128) + (isRecommended ? 3 : 0) + Math.floor(Math.random() * 6) - 2;
  const control = Math.max(10, base + variance());
  const stamina = 60 + Math.floor(Math.random() * 40);

  const forms = ['overhand', 'three_quarter', 'sidearm', 'underhand'];
  const formWeights = [50, 30, 15, 5];
  let formRoll = Math.random() * 100, formIdx = 0;
  for (let i = 0; i < formWeights.length; i++) {
    formRoll -= formWeights[i];
    if (formRoll <= 0) { formIdx = i; break; }
  }

  const pitchTypes = ['slider', 'curve', 'fork', 'changeup', 'sinker', 'cutter', 'shoot'];
  const arsenal = [{ id: 1, type: pitchTypes[Math.floor(Math.random() * pitchTypes.length)], level: 15 + Math.floor(Math.random() * 25) }];
  if (Math.random() < 0.4) {
    let second = pitchTypes[Math.floor(Math.random() * pitchTypes.length)];
    if (second !== arsenal[0].type) arsenal.push({ id: 2, type: second, level: 10 + Math.floor(Math.random() * 20) });
  }

  const positionFitness = generatePositionFitness(position);

  const norm = () => Math.max(1, Math.min(100, Math.round(50 + (Math.sqrt(-2 * Math.log(Math.random() || 0.001)) * Math.cos(2 * Math.PI * Math.random())) * 18)));
  const growthPotential = 0.7 + Math.random() * 0.6;

  return {
    id,
    name,
    age: 19,
    position,
    battingOrder: 0,
    isStarter: false,
    isTwoWay: false,
    batting: { meet, power, eye, bats, steal, bunt: Math.max(5, Math.round(meet * 0.4 + speed * 0.3 + Math.random() * 15)) },
    physical: { speed, arm, throws, bodyStamina: 40 + Math.floor(Math.random() * 20), recovery: 40 + Math.floor(Math.random() * 20), muscle: 30 + Math.floor(Math.random() * 20), dexterity: 30 + Math.floor(Math.random() * 20) },
    fielding: { defense },
    catching: { lead: position === 'catcher' ? generateCatcherLead(19) : 10 },
    pitching: { velocity, control, stamina, form: forms[formIdx], arsenal },
    traits: [],
    positionFitness,
    personality: { discipline: norm(), mental: norm() },
    growthPotential,
    growthModifier: 0,
    fame: 0,
    experience: 0,
    fatigue: 0,
    seasonStats: { batting: { atBats: 0, hits: 0, doubles: 0, triples: 0, homeruns: 0, walks: 0, strikeouts: 0, rbis: 0, stolenBases: 0, caughtStealing: 0, sacrificeBunts: 0 }, pitching: { inningsPitched: 0, hits: 0, walks: 0, strikeouts: 0, earnedRuns: 0, wins: 0, losses: 0, saves: 0, gamesStarted: 0, gamesRelieved: 0, battersFaced: 0, homeruns: 0 } },
    careerStats: { batting: { atBats: 0, hits: 0, doubles: 0, triples: 0, homeruns: 0, walks: 0, strikeouts: 0, rbis: 0, stolenBases: 0 }, pitching: { inningsPitched: 0, hits: 0, walks: 0, strikeouts: 0, earnedRuns: 0, wins: 0, losses: 0, saves: 0, gamesStarted: 0, gamesRelieved: 0 } },
    careerHistory: [{ type: 'highschool', label: '高校卒' }],
  };
}

// ============================================================
// 独立リーグAIチームのロスター補充
// リリースプール（高卒/大卒/社会人/元チーム選手）から獲得し、
// 不足分は新規生成で埋める
// ============================================================

// ============================================================
// 社会人AIチームのロスター補充
// 毎年のオフシーズンにリリースプールから選手を獲得し、
// 退団・ドラフト指名で減った選手を補充する
// ============================================================

const CORP_ROSTER_TARGET = { S: 35, A: 32, B: 28, C: 25, D: 18 };

// ============================================================
// CPU社会人チームの自動戦力外通告（非社会人モード用）
// 社会人モードでは CorporateDepartureScreen が担当するため、
// 独立・大学モードでのみ呼び出す
//
// ⚠ **1チームの戦力外は年1回・1箇所だけ**。担当は以下のとおり分かれている:
//     自リーグ（プレイヤーが対戦するチーム）… `ContractScreen`（11/9）
//     背景の社会人・独立                     … この関数（年度替わり）
//     クラブ                                 … step 5.65
//     大学                                   … `processUniversityTeamGraduation`（卒業のみ・放出なし）
//   `excludeTeams` に自リーグを渡して二重処理を避ける。
// ============================================================
export function releaseCPUCorporatePlayers(allTeams, currentYear, excludeTeams = []) {
  const userTeamName = Object.keys(allTeams)[0];
  const skip = new Set([userTeamName, ...excludeTeams]);

  for (const [teamName, team] of Object.entries(allTeams)) {
    if (skip.has(teamName)) continue;   // 自チーム＋自リーグは ContractScreen が担当
    if (!team?.corporateData) continue;
    if (team.corporateData.type === 'club') continue;  // クラブは step 5.65 で管理

    const players = team.players;
    if (!players || players.length === 0) continue;

    const MIN_KEEP = team.independentLeagueId ? 16 : 18;
    if (players.length <= MIN_KEEP) continue;

    // 放出スコア: 高いほど放出候補（年齢 + 出場数不足 + 能力低下）
    const scored = players.map(p => {
      const age = p.age || 25;
      const games = (p.seasonStats?.batting?.games || 0)
        + (p.seasonStats?.pitching?.gamesStarted || 0)
        + (p.seasonStats?.pitching?.gamesRelieved || 0);
      let score = 0;

      if (age >= 38) score += 60;
      else if (age >= 36) score += 40;
      else if (age >= 34) score += 20;
      else if (age >= 32) score += 8;

      if (games < 5 && age >= 30) score += 25;
      else if (games < 10 && age >= 28) score += 10;

      // 能力低下: ランク基準より大幅に低い選手
      const ability = p.position === 'pitcher'
        ? (p.pitching?.velocity || 120) * 0.5 + (p.pitching?.control || 0)
        : (p.batting?.meet || 0) + (p.batting?.power || 0) * 0.5;
      if (ability < 55 && age >= 28) score += 12;

      return { player: p, score };
    });

    scored.sort((a, b) => b.score - a.score);

    // スコア20以上を放出候補、最大3名/年（MIN_KEEPを下回らない）
    const maxRelease = Math.min(
      scored.filter(e => e.score >= 20).length,
      Math.max(0, players.length - MIN_KEEP),
      3
    );
    if (maxRelease <= 0) continue;

    const releaseSet = new Set(scored.slice(0, maxRelease).map(e => e.player.id));

    scored.slice(0, maxRelease).forEach(({ player }) => {
      if ((player.age || 0) < 33) {  // 33歳以上は引退扱い（プールに入れない）
        const p = JSON.parse(JSON.stringify(player));
        p.isStarter = false;
        p.battingOrder = 0;
        p.releasedYear = currentYear;
        p.previousTeam = teamName;
        p.isReleasedCandidate = true;
        if (!p.careerHistory) p.careerHistory = [];
        p.careerHistory.push({ type: 'released', year: currentYear, label: `${teamName}退団` });
        addToReleasedPool(p);
      }
    });

    team.players = players.filter(p => !releaseSet.has(p.id));
  }
}

// tierFilter: 処理するランクの配列 (例: ['S','A'] or ['B','C','D'])。省略時は全ランク
// 優先度: S→A→独立(別関数)→B→C→D の順で処理することで、上位チームが良い選手を先に確保できる
export function replenishCorporateRosters(allTeams, currentYear, tierFilter) {
  const userTeamName = Object.keys(allTeams)[0];
  const allowedRanks = tierFilter ? new Set(tierFilter) : new Set(['S', 'A', 'B', 'C', 'D']);

  const teamsNeedingPlayers = [];
  for (const [teamName, team] of Object.entries(allTeams)) {
    if (teamName === userTeamName) continue;
    if (!team?.corporateData) continue;
    if (team.corporateData.type === 'club') continue;  // クラブは別処理
    if (team.independentLeagueId) continue;            // 独立は replenishIndependentLeagueRosters で処理
    const rank = team.corporateData.rank || 'D';
    if (!allowedRanks.has(rank)) continue;
    const target = CORP_ROSTER_TARGET[rank] || 20;
    const current = team.players?.length || 0;
    const needed = Math.max(0, target - current);
    if (needed > 0) {
      teamsNeedingPlayers.push({ teamName, team, needed, rank });
    }
  }

  if (teamsNeedingPlayers.length === 0 || releasedPlayersPool.length === 0) return;

  // 能力スコア（S/A/Bランク: 現在能力重視）
  const calcAbilScore = (p) => {
    if (p.position === 'pitcher') {
      return (p.pitching?.velocity || 130) * 0.5
           + (p.pitching?.control  || 0)   * 0.3
           + (p.pitching?.stamina  || 0)   * 0.2;
    }
    return (p.batting?.meet     || 0) * 0.35
         + (p.batting?.power    || 0) * 0.25
         + (p.batting?.eye      || 0) * 0.15
         + (p.physical?.speed   || 0) * 0.15
         + (p.fielding?.defense || 0) * 0.10;
  };

  // 将来性スコア（C/Dランク: 現在能力 + プロ意識 + 成長率も加味）
  const calcProspectScore = (p) => {
    const abil = calcAbilScore(p);
    const disc = p.personality?.discipline ?? 50;
    const gp   = p.growthPotential || 1.0;
    return abil * 0.60 + disc * 0.25 + Math.max(0, (gp - 1.0)) * 100 * 0.15;
  };

  // ポジション別在籍数マップを取得（0=不在, 1=薄い, 2+=充足）
  const FIELDER_POSITIONS = ['catcher', 'first_base', 'second_base', 'third_base', 'shortstop', 'left_field', 'center_field', 'right_field'];
  const getPositionCounts = (team) => {
    const counts = {};
    FIELDER_POSITIONS.forEach(pos => { counts[pos] = 0; });
    (team.players || []).forEach(p => {
      if (p.position !== 'pitcher') {
        const pos = p.subPosition || p.position;
        if (pos in counts) counts[pos]++;
      }
    });
    return counts;
  };

  // ポジション優先度ブースト（投手/野手比率・不在/薄いポジション補正）
  const positionBoost = (player, team) => {
    const total    = (team.players || []).length;
    const pitchers = (team.players || []).filter(p => p.position === 'pitcher').length;
    const ratio    = total > 0 ? pitchers / total : 0.35;
    const TARGET   = 0.35;
    if (player.position === 'pitcher') {
      if (ratio < TARGET - 0.05) return 20;   // 投手不足 → 優先
      if (ratio > TARGET + 0.10) return -20;  // 投手過多 → 抑制
      return 0;
    }
    // 野手
    if (ratio > TARGET + 0.05) return 15;     // 野手不足
    const counts    = getPositionCounts(team);
    const playerPos = player.subPosition || player.position;
    const cnt       = counts[playerPos] ?? 2;
    if (cnt === 0) return 30;   // 完全不在 → 最優先
    if (cnt === 1) return 18;   // 1名のみ（薄い）→ 準優先
    return 0;
  };

  // ランク順に処理（S→A→B→C→D）
  const RANK_ORDER = ['S', 'A', 'B', 'C', 'D'];
  teamsNeedingPlayers.sort((a, b) => RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank));

  const usedIndices = new Set();

  for (const teamInfo of teamsNeedingPlayers) {
    const isCDRank = teamInfo.rank === 'C' || teamInfo.rank === 'D';
    const teamBlock = blockOfCorporate(teamInfo.team);
    let added = 0;

    // このチーム向けにスコア付けしてソート
    const candidates = releasedPlayersPool
      .map((p, idx) => {
        if (usedIndices.has(idx)) return null;
        if (p.age && p.age > 32) return null;
        const base   = isCDRank ? calcProspectScore(p) : calcAbilScore(p);
        const posAdj = positionBoost(p, teamInfo.team);
        // 地元の高校出身なら少し優先する。⚠ 加点は控えめに（HOME_BONUS の注記参照）
        const homeAdj = (teamBlock && homeBlockOf(p) === teamBlock) ? HOME_BONUS : 0;
        return { player: p, idx, score: base + posAdj + homeAdj };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    for (const entry of candidates) {
      if (added >= teamInfo.needed) break;
      if (usedIndices.has(entry.idx)) continue;

      const p = entry.player;
      p._nextYearTeam = teamInfo.teamName;
      const player = { ...p };
      player.isStarter  = false;
      player.battingOrder = 0;
      if (!player.careerHistory) player.careerHistory = [];
      player.careerHistory.push({ type: 'corporate_join', year: currentYear + 1, label: teamInfo.teamName });
      addToRoster(teamInfo.team, player);
      usedIndices.add(entry.idx);
      added++;
    }
  }

  // 使用した選手をリリースプールから除去
  if (usedIndices.size > 0) {
    const remaining = releasedPlayersPool.filter((_, idx) => !usedIndices.has(idx));
    replaceReleasedPool(remaining);
  }

  // 最終パス（Dランクを含む）のみ: 未配属の社会人進路卒業生に表示用の行き先を付与
  if (!tierFilter || tierFilter.includes('D')) {
    const allCorpNames = Object.keys(allTeams).filter(name =>
      allTeams[name]?.corporateData && !allTeams[name]?.independentLeagueId
    );
    if (allCorpNames.length > 0) {
      releasedPlayersPool.forEach(p => {
        if (p.postGradPath === 'corporate' && !p._nextYearTeam) {
          p._nextYearTeam = allCorpNames[Math.floor(Math.random() * allCorpNames.length)];
        }
      });
    }
  }
}

// ============================================================



const TARGET_ROSTER_SIZE = 24;

function scorePlayerForRecruitment(p) {
  const base = p.position === 'pitcher'
    ? ((p.pitching?.velocity || 130) - 115) * 2 + (p.pitching?.control || 0) + (p.pitching?.stamina || 0) * 0.3
    : ((p.batting?.meet || 0) + (p.batting?.power || 0) + (p.physical?.speed || 0) + (p.fielding?.defense || 0)) / 4;
  const originBonus = (p.origin === 'independent_candidate' || p.postGradPath === 'independent') ? 15 : 0;
  return base + originBonus;
}

export function replenishIndependentLeagueRosters(allTeams, currentYear) {
  const userTeamName = Object.keys(allTeams)[0];

  // 補充が必要なAI独立リーグチームを収集（ユーザーのリーグのライバルも含む）
  // 独立リーグチームは corporateData と independentLeagueId の両方を持つ
  const teamsNeedingPlayers = [];
  for (const [teamName, team] of Object.entries(allTeams)) {
    if (teamName === userTeamName) continue;
    if (!team?.players) continue;
    // 独立リーグID を持つチームのみ対象（社会人・大学は replenishCorporateRosters で処理）
    if (!team.independentLeagueId) continue;

    const needed = Math.max(0, TARGET_ROSTER_SIZE - team.players.length);
    if (needed > 0) {
      teamsNeedingPlayers.push({ teamName, team, needed });
    }
  }

  if (teamsNeedingPlayers.length === 0) return;

  // プール候補をスコア順にソート
  const poolCandidates = releasedPlayersPool
    .map(p => ({ player: p, score: scorePlayerForRecruitment(p) }))
    .sort((a, b) => b.score - a.score);

  // プールの60%をAIチームに配分、40%はユーザーのトライアウト用に残す
  const maxTake = Math.floor(poolCandidates.length * 0.6);
  const totalNeeded = teamsNeedingPlayers.reduce((sum, t) => sum + t.needed, 0);
  const availableFromPool = Math.min(maxTake, totalNeeded);

  // チーム順をシャッフルして公平に配分（ラウンドロビン）
  const shuffled = [...teamsNeedingPlayers].sort(() => Math.random() - 0.5);
  const recruitedIds = new Set();
  let taken = 0;
  let candidateIdx = 0;

  // ラウンドロビン: 各チームに1人ずつ順番に配る
  let anyRecruited = true;
  while (anyRecruited && taken < availableFromPool) {
    anyRecruited = false;
    for (const teamInfo of shuffled) {
      if (teamInfo.needed <= 0) continue;
      // 次のまだ獲得されていない候補を探す
      while (candidateIdx < poolCandidates.length && recruitedIds.has(poolCandidates[candidateIdx].player.id)) {
        candidateIdx++;
      }
      if (candidateIdx >= poolCandidates.length) break;
      if (taken >= availableFromPool) break;

      // 地元優先。⚠ **プール全体から探してはいけない**——能力順に並んでいるので
      //    地元というだけで下位の選手まで拾いに行くとチーム戦力が地区で決まる。
      //    直後の HOME_WINDOW 人だけを見て、同じ地区の選手がいればそちらを取る。
      let pickIdx = candidateIdx;
      const teamBlock = blockOfCorporate(teamInfo.team);
      if (teamBlock) {
        for (let k = candidateIdx, seen = 0; k < poolCandidates.length && seen < HOME_WINDOW; k++) {
          if (recruitedIds.has(poolCandidates[k].player.id)) continue;
          seen++;
          if (homeBlockOf(poolCandidates[k].player) === teamBlock) { pickIdx = k; break; }
        }
      }
      const candidate = poolCandidates[pickIdx];
      candidate.player._nextYearTeam = teamInfo.teamName; // レポート転記用
      const p = JSON.parse(JSON.stringify(candidate.player));
      p.isStarter = false;
      p.battingOrder = 0;
      p.seasonStats = { batting: {}, pitching: {}, fielding: {} };
      p.careerHistory = p.careerHistory || [];
      p.careerHistory.push({ type: 'independent', label: `${teamInfo.teamName}入団`, year: currentYear + 1 });
      addToRoster(teamInfo.team, p);
      recruitedIds.add(candidate.player.id);
      teamInfo.needed--;
      taken++;
      if (pickIdx === candidateIdx) candidateIdx++;
      anyRecruited = true;
    }
  }

  // プールから獲得した選手を削除（残りはユーザーのトライアウト候補として残る）
  removeFromReleasedPoolByIds(recruitedIds);

  // プールで足りない分は新規選手を生成
  let nextId = (currentYear + 1) * 10000 + 8000;
  for (const teamInfo of shuffled) {
    while (teamInfo.needed > 0) {
      const newPlayer = generateIndependentNewcomer(nextId++, currentYear + 1);
      newPlayer.careerHistory = [{ type: 'independent', label: `${teamInfo.teamName}入団`, year: currentYear + 1 }];
      addToRoster(teamInfo.team, newPlayer);
      teamInfo.needed--;
    }
  }
}

function generateIndependentNewcomer(id, year) {
  const isPitcher = Math.random() < 0.45;
  const age = 18 + Math.floor(Math.random() * 5);
  const nameObj = generateRandomPlayerName();

  const baseAbility = () => 20 + Math.floor(Math.random() * 30);
  const lowAbility = () => 10 + Math.floor(Math.random() * 25);

  if (isPitcher) {
    // 投手は左投げが多め(30%)、野手は少なめ(15%)。打席は投げ手で条件付けして決める
    const pitcherThrows = Math.random() < 0.3 ? 'left' : 'right';
    return {
      id,
      name: nameObj.last + nameObj.first,
      age,
      position: 'pitcher',
      throws: pitcherThrows,
      bats: generateBats(pitcherThrows),
      pitching: {
        velocity: 125 + Math.floor(Math.random() * 15),
        control: baseAbility(),
        stamina: 50 + Math.floor(Math.random() * 40),
        breakingBalls: [
          { type: 'slider', level: 20 + Math.floor(Math.random() * 30) },
          ...(Math.random() < 0.5 ? [{ type: 'curve', level: 15 + Math.floor(Math.random() * 25) }] : []),
        ],
      },
      batting: { meet: lowAbility(), power: lowAbility(), eye: lowAbility() },
      physical: { speed: baseAbility(), arm: baseAbility(), stamina: 50 + Math.floor(Math.random() * 30), bodyStamina: 40 + Math.floor(Math.random() * 30), recovery: 40 + Math.floor(Math.random() * 30) },
      fielding: { defense: lowAbility(), catcher: 0 },
      positionFitness: generatePositionFitness('pitcher'),
      experience: 0,
      growthPotential: 0.7 + Math.random() * 0.6,
      growthModifier: 0,
      fame: 0,
      seasonStats: { batting: {}, pitching: {}, fielding: {} },
      careerStats: { batting: {}, pitching: {}, fielding: {} },
      form: Math.random() < 0.85 ? 'overhand' : (Math.random() < 0.5 ? 'sidearm' : 'threeQuarter'),
      isStarter: false,
      battingOrder: 0,
      traits: [],
    };
  }

  const fieldPositions = ['catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'];
  const position = fieldPositions[Math.floor(Math.random() * fieldPositions.length)];
  const fielderThrows = Math.random() < 0.15 ? 'left' : 'right';

  return {
    id,
    name: nameObj.last + nameObj.first,
    age,
    position,
    throws: fielderThrows,
    bats: generateBats(fielderThrows),
    pitching: { velocity: 110 + Math.floor(Math.random() * 15), control: lowAbility(), stamina: 30 + Math.floor(Math.random() * 20), breakingBalls: [] },
    batting: { meet: baseAbility(), power: baseAbility(), eye: baseAbility() },
    physical: { speed: baseAbility(), arm: baseAbility(), stamina: 50 + Math.floor(Math.random() * 30), bodyStamina: 40 + Math.floor(Math.random() * 30), recovery: 40 + Math.floor(Math.random() * 30) },
    // positionFitness は選手直下に置く。fielding の中に入れると
    // player.positionFitness?.[player.position] を見る守備計算から参照されず、
    // 適性が常に既定値(50)扱いになる
    fielding: { defense: baseAbility(), catcher: position === 'catcher' ? 30 + Math.floor(Math.random() * 30) : 0 },
    positionFitness: generatePositionFitness(position),
    experience: 0,
    growthPotential: 0.7 + Math.random() * 0.6,
    growthModifier: 0,
    fame: 0,
    seasonStats: { batting: {}, pitching: {}, fielding: {} },
    careerStats: { batting: {}, pitching: {}, fielding: {} },
    isStarter: false,
    battingOrder: 0,
    traits: [],
  };
}
