import React, { useState, useEffect } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { TRAINING_MENUS, SUB_TRAINING_MENUS, executeTeamCampTraining, executeSubTraining, ALL_PITCH_TYPES, getPitchTypeName, DISPATCH_DESTINATIONS, checkDispatchEligibility, dispatchPlayer, calcPlayerOverall, processDispatchReturns, cleanupPlayerReferences } from '../season/yearProgressionSystem.js';
import { POSITION_NAMES } from '../utils/constants.js';

const MAX_CAMP_ROUNDS = 4;

// 練習プリセット定義
const CAMP_PRESETS = {
  fielder_balanced: {
    name: '野手総合', icon: '⚾',
    desc: '打撃・守備・走力をバランスよく強化',
    getMain: () => 'batting',
    getSub: () => 'running',
    effect: 'ミート/パワー+2〜5, 走力+1〜3',
  },
  pitcher_balanced: {
    name: '投手総合', icon: '⚾',
    desc: '球速・制球・スタミナをバランスよく強化',
    getMain: () => 'stamina',
    getSub: () => 'running',
    effect: 'スタミナ+2〜5, 走力+1〜3',
  },
  weakness: {
    name: '弱点克服', icon: '📈',
    desc: '最も低い能力を集中的に強化',
    getMain: (p) => {
      if (p.position === 'pitcher') {
        const stats = { velocity: ((p.pitching?.velocity||130)-115)*2.5, control: p.pitching?.control||50, stamina: (p.pitching?.stamina||100)/2 };
        const lowest = Object.entries(stats).sort((a,b) => a[1]-b[1])[0][0];
        return lowest === 'velocity' ? 'velocity' : lowest === 'control' ? 'control' : 'stamina';
      }
      const stats = { meet: p.batting?.meet||0, power: p.batting?.power||0, speed: p.physical?.speed||0, defense: p.fielding?.defense||0, eye: p.batting?.eye||0 };
      const lowest = Object.entries(stats).sort((a,b) => a[1]-b[1])[0][0];
      if (lowest === 'meet' || lowest === 'power') return 'batting';
      if (lowest === 'speed') return 'baserunning';
      if (lowest === 'defense') return 'fielding';
      return 'eye';
    },
    getSub: (p) => {
      if (p.position === 'pitcher') return 'running';
      const stats = { meet: p.batting?.meet||0, power: p.batting?.power||0, speed: p.physical?.speed||0, defense: p.fielding?.defense||0 };
      const sorted = Object.entries(stats).sort((a,b) => a[1]-b[1]);
      const secondLowest = sorted[1][0];
      if (secondLowest === 'speed') return 'running';
      return 'mental';
    },
    effect: '最低能力+2〜5',
  },
  strength: {
    name: '長所強化', icon: '💪',
    desc: '最も高い能力をさらに伸ばす',
    getMain: (p) => {
      if (p.position === 'pitcher') {
        const stats = { velocity: ((p.pitching?.velocity||130)-115)*2.5, control: p.pitching?.control||50, stamina: (p.pitching?.stamina||100)/2 };
        const highest = Object.entries(stats).sort((a,b) => b[1]-a[1])[0][0];
        return highest === 'velocity' ? 'velocity' : highest === 'control' ? 'control' : 'stamina';
      }
      const stats = { meet: p.batting?.meet||0, power: p.batting?.power||0, speed: p.physical?.speed||0, defense: p.fielding?.defense||0, eye: p.batting?.eye||0 };
      const highest = Object.entries(stats).sort((a,b) => b[1]-a[1])[0][0];
      if (highest === 'meet' || highest === 'power') return 'batting';
      if (highest === 'speed') return 'baserunning';
      if (highest === 'defense') return 'fielding';
      return 'eye';
    },
    getSub: () => 'mental',
    effect: '最高能力+2〜5, 精神+1〜3',
  },
  batting_focus: {
    name: '打撃特化', icon: '🏏',
    desc: 'ミート・パワー・選球眼を集中強化',
    getMain: () => 'batting',
    getSub: () => 'mental',
    effect: 'ミート/パワー+2〜5, 精神+1〜3',
  },
  pitching_velocity: {
    name: '球速強化', icon: '🔥',
    desc: '球速とスタミナを集中強化',
    getMain: () => 'velocity',
    getSub: () => 'running',
    effect: '球速+1〜3km, 走力+1〜3',
  },
  defense_focus: {
    name: '守備強化', icon: '🧤',
    desc: '守備力・肩力・走力を強化',
    getMain: () => 'fielding',
    getSub: () => 'running',
    effect: '守備/肩+2〜5, 走力+1〜3',
  },
  subposition: {
    name: 'サブポジ開発', icon: '🔄',
    desc: '守備位置の適性を集中的に向上',
    getMain: (p) => p.position === 'pitcher' ? 'control' : 'fielding',
    getSub: () => 'subposition',
    effect: 'サブ適性+9〜15, 守備+2〜5',
  },
};

const CampScreen = ({ onComplete, allTeams, seasonData }) => {
  const teamNames = Object.keys(TEAMS_DATA || {});
  const userTeamName = teamNames[0] || 'チームA';
  const userTeam = TEAMS_DATA[userTeamName];
  const currentYear = seasonData?.year || 1;

  const [currentRound, setCurrentRound] = useState(1);
  const [assignments, setAssignments] = useState(() => {
    const init = {};
    userTeam?.players?.forEach(p => {
      init[p.id] = p.position === 'pitcher' ? 'stamina' : 'batting';
    });
    return init;
  });
  const [subAssignments, setSubAssignments] = useState(() => {
    const init = {};
    userTeam?.players?.forEach(p => { init[p.id] = 'running'; });
    return init;
  });
  const [newPitchSelections, setNewPitchSelections] = useState({});
  const [subPositionSelections, setSubPositionSelections] = useState({});
  const [formSelections, setFormSelections] = useState({});
  const [batsSelections, setBatsSelections] = useState({});
  const [roundResults, setRoundResults] = useState(null);
  const [viewMode, setViewMode] = useState('select');
  const [settingMode, setSettingMode] = useState('preset'); // 'preset' or 'individual'
  const [campTab, setCampTab] = useState('training'); // 'training' or 'dispatch'
  const [returnReports, setReturnReports] = useState(null); // 帰還レポート
  const [dispatchConfirm, setDispatchConfirm] = useState(null); // { playerId, destKey }

  // キャンプ開始時に派遣帰還を処理 & AI派遣
  useEffect(() => {
    if (currentYear <= 1) return;
    const { returnedPlayers } = processDispatchReturns(userTeam, currentYear);
    // AIチームも帰還処理 & 派遣判定
    teamNames.forEach(tn => {
      if (tn === userTeamName) return;
      const aiTeam = TEAMS_DATA[tn];
      if (!aiTeam) return;
      processDispatchReturns(aiTeam, currentYear);
      // AIチーム: 若くて能力の低い選手を30%の確率で派遣
      aiTeam.players.forEach(p => {
        if (p.dispatched) return;
        if (Math.random() > 0.3) return;
        const destKeys = Object.keys(DISPATCH_DESTINATIONS);
        for (const dk of destKeys) {
          const { eligible } = checkDispatchEligibility(p, dk);
          if (eligible) {
            dispatchPlayer(p, dk, currentYear);
            cleanupPlayerReferences(aiTeam, p.id);
            break;
          }
        }
      });
    });
    if (returnedPlayers.length > 0) {
      setReturnReports(returnedPlayers);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDispatch = (playerId, destKey) => {
    const player = userTeam?.players?.find(p => p.id === playerId);
    if (!player) return;
    dispatchPlayer(player, destKey, currentYear);
    // 派遣中の選手をラインナップから除去
    cleanupPlayerReferences(userTeam, playerId);
    setDispatchConfirm(null);
    // 再レンダリングのためassignmentsを更新
    setAssignments(prev => {
      const next = { ...prev };
      delete next[playerId];
      return next;
    });
  };

  const POSITION_ORDER = ['pitcher', 'catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'];
  const sortedPlayers = [...(userTeam?.players || [])].sort((a, b) => {
    const posA = POSITION_ORDER.indexOf(a.position);
    const posB = POSITION_ORDER.indexOf(b.position);
    if (posA !== posB) return posA - posB;
    return (b.age || 20) - (a.age || 20);
  });

  const isPitcher = (player) => player.position === 'pitcher';

  const getAbilityRank = (value, isVelocity = false, isStamina = false) => {
    let v = value;
    if (isVelocity) v = (value - 115) * 2.5;
    else if (isStamina) v = value / 2;
    if (v >= 90) return { rank: 'S', color: 'text-pink-400' };
    if (v >= 80) return { rank: 'A', color: 'text-red-400' };
    if (v >= 70) return { rank: 'B', color: 'text-orange-400' };
    if (v >= 60) return { rank: 'C', color: 'text-yellow-400' };
    if (v >= 50) return { rank: 'D', color: 'text-green-400' };
    if (v >= 40) return { rank: 'E', color: 'text-blue-400' };
    return { rank: 'F', color: 'text-gray-400' };
  };

  const StatValue = ({ value, label, isVelocity = false, isStamina = false }) => {
    const { color } = getAbilityRank(value, isVelocity, isStamina);
    return <span className={`${color} font-bold`} title={`${label}: ${value}`}>{value}</span>;
  };

  const FitnessValue = ({ value }) => {
    if (value === undefined || value === null) return <span className="text-gray-700">-</span>;
    const color = value >= 80 ? 'text-green-400' : value >= 60 ? 'text-yellow-400' : value >= 40 ? 'text-orange-400' : 'text-red-400';
    return <span className={`${color} text-[10px]`}>{value}</span>;
  };

  const getAvailableNewPitches = (player) => {
    const existing = (player.pitching?.arsenal || []).map(p => p.type);
    return ALL_PITCH_TYPES.filter(t => !existing.includes(t));
  };

  const applyPreset = (presetKey) => {
    const preset = CAMP_PRESETS[presetKey];
    if (!preset) return;
    const newAssign = {};
    const newSubAssign = {};
    userTeam?.players?.forEach(p => {
      newAssign[p.id] = preset.getMain(p);
      newSubAssign[p.id] = preset.getSub(p);
    });
    setAssignments(newAssign);
    setSubAssignments(newSubAssign);
  };

  const handleExecuteTraining = () => {
    if (!userTeam || !userTeam.players) return;

    const finalAssignments = {};
    userTeam.players.forEach(p => {
      if (p.dispatched) return; // 派遣中の選手はスキップ
      finalAssignments[p.id] = assignments[p.id] || (isPitcher(p) ? 'stamina' : 'batting');
    });

    const { updatedTeam, allReports } = executeTeamCampTraining(
      userTeam, finalAssignments, newPitchSelections
    );
    TEAMS_DATA[userTeamName] = updatedTeam;

    updatedTeam.players.forEach(p => {
      const subType = subAssignments[p.id] || 'running';
      const subOptions = {
        targetPosition: subPositionSelections[p.id],
        targetForm: formSelections[p.id],
        targetBats: batsSelections[p.id],
      };
      const { growthReport: subGrowth } = executeSubTraining(p, subType, subOptions);
      const mainReport = allReports.find(r => r.player.id === p.id);
      if (mainReport && subGrowth.length > 0) {
        mainReport.subGrowthReport = subGrowth;
        mainReport.subTrainingType = subType;
      }
    });

    teamNames.forEach(tn => {
      if (tn === userTeamName) return;
      const aiTeam = TEAMS_DATA[tn];
      if (!aiTeam?.players) return;
      const aiAssign = {};
      const pitcherMenus = ['stamina', 'control', 'velocity', 'breaking'];
      const batterMenus = ['batting', 'baserunning', 'fielding', 'eye'];
      aiTeam.players.forEach(p => {
        if (p.dispatched) return; // 派遣中はスキップ
        if (p.position === 'pitcher') {
          aiAssign[p.id] = pitcherMenus[Math.floor(Math.random() * pitcherMenus.length)];
        } else {
          aiAssign[p.id] = batterMenus[Math.floor(Math.random() * batterMenus.length)];
        }
      });
      const aiResult = executeTeamCampTraining(aiTeam, aiAssign);
      TEAMS_DATA[tn] = aiResult.updatedTeam;
      const subMenuKeys = Object.keys(SUB_TRAINING_MENUS);
      aiResult.updatedTeam.players.forEach(p => {
        const aiSubType = subMenuKeys[Math.floor(Math.random() * subMenuKeys.length)];
        executeSubTraining(p, aiSubType);
      });
    });

    setRoundResults(allReports);
    setViewMode('results');
  };

  const handleNextRound = () => {
    if (currentRound >= MAX_CAMP_ROUNDS) return;
    setCurrentRound(currentRound + 1);
    setRoundResults(null);
    setViewMode('select');
  };

  const getArsenalDisplay = (player) => {
    const arsenal = (player.pitching?.arsenal || []).filter(a => a.type !== 'straight');
    if (arsenal.length === 0) return '-';
    return arsenal.map(a => `${getPitchTypeName(a.type)}${a.level}`).join(' ');
  };

  const subPosHeaders = ['catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'];
  const subPosShort = { catcher: '捕', first: '一', second: '二', third: '三', short: '遊', left: '左', center: '中', right: '右' };

  // 派遣中でない選手のみ表示
  const activePlayers = sortedPlayers.filter(p => !p.dispatched);
  const dispatchedPlayers = sortedPlayers.filter(p => p.dispatched);

  return (
    <div className="p-3 bg-gray-900 min-h-screen">
      <div className="max-w-full mx-auto">
        {/* 帰還レポートモーダル */}
        {returnReports && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-800 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-5">
              <h2 className="text-lg font-bold text-yellow-400 mb-3 text-center">派遣選手が帰還しました!</h2>
              {returnReports.map((report, idx) => (
                <div key={idx} className="bg-gray-700/60 rounded-lg p-3 mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`font-bold text-sm ${report.player.position === 'pitcher' ? 'text-red-400' : 'text-blue-300'}`}>
                      {report.player.name}
                    </span>
                    <span className="text-gray-400 text-xs">({POSITION_NAMES[report.player.position]} / {report.player.age}歳)</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {report.growthReport.map((g, gIdx) => (
                      <span key={gIdx} className={`px-2 py-0.5 rounded text-xs font-bold ${
                        g.isAwakening ? 'bg-yellow-500 text-black' : 'bg-green-700 text-green-100'
                      }`}>
                        {g.statName}: {g.before} → {g.after} (+{g.growth})
                        {g.isAwakening && ' 覚醒!'}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              <div className="text-center mt-3">
                <button
                  onClick={() => setReturnReports(null)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2 rounded-lg font-bold text-sm transition"
                >
                  確認
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 派遣確認モーダル */}
        {dispatchConfirm && (() => {
          const player = userTeam?.players?.find(p => p.id === dispatchConfirm.playerId);
          const dest = DISPATCH_DESTINATIONS[dispatchConfirm.destKey];
          if (!player || !dest) return null;
          return (
            <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
              <div className="bg-gray-800 rounded-xl max-w-md w-full p-5">
                <h2 className="text-base font-bold text-white mb-3 text-center">{dest.icon} {dest.name}に派遣</h2>
                <div className="bg-gray-700/60 rounded-lg p-3 mb-3 text-center">
                  <div className="text-white font-bold text-lg mb-1">{player.name}</div>
                  <div className="text-gray-400 text-xs">{POSITION_NAMES[player.position]} / {player.age}歳 / 総合力: {calcPlayerOverall(player)}</div>
                </div>
                <div className="text-yellow-400 text-xs mb-3 text-center space-y-0.5">
                  <p>{dest.duration}シーズンの間、試合に出場できません</p>
                  <p>帰還時に大幅な能力アップが期待できます</p>
                </div>
                <div className="flex gap-2 justify-center">
                  <button onClick={() => setDispatchConfirm(null)} className="bg-gray-600 hover:bg-gray-500 text-white px-6 py-2 rounded-lg text-sm font-bold transition">
                    キャンセル
                  </button>
                  <button onClick={() => handleDispatch(dispatchConfirm.playerId, dispatchConfirm.destKey)} className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded-lg text-sm font-bold transition">
                    派遣する
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white">春季キャンプ - {userTeamName}</h1>
            {currentYear > 1 && (
              <div className="flex gap-1">
                <button
                  onClick={() => setCampTab('training')}
                  className={`px-3 py-1 text-xs rounded-md font-bold transition ${campTab === 'training' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                >
                  練習
                </button>
                <button
                  onClick={() => setCampTab('dispatch')}
                  className={`px-3 py-1 text-xs rounded-md font-bold transition ${campTab === 'dispatch' ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                >
                  派遣 {dispatchedPlayers.length > 0 && `(${dispatchedPlayers.length})`}
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map(r => (
              <div key={r} className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                r < currentRound ? 'bg-green-600 text-white'
                  : r === currentRound ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                  : 'bg-gray-700 text-gray-500'
              }`}>{r}</div>
            ))}
            <span className="text-gray-500 text-xs ml-1">{currentRound}/{MAX_CAMP_ROUNDS}</span>
          </div>
        </div>

        {/* 派遣タブ */}
        {campTab === 'dispatch' && (
          <div className="mb-3">
            {/* 派遣先の説明 */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              {Object.entries(DISPATCH_DESTINATIONS).map(([key, dest]) => (
                <div key={key} className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{dest.icon}</span>
                    <span className="text-white font-bold text-sm">{dest.name}</span>
                  </div>
                  <div className="text-gray-400 text-xs mb-1">{dest.desc}</div>
                  <div className="text-[10px] text-gray-500 space-y-0.5">
                    <div>対象: {dest.maxAge}歳以下 / 総合力{dest.maxOverall}以下</div>
                    <div>期間: {dest.duration}シーズン</div>
                  </div>
                </div>
              ))}
            </div>

            {/* 派遣中の選手 */}
            {dispatchedPlayers.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-3 mb-3">
                <h3 className="text-sm font-bold text-orange-400 mb-2">派遣中の選手</h3>
                <div className="space-y-1">
                  {dispatchedPlayers.map(p => (
                    <div key={p.id} className="bg-gray-700/50 rounded px-3 py-1.5 flex items-center justify-between">
                      <div>
                        <span className={`font-bold text-xs ${p.position === 'pitcher' ? 'text-red-400' : 'text-blue-300'}`}>{p.name}</span>
                        <span className="text-gray-500 text-[10px] ml-2">{POSITION_NAMES[p.position]} / {p.age}歳</span>
                      </div>
                      <div className="text-[10px] text-orange-400">
                        {p.dispatched.destinationName} (帰還: {p.dispatched.returnYear}年目)
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 派遣可能な選手リスト */}
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-700/80 text-gray-400 text-[10px]">
                    <th className="py-1.5 px-2 text-left w-20">選手</th>
                    <th className="py-1.5 px-1 text-center w-7">位</th>
                    <th className="py-1.5 px-1 text-center w-6">齢</th>
                    <th className="py-1.5 px-1 text-center w-9">総合</th>
                    <th className="py-1.5 px-1 text-center w-7">ミ</th>
                    <th className="py-1.5 px-1 text-center w-7">パ</th>
                    <th className="py-1.5 px-1 text-center w-7">走</th>
                    <th className="py-1.5 px-1 text-center w-7">守</th>
                    <th className="py-1.5 px-1 text-center w-9">速</th>
                    <th className="py-1.5 px-1 text-center w-7">制</th>
                    <th className="py-1.5 px-1 text-center w-9">ス</th>
                    <th className="py-1.5 px-2 text-center">派遣</th>
                  </tr>
                </thead>
                <tbody>
                  {activePlayers.map(player => {
                    const b = player.batting || {};
                    const p = player.pitching || {};
                    const ph = player.physical || {};
                    const f = player.fielding || {};
                    const overall = calcPlayerOverall(player);

                    return (
                      <tr key={player.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                        <td className="py-1 px-2">
                          <span className={`font-bold text-xs ${isPitcher(player) ? 'text-red-400' : 'text-blue-300'}`}>{player.name}</span>
                        </td>
                        <td className="py-1 px-1 text-center text-[10px] text-gray-500">{POSITION_NAMES[player.position]}</td>
                        <td className="py-1 px-1 text-center text-gray-500 text-[10px]">{player.age || 20}</td>
                        <td className="py-1 px-1 text-center">
                          <span className={`text-[10px] font-bold ${overall <= 40 ? 'text-gray-400' : overall <= 50 ? 'text-blue-400' : overall <= 55 ? 'text-green-400' : 'text-yellow-400'}`}>{overall}</span>
                        </td>
                        <td className="py-1 px-1 text-center font-mono"><StatValue value={b.meet||0} label="ミート" /></td>
                        <td className="py-1 px-1 text-center font-mono"><StatValue value={b.power||0} label="パワー" /></td>
                        <td className="py-1 px-1 text-center font-mono"><StatValue value={ph.speed||0} label="走力" /></td>
                        <td className="py-1 px-1 text-center font-mono"><StatValue value={f.defense||0} label="守備" /></td>
                        <td className="py-1 px-1 text-center font-mono"><StatValue value={p.velocity||0} label="球速" isVelocity={true} /></td>
                        <td className="py-1 px-1 text-center font-mono"><StatValue value={p.control||0} label="制球" /></td>
                        <td className="py-1 px-1 text-center font-mono"><StatValue value={p.stamina||0} label="スタミナ" isStamina={true} /></td>
                        <td className="py-1 px-2 text-center">
                          <div className="flex gap-1 justify-center">
                            {Object.entries(DISPATCH_DESTINATIONS).map(([destKey, dest]) => {
                              const { eligible, reason } = checkDispatchEligibility(player, destKey);
                              return (
                                <button
                                  key={destKey}
                                  onClick={() => eligible && setDispatchConfirm({ playerId: player.id, destKey })}
                                  disabled={!eligible}
                                  title={eligible ? `${dest.name}に派遣` : reason}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition ${
                                    eligible
                                      ? 'bg-orange-600 hover:bg-orange-700 text-white cursor-pointer'
                                      : 'bg-gray-700 text-gray-600 cursor-not-allowed'
                                  }`}
                                >
                                  {dest.icon}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="text-center mt-3">
              <button
                onClick={() => setCampTab('training')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2 rounded-lg font-bold text-sm transition"
              >
                練習に戻る
              </button>
            </div>
          </div>
        )}

        {campTab === 'training' && viewMode === 'select' && (
          <>
            {/* プリセット / 個別切替 */}
            <div className="flex items-center gap-2 mb-2">
              <div className="flex gap-1">
                <button
                  onClick={() => setSettingMode('preset')}
                  className={`px-3 py-1 text-xs rounded-md font-bold transition ${settingMode === 'preset' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                >
                  プリセット
                </button>
                <button
                  onClick={() => setSettingMode('individual')}
                  className={`px-3 py-1 text-xs rounded-md font-bold transition ${settingMode === 'individual' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                >
                  個別設定
                </button>
              </div>
            </div>

            {/* プリセット選択UI */}
            {settingMode === 'preset' && (
              <div className="grid grid-cols-4 gap-1.5 mb-2">
                {Object.entries(CAMP_PRESETS).map(([key, preset]) => (
                  <button
                    key={key}
                    onClick={() => applyPreset(key)}
                    className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-blue-500 rounded-lg p-2 text-left transition group"
                  >
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="text-sm">{preset.icon}</span>
                      <span className="text-xs font-bold text-white group-hover:text-blue-300">{preset.name}</span>
                    </div>
                    <div className="text-[10px] text-gray-500 mb-0.5">{preset.desc}</div>
                    <div className="text-[10px] text-green-400/70">効果: {preset.effect}</div>
                  </button>
                ))}
              </div>
            )}

            {/* 個別設定時の一括ボタン */}
            {settingMode === 'individual' && (
              <div className="bg-gray-800 rounded-lg p-2 mb-2 flex items-center flex-wrap gap-1">
                <span className="text-gray-500 text-xs mr-1">一括:</span>
                {Object.entries(TRAINING_MENUS).filter(([k]) => !['newpitch'].includes(k)).map(([key, menu]) => (
                  <button
                    key={key}
                    onClick={() => {
                      const updated = {};
                      userTeam?.players?.forEach(p => {
                        const menus = TRAINING_MENUS;
                        updated[p.id] = menus[key] ? key : (assignments[p.id] || (isPitcher(p) ? 'stamina' : 'batting'));
                      });
                      setAssignments(updated);
                    }}
                    className="px-2 py-0.5 text-[11px] rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition"
                  >
                    {menu.icon} {menu.name}
                  </button>
                ))}
              </div>
            )}

            {/* 選手テーブル */}
            <div className="bg-gray-800 rounded-lg overflow-hidden overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-700/80 text-gray-400 text-[10px]">
                    <th className="py-1.5 px-2 text-left w-20">選手</th>
                    <th className="py-1.5 px-1 text-center w-7">位</th>
                    <th className="py-1.5 px-1 text-center w-6">齢</th>
                    <th className="py-1.5 px-1 text-center w-7">ミ</th>
                    <th className="py-1.5 px-1 text-center w-7">パ</th>
                    <th className="py-1.5 px-1 text-center w-7">走</th>
                    <th className="py-1.5 px-1 text-center w-7">肩</th>
                    <th className="py-1.5 px-1 text-center w-7">守</th>
                    <th className="py-1.5 px-1 text-center w-7">眼</th>
                    <th className="py-1.5 px-1 text-center w-9">速</th>
                    <th className="py-1.5 px-1 text-center w-7">制</th>
                    <th className="py-1.5 px-1 text-center w-9">ス</th>
                    <th className="py-1.5 px-2 text-left">変化球</th>
                    {/* サブポジション適性 */}
                    {subPosHeaders.map(pos => (
                      <th key={pos} className="py-1.5 px-0.5 text-center w-6" title={POSITION_NAMES[pos]}>{subPosShort[pos]}</th>
                    ))}
                    <th className="py-1.5 px-2 text-left w-28">メイン</th>
                    <th className="py-1.5 px-2 text-left w-28">サブ</th>
                  </tr>
                </thead>
                <tbody>
                  {activePlayers.map(player => {
                    const b = player.batting || {};
                    const p = player.pitching || {};
                    const ph = player.physical || {};
                    const f = player.fielding || {};
                    const pf = player.positionFitness || {};
                    const currentTraining = assignments[player.id] || (isPitcher(player) ? 'stamina' : 'batting');
                    const showNewPitchSelect = currentTraining === 'newpitch';
                    const availableNewPitches = getAvailableNewPitches(player);

                    return (
                      <tr key={player.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                        <td className="py-1 px-2">
                          <span className={`font-bold text-xs ${isPitcher(player) ? 'text-red-400' : 'text-blue-300'}`}>
                            {player.name}
                          </span>
                        </td>
                        <td className="py-1 px-1 text-center">
                          <span className="text-[10px] text-gray-500">{POSITION_NAMES[player.position] || player.position}</span>
                        </td>
                        <td className="py-1 px-1 text-center text-gray-500 text-[10px]">{player.age || 20}</td>
                        <td className="py-1 px-1 text-center font-mono"><StatValue value={b.meet||0} label="ミート" /></td>
                        <td className="py-1 px-1 text-center font-mono"><StatValue value={b.power||0} label="パワー" /></td>
                        <td className="py-1 px-1 text-center font-mono"><StatValue value={ph.speed||0} label="走力" /></td>
                        <td className="py-1 px-1 text-center font-mono"><StatValue value={ph.arm||0} label="肩力" /></td>
                        <td className="py-1 px-1 text-center font-mono"><StatValue value={f.defense||0} label="守備" /></td>
                        <td className="py-1 px-1 text-center font-mono"><StatValue value={b.eye||0} label="選球眼" /></td>
                        <td className="py-1 px-1 text-center font-mono"><StatValue value={p.velocity||0} label="球速" isVelocity={true} /></td>
                        <td className="py-1 px-1 text-center font-mono"><StatValue value={p.control||0} label="制球" /></td>
                        <td className="py-1 px-1 text-center font-mono"><StatValue value={p.stamina||0} label="スタミナ" isStamina={true} /></td>
                        <td className="py-1 px-2 text-yellow-400 text-[10px] font-mono truncate max-w-[100px]">{getArsenalDisplay(player)}</td>
                        {/* サブポジション適性 */}
                        {subPosHeaders.map(pos => (
                          <td key={pos} className="py-1 px-0.5 text-center font-mono">
                            {pos === player.position
                              ? <span className="text-white text-[10px] font-bold">主</span>
                              : <FitnessValue value={pf[pos]} />
                            }
                          </td>
                        ))}
                        <td className="py-1 px-2">
                          <div className="flex items-center gap-1">
                            <select
                              value={currentTraining}
                              onChange={(e) => setAssignments(prev => ({ ...prev, [player.id]: e.target.value }))}
                              className="bg-gray-700 text-white text-[11px] px-1.5 py-0.5 rounded w-24"
                            >
                              {Object.entries(TRAINING_MENUS)
                                .filter(([key]) => key !== 'newpitch' || isPitcher(player))
                                .map(([key, menu]) => (
                                <option key={key} value={key}>{menu.icon} {menu.name}</option>
                              ))}
                            </select>
                            {showNewPitchSelect && availableNewPitches.length > 0 && (
                              <select
                                value={newPitchSelections[player.id] || availableNewPitches[0]}
                                onChange={(e) => setNewPitchSelections(prev => ({ ...prev, [player.id]: e.target.value }))}
                                className="bg-gray-600 text-white text-[11px] px-1.5 py-0.5 rounded w-20"
                              >
                                {availableNewPitches.map(pt => (
                                  <option key={pt} value={pt}>{getPitchTypeName(pt)}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        </td>
                        <td className="py-1 px-2">
                          <div className="flex items-center gap-1">
                            <select
                              value={subAssignments[player.id] || 'running'}
                              onChange={(e) => setSubAssignments(prev => ({ ...prev, [player.id]: e.target.value }))}
                              className="bg-gray-700 text-white text-[11px] px-1.5 py-0.5 rounded w-24"
                            >
                              {Object.entries(SUB_TRAINING_MENUS).map(([key, menu]) => (
                                <option key={key} value={key}>{menu.icon} {menu.name}</option>
                              ))}
                            </select>
                            {(subAssignments[player.id] || 'running') === 'subposition' && (
                              <select
                                value={subPositionSelections[player.id] || ''}
                                onChange={(e) => setSubPositionSelections(prev => ({ ...prev, [player.id]: e.target.value }))}
                                className="bg-gray-600 text-white text-[11px] px-1 py-0.5 rounded w-14"
                              >
                                <option value="">自動</option>
                                {['catcher','first','second','third','short','left','center','right']
                                  .filter(pos => pos !== player.position)
                                  .map(pos => <option key={pos} value={pos}>{POSITION_NAMES[pos]}</option>)}
                              </select>
                            )}
                            {(subAssignments[player.id] || 'running') === 'form_change' && player.position === 'pitcher' && (
                              <select
                                value={formSelections[player.id] || ''}
                                onChange={(e) => setFormSelections(prev => ({ ...prev, [player.id]: e.target.value }))}
                                className="bg-gray-600 text-white text-[11px] px-1 py-0.5 rounded w-20"
                              >
                                <option value="">自動</option>
                                {[['overhand','オーバー'],['threeQuarter','スリクォ'],['sidearm','サイド'],['submarine','アンダー']]
                                  .filter(([k]) => k !== player.pitching?.form)
                                  .map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                              </select>
                            )}
                            {(subAssignments[player.id] || 'running') === 'switch_hit' && (
                              <select
                                value={batsSelections[player.id] || ''}
                                onChange={(e) => setBatsSelections(prev => ({ ...prev, [player.id]: e.target.value }))}
                                className="bg-gray-600 text-white text-[11px] px-1 py-0.5 rounded w-14"
                              >
                                <option value="">自動</option>
                                {[['right','右打'],['left','左打'],['switch','両打']]
                                  .filter(([k]) => k !== (player.batting?.bats || player.physical?.bats))
                                  .map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                              </select>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="text-center mt-3">
              <button
                onClick={handleExecuteTraining}
                className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-2.5 rounded-lg font-bold text-base transition shadow"
              >
                第{currentRound}クール練習を実行
              </button>
            </div>
          </>
        )}

        {campTab === 'training' && viewMode === 'results' && (
          <>
            {/* 練習結果 */}
            <div className="bg-gray-800 rounded-lg overflow-hidden mb-3">
              <div className="px-3 py-2 bg-gray-700/80 border-b border-gray-600">
                <h2 className="text-sm font-bold text-white">第{currentRound}クール 練習結果</h2>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-700/50 text-gray-400 text-[10px]">
                    <th className="py-1 px-2 text-left w-20">選手</th>
                    <th className="py-1 px-2 text-left w-24">メイン</th>
                    <th className="py-1 px-2 text-left">メイン結果</th>
                    <th className="py-1 px-2 text-left">サブ結果</th>
                  </tr>
                </thead>
                <tbody>
                  {roundResults?.map((result, idx) => (
                    <tr key={idx} className="border-b border-gray-700/50">
                      <td className="py-1 px-2">
                        <span className={`font-bold ${isPitcher(result.player) ? 'text-red-400' : 'text-blue-300'}`}>
                          {result.player.name}
                        </span>
                      </td>
                      <td className="py-1 px-2 text-gray-500 text-[10px]">
                        {TRAINING_MENUS[result.trainingType]?.icon} {TRAINING_MENUS[result.trainingType]?.name}
                      </td>
                      <td className="py-1 px-2">
                        <div className="flex flex-wrap gap-0.5">
                          {result.growthReport.map((growth, gIdx) => (
                            <span
                              key={gIdx}
                              className={`px-1.5 py-0 rounded text-[10px] leading-relaxed ${
                                growth.isAwakening
                                  ? 'bg-yellow-500 text-black font-bold'
                                  : growth.growth > 0
                                    ? 'bg-green-700/80 text-green-100'
                                    : 'bg-gray-600/50 text-gray-400'
                              }`}
                            >
                              {growth.statName}: {growth.before}→{growth.after}
                              {growth.growth > 0 && ` +${growth.growth}`}
                              {growth.isAwakening && ' 覚醒!'}
                            </span>
                          ))}
                          {result.growthReport.length === 0 && (
                            <span className="text-gray-600 text-[10px]">変化なし</span>
                          )}
                        </div>
                      </td>
                      <td className="py-1 px-2">
                        <div className="flex flex-wrap gap-0.5">
                          {(result.subGrowthReport || []).map((growth, gIdx) => (
                            <span
                              key={gIdx}
                              className={`px-1.5 py-0 rounded text-[10px] leading-relaxed ${
                                growth.isAwakening
                                  ? 'bg-yellow-500 text-black font-bold'
                                  : growth.growth > 0
                                    ? 'bg-teal-700/80 text-teal-100'
                                    : growth.growth < 0
                                      ? 'bg-red-700/80 text-red-100'
                                      : 'bg-gray-600/50 text-gray-400'
                              }`}
                            >
                              {growth.statName}: {growth.before}→{growth.after}
                              {growth.growth > 0 && ` +${growth.growth}`}
                              {growth.growth < 0 && ` ${growth.growth}`}
                              {growth.isAwakening && ' 覚醒!'}
                            </span>
                          ))}
                          {(!result.subGrowthReport || result.subGrowthReport.length === 0) && (
                            <span className="text-gray-600 text-[10px]">変化なし</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="text-center">
              {currentRound < MAX_CAMP_ROUNDS ? (
                <button
                  onClick={handleNextRound}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-2.5 rounded-lg font-bold text-base transition shadow"
                >
                  次のクールへ（第{currentRound + 1}クール）
                </button>
              ) : (
                <button
                  onClick={onComplete}
                  className="bg-green-600 hover:bg-green-700 text-white px-10 py-2.5 rounded-lg font-bold text-base transition shadow"
                >
                  キャンプ終了 → シーズン開始
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CampScreen;
