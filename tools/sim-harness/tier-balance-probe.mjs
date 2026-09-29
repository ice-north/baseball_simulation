// 実ワールドを Y 年進め、ドラフトの巡目別の出どころと、カテゴリ別のスタメン野手・投手の水準を出す
// 使い方: node tools/sim-harness/tier-balance-probe.mjs [年数=5]
import './lib/bootstrap.mjs';
const { bootstrapWorld, advanceYear, TEAMS_DATA } = await import('./lib/world.mjs');
const Y = +process.argv[2] || 5;
const o = console.log; console.log = () => {}; console.warn = () => {};
let { seasonData } = bootstrapWorld();
const src = (s) => s === 'university_team' ? 'university' : s;
const byRound = {}; const all = {};
for (let y = 0; y < Y; y++) {
  const r = advanceYear(seasonData); seasonData = r.nextSeasonData;
  for (const d of r.draftedPlayers || []) {
    const k = src(d.source); const rd = d.draftRound === 'ドラフト1位' ? 'R1' : /育成/.test(d.draftRound) ? 'iku' : 'R2+';
    (byRound[rd] ||= {})[k] = (byRound[rd][k] || 0) + 1;
    all[k] = (all[k] || 0) + 1;
  }
}
console.log = o;
const fmt = (m) => { const t = Object.values(m).reduce((a, b) => a + b, 0); return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / t * 100).toFixed(0)}%`).join(' / ') + `  (n=${t})`; };
o('全体 ', fmt(all));
for (const rd of ['R1', 'R2+', 'iku']) if (byRound[rd]) o(rd.padEnd(4), fmt(byRound[rd]));
// カテゴリ別の水準（スタメン相当 = 野手の上位9人・投手の上位6人の中央値）
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) * p)] ?? 0; };
const cat = (t) => t.universityData ? 'univ' + (t.universityData.rank || '') : t.corporateData ? t.corporateData.type + (t.corporateData.rank || '') : 'other';
const agg = {};
for (const t of Object.values(TEAMS_DATA)) {
  const k = cat(t); const g = (agg[k] ||= { meet: [], power: [], eye: [], vel: [], ctl: [] });
  const F = t.players.filter(p => p.position !== 'pitcher').sort((a, b) => (b.batting.meet + b.batting.power) - (a.batting.meet + a.batting.power)).slice(0, 9);
  const P = t.players.filter(p => p.position === 'pitcher').sort((a, b) => b.pitching.velocity - a.pitching.velocity).slice(0, 6);
  F.forEach(p => { g.meet.push(p.batting.meet); g.power.push(p.batting.power); g.eye.push(p.batting.eye); });
  P.forEach(p => { g.vel.push(p.pitching.velocity); g.ctl.push(p.pitching.control); });
}
o('\nカテゴリ   meet 中央/95%/max | power 中央/95%/max | eye中央 | vel 中央/95% | ctl中央');
for (const k of Object.keys(agg).sort()) {
  const g = agg[k]; if (g.meet.length < 30) continue;
  o(k.padEnd(12), `${q(g.meet, .5)}/${q(g.meet, .95)}/${q(g.meet, 1)} | ${q(g.power, .5)}/${q(g.power, .95)}/${q(g.power, 1)} | ${q(g.eye, .5)} | ${q(g.vel, .5)}/${q(g.vel, .95)} | ${q(g.ctl, .5)}`);
}
