// ============================================================
// スマホの編成（`TapLineup.jsx`。**2回のタップで入れ替える表**）の編集の中身。
// 画面(JSX)と分けてあるのは、ハーネス（node）から直に検査するため
// （`tools/sim-harness/online-lineup-port-check.mjs`）。
//
// 【操作】1回目に押したもので「何を入れ替えるか」が決まり、2回目に相手を押す。
//   - 選手の行 → ほかのスタメン: 打順を入れ替える（守備位置は選手に付いたまま）
//   - 守備位置の札 → ほかのスタメン: 守備位置を入れ替える（打順はそのまま）
//   - スタメン → 控え／控え → スタメン: 交代（控えがその打順・守備位置にそのまま入る）
//   - 同じものをもう一度: 選ぶのをやめる。同じ行の札と名前を押し替えたら選ぶものを替える。
//     控え → 別の控え: 選び直し
// ⚠ 入れ替えの中身は**PCのスタメン設定と同じ関数**（`lineupEdit.js`）。どの操作も
//    「8人が8つの守備位置を1つずつ守る」形を崩さない（保存できない形を経由しない）。
// ⚠ 投手は9番で固定（DHなし。サーバーの `validateLineup` は野手8人ちょうど）。ここでは扱わない。
//
// 【編集の入れ物】`{ stack, index, base, baseLineup, revision }`。`stack[index]` が今の打順、
//   `base` が編集を始めたときの打順、`baseLineup` が保存で添える起点（サーバーの編成）。
//   下書き（`Drafts` の `lineup.order`）に写して、タブの移動・再読み込みをまたいで残す。
//   スマホを横にしてPCの画面に切り替わるときの受け渡しは `lineup.full`（`lineupBridge.js`）。
// ============================================================

import {
  orderFromLineup,
  battingOrderFromOrder,
  sameOrder,
  swapOrder,
  swapPositions,
  replaceStarter,
  positionFitness,
  canPlayField,
  LOW_FITNESS,
  REST_FATIGUE,
  FRESH_FATIGUE,
} from './lineupEdit.js';
import { restoreFromFullLineup, sameValue } from './lineupBridge.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const HISTORY_LIMIT = 50;

/** view の保存済みの打順から、編集していない入れ物を作る */
export function buildTapDraft(view) {
  const order = orderFromLineup(view.lineup);
  return {
    stack: [order],
    index: 0,
    base: order,
    baseLineup: clone(view.lineup || {}),
    revision: view.revision ?? null,
  };
}

export const tapValue = (draft) => draft.stack[draft.index];
export const tapDirty = (draft) => !sameOrder(tapValue(draft), draft.base);

const validDraft = (draft) =>
  !!draft &&
  Array.isArray(draft.stack) &&
  draft.stack.length > 0 &&
  Number.isInteger(draft.index) &&
  draft.index >= 0 &&
  draft.index < draft.stack.length &&
  draft.stack.every((order) => Array.isArray(order) && order.length === 8) &&
  Array.isArray(draft.base) &&
  !!draft.baseLineup;

/**
 * 画面を開いたときの入れ物を決める。
 * - `kept`（`lineup.full`）に保存していない打順の編集があれば、それを使う。
 *   PCのスタメン設定で編集していてスマホに切り替わった・PCへ渡した編集が戻ってきた、のどちらか。
 *   自分の下書き（`saved`）と同じ編集なら、下書き（元に戻すの履歴つき）のまま使う
 * - 無ければ自分の下書き（タブの移動・再読み込み）。それも無ければ最新の view から
 */
export function startTapDraft(view, saved, kept) {
  const handed = restoreFromFullLineup(kept);
  // ⚠ 下書きに添えた印（`dirty`。閉じる前の確認に使う）は入れ物の中身ではないので落とす
  const own = validDraft(saved) ? { ...saved } : null;
  if (own) delete own.dirty;
  const hasOwn = !!own;
  if (handed) {
    const base = orderFromLineup(handed.base);
    const edited = orderFromLineup(handed.lineup);
    if (
      hasOwn &&
      sameOrder(tapValue(own), edited) &&
      sameValue(own.baseLineup, handed.base)
    )
      return own;
    if (!sameOrder(base, edited))
      return {
        stack: [base, edited],
        index: 1,
        base,
        baseLineup: clone(handed.base),
        revision: null,
      };
  }
  return hasOwn ? own : buildTapDraft(view);
}

/**
 * 保存していない間は、最新の view（他の端末・締め切りでの変更）で作り直す。
 * ⚠ 編集しているあいだは作り直さない（作り直すと編集が消える。食い違いは保存のときにサーバーが見る）。
 *    打順が変わっていなければ、元に戻すの履歴を残して起点だけ最新にする（PCの `useBoardHistory` と同じ）
 */
export function syncTapDraft(draft, view) {
  if (tapDirty(draft) || draft.revision === (view.revision ?? null))
    return draft;
  const next = buildTapDraft(view);
  if (sameOrder(next.base, tapValue(draft)))
    return {
      ...draft,
      base: next.base,
      baseLineup: next.baseLineup,
      revision: next.revision,
    };
  return next;
}

/** 編集を1手積む（同じ打順なら積まない） */
export function commitTap(draft, next) {
  if (sameOrder(next, tapValue(draft))) return draft;
  const stack = [...draft.stack.slice(0, draft.index + 1), next].slice(
    -HISTORY_LIMIT,
  );
  return { ...draft, stack, index: stack.length - 1 };
}

export const undoTap = (draft) =>
  draft.index > 0 ? { ...draft, index: draft.index - 1 } : draft;

/** 保存できたら、保存した打順を新しい起点にする（履歴も切る） */
export function savedTap(draft, view, battingOrder) {
  const value = tapValue(draft);
  return {
    stack: [value],
    index: 0,
    base: value,
    baseLineup: { ...draft.baseLineup, battingOrder },
    // ⚠ 保存した直後の view はまだ古い。古い番号のままにして、新しい view が届いたら
    //    `syncTapDraft` で起点を最新にする（打順は同じなので作り直さない）
    revision: view.revision ?? null,
  };
}

/** 保存で送る打順（PCのスタメン設定と同じ形。1〜8番） */
export const tapPlan = (draft) => ({
  battingOrder: battingOrderFromOrder(tapValue(draft)),
});

/**
 * PCの画面へ渡す形（`restoreFromFullLineup` と同じ `{ lineup, base }`）。編集していなければ null。
 * ⚠ PCの画面は `lineup.full` から受け取る。これは再読み込みのあとなど、`lineup.full`
 *    （保存しない入れ物）が空のときに下書きから受け取るためのもの
 */
export function restoreFromTapDraft(saved) {
  if (!validDraft(saved) || !tapDirty(saved)) return null;
  return {
    lineup: { ...saved.baseLineup, ...tapPlan(saved) },
    base: clone(saved.baseLineup),
  };
}

/**
 * 1回押したときの結果。`selection` は今選んでいるもの、`target` は押したもの
 * （`{ kind: 'row' | 'pos', index }` か `{ kind: 'bench', playerId }`）。
 * 返す `done` は入れ替えたときだけ（何をしたかの知らせに使う）。
 */
export function tapLineup(order, selection, target) {
  if (!selection) return { order, selection: target };
  if (target.kind === 'bench') {
    if (selection.kind === 'bench')
      return {
        order,
        selection: selection.playerId === target.playerId ? null : target,
      };
    return replaced(order, selection.index, target.playerId);
  }
  if (selection.kind === 'bench')
    return replaced(order, target.index, selection.playerId);
  if (selection.index === target.index)
    return {
      order,
      selection: selection.kind === target.kind ? null : target,
    };
  if (selection.kind === 'pos')
    return {
      order: swapPositions(order, selection.index, target.index),
      selection: null,
      done: { kind: 'positions', a: selection.index, b: target.index },
    };
  return {
    order: swapOrder(order, selection.index, target.index),
    selection: null,
    done: { kind: 'order', a: selection.index, b: target.index },
  };
}

function replaced(order, index, playerId) {
  const next = replaceStarter(order, index, playerId);
  if (next === order) return { order, selection: null };
  return {
    order: next,
    selection: null,
    done: { kind: 'replace', index, out: order[index]?.playerId ?? null },
  };
}

/**
 * 気になる所（スタメンの枠ごと）。空き・起用できない選手・試合の日に休む疲労・適性の低い守備。
 * ⚠ 判定はPCのスタメン設定と同じ値（`LOW_FITNESS`・`REST_FATIGUE`・`FRESH_FATIGUE`）。
 *    文はアプリの「気になる所」と同じ。
 * `positionName` は守備位置の名前（`POS_FULL`）。
 */
export function lineupNotes(order, roster, bench, positionName) {
  const byId = new Map((roster || []).map((p) => [p.id, p]));
  const notes = [];
  order.forEach((slot, index) => {
    const where = positionName[slot.position] || '';
    if (slot.playerId == null) {
      notes.push({
        index,
        kind: 'empty',
        text: `${where}が空いています。控えと交代して埋めてください`,
      });
      return;
    }
    const player = byId.get(slot.playerId);
    if (!canPlayField(player)) {
      notes.push({
        index,
        kind: 'missing',
        text: player
          ? `${player.name}は今は起用できません。控えと交代してください`
          : '名簿に居ない選手が入っています。控えと交代してください',
      });
      return;
    }
    const fatigue = player.fatigue || 0;
    if (fatigue >= REST_FATIGUE) {
      const canRest = (bench || []).some(
        (p) =>
          positionFitness(p, slot.position) >= LOW_FITNESS &&
          (p.fatigue || 0) < FRESH_FATIGUE,
      );
      notes.push({
        index,
        kind: 'rest',
        text: canRest
          ? `${player.name} 疲労${fatigue}。試合の日は控えと入れ替わって休みます`
          : `${player.name} 疲労${fatigue}。${where}を守れる控えが居ないので休めません`,
      });
    }
    const fitness = positionFitness(player, slot.position);
    if (fitness < LOW_FITNESS)
      notes.push({
        index,
        kind: 'unfit',
        text: `${player.name} ${where}の適性${fitness}。守備で失点しやすい`,
      });
  });
  return notes;
}
