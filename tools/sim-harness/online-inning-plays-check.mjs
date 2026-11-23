// 回ごとの攻撃（スコアボードの数字を押すと出る打席の並び）の検査。
//
// ⚠ いしだ 2026-11-19「過去の成績をみたとき、スコアをクリックすると、その回の攻撃を
//    時系列で表示してほしい」。サーバーが `game.plays` に残し、画面（`GameHistory.jsx` の
//    `InningPlays`）が `src/online/gamePlays.js` で読む。
// ⚠ **いちばん大事なのは「半回の点の合計＝スコアボードのその回の数字」**。
//    打席の外で入った点（暴投・盗塁・サヨナラの暴投）を落とすとここがずれる。
//   node tools/sim-harness/online-inning-plays-check.mjs
import { quiet } from './lib/quiet.mjs';
import assert from 'node:assert/strict';
import {
  createLeague,
  defaultPhasePlan,
  submitPhase,
  advanceLeagueDay,
} from '../../server/leagueEngine.mjs';
import { PLAY_CODES, inningPlaysOf } from '../../server/recordedStats.mjs';
import { hasLivePlays, liveScenes } from '../../src/online/look/playByPlay.js';
import {
  hasInningPlays,
  inningPlays,
  inningRuns,
  inningKey,
  PLAY_TEXT,
} from '../../src/online/gamePlays.js';

// ① 記号は**サーバーと画面で同じ**（片方だけ足すと「本」などが生の記号で出る）
for (const code of PLAY_CODES)
  assert.ok(PLAY_TEXT[code], `記号「${code}」に画面の文が無い`);
assert.deepEqual(
  Object.keys(PLAY_TEXT).sort(),
  [...PLAY_CODES].sort(),
  '画面の文とサーバーの記号が合っていない',
);

// ①' **打席の外で入った点**（暴投・盗塁・サヨナラの暴投）。本物の試合では滅多に出ないので、
//     作った記録で確かめる。⚠ ここを落とすと「半回の点の合計＝スコアボードの数字」が崩れる
{
  const box = {
    home: 'H',
    away: 'A',
    teams: {
      A: [{ id: 1, name: '打者あ' }, { id: 2, name: '打者い' }],
      H: [{ id: 9, name: '守る人' }],
    },
  };
  const events = [
    // 1回表: 単打
    { inning: 1, offense: 'A', batterId: 1, delta: { hits: 1 }, scoreBefore: { away: 0, home: 0 }, scoreAfter: { away: 0, home: 0 } },
    // 次の打席までに1点（暴投）。その打席は2ランで、打席の後にもう1点（サヨナラの暴投と同じ形）
    { inning: 1, offense: 'A', batterId: 2, delta: { homeruns: 1 }, scoreBefore: { away: 1, home: 0 }, scoreAfter: { away: 3, home: 0 } },
  ];
  const plays = inningPlaysOf(events, box, { awayScore: 4, homeScore: 0 });
  assert.deepEqual(
    plays['1t'],
    [[0, '安', 0, 0], [null, '走', 1, 0], [1, '本', 2, 0], [null, '走', 1, 0]],
    `打席の外の点が入っていない: ${JSON.stringify(plays['1t'])}`,
  );
  const game = { ...box, plays };
  assert.equal(inningRuns(game, 1, 'top'), 4, '半回の点の合計が合わない');
  const rowsOf = inningPlays(game, 1, 'top').rows;
  assert.equal(rowsOf[0].name, '打者あ', '打者の名前が引けない');
  assert.equal(rowsOf[1].order, null, '打席の外の点に打順が付いている');
  assert.equal(rowsOf[2].text, 'ホームラン', '記号が文になっていない');
  // 打席として数えるのは打者の居る行だけ（その回の何人目か）
  assert.deepEqual(rowsOf.map((r) => r.order), [1, null, 2, null], 'その回の何人目かが合わない');
}

// ①'' **打席が終わらなかった打席**（2026-11-20 監査）。サヨナラの暴投（`completed: false`）の
//      点を `last` だけ進めて落とし、スコアボードは「1x」なのにその回を開くと点が出なかった。
//      盗塁死（`runnerOnly`）のアウトも数えず、半回が「2死」で終わっていた
{
  const box = {
    home: 'H',
    away: 'A',
    teams: { A: [{ id: 1, name: '打者あ' }, { id: 2, name: '打者い' }], H: [{ id: 9, name: '打者う' }, { id: 8, name: '打者え' }] },
  };
  const s0 = { away: 0, home: 0 };
  const events = [
    // 9回表: 三振（振り逃げでアウト0）→ 盗塁死 → 凡退2つ
    { inning: 9, offense: 'A', batterId: 1, delta: { strikeouts: 1 }, outs: 0, scoreBefore: s0, scoreAfter: s0 },
    { inning: 9, offense: 'A', batterId: 2, runnerOnly: true, outs: 1, scoreBefore: s0 },
    { inning: 9, offense: 'A', batterId: 2, delta: {}, outs: 1, scoreBefore: s0, scoreAfter: s0 },
    { inning: 9, offense: 'A', batterId: 1, delta: {}, outs: 1, scoreBefore: s0, scoreAfter: s0 },
    // 9回裏: 安打 → 次の打席の途中に暴投でサヨナラ（打席は終わらない）
    { inning: 9, offense: 'H', batterId: 9, delta: { hits: 1 }, outs: 0, scoreBefore: s0, scoreAfter: s0 },
    { inning: 9, offense: 'H', batterId: 8, delta: {}, completed: false, outs: 0, scoreBefore: s0, scoreAfter: { away: 0, home: 1 } },
  ];
  const plays = inningPlaysOf(events, box, { awayScore: 0, homeScore: 1 });
  assert.deepEqual(
    plays['9b'],
    [[0, '安', 0, 0], [null, '走', 1, 0]],
    `サヨナラの暴投の点が無い: ${JSON.stringify(plays['9b'])}`,
  );
  assert.equal(inningRuns({ ...box, plays }, 9, 'bottom'), 1, 'サヨナラの回の点の合計が合わない');
  assert.deepEqual(
    plays['9t'].map((r) => r[1]),
    ['振', '刺', '凡', '凡'],
    `盗塁死の行が無い: ${JSON.stringify(plays['9t'])}`,
  );
  const top = inningPlays({ ...box, plays }, 9, 'top').rows;
  assert.deepEqual(top.map((r) => r.outs), [0, 1, 2, 3], 'アウトの数え方が試合のアウトと違う（振り逃げ・盗塁死）');
  assert.equal(top[1].order, null, '走者のアウトに打順が付いている');
  // 打席の途中に暴投で入った点は打者の点にしない（「三振 1点」と赤く出ていた）
  const mid = inningPlaysOf(
    [{ inning: 2, offense: 'A', batterId: 1, delta: { strikeouts: 1 }, outs: 1, scoreBefore: s0, resultScore: { away: 1, home: 0 }, scoreAfter: { away: 1, home: 0 } }],
    box,
    { awayScore: 1, homeScore: 0 },
  );
  assert.deepEqual(mid['2t'], [[null, '走', 1, 0], [0, '振', 0, 1]], `打席の途中の点が打者の点になっている: ${JSON.stringify(mid['2t'])}`);
  // 前からある試合（行が3要素）は記号から数える古い読み方
  const old = { ...box, plays: { '1t': [[0, '振', 0], [1, '併', 0]] } };
  assert.deepEqual(inningPlays(old, 1, 'top').rows.map((r) => r.outs), [1, 3], '古い試合のアウトが読めない');
}

let now = new Date('2026-10-28T00:00:00Z');
const league = quiet(() =>
  createLeague({ members: [{ userId: 'a' }], now: now.toISOString() }),
);
const resolve = () => {
  for (const m of league.members)
    quiet(() =>
      submitPhase(
        league,
        m.userId,
        { phaseId: league.phase.id, plan: defaultPhasePlan(league, m.teamName), ready: true },
        now.toISOString(),
      ),
    );
};
let days = 0;
const gamesOf = () => league.records?.seasons?.[league.season.year]?.games || {};
while (days < 80 && Object.keys(gamesOf()).length < 18) {
  if (league.status === 'waiting') {
    resolve();
    continue;
  }
  now = new Date(now.getTime() + 4 * 3600000);
  quiet(() => advanceLeagueDay(league, `plays:${days}`, now.toISOString()));
  days++;
}
const games = Object.values(gamesOf());
assert.ok(games.length >= 6, `前提: 試合が足りない（${games.length}試合）`);

let halves = 0;
let rows = 0;
let gaps = 0;
let threeOuts = 0;
let livePlays = 0;
let batterOnBase = 0;
for (const game of games) {
  assert.ok(hasInningPlays(game), `${game.gameId} に回ごとの攻撃が無い`);
  const ls = game.lineScore;
  assert.ok(Array.isArray(ls?.away), `${game.gameId} に回ごとの得点が無い（検査の前提）`);
  for (const [half, cells, team] of [
    ['top', ls.away, game.away],
    ['bottom', ls.home || [], game.home],
  ]) {
    cells.forEach((runs, i) => {
      const inning = i + 1;
      halves += 1;
      // ⚠ **半回の点の合計＝スコアボードのその回の数字**
      assert.equal(
        inningRuns(game, inning, half),
        Number(runs) || 0,
        `${game.gameId} ${inning}回${half === 'bottom' ? '裏' : '表'}: 打席の点の合計${inningRuns(
          game,
          inning,
          half,
        )}とスコアボードの${runs}が違う`,
      );
      const data = inningPlays(game, inning, half);
      assert.ok(data, `${inningKey(inning, half)} の並びが読めない`);
      assert.equal(data.team, team, '攻撃している球団が違う');
      // ⚠ 試合の最後の半回（サヨナラなど）のほかは3アウトで終わる（2026-11-20 監査:
      //    記号から数えて約7%の半回が「2死」で終わっていた）
      const lastHalf =
        half === 'bottom'
          ? i === cells.length - 1
          : i === cells.length - 1 && (ls.home || []).length < cells.length;
      if (!lastHalf && data.rows.length > 0) {
        assert.equal(
          data.rows.at(-1).outs,
          3,
          `${game.gameId} ${inningKey(inning, half)} が${data.rows.at(-1).outs}死で終わる: ${JSON.stringify(game.plays[inningKey(inning, half)])}`,
        );
        threeOuts += 1;
      }
      for (const row of data.rows) {
        rows += 1;
        assert.ok(PLAY_CODES.includes(row.code), `知らない記号: ${row.code}`);
        assert.ok(row.text && row.text !== row.code, `記号が文になっていない: ${row.code}`);
        assert.ok(row.outs <= 3, `アウトが3を超えた: ${row.outs}`);
        if (row.code === '刺') {
          // 打席の外の走者のアウト（盗塁死など）
          assert.equal(row.order, null, '走者のアウトに打順が付いている');
        } else if (row.code === '走') {
          gaps += 1;
          // 打席の外で入った点（暴投・盗塁など）。打者は付かない
          assert.equal(row.order, null, '打席の外の点に打順が付いている');
          assert.ok(row.runs > 0, '打席の外の点が0点');
        } else {
          // ⚠ 打者の名前が引けること（番号は `game.teams[攻撃側]` の並びの番号）
          assert.ok(row.name && row.name !== '（記録なし）', `打者の名前が引けない: ${JSON.stringify(row)}`);
        }
      }
      // 打席速報（新しい見た目の試作）の分: 打者の行は塁（打席の後）を持ち、前へ飛んだ打席は打球を持つ
      let halfOuts = 0;
      for (const raw of game.plays[inningKey(inning, half)] || []) {
        halfOuts += Number(raw[3]) || 0;
        if (raw[0] == null) continue;
        const [, code, , rowOuts, bases, pos, dir, dist, la] = raw;
        assert.ok(Number.isInteger(bases) && bases >= 0 && bases <= 7, `塁が無い: ${JSON.stringify(raw)}`);
        // ⚠ 塁は**その打席の後**（次の打席の途中の盗塁・暴投を混ぜない。2026-11-23 レビュー）。
        //    本塁打の後は走者なし、アウトの無い出塁の後は打者がその塁に居る（その打席で点が入っていなければ）
        if (code === '本') assert.equal(bases, 0, `本塁打の後に走者が残っている: ${JSON.stringify(raw)}`);
        const reached = { 安: 1, 四: 1, 死: 1, 二: 2, 三: 4 }[code];
        if (reached && !rowOuts && halfOuts < 3) {
          // ⚠ 点が入った打席は、打者が悪送球などで還っていることがある（三塁打＋失策で走者なし）
          assert.ok(bases & reached || raw[2] > 0, `出塁した打者が塁に居ない: ${game.gameId} ${inning}${half} ${JSON.stringify(raw)}`);
          batterOnBase += 1;
        }
        if (['本', '三', '二', '併'].includes(code)) {
          assert.equal(raw.length, 9, `打球が無い: ${JSON.stringify(raw)}`);
          assert.ok(pos >= 1 && pos <= 9 && Math.abs(dir) <= 45 && dist >= 0 && Number.isInteger(la), `打球の値が変: ${JSON.stringify(raw)}`);
          livePlays += 1;
        }
        if (['振', '四', '死'].includes(code)) assert.equal(raw.length, 5, `前へ飛ばない打席に打球がある: ${JSON.stringify(raw)}`);
      }
    });
  }
  // 打席速報の場面: 打席の数と最後の点が試合と合う
  const scenes = liveScenes(game);
  assert.equal(scenes.length, Object.values(game.plays).flat().length, '打席速報の場面の数が行の数と違う');
  assert.deepEqual(scenes.at(-1).score, { away: game.awayScore, home: game.homeScore }, `${game.gameId} 打席速報の最後の点が試合と違う`);
  for (const scene of scenes) assert.ok(scene.phrase && scene.situation, `実況の文が無い: ${JSON.stringify(scene)}`);
  assert.ok(hasLivePlays(game), `${game.gameId} が打席速報を出せない`);
  // ② 打席の数は妥当（9回で最低27打席。空の試合を通さない）
  const total = Object.values(game.plays).reduce((a, list) => a + list.length, 0);
  assert.ok(total >= 40, `${game.gameId} の打席が少なすぎる（${total}）`);
}

// ③ 古い試合（`plays` が無い）は押せない形になる
assert.equal(hasInningPlays({ plays: undefined }), false, '記録の無い試合を押せることにしている');
assert.equal(hasInningPlays({ plays: {} }), false, '空の記録を押せることにしている');
assert.equal(inningPlays({ plays: {} }, 1, 'top'), null, '無い回に中身を返している');

// ④ 箱の大きさ: 回ごとの攻撃を足しても1試合あたり数%まで（記録の置き場を圧迫しない）
{
  const game = games[0];
  const all = JSON.stringify(game).length;
  const added = JSON.stringify(game.plays).length;
  assert.ok(
    added / all <= 0.12,
    `回ごとの攻撃が重い: ${added}B / 箱${all}B（${((added / all) * 100).toFixed(1)}%）`,
  );
  console.log(
    `online-inning-plays-check PASS（${games.length}試合・${halves}半回・${rows}打席・打席の外の点${gaps}件・3アウトの半回${threeOuts}・打球つきの長打と併殺${livePlays}・出塁の後の塁${batterOnBase} / 1試合 ${added}B（箱の${((added / all) * 100).toFixed(1)}%））`,
  );
}
