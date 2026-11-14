#!/usr/bin/env node
// ============================================================
// 自動試合の継投と記録の整合（2026-11 全体レビューで見つかった不具合の再発防止）
//
// どれも試合結果の数字は自然に見えるのに、投手の起用と記録だけが壊れる種類で、
// 打率・防御率の帯を見る `season-check` では捕まらない。1試合ごとの決まりごとを確かめる。
//
//  - 9回の「クローザーを投入」は、クローザーが上がれるときだけ（以前は上がれないと打者ごとに
//    別の中継ぎを呼び続け、先発まで使い切った）
//  - 降板した投手（先発を含む）はもう一度マウンドに上がらない
//  - 1球も投げていない投手に勝ちが付かない（攻撃中に継投していた）
//  - 投手の失点の合計＝相手の得点（1死も取れずに降りた投手の失点が消えていた）
//  - DHへの代打は守備に就かない（本来の野手と守備位置が重なっていた）
//
// 使い方: node tools/sim-harness/sim-integrity-check.mjs
// ============================================================

import './lib/bootstrap.mjs';
import assert from 'node:assert/strict';
import { buildLeague, TEAMS_DATA } from './lib/league.mjs';
import { SRC } from './lib/bootstrap.mjs';

const { autoSimulateGame, recoverAllPitcherFatigue } = await import(SRC + '/game/autoSimulation.js');
const { LEAGUE_SETTINGS } = await import(SRC + '/teams-data.js');

const problems = {};
const note = (key, example) => {
  problems[key] = (problems[key] || 0) + 1;
  if (problems[key] === 1) console.log(`  例 ${key}:`, JSON.stringify(example).slice(0, 300));
};

let games = 0;
for (const useDH of [false, true]) {
  LEAGUE_SETTINGS.useDH = useDH;
  const names = buildLeague(8, 26, 1);
  for (let d = 0; d < 40; d++) {
    for (let i = 0; i < names.length; i += 2) {
      const home = names[(i + d) % names.length], away = names[(i + d + 1) % names.length];
      const before = {};
      for (const n of [home, away]) {
        for (const p of TEAMS_DATA[n].players) before[p.id] = p.seasonStats?.pitching?.runsAllowed || 0;
      }
      const r = autoSimulateGame(home, away, false, 4242 + games);
      games++;

      for (const ch of r.pitcherChanges || []) {
        if (ch.reason?.includes('クローザーを投入') && ch.role !== 'クローザー') note('クローザーが上がれないのにクローザーの継投', ch);
      }
      for (const side of ['home', 'away']) {
        const ids = (r.decisionLog?.appearances?.[side] || []).map(a => a.id);
        if (new Set(ids).size !== ids.length) note('降板した投手の再登板', { side, ids });
      }
      const win = r.decisions?.winningPitcher;
      if (win && (win.gameStats?.pitching?.pitches || 0) === 0) note('1球も投げていない投手に勝ち', win.name);

      // 投手の失点（シーズン成績に入ったぶん）の合計＝相手の得点
      for (const [team, oppScore] of [[home, r.awayScore], [away, r.homeScore]]) {
        const ra = TEAMS_DATA[team].players
          .reduce((sum, p) => sum + (p.seasonStats?.pitching?.runsAllowed || 0) - before[p.id], 0);
        if (ra !== oppScore) note('投手の失点の合計が相手の得点と合わない', { team, ra, oppScore });
      }

      if (useDH) {
        for (const t of [r.homeTeam, r.awayTeam]) {
          const fielders = t.players.filter(p => p.battingOrder > 0 && !p._isDH && p.position !== 'pitcher');
          const positions = fielders.map(p => p.position);
          const dhCount = t.players.filter(p => p.battingOrder > 0 && p._isDH).length;
          if (!r.walkOff && dhCount === 1 && new Set(positions).size !== positions.length) {
            note('DH制で守備位置が重なった', positions);
          }
        }
      }
    }
    recoverAllPitcherFatigue();
  }
}
LEAGUE_SETTINGS.useDH = false;

assert.deepEqual(problems, {}, `自動試合の継投・記録に不整合がある（${games}試合）: ${JSON.stringify(problems)}`);
console.log(`■ 自動試合の継投と記録: OK（${games}試合 / 守護神の空振り継投なし / 再登板なし / 0球の勝ちなし / 失点の合計一致 / DH代打は守備に就かない）`);
