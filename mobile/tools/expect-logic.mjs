// アプリの共通部（Kotlin）に写した計算が Web 版と同じ答えを出すかの検査用に、期待値を書き出す。
//   node mobile/tools/expect-logic.mjs > mobile/shared/src/jvmTest/resources/logic-expected.json
import fs from 'node:fs';
import { resolveTraining, playerWish, describeMood, recommendedPolicy } from '../../src/season/trainingPolicy.js';
import { menuFitsPlayer, subMenuFitsPlayer } from '../../src/season/campTraining.js';
import { CAMP_MENUS, CAMP_SUB_MENUS } from '../../src/online/shared.js';

// CampPlanner.jsx の clampMenu / clampSub と同じ（JSX は node から読めないので写す）
const clampMenu = (key, player) =>
  CAMP_MENUS.includes(key) && menuFitsPlayer(key, player) ? key : player.position === 'pitcher' ? 'control' : 'batting';
const clampSub = (key, player) =>
  CAMP_SUB_MENUS.includes(key) && subMenuFitsPlayer(key, player) ? key : 'physique';
import {
  plannedPicks, weightedRanked, DEFAULT_WEIGHTS, addToPlan, benchFromPlan, moveInPlan, planSummary,
} from '../../src/online/tryoutPlan.js';

const view = JSON.parse(fs.readFileSync(new URL('../shared/src/jvmTest/resources/view-running.json', import.meta.url)));
const roster = view.roster;
const camp = {};
for (const direction of ['sharpen', 'balanced', 'patch'])
  for (const phase of ['physique', 'skill'])
    for (const p of roster) {
      const r = resolveTraining(p, direction, phase);
      camp[`${direction}:${phase}:${p.id}`] = [clampMenu(r.main, p), clampSub(r.sub, p), describeMood(p, direction, phase).tone];
    }
const wish = Object.fromEntries(roster.map((p) => [p.id, playerWish(p)]));
const recommended = Object.fromEntries(roster.map((p) => [p.id, recommendedPolicy(p)]));
// トライアウト: 名簿の後ろ12人を候補、残りを名簿として扱う
const candidates = roster.slice(12);
const have = roster.slice(0, 12);
const ranked = weightedRanked(candidates, DEFAULT_WEIGHTS, have);
const count = 6;
const picks = plannedPicks(ranked, candidates, count, have).map((p) => p.id);
const added = addToPlan(ranked, candidates, count, have, ranked.at(-1));
const benched = benchFromPlan(ranked, candidates, count, have, picks[0]);
const moved = moveInPlan(ranked, candidates, count, have, picks.at(-1), 0);
const summary = planSummary(ranked, candidates, count, have);
const text = JSON.stringify({ camp, wish, recommended, tryout: { ranked, picks, added, benched, moved, blocking: summary.blocking, warnings: summary.warnings } });
// --check: 書き出し済みの期待値が今の Web 版の答えと同じか（CI で、Web 版だけ直したときに気づく）
if (process.argv.includes('--check')) {
  const file = new URL('../shared/src/jvmTest/resources/logic-expected.json', import.meta.url);
  if (fs.readFileSync(file, 'utf8').trim() !== text) {
    console.error('logic-expected.json が古い。node mobile/tools/expect-logic.mjs > mobile/shared/src/jvmTest/resources/logic-expected.json で書き出し直し、アプリの共通部も揃えること');
    process.exit(1);
  }
} else console.log(text);
