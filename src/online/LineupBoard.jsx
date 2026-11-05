import React, { useCallback, useState } from 'react';
import { POS } from './api.js';
import { BoardPage, Fatigue } from './BoardParts.jsx';
import FieldDiagram from './FieldDiagram.jsx';
import { useBoardHistory } from './useBoardHistory.js';
import { ConditionMark, PlayerStatsButton } from './PlayerPerformance.jsx';
import { overviewGroup, formatStat } from './statsView.js';
import { teamShort } from './gameText.js';
import { AbilityValue } from '../components/AbilityValue.jsx';
import {
  orderFromLineup,
  battingOrderFromOrder,
  sameOrder,
  moveOrder,
  swapOrder,
  swapPositions,
  replaceStarter,
  benchFielders,
  groupBench,
  candidatesFor,
  positionFitness,
  playablePositions,
  orderProblems,
  REST_FATIGUE,
  LOW_FITNESS,
} from './lineupEdit.js';

// ============================================================
// PC版のスタメン設定。**スタメンを決めるときに比べたいものを、1つの表で比べる**。
//
// 【意図】スタメン決めは「この守備位置に誰を置くか」の比べ合い。比べるには、
//   スタメンと控えが**同じ列**に並び、1行に「実力（能力）・結果（今季成績）・
//   状態（調子・疲労）・その位置の守備適性」が同時に見えている必要がある。
//   だから、スタメン9行と控え野手を**1枚の表**に並べる（列が必ずそろう）。
//
// ⚠ 以前は一人用の画面を移植していて、次の指摘があった（2026-11-04）。
//    ここではどれも作りで起きないようにしてある。
//    - 自動設定ボタン（どう変わるか分からない）→ 置かない
//    - 守備位置がコンボボックス → 守備位置のバッジ同士を入れ替える
//    - ✕でスタメンから外す → 交代（控えと入れ替え）だけ。7人の状態を経由しない
//    - 守備図が場所を取る → 置かない（守備位置は表の列）
//    - 控えだけ謎のチェックボックス（比較）→ 同じ表に並ぶので比較は要らない
//    - 控えの先頭に投手 → 投手は出さない（投手起用で扱う）。捕手・内野・外野で括る
//    - スタメンと控えで書き方が違う → 同じ表・同じ列
//    - 数字がはみ出す → 表の列に入れる
// ⚠ 守備分析のページはこの表に入れた（守備位置の入れ替え・位置ごとの候補と適性）。
//    同じ編成を2か所で編集しない（PC版の統一の決まり）。
// ⚠ 保存するのは打順（`battingOrder`）だけ。投手起用は別のページで別に保存する
//    （`rebaseLineupSave` の受け持ち項目を分けてある。`lineupBridge.js` の `LINEUP_BOARD_KEYS`）。
// ============================================================

const STAT_IDS = ['pa', 'avg', 'homeruns', 'rbis', 'obp', 'ops'];
const STAT_COLUMNS = (() => {
  const columns = overviewGroup('batting').columns;
  return STAT_IDS.map((id) => columns.find((c) => c.id === id)).filter(Boolean);
})();
const SHORT_LABEL = { homeruns: '本塁打', rbis: '打点', obp: '出塁率' };

const ABILITIES = [
  { key: 'meet', label: 'ミ', title: 'ミート', get: (p) => p.batting?.meet },
  { key: 'power', label: 'パ', title: 'パワー', get: (p) => p.batting?.power },
  { key: 'eye', label: '眼', title: '選球眼', get: (p) => p.batting?.eye },
  { key: 'speed', label: '走', title: '走力', get: (p) => p.physical?.speed },
];

const POS_FULL = {
  catcher: '捕手',
  first: '一塁',
  second: '二塁',
  third: '三塁',
  short: '遊撃',
  left: '左翼',
  center: '中堅',
  right: '右翼',
};
const BATS = { left: '左', right: '右', switch: '両' };
const batsOf = (p) => BATS[p.batting?.bats || p.physical?.bats] || '—';
const THROWS = { left: '左投', right: '右投' };

/** 次の数試合の相手と、相手の先発予定（投げる手）。左右の並べ方の手がかり */
function NextOpponents({ view }) {
  const games = (view.nextGames || []).slice(0, 5);
  if (!games.length) return null;
  return (
    <div className="online-lineup-next" aria-label="この先の相手先発">
      <span className="online-lineup-next-label">この先の相手先発</span>
      {games.map((game) => {
        const home = game.home === view.teamName;
        const opponent = home ? game.away : game.home;
        const info = home ? game.awayStarterInfo : game.homeStarterInfo;
        const name = info?.name || (home ? game.awayStarter : game.homeStarter);
        return (
          <span
            key={game.id ?? `${game.number}:${opponent}`}
            className="online-lineup-next-game"
          >
            <small>{game.number ? `${game.number}試合目` : ''}</small>
            <strong>{teamShort(opponent)}</strong>
            {name ? (
              <span>
                {name}
                {info?.throws && (
                  <em className={`is-${info.throws}`}>{THROWS[info.throws]}</em>
                )}
              </span>
            ) : (
              <span className="online-muted">未定</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function Fitness({ value, position }) {
  if (value === null || value === undefined)
    return <span className="online-muted">—</span>;
  const low = value < LOW_FITNESS;
  return (
    <span
      className={`online-lineup-fitness ${low ? 'is-low' : value >= 90 ? 'is-good' : ''}`}
      title={`${POS_FULL[position] || ''}の守備適性 ${value}%${low ? '（低い: 守備で失点しやすい）' : ''}`}
    >
      {value}
      <small>%</small>
    </span>
  );
}

/** 1人ぶんの数字の列（スタメンと控えで**同じ部品**を使う） */
function PlayerCells({ player, fitness, fitnessPosition }) {
  return (
    <>
      <td className="online-lineup-person">
        <span onClick={(e) => e.stopPropagation()}>
          <PlayerStatsButton player={player} category="batting" group="basic" />
        </span>
        <ConditionMark player={player} />
      </td>
      <td title={player.physical?.throws === 'left' ? '左投' : '右投'}>
        {batsOf(player)}
      </td>
      <td>{player.age ?? '—'}</td>
      <td className="is-sep">
        <Fatigue
          value={player.fatigue}
          rest={REST_FATIGUE}
          restText="試合の日は休養し、守れる控えと入れ替わります"
        />
      </td>
      {ABILITIES.map((a, i) => (
        <td key={a.key} className={i === 0 ? 'is-sep' : ''}>
          <AbilityValue value={a.get(player)} placeholder="—" />
        </td>
      ))}
      <td className="is-sep">
        <Fitness value={fitness} position={fitnessPosition} />
      </td>
      <td>
        <AbilityValue value={player.fielding?.defense} placeholder="—" />
      </td>
      <td>
        <AbilityValue value={player.physical?.arm} placeholder="—" />
      </td>
      {STAT_COLUMNS.map((column, i) => (
        <td key={column.id} className={i === 0 ? 'is-sep is-stat' : 'is-stat'}>
          {formatStat(column, column.get(player))}
        </td>
      ))}
    </>
  );
}

const COLUMN_COUNT = 3 + 3 + ABILITIES.length + 3 + STAT_COLUMNS.length;

function HeaderRow({ fitnessLabel }) {
  return (
    <tr>
      <th className="online-lineup-slot">打順</th>
      <th className="online-lineup-poscell">守備</th>
      <th className="online-lineup-person">選手</th>
      <th title="打席（左・右・両）">打</th>
      <th>年齢</th>
      <th
        className="is-sep"
        title="80以上は試合の日に休養（守れる控えと入れ替わる）"
      >
        疲労
      </th>
      {ABILITIES.map((a, i) => (
        <th key={a.key} className={i === 0 ? 'is-sep' : ''} title={a.title}>
          {a.label}
        </th>
      ))}
      <th className="is-sep" title="その守備位置の適性（60%未満は赤）">
        {fitnessLabel}
      </th>
      <th title="守備力">守</th>
      <th title="肩力">肩</th>
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

export default function LineupBoard({
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

  // ---- 編集の状態（履歴つき。`useBoardHistory`）
  const [selection, setSelection] = useState(null);
  const [drag, setDrag] = useState(null);
  const [dropAt, setDropAt] = useState(null);
  // 守備図。守備位置を選ぶと開き、表の成績の列の場所に出す（閉じるまで開いたまま）
  const [fieldOpen, setFieldOpen] = useState(false);
  const [hoverPos, setHoverPos] = useState(null);
  const clearSelection = useCallback(() => setSelection(null), []);
  const board = useBoardHistory({
    view,
    fromView: (v) => orderFromLineup(v.lineup),
    same: sameOrder,
    toPlan: (order) => ({ battingOrder: battingOrderFromOrder(order) }),
    onSave,
    onDirty,
    onDraft,
    restore,
    keyActive: !hidden && !busy,
    onEscape: clearSelection,
  });
  const order = board.value;
  const commit = (next) => {
    board.commit(next);
    setSelection(null);
  };

  // ---- 操作（クリック）
  const bench = benchFielders(roster, order);
  const selectedRow = selection?.kind === 'row' ? selection.index : null;
  const selectedPos = selection?.kind === 'pos' ? selection.index : null;
  const selectedBench =
    selection?.kind === 'bench' ? byId.get(selection.playerId) : null;
  const focusPosition =
    selectedRow !== null ? order[selectedRow]?.position : null;

  const clickRow = (index) => {
    if (selectedRow !== null && selectedRow !== index)
      commit(swapOrder(order, selectedRow, index));
    else if (selectedBench)
      commit(replaceStarter(order, index, selectedBench.id));
    else if (selectedPos !== null && selectedPos !== index)
      commit(swapPositions(order, selectedPos, index));
    else setSelection(selectedRow === index ? null : { kind: 'row', index });
  };
  const clickPosition = (index) => {
    if (selectedPos !== null && selectedPos !== index)
      commit(swapPositions(order, selectedPos, index));
    else {
      setSelection(selectedPos === index ? null : { kind: 'pos', index });
      setFieldOpen(true);
    }
  };
  const clickBench = (playerId) => {
    if (selectedRow !== null)
      commit(replaceStarter(order, selectedRow, playerId));
    else
      setSelection(
        selection?.kind === 'bench' && selection.playerId === playerId
          ? null
          : { kind: 'bench', playerId },
      );
  };

  // ---- 操作（ドラッグ）。落とした先の行で、運んだものに応じて決まる
  //   打順の行 → 打順の行: その打順へ動かす（間はずれる）
  //   守備位置 → 打順の行: 守備位置を入れ替える
  //   控え → 打順の行 / 打順の行 → 控え: 交代
  const startDrag = (payload) => (e) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    // Firefox はデータが無いとドラッグを始めない
    e.dataTransfer.setData('text/plain', JSON.stringify(payload));
    setDrag(payload);
    setSelection(null);
  };
  const endDrag = () => {
    setDrag(null);
    setDropAt(null);
  };
  const over = (target) => (e) => {
    if (!drag) return;
    if (target.kind === 'bench' && drag.kind !== 'row') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (
      dropAt?.kind !== target.kind ||
      dropAt?.index !== target.index ||
      dropAt?.playerId !== target.playerId
    )
      setDropAt(target);
  };
  const dropOn = (target) => (e) => {
    e.preventDefault();
    const d = drag;
    endDrag();
    if (!d) return;
    if (target.kind === 'row') {
      if (d.kind === 'row') commit(moveOrder(order, d.index, target.index));
      else if (d.kind === 'pos')
        commit(swapPositions(order, d.index, target.index));
      else if (d.kind === 'bench')
        commit(replaceStarter(order, target.index, d.playerId));
    } else if (target.kind === 'bench' && d.kind === 'row') {
      commit(replaceStarter(order, d.index, target.playerId));
    }
  };

  // ---- 表示
  const problems = orderProblems(order, roster);
  const nextStarter = byId.get(view.nextStarterId);
  const help =
    selectedRow !== null
      ? `${(order[selectedRow] && byId.get(order[selectedRow].playerId)?.name) || `${selectedRow + 1}番`}を選択中：控えを押すと交代、ほかの打順を押すと打順を入れ替えます。`
      : selectedPos !== null
        ? `${POS_FULL[order[selectedPos]?.position]}を選択中：ほかの選手の守備位置を押すと入れ替えます。`
        : selectedBench
          ? `${selectedBench.name}を選択中：交代させる打順を押してください。`
          : '行を押して選び、もう一方を押すと入れ替わります（打順どうし＝打順、守備位置どうし＝守備、打順と控え＝交代）。ドラッグでも同じです。Escで選択を取り消します。';

  const benchRows = focusPosition
    ? [
        {
          id: 'candidates',
          label: `${POS_FULL[focusPosition]}の交代候補（${POS_FULL[focusPosition]}の適性が高い順）`,
          players: candidatesFor(bench, focusPosition),
        },
      ]
    : groupBench(bench);

  const rowClass = (index) =>
    [
      'online-lineup-row',
      selectedRow === index ? 'is-selected' : '',
      drag && dropAt?.kind === 'row' && dropAt.index === index
        ? `is-drop is-drop-${drag.kind}`
        : '',
      drag?.kind === 'row' && drag.index === index ? 'is-dragging' : '',
      selectedBench &&
      positionFitness(selectedBench, order[index]?.position) >= LOW_FITNESS
        ? 'is-fit'
        : '',
    ]
      .filter(Boolean)
      .join(' ');

  return (
    <BoardPage
      title="スタメン設定"
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
        <NextOpponents view={view} />
        <div className="online-lineup-toolbar">
          <p className="online-lineup-help" aria-live="polite">
            {help}
          </p>
          <button
            type="button"
            className="online-lineup-field-toggle"
            aria-pressed={fieldOpen}
            title="守備の並びと各位置の適性を図で見る（今季成績の列の場所に出ます）"
            onClick={() => setFieldOpen(!fieldOpen)}
          >
            守備図
          </button>
        </div>
        <div className={`online-lineup-split ${fieldOpen ? 'is-field' : ''}`}>
          <div className="online-lineup-scroll">
            <table className="online-lineup-table">
              <thead>
                <HeaderRow fitnessLabel="適性" />
              </thead>
              <tbody aria-label="スタメン">
                {order.map((entry, index) => {
                  const player = byId.get(entry.playerId);
                  return (
                    <tr
                      key={`${index}:${entry.playerId}`}
                      className={rowClass(index)}
                      draggable={!busy}
                      onDragStart={startDrag({ kind: 'row', index })}
                      onDragEnd={endDrag}
                      onDragOver={over({ kind: 'row', index })}
                      onDragLeave={() => setDropAt(null)}
                      onDrop={dropOn({ kind: 'row', index })}
                      onClick={() => clickRow(index)}
                      data-slot={index + 1}
                    >
                      <td className="online-lineup-slot">
                        <button
                          type="button"
                          aria-pressed={selectedRow === index}
                          aria-label={`${index + 1}番を選ぶ`}
                          onClick={(e) => {
                            e.stopPropagation();
                            clickRow(index);
                          }}
                        >
                          <span
                            aria-hidden="true"
                            className="online-lineup-grip"
                          >
                            ⠿
                          </span>
                          {index + 1}
                        </button>
                      </td>
                      <td className="online-lineup-poscell">
                        <button
                          type="button"
                          className={`online-lineup-pos ${selectedPos === index ? 'is-selected' : ''}`}
                          aria-pressed={selectedPos === index}
                          aria-label={`${index + 1}番の守備位置（${POS[entry.position]}）を入れ替える`}
                          draggable={!busy}
                          onDragStart={startDrag({ kind: 'pos', index })}
                          onDragEnd={endDrag}
                          onMouseEnter={() => setHoverPos(index)}
                          onMouseLeave={() => setHoverPos(null)}
                          onClick={(e) => {
                            e.stopPropagation();
                            clickPosition(index);
                          }}
                        >
                          {POS[entry.position] || '?'}
                        </button>
                      </td>
                      {player ? (
                        <PlayerCells
                          player={player}
                          fitness={positionFitness(player, entry.position)}
                          fitnessPosition={entry.position}
                        />
                      ) : (
                        <td
                          colSpan={COLUMN_COUNT - 2}
                          className="online-lineup-missing"
                        >
                          名簿に居ない選手です。控えと交代してください
                        </td>
                      )}
                    </tr>
                  );
                })}
                <tr className="online-lineup-row is-pitcher">
                  <td className="online-lineup-slot">
                    <span>9</span>
                  </td>
                  <td className="online-lineup-poscell">
                    <span className="online-lineup-pos is-fixed">投</span>
                  </td>
                  <td
                    colSpan={COLUMN_COUNT - 2}
                    className="online-lineup-person"
                  >
                    {nextStarter
                      ? `${nextStarter.name}（次の先発）`
                      : '次の先発'}
                    <small>
                      投手は9番で打ちます。先発の順は「投手起用」で決めます。
                    </small>
                  </td>
                </tr>
              </tbody>
              <tbody
                aria-label="控え野手"
                className={`online-lineup-bench ${drag?.kind === 'row' ? 'is-target' : ''}`}
              >
                <tr className="online-lineup-bench-head">
                  <th colSpan={COLUMN_COUNT}>
                    控え野手 {bench.length}人
                    <small>
                      {focusPosition
                        ? '押すと交代します。適性の列はこの守備位置での値です。'
                        : '控えは試合に出ないと伸びにくくなります（出場の多い選手は約2倍伸びる）。'}
                    </small>
                  </th>
                </tr>
                {benchRows.map((group) => (
                  <React.Fragment key={group.id}>
                    <tr className="online-lineup-group">
                      <th colSpan={COLUMN_COUNT}>
                        {group.label}
                        {group.id !== 'candidates' && (
                          <small>{group.players.length}人</small>
                        )}
                      </th>
                    </tr>
                    {group.players.map((player) => {
                      const fitnessPosition = focusPosition || player.position;
                      const fitness = positionFitness(player, fitnessPosition);
                      const selected = selectedBench?.id === player.id;
                      return (
                        <tr
                          key={player.id}
                          className={[
                            'online-lineup-row',
                            selected ? 'is-selected' : '',
                            focusPosition && fitness < LOW_FITNESS
                              ? 'is-unfit'
                              : '',
                            drag?.kind === 'row' &&
                            dropAt?.kind === 'bench' &&
                            dropAt.playerId === player.id
                              ? 'is-drop is-drop-bench'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          draggable={!busy}
                          onDragStart={startDrag({
                            kind: 'bench',
                            playerId: player.id,
                          })}
                          onDragEnd={endDrag}
                          onDragOver={over({
                            kind: 'bench',
                            playerId: player.id,
                          })}
                          onDragLeave={() => setDropAt(null)}
                          onDrop={dropOn({
                            kind: 'bench',
                            playerId: player.id,
                          })}
                          onClick={() => clickBench(player.id)}
                          data-bench={player.id}
                        >
                          <td className="online-lineup-slot">
                            <button
                              type="button"
                              aria-pressed={selected}
                              aria-label={
                                selectedRow !== null
                                  ? `${player.name}と交代する`
                                  : `${player.name}を選ぶ`
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                clickBench(player.id);
                              }}
                            >
                              <span
                                aria-hidden="true"
                                className="online-lineup-grip"
                              >
                                ⠿
                              </span>
                              {selectedRow !== null ? '交代' : ''}
                            </button>
                          </td>
                          <td
                            className="online-lineup-poscell"
                            title="本職と、ほかに守れる位置（適性60%以上、高い順）"
                          >
                            <span className="online-lineup-playable">
                              <span className="online-lineup-pos is-bench">
                                {POS[player.position] || '?'}
                              </span>
                              {playablePositions(player)
                                .filter((e) => e.position !== player.position)
                                .slice(0, 2)
                                .map((e) => (
                                  <span key={e.position}>
                                    {POS[e.position]}
                                  </span>
                                ))}
                            </span>
                          </td>
                          <PlayerCells
                            player={player}
                            fitness={fitness}
                            fitnessPosition={fitnessPosition}
                          />
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
                {!bench.length && (
                  <tr>
                    <td colSpan={COLUMN_COUNT} className="online-muted">
                      控えの野手が居ません。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {fieldOpen && (
            <FieldDiagram
              order={order}
              byId={byId}
              pitcher={nextStarter}
              selected={
                selectedPos ?? (drag?.kind === 'pos' ? drag.index : null)
              }
              target={
                drag?.kind === 'pos' && dropAt?.kind === 'row'
                  ? dropAt.index
                  : hoverPos
              }
              focus={selectedRow}
              onPick={clickPosition}
              onHover={setHoverPos}
            />
          )}
        </div>
      </section>
    </BoardPage>
  );
}
