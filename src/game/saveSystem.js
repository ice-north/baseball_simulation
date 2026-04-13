import { compressData, decompressData, getLocalStorageUsage } from '../utils/compression.js';
import { TEAMS_DATA } from '../teams-data.js';
import { createSeasonStats, createCareerStats } from '../players.js';

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

// ============================================================
// ドラフト指名選手のエクスポート/インポート
// （資料室 → 箱庭モードの選手設定 にデータを引き渡すための機能）
// ============================================================

// ドラフト指名選手をJSONファイルとしてエクスポート
export const exportDraftedPlayers = (draftedPlayers) => {
  if (!draftedPlayers || draftedPlayers.length === 0) {
    alert('エクスポートするドラフト指名選手がいません');
    return;
  }
  const exportData = {
    version: '1.0',
    type: 'drafted_players',
    exportDate: new Date().toISOString(),
    count: draftedPlayers.length,
    players: draftedPlayers.map(p => ({
      name: p.name,
      position: p.position,
      age: p.age,
      year: p.year,
      teamName: p.teamName,
      npbTeam: p.npbTeam,
      draftRound: p.draftRound,
      throws: p.throws,
      bats: p.bats,
      hallOfFame: p.hallOfFame || false,
      hofReason: p.hofReason || null,
      draftStats: p.draftStats ? JSON.parse(JSON.stringify(p.draftStats)) : null,
      careerStats: p.careerStats ? JSON.parse(JSON.stringify(p.careerStats)) : null,
      yearsPlayed: p.yearsPlayed
    }))
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = new Date().toISOString().slice(0, 10);
  a.download = `drafted_players_${dateStr}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

// ドラフト指名選手データを箱庭モード用の選手オブジェクトに変換
// draftStatsはドラフト時の能力値スナップショットなので、それを基に
// 通常のplayer形式に展開する。draftStatsに含まれない項目はデフォルト値を補う。
export const convertDraftedPlayerToSandboxPlayer = (draftedPlayer, id) => {
  const ds = draftedPlayer.draftStats || {};
  const isPitcher = draftedPlayer.position === 'pitcher';

  // 守備位置適正の初期値を組み立てる
  const defaultFitness = {
    pitcher: 0, catcher: 0, first: 0, second: 0, third: 0,
    short: 0, left: 0, center: 0, right: 0
  };
  if (draftedPlayer.position && defaultFitness.hasOwnProperty(draftedPlayer.position)) {
    defaultFitness[draftedPlayer.position] = 100;
  }
  const positionFitness = ds.positionFitness
    ? { ...defaultFitness, ...ds.positionFitness }
    : defaultFitness;

  // 球種(arsenal)を復元（draftStatsに含まれていればそれを使用）
  const arsenal = ds.pitching?.arsenal && Array.isArray(ds.pitching.arsenal)
    ? JSON.parse(JSON.stringify(ds.pitching.arsenal))
    : (isPitcher
      ? [{ id: 1, type: 'slider', level: 40 }, { id: 2, type: 'curve', level: 30 }]
      : [{ id: 1, type: 'slider', level: 10 }]);

  // 0が有効値の能力もあるため `??`(nullish) でフォールバック
  return {
    id,
    name: draftedPlayer.name || '名無し',
    age: draftedPlayer.age || 22,
    position: draftedPlayer.position || 'pitcher',
    battingOrder: 0,
    isStarter: false,
    isTwoWay: false,
    batting: {
      meet: ds.batting?.meet ?? (isPitcher ? 30 : 50),
      power: ds.batting?.power ?? (isPitcher ? 25 : 50),
      eye: ds.batting?.eye ?? (isPitcher ? 25 : 50),
      bats: draftedPlayer.bats || 'right',
      steal: ds.batting?.steal ?? (isPitcher ? 20 : 50)
    },
    physical: {
      speed: ds.physical?.speed ?? (isPitcher ? 40 : 50),
      arm: ds.physical?.arm ?? 50,
      throws: draftedPlayer.throws || 'right',
      bodyStamina: 50, // draftStatsには含まれないためデフォルト
      recovery: 50     // draftStatsには含まれないためデフォルト
    },
    fielding: {
      defense: ds.fielding?.defense ?? (isPitcher ? 40 : 50)
    },
    catching: {
      lead: draftedPlayer.position === 'catcher' ? 50 : 30
    },
    pitching: {
      velocity: ds.pitching?.velocity ?? (isPitcher ? 140 : 120),
      control: ds.pitching?.control ?? (isPitcher ? 50 : 30),
      stamina: ds.pitching?.stamina ?? (isPitcher ? 100 : 50),
      form: 'overhand',
      arsenal
    },
    traits: ds.traits ? [...ds.traits] : [],
    positionFitness,
    professionalCareer: { isDrafted: false, draftYear: null, draftTeam: null, achievements: [] },
    fatigue: 0,
    experience: 0,
    seasonStats: createSeasonStats(),
    careerStats: createCareerStats()
  };
};

// ドラフト指名選手JSONファイルを読み込み、変換結果のリストをコールバックに渡す
export const importDraftedPlayers = (onImported) => {
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
        if (!data.players || !Array.isArray(data.players)) {
          alert('無効なドラフト指名選手データです（playersフィールドが見つかりません）');
          return;
        }
        if (onImported) onImported(data.players);
      } catch (err) {
        alert('ファイルの読み込みに失敗しました: ' + err.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
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
