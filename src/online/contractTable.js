// ============================================================
// 契約更改の表（1人1行）の列と並べ方。画面は `ContractPlanner.jsx`。
//
// ⚠ 先方指摘「名前・投打・年齢・各パラメータ・成績と網羅的に表示し、各能力値ごとに
//    ソートできるように」。列はここで1回だけ決め、画面は並べて出すだけにする
//    （node から読めるように JSX と分けてある。`online-contract-table-check`）。
// ⚠ 投手の打撃・野手の投球の能力は「—」にする（二刀流は両方）。全員に出すと、
//    野手の球速の列に低い数字が並んで、見たい数字が埋もれる。並べ替えでは「—」を末尾に置く。
// ⚠ 成績は `statsView.js` の列（打率・防御率など）と同じ値を使う。式を書き写さない。
// ⚠ アプリの `contractColumns`（Stats.kt）と同じ並び。列を足すときは両方に足す。
// ============================================================
import { statGroup } from './statsView.js';
import { rosterGroup } from '../utils/constants.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const isPitcher = (p) => p?.position === 'pitcher';
/** 投手の能力を出すか（投手・二刀流） */
const pitches = (p) => isPitcher(p) || !!p?.isTwoWay;
/** 打撃の能力を出すか（野手・二刀流） */
const bats = (p) => !isPitcher(p) || !!p?.isTwoWay;
const handed = (v) => ({ left: '左', right: '右', switch: '両' })[v] || '—';

const GROUP_ORDER = { pitcher: 0, catcher: 1, infielder: 2, outfielder: 3 };
const POSITION_SHORT = {
  pitcher: '投',
  catcher: '捕',
  first: '一',
  second: '二',
  third: '三',
  short: '遊',
  left: '左',
  center: '中',
  right: '右',
};
const POSITION_ORDER = ['pitcher', 'catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'];

const statOf = (category, group, id) => {
  const column = statGroup(category, group).columns.find((c) => c.id === id);
  return (p) => (column ? num(column.get(p)) : null);
};
const battingAvg = statOf('batting', 'basic', 'avg');
const homeruns = statOf('batting', 'basic', 'homeruns');
const rbis = statOf('batting', 'basic', 'rbis');
const era = statOf('pitching', 'basic', 'era');

/** 持ち球（直球を除く）でいちばん良いもの */
const bestPitch = (p) => {
  const levels = (p?.pitching?.arsenal || [])
    .filter((a) => a.type !== 'straight')
    .map((a) => num(a.level))
    .filter((v) => v !== null);
  return levels.length ? Math.max(...levels) : null;
};

const ability = (id, label, title, get, when = () => true, extra = {}) => ({
  id,
  label,
  title,
  kind: 'ability',
  dir: 'desc',
  className: 'online-contract-num',
  get: (p) => (when(p) ? num(get(p)) : null),
  ...extra,
});
const stat = (id, label, title, category, group, get, when, dir = 'desc') => ({
  id,
  label,
  title,
  kind: 'stat',
  category,
  group,
  stat: id.replace(/^stat:/, ''),
  dir,
  className: 'online-contract-num',
  get: (p) => (when(p) ? get(p) : null),
});

/**
 * 表の列（左から）。`get(player)` が並べ替えにも使う値（無ければ null）。
 * `kind`: 'text'（`text(player)` があればそれ、無ければ値をそのまま）・'ability'（数字＋格）・'stat'（成績の書式）
 */
export function contractColumns() {
  return [
    { id: 'name', label: '名前', title: '名前', kind: 'text', dir: 'asc', get: (p) => p.name || '' },
    {
      id: 'position',
      label: '位',
      title: '守備位置',
      kind: 'text',
      dir: 'asc',
      get: (p) => POSITION_ORDER.indexOf(p.position),
      text: (p) => POSITION_SHORT[p.position] || '—',
    },
    {
      id: 'hand',
      label: '投打',
      title: '投げ・打ち',
      kind: 'text',
      dir: 'asc',
      get: (p) => `${handed(p.physical?.throws)}投${handed(p.batting?.bats)}打`,
    },
    { id: 'age', label: '齢', title: '年齢', kind: 'text', dir: 'asc', className: 'online-contract-num', get: (p) => num(p.age) },
    ability('meet', 'ミ', 'ミート', (p) => p.batting?.meet, bats),
    ability('power', 'パ', 'パワー', (p) => p.batting?.power, bats),
    ability('eye', '眼', '選球眼', (p) => p.batting?.eye, bats),
    ability('speed', '走', '走力', (p) => p.physical?.speed, bats),
    ability('defense', '守', '守備', (p) => p.fielding?.defense, bats),
    ability('arm', '肩', '肩力', (p) => p.physical?.arm, bats),
    ability('lead', 'リ', '捕手リード', (p) => p.catching?.lead, (p) => p.position === 'catcher'),
    ability('velocity', '速', '球速', (p) => p.pitching?.velocity, pitches, { velocity: true }),
    ability('control', '制', '制球', (p) => p.pitching?.control, pitches),
    ability('stamina', 'ス', 'スタミナ', (p) => p.pitching?.stamina, pitches, { stamina: true }),
    ability('spin', '回', '回転', (p) => p.pitching?.spinRate, pitches),
    ability('pitch', '変', '変化球（持ち球でいちばん良いもの）', bestPitch, pitches),
    ability('body', '体', '体力', (p) => p.physical?.bodyStamina),
    ability('mental', '精', '精神力', (p) => p.personality?.mental),
    {
      id: 'games',
      label: '試',
      title: '今季の試合（投手は登板）',
      kind: 'text',
      dir: 'desc',
      className: 'online-contract-num',
      get: (p) =>
        num(isPitcher(p) ? p.seasonStats?.pitching?.games : p.seasonStats?.batting?.games) ?? 0,
    },
    stat('stat:avg', '率', '今季の打率', 'batting', 'basic', battingAvg, (p) => !isPitcher(p)),
    stat('stat:homeruns', '本', '今季の本塁打', 'batting', 'basic', homeruns, (p) => !isPitcher(p)),
    stat('stat:rbis', '点', '今季の打点', 'batting', 'basic', rbis, (p) => !isPitcher(p)),
    stat('stat:era', '防', '今季の防御率', 'pitching', 'basic', era, isPitcher, 'asc'),
    {
      id: 'wins',
      label: '勝',
      title: '今季の勝利',
      kind: 'text',
      dir: 'desc',
      className: 'online-contract-num',
      get: (p) => (isPitcher(p) ? num(p.seasonStats?.pitching?.wins) ?? 0 : null),
    },
    {
      id: 'saves',
      label: 'S',
      title: '今季のセーブ',
      kind: 'text',
      dir: 'desc',
      className: 'online-contract-num',
      get: (p) => (isPitcher(p) ? num(p.seasonStats?.pitching?.saves) ?? 0 : null),
    },
  ];
}

/**
 * 名簿の並べ替え。`column` が無ければ守備位置の順（投・捕・内・外、同じ区分は名簿の順）。
 * ⚠ 値の無い選手（野手の球速など）は向きによらず末尾。同じ値は名簿の順（決定的）。
 */
export function sortContractRoster(roster, column, dir = 'desc') {
  const list = (roster || []).map((player, index) => ({ player, index }));
  if (!column) {
    return list
      .sort(
        (a, b) =>
          GROUP_ORDER[rosterGroup(a.player.position)] - GROUP_ORDER[rosterGroup(b.player.position)] ||
          a.index - b.index,
      )
      .map((e) => e.player);
  }
  const value = (p) => {
    const v = column.get(p);
    return v === '' ? null : v;
  };
  return list
    .sort((a, b) => {
      const x = value(a.player);
      const y = value(b.player);
      const missX = x === null || x === undefined || x === -1;
      const missY = y === null || y === undefined || y === -1;
      if (missX || missY) return missX === missY ? a.index - b.index : missX ? 1 : -1;
      const c = typeof x === 'string' ? x.localeCompare(y, 'ja') : x - y;
      return (dir === 'asc' ? c : -c) || a.index - b.index;
    })
    .map((e) => e.player);
}

/**
 * 指導者の異動の選び方（`server/coachEngine.mjs` の `STAFF_MOVE_OPTIONS`。先方要望 2026-11-23）。
 * ⚠ アプリは ProceduresScreen.kt の `STAFF_MOVE_CHOICES`（同じ値・同じ言葉）
 */
export const STAFF_MOVE_CHOICES = {
  manager: [
    [null, '続投'],
    ['leave', '退任'],
    ['pitching', '投手コーチを昇格'],
    ['batting', '野手コーチを昇格'],
  ],
  pitching: [
    [null, '続投'],
    ['leave', '退任'],
  ],
  batting: [
    [null, '続投'],
    ['leave', '退任'],
  ],
};
export const STAFF_ROLE_NAMES = { manager: '監督', pitching: '投手コーチ', batting: '野手コーチ' };

/**
 * 案の異動とコーチ打診を、年度更新で起きる順の文にする（手続きの欄・決定の帯で使う）。
 * `seats`: ビューの `staff.seats`（[{ role, coach }]）、`roster`: 名簿（打診した選手の名前）
 */
export function staffMoveLines(plan, seats = [], roster = []) {
  const moves = plan?.staffMoves || {};
  const nameOf = (role) => seats.find((s) => s.role === role)?.coach?.name || '';
  const byId = new Map(roster.map((p) => [p.id, p]));
  const out = [];
  if (moves.manager === 'leave') out.push(`${nameOf('manager')}監督が退任`);
  else if (moves.manager)
    out.push(`${nameOf('manager')}監督が退任し、${nameOf(moves.manager)}${STAFF_ROLE_NAMES[moves.manager]}が監督に昇格`);
  for (const role of ['pitching', 'batting']) {
    if (moves[role] === 'leave') out.push(`${nameOf(role)}${STAFF_ROLE_NAMES[role]}が退任`);
    const offered = byId.get(plan?.coachOffers?.[role]);
    if (offered) out.push(`${offered.name}（現役を引退）が${STAFF_ROLE_NAMES[role]}に就任`);
  }
  return out;
}
