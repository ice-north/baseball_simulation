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
  // `shape` は足切りなしの「自分の中での突出」。
  // ⚠ **進路の振り分けにはこちらを使う**。`spike` はプール平均+0.9σ を下回ると 0 に
  //    なるので、**能力の低い一芸型（走力だけ速い高校生など）が全員 0 になる**。
  //    ドラフトのバッジは「本当にスバ抜けているか」を見たいので足切りが要るが、
  //    アマチュアの進路は「その選手の中で何が武器か」の話で、水準は別の軸。
  const shape = cnt ? Math.min(SPIKE_CAP, Math.max(0, top - sum / cnt)) : 0;
  if (!cnt || top < TOP_MIN) {
    return { spike: 0, shape, top: cnt ? top : 0, topTool: null, label: '', noun: '', devs };
  }
  return { spike: shape, shape, top, topTool, label: TOOL_LABELS[topTool] || '', noun: TOOL_NOUNS[topTool] || '', devs };
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
//
// **一芸指名で実際に獲れる選手（4シード・狙った道具の実値の中央値）**
//   守備 **90** / 肩 **97** / 走力 **96** / リード **93** / 制球 **80** /
//   走塁 78 / スタミナ 148 / 球速 149km
// 守備60が「プロの及第点」なので、守備90は文字どおりスバ抜けた水準。
// ============================================================

/** 巡目ごとの一芸指名の確率。1〜2位は従来どおり総合力で最善を取る */
const TOOL_HUNT_RATE_BY_ROUND = [0, 0, 0.30, 0.45, 0.60, 0.75];
export const TOOL_HUNT_RATE_IKU = 0.80;
export const toolHuntRateForRound = (round) =>
  TOOL_HUNT_RATE_BY_ROUND[Math.min(round, TOOL_HUNT_RATE_BY_ROUND.length) - 1] ??
  TOOL_HUNT_RATE_BY_ROUND[TOOL_HUNT_RATE_BY_ROUND.length - 1];

// ============================================================
// ⚠ **一芸指名は「総合点に加点する」形では成立しない**
//
// 道具の偏差 ×35pt を総合点に足す実装では、指名される一芸型は
// 「元々総合点が高く、たまたまその道具でも1位だった選手」に偏った。
// 候補の総合点は 80〜400 と幅が8σ近くあるので、+3σ の道具（+105pt）でも
// 上位の総合点差をひっくり返せない。実測で **プールのその道具の上位20人が
// 指名される割合はわずか 7〜12%**（制球だけ50%。制球は総合点にも厚いため）。
// つまり 甲斐拓也（育成6位・強肩捕手）や 周東佑京（育成2位・俊足）のような
// 「他は平凡だが1つだけスバ抜けている」選手はほぼ全員が指名から漏れていた。
//
// **単位を揃えて重みで比べる**。総合点も候補プールの中で偏差(z)に直し、
//   一芸指名の並び = 道具の偏差 + 総合点の偏差 × HUNT_SCORE_W
// とする。HUNT_SCORE_W を1未満にすることで初めて「道具が主・総合点が従」になる。
// 総合点は0にしない——完全に無視すると、その道具しか取り柄のない
// 「プロでは通用しない選手」まで上がってくる。
//
// **効果（4シード・一芸指名で獲れた選手の実値の中央値）**
//   | 道具 | 加点方式 | **偏差方式** |
//   |---|---|---|
//   | 守備 | 80 | **90** |
//   | 肩   | 85 | **97** |
//   | 走力 | 86 | **96** |
//   | リード | 81 | **93** |
//   | 走塁 | 64 | **78** |
//   | 制球 | 73 | **80** |
// 育成指名の平均総合点は 311 → 292 に下がる。**これは意図どおり**——
// 総合力では劣るが1つスバ抜けている選手を獲りに行っているということ。
// ============================================================

/** 一芸指名のとき、総合点(偏差)を道具の偏差に対してどれだけ重く見るか */
export const HUNT_SCORE_W = 0.35;

// ⚠ **年齢が上がるほど「道具だけ」では通さない**。
//   甲斐拓也・周東佑京のような一芸指名は**高卒の話**で、素材に賭けている。
//   同じことを26歳の社会人にやると「他は平凡なまま歳だけ取った選手」を
//   下位で拾うことになり、**下位・育成の指名ラインが年齢とともに下がる**。
//   実測（能力偏差値の下限）: 22歳 68.4 に対し 24〜29歳 59.3〜64.6 で、
//   **その年齢帯のプール平均(59〜63)すら下回っていた**。
//   総合点の重みを年齢で上げると、年上の一芸型には「道具＋土台」を要求できる。
//   若い一芸型（甲斐・周東型）の経路は 0.35 のまま残る。
const HUNT_SCORE_W_MATURE = 0.90;
export function huntScoreWeight(age = 20) {
  if (age <= 19) return HUNT_SCORE_W;
  if (age >= 26) return HUNT_SCORE_W_MATURE;
  return HUNT_SCORE_W + (HUNT_SCORE_W_MATURE - HUNT_SCORE_W) * (age - 19) / 7;
}

/** 総合点の平均・σ（候補プールから毎回作る。ここでも固定の表は持たない） */
export function scoreStats(scores) {
  const n = scores.length || 1;
  const mean = scores.reduce((a, b) => a + b, 0) / n;
  const varr = Math.max(0, scores.reduce((a, b) => a + b * b, 0) / n - mean * mean);
  return { mean, sd: Math.sqrt(varr) || 1 };
}

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

/**
 * ポジション別の守備価値。センターラインほど厚く、一塁・左翼は薄い。
 *
 * ⚠ **この表は `npbCareer.evaluateNpbAbility` と共有する**。スカウトが下位で
 *    守備型を探すときの物差しと、プロで生き残れるかの物差しが別々だと
 *    「一芸で獲ったのに評価されない」が再発する。表を二重に作らないこと。
 */
export const POSITION_GLOVE_WEIGHT = {
  catcher: { def: 0.30, arm: 0.16, lead: 0.20 },
  short:   { def: 0.30, arm: 0.10 },
  center:  { def: 0.26, arm: 0.06 },
  second:  { def: 0.24, arm: 0.05 },
  third:   { def: 0.20, arm: 0.09 },
  right:   { def: 0.16, arm: 0.11 },
  left:    { def: 0.14, arm: 0.04 },
  first:   { def: 0.10, arm: 0.02 },
};
// ⚠ **最大値で正規化する（倍率は必ず1以下）**。三塁を1.0にすると捕手が
//    守備1.5倍・肩1.78倍になり、守備系の一芸指名40件のうち**31件が捕手**に集中して
//    指名全体の捕手シェアが 8%→12%（実NPB 8%）に膨らんだ。
//    「守る場所で価値が変わる」は**要らない場所を減点する**形で表現すれば足りる。
const GLOVE_TOOL_KEY = { defense: 'def', arm: 'arm', lead: 'lead' };
const GLOVE_REF = { def: 0.30, arm: 0.16, lead: 0.20 };
/**
 * その道具の偏差。
 * ⚠ **守備系は守る場所で価値が変わる**。素の偏差だけで並べると
 *    「守備90の一塁手」が「守備85の遊撃手」に勝ってしまい、
 *    源田型（守れる遊撃）ではなく「動けないが捕球は上手い選手」が獲れる。
 */
export const toolDevOf = (devs, tool, position) => {
  const d = (devs && devs[tool]) || 0;
  const key = GLOVE_TOOL_KEY[tool];
  if (!key || !position || d <= 0) return d;
  const w = POSITION_GLOVE_WEIGHT[position];
  if (!w) return d;
  return d * ((w[key] || 0) / GLOVE_REF[key]);
};

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
