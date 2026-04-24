// ============================================================
// トライアウトシステム - tryoutSystem.js
// 選手獲得システム（年次トライアウト、ドラフト）
// ============================================================

import { generateRandomPlayerName } from '../data/playerNames.js';
import { releasedPlayersPool } from '../teams-data.js';

/**
 * 利き手を決定（左投・左打の発生率を強化）
 * - 右投右打: 40%
 * - 右投左打: 30%
 * - 左投左打: 25%
 * - 右投両打: 4%
 * - 左投右打: 1%（レア）
 */
function determineHandedness() {
  const rand = Math.random() * 100;
  if (rand < 40) {
    return { throws: 'right', bats: 'right' };
  } else if (rand < 70) {
    return { throws: 'right', bats: 'left' };
  } else if (rand < 95) {
    return { throws: 'left', bats: 'left' };
  } else if (rand < 99) {
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
  'speedContact',   // 俊足巧打タイプ（走力+ミート）
  'powerArm',       // 強打強肩タイプ（パワー+肩力）
];

/**
 * 投手用特性リスト
 */
const PITCHER_TRAITS = [
  'fireballer',       // 速球タイプ
  'controlPitcher',   // 制球タイプ
  'ironman',          // スタミナタイプ
  'breakingBall',     // 変化球タイプ
  'sinkerballer',     // ゴロ量産タイプ（制球+スタミナ重視）
  'strikeoutArtist',  // 奪三振タイプ（球速高/制球不安定）
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
    'eyeMaster', 'baserunner', 'armStrong', 'speedContact', 'powerArm',
    'fireballer', 'controlPitcher', 'ironman', 'breakingBall',
    'sinkerballer', 'strikeoutArtist',
  ];
  return types[Math.floor(Math.random() * types.length)];
}

/**
 * 解雇プールから再トライアウト参加者を取り出し、候補者形式に整形
 * - プール内の base snapshot を変更せずに、表示用コピーを生成
 * - 年齢は attemptsInPool 分加算（プール滞在年数相当の経過）
 * - 能力値にブランクによる微減衰を適用
 * @returns {Array} 再トライアウト参加者（解雇フラグ付き）
 */
function getReleasedCandidatesFromPool() {
  if (!releasedPlayersPool || releasedPlayersPool.length === 0) return [];

  const candidates = [];
  for (const p of releasedPlayersPool) {
    const aged = JSON.parse(JSON.stringify(p));
    // プール滞在年数（0回目の再挑戦=解雇直後の翌年 → +1歳, 1回目の不指名後の再挑戦=+2歳）
    const yearsInPool = (p.attemptsInPool || 0) + 1;
    aged.age = (p.age || 20) + yearsInPool;
    // 能力値の微減衰: 滞在年数に応じて累積（1年あたり各-1〜-2）
    const decay = (val, min = 1) => {
      let result = val;
      for (let y = 0; y < yearsInPool; y++) {
        result = Math.max(min, result - (1 + Math.floor(Math.random() * 2)));
      }
      return result;
    };
    if (aged.batting) {
      aged.batting.meet = decay(aged.batting.meet || 0);
      aged.batting.power = decay(aged.batting.power || 0);
      aged.batting.eye = decay(aged.batting.eye || 0);
    }
    if (aged.physical) {
      aged.physical.speed = decay(aged.physical.speed || 0);
    }
    if (aged.fielding) {
      aged.fielding.defense = decay(aged.fielding.defense || 0);
    }
    if (aged.pitching) {
      aged.pitching.control = decay(aged.pitching.control || 0);
      aged.pitching.velocity = decay(aged.pitching.velocity || 0, 100);
      aged.pitching.stamina = decay(aged.pitching.stamina || 0, 30);
    }
    // 再トライアウトフラグ
    aged.isReleasedCandidate = true;
    candidates.push(aged);
  }
  return candidates;
}

/**
 * トライアウト後に解雇プールを更新
 * - 獲得された選手はプールから削除
 * - 獲得されなかった選手は attemptsInPool++（base snapshotの能力値・年齢は変更しない）
 * - 2回連続不指名、またはベース年齢+滞在年数が33歳以上の選手は引退（削除）
 * @param {Array<number>} draftedIds - トライアウトで指名された選手のIDリスト
 */
export function updateReleasedPoolAfterTryout(draftedIds) {
  if (!releasedPlayersPool || releasedPlayersPool.length === 0) return;
  const drafted = new Set(draftedIds || []);
  for (let i = releasedPlayersPool.length - 1; i >= 0; i--) {
    const p = releasedPlayersPool[i];
    if (drafted.has(p.id)) {
      // 再獲得された: プールから削除
      releasedPlayersPool.splice(i, 1);
      continue;
    }
    // 不指名: attempts++（base age/能力は保持）
    p.attemptsInPool = (p.attemptsInPool || 0) + 1;
    // 引退判定: 2回連続不指名 or 実年齢（base + 次回表示時の滞在年数）が33以上
    const nextDisplayAge = (p.age || 20) + (p.attemptsInPool + 1);
    if (p.attemptsInPool >= 2 || nextDisplayAge >= 33) {
      releasedPlayersPool.splice(i, 1);
    }
  }
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

  // ID衝突を防ぐため、年度ベースのオフセットを使用
  const idBase = (year || 1) * 10000;

  for (let i = 1; i <= totalCandidates; i++) {
    // 利き手を決定
    const handedness = determineHandedness();
    const throws = handedness.throws;
    const bats = handedness.bats;

    // 二刀流選手かどうか（15%の確率、右投げのみ）
    const isTwoWay = throws === 'right' && Math.random() < 0.15;

    // 投手と野手を1:1の比率で生成（ただし左投げは制限あり）
    let isPitcher = Math.random() < 0.5;
    let position;
    let twoWaySubPosition = null;

    if (isTwoWay) {
      const twoWayRoll = Math.random();
      if (twoWayRoll < 0.7) {
        // 70%: 投手登録の二刀流（野手としても出場可能）
        position = 'pitcher';
        isPitcher = true;
        twoWaySubPosition = Math.random() < 0.5 ? 'short' : 'center';
      } else if (twoWayRoll < 0.9) {
        // 20%: 遊撃手 or センター登録の二刀流
        position = Math.random() < 0.5 ? 'short' : 'center';
        isPitcher = false;
      } else {
        // 10%: その他の野手登録の二刀流
        const otherPositions = ['catcher', 'first', 'second', 'third', 'left', 'right'];
        position = otherPositions[Math.floor(Math.random() * otherPositions.length)];
        isPitcher = false;
      }
    } else if (throws === 'left') {
      // 左投げの場合、ポジションを制限
      position = getPositionForLeftHander();
      isPitcher = position === 'pitcher';
    } else {
      // 右投げの場合は自由にポジション決定
      position = isPitcher ? 'pitcher' : fieldPositions[Math.floor(Math.random() * fieldPositions.length)];
    }

    // 特性を持つ選手かどうか（65%の確率、二刀流以外）
    const hasTraits = !isTwoWay && Math.random() < 0.65;
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

    // 年齢を重み付きランダムで決定（18-25歳、高卒・大卒が多い分布）
    const ageWeights = [
      { age: 18, weight: 20 }, // 高卒
      { age: 19, weight: 10 },
      { age: 20, weight: 10 },
      { age: 21, weight: 10 },
      { age: 22, weight: 30 }, // 大卒
      { age: 23, weight: 10 },
      { age: 24, weight: 5 },
      { age: 25, weight: 5 },
    ];
    const totalWeight = ageWeights.reduce((sum, w) => sum + w.weight, 0);
    const roll = Math.random() * totalWeight;
    let cumulative = 0;
    let age = 18;
    for (const entry of ageWeights) {
      cumulative += entry.weight;
      if (roll < cumulative) { age = entry.age; break; }
    }

    // 能力値生成（特性選手の場合は特殊な分布、年齢補正あり、二刀流対応）
    const abilities = generateAbilities(isPitcher, position, isSpecialist, specialistType, pitchingForm, age, isTwoWay, playerTraits);

    const player = {
      id: idBase + i,
      name: name,
      age: age,
      position: position,
      battingOrder: 0,
      isStarter: false,
      isTwoWay: isTwoWay, // 二刀流フラグ
      twoWaySubPosition: twoWaySubPosition, // 投手登録二刀流の野手サブポジション
      primaryRole: isTwoWay && position === 'pitcher' ? 'pitcher' : null, // 投手登録二刀流マーカー
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
        throws: throws,
        bodyStamina: abilities.bodyStamina || 50,
        recovery: abilities.recovery || 50
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
          ? generateRandomArsenal(
              playerTraits.includes('breakingBall') ? 2 : 0,
              playerTraits.includes('fireballer') || playerTraits.includes('strikeoutArtist')
            )
          : generateFielderArsenal()
      },
      traits: playerTraits, // 選手の特性を保存
      scoutComment: null, // 後でgenerateScoutCommentで設定
      positionFitness: isTwoWay ? generateTwoWayPositionFitness(position, twoWaySubPosition) : generatePositionFitness(position),
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

    player.scoutComment = generateScoutComment(player);
    candidates.push(player);
  }

  // 解雇プールから再トライアウト参加者を追加（初回トライアウト除く）
  if (!isInitial) {
    const releasedCandidates = getReleasedCandidatesFromPool();
    const existingIds = new Set(candidates.map(c => c.id));
    releasedCandidates.forEach(rc => {
      if (!existingIds.has(rc.id)) {
        existingIds.add(rc.id);
        candidates.push(rc);
      }
    });
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

  // 球速から肩力を導出（投手・二刀流用）
  // velocity 110→arm ~30, 130→arm ~55, 150→arm ~80
  const armFromVelocity = (velocity) => {
    const base = Math.round((velocity - 110) / 45 * 55 + 28);
    const variance = Math.floor(Math.random() * 17) - 8; // -8 ~ +8
    return Math.max(10, Math.min(99, base + variance));
  };

  // 肩力から球速を導出（野手用）
  // arm 20→velocity ~106, 50→velocity ~116, 80→velocity ~127, 99→velocity ~133
  const velocityFromArm = (arm) => {
    const base = Math.round((arm - 10) / 90 * 30 + 103);
    const variance = Math.floor(Math.random() * 7) - 3; // -3 ~ +3
    return Math.max(100, Math.min(145, base + variance));
  };

  // 全生成選手の平均能力を-3する調整関数
  const applyGlobalOffset = (abilities) => {
    const offset = -3;
    const result = {};
    for (const [key, value] of Object.entries(abilities)) {
      if (key === 'velocity') {
        result[key] = Math.max(100, value + offset);
      } else if (key === 'stamina') {
        result[key] = Math.max(30, value + offset);
      } else {
        result[key] = Math.max(1, Math.min(99, value + offset));
      }
    }
    return result;
  };

  // 二刀流選手の場合は投打両方に能力を持つ
  if (isTwoWay) {
    if (isPitcher) {
      // 投手登録の二刀流: 投手能力が本職寄り、打撃もプロレベル
      const twoWayVelocity = Math.min(randVelocity(125, 145, ageBonus) + velocityAdjust, 152);
      return applyGlobalOffset({
        meet: randRangeWithVariance(38, 60),
        power: randRangeWithVariance(35, 60),
        eye: randRangeWithVariance(35, 60),
        steal: randRangeWithVariance(30, 55),
        speed: randRangeWithVariance(45, 75),
        arm: armFromVelocity(twoWayVelocity),
        defense: randRangeWithVariance(45, 70),
        bodyStamina: randRangeWithVariance(45, 75),
        recovery: randRangeWithVariance(45, 75),
        velocity: twoWayVelocity,
        control: Math.min(randRangeWithVariance(40, 68) + controlAdjust, 85),
        stamina: randStamina(80, 110)
      });
    } else {
      // 野手登録の二刀流: 野手能力メイン、投手もそこそこ
      const twoWayVelocity = Math.min(randVelocity(121, 139) + velocityAdjust, 149);
      return applyGlobalOffset({
        meet: randRangeWithVariance(40, 65),
        power: randRangeWithVariance(32, 57),
        eye: randRangeWithVariance(35, 65),
        steal: randRangeWithVariance(30, 60),
        speed: randRangeWithVariance(43, 73),
        arm: armFromVelocity(twoWayVelocity),
        defense: randRangeWithVariance(40, 65),
        bodyStamina: randRangeWithVariance(40, 70),
        recovery: randRangeWithVariance(40, 70),
        velocity: twoWayVelocity,
        control: Math.min(randRangeWithVariance(40, 65) + controlAdjust, 80),
        stamina: randStamina(67, 100)
      });
    }
  }

  // 通常の能力値範囲（投手用 or 野手アーキタイプ別）
  let normalAbilities;
  if (isPitcher) {
    const pitcherVelocity = Math.min(randVelocity(116, 139, ageBonus) + velocityAdjust, 152);
    normalAbilities = {
      meet: randRangeWithVariance(15, 40),
      power: randRangeWithVariance(5, 29),
      eye: randRangeWithVariance(25, 50),
      steal: randRangeWithVariance(10, 25, Math.max(0, Math.floor(ageBonus * 0.5))),
      speed: randRangeWithVariance(33, 58, Math.max(0, Math.floor(ageBonus * 0.5))),
      arm: armFromVelocity(pitcherVelocity),
      defense: randRangeWithVariance(40, 65),
      bodyStamina: randRangeWithVariance(40, 70),
      recovery: randRangeWithVariance(40, 70),
      velocity: pitcherVelocity,
      control: Math.min(randRangeWithVariance(35, 65) + controlAdjust, 85),
      stamina: randStamina(73, 113, ageBonus)
    };
  } else {
    // 野手アーキタイプ: 特性なしの選手にも個性を持たせる
    // 【設計思想】原石段階。長所は光るが伸びしろを残す
    const archetypes = [
      // 巧打タイプ: ミート高、パワー低
      { meet: [50, 70], power: [18, 38], eye: [46, 66], steal: [30, 56], speed: [38, 63], arm: [30, 56], defense: [36, 60] },
      // 強打タイプ: パワー高、走力低
      { meet: [33, 53], power: [43, 63], eye: [30, 53], steal: [20, 40], speed: [28, 50], arm: [40, 63], defense: [30, 53] },
      // 俊足タイプ: 走力高、パワー低
      { meet: [36, 56], power: [18, 38], eye: [33, 56], steal: [56, 76], speed: [58, 76], arm: [30, 56], defense: [40, 63] },
      // 守備タイプ: 守備高、打撃低
      { meet: [30, 50], power: [18, 38], eye: [33, 56], steal: [30, 56], speed: [43, 66], arm: [50, 70], defense: [56, 76] },
      // バランスタイプ: 平均的
      { meet: [36, 60], power: [26, 50], eye: [33, 60], steal: [30, 58], speed: [36, 63], arm: [33, 58], defense: [33, 60] },
      // 打撃特化タイプ: 打撃全般高、守備走力低
      { meet: [46, 66], power: [38, 60], eye: [40, 63], steal: [20, 40], speed: [28, 50], arm: [30, 53], defense: [26, 48] },
      // 肩力タイプ: 肩力高、ミート低
      { meet: [30, 50], power: [30, 50], eye: [30, 53], steal: [26, 50], speed: [36, 60], arm: [58, 76], defense: [43, 66] },
    ];
    const arch = archetypes[Math.floor(Math.random() * archetypes.length)];
    const fielderArm = randRangeWithVariance(arch.arm[0], arch.arm[1]);
    normalAbilities = {
      meet: randRangeWithVariance(arch.meet[0], arch.meet[1]),
      power: randRangeWithVariance(arch.power[0], arch.power[1]),
      eye: randRangeWithVariance(arch.eye[0], arch.eye[1]),
      steal: randRangeWithVariance(arch.steal[0], arch.steal[1], Math.max(0, Math.floor(ageBonus * 0.7))),
      speed: randRangeWithVariance(arch.speed[0], arch.speed[1], Math.max(0, Math.floor(ageBonus * 0.7))),
      arm: fielderArm,
      defense: randRangeWithVariance(arch.defense[0], arch.defense[1]),
      bodyStamina: randRangeWithVariance(40, 75),
      recovery: randRangeWithVariance(40, 75),
      velocity: velocityFromArm(fielderArm),
      control: randRange(30, 55),
      stamina: randRange(40, 67)
    };
  }

  if (!isSpecialist || playerTraits.length === 0) {
    return applyGlobalOffset(normalAbilities);
  }

  // 複数特性の能力調整（各特性のボーナスを累積適用）
  let abilities = { ...normalAbilities };

  // 特性ごとのボーナス定義
  // 【設計思想】独立リーグ入り時点では原石。長所は"光る"程度で、
  // キャンプ練習や経験で磨くことで戦力になる。最初からプロレベルは作らない。
  // - 長所（シグネチャ能力）: 55〜75程度 (C〜B ランク)
  // - 副長所: 40〜60
  // - 弱点: 10〜35 (伸びしろとして残す)
  const traitBonuses = {
    // --- 野手特性（原石、磨けば光る素材） ---
    speedster: {
      // 足は光るが打撃・守備は未熟 → 外野・代走から育成
      speed: () => randRange(73, 88),
      steal: () => randRange(68, 85),
      meet: () => randRange(30, 47),
      power: () => randRange(17, 33),
      defense: () => randRange(43, 63)
    },
    slugger: {
      // パワーが魅力だが粗削り → ミート・選球眼を磨く余地
      power: () => randRange(63, 78),
      meet: () => randRange(33, 50),
      eye: () => randRange(30, 50),
      speed: () => randRange(23, 40),
      steal: () => randRange(13, 27),
      defense: () => randRange(27, 47),
      arm: () => randRange(37, 57)
    },
    defender: {
      // 守備センスは光るが打撃は弱い → 守備固めから育成
      defense: () => randRange(73, 88),
      arm: () => randRange(67, 83),
      meet: () => randRange(30, 47),
      power: () => randRange(20, 37),
      speed: () => randRange(43, 63)
    },
    contactHitter: {
      // 当てる感覚はあるが一発は期待薄 → 長打力を磨く余地
      meet: () => randRange(65, 80),
      eye: () => randRange(58, 75),
      power: () => randRange(23, 40),
      speed: () => randRange(43, 60)
    },
    eyeMaster: {
      // 選球眼が光る → 四球選べるがミート/パワーに伸びしろ
      eye: () => randRange(68, 83),
      meet: () => randRange(40, 57),
      power: () => randRange(23, 40),
      steal: () => randRange(30, 50)
    },
    baserunner: {
      // 走塁勘が抜群 → バッティングに成長余地
      speed: () => randRange(68, 83),
      steal: () => randRange(71, 86),
      meet: () => randRange(33, 50),
      power: () => randRange(20, 37),
      defense: () => randRange(43, 63)
    },
    armStrong: {
      // 肩は魅力的だが打撃・守備は粗い
      arm: () => randRange(71, 86),
      defense: () => randRange(47, 65),
      power: () => randRange(33, 53),
      meet: () => randRange(27, 47)
    },
    speedContact: {
      // 俊足+巧打の素材型（両方ほどほどに光る）
      meet: () => randRange(61, 75),
      eye: () => randRange(45, 63),
      speed: () => randRange(65, 80),
      steal: () => randRange(61, 78),
      power: () => randRange(17, 33),
      defense: () => randRange(43, 63)
    },
    powerArm: {
      // 強打+強肩の素材型
      power: () => randRange(58, 73),
      arm: () => randRange(68, 83),
      defense: () => randRange(45, 63),
      meet: () => randRange(33, 50),
      speed: () => randRange(25, 43),
      steal: () => randRange(13, 27)
    },
    // --- 投手特性（原石、磨けば光る素材） ---
    fireballer: {
      // 球速が魅力。制球や変化球を磨けば戦力に
      // 例: チェンジアップ覚えれば緩急で三振が取れる
      velocity: () => Math.min(randVelocity(143, 150) + velocityAdjust, 153),
      control: () => Math.min(randRange(28, 45) + controlAdjust, 58),
      stamina: () => randStamina(55, 82)
    },
    controlPitcher: {
      // 制球派の素材。球威は平均以下だが守備を磨けば
      velocity: () => Math.max(randVelocity(118, 130) + velocityAdjust, 115),
      control: () => Math.min(randRange(58, 73) + controlAdjust, 80),
      stamina: () => randStamina(72, 100)
    },
    ironman: {
      // タフネス型。技術は粗いが練習で伸びる
      velocity: () => Math.min(randVelocity(120, 131) + velocityAdjust, 137),
      control: () => Math.min(randRange(35, 52) + controlAdjust, 65),
      stamina: () => randStamina(95, 125)
    },
    breakingBall: {
      // 変化球派（arsenalで+2球種、早熟型）
      control: () => Math.min(randRange(48, 63) + controlAdjust, 72),
      velocity: () => Math.max(randVelocity(117, 130) + velocityAdjust, 114),
      stamina: () => randStamina(70, 95)
    },
    sinkerballer: {
      // ゴロ量産候補。制球とスタミナが売り
      velocity: () => Math.min(randVelocity(118, 130) + velocityAdjust, 135),
      control: () => Math.min(randRange(52, 68) + controlAdjust, 75),
      stamina: () => randStamina(82, 110)
    },
    strikeoutArtist: {
      // 空振り奪取型。球威あるが粗削り
      velocity: () => Math.min(randVelocity(139, 146) + velocityAdjust, 150),
      control: () => Math.min(randRange(30, 48) + controlAdjust, 60),
      stamina: () => randStamina(55, 80)
    }
  };

  // 各特性を順に適用
  // 単一特性: 常に上書き → 得意/不得意が明確な個性的な選手に
  // 複数特性: 良い方を採用 → 複合的な長所を持つ選手に
  const isSingleTrait = playerTraits.length === 1;
  let velocityChanged = false;
  let armChanged = false;
  playerTraits.forEach(trait => {
    const bonuses = traitBonuses[trait];
    if (!bonuses) return;
    Object.entries(bonuses).forEach(([stat, generator]) => {
      const traitValue = generator();
      if (isSingleTrait || traitValue > abilities[stat]) {
        abilities[stat] = traitValue;
        if (stat === 'velocity') velocityChanged = true;
        if (stat === 'arm') armChanged = true;
      }
    });
  });

  // 特性で球速or肩が変わった場合、もう片方を連動させる
  if (isPitcher && velocityChanged) {
    // 投手: 球速から肩を再導出（特性のarm指定がなければ）
    if (!armChanged) {
      abilities.arm = armFromVelocity(abilities.velocity);
    }
  } else if (!isPitcher && armChanged) {
    // 野手: 肩から球速を再導出（特性のvelocity指定がなければ）
    if (!velocityChanged) {
      abilities.velocity = velocityFromArm(abilities.arm);
    }
  }

  return applyGlobalOffset(abilities);
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
 * @param {boolean} weak - 球威型（fireballer/strikeoutArtist）フラグ。変化球が少なく未熟（成長課題を演出）
 */
export const generateRandomArsenal = (extraPitches = 0, weak = false) => {
  const pitchTypes = ['straight', 'twoSeam', 'slider', 'curve', 'fork', 'changeup',
                      'sinker', 'shoot', 'cutter', 'splitter', 'palm', 'knuckle'];
  // weak: 球威型はストレート+変化球1種のみ（チェンジアップ等を覚えれば化ける演出）
  // 独立リーグ入りの投手は高校でもプレーしてきた選手なので、最低でも1球種は持つ
  const baseSize = weak ? 2 : (Math.floor(Math.random() * 3) + 2); // weak=ストレート+1種, 通常=2-4種
  const arsenalSize = Math.min(baseSize + extraPitches, 7);
  const arsenal = [];
  const usedTypes = new Set();

  // ストレートは必ず含める
  arsenal.push({ id: 1, type: 'straight', level: 100 });
  usedTypes.add('straight');

  for (let i = 2; i <= arsenalSize; i++) {
    const availableTypes = pitchTypes.filter(t => !usedTypes.has(t));
    if (availableTypes.length === 0) break;

    const selectedType = availableTypes[Math.floor(Math.random() * availableTypes.length)];
    let levelMin, levelMax;
    if (weak) {
      // 球威型: 変化球は未熟（レベルF〜E帯）→ 習得・練習の伸びしろ演出
      levelMin = 15;
      levelMax = 40;
    } else {
      // 通常: 独立リーグレベル（S/Aランクは稀に）
      levelMin = (i > baseSize) ? 40 : 25;
      levelMax = (i > baseSize) ? 80 : 70;
    }
    let level = Math.floor(Math.random() * (levelMax - levelMin + 1)) + levelMin;
    // weakでない場合のみスライダー・スプリッター底上げ
    if (!weak && (selectedType === 'slider' || selectedType === 'splitter')) {
      level = Math.max(level, 40);
      level = Math.min(level + 10, 90);
    }
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

  // 隣接ポジションに適性を付与（primary=関連性高い, secondary=やや関連）
  const positionGroups = {
    pitcher: { primary: [], secondary: [] },
    catcher: { primary: ['first'], secondary: [] },
    first: { primary: ['third'], secondary: ['catcher'] },
    second: { primary: ['short'], secondary: ['third'] },
    third: { primary: ['first', 'short'], secondary: ['second'] },
    short: { primary: ['second', 'third'], secondary: [] },
    left: { primary: ['center', 'right'], secondary: [] },
    center: { primary: ['left', 'right'], secondary: [] },
    right: { primary: ['left', 'center'], secondary: [] }
  };

  const group = positionGroups[mainPosition];
  if (group) {
    group.primary.forEach(adj => {
      fitness[adj] = Math.floor(Math.random() * 25) + 65; // 65-90
    });
    group.secondary.forEach(adj => {
      fitness[adj] = Math.floor(Math.random() * 25) + 50; // 50-75
    });
  }

  return fitness;
}

/**
 * 二刀流選手のポジション適性を生成
 * 投手と野手の両方に高い適性を持つ
 * @param {string} mainPosition - 登録ポジション
 * @param {string|null} subPosition - 投手登録二刀流の野手サブポジション
 */
export const generateTwoWayPositionFitness = (mainPosition, subPosition) => {
  const fitness = {
    pitcher: 80,
    catcher: 30, first: 30,
    second: 30, third: 30, short: 30,
    left: 30, center: 30, right: 30
  };

  fitness[mainPosition] = 100;

  if (mainPosition === 'pitcher' && subPosition) {
    // 投手登録の二刀流: サブポジション高適性、関連ポジションもやや高め
    fitness[subPosition] = Math.floor(Math.random() * 11) + 85; // 85-95
    if (subPosition === 'short') {
      fitness.second = Math.floor(Math.random() * 15) + 60;
      fitness.third = Math.floor(Math.random() * 15) + 55;
      fitness.center = Math.floor(Math.random() * 15) + 50;
    } else if (subPosition === 'center') {
      fitness.left = Math.floor(Math.random() * 15) + 60;
      fitness.right = Math.floor(Math.random() * 15) + 60;
      fitness.short = Math.floor(Math.random() * 15) + 45;
    }
  } else {
    // 野手登録の二刀流: 投手適性高め、周辺ポジションも対応可
    fitness.pitcher = Math.floor(Math.random() * 15) + 75; // 75-90
    if (mainPosition === 'short') {
      fitness.second = Math.floor(Math.random() * 15) + 65;
      fitness.third = Math.floor(Math.random() * 15) + 55;
      fitness.center = Math.floor(Math.random() * 15) + 50;
    } else if (mainPosition === 'center') {
      fitness.left = Math.floor(Math.random() * 15) + 65;
      fitness.right = Math.floor(Math.random() * 15) + 65;
    } else {
      if (mainPosition !== 'first') fitness.first = Math.floor(Math.random() * 20) + 60;
      if (mainPosition !== 'left') fitness.left = Math.floor(Math.random() * 20) + 55;
      if (mainPosition !== 'center') fitness.center = Math.floor(Math.random() * 20) + 55;
      if (mainPosition !== 'right') fitness.right = Math.floor(Math.random() * 20) + 55;
    }
  }

  return fitness;
}

/**
 * 年齢による評価補正（素材型 vs 即戦力）
 * 大卒(22歳)を基準(±0)とし、若いほど将来性で加点、年上はやや辛口
 * @param {number} age - 選手の年齢
 * @returns {number} - ランク計算に加算する補正値
 */
function getAgeRankAdjust(age) {
  if (age <= 18) return 10;  // 高卒素材（大化けの期待）
  if (age <= 19) return 7;
  if (age <= 20) return 5;
  if (age <= 21) return 3;
  if (age <= 22) return 0;   // 大卒基準
  if (age <= 23) return -3;
  if (age <= 24) return -7;
  return -12;                // 即戦力レベル必須
}

/**
 * 選手の推薦ランクを計算（S/A/B/C/D）
 * 年齢補正あり: 若手は素材型として加点、年上は即戦力として現能力ベースで評価
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

  // 年齢補正（素材型ボーナス / 即戦力ペナルティ）
  totalScore += getAgeRankAdjust(player.age || 22);

  // ランク判定
  if (totalScore >= 80) return 'S';
  if (totalScore >= 70) return 'A';
  if (totalScore >= 60) return 'B';
  if (totalScore >= 50) return 'C';
  return 'D';
};

/**
 * スカウトコメントテンプレート（特性別）
 */
const SCOUT_COMMENT_TEMPLATES = {
  // 野手特性
  speedster: [
    '俊足は天下一品。バント・盗塁で試合を動かせる選手に育てたい。',
    'とにかく足が速い。守備範囲の広い外野手として磨けば一線級になれる素材だ。',
    'この走力は独立リーグでは際立っている。打撃が育てば面白い。'
  ],
  slugger: [
    '打球の飛距離は将来性を感じさせる。ミートを鍛えればアーチを量産できるはず。',
    '粗削りだが、あの打球の強さは本物。あとは当てる技術だけだ。',
    '強いスイングが武器。制球眼を磨けば長距離砲になれる。'
  ],
  defender: [
    '守備は光る。肩の強さと安定感は他の候補者とは別格だ。',
    'グラブさばきが上手い。攻守のバランスを高めれば主力になれる。',
    '守りで試合を作れる選手だ。打撃が育てば理想の守備職人になれる。'
  ],
  contactHitter: [
    'バットコントロールが巧み。出塁率が高く、ラインナップに欠かせない存在になれる。',
    'ミートの精度が高い。選球眼を鍛えれば出塁マシンになれる原石だ。',
    '振り回さずしっかり当てる技術がある。打順の軸として活躍できそうだ。'
  ],
  eyeMaster: [
    '選球眼が素晴らしい。四球を稼げる選手は攻撃の起点になれる。',
    'ボール球に手を出さない冷静さがある。長打力が出れば面白い選手だ。',
    '見極めが抜群。長所を活かした打席を増やせれば化けそうだ。'
  ],
  baserunner: [
    '走塁センスが光る。バッティングが一人前になれば計算できる選手だ。',
    '塁上での判断力が良い。盗塁技術を磨けば相手チームの脅威になれる。',
    'スピードと判断力は独立リーグでも上位クラス。打撃が課題だ。'
  ],
  armStrong: [
    '肩の強さは一級品。外野からの矢のような返球は見ていて気持ちいい。',
    'この肩があれば外野はもちろん、右翼やサードでも使える可能性がある。',
    '強肩が光る。守備と打撃が整えば即戦力に近づける素材だ。'
  ],
  speedContact: [
    '俊足に加えてミートもなかなかある。磨けば上位打線を任せられる選手になれる。',
    '足も使えてバットもそこそこ。バランスが整ってきたら怖い選手だ。',
    '俊足巧打の素材。打撃をもう少し磨けばすぐに戦力計算できる。'
  ],
  powerArm: [
    '長打力と強肩を兼ね備えた外野手の素材。打撃の精度が上がれば大きい。',
    'パワーと肩が光る。バットコントロールさえ良くなれば主軸を任せたい。',
    '強肩強打の片鱗あり。荒削りだが将来性は十分ある選手だ。'
  ],
  // 投手特性
  fireballer: [
    'この球速は魅力。チェンジアップを覚えれば、緩急で三振が量産できる素材だ。',
    '球威は本物。変化球の精度を上げれば、打者は手こずるはずだ。',
    'ストレートで押せる力がある。あとは制球と変化球を磨くだけだ。'
  ],
  controlPitcher: [
    'コーナーへのコントロールが光る。球速を上げれば、打者は手も足も出ない。',
    '打者の内外角を丁寧につける投球術がある。球威があれば面白い存在だ。',
    '制球力は独立リーグでもトップクラス。あとは球威があればいうことなし。'
  ],
  ironman: [
    'スタミナは抜群。先発として長いイニングを任せたい素材だ。',
    '試合を通して安定して投げられる体力がある。技術面の成長が鍵だ。',
    '9回まで投げ切るタフネスがある。技術を磨けば安定感あるローテ投手になれる。'
  ],
  breakingBall: [
    '多彩な変化球が武器。制球が安定すれば、打者を翻弄できる投手になれる。',
    '変化球の種類が豊富。コントロールを磨けば面白い投手に育つ。',
    '曲がりの鋭い変化球がある。制球さえ安定すれば大きな武器になる。'
  ],
  sinkerballer: [
    'ゴロを打たせる技術がある。守備陣と連携して試合を作れる投手になれそうだ。',
    'バットの芯を外す投球ができる。制球とスタミナをさらに伸ばしたい素材だ。',
    '打ち取る術を持っている。守りのチームに合った投球スタイルだ。'
  ],
  strikeoutArtist: [
    '三振を取れる球威がある。変化球を覚えれば空振り量産型の投手になれる。',
    'もう一球種磨けば手がつけられない存在になれる。まだ磨かれていない原石だ。',
    '奪三振能力の片鱗を感じる。変化球を習得すれば一気に化ける素材だ。'
  ]
};

/**
 * 特性のコメントテンプレートが選手の実能力に合致するか判定
 * - 複数特性を持つ選手はgenerateAbilitiesで最大値が採用されるため、
 *   primaryTraitのコメントが実能力と矛盾することがある（例: controlPitcher+fireballer → 球速A）
 * - 本関数でコメントテンプレートの文言と実能力が矛盾しない特性だけを選ぶ
 * @returns {boolean} trait のテンプレート文言が player の実能力と整合するか
 */
function traitCommentMatches(trait, player) {
  const p = player.pitching || {};
  const b = player.batting || {};
  const ph = player.physical || {};
  const f = player.fielding || {};
  const arsenal = p.arsenal || [];
  const breakingBallCount = arsenal.filter(a => a.type !== 'straight').length;
  const hasSinkerType = arsenal.some(a => ['sinker', 'twoSeam', 'shoot', 'splitter'].includes(a.type));

  switch (trait) {
    // 投手特性
    case 'fireballer':
      // 「この球速は魅力」「球威は本物」→ 球速が高いこと
      return (p.velocity || 0) >= 140;
    case 'controlPitcher':
      // 「球速を上げれば打者は手も足も出ない」→ 制球が高く球速が足りないこと
      return (p.control || 0) >= 55 && (p.velocity || 0) < 140;
    case 'ironman':
      // 「スタミナは抜群」→ スタミナが高いこと
      return (p.stamina || 0) >= 85;
    case 'breakingBall':
      // 「多彩な変化球が武器」→ 変化球が複数あること
      return breakingBallCount >= 3;
    case 'sinkerballer':
      // 「ゴロを打たせる技術」→ 沈む系の球種を持ち、ある程度の制球があること
      return hasSinkerType && (p.control || 0) >= 50;
    case 'strikeoutArtist':
      // 「三振を取れる球威」「制球はまだ粗い」→ 球速が高く制球が不安定であること
      return (p.velocity || 0) >= 138 && (p.control || 0) < 58;
    // 野手特性
    case 'speedster':
      return (ph.speed || 0) >= 60;
    case 'slugger':
      return (b.power || 0) >= 55;
    case 'defender':
      return (f.defense || 0) >= 55;
    case 'contactHitter':
      return (b.meet || 0) >= 55;
    case 'eyeMaster':
      return (b.eye || 0) >= 55;
    case 'baserunner':
      return (ph.speed || 0) >= 50 && (b.steal || 0) >= 45;
    case 'armStrong':
      return (ph.arm || 0) >= 60;
    case 'speedContact':
      return (ph.speed || 0) >= 50 && (b.meet || 0) >= 50;
    case 'powerArm':
      return (b.power || 0) >= 50 && (ph.arm || 0) >= 50;
    default:
      return false;
  }
}

/**
 * スカウトコメントを生成
 * @param {Object} player - 選手データ（traits, position, batting, pitching, physical, fielding を含む）
 * @returns {string} スカウトコメント
 */
export function generateScoutComment(player) {
  const traits = player.traits || [];

  // 実能力と合致する特性を優先して選ぶ（複数特性時の矛盾コメントを防止）
  for (const trait of traits) {
    const templates = SCOUT_COMMENT_TEMPLATES[trait];
    if (templates && traitCommentMatches(trait, player)) {
      return templates[Math.floor(Math.random() * templates.length)];
    }
  }

  // 特性なし or 実能力と合致する特性がなかった場合: 実能力ベースでコメントを生成
  const isPitcher = player.position === 'pitcher';
  if (isPitcher) {
    const v = player.pitching?.velocity || 130;
    const c = player.pitching?.control || 40;
    const s = player.pitching?.stamina || 60;
    const arsenal = player.pitching?.arsenal || [];
    const breakingBallCount = arsenal.filter(a => a.type !== 'straight').length;
    if (v >= 145 && c < 58) return '球速は魅力。制球が安定すれば打者を抑えられる素材だ。';
    if (v >= 145) return '球速は及第点以上。変化球と制球の精度次第で戦力になれる。';
    if (c >= 60 && v < 135) return '丁寧なピッチングができる。球威が増せば面白い存在になれる。';
    if (c >= 60) return '球の散らばりが少ない。持ち味を活かせば計算できる投手だ。';
    if (s >= 90) return '長いイニングを任せられる体力がある。技術を磨けばローテに入れる。';
    if (breakingBallCount >= 3) return '変化球の引き出しは多い。制球が整えば打者を翻弄できる。';
    return '平均的な能力だが、真摯に練習に取り組む姿勢が見えた。伸びしろに期待する。';
  } else {
    const meet = player.batting?.meet || 0;
    const power = player.batting?.power || 0;
    const eye = player.batting?.eye || 0;
    const speed = player.physical?.speed || 0;
    const defense = player.fielding?.defense || 0;
    const arm = player.physical?.arm || 0;
    const maxStat = Math.max(meet, power, eye, speed, defense, arm);
    if (maxStat === speed && speed >= 50) return '俊足が光る。守備範囲を広げて打撃を磨けば戦力になれる。';
    if (maxStat === meet && meet >= 45) return 'バットコントロールがある。打撃の精度を磨けば計算できる選手だ。';
    if (maxStat === power && power >= 40) return '打球の飛距離は魅力的。当てる技術が身につけば大きな武器になる。';
    if (maxStat === eye && eye >= 50) return '選球眼に光るものがある。出塁率を稼げる打者に育てたい。';
    if (maxStat === defense && defense >= 50) return '守備の安定感がある。攻撃面を鍛えれば即戦力に近づける。';
    if (maxStat === arm && arm >= 50) return '肩の強さが光る。守備位置の適性を活かして育てたい。';
    return '全体的に粗削りだが、真面目な取り組みが見えた。時間をかけて育てたい素材だ。';
  }
}

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

  // 年齢による指名優先度補正（素材型 vs 即戦力）
  // 若手はやや加点されるが、能力差を覆すほどではない
  const age = player.age || 22;
  let ageBonus = 0;
  if (age <= 18)      ageBonus = 10;
  else if (age <= 19) ageBonus = 7;
  else if (age <= 20) ageBonus = 4;
  else if (age <= 21) ageBonus = 2;
  else if (age <= 22) ageBonus = 0;   // 大卒基準
  else if (age <= 23) ageBonus = -3;
  else if (age <= 24) ageBonus = -8;
  else                ageBonus = -15;

  return rankScore + bonusScore + specialistScore + ageBonus;
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
    // (debug logging removed)
  }

  return scoredCandidates[0];
}

/**
 * 新規参入チーム用のロスター（24人）を自動生成
 * 既存リーグの平均的な戦力の選手を生成し、AIドラフトで選出
 * @param {number} year - 現在の年度
 * @param {number} rosterSize - ロスターサイズ（デフォルト24）
 * @returns {Array} 選手配列
 */
export function generateExpansionRoster(year = 1, rosterSize = 24) {
  const candidates = generateTryoutCandidates(year, 1, true);
  const roster = [];
  const remaining = [...candidates];

  for (let i = 0; i < rosterSize && remaining.length > 0; i++) {
    const pick = selectPlayerForAI(remaining, roster);
    if (!pick) break;
    const idx = remaining.findIndex(c => c.id === pick.id);
    if (idx >= 0) remaining.splice(idx, 1);
    roster.push(pick);
  }

  return roster;
}
