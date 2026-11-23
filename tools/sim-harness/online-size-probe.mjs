// オンラインの保存とビューの大きさを測る（データ管理の監査用）。
// 2人のリーグを年をまたいで進め、各時点で 芯（core）・記録（records）・世界（world）と、
// 記録の年ごとの内訳（試合・選手）、全体のビュー・球団の情報の大きさを出す。
//   node tools/sim-harness/online-size-probe.mjs [年数=1]
// ⚠ 記録（records）は軽い読みでも毎回読むので、年ごとにどれだけ増えるかが保存の速さに効く
import { quiet } from './lib/quiet.mjs';
import { createLeague, defaultPhasePlan, submitPhase, advanceLeagueDay } from '../../server/leagueEngine.mjs';
import { touchPresence } from '../../server/social.mjs';
import { projectLeague, projectTeamInfo } from '../../server/projection.mjs';
import { splitBundle } from '../../server/storage/snapshotParts.mjs';
import { buildArchiveIndex } from '../../server/archiveIndex.mjs';
import { gzipSync } from 'node:zlib';

const YEARS = Number(process.argv[2] || 1);
const kb = (v) => `${Math.round(Buffer.byteLength(JSON.stringify(v ?? null)) / 1024)}KB`;
/** 保存・転送の大きさ（gzip。保存は gzip で置く） */
const gz = (v) => `${Math.round(gzipSync(JSON.stringify(v ?? null)).length / 1024)}KB`;
let now = new Date('2026-10-28T00:00:00Z');
const league = quiet(() => createLeague({ members: [{ userId: 'a' }, { userId: 'b' }], now: now.toISOString() }));
const bundle = () => ({ league, sessions: {} });
const startYear = league.season.year;
const report = (label) => {
  const { core, parts } = splitBundle(bundle());
  console.log(`\n[${label}] ${league.season.year}年 ${league.season.currentDate?.month}月${league.season.currentDate?.day}日`);
  console.log(`  芯 ${kb(core)}（gzip ${gz(core)}） / 記録 ${kb(parts.records)}（gzip ${gz(parts.records)}） / 世界 ${kb(parts.world)}（gzip ${gz(parts.world)}）`);
  const lg = core.league;
  console.log(
    `  芯の内訳: 球団12 ${kb(lg.game?.teams)} / 日程 ${kb(lg.season?.schedule)} / 結果 ${kb(lg.season?.results)} / 年代記 ${kb(lg.chronicle)} / 取引 ${kb(lg.transactions)} / お知らせ ${kb(lg.notices)} / 履歴 ${kb(lg.history)} / 指導者 ${kb(lg.coaches)}`,
  );
  for (const [year, s] of Object.entries(parts.records?.seasons || {}))
    console.log(`  記録 ${year}年: 試合 ${kb(s.games)}（${Object.keys(s.games || {}).length}試合） / 選手 ${kb(s.players)}（${Object.keys(s.players || {}).length}人）`);
  const view = quiet(() => projectLeague(bundle(), 'a', null, null));
  console.log(`  ビュー ${kb(view)}（gzip ${gz(view)}。通算ランキング ${kb(view.careerLeaders)} / 成績ランキング ${kb(view.leaders)} / 能力ランキング ${kb(view.abilityLeaders)}）`);
  const team = quiet(() => projectTeamInfo(bundle(), 'a', league.members[0].teamName));
  console.log(`  球団の情報 ${kb(team)}（名簿 ${kb(team.roster)} / 球団史 ${kb(team.chronicle)} / 退団者の通算 ${kb(team.formerCareers)}）`);
  const archive = quiet(() => buildArchiveIndex(bundle()));
  console.log(`  索引: 選手 ${kb(archive.players)} / 球団 ${kb(archive.teams)} / 試合 ${Object.entries(archive.games).map(([y, g]) => `${y}年 ${kb(g)}`).join(' ')}`);
};
report('開始');
let days = 0;
let reportedSeason = startYear;
while (days < 1200) {
  if (league.status === 'waiting') {
    for (const m of league.members)
      quiet(() =>
        submitPhase(
          league,
          m.userId,
          { phaseId: league.phase.id, plan: defaultPhasePlan(league, m.teamName), ready: true },
          now.toISOString(),
        ),
      );
    continue;
  }
  if (league.season.year >= startYear + YEARS && league.season.results.length >= 20) break;
  now = new Date(now.getTime() + 4 * 3600000);
  for (const m of league.members) touchPresence(league, m.userId, now.toISOString());
  quiet(() => advanceLeagueDay(league, `size:${days}`, now.toISOString()));
  days++;
  if (league.season.year !== reportedSeason) {
    report(`${reportedSeason}年を終えて`);
    reportedSeason = league.season.year;
  }
}
report('終わり');
