import React, { useState, useMemo } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { POSITION_NAMES } from '../utils/constants.js';
import { advanceToNextYear, advanceToNextYearSandbox } from '../season/yearProgressionSystem.js';

const OffSeasonScreen = ({ seasonData, setSeasonData, onSave, onStartNextSeason, onAddHallOfFamePlayers, onRecordTeamHistory, saveSlots, gameMode }) => {
  const [processing, setProcessing] = useState(false);
  const [selectedSaveSlot, setSelectedSaveSlot] = useState(0);
  const [saveStatus, setSaveStatus] = useState(null);

  const handleSaveToSlot = () => {
    if (onSave) {
      onSave(selectedSaveSlot);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  // シーズン成果をstandingsとTEAMS_DATAから算出
  const seasonSummary = useMemo(() => {
    const standings = seasonData?.standings;
    if (!standings || standings.length === 0) return null;

    const sorted = [...standings].sort((a, b) => b.winRate - a.winRate);
    const champion = sorted[0];

    // 打撃王・本塁打王
    let topBatter = null, topHR = null, topPitcher = null;
    Object.values(TEAMS_DATA).forEach(team => {
      (team.players || []).forEach(p => {
        const bs = p.seasonStats?.batting;
        const ps = p.seasonStats?.pitching;
        if (bs && bs.atBats >= 30) {
          const avg = bs.hits / bs.atBats;
          if (!topBatter || avg > topBatter.avg)
            topBatter = { name: p.name, team: team.name || '', avg: avg.toFixed(3), hits: bs.hits, atBats: bs.atBats };
          if (!topHR || (bs.homeruns || 0) > topHR.hr)
            topHR = { name: p.name, team: team.name || '', hr: bs.homeruns || 0 };
        }
        if (ps && (ps.inningsPitched || 0) >= 15) {
          const era = ps.inningsPitched > 0 ? ((ps.earnedRuns || 0) * 27 / ps.inningsPitched).toFixed(2) : '-.--';
          if (!topPitcher || parseFloat(era) < parseFloat(topPitcher.era))
            topPitcher = { name: p.name, team: team.name || '', era, wins: ps.wins || 0 };
        }
      });
    });

    return { champion, standings: sorted, topBatter, topHR, topPitcher };
  }, [seasonData]);

  const handleAdvanceYear = () => {
    if (!advanceToNextYear) {
      alert('年間進行システムが読み込まれていません');
      return;
    }
    setProcessing(true);
    try {
      const allTeams = TEAMS_DATA || {};

      if (onRecordTeamHistory && seasonData.standings) {
        const sortedStandings = [...seasonData.standings].sort((a, b) => b.winRate - a.winRate);
        const teamRecords = sortedStandings.map((s, idx) => {
          const team = allTeams[s.team];
          let mvpBatter = null;
          let mvpPitcher = null;
          if (team?.players) {
            const batters = team.players.filter(p => p.position !== 'pitcher' && p.seasonStats?.batting?.atBats >= 50);
            if (batters.length > 0) {
              mvpBatter = batters.reduce((best, p) => {
                const ops = (p.seasonStats.batting.atBats > 0 ? p.seasonStats.batting.hits / p.seasonStats.batting.atBats : 0) + (p.seasonStats.batting.homeruns || 0) * 0.01;
                const bestOps = (best.seasonStats.batting.atBats > 0 ? best.seasonStats.batting.hits / best.seasonStats.batting.atBats : 0) + (best.seasonStats.batting.homeruns || 0) * 0.01;
                return ops > bestOps ? p : best;
              });
              if (mvpBatter) {
                const ab = mvpBatter.seasonStats.batting.atBats;
                mvpBatter = {
                  name: mvpBatter.name,
                  avg: ab > 0 ? (mvpBatter.seasonStats.batting.hits / ab).toFixed(3) : '.000',
                  hr: mvpBatter.seasonStats.batting.homeruns || 0,
                  rbi: mvpBatter.seasonStats.batting.rbis || 0,
                  hits: mvpBatter.seasonStats.batting.hits || 0
                };
              }
            }
            const pitchers = team.players.filter(p => p.position === 'pitcher' && p.seasonStats?.pitching?.inningsPitched >= 10);
            if (pitchers.length > 0) {
              mvpPitcher = pitchers.reduce((best, p) => {
                const score = (p.seasonStats.pitching.wins || 0) * 3 + (p.seasonStats.pitching.saves || 0) * 2 + (p.seasonStats.pitching.strikeouts || 0) * 0.1;
                const bestScore = (best.seasonStats.pitching.wins || 0) * 3 + (best.seasonStats.pitching.saves || 0) * 2 + (best.seasonStats.pitching.strikeouts || 0) * 0.1;
                return score > bestScore ? p : best;
              });
              if (mvpPitcher) {
                const ip = mvpPitcher.seasonStats.pitching.inningsPitched || 0;
                mvpPitcher = {
                  name: mvpPitcher.name,
                  wins: mvpPitcher.seasonStats.pitching.wins || 0,
                  losses: mvpPitcher.seasonStats.pitching.losses || 0,
                  saves: mvpPitcher.seasonStats.pitching.saves || 0,
                  era: ip > 0 ? ((mvpPitcher.seasonStats.pitching.earnedRuns || 0) * 27 / ip).toFixed(2) : '-.--',
                  strikeouts: mvpPitcher.seasonStats.pitching.strikeouts || 0
                };
              }
            }
          }
          return {
            team: s.team, rank: idx + 1,
            wins: s.wins, losses: s.losses, draws: s.draws || 0,
            winRate: s.winRate, mvpBatter, mvpPitcher
          };
        });
        onRecordTeamHistory({ year: seasonData.year, standings: teamRecords });
      }

      const result = gameMode === 'sandbox'
        ? advanceToNextYearSandbox(seasonData, allTeams)
        : advanceToNextYear(seasonData, allTeams);
      setSeasonData(result.newSeasonData);
      Object.keys(result.updatedTeams).forEach(teamName => {
        TEAMS_DATA[teamName] = result.updatedTeams[teamName];
      });
      if (onAddHallOfFamePlayers && result.retirements && result.retirements.length > 0) {
        const retiredPlayers = result.retirements.map(r => ({
          ...r, departureType: 'retired', year: seasonData.year
        }));
        onAddHallOfFamePlayers(retiredPlayers);
      }
      if (onStartNextSeason) onStartNextSeason();
    } catch (error) {
      console.error('年度進行エラー:', error);
      alert('年度進行中にエラーが発生しました');
      setProcessing(false);
    }
  };

  const slotNames = ['スロット1', 'スロット2', 'スロット3'];

  const SaveSlotSelector = () => (
    <div className="bg-gray-700/40 rounded-xl border border-gray-600/40 p-4 mb-5">
      <h3 className="text-base font-black text-white mb-3 flex items-center gap-2">
        <span>💾</span> セーブ
      </h3>
      <div className="flex gap-2 mb-3">
        {slotNames.map((name, idx) => {
          const info = saveSlots?.[idx];
          return (
            <button
              key={idx}
              onClick={() => setSelectedSaveSlot(idx)}
              className={`flex-1 p-2.5 rounded-xl text-left transition-all duration-150 ${
                selectedSaveSlot === idx
                  ? 'bg-blue-600 text-white ring-1 ring-blue-400 shadow-lg shadow-blue-900/40'
                  : 'bg-gray-600/60 text-gray-300 hover:bg-gray-500/60'
              }`}
            >
              <div className="font-bold text-sm">{name}</div>
              <div className="text-xs opacity-70 mt-0.5">
                {info ? `${info.year}年目 ${info.date?.month}/${info.date?.day}` : '空き'}
              </div>
            </button>
          );
        })}
      </div>
      <button
        onClick={handleSaveToSlot}
        className="w-full bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl font-bold text-base transition-all duration-150 hover:shadow-lg hover:shadow-blue-900/30"
      >
        {slotNames[selectedSaveSlot]}に保存
      </button>
      {saveStatus === 'saved' && (
        <div className="mt-2 text-green-400 text-center text-sm font-bold animate-pulse">✓ セーブしました</div>
      )}
    </div>
  );

  return (
    <div className="p-4">
      <style>{`
        @keyframes championGlow {
          0%, 100% { box-shadow: 0 0 20px rgba(234,179,8,0.3), 0 0 40px rgba(234,179,8,0.1); }
          50%       { box-shadow: 0 0 30px rgba(234,179,8,0.5), 0 0 60px rgba(234,179,8,0.2); }
        }
        @keyframes trophyBounce {
          0%, 100% { transform: translateY(0) scale(1); }
          50%       { transform: translateY(-6px) scale(1.08); }
        }
        .champion-card { animation: championGlow 2.5s ease-in-out infinite; }
        .trophy-icon   { animation: trophyBounce 2s ease-in-out infinite; }
      `}</style>

      <div className="max-w-3xl mx-auto">
        {/* ヘッダー */}
        <div className="mb-6">
          <p className="text-gray-400 text-sm font-semibold tracking-[0.15em] uppercase">Off Season</p>
          <h1 className="text-3xl font-black text-white">{seasonData.year}年目 シーズン終了</h1>
          {gameMode === 'sandbox' && (
            <span className="inline-block mt-1 bg-orange-500/20 text-orange-400 border border-orange-500/40 text-sm font-bold px-3 py-0.5 rounded-full">
              箱庭モード
            </span>
          )}
        </div>

        {/* 優勝チームカード */}
        {seasonSummary?.champion && (
          <div className="champion-card bg-gradient-to-r from-yellow-900/60 via-yellow-800/40 to-yellow-900/60 rounded-2xl border border-yellow-500/50 p-5 mb-5 text-center">
            <div className="trophy-icon text-5xl mb-2 inline-block">🏆</div>
            <p className="text-yellow-400/80 text-sm font-bold tracking-widest uppercase mb-1">Champion</p>
            <h2 className="text-3xl font-black text-white mb-1">{seasonSummary.champion.team}</h2>
            <p className="text-yellow-300 text-base font-semibold">
              {seasonSummary.champion.wins}勝 {seasonSummary.champion.losses}敗
              {seasonSummary.champion.draws > 0 ? ` ${seasonSummary.champion.draws}分` : ''}
              　勝率 {(seasonSummary.champion.winRate || 0).toFixed(3)}
            </p>
          </div>
        )}

        {/* 個人タイトルハイライト */}
        {seasonSummary && (seasonSummary.topBatter || seasonSummary.topHR || seasonSummary.topPitcher) && (
          <div className="grid grid-cols-3 gap-3 mb-5">
            {seasonSummary.topBatter && (
              <div className="bg-gray-800/80 rounded-xl border border-blue-500/30 p-3 text-center">
                <p className="text-blue-400 text-xs font-bold tracking-wide mb-1">🏏 首位打者</p>
                <p className="text-white font-black text-base leading-tight">{seasonSummary.topBatter.name}</p>
                <p className="text-blue-300 text-xl font-black mt-0.5">{seasonSummary.topBatter.avg}</p>
              </div>
            )}
            {seasonSummary.topHR && (
              <div className="bg-gray-800/80 rounded-xl border border-red-500/30 p-3 text-center">
                <p className="text-red-400 text-xs font-bold tracking-wide mb-1">💣 本塁打王</p>
                <p className="text-white font-black text-base leading-tight">{seasonSummary.topHR.name}</p>
                <p className="text-red-300 text-xl font-black mt-0.5">{seasonSummary.topHR.hr}本</p>
              </div>
            )}
            {seasonSummary.topPitcher && (
              <div className="bg-gray-800/80 rounded-xl border border-green-500/30 p-3 text-center">
                <p className="text-green-400 text-xs font-bold tracking-wide mb-1">⚾ 防御率王</p>
                <p className="text-white font-black text-base leading-tight">{seasonSummary.topPitcher.name}</p>
                <p className="text-green-300 text-xl font-black mt-0.5">ERA {seasonSummary.topPitcher.era}</p>
              </div>
            )}
          </div>
        )}

        {/* 順位表（コンパクト） */}
        {seasonSummary?.standings && seasonSummary.standings.length > 1 && (
          <div className="bg-gray-800/80 rounded-2xl border border-gray-700/50 p-4 mb-5">
            <h3 className="text-base font-black text-white mb-3">最終順位表</h3>
            <div className="space-y-1.5">
              {seasonSummary.standings.map((s, idx) => (
                <div
                  key={s.team}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                    idx === 0
                      ? 'bg-yellow-800/30 border border-yellow-600/30'
                      : 'bg-gray-700/40'
                  }`}
                >
                  <span className={`font-black text-base w-6 text-center ${
                    idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-gray-300' : idx === 2 ? 'text-orange-400' : 'text-gray-500'
                  }`}>{idx + 1}</span>
                  <span className={`font-bold text-base flex-1 ${idx === 0 ? 'text-yellow-200' : 'text-white'}`}>
                    {s.team}
                  </span>
                  <span className="text-gray-300 text-sm font-semibold tabular-nums">
                    {s.wins}勝{s.losses}敗{s.draws > 0 ? `${s.draws}分` : ''}
                  </span>
                  <span className="text-gray-400 text-sm tabular-nums w-12 text-right">
                    {(s.winRate || 0).toFixed(3)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 次シーズンへ進む手順 */}
        <div className="bg-gray-800/80 rounded-2xl border border-gray-700/50 p-5 mb-5">
          <h3 className="text-base font-black text-white mb-4">シーズン終了処理</h3>
          <div className="space-y-3">
            {[
              { icon: '🏅', label: '表彰（首位打者・本塁打王・防御率王など）' },
              ...(gameMode === 'sandbox' ? [
                { icon: '📊', label: 'シーズン成績を通算成績に加算' },
                { icon: '📅', label: `次年度（${seasonData.year + 1}年目）へ移行` },
              ] : [
                { icon: '🎂', label: '選手の年齢 +1 / 引退処理' },
                { icon: '📊', label: 'シーズン成績を通算成績に加算' },
                { icon: '📅', label: `次年度（${seasonData.year + 1}年目）へ移行` },
              ]),
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-gray-700 border border-gray-600 flex items-center justify-center text-xs font-black text-gray-300 shrink-0">
                  {i + 1}
                </div>
                <span className="text-sm">{step.icon}</span>
                <span className="text-gray-200 text-base">{step.label}</span>
              </div>
            ))}
            {gameMode === 'sandbox' && (
              <p className="text-orange-400/80 text-sm mt-2 pl-10">※ 箱庭モード: 加齢・成長・引退はありません</p>
            )}
          </div>
        </div>

        <SaveSlotSelector />

        <div className="text-center">
          <button
            onClick={handleAdvanceYear}
            disabled={processing}
            className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-gray-600 disabled:to-gray-600 text-white px-12 py-4 rounded-xl font-black text-xl transition-all duration-200 shadow-xl hover:shadow-green-900/40 hover:scale-105 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {processing ? (
              <span className="flex items-center gap-2">
                <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                処理中...
              </span>
            ) : (
              `${seasonData.year + 1}年目へ進む →`
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OffSeasonScreen;
