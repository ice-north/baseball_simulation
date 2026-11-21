// CPUから人への提案が、どの線で落ちるかを数える（1つの日の名簿で、CPU全球団→人の球団）。
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import '../lib/bootstrap.mjs';
import { createTestStore } from '../lib/testStore.mjs';
import { LeagueService } from '../../../server/leagueService.mjs';
import { defaultPhasePlan } from '../../../server/leagueEngine.mjs';
import { createTradeJudge } from '../../../server/tradeJudge.mjs';
import { tradeFactorFor } from '../../../server/coachEngine.mjs';
import { cpuTradeDecision } from '../../../src/online/trades.js';
import { tradeStrengthGap } from '../../../src/online/tradeSearch.js';
import { planCpuTrade, CPU_OFFER_VALUE_FLOOR } from '../../../server/cpuTrades.mjs';

const STEPS = Number(process.argv[2] || 10);
const quiet = async (fn) => { const log = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = log; } };
const dir = await mkdtemp(join(tmpdir(), 'cpu-offer-diag-'));
try {
  const store = createTestStore(join(dir, 'state.gz'));
  let now = '2026-10-26T15:00:00.000Z';
  const service = new LeagueService(store, { members: [{ userId: 'admin', label: '管理者' }], adminId: 'admin', allowStep: true, clock: () => now });
  const sessionId = (await service.login('admin')).sessionId;
  let seq = 0;
  const send = async (type, payload) => { const l = (await store.read()).league; seq += 1; return service.command('admin', sessionId, { requestId: `diag-${type}-${seq}`, revision: l?.revision ?? 0, type, payload }); };
  await quiet(() => send('create'));
  for (let i = 0; i < 4; i += 1) { const l = (await store.read()).league; if (!l.phase) break; await send('submit', { phaseId: l.phase.id, plan: defaultPhasePlan(l, l.members[0].teamName), ready: true, baseSubmission: null }); }
  for (let i = 0; i < STEPS; i += 1) await quiet(() => send('step'));
  const l = (await store.read()).league;
  const human = l.members[0].teamName;
  const names = l.season.settings.teamNames;
  const teams = Object.fromEntries(names.map((n) => [n, l.game.teams[n].players]));
  const judge = createTradeJudge(teams);
  const decide = (fromName, to, offerIds, wantIds) => {
    const factor = tradeFactorFor(l, to);
    return cpuTradeDecision({
      valueOf: (p) => judge.valueOf(p) * factor(p), valueOfOwn: (p) => judge.valueOf(p, to) * factor(p),
      lossOf: (ps) => judge.setValuesOf(ps, to).map((v, i) => v * factor(ps[i])),
      fromPlayers: teams[fromName], toPlayers: teams[to], offerIds, wantIds,
      strengthGap: (give, get) => tradeStrengthGap(teams[fromName], teams[to], give, get),
    });
  };
  let made = 0;
  const rows = [];
  for (const from of names.filter((n) => n !== human)) {
    const c = { fair: 0, fairOk: 0, accept: 0, acceptOk: 0 };
    const t0 = performance.now();
    const plan = planCpuTrade({ from, teams, partners: [human], valueOf: (p) => judge.valueOf(p), balanced: true,
      fair: (partner, give, get) => { c.fair += 1; const pick = (t, ids) => teams[t].filter((p) => ids.includes(p.id));
        const ok = pick(from, give).reduce((a, p) => a + judge.valueOf(p), 0) >= judge.setValuesOf(pick(partner, get), partner).reduce((a, v) => a + v, 0) * CPU_OFFER_VALUE_FLOOR; if (ok) c.fairOk += 1; return ok; },
      accept: (partner, give, get) => { c.accept += 1; const d = decide(partner, from, get, give); const ok = d.action === 'accept'; if (!ok) { const k = d.reason || `r${(d.gain / d.loss).toFixed(2)}`; c.rej = (c.rej || 0) + 1; } if (ok) c.acceptOk += 1; return ok; } });
    c.ms = Math.round(performance.now() - t0);
    if (plan) made += 1;
    rows.push({ from, ...c, plan: plan ? `${plan.give}→${plan.get} ${plan.gain.toFixed(1)}/${plan.partnerGain.toFixed(1)}` : '' });
  }
  console.table(rows);
  console.log(`提案できる球団 ${made}/${names.length - 1}`);
} finally { await rm(dir, { recursive: true, force: true }); }
