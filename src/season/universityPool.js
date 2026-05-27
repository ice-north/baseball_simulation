// ============================================================
// 大学野球プールシステム (universityPool.js)
// 高卒世代 → NPB不指名 → ランク別進路振り分け
// 大学4年間 → 卒業後に再びドラフト/入団候補
// ============================================================

import { generateRandomPlayerName } from '../data/playerNames.js';
import { generatePositionFitness, generateRandomArsenal } from './tryoutSystem.js';
import { getUniversityGrowthMultiplier } from '../university/universityTeamsData.js';

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
 * @param {number} count - 生成人数（デフォルト800。実装初期は少なめ）
 * @returns {Array} 生成された高卒選手の配列
 */
export function generateHighSchoolClass(year, count = 800) {
  const players = [];
  const idBase = year * 100000 + 50000;

  for (let i = 0; i < count; i++) {
    players.push(generateHighSchoolPlayer(idBase + i));
  }

  return players;
}

/**
 * 高卒選手を1人生成
 * 能力は低め（高校卒業レベル）、成長力の個人差が大きい
 */
function generateHighSchoolPlayer(id) {
  const name = generateRandomPlayerName();

  // 利き手
  const handRoll = Math.random() * 100;
  let throws, bats;
  if (handRoll < 42) { throws = 'right'; bats = 'right'; }
  else if (handRoll < 70) { throws = 'right'; bats = 'left'; }
  else if (handRoll < 93) { throws = 'left'; bats = 'left'; }
  else if (handRoll < 98) { throws = 'right'; bats = 'switch'; }
  else { throws = 'left'; bats = 'right'; }

  // ポジション
  const fieldPositions = ['catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'];
  let isPitcher = Math.random() < 0.40;
  let position;

  if (throws === 'left') {
    const leftPos = ['pitcher', 'first', 'left', 'center', 'right'];
    position = leftPos[Math.floor(Math.random() * leftPos.length)];
    isPitcher = position === 'pitcher';
  } else {
    position = isPitcher ? 'pitcher' : fieldPositions[Math.floor(Math.random() * fieldPositions.length)];
  }

  // 投球フォーム
  const formRand = Math.random() * 100;
  let pitchingForm;
  if (formRand < 48) pitchingForm = 'overhand';
  else if (formRand < 86) pitchingForm = 'threeQuarter';
  else if (formRand < 96) pitchingForm = 'sidearm';
  else pitchingForm = 'submarine';

  const isSideOrUnder = pitchingForm === 'sidearm' || pitchingForm === 'submarine';
  const controlAdjust = isSideOrUnder ? 10 : 0;

  // 高卒レベルの能力値（低め、伸びしろ重視）
  const r = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  let abilities;
  if (isPitcher) {
    const arm = r(50, 82);
    const velocity = Math.round(95 + Math.pow(arm / 100, 1.2) * 69);
    abilities = {
      meet: r(10, 30), power: r(5, 25), eye: r(15, 40),
      steal: r(10, 30), speed: r(30, 60),
      arm, defense: r(30, 55),
      bodyStamina: r(35, 65), recovery: r(35, 65),
      velocity: Math.max(115, Math.min(155, velocity)),
      control: Math.min(75, r(25, 55) + controlAdjust),
      stamina: r(60, 110)
    };
  } else {
    abilities = {
      meet: r(20, 55), power: r(15, 50), eye: r(20, 50),
      steal: r(15, 50), speed: r(25, 65),
      arm: r(25, 65), defense: r(25, 60),
      bodyStamina: r(35, 70), recovery: r(35, 65),
      velocity: r(110, 138), control: r(20, 45),
      stamina: r(40, 70)
    };
  }

  // 成長力: 高卒は分散が大きい（将来のスター候補が混ざる）
  const u1 = Math.random() || 0.001;
  const u2 = Math.random();
  const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const skewed = normal > 0 ? normal * 0.8 : normal;
  const growthPotential = Math.max(0.4, Math.min(1.5, 0.95 + skewed * 0.25));

  return {
    id,
    name,
    age: 18,
    position,
    batting: {
      meet: abilities.meet, power: abilities.power, eye: abilities.eye,
      bats, steal: abilities.steal, bunt: r(15, 45)
    },
    physical: {
      speed: abilities.speed, arm: abilities.arm, throws,
      bodyStamina: abilities.bodyStamina, recovery: abilities.recovery,
      muscle: r(30, 65), dexterity: r(30, 65)
    },
    fielding: { defense: abilities.defense },
    catching: {
      lead: position === 'catcher' ? r(30, 60) : r(15, 35)
    },
    pitching: {
      velocity: abilities.velocity, control: abilities.control,
      stamina: abilities.stamina, spinRate: r(25, 55),
      form: pitchingForm,
      arsenal: isPitcher ? generateRandomArsenal(0, true) : generateFielderArsenalBasic()
    },
    growthPotential,
    growthModifier: 0,
    positionFitness: generatePositionFitness(position),
    fatigue: 0,
    experience: 0,
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

  return abilityScore + growthBonus + noise;
}

// ============================================================
// ランク別進路振り分け（NPBドラフト後に実行）
// S→A→B→C→D の順に良い選手から各ランクの大学・社会人・独立に配分
// ============================================================

// 各ランクの受け入れ割合（高校生全体に対する比率）
const RANK_DISTRIBUTION = {
  S: { ratio: 0.08, uniRatio: 0.70, corpRatio: 0.20, indRatio: 0.10 },
  A: { ratio: 0.12, uniRatio: 0.65, corpRatio: 0.20, indRatio: 0.15 },
  B: { ratio: 0.15, uniRatio: 0.55, corpRatio: 0.25, indRatio: 0.20 },
  C: { ratio: 0.15, uniRatio: 0.45, corpRatio: 0.30, indRatio: 0.25 },
  D: { ratio: 0.10, uniRatio: 0.35, corpRatio: 0.30, indRatio: 0.35 },
};

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

  // ランクS→Dの順に上位から取っていく
  for (const rank of ['S', 'A', 'B', 'C', 'D']) {
    const cfg = RANK_DISTRIBUTION[rank];
    const slotCount = Math.floor(total * cfg.ratio);
    const slice = scored.slice(cursor, cursor + slotCount);
    cursor += slotCount;

    // 各ランク内で大学/社会人/独立に分配
    const uniCount = Math.floor(slice.length * cfg.uniRatio);
    const corpCount = Math.floor(slice.length * cfg.corpRatio);

    slice.forEach((entry, i) => {
      const p = entry.player;
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

      // 卒業判定: 4年経過 or 年齢22歳以上
      if (yearsInUni >= 4 || player.age >= 22) {
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
 * 大学での1年間の成長を適用
 * キャンプの練習とは異なり、バランス型の緩やかな成長
 * @param {Object} player - 選手オブジェクト
 * @param {string|null} universityRank - 大学ランク（S/A/B/C/D）。高ランクほど成長が速い
 */
function applyUniversityGrowth(player, universityRank = null) {
  const gp = player.growthPotential || 1.0;
  const rankMult = getUniversityGrowthMultiplier(universityRank);
  const isPitcher = player.position === 'pitcher';

  const grow = (current, base, cap = 99) => {
    const amount = Math.round(base * gp * rankMult * (0.7 + Math.random() * 0.6));
    return Math.min(cap, current + amount);
  };

  if (isPitcher) {
    player.pitching.control = grow(player.pitching.control, 3);
    player.pitching.stamina = grow(player.pitching.stamina, 4, 200);
    // 球速は肩力(arm)連動: armを少し成長させ、velocityを再計算
    player.physical.arm = grow(player.physical.arm, 2);
    player.pitching.velocity = Math.max(
      player.pitching.velocity,
      Math.round(95 + Math.pow(player.physical.arm / 100, 1.2) * 69)
    );
    // 変化球も少し成長
    if (player.pitching.arsenal) {
      player.pitching.arsenal.forEach(pitch => {
        if (pitch.type !== 'straight') {
          pitch.level = Math.min(100, pitch.level + Math.floor(Math.random() * 3 * gp));
        }
      });
    }
    player.physical.bodyStamina = grow(player.physical.bodyStamina, 2);
  } else {
    player.batting.meet = grow(player.batting.meet, 3);
    player.batting.power = grow(player.batting.power, 2);
    player.batting.eye = grow(player.batting.eye, 2);
    player.physical.speed = grow(player.physical.speed, 1);
    player.fielding.defense = grow(player.fielding.defense, 2);
    player.physical.arm = grow(player.physical.arm, 1);
    player.physical.bodyStamina = grow(player.physical.bodyStamina, 2);
  }

  // フィジカル共通
  player.physical.muscle = grow(player.physical.muscle || 40, 2);
  player.physical.dexterity = grow(player.physical.dexterity || 40, 2);
  player.physical.recovery = grow(player.physical.recovery || 40, 1);
}

// ============================================================
// 入学・卒業の統合処理
// ============================================================

/**
 * 高卒世代を大学プールに入学させる
 * @param {Array|Object} players - 大学進学する選手の配列、またはランク別オブジェクト { S: [...], A: [...], ... }
 * @param {number} enrollYear - 入学年度
 */
export function enrollInUniversity(players, enrollYear) {
  if (!universityPool[enrollYear]) {
    universityPool[enrollYear] = [];
  }

  // ランク別オブジェクトの場合はフラットに展開
  let playerList;
  if (Array.isArray(players)) {
    playerList = players;
  } else {
    playerList = [];
    for (const rank of ['S', 'A', 'B', 'C', 'D']) {
      if (players[rank]) playerList.push(...players[rank]);
    }
  }

  playerList.forEach(player => {
    universityPool[enrollYear].push({
      player,
      enrollYear,
      graduateYear: enrollYear + 4,
      universityRank: player._destinationRank || null
    });
  });
}

/**
 * 大学プールの現在の状態サマリーを取得
 */
export function getUniversityPoolSummary() {
  const summary = { totalStudents: 0, byYear: {}, byRank: { S: 0, A: 0, B: 0, C: 0, D: 0, unknown: 0 } };
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
