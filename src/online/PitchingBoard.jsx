import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ConditionMark, PlayerStatsButton } from './PlayerPerformance.jsx';
import { overviewGroup, formatStat } from './statsView.js';
import { BoardPage, Fatigue } from './BoardParts.jsx';
import { useBoardHistory } from './useBoardHistory.js';
import { AbilityValue } from '../components/AbilityValue.jsx';
import { FORM_SHORT, FORM_NAME, getFatigueTone } from '../utils/constants.js';
import { POS_FULL } from './api.js';
import {
  MAX_STARTERS,
  STARTER_ORDER,
  RELIEF_ORDER,
  ROLE_HINT,
  roleLabel,
  isStarterRole,
  pitchingFromLineup,
  samePitching,
  planFromPitching,
  moveStarter,
  swapPitchers,
  setRole,
  insertStarter,
  reliefGroups,
  pitchingProblems,
  onStaff,
  addToStaff,
  removeFromStaff,
  staffCandidates,
  STARTER_SKIP_FATIGUE,
  RELIEF_REST_FATIGUE,
} from './pitchingEdit.js';

// ============================================================
// PC版の投手起用。スタメン設定（`LineupBoard.jsx`）と**同じ考え方・同じ表**にする。
//
// 【意図】投手起用で決めるのは「誰を何番目に先発させるか」と「救援の誰にどの場面を
//   任せるか」。比べたいのは、同じ役割の候補どうしの実力（球速・制球・スタミナ）・
//   結果（今季の登板・防御率など）・状態（調子・疲労）。だから全投手を1枚の表に、
//   先発ローテ（登板順）→ 救援（試合で使われる場面の順＝役割の順）と並べる。
//   役割は各行の札で示す（役割ごとの見出しは置かない。札と同じ名前が2度並ぶうえ、
//   1人ずつの括りが縦に長くなる）。空いている役割は救援の見出しに出す。
//
// ⚠ 以前は一人用の画面の移植で、スタメン設定と同じ種類の指摘があった
//    （自動設定ボタン・役割ごとの大きな空き枠・先発と救援でカードの書き方が違う・
//    オンラインでは使えない「野手をコンバート」の欄）。ここでは置かない。
// ⚠ 保存するのは先発の順と役割だけ（`lineupBridge.js` の `PITCHING_BOARD_KEYS`）。
//    打順はスタメン設定で別に保存する。
// ⚠ 野手も投手で起用できる（二刀流）。表の最後の「野手を投手で起用する」から加え、
//    役割の札から外す。加えていない野手は投げない（`pitchingEdit.js`）。
// ============================================================

const STAT_IDS = [
  'games',
  'outs',
  'era',
  'wins',
  'losses',
  'holds',
  'saves',
  'whip',
];
const STAT_COLUMNS = (() => {
  const columns = overviewGroup('pitching').columns;
  return STAT_IDS.map((id) => columns.find((c) => c.id === id)).filter(Boolean);
})();
const SHORT_LABEL = { games: '登板', holds: 'H', saves: 'S' };
// ⚠ 列を足したらここも直すこと（`colSpan` がずれると罫線が折れる）。
//    順・役割・投手 / 投・フォーム・年齢・疲労 / 速・制・ス / 成績
const COLUMN_COUNT = 3 + 4 + 3 + STAT_COLUMNS.length;
/** 名前の色の意味。⚠ **色だけに頼らない**（読み上げとマウスオーバーに出す） */
const FATIGUE_TONE_TEXT = {
  warn: '疲れています（このまま投げ続けると成長が鈍ります）',
  heavy: 'かなり疲れています（成長の鈍り方が最も大きくなります）',
  '': undefined,
};

function HeaderRow() {
  return (
    <tr>
      <th className="online-lineup-slot">順</th>
      <th className="online-pitch-rolecell">役割</th>
      <th className="online-lineup-person">投手</th>
      <th title="投げる手">投</th>
      {/* ⚠ **フォームを出す**。球種の相性（`FORM_PITCH_SYNERGY`）と左右の
          打者への効き方が変わるので、救援の並べ方を決めるのに要る */}
      <th title="投球フォーム">フォーム</th>
      <th>年齢</th>
      <th
        className="is-sep"
        title={`先発は${STARTER_SKIP_FATIGUE}以上で登板を飛ばし、救援は${RELIEF_REST_FATIGUE}以上だと原則使われません`}
      >
        疲労
      </th>
      <th className="is-sep" title="球速">
        速
      </th>
      <th title="制球">制</th>
      <th title="スタミナ">ス</th>
      {STAT_COLUMNS.map((column, i) => (
        <th
          key={column.id}
          className={i === 0 ? 'is-sep is-stat' : 'is-stat'}
          title={`今季の${column.label}`}
        >
          {SHORT_LABEL[column.id] || column.label}
        </th>
      ))}
    </tr>
  );
}

function PitcherCells({ player, starter }) {
  return (
    <>
      {/* ⚠ 疲労は**名前にも色を付ける**（スタメン設定と同じ `getFatigueTone`）。
          同じ選手が画面ごとに違う見え方をしないよう、両方の表に当てる */}
      <td
        className={`online-lineup-person online-fatigue-${getFatigueTone(player.fatigue) || 'none'}`}
        title={FATIGUE_TONE_TEXT[getFatigueTone(player.fatigue)]}
      >
        <span onClick={(e) => e.stopPropagation()}>
          <PlayerStatsButton
            player={player}
            category="pitching"
            group="basic"
          />
        </span>
        <ConditionMark player={player} />
        {player.position !== 'pitcher' && (
          <small
            className="online-role-mark"
            title="野手登録の選手です（二刀流）。役割の札から投手起用を外せます"
          >
            野手・{POS_FULL[player.position] || ''}
          </small>
        )}
      </td>
      <td>{player.physical?.throws === 'left' ? '左' : '右'}</td>
      <td
        className="online-pitch-form"
        title={FORM_NAME[player.pitching?.form] || undefined}
      >
        {FORM_SHORT[player.pitching?.form] || '—'}
      </td>
      <td>{player.age ?? '—'}</td>
      <td className="is-sep">
        <Fatigue
          value={player.fatigue}
          rest={starter ? STARTER_SKIP_FATIGUE : RELIEF_REST_FATIGUE}
          warn={starter ? 20 : 30}
          restText={
            starter
              ? '登板の日は飛ばして、次の先発が投げます'
              : '疲れが抜けるまで、原則として試合で使われません'
          }
        />
      </td>
      <td className="is-sep">
        <AbilityValue value={player.pitching?.velocity} isVel placeholder="—" />
      </td>
      <td>
        <AbilityValue value={player.pitching?.control} placeholder="—" />
      </td>
      <td>
        <AbilityValue value={player.pitching?.stamina} isSta placeholder="—" />
      </td>
      {STAT_COLUMNS.map((column, i) => (
        <td key={column.id} className={i === 0 ? 'is-sep is-stat' : 'is-stat'}>
          {formatStat(column, column.get(player))}
        </td>
      ))}
    </>
  );
}

/** 役割の選び直し。先発の型と救援の役割を並べて出す（押した札の下に出る） */
function RoleMenu({ menu, state, close, choose, remove }) {
  const ref = useRef(null);
  useEffect(() => {
    // ⚠ 開いた札を押したときは閉じない（札の側で閉じる。ここで閉じると、続く
    //    クリックで開き直してしまい、同じ札で閉じられない）
    const away = (e) => {
      if (ref.current?.contains(e.target)) return;
      if (e.target.closest?.('.online-role-chip[aria-expanded="true"]')) return;
      close();
    };
    const onKey = (e) => e.key === 'Escape' && close();
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [close]);
  const current = state.roles[menu.id];
  const starter = state.starters.includes(menu.id);
  const option = (role) => {
    const toStarter = isStarterRole(role);
    const disabled =
      (toStarter && !starter && state.starters.length >= MAX_STARTERS) ||
      (!toStarter && starter && state.starters.length <= 1);
    return (
      <button
        key={role}
        type="button"
        aria-pressed={current === role}
        disabled={disabled}
        title={
          disabled
            ? toStarter
              ? `先発は${MAX_STARTERS}人までです`
              : '先発が1人も居なくなります'
            : ROLE_HINT[role]
        }
        onClick={() => choose(role)}
      >
        <strong>{roleLabel(role)}</strong>
        <small>{ROLE_HINT[role]}</small>
      </button>
    );
  };
  return (
    <div
      ref={ref}
      className="online-role-menu"
      role="dialog"
      aria-label={`${menu.name}の役割`}
      style={{ top: menu.top, left: menu.left }}
    >
      <p>先発（ローテーションに入る）</p>
      <div>{STARTER_ORDER.map(option)}</div>
      <p>救援</p>
      <div>{RELIEF_ORDER.map(option)}</div>
      {menu.fielder && (
        <>
          <p>野手（二刀流）</p>
          <div>
            <button
              type="button"
              disabled={starter && state.starters.length <= 1}
              title={
                starter && state.starters.length <= 1
                  ? '先発が1人も居なくなります'
                  : '投手起用から外します。試合では投げません'
              }
              onClick={remove}
            >
              <strong>投手起用から外す</strong>
              <small>野手だけで出る</small>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function PitchingBoard({
  view,
  busy,
  hidden,
  restore,
  onSave,
  onDirty,
  onDraft,
}) {
  const roster = view.roster || [];
  const byId = new Map(roster.map((p) => [p.id, p]));
  const [selection, setSelection] = useState(null);
  const [menu, setMenu] = useState(null);
  const [drag, setDrag] = useState(null);
  const [dropAt, setDropAt] = useState(null);
  // 「野手を投手で起用する」の一覧を開いているか（ふだんは畳む。野手は多い）
  const [fieldersOpen, setFieldersOpen] = useState(false);
  const clearSelection = useCallback(() => {
    setSelection(null);
    setMenu(null);
  }, []);
  const closeMenu = useCallback(() => setMenu(null), []);
  const board = useBoardHistory({
    view,
    fromView: (v) => pitchingFromLineup(v.lineup, v.roster),
    same: samePitching,
    toPlan: planFromPitching,
    onSave,
    onDirty,
    onDraft,
    restore,
    keyActive: !hidden && !busy && !menu,
    onEscape: clearSelection,
  });
  const state = board.value;
  const commit = (next) => {
    board.commit(next);
    setSelection(null);
    setMenu(null);
  };

  // ---- クリック: 行を選び、もう一方を押す（スタメン設定と同じ）
  //   行 → ほかの行: 持ち場を入れ替える（`swapPitchers`。先発どうしは登板順）
  //   救援 → 「先発ローテーション」の見出し: ローテの最後へ / 先発 → 「救援」の見出し: ローテから外す
  // ⚠ 名簿に居ない先発（崩れた保存）も選べる。名前は無いので行の説明で呼ぶ
  const nameOf = (id) => byId.get(id)?.name || '名簿に居ない投手';
  // 起用できる投手（名簿に居て、抹消されていない投手と、加えた野手）。⚠ 名簿（byId）には
  //    抹消中も入る。役割（state.roles）は起用できる選手にしか無いので、それ以外は崩れた行として出す
  const pitcherOf = (id) => (onStaff(state, id) && byId.get(id)) || null;
  const clickRow = (id) => {
    if (selection !== null && selection !== id)
      commit(swapPitchers(state, selection, id));
    else setSelection(selection === id ? null : id);
  };
  // 見出しへ移せるか: 救援 → 「先発ローテーション」（最後へ入る）/ 先発 → 「救援」（外れる）。
  // ⚠ 先発をローテの見出しへ落としても動かさない（見出しは1番手の上にあり、
  //    最後へ回すと「先頭へ」のつもりのエースが最後に投げる）
  // ⚠ 人数の決まり（先発は1〜8人。`setRole`）で動かせないときは、見出しを落とし先に
  //    光らせない（光ったのに何も起きない、にしない。役割の一覧も同じ決まりで選べなくする）
  const canMoveTo = (id, target) =>
    target === 'rotation'
      ? !state.starters.includes(id) && state.starters.length < MAX_STARTERS
      : state.starters.includes(id) && state.starters.length > 1;
  const moveTo = (id, target) => {
    if (!canMoveTo(id, target)) return state;
    return target === 'rotation'
      ? insertStarter(state, id, state.starters.length)
      : setRole(state, id, 'auto_r');
  };
  const clickHead = (target) => {
    if (selection !== null) commit(moveTo(selection, target));
  };
  const openMenu = (player) => (e) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const width = 420;
    setSelection(null);
    setMenu(
      menu?.id === player.id
        ? null
        : {
            id: player.id,
            name: player.name,
            fielder: player.position !== 'pitcher',
            top: Math.min(
              rect.bottom + 4,
              window.innerHeight - (player.position !== 'pitcher' ? 400 : 330),
            ),
            left: Math.max(
              8,
              Math.min(rect.left, window.innerWidth - width - 8),
            ),
          },
    );
  };

  // ---- ドラッグ: 落とした先で決まる
  //   先発 → 先発の行: 登板順を動かす（間はずれる） / それ以外 → 行: 持ち場を入れ替える
  //   → 見出し（'rotation' / 'relief'）: そこへ移す。行の落とし先は投手のid
  const startDrag = (id) => (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(id));
    setDrag(id);
    setSelection(null);
    setMenu(null);
  };
  const endDrag = () => {
    setDrag(null);
    setDropAt(null);
  };
  const over = (target) => (e) => {
    if (drag === null) return;
    if (
      (target === 'rotation' || target === 'relief') &&
      !canMoveTo(drag, target)
    )
      return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropAt !== target) setDropAt(target);
  };
  const dropOn = (target) => (e) => {
    e.preventDefault();
    const id = drag;
    endDrag();
    if (id === null) return;
    if (target !== 'rotation' && target !== 'relief') {
      if (target === id) return;
      const from = state.starters.indexOf(id);
      const to = state.starters.indexOf(target);
      commit(
        from >= 0 && to >= 0
          ? moveStarter(state, from, to)
          : swapPitchers(state, id, target),
      );
    } else commit(moveTo(id, target));
  };
  const dropProps = (target) => ({
    onDragOver: over(target),
    onDragLeave: () => setDropAt(null),
    onDrop: dropOn(target),
  });

  const problems = pitchingProblems(state, roster);
  // ⚠ 次の先発。サーバーは**先発の並びが変わると先頭から登板し直す**（`lineupCommand.mjs`）。
  //    並びを変えたら先頭に印を移し、そう書いておく（保存してから驚かないように）
  const savedStarters = view.lineup?.starters || [];
  const rotationChanged =
    savedStarters.length !== state.starters.length ||
    state.starters.some((id, i) => id !== savedStarters[i]);
  const nextStarterId = rotationChanged
    ? state.starters[0]
    : view.nextStarterId;
  // 救援は使われる場面の順（役割の順）に並べる。役割の名前は各行の札が示す
  const groups = reliefGroups(state, roster);
  const relievers = groups.flatMap((g) => g.players);
  const vacant = groups
    .filter((g) => !g.players.length && g.role !== 'auto_r')
    .map((g) => g.role);
  // 投手起用に加えていない野手（加える候補）
  const candidates = staffCandidates(state, roster);
  const help =
    selection !== null
      ? `${nameOf(selection)}を選択中：ほかの投手を押すと持ち場（登板順・役割）を入れ替えます。${
          state.starters.includes(selection)
            ? canMoveTo(selection, 'relief')
              ? '「救援」の見出しを押すとローテから外します。'
              : '先発が1人だけなので、ローテからは外せません。'
            : canMoveTo(selection, 'rotation')
              ? '「先発ローテーション」の見出しを押すとローテの最後に入れます。'
              : `先発は${MAX_STARTERS}人までです。ローテに入れるには先発の投手と入れ替えてください。`
        }`
      : '役割の札を押すと役割を選び直せます。行を押して選び、ほかの投手を押すと持ち場を入れ替えます。ドラッグでも同じです（先発どうしは登板順を動かします）。';
  const pickLabel = (id, name) =>
    selection !== null && selection !== id
      ? `${name}と入れ替える`
      : `${name}を選ぶ`;

  const rowClass = (id, extra = []) =>
    [
      'online-lineup-row',
      selection === id ? 'is-selected' : '',
      drag === id ? 'is-dragging' : '',
      ...extra,
    ]
      .filter(Boolean)
      .join(' ');

  const roleChip = (player) => {
    const role = state.roles[player.id];
    return (
      <button
        type="button"
        className={[
          'online-role-chip',
          isStarterRole(role) ? 'is-starter' : 'is-relief',
          role === 'closer' ? 'is-closer' : '',
          role.startsWith('auto') ? 'is-auto' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-haspopup="dialog"
        aria-expanded={menu?.id === player.id}
        aria-label={`${player.name}の役割（${roleLabel(role)}）を選び直す`}
        title={ROLE_HINT[role]}
        onClick={openMenu(player)}
      >
        {roleLabel(role)}
      </button>
    );
  };

  return (
    <BoardPage
      title="投手起用"
      board={board}
      busy={busy}
      problems={problems}
      hidden={hidden}
    >
      {/* ⚠ 保存の応答待ちの間は触れなくする（送信中の編集が、保存後の作り直しで消える） */}
      <section
        className="online-card online-lineup-board"
        inert={busy ? '' : undefined}
      >
        <p className="online-lineup-help" aria-live="polite">
          {help}
        </p>
        <div className="online-lineup-scroll">
          <table className="online-lineup-table online-pitch-table">
            <thead>
              <HeaderRow />
            </thead>
            <tbody aria-label="先発ローテーション" data-starter-order>
              <tr
                className={`online-lineup-bench-head ${dropAt === 'rotation' ? 'is-drop' : ''} ${
                  selection !== null && canMoveTo(selection, 'rotation')
                    ? 'is-target'
                    : ''
                }`}
                onClick={() => clickHead('rotation')}
                {...dropProps('rotation')}
              >
                <th colSpan={COLUMN_COUNT}>
                  先発ローテーション {state.starters.length}/{MAX_STARTERS}人
                  <small>
                    上から順に登板します。疲労{STARTER_SKIP_FATIGUE}
                    以上の先発はその日を飛ばします。
                    {rotationChanged &&
                      ' 並びを変えて保存すると、次の試合は先頭から登板します。'}
                  </small>
                </th>
              </tr>
              {state.starters.map((id, index) => {
                const player = pitcherOf(id);
                return (
                  <tr
                    key={id}
                    className={rowClass(id, [dropAt === id ? 'is-drop' : ''])}
                    draggable={!busy}
                    onDragStart={startDrag(id)}
                    onDragEnd={endDrag}
                    {...dropProps(id)}
                    onClick={() => clickRow(id)}
                    data-starter={id}
                  >
                    <td className="online-lineup-slot">
                      <button
                        type="button"
                        aria-pressed={selection === id}
                        aria-label={pickLabel(id, `先発${index + 1}番手`)}
                        onClick={(e) => {
                          e.stopPropagation();
                          clickRow(id);
                        }}
                      >
                        <span aria-hidden="true" className="online-lineup-grip">
                          ⠿
                        </span>
                        {index + 1}
                      </button>
                      {id === nextStarterId && (
                        <span
                          className="online-pitch-next"
                          title={
                            rotationChanged
                              ? '保存すると、次の試合はこの投手から登板します'
                              : '次の試合の先発予定'
                          }
                        >
                          次
                        </span>
                      )}
                    </td>
                    <td className="online-pitch-rolecell">
                      {player && roleChip(player)}
                    </td>
                    {player ? (
                      <PitcherCells player={player} starter />
                    ) : (
                      <td
                        colSpan={COLUMN_COUNT - 2}
                        className="online-lineup-missing"
                      >
                        {byId.has(id)
                          ? `${nameOf(id)}は今は起用できません。`
                          : '名簿に居ない投手です。'}
                        この行を選んで救援の投手を押すと入れ替わります（「救援」の見出しへ落とすと外れます）
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tbody aria-label="救援">
              <tr
                className={`online-lineup-bench-head ${dropAt === 'relief' ? 'is-drop' : ''} ${
                  selection !== null && canMoveTo(selection, 'relief')
                    ? 'is-target'
                    : ''
                }`}
                onClick={() => clickHead('relief')}
                {...dropProps('relief')}
              >
                <th colSpan={COLUMN_COUNT}>
                  救援 {relievers.length}人
                  <small>
                    使われる場面の順（役割の順）に並べています。疲労
                    {RELIEF_REST_FATIGUE}以上の投手は原則使われません。
                    {vacant.length > 0 && (
                      <> 空いている役割：{vacant.map(roleLabel).join('・')}</>
                    )}
                  </small>
                </th>
              </tr>
              {relievers.map((player, i) => (
                <tr
                  key={player.id}
                  className={rowClass(player.id, [
                    dropAt === player.id ? 'is-drop' : '',
                    i > 0 &&
                    state.roles[relievers[i - 1].id] !== state.roles[player.id]
                      ? 'is-role-start'
                      : '',
                  ])}
                  draggable={!busy}
                  onDragStart={startDrag(player.id)}
                  onDragEnd={endDrag}
                  {...dropProps(player.id)}
                  onClick={() => clickRow(player.id)}
                  data-reliever={player.id}
                >
                  <td className="online-lineup-slot">
                    <button
                      type="button"
                      aria-pressed={selection === player.id}
                      aria-label={pickLabel(player.id, player.name)}
                      onClick={(e) => {
                        e.stopPropagation();
                        clickRow(player.id);
                      }}
                    >
                      <span aria-hidden="true" className="online-lineup-grip">
                        ⠿
                      </span>
                    </button>
                  </td>
                  <td className="online-pitch-rolecell">{roleChip(player)}</td>
                  <PitcherCells player={player} starter={false} />
                </tr>
              ))}
            </tbody>
            {candidates.length > 0 && (
              <tbody aria-label="野手を投手で起用する">
                <tr className="online-lineup-bench-head">
                  <th colSpan={COLUMN_COUNT}>
                    野手を投手で起用する（二刀流） {candidates.length}人
                    <small>
                      加えると救援の「おまかせ」で入ります。役割の札で先発や救援の役割に変えられます。加えていない野手は投げません。
                    </small>
                    <button
                      type="button"
                      className="online-lineup-group-toggle"
                      aria-expanded={fieldersOpen}
                      onClick={() => setFieldersOpen(!fieldersOpen)}
                    >
                      {fieldersOpen ? '畳む' : '野手を出す'}
                    </button>
                  </th>
                </tr>
                {fieldersOpen &&
                  candidates.map((player) => (
                    <tr
                      key={player.id}
                      className="online-lineup-row is-candidate"
                      data-staff-candidate={player.id}
                    >
                      <td className="online-lineup-slot" />
                      <td className="online-pitch-rolecell">
                        <button
                          type="button"
                          className="online-role-chip is-add"
                          aria-label={`${player.name}を投手起用に加える`}
                          onClick={() => commit(addToStaff(state, player))}
                        >
                          加える
                        </button>
                      </td>
                      <PitcherCells player={player} starter={false} />
                    </tr>
                  ))}
              </tbody>
            )}
          </table>
        </div>
      </section>
      {menu && (
        <RoleMenu
          menu={menu}
          state={state}
          close={closeMenu}
          choose={(role) => commit(setRole(state, menu.id, role))}
          remove={() => commit(removeFromStaff(state, menu.id, roster))}
        />
      )}
    </BoardPage>
  );
}
