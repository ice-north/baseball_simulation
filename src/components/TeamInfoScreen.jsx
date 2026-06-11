import React, { useState } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { POSITION_NAMES, BALL_EFFECTS, PITCHING_FORM_EFFECTS, getAbilityColor } from '../utils/constants.js';
import { formatInnings } from '../utils/physics.js';

const TeamInfoScreen = () => {
  const teamNames = Object.keys(TEAMS_DATA || {});
  const [selectedTeam, setSelectedTeam] = useState(teamNames[0] || 'チームA');
  const [pitcherSortKey, setPitcherSortKey] = useState(null);
  const [pitcherSortDir, setPitcherSortDir] = useState('desc');
  const [fielderSortKey, setFielderSortKey] = useState(null);
  const [fielderSortDir, setFielderSortDir] = useState('desc');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [detailTab, setDetailTab] = useState('ability');

  const team = TEAMS_DATA[selectedTeam];
  if (!team || !team.players) {
    return <div className="text-gray-400 text-center p-8">チームデータがありません</div>;
  }

  const handlePitcherSort = (key) => {
    if (pitcherSortKey === key) setPitcherSortDir(pitcherSortDir === 'asc' ? 'desc' : 'asc');
    else { setPitcherSortKey(key); setPitcherSortDir(['era', 'losses'].includes(key) ? 'asc' : 'desc'); }
  };

  const handleFielderSort = (key) => {
    if (fielderSortKey === key) setFielderSortDir(fielderSortDir === 'asc' ? 'desc' : 'asc');
    else { setFielderSortKey(key); setFielderSortDir(['strikeouts'].includes(key) ? 'asc' : 'desc'); }
  };

  const SortableHeader = ({ label, sortKey, currentKey, currentDir, onClick, align = 'center' }) => (
    <th
      className={`px-2 py-2 text-${align} cursor-pointer hover:bg-gray-500 transition ${currentKey === sortKey ? 'text-yellow-400' : ''}`}
      onClick={() => onClick(sortKey)}
    >
      {label} {currentKey === sortKey && (currentDir === 'asc' ? '▲' : '▼')}
    </th>
  );

  const getPitcherValue = (player, key) => {
    const stats = player.seasonStats?.pitching;
    if (!stats) return 0;
    if (key === 'era') return stats.inningsPitched > 0 ? (stats.earnedRuns * 27) / stats.inningsPitched : 999;
    if (key === 'velocity') return player.pitching?.velocity || 0;
    if (key === 'control') return player.pitching?.control || 0;
    if (key === 'stamina') return player.pitching?.stamina || 0;
    if (key === 'spinRate') return player.pitching?.spinRate ?? 50;
    if (key === 'bodyStamina') return player.physical?.bodyStamina || 50;
    if (key === 'age') return player.age || 0;
    if (key === 'name') return player.name || '';
    return stats[key] || 0;
  };

  const getFielderValue = (player, key) => {
    const stats = player.seasonStats?.batting;
    if (!stats) return 0;
    if (key === 'avg') return stats.atBats > 0 ? stats.hits / stats.atBats : 0;
    if (key === 'meet') return player.batting?.meet || 0;
    if (key === 'power') return player.batting?.power || 0;
    if (key === 'speed') return player.physical?.speed || 0;
    if (key === 'defense') return player.fielding?.defense || 0;
    if (key === 'arm') return player.physical?.arm || 0;
    if (key === 'bodyStamina') return player.physical?.bodyStamina || 50;
    if (key === 'age') return player.age || 0;
    if (key === 'name') return player.name || '';
    return stats[key] || 0;
  };

  const pitchers = team.players.filter(p => p.position === 'pitcher').map(p => {
    const stats = p.seasonStats?.pitching;
    const era = stats?.inningsPitched > 0 ? (stats.earnedRuns * 27) / stats.inningsPitched : null;
    const ip = stats?.inningsPitched > 0 ? formatInnings(stats.inningsPitched) : '0';
    return { ...p, _era: era, _ip: ip };
  });
  if (pitcherSortKey) {
    pitchers.sort((a, b) => {
      let valA = getPitcherValue(a, pitcherSortKey), valB = getPitcherValue(b, pitcherSortKey);
      if (typeof valA === 'string') return pitcherSortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      return pitcherSortDir === 'asc' ? valA - valB : valB - valA;
    });
  }

  const fielders = team.players.filter(p => p.position !== 'pitcher').map(p => {
    const stats = p.seasonStats?.batting;
    const avg = stats?.atBats > 0 ? (stats.hits / stats.atBats) : 0;
    return { ...p, _avg: avg };
  });
  if (fielderSortKey) {
    fielders.sort((a, b) => {
      let valA = getFielderValue(a, fielderSortKey), valB = getFielderValue(b, fielderSortKey);
      if (typeof valA === 'string') return fielderSortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      return fielderSortDir === 'asc' ? valA - valB : valB - valA;
    });
  }

  // 選手詳細パネル
  const PlayerDetailPanel = ({ player }) => {
    if (!player) return null;
    const isPitcher = player.position === 'pitcher';
    const batting = player.seasonStats?.batting || {};
    const pitching = player.seasonStats?.pitching || {};
    const careerBase = isPitcher ? player.careerStats?.pitching : player.careerStats?.batting;
    const seasonCurrent = isPitcher ? pitching : batting;
    const career = careerBase ? Object.fromEntries(
      Object.keys(careerBase).map(key => [key, (careerBase[key] || 0) + (seasonCurrent[key] || 0)])
    ) : null;
    const arsenal = player.pitching?.arsenal || [];
    const formName = PITCHING_FORM_EFFECTS[player.pitching?.form]?.name || player.pitching?.form || '-';
    const catcherLead = player.catching?.lead;
    const positionFit = player.positionFitness || {};

    const StatBar = ({ label, value, max = 99 }) => (
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs text-gray-400 w-12">{label}</span>
        <div className="flex-1 bg-gray-700 rounded h-3">
          <div className={`h-3 rounded ${value >= 80 ? 'bg-red-500' : value >= 60 ? 'bg-yellow-500' : value >= 40 ? 'bg-green-500' : 'bg-blue-500'}`}
            style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
        </div>
        <span className={`text-sm font-bold w-8 text-right ${getAbilityColor(value)}`}>{value}</span>
      </div>
    );

    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setSelectedPlayer(null)}>
        <div className="bg-gray-800 rounded-lg p-6 max-w-3xl w-full mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-white">{player.name}</h2>
            <button onClick={() => setSelectedPlayer(null)} className="text-gray-400 hover:text-white text-xl">✕</button>
          </div>

          <div className="grid grid-cols-4 gap-2 text-sm text-gray-300 mb-4">
            <div>守備: <span className="text-white">{POSITION_NAMES[player.position] || player.position}</span></div>
            <div>年齢: <span className="text-white">{player.age || '?'}歳</span></div>
            <div>投: <span className="text-white">{player.physical?.throws === 'left' ? '左' : '右'}</span></div>
            <div>打: <span className="text-white">{player.batting?.bats === 'left' ? '左' : player.batting?.bats === 'switch' ? '両' : '右'}</span></div>
          </div>
          {/* 経歴 */}
          {(() => {
            const history = player.careerHistory || [];
            const steps = [];
            if (history.length > 0) {
              history.forEach(h => steps.push({ label: h.label, type: h.type }));
            } else {
              if (player.universityTeamName) {
                steps.push({ label: '高校卒', type: 'highschool' });
                steps.push({ label: player.universityTeamName, type: 'university' });
              }
              if (player.previousTeam) steps.push({ label: player.previousTeam, type: 'corporate' });
            }
            if (player.draftInfo) {
              steps.push({ label: `${player.draftInfo.year}年目 ${player.draftInfo.round}巡目入団`, type: 'draft' });
            }
            if (steps.length === 0) return null;
            const typeColor = { highschool: 'bg-gray-600', university: 'bg-blue-900/60 text-blue-300', corporate: 'bg-green-900/60 text-green-300', independent: 'bg-orange-900/60 text-orange-300', released: 'bg-red-900/60 text-red-300', draft: 'bg-yellow-900/60 text-yellow-300' };
            return (
              <div className="flex items-center gap-1 text-sm mb-4 flex-wrap">
                {steps.map((s, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="text-gray-600 mx-0.5">&rarr;</span>}
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeColor[s.type] || 'bg-gray-700 text-gray-200'}`}>{s.label}</span>
                  </span>
                ))}
              </div>
            );
          })()}

          {/* タブ切り替え */}
          <div className="flex gap-1 mb-4 border-b border-gray-600">
            {['ability', 'stats', 'abilityHistory'].map(tab => (
              <button key={tab}
                className={`px-4 py-2 text-sm font-bold rounded-t transition ${detailTab === tab ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                onClick={() => setDetailTab(tab)}
              >
                {tab === 'ability' ? '能力' : tab === 'stats' ? '年度別成績' : '年度別能力値'}
              </button>
            ))}
          </div>

          {detailTab === 'ability' && (<>
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* 野手能力 */}
            <div className="bg-gray-700 rounded p-3">
              <h3 className="text-sm font-bold text-white mb-2">打撃・走塁・守備</h3>
              <StatBar label="ミート" value={player.batting?.meet || 0} />
              <StatBar label="パワー" value={player.batting?.power || 0} />
              <StatBar label="走力" value={player.physical?.speed || 0} />
              <StatBar label="肩力" value={player.physical?.arm || 0} />
              <StatBar label="守備" value={player.fielding?.defense || 0} />
              <StatBar label="選球眼" value={player.batting?.eye || 0} />
              <StatBar label="盗塁" value={player.batting?.steal || 0} />
              <StatBar label="バント" value={player.batting?.bunt || 0} />
              <div className="border-t border-gray-600 mt-2 pt-2">
                <StatBar label="体力" value={player.physical?.bodyStamina || 50} />
                <StatBar label="回復" value={player.physical?.recovery || 50} />
              </div>
              <div className="border-t border-gray-600 mt-2 pt-2">
                <StatBar label="プロ意識" value={player.personality?.discipline || 50} />
                <StatBar label="精神力" value={player.personality?.mental || 50} />
              </div>
              <div className="mt-2 text-xs text-gray-400 grid grid-cols-2 gap-1">
                <div>体格: <span className="text-white">{player.physical?.build === 'large' ? '大柄' : player.physical?.build === 'small' ? '小柄' : '中肉'}</span></div>
                <div>成長: <span className={`font-bold ${(player.growthPotential ?? 1.0) >= 1.1 ? 'text-orange-400' : 'text-white'}`}>
                  {Math.max(0.3, Math.min(1.8, (player.growthPotential ?? 1.0) + (player.growthModifier || 0))).toFixed(2)}
                </span></div>
              </div>
            </div>

            {/* 投手能力 */}
            <div className="bg-gray-700 rounded p-3">
              <h3 className="text-sm font-bold text-white mb-2">投球能力</h3>
              <StatBar label="球速" value={player.pitching?.velocity || 0} max={165} />
              <StatBar label="制球" value={player.pitching?.control || 0} />
              <StatBar label="スタミナ" value={player.pitching?.stamina || 0} />
              <StatBar label="回転" value={player.pitching?.spinRate ?? 50} />
              <div className="mt-2 text-xs text-gray-400">
                フォーム: <span className="text-white">{formName}</span>
              </div>
              {/* 変化球 */}
              <div className="mt-2">
                <div className="text-xs text-gray-400 mb-1">変化球:</div>
                {arsenal.length > 0 ? arsenal.filter(p => p.type !== 'straight').map((pitch, i) => (
                  <div key={i} className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs text-white w-24">{BALL_EFFECTS[pitch.type]?.name || pitch.type}</span>
                    <div className="flex-1 bg-gray-600 rounded h-2">
                      <div className="h-2 rounded bg-purple-500" style={{ width: `${pitch.level}%` }} />
                    </div>
                    <span className={`text-xs font-bold ${getAbilityColor(pitch.level)}`}>{pitch.level}</span>
                  </div>
                )) : <div className="text-xs text-gray-500">なし</div>}
              </div>
            </div>
          </div>

          {/* キャッチャーリード */}
          {catcherLead !== undefined && (
            <div className="bg-gray-700 rounded p-3 mb-4">
              <h3 className="text-sm font-bold text-white mb-2">捕手能力</h3>
              <StatBar label="リード" value={catcherLead} />
            </div>
          )}

          {/* ポジション適性 */}
          <div className="bg-gray-700 rounded p-3 mb-4">
            <h3 className="text-sm font-bold text-white mb-2">ポジション適性</h3>
            <div className="grid grid-cols-3 gap-1">
              {['pitcher', 'catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'].map(pos => (
                <div key={pos} className="flex items-center gap-1">
                  <span className="text-xs text-gray-400 w-8">{POSITION_NAMES[pos]?.slice(0, 2) || pos}</span>
                  <div className="flex-1 bg-gray-600 rounded h-2">
                    <div className={`h-2 rounded ${(positionFit[pos] || 0) >= 80 ? 'bg-red-500' : (positionFit[pos] || 0) >= 50 ? 'bg-yellow-500' : 'bg-gray-500'}`}
                      style={{ width: `${positionFit[pos] || 0}%` }} />
                  </div>
                  <span className={`text-xs w-6 text-right ${getAbilityColor(positionFit[pos] || 0)}`}>{positionFit[pos] || 0}</span>
                </div>
              ))}
            </div>
          </div>
          </>)}
          {/* 年度別成績タブ */}
          {detailTab === 'stats' && (() => {
            const history = player.statsHistory || [];
            if (history.length === 0 && (!batting.games && !pitching.games)) {
              return <div className="text-gray-400 text-sm text-center py-8">まだシーズン成績がありません</div>;
            }
            return isPitcher ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-gray-300">
                  <thead>
                    <tr className="border-b border-gray-600 text-gray-400">
                      <th className="px-2 py-1 text-left">年</th>
                      <th className="px-2 py-1 text-center">試</th>
                      <th className="px-2 py-1 text-center">勝</th>
                      <th className="px-2 py-1 text-center">敗</th>
                      <th className="px-2 py-1 text-center">S</th>
                      <th className="px-2 py-1 text-center">H</th>
                      <th className="px-2 py-1 text-center">回</th>
                      <th className="px-2 py-1 text-center">防御率</th>
                      <th className="px-2 py-1 text-center">奪三振</th>
                      <th className="px-2 py-1 text-center">与四球</th>
                      <th className="px-2 py-1 text-center">失点</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, i) => {
                      const p = h.pitching || {};
                      const era = p.inningsPitched > 0 ? ((p.earnedRuns * 27) / p.inningsPitched).toFixed(2) : '-.--';
                      return (
                        <tr key={i} className="border-b border-gray-700 hover:bg-gray-700">
                          <td className="px-2 py-1 text-white font-bold">{h.year}年目</td>
                          <td className="px-2 py-1 text-center">{p.games || 0}</td>
                          <td className="px-2 py-1 text-center">{p.wins || 0}</td>
                          <td className="px-2 py-1 text-center">{p.losses || 0}</td>
                          <td className="px-2 py-1 text-center">{p.saves || 0}</td>
                          <td className="px-2 py-1 text-center">{p.holds || 0}</td>
                          <td className="px-2 py-1 text-center">{p.inningsPitched > 0 ? formatInnings(p.inningsPitched) : '0'}</td>
                          <td className="px-2 py-1 text-center text-yellow-400">{era}</td>
                          <td className="px-2 py-1 text-center">{p.strikeouts || 0}</td>
                          <td className="px-2 py-1 text-center">{p.walks || 0}</td>
                          <td className="px-2 py-1 text-center">{p.runsAllowed || 0}</td>
                        </tr>
                      );
                    })}
                    {/* 今シーズン */}
                    {(pitching.games > 0) && (
                      <tr className="border-b border-gray-700 bg-gray-750 hover:bg-gray-700">
                        <td className="px-2 py-1 text-cyan-400 font-bold">今季</td>
                        <td className="px-2 py-1 text-center">{pitching.games || 0}</td>
                        <td className="px-2 py-1 text-center">{pitching.wins || 0}</td>
                        <td className="px-2 py-1 text-center">{pitching.losses || 0}</td>
                        <td className="px-2 py-1 text-center">{pitching.saves || 0}</td>
                        <td className="px-2 py-1 text-center">{pitching.holds || 0}</td>
                        <td className="px-2 py-1 text-center">{pitching.inningsPitched > 0 ? formatInnings(pitching.inningsPitched) : '0'}</td>
                        <td className="px-2 py-1 text-center text-yellow-400">{pitching.inningsPitched > 0 ? ((pitching.earnedRuns * 27) / pitching.inningsPitched).toFixed(2) : '-.--'}</td>
                        <td className="px-2 py-1 text-center">{pitching.strikeouts || 0}</td>
                        <td className="px-2 py-1 text-center">{pitching.walks || 0}</td>
                        <td className="px-2 py-1 text-center">{pitching.runsAllowed || 0}</td>
                      </tr>
                    )}
                    {/* 通算 */}
                    {career && (
                      <tr className="border-t-2 border-gray-500 font-bold text-white">
                        <td className="px-2 py-1">通算</td>
                        <td className="px-2 py-1 text-center">{career.games || 0}</td>
                        <td className="px-2 py-1 text-center">{career.wins || 0}</td>
                        <td className="px-2 py-1 text-center">{career.losses || 0}</td>
                        <td className="px-2 py-1 text-center">{career.saves || 0}</td>
                        <td className="px-2 py-1 text-center">{career.holds || 0}</td>
                        <td className="px-2 py-1 text-center">{career.inningsPitched > 0 ? formatInnings(career.inningsPitched) : '0'}</td>
                        <td className="px-2 py-1 text-center text-yellow-400">{career.inningsPitched > 0 ? ((career.earnedRuns * 27) / career.inningsPitched).toFixed(2) : '-.--'}</td>
                        <td className="px-2 py-1 text-center">{career.strikeouts || 0}</td>
                        <td className="px-2 py-1 text-center">{career.walks || 0}</td>
                        <td className="px-2 py-1 text-center">{career.runsAllowed || 0}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-gray-300">
                  <thead>
                    <tr className="border-b border-gray-600 text-gray-400">
                      <th className="px-2 py-1 text-left">年</th>
                      <th className="px-2 py-1 text-center">試</th>
                      <th className="px-2 py-1 text-center">打率</th>
                      <th className="px-2 py-1 text-center">打席</th>
                      <th className="px-2 py-1 text-center">安打</th>
                      <th className="px-2 py-1 text-center">二塁打</th>
                      <th className="px-2 py-1 text-center">三塁打</th>
                      <th className="px-2 py-1 text-center">HR</th>
                      <th className="px-2 py-1 text-center">打点</th>
                      <th className="px-2 py-1 text-center">盗塁</th>
                      <th className="px-2 py-1 text-center">四球</th>
                      <th className="px-2 py-1 text-center">三振</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, i) => {
                      const b = h.batting || {};
                      const avg = b.atBats > 0 ? (b.hits / b.atBats).toFixed(3) : '.000';
                      return (
                        <tr key={i} className="border-b border-gray-700 hover:bg-gray-700">
                          <td className="px-2 py-1 text-white font-bold">{h.year}年目</td>
                          <td className="px-2 py-1 text-center">{b.games || 0}</td>
                          <td className="px-2 py-1 text-center text-yellow-400">{avg}</td>
                          <td className="px-2 py-1 text-center">{b.atBats || 0}</td>
                          <td className="px-2 py-1 text-center">{b.hits || 0}</td>
                          <td className="px-2 py-1 text-center">{b.doubles || 0}</td>
                          <td className="px-2 py-1 text-center">{b.triples || 0}</td>
                          <td className="px-2 py-1 text-center">{b.homeruns || 0}</td>
                          <td className="px-2 py-1 text-center">{b.rbis || 0}</td>
                          <td className="px-2 py-1 text-center">{b.stolenBases || 0}</td>
                          <td className="px-2 py-1 text-center">{b.walks || 0}</td>
                          <td className="px-2 py-1 text-center">{b.strikeouts || 0}</td>
                        </tr>
                      );
                    })}
                    {/* 今シーズン */}
                    {(batting.games > 0) && (
                      <tr className="border-b border-gray-700 hover:bg-gray-700">
                        <td className="px-2 py-1 text-cyan-400 font-bold">今季</td>
                        <td className="px-2 py-1 text-center">{batting.games || 0}</td>
                        <td className="px-2 py-1 text-center text-yellow-400">{batting.atBats > 0 ? (batting.hits / batting.atBats).toFixed(3) : '.000'}</td>
                        <td className="px-2 py-1 text-center">{batting.atBats || 0}</td>
                        <td className="px-2 py-1 text-center">{batting.hits || 0}</td>
                        <td className="px-2 py-1 text-center">{batting.doubles || 0}</td>
                        <td className="px-2 py-1 text-center">{batting.triples || 0}</td>
                        <td className="px-2 py-1 text-center">{batting.homeruns || 0}</td>
                        <td className="px-2 py-1 text-center">{batting.rbis || 0}</td>
                        <td className="px-2 py-1 text-center">{batting.stolenBases || 0}</td>
                        <td className="px-2 py-1 text-center">{batting.walks || 0}</td>
                        <td className="px-2 py-1 text-center">{batting.strikeouts || 0}</td>
                      </tr>
                    )}
                    {/* 通算 */}
                    {career && (
                      <tr className="border-t-2 border-gray-500 font-bold text-white">
                        <td className="px-2 py-1">通算</td>
                        <td className="px-2 py-1 text-center">{career.games || 0}</td>
                        <td className="px-2 py-1 text-center text-yellow-400">{career.atBats > 0 ? (career.hits / career.atBats).toFixed(3) : '.000'}</td>
                        <td className="px-2 py-1 text-center">{career.atBats || 0}</td>
                        <td className="px-2 py-1 text-center">{career.hits || 0}</td>
                        <td className="px-2 py-1 text-center">{career.doubles || 0}</td>
                        <td className="px-2 py-1 text-center">{career.triples || 0}</td>
                        <td className="px-2 py-1 text-center">{career.homeruns || 0}</td>
                        <td className="px-2 py-1 text-center">{career.rbis || 0}</td>
                        <td className="px-2 py-1 text-center">{career.stolenBases || 0}</td>
                        <td className="px-2 py-1 text-center">{career.walks || 0}</td>
                        <td className="px-2 py-1 text-center">{career.strikeouts || 0}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* 年度別能力値タブ */}
          {detailTab === 'abilityHistory' && (() => {
            const history = player.statsHistory || [];
            const hasAbilityData = history.some(h => h.abilities);
            if (!hasAbilityData) {
              return <div className="text-gray-400 text-sm text-center py-8">まだ能力値の履歴がありません（Year2以降に記録されます）</div>;
            }
            const entriesWithAbilities = history.filter(h => h.abilities);
            return isPitcher ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-gray-300">
                  <thead>
                    <tr className="border-b border-gray-600 text-gray-400">
                      <th className="px-2 py-1 text-left">年</th>
                      <th className="px-2 py-1 text-center">年齢</th>
                      <th className="px-2 py-1 text-center">球速</th>
                      <th className="px-2 py-1 text-center">制球</th>
                      <th className="px-2 py-1 text-center">スタミナ</th>
                      <th className="px-2 py-1 text-center">ミート</th>
                      <th className="px-2 py-1 text-center">パワー</th>
                      <th className="px-2 py-1 text-center">走力</th>
                      <th className="px-2 py-1 text-center">守備</th>
                      <th className="px-2 py-1 text-left pl-4">変化球</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entriesWithAbilities.map((h, i) => {
                      const a = h.abilities;
                      const prevA = i > 0 ? entriesWithAbilities[i - 1].abilities : null;
                      const diff = (cur, prev, key) => {
                        if (!prev) return '';
                        const d = cur[key] - prev[key];
                        if (d > 0) return <span className="text-green-400 text-[10px] ml-0.5">+{d}</span>;
                        if (d < 0) return <span className="text-red-400 text-[10px] ml-0.5">{d}</span>;
                        return '';
                      };
                      const arsenalStr = (a.arsenal || []).filter(p => p.type !== 'straight').map(p => {
                        const name = BALL_EFFECTS[p.type]?.name || p.type;
                        return `${name}${p.level}`;
                      }).join(', ');
                      return (
                        <tr key={i} className="border-b border-gray-700 hover:bg-gray-700">
                          <td className="px-2 py-1 text-white font-bold">{h.year}年目</td>
                          <td className="px-2 py-1 text-center">{a.age}歳</td>
                          <td className="px-2 py-1 text-center"><span className={getAbilityColor(a.velocity)}>{a.velocity}</span>{diff(a, prevA, 'velocity')}</td>
                          <td className="px-2 py-1 text-center"><span className={getAbilityColor(a.control)}>{a.control}</span>{diff(a, prevA, 'control')}</td>
                          <td className="px-2 py-1 text-center"><span className={getAbilityColor(a.stamina)}>{a.stamina}</span>{diff(a, prevA, 'stamina')}</td>
                          <td className="px-2 py-1 text-center"><span className={getAbilityColor(a.meet)}>{a.meet}</span>{diff(a, prevA, 'meet')}</td>
                          <td className="px-2 py-1 text-center"><span className={getAbilityColor(a.power)}>{a.power}</span>{diff(a, prevA, 'power')}</td>
                          <td className="px-2 py-1 text-center"><span className={getAbilityColor(a.speed)}>{a.speed}</span>{diff(a, prevA, 'speed')}</td>
                          <td className="px-2 py-1 text-center"><span className={getAbilityColor(a.defense)}>{a.defense}</span>{diff(a, prevA, 'defense')}</td>
                          <td className="px-2 py-1 text-left pl-4 text-[10px]">{arsenalStr || '-'}</td>
                        </tr>
                      );
                    })}
                    {/* 現在 */}
                    <tr className="border-t-2 border-gray-500 font-bold">
                      <td className="px-2 py-1 text-cyan-400">現在</td>
                      <td className="px-2 py-1 text-center text-white">{player.age}歳</td>
                      <td className="px-2 py-1 text-center"><span className={getAbilityColor(player.pitching?.velocity || 0)}>{player.pitching?.velocity || 0}</span></td>
                      <td className="px-2 py-1 text-center"><span className={getAbilityColor(player.pitching?.control || 0)}>{player.pitching?.control || 0}</span></td>
                      <td className="px-2 py-1 text-center"><span className={getAbilityColor(player.pitching?.stamina || 0)}>{player.pitching?.stamina || 0}</span></td>
                      <td className="px-2 py-1 text-center"><span className={getAbilityColor(player.batting?.meet || 0)}>{player.batting?.meet || 0}</span></td>
                      <td className="px-2 py-1 text-center"><span className={getAbilityColor(player.batting?.power || 0)}>{player.batting?.power || 0}</span></td>
                      <td className="px-2 py-1 text-center"><span className={getAbilityColor(player.physical?.speed || 0)}>{player.physical?.speed || 0}</span></td>
                      <td className="px-2 py-1 text-center"><span className={getAbilityColor(player.fielding?.defense || 0)}>{player.fielding?.defense || 0}</span></td>
                      <td className="px-2 py-1 text-left pl-4 text-[10px]">{(player.pitching?.arsenal || []).filter(p => p.type !== 'straight').map(p => `${BALL_EFFECTS[p.type]?.name || p.type}${p.level}`).join(', ') || '-'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-gray-300">
                  <thead>
                    <tr className="border-b border-gray-600 text-gray-400">
                      <th className="px-2 py-1 text-left">年</th>
                      <th className="px-2 py-1 text-center">年齢</th>
                      <th className="px-2 py-1 text-center">ミート</th>
                      <th className="px-2 py-1 text-center">パワー</th>
                      <th className="px-2 py-1 text-center">走力</th>
                      <th className="px-2 py-1 text-center">肩力</th>
                      <th className="px-2 py-1 text-center">守備</th>
                      <th className="px-2 py-1 text-center">選球眼</th>
                      <th className="px-2 py-1 text-center">盗塁</th>
                      {player.catching?.lead !== undefined && <th className="px-2 py-1 text-center">リード</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {entriesWithAbilities.map((h, i) => {
                      const a = h.abilities;
                      const prevA = i > 0 ? entriesWithAbilities[i - 1].abilities : null;
                      const diff = (cur, prev, key) => {
                        if (!prev) return '';
                        const d = cur[key] - prev[key];
                        if (d > 0) return <span className="text-green-400 text-[10px] ml-0.5">+{d}</span>;
                        if (d < 0) return <span className="text-red-400 text-[10px] ml-0.5">{d}</span>;
                        return '';
                      };
                      return (
                        <tr key={i} className="border-b border-gray-700 hover:bg-gray-700">
                          <td className="px-2 py-1 text-white font-bold">{h.year}年目</td>
                          <td className="px-2 py-1 text-center">{a.age}歳</td>
                          <td className="px-2 py-1 text-center"><span className={getAbilityColor(a.meet)}>{a.meet}</span>{diff(a, prevA, 'meet')}</td>
                          <td className="px-2 py-1 text-center"><span className={getAbilityColor(a.power)}>{a.power}</span>{diff(a, prevA, 'power')}</td>
                          <td className="px-2 py-1 text-center"><span className={getAbilityColor(a.speed)}>{a.speed}</span>{diff(a, prevA, 'speed')}</td>
                          <td className="px-2 py-1 text-center"><span className={getAbilityColor(a.arm)}>{a.arm}</span>{diff(a, prevA, 'arm')}</td>
                          <td className="px-2 py-1 text-center"><span className={getAbilityColor(a.defense)}>{a.defense}</span>{diff(a, prevA, 'defense')}</td>
                          <td className="px-2 py-1 text-center"><span className={getAbilityColor(a.eye)}>{a.eye}</span>{diff(a, prevA, 'eye')}</td>
                          <td className="px-2 py-1 text-center"><span className={getAbilityColor(a.steal)}>{a.steal}</span>{diff(a, prevA, 'steal')}</td>
                          {a.catcherLead !== undefined && <td className="px-2 py-1 text-center"><span className={getAbilityColor(a.catcherLead)}>{a.catcherLead}</span>{diff(a, prevA, 'catcherLead')}</td>}
                        </tr>
                      );
                    })}
                    {/* 現在 */}
                    <tr className="border-t-2 border-gray-500 font-bold">
                      <td className="px-2 py-1 text-cyan-400">現在</td>
                      <td className="px-2 py-1 text-center text-white">{player.age}歳</td>
                      <td className="px-2 py-1 text-center"><span className={getAbilityColor(player.batting?.meet || 0)}>{player.batting?.meet || 0}</span></td>
                      <td className="px-2 py-1 text-center"><span className={getAbilityColor(player.batting?.power || 0)}>{player.batting?.power || 0}</span></td>
                      <td className="px-2 py-1 text-center"><span className={getAbilityColor(player.physical?.speed || 0)}>{player.physical?.speed || 0}</span></td>
                      <td className="px-2 py-1 text-center"><span className={getAbilityColor(player.physical?.arm || 0)}>{player.physical?.arm || 0}</span></td>
                      <td className="px-2 py-1 text-center"><span className={getAbilityColor(player.fielding?.defense || 0)}>{player.fielding?.defense || 0}</span></td>
                      <td className="px-2 py-1 text-center"><span className={getAbilityColor(player.batting?.eye || 0)}>{player.batting?.eye || 0}</span></td>
                      <td className="px-2 py-1 text-center"><span className={getAbilityColor(player.batting?.steal || 0)}>{player.batting?.steal || 0}</span></td>
                      {player.catching?.lead !== undefined && <td className="px-2 py-1 text-center"><span className={getAbilityColor(player.catching?.lead || 0)}>{player.catching?.lead || 0}</span></td>}
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      </div>
    );
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-white">チーム情報</h1>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">チーム選択</label>
          <select value={selectedTeam} onChange={(e) => { setSelectedTeam(e.target.value); setSelectedPlayer(null); }} className="w-full bg-gray-700 text-white rounded px-4 py-2">
            {Object.keys(TEAMS_DATA).map(teamName => (
              <option key={teamName} value={teamName}>{teamName}</option>
            ))}
          </select>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <div className={`grid ${team.corporateData ? 'grid-cols-5' : 'grid-cols-3'} gap-4 text-white`}>
            <div><div className="text-sm text-gray-400">総人数</div><div className="text-2xl font-bold">{team.players.length}人</div></div>
            <div><div className="text-sm text-gray-400">投手</div><div className="text-2xl font-bold">{pitchers.length}人</div></div>
            <div><div className="text-sm text-gray-400">野手</div><div className="text-2xl font-bold">{fielders.length}人</div></div>
            {team.corporateData && (() => {
              const cd = team.corporateData;
              const rankColor = { S: 'text-yellow-400', A: 'text-blue-400', B: 'text-green-400', C: 'text-gray-300', D: 'text-gray-500' }[cd.rank] || 'text-gray-300';
              return (<>
                <div>
                  <div className="text-sm text-gray-400">ランク</div>
                  <div className={`text-2xl font-black ${rankColor}`}>{cd.rank}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-400">注目度</div>
                  <div className="flex items-center gap-2">
                    <div className="text-2xl font-bold">{Math.round(cd.reputation)}</div>
                    <div className="flex-1 max-w-[80px] bg-gray-700 rounded-full h-2.5 mt-1">
                      <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full" style={{width: `${cd.reputation}%`}} />
                    </div>
                  </div>
                </div>
              </>);
            })()}
          </div>
        </div>

        {/* 投手テーブル */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-1">投手 ({pitchers.length}人)</h2>
          <p className="text-xs text-gray-500 mb-3">クリックで詳細表示</p>
          {pitchers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-600 text-gray-200">
                    <SortableHeader label="名前" sortKey="name" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} align="left" />
                    <SortableHeader label="年齢" sortKey="age" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <th className="px-2 py-2 text-center">投</th>
                    <SortableHeader label="球速" sortKey="velocity" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="制球" sortKey="control" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="スタミナ" sortKey="stamina" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="回転" sortKey="spinRate" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="体力" sortKey="bodyStamina" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="試合" sortKey="games" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="勝" sortKey="wins" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="敗" sortKey="losses" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="H" sortKey="holds" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="S" sortKey="saves" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="回" sortKey="inningsPitched" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="失点" sortKey="runsAllowed" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="奪三振" sortKey="strikeouts" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="与四球" sortKey="walks" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="防御率" sortKey="era" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                  </tr>
                </thead>
                <tbody>
                  {pitchers.map((player, index) => {
                    const stats = player.seasonStats?.pitching;
                    return (
                      <tr key={player.id} className={`cursor-pointer hover:bg-gray-500 transition ${index % 2 === 0 ? 'bg-gray-700' : 'bg-gray-750'}`}
                        onClick={() => { setSelectedPlayer(player); setDetailTab('ability'); }}>
                        <td className="px-2 py-1 text-white font-medium">{player.name}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{player.age}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{player.physical?.throws === 'left' ? '左' : '右'}</td>
                        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.pitching?.velocity)}`}>{player.pitching?.velocity || '-'}</td>
                        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.pitching?.control)}`}>{player.pitching?.control || '-'}</td>
                        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(Math.min(99, Math.floor((player.pitching?.stamina || 0) / 2)))}`}>{player.pitching?.stamina || '-'}</td>
                        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.pitching?.spinRate ?? 50)}`}>{player.pitching?.spinRate ?? 50}</td>
                        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.physical?.bodyStamina || 50)}`}>{player.physical?.bodyStamina || 50}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.games || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.wins || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.losses || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.holds || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.saves || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{player._ip}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.runsAllowed || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.strikeouts || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.walks || 0}</td>
                        <td className="px-2 py-1 text-yellow-400 text-center font-bold">
                          {player._era !== null ? player._era.toFixed(2) : '-.--'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-400 text-center py-4">投手がいません</p>
          )}
        </div>

        {/* 野手テーブル */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-1">野手 ({fielders.length}人)</h2>
          <p className="text-xs text-gray-500 mb-3">クリックで詳細表示</p>
          {fielders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-600 text-gray-200">
                    <SortableHeader label="名前" sortKey="name" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} align="left" />
                    <th className="px-2 py-2 text-center">守備</th>
                    <SortableHeader label="年齢" sortKey="age" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <th className="px-2 py-2 text-center">投打</th>
                    <SortableHeader label="ミート" sortKey="meet" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="パワー" sortKey="power" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="走力" sortKey="speed" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="守備" sortKey="defense" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="肩" sortKey="arm" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="体力" sortKey="bodyStamina" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="試合" sortKey="games" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="打席" sortKey="atBats" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="安打" sortKey="hits" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="HR" sortKey="homeruns" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="打点" sortKey="rbis" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="盗塁" sortKey="stolenBases" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="四球" sortKey="walks" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="三振" sortKey="strikeouts" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="打率" sortKey="avg" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                  </tr>
                </thead>
                <tbody>
                  {fielders.map((player, index) => {
                    const stats = player.seasonStats?.batting;
                    return (
                      <tr key={player.id} className={`cursor-pointer hover:bg-gray-500 transition ${index % 2 === 0 ? 'bg-gray-700' : 'bg-gray-750'}`}
                        onClick={() => { setSelectedPlayer(player); setDetailTab('ability'); }}>
                        <td className="px-2 py-1 text-white font-medium">{player.name}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{POSITION_NAMES[player.position]}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{player.age}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{player.physical?.throws === 'left' ? '左' : '右'}{player.batting?.bats === 'left' ? '左' : player.batting?.bats === 'switch' ? '両' : '右'}</td>
                        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.batting?.meet)}`}>{player.batting?.meet || '-'}</td>
                        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.batting?.power)}`}>{player.batting?.power || '-'}</td>
                        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.physical?.speed)}`}>{player.physical?.speed || '-'}</td>
                        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.fielding?.defense)}`}>{player.fielding?.defense || '-'}</td>
                        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.physical?.arm)}`}>{player.physical?.arm || '-'}</td>
                        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.physical?.bodyStamina || 50)}`}>{player.physical?.bodyStamina || 50}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.games || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.atBats || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.hits || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.homeruns || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.rbis || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.stolenBases || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.walks || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.strikeouts || 0}</td>
                        <td className="px-2 py-1 text-yellow-400 text-center font-bold">{player._avg.toFixed(3)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-400 text-center py-4">野手がいません</p>
          )}
        </div>
      </div>

      {/* 選手詳細モーダル */}
      {selectedPlayer && <PlayerDetailPanel player={selectedPlayer} />}
    </div>
  );
};

export default TeamInfoScreen;
