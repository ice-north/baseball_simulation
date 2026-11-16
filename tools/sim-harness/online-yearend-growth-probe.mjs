// オンラインの年度更新（自然成長）で、どの能力が・何歳で・どれだけ伸びるかを測る。
//
// ⚠ 先方指摘（2026-11-16）: 年度替わりの自然成長は「成長係数を見て、フィジカル・精神が中心、
//    若いほど伸びる」、キャンプは「プロ意識・体幹・器用さを見て、フィジカルと技術が中心」に分けたい。
//    年度更新の式（`growthSystem.js` の `applyOnlineNaturalGrowth`）を変えたらこれを回す。
//    node tools/sim-harness/online-yearend-growth-probe.mjs [回数=6]
import { createLeague, submitPhase, loadLeagueWorld } from '../../server/leagueEngine.mjs';
import { TEAMS_DATA } from '../../src/teams-data.js';
import { withSeededRandom } from '../../src/game/rng.js';
import { applyAgeCurveChanges, applyCorporatePlayerGrowth } from '../../src/season/growthSystem.js';
import { abilitySnapshot, abilityGains, campGainLabel } from '../../src/online/campGains.js';

const RUNS = Number(process.argv[2] || 6);
const quiet = (fn) => {
  const log = console.log;
  console.log = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
  }
};
const NOW = '2026-10-26T15:00:00.000Z';
const league = quiet(() => createLeague({ members: [{ userId: 'a' }], now: NOW }));
quiet(() =>
  submitPhase(league, 'a', { phaseId: league.phase.id, plan: { packId: league.packs[0].id }, ready: true }, NOW),
);
const names = league.season.settings.teamNames;
const base = structuredClone(league.game);
const band = (age) => (age <= 21 ? '〜21歳' : age <= 25 ? '22〜25歳' : age <= 29 ? '26〜29歳' : '30歳〜');
const sum = {};
const count = {};
for (let run = 0; run < RUNS; run++) {
  league.game = structuredClone(base);
  loadLeagueWorld(league);
  const teams = Object.fromEntries(names.map((n) => [n, structuredClone(TEAMS_DATA[n])]));
  for (const t of Object.values(teams)) for (const p of t.players) p.age = (p.age || 20) + 1;
  const before = new Map();
  for (const t of Object.values(teams)) for (const p of t.players) before.set(p.id, abilitySnapshot(p));
  const after = withSeededRandom(500 + run, () =>
    quiet(() => {
      const { updatedTeams } = applyAgeCurveChanges(teams, { online: new Set(names) });
      applyCorporatePlayerGrowth(updatedTeams, { online: new Set(names) });
      return updatedTeams;
    }),
  );
  for (const t of Object.values(after))
    for (const p of t.players) {
      const group = `${p.position === 'pitcher' ? '投手' : '野手'} ${band(p.age)}`;
      count[group] = (count[group] || 0) + 1;
      const diff = abilityGains(before.get(p.id), abilitySnapshot(p));
      for (const [key, v] of Object.entries(diff)) {
        if (key.startsWith('positionFitness.')) continue;
        const k = key.startsWith('pitch.') ? 'pitch' : key;
        (sum[group] ||= {})[k] = (sum[group][k] || 0) + v;
      }
    }
}
for (const group of Object.keys(count).sort()) {
  const line = Object.entries(sum[group] || {})
    .map(([k, v]) => [k, v / count[group]])
    .filter(([, v]) => Math.abs(v) >= 0.3)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k === 'pitch' ? '変化球' : campGainLabel(k)}${v > 0 ? '+' : ''}${v.toFixed(1)}`)
    .join(' ');
  console.log(`${group}（${count[group] / RUNS}人）: ${line}`);
}
