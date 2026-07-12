import { compressData, compressDataAsync, decompressData, decompressDataAsync, getLocalStorageUsage } from '../utils/compression.js';
import { TEAMS_DATA, releasedPlayersPool, clearReleasedPlayersPool } from '../teams-data.js';
import { createSeasonStats, createCareerStats } from '../players.js';
import { WORLD_DATA } from '../corporate/worldData.js';
import { serializeUniversityPool, deserializeUniversityPool, seedInitialUniversityClasses } from '../season/universityPool.js';
import { UNIVERSITY_TEAMS } from '../university/universityTeamsData.js';
import { isIndexedDBAvailable, idbGetItem, idbSetItem, idbRemoveItem, migrateLocalStorageToIDB, getIDBUsage } from '../utils/indexedDBStorage.js';

export const SAVE_SLOT_KEYS = ['baseballSim_save_1', 'baseballSim_save_2', 'baseballSim_save_3'];

const useIDB = isIndexedDBAvailable();

let _migrationDone = false;
export async function ensureMigration() {
  if (_migrationDone || !useIDB) return;
  _migrationDone = true;
  try {
    const count = await migrateLocalStorageToIDB(SAVE_SLOT_KEYS);
    const oldKey = 'baseballSim_saveData';
    const oldData = localStorage.getItem(oldKey);
    if (oldData) {
      await idbSetItem(SAVE_SLOT_KEYS[0], oldData);
      localStorage.removeItem(oldKey);
    }
    if (count > 0) console.log(`IndexedDBに${count}件のセーブデータを移行しました`);
  } catch (e) {
    console.warn('IndexedDB移行失敗（localStorageにフォールバック）:', e);
  }
}

async function storageGetItem(key) {
  if (useIDB) {
    try {
      const val = await idbGetItem(key);
      if (val !== null) return val;
    } catch { /* fall through */ }
  }
  return localStorage.getItem(key);
}

async function storageSetItem(key, value) {
  if (useIDB) {
    await idbSetItem(key, value);
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    return;
  }
  localStorage.setItem(key, value);
}

async function storageRemoveItem(key) {
  if (useIDB) {
    try { await idbRemoveItem(key); } catch { /* ignore */ }
  }
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

// セーブスロット情報を読み取り（async版）
export const readSaveSlots = async () => {
  await ensureMigration();
  const results = [];
  for (const key of SAVE_SLOT_KEYS) {
    try {
      const savedData = await storageGetItem(key);
      if (!savedData) { results.push(null); continue; }
      const data = await decompressDataAsync(savedData);
      if (!data) { results.push(null); continue; }
      results.push({
        timestamp: data.timestamp,
        year: data.seasonData?.year || 1,
        date: data.seasonData?.currentDate || { month: 4, day: 1 },
        phase: data.seasonData?.phase || 'regular_season',
        version: data.version || 'unknown'
      });
    } catch { results.push(null); }
  }
  return results;
};

// 同期版（後方互換用 — 既にロード済みデータがあればキャッシュから返す）
let _cachedSlots = null;
export const readSaveSlotsSync = () => _cachedSlots || [null, null, null];
export const setCachedSlots = (slots) => { _cachedSlots = slots; };

// 旧データ移行チェック（IndexedDBへの移行はensureMigrationで実施）
export const migrateOldSaveData = () => {
  if (useIDB) return false;
  const oldData = localStorage.getItem('baseballSim_saveData');
  if (oldData && !localStorage.getItem(SAVE_SLOT_KEYS[0])) {
    localStorage.setItem(SAVE_SLOT_KEYS[0], oldData);
    localStorage.removeItem('baseballSim_saveData');
    return true;
  }
  return false;
};

// ゲームデータを保存（async版）
export const saveGameToSlot = async (slotIndex, gameState, onProgress) => {
  const progress = (pct) => { if (onProgress) onProgress(pct); };
  try {
    progress(10);
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
        qualifiersDone: WORLD_DATA.corporateToshitaikou.qualifiersDone,
        mainDone: WORLD_DATA.corporateToshitaikou.mainDone,
        champion: WORLD_DATA.corporateToshitaikou.champion,
        runnerUp: WORLD_DATA.corporateToshitaikou.runnerUp,
      } : null,
      corporateNihonSenshuken: WORLD_DATA.corporateNihonSenshuken ? {
        generated: WORLD_DATA.corporateNihonSenshuken.generated,
        done: WORLD_DATA.corporateNihonSenshuken.done,
        champion: WORLD_DATA.corporateNihonSenshuken.champion,
        runnerUp: WORLD_DATA.corporateNihonSenshuken.runnerUp,
      } : null,
      corporateClubSenshuken: WORLD_DATA.corporateClubSenshuken ? {
        generated: WORLD_DATA.corporateClubSenshuken.generated,
        done: WORLD_DATA.corporateClubSenshuken.done,
        champion: WORLD_DATA.corporateClubSenshuken.champion,
        runnerUp: WORLD_DATA.corporateClubSenshuken.runnerUp,
      } : null,
      corporateRegionalTournament: WORLD_DATA.corporateRegionalTournament ? {
        generated: WORLD_DATA.corporateRegionalTournament.generated,
        done: WORLD_DATA.corporateRegionalTournament.phase === 'done' || !!WORLD_DATA.corporateRegionalTournament.done,
      } : null,
      universityLeague: WORLD_DATA.universityLeague ? JSON.parse(JSON.stringify(WORLD_DATA.universityLeague)) : null,
      _universityScout: WORLD_DATA._universityScout ? JSON.parse(JSON.stringify(WORLD_DATA._universityScout)) : null,
      _teamRanking: WORLD_DATA._teamRanking ? JSON.parse(JSON.stringify(WORLD_DATA._teamRanking)) : null,
      _uniTeamRepData: UNIVERSITY_TEAMS.reduce((acc, t) => {
        if (t.reputation !== undefined || t.reputationHistory || t.rankPosition !== undefined || t.rankingScore !== undefined) {
          acc[t.name] = { rank: t.rank, reputation: t.reputation, reputationHistory: t.reputationHistory, rankPosition: t.rankPosition, rankingScore: t.rankingScore };
        }
        return acc;
      }, {}),
    } : null;

    progress(30);
    const saveData = {
      version: '2.14.0',
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
      universityPool: serializeUniversityPool(),
      releasedPlayersPool: JSON.parse(JSON.stringify(releasedPlayersPool))
    };

    progress(55);
    const compressed = await compressDataAsync(saveData);
    progress(85);
    await storageSetItem(SAVE_SLOT_KEYS[slotIndex], compressed);
    progress(100);
    return { success: true, storage: useIDB ? 'IndexedDB' : 'localStorage' };
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

// ゲームデータを読み込み（async版）
export const loadGameFromSlot = async (slotIndex) => {
  try {
    const savedData = await storageGetItem(SAVE_SLOT_KEYS[slotIndex]);
    if (!savedData) {
      return { success: false, error: 'セーブデータがありません' };
    }

    const saveData = await decompressDataAsync(savedData);
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
      // 未完了トーナメントはnullにリセット → checkAndTriggerEventsで再生成＋キャッチアップ
      const ctd = wd.corporateToshitaikou;
      WORLD_DATA.corporateToshitaikou = (ctd && ctd.mainDone) ? ctd : null;
      const cns = wd.corporateNihonSenshuken;
      WORLD_DATA.corporateNihonSenshuken = (cns && cns.done) ? cns : null;
      const ccs = wd.corporateClubSenshuken;
      WORLD_DATA.corporateClubSenshuken = (ccs && ccs.done) ? ccs : null;
      const crt = wd.corporateRegionalTournament;
      WORLD_DATA.corporateRegionalTournament = (crt && crt.done) ? { generated: true, done: true, phase: 'done' } : null;
      WORLD_DATA.universityLeague = wd.universityLeague || null;
      WORLD_DATA._universityScout = wd._universityScout || null;
      WORLD_DATA._teamRanking = wd._teamRanking || null;
      // UNIVERSITY_TEAMSの注目度データを復元
      if (wd._uniTeamRepData) {
        for (const teamDef of UNIVERSITY_TEAMS) {
          const d = wd._uniTeamRepData[teamDef.name];
          if (d) {
            if (d.rank) teamDef.rank = d.rank;
            if (d.reputation !== undefined) teamDef.reputation = d.reputation;
            if (d.reputationHistory) teamDef.reputationHistory = d.reputationHistory;
            if (d.rankPosition !== undefined) teamDef.rankPosition = d.rankPosition;
            if (d.rankingScore !== undefined) teamDef.rankingScore = d.rankingScore;
          }
        }
      }
    }

    // 大学プール復元
    if (saveData.universityPool) {
      deserializeUniversityPool(saveData.universityPool);
    }
    const loadedYear = saveData.seasonData?.year || 1;
    seedInitialUniversityClasses(loadedYear);

    // リリースプール復元
    clearReleasedPlayersPool();
    if (saveData.releasedPlayersPool && Array.isArray(saveData.releasedPlayersPool)) {
      saveData.releasedPlayersPool.forEach(p => releasedPlayersPool.push(p));
    }

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
          if (p.position === 'dh') {
            const fitness = p.positionFitness || {};
            const bestPos = Object.entries(fitness).sort((a, b) => b[1] - a[1])[0];
            p.position = bestPos ? bestPos[0] : 'first';
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

// セーブデータを削除（async版）
export const deleteSaveSlot = async (slotIndex) => {
  try {
    await storageRemoveItem(SAVE_SLOT_KEYS[slotIndex]);
    return true;
  } catch (error) {
    console.error('削除失敗:', error);
    return false;
  }
};

// ストレージ使用量を取得
export async function getStorageUsage() {
  if (useIDB) {
    return getIDBUsage();
  }
  return getLocalStorageUsage();
}

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
  a.download = `team_${teamName.replace(/[^a-zA-Z0-9぀-鿿]/g, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

// チームインポート（JSONファイルから読み込み）
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
      age: p.age,
      position: p.position,
      batting: p.batting,
      pitching: p.pitching,
      physical: p.physical,
      fielding: p.fielding,
      positionFitness: p.positionFitness,
      growthPotential: p.growthPotential,
      personality: p.personality,
      origin: p.origin,
      draftRound: p.draftRound,
      draftTeam: p.draftTeam
    }))
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `drafted_players_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

// ドラフト指名選手をJSONファイルからインポート
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
        if (data.type !== 'drafted_players' || !data.players || !Array.isArray(data.players)) {
          alert('ドラフト指名選手データではありません');
          return;
        }
        if (onImported) onImported(data.players);
      } catch (err) {
        alert('インポートに失敗しました: ' + err.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
};

// インポートされたドラフト選手を箱庭用に変換
export const convertDraftedPlayerToSandboxPlayer = (draftedPlayer, id) => {
  return {
    id,
    name: draftedPlayer.name,
    age: draftedPlayer.age || 18,
    position: draftedPlayer.position || 'pitcher',
    batting: draftedPlayer.batting || { meet: 50, power: 50, eye: 50, bats: 'right', bunt: 50 },
    pitching: draftedPlayer.pitching || { velocity: 140, control: 50, stamina: 100, form: 'overhand', arsenal: [{ type: 'straight', level: 50 }] },
    physical: draftedPlayer.physical || { speed: 50, arm: 50, throws: 'right' },
    fielding: draftedPlayer.fielding || { defense: 50, steal: 50, cLead: 50 },
    positionFitness: draftedPlayer.positionFitness || {},
    growthPotential: draftedPlayer.growthPotential || 1.0,
    personality: draftedPlayer.personality || { discipline: 50, mental: 50 },
    battingOrder: 0,
    seasonStats: createSeasonStats(),
    careerStats: createCareerStats(),
    condition: 2,
    fatigue: 0,
    fame: 0,
    origin: draftedPlayer.origin || 'draft',
  };
};
