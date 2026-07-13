import React, { useState } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { addToRoster, addManyToRoster, removeFromRosterById } from '../state/roster.js';
import { POSITION_NAMES } from '../utils/constants.js';
import { generateRandomPlayerName } from '../data/playerNames.js';
import { createSeasonStats, createCareerStats } from '../players.js';
import { importDraftedPlayers, convertDraftedPlayerToSandboxPlayer } from '../game/saveSystem.js';

/**
 * 箱庭モード用のデフォルト選手を作成
 */
function createDefaultPlayer(id, position = 'pitcher') {
  const isPitcher = position === 'pitcher';
  const name = generateRandomPlayerName();
  return {
    id,
    name,
    age: 22,
    position,
    battingOrder: 0,
    isStarter: false,
    isTwoWay: false,
    batting: {
      meet: isPitcher ? 30 : 50,
      power: isPitcher ? 25 : 50,
      eye: isPitcher ? 25 : 50,
      bats: 'right',
      steal: isPitcher ? 20 : 50
    },
    physical: {
      speed: isPitcher ? 40 : 50,
      arm: 50,
      throws: 'right',
      bodyStamina: 50,
      recovery: 50
    },
    fielding: {
      defense: isPitcher ? 40 : 50
    },
    catching: {
      lead: position === 'catcher' ? 50 : 30
    },
    pitching: {
      velocity: isPitcher ? 140 : 120,
      control: isPitcher ? 50 : 30,
      stamina: isPitcher ? 100 : 50,
      form: 'overhand',
      arsenal: isPitcher
        ? [{ id: 1, type: 'slider', level: 40 }, { id: 2, type: 'curve', level: 30 }]
        : [{ id: 1, type: 'slider', level: 10 }]
    },
    traits: [],
    positionFitness: generateDefaultFitness(position),
    professionalCareer: { isDrafted: false, draftYear: null, draftTeam: null, achievements: [] },
    fatigue: 0,
    experience: 0,
    seasonStats: {
      batting: { games: 0, atBats: 0, hits: 0, doubles: 0, triples: 0, homeruns: 0, rbis: 0, walks: 0, strikeouts: 0, stolenBases: 0 },
      pitching: { games: 0, wins: 0, losses: 0, saves: 0, holds: 0, inningsPitched: 0, runsAllowed: 0, earnedRuns: 0, hits: 0, homeruns: 0, walks: 0, strikeouts: 0, pitches: 0 }
    },
    careerStats: {
      batting: { games: 0, atBats: 0, hits: 0, doubles: 0, triples: 0, homeruns: 0, rbis: 0, walks: 0, strikeouts: 0, stolenBases: 0 },
      pitching: { games: 0, wins: 0, losses: 0, saves: 0, holds: 0, inningsPitched: 0, runsAllowed: 0, earnedRuns: 0, hits: 0, homeruns: 0, walks: 0, strikeouts: 0, pitches: 0 }
    }
  };
}

function generateDefaultFitness(position) {
  const fitness = {
    pitcher: 0, catcher: 0, first: 0, second: 0, third: 0,
    short: 0, left: 0, center: 0, right: 0
  };
  fitness[position] = 100;
  // 近いポジションに適正をつける
  if (position === 'second') { fitness.short = 40; fitness.third = 20; }
  if (position === 'short') { fitness.second = 40; fitness.third = 30; }
  if (position === 'third') { fitness.first = 30; fitness.short = 20; }
  if (position === 'first') { fitness.third = 20; }
  if (position === 'left') { fitness.center = 30; fitness.right = 30; }
  if (position === 'center') { fitness.left = 40; fitness.right = 40; }
  if (position === 'right') { fitness.left = 30; fitness.center = 30; }
  if (position === 'catcher') { fitness.first = 20; }
  return fitness;
}

const POSITIONS = ['pitcher', 'catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'];

const SandboxSetupScreen = ({ allTeams, onComplete, generateOptimalLineup, generatePitchingRotation, generateAllTeamsLineup }) => {
  const [activeTeam, setActiveTeam] = useState(allTeams[0]);
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [editFormData, setEditFormData] = useState(null);
  const [, setUpdateTrigger] = useState(0);

  const forceUpdate = () => setUpdateTrigger(prev => prev + 1);

  const team = TEAMS_DATA[activeTeam] || { name: activeTeam, players: [] };

  // 新しいIDを生成
  const getNextId = () => {
    let maxId = 0;
    Object.values(TEAMS_DATA).forEach(t => {
      (t.players || []).forEach(p => { if (p.id > maxId) maxId = p.id; });
    });
    return maxId + 1;
  };

  // 選手追加
  const addPlayer = (position) => {
    const newPlayer = createDefaultPlayer(getNextId(), position);
    addToRoster(TEAMS_DATA[activeTeam], newPlayer);
    forceUpdate();
    startEditPlayer(newPlayer);
  };

  // 選手削除
  const removePlayer = (playerId) => {
    if (removeFromRosterById(TEAMS_DATA[activeTeam], playerId)) {
      forceUpdate();
    }
  };

  // 編集開始
  const startEditPlayer = (player) => {
    setEditingPlayer(player);
    setEditFormData(JSON.parse(JSON.stringify(player)));
  };

  const cancelEdit = () => {
    setEditingPlayer(null);
    setEditFormData(null);
  };

  const updateAbility = (category, field, value) => {
    const numValue = Math.max(0, Math.min(100, parseInt(value) || 0));
    setEditFormData(prev => ({
      ...prev,
      [category]: { ...prev[category], [field]: numValue }
    }));
  };

  const savePlayerEdit = () => {
    if (!editFormData || !editingPlayer) return;
    const playerIndex = TEAMS_DATA[activeTeam].players.findIndex(p => p.id === editingPlayer.id);
    if (playerIndex !== -1) {
      TEAMS_DATA[activeTeam].players[playerIndex] = editFormData;
      setEditingPlayer(null);
      setEditFormData(null);
      forceUpdate();
    }
  };

  // ドラフト指名選手をJSONからインポートして現在のチームに追加
  const handleImportDraftedPlayers = () => {
    importDraftedPlayers((importedPlayers) => {
      if (!TEAMS_DATA[activeTeam]) return;
      let nextId = getNextId();
      const converted = importedPlayers.map(p => {
        const player = convertDraftedPlayerToSandboxPlayer(p, nextId);
        nextId += 1;
        return player;
      });
      addManyToRoster(TEAMS_DATA[activeTeam], converted);
      forceUpdate();
      alert(`${converted.length}名のドラフト指名選手を「${activeTeam}」にインポートしました`);
    });
  };

  // 全チームの選手数チェック
  const canStart = () => {
    return allTeams.every(teamName => {
      const t = TEAMS_DATA[teamName];
      return t && t.players && t.players.length >= 16;
    });
  };

  const teamColorList = ['bg-blue-600', 'bg-red-600', 'bg-green-600', 'bg-yellow-600', 'bg-purple-600', 'bg-pink-600', 'bg-indigo-600', 'bg-teal-600'];

  const pitchers = team.players.filter(p => p.position === 'pitcher');
  const fielders = team.players.filter(p => p.position !== 'pitcher');

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-orange-400">箱庭モード - チーム設定</h1>
            <p className="text-sm text-gray-400 mt-1">各チームの選手を自由に設定してください（最低16人/チーム）</p>
          </div>
          <button
            onClick={() => {
              if (!canStart()) {
                alert('全チーム最低16人の選手が必要です');
                return;
              }
              onComplete();
            }}
            disabled={!canStart()}
            className={`px-8 py-3 rounded-lg font-bold text-lg transition shadow-lg ${
              canStart()
                ? 'bg-orange-600 hover:bg-orange-700 text-white'
                : 'bg-gray-600 text-gray-400 cursor-not-allowed'
            }`}
          >
            シーズン開始 →
          </button>
        </div>

        {/* チームタブ */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {allTeams.map((teamName, idx) => {
            const t = TEAMS_DATA[teamName];
            const count = t?.players?.length || 0;
            return (
              <button
                key={teamName}
                onClick={() => setActiveTeam(teamName)}
                className={`px-4 py-2 rounded-lg font-bold transition text-sm ${
                  activeTeam === teamName
                    ? `${teamColorList[idx % teamColorList.length]} text-white`
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {teamName} ({count}人)
                {count < 16 && <span className="ml-1 text-red-300">!</span>}
              </button>
            );
          })}
        </div>

        {/* チーム操作 */}
        <div className="bg-gray-800 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-white">{team.name} - {team.players.length}人</h2>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  generateOptimalLineup(activeTeam);
                  generatePitchingRotation(activeTeam);
                  forceUpdate();
                }}
                className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded text-sm font-bold transition"
              >
                AIオーダー編成
              </button>
              <button
                onClick={() => { generateAllTeamsLineup(); forceUpdate(); }}
                className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm font-bold transition"
              >
                全チーム一括編成
              </button>
              <button
                onClick={handleImportDraftedPlayers}
                className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded text-sm font-bold transition"
                title="資料室からエクスポートしたドラフト指名選手JSONを読み込み"
              >
                📤 ドラフト指名選手をインポート
              </button>
            </div>
          </div>

          {/* 選手追加ボタン */}
          <div className="flex gap-1.5 flex-wrap mb-4">
            <span className="text-gray-400 text-xs self-center mr-1">追加:</span>
            {POSITIONS.map(pos => (
              <button
                key={pos}
                onClick={() => addPlayer(pos)}
                className="bg-gray-600 hover:bg-gray-500 text-white px-2.5 py-1 rounded text-xs font-bold transition"
              >
                + {POSITION_NAMES[pos]}
              </button>
            ))}
          </div>

          {/* 投手一覧 */}
          <div className="mb-4">
            <h3 className="text-sm font-bold text-blue-400 mb-2">投手 ({pitchers.length}人)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {pitchers.map(player => (
                <div key={player.id} className="bg-gray-700 rounded p-3 flex items-center justify-between group">
                  <div className="cursor-pointer flex-1 min-w-0" onClick={() => startEditPlayer(player)}>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm truncate">{player.name}</span>
                      <span className="text-xs text-gray-400">{player.age}歳</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {player.pitching?.velocity}km/h | 制球{player.pitching?.control} | スタ{player.pitching?.stamina}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removePlayer(player.id); }}
                    className="text-gray-500 hover:text-red-400 ml-2 opacity-0 group-hover:opacity-100 transition"
                    title="削除"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 野手一覧 */}
          <div>
            <h3 className="text-sm font-bold text-green-400 mb-2">野手 ({fielders.length}人)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {fielders.map(player => (
                <div key={player.id} className="bg-gray-700 rounded p-3 flex items-center justify-between group">
                  <div className="cursor-pointer flex-1 min-w-0" onClick={() => startEditPlayer(player)}>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm truncate">{player.name}</span>
                      <span className="text-xs text-gray-400">{POSITION_NAMES[player.position]} | {player.age}歳</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      ミ{player.batting?.meet} パ{player.batting?.power} 走{player.physical?.speed} 守{player.fielding?.defense}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removePlayer(player.id); }}
                    className="text-gray-500 hover:text-red-400 ml-2 opacity-0 group-hover:opacity-100 transition"
                    title="削除"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 選手編集モーダル */}
      {editingPlayer && editFormData && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-5 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">選手編集</h2>
              <button onClick={cancelEdit} className="text-gray-400 hover:text-white text-2xl">✕</button>
            </div>

            {/* 基本情報 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">名前</label>
                <div className="flex gap-1">
                  <input type="text" value={editFormData.name}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="flex-1 bg-gray-700 text-white px-2 py-1.5 rounded text-sm" />
                  <button
                    onClick={() => setEditFormData(prev => ({ ...prev, name: generateRandomPlayerName() }))}
                    className="bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded text-xs"
                    title="ランダム名前"
                  >
                    🎲
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">年齢</label>
                <input type="number" min="16" max="50" value={editFormData.age || 22}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, age: Math.max(16, Math.min(50, parseInt(e.target.value) || 22)) }))}
                  className="w-full bg-gray-700 text-white px-2 py-1.5 rounded text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">ポジション</label>
                <select value={editFormData.position}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, position: e.target.value }))}
                  className="w-full bg-gray-700 text-white px-2 py-1.5 rounded text-sm">
                  {POSITIONS.map(pos => (
                    <option key={pos} value={pos}>{POSITION_NAMES[pos]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">打席 / 投げ手</label>
                <div className="flex gap-1">
                  <select value={editFormData.batting?.bats || 'right'}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, batting: { ...prev.batting, bats: e.target.value } }))}
                    className="flex-1 bg-gray-700 text-white px-1 py-1.5 rounded text-xs">
                    <option value="right">右打</option>
                    <option value="left">左打</option>
                    <option value="switch">両打</option>
                  </select>
                  <select value={editFormData.physical?.throws || 'right'}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, physical: { ...prev.physical, throws: e.target.value } }))}
                    className="flex-1 bg-gray-700 text-white px-1 py-1.5 rounded text-xs">
                    <option value="right">右投</option>
                    <option value="left">左投</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 能力値 */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              {/* 打撃 */}
              <div className="bg-gray-700 rounded p-3">
                <h3 className="text-sm font-bold text-white mb-2">打撃</h3>
                {[
                  { key: 'meet', label: 'ミート' },
                  { key: 'power', label: 'パワー' },
                  { key: 'eye', label: '選球眼' },
                  { key: 'steal', label: '盗塁' }
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2 mb-1.5">
                    <label className="text-xs text-gray-300 w-14">{label}</label>
                    <input type="number" min="0" max="100" value={editFormData.batting?.[key] || 0}
                      onChange={(e) => updateAbility('batting', key, e.target.value)}
                      className="flex-1 bg-gray-600 text-white px-2 py-1 rounded text-sm" />
                  </div>
                ))}
              </div>

              {/* 身体 */}
              <div className="bg-gray-700 rounded p-3">
                <h3 className="text-sm font-bold text-white mb-2">身体</h3>
                {[
                  { key: 'speed', label: '走力' },
                  { key: 'arm', label: '肩力' },
                  { key: 'bodyStamina', label: '体力' },
                  { key: 'recovery', label: '回復' }
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2 mb-1.5">
                    <label className="text-xs text-gray-300 w-14">{label}</label>
                    <input type="number" min="0" max="100" value={editFormData.physical?.[key] || 0}
                      onChange={(e) => updateAbility('physical', key, e.target.value)}
                      className="flex-1 bg-gray-600 text-white px-2 py-1 rounded text-sm" />
                  </div>
                ))}
              </div>

              {/* 守備・捕手 */}
              <div className="bg-gray-700 rounded p-3">
                <h3 className="text-sm font-bold text-white mb-2">守備</h3>
                <div className="flex items-center gap-2 mb-1.5">
                  <label className="text-xs text-gray-300 w-14">守備力</label>
                  <input type="number" min="0" max="100" value={editFormData.fielding?.defense || 0}
                    onChange={(e) => updateAbility('fielding', 'defense', e.target.value)}
                    className="flex-1 bg-gray-600 text-white px-2 py-1 rounded text-sm" />
                </div>
                <div className="flex items-center gap-2 mb-1.5">
                  <label className="text-xs text-gray-300 w-14">Cリード</label>
                  <input type="number" min="0" max="100" value={editFormData.catching?.lead || 0}
                    onChange={(e) => updateAbility('catching', 'lead', e.target.value)}
                    className="flex-1 bg-gray-600 text-white px-2 py-1 rounded text-sm" />
                </div>
              </div>
            </div>

            {/* 投手能力 */}
            <div className="bg-gray-700 rounded p-3 mb-4">
              <h3 className="text-sm font-bold text-white mb-2">投球</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-300 w-10">球速</label>
                  <input type="number" min="80" max="170" value={editFormData.pitching?.velocity || 120}
                    onChange={(e) => {
                      const v = Math.max(80, Math.min(170, parseInt(e.target.value) || 120));
                      setEditFormData(prev => ({ ...prev, pitching: { ...prev.pitching, velocity: v } }));
                    }}
                    className="flex-1 bg-gray-600 text-white px-2 py-1 rounded text-sm" />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-300 w-10">制球</label>
                  <input type="number" min="0" max="100" value={editFormData.pitching?.control || 0}
                    onChange={(e) => updateAbility('pitching', 'control', e.target.value)}
                    className="flex-1 bg-gray-600 text-white px-2 py-1 rounded text-sm" />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-300 w-14">スタミナ</label>
                  <input type="number" min="0" max="200" value={editFormData.pitching?.stamina || 0}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(200, parseInt(e.target.value) || 0));
                      setEditFormData(prev => ({ ...prev, pitching: { ...prev.pitching, stamina: v } }));
                    }}
                    className="flex-1 bg-gray-600 text-white px-2 py-1 rounded text-sm" />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-300 w-14">フォーム</label>
                  <select value={editFormData.pitching?.form || 'overhand'}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, pitching: { ...prev.pitching, form: e.target.value } }))}
                    className="flex-1 bg-gray-600 text-white px-1 py-1 rounded text-xs">
                    <option value="overhand">オーバー</option>
                    <option value="threeQuarter">スリークォーター</option>
                    <option value="sidearm">サイド</option>
                    <option value="submarine">アンダー</option>
                  </select>
                </div>
              </div>

              {/* 変化球 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {[1, 2, 3].map(num => {
                  const ballKey = `breaking${num}`;
                  const ballData = editFormData.pitching?.[ballKey] || { type: 'slider', level: 0 };
                  return (
                    <div key={num} className="flex gap-2 items-center bg-gray-600 p-2 rounded">
                      <select value={ballData.type || 'slider'}
                        onChange={(e) => setEditFormData(prev => ({
                          ...prev, pitching: { ...prev.pitching, [ballKey]: { ...ballData, type: e.target.value } }
                        }))}
                        className="flex-1 bg-gray-700 text-white px-1 py-1 rounded text-xs">
                        <option value="slider">スライダー</option>
                        <option value="curve">カーブ</option>
                        <option value="fork">フォーク</option>
                        <option value="sinker">シンカー</option>
                        <option value="cutter">カッター</option>
                        <option value="changeup">チェンジアップ</option>
                        <option value="shoot">シュート</option>
                        <option value="slurve">スラーブ</option>
                        <option value="screwball">スクリューボール</option>
                        <option value="sweeper">スイーパー</option>
                      </select>
                      <input type="number" min="0" max="100" value={ballData.level || 0}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                          setEditFormData(prev => ({
                            ...prev, pitching: { ...prev.pitching, [ballKey]: { ...ballData, level: v } }
                          }));
                        }}
                        className="w-14 bg-gray-700 text-white px-1 py-1 rounded text-xs text-center" />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 守備位置適正 */}
            <div className="bg-gray-700 rounded p-3 mb-4">
              <h3 className="text-sm font-bold text-white mb-2">守備位置適正 (0-100)</h3>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                {POSITIONS.map(pos => (
                  <div key={pos} className="flex items-center gap-1">
                    <label className="text-xs text-gray-300 w-8">{POSITION_NAMES[pos].slice(0, 2)}</label>
                    <input type="number" min="0" max="100"
                      value={editFormData.positionFitness?.[pos] || 0}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                        setEditFormData(prev => ({
                          ...prev, positionFitness: { ...prev.positionFitness, [pos]: v }
                        }));
                      }}
                      className="flex-1 bg-gray-600 text-white px-1 py-1 rounded text-xs text-center" />
                  </div>
                ))}
              </div>
            </div>

            {/* ボタン */}
            <div className="flex justify-end gap-3">
              <button onClick={cancelEdit} className="px-5 py-2 bg-gray-600 text-white rounded hover:bg-gray-500 transition text-sm">キャンセル</button>
              <button onClick={savePlayerEdit} className="px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 transition text-sm font-bold">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SandboxSetupScreen;
