import React, { useState, useEffect } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { POSITION_NAMES, getAbilityColor } from '../utils/constants.js';
import {
  initUniversityScoutList,
  getUniversityScoutSlots,
  startUniversityInvestigation,
  toggleUniversityWatch,
  attemptUniversityRecruit,
  getUniversityScoutRecommendation,
  generateSelectionCandidates,
} from '../corporate/scoutingSystem.js';
import { highSchoolPool } from '../season/universityPool.js';
import { WORLD_DATA } from '../corporate/worldData.js';

const TOTAL_NEW_MEMBERS = { S: 15, A: 13, B: 11, C: 9, D: 7 };

const UniversityScoutScreen = ({ seasonData, onComplete, onBack }) => {
  const teamNames = Object.keys(TEAMS_DATA || {});
  const userTeamName = teamNames[0] || '';
  const teamData = TEAMS_DATA[userTeamName];
  const rank = teamData?.universityData?.rank || 'C';
  const reputation = teamData?.universityData?.reputation || 30;
  const maxSlots = getUniversityScoutSlots(rank);

  const scoutData = WORLD_DATA._universityScout || {};
  const [candidates, setCandidates] = useState(scoutData.candidates || []);
  const [recruited, setRecruited] = useState(scoutData.recruited || []);
  const [phase, setPhase] = useState('scout');
  const [negotiationResult, setNegotiationResult] = useState(null);
  const [sortKey, setSortKey] = useState('rate');
  const [sortAsc, setSortAsc] = useState(false);
  const [newDiscoveryCount, setNewDiscoveryCount] = useState(0);
  const [selectionCandidates, setSelectionCandidates] = useState([]);
  const [selectionPicked, setSelectionPicked] = useState([]);

  useEffect(() => {
    if (candidates.length === 0 && highSchoolPool.players?.length > 0 && !scoutData.initialized) {
      const list = initUniversityScoutList(teamData, rank);
      setCandidates(list);
      WORLD_DATA._universityScout = { candidates: list, recruited: [], initialized: true };
    }
  }, []);

  useEffect(() => {
    if (WORLD_DATA._universityScout) {
      WORLD_DATA._universityScout.candidates = candidates;
      WORLD_DATA._universityScout.recruited = recruited;
    }
  }, [candidates, recruited]);

  useEffect(() => {
    const nd = WORLD_DATA._universityScout?._newDiscoveries || 0;
    if (nd > 0) {
      setNewDiscoveryCount(nd);
      setCandidates(WORLD_DATA._universityScout?.candidates || []);
      WORLD_DATA._universityScout._newDiscoveries = 0;
    }
  });

  const remainingSlots = maxSlots - recruited.length;

  const getRateColor = (rate) => {
    if (rate >= 70) return 'text-red-400';
    if (rate >= 50) return 'text-yellow-400';
    if (rate >= 30) return 'text-green-400';
    return 'text-gray-400';
  };

  const recColor = (g) => ({ S: 'text-red-400', A: 'text-orange-400', B: 'text-yellow-400', C: 'text-green-400', D: 'text-blue-400' }[g] || 'text-gray-500');

  const handleInvestigate = (id) => {
    const c = candidates.find(p => p.id === id);
    if (!c) return;
    const ok = startUniversityInvestigation(c, seasonData.currentDate);
    if (ok) setCandidates([...candidates]);
  };

  const handleWatch = (id) => {
    const c = candidates.find(p => p.id === id);
    if (!c) return;
    toggleUniversityWatch(c);
    setCandidates([...candidates]);
  };

  const handleRecruit = (id) => {
    if (remainingSlots <= 0) return;
    const c = candidates.find(p => p.id === id);
    if (!c) return;
    c._negotiationAttempts = (c._negotiationAttempts || 0) + 1;
    const result = attemptUniversityRecruit(c, rank, reputation);
    setNegotiationResult({ player: c, ...result });
    if (result.success) {
      const orig = highSchoolPool.players?.find(hp => hp.id === c.id);
      if (orig) orig._universityReserved = userTeamName;
      setRecruited(prev => [...prev, c]);
      setCandidates(prev => prev.filter(p => p.id !== id));
    } else if (c._negotiationAttempts >= 3) {
      setCandidates(prev => prev.filter(p => p.id !== id));
    } else {
      setCandidates([...candidates]);
    }
  };

  const totalSlots = TOTAL_NEW_MEMBERS[rank] || 9;
  const selectionSlots = Math.max(0, totalSlots - recruited.length);

  const handleFinalize = () => {
    WORLD_DATA._universityScout = { ...WORLD_DATA._universityScout, finalized: true };
    const selCandidates = generateSelectionCandidates(rank, reputation, Math.max(15, selectionSlots * 3));
    setSelectionCandidates(selCandidates);
    setPhase('selection');
  };

  const handleSelectionPick = (player) => {
    if (selectionPicked.length >= selectionSlots) return;
    const orig = highSchoolPool.players?.find(hp => hp.id === player.id);
    if (orig) orig._universityReserved = userTeamName;
    setSelectionPicked(prev => [...prev, player]);
    setSelectionCandidates(prev => prev.filter(p => p.id !== player.id));
  };

  const handleSelectionFinalize = () => {
    if (onComplete) onComplete({ recommended: recruited, selection: selectionPicked });
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

  const revealLabel = (level) => {
    if (level >= 2) return <span className="text-green-400 text-[9px]">詳細</span>;
    if (level >= 1) return <span className="text-yellow-400 text-[9px]">概要</span>;
    return <span className="text-gray-500 text-[9px]">未知</span>;
  };

  if (negotiationResult) {
    const r = negotiationResult;
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-950 to-gray-900 p-4 flex items-center justify-center">
        <div className="max-w-md w-full">
          <div className={`rounded-xl p-6 border ${r.success ? 'bg-green-900/30 border-green-700/50' : 'bg-red-900/20 border-red-800/30'}`}>
            <div className="text-center mb-4">
              <span className={`text-2xl font-black ${r.success ? 'text-green-400' : 'text-red-400'}`}>
                {r.success ? '入部決定!' : '辞退...'}
              </span>
            </div>
            <div className="text-center mb-2">
              <span className="text-white font-bold text-lg">{r.player.name}</span>
              <span className="text-gray-400 text-sm ml-2">{POSITION_NAMES[r.player.position] || r.player.position}</span>
            </div>
            <div className="text-center text-gray-400 text-sm mb-1">{r.player._scoutSource}</div>
            <div className="text-center text-gray-500 text-xs mb-4">交渉成功率: {r.rate}%</div>
            {r.success && (
              <div className="text-center text-green-300 text-sm mb-4">
                スポーツ推薦枠で入部が決定しました (残り{remainingSlots - (r.success ? 1 : 0)}枠)
              </div>
            )}
            {!r.success && (
              <div className="text-center text-gray-400 text-sm mb-4">
                {(r.player._negotiationAttempts || 0) >= 3
                  ? '交渉回数の上限(3回)に達しました'
                  : `他校への進学を選びました（残り${3 - (r.player._negotiationAttempts || 0)}回交渉可能）`}
              </div>
            )}
            <div className="text-center">
              <button onClick={() => setNegotiationResult(null)}
                className="px-6 py-2 rounded-xl font-bold text-white bg-blue-700 hover:bg-blue-600 transition">
                戻る
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'selection') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-950 to-gray-900 p-3">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-black text-white">セレクション (一般入部試験)</h1>
              <p className="text-gray-400 text-xs mt-0.5">
                {userTeamName} ({rank}ランク) — 入部枠: 残り{selectionSlots - selectionPicked.length}/{selectionSlots}名
                {selectionPicked.length > 0 && <span className="text-green-400 ml-2">選出済{selectionPicked.length}名</span>}
              </p>
            </div>
            <button onClick={handleSelectionFinalize}
              className="px-4 py-2 rounded-lg font-bold text-sm bg-green-700 hover:bg-green-600 text-white transition">
              確定してオフシーズンへ
            </button>
          </div>

          {recruited.length > 0 && (
            <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-2 mb-2">
              <div className="text-[10px] text-blue-400 font-bold mb-1">推薦入部 ({recruited.length}名)</div>
              <div className="flex flex-wrap gap-2">
                {recruited.map((p, i) => (
                  <div key={i} className="bg-blue-900/40 rounded px-2 py-0.5 text-xs flex items-center gap-1">
                    <span className="text-white font-bold">{p.name}</span>
                    <span className="text-blue-300">{POSITION_NAMES[p.position]?.slice(0, 2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectionPicked.length > 0 && (
            <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-2 mb-2">
              <div className="text-[10px] text-green-400 font-bold mb-1">セレクション合格 ({selectionPicked.length}名)</div>
              <div className="flex flex-wrap gap-2">
                {selectionPicked.map((p, i) => (
                  <div key={i} className="bg-green-900/40 rounded px-2 py-0.5 text-xs flex items-center gap-1">
                    <span className="text-white font-bold">{p.name}</span>
                    <span className="text-green-300">{POSITION_NAMES[p.position]?.slice(0, 2)}</span>
                    <span className="text-green-400/60">{p.highSchool?.name || '高校'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectionCandidates.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg mb-4">セレクション参加者がいません</p>
              <button onClick={handleSelectionFinalize}
                className="px-6 py-2 rounded-xl font-bold text-white bg-green-700 hover:bg-green-600">
                オフシーズンへ
              </button>
            </div>
          ) : (
            <div className="bg-gray-800/60 rounded-xl border border-gray-700/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-700/50 text-[10px]">
                      <th className="py-1 px-1 text-gray-500 w-24">名前</th>
                      <th className="py-1 px-1 text-gray-500 w-10">守</th>
                      <th className="py-1 px-1 text-gray-500 w-8">年</th>
                      <th className="py-1 px-1 text-gray-500 w-8">体</th>
                      <th className="py-1 px-1 text-gray-500 w-16">出身校</th>
                      <th className="py-1 px-1 text-gray-500 w-10">球速</th>
                      <th className="py-1 px-1 text-gray-500 w-10">制球</th>
                      <th className="py-1 px-1 text-gray-500 w-8">ス</th>
                      <th className="py-1 px-1 text-gray-500 w-8">ミ</th>
                      <th className="py-1 px-1 text-gray-500 w-8">パ</th>
                      <th className="py-1 px-1 text-gray-500 w-8">眼</th>
                      <th className="py-1 px-1 text-gray-500 w-8">走</th>
                      <th className="py-1 px-1 text-gray-500 w-8">守</th>
                      <th className="py-1 px-1 text-gray-500 w-16">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectionCandidates.map(p => {
                      const sa = p.scoutedAbilities || {};
                      const canPick = selectionPicked.length < selectionSlots;
                      return (
                        <tr key={p.id} className="border-b border-gray-800/50 hover:bg-gray-700/20 transition">
                          <td className="py-1.5 px-1">
                            <span className="text-white font-bold truncate max-w-[96px]">{p.name}</span>
                          </td>
                          <td className="py-1.5 px-1 text-gray-400">{POSITION_NAMES[p.position]?.slice(0, 2) || p.position}</td>
                          <td className="py-1.5 px-1 text-gray-400 text-center">{p.age}</td>
                          <td className="py-1.5 px-1 text-center">
                            <span className={p.physical?.build === 'large' ? 'text-orange-400' : p.physical?.build === 'small' ? 'text-cyan-400' : 'text-gray-400'}>
                              {p.physical?.build === 'large' ? '大柄' : p.physical?.build === 'small' ? '小柄' : '中肉'}
                            </span>
                          </td>
                          <td className="py-1.5 px-1 text-gray-500 truncate max-w-[64px]">{p.highSchool?.name || '高校'}</td>
                          <td className="py-1.5 px-1 text-center">{renderVal(sa.pitching?.velocity, true)}</td>
                          <td className="py-1.5 px-1 text-center">{renderVal(sa.pitching?.control)}</td>
                          <td className="py-1.5 px-1 text-center">{renderVal(sa.pitching?.stamina)}</td>
                          <td className="py-1.5 px-1 text-center">{renderVal(sa.batting?.meet)}</td>
                          <td className="py-1.5 px-1 text-center">{renderVal(sa.batting?.power)}</td>
                          <td className="py-1.5 px-1 text-center">{renderVal(sa.batting?.eye)}</td>
                          <td className="py-1.5 px-1 text-center">{renderVal(sa.physical?.speed)}</td>
                          <td className="py-1.5 px-1 text-center">{renderVal(sa.fielding?.defense)}</td>
                          <td className="py-1.5 px-1">
                            {canPick && (
                              <button onClick={() => handleSelectionPick(p)}
                                className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-800 text-green-200 hover:bg-green-700 transition">
                                合格
                              </button>
                            )}
                          </td>
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
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 to-gray-900 p-3">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-black text-white">スポーツ推薦スカウト</h1>
            <p className="text-gray-400 text-xs mt-0.5">
              {userTeamName} ({rank}ランク) — 推薦枠: {remainingSlots}/{maxSlots}名
              {recruited.length > 0 && <span className="text-green-400 ml-2">確保済{recruited.length}名</span>}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <div className="text-gray-500 text-xs mr-2">
              調査: 5日 / 注目: +4%/週
            </div>
            {onComplete ? (
              <button onClick={handleFinalize}
                className="px-4 py-2 rounded-lg font-bold text-sm bg-green-700 hover:bg-green-600 text-white transition">
                推薦確定 → セレクションへ
              </button>
            ) : onBack ? (
              <button onClick={onBack}
                className="px-4 py-2 rounded-lg font-bold text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 transition">
                戻る
              </button>
            ) : null}
          </div>
        </div>

        {newDiscoveryCount > 0 && (
          <div className="bg-yellow-900/30 border border-yellow-700/40 rounded-xl p-2 mb-3 flex items-center justify-between">
            <span className="text-yellow-300 text-xs font-bold">
              新たに{newDiscoveryCount}名の候補者が見つかりました
            </span>
            <button onClick={() => setNewDiscoveryCount(0)}
              className="text-yellow-500 hover:text-yellow-300 text-xs px-2">
              ✕
            </button>
          </div>
        )}

        {recruited.length > 0 && (
          <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-2 mb-3">
            <div className="text-[10px] text-green-400 font-bold mb-1">確保済み選手</div>
            <div className="flex flex-wrap gap-2">
              {recruited.map((p, i) => (
                <div key={i} className="bg-green-900/40 rounded px-2 py-0.5 text-xs flex items-center gap-1">
                  <span className="text-white font-bold">{p.name}</span>
                  <span className="text-green-300">{POSITION_NAMES[p.position]?.slice(0, 2)}</span>
                  <span className="text-green-400/60">{p._scoutSource}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {candidates.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg mb-4">
              {highSchoolPool.players?.length > 0 ? 'スカウト候補が見つかりませんでした' : '高校生プールがまだ生成されていません (4月以降)'}
            </p>
            {onComplete && (
              <button onClick={handleFinalize} className="px-6 py-2 rounded-xl font-bold text-white bg-green-700 hover:bg-green-600">
                オフシーズンへ
              </button>
            )}
          </div>
        ) : (
          <div className="bg-gray-800/60 rounded-xl border border-gray-700/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-700/50 text-[10px]">
                    <SortHeader k="rec" label="推" w="w-8" />
                    <SortHeader k="name" label="名前" w="w-24" />
                    <th className="py-1 px-1 text-gray-500 w-10">守</th>
                    <SortHeader k="age" label="年" w="w-8" />
                    <th className="py-1 px-1 text-gray-500 w-8">体</th>
                    <th className="py-1 px-1 text-gray-500 w-16">出身</th>
                    <th className="py-1 px-1 text-gray-500 w-10">情報</th>
                    <SortHeader k="velocity" label="球速" w="w-10" />
                    <SortHeader k="control" label="制球" w="w-10" />
                    <SortHeader k="stamina" label="ス" w="w-8" />
                    <SortHeader k="meet" label="ミ" w="w-8" />
                    <SortHeader k="power" label="パ" w="w-8" />
                    <SortHeader k="eye" label="眼" w="w-8" />
                    <SortHeader k="speed" label="走" w="w-8" />
                    <SortHeader k="defense" label="守" w="w-8" />
                    <SortHeader k="rate" label="成功率" w="w-14" />
                    <th className="py-1 px-1 text-gray-500 w-32">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCandidates.map(p => {
                    const sa = p.scoutedAbilities || {};
                    const recGrade = getUniversityScoutRecommendation(p, rank);
                    const isInvestigating = p._investigating;
                    const canInvestigate = !isInvestigating && (p._revealLevel || 0) < 2;
                    const canRecruit = remainingSlots > 0 && !isInvestigating;
                    return (
                      <tr key={p.id} className="border-b border-gray-800/50 hover:bg-gray-700/20 transition">
                        <td className={`py-1.5 px-1 text-center font-black ${recColor(recGrade)}`}>{recGrade}</td>
                        <td className="py-1.5 px-1">
                          <div className="flex items-center gap-1">
                            {p._watching && <span className="text-yellow-400 text-[10px]" title="注目中">★</span>}
                            <span className="text-white font-bold truncate max-w-[96px]">{p.name}</span>
                          </div>
                        </td>
                        <td className="py-1.5 px-1 text-gray-400">{POSITION_NAMES[p.position]?.slice(0, 2) || p.position}</td>
                        <td className="py-1.5 px-1 text-gray-400 text-center">{p.age}</td>
                        <td className="py-1.5 px-1 text-center">
                          <span className={p.physical?.build === 'large' ? 'text-orange-400' : p.physical?.build === 'small' ? 'text-cyan-400' : 'text-gray-400'}>
                            {p.physical?.build === 'large' ? '大柄' : p.physical?.build === 'small' ? '小柄' : '中肉'}
                          </span>
                        </td>
                        <td className="py-1.5 px-1 text-gray-500 truncate max-w-[64px]">{p._scoutSource}</td>
                        <td className="py-1.5 px-1 text-center">{revealLabel(p._revealLevel || 0)}</td>
                        <td className="py-1.5 px-1 text-center">{renderVal(sa.pitching?.velocity, true)}</td>
                        <td className="py-1.5 px-1 text-center">{renderVal(sa.pitching?.control)}</td>
                        <td className="py-1.5 px-1 text-center">{renderVal(sa.pitching?.stamina)}</td>
                        <td className="py-1.5 px-1 text-center">{renderVal(sa.batting?.meet)}</td>
                        <td className="py-1.5 px-1 text-center">{renderVal(sa.batting?.power)}</td>
                        <td className="py-1.5 px-1 text-center">{renderVal(sa.batting?.eye)}</td>
                        <td className="py-1.5 px-1 text-center">{renderVal(sa.physical?.speed)}</td>
                        <td className="py-1.5 px-1 text-center">{renderVal(sa.fielding?.defense)}</td>
                        <td className={`py-1.5 px-1 text-center font-bold ${getRateColor(p.recruitRate)}`}>
                          {p.recruitRate}%
                          {(p._watchBonus || 0) > 0 && <span className="text-yellow-500 text-[9px] ml-0.5">+{p._watchBonus}</span>}
                        </td>
                        <td className="py-1.5 px-1">
                          <div className="flex gap-1">
                            <button onClick={() => handleWatch(p.id)}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition ${
                                p._watching ? 'bg-yellow-700 text-yellow-200' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                              title={p._watching ? '注目解除' : '注目 (+4%/週)'}>
                              {p._watching ? '★注目中' : '☆注目'}
                            </button>
                            {canInvestigate && (
                              <button onClick={() => handleInvestigate(p.id)}
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-800 text-cyan-200 hover:bg-cyan-700 transition">
                                調査
                              </button>
                            )}
                            {isInvestigating && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-700 text-gray-400">
                                調査中...
                              </span>
                            )}
                            {canRecruit && (p._negotiationAttempts || 0) < 3 && (
                              <button onClick={() => handleRecruit(p.id)}
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-800 text-blue-200 hover:bg-blue-700 transition">
                                交渉{(p._negotiationAttempts || 0) > 0 ? `(${3 - p._negotiationAttempts})` : ''}
                              </button>
                            )}
                          </div>
                        </td>
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
