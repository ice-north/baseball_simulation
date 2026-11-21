// CPUから人の球団へのトレード提案の中身を並べる（いしだ 2026-11-20「主力を駄選手と交換しようとする」）。
// 使い方: node tools/sim-harness/probe/cpu-offer-probe.mjs [ターン数] [種]
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import '../lib/bootstrap.mjs';
import { createTestStore } from '../lib/testStore.mjs';
import { LeagueService } from '../../../server/leagueService.mjs';
import { defaultPhasePlan } from '../../../server/leagueEngine.mjs';
import { createTradeJudge } from '../../../server/tradeJudge.mjs';
import { squadStrength, bestSlot } from '../../../src/online/tradeSearch.js';

const TURNS = Number(process.argv[2] || 120);
const SEED = process.argv[3];
const quiet = async (fn) => { const log = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = log; } };
const dir = await mkdtemp(join(tmpdir(), 'cpu-offer-probe-'));
try {
  const store = createTestStore(join(dir, 'state.gz'));
  let now = '2026-10-26T15:00:00.000Z';
  const service = new LeagueService(store, { members: [{ userId: 'admin', label: '管理者' }], adminId: 'admin', allowStep: true, clock: () => now });
  const sessionId = (await service.login('admin')).sessionId;
  let seq = 0;
  const send = async (type, payload) => {
    const l = (await store.read()).league; seq += 1;
    return service.command('admin', sessionId, { requestId: `p-${type}-${seq}`, revision: l?.revision ?? 0, type, payload });
  };
  await quiet(() => send('create', SEED ? { seed: Number(SEED) } : undefined));
  for (let i = 0; i < 4; i += 1) {
    const l = (await store.read()).league; if (!l.phase) break;
    await send('submit', { phaseId: l.phase.id, plan: defaultPhasePlan(l, l.members[0].teamName), ready: true, baseSubmission: null });
  }
  const seen = new Set();
  const rows = [];
  for (let i = 0; i < TURNS; i += 1) {
    await quiet(() => send('step'));
    now = new Date(Date.parse(now) + 3600000).toISOString();
    const l = (await store.read()).league;
    for (const t of l.trades || []) {
      if (t.from !== null || seen.has(t.id)) continue;
      seen.add(t.id);
      const teams = Object.fromEntries(Object.entries(l.game.teams).map(([n, team]) => [n, team.players]));
      const judge = createTradeJudge(teams);
      const human = teams[t.toTeam], cpu = teams[t.fromTeam];
      const give = cpu.filter((p) => t.offer.includes(p.id));
      const get = human.filter((p) => t.want.includes(p.id));
      const after = (mine, theirs, out, inn) => [...mine.filter((p) => !out.includes(p.id)), ...theirs.filter((p) => inn.includes(p.id))];
      const cpuGain = squadStrength(after(cpu, human, t.offer, t.want)) - squadStrength(cpu);
      const humanGain = squadStrength(after(human, cpu, t.want, t.offer)) - squadStrength(human);
      const ranked = [...human].sort((a, b) => judge.valueOf(b) - judge.valueOf(a));
      const sum = (ps, f) => ps.reduce((a, p) => a + f(p), 0);
      const vGive = sum(give, (p) => judge.valueOf(p));
      const vGet = sum(get, (p) => judge.valueOf(p));
      const vGetHuman = sum(get, (p) => judge.valueOf(p, t.toTeam));
      rows.push({ day: `${l.season.currentDate.month}/${l.season.currentDate.day}`, from: t.fromTeam,
        give: give.map((p) => `${p.name}(${p.age},${bestSlot(p)?.key},${bestSlot(p)?.strength?.toFixed(0)})`).join('+'),
        get: get.map((p) => `${p.name}(${p.age},${bestSlot(p)?.key},${bestSlot(p)?.strength?.toFixed(0)},#${ranked.indexOf(p) + 1})`).join('+'),
        cpuGain: cpuGain.toFixed(1), humanGain: humanGain.toFixed(1),
        valueRatio: (vGive / vGet).toFixed(2), humanSideRatio: (vGive / vGetHuman).toFixed(2) });
    }
  }
  console.table(rows);
} finally { await rm(dir, { recursive: true, force: true }); }
