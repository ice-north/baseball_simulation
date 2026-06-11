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

export async function migrateLocalStorageToIDB(slotKeys) {
  let migrated = 0;
  for (const key of slotKeys) {
    const lsData = localStorage.getItem(key);
    if (lsData) {
      const existing = await idbGetItem(key);
      if (!existing) {
        await idbSetItem(key, lsData);
        migrated++;
      }
      localStorage.removeItem(key);
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
