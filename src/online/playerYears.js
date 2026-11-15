// ============================================================
// 選手の「年ごとの推移」（年・年齢・所属・成績・能力）の表の中身。画面は `PlayerYears.jsx`。
//
// ⚠ 先方指摘「選手をクリックした際の詳細に、年齢ごとの能力と成績、所属球団を表示。
//    どれだけ成長したか、どれだけの成績を残したか確認できるように」。
// ⚠ 能力・年齢・所属はサーバーの `playerYears`（server/recordedViews.mjs）、成績は**同じ年の期間**
//    （`periods` の current / online:年 / legacy:年）から取る。成績の式を書き写さない
//    （`statsView.js` の列をそのまま使う）。
// ⚠ 投手は投球の能力と投手成績、野手は打撃・守備の能力と打撃成績（二刀流は両方）。
// ⚠ 前の年から伸びた能力は `diff` に差を入れる（画面が上がりを緑・下がりを赤で出す）。
// ============================================================
import { statGroup } from './statsView.js';

const column = (category, group, id) => statGroup(category, group).columns.find((c) => c.id === id);

export const YEAR_BATTING_ABILITIES = [
  ['meet', 'ミ'],
  ['power', 'パ'],
  ['eye', '眼'],
  ['speed', '走'],
  ['arm', '肩'],
  ['defense', '守'],
];
export const YEAR_PITCHING_ABILITIES = [
  ['velocity', '速'],
  ['control', '制'],
  ['stamina', 'ス'],
];
export const YEAR_BATTING_STATS = [
  ['batting', 'appearances', 'games'],
  ['batting', 'basic', 'avg'],
  ['batting', 'basic', 'homeruns'],
  ['batting', 'basic', 'rbis'],
];
export const YEAR_PITCHING_STATS = [
  ['pitching', 'record', 'games'],
  ['pitching', 'basic', 'era'],
  ['pitching', 'record', 'wins'],
  ['pitching', 'record', 'losses'],
  ['pitching', 'record', 'saves'],
];

/** その年の期間（今季は current、過去は対人の記録を優先し、無ければ参考の成績） */
export function periodForYear(periods, year, current) {
  const list = periods || [];
  if (year === current) return list.find((p) => p.id === 'current') || null;
  return (
    list.find((p) => p.id === `online:${year}`) ||
    list.find((p) => p.id === `legacy:${year}`) ||
    null
  );
}

/**
 * 表の列と行。`years` は新しい年から（サーバーの並び）。
 * 戻り値: { abilities:[[key,label]], stats:[{key,label,column}], rows:[{year, age, teams, abilities:{key:{value,diff}}, stats:{key:value}}] }
 */
export function playerYearTable(player, years, periods, currentYear) {
  const pitcher = player?.position === 'pitcher';
  const two = !!player?.isTwoWay;
  const lead = player?.position === 'catcher' ? [['lead', 'リ']] : [];
  const abilities = [
    ...(pitcher && !two ? [] : [...YEAR_BATTING_ABILITIES, ...lead]),
    ...(pitcher || two ? YEAR_PITCHING_ABILITIES : []),
  ];
  const stats = [
    ...(pitcher && !two ? [] : YEAR_BATTING_STATS),
    ...(pitcher || two ? YEAR_PITCHING_STATS : []),
  ]
    .map(([category, group, id]) => ({ category, id, key: `${category}.${id}`, column: column(category, group, id) }))
    .filter((s) => s.column)
    .map((s) => ({ ...s, label: s.column.label }));
  const list = Array.isArray(years) ? years : [];
  const rows = list.map((y, i) => {
    const older = list[i + 1];
    const period = periodForYear(periods, y.year, currentYear);
    const shaped = period ? { ...player, seasonStats: period.seasonStats } : null;
    return {
      year: y.year,
      age: y.age,
      teams: y.teams,
      abilities: Object.fromEntries(
        abilities.map(([key]) => {
          const value = Number.isFinite(y.abilities?.[key]) ? y.abilities[key] : null;
          const before = older && Number.isFinite(older.abilities?.[key]) ? older.abilities[key] : null;
          return [key, { value, diff: value !== null && before !== null ? value - before : null }];
        }),
      ),
      stats: Object.fromEntries(stats.map((s) => [s.key, shaped ? s.column.get(shaped) : null])),
    };
  });
  return { abilities, stats, rows };
}
