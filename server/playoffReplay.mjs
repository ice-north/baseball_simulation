import {
  getPlayoffChampion,
  SEASON_PHASES,
} from '../src/season/seasonManager.js';
import { requireOnline } from '../src/online/shared.js';
export function schedulePlayoffReplay(season) {
  const finals = season.schedule.filter((g) => g.playoffRound === 'final');
  if (
    !finals.length ||
    getPlayoffChampion(season.schedule) ||
    finals.some((g) => !g.result)
  )
    return;
  const date = season.currentDate;
  requireOnline(
    date.month === 10 && date.day <= 20,
    'プレーオフの再試合で決着しませんでした。進行を停止して確認してください',
    409,
    'playoff',
  );
  // 引き分けで未決着なら翌日に再試合。追加しても2勝先取という条件を増やさない。
  const required = finals[0].seriesWinsRequired || Math.ceil(finals.length / 2);
  for (const game of finals) game.seriesWinsRequired = required;
  const first = finals[0];
  season.schedule.push({
    id: Math.max(...season.schedule.map((g) => g.id)) + 1,
    date: { ...date },
    home: first.home,
    away: first.away,
    result: null,
    phase: SEASON_PHASES.PLAYOFFS,
    playoffRound: 'final',
    seriesId: 'final',
    seriesGame: finals.length + 1,
    seriesWinsRequired: required,
  });
}
