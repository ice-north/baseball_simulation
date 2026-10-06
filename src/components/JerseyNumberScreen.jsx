import React, { useState, useMemo, useRef } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { POSITION_NAMES, getPositionSortIndex } from '../utils/constants.js';
import { OverallBadge, AbilityValue } from './AbilityValue.jsx';
import { ensureTeamJerseyNumbers } from '../utils/jerseyNumbers.js';

// 選手の主要能力を「ラベル+値」の配列で返す（投手/野手で項目が変わる）。
// 値の配色は共有 AbilityValue に委譲し、球速・投手スタミナは正規化される。
function getKeyAbilities(p) {
  if (p.position === 'pitcher') {
    const arsenal = p.pitching?.arsenal || [];
    const bestBreak = arsenal.filter(a => a.type !== 'straight').reduce((m, a) => Math.max(m, a.level || 0), 0);
    return [
      { label: '速', value: p.pitching?.velocity, isVel: true },
      { label: '制', value: p.pitching?.control },
      { label: 'スタ', value: p.pitching?.stamina, isSta: true },
      { label: '変', value: bestBreak },
    ];
  }
  return [
    { label: 'ミ', value: p.batting?.meet },
    { label: 'パ', value: p.batting?.power },
    { label: '選', value: p.batting?.eye },
    { label: '走', value: p.physical?.speed },
    { label: '守', value: p.fielding?.defense },
    { label: '肩', value: p.physical?.arm },
  ];
}

// 主要能力を横並びで表示する小コンポーネント。
function AbilityStrip({ player }) {
  return (
    <div className="flex items-center gap-2 tabular-nums">
      {getKeyAbilities(player).map(a => (
        <span key={a.label} className="inline-flex items-baseline gap-0.5">
          <span className="text-xs text-gray-300">{a.label}</span>
          <AbilityValue value={a.value} isVel={a.isVel} isSta={a.isSta} className="text-sm" />
        </span>
      ))}
    </div>
  );
}

// シーズン開始直前に、自チームの背番号をドラッグ＆ドロップで設定する画面。
// 「空き番号トレイ」から選手へ番号チップをドラッグして配置する。
// トレイには未使用の番号だけが並ぶため、重複は構造的に発生しない。
export default function JerseyNumberScreen({ userTeamName, seasonData, onComplete }) {
  const team = TEAMS_DATA[userTeamName];

  // 新入団選手は背番号を空欄のままにする（自動割り当てしない）。
  // 継続選手は前年の背番号を保持し、新加入はユーザーがドラッグで付与する。
  // （一括で埋めたい場合は「空きを自動で埋める」「全て自動割り当て」を使用）

  const players = useMemo(() => {
    const list = [...(team?.players || [])];
    list.sort((a, b) => getPositionSortIndex(a.position) - getPositionSortIndex(b.position) || (a.number || 0) - (b.number || 0));
    return list;
  }, [team]);

  // 編集用ローカルステート（id -> number|null）
  const [nums, setNums] = useState(() => {
    const m = {};
    (team?.players || []).forEach(p => { m[p.id] = (p.number ?? null); });
    return m;
  });

  // この画面に入った時点の背番号（＝現在の番号）。編集しても変わらない基準値。
  const [originalNums] = useState(() => {
    const m = {};
    (team?.players || []).forEach(p => { m[p.id] = (p.number ?? null); });
    return m;
  });

  // ドラッグ中の情報（再レンダリングを起こさないよう ref で保持）
  const dragRef = useRef(null); // { value:number, fromId:string|null }

  // 使用中の番号集合と、トレイに並ぶ空き番号
  const { usedSet, poolNumbers } = useMemo(() => {
    const used = new Set();
    for (const id in nums) if (nums[id] != null) used.add(nums[id]);
    const pool = [];
    for (let n = 0; n <= 99; n++) if (!used.has(n)) pool.push(n);
    return { usedSet: used, poolNumbers: pool };
  }, [nums]);

  const assignedCount = useMemo(() => players.filter(p => nums[p.id] != null).length, [players, nums]);
  const allAssigned = assignedCount === players.length;

  // ---- ドラッグハンドラ ----
  const onChipDragStart = (e, value, fromId) => {
    dragRef.current = { value, fromId: fromId ?? null };
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(value)); } catch (_) {}
  };
  const onChipDragEnd = () => { dragRef.current = null; };

  const allowDrop = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const addHi = (e) => e.currentTarget.classList.add('ring-2', 'ring-cyan-400');
  const rmHi = (e) => e.currentTarget.classList.remove('ring-2', 'ring-cyan-400');

  // 選手へドロップ → 割り当て（元番号は解放 / 選手間はスワップ）
  const onDropPlayer = (e, targetId) => {
    e.preventDefault();
    rmHi(e);
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const { value, fromId } = drag;
    if (fromId === targetId) return;
    setNums(prev => {
      const next = { ...prev };
      const targetOld = next[targetId] ?? null;
      next[targetId] = value;
      if (fromId != null) {
        // 選手間の入れ替え：ドラッグ元にはターゲットの旧番号を渡す（スワップ）
        next[fromId] = targetOld;
      }
      // fromId が null（トレイ由来）の場合、targetOld は自動的にトレイへ戻る
      return next;
    });
  };

  // トレイへドロップ → 選手の番号を解放
  const onDropPool = (e) => {
    e.preventDefault();
    rmHi(e);
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.fromId == null) return;
    setNums(prev => ({ ...prev, [drag.fromId]: null }));
  };

  // クリックで番号を解放（トレイへ戻す）
  const unassign = (id) => setNums(prev => ({ ...prev, [id]: null }));

  const autoAssign = () => {
    team.players.forEach(p => { p.number = null; });
    ensureTeamJerseyNumbers(team);
    const m = {};
    team.players.forEach(p => { m[p.id] = (p.number ?? null); });
    setNums(m);
  };

  // 空き番号を未割当の選手にだけ埋める
  const fillEmpties = () => {
    setNums(prev => {
      const next = { ...prev };
      const used = new Set(Object.values(next).filter(v => v != null));
      const free = [];
      for (let n = 0; n <= 99; n++) if (!used.has(n)) free.push(n);
      let fi = 0;
      for (const p of players) {
        if (next[p.id] == null && fi < free.length) { next[p.id] = free[fi++]; }
      }
      return next;
    });
  };

  const confirm = () => {
    if (!allAssigned) return;
    for (const p of team.players) {
      const n = nums[p.id];
      if (Number.isInteger(n)) p.number = n;
    }
    onComplete?.();
  };

  const groups = [
    { label: '投手', test: (p) => p.position === 'pitcher', color: 'text-red-300' },
    { label: '捕手', test: (p) => p.position === 'catcher', color: 'text-cyan-300' },
    { label: '内野手', test: (p) => ['first', 'second', 'third', 'short'].includes(p.position), color: 'text-yellow-300' },
    { label: '外野手', test: (p) => ['left', 'center', 'right'].includes(p.position), color: 'text-green-300' },
  ];
  // 左カラム=投手、右カラム=野手（捕・内・外）で高さを均す
  const pitcherGroups = groups.filter(g => g.label === '投手');
  const fielderGroups = groups.filter(g => g.label !== '投手');

  // 列見出し（各カラム上部。行と同じ固定幅で揃える）
  const ColumnHeader = () => (
    <div className="flex items-center gap-2 px-1 pb-1 mb-1 border-b border-gray-700 text-xs text-gray-300">
      <span className="w-6">守</span>
      <span className="w-5 text-center">総</span>
      <span className="w-24">選手</span>
      <span className="w-9 text-right">年齢</span>
      <span className="w-64 hidden md:block">主要能力</span>
      <span className="w-7 text-right">現</span>
      <span className="w-3"></span>
      <span className="w-11 text-center">新</span>
    </div>
  );

  // 選手1行（固定幅・左詰め）
  const renderPlayerRow = (p) => {
    const val = nums[p.id];
    const empty = val == null;
    const orig = originalNums[p.id];
    const changed = val != null && val !== orig;
    return (
      <div
        key={p.id}
        onDragOver={allowDrop}
        onDragEnter={addHi}
        onDragLeave={rmHi}
        onDrop={(e) => onDropPlayer(e, p.id)}
        className="flex items-center gap-2 py-0.5 rounded px-1"
      >
        <span className="text-xs text-gray-300 w-6">{POSITION_NAMES[p.position] || ''}</span>
        <div className="w-5 flex-shrink-0"><OverallBadge player={p} /></div>
        <span className="text-sm text-white w-24 truncate">{p.name}</span>
        <span className="text-xs text-gray-300 w-9 text-right tabular-nums flex-shrink-0">{p.age}歳</span>
        {/* 主要能力 */}
        <div className="w-64 hidden md:flex flex-shrink-0 overflow-hidden">
          <AbilityStrip player={p} />
        </div>
        {/* 現在の番号 */}
        <span className="w-7 text-right text-sm tabular-nums text-gray-300">
          {orig != null ? orig : <span className="text-gray-400">―</span>}
        </span>
        {/* 変化インジケーター */}
        <span className={`text-xs w-3 text-center ${changed ? 'text-cyan-400' : 'text-transparent'}`}>→</span>
        {/* 新番号 */}
        {empty ? (
          <span className="w-11 h-7 flex items-center justify-center rounded border border-dashed border-gray-600 text-gray-400 text-xs">
            ―
          </span>
        ) : (
          <span
            draggable
            onDragStart={(e) => onChipDragStart(e, val, p.id)}
            onDragEnd={onChipDragEnd}
            onClick={() => unassign(p.id)}
            title="ドラッグで移動 / クリックで解放"
            className={`w-11 h-7 flex items-center justify-center rounded text-sm font-bold tabular-nums cursor-grab active:cursor-grabbing ${
              changed
                ? 'bg-cyan-800/80 border border-cyan-400 text-white hover:bg-cyan-700/80'
                : 'bg-cyan-900/60 border border-cyan-600 text-cyan-100 hover:bg-cyan-800/70'}`}
          >
            {val}
          </span>
        )}
      </div>
    );
  };

  // グループ（見出し＋所属選手）
  const renderGroupBlock = (g) => {
    const gp = players.filter(g.test);
    if (gp.length === 0) return null;
    return (
      <div key={g.label} className="mb-2">
        <div className={`text-xs font-bold ${g.color} border-b border-gray-700/60 pb-1 mb-1`}>{g.label}（{gp.length}人）</div>
        {gp.map(renderPlayerRow)}
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-surface-1 text-white p-4">
      <div className="flex items-center gap-3 mb-2 flex-shrink-0">
        <h1 className="text-xl font-bold">背番号設定</h1>
        <span className="text-sm text-gray-300">{seasonData?.year || 1}年目・シーズン開始前</span>
        <span className="text-xs text-gray-300 ml-1">{userTeamName}</span>
        <button onClick={fillEmpties} className="ml-auto px-3 py-1.5 rounded text-xs font-bold bg-gray-700 hover:bg-gray-600 border border-gray-600">
          空きを自動で埋める
        </button>
        <button onClick={autoAssign} className="px-3 py-1.5 rounded text-xs font-bold bg-gray-700 hover:bg-gray-600 border border-gray-600">
          全て自動割り当て
        </button>
      </div>
      <p className="text-xs text-gray-300 mb-2 flex-shrink-0">
        右のトレイから番号を選手へドラッグして配置します。選手の番号を別の選手にドラッグすると入れ替え、トレイに戻すと解放されます（番号をクリックでも解放）。トレイには空き番号だけが並ぶため重複しません。
      </p>

      <div className="flex-1 min-h-0 flex gap-4">
        {/* 選手リスト（投手／野手の2カラム・固定幅で横幅を圧縮） */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          <div className="flex gap-8 max-w-[1180px]">
            {/* 左：投手 */}
            <div className="flex-shrink-0">
              <ColumnHeader />
              {pitcherGroups.map(renderGroupBlock)}
            </div>
            {/* 右：野手（捕・内・外） */}
            <div className="flex-shrink-0">
              <ColumnHeader />
              {fielderGroups.map(renderGroupBlock)}
            </div>
          </div>
        </div>

        {/* 番号トレイ */}
        <div
          onDragOver={allowDrop}
          onDragEnter={addHi}
          onDragLeave={rmHi}
          onDrop={onDropPool}
          className="w-52 flex-shrink-0 flex flex-col rounded-lg bg-gray-800/60 border border-gray-700 p-2"
        >
          <div className="text-xs font-bold text-gray-300 mb-1 flex-shrink-0">
            空き番号（{poolNumbers.length}）
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="flex flex-wrap gap-1 content-start">
              {poolNumbers.map(n => (
                <span
                  key={n}
                  draggable
                  onDragStart={(e) => onChipDragStart(e, n, null)}
                  onDragEnd={onChipDragEnd}
                  className="w-9 h-7 flex items-center justify-center rounded bg-gray-700 border border-gray-600 text-gray-100 text-sm font-bold tabular-nums cursor-grab active:cursor-grabbing hover:bg-gray-600 hover:border-cyan-500"
                >
                  {n}
                </span>
              ))}
              {poolNumbers.length === 0 && (
                <span className="text-xs text-gray-400 py-2">空き番号はありません</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-2 flex-shrink-0">
        {!allAssigned && (
          <span className="text-xs text-yellow-400 font-bold">
            背番号が未設定の選手が {players.length - assignedCount} 人います。
          </span>
        )}
        <button
          onClick={confirm}
          disabled={!allAssigned}
          className={`ml-auto px-6 py-2 rounded-lg font-bold text-sm transition ${
            'btn-primary'}`}
        >
          確定してシーズン開始 →
        </button>
      </div>
    </div>
  );
}
