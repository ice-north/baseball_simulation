import assert from 'node:assert/strict';
import {
  createLeague,
  defaultPhasePlan,
  submitPhase,
  advanceLeagueDay,
  loadLeagueWorld,
} from '../../server/leagueEngine.mjs';
import { captureWorld } from '../../server/worldSnapshot.mjs';
import { gzipSync } from 'node:zlib';
import { nextProgressionAt } from '../../src/online/shared.js';
import { projectPlayerInfo } from '../../server/projection.mjs';
import {
  SEASON_TURNS,
  gamesPerTeam,
  topTierTeamNames,
} from '../../src/online/pyramidLeague.js';

// 1ターン＝45分（1日32枠）。⚠ 境界は「その時刻ちょうど」を含めず、次の枠へ送る。
// 07:30 JST ちょうど → 08:15 JST
assert.equal(
  nextProgressionAt('2026-10-27T22:30:00Z'),
  '2026-10-27T23:15:00.000Z',
);
// ⚠ その日の最後の枠（23:15 JST）ちょうどなら、翌日の最初の枠（00:00 JST）へ送る
assert.equal(
  nextProgressionAt('2026-10-28T14:15:00Z'),
  '2026-10-28T15:00:00.000Z',
);
// 1秒前なら同じ日の枠に入る
assert.equal(
  nextProgressionAt('2026-10-28T14:14:59Z'),
  '2026-10-28T14:15:00.000Z',
);
let now = new Date('2026-10-28T00:00:00Z');
const league = createLeague({
  members: [{ userId: 'a' }, { userId: 'b' }],
  now: now.toISOString(),
});
const seen = [];
function resolve() {
  const phase = league.phase;
  seen.push(phase.kind);
  const defaults = league.members.map((m) =>
    defaultPhasePlan(league, m.teamName),
  );
  assert.deepEqual(
    defaults[0],
    defaultPhasePlan(league, league.members[0].teamName),
    '標準案は再読込しても同じ',
  );
  for (const [i, member] of league.members.entries()) {
    submitPhase(
      league,
      member.userId,
      { phaseId: phase.id, plan: defaults[i], ready: true },
      now.toISOString(),
    );
    if (i === 0)
      assert.equal(league.status, 'waiting', '一人の決定では進めない');
  }
}
resolve();
resolve();
assert.equal(league.status, 'running');
const game = structuredClone(league.game);
loadLeagueWorld(league);
assert.deepEqual(
  captureWorld(),
  game,
  '未完了の背景大会も含めて完全に復元する',
);
/**
 * その時点の疲労と、打球の出方。
 *
 * ⚠ **`league.game` から読む**（進行のたびに写しが入る）。`TEAMS_DATA` を
 *    直に見ると、`loadLeagueWorld` を呼んでいない間は古い世界を見てしまう。
 * ⚠ **レギュラーだけを見る**。控えは出ないので疲れない。全野手の平均では、
 *    出ずっぱりの選手が壊れていても埋もれる（実測で、平均が13でも
 *    中堅手1人が497まで積み上がっていた）。
 */
function fatigueSnapshot(league) {
  const teams = league.season.settings.teamNames.map(
    (n) => league.game.teams[n],
  );
  const fielders = teams.flatMap((t) =>
    t.players.filter((p) => p.position !== 'pitcher'),
  );
  const played = (p) => p.seasonStats?.batting?.games || 0;
  const games = Math.max(0, ...fielders.map(played));
  const regulars = fielders.filter((p) => played(p) >= games * 0.7);
  let hr = 0;
  let outs = 0;
  for (const t of teams)
    for (const p of t.players) {
      hr += p.seasonStats?.batting?.homeruns || 0;
      outs += p.seasonStats?.pitching?.inningsPitched || 0;
    }
  return {
    games,
    mean: regulars.length
      ? regulars.reduce((a, p) => a + (p.fatigue || 0), 0) / regulars.length
      : 0,
    max: Math.max(0, ...fielders.map((p) => p.fatigue || 0)),
    hrRate: outs ? hr / (outs / 27) : 0,
  };
}

const startYear = league.season.year;
const firstTopTier = topTierTeamNames(league.teams);
let days = 0;
let slimChecked = 0;
let early = null;
let late = null;
while (league.season.year === startYear && days < 300) {
  if (league.status === 'waiting') resolve();
  else {
    now = new Date(now.getTime() + 4 * 3600000);
    advanceLeagueDay(league, `acceptance:${days}`, now.toISOString());
    days++;
    // ⚠ 保存する試合結果に両球団の名簿の写しを残さない。1試合約100KBが
    //    2か所に入り、1シーズンで保存が約190MBに膨らんでいた
    if (league.season.results.length) {
      const last = league.season.results.at(-1);
      const inSchedule = league.season.schedule.find((g) => g.id === last.gameId);
      assert.ok(
        !last.result?.homeTeam && !inSchedule?.result?.homeTeam,
        '試合結果に球団の写しが残っている',
      );
      assert.ok(
        last.result && Number.isFinite(last.result.homeScore),
        '軽くしたあとも点数は残る',
      );
      slimChecked++;
    }
    // ⚠ **序盤と終盤の2点で測る**。1点だけだと「最初から重い」のか
    //    「積み上がっている」のか区別できない
    if (days === 40) early = fatigueSnapshot(league);
    if (days === 140) late = fatigueSnapshot(league);
    if (days % 40 === 0) {
      const s = fatigueSnapshot(league);
      console.log(
        `online-engine: ${days}日 / ${JSON.stringify(league.season.currentDate)}` +
          ` / 疲労 ${s.mean.toFixed(1)}（最大 ${s.max}） / 本塁打率 ${s.hrRate.toFixed(3)}`,
      );
    }
  }
}
assert.equal(league.season.year, 2, '実試合を消化して2年目に到達する');
assert.equal(league.history.length, 1);
assert.ok(league.history[0].playoffChampion, 'プレーオフの勝者が確定する');
assert.ok(
  league.notices.some((n) => n.type === 'draft' && n.picks.length > 0),
  'NPBドラフトを実行する',
);
assert.ok(
  league.notices
    .find((n) => n.type === 'draft')
    .picks.every((p) => p.name && p.playerId != null && p.npbTeam && p.round),
  'ドラフトのお知らせに選手名・ID・指名先を残す',
);
// ⚠ 開幕前は**初期メンバー選択**（`pack_select`）。初期編成（360人の希望
//    リスト）から置き換えた。ここは `check` の束に入っていない別枠の検査なので、
//    フェーズを変えたときに取り残された（`check:online:season` を回すこと）。
assert.deepEqual(seen, [
  'pack_select',
  'camp',
  'contract',
  'tryout',
  'offseason',
]);
// ⚠ **定数から導くこと**。75 が直に書かれており、1シーズン144ターンへ
//    変えたときに取り残された。試合数を変えるたびに直すのでは忘れる。
// ⚠ ターン数ではなく**試合数**と比べる。休養日（6ターンに1回）を入れたので
//    120ターンで100試合。ターン数と比べていて、この検査はずっと落ちていた
assert.ok(
  league.history[0].standings.every((s) => s.gamesPlayed === gamesPerTeam()),
  `全球団が${gamesPerTeam()}試合しているはず`,
);
// ⚠ **プレーオフは1部の球団だけ**。順位表は全12球団を通した並びなので、
//    絞らないと2部の首位が出て優勝していた（実測で起きた）
assert.ok(
  firstTopTier.includes(league.history[0].playoffChampion),
  `1部でない球団が優勝した: ${league.history[0].playoffChampion}`,
);
// 昇降格のお知らせが積まれる（リーグ便りが読む形であること）
const promotion = league.notices.find((n) => n.type === 'promotion');
assert.ok(promotion?.moves?.length > 0, '昇降格のお知らせが無い');
// ⚠ **シーズン後の空き日はまとめて進む**。1日ずつだと1年に約240ターンかかり、
//    週の割り当て（月〜金＝シーズン、土日＝手続き）が成り立たなかった。
//    レギュラーシーズン120ターン＋プレーオフ数ターン＋まとめ進めの数ターン
assert.ok(
  days <= SEASON_TURNS + 20,
  `1年の進行に${days}ターンかかった（シーズン後の空き日がまとまっていない）`,
);
assert.ok(slimChecked > 0, '試合結果の軽量化を一度も確かめていない');

// --- 疲労がシーズンを通して平らか ------------------------------------
// ⚠ **ここは通年でしか捕まらない**。`online-parity-check` は18ターン（15試合）
//    しか回さないので、序盤の疲労38は許容の内側に入り、壊れていることが
//    見えなかった。実測で、40ターンを過ぎたあたりから積み上がり始める。
// ⚠ 休養の間隔（`REST_EVERY`）と、疲れた野手の入れ替え
//    （`restTiredFielders` を全球団に当てること）の**両方**が要る。実測:
//      5試合→1休・入れ替え無し  終盤190（最大829）本塁打率 0.58→0.28
//      3試合→1休・入れ替え無し  終盤 66（最大877）本塁打率 0.63→0.51
//      5試合→1休・入れ替えあり  終盤 60（最大220）本塁打率 0.60→0.42
//      3試合→1休・入れ替えあり  終盤 15（最大 80）本塁打率 0.58→0.58
//    この検査での実測は 序盤 12.3（最大73）→ 終盤 14.2（最大68）。
assert.ok(early && late, '疲労を序盤と終盤で測れていない');
assert.ok(
  late.games > early.games + 30,
  `序盤と終盤で試合数が離れていない（${early.games} / ${late.games}）`,
);
// 許容 +20: 平らなら +2 程度。上の4通りのうち壊れている3つはすべて +40 を超える
assert.ok(
  late.mean <= early.mean + 20,
  `レギュラーの疲労が積み上がっている: ${early.mean.toFixed(1)} → ${late.mean.toFixed(1)}`,
);
// ⚠ **最大も見ること**。平均が平らでも、出ずっぱりの1人だけが壊れる
//    （実測で、平均13のまま中堅手1人が497まで積み上がっていた）。
//    上限は `FIELDER_REST_FATIGUE`（80）＋1試合ぶん＋死球の余裕
assert.ok(
  late.max <= 140,
  `一度も休めていない野手がいる: 最大疲労 ${late.max}`,
);
// 疲れた打者は打てない。本塁打率は疲労にいちばん敏感な指標
assert.ok(
  late.hrRate >= early.hrRate * 0.85,
  `終盤に打てなくなっている: 本塁打率 ${early.hrRate.toFixed(3)} → ${late.hrRate.toFixed(3)}`,
);
const recordedYear = league.records.seasons[1];
assert.ok(recordedYear.comparison, '年度・リーグの比較値を確定して残す');
assert.ok(
  recordedYear.archiveToken,
  '確定年度の派生データを安全に再利用できる',
);
assert.ok(
  recordedYear.grandChampionshipExcluded,
  'グランドCSの対象外を記録する',
);
assert.ok(
  Object.keys(recordedYear.games).length >= 150,
  '公式150試合とプレーオフのボックス成績を保持',
);
for (const r of Object.values(recordedYear.players)) {
  assert.equal(
    r.splits.pitching.all?.outs || 0,
    r.stats.pitching.inningsPitched,
    '年間の走者アウトも投球回へ一致',
  );
  assert.equal(r.splits.batting.all?.pa || 0, r.stats.batting.plateAppearances);
}
resolve();
assert.equal(league.status, 'running');
assert.deepEqual(league.season.currentDate, { year: 2025, month: 4, day: 1 });
assert.ok(league.season.standings.every((s) => s.gamesPlayed === 0));
for (const name of league.season.settings.teamNames) {
  const team = league.game.teams[name];
  assert.ok(team.players.length >= 9);
  assert.ok(
    team.players.every(
      (p) =>
        !(p.seasonStats?.batting?.games > 0) &&
        !(p.seasonStats?.pitching?.gamesStarted > 0),
    ),
    '自リーグへ架空の次年度成績を注入しない',
  );
}
const member = league.members[0],
  retained = league.game.teams[member.teamName].players.find(
    (p) => recordedYear.players[p.onlinePlayerId],
  );
assert.ok(retained, '過年度の実記録を持つ選手が残る');
const periods = projectPlayerInfo(
  { league },
  member.userId,
  retained.id,
).periods;
const annual = periods.find((p) => p.id === 'online:1'),
  career = periods.find((p) => p.id === 'career');
assert.ok(annual && career, '次年度でも年度別と対人通算を取得');
assert.match(annual.source, /グランドCS除外/);
assert.ok(
  periods.some((p) => p.id === 'legacy:1'),
  'グランドCS込みの既存年度成績も選択できる',
);
assert.equal(
  career.seasonStats.batting.hitByPitch,
  annual.seasonStats.batting.hitByPitch,
  '死球の通算引継ぎ',
);
assert.equal(
  career.seasonStats.batting.caughtStealing,
  annual.seasonStats.batting.caughtStealing,
  '盗塁死の通算引継ぎ',
);
assert.equal(
  career.seasonStats.batting.sacrificeBunts,
  annual.seasonStats.batting.sacrificeBunts,
  '犠打の通算引継ぎ',
);
console.log(
  `online-engine-check PASS (${days}日・2年目開幕` +
    ` / 疲労 ${early.mean.toFixed(1)}→${late.mean.toFixed(1)}（最大 ${late.max}）` +
    ` / 本塁打率 ${early.hrRate.toFixed(3)}→${late.hrRate.toFixed(3)}）`,
);

console.log(
  `snapshot gzip ${(gzipSync(JSON.stringify(league)).length / 1024 / 1024).toFixed(2)} MiB`,
);
