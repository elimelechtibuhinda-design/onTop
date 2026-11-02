// Focus mode: full-screen timer (Pomodoro / Deep / Custom / Stopwatch), parking lot,
// tab-switch check, end-of-session check-in, and breaks with break-only games.
import { S, update } from "../lib/store.js";
import { emit, on } from "../lib/bus.js";
import { esc, uid, todayKey, addDays, fmtHMS, fmtHM, dateKey } from "../lib/utils.js";
import { courseById, courseName, taskById } from "../lib/queries.js";
import { bell, chime, duck, tickSound, unlockAudio } from "../lib/audio.js";
import { rewardSession, lastSessionKey } from "../lib/rewards.js";
import { openDialog, confirmDialog, toast, courseOptions } from "../components/ui.js";
import { renderSounds } from "../components/sounds.js";
import { GAMES } from "../games/index.js";
import { countEvent } from "../lib/analytics.js";
import { openPip, closePip, pipOpen, updatePip, pipPing, showButtons as pipButtons, REASONS } from "../components/pip.js";
import { say, requestNotifications } from "../components/toppy.js";

export const MODES = {
  pomodoro: { name: "Pomodoro", desc: "25 focus · 5 break · long break every 4", focus: 25, brk: 5, long: 15 },
  deep: { name: "Deep work", desc: "50 focus · 10 break", focus: 50, brk: 10, long: 20 },
  custom: { name: "Custom", desc: "Your own lengths", focus: 40, brk: 8, long: 15 },
  stopwatch: { name: "Stopwatch", desc: "Count up, break when you want", focus: 0, brk: 5, long: 5 },
};

const KEY = "ontop-timer";
let T = load();                 // live timer state (persisted to localStorage)
let root = null;                // overlay element
let tickHandle = null;
let lastWholeSec = -1;
let gameCleanup = null;
let panel = null;               // "sounds" | "parking" | null
let minimized = false;
let mini = null;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { active: false }; } catch { return { active: false }; }
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(T)); } catch { /* ignore */ } }

export function timerSnapshot() {
  return {
    active: !!T.active,
    phase: T.phase,
    phaseStart: T.phaseStart || 0,
    continuousSec: T.active ? elapsed() : 0,
    paused: !!T.pausedAt,
  };
}

function now() { return Date.now(); }
const nextPingDelay = () => (10 + Math.random() * 10) * 60000;     // 10–20 min, random so it can't be gamed
// Phones: leaving the app is usually the distraction. Laptops: you study in other tabs/apps.
export const defaultWhere = () => (matchMedia("(pointer: coarse)").matches ? "here" : "elsewhere");
function freshFocusStats() {
  return { distractedSec: 0, hiddenAt: null, distractions: 0, reasons: {}, pings: { yes: 0, no: 0 }, nextPingAt: now() + nextPingDelay() };
}
function elapsed() {
  if (!T.active) return 0;
  const end = T.pausedAt || now();
  return Math.max(0, (end - T.phaseStart) / 1000);
}
function remaining() { return T.phaseDurSec ? T.phaseDurSec - elapsed() : null; }

function lengths(mode) {
  const m = MODES[mode];
  if (mode === "custom") {
    const p = S().profile;
    return { focus: p.customFocusMin || 40, brk: p.customBreakMin || 8, long: Math.max(p.customBreakMin * 2, 15) };
  }
  return m;
}

/* ---------------- public entry points ---------------- */
export function initFocus() {
  on("startFocus", (opts) => openFocus(opts || {}));
  document.addEventListener("visibilitychange", onVisibility);
  document.addEventListener("visibilitychange", onReturnForPing);
  navigator.serviceWorker?.addEventListener("message", onPingMessage);
  if (T.active) {
    // Restored after a refresh or closed tab. A check-in dialog can't survive a reload, so re-arm it.
    T.checkinOpen = false;
    openOverlay();
    startTicking();
    toast("Welcome back — your timer kept running ⏱️");
  }
}

export function openFocus({ courseId = null, taskId = null, quick = false } = {}) {
  unlockAudio();
  if (T.active) { minimized = false; openOverlay(); return; }
  const p = S().profile;
  const draft = {
    mode: p.timerMode || "pomodoro",
    courseId: courseId ?? p.lastCourseId ?? (S().courses[0]?.id || ""),
    taskId: taskId || "",
    workingOn: taskId ? taskById(taskId)?.title || "" : "",
  };
  if (quick) return begin(draft);
  openOverlay(draft);
}

/* ---------------- state transitions ---------------- */
function begin(draft) {
  const L = lengths(draft.mode);
  T = {
    active: true,
    mode: draft.mode,
    courseId: draft.courseId || "",
    taskId: draft.taskId || "",
    workingOn: draft.workingOn || "",
    phase: "focus",
    phaseStart: now(),
    phaseDurSec: draft.mode === "stopwatch" ? 0 : L.focus * 60,
    round: 0,
    pausedAt: null,
    where: draft.where || S().profile.studyWhere || defaultWhere(),
    ...freshFocusStats(),
    sessionStartedAt: now(),
    parkingIds: [],
  };
  update((st) => { st.profile.lastCourseId = T.courseId; st.profile.timerMode = T.mode; st.profile.studyWhere = T.where; });
  persist();
  duck(false);
  minimized = false;
  openOverlay();
  startTicking();
}

function startBreak() {
  const L = lengths(T.mode);
  T.round += 1;
  const long = T.mode !== "stopwatch" && T.round % 4 === 0;
  T.phase = "break";
  T.phaseStart = now();
  T.phaseDurSec = (long ? L.long : L.brk) * 60;
  T.pausedAt = null;
  Object.assign(T, freshFocusStats());
  persist();
  duck(true);
  emit("breakStart");
  render();
}

function startNextFocus() {
  const L = lengths(T.mode);
  stopGame();
  T.phase = "focus";
  T.phaseStart = now();
  T.phaseDurSec = T.mode === "stopwatch" ? 0 : L.focus * 60;
  T.pausedAt = null;
  Object.assign(T, freshFocusStats());
  T.breakOver = false;
  persist();
  duck(false);
  render();
}

function endAll() {
  closePip();
  stopGame();
  stopTicking();
  T = { active: false };
  persist();
  duck(false);
  document.title = "onTop";
  closeOverlay();
  emit("timerEnded");
}

function togglePause() {
  if (T.pausedAt) { T.phaseStart += now() - T.pausedAt; T.pausedAt = null; }
  else T.pausedAt = now();
  persist();
  render();
}

/* ---------------- ticking ---------------- */
function startTicking() {
  stopTicking();
  tickHandle = setInterval(tick, 250);
  tick();
}
function stopTicking() { clearInterval(tickHandle); tickHandle = null; }

function tick() {
  if (!T.active) return;
  const rem = remaining();
  const el = elapsed();
  const display = T.phaseDurSec ? (rem >= 0 ? fmtHMS(rem) : "+" + fmtHMS(-rem)) : fmtHMS(el);
  document.title = `${display} · ${T.phase === "focus" ? "Focus" : "Break"} · onTop`;
  if (root && !minimized) {
    const c = root.querySelector(".clock");
    if (c) { c.textContent = display; c.classList.toggle("over", rem !== null && rem < 0); }
    const bar = root.querySelector(".progress i");
    if (bar && T.phaseDurSec) bar.style.width = Math.min(100, (el / T.phaseDurSec) * 100) + "%";
  }
  if (mini) mini.querySelector("b").textContent = display;
  updatePip(display, T.pausedAt ? "Paused" : T.phase === "focus" ? "Focus" : "Break", T.phase === "break");
  if (T.phase === "focus" && !T.pausedAt && !T.checkinOpen && S().profile.focusPings !== false && now() >= (T.nextPingAt || Infinity)) {
    T.nextPingAt = now() + nextPingDelay(); persist();
    sendPing();
  }

  const whole = Math.floor(el);
  if (whole !== lastWholeSec) {
    lastWholeSec = whole;
    if (S().profile.tick && T.phase === "focus" && !T.pausedAt) tickSound();
  }
  if (T.pausedAt || rem === null || rem > 0) return;

  // Phase finished.
  if (T.phase === "focus" && !T.checkinOpen) {
    if (S().profile.soundCues) bell();
    T.checkinOpen = true; persist();
    checkIn({ durationSec: T.phaseDurSec, completed: true, then: startBreak });
  } else if (T.phase === "break" && !T.breakOver) {
    T.breakOver = true; persist();
    if (S().profile.soundCues) chime();
    stopGame("Break's over! Game closed — back to it 💪");
    emit("say", { text: "Break's over! Ready for the next round?" });
    render();
  }
}

/* ---------------- tab-switch check ---------------- */
function onVisibility() {
  if (!T.active || T.phase !== "focus" || T.pausedAt || T.where !== "here") return;
  if (document.hidden) { T.hiddenAt = now(); persist(); return; }
  if (!T.hiddenAt) return;
  const awaySec = (now() - T.hiddenAt) / 1000;
  T.hiddenAt = null; persist();
  if (awaySec < 30 || T.checkinOpen) return;
  openDialog(`
    <h2>Still focused? 👀</h2>
    <p>You left onTop for <b>${fmtHM(awaySec)}</b> during focus time.</p>
    <p class="small muted">No judgement — if you were reading notes in another tab, that counts!</p>
    <div class="dlg-actions">
      <button class="btn" data-dist>Count it as distracted</button>
      <button class="btn primary" data-close>I was studying ✓</button>
    </div>`, (dlg, close) => {
    dlg.querySelector("[data-dist]").addEventListener("click", () => {
      T.distractedSec = (T.distractedSec || 0) + awaySec; persist(); close();
      toast("Logged. Let's lock back in 🔒");
    });
  });
}

/* ---------------- distraction logging & focus pings ---------------- */
function logDistraction() {
  if (!T.active || T.phase !== "focus") return;
  T.distractions = (T.distractions || 0) + 1; persist();
  refreshFocusStats();
}
function logReason(r) {
  if (!T.active) return;
  T.reasons = T.reasons || {};
  T.reasons[r] = (T.reasons[r] || 0) + 1; persist();
}
function answerPing(onTask) {
  if (!T.active || T.phase !== "focus") return;
  T.pings = T.pings || { yes: 0, no: 0 };
  T.pings[onTask ? "yes" : "no"]++;
  T.pendingPing = false;
  persist();
  if (!onTask) logDistraction();
  refreshFocusStats();
}

// "Still on task?" — in the mini window, in a Toppy bubble, or as a system notification.
async function sendPing() {
  if (pipOpen()) { pipPing(); return; }
  if (!document.hidden) { pingInApp("Quick check: still on task? 🎯"); return; }
  const reg = await navigator.serviceWorker?.getRegistration?.();
  if (reg && "Notification" in window && Notification.permission === "granted") {
    reg.showNotification("onTop 🎯 Still on task?", {
      body: `${courseName(T.courseId)} · tap a button to answer`, tag: "ontop-ping", renotify: true,
      icon: "./icon-192.png", badge: "./icon-192.png",
      actions: [{ action: "yes", title: "✅ Yes" }, { action: "no", title: "😵 I drifted" }],
    });
  } else {
    // No way to reach them right now — ask when they come back.
    T.pendingPing = true; persist();
  }
}
function pingInApp(text) {
  say(text, {
    force: true, notify: false, ms: 60000,
    actions: [
      { label: "✅ Yes", run: () => { answerPing(true); toast("Nice — keep going 🔥"); } },
      { label: "😵 I drifted", run: () => { answerPing(false); showReasonChips(); } },
    ],
  });
}
function onPingMessage(e) {
  if (e.data?.type !== "ontop-ping" || !T.active) return;
  if (e.data.answer === "yes") answerPing(true);
  else if (e.data.answer === "no") { answerPing(false); }
  else pingInApp("Quick check: still on task? 🎯");
}
function onReturnForPing() {
  if (!document.hidden && T.active && T.pendingPing && T.phase === "focus") {
    T.pendingPing = false; persist();
    pingInApp("Welcome back! Were you on task while you were away? 🎯");
  }
}

function showReasonChips() {
  const box = root?.querySelector("[data-reasonbox]");
  if (!box) return;
  box.innerHTML = `<div class="small" style="margin-bottom:6px">What pulled you away?</div><div class="chips" style="justify-content:center">${REASONS.map(([k, l]) => `<button class="chip" data-r="${k}">${l}</button>`).join("")}</div>`;
  box.querySelectorAll("[data-r]").forEach((b) => b.addEventListener("click", () => {
    logReason(b.dataset.r); box.innerHTML = ""; toast("Logged. Back to it 💪");
  }));
  clearTimeout(showReasonChips.t);
  showReasonChips.t = setTimeout(() => { if (box.isConnected) box.innerHTML = ""; }, 10000);
}

function focusStatsLine() {
  const p = T.pings || { yes: 0, no: 0 };
  const answered = p.yes + p.no;
  return `😵 ${T.distractions || 0} distraction${T.distractions === 1 ? "" : "s"}${answered ? ` · ✅ ${p.yes}/${answered} on-task check-ins` : ""}`;
}
function refreshFocusStats() {
  const el = root?.querySelector("[data-fstats]");
  if (el) el.textContent = focusStatsLine();
}

async function popOut() {
  const ok = await openPip({
    onDistracted: () => logDistraction(),
    onReason: (r) => logReason(r),
    onPing: (yes) => answerPing(yes),
    onPause: () => togglePause(),
    onBack: () => { minimized = false; openOverlay(); },
    onClose: () => {},
  });
  if (!ok) { toast("Your browser blocked the pop-out. Allow pop-ups for onTop and try again."); return; }
  tick();
  toast("Mini timer popped out — keep it beside your work 🪟");
}

/* ---------------- check-in ---------------- */
function checkIn({ durationSec, completed, quitEarly = false, then }) {
  const task = T.taskId ? taskById(T.taskId) : null;
  const parking = S().parking.filter((p) => (T.parkingIds || []).includes(p.id) && !p.done);
  let focus = 0;
  let taskOutcome = "keep";
  const ctx = { ...T };
  let distractions = ctx.distractions || 0;
  const pings = ctx.pings || { yes: 0, no: 0 };
  const answered = pings.yes + pings.no;
  openDialog(`
    <h2>${quitEarly ? "Session ended early" : "Session complete! 🎉"}</h2>
    <p class="muted">${esc(courseName(ctx.courseId))} · ${fmtHM(durationSec)}${ctx.distractedSec ? ` · ${fmtHM(ctx.distractedSec)} distracted` : ""}</p>
    ${quitEarly ? `<p class="small">🥀 Ending early wilts this session's plant. That's okay — the minutes still count.</p>` : ""}
    <div class="field"><span>How focused were you?</span>
      <div class="chips" data-focus>
        ${["😩 Rough", "😐 Meh", "🙂 Good", "🔥 Locked in"].map((l, i) => `<button class="chip" data-v="${i + 1}">${l}</button>`).join("")}
      </div>
    </div>
    <div class="field"><span>How many times did you get distracted? <span class="hint">${ctx.distractions ? `you logged ${ctx.distractions}` : "best guess is fine"}</span></span>
      <div class="chips" data-dcount>${[0, 1, 2, 3, 4, 5].map((n) => `<button class="chip ${Math.min(distractions, 5) === n ? "active" : ""}" data-v="${n}">${n === 5 ? "5+" : n}</button>`).join("")}</div>
      ${answered ? `<span class="hint">🎯 Check-ins: on task ${pings.yes} of ${answered} time${answered > 1 ? "s" : ""}</span>` : ""}</div>
    <label class="field"><span>What did you cover? <span class="hint">(optional)</span></span>
      <textarea data-note rows="2" placeholder="e.g. Ch 7 confidence intervals, Q1–12">${esc(ctx.workingOn)}</textarea></label>
    ${task ? `<div class="field"><span>Did you finish “${esc(task.title)}”?</span>
      <div class="chips" data-task>
        <button class="chip" data-v="done">✓ Finished</button>
        <button class="chip" data-v="tomorrow">↪ Carry over to tomorrow</button>
        <button class="chip active" data-v="keep">Keep for today</button>
      </div></div>` : ""}
    <label class="check"><input type="checkbox" data-review> Add to spaced review (reminds you in 1, 3, 7 & 14 days)</label>
    <input type="text" data-topic placeholder="Topic to review, e.g. Confidence intervals" value="${esc(ctx.workingOn)}" hidden>
    ${parking.length ? `<div class="card flat"><b>📝 Your parking lot</b>
      ${parking.map((p) => `<label class="check small"><input type="checkbox" data-park="${p.id}"> ${esc(p.text)}</label>`).join("")}
      <p class="tiny muted">Tick what's handled. The rest stays on your Today page.</p></div>` : ""}
    <div class="dlg-actions">
      <button class="btn" data-discard>Don't save</button>
      <button class="btn primary" data-save>Save session</button>
    </div>`, (dlg, close) => {
    dlg.querySelectorAll("[data-focus] .chip").forEach((b) => b.addEventListener("click", () => {
      focus = +b.dataset.v;
      dlg.querySelectorAll("[data-focus] .chip").forEach((x) => x.classList.toggle("active", x === b));
    }));
    dlg.querySelectorAll("[data-dcount] .chip").forEach((b) => b.addEventListener("click", () => {
      distractions = Math.max(+b.dataset.v, +b.dataset.v === 5 ? Math.max(5, ctx.distractions || 0) : 0);
      dlg.querySelectorAll("[data-dcount] .chip").forEach((x) => x.classList.toggle("active", x === b));
    }));
    dlg.querySelectorAll("[data-task] .chip").forEach((b) => b.addEventListener("click", () => {
      taskOutcome = b.dataset.v;
      dlg.querySelectorAll("[data-task] .chip").forEach((x) => x.classList.toggle("active", x === b));
    }));
    dlg.querySelector("[data-review]").addEventListener("change", (e) => { dlg.querySelector("[data-topic]").hidden = !e.target.checked; });
    dlg.querySelector("[data-discard]").addEventListener("click", async () => {
      if (await confirmDialog("This session won't be logged.", { okText: "Discard", danger: true })) { close(); }
    });
    dlg.querySelector("[data-save]").addEventListener("click", () => {
      const note = dlg.querySelector("[data-note]").value.trim();
      const wantReview = dlg.querySelector("[data-review]").checked;
      const topic = dlg.querySelector("[data-topic]").value.trim() || note || courseName(ctx.courseId);
      const parkDone = Array.from(dlg.querySelectorAll("[data-park]:checked")).map((c) => c.dataset.park);
      const startMs = now() - durationSec * 1000;
      const session = {
        id: uid(), courseId: ctx.courseId, taskId: ctx.taskId, start: startMs, durationSec: Math.round(durationSec),
        distractedSec: Math.round(ctx.distractedSec || 0), focus, note, dateKey: dateKey(new Date(startMs)),
        mode: ctx.mode, completed,
        distractions, reasons: ctx.reasons || {}, pings: { ...pings }, where: ctx.where || "elsewhere",
      };
      const prevLast = lastSessionKey();
      update((st) => {
        st.sessions.push(session);
        if (task) {
          const t = st.tasks.find((x) => x.id === task.id);
          if (t && taskOutcome === "done") { t.done = true; t.doneAt = Date.now(); }
          if (t && taskOutcome === "tomorrow") { t.date = addDays(todayKey(), 1); t.carried = (t.carried || 0) + 1; }
        }
        if (wantReview) {
          st.reviews.push({ id: uid(), courseId: ctx.courseId, topic, learnedOn: todayKey(), stage: 0, due: addDays(todayKey(), 1), done: false });
        }
        st.parking.forEach((p) => { if (parkDone.includes(p.id)) p.done = true; });
      });
      rewardSession(session, { quitEarly, prevLastKey: prevLast });
      countEvent("focus-session");
      if (taskOutcome === "done") emit("celebrate", { text: `Task done: ${task.title} ✅` });
      close();
    });
  }, {
    onClose: () => {
      T.checkinOpen = false;
      persist();
      then && then();
    },
  });
}

/* ---------------- overlay rendering ---------------- */
function openOverlay(draft) {
  if (mini) { mini.remove(); mini = null; }
  if (!root) {
    root = document.createElement("div");
    root.className = "focus";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Focus mode");
    document.body.appendChild(root);
    document.body.classList.add("focus-open");
  }
  root.hidden = false;
  render(draft);
}
function closeOverlay() {
  stopGame();
  root?.remove(); root = null;
  mini?.remove(); mini = null;
  panel = null;
  document.body.classList.remove("focus-open");
}
function minimize() {
  minimized = true;
  stopGame();
  root?.remove(); root = null;
  document.body.classList.remove("focus-open");
  mini = document.createElement("button");
  mini.className = "btn gold";
  mini.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:95;box-shadow:0 6px 20px rgba(0,0,0,.25)";
  mini.innerHTML = `${T.phase === "focus" ? "🎯" : "☕"} <b class="mono">--:--</b> · Open timer`;
  mini.addEventListener("click", () => { minimized = false; openOverlay(); });
  document.body.appendChild(mini);
  tick();
}

let currentDraft = null;
function render(draft) {
  if (!root) return;
  if (gameCleanup) stopGame();
  if (!T.active) return renderSetup(draft || currentDraft);
  root.classList.toggle("break", T.phase === "break");
  const course = courseById(T.courseId);
  const L = lengths(T.mode);
  const roundsTotal = T.mode === "stopwatch" ? 0 : 4;
  const done = T.round % 4;
  const isFocus = T.phase === "focus";
  root.innerHTML = `
    <div class="focus-top">
      <div class="row"><span style="font-size:1.4rem">${course ? esc(course.emoji) : "📘"}</span>
        <b>${esc(course ? course.name : "General study")}</b><span class="pill">${MODES[T.mode].name}</span></div>
      <div class="row">
        <button class="icon-btn" data-panel="sounds" title="Sounds & music" aria-label="Sounds and music">🎧</button>
        <button class="icon-btn" data-panel="parking" title="Parking lot" aria-label="Parking lot">📝</button>
        <button class="icon-btn" data-min title="Minimize" aria-label="Minimize timer">⤡</button>
      </div>
    </div>
    <div class="focus-center">
      <div class="phase">${isFocus ? (T.pausedAt ? "Paused" : "Focus") : T.breakOver ? "Break over" : (T.round % 4 === 0 && T.mode !== "stopwatch" ? "Long break" : "Break")}</div>
      <div class="clock" aria-live="off">--:--</div>
      ${T.phaseDurSec ? `<div class="progress"><i style="width:0"></i></div>` : ""}
      ${roundsTotal ? `<div class="rounds" aria-label="Round ${done + (isFocus ? 1 : 0)} of 4">${[0, 1, 2, 3].map((i) => `<i class="${i < done ? "on" : ""}"></i>`).join("")}</div>` : ""}
      ${isFocus ? `<div class="working">${T.workingOn ? `Working on: <b>${esc(T.workingOn)}</b>` : `<input type="text" data-working placeholder="What are you working on? (one line)" aria-label="What are you working on">`}</div>` : ""}
      <div class="focus-actions">
        ${isFocus ? `
          <button class="btn" data-pause>${T.pausedAt ? "▶ Resume" : "⏸ Pause"}</button>
          <button class="btn" data-distracted>😵 Got distracted</button>
          <button class="btn" data-popout title="A small timer that floats over your other apps">🪟 Pop-out timer</button>
          ${T.mode === "stopwatch" ? `<button class="btn" data-takebreak>☕ Take a break</button>` : ""}
          <button class="btn gold" data-finish>${T.mode === "stopwatch" ? "✓ Finish session" : "■ End session"}</button>`
        : `
          ${T.breakOver ? `<button class="btn gold" data-next>▶ Start round ${T.round + 1}</button>` : `<button class="btn" data-next>⏭ Skip break</button>`}
          <button class="btn" data-stop>Done for now</button>`}
      </div>
      ${isFocus ? `<div data-reasonbox></div>
        <div class="small" style="color:#a9bdd6" data-fstats>${focusStatsLine()}</div>
        <div class="tiny" style="color:#a9bdd6;max-width:520px">${T.where === "here"
          ? "📱 Studying right here — leaving onTop counts as a possible distraction."
          : "💻 Working in other tabs/apps is fine. Pop out the mini timer to log distractions and answer quick “still on task?” check-ins."}</div>` : ""}
      ${!isFocus && !T.breakOver ? `
        <p class="muted" style="color:#cfe7da">Stand up · drink water 💧 · look outside. Or play something — games lock when the break ends.</p>
        <div class="games-grid">${GAMES.map((g) => `<button class="game-tile" data-game="${g.id}"><span class="e">${g.emoji}</span>${esc(g.name)}</button>`).join("")}</div>
        <div class="game-stage" data-stage hidden></div>` : ""}
      ${panel ? `<div class="panel" data-panelbox></div>` : ""}
    </div>`;

  root.querySelectorAll("[data-panel]").forEach((b) => b.addEventListener("click", () => { panel = panel === b.dataset.panel ? null : b.dataset.panel; render(); }));
  root.querySelector("[data-min]").addEventListener("click", minimize);
  root.querySelector("[data-pause]")?.addEventListener("click", togglePause);
  root.querySelector("[data-distracted]")?.addEventListener("click", () => { logDistraction(); showReasonChips(); });
  root.querySelector("[data-popout]")?.addEventListener("click", popOut);
  root.querySelector("[data-takebreak]")?.addEventListener("click", () => {
    const dur = elapsed();
    T.checkinOpen = true; persist();
    checkIn({ durationSec: dur, completed: true, then: startBreak });
  });
  root.querySelector("[data-finish]")?.addEventListener("click", finishPressed);
  root.querySelector("[data-next]")?.addEventListener("click", startNextFocus);
  root.querySelector("[data-stop]")?.addEventListener("click", endAll);
  const w = root.querySelector("[data-working]");
  w?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && w.value.trim()) { T.workingOn = w.value.trim(); persist(); render(); }
  });
  w?.addEventListener("blur", () => { if (w.value.trim()) { T.workingOn = w.value.trim(); persist(); } });
  root.querySelectorAll("[data-game]").forEach((b) => b.addEventListener("click", () => startGame(b.dataset.game)));
  if (panel) renderPanel(root.querySelector("[data-panelbox]"));
  tick();
}

async function finishPressed() {
  const el = elapsed();
  if (T.mode === "stopwatch") {
    T.checkinOpen = true; persist();
    return checkIn({ durationSec: el, completed: true, then: endAll });
  }
  const early = el < T.phaseDurSec;
  if (early && !(await confirmDialog(`You're ${fmtHM(T.phaseDurSec - el)} away from finishing this round. End now? Your garden plant will wilt 🥀`, { okText: "End session", title: "End early?" }))) return;
  if (el < 60) { endAll(); toast("Session under a minute — not logged."); return; }
  T.checkinOpen = true; persist();
  checkIn({ durationSec: el, completed: !early, quitEarly: early, then: endAll });
}

function renderPanel(box) {
  if (panel === "sounds") return renderSounds(box);
  const items = S().parking.filter((p) => !p.done);
  box.innerHTML = `
    <h3>📝 Parking lot</h3>
    <p class="small muted">Random thought? Park it here, deal with it after. Your brain can let go now.</p>
    <div class="row" style="margin-top:10px"><input type="text" data-park placeholder="e.g. text mom, buy charger" class="grow"><button class="btn sm gold" data-add>Park it</button></div>
    <div style="margin-top:8px">${items.map((p) => `<div class="small">• ${esc(p.text)}</div>`).join("") || `<p class="small muted">Empty — nice, clear head.</p>`}</div>`;
  const input = box.querySelector("[data-park]");
  const add = () => {
    const text = input.value.trim();
    if (!text) return;
    const id = uid();
    update((st) => st.parking.push({ id, text, done: false, createdAt: Date.now() }));
    T.parkingIds = [...(T.parkingIds || []), id]; persist();
    toast("Parked 🅿️ — back to focus");
    renderPanel(box);
    box.querySelector("[data-park]").focus();
  };
  box.querySelector("[data-add]").addEventListener("click", add);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
  input.focus();
}

/* ---------------- setup screen (before a session) ---------------- */
function renderSetup(draft) {
  currentDraft = draft = draft || { mode: S().profile.timerMode, courseId: S().courses[0]?.id || "", taskId: "", workingOn: "" };
  draft.where = draft.where || S().profile.studyWhere || defaultWhere();
  root.classList.remove("break");
  const st = S();
  const tasks = st.tasks.filter((t) => !t.done && (!draft.courseId || t.courseId === draft.courseId) && (!t.date || t.date <= todayKey()));
  const p = st.profile;
  root.innerHTML = `
    <div class="focus-top"><b>Start a focus session</b><button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="focus-center">
      <div class="mode-cards">
        ${Object.entries(MODES).map(([id, m]) => `<button class="mode-card ${draft.mode === id ? "active" : ""}" data-mode="${id}"><b>${m.name}</b><span>${id === "custom" ? `${p.customFocusMin} focus · ${p.customBreakMin} break` : m.desc}</span></button>`).join("")}
      </div>
      ${draft.mode === "custom" ? `<div class="panel row wrap">
        <label class="field grow"><span>Focus (min)</span><input type="number" min="1" value="${p.customFocusMin}" data-cf></label>
        <label class="field grow"><span>Break (min)</span><input type="number" min="1" value="${p.customBreakMin}" data-cb></label></div>` : ""}
      <div class="panel stack">
        <label class="field"><span>Course</span><select data-course>${courseOptions(st.courses, draft.courseId)}</select></label>
        <label class="field"><span>Task <span class="muted">(optional)</span></span>
          <select data-task><option value="">— none —</option>${tasks.map((t) => `<option value="${t.id}" ${t.id === draft.taskId ? "selected" : ""}>${esc(t.title)}${t.estMin ? ` (~${t.estMin}m)` : ""}</option>`).join("")}</select></label>
        <label class="field"><span>What are you working on?</span><input type="text" data-working value="${esc(draft.workingOn)}" placeholder="One line, e.g. Ch 7 practice problems"></label>
      </div>
      <div class="panel stack">
        <div class="field"><span>Where will you be working?</span>
          <div class="mode-cards">
            <button class="mode-card ${draft.where === "elsewhere" ? "active" : ""}" data-where="elsewhere"><b>💻 Other tabs & apps</b><span>Canvas, PDFs, Docs, an IDE… Leaving onTop is fine.</span></button>
            <button class="mode-card ${draft.where === "here" ? "active" : ""}" data-where="here"><b>📱 Right here / phone</b><span>Leaving onTop counts as a possible distraction.</span></button>
          </div></div>
        <label class="check small"><input type="checkbox" data-pings ${p.focusPings !== false ? "checked" : ""}> 🎯 Focus pings — a quick “still on task?” every 10–20 min</label>
        ${p.focusPings !== false && draft.where === "elsewhere" && "Notification" in window && Notification.permission !== "granted"
          ? `<div class="row wrap small"><span class="muted grow">To answer pings from other apps, allow notifications.</span><button class="btn sm" data-allownotif>Allow</button></div>` : ""}
      </div>
      <button class="btn gold lg" data-go>▶ Start focusing</button>
    </div>`;
  root.querySelector("[data-close]").addEventListener("click", closeOverlay);
  root.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => { draft.mode = b.dataset.mode; renderSetup(draft); }));
  root.querySelector("[data-course]").addEventListener("change", (e) => { draft.courseId = e.target.value; draft.taskId = ""; renderSetup(draft); });
  root.querySelector("[data-task]").addEventListener("change", (e) => {
    draft.taskId = e.target.value;
    if (draft.taskId) draft.workingOn = taskById(draft.taskId)?.title || draft.workingOn;
    renderSetup(draft);
  });
  root.querySelector("[data-working]").addEventListener("input", (e) => { draft.workingOn = e.target.value; });
  root.querySelector("[data-cf]")?.addEventListener("change", (e) => update((s) => { s.profile.customFocusMin = Math.max(1, +e.target.value || 40); }));
  root.querySelector("[data-cb]")?.addEventListener("change", (e) => update((s) => { s.profile.customBreakMin = Math.max(1, +e.target.value || 8); }));
  root.querySelectorAll("[data-where]").forEach((b) => b.addEventListener("click", () => { draft.where = b.dataset.where; renderSetup(draft); }));
  root.querySelector("[data-pings]").addEventListener("change", (e) => { update((s2) => { s2.profile.focusPings = e.target.checked; }); renderSetup(draft); });
  root.querySelector("[data-allownotif]")?.addEventListener("click", async () => { await requestNotifications(); renderSetup(draft); });
  root.querySelector("[data-go]").addEventListener("click", () => begin(draft));
}

/* ---------------- break games ---------------- */
function startGame(id) {
  if (!T.active || T.phase !== "break" || T.breakOver) return;
  stopGame();
  const g = GAMES.find((x) => x.id === id);
  const stage = root.querySelector("[data-stage]");
  stage.hidden = false;
  stage.innerHTML = `<div class="row between" style="margin-bottom:10px"><b>${g.emoji} ${esc(g.name)}</b><button class="btn sm" data-closegame>Close</button></div><div data-gamebox></div>`;
  stage.querySelector("[data-closegame]").addEventListener("click", () => stopGame());
  gameCleanup = g.mount(stage.querySelector("[data-gamebox]"), {
    secondsLeft: () => Math.max(0, remaining() || 0),
  }) || null;
  stage.scrollIntoView({ behavior: "smooth", block: "center" });
}
function stopGame(msg) {
  if (gameCleanup) { try { gameCleanup(); } catch { /* ignore */ } gameCleanup = null; if (msg) toast(msg); }
  const stage = root?.querySelector("[data-stage]");
  if (stage) { stage.hidden = true; stage.innerHTML = ""; }
}

export function isFocusActive() { return !!T.active; }
export { fmtHM };
