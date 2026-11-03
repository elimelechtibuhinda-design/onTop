// Three-way merge for sync: combines what changed on this device and on the other device
// since they last agreed (`base`). Nothing either device added is lost; an edit beats an
// untouched copy; a deletion wins unless the other device edited that same item.
// Pure functions (no DOM, no storage) so they can be tested on their own.

// Settings that belong to one device and never sync.
export const DEVICE_ONLY = ["notifications", "iosTipDismissed", "lastBackup", "lastRecapWeek", "dayPlan"];

// Lists of things with ids. Each item merges on its own.
const LISTS = ["courses", "events", "sessions", "tasks", "goals", "reviews", "grades", "flashcards", "parking", "examPlans", "checklist", "garden"];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Field-by-field: take whichever side changed the field. If both devices changed the same
// field, the version already in the cloud wins, so every device ends up with the same answer.
function mergeObject(base = {}, local = {}, remote = {}) {
  const out = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  for (const k of keys) {
    const b = base[k], l = local[k], r = remote[k];
    if (same(l, r)) { if (l !== undefined) out[k] = l; continue; }
    if (same(l, b)) { if (r !== undefined) out[k] = r; continue; }   // only remote changed (or removed it)
    if (same(r, b)) { if (l !== undefined) out[k] = l; continue; }   // only local changed (or removed it)
    out[k] = r !== undefined ? r : l;                                  // both changed: deterministic pick
  }
  return out;
}

function mergeList(base = [], local = [], remote = []) {
  const byId = (arr) => new Map(arr.filter((x) => x && x.id != null).map((x) => [x.id, x]));
  const B = byId(base), L = byId(local), R = byId(remote);
  const ids = [];
  const seen = new Set();
  // keep a stable order: local order first, then anything new from remote
  for (const arr of [local, remote]) for (const x of arr) if (x && x.id != null && !seen.has(x.id)) { seen.add(x.id); ids.push(x.id); }
  const out = [];
  for (const id of ids) {
    const b = B.get(id), l = L.get(id), r = R.get(id);
    if (l && r) { out.push(b ? mergeObject(b, l, r) : (same(l, r) ? l : mergeObject({}, l, r))); continue; }
    const present = l || r;
    if (!b) { out.push(present); continue; }                 // added on one device
    // It existed before and one device deleted it: delete, unless the other device edited it since.
    if (!same(present, b)) out.push(present);
  }
  return out;
}

function stripDevice(state) {
  const s = { ...state, profile: { ...(state.profile || {}) } };
  for (const k of DEVICE_ONLY) delete s.profile[k];
  delete s.nudges;
  return s;
}

// What gets uploaded: everything except device-only settings.
export function syncable(state) { return stripDevice(state); }

// XP only ever comes from focused minutes in sessions, so recompute it instead of merging numbers.
export function xpFromSessions(sessions) {
  return sessions.reduce((a, s) => a + Math.max(0, Math.round(((s.durationSec || 0) - (s.distractedSec || 0)) / 60)), 0);
}

export function mergeStates(base, local, remote) {
  base = stripDevice(base || {});
  const L = stripDevice(local), R = stripDevice(remote);
  const out = { ...mergeObject(base, L, R) };
  for (const k of LISTS) out[k] = mergeList(base[k] || [], L[k] || [], R[k] || []);
  out.profile = mergeObject(base.profile, L.profile, R.profile);
  // An account that finished setup on either device is set up.
  out.profile.setupDone = !!(L.profile?.setupDone || R.profile?.setupDone);
  // Badges: keep every badge earned anywhere, with the earliest date.
  out.badges = { ...(R.badges || {}) };
  for (const [k, v] of Object.entries(L.badges || {})) out.badges[k] = out.badges[k] ? Math.min(out.badges[k], v) : v;
  // Records: the best of both.
  out.records = { ...(R.records || {}) };
  for (const [k, v] of Object.entries(L.records || {})) {
    const other = out.records[k];
    out.records[k] = other == null ? v : k === "reaction" || k === "memory" ? Math.min(...[v, other].filter((x) => x > 0)) || 0 : Math.max(v, other);
  }
  out.xp = xpFromSessions(out.sessions);
  // keep this device's own settings
  for (const k of DEVICE_ONLY) if (local.profile && k in local.profile) out.profile[k] = local.profile[k];
  out.nudges = local.nudges || {};
  return out;
}
