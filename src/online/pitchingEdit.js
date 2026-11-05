// ============================================================
// PC版の投手起用（`PitchingBoard.jsx`）の編集の中身。画面と分けてあるのは、
// ハーネス（node）から直に検査するため（`tools/sim-harness/online-pitching-board-check.mjs`）。
//
// 【編集の単位】`{ starters, roles }`
//   starters … 先発ローテの順（投手のid。先頭から順に登板）
//   roles    … 全投手の役割。先発ローテの投手は先発の型、それ以外は救援の役割
// ⚠ サーバーの形（`server/lineupTactics.mjs`）と同じ決まりを、操作の側で崩さない。
//    - 先発は1〜8人（`validateLineup`）
//    - 先発ローテの投手には先発の型、ほかには救援の役割（`roleFor`）
//    - 守護神は1人まで
// ⚠ オンラインでは全投手に役割が付く（無い投手は「おまかせ」）。一人用の画面に
//    あった「未設定」の欄は、サーバーが「おまかせ」に読み替えるだけなので出さない。
// ⚠ 保存済みの先発に名簿に居ない投手（外れた・居なくなった）や、抹消中の投手が
//    残っていることがある。隠さずにそのまま持ち、その行に救援を入れ替えて直せるように
//    する（役割は持たない。役割は起用できる投手＝`isPitcher` にだけ付ける）。
// ============================================================
import { STARTER_ROLES, RELIEF_ROLES, roleFor } from './tactics.js';
import { STARTER_SKIP_FATIGUE as SKIP_FATIGUE } from './shared.js';

export const MAX_STARTERS = 8;

/** 救援の役割を、試合で使われる場面の順に（表の括りの順） */
export const RELIEF_ORDER = [
  'closer',
  'setup',
  'ace_relief',
  'long',
  'onepoint',
  'behind',
  'mopup',
  'auto_r',
];
/** 先発の型（短い説明つき）。画面の役割の選択肢と、表の括りの補足に使う */
export const STARTER_ORDER = [
  'ace',
  'complete',
  'quality',
  'short',
  'opener',
  'auto_s',
];
export const ROLE_HINT = {
  ace: '7〜8回を任せる',
  complete: 'スタミナの限界まで',
  quality: '5〜6回で交代',
  short: '3〜4回で継投',
  opener: '初回〜2回で継投',
  auto_s: 'AIが判断',
  closer: '9回のリード',
  setup: '8回の僅差',
  ace_relief: '接戦の中盤から',
  long: '複数イニング',
  onepoint: '左打者の対策',
  behind: '負けている展開',
  mopup: '大差の敗戦処理',
  auto_r: 'AIが判断',
};
export const roleLabel = (role) =>
  STARTER_ROLES[role] || RELIEF_ROLES[role] || role;
export const isStarterRole = (role) => Object.hasOwn(STARTER_ROLES, role);

/** 先発の投手で、この疲労以上はその日の登板を飛ばす（サーバーと同じ値。`shared.js`） */
export const STARTER_SKIP_FATIGUE = SKIP_FATIGUE;
/**
 * 救援は、この疲労以上だと原則として試合で使われない（`src/game/autoSimulation.js` の
 * `fatigueGate`。救援が全員この値を超えているときだけ、一番疲れていない投手が使われる）
 */
export const RELIEF_REST_FATIGUE = 50;

export const isPitcher = (p) =>
  !!p && p.position === 'pitcher' && p.isActive !== false;

/**
 * 保存されている編成（view.lineup）と名簿から編集の形を作る。
 * ⚠ 名簿に居ない先発も外さない（外すと崩れた保存が隠れ、保存の検査にも出ない）。
 */
export function pitchingFromLineup(lineup, roster) {
  const pitchers = (roster || []).filter(isPitcher);
  const starters = [...new Set(lineup?.starters || [])];
  const roles = Object.fromEntries(
    pitchers.map((p) => [
      p.id,
      roleFor(lineup?.pitcherRoles?.[p.id], starters.includes(p.id)),
    ]),
  );
  return { starters, roles };
}

export const samePitching = (a, b) =>
  a.starters.length === b.starters.length &&
  a.starters.every((id, i) => id === b.starters[i]) &&
  Object.keys(a.roles).length === Object.keys(b.roles).length &&
  Object.entries(a.roles).every(([id, role]) => b.roles[id] === role);

export const planFromPitching = (state) => ({
  starters: [...state.starters],
  pitcherRoles: { ...state.roles },
});

/** 先発の順を動かす（間はずれる）。ドラッグ用 */
export function moveStarter(state, from, to) {
  const { starters } = state;
  if (
    from === to ||
    starters[from] === undefined ||
    to < 0 ||
    to >= starters.length
  )
    return state;
  const next = [...starters];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return { ...state, starters: next };
}

/** 先発の順を入れ替える。クリック（行を選んで別の行）用 */
export function swapStarters(state, a, b) {
  const { starters } = state;
  if (a === b || starters[a] === undefined || starters[b] === undefined)
    return state;
  const next = [...starters];
  [next[a], next[b]] = [next[b], next[a]];
  return { ...state, starters: next };
}

/**
 * 役割を変える。先発の型にすれば先発ローテの末尾（`at` があればその位置）へ入り、
 * 救援の役割にすればローテから外れる。
 * - 先発が `MAX_STARTERS` 人いるときは先発へ入れない（変えない）
 * - 最後の1人の先発は救援にできない（変えない）
 * - 守護神は1人。新しく守護神にした投手の前の役割を、前の守護神へ渡す
 *   （救援どうしなら入れ替え。先発から来たときは前の守護神は「おまかせ」）
 */
export function setRole(state, id, role, at = null) {
  const current = state.roles[id];
  if (current === undefined) {
    // 名簿に居ない先発: 救援の側へ移す操作は、ローテから外すだけ（役割は持たない）
    if (
      !isStarterRole(role) &&
      state.starters.includes(id) &&
      state.starters.length > 1
    )
      return { ...state, starters: state.starters.filter((s) => s !== id) };
    return state;
  }
  if (current === role && at === null) return state;
  const toStarter = isStarterRole(role);
  const wasStarter = state.starters.includes(id);
  let starters = state.starters;
  if (toStarter && !wasStarter) {
    if (starters.length >= MAX_STARTERS) return state;
    starters = [...starters];
    starters.splice(at === null ? starters.length : at, 0, id);
  } else if (!toStarter && wasStarter) {
    if (starters.length <= 1) return state;
    starters = starters.filter((s) => s !== id);
  }
  const roles = { ...state.roles, [id]: role };
  if (role === 'closer')
    for (const [other, r] of Object.entries(roles))
      if (r === 'closer' && String(other) !== String(id))
        roles[other] =
          wasStarter || isStarterRole(current) ? 'auto_r' : current;
  return { starters, roles };
}

/**
 * 2人の投手の持ち場を入れ替える（行を選んで別の行を押す・行に落とす）。
 * - 先発どうし → 登板順だけ入れ替える（先発の型はその投手のまま）
 * - 先発と救援 → 救援の投手がその登板順と先発の型を引き継ぎ、先発の投手が救援の役割を引き継ぐ
 *   （スタメン設定の交代と同じ。先発の人数・守護神の人数は変わらない）
 * - 救援どうし → 役割を入れ替える
 */
export function swapPitchers(state, a, b) {
  if (String(a) === String(b)) return state;
  const ia = state.starters.indexOf(a);
  const ib = state.starters.indexOf(b);
  if (ia >= 0 && ib >= 0) return swapStarters(state, ia, ib);
  const missingA = state.roles[a] === undefined;
  const missingB = state.roles[b] === undefined;
  if (missingA && missingB) return state;
  if (missingA || missingB) {
    // 名簿に居ない先発の行へ救援を入れる: その登板順に入り、先発の「おまかせ」になる
    const [missing, other] = missingA ? [a, b] : [b, a];
    if (!state.starters.includes(missing)) return state;
    return {
      starters: state.starters.map((id) => (id === missing ? other : id)),
      roles: { ...state.roles, [other]: 'auto_s' },
    };
  }
  const starters =
    ia >= 0 || ib >= 0
      ? state.starters.map((id) => (id === a ? b : id === b ? a : id))
      : state.starters;
  return {
    starters,
    roles: { ...state.roles, [a]: state.roles[b], [b]: state.roles[a] },
  };
}

/** ローテの末尾（`at` があればその位置）へ入れる。ローテの見出しへ落としたとき */
export function insertStarter(state, id, at) {
  if (state.starters.includes(id)) {
    // ローテに居る投手は動かすだけ（末尾を指したら最後へ）
    const to = Math.max(0, Math.min(at, state.starters.length - 1));
    return moveStarter(state, state.starters.indexOf(id), to);
  }
  return setRole(state, id, 'auto_s', at);
}

/** 救援を役割ごとに括る（試合で使われる場面の順） */
export function reliefGroups(state, roster) {
  const pitchers = (roster || []).filter(isPitcher);
  return RELIEF_ORDER.map((role) => ({
    role,
    players: pitchers.filter(
      (p) => !state.starters.includes(p.id) && state.roles[p.id] === role,
    ),
  }));
}

/** 保存できない形の理由（無ければ空）。操作では崩れないが、保存済みが崩れていることがある */
export function pitchingProblems(state, roster) {
  const problems = [];
  const ids = new Set((roster || []).filter(isPitcher).map((p) => p.id));
  if (!state.starters.length) problems.push('先発投手を1人以上入れてください');
  if (state.starters.length > MAX_STARTERS)
    problems.push(`先発投手は${MAX_STARTERS}人までです`);
  if (state.starters.some((id) => !ids.has(id)))
    problems.push('名簿に居ない・起用できない投手が先発に入っています');
  if (Object.values(state.roles).filter((r) => r === 'closer').length > 1)
    problems.push('守護神は1人までです');
  return problems;
}
