import React, { useState } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { POSITION_NAMES } from '../utils/constants.js';

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

  const canTrade = () => {
    if (!selectedMyPlayer || !selectedTargetPlayer || !selectedTargetTeam) return false;
    return true;
  };

  const evaluateTradeAI = () => {
    if (!selectedMyPlayer || !selectedTargetPlayer) return { accept: false, reason: '' };
    const myVal = getPlayerValue(selectedMyPlayer);
    const targetVal = getPlayerValue(selectedTargetPlayer);
    const diff = myVal - targetVal;

    // AIは自分が得する or 同等のトレードを受け入れる
    // 差が-15以上（自分が少し損）でも年齢が若ければ受ける
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
      // 選手を入れ替え（spliceで直接変更）
      const myIdx = myTeam.players.findIndex(p => p.id === selectedMyPlayer.id);
      const targetIdx = targetTeam.players.findIndex(p => p.id === selectedTargetPlayer.id);

      if (myIdx === -1 || targetIdx === -1) {
        setTradeResult({ success: false, message: '選手が見つかりません' });
        return;
      }

      // スタメンから外す
      selectedMyPlayer.battingOrder = 0;
      selectedTargetPlayer.battingOrder = 0;

      // lineupSettingsからも除去
      if (myTeam.lineupSettings?.battingOrder) {
        const idx = myTeam.lineupSettings.battingOrder.findIndex(e => e.playerId === selectedMyPlayer.id);
        if (idx !== -1) myTeam.lineupSettings.battingOrder.splice(idx, 1);
      }
      if (targetTeam.lineupSettings?.battingOrder) {
        const idx = targetTeam.lineupSettings.battingOrder.findIndex(e => e.playerId === selectedTargetPlayer.id);
        if (idx !== -1) targetTeam.lineupSettings.battingOrder.splice(idx, 1);
      }

      // 入れ替え実行
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

  const PlayerRow = ({ player, isSelected, onSelect }) => {
    const val = getPlayerValue(player);
    const isPitcher = player.position === 'pitcher';
    return (
      <tr
        onClick={() => onSelect(player)}
        className={`cursor-pointer transition text-sm ${
          isSelected ? 'bg-blue-900 ring-1 ring-blue-400' : 'hover:bg-gray-700'
        } border-b border-gray-700`}
      >
        <td className="py-1 px-2 font-bold text-white">{player.name}</td>
        <td className="py-1 px-2 text-xs text-gray-400">{POSITION_NAMES[player.position] || player.position}</td>
        <td className="py-1 px-2 text-xs text-gray-400">{player.age || 20}</td>
        {isPitcher ? (
          <>
            <td className="py-1 px-2 text-xs">{player.pitching?.velocity || 0}km</td>
            <td className="py-1 px-2 text-xs">{player.pitching?.control || 0}</td>
            <td className="py-1 px-2 text-xs">{player.pitching?.stamina || 0}</td>
          </>
        ) : (
          <>
            <td className="py-1 px-2 text-xs">{player.batting?.meet || 0}</td>
            <td className="py-1 px-2 text-xs">{player.batting?.power || 0}</td>
            <td className="py-1 px-2 text-xs">{player.physical?.speed || 0}</td>
          </>
        )}
        <td className={`py-1 px-2 text-xs font-bold ${getValueColor(val)}`}>{Math.round(val)}</td>
      </tr>
    );
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">トレード</h1>
        {onBack && (
          <button onClick={onBack} className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition">
            戻る
          </button>
        )}
      </div>

      {tradeResult && (
        <div className={`mb-4 p-4 rounded-lg font-bold ${tradeResult.success ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
          {tradeResult.message}
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* 自チーム */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h2 className="text-lg font-bold text-blue-400 mb-3">{userTeamName}（自チーム）</h2>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-white">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-600">
                  <th className="py-1 px-2 text-left">名前</th>
                  <th className="py-1 px-2 text-left">位</th>
                  <th className="py-1 px-2">齢</th>
                  <th className="py-1 px-2">能力1</th>
                  <th className="py-1 px-2">能力2</th>
                  <th className="py-1 px-2">能力3</th>
                  <th className="py-1 px-2">評価</th>
                </tr>
              </thead>
              <tbody>
                {(myTeam.players || []).map(p => (
                  <PlayerRow
                    key={p.id}
                    player={p}
                    isSelected={selectedMyPlayer?.id === p.id}
                    onSelect={setSelectedMyPlayer}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 相手チーム */}
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="text-lg font-bold text-red-400">相手チーム:</h2>
            <select
              value={selectedTargetTeam}
              onChange={(e) => { setSelectedTargetTeam(e.target.value); setSelectedTargetPlayer(null); }}
              className="bg-gray-700 text-white px-3 py-1 rounded"
            >
              <option value="">-- 選択 --</option>
              {otherTeams.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          {selectedTargetTeam && TEAMS_DATA[selectedTargetTeam] ? (
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-white">
                <thead>
                  <tr className="text-xs text-gray-400 border-b border-gray-600">
                    <th className="py-1 px-2 text-left">名前</th>
                    <th className="py-1 px-2 text-left">位</th>
                    <th className="py-1 px-2">齢</th>
                    <th className="py-1 px-2">能力1</th>
                    <th className="py-1 px-2">能力2</th>
                    <th className="py-1 px-2">能力3</th>
                    <th className="py-1 px-2">評価</th>
                  </tr>
                </thead>
                <tbody>
                  {(TEAMS_DATA[selectedTargetTeam].players || []).map(p => (
                    <PlayerRow
                      key={p.id}
                      player={p}
                      isSelected={selectedTargetPlayer?.id === p.id}
                      onSelect={setSelectedTargetPlayer}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-gray-500 text-center py-8">相手チームを選択してください</div>
          )}
        </div>
      </div>

      {/* トレード実行エリア */}
      <div className="mt-6 bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-bold text-white mb-4">トレード内容</h3>
        <div className="grid grid-cols-3 gap-4 items-center">
          <div className="text-center">
            {selectedMyPlayer ? (
              <div className="bg-blue-900/50 rounded-lg p-3">
                <div className="text-blue-300 text-sm">放出</div>
                <div className="text-white font-bold text-lg">{selectedMyPlayer.name}</div>
                <div className="text-gray-400 text-sm">{POSITION_NAMES[selectedMyPlayer.position]} {selectedMyPlayer.age}歳</div>
                <div className={`font-bold ${getValueColor(getPlayerValue(selectedMyPlayer))}`}>
                  評価: {Math.round(getPlayerValue(selectedMyPlayer))}pt
                </div>
              </div>
            ) : (
              <div className="text-gray-500 p-3">自チームの選手を選択</div>
            )}
          </div>
          <div className="text-center text-3xl text-yellow-400 font-bold">⇄</div>
          <div className="text-center">
            {selectedTargetPlayer ? (
              <div className="bg-red-900/50 rounded-lg p-3">
                <div className="text-red-300 text-sm">獲得</div>
                <div className="text-white font-bold text-lg">{selectedTargetPlayer.name}</div>
                <div className="text-gray-400 text-sm">{POSITION_NAMES[selectedTargetPlayer.position]} {selectedTargetPlayer.age}歳</div>
                <div className={`font-bold ${getValueColor(getPlayerValue(selectedTargetPlayer))}`}>
                  評価: {Math.round(getPlayerValue(selectedTargetPlayer))}pt
                </div>
              </div>
            ) : (
              <div className="text-gray-500 p-3">相手チームの選手を選択</div>
            )}
          </div>
        </div>
        <div className="text-center mt-4">
          <button
            onClick={executeTrade}
            disabled={!canTrade()}
            className={`px-8 py-3 rounded-lg font-bold text-lg transition ${
              canTrade()
                ? 'bg-yellow-600 text-white hover:bg-yellow-500'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            トレード提案
          </button>
          <p className="text-xs text-gray-500 mt-2">
            相手チームがトレードを受け入れるかはAIが判断します（評価差が大きいと拒否されます）
          </p>
        </div>
      </div>
    </div>
  );
};

export default TradeScreen;
