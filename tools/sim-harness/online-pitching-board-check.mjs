// PC版の投手起用（`src/online/PitchingBoard.jsx`）の編集の中身（`src/online/pitchingEdit.js`）と、
// スマホとPCの間の未保存の編集の受け渡し（`src/online/lineupBridge.js`）。
//
// ⚠ 見るのは「どの操作も**サーバーが受け付ける形**を崩さない」こと。正本は
//    `validateLineup`（先発1〜8人）と `validateTactics`（先発には先発の型・ほかは救援の役割・
//    守護神は1人まで）。操作を無作為に重ねても、毎回そのまま保存できる形であること。
// ⚠ 疲労の色の境目はサーバーと同じ値であること（先発の登板を飛ばす・救援を使わない）。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  MAX_STARTERS,
  STARTER_ORDER,
  RELIEF_ORDER,
  STARTER_SKIP_FATIGUE,
  RELIEF_REST_FATIGUE,
  pitchingFromLineup,
  planFromPitching,
  samePitching,
  moveStarter,
  swapStarters,
  swapPitchers,
  setRole,
  insertStarter,
  reliefGroups,
  pitchingProblems,
} from '../../src/online/pitchingEdit.js';
import { STARTER_ROLES, RELIEF_ROLES } from '../../src/online/tactics.js';
import { validateLineup } from '../../src/online/shared.js';
import { validateTactics } from '../../server/lineupTactics.mjs';
import { STARTER_SKIP_FATIGUE as SERVER_STARTER_SKIP } from '../../server/dailyLineup.mjs';
import {
  planFromTeam,
  hasUnsavedFullLineup,
  restoreFromFullLineup,
  fullLineupFromBoards,
  teamFromView,
  LINEUP_BOARD_KEYS,
  PITCHING_BOARD_KEYS,
} from '../../src/online/lineupBridge.js';

assert.equal(
  STARTER_SKIP_FATIGUE,
  SERVER_STARTER_SKIP,
  '先発を飛ばす疲労がサーバーとずれた',
);
const simulation = await readFile(
  new URL('../../src/game/autoSimulation.js', import.meta.url),
  'utf8',
);
assert.match(
  simulation,
  new RegExp(`fatigueGate = Math\\.max\\(${RELIEF_REST_FATIGUE}, `),
  '救援を使わない疲労が試合の判断（autoSimulation の fatigueGate）とずれた',
);
assert.deepEqual(
  [...STARTER_ORDER].sort(),
  Object.keys(STARTER_ROLES).sort(),
  '先発の型の選択肢がサーバーの一覧とずれた',
);
assert.deepEqual(
  [...RELIEF_ORDER].sort(),
  Object.keys(RELIEF_ROLES).sort(),
  '救援の役割の選択肢がサーバーの一覧とずれた',
);

// --- 名簿: 投手12人（1〜12）と野手8人（31〜38）。13は外れた投手
const FIELD = [
  'catcher',
  'first',
  'second',
  'third',
  'short',
  'left',
  'center',
  'right',
];
const roster = [
  ...Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    name: `投手${i + 1}`,
    position: 'pitcher',
    isActive: true,
    fatigue: 0,
    pitching: {},
  })),
  { id: 13, name: '投手13', position: 'pitcher', isActive: false },
  ...FIELD.map((position, i) => ({
    id: 31 + i,
    name: `野手${31 + i}`,
    position,
    isActive: true,
    positionFitness: { [position]: 100 },
  })),
];
const battingOrder = FIELD.map((position, i) => ({
  playerId: 31 + i,
  position,
  battingOrder: i + 1,
}));
const lineup = {
  battingOrder,
  starters: [1, 2, 3, 4, 5],
  pitcherRoles: { 1: 'ace', 6: 'closer', 7: 'setup', 8: 'long', 9: 'setup' },
  strategy: { batting: 'normal' },
};
const team = () => ({
  players: roster,
  pitchingRotation: {
    starters: lineup.starters,
    pitcherRoles: lineup.pitcherRoles,
  },
});
/** サーバーがそのまま受け付けるか（受け付けなければ例外） */
const accepted = (state) => {
  const plan = { battingOrder, ...planFromPitching(state) };
  validateLineup(team(), plan);
  validateTactics(team(), plan, true);
  assert.deepEqual(
    pitchingProblems(state, roster),
    [],
    '操作の後に保存できない理由が出た',
  );
};

// 保存済みから作る: 全投手に役割が付く（無い投手は「おまかせ」）。外れた投手は入らない
const start = pitchingFromLineup(lineup, roster);
assert.deepEqual(start.starters, [1, 2, 3, 4, 5]);
assert.equal(start.roles[1], 'ace');
assert.equal(
  start.roles[2],
  'auto_s',
  '役割の無い先発が「おまかせ」にならない',
);
assert.equal(
  start.roles[10],
  'auto_r',
  '役割の無い救援が「おまかせ」にならない',
);
assert.equal(start.roles[13], undefined, '外れた投手に役割が付いた');
assert.equal(Object.keys(start.roles).length, 12);
accepted(start);

// --- 1つずつの操作
{
  // 先発どうしの入れ替え: 登板順だけ（型はその投手のまま）
  const s = swapPitchers(start, 1, 3);
  assert.deepEqual(s.starters, [3, 2, 1, 4, 5]);
  assert.equal(s.roles[1], 'ace');
  accepted(s);
  // 先発と救援の入れ替え: 救援がその登板順と型を、先発が救援の役割を引き継ぐ（交代と同じ）
  const t = swapPitchers(start, 1, 6);
  assert.deepEqual(
    t.starters,
    [6, 2, 3, 4, 5],
    '救援が先発の登板順を引き継がない',
  );
  assert.equal(t.roles[6], 'ace', '救援が先発の型を引き継がない');
  assert.equal(t.roles[1], 'closer', '先発が救援の役割を引き継がない');
  accepted(t);
  assert.deepEqual(swapPitchers(start, 6, 1), t, '入れ替えが向きで変わる');
  // 救援どうし: 役割の入れ替え
  const u = swapPitchers(start, 6, 8);
  assert.equal(u.roles[6], 'long');
  assert.equal(u.roles[8], 'closer');
  assert.deepEqual(u.starters, start.starters);
  accepted(u);
  assert.equal(swapPitchers(start, 6, 6), start, '同じ投手どうしで変わった');
}
{
  // 守護神を別の救援へ: 前の守護神は、新しい守護神の前の役割を引き継ぐ
  const s = setRole(start, 7, 'closer');
  assert.equal(s.roles[7], 'closer');
  assert.equal(s.roles[6], 'setup', '前の守護神が役割を引き継がない');
  accepted(s);
  // 先発から守護神へ: ローテから外れ、前の守護神は「おまかせ」
  const t = setRole(start, 5, 'closer');
  assert.deepEqual(t.starters, [1, 2, 3, 4]);
  assert.equal(t.roles[6], 'auto_r');
  accepted(t);
  // 救援を先発の型に: ローテの最後へ
  const u = setRole(start, 10, 'short');
  assert.deepEqual(u.starters, [1, 2, 3, 4, 5, 10]);
  accepted(u);
  // 先発の型の付け替えは、ローテの中の位置を変えない
  const v = setRole(start, 3, 'quality');
  assert.deepEqual(v.starters, start.starters);
  assert.equal(v.roles[3], 'quality');
}
{
  // 最後の1人の先発は救援にできない・先発は8人まで
  let one = start;
  for (const id of [2, 3, 4, 5]) one = setRole(one, id, 'auto_r');
  assert.deepEqual(one.starters, [1]);
  assert.equal(setRole(one, 1, 'mopup'), one, '最後の先発が救援になった');
  let full = start;
  for (const id of [6, 7, 8])
    full = insertStarter(full, id, full.starters.length);
  assert.equal(full.starters.length, MAX_STARTERS);
  assert.equal(setRole(full, 9, 'ace'), full, '9人目の先発が入った');
  assert.equal(insertStarter(full, 10, 0), full, '9人目の先発が入った');
  accepted(full);
  // ローテの見出しへ落とした先発は最後へ動く（人数は変わらない）
  assert.deepEqual(
    insertStarter(start, 1, start.starters.length).starters,
    [2, 3, 4, 5, 1],
  );
  assert.deepEqual(moveStarter(start, 4, 0).starters, [5, 1, 2, 3, 4]);
  assert.deepEqual(swapStarters(start, 0, 4).starters, [5, 2, 3, 4, 1]);
}

// --- 操作を無作為に重ねても、毎回サーバーが受け付ける形のまま
{
  let seed = 7;
  const rand = (n) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const ids = roster
    .filter((p) => p.position === 'pitcher' && p.isActive)
    .map((p) => p.id);
  const roles = [...STARTER_ORDER, ...RELIEF_ORDER];
  let state = start;
  for (let i = 0; i < 3000; i += 1) {
    const a = ids[rand(ids.length)];
    const b = ids[rand(ids.length)];
    const op = rand(5);
    if (op === 0) state = swapPitchers(state, a, b);
    else if (op === 1) state = setRole(state, a, roles[rand(roles.length)]);
    else if (op === 2)
      state = insertStarter(state, a, rand(state.starters.length + 1));
    else if (op === 3)
      state = moveStarter(
        state,
        rand(state.starters.length),
        rand(state.starters.length),
      );
    else state = setRole(state, a, 'closer');
    accepted(state);
    assert.equal(
      Object.keys(state.roles).length,
      12,
      '役割を持つ投手の数が変わった',
    );
  }
}

// --- 救援の並び: 使われる場面の順。先発は入らない
{
  const groups = reliefGroups(start, roster);
  assert.deepEqual(
    groups.map((g) => g.role),
    RELIEF_ORDER,
  );
  assert.deepEqual(
    groups.flatMap((g) => g.players.map((p) => p.id)),
    [6, 7, 9, 8, 10, 11, 12],
    '救援が場面の順に並ばない',
  );
}

// --- 崩れた保存（守護神2人・名簿に居ない先発）は理由が出る（保存のボタンが押せない）
{
  const broken = { starters: [1, 99], roles: { ...start.roles, 7: 'closer' } };
  const problems = pitchingProblems(broken, roster);
  assert.ok(problems.some((m) => /守護神/.test(m)));
  assert.ok(problems.some((m) => /名簿/.test(m)));
  assert.ok(samePitching(start, pitchingFromLineup(lineup, roster)));
  // ⚠ 名簿に居ない先発（外れた投手13・居ない99）を隠さない。隠すと保存済みの崩れが
  //    画面にも保存の検査にも出ず、別のページの保存がサーバーで弾かれる
  const stale = pitchingFromLineup(
    { ...lineup, starters: [1, 13, 2, 99] },
    roster,
  );
  assert.deepEqual(
    stale.starters,
    [1, 13, 2, 99],
    '名簿に居ない先発を黙って外した',
  );
  assert.ok(pitchingProblems(stale, roster).some((m) => /名簿/.test(m)));
  // その行に救援を入れると、その登板順で先発の「おまかせ」になる
  const fixed = swapPitchers(stale, 13, 10);
  assert.deepEqual(fixed.starters, [1, 10, 2, 99]);
  assert.equal(fixed.roles[10], 'auto_s');
  assert.deepEqual(
    swapPitchers(stale, 10, 13),
    fixed,
    '入れ替えが向きで変わる',
  );
  // 「救援」へ移すと外れるだけ（役割は持たない）
  const dropped = setRole(fixed, 99, 'auto_r');
  assert.deepEqual(dropped.starters, [1, 10, 2]);
  assert.equal(dropped.roles[99], undefined);
  accepted(dropped);
}

// --- スマホとPCの間の受け渡し（スマホを横にするとPCの画面に、縦に戻すとスマホの画面になる）
{
  const view = { teamName: 'T', roster, lineup, nextStarterId: 1 };
  const fresh = teamFromView(view);
  const kept = {
    team: fresh,
    base: JSON.parse(JSON.stringify(lineup)),
    basePlan: JSON.stringify(planFromTeam(fresh)),
  };
  assert.equal(
    restoreFromFullLineup(kept),
    null,
    '編集していないのに受け取った',
  );
  // スマホの全画面編成で、先発の順と打順を変えた（中の画面は team をその場で書き換える）
  fresh.pitchingRotation.starters = [2, 1, 3, 4, 5];
  const [first, second] = fresh.lineupSettings.battingOrder;
  [first.battingOrder, second.battingOrder] = [2, 1];
  const restored = restoreFromFullLineup(kept);
  assert.deepEqual(restored.lineup.starters, [2, 1, 3, 4, 5]);
  assert.equal(
    restored.lineup.battingOrder[0].playerId,
    32,
    '打順の編集を受け取らない',
  );
  assert.deepEqual(restored.base, lineup);
  // PCのページはそこから作る（投手起用の値）
  assert.deepEqual(
    pitchingFromLineup(restored.lineup, roster).starters,
    [2, 1, 3, 4, 5],
  );

  // PCで保存していない編集を、スマホの形で残す
  assert.equal(fullLineupFromBoards(view, []), null, '編集が無いのに残した');
  const edited = setRole(start, 10, 'short');
  const full = fullLineupFromBoards(view, [
    {
      keys: PITCHING_BOARD_KEYS,
      plan: planFromPitching(edited),
      baseLineup: lineup,
    },
  ]);
  assert.ok(
    hasUnsavedFullLineup(full),
    'スマホに戻したとき、編集が開き直されない',
  );
  assert.deepEqual(planFromTeam(full.team).starters, [1, 2, 3, 4, 5, 10]);
  assert.equal(planFromTeam(full.team).pitcherRoles[10], 'short');
  assert.deepEqual(
    planFromTeam(full.team).battingOrder,
    battingOrder,
    '投手起用の編集だけなのに打順が変わった',
  );
  // 起点は最新に載せる（自分の項目が他で変わっていなければ）。方針が別の画面で
  // 保存されていても、スマホで保存すると食い違いにならない
  const latest = { ...lineup, strategy: { batting: 'patient' } };
  const rebased = fullLineupFromBoards({ ...view, lineup: latest }, [
    {
      keys: PITCHING_BOARD_KEYS,
      plan: planFromPitching(edited),
      baseLineup: lineup,
    },
  ]);
  assert.deepEqual(rebased.base, latest, '最新の編成に載せていない');
  assert.equal(
    planFromTeam(rebased.team).strategy.batting,
    'patient',
    '方針を古い値に戻した',
  );
  // 自分の項目（先発）が他で変わっていたら、編集を始めたときの起点のまま（保存で弾かれる）
  const moved = { ...lineup, starters: [5, 4, 3, 2, 1] };
  const conflicted = fullLineupFromBoards({ ...view, lineup: moved }, [
    {
      keys: PITCHING_BOARD_KEYS,
      plan: planFromPitching(edited),
      baseLineup: lineup,
    },
  ]);
  assert.deepEqual(conflicted.base, lineup, '食い違いを最新に載せて隠した');
  // 2つのページの編集をまとめる
  const both = fullLineupFromBoards(view, [
    {
      keys: PITCHING_BOARD_KEYS,
      plan: planFromPitching(edited),
      baseLineup: lineup,
    },
    {
      keys: LINEUP_BOARD_KEYS,
      plan: { battingOrder: restored.lineup.battingOrder },
      baseLineup: lineup,
    },
  ]);
  assert.equal(planFromTeam(both.team).battingOrder[0].playerId, 32);
  assert.deepEqual(planFromTeam(both.team).starters, [1, 2, 3, 4, 5, 10]);
  // PCで受け取って、そのまま縦に戻しても同じ編集
  const back = restoreFromFullLineup(both);
  assert.deepEqual(back.lineup.starters, [1, 2, 3, 4, 5, 10]);
  assert.equal(back.lineup.battingOrder[0].playerId, 32);
}

console.log(
  'online-pitching-board-check PASS（どの操作もサーバーが受け付ける形 / 入れ替え・役割・守護神 / 先発1〜8人 / 救援の並び / 疲労の境目がサーバーと同じ / スマホとPCの受け渡し）',
);
