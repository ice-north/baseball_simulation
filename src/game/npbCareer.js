// ============================================================
// 教え子のプロ（NPB）キャリア - npbCareer.js
//
// 【役割】NPBを「見えるが操作できない」階層にする。
//
// ドラフトで送り出した選手は team.npbAlumni に能力のスナップショットだけが
// 残り、その後どうなったかは記録されていなかった。指名が「巣立ち」ではなく
// 「消滅」になっていたため、育てて送り出す動機が数字として返ってこない。
//
// ここでは毎オフに1シーズン分のプロ生活を進める:
//   一軍/二軍の判定 → 成績生成 → 年齢による成長と衰え → 引退判定
//
// 操作はさせない。プロを遊べるようにするとドラフトが単なる移籍になり、
// 送り出す重みが失われるため、あくまで「観る」階層として設計している。
// ============================================================

import { POSITION_GLOVE_WEIGHT } from './scoutTools.js';
import { applyNpbGrowth } from '../season/growthSystem.js';

// 一軍定着に必要な総合力。二軍暮らしとの境目
const FIRST_TEAM_THRESHOLD = 58;
const REGULAR_THRESHOLD = 68;
// ⚠ **枠は「登録29人」ではなく「1年のうちに一軍で使われた人数」**。
//    支配下は 70人×12球団＝840人、一軍登録は29人×12＝348人だが、
//    1シーズンに一軍で出場する選手は1球団40人前後＝**約480人（57%）**いる。
//    登録枠(41%)で切ると、線の上下が年をまたいでほとんど動かないため
//    一軍到達が26%までしか届かなかった（実NPB 40〜50%）。
//    規定到達級（レギュラー）は約110人＝13%。
const NPB_FIRST_TEAM_SHARE = 0.57;
const NPB_REGULAR_SHARE = 0.13;
// その年のめぐり合わせ（故障・チーム事情・出来）。総合力に足す振れ幅
const OPPORTUNITY_SD = 3.0;

/** 平均0・標準偏差1の正規乱数（Box-Muller） */
function gauss() {
  let u = 0; while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

// ============================================================
// ⚠ **守備・肩・リードが総合力に入っていなかった**
//
// 旧式は野手を ミート/パワー/選球眼/走力/守備 でしか見ておらず、
// **肩とリードの重みが 0**、守備もポジションに関わらず一律だった。
// そのため「一芸で指名されて大成する」という物語が**構造的に成立しない**:
//   甲斐型（肩100・リード85・打撃45）  → 57.5（一軍定着58に届かず3年で戦力外）
//   周東型（走力100・走塁95・打撃45）  → 56.5（同上）
//   源田型（守備95・肩80）             → 68.4（かろうじてレギュラー）
// ドラフトで一芸を拾えるようにしても、拾った先で必ず消えるので意味が無かった。
//
// **捕手・遊撃・中堅は「守れること自体が一軍の価値」**なので、
// 守備の重みをポジション別に持ち、捕手には肩とリードを厚く乗せる。
// 走塁（steal）も代走の価値として少しだけ見る。
// ============================================================

// ⚠ ポジション別の守備価値は `scoutTools.POSITION_GLOVE_WEIGHT` に一本化してある。
//    スカウトが下位で守備型を探すときの物差しと、プロで生き残れるかの物差しが
//    別々だと、「一芸で獲ったのに評価されない」が再発する。表を二重に作らないこと。
const DEF_WEIGHT = POSITION_GLOVE_WEIGHT;
// 平均的な守備の選手（守備50・肩50・リード50）が受け取る底上げ。
// ⚠ 各項は**50からの差**で足すこと。絶対値だと捕手だけ一律で+20されて全員が主力になる。
// ⚠ **打撃の重みは触らないこと**。一度 打撃を薄くして定数を厚く（DEF_BASE 11）したところ、
//    打てない選手ほど定数の恩恵を受けてリーグ全体の一軍到達が 77%→84% に膨らんだ。
//    定数は「旧式の守備項（守備60 → 0.18×60 = 10.8）」と釣り合う値にする。
const DEF_BASE = 8;

/**
 * 野手・投手それぞれの総合力（0-100目安）。
 * 基準は本編のシミュレーションで使っている「NPB相当」の能力値:
 *   投手 球速146/制球60/スタミナ85/肩60  → 約68
 *   野手 ミート58/パワー55/選球眼52/走力62/守備60/肩60 → 約69
 * 高卒ドラフト級は18歳時点で45〜55。数年かけて一軍ラインを越える。
 */
export function evaluateNpbAbility(a) {
  if (a.position === 'pitcher') {
    const p = a.pitching || {};
    const velScore = Math.max(0, ((p.velocity ?? 130) - 125)) * 1.7;   // 146km→35.7
    return Math.min(100,
      velScore * 0.55 + (p.control ?? 40) * 0.55 + (p.stamina ?? 60) * 0.12
      + ((a.physical?.arm ?? 45)) * 0.08);
  }
  const b = a.batting || {};
  const w = DEF_WEIGHT[a.position] || DEF_WEIGHT.left;
  const glove = ((a.fielding?.defense ?? 45) - 50) * (w.def || 0)
    + ((a.physical?.arm ?? 45) - 50) * (w.arm || 0)
    + ((a.catching?.lead ?? 50) - 50) * (w.lead || 0);
  return Math.min(100,
    (b.meet ?? 35) * 0.45 + (b.power ?? 25) * 0.32 + (b.eye ?? 30) * 0.14
    + ((a.physical?.speed ?? 45)) * 0.11 + ((b.steal ?? 50) - 50) * 0.05
    + DEF_BASE + glove);
}

/**
 * 年齢に応じた能力の変化を適用する。
 *
 * ⚠ **独自の成長式を持たないこと**。以前はここに専用の年齢係数
 *    （`age<=24: (2.6-(age-18)*0.25)*gp`）があり、**プロ意識も出場機会も
 *    見ずに全員を一様に伸ばして**いた。その結果、指名された選手の
 *    **一軍到達が86〜93%**（実NPB 40〜50%）になっていた。
 *    さらに成長と衰退で同じ倍率を使っており、38歳でミート60→14 まで落ちた。
 *    伸びやすさ・天井・ピーク年齢・衰えは `growthSystem.STAT_GROWTH` が
 *    単一の権威で、プロの性格は `CATEGORY_GROWTH.npb` の乗数だけで表す。
 */
function applyAging(a, isFirstTeam) {
  applyNpbGrowth(a, isFirstTeam);
}

/**
 * 一軍で投げた1シーズンの投手成績。
 * 役割(先発/リリーフ)は一度決まったら変わらない。毎年抽選すると
 * 「通算151勝106セーブ」のような、実在しない経歴が出来てしまう。
 */
function generatePitcherSeason(ability, isRegular, fixedRole = null) {
  const isStarter = isRegular && (fixedRole ? fixedRole === '先発' : Math.random() < 0.55);
  const ipBase = isStarter ? 100 + (ability - REGULAR_THRESHOLD) * 4.5
    : isRegular ? 45 + (ability - REGULAR_THRESHOLD) * 1.2 : 18;
  const ip = Math.max(4, Math.round((ipBase + (Math.random() * 40 - 20)) * 10) / 10);

  // 防御率: 総合力が高いほど良い。リーグ平均3.3付近を軸にする
  const eraBase = 3.60 - (ability - 70) * 0.08;   // 総合70→3.60 / 80→2.80 / 60→4.40
  const era = Math.max(0.8, Math.round((eraBase + (Math.random() * 1.8 - 0.9)) * 100) / 100);
  const k9 = Math.max(3.5, 5.2 + (ability - 60) * 0.14 + (Math.random() * 2 - 1));
  const bb9 = Math.max(0.7, 4.4 - (ability - 60) * 0.06 + (Math.random() * 1.4 - 0.7));

  // 決着数。先発は8回に1つ、リリーフは12回に1つが目安
  //（160回投げる先発で約20決着 = 実際のNPBのエース級と同じ）
  const decisions = Math.round(ip / (isStarter ? 8 : 12));
  const winRate = Math.max(0.15, Math.min(0.85, 0.5 + (ability - 62) * 0.012));
  const wins = Math.round(decisions * winRate);
  return {
    role: isStarter ? '先発' : isRegular ? '中継ぎ' : '二軍中心',
    ip, era,
    wins, losses: Math.max(0, decisions - wins),
    saves: (!isStarter && isRegular && ability > 74) ? Math.round(Math.random() * 25) : 0,
    strikeouts: Math.round(ip * k9 / 9),
    walks: Math.round(ip * bb9 / 9),
  };
}

/** 一軍で出た1シーズンの野手成績 */
function generateBatterSeason(ability, isRegular) {
  const paBase = isRegular ? 380 + (ability - REGULAR_THRESHOLD) * 12 : 110;
  const pa = Math.max(20, Math.round(paBase + (Math.random() * 120 - 60)));
  const ab = Math.round(pa * 0.885);

  // 打率: 総合力に連動。リーグ平均.247付近
  const avgBase = 0.265 + (ability - 70) * 0.0035;   // 総合70→.265 / 80→.300 / 60→.230
  const avg = Math.max(0.120, Math.min(0.360, avgBase + (Math.random() * 0.055 - 0.0275)));
  const hits = Math.round(ab * avg);
  const hrRate = Math.max(0, (ability - 60) * 0.0022 + (Math.random() * 0.012 - 0.005));
  const hr = Math.round(ab * hrRate);
  const doubles = Math.round(hits * (0.16 + Math.random() * 0.06));
  return {
    role: isRegular ? 'レギュラー' : '控え',
    pa, ab, hits, avg: Math.round(avg * 1000) / 1000,
    homeruns: hr, doubles,
    rbi: Math.round(hr * 2.6 + hits * 0.32 + Math.random() * 12),
    steals: Math.round(Math.max(0, ((ability - 55) * 0.15 + (Math.random() * 14 - 5)))),
  };
}

/**
 * 引退判定。能力が落ちきった選手、あるいは高齢で二軍暮らしの選手が辞める。
 * 34歳を超えると急速に引退が増える。
 */
function shouldRetire(a, ability) {
  if (a.age >= 40) return true;
  if (ability < 45 && a.age >= 26) return Math.random() < 0.55;
  if (a.age >= 34) return Math.random() < 0.18 + (a.age - 34) * 0.14;
  if (ability < 52 && a.age >= 30) return Math.random() < 0.35;
  // 二軍暮らしが続けば戦力外になる。これが無いと、一軍に上がれないまま
  // 34歳まで在籍し続ける選手だらけになり、8年以内の脱落が2%しか起きなかった。
  // ⚠ **「3年連続で二軍」を条件にしてはいけない**。めぐり合わせ(OPPORTUNITY_SD)で
  //    年に一度でも一軍に顔を出すとカウンタがリセットされ、この規則が
  //    ほとんど発火しなくなる（実測で在籍が969人まで膨らみ、実NPBの840を超えた）。
  //    **直近3年のうち一軍が1年以下**なら二軍暮らしと見なす。
  const recent = (a.npbSeasons || []).slice(-3);
  if (recent.length >= 3 && recent.filter(s => s.level === '一軍').length <= 1 && a.age >= 24) {
    return Math.random() < 0.30 + (a.age - 24) * 0.08;
  }
  return false;
}

/**
 * 教え子1人のプロ生活を1年進める。
 * @param {Object} a team.npbAlumni の1エントリ（破壊的に更新する）
 * @param {number} year 現在のゲーム内年度
 */
export function advanceNpbCareer(a, year, ctx = null) {
  if (!a || a.retired) return a;
  if (!Array.isArray(a.npbSeasons)) a.npbSeasons = [];
  // 同じ年を二重に処理しない（オフシーズン処理が複数回走っても安全にする）
  if (a.npbSeasons.some(s => s.year === year)) return a;
  if (year <= a.draftYear) return a;   // 指名された年はまだプロで投げていない

  a.age = (a.age ?? 22) + 1;
  // 前年に一軍だったか＝今年の出場機会。二軍が続くと伸びない
  const prevFirst = (a.npbSeasons || []).slice(-1)[0]?.level === '一軍';
  applyAging(a, prevFirst);
  const ability = evaluateNpbAbility(a);
  // ⚠ **一軍は「絶対的な能力の線」ではなく「枠の奪い合い」**。
  //    絶対値の閾値だけで判定していたため、指名された選手がほぼ全員それを超えて
  //    **一軍到達89% / レギュラー73%**（実NPB 40〜50% / 15〜20%）になっていた。
  //    アマ側の天井を下げても動かない——`evaluateNpbAbility` に椅子取りが無いのが本質。
  //    絶対値は「そもそもプロで通用するか」の床として残し、
  //    そのうえで**現役選手の中の順位**で枠を切る。
  const firstLine = Math.max(FIRST_TEAM_THRESHOLD, ctx?.firstTeamLine ?? -Infinity);
  const regLine = Math.max(REGULAR_THRESHOLD, ctx?.regularLine ?? -Infinity);
  // ⚠ **能力だけで枠を決めると、順位が動かないので誰も割り込めない**。
  //    線を引いただけの実装では 一軍到達40%（実40〜50）まで来るが、
  //    レギュラー到達が **9%**（実15〜20）から動かなかった。能力の年次変化が
  //    小さいので、一度決まった序列がキャリアを通してほとんど入れ替わらないため。
  //    実際は故障・チーム事情・その年の出来で「掴む年」と「棒に振る年」がある。
  //    **その年のめぐり合わせ**を毎年引き直して能力に足す。平均0なので枠の割合は動かない。
  const chance = gauss() * OPPORTUNITY_SD;
  const shown = ability + chance;
  const isFirstTeam = shown >= firstLine;
  const isRegular = isFirstTeam && shown >= regLine;

  // ⚠ **成績は「絶対的な能力」ではなく「リーグの中での位置」で出すこと**。
  //    `generateBatterSeason` は 総合70→.265 と絶対値で較正してあるが、
  //    枠を相対にした結果プールの水準がその物差しより上へ寄る（実測でレギュラーの
  //    線が 85）。絶対値のまま渡すと **リーグ打率.322 / 本塁打54本 / 防御率2.40 /
  //    23勝** という実在しない数字が出た。レギュラーの線を基準(REGULAR_THRESHOLD)に
  //    平行移動して渡す。ctx が無い場合は線＝基準なので従来どおり素通りする。
  const rel = shown - regLine + REGULAR_THRESHOLD;
  const stats = a.position === 'pitcher'
    ? generatePitcherSeason(rel, isRegular, a.npbRole)
    : generateBatterSeason(rel, isRegular);
  // 初めて一軍で役割が付いた時点で固定する
  if (a.position === 'pitcher' && !a.npbRole && (stats.role === '先発' || stats.role === '中継ぎ')) {
    a.npbRole = stats.role;
  }

  a.npbSeasons.push({
    year, age: a.age,
    level: isFirstTeam ? '一軍' : '二軍',
    regular: isFirstTeam && isRegular,
    ability: Math.round(ability),
    ...stats,
  });

  if (shouldRetire(a, ability)) {
    a.retired = true;
    a.retiredYear = year;
  }
  return a;
}

/**
 * 全チームの教え子を1年分進める。年度末（オフシーズン）に1回呼ぶ。
 * @returns {number} 処理した人数
 */
/** 現役の教え子の中で、一軍/レギュラーの枠に相当する能力の線を引く */
export function npbRosterLines(actives) {
  const vals = actives.map(evaluateNpbAbility).sort((x, y) => y - x);
  if (vals.length < 12) return { firstTeamLine: -Infinity, regularLine: -Infinity };
  const at = (frac) => vals[Math.min(vals.length - 1, Math.floor(vals.length * frac))];
  return { firstTeamLine: at(NPB_FIRST_TEAM_SHARE), regularLine: at(NPB_REGULAR_SHARE) };
}

export function processNpbCareers(allTeams, year) {
  let n = 0;
  const actives = [];
  for (const team of Object.values(allTeams || {})) {
    if (!Array.isArray(team?.npbAlumni)) continue;
    for (const a of team.npbAlumni) if (!a.retired && (a.age ?? 22) < 40) actives.push(a);
  }
  const ctx = npbRosterLines(actives);
  for (const team of Object.values(allTeams || {})) {
    if (!Array.isArray(team?.npbAlumni)) continue;
    for (const a of team.npbAlumni) {
      if (a.retired) continue;
      advanceNpbCareer(a, year, ctx);
      n++;
    }
  }
  return n;
}

/** 教え子1人の通算成績をまとめる（一軍のみ集計） */
export function summarizeNpbCareer(a) {
  const seasons = (a?.npbSeasons || []).filter(s => s.level === '一軍');
  if (seasons.length === 0) {
    return { years: (a?.npbSeasons || []).length, firstTeamYears: 0, line: '一軍出場なし' };
  }
  if (a.position === 'pitcher') {
    const ip = seasons.reduce((s, x) => s + (x.ip || 0), 0);
    const wins = seasons.reduce((s, x) => s + (x.wins || 0), 0);
    const losses = seasons.reduce((s, x) => s + (x.losses || 0), 0);
    const saves = seasons.reduce((s, x) => s + (x.saves || 0), 0);
    // 通算防御率は投球回で重み付けする
    const erSum = seasons.reduce((s, x) => s + (x.era || 0) * (x.ip || 0), 0);
    const era = ip > 0 ? erSum / ip : 0;
    return {
      years: a.npbSeasons.length, firstTeamYears: seasons.length,
      line: `${wins}勝${losses}敗${saves > 0 ? ` ${saves}S` : ''} 防${era.toFixed(2)} ${Math.round(ip)}回`,
    };
  }
  const ab = seasons.reduce((s, x) => s + (x.ab || 0), 0);
  const hits = seasons.reduce((s, x) => s + (x.hits || 0), 0);
  const hr = seasons.reduce((s, x) => s + (x.homeruns || 0), 0);
  const rbi = seasons.reduce((s, x) => s + (x.rbi || 0), 0);
  return {
    years: a.npbSeasons.length, firstTeamYears: seasons.length,
    line: `打率${ab > 0 ? (hits / ab).toFixed(3).replace(/^0/, '') : '---'} ${hits}安打 ${hr}本 ${rbi}打点`,
  };
}

/** 「教え子の現在地」一覧。活躍している順に並べる */
export function collectAlumniStatus(allTeams, userTeamName = null) {
  const rows = [];
  for (const [teamName, team] of Object.entries(allTeams || {})) {
    if (userTeamName && teamName !== userTeamName) continue;
    for (const a of team?.npbAlumni || []) {
      const last = (a.npbSeasons || [])[a.npbSeasons.length - 1] || null;
      rows.push({
        playerId: a.playerId, name: a.name, position: a.position,
        npbTeam: a.npbTeam, draftYear: a.draftYear, draftRound: a.draftRound,
        age: a.age, retired: !!a.retired, retiredYear: a.retiredYear,
        fromTeam: teamName,
        latest: last,
        summary: summarizeNpbCareer(a),
      });
    }
  }
  // 現役かつ一軍でよく出ている選手を上に
  const score = (r) => (r.retired ? -1000 : 0) + (r.latest?.level === '一軍' ? 500 : 0)
    + (r.latest?.ability || 0);
  rows.sort((x, y) => score(y) - score(x));
  return rows;
}
