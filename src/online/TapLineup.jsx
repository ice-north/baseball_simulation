import React, { useEffect, useRef, useState } from 'react';
import { POS, POS_FULL } from './api.js';
import {
  useDraftState,
  useDraftMemoryStore,
  LINEUP_ORDER_DRAFT,
} from './Drafts.jsx';
import { ConditionMark, PlayerStatsButton } from './PlayerPerformance.jsx';
import { overviewGroup, formatStat } from './statsView.js';
import { AbilityValue } from '../components/AbilityValue.jsx';
import { getFatigueTone } from '../utils/constants.js';
import {
  fullLineupFromBoards,
  sameValue,
  LINEUP_BOARD_KEYS,
} from './lineupBridge.js';
import {
  benchFielders,
  benchPitchers,
  groupBench,
  candidatesFor,
  positionFitness,
  playablePositions,
  orderProblems,
  canPlayField,
  bestFieldPosition,
  sameOrder,
  LOW_FITNESS,
  REST_FATIGUE,
  FIELD_POSITIONS,
} from './lineupEdit.js';
import {
  startTapDraft,
  syncTapDraft,
  buildTapDraft,
  tapValue,
  tapDirty,
  tapPlan,
  commitTap,
  undoTap,
  savedTap,
  savedTapDraft,
  tapLineup,
  lineupNotes,
} from './tapLineup.js';

// ============================================================
// スマホの打順・守備・控え（767px以下）。**2回のタップで入れ替える縦の表**。
//
// 【意図】スマホで打順を組むときに比べたいのは「誰を・何番に・どこを守らせるか」。
//   以前は↑↓で1つずつ動かすカードと、横に長い一人用の画面（全画面）の2通りで、
//   縦向きでは守備と控えが触れず、横向きでは表が縮んで読めなかった。
//   ここでは先発9人と控えを1列に並べ、1回目に押したもので「何を入れ替えるか」、
//   2回目に押した相手で「誰と」を決める（中身は `tapLineup.js`）。2回目は相手の行の
//   どこを押してもよい（名前でも札でも同じ。指の大きさで押し分けなくて済むように）。
//   - 名前 → ほかの打順: 打順の入れ替え。守備位置の札 → ほかの打順: 守備位置の入れ替え
//   - スタメン ⇔ 控え: 交代（控えがその打順・守備位置に入る）
// ⚠ 決まりは**PCのスタメン設定（`LineupBoard.jsx`）と同じ**: 入れ替えの関数・守れない位置の
//    判定（適性 `LOW_FITNESS` 未満は赤）・投手は9番で固定（DHなし）・二刀流の投手は控えの最後。
//    行の作り（2行目を 能力／今季成績／守備適性 で切り替える・気になる所）はアプリの編成と同じ。
// ⚠ 保存は「打順」カード（`LeaguePanels.jsx` の `LineupPanel`）が方針・采配の下書きと
//    まとめて送る（`rebaseLineupParts`）。この部品は打順の編集と表示を受け持つ。
// ⚠ 編集は下書き（`Drafts` の `lineup.order`）に写し、タブの移動・再読み込みで消さない。
//    スマホを横にしてPCの画面に切り替わるときは `lineup.full` でPCのスタメン設定へ渡す。
// ============================================================

const STAT_IDS = ['avg', 'ops', 'homeruns', 'stolenBases', 'pa'];
const STAT_COLUMNS = (() => {
  const columns = overviewGroup('batting').columns;
  return STAT_IDS.map((id) => columns.find((c) => c.id === id)).filter(
    Boolean,
  );
})();
// アプリの編成の行と同じ短い名前
const STAT_LABEL = {
  avg: '打率',
  ops: 'OPS',
  homeruns: '本',
  stolenBases: '盗',
  pa: '席',
};
const MODES = [
  ['ability', '能力'],
  ['stats', '今季成績'],
  ['fitness', '守備適性'],
];

/** 編集の入れ物（履歴つき）と、選んでいるもの。`LineupPanel` が保存と合わせて使う */
export function useTapLineup(view) {
  const memory = useDraftMemoryStore();
  const [saved, setSaved] = useDraftState(LINEUP_ORDER_DRAFT, null);
  const [draft, setDraft] = useState(() =>
    startTapDraft(view, saved, memory?.get('lineup.full')),
  );
  const [selection, setSelection] = useState(null);
  const [notice, setNotice] = useState('');
  // 保存していない間は最新の view で作り直す（描画中の作り直し。`useBoardHistory` と同じ書き方）
  const synced = syncTapDraft(draft, view);
  if (synced !== draft) {
    setDraft(synced);
    if (!sameOrder(tapValue(synced), tapValue(draft))) {
      setSelection(null);
      setNotice('');
    }
  }
  // 下書き（タブの移動・再読み込み）と、PCの画面への受け渡し（`lineup.full`）に写す
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    const dirty = tapDirty(draft);
    setSaved({ ...draft, dirty });
    if (!memory) return;
    if (dirty)
      memory.set(
        'lineup.full',
        fullLineupFromBoards(viewRef.current, [
          {
            keys: LINEUP_BOARD_KEYS,
            plan: tapPlan(draft),
            baseLineup: draft.baseLineup,
          },
        ]),
      );
    else memory.delete('lineup.full');
  }, [draft, memory, setSaved]);

  const value = tapValue(draft);
  return {
    value,
    dirty: tapDirty(draft),
    plan: tapPlan(draft),
    baseLineup: draft.baseLineup,
    // ⚠ 編集を始めた後に別の画面で打順が保存された（このまま保存するとサーバーに断られる）
    stale:
      tapDirty(draft) &&
      !sameValue(draft.baseLineup?.battingOrder, view.lineup?.battingOrder),
    canUndo: draft.index > 0,
    selection,
    notice,
    /** 押したときの結果。入れ替えたら何をしたかを返す（知らせの文に使う） */
    press(target) {
      const result = tapLineup(value, selection, target);
      setSelection(result.selection);
      if (result.done) setDraft((d) => commitTap(d, result.order));
      return result;
    },
    setNotice,
    clearSelection() {
      setSelection(null);
    },
    undo() {
      setDraft(undoTap);
      setSelection(null);
      setNotice('1つ前の打順に戻しました');
    },
    discard() {
      setDraft(buildTapDraft(view));
      setSelection(null);
      setNotice('');
    },
    markSaved() {
      setDraft((d) => savedTap(d, view, tapPlan(d).battingOrder));
      // ⚠ **下書きと受け渡しの入れ物にも直に書く**。保存の応答を待つ間に下の「⌂」などで
      //    別のタブへ移るとこの部品は外れていて、上の `setDraft` は届かない。下書き
      //    （`lineup.order`）が「未保存・古い起点」のまま残り、「打順」に戻ると
      //    「別の画面で打順が保存されました」と出て保存も断られていた（再監査 B1）。
      //    `useDraftState` の書き込みは部品の外の入れ物へ同期で入るので、外れていても効く
      setSaved((s) => savedTapDraft(s, view));
      memory?.delete('lineup.full');
      setSelection(null);
      setNotice('');
    },
  };
}

function Fit({ player, position }) {
  if (!player || !position) return <span className="online-tap-fit" />;
  const value = positionFitness(player, position);
  const low = value < LOW_FITNESS;
  return (
    <span
      className={`online-tap-fit ${low ? 'is-low' : value >= 90 ? 'is-good' : ''}`}
      aria-label={`${POS_FULL[position]}の適性${value}${low ? '（守備で失点しやすい）' : ''}`}
    >
      <small aria-hidden="true">適</small>
      {value}
    </span>
  );
}

function FatigueBadge({ player }) {
  const value = player?.fatigue || 0;
  const tone =
    value >= REST_FATIGUE ? 'is-rest' : getFatigueTone(value) ? 'is-tired' : '';
  return (
    <span className={`online-tap-fatigue ${tone}`}>
      疲労{value}
    </span>
  );
}

/** 2行目。上の切り替えで 能力／今季成績／守備適性（アプリの編成の行と同じ） */
function SecondLine({ player, mode, position }) {
  if (mode === 'stats') {
    const pa = STAT_COLUMNS.find((c) => c.id === 'pa')?.get(player);
    if (!pa) return <span className="online-muted">今季の打席なし</span>;
    return STAT_COLUMNS.map((column) => (
      <span key={column.id} className="online-tap-cell">
        <small>{STAT_LABEL[column.id]}</small>
        {formatStat(column, column.get(player))}
      </span>
    ));
  }
  if (mode === 'fitness') {
    // 守れる位置（適性60以上）を高い順に。守っている位置は低くても出す（赤で気づけるように）
    const positions = FIELD_POSITIONS.filter(
      (pos) => pos === position || positionFitness(player, pos) >= LOW_FITNESS,
    ).sort((a, b) => positionFitness(player, b) - positionFitness(player, a));
    return (
      <>
        <span className="online-tap-cell">
          <small>守</small>
          <AbilityValue value={player.fielding?.defense} placeholder="—" />
        </span>
        <span className="online-tap-cell">
          <small>肩</small>
          <AbilityValue value={player.physical?.arm} placeholder="—" />
        </span>
        <span className="online-tap-sep" aria-hidden="true" />
        {positions.map((pos) => {
          const value = positionFitness(player, pos);
          return (
            <span
              key={pos}
              className={`online-tap-cell ${value < LOW_FITNESS ? 'is-low' : ''}`}
            >
              <small>{POS[pos]}</small>
              {value}
            </span>
          );
        })}
      </>
    );
  }
  return (
    <>
      {[
        ['ミ', player.batting?.meet],
        ['パ', player.batting?.power],
        ['眼', player.batting?.eye],
        ['走', player.physical?.speed],
      ].map(([label, value]) => (
        <span key={label} className="online-tap-cell">
          <small>{label}</small>
          <AbilityValue value={value} placeholder="—" />
        </span>
      ))}
      <span className="online-tap-sep" aria-hidden="true" />
      <span className="online-tap-cell">
        <small>守</small>
        <AbilityValue value={player.fielding?.defense} placeholder="—" />
      </span>
      <span className="online-tap-cell">
        <small>肩</small>
        <AbilityValue value={player.physical?.arm} placeholder="—" />
      </span>
    </>
  );
}

/** 1行目の名前（スタメンと控えで同じ形）。疲労で名前に色を付ける（PCと同じ段） */
function NameLine({ player }) {
  return (
    <span
      className={`online-tap-line1 online-fatigue-${getFatigueTone(player.fatigue) || 'none'}`}
    >
      <ConditionMark player={player} />
      <span className="online-tap-name">{player.name}</span>
      {/* 投手登録の選手が野手の枠に居る・控えに居る（二刀流） */}
      {player.position === 'pitcher' && (
        <small className="online-role-mark">投手</small>
      )}
    </span>
  );
}

export default function TapLineup({
  view,
  tap,
  busy,
  otherDirty,
  saveError,
  onSave,
  onDiscard,
}) {
  const roster = view.roster || [];
  const byId = new Map(roster.map((p) => [p.id, p]));
  const fielderOf = (id) => {
    const player = byId.get(id);
    return canPlayField(player) ? player : null;
  };
  const [mode, setMode] = useState('ability');
  // 控えの投手を全員出すか（ふだんは守れる位置のある投手だけ。PCと同じ）
  const [allPitchers, setAllPitchers] = useState(false);
  const order = tap.value;
  const selection = tap.selection;
  const selectedRow = selection?.kind === 'row' ? selection.index : null;
  const selectedPos = selection?.kind === 'pos' ? selection.index : null;
  const selectedBench =
    selection?.kind === 'bench' ? byId.get(selection.playerId) : null;
  // 打順の行を選んでいる間は、控えをその守備位置の交代候補として並べる（PCと同じ）
  const focusPosition =
    selectedRow !== null ? order[selectedRow]?.position : null;

  const bench = benchFielders(roster, order);
  const pitcherBench = benchPitchers(roster, order);
  const shownPitchers = (
    allPitchers
      ? pitcherBench
      : pitcherBench.filter((p) =>
          focusPosition
            ? positionFitness(p, focusPosition) >= LOW_FITNESS
            : playablePositions(p).length > 0,
        )
  ).sort(
    (a, b) =>
      positionFitness(b, bestFieldPosition(b)) -
      positionFitness(a, bestFieldPosition(a)),
  );
  const hiddenPitchers = pitcherBench.length - shownPitchers.length;
  const benchGroups = focusPosition
    ? [
        {
          id: 'candidates',
          label: `${POS_FULL[focusPosition]}の交代候補（適性が高い順）`,
          players: candidatesFor([...bench, ...shownPitchers], focusPosition),
        },
      ]
    : [
        ...groupBench(bench).map((group) => ({
          ...group,
          label: `控え・${group.label}（${group.players.length}人）`,
        })),
        ...(pitcherBench.length
          ? [
              {
                id: 'pitcher',
                label: '控え・投手（二刀流で野手の枠に）',
                players: shownPitchers,
              },
            ]
          : []),
      ];

  const problems = orderProblems(order, roster);
  const notes = lineupNotes(order, roster, bench, POS_FULL);
  const nextStarter = byId.get(view.nextStarterId);
  const twoWaySlot = order.find(
    (e) => e.playerId != null && e.playerId === view.nextStarterId,
  );
  const nameAt = (next, index) =>
    byId.get(next[index]?.playerId)?.name || '空き';

  // 入れ替えた結果の知らせ。守れない位置に入ったら注意を添える（PCの適性の判定と同じ値）
  const describe = (done, next) => {
    let text = '';
    let touched = [];
    if (done.kind === 'order') {
      text = `${nameAt(next, done.b)}を${done.b + 1}番、${nameAt(next, done.a)}を${done.a + 1}番にしました`;
    } else if (done.kind === 'positions') {
      text = `${nameAt(next, done.a)}を${POS_FULL[next[done.a].position]}、${nameAt(next, done.b)}を${POS_FULL[next[done.b].position]}にしました`;
      touched = [done.a, done.b];
    } else if (done.kind === 'replace') {
      const out = byId.get(done.out)?.name || '空き';
      text = `${out}に代えて${nameAt(next, done.index)}を${done.index + 1}番・${POS_FULL[next[done.index].position]}に入れました`;
      touched = [done.index];
    }
    const warnings = touched
      .map((index) => {
        const player = fielderOf(next[index]?.playerId);
        const fitness = positionFitness(player, next[index]?.position);
        return player && fitness < LOW_FITNESS
          ? `${player.name}（${POS_FULL[next[index].position]}の適性${fitness}）`
          : null;
      })
      .filter(Boolean);
    return warnings.length
      ? `${text}。守備で失点しやすい位置です：${warnings.join('、')}`
      : text;
  };
  const press = (target) => {
    // ⚠ 保存の応答待ちの間は触れない（行の番号など、ボタンの外を押しても動かないように）
    if (busy) return;
    const result = tap.press(target);
    tap.setNotice(result.done ? describe(result.done, result.order) : '');
  };

  // 選んでいる間は「誰を選んでいるか」と「次に何を押すか」。選んでいなければ、したことか保存の状態
  const picking =
    selectedRow !== null
      ? [
          `${selectedRow + 1}番 ${nameAt(order, selectedRow)}を選択中`,
          '相手の打順か控えを押すと入れ替わります',
        ]
      : selectedPos !== null
        ? [
            `${nameAt(order, selectedPos)}の守備（${POS_FULL[order[selectedPos]?.position]}）を選択中`,
            '相手を押すと守備位置を入れ替えます',
          ]
        : selectedBench
          ? [`控えの${selectedBench.name}を選択中`, '交代させる打順を押してください']
          : null;
  const status =
    tap.notice ||
    (tap.dirty || otherDirty
      ? `保存していない変更があります（${[tap.dirty && '打順', otherDirty && '方針・采配'].filter(Boolean).join('・')}）`
      : '保存済みです');
  const selectedPlayer =
    selectedBench ||
    fielderOf(order[selectedRow ?? selectedPos ?? -1]?.playerId);
  const warning = problems[0] || (tap.stale
    ? '別の画面で打順が保存されました。この編集は保存できないので、「変更を取り消す」で最新の打順から編集し直してください'
    : '');

  const starterLabel = (index, name) => {
    if (selectedRow === index || selectedPos === index)
      return `${index + 1}番 ${name}を選ぶのをやめる`;
    if (selectedBench) return `${name}に代えて${selectedBench.name}を入れる`;
    if (selectedRow !== null) return `${name}と打順を入れ替える`;
    if (selectedPos !== null) return `${name}と守備位置を入れ替える`;
    return `${index + 1}番 ${name}を選ぶ`;
  };

  return (
    <div className="online-tap">
      <p className="online-tap-help">
        名前を押して選び、相手を押すと入れ替わります（打順どうし＝打順、控え＝交代）。守備位置の札から押すと守備位置を入れ替えます。
      </p>
      {notes.length > 0 && (
        <section className="online-tap-notes" aria-label="気になる所">
          <strong>気になる所</strong>
          <ul>
            {notes.map((note) => (
              <li key={`${note.index}:${note.kind}`} className={`is-${note.kind}`}>
                <span className="online-tap-pos is-note">
                  {POS[order[note.index]?.position] || '?'}
                </span>
                {note.text}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div
        className="online-segments online-tap-modes"
        role="group"
        aria-label="2行目に出すもの"
      >
        {MODES.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={mode === id}
            onClick={() => setMode(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <fieldset className="online-tap-fields" disabled={busy}>
        <ol className="online-tap-list" aria-label="スタメン">
          {order.map((slot, index) => {
            const player = fielderOf(slot.playerId);
            const name = player?.name || '空き';
            const rowSelected = selectedRow === index;
            const posSelected = selectedPos === index;
            return (
              <li
                key={`${index}:${slot.playerId}`}
                data-slot={index + 1}
                className={[
                  'online-tap-row',
                  rowSelected ? 'is-selected' : '',
                  posSelected ? 'is-picking' : '',
                  selectedBench &&
                  positionFitness(selectedBench, slot.position) >= LOW_FITNESS
                    ? 'is-fit'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => press({ kind: 'row', index })}
              >
                <span className="online-tap-order" aria-hidden="true">
                  {index + 1}
                </span>
                <button
                  type="button"
                  className={`online-tap-pos ${posSelected ? 'is-selected' : ''}`}
                  aria-pressed={posSelected}
                  aria-label={
                    posSelected
                      ? `${index + 1}番の守備位置（${POS_FULL[slot.position]}）を選ぶのをやめる`
                      : selectedPos !== null
                        ? `${name}と守備位置を入れ替える`
                        : selectedRow !== null || selectedBench
                          ? starterLabel(index, name)
                          : `${index + 1}番の守備位置（${POS_FULL[slot.position]}）を選ぶ`
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    press({ kind: 'pos', index });
                  }}
                >
                  {POS[slot.position] || '?'}
                </button>
                <button
                  type="button"
                  className="online-tap-main"
                  aria-pressed={rowSelected}
                  aria-label={starterLabel(index, name)}
                >
                  {player ? (
                    <NameLine player={player} />
                  ) : (
                    <span className="online-tap-missing">
                      {slot.playerId == null
                        ? '空き'
                        : byId.get(slot.playerId)?.name || '名簿に居ない選手'}
                    </span>
                  )}
                </button>
                {player && <FatigueBadge player={player} />}
                <span className="online-tap-line2">
                  <Fit player={player} position={slot.position} />
                  {player ? (
                    <SecondLine
                      player={player}
                      mode={mode}
                      position={slot.position}
                    />
                  ) : (
                    <span className="online-tap-missing">
                      {slot.playerId == null
                        ? '空いています。控えと交代して埋めてください'
                        : byId.has(slot.playerId)
                          ? '今は起用できません。控えと交代してください'
                          : '名簿に居ない選手です。控えと交代してください'}
                    </span>
                  )}
                </span>
                {rowSelected && (
                  <span className="online-tap-picked" aria-hidden="true">
                    選択中
                  </span>
                )}
              </li>
            );
          })}
          {/* ⚠ 投手は9番で固定（DHなし）。押しても選べない（PCのスタメン設定と同じ） */}
          <li className="online-tap-row is-pitcher" data-slot={9}>
            <span className="online-tap-order" aria-hidden="true">
              9
            </span>
            <span className="online-tap-pos is-fixed">投</span>
            <span className="online-tap-main">
              <span className="online-tap-line1">
                <span className="online-tap-name">
                  {nextStarter ? `${nextStarter.name}（次の先発）` : '次の先発'}
                </span>
              </span>
            </span>
            <small className="online-tap-line2">
              {twoWaySlot
                ? `${nextStarter?.name || '次の先発'}は${POS_FULL[twoWaySlot.position]}にも入っています。先発の日は9番・投手に回り、${POS_FULL[twoWaySlot.position]}はその日だけ控えが守ります（試合の後は元に戻ります）。`
                : '投手は9番で打ちます。先発の順は「投手起用」で決めます。'}
            </small>
          </li>
        </ol>
        <section className="online-tap-bench" aria-label="控え">
          {benchGroups.map((group) => (
            <React.Fragment key={group.id}>
              <h3 className="online-tap-group">
                <span>{group.label}</span>
                {(group.id === 'pitcher' || group.id === 'candidates') &&
                  (allPitchers || hiddenPitchers > 0) && (
                    <button
                      type="button"
                      aria-pressed={allPitchers}
                      onClick={() => setAllPitchers(!allPitchers)}
                    >
                      {allPitchers
                        ? '守れる投手だけ'
                        : `投手を全員出す（ほか${hiddenPitchers}人）`}
                    </button>
                  )}
              </h3>
              <ul className="online-tap-list">
                {group.players.map((player) => {
                  // ⚠ 投手の本職（投手）の適性は出しても意味が無い。守るなら一番合う位置で
                  const fitnessPosition =
                    focusPosition ||
                    (player.position === 'pitcher'
                      ? bestFieldPosition(player)
                      : player.position);
                  const selected = selectedBench?.id === player.id;
                  return (
                    <li
                      key={player.id}
                      data-bench={player.id}
                      data-bench-group={group.id}
                      className={[
                        'online-tap-row is-bench',
                        selected ? 'is-selected' : '',
                        focusPosition &&
                        positionFitness(player, focusPosition) < LOW_FITNESS
                          ? 'is-unfit'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() =>
                        press({ kind: 'bench', playerId: player.id })
                      }
                    >
                      <span className="online-tap-order" aria-hidden="true" />
                      <span className="online-tap-pos is-bench">
                        {POS[player.position] || '?'}
                      </span>
                      <button
                        type="button"
                        className="online-tap-main"
                        aria-pressed={selected}
                        aria-label={
                          selected
                            ? `${player.name}を選ぶのをやめる`
                            : selectedRow !== null || selectedPos !== null
                              ? `${nameAt(order, selectedRow ?? selectedPos)}に代えて${player.name}を入れる`
                              : `控えの${player.name}を選ぶ`
                        }
                      >
                        <NameLine player={player} />
                      </button>
                      <FatigueBadge player={player} />
                      <span className="online-tap-line2">
                        <Fit player={player} position={fitnessPosition} />
                        <SecondLine
                          player={player}
                          mode={mode}
                          position={fitnessPosition}
                        />
                      </span>
                      {selected && (
                        <span className="online-tap-picked" aria-hidden="true">
                          選択中
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </React.Fragment>
          ))}
          {!bench.length && !pitcherBench.length && (
            <p className="online-muted">控えが居ません。</p>
          )}
        </section>
      </fieldset>
      {/* 保存の帯（画面の下に固定）。選んでいるもの・したことの知らせもここに出す */}
      <div className="online-tap-bar" role="region" aria-label="打順の保存">
        {saveError ? (
          <p role="alert" className="online-tap-warning">
            保存できませんでした：{saveError}（編集は残っています）
          </p>
        ) : (
          warning && (
            <p role="alert" className="online-tap-warning">
              {warning}
            </p>
          )
        )}
        <div className="online-tap-status">
          <p aria-live="polite">
            {picking ? (
              <>
                <strong>{picking[0]}</strong>
                <small>{picking[1]}</small>
              </>
            ) : (
              status
            )}
          </p>
          {selection && (
            <span className="online-tap-status-actions">
              {selectedPlayer && (
                <PlayerStatsButton
                  player={selectedPlayer}
                  panel="abilities"
                  className="online-tap-info"
                >
                  選手情報
                </PlayerStatsButton>
              )}
              <button type="button" onClick={tap.clearSelection}>
                やめる
              </button>
            </span>
          )}
        </div>
        <div className="online-tap-actions">
          <button
            type="button"
            disabled={busy || !tap.canUndo}
            onClick={tap.undo}
          >
            元に戻す
          </button>
          <button
            type="button"
            disabled={busy || !(tap.dirty || otherDirty)}
            onClick={onDiscard}
          >
            変更を取り消す
          </button>
          <button
            type="button"
            className="online-primary"
            disabled={busy || !(tap.dirty || otherDirty) || problems.length > 0}
            onClick={onSave}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
