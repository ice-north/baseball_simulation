import React, { useState, useMemo } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { POSITION_NAMES, getPositionSortIndex } from '../utils/constants.js';
import { OverallBadge } from './AbilityValue.jsx';
import { ensureTeamJerseyNumbers } from '../utils/jerseyNumbers.js';

// シーズン開始直前に、自チームの背番号を確認・変更する画面。
export default function JerseyNumberScreen({ userTeamName, seasonData, onComplete }) {
  const team = TEAMS_DATA[userTeamName];

  // 初回に未設定の背番号を自動割り当て
  useState(() => { ensureTeamJerseyNumbers(team); return true; });

  const players = useMemo(() => {
    const list = [...(team?.players || [])];
    list.sort((a, b) => getPositionSortIndex(a.position) - getPositionSortIndex(b.position) || (a.number || 0) - (b.number || 0));
    return list;
  }, [team]);

  // 編集用ローカルステート（id -> 文字列）
  const [nums, setNums] = useState(() => {
    const m = {};
    (team?.players || []).forEach(p => { m[p.id] = String(p.number ?? ''); });
    return m;
  });
  const [tick, setTick] = useState(0);

  // 重複・無効の判定
  const { dupSet, invalidSet } = useMemo(() => {
    const seen = {}, dup = new Set(), invalid = new Set();
    for (const p of players) {
      const raw = nums[p.id];
      const n = raw === '' ? NaN : Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > 99) { invalid.add(p.id); continue; }
      if (seen[n] != null) { dup.add(p.id); dup.add(seen[n]); } else seen[n] = p.id;
    }
    return { dupSet: dup, invalidSet: invalid };
  }, [nums, players, tick]);

  const hasError = dupSet.size > 0 || invalidSet.size > 0;

  const setNum = (id, val) => {
    const cleaned = val.replace(/[^0-9]/g, '').slice(0, 2);
    setNums(prev => ({ ...prev, [id]: cleaned }));
  };

  const autoAssign = () => {
    team.players.forEach(p => { p.number = null; }); // 全リセット
    ensureTeamJerseyNumbers(team);
    const m = {};
    team.players.forEach(p => { m[p.id] = String(p.number ?? ''); });
    setNums(m);
    setTick(t => t + 1);
  };

  const confirm = () => {
    if (hasError) return;
    for (const p of team.players) {
      const n = Number(nums[p.id]);
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

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white p-4">
      <div className="flex items-center gap-3 mb-2 flex-shrink-0">
        <h1 className="text-xl font-bold">背番号設定</h1>
        <span className="text-sm text-gray-300">{seasonData?.year || 1}年目・シーズン開始前</span>
        <span className="text-xs text-gray-400 ml-1">{userTeamName}</span>
        <button onClick={autoAssign} className="ml-auto px-3 py-1.5 rounded text-xs font-bold bg-gray-700 hover:bg-gray-600 border border-gray-600">
          自動割り当て
        </button>
      </div>
      <p className="text-xs text-gray-400 mb-2 flex-shrink-0">
        番号をクリックして変更できます（0〜99、チーム内で重複不可）。ゲームの成績には影響しません。
      </p>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
          {groups.map(g => {
            const gp = players.filter(g.test);
            if (gp.length === 0) return null;
            return (
              <div key={g.label} className="mb-2">
                <div className={`text-xs font-bold ${g.color} border-b border-gray-700 pb-1 mb-1`}>{g.label}（{gp.length}人）</div>
                {gp.map(p => {
                  const bad = dupSet.has(p.id) || invalidSet.has(p.id);
                  return (
                    <div key={p.id} className="flex items-center gap-2 py-0.5">
                      <span className="text-xs text-gray-400 w-8">{POSITION_NAMES[p.position] || ''}</span>
                      <OverallBadge player={p} />
                      <span className="text-sm text-white flex-1 truncate">{p.name}</span>
                      <input
                        value={nums[p.id] ?? ''}
                        onChange={(e) => setNum(p.id, e.target.value)}
                        inputMode="numeric"
                        className={`w-12 text-center tabular-nums text-sm font-bold rounded px-1 py-0.5 bg-gray-800 border ${
                          bad ? 'border-red-500 text-red-300' : 'border-gray-600 text-white focus:border-cyan-400'} focus:outline-none`}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3 mt-2 flex-shrink-0">
        {hasError && (
          <span className="text-xs text-red-400 font-bold">
            {invalidSet.size > 0 ? '0〜99の番号を入力してください。' : '重複した背番号があります。'}
          </span>
        )}
        <button
          onClick={confirm}
          disabled={hasError}
          className={`ml-auto px-6 py-2 rounded-lg font-bold text-sm transition ${
            hasError ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-500 text-white'}`}
        >
          確定してシーズン開始 →
        </button>
      </div>
    </div>
  );
}
