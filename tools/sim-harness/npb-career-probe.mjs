// ============================================================
// 教え子のプロキャリア（`npbCareer`）の較正値を測り直す
//
// ⚠ CLAUDE.md の旧い表（一軍到達44〜48% など）は **npbAlumni の50%が
//    能力を持たない幽霊レコードだった頃**の値。幽霊は常に既定値（投手37.5 /
//    野手38.6）で一軍0%だったので、実体の高い率と平均されて実NPBに
//    一致して見えていた。幽霊を消したので全部測り直す。
//
// ⚠ **母集団を「ドラフト指名者全体」と取り違えないこと**。npbAlumni に載るのは
//    `source` が highschool / university（＝プール）**以外**、つまり
//    社会人・独立・クラブ・実体化した大学チームの選手だけ。
//    高卒・大学プール出身は最初から1人も入らないので、
//    実NPBの「指名者全体の一軍到達 40〜50%」と直接比べてはいけない。
// ============================================================
import { SRC } from './lib/bootstrap.mjs';
import { bootstrapWorld, advanceYear, TEAMS_DATA } from './lib/world.mjs';

const YEARS = Number(process.env.YEARS || 12);
let { seasonData } = bootstrapWorld();
for (let y = 1; y <= YEARS; y++) { const r = advanceYear(seasonData); seasonData = r.nextSeasonData || seasonData; }

const all = [];
for (const t of Object.values(TEAMS_DATA)) for (const a of (t.npbAlumni || [])) all.push(a);
const withSeasons = all.filter(a => (a.npbSeasons || []).length);
const actives = all.filter(a => !a.retired);
const pct = (n, d) => d ? `${(n / d * 100).toFixed(0)}%` : '—';
const P = (a) => a.position === 'pitcher';
const seasonsOf = (a) => a.npbSeasons.slice().sort((x, y) => x.year - y.year);

console.log(`\n■ 教え子のプロキャリア（${YEARS}年・定常）`);
console.log('─'.repeat(64));
console.log(`  npbAlumni 総数 ${all.length} / 現役 ${actives.length}`);
console.log(`  一軍到達（キャリア中1度でも） ${pct(withSeasons.filter(a => a.npbSeasons.some(s => s.level === '一軍')).length, withSeasons.length)}`);
console.log(`  レギュラー到達               ${pct(withSeasons.filter(a => a.npbSeasons.some(s => s.regular)).length, withSeasons.length)}`);
const old8 = withSeasons.filter(a => (a.draftYear ?? 0) + 8 <= YEARS);
console.log(`  8年以内に引退                ${pct(old8.filter(a => a.retired).length, old8.length)}   （母数 ${old8.length}）`);

// ⚠ 母集団の中身を出すこと。ここを見ずに実NPBの数字と比べると必ず誤診する
console.log('\n■ 母集団の中身（指名時の年齢）');
console.log('─'.repeat(64));
const ages = withSeasons.map(a => a.age - (a.npbSeasons.length)).filter(v => v > 10);
const bands = [[0, 19, '〜19（高卒相当）'], [20, 21, '20-21'], [22, 22, '22（大卒相当）'], [23, 25, '23-25（社会人相当）'], [26, 99, '26+']];
for (const [lo, hi, label] of bands) {
  const n = ages.filter(v => v >= lo && v <= hi).length;
  if (n) console.log(`  ${label.padEnd(20)} ${String(n).padStart(4)}人  ${pct(n, ages.length)}`);
}
console.log('  ⚠ 高卒・大学プール出身は npbAlumni に入らない（チームに所属していないため）。');

console.log('\n■ 1年目（投手 / 野手）— ここが今回の論点');
console.log('─'.repeat(64));
console.log('            人数    1年目一軍    1年目レギュラー');
for (const k of [true, false]) {
  const g = withSeasons.filter(a => P(a) === k);
  const s1 = g.map(a => seasonsOf(a)[0]);
  console.log(`  ${k ? '投手' : '野手'}  ${String(g.length).padStart(7)}` +
    `${pct(s1.filter(s => s.level === '一軍').length, g.length).padStart(11)}` +
    `${pct(s1.filter(s => s.regular).length, g.length).padStart(16)}`);
}

console.log('\n■ 初めて一軍に上がるまで（下積みの長さ）');
console.log('─'.repeat(64));
console.log('            1年目     2-3年目    4年目以降   到達せず');
for (const k of [true, false]) {
  const g = withSeasons.filter(a => P(a) === k);
  const idx = g.map(a => seasonsOf(a).findIndex(s => s.level === '一軍'));
  const c = (f) => idx.filter(f).length;
  console.log(`  ${k ? '投手' : '野手'}  ` +
    `${pct(c(i => i === 0), g.length).padStart(9)}` +
    `${pct(c(i => i === 1 || i === 2), g.length).padStart(11)}` +
    `${pct(c(i => i >= 3), g.length).padStart(12)}` +
    `${pct(c(i => i < 0), g.length).padStart(11)}`);
}

console.log('\n■ リーグの数字（一軍の年だけ集計）');
console.log('─'.repeat(64));
const sea = withSeasons.flatMap(a => a.npbSeasons.filter(s => s.level === '一軍').map(s => ({ ...s, p: P(a) })));
const bat = sea.filter(s => !s.p && s.ab > 50);
const pit = sea.filter(s => s.p && s.ip > 20);
const sum = (a, f) => a.reduce((s, v) => s + f(v), 0);
if (bat.length) console.log(`  打率 ${(sum(bat, s => s.hits) / sum(bat, s => s.ab)).toFixed(3)}   実NPB .247`);
if (pit.length) {
  // ⚠ **防御率は投球回で重み付けすること**。単純平均だと 18回しか投げない
  //    敗戦処理と 160回のエースが同じ重みになり、実際より 0.3〜0.4 高く出る
  const ipw = sum(pit, s => s.era * s.ip) / sum(pit, s => s.ip);
  console.log(`  防御率 ${ipw.toFixed(2)}（投球回重み） / ${(sum(pit, s => s.era) / pit.length).toFixed(2)}（単純平均）   実NPB 3.30`);
  console.log(`  規定級（100回以上）の防御率 ${(sum(pit.filter(s => s.ip >= 100), s => s.era * s.ip) / Math.max(1, sum(pit.filter(s => s.ip >= 100), s => s.ip))).toFixed(2)}`);
}
console.log();
