// ============================================================
// Web 版の表（練習メニュー・采配の選択肢・投手の役割・しきい値・能力の説明・成績の列など）から
// アプリの Kotlin の表（shared/.../Tables.kt）を書き出す。
//
// ⚠ **表を手で写さないこと**。Web 側で選択肢やしきい値を変えたとき、写しだけ古くなる。
//    `node mobile/tools/gen-tables.mjs` で作り直し、`--check` で食い違いを検査する（`npm run check:quick` の app-gen-tables で回る）。
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const at = (p) => path.join(root, p);
const { TRAINING_MENUS, SUB_TRAINING_MENUS } = await import(at('src/season/campTraining.js'));
const { DIRECTIONS, PHASES } = await import(at('src/season/trainingPolicy.js'));
const tactics = await import(at('src/online/tactics.js'));
const shared = await import(at('src/online/shared.js'));
const pitching = await import(at('src/online/pitchingEdit.js'));
const constants = await import(at('src/utils/constants.js'));
const pyramid = await import(at('src/online/pyramidLeague.js'));
const api = await import(at('src/online/api.js'));
const social = await import(at('src/online/social.js'));
const tryoutPlan = await import(at('src/online/tryoutPlan.js'));
const playerInfo = await import(at('src/online/playerInfo.js'));
const recordStats = await import(at('src/online/recordStats.js'));
const statsView = await import(at('src/online/statsView.js'));
const lineupEdit = await import(at('src/online/lineupEdit.js'));
const condition = await import(at('src/game/condition.js'));

// ⚠ Kotlin の文字列では `$` が式の始まりになるので逃がす
const q = (s) => JSON.stringify(String(s)).replaceAll('$', '\\$');
const lines = [];
const out = (s = '') => lines.push(s);
out('// このファイルは mobile/tools/gen-tables.mjs が Web 版の表から書き出したもの。手で直さないこと。');
out('package jp.icenorth.baseball.shared');
out('');
out('data class Menu(val key: String, val name: String, val icon: String, val description: String, val category: String? = null, val only: String? = null)');
out('data class Choice(val key: String, val label: String)');
out('data class ChoiceField(val key: String, val label: String, val numeric: Boolean, val options: List<Choice>, val default: String)');
out('');
// ⚠ フォーム改造は 2026-11-23 から**投手も野手も使える**（投球フォーム / 打撃フォーム）。
//    ここから外したのはそのため（`SUB_MENU_ONLY` も同じ）
const only = { breaking: 'pitcher', newpitch: 'pitcher', spin_analysis: 'pitcher', clead_study: 'catcher' };
// 守備位置で決まる「その練習が効くか」は campTraining.js の関数で確かめてから書く
for (const key of Object.keys(only))
  if (SUB_TRAINING_MENUS[key] && shared.CAMP_SUB_MENUS.includes(key)) {
    const pos = only[key];
    const other = pos === 'pitcher' ? 'catcher' : 'pitcher';
    const { subMenuFitsPlayer } = await import(at('src/season/campTraining.js'));
    if (!subMenuFitsPlayer(key, { position: pos }) || subMenuFitsPlayer(key, { position: other }))
      throw new Error(`サブ練習 ${key} の対象が変わった。gen-tables.mjs の only を直す`);
  }
out('val CAMP_MENUS: List<Menu> = listOf(');
for (const key of shared.CAMP_MENUS) {
  const m = TRAINING_MENUS[key];
  out(`    Menu(${q(key)}, ${q(m.name)}, ${q(m.icon || '')}, ${q(m.description || '')}, category = ${q(m.category)}),`);
}
out(')');
out('val CAMP_SUB_MENUS: List<Menu> = listOf(');
for (const key of shared.CAMP_SUB_MENUS) {
  const m = SUB_TRAINING_MENUS[key];
  out(`    Menu(${q(key)}, ${q(m.name)}, ${q(m.icon || '')}, ${q(m.description || '')}, only = ${only[key] ? q(only[key]) : 'null'}),`);
}
out(')');
out('val CAMP_DIRECTIONS: List<Menu> = listOf(');
for (const key of shared.CAMP_DIRECTIONS) out(`    Menu(${q(key)}, ${q(DIRECTIONS[key].name)}, ${q(DIRECTIONS[key].icon)}, ${q(DIRECTIONS[key].description)}),`);
out(')');
out('val CAMP_PHASES: List<Menu> = listOf(');
for (const key of shared.CAMP_PHASES) out(`    Menu(${q(key)}, ${q(PHASES[key].name)}, ${q(PHASES[key].icon)}, ${q(PHASES[key].description)}),`);
out(')');
const fields = (obj, defaults = {}) => {
  out('listOf(');
  for (const [key, [label, options]] of Object.entries(obj)) {
    const numeric = typeof defaults[key] === 'number';
    const def = defaults[key] ?? Object.keys(options)[0];
    out(`    ChoiceField(${q(key)}, ${q(label)}, ${numeric}, listOf(${Object.entries(options).map(([k, v]) => `Choice(${q(k)}, ${q(v)})`).join(', ')}), ${q(def)}),`);
  }
  out(')');
};
lines.push('val STRATEGY_FIELDS: List<ChoiceField> = '); fields(tactics.STRATEGY_FIELDS);
lines.push('val TACTIC_FIELDS: List<ChoiceField> = '); fields(tactics.TACTIC_FIELDS, tactics.TACTIC_DEFAULTS);
const map = (name, obj) => out(`val ${name}: Map<String, String> = mapOf(${Object.entries(obj).map(([k, v]) => `${q(k)} to ${q(v)}`).join(', ')})`);
// 方針の効き目（Web 版の作戦画面と同じ文。キーは「項目.値」。`strategyEffectText`）
{
  const effects = {};
  for (const [key, [, options]] of Object.entries(tactics.STRATEGY_FIELDS))
    for (const value of Object.keys(options)) effects[`${key}.${value}`] = tactics.strategyEffectText(key, value);
  map('STRATEGY_EFFECTS', effects);
}
map('STARTER_ROLES', tactics.STARTER_ROLES);
map('RELIEF_ROLES', tactics.RELIEF_ROLES);
map('ROLE_HINT', pitching.ROLE_HINT);
map('PHASE_LABELS', shared.PHASE_LABELS);
map('FORM_SHORT', constants.FORM_SHORT);
map('BATS_SHORT', constants.BATS_SHORT);
const pitchTypes = {};
for (const key of Object.keys(constants.BALL_EFFECTS || {})) pitchTypes[key] = constants.getPitchTypeName(key);
map('PITCH_TYPE_NAMES', pitchTypes);
out(`val RELIEF_ORDER: List<String> = listOf(${pitching.RELIEF_ORDER.map(q).join(', ')})`);
out(`val STARTER_ORDER: List<String> = listOf(${pitching.STARTER_ORDER.map(q).join(', ')})`);
const ints = {
  MAX_STARTERS: pitching.MAX_STARTERS,
  RELIEF_REST_FATIGUE: pitching.RELIEF_REST_FATIGUE,
  STARTER_SKIP_FATIGUE: shared.STARTER_SKIP_FATIGUE,
  FIELDER_REST_FATIGUE: shared.FIELDER_REST_FATIGUE,
  FIELDER_FORCE_REST_FATIGUE: shared.FIELDER_FORCE_REST_FATIGUE,
  SUBSTITUTE_MIN_FITNESS: shared.SUBSTITUTE_MIN_FITNESS,
  SUBSTITUTE_FRESH_FATIGUE: shared.SUBSTITUTE_FRESH_FATIGUE,
  ROSTER_LIMIT: shared.ROSTER_LIMIT,
  ROSTER_STANDARD: shared.ROSTER_STANDARD,
  CAMP_ROUNDS: shared.CAMP_ROUNDS,
};
for (const [k, v] of Object.entries(ints)) {
  if (!Number.isInteger(v)) throw new Error(`${k} が読めない`);
  out(`const val ${k}: Int = ${v}`);
}
// 疲れた野手を休ませる目安（自動采配の restLine → 疲労）。アプリの気になる所が同じ値で「休みます」を出す
if (!shared.REST_LINES) throw new Error('REST_LINES が読めない');
out(`val REST_LINES: Map<String, Int> = mapOf(${Object.entries(shared.REST_LINES).map(([k, v]) => `${q(k)} to ${v}`).join(', ')})`);
out('/** その球団の休ませる目安の疲労（Web 版 shared.js の restFatigueOf） */');
out('fun restFatigueOf(restLine: String?): Int = REST_LINES[restLine] ?: FIELDER_REST_FATIGUE');
// 1年の流れの帯（`SEASON_STEPS`）と、キャンプの方針ごとの伸びの目安（`CAMP_POLICY_GUIDE`）
out('data class SeasonStep(val key: String, val label: String, val time: String, val todo: String)');
out('val SEASON_STEPS: List<SeasonStep> = listOf(');
for (const s of shared.SEASON_STEPS) out(`    SeasonStep(${q(s.key)}, ${q(s.label)}, ${q(s.when)}, ${q(s.todo)}),`);
out(')');
out('val CAMP_POLICY_GUIDE: Map<String, Pair<String, String>> = mapOf(');
for (const [k, v] of Object.entries(shared.CAMP_POLICY_GUIDE)) out(`    ${q(k)} to (${q(v.fielder)} to ${q(v.pitcher)}),`);
out(')');
out(`val ONLINE_ROSTER_TARGETS: Map<String, Int> = mapOf(${Object.entries(shared.ONLINE_ROSTER_TARGETS).map(([k, v]) => `${q(k)} to ${v}`).join(', ')})`);
// 版のずれだけなら送り直す命令（OnlineApi.kt の command）。⚠ Web 版と同じ一覧を使う（アプリだけ campRound が抜けていた）
if (!Array.isArray(shared.RETRY_ON_REVISION)) throw new Error('RETRY_ON_REVISION が読めない');
out(`val RETRY_ON_REVISION: Set<String> = setOf(${shared.RETRY_ON_REVISION.map(q).join(', ')})`);
// 順位表の昇格圏・降格圏（Web 版 LeaguePanels.jsx の Standings と同じ決まり。上から PROMOTION_PLACES 位まで・下から RELEGATION_FROM_BOTTOM 位まで）
out('data class PyramidLeague(val id: String, val name: String, val promotes: Boolean, val relegates: Boolean)');
out('val PYRAMID_LEAGUES: List<PyramidLeague> = listOf(');
for (const l of pyramid.PYRAMID_LEAGUES) out(`    PyramidLeague(${q(l.id)}, ${q(l.name)}, ${l.up.length > 0}, ${l.down.length > 0}),`);
out(')');
for (const [k, v] of Object.entries({ PROMOTION_PLACES: pyramid.PROMOTION_PLACES[0], RELEGATION_FROM_BOTTOM: pyramid.RELEGATION_FROM_BOTTOM[0] })) {
  if (!Number.isInteger(v)) throw new Error(`${k} が読めない`);
  out(`const val ${k}: Int = ${v}`);
}
// キャンプのサブ練習で選べる対象（Web 版 CampPlanner.jsx の subTargetChoices と同じ材料）。
// ⚠ アプリは対象を送っていなかった（新球種は中で抽選、サブポジ練習は置き場が無いとして外れていた）
const list = (name, values) => {
  if (!Array.isArray(values) || values.length === 0) throw new Error(`${name} が読めない`);
  out(`val ${name}: List<String> = listOf(${values.map(q).join(', ')})`);
};
map('CAMP_SUB_TARGETS', shared.CAMP_SUB_TARGETS);
list('CAMP_PITCH_TYPES', shared.CAMP_PITCH_TYPES);
list('CONVERT_POSITIONS', shared.CONVERT_POSITIONS);
// フォーム改造・打席変更の対象（選ばないと基礎体力になる種類と、選べる形）
list('CAMP_TARGET_REQUIRED', shared.CAMP_TARGET_REQUIRED);
// 打撃フォーム（いしだ 2026-11-23）。野手の「フォーム改造」で選ぶ
list('CAMP_STANCES', shared.CAMP_STANCES);
list('CAMP_FORMS', shared.CAMP_FORMS);
list('CAMP_BATS', shared.CAMP_BATS);
map('POSITION_NAMES', api.POS_FULL);
// 人どうしの関わり（ひとことの字数・おるすばんの日数・予告先発の確定・練習試合の回数。Web 版 social.js）
for (const k of ['TRADE_NOTE_MAX', 'OWNER_COMMENT_MAX', 'CHALLENGE_NOTE_MAX', 'AWAY_DAYS', 'STARTER_LOCK_TURNS', 'STARTER_PICK_GAMES', 'EXHIBITIONS_PER_DAY']) {
  if (!Number.isInteger(social[k])) throw new Error(`${k} が読めない`);
  out(`const val ${k}: Int = ${social[k]}`);
}
// シーズンの長さ・開幕の月・守備位置の1字・進行の状態（Web 版 pyramidLeague.js / shared.js / api.js）
for (const [k, v] of Object.entries({ SEASON_TURNS: pyramid.SEASON_TURNS, SEASON_START_MONTH: shared.SEASON_START_MONTH })) {
  if (!Number.isInteger(v)) throw new Error(`${k} が読めない`);
  out(`const val ${k}: Int = ${v}`);
}
map('POSITION_LABELS', api.POS);
map('STATUS_LABELS', api.STATUS);
// 1部・2部のそれぞれの球団の数（pyramidLeague.js）と、交渉できる人数の上限（1位〜20位。tryoutPlan.js）
for (const [k, v] of Object.entries({ TEAMS_PER_LEAGUE: pyramid.TEAMS_PER_LEAGUE, TRYOUT_WISH_MAX: tryoutPlan.TRYOUT_WISH_MAX })) {
  if (!Number.isInteger(v)) throw new Error(`${k} が読めない`);
  out(`const val ${k}: Int = ${v}`);
}

// ------------------------------------------------------------------
// ここから下は以前アプリに手で写していた表（2026-11-24 に生成へ。以前は検査が正規表現で Kotlin を読んで照らしていた）
// ------------------------------------------------------------------
// 能力の一言の説明（Web 版 playerInfo.js の ABILITY_HELP。選手の詳細で項目を押すと出す）。
// ⚠ 見出しは Web 版の名前（「肩力」「盗塁技術」「捕手リード」）。アプリの短い表示名とは別
out('/** 能力の一言の説明（何に・どう効くか）。Web 版 src/online/playerInfo.js の ABILITY_HELP */');
out('val ABILITY_HELP: Map<String, String> = linkedMapOf(');
for (const [k, v] of Object.entries(playerInfo.ABILITY_HELP)) out(`    ${q(k)} to ${q(v)},`);
out(')');
// 投手×捕手の組み合わせの「少ない組」の境目と注記（Web 版 recordStats.js）
if (!Number.isInteger(recordStats.BATTERY_MIN_OUTS)) throw new Error('BATTERY_MIN_OUTS が読めない');
out(`const val BATTERY_MIN_OUTS: Int = ${recordStats.BATTERY_MIN_OUTS}`);
out(`val BATTERY_NOTE: String = ${q(recordStats.BATTERY_NOTE)}`);

// --- 値の引き方を Web 版の関数から読む ---------------------------------
// 関数に「触った項目を書き留める」偽の選手を渡し、1つの項目だけを読む関数かを調べる。
// 1つだけなら、その項目に数を入れた選手で答えが合うか（負・無しは「無い」になるか）まで確かめる。
// それ以外（2つ以上を組み合わせる列）は、アプリ側に同じ名前の式（Stats.kt の StatComputed）を置き、
// 値は expect-stats.mjs の答え合わせ（StatsWebTest）で比べる。
const readPath = (get) => {
  const seen = [];
  const probe = (at) =>
    new Proxy(Object.create(null), {
      get(_, key) {
        if (typeof key === 'symbol') return undefined;
        const next = [...at, key];
        seen.push(next);
        return probe(next);
      },
    });
  try {
    get(probe([]));
  } catch {
    /* 偽の選手で計算が止まるのはかまわない（触った項目は書き留めてある） */
  }
  const leaves = seen.filter((p) => !seen.some((o) => o.length > p.length && p.every((k, i) => o[i] === k)));
  const unique = [...new Set(leaves.map((p) => p.join('.')))];
  return unique.length === 1 ? unique[0].split('.') : null;
};
const withValue = (path, value) => {
  const player = {};
  let at = player;
  path.slice(0, -1).forEach((k) => (at = at[k] = {}));
  at[path.at(-1)] = value;
  return player;
};
const tryGet = (get, player) => {
  try {
    return get(player);
  } catch {
    return Symbol('止まった');
  }
};
/** 1つの項目だけを読み、0以上の数だけを返す（負・無しは null）関数なら、その項目 */
const knownPath = (get) => {
  const path = readPath(get);
  if (!path) return null;
  const at = (v) => tryGet(get, withValue(path, v));
  const ok = at(12.5) === 12.5 && at(0) === 0 && at(-1) == null && tryGet(get, {}) == null;
  return ok ? path : null;
};
const STAT_FORMATS = { count: 'Count', rate: 'Rate', decimal: 'Decimal', percent: 'Percent', innings: 'Innings', condition: 'Condition', ability: 'Ability', velocity: 'Velocity', stamina: 'Stamina' };
const ABILITY_FORMATS = ['ability', 'velocity', 'stamina'];
const kotlinGetter = (column) => {
  const path = knownPath(column.get);
  if (!path) return `StatComputed.${column.id}`;
  const [a, b, c, d] = path;
  if (a === 'seasonStats' && path.length === 3) return `statRaw(${q(b)}, ${q(c)})`;
  if (a === 'performance' && c === 'metrics' && path.length === 4) return `statMetric(${q(b)}, ${q(d)})`;
  if (a === 'catcherStats' && path.length === 2) return `statCaught(${q(b)})`;
  if (path.length === 2 || path.length === 1) return `statField(${path.map(q).join(', ')})`;
  throw new Error(`${column.id} の読み方（${path.join('.')}）をアプリに書けない`);
};
/**
 * アプリでの列の id。⚠ 能力の列は「区分:項目」にそろえる（Web 版の調子・疲労の「ability」も）。
 * アプリは区分をまたいで同じ id の列に並べ替えを引き継ぐので、同じ能力は同じ id にしておく。
 */
const kotlinColumnId = (column) => {
  if (!ABILITY_FORMATS.includes(column.format)) return column.id;
  const path = knownPath(column.get);
  if (!path || path.length !== 2) throw new Error(`能力の列 ${column.id} の読み方が分からない`);
  return path.join(':');
};
const statColumn = (column) => {
  const format = STAT_FORMATS[column.format];
  if (!format) throw new Error(`列 ${column.id} の書式 ${column.format} をアプリが知らない`);
  if (!['asc', 'desc'].includes(column.direction)) throw new Error(`列 ${column.id} の向き ${column.direction}`);
  return `StatColumn(${q(kotlinColumnId(column))}, ${q(column.label)}, StatFormat.${format}, ${column.direction === 'asc'}, ${kotlinGetter(column)})`;
};
// 選手成績の表の列（Web 版 statsView.js の STAT_GROUPS と同じ並び・同じ読み方）
for (const [category, name] of [['batting', 'BATTING_GROUPS'], ['pitching', 'PITCHING_GROUPS']]) {
  out(`/** 選手成績の表の区分と列（Web 版 src/online/statsView.js の STAT_GROUPS.${category}） */`);
  out(`val ${name}: List<StatGroup> = listOf(`);
  for (const group of statsView.STAT_GROUPS[category]) {
    out(`    StatGroup(`);
    out(`        ${q(group.id)}, ${q(group.label)},`);
    out(`        listOf(`);
    for (const column of group.columns) out(`            ${statColumn(column)},`);
    out(`        ),`);
    out(`    ),`);
  }
  out(')');
}
// 主要成績一覧の列（Web 版 overviewGroup）と、既定の並べ替えの列（defaultSort）
for (const [category, suffix] of [['batting', 'BATTING'], ['pitching', 'PITCHING']]) {
  const ids = statsView.overviewGroup(category).columns.map(kotlinColumnId);
  out(`val OVERVIEW_${suffix}_IDS: List<String> = listOf(${ids.map(q).join(', ')})`);
  const sort = statsView.defaultSort(category);
  if (sort.direction !== 'desc') throw new Error('既定の並べ替えが多い順でなくなった。Stats.kt の defaultSortColumn を直す');
  out(`const val DEFAULT_SORT_${suffix}: String = ${q(kotlinColumnId(sort.column))}`);
}
// 能力で絞り込む条件（Web 版 tryoutPlan.js の ABILITY_FILTERS）。値は画面の数のまま（球速は km/h、スタミナは 0〜200）
out('/** 能力で絞り込む条件に使える能力（Web 版 src/online/tryoutPlan.js の ABILITY_FILTERS） */');
out('val ABILITY_FILTERS: List<AbilityFilterDef> = listOf(');
for (const def of tryoutPlan.ABILITY_FILTERS) {
  const path = readPath(def.get);
  const single = path && tryGet(def.get, withValue(path, 47)) === 47 && tryGet(def.get, {}) === undefined;
  const get = single ? `filterField(${path.map(q).join(', ')})` : `AbilityFilterComputed.${def.key}`;
  out(`    AbilityFilterDef(${q(def.key)}, ${q(def.label)}, ${q(def.side)}, ${q(def.unit || '')}, ${get}),`);
}
out(')');
if (!Number.isInteger(tryoutPlan.ABILITY_FILTER_MAX)) throw new Error('ABILITY_FILTER_MAX が読めない');
out(`const val ABILITY_FILTER_MAX: Int = ${tryoutPlan.ABILITY_FILTER_MAX}`);

// 控えの括り（Web 版 lineupEdit.js の FIELDER_GROUPS）。画面の守備位置の色分けにも使う
out('data class FielderGroup(val id: String, val label: String, val positions: List<String>)');
out('val FIELDER_GROUPS: List<FielderGroup> = listOf(');
for (const g of lineupEdit.FIELDER_GROUPS) out(`    FielderGroup(${q(g.id)}, ${q(g.label)}, listOf(${g.positions.map(q).join(', ')})),`);
out(')');
// 能力の段位（Web 版 constants.js の getAbilityRank。0〜100にそろえた値が「この値以上」で上の段）
{
  const ranks = [];
  for (let v = 100; v >= 0; v -= 1) {
    const rank = constants.getAbilityRank(v);
    if (rank !== constants.getAbilityRank(v - 0.5) || v === 0) ranks.push([v, rank]);
  }
  ranks.at(-1)[0] = 0;
  // 境目の間（小数）でも同じ段になるか確かめる
  for (let v = 0; v <= 100; v += 0.25) {
    const want = ranks.find(([min]) => v >= min)[1];
    if (constants.getAbilityRank(v) !== want) throw new Error(`段位の境目が整数でない（${v}）。gen-tables.mjs を直す`);
  }
  out(`val ABILITY_RANKS: List<Pair<Int, Char>> = listOf(${ranks.map(([min, r]) => `${min} to '${r}'`).join(', ')})`);
}
// 疲労の段（Web 版 constants.js の getFatigueTone。黄・赤になる最初の疲労）
{
  const from = (tone) => {
    for (let f = 0; f <= 300; f += 1) if (constants.getFatigueTone(f) === tone) return f;
    throw new Error(`疲労の段 ${tone} が見つからない`);
  };
  const warn = from('warn');
  const heavy = from('heavy');
  const toneOf = (f) => (f >= heavy ? 'heavy' : f >= warn ? 'warn' : '');
  for (let f = 0; f <= 300; f += 1)
    if (constants.getFatigueTone(f) !== toneOf(f)) throw new Error(`疲労の段が2つの境目で表せない（${f}）`);
  out(`const val FATIGUE_WARN_FROM: Int = ${warn}`);
  out(`const val FATIGUE_HEAVY_FROM: Int = ${heavy}`);
}
// 調子（0〜4）の顔（Web 版 condition.js の CONDITION_ICONS）と言葉（statsView.js の CONDITION_TEXT）
out(`val CONDITION_ICONS: Map<Int, String> = mapOf(${Object.entries(condition.CONDITION_ICONS).map(([k, v]) => `${Number(k)} to ${q(v)}`).join(', ')})`);
out(`val CONDITION_TEXT: List<String> = listOf(${statsView.CONDITION_TEXT.map(q).join(', ')})`);

// 球団ロゴの図形・字の幅・決まった数（Web 版 look/logoParts.js・logoBuild.js・logoArt.js）。
// 描く手順は LookLogo.kt に手で写してある（答え合わせは LookTest）。表だけここで書き出す
{
  const parts = await import(at('src/online/look/logoParts.js'));
  const build = await import(at('src/online/look/logoBuild.js'));
  const art = await import(at('src/online/look/logoArt.js'));
  // Kotlin の Double の字（40 → 40.0）
  const dbl = (v) => (Number.isInteger(v) ? `${v}.0` : String(v));
  out('/** 球団ロゴの図形（100×100 の箱。2つ目は線だけで重ねる模様）。Web 版 `LOGO_SHAPES` */');
  out('val LOGO_SHAPES: Map<String, Pair<String, String?>> = mapOf(');
  for (const [key, shape] of Object.entries(parts.LOGO_SHAPES)) out(`    ${q(key)} to (${q(shape.d)} to ${shape.d2 ? q(shape.d2) : 'null'}),`);
  out(')');
  out('/** ロゴの字の送り幅（0x20〜0x7E。1000分のいくつ）。字から測らずこの数で決める（Web 版 `charWidth`） */');
  out('val LOGO_CHAR_WIDTHS: Map<String, List<Int>> = mapOf(');
  const codes = Array.from({ length: 0x7f - 0x20 }, (_, i) => String.fromCodePoint(0x20 + i));
  for (const font of parts.LOGO_LATIN_FONTS) out(`    ${q(font)} to listOf(${codes.map((ch) => Math.round(parts.charWidth(ch, font) * 1000)).join(', ')}),`);
  out(')');
  // 表に無い書体（和文）の英数の幅。英数でない字はどの書体でも1字ぶん
  const other = new Set(codes.map((ch) => Math.round(parts.charWidth(ch, 'jp') * 1000)));
  if (other.size !== 1 || parts.charWidth('あ', 'graduate') !== 1) throw new Error('ロゴの字の幅の決め方が変わった。gen-tables.mjs と LookLogo.kt を直す');
  out(`const val LOGO_OTHER_ASCII_WIDTH: Int = ${[...other][0]}`);
  out(`const val LOGO_TEXT_UNIT: Double = ${dbl(build.LOGO_TEXT_UNIT)}`);
  out(`const val LOGO_ARC_GAP: Double = ${dbl(build.LOGO_ARC_GAP)}`);
  out(`val LOGO_BOX: List<Double> = listOf(${art.LOGO_BOX.map(dbl).join(', ')})`);
  out(`const val LOGO_MINI_SIZE: Int = ${art.LOGO_MINI_SIZE}`);
  out(`const val LOGO_MAX_LAYERS: Int = ${parts.LOGO_MAX_LAYERS}`);
  out(`const val LOGO_MINI_MAX_LAYERS: Int = ${parts.LOGO_MINI_MAX_LAYERS}`);
  out(`const val LOGO_WHITE: String = ${q(parts.LOGO_WHITE)}`);
  out(`const val LOGO_INK: String = ${q(parts.LOGO_INK)}`);
  if (parts.WHITE !== 3 || parts.INK !== 4) throw new Error('ロゴの色の番号が変わった。LookLogo.kt を直す');
}

const text = lines.join('\n') + '\n';
const file = path.join(root, 'mobile/shared/src/commonMain/kotlin/jp/icenorth/baseball/shared/Tables.kt');
if (process.argv.includes('--check')) {
  const now = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (now !== text) {
    console.error('Tables.kt が Web 版の表と食い違っています。node mobile/tools/gen-tables.mjs で作り直してください');
    process.exit(1);
  }
  console.log('Tables.kt は Web 版の表と一致しています');
} else {
  fs.writeFileSync(file, text);
  console.log('wrote', path.relative(root, file));
}
