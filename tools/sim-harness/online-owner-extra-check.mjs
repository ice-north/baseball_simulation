// 先方回答（2026-11-16）「余裕があれば」のうち作ったものの検査（軽い）。
//   - A1 チーム診断: 試合が少ないうちは出さない・直せることを3つまで・該当の画面
//   - A4 オーナー名鑑: 参加した年から数える・優勝/昇格/Aクラスの節目・PC とアプリで同じ一文
//   - E1 1人用の年間表彰・節目の記録（`src/season/soloChronicle.js`）
//   node tools/sim-harness/online-owner-extra-check.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ownerRecords } from '../../server/ownerRecords.mjs';
import { seasonReview, nearMilestones } from '../../server/seasonReview.mjs';
import { strategyStats, strategyMark } from '../../src/online/strategyStats.js';
import { CITY_PREFS, localPlayers, alumniPairs, tiesArticles } from '../../src/online/hometown.js';
import { soloSeasonEnd, slimHonors, isSoloRookie } from '../../src/season/soloChronicle.js';
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
    // 監査（2026-11-21）: 休養の目安（`restLine`）を選べるようになった。「早め」（60）なら疲労75も休む、
    //    「遅め」（100）なら疲労85は休まず出る
    const early = makeTeam('自', { tired: 2 });
    early.onlineTactics = { restLine: 'early' };
    assert.ok(!run(early).items.some((x) => x.kind === 'fatigue'), '休養「早め」で休む疲労75を「疲れたまま」と挙げた');
    team.onlineTactics = { restLine: 'late' };
    assert.ok(run(team).items.some((x) => x.kind === 'fatigue' && /疲労85/.test(x.text)), '休養「遅め」で休まない疲労85を挙げない');
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
// ---------- B2 ----------
{
  assert.deepEqual(strategyMark({ batting: 'balanced', defense: 'shift', pitching: 'nope' }), { defense: 'shift' }, '標準と知らない値は残さない');
  const bat = (ab, h, hr = 0, bb = 0) => ({ batting: { atBats: ab, hits: h, homeruns: hr, walks: bb, plateAppearances: ab + bb } });
  const games = {
    1: { home: 'X', away: 'Y', homeScore: 5, awayScore: 2, strategy: { X: { defense: 'shift' }, Y: {} }, teams: { X: [bat(30, 10, 2)], Y: [bat(30, 6)] } },
    2: { home: 'Y', away: 'X', homeScore: 4, awayScore: 1, strategy: { X: {}, Y: {} }, teams: { X: [bat(30, 5)], Y: [bat(32, 12, 1, 2)] } },
    // 印の無い古い試合は数えない
    3: { home: 'X', away: 'Y', homeScore: 9, awayScore: 0, teams: { X: [bat(40, 20)], Y: [bat(30, 1)] } },
  };
  const st = strategyStats(games, 'X');
  assert.equal(st.games, 2);
  const def = st.fields.find((f) => f.key === 'defense');
  assert.equal(def.side, 'defense');
  const shift = def.rows.find((r) => r.value === 'shift');
  assert.equal(shift.label, '守備シフト');
  assert.equal(shift.record, '1勝0敗');
  assert.equal(shift.avg, '.200', '守りの方針は相手の打率');
  assert.equal(shift.allowed, '2.0');
  const normal = def.rows.find((r) => r.value === 'normal');
  assert.equal(normal.record, '0勝1敗');
  assert.equal(normal.avg, '.375');
  const batting = st.fields.find((f) => f.key === 'batting');
  assert.equal(batting.rows.length, 1);
  assert.equal(batting.rows[0].avg, '.250', '攻めの方針は自球団の打率（15/60）');
  assert.equal(batting.rows[0].cells.length, batting.columns.length);
  assert.equal(strategyStats({ 3: games[3] }, 'X'), null, '印のある試合が無ければ出さない');
  console.log(`作戦別成績: ${def.rows.map((r) => `${r.label} ${r.record} 被打率${r.avg}`).join(' / ')}`);
}
// ---------- C3 ----------
{
  const ours = [
    { id: 1, name: '地元くん', highSchool: { name: '宮崎商', pref: '宮崎' } },
    { id: 2, name: '先輩', highSchool: { name: '東海大相模', pref: '神奈川' }, universityTeamName: '東海大学' },
    { id: 3, name: '出身なし' },
  ];
  const theirs = [{ id: 9, name: '後輩', highSchool: { name: '東海大相模', pref: '神奈川' } }, { id: 8, name: '大学の', universityTeamName: '東海大学' }];
  assert.deepEqual(localPlayers('宮崎', ours).map((p) => p.name), ['地元くん']);
  assert.deepEqual(localPlayers('湘南', ours).map((p) => p.name), ['先輩'], '地域の名前も県に引ける');
  assert.deepEqual(localPlayers('どこか', ours), [], '知らない土地は空');
  const pairs = alumniPairs(ours, theirs);
  assert.deepEqual(pairs.map((p) => [p.kind, p.school, p.ours, p.theirs]), [['高校', '東海大相模', ['先輩'], ['後輩']], ['大学', '東海大学', ['先輩'], ['大学の']]]);
  const a = tiesArticles({ city: '宮崎', short: '宮崎', players: ours, opponent: { short: '湘南', players: theirs } });
  assert.deepEqual(a.map((x) => x.kicker), ['地元の星', '同窓対決']);
  assert.match(a[1].body, /次の相手湘南には、先輩と同じ東海大相模出身の後輩がいる。ほかにも東海大学の縁がある。/);
  assert.ok(Object.values(CITY_PREFS).every((list) => list.length > 0));
  // 球団の土地の一覧（pyramidLeague.js の CITIES）が全部、県に引ける
  const src = readFileSync(new URL('../../src/online/pyramidLeague.js', import.meta.url), 'utf8');
  const start = src.indexOf('const CITIES = [');
  const cities = [...src.slice(start, src.indexOf('];', start)).matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(cities.length > 100);
  assert.deepEqual(cities.filter((c) => !CITY_PREFS[c]), [], '県の分からない土地がある');
  console.log(`縁: ${a.map((x) => x.title).join(' / ')}`);
}
// ---------- E1（1人用の年間表彰・節目） ----------
{
  const positions = ['catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'];
  const bat = (ab, h, hr) => ({ atBats: ab, hits: h, homeruns: hr, walks: 20, rbis: hr * 3, doubles: 10, triples: 1, stolenBases: 2 });
  const pit = (outs, er, w) => ({ inningsPitched: outs, earnedRuns: er, wins: w, losses: 5, strikeouts: 120, walks: 30, hits: 120, saves: 0 });
  const team = (name, good) => ({
    name,
    players: [
      ...positions.map((pos, i) => ({
        id: `${name}${i}`, name: `${name}${pos}`, position: pos, age: i === 0 ? 18 : 25,
        statsHistory: i === 0 ? [] : [{ year: 1 }],
        careerStats: { batting: { hits: i === 1 ? 950 : 0 }, pitching: {} },
        seasonStats: { batting: bat(400, good ? 130 : 100, i === 1 ? 31 : 8), pitching: {} },
      })),
      { id: `${name}P`, name: `${name}投手`, position: 'pitcher', age: 24, statsHistory: [{ year: 1 }],
        careerStats: { batting: {}, pitching: {} }, seasonStats: { batting: {}, pitching: pit(500, good ? 40 : 70, good ? 16 : 9) } },
    ],
  });
  const teams = { 甲: team('甲', true), 乙: team('乙', false) };
  const seasonData = {
    year: 3,
    settings: { teamNames: ['甲', '乙'], gamesPerSeason: 100 },
    standings: [{ team: '甲', wins: 60, losses: 40, gamesPlayed: 100 }, { team: '乙', wins: 40, losses: 60, gamesPlayed: 100 }],
  };
  const a = soloSeasonEnd(seasonData, teams);
  assert.ok(a.battingChampion, 'タイトルは今まで通り');
  const h = a.honors.solo;
  assert.equal(h.mvp.team, '甲');
  assert.equal(h.rookie?.name, '甲catcher', '新人王は記録の無い22歳以下');
  assert.equal(h.battery, null, '1人用に最優秀バッテリーは無い');
  assert.equal(h.bestNine.filter((x) => x.label === '外野手').length, 3);
  assert.ok(a.milestones.some((m) => m.label === '通算1000安打' && m.name === '甲first'), '通算は careerStats＋今季');
  assert.ok(a.milestones.some((m) => m.label === 'シーズン30本塁打'));
  assert.equal(isSoloRookie({ age: 23, statsHistory: [] }), false);
  // 一度締めた選手は今季が通算に入っているので足さない
  const done = { 甲: team('甲', true), 乙: team('乙', false) };
  done.甲.players[1].seasonFinalizedYear = 3;
  done.甲.players[1].careerStats.batting.hits = 1080;
  assert.ok(soloSeasonEnd(seasonData, done).milestones.some((m) => m.label === '通算1000安打'));
  done.甲.players[1].careerStats.batting.hits = 1200;
  const twice = soloSeasonEnd(seasonData, done).milestones.filter((m) => m.label.endsWith('安打') && m.name === '甲first');
  assert.deepEqual(twice.map((m) => m.label), ['通算1200安打'], '1330 と数えない');
  const slim = slimHonors(a.honors);
  assert.equal(slim.solo.mvp.id, undefined, '写しは軽く');
  console.log(`1人用の表彰: MVP ${h.mvp.name} 新人王 ${h.rookie.name} 節目 ${a.milestones.map((m) => m.label).join('・')}`);
}
console.log('online-owner-extra-check PASS');
