// ============================================================
// 「一芸」を測る - scoutTools.js
//
// 【なぜ必要か】ドラフトの指名順は `checkNPBDraftEligibility` の総合点だけで
// 決まっていた。総合点は能力の重み付き和なので、**上から取ると必ず
// 「全部そこそこ高い選手」が並ぶ**。実際のNPBドラフトは上位こそ総合力だが、
// 下位・育成では「守備だけは一軍」「50m5秒台」「鉄砲肩の捕手」「ノーコンだが160km」
// のように **1つの道具で勝負する選手** が指名される。
//
// 【指名は「道具を決めてから探す」／掲示は「尖り」で決める】
//   選ぶ  … `toolDevOf` … 引いた道具の偏差を評価点に足して並べ替える（下の節）
//   見せる … `spike`（最も高い道具 − 道具全体の平均）… バッジを出すかの判定だけ
// 2つを取り違えないこと。spike で選ぶと球速・パワーの選手が増えるだけになる
// （下の節に実測を残してある）。
//   五ツ道具型: 全部 +2.0σ → 尖り 0.0
//   守備職人  : 守備 +2.5σ / 他 -0.5σ → 尖り **約2.6**
//
// 【物差しは候補プールから毎回作る】固定の平均・σを表に持たない。
// 能力の生成分布はプールごとに違う（高校生・大学・社会人・独立が混ざる）し、
// 生成側を触るたびに表が腐る。`buildToolNorms` が指名候補そのものから
// 群（投手/捕手/野手）ごとの平均・σを取る。**新しい分布表を作らないこと**。
//
// ⚠ **ドラフトの巡目にだけ掛けること**。トレードの等価交換は
// `playerValue.deviationValue` をそのまま使う（`DRAFT_DEMAND` と同じ扱い）。
// 道具の加点は「その巡目で誰を選ぶか」の話であって、選手の価値そのものではない。
//
// ⚠ **出どころ(deception)・回転(spinRate)は入れない**。ラジャーガンで測れない
//   資質はスカウトにも見えない、という既存の切り分けを崩さないため。
// ============================================================

import { pitchOwnValue } from './pitchCalling.js';
import { valueGroup } from './playerValue.js';

/** 決め球の価値。`draftAbilityScore` と同じ `pitchOwnValue` を使う（物差しを二重に作らない） */
const bestBreakingValue = (player) => (player?.pitching?.arsenal || [])
  .filter(a => a.type !== 'straight')
  .reduce((m, a) => Math.max(m, pitchOwnValue(a.type, a.level || 0)), 0);

const BATTER_TOOLS = [
  { key: 'meet',    label: '巧打',   noun: '安打製造機',     get: p => p.batting?.meet },
  { key: 'power',   label: '長打力', noun: 'スラッガー',     get: p => p.batting?.power },
  { key: 'eye',     label: '選球眼', noun: '出塁マシン',     get: p => p.batting?.eye },
  { key: 'speed',   label: '俊足',   noun: '快足',           get: p => p.physical?.speed },
  { key: 'steal',   label: '走塁',   noun: '走塁のスペシャリスト', get: p => p.batting?.steal },
  { key: 'defense', label: '守備',   noun: '守備のスペシャリスト', get: p => p.fielding?.defense },
  { key: 'arm',     label: '強肩',   noun: '鉄砲肩',         get: p => p.physical?.arm },
];

const CATCHER_TOOLS = [
  ...BATTER_TOOLS,
  { key: 'lead', label: 'リード', noun: '扇の要', get: p => p.catching?.lead },
];

const PITCHER_TOOLS = [
  { key: 'velocity', label: '球速',   noun: '剛速球',       get: p => p.pitching?.velocity },
  { key: 'control',  label: '制球',   noun: '精密機械',     get: p => p.pitching?.control },
  { key: 'breaking', label: '変化球', noun: '決め球',       get: bestBreakingValue },
  { key: 'stamina',  label: 'スタミナ', noun: 'イニングイーター', get: p => p.pitching?.stamina },
];

export const toolsFor = (group) => group === 'P' ? PITCHER_TOOLS
  : group === 'C' ? CATCHER_TOOLS : BATTER_TOOLS;

/** 道具の日本語名（表示・球団の好み用） */
export const TOOL_LABELS = Object.fromEntries(
  [...PITCHER_TOOLS, ...CATCHER_TOOLS].map(t => [t.key, t.label]));
export const TOOL_NOUNS = Object.fromEntries(
  [...PITCHER_TOOLS, ...CATCHER_TOOLS].map(t => [t.key, t.noun]));

/**
 * 指名候補そのものから群×道具の平均・σを作る。
 * @param {Array} players 選手（またはそれを持つオブジェクト）の配列
 * @param {(x)=>Object} pick 選手を取り出す関数
 */
export function buildToolNorms(players, pick = (x) => x) {
  const acc = {};
  for (const item of players) {
    const p = pick(item);
    if (!p) continue;
    const g = valueGroup(p);
    for (const t of toolsFor(g)) {
      const v = t.get(p);
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      const k = `${g}|${t.key}`;
      const a = acc[k] || (acc[k] = { n: 0, s: 0, s2: 0 });
      a.n++; a.s += v; a.s2 += v * v;
    }
  }
  const norms = {};
  for (const [k, a] of Object.entries(acc)) {
    const mean = a.s / a.n;
    const varr = Math.max(0, a.s2 / a.n - mean * mean);
    // σが潰れている道具（全員同じ値）は尖りを作れないので効かせない
    norms[k] = { mean, sd: Math.sqrt(varr) || 0, n: a.n };
  }
  return norms;
}

// 最高の道具がプール平均から見てこの水準に達していない選手は、
// バランスが悪いだけで「一芸」ではない
const TOP_MIN = 0.9;
// 上振れした1人が指名を独占しないための上限
const SPIKE_CAP = 3.0;

/**
 * 選手の「尖り」を測る。
 * @returns {{spike:number, top:number, topTool:string|null, label:string, noun:string, devs:Object}}
 */
export function toolProfile(player, norms) {
  const g = valueGroup(player);
  const tools = toolsFor(g);
  const devs = {};
  let sum = 0, cnt = 0, top = -Infinity, topTool = null;
  for (const t of tools) {
    const n = norms[`${g}|${t.key}`];
    const v = t.get(player);
    if (!n || !n.sd || typeof v !== 'number' || !Number.isFinite(v)) continue;
    const d = (v - n.mean) / n.sd;
    devs[t.key] = d;
    sum += d; cnt++;
    if (d > top) { top = d; topTool = t.key; }
  }
  if (!cnt || top < TOP_MIN) {
    return { spike: 0, top: cnt ? top : 0, topTool: null, label: '', noun: '', devs };
  }
  const spike = Math.min(SPIKE_CAP, Math.max(0, top - sum / cnt));
  return { spike, top, topTool, label: TOOL_LABELS[topTool] || '', noun: TOOL_NOUNS[topTool] || '', devs };
}

// ============================================================
// 下位・育成は「道具を探しに行く」（一芸指名）
//
// ⚠ **尖り(spike)を総合点に足すだけでは駄目だった**。総合点そのものが
//    球速とパワーに厚い重みを持つので、その2つの道具は
//    「総合点が高い」と「尖っている」を**二重に取る**。実測（3シード）で
//    育成の一芸型は 57%→83% に増えたのに、道具の内訳は
//    `球速18 パワー14 肩3 守備2` → `球速22 パワー17 肩8 俊足5` と、
//    **依然として球速・パワーの選手が増えただけ**だった。
//    ユーザーが見たいのは守備職人・走塁屋・鉄砲肩の捕手・超制球投手なので、
//    「総合点の高い順」の土俵で戦わせている限り出てこない。
//
// 実際のスカウトは下位で「この枠は守れる内野手が欲しい」と**道具を決めてから**
// 一番の選手を探す。指名ごとに確率で道具を1つ引き、その道具の偏差で並べ替える。
// 総合点は残す（`MIN_DRAFT_SCORE` の足切りも効いている）ので、
// 「守備は良いがどうしようもない選手」は入ってこない。
// ============================================================

/** 巡目ごとの一芸指名の確率。1〜2位は従来どおり総合力で最善を取る */
const TOOL_HUNT_RATE_BY_ROUND = [0, 0, 0.30, 0.45, 0.60, 0.75];
export const TOOL_HUNT_RATE_IKU = 0.80;
export const toolHuntRateForRound = (round) =>
  TOOL_HUNT_RATE_BY_ROUND[Math.min(round, TOOL_HUNT_RATE_BY_ROUND.length) - 1] ??
  TOOL_HUNT_RATE_BY_ROUND[TOOL_HUNT_RATE_BY_ROUND.length - 1];

// 道具の偏差1σを評価点に換算する係数。候補の総合点はσ40前後なので、
// +3σ の道具で +105pt ≒ 2巡ぶんの総合点差をひっくり返せる水準。
//
// 実測（下位4位以降＋育成・8シード計約480名。左が従来、右が一芸指名あり）:
//   守備60+ 11.9→**14.9%** / 走力70+ 4.6→**11.7%** / 肩70+ 4.0→**7.1%** /
//   選球眼60+ 2.7→**6.1%** / 制球65+ 17.3→**20.5%**
//   「最も強い道具」のエントロピー 2.06→**2.25**（12種の上限2.48）、
//   球速が最強の選手 32%→**21%**
export const TOOL_HUNT_BONUS = 35;

/**
 * 探す道具を引く。
 *
 * ⚠ **12種から一様に引いてはいけない**。投手の道具は4種（球速・制球・変化球・
 *    スタミナ）、野手は8種なので、一様だと一芸指名の3分の2が野手になる。
 *    実測で指名の投手シェアが **58% → 47%**（実NPB 概ね55%）まで落ちた。
 *    先に「投手を探すか野手を探すか」を決めてから、その中の道具を引く。
 */
const PITCHER_TOOL_KEYS = PITCHER_TOOLS.map(t => t.key);
const BATTER_TOOL_KEYS = CATCHER_TOOLS.map(t => t.key);   // リードを含む＝捕手も対象
const HUNT_PITCHER_SHARE = 0.55;
export const randomHuntTool = () => {
  const keys = Math.random() < HUNT_PITCHER_SHARE ? PITCHER_TOOL_KEYS : BATTER_TOOL_KEYS;
  return keys[Math.floor(Math.random() * keys.length)];
};

/** その道具の偏差（持たない群の選手は 0＝総合点だけで並ぶ） */
export const toolDevOf = (devs, tool) => (devs && devs[tool]) || 0;

/**
 * 指名理由に「一芸」として掲示するかどうか。
 *
 * ⚠ **選ぶ基準と見せる基準は別**。候補プールには5000人の高校生が入っているので、
 *    指名される選手はほぼ全員どれかの道具が +1.2σ を超える。それをそのまま
 *    掲示すると全指名に一芸バッジが付いて情報量が消える（実測 1位でも100%）。
 *    掲示は「その道具が図抜けている ＋ **他の道具より突出している**」ときだけにする。
 *    ここで初めて `spike`（最高の道具 − 道具全体の平均）が役に立つ。
 *    実測の指名選手の spike は 中央値1.54 / 75%点1.99 なので、
 *    1.9 でおよそ上位4分の1＝「バッジが付いたら本当に尖っている」水準。
 */
export const isSpecialist = (dev, spike) => (dev || 0) >= 1.8 && (spike || 0) >= 1.9;
