import { compressData, decompressData, getLocalStorageUsage } from '../utils/compression.js';
import { TEAMS_DATA } from '../teams-data.js';
import { createSeasonStats, createCareerStats } from '../players.js';
import { WORLD_DATA } from '../corporate/worldData.js';
import { serializeUniversityPool, deserializeUniversityPool, seedInitialUniversityClasses } from '../season/universityPool.js';

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
    const worldDataSnapshot = WORLD_DATA.initialized ? {
      initialized: WORLD_DATA.initialized,
      mode: WORLD_DATA.mode,
      userLeagueId: WORLD_DATA.userLeagueId,
      year: WORLD_DATA.year,
      independentLeagues: JSON.parse(JSON.stringify(WORLD_DATA.independentLeagues)),
      universityLeagues: WORLD_DATA.universityLeagues ? JSON.parse(JSON.stringify(WORLD_DATA.universityLeagues)) : {},
      corporateLeague: { teams: Object.keys(WORLD_DATA.corporateLeague?.teams || {}), userTeam: WORLD_DATA.corporateLeague?.userTeam },
      draft: JSON.parse(JSON.stringify(WORLD_DATA.draft)),
      corporateToshitaikou: WORLD_DATA.corporateToshitaikou ? {
        generated: WORLD_DATA.corporateToshitaikou.generated,
        mainDone: WORLD_DATA.corporateToshitaikou.mainDone,
        champion: WORLD_DATA.corporateToshitaikou.champion,
        runnerUp: WORLD_DATA.corporateToshitaikou.runnerUp,
      } : null,
      universityLeague: WORLD_DATA.universityLeague ? JSON.parse(JSON.stringify(WORLD_DATA.universityLeague)) : null,
    } : null;

    const saveData = {
      version: '2.12.0',
      timestamp: new Date().toISOString(),
      slotIndex,
      seasonData: gameState.seasonData,
      leagueConfig: gameState.leagueConfig,
      teamsData: JSON.parse(JSON.stringify(TEAMS_DATA)),
      worldData: worldDataSnapshot,
      screenMode: gameState.screenMode,
      managementView: gameState.managementView,
      gameFlowState: gameState.gameFlowState,
      gameMode: gameState.gameMode,
      selectedMonth: gameState.selectedMonth,
      hallOfFamePlayers: gameState.hallOfFamePlayers,
      teamHistory: gameState.teamHistory,
      universityPool: serializeUniversityPool()
    };

    const compressed = compressData(saveData);
    localStorage.setItem(SAVE_SLOT_KEYS[slotIndex], compressed);
    return { success: true };
  } catch (error) {
    console.error('セーブ失敗:', error);
    if (error.name === 'QuotaExceededError') {
      return { success: false, error: 'ストレージ容量が不足しています。古いセーブデータを削除してください。' };
    }
    return { success: false, error: 'セーブに失敗しました: ' + error.message };
  }
};

// セーブデータの基本バリデーション
const validateSaveData = (data) => {
  if (!data || typeof data !== 'object') return 'セーブデータが空または不正です';
  if (!data.seasonData) return 'シーズンデータが含まれていません';
  if (!data.teamsData || typeof data.teamsData !== 'object') return 'チームデータが含まれていません';
  const teamNames = Object.keys(data.teamsData);
  if (teamNames.length === 0) return 'チームデータが空です';
  for (const name of teamNames) {
    const team = data.teamsData[name];
    if (!team.players || !Array.isArray(team.players)) return `${name}の選手データが不正です`;
  }
  return null;
};

// ゲームデータを読み込み（スロット指定、圧縮対応）
export const loadGameFromSlot = (slotIndex) => {
  try {
    const savedData = localStorage.getItem(SAVE_SLOT_KEYS[slotIndex]);
    if (!savedData) {
      return { success: false, error: 'セーブデータがありません' };
    }

    const saveData = decompressData(savedData);
    if (!saveData) {
      return { success: false, error: 'セーブデータの解凍に失敗しました。データが破損している可能性があります。' };
    }

    const validationError = validateSaveData(saveData);
    if (validationError) {
      return { success: false, error: validationError };
    }

    // TEAMS_DATAを安全に復元（バックアップを取ってから入れ替え）
    const backup = JSON.parse(JSON.stringify(TEAMS_DATA));
    try {
      Object.keys(TEAMS_DATA).forEach(k => delete TEAMS_DATA[k]);
      Object.keys(saveData.teamsData).forEach(teamName => {
        TEAMS_DATA[teamName] = saveData.teamsData[teamName];
      });
    } catch (restoreError) {
      // 復元失敗時はバックアップから戻す
      Object.keys(TEAMS_DATA).forEach(k => delete TEAMS_DATA[k]);
      Object.keys(backup).forEach(k => { TEAMS_DATA[k] = backup[k]; });
      return { success: false, error: 'データの復元中にエラーが発生しました。元の状態に戻しました。' };
    }

    // WORLD_DATA復元
    if (saveData.worldData && saveData.worldData.initialized) {
      const wd = saveData.worldData;
      WORLD_DATA.initialized = true;
      WORLD_DATA.mode = wd.mode;
      WORLD_DATA.userLeagueId = wd.userLeagueId;
      WORLD_DATA.year = wd.year;
      WORLD_DATA.independentLeagues = wd.independentLeagues || {};
      WORLD_DATA.universityLeagues = wd.universityLeagues || {};
      WORLD_DATA.corporateLeague = {
        teams: {},
        userTeam: wd.corporateLeague?.userTeam || null,
      };
      if (wd.corporateLeague?.teams) {
        for (const name of wd.corporateLeague.teams) {
          if (TEAMS_DATA[name]) WORLD_DATA.corporateLeague.teams[name] = TEAMS_DATA[name];
        }
      }
      WORLD_DATA.draft = wd.draft || { draftedPlayers: [], history: [] };
      WORLD_DATA.corporateToshitaikou = wd.corporateToshitaikou || null;
      WORLD_DATA.universityLeague = wd.universityLeague || null;
    }

    // 大学プール復元
    if (saveData.universityPool) {
      deserializeUniversityPool(saveData.universityPool);
    }
    // 大学プールが空の場合（旧セーブデータ等）、初期シードを生成
    const loadedYear = saveData.seasonData?.year || 1;
    seedInitialUniversityClasses(loadedYear);

    // 旧セーブデータ互換: バント能力値 + 性格パラメータの移行
    Object.values(TEAMS_DATA).forEach(team => {
      if (team?.players) {
        team.players.forEach(p => {
          if (p.batting && p.batting.bunt === undefined) {
            p.batting.bunt = Math.min(99, Math.max(1, Math.round(
              (p.batting.meet || 50) * 0.4 + (p.physical?.speed || 50) * 0.3 + Math.random() * 20
            )));
          }
          if (!p.personality) {
            const norm = () => Math.max(1, Math.min(100, Math.round(50 + (Math.sqrt(-2 * Math.log(Math.random() || 0.001)) * Math.cos(2 * Math.PI * Math.random())) * 18)));
            p.personality = { discipline: norm(), mental: norm() };
          }
        });
      }
    });

    return { success: true, data: saveData };
  } catch (error) {
    console.error('ロード失敗:', error);
    return { success: false, error: 'ロードに失敗しました: ' + error.message };
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
