// Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeStates, xpFromSessions } from "../src/lib/sync-merge.js";

const base = {
  profile: { name: "Mel", theme: "classic", dailyGoalMin: 120, setupDone: true, notifications: false },
  courses: [{ id: "c1", name: "STAT 200" }],
  sessions: [{ id: "s1", courseId: "c1", durationSec: 1500, dateKey: "2026-11-01" }],
  tasks: [{ id: "t1", title: "Ch 7", done: false }, { id: "t2", title: "Lab", done: false }],
  badges: {}, records: { bestDaySec: 1500, reaction: 300 }, xp: 25,
};
const clone = (x) => JSON.parse(JSON.stringify(x));

test("sessions studied on both devices are all kept", () => {
  const phone = clone(base); phone.sessions.push({ id: "s2", durationSec: 600, dateKey: "2026-11-02" });
  const laptop = clone(base); laptop.sessions.push({ id: "s3", durationSec: 1200, dateKey: "2026-11-02" });
  const m = mergeStates(base, phone, laptop);
  assert.deepEqual(m.sessions.map((s) => s.id).sort(), ["s1", "s2", "s3"]);
  assert.equal(m.xp, xpFromSessions(m.sessions));
  assert.equal(m.xp, 25 + 10 + 20);
});

test("a task ticked on one device and renamed on the other keeps both changes", () => {
  const phone = clone(base); phone.tasks[0].done = true;
  const laptop = clone(base); laptop.tasks[0].title = "Ch 7 problems";
  const m = mergeStates(base, phone, laptop);
  assert.deepEqual(m.tasks.find((t) => t.id === "t1"), { id: "t1", title: "Ch 7 problems", done: true });
});

test("deleting on one device removes it everywhere", () => {
  const phone = clone(base); phone.tasks = phone.tasks.filter((t) => t.id !== "t2");
  const laptop = clone(base);
  assert.deepEqual(mergeStates(base, phone, laptop).tasks.map((t) => t.id), ["t1"]);
  assert.deepEqual(mergeStates(base, laptop, phone).tasks.map((t) => t.id), ["t1"]);
});

test("deleted on one device but edited on the other: the edit survives", () => {
  const phone = clone(base); phone.tasks = phone.tasks.filter((t) => t.id !== "t2");
  const laptop = clone(base); laptop.tasks[1].done = true;
  assert.ok(mergeStates(base, phone, laptop).tasks.find((t) => t.id === "t2").done);
});

test("profile: each device's change to different settings is kept", () => {
  const phone = clone(base); phone.profile.theme = "midnight";
  const laptop = clone(base); laptop.profile.dailyGoalMin = 180;
  const m = mergeStates(base, phone, laptop);
  assert.equal(m.profile.theme, "midnight");
  assert.equal(m.profile.dailyGoalMin, 180);
});

test("device-only settings never travel", () => {
  const phone = clone(base); phone.profile.notifications = true;
  const laptop = clone(base); laptop.profile.notifications = false;
  assert.equal(mergeStates(base, phone, laptop).profile.notifications, true);   // phone keeps its own
  assert.equal(mergeStates(base, laptop, phone).profile.notifications, false);  // laptop keeps its own
});

test("first join with no shared history combines both devices", () => {
  const newPhone = { profile: { name: "", setupDone: true }, courses: [{ id: "cX", name: "MATH 100" }], sessions: [{ id: "sX", durationSec: 600 }], tasks: [], badges: { early: 5 }, records: { reaction: 250 } };
  const m = mergeStates(null, newPhone, clone(base));
  assert.deepEqual(m.courses.map((c) => c.id).sort(), ["c1", "cX"]);
  assert.deepEqual(m.sessions.map((s) => s.id).sort(), ["s1", "sX"]);
  assert.equal(m.profile.name, "Mel");                 // the synced profile wins over an empty one
  assert.equal(m.badges.early, 5);
  assert.equal(m.records.reaction, 250);                // best reaction time = lowest
  assert.equal(m.records.bestDaySec, 1500);
});

test("merging is symmetric for additions and stable when nothing changed", () => {
  const a = clone(base); a.sessions.push({ id: "s9", durationSec: 60 });
  const m1 = mergeStates(base, a, clone(base));
  const m2 = mergeStates(base, clone(base), a);
  assert.deepEqual(m1.sessions.map((s) => s.id).sort(), m2.sessions.map((s) => s.id).sort());
  const same = mergeStates(base, clone(base), clone(base));
  assert.deepEqual(same.sessions, base.sessions);
  assert.deepEqual(same.tasks, base.tasks);
});
