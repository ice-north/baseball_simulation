import React, { useState, useMemo } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { addToRoster } from '../state/roster.js';
import { POSITION_NAMES, getAbilityRank, getRankColor } from '../utils/constants.js';
import { cleanupPlayerReferences } from '../season/yearProgressionSystem.js';

const StatVal = ({ value, isPitcherVelocity }) => {
  const rank = getAbilityRank(value, isPitcherVelocity);
  return <span className={`font-semibold ${getRankColor(rank)}`}>{value}</span>;
};

const TradeScreen = ({ userTeamName, onBack }) => {
  const [selectedMyPlayer, setSelectedMyPlayer] = useState(null);
  const [selectedTargetTeam, setSelectedTargetTeam] = useState('');
  const [selectedTargetPlayer, setSelectedTargetPlayer] = useState(null);
  const [tradeResult, setTradeResult] = useState(null);
  const [updateTrigger, setUpdateTrigger] = useState(0);
  const [tradeTab, setTradeTab] = useState('propose');

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

  // チームのカテゴリ別プロファイル（余剰・不足）を返す
  const getTeamProfile = (players) => {
    const pitchers = players.filter(p => p.position === 'pitcher');
    const fielders = players.filter(p => p.position !== 'pitcher');
    const pitcherAvg = pitchers.length
      ? pitchers.reduce((s, p) => s + getPlayerValue(p), 0) / pitchers.length : 0;
    const fielderAvg = fielders.length
      ? fielders.reduce((s, p) => s + getPlayerValue(p), 0) / fielders.length : 0;
    // 平均値が高いほうが「余剰」、低いほうが「不足」
    return {
      surplus: pitcherAvg >= fielderAvg ? 'pitcher' : 'fielder',
      need:    pitcherAvg <  fielderAvg ? 'pitcher' : 'fielder',
      pitcherAvg, fielderAvg, pitchers, fielders,
    };
  };

  // AI チームからのトレード提案を生成（win-win のみ）
  const aiProposals = useMemo(() => {
    const proposals = [];
    const myPlayers = myTeam?.players || [];
    if (!myPlayers.length) return proposals;

    const userProfile = getTeamProfile(myPlayers);

    Object.entries(TEAMS_DATA).forEach(([teamName, team]) => {
      if (teamName === userTeamName || !team.players?.length) return;

      const aiProfile = getTeamProfile(team.players);

      // win-win 条件：互いの余剰と不足が補完し合う場合のみ提案
      // AI余剰 = ユーザー不足 かつ AI不足 = ユーザー余剰
      if (aiProfile.surplus !== userProfile.need) return;

      // AI が提示できる選手（AIの余剰カテゴリの中で上位、ただし最良1人は除く）
      const aiSurplusPool = (aiProfile.surplus === 'pitcher' ? aiProfile.pitchers : aiProfile.fielders)
        .sort((a, b) => getPlayerValue(b) - getPlayerValue(a));
      if (aiSurplusPool.length < 2) return;
      // 最良は手放さない → 2番手以降から最も価値の高い選手を提示
      const offeredPlayer = aiSurplusPool[1];
      const offeredVal = getPlayerValue(offeredPlayer);

      // ユーザーが出せる選手（ユーザーの余剰カテゴリ）
      // 平均値を超える選手の中でAIの提示選手に価値が近い選手を要求
      const userSurplusPool = (userProfile.surplus === 'pitcher'
        ? myPlayers.filter(p => p.position === 'pitcher')
        : myPlayers.filter(p => p.position !== 'pitcher')
      ).sort((a, b) => Math.abs(getPlayerValue(a) - offeredVal) - Math.abs(getPlayerValue(b) - offeredVal));
      if (!userSurplusPool.length) return;
      const wantedPlayer = userSurplusPool[0];
      const wantedVal = getPlayerValue(wantedPlayer);

      // 価値差が大きすぎる提案は出さない（±30%以内）
      const ratio = offeredVal / (wantedVal || 1);
      if (ratio < 0.70 || ratio > 1.43) return;

      // ユーザー側の純益を確認（受け取る選手がそのカテゴリの現平均より高いか）
      const userCatAvg = userProfile.need === 'pitcher' ? userProfile.pitcherAvg : userProfile.fielderAvg;
      if (offeredVal < userCatAvg * 0.85) return; // 補強にならない選手は除外

      proposals.push({
        fromTeam: teamName,
        offeredPlayer,
        wantedPlayer,
        offeredVal: Math.round(offeredVal),
        wantedVal:  Math.round(wantedVal),
        reason: `${teamName}は${aiProfile.need === 'pitcher' ? '投手' : '野手'}補強、あなたは${userProfile.need === 'pitcher' ? '投手' : '野手'}補強`,
      });
    });

    return proposals;
  }, [userTeamName, updateTrigger]);

  const acceptAIProposal = (proposal) => {
    const targetTeam = TEAMS_DATA[proposal.fromTeam];
    const myTeamData = myTeam;
    let myIdx = myTeamData.players.indexOf(proposal.wantedPlayer);
    if (myIdx === -1) myIdx = myTeamData.players.findIndex(p => p.id === proposal.wantedPlayer.id);
    let theirIdx = targetTeam.players.indexOf(proposal.offeredPlayer);
    if (theirIdx === -1) theirIdx = targetTeam.players.findIndex(p => p.id === proposal.offeredPlayer.id);
    if (myIdx === -1 || theirIdx === -1) { setTradeResult({ success: false, message: '選手が見つかりません' }); return; }

    proposal.wantedPlayer.battingOrder = 0;
    proposal.offeredPlayer.battingOrder = 0;
    cleanupPlayerReferences(myTeamData, proposal.wantedPlayer.id);
    cleanupPlayerReferences(targetTeam, proposal.offeredPlayer.id);
    myTeamData.players.splice(myIdx, 1);
    targetTeam.players.splice(theirIdx, 1);
    addToRoster(myTeamData, proposal.offeredPlayer);
    addToRoster(targetTeam, proposal.wantedPlayer);

    setTradeResult({ success: true, message: `トレード成立！ ${proposal.wantedPlayer.name} ⇄ ${proposal.offeredPlayer.name}（${proposal.fromTeam}）` });
    setTradeTab('propose');
    setUpdateTrigger(prev => prev + 1);
  };

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
      addToRoster(myTeam, selectedTargetPlayer);
      addToRoster(targetTeam, selectedMyPlayer);

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
    const ps = player.seasonStats?.pitching;
    const bs = player.seasonStats?.batting;
    const parts = [];
    if (ps?.games) {
      const ip = ps.inningsPitched || 0;
      const era = ip > 0 ? ((ps.earnedRuns || 0) * 27 / ip).toFixed(2) : '-';
      parts.push(`投${ps.games}試 ${era}ERA`);
    }
    if (bs?.games) {
      const avg = bs.atBats > 0 ? (bs.hits / bs.atBats).toFixed(3) : '.000';
      parts.push(`打${bs.games}試 ${avg} ${bs.homeruns || 0}本`);
    }
    const games = Math.max(ps?.games || 0, bs?.games || 0);
    return { games, line: parts.join(' / ') };
  };

  const PlayerRow = ({ player, isSelected, onSelect, teamName }) => {
    const val = getPlayerValue(player);
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
              <span className="text-xs bg-blue-600/50 text-blue-300 w-4 h-4 rounded flex items-center justify-center font-bold shrink-0">{order}</span>
            ) : (
              <span className="text-xs text-gray-600 w-4 text-center shrink-0">控</span>
            )}
            <span className="font-bold text-white text-sm truncate">{player.name}</span>
          </div>
        </td>
        <td className="py-1.5 px-1 text-xs text-gray-400">{POSITION_NAMES[player.position] || player.position}</td>
        <td className="py-1.5 px-1 text-xs text-gray-500 text-center">{player.age || 20}</td>
        {/* 打撃 */}
        <td className="py-1.5 px-0.5 text-xs text-center border-l border-gray-700/30"><StatVal value={player.batting?.meet || 0} /></td>
        <td className="py-1.5 px-0.5 text-xs text-center"><StatVal value={player.batting?.power || 0} /></td>
        {/* フィジカル */}
        <td className="py-1.5 px-0.5 text-xs text-center border-l border-gray-700/30"><StatVal value={player.physical?.speed || 0} /></td>
        <td className="py-1.5 px-0.5 text-xs text-center"><StatVal value={player.physical?.arm || 0} /></td>
        <td className="py-1.5 px-0.5 text-xs text-center"><StatVal value={player.fielding?.defense || 0} /></td>
        {/* 投手 */}
        <td className="py-1.5 px-0.5 text-xs text-center border-l border-gray-700/30"><StatVal value={player.pitching?.velocity || 0} isPitcherVelocity /></td>
        <td className="py-1.5 px-0.5 text-xs text-center"><StatVal value={player.pitching?.control || 0} /></td>
        <td className="py-1.5 px-0.5 text-xs text-center"><StatVal value={player.pitching?.stamina || 0} /></td>
        {/* 出場 */}
        <td className="py-1.5 px-1 text-xs text-center text-gray-300 border-l border-gray-700/30">{season.games || '-'}</td>
        <td className="py-1.5 px-1 text-xs text-gray-400 truncate max-w-[120px]">{season.line || '-'}</td>
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
            <tr className="bg-gray-800 border-b border-gray-700/30 text-xs font-medium">
              <th colSpan={3} className="py-0.5 pl-2 text-gray-500">選手情報</th>
              <th colSpan={2} className="py-0.5 px-1 text-center text-blue-400/60 border-l border-gray-700/30">打撃</th>
              <th colSpan={3} className="py-0.5 px-1 text-center text-cyan-400/60 border-l border-gray-700/30">フィジカル</th>
              <th colSpan={3} className="py-0.5 px-1 text-center text-red-400/60 border-l border-gray-700/30">投手</th>
              <th colSpan={2} className="py-0.5 px-1 text-center text-green-400/60 border-l border-gray-700/30">出場</th>
              <th className="py-0.5 px-1 text-center text-gray-500 border-l border-gray-700/30">総合</th>
            </tr>
            <tr className="bg-gray-800 border-b border-gray-700/50 text-xs text-gray-400">
              <th className="py-1 pl-2 text-left font-medium">名前</th>
              <th className="py-1 px-1 font-medium">守備</th>
              <th className="py-1 px-1 text-center font-medium">齢</th>
              <th className="py-1 px-0.5 text-center font-medium border-l border-gray-700/30">ミ</th>
              <th className="py-1 px-0.5 text-center font-medium">パ</th>
              <th className="py-1 px-0.5 text-center font-medium border-l border-gray-700/30">走</th>
              <th className="py-1 px-0.5 text-center font-medium">肩</th>
              <th className="py-1 px-0.5 text-center font-medium">守</th>
              <th className="py-1 px-0.5 text-center font-medium border-l border-gray-700/30">球速</th>
              <th className="py-1 px-0.5 text-center font-medium">制球</th>
              <th className="py-1 px-0.5 text-center font-medium">ス</th>
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
    const order = getLineupOrder(player, teamName);
    const season = getSeasonLine(player);
    return (
      <div className={`${bgColor} rounded-xl p-4 border border-gray-700/50`}>
        <div className={`text-xs font-medium ${labelColor} mb-2`}>{label}</div>
        <div className="flex items-center gap-2 mb-2">
          {order && <span className="text-xs bg-blue-600/50 text-blue-300 px-1.5 py-0.5 rounded font-bold">{order}番</span>}
          <span className="text-white font-bold text-lg">{player.name}</span>
        </div>
        <div className="text-gray-400 text-sm mb-3">{POSITION_NAMES[player.position]} / {player.age}歳</div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs mb-3">
          <span className="text-gray-400">ミ <StatVal value={player.batting?.meet || 0} /></span>
          <span className="text-gray-400">パ <StatVal value={player.batting?.power || 0} /></span>
          <span className="text-gray-400">走 <StatVal value={player.physical?.speed || 0} /></span>
          <span className="text-gray-400">肩 <StatVal value={player.physical?.arm || 0} /></span>
          <span className="text-gray-400">守 <StatVal value={player.fielding?.defense || 0} /></span>
          <span className="text-gray-400">球速 <StatVal value={player.pitching?.velocity || 0} isPitcherVelocity /></span>
          <span className="text-gray-400">制球 <StatVal value={player.pitching?.control || 0} /></span>
          <span className="text-gray-400">スタ <StatVal value={player.pitching?.stamina || 0} /></span>
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
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-white">トレード</h1>
        {onBack && (
          <button onClick={onBack} className="px-3 py-1.5 bg-gray-700/80 text-gray-300 rounded-lg hover:bg-gray-600 transition text-sm">
            戻る
          </button>
        )}
      </div>

      {/* タブ切り替え */}
      <div className="flex gap-1.5 mb-5 bg-gray-800/60 rounded-xl p-1.5 border border-gray-700/50 w-fit">
        <button
          onClick={() => setTradeTab('propose')}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${
            tradeTab === 'propose' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/60'
          }`}
        >
          提案する
        </button>
        <button
          onClick={() => setTradeTab('inbox')}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition flex items-center gap-1.5 ${
            tradeTab === 'inbox' ? 'bg-yellow-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/60'
          }`}
        >
          受信提案
          {aiProposals.length > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center">
              {aiProposals.length}
            </span>
          )}
        </button>
      </div>

      {tradeResult && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-semibold border ${
          tradeResult.success
            ? 'bg-green-900/40 text-green-300 border-green-700/50'
            : 'bg-red-900/40 text-red-300 border-red-700/50'
        }`}>
          {tradeResult.message}
        </div>
      )}

      {tradeTab === 'inbox' && (
        <div className="bg-gray-800/80 rounded-xl border border-gray-700/50 overflow-hidden mb-5">
          <div className="px-4 py-3 border-b border-gray-700/50">
            <h2 className="font-semibold text-sm text-yellow-400">AIチームからの受信提案</h2>
            <p className="text-xs text-gray-500 mt-0.5">相手チームが欲しがっている選手と引き換えに提案が来ています</p>
          </div>
          {aiProposals.length === 0 ? (
            <div className="py-10 text-center text-gray-600 text-sm">現在、受信している提案はありません</div>
          ) : (
            <div className="divide-y divide-gray-700/40">
              {aiProposals.map((proposal, i) => (
                <div key={i} className="p-4 hover:bg-gray-700/20 transition">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-semibold text-yellow-400 bg-yellow-900/40 px-2 py-0.5 rounded-lg border border-yellow-700/40">
                      {proposal.fromTeam}
                    </span>
                    <span className="text-xs text-gray-500">からの提案</span>
                  </div>
                  <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center mb-4">
                    {/* 放出 (ユーザー側) */}
                    <div className="bg-red-950/40 rounded-xl p-3 border border-red-900/40">
                      <div className="text-xs text-red-400 font-medium mb-1">放出（あなたの選手）</div>
                      <div className="font-bold text-white">{proposal.wantedPlayer.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{POSITION_NAMES[proposal.wantedPlayer.position]} / {proposal.wantedPlayer.age}歳</div>
                      <div className={`text-xs font-bold mt-1 ${getValueColor(proposal.wantedVal)}`}>評価 {proposal.wantedVal}pt</div>
                    </div>
                    <div className="text-xl text-yellow-400/70 font-bold text-center">⇄</div>
                    {/* 獲得 (AI側) */}
                    <div className="bg-blue-950/40 rounded-xl p-3 border border-blue-900/40">
                      <div className="text-xs text-blue-400 font-medium mb-1">獲得（相手の選手）</div>
                      <div className="font-bold text-white">{proposal.offeredPlayer.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{POSITION_NAMES[proposal.offeredPlayer.position]} / {proposal.offeredPlayer.age}歳</div>
                      <div className={`text-xs font-bold mt-1 ${getValueColor(proposal.offeredVal)}`}>評価 {proposal.offeredVal}pt</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => acceptAIProposal(proposal)}
                      className="px-4 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded-lg text-sm font-semibold transition"
                    >
                      承諾する
                    </button>
                    <button
                      onClick={() => setTradeTab('propose')}
                      className="px-4 py-1.5 bg-gray-700/80 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition"
                    >
                      断る
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tradeTab === 'propose' && <div className="grid grid-cols-2 gap-4 mb-5">
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
                  <tr className="bg-gray-800 border-b border-gray-700/30 text-xs font-medium">
                    <th colSpan={3} className="py-0.5 pl-2 text-gray-500">選手情報</th>
                    <th colSpan={2} className="py-0.5 px-1 text-center text-blue-400/60 border-l border-gray-700/30">打撃</th>
                    <th colSpan={3} className="py-0.5 px-1 text-center text-cyan-400/60 border-l border-gray-700/30">フィジカル</th>
                    <th colSpan={3} className="py-0.5 px-1 text-center text-red-400/60 border-l border-gray-700/30">投手</th>
                    <th colSpan={2} className="py-0.5 px-1 text-center text-green-400/60 border-l border-gray-700/30">出場</th>
                    <th className="py-0.5 px-1 text-center text-gray-500 border-l border-gray-700/30">総合</th>
                  </tr>
                  <tr className="bg-gray-800 border-b border-gray-700/50 text-xs text-gray-400">
                    <th className="py-1 pl-2 text-left font-medium">名前</th>
                    <th className="py-1 px-1 font-medium">守備</th>
                    <th className="py-1 px-1 text-center font-medium">齢</th>
                    <th className="py-1 px-0.5 text-center font-medium border-l border-gray-700/30">ミ</th>
                    <th className="py-1 px-0.5 text-center font-medium">パ</th>
                    <th className="py-1 px-0.5 text-center font-medium border-l border-gray-700/30">走</th>
                    <th className="py-1 px-0.5 text-center font-medium">肩</th>
                    <th className="py-1 px-0.5 text-center font-medium">守</th>
                    <th className="py-1 px-0.5 text-center font-medium border-l border-gray-700/30">球速</th>
                    <th className="py-1 px-0.5 text-center font-medium">制球</th>
                    <th className="py-1 px-0.5 text-center font-medium">ス</th>
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
      </div>}

      {tradeTab === 'propose' && (
        /* トレード内容 */
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
            <p className="text-xs text-gray-600 mt-2">
              相手チームがトレードを受け入れるかはAIが判断します
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default TradeScreen;
