import React, { useState, useEffect } from 'react';
import PlayerDetailModal from './PlayerDetailModal.jsx';
import { TEAMS_DATA } from '../teams-data.js';
import { POSITION_NAMES } from '../utils/constants.js';
import { AbilityValue } from './AbilityValue.jsx';
import {
  getScoutedCandidates,
  generateRivalInterest,
  negotiateWithCompetition,
  processAIScoutRecruitment,
  getFavoriteBonus,
  calculateRecruitSuccessRate,
  estimateRivalCount,
  getScoutRecommendation,
  pickRandomDestination,
} from '../corporate/scoutingSystem.js';

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
  const [modalPlayer, setModalPlayer] = useState(null);

  const staff = teamData?.corporateData?.staff || [];
  const scouts = staff.filter(s =>
    (s.abilities?.scoutingEye || 0) >= 30 || (s.abilities?.negotiation || 0) >= 30
  );
  const selectedScout = scouts.find(s => s.id === selectedScoutId) || null;
  const teamRank = teamData?.corporateData?.rank || 'C';

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
    if (rate >= 80) return 'text-pink-400';
    if (rate >= 70) return 'text-red-400';
    if (rate >= 60) return 'text-orange-400';
    if (rate >= 50) return 'text-yellow-400';
    if (rate >= 40) return 'text-green-400';
    if (rate >= 30) return 'text-blue-400';
    return 'text-gray-300';
  };

  const recColor = (g) => ({ S: 'text-red-400', A: 'text-orange-400', B: 'text-yellow-400', C: 'text-green-400', D: 'text-blue-400', F: 'text-gray-400' }[g] || 'text-gray-400');

  const getScoutNegotiationBonus = (scout) => {
    if (!scout) return 0;
    const neg = scout.abilities?.negotiation || 0;
    const eye = scout.abilities?.scoutingEye || 0;
    return Math.round((neg * 0.7 + eye * 0.3) / 5);
  };

  const handleNegotiate = () => {
    const results = [];
    const removedIds = new Set();
    selectedIds.forEach(id => {
      const player = candidates.find(c => c.id === id);
      if (player) {
        if ((player._negotiationAttempts || 0) >= 3) {
          const dest = pickRandomDestination(player, teamData);
          results.push({ player, success: false, rate: 0, rivalResult: 'max_attempts', rivalTeamName: dest, scoutName: selectedScout?.name || null });
          return;
        }
        player._negotiationAttempts = (player._negotiationAttempts || 0) + 1;
        const scoutBonus = getScoutNegotiationBonus(selectedScout);
        const modifiedRate = Math.min(95, (player.recruitRate || 0) + scoutBonus);
        const result = negotiateWithCompetition(teamData, { ...player, recruitRate: modifiedRate }, teamData);
        results.push({ player, ...result, scoutName: selectedScout?.name || null });
        if (result.success || result.rivalResult) {
          removedIds.add(id);
        } else if (player._negotiationAttempts >= 3) {
          const dest = pickRandomDestination(player, teamData);
          results[results.length - 1].rivalResult = 'max_attempts';
          results[results.length - 1].rivalTeamName = dest;
          removedIds.add(id);
        }
      }
    });
    setNegotiationResults(results);
    setAllResults(prev => [...prev, ...results]);
    setCandidates(prev => prev.filter(c => !removedIds.has(c.id)));
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

  const getAbilityVal = (p, key) => {
    const sa = p.scoutedAbilities || {};
    const map = {
      velocity: sa.pitching?.velocity, control: sa.pitching?.control, stamina: sa.pitching?.stamina,
      meet: sa.batting?.meet, power: sa.batting?.power, eye: sa.batting?.eye,
      speed: sa.physical?.speed, defense: sa.fielding?.defense,
      professionalism: sa.professionalism, recovery: sa.physical?.recovery,
    };
    const v = map[key];
    return (v === '?' || v === undefined) ? -1 : (typeof v === 'number' ? v : parseInt(v));
  };

  const getSortValue = (p, key) => {
    const recGradeOrder = { S: 6, A: 5, B: 4, C: 3, D: 2, F: 1 };
    switch (key) {
      case 'rate': return p.recruitRate || 0;
      case 'age': return p.age || 99;
      case 'name': return p.name || '';
      case 'rec': return recGradeOrder[getScoutRecommendation(p, teamRank, teamData)] || 0;
      case 'rivals': return estimateRivalCount(p);
      default: return getAbilityVal(p, key);
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

  const SortHeader = ({ k, label, w }) => (
    <th onClick={() => handleSort(k)}
      className={`py-1.5 px-1.5 cursor-pointer hover:text-white transition select-none whitespace-nowrap ${w || ''} ${sortKey === k ? 'text-cyan-400' : 'text-gray-400'}`}>
      {label}{sortKey === k ? (sortAsc ? ' ▲' : ' ▼') : ''}
    </th>
  );

  // 能力表示は共通の AbilityValue に統一（球速/スタミナの正規化・S〜F色を一元化）
  const renderVal = (val, isVel, isSta) => <AbilityValue value={val} isVel={isVel} isSta={isSta} />;

  if (phase === 'results') {
    const successes = negotiationResults.filter(r => r.success);
    const remaining = candidates.length;

    return (
      <div className="p-4">
        {/* 背景は全幅のまま、本文だけ 7xl で止める（4Kで列が伸びきるのを防ぐ） */}
        <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-2">交渉結果</h1>
        <p className="text-sm text-gray-300 mb-5">
          {negotiationResults.length}名に打診 → {successes.length}名が入団承諾
          {totalAcquired > 0 && <span className="text-green-400 ml-2">(累計{totalAcquired}名獲得)</span>}
        </p>

        <div className="space-y-3 mb-6">
          {negotiationResults.map(({ player: p, success, rate, rivalResult, rivalTeamName, scoutName, noRivalBonus }) => {
            const favBonus = getFavoriteBonus(teamData, p.id);
            const invBonus = (p._investigationCount || 0) * 7;
            const destLabel = rivalTeamName
              ? <span className="text-orange-400 font-bold">{rivalTeamName}</span>
              : <span className="text-gray-300">独立リーグトライアウト</span>;
            return (
              <div key={p.id} className={`p-4 rounded-lg border ${
                success ? 'bg-green-900/20 border-green-700'
                  : rivalResult ? 'bg-red-900/10 border-red-900/30'
                  : 'bg-yellow-900/10 border-yellow-700/30'
              }`}>
                <div className="flex items-center gap-3 text-base">
                  <span className={`font-black text-xl w-8 text-center ${
                    success ? 'text-green-400' : rivalResult ? 'text-red-400' : 'text-yellow-400'
                  }`}>
                    {success ? 'O' : rivalResult ? 'X' : '△'}
                  </span>
                  <span className="text-yellow-400 font-bold">{POSITION_NAMES[p.position]}</span>
                  <span className="text-white font-bold text-lg">{p.name}</span>
                  <span className="text-gray-300 text-sm">({p.age}歳)</span>
                  <span className="text-gray-400 text-sm">{p._scoutSource}</span>
                </div>
                <div className="ml-11 mt-2 flex items-center gap-4 flex-wrap text-sm">
                  <span className={`font-bold ${getRateColor(rate)}`}>
                    交渉成功率 {rate}%
                  </span>
                  {scoutName && <span className="text-cyan-400">担当: {scoutName}</span>}
                  {invBonus > 0 && <span className="text-cyan-400">調査+{invBonus}%</span>}
                  {favBonus > 0 && <span className="text-yellow-400">★絆+{favBonus}%</span>}
                  {(p._pipeStrength || 0) > 0 && <span className="text-purple-400">OBパイプ+{p._pipeStrength >= 3 ? 12 : p._pipeStrength === 2 ? 8 : 5}%</span>}
                  {noRivalBonus > 0 && <span className="text-green-400">競合なし+{noRivalBonus}%</span>}
                </div>
                <div className="ml-11 mt-1.5 text-sm">
                  {success ? (
                    <span className="text-green-400 font-bold">入団が決まりました! キャンプから合流します。</span>
                  ) : rivalResult === 'max_attempts' ? (
                    <span className="text-red-400">
                      交渉回数の上限(3回)に達しました → {destLabel}へ
                    </span>
                  ) : rivalResult === 'declined' ? (
                    <span className="text-gray-400">
                      本人が入団を辞退しました → {destLabel}へ
                    </span>
                  ) : rivalResult ? (
                    <span className="text-gray-400">
                      {destLabel}への入団が決まりました
                    </span>
                  ) : (
                    <span className="text-yellow-500">
                      条件面で折り合いがつきませんでした
                      {(p._negotiationAttempts || 0) < 3
                        ? `（残り${3 - (p._negotiationAttempts || 0)}回交渉可能）`
                        : ''}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4">
          {remaining > 0 && (
            <button onClick={handleContinue}
              className="btn-primary px-6 py-2.5 rounded-lg text-sm"
            >追加交渉する (残り{remaining}名)</button>
          )}
          <button onClick={handleFinalize}
            className="btn-primary px-6 py-2.5 rounded-lg text-sm"
          >交渉を終了する</button>
        </div>
      </div>
      </div>
    );
  }

  if (phase === 'confirmed') {
    return (
      <div className="p-4">
        {/* 背景は全幅のまま、本文だけ 7xl で止める（4Kで列が伸びきるのを防ぐ） */}
        <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-4">スカウト入団完了</h1>
        {totalAcquired > 0 ? (
          <div className="mb-5">
            <p className="text-green-400 text-base mb-3">今シーズンは{totalAcquired}名を獲得しました</p>
            <div className="space-y-2">
              {allResults.filter(r => r.success).map(({ player: p }, i) => (
                <div key={i} className="flex items-center gap-3 text-sm bg-green-900/20 border border-green-700/30 rounded-lg p-3">
                  <span className="text-yellow-400 font-bold">{POSITION_NAMES[p.position]}</span>
                  <span className="text-white font-bold text-base">{p.name}</span>
                  <span className="text-gray-300">({p.age}歳)</span>
                  <span className="text-cyan-400">{p._scoutSource}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-gray-300 text-base mb-5">今シーズンは選手を獲得しませんでした。</p>
        )}

        {totalAiRecruited > 0 && (
          <div className="mb-5">
            <h2 className="text-base font-bold text-blue-400 mb-3">他チームのスカウト獲得 ({totalAiRecruited}名)</h2>
            {/* 1列で並べると160チーム超で縦4000px近くなり、横は左400pxしか使わない。
                多段にして1〜2画面に収める（情報は減らさない） */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-1">
              {Object.entries(aiResults).map(([team, players]) => (
                <div key={team} className="text-sm text-gray-300">
                  {team}: {players.map(p => `${p.name}(${POSITION_NAMES[p.position]})`).join(', ')}
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-sm text-gray-400 mb-4">
          現在のロスター: {teamData?.players?.length || 0}名
          {totalAcquired > 0 && <span className="text-green-400 ml-2">(入団した選手はキャンプから合流します)</span>}
        </p>
        <button onClick={onComplete}
          className="btn-primary px-8 py-2.5 rounded-lg text-base"
        >完了</button>
      </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* 背景は全幅のまま、本文だけ 7xl で止める（4Kで列が伸びきるのを防ぐ） */}
      <div className="max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-2">スカウト交渉 - {seasonData?.year || 1}年目</h1>
      <div className="flex items-center gap-5 text-sm text-gray-300 mb-3">
        <span>注目度: <span className={reputation >= 50 ? 'text-yellow-400 font-bold' : 'text-gray-300'}>{reputation}</span></span>
        <span>ランク: <span className="text-white font-bold">{rank}</span></span>
        <span>ロスター: {teamData?.players?.length || 0}名</span>
        <span>選択中: <span className="text-green-400 font-bold">{selectedIds.length}名</span></span>
        {totalAcquired > 0 && <span className="text-green-400 font-bold">獲得済: {totalAcquired}名</span>}
      </div>

      {scouts.length > 0 && (
        <div className="mb-3 p-3 bg-surface-2 rounded-lg border border-gray-700">
          <div className="text-sm text-gray-300 mb-2 font-bold">担当スカウト (交渉成功率に影響)</div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedScoutId(null)}
              className={`px-3 py-1.5 rounded text-sm font-bold transition ${
                !selectedScoutId ? 'seg-on' : 'seg'
              }`}
            >指定なし</button>
            {scouts.map(s => {
              const bonus = getScoutNegotiationBonus(s);
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedScoutId(s.id)}
                  className={`px-3 py-1.5 rounded text-sm font-bold transition ${
                    selectedScoutId === s.id ? 'seg-on' : 'seg'
                  }`}
                >
                  {s.name}
                  <span className="text-gray-400 ml-1.5">{s.grade}級</span>
                  <span className={`ml-1.5 ${bonus > 0 ? 'text-green-400' : 'text-gray-400'}`}>
                    交渉{s.abilities?.negotiation || 0}
                  </span>
                  {bonus > 0 && <span className="text-green-400 ml-1">+{bonus}%</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {candidates.length > 0 ? (
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-surface-2 border-b border-gray-700">
              <tr className="text-left">
                <th className="px-1.5 py-2 w-8"></th>
                <SortHeader k="rec" label="推薦" />
                <SortHeader k="name" label="選手名" />
                <SortHeader k="age" label="齢" />
                <th className="px-1.5 py-2 text-gray-400 whitespace-nowrap">体</th>
                <th className="px-1.5 py-2 text-gray-400 whitespace-nowrap">守備</th>
                <th className="px-1.5 py-2 text-gray-400 whitespace-nowrap min-w-[5rem]">出身</th>
                <SortHeader k="meet" label="ミ" />
                <SortHeader k="power" label="パ" />
                <SortHeader k="eye" label="眼" />
                <SortHeader k="speed" label="走" />
                <SortHeader k="defense" label="守" />
                <SortHeader k="velocity" label="球速" />
                <SortHeader k="control" label="制" />
                <SortHeader k="stamina" label="ス" />
                <SortHeader k="professionalism" label="プ" />
                <SortHeader k="recovery" label="回" />
                <SortHeader k="rate" label="交渉%" />
                <SortHeader k="rivals" label="他球団" />
              </tr>
            </thead>
            <tbody>
              {sortedCandidates.map(player => {
                const selected = selectedIds.includes(player.id);
                const sa = player.scoutedAbilities || {};
                const rate = player.recruitRate || 0;
                const scoutBonus = getScoutNegotiationBonus(selectedScout);
                const adjustedRate = Math.min(95, rate + scoutBonus);
                const favBonus = getFavoriteBonus(teamData, player.id);
                const invBonus = (player._investigationCount || 0) * 7;
                const rec = getScoutRecommendation(player, teamRank, teamData);
                const rivals = estimateRivalCount(player);

                return (
                  <tr
                    key={player.id}
                    onClick={() => toggleSelect(player.id)}
                    className={`cursor-pointer border-b border-gray-800 transition ${
                      selected ? 'bg-green-900/30' : 'hover:bg-gray-800/80'
                    }`}
                  >
                    <td className="px-1.5 py-2 text-center">
                      <div className="flex items-center gap-1 justify-center">
                        <span className={`inline-block w-4 h-4 rounded border text-xs leading-4 text-center ${
                          selected ? 'bg-green-600 border-green-500 text-white' : 'border-gray-600'
                        }`}>
                          {selected ? '✓' : ''}
                        </span>
                        <button
                          onClick={e => { e.stopPropagation(); setModalPlayer(player); }}
                          className="px-1 py-0.5 rounded text-xs font-bold bg-gray-700 text-gray-300 hover:bg-gray-500 transition"
                        >詳</button>
                      </div>
                    </td>
                    <td className="px-1.5 py-2 text-center">
                      <span className={`font-bold ${recColor(rec)}`}>{rec}</span>
                    </td>
                    <td className="px-1.5 py-2 text-white font-bold whitespace-nowrap">{player.name}</td>
                    <td className="px-1.5 py-2 text-gray-300 text-center">{player.age}</td>
                    <td className="px-1.5 py-2 text-center">
                      <span className={player.physical?.build === 'large' ? 'text-orange-400' : player.physical?.build === 'small' ? 'text-cyan-400' : 'text-gray-300'}>
                        {player.physical?.build === 'large' ? '大柄' : player.physical?.build === 'small' ? '小柄' : '中肉'}
                      </span>
                    </td>
                    <td className="px-1.5 py-2 text-yellow-400 text-center font-bold">{POSITION_NAMES[player.position]}</td>
                    <td className="px-1.5 py-2 text-cyan-400 whitespace-nowrap">{player._scoutSource}</td>
                    <td className="px-1.5 py-2 text-center">{renderVal(sa.batting?.meet)}</td>
                    <td className="px-1.5 py-2 text-center">{renderVal(sa.batting?.power)}</td>
                    <td className="px-1.5 py-2 text-center">{renderVal(sa.batting?.eye)}</td>
                    <td className="px-1.5 py-2 text-center">{renderVal(sa.physical?.speed)}</td>
                    <td className="px-1.5 py-2 text-center">{renderVal(sa.fielding?.defense)}</td>
                    <td className="px-1.5 py-2 text-center">{renderVal(sa.pitching?.velocity, true)}</td>
                    <td className="px-1.5 py-2 text-center">{renderVal(sa.pitching?.control)}</td>
                    <td className="px-1.5 py-2 text-center">{renderVal(sa.pitching?.stamina, false, true)}</td>
                    <td className="px-1.5 py-2 text-center">{renderVal(sa.professionalism)}</td>
                    <td className="px-1.5 py-2 text-center">{renderVal(sa.physical?.recovery)}</td>
                    <td className="px-1.5 py-2 text-center whitespace-nowrap">
                      <span className={`font-bold ${getRateColor(rivals === 0 ? Math.min(95, adjustedRate + 12) : adjustedRate)}`}>
                        {rivals === 0 ? Math.min(95, adjustedRate + 12) : adjustedRate}%
                      </span>
                      {scoutBonus > 0 && <span className="text-green-400 text-xs ml-1">+{scoutBonus}</span>}
                      {invBonus > 0 && <span className="text-cyan-400 text-xs ml-1">調+{invBonus}</span>}
                      {favBonus > 0 && <span className="text-yellow-400 text-xs ml-1">★+{favBonus}</span>}
                      {(player._pipeStrength || 0) > 0 && <span className="text-purple-400 text-xs ml-1">OB</span>}
                      {rivals === 0 && <span className="text-green-400 text-xs ml-1">競合なし</span>}
                      {(player._negotiationAttempts || 0) > 0 && (
                        <span className={`text-xs ml-1 ${player._negotiationAttempts >= 2 ? 'text-red-400' : 'text-orange-400'}`}>
                          残{3 - player._negotiationAttempts}回
                        </span>
                      )}
                    </td>
                    <td className="px-1.5 py-2 text-center">
                      {rivals > 0 ? (
                        <span className={`font-bold ${rivals >= 3 ? 'text-red-400' : rivals >= 2 ? 'text-orange-400' : 'text-yellow-400'}`}>
                          {rivals}社
                        </span>
                      ) : <span className="text-green-600 text-xs">なし</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-gray-800/50 rounded-lg p-8 text-center mb-4">
          <p className="text-gray-300 text-base mb-2">スカウト候補者がいません</p>
          <p className="text-gray-400 text-sm">シーズン中にチーム運営画面からスカウトを派遣してください</p>
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          onClick={handleNegotiate}
          disabled={selectedIds.length === 0}
          className={`px-6 py-2.5 rounded-lg font-bold text-base ${
            'btn-primary'
          }`}
        >交渉開始 ({selectedIds.length}名)</button>
        <button onClick={handleSkip}
          className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm"
        >獲得なしで進む</button>
      </div>
      {modalPlayer && <PlayerDetailModal player={modalPlayer} onClose={() => setModalPlayer(null)} />}
    </div>
    </div>
  );
};

export default CorporateScoutScreen;
