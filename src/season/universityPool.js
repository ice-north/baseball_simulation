// ============================================================
// 大学野球プールシステム (universityPool.js)
// 高卒世代 → NPB不指名 → ランク別進路振り分け
// 大学4年間 → 卒業後に再びドラフト/入団候補
// ============================================================

import { generateRandomPlayerName } from '../data/playerNames.js';
import { generatePositionFitness, generateRandomArsenal } from './tryoutSystem.js';
import { getUniversityGrowthMultiplier, UNIVERSITY_TEAMS, getUniversityTeamsByRank } from '../university/universityTeamsData.js';
import { assignHighSchool } from '../data/highSchoolData.js';

/**
 * 大学プール: グローバルミュータブル
 * { [enrollYear]: [ { player, enrollYear, graduateYear } ] }
 */
export const universityPool = {};

/**
 * 高校生プール: 4月に生成、10月ドラフト→11月進路振り分けまで保持
 * { players: Array, year: number }
 */
export const highSchoolPool = { players: [], year: 0 };

export const clearUniversityPool = () => {
  Object.keys(universityPool).forEach(k => delete universityPool[k]);
};

export const clearHighSchoolPool = () => {
  highSchoolPool.players = [];
  highSchoolPool.year = 0;
};

/**
 * 高卒世代を一括生成（毎年1回、ドラフト前に実行）
 * NPBに指名されるレベルの選手は少数。残りが大学・社会人・独立に流れる。
 * @param {number} year - ゲーム内年度
 * @param {number} count - 生成人数（デフォルト1000）
 * @returns {Array} 生成された高卒選手の配列
 */
export function generateHighSchoolClass(year, count = 3000) {
  const players = [];
  const idBase = year * 100000 + 50000;

  for (let i = 0; i < count; i++) {
    players.push(generateHighSchoolPlayer(idBase + i));
  }

  return players;
}

/**
 * 高卒選手を1人生成
 * 才能ランク（S～E）で基礎能力が決まり、一芸特化で個性を付与。
 * 成長力はランクと緩く相関するが、低ランクでも大器晩成型が出現する。
 */
function weightedPick(weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((s, [, w]) => s + Math.max(1, w), 0);
  let roll = Math.random() * total;
  for (const [key, w] of entries) {
    roll -= Math.max(1, w);
    if (roll <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

function generateHighSchoolPlayer(id) {
  const name = generateRandomPlayerName();

  const handRoll = Math.random() * 100;
  let throws, bats;
  if (handRoll < 42) { throws = 'right'; bats = 'right'; }
  else if (handRoll < 70) { throws = 'right'; bats = 'left'; }
  else if (handRoll < 93) { throws = 'left'; bats = 'left'; }
  else if (handRoll < 98) { throws = 'right'; bats = 'switch'; }
  else { throws = 'left'; bats = 'right'; }

  // === 体格 ===
  const buildRoll = Math.random();
  let build;
  if (buildRoll < 0.25) build = 'large';
  else if (buildRoll < 0.75) build = 'medium';
  else build = 'small';

  const buildMod = {
    large:  { power: 6, arm: 5, speed: -5, defense: -3, steal: -3, bodyStamina: 3 },
    medium: { power: 0, arm: 0, speed: 0, defense: 0, steal: 0, bodyStamina: 0 },
    small:  { power: -5, arm: -3, speed: 5, defense: 3, steal: 4, bodyStamina: -2 }
  }[build];

  const formRand = Math.random() * 100;
  let pitchingForm;
  if (formRand < 48) pitchingForm = 'overhand';
  else if (formRand < 86) pitchingForm = 'threeQuarter';
  else if (formRand < 96) pitchingForm = 'sidearm';
  else pitchingForm = 'submarine';

  const isSideOrUnder = pitchingForm === 'sidearm' || pitchingForm === 'submarine';
  const controlAdjust = isSideOrUnder ? 8 : 0;

  const r = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const cl = (val, lo, hi) => Math.max(lo, Math.min(hi, val));
  const nrm = (mu, sigma) => {
    const a = Math.random() || 0.001, b = Math.random();
    return mu + sigma * Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
  };

  // === 才能ランク（連続分布）===
  const talentRoll = Math.random() * 100;
  let tier, off;
  if (talentRoll < 1)        { tier = 'S'; off = 22; }
  else if (talentRoll < 4)   { tier = 'A'; off = 15; }
  else if (talentRoll < 12)  { tier = 'B'; off = 7; }
  else if (talentRoll < 28)  { tier = 'C'; off = 2; }
  else if (talentRoll < 68)  { tier = 'D'; off = 0; }
  else                       { tier = 'E'; off = -4; }

  // === Phase 2: 基礎身体能力を先に生成（投手/野手決定の材料）===
  let baseArm = Math.max(1, Math.round(nrm(38, 12) + off * 0.5 + buildMod.arm));
  let baseSpeed = Math.max(1, Math.round(nrm(35, 12) + buildMod.speed));

  // === Phase 3: 投手/野手を肩力ベースで決定 ===
  // 肩が強いほど投手になる確率が上がる（全体で約40%が投手）
  let pitcherChance = cl(0.12 + baseArm * 0.007, 0.10, 0.75);
  if (throws === 'left') pitcherChance = cl(pitcherChance + 0.10, 0.10, 0.80);
  const isPitcher = Math.random() < pitcherChance;

  // === Phase 4: ポジションを能力・体格から決定 ===
  let position;
  if (isPitcher) {
    position = 'pitcher';
  } else if (throws === 'left') {
    const w = {
      first:  20 + (build === 'large' ? 15 : 0) + Math.max(0, 40 - baseSpeed) * 0.3,
      left:   20 + (build === 'large' ? 8 : 0),
      center: 15 + Math.max(0, baseSpeed - 35) * 0.5 + (build === 'small' ? 10 : 0),
      right:  15 + Math.max(0, baseArm - 35) * 0.4
    };
    position = weightedPick(w);
  } else {
    const w = {
      catcher: 12 + Math.max(0, baseArm - 35) * 0.4 + (build === 'large' ? 5 : build === 'small' ? -5 : 0),
      first:   10 + (build === 'large' ? 10 : build === 'small' ? -3 : 0) + Math.max(0, 40 - baseSpeed) * 0.3,
      second:  12 + Math.max(0, baseSpeed - 30) * 0.3 + (build === 'small' ? 8 : build === 'large' ? -5 : 0),
      third:   12 + Math.max(0, baseArm - 30) * 0.3 + (build === 'large' ? 3 : 0),
      short:   10 + Math.max(0, baseSpeed - 35) * 0.4 + Math.max(0, baseArm - 35) * 0.3 + (build === 'small' ? 5 : build === 'large' ? -8 : 0),
      left:    10 + (build === 'large' ? 5 : 0) + Math.max(0, 35 - baseArm) * 0.2,
      center:  10 + Math.max(0, baseSpeed - 35) * 0.5 + (build === 'small' ? 5 : build === 'large' ? -3 : 0),
      right:   10 + Math.max(0, baseArm - 35) * 0.4 + Math.max(0, baseSpeed - 30) * 0.2
    };
    position = weightedPick(w);
  }

  // === 一芸特化（25%）===
  let specialty = null;
  if (Math.random() < 0.25) {
    specialty = isPitcher
      ? ['power_arm', 'technician', 'iron_arm'][r(0, 2)]
      : ['speedster', 'slugger', 'contact', 'glove', 'cannon'][r(0, 4)];
  }

  // === Phase 5: 能力生成 ===
  const g = (mu, sigma, tf = 0, floor = 1) =>
    Math.max(floor, Math.round(nrm(mu, sigma) + off * tf));

  let abilities;
  if (isPitcher) {
    const velTierBonus = { S: 3, A: 2, B: 1, C: 0, D: -1, E: -2 };
    let velocity = Math.round(nrm(126, 9) + velTierBonus[tier]);
    if (isSideOrUnder) velocity -= 3;
    if (throws === 'left') velocity -= 3;
    let control = Math.round(nrm(24, 9) + off + controlAdjust);
    let stamina = Math.round(nrm(58, 12) + off * 1.5);

    if (specialty === 'power_arm') velocity += r(5, 10);
    else if (specialty === 'technician') control += r(10, 20);
    else if (specialty === 'iron_arm') stamina += r(15, 25);

    abilities = {
      meet: g(14, 6, 0.3, 3),
      power: g(10 + buildMod.power * 0.3, 5, 0.3, 3),
      eye: g(16, 6, 0.3, 5),
      steal: Math.max(1, Math.round(nrm(16, 7) + buildMod.steal * 0.5)),
      speed: baseSpeed,
      arm: Math.max(10, baseArm + r(2, 8)),
      defense: g(32, 8, 0.4, 1),
      bodyStamina: g(45 + buildMod.bodyStamina, 10, 0, 15),
      recovery: g(43, 10, 0, 15),
      velocity: Math.max(95, velocity),
      control: Math.max(5, control),
      stamina: Math.max(25, stamina)
    };
  } else {
    // ポジション別補正
    const pm = {
      catcher: { meet: -2, power: 0, eye: 0, defense: 4, steal: -5 },
      first:   { meet: 1, power: 5, eye: 1, defense: -4, steal: -4 },
      second:  { meet: 2, power: -3, eye: 2, defense: 3, steal: 2 },
      short:   { meet: 0, power: -3, eye: 1, defense: 5, steal: 1 },
      third:   { meet: 0, power: 3, eye: 0, defense: 2, steal: -2 },
      left:    { meet: 2, power: 4, eye: 1, defense: -3, steal: -1 },
      center:  { meet: 1, power: -3, eye: 1, defense: 4, steal: 3 },
      right:   { meet: 0, power: 2, eye: 0, defense: 1, steal: 0 }
    }[position] || { meet: 0, power: 0, eye: 0, defense: 0, steal: 0 };

    let meet = Math.round(nrm(19, 9) + off + pm.meet);
    let power = Math.round(nrm(15, 10) + off + buildMod.power + pm.power);
    let eye = Math.round(nrm(18, 8) + off * 0.8 + pm.eye);
    let defense = Math.round(nrm(28, 10) + off * 0.6 + buildMod.defense + pm.defense);
    let steal = Math.round(nrm(22, 9) + off * 0.4 + buildMod.steal + pm.steal);

    if (specialty === 'speedster') { baseSpeed += r(12, 22); steal += r(8, 15); }
    else if (specialty === 'slugger') power += r(12, 22);
    else if (specialty === 'contact') { meet += r(12, 20); eye += r(8, 15); }
    else if (specialty === 'glove') defense += r(12, 20);
    else if (specialty === 'cannon') baseArm += r(15, 25);

    abilities = {
      meet: Math.max(5, meet), power: Math.max(3, power),
      eye: Math.max(5, eye), steal: Math.max(1, steal),
      speed: Math.max(1, baseSpeed), arm: Math.max(1, baseArm),
      defense: Math.max(1, defense),
      bodyStamina: g(46 + buildMod.bodyStamina, 10, 0, 15),
      recovery: g(43, 10, 0, 15),
      velocity: Math.max(90, Math.round(nrm(85 + baseArm * 0.6, 5))),
      control: g(20, 7, 0.3, 5),
      stamina: g(42, 8, 0.3, 20)
    };
  }

  // 成長力: ランクにほぼ依存しない（生まれ持った素質）
  const gpCenter = { S: 1.02, A: 0.98, B: 0.95, C: 0.92, D: 0.90, E: 0.88 };
  const u1 = Math.random() || 0.001;
  const u2 = Math.random();
  const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const growthPotential = cl(gpCenter[tier] + normal * 0.28, 0.35, 1.50);

  let fame = 0;
  if (tier === 'S') {
    fame = Math.random() < 0.10 ? r(0, 5) : r(15, 40);
  } else if (tier === 'A') {
    fame = Math.random() < 0.10 ? r(0, 5) : r(5, 20);
  } else if (tier === 'B' && Math.random() < 0.3) {
    fame = r(1, 10);
  }

  const highSchool = assignHighSchool(tier);

  return {
    id,
    name,
    age: 18,
    position,
    batting: {
      meet: abilities.meet, power: abilities.power, eye: abilities.eye,
      bats, steal: abilities.steal, bunt: r(10, 40)
    },
    physical: {
      speed: abilities.speed, arm: abilities.arm, throws, build,
      bodyStamina: abilities.bodyStamina, recovery: abilities.recovery,
      muscle: Math.max(5, Math.round(nrm(build === 'large' ? 55 : build === 'small' ? 30 : 42, 10))),
      dexterity: Math.max(5, Math.round(nrm(build === 'large' ? 35 : build === 'small' ? 55 : 42, 10)))
    },
    fielding: { defense: abilities.defense },
    catching: {
      lead: position === 'catcher' ? r(25, 55) : r(10, 30)
    },
    pitching: {
      velocity: abilities.velocity, control: abilities.control,
      stamina: abilities.stamina, spinRate: r(20, 50),
      form: pitchingForm,
      arsenal: isPitcher ? generateRandomArsenal(0, true) : generateFielderArsenalBasic()
    },
    growthPotential,
    growthModifier: 0,
    personality: {
      discipline: Math.max(1, Math.min(100, Math.round(50 + (Math.sqrt(-2 * Math.log(Math.random() || 0.001)) * Math.cos(2 * Math.PI * Math.random())) * 18))),
      mental: Math.max(1, Math.min(100, Math.round(50 + (Math.sqrt(-2 * Math.log(Math.random() || 0.001)) * Math.cos(2 * Math.PI * Math.random())) * 18))),
    },
    positionFitness: generatePositionFitness(position),
    fame,
    highSchool: highSchool ? { name: highSchool.name, rank: highSchool.rank, pref: highSchool.pref } : null,
    fatigue: 0,
    experience: 0,
    careerHistory: [{ type: 'highschool', year: null, label: highSchool ? `${highSchool.name}` : '高校卒' }],
    seasonStats: createEmptyStats(),
    careerStats: createEmptyStats()
  };
}

function generateFielderArsenalBasic() {
  const types = ['slider', 'curve', 'fork', 'changeup', 'sinker', 'cutter'];
  const type = types[Math.floor(Math.random() * types.length)];
  return [
    { id: 1, type: 'straight', level: 100 },
    { id: 2, type, level: Math.floor(Math.random() * 15) + 15 }
  ];
}

function createEmptyStats() {
  return {
    batting: { games: 0, atBats: 0, hits: 0, doubles: 0, triples: 0, homeruns: 0, rbis: 0, walks: 0, strikeouts: 0, stolenBases: 0, sacrificeBunts: 0 },
    pitching: { games: 0, wins: 0, losses: 0, saves: 0, holds: 0, inningsPitched: 0, runsAllowed: 0, earnedRuns: 0, hits: 0, homeruns: 0, walks: 0, strikeouts: 0, pitches: 0 }
  };
}

// ============================================================
// 進路振り分け
// ============================================================

/**
 * 高卒世代の進路を振り分け
 * 能力順にソートし、上位層から大学→社会人→独立の順で配分
 * @param {Array} highSchoolClass - 高卒選手の配列
 * @param {number} year - 入学年度
 * @returns {{ university: Array, corporate: Array, independent: Array, undrafted: Array }}
 */
export function assignCareerPaths(highSchoolClass, year) {
  // 総合力でソート
  const scored = highSchoolClass.map(p => ({
    player: p,
    score: evaluatePlayerPotential(p)
  }));
  scored.sort((a, b) => b.score - a.score);

  const total = scored.length;
  // 上位30%: 大学進学
  const uniCut = Math.floor(total * 0.30);
  // 次の10%: 社会人入り候補
  const corpCut = uniCut + Math.floor(total * 0.10);
  // 次の10%: 独立リーグ候補
  const indCut = corpCut + Math.floor(total * 0.10);
  // 残り50%: 野球を辞める（破棄）

  const university = scored.slice(0, uniCut).map(s => s.player);
  const corporate = scored.slice(uniCut, corpCut).map(s => s.player);
  const independent = scored.slice(corpCut, indCut).map(s => s.player);
  const undrafted = scored.slice(indCut).map(s => s.player);

  return { university, corporate, independent, undrafted };
}

/**
 * 選手の潜在能力を評価（進路振り分け用）
 * 現在の能力 + 成長力を加味
 */
function evaluatePlayerPotential(player) {
  const isPitcher = player.position === 'pitcher';
  const gp = player.growthPotential || 1.0;

  let abilityScore;
  if (isPitcher) {
    const v = player.pitching?.velocity || 130;
    const c = player.pitching?.control || 40;
    const s = player.pitching?.stamina || 60;
    abilityScore = (v - 120) * 1.5 + c + s * 0.4;
  } else {
    const m = player.batting?.meet || 0;
    const p = player.batting?.power || 0;
    const spd = player.physical?.speed || 0;
    const def = player.fielding?.defense || 0;
    const arm = player.physical?.arm || 0;
    abilityScore = m + p + spd * 0.5 + def * 0.3 + arm * 0.3;
  }

  // 成長力で補正（高成長の選手は上位に配置されやすい）
  const growthBonus = (gp - 0.9) * 50;
  // ランダムなゆらぎ（完全な実力順にならないように）
  const noise = (Math.random() - 0.5) * 20;

  // 知名度補正: 無名の逸材は評価が低くなり、下位に流れやすい
  const fame = player.fame || 0;
  const famePenalty = fame < 5 ? -(20 + Math.random() * 10)
                    : fame < 15 ? -(5 + Math.random() * 10)
                    : 0;

  return abilityScore + growthBonus + noise + famePenalty;
}

// ============================================================
// ランク別進路振り分け（NPBドラフト後に実行）
// S→A→B→C→D の順に良い選手から各ランクの大学・社会人・独立に配分
// ============================================================

// 各ランクの受け入れ割合（高校生全体に対する比率）
// 大学は各ランクのチーム数×1チームあたり受け入れ数で算出
const UNI_PER_TEAM = { S: 15, A: 13, B: 11, C: 9, D: 7 };
const RANK_CORP_RATIO = { S: 0.10, A: 0.08, B: 0.06, C: 0.04, D: 0.03 };
const RANK_IND_RATIO  = { S: 0.05, A: 0.04, B: 0.04, C: 0.03, D: 0.03 };

function getUniversitySlotsByRank() {
  const teamCounts = {};
  UNIVERSITY_TEAMS.forEach(t => { teamCounts[t.rank] = (teamCounts[t.rank] || 0) + 1; });
  const slots = {};
  for (const rank of ['S', 'A', 'B', 'C', 'D']) {
    slots[rank] = (teamCounts[rank] || 0) * (UNI_PER_TEAM[rank] || 7);
  }
  return slots;
}

/**
 * NPBドラフトで高校生プールから有力選手を除去
 * 高校生は18歳なので年齢ボーナス+25ptがつく
 * @returns {{ drafted: Array, remaining: Array }}
 */
export function processHighSchoolNPBDraft() {
  const NPB_TEAMS = [
    '読売ジャイアンツ', '阪神タイガース', '横浜DeNAベイスターズ',
    '広島東洋カープ', '中日ドラゴンズ', 'ヤクルトスワローズ',
    'オリックス・バファローズ', 'ソフトバンクホークス', '西武ライオンズ',
    '楽天ゴールデンイーグルス', '千葉ロッテマリーンズ', '日本ハムファイターズ'
  ];

  // 高校生用の閾値（社会人/大学よりやや低い → 将来性重視）
  const HS_PITCHER_THRESHOLD = 200;
  const HS_FIELDER_THRESHOLD = 230;
  const DRAFT_ROUND_LABELS = ['育成指名', 'ドラフト6位', 'ドラフト5位', 'ドラフト4位', 'ドラフト3位', 'ドラフト2位', 'ドラフト1位'];

  const drafted = [];
  const remaining = [];

  highSchoolPool.players.forEach(player => {
    const score = evaluatePlayerPotential(player);
    const isPitcher = player.position === 'pitcher';
    const threshold = isPitcher ? HS_PITCHER_THRESHOLD : HS_FIELDER_THRESHOLD;

    // 成長力が高い選手は追加評価
    const gpBonus = Math.max(0, (player.growthPotential - 1.0) * 40);
    const totalScore = score + gpBonus;

    if (totalScore >= threshold) {
      const npbTeam = NPB_TEAMS[Math.floor(Math.random() * NPB_TEAMS.length)];
      const overThreshold = totalScore - threshold;
      const roundIndex = Math.min(Math.floor(overThreshold / 10), DRAFT_ROUND_LABELS.length - 1);
      drafted.push({
        player,
        npbTeam,
        draftRound: DRAFT_ROUND_LABELS[Math.max(0, roundIndex)],
        position: player.position,
        age: player.age,
        name: player.name,
        playerId: player.id,
        score: totalScore,
        source: 'highschool'
      });
    } else {
      remaining.push(player);
    }
  });

  highSchoolPool.players = remaining;
  return { drafted, remaining };
}

/**
 * ランク別に進路を振り分け（NPBドラフト後に実行）
 * @param {number} enrollYear - 大学入学年度
 * @returns {{ university: Object, corporate: Array, independent: Array, retired: Array }}
 *   university: { S: [...], A: [...], ... } ランク別に分類
 */
export function distributeHighSchoolGraduates(enrollYear) {
  const players = highSchoolPool.players;
  if (players.length === 0) {
    return { university: {}, corporate: [], independent: [], retired: [] };
  }

  // 潜在能力でソート（降順）
  const scored = players.map(p => ({
    player: p,
    score: evaluatePlayerPotential(p)
  }));
  scored.sort((a, b) => b.score - a.score);

  const total = scored.length;
  const university = { S: [], A: [], B: [], C: [], D: [] };
  const corporate = [];
  const independent = [];
  let cursor = 0;

  const uniSlots = getUniversitySlotsByRank();

  // ランクS→Dの順に上位から取っていく
  for (const rank of ['S', 'A', 'B', 'C', 'D']) {
    const uniCount = Math.min(uniSlots[rank] || 0, total - cursor);
    const corpRatio = RANK_CORP_RATIO[rank] || 0.25;
    const indRatio = RANK_IND_RATIO[rank] || 0.20;
    const corpCount = Math.floor(uniCount * corpRatio / (1 - corpRatio - indRatio));
    const indCount = Math.floor(uniCount * indRatio / (1 - corpRatio - indRatio));
    const slotCount = Math.min(uniCount + corpCount + indCount, total - cursor);
    const slice = scored.slice(cursor, cursor + slotCount);
    cursor += slotCount;

    slice.forEach((entry, i) => {
      const p = entry.player;
      p.age = Math.max(p.age || 18, 19);
      if (i < uniCount) {
        p._destinationRank = rank;
        university[rank].push(p);
      } else if (i < uniCount + corpCount) {
        p.origin = 'corporate_candidate';
        p._destinationRank = rank;
        corporate.push(p);
      } else {
        p.origin = 'independent_candidate';
        p._destinationRank = rank;
        independent.push(p);
      }
    });
  }

  // 残り（どこにも入れなかった選手）は引退
  const retired = scored.slice(cursor).map(s => s.player);

  // 高校生プールをクリア
  highSchoolPool.players = [];

  return { university, corporate, independent, retired };
}

// ============================================================
// 大学在学中の成長
// ============================================================

/**
 * 大学プールの年次更新（毎年オフシーズンに実行）
 * - 在学中の選手の年齢+1、能力成長
 * - 4年生（22歳）を卒業として排出
 * @param {number} currentYear - 現在のゲーム年度
 * @returns {{ graduates: Array, enrollmentReport: Object }}
 */
export function processUniversityYear(currentYear) {
  const graduates = [];
  const report = { grown: 0, graduated: 0 };

  Object.keys(universityPool).forEach(enrollYear => {
    const cohort = universityPool[enrollYear];
    if (!cohort) return;

    const remaining = [];
    cohort.forEach(entry => {
      const player = entry.player;
      player.age = (player.age || 18) + 1;

      // 在学年数
      const yearsInUni = currentYear - entry.enrollYear;

      // 卒業判定: 4年経過 or 年齢23歳以上
      if (yearsInUni >= 4 || player.age >= 23) {
        if (entry.universityTeamId) {
          player.universityTeamId = entry.universityTeamId;
          player.universityName = entry.universityTeamName;
          player.universityRank = entry.universityRank;
        }
        graduates.push(player);
        report.graduated++;
        return;
      }

      // 成長処理（大学ランクに応じた成長倍率を適用）
      applyUniversityGrowth(player, entry.universityRank);
      report.grown++;
      remaining.push(entry);
    });

    if (remaining.length === 0) {
      delete universityPool[enrollYear];
    } else {
      universityPool[enrollYear] = remaining;
    }
  });

  return { graduates, report };
}

/**
 * 大学入学時の一括底上げ（seedInitialUniversityClasses用）
 * 高校生品質のベースを大学在籍レベルまで引き上げる
 */
function applyUniversityEntranceBoost(player, universityRank) {
  const boostMap = { S: 12, A: 9, B: 6, C: 4, D: 2 };
  const base = boostMap[universityRank] || 4;
  const gp = player.growthPotential || 1.0;
  const r = () => Math.floor(Math.random() * 5) - 2;
  const isPitcher = player.position === 'pitcher';

  const decayMult = (current, threshold, rate) => {
    if (current < threshold) return 1.0;
    return Math.max(0.10, 1.0 - (current - threshold) * rate);
  };
  const boost = (v, amount, cap = 99, threshold = null, rate = 0.05) => {
    let raw = amount * (0.8 + gp * 0.4);
    if (threshold != null) raw *= decayMult(v, threshold, rate);
    return Math.min(cap, v + Math.round(raw) + r());
  };

  if (isPitcher) {
    player.pitching.velocity = boost(player.pitching.velocity, base * 0.5, 155, 145, 0.20);
    player.pitching.control = boost(player.pitching.control, base * 1.2, 99, 70, 0.05);
    player.pitching.stamina = boost(player.pitching.stamina, base * 1.5, 200, 80, 0.03);
    player.physical.arm = boost(player.physical.arm, base * 0.8, 99, 80, 0.03);
  } else {
    player.batting.meet = boost(player.batting.meet, base * 1.0, 99, 70, 0.05);
    player.batting.power = boost(player.batting.power, base * 0.8, 99, 70, 0.05);
    player.batting.eye = boost(player.batting.eye, base * 0.8, 99, 70, 0.05);
    player.physical.speed = boost(player.physical.speed, base * 0.6, 99, 80, 0.03);
    player.physical.arm = boost(player.physical.arm, base * 0.5, 99, 80, 0.03);
    player.fielding.defense = boost(player.fielding.defense, base * 0.8, 99, 70, 0.05);
  }
  player.physical.bodyStamina = boost(player.physical.bodyStamina || 40, base * 0.6, 99, 80, 0.03);
  player.physical.recovery = boost(player.physical.recovery || 40, base * 0.4, 99, 80, 0.03);
}

/**
 * 大学での1年間の成長を適用
 * キャンプの練習とは異なり、バランス型の緩やかな成長
 * @param {Object} player - 選手オブジェクト
 * @param {string|null} universityRank - 大学ランク（S/A/B/C/D）。高ランクほど成長が速い
 */
function applyUniversityGrowth(player, universityRank = null) {
  const gp = player.growthPotential || 1.0;
  const rankMult = getUniversityGrowthMultiplier(universityRank);
  const isPitcher = player.position === 'pitcher';

  // 高能力値の成長減衰（キャンプと同じルール）
  const decayMult = (current, threshold, rate, floor = 0.10) => {
    if (current < threshold) return 1.0;
    return Math.max(floor, 1.0 - (current - threshold) * rate);
  };

  const grow = (current, base, cap = 99, threshold = null, rate = 0.05) => {
    let amount = base * gp * rankMult * (0.7 + Math.random() * 0.6);
    if (threshold != null) {
      amount *= decayMult(current, threshold, rate);
    }
    return Math.min(cap, current + Math.round(amount));
  };

  if (isPitcher) {
    player.pitching.control = grow(player.pitching.control, 3, 99, 70, 0.05);
    player.pitching.stamina = grow(player.pitching.stamina, 4, 200, 80, 0.03);
    player.physical.arm = grow(player.physical.arm, 2, 99, 80, 0.03);
    player.pitching.velocity = grow(player.pitching.velocity, 1.0, 165, 150, 0.20);
    if (player.pitching.arsenal) {
      player.pitching.arsenal.forEach(pitch => {
        if (pitch.type !== 'straight') {
          pitch.level = Math.min(100, pitch.level + Math.floor(Math.random() * 3 * gp));
        }
      });
    }
    player.physical.bodyStamina = grow(player.physical.bodyStamina, 2, 99, 80, 0.03);
  } else {
    player.batting.meet = grow(player.batting.meet, 3, 99, 70, 0.05);
    player.batting.power = grow(player.batting.power, 2, 99, 70, 0.05);
    player.batting.eye = grow(player.batting.eye, 2, 99, 70, 0.05);
    player.physical.speed = grow(player.physical.speed, 1, 99, 80, 0.03);
    player.fielding.defense = grow(player.fielding.defense, 2, 99, 70, 0.05);
    player.physical.arm = grow(player.physical.arm, 1, 99, 80, 0.03);
    player.physical.bodyStamina = grow(player.physical.bodyStamina, 2, 99, 80, 0.03);
  }

  // フィジカル共通
  player.physical.muscle = grow(player.physical.muscle || 40, 2, 99, 80, 0.03);
  player.physical.dexterity = grow(player.physical.dexterity || 40, 2, 99, 80, 0.03);
  player.physical.recovery = grow(player.physical.recovery || 40, 1, 99, 80, 0.03);
}

// ============================================================
// 入学・卒業の統合処理
// ============================================================

/**
 * 高卒世代を大学プールに入学させる（具体的な大学チームに配属）
 * @param {Array|Object} players - 大学進学する選手の配列、またはランク別オブジェクト { S: [...], A: [...], ... }
 * @param {number} enrollYear - 入学年度
 */
export function enrollInUniversity(players, enrollYear) {
  if (!universityPool[enrollYear]) {
    universityPool[enrollYear] = [];
  }

  const teamCounts = {};
  const assignTeam = (rank) => {
    const teams = UNIVERSITY_TEAMS.filter(t => t.rank === rank);
    if (teams.length === 0) return null;
    let minCount = Infinity;
    let candidates = [];
    teams.forEach(t => {
      const count = teamCounts[t.id] || 0;
      if (count < minCount) {
        minCount = count;
        candidates = [t];
      } else if (count === minCount) {
        candidates.push(t);
      }
    });
    const team = candidates[Math.floor(Math.random() * candidates.length)];
    teamCounts[team.id] = (teamCounts[team.id] || 0) + 1;
    return team;
  };

  const addUniHistory = (player, team) => {
    if (!player.careerHistory) player.careerHistory = [];
    if (team?.name) {
      player.careerHistory.push({ type: 'university', year: enrollYear, label: team.name });
    }
  };

  if (Array.isArray(players)) {
    players.forEach(player => {
      const rank = player._destinationRank || 'C';
      const team = assignTeam(rank);
      addUniHistory(player, team);
      player.age = Math.max(player.age || 18, 19);
      universityPool[enrollYear].push({
        player, enrollYear, graduateYear: enrollYear + 4,
        universityRank: rank,
        universityTeamId: team?.id || null,
        universityTeamName: team?.name || null,
      });
    });
  } else {
    for (const rank of ['S', 'A', 'B', 'C', 'D']) {
      if (!players[rank]) continue;
      players[rank].forEach(player => {
        const team = assignTeam(rank);
        addUniHistory(player, team);
        player.age = Math.max(player.age || 18, 19);
        universityPool[enrollYear].push({
          player, enrollYear, graduateYear: enrollYear + 4,
          universityRank: rank,
          universityTeamId: team?.id || null,
          universityTeamName: team?.name || null,
        });
      });
    }
  }
}

/**
 * ゲーム開始時・セーブロード時に大学プールを初期シードする
 * 過去数年分の高校卒業生を遡って生成し、大学に在籍させる
 * これにより、Year1のドラフトから大学生が指名可能になる
 * @param {number} gameYear - 現在のゲーム年度
 */
export function seedInitialUniversityClasses(gameYear) {
  const existingCount = Object.values(universityPool).reduce((sum, cohort) => sum + (cohort?.length || 0), 0);
  if (existingCount > 0) return;

  const classesNeeded = 4;
  const uniSlots = getUniversitySlotsByRank();
  const totalUniSlots = Object.values(uniSlots).reduce((s, v) => s + v, 0);

  for (let i = 0; i < classesNeeded; i++) {
    const enrollYear = gameYear - classesNeeded + i + 1;
    const yearsInUni = gameYear - enrollYear;
    const count = Math.floor(totalUniSlots * 2.5);
    const idBase = (enrollYear + 10000) * 100000 + 70000;
    const players = [];
    for (let j = 0; j < count; j++) {
      const p = generateHighSchoolPlayer(idBase + j);
      p.age = 19 + yearsInUni;
      players.push(p);
    }

    const scored = players.map(p => ({ player: p, score: evaluatePlayerPotential(p) }));
    scored.sort((a, b) => b.score - a.score);
    const uniPlayers = { S: [], A: [], B: [], C: [], D: [] };
    let cursor = 0;
    for (const rank of ['S', 'A', 'B', 'C', 'D']) {
      const slotCount = uniSlots[rank] || 0;
      const slice = scored.slice(cursor, cursor + slotCount);
      cursor += slotCount;
      slice.forEach(entry => {
        entry.player._destinationRank = rank;
        uniPlayers[rank].push(entry.player);
      });
    }

    enrollInUniversity(uniPlayers, enrollYear);

    const cohort = universityPool[enrollYear];
    if (cohort) {
      // 入学時ブースト: 高校生品質→大学チーム在籍品質への底上げ
      cohort.forEach(entry => {
        applyUniversityEntranceBoost(entry.player, entry.universityRank);
      });
      for (let y = 0; y < yearsInUni; y++) {
        cohort.forEach(entry => {
          applyUniversityGrowth(entry.player, entry.universityRank);
        });
      }
    }
  }
}

/**
 * 大学プールの現在の状態サマリーを取得
 */
export function getUniversityPoolSummary() {
  const summary = {
    totalStudents: 0,
    byYear: {},
    byRank: { S: 0, A: 0, B: 0, C: 0, D: 0, unknown: 0 },
    byTeam: {},
  };
  Object.entries(universityPool).forEach(([year, cohort]) => {
    summary.byYear[year] = {
      count: cohort.length,
      pitchers: cohort.filter(e => e.player.position === 'pitcher').length,
      fielders: cohort.filter(e => e.player.position !== 'pitcher').length
    };
    summary.totalStudents += cohort.length;
    cohort.forEach(entry => {
      const rank = entry.universityRank;
      if (rank && summary.byRank[rank] !== undefined) {
        summary.byRank[rank]++;
      } else {
        summary.byRank.unknown++;
      }
      if (entry.universityTeamName) {
        if (!summary.byTeam[entry.universityTeamName]) {
          summary.byTeam[entry.universityTeamName] = { count: 0, rank: entry.universityRank };
        }
        summary.byTeam[entry.universityTeamName].count++;
      }
    });
  });
  return summary;
}

/**
 * セーブ/ロード用: 大学プール+高校生プールをシリアライズ
 */
export function serializeUniversityPool() {
  return {
    university: JSON.parse(JSON.stringify(universityPool)),
    highSchool: JSON.parse(JSON.stringify(highSchoolPool))
  };
}

/**
 * セーブ/ロード用: シリアライズされたデータから復元
 */
export function deserializeUniversityPool(data) {
  clearUniversityPool();
  clearHighSchoolPool();
  if (!data) return;

  // 後方互換: 旧形式（大学プールのみ）の場合
  if (!data.university && !data.highSchool) {
    Object.entries(data).forEach(([year, cohort]) => {
      universityPool[year] = cohort;
    });
    return;
  }

  if (data.university) {
    Object.entries(data.university).forEach(([year, cohort]) => {
      universityPool[year] = cohort;
    });
  }
  if (data.highSchool) {
    highSchoolPool.players = data.highSchool.players || [];
    highSchoolPool.year = data.highSchool.year || 0;
  }
}
