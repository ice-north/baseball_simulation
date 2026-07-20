// ============================================================
// UI表示設定 - src/game/uiSettings.js
//
// 画面スケール（ズーム）の設定を localStorage に保持する。
// 'auto' はビューポート幅に合わせて自動縮小し、情報量・レイアウトを保ったまま
// 1画面に収める（横スクロール・画面外はみ出しを防ぐ）。
// ============================================================

const KEY_SCALE = 'baseballSim_ui_scale';
export const UISCALE_EVENT = 'uiscalechange';

// 選択肢: 自動フィット / 等倍〜縮小
export const UI_SCALE_OPTIONS = ['auto', '1', '0.9', '0.85', '0.8', '0.75'];

export const UI_SCALE_LABEL = {
  auto: '自動', '1': '100%', '0.9': '90%', '0.85': '85%', '0.8': '80%', '0.75': '75%',
};

export function getUiScale() {
  try {
    const v = localStorage.getItem(KEY_SCALE);
    return v && UI_SCALE_OPTIONS.includes(v) ? v : 'auto';
  } catch { return 'auto'; }
}

export function setUiScale(v) {
  try { localStorage.setItem(KEY_SCALE, v); } catch { /* ignore */ }
  try { window.dispatchEvent(new Event(UISCALE_EVENT)); } catch { /* ignore */ }
}

// 次の選択肢へ循環（トグルボタン用）。
export function cycleUiScale() {
  const cur = getUiScale();
  const idx = UI_SCALE_OPTIONS.indexOf(cur);
  const next = UI_SCALE_OPTIONS[(idx + 1) % UI_SCALE_OPTIONS.length];
  setUiScale(next);
  return next;
}
