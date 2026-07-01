import React, { useState, useMemo } from 'react';
import { WORLD_DATA } from '../corporate/worldData.js';
import { TEAMS_DATA } from '../teams-data.js';

const RANK_COLOR = { S: 'text-yellow-400', A: 'text-orange-400', B: 'text-green-400', C: 'text-blue-400', D: 'text-gray-400' };
const RANK_BG = { S: 'bg-yellow-900/40 border-yellow-700/60', A: 'bg-orange-900/30 border-orange-700/50', B: 'bg-green-900/30 border-green-700/50', C: 'bg-blue-900/20 border-blue-700/40', D: 'bg-gray-900/20 border-gray-700/30' };
const TYPE_LABEL = { corporate: '社会人', worldUniversity: '大学', university: '大学', independent: '独立' };
const RANK_BAND_PCT = { S: '上位5%', A: '6-20%', B: '21-45%', C: '46-75%', D: '下位25%' };

const TeamRankingScreen = ({ userTeamName, gameMode, onBack }) => {
  const [filterType, setFilterType] = useState('all');
  const [filterRank, setFilterRank] = useState('all');
  const [searchText, setSearchText] = useState('');

  const ranking = WORLD_DATA._teamRanking || [];

  // Determine type for TEAMS_DATA entries (independent check)
  const enriched = useMemo(() => {
    return ranking.map(entry => {
      let type = entry.type;
      if (type === 'corporate') {
        const td = TEAMS_DATA[entry.name];
        if (td?.independentLeagueId) type = 'independent';
      }
      return { ...entry, displayType: type };
    });
  }, [ranking]);

  const filtered = useMemo(() => {
    return enriched.filter(e => {
      if (filterType !== 'all') {
        if (filterType === 'university') {
          if (e.displayType !== 'university' && e.displayType !== 'worldUniversity') return false;
        } else if (e.displayType !== filterType) return false;
      }
      if (filterRank !== 'all' && e.rank !== filterRank) return false;
      if (searchText && !e.name.includes(searchText)) return false;
      return true;
    });
  }, [enriched, filterType, filterRank, searchText]);

  const userEntry = enriched.find(e => e.name === userTeamName);

  if (ranking.length === 0) {
    return (
      <div className="p-6 text-white">
        <div className="flex items-center gap-3 mb-6">
          {onBack && <button onClick={onBack} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">← 戻る</button>}
          <h2 className="text-xl font-bold">チームランキング</h2>
        </div>
        <div className="text-gray-400 text-center py-16">
          <div className="text-5xl mb-4">📊</div>
          <p className="text-lg mb-2">ランキングデータがまだありません</p>
          <p className="text-sm text-gray-500">オフシーズン終了後にランキングが確定します</p>
        </div>
      </div>
    );
  }

  const totalTeams = enriched.length;
  const rankCounts = { S: 0, A: 0, B: 0, C: 0, D: 0 };
  enriched.forEach(e => { if (rankCounts[e.rank] !== undefined) rankCounts[e.rank]++; });

  return (
    <div className="p-4 text-white">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        {onBack && <button onClick={onBack} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">← 戻る</button>}
        <h2 className="text-xl font-bold">チームランキング</h2>
        <span className="text-gray-400 text-sm ml-auto">全 {totalTeams} チーム</span>
      </div>

      {/* User team highlight */}
      {userEntry && (
        <div className={`mb-4 p-3 rounded-lg border-2 border-yellow-500/60 bg-yellow-900/20`}>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-yellow-400 font-bold text-sm">あなたのチーム</div>
            <div className="font-bold">{userEntry.name}</div>
            <div className={`font-bold text-lg ${RANK_COLOR[userEntry.rank]}`}>{userEntry.rank}ランク</div>
            <div className="text-gray-300 text-sm">#{userEntry.position} / {totalTeams}</div>
            <div className="ml-auto text-sm">
              <span className="text-gray-400">Eloスコア </span>
              <span className="text-white font-mono font-bold">{userEntry.score}</span>
            </div>
            <div className="text-sm text-gray-400">注目度 {userEntry.reputation}</div>
          </div>
        </div>
      )}

      {/* Rank band summary */}
      <div className="flex gap-2 mb-4">
        {['S', 'A', 'B', 'C', 'D'].map(r => (
          <div key={r} className={`flex-1 text-center p-2 rounded border ${RANK_BG[r]}`}>
            <div className={`font-bold ${RANK_COLOR[r]}`}>{r}</div>
            <div className="text-xs text-gray-300">{rankCounts[r]}チーム</div>
            <div className="text-[10px] text-gray-500">{RANK_BAND_PCT[r]}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="flex gap-1">
          {[['all', '全て'], ['corporate', '社会人'], ['university', '大学'], ['independent', '独立']].map(([v, label]) => (
            <button key={v} onClick={() => setFilterType(v)}
              className={`px-2 py-1 rounded text-xs font-medium ${filterType === v ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {['all', 'S', 'A', 'B', 'C', 'D'].map(r => (
            <button key={r} onClick={() => setFilterRank(r)}
              className={`px-2 py-1 rounded text-xs font-medium ${filterRank === r ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
              {r === 'all' ? '全ランク' : r}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="チーム名検索..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          className="px-2 py-1 rounded text-xs bg-gray-800 border border-gray-600 text-white placeholder-gray-500 w-32"
        />
        <span className="text-xs text-gray-400 self-center">{filtered.length}件表示</span>
      </div>

      {/* Ranking table */}
      <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 340px)' }}>
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-gray-900 z-10">
            <tr className="text-gray-400 border-b border-gray-700">
              <th className="text-right pr-2 py-2 w-12">順位</th>
              <th className="text-left py-2 pl-1">チーム名</th>
              <th className="text-center py-2 w-14">ランク</th>
              <th className="text-center py-2 w-20">Eloスコア</th>
              <th className="text-center py-2 w-14">注目度</th>
              <th className="text-center py-2 w-14">種別</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(entry => {
              const isUser = entry.name === userTeamName;
              return (
                <tr key={entry.name}
                  className={`border-b border-gray-800/50 ${isUser ? 'bg-yellow-900/20' : 'hover:bg-gray-800/30'}`}>
                  <td className={`text-right pr-2 py-1.5 font-mono ${entry.position <= 10 ? 'text-yellow-400 font-bold' : 'text-gray-400'}`}>
                    #{entry.position}
                  </td>
                  <td className={`pl-1 py-1.5 ${isUser ? 'font-bold text-yellow-300' : 'text-white'}`}>
                    {entry.name}
                    {isUser && <span className="ml-1 text-yellow-500 text-xs">★</span>}
                  </td>
                  <td className="text-center py-1.5">
                    <span className={`font-bold text-sm ${RANK_COLOR[entry.rank]}`}>{entry.rank}</span>
                  </td>
                  <td className="text-center py-1.5 text-gray-200 font-mono font-bold">{entry.score}</td>
                  <td className="text-center py-1.5">
                    <div className="flex items-center justify-center gap-1">
                      <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${entry.reputation}%` }} />
                      </div>
                      <span className="text-gray-400 text-xs w-6 text-right">{entry.reputation}</span>
                    </div>
                  </td>
                  <td className="text-center py-1.5 text-gray-500 text-xs">{TYPE_LABEL[entry.displayType] || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Score explanation */}
      <div className="mt-3 p-2 bg-gray-900/50 rounded text-xs text-gray-500">
        <span className="font-bold text-gray-400">FIFAランキング方式Elo：</span> ΔP = I×(W−We) / We = 1/(10^(−Δスコア/400)+1)。
        重要度I: レギュラーシーズン=50 / リーグ=40 / 全国大会1回戦=40・決勝=60。
        初期値: S=1200 / A=1050 / B=900 / C=750 / D=600。上位5%=S / 6-20%=A / 21-45%=B / 46-75%=C / 下位25%=D
      </div>
    </div>
  );
};

export default TeamRankingScreen;
