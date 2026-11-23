// 新しい見た目（試作）: 目次（PC の左メニュー・スマホの下の帯とホームの近道）の小さな絵。
//   字だけの目次は管理画面に見える（いしだ依頼 2026-11-24「アウトゲームの見た目をさらに」）。
// ⚠ 入のときだけ描く。切のときは何も出さない（目次は今までどおり字だけ）。
// ⚠ 絵は線だけ（色は字の色を受け継ぐ `currentColor`）。24×24 のますに線を引く手順をここに持つ。
//    アプリは下の帯に自前の絵があるので写しは無い（Web だけ）。
import React from 'react';
import { useLook } from './LookContext.jsx';

/** ページの id → 線の道のり（SVG の path の `d`） */
const ICONS = {
  // 家
  today: 'M4 11l8-7 8 7 M6.5 9.5V20h11V9.5 M10 20v-5.5h4V20',
  // 棒グラフ（チーム分析）
  analysis: 'M3 20h18 M6.5 20v-7 M12 20V5 M17.5 20v-10',
  // 開いた本（球団史・記録）
  chronicle: 'M12 6.5C10 5 7 4.5 4 4.5v13c3 0 6 .5 8 2 2-1.5 5-2 8-2v-13c-3 0-6 .5-8 2z M12 6.5v13',
  // 優勝カップ（リーグ史）
  league: 'M8 4h8v5a4 4 0 0 1-8 0z M8 5.5H5c0 2.5 1.2 4 3.2 4.3 M16 5.5h3c0 2.5-1.2 4-3.2 4.3 M12 13v4 M8.5 20h7 M9.5 17h5',
  // スコアボード（試合結果）
  games: 'M3 6h18v12H3z M3 10.5h18 M12 6v12',
  // 打順の表（スタメン設定）
  lineup: 'M9.5 6h10.5 M9.5 12h10.5 M9.5 18h10.5 M4.5 5v2 M4 11h1.2v2H4 M4 17h1.4l-1.4 2h1.6',
  // ボール（投手起用）
  rotation: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M6.2 5.2c2.6 3.6 2.6 10 0 13.6 M17.8 5.2c-2.6 3.6-2.6 10 0 13.6',
  // 作戦板（方針・采配）
  tactics: 'M8.5 5H6v15h12V5h-2.5 M9 3.5h6v3H9z M9 11l2.5 2.5 M11.5 11L9 13.5 M14 16.5a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 0 0-2.6 0z M13.5 12l-2 3',
  // こよみ（予告先発）
  starters: 'M4 6h16v14H4z M4 10.5h16 M8 3.5v4 M16 3.5v4 M8.5 15.5l2.2 2 4.3-4',
  // 人（指導者）
  staff: 'M12 4.5a3.3 3.3 0 1 0 0 6.6a3.3 3.3 0 0 0 0-6.6z M5 20c0-3.8 3-6 7-6s7 2.2 7 6 M8.2 6.2h7.6',
  // 確かめの印の並び（現在の手続き）
  decisions: 'M4 6.5l2 2 3.2-4 M12.5 7H20 M4 16l2 2 3.2-4 M12.5 16.5H20',
  // 入れ替えの矢印（トレード）
  transfer: 'M4 8h15 M15.5 4.5L19 8l-3.5 3.5 M20 16H5 M8.5 12.5L5 16l3.5 3.5',
  // 旗（練習試合）
  exhibition: 'M6 21V4 M6 5h12l-2.5 3.8L18 12.5H6',
  // つまみ（リーグ管理）
  admin: 'M4 7h9 M17 7h3 M15 5v4 M4 17h3 M11 17h9 M9 15v4',
  // 人の並び（選手）
  players: 'M9 5a3 3 0 1 0 0 6a3 3 0 0 0 0-6z M3 20c0-3.3 2.6-5.2 6-5.2s6 1.9 6 5.2 M16 5.5a2.6 2.6 0 0 1 0 5.2 M17.5 15.2c2.2.6 3.5 2.2 3.5 4.8',
  // 新聞（リーグ便り）
  news: 'M4 5h13v15H6a2 2 0 0 1-2-2z M17 9h3v9a2 2 0 0 1-2 2 M7.5 9h6 M7.5 12.5h6 M7.5 16h4',
  // 三本線（その他）
  menu: 'M4 7h16 M4 12h16 M4 17h16',
  // 戻る矢印
  back: 'M20 12H5 M11 6l-6 6 6 6',
};

export const hasNavIcon = (id) => Object.hasOwn(ICONS, id);

/** 目次の絵。入のときだけ出す */
export function NavIcon({ id, size = 16 }) {
  const { on } = useLook();
  if (!on || !hasNavIcon(id)) return null;
  return (
    <svg
      className="online-nav-icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[id]} />
    </svg>
  );
}

/**
 * スマホの下の帯の印: 入のときは絵と小さな字、切のときは今までの字（← ⌂ ☰）
 * @param glyph 切のときの字
 */
export function NavGlyph({ id, glyph, label }) {
  const { on } = useLook();
  if (!on || !hasNavIcon(id)) return glyph;
  return (
    <>
      <NavIcon id={id} size={20} />
      {label && <small className="online-nav-label">{label}</small>}
    </>
  );
}
