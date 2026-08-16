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
      // 年齢による成長ポテンシャル減衰: 24歳から(age-23)*0.05ずつ加速
      const age = player.age || 18;
      if (age >= 24) {
        const agePenalty = (age - 23) * 0.05;
        player.growthPotential = Math.round(((player.growthPotential || 1.0) - agePenalty) * 100) / 100;
      }

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

// --- 自由契約選手の自主トレ成長（クラブ相当: discipline主導・環境なし） ---
export function applyFreeAgentGrowth(pool) {
  const decayMult = (current, threshold, rate) => {
    if (current < threshold) return 1.0;
    return Math.max(0.10, 1.0 - (current - threshold) * rate);
  };

  for (const player of pool) {
    const age = player.age || 25;
    if (age > 38) continue;

    const gp = player.growthPotential || 1.0;
    const discipline = player.personality?.discipline ?? 50;

    // growthPotential の加齢減衰（updateGrowthModifiers と同ロジック）
    if (age >= 24) {
      const agePenalty = (age - 23) * 0.05;
      player.growthPotential = Math.round(((player.growthPotential || 1.0) - agePenalty) * 100) / 100;
    }
    player.growthModifier = Math.max(-0.3, Math.round((player.growthModifier || 0) * 0.5 * 100) / 100);

    // 成長ゼロ年齢（クラブと同計算: 試合活動ゼロ扱い）
    const discBonus = Math.min(2, Math.max(0, (discipline - 60) * 0.05));
    const zeroAge = Math.min(32, Math.max(22, Math.round(26 + (gp - 1.0) * 15) + Math.floor(discBonus)));
    const ageFactor = Math.max(-2.0, 1.0 - (age - 18) / Math.max(1, zeroAge - 18));
    const practiceOffset = Math.max(0, (discipline - 60) * 0.0125);
    const effectiveFactor = ageFactor + practiceOffset;

    // クラブと同じ discipline 曲線（べき乗）: discipline 90 未満はほぼ成長なし
    const disciplineMult = Math.max(0.05, Math.pow(Math.max(0, (discipline - 80) / 20), 3.0) * 5.0);

    // ランクなし（チームなし）= D相当の 0.80 を適用
    const rankMult = 0.80;

    const grow = (current, base, cap, threshold, rate) => {
      if (effectiveFactor >= 0) {
        const amount = base * gp * rankMult * disciplineMult * effectiveFactor * (0.6 + Math.random() * 0.6);
        return Math.min(cap, current + Math.round(amount * decayMult(current, threshold, rate)));
      } else {
        return Math.max(1, current - Math.round(base * Math.abs(effectiveFactor) * 0.5 * (0.6 + Math.random() * 0.6)));
      }
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
// `level`: カテゴリごとの成長水準。指名の構成比を合わせるための調整点。
// ⚠ **まだ較正していない（全て1.0）**。draft-check のワールドは
//    `generateCorporateRoster` でロスターを作ってすぐ指名するため
//    `applyCorporatePlayerGrowth` を一度も呼ばず、ここを動かしても測定に映らない。
//    社会人・独立・クラブの構成比を合わせるには、**年次成長を回してから指名する
//    ハーネス**が要る（`loop.mjs` 相当）。それを作るまで触らないこと。
const CATEGORY_GROWTH = {
  // 独立: たった1つの武器に極端に寄せる。それ以外はほとんど伸びない
  independent: { level: 1.0, topN: 1, strength: 2.6, weak: 0.20, focus: null },
  // 社会人: **技術で完成させる場所**。3カテゴリで技術系が最も伸びる。
  // ⚠ フィジカルを 0.7 まで下げたうえ技術も 1.5 止まりだったため、
  //    高卒→社会人ルート（19→22歳の3年）が**全進路で最弱**になっていた
  //    （実測 ドラフト到達 3〜6% 対 大学21〜24%）。実業団は設備も指導者も
  //    実戦もあるのだから、技術に関しては大学を上回って良い。
  corporate: {
    level: 1.0, topN: 2, strength: 1.3, weak: 0.85,
    focus: { control: 1.9, meet: 1.9, eye: 1.8, defense: 1.8,
             velocity: 0.8, speed: 0.8, arm: 0.9, stamina: 1.0, power: 1.0 },
  },
  // クラブ: 基礎体力だけ。技術は独学なのでほとんど伸びない
  club: {
    level: 1.0, topN: 2, strength: 1.25, weak: 0.9,
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

    for (const player of team.players) {
      const age = player.age || 25;
      if (age > 38) continue;  // これ以降の衰退は applyAgeCurveChanges が単独で担う
      const gp = player.growthPotential || 1.0;
      const discipline = player.personality?.discipline ?? 50;

      // 成長ゼロ年齢: gp(個人差) + 試合活動量 + プロ意識で延長
      // gp=0.8→23歳, gp=1.0→26歳, gp=1.2→29歳（基準）+ 最大+4歳
      const activity = player.position === 'pitcher'
        ? (player.seasonStats?.pitching?.gamesStarted || 0) * 20 + (player.seasonStats?.pitching?.gamesRelieved || 0) * 3
        : (player.seasonStats?.batting?.atBats || 0);
      const gameBonus = Math.min(2, activity / 200);                            // 試合活動: 最大+2歳
      const discBonus = Math.min(2, Math.max(0, (discipline - 60) * 0.05));    // プロ意識: 最大+2歳
      const zeroAge = Math.min(32, Math.max(22,
        Math.round(26 + (gp - 1.0) * 15) + Math.floor(gameBonus + discBonus)
      ));

      // 年齢因子: 18歳→+1.0、zeroAgeで0に線形減衰、以降マイナス（下限-2.0）
      const ageFactor = Math.max(-2.0, 1.0 - (age - 18) / Math.max(1, zeroAge - 18));

      // 練習量による上下。**育成の幅の主役はここ**。
      // ⚠ 旧式は `Math.max(0, (disc-60)×0.0125)` で上向きだけ、しかも最大 +0.50。
      //    実測で「怠ける(意識20)⇔頑張る(意識90)」の4年間の差が **5.5点**
      //    （`calculatePlayerRank` の素点。1ランク=10点）＝ **0.55ランク**しかなく、
      //    才能ランクが実力をほぼ決めていた。
      //    両側にして中心を55に置く。意識50前後の選手の伸びは従来どおりで、
      //    上と下だけが開く＝**リーグ平均は動かさず幅だけ広げる**。
      // 下向きは上向きより急にする。**怠けた選手は「伸びない」ではなく「落ちる」**。
      // 上向きだけを強めても、才能の高い選手が怠けたときに何も起きない
      // （実測: 上向きだけだと 才能Sが4年で 39.9→38.6 とほぼ不変だった）。
      // ⚠ **中心は discipline の平均(50)に置くこと**。55に置いたら中央値の選手が
      //    毎年わずかに負側へ入り、6年でリーグ平均が 42.7→36.7 と崩れた。
      //      意識20 → -2.85 / 50 → 0（従来と同じ） / 70 → +0.90 / 90 → +1.80
      const practiceOffset = discipline >= 50
        ? (discipline - 50) * 0.045
        : (discipline - 50) * 0.095;

      // 実効成長因子: 0以上は成長・維持期、マイナスは衰退期
      // ⚠ 下限を切ること。切らないと 30代の意識の低い選手が年 -6 ずつ崩壊する
      const effectiveFactor = Math.max(-2.2, ageFactor + practiceOffset);

      // プロ意識による成長倍率（環境ごとに自主性の重要度が異なる）
      //
      // クラブ: 自主鍛錬のみ。べき乗曲線でdiscipline 70あたりから実用的な成長
      //   discipline 50→0.27x, 60→0.75x, 70→1.38x, 80→2.12x, 90→2.96x, 100→3.90x
      //   ランクD(×0.80)込み実質: 60→0.60x, 70→1.10x, 80→1.70x, 90→2.37x
      //
      // 独立: キャンプあり。disciplineがcamp効果を増幅（やや急峻な線形）
      //   discipline 50→1.0x, 70→1.4x, 90→1.8x
      //   ランクC(×0.90)込み実質: 50→0.90x, 70→1.26x, 90→1.62x
      //
      // 企業: 環境が補完。disciplineの影響は控えめ（緩やかな線形）
      //   discipline 50→1.0x, 70→1.3x, 90→1.6x
      // クラブ: 指導者が居ないので伸びるかどうかは本人次第。
      // ⚠ 旧式は3乗の**崖**で、discipline 85（上位3%）でも 0.078 とほぼゼロ。
      //   意識の高い選手と平凡な選手が**区別できていなかった**（どちらも実質0）。
      //   指数を緩めて「65あたりから見える差が付き、上限は低いまま」の曲線にする:
      //     55→0.10(下限) / 65→0.19 / 75→0.63 / 85→1.31 / 95→2.16 / 100→2.60
      //   平均(50)では従来どおりほぼ伸びない＝クラブが弱い場所である性格は変えない。
      const disciplineMult = isClub
        ? Math.max(0.10, Math.pow(Math.max(0, (discipline - 55) / 45), 1.9) * 2.6)
        : isIndependent
          // 独立は**プロ**なので、球団が面倒を見るのではなく本人の自主性で伸びる。
          // ⚠ 旧式は `Math.max(0, …)` で下向きが無く、**プロ意識50以下は全員ちょうど1.0**
          //    だった（discipline は N(50,18) なので半分の選手が下振れを受けない）。
          //    それは「環境が補完する社会人」の形であって、プロの形ではない。
          //    上側の傾きは据え置きなのでリーグ全体の戦力は上がらない（下側だけ薄くなる）。
          //    20→0.55 / 30→0.70 / 40→0.85 / 50→1.00 / 70→1.40 / 90→1.80
          ? (discipline >= 50
              ? 1.0 + (discipline - 50) * 0.020
              : Math.max(0.40, 1.0 + (discipline - 50) * 0.015))
          // 企業: 設備・指導者・実戦がすべて揃う。3カテゴリで最も環境が良い
          //   discipline 50→1.0x, 70→1.44x, 90→1.88x
          : 1.0 + Math.max(0, (discipline - 50) * 0.022);

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
      // カテゴリごとの育成の性格（`CATEGORY_GROWTH`）。
      // 従来は3カテゴリすべてが同じ傾斜（長所×1.4 / 短所×0.7）だった。
      const prof = CATEGORY_GROWTH[isClub ? 'club' : isIndependent ? 'independent' : 'corporate'];
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
        if (effectiveFactor >= 0) {
          // 成長・維持期: disciplineMultを乗算。
          // gpは加齢で大きくマイナスになりうるが、成長方向では下限0.15で扱う
          // （負のgpで"成長"が衰退に反転する二重衰退を防ぐ）。プロ意識で維持期に
          // 入ったベテランは、加齢カーブ(applyAgeCurveChanges)のみが衰退を担う。
          const gpGrow = Math.max(0.15, gp);
          let amount = base * gpGrow * rankMult * (prof.level ?? 1.0) * disciplineMult * effectiveFactor * specMult(key) * (0.6 + Math.random() * 0.6);
          if (threshold != null) amount *= decayMult(current, threshold, rate);
          return Math.min(cap, current + Math.round(amount));
        } else {
          // 衰退期: 純粋な衰え（disciplineMultは乗算しない）
          // ⚠ 減衰の強さは**プロ意識で変える**。一律に上げると平均的なベテランまで
          //    早く終わり、6年でリーグ平均が6点下がった。落ちるのは怠けた選手だけ。
          //      意識50→0.56 / 30→0.80 / 20→0.92（意識55以上は従来どおり0.5）
          const declineRate = 0.5 + Math.max(0, 55 - discipline) * 0.012;
          const declineAmount = base * Math.abs(effectiveFactor) * declineRate * (0.6 + Math.random() * 0.6);
          return Math.max(1, current - Math.round(declineAmount));
        }
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

// --- 年齢カーブによる成長・衰退 ---
export function applyAgeCurveChanges(allTeams) {
  const updatedTeams = {};
  const ageReports = [];

  Object.entries(allTeams).forEach(([teamName, team]) => {
    updatedTeams[teamName] = {
      ...team,
      players: team.players.map(player => {
        const age = player.age || 20;
        let updatedPlayer = JSON.parse(JSON.stringify(player));
        const changes = [];

        // 全能力について年齢カーブを適用
        const allStats = [...PHYSICAL_STATS, ...TECHNICAL_STATS];

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
