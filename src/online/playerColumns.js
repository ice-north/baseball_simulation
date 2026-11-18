import { overviewGroup } from './statsView.js';
import { getPitchTypeName } from '../utils/constants.js';

// ============================================================
// 選手を並べる表の列（PC）。**トレードとトライアウトで同じ列**にするためにここへ置く。
//
// 【なぜ1か所か】どちらの画面も「知らない選手を能力で比べて選ぶ」ところで、
// 列が違うと同じ選手が画面によって違う顔に見える。トレードの表（2026-11-06）で
// 決めた並び（能力 → 今季成績）をトライアウトの受験者の表でもそのまま使う。
//
// ⚠ スタメン設定（`LineupBoard.jsx`）は**打者だけの表**で、疲労・守備適性など
//    スタメン決めの列が要るので、あちらは自前の列を持っている。見た目（`.online-lineup-table`）
//    は共通。
// ⚠ 投手と野手で列が違うので、**表は括りごとに分ける**（1枚に混ぜると、片方の
//    能力の列が全部「—」になる）。
// ============================================================

/** 守備の括り。表の見出しと絞り込みに使う（`rosterGroup` と同じ4つ） */
export const PLAYER_GROUPS = [
  { id: 'pitcher', label: '投手', short: '投' },
  { id: 'catcher', label: '捕手', short: '捕' },
  { id: 'infielder', label: '内野手', short: '内' },
  { id: 'outfielder', label: '外野手', short: '外' },
];

const pickStats = (category, ids) => {
  const columns = overviewGroup(category).columns;
  return ids.map((id) => columns.find((c) => c.id === id)).filter(Boolean);
};

/** 投手と野手で列を変える（比べたい能力が違う）。どちらも「能力 → 今季成績」の順 */
export const PLAYER_KINDS = {
  fielder: {
    category: 'batting',
    label: '野手',
    abilities: [
      { key: 'meet', label: 'ミ', title: 'ミート', get: (p) => p.batting?.meet },
      { key: 'power', label: 'パ', title: 'パワー', get: (p) => p.batting?.power },
      { key: 'eye', label: '眼', title: '選球眼', get: (p) => p.batting?.eye },
      { key: 'speed', label: '走', title: '走力', get: (p) => p.physical?.speed },
      { key: 'defense', label: '守', title: '守備', get: (p) => p.fielding?.defense },
      { key: 'arm', label: '肩', title: '肩力', get: (p) => p.physical?.arm },
    ],
    stats: pickStats('batting', ['pa', 'avg', 'homeruns', 'ops']),
    statLabel: { homeruns: '本塁打' },
    // 交換案の欄に出す主な能力（狭いので3つ）
    brief: ['meet', 'power', 'defense'],
  },
  pitcher: {
    category: 'pitching',
    label: '投手',
    abilities: [
      { key: 'velocity', label: '速', title: '球速', get: (p) => p.pitching?.velocity, isVel: true },
      { key: 'control', label: '制', title: '制球', get: (p) => p.pitching?.control },
      { key: 'stamina', label: 'ス', title: 'スタミナ', get: (p) => p.pitching?.stamina, isSta: true },
      { key: 'spin', label: '回', title: '回転（変化球のキレ）', get: (p) => p.pitching?.spinRate },
    ],
    stats: pickStats('pitching', ['games', 'outs', 'era', 'whip']),
    statLabel: { games: '登板' },
    brief: ['velocity', 'control', 'stamina'],
  },
};

/** その選手を並べる表（投手の表か、野手の表か） */
export const kindOf = (player) =>
  player?.position === 'pitcher' ? 'pitcher' : 'fielder';

/** 変化球は「名前＋キレ」。直球は外す（全員が持っている）。キャンプの表と同じ書き方 */
export function pitchTypes(player) {
  return (player?.pitching?.arsenal || [])
    .filter((pitch) => pitch?.type && pitch.type !== 'straight')
    .map((pitch) => `${getPitchTypeName(pitch.type)}${pitch.level ?? ''}`)
    .join(' ');
}

/** 変化球（直球を除く持ち球）の変化量の合計。持ち球の多さと質をまとめて1つの数で比べる */
export function totalBreak(player) {
  const pitches = (player?.pitching?.arsenal || []).filter(
    (pitch) => pitch?.type && pitch.type !== 'straight',
  );
  if (!pitches.length) return null;
  return pitches.reduce((sum, pitch) => sum + (Number(pitch.level) || 0), 0);
}
