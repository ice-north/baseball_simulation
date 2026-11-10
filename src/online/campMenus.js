import {
  TRAINING_MENUS,
  SUB_TRAINING_MENUS,
  menuFitsPlayer,
  subMenuFitsPlayer,
} from '../season/campTraining.js';
import { CAMP_MENUS, CAMP_SUB_MENUS } from './shared.js';

// ============================================================
// キャンプで選べる練習（オンライン）。画面（`CampPlanner.jsx`）と、アプリの検査の
// 期待値（`mobile/tools/expect-logic.mjs`）・キャンプの検査が同じものを読む。
//
// ⚠ **JSX の外に置く**。node から読めない `CampPlanner.jsx` に置いていた間は、
//    期待値を作る道具が同じ判定を写して持っていて、片方だけ直す恐れがあった。
// ⚠ メニューの表は一人用と**同じものを読む**（`TRAINING_MENUS` /
//    `SUB_TRAINING_MENUS`）。出すのは `CAMP_MENUS` / `CAMP_SUB_MENUS` に
//    載っているものだけ（`TRAINING_MENUS` にはオンラインで動かないものがある）。
// ⚠ アプリの写しは `mobile/shared/.../Camp.kt`（`menusFor` / `subMenusFor` /
//    `clampMenu` / `clampSub`）。
// ============================================================

/** 投手に出すメイン練習／野手に出すメイン練習 */
export const menusFor = (isPitcher) =>
  Object.entries(TRAINING_MENUS).filter(
    ([key]) =>
      CAMP_MENUS.includes(key) &&
      menuFitsPlayer(key, { position: isPitcher ? 'pitcher' : 'catcher' }),
  );

/**
 * その選手に出すサブ練習。
 * ⚠ **効かないものを出さない**。変化球練習・新球種習得・スピン解析は投手だけ、
 *    Cリード学習は捕手だけ。出すと、選べるのにそのクールが丸ごと無駄になる。
 */
export const subMenusFor = (player) =>
  Object.entries(SUB_TRAINING_MENUS).filter(
    ([key]) => CAMP_SUB_MENUS.includes(key) && subMenuFitsPlayer(key, player),
  );

/**
 * ⚠ 受け取れないメニュー・守備位置に合わないメニューに落ちたら既定へ戻す。
 *    方針から引いた結果は、野手に投球系が出ることがある（選択肢に無いので
 *    一覧には「打撃練習」と出るのに、サーバーは球速練習で処理していた）
 */
export const clampMenu = (key, player) =>
  CAMP_MENUS.includes(key) && menuFitsPlayer(key, player)
    ? key
    : player.position === 'pitcher'
      ? 'control'
      : 'batting';

/** サブ練習も同じく、出せない・合わないものに落ちたら基礎体力へ */
export const clampSub = (key, player) =>
  CAMP_SUB_MENUS.includes(key) && subMenuFitsPlayer(key, player)
    ? key
    : 'physique';
