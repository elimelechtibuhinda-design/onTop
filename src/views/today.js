// Today: the home screen. One-tap start, today's plan, countdowns, goal ring, streak, tip.
import { S, update } from "../lib/store.js";
import { emit } from "../lib/bus.js";
import { esc, uid, todayKey, addDays, daysUntil, fmtHM, fmtDate, fmtTime, dayOfYear, weekStartKey } from "../lib/utils.js";
import {
  secOn, secInRange, streakInfo, levelInfo, weekSec, upcomingEvents, courseName, courseColor, courseEmoji, tasksOn,
  dueReviews, nearestDeadlineDays, taskById,
} from "../lib/queries.js";
import { ring, openDialog, courseOptions, toast } from "../components/ui.js";
import { progress, fmtCurrent } from "../components/smart.js";
import { completeReview } from "../lib/flash.js";
import { openFocus } from "./focus.js";
import { backupNow } from "./me.js";

export const TIPS = [
  ["🧪", "Test yourself instead of rereading. Retrieval practice beats highlighting every time."],
  ["🔁", "Space it out: 3 × 1 hour beats 1 × 3 hours for long-term memory."],
  ["🔀", "Interleave: mix problem types (Ch 5, 6, 7) instead of doing one chapter in a block."],
  ["🗣️", "Explain it out loud like you're teaching a friend. Gaps show up fast."],
  ["📵", "Phone in another room = measurably better focus. Out of sight, out of mind."],
  ["😴", "Sleep consolidates memory. An all-nighter costs more than it earns."],
  ["✍️", "Handwritten summaries help concepts stick better than typed transcripts."],
  ["🎯", "Start with the hardest task while your energy is highest."],
  ["⏱️", "Can't start? Commit to just 5 minutes. Starting is the hardest part."],
  ["📝", "Do past exams under timed conditions. Practice the performance, not just the content."],
  ["🧠", "Ask 'why' and 'how' about each fact — elaboration builds connections."],
  ["🖼️", "Pair words with visuals: draw diagrams, timelines and concept maps."],
  ["💧", "Mild dehydration hurts concentration. Keep water on your desk."],
  ["🚶", "A 10-minute walk before studying can boost attention."],
  ["🧩", "Break big assignments into tasks under 1 hour. Small wins build momentum."],
  ["📅", "Plan tomorrow tonight — you'll start faster in the morning."],
  ["🎧", "Lyrics compete with reading. Try instrumental or ambient sound."],
  ["🙋", "Go to office hours early in the term, not the night before the exam."],
  ["🔍", "After each practice question, check why wrong answers are wrong."],
  ["📚", "Preview the lecture slides for 10 minutes before class."],
  ["🧘", "Exam nerves? 4-4-4 breathing calms your nervous system in a minute."],
  ["👥", "Study groups work best when everyone prepares first, then quizzes each other."],
  ["🏁", "End each session by writing the very next step. Future-you will thank you."],
  ["🍎", "Eat real food before an exam — your brain runs on glucose."],
  ["🔄", "Review notes within 24 hours of a lecture to beat the forgetting curve."],
  ["📏", "Make goals SMART: 'Finish Ch 7 problems by Friday', not 'study stats more'."],
  ["🪑", "Same place, same time builds a study habit faster than willpower."],
  ["🌲", "Look at something far away every 20 minutes. Your eyes will thank you."],
  ["💙", "Progress, not perfection. One focused session today is a win."],
  ["🐦", "Early bird or night owl — consistency is the real cheat code."],
];

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Up late" : h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
}

export function renderToday(el) {
  const st = S();
  const p = st.profile;
  const today = todayKey();
  const todaySec = secOn(today);
  const goalSec = (p.dailyGoalMin || 120) * 60;
  const streak = streakInfo();
  const lvl = levelInfo();
  const events = upcomingEvents();
  const dueThisWeek = events.filter((e) => daysUntil(e.date) <= 7).length;
  const tasks = tasksOn(today).sort((a, b) => a.done - b.done);
  const reviews = dueReviews();
  const parking = st.parking.filter((x) => !x.done);
  const goals = st.goals.filter((g) => g.status === "active").slice(0, 4);
  const tip = TIPS[dayOfYear() % TIPS.length];
  const nearExam = events.find((e) => e.type === "exam" && daysUntil(e.date) <= 2);
  const needBackup = st.sessions.length > 0 && Date.now() - (p.lastBackup || 0) > 7 * 86400000;
  // Weekly recap: offered on Sunday for this week, or Monday for last week if it was missed.
  const dow = new Date().getDay();
  const recapWeek = dow === 0 ? weekStartKey() : dow === 1 ? addDays(weekStartKey(), -7) : null;
  const showRecap = recapWeek && p.lastRecapWeek !== recapWeek && secInRange(recapWeek, addDays(recapWeek, 6)) > 0;
  const plan = p.dayPlan && p.dayPlan.date === today ? p.dayPlan : null;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const iosTip = isIOS && !navigator.standalone && !matchMedia("(display-mode: standalone)").matches && !p.iosTipDismissed;

  el.innerHTML = `
    <section class="hero">
      <div class="hero-grid">
        <div class="hero-head">
          <h1>${greeting()}, ${esc(p.name || "there")}.</h1>
          <p class="sub">${dueThisWeek ? `${dueThisWeek} thing${dueThisWeek > 1 ? "s" : ""} due this week.` : "Nothing due this week — get ahead!"} ${fmtDate(today, { weekday: "long", month: "long", day: "numeric" })}</p>
        </div>
        ${ring(todaySec / goalSec, { inner: `<b>${fmtHM(todaySec)}</b><span class="tiny" style="color:#c9d8ea">of ${fmtHM(goalSec)}</span>` })}
        <div class="stack hero-actions">
          <div class="hero-modes" role="radiogroup" aria-label="Timer type">
            <button role="radio" aria-checked="${p.timerMode !== "stopwatch"}" class="${p.timerMode !== "stopwatch" ? "on" : ""}" data-tmode="pomo">🍅 Pomodoro</button>
            <button role="radio" aria-checked="${p.timerMode === "stopwatch"}" class="${p.timerMode === "stopwatch" ? "on" : ""}" data-tmode="free">⏱️ Free timer</button>
          </div>
          <div class="row wrap">
            <select class="course-pick" data-course aria-label="Course to study">${courseOptions(st.courses, p.lastCourseId || st.courses[0]?.id || "")}</select>
            <button class="start-btn" data-start>▶ Start</button>
            <button class="btn ghost" style="color:#fff" data-setup>Options</button>
          </div>
        </div>
      </div>
      <div class="stat-row">
        <span class="stat-chip" title="Study streak">🔥 ${streak.streak} day${streak.streak === 1 ? "" : "s"}</span>
        <span class="stat-chip" title="One freeze per week covers a missed day">🧊 ${streak.freezeLeft ? "1 freeze left" : "freeze used"}</span>
        <span class="stat-chip">${lvl.rank.emoji} Lvl ${lvl.level} · ${lvl.rank.name}</span>
        <span class="stat-chip">⏱ ${fmtHM(weekSec())} this week</span>
      </div>
    </section>

    ${iosTip ? `<div class="card section row between wrap" style="border-color:var(--sky)">
      <div><b>📲 On iPhone? Add Dialed In to your Home Screen</b><p class="small muted">Safari can clear website data after 7 days without a visit. Apps on your Home Screen keep it. Tap <b>Share</b> → <b>Add to Home Screen</b>.</p></div>
      <button class="btn sm ghost" data-hideios>Got it</button></div>` : ""}
    ${needBackup ? `<div class="card section row between wrap" style="border-color:var(--gold)">
      <div><b>💾 Back up your data</b><p class="small muted">Everything lives on this device. A backup file keeps it safe if your browser data is cleared.</p></div>
      <button class="btn gold" data-backup>Back up now</button></div>` : ""}
    ${showRecap ? `<div class="card section row between wrap">
      <div><b>📬 Your weekly recap is ready</b><p class="small muted">See your week and share it with your study group.</p></div>
      <button class="btn primary" data-recap>Open recap</button></div>` : ""}
    ${nearExam ? examChecklistCard(nearExam) : ""}

    <div class="grid-2 section">
      <div class="card">
        <div class="card-head"><h3>Today's plan</h3><button class="btn sm" data-planday>🪄 Plan my day</button></div>
        ${plan ? timeline(plan) : ""}
        <div data-tasks>
          ${tasks.length ? tasks.map(taskRow).join("") : `<p class="muted small">No tasks for today yet. Add one below, or drag some onto today in Plan → Week.</p>`}
        </div>
        <form class="row" data-addtask style="margin-top:10px">
          <input type="text" name="title" placeholder="Add a task, e.g. Ch 7 practice" class="grow" aria-label="New task">
          <input type="number" name="est" placeholder="min" min="5" step="5" style="width:76px" aria-label="Estimated minutes">
          <button class="btn sm primary">Add</button>
        </form>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-head"><h3>Countdowns</h3><button class="btn sm ghost" data-go="calendar">+ Add date</button></div>
          ${events.length ? `<div class="stack tight">${events.slice(0, 4).map(countdown).join("")}</div>` : `<p class="muted small">Add exams and deadlines to see countdowns.</p>`}
        </div>
        <div class="card tip"><span class="big" aria-hidden="true">${tip[0]}</span><div><span class="label">Tip of the day</span><p>${esc(tip[1])}</p></div></div>
      </div>
    </div>

    <div class="grid-2 section">
      <div class="card">
        <div class="card-head"><h3>🎯 SMART goals</h3><button class="btn sm ghost" data-go="goals">All goals</button></div>
        ${goals.length ? goals.map(goalRow).join("") : `<p class="muted small">No active goals. <a href="#" data-go="goals">Set a SMART goal</a> — specific, measurable, achievable, relevant, time-bound.</p>`}
      </div>
      <div class="stack">
        ${reviews.length ? `<div class="card"><div class="card-head"><h3>🧠 Reviews due</h3><span class="pill gold">${reviews.length}</span></div>
          ${reviews.slice(0, 5).map((r) => `<div class="task"><input type="checkbox" data-review="${r.id}" aria-label="Mark reviewed"><div class="grow"><div class="t-title">${esc(r.topic)}</div><div class="t-meta">${esc(courseName(r.courseId))} · review ${r.stage + 1} of 4</div></div></div>`).join("")}</div>` : ""}
        <div class="card">
          <div class="card-head"><h3>📝 Parking lot</h3></div>
          ${parking.length ? parking.map((x) => `<div class="task"><input type="checkbox" data-park="${x.id}" aria-label="Done"><div class="grow">${esc(x.text)}</div></div>`).join("") : `<p class="muted small">Thoughts you park during focus show up here.</p>`}
        </div>
      </div>
    </div>`;

  // Events
  el.querySelector("[data-start]").addEventListener("click", () => {
    const courseId = el.querySelector("[data-course]").value;
    update((s) => { s.profile.lastCourseId = courseId; });
    openFocus({ courseId, quick: true });
  });
  el.querySelectorAll("[data-tmode]").forEach((b) => b.addEventListener("click", () => update((s2) => {
    s2.profile.timerMode = b.dataset.tmode === "free" ? "stopwatch" : (s2.profile.pomoMode || "pomodoro");
  })));
  el.querySelector("[data-setup]").addEventListener("click", () => openFocus({ courseId: el.querySelector("[data-course]").value }));
  el.querySelector("[data-backup]")?.addEventListener("click", backupNow);
  el.querySelector("[data-hideios]")?.addEventListener("click", () => update((s2) => { s2.profile.iosTipDismissed = true; }));
  el.querySelector("[data-recap]")?.addEventListener("click", () => emit("go", { view: "stats", recap: recapWeek }));
  el.querySelector("[data-planday]").addEventListener("click", planMyDay);
  el.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); emit("go", { view: "plan", tab: b.dataset.go }); }));
  el.querySelector("[data-addtask]").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    const title = f.title.value.trim();
    if (!title) return;
    update((s) => s.tasks.push({ id: uid(), courseId: el.querySelector("[data-course]").value, title, estMin: +f.est.value || 0, date: today, done: false, carried: 0, createdAt: Date.now() }));
  });
  wireTaskRows(el);
  el.querySelectorAll("[data-review]").forEach((c) => c.addEventListener("change", () => { completeReview(c.dataset.review); toast("Reviewed ✓ Next one scheduled."); }));
  el.querySelectorAll("[data-park]").forEach((c) => c.addEventListener("change", () => update((s) => { s.parking.find((x) => x.id === c.dataset.park).done = true; })));
  el.querySelectorAll("[data-check]").forEach((c) => c.addEventListener("change", () => update((s) => { s.checklist.find((x) => x.id === c.dataset.check).done = c.checked; })));
  el.querySelector("[data-resetcheck]")?.addEventListener("click", () => update((s) => s.checklist.forEach((x) => { x.done = false; })));
}

export function taskRow(t) {
  return `<div class="task ${t.done ? "done" : ""}">
    <input type="checkbox" data-done="${t.id}" ${t.done ? "checked" : ""} aria-label="Done">
    <span class="dot" style="background:${courseColor(t.courseId)}"></span>
    <div class="grow"><div class="t-title">${esc(t.title)}</div>
      <div class="t-meta">${esc(courseName(t.courseId))}${t.estMin ? ` · ~${t.estMin} min` : ""}${t.carried ? ` · <span class="pill warn">↪ moved ${t.carried}×</span>` : ""}</div></div>
    ${t.done ? "" : `<button class="icon-btn" data-starttask="${t.id}" title="Focus on this" aria-label="Start focus on this task">▶</button>`}
    <button class="icon-btn" data-deltask="${t.id}" title="Delete" aria-label="Delete task">✕</button>
  </div>`;
}

export function wireTaskRows(el) {
  el.querySelectorAll("[data-done]").forEach((c) => c.addEventListener("change", () => {
    update((s) => { const t = s.tasks.find((x) => x.id === c.dataset.done); t.done = c.checked; t.doneAt = c.checked ? Date.now() : null; });
    if (c.checked) emit("celebrate", { text: "Task done ✅ Nice!" });
  }));
  el.querySelectorAll("[data-starttask]").forEach((b) => b.addEventListener("click", () => {
    const t = taskById(b.dataset.starttask);
    openFocus({ courseId: t.courseId, taskId: t.id });
  }));
  el.querySelectorAll("[data-deltask]").forEach((b) => b.addEventListener("click", () => update((s) => { s.tasks = s.tasks.filter((x) => x.id !== b.dataset.deltask); })));
}

function countdown(e) {
  const d = daysUntil(e.date);
  const cls = d <= 2 ? "red" : d <= 7 ? "amber" : "";
  return `<div class="countdown ${cls}">
    <div class="days">${d === 0 ? "🔥" : d}<small>${d === 0 ? "today" : d === 1 ? "day" : "days"}</small></div>
    <div class="grow"><b>${esc(courseEmoji(e.courseId))} ${esc(courseName(e.courseId))} ${esc(e.title)}</b><div class="small muted">${fmtDate(e.date)} · ${esc(e.type)}</div></div>
  </div>`;
}

function goalRow(g) {
  const p = progress(g);
  return `<div style="margin-bottom:12px">
    <div class="row between"><b class="small">${esc(g.title)}</b><span class="tiny muted">${fmtCurrent(g, p)}</span></div>
    <div class="bar" style="margin:6px 0"><i style="width:${p.pct * 100}%;background:${courseColor(g.courseId)}"></i></div>
    <div class="tiny muted">${p.daily || "Due " + fmtDate(g.deadline)}</div>
  </div>`;
}

function timeline(plan) {
  return `<div class="timeline" style="margin:4px 0 14px">${plan.items.map((it) => {
    if (it.type === "break") return `<div class="tl brk small muted">${fmtTime(it.start)} · ☕ ${Math.round((it.end - it.start) / 60000)} min break</div>`;
    const t = taskById(it.taskId);
    if (!t) return "";
    return `<div class="tl small"><b>${fmtTime(it.start)}–${fmtTime(it.end)}</b> · ${esc(t.title)} ${t.done ? "✅" : ""}</div>`;
  }).join("")}</div>`;
}

function examChecklistCard(exam) {
  const items = S().checklist;
  return `<div class="card section" style="border-color:var(--danger)">
    <div class="card-head"><h3>📋 Exam-day checklist — ${esc(courseName(exam.courseId))} ${esc(exam.title)} ${daysUntil(exam.date) === 0 ? "is TODAY" : `in ${daysUntil(exam.date)} day${daysUntil(exam.date) > 1 ? "s" : ""}`}</h3>
      <button class="btn sm ghost" data-resetcheck>Reset</button></div>
    <div class="grid-3">${items.map((c) => `<label class="check"><input type="checkbox" data-check="${c.id}" ${c.done ? "checked" : ""}> ${esc(c.text)}</label>`).join("")}</div>
  </div>`;
}

/* ---------------- Plan my day ---------------- */
function planMyDay() {
  const today = todayKey();
  const candidates = S().tasks.filter((t) => !t.done && (!t.date || t.date <= today));
  if (!candidates.length) { toast("Add a few tasks first, then I'll order them for you."); return; }
  const d = new Date();
  d.setMinutes(Math.ceil((d.getMinutes() + 1) / 5) * 5, 0, 0);
  const startDefault = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  openDialog(`
    <h2>🪄 Plan my day</h2>
    <p class="small muted">Pick what you want to get done. Dialed In puts the most urgent deadline first and adds breaks between.</p>
    <div class="stack tight" style="max-height:40vh;overflow:auto">
      ${candidates.map((t) => `<label class="check"><input type="checkbox" value="${t.id}" ${t.date === today ? "checked" : ""}>
        <span class="dot" style="background:${courseColor(t.courseId)}"></span><span class="grow">${esc(t.title)} <span class="muted small">· ${esc(courseName(t.courseId))}${t.estMin ? ` · ${t.estMin}m` : ""}</span></span></label>`).join("")}
    </div>
    <div class="row wrap">
      <label class="field grow"><span>Start at</span><input type="time" data-start value="${startDefault}"></label>
      <label class="field grow"><span>Break between (min)</span><input type="number" data-brk value="5" min="0"></label>
      <label class="field grow"><span>Default task length</span><input type="number" data-def value="45" min="10" step="5"></label>
    </div>
    <div class="dlg-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" data-build>Build my plan</button></div>`, (dlg, close) => {
    dlg.querySelector("[data-build]").addEventListener("click", () => {
      const ids = Array.from(dlg.querySelectorAll("input[type=checkbox]:checked")).map((c) => c.value);
      if (!ids.length) return toast("Pick at least one task.");
      const [hh, mm] = dlg.querySelector("[data-start]").value.split(":").map(Number);
      const brk = +dlg.querySelector("[data-brk]").value || 0;
      const def = +dlg.querySelector("[data-def]").value || 45;
      const chosen = ids.map(taskById).sort((a, b) =>
        nearestDeadlineDays(a.courseId) - nearestDeadlineDays(b.courseId) || (b.carried || 0) - (a.carried || 0) || (a.estMin || def) - (b.estMin || def));
      const start = new Date(); start.setHours(hh, mm, 0, 0);
      let t = start.getTime();
      const items = [];
      chosen.forEach((task, i) => {
        const len = (task.estMin || def) * 60000;
        items.push({ type: "task", taskId: task.id, start: t, end: t + len });
        t += len;
        if (brk && i < chosen.length - 1) { items.push({ type: "break", start: t, end: t + brk * 60000 }); t += brk * 60000; }
      });
      update((s) => {
        s.profile.dayPlan = { date: today, items };
        ids.forEach((id) => { const x = s.tasks.find((y) => y.id === id); x.date = today; });
      });
      toast(`Planned! You'll wrap up around ${fmtTime(t)} 🎯`);
      close();
    });
  });
}
