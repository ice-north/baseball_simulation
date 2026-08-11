import React, { useState } from 'react';
import { TOSHITAIKOU_REGION_NAMES, REGIONAL_SLOTS, getRoundName } from '../corporate/toshitaikou.js';

const RANK_COLORS = { S: 'text-yellow-400', A: 'text-red-400', B: 'text-blue-400', C: 'text-green-400', D: 'text-gray-300' };

const BracketView = ({ bracket, title }) => {
  if (!bracket) return null;
  return (
    <div className="mb-4">
      {title && <h3 className="text-white font-bold mb-2">{title}</h3>}
      {bracket.rounds.map((round, ri) => {
        const realMatches = round.filter(m => !m.isBye && m.winner);
        if (realMatches.length === 0) return null;
        return (
          <div key={ri} className="mb-2">
            <div className="text-gray-300 text-xs mb-1">{getRoundName(bracket, ri)}</div>
            <div className="space-y-1">
              {realMatches.map((m, mi) => (
                <div key={mi} className="flex items-center gap-2 text-sm">
                  <span className={m.winner === m.team1 ? 'text-white font-bold' : 'text-gray-400'}>{m.team1}</span>
                  <span className="text-gray-400 text-xs">{m.score?.[0]}-{m.score?.[1]}</span>
                  <span className={m.winner === m.team2 ? 'text-white font-bold' : 'text-gray-400'}>{m.team2}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {bracket.champion && (
        <div className="text-yellow-400 font-bold text-sm mt-1">優勝: {bracket.champion}</div>
      )}
    </div>
  );
};

const ToshitaikouQualifierScreen = ({ toshitaikou, userTeamName, onContinue }) => {
  const [selectedRegion, setSelectedRegion] = useState(null);
  const qualifiers = toshitaikou?.qualifiers || {};

  if (selectedRegion) {
    const q = qualifiers[selectedRegion];
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 p-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-white mb-1">{q.regionName} 地区予選</h1>
          <p className="text-gray-300 text-sm mb-4">{q.teamDefs.length}チーム → {q.slots}枠</p>

          <BracketView bracket={q.mainBracket} title="勝者側トーナメント" />
          {q.losersBracket && <BracketView bracket={q.losersBracket} title="敗者復活トーナメント" />}

          <div className="bg-gray-800 rounded-lg p-3 mt-4">
            <h3 className="text-green-400 font-bold text-sm mb-1">代表チーム</h3>
            {q.qualifiedTeams.map((name, i) => {
              const def = q.teamDefsMap[name];
              return (
                <div key={i} className="flex items-center gap-2 text-sm py-0.5">
                  <span className="text-gray-400">{i + 1}.</span>
                  <span className={`font-bold ${RANK_COLORS[def?.rank] || ''}`}>{def?.rank}</span>
                  <span className={name === userTeamName ? 'text-yellow-300 font-bold' : 'text-white'}>{name}</span>
                </div>
              );
            })}
          </div>

          <button onClick={() => setSelectedRegion(null)} className="mt-4 text-gray-300 hover:text-white text-sm">
            ← 全地区一覧に戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-1 text-center">都市対抗野球 地区予選</h1>
        <p className="text-gray-300 mb-6 text-center">6月 ― 各地区の代表が決定しました</p>

        <div className="grid grid-cols-2 gap-3">
          {Object.entries(qualifiers).map(([regionId, q]) => {
            const hasUser = q.qualifiedTeams.includes(userTeamName);
            const userInRegion = q.teamDefsMap[userTeamName];
            return (
              <button
                key={regionId}
                onClick={() => setSelectedRegion(regionId)}
                className={`text-left p-3 rounded-lg border transition hover:border-blue-500 ${
                  userInRegion ? 'bg-blue-900/30 border-blue-700' : 'bg-gray-800 border-gray-700'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-white font-bold">{q.regionName}</span>
                  <span className="text-gray-400 text-xs">{q.teamDefs.length}チーム → {q.slots}枠</span>
                </div>
                <div className="text-sm space-y-0.5">
                  {q.qualifiedTeams.map((name, i) => (
                    <span key={i} className={`block text-xs ${name === userTeamName ? 'text-yellow-300 font-bold' : 'text-gray-300'}`}>
                      {name} {name === userTeamName && '★'}
                    </span>
                  ))}
                </div>
                {userInRegion && !hasUser && (
                  <div className="text-red-400 text-xs mt-1">あなたのチームは予選敗退</div>
                )}
              </button>
            );
          })}
        </div>

        <div className="text-center mt-6">
          <button
            onClick={onContinue}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 py-3 rounded-lg transition"
          >
            8月の本戦に向けて日程を進める
          </button>
        </div>
      </div>
    </div>
  );
};

const ToshitaikouMainScreen = ({ toshitaikou, userTeamName, onContinue }) => {
  const mt = toshitaikou?.mainTournament;
  if (!mt) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-1 text-center">都市対抗野球大会 本戦</h1>
        <p className="text-gray-300 mb-6 text-center">8月 ― {mt.teams.length}チームによるトーナメント</p>

        <BracketView bracket={mt.bracket} />

        <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 mt-4 text-center">
          <div className="text-yellow-400 text-2xl font-bold mb-1">🏆 {toshitaikou.champion}</div>
          <div className="text-gray-300 text-sm">準優勝: {toshitaikou.runnerUp}</div>
        </div>

        {userTeamName && mt.teams.some(t => t.name === userTeamName) && (
          <div className="text-center mt-2">
            {toshitaikou.champion === userTeamName
              ? <p className="text-yellow-300 font-bold">あなたのチームが優勝しました！</p>
              : <p className="text-gray-300 text-sm">あなたのチーム: {userTeamName}</p>
            }
          </div>
        )}

        <div className="text-center mt-6">
          <button
            onClick={onContinue}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 py-3 rounded-lg transition"
          >
            日程に戻る
          </button>
        </div>
      </div>
    </div>
  );
};

export { ToshitaikouQualifierScreen, ToshitaikouMainScreen };
