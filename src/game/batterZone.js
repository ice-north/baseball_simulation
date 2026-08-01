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

import { colAxis, rowAxis } from './pitchZone.js';

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
// ミートとパワーのバランスから来る内外角の得手不得手。
//
//   パワーが無い技巧派 … 内角を捌けない（詰まる）
//   ミートが無い長距離砲 … 外角を捉えられない（泳ぐ・引っ掛ける）
//
// これが無いと、内角は「引っ張り方向に飛ばす球」でしかなくなり、
// パワー35の打者でも引っ張りの飛距離ボーナスを受け取ってしまう。
// 実測（ミート75/パワー35の打者）で**内角の方が長打になっていた**
// （塁打/打球 0.451 対 外角0.394、本塁打 1.69% 対 0.50%）。
// 現実の「技巧派は内角で詰まらせる」と逆で、打者のタイプに関わらず
// 「常に外角が正解」になり、内外角の使い分けが成立していなかった。
//
// 先天的な得手不得手（ハッシュ由来 σ0.337）と同じ `inside` に足し込むので、
// 段階2の打撃補正・段階3の捕手の弱点狙い・選手詳細のヒートマップに
// 追加の配線なしで全部反映される。
// **中心は「平均的な打者」に合わせる**。生成される野手はミートがパワーより
// 平均で11ほど高いので、素の (meet - power) を使うとリーグ全員が
// 「内角に弱い」側に寄ってしまう（実測 平均+0.108）。実データの打者は
// 平均するとむしろ外角が苦手なので、向きとしても逆になる。
// ここは絶対値ではなく**打者間の相対差**を表す項なので、平均を引く。
const TENDENCY_W = 1.0;
const TENDENCY_MID = 10;
const tendencyInside = (b) =>
  b ? (((b.meet ?? 50) - (b.power ?? 50)) - TENDENCY_MID) / 100 * TENDENCY_W : 0;

export function getZoneProfile(player) {
  if (!player) return NEUTRAL_ZONE_PROFILE;
  // 明示的に持っていればそれを優先する（将来の成長・矯正や検証用の差し替え）
  if (player.zoneProfile) return player.zoneProfile;
  const b = player.batting;
  const hit = cache.get(player);
  // 成長でミート・パワーが動いたら作り直す（キャッシュが古くなるため）
  if (hit && hit.m === (b?.meet ?? -1) && hit.p === (b?.power ?? -1)) return hit.profile;
  // IDはチーム内でしか一意でない（players.js は 1〜9）ので名前と混ぜる
  const key = `${player.name || ''}#${player.id ?? 0}`;
  const r2 = (v) => Math.round(clamp(v, -1, 1) * 100) / 100;
  const profile = {
    inside: r2(bell(key, 0x01000193) + tendencyInside(b)),
    low: r2(bell(key, 0x7feb352d)),
  };
  cache.set(player, { profile, m: b?.meet ?? -1, p: b?.power ?? -1 });
  return profile;
}

// セル座標→打者から見た軸の変換はグリッド側（pitchZone.js）が持つ
export { colAxis, rowAxis };

// 苦手コースでどれだけミート・パワーが落ちるか。
// 実データの打者はストライクゾーン内の得意ゾーンと苦手ゾーンで打率が倍近く違う。
// 質ラベルの corner(-7/-5) と同程度に留めると、平均的な打者（|v|≈0.34）では
// 実効ミートが±3程度しか動かず、弱点という言葉に見合わなかった。
// これ以上大きくすると、コース適性が投手の制球より支配的になってしまう。
const MEET_SWING = 13;
const POWER_SWING = 10;

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
