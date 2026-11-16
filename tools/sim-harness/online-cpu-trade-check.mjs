// CPU球団が自分から動くトレード（CPU同士の交換・人の球団への提案）の検査。
//
// ⚠ 先方指摘「CPUチームからの提案と、CPUチーム同士のトレードも行ってほしい」。
// ⚠ 見るもの:
//    1. シーズン中に CPU同士の交換が成立し、取引の記録に「CPU球団どうし」として残る
//    2. 人の球団へ提案が届く（期限つき・1件まで・お知らせ付き）。その中身は**人が同じ交換を
//       出したらCPUが受ける**もの（`cpuDecisionFor`。値段の上乗せと戦力の開きの線）
//    3. 届いた提案を人が受けると成立し、断ると消える。期限を過ぎると取り下げられる
//    4. 同じ日をやり直せば同じ結果（乱数を引かない）
//    5. 取り下げの見回り（`pruneTrades`）が、CPUからの提案（`from` が null）を「オーナーが替わった」で消さない
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import './lib/bootstrap.mjs';
import { createTestStore } from './lib/testStore.mjs';
import { LeagueService } from '../../server/leagueService.mjs';
import { defaultPhasePlan } from '../../server/leagueEngine.mjs';
import { pruneTrades } from '../../server/social.mjs';
import { tradeStrengthGap, STRENGTH_GAP_LIMIT } from '../../src/online/tradeSearch.js';
import { offerExpiry, dayRoll, CPU_OFFER_DAYS } from '../../server/cpuTrades.mjs';

const TURNS = Number(process.env.CPU_TRADE_TURNS || 70);
const quiet = async (fn) => {
  const log = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = log;
  }
};

// 期限の日付（暦どおりに月をまたぐ）
assert.equal(offerExpiry({ year: 1, month: 4, day: 28 }, 7), 10505);
assert.equal(offerExpiry({ year: 1, month: 4, day: 1 }, 7), 10408);
// サイコロは同じ日・同じ用件なら同じ
assert.equal(dayRoll({ seed: 5, season: { currentDate: { year: 1, month: 5, day: 3 } } }, 'x'),
  dayRoll({ seed: 5, season: { currentDate: { year: 1, month: 5, day: 3 } } }, 'x'));

// 取り下げの見回り: CPUからの提案（from=null）は残し、その球団に人が入ったら消す
{
  const teams = { A: { players: [{ id: 1 }] }, B: { players: [{ id: 2 }] } };
  const league = {
    members: [{ userId: 'u', teamName: 'B', inbox: [] }],
    teams: [],
    trades: [{ id: 't1', from: null, fromTeam: 'A', to: 'u', toTeam: 'B', offer: [1], want: [2] }],
  };
  pruneTrades(league, teams, 'now');
  assert.equal(league.trades.length, 1, 'CPUからの提案を「オーナーが替わった」で消している');
  league.members.push({ userId: 'v', teamName: 'A', inbox: [] });
  pruneTrades(league, teams, 'now');
  assert.equal(league.trades.length, 0, 'CPU球団に人が入っても、その球団からの提案が残っている');
}

async function runLeague(dir) {
  const store = createTestStore(join(dir, 'state.gz'));
  let now = '2026-10-26T15:00:00.000Z';
  const service = new LeagueService(store, {
    members: [{ userId: 'admin', label: '管理者' }],
    adminId: 'admin',
    allowStep: true,
    clock: () => now,
  });
  const sessionId = (await service.login('admin')).sessionId;
  let seq = 0;
  const send = async (type, payload) => {
    const l = (await store.read()).league;
    seq += 1;
    return service.command('admin', sessionId, {
      requestId: `cpu-trade-${type}-${seq}`,
      revision: l?.revision ?? 0,
      type,
      payload,
    });
  };
  await quiet(() => send('create'));
  for (let i = 0; i < 4; i += 1) {
    const l = (await store.read()).league;
    if (!l.phase) break;
    await send('submit', { phaseId: l.phase.id, plan: defaultPhasePlan(l, l.members[0].teamName), ready: true, baseSubmission: null });
  }
  const offers = new Map();
  for (let i = 0; i < TURNS; i += 1) {
    await quiet(() => send('step'));
    now = new Date(Date.parse(now) + 3600000).toISOString();
    const l = (await store.read()).league;
    for (const t of l.trades || []) if (t.from === null && !offers.has(t.id)) offers.set(t.id, { trade: structuredClone(t), league: structuredClone({ teams: Object.fromEntries(Object.entries(l.game.teams).map(([n, team]) => [n, team.players])) }) });
  }
  return { store, service, send, offers, league: (await store.read()).league };
}

const dir = await mkdtemp(join(tmpdir(), 'pennant-cpu-trade-'));
const dir2 = await mkdtemp(join(tmpdir(), 'pennant-cpu-trade2-'));
try {
  const { service, send, offers, league } = await runLeague(dir);
  const own = league.members[0].teamName;
  // 1. CPU同士の交換
  const cpuOnly = (league.transactions || []).filter((t) => t.kind === 'trade' && t.cpuOnly);
  assert.ok(cpuOnly.length > 0, `${TURNS}ターンでCPU同士のトレードが1件も無い`);
  for (const t of cpuOnly) {
    assert.ok(!t.teams.includes(own), 'CPU同士のトレードに人の球団が入っている');
    assert.ok(t.moves.length >= 2, 'CPU同士のトレードが一方的（片側だけ動いた）');
  }
  // 2. 人の球団への提案
  assert.ok(offers.size > 0, `${TURNS}ターンでCPUからの提案が1件も届かない`);
  for (const { trade, league: snap } of offers.values()) {
    assert.equal(trade.toTeam, own);
    assert.equal(trade.to, 'admin');
    assert.equal(trade.turn, 'to');
    assert.ok(trade.expires, 'CPUからの提案に期限が無い');
    // 人の側の伸びがCPUの伸びを線より上回らない（人が同じ交換を出したらCPUが受ける範囲）
    const gap = tradeStrengthGap(snap.teams[own], snap.teams[trade.fromTeam], trade.want, trade.offer);
    assert.ok(gap <= STRENGTH_GAP_LIMIT + 1e-9, `CPUからの提案が人の球団に開きすぎ: ${gap}`);
  }
  // 1件まで
  const open = (league.trades || []).filter((t) => t.from === null);
  assert.ok(open.length <= 1, `CPUからの提案が同時に${open.length}件ある`);
  // お知らせ
  const inbox = league.members[0].inbox || [];
  assert.ok(inbox.some((m) => m.type === 'tradeOffered' || m.type === 'tradeWithdrawn'), 'CPUからの提案のお知らせが無い');
  // 3. ビューに「CPUからの提案」として出る
  const login = await service.login('admin');
  const view = await service.view('admin', login.sessionId);
  if (open.length) {
    const shown = view.trades.find((t) => t.id === open[0].id);
    assert.ok(shown?.fromCpu && shown.myTurn && shown.canCounter && shown.expires, 'CPUからの提案が返事待ちとして出ていない');
    // 受ける → 成立（CPUがいまの名簿でもう一度判断して受ける）か、理由つきで断られる
    const before = (league.transactions || []).length;
    try {
      await send('tradeRespond', { tradeId: open[0].id, action: 'accept' });
      const after = (await service.store.read()).league;
      assert.ok(!(after.trades || []).some((t) => t.id === open[0].id), '受けた提案が残っている');
      assert.ok((after.transactions || []).length > before, '受けたのに取引の記録が増えない');
    } catch (error) {
      assert.match(String(error.message), /もう続けません/, `受けたときの失敗の理由が違う: ${error.message}`);
    }
  }
  console.log(`  CPU同士 ${cpuOnly.length}件・人への提案 ${offers.size}件（${TURNS}ターン）`);

  // 4. 同じ進め方をやり直すと同じ結果
  const again = await runLeague(dir2);
  assert.deepEqual(
    (again.league.transactions || []).filter((t) => t.kind === 'trade').map((t) => t.moves.map((m) => m.playerId)),
    (league.transactions || []).filter((t) => t.kind === 'trade').map((t) => t.moves.map((m) => m.playerId)),
    '同じ進め方で、CPUのトレードが変わった（乱数を引いている）',
  );
} finally {
  await rm(dir, { recursive: true, force: true });
  await rm(dir2, { recursive: true, force: true });
}
console.log(`■ CPUのトレード: OK（CPU同士が成立・人へ期限${CPU_OFFER_DAYS}日の提案・受けて成立・やり直しで同じ）`);
