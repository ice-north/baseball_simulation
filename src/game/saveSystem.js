import { compressData, decompressData, getLocalStorageUsage } from '../utils/compression.js';
import { TEAMS_DATA } from '../teams-data.js';

export const SAVE_SLOT_KEYS = ['baseballSim_save_1', 'baseballSim_save_2', 'baseballSim_save_3'];

// セーブスロット情報を読み取り
export const readSaveSlots = () => {
  return SAVE_SLOT_KEYS.map(key => {
    try {
      const savedData = localStorage.getItem(key);
      if (!savedData) return null;
      const data = decompressData(savedData);
      if (!data) return null;
      return {
        timestamp: data.timestamp,
        year: data.seasonData?.year || 1,
        date: data.seasonData?.currentDate || { month: 4, day: 1 },
        phase: data.seasonData?.phase || 'regular_season',
        version: data.version || 'unknown'
      };
    } catch { return null; }
  });
};

// 旧データ移行チェック
export const migrateOldSaveData = () => {
  const oldData = localStorage.getItem('baseballSim_saveData');
  if (oldData && !localStorage.getItem(SAVE_SLOT_KEYS[0])) {
    localStorage.setItem(SAVE_SLOT_KEYS[0], oldData);
    localStorage.removeItem('baseballSim_saveData');
    return true;
  }
  return false;
};

// ゲームデータを保存（スロット指定、圧縮対応）
export const saveGameToSlot = (slotIndex, gameState) => {
  try {
    const saveData = {
      version: '2.11.0',
      timestamp: new Date().toISOString(),
      slotIndex,
      seasonData: gameState.seasonData,
      leagueConfig: gameState.leagueConfig,
      teamsData: JSON.parse(JSON.stringify(TEAMS_DATA)),
      screenMode: gameState.screenMode,
      managementView: gameState.managementView,
      gameFlowState: gameState.gameFlowState,
      gameMode: gameState.gameMode,
      selectedMonth: gameState.selectedMonth,
      hallOfFamePlayers: gameState.hallOfFamePlayers,
      teamHistory: gameState.teamHistory
    };

    const compressed = compressData(saveData);
    localStorage.setItem(SAVE_SLOT_KEYS[slotIndex], compressed);
    return true;
  } catch (error) {
    console.error('セーブ失敗:', error);
    if (error.name === 'QuotaExceededError') {
      const usage = getLocalStorageUsage();
      console.error(`ストレージ容量超過: ${(usage.used / 1024).toFixed(1)}KB / ${(usage.total / 1024).toFixed(1)}KB`);
      alert('セーブデータの容量が限界を超えました。古いセーブデータを削除してください。');
    }
    return false;
  }
};

// ゲームデータを読み込み（スロット指定、圧縮対応）
export const loadGameFromSlot = (slotIndex) => {
  try {
    const savedData = localStorage.getItem(SAVE_SLOT_KEYS[slotIndex]);
    if (!savedData) {
      console.warn('セーブデータがありません');
      return null;
    }

    const saveData = decompressData(savedData);
    if (!saveData) {
      console.error('セーブデータの解凍に失敗しました');
      return null;
    }

    // TEAMS_DATAを復元
    if (saveData.teamsData) {
      Object.keys(TEAMS_DATA).forEach(k => delete TEAMS_DATA[k]);
      Object.keys(saveData.teamsData).forEach(teamName => {
        TEAMS_DATA[teamName] = saveData.teamsData[teamName];
      });
    }

    return saveData;
  } catch (error) {
    console.error('ロード失敗:', error);
    return null;
  }
};

// セーブデータを削除（スロット指定）
export const deleteSaveSlot = (slotIndex) => {
  try {
    localStorage.removeItem(SAVE_SLOT_KEYS[slotIndex]);
    return true;
  } catch (error) {
    console.error('削除失敗:', error);
    return false;
  }
};

// チームエクスポート（JSON形式でダウンロード）
export const exportTeam = (teamName) => {
  const team = TEAMS_DATA[teamName];
  if (!team) return;
  const exportData = {
    version: '2.0',
    exportDate: new Date().toISOString(),
    teamName: teamName,
    team: JSON.parse(JSON.stringify(team))
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `team_${teamName.replace(/[^a-zA-Z0-9\u3040-\u9FFF]/g, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

// チームインポート（JSONファイルから読み込み、指定チームに上書き）
export const importTeam = (targetTeamName, onComplete) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.team || !data.team.players) {
          alert('無効なチームデータです');
          return;
        }
        const maxId = Object.values(TEAMS_DATA).flatMap(t => t.players || []).reduce((max, p) => Math.max(max, p.id || 0), 0);
        data.team.players.forEach((p, i) => { p.id = maxId + i + 1; });
        TEAMS_DATA[targetTeamName] = {
          ...TEAMS_DATA[targetTeamName],
          players: data.team.players,
          lineupSettings: data.team.lineupSettings || null,
          pitchingRotation: data.team.pitchingRotation || { starters: [], middleRelievers: [], setupMen: [], closer: null, currentStarterIndex: 0, pitcherRoles: {} },
          strategy: data.team.strategy || null
        };
        if (onComplete) onComplete();
        alert(`${data.teamName || 'チーム'}のデータを${targetTeamName}にインポートしました（選手${data.team.players.length}名）`);
      } catch (err) {
        alert('ファイルの読み込みに失敗しました: ' + err.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
};
