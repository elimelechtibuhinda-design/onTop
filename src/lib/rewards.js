// XP, levels, badges, unlockables and the study garden.
import { S, update } from "./store.js";
import { levelInfo, secOn, streakInfo } from "./queries.js";
import { uid, todayKey, daysBetween } from "./utils.js";
import { emit } from "./bus.js";

export const BADGES = [
  { id: "early", emoji: "🌅", name: "Early Bird", desc: "Studied before 8am" },
  { id: "owl", emoji: "🦉", name: "Night Owl", desc: "Studied after 10pm" },
  { id: "streak7", emoji: "🔥", name: "7-Day Streak", desc: "Studied 7 days in a row" },
  { id: "marathon", emoji: "🏃", name: "Marathon", desc: "4 hours in one day" },
  { id: "comeback", emoji: "💪", name: "Comeback Kid", desc: "Came back after 3+ days off" },
  { id: "examready", emoji: "🎯", name: "Exam Ready", desc: "Finished an exam prep plan" },
];

// Level needed to unlock each cosmetic.
export const UNLOCKS = {
  theme: { ubc: 1, "ubc-dark": 1, library: 3, nightsky: 5, matcha: 7, sunset: 10 },
  outfit: { none: 1, cap: 1, headphones: 2, scarf: 4, sunglasses: 6, crown: 12 },
  sound: { rain: 1, cafe: 1, brown: 1, library: 1, fire: 3, ocean: 5 },
  track: { rainy: 1, library: 1, sunset: 4 },
};
export const UNLOCK_NAMES = {
  ubc: "UBC Light", "ubc-dark": "UBC Night", library: "Library", nightsky: "Night Sky", matcha: "Matcha", sunset: "Sunset",
  none: "No outfit", cap: "Grad cap", headphones: "Headphones", scarf: "Thunderbird scarf", sunglasses: "Shades", crown: "Crown",
  rain: "Rain", cafe: "Café", brown: "Brown noise", fire: "Fireplace", ocean: "Ocean",
  rainy: "Rainy Window", sunset_track: "Wreck Beach Sunset",
};
const KIND_NAMES = { theme: "theme", outfit: "Toppy outfit", sound: "sound", track: "lo-fi track" };

export function unlockLevel(kind, id) { return UNLOCKS[kind]?.[id] ?? 1; }
export function isUnlocked(kind, id) { return levelInfo().level >= unlockLevel(kind, id); }

const PLANTS = { sprout: "🌱", flower: "🌷", sunflower: "🌻", tree: "🌳", wilted: "🥀" };
export const plantEmoji = (kind) => PLANTS[kind] || "🌱";

function earn(st, id, gained) {
  if (st.badges[id]) return;
  st.badges[id] = Date.now();
  gained.push(BADGES.find((b) => b.id === id));
}

// Badges that depend on the whole history; safe to call any time.
export function checkBadges() {
  const gained = [];
  update((st) => {
    if (streakInfo().streak >= 7) earn(st, "streak7", gained);
    if (secOn(todayKey()) >= 4 * 3600) earn(st, "marathon", gained);
    for (const plan of st.examPlans) {
      const tasks = st.tasks.filter((t) => t.examPlanId === plan.id);
      if (tasks.length && tasks.every((t) => t.done)) earn(st, "examready", gained);
    }
  });
  gained.forEach((b) => emit("celebrate", { text: `New badge: ${b.emoji} ${b.name}! ${b.desc}.`, big: true }));
  return gained;
}

// Called once a session is saved. Awards XP, plants the garden and checks session badges.
export function rewardSession(session, { quitEarly = false, prevLastKey = null } = {}) {
  const before = levelInfo();
  const focusedMin = Math.max(0, Math.round((session.durationSec - (session.distractedSec || 0)) / 60));
  const gained = [];
  update((st) => {
    st.xp += focusedMin;
    const min = session.durationSec / 60;
    const kind = quitEarly ? "wilted" : min >= 60 ? "tree" : min >= 25 ? "sunflower" : min >= 10 ? "flower" : "sprout";
    if (min >= 5 || quitEarly) st.garden.push({ id: uid(), date: session.dateKey, kind, courseId: session.courseId });
    const startHour = new Date(session.start).getHours();
    const endHour = new Date(session.start + session.durationSec * 1000).getHours();
    if (startHour < 8 && startHour >= 4) earn(st, "early", gained);
    if (endHour >= 22 || endHour < 4) earn(st, "owl", gained);
    if (prevLastKey && daysBetween(prevLastKey, session.dateKey) > 3) earn(st, "comeback", gained);
    const day = secOn(session.dateKey);
    if (day > st.records.bestDaySec) {
      if (st.records.bestDaySec > 1800) emit("celebrate", { text: `New record: ${Math.round(day / 360) / 10}h in one day! 🏆`, big: true });
      st.records.bestDaySec = day;
    }
  });
  gained.forEach((b) => emit("celebrate", { text: `New badge: ${b.emoji} ${b.name}! ${b.desc}.`, big: true }));
  checkBadges();
  const after = levelInfo();
  if (after.level > before.level) {
    emit("celebrate", { text: `Level up! You're level ${after.level} 🎉`, big: true });
    announceUnlocks(after.level);
  }
  if (after.rank.name !== before.rank.name) {
    emit("celebrate", { text: `New rank: ${after.rank.emoji} ${after.rank.name}!`, big: true });
  }
  if (focusedMin > 0) emit("xp", focusedMin);
}

function announceUnlocks(level) {
  const names = [];
  for (const [kind, map] of Object.entries(UNLOCKS)) {
    for (const [id, lvl] of Object.entries(map)) {
      if (lvl !== level) continue;
      const label = kind === "track" && id === "sunset" ? UNLOCK_NAMES.sunset_track : UNLOCK_NAMES[id] || id;
      names.push(`${label} ${KIND_NAMES[kind]}`);
    }
  }
  if (names.length) emit("celebrate", { text: `Unlocked: ${names.join(", ")} ✨` });
}

export function lastSessionKey() {
  let last = null;
  for (const s of S().sessions) if (!last || s.dateKey > last) last = s.dateKey;
  return last;
}
