// アプリの選手成績の表の列（Tables.kt の BATTING_GROUPS・PITCHING_GROUPS。gen-tables.mjs が書き出す）と
// 能力で絞り込む条件（ABILITY_FILTERS）・段位・疲労の段・調子の顔が、Web 版と同じ値・同じ文字を出すかの期待値を書き出す。
//   node mobile/tools/expect-stats.mjs > mobile/shared/src/jvmTest/resources/stats-expected.json
// 答え合わせはアプリの StatsWebTest。
// ⚠ 列の並び・見出しは gen-tables.mjs が Web 版からそのまま書き出すので、ここで見るのは「値の引き方」。
//    とくに2つ以上の項目を組み合わせる列（Stats.kt の StatComputed）は Kotlin に式があるので、ここだけが頼り。
import { emitExpected } from './expected.mjs';
import fs from 'node:fs';
import { STAT_GROUPS, formatStat, overviewGroup, defaultSort } from '../../src/online/statsView.js';
import { ABILITY_FILTERS } from '../../src/online/tryoutPlan.js';
import { getAbilityRank, getFatigueTone } from '../../src/utils/constants.js';
import { CONDITION_ICONS } from '../../src/game/condition.js';

const view = JSON.parse(fs.readFileSync(new URL('../shared/src/jvmTest/resources/view-running.json', import.meta.url)));
const base = view.roster;
const batter = base.find((p) => p.position !== 'pitcher');
const pitcher = base.find((p) => p.position === 'pitcher');
// 実際の名簿（開幕3日目）に、名簿に出てこない形を足す
const edge = [
  // 受けた捕手（捕手の成績）
  {
    ...structuredClone(batter),
    id: -1,
    position: 'catcher',
    catcherStats: { outs: 271, era: 3.6125, readRate: 0.2083, starts: 10, k9: 7.05, bb9: 2.95, avg: 0.2467 },
  },
  // 四球0の投手（K/BB は ∞）・投球回0（WHIP は無い）
  {
    ...structuredClone(pitcher),
    id: -2,
    seasonStats: { ...pitcher.seasonStats, pitching: { ...pitcher.seasonStats.pitching, strikeouts: 5, walks: 0, inningsPitched: 0, hits: 2 } },
  },
  // 四球も三振も0（K/BB は無い）・調子が範囲外・疲労が負
  {
    ...structuredClone(pitcher),
    id: -3,
    condition: 7,
    fatigue: -4,
    seasonStats: { ...pitcher.seasonStats, pitching: { ...pitcher.seasonStats.pitching, strikeouts: 0, walks: 0 } },
  },
  // 指標の欠けた野手（長打率・OPS は無い）・機会より失策が多い（守備率は無い）
  {
    ...structuredClone(batter),
    id: -4,
    performance: { batting: { metrics: { avg: 0.25, obp: 0.31 } } },
    seasonStats: { ...batter.seasonStats, batting: { ...batter.seasonStats.batting, fieldingChances: 3, errors: 4 } },
  },
  // 何も無い選手
  { id: -5, name: '空', position: 'first' },
];
const players = [...base, ...edge];
const number = (v) => (v === Infinity ? 'Infinity' : v ?? null);
const ABILITY = ['ability', 'velocity', 'stamina'];
const columns = {};
for (const category of ['batting', 'pitching'])
  for (const group of STAT_GROUPS[category])
    for (const column of group.columns) {
      // ⚠ Web 版の調子・疲労の「ability」はアプリで「区分:項目」の id になる（gen-tables.mjs の kotlinColumnId）。
      //    同じ区分の中の位置で引けるよう、区分の id と並びの番号を鍵にする
      const key = `${category}/${group.id}/${group.columns.indexOf(column)}`;
      columns[key] = players.map((p) => {
        const value = column.get(p);
        // 能力の書式は Web 版が段位の字・アプリが数を出すので、文字は比べない
        return [number(value), ABILITY.includes(column.format) ? null : formatStat(column, value)];
      });
    }
const overview = Object.fromEntries(['batting', 'pitching'].map((c) => [c, overviewGroup(c).columns.map((col) => col.label)]));
const sortLabels = Object.fromEntries(['batting', 'pitching'].map((c) => [c, defaultSort(c).column.label]));
const filters = Object.fromEntries(ABILITY_FILTERS.map((d) => [d.key, players.map((p) => Number(d.get(p)) || 0)]));
const sweep = [];
for (let v = -10; v <= 210; v += 1) sweep.push(v); // アプリの段位は整数の能力値を受け取る
const ranks = sweep.map((v) => [getAbilityRank(v), getAbilityRank(v, true), getAbilityRank(v, false, true)].join(''));
const tones = [];
for (let f = -5; f <= 250; f += 1) tones.push({ '': 0, warn: 1, heavy: 2 }[getFatigueTone(f)]);
const icons = [-1, 0, 1, 2, 3, 4, 5].map((c) => CONDITION_ICONS[c] ?? '');
const text = JSON.stringify({ players, columns, overview, sortLabels, filters, sweep, ranks, tones, icons });
emitExpected(text, { script: 'expect-stats.mjs', file: 'stats-expected.json', also: 'アプリの Stats.kt の StatComputed も揃えること' });
