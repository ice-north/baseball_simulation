// ============================================================
// IndexedDB Storage - localStorage代替の大容量ストレージ
// ============================================================

const DB_NAME = 'baseballSimDB';
const DB_VERSION = 1;
const STORE_NAME = 'saves';

let dbInstance = null;

function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => {
      dbInstance = e.target.result;
      dbInstance.onclose = () => { dbInstance = null; };
      resolve(dbInstance);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function idbGetItem(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function idbSetItem(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function idbRemoveItem(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function idbGetAllKeys() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function isIndexedDBAvailable() {
  return typeof indexedDB !== 'undefined';
}

// ブラウザに「この保存領域は捨てないでほしい」と申告する。
// ⚠ **既定は best-effort** で、ディスクが逼迫すると IndexedDB は退避対象になる
//    （＝セーブが消える）。呼ばないと永続化されないので、起動時に一度だけ叩く。
// ⚠ 失敗しても止めないこと。Firefox は許可プロンプトを出し、Safari は false を返す。
export async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return { supported: false, persisted: false };
    if (await navigator.storage.persisted()) return { supported: true, persisted: true };
    return { supported: true, persisted: await navigator.storage.persist() };
  } catch {
    return { supported: false, persisted: false };
  }
}

// localStorage に残っている旧セーブを IndexedDB へ移す。
//
// ⚠ **消す前に、移った先を読み直して確かめること**。ここは片方にしか無いデータを
//    扱うので、「書いたはず」で消すと復旧手段が無くなる。
// ⚠ **移行先に既にデータがある場合、localStorage 側を消してはいけない**。
//    以前は `if (!existing)` の外で無条件に `removeItem` しており、
//    IndexedDB 側が古い／壊れていても localStorage の正本を捨てていた。
//    どちらを残すか判断できない以上、**両方残す**のが正しい。
export async function migrateLocalStorageToIDB(slotKeys) {
  let migrated = 0;
  for (const key of slotKeys) {
    const lsData = localStorage.getItem(key);
    if (!lsData) continue;
    try {
      const existing = await idbGetItem(key);
      if (existing) continue;          // 判断できないので localStorage 側も残す
      await idbSetItem(key, lsData);
      const written = await idbGetItem(key);   // 読み直して確認してから消す
      if (written !== lsData) continue;
      localStorage.removeItem(key);
      migrated++;
    } catch {
      // IndexedDB が使えない環境。localStorage のまま残す（消さない）
    }
  }
  return migrated;
}

export async function getIDBUsage() {
  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate();
    return {
      used: estimate.usage || 0,
      total: estimate.quota || 0,
      percentage: estimate.quota ? ((estimate.usage || 0) / estimate.quota * 100).toFixed(1) : '0'
    };
  }
  return { used: 0, total: 0, percentage: '0' };
}
