// ============================================================
// トライアウトシステム - tryoutSystem.js
// 選手獲得システム（年次トライアウト、ドラフト）
// ============================================================

import { generateRandomPlayerName } from '../data/playerNames.js';

/**
 * 利き手を決定（左投・左打の発生率を強化）
 * - 右投右打: 35%
 * - 右投左打: 28%
 * - 左投左打: 29%
 * - 右投両打: 4%
 * - 左投右打: 4%（レア）
 */
function determineHandedness() {
  const rand = Math.random() * 100;
  if (rand < 35) {
    return { throws: 'right', bats: 'right' };
  } else if (rand < 63) {
    return { throws: 'right', bats: 'left' };
  } else if (rand < 92) {
    return { throws: 'left', bats: 'left' };
  } else if (rand < 96) {
    return { throws: 'right', bats: 'switch' };
  } else {
    return { throws: 'left', bats: 'right' }; // レアな左投右打
  }
}

/**
 * 左投げ選手のポジションを決定
 * 左投げは投手、一塁手、外野手が99%、捕手は1%
 */
function getPositionForLeftHander() {
  const rand = Math.random() * 100;
  if (rand < 40) {
    return 'pitcher';
  } else if (rand < 55) {
    return 'first';
  } else if (rand < 70) {
    return 'left';
  } else if (rand < 85) {
    return 'center';
  } else if (rand < 99) {
    return 'right';
  } else {
    return 'catcher'; // 1%の確率で左投げ捕手
  }
}

/**
 * 特性の数を決定（確率分布）
 * 1つ: 75%, 2つ: 20%, 3つ: 4%, 4つ: 1%
 */
function getTraitCount() {
  const rand = Math.random() * 100;
  if (rand < 75) return 1;
  if (rand < 95) return 2;
  if (rand < 99) return 3;
  return 4;
}

/**
 * 野手用特性リスト
 */
const BATTER_TRAITS = [
  'speedster',      // 俊足タイプ
  'slugger',        // パワータイプ
  'defender',       // 守備タイプ
  'contactHitter',  // 巧打タイプ
  'eyeMaster',      // 選球眼タイプ
  'baserunner',     // 走塁タイプ
  'armStrong',      // 強肩タイプ
];

/**
 * 投手用特性リスト
 */
const PITCHER_TRAITS = [
  'fireballer',     // 速球タイプ
  'controlPitcher', // 制球タイプ
  'ironman',        // スタミナタイプ
  'breakingBall',   // 変化球タイプ
];

/**
 * 複数特性を選出（重複なし）
 * @param {boolean} isPitcher - 投手かどうか
 * @returns {string[]} 選ばれた特性の配列
 */
function getPlayerTraits(isPitcher) {
  const count = getTraitCount();
  const pool = isPitcher ? [...PITCHER_TRAITS] : [...BATTER_TRAITS];
  const traits = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const idx = Math.floor(Math.random() * pool.length);
    traits.push(pool.splice(idx, 1)[0]);
  }
  return traits;
}

/**
 * 一芸に秀でた選手タイプを生成（後方互換）
 */
function getSpecialistType() {
  const types = [
    'speedster', 'slugger', 'defender', 'contactHitter',
    'fireballer', 'controlPitcher', 'ironman',
  ];
  return types[Math.floor(Math.random() * types.length)];
}

/**
 * トライアウト候補者を生成
 * @param {number} year - 年数（0=初回30人/チーム、1以降=15人/チーム）
 * @param {number} teamCount - チーム数
 * @param {boolean} isInitial - 初回トライアウトかどうか
 * @returns {Array} トライアウト候補者の配列
 */
export function generateTryoutCandidates(year, teamCount, isInitial = false) {
  // 初回は30人/チーム、それ以外は15人/チーム
  const candidatesPerTeam = isInitial ? 30 : 15;
  const totalCandidates = teamCount * candidatesPerTeam;
  const candidates = [];

  const fieldPositions = ['catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'];

  for (let i = 1; i <= totalCandidates; i++) {
    // 利き手を決定
    const handedness = determineHandedness();
    const throws = handedness.throws;
    const bats = handedness.bats;

    // 二刀流選手かどうか（5%の確率、右投げのみ）
    const isTwoWay = throws === 'right' && Math.random() < 0.05;

    // 投手と野手を1:1の比率で生成（ただし左投げは制限あり）
    let isPitcher = Math.random() < 0.5;
    let position;

    if (isTwoWay) {
      // 二刀流選手は外野手または一塁手として登録
      position = Math.random() < 0.7 ? fieldPositions[Math.floor(Math.random() * 3) + 5] : 'first'; // 外野 or 一塁
      isPitcher = false;
    } else if (throws === 'left') {
      // 左投げの場合、ポジションを制限
      position = getPositionForLeftHander();
      isPitcher = position === 'pitcher';
    } else {
      // 右投げの場合は自由にポジション決定
      position = isPitcher ? 'pitcher' : fieldPositions[Math.floor(Math.random() * fieldPositions.length)];
    }

    // 特性を持つ選手かどうか（35%の確率、二刀流以外）
    const hasTraits = !isTwoWay && Math.random() < 0.35;
    const playerTraits = hasTraits ? getPlayerTraits(isPitcher) : [];
    // 後方互換用: 最初の特性をspecialistTypeとして使う
    const isSpecialist = playerTraits.length > 0;
    const specialistType = playerTraits[0] || null;

    // 投球フォームを先に決定（能力に影響するため）
    // オーバースロー45%、スリークォーター40%、サイドスロー10%、アンダースロー5%
    const formRand = Math.random() * 100;
    let pitchingForm;
    if (formRand < 45) {
      pitchingForm = 'overhand';
    } else if (formRand < 85) {
      pitchingForm = 'threeQuarter';
    } else if (formRand < 95) {
      pitchingForm = 'sidearm';
    } else {
      pitchingForm = 'submarine';
    }

    // ランダムな名前生成
    const name = generateRandomPlayerName();

    // 年齢を先に決定（18-25歳）
    const age = Math.floor(Math.random() * 8) + 18;

    // 能力値生成（特性選手の場合は特殊な分布、年齢補正あり、二刀流対応）
    const abilities = generateAbilities(isPitcher, position, isSpecialist, specialistType, pitchingForm, age, isTwoWay, playerTraits);

    const player = {
      id: i,
      name: name,
      age: age,
      position: position,
      battingOrder: 0,
      isStarter: false,
      isTwoWay: isTwoWay, // 二刀流フラグ
      batting: {
        meet: abilities.meet,
        power: abilities.power,
        eye: abilities.eye,
        bats: bats,
        steal: abilities.steal
      },
      physical: {
        speed: abilities.speed,
        arm: abilities.arm,
        throws: throws
      },
      fielding: {
        defense: abilities.defense
      },
      catching: {
        lead: position === 'catcher' ? Math.floor(Math.random() * 36) + 35 : Math.floor(Math.random() * 26) + 20
      },
      pitching: {
        velocity: abilities.velocity,
        control: abilities.control,
        stamina: abilities.stamina,
        form: pitchingForm,
        arsenal: (isPitcher || isTwoWay)
          ? generateRandomArsenal(playerTraits.includes('breakingBall') ? 2 : 0)
          : generateFielderArsenal()
      },
      traits: playerTraits, // 選手の特性を保存
      positionFitness: isTwoWay ? generateTwoWayPositionFitness(position) : generatePositionFitness(position),
      professionalCareer: {
        isDrafted: false,
        draftYear: null,
        draftTeam: null,
        achievements: []
      },
      fatigue: 0, // 疲労度（投げた球数分蓄積、1日20回復）
      experience: 0, // 経験値（シーズン中に蓄積、キャンプで消費）
      seasonStats: {
        batting: { games: 0, atBats: 0, hits: 0, doubles: 0, triples: 0, homeruns: 0, rbis: 0, walks: 0, strikeouts: 0, stolenBases: 0 },
        pitching: { games: 0, wins: 0, losses: 0, saves: 0, holds: 0, inningsPitched: 0, runsAllowed: 0, earnedRuns: 0, hits: 0, homeruns: 0, walks: 0, strikeouts: 0, pitches: 0 }
      },
      careerStats: {
        batting: { games: 0, atBats: 0, hits: 0, doubles: 0, triples: 0, homeruns: 0, rbis: 0, walks: 0, strikeouts: 0, stolenBases: 0 },
        pitching: { games: 0, wins: 0, losses: 0, saves: 0, holds: 0, inningsPitched: 0, runsAllowed: 0, earnedRuns: 0, hits: 0, homeruns: 0, walks: 0, strikeouts: 0, pitches: 0 }
      }
    };

    candidates.push(player);
  }

  return candidates;
}

/**
 * リーグ全体の育成評判に基づいてトライアウト候補者を強化
 * プロ輩出実績のあるリーグには良い選手が集まりやすくなる
 * @param {Array} candidates - トライアウト候補者の配列
 * @param {Object} allTeams - TEAMS_DATA
 * @returns {Array} 強化された候補者の配列
 */
export function applyReputationBonus(candidates, allTeams) {
  // リーグ全体の育成評判の平均を計算
  const teams = Object.values(allTeams);
  const totalReputation = teams.reduce((sum, team) => sum + (team.developmentReputation || 0), 0);
  const avgReputation = teams.length > 0 ? totalReputation / teams.length : 0;

  if (avgReputation <= 0) return candidates;

  // 評判に応じて「一芸に秀でた」尖った候補者が出やすくなる
  // 全体的な底上げではなく、1つの能力だけが突出する
  const boostRate = Math.min(0.4, avgReputation / 250); // 最大40%の候補者に一芸ブースト
  const spikeAmount = Math.min(15, Math.floor(avgReputation / 7)); // 最大+15ポイント（1つの能力のみ）

  candidates.forEach(player => {
    if (Math.random() < boostRate) {
      if (player.position === 'pitcher') {
        // 投手: 1つだけ突出させる（他は据え置き）
        const roll = Math.random();
        if (roll < 0.4) {
          // 剛速球タイプ
          player.pitching.velocity = Math.min(158, player.pitching.velocity + Math.ceil(spikeAmount / 2));
        } else if (roll < 0.7) {
          // 精密制球タイプ
          player.pitching.control = Math.min(99, player.pitching.control + spikeAmount);
        } else {
          // 鉄腕タイプ
          player.pitching.stamina = Math.min(200, player.pitching.stamina + spikeAmount * 2);
        }
      } else {
        // 野手: 1つの能力だけ突出させる
        const roll = Math.random();
        if (roll < 0.25) {
          // 巧打タイプ
          player.batting.meet = Math.min(99, player.batting.meet + spikeAmount);
        } else if (roll < 0.5) {
          // 強打タイプ
          player.batting.power = Math.min(99, player.batting.power + spikeAmount);
        } else if (roll < 0.75) {
          // 俊足タイプ
          player.physical.speed = Math.min(99, player.physical.speed + spikeAmount);
          player.batting.steal = Math.min(99, (player.batting.steal || 30) + spikeAmount);
        } else {
          // 守備の名手タイプ
          player.fielding.defense = Math.min(99, player.fielding.defense + spikeAmount);
          player.physical.arm = Math.min(99, (player.physical.arm || 40) + Math.ceil(spikeAmount / 2));
        }
      }
    }
  });

  return candidates;
}

/**
 * 能力値を生成（複数特性対応、フォーム別球速調整、年齢補正、二刀流対応）
 * 特性が複数ある場合、各特性のボーナスを累積適用
 * 年齢補正: 18歳基準で、1歳につき平均+1ポイント
 */
function generateAbilities(isPitcher, position, isSpecialist, specialistType, pitchingForm, age = 20, isTwoWay = false, playerTraits = []) {
  // フォームによる球速・制球の調整
  // サイドスロー・アンダースローは球速-10、制球+15
  const isSideOrUnder = pitchingForm === 'sidearm' || pitchingForm === 'submarine';
  const velocityAdjust = isSideOrUnder ? -10 : 0;
  const controlAdjust = isSideOrUnder ? 15 : 0;

  // 年齢補正: 18歳を基準に、1歳につき+1.5ポイント（19歳=+1.5, 25歳=+10.5）
  const ageBonus = Math.max(0, Math.floor((age - 18) * 1.5));

  // バラつき付きランダム生成（能力値用、10-99制限）
  const randRangeWithVariance = (min, max, bonus = ageBonus) => {
    const variance = Math.floor(Math.random() * 15) - 7; // -7 ~ +7 のランダム変動
    const adjustedMin = Math.max(10, Math.min(min + bonus, max));
    const base = Math.floor(Math.random() * (max - adjustedMin + 1)) + adjustedMin;
    return Math.max(10, Math.min(99, base + variance));
  };

  // 球速用ランダム生成（120-160km/h範囲、正規分布風のバラつき）
  const randVelocity = (min, max, bonus = 0) => {
    // 2つの乱数の平均で中央に寄りやすく（でも例外的な高速投手も出る）
    const r1 = Math.random();
    const r2 = Math.random();
    const normalRand = (r1 + r2) / 2; // 0-1の範囲で中央寄り
    // 10%の確率で例外的な才能（より高い値）
    const exceptional = Math.random() < 0.1 ? Math.floor(Math.random() * 8) + 3 : 0;
    const base = Math.floor(normalRand * (max - min + 1)) + min + bonus + exceptional;
    // バラつきを追加
    const variance = Math.floor(Math.random() * 7) - 3; // -3 ~ +3
    return Math.max(min, Math.min(160, base + variance));
  };

  // スタミナ用ランダム生成（40-150範囲、2/3に調整済み）
  const randStamina = (min, max, bonus = 0) => {
    const base = Math.floor(Math.random() * (max - min + 1)) + min + bonus;
    const variance = Math.floor(Math.random() * 15) - 7; // -7 ~ +7
    return Math.max(40, Math.min(150, base + variance));
  };

  // 二刀流選手の場合は投打両方に能力を持つ
  if (isTwoWay) {
    return {
      // 野手能力（平均的）
      meet: randRangeWithVariance(40, 65),
      power: randRangeWithVariance(32, 57),
      eye: randRangeWithVariance(35, 65),
      steal: randRangeWithVariance(30, 60),
      speed: randRangeWithVariance(40, 70),
      arm: randRangeWithVariance(50, 80),
      defense: randRangeWithVariance(40, 65),
      // 投手能力（平均的だが投げられる、球速-6km、スタミナ2/3調整済み）
      velocity: Math.min(randVelocity(121, 139) + velocityAdjust, 149),
      control: Math.min(randRangeWithVariance(40, 65) + controlAdjust, 80),
      stamina: randStamina(67, 100)
    };
  }

  // 通常の能力値範囲（投手用 or 野手アーキタイプ別）
  let normalAbilities;
  if (isPitcher) {
    normalAbilities = {
      meet: randRangeWithVariance(15, 40),
      power: randRangeWithVariance(5, 29),
      eye: randRangeWithVariance(25, 50),
      steal: randRangeWithVariance(10, 25, Math.max(0, Math.floor(ageBonus * 0.5))),
      speed: randRangeWithVariance(30, 55, Math.max(0, Math.floor(ageBonus * 0.5))),
      arm: randRangeWithVariance(40, 65),
      defense: randRangeWithVariance(40, 65),
      velocity: Math.min(randVelocity(116, 139, ageBonus) + velocityAdjust, 152),
      control: Math.min(randRangeWithVariance(35, 65) + controlAdjust, 85),
      stamina: randStamina(73, 113, ageBonus)
    };
  } else {
    // 野手アーキタイプ: 特性なしの選手にも個性を持たせる
    const archetypes = [
      // 巧打タイプ: ミート高、パワー低
      { meet: [50, 75], power: [12, 37], eye: [45, 75], steal: [25, 55], speed: [30, 60], arm: [25, 55], defense: [30, 60] },
      // 強打タイプ: パワー高、走力低
      { meet: [30, 55], power: [42, 67], eye: [25, 55], steal: [15, 40], speed: [20, 50], arm: [35, 65], defense: [25, 55] },
      // 俊足タイプ: 走力高、パワー低
      { meet: [35, 60], power: [12, 37], eye: [30, 60], steal: [55, 80], speed: [55, 80], arm: [25, 55], defense: [35, 65] },
      // 守備タイプ: 守備高、打撃低
      { meet: [25, 50], power: [12, 37], eye: [30, 55], steal: [25, 55], speed: [35, 65], arm: [50, 75], defense: [55, 80] },
      // バランスタイプ: 平均的
      { meet: [35, 65], power: [22, 52], eye: [30, 65], steal: [25, 60], speed: [30, 65], arm: [30, 65], defense: [30, 65] },
      // 打撃特化タイプ: 打撃全般高、守備走力低
      { meet: [45, 70], power: [37, 62], eye: [40, 70], steal: [15, 40], speed: [20, 45], arm: [25, 50], defense: [20, 45] },
      // 肩力タイプ: 肩力高、ミート低
      { meet: [25, 50], power: [27, 52], eye: [25, 55], steal: [20, 50], speed: [30, 60], arm: [60, 85], defense: [40, 70] },
    ];
    const arch = archetypes[Math.floor(Math.random() * archetypes.length)];
    normalAbilities = {
      meet: randRangeWithVariance(arch.meet[0], arch.meet[1]),
      power: randRangeWithVariance(arch.power[0], arch.power[1]),
      eye: randRangeWithVariance(arch.eye[0], arch.eye[1]),
      steal: randRangeWithVariance(arch.steal[0], arch.steal[1], Math.max(0, Math.floor(ageBonus * 0.7))),
      speed: randRangeWithVariance(arch.speed[0], arch.speed[1], Math.max(0, Math.floor(ageBonus * 0.7))),
      arm: randRangeWithVariance(arch.arm[0], arch.arm[1]),
      defense: randRangeWithVariance(arch.defense[0], arch.defense[1]),
      velocity: randRange(106, 121),
      control: randRange(30, 55),
      stamina: randRange(40, 67)
    };
  }

  if (!isSpecialist || playerTraits.length === 0) {
    return normalAbilities;
  }

  // 複数特性の能力調整（各特性のボーナスを累積適用）
  let abilities = { ...normalAbilities };

  // 特性ごとのボーナス定義
  const traitBonuses = {
    // --- 野手特性 ---
    speedster: {
      speed: () => randRange(85, 99),
      steal: () => randRange(80, 95),
      meet: () => randRange(30, 50),
      power: () => randRange(20, 40),
      defense: () => randRange(60, 80)
    },
    slugger: {
      power: () => randRange(67, 76),
      meet: () => randRange(45, 65),
      speed: () => randRange(25, 45),
      steal: () => randRange(15, 30),
      defense: () => randRange(30, 50),
      arm: () => randRange(40, 60)
    },
    defender: {
      defense: () => randRange(85, 99),
      arm: () => randRange(75, 90),
      meet: () => randRange(35, 55),
      power: () => randRange(25, 45),
      speed: () => randRange(55, 75)
    },
    contactHitter: {
      meet: () => randRange(70, 79),
      eye: () => randRange(75, 90),
      power: () => randRange(25, 45),
      speed: () => randRange(50, 70)
    },
    eyeMaster: {
      eye: () => randRange(80, 95),
      meet: () => randRange(60, 75),
      steal: () => randRange(50, 70)
    },
    baserunner: {
      speed: () => randRange(75, 90),
      steal: () => randRange(80, 99),
      defense: () => randRange(55, 75)
    },
    armStrong: {
      arm: () => randRange(80, 99),
      defense: () => randRange(65, 85),
      power: () => randRange(47, 67)
    },
    // --- 投手特性 ---
    fireballer: {
      velocity: () => Math.min(randVelocity(141, 149) + velocityAdjust, 154),
      control: () => Math.min(randRange(30, 50) + controlAdjust, 65),
      stamina: () => randStamina(60, 87)
    },
    controlPitcher: {
      velocity: () => Math.max(randVelocity(116, 131) + velocityAdjust, 114),
      control: () => Math.min(randRange(75, 90) + controlAdjust, 95),
      stamina: () => randStamina(87, 113)
    },
    ironman: {
      velocity: () => Math.min(randVelocity(121, 136) + velocityAdjust, 144),
      control: () => Math.min(randRange(40, 60) + controlAdjust, 75),
      stamina: () => randStamina(120, 147)
    },
    breakingBall: {
      control: () => Math.min(randRange(55, 75) + controlAdjust, 85),
      velocity: () => Math.max(randVelocity(116, 134) + velocityAdjust, 114),
      stamina: () => randStamina(80, 107)
    }
  };

  // 各特性を順に適用（複数特性は良い方の値を採用）
  playerTraits.forEach(trait => {
    const bonuses = traitBonuses[trait];
    if (!bonuses) return;
    Object.entries(bonuses).forEach(([stat, generator]) => {
      const traitValue = generator();
      // 複数特性がある場合は、より高い値を採用（強化方向で合成）
      if (traitValue > abilities[stat]) {
        abilities[stat] = traitValue;
      }
    });
  });

  return abilities;
}

/**
 * 範囲内のランダム整数を生成
 */
function randRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 野手用の簡易変化球を生成（投手適正なし）
 * 基本的な変化球からランダムに1つ、レベルはF〜Eランク
 */
function generateFielderArsenal() {
  const basicPitches = ['slider', 'curve', 'fork', 'changeup', 'sinker', 'cutter'];
  const selectedType = basicPitches[Math.floor(Math.random() * basicPitches.length)];
  const level = Math.floor(Math.random() * 21) + 20; // 20-40 (F〜Eランク)
  return [
    { id: 1, type: 'straight', level: 100 },
    { id: 2, type: selectedType, level }
  ];
}

/**
 * ランダムな変化球を生成
 * @param {number} extraPitches - 追加球種数（breakingBall特性用）
 */
export const generateRandomArsenal = (extraPitches = 0) => {
  const pitchTypes = ['straight', 'twoSeam', 'slider', 'curve', 'fork', 'changeup',
                      'sinker', 'shoot', 'cutter', 'splitter', 'palm', 'knuckle'];
  const baseSize = Math.floor(Math.random() * 3) + 2; // 2-4種類
  const arsenalSize = Math.min(baseSize + extraPitches, 7); // 最大7種類
  const arsenal = [];
  const usedTypes = new Set();

  // ストレートは必ず含める
  arsenal.push({ id: 1, type: 'straight', level: 100 });
  usedTypes.add('straight');

  for (let i = 2; i <= arsenalSize; i++) {
    const availableTypes = pitchTypes.filter(t => !usedTypes.has(t));
    if (availableTypes.length === 0) break;

    const selectedType = availableTypes[Math.floor(Math.random() * availableTypes.length)];
    // 独立リーグレベル: 変化球レベルを抑える（S/Aランクは稀に）
    const levelMin = (i > baseSize) ? 40 : 25;
    const levelMax = (i > baseSize) ? 80 : 70;
    const level = Math.floor(Math.random() * (levelMax - levelMin + 1)) + levelMin;
    arsenal.push({ id: i, type: selectedType, level });
    usedTypes.add(selectedType);
  }

  return arsenal;
}

/**
 * ポジション適性を生成
 */
export const generatePositionFitness = (mainPosition) => {
  const fitness = {
    pitcher: 30, catcher: 30, first: 30,
    second: 30, third: 30, short: 30,
    left: 30, center: 30, right: 30
  };

  // メインポジションは100
  fitness[mainPosition] = 100;

  // 隣接ポジションに適性を付与
  const positionGroups = {
    pitcher: [],
    catcher: ['first'],
    first: ['catcher', 'third'],
    second: ['short', 'third'],
    third: ['first', 'second', 'short'],
    short: ['second', 'third'],
    left: ['center', 'right'],
    center: ['left', 'right'],
    right: ['left', 'center']
  };

  if (positionGroups[mainPosition]) {
    positionGroups[mainPosition].forEach(adj => {
      fitness[adj] = Math.floor(Math.random() * 30) + 60; // 60-90
    });
  }

  return fitness;
}

/**
 * 二刀流選手のポジション適性を生成
 * 投手と野手の両方に高い適性を持つ
 */
export const generateTwoWayPositionFitness = (mainPosition) => {
  const fitness = {
    pitcher: 80, // 投手としても高い適性
    catcher: 30, first: 30,
    second: 30, third: 30, short: 30,
    left: 30, center: 30, right: 30
  };

  // メインポジションは100
  fitness[mainPosition] = 100;

  // 投手適性を高く設定
  fitness.pitcher = Math.floor(Math.random() * 15) + 75; // 75-90

  // 外野と一塁の適性も高め
  if (mainPosition !== 'first') fitness.first = Math.floor(Math.random() * 20) + 60;
  if (mainPosition !== 'left') fitness.left = Math.floor(Math.random() * 20) + 55;
  if (mainPosition !== 'center') fitness.center = Math.floor(Math.random() * 20) + 55;
  if (mainPosition !== 'right') fitness.right = Math.floor(Math.random() * 20) + 55;

  return fitness;
}

/**
 * 選手の推薦ランクを計算（S/A/B/C/D）
 * @param {Object} player - 選手データ
 * @returns {string} - 'S', 'A', 'B', 'C', 'D'
 */
export function calculatePlayerRank(player) {
  const isPitcher = player.position === 'pitcher';
  let totalScore = 0;

  if (isPitcher) {
    // 投手評価: 球速、制球、スタミナ、変化球
    const velocityScore = (player.pitching.velocity - 130) * 2; // 130km/h基準
    const controlScore = player.pitching.control;
    const staminaScore = player.pitching.stamina / 2;
    const arsenalScore = player.pitching.arsenal.reduce((sum, pitch) => sum + pitch.level, 0) / player.pitching.arsenal.length;

    totalScore = (velocityScore * 0.3) + (controlScore * 0.25) + (staminaScore * 0.25) + (arsenalScore * 0.2);
  } else {
    // 野手評価: ミート、パワー、走力、守備、肩
    const meetScore = player.batting.meet;
    const powerScore = player.batting.power;
    const speedScore = player.physical.speed;
    const defenseScore = player.fielding.defense;
    const armScore = player.physical.arm;

    totalScore = (meetScore * 0.3) + (powerScore * 0.25) + (speedScore * 0.2) + (defenseScore * 0.15) + (armScore * 0.1);
  }

  // ランク判定
  if (totalScore >= 80) return 'S';
  if (totalScore >= 70) return 'A';
  if (totalScore >= 60) return 'B';
  if (totalScore >= 50) return 'C';
  return 'D';
};

/**
 * スネークドラフト順序を生成
 * @param {Array} teams - チーム名の配列（例: ['ユーザー', 'AI1', 'AI2', 'AI3']）
 * @param {number} rounds - ラウンド数
 * @returns {Array} ドラフト順序の配列
 */
export function generateSnakeDraftOrder(teams, rounds) {
  const draftOrder = [];

  for (let round = 0; round < rounds; round++) {
    if (round % 2 === 0) {
      // 偶数ラウンド: 通常順
      teams.forEach(team => draftOrder.push({ round: round + 1, team }));
    } else {
      // 奇数ラウンド: 逆順（スネークドラフト）
      [...teams].reverse().forEach(team => draftOrder.push({ round: round + 1, team }));
    }
  }

  return draftOrder;
};

/**
 * ロスターの能力バランスを分析
 * @param {Array} roster - 現在のロスター（配列形式）
 * @returns {Object} 能力バランス分析結果
 */
export function analyzeRosterBalance(roster) {
  if (!roster || roster.length === 0) {
    return {
      pitchers: { count: 0, avgStamina: 0, avgVelocity: 0, avgControl: 0 },
      fielders: { count: 0, avgOffense: 0, avgDefense: 0, avgSpeed: 0 }
    };
  }

  const pitchers = roster.filter(p => p.position === 'pitcher');
  const fielders = roster.filter(p => p.position !== 'pitcher');

  // 投手分析
  const pitcherAnalysis = {
    count: pitchers.length,
    avgStamina: 0,
    avgVelocity: 0,
    avgControl: 0
  };

  if (pitchers.length > 0) {
    pitcherAnalysis.avgStamina = pitchers.reduce((sum, p) => sum + p.pitching.stamina, 0) / pitchers.length;
    pitcherAnalysis.avgVelocity = pitchers.reduce((sum, p) => sum + p.pitching.velocity, 0) / pitchers.length;
    pitcherAnalysis.avgControl = pitchers.reduce((sum, p) => sum + p.pitching.control, 0) / pitchers.length;
  }

  // 野手分析
  const fielderAnalysis = {
    count: fielders.length,
    avgOffense: 0,  // ミート + パワーの平均
    avgDefense: 0,
    avgSpeed: 0,
    avgPower: 0
  };

  if (fielders.length > 0) {
    fielderAnalysis.avgOffense = fielders.reduce((sum, p) => sum + (p.batting.meet + p.batting.power) / 2, 0) / fielders.length;
    fielderAnalysis.avgDefense = fielders.reduce((sum, p) => sum + p.fielding.defense, 0) / fielders.length;
    fielderAnalysis.avgSpeed = fielders.reduce((sum, p) => sum + p.physical.speed, 0) / fielders.length;
    fielderAnalysis.avgPower = fielders.reduce((sum, p) => sum + p.batting.power, 0) / fielders.length;
  }

  return {
    pitchers: pitcherAnalysis,
    fielders: fielderAnalysis
  };
}

/**
 * 選手の価値をロスターバランスを考慮してスコア化
 * @param {Object} player - 選手データ
 * @param {Object} rosterAnalysis - ロスター分析結果
 * @returns {number} 選手の価値スコア（高いほど優先）
 */
export function calculatePlayerValueScore(player, rosterAnalysis) {
  const rank = calculatePlayerRank(player);
  const rankScore = { S: 100, A: 80, B: 60, C: 40, D: 20 }[rank] || 0;
  let bonusScore = 0;
  let specialistScore = 0;

  if (player.position === 'pitcher') {
    const { avgStamina, avgVelocity, avgControl, count: pitcherCount } = rosterAnalysis.pitchers;

    // === 一芸ボーナス（総合ランクが低くても突出した能力を評価） ===
    // 剛速球投手（150km/h以上）
    if (player.pitching.velocity >= 150) {
      specialistScore += 40;
    } else if (player.pitching.velocity >= 145) {
      specialistScore += 25;
    }
    // 精密制球（制球70以上）
    if (player.pitching.control >= 70) {
      specialistScore += 35;
    } else if (player.pitching.control >= 60) {
      specialistScore += 15;
    }
    // 鉄腕（スタミナ160以上）
    if (player.pitching.stamina >= 160) {
      specialistScore += 30;
    }
    // 魔球使い（変化球レベル最高が70以上）
    const bestBreaking = player.pitching.arsenal
      ? Math.max(...player.pitching.arsenal.map(p => p.level || 0))
      : 0;
    if (bestBreaking >= 70) {
      specialistScore += 30;
    }

    // === チーム補強ボーナス（不足を埋める） ===
    // スタミナ不足 → スタミナ型投手を優先
    if (avgStamina < 120 && player.pitching.stamina >= 140) {
      bonusScore += 35;
    } else if (avgStamina < 130 && player.pitching.stamina >= 140) {
      bonusScore += 20;
    }

    // 速球派ばかり → 制球派を求める
    if (avgVelocity >= 135 && player.pitching.control >= 60) {
      bonusScore += 25;
    }

    // 制球力不足 → 制球力の高い投手を優先
    if (avgControl < 50 && player.pitching.control >= 60) {
      bonusScore += 30;
    }

    // 速球派不足 → 剛速球投手を求める
    if (avgVelocity < 138 && player.pitching.velocity >= 145) {
      bonusScore += 25;
    }

    // 先発候補不足（投手が少ない時、スタミナ型を重視）
    if (pitcherCount < 5 && player.pitching.stamina >= 130) {
      bonusScore += 20;
    }

    // バランス型投手にもボーナス
    if (player.pitching.stamina >= 130 && player.pitching.velocity >= 135 && player.pitching.control >= 55) {
      bonusScore += 10;
    }

  } else {
    const { avgOffense, avgDefense, avgSpeed, count: fielderCount } = rosterAnalysis.fielders;

    // === 一芸ボーナス（突出した能力を評価） ===
    // スラッガー（パワー75以上）
    if (player.batting.power >= 75) {
      specialistScore += 40;
    } else if (player.batting.power >= 65) {
      specialistScore += 20;
    }
    // 安打製造機（ミート75以上）
    if (player.batting.meet >= 75) {
      specialistScore += 35;
    } else if (player.batting.meet >= 65) {
      specialistScore += 15;
    }
    // 韋駄天（走力75以上）
    if (player.physical.speed >= 75) {
      specialistScore += 35;
    } else if (player.physical.speed >= 65) {
      specialistScore += 15;
    }
    // 守備の名手（守備70以上）
    if (player.fielding.defense >= 70) {
      specialistScore += 30;
    }
    // 強肩（肩力75以上）
    if (player.physical.arm >= 75) {
      specialistScore += 20;
    }
    // 選球眼マスター（選球眼70以上）
    if (player.batting.eye >= 70) {
      specialistScore += 15;
    }

    // === チーム補強ボーナス（不足を埋める） ===
    // 打撃偏重チーム → 守備・走力を求める
    if (avgOffense >= 50) {
      if (player.fielding.defense >= 65) {
        bonusScore += 30; // 守備職人
      }
      if (player.physical.speed >= 65) {
        bonusScore += 25; // 俊足
      }
    }

    // 守備が弱いチーム → 守備の良い選手を優先
    if (avgDefense < 45 && player.fielding.defense >= 55) {
      bonusScore += 30;
    }

    // 足が遅いチーム → 俊足選手を優先
    if (avgSpeed < 45 && player.physical.speed >= 60) {
      bonusScore += 30;
    }

    // 打撃が弱いチーム → 強打者を優先
    if (avgOffense < 40) {
      const offense = (player.batting.meet + player.batting.power) / 2;
      if (offense >= 55) {
        bonusScore += 30;
      }
    }

    // パワー不足 → スラッガーを優先
    if (fielderCount > 0) {
      const avgPower = rosterAnalysis.fielders.avgPower || 0;
      if (avgPower < 45 && player.batting.power >= 60) {
        bonusScore += 25;
      }
    }

    // 5ツール型選手にボーナス
    const offense = (player.batting.meet + player.batting.power) / 2;
    if (offense >= 55 && player.physical.speed >= 60 && player.fielding.defense >= 60) {
      bonusScore += 15;
    }
  }

  return rankScore + bonusScore + specialistScore;
}

/**
 * AIチームの選手選択ロジック（改良版）
 * @param {Array} candidates - 残りの候補者
 * @param {Array} currentRoster - 現在のロスター（配列形式）
 * @returns {Object} 選択された選手
 */
export function selectPlayerForAI(candidates, currentRoster = []) {
  // ロスター配列をオブジェクトから配列に変換（後方互換性のため）
  let rosterArray = currentRoster;
  if (!Array.isArray(currentRoster)) {
    rosterArray = Object.values(currentRoster);
  }

  // ポジション別カウント
  const rosterCounts = {
    pitcher: 0,
    catcher: 0,
    infielder: 0,
    outfielder: 0
  };

  rosterArray.forEach(player => {
    if (player.position === 'pitcher') rosterCounts.pitcher++;
    else if (player.position === 'catcher') rosterCounts.catcher++;
    else if (['first', 'second', 'third', 'short'].includes(player.position)) rosterCounts.infielder++;
    else rosterCounts.outfielder++;
  });

  // ロスターの能力バランスを分析
  const rosterAnalysis = analyzeRosterBalance(rosterArray);

  // 優先ポジション設定（不足しているポジション）
  let preferredPositions = [];
  if (rosterCounts.pitcher < 10) preferredPositions.push('pitcher');
  if (rosterCounts.catcher < 2) preferredPositions.push('catcher');
  if (rosterCounts.infielder < 6) preferredPositions.push('first', 'second', 'third', 'short');
  if (rosterCounts.outfielder < 6) preferredPositions.push('left', 'center', 'right');

  // 全候補者に価値スコアを付与
  const scoredCandidates = candidates.map(player => ({
    ...player,
    valueScore: calculatePlayerValueScore(player, rosterAnalysis),
    isPreferredPosition: preferredPositions.includes(player.position)
  }));

  // ポジション優先度ボーナスを適用
  scoredCandidates.forEach(candidate => {
    if (candidate.isPreferredPosition) {
      // 不足ポジションには大きなボーナス
      if (rosterCounts[candidate.position === 'pitcher' ? 'pitcher' :
                       candidate.position === 'catcher' ? 'catcher' :
                       ['first', 'second', 'third', 'short'].includes(candidate.position) ? 'infielder' : 'outfielder'] === 0) {
        candidate.valueScore += 50; // 0人の場合は最優先
      } else {
        candidate.valueScore += 30; // 不足している場合
      }
    }
  });

  // ランダム要素を加えて各チームの個性を出す（±15pt）
  scoredCandidates.forEach(candidate => {
    candidate.valueScore += (Math.random() - 0.5) * 30;
  });

  // スコアが高い順にソート
  scoredCandidates.sort((a, b) => b.valueScore - a.valueScore);

  // デバッグログ（トップ5を表示）
  if (scoredCandidates.length > 0) {
    console.log('🤖 AI選択 - トップ5候補:');
    scoredCandidates.slice(0, 5).forEach((c, i) => {
      const posName = {
        pitcher: '投手', catcher: '捕手', first: '一', second: '二',
        third: '三', short: '遊', left: '左', center: '中', right: '右'
      }[c.position];
      console.log(`  ${i+1}. ${c.name} (${posName}) - スコア:${c.valueScore.toFixed(1)}`);
    });
  }

  return scoredCandidates[0];
}
