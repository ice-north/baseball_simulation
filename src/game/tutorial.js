// ============================================================
// チュートリアル状態管理 - src/game/tutorial.js
//
// 「ヒントを表示するか」のON/OFFと、各ヒントを見たかどうかを localStorage に保持する。
// 画面側は <TutorialHint id="..."> を置くだけで、ONかつ未読のときだけヒントが出る。
// 内容は後から自由に増やせる（idと文言を足すだけ）。
// ============================================================

const KEY_ENABLED = 'baseballSim_tutorial_enabled';
const KEY_SEEN = 'baseballSim_tutorial_seen';
const EVENT = 'tutorialchange';

// チュートリアル(ヒント)表示のON/OFF。未設定時はON（初回は案内を出す）。
export function isTutorialEnabled() {
  try {
    const v = localStorage.getItem(KEY_ENABLED);
    return v === null ? true : v === '1';
  } catch { return true; }
}

export function setTutorialEnabled(on) {
  try { localStorage.setItem(KEY_ENABLED, on ? '1' : '0'); } catch { /* ignore */ }
  notify();
}

function loadSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(KEY_SEEN) || '[]')); }
  catch { return new Set(); }
}

export function isHintSeen(id) {
  return loadSeen().has(id);
}

export function markHintSeen(id) {
  try {
    const s = loadSeen();
    s.add(id);
    localStorage.setItem(KEY_SEEN, JSON.stringify([...s]));
  } catch { /* ignore */ }
  notify();
}

// 既読状態をリセット（もう一度ヒントを見たいとき）。
export function resetTutorialProgress() {
  try { localStorage.removeItem(KEY_SEEN); } catch { /* ignore */ }
  notify();
}

// ON/OFFや既読が変わったことを画面へ通知（TutorialHintが購読して即時反映）。
function notify() {
  try { window.dispatchEvent(new Event(EVENT)); } catch { /* SSR等 */ }
}

export const TUTORIAL_EVENT = EVENT;
