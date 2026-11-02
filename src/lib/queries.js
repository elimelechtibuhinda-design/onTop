// Read-only derived data computed from state.
import { S } from "./store.js";
import { todayKey, addDays, weekStartKey, daysUntil, dateKey, parseKey } from "./utils.js";

export const BRAND = {
  blue: "#002145", blue2: "#0055B7", sky: "#00A7E1", sky2: "#40B4E5",
  sky3: "#6EC4E8", sky4: "#97D4E9", gold: "#F2A900",
};
export const COURSE_COLORS = ["#0055B7", "#00A7E1", "#F2A900", "#2E8B57", "#C2410C", "#7C5CBF", "#C23B6B", "#5B6B78"];

export const courseById = (id) => S().courses.find((c) => c.id === id);
export const courseName = (id) => courseById(id)?.name || "General";
export const courseColor = (id) => courseById(id)?.color || BRAND.blue2;
export const courseEmoji = (id) => courseById(id)?.emoji || "📘";
export const taskById = (id) => S().tasks.find((t) => t.id === id);
export const eventById = (id) => S().events.find((e) => e.id === id);

export const sessionsOn = (key) => S().sessions.filter((s) => s.dateKey === key);
export const secOn = (key) => sessionsOn(key).reduce((a, s) => a + s.durationSec, 0);

export function secInRange(fromKey, toKey, courseId = null) {
  return S().sessions
    .filter((s) => s.dateKey >= fromKey && s.dateKey <= toKey && (!courseId || s.courseId === courseId))
    .reduce((a, s) => a + s.durationSec, 0);
}
export const weekSec = (courseId = null) => secInRange(weekStartKey(), todayKey(), courseId);

// Average seconds per day over the last n days (including days with zero).
export function avgDailySec(n = 14) {
  const from = addDays(todayKey(), -(n - 1));
  return secInRange(from, todayKey()) / n;
}
// Number of distinct days with any study in the last n days.
export function activeDays(n = 14) {
  const from = addDays(todayKey(), -(n - 1));
  return new Set(S().sessions.filter((s) => s.dateKey >= from).map((s) => s.dateKey)).size;
}

export function studyDaySet() {
  return new Set(S().sessions.filter((s) => s.durationSec >= 60).map((s) => s.dateKey));
}

// Streak with one automatic "freeze" per week that bridges a single missed day.
export function streakInfo() {
  const days = studyDaySet();
  const today = todayKey();
  const studiedToday = days.has(today);
  const usedFreezeWeeks = new Set();
  let streak = 0;
  let d = studiedToday ? today : addDays(today, -1);
  if (!days.has(d) && !(days.has(addDays(d, -1)))) {
    return { streak: 0, studiedToday, freezeLeft: true };
  }
  for (let guard = 0; guard < 4000; guard++) {
    if (days.has(d)) {
      streak++;
    } else {
      const wk = weekStartKey(d);
      if (!usedFreezeWeeks.has(wk) && days.has(addDays(d, -1))) {
        usedFreezeWeeks.add(wk);
      } else break;
    }
    d = addDays(d, -1);
  }
  return { streak, studiedToday, freezeLeft: !usedFreezeWeeks.has(weekStartKey(today)) };
}

export function upcomingEvents(courseId = null) {
  const t = todayKey();
  return S().events
    .filter((e) => e.date >= t && (!courseId || e.courseId === courseId))
    .sort((a, b) => a.date.localeCompare(b.date));
}
export const nextExam = () => upcomingEvents().find((e) => e.type === "exam") || null;

export function nearestDeadlineDays(courseId) {
  const ev = upcomingEvents(courseId)[0];
  return ev ? daysUntil(ev.date) : Infinity;
}

export function lastStudiedKey(courseId) {
  let last = null;
  for (const s of S().sessions) if (s.courseId === courseId && (!last || s.dateKey > last)) last = s.dateKey;
  return last;
}

export const tasksOn = (key) => S().tasks.filter((t) => t.date === key);
export const openTasks = () => S().tasks.filter((t) => !t.done);
export const dueReviews = () => S().reviews.filter((r) => !r.done && r.due <= todayKey());
export const dueFlashcards = (courseId = null) =>
  S().flashcards.filter((f) => f.due <= todayKey() && (!courseId || f.courseId === courseId));

/* ---- XP, levels, ranks ---- */
export const RANKS = [
  { name: "Freshman", xp: 0, emoji: "🐣" },
  { name: "Sophomore", xp: 300, emoji: "📗" },
  { name: "Dean's List", xp: 1200, emoji: "🏅" },
  { name: "Professor", xp: 3000, emoji: "🎓" },
  { name: "Legend", xp: 6000, emoji: "🌟" },
];
export const XP_PER_LEVEL = 120;
export function levelInfo(xp = S().xp) {
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const into = xp % XP_PER_LEVEL;
  let rank = RANKS[0], next = RANKS[1];
  for (let i = 0; i < RANKS.length; i++) {
    if (xp >= RANKS[i].xp) { rank = RANKS[i]; next = RANKS[i + 1] || null; }
  }
  return { level, into, need: XP_PER_LEVEL, rank, next };
}

export function weekDays(startKey = weekStartKey()) {
  return Array.from({ length: 7 }, (_, i) => addDays(startKey, i));
}

export function hourOf(ms) { return new Date(ms).getHours(); }
export function isoWeekKey(d = new Date()) { return weekStartKey(dateKey(d)); }
export { parseKey };
