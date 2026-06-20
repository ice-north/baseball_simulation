import React, { useState, useEffect } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { POSITION_NAMES, getAbilityColor } from '../utils/constants.js';
import {
  generateUniversityScoutCandidates,
  getUniversityScoutSlots,
  attemptUniversityRecruit,
  getUniversityScoutRecommendation,
} from '../corporate/scoutingSystem.js';
import { highSchoolPool } from '../season/universityPool.js';
import { generatePositionFitness } from '../season/tryoutSystem.js';

const UniversityScoutScreen = ({ seasonData, onComplete }) => {
  const teamNames = Object.keys(TEAMS_DATA || {});
  const userTeamName = teamNames[0] || '';
  const teamData = TEAMS_DATA[userTeamName];
  const rank = teamData?.universityData?.rank || 'C';
  const reputation = teamData?.universityData?.reputation || 30;

  const maxSlots = getUniversityScoutSlots(rank);
  const [candidates, setCandidates] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [phase, setPhase] = useState('scout');
  const [results, setResults] = useState([]);
  const [allRecruited, setAllRecruited] = useState([]);
  const [sortKey, setSortKey] = useState('rate');
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    if (candidates.length > 0) return;
    const scouted = generateUniversityScoutCandidates(teamData, rank);
    setCandidates(scouted);
  }, []);

  const toggleSelect = (playerId) => {
    setSelectedIds(prev => {
      if (prev.includes(playerId)) return prev.filter(id => id !== playerId);
      if (prev.length >= maxSlots - allRecruited.length) return prev;
      return [...prev, playerId];
    });
  };

  const getRateColor = (rate) => {
    if (rate >= 70) return 'text-red-400';
    if (rate >= 50) return 'text-yellow-400';
    if (rate >= 30) return 'text-green-400';
    return 'text-gray-400';
  };

  const recColor = (g) => ({ S: 'text-red-400', A: 'text-orange-400', B: 'text-yellow-400', C: 'text-green-400', D: 'text-blue-400' }[g] || 'text-gray-500');

  const handleNegotiate = () => {
    const res = [];
    const removedIds = new Set();
    selectedIds.forEach(id => {
      if (allRecruited.length + res.filter(r => r.success).length >= maxSlots) return;
      const player = candidates.find(c => c.id === id);
      if (!player) return;
      const result = attemptUniversityRecruit(player, rank, reputation);
      res.push({ player, ...result });
      removedIds.add(id);
    });
    setResults(res);
    const newRecruited = res.filter(r => r.success).map(r => r.player);
    setAllRecruited(prev => [...prev, ...newRecruited]);
    setCandidates(prev => prev.filter(c => !removedIds.has(c.id)));
    setSelectedIds([]);
    setPhase('results');
  };

  const handleContinue = () => {
    if (allRecruited.length >= maxSlots || candidates.length === 0) {
      handleFinalize();
    } else {
      setPhase('scout');
      setResults([]);
    }
  };

  const handleFinalize = () => {
    allRecruited.forEach(p => {
      const ref = p._poolRef;
      if (ref?.source === 'highschool' && ref.poolIndex != null) {
        const origPlayer = highSchoolPool.players.find(hp => hp.id === p.id);
        if (origPlayer) {
          origPlayer._universityReserved = userTeamName;
        }
      }
    });
    setPhase('confirmed');
  };

  const handleDone = () => {
    if (onComplete) onComplete(allRecruited);
  };

  const handleSort = (key) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === 'age' || key === 'name'); }
  };

  const getAbilityVal = (p, key) => {
    const sa = p.scoutedAbilities || {};
    const map = {
      velocity: sa.pitching?.velocity, control: sa.pitching?.control, stamina: sa.pitching?.stamina,
      meet: sa.batting?.meet, power: sa.batting?.power, eye: sa.batting?.eye,
      speed: sa.physical?.speed, defense: sa.fielding?.defense,
      professionalism: sa.professionalism,
    };
    const v = map[key];
    return (v === '?' || v === undefined) ? -1 : (typeof v === 'number' ? v : parseInt(v));
  };

  const getSortValue = (p, key) => {
    const recGradeOrder = { S: 5, A: 4, B: 3, C: 2, D: 1 };
    switch (key) {
      case 'rate': return p.recruitRate || 0;
      case 'age': return p.age || 99;
      case 'name': return p.name || '';
      case 'rec': return recGradeOrder[getUniversityScoutRecommendation(p, rank)] || 0;
      default: return getAbilityVal(p, key);
    }
  };

  const sortedCandidates = [...candidates].sort((a, b) => {
    const va = getSortValue(a, sortKey);
    const vb = getSortValue(b, sortKey);
    if (sortKey === 'name') return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    return sortAsc ? va - vb : vb - va;
  });

  const remainingSlots = maxSlots - allRecruited.length;

  const SortHeader = ({ k, label, w }) => (
    <th onClick={() => handleSort(k)}
      className={`py-1 px-1 cursor-pointer hover:text-white transition select-none whitespace-nowrap ${w || ''} ${sortKey === k ? 'text-cyan-400' : 'text-gray-500'}`}>
      {label}{sortKey === k ? (sortAsc ? ' ▲' : ' ▼') : ''}
    </th>
  );

  const renderVal = (val, isVelocity) => {
    if (val === '?' || val === undefined) return <span className="text-gray-600">?</span>;
    const n = typeof val === 'number' ? val : parseInt(val);
    if (isNaN(n)) return <span className="text-gray-600">?</span>;
    return <span className={`font-bold ${getAbilityColor(isVelocity ? Math.min(99, (n - 120) * 2) : n)}`}>{val}</span>;
  };

  if (phase === 'results') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-950 to-gray-900 p-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-xl font-black text-white mb-4">スポーツ推薦 交渉結果</h1>
          <div className="space-y-2 mb-4">
            {results.map((r, i) => (
              <div key={i} className={`rounded-xl p-3 border ${r.success ? 'bg-green-900/30 border-green-700/50' : 'bg-red-900/20 border-red-800/30'}`}>
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-bold ${r.success ? 'text-green-400' : 'text-red-400'}`}>
                    {r.success ? '入部決定' : '辞退'}
                  </span>
                  <span className="text-white font-bold">{r.player.name}</span>
                  <span className="text-gray-400 text-sm">{POSITION_NAMES[r.player.position] || r.player.position}</span>
                  <span className="text-gray-500 text-sm">{r.player._scoutSource}</span>
                </div>
                <div className="text-gray-400 text-xs mt-1">
                  交渉成功率: {r.rate}%
                  {r.success && ' — スポーツ推薦枠で入部'}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <div className="text-gray-400 text-sm">
              推薦確保: {allRecruited.length}/{maxSlots}名
            </div>
            <button onClick={handleContinue}
              className="px-6 py-2 rounded-xl font-bold text-white bg-blue-700 hover:bg-blue-600 transition">
              {allRecruited.length >= maxSlots || candidates.length === 0 ? '確定' : '続ける'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'confirmed') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-950 to-gray-900 p-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-xl font-black text-white mb-4">スポーツ推薦 確定</h1>
          <div className="bg-gray-800/60 rounded-xl p-4 border border-gray-700/50 mb-4">
            <h2 className="text-sm font-bold text-blue-400 mb-2">推薦入部者 ({allRecruited.length}名)</h2>
            {allRecruited.length === 0 ? (
              <p className="text-gray-500 text-sm">推薦入部者はいません。一般入部のみで新入生を迎えます。</p>
            ) : (
              <div className="space-y-1">
                {allRecruited.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="text-green-400 font-bold">{p.name}</span>
                    <span className="text-gray-400">{POSITION_NAMES[p.position] || p.position}</span>
                    <span className="text-gray-500">{p._scoutSource}</span>
                    {p.position === 'pitcher' ? (
                      <span className="text-gray-500">{p.pitching?.velocity}km 制球{p.pitching?.control}</span>
                    ) : (
                      <span className="text-gray-500">ミ{p.batting?.meet} パ{p.batting?.power} 走{p.physical?.speed}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="text-center">
            <button onClick={handleDone}
              className="px-8 py-3 rounded-xl font-bold text-white bg-green-700 hover:bg-green-600 transition text-lg">
              オフシーズンへ
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Scout phase
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 to-gray-900 p-3">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-black text-white">スポーツ推薦スカウト</h1>
            <p className="text-gray-400 text-xs mt-0.5">
              {userTeamName} ({rank}ランク) — 推薦枠: {remainingSlots}名残り (確保済{allRecruited.length}/{maxSlots})
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleNegotiate}
              disabled={selectedIds.length === 0}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition ${
                selectedIds.length > 0 ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
              交渉する ({selectedIds.length}名)
            </button>
            <button onClick={() => { setSelectedIds([]); handleFinalize(); }}
              className="px-4 py-2 rounded-lg font-bold text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 transition">
              スキップ
            </button>
          </div>
        </div>

        {candidates.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg mb-4">スカウト候補が見つかりませんでした</p>
            <button onClick={handleDone} className="px-6 py-2 rounded-xl font-bold text-white bg-green-700 hover:bg-green-600">
              オフシーズンへ
            </button>
          </div>
        ) : (
          <div className="bg-gray-800/60 rounded-xl border border-gray-700/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-700/50 text-[10px]">
                    <th className="py-1 px-1 text-gray-600 w-8"></th>
                    <SortHeader k="rec" label="推" w="w-8" />
                    <SortHeader k="name" label="名前" w="w-24" />
                    <th className="py-1 px-1 text-gray-500 w-10">守</th>
                    <SortHeader k="age" label="年" w="w-8" />
                    <th className="py-1 px-1 text-gray-500 w-16">出身</th>
                    <SortHeader k="velocity" label="球速" w="w-10" />
                    <SortHeader k="control" label="制球" w="w-10" />
                    <SortHeader k="stamina" label="ス" w="w-8" />
                    <SortHeader k="meet" label="ミ" w="w-8" />
                    <SortHeader k="power" label="パ" w="w-8" />
                    <SortHeader k="eye" label="眼" w="w-8" />
                    <SortHeader k="speed" label="走" w="w-8" />
                    <SortHeader k="defense" label="守" w="w-8" />
                    <SortHeader k="professionalism" label="意" w="w-8" />
                    <SortHeader k="rate" label="成功率" w="w-14" />
                  </tr>
                </thead>
                <tbody>
                  {sortedCandidates.map((p, i) => {
                    const sa = p.scoutedAbilities || {};
                    const isSelected = selectedIds.includes(p.id);
                    const canSelect = isSelected || selectedIds.length < remainingSlots;
                    const recGrade = getUniversityScoutRecommendation(p, rank);
                    return (
                      <tr key={p.id} onClick={() => canSelect && toggleSelect(p.id)}
                        className={`border-b border-gray-800/50 cursor-pointer transition ${
                          isSelected ? 'bg-blue-900/40' : 'hover:bg-gray-700/30'} ${!canSelect ? 'opacity-50' : ''}`}>
                        <td className="py-1.5 px-1 text-center">
                          <span className={`inline-block w-4 h-4 rounded border ${
                            isSelected ? 'bg-blue-500 border-blue-400' : 'border-gray-600'}`}>
                            {isSelected && <span className="text-white text-[10px]">✓</span>}
                          </span>
                        </td>
                        <td className={`py-1.5 px-1 text-center font-black ${recColor(recGrade)}`}>{recGrade}</td>
                        <td className="py-1.5 px-1 text-white font-bold truncate max-w-[96px]">{p.name}</td>
                        <td className="py-1.5 px-1 text-gray-400">{POSITION_NAMES[p.position]?.slice(0, 2) || p.position}</td>
                        <td className="py-1.5 px-1 text-gray-400 text-center">{p.age}</td>
                        <td className="py-1.5 px-1 text-gray-500 truncate max-w-[64px]">{p._scoutSource}</td>
                        <td className="py-1.5 px-1 text-center">{renderVal(sa.pitching?.velocity, true)}</td>
                        <td className="py-1.5 px-1 text-center">{renderVal(sa.pitching?.control)}</td>
                        <td className="py-1.5 px-1 text-center">{renderVal(sa.pitching?.stamina)}</td>
                        <td className="py-1.5 px-1 text-center">{renderVal(sa.batting?.meet)}</td>
                        <td className="py-1.5 px-1 text-center">{renderVal(sa.batting?.power)}</td>
                        <td className="py-1.5 px-1 text-center">{renderVal(sa.batting?.eye)}</td>
                        <td className="py-1.5 px-1 text-center">{renderVal(sa.physical?.speed)}</td>
                        <td className="py-1.5 px-1 text-center">{renderVal(sa.fielding?.defense)}</td>
                        <td className="py-1.5 px-1 text-center">{renderVal(sa.professionalism)}</td>
                        <td className={`py-1.5 px-1 text-center font-bold ${getRateColor(p.recruitRate)}`}>{p.recruitRate}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UniversityScoutScreen;
