// ============================================================
// 打者のコース適性（25分割グリッド 段階2） - batterZone.js
//
// 段階1で投球位置は5×5=25セルになったが、打者側は「ゾーン内か外か」と
// 質ラベル(meatball/corner/good/edge/waste)しか見ていなかった。
// つまりどの打者も内角と外角を同じように打っていた。
//
// ここで打者に**内外角と高低の得手不得手**を持たせる。
//
// 【25セルを選手ごとに持たせてはいけない】
// 1人25個の数値は生成も較正も不可能で、セーブも膨らむ。
// `inside`（内角の苦手さ）と `low`（低めの苦手さ）の2数値だけを持ち、
// そこから25セル分の補正を線形に導出する。
//
//   inside = +1.0 … 内角に極端に弱い（＝外角には強い）
//   inside = -1.0 … 外角に極端に弱い（＝内角には強い。引っ張り一辺倒の打者）
//   low    = +1.0 … 低めに弱い（＝高めに強い）
//   low    = -1.0 … 高めに弱い（＝低めに強い）
//
// 【グリッドは打者から見た向き】
// col 0 が外角・col 4 が内角。左打者でも「その打者にとっての内角」が col 4。
// 捕手も打者を見て要求するので、この向きなら左右で場合分けする必要がない。
//
// 【なぜセーブに持たないか】
// 生成箇所は高校生プール・大学プール・トライアウト・社会人初期化…と散在しており、
// 左右の比率(handedness.js)で「生成元ごとに値がバラつく」事故を既に一度起こしている。
// コース適性は生涯変わらない先天的な特性なので、**選手の名前とIDから決定的に導出**する。
// これなら生成側を1行も触らずに全プールの全選手が持てて、既存セーブもそのまま動く。
// ============================================================

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** FNV-1a + avalanche。同じ文字列からは常に同じ値 */
function hash32(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

const unit = (h) => h / 4294967296;

/**
 * 一様乱数3つの平均で釣鐘型にする（Irwin-Hall）。
 * 範囲 -1〜+1、σ≈0.33。極端な弱点を持つ打者は稀にしか出ない。
 */
function bell(key, seed) {
  const a = unit(hash32(key, seed));
  const b = unit(hash32(key, seed ^ 0x9e3779b9));
  const c = unit(hash32(key, seed ^ 0x85ebca6b));
  return (a + b + c - 1.5) / 1.5;
}

export const NEUTRAL_ZONE_PROFILE = Object.freeze({ inside: 0, low: 0 });

const cache = new WeakMap();

/**
 * 打者のコース適性を得る。選手オブジェクトを変更しない（セーブに乗らない）。
 * @param {Object} player 選手オブジェクト
 * @returns {{inside:number, low:number}} それぞれ -1〜+1
 */
export function getZoneProfile(player) {
  if (!player) return NEUTRAL_ZONE_PROFILE;
  // 明示的に持っていればそれを優先する（将来の成長・矯正や検証用の差し替え）
  if (player.zoneProfile) return player.zoneProfile;
  const hit = cache.get(player);
  if (hit) return hit;
  // IDはチーム内でしか一意でない（players.js は 1〜9）ので名前と混ぜる
  const key = `${player.name || ''}#${player.id ?? 0}`;
  const profile = {
    inside: Math.round(bell(key, 0x01000193) * 100) / 100,
    low: Math.round(bell(key, 0x7feb352d) * 100) / 100,
  };
  cache.set(player, profile);
  return profile;
}

/**
 * セル座標を打者から見た軸に変換する。
 *   colAxis -1 = 外角いっぱい / +1 = 内角いっぱい
 *   rowAxis -1 = 高め       / +1 = 低め
 * グリッドの外（-1 や 5）は端に丸める。
 */
export const colAxis = (col) => clamp((col - 2) / 2, -1, 1);
export const rowAxis = (row) => clamp((row - 2) / 2, -1, 1);

// 苦手コースでどれだけミート・パワーが落ちるか。
// 質ラベルの corner(-7/-5) と同程度の幅になるよう合わせてある。
// これ以上大きくすると、コース適性が投手の制球より支配的になってしまう。
const MEET_SWING = 9;
const POWER_SWING = 7;

/**
 * 投球位置と打者のコース適性から、実効ミート・パワーの補正を返す。
 * 得意コースなら正、苦手コースなら負。母集団の平均は0なのでリーグ成績は動かない。
 *
 * @param {{col:number,row:number}} loc resolvePitchLocation の戻り値
 * @param {{inside:number,low:number}} profile getZoneProfile の戻り値
 */
export function getZoneMatchupEffect(loc, profile) {
  if (!loc || !profile) return { meet: 0, power: 0 };
  const { inside = 0, low = 0 } = profile;
  if (inside === 0 && low === 0) return { meet: 0, power: 0 };
  // 内外角と高低は足し合わせる。内角低めが弱点なら両方効いて最も苦手になる
  const weakness = clamp(inside * colAxis(loc.col) + low * rowAxis(loc.row), -1, 1);
  return {
    meet: -weakness * MEET_SWING,
    power: -weakness * POWER_SWING,
  };
}

/** 位置の質による補正とコース適性による補正を合算する */
export function combineBatterEffects(a, b) {
  return { meet: (a?.meet || 0) + (b?.meet || 0), power: (a?.power || 0) + (b?.power || 0) };
}

// ============================================================
// 表示用
// ============================================================

const level = (v) => (Math.abs(v) < 0.22 ? 0 : Math.abs(v) < 0.5 ? 1 : 2);

/**
 * 「内角に弱い」「低めが得意」といった短い説明を返す。
 * 弱点が無い（両方とも平均的な）打者は空配列。
 */
export function describeZoneProfile(profile) {
  const out = [];
  if (!profile) return out;
  const push = (v, weak, strong) => {
    const l = level(v);
    if (l === 0) return;
    const label = v > 0 ? weak : strong;
    out.push(l === 2 ? `${label}` : `やや${label}`);
  };
  push(profile.inside, '内角に弱い', '外角に弱い');
  push(profile.low, '低めに弱い', '高めに弱い');
  return out;
}

/**
 * 5×5の各セルの得手不得手を返す（表示用のヒートマップ）。
 * 値は -1（最も苦手）〜 +1（最も得意）。
 */
export function zoneHeatmap(profile) {
  const p = profile || NEUTRAL_ZONE_PROFILE;
  const grid = [];
  for (let row = 0; row < 5; row++) {
    const line = [];
    for (let col = 0; col < 5; col++) {
      line.push(-clamp(p.inside * colAxis(col) + p.low * rowAxis(row), -1, 1));
    }
    grid.push(line);
  }
  return grid;
}
