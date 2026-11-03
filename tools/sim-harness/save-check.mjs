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

// ⚠ 緊急保存をスロットへ戻すときも、上書き前のスロットを1世代バックアップする
{
  const { getBackupInfo } = await import('../../src/game/saveSystem.js');
  idbValues.set(SAVE_SLOT_KEYS[2], oldSave(5));
  localValues.set(EMERGENCY_KEY, oldSave(6));
  assert.equal((await promoteEmergencyToSlot(2)).success, true);
  assert.equal((await readSaveSlots())[2].year, 6, '緊急保存がスロットに入っていない');
  assert.equal((await getBackupInfo(2))?.year, 5, '緊急保存で上書きしたスロットのバックアップが無い');
}

// ⚠ スタッフの採番は保存に入れ、ロードで戻す。古い保存（採番なし）は在籍スタッフの次から
{
  const { getStaffIdCounter, setStaffIdCounter } = await import('../../src/corporate/staffData.js');
  setStaffIdCounter(7123);
  assert.equal(buildSaveData({ seasonData: { year: 1 } }).staffIdCounter, 7123, '保存にスタッフの採番が無い');
  const save = (extra) => JSON.stringify({
    version: '2.15.0', timestamp: '2026-10-27T00:00:00.000Z',
    seasonData: { year: 1 },
    teamsData: { S: { name: 'S', players: [], corporateData: { staff: [{ id: 6000 }, { id: 6400 }] } } },
    universityPool: { university: {}, highSchool: { players: [], year: 1 } },
    ...extra,
  });
  setStaffIdCounter(5000);
  idbValues.set(SAVE_SLOT_KEYS[1], save({}));
  const quiet = console.error;
  console.error = () => {};
  let r;
  try { r = await loadGameFromSlot(1); } finally { console.error = quiet; }
  assert.equal(r.success, true, r.error);
  assert.equal(getStaffIdCounter(), 6401, '古い保存で在籍スタッフと同じ id を配ってしまう');
  idbValues.set(SAVE_SLOT_KEYS[1], save({ staffIdCounter: 8000 }));
  console.error = () => {};
  try { r = await loadGameFromSlot(1); } finally { console.error = quiet; }
  assert.equal(r.success, true, r.error);
  assert.equal(getStaffIdCounter(), 8000, '保存したスタッフの採番が戻らない');
}

// ⚠ 進行中の社会人の背景大会は丸ごと保存し、ロードで続きから進める。
//    以前は結果だけを残してロードで作り直し、過ぎた日の試合をまとめて消化していた
//    （途中でロードすると大会をやり直し、出場球団の選手成績が二重に積まれた）
{
  WORLD_DATA.initialized = true;
  const defs = [{ name: 'A製鉄' }, { name: 'B電機', displayName: 'B電機野球部' }];
  WORLD_DATA.corporateToshitaikou = {
    generated: true, qualifiersDone: false, mainDone: false, champion: null,
    qualifiers: { tokyo: {
      teamDefs: defs, teamDefsMap: { 'A製鉄': defs[0], 'B電機野球部': defs[1] },
      mainBracket: { rounds: [[{ team1: 'A製鉄', team2: 'B電機野球部', winner: 'A製鉄', score: [3, 1] }]] },
      phase: 'main',
    } },
    mainTournament: null,
  };
  WORLD_DATA.corporateNihonSenshuken = { generated: true, done: true, champion: 'X', runnerUp: 'Y', qualifiers: { big: true } };
  const built = buildSaveData({ seasonData: { year: 1 } });
  const savedQ = built.worldData.corporateToshitaikou.qualifiers?.tokyo;
  assert.ok(savedQ, '進行中の大会が保存に入っていない');
  assert.equal(savedQ.teamDefsMap, undefined, '作り直せる teamDefsMap を保存している');
  assert.equal(built.worldData.corporateNihonSenshuken.qualifiers, undefined, '終わった大会は結果だけでよい');
  idbValues.set(SAVE_SLOT_KEYS[1], JSON.stringify({
    version: '2.15.0', timestamp: '2026-10-27T00:00:00.000Z',
    seasonData: { year: 1 }, teamsData: { S: { name: 'S', players: [] } },
    universityPool: { university: {}, highSchool: { players: [], year: 1 } },
    worldData: built.worldData,
  }));
  WORLD_DATA.corporateToshitaikou = null;
  const quiet = console.error;
  console.error = () => {};
  let r;
  try { r = await loadGameFromSlot(1); } finally { console.error = quiet; }
  assert.equal(r.success, true, r.error);
  const q = WORLD_DATA.corporateToshitaikou?.qualifiers?.tokyo;
  assert.ok(q, '途中でロードすると大会が作り直しになる');
  assert.equal(q.mainBracket.rounds[0][0].winner, 'A製鉄', '消化済みの試合の結果が残っていない');
  assert.equal(q.teamDefsMap['B電機野球部'], q.teamDefs[1], 'teamDefsMap を作り直せていない');
  assert.equal(WORLD_DATA.corporateNihonSenshuken.champion, 'X');
  // 結果だけの旧形式で未完了なら、従来どおり作り直す（進み具合が分からない）
  idbValues.set(SAVE_SLOT_KEYS[1], JSON.stringify({
    version: '2.15.0', timestamp: '2026-10-27T00:00:00.000Z',
    seasonData: { year: 1 }, teamsData: { S: { name: 'S', players: [] } },
    universityPool: { university: {}, highSchool: { players: [], year: 1 } },
    worldData: { ...built.worldData, corporateToshitaikou: { generated: true, qualifiersDone: false, mainDone: false } },
  }));
  console.error = () => {};
  try { r = await loadGameFromSlot(1); } finally { console.error = quiet; }
  assert.equal(r.success, true, r.error);
  assert.equal(WORLD_DATA.corporateToshitaikou, null);
}

// ⚠ 緊急保存は gzip + IndexedDB に非同期で書く。以前は同期の LZ 圧縮で localStorage へ書き、
//    大きなセーブでは圧縮だけで20秒前後画面が固まり、容量の上限にも近かった
{
  const { saveEmergency, getEmergencyInfo, clearEmergencySave } = await import('../../src/game/saveSystem.js');
  localValues.delete(EMERGENCY_KEY);
  idbValues.delete(EMERGENCY_KEY);
  assert.equal(await saveEmergency({ seasonData: { year: 9 }, teamsData: {} }), true);
  assert.ok(String(idbValues.get(EMERGENCY_KEY) || '').startsWith('GZ:'), '緊急保存が gzip で IndexedDB に入っていない');
  assert.equal(localValues.has(EMERGENCY_KEY), false, '緊急保存を localStorage にも書いている');
  assert.equal((await getEmergencyInfo())?.year, 9, '緊急保存の情報が読めない');
  assert.equal((await promoteEmergencyToSlot(2)).success, true);
  assert.equal((await readSaveSlots())[2].year, 9, '緊急保存をスロットへ戻せない');
  await clearEmergencySave();
  assert.equal(await getEmergencyInfo(), null, '緊急保存が消えない');
}

// ⚠ 保存で落としたプールの選手の成績欄は、ロードで空の成績として戻す
//    （戻さないと名簿に入った選手が成績欄の無いまま年度替わりを迎え、通算成績が作られなかった）
{
  const { highSchoolPool, universityPool } = await import('../../src/season/universityPool.js');
  const { optimizeSaveData } = await import('../../src/utils/compression.js');
  const pooled = { id: 4242, name: '高校生', position: 'short', seasonStats: { batting: {} }, careerStats: { batting: {} } };
  const stripped = optimizeSaveData({ universityPool: { highSchool: { players: [pooled], year: 1 }, university: { 2026: [{ player: { ...pooled, id: 4243 } }] } } }).universityPool;
  assert.equal(stripped.highSchool.players[0].seasonStats, undefined, '前提: 保存では成績欄を落とす');
  idbValues.set(SAVE_SLOT_KEYS[1], JSON.stringify({
    version: '2.15.0', timestamp: '2026-10-27T00:00:00.000Z',
    seasonData: { year: 1 }, teamsData: { S: { name: 'S', players: [] } },
    universityPool: stripped,
  }));
  const quiet = console.error;
  console.error = () => {};
  let r;
  try { r = await loadGameFromSlot(1); } finally { console.error = quiet; }
  assert.equal(r.success, true, r.error);
  assert.ok(highSchoolPool.players[0].seasonStats?.batting && highSchoolPool.players[0].careerStats?.pitching, '高校生の成績欄がロードで戻らない');
  assert.ok(universityPool[2026][0].player.careerStats?.batting, '大学プールの成績欄がロードで戻らない');
}

console.log('save-check PASS');
