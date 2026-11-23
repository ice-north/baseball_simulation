// 新しい見た目（試作）: 説明のふきだしを自前にする（いしだ依頼 2026-11-24）。
//   ブラウザ標準のふきだし（`title`）は出るまで1秒ほどかかり、OS の見た目（白や黄色の小窓）で出る。
//   画面に約180か所あるので、1か所ずつ手を入れず、乗せたときに `title` を預かって自前で出す。
//
// 作り: `title` の付いた要素に乗ったら、`title` を外して（外さないとブラウザのふきだしも出る）
//   `data-look-tip` に預け、少し待ってから要素の上か下に出す。離れたら `title` を戻す。
// ⚠ 入のときだけ、乗せられる端末（マウス）だけ。スマホは今までどおり（もともと `title` は出ない）。
// ⚠ 小窓（`dialog` の showModal）は画面のいちばん上の層なので、ふきだしは乗った要素のいる小窓の中に置く
//    （`.online` の直下に置くと小窓の裏に隠れる）。
// ⚠ 預かっている間に React が `title` を付け直したら、戻すときに上書きしない（新しい字が正しい）。
// ⚠ 見えている字と同じ説明（切れていない名前など）は出さない。同じ字が二重に出るだけになる。
import { useEffect } from 'react';

const DELAY = 350;
const GAP = 8;

/** @param root 見張る画面の外枠（`.online`）。出るまでは null */
export function useLookTips(on, root) {
  useEffect(() => {
    const doc = globalThis.document;
    if (!on || !root || !doc) return undefined;
    if (!globalThis.matchMedia?.('(hover: hover)').matches) return undefined;
    const tip = doc.createElement('div');
    tip.className = 'online-look-tip';
    tip.setAttribute('role', 'tooltip');
    let target = null;
    let timer = 0;
    const hide = () => {
      clearTimeout(timer);
      tip.remove();
      if (!target) return;
      const text = target.dataset.lookTip;
      if (text != null && !target.hasAttribute('title')) target.setAttribute('title', text);
      delete target.dataset.lookTip;
      target = null;
    };
    const show = () => {
      if (!target?.isConnected) return hide();
      tip.textContent = target.dataset.lookTip || '';
      (target.closest('dialog') || root).append(tip);
      const at = target.getBoundingClientRect();
      const box = tip.getBoundingClientRect();
      const width = doc.documentElement.clientWidth;
      const height = doc.documentElement.clientHeight;
      // 上に置けなければ下。左右は画面からはみ出さないように寄せる
      const above = at.top - GAP - box.height >= 4;
      const top = above ? at.top - GAP - box.height : Math.min(height - box.height - 4, at.bottom + GAP);
      const left = Math.max(4, Math.min(width - box.width - 4, at.left + at.width / 2 - box.width / 2));
      tip.style.top = `${Math.round(top)}px`;
      tip.style.left = `${Math.round(left)}px`;
      return undefined;
    };
    const over = (event) => {
      const el = event.target.closest?.('[title], [data-look-tip]');
      if (el === target) return;
      hide();
      if (!el || !root.contains(el)) return;
      const text = el.getAttribute('title');
      if (!text) return;
      // 見えている字と同じ説明は出さない（名前の欄など。切れて「…」になっているときだけ出す）
      if (text === el.textContent.trim() && el.scrollWidth <= el.clientWidth) return;
      target = el;
      el.dataset.lookTip = text;
      el.removeAttribute('title');
      timer = setTimeout(show, DELAY);
    };
    // 押した・送った・キーを打ったら消す（ブラウザのふきだしと同じ）
    root.addEventListener('mouseover', over);
    root.addEventListener('mouseleave', hide);
    root.addEventListener('mousedown', hide);
    globalThis.addEventListener('scroll', hide, true);
    globalThis.addEventListener('keydown', hide, true);
    return () => {
      hide();
      root.removeEventListener('mouseover', over);
      root.removeEventListener('mouseleave', hide);
      root.removeEventListener('mousedown', hide);
      globalThis.removeEventListener('scroll', hide, true);
      globalThis.removeEventListener('keydown', hide, true);
    };
  }, [on, root]);
}
