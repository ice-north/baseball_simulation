// 選手の経歴（`careerHistory`）を画面に出すときの決まり。一人用（`PlayerDetailModal`）と
// オンライン（`src/online/PlayerDetailBody.jsx` の `CareerLine`）で同じものを使う。
// ⚠ アプリ（`mobile/` の `PlayerSheet.kt`）は `Text.kt` の `withoutPlaceholderHighSchool` が写し。

/** 生成のときに積んでいた仮の高校の名前（出身の高校が決まる前の印） */
export const PLACEHOLDER_HIGH_SCHOOL = '高校卒';

export const isPlaceholderHighSchool = (h) => h?.type === 'highschool' && h.label === PLACEHOLDER_HIGH_SCHOOL;

/**
 * 名前の付いた高校があるときは、仮の「高校卒」を外す。
 *
 * ⚠ 出身を付ける（`fillPlayerOrigin`）とき仮の「高校卒」を外すようにした（判断3）が、それより
 *    前に作ったリーグ・セーブには「〇〇高 → 高校卒」と2つ並んだ経歴が残っている
 *    （画面では「… ← 高校卒（高校） ← 〇〇高（高校）」）。保存は直さず、出すときに外す。
 * ⚠ 高校が仮の1つだけなら残す（「高校卒」でも経歴の頭が無くなるよりよい）。
 */
export function withoutPlaceholderHighSchool(history) {
  const list = history || [];
  const named = list.some((h) => h?.type === 'highschool' && !isPlaceholderHighSchool(h));
  return named ? list.filter((h) => !isPlaceholderHighSchool(h)) : list;
}
