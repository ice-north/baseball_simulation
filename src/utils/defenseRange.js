// ============================================================
// 守備範囲（0〜1）とそのランク。一人用の守備分析（`LineupSettingScreen.jsx` の
// defense タブ）と、オンラインのスタメン設定の守備図（`src/online/FieldDiagram.jsx`）が
// 同じものを使う（別々に持つと、重みやランクを直したときに2つの画面がずれる）。
//
// 適性（0〜100）は呼ぶ側で決めて渡す。決め方が画面で違うため:
//   - 一人用: 適性の値そのもの（無ければ50）
//   - オンライン: 本職は100、ほかは適性の値（無ければ0）。サーバーの代役選びと同じ
//     （`src/online/lineupEdit.js` の `positionFitness`）
// ============================================================

/** 守備力・走力・肩を位置ごとの重みで足し、適性で割り引く（適性100→そのまま、0→半分） */
export function defenseRange(player, pos, fitness) {
  if (!player) return 0;
  const def = player.fielding?.defense || 50;
  const spd = player.physical?.speed || 50;
  const arm = player.physical?.arm || 50;
  const mult = 0.5 + (fitness / 100) * 0.5;
  let raw;
  if (['left', 'center', 'right'].includes(pos))
    raw = (def * 0.3 + spd * 0.5 + arm * 0.2) / 100;
  else if (['second', 'short'].includes(pos))
    raw = (def * 0.4 + spd * 0.3 + arm * 0.3) / 100;
  else if (pos === 'catcher') raw = (def * 0.5 + arm * 0.5) / 100;
  else raw = (def * 0.5 + spd * 0.25 + arm * 0.25) / 100;
  return raw * mult;
}

/** 守備範囲のランク（高い順）。`color` は図の印の色 */
export const DEFENSE_GRADES = [
  { min: 0.9, label: 'S', color: '#ec4899' },
  { min: 0.82, label: 'A', color: '#f87171' },
  { min: 0.7, label: 'B', color: '#fb923c' },
  { min: 0.55, label: 'C', color: '#facc15' },
  { min: 0.42, label: 'D', color: '#4ade80' },
  { min: 0.3, label: 'E', color: '#60a5fa' },
  { min: -Infinity, label: 'F', color: '#94a3b8' },
];

export const defenseGrade = (range) =>
  DEFENSE_GRADES.find((grade) => range >= grade.min);
