import assert from 'node:assert/strict';
import { compressData, compressDataAsync, decompressDataAsync } from '../../src/utils/compression.js';

const seasonData = {
  year: 2,
  results: [{ gameId: 'final-1', decisions: [{ pitch: 'fastball' }] }],
  schedule: [{ gameId: 'final-2', seriesId: 'final', result: { cancelled: true, homeScore: 0, awayScore: 0 } }],
};
const source = {
  timestamp: '2026-10-27T00:00:00.000Z',
  seasonData,
  teamsData: { T: { players: [{ id: 1, pitching: { changeBalls: [{ name: 'slider' }] }, gameLog: ['temporary'] }] } },
  universityPool: { university: { 2026: [{ player: { id: 2, gameLog: ['temporary'] } }] } },
};
const before = JSON.stringify(source);
for (const encoded of [compressData(source), await compressDataAsync(source)]) {
  const restored = await decompressDataAsync(encoded);
  assert.deepEqual(restored.seasonData, seasonData);
  assert.equal(restored.teamsData.T.players[0].gameLog, undefined);
  assert.equal(restored.teamsData.T.players[0].pitching.changeBalls[0], 'slider');
  assert.equal(JSON.stringify(source), before, '保存時に元データを変更しない');
}

const idbValues = new Map();
const localValues = new Map();
let putFailure = null;
globalThis.localStorage = {
  getItem: key => localValues.get(key) ?? null,
  setItem: (key, value) => { localValues.set(key, value); },
  removeItem: key => { localValues.delete(key); },
};
const database = {
  objectStoreNames: { contains: () => true },
  transaction() {
    const tx = { error: null };
    tx.objectStore = () => ({
      get(key) {
        const req = { result: null, error: null };
        queueMicrotask(() => { req.result = idbValues.get(key); req.onsuccess?.(); });
        return req;
      },
      put(value, key) {
        const req = { error: null };
        queueMicrotask(() => {
          if (putFailure === 'request') {
            req.error = new Error('put failed');
            tx.error = req.error;
            req.onerror?.();
            tx.onabort?.();
          } else {
            req.onsuccess?.();
            queueMicrotask(() => {
              if (putFailure === 'abort') {
                tx.error = new Error('commit aborted');
                tx.onabort?.();
              } else {
                idbValues.set(key, value);
                tx.oncomplete?.();
              }
            });
          }
        });
        return req;
      },
      delete(key) {
        const req = { error: null };
        queueMicrotask(() => { req.onsuccess?.(); queueMicrotask(() => { idbValues.delete(key); tx.oncomplete?.(); }); });
        return req;
      },
    });
    return tx;
  },
};
globalThis.indexedDB = {
  open() {
    const req = { result: database };
    queueMicrotask(() => req.onsuccess?.({ target: req }));
    return req;
  },
};

const { SAVE_SLOT_KEYS, EMERGENCY_KEY, ensureMigration, promoteEmergencyToSlot, readSaveSlots, loadGameFromSlot, buildSaveData } = await import('../../src/game/saveSystem.js');
const { idbSetItem } = await import('../../src/utils/indexedDBStorage.js');
const { TEAMS_DATA } = await import('../../src/teams-data.js');
const { WORLD_DATA } = await import('../../src/corporate/worldData.js');
const { getPlayerIdCounter, setPlayerIdCounter } = await import('../../src/state/playerIds.js');
const oldSave = year => compressData({ timestamp: `202${year}-01-01T00:00:00.000Z`, seasonData: { year }, teamsData: { T: { players: [] } } });

idbValues.set(SAVE_SLOT_KEYS[0], oldSave(3));
localValues.set('baseballSim_saveData', oldSave(1));
await Promise.all([ensureMigration(), ensureMigration(), readSaveSlots()]);
assert.equal((await readSaveSlots())[0].year, 3, '旧キーは既存スロットを上書きしない');
assert.ok(localValues.has('baseballSim_saveData'), '競合した旧キーを消さない');

idbValues.set(SAVE_SLOT_KEYS[0], oldSave(1));
localValues.set(EMERGENCY_KEY, oldSave(2));
putFailure = 'request';
const previousWarn = console.warn;
console.warn = () => {};
let fallbackResult;
try { fallbackResult = await promoteEmergencyToSlot(0); }
finally { console.warn = previousWarn; }
assert.equal(fallbackResult.success, true);
assert.equal((await readSaveSlots())[0].year, 2, 'IndexedDB書込失敗後は新しいlocalStorageを読む');

putFailure = 'abort';
await assert.rejects(idbSetItem('aborted', 'value'), /commit aborted/);
assert.equal(idbValues.has('aborted'), false, 'トランザクション中断を成功扱いしない');

putFailure = null;
TEAMS_DATA.original = { name: 'original', players: [{ id: 77, name: 'original' }] };
WORLD_DATA.initialized = true;
WORLD_DATA.userLeagueId = 'before-load';
WORLD_DATA._uniTournaments = { ucDone: true, uc: { champion: 'A' } };
assert.deepEqual(buildSaveData({ seasonData: { year: 1 } }).worldData._uniTournaments, WORLD_DATA._uniTournaments);
setPlayerIdCounter(90001);
assert.equal(buildSaveData({ seasonData: { year: 1 } }).playerIdCounter, 90001);
idbValues.set(SAVE_SLOT_KEYS[1], JSON.stringify({
  version: '2.15.0', timestamp: '2026-10-27T00:00:00.000Z',
  seasonData: { year: 1 }, teamsData: { loaded: { name: 'loaded', players: [] } },
  universityPool: { university: { 2026: { invalid: true } }, highSchool: { players: [], year: 1 } },
}));
const previousError = console.error;
console.error = () => {};
let loadResult;
try { loadResult = await loadGameFromSlot(1); }
finally { console.error = previousError; }
assert.equal(loadResult.success, false, '復元途中の例外をエラーとして返す');
assert.ok(TEAMS_DATA.original && !TEAMS_DATA.loaded, 'ロード失敗後にチームを戻す');
assert.equal(WORLD_DATA.userLeagueId, 'before-load', 'ロード失敗後に並行世界を戻す');
assert.equal(getPlayerIdCounter(), 90001, 'ロード失敗後に採番位置を戻す');

console.log('save-check PASS');
