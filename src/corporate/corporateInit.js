// ============================================================
// 社会人野球 初期化システム
// チーム選択後の選手生成・スタッフ生成・ゲーム開始処理
// ============================================================
//
// ドラフト指名バランス設計:
//   NPBドラフト全体 ~120名/年、うち社会人出身 ~15%(18名)
//   全300チーム(S:10 A:23 B:32 C:53 D:182)から18-20名前後
//   総選手数 ~6,700名、うちプロ注目 ~457名(6.8%)
//
//   2段階構造:
//   ① プロ注目（スカウトが視察）= スター枠 or 確率覚醒
//   ② ドラフト指名級（実際にNPBが獲る）= スターの中で更にエリート
//
//   期待値:
//     S 10×4.5星 ×20%エリート = ~9名  (注目率12.7%)
//     A 23×2.5星 ×12%         = ~7名  (注目率7.7%)
//     B 32×0.5星 ×6%          = ~1名  (注目率1.9%)
//     C 53チーム  確率覚醒10%   = ~1-2名 (注目率10.0%)
//     D 182チーム 確率覚醒6%   = ~0-1名 (注目率6.0%)
//     合計 ≒ 18-20名
// ============================================================

import { generateTryoutCandidates, selectPlayerForAI, generateScoutComment } from '../season/tryoutSystem.js';
import { generateStaff, STAFF_GRADE_CAP } from './staffData.js';
import { getTeamsByRegion, REGIONS, getAllTeamsEffective } from './corporateTeamsData.js';
import { initializeWorld, WORLD_DATA } from './worldData.js';
import { TEAMS_DATA, clearReleasedPlayersPool, initializeAllPitchingRotations } from '../teams-data.js';
import { INDEPENDENT_LEAGUES, ALL_INDEPENDENT_LEAGUE_IDS } from './independentLeagueData.js';
import { generateFullSeasonSchedule } from '../season/scheduleGenerator.js';
import { initializeStandings } from '../season/seasonManager.js';
import { initializeUniversityLeagues } from '../university/universityLeagueManager.js';
import { UNIVERSITY_TEAMS } from '../university/universityTeamsData.js';
import { seedInitialUniversityClasses } from '../season/universityPool.js';

// ============================================================
// ランク別チーム構成
// 独立リーグ ≒ A～Cの範囲
// ============================================================

const RANK_CONFIG = {
  S: {
    teamOffset: 12,        // 社会人強豪は独立リーグより大幅に上
    starCount: [4, 5],     // プロ注目選手（スカウトが視察するレベル）
    starBoost: [12, 18],   // 注目選手の能力追加（確実に頭一つ抜ける）
    starGrowth: 0.10,
    eliteChance: 0.22,     // 注目選手のうち22%が真のドラフト候補
    eliteBoost: [10, 15],  // エリートへの追加ブースト
    eliteGrowth: 0.15,
  },
  A: {
    teamOffset: 7,
    starCount: [2, 3],
    starBoost: [10, 16],
    starGrowth: 0.08,
    eliteChance: 0.12,
    eliteBoost: [10, 15],
    eliteGrowth: 0.13,
  },
  B: {
    teamOffset: 4,         // 独立リーグ平均より上
    starCount: [0, 1],
    starBoost: [8, 14],
    starGrowth: 0.06,
    eliteChance: 0.06,
    eliteBoost: [10, 15],
    eliteGrowth: 0.10,
    standoutCount: [1, 2],   // Sランク級の突出選手
    standoutTargetRank: 'S',
  },
  C: {
    teamOffset: 1,
    starCount: [0, 0],
    proChance: 0.10,       // 25人×10% ≈ 2.5人/チーム がプロ注目レベルに
    proBoost: [10, 16],
    proGrowth: 0.08,
    standoutCount: [1, 2],   // Aランク級の突出選手
    standoutTargetRank: 'A',
  },
  D: {
    teamOffset: -3,
    starCount: [0, 0],
    proChance: 0.06,       // 20人×6% ≈ 1.2人/チーム（クラブチームからプロ輩出もある）
    proBoost: [8, 14],
    proGrowth: 0.06,
    standoutCount: [1, 2],   // Bランク級の突出選手
    standoutTargetRank: 'B',
  },
};

// 独立リーグ専用設定（社会人より二段下の能力帯）
// 現実: 独立→NPBは年5-10名、最高でドラフト2位（10年に1人）、大半は育成〜5位
// 初期能力を大幅に抑え、シーズン中のfame蓄積＋成長でドラフト下位候補に浮上する設計
const INDEPENDENT_RANK_CONFIG = {
  B: {
    teamOffset: -1,
    starCount: [0, 1],
    starBoost: [5, 10],
    starGrowth: 0.04,
    eliteChance: 0.05,
    eliteBoost: [5, 8],
    eliteGrowth: 0.05,
  },
  C: {
    teamOffset: -4,
    starCount: [0, 0],
    starBoost: [4, 8],
    starGrowth: 0.03,
    eliteChance: 0.02,
    eliteBoost: [4, 7],
    eliteGrowth: 0.04,
    proChance: 0.05,
    proBoost: [5, 10],
    proGrowth: 0.04,
  },
  D: {
    teamOffset: -7,
    starCount: [0, 0],
    proChance: 0.03,
    proBoost: [4, 8],
    proGrowth: 0.03,
  },
};

const RANK_STAFF_CONFIG = {
  S: { coach: 4, manager: 2, trainer: 2 },
  A: { coach: 3, manager: 2, trainer: 1 },
  B: { coach: 3, manager: 1, trainer: 1 },
  C: { coach: 2, manager: 1, trainer: 1 },
  D: { coach: 2, manager: 1, trainer: 0 },
};

export const BUDGET_BY_RANK = { S: 25000, A: 22000, B: 19000, C: 16000, D: 13000 };

// ランク×種別ごとのロースターサイズ [min, max]
const ROSTER_SIZE = {
  S: { corporate: [33, 38], club: [28, 33] },
  A: { corporate: [30, 35], club: [25, 30] },
  B: { corporate: [25, 30], club: [22, 27] },
  C: { corporate: [22, 27], club: [19, 23] },
  D: { corporate: [16, 20], club: [13, 17] },
};

// ランク別球速キャップ・最低保証・追加減速（corporateモード用）
// floorは「チームで一番遅い投手」の下限、capは「スター以外の上限」
// D: クラブチーム → 105-133km（技巧派〜本格派まで幅広い）
// C: 育成型 → 112-138km
// B: 中堅 → 120-145km
// A: 強豪 → 125-150km（自然に150km出せる選手も）
// S: 超強豪 → 128-152km（プロ予備軍レベル）
const RANK_VELOCITY_CAP = { S: 152, A: 150, B: 145, C: 138, D: 133 };
const RANK_VELOCITY_FLOOR = { S: 128, A: 125, B: 120, C: 112, D: 105 };
const RANK_VELOCITY_REDUCTION = { S: 0, A: -3, B: -5, C: -8, D: -15 };

// ランク別の投手制球追加補正（teamOffsetだけでは不十分なので投手専用補正）
const RANK_CONTROL_OFFSET = { S: 8, A: 5, B: 0, C: -5, D: -15 };

// ランク別の制球キャップ（社会人野球はプロ未満）
// 通常選手の上限。スター/プロ注目は+8まで許容
const RANK_CONTROL_CAP = { S: 78, A: 72, B: 65, C: 55, D: 45 };

// ランク別の変化球レベル倍率（Dランクはアマチュアレベル）
const RANK_ARSENAL_MULT = { S: 1.1, A: 1.0, B: 0.85, C: 0.65, D: 0.45 };

// ランク別の打撃能力キャップ（初期生成時）
// 成長してピークでS級ならOKだが、初期生成で85超は非現実的
const RANK_BATTING_CAP = { S: 72, A: 66, B: 60, C: 52, D: 45 };

// ランク別の初期注目度（0-100）
// 注目度が高い → スカウト成功率UP、企業資金UP、優秀な選手が集まる
const RANK_INITIAL_REPUTATION = { S: 85, A: 65, B: 40, C: 20, D: 5 };

let corporatePlayerIdBase = 20000;

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

// チーム全体のベース補正
// プロ注目/エリートのブースト（投手・野手で異なる）
const applyBoost = (player, boostRange, growthBonus) => {
  const isPitcher = player.position === 'pitcher';
  const boost = randInt(boostRange[0], boostRange[1]);

  if (isPitcher) {
    player.pitching.velocity = clamp(player.pitching.velocity + randInt(3, 7), 100, 155);
    player.pitching.control = clamp(player.pitching.control + boost, 1, 99);
    player.pitching.stamina = clamp(player.pitching.stamina + Math.floor(boost * 0.6), 30, 150);
    player.physical.arm = clamp(player.physical.arm + Math.floor(boost * 0.6), 1, 99);
    if (player.pitching.arsenal) {
      for (const pitch of player.pitching.arsenal) {
        if (pitch.name !== 'ストレート') {
          pitch.level = clamp((pitch.level || 30) + randInt(8, 20), 1, 99);
        }
      }
    }
  } else {
    player.batting.meet = clamp(player.batting.meet + boost, 1, 99);
    player.batting.power = clamp(player.batting.power + Math.floor(boost * 0.85), 1, 99);
    player.batting.eye = clamp(player.batting.eye + Math.floor(boost * 0.8), 1, 99);
    // 走力はブーストしない（生まれ持った身体能力）
    player.fielding.defense = clamp(player.fielding.defense + Math.floor(boost * 0.6), 1, 99);
    player.physical.arm = clamp(player.physical.arm + Math.floor(boost * 0.5), 1, 99);
  }
  // 成長力はブーストしない（生まれ持った素質）
};

const adjustCorporateAge = (player, isIndependent = false) => {
  const roll = Math.random();
  let targetAge;
  if (isIndependent) {
    // 独立リーグ: 若手中心（19-29）
    if (roll < 0.15) targetAge = 19 + Math.floor(Math.random() * 2);      // 19-20 (15%)
    else if (roll < 0.35) targetAge = 21 + Math.floor(Math.random() * 2); // 21-22 (20%)
    else if (roll < 0.60) targetAge = 23 + Math.floor(Math.random() * 2); // 23-24 (25%)
    else if (roll < 0.80) targetAge = 25 + Math.floor(Math.random() * 2); // 25-26 (20%)
    else if (roll < 0.92) targetAge = 27 + Math.floor(Math.random() * 2); // 27-28 (12%)
    else targetAge = 29 + Math.floor(Math.random() * 2);                  // 29-30 (8%)
  } else {
    // 社会人: 幅広い年齢層（22-34）
    if (roll < 0.10) targetAge = 22 + Math.floor(Math.random() * 2);      // 22-23 (10%)
    else if (roll < 0.30) targetAge = 24 + Math.floor(Math.random() * 2); // 24-25 (20%)
    else if (roll < 0.55) targetAge = 26 + Math.floor(Math.random() * 2); // 26-27 (25%)
    else if (roll < 0.75) targetAge = 28 + Math.floor(Math.random() * 2); // 28-29 (20%)
    else if (roll < 0.88) targetAge = 30 + Math.floor(Math.random() * 2); // 30-31 (13%)
    else if (roll < 0.96) targetAge = 32 + Math.floor(Math.random() * 2); // 32-33 (8%)
    else targetAge = 34;                                                    // 34    (4%)
  }
  player.age = Math.max(player.age, targetAge);
};

// 社会人/独立リーグチームの選手を生成（ランク×種別でロースターサイズが変動）
export const generateCorporateRoster = (teamDef, year = 1) => {
  const rank = teamDef.rank || 'C';
  const type = teamDef.type || 'corporate';
  const isIndependent = String(teamDef.id || '').startsWith('il_');
  const cfg = (isIndependent ? INDEPENDENT_RANK_CONFIG[rank] : null) || RANK_CONFIG[rank] || RANK_CONFIG.C;
  const sizeRange = ROSTER_SIZE[rank]?.[type] || ROSTER_SIZE.C.corporate;
  const rosterSize = randInt(sizeRange[0], sizeRange[1]);

  // 候補者数をロースターの1.5倍以上確保
  const candidateTeams = Math.max(2, Math.ceil(rosterSize / 25));
  const candidates = generateTryoutCandidates(year, candidateTeams, true);

  corporatePlayerIdBase += 1000;
  candidates.forEach((p, i) => { p.id = corporatePlayerIdBase + i; });

  // 独立リーグは球速・制球・変化球すべて社会人より低い
  const IL_VEL_CAP = { B: 140, C: 133, D: 126 };
  const IL_VEL_FLOOR = { B: 115, C: 108, D: 100 };
  const IL_VEL_REDUCTION = { B: -8, C: -12, D: -20 };
  const IL_CONTROL_OFFSET = { B: -5, C: -10, D: -20 };
  const IL_CONTROL_CAP = { B: 58, C: 48, D: 38 };
  const IL_ARSENAL_MULT = { B: 0.70, C: 0.55, D: 0.35 };

  const velReduction = (isIndependent ? IL_VEL_REDUCTION[rank] : null) ?? (RANK_VELOCITY_REDUCTION[rank] || 0);
  const velCap = (isIndependent ? IL_VEL_CAP[rank] : null) ?? (RANK_VELOCITY_CAP[rank] || 155);
  const velFloor = (isIndependent ? IL_VEL_FLOOR[rank] : null) ?? (RANK_VELOCITY_FLOOR[rank] || 120);
  const controlOffset = (isIndependent ? IL_CONTROL_OFFSET[rank] : null) ?? (RANK_CONTROL_OFFSET[rank] || 0);
  const controlCap = (isIndependent ? IL_CONTROL_CAP[rank] : null) ?? (RANK_CONTROL_CAP[rank] || 65);
  const arsenalMult = (isIndependent ? IL_ARSENAL_MULT[rank] : null) ?? (RANK_ARSENAL_MULT[rank] || 1.0);

  // ランク別能力スケーリング（乗算式）
  // キャップ付近に集中しないよう、スケール係数はキャップの60-70%あたりを中央に設定
  // S: 中央45前後(cap72), A: 中央42(cap66), B: 中央37(cap60), C: 中央32(cap52), D: 中央27(cap45)
  const RANK_SCALE = { S: 0.95, A: 0.88, B: 0.80, C: 0.70, D: 0.58 };
  const INDEPENDENT_RANK_SCALE = { B: 0.63, C: 0.53, D: 0.42 };
  const scale = (isIndependent ? INDEPENDENT_RANK_SCALE[rank] : null) || RANK_SCALE[rank] || 0.70;

  // 三角分布ジッター（2つのrandIntの合算で中央寄り正規分布に近似）
  const scaleAndJitter = (val, jitter = 5) => {
    const j = randInt(-jitter, jitter) + randInt(-jitter, jitter);
    return clamp(Math.round(val * scale) + j, 1, 99);
  };

  candidates.forEach(p => {
    p.batting.meet = scaleAndJitter(p.batting.meet, 6);
    p.batting.power = scaleAndJitter(p.batting.power, 6);
    p.batting.eye = scaleAndJitter(p.batting.eye, 5);
    p.batting.steal = scaleAndJitter(p.batting.steal, 5);
    // 走力・体力・回復はランクに依存しない（生まれ持った身体能力）
    p.physical.speed = clamp(p.physical.speed + randInt(-8, 8) + randInt(-5, 5), 1, 99);
    p.physical.arm = scaleAndJitter(p.physical.arm, 5);
    p.fielding.defense = scaleAndJitter(p.fielding.defense, 5);
    p.physical.bodyStamina = clamp((p.physical.bodyStamina || 50) + randInt(-8, 8) + randInt(-5, 5), 15, 99);
    p.physical.recovery = clamp((p.physical.recovery || 50) + randInt(-8, 8) + randInt(-5, 5), 15, 99);

    adjustCorporateAge(p, isIndependent);

    if (p.position === 'pitcher') {
      // 球速: ランク補正 + 個人差（三角分布 -12〜+12）
      const velJitter = randInt(-6, 6) + randInt(-6, 6);
      const rawVel = p.pitching.velocity + velReduction + velJitter;
      // ソフトキャップ: キャップ超過分を50-80%カットして自然な分布に
      if (rawVel > velCap) {
        const velExcess = rawVel - velCap;
        p.pitching.velocity = clamp(velCap + Math.round(velExcess * (0.2 + Math.random() * 0.3)), velFloor, velCap + 3);
      } else {
        p.pitching.velocity = clamp(rawVel, velFloor, velCap);
      }
      // 制球: ランク補正 + 個人差（三角分布 -10〜+10）
      const ctrlJitter = randInt(-5, 5) + randInt(-5, 5);
      const rawCtrl = p.pitching.control + controlOffset + ctrlJitter;
      if (rawCtrl > controlCap) {
        const ctrlExcess = rawCtrl - controlCap;
        p.pitching.control = clamp(controlCap + Math.round(ctrlExcess * (0.2 + Math.random() * 0.3)), 1, controlCap + 3);
      } else {
        p.pitching.control = clamp(rawCtrl, 1, controlCap);
      }
      // 変化球: ランク倍率 + 個人差
      if (p.pitching.arsenal) {
        for (const pitch of p.pitching.arsenal) {
          if (pitch.name !== 'ストレート' && pitch.type !== 'straight') {
            const arsenalJitter = randInt(-10, 10);
            pitch.level = clamp(Math.round(pitch.level * arsenalMult) + arsenalJitter, 5, 99);
          }
        }
      }
    } else {
      p.pitching.velocity = clamp(p.pitching.velocity + velReduction, 100, velCap);
    }

    // 10%: 一芸特化選手（ひとつの分野だけ突出）
    if (Math.random() < 0.10) {
      if (p.position === 'pitcher') {
        const roll = Math.random();
        if (roll < 0.35) {
          p.pitching.velocity = clamp(p.pitching.velocity + randInt(5, 10), velFloor, velCap + 5);
        } else if (roll < 0.70) {
          p.pitching.control = clamp(p.pitching.control + randInt(8, 15), 1, controlCap + 5);
        } else {
          if (p.pitching.arsenal) {
            for (const pitch of p.pitching.arsenal) {
              if (pitch.name !== 'ストレート' && pitch.type !== 'straight') {
                pitch.level = clamp(pitch.level + randInt(10, 20), 5, 99);
              }
            }
          }
        }
      } else {
        const roll = Math.random();
        const boost = randInt(5, 12);
        if (roll < 0.25) {
          p.batting.meet = clamp(p.batting.meet + boost, 1, 99);
        } else if (roll < 0.50) {
          p.batting.power = clamp(p.batting.power + boost, 1, 99);
        } else if (roll < 0.75) {
          p.physical.speed = clamp(p.physical.speed + boost, 1, 99);
        } else {
          p.fielding.defense = clamp(p.fielding.defense + boost, 1, 99);
        }
      }
    }
  });

  // 野手にも投球フォームを保証
  const FORMS = ['overhand', 'threeQuarter', 'sidearm', 'submarine'];
  const FORM_WEIGHTS = [45, 40, 10, 5];
  const pickForm = () => {
    const r = Math.random() * 100;
    let cum = 0;
    for (let i = 0; i < FORMS.length; i++) { cum += FORM_WEIGHTS[i]; if (r < cum) return FORMS[i]; }
    return 'overhand';
  };
  candidates.forEach(p => {
    if (!p.pitching.form) p.pitching.form = pickForm();
  });

  const roster = [];
  const remaining = [...candidates];
  const maxPitchers = Math.max(6, Math.min(15, Math.round(rosterSize * 0.4)));

  // 必須ポジションを先に確保: 捕手2、内野手4(二遊間各1)、外野手3
  const requiredPositions = [
    'catcher', 'catcher', 'second', 'short', 'first', 'third', 'left', 'center', 'right'
  ];
  for (const reqPos of requiredPositions) {
    if (roster.length >= rosterSize) break;
    const posPool = remaining.filter(p => p.position === reqPos);
    if (posPool.length > 0) {
      posPool.sort((a, b) => (b.batting.meet + b.batting.power + b.fielding.defense) - (a.batting.meet + a.batting.power + a.fielding.defense));
      const pick = posPool[0];
      const idx = remaining.findIndex(c => c.id === pick.id);
      if (idx >= 0) remaining.splice(idx, 1);
      roster.push(pick);
    } else {
      // 候補にいない場合、最も近いポジションの選手を転向
      const fielders = remaining.filter(p => p.position !== 'pitcher');
      if (fielders.length > 0) {
        const pick = fielders[Math.floor(Math.random() * fielders.length)];
        pick.position = reqPos;
        if (pick.positionFitness) pick.positionFitness[reqPos] = Math.max(pick.positionFitness[reqPos] || 0, 40);
        const idx = remaining.findIndex(c => c.id === pick.id);
        if (idx >= 0) remaining.splice(idx, 1);
        roster.push(pick);
      }
    }
  }

  for (let i = roster.length; i < rosterSize && remaining.length > 0; i++) {
    const pitcherCount = roster.filter(p => p.position === 'pitcher').length;
    let pool = remaining;
    if (pitcherCount >= maxPitchers) {
      pool = remaining.filter(p => p.position !== 'pitcher');
      if (pool.length === 0) pool = remaining;
    }
    const pick = selectPlayerForAI(pool, roster);
    if (!pick) break;
    const idx = remaining.findIndex(c => c.id === pick.id);
    if (idx >= 0) remaining.splice(idx, 1);
    roster.push(pick);
  }

  // S/A/Bランク: スター選手を選出してブースト
  const starCount = randInt(cfg.starCount[0], cfg.starCount[1]);
  if (starCount > 0) {
    const pitchers = roster.filter(p => p.position === 'pitcher');
    const fielders = roster.filter(p => p.position !== 'pitcher');
    const starPitcherCount = Math.min(pitchers.length, Math.max(1, Math.floor(starCount * 0.4)));
    const starFielderCount = starCount - starPitcherCount;

    pitchers.sort((a, b) => (b.pitching.velocity + b.pitching.control) - (a.pitching.velocity + a.pitching.control));
    fielders.sort((a, b) => (b.batting.meet + b.batting.power) - (a.batting.meet + a.batting.power));

    const stars = [];
    for (let i = 0; i < starPitcherCount && i < pitchers.length; i++) {
      applyBoost(pitchers[i], cfg.starBoost, cfg.starGrowth);
      stars.push(pitchers[i]);
    }
    for (let i = 0; i < starFielderCount && i < fielders.length; i++) {
      applyBoost(fielders[i], cfg.starBoost, cfg.starGrowth);
      stars.push(fielders[i]);
    }

    // スターの中からエリート（真のドラフト候補）を抽選
    if (cfg.eliteChance) {
      for (const star of stars) {
        if (Math.random() < cfg.eliteChance) {
          applyBoost(star, cfg.eliteBoost, cfg.eliteGrowth);
        }
      }
    }
  }

  // C/Dランク: 低確率でプロ注目レベルが出現
  if (cfg.proChance && cfg.proBoost) {
    for (const p of roster) {
      if (Math.random() < cfg.proChance) {
        applyBoost(p, cfg.proBoost, cfg.proGrowth || 0.06);
      }
    }
  }

  // B/C/Dランク: 1-2名の突出選手（2ランク上の実力で生成）
  if (cfg.standoutCount && cfg.standoutTargetRank) {
    const targetRank = cfg.standoutTargetRank;
    const targetScale = RANK_SCALE[targetRank] || 0.80;
    const rescale = targetScale / scale;
    const tgtVelCap = RANK_VELOCITY_CAP[targetRank] || 145;
    const tgtCtrlCap = RANK_CONTROL_CAP[targetRank] || 65;
    const tgtArsenalMult = RANK_ARSENAL_MULT[targetRank] || 1.0;
    const count = randInt(cfg.standoutCount[0], cfg.standoutCount[1]);
    const shuffled = [...roster].sort(() => Math.random() - 0.5);
    const standouts = shuffled.slice(0, count);

    for (const p of standouts) {
      p._standoutRank = targetRank;
      p.batting.meet = clamp(Math.round(p.batting.meet * rescale) + randInt(0, 3), 1, 99);
      p.batting.power = clamp(Math.round(p.batting.power * rescale) + randInt(0, 3), 1, 99);
      p.batting.eye = clamp(Math.round(p.batting.eye * rescale) + randInt(0, 2), 1, 99);
      p.physical.speed = clamp(Math.round(p.physical.speed * rescale) + randInt(0, 2), 1, 99);
      p.fielding.defense = clamp(Math.round(p.fielding.defense * rescale) + randInt(0, 2), 1, 99);
      p.physical.arm = clamp(Math.round(p.physical.arm * rescale) + randInt(0, 2), 1, 99);
      if (p.position === 'pitcher') {
        const velBoost = tgtVelCap - velCap;
        p.pitching.velocity = clamp(p.pitching.velocity + velBoost + randInt(-2, 3), velFloor, tgtVelCap + 3);
        p.pitching.control = clamp(Math.round(p.pitching.control * rescale) + randInt(0, 3), 1, tgtCtrlCap + 5);
        if (p.pitching.arsenal) {
          const multBoost = tgtArsenalMult / arsenalMult;
          for (const pitch of p.pitching.arsenal) {
            if (pitch.name !== 'ストレート' && pitch.type !== 'straight') {
              pitch.level = clamp(Math.round(pitch.level * multBoost) + randInt(2, 8), 5, 99);
            }
          }
        }
      }
      p.growthPotential = clamp((p.growthPotential || 1.0) + 0.10, 0.5, 1.5);
      p.fame = clamp((p.fame || 0) + randInt(5, 15), 0, 100);
    }
  }

  // ソフトキャップ: キャップを超過した分を確率的に削減（上限に張り付かない自然な分布）
  const ctrlMax = controlCap + 8;
  const IL_BATTING_CAP = { B: 52, C: 44, D: 36 };
  const batCap = (isIndependent ? IL_BATTING_CAP[rank] : null) ?? (RANK_BATTING_CAP[rank] || 52);
  const softCap = (val, cap) => {
    if (val <= cap) return val;
    const excess = val - cap;
    const cut = Math.round(excess * (0.5 + Math.random() * 0.3));
    return cap + Math.max(0, excess - cut);
  };
  roster.forEach(p => {
    const pCtrlMax = p._standoutRank ? (RANK_CONTROL_CAP[p._standoutRank] + 8) : ctrlMax;
    const pBatCap = p._standoutRank ? (RANK_BATTING_CAP[p._standoutRank] || batCap) : batCap;
    if (p.position === 'pitcher') {
      p.pitching.control = Math.min(p.pitching.control, pCtrlMax);
    }
    p.batting.meet = softCap(p.batting.meet, pBatCap);
    p.batting.power = softCap(p.batting.power, pBatCap);
    p.batting.eye = softCap(p.batting.eye, pBatCap);
    const batFloor = p.position === 'pitcher' ? 10 : 15;
    p.batting.meet = Math.max(p.batting.meet, batFloor);
    p.batting.power = Math.max(p.batting.power, batFloor);
    p.batting.eye = Math.max(p.batting.eye, batFloor);

    // 独立リーグ: 成長力を抑制（プロに届かなかった選手が大半）
    if (isIndependent) {
      const gpCap = rank === 'B' ? 1.15 : rank === 'C' ? 1.05 : 0.95;
      p.growthPotential = Math.min(p.growthPotential || 1.0, gpCap);
    }

    p.scoutComment = generateScoutComment(p);
    if (!p.careerHistory) p.careerHistory = [];
    if (p.careerHistory.length === 0) {
      p.careerHistory.push({ type: 'highschool', label: '高校卒' });
    }
    p.careerHistory.push({ type: 'corporate', label: teamDef.name || teamDef.displayName });
  });

  // 二刀流選手の保証（1-2人）
  const twoWayCount = roster.filter(p => p.isTwoWay).length;
  if (twoWayCount < 1) {
    const targetCount = Math.random() < 0.5 ? 1 : 2;
    const young = roster
      .filter(p => p.position !== 'pitcher' && p.age <= 25 && !p.isTwoWay)
      .sort((a, b) => (b.physical.arm + b.physical.speed) - (a.physical.arm + a.physical.speed));
    for (let i = 0; i < targetCount && i < young.length; i++) {
      const p = young[i];
      p.isTwoWay = true;
      p.twoWaySubPosition = p.position;
      // 投球能力を付与（野手ベースの二刀流）
      p.pitching.velocity = clamp(p.pitching.velocity + randInt(5, 15), 120, velCap);
      p.pitching.control = clamp(p.pitching.control + randInt(5, 15), 20, controlCap);
      p.pitching.stamina = clamp(p.pitching.stamina + randInt(10, 30), 50, 120);
      if (!p.pitching.arsenal || p.pitching.arsenal.length < 2) {
        const BREAKING_BALLS = ['スライダー', 'カーブ', 'チェンジアップ', 'フォーク', 'カットボール'];
        const ball1 = BREAKING_BALLS[Math.floor(Math.random() * BREAKING_BALLS.length)];
        let ball2 = BREAKING_BALLS[Math.floor(Math.random() * BREAKING_BALLS.length)];
        while (ball2 === ball1) ball2 = BREAKING_BALLS[Math.floor(Math.random() * BREAKING_BALLS.length)];
        p.pitching.arsenal = [
          { name: 'ストレート', type: 'straight', level: 50 },
          { name: ball1, type: 'breaking', level: randInt(25, 50) },
          { name: ball2, type: 'breaking', level: randInt(20, 40) },
        ];
      }
      if (p.positionFitness) {
        p.positionFitness.pitcher = randInt(30, 60);
      }
    }
  }

  return roster;
};

export const generateInitialStaff = (rank) => {
  const config = RANK_STAFF_CONFIG[rank] || RANK_STAFF_CONFIG.C;
  const maxGrade = STAFF_GRADE_CAP[rank] || 'C';
  const staff = [];
  for (const [role, count] of Object.entries(config)) {
    for (let i = 0; i < count; i++) {
      staff.push(generateStaff(role, null, maxGrade));
    }
  }
  return staff;
};

// 同地区＋近隣地区からリーグ参加チームを選出

const makeAbbreviation = (name) => {
  if (name.length <= 3) return name;
  if (/^[A-Za-z]/.test(name)) return name.slice(0, 3).toUpperCase();
  return name.slice(0, 3);
};

// ============================================================
// 独立リーグチームの初期化（全4リーグ、ユーザーリーグは除外可）
// ============================================================

export const initializeIndependentLeagues = (excludeLeagueId = null, existingTeamNames = []) => {
  const existingSet = new Set(existingTeamNames);

  for (const leagueId of ALL_INDEPENDENT_LEAGUE_IDS) {
    if (leagueId === excludeLeagueId) continue;

    const leagueDef = INDEPENDENT_LEAGUES[leagueId];
    const teamNames = [];

    for (const teamDef of leagueDef.teams) {
      if (TEAMS_DATA[teamDef.name] || existingSet.has(teamDef.name)) continue;

      const roster = generateCorporateRoster(teamDef, 1);
      TEAMS_DATA[teamDef.name] = {
        name: teamDef.name,
        abbreviation: teamDef.abbreviation || makeAbbreviation(teamDef.name),
        players: roster,
        pitchingRotation: null,
        independentLeagueId: leagueId,
      };
      teamNames.push(teamDef.name);
    }

    const schedule = generateFullSeasonSchedule({
      teams: teamNames,
      gamesPerSeason: leagueDef.gamesPerSeason,
      startDate: { year: 2024, month: 4, day: 1 },
      endDate: { year: 2024, month: 9, day: 30 },
      leagueFormat: leagueDef.leagueFormat || 'single',
      leagueNames: leagueDef.leagueNames,
    });

    WORLD_DATA.independentLeagues[leagueId] = {
      name: leagueDef.name,
      teams: teamNames,
      schedule,
      standings: initializeStandings(teamNames),
      results: [],
    };
  }
};

// ============================================================
// 地域リーグ生成（社会人モードのレギュラーシーズン）
// ユーザーの地域から8-12チームを選出してリーグ戦を組む
// ============================================================

const NEIGHBOR_REGIONS = {
  hokkaido: ['tohoku'],
  tohoku: ['hokkaido', 'kitakanto'],
  kitakanto: ['tohoku', 'minamikanto', 'tokyo'],
  minamikanto: ['kitakanto', 'tokyo', 'kanagawa'],
  tokyo: ['kitakanto', 'minamikanto', 'kanagawa'],
  kanagawa: ['tokyo', 'minamikanto', 'hokushinetsu'],
  hokushinetsu: ['kanagawa', 'kitakanto', 'tokai'],
  tokai: ['hokushinetsu', 'kinki'],
  kinki: ['tokai', 'chugoku'],
  chugoku: ['kinki', 'shikoku', 'kyushu'],
  shikoku: ['chugoku', 'kyushu', 'kinki'],
  kyushu: ['chugoku', 'shikoku'],
};

const RANK_ORDER = { S: 0, A: 1, B: 2, C: 3, D: 4 };
const TARGET_LEAGUE_SIZE = 10;
const GAMES_PER_SEASON = 30;

export const generateRegionalLeague = (userTeamName, userRegion, allTeamDefs) => {
  // 同地域のチームを取得（ランク順）
  const regionTeams = allTeamDefs
    .filter(d => d.region === userRegion)
    .map(d => d.displayName || d.name)
    .filter(name => TEAMS_DATA[name]);

  // ユーザーチームを含むリーグメンバーを構築
  let leagueTeams = [...regionTeams];

  // 地域のチーム数が多すぎる場合: ユーザー＋上位チームを選出
  if (leagueTeams.length > TARGET_LEAGUE_SIZE + 2) {
    const userIncluded = leagueTeams.includes(userTeamName);
    const sorted = leagueTeams
      .filter(name => name !== userTeamName)
      .sort((a, b) => {
        const ra = RANK_ORDER[TEAMS_DATA[a]?.corporateData?.rank] ?? 4;
        const rb = RANK_ORDER[TEAMS_DATA[b]?.corporateData?.rank] ?? 4;
        return ra - rb;
      });
    leagueTeams = userIncluded ? [userTeamName, ...sorted.slice(0, TARGET_LEAGUE_SIZE - 1)] : sorted.slice(0, TARGET_LEAGUE_SIZE);
  }

  // 地域のチーム数が少なすぎる場合: 近隣地域から補充
  if (leagueTeams.length < 6) {
    const neighbors = NEIGHBOR_REGIONS[userRegion] || [];
    for (const nRegion of neighbors) {
      if (leagueTeams.length >= 8) break;
      const nTeams = allTeamDefs
        .filter(d => d.region === nRegion)
        .map(d => d.displayName || d.name)
        .filter(name => TEAMS_DATA[name] && !leagueTeams.includes(name))
        .sort((a, b) => {
          const ra = RANK_ORDER[TEAMS_DATA[a]?.corporateData?.rank] ?? 4;
          const rb = RANK_ORDER[TEAMS_DATA[b]?.corporateData?.rank] ?? 4;
          return ra - rb;
        });
      const needed = Math.min(nTeams.length, 8 - leagueTeams.length);
      leagueTeams.push(...nTeams.slice(0, needed));
    }
  }

  // スケジュール生成
  const schedule = generateFullSeasonSchedule({
    teams: leagueTeams,
    gamesPerSeason: GAMES_PER_SEASON,
    startDate: { year: 2024, month: 4, day: 1 },
    endDate: { year: 2024, month: 9, day: 30 },
    leagueFormat: 'single',
  });

  return {
    leagueTeams,
    schedule,
    gamesPerSeason: GAMES_PER_SEASON,
  };
};

// ============================================================
// 社会人モードの完全初期化（全チーム＋独立リーグのロスターを生成）
// ============================================================

export const initializeCorporateGame = (teamDef) => {
  corporatePlayerIdBase = 20000;

  initializeWorld('corporate', 'corporate');
  Object.keys(TEAMS_DATA).forEach(key => delete TEAMS_DATA[key]);
  clearReleasedPlayersPool();

  // 社会人179チーム生成
  const allTeamDefs = getAllTeamsEffective();
  const userTeamName = teamDef.displayName || teamDef.name;
  const userRegion = teamDef.region;
  const allTeamNames = [];
  let userRoster = null;
  let userStaff = null;

  const createTeamEntry = (def) => {
    const name = def.displayName || def.name;
    const roster = generateCorporateRoster(def, 1);
    const staff = generateInitialStaff(def.rank);
    TEAMS_DATA[name] = {
      name,
      abbreviation: makeAbbreviation(name),
      players: roster,
      pitchingRotation: null,
      corporateTeamId: def.id,
      corporateData: {
        rank: def.rank, region: def.region, city: def.city, type: def.type,
        budget: BUDGET_BY_RANK[def.rank] || 12000,
        staff,
        reputation: RANK_INITIAL_REPUTATION[def.rank] || 5,
        proDraftCount: 0, tournamentWins: 0, yearlyBudgetBonus: 0,
        tournamentBudgetBonus: 0, sponsors: [],
      },
    };
    allTeamNames.push(name);
    return { roster, staff };
  };

  // ユーザーチームを最初に追加（Object.keys(TEAMS_DATA)[0]で取得されるため）
  const userDef = allTeamDefs.find(d => (d.displayName || d.name) === userTeamName);
  if (userDef) {
    const { roster, staff } = createTeamEntry(userDef);
    userRoster = roster;
    userStaff = staff;
  }

  for (const def of allTeamDefs) {
    const name = def.displayName || def.name;
    if (TEAMS_DATA[name]) continue;
    createTeamEntry(def);
  }

  WORLD_DATA.corporateLeague.userTeam = userTeamName;
  WORLD_DATA.corporateLeague.teams = {};
  for (const name of allTeamNames) {
    WORLD_DATA.corporateLeague.teams[name] = TEAMS_DATA[name];
  }

  // 独立リーグ4つも生成
  initializeIndependentLeagues(null, allTeamNames);

  // 全チームの投手ローテーション初期化
  initializeAllPitchingRotations();

  // 大学リーグ初期化
  initializeUniversityLeagues(2024);
  // 大学プール初期シード（Year1から大学生がドラフト候補に出るように）
  seedInitialUniversityClasses(1);

  return {
    userTeamName, allTeamNames, roster: userRoster, staff: userStaff,
  };
};

// ============================================================
// 独立リーグモードの平行世界初期化
// ユーザーが独立リーグで遊ぶ時に、社会人+他の独立リーグを生成
// ============================================================

export const initializeParallelWorldForIndependent = (userLeagueId, userTeamNames) => {
  initializeWorld('independent', userLeagueId);
  corporatePlayerIdBase = 20000;

  // 社会人チーム全179チーム生成
  const allCorpDefs = getAllTeamsEffective();
  const corpTeamNames = [];
  for (const def of allCorpDefs) {
    const name = def.displayName || def.name;
    if (TEAMS_DATA[name]) continue;

    const roster = generateCorporateRoster(def, 1);
    const staff = generateInitialStaff(def.rank);
    TEAMS_DATA[name] = {
      name,
      abbreviation: makeAbbreviation(name),
      players: roster,
      pitchingRotation: null,
      corporateTeamId: def.id,
      corporateData: {
        rank: def.rank, region: def.region, city: def.city, type: def.type,
        budget: BUDGET_BY_RANK[def.rank] || 12000,
        staff,
        reputation: RANK_INITIAL_REPUTATION[def.rank] || 5,
        proDraftCount: 0, tournamentWins: 0, yearlyBudgetBonus: 0,
        tournamentBudgetBonus: 0, sponsors: [],
      },
    };
    corpTeamNames.push(name);
  }
  WORLD_DATA.corporateLeague.teams = {};
  for (const name of corpTeamNames) {
    WORLD_DATA.corporateLeague.teams[name] = TEAMS_DATA[name];
  }

  // ユーザーのリーグ以外の独立リーグを生成
  initializeIndependentLeagues(userLeagueId, [...userTeamNames, ...corpTeamNames]);

  // 大学リーグ初期化
  initializeUniversityLeagues(2024);
  // 大学プール初期シード（Year1から大学生がドラフト候補に出るように）
  seedInitialUniversityClasses(1);
};

// ============================================================
// 社会人＋独立リーグの並行世界生成（大学モード等から呼ばれる）
// ============================================================

export const initializeCorporateParallelWorld = (existingTeamNames = []) => {
  corporatePlayerIdBase = 20000;
  const allCorpDefs = getAllTeamsEffective();
  const corpTeamNames = [];
  for (const def of allCorpDefs) {
    const name = def.displayName || def.name;
    if (TEAMS_DATA[name]) continue;
    const roster = generateCorporateRoster(def, 1);
    const staff = generateInitialStaff(def.rank);
    TEAMS_DATA[name] = {
      name,
      abbreviation: makeAbbreviation(name),
      players: roster,
      pitchingRotation: null,
      corporateTeamId: def.id,
      corporateData: {
        rank: def.rank, region: def.region, city: def.city, type: def.type,
        budget: BUDGET_BY_RANK[def.rank] || 12000,
        staff,
        reputation: RANK_INITIAL_REPUTATION[def.rank] || 5,
        proDraftCount: 0, tournamentWins: 0, yearlyBudgetBonus: 0,
        tournamentBudgetBonus: 0, sponsors: [],
      },
    };
    corpTeamNames.push(name);
  }
  WORLD_DATA.corporateLeague.teams = {};
  for (const name of corpTeamNames) {
    WORLD_DATA.corporateLeague.teams[name] = TEAMS_DATA[name];
  }
  initializeIndependentLeagues(null, [...existingTeamNames, ...corpTeamNames]);
};

// ============================================================
// 注目度システム
// 勝つ → 注目度UP → 資金UP → 良いスタッフ → 良い選手 → 勝つ
// ============================================================

// 注目度の変動要因
const REPUTATION_GAINS = {
  win: 0.3,                // 地域リーグ1勝ごと
  highWinRate: 3,          // 勝率.600以上ボーナス
  dominantSeason: 5,       // 勝率.700以上ボーナス（highWinRateに加算）
  seasonChampion: 10,      // 地域リーグ優勝
  mainTournamentEntry: 6,  // 都市対抗/日本選手権 本戦出場（予選突破）
  tournamentRoundWin: 2,   // 大会本戦1勝ごと
  tournamentQF: 3,         // ベスト8進出ボーナス
  tournamentSF: 5,         // ベスト4進出ボーナス
  tournamentRunnerUp: 8,   // 大会準優勝
  tournamentWin: 12,       // 大会優勝
  proDrafted: 10,          // プロ選手輩出
};

const REPUTATION_DECAY = 2; // 年間自然減衰（実績なしなら忘れられる）

// 注目度 → 企業の年間追加予算（万円）
export const getReputationBudgetBonus = (reputation) => {
  if (reputation >= 80) return 3000;
  if (reputation >= 60) return 2000;
  if (reputation >= 40) return 1000;
  if (reputation >= 20) return 500;
  return 0;
};

// マネージング能力 → 予算ボーナス（万円）: 0→0万、50→1000万、100→2000万
export const getManagingBudgetBonus = (managingValue) =>
  Math.round((managingValue || 0) * 20);

// 大会成績 → 予算ボーナス（万円）
// 都市対抗/日本選手権の成績が翌年の企業からの追加支援に反映
const TOURNAMENT_BUDGET_BONUS = {
  champion: 2000,    // 優勝
  runnerUp: 1000,    // 準優勝
  semiFinal: 500,    // ベスト4
  entry: 300,        // 本戦出場
};

export const getTournamentBudgetBonus = (cd) => cd?.tournamentBudgetBonus || 0;

// スポンサー契約 → 年間収入（万円）
// 注目度と実績に応じてスポンサーが付く
export const SPONSOR_TIERS = {
  platinum: { label: 'プラチナ', income: 3000, minReputation: 80, color: 'text-purple-400' },
  gold:     { label: 'ゴールド', income: 1500, minReputation: 60, color: 'text-yellow-400' },
  silver:   { label: 'シルバー', income: 800,  minReputation: 40, color: 'text-gray-300' },
  bronze:   { label: 'ブロンズ', income: 400,  minReputation: 20, color: 'text-orange-600' },
};

const SPONSOR_NAMES = {
  platinum: [
    '大和重工業', '東洋自動車', '帝都銀行', '日本製鉄グループ', '太平洋電力',
    '三菱化学工業', 'セントラル保険', '富士通信工業', '国際航空',
  ],
  gold: [
    '東海建設', 'サクラ食品', 'マルナカ不動産', '北斗電機', '東京精密',
    'オーシャン運輸', '日光化成', 'トップバリュー', '朝日ソフトウェア',
  ],
  silver: [
    '地元タクシー', '町田製パン', 'さくら薬局', 'みどり信用金庫', '富士見印刷',
    '中央スポーツ用品', 'やまと弁当', '武蔵野測量', '星野接骨院',
  ],
  bronze: [
    '駅前商店会', '田中鮮魚店', '山下理容室', '佐藤工務店', '鈴木自動車整備',
    '町内会有志', '地元ラーメン店', '中田酒店', '渡辺畳店',
  ],
};

export const getSponsorIncome = (cd) => {
  if (!cd?.sponsors || cd.sponsors.length === 0) return 0;
  return cd.sponsors.reduce((sum, s) => sum + (SPONSOR_TIERS[s.tier]?.income || 0), 0);
};

// スポンサー候補を生成（シーズン終了時に呼ばれる）
export const generateSponsorOffers = (cd) => {
  if (!cd) return [];
  const rep = cd.reputation || 0;
  const offers = [];

  // 各ティアについて、注目度に応じた確率でオファーが来る
  for (const [tier, info] of Object.entries(SPONSOR_TIERS)) {
    if (rep < info.minReputation) continue;
    const overRep = rep - info.minReputation;
    const chance = Math.min(0.8, 0.3 + overRep * 0.015);
    if (Math.random() < chance) {
      const names = SPONSOR_NAMES[tier];
      const existing = new Set((cd.sponsors || []).map(s => s.name));
      const available = names.filter(n => !existing.has(n));
      if (available.length > 0) {
        const name = available[Math.floor(Math.random() * available.length)];
        offers.push({ tier, name, income: info.income, duration: 1 + Math.floor(Math.random() * 3) });
      }
    }
  }
  return offers;
};

// スポンサー契約を適用（年始に呼ばれる）
export const advanceSponsors = (cd) => {
  if (!cd?.sponsors) return;
  cd.sponsors = cd.sponsors.filter(s => {
    s.remainingYears = (s.remainingYears || 1) - 1;
    return s.remainingYears > 0;
  });
};

// スポンサー契約を追加
export const acceptSponsor = (cd, offer) => {
  if (!cd) return;
  if (!cd.sponsors) cd.sponsors = [];
  cd.sponsors.push({
    tier: offer.tier,
    name: offer.name,
    income: offer.income,
    remainingYears: offer.duration,
  });
};

// 注目度 → スカウト成功率補正（1.0基準）
export const getReputationScoutBonus = (reputation) => {
  return 0.6 + (reputation / 100) * 0.8; // 0→0.6倍、50→1.0倍、100→1.4倍
};

// 注目度 → 入団希望選手の質補正
export const getReputationRecruitBonus = (reputation) => {
  return Math.floor(reputation / 10) - 2; // 0→-2、50→3、100→8
};

// シーズン終了時の注目度更新
export const updateReputation = (teamData, seasonResults) => {
  const cd = teamData.corporateData;
  if (!cd) return;

  let gain = 0;
  // 地域リーグ成績
  gain += (seasonResults.wins || 0) * REPUTATION_GAINS.win;
  if (seasonResults.winRate >= 0.700) gain += REPUTATION_GAINS.dominantSeason;
  if (seasonResults.winRate >= 0.600) gain += REPUTATION_GAINS.highWinRate;
  if (seasonResults.isChampion) gain += REPUTATION_GAINS.seasonChampion;
  // 大会成績
  const entries = seasonResults.mainTournamentEntries || 0;
  gain += entries * REPUTATION_GAINS.mainTournamentEntry;
  const tWins = seasonResults.tournamentMainWins || 0;
  gain += tWins * REPUTATION_GAINS.tournamentRoundWin;
  if (tWins >= 3) gain += REPUTATION_GAINS.tournamentQF;
  if (tWins >= 4) gain += REPUTATION_GAINS.tournamentSF;
  if (seasonResults.tournamentChampion) gain += REPUTATION_GAINS.tournamentWin;
  else if (seasonResults.tournamentRunnerUp) gain += REPUTATION_GAINS.tournamentRunnerUp;
  // プロ輩出
  if (seasonResults.proDraftedCount) gain += seasonResults.proDraftedCount * REPUTATION_GAINS.proDrafted;

  cd.reputation = clamp(cd.reputation + gain - REPUTATION_DECAY, 0, 100);
  cd.yearlyBudgetBonus = getReputationBudgetBonus(cd.reputation);
  cd.proDraftCount += seasonResults.proDraftedCount || 0;
  cd.tournamentWins += seasonResults.tournamentChampion ? 1 : 0;

  // 大会成績 → 予算ボーナス（最も良い成績を基準に計算）
  let tBonus = 0;
  if (seasonResults.tournamentChampion) {
    tBonus = TOURNAMENT_BUDGET_BONUS.champion;
  } else if (seasonResults.tournamentRunnerUp) {
    tBonus = TOURNAMENT_BUDGET_BONUS.runnerUp;
  } else if ((seasonResults.tournamentMainWins || 0) >= 2) {
    tBonus = TOURNAMENT_BUDGET_BONUS.semiFinal;
  } else if ((seasonResults.mainTournamentEntries || 0) > 0) {
    tBonus = TOURNAMENT_BUDGET_BONUS.entry;
  }
  cd.tournamentBudgetBonus = tBonus;
};

// 注目度からランクを再判定（昇格/降格）
// 昇格閾値は初期値より少し低め（努力で到達可能に）、降格閾値はさらに低め（ヒステリシス）
const RANK_PROMOTE_THRESHOLD = { S: 75, A: 55, B: 32, C: 15 };
const RANK_DEMOTE_THRESHOLD  = { S: 60, A: 40, B: 22, C: 8 };

export const updateRankFromReputation = (teamData) => {
  const cd = teamData.corporateData;
  if (!cd) return null;

  const rep = cd.reputation;
  const oldRank = cd.rank;
  let newRank = oldRank;

  if (rep >= RANK_PROMOTE_THRESHOLD.S) newRank = 'S';
  else if (rep >= RANK_PROMOTE_THRESHOLD.A) newRank = 'A';
  else if (rep >= RANK_PROMOTE_THRESHOLD.B) newRank = 'B';
  else if (rep >= RANK_PROMOTE_THRESHOLD.C) newRank = 'C';
  else newRank = 'D';

  // ヒステリシス: 降格は低い閾値を下回った場合のみ
  const rankOrder = ['D', 'C', 'B', 'A', 'S'];
  const oldIdx = rankOrder.indexOf(oldRank);
  const newIdx = rankOrder.indexOf(newRank);
  if (newIdx < oldIdx) {
    const demoteThreshold = oldRank === 'S' ? RANK_DEMOTE_THRESHOLD.S
      : oldRank === 'A' ? RANK_DEMOTE_THRESHOLD.A
      : oldRank === 'B' ? RANK_DEMOTE_THRESHOLD.B
      : RANK_DEMOTE_THRESHOLD.C;
    if (rep >= demoteThreshold) {
      newRank = oldRank;
    }
  }

  if (newRank !== oldRank) {
    cd.rank = newRank;
    return { team: teamData.name, from: oldRank, to: newRank, reputation: rep };
  }
  return null;
};

// トーナメントブラケットからチームごとの勝利数を集計
const countBracketWins = (bracket) => {
  const wins = {};
  if (!bracket?.rounds) return wins;
  for (const round of bracket.rounds) {
    for (const match of round) {
      if (match.winner && !match.isBye) {
        wins[match.winner] = (wins[match.winner] || 0) + 1;
      }
    }
  }
  return wins;
};

// 全チームの注目度とランクを一括更新
export const updateAllTeamReputations = (seasonData) => {
  const standings = seasonData.standings || [];
  const standingsMap = {};
  standings.forEach(s => { standingsMap[s.team] = s; });

  const champion = standings.length > 0
    ? [...standings].sort((a, b) => b.winRate - a.winRate || b.wins - a.wins)[0]?.team
    : null;

  // 大会結果を集計
  const mainTournamentWinsMap = {};
  const toshitaikouEntries = new Set();
  const senshukenEntries = new Set();
  const td = seasonData.toshitaikou;
  // 都市対抗: 予選突破チームを収集
  if (td?.qualifiers) {
    for (const regionId of Object.keys(td.qualifiers)) {
      const q = td.qualifiers[regionId];
      if (q.qualifiedTeams) q.qualifiedTeams.forEach(t => toshitaikouEntries.add(t));
    }
  }
  // 都市対抗本戦の勝利数
  if (td?.mainTournament) {
    const mtWins = countBracketWins(td.mainTournament);
    for (const [team, w] of Object.entries(mtWins)) {
      mainTournamentWinsMap[team] = (mainTournamentWinsMap[team] || 0) + w;
    }
  }
  // 日本選手権
  const ns = seasonData.nihonSenshuken;
  if (ns?.mainTournament?.bracket) {
    if (ns.mainTournament.bracket.rounds?.[0]) {
      for (const match of ns.mainTournament.bracket.rounds[0]) {
        if (match.team1) senshukenEntries.add(match.team1);
        if (match.team2) senshukenEntries.add(match.team2);
      }
    }
    const nsWins = countBracketWins(ns.mainTournament.bracket);
    for (const [team, w] of Object.entries(nsWins)) {
      mainTournamentWinsMap[team] = (mainTournamentWinsMap[team] || 0) + w;
    }
  } else if (ns?.qualifiers) {
    for (const q of Object.values(ns.qualifiers)) {
      if (q.qualifiedTeams) q.qualifiedTeams.forEach(t => senshukenEntries.add(t));
    }
  }

  const toshitaikouChampion = td?.mainTournament?.champion || td?.champion || null;
  const toshitaikouFinal = td?.mainTournament?.bracket?.rounds?.slice(-1)[0] || [];
  const toshitaikouRunnerUp = toshitaikouFinal.length > 0 ? (toshitaikouFinal[0]?.loser || null) : null;
  const senshukenChampion = ns?.mainTournament?.champion || ns?.champion || null;
  const senshukenFinal = ns?.mainTournament?.bracket?.rounds?.slice(-1)[0] || [];
  const senshukenRunnerUp = senshukenFinal.length > 0 ? (senshukenFinal[0]?.loser || null) : null;

  const rankChanges = [];

  for (const teamName of Object.keys(TEAMS_DATA)) {
    const teamData = TEAMS_DATA[teamName];
    if (!teamData?.corporateData) continue;

    const s = standingsMap[teamName];
    let entryCount = 0;
    if (toshitaikouEntries.has(teamName)) entryCount++;
    if (senshukenEntries.has(teamName)) entryCount++;

    const seasonResults = {
      wins: s?.wins || 0,
      winRate: s?.winRate || 0,
      isChampion: teamName === champion,
      mainTournamentEntries: entryCount,
      tournamentMainWins: mainTournamentWinsMap[teamName] || 0,
      tournamentChampion: teamName === toshitaikouChampion || teamName === senshukenChampion,
      tournamentRunnerUp: teamName === toshitaikouRunnerUp || teamName === senshukenRunnerUp,
      proDraftedCount: 0,
    };

    updateReputation(teamData, seasonResults);
    const change = updateRankFromReputation(teamData);
    if (change) rankChanges.push(change);
  }

  return rankChanges;
};

// ============================================================
// 大学・独立リーグ向けランク変動システム
// ============================================================

const UNI_REPUTATION_GAINS = {
  win: 0.3,
  highWinRate: 3,
  dominantSeason: 5,
  seasonChampion: 8,
  tournamentEntry: 5,
  tournamentRoundWin: 2,
  tournamentSF: 4,
  tournamentRunnerUp: 7,
  tournamentWin: 10,
  proDrafted: 12,
};
const UNI_REPUTATION_DECAY = 2;

export const updateUniversityReputation = (teamData, seasonResults) => {
  const ud = teamData.universityData;
  if (!ud) return;
  let gain = 0;
  gain += (seasonResults.wins || 0) * UNI_REPUTATION_GAINS.win;
  if (seasonResults.winRate >= 0.700) gain += UNI_REPUTATION_GAINS.dominantSeason;
  if (seasonResults.winRate >= 0.600) gain += UNI_REPUTATION_GAINS.highWinRate;
  if (seasonResults.isChampion) gain += UNI_REPUTATION_GAINS.seasonChampion;
  const tWins = seasonResults.tournamentMainWins || 0;
  if (tWins > 0) gain += UNI_REPUTATION_GAINS.tournamentEntry;
  gain += tWins * UNI_REPUTATION_GAINS.tournamentRoundWin;
  if (tWins >= 2) gain += UNI_REPUTATION_GAINS.tournamentSF;
  if (seasonResults.tournamentChampion) gain += UNI_REPUTATION_GAINS.tournamentWin;
  else if (seasonResults.tournamentRunnerUp) gain += UNI_REPUTATION_GAINS.tournamentRunnerUp;
  if (seasonResults.proDraftedCount) gain += seasonResults.proDraftedCount * UNI_REPUTATION_GAINS.proDrafted;
  ud.reputation = clamp(ud.reputation + gain - UNI_REPUTATION_DECAY, 0, 100);
  ud.proDraftCount = (ud.proDraftCount || 0) + (seasonResults.proDraftedCount || 0);
  ud.tournamentWins = (ud.tournamentWins || 0) + (seasonResults.tournamentChampion ? 1 : 0);
};

export const updateUniversityRankFromReputation = (teamData) => {
  const ud = teamData.universityData;
  if (!ud) return null;
  const rep = ud.reputation;
  const oldRank = ud.rank;
  let newRank;
  if (rep >= RANK_PROMOTE_THRESHOLD.S) newRank = 'S';
  else if (rep >= RANK_PROMOTE_THRESHOLD.A) newRank = 'A';
  else if (rep >= RANK_PROMOTE_THRESHOLD.B) newRank = 'B';
  else if (rep >= RANK_PROMOTE_THRESHOLD.C) newRank = 'C';
  else newRank = 'D';
  const rankOrder = ['D', 'C', 'B', 'A', 'S'];
  const oldIdx = rankOrder.indexOf(oldRank);
  const newIdx = rankOrder.indexOf(newRank);
  if (newIdx < oldIdx) {
    const dt = oldRank === 'S' ? RANK_DEMOTE_THRESHOLD.S
      : oldRank === 'A' ? RANK_DEMOTE_THRESHOLD.A
      : oldRank === 'B' ? RANK_DEMOTE_THRESHOLD.B
      : RANK_DEMOTE_THRESHOLD.C;
    if (rep >= dt) newRank = oldRank;
  }
  if (newRank !== oldRank) {
    ud.rank = newRank;
    return { team: teamData.name, from: oldRank, to: newRank, reputation: rep, type: 'university' };
  }
  return null;
};

// 全チーム（社会人＋独立＋大学）のランク変動を一括処理
export const updateAllRanks = (seasonData) => {
  const rankChanges = [];

  // 社会人・独立リーグ（corporateData持ち）
  const corpChanges = updateAllTeamReputations(seasonData);
  rankChanges.push(...corpChanges);

  // 大学チーム（universityData持ち、TEAMS_DATA内）
  const standings = seasonData.standings || [];
  const standingsMap = {};
  standings.forEach(s => { standingsMap[s.team] = s; });
  const uniChampion = standings.length > 0
    ? [...standings].sort((a, b) => b.winRate - a.winRate || b.wins - a.wins)[0]?.team
    : null;

  // 大学トーナメント結果
  const ucChampion = seasonData.universityChampionship?.champion || null;
  const ucRunnerUp = seasonData.universityChampionship?.runnerUp || null;
  const mjChampion = seasonData.meijiJingu?.champion || null;
  const mjRunnerUp = seasonData.meijiJingu?.runnerUp || null;
  const ucWins = seasonData.universityChampionship?.bracket ? countBracketWins(seasonData.universityChampionship.bracket) : {};
  const mjWins = seasonData.meijiJingu?.bracket ? countBracketWins(seasonData.meijiJingu.bracket) : {};

  for (const teamName of Object.keys(TEAMS_DATA)) {
    const teamData = TEAMS_DATA[teamName];
    if (!teamData?.universityData) continue;
    const s = standingsMap[teamName];
    const tWins = (ucWins[teamName] || 0) + (mjWins[teamName] || 0);
    const results = {
      wins: s?.wins || 0,
      winRate: s?.winRate || 0,
      isChampion: teamName === uniChampion,
      tournamentMainWins: tWins,
      tournamentChampion: teamName === ucChampion || teamName === mjChampion,
      tournamentRunnerUp: teamName === ucRunnerUp || teamName === mjRunnerUp,
      proDraftedCount: 0,
    };
    updateUniversityReputation(teamData, results);
    const change = updateUniversityRankFromReputation(teamData);
    if (change) rankChanges.push(change);
  }

  // WORLD_DATA内の他リーグ大学チームも簡易更新
  const uniLeagues = WORLD_DATA.universityLeagues;
  if (uniLeagues) {
    for (const [regionId, league] of Object.entries(uniLeagues)) {
      for (const seasonKey of ['spring', 'fall']) {
        const sd = league[seasonKey];
        if (!sd?.done) continue;
        const allStandings = league.divisions
          ? [...(sd.standings1 || []), ...(sd.standings2 || [])]
          : (sd.standings || []);
        if (allStandings.length === 0) continue;
        const leagueChamp = [...allStandings].sort((a, b) => b.winRate - a.winRate || b.wins - a.wins)[0]?.team;
        for (const st of allStandings) {
          const teamDef = UNIVERSITY_TEAMS.find(t => t.name === st.team);
          if (!teamDef) continue;
          let rep = { S: 85, A: 65, B: 40, C: 20, D: 5 }[teamDef.rank] || 20;
          rep += (st.wins || 0) * 0.3;
          if (st.winRate >= 0.700) rep += 5;
          if (st.winRate >= 0.600) rep += 3;
          if (st.team === leagueChamp) rep += 8;
          const tW = (ucWins[st.team] || 0) + (mjWins[st.team] || 0);
          if (tW > 0) rep += 5 + tW * 2;
          if (st.team === ucChampion || st.team === mjChampion) rep += 10;
          rep = clamp(rep - UNI_REPUTATION_DECAY, 0, 100);
          let newRank = teamDef.rank;
          if (rep >= RANK_PROMOTE_THRESHOLD.S) newRank = 'S';
          else if (rep >= RANK_PROMOTE_THRESHOLD.A) newRank = 'A';
          else if (rep >= RANK_PROMOTE_THRESHOLD.B) newRank = 'B';
          else if (rep >= RANK_PROMOTE_THRESHOLD.C) newRank = 'C';
          else newRank = 'D';
          const rankOrder = ['D', 'C', 'B', 'A', 'S'];
          if (rankOrder.indexOf(newRank) < rankOrder.indexOf(teamDef.rank)) {
            const dt2 = teamDef.rank === 'S' ? RANK_DEMOTE_THRESHOLD.S
              : teamDef.rank === 'A' ? RANK_DEMOTE_THRESHOLD.A
              : teamDef.rank === 'B' ? RANK_DEMOTE_THRESHOLD.B
              : RANK_DEMOTE_THRESHOLD.C;
            if (rep >= dt2) newRank = teamDef.rank;
          }
          if (newRank !== teamDef.rank) {
            rankChanges.push({ team: st.team, from: teamDef.rank, to: newRank, reputation: rep, type: 'university' });
            teamDef.rank = newRank;
          }
        }
      }
    }
  }

  return rankChanges;
};

// 赤字ペナルティを適用（年度移行時に呼ばれる）
export const applyBudgetDeficitPenalty = (teamData) => {
  const cd = teamData?.corporateData;
  if (!cd || !cd.budgetDeficit || cd.budgetDeficit <= 0) return null;

  const deficit = cd.budgetDeficit;
  const totalBudget = cd.budget || 13000;
  const deficitRate = Math.min(1, deficit / totalBudget);
  const penalties = [];

  // 1. 注目度低下（赤字額/1000 * 3、最大-15）
  const repPenalty = Math.min(15, Math.round((deficit / 1000) * 3));
  if (repPenalty > 0) {
    cd.reputation = Math.max(0, (cd.reputation || 0) - repPenalty);
    penalties.push({ type: 'reputation', value: -repPenalty });
  }

  // 2. スポンサー離脱リスク（赤字率 × 60%の確率で各スポンサーが離脱）
  if (cd.sponsors && cd.sponsors.length > 0) {
    const lostSponsors = [];
    cd.sponsors = cd.sponsors.filter(s => {
      const leaveChance = deficitRate * 0.6;
      if (Math.random() < leaveChance) {
        lostSponsors.push(s.name);
        return false;
      }
      return true;
    });
    if (lostSponsors.length > 0) {
      penalties.push({ type: 'sponsor_loss', names: lostSponsors });
    }
  }

  // 3. 選手のコンディション低下（練習環境悪化）
  const conditionPenalty = Math.min(15, Math.round(deficitRate * 15));
  if (conditionPenalty > 0 && teamData.players) {
    for (const p of teamData.players) {
      p.fatigue = Math.min(100, (p.fatigue || 0) + conditionPenalty);
    }
    penalties.push({ type: 'fatigue', value: conditionPenalty });
  }

  // 4. 成長率低下（練習環境・設備投資不足）
  const growthPenalty = Math.min(0.05, deficitRate * 0.04);
  if (growthPenalty > 0 && teamData.players) {
    for (const p of teamData.players) {
      p.growthModifier = (p.growthModifier || 0) - growthPenalty;
    }
    penalties.push({ type: 'growth', value: -growthPenalty });
  }

  // 5. スカウト制限（契約更改時に既に適用済み、レポートに含める）
  const scoutReduction = cd.scoutPenalty || 0;
  if (scoutReduction > 0) {
    penalties.push({ type: 'scout', value: -scoutReduction });
  }

  cd.budgetDeficit = 0;
  cd.scoutPenalty = 0;
  cd.lastDeficitPenalties = penalties;
  return penalties;
};
