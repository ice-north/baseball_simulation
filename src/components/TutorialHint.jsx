// ============================================================
// チュートリアルヒント - src/components/TutorialHint.jsx
//
// 画面の要所に置く、開閉可能なヒント吹き出し。チュートリアルがONかつ
// そのヒントが未読のときだけ表示される。内容は子要素として自由に書ける。
//
//   <TutorialHint id="dateprogress-intro" title="日程を進める">
//     「1日進める」で試合が消化されます。…
//   </TutorialHint>
//
// idはヒントごとにユニークにすること（既読管理のキーになる）。
// ============================================================
import React, { useState, useEffect } from 'react';
import { isTutorialEnabled, isHintSeen, markHintSeen, setTutorialEnabled, TUTORIAL_EVENT } from '../game/tutorial.js';

export default function TutorialHint({ id, title, children, className = '' }) {
  const compute = () => isTutorialEnabled() && !isHintSeen(id);
  const [visible, setVisible] = useState(compute);

  useEffect(() => {
    const onChange = () => setVisible(compute());
    window.addEventListener(TUTORIAL_EVENT, onChange);
    return () => window.removeEventListener(TUTORIAL_EVENT, onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!visible) return null;

  return (
    <div className={`relative flex items-start gap-2.5 rounded-lg border border-cyan-500/40 bg-cyan-950/40 px-3 py-2.5 mb-3 ${className}`}>
      <span className="text-lg leading-none mt-0.5">💡</span>
      <div className="flex-1 min-w-0">
        {title && <div className="text-sm font-bold text-cyan-200 mb-0.5">{title}</div>}
        <div className="text-xs text-gray-200 leading-relaxed">{children}</div>
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={() => { markHintSeen(id); setVisible(false); }}
            className="btn-primary text-xs px-2.5 py-1 rounded"
          >
            分かった
          </button>
          <button
            onClick={() => setTutorialEnabled(false)}
            className="text-xs text-gray-300 hover:text-gray-200 underline"
          >
            ヒントを今後表示しない
          </button>
        </div>
      </div>
    </div>
  );
}
