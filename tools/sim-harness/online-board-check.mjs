// ホームに出すリーグ全体の眺め（2部制の順位表・先発予定・ベスト5）の検査。
//
// ⚠ 主目的は「**見せてはいけないものを見せないこと**」と「**並びが決まること**」。
//    率の項目に規定未満を混ぜると、3打数2安打の控えが打率1位になって
//    順位表として意味を成さない。
// ⚠ 2部制の分け方は `standingsByLeague` が正本。ここで並べ直さない。
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore } from '../../server/storage/fileStore.mjs';
import { LeagueService } from '../../server/leagueService.mjs';
import { defaultPhasePlan } from '../../server/leagueEngine.mjs';
import { leagueLeaders, withStarters } from '../../server/leagueBoard.mjs';
import {
  PYRAMID_LEAGUES,
  TEAMS_PER_LEAGUE,
} from '../../src/online/pyramidLeague.js';

const dir = await mkdtemp(join(tmpdir(), 'pennant-board-'));
try {
  const store = new FileStore(join(dir, 'state.gz'));
  let now = '2026-10-26T15:00:00.000Z';
  const service = new LeagueService(store, {
    members: [{ userId: 'admin', label: '管理者' }],
    adminId: 'admin',
    allowStep: true,
    clock: () => now,
  });
  const admin = (await service.login('admin')).sessionId;
  const guest = (await service.login('guest')).sessionId;
  let seq = 0;
  const send = async (user, sess, type, payload) => {
    const l = (await store.read()).league;
    seq += 1;
    return service.command(user, sess, {
      requestId: `board-${type}-${seq}`,
      revision: l?.revision ?? 0,
      type,
      payload,
    });
  };
  await send('admin', admin, 'create');
  await send('guest', guest, 'join', { teamName: '湘南サンズ' });
  for (let i = 0; i < 4; i += 1) {
    const l = (await store.read()).league;
    if (!l.phase) break;
    for (const m of l.members) {
      const cur = (await store.read()).league;
      if (!cur.phase) break;
      await service.command(m.userId, m.userId === 'admin' ? admin : guest, {
        requestId: `board-submit-${i}-${m.userId}`,
        revision: cur.revision,
        type: 'submit',
        payload: {
          phaseId: cur.phase.id,
          plan: defaultPhasePlan(cur, m.teamName),
          ready: true,
          baseSubmission: null,
        },
      });
    }
  }
  for (let i = 0; i < 14; i += 1) {
    await send('admin', admin, 'step');
    now = new Date(Date.parse(now) + 3600000).toISOString();
  }
  const view = await service.view('admin', admin);

  // --- 2部制の順位表に必要なもの -------------------------------------
  // ⚠ 分け方そのものは画面側（`LeaguePanels` の `Standings`）が持つ。
  //    ここで作り直さない。投影が渡す材料だけを見る。
  assert.ok(view.teamLeagues, '所属リーグの表が無い（順位表を部ごとに分けられない）');
  assert.equal(
    Object.keys(view.teamLeagues).length,
    PYRAMID_LEAGUES.length * TEAMS_PER_LEAGUE,
    '全球団ぶんの所属リーグが無い',
  );
  for (const division of PYRAMID_LEAGUES)
    assert.equal(
      Object.values(view.teamLeagues).filter((id) => id === division.id).length,
      TEAMS_PER_LEAGUE,
      `${division.id} の球団数がちがう`,
    );

  // ⚠ 人が持っている球団だけ名前を添える。CPUに付けると持ち主が居るように見える
  assert.ok(view.teamOwners, '持ち主の表が無い');
  assert.deepEqual(
    Object.keys(view.teamOwners).sort(),
    (await store.read()).league.members.map((m) => m.teamName).sort(),
    '持ち主の表が参加者と合っていない',
  );
  // ⚠ 呼び名が球団名と同じときは空で返す。参加時の既定が球団名なので、
  //    そのまま出すと「湘南サンズ（湘南サンズ）」と2回並ぶ
  const joinedTeam = (await store.read()).league.members.find(
    (m) => m.userId === 'guest',
  ).teamName;
  assert.equal(view.teamOwners[joinedTeam], '', '球団名と同じ呼び名を返している');

  // 名前を付けると出る
  await send('guest', guest, 'profile', { playerName: 'あいす' });
  const named = await service.view('guest', guest);
  assert.equal(named.teamOwners[joinedTeam], 'あいす', '付けた名前が渡っていない');
  // 球団名も変えられる（内部名は変わらない）
  const before = (await store.read()).league.members.find((m) => m.userId === 'guest');
  await send('guest', guest, 'profile', { teamName: '湘南ドルフィンズ' });
  const after = (await store.read()).league.members.find((m) => m.userId === 'guest');
  assert.equal(after.teamName, before.teamName, '内部名が変わっている（記録が迷子になる）');
  assert.equal(after.displayName, '湘南ドルフィンズ');

  // --- 今後の日程 -----------------------------------------------------
  assert.ok(view.upcoming.length > 0, '今後の日程が空');
  for (const game of view.upcoming) {
    assert.ok(game.home && game.away, '対戦相手が無い');
    assert.notEqual(game.home, game.away, '同じ球団同士の試合');
    // ⚠ 先発予定は出すこと。「誰が投げるか」が分からないと日程を見る意味が薄い
    assert.ok(game.homeStarter, `先発予定が無い: ${game.home}`);
    assert.ok(game.awayStarter, `先発予定が無い: ${game.away}`);
  }
  // ⚠ 同じ球団が続けて出るとき、先発予定は**ローテを回すこと**。
  //    毎回同じ投手だと、1人が全試合に先発する予定になる。
  // ⚠ 本物のリーグで「最初に見つけた球団」を見ると脆い。先発が1人しか
  //    残っていない球団を引くと、連投が正しい挙動になって落ちる（実際に落ちた）。
  //    作り物の日程で、回る所だけを直に確かめる。
  {
    const teams = {
      A: {
        players: [
          { id: 1, name: '一番手' },
          { id: 2, name: '二番手' },
          { id: 3, name: '三番手' },
        ],
        pitchingRotation: { starters: [1, 2, 3], currentStarterIndex: 0 },
      },
      B: {
        players: [{ id: 9, name: '唯一' }],
        pitchingRotation: { starters: [9], currentStarterIndex: 0 },
      },
      C: { players: [], pitchingRotation: { starters: [] } },
    };
    const fake = [
      { id: 1, date: { year: 1, month: 4, day: 1 }, home: 'A', away: 'B' },
      { id: 2, date: { year: 1, month: 4, day: 2 }, home: 'A', away: 'B' },
      { id: 3, date: { year: 1, month: 4, day: 3 }, home: 'A', away: 'C' },
    ];
    const rows = withStarters(fake, teams);
    assert.deepEqual(
      rows.map((g) => g.homeStarter),
      ['一番手', '二番手', '三番手'],
      'ローテが回っていない',
    );
    // ⚠ 先発が1人しかいない球団は連投でよい（それが実際の予定）
    assert.deepEqual(rows.slice(0, 2).map((g) => g.awayStarter), ['唯一', '唯一']);
    // 投手が居なくても落ちない
    assert.equal(rows[2].awayStarter, null, '投手が居ないのに名前が出る');
    // ⚠ 途中から始めても回る（`currentStarterIndex` を見る）
    teams.A.pitchingRotation.currentStarterIndex = 2;
    assert.deepEqual(
      withStarters(fake, teams).map((g) => g.homeStarter),
      ['三番手', '一番手', '二番手'],
      '現在のローテ位置を見ていない',
    );
    // ⚠ 並べ替えや絞り込みをしないこと（それは投影側の仕事）
    assert.deepEqual(
      withStarters(fake, teams).map((g) => g.id),
      [1, 2, 3],
      '渡された順を変えている',
    );
  }

  // --- ベスト5 --------------------------------------------------------
  const leaders = Object.fromEntries(view.leaders.map((c) => [c.id, c]));
  for (const id of ['avg', 'homeruns', 'rbis', 'stolenBases', 'era', 'wins', 'strikeouts', 'saves'])
    assert.ok(leaders[id], `${id} の項目が無い`);
  assert.ok(leaders.avg.rows.length > 0, '打率の上位が空');
  assert.ok(leaders.avg.rows.length <= 5, '5人を超えている');
  // 打率は降順、防御率は昇順
  const avgValues = leaders.avg.rows.map((r) => r.value);
  assert.deepEqual(avgValues, [...avgValues].sort((a, b) => b - a), '打率が降順でない');
  const eraValues = leaders.era.rows.map((r) => r.value);
  assert.deepEqual(eraValues, [...eraValues].sort((a, b) => a - b), '防御率が昇順でない');

  // ⚠ **規定に届かない選手を混ぜないこと**。混ぜると3打数2安打の控えが1位になる
  const league = (await store.read()).league;
  const played = Object.fromEntries(
    league.season.standings.map((s) => [s.team, s.gamesPlayed || 0]),
  );
  for (const row of leaders.avg.rows) {
    const player = league.game.teams[row.team].players.find((p) => p.name === row.name);
    const b = player.seasonStats.batting;
    assert.ok(
      (b.atBats || 0) + (b.walks || 0) >= played[row.team] * 3.1,
      `規定未満が打率の上位に入っている: ${row.name}`,
    );
  }

  // 並びが決まっていること（見るたび順位が入れ替わらない）
  const again = await service.view('admin', admin);
  assert.deepEqual(
    again.leaders.map((c) => c.rows.map((r) => `${r.team}:${r.name}`)),
    view.leaders.map((c) => c.rows.map((r) => `${r.team}:${r.name}`)),
    '上位の並びが実行のたびに変わる',
  );

  // ⚠ **同値のとき、入力の順で結果が変わらないこと**。球団をなめる順は
  //    変わりうるのに、見るたび1位が入れ替わると順位表として信用できない。
  //    （`sort` が安定なだけでは足りない。入力が違えば出力も変わる）
  {
    const player = (id, name, homeruns) => ({
      id,
      name,
      seasonStats: { batting: { homeruns }, pitching: {} },
    });
    const make = (order) => ({
      season: {
        settings: { teamNames: order },
        standings: order.map((t) => ({ team: t, gamesPlayed: 10 })),
      },
      game: {
        teams: {
          甲: { players: [player(1, '同点太郎', 5)] },
          乙: { players: [player(2, '同点次郎', 5)] },
          丙: { players: [player(3, '同点三郎', 5)] },
        },
      },
    });
    const run = (order) =>
      leagueLeaders(make(order), (_t, p) => p.seasonStats)
        .find((c) => c.id === 'homeruns')
        .rows.map((r) => r.name);
    assert.deepEqual(
      run(['甲', '乙', '丙']),
      run(['丙', '乙', '甲']),
      '同点の並びが入力順に左右されている',
    );
  }

  // ⚠ 成績が1つも無い時点でも落ちないこと（開幕直後）
  assert.doesNotThrow(() =>
    leagueLeaders(
      { ...league, season: { ...league.season, standings: [] } },
      () => ({ batting: {}, pitching: {} }),
    ),
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log(
  '■ ホームの眺め: OK（所属リーグと持ち主の表・名前を後から変えられる・先発予定がローテを回る・規定未満を混ぜない・並びが決まる）',
);
