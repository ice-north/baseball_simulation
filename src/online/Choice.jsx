import React from 'react';

// ============================================================
// PC版の「1つの設定」= 見出し＋選択肢のボタン列（今の値が押された状態）。
//
// ⚠ PCでは**2〜十数択の設定をコンボボックスにしない**。開かないと今の値以外が
//    見えず、隣へ移るのに2手かかる、という指摘を受けた（選手成績の区分と同じ）。
//    方針・采配とキャンプの練習方針で使う。
// ⚠ ボタン列には `role="group"` と見出しと同じ名前を付ける（検査・読み上げはこれで探す）。
// ============================================================
/** 1つの設定 = 見出し＋選択肢のボタン列（今の値が押された状態） */
export function Choice({ label, options, value, disabled, onChange }) {
  return (
    <div className="online-choice">
      <span className="online-choice-label">{label}</span>
      <div className="online-segments" role="group" aria-label={label}>
        {Object.entries(options).map(([key, text]) => (
          <button
            key={key}
            type="button"
            aria-pressed={String(value) === key}
            disabled={disabled}
            onClick={() => onChange(key)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

