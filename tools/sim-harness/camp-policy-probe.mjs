// キャンプの育成方針ごとに、4クールで「どこがどれくらい伸びるか」を測る。
//
// ⚠ 画面の目安（`src/online/shared.js` の `CAMP_POLICY_GUIDE`）はこの実測から
//    書いている。練習の式（`campTraining.js`・`trainingPolicy.js`）を変えたら
//    これを回して、目安の数字を書き直すこと。
//    node tools/sim-harness/camp-policy-probe.mjs [回数=6]
import {
  createLeague,
  submitPhase,
  loadLeagueWorld,
  runCampRound,
} from '../../server/leagueEngine.mjs';
import { TEAMS_DATA } from '../../src/teams-data.js';
import { withSeededRandom } from '../../src/game/rng.js';
import {
  abilitySnapshot,
  abilityGains,
  campGainLabel,
  relevantGains,
} from '../../src/online/campGains.js';
import { CAMP_DIRECTIONS, CAMP_PHASES } from '../../src/online/shared.js';

const RUNS = Number(process.argv[2] || 6);
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
const league = quiet(() => createLeague({ members: [{ userId: 'a' }], now: NOW }));
quiet(() =>
  submitPhase(
    league,
    'a',
    { phaseId: league.phase.id, plan: { packId: league.packs[0].id }, ready: true },
    NOW,
  ),
);
const base = structuredClone(league.game);
const team = league.members[0].teamName;
for (const direction of CAMP_DIRECTIONS)
  for (const phase of CAMP_PHASES) {
    const sum = { pitcher: {}, fielder: {} };
    const count = { pitcher: 0, fielder: 0 };
    for (let run = 0; run < RUNS; run++) {
      league.game = structuredClone(base);
      loadLeagueWorld(league);
      const before = new Map(
        TEAMS_DATA[team].players.map((p) => [p.id, abilitySnapshot(p)]),
      );
      withSeededRandom(1000 + run, () =>
        quiet(() => {
          for (let r = 0; r < 4; r++)
            runCampRound(league, team, { policy: { direction, phase } });
        }),
      );
      for (const p of TEAMS_DATA[team].players) {
        const group = p.position === 'pitcher' ? 'pitcher' : 'fielder';
        count[group]++;
        const diff = relevantGains(p, abilityGains(before.get(p.id), abilitySnapshot(p)));
        for (const [key, v] of Object.entries(diff))
          if (!key.startsWith('pitch.') && !key.startsWith('positionFitness.'))
            sum[group][key] = (sum[group][key] || 0) + v;
      }
    }
    const top = (group) =>
      Object.entries(sum[group])
        .map(([k, v]) => [k, v / count[group]])
        .filter(([, v]) => Math.abs(v) >= 0.5)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${campGainLabel(k)}${v > 0 ? '+' : ''}${v.toFixed(1)}`)
        .join(' ');
    console.log(`${direction}:${phase}\n  野手 ${top('fielder')}\n  投手 ${top('pitcher')}`);
  }
