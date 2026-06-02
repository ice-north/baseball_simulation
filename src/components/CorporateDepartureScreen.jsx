import React, { useState, useEffect, useMemo } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { POSITION_NAMES, getAbilityColor } from '../utils/constants.js';
import { processCorporateRetirements, executeDepartures } from '../corporate/scoutingSystem.js';
import { getPlayerSalary, getStaffSalary } from '../corporate/staffData.js';
import { getReputationBudgetBonus, getManagingBudgetBonus, getTournamentBudgetBonus, getSponsorIncome, generateSponsorOffers, acceptSponsor, SPONSOR_TIERS } from '../corporate/corporateInit.js';
import { getTeamStaffBonus } from '../corporate/staffData.js';

const CorporateDepartureScreen = ({ seasonData, allTeams, onComplete }) => {
  const teamNames = Object.keys(TEAMS_DATA || {});
  const userTeamName = teamNames[0] || '';
  const [retirements, setRetirements] = useState([]);
  const [aiReleases, setAiReleases] = useState({});
  const [playerDecisions, setPlayerDecisions] = useState({});
  const [processed, setProcessed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [sortKey, setSortKey] = useState('salary');
  const [sortAsc, setSortAsc] = useState(false);
  const [sponsorOffers, setSponsorOffers] = useState(null);

  useEffect(() => {
    if (processed) return;
    const result = processCorporateRetirements(TEAMS_DATA, userTeamName);
    setRetirements(result.retirements);
    setAiReleases(result.aiReleases);
    setProcessed(true);
  }, []);

  const teamData = TEAMS_DATA[userTeamName];
  const cd = teamData?.corporateData;
  const players = teamData?.players || [];
  const staff = cd?.staff || [];

  const userRetiredIds = new Set(retirements.filter(r => r.team === userTeamName).map(r => r.id));
  const activePlayers = players.filter(p => !userRetiredIds.has(p.id));

  // 予算計算
  const staffBonus = getTeamStaffBonus(staff);
  const baseBudget = cd?.budget || 12000;
  const reputation = cd?.reputation || 0;
  const reputationBonus = cd?.yearlyBudgetBonus ?? getReputationBudgetBonus(reputation);
  const managingValue = Math.max(...staff.map(s => s.abilities?.managing || 0), 0);
  const managingBonus = getManagingBudgetBonus(managingValue);
  const tournamentBonus = getTournamentBudgetBonus(cd);
  const currentSponsorIncome = getSponsorIncome(cd);
  const staffSalaryTotal = staff.reduce((sum, s) => sum + getStaffSalary(s), 0);

  // スポンサーオファー生成
  useEffect(() => {
    if (processed && cd && sponsorOffers === null) {
      const offers = generateSponsorOffers(cd);
      setSponsorOffers(offers);
    }
  }, [processed]);

  // 契約中の選手の総年俸（解雇/引退でない選手）
  const projectedPlayerSalary = activePlayers.reduce((sum, p) => {
    const decision = playerDecisions[p.id];
    if (decision === 'release' || decision === 'retire') return sum;
    return sum + getPlayerSalary(p);
  }, 0);
  const totalSalary = projectedPlayerSalary + staffSalaryTotal;
  const totalBudget = baseBudget + reputationBonus + managingBonus + tournamentBonus + currentSponsorIncome;
  const budgetBalance = totalBudget - totalSalary;

  const releaseCount = activePlayers.filter(p => playerDecisions[p.id] === 'release').length;
  const retireCount = activePlayers.filter(p => playerDecisions[p.id] === 'retire').length;
  const contractCount = activePlayers.length - releaseCount - retireCount;

  const getSortValue = (player, key) => {
    const isPitcher = player.position === 'pitcher';
    switch (key) {
      case 'name': return player.name;
      case 'age': return player.age || 0;
      case 'position': return POSITION_NAMES[player.position] || '';
      case 'salary': return getPlayerSalary(player);
      case 'meet': return player.batting?.meet || 0;
      case 'power': return player.batting?.power || 0;
      case 'speed': return player.physical?.speed || 0;
      case 'defense': return player.fielding?.defense || 0;
      case 'velocity': return player.pitching?.velocity || 0;
      case 'control': return player.pitching?.control || 0;
      case 'stamina': return player.pitching?.stamina || 0;
      case 'games': return isPitcher ? (player.seasonStats?.pitching?.games || 0) : (player.seasonStats?.batting?.games || 0);
      default: return 0;
    }
  };

  const handleSort = (key) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const sortedPlayers = useMemo(() => {
    if (!sortKey) return activePlayers;
    return [...activePlayers].sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortAsc ? va - vb : vb - va;
    });
  }, [activePlayers, sortKey, sortAsc]);

  const cycleDecision = (playerId) => {
    const current = playerDecisions[playerId] || 'contract';
    const next = current === 'contract' ? 'release' : current === 'release' ? 'retire' : 'contract';
    setPlayerDecisions({ ...playerDecisions, [playerId]: next });
  };

  const handleAcceptSponsor = (offer, index) => {
    acceptSponsor(cd, offer);
    setSponsorOffers(prev => prev.filter((_, i) => i !== index));
  };

  const handleConfirm = () => {
    const currentYear = seasonData?.year || 1;
    const allReleases = { ...aiReleases };

    const userReleaseIds = activePlayers
      .filter(p => playerDecisions[p.id] === 'release')
      .map(p => p.id);
    if (userReleaseIds.length > 0) {
      allReleases[userTeamName] = userReleaseIds;
    }

    const userRetireIds = activePlayers
      .filter(p => playerDecisions[p.id] === 'retire')
      .map(p => p.id);
    const allRetiredIds = [
      ...retirements.map(r => r.id),
      ...userRetireIds,
    ];

    executeDepartures(TEAMS_DATA, allRetiredIds, allReleases, currentYear);
    setConfirmed(true);
  };

  const SortHeader = ({ label, sortKeyVal, className = '' }) => (
    <th
      className={`py-1 px-1 cursor-pointer hover:text-white hover:bg-gray-600 transition select-none text-[10px] ${sortKey === sortKeyVal ? 'bg-gray-600 text-white' : ''} ${className}`}
      onClick={() => handleSort(sortKeyVal)}
    >
      {label}{sortKey === sortKeyVal ? (sortAsc ? '↑' : '↓') : ''}
    </th>
  );

  const totalAiReleases = Object.values(aiReleases).reduce((sum, arr) => sum + arr.length, 0);
  const totalRetirements = retirements.length;

  const DecisionBadge = ({ decision }) => {
    if (decision === 'release') return <span className="text-red-400 font-bold text-[10px] bg-red-900/40 px-1.5 py-0.5 rounded">解雇</span>;
    if (decision === 'retire') return <span className="text-yellow-400 font-bold text-[10px] bg-yellow-900/40 px-1.5 py-0.5 rounded">引退</span>;
    return <span className="text-green-400 font-bold text-[10px] bg-green-900/40 px-1.5 py-0.5 rounded">契約</span>;
  };

  if (confirmed) {
    return (
      <div className="p-4 bg-gray-900 min-h-screen">
        <h1 className="text-xl font-bold text-white mb-3">契約更改完了</h1>
        {totalRetirements + retireCount > 0 && (
          <div className="mb-4">
            <h2 className="text-sm font-bold text-yellow-400 mb-2">
              引退選手 ({totalRetirements + retireCount}名)
            </h2>
            <div className="grid grid-cols-2 gap-1">
              {retirements.map(r => (
                <div key={r.id} className="text-xs text-gray-300 bg-gray-800 p-1 rounded">
                  <span className="text-yellow-300">{POSITION_NAMES[r.position]}</span> {r.name}
                  <span className="text-gray-500 ml-1">({r.age}歳・{r.team})</span>
                  <span className="text-gray-500 ml-1">{r.reason}</span>
                </div>
              ))}
              {activePlayers.filter(p => playerDecisions[p.id] === 'retire').map(p => (
                <div key={p.id} className="text-xs text-gray-300 bg-gray-800 p-1 rounded">
                  <span className="text-yellow-300">{POSITION_NAMES[p.position]}</span> {p.name}
                  <span className="text-gray-500 ml-1">({p.age}歳・自チーム)</span>
                  <span className="text-gray-500 ml-1">引退勧告</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {(releaseCount > 0 || totalAiReleases > 0) && (
          <div className="mb-4">
            <h2 className="text-sm font-bold text-red-400 mb-2">解雇 ({releaseCount + totalAiReleases}名)</h2>
            <p className="text-xs text-gray-400 mb-1">
              自チーム: {releaseCount}名 / 他チーム: {totalAiReleases}名
            </p>
          </div>
        )}
        <div className="mb-4 bg-gray-800 rounded p-3">
          <div className="text-xs text-gray-400">来季ロスター: <span className="text-white font-bold">{contractCount}名</span></div>
          <div className="text-xs text-gray-400 mt-1">
            来季予算残: <span className={`font-bold ${budgetBalance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {budgetBalance >= 0 ? '+' : ''}{budgetBalance.toLocaleString()}万円
            </span>
          </div>
        </div>
        <button
          onClick={onComplete}
          className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold"
        >
          スカウト入団へ進む
        </button>
      </div>
    );
  }

  return (
    <div className="p-3 bg-gray-900 min-h-screen">
      <h1 className="text-xl font-bold text-white mb-1">契約更改 - {seasonData?.year || 1}年目 11月末</h1>
      <p className="text-gray-400 text-xs mb-2">選手をクリックして「契約 → 解雇 → 引退」を切り替えてください</p>

      {/* 予算サマリー */}
      <div className="mb-3 bg-gray-800 rounded-lg p-3">
        <div className="flex items-center gap-4 text-xs">
          <div>
            <span className="text-gray-400">総予算: </span>
            <span className="text-white font-bold">{totalBudget.toLocaleString()}万</span>
          </div>
          <div>
            <span className="text-gray-400">人件費: </span>
            <span className="text-white font-bold">{totalSalary.toLocaleString()}万</span>
            <span className="text-gray-600 ml-1">(選手{projectedPlayerSalary.toLocaleString()} + スタッフ{staffSalaryTotal.toLocaleString()})</span>
          </div>
          <div>
            <span className="text-gray-400">残額: </span>
            <span className={`font-bold ${budgetBalance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {budgetBalance >= 0 ? '+' : ''}{budgetBalance.toLocaleString()}万
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-500">
          <span>基本{baseBudget.toLocaleString()}</span>
          {reputationBonus > 0 && <span className="text-green-500">+注目度{reputationBonus.toLocaleString()}</span>}
          {managingBonus > 0 && <span className="text-cyan-500">+マネージング{managingBonus.toLocaleString()}</span>}
          {tournamentBonus > 0 && <span className="text-yellow-500">+大会{tournamentBonus.toLocaleString()}</span>}
          {currentSponsorIncome > 0 && <span className="text-purple-500">+スポンサー{currentSponsorIncome.toLocaleString()}</span>}
        </div>
      </div>

      {/* スポンサーオファー */}
      {sponsorOffers && sponsorOffers.length > 0 && (
        <div className="mb-3 bg-purple-900/20 border border-purple-700/50 rounded-lg p-3">
          <h2 className="text-sm font-bold text-purple-300 mb-2">スポンサーオファー</h2>
          <div className="space-y-1.5">
            {sponsorOffers.map((offer, i) => {
              const tierInfo = SPONSOR_TIERS[offer.tier];
              return (
                <div key={i} className="flex items-center gap-3 bg-gray-800/80 rounded p-2">
                  <span className={`text-xs font-bold w-16 ${tierInfo?.color || 'text-gray-400'}`}>
                    {tierInfo?.label || offer.tier}
                  </span>
                  <span className="text-white text-sm font-medium flex-1">{offer.name}</span>
                  <span className="text-yellow-400 text-xs font-bold">+{offer.income.toLocaleString()}万/年</span>
                  <span className="text-gray-500 text-xs">{offer.duration}年契約</span>
                  <button
                    onClick={() => handleAcceptSponsor(offer, i)}
                    className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded"
                  >
                    契約
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 引退選手 */}
      {totalRetirements > 0 && (
        <div className="mb-2 p-2 bg-yellow-900/30 border border-yellow-700 rounded">
          <p className="text-yellow-400 text-xs font-bold">
            自動引退: {retirements.filter(r => r.team === userTeamName).map(r => `${r.name}(${r.age}歳)`).join('、') || 'なし'}
            {retirements.filter(r => r.team !== userTeamName).length > 0 &&
              ` (他チーム${retirements.filter(r => r.team !== userTeamName).length}名)`}
          </p>
        </div>
      )}

      {totalAiReleases > 0 && (
        <p className="text-xs text-gray-500 mb-2">他チーム自動戦力外: {totalAiReleases}名</p>
      )}

      {/* 選手一覧 */}
      <div className="overflow-x-auto mb-3">
        <table className="w-full text-[10px] text-gray-300 border-collapse">
          <thead className="bg-gray-800 text-gray-400">
            <tr>
              <th className="py-1 px-1 w-12 text-[10px]">判定</th>
              <SortHeader label="名前" sortKeyVal="name" />
              <SortHeader label="年齢" sortKeyVal="age" />
              <SortHeader label="守" sortKeyVal="position" />
              <SortHeader label="年俸" sortKeyVal="salary" />
              <SortHeader label="ミ" sortKeyVal="meet" />
              <SortHeader label="パ" sortKeyVal="power" />
              <SortHeader label="走" sortKeyVal="speed" />
              <SortHeader label="守備" sortKeyVal="defense" />
              <SortHeader label="球速" sortKeyVal="velocity" />
              <SortHeader label="制球" sortKeyVal="control" />
              <SortHeader label="ス" sortKeyVal="stamina" />
              <SortHeader label="試合" sortKeyVal="games" />
            </tr>
          </thead>
          <tbody>
            {sortedPlayers.map(player => {
              const decision = playerDecisions[player.id] || 'contract';
              const isPitcher = player.position === 'pitcher';
              const games = isPitcher
                ? (player.seasonStats?.pitching?.games || 0)
                : (player.seasonStats?.batting?.games || 0);
              const salary = getPlayerSalary(player);
              return (
                <tr
                  key={player.id}
                  onClick={() => cycleDecision(player.id)}
                  className={`cursor-pointer border-b border-gray-800 transition ${
                    decision === 'release' ? 'bg-red-900/30 opacity-70' :
                    decision === 'retire' ? 'bg-yellow-900/20 opacity-70' :
                    'hover:bg-gray-800'
                  }`}
                >
                  <td className="py-0.5 px-1 text-center">
                    <DecisionBadge decision={decision} />
                  </td>
                  <td className={`py-0.5 px-1 font-medium ${decision !== 'contract' ? 'line-through' : ''}`}>{player.name}</td>
                  <td className="py-0.5 px-1 text-center">{player.age}</td>
                  <td className="py-0.5 px-1 text-center">{POSITION_NAMES[player.position]}</td>
                  <td className={`py-0.5 px-1 text-right ${decision === 'contract' ? 'text-yellow-400' : 'text-gray-600'}`}>
                    {salary.toLocaleString()}万
                  </td>
                  <td className={`py-0.5 px-1 text-center ${isPitcher ? 'text-gray-600' : getAbilityColor(player.batting?.meet)}`}>
                    {player.batting?.meet || 0}
                  </td>
                  <td className={`py-0.5 px-1 text-center ${isPitcher ? 'text-gray-600' : getAbilityColor(player.batting?.power)}`}>
                    {player.batting?.power || 0}
                  </td>
                  <td className={`py-0.5 px-1 text-center ${getAbilityColor(player.physical?.speed)}`}>
                    {player.physical?.speed || 0}
                  </td>
                  <td className={`py-0.5 px-1 text-center ${getAbilityColor(player.fielding?.defense)}`}>
                    {player.fielding?.defense || 0}
                  </td>
                  <td className={`py-0.5 px-1 text-center ${!isPitcher ? 'text-gray-600' : getAbilityColor((player.pitching?.velocity - 120) * 1.5)}`}>
                    {player.pitching?.velocity || '-'}
                  </td>
                  <td className={`py-0.5 px-1 text-center ${!isPitcher ? 'text-gray-600' : getAbilityColor(player.pitching?.control)}`}>
                    {player.pitching?.control || '-'}
                  </td>
                  <td className={`py-0.5 px-1 text-center ${!isPitcher ? 'text-gray-600' : ''}`}>
                    {isPitcher ? (player.pitching?.stamina || 0) : '-'}
                  </td>
                  <td className="py-0.5 px-1 text-center">{games}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 操作ボタン */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleConfirm}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-sm"
        >
          契約更改を確定
        </button>
        <div className="text-xs text-gray-400 space-x-3">
          <span className="text-green-400">契約{contractCount}名</span>
          {releaseCount > 0 && <span className="text-red-400">解雇{releaseCount}名</span>}
          {retireCount > 0 && <span className="text-yellow-400">引退{retireCount}名</span>}
          <span className="text-gray-500">→ 来季{contractCount}名</span>
        </div>
      </div>
    </div>
  );
};

export default CorporateDepartureScreen;
