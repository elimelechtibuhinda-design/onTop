// Minimal IndexedDB wrapper. Two stores: "kv" for app state, "doodles" for break-art images.

const DB_NAME = "dialedin";
const OLD_DB_NAME = "ontop";   // the app was called onTop before
const DB_VERSION = 1;
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("doodles")) db.createObjectStore("doodles", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => resolve(result && "result" in result ? result.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const kvGet = (key) => tx("kv", "readonly", (s) => s.get(key));
export const kvSet = (key, val) => tx("kv", "readwrite", (s) => s.put(val, key));
export const kvDel = (key) => tx("kv", "readwrite", (s) => s.delete(key));
export const kvKeys = () => tx("kv", "readonly", (s) => s.getAllKeys());

// Copies data from the old "ontop" database (if any) into "dialedin", then deletes the old one.
// Opening a database that doesn't exist would create it, so abort in that case.
export async function migrateOldDb() {
  const old = await new Promise((resolve) => {
    const req = indexedDB.open(OLD_DB_NAME);
    req.onupgradeneeded = (e) => { if (e.oldVersion === 0) req.transaction.abort(); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  if (!old) return false;
  const read = (store, fn) => new Promise((resolve) => {
    if (!old.objectStoreNames.contains(store)) return resolve([]);
    const r = fn(old.transaction(store).objectStore(store));
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => resolve([]);
  });
  const keys = await read("kv", (s) => s.getAllKeys());
  const vals = await read("kv", (s) => s.getAll());
  const doodles = await read("doodles", (s) => s.getAll());
  old.close();
  if (!keys.includes("state")) { indexedDB.deleteDatabase(OLD_DB_NAME); return false; }
  for (let i = 0; i < keys.length; i++) await kvSet(keys[i], vals[i]);
  for (const d of doodles) await doodlePut(d);
  indexedDB.deleteDatabase(OLD_DB_NAME);
  return true;
}

export const doodleAll = () => tx("doodles", "readonly", (s) => s.getAll());
export const doodlePut = (d) => tx("doodles", "readwrite", (s) => s.put(d));
export const doodleDelete = (id) => tx("doodles", "readwrite", (s) => s.delete(id));
export const doodleClear = () => tx("doodles", "readwrite", (s) => s.clear());

// Ask the browser not to evict our data under storage pressure.
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch { /* not supported */ }
  return false;
}
