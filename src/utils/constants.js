// ============================================================
// 定数データ - constants.js
// 変化球の効果や物理計算の定数を定義
// ============================================================

/**
 * 変化球の効果設定
 * whiffBonus: 空振り率への影響
 * groundballBonus: ゴロ率への影響
 * weakBonus: 弱い打球への影響
 * velocityMinus: ストレートからの球速減少
 */
export const BALL_EFFECTS = {
  straight: {
    name: 'ストレート',
    whiffBonus: 0,
    groundballBonus: 0,
    weakBonus: -0.04,
    velocityMinus: 0
  },
  twoSeam: {
    name: 'ツーシーム',
    whiffBonus: -0.05,
    groundballBonus: 0.2,
    weakBonus: 0.12,
    velocityMinus: 5
  },
  slider: {
    name: 'スライダー',
    whiffBonus: 0.09,
    groundballBonus: 0.05,
    weakBonus: -0.02,
    velocityMinus: 12
  },
  curve: {
    name: 'カーブ',
    whiffBonus: 0.04,
    groundballBonus: 0.06,
    weakBonus: 0,
    velocityMinus: 23
  },
  fork: {
    name: 'フォーク',
    whiffBonus: 0.09,
    groundballBonus: 0.06,
    weakBonus: 0.13,
    velocityMinus: 17
  },
  changeup: {
    name: 'チェンジアップ',
    whiffBonus: 0.03,
    groundballBonus: 0.14,
    weakBonus: 0.02,
    velocityMinus: 21
  },
  sinker: {
    name: 'シンカー',
    whiffBonus: 0,
    groundballBonus: 0.15,
    weakBonus: 0.23,
    velocityMinus: 8
  },
  shoot: {
    name: 'シュート',
    whiffBonus: 0,
    groundballBonus: 0.19,
    weakBonus: 0.23,
    velocityMinus: 5
  },
  cutter: {
    name: 'カッター',
    whiffBonus: 0,
    groundballBonus: 0.17,
    weakBonus: 0.2,
    velocityMinus: 5
  },
  splitter: {
    name: 'スプリッター',
    whiffBonus: 0.09,
    groundballBonus: 0.05,
    weakBonus: 0.05,
    velocityMinus: 7
  },
  palm: {
    name: 'パーム',
    whiffBonus: 0.05,
    groundballBonus: 0.07,
    weakBonus: 0.11,
    velocityMinus: 22
  },
  knuckle: {
    name: 'ナックル',
    whiffBonus: 0.1,
    groundballBonus: 0.02,
    weakBonus: 0.15,
    velocityMinus: 30
  }
};

/**
 * 投球フォームの効果設定
 * velocityBonus: 球速への影響（km/h）
 * verticalBreakBonus: 縦変化への影響（カーブ、フォーク等の効果補正）
 * horizontalBreakBonus: 横変化への影響（スライダー、シュート等の効果補正）
 * whiffBonus: 空振り率への影響（サイドスロー・アンダースローは同じ利き腕の打者に対してのみ適用）
 *            例: 左サイドスローは左打者に強い、右アンダースローは右打者に強い
 */
export const PITCHING_FORM_EFFECTS = {
  overhand: {
    name: 'オーバースロー',
    velocityMult: 1.00,
    velocityGrowthMult: 1.1,       // 球速が伸びやすい
    controlGrowthMult: 0.9,        // 制球が伸びにくい
    verticalBreakBonus: 0.15,
    horizontalBreakBonus: 0,
    whiffBonus: 0
  },
  threeQuarter: {
    name: 'スリークォーター',
    velocityMult: 0.98,
    velocityGrowthMult: 1.0,
    controlGrowthMult: 1.0,
    verticalBreakBonus: 0.05,
    horizontalBreakBonus: 0.05,
    whiffBonus: 0
  },
  sidearm: {
    name: 'サイドスロー',
    velocityMult: 0.95,
    velocityGrowthMult: 0.9,       // 球速が伸びにくい
    controlGrowthMult: 1.1,        // 制球が伸びやすい
    horizontalBreakBonus: 0.15,
    verticalBreakBonus: -0.05,
    whiffBonus: 0.03
  },
  submarine: {
    name: 'アンダースロー',
    velocityMult: 0.92,
    velocityGrowthMult: 0.8,       // 球速が伸びにくい
    controlGrowthMult: 1.2,        // 制球が伸びやすい
    verticalBreakBonus: 0.1,
    horizontalBreakBonus: 0.05,
    whiffBonus: 0.05
  }
};

/**
 * 投球フォームと相性の良い変化球（ボーナス適用）
 */
export const FORM_PITCH_SYNERGY = {
  overhand: ['curve', 'fork', 'splitter', 'knuckle'],      // 縦変化
  threeQuarter: [],                                         // すべて平均的
  sidearm: ['slider', 'shoot', 'cutter', 'twoSeam'],       // 横変化
  submarine: ['sinker', 'curve', 'palm']                    // 浮き上がり系
};

export const POSITION_ORDER = ['pitcher', 'catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'];
export const getPositionSortIndex = (pos) => { const i = POSITION_ORDER.indexOf(pos); return i >= 0 ? i : 99; };

/**
 * ポジション名（日本語表記）
 */
export const POSITION_NAMES = {
  pitcher: '投',
  catcher: '捕',
  first: '一',
  second: '二',
  third: '三',
  short: '遊',
  left: '左',
  center: '中',
  right: '右',
  dh: 'DH'
};

/**
 * ベンチ（控え）を並べる順。**野手を守備位置順に並べ、投手は最後**。
 * 交代要員を探すときは「捕手の控えは誰か」「内野の控えは誰か」を見るので、
 * ロスター順のままだと投手と野手が混ざって探せない。
 *
 * ⚠ **DHは守備位置ではない**。「打撃に優れ守備が苦手な選手が入る打順」なので、
 * ここに枠を作ってはいけない。`position: 'dh'` は打線のエントリ側だけの概念で、
 * 選手の `position` としては `saveMigration.normalizePlayer` が実ポジションへ
 * 寄せている（旧セーブ対策）。万一残っていたら守備適性から解決する。
 */
export const BENCH_POSITION_ORDER = {
  catcher: 0, first: 1, second: 2, third: 3, short: 4,
  left: 5, center: 6, right: 7, pitcher: 8,
};

/** 守備適性が最も高いポジション。position が守備位置でない選手の保険 */
const bestFieldingPosition = (player) => {
  const f = player?.positionFitness;
  if (!f) return 'first';   // 守備の弱い選手を置く定位置
  let best = 'first', max = -1;
  for (const pos of Object.keys(BENCH_POSITION_ORDER)) {
    const v = f[pos] ?? 0;
    if (v > max) { max = v; best = pos; }
  }
  return best;
};

const benchRank = (player) => {
  const r = BENCH_POSITION_ORDER[player?.position];
  return r !== undefined ? r : BENCH_POSITION_ORDER[bestFieldingPosition(player)];
};

/**
 * 控え選手をポジション順に並べ替える（元配列は変更しない）。
 * 同じポジション内はロスター順のまま（Array#sort は安定ソート）。
 */
export const sortBenchByPosition = (players) =>
  [...players].sort((a, b) => benchRank(a) - benchRank(b));

/**
 * 併殺の成立率（内野守備50・走者の足55のときの%）。
 * 実NPBの併殺は約0.70/チーム/試合。**判定は「内野ゴロのアウト」だけを対象にする**
 * （外野へ抜けた打球はそもそもアウトにならないので距離の条件は要らない）。
 * judgeFielderReach のゴロ捕球率と両方効くので、ゴロの較正を変えたら測り直すこと。
 */
export const DP_BASE = 34;

/**
 * 球種キー → 日本語名。**`BALL_EFFECTS` を唯一の出典にする**。
 *
 * 以前は App.jsx（予告先発）・DraftResultScreen・campTraining が
 * それぞれ独自の対応表を持っており、App.jsx の表だけが
 *   - `knuckleball` という**存在しないキー**（実際は `knuckle`）
 *   - `twoSeam` / `palm` が抜けている
 *   - `splitter` が「スプリット」（他は「スプリッター」）
 * という状態で、ナックルが `knuckle` と生のアルファベットで表示されていた。
 * 球種を1つ足すたびに4箇所直す形になっていたので、ここに集約する。
 */
export const getPitchTypeName = (type) => BALL_EFFECTS[type]?.name || type;

// ============================================================
// 打席結果バッジ
//
// `addAtBatResult` に渡る文字列は 安打 / 二塁打 / 遊ゴロ / ライナー … と
// 長さがまちまちで、そのまま並べるとバッジの幅が揃わない。数が増えると
// 折り返して打順の行がガタガタになる。
//
// **枠を3文字幅に固定し、2文字の結果は均等割り付けで埋める**
// （`text-align-last: justify`）。1文字まで削ると何のことか分からないので、
// 読める長さを保ったまま幅だけ揃えるのがちょうどいい。
// ============================================================

/** 3文字を超える表記だけ、意味を保ったまま3文字以内に畳む */
const AT_BAT_RESULT_LABEL = {
  併殺: '併殺打',
};

/** バッジに出す表記（2〜3文字）。元の文字列はそのまま `title` に出すこと */
export const formatAtBatResult = (label) => {
  if (!label) return '';
  const fixed = AT_BAT_RESULT_LABEL[label];
  if (fixed) return fixed;
  if (label.length <= 3) return label;
  // 想定外の長い表記（守備位置が取れなかった凡打など）は打球種別だけ残す
  if (label.includes('ライナー')) return '直線';
  if (label.includes('ゴロ')) return 'ゴロ';
  if (label.includes('フライ')) return '飛球';
  return label.slice(0, 3);
};

/** 打席結果バッジの背景色。安打=黄 / 本塁打=赤 / 三振=青 / 四死球=緑 / 併殺=紫 */
export const atBatResultColor = (label) => {
  if (label === '本塁打') return 'bg-red-600';
  if (label === '安打' || label === '二塁打' || label === '三塁打') return 'bg-yellow-600';
  if (label === '三振') return 'bg-blue-700';
  if (label === '四球') return 'bg-green-700';
  if (label === '死球') return 'bg-emerald-800';
  if (label === '併殺') return 'bg-purple-700';
  return 'bg-gray-600';
};

/**
 * ポジション別の色設定（背景色）
 */
export const POSITION_COLORS = {
  pitcher: 'bg-red-600 text-white',
  catcher: 'bg-blue-600 text-white',
  first: 'bg-yellow-600 text-white',
  second: 'bg-yellow-600 text-white',
  third: 'bg-yellow-600 text-white',
  short: 'bg-yellow-600 text-white',
  left: 'bg-green-600 text-white',
  center: 'bg-green-600 text-white',
  right: 'bg-green-600 text-white',
  dh: 'bg-purple-600 text-white'
};

/**
 * 利き手ラベル（日本語表記）
 */
export const HAND_LABELS = {
  right: '右',
  left: '左',
  switch: '両'
};

/**
 * ポジション名（フル表記）
 */
export const POSITION_NAMES_FULL = {
  pitcher: 'ピッチャー',
  catcher: 'キャッチャー',
  first: 'ファースト',
  second: 'セカンド',
  third: 'サード',
  short: 'ショート',
  left: 'レフト',
  center: 'センター',
  right: 'ライト'
};

/**
 * 能力値 → ランク変換（S〜F）
 */
export const getAbilityRank = (value, isPitcherVelocity = false, isStamina = false) => {
  let v = value;
  if (isPitcherVelocity) v = (value - 115) * 2.5;
  else if (isStamina) v = value / 2;
  if (v >= 90) return 'S';
  if (v >= 80) return 'A';
  if (v >= 70) return 'B';
  if (v >= 60) return 'C';
  if (v >= 50) return 'D';
  if (v >= 40) return 'E';
  return 'F';
};

/**
 * ランク → テキスト色クラス
 */
export const getRankColor = (rank) => ({
  S: 'text-pink-400',
  A: 'text-red-400',
  B: 'text-orange-400',
  C: 'text-yellow-400',
  D: 'text-green-400',
  E: 'text-blue-400',
  F: 'text-gray-400'
}[rank] || 'text-gray-400');

/**
 * 能力値 → 色クラス（数値表示用）
 */
/**
 * growthModifier を安全に加減算するユーティリティ
 */
export const adjustGrowthModifier = (player, delta) => {
  player.growthModifier = Math.round(((player.growthModifier || 0) + delta) * 100) / 100;
};

/**
 * 疲労度に応じた成長率ペナルティ（摩耗）を返す。
 *   〜40: なし / 41〜60: -0.01 / 61〜80: -0.02 / 81〜: -0.03
 * 適用条件は呼び出し側で判定する:
 *   野手 = スタメン出場した試合のみ（代打・代走・守備固めは対象外）
 *   投手 = 10球以上投げた登板のみ（10球以下のワンポイントは対象外）
 */
export const getFatigueGrowthPenalty = (fatigue) => {
  const f = fatigue || 0;
  if (f <= 40) return 0;
  if (f <= 60) return -0.01;
  if (f <= 80) return -0.02;
  return -0.03;
};

/** 疲労ペナルティを条件付きで適用する（applied=false なら何もしない） */
export const applyFatigueGrowthPenalty = (player, applied) => {
  if (!applied) return 0;
  const penalty = getFatigueGrowthPenalty(player?.fatigue);
  if (penalty !== 0) adjustGrowthModifier(player, penalty);
  return penalty;
};

/**
 * 能力値 → 色クラス（数値表示用）
 */
export const getAbilityColor = (value) => {
  if (value >= 90) return 'text-pink-400';
  if (value >= 80) return 'text-red-400';
  if (value >= 70) return 'text-orange-400';
  if (value >= 60) return 'text-yellow-400';
  if (value >= 50) return 'text-green-400';
  if (value >= 40) return 'text-blue-400';
  return 'text-gray-400';
};

const FIELD_POSITIONS_FOR_UTILITY = ['catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'];

/**
 * ユーティリティ度（守備の幅）: メイン以外に守れるポジションの数と質を 0-100 で返す。
 * 守備適性60以上のサブポジについて (適性-50) を加算。
 * 例) 75の適性を3ポジ → 75 / 65を2ポジ → 30 / 単能力なら 0。
 * 投手は 0。
 */
export const getUtilityScore = (player) => {
  if (!player || player.position === 'pitcher') return 0;
  const pf = player.positionFitness || {};
  const main = player.position;
  let score = 0;
  for (const pos of FIELD_POSITIONS_FOR_UTILITY) {
    if (pos === main) continue;
    const f = pf[pos] || 0;
    if (f >= 60) score += (f - 50);
  }
  return Math.max(0, Math.min(100, score));
};

/**
 * 捕手のリード（配球）能力を生成する。
 *
 * 従来は生成箇所ごとに狭い一様分布だった（トライアウト35-70 / 大学25-55 /
 * 補充30-50）。実在する捕手が25〜70に収まり中央45という狭さのため、
 * 配球の仕組みを整えても「良い捕手」と「悪い捕手」の差が出しようがなかった。
 *
 * 正規分布 N(48, 18) を 5〜95 で切って、突出した捕手が稀に出るようにする。
 * 平均は据え置き（リーグ全体の成績は変わらない）。
 *   ±1σ: 30〜66 / ±2σ: 12〜84 / 90超は約1%
 */
export const generateCatcherLead = () => {
  const u1 = Math.random() || 0.0001;
  const u2 = Math.random();
  const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(5, Math.min(95, Math.round(48 + normal * 18)));
};
