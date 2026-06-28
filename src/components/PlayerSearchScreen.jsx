import React, { useState, useMemo } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { highSchoolPool, universityPool } from '../season/universityPool.js';
import { releasedPlayersPool } from '../teams-data.js';
import { POSITION_NAMES, POSITION_ORDER, getAbilityRank, getRankColor } from '../utils/constants.js';
import { WORLD_DATA } from '../corporate/worldData.js';
import { addHighSchoolPlayerToScoutList } from '../corporate/scoutingSystem.js';

const SOURCES = [
  { key: 'highschool', label: '高校生' },
  { key: 'university', label: '大学生' },
  { key: 'released', label: '自由契約' },
  { key: 'teams', label: 'チーム所属' },
];

const FILTER_DEFS = [
  { key: 'age', label: '年齢', get: p => p.age || 18, min: 15, max: 45, step: 1 },
  { key: 'meet', label: 'ミート', get: p => p.batting?.meet || 0 },
  { key: 'power', label: 'パワー', get: p => p.batting?.power || 0 },
  { key: 'eye', label: '選球眼', get: p => p.batting?.eye || 0 },
  { key: 'speed', label: '走力', get: p => p.physical?.speed || 0 },
  { key: 'arm', label: '肩力', get: p => p.physical?.arm || 0 },
  { key: 'defense', label: '守備', get: p => p.fielding?.defense || 0 },
  { key: 'steal', label: '盗塁', get: p => p.batting?.steal || 0 },
  { key: 'velocity', label: '球速', get: p => p.pitching?.velocity || 0, min: 100, max: 170, step: 1 },
  { key: 'control', label: '制球', get: p => p.pitching?.control || 0 },
  { key: 'stamina', label: 'スタミナ', get: p => p.pitching?.stamina || 0, min: 0, max: 200, step: 1 },
  { key: 'growth', label: '成長率', get: p => p.growthPotential || 1.0, min: 0.5, max: 1.5, step: 0.05, decimal: true },
];

const DEFAULT_FILTERS = {};
FILTER_DEFS.forEach(f => {
  DEFAULT_FILTERS[f.key] = { enabled: false, min: f.min || 0, max: f.max || 99 };
});

function collectAllPlayers() {
  const results = [];

  if (highSchoolPool.players?.length > 0) {
    highSchoolPool.players.forEach(p => {
      results.push({ ...p, _source: 'highschool', _sourceLabel: p.highSchool?.name || '高校生' });
    });
  }

  if (universityPool) {
    Object.entries(universityPool).forEach(([year, entries]) => {
      if (!entries) return;
      entries.forEach(entry => {
        const p = entry.player || entry;
        if (p && p.name) {
          results.push({ ...p, _source: 'university', _sourceLabel: entry.universityTeamName || p.universityTeamName || `大学(${entry.universityRank || '?'}ランク)`, _uniRank: entry.universityRank || p._destinationRank || '?' });
        }
      });
    });
  }

  if (releasedPlayersPool?.length > 0) {
    releasedPlayersPool.forEach(p => {
      results.push({ ...p, _source: 'released', _sourceLabel: p.previousTeam || '自由契約' });
    });
  }

  Object.entries(TEAMS_DATA || {}).forEach(([teamName, teamData]) => {
    (teamData.players || []).forEach(p => {
      results.push({ ...p, _source: 'teams', _sourceLabel: teamName });
    });
  });

  return results;
}

const PlayerSearchScreen = ({ onBack, gameMode, userTeamName }) => {
  const [filters, setFilters] = useState(() => JSON.parse(JSON.stringify(DEFAULT_FILTERS)));
  const [sources, setSources] = useState({ highschool: true, university: true, released: true, teams: false });
  const [posFilter, setPosFilter] = useState('all');
  const [nameQuery, setNameQuery] = useState('');
  const [sortKey, setSortKey] = useState('meet');
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [scoutAddMsg, setScoutAddMsg] = useState(null);
  const [scoutTick, setScoutTick] = useState(0); // スカウト追加後の再描画トリガー

  const allPlayers = useMemo(() => collectAllPlayers(), []);

  const filtered = useMemo(() => {
    let list = allPlayers.filter(p => sources[p._source]);

    if (nameQuery.trim()) {
      const q = nameQuery.trim();
      list = list.filter(p => p.name?.includes(q) || p._sourceLabel?.includes(q));
    }

    if (posFilter === 'pitcher') list = list.filter(p => p.position === 'pitcher');
    else if (posFilter === 'fielder') list = list.filter(p => p.position !== 'pitcher');
    else if (posFilter !== 'all') list = list.filter(p => p.position === posFilter);

    for (const def of FILTER_DEFS) {
      const f = filters[def.key];
      if (!f?.enabled) continue;
      list = list.filter(p => {
        const val = def.get(p);
        return val >= f.min && val <= f.max;
      });
    }

    const getDef = FILTER_DEFS.find(d => d.key === sortKey);
    const getVal = getDef ? getDef.get : (p => 0);
    list.sort((a, b) => {
      const diff = getVal(a) - getVal(b);
      return sortAsc ? diff : -diff;
    });

    return list.slice(0, 200);
  }, [allPlayers, sources, posFilter, nameQuery, filters, sortKey, sortAsc]);

  const updateFilter = (key, field, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value }
    }));
  };

  const toggleSort = (key) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const resetFilters = () => {
    setFilters(JSON.parse(JSON.stringify(DEFAULT_FILTERS)));
    setPosFilter('all');
    setNameQuery('');
  };

  const SortTh = ({ k, children, w }) => (
    <th className={`py-1 px-1 text-center ${w || ''} cursor-pointer hover:text-white transition ${sortKey === k ? 'text-yellow-400' : ''}`}
      onClick={() => toggleSort(k)}>
      {children}{sortKey === k ? (sortAsc ? '↑' : '↓') : ''}
    </th>
  );

  const FORM_SHORT = { overhand: 'OV', threeQuarter: '3Q', sidearm: 'SD', submarine: 'UN' };
  const FORM_FULL = { overhand: 'オーバー', threeQuarter: 'スリー', sidearm: 'サイド', submarine: 'アンダー' };
  const handLabel = (v) => v === 'right' ? '右' : v === 'left' ? '左' : v === 'switch' ? '両' : '?';

  const StatVal = ({ value, isVel, isSta }) => {
    const rank = getAbilityRank(value, isVel, isSta);
    const color = getRankColor(rank);
    return <span className={`${color} font-bold`}>{value}</span>;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">選手検索</h2>
          <button onClick={onBack} className="text-gray-400 hover:text-white text-sm px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 transition">戻る</button>
        </div>

        {/* Source toggles */}
        <div className="flex flex-wrap gap-2 mb-3">
          {SOURCES.map(s => (
            <button key={s.key}
              onClick={() => setSources(prev => ({ ...prev, [s.key]: !prev[s.key] }))}
              className={`px-3 py-1 rounded text-xs font-bold transition ${sources[s.key] ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}
            >{s.label}</button>
          ))}
          <span className="text-gray-500 text-xs self-center ml-2">|</span>
          {[{ key: 'all', label: '全ポジ' }, { key: 'pitcher', label: '投手' }, { key: 'fielder', label: '野手' },
            ...POSITION_ORDER.filter(p => p !== 'pitcher').map(p => ({ key: p, label: POSITION_NAMES[p] }))
          ].map(p => (
            <button key={p.key}
              onClick={() => setPosFilter(p.key)}
              className={`px-2 py-1 rounded text-xs font-bold transition ${posFilter === p.key ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400'}`}
            >{p.label}</button>
          ))}
          <button onClick={resetFilters} className="px-2 py-1 rounded text-xs bg-gray-700 text-gray-400 hover:bg-red-700 hover:text-white transition ml-auto">リセット</button>
        </div>

        {/* Name search */}
        <div className="flex items-center gap-2 mb-3">
          <input
            type="text"
            value={nameQuery}
            onChange={e => setNameQuery(e.target.value)}
            placeholder="選手名・所属で検索..."
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 w-64 focus:outline-none focus:border-blue-500"
          />
          {nameQuery && <button onClick={() => setNameQuery('')} className="text-gray-500 hover:text-white text-sm">✕</button>}
          <span className="text-gray-600 text-[10px] ml-2">※ スカウト画面の能力値は推定値です。実際の数値と異なる場合があります</span>
        </div>

        {/* Filters */}
        <div className="bg-gray-800 rounded-lg p-3 mb-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {FILTER_DEFS.map(def => {
              const f = filters[def.key];
              const fMin = def.min ?? 0;
              const fMax = def.max ?? 99;
              const step = def.step ?? 1;
              return (
                <div key={def.key} className={`flex flex-col gap-0.5 p-1.5 rounded ${f.enabled ? 'bg-gray-700' : 'bg-gray-800'}`}>
                  <label className="flex items-center gap-1 text-[10px] text-gray-400">
                    <input type="checkbox" checked={f.enabled}
                      onChange={e => updateFilter(def.key, 'enabled', e.target.checked)}
                      className="w-3 h-3" />
                    {def.label}
                  </label>
                  {f.enabled && (
                    <div className="flex items-center gap-1 text-[10px]">
                      <input type="number" value={f.min} min={fMin} max={fMax} step={step}
                        onChange={e => updateFilter(def.key, 'min', def.decimal ? parseFloat(e.target.value) : parseInt(e.target.value))}
                        className="w-14 bg-gray-600 rounded px-1 py-0.5 text-white text-center" />
                      <span className="text-gray-500">〜</span>
                      <input type="number" value={f.max} min={fMin} max={fMax} step={step}
                        onChange={e => updateFilter(def.key, 'max', def.decimal ? parseFloat(e.target.value) : parseInt(e.target.value))}
                        className="w-14 bg-gray-600 rounded px-1 py-0.5 text-white text-center" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Results */}
        <div className="text-xs text-gray-400 mb-1">{filtered.length}件{filtered.length >= 200 ? '（上位200件表示）' : ''}</div>
        <div className="bg-gray-800 rounded-lg overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-gray-700/80 text-gray-400 text-[10px]">
                <th className="py-1 px-2 text-left w-20">選手</th>
                <th className="py-1 px-1 text-center w-6">位</th>
                <SortTh k="age" w="w-6">齢</SortTh>
                <th className="py-1 px-1 text-center w-7">体</th>
                <th className="py-1 px-1 text-left w-24 max-w-[96px] truncate">所属</th>
                <SortTh k="meet" w="w-7">ミ</SortTh>
                <SortTh k="power" w="w-7">パ</SortTh>
                <SortTh k="speed" w="w-7">走</SortTh>
                <SortTh k="arm" w="w-7">肩</SortTh>
                <SortTh k="defense" w="w-7">守</SortTh>
                <SortTh k="eye" w="w-7">眼</SortTh>
                <SortTh k="steal" w="w-7">盗</SortTh>
                <SortTh k="velocity" w="w-8">球速</SortTh>
                <SortTh k="control" w="w-7">制</SortTh>
                <SortTh k="stamina" w="w-7">ス</SortTh>
                <SortTh k="growth" w="w-8">成長</SortTh>
                <th className="py-1 px-1 text-center w-7">知</th>
                <th className="py-1 px-1 text-center w-10">投打</th>
                <th className="py-1 px-1 text-center w-8">形</th>
                {gameMode === 'university' && <th className="py-1 px-1 text-center w-8 text-purple-400">スカ</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, idx) => {
                const isScoutable = gameMode === 'university' && p._source === 'highschool';
                const scout = WORLD_DATA._universityScout;
                const alreadyScouted = isScoutable && scout && (
                  (scout.candidates || []).some(c => c.id === p.id)
                  || (scout.recruited || []).some(c => c.id === p.id)
                );
                return (
                <tr key={`${p._source}-${p.id || idx}`}
                  className={`border-b border-gray-700/30 hover:bg-gray-700/40 cursor-pointer ${selectedPlayer?.id === p.id && selectedPlayer?._source === p._source ? 'bg-gray-700/50' : ''}`}
                  onClick={() => setSelectedPlayer(selectedPlayer?.id === p.id && selectedPlayer?._source === p._source ? null : p)}
                >
                  <td className="py-0.5 px-2 font-bold text-xs truncate max-w-[80px]">{p.name}</td>
                  <td className="py-0.5 px-1 text-center text-gray-500">{POSITION_NAMES[p.position] || p.position}</td>
                  <td className="py-0.5 px-1 text-center text-gray-500">{p.age || '?'}</td>
                  <td className="py-0.5 px-1 text-center">
                    <span className={p.physical?.build === 'large' ? 'text-orange-400' : p.physical?.build === 'small' ? 'text-cyan-400' : 'text-gray-400'}>
                      {p.physical?.build === 'large' ? '大柄' : p.physical?.build === 'small' ? '小柄' : '中肉'}
                    </span>
                  </td>
                  <td className="py-0.5 px-1 text-left text-gray-500 truncate max-w-[96px]" title={p._sourceLabel}>{p._sourceLabel}</td>
                  <td className="py-0.5 px-1 text-center"><StatVal value={p.batting?.meet || 0} /></td>
                  <td className="py-0.5 px-1 text-center"><StatVal value={p.batting?.power || 0} /></td>
                  <td className="py-0.5 px-1 text-center"><StatVal value={p.physical?.speed || 0} /></td>
                  <td className="py-0.5 px-1 text-center"><StatVal value={p.physical?.arm || 0} /></td>
                  <td className="py-0.5 px-1 text-center"><StatVal value={p.fielding?.defense || 0} /></td>
                  <td className="py-0.5 px-1 text-center"><StatVal value={p.batting?.eye || 0} /></td>
                  <td className="py-0.5 px-1 text-center"><StatVal value={p.batting?.steal || 0} /></td>
                  <td className="py-0.5 px-1 text-center"><StatVal value={p.pitching?.velocity || 0} isVel /></td>
                  <td className="py-0.5 px-1 text-center"><StatVal value={p.pitching?.control || 0} /></td>
                  <td className="py-0.5 px-1 text-center"><StatVal value={p.pitching?.stamina || 0} isSta /></td>
                  <td className="py-0.5 px-1 text-center">
                    {(() => {
                      const g = p.growthPotential || 1.0;
                      const color = g >= 1.3 ? 'text-pink-400' : g >= 1.15 ? 'text-orange-400' : g >= 1.0 ? 'text-yellow-400' : 'text-gray-400';
                      return <span className={`${color} font-bold`}>{g.toFixed(2)}</span>;
                    })()}
                  </td>
                  <td className="py-0.5 px-1 text-center text-gray-500">{p.fame || 0}</td>
                  <td className="py-0.5 px-1 text-center text-gray-400 whitespace-nowrap text-[10px]">
                    {handLabel(p.physical?.throws)}/{handLabel(p.batting?.bats)}
                  </td>
                  <td className="py-0.5 px-1 text-center text-gray-400 text-[10px]">
                    {p.position === 'pitcher' ? (FORM_SHORT[p.pitching?.form] || '-') : '-'}
                  </td>
                  {isScoutable && (
                    <td className="py-0.5 px-1 text-center" onClick={e => e.stopPropagation()}>
                      {alreadyScouted
                        ? <span className="text-[10px] text-green-400 font-bold">済</span>
                        : <button
                            className="text-[10px] px-1.5 py-0.5 bg-purple-700 hover:bg-purple-500 text-white rounded font-bold transition"
                            onClick={() => {
                              const teamData = TEAMS_DATA[userTeamName];
                              const uniRank = teamData?.universityData?.rank || 'C';
                              const reputation = teamData?.universityData?.reputation || 30;
                              const result = addHighSchoolPlayerToScoutList(p, uniRank, reputation);
                              setScoutAddMsg(result.success ? `${p.name} を候補追加` : '追加失敗');
                              setTimeout(() => setScoutAddMsg(null), 2000);
                              setScoutTick(v => v + 1);
                            }}
                          >+</button>
                      }
                    </td>
                  )}
                  {gameMode === 'university' && p._source !== 'highschool' && <td />}
                </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={gameMode === 'university' ? 20 : 19} className="py-8 text-center text-gray-500">
                  {sources.highschool && !sources.university && !sources.released && !sources.teams && highSchoolPool.players.length === 0
                    ? '高校生プールは4月に生成されます。4月以降に再度確認してください。'
                    : sources.highschool && highSchoolPool.players.length === 0
                    ? '高校生は4月以降に表示されます（現在プール未生成）'
                    : '条件に一致する選手が見つかりません'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Detail panel */}
        {selectedPlayer && (
          <div className="mt-3 bg-gray-800 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <span className={`font-bold text-base ${selectedPlayer.position === 'pitcher' ? 'text-red-400' : 'text-blue-300'}`}>{selectedPlayer.name}</span>
              <span className="text-gray-400 text-sm">{POSITION_NAMES[selectedPlayer.position]} / {selectedPlayer.age}歳</span>
              <span className={`text-xs ${selectedPlayer.physical?.build === 'large' ? 'text-orange-400' : selectedPlayer.physical?.build === 'small' ? 'text-cyan-400' : 'text-gray-400'}`}>
                {selectedPlayer.physical?.build === 'large' ? '大柄' : selectedPlayer.physical?.build === 'small' ? '小柄' : '中肉'}
              </span>
              <span className="text-gray-500 text-xs">{selectedPlayer._sourceLabel}</span>
              {gameMode === 'university' && selectedPlayer._source === 'highschool' && (() => {
                const scout = WORLD_DATA._universityScout;
                const alreadyIn = scout && (
                  (scout.candidates || []).some(c => c.id === selectedPlayer.id)
                  || (scout.recruited || []).some(c => c.id === selectedPlayer.id)
                );
                const teamData = TEAMS_DATA[userTeamName];
                const uniRank = teamData?.universityData?.rank || 'C';
                const reputation = teamData?.universityData?.reputation || 30;
                return alreadyIn
                  ? <span className="text-xs text-green-400 px-2 py-0.5 bg-green-900/40 rounded">候補登録済</span>
                  : <button
                      className="text-xs px-2 py-1 bg-purple-700 hover:bg-purple-600 text-white rounded transition font-bold"
                      onClick={() => {
                        const result = addHighSchoolPlayerToScoutList(selectedPlayer, uniRank, reputation);
                        setScoutAddMsg(result.success ? `${selectedPlayer.name} をスカウト候補に追加しました` : '追加できませんでした');
                        setTimeout(() => setScoutAddMsg(null), 3000);
                      }}
                    >推薦候補に追加</button>;
              })()}
              {scoutAddMsg && <span className="text-xs text-yellow-300">{scoutAddMsg}</span>}
              <button onClick={() => setSelectedPlayer(null)} className="ml-auto text-gray-500 hover:text-white">✕</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <div className="text-[10px] text-gray-500 font-bold mb-1">打撃・走塁</div>
                <div className="space-y-0.5 text-xs">
                  {[['ミート', selectedPlayer.batting?.meet], ['パワー', selectedPlayer.batting?.power], ['選球眼', selectedPlayer.batting?.eye],
                    ['走力', selectedPlayer.physical?.speed], ['盗塁', selectedPlayer.batting?.steal], ['バント', selectedPlayer.batting?.bunt],
                    ['肩力', selectedPlayer.physical?.arm], ['守備', selectedPlayer.fielding?.defense]
                  ].map(([label, val]) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-gray-400">{label}</span>
                      <StatVal value={val || 0} />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 font-bold mb-1">投球</div>
                <div className="space-y-0.5 text-xs">
                  {[['球速', selectedPlayer.pitching?.velocity, true, false], ['制球', selectedPlayer.pitching?.control],
                    ['スタミナ', selectedPlayer.pitching?.stamina, false, true]
                  ].map(([label, val, isVel, isSta]) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-gray-400">{label}</span>
                      <StatVal value={val || 0} isVel={isVel} isSta={isSta} />
                    </div>
                  ))}
                  <div className="flex justify-between">
                    <span className="text-gray-400">フォーム</span>
                    <span className="text-gray-300">{FORM_FULL[selectedPlayer.pitching?.form] || '-'}</span>
                  </div>
                  {(selectedPlayer.pitching?.arsenal || []).filter(a => a.name !== 'ストレート' && a.type !== 'straight').map((a, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-gray-400">{a.name || a.type}</span>
                      <span className="text-gray-300">{a.level}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 font-bold mb-1">その他</div>
                <div className="space-y-0.5 text-xs">
                  {[['成長率', (selectedPlayer.growthPotential || 1.0).toFixed(2)],
                    ['体力', selectedPlayer.physical?.bodyStamina], ['回復', selectedPlayer.physical?.recovery],
                    ['知名度', selectedPlayer.fame || 0],
                    ['投', selectedPlayer.physical?.throws ? handLabel(selectedPlayer.physical.throws) + '投' : '-'],
                    ['打', selectedPlayer.batting?.bats ? handLabel(selectedPlayer.batting.bats) + '打' : '-'],
                  ].map(([label, val]) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-gray-400">{label}</span>
                      <span className="text-gray-300">{val ?? '-'}</span>
                    </div>
                  ))}
                  {selectedPlayer.highSchool?.name && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">出身</span>
                      <span className="text-gray-300">{selectedPlayer.highSchool.name}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlayerSearchScreen;
