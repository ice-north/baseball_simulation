// プロ野球への道（オンラインのNPBドラフト）の検査。
// ⚠ 先方要望（2026-11-16）: リーグ全体で年0〜5人、若さ・能力・成績で選ぶ。抜かれた球団には
//    チームメイトのプロ意識+5・経験+30試合分・球団史への記録。プロ入りはリーグ記録から見られる。
// ⚠ 先方要望（2026-11-19）: **指名は確率ではない**。「能力値がプロに達したから行われる」。
//    だから「達したのに抜かれない」ことがあってはいけない（②で見る）。厳しさを決めるのは
//    `PRO_DRAFT_THRESHOLD` だけで、人数の釣り合いも②で見る。
//   node tools/sim-harness/online-pro-draft-check.mjs
import { quiet } from './lib/quiet.mjs';
import assert from 'node:assert/strict';
import { createLeague, submitPhase, loadLeagueWorld } from '../../server/leagueEngine.mjs';
import { TEAMS_DATA } from '../../src/teams-data.js';
import {
  chooseProDraft,
  applyProDraft,
  proDraftCandidates,
  isProLevel,
  PRO_DRAFT_MAX,
  PRO_DRAFT_THRESHOLD,
  rankOf,
  rankLabel,
  TEAMMATE_DISCIPLINE,
  TEAMMATE_EXPERIENCE_GAMES,
} from '../../server/proDraft.mjs';
import { teamChronicle, teamMoves, chronicleView } from '../../server/chronicle.mjs';
import { draftRankText } from '../../src/online/chronicleText.js';
import { FULL_SEASON_EXPERIENCE } from '../../src/season/campTraining.js';
import { processSeasonEnd, checkNPBDraftEligibility } from '../../src/season/yearProgressionSystem.js';
import { qualifiedOuts } from '../../src/season/seasonManager.js';

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

// ① **確率ではない**（いしだ 2026-11-19「指名は能力値がプロに達したから行われるもの」）。
//    プロに達した線（`isProLevel`）の上下だけで決まる。
assert.equal(isProLevel(PRO_DRAFT_THRESHOLD - 1), false);
assert.equal(isProLevel(PRO_DRAFT_THRESHOLD), true);
assert.equal(isProLevel(PRO_DRAFT_THRESHOLD + 1000), true);

// ①' **若さと将来性も材料**（いしだ 2026-11-19「若さや将来性も判断の材料になります。
//    凄い30代では指名されません」）。①の線は**点**の線で、点（`checkNPBDraftEligibility`）には
//    年齢と成長力が入っている。実測（能力を振り切り・成長力1.3の野手）:
//    18歳434 / 22歳388 / 25歳342 / 29歳305 / **30歳0**。成長力は0.6→1.4で+20点。
{
  const league = make(11);
  const teams = teamsOf(league);
  const name = league.season.settings.teamNames[0];
  const base = teams[name].players.find((p) => p.position !== 'pitcher');
  /** 能力を振り切った選手（年齢と成長力だけ変える） */
  const star = (age, gp = 1.3) => {
    const p = structuredClone(base);
    Object.assign(p, { age, growthPotential: gp, fame: 0 });
    Object.assign(p.batting, { meet: 95, power: 95, eye: 95 });
    Object.assign(p.physical, { speed: 95, arm: 95 });
    p.fielding.defense = 95;
    return p;
  };
  const scoreOf = (p) => checkNPBDraftEligibility(p).totalScore;
  // ⚠ **凄い30代に点は付かない**。能力だけで越えられる形にしてはいけない
  for (const age of [30, 33, 38]) {
    assert.equal(scoreOf(star(age)), 0, `能力を振り切った${age}歳に点が付いている`);
    assert.equal(isProLevel(scoreOf(star(age))), false, `凄い${age}歳がプロに達している`);
  }
  // 同じ能力・同じ成長力なら、若いほど点が高い
  const byAge = [18, 22, 25, 29].map((a) => scoreOf(star(a)));
  for (let i = 1; i < byAge.length; i++)
    assert.ok(byAge[i] < byAge[i - 1], `若さが効いていない: ${byAge.map(Math.round).join(' → ')}`);
  // 将来性（成長力）も効く
  assert.ok(scoreOf(star(19, 1.4)) > scoreOf(star(19, 0.8)), '将来性（成長力）が効いていない');
  // 門は候補を作るところ（`proDraftCandidates`）でも閉じている（点の付け方を変えても漏れない）
  Object.assign(base, star(32), { id: base.id, name: base.name });
  const totalGames = league.season.settings.gamesPerSeason || league.season.schedule.length;
  const cand = quiet(() => proDraftCandidates(teams, new Set(), { totalGames }));
  assert.ok(!cand.some((c) => c.player.id === base.id), '凄い32歳が候補に入っている');
  assert.ok(
    !quiet(() => chooseProDraft(league, teams)).some((p) => p.player.id === base.id),
    '凄い32歳が指名された',
  );
}

// ② 人数と、**達した選手を飛ばさないこと**（初期セットの名簿、成績の加点なし）。
//    ⚠ 1リーグ1回だけ測る。確率を外したので、同じ名簿なら年を進めても同じ結果になり、
//      同じリーグを3年ぶん数えても標本は増えない
const counts = [];
const ranks = [];
const ages = [];
for (let seed = 1; seed <= 30; seed++) {
  const league = make(seed);
  const teams = teamsOf(league);
  const picks = quiet(() => chooseProDraft(league, teams));
  assert.ok(picks.length <= PRO_DRAFT_MAX, `${picks.length}人は多すぎる`);
  for (const p of picks) assert.ok((p.player.age || 0) < 30, '30歳以上は指名しない');
  counts.push(picks.length);
  for (const p of picks) ages.push(p.player.age || 0);
  for (const p of picks) ranks.push({ round: p.round, ikusei: !!p.ikusei });
  // ⚠ **達したのに抜かれない選手がいてはいけない**（枠が埋まったときだけ残る）。
  //    確率で決めていた頃は、越えていても9割が残っていた
  const able = quiet(() =>
    proDraftCandidates(teams, new Set(), {
      totalGames: league.season.settings.gamesPerSeason || league.season.schedule.length,
    }),
  ).filter((c) => isProLevel(c.score));
  assert.equal(
    picks.length,
    Math.min(able.length, PRO_DRAFT_MAX),
    `プロに達した${able.length}人のうち${picks.length}人しか指名されていない（確率で飛ばしている）`,
  );
  assert.deepEqual(
    picks.map((p) => p.player.id),
    able.slice(0, PRO_DRAFT_MAX).map((c) => c.player.id),
    '点の高い順に指名していない',
  );
}
const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
assert.ok(mean >= 0.5 && mean <= 2.0, `年平均${mean.toFixed(2)}人（0.5〜2.0人のはず）`);
// ⚠ **0名の年が必ずある**（いしだ 2026-11-19「最大5名程度。ただし現実的には厳しく、
//    0名の年もあるように」）。確率を外したので、ここを決めるのは `PRO_DRAFT_THRESHOLD`
//    **だけ**。上限（`PRO_DRAFT_MAX`）を上げても当たり年の人数が増えるだけで0名は減らない。
//    実測（80リーグ・しきい値278）: 0人31% / 1人39% / 2人20% / 3人8% / 4人1% / 5人1%
{
  const zero = counts.filter((n) => n === 0).length / counts.length;
  assert.ok(zero >= 0.15, `0名の年が少なすぎる: ${(zero * 100).toFixed(0)}%`);
  assert.ok(zero <= 0.6, `0名の年ばかり: ${(zero * 100).toFixed(0)}%`);
  // 当たり年（4人以上）はたまに。毎年ではない
  const many = counts.filter((n) => n >= 4).length / counts.length;
  assert.ok(many <= 0.15, `4人以上の年が多すぎる: ${(many * 100).toFixed(0)}%`);
}
// ②'' 抜かれるのは**若手**（いしだ 2026-11-19「若さや将来性も判断の材料」）。
//    実測（30リーグ・31人）: 19歳71% / 20歳13% / 21歳10% / 22歳6%。24歳以上は0人。
{
  const share = (f) => ages.filter(f).length / ages.length;
  assert.ok(share((a) => a <= 21) >= 0.6, `若手（21歳以下）の指名が少なすぎる: ${(share((a) => a <= 21) * 100).toFixed(0)}%`);
  assert.ok(share((a) => a >= 24) <= 0.2, `24歳以上の指名が多すぎる: ${(share((a) => a >= 24) * 100).toFixed(0)}%`);
}

// ②' 指名順位: **中位から育成指名が大半**（いしだ 2026-11-18「ドラフト順位が甘すぎます。
//    独立リーガーのドラフトは中位から育成指名が大半だと思います」）。
//    直す前の実測（40リーグ×3年・161人）は 1位32%・2位24%・3位24% と上位ばかりだった。
//    いまの実測（80リーグ・しきい値278・90人）は 上位9%・中位48%・育成43%。
{
  assert.ok(ranks.length >= 20, `前提: 指名が少なすぎて割合を見られない（${ranks.length}人）`);
  const share = (f) => ranks.filter(f).length / ranks.length;
  const top = share((r) => !r.ikusei && r.round <= 3);
  const mid = share((r) => !r.ikusei && r.round >= 4);
  const ikusei = share((r) => r.ikusei);
  // ⚠ 上位指名（1〜3位）は**たまに**。独立から1位で獲られるのは年に1人も出ない
  assert.ok(top <= 0.2, `上位指名（1〜3位）が多すぎる: ${(top * 100).toFixed(0)}%`);
  // ⚠ 中位（4位以下）＋育成で大半
  assert.ok(mid + ikusei >= 0.7, `中位〜育成が少なすぎる: ${((mid + ikusei) * 100).toFixed(0)}%`);
  // ⚠ 育成指名が**必ず混じる**（支配下だけだと「甘い」に戻る）
  assert.ok(ikusei >= 0.1, `育成指名が少なすぎる: ${(ikusei * 100).toFixed(0)}%`);
  assert.ok(ikusei <= 0.6, `育成指名ばかりになっている: ${(ikusei * 100).toFixed(0)}%`);
  // 順位の書き方（「4位」「育成2位」）。画面・アプリと同じ
  assert.equal(rankLabel({ round: 4 }), '4位');
  assert.equal(rankLabel({ round: 2, ikusei: true }), '育成2位');
  assert.equal(draftRankText({ round: 2, ikusei: true }), '育成2位', '画面の書き方がサーバーと違う');
  // 点が高いほど上位（同じ点なら同じ順位）
  assert.ok(rankOf(100).round < rankOf(40).round, '点が高いのに下位指名になっている');
  assert.ok(!rankOf(100).ikusei && rankOf(0).ikusei, 'しきい値ぎりぎりが支配下になっている');
}

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
  // ⚠ **指名した時点の能力の写し**（いしだ 2026-11-20「選手名をクリックすると、その選手の
  //    詳細能力が見られるように」）。抜かれた選手は名簿に居ないので、ここに無いと押せない
  {
    const kept = league.chronicle.proDrafted[0];
    assert.ok(kept.player, '指名の記録に能力の写しが無い');
    assert.equal(kept.player.name, star.name, '写しの名前が違う');
    assert.ok(kept.player.pitching || kept.player.batting, '写しに能力が入っていない');
    assert.ok(kept.player.positionFitness, '写しに守備適性が入っていない');
    // ⚠ 成績は入れない（記録の方に残っている。写しは能力だけ）
    assert.ok(!('seasonStats' in kept.player), '写しに成績まで入れている');
    // ⚠ ビューに載せるのは**その年の指名だけ**（1人約700B。古い年まで載せるとビューが太る）
    const view = chronicleView(league);
    assert.ok(view.proDrafted[0].player, 'ビューに今年の能力の写しが無い');
    league.chronicle.proDrafted.push({ ...kept, year: league.season.year - 1 });
    const older = chronicleView(league).proDrafted.find((r) => r.year === league.season.year - 1);
    assert.ok(older, '前提: 古い年の行が見つからない');
    assert.ok(!older.player, '古い年の能力の写しまでビューに載せている');
    league.chronicle.proDrafted.pop();
    // 球団史の読み込み（求められたときだけ）には残す
    assert.ok(teamChronicle(league, name).proDrafted[0].player, '球団史に能力の写しが無い');
    // ⚠ 写しを残すのは**新しい方から24件**まで（芯を膨らませない）
    league.chronicle.proDrafted = Array.from({ length: 30 }, (_, i) => ({
      ...kept,
      year: 1,
      name: `古い指名${i}`,
    }));
    const another = { ...star, id: star.id + 1, name: '次の指名' };
    teams[name].players.push(another);
    applyProDraft(league, teams, [{ teamName: name, player: another, score: 300, awards: [], round: 3, npbTeam: '中日ドラゴンズ' }], {
      gamesPerSeason: 120,
      remove: () => {},
    });
    const list = league.chronicle.proDrafted;
    assert.ok(list[23].player, '24件目の能力の写しが落ちている');
    assert.ok(!list[24].player, '25件目にも能力の写しが残っている');
    assert.equal(list[24].name, '古い指名23', '写しを落とすときに行まで消している');
  }
}

// ⑤ 指名の点に足すタイトルは、本物のタイトル（`processSeasonEnd`。`season.frozenAwards`）と
//    同じ規定で決める。⚠ 以前は固定の100打数・30アウト（＝10回）で、10回で防御率0.00の
//    中継ぎが「最優秀防御率1位」として加点され、指名の理由にも出ていた
{
  const league = make(5);
  const teams = teamsOf(league);
  const games = league.season.settings.gamesPerSeason || league.season.schedule.length;
  const minOuts = qualifiedOuts(games);
  assert.ok(minOuts > 30, `規定投球回が10回以下（${minOuts}アウト）では検査にならない`);
  // ⚠ **30歳未満から選ぶ**。指名の候補は30歳以上を外すので（`proDraftCandidates`）、
  //    30歳の投手を「防御率王」に仕立てると、加点を確かめる前に候補から消える。
  //    名簿の並びは選手の作り方を変えると動くので（出身の抽選を足したときに動いた）、
  //    並びに頼らず**条件で選ぶ**こと
  const pitchers = Object.values(teams).flatMap((t) =>
    t.players.filter((p) => p.position === 'pitcher' && (p.age || 0) < 30),
  );
  assert.ok(pitchers.length >= 3, '投手が足りない');
  for (const p of pitchers) {
    p.seasonStats.pitching = { ...p.seasonStats.pitching, inningsPitched: 0, earnedRuns: 0, wins: 0, strikeouts: 0, saves: 0 };
  }
  const [reliever, ace, other] = pitchers;
  // 中継ぎ: 10回で自責0（規定に届かない）
  Object.assign(reliever.seasonStats.pitching, { inningsPitched: 30, earnedRuns: 0 });
  // 規定に届いた先発2人（防御率 2.25 と 4.50）
  Object.assign(ace.seasonStats.pitching, { inningsPitched: minOuts, earnedRuns: Math.round(minOuts / 12) });
  Object.assign(other.seasonStats.pitching, { inningsPitched: minOuts, earnedRuns: Math.round(minOuts / 6) });
  const real = quiet(() => processSeasonEnd(league.season, TEAMS_DATA));
  assert.equal(real.eraChampion?.id, ace.id, '本物の防御率王が規定に届いた先発になっていない（検査の前提）');
  const awardsOf = (options) => (id) =>
    proDraftCandidates(teams, new Set(), options).find((c) => c.player.id === id)?.awards || [];
  // 前提: 試合数を渡さない従来の固定規定（一人用）では、この中継ぎが防御率1位になる
  assert.ok(awardsOf({})(reliever.id).includes('最優秀防御率1位'), '検査の前提（固定規定なら中継ぎが1位）が崩れた');
  const withRule = awardsOf({ totalGames: games });
  assert.ok(!withRule(reliever.id).some((a) => a.startsWith('最優秀防御率')), `10回の中継ぎに防御率の加点: ${withRule(reliever.id)}`);
  assert.ok(withRule(ace.id).includes('最優秀防御率1位'), `本物の防御率王に加点が無い: ${withRule(ace.id)}`);
}

console.log(`online-pro-draft-check PASS（年平均${mean.toFixed(2)}人・最大${Math.max(...counts)}人／ご褒美・球団史・リーグ記録）`);
