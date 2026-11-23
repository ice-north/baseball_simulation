// ============================================================
// シーズン成長システム - src/season/growthSystem.js
//
// yearProgressionSystem.js から成長・衰退の純粋計算関数群を抽出したもの。
// 選手能力の年齢カーブ成長/衰退・社会人/独立の実戦成長・自由契約の自主トレ成長・
// 成長率(growthModifier)の年度引き継ぎを担う。いずれも growthUtils / physics の
// ヘルパーのみに依存し、他の年間進行ロジックには依存しない（循環参照なし）。
// ============================================================

import { PHYSICAL_STATS, TECHNICAL_STATS, getAgeGrowthBase, getRecoveryAgeBase, getStatPath, getStatName, getNestedValue, setNestedValue, MUSCLE_STATS, DEXTERITY_STATS, physiqueMultFor, dexterityMult } from './growthUtils.js';
import { getVelocityCap, getVelocityCatchupMult } from '../utils/physics.js';
import { PITCHING_FORM_EFFECTS, FORM_PITCH_SYNERGY, ALL_PITCH_TYPES } from '../utils/constants.js';

// --- 成長率(growthModifier/growthPotential)の年度更新 ---
/**
 * ベテラン指導力: 30歳以上でdiscipline/mentalが高い選手が若手の成長を促進。
 * ⚠ 年度替わり（`updateGrowthModifiers`）と画面の自然成長（`expectedNaturalGrowth`）で共有する
 */
export function veteranBonusOf(players) {
  const veterans = (players || []).filter(p => (p.age || 18) >= 30);
  let veteranBonus = 0;
  for (const vet of veterans) {
    // ⚠ プロ意識・精神力は `personality` の中にある。以前は `vet.discipline` を
    //    読んでいて常に既定の50になり、この加算は一度も働いていなかった
    const disc = vet.personality?.discipline ?? 50;
    const ment = vet.personality?.mental ?? 50;
    const leadership = (disc + ment) / 2;
    if (leadership >= 60) {
      veteranBonus += 0.01 + (leadership - 60) * 0.0005;
    }
  }
  return Math.min(0.06, Math.round(veteranBonus * 1000) / 1000);
}

/**
 * 年度替わりで引き継ぐ変動（`growthModifier`）。
 * ⚠ 年度替わり（`updateGrowthModifiers`）と画面の自然成長（`expectedNaturalGrowth`）で共有する。
 *    画面は優勝の加算を知り得ないので `isChampion` を渡さない
 * @param age 年度替わりの**前**の年齢（加齢より前に呼ばれる）
 */
export function nextGrowthModifier(player, { isChampion = false, veteranBonus = 0 } = {}) {
  const age = player.age || 18;
  // ⚠ **`growthPotential` を年齢で減衰させないこと**。
  //    旧実装は毎年 `-(age-23)*0.05` を積んでおり、30歳で累計 -1.40。
  //    つまり **30代の選手は全員 gp が 0 付近に潰れ**、個性が消えたうえ、
  //    年齢の効果が `naturalAgeCoef` / `getAgeGrowthBase` と合わせて
  //    **3箇所**に重なっていた（衰退が三重に掛かる）。
  //    成長率は「その選手の素の伸びやすさ」という不変の個性として残し、
  //    年齢はカーブ側が単独で担う。

  // シーズン中に蓄積された変動を半減して次年度に引き継ぎ（徐々にゼロに戻る）
  let modifier = (player.growthModifier || 0) * 0.5;

  if (isChampion) {
    modifier += 0.05;
  }

  // ベテラン指導力: 25歳以下の若手にのみ適用
  if (age <= 25 && veteranBonus > 0) {
    modifier += veteranBonus;
  }

  return Math.max(-0.3, Math.round(modifier * 100) / 100);
}

export function updateGrowthModifiers(allTeams, awards) {
  const championTeam = awards?.champion;

  Object.entries(allTeams).forEach(([teamName, team]) => {
    if (!team.players) return;
    const isChampion = teamName === championTeam;
    const veteranBonus = veteranBonusOf(team.players);

    team.players.forEach(player => {
      player.growthModifier = nextGrowthModifier(player, { isChampion, veteranBonus });
    });
  });
}

// 能力ごとの伸びやすさ（`grow()` の base）と、プロ級で減衰が始まる閾値。
// ⚠ **2つの成長関数で共有すること**。以前は `applyCorporatePlayerGrowth` と
//    `applyFreeAgentGrowth` に同じ数字が別々に書かれており、片方だけ直る事故が待っていた。
//
// ⚠ **base は `focus` / `strength` と掛け算で重なる**。社会人のミートは
//    base 3.0 × focus 1.9 × 長所 1.3 = 7.41、走力は 0.5 × 0.8 × 0.85 = 0.34 で
//    **22倍**の開きがあった。技術系だけが独走して、平均的な社会人が
//    ミート83（NPB主力級）まで伸びていた。順序（技術は伸びる・走力と肩は
//    才能で決まる）は正しいので、**上位の base だけを詰める**。
//      ミート 3.0→1.9 / 制球 3.0→1.9 / 守備 2.5→1.7 / 選球眼 2.0→1.5
// 成長率は **天井の高さ**でも効く。才能のある選手はプロ級(70)を超えてからも伸び、
// 才能のない選手は早く頭打ちになる。
// ⚠ **`decayMult` は正の delta にしか掛からない**ので、衰え始める年齢は動かない。
//    曲線の山を高くする案は総成長量そのものを増やしてしまう。天井なら成長の「上限」だけを動かせる。
//    gp0.6 → 閾値64.4 / gp1.0 → 70 / gp1.4 → 75.6
// ⚠ **強くしすぎると社会人のトップがNPB超えになる**。
//    一度 40 / 1.35 にしたところ、成長率1.4の選手の実効天井が **125**（＝上限なし）
//    になり、社会人リーグに 守備99・制球97・ミート99 が現れた。
//    NPBレギュラー相当は ミート58 / 制球60 / 球速146 なので、
//    「努力で伸びる能力」だけがプロを追い越す形になっていた。
//    実効天井（減衰が1割まで落ちる位置）が gp0.6→80 / 1.0→88 / 1.4→94 に収まる値にする。
// ⚠ 素質の効きの大部分は**この天井ではなく年齢曲線のずらし**（`GP_AGE_SHIFT`）と
//    伸びる側の倍率（`gpPosMult`）が担う。天井を強めても副作用しか増えない
//    （前の「基礎＋練習」の形での実測: 天井を 0 にしても説明力 6.1%、12 で 6.3%）。
// 年次成長に掛ける体格補正の幅。毎年・全能力に掛かるので、キャンプ(1.0)より弱くする
const PHYSIQUE_W = 0.30;

// ⚠ 【かつてここにあった「若いほど吸収が速い」の練習の年齢係数（`YOUTH_MULT`）】は
//    2026-11-20に落とした。年齢は `naturalAgeCoef` の年齢曲線が**単独で**担う
//    （練習の項に年齢の重みを足すと二重計上になり、衰え始める年齢が動く）。
//    曲線は19歳から23歳まで上がって25歳まで平ら＝「高卒3〜5年目がいちばん伸びる」で、
//    旧実装の「19歳が最大・23歳はその6割」とは山の位置が違う（いしだ指定）。

// 新球種の習得。⚠ **大学プールにしか無かった**。社会人・独立・クラブの投手は
// キャンプ以外に球種を増やす経路が無く、実測で12年進化させても球種数が
// **3.00 固定**のままだった。持ち球の「幅」は打者の読み合い
// （`arsenal.effectiveArsenalSize`）に直結するので、引き出しが増えないと
// 何年経っても同じ投手のままになる。
// 技術の場所である社会人が最も高く、指導者の居ないクラブは稀。
const NEW_PITCH_RATE = { corporate: 0.10, independent: 0.05, club: 0.02 };
function tryLearnNewPitch(player, categoryKey, discipline) {
  const arsenal = player.pitching?.arsenal;
  if (!arsenal) return;
  // プロ意識が高いほど新しい球に手を出す（意識50で基準）。
  // ⚠ **器用さも掛ける**（器用さ50で従来どおり）。キャンプ側だけに入れると
  //    「キャンプでだけ器用さが効く」ことになり、背景のCPUと食い違う。
  //    幅が控えめ(0.5)なのは**毎年掛かる**ため（`physiqueMultFor` の w と同じ理由）
  const rate = (NEW_PITCH_RATE[categoryKey] ?? 0.05) * (0.5 + discipline / 100)
    * dexterityMult(player, 0.5);
  if (Math.random() >= rate) return;
  const have = new Set(arsenal.map(a => a.type));
  const affinity = FORM_PITCH_SYNERGY[player.pitching?.form] || [];
  let pool = affinity.filter(t => !have.has(t));
  if (pool.length === 0) pool = ALL_PITCH_TYPES.filter(t => !have.has(t));
  if (pool.length === 0) return;
  const type = pool[Math.floor(Math.random() * pool.length)];
  const isAffinity = affinity.includes(type);
  const id = arsenal.length > 0 ? Math.max(...arsenal.map(a => a.id || 0)) + 1 : 1;
  // ⚠ 覚えたては Lv10〜25。CLAUDE.md の実測では **Lv10 は防御率がほぼ変わらず
  //    四球だけ +0.9 増える**＝覚えたてはむしろ損。磨いて初めて価値が出る。
  arsenal.push({ id, type, level: Math.floor(Math.random() * 16) + (isAffinity ? 12 : 6) });
}

const POTENTIAL_CEILING_W = 12;
const POTENTIAL_RATE_W = 0.20;
const gpClamp = (gp) => Math.max(0.3, Math.min(1.8, gp ?? 1.0));
/** プロ級(70)から減衰が始まる位置。才能があるほど遅い */
export const growthThreshold = (base, gp = 1.0) => base + (gpClamp(gp) - 1.0) * POTENTIAL_CEILING_W;
/** 減衰の速さ。才能があるほど緩やか＝天井が高い（実効の頭打ちは threshold + 0.9/rate） */
export const growthDecayRate = (base, gp = 1.0) =>
  Math.max(0.005, base * (1 - (gpClamp(gp) - 1.0) * POTENTIAL_RATE_W));

//
// ⚠ **`decline` は衰退方向だけに掛かる別プロファイル**。成長の速さと衰えの速さは
//    まったく別の話で、成長の `base` を流用すると実データと逆になる。
//    実測（ピーク→38歳）では パワー **-34%**（実 -10%）/ 選球眼 **-17%**（実 ほぼ0%）と
//    落ちすぎ、走力 -16%（実 -22%）と落ちなさすぎだった。
//    **「体力から落ち、技術は残る」**という基本が出ていなかった。
//    `npbCareer` は既に加齢プロファイルを別に持っている（肩0.5 / 走塁0.6 /
//    リードは落ちない）ので、こちらもそれに揃える。
// ⚠ **`peakAge` はその能力の狙うピーク年齢**（実データの値をそのまま置く）。
//    これが無いと**ピーク年齢と成長速度が同じパラメーターで決まってしまう**ので、
//    軸を分ける。「伸びにくい」ことと「ピークが早い」ことは別の話。
//    実データのピーク: 走力22-24 / 肩24-26 / パワー27-29 / ミート26-27 /
//                     守備26-28 / 選球眼28-32（晩成）/ 球速24-26 / 制球28-32
// ⚠ 2026-11-20に**意味が変わった**。以前は「基礎成長のピークの終わりを何年ずらすか」
//    という補正値（走力+4・ミート-1）で、`基礎 + 練習` の交点が能力ごとにずれるのを
//    打ち消すためのものだった。いまは年齢曲線（`naturalCoefOf`）が全能力で共通なので、
//    **狙う年齢を直接書く**。曲線は `peakAge - PEAK_REF` だけ年齢方向にずれる
//    （平均は `PEAK_REF`＝指定の表どおり、走力はそれより4年早く・選球眼は3年遅く山が来る）。
// ⚠ **アマの打撃（ミート・パワー・選球眼）だけ天井を低く・急にしてある**（`ama`）。
//    守備・制球と同じ 52 / 0.05 だった頃は、大学S・社会人Sのスタメン野手の中央値が
//    ミート66/パワー66 と **NPBレギュラー基準（ミート58/パワー55）を上回り**、
//    大学Sのリーグで 打率.345 / 本塁打3.0本/チーム試合 という打ち合いになっていた。
//    アマチュアの平均はプロのレギュラーより下にあるべきなので、平均を下げる。
//    天井は gp で上へずれて緩む（`growthThreshold` / `growthDecayRate`）ので、
//    才能のある選手はここを越える＝「たまに凄い打者がいる」は残る。
// ⚠ **プロ（`CATEGORY_GROWTH.npb` の `pro: true`）は `ama` を使わない**。
//    共通の値を下げるとプロの打者まで伸びなくなる。
// ⚠ 天井を読むときは `ceilOf(g, isPro)` を通すこと（大学・自由契約・社会人の3経路）
export const ceilOf = (g, isPro = false) => (!isPro && g.ama) ? g.ama : g;
// floor … 天井を越えてからも残る伸びの割合（共通は 0.10）。アマの打撃は 0.02 にして
//         「天井の先は才能（gp）がある選手だけが進める」形にする。0.10 のままだと
//         社会人の厚い練習量（ミートの実効重み4.7）で毎年じりじり伸び、平均が下がらない
const AMA_BAT = { threshold: 42, rate: 0.09, floor: 0.02 };
// ⚠ **打撃だけ下げると投手が勝ちすぎる**。リーグの成績は能力の絶対値ではなく
//    打者と投手の「比」で決まるので、打撃の天井だけ下げたら社会人Sが 打率.210 /
//    2.8点/試合、自リーグ（独立）が 打率.168 まで落ちた。社会人Sの投手の制球は
//    中央値67〜69 と NPB基準（60）を超えていたので、制球にも同じアマの天井を掛ける。
//    球速は NPB基準（146）より既に低い（中央値136〜142）ので触らない
const AMA_CTL = { threshold: 46, rate: 0.08, floor: 0.03 };

export const STAT_GROWTH = {
  meet:     { peakAge: 26.5, ref: 50, base: 1.9, cap: 99,  threshold: 52, rate: 0.05, ama: AMA_BAT, decline: 0.66 },
  power:    { peakAge: 28, ref: 50, base: 1.5, cap: 99,  threshold: 52, rate: 0.05, ama: AMA_BAT, decline: 1.78 },
  eye:      { peakAge: 30, ref: 50, base: 1.5, cap: 99,  threshold: 52, rate: 0.05, ama: AMA_BAT, decline: 0.25 },
  defense:  { peakAge: 27, ref: 50, base: 1.7, cap: 99,  threshold: 52, rate: 0.05, decline: 0.80 },
  speed:    { peakAge: 23, ref: 50, base: 0.5, cap: 99,  threshold: 62, rate: 0.03, decline: 5.70 },
  arm:      { peakAge: 25, ref: 50, base: 0.5, cap: 99,  threshold: 62, rate: 0.03, decline: 6.20 },
  armP:     { peakAge: 25, ref: 50, base: 1.0, cap: 99,  threshold: 62, rate: 0.03, decline: 3.30 },  // 投手の肩
  control:  { peakAge: 30, ref: 50, base: 1.9, cap: 99,  threshold: 52, rate: 0.05, ama: AMA_CTL, decline: 0.44 },
  stamina:  { peakAge: 26, base: 2.0, cap: 200, threshold: 62, rate: 0.03, decline: 1.48 },
  velocity: { peakAge: 25, base: 0.5, cap: null, threshold: 142, rate: 0.20, decline: 6.00 },
  // 体力・体幹・器用さ。年次成長では直接伸ばさないが、**大学とキャンプが使うので
  // 物差しはここに置く**（進路で「体力60」の意味が変わらないようにするため）。
  bodyStamina: { peakAge: 26, ref: 50, base: 1.15, cap: 99, threshold: 62, rate: 0.03, decline: 1.00 },
  muscle:      { peakAge: 27, ref: 50, base: 0.77, cap: 99, threshold: 62, rate: 0.03, decline: 0.60 },
  dexterity:   { peakAge: 27, ref: 50, base: 0.77, cap: 99, threshold: 62, rate: 0.03, decline: 0.40 },
  // 回復力は加齢で落ちる一方（`getRecoveryAgeBase` が別に担当）。ここは成長側だけ
  recovery:    { peakAge: 26, ref: 50, base: 0.77, cap: 99, threshold: 62, rate: 0.03, decline: 1.20 },
  // ⚠ **変化球とリードは長らく年次成長の対象外だった**。社会人・独立・クラブの
  //    投手は7年経ってもスライダーLv30のまま、捕手はリード40のままだった
  //    （大学プールだけが `applyUniversityGrowth` で伸ばしていた）。
  //    どちらも「実戦で最も磨かれる」ものなので、実戦成長の対象に入れる。
  breaking: { peakAge: 30, ref: 50, base: 1.3, cap: 100, threshold: 52, rate: 0.04, decline: 0.20 },
  // リードは経験の積み上げ。**加齢で落ちない**（`npbCareer` の加齢処理と同じ扱い）
  lead:     { peakAge: 34, ref: 50, base: 1.1, cap: 95,  threshold: 52, rate: 0.05, decline: 0 },
};

// --- 自由契約選手の自主トレ成長 ---
// ⚠ **成長の式を二重に持たないこと**。以前はここだけ旧式（`zeroAge` の分岐＋
//    discipline の3乗の崖）が残っており、他が変わっても取り残されていた。
//    「チームが無い」ことは **練習量(`FA_VOLUME`)と環境(`FA_GAIN`)が低い**
//    という形で表す。プロ意識の効き方（`naturalCoefOf` のずらし）は共通。
const FA_VOLUME = 0.55;   // 自主トレのみ。実戦も指導者も無い
const FA_GAIN = 0.80;     // 環境も無い（チーム所属のランクD 0.80 相当）
export function applyFreeAgentGrowth(pool) {
  for (const player of pool) {
    const age = player.age || 25;
    const discipline = player.personality?.discipline ?? 50;
    // ⚠ growthPotential は年齢で減衰させない（`updateGrowthModifiers` の注記を参照）。
    //    変動は球団の選手と同じく**先に半分にしてから**読む（いしだ 2026-11-21「判断はおすすめで」）。
    //    以前は半分にする前に読んでおり、変動+0.1 が曲線を動かす量が球団の選手の倍（0.8年と0.4年）だった
    player.growthModifier = nextGrowthModifier(player);
    // ⚠ **変動こみで読むこと**（`naturalCoefOf` の注記）
    const gpEff = gpClamp((player.growthPotential ?? 1.0) + (player.growthModifier || 0));

    // ⚠ 年齢曲線は `naturalCoefOf`（**2つある成長関数で共有すること**）。
    //    チームが無いので環境は FA_VOLUME×FA_GAIN、出場もゼロ扱い
    const envMult = FA_VOLUME * FA_GAIN * (0.55 / ACT_REF);

    // ⚠ 式は `curveChange`（`makeGrower` と共有）。自主トレは長所・短所・体格・調子を持たない
    const grow = (current, key, baseMult = 1, capOverride = null) => {
      const g = STAT_GROWTH[key];
      const change = curveChange(current, g, {
        age, gpEff, discipline, baseMult, ceil: ceilOf(g),
        growScale: (v) => v * envMult,
      });
      return roundChange(current, change, capOverride ?? g.cap);
    };

    if (player.position === 'pitcher') {
      if (player.pitching) {
        player.pitching.control = grow(player.pitching.control, 'control');
        player.pitching.stamina = grow(player.pitching.stamina, 'stamina');
        const velCatchup = getVelocityCatchupMult(player.physical?.arm || 50, player.pitching.velocity);
        player.pitching.velocity = grow(player.pitching.velocity, 'velocity',
          velCatchup, getVelocityCap(player.physical?.arm || 50));
      }
      if (player.physical) {
        player.physical.arm = grow(player.physical.arm, 'armP');
      }
    } else {
      if (player.batting) {
        player.batting.meet  = grow(player.batting.meet,  'meet');
        player.batting.power = grow(player.batting.power, 'power');
        player.batting.eye   = grow(player.batting.eye,   'eye');
      }
      if (player.physical) {
        player.physical.speed = grow(player.physical.speed, 'speed');
        player.physical.arm   = grow(player.physical.arm,   'arm');
      }
      if (player.fielding) {
        player.fielding.defense = grow(player.fielding.defense, 'defense');
      }
    }

    // 知名度: 自主トレで結果を出しても無名のまま（知名度は試合出場で蓄積）
    // → 微増のみ（discipline 80+ で +1/年）
    if (discipline >= 80) {
      player.fame = Math.min(100, (player.fame || 0) + 1);
    }
  }
}

// ⚠ 【かつてここにあった「実成長 = 基礎成長 + 練習成長」の和の形】は 2026-11-20 に
//    年齢曲線（下）に作り替えた。和の形ではプロ意識が練習の項に掛かり、基礎の衰えを
//    打ち消すので、プロ意識の高い選手がいつまでも衰えなかった。いまは素質・プロ意識・
//    出場による変動が**曲線の位置**をずらし、衰え始める年齢は曲線の符号だけで決まる。
// ============================================================
// 【自然成長の年齢曲線】いしだ 2026-11-20 の指定
//   「基本、成長係数は23歳まで徐々に上がり、出場試合数によってプラス変動、
//     疲労があるのに出場することでマイナス変動、26歳から徐々に減り始めます」
//
//   素質1.0・プロ意識50・レギュラー出場・独立リーグ（ランクC）の高卒選手で
//     19歳 1.00 / 20歳 1.05 / 21歳 1.10 / 22歳 1.15 / 23〜25歳 1.20（山）/
//     26歳 1.15 / 27歳 1.05 / 28歳 0.90 / 29歳 0.70 / 30歳 0.45 / 31歳 0.15 /
//     32歳 -0.20 / 34歳 -1.05 / 36歳 -2.10 / 38歳 -3.35 / 40歳 -4.80
//   **単位は「主要な能力1つあたり・1年の点」**（1.00 なら平均+1、0 で横ばい、負で衰え）。
//   25歳以降は傾きが毎年 0.05 ずつ急になる二次曲線で、指定の表と全点一致する。
//
// ⚠ **なぜ作り替えたか**。前の形（基礎 0.14 ＋ 練習の和）では、30代の衰えが
//    1年で平均 -0.5 程度しかなく、実ワールドの測定で **32〜34歳が平均総合力も
//    スタメン率もいちばん高い**（42.4・75% 対 23〜25歳の 42.0・71%）という
//    「ベテランが居座って席が空かない」状態だった（いしだ指摘）。
//    若手が追い抜くには、30代後半で数点ずつ落ちる必要がある。
//
// ⚠ 曲線の**位置**（何歳で山が来るか）を素質・プロ意識・蓄積した変動がずらす。
//    曲線の**高さ**を素質で変えてはいけない。高さに掛けると素質1.4の選手が
//    40歳で -6.7 と**いちばん激しく衰える**ことになる（素質が高い選手は
//    長持ちするべき）。ずらしなら素質1.4は40歳で -2.6 に収まる。
// ⚠ 年齢の項は**ここだけ**に置く（`applyAgeCurveChanges` の `getAgeGrowthBase` と
//    合わせて2箇所）。練習の項に年齢の重みを足すと二重計上になる。
// ============================================================
const NATURAL_AT_19 = 1.00;        // 19歳（素質1.0）の1能力あたりの伸び
const NATURAL_RISE = 0.05;         // 19→23歳の1年あたりの上がり幅
const NATURAL_RISE_END = 23;
export const NATURAL_PEAK = 1.20;  // 23〜25歳の山（将来性の札 `potential.js` も割る数に使う）
const NATURAL_PEAK_END = 25;
const NATURAL_SLOPE_STEP = 0.05;   // 25歳以降、傾きが毎年これだけ急になる
const NATURAL_FLOOR = -5.5;        // 際限なく落ちない（実際は `dampDecline` が先に効く）

/** 年齢（素質1.0に換算した「実効年齢」）→ 1能力あたりの伸び */
export function naturalAgeCoef(effAge) {
  // ⚠ 19歳より前は**平らにする**（下げない）。素質が高い選手は曲線が後ろにずれるので、
  //    延長して下げると「素質1.4の19歳が素質1.0の19歳より伸びない」ことになる
  if (effAge <= 19) return NATURAL_AT_19;
  if (effAge <= NATURAL_RISE_END) return NATURAL_AT_19 + (effAge - 19) * NATURAL_RISE;
  if (effAge <= NATURAL_PEAK_END) return NATURAL_PEAK;
  const k = effAge - NATURAL_PEAK_END;
  // ⚠ 40歳（k=15）より先は**まっすぐにする**（指定の表はそこで終わっている）。
  //    二次曲線のまま延ばすと、早くピークが来る能力（走力は実効年齢が3.5歳うしろ）が
  //    40歳の時点でもう -7 を超え、1年で走力が10点落ちるようなことになる。
  const K_END = 15;
  if (k <= K_END) return NATURAL_PEAK - (NATURAL_SLOPE_STEP / 2) * k * (k + 1);
  const atEnd = NATURAL_PEAK - (NATURAL_SLOPE_STEP / 2) * K_END * (K_END + 1);
  const slope = NATURAL_SLOPE_STEP * K_END;   // k=15 の傾き（-0.75/年）
  return Math.max(NATURAL_FLOOR, atEnd - slope * (k - K_END));
}

// 曲線を年齢方向にずらす量。
// ⚠ 素質は `growthPotential + growthModifier`（出場で積み、疲労で削れる変動こみ）。
//    いしだ「大事に使われたら毎年+0.1程度増える」＝1年で曲線が0.8歳うしろにずれる。
//    **以前は `makeGrower` が `growthPotential` しか読んでおらず、変動は
//    年度替わりの成長にまったく効いていなかった**（精神力・体幹だけが見ていた）。
const GP_AGE_SHIFT = 8;    // 素質1.4→+3.2歳 / 0.6→-3.2歳
// プロ意識によるずらしは**上下で幅が違う**（いしだ 2026-11-21「低いプロ意識による
// 成長係数の下落をもう2年程早めたい。高プロ意識はそのままでOK」）。
//   意識90→+2.0歳 / 70→+1.0歳 / 50→±0 / 35→-1.7歳 / 20→-3.5歳 / 10→-4.6歳
// ⚠ 50 を境に折れている。50 は**指定の表が当たる基準**なので動かせない。
const DISC_AGE_SHIFT_HI = 5;    // 意識50より上（手を付けない）
const DISC_AGE_SHIFT_LO = 11.5; // 意識50より下（練習しない選手は早く終わる）
const discAgeShift = (discipline) => {
  const t = (discipline ?? 50) - 50;
  return (t / 100) * (t >= 0 ? DISC_AGE_SHIFT_HI : DISC_AGE_SHIFT_LO);
};
/**
 * 素質が**伸びる側だけ**に掛かる倍率（0.3→0.69 / 1.0→1.00 / 1.8→1.36）。
 * ⚠ ずらしだけでは足りない。ずらしは「いつまで伸びるか」しか変えないので、
 *    19歳の時点では素質1.4と素質0.6がほぼ同じ伸びになってしまう
 *    （曲線を後ろにずらすと若いうちは平らな部分に乗るため）。
 * ⚠ **衰える側には掛けない**。掛けると素質1.4の選手が40歳でいちばん激しく衰える。
 */
const gpPosMult = (gpEff) => 0.55 + 0.45 * gpClamp(gpEff);
// 主要な能力の `peakAge` の加重平均。**指定の表はこの「平均的な能力」に当たる**。
// 能力ごとの曲線は `peakAge - PEAK_REF` だけ年齢方向にずれる（走力は4年早く・選球眼は3年遅く）
const PEAK_REF = 26.5;

/**
 * その選手・その能力の、今年の1点あたりの伸び（年齢曲線の値）。
 * @param gpEff 素質＋蓄積した変動（0.3〜1.8にクランプ）
 * @param peakAge `STAT_GROWTH[].peakAge`（走力は早く・選球眼は遅くピークが来る）
 */
export function naturalCoefOf(age, gpEff = 1.0, discipline = 50, peakAge = PEAK_REF) {
  const shift = (gpClamp(gpEff) - 1) * GP_AGE_SHIFT
    + discAgeShift(discipline)
    + ((peakAge ?? PEAK_REF) - PEAK_REF);
  return naturalAgeCoef((age || 25) - shift);
}

/**
 * 年齢曲線でまだ伸びる**最後の年齢**（年度替わりの伸びがプラスになる最後の歳）。
 * 素質と・プロ意識の曲線のずらし（`GP_AGE_SHIFT`・`DISC_AGE_SHIFT`）を入れた、主要な能力の平均（`PEAK_REF`）。
 * 素質1.0・プロ意識50で31歳（32歳から衰える）。
 * ⚠ 「3年後の見込み」（`ageOutlook.js`）と将来性の札（`potential.js` の `estimatePeakAge`）はこれを使う。
 *    以前は別の式（素質1.0で25歳）を持っていて、ゲームでは伸びる28歳を「下り坂」と出していた
 */
export function naturalPeakAge(gpEff = 1.0, discipline = 50, peakAge = PEAK_REF) {
  let last = 15;
  for (let age = 15; age <= 60; age += 1) {
    if (naturalCoefOf(age, gpEff, discipline, peakAge) > 0) last = age;
    else break;
  }
  return last;
}

// 能力ごとの伸びやすさ（`STAT_GROWTH[].base`）を「平均1」に直すための基準。
// ⚠ **指定の表が当たる条件**（独立リーグ・ランクC・レギュラー出場・プロ意識50）で
//    主要な能力の平均が曲線の値どおりになるよう較正してある。`CATEGORY_GROWTH` の
//    `volume`・`gain` やランクの倍率を変えたら、`natural-growth-check` で測り直す。
const BASE_REF = 1.33;
// 衰え側の基準。`STAT_GROWTH[].decline` の加重平均ぶんを割って、
// **平均は曲線どおり・能力ごとの落ち方は profile どおり**にする
const DECLINE_REF = 0.83;
/**
 * 能力ごとの衰えやすさの**開きを縮める**倍率。
 * ⚠ `decline` の生の値は走力5.7・肩6.2 対 選球眼0.25 と **23倍**の開きがある。
 *    これは「基礎成長が -0.5 程度」だった頃に、ピーク→38歳の減衰率(%)を実データに
 *    合わせて決めた値。年齢曲線にしてマイナスが -2〜-4.8 に大きくなったので、
 *    生の開きのままでは **36歳で走力が1年に6点落ちる**（実測）ことになった。
 *    開きを 0.30 に縮めて、順序（体から落ち、技術は残る）だけを残す。
 * ⚠ `decline: 0`（捕手のリード）は0のまま＝加齢で落ちない。
 */
const DECLINE_SPREAD = 0.30;
const declineWeight = (decline) =>
  !decline ? 0 : 1 + (decline - 1) * DECLINE_SPREAD;
// 出場量の基準（フル出場）。これで割って「レギュラーなら1.0・控えは下がる」にする
const ACT_REF = 1.50;

// ⚠ 【かつてここにあった練習成長のプロ意識倍率（`disciplineTrainMult`）】は
//    2026-11-20に落とした。プロ意識は**年齢曲線のずらし**（`discAgeShift`）に移した。
//    練習の項に足して基礎の負を打ち消す形だと、プロ意識が高い選手が
//    **いつまでも衰えない**（それが「ベテランが居座る」原因だった）。

// 1年で失える割合の上限。**衰えても「小学生以下」までは落ちない**。
// ⚠ 下限でクランプしてはいけない（`corporateInit.taperLow` と同じ理由。
//    平均が押し上がってリーグの較正が動く）。**落ち幅を現在値に比例させる**と、
//    符号は変わらないので「衰え始める年齢」は完全に不変のまま、
//    崩壊だけが止まる。旧実装も新実装も、練習しない選手のミートが
//    最終的に **1** まで落ちていた（旧は27歳、新は40歳で到達）。
// ⚠ いしだ 2026-11-20「実際プレイしていると、なかなか衰えず、ずっとベテランが
//    居座ります」。0.055 では能力50の選手が1年で2.75点しか落ちず、指定の年齢曲線
//    （40歳で -4.80）が能力87以上でしか実現しなかった。0.12 にすると能力50で
//    1年6点まで落ちられる＝36歳あたりから席を明け渡す
const DECLINE_MAX_RATE = 0.12;
const dampDecline = (current, delta) => Math.max(delta, -Math.max(1, current * DECLINE_MAX_RATE));

// ⚠ **衰えは能力値に比例させること**。`grow()` の delta は `base × 年齢係数` で
//    決まる**絶対量**なので、そのままだと「走力95でも走力40でも年 -1」になり、
//    **水準が高い選手ほど減衰率(%)が小さくなる**（実測 31→39歳で
//    走力30 -29.9% 対 走力90 -15.5%）。実際は一流のスプリンターも平凡な走者も
//    30代で同じ割合を失う。`ref` を基準に比例させると水準に依らず一定になる。
// ⚠ `ref` を持たない能力（スタミナ・球速）は**スケールが違う**ので絶対量のまま
//    （球速135を基準に比例させると120km投手と150km投手で失う km/h が倍違う）。
// ⚠ **確率的丸め**。`Math.round` は 0.5 未満の成長を毎年 0 に潰す。
//    実測で走力の年間成長は **0.364** しかなく、`Math.round` で
//    **一度も伸びないまま19歳がピーク**になっていた（肩・球速も同じ）。
//    base の小さい能力（走力0.5 / 肩0.5 / 球速0.5）は構造的にこれを踏む。
//    端数の確率で切り上げれば**期待値が正確に保たれる**（0.36 なら36%で+1）。
//    ⚠ 下限クランプや base の引き上げで代用しないこと——前者は平均を歪め、
//      後者は「走力は才能で決まる」という設計（実効重みの序列）を壊す。
export const stochasticRound = (v) => {
  const f = Math.floor(v);
  return f + (Math.random() < (v - f) ? 1 : 0);
};

// ============================================================
// 【プラトーとブレイクスルー】年ごとの伸びに**記憶**を持たせる
//
// ⚠ 旧実装の年次ノイズは `0.6 + random()*0.6` の**独立同分布**で、
//    隣接年の自己相関が実測 **0.026**（＝ほぼ無相関）だった。毎年ほぼ同じ幅で
//    単調に伸びるので、「2年伸び悩んで3年目に化ける」「フォームを崩して1年落ちる」
//    という育成で最も判断の難しい局面が存在しなかった。
//    実データの選手の年次成長は自己相関 0.2〜0.35（伸びる年は続く）。
//
// AR(1) の「充実度」を選手に持たせる。**平均1を保つ**ので、
// リーグの水準・指名の構成比は動かない（振れ方だけが変わる）。
// `_growthForm` は選手オブジェクトに載るのでセーブされる。
const FORM_RHO = 0.35;    // 前年をどれだけ引き継ぐか
const FORM_W = 0.38;      // 伸び幅への効き
// ⚠ **独立ノイズを絞って、そのぶんを記憶のあるノイズへ移すこと**。
//    `0.6 + random()*0.6`（σ/平均 0.19）を残したまま form を足しても、
//    独立成分が自己相関を薄めて 0.06 までしか上がらなかった。
//    平均0.9は保ったまま幅だけ狭める（`0.75 + random()*0.3`）。
const YEAR_NOISE_LO = 0.75, YEAR_NOISE_W = 0.30;
function advanceGrowthForm(player) {
  const u1 = Math.random() || 0.001, u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const prev = player._growthForm ?? 0;
  const next = FORM_RHO * prev + Math.sqrt(1 - FORM_RHO * FORM_RHO) * z;
  player._growthForm = Math.max(-2.5, Math.min(2.5, next));
  return Math.max(0.10, 1 + player._growthForm * FORM_W);
}

const DECLINE_SCALE_CLAMP = [0.55, 1.9];
const declineScale = (current, ref) => {
  if (!ref) return 1;
  return Math.max(DECLINE_SCALE_CLAMP[0], Math.min(DECLINE_SCALE_CLAMP[1], current / ref));
};

// --- 社会人/独立チーム選手の実戦経験による成長 ---
// ============================================================
// カテゴリごとの育成の性格（「弱者の兵法」）
//
// 進路によって鍛えられる場所が違う、というのがこのゲームの階層の意味。
//   大学   … 総合力（`applyUniversityGrowth` 側。specialties で7分野）
//   社会人 … **技術**。設備と指導者があるので制球・ミート・選球眼・守備が伸びる
//   独立   … **一芸**。試合に出て武器で勝負するしかない。長所が伸び短所は放置
//   クラブ … **基礎体力**。技術指導者が居ないので走・肩・スタミナしか伸びない
//
// ⚠ **これは「弱者の兵法」の実体**。総合力に優れた高校生は大学・社会人へ進んで
//   さらに万能になり、一芸型は独立・クラブへ進んでその一芸が磨かれる。
//   一芸型が数年後にドラフトの下位・育成で拾われる（`scoutTools` の一芸指名）
//   という経路は、ここで武器が磨かれて初めて成立する。
//
// ⚠ 従来は3カテゴリとも同じ傾斜（長所×1.4 / 短所×0.7）だった。
//   カテゴリを分けても選手の中身が同じになるので、進路に意味が無かった。
// ⚠ **`topN` を分けるのが要**。従来は全カテゴリ「上位2つが長所」だった。
//    独立の一芸は文字どおり **1つ**なので topN=1 にしないと尖らない
//    （実測: 上位2つのままだと 独立の尖り1.50 対 社会人1.46 とほぼ差が出なかった）。
// カテゴリの調整点 `volume`（練習量）と `gain`（環境の質）は、いまは**どちらも伸びる年だけに
// 掛け算で効く**（`makeGrower` の `envMult`）。衰え始める年齢（年齢曲線の符号）も、衰える年の
// 落ち方も動かさず、「そのカテゴリの選手はどれだけ速く伸びるか」だけを決める。
// ⚠ 前の「基礎＋練習」の和の形では `volume` が和の内側に入って衰え始める年齢まで動いたので、
//    指名の構成比は `gain` で合わせる決まりだった。いまは2つの効きは同じ（積だけが効く）。
// draft-check は `growYears` を指定して `applyCorporatePlayerGrowth` を
// 実際に回してから指名する（0 だと成長を一度も通らず、ここを動かしても測定に映らない）。
// ⚠ **export してあるのは掃引して測るため**（`ind-share-probe.mjs` が `gain` を差し替える）。
//    関数の中で毎回 `CATEGORY_GROWTH[...]` を引くので、import 後に書き換えれば効く
export const CATEGORY_GROWTH = {
  // 独立: たった1つの武器に極端に寄せる。それ以外はほとんど伸びない
  independent: { volume: 1.34, gain: 0.88, topN: 1, strength: 2.6, weak: 0.20, focus: null },
  // 社会人: **技術で完成させる場所**。3カテゴリで技術系が最も伸びる。
  // ⚠ フィジカルを 0.7 まで下げたうえ技術も 1.5 止まりだったため、
  //    高卒→社会人ルート（19→22歳の3年）が**全進路で最弱**になっていた
  //    （実測 ドラフト到達 3〜6% 対 大学21〜24%）。実業団は設備も指導者も
  //    実戦もあるのだから、技術に関しては大学を上回って良い。
  corporate: {
    volume: 0.64, gain: 0.90, topN: 2, strength: 1.3, weak: 0.85,
    focus: { control: 1.9, meet: 1.9, eye: 1.8, defense: 1.8, breaking: 1.8, lead: 1.7,
             velocity: 0.8, speed: 0.8, arm: 0.9, stamina: 1.0, power: 1.0 },
  },
  // NPB: 練習量・環境ともに最高。**天井だけがアマより高い**（`ceilingShift`）。
  // ⚠ アマの天井（技術系52 → 実効70）はNPBレギュラー相当に置いてあるので、
  //    プロがそこで頭打ちになるとスター選手が生まれない。プロだけ +20 する。
  // ⚠ **練習量と環境を上げるだけにすること**。プロ意識・出場量（一軍/二軍）が
  //    そのまま効くので、「二軍暮らしが続くと伸びない」が自然に出る。
  npb: {
    volume: 1.00, gain: 0.80, ceilingShift: 14, topN: 2, strength: 1.25, weak: 0.85,
    pro: true,   // アマ専用の天井（`STAT_GROWTH[].ama`）を使わない
    // 技術系を厚く・身体系を薄くしてある。
    // ⚠ 前の「基礎＋練習」の形では focus が衰えの止まりにくさにも効いていたが、いまは
    //    伸びる年だけに効く。衰え方は `STAT_GROWTH[].decline`（体から落ち、技術は残る）が担う。
    focus: { control: 1.6, meet: 1.8, eye: 1.4, defense: 1.7, breaking: 1.4,
             velocity: 1.0, speed: 0.55, arm: 0.6, stamina: 1.1, power: 1.2, lead: 1.4 },
  },
  // オンラインの対人リーグ（12球団）の**年度替わりの自然成長**。
  // ⚠ 先方指摘（2026-11-16）: 「年度替わりの自然成長は成長係数を見て、フィジカルや精神が中心、
  //    若いほど伸びる。キャンプはプロ意識・体幹・器用さを見て、フィジカルと技術が中心」。
  //    それまでは独立リーグの一芸（topN=1）の式で、技術もフィジカルも同じくらい伸びていた。
  // ⚠ 能力の種類と若さの重み（`naturalPositive`）は**伸びる側だけ**に掛かる。focus は独立と同じ
  //    1.0（無し）のまま。
  // ⚠ 長所・短所の重み（topN・strength・weak）は伸びる年だけに効く。衰える年は独立と同じ式
  //    （`curveChange` の衰えの側は長所・短所を見ない）。
  // ⚠ 一人用の世界の独立リーグ・社会人は触らない（`online` を渡したときだけ）
  online: {
    volume: 1.34, gain: 0.88, topN: 2, strength: 1.2, weak: 0.9, focus: null,
    natural: true,
  },
  // クラブ: 基礎体力だけ。技術は独学なのでほとんど伸びない
  club: {
    volume: 0.86, gain: 0.06, topN: 2, strength: 1.25, weak: 0.9,
    focus: { velocity: 1.7, speed: 1.9, arm: 1.9, stamina: 1.7, power: 1.5,
             control: 0.5, meet: 0.5, eye: 0.5, defense: 0.6, breaking: 0.5, lead: 0.5 },
  },
};

/** 天井に近いほど伸びにくくする倍率（`threshold` を越えた分だけ `rate` ずつ下がり、`floor` で止まる） */
const decayMult = (current, threshold, rate, floor = 0.10) => {
  if (current < threshold) return 1.0;
  return Math.max(floor, 1.0 - (current - threshold) * rate);
};

/**
 * 年齢曲線による1能力の**今年の変化**（丸める前・上限で止める前）。
 * ⚠ **式はここだけ**。チームの選手（`makeGrower`）と自由契約（`applyFreeAgentGrowth`）で共有する。
 * @param opts.growScale 伸びる年だけに掛ける倍率（長所・短所・環境・出場・体格など）。
 *   `coef × w × 素質` を受け取って掛けたものを返す（掛ける順を変えると丸めの境目で結果が変わる）
 * @param opts.noise 年ごとのゆらぎ。画面の「自然成長」は平均の年（`expect`）で固定する
 */
function curveChange(current, g, { age, gpEff, discipline, baseMult = 1, noise = null, ceil, ceilingShift = 0, growScale }) {
  // 年齢曲線の値（1能力あたりの点）。能力ごとのピークのずれ（`peakAge`）もここで見る
  const coef = naturalCoefOf(age, gpEff, discipline, g.peakAge);
  // 能力ごとの伸びやすさを「平均1」に直す（ミート1.9 対 走力0.5 の差は残す）
  const w = (g.base / BASE_REF) * baseMult
    * (noise ?? YEAR_NOISE_LO + Math.random() * YEAR_NOISE_W);
  if (coef >= 0) {
    return growScale(coef * w * gpPosMult(gpEff))
      * decayMult(current, growthThreshold(ceil.threshold + ceilingShift, gpEff), growthDecayRate(ceil.rate, gpEff), ceil.floor);
  }
  // 衰え: 能力ごとの衰えやすさ（`decline`。走力・肩から落ち、選球眼は残る）と
  // 水準への比例だけを掛ける。
  // ⚠ **長所・短所の重み（`specMult`）は掛けない**。掛けると独立リーグの一芸
  //    （×2.6）がいちばん速く崩れる＝設計と逆になる。
  // ⚠ **環境（`envMult`）も掛けない**。練習できない選手が落ちにくくなってしまう
  //    （自由契約でも落ち方は同じ）。
  return dampDecline(current, coef * w * declineWeight(g.decline ?? 1) / DECLINE_REF
    * declineScale(current, g.ref));
}

/** 変化を確率的に丸めて足す。伸びは上限で、衰えは1で止める */
const roundChange = (current, change, cap) => (change >= 0
  ? Math.min(cap, current + stochasticRound(change))
  : Math.max(1, current + stochasticRound(change)));

// ============================================================
// 成長の実行体。**カテゴリ（社会人/独立/クラブ/プロ）で共有する**。
//
// ⚠ ここを増やさないこと。以前は 大学・キャンプ・プロが別々の `grow()` を持ち、
//    同じ「ミート60」が場所によって別の意味になっていた。3作品で能力値を
//    共有する構想があるので、伸びやすさ・天井・ピーク年齢は `STAT_GROWTH`、
//    カテゴリの性格は `CATEGORY_GROWTH` の乗数だけで表す。
//
// @param opts.activity 出場量を外から与える（プロは一軍/二軍で決まる）
// ============================================================

/**
 * この1年の出場量（成長の練習量と知名度が見る）。投手は先発20・救援3、野手は打数。
 *
 * ⚠ 年度送りでは `resetSeasonStats` の**後**に呼ばれる。本物の試合をした球団
 *    （自チーム・同じリーグの球団）の `seasonStats` はもう0に戻っているので、
 *    **0なら直前に退避した `previousSeasonStats` を読む**。以前は自チームの
 *    レギュラーも控えも一律に最低の練習量（0.55）で、知名度は全員が下がっていた。
 *    作り物の成績を入れた並行世界の球団は `seasonStats` に入っているのでそちらを読む。
 * ⚠ 救援は「登板数−先発数」で数える。本物の試合は `gamesRelieved` を記録しない
 */
const activityOf = (player, stats) => {
  if (player.position === 'pitcher') {
    const p = stats?.pitching;
    const started = p?.gamesStarted || 0;
    return started * 20 + Math.max(0, (p?.games || 0) - started) * 3;
  }
  return stats?.batting?.atBats || 0;
};
export function seasonActivity(player) {
  return activityOf(player, player.seasonStats) || activityOf(player, player.previousSeasonStats);
}
/**
 * 画面の自然成長（`expectedNaturalGrowth`）が見る出場量。今季と前季の**大きい方**。
 * ⚠ シーズンの途中の `seasonStats` は数試合ぶんしか無い。そのまま読むと、
 *    開幕日は前季（`seasonActivity` の0のときの代わり）で高く出て、1試合出ると
 *    急に控え並みに下がっていた（22歳のレギュラーが +1.18 → +0.44）。
 *    年度替わりの本番は `seasonActivity`（その年の全試合）のまま
 */
export const displayActivity = (player) =>
  Math.max(activityOf(player, player.seasonStats), activityOf(player, player.previousSeasonStats));

// ------------------------------------------------------------
// オンラインの自然成長（年度替わり）の伸び方
// ------------------------------------------------------------
// 能力の種類ごとの「伸びる側」の倍率。フィジカルを厚く、技術を薄く（技術はキャンプで伸ばす）。
// ⚠ 実測（`online-yearend-growth-probe.mjs`、初期セット12球団×6回、2026-11-16）:
//    21歳以下の野手 体力+2.1 精神+1.8 肩力+1.5 体幹+1.4 走力+0.9 パワー+0.8 守備+0.4（ミート・選球眼は+0.3未満）、
//    21歳以下の投手 体力+1.9 精神+1.7 体幹・肩力・走力+1.3 変化球+1.2 球速+1.0 スタミナ+1.0 制球+0.3。
//    22〜25歳はその半分ほど、26歳からは伸びより衰えが勝つ。
//    ⚠ 2026-11-20に年齢曲線を作り替えたので、**年齢ごとの量はこの実測から動いている**
//      （ここの役目は能力の種類ごとの重みだけ。年齢は `naturalAgeCoef` が担う）。
//    前（独立リーグの式）は21歳以下の野手で 制球・肩力・守備+0.8 ミート+0.6 と技術もフィジカルも同じくらいだった
export const NATURAL_GROWTH_KIND = {
  speed: 2.2, arm: 2.2, armP: 1.8, velocity: 1.8, stamina: 1.6, bodyStamina: 1.8,
  power: 0.8,
  meet: 0.35, eye: 0.35, control: 0.35, defense: 0.35, breaking: 0.5, lead: 0.6,
  steal: 0.35, bunt: 0.35,
};
// 若いほど伸びる（伸びる側だけ）。⚠ `applyAgeCurveChanges` が見る能力（回復力・体力・
// 盗塁・バント、投手の打撃）**だけ**に残してある。主要な能力は `naturalCoefOf` の
// 年齢曲線が年齢を担うので、そちらでは `naturalKind`（年齢を含まない）を使う
const NATURAL_YOUTH = { 18: 1.6, 19: 1.5, 20: 1.4, 21: 1.3, 22: 1.15, 23: 1.05, 24: 0.95, 25: 0.85, 26: 0.75 };
export const naturalYouth = (age) => NATURAL_YOUTH[age] ?? (age < 18 ? 1.6 : 0.65);
/** 自然成長の伸びる側の倍率（能力の種類×若さ） */
export const naturalPositive = (key, age) => (NATURAL_GROWTH_KIND[key] ?? 1.0) * naturalYouth(age);
// 能力の種類ごとの重みだけ（年齢を含まない）。平均が1になるように割る。
// ⚠ `makeGrower` はこちらを使う（年齢は `naturalCoefOf` の曲線が単独で担うので、
//    ここに年齢の重み（`naturalYouth`）を掛けると二重計上になる）
const NATURAL_KIND_MEAN = 1.05;
export const naturalKind = (key) => (NATURAL_GROWTH_KIND[key] ?? 1.0) / NATURAL_KIND_MEAN;

// 精神力・体幹の自然な伸び（1年あたりの期待値。成長係数1.0のとき）。
// ⚠ どちらも**年度更新では今まで一度も動かなかった**（精神力は初期値のまま、体幹はキャンプだけ）。
//    衰えは付けない（精神は経験で練れ、体幹はキャンプの体づくりで保つもの）
const MENTAL_BY_AGE = [[20, 2.0], [23, 1.5], [26, 1.0], [29, 0.6], [99, 0.3]];
const MUSCLE_BY_AGE = [[20, 1.6], [23, 1.1], [26, 0.6], [29, 0.2], [99, 0]];
const byAge = (table, age) => table.find(([upTo]) => age <= upTo)?.[1] ?? 0;
/**
 * 精神力・体幹を伸ばす（オンラインの年度替わりだけ）。成長係数（＋起用の補正）で 0.6〜1.3倍
 */
export function applyNaturalMindBody(player) {
  const age = player.age || 25;
  const gp = gpClamp((player.growthPotential ?? 1.0) + (player.growthModifier || 0));
  const scale = 0.6 + 0.4 * gp;
  if (player.personality && typeof player.personality.mental === 'number') {
    const gain = stochasticRound(byAge(MENTAL_BY_AGE, age) * scale);
    player.personality.mental = Math.min(99, player.personality.mental + Math.max(0, gain));
  }
  if (player.physical && typeof player.physical.muscle === 'number') {
    const gain = stochasticRound(byAge(MUSCLE_BY_AGE, age) * scale);
    player.physical.muscle = Math.min(99, player.physical.muscle + Math.max(0, gain));
  }
}

export function makeGrower(player, prof, rankMult = 1.0, opts = {}) {
    // ⚠ `opts.age` / `opts.modifier` は画面の自然成長（`expectedNaturalGrowth`）が
    //    **年度替わりの時点の値**（加齢後の年齢・半減後の変動）を渡すためのもの。
    //    年度替わりの本番は加齢と半減を済ませてから呼ぶので、選手の値をそのまま読む
    const age = opts.age ?? (player.age || 25);
    // ⚠ **変動（`growthModifier`）こみで読むこと**。出場で積み・疲労で削れる分で
    //    年齢曲線が前後する（いしだ 2026-11-20「出場試合数によってプラス変動、
    //    疲労があるのに出場することでマイナス変動」）。以前はここが
    //    `player.growthPotential` だけで、**変動は年度替わりの成長に効いていなかった**
    const gpEff = gpClamp((player.growthPotential ?? 1.0) + (opts.modifier ?? (player.growthModifier || 0)));
    const discipline = player.personality?.discipline ?? 50;
    // その年の充実度（前年を引き継ぐ）。⚠ 成長方向にだけ掛ける
    // ⚠ `opts.peek` は**選手を書き換えない**（画面に出す「今年の自然な伸び」用）。
    //    `advanceGrowthForm` は `_growthForm` を進める＝状態を書き換えるので、
    //    画面から呼ぶときは**いまの調子のまま**で見る（平均の年）
    const formMult = opts.peek
      ? Math.max(0.10, 1 + (player._growthForm ?? 0) * FORM_W)
      : advanceGrowthForm(player);
    // 実戦に出ているほど練習量が増える（出場も練習のうち）
    // ⚠ `opts.activity` を**読むこと**。プロ（`applyNpbGrowth`）は一軍300・二軍70を
    //    渡しているのに、以前は無視して空の成績を読み、一軍も二軍も同じ練習量だった
    const activity = opts.activity ?? seasonActivity(player);
    // ⚠ 旧式 `0.75 + min(0.5, activity/400)` は **200打席で上限に張り付いた**。
    //    レギュラーも準レギュラーも同じ 1.25 になり、出場量が結果を
    //    ほとんど説明しなかった（実測の説明力 0.8%）。
    //    レギュラー(240打席)の値は 1.25 のまま据え置き、**下を伸ばす**。
    //    控えは 0.45＝レギュラーの36%しか練習量を得られない。
    const activityMult = 0.55 + Math.min(0.95, activity / 300);   // 0.55〜1.50
    // 環境の倍率（**伸びる側だけ**に掛かる）。練習量・設備・出場量。
    // ⚠ プロ意識と素質は**年齢曲線のずらし**に移した（`naturalCoefOf`）。ここに
    //    足し算で入れると、年齢の効果が二重になるうえ「プロ意識が高いと
    //    いつまでも衰えない」が戻る（それが「ベテランが居座る」原因だった）。
    // ⚠ 年齢の重み（`youthMult`）もここには入れない。年齢は曲線が単独で担う。
    const envMult = (prof.volume ?? 1.0) * (prof.gain ?? 1.0) * rankMult
      * (activityMult / ACT_REF);

    // 長所特化倍率: 選手の能力値の相対的な高さで成長に傾斜をかける
    // 長所(上位)はより伸び、短所は伸びにくい → 分業制・専門化を再現
    let statEntries;
    if (player.position === 'pitcher') {
      statEntries = [
        { key: 'control', val: player.pitching?.control || 0 },
        { key: 'stamina', val: player.pitching?.stamina || 0 },
        { key: 'velocity', val: (player.pitching?.velocity || 130) - 100 },
        { key: 'arm', val: player.physical?.arm || 0 },
      ];
    } else {
      statEntries = [
        { key: 'meet', val: player.batting?.meet || 0 },
        { key: 'power', val: player.batting?.power || 0 },
        { key: 'eye', val: player.batting?.eye || 0 },
        { key: 'speed', val: player.physical?.speed || 0 },
        { key: 'arm', val: player.physical?.arm || 0 },
        { key: 'defense', val: player.fielding?.defense || 0 },
      ];
    }
    // ⚠ **傾斜は grow() の base（能力ごとの伸びやすさ）を覆せる強さが要る**。
    //    base はミート3.0 対 走力0.5 と6倍の開きがあるので、旧値（長所1.4 / 短所0.7）
    //    では「長所の走力 0.5×1.4=0.7」より「短所のミート 3.0×0.7=2.1」の方が
    //    3倍速く伸びていた。**長所を指定しているのに短所が伸びる**状態だった。
    // カテゴリの得意分野を掛けてから並べる（社会人は技術を、クラブは体力を長所と見る）
    statEntries.sort((a, b) =>
      (b.val * (prof.focus?.[b.key] ?? 1.0)) - (a.val * (prof.focus?.[a.key] ?? 1.0)));
    // ⚠ **一芸（topN=1）は毎年引き直してはいけない**。年ごとにその時点の1位が
    //    長所判定を受けるので、結果的に全能力が順番に伸びて**万能になる**
    //    （実測: 有望素材＋意識100 の独立選手が32歳で
    //     ミート88/パワー87/走力86/守備88）。一芸の設計と逆。
    //    最初に決めた1つを持ち続ける（`_sharpenedTool` は選手に載るのでセーブされる）。
    let strengthKeys;
    if (prof.topN === 1) {
      if (!player._sharpenedTool || !statEntries.some(e => e.key === player._sharpenedTool)) {
        // ⚠ `peek`（画面に出すだけ）のときは決めない。選手を書き換えてしまう
        if (!opts.peek) player._sharpenedTool = statEntries[0].key;
      }
      strengthKeys = new Set([player._sharpenedTool || statEntries[0].key]);
    } else {
      strengthKeys = new Set(statEntries.slice(0, prof.topN).map(e => e.key));
    }
    const weakKeys = new Set(statEntries.slice(-2).map(e => e.key));
    const specMult = (key) => {
      const shape = strengthKeys.has(key) ? prof.strength : weakKeys.has(key) ? prof.weak : 1.0;
      return shape * (prof.focus?.[key] ?? 1.0);
    };

    // key は STAT_GROWTH のキー。specKey は長所/短所・カテゴリ得意分野の判定に使う
    // 能力名（投手の肩 'armP' は 'arm' として見る）。
    /**
     * その能力の**今年の変化**（丸める前・上限で止める前）。
     * ⚠ `noise` を渡せるようにしてあるのは、画面に出す「今年の自然な伸び」
     *    （`expectedNaturalGrowth`）が**平均の年**（noise=1）で出すため。
     *    式を2か所に書かないこと。
     */
    const changeOf = (current, key, baseMult = 1, noise = null) => {
      const g = STAT_GROWTH[key];
      const specKey = key === 'armP' ? 'arm' : key;
      return curveChange(current, g, {
        age, gpEff, discipline, baseMult, noise,
        ceil: ceilOf(g, prof.pro), ceilingShift: prof.ceilingShift ?? 0,
        // 伸びる年だけ: 長所・短所（`specMult`）・環境（`envMult`）・体格と調子
        growScale: (v) => {
          const phys = physiqueMultFor(player, specKey, PHYSIQUE_W) * formMult
            * (prof.natural ? naturalKind(key) : 1);
          return v * specMult(specKey) * envMult * phys;
        },
      });
    };
    /** 今年の変化の平均（ゆらぎを均した年）。画面の「自然成長」に使う */
    const expect = (current, key, baseMult = 1) =>
      changeOf(current, key, baseMult, YEAR_NOISE_LO + YEAR_NOISE_W / 2);
    const grow = (current, key, baseMult = 1, capOverride = null) =>
      roundChange(current, changeOf(current, key, baseMult), capOverride ?? STAT_GROWTH[key].cap);
  return { grow, expect, age, gp: gpEff, discipline };
}

/**
 * **来季の年度替わりの自然な伸び**（1能力あたりの平均。画面に出す数）。
 *
 * ⚠ いしだ 2026-11-20「成長係数1.0が主要な能力が平均1程度自然に上がる、0.0で平均0成長、
 *    マイナスで衰えを表現したい」。素質（`growthPotential`）は 0.3〜1.8 の**素の個性**で、
 *    そのままでは「平均いくつ伸びるか」を表さない。画面にはこの関数の値を出す。
 * ⚠ **式は `makeGrower` と同じ**（`expect` はゆらぎを均した年）。ここで別の式を書かない。
 * ⚠ **年度替わりの時点の値で計算すること**。年度送り（`advanceToNextYear`）は
 *    変動の半減（`updateGrowthModifiers`）→ 加齢 → 成長（`applyCorporatePlayerGrowth`）の順なので、
 *    いまの年齢・いまの変動のまま出すと、33歳・変動+0.3 の選手が +0.13 と出て実際は -0.71 だった。
 *    年齢は +1、変動は `nextGrowthModifier` で半減したもの（同じ球団のベテランの指導も入れる）。
 *    **優勝の加算（+0.05）は入れない**（シーズンが終わるまで分からない）。
 * ⚠ 出場量は今季と前季の大きい方（`displayActivity`）。
 * ⚠ 平均に入れるのは**0〜99の物差しの能力だけ**。球速（km/h）とスタミナ（0〜200）は
 *    単位が違うので混ぜない（混ぜると投手の数字が打者と比べられなくなる）。
 * @param category `CATEGORY_GROWTH` の区分（どの区分で伸びるかは `naturalGrowthPlanOf`）
 * @param opts.team その選手の球団（ベテランの指導の加算を見る）。無ければ加算なし
 */
export function expectedNaturalGrowth(player, category = 'independent', rankMult = 0.90, { team = null } = {}) {
  const prof = CATEGORY_GROWTH[category] || CATEGORY_GROWTH.independent;
  const modifier = nextGrowthModifier(player, { veteranBonus: team ? veteranBonusOf(team.players) : 0 });
  // ⚠ `peek` で呼ぶ（選手の調子・一芸の印を書き換えない）
  const { expect } = makeGrower(player, prof, rankMult, {
    peek: true,
    age: (player.age || 20) + 1,   // `updateAllPlayerAges` と同じ既定
    modifier,
    activity: displayActivity(player),
  });
  const stats =
    player?.position === 'pitcher'
      ? [
          [player.pitching?.control, 'control'],
          [player.physical?.arm, 'armP'],
          ...(player.pitching?.arsenal || [])
            .filter((a) => a?.type && a.type !== 'straight')
            .map((a) => [a.level, 'breaking']),
        ]
      : [
          [player.batting?.meet, 'meet'],
          [player.batting?.power, 'power'],
          [player.batting?.eye, 'eye'],
          [player.physical?.speed, 'speed'],
          [player.physical?.arm, 'arm'],
          [player.fielding?.defense, 'defense'],
        ];
  const usable = stats.filter(([value]) => Number.isFinite(value));
  if (!usable.length) return 0;
  const total = usable.reduce((sum, [value, key]) => sum + expect(value, key), 0);
  return Math.round((total / usable.length) * 100) / 100;
}

/** 球団の格ごとの練習量の倍率（設備・指導者・実戦の環境） */
const RANK_TRAIN_MULT = { S: 1.15, A: 1.05, B: 1.0, C: 0.90, D: 0.80 };
/**
 * その球団の練習量の倍率。
 * ⚠ 独立リーグはキャンプがあるためクラブよりも環境が整っている → 格が無ければランクC相当。
 * ⚠ **画面に出す自然成長（`expectedNaturalGrowth`）にも同じ値を渡すこと**。
 *    固定値で出すと、格の高い球団の選手の表示が実際より低く出る
 *    （オンラインの12球団は S〜D が混ざる）。
 */
export const teamRankMult = (team) =>
  RANK_TRAIN_MULT[
    team?.corporateData?.rank || (team?.independentLeagueId ? 'C' : 'D')
  ] ?? 1.0;

/**
 * その球団の選手が年度替わりに**どの区分・どの練習量で**伸びるか（`applyCorporatePlayerGrowth` の判定）。
 * ⚠ 画面の自然成長（`naturalGrowthOf`・`server/projection.mjs`）も**これを通すこと**。
 *    以前は一人用の画面が独立リーグ（ランクC）で決め打ちしていて、クラブ（環境0.06）の
 *    20歳・能力40が +1.11 と出て実際は +0.04 だった。
 * @param online その球団がオンラインの対人リーグの球団か（`CATEGORY_GROWTH.online`）
 * @returns `{ category, rankMult }`。年齢曲線で伸びない球団（大学・プロ）は null
 */
export function naturalGrowthPlanOf(team, { online = false } = {}) {
  if (!team?.corporateData && !team?.independentLeagueId) return null;
  const isClub = team.corporateData?.type === 'club';
  const isIndependent = !!team.independentLeagueId;
  // カテゴリごとの育成の性格（`CATEGORY_GROWTH`）。
  // 従来は3カテゴリすべてが同じ傾斜（長所×1.4 / 短所×0.7）だった。
  const category = online ? 'online' : isClub ? 'club' : isIndependent ? 'independent' : 'corporate';
  return { category, rankMult: teamRankMult(team) };
}

/**
 * @param opts.online オンラインの対人リーグの球団名（Set）。渡した球団は自然成長の式
 *   （`CATEGORY_GROWTH.online`）で伸ばし、精神力・体幹も伸ばす（`applyNaturalMindBody`）
 */
export function applyCorporatePlayerGrowth(allTeams, { online = null } = {}) {
  for (const [teamName, team] of Object.entries(allTeams)) {
    const natural = !!online?.has(teamName);
    const plan = naturalGrowthPlanOf(team, { online: natural });
    if (!plan) continue;
    if (!team.players) continue;

    const isClub = team.corporateData?.type === 'club';
    const isIndependent = !!team.independentLeagueId;
    const { rankMult } = plan;
    const prof = CATEGORY_GROWTH[plan.category];

    for (const player of team.players) {
      const { grow, age, discipline } = makeGrower(player, prof, rankMult);

      if (player.position === 'pitcher') {
        if (player.pitching) {
          player.pitching.control = grow(player.pitching.control, 'control');
          player.pitching.stamina = grow(player.pitching.stamina, 'stamina');
          const ypVelCatchup = getVelocityCatchupMult(player.physical?.arm || 50, player.pitching.velocity);
          player.pitching.velocity = grow(player.pitching.velocity, 'velocity',
            ypVelCatchup, getVelocityCap(player.physical?.arm || 50));
        }
        if (player.physical) {
          player.physical.arm = grow(player.physical.arm, 'armP');
        }
        // 変化球: 実戦で投げ込むほど精度が上がる。ストレートは対象外
        for (const pitch of (player.pitching?.arsenal || [])) {
          if (pitch.type === 'straight') continue;
          pitch.level = grow(pitch.level, 'breaking');
        }
        // 持ち球そのものが増えることもある（若いうちほど手を出す）
        if (age <= 28) tryLearnNewPitch(player, isClub ? 'club' : isIndependent ? 'independent' : 'corporate', discipline);
      } else {
        if (player.batting) {
          player.batting.meet = grow(player.batting.meet, 'meet');
          player.batting.power = grow(player.batting.power, 'power');
          player.batting.eye = grow(player.batting.eye, 'eye');
        }
        if (player.physical) {
          player.physical.speed = grow(player.physical.speed, 'speed');
          player.physical.arm = grow(player.physical.arm, 'arm');
        }
        if (player.fielding) {
          player.fielding.defense = grow(player.fielding.defense, 'defense');
        }
        if (player.position === 'catcher' && player.catching) {
          player.catching.lead = grow(player.catching.lead ?? 30, 'lead');
        }
      }
      if (natural) applyNaturalMindBody(player);

      // 知名度の蓄積。⚠ 以前は全員に毎年 0〜2（平均+1）を無条件に足しており、
      //    実績と関係なく在籍年数だけで社会人の知名度の中央値が 1→37（15年）まで積み上がった。
      //    ドラフト評価に fame×0.3 が乗るので、在籍年数がそのまま評価点になっていた。
      //    **試合に出ている選手だけ**が名前を知られ、出ていない選手は少しずつ忘れられる
      const seasonAct = seasonActivity(player);
      let fameGain = seasonAct >= 200 ? 1 + (Math.random() < 0.5 ? 1 : 0)
        : seasonAct >= 80 ? (Math.random() < 0.5 ? 1 : 0)
        : ((player.fame || 0) > 0 ? -1 : 0);
      if (isClub && discipline >= 65) {
        fameGain += Math.floor((discipline - 50) * 0.08);
      }
      player.fame = Math.max(0, Math.min(100, (player.fame || 0) + fameGain));
    }
  }
}

// `applyCorporatePlayerGrowth` が年齢曲線（`makeGrower`）で面倒を見る能力。
// ⚠ **年齢カーブと二重に掛けないこと**。社会人・独立・クラブの選手は
//    両方の関数を通るので、重なった能力に年齢カーブまで掛けると
//    衰退が二重になり、30代の選手が実際の倍の速さで落ちる。
//    残り（回復力・体力・盗塁・バント、および投手の打撃能力）は
//    corporate 側が触らないので、こちらが単独で担う。
const CORPORATE_OWNED_STATS = {
  pitcher: new Set(['control', 'stamina', 'velocity', 'arm']),
  fielder: new Set(['meet', 'power', 'eye', 'speed', 'arm', 'defense']),
};
// 大学生は `applyUniversityYear`（`universityPool.applyUniversityGrowth`）が見る能力。
// 社会人と同じ理由で年齢カーブと二重に掛けない
const UNIVERSITY_OWNED_STATS = {
  pitcher: new Set(['control', 'stamina', 'velocity', 'arm', 'bodyStamina', 'recovery']),
  fielder: new Set(['meet', 'power', 'eye', 'speed', 'arm', 'defense', 'bodyStamina', 'recovery']),
};

// --- 年齢カーブによる成長・衰退 ---
/**
 * @param opts.online オンラインの対人リーグの球団名（Set）。伸びる側だけ自然成長の倍率
 *   （`naturalPositive`: フィジカル厚め・技術薄め・若いほど）を掛ける。衰える側は同じ
 */
export function applyAgeCurveChanges(allTeams, { online = null } = {}) {
  const updatedTeams = {};
  const ageReports = [];

  Object.entries(allTeams).forEach(([teamName, team]) => {
    const natural = !!online?.has(teamName);
    // 社会人・独立・クラブは applyCorporatePlayerGrowth が年齢カーブごと担当する
    const corporateGrown = !!(team?.corporateData || team?.independentLeagueId);
    updatedTeams[teamName] = {
      ...team,
      players: team.players.map(player => {
        const age = player.age || 20;
        let updatedPlayer = JSON.parse(JSON.stringify(player));
        const changes = [];

        // 全能力について年齢カーブを適用
        const group = player.position === 'pitcher' ? 'pitcher' : 'fielder';
        const owned = corporateGrown ? CORPORATE_OWNED_STATS[group]
          : team?.universityData ? UNIVERSITY_OWNED_STATS[group]
          : null;
        const allStats = [...PHYSICAL_STATS, ...TECHNICAL_STATS]
          .filter(s => !owned || !owned.has(s));

        allStats.forEach(stat => {
          const isPhysical = PHYSICAL_STATS.includes(stat);
          const base = getAgeGrowthBase(age, isPhysical);

          // 個人差: 標準偏差2.0のランダム偏差（大きな個人差を出す）
          // Box-Muller変換で正規分布を生成
          const u1 = Math.random() || 0.001;
          const u2 = Math.random();
          const normalRandom = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
          const variance = normalRandom * 1.0;

          // 才能依存の能力は年齢カーブでの成長も抑制（衰退方向は通常通り）
          const AGE_TALENT_MULT = { arm: 0.5, speed: 0.6, power: 0.8, velocity: 0.8 };
          const ageTalentMult = AGE_TALENT_MULT[stat] ?? 1.0;

          // 体幹/器用さによる成長方向の補正（成長方向のみ適用、衰退には影響しない）
          const physiqueMult = physiqueMultFor(player, stat);

          const effectiveRaw = (player.growthPotential ?? 1.0) + (player.growthModifier || 0);
          const growthPotential = Math.max(0, Math.min(1.8, effectiveRaw));
          // 衰退の加速は頭打ちにする（growthPotentialが加齢で大きくマイナスへ暴走しても
          // 際限なく急落させない）。上限1.9、係数0.27。
          const decayMult = Math.min(1.9, effectiveRaw < 0 ? 1 + Math.abs(effectiveRaw) * 0.27 : 1.0);

          // 衰退の緩和/促進: プロ意識(discipline)＋大事な起用(growthModifier)。
          //   プロ意識が高いほど練習で衰えを抑え、疲労状態での酷使(modifierマイナス)は
          //   衰えを促進する。プロ意識100＋大事に使われた選手が45歳前後まで一線を張れる
          //   バランス（DISC=0.44, CARE=2.0）。decayDiscMult は衰退量への乗数。
          const discipline = player.personality?.discipline ?? 50;
          const care = player.growthModifier || 0; // 正=大事に, 負=酷使
          const declineMitig = (discipline / 100) * 0.58 + care * 2.0;
          const decayDiscMult = Math.max(0.25, Math.min(1.5, 1.0 - declineMitig));

          // 最終変動値（四捨五入、±0の場合もある）
          let rawChange = base + variance;
          // 回復力は加齢で年々低下する（成長方向なし）。専用カーブで衰退のみ。
          if (stat === 'recovery') {
            rawChange = getRecoveryAgeBase(age) + variance * 0.5;
            if (rawChange > 0) rawChange = 0; // 上振れでも回復力は成長させない
          }
          // 成長方向: ポテンシャル + 体幹/器用さ補正（プロ意識は練習に集中）
          // 衰退方向: マイナスポテンシャルで加速 + プロ意識で緩和
          const naturalMult = natural ? naturalPositive(stat, age) : 1;
          let change = rawChange > 0
            ? Math.round(rawChange * ageTalentMult * growthPotential * physiqueMult * naturalMult)
            : Math.round(rawChange * decayMult * decayDiscMult);

          // 能力値を取得・更新
          const statPath = getStatPath(stat);
          if (!statPath) return;

          const currentValue = getNestedValue(updatedPlayer, statPath);
          if (currentValue == null) return;

          // フォーム別成長補正
          const formEff = PITCHING_FORM_EFFECTS[updatedPlayer.pitching?.form] || PITCHING_FORM_EFFECTS.threeQuarter;
          const formVelMult = stat === 'velocity' ? (formEff.velocityGrowthMult || 1.0) : 1.0;
          const formCtrlMult = stat === 'control' ? (formEff.controlGrowthMult || 1.0) : 1.0;

          // 球速は変動幅を1.2倍に（スケールが大きいため）+ フォーム補正 + 体幹補正
          if (stat === 'velocity') change = rawChange > 0
            ? Math.round(rawChange * 1.2 * ageTalentMult * growthPotential * formVelMult * physiqueMult)
            : Math.round(rawChange * 1.2 * decayMult * decayDiscMult);
          // 制球はフォーム補正適用（器用さ補正は既にchangeに適用済み）
          if (stat === 'control' && rawChange > 0) change = Math.round(change * formCtrlMult);
          // スタミナも変動幅を1.2倍（成長方向のみポテンシャル適用）
          if (stat === 'stamina') change = rawChange > 0
            ? Math.round(rawChange * 1.2 * growthPotential)
            : Math.round(rawChange * 1.2 * decayMult * decayDiscMult);

          // ⚠ **上限で止めること**。社会人・独立・クラブの選手は体力・回復力・盗塁・バントを
          //    ここだけで伸ばすので、止めないとオンラインの自然成長（体力×1.8）で体力が
          //    100を超えていた（10年の長期シミュで最大118）。上限は `STAT_GROWTH` の物差しと同じ
          const statCap = STAT_GROWTH[stat] ? STAT_GROWTH[stat].cap : 99;
          const newValue = change > 0 && statCap != null
            ? Math.max(1, Math.min(Math.max(statCap, currentValue), currentValue + change))
            : Math.max(1, currentValue + change);

          // ⚠ 上限で止まった分は報告に載せない（体力98に+3で99なら +1。99→99 の行は出さない）。
          //    キャンプの成長レポートは `change` を「うち年齢による変化」としてそのまま出す
          if (change !== 0) {
            updatedPlayer = setNestedValue(updatedPlayer, statPath, newValue);
            if (newValue !== currentValue) changes.push({
              stat, statName: getStatName(stat),
              before: currentValue, after: newValue, change: newValue - currentValue
            });

            // 球速⇔肩力の連動
            if (stat === 'velocity') {
              const armChange = Math.round(change * 0.5);
              if (armChange !== 0) {
                const armPath = getStatPath('arm');
                const currentArm = getNestedValue(updatedPlayer, armPath);
                if (currentArm != null) {
                  const newArm = Math.max(1, Math.min(99, currentArm + armChange));
                  if (newArm !== currentArm) {
                    updatedPlayer = setNestedValue(updatedPlayer, armPath, newArm);
                    changes.push({ stat: 'arm', statName: getStatName('arm'), before: currentArm, after: newArm, change: newArm - currentArm });
                  }
                }
              }
            }
            if (stat === 'arm' && player.position !== 'pitcher') {
              const currentVelForCatchup = getNestedValue(updatedPlayer, getStatPath('velocity'));
              const velChange = Math.round(change * 0.5 * getVelocityCatchupMult(newValue, currentVelForCatchup || 120));
              if (velChange !== 0) {
                const velPath = getStatPath('velocity');
                const currentVel = currentVelForCatchup;
                if (currentVel != null) {
                  const newVel = Math.max(100, Math.min(getVelocityCap(newValue), currentVel + velChange));
                  if (newVel !== currentVel) {
                    updatedPlayer = setNestedValue(updatedPlayer, velPath, newVel);
                    changes.push({ stat: 'velocity', statName: getStatName('velocity'), before: currentVel, after: newVel, change: newVel - currentVel });
                  }
                }
              }
            }
          }
        });

        if (changes.length > 0) {
          ageReports.push({
            name: player.name, team: teamName, age, changes
          });
        }

        return updatedPlayer;
      })
    };
  });

  return { updatedTeams, ageReports };
}

// ============================================================
// 加齢によるポジション転向
//
// 現実では捕手が30代で一塁へ、遊撃が三塁へ、中堅が両翼へ移る。守備範囲と
// 肩が落ちた選手を同じ場所に置き続けられないからで、**守備の難易度には
// はっきりした序列がある**（`POSITION_GLOVE_WEIGHT` と同じ順序）。
//
// ⚠ 旧実装では加齢で `positionFitness` も `position` も動かず、
//    **34歳の遊撃手が遊撃を守り続けていた**。
// ⚠ **`lineupGenerator` と戦わないこと**。あちらは `positionFitness` を見て
//    打順の守備位置を決め、`p.position` を恒久的に上書きする。だからここでは
//    **適性そのものを動かす**——難しい場所の適性を落とし、移った先を上げる。
//    そうすれば編成側が自然に配置し直す。
// ============================================================

/** 守備位置ごとの要求水準（守備・走力）。序列は POSITION_GLOVE_WEIGHT と同じ */
const POSITION_DEMAND = {
  catcher: { def: 56, speed: 0 },
  short:   { def: 58, speed: 50 },
  center:  { def: 53, speed: 56 },
  second:  { def: 52, speed: 44 },
  third:   { def: 46, speed: 36 },
  right:   { def: 42, speed: 38 },
  left:    { def: 38, speed: 34 },
  first:   { def: 28, speed: 0 },
};
/** 転向先の候補（易しい方へ1段ずつ） */
const POSITION_LADDER = {
  catcher: ['first', 'third', 'left'],
  short:   ['third', 'second', 'left'],
  center:  ['right', 'left'],
  second:  ['third', 'first'],
  third:   ['first', 'left'],
  right:   ['left', 'first'],
  left:    ['first'],
  first:   [],
};
// これ未満は転向しない（衰えではなく編成の都合になってしまう）。
// ⚠ **ポジションごとに違う**。実データの転向年齢は 捕手32-35 / 遊撃30-33 /
//    中堅30-32。一律28にすると全ポジション中央29歳と早すぎた。
const CONVERT_AGE = { catcher: 32, short: 30, center: 30, second: 30,
                      third: 31, right: 31, left: 31 };
const CONVERT_RATE = 0.40;       // 条件を満たした年に転向する確率
const CONVERT_MARGIN = 5;        // 要求水準をこれだけ下回ったら転向を検討

/**
 * 加齢で守備範囲が落ちた選手を易しい守備位置へ移す。
 * 全カテゴリ（自チーム含む）が対象。年度替わりに1回だけ呼ぶこと。
 */
export function applyPositionShifts(allTeams) {
  const shifts = [];
  for (const [teamName, team] of Object.entries(allTeams || {})) {
    // ⚠ **捕手を枯渇させないこと**。捕手が2人を切ると `lineupGenerator` が
    //    適性30の外野手を捕手に置く（「守備位置と適正のズレ」の節と同じ症状）。
    const catcherCount = (team?.players || []).filter(p => p.position === 'catcher').length;
    let catchersLeft = catcherCount;
    for (const player of (team?.players || [])) {
      if (player.position === 'pitcher' || player.position === 'first') continue;
      const age = player.age || 25;
      if (age < (CONVERT_AGE[player.position] ?? 31)) continue;
      const demand = POSITION_DEMAND[player.position];
      if (!demand) continue;
      const def = player.fielding?.defense ?? 50;
      const speed = player.physical?.speed ?? 50;
      const shortOnDef = def < demand.def - CONVERT_MARGIN;
      const shortOnSpeed = demand.speed > 0 && speed < demand.speed - CONVERT_MARGIN;
      if (!shortOnDef && !shortOnSpeed) continue;
      if (Math.random() >= CONVERT_RATE) continue;
      if (player.position === 'catcher' && catchersLeft <= 2) continue;
      // 今の能力で務まる最初の転向先を探す
      const to = (POSITION_LADDER[player.position] || []).find(pos => {
        const d = POSITION_DEMAND[pos];
        return def >= d.def - CONVERT_MARGIN && (d.speed === 0 || speed >= d.speed - CONVERT_MARGIN);
      }) || (POSITION_LADDER[player.position] || [])[0];
      if (!to) continue;
      const from = player.position;
      if (from === 'catcher') catchersLeft--;
      player.position = to;
      if (player.positionFitness) {
        // 移った先はすぐ務まる（易しい方へ動くため）。元の場所の適性は落ちる
        player.positionFitness[to] = Math.max(player.positionFitness[to] ?? 30, 78);
        player.positionFitness[from] = Math.max(20, Math.round((player.positionFitness[from] ?? 100) * 0.75));
      }
      shifts.push({ teamName, name: player.name, age, from, to });
    }
  }
  return shifts;
}


// ============================================================
// プロ入り後の成長。**アマ側と同じ実行体（`makeGrower`）を使う**。
//
// ⚠ 旧実装（`npbCareer.applyAging`）は `growthPotential` だけで駆動しており、
//    **プロ意識も出場機会も見ていなかった**。24歳まで全能力に一律
//    `(2.6 - (age-18)×0.25) × gp` が乗るので、**指名された全員が一様に伸びて
//    一軍ラインを超える**（実測の一軍到達 86〜93%。実NPB 40〜50%）。
//    現実は逆で、大半の下位・育成指名は二軍で頭打ちになる。
//
// 一軍で出場すれば練習量が増え、二軍が続けば伸びない——という
// フィードバックが `activity` を通じて自然に働く。
// @param isFirstTeam 前年に一軍だったか
// ============================================================
export function applyNpbGrowth(player, isFirstTeam) {
  const prof = CATEGORY_GROWTH.npb;
  // 一軍は出場量が最大、二軍は控え相当。ここが「二軍暮らしは伸びない」の入口
  const activity = isFirstTeam ? 300 : 70;
  const { grow, age } = makeGrower(player, prof, 1.0, { activity });
  if (player.position === 'pitcher') {
    if (player.pitching) {
      player.pitching.control = grow(player.pitching.control, 'control');
      player.pitching.stamina = grow(player.pitching.stamina, 'stamina');
      const catchup = getVelocityCatchupMult(player.physical?.arm || 50, player.pitching.velocity);
      player.pitching.velocity = grow(player.pitching.velocity, 'velocity',
        catchup, getVelocityCap(player.physical?.arm || 50));
      for (const pitch of (player.pitching.arsenal || [])) {
        if (pitch.type === 'straight') continue;
        pitch.level = grow(pitch.level, 'breaking');
      }
    }
    if (player.physical) player.physical.arm = grow(player.physical.arm, 'armP');
  } else {
    if (player.batting) {
      player.batting.meet = grow(player.batting.meet, 'meet');
      player.batting.power = grow(player.batting.power, 'power');
      player.batting.eye = grow(player.batting.eye, 'eye');
      player.batting.steal = grow(player.batting.steal ?? 40, 'speed');
    }
    if (player.physical) {
      player.physical.speed = grow(player.physical.speed, 'speed');
      player.physical.arm = grow(player.physical.arm, 'arm');
    }
    if (player.fielding) player.fielding.defense = grow(player.fielding.defense, 'defense');
    // リードは経験で積み上がる（`STAT_GROWTH.lead` は decline 0）
    if (player.position === 'catcher' && player.catching) {
      player.catching.lead = grow(player.catching.lead ?? 40, 'lead');
    }
  }
  return age;
}
