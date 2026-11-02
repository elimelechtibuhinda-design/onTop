// App state: one object, persisted to IndexedDB (debounced), with change listeners.
import { kvGet, kvSet } from "./db.js";

export const SCHEMA_VERSION = 1;

export function defaultState() {
  return {
    version: SCHEMA_VERSION,
    profile: {
      name: "",
      setupDone: false,
      createdAt: Date.now(),
      timerMode: "pomodoro",        // pomodoro | deep | custom | stopwatch
      customFocusMin: 40,
      customBreakMin: 8,
      dailyGoalMin: 120,
      studyHour: 19,                // usual study time, for nudges
      personality: "friend",        // friend | coach | quiet
      outfit: "cap",
      theme: "classic",
      font: "default",              // default | easy
      reducedMotion: false,
      highContrast: false,
      soundCues: true,
      tick: false,
      chime: true,
      eyeRule: true,
      notifications: false,
      playlistUrl: "",
      lastBackup: 0,
      lastRecapWeek: "",
      dayPlan: null,                // { date, items: [{ taskId, start, end }] }
    },
    courses: [],     // { id, name, emoji, color, links: [{id,title,url}], notes, targetGrade }
    events: [],      // { id, courseId, title, type: exam|assignment|project|quiz|other, date }
    sessions: [],    // { id, courseId, taskId, start, durationSec, distractedSec, focus, note, dateKey, mode, completed }
    tasks: [],       // { id, courseId, title, estMin, date, done, doneAt, carried, goalId, examPlanId, createdAt }
    goals: [],       // SMART goals, see smart.js
    reviews: [],     // spaced review { id, courseId, topic, learnedOn, stage, due, done }
    grades: [],      // { id, courseId, name, weight, score }
    flashcards: [],  // { id, courseId, front, back, box, due }
    parking: [],     // { id, text, done, createdAt }
    examPlans: [],   // { id, eventId, topics, hoursPerDay, createdAt }
    checklist: [
      { id: "c1", text: "Student card / ID", done: false },
      { id: "c2", text: "Calculator (approved model!)", done: false },
      { id: "c3", text: "Pencils, pens, eraser", done: false },
      { id: "c4", text: "Water bottle", done: false },
      { id: "c5", text: "Know the room & arrive 15 min early", done: false },
      { id: "c6", text: "Slept 7+ hours", done: false },
      { id: "c7", text: "Ate something", done: false },
    ],
    xp: 0,
    badges: {},      // badgeId -> timestamp earned
    garden: [],      // { id, date, kind: sprout|flower|sunflower|tree|wilted, courseId }
    records: { bestDaySec: 0, reaction: 0, g2048: 0, memory: 0 },
    nudges: {},      // nudge id -> last shown timestamp
  };
}

const listeners = new Set();
export const store = { state: defaultState(), ready: false };

let saveTimer = null;
let frozen = false;
// Used by "Delete everything" so a pending/unload save can't resurrect wiped data.
export function freezeSaves() { frozen = true; clearTimeout(saveTimer); }
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 250);
}
export async function saveNow() {
  clearTimeout(saveTimer);
  if (frozen) return;
  try {
    await kvSet("state", store.state);
  } catch (e) {
    console.error("save failed", e);
  }
}
// Flush pending writes when the page is hidden or closing.
addEventListener("pagehide", saveNow);
document.addEventListener("visibilitychange", () => { if (document.hidden) saveNow(); });

// Fill any keys missing from older saves so new features never crash on old data.
function migrate(saved) {
  const base = defaultState();
  const out = { ...base, ...saved };
  out.profile = { ...base.profile, ...(saved.profile || {}) };
  out.records = { ...base.records, ...(saved.records || {}) };
  for (const k of Object.keys(base)) {
    if (Array.isArray(base[k]) && !Array.isArray(out[k])) out[k] = base[k];
  }
  // Theme ids were renamed; keep people on the theme they picked.
  out.profile.theme = { ubc: "classic", "ubc-dark": "midnight" }[out.profile.theme] || out.profile.theme;
  out.version = SCHEMA_VERSION;
  return out;
}

export async function loadState() {
  try {
    const saved = await kvGet("state");
    if (saved) store.state = migrate(saved);
  } catch (e) {
    console.error("load failed", e);
  }
  store.ready = true;
}

export function replaceState(next) {
  store.state = migrate(next);
  saveNow();
  emit();
}

export function update(fn) {
  fn(store.state);
  scheduleSave();
  emit();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let emitQueued = false;
function emit() {
  if (emitQueued) return;
  emitQueued = true;
  queueMicrotask(() => {
    emitQueued = false;
    listeners.forEach((fn) => fn(store.state));
  });
}

export const S = () => store.state;
