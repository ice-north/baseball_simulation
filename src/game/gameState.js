// ============================================================
// ゲーム状態管理 - gameState.js
// 試合状態の初期化とヘルパー関数
// ============================================================

/**
 * 攻撃チームを取得
 * @param {boolean} isTopInning - 表の攻撃かどうか
 * @param {Object} homeTeam - ホームチーム
 * @param {Object} awayTeam - アウェイチーム
 * @returns {Object} 攻撃チーム
 */
export const getOffenseTeam = (isTopInning, homeTeam, awayTeam) => {
  return isTopInning ? awayTeam : homeTeam;
};

/**
 * 守備チームを取得
 * @param {boolean} isTopInning - 表の攻撃かどうか
 * @param {Object} homeTeam - ホームチーム
 * @param {Object} awayTeam - アウェイチーム
 * @returns {Object} 守備チーム
 */
export const getDefenseTeam = (isTopInning, homeTeam, awayTeam) => {
  return isTopInning ? homeTeam : awayTeam;
};

/**
 * 現在の打者を取得（攻撃チームから）
 * @param {Object} offenseTeam - 攻撃チーム
 * @returns {Object} 現在の打者
 */
export const getCurrentBatter = (offenseTeam) => {
  return offenseTeam.players.find(p => p.battingOrder === offenseTeam.currentBatterOrder) || offenseTeam.players[0];
};

/**
 * 現在の投手を取得（守備チームから）
 * @param {Object} defenseTeam - 守備チーム
 * @returns {Object} 現在の投手
 */
export const getCurrentPitcher = (defenseTeam) => {
  return defenseTeam.players.find(p => p.isStarter && p.position === 'pitcher') || defenseTeam.players[8];
};

/**
 * 現在の捕手を取得（守備チームから）
 * @param {Object} defenseTeam - 守備チーム
 * @returns {Object} 現在の捕手
 */
export const getCurrentCatcher = (defenseTeam) => {
  return defenseTeam.players.find(p => p.isStarter && p.position === 'catcher') || defenseTeam.players[7];
};

/**
 * 打者成績を更新
 * @param {string} playerId - 選手ID
 * @param {string} teamType - チームタイプ ('home' or 'away')
 * @param {Object} statUpdates - 更新する成績
 * @param {Function} setHomeTeam - ホームチームのsetter
 * @param {Function} setAwayTeam - アウェイチームのsetter
 */
export const updateBatterStats = (playerId, teamType, statUpdates, setHomeTeam, setAwayTeam) => {
  const setTeam = teamType === 'home' ? setHomeTeam : setAwayTeam;
  setTeam(prev => ({
    ...prev,
    players: prev.players.map(p =>
      p.id === playerId
        ? {
            ...p,
            stats: { ...p.stats, batting: { ...p.stats.batting, ...statUpdates } },
            gameStats: { ...p.gameStats, ...statUpdates }
          }
        : p
    )
  }));
};

/**
 * 投手成績を更新
 * @param {string} playerId - 選手ID
 * @param {string} teamType - チームタイプ ('home' or 'away')
 * @param {Object} statUpdates - 更新する成績
 * @param {Function} setHomeTeam - ホームチームのsetter
 * @param {Function} setAwayTeam - アウェイチームのsetter
 */
export const updatePitcherStats = (playerId, teamType, statUpdates, setHomeTeam, setAwayTeam) => {
  const setTeam = teamType === 'home' ? setHomeTeam : setAwayTeam;
  setTeam(prev => ({
    ...prev,
    players: prev.players.map(p =>
      p.id === playerId
        ? { ...p, stats: { ...p.stats, pitching: { ...p.stats.pitching, ...statUpdates } } }
        : p
    )
  }));
};

// ES module exports
