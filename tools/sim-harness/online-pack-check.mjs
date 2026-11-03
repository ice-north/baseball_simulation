// 初期メンバーセット（20セット・各24人）の検査。
//
// ⚠ 主目的は「**どのセットを選んでも不利にならないこと**」。選ぶ時点では
//    中身しか見えないので、合計の力がばらつくと「当たりのセット」を
//    引いたかどうかで勝負が決まってしまう。
// ⚠ **同じセットを2球団に渡さないこと**。選手のidと名前が重複すると、
//    記録がどちらの選手のものか分からなくなる。
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore } from '../../server/storage/fileStore.mjs';
import { LeagueService } from '../../server/leagueService.mjs';
import { defaultPhasePlan } from '../../server/leagueEngine.mjs';
import {
  generateRosterPacks,
  packSummary,
  packScore,
  PACK_COUNT,
  PACK_SIZE,
  PACK_RANKS,
  PACK_MAX_AGE,
} from '../../src/online/rosterPack.js';

// --- セットそのもの ---------------------------------------------------
const packs = generateRosterPacks(20261103);
assert.equal(packs.length, PACK_COUNT, 'セット数がちがう');
assert.equal(
  Object.values(PACK_RANKS).reduce((a, b) => a + b, 0),
  PACK_SIZE,
  '格の内訳の合計が人数と合っていない',
);

for (const pack of packs) {
  const summary = packSummary(pack);
  assert.equal(pack.players.length, PACK_SIZE, `${pack.id} の人数がちがう`);
  // ⚠ 格の内訳は**全セットで同じ**。ここが揃わないと「当たり」ができる
  assert.deepEqual(summary.ranks, PACK_RANKS, `${pack.id} の格の内訳がちがう`);
  assert.equal(summary.twoWay, 2, `${pack.id} の二刀流が2人でない`);
  // 投手と捕手の人数は固定（名簿が成り立つ最低限）
  assert.equal(summary.counts.pitcher, 12, `${pack.id} の投手数がちがう`);
  assert.equal(summary.counts.catcher, 2, `${pack.id} の捕手数がちがう`);
  // ⚠ 野手が足りないと打順が組めない（スタメン8人＋控え）
  const fielders = PACK_SIZE - summary.counts.pitcher;
  assert.equal(fielders, 12, `${pack.id} の野手数がちがう: ${fielders}`);
  for (const p of pack.players) {
    assert.ok(p.age >= 19 && p.age <= PACK_MAX_AGE, `${p.name} の年齢が範囲外: ${p.age}`);
    assert.ok(p.name && p.id, '名前かidが空');
  }
  // ⚠ **格が守備位置に偏らないこと**。枠の順に配ると、Aの2人がどちらも
  //    投手になって「野手にAが1人も居ない」セットができる（実測で起きた）
  const aPlayers = pack.players.filter((p) => p.rank === 'A');
  assert.ok(
    aPlayers.some((p) => p.position === 'pitcher'),
    `${pack.id} のAに投手が居ない`,
  );
  assert.ok(
    aPlayers.some((p) => p.position !== 'pitcher'),
    `${pack.id} のAに野手が居ない`,
  );
  // ⚠ セットの中で選手が重複しない
  assert.equal(
    new Set(pack.players.map((p) => p.id)).size,
    PACK_SIZE,
    `${pack.id} に同じ選手が2人いる`,
  );
}

// ⚠ **セット同士の合計が揃っていること**（この検査の本丸）。
//    以前は枠ごとに蛇行で配っていて、開きが7.2%残った。
//    走っている合計を見て配る形に直して1%台になった。
for (const seed of [20261103, 777, 42, 1]) {
  const scores = generateRosterPacks(seed).map((p) => packScore(p.players));
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const spread = (max - min) / avg;
  assert.ok(
    spread <= 0.04,
    `シード${seed} でセットの開きが大きい: ${(spread * 100).toFixed(1)}%`,
  );
}

// ⚠ **格の段差がリーグの格の表と別であること**。`RANK_LEVEL_SHIFT` は
//    A=0・B=-8・C=-16 で、チームの格をチーム全体に当てるための表。これを
//    選手の格に流用すると能力が全体に下がり、表示がほぼ全員Fになった（実測）。
//    段差の中心をBに置いて、水準そのものを数字で押さえる。
//    ⚠ 「AがCより上」だけでは**足りない**。流用してもその順序は保たれるので、
//       この検査は通ってしまう（実測でmutationを見逃した）。水準を見ること。
for (const seed of [20261103, 777, 42, 1, 999]) {
  const all = generateRosterPacks(seed).flatMap((p) => p.players);
  const pitchers = all.filter((p) => p.position === 'pitcher');
  const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length;
  const control = (list) => mean(list.map((p) => p.pitching.control));
  const overall = control(pitchers);
  // 実測: 正しい段差で48.3〜49.5 / 表を流用すると41.6〜43.1
  assert.ok(
    overall >= 46 && overall <= 54,
    `シード${seed} 投手の制球の水準がずれている: ${overall.toFixed(1)}（46〜54を想定）`,
  );
  // 実測: 正しい段差でBは50.1〜52.2 / 流用すると43.4〜46.5
  const bControl = control(pitchers.filter((p) => p.rank === 'B'));
  assert.ok(
    bControl >= 48,
    `シード${seed} Bランク投手が弱すぎる（制球 ${bControl.toFixed(1)}）`,
  );
  // 格の順序（AがBより上、BがCより上）
  const byRank = ['A', 'B', 'C'].map((r) => control(pitchers.filter((p) => p.rank === r)));
  assert.ok(
    byRank[0] > byRank[1] && byRank[1] > byRank[2],
    `シード${seed} 格の順に強くなっていない: ${byRank.map((v) => v.toFixed(1)).join(' / ')}`,
  );
  // ⚠ 野手も見る（投手だけ見ると野手側の段差漏れに気づけない）
  const fielders = all.filter((p) => p.position !== 'pitcher');
  const meetB = mean(fielders.filter((p) => p.rank === 'B').map((p) => p.batting.meet));
  assert.ok(meetB >= 43, `シード${seed} Bランク野手が弱すぎる（ミート ${meetB.toFixed(1)}）`);
}

// ⚠ 同じシードなら同じ結果（サーバーと再現で違う世界にならない）
assert.deepEqual(generateRosterPacks(777), generateRosterPacks(777), 'シードが同じなのに違う');
assert.notDeepEqual(
  generateRosterPacks(777).map((p) => p.players[0].name),
  generateRosterPacks(42).map((p) => p.players[0].name),
  'シードを変えても同じ結果になった',
);

// ⚠ 全セットを通して選手が重複しない（20×24＝480人）
const everyId = packs.flatMap((p) => p.players.map((x) => x.id));
assert.equal(new Set(everyId).size, everyId.length, 'セットをまたいで同じ選手がいる');

// --- 手続きとして通るか -----------------------------------------------
const dir = await mkdtemp(join(tmpdir(), 'pennant-pack-'));
try {
  const store = new FileStore(join(dir, 'state.gz'));
  const now = '2026-10-26T15:00:00.000Z';
  const service = new LeagueService(store, {
    members: [{ userId: 'admin', label: '管理者' }],
    adminId: 'admin',
    clock: () => now,
  });
  const admin = (await service.login('admin')).sessionId;
  const guest = (await service.login('guest')).sessionId;
  let seq = 0;
  const send = async (user, sess, type, payload) => {
    const l = (await store.read()).league;
    seq += 1;
    return service.command(user, sess, {
      requestId: `packchk-${type}-${seq}`,
      revision: l?.revision ?? 0,
      type,
      payload,
    });
  };
  await send('admin', admin, 'create');
  await send('guest', guest, 'join', { teamName: '湘南サンズ' });

  const opened = (await store.read()).league;
  // ⚠ 開幕前の手続きは**セット選択**。初期編成（希望リスト）は置き換えた
  assert.equal(opened.phase.kind, 'pack_select', '開幕前の手続きがちがう');
  assert.equal(opened.packs.length, PACK_COUNT);
  // ⚠ 締め切りがあること（1人が決めなくても開幕する）
  assert.ok(opened.phase.deadline, 'セット選択に締め切りが無い');

  const view = await service.view('admin', admin);
  assert.equal(view.phase.packs.length, PACK_COUNT, 'ビューにセットが渡っていない');
  assert.equal(view.phase.packs[0].players.length, PACK_SIZE, '選手が渡っていない');
  // ⚠ ビューが重くなりすぎないこと。20×24人ぶんを丸ごと載せると保存も重くなる
  const kb = Buffer.byteLength(JSON.stringify(view.phase.packs)) / 1024;
  assert.ok(kb < 400, `セットの投影が重い: ${Math.round(kb)}KB`);

  // 居ないセットは受け付けない
  const liveRevision = (await store.read()).league.revision;
  await assert.rejects(
    () =>
      service.command('admin', admin, {
        requestId: 'packchk-bad',
        revision: liveRevision,
        type: 'submit',
        payload: {
          phaseId: opened.phase.id,
          plan: { packId: 'pack-999' },
          ready: true,
          baseSubmission: null,
        },
      }),
    /初期メンバーの選択が不正/,
  );

  // ⚠ **2人が同じセットを選んだとき**。片方だけが取り、もう片方は別のを受け取る
  for (const [user, sess] of [
    ['admin', admin],
    ['guest', guest],
  ]) {
    const cur = (await store.read()).league;
    await service.command(user, sess, {
      requestId: `packchk-submit-${user}`,
      revision: cur.revision,
      type: 'submit',
      payload: {
        phaseId: cur.phase.id,
        plan: { packId: 'pack-3' },
        ready: true,
        baseSubmission: null,
      },
    });
  }
  const after = (await store.read()).league;
  assert.equal(after.phase?.kind, 'camp', 'セット選択の次はキャンプ');
  // ⚠ 配り終えたら捨てる。480人ぶんを保存に残さない
  assert.ok(!after.packs, 'セットが保存に残っている');

  const names = after.season.settings.teamNames;
  for (const name of names)
    assert.equal(
      after.game.teams[name].players.length,
      PACK_SIZE,
      `${name} の人数がちがう`,
    );
  // ⚠ 288人が全員ちがう選手（同じセットを2球団に渡していない）
  const ids = names.flatMap((n) => after.game.teams[n].players.map((p) => p.id));
  assert.equal(ids.length, names.length * PACK_SIZE);
  assert.equal(new Set(ids).size, ids.length, '同じ選手が2球団にいる');
  const allNames = names.flatMap((n) => after.game.teams[n].players.map((p) => p.name));
  assert.equal(new Set(allNames).size, allNames.length, '同じ名前の選手がいる');

  // 構成と格が全球団で揃っている
  for (const name of names) {
    const players = after.game.teams[name].players;
    const ranks = players.reduce((c, p) => ((c[p.rank] = (c[p.rank] || 0) + 1), c), {});
    assert.deepEqual(ranks, PACK_RANKS, `${name} の格の内訳がちがう`);
    assert.equal(
      players.filter((p) => p.position === 'pitcher').length,
      12,
      `${name} の投手数がちがう`,
    );
    assert.equal(
      players.filter((p) => p.isTwoWay).length,
      2,
      `${name} の二刀流がちがう`,
    );
  }

  // ⚠ **打順と投手起用まで作られていること**。名簿を渡すだけでは試合が
  //    組めない。実測で、打順が空のまま開幕して画面が例外で落ちた。
  for (const name of names) {
    const team = after.game.teams[name];
    const order = team.lineupSettings?.battingOrder || [];
    assert.equal(order.length, 9, `${name} の打順が9人でない: ${order.length}`);
    assert.deepEqual(
      [...order.map((e) => e.battingOrder)].sort((a, b) => a - b),
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      `${name} の打順の番号が揃っていない`,
    );
    const ids = new Set(team.players.map((p) => p.id));
    assert.ok(
      order.every((e) => ids.has(e.playerId)),
      `${name} の打順に名簿外の選手がいる`,
    );
    assert.ok(
      (team.pitchingRotation?.starters || []).length >= 3,
      `${name} の先発ローテーションが作られていない`,
    );
  }

  // ⚠ 決めなかった人にも渡ること（締め切りで押し通すため）
  const plan = defaultPhasePlan(
    { ...after, phase: { kind: 'pack_select' }, packs },
    names[0],
  );
  assert.ok(plan.packId, '既定の選択が空');
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log(
  `■ 初期メンバーセット: OK（${PACK_COUNT}セット×${PACK_SIZE}人 / 格と構成が揃う / 合計の開きが4%以内 / 取り合いを解く / 288人が重複しない）`,
);
