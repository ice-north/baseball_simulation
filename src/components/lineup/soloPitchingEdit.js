// ============================================================
// 一人用の投手起用の表（`SoloPitchingBoard.jsx`）の編集の中身。
// 画面と分けてあるのは、ハーネス（node）から直に検査するため
// （`tools/sim-harness/solo-pitching-board-check.mjs`）。
//
// 【流用元】オンラインPC版の投手起用（`src/online/PitchingBoard.jsx`・`pitchingEdit.js`）。
//   編集の単位も同じ `{ starters, roles }`。操作（入れ替え・役割の選び直し・見出しへ移す）は
//   `pitchingEdit.js` の関数をそのまま使う。
// 【オンラインとの違い】
//   - **「役割なし」がある**（`NO_ROLE`）。一人用の以前の画面の「控え・未設定」。役割の無い投手は
//     救援の顔ぶれ（`middleRelievers` など）に入らず、ほかに投げる投手が居ないときだけ投げる
//     （`src/game/autoSimulation.js` の「緊急登板」）。オンラインはサーバーが「おまかせ」に
//     読み替えるので無い。
//   - **野手は救援にだけ加えられる**（二刀流）。一人用の先発選び（`generateAILineup`）は
//     投手登録の選手（`isPitcherPlayer`）からしか選ばないので、野手を先発ローテに入れても
//     投げない。先発にしたい野手は、選手の詳細の「ポジション変更」で投手登録にする。
//   - 編集は**その場で `team` に書く**（保存ボタンは無い。元に戻すは `LineupSettingContent`
//     の履歴が受け持つ。`pitchingRotation` は丸ごと控えに入っている）。
// ⚠ 書くときは**試合の側が読む古い形の配列もそろえる**（`middleRelievers`・`setupMen`・
//    `closer`・`relievers`）。自動試合の救援選び・AI監督はこれを読む（`autoSimulation.js`・
//    `cpuTactics.js`）。並べ方はサーバーの保存（`server/lineupTactics.mjs`）と同じ。
// ============================================================

import { STARTER_ROLES, RELIEF_ROLES } from '../../online/tactics.js';
import {
  MAX_STARTERS,
  isPitcher,
  isStaffableFielder,
  isStarterRole,
  onStaff,
  roleLabel,
  ROLE_HINT,
} from '../../online/pitchingEdit.js';

/** 役割なし（救援の顔ぶれに入らない。ほかに投手が居ないときだけ投げる） */
export const NO_ROLE = 'none';
export const soloRoleLabel = (role) => (role === NO_ROLE ? '役割なし' : roleLabel(role));
export const soloRoleHint = (role) =>
  role === NO_ROLE ? 'ほかに投げる投手が居ないときだけ' : ROLE_HINT[role];

/** 保存されている役割を、先発か救援かに合う役割に読む（合わなければ「おまかせ」） */
function savedRole(rotation, id, starter) {
  const raw = rotation?.pitcherRoles?.[id];
  if (starter) return Object.hasOwn(STARTER_ROLES, raw) ? raw : 'auto_s';
  if (Object.hasOwn(RELIEF_ROLES, raw)) return raw;
  // 役割の無い古い保存: 古い形の配列から読む（サーバーの `lineupTactics.mjs` と同じ順）
  if (rotation?.closer === id) return 'closer';
  if ((rotation?.setupMen || []).includes(id)) return 'setup';
  if ((rotation?.middleRelievers || []).includes(id)) return 'auto_r';
  return NO_ROLE;
}

/** 投手起用に入っている野手か（加えた野手＝救援の役割か古い形の配列に居る） */
function fielderOnStaff(rotation, p) {
  if (!isStaffableFielder(p)) return false;
  const raw = rotation?.pitcherRoles?.[p.id];
  return (
    Object.hasOwn(RELIEF_ROLES, raw) ||
    rotation?.closer === p.id ||
    (rotation?.setupMen || []).includes(p.id) ||
    (rotation?.middleRelievers || []).includes(p.id)
  );
}

/**
 * 球団（`team.pitchingRotation` と名簿）から編集の形 `{ starters, roles }` を作る。
 * ⚠ 名簿に居ない・抹消中の先発も外さない（オンラインと同じ。行を出して入れ替えで直せるように）。
 * ⚠ 以前の一人用の画面は**役割で先発を数えていた**ので、先発の役割なのにローテの配列に
 *    居ない投手がいることがある。その画面で先発に見えていたので、ローテの最後へ足す。
 */
export function pitchingFromTeam(team) {
  const rotation = team?.pitchingRotation || {};
  const roster = team?.players || [];
  const starters = [...new Set(rotation.starters || [])];
  for (const p of roster) {
    if (
      isPitcher(p) &&
      !starters.includes(p.id) &&
      Object.hasOwn(STARTER_ROLES, rotation.pitcherRoles?.[p.id]) &&
      starters.length < MAX_STARTERS
    )
      starters.push(p.id);
  }
  const roles = {};
  for (const p of roster) {
    if (p.isActive === false) continue;
    const starter = starters.includes(p.id);
    if (isPitcher(p)) roles[p.id] = savedRole(rotation, p.id, starter);
    // 野手は救援にだけ入る（先発に居る野手は崩れた保存。役割は持たせず、行を出して直させる）
    else if (!starter && fielderOnStaff(rotation, p)) roles[p.id] = savedRole(rotation, p.id, false);
  }
  return { starters, roles };
}

/**
 * 編集の形を球団に書く。
 * ⚠ 抹消中の選手の役割は残す（戻ったときに前の役割で入るように。名簿の画面の外のこと）。
 */
export function writePitching(team, state) {
  if (!team.pitchingRotation) team.pitchingRotation = {};
  const rotation = team.pitchingRotation;
  const roster = team.players || [];
  const kept = Object.fromEntries(
    Object.entries(rotation.pitcherRoles || {}).filter(([id]) =>
      roster.some((p) => String(p.id) === id && p.isActive === false),
    ),
  );
  const staff = roster.filter((p) => p.isActive !== false && onStaff(state, p.id));
  // ⚠ 抹消中の救援も、役割のとおり古い形の配列に入れたまま書く。外すと、戻ったとき表は
  //    「クローザー」と出るのに試合の側（`rotation.closer` を読む）にはクローザーが居ない。
  //    試合の側は抹消中の選手を使わない（`canEnterRelief` は `isActive` を見る）
  // ⚠ 抹消中にほかの投手をクローザーにしたら、抹消中のクローザーは「おまかせ」に降ろす
  //    （戻ったときにクローザーが2人にならないように）
  const activeCloser = staff.some(
    (p) => !state.starters.includes(p.id) && state.roles[p.id] === 'closer',
  );
  for (const [id, role] of Object.entries(kept))
    if (role === 'closer' && activeCloser) kept[id] = 'auto_r';
  const roleOf = (p) => (p.isActive === false ? kept[String(p.id)] : state.roles[p.id]);
  const keptRelief = (p) =>
    p.isActive === false &&
    Object.hasOwn(RELIEF_ROLES, kept[String(p.id)]) &&
    !state.starters.includes(p.id);
  const relievers = roster.filter(
    (p) =>
      (staff.includes(p) && !state.starters.includes(p.id) && roleOf(p) !== NO_ROLE) ||
      keptRelief(p),
  );
  const roles = { ...kept };
  for (const p of staff) if (roleOf(p) !== NO_ROLE) roles[p.id] = roleOf(p);
  rotation.starters = [...state.starters];
  rotation.pitcherRoles = roles;
  rotation.relievers = relievers.map((p) => p.id);
  rotation.middleRelievers = relievers
    .filter((p) => !['setup', 'closer'].includes(roleOf(p)))
    .map((p) => p.id);
  rotation.setupMen = relievers.filter((p) => roleOf(p) === 'setup').map((p) => p.id);
  rotation.closer = relievers.find((p) => roleOf(p) === 'closer')?.id ?? null;
  if (rotation.starters.length && (rotation.currentStarterIndex || 0) >= rotation.starters.length)
    rotation.currentStarterIndex = 0;
}

/** 次の試合の先発（試合の側と同じく `currentStarterIndex` の位置） */
export function nextStarterIdOf(team) {
  const rotation = team?.pitchingRotation;
  const starters = rotation?.starters || [];
  if (!starters.length) return null;
  return starters[(rotation.currentStarterIndex || 0) % starters.length];
}

/** 役割を持たない投手（「役割なし」の括り） */
export function unassignedPitchers(state, roster) {
  return (roster || []).filter(
    (p) =>
      p.isActive !== false &&
      onStaff(state, p.id) &&
      !state.starters.includes(p.id) &&
      state.roles[p.id] === NO_ROLE,
  );
}

/** その役割を選べるか（選べないときは理由。選べるときは null） */
export function roleBlocked(state, player, role) {
  const starter = state.starters.includes(player.id);
  if (isStarterRole(role)) {
    if (player.position !== 'pitcher')
      return '野手は先発に入れられません（選手の詳細の「ポジション変更」で投手登録にすると入れられます）';
    if (!starter && state.starters.length >= MAX_STARTERS) return `先発は${MAX_STARTERS}人までです`;
    return null;
  }
  if (starter && state.starters.length <= 1) return '先発が1人も居なくなります';
  return null;
}

/** 一人用で足りない形（崩れてはいないが試合で困るもの）。表の上に出す注意 */
export function pitchingNotes(state, roster) {
  const notes = [];
  const relief = (roster || []).filter(
    (p) => p.isActive !== false && onStaff(state, p.id) && !state.starters.includes(p.id),
  );
  if (!relief.some((p) => state.roles[p.id] === 'closer')) notes.push('クローザーが居ません');
  if (state.starters.length && state.starters.length < 4)
    notes.push(`先発が${state.starters.length}人です（5〜6人が目安）`);
  return notes;
}

/** 先発の枠に入っていて、試合で投げられない選手（名簿に居ない・抹消中・野手） */
export function vacantStarterIds(state, roster) {
  const ok = new Set(
    (roster || [])
      .filter((p) => isPitcher(p) && !!p.pitching && onStaff(state, p.id))
      .map((p) => p.id),
  );
  return state.starters.filter((id) => !ok.has(id));
}

// 空いた先発の枠へ回す順: 役割なし → 救援の「おまかせ」→ ロング・敗戦処理などの救援。
// ⚠ セットアッパー・クローザーは動かさない（勝ち試合の終盤が空くと、気づかないまま崩れる）
const FILL_FROM = [NO_ROLE, 'auto_r', 'long', 'mopup', 'behind', 'onepoint', 'ace_relief'];

/**
 * 空いた先発の枠（`vacantStarterIds`）を、救援・役割なしの投手で埋める（同じ登板順に入る）。
 * 埋める投手が居ない枠はローテから外す（先発が1人も居なくならないかぎり）。
 * 投手起用の表の「空いた枠を自動で埋める」ボタン。⚠ 空いていない枠・救援の役割は変えない
 * （以前の「自動設定」は全部を組み直して、どう変わるか分からなかった。2026-11-04 いしだ）。
 */
export function fillVacantStarters(state, roster) {
  const vacant = vacantStarterIds(state, roster);
  if (!vacant.length) return state;
  const rank = (role) => {
    const i = FILL_FROM.indexOf(role);
    return i < 0 ? FILL_FROM.length : i;
  };
  const pool = (roster || [])
    .filter(
      (p) =>
        isPitcher(p) &&
        !!p.pitching &&
        onStaff(state, p.id) &&
        !state.starters.includes(p.id) &&
        rank(state.roles[p.id]) < FILL_FROM.length,
    )
    .sort(
      (a, b) =>
        rank(state.roles[a.id]) - rank(state.roles[b.id]) ||
        (b.pitching.stamina || 0) - (a.pitching.stamina || 0),
    );
  let starters = [...state.starters];
  const roles = { ...state.roles };
  for (const id of vacant) {
    const next = pool.shift();
    if (next) {
      starters = starters.map((s) => (s === id ? next.id : s));
      roles[next.id] = 'auto_s';
    } else if (starters.length > 1) {
      starters = starters.filter((s) => s !== id);
    }
  }
  return { ...state, starters, roles };
}
