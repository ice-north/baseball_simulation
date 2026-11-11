import React from 'react';

// 緊急バックアップ（前回アプリが途中で止まったときの保存）を戻す欄。
// タイトル画面とセーブ＆ロード画面の2箇所に出る。
//
// ⚠ 以前は2箇所に別々に書かれていて、どちらも次の状態だった:
//   - モードが内部の名前のまま（「university」）
//   - いつの保存かが出ない（タイトル画面）
//   - 復元先のスロットにいま何が入っていて、何を上書きするのかが出ない
//   - 「破棄」が確認なしで、押すとその場で消えて戻せない
//   言葉と確認の出し方をそろえるため、1つの部品にしてある。
// ⚠ 地の色は呼ぶ側で決める（`className`）。タイトル画面は夜の球場の上、
//   セーブ＆ロードは明るい地色の上なので、同じ半透明では片方で文字が読めなくなる。

const MODE_LABEL = {
  normal: '独立リーグ',
  independent: '独立リーグ',
  corporate: '社会人野球',
  university: '大学野球',
  sandbox: '箱庭',
};

const fmtTime = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// スロット1件の中身を1行で（「2年目 5/1 法政大学」）
export const slotSummary = (slot) => {
  if (!slot) return '空き';
  const date = slot.date ? ` ${slot.date.month}/${slot.date.day}` : '';
  return `${slot.year}年目${date}${slot.teamName ? ` ${slot.teamName}` : ''}`;
};

const EmergencyBackupNotice = ({ info, saveSlots = [], onRestore, onDiscard, className = '' }) => {
  const what = [
    MODE_LABEL[info.gameMode] || null,
    info.year ? `${info.year}年目${info.date ? ` ${info.date.month}月${info.date.day}日` : ''}` : null,
    info.teamName || null,
  ].filter(Boolean).join('・');
  const when = fmtTime(info.timestamp);

  const restore = (i) => {
    const slot = saveSlots[i];
    const msg = slot
      ? `スロット${i + 1}（いまは ${slotSummary(slot)}）を緊急バックアップで上書きして、続きから遊びます。\n上書きする前の内容は、セーブ＆ロードの「1つ前のセーブに戻す」で戻せます。よろしいですか？`
      : `緊急バックアップを空いているスロット${i + 1}に入れて、続きから遊びます。よろしいですか？`;
    if (!window.confirm(msg)) return;
    onRestore(i);
  };
  const discard = () => {
    if (!window.confirm('緊急バックアップを捨てます。捨てたものは戻せません。よろしいですか？')) return;
    onDiscard();
  };

  return (
    <div className={`p-3 rounded-xl border border-amber-600/60 text-left ${className}`}>
      <div className="text-amber-300 font-bold text-sm mb-1">緊急バックアップが見つかりました</div>
      <p className="text-xs text-gray-300 mb-2">
        前回アプリが途中で止まったときの進行データです。
        {what && <><br /><span className="text-gray-100 font-bold">{what}</span></>}
        {when && <span className="tabular-nums">（{when} に保存）</span>}
      </p>
      <p className="text-xs text-gray-300 mb-1.5">戻す先のスロットを選んでください。</p>
      <div className="grid gap-1.5">
        {[0, 1, 2].map(i => (
          <button key={i} onClick={() => restore(i)}
            className="btn-warn px-3 py-1.5 rounded text-xs flex items-baseline justify-between gap-3 text-left">
            <span className="whitespace-nowrap">スロット{i + 1}へ復元</span>
            <span className="font-normal truncate min-w-0">
              {saveSlots[i] ? `上書き: ${slotSummary(saveSlots[i])}` : '空き'}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-end">
        <button onClick={discard} className="btn-secondary px-3 py-1 rounded text-xs">捨てる</button>
      </div>
    </div>
  );
};

export default EmergencyBackupNotice;
