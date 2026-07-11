import React, { useState } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import LineupSettingScreen from './LineupSettingScreen.jsx';

const POS_NAMES = {
  pitcher: '投', catcher: '捕', first: '一', second: '二',
  third: '三', short: '遊', left: '左', center: '中', right: '右'
};
const POS_ORDER = ['pitcher', 'catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'];
const POS_LABEL = {
  pitcher: '投手', catcher: '捕手', first: '一塁', second: '二塁',
  third: '三塁', short: '遊撃', left: '左翼', center: '中堅', right: '右翼'
};
const ACTIVE_LIMIT = 25;

// 選手のスコア（ロスター自動選択用）
const playerScore = (p) => {
  if (p.position === 'pitcher') {
    return (p.pitching?.velocity || 0) * 0.4 +
           (p.pitching?.control || 0) * 0.35 +
           (p.pitching?.stamina || 0) * 0.2 +
           (p.pitching?.arsenal?.length || 0) * 5;
  }
  return (p.batting?.meet || 0) * 0.4 +
         (p.batting?.power || 0) * 0.25 +
         (p.batting?.eye || 0) * 0.15 +
         (p.fielding?.defense || 0) * 0.15 +
         (p.physical?.speed || 0) * 0.05;
};

// 必須確保ポジション（各1名以上）
const REQUIRED_POSITIONS = ['catcher', 'short', 'second', 'third', 'first', 'left', 'center', 'right'];

// ポジションバランスを考慮した自動選択（投手40% / 野手60%、必須ポジション保証）
export const autoSelectActive = (players) => {
  players.forEach(p => { p.isActive = false; });
  const pitchers = [...players.filter(p => p.position === 'pitcher')]
    .sort((a, b) => playerScore(b) - playerScore(a));
  const fielders = [...players.filter(p => p.position !== 'pitcher')]
    .sort((a, b) => playerScore(b) - playerScore(a));
  const pitcherSlots = Math.round(ACTIVE_LIMIT * 0.4);  // 10
  const fielderSlots = ACTIVE_LIMIT - pitcherSlots;      // 15

  const activated = new Set();
  for (const pos of REQUIRED_POSITIONS) {
    if (activated.size >= fielderSlots) break;
    const best = fielders.find(p => p.position === pos && !activated.has(p.id));
    if (best) { best.isActive = true; activated.add(best.id); }
  }
  for (const p of fielders) {
    if (activated.size >= fielderSlots) break;
    if (!activated.has(p.id)) { p.isActive = true; activated.add(p.id); }
  }
  pitchers.slice(0, pitcherSlots).forEach(p => { p.isActive = true; });
};

// 能力値セル（ラベル上・値下の縦2行）
const Stat = ({ label, value, low, high }) => {
  const color = value >= high ? 'text-green-400 font-bold'
    : value >= low ? 'text-yellow-300'
    : 'text-gray-500';
  return (
    <span className="flex flex-col items-center w-8 flex-shrink-0">
      <span className="text-[8px] text-gray-400 leading-none">{label}</span>
      <span className={`text-xs leading-none mt-0.5 ${color}`}>{value}</span>
    </span>
  );
};

// --- PlayerCard コンポーネント ---
const PlayerCard = ({ player, isActive, canActivate, isStarter, onClick }) => {
  const isPitcher = player.position === 'pitcher';
  const grade = player.universityYear ? `${player.universityYear}年` : `${player.age}歳`;
  const blocked = isActive ? isStarter : !canActivate;
  const tooltip = isActive
    ? (isStarter ? 'スタメン出場中のため変更不可' : 'ベンチ外に移動')
    : (canActivate ? '登録選手に追加' : `登録枠満員（${ACTIVE_LIMIT}名）`);

  return (
    <div
      title={tooltip}
      onClick={blocked ? undefined : onClick}
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded border text-xs select-none transition-colors
        ${blocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
        ${isActive
          ? 'bg-gray-800 border-gray-600 ' + (blocked ? '' : 'hover:bg-red-950/60')
          : 'bg-gray-900 border-gray-700 ' + (blocked ? '' : 'hover:bg-green-950/60')}
        ${isStarter ? 'border-yellow-600/40' : ''}`}
    >
      {/* ポジションバッジ */}
      <span className={`w-5 h-5 flex-shrink-0 flex items-center justify-center rounded text-xs font-bold ${
        player.position === 'pitcher' ? 'bg-red-700 text-red-100' :
        player.position === 'catcher' ? 'bg-cyan-700 text-cyan-100' :
        ['first','second','third','short'].includes(player.position) ? 'bg-yellow-600 text-yellow-100' :
        'bg-green-700 text-green-100'
      }`}>
        {POS_NAMES[player.position] || '?'}
      </span>

      {/* 名前 */}
      <span className={`w-20 flex-shrink-0 font-medium truncate ${isStarter ? 'text-yellow-300' : 'text-white'}`}>
        {player.name}
      </span>

      {/* 学年/年齢 */}
      <span className="text-gray-500 w-6 text-center flex-shrink-0 text-xs">{grade}</span>

      {/* 先発バッジ */}
      {isStarter && <span className="text-xs text-yellow-500 flex-shrink-0 bg-yellow-950/60 px-1 rounded">先発</span>}

      {/* 能力値 */}
      <div className="flex items-center flex-1 justify-end">
        {isPitcher ? (
          <>
            <Stat label="球速" value={player.pitching?.velocity || 0} low={130} high={145} />
            <Stat label="制球" value={player.pitching?.control || 0} low={40} high={58} />
            <Stat label="スタ" value={player.pitching?.stamina || 0} low={40} high={60} />
            <span className="flex flex-col items-center w-8 flex-shrink-0">
              <span className="text-[8px] text-gray-400 leading-none">変化球</span>
              <span className="text-xs text-gray-300 leading-none mt-0.5">{player.pitching?.arsenal?.length || 0}種</span>
            </span>
          </>
        ) : (
          <>
            <Stat label="ミート" value={player.batting?.meet || 0} low={35} high={52} />
            <Stat label="パワー" value={player.batting?.power || 0} low={25} high={42} />
            <Stat label="足" value={player.physical?.speed || 0} low={30} high={48} />
            <Stat label="肩" value={player.physical?.arm || 0} low={30} high={48} />
            <Stat label="守" value={player.fielding?.defense || 0} low={35} high={52} />
          </>
        )}
      </div>

      {/* 切替矢印 */}
      <span className={`flex-shrink-0 font-bold text-xs ml-1
        ${blocked ? 'text-gray-600' : isActive ? 'text-red-400' : 'text-green-400'}`}>
        {isActive ? '▶' : '◀'}
      </span>
    </div>
  );
};

// --- ポジション別フッター統計 ---
const PosStats = ({ activePlayers }) => {
  const stats = [
    { label: '投手', count: activePlayers.filter(p => p.position === 'pitcher').length },
    { label: '捕手', count: activePlayers.filter(p => p.position === 'catcher').length },
    { label: '内野', count: activePlayers.filter(p => ['first','second','third','short'].includes(p.position)).length },
    { label: '外野', count: activePlayers.filter(p => ['left','center','right'].includes(p.position)).length },
  ];
  return (
    <div className="mt-3 grid grid-cols-4 gap-2 text-xs text-center">
      {stats.map(({ label, count }) => (
        <div key={label} className="bg-gray-800/60 rounded p-2">
          <div className="text-gray-400">{label}</div>
          <div className="text-white font-bold text-base">{count}</div>
        </div>
      ))}
    </div>
  );
};

// --- メイン RosterScreen ---
const RosterScreen = ({ seasonData, gameMode }) => {
  const [tick, setTick] = useState(0);
  const [activeTab, setActiveTab] = useState('roster');
  const [sortMode, setSortMode] = useState('position');
  const refresh = () => setTick(v => v + 1);

  const userTeamName = seasonData?.userTeamName || Object.keys(TEAMS_DATA || {})[0];
  const team = TEAMS_DATA[userTeamName];

  if (!team) {
    return <div className="p-8 text-white">チームデータが見つかりません。</div>;
  }

  const isUniversityMode = gameMode === 'university';
  const players = team.players || [];
  const lineup = team.lineupSettings?.battingOrder || [];

  // isActive 未初期化なら自動選択、一部だけundefinedならfalse(ベンチ外)に正規化
  if (isUniversityMode && players.length > 0) {
    if (players.every(p => p.isActive === undefined)) {
      autoSelectActive(players);
    } else {
      players.forEach(p => { if (p.isActive === undefined) p.isActive = false; });
    }
  }

  const starterIds = new Set(
    lineup.filter(e => e.battingOrder >= 1 && e.battingOrder <= 9).map(e => e.playerId)
  );

  const activePlayers = isUniversityMode ? players.filter(p => p.isActive) : players;
  const inactivePlayers = isUniversityMode ? players.filter(p => !p.isActive) : [];
  const isFull = activePlayers.length >= ACTIVE_LIMIT;

  const handleActivate = (player) => {
    if (isFull) return;
    player.isActive = true;
    refresh();
  };

  const handleDeactivate = (player) => {
    if (starterIds.has(player.id)) return;
    player.isActive = false;
    refresh();
  };

  const handleAutoSelect = () => {
    autoSelectActive(players);
    players.filter(p => starterIds.has(p.id)).forEach(p => { p.isActive = true; });
    refresh();
  };

  const sortAndGroup = (arr) => {
    if (sortMode === 'score') {
      return [{ pos: null, players: [...arr].sort((a, b) => playerScore(b) - playerScore(a)) }];
    }
    if (sortMode === 'year') {
      return [{ pos: null, players: [...arr].sort((a, b) =>
        (b.universityYear || 0) - (a.universityYear || 0) || playerScore(b) - playerScore(a)
      ) }];
    }
    // position
    const map = {};
    for (const p of arr) {
      const pos = p.position || 'other';
      if (!map[pos]) map[pos] = [];
      map[pos].push(p);
    }
    return POS_ORDER.filter(pos => map[pos]?.length > 0).map(pos => ({ pos, players: map[pos] }));
  };

  const activeGroups = sortAndGroup(activePlayers);
  const inactiveGroups = sortAndGroup(inactivePlayers);

  if (!isUniversityMode) {
    return (
      <div className="p-4 max-w-7xl mx-auto">
        <h1 className="text-xl font-bold text-white mb-4">スタメン・ロスター管理</h1>
        <LineupSettingScreen teamName={userTeamName} onBack={null} />
      </div>
    );
  }

  return (
    <div className="p-4 max-w-7xl mx-auto">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-white">ロスター・スタメン管理</h1>
          <p className="text-xs text-gray-400 mt-0.5">大学野球 公式試合ベンチ登録枠：最大 {ACTIVE_LIMIT} 名</p>
        </div>
        {activeTab === 'roster' && (
          <div className="flex items-center gap-3">
            <div className={`text-sm font-bold px-3 py-1 rounded border
              ${isFull ? 'border-red-500 text-red-400 bg-red-950/40' : 'border-green-600 text-green-400 bg-green-950/30'}`}>
              登録 {activePlayers.length} / {ACTIVE_LIMIT} 名
            </div>
            <button
              onClick={handleAutoSelect}
              className="bg-blue-700 hover:bg-blue-600 text-white text-xs px-3 py-1.5 rounded transition-colors"
            >
              AI自動選択
            </button>
          </div>
        )}
      </div>

      {/* タブ切り替え */}
      <div className="flex gap-1 bg-gray-800/60 rounded-xl p-1 border border-gray-700/50 mb-4">
        <button
          onClick={() => setActiveTab('roster')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'roster' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/60'
          }`}
        >
          📋 ベンチ登録（{activePlayers.length}/{ACTIVE_LIMIT}）
        </button>
        <button
          onClick={() => setActiveTab('lineup')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'lineup' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/60'
          }`}
        >
          ⚾ スタメン設定
        </button>
      </div>

      {/* スタメン設定タブ */}
      {activeTab === 'lineup' && (
        <LineupSettingScreen teamName={userTeamName} onBack={null} />
      )}

      {/* ベンチ登録タブ */}
      {activeTab === 'roster' && (
        <>
          {/* 説明 + 並替 */}
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-gray-800/70 rounded px-3 py-2 text-xs text-gray-400 flex-1">
              選手をクリックして<span className="text-white font-medium">登録選手 ↔ ベンチ外</span>を切り替えます。
              <span className="text-yellow-400 ml-2">先発</span>表示中は変更不可。
              <span className="ml-3 text-green-400">■</span><span className="ml-0.5">高値</span>
              <span className="ml-2 text-yellow-300">■</span><span className="ml-0.5">平均</span>
              <span className="ml-2 text-gray-500">■</span><span className="ml-0.5">低値</span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 bg-gray-800/70 rounded px-2 py-1.5">
              <span className="text-xs text-gray-500 mr-1">並替:</span>
              {[
                { key: 'position', label: 'ポジション' },
                { key: 'score',    label: 'スコア順' },
                { key: 'year',     label: '学年順' },
              ].map(s => (
                <button key={s.key} onClick={() => setSortMode(s.key)}
                  className={`text-xs px-2 py-0.5 rounded transition-colors ${sortMode === s.key ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* 2パネル */}
          <div className="grid grid-cols-2 gap-4">
            {/* 登録選手 */}
            <div className="bg-gray-800/80 rounded-lg p-3 border border-gray-700/40">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold text-white">
                  登録選手
                  <span className={`ml-1.5 ${isFull ? 'text-red-400' : 'text-gray-400'}`}>
                    ({activePlayers.length}/{ACTIVE_LIMIT})
                  </span>
                </h2>
                {isFull && <span className="text-xs text-red-400 font-bold">満員</span>}
              </div>

              <div className="overflow-y-auto space-y-2.5 max-h-[680px] pr-0.5">
                {activeGroups.length === 0
                  ? <p className="text-gray-500 text-xs text-center py-8">登録選手なし</p>
                  : activeGroups.map(({ pos, players: ps }, i) => (
                    <div key={pos || i}>
                      {pos && (
                        <div className="text-xs font-bold text-gray-500 tracking-wider mb-0.5 px-1">
                          {POS_LABEL[pos] || pos}（{ps.length}）
                        </div>
                      )}
                      <div className="space-y-0.5">
                        {ps.map(p => (
                          <PlayerCard key={p.id} player={p} isActive={true}
                            canActivate={true} isStarter={starterIds.has(p.id)}
                            onClick={() => handleDeactivate(p)} />
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* ベンチ外 */}
            <div className="bg-gray-800/80 rounded-lg p-3 border border-gray-700/40">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold text-white">
                  ベンチ外
                  <span className="ml-1.5 text-gray-400">({inactivePlayers.length}名)</span>
                </h2>
                {isFull && <span className="text-xs text-gray-500">枠が満員のため追加不可</span>}
              </div>

              <div className="overflow-y-auto space-y-2.5 max-h-[680px] pr-0.5">
                {inactiveGroups.length === 0
                  ? <p className="text-gray-500 text-xs text-center py-8">
                      {players.length <= ACTIVE_LIMIT ? '全員が登録済み' : 'ベンチ外なし'}
                    </p>
                  : inactiveGroups.map(({ pos, players: ps }, i) => (
                    <div key={pos || i}>
                      {pos && (
                        <div className="text-xs font-bold text-gray-500 tracking-wider mb-0.5 px-1">
                          {POS_LABEL[pos] || pos}（{ps.length}）
                        </div>
                      )}
                      <div className="space-y-0.5">
                        {ps.map(p => (
                          <PlayerCard key={p.id} player={p} isActive={false}
                            canActivate={!isFull} isStarter={false}
                            onClick={() => handleActivate(p)} />
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          <PosStats activePlayers={activePlayers} />
        </>
      )}
    </div>
  );
};

export default RosterScreen;
