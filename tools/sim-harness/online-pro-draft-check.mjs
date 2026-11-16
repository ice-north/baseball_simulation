// プロ野球への道（オンラインのNPBドラフト）の検査。
// ⚠ 先方要望（2026-11-16）: リーグ全体で年0〜3人、若さ・能力・成績で選ぶ。抜かれた球団には
//    チームメイトのプロ意識+5・経験+30試合分・球団史への記録。プロ入りはリーグ記録から見られる。
//   node tools/sim-harness/online-pro-draft-check.mjs
import assert from 'node:assert/strict';
import { createLeague, submitPhase, loadLeagueWorld } from '../../server/leagueEngine.mjs';
import { TEAMS_DATA } from '../../src/teams-data.js';
import {
  chooseProDraft,
  applyProDraft,
  proDraftChance,
  PRO_DRAFT_MAX,
  PRO_DRAFT_THRESHOLD,
  TEAMMATE_DISCIPLINE,
  TEAMMATE_EXPERIENCE_GAMES,
} from '../../server/proDraft.mjs';
import { teamChronicle, teamMoves, chronicleView } from '../../server/chronicle.mjs';
import { FULL_SEASON_EXPERIENCE } from '../../src/season/campTraining.js';

const quiet = (fn) => {
  const log = console.log;
  console.log = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
  }
};
const NOW = '2026-10-26T15:00:00.000Z';
const make = (seed) => {
  const league = quiet(() => createLeague({ members: [{ userId: 'a' }], now: NOW, seed }));
  quiet(() =>
    submitPhase(league, 'a', { phaseId: league.phase.id, plan: { packId: league.packs[0].id }, ready: true }, NOW),
  );
  loadLeagueWorld(league);
  return league;
};
const teamsOf = (league) =>
  Object.fromEntries(league.season.settings.teamNames.map((n) => [n, TEAMS_DATA[n]]));

// ① 確率: しきい値の下は0、上がるほど増え、上限で止まる
assert.equal(proDraftChance(PRO_DRAFT_THRESHOLD - 1), 0);
assert.ok(proDraftChance(PRO_DRAFT_THRESHOLD) > 0);
assert.ok(proDraftChance(PRO_DRAFT_THRESHOLD + 10) > proDraftChance(PRO_DRAFT_THRESHOLD));
assert.ok(proDraftChance(PRO_DRAFT_THRESHOLD + 1000) <= 0.8);

// ② 人数: どの年も3人まで、平均は年0.5〜2.5人（初期セットの名簿、成績の加点なし）
const counts = [];
for (let seed = 1; seed <= 12; seed++) {
  const league = make(seed);
  const teams = teamsOf(league);
  for (let y = 0; y < 3; y++) {
    league.season.year += 1;
    const picks = quiet(() => chooseProDraft(league, teams));
    assert.ok(picks.length <= PRO_DRAFT_MAX, `${picks.length}人は多すぎる`);
    for (const p of picks) assert.ok((p.player.age || 0) < 30, '30歳以上は指名しない');
    counts.push(picks.length);
  }
}
const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
assert.ok(mean >= 0.5 && mean <= 2.5, `年平均${mean.toFixed(2)}人（0.5〜2.5人のはず）`);

// ③ 同じ種・同じ年なら同じ指名（乱数を引かない）
{
  const a = make(7);
  const b = make(7);
  const ids = (l) => quiet(() => chooseProDraft(l, teamsOf(l))).map((p) => p.player.id);
  assert.deepEqual(ids(a), ids(b));
}

// ④ 当てる: 名簿から外れ、チームメイトにご褒美、球団史・入退団履歴・リーグ記録・リーグ便りに残る
{
  const league = make(3);
  const teams = teamsOf(league);
  const name = league.season.settings.teamNames[0];
  const star = teams[name].players[0];
  // 必ず指名される選手にする（若く、能力が高い）
  star.age = 19;
  for (const k of ['meet', 'power', 'eye']) if (star.batting) star.batting[k] = 95;
  if (star.pitching) Object.assign(star.pitching, { velocity: 158, control: 95, stamina: 180 });
  if (star.physical) Object.assign(star.physical, { speed: 95, arm: 95 });
  if (star.fielding) star.fielding.defense = 95;
  star.growthPotential = 1.6;
  const picks = quiet(() => chooseProDraft(league, teams));
  const pick = picks.find((p) => p.player.id === star.id) || null;
  const forced = pick || { teamName: name, player: star, score: PRO_DRAFT_THRESHOLD + 50, awards: [], round: 1, npbTeam: '読売ジャイアンツ' };
  const mates = teams[name].players.filter((p) => p.id !== star.id);
  const before = new Map(mates.map((p) => [p.id, { d: p.personality?.discipline ?? 50, e: p.experience || 0 }]));
  const removed = [];
  const rows = applyProDraft(league, teams, [forced], {
    gamesPerSeason: 120,
    remove: (team, player) => {
      removed.push(player.id);
      TEAMS_DATA[team].players = TEAMS_DATA[team].players.filter((p) => p.id !== player.id);
    },
  });
  assert.equal(rows.length, 1);
  assert.deepEqual(removed, [star.id]);
  assert.ok(!TEAMS_DATA[name].players.some((p) => p.id === star.id), '名簿に残っている');
  const exp = Math.round((TEAMMATE_EXPERIENCE_GAMES * FULL_SEASON_EXPERIENCE) / 120);
  for (const p of TEAMS_DATA[name].players) {
    const b = before.get(p.id);
    assert.equal(p.personality.discipline, Math.min(100, b.d + TEAMMATE_DISCIPLINE), 'プロ意識が+5になっていない');
    assert.equal(p.experience, b.e + exp, '経験が30試合分増えていない');
  }
  assert.equal(league.chronicle.proDrafted[0].name, star.name);
  assert.equal(league.notices[0].type, 'draft');
  assert.equal(league.notices[0].picks[0].team, name);
  assert.equal(teamChronicle(league, name).proDrafted[0].name, star.name, '球団史に無い');
  assert.ok(teamMoves(league, name).some((m) => m.how === 'プロ入り' && m.name === star.name), '入退団履歴に無い');
  assert.equal(chronicleView(league).proDrafted[0].name, star.name, 'リーグ記録に無い');
  assert.ok(!('key' in chronicleView(league).proDrafted[0]), '記録の鍵をビューに出している');
}

console.log(`online-pro-draft-check PASS（年平均${mean.toFixed(2)}人・最大${Math.max(...counts)}人／ご褒美・球団史・リーグ記録）`);
