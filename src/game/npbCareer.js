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

// 一軍定着に必要な総合力。二軍暮らしとの境目
const FIRST_TEAM_THRESHOLD = 58;
const REGULAR_THRESHOLD = 68;      // ここを超えるとレギュラー（規定到達級の出場数）

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
 * 22歳前後までは伸び、27歳前後がピーク、30代から落ちる。
 * 成長力(growthPotential)が高い選手ほど伸び幅が大きく、衰えも遅い。
 */
function applyAging(a) {
  const age = a.age;
  const gp = a.growthPotential ?? 1.0;
  // 年齢係数。18-24は成長、25-28は微増、29+は下降
  let delta;
  if (age <= 24) delta = (2.6 - (age - 18) * 0.25) * gp;
  else if (age <= 28) delta = 0.5 * gp;
  // ⚠ 衰退の傾きは 0.75 では急すぎた（10年で累計 -41点）。実データ基準の
  //    減衰率（能力の -2〜-22%）に合わせて 0.22 にし、能力ごとの差は
  //    `DECLINE_MULT` で付ける。
  else delta = -(age - 28) * 0.22;

  // ⚠ **成長と衰退で同じプロファイルを使ってはいけない**。アマ側
  //    （`growthSystem.STAT_GROWTH[].decline`）で直したのと同じ欠陥がここにもあった。
  //    実測（28→38歳）: ミート **-76%** / 選球眼 **-76%** / 制球 **-79%** / 走力 -48% と
  //    38歳の選手がミート60→14 まで落ちていた。しかも**順序が逆**で、
  //    コメントに「制球は歳を取っても保たれやすい」と書いてあるのに
  //    制球(1.15)が球速(0.55)の2倍速く落ちていた。
  //    衰退側はアマ側と同じ実データ基準（走力-22 / 肩-15 / スタミナ-15 /
  //    パワー-10 / 守備-10 / ミート-8 / 球速-8 / 制球-3 / 選球眼-2%）に揃える。
  const DECLINE_MULT = {
    velocity: 0.97, control: 0.15, stamina: 1.05,
    meet: 0.40, power: 0.45, eye: 0.09, speed: 1.09, steal: 1.00, arm: 0.74, defense: 0.50,
  };
  const bump = (obj, key, mult = 1, lo = 1, hi = 100) => {
    if (!obj || obj[key] == null) return;
    const m = delta < 0 ? (DECLINE_MULT[key] ?? mult) : mult;
    const v = obj[key] + delta * m * (0.6 + Math.random() * 0.8);
    obj[key] = Math.max(lo, Math.min(hi, Math.round(v)));
  };

  if (a.position === 'pitcher') {
    // 球速は落ちやすく戻りにくい、制球は歳を取っても保たれやすい
    bump(a.pitching, 'velocity', 0.55, 110, 168);
    bump(a.pitching, 'control', 1.15, 1, 100);
    bump(a.pitching, 'stamina', 0.7, 20, 100);
  } else {
    bump(a.batting, 'meet', 1.1);
    bump(a.batting, 'power', 0.9);
    bump(a.batting, 'eye', 1.0);
    bump(a.physical, 'speed', 0.7);
    bump(a.batting, 'steal', 0.6);      // 足に連動する
    bump(a.physical, 'arm', 0.5);       // 肩は落ちるが打撃ほどではない
    bump(a.fielding, 'defense', 0.6);
    // リードは経験で積み上がる。衰えるのは肩と足であって配球ではない
    if (a.position === 'catcher' && a.catching?.lead != null) {
      a.catching.lead = Math.min(99, Math.round(a.catching.lead + Math.max(0.4, delta * 0.5)));
    }
  }
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
  // 34歳まで在籍し続ける選手だらけになり、8年以内の脱落が2%しか起きなかった
  const recent = (a.npbSeasons || []).slice(-3);
  if (recent.length >= 3 && recent.every(s => s.level === '二軍') && a.age >= 24) {
    return Math.random() < 0.30 + (a.age - 24) * 0.08;
  }
  return false;
}

/**
 * 教え子1人のプロ生活を1年進める。
 * @param {Object} a team.npbAlumni の1エントリ（破壊的に更新する）
 * @param {number} year 現在のゲーム内年度
 */
export function advanceNpbCareer(a, year) {
  if (!a || a.retired) return a;
  if (!Array.isArray(a.npbSeasons)) a.npbSeasons = [];
  // 同じ年を二重に処理しない（オフシーズン処理が複数回走っても安全にする）
  if (a.npbSeasons.some(s => s.year === year)) return a;
  if (year <= a.draftYear) return a;   // 指名された年はまだプロで投げていない

  a.age = (a.age ?? 22) + 1;
  applyAging(a);
  const ability = evaluateNpbAbility(a);
  const isFirstTeam = ability >= FIRST_TEAM_THRESHOLD;
  const isRegular = ability >= REGULAR_THRESHOLD;

  const stats = a.position === 'pitcher'
    ? generatePitcherSeason(ability, isRegular, a.npbRole)
    : generateBatterSeason(ability, isRegular);
  // 初めて一軍で役割が付いた時点で固定する
  if (a.position === 'pitcher' && !a.npbRole && (stats.role === '先発' || stats.role === '中継ぎ')) {
    a.npbRole = stats.role;
  }

  a.npbSeasons.push({
    year, age: a.age,
    level: isFirstTeam ? '一軍' : '二軍',
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
export function processNpbCareers(allTeams, year) {
  let n = 0;
  for (const team of Object.values(allTeams || {})) {
    if (!Array.isArray(team?.npbAlumni)) continue;
    for (const a of team.npbAlumni) {
      if (a.retired) continue;
      advanceNpbCareer(a, year);
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
