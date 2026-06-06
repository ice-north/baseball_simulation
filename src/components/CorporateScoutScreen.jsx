import React, { useState, useEffect } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { POSITION_NAMES, getAbilityRank, getAbilityColor } from '../utils/constants.js';
import {
  getScoutedCandidates,
  generateRivalInterest,
  negotiateWithCompetition,
  processAIScoutRecruitment,
  investigatePlayer,
  getFavoriteBonus,
} from '../corporate/scoutingSystem.js';

const getRankColor = (rank) => {
  if (rank === 'S') return 'text-red-400';
  if (rank === 'A') return 'text-orange-400';
  if (rank === 'B') return 'text-yellow-400';
  if (rank === 'C') return 'text-green-400';
  if (rank === 'D') return 'text-blue-400';
  return 'text-gray-500';
};

const CorporateScoutScreen = ({ seasonData, allTeams, draftedPlayerIds = [], onComplete }) => {
  const teamNames = Object.keys(TEAMS_DATA || {});
  const userTeamName = teamNames[0] || '';
  const teamData = TEAMS_DATA[userTeamName];

  const [candidates, setCandidates] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [aiResults, setAiResults] = useState(null);
  const [phase, setPhase] = useState('scout');
  const [negotiationResults, setNegotiationResults] = useState([]);
  const [allResults, setAllResults] = useState([]);
  const [sortKey, setSortKey] = useState('rate');
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedScoutId, setSelectedScoutId] = useState(null);

  const staff = teamData?.corporateData?.staff || [];
  const scouts = staff.filter(s =>
    (s.abilities?.scoutingEye || 0) >= 30 || (s.abilities?.negotiation || 0) >= 30
  );
  const selectedScout = scouts.find(s => s.id === selectedScoutId) || null;

  useEffect(() => {
    if (candidates.length > 0) return;
    const draftedSet = new Set(draftedPlayerIds);
    const scouted = getScoutedCandidates(teamData).filter(p => !draftedSet.has(p.id));
    const withRivals = generateRivalInterest(scouted);
    setCandidates(withRivals);
  }, []);

  const toggleSelect = (playerId) => {
    setSelectedIds(prev =>
      prev.includes(playerId) ? prev.filter(id => id !== playerId) : [...prev, playerId]
    );
  };

  const getRateColor = (rate) => {
    if (rate >= 80) return 'text-green-400';
    if (rate >= 60) return 'text-blue-400';
    if (rate >= 40) return 'text-yellow-400';
    if (rate >= 20) return 'text-orange-400';
    return 'text-red-400';
  };

  const getScoutNegotiationBonus = (scout) => {
    if (!scout) return 0;
    const neg = scout.abilities?.negotiation || 0;
    const eye = scout.abilities?.scoutingEye || 0;
    return Math.round((neg * 0.7 + eye * 0.3) / 5);
  };

  const handleNegotiate = () => {
    const results = [];
    selectedIds.forEach(id => {
      const player = candidates.find(c => c.id === id);
      if (player) {
        const scoutBonus = getScoutNegotiationBonus(selectedScout);
        const modifiedRate = Math.min(95, (player.recruitRate || 0) + scoutBonus);
        const result = negotiateWithCompetition(teamData, { ...player, recruitRate: modifiedRate }, teamData);
        results.push({ player, ...result, scoutName: selectedScout?.name || null });
      }
    });
    setNegotiationResults(results);
    setAllResults(prev => [...prev, ...results]);
    const negotiatedIds = new Set(selectedIds);
    setCandidates(prev => prev.filter(c => !negotiatedIds.has(c.id)));
    setSelectedIds([]);
    setPhase('results');
  };

  const handleContinue = () => {
    if (candidates.length > 0) {
      setPhase('scout');
      setNegotiationResults([]);
    } else {
      handleFinalize();
    }
  };

  const handleFinalize = () => {
    const year = seasonData?.year || 1;
    const aiRes = processAIScoutRecruitment(TEAMS_DATA, userTeamName, year);
    setAiResults(aiRes);
    setPhase('confirmed');
  };

  const handleSkip = () => {
    const year = seasonData?.year || 1;
    setNegotiationResults([]);
    setSelectedIds([]);
    const aiRes = processAIScoutRecruitment(TEAMS_DATA, userTeamName, year);
    setAiResults(aiRes);
    setPhase('confirmed');
  };

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === 'age' || key === 'name');
    }
  };

  const getSortValue = (p, key) => {
    const sa = p.scoutedAbilities || {};
    switch (key) {
      case 'rate': return p.recruitRate || 0;
      case 'age': return p.age || 99;
      case 'growth': return p.growthPotential || 1;
      case 'name': return p.name || '';
      case 'meet': return sa.batting?.meet ?? p.batting?.meet ?? 0;
      case 'power': return sa.batting?.power ?? p.batting?.power ?? 0;
      case 'speed': return sa.physical?.speed ?? p.physical?.speed ?? 0;
      case 'defense': return sa.fielding?.defense ?? p.fielding?.defense ?? 0;
      case 'velocity': return sa.pitching?.velocity ?? p.pitching?.velocity ?? 0;
      case 'control': return sa.pitching?.control ?? p.pitching?.control ?? 0;
      default: return 0;
    }
  };

  const sortedCandidates = [...candidates].sort((a, b) => {
    const va = getSortValue(a, sortKey);
    const vb = getSortValue(b, sortKey);
    if (sortKey === 'name') {
      return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    }
    return sortAsc ? va - vb : vb - va;
  });

  const reputation = teamData?.corporateData?.reputation || 0;
  const rank = teamData?.corporateData?.rank || 'C';
  const totalAcquired = allResults.filter(r => r.success).length;
  const totalAiRecruited = aiResults ? Object.values(aiResults).reduce((sum, arr) => sum + arr.length, 0) : 0;

  const SortHeader = ({ label, sortId, className = '' }) => (
    <th
      className={`px-1.5 py-1.5 cursor-pointer hover:text-white select-none whitespace-nowrap ${className}`}
      onClick={() => handleSort(sortId)}
    >
      {label}{sortKey === sortId ? (sortAsc ? ' ▲' : ' ▼') : ''}
    </th>
  );

  const renderVal = (val) => {
    if (val === '?' || val === undefined || val === null) return <span className="text-gray-600">?</span>;
    const n = typeof val === 'number' ? val : parseInt(val);
    if (isNaN(n)) return <span className="text-gray-600">?</span>;
    const r = getAbilityRank(n);
    return <span className={getRankColor(r)}>{r}</span>;
  };

  const renderVel = (val) => {
    if (val === '?' || val === undefined || val === null) return <span className="text-gray-600">?</span>;
    const n = typeof val === 'number' ? val : parseInt(val);
    if (isNaN(n)) return <span className="text-gray-600">?</span>;
    return <span className={n >= 145 ? 'text-red-400' : n >= 135 ? 'text-orange-400' : 'text-gray-300'}>{n}</span>;
  };

  // 交渉結果画面
  if (phase === 'results') {
    const successes = negotiationResults.filter(r => r.success);
    const remaining = candidates.length;

    return (
      <div className="p-4 bg-gray-900 min-h-screen">
        <h1 className="text-xl font-bold text-white mb-1">交渉結果</h1>
        <p className="text-xs text-gray-500 mb-4">
          {negotiationResults.length}名に打診 → {successes.length}名が入団承諾
          {totalAcquired > 0 && <span className="text-green-400 ml-2">(累計{totalAcquired}名獲得)</span>}
        </p>

        <div className="space-y-2 mb-6">
          {negotiationResults.map(({ player: p, success, rate, rivalResult, scoutName }) => (
            <div key={p.id} className={`p-3 rounded border ${
              success ? 'bg-green-900/20 border-green-700' : 'bg-red-900/10 border-red-900/30'
            }`}>
              <div className="flex items-center gap-2 text-sm">
                <span className={`font-bold text-lg w-8 text-center ${success ? 'text-green-400' : 'text-red-400'}`}>
                  {success ? 'O' : 'X'}
                </span>
                <span className="text-yellow-400 font-bold">{POSITION_NAMES[p.position]}</span>
                <span className="text-white font-medium">{p.name}</span>
                <span className="text-gray-500 text-xs">({p.age}歳)</span>
                {scoutName && <span className="text-cyan-400 text-xs">担当: {scoutName}</span>}
                <span className={`ml-auto text-xs ${getRateColor(rate)}`}>
                  獲得率{rate}%
                </span>
              </div>
              <div className="ml-10 mt-1 text-xs">
                {success ? (
                  <span className="text-green-400">入団が決まりました! キャンプから合流します。</span>
                ) : rivalResult === 'declined' ? (
                  <span className="text-gray-500">本人が入団を辞退しました</span>
                ) : rivalResult ? (
                  <span className="text-gray-500">{rivalResult}ランクのチームへの入団が決まりました</span>
                ) : (
                  <span className="text-gray-500">条件面で折り合いがつきませんでした</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4">
          {remaining > 0 && (
            <button onClick={handleContinue}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-sm"
            >追加交渉する (残り{remaining}名)</button>
          )}
          <button onClick={handleFinalize}
            className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-bold text-sm"
          >交渉を終了する</button>
        </div>
      </div>
    );
  }

  // 最終確認画面
  if (phase === 'confirmed') {
    return (
      <div className="p-4 bg-gray-900 min-h-screen">
        <h1 className="text-xl font-bold text-white mb-3">スカウト入団完了</h1>
        {totalAcquired > 0 ? (
          <div className="mb-4">
            <p className="text-green-400 text-sm mb-2">今シーズンは{totalAcquired}名を獲得しました</p>
            <div className="space-y-1">
              {allResults.filter(r => r.success).map(({ player: p }, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-green-900/20 border border-green-700/30 rounded p-2">
                  <span className="text-yellow-400 font-bold">{POSITION_NAMES[p.position]}</span>
                  <span className="text-white font-medium">{p.name}</span>
                  <span className="text-gray-500">({p.age}歳)</span>
                  <span className="text-cyan-400">{p._scoutSource}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-gray-400 text-sm mb-4">今シーズンは選手を獲得しませんでした。</p>
        )}

        {totalAiRecruited > 0 && (
          <div className="mb-4">
            <h2 className="text-sm font-bold text-blue-400 mb-2">他チームのスカウト獲得 ({totalAiRecruited}名)</h2>
            {Object.entries(aiResults).map(([team, players]) => (
              <div key={team} className="text-xs text-gray-400 mb-1">
                {team}: {players.map(p => `${p.name}(${POSITION_NAMES[p.position]})`).join(', ')}
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-gray-500 mb-3">
          現在のロスター: {teamData?.players?.length || 0}名
          {totalAcquired > 0 && <span className="text-green-400 ml-2">(入団した選手はキャンプから合流します)</span>}
        </p>
        <button onClick={onComplete}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold"
        >完了</button>
      </div>
    );
  }

  // メインのスカウト交渉画面
  return (
    <div className="p-3 bg-gray-900 min-h-screen">
      <h1 className="text-xl font-bold text-white mb-1">スカウト交渉 - {seasonData?.year || 1}年目</h1>
      <div className="flex items-center gap-4 text-[10px] text-gray-500 mb-2">
        <span>注目度: <span className={reputation >= 50 ? 'text-yellow-400' : 'text-gray-400'}>{reputation}</span></span>
        <span>ランク: <span className="text-white">{rank}</span></span>
        <span>ロスター: {teamData?.players?.length || 0}名</span>
        <span>選択中: <span className="text-green-400 font-bold">{selectedIds.length}名</span></span>
        {totalAcquired > 0 && <span className="text-green-400">獲得済: {totalAcquired}名</span>}
      </div>

      {/* 担当スカウト選択 */}
      {scouts.length > 0 && (
        <div className="mb-2 p-2 bg-gray-800 rounded border border-gray-700">
          <div className="text-[10px] text-gray-400 mb-1">担当スカウト (交渉成功率に影響)</div>
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setSelectedScoutId(null)}
              className={`px-2 py-1 rounded text-[10px] font-bold transition ${
                !selectedScoutId ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'
              }`}
            >指定なし</button>
            {scouts.map(s => {
              const bonus = getScoutNegotiationBonus(s);
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedScoutId(s.id)}
                  className={`px-2 py-1 rounded text-[10px] font-bold transition ${
                    selectedScoutId === s.id ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'
                  }`}
                >
                  {s.name}
                  <span className="text-gray-500 ml-1">{s.grade}級</span>
                  <span className={`ml-1 ${bonus > 0 ? 'text-green-400' : 'text-gray-500'}`}>
                    交渉{s.abilities?.negotiation || 0}
                  </span>
                  {bonus > 0 && <span className="text-green-400 ml-0.5">+{bonus}%</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {candidates.length > 0 ? (
        <div className="overflow-x-auto mb-3">
          <table className="w-full text-[11px] border-collapse">
            <thead className="bg-gray-700 text-gray-400 text-[10px]">
              <tr>
                <th className="px-1 py-1.5 w-6"></th>
                <SortHeader label="名前" sortId="name" className="text-left" />
                <SortHeader label="齢" sortId="age" />
                <th className="px-1.5 py-1.5 whitespace-nowrap">守備</th>
                <SortHeader label="ミ" sortId="meet" />
                <SortHeader label="パ" sortId="power" />
                <SortHeader label="走" sortId="speed" />
                <SortHeader label="守" sortId="defense" />
                <SortHeader label="球速" sortId="velocity" />
                <SortHeader label="制球" sortId="control" />
                <SortHeader label="成長" sortId="growth" />
                <SortHeader label="成功率" sortId="rate" />
                <th className="px-1.5 py-1.5 whitespace-nowrap">出身</th>
              </tr>
            </thead>
            <tbody>
              {sortedCandidates.map(player => {
                const selected = selectedIds.includes(player.id);
                const sa = player.scoutedAbilities || {};
                const isPitcher = player.position === 'pitcher';
                const rate = player.recruitRate || 0;
                const scoutBonus = getScoutNegotiationBonus(selectedScout);
                const adjustedRate = Math.min(95, rate + scoutBonus);
                const gp = player.growthPotential;

                return (
                  <tr
                    key={player.id}
                    onClick={() => toggleSelect(player.id)}
                    className={`cursor-pointer border-b border-gray-800 transition ${
                      selected
                        ? 'bg-green-900/30'
                        : 'hover:bg-gray-800/80'
                    }`}
                  >
                    <td className="px-1 py-1 text-center">
                      <span className={`inline-block w-3.5 h-3.5 rounded border text-[9px] leading-[14px] text-center ${
                        selected ? 'bg-green-600 border-green-500 text-white' : 'border-gray-600'
                      }`}>
                        {selected ? '✓' : ''}
                      </span>
                    </td>
                    <td className="px-1.5 py-1 text-white font-bold whitespace-nowrap">{player.name}</td>
                    <td className="px-1.5 py-1 text-gray-400 text-center">{player.age}</td>
                    <td className="px-1.5 py-1 text-yellow-400 text-center font-bold">{POSITION_NAMES[player.position]}</td>
                    <td className="px-1.5 py-1 text-center">{renderVal(sa.batting?.meet ?? (isPitcher ? null : player.batting?.meet))}</td>
                    <td className="px-1.5 py-1 text-center">{renderVal(sa.batting?.power ?? (isPitcher ? null : player.batting?.power))}</td>
                    <td className="px-1.5 py-1 text-center">{renderVal(sa.physical?.speed ?? (isPitcher ? null : player.physical?.speed))}</td>
                    <td className="px-1.5 py-1 text-center">{renderVal(sa.fielding?.defense ?? (isPitcher ? null : player.fielding?.defense))}</td>
                    <td className="px-1.5 py-1 text-center">{renderVel(sa.pitching?.velocity ?? (isPitcher ? player.pitching?.velocity : null))}</td>
                    <td className="px-1.5 py-1 text-center">{renderVal(sa.pitching?.control ?? (isPitcher ? player.pitching?.control : null))}</td>
                    <td className="px-1.5 py-1 text-center">
                      {gp != null ? (
                        <span className={gp >= 1.1 ? 'text-yellow-400 font-bold' : gp >= 0.95 ? 'text-gray-300' : 'text-gray-500'}>
                          {gp.toFixed(2)}
                        </span>
                      ) : <span className="text-gray-600">?</span>}
                    </td>
                    <td className="px-1.5 py-1 text-center whitespace-nowrap">
                      <span className={`font-bold ${getRateColor(adjustedRate)}`}>
                        {adjustedRate}%
                      </span>
                      {scoutBonus > 0 && <span className="text-green-400 text-[9px] ml-0.5">+{scoutBonus}</span>}
                      {(player._investigationCount || 0) > 0 && (
                        <span className="text-cyan-400 text-[9px] ml-0.5">調+{(player._investigationCount || 0) * 7}</span>
                      )}
                      {getFavoriteBonus(teamData, player.id) > 0 && (
                        <span className="text-yellow-400 text-[9px] ml-0.5">★+{getFavoriteBonus(teamData, player.id)}</span>
                      )}
                    </td>
                    <td className="px-1.5 py-1 text-cyan-400 text-[10px] whitespace-nowrap">{player._scoutSource}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-gray-800/50 rounded-lg p-6 text-center mb-4">
          <p className="text-gray-400 text-sm mb-2">スカウト候補者がいません</p>
          <p className="text-gray-500 text-xs">シーズン中にチーム運営画面からスカウトを派遣してください</p>
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          onClick={handleNegotiate}
          disabled={selectedIds.length === 0}
          className={`px-5 py-2 rounded font-bold text-sm ${
            selectedIds.length > 0
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >交渉開始 ({selectedIds.length}名)</button>
        <button onClick={handleSkip}
          className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm"
        >獲得なしで進む</button>
      </div>
    </div>
  );
};

export default CorporateScoutScreen;
