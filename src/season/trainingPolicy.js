// ============================================================
// 育成方針 - trainingPolicy.js
//
// ⚠⚠ **まだ画面に接続していない**。設計の中核である
//     「能力が低いほど一芸、高いほど全体」が**実測で成立しなかった**ため、
//     報酬側（どこで一芸が報われるか）を決めるまで live にしない。
//     実測は下記「⚠ measured: 原理が成立していない」を読むこと。
//
// 【なぜ必要か】キャンプは「選手ごとにメニューを選ぶ」だけだった。
// 24人 × 4クール × (メイン+サブ) で年200回の選択があり、画面には
// 「全員に一括」ボタンがある——**プレイヤーが作業だと感じている証拠**。
// そのうえ選び方の巧拙が選手の将来を変えないので、指導者の仕事が存在しなかった。
//
// 指導者の仕事を **方向性 × フェーズ** の2軸に畳む。
//
//        │ 基礎体力        技術          幅
//   ─────┼──────────────────────────────────────
//   長所 │ 武器の土台      武器を磨く    武器を増やす
//   全体 │ 満遍なく鍛える  満遍なく      引き出しを増やす
//   短所 │ 弱点の土台      弱点を埋める  弱点を別の形で補う
//
// 【設計の核: 能力が低いほど一芸、高いほど全体】
// 大手企業とベンチャーの関係と同じ。**ベンチャーは尖った商品で突破を図り、
// 大手はどっしり構える**。能力の低い選手が満遍なく伸ばしても誰の目にも留まらない。
// 1つ図抜けたものを作るのが唯一の突破口になる。逆に総合力のある選手が
// 1点に賭けると、他が痩せて壊れやすくなる。
//
// ⚠ **この原理は新しい係数で作らない**。既存の成長減衰がすでに実装している:
//     技術系は75以上で 1ptごとに4%減衰（下限15%）／フィジカル系は80以上で3%
//   つまり
//     能力55の長所を磨く → 減衰なしで満額伸びる（一芸が作れる）
//     能力85の長所を磨く → 15〜40%しか伸びない（労力の無駄）
//   方針の軸を用意するだけで、正解が選手の水準で反転する。
//   **係数を足して原理を作ろうとしないこと**——二重になって較正が壊れる。
//
// ============================================================
// ⚠ measured: 原理が成立していない（2026-08、要設計判断）
//
// 上の理屈は正しく見えるが、**実際に育てた選手を本物のドラフトに投入すると
// 逆の結果になる**。各条件100名・4年間フルで同じ方針・実プール5000人に混ぜて実測:
//
//   　　　　　長所を伸ばす   全体を伸ばす   短所を埋める
//   低能力          0%            0%            0%
//   中能力          0%            0%            0%
//   高能力         16%           99%           69%
//
// 分かったこと3つ:
//  1. **低・中能力の選手は何をしても指名されない**。キャンプ4年で1能力を
//     +30 動かせるが、プール上位はそもそも生まれつき+60の位置にいる。
//     つまり**大半の選手にとって育成方針は結果を1つも変えない**——
//     これは一芸の話以前に、育成システム全体の問題。
//  2. 高能力では **全体99% ＞ 短所69% ＞ 長所16%**。長所に絞ると総合点が落ち、
//     上位指名の土俵から降りてしまう。一芸指名は1回のドラフトで45件しかなく、
//     12種の道具に割ると救済枠として薄すぎる。
//  3. **総合点は正の重みの和なので、集中が勝つ余地が構造的に無い**。
//     どんな係数を足しても「分散させたほうが総合点が高い」は変わらない。
//
// → 報酬の置き場所が違う。一芸が報われるべきなのはNPBドラフトではなく、
//   **社会人スカウト・大学推薦・独立の入団**（このゲームが実際に生きている
//   アマチュアの階層）のはず。そこは `scoutingSystem` / 推薦スカウトが
//   別の評価式を持っているので、そちらに一芸の道を作るのが筋。
//   ⚠ **NPBドラフト側の係数をいじって無理に成立させないこと**。
// ============================================================
//
// 【選手の希望は「正解」ではない】
// ⚠ 指導者が当たりということもある。選手の希望どおりにやらせるのが常に正しい
//   設計にしてはいけない（一度そう作りかけた）。希望は
//   **やる気（効率）に効くだけ**で、何が正しいかは選手の水準が決める。
//   ・希望どおり  → やる気が上がり効率が上がる
//   ・希望と違う  → やる気が下がるが、方針が正しければ選手は伸びる
//   高い信頼（プロ意識）を持つ選手ほど、納得できない指導でも従える。
// ============================================================

import { PHYSICAL_STATS } from './growthUtils.js';

export const DIRECTIONS = {
  sharpen:  { key: 'sharpen',  name: '長所を伸ばす', icon: '⚔️',
              description: '最も強い能力に絞って magnify する。他は伸びない' },
  balanced: { key: 'balanced', name: '全体を伸ばす', icon: '⚖️',
              description: '満遍なく。突出はしないが穴も出来ない' },
  patch:    { key: 'patch',    name: '短所を埋める', icon: '🧱',
              description: '最も弱い能力を底上げする。伸びしろが大きく効率は良い' },
};

export const PHASES = {
  physique: { key: 'physique', name: '基礎体力', icon: '🏃',
              description: '走力・肩・球速・スタミナ・体力。若いうちほど伸びる' },
  skill:    { key: 'skill',    name: '技術',     icon: '🎯',
              description: 'ミート・制球・選球眼・守備。経験で伸びる' },
  range:    { key: 'range',    name: '幅を広げる', icon: '🧭',
              description: '球種・守備位置・打席。数字にならないが起用の幅が増える' },
};

/** フェーズごとに「伸ばす対象になる能力」。投手と野手で見る場所が違う */
const PHASE_STATS = {
  physique: {
    pitcher: ['velocity', 'stamina', 'bodyStamina', 'arm'],
    fielder: ['speed', 'arm', 'bodyStamina'],
  },
  skill: {
    pitcher: ['control', 'defense'],
    fielder: ['meet', 'power', 'eye', 'defense', 'steal'],
  },
};

/** 能力値の取り出し（成長エンジンと同じ場所を見る） */
const STAT_VALUE = {
  meet: p => p.batting?.meet, power: p => p.batting?.power, eye: p => p.batting?.eye,
  steal: p => p.batting?.steal, bunt: p => p.batting?.bunt,
  speed: p => p.physical?.speed, arm: p => p.physical?.arm,
  bodyStamina: p => p.physical?.bodyStamina,
  defense: p => p.fielding?.defense,
  control: p => p.pitching?.control, velocity: p => p.pitching?.velocity,
  stamina: p => p.pitching?.stamina,
};

// 球速だけスケールが違う（110〜165）ので、他の能力と比べるために0-100へ直す。
// `AbilityValue`（能力の可視化）と同じ正規化を使う——物差しを二重に作らない。
const normalized = (stat, v) => {
  if (v == null) return null;
  if (stat === 'velocity') return (v - 115) * 2.5;
  if (stat === 'stamina') return v / 2;
  return v;
};

const statOf = (player, stat) => normalized(stat, STAT_VALUE[stat]?.(player));

/** その選手にとっての「長所」と「短所」。フェーズの対象能力の中で比べる */
export function poleStats(player, phase) {
  const isPitcher = player?.position === 'pitcher';
  const pool = PHASE_STATS[phase]?.[isPitcher ? 'pitcher' : 'fielder'] || [];
  let best = null, bestV = -Infinity, worst = null, worstV = Infinity;
  for (const s of pool) {
    const v = statOf(player, s);
    if (v == null) continue;
    if (v > bestV) { bestV = v; best = s; }
    if (v < worstV) { worstV = v; worst = s; }
  }
  return { best, bestValue: bestV, worst, worstValue: worstV, pool };
}

// 能力 → メニュー。集中コース（intensive_*）は「+1確定・他能力-1」なので
// **長所を尖らせるとき専用**。短所に使うと下げたくない能力まで削れる。
const INTENSIVE_BY_STAT = {
  meet: 'intensive_meet', power: 'intensive_power', eye: 'intensive_eye',
  speed: 'intensive_speed', defense: 'intensive_defense',
  control: 'intensive_control', velocity: 'intensive_velocity',
};
const BROAD_BY_STAT = {
  meet: 'batting', power: 'batting', eye: 'batting', bunt: 'batting',
  speed: 'baserunning', steal: 'baserunning',
  defense: 'fielding', arm: 'fielding',
  control: 'control', stamina: 'control', velocity: 'velocity',
  bodyStamina: 'velocity',
};
const SUB_BY_PHASE = {
  physique: { sharpen: 'weight', balanced: 'physique', patch: 'physique' },
  skill:    { sharpen: 'eye',    balanced: 'stretch',  patch: 'defense_sub' },
  range:    { sharpen: 'breaking', balanced: 'breaking', patch: 'subposition' },
};

/**
 * 方針（方向性 × フェーズ）を、この選手の具体的な練習に翻訳する。
 * **成長エンジンは一切変えない**。既存の TRAINING_MENUS / SUB_TRAINING_MENUS から選ぶだけ。
 */
export function resolveTraining(player, direction = 'balanced', phase = 'skill') {
  const isPitcher = player?.position === 'pitcher';
  const sub = SUB_BY_PHASE[phase]?.[direction] || 'physique';

  if (phase === 'range') {
    // 幅: 投手は球種、野手は守備位置。長所方向は「得意な形をさらに深く」
    const main = isPitcher ? 'newpitch' : (direction === 'sharpen' ? 'fielding' : 'baserunning');
    return { main, sub, phase, direction };
  }

  const { best, worst } = poleStats(player, phase);
  if (direction === 'sharpen' && best) {
    return { main: INTENSIVE_BY_STAT[best] || BROAD_BY_STAT[best] || 'batting', sub, phase, direction, target: best };
  }
  if (direction === 'patch' && worst) {
    // 短所は集中コースを使わない（他能力を削るため）
    return { main: BROAD_BY_STAT[worst] || 'batting', sub, phase, direction, target: worst };
  }
  // 全体: そのフェーズの標準メニュー
  const main = phase === 'physique'
    ? (isPitcher ? 'velocity' : 'baserunning')
    : (isPitcher ? 'control' : 'batting');
  return { main, sub, phase, direction };
}

// ============================================================
// 選手の希望
//
// 選手は自分の立場から練習したいことを持っている。**これは正解ではない**。
//   ・尖った選手は武器を磨きたがる（自分の売りだと分かっている）
//   ・平凡な選手は人並みになりたがる＝短所を埋めたがる
//     → 水準が低い選手ではこの希望が**むしろ間違い**で、指導者が
//        「お前は これ で勝負しろ」と方向を変えるのが仕事になる
//   ・若い選手は身体を作りたがり、経験を積んだ選手は技術を磨きたがる
// ============================================================

/** 選手が自分でやりたいと思っている方針 */
export function playerWish(player) {
  const age = player?.age ?? 20;
  const skill = poleStats(player, 'skill');
  const phys = poleStats(player, 'physique');
  // 長所と短所の開き。開いているほど「自分の武器」を自覚している
  const gap = (skill.bestValue - skill.worstValue);
  const direction = gap >= 22 ? 'sharpen' : gap <= 10 ? 'balanced' : 'patch';
  const phase = age <= 19 ? 'physique' : age >= 23 ? 'skill'
    : (phys.bestValue < skill.bestValue ? 'physique' : 'skill');
  return { direction, phase };
}

// ============================================================
// やる気（希望との噛み合い）
//
// ⚠ **希望どおりが正解ではない**。噛み合いは効率（やる気）にだけ効かせ、
//   何が正しいかは選手の水準が決める（長所を伸ばすか全体か）。
//   プロ意識の高い選手ほど、納得できない指導でも身を入れて取り組む。
// ============================================================
const MOOD_MATCH = 1.15;    // 希望どおり
const MOOD_HALF = 1.0;      // 片方だけ一致
const MOOD_MISS = 0.85;     // どちらも違う

export function moodMultiplier(player, direction, phase) {
  const wish = playerWish(player);
  const hit = (wish.direction === direction ? 1 : 0) + (wish.phase === phase ? 1 : 0);
  const raw = hit === 2 ? MOOD_MATCH : hit === 1 ? MOOD_HALF : MOOD_MISS;
  if (raw >= 1) return raw;
  // プロ意識が高い選手は、納得できない指導でも落ち込みが小さい
  const discipline = player?.personality?.discipline ?? 50;
  const resist = Math.max(0, Math.min(1, (discipline - 40) / 50));
  return raw + (1 - raw) * resist;
}

/** 画面表示用: 希望と指示の関係を一言で */
export function describeMood(player, direction, phase) {
  const wish = playerWish(player);
  const hit = (wish.direction === direction ? 1 : 0) + (wish.phase === phase ? 1 : 0);
  if (hit === 2) return { label: '意欲的', tone: 'good' };
  if (hit === 1) return { label: '納得', tone: 'mid' };
  const discipline = player?.personality?.discipline ?? 50;
  return discipline >= 70
    ? { label: '不本意だが従う', tone: 'mid' }
    : { label: '身が入らない', tone: 'bad' };
}
