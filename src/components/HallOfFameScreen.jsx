import React, { useState, useMemo } from 'react';
import { getPitchTypeName } from '../season/yearProgressionSystem.js';
import { exportDraftedPlayers } from '../game/saveSystem.js';
import { POSITION_NAMES } from '../utils/constants.js';
import PlayerDetailModal from './PlayerDetailModal.jsx';

const NPB_TEAMS_CE = [
  { name: '読売ジャイアンツ', short: '読売', color: '#FF6600', flag: 'giants' },
  { name: '阪神タイガース', short: '阪神', color: '#FFD700', flag: 'tigers' },
  { name: '横浜DeNAベイスターズ', short: '横浜DeNA', color: '#003DA5', flag: 'baystars' },
  { name: '広島東洋カープ', short: '広島東洋', color: '#CC0000', flag: 'carp' },
  { name: '中日ドラゴンズ', short: '中日', color: '#003DA5', flag: 'dragons' },
  { name: 'ヤクルトスワローズ', short: '東京ヤクルト', color: '#006633', flag: 'swallows' },
];
const NPB_TEAMS_PA = [
  { name: 'ソフトバンクホークス', short: '福岡ソフトバンク', color: '#DAA520', flag: 'hawks' },
  { name: 'オリックス・バファローズ', short: 'オリックス', color: '#002D62', flag: 'buffaloes' },
  { name: '西武ライオンズ', short: '埼玉西武', color: '#003366', flag: 'lions' },
  { name: '楽天ゴールデンイーグルス', short: '東北楽天', color: '#8B0000', flag: 'eagles' },
  { name: '千葉ロッテマリーンズ', short: '千葉ロッテ', color: '#808080', flag: 'marines' },
  { name: '日本ハムファイターズ', short: '北海道日本ハム', color: '#004080', flag: 'fighters' },
];
const NPB_TEAMS_GRID = [
  NPB_TEAMS_CE[0], NPB_TEAMS_CE[1], NPB_TEAMS_PA[0], NPB_TEAMS_PA[1],
  NPB_TEAMS_CE[2], NPB_TEAMS_CE[3], NPB_TEAMS_PA[2], NPB_TEAMS_PA[3],
  NPB_TEAMS_CE[4], NPB_TEAMS_CE[5], NPB_TEAMS_PA[4], NPB_TEAMS_PA[5],
];

const ROUND_ORDER = ['ドラフト1位', 'ドラフト2位', 'ドラフト3位', 'ドラフト4位', 'ドラフト5位', 'ドラフト6位', '育成指名'];

const SOURCE_LABELS = {
  highschool: { label: '高校', color: 'text-green-400 bg-green-900/40 border-green-600/40' },
  university: { label: '大学', color: 'text-blue-400 bg-blue-900/40 border-blue-600/40' },
  corporate:  { label: '社人', color: 'text-orange-400 bg-orange-900/40 border-orange-600/40' },
  independent: { label: '独立', color: 'text-purple-400 bg-purple-900/40 border-purple-600/40' },
};

const FULL_POSITION_NAMES = {
  pitcher: '投手', catcher: '捕手', first: '一塁手', second: '二塁手',
  third: '三塁手', short: '遊撃手', left: '左翼手', center: '中堅手', right: '右翼手',
};

const HallOfFameScreen = ({ hallOfFamePlayers = [], allTeams = {}, teamHistory = [], seasonData, onClose }) => {
  const [activeTab, setActiveTab] = useState('npbdraft');
  const [statCategory, setStatCategory] = useState('avg');
  const [expandedPlayer, setExpandedPlayer] = useState(null);
  const [modalPlayer, setModalPlayer] = useState(null);

  const openModal = (entry) => {
    const normalized = {
      ...entry,
      physical: { ...(entry.physical || {}), throws: entry.throws || entry.physical?.throws || 'right' },
      batting: { ...(entry.batting || {}), bats: entry.bats || entry.batting?.bats || 'right' },
    };
    setModalPlayer(normalized);
  };
  const [selectedTeamForHistory, setSelectedTeamForHistory] = useState(null);
  const [expandedYear, setExpandedYear] = useState(null);
  const [draftHistoryYear, setDraftHistoryYear] = useState(null);
  const [npbDraftYear, setNpbDraftYear] = useState(null);
  const [selectedDraftIndexes, setSelectedDraftIndexes] = useState(() => new Set());

  const toggleDraftSelection = (idx) => {
    setSelectedDraftIndexes(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const getPositionName = (pos) => POSITION_NAMES[pos] || pos;
  const isCorporate = !!seasonData?.settings?.corporateMode;

  // NPBドラフト指名選手（年度別）
  const npbDraftedPlayers = useMemo(() =>
    hallOfFamePlayers.filter(p =>
      p.departureType === 'npb_drafted' || (p.reason && p.reason.includes('NPBドラフト'))
    ).sort((a, b) => (b.year || 0) - (a.year || 0)),
    [hallOfFamePlayers]
  );

  const npbDraftYears = useMemo(() => {
    const years = new Set();
    npbDraftedPlayers.forEach(p => { if (p.year) years.add(p.year); });
    return [...years].sort((a, b) => b - a);
  }, [npbDraftedPlayers]);

  // 選択年のドラフトデータを球団別に整理
  const npbDraftGridData = useMemo(() => {
    if (!npbDraftYear) return null;
    const yearPlayers = npbDraftedPlayers.filter(p => p.year === npbDraftYear);
    const byTeam = {};
    NPB_TEAMS_GRID.forEach(t => { byTeam[t.name] = []; });
    yearPlayers.forEach(p => {
      if (byTeam[p.npbTeam]) byTeam[p.npbTeam].push(p);
    });
    Object.values(byTeam).forEach(list => {
      const ro = {};
      ROUND_ORDER.forEach((r, i) => { ro[r] = i; });
      list.sort((a, b) => (ro[a.draftRound] ?? 99) - (ro[b.draftRound] ?? 99));
    });
    return { byTeam, total: yearPlayers.length, yearPlayers };
  }, [npbDraftYear, npbDraftedPlayers]);

  // 自動的に最新年を選択
  React.useEffect(() => {
    if (npbDraftYears.length > 0 && !npbDraftYear) {
      setNpbDraftYear(npbDraftYears[0]);
    }
  }, [npbDraftYears, npbDraftYear]);

  // 入団記録用
  const draftedPlayers = useMemo(() =>
    hallOfFamePlayers.filter(p =>
      p.departureType === 'npb_drafted' || (p.reason && p.reason.includes('NPBドラフト'))
    ).sort((a, b) => (b.year || 0) - (a.year || 0)),
    [hallOfFamePlayers]
  );

  const allPlayersForStats = useMemo(() => {
    const players = [];
    hallOfFamePlayers.forEach(p => {
      if (p.careerStats) {
        players.push({
          name: p.name, position: p.position,
          teamName: p.teamName || p.team, careerStats: p.careerStats,
          status: p.departureType === 'npb_drafted' ? 'NPB' : '引退',
          age: p.age, yearsPlayed: p.yearsPlayed
        });
      }
    });
    const seenIds = new Set();
    Object.entries(allTeams).forEach(([teamName, team]) => {
      if (!team?.players) return;
      team.players.forEach(p => {
        if (p.id != null && seenIds.has(p.id)) return;
        if (p.id != null) seenIds.add(p.id);
        if (p.careerStats) {
          const sb = p.seasonStats?.batting || {};
          const sp = p.seasonStats?.pitching || {};
          const cb = p.careerStats.batting || {};
          const cpitch = p.careerStats.pitching || {};
          const combinedBatting = {};
          const combinedPitching = {};
          Object.keys(cb).forEach(k => { combinedBatting[k] = (cb[k] || 0) + (sb[k] || 0); });
          Object.keys(cpitch).forEach(k => { combinedPitching[k] = (cpitch[k] || 0) + (sp[k] || 0); });
          players.push({
            name: p.name, position: p.position, teamName,
            careerStats: { batting: combinedBatting, pitching: combinedPitching }, status: '現役',
            age: p.age, yearsPlayed: p.yearsPlayed
          });
        }
      });
    });
    return players;
  }, [hallOfFamePlayers, allTeams]);

  const draftHistoryByYear = useMemo(() => {
    const records = [];
    Object.entries(allTeams).forEach(([teamName, team]) => {
      if (!team?.players) return;
      team.players.forEach(p => {
        if (p.draftInfo) {
          records.push({
            name: p.name, position: p.position, teamName,
            draftYear: p.draftInfo.year, draftRound: p.draftInfo.round,
            draftAge: p.draftInfo.age || p.age,
            source: p.draftInfo.source || '',
            isPitcher: p.position === 'pitcher',
          });
        }
      });
    });
    hallOfFamePlayers.forEach(p => {
      if (p.draftInfo) {
        records.push({
          name: p.name, position: p.position, teamName: p.teamName || p.team,
          draftYear: p.draftInfo.year, draftRound: p.draftInfo.round,
          draftAge: p.draftInfo.age || p.age,
          source: p.draftInfo.source || '',
          isPitcher: p.position === 'pitcher',
        });
      }
    });
    const grouped = {};
    records.forEach(r => {
      if (!grouped[r.draftYear]) grouped[r.draftYear] = [];
      grouped[r.draftYear].push(r);
    });
    Object.values(grouped).forEach(list => list.sort((a, b) => a.draftRound - b.draftRound));
    return grouped;
  }, [allTeams, hallOfFamePlayers]);

  const draftYears = useMemo(() =>
    Object.keys(draftHistoryByYear).map(Number).sort((a, b) => a - b),
    [draftHistoryByYear]
  );

  const battingCategories = [
    { key: 'avg', label: '打率', getValue: (s) => { const ab = s.batting?.atBats || 0; return ab >= 30 ? (s.batting?.hits || 0) / ab : 0; }, format: (v) => v > 0 ? v.toFixed(3) : '.000', minAB: 30 },
    { key: 'hits', label: '安打', getValue: (s) => s.batting?.hits || 0, format: (v) => v },
    { key: 'homeruns', label: 'HR', getValue: (s) => s.batting?.homeruns || 0, format: (v) => v },
    { key: 'rbis', label: '打点', getValue: (s) => s.batting?.rbis || 0, format: (v) => v },
    { key: 'stolenBases', label: '盗塁', getValue: (s) => s.batting?.stolenBases || 0, format: (v) => v },
    { key: 'atBats', label: '打数', getValue: (s) => s.batting?.atBats || 0, format: (v) => v },
  ];

  const pitchingCategories = [
    { key: 'era', label: '防御率', getValue: (s) => { const ip = s.pitching?.inningsPitched || 0; return ip >= 10 ? ((s.pitching?.earnedRuns || 0) / ip) * 9 : 999; }, format: (v) => v < 999 ? v.toFixed(2) : '-', ascending: true, minIP: 10 },
    { key: 'wins', label: '勝利', getValue: (s) => s.pitching?.wins || 0, format: (v) => v },
    { key: 'saves', label: 'S', getValue: (s) => s.pitching?.saves || 0, format: (v) => v },
    { key: 'strikeouts', label: '奪三振', getValue: (s) => s.pitching?.strikeouts || 0, format: (v) => v },
    { key: 'inningsPitched', label: '投球回', getValue: (s) => s.pitching?.inningsPitched || 0, format: (v) => v.toFixed(1) },
  ];

  const allCategories = [...battingCategories, ...pitchingCategories];
  const currentCategory = allCategories.find(c => c.key === statCategory) || battingCategories[0];

  const rankings = useMemo(() => {
    const cat = currentCategory;
    let eligible = allPlayersForStats.filter(p => {
      const val = cat.getValue(p.careerStats);
      if (cat.minAB && (p.careerStats.batting?.atBats || 0) < cat.minAB) return false;
      if (cat.minIP && (p.careerStats.pitching?.inningsPitched || 0) < cat.minIP) return false;
      if (cat.ascending) return val < 999;
      return val > 0;
    });
    eligible.sort((a, b) => {
      const va = cat.getValue(a.careerStats);
      const vb = cat.getValue(b.careerStats);
      return cat.ascending ? va - vb : vb - va;
    });
    return eligible.slice(0, 50);
  }, [allPlayersForStats, statCategory, currentCategory]);

  const statusColor = (status) => {
    if (status === '現役') return 'text-green-400';
    if (status === 'NPB') return 'text-yellow-400';
    return 'text-gray-500';
  };

  const teamNames = useMemo(() => {
    const names = new Set();
    teamHistory.forEach(entry => {
      entry.standings?.forEach(s => names.add(s.team));
    });
    Object.keys(allTeams).forEach(t => names.add(t));
    return [...names];
  }, [teamHistory, allTeams]);

  const selectedTeamHistory = useMemo(() => {
    if (!selectedTeamForHistory) return [];
    return teamHistory
      .map(entry => {
        const record = entry.standings?.find(s => s.team === selectedTeamForHistory);
        if (!record) return null;
        return { year: entry.year, ...record };
      })
      .filter(Boolean)
      .sort((a, b) => b.year - a.year);
  }, [selectedTeamForHistory, teamHistory]);

  const yearSummaries = useMemo(() => {
    return [...teamHistory].sort((a, b) => b.year - a.year);
  }, [teamHistory]);

  return (
    <div className="p-4 bg-gray-900 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* ヘッダー + タブ */}
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h1 className="text-xl font-bold text-yellow-400">資料室</h1>
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => setActiveTab('npbdraft')}
              className={`px-3 py-1.5 rounded-md text-sm font-bold transition ${
                activeTab === 'npbdraft'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              NPBドラフト
            </button>
            <button
              onClick={() => setActiveTab('roster')}
              className={`px-3 py-1.5 rounded-md text-sm font-bold transition ${
                activeTab === 'roster'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              入団記録
            </button>
            <button
              onClick={() => setActiveTab('stats')}
              className={`px-3 py-1.5 rounded-md text-sm font-bold transition ${
                activeTab === 'stats'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              通算成績
            </button>
            <button
              onClick={() => setActiveTab('teamhistory')}
              className={`px-3 py-1.5 rounded-md text-sm font-bold transition ${
                activeTab === 'teamhistory'
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              チーム成績
            </button>
            {seasonData?.settings?.corporateMode && (
              <button
                onClick={() => setActiveTab('tournaments')}
                className={`px-3 py-1.5 rounded-md text-sm font-bold transition ${
                  activeTab === 'tournaments'
                    ? 'bg-yellow-600 text-white shadow-sm'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                大会記録
              </button>
            )}
          </div>
        </div>

        {/* NPBドラフトタブ（3×4グリッド年度別表示） */}
        {activeTab === 'npbdraft' && (
          <div>
            {npbDraftYears.length === 0 ? (
              <div className="bg-gray-800 rounded-lg p-6 text-center">
                <p className="text-gray-400">まだNPBドラフト記録がありません</p>
                <p className="text-gray-500 text-sm mt-1">10月のNPBドラフト会議で指名された選手がここに記録されます</p>
              </div>
            ) : (
              <>
                {/* 年度選択 */}
                <div className="flex gap-1.5 mb-3 flex-wrap">
                  {npbDraftYears.map(year => (
                    <button key={year}
                      onClick={() => setNpbDraftYear(year)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-bold transition ${
                        npbDraftYear === year
                          ? 'bg-red-600 text-white shadow-md'
                          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                    >
                      {year}年目
                    </button>
                  ))}
                </div>

                {npbDraftGridData && (
                  <div>
                    {/* サマリー */}
                    <div className="bg-gray-800 rounded-lg p-3 mb-3 flex items-center gap-4 flex-wrap">
                      <span className="text-white font-bold">{npbDraftYear}年目 NPBドラフト会議</span>
                      <span className="text-gray-400 text-sm">指名 {npbDraftGridData.total}名</span>
                      {(() => {
                        const src = { highschool: 0, university: 0, corporate: 0, independent: 0 };
                        npbDraftGridData.yearPlayers.forEach(p => {
                          if (p.source && src[p.source] !== undefined) src[p.source]++;
                        });
                        const labels = [['highschool', '高校'], ['university', '大学'], ['corporate', '社会人'], ['independent', '独立']];
                        return labels.filter(([k]) => src[k] > 0).map(([k, label]) => (
                          <span key={k} className={`text-xs px-2 py-0.5 rounded border ${SOURCE_LABELS[k].color}`}>
                            {label} {src[k]}名
                          </span>
                        ));
                      })()}
                    </div>

                    {/* 球団別グリッド */}
                    <div className="grid grid-cols-4 gap-2">
                      {NPB_TEAMS_GRID.map(team => {
                        const picks = npbDraftGridData.byTeam[team.name] || [];
                        return (
                          <div key={team.name} className="rounded-lg overflow-hidden">
                            <div
                              className="px-2.5 py-1.5 flex items-center gap-1.5 border-b border-gray-700/50"
                              style={{
                                background: `linear-gradient(135deg, ${team.color}33 0%, #1a1a2e 100%)`,
                                borderTop: `3px solid ${team.color}`,
                              }}
                            >
                              <img src={`/flag/${team.flag}.png`} alt="" className="shrink-0 object-contain" style={{ height: '18px', width: '27px' }} />
                              <span className="text-white font-bold text-xs">{team.short}</span>
                              <span className="text-gray-500 text-[10px] ml-auto">{picks.length}名</span>
                            </div>
                            <div className="bg-gray-800/90 p-2" style={{ minHeight: '60px' }}>
                              {picks.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-gray-500 text-sm min-h-[40px]">
                                  指名なし
                                </div>
                              ) : (
                                <table className="w-full text-[11px]">
                                  <tbody>
                                  {picks.map((entry, pi) => {
                                    const srcInfo = SOURCE_LABELS[entry.source];
                                    const rd = entry.draftRound || '';
                                    const isIkusei = rd.includes('育成');
                                    let roundLabel;
                                    if (isIkusei) {
                                      const num = rd.match(/(\d+)/);
                                      roundLabel = num ? `育${num[1]}` : '育成';
                                    } else {
                                      roundLabel = rd.replace('ドラフト', '');
                                    }
                                    const throwHand = entry.throws === 'left' ? '左' : '右';
                                    const batHand = entry.bats === 'left' ? '左' : entry.bats === 'switch' ? '両' : '右';
                                    return (
                                      <tr key={pi} className={pi > 0 ? 'border-t border-gray-700/30' : ''}>
                                        <td className="py-1 pr-1" style={{ width: '34px' }}>
                                          <span className={`text-[10px] font-bold px-1 py-0.5 rounded block text-center whitespace-nowrap ${
                                            rd === 'ドラフト1位' ? 'bg-red-600/70 text-red-100' :
                                            isIkusei ? 'bg-green-700/70 text-green-200' :
                                            'bg-yellow-700/70 text-yellow-200'
                                          }`}>{roundLabel}</span>
                                        </td>
                                        <td className="py-1 pl-1 text-white font-bold text-xs whitespace-nowrap cursor-pointer hover:text-yellow-300 transition" style={{ minWidth: '7em' }} onClick={() => openModal(entry)}>{entry.name}</td>
                                        <td className="py-1 whitespace-nowrap pl-1">
                                          <span className="text-blue-300">{getPositionName(entry.position)}</span>
                                          <span className="inline-block w-2" />
                                          <span className={entry.throws === 'left' ? 'text-green-400' : 'text-white'}>{throwHand}</span>
                                          <span className={entry.bats === 'left' ? 'text-green-400' : entry.bats === 'switch' ? 'text-purple-400' : 'text-white'}>{batHand}</span>
                                          <span className="inline-block w-2" />
                                          <span className="text-white">{entry.age}歳</span>
                                          <span className="text-gray-400 ml-3">{entry.teamName}</span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* 詳細テーブル（折りたたみ） */}
                    <details className="mt-4">
                      <summary className="cursor-pointer text-sm text-gray-400 hover:text-gray-200 transition bg-gray-800 rounded-lg px-4 py-2">
                        指名選手一覧（詳細テーブル） — {npbDraftGridData.total}名
                      </summary>
                      <div className="bg-gray-800 rounded-b-lg overflow-hidden mt-px">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-gray-700/80 text-gray-400 text-xs">
                              <th className="py-1.5 px-2 text-left">順位</th>
                              <th className="py-1.5 px-2 text-left">選手名</th>
                              <th className="py-1.5 px-1 text-center">守</th>
                              <th className="py-1.5 px-1 text-center">投/打</th>
                              <th className="py-1.5 px-1 text-center">齢</th>
                              <th className="py-1.5 px-2 text-left">所属</th>
                              <th className="py-1.5 px-2 text-left">指名球団</th>
                              <th className="py-1.5 px-2 text-right">成績</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...npbDraftGridData.yearPlayers]
                              .sort((a, b) => {
                                const ro = { 'ドラフト1位': 0, 'ドラフト2位': 1, 'ドラフト3位': 2, 'ドラフト4位': 3, 'ドラフト5位': 4, 'ドラフト6位': 5, '育成指名': 6 };
                                return (ro[a.draftRound] ?? 7) - (ro[b.draftRound] ?? 7);
                              })
                              .map((player, idx) => {
                                const isP = player.position === 'pitcher';
                                const stats = player.careerStats || { batting: {}, pitching: {} };
                                let mainStat = '';
                                if (isP) {
                                  mainStat = `${stats.pitching?.wins || 0}勝 ${stats.pitching?.saves || 0}S ${stats.pitching?.strikeouts || 0}K`;
                                } else {
                                  const ab = stats.batting?.atBats || 0;
                                  const avg = ab > 0 ? (stats.batting.hits / ab).toFixed(3) : '.000';
                                  mainStat = `${avg} ${stats.batting?.homeruns || 0}HR ${stats.batting?.hits || 0}安`;
                                }
                                const srcInfo = SOURCE_LABELS[player.source];
                                return (
                                  <tr key={idx} className={`border-b border-gray-700/50 hover:bg-gray-700/30 cursor-pointer ${player.hallOfFame ? 'bg-yellow-900/20' : ''}`} onClick={() => openModal(player)}>
                                    <td className="py-1.5 px-2">
                                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                        player.draftRound === 'ドラフト1位' ? 'bg-red-600/60 text-red-200' :
                                        player.draftRound === 'ドラフト2位' ? 'bg-orange-600/60 text-orange-200' :
                                        player.draftRound === '育成指名' ? 'bg-gray-600/60 text-gray-300' :
                                        'bg-yellow-700/60 text-yellow-200'
                                      }`}>{player.draftRound}</span>
                                    </td>
                                    <td className="py-1.5 px-2">
                                      <span className={`font-bold ${isP ? 'text-red-400' : 'text-blue-300'}`}>
                                        {player.hallOfFame && '🏛️ '}{player.name}
                                      </span>
                                      {srcInfo && (
                                        <span className={`ml-1 text-[9px] font-bold px-1 py-0.5 rounded border ${srcInfo.color}`}>
                                          {srcInfo.label}
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-1.5 px-1 text-center text-gray-500">{getPositionName(player.position)}</td>
                                    <td className="py-1.5 px-1 text-center text-[10px]">
                                      <span className={player.throws === 'left' ? 'text-green-400' : 'text-gray-500'}>
                                        {player.throws === 'left' ? '左' : '右'}
                                      </span>
                                      <span className="text-gray-500">/</span>
                                      <span className={player.bats === 'left' ? 'text-green-400' : player.bats === 'switch' ? 'text-purple-400' : 'text-gray-500'}>
                                        {player.bats === 'left' ? '左' : player.bats === 'switch' ? '両' : '右'}
                                      </span>
                                    </td>
                                    <td className="py-1.5 px-1 text-center text-gray-500">{player.age}</td>
                                    <td className="py-1.5 px-2 text-gray-400 text-[10px]">{player.teamName}</td>
                                    <td className="py-1.5 px-2 text-yellow-400 font-bold text-[10px]">{player.npbTeam}</td>
                                    <td className="py-1.5 px-2 text-right text-gray-300 font-mono text-[10px]">{mainStat}</td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    </details>

                    {/* エクスポートボタン */}
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => exportDraftedPlayers(npbDraftGridData.yearPlayers)}
                        className="bg-orange-700 hover:bg-orange-800 text-white px-3 py-1.5 rounded text-xs font-bold transition shadow-sm"
                      >
                        📥 {npbDraftYear}年目のドラフトをエクスポート
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* 入団記録タブ（球団別グリッド表示） */}
        {activeTab === 'roster' && (
          <div>
            {draftYears.length === 0 ? (
              <div className="bg-gray-800 rounded-lg p-6 text-center">
                <p className="text-gray-400">まだ入団記録がありません</p>
                <p className="text-gray-500 text-sm mt-1">トライアウトで指名した選手の記録がここに表示されます</p>
              </div>
            ) : (
              <div>
                <div className="flex gap-1 mb-3 flex-wrap">
                  {draftYears.map(year => (
                    <button key={year}
                      onClick={() => setDraftHistoryYear(draftHistoryYear === year ? null : year)}
                      className={`px-3 py-1 rounded text-xs font-bold transition ${
                        draftHistoryYear === year
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                    >
                      {year}年目
                    </button>
                  ))}
                </div>
                {draftHistoryYear && draftHistoryByYear[draftHistoryYear] && (() => {
                  const yearRecords = draftHistoryByYear[draftHistoryYear];
                  const teamMap = {};
                  yearRecords.forEach(r => {
                    if (!teamMap[r.teamName]) teamMap[r.teamName] = [];
                    teamMap[r.teamName].push(r);
                  });
                  Object.values(teamMap).forEach(list => list.sort((a, b) => a.draftRound - b.draftRound));
                  const teamNames = Object.keys(teamMap).sort();
                  return (
                    <div>
                      <div className="bg-gray-800 rounded-lg p-3 mb-3 flex items-center gap-4 flex-wrap">
                        <span className="text-white font-bold">{draftHistoryYear}年目 入団</span>
                        <span className="text-gray-400 text-sm">{yearRecords.length}名 / {teamNames.length}チーム</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {teamNames.map(tn => {
                          const picks = teamMap[tn];
                          return (
                            <div key={tn} className="rounded-lg overflow-hidden bg-gray-800">
                              <div className="px-2.5 py-1.5 bg-purple-900/40 border-b border-purple-700/30 flex items-center justify-between">
                                <span className="text-white font-bold text-xs truncate">{tn}</span>
                                <span className="text-purple-400 text-[10px] font-bold">{picks.length}名</span>
                              </div>
                              <div className="p-2 space-y-1.5">
                                {picks.map((p, pi) => (
                                  <div key={pi} className={pi > 0 ? 'pt-1.5 border-t border-gray-700/40' : ''}>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-purple-400 text-[10px] font-bold w-4 text-right">{p.draftRound}</span>
                                      <span className={`font-bold text-sm ${p.isPitcher ? 'text-red-400' : 'text-blue-300'}`}>{p.name}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 ml-5 mt-0.5">
                                      <span className="text-blue-400 text-[10px]">{getPositionName(p.position)}</span>
                                      <span className="text-gray-500 text-[10px]">{p.draftAge}歳</span>
                                      {isCorporate && p.source && (
                                        <span className="text-cyan-400 text-[9px]">{p.source}</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                {!draftHistoryYear && (
                  <div className="bg-gray-800 rounded-lg p-6 text-center">
                    <p className="text-gray-500 text-sm">年度を選択してください</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 通算成績ランキングタブ */}
        {activeTab === 'stats' && (
          <div>
            <div className="bg-gray-800 rounded-lg p-2 mb-2">
              <div className="flex items-center gap-1 mb-1">
                <span className="text-gray-500 text-[10px] mr-1 w-8">打撃</span>
                {battingCategories.map(cat => (
                  <button
                    key={cat.key}
                    onClick={() => setStatCategory(cat.key)}
                    className={`px-2 py-0.5 text-[11px] rounded transition ${
                      statCategory === cat.key
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-400'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-gray-500 text-[10px] mr-1 w-8">投手</span>
                {pitchingCategories.map(cat => (
                  <button
                    key={cat.key}
                    onClick={() => setStatCategory(cat.key)}
                    className={`px-2 py-0.5 text-[11px] rounded transition ${
                      statCategory === cat.key
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-400'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {rankings.length === 0 ? (
              <div className="bg-gray-800 rounded-lg p-6 text-center">
                <p className="text-gray-500">データがありません</p>
              </div>
            ) : (
              <div className="bg-gray-800 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-700/80 text-gray-400 text-xs">
                      <th className="py-1.5 px-2 text-center w-8">#</th>
                      <th className="py-1.5 px-2 text-left">選手名</th>
                      <th className="py-1.5 px-1 text-center">位</th>
                      <th className="py-1.5 px-2 text-left">チーム</th>
                      <th className="py-1.5 px-1 text-center">状態</th>
                      <th className="py-1.5 px-2 text-right font-bold">{currentCategory.label}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankings.map((player, idx) => {
                      const val = currentCategory.getValue(player.careerStats);
                      const isP = player.position === 'pitcher';
                      return (
                        <tr key={idx} className="border-b border-gray-700/50 hover:bg-gray-700/30 cursor-pointer" onClick={() => openModal(player)}>
                          <td className="py-1.5 px-2 text-center">
                            <span className={`font-bold ${idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-gray-300' : idx === 2 ? 'text-orange-400' : 'text-gray-500'}`}>
                              {idx + 1}
                            </span>
                          </td>
                          <td className="py-1.5 px-2">
                            <span className={`font-bold ${isP ? 'text-red-400' : 'text-blue-300'}`}>{player.name}</span>
                          </td>
                          <td className="py-1.5 px-1 text-center text-gray-500">{getPositionName(player.position)}</td>
                          <td className="py-1.5 px-2 text-gray-400">{player.teamName}</td>
                          <td className={`py-1.5 px-1 text-center text-[10px] font-bold ${statusColor(player.status)}`}>
                            {player.status}
                          </td>
                          <td className="py-1.5 px-2 text-right font-bold text-white text-sm">
                            {currentCategory.format(val)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* チーム成績タブ */}
        {activeTab === 'teamhistory' && (
          <div>
            {teamHistory.length === 0 ? (
              <div className="bg-gray-800 rounded-lg p-6 text-center">
                <p className="text-gray-400">まだチーム成績データがありません</p>
                <p className="text-gray-500 text-sm mt-1">シーズン終了後にチーム成績が記録されます</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-2">チームを選択して年度別成績を表示</div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => { setSelectedTeamForHistory(null); setExpandedYear(null); }}
                      className={`px-3 py-1.5 rounded-md text-sm font-bold transition ${
                        !selectedTeamForHistory
                          ? 'bg-green-600 text-white shadow-sm'
                          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                    >
                      全体
                    </button>
                    {teamNames.map(name => (
                      <button
                        key={name}
                        onClick={() => { setSelectedTeamForHistory(name); setExpandedYear(null); }}
                        className={`px-3 py-1.5 rounded-md text-sm font-bold transition ${
                          selectedTeamForHistory === name
                            ? 'bg-green-600 text-white shadow-sm'
                            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>

                {!selectedTeamForHistory && (
                  <div className="space-y-2">
                    {yearSummaries.map((entry) => {
                      const isExpanded = expandedYear === entry.year;
                      const champion = entry.standings?.[0];
                      return (
                        <div key={entry.year} className="bg-gray-800 rounded-lg overflow-hidden">
                          <button
                            onClick={() => setExpandedYear(isExpanded ? null : entry.year)}
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-700/50 transition"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-lg font-bold text-white">{entry.year}年目</span>
                              {champion && (
                                <span className="text-yellow-400 font-bold text-sm">
                                  優勝: {champion.team} ({champion.wins}勝{champion.losses}敗{champion.draws > 0 ? ` ${champion.draws}分` : ''})
                                </span>
                              )}
                            </div>
                            <span className="text-gray-500">{isExpanded ? '▲' : '▼'}</span>
                          </button>
                          {isExpanded && entry.standings && (
                            <div className="px-4 pb-3">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-gray-400 text-xs border-b border-gray-700">
                                    <th className="py-1.5 px-2 text-center w-8">順位</th>
                                    <th className="py-1.5 px-2 text-left">チーム</th>
                                    <th className="py-1.5 px-2 text-center">勝</th>
                                    <th className="py-1.5 px-2 text-center">敗</th>
                                    <th className="py-1.5 px-2 text-center">分</th>
                                    <th className="py-1.5 px-2 text-center">勝率</th>
                                    <th className="py-1.5 px-2 text-left">打撃MVP</th>
                                    <th className="py-1.5 px-2 text-left">投手MVP</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {entry.standings.map((s, si) => (
                                    <tr key={si} className={`border-b border-gray-700/50 ${si === 0 ? 'bg-yellow-900/20' : ''}`}>
                                      <td className="py-2 px-2 text-center">
                                        <span className={`font-bold ${si === 0 ? 'text-yellow-400' : si === 1 ? 'text-gray-300' : si === 2 ? 'text-orange-400' : 'text-gray-500'}`}>
                                          {s.rank}
                                        </span>
                                      </td>
                                      <td className="py-2 px-2 font-bold text-white">{s.team}</td>
                                      <td className="py-2 px-2 text-center text-green-400 font-bold">{s.wins}</td>
                                      <td className="py-2 px-2 text-center text-red-400">{s.losses}</td>
                                      <td className="py-2 px-2 text-center text-gray-400">{s.draws || 0}</td>
                                      <td className="py-2 px-2 text-center text-white font-mono">{(s.winRate || 0).toFixed(3)}</td>
                                      <td className="py-2 px-2 text-xs">
                                        {s.mvpBatter ? (
                                          <span className="text-blue-300">
                                            {s.mvpBatter.name}
                                            <span className="text-gray-500 ml-1">
                                              {s.mvpBatter.avg} {s.mvpBatter.hr}HR {s.mvpBatter.rbi}打点
                                            </span>
                                          </span>
                                        ) : <span className="text-gray-500">-</span>}
                                      </td>
                                      <td className="py-2 px-2 text-xs">
                                        {s.mvpPitcher ? (
                                          <span className="text-red-300">
                                            {s.mvpPitcher.name}
                                            <span className="text-gray-500 ml-1">
                                              {s.mvpPitcher.wins}勝{s.mvpPitcher.losses}敗 {s.mvpPitcher.saves > 0 ? `${s.mvpPitcher.saves}S ` : ''}防{s.mvpPitcher.era}
                                            </span>
                                          </span>
                                        ) : <span className="text-gray-500">-</span>}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {selectedTeamForHistory && (
                  <div>
                    {selectedTeamHistory.length === 0 ? (
                      <div className="bg-gray-800 rounded-lg p-6 text-center">
                        <p className="text-gray-500">{selectedTeamForHistory}の成績データがありません</p>
                      </div>
                    ) : (
                      <div className="bg-gray-800 rounded-lg overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-3">
                          <span className="text-lg font-bold text-white">{selectedTeamForHistory}</span>
                          <span className="text-sm text-gray-400">
                            通算 {selectedTeamHistory.reduce((s, r) => s + r.wins, 0)}勝
                            {selectedTeamHistory.reduce((s, r) => s + r.losses, 0)}敗
                            {selectedTeamHistory.reduce((s, r) => s + (r.draws || 0), 0) > 0 && ` ${selectedTeamHistory.reduce((s, r) => s + (r.draws || 0), 0)}分`}
                          </span>
                          <span className="text-yellow-400 text-sm font-bold">
                            優勝 {selectedTeamHistory.filter(r => r.rank === 1).length}回
                          </span>
                        </div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-700/60 text-gray-400 text-xs">
                              <th className="py-1.5 px-3 text-left">年度</th>
                              <th className="py-1.5 px-2 text-center">順位</th>
                              <th className="py-1.5 px-2 text-center">勝</th>
                              <th className="py-1.5 px-2 text-center">敗</th>
                              <th className="py-1.5 px-2 text-center">分</th>
                              <th className="py-1.5 px-2 text-center">勝率</th>
                              <th className="py-1.5 px-2 text-left">打撃MVP</th>
                              <th className="py-1.5 px-2 text-left">投手MVP</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedTeamHistory.map((record, ri) => (
                              <tr key={ri} className={`border-b border-gray-700/50 ${record.rank === 1 ? 'bg-yellow-900/20' : ''}`}>
                                <td className="py-2 px-3 font-bold text-white">{record.year}年目</td>
                                <td className="py-2 px-2 text-center">
                                  <span className={`font-bold text-base ${record.rank === 1 ? 'text-yellow-400' : record.rank === 2 ? 'text-gray-300' : record.rank === 3 ? 'text-orange-400' : 'text-gray-500'}`}>
                                    {record.rank}位
                                  </span>
                                </td>
                                <td className="py-2 px-2 text-center text-green-400 font-bold">{record.wins}</td>
                                <td className="py-2 px-2 text-center text-red-400">{record.losses}</td>
                                <td className="py-2 px-2 text-center text-gray-400">{record.draws || 0}</td>
                                <td className="py-2 px-2 text-center text-white font-mono">{(record.winRate || 0).toFixed(3)}</td>
                                <td className="py-2 px-2 text-xs">
                                  {record.mvpBatter ? (
                                    <div>
                                      <span className="text-blue-300 font-bold">{record.mvpBatter.name}</span>
                                      <div className="text-gray-500 text-[10px]">
                                        {record.mvpBatter.avg} {record.mvpBatter.hr}HR {record.mvpBatter.rbi}打点 {record.mvpBatter.hits}安
                                      </div>
                                    </div>
                                  ) : <span className="text-gray-500">-</span>}
                                </td>
                                <td className="py-2 px-2 text-xs">
                                  {record.mvpPitcher ? (
                                    <div>
                                      <span className="text-red-300 font-bold">{record.mvpPitcher.name}</span>
                                      <div className="text-gray-500 text-[10px]">
                                        {record.mvpPitcher.wins}勝{record.mvpPitcher.losses}敗 {record.mvpPitcher.saves > 0 ? `${record.mvpPitcher.saves}S ` : ''}防{record.mvpPitcher.era} {record.mvpPitcher.strikeouts}K
                                      </div>
                                    </div>
                                  ) : <span className="text-gray-500">-</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 大会記録タブ（社会人モード） */}
        {activeTab === 'tournaments' && (() => {
          const history = seasonData?.tournamentHistory || [];
          const currentYear = seasonData?.year;
          const allRecords = [...history];
          const rt = seasonData?.regionalTournament;
          const td = seasonData?.toshitaikou;
          const ns = seasonData?.nihonSenshuken;
          const cs = seasonData?.clubSenshuken;
          const hasCurrent = rt?.generated || td?.generated || ns?.generated || cs?.generated;
          if (hasCurrent) {
            const cur = { year: currentYear, calendarYear: seasonData?.currentDate?.year, isCurrent: true };
            if (rt?.phase === 'done' && rt.brackets) {
              cur.regional = {};
              Object.entries(rt.brackets).forEach(([rid, region]) => {
                cur.regional[rid] = { regionName: region.regionName, champion: region.champion };
              });
            }
            if (td?.generated) cur.toshitaikou = { champion: td.champion, runnerUp: td.runnerUp };
            if (ns?.generated) cur.senshuken = { champion: ns.champion, runnerUp: ns.runnerUp };
            if (cs?.generated) cur.club = { champion: cs.champion, runnerUp: cs.runnerUp };
            allRecords.push(cur);
          }
          const sorted = [...allRecords].sort((a, b) => (b.year || 0) - (a.year || 0));
          return (
            <div>
              {sorted.length === 0 ? (
                <div className="bg-gray-800 rounded-lg p-6 text-center">
                  <p className="text-gray-400">まだ大会記録がありません</p>
                  <p className="text-gray-500 text-sm mt-1">シーズン中の大会結果がここに記録されます</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sorted.map((rec, ri) => (
                    <div key={ri} className="bg-gray-800 rounded-lg overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-gray-700 flex items-center gap-3">
                        <span className="text-lg font-bold text-white">{rec.year}年目</span>
                        {rec.calendarYear && <span className="text-gray-500 text-sm">({rec.calendarYear}年)</span>}
                        {rec.isCurrent && <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded font-bold">今季</span>}
                      </div>
                      <div className="p-3 space-y-2">
                        {/* 都市対抗 */}
                        {rec.toshitaikou && (
                          <div className="flex items-center gap-3 bg-blue-900/20 border border-blue-700/30 rounded-lg px-3 py-2">
                            <span className="text-blue-400 font-bold text-sm w-24 shrink-0">都市対抗</span>
                            {rec.toshitaikou.champion ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-yellow-400 font-bold">優勝: {rec.toshitaikou.champion}</span>
                                {rec.toshitaikou.runnerUp && <span className="text-gray-400 text-xs">準優勝: {rec.toshitaikou.runnerUp}</span>}
                              </div>
                            ) : <span className="text-gray-500 text-sm">開催中...</span>}
                          </div>
                        )}
                        {/* 日本選手権 */}
                        {rec.senshuken && (
                          <div className="flex items-center gap-3 bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2">
                            <span className="text-red-400 font-bold text-sm w-24 shrink-0">日本選手権</span>
                            {rec.senshuken.champion ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-yellow-400 font-bold">優勝: {rec.senshuken.champion}</span>
                                {rec.senshuken.runnerUp && <span className="text-gray-400 text-xs">準優勝: {rec.senshuken.runnerUp}</span>}
                              </div>
                            ) : <span className="text-gray-500 text-sm">開催中...</span>}
                          </div>
                        )}
                        {/* クラブ選手権 */}
                        {rec.club && (
                          <div className="flex items-center gap-3 bg-purple-900/20 border border-purple-700/30 rounded-lg px-3 py-2">
                            <span className="text-purple-400 font-bold text-sm w-24 shrink-0">クラブ選手権</span>
                            {rec.club.champion ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-yellow-400 font-bold">優勝: {rec.club.champion}</span>
                                {rec.club.runnerUp && <span className="text-gray-400 text-xs">準優勝: {rec.club.runnerUp}</span>}
                              </div>
                            ) : <span className="text-gray-500 text-sm">開催中...</span>}
                          </div>
                        )}
                        {/* 地域トーナメント */}
                        {rec.regional && (
                          <div className="bg-green-900/20 border border-green-700/30 rounded-lg px-3 py-2">
                            <div className="text-green-400 font-bold text-sm mb-1">地域トーナメント</div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1">
                              {Object.values(rec.regional).map((r, i) => (
                                <span key={i} className="text-xs">
                                  <span className="text-gray-400">{r.regionName}:</span>
                                  <span className="text-white font-bold ml-1">{r.champion || '未決定'}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* 都市対抗予選結果 */}
                        {rec.toshitaikouQualifiers && (
                          <details className="group">
                            <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-200 transition px-1">
                              都市対抗 地区予選結果 ▼
                            </summary>
                            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 px-1">
                              {Object.values(rec.toshitaikouQualifiers).map((q, i) => (
                                <span key={i} className="text-xs">
                                  <span className="text-gray-400">{q.regionName}:</span>
                                  <span className="text-blue-300 ml-1">{q.qualifiedTeams?.join(', ') || '-'}</span>
                                </span>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {onClose && (
          <div className="text-center mt-4">
            <button
              onClick={onClose}
              className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg text-sm transition"
            >
              戻る
            </button>
          </div>
        )}
      </div>
      {modalPlayer && <PlayerDetailModal player={modalPlayer} onClose={() => setModalPlayer(null)} />}
    </div>
  );
};

export default HallOfFameScreen;
