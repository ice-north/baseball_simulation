// CPU球団が自分から動くトレード（CPU同士の交換・人の球団への提案）の検査。
//
// ⚠ 先方指摘「CPUチームからの提案と、CPUチーム同士のトレードも行ってほしい」。
// ⚠ 見るもの:
//    1. シーズン中に CPU同士の交換が成立し、取引の記録に「CPU球団どうし」として残る
//    2. 人の球団へ提案が届く（期限つき・1件まで・お知らせ付き）。その中身は**人が同じ交換を
//       出したらCPUが受ける**もの（`cpuDecisionFor`。値段の上乗せと戦力の開きの線）。かつ人の側から
//       見ても釣り合う（CPUばかり伸びない・人が手放す選手に値段が見合う）
//    3. 届いた提案を人が受けると成立し、断ると消える。期限を過ぎると取り下げられる
//    4. 同じ日をやり直せば同じ結果（乱数を引かない）
//    5. 取り下げの見回り（`pruneTrades`）が、CPUからの提案（`from` が null）を「オーナーが替わった」で消さない
//    6. 人の同じ選手を、どのCPUからでも `CPU_OFFER_MEMO_DAYS` 日は続けて求めない。人の伸びが負の案は出ない
//       （判断7、いしだ 2026-11-20。覚え `cpuOfferMemo` の前の形 `cpuOfferLog` を読んでも壊れない）
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import './lib/bootstrap.mjs';
import { createTestStore } from './lib/testStore.mjs';
import { LeagueService } from '../../server/leagueService.mjs';
import { defaultPhasePlan } from '../../server/leagueEngine.mjs';
import { pruneTrades } from '../../server/social.mjs';
import { tradeStrengthGap, squadStrength, STRENGTH_GAP_LIMIT } from '../../src/online/tradeSearch.js';
import {
  offerExpiry,
  dayRoll,
  liveOfferMemo,
  rememberOffer,
  CPU_OFFER_DAYS,
  CPU_OFFER_VALUE_FLOOR,
  CPU_OFFER_MEMO_DAYS,
} from '../../server/cpuTrades.mjs';
import { createTradeJudge } from '../../server/tradeJudge.mjs';

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

// 提案の覚え: 期限の内だけ効く・前の形（「球団>選手id」の文字列）や壊れた行を読んでも落ちない
{
  const league = {
    season: { currentDate: { year: 1, month: 5, day: 1 } },
    cpuOfferLog: ['A>1', 'B>2'],
    cpuOfferMemo: ['A>1', null, { team: 'B', id: 3 }, { team: 'B', id: 4, until: 10501 }, { team: 'B', id: 5, until: 10502 }],
  };
  assert.deepEqual(liveOfferMemo(league).map((m) => m.id), [5], '覚えの期限・壊れた行の扱いが違う');
  assert.deepEqual(liveOfferMemo({ season: league.season, cpuOfferLog: ['A>1'] }), [], '前の形の覚えを読んでいる');
  rememberOffer(league, 'B', [7]);
  assert.equal(league.cpuOfferLog, undefined, '前の形の覚えが残っている');
  assert.deepEqual(league.cpuOfferMemo, [{ team: 'B', id: 7, until: offerExpiry(league.season.currentDate, CPU_OFFER_MEMO_DAYS) }, { team: 'B', id: 5, until: 10502 }]);
  // 期限の前日までは効き、当日には消える
  league.season.currentDate = { year: 1, month: 5, day: CPU_OFFER_MEMO_DAYS };
  assert.ok(liveOfferMemo(league).some((m) => m.id === 7), '覚えが期限の前に消えた');
  league.season.currentDate = { year: 1, month: 5, day: CPU_OFFER_MEMO_DAYS + 1 };
  assert.ok(!liveOfferMemo(league).some((m) => m.id === 7), '覚えが期限を過ぎても残っている');
}

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
  return { store, service, send, sessionId, offers, league: (await store.read()).league };
}

const dir = await mkdtemp(join(tmpdir(), 'pennant-cpu-trade-'));
const dir2 = await mkdtemp(join(tmpdir(), 'pennant-cpu-trade2-'));
try {
  const { service, send, sessionId, offers, league } = await runLeague(dir);
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
    // ⚠ 逆向きも（CPUばかり伸びる＝人の主力を控えで取る提案を出さない。いしだ 2026-11-20）
    assert.ok(gap >= -STRENGTH_GAP_LIMIT - 1e-9, `CPUからの提案がCPUにばかり得: ${gap}`);
    // 人が手放す選手の値段（人の球団の事情こみ）に、CPUが出す選手の値段が見合う
    const judge = createTradeJudge(snap.teams);
    const pick = (team, ids) => snap.teams[team].filter((p) => ids.includes(p.id));
    const offered = pick(trade.fromTeam, trade.offer).reduce((a, p) => a + judge.valueOf(p), 0);
    const lost = judge.setValuesOf(pick(own, trade.want), own).reduce((a, v) => a + v, 0);
    assert.ok(offered >= lost * CPU_OFFER_VALUE_FLOOR - 1e-9, `CPUからの提案の値段が人に見合わない: ${(offered / lost).toFixed(2)}倍`);
    // ⚠ 人の伸びが負の案は出さない（0 は可。判断7、いしだ 2026-11-20）
    const mineAfter = [...snap.teams[own].filter((p) => !trade.want.includes(p.id)), ...snap.teams[trade.fromTeam].filter((p) => trade.offer.includes(p.id))];
    const humanGain = squadStrength(mineAfter) - squadStrength(snap.teams[own]);
    assert.ok(humanGain >= -1e-9, `CPUからの提案で人の戦力が下がる: ${humanGain.toFixed(2)}`);
  }
  // ⚠ 人の同じ選手を、どのCPUからでも期間内は続けて求めない（判断7。以前は別のCPUなら求められた）
  {
    const dayNo = (key) => Date.UTC(2000 + Math.floor(key / 10000), Math.floor(key / 100) % 100 - 1, key % 100) / 86400000;
    // 提案の日 = 期限 − CPU_OFFER_DAYS
    const asked = [...offers.values()].map(({ trade }) => ({ day: dayNo(trade.expires) - CPU_OFFER_DAYS, trade }));
    for (const a of asked)
      for (const b of asked) {
        if (a === b || b.day <= a.day || b.day - a.day >= CPU_OFFER_MEMO_DAYS) continue;
        const again = b.trade.want.filter((id) => a.trade.want.includes(id));
        assert.equal(again.length, 0, `${b.day - a.day}日あとに同じ選手を求めた（${a.trade.fromTeam}→${b.trade.fromTeam}、${again}）`);
      }
    assert.ok(Array.isArray(league.cpuOfferMemo) && league.cpuOfferMemo.length > 0, '提案の覚え（cpuOfferMemo）が残っていない');
    assert.equal(league.cpuOfferLog, undefined, '前の形の覚え（cpuOfferLog）を書いている');
  }
  // 1件まで
  const open = (league.trades || []).filter((t) => t.from === null);
  assert.ok(open.length <= 1, `CPUからの提案が同時に${open.length}件ある`);
  // お知らせ
  const inbox = league.members[0].inbox || [];
  assert.ok(inbox.some((m) => m.type === 'tradeOffered' || m.type === 'tradeWithdrawn'), 'CPUからの提案のお知らせが無い');
  // 3. ビューに「CPUからの提案」として出る
  // ⚠ 最後の日に返事待ちの提案が無い（期限で取り下げられた直後など）こともある。以前はその回だけ
  //    この確かめを黙って飛ばしていた。無ければ日を進めて届くのを待ち、届かなければ落とす
  //    （4. のやり直しは上で取った `league` と比べるので、ここで進めても変わらない）
  let pending = (league.trades || []).find((t) => t.from === null);
  for (let i = 0; !pending && i < 40; i += 1) {
    await quiet(() => send('step'));
    pending = ((await service.store.read()).league.trades || []).find((t) => t.from === null);
  }
  assert.ok(pending, '返事待ちのCPUからの提案が作れない（日を進めても届かない）');
  // ⚠ ログインし直さない（1台までなので、`send` の持つ入場が切れて命令が弾かれる）
  const view = await service.view('admin', sessionId);
  const shown = view.trades.find((t) => t.id === pending.id);
  assert.ok(shown?.fromCpu && shown.myTurn && shown.canCounter && shown.expires, 'CPUからの提案が返事待ちとして出ていない');
  // 受ける → 成立（CPUがいまの名簿でもう一度判断して受ける）か、理由つきで断られる
  // ⚠ try は命令だけを包む。確かめ（assert）まで包むと、確かめの失敗を catch が飲み込み、
  //    「理由が違う」という別の失敗に見えていた
  const before = ((await service.store.read()).league.transactions || []).length;
  let refused = null;
  try {
    await send('tradeRespond', { tradeId: pending.id, action: 'accept' });
  } catch (error) {
    refused = error;
  }
  if (refused) {
    assert.match(String(refused.message), /もう続けません/, `受けたときの失敗の理由が違う: ${refused.message}`);
    assert.ok(((await service.store.read()).league.trades || []).some((t) => t.id === pending.id), '断られたのに提案が消えた');
  } else {
    const after = (await service.store.read()).league;
    assert.ok(!(after.trades || []).some((t) => t.id === pending.id), '受けた提案が残っている');
    assert.ok((after.transactions || []).length > before, '受けたのに取引の記録が増えない');
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
