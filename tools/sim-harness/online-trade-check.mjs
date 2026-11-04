// 球団間のトレードの検査。
//
// ⚠ 主目的は「**二重に成立しないこと**」と「**名簿を壊さないこと**」。
//    選手が動く操作なので、取り違えると記録の持ち主が分からなくなる。
// ⚠ 流れは 提案 → 受ける／逆提案／断る。逆提案は**1回だけ**で、
//    そのあとは受けるか断るかしかない（投げ返しが続くと終わらない）。
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore } from '../../server/storage/fileStore.mjs';
import { LeagueService } from '../../server/leagueService.mjs';
import {
  rosterShortfall,
  rostersAfterTrade,
  canRespond,
  canCounter,
  MAX_OPEN_TRADES,
} from '../../src/online/trades.js';
import { ROSTER_LIMIT } from '../../src/online/shared.js';

const NOW = '2026-10-26T15:00:00.000Z';

// --- 規則だけの部分 -----------------------------------------------------
{
  const make = (n, position) =>
    Array.from({ length: n }, (_, i) => ({ id: `${position}${i}`, position }));
  const ok = [
    ...make(10, 'pitcher'),
    ...make(2, 'catcher'),
    ...make(6, 'short'),
    ...make(6, 'left'),
  ];
  assert.deepEqual(rosterShortfall(ok), [], '成り立つ名簿を弾いている');
  // ⚠ 投手・捕手・野手8人は**トライアウトの解決と同じ条件**。緩めると
  //    トレードで捕手のいない球団を作れてしまう
  assert.ok(
    rosterShortfall(ok.filter((p) => p.position !== 'catcher')).length,
    '捕手が居なくても通している',
  );
  assert.ok(
    rosterShortfall(ok.filter((p) => p.position !== 'pitcher')).length,
    '投手が居なくても通している',
  );
  assert.ok(
    rosterShortfall([...make(10, 'pitcher'), ...make(2, 'catcher'), ...make(5, 'left')])
      .length,
    '野手が8人を割っても通している',
  );
  assert.ok(
    rosterShortfall([...ok, ...make(1, 'left')]).length,
    `${ROSTER_LIMIT}人を超えても通している`,
  );

  // 入れ替えの計算。⚠ 元の配列を書き換えない
  const from = [{ id: 1, position: 'pitcher' }, { id: 2, position: 'left' }];
  const to = [{ id: 3, position: 'catcher' }];
  const after = rostersAfterTrade(from, to, [1], [3]);
  assert.deepEqual(after.from.map((p) => p.id).sort(), [2, 3]);
  assert.deepEqual(after.to.map((p) => p.id), [1]);
  assert.deepEqual(from.map((p) => p.id), [1, 2], '元の配列が書き換わっている');

  // 手番と逆提案
  const trade = { from: 'a', to: 'b', turn: 'to', countered: false };
  assert.ok(canRespond(trade, 'b') && !canRespond(trade, 'a'), '手番の判定がちがう');
  assert.ok(canCounter(trade, 'b'), '最初の返事で逆提案できない');
  assert.ok(!canCounter({ ...trade, countered: true }, 'b'), '逆提案が2回できる');
  assert.ok(
    !canCounter({ ...trade, turn: 'from', countered: true }, 'a'),
    '提案した側が逆提案を返せる（投げ返しが終わらない）',
  );
}

// --- 2人のリーグで、通しで動かす ----------------------------------------
const dir = await mkdtemp(join(tmpdir(), 'pennant-trade-'));
try {
  const store = new FileStore(join(dir, 'state.gz'));
  const service = new LeagueService(store, {
    members: [{ userId: 'a', label: 'A' }],
    adminId: 'a',
    clock: () => NOW,
  });
  const sa = (await service.login('a')).sessionId;
  const sb = (await service.login('b')).sessionId;
  let seq = 0;
  const send = async (user, session, type, payload) => {
    const l = (await store.read()).league;
    seq += 1;
    return service.command(user, session, {
      requestId: `trade-${type}-${seq}`,
      revision: l?.revision ?? 0,
      type,
      payload,
    });
  };
  const live = () => store.read().then((b) => b.league);

  await send('a', sa, 'create');
  await send('b', sb, 'join', {});
  // 名簿を配る（セット選択を両方決める）
  for (const [user, session] of [
    ['a', sa],
    ['b', sb],
  ]) {
    const l = await live();
    if (!l.phase || l.phase.kind !== 'pack_select') break;
    await send(user, session, 'submit', {
      phaseId: l.phase.id,
      plan: { packId: l.packs[user === 'a' ? 0 : 1].id },
      ready: true,
      baseSubmission: null,
    });
  }
  const started = await live();
  const teamA = started.members.find((m) => m.userId === 'a').teamName;
  const teamB = started.members.find((m) => m.userId === 'b').teamName;
  const rosterOf = (l, name) => l.game.teams[name].players;
  assert.equal(rosterOf(started, teamA).length, ROSTER_LIMIT, '前提: 24人');

  const pickA = rosterOf(started, teamA).find((p) => p.position === 'pitcher');
  const pickB = rosterOf(started, teamB).find((p) => p.position === 'pitcher');

  // ⚠ 相手は参加者の球団だけ（CPUは返事をしない）
  const cpu = started.season.settings.teamNames.find(
    (n) => n !== teamA && n !== teamB,
  );
  await assert.rejects(
    () => send('a', sa, 'tradeOffer', { to: cpu, offer: [pickA.id], want: [] }),
    /参加者の球団だけ/,
    'CPU球団に提案できた',
  );
  // ⚠ 自分の球団とはトレードできない
  await assert.rejects(
    () => send('a', sa, 'tradeOffer', { to: teamA, offer: [pickA.id], want: [] }),
    /自分の球団/,
    '自分の球団に提案できた',
  );
  // ⚠ 相手の名簿にいない選手は要求できない
  await assert.rejects(
    () =>
      send('a', sa, 'tradeOffer', {
        to: teamB,
        offer: [pickA.id],
        want: [pickA.id],
      }),
    /相手の名簿にいない/,
    '相手に居ない選手を要求できた',
  );
  // ⚠ 空の提案は出せない
  await assert.rejects(
    () => send('a', sa, 'tradeOffer', { to: teamB, offer: [], want: [] }),
    /1人以上/,
    '空の提案が通った',
  );

  // --- 提案 → 受ける ----------------------------------------------------
  await send('a', sa, 'tradeOffer', {
    to: teamB,
    offer: [pickA.id],
    want: [pickB.id],
  });
  const offered = await live();
  assert.equal(offered.trades.length, 1, '提案が残っていない');
  assert.equal(offered.trades[0].turn, 'to', '手番が相手になっていない');

  // ⚠ **提案した側は受けられない**。両方が受けられると二重に成立する
  await assert.rejects(
    () =>
      send('a', sa, 'tradeRespond', {
        tradeId: offered.trades[0].id,
        action: 'accept',
      }),
    /相手の返事待ち/,
    '提案した側が自分で受けられた',
  );
  // ⚠ 当事者でない人は触れない
  const sc = (await service.login('c')).sessionId;
  await assert.rejects(
    () =>
      send('c', sc, 'tradeRespond', {
        tradeId: offered.trades[0].id,
        action: 'accept',
      }),
    (e) => e.status === 403,
    '関係ない人が返事できた',
  );

  // ビューには当事者だけに見えること
  const viewA = await service.view('a', sa);
  const viewB = await service.view('b', sb);
  assert.equal(viewA.trades.length, 1, '提案した側に見えていない');
  assert.equal(viewB.trades.length, 1, '相手に見えていない');
  assert.equal(viewA.trades[0].myTurn, false, '提案した側が手番になっている');
  assert.equal(viewB.trades[0].myTurn, true, '相手の手番になっていない');
  assert.equal(viewB.trades[0].canCounter, true, '相手が逆提案できない');
  assert.equal(viewA.trades[0].offer[0].name, pickA.name, '選手名が渡っていない');

  await send('b', sb, 'tradeRespond', {
    tradeId: offered.trades[0].id,
    action: 'accept',
  });
  const done = await live();
  assert.equal(done.trades.length, 0, '成立したのに提案が残っている');
  assert.ok(
    rosterOf(done, teamB).some((p) => p.id === pickA.id),
    '出した選手が相手の名簿に入っていない',
  );
  assert.ok(
    rosterOf(done, teamA).some((p) => p.id === pickB.id),
    'もらった選手が自分の名簿に入っていない',
  );
  assert.ok(
    !rosterOf(done, teamA).some((p) => p.id === pickA.id),
    '出した選手が自分の名簿に残っている',
  );
  assert.equal(rosterOf(done, teamA).length, ROSTER_LIMIT, '人数が変わった');
  // ⚠ 打順を組み直すこと。出した選手が打順に残ると試合が組めない
  for (const name of [teamA, teamB]) {
    const order = done.game.teams[name].lineupSettings?.battingOrder || [];
    const ids = new Set(rosterOf(done, name).map((p) => p.id));
    assert.ok(
      order.length === 9 && order.every((e) => ids.has(e.playerId)),
      `${name} の打順に名簿外の選手がいる`,
    );
  }
  // ⚠ お知らせに残す
  const notice = done.notices.find((n) => n.type === 'trade');
  assert.ok(notice, 'トレードのお知らせが無い');
  assert.equal(notice.picks.length, 2, 'お知らせの人数がちがう');
  // ⚠ 経歴に残す（あとから「どの年にどこへ行ったか」を辿れるように）
  const moved = rosterOf(done, teamB).find((p) => p.id === pickA.id);
  assert.ok(
    (moved.careerHistory || []).some((h) => h.type === 'trade'),
    '経歴にトレードが残っていない',
  );

  // --- 提案 → 逆提案 → 受ける -------------------------------------------
  const a2 = rosterOf(done, teamA).filter((p) => p.position === 'pitcher');
  const b2 = rosterOf(done, teamB).filter((p) => p.position === 'pitcher');
  await send('a', sa, 'tradeOffer', {
    to: teamB,
    offer: [a2[0].id],
    want: [b2[0].id],
  });
  const t2 = (await live()).trades[0];
  await send('b', sb, 'tradeRespond', {
    tradeId: t2.id,
    action: 'counter',
    offer: [a2[1].id],
    want: [b2[0].id],
  });
  const countered = (await live()).trades[0];
  assert.equal(countered.turn, 'from', '逆提案で手番が戻っていない');
  assert.equal(countered.countered, true, '逆提案の印が付いていない');
  assert.deepEqual(countered.offer, [a2[1].id], '逆提案の中身が入っていない');
  // ⚠ **逆提案は1回だけ**。提案した側は受けるか断るかしかない
  await assert.rejects(
    () =>
      send('a', sa, 'tradeRespond', {
        tradeId: countered.id,
        action: 'counter',
        offer: [a2[2].id],
        want: [b2[0].id],
      }),
    /逆提案は1回まで/,
    '逆提案を投げ返せた',
  );
  // ⚠ 相手は手番を持っていないので受けられない
  await assert.rejects(
    () => send('b', sb, 'tradeRespond', { tradeId: countered.id, action: 'accept' }),
    /相手の返事待ち/,
    '手番でない側が受けられた',
  );
  await send('a', sa, 'tradeRespond', { tradeId: countered.id, action: 'accept' });
  const done2 = await live();
  assert.equal(done2.trades.length, 0, '逆提案が成立していない');
  assert.ok(
    rosterOf(done2, teamB).some((p) => p.id === a2[1].id),
    '逆提案で出した選手が移っていない',
  );
  assert.ok(
    rosterOf(done2, teamA).some((p) => p.id === a2[0].id),
    '逆提案で外した選手まで移っている',
  );

  // --- 断ると消える ------------------------------------------------------
  // ⚠ 名簿は両球団とも24人（上限）なので、**人数の揃ったトレード**にする。
  //    1人対0人は相手が25人になって弾かれる（それが正しい動き）
  const beforeReject = await live();
  const a3 = rosterOf(beforeReject, teamA).find((p) => p.position === 'pitcher');
  const b3 = rosterOf(beforeReject, teamB).find((p) => p.position === 'pitcher');
  await send('a', sa, 'tradeOffer', { to: teamB, offer: [a3.id], want: [b3.id] });
  const t3 = (await live()).trades[0];
  await send('b', sb, 'tradeRespond', { tradeId: t3.id, action: 'reject' });
  assert.equal((await live()).trades.length, 0, '断っても消えていない');
  assert.ok(
    rosterOf(await live(), teamA).some((p) => p.id === a3.id),
    '断ったのに選手が移った',
  );
  // ⚠ 消えたものに触れない
  await assert.rejects(
    () => send('b', sb, 'tradeRespond', { tradeId: t3.id, action: 'accept' }),
    /もうありません/,
    '消えたトレードを受けられた',
  );

  // ⚠ **提案した側からも断れる**（取り下げを兼ねる）
  await send('a', sa, 'tradeOffer', { to: teamB, offer: [a3.id], want: [b3.id] });
  const t4 = (await live()).trades[0];
  await send('a', sa, 'tradeRespond', { tradeId: t4.id, action: 'reject' });
  assert.equal((await live()).trades.length, 0, '提案した側が取り下げられない');

  // --- 名簿が成り立たなくなる提案は通さない -------------------------------
  // ⚠ 捕手を全部出すと、自分の名簿が成り立たなくなる
  const current = await live();
  const myCatchers = rosterOf(current, teamA)
    .filter((p) => p.position === 'catcher')
    .map((p) => p.id);
  const theirPitchers = rosterOf(current, teamB)
    .filter((p) => p.position === 'pitcher')
    .map((p) => p.id);
  assert.ok(myCatchers.length > 1, '前提: 捕手が2人以上居る');
  await assert.rejects(
    () =>
      send('a', sa, 'tradeOffer', {
        to: teamB,
        offer: myCatchers,
        want: theirPitchers.slice(0, myCatchers.length),
      }),
    /自球団の名簿が成り立ちません/,
    '捕手を全部出す提案が通った',
  );
  // ⚠ **相手の名簿も見る**。相手の捕手を全部もらう提案は通さない
  const theirCatchers = rosterOf(current, teamB)
    .filter((p) => p.position === 'catcher')
    .map((p) => p.id);
  const myPitchers = rosterOf(current, teamA)
    .filter((p) => p.position === 'pitcher')
    .map((p) => p.id);
  await assert.rejects(
    () =>
      send('a', sa, 'tradeOffer', {
        to: teamB,
        offer: myPitchers.slice(0, theirCatchers.length),
        want: theirCatchers,
      }),
    /相手の名簿が成り立ちません/,
    '相手の捕手を全部もらえた',
  );
  // ⚠ **人数が合わないと上限を超える**。24人どうしで2対1は25人になる
  await assert.rejects(
    () =>
      send('a', sa, 'tradeOffer', {
        to: teamB,
        offer: [myPitchers[0]],
        want: [theirPitchers[0], theirPitchers[1]],
      }),
    new RegExp(`${ROSTER_LIMIT}人を超えます`),
    '上限を超えるトレードが通った',
  );

  // --- 抱えられる提案の数に上限 ------------------------------------------
  assert.ok(
    myPitchers.length > MAX_OPEN_TRADES && theirPitchers.length > MAX_OPEN_TRADES,
    '前提: 上限より多い投手が両球団に居る',
  );
  for (let i = 0; i < MAX_OPEN_TRADES; i += 1)
    await send('a', sa, 'tradeOffer', {
      to: teamB,
      offer: [myPitchers[i]],
      want: [theirPitchers[i]],
    });
  await assert.rejects(
    () =>
      send('a', sa, 'tradeOffer', {
        to: teamB,
        offer: [myPitchers[MAX_OPEN_TRADES]],
        want: [theirPitchers[MAX_OPEN_TRADES]],
      }),
    new RegExp(`${MAX_OPEN_TRADES}件まで`),
    '上限を超えて提案できた',
  );

  // --- 打順に入っている選手を出したら、打順を組み直すこと -----------------
  // ⚠ 出した選手が打順に残ると**試合が組めない**。控えの投手を出しただけだと
  //    打順は元のままで通ってしまうので、**打順に入っている野手**で確かめる。
  {
    for (const t of (await live()).trades)
      await send('a', sa, 'tradeRespond', { tradeId: t.id, action: 'reject' });
    const before = await live();
    const order = before.game.teams[teamA].lineupSettings.battingOrder;
    assert.equal(order.length, 9, '前提: 打順が9人');
    // ⚠ **並び順は打順の番号で見る**。配列の順は保存されたままで、
    //    先頭が9番（投手）のことがある
    const entry = [...order]
      .sort((x, y) => x.battingOrder - y.battingOrder)
      .find((e) => e.position !== 'pitcher');
    const starter = rosterOf(before, teamA).find((p) => p.id === entry.playerId);
    // ⚠ ここで居なければ、**前のトレードで打順を組み直していない**
    assert.ok(
      starter,
      '打順に入っている野手が名簿に居ない（前のトレードで打順を組み直していない）',
    );
    // 同じ守備位置の相手の野手と交換する（名簿の形を保つため）
    const swap = rosterOf(before, teamB).find(
      (p) => p.position === starter.position,
    );
    assert.ok(swap, `前提: 相手に ${starter.position} が居る`);
    await send('a', sa, 'tradeOffer', {
      to: teamB,
      offer: [starter.id],
      want: [swap.id],
    });
    const t = (await live()).trades[0];
    await send('b', sb, 'tradeRespond', { tradeId: t.id, action: 'accept' });
    const after = await live();
    for (const name of [teamA, teamB]) {
      const ids = new Set(rosterOf(after, name).map((p) => p.id));
      const next = after.game.teams[name].lineupSettings?.battingOrder || [];
      assert.equal(next.length, 9, `${name} の打順が9人でない`);
      assert.ok(
        next.every((e) => ids.has(e.playerId)),
        `${name} の打順に名簿外の選手が残っている`,
      );
      // ⚠ 投手起用も同じ。出した投手が先発に残ると、その日の先発が立たない
      const rotation = after.game.teams[name].pitchingRotation?.starters || [];
      assert.ok(
        rotation.length > 0 && rotation.every((id) => ids.has(id)),
        `${name} の先発ローテーションに名簿外の選手が残っている`,
      );
    }
    assert.ok(
      !after.game.teams[teamA].lineupSettings.battingOrder.some(
        (e) => e.playerId === starter.id,
      ),
      '出した選手が打順に残っている',
    );
  }

  // --- 間に状況が変わっていたら成立させない -------------------------------
  // ⚠ 提案から返事までの間に、選手が別のトレードで移っていることがある。
  //    提案のときに見ただけだと、**居ない選手を動かして名簿が壊れる**。
  //    同じ選手を出す提案を2件作り、1件目を成立させてから2件目を受けてみる。
  {
    // いま残っている提案を片付ける
    for (const t of (await live()).trades)
      await send('a', sa, 'tradeRespond', { tradeId: t.id, action: 'reject' });
    assert.equal((await live()).trades.length, 0, '前提: 提案が残っていない');

    const now = await live();
    const mine = rosterOf(now, teamA).filter((p) => p.position === 'pitcher');
    const theirs = rosterOf(now, teamB).filter((p) => p.position === 'pitcher');
    const sameGuy = mine[0].id;
    await send('a', sa, 'tradeOffer', {
      to: teamB,
      offer: [sameGuy],
      want: [theirs[0].id],
    });
    await send('a', sa, 'tradeOffer', {
      to: teamB,
      offer: [sameGuy],
      want: [theirs[1].id],
    });
    const [first, second] = (await live()).trades;
    await send('b', sb, 'tradeRespond', { tradeId: first.id, action: 'accept' });
    assert.ok(
      !rosterOf(await live(), teamA).some((p) => p.id === sameGuy),
      '前提: 1件目で選手が移っている',
    );
    // ⚠ 2件目は、もう持っていない選手を出す提案。**成立させてはいけない**
    await assert.rejects(
      () => send('b', sb, 'tradeRespond', { tradeId: second.id, action: 'accept' }),
      /出す選手が名簿にいません/,
      '移った選手を2度出せた',
    );
    // 名簿が壊れていないこと
    for (const name of [teamA, teamB]) {
      const players = rosterOf(await live(), name);
      assert.equal(players.length, ROSTER_LIMIT, `${name} の人数が壊れた`);
      assert.equal(
        new Set(players.map((p) => p.id)).size,
        players.length,
        `${name} に同じ選手が2人いる`,
      );
    }
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log(
  '■ トレード: OK（提案→受ける／逆提案は1回だけ→受ける／断ると消える・手番を持つ側だけ返事できる・両球団の名簿を守る・打順を組み直す）',
);
