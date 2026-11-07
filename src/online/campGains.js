import { getPitchTypeName } from '../utils/constants.js';

// ============================================================
// キャンプで伸びた能力の記録（いしだ指摘: 能力値は伸びているのに結果が
// まとまっておらず、成長が実感できない）。
//
// サーバーは1クールごとに練習の前後を比べて、選手ごとの伸び（差）を残す。
// 画面は「このクール」と「キャンプ通算」を同じ形で出す。
//
// ⚠ **差を後から作らないこと**（画面で前回の値と比べるなど）。読み直しや
//    別の端末で見たときに前回の値が無く、伸びが0に見える。正本はサーバーの記録。
// ⚠ 項目の名前はアプリ（`mobile/.../CampGains.kt`）と同じにする。
// ============================================================

/** 比べる能力（置き場・項目・画面の名前） */
export const CAMP_GAIN_FIELDS = [
  ['batting', 'meet', 'ミート'],
  ['batting', 'power', 'パワー'],
  ['batting', 'eye', '選球眼'],
  ['batting', 'steal', '盗塁'],
  ['batting', 'bunt', 'バント'],
  ['pitching', 'velocity', '球速'],
  ['pitching', 'control', '制球'],
  ['pitching', 'stamina', 'スタミナ'],
  ['pitching', 'spinRate', '回転'],
  ['physical', 'speed', '走力'],
  ['physical', 'arm', '肩力'],
  ['physical', 'bodyStamina', '体力'],
  ['physical', 'recovery', '回復'],
  ['physical', 'muscle', '体幹'],
  ['physical', 'dexterity', '器用さ'],
  ['fielding', 'defense', '守備'],
  ['catching', 'lead', 'リード'],
];

const LABELS = Object.fromEntries(
  CAMP_GAIN_FIELDS.map(([area, key, label]) => [`${area}.${key}`, label]),
);

/** 項目の画面の名前。変化球は `pitch.<球種>` */
export function campGainLabel(key) {
  if (key.startsWith('pitch.')) return getPitchTypeName(key.slice(6));
  return LABELS[key] || key;
}

/** 練習の前後を比べるための写し（数字の能力と、変化球のキレ） */
export function abilitySnapshot(player) {
  const out = {};
  for (const [area, key] of CAMP_GAIN_FIELDS) {
    const value = player?.[area]?.[key];
    if (typeof value === 'number' && Number.isFinite(value))
      out[`${area}.${key}`] = value;
  }
  for (const pitch of player?.pitching?.arsenal || [])
    if (pitch?.type && typeof pitch.level === 'number')
      out[`pitch.${pitch.type}`] = pitch.level;
  return out;
}

/**
 * 前後の差。**変わった項目だけ**返す（下がった項目も入る。体力練習で球速が
 * 落ちるなど）。新しく覚えた変化球は、前が無いので覚えたときのキレを伸びにする。
 * ⚠ 小数の能力がある。丸めて0になった差は落とす（「+0」を並べない）。
 */
export function abilityGains(before, after) {
  const out = {};
  for (const [key, value] of Object.entries(after)) {
    const diff = Math.round((value - (before[key] ?? 0)) * 10) / 10;
    if (diff !== 0) out[key] = diff;
  }
  return out;
}

/** 通算に1クールぶんを足す（`total` を書き換えずに新しい値を返す） */
export function addCampGains(total = {}, gains = {}) {
  const out = { ...total };
  for (const [id, changes] of Object.entries(gains)) {
    const merged = { ...(out[id] || {}) };
    for (const [key, diff] of Object.entries(changes)) {
      const next = Math.round(((merged[key] || 0) + diff) * 10) / 10;
      if (next === 0) delete merged[key];
      else merged[key] = next;
    }
    if (Object.keys(merged).length) out[id] = merged;
    else delete out[id];
  }
  return out;
}

/**
 * 画面に出す形。伸びた量の多い選手から。
 * ⚠ 名簿に居ない選手（キャンプ中に退団した・入れ替わった）は落とす。
 */
export function campGainRows(gains = {}, roster = [], events = {}) {
  const byId = new Map(roster.map((p) => [String(p.id), p]));
  // ⚠ 数字が動かなくても、出来事（フォーム改造など）があった選手は載せる
  const ids = new Set([...Object.keys(gains), ...Object.keys(events)]);
  return [...ids]
    .map((id) => {
      const player = byId.get(String(id));
      if (!player) return null;
      const items = Object.entries(gains[id] || {})
        .map(([key, diff]) => ({ key, label: campGainLabel(key), diff }))
        .sort((a, b) => b.diff - a.diff);
      const sum = items.reduce((n, item) => n + item.diff, 0);
      return { player, items, sum, events: events[id] || [] };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        b.sum - a.sum || String(a.player.id).localeCompare(String(b.player.id)),
    );
}

/** 球団全体で、項目ごとの伸びの合計（多い順） */
export function campGainTotals(gains = {}) {
  const sums = {};
  for (const changes of Object.values(gains))
    for (const [key, diff] of Object.entries(changes))
      sums[key] = Math.round(((sums[key] || 0) + diff) * 10) / 10;
  return Object.entries(sums)
    .filter(([, diff]) => diff !== 0)
    .map(([key, diff]) => ({ key, label: campGainLabel(key), diff }))
    .sort((a, b) => b.diff - a.diff);
}

/** 「+2」「-1」「+0.5」 */
export const formatGain = (diff) =>
  `${diff > 0 ? '+' : ''}${Number.isInteger(diff) ? diff : diff.toFixed(1)}`;
