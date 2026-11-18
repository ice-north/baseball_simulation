// 先方回答（2026-11-16）「余裕があれば」のうち作ったものの検査（軽い）。
//   - A1 チーム診断: 試合が少ないうちは出さない・直せることを3つまで・該当の画面
//   - A4 オーナー名鑑: 参加した年から数える・優勝/昇格/Aクラスの節目・PC とアプリで同じ一文
//   node tools/sim-harness/online-owner-extra-check.mjs
import assert from 'node:assert/strict';
import { ownerRecords } from '../../server/ownerRecords.mjs';
import { seasonReview, nearMilestones } from '../../server/seasonReview.mjs';
import { diagnoseTeam, DIAGNOSIS_MIN_GAMES, DIAGNOSIS_MAX_ITEMS } from '../../src/online/teamDiagnosis.js';

// ---------- A1 ----------
{
  const bat = (pa, on) => ({ batting: { atBats: pa, hits: on, walks: 0, hitByPitch: 0 }, pitching: {} });
  const pit = (outs, er) => ({ batting: {}, pitching: { inningsPitched: outs, earnedRuns: er } });
  const fielders = ['catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'];
  const makeTeam = (name, opts = {}) => {
    const players = fielders.map((pos, i) => ({
      id: `${name}-${i}`,
      name: `${name}${pos}`,
      position: pos,
      fatigue: opts.tired === i ? 75 : 10,
      positionFitness: { [pos]: opts.offPos === i ? 40 : 100 },
      seasonStats: bat(100, opts.weak === i ? 22 : 33),
    }));
    players.push({ id: `${name}-bench`, name: `${name}控え`, position: 'left', fatigue: 0, seasonStats: bat(40, 16) });
    for (let k = 0; k < 6; k++)
      players.push({ id: `${name}-p${k}`, name: `${name}投${k}`, position: 'pitcher', fatigue: 0, seasonStats: pit(150, opts.badStarter === k ? 120 : 60) });
    return {
      name,
      players,
      lineupSettings: { battingOrder: fielders.map((pos, i) => ({ playerId: `${name}-${i}`, position: pos, battingOrder: i + 1 })) },
      pitchingRotation: { starters: [0, 1, 2, 3, 4].map((k) => `${name}-p${k}`), closer: `${name}-p5`, setupMen: [] },
    };
  };
  const names = ['自', 'A', 'B', 'C'];
  const results = (games, ownRuns = 3) => {
    const out = [];
    for (let g = 0; g < games; g++)
      for (let i = 0; i < names.length; i += 2)
        out.push({ home: names[i], away: names[i + 1], result: { homeScore: names[i] === '自' ? ownRuns : 4, awayScore: 4 } });
    return out;
  };
  const run = (own, games = 20, ownRuns = 3) => {
    const teams = [own, ...names.slice(1).map((n) => makeTeam(n))];
    return diagnoseTeam({ team: own, teamName: '自', rivals: teams.map((t) => ({ name: t.name, players: t.players })), results: results(games, ownRuns), leagueName: '1部' });
  };
  assert.equal(run(makeTeam('自'), DIAGNOSIS_MIN_GAMES - 1), null, '試合が少ないのに診断を出した');
  const all = run(makeTeam('自', { weak: 6, tired: 2, offPos: 4, badStarter: 1 }));
  assert.ok(all.summary.startsWith('得点は1部で'), all.summary);
  assert.equal(all.items.length, DIAGNOSIS_MAX_ITEMS, '3つまでに絞っていない');
  for (const item of all.items) assert.ok(['lineup', 'rotation', 'transfer'].includes(item.page), `知らない画面 ${item.page}`);
  const weakOnly = run(makeTeam('自', { weak: 6 }));
  assert.equal(weakOnly.items[0].kind, 'batting');
  assert.match(weakOnly.items[0].text, /7番/);
  assert.match(weakOnly.items[0].text, /控えの自控え/, '出塁している控えの名前を出さない');
  const tired = run(makeTeam('自', { tired: 2 }));
  assert.ok(tired.items.some((x) => x.kind === 'fatigue' && /疲労75/.test(x.text)), JSON.stringify(tired.items));
  const def = run(makeTeam('自', { offPos: 4 }));
  assert.ok(def.items.some((x) => x.kind === 'defense' && /遊撃.*40%/.test(x.text)), JSON.stringify(def.items));
  const starter = run(makeTeam('自', { badStarter: 1 }));
  assert.ok(starter.items.some((x) => x.kind === 'starter' && x.page === 'rotation'), JSON.stringify(starter.items));
  // 監査（2026-11-18）: 疲労80以上で代わりの居る野手は試合の日に自動で休む → 「疲れたまま出ています」と言わない
  {
    const team = makeTeam('自', { tired: 2 });
    team.players[2].fatigue = 85;
    assert.ok(!run(team).items.some((x) => x.kind === 'fatigue'), '自動で休む疲労80以上を「疲れたまま」と挙げた');
  }
  // 監査: 今は起用できない控え（isActive false）を勧めない
  {
    const team = makeTeam('自', { weak: 6 });
    team.players.find((p) => p.id === '自-bench').isActive = false;
    assert.doesNotMatch(run(team).items[0].text, /控えの自控え/, '起用できない控えを勧めた');
  }
  // 監査: 出塁率の分母に犠飛を入れる（成績の表と同じ数字）。statsOf で表と同じ成績を引く
  {
    const team = makeTeam('自', { weak: 6 });
    const own = team;
    const teams = [own, ...names.slice(1).map((n) => makeTeam(n))];
    const statsOf = (_t, p) =>
      p.id === '自-6' ? { batting: { ...p.seasonStats.batting, sacrificeFlies: 10 }, pitching: {} } : p.seasonStats;
    const r = diagnoseTeam({ team: own, teamName: '自', rivals: teams.map((t) => ({ name: t.name, players: t.players })), results: results(20, 3), leagueName: '1部', statsOf });
    assert.match(r.items[0].text, /出塁率\.200/, `犠飛を分母に入れていない: ${r.items[0].text}`);
  }
  // 穴が無くて部の下位 → 補強を挙げる。穴が無くて上位 → 一言だけ
  const low = run(makeTeam('自'), 20, 1);
  assert.deepEqual(low.items.map((x) => x.kind), ['roster']);
  assert.equal(low.items[0].page, 'transfer');
  const fine = run(makeTeam('自'), 20, 6);
  assert.equal(fine.items.length, 0);
  assert.ok(fine.note);
  console.log(`チーム診断: ${all.summary} / ${all.items.map((x) => x.text).join(' / ')}`);
}
// ---------- A4 ----------
{
  // 年表（league.history）: 古い順。球団 X は 1年目 2部4位 → 2年目 2部1位で昇格 → 3年目 1部2位 → 4年目 1部1位で優勝
  const st = (rows) => rows.map(([team, wins]) => ({ team, wins, losses: 50 - wins, draws: 0 }));
  const others = ['B1', 'B2', 'B3', 'B4', 'B5'];
  const leagues = (xLeague) => Object.fromEntries([['X', xLeague], ...others.map((t) => [t, xLeague])]);
  const year = (y, xLeague, xWins, extra = {}) => ({
    year: y,
    leagues: leagues(xLeague),
    standings: st([['X', xWins], ['B1', 30], ['B2', 28], ['B3', 26], ['B4', 20], ['B5', 18]]),
    moves: [],
    awards: {},
    ...extra,
  });
  const league = {
    members: [
      { teamName: 'X', label: 'いしだ', displayName: '北の湖' },
      { teamName: 'B1', label: '途中', displayName: 'ベイ', joinedYear: 3 },
    ],
    history: [
      year(1, 'B', 24),
      year(2, 'B', 40, { moves: [{ teamId: 'X', from: 'B', to: 'A' }] }),
      year(3, 'A', 29),
      year(4, 'A', 45, { playoffChampion: 'X' }),
    ],
    chronicle: { proDrafted: [{ team: 'X', year: 2 }, { team: 'B1', year: 1 }, { team: 'B1', year: 3 }] },
  };
  const [x, b1] = ownerRecords(league);
  assert.equal(x.label, 'いしだ', '優勝した人が上');
  assert.equal(x.head, 'いしだ（北の湖）');
  assert.equal(x.seasons, 4);
  assert.equal(x.top, 2);
  assert.equal(x.champions, 1);
  assert.equal(x.promotions, 1);
  assert.equal(x.pro, 1);
  assert.equal(x.best, '1部1位（4年目）');
  assert.equal(x.milestone, '4年目に初めて優勝');
  assert.equal(x.text, '4シーズン・1部2年・優勝1回・昇格1回・タイトル0・プロ入り1人。最高は1部1位（4年目）。4年目に初めて優勝');
  // 途中参加は参加した年（3年目）から。プロ入りも参加後だけ
  assert.equal(b1.seasons, 2);
  assert.equal(b1.pro, 1);
  // 昇格した年で止めると「初の1部昇格」
  const promoted = ownerRecords({ ...league, history: league.history.slice(0, 2) })[0];
  assert.equal(promoted.milestone, '2年目に初の1部昇格');
  // Aクラス3年続くと節目
  const steady = ownerRecords({ members: [league.members[0]], history: [year(1, 'B', 35), year(2, 'B', 35), year(3, 'B', 35)] })[0];
  assert.equal(steady.streak, 3);
  assert.equal(steady.milestone, '3年連続Aクラス');
  // 呼び名を変えていない人（呼び名＝球団名）は括弧を付けない
  assert.equal(ownerRecords({ members: [{ teamName: 'X', label: '湘南', displayName: '湘南' }], history: [] })[0].head, '湘南');
  // 終えたシーズンが無い
  const fresh = ownerRecords({ members: [league.members[0]], history: [] })[0];
  assert.equal(fresh.text, 'まだ終えたシーズンがありません');
  console.log(`オーナー名鑑: ${x.text}`);
}
// ---------- A6 ----------
{
  const st = (rows) => rows.map(([team, wins]) => ({ team, wins, losses: 50 - wins, draws: 0 }));
  const leagues = { X: 'A', Y: 'A', Z: 'B', W: 'B' };
  const last = {
    year: 2,
    leagues,
    standings: st([['X', 30], ['Y', 26], ['Z', 31], ['W', 20]]),
    moves: [{ teamId: 'Z', from: 'B', to: 'A' }, { teamId: 'Y', from: 'A', to: 'B' }],
    playoffChampion: 'X',
    awards: { homeRunKing: { name: '山田', team: 'X', homeruns: 30 }, honors: { A: { mvp: { name: '山田', team: 'X' }, rookie: { name: '佐藤', team: 'Y' } } } },
  };
  const make = (month) => ({
    season: { year: 3, currentDate: { month, day: 1 }, settings: { teamNames: ['X', 'Y', 'Z', 'W'] } },
    history: [last],
    chronicle: {
      milestones: [
        { year: 2, kind: 'season', side: 'batting', stat: 'homeruns', value: 30, label: 'シーズン30本塁打', team: 'X', name: '山田' },
        { year: 2, kind: 'career', side: 'batting', stat: 'hits', value: 100, label: '通算100安打', team: 'Z', name: '鈴木' },
        { year: 1, kind: 'career', side: 'batting', stat: 'hits', value: 100, label: '通算100安打', team: 'Z', name: '古い' },
      ],
      retired: [{ year: 2, team: 'W', name: '大ベテラン' }],
      proDrafted: [],
    },
    records: { seasons: { 1: { year: 1, players: { k1: { stats: { batting: { hits: 60 } } } } }, 2: { year: 2, players: { k1: { stats: { batting: { hits: 36 } } } } } } },
    game: { teams: { X: { players: [{ name: '近藤', onlinePlayerId: 'k1' }] } } },
  });
  const short = (n) => `${n}球団`;
  const r = seasonReview(make(2), short);
  assert.ok(r, '開幕前は出す');
  assert.equal(r.year, 2);
  assert.equal(r.headline, '2年目を振り返る');
  assert.match(r.lead, /1部はX球団、2部はZ球団が1位/);
  assert.match(r.lead, /Z球団が昇格し、Y球団が降格。/);
  const k = Object.fromEntries(r.articles.map((a) => [a.kicker, a]));
  assert.match(k['頂点'].body, /プレーオフもX球団が制し/);
  assert.match(k['年間表彰'].body, /1部MVPは山田（X球団）、新人王は佐藤（Y球団）/);
  assert.equal(k['今季の記録'].title, '山田がシーズン30本塁打', 'シーズン30本は通算100安打より珍しい');
  assert.ok(!k['今季の記録'].body.includes('古い'), '去年の節目は入れない');
  assert.match(k['去る人'].body, /大ベテラン（W球団）/);
  assert.equal(k['来季の注目'].title, '近藤、通算100安打へあと4');
  // 開幕したら出さない・年度更新の前（去年の記録が無い）も出さない
  assert.equal(seasonReview(make(4), short), null);
  assert.equal(seasonReview({ ...make(2), history: [{ ...last, year: 1 }] }, short), null);
  // あと少しの境目（刻みの15%以内）
  const near = nearMilestones(new Map([['a', { batting: { hits: 84 }, pitching: {} }], ['b', { batting: { hits: 86 }, pitching: {} }]]), new Map([['a', { name: 'A', team: 'X' }], ['b', { name: 'B', team: 'X' }]]), short);
  assert.deepEqual(near.map((x) => x.name), ['B']);
  console.log(`今季総括号: ${r.lead}`);
}
console.log('online-owner-extra-check PASS');
