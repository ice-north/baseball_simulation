import React, { useState } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { POSITION_NAMES } from '../utils/constants.js';
import { cleanupPlayerReferences } from '../season/yearProgressionSystem.js';

const getAbilityRank = (value) => {
  if (value >= 90) return 'S';
  if (value >= 80) return 'A';
  if (value >= 70) return 'B';
  if (value >= 60) return 'C';
  if (value >= 50) return 'D';
  if (value >= 40) return 'E';
  return 'F';
};

const getRankColor = (rank) => ({
  S: 'text-pink-400', A: 'text-red-400', B: 'text-orange-400',
  C: 'text-yellow-400', D: 'text-green-400', E: 'text-blue-400', F: 'text-gray-600'
}[rank] || 'text-gray-600');

const StatVal = ({ value, isPitcherVelocity }) => {
  let rank;
  if (isPitcherVelocity) {
    const adj = (value - 115) * 2.5;
    rank = getAbilityRank(adj);
  } else {
    rank = getAbilityRank(value);
  }
  return <span className={`font-semibold ${getRankColor(rank)}`}>{value}</span>;
};

const TradeScreen = ({ userTeamName, onBack }) => {
  const [selectedMyPlayer, setSelectedMyPlayer] = useState(null);
  const [selectedTargetTeam, setSelectedTargetTeam] = useState('');
  const [selectedTargetPlayer, setSelectedTargetPlayer] = useState(null);
  const [tradeResult, setTradeResult] = useState(null);
  const [updateTrigger, setUpdateTrigger] = useState(0);

  const myTeam = TEAMS_DATA[userTeamName];
  const otherTeams = Object.keys(TEAMS_DATA).filter(t => t !== userTeamName);

  if (!myTeam) return <div className="p-8 text-white">チームが見つかりません</div>;

  const getPlayerValue = (player) => {
    const isPitcher = player.position === 'pitcher';
    const age = player.age || 20;
    const ageBonus = age <= 22 ? 15 : age <= 25 ? 8 : age <= 28 ? 0 : age <= 32 ? -5 : -15;
    if (isPitcher) {
      const v = player.pitching?.velocity || 0;
      const c = player.pitching?.control || 0;
      const s = player.pitching?.stamina || 0;
      const arsenal = player.pitching?.arsenal || [];
      const best = arsenal.filter(a => a.type !== 'straight').reduce((m, a) => Math.max(m, a.level || 0), 0);
      return Math.max(0, (v - 130) * 2) + c + s * 0.5 + best * 0.5 + ageBonus;
    } else {
      const m = player.batting?.meet || 0;
      const p = player.batting?.power || 0;
      const e = player.batting?.eye || 0;
      const sp = player.physical?.speed || 0;
      const d = player.fielding?.defense || 0;
      const a = player.physical?.arm || 0;
      return m + p + e * 0.5 + sp * 0.3 + d * 0.3 + a * 0.3 + ageBonus;
    }
  };

  const getValueColor = (val) => {
    if (val >= 130) return 'text-pink-400';
    if (val >= 110) return 'text-red-400';
    if (val >= 90) return 'text-orange-400';
    if (val >= 70) return 'text-yellow-400';
    return 'text-gray-400';
  };

  const canTrade = () => selectedMyPlayer && selectedTargetPlayer && selectedTargetTeam;

  const evaluateTradeAI = () => {
    if (!selectedMyPlayer || !selectedTargetPlayer) return { accept: false, reason: '' };
    const myVal = getPlayerValue(selectedMyPlayer);
    const targetVal = getPlayerValue(selectedTargetPlayer);
    const diff = myVal - targetVal;
    const ageFactor = (selectedMyPlayer.age || 20) < (selectedTargetPlayer.age || 20) ? 10 : 0;
    const threshold = -15 + ageFactor;
    if (diff >= threshold) {
      return { accept: true, reason: '成立' };
    } else {
      return { accept: false, reason: `相手チームが拒否しました（評価差: ${Math.round(diff)}pt）` };
    }
  };

  const executeTrade = () => {
    if (!canTrade()) return;
    const result = evaluateTradeAI();

    if (result.accept) {
      const targetTeam = TEAMS_DATA[selectedTargetTeam];
      let myIdx = myTeam.players.indexOf(selectedMyPlayer);
      if (myIdx === -1) myIdx = myTeam.players.findIndex(p => p.id === selectedMyPlayer.id);
      let targetIdx = targetTeam.players.indexOf(selectedTargetPlayer);
      if (targetIdx === -1) targetIdx = targetTeam.players.findIndex(p => p.id === selectedTargetPlayer.id);

      if (myIdx === -1 || targetIdx === -1) {
        setTradeResult({ success: false, message: '選手が見つかりません' });
        return;
      }

      selectedMyPlayer.battingOrder = 0;
      selectedTargetPlayer.battingOrder = 0;
      cleanupPlayerReferences(myTeam, selectedMyPlayer.id);
      cleanupPlayerReferences(targetTeam, selectedTargetPlayer.id);

      myTeam.players.splice(myIdx, 1);
      targetTeam.players.splice(targetIdx, 1);
      myTeam.players.push(selectedTargetPlayer);
      targetTeam.players.push(selectedMyPlayer);

      setTradeResult({
        success: true,
        message: `トレード成立！ ${selectedMyPlayer.name} ⇄ ${selectedTargetPlayer.name}`
      });
      setSelectedMyPlayer(null);
      setSelectedTargetPlayer(null);
    } else {
      setTradeResult({ success: false, message: result.reason });
    }
    setUpdateTrigger(prev => prev + 1);
  };

  const getLineupOrder = (player, teamName) => {
    const team = TEAMS_DATA[teamName];
    if (!team?.lineupSettings?.battingOrder) return null;
    const entry = team.lineupSettings.battingOrder.find(e => e.playerId === player.id);
    return entry ? entry.battingOrder : null;
  };

  const getSeasonLine = (player) => {
    const isPitcher = player.position === 'pitcher';
    const ps = player.seasonStats?.pitching;
    const bs = player.seasonStats?.batting;
    if (isPitcher) {
      const games = ps?.games || 0;
      if (!games) return { games: 0, line: '' };
      const ip = ps.inningsPitched || 0;
      const era = ip > 0 ? ((ps.earnedRuns || 0) * 27 / ip).toFixed(2) : '-';
      return { games, line: `${era} ERA ${Math.floor(ip / 3)}.${ip % 3}回` };
    } else {
      const games = bs?.games || 0;
      if (!games) return { games: 0, line: '' };
      const avg = bs.atBats > 0 ? (bs.hits / bs.atBats).toFixed(3) : '.000';
      return { games, line: `${avg} ${bs.homeruns || 0}本 ${bs.rbis || 0}点` };
    }
  };

  const PlayerRow = ({ player, isSelected, onSelect, teamName }) => {
    const val = getPlayerValue(player);
    const isPitcher = player.position === 'pitcher';
    const order = getLineupOrder(player, teamName);
    const season = getSeasonLine(player);

    return (
      <tr
        onClick={() => onSelect(player)}
        className={`cursor-pointer transition ${
          isSelected ? 'bg-blue-900/50 ring-1 ring-blue-500/40' : 'hover:bg-gray-700/40'
        } border-b border-gray-700/30`}
      >
        <td className="py-1.5 px-2">
          <div className="flex items-center gap-1.5">
            {order ? (
              <span className="text-[10px] bg-blue-600/50 text-blue-300 w-4 h-4 rounded flex items-center justify-center font-bold shrink-0">{order}</span>
            ) : (
              <span className="text-[10px] text-gray-600 w-4 text-center shrink-0">控</span>
            )}
            <span className="font-bold text-white text-sm truncate">{player.name}</span>
          </div>
        </td>
        <td className="py-1.5 px-1 text-xs text-gray-400">{POSITION_NAMES[player.position] || player.position}</td>
        <td className="py-1.5 px-1 text-xs text-gray-500 text-center">{player.age || 20}</td>
        {/* 野手能力 */}
        <td className="py-1.5 px-0.5 text-xs text-center">{isPitcher ? <span className="text-gray-700">-</span> : <StatVal value={player.batting?.meet || 0} />}</td>
        <td className="py-1.5 px-0.5 text-xs text-center">{isPitcher ? <span className="text-gray-700">-</span> : <StatVal value={player.batting?.power || 0} />}</td>
        <td className="py-1.5 px-0.5 text-xs text-center">{isPitcher ? <span className="text-gray-700">-</span> : <StatVal value={player.physical?.speed || 0} />}</td>
        <td className="py-1.5 px-0.5 text-xs text-center">{isPitcher ? <span className="text-gray-700">-</span> : <StatVal value={player.fielding?.defense || 0} />}</td>
        {/* 投手能力 */}
        <td className="py-1.5 px-0.5 text-xs text-center border-l border-gray-700/30">{!isPitcher ? <span className="text-gray-700">-</span> : <StatVal value={player.pitching?.velocity || 0} isPitcherVelocity />}</td>
        <td className="py-1.5 px-0.5 text-xs text-center">{!isPitcher ? <span className="text-gray-700">-</span> : <StatVal value={player.pitching?.control || 0} />}</td>
        {/* 出場 */}
        <td className="py-1.5 px-1 text-xs text-center text-gray-300 border-l border-gray-700/30">{season.games || '-'}</td>
        <td className="py-1.5 px-1 text-[11px] text-gray-400 truncate max-w-[110px]">{season.line || '-'}</td>
        {/* 評価 */}
        <td className={`py-1.5 px-1.5 text-xs font-bold text-center border-l border-gray-700/30 ${getValueColor(val)}`}>{Math.round(val)}</td>
      </tr>
    );
  };

  const TeamTable = ({ players, teamName, selectedPlayer, onSelect, title, titleColor }) => (
    <div className="bg-gray-800/80 rounded-xl border border-gray-700/50 overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-gray-700/50 flex items-center gap-2">
        <h2 className={`font-semibold text-sm ${titleColor}`}>{title}</h2>
        <span className="text-xs text-gray-500">{players.length}人</span>
      </div>
      <div className="overflow-y-auto max-h-[420px]">
        <table className="w-full text-left">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-800 border-b border-gray-700/30 text-[9px] font-medium">
              <th colSpan={3} className="py-0.5 pl-2 text-gray-500">選手情報</th>
              <th colSpan={4} className="py-0.5 px-1 text-center text-blue-400/60 border-l border-gray-700/30">野手能力</th>
              <th colSpan={2} className="py-0.5 px-1 text-center text-red-400/60 border-l border-gray-700/30">投手能力</th>
              <th colSpan={2} className="py-0.5 px-1 text-center text-green-400/60 border-l border-gray-700/30">出場</th>
              <th className="py-0.5 px-1 text-center text-gray-500 border-l border-gray-700/30">総合</th>
            </tr>
            <tr className="bg-gray-800 border-b border-gray-700/50 text-[10px] text-gray-400">
              <th className="py-1 pl-2 text-left font-medium">名前</th>
              <th className="py-1 px-1 font-medium">守備</th>
              <th className="py-1 px-1 text-center font-medium">齢</th>
              <th className="py-1 px-0.5 text-center font-medium border-l border-gray-700/30">ミ</th>
              <th className="py-1 px-0.5 text-center font-medium">パ</th>
              <th className="py-1 px-0.5 text-center font-medium">走</th>
              <th className="py-1 px-0.5 text-center font-medium">守</th>
              <th className="py-1 px-0.5 text-center font-medium border-l border-gray-700/30">球速</th>
              <th className="py-1 px-0.5 text-center font-medium">制球</th>
              <th className="py-1 px-1 text-center font-medium border-l border-gray-700/30">試合</th>
              <th className="py-1 px-1 font-medium">成績</th>
              <th className="py-1 px-1 text-center font-medium border-l border-gray-700/30">評価</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, idx) => (
              <PlayerRow
                key={`${teamName}-${p.id}-${idx}`}
                player={p}
                isSelected={selectedPlayer === p}
                onSelect={onSelect}
                teamName={teamName}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderPlayerCard = (player, label, labelColor, bgColor, teamName) => {
    if (!player) return <div className="text-gray-600 text-sm text-center py-4">選手を選択してください</div>;
    const val = getPlayerValue(player);
    const isPitcher = player.position === 'pitcher';
    const order = getLineupOrder(player, teamName);
    const season = getSeasonLine(player);
    return (
      <div className={`${bgColor} rounded-xl p-4 border border-gray-700/50`}>
        <div className={`text-xs font-medium ${labelColor} mb-2`}>{label}</div>
        <div className="flex items-center gap-2 mb-2">
          {order && <span className="text-[10px] bg-blue-600/50 text-blue-300 px-1.5 py-0.5 rounded font-bold">{order}番</span>}
          <span className="text-white font-bold text-lg">{player.name}</span>
        </div>
        <div className="text-gray-400 text-sm mb-3">{POSITION_NAMES[player.position]} / {player.age}歳</div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs mb-3">
          {isPitcher ? (
            <>
              <span className="text-gray-400">球速 <StatVal value={player.pitching?.velocity || 0} isPitcherVelocity /></span>
              <span className="text-gray-400">制球 <StatVal value={player.pitching?.control || 0} /></span>
              <span className="text-gray-400">スタ <StatVal value={player.pitching?.stamina || 0} /></span>
            </>
          ) : (
            <>
              <span className="text-gray-400">ミ <StatVal value={player.batting?.meet || 0} /></span>
              <span className="text-gray-400">パ <StatVal value={player.batting?.power || 0} /></span>
              <span className="text-gray-400">走 <StatVal value={player.physical?.speed || 0} /></span>
              <span className="text-gray-400">肩 <StatVal value={player.physical?.arm || 0} /></span>
              <span className="text-gray-400">守 <StatVal value={player.fielding?.defense || 0} /></span>
            </>
          )}
        </div>
        {season.games > 0 && (
          <div className="text-xs text-gray-500 mb-2">
            {season.games}試合 {season.line}
          </div>
        )}
        <div className={`text-sm font-bold ${getValueColor(val)}`}>
          評価: {Math.round(val)}pt
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 min-h-screen">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-white">トレード</h1>
        {onBack && (
          <button onClick={onBack} className="px-3 py-1.5 bg-gray-700/80 text-gray-300 rounded-lg hover:bg-gray-600 transition text-sm">
            戻る
          </button>
        )}
      </div>
      <p className="text-gray-500 text-sm mb-5">選手を選択して1対1のトレードを提案できます</p>

      {tradeResult && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-semibold border ${
          tradeResult.success
            ? 'bg-green-900/40 text-green-300 border-green-700/50'
            : 'bg-red-900/40 text-red-300 border-red-700/50'
        }`}>
          {tradeResult.message}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-5">
        <TeamTable
          players={myTeam.players || []}
          teamName={userTeamName}
          selectedPlayer={selectedMyPlayer}
          onSelect={setSelectedMyPlayer}
          title={`${userTeamName}（自チーム）`}
          titleColor="text-blue-400"
        />

        <div className="bg-gray-800/80 rounded-xl border border-gray-700/50 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-gray-700/50 flex items-center gap-3">
            <h2 className="font-semibold text-sm text-red-400">相手チーム</h2>
            <select
              value={selectedTargetTeam}
              onChange={(e) => { setSelectedTargetTeam(e.target.value); setSelectedTargetPlayer(null); }}
              className="bg-gray-700/80 border border-gray-600/50 text-white text-sm px-2.5 py-1 rounded-lg"
            >
              <option value="">-- 選択 --</option>
              {otherTeams.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          {selectedTargetTeam && TEAMS_DATA[selectedTargetTeam] ? (
            <div className="overflow-y-auto max-h-[420px]">
              <table className="w-full text-left">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-800 border-b border-gray-700/30 text-[9px] font-medium">
                    <th colSpan={3} className="py-0.5 pl-2 text-gray-500">選手情報</th>
                    <th colSpan={4} className="py-0.5 px-1 text-center text-blue-400/60 border-l border-gray-700/30">野手能力</th>
                    <th colSpan={2} className="py-0.5 px-1 text-center text-red-400/60 border-l border-gray-700/30">投手能力</th>
                    <th colSpan={2} className="py-0.5 px-1 text-center text-green-400/60 border-l border-gray-700/30">出場</th>
                    <th className="py-0.5 px-1 text-center text-gray-500 border-l border-gray-700/30">総合</th>
                  </tr>
                  <tr className="bg-gray-800 border-b border-gray-700/50 text-[10px] text-gray-400">
                    <th className="py-1 pl-2 text-left font-medium">名前</th>
                    <th className="py-1 px-1 font-medium">守備</th>
                    <th className="py-1 px-1 text-center font-medium">齢</th>
                    <th className="py-1 px-0.5 text-center font-medium border-l border-gray-700/30">ミ</th>
                    <th className="py-1 px-0.5 text-center font-medium">パ</th>
                    <th className="py-1 px-0.5 text-center font-medium">走</th>
                    <th className="py-1 px-0.5 text-center font-medium">守</th>
                    <th className="py-1 px-0.5 text-center font-medium border-l border-gray-700/30">球速</th>
                    <th className="py-1 px-0.5 text-center font-medium">制球</th>
                    <th className="py-1 px-1 text-center font-medium border-l border-gray-700/30">試合</th>
                    <th className="py-1 px-1 font-medium">成績</th>
                    <th className="py-1 px-1 text-center font-medium border-l border-gray-700/30">評価</th>
                  </tr>
                </thead>
                <tbody>
                  {(TEAMS_DATA[selectedTargetTeam].players || []).map((p, idx) => (
                    <PlayerRow
                      key={`target-${p.id}-${idx}`}
                      player={p}
                      isSelected={selectedTargetPlayer === p}
                      onSelect={setSelectedTargetPlayer}
                      teamName={selectedTargetTeam}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-gray-600 text-sm text-center py-12">チームを選択してください</div>
          )}
        </div>
      </div>

      {/* トレード内容 */}
      <div className="bg-gray-800/80 rounded-xl border border-gray-700/50 p-5">
        <h3 className="font-semibold text-white text-sm mb-4">トレード内容</h3>
        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start">
          {renderPlayerCard(selectedMyPlayer, '放出', 'text-blue-400', 'bg-blue-950/40', userTeamName)}
          <div className="flex items-center justify-center pt-8 text-2xl text-yellow-400/70 font-bold">⇄</div>
          {renderPlayerCard(selectedTargetPlayer, '獲得', 'text-red-400', 'bg-red-950/40', selectedTargetTeam)}
        </div>
        <div className="text-center mt-5">
          <button
            onClick={executeTrade}
            disabled={!canTrade()}
            className={`px-6 py-2.5 rounded-lg font-semibold text-sm transition ${
              canTrade()
                ? 'bg-yellow-600 text-white hover:bg-yellow-500'
                : 'bg-gray-700/60 text-gray-500 cursor-not-allowed'
            }`}
          >
            トレード提案
          </button>
          <p className="text-[11px] text-gray-600 mt-2">
            相手チームがトレードを受け入れるかはAIが判断します
          </p>
        </div>
      </div>
    </div>
  );
};

export default TradeScreen;
