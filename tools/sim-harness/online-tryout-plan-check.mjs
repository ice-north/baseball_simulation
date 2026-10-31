// 初期編成・トライアウトの希望リストを組み立てる計算の検査。
//
// ⚠ 主目的は「**画面の操作が、サーバーの受け取れる提出を壊さないこと**」。
//    提出は `{ count, rankedIds }` で、サーバーは
//    「重複なし・全員が候補・rankedIds は count 以上」を求める。
//    画面側で1人でも落とすと、その場では気づかず**提出の瞬間だけ弾かれる**。
// ⚠ 「控えへ」は**消さずに末尾へ回すこと**。消すと、他球団と競合したときに
//    繰り上がる相手がいなくなり、人数を取りこぼす。
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore } from '../../server/storage/fileStore.mjs';
import { LeagueService } from '../../server/leagueService.mjs';
import { defaultPhasePlan } from '../../server/leagueEngine.mjs';
import {
  POSITION_GROUPS,
  SORT_KEYS,
  overallScore,
  filterCandidates,
  moveRanked,
  swapRanked,
  planSummary,
} from '../../src/online/tryoutPlan.js';

// --- 並べ替えと絞り込み（候補を作らずに済む部分） --------------------
{
  const mk = (id, position, over) => ({
    id,
    name: `選手${id}`,
    age: 20,
    position,
    batting: { meet: over, power: over },
    fielding: { defense: over },
    physical: { speed: over },
    pitching: { velocity: 115 + over / 2.5, control: over, stamina: over * 2 },
  });
  const list = [mk(3, 'pitcher', 60), mk(1, 'catcher', 80), mk(2, 'left', 80)];

  // ⚠ 球速とスタミナは0〜100ではない（球速115〜155・スタミナ0〜200）。
  //    素のまま足すと、能力の低い投手が良い野手を上回って上位に並ぶ
  // 速いだけで他は平凡な投手（140km/h＝100点満点なら62.5）と、全部50の野手。
  // 正規化すれば投手36.9＜野手50。素のまま足すと投手64＞野手50でひっくり返る
  const fastButWeak = { id: 9, name: 'x', position: 'pitcher', pitching: { velocity: 140, control: 20, stamina: 60, spinRate: 20 } };
  const plainBatter = { id: 8, name: 'y', position: 'left', batting: { meet: 50, power: 50 }, fielding: { defense: 50 }, physical: { speed: 50 } };
  assert.ok(
    overallScore(plainBatter) > overallScore(fastButWeak),
    '球速の桁が揃っていない（速いだけの投手が野手を上回る）',
  );
  // スタミナは0〜200。こちらも別に見る（球速だけ直しても片方が残る）
  const ironman = { id: 7, name: 'z', position: 'pitcher', pitching: { velocity: 120, control: 20, stamina: 200, spinRate: 20 } };
  assert.ok(
    overallScore(plainBatter) > overallScore(ironman),
    'スタミナの桁が揃っていない（スタミナだけ高い投手が野手を上回る）',
  );
  assert.equal(overallScore(null), 0, '選手が居なくても落ちない');

  // 総合の降順
  assert.deepEqual(filterCandidates(list, {}).map((p) => p.id), [1, 2, 3]);
  // ⚠ **同点のとき、入力の並びで結果が変わらないこと**。候補の入力順は
  //    サーバー次第で変わりうるのに、画面は「○番目の行を押した」で動く。
  //    入力順まかせだと、同点の選手が入れ替わって別人が動く。
  //    （`sort` が安定なだけでは足りない。入力が違えば出力も変わる）
  assert.deepEqual(
    filterCandidates([...list].reverse(), {}).map((p) => p.id),
    filterCandidates(list, {}).map((p) => p.id),
    '同点の並びが入力順に左右されている',
  );
  assert.deepEqual(filterCandidates(list, { desc: false }).map((p) => p.id), [3, 1, 2]);
  // 守備位置の絞り込み
  assert.deepEqual(filterCandidates(list, { group: 'pitcher' }).map((p) => p.id), [3]);
  assert.deepEqual(filterCandidates(list, { group: 'outfield' }).map((p) => p.id), [2]);
  assert.deepEqual(filterCandidates(list, { group: 'all' }).length, 3);
  // 名前での絞り込み
  assert.deepEqual(filterCandidates(list, { query: '選手2' }).map((p) => p.id), [2]);
  assert.deepEqual(filterCandidates(list, { query: '  ' }).length, 3, '空白だけなら絞らない');
  // ⚠ **元の配列を壊さないこと**。`sort` は破壊的なので、絞り込みを挟まないと
  //    候補の並びそのものが変わり、ページ送りが飛ぶ
  assert.deepEqual(list.map((p) => p.id), [3, 1, 2], '元の候補の並びが変わっている');

  // 並べ替えの選択肢は全部使える
  for (const s of SORT_KEYS)
    assert.doesNotThrow(() => filterCandidates(list, { sortKey: s.key }), s.key);
  // 守備位置の区分は、全部の守備位置を1回ずつ覆っている
  const covered = POSITION_GROUPS.flatMap((g) => g.positions || []);
  assert.deepEqual(
    [...covered].sort(),
    ['catcher', 'center', 'first', 'left', 'pitcher', 'right', 'second', 'short', 'third'],
    '守備位置の区分に漏れか重複がある',
  );
}

// --- 並べ替えの操作 --------------------------------------------------
{
  const ids = [1, 2, 3, 4, 5];
  // ⚠ 取り除いてから入れること。先に入れると後ろへ動かすとき1つずれる
  assert.deepEqual(moveRanked(ids, 1, 3), [2, 3, 4, 1, 5], '後ろへ動かすとずれる');
  assert.deepEqual(moveRanked(ids, 5, 0), [5, 1, 2, 3, 4]);
  assert.deepEqual(moveRanked(ids, 3, ids.length), [1, 2, 4, 5, 3], '末尾送り');
  // 範囲外でも落とさない・落ちない
  assert.deepEqual(moveRanked(ids, 2, -5), [2, 1, 3, 4, 5]);
  assert.deepEqual(moveRanked(ids, 2, 99), [1, 3, 4, 5, 2]);
  // ⚠ 候補に居ない人を足さない（提出は「全員が候補であること」を求める）
  assert.deepEqual(moveRanked(ids, 99, 0), ids, '候補に居ない人が混ざる');

  assert.deepEqual(swapRanked(ids, 0, 1), [2, 1, 3, 4, 5]);
  assert.deepEqual(swapRanked(ids, 0, -1), ids, '先頭より上は何もしない');
  assert.deepEqual(swapRanked(ids, 4, 1), ids, '末尾より下は何もしない');
  // ⚠ どの操作でも元の配列を壊さない（Reactの再描画が止まる）
  assert.deepEqual(ids, [1, 2, 3, 4, 5], '元の配列が書き換わっている');
}

// --- 本物の候補で、提出まで通るか ------------------------------------
const dir = await mkdtemp(join(tmpdir(), 'pennant-tryout-'));
try {
  const store = new FileStore(join(dir, 'state.gz'));
  const service = new LeagueService(store, {
    members: [{ userId: 'admin', label: '管理者' }],
    adminId: 'admin',
    clock: () => '2026-10-26T15:00:00.000Z',
  });
  const sessionId = (await service.login('admin')).sessionId;
  await service.command('admin', sessionId, {
    requestId: 'create-0',
    revision: 0,
    type: 'create',
  });
  const league = (await store.read()).league;
  assert.equal(league.phase.kind, 'initial_tryout');
  const candidates = league.phase.candidates;
  // ⚠ 候補は実測360人。1本のリストで扱える数ではない、という前提の根拠
  assert.ok(candidates.length > 200, `候補が少なすぎる: ${candidates.length}`);

  const teamName = league.members[0].teamName;
  const base = defaultPhasePlan(league, teamName);
  assert.equal(base.rankedIds.length, candidates.length, '既定案が全員を並べていない');
  assert.ok(base.count > 0);

  // 画面の操作を順に当てる: 最下位の選手を最優先へ → 隣と入替 → 控えへ
  let plan = { ...base, rankedIds: [...base.rankedIds] };
  const lastId = plan.rankedIds.at(-1);
  plan = { ...plan, rankedIds: moveRanked(plan.rankedIds, lastId, 0) };
  assert.equal(plan.rankedIds[0], lastId, '最優先へが効いていない');
  plan = { ...plan, rankedIds: swapRanked(plan.rankedIds, 0, 1) };
  assert.equal(plan.rankedIds[1], lastId);
  plan = { ...plan, rankedIds: moveRanked(plan.rankedIds, lastId, plan.rankedIds.length) };
  assert.equal(plan.rankedIds.at(-1), lastId, '控えへが効いていない');

  // ⚠ **どの操作をしても人数が変わらないこと**。1人でも落ちると提出が弾かれる
  assert.equal(
    plan.rankedIds.length,
    candidates.length,
    '操作のあとで候補が減っている',
  );
  assert.equal(new Set(plan.rankedIds).size, plan.rankedIds.length, '重複している');

  // サーバーが受け取れること（ここが本丸）
  const current = (await store.read()).league;
  await service.command('admin', sessionId, {
    requestId: 'submit-0',
    revision: current.revision,
    type: 'submit',
    payload: {
      phaseId: current.phase.id,
      plan,
      ready: false,
      baseSubmission: null,
    },
  });
  const saved = (await store.read()).league.phase.submissions.admin.plan;
  assert.deepEqual(saved.rankedIds, plan.rankedIds, '並べ替えがサーバーに届いていない');

  // 守備位置の内訳
  const roster = league.game.teams[teamName].players;
  const summary = planSummary(plan.rankedIds, candidates, plan.count, roster);
  const total = Object.values(summary.counts).reduce((a, b) => a + b, 0);
  assert.equal(total, plan.count, '内訳の合計が獲得予定人数と合わない');
  assert.deepEqual(summary.blocking, [], '既定案が「決定できない」になっている');

  // ⚠ **サーバーが拒む編成を、提出前に知らせること**。手続きは全員ぶんまとめて
  //    処理されるので、1球団が成り立たないと全員が先へ進めない。
  //    実測で、獲得希望人数を10にすると野手が6人になり、サーバーが
  //    「投手・捕手・野手が不足します」で手続き全体を失敗させた。
  const few = planSummary(plan.rankedIds, candidates, 10, roster);
  assert.ok(few.blocking.length > 0, '野手が足りないのに知らせていない');
  assert.ok(
    few.blocking.some((t) => t.includes('野手')),
    `野手の不足を名指ししていない: ${JSON.stringify(few.blocking)}`,
  );
  // ⚠ 成り立たないときは助言を出さない（赤と黄が同時に出ると、どちらが
  //    致命的なのか分からなくなる）
  assert.deepEqual(few.warnings, [], '決定できない状態で助言も出している');

  // 捕手を1人も入れない並びは、捕手の不足として名指しする
  const posOf = (id) => candidates.find((p) => p.id === id).position;
  const noCatcher = [
    ...plan.rankedIds.filter((id) => posOf(id) !== 'catcher'),
    ...plan.rankedIds.filter((id) => posOf(id) === 'catcher'),
  ];
  assert.ok(
    planSummary(noCatcher, candidates, plan.count, roster).blocking.includes(
      '捕手が1人もいません',
    ),
    '捕手が0人でも知らせない',
  );
  // 捕手を先頭に置けば消える
  const catcherFirst = moveRanked(noCatcher, candidates.find((p) => p.position === 'catcher').id, 0);
  assert.ok(
    !planSummary(catcherFirst, candidates, plan.count, roster).blocking.some((t) =>
      t.includes('捕手'),
    ),
    '捕手が居るのに知らせている',
  );
  // ⚠ 既に名簿が埋まっている球団なら、0人でも成り立つ（初期編成だけの話にしない）
  const full = Array.from({ length: 12 }, (_, i) => ({
    id: -1 - i,
    position: i === 0 ? 'pitcher' : i === 1 ? 'catcher' : 'left',
  }));
  assert.deepEqual(
    planSummary(plan.rankedIds, candidates, 0, full).blocking,
    [],
    '名簿が足りている球団で「決定できない」になる',
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log(
  '■ 希望リストの組み立て: OK（絞り込み・並べ替え・人数が減らない・提出が通る・成り立たない編成を提出前に知らせる）',
);
