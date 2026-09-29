#!/usr/bin/env node
// ============================================================
// カテゴリ別の投手比率を年ごとに追う（企業 / クラブ / 独立 / 大学）
// 使い方: node tools/sim-harness/roster-mix-probe.mjs [年数=8]
// ============================================================
import './lib/bootstrap.mjs';
const { bootstrapWorld, advanceYear, TEAMS_DATA } = await import('./lib/world.mjs');
const Y = +process.argv[2] || 8;
const o = console.log; console.log = () => {}; console.warn = () => {};
let { seasonData } = bootstrapWorld();
const cat = (t) => t.universityData ? '大学' : t.corporateData?.type === 'corporate' ? '企業'
  : t.corporateData?.type === 'club' ? 'クラブ' : t.corporateData?.type === 'independent' ? '独立' : null;
const snap = (y) => {
  const acc = {};
  for (const t of Object.values(TEAMS_DATA)) {
    const k = cat(t); if (!k) continue;
    const a = (acc[k] ||= { p: 0, n: 0, teams: 0 });
    a.teams++; a.n += t.players.length; a.p += t.players.filter(p => p.position === 'pitcher').length;
  }
  o(`${String(y).padStart(2)}年 ` + Object.entries(acc).map(([k, a]) => `${k} ${(a.p / a.n * 100).toFixed(1)}% (${(a.n / a.teams).toFixed(1)}人)`).join(' / '));
};
console.log = o; snap(0); console.log = () => {};
for (let y = 1; y <= Y; y++) { seasonData = advanceYear(seasonData).nextSeasonData; console.log = o; snap(y); console.log = () => {}; }
