// ============================================================
// 「投手はルーキーから出てきて、野手は下積みを重ねる」が成立しているか
//
// ⚠ **npbAlumni を数えても答えは出ない**。あそこに載るのは
//    `source` が highschool / university（＝プール）**以外**、つまり
//    社会人・独立・クラブ・実体化した大学チームの選手だけで、実測すると
//    指名時の年齢が 22以上で95%を占める（＝即戦力ばかり）。
//    高卒野手の下積みは定義上そこに現れない。
//
//    ここでは `advanceYear` が返す**指名クラス全体**（高校生プール・
//    大学プールを含む）で影のNPBを作り、`advanceNpbCareer` を実物のまま回す。
//    椅子取りの線（`npbRosterLines`）も影のプール全体で引く——実NPBの
//    支配下840人に近い母集団になるので、実データと直接比べられる。
//
// ⚠ 1つのドラフト級を複製して数えないこと（同じ12人を数え直すので巡目別が
//    非単調に化ける）。**級ごと引き直す**（CLAUDE.md の既存の⚠）。
//
// 使い方: YEARS=12 node tools/sim-harness/npb-rookie-probe.mjs
// ============================================================
import { SRC } from './lib/bootstrap.mjs';
import { bootstrapWorld, advanceYear } from './lib/world.mjs';

const { advanceNpbCareer, npbRosterLines, evaluateNpbAbility } = await import(SRC + '/game/npbCareer.js');
const lineLog = [];

const YEARS = Number(process.env.YEARS || 12);
let { seasonData } = bootstrapWorld();

const pool = [];   // 影のNPB（指名クラス全体）
const clone = (o) => (o ? structuredClone(o) : null);

for (let y = 1; y <= YEARS; y++) {
  const r = advanceYear(seasonData);
  seasonData = r.nextSeasonData || seasonData;

  for (const e of (r.draftedPlayers || [])) {
    const p = e.player;
    if (!p) continue;
    pool.push({
      name: p.name, age: p.age, position: p.position,
      draftYear: y, draftRound: e.draftRound,
      // 高校生プール/大学プールは source が 'highschool' / 'university'。
      // 実体化した大学チームは 'university_team' なので大学へ寄せる。
      src: e.source === 'university_team' ? 'university' : (e.isClub ? 'club' : e.source),
      batting: clone(p.batting), pitching: clone(p.pitching),
      physical: clone(p.physical), fielding: clone(p.fielding),
      catching: clone(p.catching), positionFitness: clone(p.positionFitness),
      growthPotential: p.growthPotential, personality: clone(p.personality),
      npbSeasons: [],
    });
    pool[pool.length - 1].abilityAtDraft = evaluateNpbAbility(pool[pool.length - 1]);
  }

  // 影のプールを1年進める（指名直後の年は advanceNpbCareer 側の
  // `year <= draftYear` ガードで自動的に飛ばされる）
  const actives = pool.filter(a => !a.retired && (a.age ?? 22) < 40);
  const ctx = npbRosterLines(actives);
  lineLog.push({ y, n: actives.length, ...ctx });
  for (const a of pool) if (!a.retired) advanceNpbCareer(a, y, ctx);
}

const played = pool.filter(a => a.npbSeasons.length);
const P = (a) => a.position === 'pitcher';
const pct = (n, d) => d ? `${(n / d * 100).toFixed(0)}%` : '—';
const ss = (a) => a.npbSeasons.slice().sort((x, y) => x.year - y.year);
const debutIdx = (a) => ss(a).findIndex(s => s.level === '一軍');

console.log(`\n■ 指名クラス全体の影のNPB（${YEARS}年 / 指名 ${pool.length}名 / 出場記録あり ${played.length}名）`);
console.log(`  現役 ${pool.filter(a => !a.retired).length}名（実NPBの支配下は約840名）`);
console.log('─'.repeat(72));
const old8 = played.filter(a => a.draftYear + 8 <= YEARS);
console.log(`  一軍到達（キャリア中1度でも） ${pct(played.filter(a => debutIdx(a) >= 0).length, played.length)}   実NPB 40〜50%`);
console.log(`  レギュラー到達               ${pct(played.filter(a => a.npbSeasons.some(s => s.regular)).length, played.length)}   実NPB 15〜20%`);
console.log(`  8年以内に引退                ${pct(old8.filter(a => a.retired).length, old8.length)}   実NPB 40前後   （母数 ${old8.length}）`);

console.log('\n■ 1年目（投手 / 野手）');
console.log('─'.repeat(72));
console.log('            人数    1年目一軍    1年目レギュラー');
for (const k of [true, false]) {
  const g = played.filter(a => P(a) === k);
  const s1 = g.map(a => ss(a)[0]);
  console.log(`  ${k ? '投手' : '野手'}  ${String(g.length).padStart(7)}` +
    `${pct(s1.filter(s => s.level === '一軍').length, g.length).padStart(11)}` +
    `${pct(s1.filter(s => s.regular).length, g.length).padStart(16)}`);
}

console.log('\n■ 初めて一軍に上がるまで（下積みの長さ）');
console.log('─'.repeat(72));
const bucket = (g) => {
  const idx = g.map(debutIdx);
  const c = (f) => pct(idx.filter(f).length, g.length);
  return `${c(i => i === 0).padStart(9)}${c(i => i === 1 || i === 2).padStart(11)}` +
         `${c(i => i >= 3).padStart(12)}${c(i => i < 0).padStart(11)}`;
};
console.log('                     1年目     2-3年目    4年目以降   到達せず');
for (const k of [true, false]) {
  console.log(`  ${k ? '投手' : '野手'}（全体）      ${bucket(played.filter(a => P(a) === k))}`);
}
console.log();
for (const src of ['highschool', 'university', 'corporate', 'independent', 'club']) {
  const label = { highschool: '高卒', university: '大卒', corporate: '社会人', independent: '独立', club: 'クラブ' }[src];
  for (const k of [true, false]) {
    const g = played.filter(a => a.src === src && P(a) === k);
    if (g.length < 8) continue;
    console.log(`  ${label}${k ? '投手' : '野手'}`.padEnd(16) + `${String(g.length).padStart(4)}人 ${bucket(g)}`);
  }
}
console.log('\n■ 巡目別の1年目');
console.log('─'.repeat(72));
const roundOf = (a) => {
  const s = String(a.draftRound || '');
  if (s.startsWith('育成')) return '育成';
  const n = Number((s.match(/(\d+)/) || [])[1] || 0);
  return n === 1 ? '1位' : n <= 3 ? '2〜3位' : n <= 5 ? '4〜5位' : '6位以降';
};
console.log('              人数    1年目一軍    1年目レギュラー');
for (const r of ['1位', '2〜3位', '4〜5位', '6位以降', '育成']) {
  const g = played.filter(a => roundOf(a) === r);
  if (!g.length) continue;
  const s1 = g.map(a => ss(a)[0]);
  console.log(`  ${r.padEnd(8)}${String(g.length).padStart(6)}` +
    `${pct(s1.filter(s => s.level === '一軍').length, g.length).padStart(11)}` +
    `${pct(s1.filter(s => s.regular).length, g.length).padStart(16)}`);
}
const rookieReg = played.filter(a => ss(a)[0]?.regular);
console.log(`\n  1年目からレギュラー ${(rookieReg.length / YEARS).toFixed(1)}人/学年   実NPB 3〜6人`);
console.log(`    うち高卒          ${(rookieReg.filter(a => a.src === 'highschool').length / YEARS).toFixed(2)}人/学年   実NPB 0.2〜0.3人`);

// ⚠ 「1年目に上がりすぎる」を疑うときは、**線ではなく指名時の能力**を見ること。
//    年功の項を足して塞ぐのは禁じ手（CLAUDE.md「1年目からレギュラーになる選手は
//    塞がない」）なので、下積みは「指名時に線の下にいて、伸びて超える」でしか作れない。
console.log('\n■ 指名時の能力（`evaluateNpbAbility`）と、その年の一軍の線');
console.log('─'.repeat(72));
const last = lineLog[lineLog.length - 1];
console.log(`  最終年の線: 投手 一軍 ${last.pitcher.firstTeamLine.toFixed(1)} / レギュラー ${last.pitcher.regularLine.toFixed(1)}`);
console.log(`              野手 一軍 ${last.fielder.firstTeamLine.toFixed(1)} / レギュラー ${last.fielder.regularLine.toFixed(1)}   （現役 ${last.n}名）`);
const med = (arr) => arr.length ? arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)] : NaN;
console.log('\n                   人数   指名時の能力(中央)   線を超えている割合');
for (const src of ['highschool', 'university', 'corporate', 'independent']) {
  const label = { highschool: '高卒', university: '大卒', corporate: '社会人', independent: '独立' }[src];
  for (const k of [true, false]) {
    const g = pool.filter(a => a.src === src && P(a) === k);
    if (g.length < 8) continue;
    const line = k ? last.pitcher.firstTeamLine : last.fielder.firstTeamLine;
    console.log(`  ${label}${k ? '投手' : '野手'}`.padEnd(18) + `${String(g.length).padStart(4)}人` +
      `${med(g.map(a => a.abilityAtDraft)).toFixed(1).padStart(16)}` +
      `${pct(g.filter(a => a.abilityAtDraft >= line).length, g.length).padStart(20)}`);
  }
}

// ⚠ **下積みが成立するかは「新人が現役の中でどれだけ下にいるか」で決まる**。
//    指名時の能力が既に現役の中央値なら、どんな線を引いても1年目から上がる。
//    伸びしろ＝入団後に順位がどれだけ上がるかを直接見る。
console.log('\n■ 入団してからの伸び（現役の中の位置。50 が中央）');
console.log('─'.repeat(72));
const alive = pool.filter(a => a.npbSeasons.length);
console.log('              指名時   +3年   +6年   （能力の中央値）');
for (const k of [true, false]) {
  const g = alive.filter(a => P(a) === k);
  const at = (n) => {
    const vs = g.map(a => ss(a)[n - 1]?.ability).filter(v => v != null);
    return vs.length ? med(vs) : NaN;
  };
  console.log(`  ${k ? '投手' : '野手'}      ` +
    `${med(g.map(a => a.abilityAtDraft)).toFixed(1).padStart(8)}` +
    `${at(3).toFixed(1).padStart(7)}${at(6).toFixed(1).padStart(7)}`);
}

console.log('\n  ねらい: 投手は1年目から一軍に顔を出す（球速という武器1つで中継ぎとして使える）。');
console.log('          野手、とくに高卒野手は2〜4年の下積みを経てから出てくる。');
console.log();
