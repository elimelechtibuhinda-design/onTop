// Minimal IndexedDB wrapper. Two stores: "kv" for app state, "doodles" for break-art images.

const DB_NAME = "ontop";
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
