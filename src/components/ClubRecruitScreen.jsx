import React, { useState, useMemo } from 'react';
import { TEAMS_DATA, releasedPlayersPool } from '../teams-data.js';
import { removeFromReleasedPoolById } from '../state/pools.js';
import { addToRoster } from '../state/roster.js';
import { POSITION_NAMES, getAbilityColor } from '../utils/constants.js';
import { AbilityValue } from './AbilityValue.jsx';

const ClubRecruitScreen = ({ seasonData, onComplete }) => {
  const teamNames = Object.keys(TEAMS_DATA || {});
  const userTeamName = teamNames[0] || '';
  const teamData = TEAMS_DATA[userTeamName];
  const currentRoster = teamData?.players?.length || 0;

  const [accepted, setAccepted] = useState({});
  const [confirmed, setConfirmed] = useState(false);

  const candidates = useMemo(() => {
    const pool = [...releasedPlayersPool];
    const scored = pool.map(p => {
      const isPitcher = p.position === 'pitcher';
      const score = isPitcher
        ? (p.pitching?.velocity - 120) * 1.2 + (p.pitching?.control || 0) * 0.8 + (p.pitching?.stamina || 0) * 0.3
        : (p.batting?.meet || 0) + (p.batting?.power || 0) * 0.8 + (p.physical?.speed || 0) * 0.4 + (p.fielding?.defense || 0) * 0.3;
      return { player: p, score };
    });

    // クラブチームは能力の低い選手が入部希望（上位はプロ・企業に行く）
    scored.sort((a, b) => a.score - b.score);

    // 下位〜中位の選手から候補を出す（完全な底辺は除外）
    const lowerHalf = scored.slice(Math.floor(scored.length * 0.1), Math.floor(scored.length * 0.5));
    // シャッフルして5〜8人を選出
    for (let i = lowerHalf.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [lowerHalf[i], lowerHalf[j]] = [lowerHalf[j], lowerHalf[i]];
    }
    const count = 5 + Math.floor(Math.random() * 4);
    return lowerHalf.slice(0, Math.min(count, lowerHalf.length));
  }, []);

  const acceptedCount = Object.values(accepted).filter(Boolean).length;

  const handleConfirm = () => {
    const acceptedIds = new Set(
      Object.entries(accepted).filter(([, v]) => v).map(([id]) => parseInt(id))
    );

    for (const cand of candidates) {
      if (acceptedIds.has(cand.player.id)) {
        const player = { ...cand.player };
        player.isStarter = false;
        player.battingOrder = 0;
        if (!player.careerHistory) player.careerHistory = [];
        player.careerHistory.push({ type: 'club_join', year: seasonData?.year || 1, label: `${userTeamName}入部` });
        addToRoster(teamData, player);

        removeFromReleasedPoolById(player.id);
      }
    }

    setConfirmed(true);
  };

  if (confirmed) {
    return (
      <div className="p-4 bg-gray-900 min-h-screen">
        <h1 className="text-xl font-bold text-white mb-3">入部受付完了</h1>
        <div className="mb-4 bg-gray-800 rounded p-3">
          <div className="text-xs text-gray-300">
            新規入部: <span className="text-green-400 font-bold">{acceptedCount}名</span>
          </div>
          <div className="text-xs text-gray-300 mt-1">
            来季ロスター: <span className="text-white font-bold">{teamData?.players?.length || 0}名</span>
          </div>
        </div>
        {acceptedCount > 0 && (
          <div className="mb-4">
            <h2 className="text-sm font-bold text-green-400 mb-2">入部選手</h2>
            <div className="grid grid-cols-2 gap-1">
              {candidates.filter(c => accepted[c.player.id]).map(c => (
                <div key={c.player.id} className="text-xs text-gray-300 bg-gray-800 p-1.5 rounded">
                  <span className="text-yellow-300">{POSITION_NAMES[c.player.position]}</span>
                  <span className="ml-1 text-white font-bold">{c.player.name}</span>
                  <span className="text-gray-400 ml-1">({c.player.age}歳)</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <button
          onClick={onComplete}
          className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold"
        >
          オフシーズンへ進む
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 bg-gray-900 min-h-screen">
      <h1 className="text-xl font-bold text-white mb-1">入部希望者</h1>
      <p className="text-gray-300 text-xs mb-4">
        プロや企業チームに入れなかった選手たちが入部を希望しています。受け入れる選手を選んでください。
      </p>

      <div className="mb-3 flex items-center gap-3 text-xs text-gray-300">
        <span>現在のロスター: <span className="text-white font-bold">{currentRoster}名</span></span>
        <span>入部希望: <span className="text-green-400 font-bold">{candidates.length}名</span></span>
        <span>受入予定: <span className="text-blue-400 font-bold">{acceptedCount}名</span></span>
      </div>

      {candidates.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-6 text-center">
          <p className="text-gray-300">今年は入部希望者がいませんでした。</p>
        </div>
      ) : (
        <div className="space-y-2">
          {candidates.map(({ player }) => {
            const isPitcher = player.position === 'pitcher';
            const isAccepted = accepted[player.id];
            return (
              <div
                key={player.id}
                className={`border rounded-lg p-3 transition cursor-pointer ${
                  isAccepted ? 'bg-green-900/30 border-green-600' : 'bg-gray-800 border-gray-700 hover:border-gray-500'
                }`}
                onClick={() => setAccepted(prev => ({ ...prev, [player.id]: !prev[player.id] }))}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-400 text-xs font-bold">{POSITION_NAMES[player.position]}</span>
                    <span className="text-white font-bold">{player.name}</span>
                    <span className="text-gray-400 text-xs">({player.age}歳)</span>
                    <span className="text-gray-400 text-xs">
                      {player.throws === 'left' ? '左投' : '右投'}{player.bats === 'left' ? '左打' : player.bats === 'switch' ? '両打' : '右打'}
                    </span>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    isAccepted ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'
                  }`}>
                    {isAccepted ? '受入' : '見送り'}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-x-3 gap-y-0.5 text-xs">
                  {isPitcher ? (
                    <>
                      <div>球速: <AbilityValue value={player.pitching?.velocity} isVel />km</div>
                      <div>制球: <span className={getAbilityColor(player.pitching?.control)}>{player.pitching?.control}</span></div>
                      <div>スタミナ: <AbilityValue value={player.pitching?.stamina} isSta /></div>
                      <div>プロ意識: <span className={getAbilityColor(player.personality?.discipline)}>{player.personality?.discipline ?? '?'}</span></div>
                    </>
                  ) : (
                    <>
                      <div>ミート: <span className={getAbilityColor(player.batting?.meet)}>{player.batting?.meet}</span></div>
                      <div>パワー: <span className={getAbilityColor(player.batting?.power)}>{player.batting?.power}</span></div>
                      <div>走力: <span className={getAbilityColor(player.physical?.speed)}>{player.physical?.speed}</span></div>
                      <div>プロ意識: <span className={getAbilityColor(player.personality?.discipline)}>{player.personality?.discipline ?? '?'}</span></div>
                    </>
                  )}
                </div>
                {player.careerHistory?.length > 0 && (
                  <div className="text-xs text-gray-400 mt-1">
                    経歴: {player.careerHistory.map(h => h.label).join(' → ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex items-center gap-4">
        <button
          onClick={handleConfirm}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold"
        >
          {acceptedCount > 0 ? `${acceptedCount}名を受け入れて確定` : '入部なしで確定'}
        </button>
      </div>
    </div>
  );
};

export default ClubRecruitScreen;
