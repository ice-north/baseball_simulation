// ============================================================
// シーズン成長システム - src/season/growthSystem.js
//
// yearProgressionSystem.js から成長・衰退の純粋計算関数群を抽出したもの。
// 選手能力の年齢カーブ成長/衰退・社会人/独立の実戦成長・自由契約の自主トレ成長・
// 成長率(growthModifier)の年度引き継ぎを担う。いずれも growthUtils / physics の
// ヘルパーのみに依存し、他の年間進行ロジックには依存しない（循環参照なし）。
// ============================================================

import { PHYSICAL_STATS, TECHNICAL_STATS, getAgeGrowthBase, getRecoveryAgeBase, getStatPath, getStatName, getNestedValue, setNestedValue } from './growthUtils.js';
import { getVelocityCap, getVelocityCatchupMult } from '../utils/physics.js';
import { PITCHING_FORM_EFFECTS } from '../utils/constants.js';

// --- 成長率(growthModifier/growthPotential)の年度更新 ---
export function updateGrowthModifiers(allTeams, awards) {
  const championTeam = awards?.champion;

  Object.entries(allTeams).forEach(([teamName, team]) => {
    if (!team.players) return;
    const isChampion = teamName === championTeam;

    // ベテラン指導力: 30歳以上でdiscipline/mentalが高い選手が若手の成長を促進
    const veterans = team.players.filter(p => (p.age || 18) >= 30);
    let veteranBonus = 0;
    for (const vet of veterans) {
      const disc = vet.discipline || 50;
      const ment = vet.mental || 50;
      const leadership = (disc + ment) / 2;
      if (leadership >= 60) {
        veteranBonus += 0.01 + (leadership - 60) * 0.0005;
      }
    }
    veteranBonus = Math.min(0.06, Math.round(veteranBonus * 1000) / 1000);

    team.players.forEach(player => {
      const age = player.age || 18;
      // ⚠ **`growthPotential` を年齢で減衰させないこと**。
      //    旧実装は毎年 `-(age-23)*0.05` を積んでおり、30歳で累計 -1.40。
      //    つまり **30代の選手は全員 gp が 0 付近に潰れ**、個性が消えたうえ、
      //    年齢の効果が `basalGrowth` / `getAgeGrowthBase` と合わせて
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

      player.growthModifier = Math.max(-0.3, Math.round(modifier * 100) / 100);
    });
  });
}

// --- 自由契約選手の自主トレ成長 ---
// ⚠ **成長の式を二重に持たないこと**。以前はここだけ旧式（`zeroAge` の分岐＋
//    discipline の3乗の崖）が残っており、他が変わっても取り残されていた。
//    「チームが無い」ことは **練習量(`FA_VOLUME`)と環境(`FA_GAIN`)が低い**
//    という形で表す。プロ意識の効き方（`disciplineTrainMult`）は共通。
const FA_VOLUME = 0.55;   // 自主トレのみ。実戦も指導者も無い
const FA_GAIN = 0.80;     // 環境も無い（チーム所属のランクD 0.80 相当）
export function applyFreeAgentGrowth(pool) {
  const decayMult = (current, threshold, rate) => {
    if (current < threshold) return 1.0;
    return Math.max(0.10, 1.0 - (current - threshold) * rate);
  };

  for (const player of pool) {
    const age = player.age || 25;
    const gp = player.growthPotential || 1.0;
    const discipline = player.personality?.discipline ?? 50;

    // ⚠ growthPotential は年齢で減衰させない（`updateGrowthModifiers` の注記を参照）
    player.growthModifier = Math.max(-0.3, Math.round((player.growthModifier || 0) * 0.5 * 100) / 100);

    const basal = basalGrowth(age, gp);
    const practice = FA_VOLUME * disciplineTrainMult(discipline);

    const grow = (current, base, cap, threshold, rate) => {
      const delta = base * (basal + practice) * FA_GAIN * (0.6 + Math.random() * 0.6);
      if (delta >= 0) {
        return Math.min(cap, current + Math.round(delta * decayMult(current, threshold, rate)));
      }
      return Math.max(1, current + Math.round(delta));
    };

    if (player.position === 'pitcher') {
      if (player.pitching) {
        player.pitching.control  = grow(player.pitching.control,  3.0, 99,  70, 0.05);
        player.pitching.stamina  = grow(player.pitching.stamina,  2.0, 200, 80, 0.03);
        const velCap     = getVelocityCap(player.physical?.arm || 50);
        const velCatchup = getVelocityCatchupMult(player.physical?.arm || 50, player.pitching.velocity);
        player.pitching.velocity = grow(player.pitching.velocity, 0.5 * velCatchup, velCap, 150, 0.20);
      }
      if (player.physical) {
        player.physical.arm = grow(player.physical.arm, 1.0, 99, 80, 0.03);
      }
    } else {
      if (player.batting) {
        player.batting.meet    = grow(player.batting.meet,  3.0, 99, 70, 0.05);
        player.batting.power   = grow(player.batting.power, 1.5, 99, 70, 0.05);
        player.batting.eye     = grow(player.batting.eye,   2.0, 99, 70, 0.05);
      }
      if (player.physical) {
        player.physical.speed = grow(player.physical.speed, 0.5, 99, 80, 0.03);
        player.physical.arm   = grow(player.physical.arm,   0.5, 99, 80, 0.03);
      }
      if (player.fielding) {
        player.fielding.defense = grow(player.fielding.defense, 2.5, 99, 70, 0.05);
      }
    }

    // 知名度: 自主トレで結果を出しても無名のまま（知名度は試合出場で蓄積）
    // → 微増のみ（discipline 80+ で +1/年）
    if (discipline >= 80) {
      player.fame = Math.min(100, (player.fame || 0) + 1);
    }
  }
}

// ============================================================
// 実成長 = 基礎成長 + 練習成長
//
// 【住み分け】
//   成長率(growthPotential) … **基礎成長**。何もしなくても身体が育つ／衰える分。
//                              年齢の関数で、あるところからマイナスへ入る。
//   プロ意識(discipline)    … **練習成長に乗算**するもの。常に 0 以上。
//
// 基礎がマイナスへ入っても練習成長が上回れば伸び、釣り合えばステイ、
// 基礎の衰えが練習成長を超えたら**プロ意識が高くても衰える**。
// これで「20代中盤で衰える者」と「30代後半でも活躍する者」が同居する。
//
// ⚠ **旧実装は `effectiveFactor >= 0` で成長式と衰退式を切り替えていた**。
//    衰退式に `gp` が入っておらず、**プロ意識が低い選手は成長率がまったく
//    効かなかった**（意識0だと gp1.4 と gp0.6 が19歳から同じ -22.6/年）。
//    実測で母集団の3〜5割（19歳で30% / 28歳で55%）がその分岐に居た。
//    分岐を無くして和の符号だけで決めれば、両方が常に生きる。
// ============================================================

// 基礎成長のピークは **平坦**（18〜22歳）。身体的には18歳の方が伸びるので、
// 24歳に山を作らない。
//
// ⚠ **ピークの高さと衰え始めの散らばりはトレードオフ**。衰え始める年齢は
//    `基礎 = -練習` で決まるので、ピークが高いほどプロ意識の差が埋もれる。
//    実測: ピーク0.35 では 意識20/50/90 の衰え始めが 32/36/衰えず に潰れた
//    （練習量の差より基礎の下駄の方が大きいため）。0.14 まで下げて初めて
//    26/31/36 に開く。**基礎は「何もしなくても少しは伸びる」程度でよい**。
const BASAL_PEAK = 0.14;       // ピーク時の基礎成長（成長率1.0のとき）
const BASAL_PEAK_END = 22;
const BASAL_GP_SHIFT = 4;      // 成長率でピークの終わりが前後する（gp1.4→25.6歳）
const BASAL_DECAY = 0.086;     // ピーク以降、1歳ごとの落ち幅
const BASAL_ACCEL = 0.015;     // 下り坂はわずかに加速する
const BASAL_FLOOR = -1.8;

/**
 * 基礎成長。練習と無関係に身体が育つ／衰える分。
 *
 * ⚠ **`growthPotential` は年齢を含まない素の個性として渡すこと**。
 *    年齢の効果はこの関数が単独で担う（`applyAgeCurveChanges` の
 *    `getAgeGrowthBase` と合わせて2箇所。それ以外に年齢の項を作らない）。
 */
export function basalGrowth(age, gp = 1.0) {
  const g = Math.max(0.3, Math.min(1.8, gp));
  const peak = g * BASAL_PEAK;
  const peakEnd = BASAL_PEAK_END + (g - 1) * BASAL_GP_SHIFT;
  if (age <= peakEnd) return peak;
  const x = age - peakEnd;
  return Math.max(BASAL_FLOOR, peak - BASAL_DECAY * x * (1 + BASAL_ACCEL * x));
}

// 練習成長に掛かるプロ意識の倍率。**常に 0 以上**（練習は身体を削らない）。
// 意識10以下は「練習しない」＝基礎成長だけで生きる選手。
//   20→0.13 / 50→0.50 / 70→0.75 / 90→1.00 / 100→1.13
// ⚠ 幅を狭めると衰え始める年齢の散らばりが消える。この幅が
//   「20代中盤で終わる者」と「30代後半まで現役の者」を分けている。
const DISC_TRAIN_W = 1.25;
export function disciplineTrainMult(discipline = 50) {
  return Math.max(0, (discipline - 10) / 100) * DISC_TRAIN_W;
}

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
// カテゴリの調整点は **2つあり、役割が違う**。混同しないこと。
//
//   `volume` … **練習量**。和の内側（`基礎 + 練習×volume`）に入るので、
//              動かすと **衰え始める年齢が動く**（練習が基礎の衰えを打ち消すため）。
//              「そのカテゴリの選手は何歳まで伸びるか」を決める。
//   `gain`   … **環境の質**。和の外側に掛かるので **符号を変えない**＝
//              衰え始める年齢は動かさず、成長・衰退の**振れ幅だけ**を変える。
//              「そのカテゴリの選手はどれだけ速く伸びるか」を決める。
//
// ⚠ 指名の構成比を合わせるときは `gain` を動かすこと。`volume` で合わせると
//    衰え始める年齢まで一緒に動き、30代の選手像が壊れる（独立を volume で
//    2倍にすると衰え始めが38歳になり、ベテランが誰も衰えなくなる）。
// ⚠ **基礎成長に `volume` は掛からない**。身体が勝手に育つ分は所属先で変わらない。
// draft-check は `growYears` を指定して `applyCorporatePlayerGrowth` を
// 実際に回してから指名する（0 だと成長を一度も通らず、ここを動かしても測定に映らない）。
const CATEGORY_GROWTH = {
  // 独立: たった1つの武器に極端に寄せる。それ以外はほとんど伸びない
  independent: { volume: 1.34, gain: 1.78, topN: 1, strength: 2.6, weak: 0.20, focus: null },
  // 社会人: **技術で完成させる場所**。3カテゴリで技術系が最も伸びる。
  // ⚠ フィジカルを 0.7 まで下げたうえ技術も 1.5 止まりだったため、
  //    高卒→社会人ルート（19→22歳の3年）が**全進路で最弱**になっていた
  //    （実測 ドラフト到達 3〜6% 対 大学21〜24%）。実業団は設備も指導者も
  //    実戦もあるのだから、技術に関しては大学を上回って良い。
  corporate: {
    volume: 0.64, gain: 1.78, topN: 2, strength: 1.3, weak: 0.85,
    focus: { control: 1.9, meet: 1.9, eye: 1.8, defense: 1.8,
             velocity: 0.8, speed: 0.8, arm: 0.9, stamina: 1.0, power: 1.0 },
  },
  // クラブ: 基礎体力だけ。技術は独学なのでほとんど伸びない
  club: {
    volume: 0.86, gain: 1.35, topN: 2, strength: 1.25, weak: 0.9,
    focus: { velocity: 1.7, speed: 1.9, arm: 1.9, stamina: 1.7, power: 1.5,
             control: 0.5, meet: 0.5, eye: 0.5, defense: 0.6 },
  },
};

export function applyCorporatePlayerGrowth(allTeams) {
  const decayMult = (current, threshold, rate) => {
    if (current < threshold) return 1.0;
    return Math.max(0.10, 1.0 - (current - threshold) * rate);
  };

  for (const [, team] of Object.entries(allTeams)) {
    if (!team?.corporateData && !team?.independentLeagueId) continue;
    if (!team.players) continue;

    const isClub = team.corporateData?.type === 'club';
    const isIndependent = !!team.independentLeagueId;
    // 独立リーグはキャンプがあるためクラブよりも環境が整っている → ランクC相当
    const rank = team.corporateData?.rank || (isIndependent ? 'C' : 'D');
    const rankMult = { S: 1.15, A: 1.05, B: 1.0, C: 0.90, D: 0.80 }[rank] || 1.0;

    // カテゴリごとの育成の性格（`CATEGORY_GROWTH`）。
    // 従来は3カテゴリすべてが同じ傾斜（長所×1.4 / 短所×0.7）だった。
    const prof = CATEGORY_GROWTH[isClub ? 'club' : isIndependent ? 'independent' : 'corporate'];

    for (const player of team.players) {
      const age = player.age || 25;
      const gp = player.growthPotential || 1.0;
      const discipline = player.personality?.discipline ?? 50;

      // 実成長 = 基礎成長 + 練習成長（**分岐なし。和の符号がすべて**）。
      // 設計は冒頭の「実成長 = 基礎成長 + 練習成長」の節を参照。
      const basal = basalGrowth(age, gp);
      // 実戦に出ているほど練習量が増える（出場も練習のうち）
      const activity = player.position === 'pitcher'
        ? (player.seasonStats?.pitching?.gamesStarted || 0) * 20 + (player.seasonStats?.pitching?.gamesRelieved || 0) * 3
        : (player.seasonStats?.batting?.atBats || 0);
      const activityMult = 0.75 + Math.min(0.5, activity / 400);   // 0.75〜1.25
      const practice = (prof.volume ?? 1.0) * activityMult * disciplineTrainMult(discipline);

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
      const strengthKeys = new Set(statEntries.slice(0, prof.topN).map(e => e.key));
      const weakKeys = new Set(statEntries.slice(-2).map(e => e.key));
      const specMult = (key) => {
        const shape = strengthKeys.has(key) ? prof.strength : weakKeys.has(key) ? prof.weak : 1.0;
        return shape * (prof.focus?.[key] ?? 1.0);
      };

      const grow = (current, base, key, cap = 99, threshold = null, rate = 0.05) => {
        // 基礎は無方向（身体が勝手に育つ）。練習だけがカテゴリの性格を受ける
        const delta = base * (basal + practice * specMult(key))
          * rankMult * (prof.gain ?? 1.0) * (0.6 + Math.random() * 0.6);
        if (delta >= 0) {
          const amount = threshold != null ? delta * decayMult(current, threshold, rate) : delta;
          return Math.min(cap, current + Math.round(amount));
        }
        return Math.max(1, current + Math.round(delta));
      };

      if (player.position === 'pitcher') {
        if (player.pitching) {
          player.pitching.control = grow(player.pitching.control, 3.0, 'control', 99, 70, 0.05);
          player.pitching.stamina = grow(player.pitching.stamina, 2.0, 'stamina', 200, 80, 0.03);
          const ypVelCatchup = getVelocityCatchupMult(player.physical?.arm || 50, player.pitching.velocity);
          player.pitching.velocity = grow(player.pitching.velocity, 0.5 * ypVelCatchup, 'velocity', getVelocityCap(player.physical?.arm || 50), 150, 0.20);
        }
        if (player.physical) {
          player.physical.arm = grow(player.physical.arm, 1.0, 'arm', 99, 80, 0.03);
        }
      } else {
        if (player.batting) {
          player.batting.meet = grow(player.batting.meet, 3.0, 'meet', 99, 70, 0.05);
          player.batting.power = grow(player.batting.power, 1.5, 'power', 99, 70, 0.05);
          player.batting.eye = grow(player.batting.eye, 2.0, 'eye', 99, 70, 0.05);
        }
        if (player.physical) {
          player.physical.speed = grow(player.physical.speed, 0.5, 'speed', 99, 80, 0.03);
          player.physical.arm = grow(player.physical.arm, 0.5, 'arm', 99, 80, 0.03);
        }
        if (player.fielding) {
          player.fielding.defense = grow(player.fielding.defense, 2.5, 'defense', 99, 70, 0.05);
        }
      }

      // 知名度の蓄積: クラブでプロ意識が高い選手は地域で評判になる
      let fameGain = Math.floor(Math.random() * 3);
      if (isClub && discipline >= 65) {
        fameGain += Math.floor((discipline - 50) * 0.08);
      }
      player.fame = Math.min(100, (player.fame || 0) + fameGain);
    }
  }
}

// `applyCorporatePlayerGrowth` が「基礎成長＋練習成長」で面倒を見る能力。
// ⚠ **年齢カーブと二重に掛けないこと**。社会人・独立・クラブの選手は
//    両方の関数を通るので、重なった能力に年齢カーブまで掛けると
//    衰退が二重になり、30代の選手が実際の倍の速さで落ちる。
//    残り（回復力・体力・盗塁・バント、および投手の打撃能力）は
//    corporate 側が触らないので、こちらが単独で担う。
const CORPORATE_OWNED_STATS = {
  pitcher: new Set(['control', 'stamina', 'velocity', 'arm']),
  fielder: new Set(['meet', 'power', 'eye', 'speed', 'arm', 'defense']),
};

// --- 年齢カーブによる成長・衰退 ---
export function applyAgeCurveChanges(allTeams) {
  const updatedTeams = {};
  const ageReports = [];

  Object.entries(allTeams).forEach(([teamName, team]) => {
    // 社会人・独立・クラブは applyCorporatePlayerGrowth が年齢カーブごと担当する
    const corporateGrown = !!(team?.corporateData || team?.independentLeagueId);
    updatedTeams[teamName] = {
      ...team,
      players: team.players.map(player => {
        const age = player.age || 20;
        let updatedPlayer = JSON.parse(JSON.stringify(player));
        const changes = [];

        // 全能力について年齢カーブを適用
        const owned = corporateGrown
          ? CORPORATE_OWNED_STATS[player.position === 'pitcher' ? 'pitcher' : 'fielder']
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
          const MUSCLE_STATS = ['power', 'arm', 'speed', 'velocity', 'bodyStamina'];
          const DEXTERITY_STATS = ['meet', 'eye', 'defense', 'control', 'steal'];
          const muscle = player.physical?.muscle ?? 50;
          const dexterity = player.physical?.dexterity ?? 50;
          let physiqueMult = 1.0;
          if (MUSCLE_STATS.includes(stat)) {
            physiqueMult = 0.5 + (muscle / 100) * 1.0;
          } else if (DEXTERITY_STATS.includes(stat)) {
            physiqueMult = 0.5 + (dexterity / 100) * 1.0;
          }

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
          let change = rawChange > 0
            ? Math.round(rawChange * ageTalentMult * growthPotential * physiqueMult)
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

          const newValue = Math.max(1, currentValue + change);

          if (change !== 0) {
            updatedPlayer = setNestedValue(updatedPlayer, statPath, newValue);
            changes.push({
              stat, statName: getStatName(stat),
              before: currentValue, after: newValue, change
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
