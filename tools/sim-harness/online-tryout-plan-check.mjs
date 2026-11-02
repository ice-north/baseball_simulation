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
import {
  createLeague,
  defaultPhasePlan,
  submitPhase,
} from '../../server/leagueEngine.mjs';
import {
  POSITION_GROUPS,
  SORT_KEYS,
  overallScore,
  filterCandidates,
  moveRanked,
  swapRanked,
  planSummary,
  nextFromPlan,
  plannedPicks,
} from '../../src/online/tryoutPlan.js';
import { ROSTER_TARGETS, rosterCounts } from '../../src/utils/constants.js';

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

  const posOf = (id) => candidates.find((p) => p.id === id).position;

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

  // --- 実際にドラフトを解決した名簿 -----------------------------------
  // ⚠ **ここが本当の不具合があった所**。純粋な関数だけ見ていても捕まらない。
  //    人の希望リストは順番どおりに取るだけで目標構成を見ておらず、
  //    実測で人の球団だけ**投手15人・野手9人**（控えゼロ）になった。
  //    CPUは全球団が投手10・野手14で揃っていたので、人だけ構造的に不利だった。
  {
    const live = (await store.read()).league;
    // ⚠ 投手だけを上に並べた希望で出す。順番どおりに取る実装だと投手だらけになる
    const pitcherFirst = [
      ...plan.rankedIds.filter((id) => posOf(id) === 'pitcher'),
      ...plan.rankedIds.filter((id) => posOf(id) !== 'pitcher'),
    ];
    await service.command('admin', sessionId, {
      requestId: 'submit-1',
      revision: live.revision,
      type: 'submit',
      payload: {
        phaseId: live.phase.id,
        plan: { count: plan.count, rankedIds: pitcherFirst },
        ready: true,
        baseSubmission: { plan: saved, ready: false },
      },
    });
    const after = (await store.read()).league;
    // 初期編成が終わると次（キャンプ）へ進む
    assert.notEqual(
      after.phase?.kind,
      'initial_tryout',
      '初期編成が解決していない',
    );
    const mine = rosterCounts(after.game.teams[teamName].players);
    const cpuNames = after.season.settings.teamNames.filter((n) => n !== teamName);
    const cpus = cpuNames.map((n) => rosterCounts(after.game.teams[n].players));
    // ⚠ 目標は「寄せる先」であって上限ではない（CPUも 捕1・内7 などに振れる）。
    //    見るのは**人がCPUより不利にならないこと**。以前は人だけ投手15人だった。
    assert.ok(
      mine.pitcher <= ROSTER_TARGETS.pitcher,
      `人の球団の投手が目標 ${ROSTER_TARGETS.pitcher} を超えた: ${mine.pitcher}（${JSON.stringify(mine)}）`,
    );
    const worstCpu = Math.max(...cpus.map((c) => c.pitcher));
    assert.ok(
      mine.pitcher <= worstCpu,
      `人の球団だけ投手が多い: 人${mine.pitcher} / CPU最大${worstCpu}`,
    );
    assert.ok(mine.catcher >= 1, `捕手が居ない: ${JSON.stringify(mine)}`);
    // ⚠ **控えが居ること**。野手9人だと代打も守備固めも出せず、
    //    レギュラーが全試合に出続けるので、成績の出方が一人用と別物になる。
    //    実測で、直す前は野手9人（CPUは14人）だった
    const fielders = after.game.teams[teamName].players.length - mine.pitcher;
    const cpuFielders = Math.min(...cpus.map((c) => 24 - c.pitcher));
    assert.ok(
      fielders >= 12,
      `野手が ${fielders}人しかいない（控えが出せない / CPUは最少${cpuFielders}人）`,
    );
  }

  // 守備位置の内訳
  const roster = league.game.teams[teamName].players;
  const summary = planSummary(plan.rankedIds, candidates, plan.count, roster);
  assert.equal(summary.picked.length, plan.count, '獲得予定の人数が合わない');
  const total = Object.values(summary.counts).reduce((a, b) => a + b, 0);
  assert.equal(total, plan.count, '内訳の合計が獲得予定人数と合わない');
  assert.deepEqual(summary.blocking, [], '既定案が「決定できない」になっている');

  // ⚠ **目標構成を超える区分は飛ばすこと**。候補の38%が投手なので、希望順を
  //    そのまま取ると投手だらけになる。実測で、人の球団だけ投手15人・野手9人
  //    （控えゼロ）になり、CPUは全球団が投手10・野手14で揃っていた。
  for (const [group, target] of Object.entries(ROSTER_TARGETS)) {
    assert.ok(
      summary.counts[group] <= target,
      `${group} が目標 ${target} を超えている: ${summary.counts[group]}`,
    );
  }
  // 投手だけを並べた希望でも、投手ばかりにはならない
  const allPitchersFirst = [
    ...plan.rankedIds.filter((id) => posOf(id) === 'pitcher'),
    ...plan.rankedIds.filter((id) => posOf(id) !== 'pitcher'),
  ];
  const skewed = planSummary(allPitchersFirst, candidates, 24, []);
  assert.equal(
    skewed.counts.pitcher,
    ROSTER_TARGETS.pitcher,
    `投手だけ並べたのに投手が ${skewed.counts.pitcher}人になった`,
  );
  assert.ok(
    skewed.counts.catcher > 0 && skewed.counts.infielder > 0,
    `野手が入っていない: ${JSON.stringify(skewed.counts)}`,
  );
  assert.deepEqual(skewed.blocking, [], '目標どおりなのに決定できない');

  // ⚠ どの区分も埋まったら、希望の先頭に戻す（枠が余るのに誰も取らない回を作らない）
  const full = Object.entries(ROSTER_TARGETS).flatMap(([g, n]) =>
    Array.from({ length: n }, () => ({
      position: g === 'infielder' ? 'short' : g === 'outfielder' ? 'left' : g,
    })),
  );
  const ordered = plan.rankedIds.map((id) => candidates.find((p) => p.id === id));
  assert.equal(
    nextFromPlan(ordered, full)?.id,
    ordered[0].id,
    '目標が埋まっていると誰も取らない',
  );
  assert.equal(nextFromPlan([], []), null, '候補が尽きても落ちない');

  // ⚠ **画面とサーバーが同じ規則を使うこと**。片方だけ直すと、画面に出ている
  //    顔ぶれと実際に取る顔ぶれが食い違う
  const simulated = rosterCounts(plannedPicks(plan.rankedIds, candidates, 24, []));
  for (const [group, target] of Object.entries(ROSTER_TARGETS))
    assert.ok(simulated[group] <= target, `画面側の予定が ${group} で目標を超えた`);

  // ⚠ 成り立たない編成は提出前に知らせる（詳細は下）
  const few = planSummary(plan.rankedIds, candidates, 10, roster);
  assert.ok(few.blocking.length > 0, '野手が足りないのに知らせていない');
  assert.ok(
    few.blocking.some((t) => t.includes('野手')),
    `野手の不足を名指ししていない: ${JSON.stringify(few.blocking)}`,
  );
  assert.deepEqual(few.warnings, [], '決定できない状態で助言も出している');

  // 捕手を1人も入れない並びは、捕手の不足として名指しする
  const noCatcher = [
    ...plan.rankedIds.filter((id) => posOf(id) !== 'catcher'),
    ...plan.rankedIds.filter((id) => posOf(id) === 'catcher'),
  ];
  assert.ok(
    planSummary(noCatcher, candidates, 9, roster).blocking.length > 0,
    '成り立たない編成を知らせない',
  );
  // ⚠ 既に名簿が埋まっている球団なら、0人でも成り立つ（初期編成だけの話にしない）
  const already = Array.from({ length: 12 }, (_, i) => ({
    id: -1 - i,
    position: i === 0 ? 'pitcher' : i === 1 ? 'catcher' : 'left',
  }));
  assert.deepEqual(
    planSummary(plan.rankedIds, candidates, 0, already).blocking,
    [],
    '名簿が足りている球団で「決定できない」になる',
  );

  // --- 1人が成り立たない案を出しても、全員が止まらないこと ---------------
  // ⚠ **以前は0人の案1つでトライアウト全体が解決できなかった**。サーバーは
  //    0人を受け付けるのに、解決の最後で「投手・捕手・野手が不足」で落ち、
  //    締め切りの自動解決も同じ所で失敗して、黙ったまま全員が止まった。
  //    いまは足りないぶんだけ必要な守備位置から自動で補う。
  {
    const two = createLeague({
      members: [{ userId: 'a' }, { userId: 'b' }],
      now: '2026-10-26T15:00:00.000Z',
    });
    const [ma, mb] = two.members;
    submitPhase(
      two,
      ma.userId,
      { phaseId: two.phase.id, plan: { count: 0, rankedIds: [] }, ready: true },
      '2026-10-26T15:00:00.000Z',
    );
    submitPhase(
      two,
      mb.userId,
      {
        phaseId: two.phase.id,
        plan: defaultPhasePlan(two, mb.teamName),
        ready: true,
      },
      '2026-10-26T15:00:00.000Z',
    );
    assert.notEqual(
      two.phase?.kind,
      'initial_tryout',
      '0人の案が1つあるだけで初期編成が解決しない',
    );
    const zero = two.game.teams[ma.teamName].players;
    const zc = rosterCounts(zero);
    assert.ok(
      zero.length - zc.pitcher >= 8 && zc.pitcher >= 1 && zc.catcher >= 1,
      `0人の案の球団が最低限を満たさない: ${JSON.stringify(zc)}`,
    );
    // 補うのは最低限だけ。希望していない選手で24人まで埋めない
    assert.ok(zero.length <= 10, `0人の案なのに ${zero.length}人も取った`);
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log(
  '■ 希望リストの組み立て: OK（絞り込み・並べ替え・人数が減らない・提出が通る・成り立たない編成を提出前に知らせる・人の名簿がCPUより不利にならない）',
);
