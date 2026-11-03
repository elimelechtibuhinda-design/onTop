// Sync between devices with a code, end-to-end encrypted (see sync-crypto.js, sync-merge.js).
// Optional and off by default. The server only ever holds an encrypted blob plus a version number.
import { S, store, replaceState, subscribe } from "./store.js";
import { kvGet, kvSet, kvDel } from "./db.js";
import { emit } from "./bus.js";
import { newCode, normalizeCode, deriveKeys, encryptState, decryptState } from "./sync-crypto.js";
import { mergeStates, syncable } from "./sync-merge.js";

const SERVER = import.meta.env.VITE_SYNC_URL || "https://sync.imdialedin.app";
const CFG_KEY = "dialedin-sync";
const BASE_KEY = "sync-base";   // the state both sides agreed on at the last successful sync

let cfg = loadCfg();            // { code, version, lastSyncAt, error }
let keys = null;
let running = false, again = false, timer = null;

function loadCfg() { try { return JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch { return {}; } }
function saveCfg() { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch { /* ignore */ } emit("sync"); }

export const syncInfo = () => ({ on: !!cfg.code, code: cfg.code, lastSyncAt: cfg.lastSyncAt, error: cfg.error, busy: running });

// Key order can differ after a merge, so compare with sorted keys.
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",")}}`;
  return JSON.stringify(v);
}
const sameData = (a, b) => stable(syncable(a)) === stable(syncable(b));

async function k() {
  if (!keys || keys.code !== cfg.code) keys = { ...(await deriveKeys(cfg.code)), code: cfg.code };
  return keys;
}
async function call(method, id, { body, meta } = {}) {
  return fetch(`${SERVER}/v1/sync/${id}${meta ? "?meta=1" : ""}`, {
    method, cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function syncNow() {
  // A fresh device can join before finishing setup; otherwise wait until setup is done.
  if (!cfg.code || store.loadFailed || (!S().profile.setupDone && !cfg.joining)) return;
  if (running) { again = true; return; }
  running = true; emit("sync");
  try {
    const { id, key } = await k();
    for (let attempt = 0; attempt < 5; attempt++) {
      const metaRes = await call("GET", id, { meta: true });
      if (metaRes.status !== 200 && metaRes.status !== 404) throw new Error("server " + metaRes.status);
      const remoteVersion = metaRes.status === 200 ? (await metaRes.json()).version : 0;
      const base = await kvGet(BASE_KEY);
      const local = S();

      if (remoteVersion === 0 && cfg.version > 0) {
        // The cloud copy was deleted from another device: stop syncing here, keep local data.
        turnOffLocal();
        cfg.error = "Sync was turned off from another device. Your data is still here.";
        saveCfg();
        return;
      }

      let push = null, ifVersion = remoteVersion;
      if (remoteVersion !== 0 && remoteVersion === cfg.version) {
        // Nobody else changed anything; upload only if this device did.
        if (base && sameData(local, base)) { cfg.lastSyncAt = Date.now(); cfg.error = null; saveCfg(); return; }
        push = local;
      } else if (remoteVersion === 0) {
        push = local;                                   // first device: create the cloud copy
      } else {
        // Another device changed things: download, merge, apply here, then upload the result.
        const full = await call("GET", id);
        if (!full.ok) throw new Error("server " + full.status);
        const j = await full.json();
        const remote = await decryptState(key, j.data);
        const merged = mergeStates(cfg.version > 0 ? base : null, local, remote);
        if (!sameData(merged, local)) replaceState({ ...merged, profile: { ...merged.profile } });
        if (sameData(merged, remote)) {
          cfg.version = j.version;
          await kvSet(BASE_KEY, syncable(merged));
          cfg.lastSyncAt = Date.now(); cfg.error = null; saveCfg();
          return;
        }
        push = merged; ifVersion = j.version;
      }

      const data = await encryptState(key, syncable(push));
      const put = await call("PUT", id, { body: { data, ifVersion } });
      if (put.status === 409) continue;                 // another device wrote first: go round again
      if (!put.ok) throw new Error(put.status === 413 ? "too large" : "server " + put.status);
      cfg.version = (await put.json()).version;
      await kvSet(BASE_KEY, syncable(push));
      cfg.lastSyncAt = Date.now(); cfg.error = null; saveCfg();
      return;
    }
    throw new Error("busy");
  } catch (e) {
    console.warn("sync failed", e);
    cfg.error = !navigator.onLine ? "You're offline — will sync when you're back online."
      : String(e.message) === "too large" ? "Your data is too big to sync. Deleting old doodles or notes can help."
        : "Couldn't reach sync right now — will try again.";
    saveCfg();
  } finally {
    running = false;
    emit("sync");
    if (again) { again = false; schedule(1500); }
  }
}

export function schedule(ms = 4000) {
  if (!cfg.code) return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, ms);
}

/* ---------- turning sync on / joining / off ---------- */
export async function turnOn() {
  cfg = { code: newCode(), version: 0 };
  await kvDel(BASE_KEY);
  saveCfg();
  await syncNow();
  return cfg.code;
}

// Returns "joined" | "notfound" | "invalid"
export async function join(input) {
  const code = normalizeCode(input);
  if (!code) return "invalid";
  const { id } = await deriveKeys(code);
  const res = await call("GET", id, { meta: true });
  if (res.status === 404) return "notfound";
  if (!res.ok) throw new Error("server " + res.status);
  cfg = { code, version: 0, joining: true };
  await kvDel(BASE_KEY);
  saveCfg();
  await syncNow();
  delete cfg.joining;
  saveCfg();
  return cfg.version > 0 ? "joined" : "error";
}

function turnOffLocal() {
  cfg = {};
  keys = null;
  kvDel(BASE_KEY).catch(() => {});
}
export function turnOff() { turnOffLocal(); saveCfg(); }

export async function deleteCloudCopy() {
  if (!cfg.code) return;
  const { id } = await k();
  const res = await call("DELETE", id);
  if (!res.ok && res.status !== 204) throw new Error("server " + res.status);
  turnOff();
}

export function shareLink(code = cfg.code) {
  return `${location.origin}${location.pathname}#sync=${code}`;
}

/* ---------- background syncing ---------- */
export function initSync() {
  subscribe(() => schedule(4000));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(300); });
  addEventListener("online", () => schedule(300));
  setInterval(() => { if (!document.hidden) syncNow(); }, 300000);
  schedule(1500);
}
