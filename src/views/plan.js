// Plan: SMART goals, weekly board, tasks, term calendar, exam prep planner, spaced review, grades, courses.
import { S, update } from "../lib/store.js";
import { emit } from "../lib/bus.js";
import {
  esc, uid, todayKey, addDays, daysUntil, daysBetween, weekStartKey, fmtDate, parseKey, dateKey, markdown,
} from "../lib/utils.js";
import {
  courseById, courseName, courseColor, courseEmoji, upcomingEvents, weekDays, COURSE_COLORS, dueFlashcards,
} from "../lib/queries.js";
import { openDialog, confirmDialog, toast, courseOptions, emptyState } from "../components/ui.js";
import { openGoalBuilder, openGoalReview, progress, fmtCurrent, evaluate, SCOPES, hitRate, syncGoals } from "../components/smart.js";
import { completeReview, gradeCard, REVIEW_INTERVALS } from "../lib/flash.js";
import { taskRow, wireTaskRows } from "./today.js";
import { faceHTML, hydrate, hasMath } from "../components/cardface.js";
import { addImage, removeImage, imageURL, imageCount, MAX_IMAGES } from "../lib/images.js";

export const TABS = [
  ["goals", "🎯 Goals"], ["week", "📅 Week"], ["tasks", "✅ Tasks"], ["calendar", "🗓️ Calendar"],
  ["exam", "📝 Exam prep"], ["reviews", "🧠 Reviews"], ["grades", "📈 Grades"], ["courses", "📚 Courses"],
];
export const EMOJIS = ["📊", "💻", "🧪", "📐", "🧬", "📖", "🌍", "🎨", "🎵", "⚖️", "💼", "🧠", "🔭", "🏛️", "✍️", "🧮", "🩺", "🌱"];
const EVENT_TYPES = ["exam", "assignment", "project", "quiz", "other"];

const ui = { tab: "goals", weekOffset: 0, monthOffset: 0, courseId: null, selectedBlock: null, showDone: false };

export function setPlanTab(tab, extra = {}) { if (tab) ui.tab = tab; Object.assign(ui, extra); }

export function renderPlan(el) {
  el.innerHTML = `
    <nav class="seg" aria-label="Plan sections">${TABS.map(([id, label]) => `<button class="chip ${ui.tab === id ? "active" : ""}" data-tab="${id}">${label}</button>`).join("")}</nav>
    <div data-body></div>`;
  el.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { ui.tab = b.dataset.tab; ui.courseId = null; renderPlan(el); }));
  const body = el.querySelector("[data-body]");
  ({ goals, week, tasks, calendar, exam, reviews, grades, courses })[ui.tab](body, () => renderPlan(el));
}

/* ================= Goals ================= */
function goals(el) {
  syncGoals();
  const all = S().goals;
  const active = all.filter((g) => g.status === "active");
  const toReview = all.filter((g) => (g.status === "done" || g.status === "ended") && !g.review);
  const past = all.filter((g) => g.review).sort((a, b) => (b.review.at || 0) - (a.review.at || 0));
  const hr = hitRate();
  el.innerHTML = `
    <div class="row between wrap" style="margin-bottom:14px">
      <div><h2>SMART goals</h2><p class="small muted">Specific · Measurable · Achievable · Relevant · Time-bound. ${hr !== null ? `You've hit <b>${hr}%</b> of reviewed goals.` : ""}</p></div>
      <button class="btn primary" data-new>+ New SMART goal</button>
    </div>
    ${toReview.length ? `<div class="card" style="border-color:var(--gold);margin-bottom:16px"><h3>🪞 Time to review</h3>
      ${toReview.map((g) => `<div class="list-row"><span class="grow"><b>${esc(g.title)}</b> <span class="pill ${g.status === "done" ? "ok" : "warn"}">${g.status === "done" ? "hit target" : "deadline passed"}</span></span><button class="btn sm primary" data-review="${g.id}">Review</button></div>`).join("")}</div>` : ""}
    ${Object.entries(SCOPES).map(([scope, s]) => {
      const list = active.filter((g) => g.scope === scope);
      if (!list.length) return "";
      return `<h3 style="margin:18px 0 10px">${s.emoji} ${s.label}</h3><div class="grid-2">${list.map(goalCard).join("")}</div>`;
    }).join("") || emptyState(`No active goals yet.<br><br><b>Example:</b> “Finish STAT 200 Ch 7 practice problems” · 30 problems · STAT 200 · by Friday.<br><br><button class="btn primary" data-new>Create your first SMART goal</button>`)}
    ${past.length ? `<h3 style="margin:24px 0 10px">Past goals</h3><div class="card">${past.map((g) => `<div class="list-row">
      <span>${g.review.hit === "yes" ? "✅" : g.review.hit === "partly" ? "🌗" : "❌"}</span>
      <div class="grow"><b class="small">${esc(g.title)}</b>
        <div class="tiny muted">${g.review.helped ? "Helped: " + esc(g.review.helped) : ""}${g.review.helped && g.review.blocked ? " · " : ""}${g.review.blocked ? "Blocked: " + esc(g.review.blocked) : ""}</div></div>
      <button class="icon-btn" data-del="${g.id}" aria-label="Delete">✕</button></div>`).join("")}</div>` : ""}`;
  el.querySelectorAll("[data-new]").forEach((b) => b.addEventListener("click", () => openGoalBuilder()));
  el.querySelectorAll("[data-review]").forEach((b) => b.addEventListener("click", () => openGoalReview(S().goals.find((g) => g.id === b.dataset.review))));
  el.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openGoalBuilder(S().goals.find((g) => g.id === b.dataset.edit))));
  el.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    if (await confirmDialog("Delete this goal?", { okText: "Delete", danger: true })) update((s) => { s.goals = s.goals.filter((g) => g.id !== b.dataset.del); });
  }));
  el.querySelectorAll("[data-inc]").forEach((b) => b.addEventListener("click", () => {
    update((s) => { const g = s.goals.find((x) => x.id === b.dataset.id); g.manual = Math.max(0, (+g.manual || 0) + +b.dataset.inc); });
    syncGoals();
  }));
  el.querySelectorAll("[data-gradeval]").forEach((i) => i.addEventListener("change", () => {
    update((s) => { s.goals.find((x) => x.id === i.dataset.gradeval).manual = +i.value || 0; });
    syncGoals();
  }));
  el.querySelectorAll("[data-endgoal]").forEach((b) => b.addEventListener("click", () => openGoalReview(S().goals.find((g) => g.id === b.dataset.endgoal))));
}

function goalCard(g) {
  const p = progress(g);
  const ev = evaluate(g);
  const days = daysUntil(g.deadline);
  return `<div class="card">
    <div class="row between"><div class="smart-letters">${["S", "M", "A", "R", "T"].map((k) => `<span class="${ev[k].ok ? "ok" : ""}" title="${esc(ev[k].msg)}">${k}</span>`).join("")}</div>
      <div><button class="icon-btn" data-edit="${g.id}" aria-label="Edit">✎</button><button class="icon-btn" data-del="${g.id}" aria-label="Delete">✕</button></div></div>
    <h3 style="margin-top:10px">${esc(g.title)}</h3>
    <p class="small muted">${g.courseId ? esc(courseEmoji(g.courseId) + " " + courseName(g.courseId)) : esc(g.relevance)} · ${days === 0 ? "due today" : days > 0 ? `${days} day${days > 1 ? "s" : ""} left` : "overdue"}</p>
    <div class="row between" style="margin-top:10px"><b class="mono">${fmtCurrent(g, p)}</b><span class="small muted">${Math.round(p.pct * 100)}%</span></div>
    <div class="bar" style="margin:6px 0"><i style="width:${p.pct * 100}%;background:${courseColor(g.courseId)}"></i></div>
    <p class="tiny muted">${p.daily || ""}${g.measure === "hours" || g.measure === "sessions" || g.measure === "avgDaily" || g.measure === "tasks" ? " · tracked automatically from your sessions" : ""}</p>
    ${g.measure === "units" ? `<div class="row" style="margin-top:8px"><button class="btn sm" data-inc="-1" data-id="${g.id}">−1</button><button class="btn sm" data-inc="1" data-id="${g.id}">+1</button><button class="btn sm" data-inc="5" data-id="${g.id}">+5</button><span class="small muted">${esc(g.unit)}</span></div>` : ""}
    ${g.measure === "grade" ? `<label class="row small" style="margin-top:8px">Current score <input type="number" min="0" max="100" value="${g.manual || ""}" data-gradeval="${g.id}" style="width:90px">%</label>` : ""}
    <button class="btn sm ghost" data-endgoal="${g.id}" style="margin-top:8px">Finish & review</button>
  </div>`;
}

/* ================= Week board ================= */
function week(el, rerender) {
  const start = addDays(weekStartKey(), ui.weekOffset * 7);
  const days = weekDays(start);
  const st = S();
  const inbox = st.tasks.filter((t) => !t.done && !t.date);
  el.innerHTML = `
    <div class="row between wrap" style="margin-bottom:12px">
      <div><h2>Weekly board</h2><p class="small muted">Drag tasks onto days. On a phone: tap a task, then tap a day.</p></div>
      <div class="row"><button class="btn sm" data-wk="-1" aria-label="Previous week">←</button>
        <button class="btn sm" data-wk="0">This week</button><button class="btn sm" data-wk="1" aria-label="Next week">→</button></div>
    </div>
    <div class="label" style="margin-bottom:6px">Unscheduled</div>
    <div class="inbox" data-drop="">${inbox.map(block).join("") || `<span class="small muted">No unscheduled tasks. Add some in the Tasks tab.</span>`}</div>
    <div class="week-board" style="margin-top:14px">
      ${days.map((d) => {
        const list = st.tasks.filter((t) => t.date === d);
        const mins = list.filter((t) => !t.done).reduce((a, t) => a + (t.estMin || 0), 0);
        return `<div class="day-col ${d === todayKey() ? "today" : ""}" data-drop="${d}">
          <h4><span>${fmtDate(d, { weekday: "short", day: "numeric" })}</span><span class="muted">${mins ? Math.round(mins / 6) / 10 + "h" : ""}</span></h4>
          ${list.map(block).join("")}
          <button class="btn sm ghost" data-add="${d}" style="margin-top:auto">+ Add</button>
        </div>`;
      }).join("")}
    </div>`;
  el.querySelectorAll("[data-wk]").forEach((b) => b.addEventListener("click", () => { ui.weekOffset = +b.dataset.wk === 0 ? 0 : ui.weekOffset + +b.dataset.wk; rerender(); }));
  el.querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", () => openTaskDialog({ date: b.dataset.add })));
  const moveTo = (id, date) => update((s) => {
    const t = s.tasks.find((x) => x.id === id);
    if (t) t.date = date || null;
  });
  el.querySelectorAll(".block").forEach((b) => {
    b.draggable = true;
    b.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", b.dataset.id); });
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      ui.selectedBlock = ui.selectedBlock === b.dataset.id ? null : b.dataset.id;
      el.querySelectorAll(".block").forEach((x) => x.classList.toggle("selected", x.dataset.id === ui.selectedBlock));
      if (ui.selectedBlock) toast("Now tap a day to move it");
    });
    b.addEventListener("dblclick", () => openTaskDialog(S().tasks.find((t) => t.id === b.dataset.id)));
  });
  el.querySelectorAll("[data-drop]").forEach((z) => {
    z.addEventListener("dragover", (e) => { e.preventDefault(); z.classList.add("drop"); });
    z.addEventListener("dragleave", () => z.classList.remove("drop"));
    z.addEventListener("drop", (e) => { e.preventDefault(); z.classList.remove("drop"); moveTo(e.dataTransfer.getData("text/plain"), z.dataset.drop); });
    z.addEventListener("click", (e) => {
      if (!ui.selectedBlock || e.target.closest("button")) return;
      moveTo(ui.selectedBlock, z.dataset.drop); ui.selectedBlock = null;
    });
  });
}
function block(t) {
  return `<div class="block ${t.done ? "done" : ""} ${ui.selectedBlock === t.id ? "selected" : ""}" data-id="${t.id}" style="border-left-color:${courseColor(t.courseId)}" title="Double-click to edit">
    ${esc(t.title)}<div class="meta">${esc(courseName(t.courseId))}${t.estMin ? ` · ${t.estMin}m` : ""}${t.carried ? ` · ↪${t.carried}` : ""}</div></div>`;
}

/* ================= Tasks ================= */
function tasks(el, rerender) {
  const st = S();
  const groups = [...st.courses.map((c) => c.id), ""];
  el.innerHTML = `
    <div class="row between wrap" style="margin-bottom:12px">
      <div><h2>Tasks</h2><p class="small muted">Break big things into tasks under an hour. Unfinished tasks roll over to the next day automatically.</p></div>
      <div class="row"><label class="check small"><input type="checkbox" data-showdone ${ui.showDone ? "checked" : ""}> Show done</label><button class="btn primary" data-new>+ Task</button></div>
    </div>
    <div class="grid-2">${groups.map((cid) => {
      const list = st.tasks.filter((t) => (t.courseId || "") === cid && (ui.showDone || !t.done))
        .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
      if (!list.length && cid === "") return "";
      return `<div class="card course-card" style="--cc:${courseColor(cid)}">
        <div class="card-head"><h3>${esc(courseEmoji(cid))} ${esc(courseName(cid))}</h3><button class="btn sm ghost" data-new="${cid}">+ Add</button></div>
        ${list.length ? list.map((t) => taskRow(t).replace('<div class="t-meta">', `<div class="t-meta">${t.date ? (t.date === todayKey() ? "Today" : fmtDate(t.date)) + " · " : "Unscheduled · "}`)).join("") : `<p class="small muted">No open tasks.</p>`}
      </div>`;
    }).join("") || emptyState("Add a course first (Courses tab), then add tasks.")}</div>`;
  el.querySelector("[data-showdone]").addEventListener("change", (e) => { ui.showDone = e.target.checked; rerender(); });
  el.querySelectorAll("[data-new]").forEach((b) => b.addEventListener("click", () => openTaskDialog({ courseId: b.dataset.new ?? "" })));
  wireTaskRows(el);
}

export function openTaskDialog(t = {}) {
  const existing = !!t.id;
  openDialog(`
    <h2>${existing ? "Edit task" : "New task"}</h2>
    <label class="field"><span>Task</span><input type="text" data-title value="${esc(t.title || "")}" placeholder="e.g. Lab 3 part B"></label>
    <div class="row wrap">
      <label class="field grow"><span>Course</span><select data-course>${courseOptions(S().courses, t.courseId ?? S().profile.lastCourseId ?? "")}</select></label>
      <label class="field" style="width:120px"><span>Estimate (min)</span><input type="number" data-est min="5" step="5" value="${t.estMin || ""}" placeholder="45"></label>
    </div>
    <label class="field"><span>Day <span class="hint">(leave empty for unscheduled)</span></span><input type="date" data-date value="${t.date || ""}"></label>
    <div class="dlg-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save</button></div>`, (dlg, close) => {
    dlg.querySelector("[data-save]").addEventListener("click", () => {
      const title = dlg.querySelector("[data-title]").value.trim();
      if (!title) return toast("Name the task first.");
      const data = { title, courseId: dlg.querySelector("[data-course]").value, estMin: +dlg.querySelector("[data-est]").value || 0, date: dlg.querySelector("[data-date]").value || null };
      update((s) => {
        if (existing) Object.assign(s.tasks.find((x) => x.id === t.id), data);
        else s.tasks.push({ id: uid(), done: false, carried: 0, createdAt: Date.now(), ...data });
      });
      close();
    });
  });
}

/* ================= Calendar ================= */
function calendar(el, rerender) {
  const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + ui.monthOffset);
  const month = base.getMonth();
  const first = new Date(base); const dow = (first.getDay() + 6) % 7; first.setDate(1 - dow);
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(first); d.setDate(first.getDate() + i); return d; });
  const st = S();
  const events = upcomingEvents();
  el.innerHTML = `
    <div class="row between wrap" style="margin-bottom:12px">
      <div><h2>Term calendar</h2><p class="small muted">All your exams, assignments and projects in one place. Tap a day to add one.</p></div>
      <div class="row"><button class="btn sm" data-m="-1" aria-label="Previous month">←</button><b style="min-width:130px;text-align:center">${base.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</b><button class="btn sm" data-m="1" aria-label="Next month">→</button>
        <button class="btn primary sm" data-newev>+ Add date</button></div>
    </div>
    <div class="cal">
      ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<div class="dow">${d}</div>`).join("")}
      ${cells.map((d) => {
        const k = dateKey(d);
        const evs = st.events.filter((e) => e.date === k);
        const tcount = st.tasks.filter((t) => t.date === k && !t.done).length;
        return `<div class="cell ${d.getMonth() !== month ? "other" : ""} ${k === todayKey() ? "today" : ""}" data-day="${k}">
          <div class="row between"><span class="n">${d.getDate()}</span>${tcount ? `<span class="tiny muted">${tcount}✓</span>` : ""}</div>
          ${evs.map((e) => `<span class="ev" style="background:${courseColor(e.courseId)}" data-ev="${e.id}">${e.type === "exam" ? "🎯 " : ""}${esc(courseById(e.courseId)?.name || "")} ${esc(e.title)}</span>`).join("")}
        </div>`;
      }).join("")}
    </div>
    <h3 style="margin:22px 0 10px">Upcoming</h3>
    <div class="card">${events.length ? events.map((e) => `<div class="list-row">
      <span class="dot" style="background:${courseColor(e.courseId)}"></span>
      <div class="grow"><b>${esc(courseName(e.courseId))} — ${esc(e.title)}</b><div class="small muted">${fmtDate(e.date)} · ${esc(e.type)} · ${daysUntil(e.date)} days</div></div>
      <button class="icon-btn" data-ev="${e.id}" aria-label="Edit">✎</button></div>`).join("") : `<p class="muted small">No upcoming dates.</p>`}</div>`;
  el.querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", () => { ui.monthOffset += +b.dataset.m; rerender(); }));
  el.querySelector("[data-newev]").addEventListener("click", () => openEventDialog({ date: todayKey() }));
  el.querySelectorAll("[data-day]").forEach((c) => c.addEventListener("click", (e) => {
    const evId = e.target.closest("[data-ev]")?.dataset.ev;
    if (evId) openEventDialog(st.events.find((x) => x.id === evId));
    else openEventDialog({ date: c.dataset.day });
  }));
  el.querySelectorAll(".list-row [data-ev]").forEach((b) => b.addEventListener("click", () => openEventDialog(st.events.find((x) => x.id === b.dataset.ev))));
}

export function openEventDialog(ev = {}) {
  const existing = !!ev.id;
  openDialog(`
    <h2>${existing ? "Edit date" : "Add exam / deadline"}</h2>
    <div class="row wrap">
      <label class="field grow"><span>Course</span><select data-course>${courseOptions(S().courses, ev.courseId ?? S().courses[0]?.id ?? "")}</select></label>
      <label class="field grow"><span>Type</span><select data-type>${EVENT_TYPES.map((t) => `<option ${ev.type === t ? "selected" : ""}>${t}</option>`).join("")}</select></label>
    </div>
    <label class="field"><span>Name</span><input type="text" data-title value="${esc(ev.title || "")}" placeholder="e.g. Midterm 1, Lab 4, Essay draft"></label>
    <label class="field"><span>Date</span><input type="date" data-date value="${ev.date || todayKey()}"></label>
    <div class="dlg-actions">${existing ? `<button class="btn danger" data-del>Delete</button>` : ""}<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save</button></div>`, (dlg, close) => {
    dlg.querySelector("[data-save]").addEventListener("click", () => {
      const data = {
        courseId: dlg.querySelector("[data-course]").value, type: dlg.querySelector("[data-type]").value,
        title: dlg.querySelector("[data-title]").value.trim() || "Deadline", date: dlg.querySelector("[data-date]").value,
      };
      if (!data.date) return toast("Pick a date.");
      update((s) => {
        if (existing) Object.assign(s.events.find((x) => x.id === ev.id), data);
        else s.events.push({ id: uid(), ...data });
      });
      close();
    });
    dlg.querySelector("[data-del]")?.addEventListener("click", () => { update((s) => { s.events = s.events.filter((x) => x.id !== ev.id); }); close(); });
  });
}

/* ================= Exam prep planner ================= */
function exam(el, rerender) {
  const st = S();
  const exams = upcomingEvents().filter((e) => e.type === "exam" || e.type === "quiz");
  const plans = st.examPlans.map((p) => ({ p, ev: st.events.find((e) => e.id === p.eventId) })).filter((x) => x.ev);
  el.innerHTML = `
    <h2>Exam prep planner</h2>
    <p class="small muted" style="margin-bottom:14px">Enter your topics and how long you can study each day. Dialed In spreads them out and saves the last 2 days for review and a practice test.</p>
    <div class="grid-2">
      <div class="card stack">
        <label class="field"><span>Which exam?</span>
          <select data-ev>${exams.map((e) => `<option value="${e.id}">${esc(courseName(e.courseId))} — ${esc(e.title)} (${fmtDate(e.date)}, ${daysUntil(e.date)} days)</option>`).join("") || `<option value="">No upcoming exams</option>`}</select></label>
        ${exams.length ? "" : `<button class="btn sm" data-addexam>+ Add an exam date first</button>`}
        <label class="field"><span>Topics <span class="hint">one per line</span></span>
          <textarea data-topics rows="6" placeholder="Ch 1 Sampling\nCh 2 Descriptive stats\nCh 3 Probability\nCh 4 Normal distribution"></textarea></label>
        <label class="field"><span>Hours you can study per day</span><input type="number" data-hpd value="2" min="0.25" step="0.25"></label>
        <div class="row"><button class="btn" data-preview>Preview</button><button class="btn primary" data-create>Create plan</button></div>
        <div data-out></div>
      </div>
      <div class="stack">
        <h3>Your plans</h3>
        ${plans.length ? plans.map(({ p, ev }) => {
          const ts = st.tasks.filter((t) => t.examPlanId === p.id);
          const done = ts.filter((t) => t.done).length;
          return `<div class="card"><div class="row between"><b>${esc(courseName(ev.courseId))} — ${esc(ev.title)}</b><button class="icon-btn" data-delplan="${p.id}" aria-label="Delete plan">✕</button></div>
            <p class="small muted">${fmtDate(ev.date)} · ${p.topics.length} topics · ${p.hoursPerDay}h/day</p>
            <div class="bar gold" style="margin:8px 0"><i style="width:${ts.length ? (done / ts.length) * 100 : 0}%"></i></div>
            <p class="tiny muted">${done}/${ts.length} study blocks done${done === ts.length && ts.length ? " — Exam Ready 🎯" : ""}</p></div>`;
        }).join("") : `<p class="small muted">No plans yet.</p>`}
      </div>
    </div>`;
  el.querySelector("[data-addexam]")?.addEventListener("click", () => openEventDialog({ type: "exam", date: addDays(todayKey(), 14) }));
  const build = () => {
    const ev = st.events.find((e) => e.id === el.querySelector("[data-ev]").value);
    const topics = el.querySelector("[data-topics]").value.split("\n").map((s) => s.trim()).filter(Boolean);
    const hpd = +el.querySelector("[data-hpd]").value || 2;
    if (!ev) { toast("Pick an exam first."); return null; }
    if (!topics.length) { toast("List at least one topic."); return null; }
    return { ev, topics, hpd, days: distribute(topics, todayKey(), ev.date, hpd) };
  };
  el.querySelector("[data-preview]").addEventListener("click", () => {
    const b = build(); if (!b) return;
    el.querySelector("[data-out]").innerHTML = `<div class="timeline">${b.days.map((d) => `<div class="tl small"><b>${fmtDate(d.date)}</b> · ${d.items.map((i) => esc(i.title) + ` (${i.estMin}m)`).join(", ")}</div>`).join("")}</div>`;
  });
  el.querySelector("[data-create]").addEventListener("click", () => {
    const b = build(); if (!b) return;
    if (!b.days.length) return toast("That exam is today — no time to spread topics. Good luck! 🍀");
    const id = uid();
    update((s) => {
      s.examPlans.push({ id, eventId: b.ev.id, topics: b.topics, hoursPerDay: b.hpd, createdAt: Date.now() });
      b.days.forEach((d) => d.items.forEach((i) => s.tasks.push({
        id: uid(), courseId: b.ev.courseId, title: i.title, estMin: i.estMin, date: d.date, done: false, carried: 0, examPlanId: id, createdAt: Date.now(),
      })));
    });
    emit("say", { text: `Exam plan ready: ${b.days.length} days mapped out. You've got this 💪` });
    rerender();
  });
  el.querySelectorAll("[data-delplan]").forEach((b) => b.addEventListener("click", async () => {
    if (!(await confirmDialog("Delete this plan and its unfinished study blocks?", { okText: "Delete", danger: true }))) return;
    update((s) => {
      s.examPlans = s.examPlans.filter((p) => p.id !== b.dataset.delplan);
      s.tasks = s.tasks.filter((t) => t.examPlanId !== b.dataset.delplan || t.done);
    });
  }));
}

// Spread topics over the days before the exam; reserve the last 2 days for review + practice test.
export function distribute(topics, fromKey, examKey, hoursPerDay) {
  const n = daysBetween(fromKey, examKey);           // study days before exam day
  if (n <= 0) return [];
  const dates = Array.from({ length: n }, (_, i) => addDays(fromKey, i));
  const reserve = n >= 4 ? 2 : n >= 2 ? 1 : 0;
  const topicDays = dates.slice(0, n - reserve);
  const mins = Math.round(hoursPerDay * 60);
  const out = topicDays.map((date) => ({ date, items: [] }));
  if (topicDays.length) {
    if (topics.length >= topicDays.length) {
      topics.forEach((t, j) => out[Math.floor((j * topicDays.length) / topics.length)].items.push(t));
    } else {
      out.forEach((d, i) => {
        const j = Math.floor((i * topics.length) / topicDays.length);
        const span = out.filter((_, k) => Math.floor((k * topics.length) / topicDays.length) === j).length;
        const part = out.slice(0, i).filter((_, k) => Math.floor((k * topics.length) / topicDays.length) === j).length + 1;
        d.items.push(span > 1 ? `${topics[j]} (part ${part}/${span})` : topics[j]);
      });
    }
  }
  const days = out.map((d) => ({ date: d.date, items: d.items.map((title) => ({ title: "📖 " + title, estMin: Math.round(mins / d.items.length) })) }));
  if (reserve === 2) days.push({ date: dates[n - 2], items: [{ title: "🔁 Review all topics + weak spots", estMin: mins }] });
  if (reserve >= 1) days.push({ date: dates[n - 1], items: [{ title: "📝 Timed practice test", estMin: mins }] });
  if (!topicDays.length && topics.length) days[0].items.unshift({ title: "📖 " + topics.join(", "), estMin: mins });
  return days;
}

/* ================= Spaced review ================= */
function reviews(el) {
  const st = S();
  const list = st.reviews.filter((r) => !r.done).sort((a, b) => a.due.localeCompare(b.due));
  const done = st.reviews.filter((r) => r.done);
  el.innerHTML = `
    <div class="row between wrap" style="margin-bottom:12px">
      <div><h2>Spaced review</h2><p class="small muted">After you study a topic, Dialed In reminds you to review it after ${REVIEW_INTERVALS.join(", ")} days. That's how stuff sticks for the final.</p></div>
    </div>
    <form class="card row wrap" data-add style="margin-bottom:16px">
      <input type="text" name="topic" placeholder="Topic you just learned, e.g. Confidence intervals" class="grow" style="min-width:200px">
      <select name="course" style="width:auto">${courseOptions(st.courses, st.profile.lastCourseId || "")}</select>
      <button class="btn primary">Add</button>
    </form>
    <div class="card">${list.length ? list.map((r) => {
      const d = daysUntil(r.due);
      return `<div class="list-row"><span class="dot" style="background:${courseColor(r.courseId)}"></span>
        <div class="grow"><b>${esc(r.topic)}</b><div class="small muted">${esc(courseName(r.courseId))} · review ${r.stage + 1} of ${REVIEW_INTERVALS.length} · learned ${fmtDate(r.learnedOn)}</div></div>
        <span class="pill ${d <= 0 ? "gold" : ""}">${d < 0 ? "overdue" : d === 0 ? "due today" : "in " + d + "d"}</span>
        <button class="btn sm ${d <= 0 ? "primary" : ""}" data-done="${r.id}">Reviewed</button>
        <button class="icon-btn" data-del="${r.id}" aria-label="Delete">✕</button></div>`;
    }).join("") : `<p class="small muted">Nothing scheduled. Tick “Add to spaced review” after a session, or add a topic above.</p>`}</div>
    ${done.length ? `<p class="small muted" style="margin-top:12px">✅ ${done.length} topic${done.length > 1 ? "s" : ""} fully reviewed (all 4 rounds).</p>` : ""}`;
  el.querySelector("[data-add]").addEventListener("submit", (e) => {
    e.preventDefault();
    const topic = e.target.topic.value.trim();
    if (!topic) return;
    update((s) => s.reviews.push({ id: uid(), courseId: e.target.course.value, topic, learnedOn: todayKey(), stage: 0, due: addDays(todayKey(), 1), done: false }));
  });
  el.querySelectorAll("[data-done]").forEach((b) => b.addEventListener("click", () => { completeReview(b.dataset.done); toast("Nice — next review scheduled 🧠"); }));
  el.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => update((s) => { s.reviews = s.reviews.filter((r) => r.id !== b.dataset.del); })));
}

/* ================= Grades ================= */
export const GRADE_SCALE = [
  ["A+", 90], ["A", 85], ["A-", 80], ["B+", 76], ["B", 72], ["B-", 68], ["C+", 64], ["C", 60], ["C-", 55], ["D", 50], ["F", 0],
];
export const letterFor = (pct) => (GRADE_SCALE.find(([, min]) => pct >= min) || ["F"])[0];

export function gradeSummary(courseId) {
  const items = S().grades.filter((g) => g.courseId === courseId);
  const graded = items.filter((g) => g.score !== null && g.score !== "" && g.score !== undefined);
  const gw = graded.reduce((a, g) => a + (+g.weight || 0), 0);
  const earned = graded.reduce((a, g) => a + (+g.weight || 0) * (+g.score || 0) / 100, 0);
  const totalW = items.reduce((a, g) => a + (+g.weight || 0), 0);
  return { items, current: gw ? (earned / gw) * 100 : null, earned, gradedWeight: gw, remainingWeight: Math.max(0, totalW - gw), totalW };
}
export function neededOnRest(courseId, target) {
  const s = gradeSummary(courseId);
  if (!s.remainingWeight) return null;
  const total = Math.max(100, s.totalW);
  return ((target / 100) * total - s.earned) / s.remainingWeight * 100;
}

function grades(el, rerender) {
  const st = S();
  if (!st.courses.length) { el.innerHTML = emptyState("Add a course first (Courses tab)."); return; }
  ui.courseId = ui.courseId && courseById(ui.courseId) ? ui.courseId : st.courses[0].id;
  const c = courseById(ui.courseId);
  const s = gradeSummary(c.id);
  const target = c.targetGrade || 76;
  const need = neededOnRest(c.id, target);
  const remainingNames = s.items.filter((g) => g.score === null || g.score === "" || g.score === undefined).map((g) => g.name).join(" + ") || "remaining work";
  el.innerHTML = `
    <div class="row between wrap" style="margin-bottom:12px">
      <div><h2>Grade tracker</h2><p class="small muted">Enter weights and marks. Uses a standard percentage → letter scale (A+ = 90%+).</p></div>
      <select data-course style="width:auto">${st.courses.map((x) => `<option value="${x.id}" ${x.id === c.id ? "selected" : ""}>${esc(x.emoji)} ${esc(x.name)}</option>`).join("")}</select>
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card-head"><h3>${esc(c.emoji)} ${esc(c.name)} assessments</h3><span class="small muted">Weights: ${s.totalW}%</span></div>
        <div class="stack tight">
          <div class="row small muted"><span class="grow">Name</span><span style="width:80px">Weight %</span><span style="width:80px">Score %</span><span style="width:34px"></span></div>
          ${s.items.map((g) => `<div class="row">
            <input type="text" value="${esc(g.name)}" data-g="${g.id}" data-k="name" class="grow">
            <input type="number" value="${g.weight ?? ""}" data-g="${g.id}" data-k="weight" style="width:80px" min="0" max="100">
            <input type="number" value="${g.score ?? ""}" data-g="${g.id}" data-k="score" style="width:80px" min="0" max="120" placeholder="—">
            <button class="icon-btn" data-delg="${g.id}" aria-label="Delete">✕</button></div>`).join("")}
        </div>
        <div class="row wrap" style="margin-top:10px">
          <button class="btn sm" data-addg>+ Add assessment</button>
          ${s.items.length ? "" : `<button class="btn sm ghost" data-template>Use a typical template</button>`}
        </div>
        ${s.totalW && s.totalW !== 100 ? `<p class="tiny" style="color:var(--warn);margin-top:8px">Heads up: weights add to ${s.totalW}%, not 100%.</p>` : ""}
      </div>
      <div class="stack">
        <div class="card center">
          <span class="label">Current grade</span>
          <div class="big-num">${s.current === null ? "—" : Math.round(s.current * 10) / 10 + "%"}</div>
          <div class="pill ${s.current === null ? "" : s.current >= 80 ? "ok" : s.current >= 64 ? "gold" : "danger"}">${s.current === null ? "Add a score" : letterFor(s.current)}</div>
          <p class="tiny muted" style="margin-top:6px">Based on ${s.gradedWeight}% of the course graded so far</p>
        </div>
        <div class="card">
          <h3>What do I need on the final?</h3>
          <label class="row" style="margin-top:10px"><span class="grow">I want a</span>
            <select data-target style="width:auto">${GRADE_SCALE.slice(0, -1).map(([l, m]) => `<option value="${m}" ${m === target ? "selected" : ""}>${l} (${m}%+)</option>`).join("")}</select></label>
          <p style="margin-top:12px">${need === null ? `<span class="muted">Add an ungraded assessment (e.g. Final, 40%) to calculate this.</span>`
            : need <= 0 ? `🎉 You've already locked in a <b>${letterFor(target)}</b>!`
              : need > 100 ? `😬 You'd need <b>${Math.round(need)}%</b> on ${esc(remainingNames)} — not possible for a ${letterFor(target)}. Aim for the next one down?`
                : `You need <b>${Math.round(need * 10) / 10}%</b> on ${esc(remainingNames)} for a <b>${letterFor(target)}</b>.`}</p>
        </div>
      </div>
    </div>`;
  el.querySelector("[data-course]").addEventListener("change", (e) => { ui.courseId = e.target.value; rerender(); });
  el.querySelector("[data-target]").addEventListener("change", (e) => update((x) => { x.courses.find((y) => y.id === c.id).targetGrade = +e.target.value; }));
  el.querySelector("[data-addg]").addEventListener("click", () => update((x) => x.grades.push({ id: uid(), courseId: c.id, name: "Assessment", weight: 10, score: null })));
  el.querySelector("[data-template]")?.addEventListener("click", () => update((x) => {
    [["Assignments", 20], ["Midterm", 30], ["Final exam", 50]].forEach(([name, weight]) => x.grades.push({ id: uid(), courseId: c.id, name, weight, score: null }));
  }));
  el.querySelectorAll("[data-g]").forEach((i) => i.addEventListener("change", () => update((x) => {
    const g = x.grades.find((y) => y.id === i.dataset.g);
    g[i.dataset.k] = i.dataset.k === "name" ? i.value : i.value === "" ? null : +i.value;
  })));
  el.querySelectorAll("[data-delg]").forEach((b) => b.addEventListener("click", () => update((x) => { x.grades = x.grades.filter((g) => g.id !== b.dataset.delg); })));
}

/* ================= Courses ================= */
function courses(el, rerender) {
  const st = S();
  if (ui.courseId && courseById(ui.courseId)) return coursePage(el, courseById(ui.courseId), rerender);
  el.innerHTML = `
    <div class="row between wrap" style="margin-bottom:12px">
      <div><h2>Courses</h2><p class="small muted">Notes, flashcards and links for each course.</p></div>
      <button class="btn primary" data-new>+ Course</button>
    </div>
    <div class="grid-3">${st.courses.map((c) => {
      const cards = st.flashcards.filter((f) => f.courseId === c.id).length;
      const ev = upcomingEvents(c.id)[0];
      return `<button class="card course-card" style="--cc:${c.color};text-align:left;cursor:pointer" data-open="${c.id}">
        <div style="font-size:1.8rem">${esc(c.emoji)}</div><h3>${esc(c.name)}</h3>
        <p class="small muted">${cards} flashcard${cards === 1 ? "" : "s"} · ${(c.links || []).length} links${ev ? ` · ${esc(ev.title)} in ${daysUntil(ev.date)}d` : ""}</p></button>`;
    }).join("")}</div>
    ${st.courses.length ? "" : emptyState("No courses yet — add your first one!")}`;
  el.querySelectorAll("[data-new]").forEach((b) => b.addEventListener("click", () => openCourseDialog()));
  el.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => { ui.courseId = b.dataset.open; rerender(); }));
}

function coursePage(el, c, rerender) {
  const st = S();
  const cards = st.flashcards.filter((f) => f.courseId === c.id);
  const due = dueFlashcards(c.id);
  ui.noteMode = ui.noteMode || "preview";
  el.innerHTML = `
    <button class="btn sm ghost" data-back>← All courses</button>
    <div class="row between wrap" style="margin:10px 0 16px">
      <h2 style="display:flex;gap:10px;align-items:center"><span style="font-size:2rem">${esc(c.emoji)}</span>${esc(c.name)}</h2>
      <div class="row"><button class="btn sm" data-edit>Edit</button><button class="btn sm danger" data-del>Delete</button></div>
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card-head"><h3>📒 Quick notes</h3>
          <div class="chips"><button class="chip ${ui.noteMode === "edit" ? "active" : ""}" data-nm="edit">Edit</button><button class="chip ${ui.noteMode === "preview" ? "active" : ""}" data-nm="preview">Preview</button></div></div>
        ${ui.noteMode === "edit"
          ? `<textarea data-notes rows="12" placeholder="# Lecture 5\n- **Key idea:** …\n- Formula: \`x̄ ± z*σ/√n\`">${esc(c.notes || "")}</textarea><p class="tiny muted">Markdown works: # heading, **bold**, *italic*, - lists, \`code\`, [link](https://…). Saves automatically.</p>`
          : `<div class="md">${c.notes ? markdown(c.notes) : `<p class="muted">No notes yet. Tap Edit.</p>`}</div>`}
      </div>
      <div class="stack">
        <div class="card">
          <div class="card-head"><h3>🃏 Flashcards</h3><span class="pill ${due.length ? "gold" : ""}">${due.length} due</span></div>
          <form class="stack tight" data-addcard>
            ${["front", "back"].map((side) => `<div class="card-side" data-side="${side}">
              <textarea name="${side}" rows="2" placeholder="${side === "front" ? "Front — question" : "Back — answer"}">${esc(ui.cardDraft?.[side] || "")}</textarea>
              <div class="row side-tools">
                <label class="btn sm ghost">📷 Picture<input type="file" accept="image/*" hidden data-file="${side}"></label>
                <span data-thumb="${side}"></span>
              </div>
              <div class="cf-preview" data-preview="${side}" hidden></div>
            </div>`).join("")}
            <p class="tiny muted">Paste a screenshot (Ctrl/⌘+V), drop an image, or snap a photo. Type formulas between $ signs, e.g. <code>$\\bar{x} \\pm z\\frac{\\sigma}{\\sqrt{n}}$</code></p>
            <button class="btn sm primary">Add card</button>
          </form>
          <div class="row" style="margin-top:10px"><button class="btn sm" data-study ${cards.length ? "" : "disabled"}>Study ${due.length ? "due" : "all"} (${due.length || cards.length})</button></div>
          <div style="max-height:220px;overflow:auto;margin-top:8px">${cards.map((f) => `<div class="list-row small card-row"><span class="grow mini-face">${faceHTML(f.front, f.frontImg)}</span><span class="muted">→</span><span class="grow mini-face">${faceHTML(f.back, f.backImg)}</span><span class="tiny muted">box ${f.box || 0}</span><button class="icon-btn" data-delcard="${f.id}" aria-label="Delete card">✕</button></div>`).join("")}</div>
        </div>
        <div class="card">
          <div class="card-head"><h3>🔗 Links</h3></div>
          ${(c.links || []).map((l) => `<div class="list-row"><a href="${esc(l.url)}" target="_blank" rel="noopener" class="grow">${esc(l.title)}</a><button class="icon-btn" data-dellink="${l.id}" aria-label="Delete link">✕</button></div>`).join("")}
          <form class="row wrap" data-addlink style="margin-top:8px">
            <input type="text" name="title" placeholder="Canvas, lecture recordings…" class="grow" style="min-width:140px">
            <input type="url" name="url" placeholder="https://" class="grow" style="min-width:140px">
            <button class="btn sm primary">Add</button>
          </form>
        </div>
      </div>
    </div>`;
  el.querySelector("[data-back]").addEventListener("click", () => { ui.courseId = null; rerender(); });
  el.querySelector("[data-edit]").addEventListener("click", () => openCourseDialog(c));
  el.querySelector("[data-del]").addEventListener("click", async () => {
    if (!(await confirmDialog(`Delete ${c.name}? Its tasks, dates, flashcards, grades and reviews go too. Logged study time stays.`, { okText: "Delete course", danger: true }))) return;
    for (const f of S().flashcards.filter((x) => x.courseId === c.id)) { removeImage(f.frontImg); removeImage(f.backImg); }
    update((s) => {
      s.courses = s.courses.filter((x) => x.id !== c.id);
      for (const k of ["tasks", "events", "flashcards", "grades", "reviews"]) s[k] = s[k].filter((x) => x.courseId !== c.id);
    });
    ui.courseId = null; rerender();
  });
  el.querySelectorAll("[data-nm]").forEach((b) => b.addEventListener("click", () => { ui.noteMode = b.dataset.nm; rerender(); }));
  const notes = el.querySelector("[data-notes]");
  if (notes) {
    let h;
    notes.addEventListener("input", () => { clearTimeout(h); h = setTimeout(() => update((s) => { s.courses.find((x) => x.id === c.id).notes = notes.value; }), 400); });
  }
  wireCardEditor(el.querySelector("[data-addcard]"), c);
  el.querySelectorAll(".card-row").forEach((r) => hydrate(r));
  el.querySelectorAll("[data-delcard]").forEach((b) => b.addEventListener("click", () => {
    const card = S().flashcards.find((f) => f.id === b.dataset.delcard);
    update((s) => { s.flashcards = s.flashcards.filter((f) => f.id !== b.dataset.delcard); });
    removeImage(card?.frontImg); removeImage(card?.backImg);
  }));
  el.querySelector("[data-study]").addEventListener("click", () => studyCards(due.length ? due : cards));
  el.querySelector("[data-addlink]").addEventListener("submit", (e) => {
    e.preventDefault();
    const title = e.target.title.value.trim(), url = e.target.url.value.trim();
    if (!/^https?:\/\//.test(url)) return toast("Links need to start with https://");
    update((s) => { const x = s.courses.find((y) => y.id === c.id); x.links = [...(x.links || []), { id: uid(), title: title || url, url }]; });
  });
  el.querySelectorAll("[data-dellink]").forEach((b) => b.addEventListener("click", () => update((s) => {
    const x = s.courses.find((y) => y.id === c.id); x.links = x.links.filter((l) => l.id !== b.dataset.dellink);
  })));
}

// Card editor: text + optional picture per side. The draft survives re-renders (e.g. a sync arriving).
function wireCardEditor(form, course) {
  ui.cardDraft ||= { front: "", back: "", frontImg: null, backImg: null };
  const d = ui.cardDraft;
  const thumbs = async () => {
    for (const side of ["front", "back"]) {
      const box = form.querySelector(`[data-thumb="${side}"]`);
      const id = d[side + "Img"];
      box.innerHTML = id ? `<span class="thumb"><img alt="" src="${(await imageURL(id)) || ""}"><button type="button" class="icon-btn" data-rmimg="${side}" aria-label="Remove picture">✕</button></span>` : "";
      box.querySelector("[data-rmimg]")?.addEventListener("click", () => { removeImage(d[side + "Img"]); d[side + "Img"] = null; thumbs(); });
    }
  };
  const preview = (side) => {
    const ta = form.querySelector(`textarea[name="${side}"]`), pv = form.querySelector(`[data-preview="${side}"]`);
    d[side] = ta.value;
    pv.hidden = !hasMath(ta.value);
    if (!pv.hidden) { pv.innerHTML = faceHTML(ta.value, null); hydrate(pv); }
  };
  const attach = async (side, file) => {
    if (!file || !file.type.startsWith("image/")) return;
    if (imageCount() >= MAX_IMAGES) return toast(`You've reached ${MAX_IMAGES} pictures. Delete some old cards to add more.`);
    try {
      if (d[side + "Img"]) removeImage(d[side + "Img"]);
      d[side + "Img"] = await addImage(file);
      thumbs();
    } catch { toast("Couldn't use that picture — try a PNG or JPG."); }
  };
  ["front", "back"].forEach((side) => {
    const ta = form.querySelector(`textarea[name="${side}"]`);
    ta.addEventListener("input", () => preview(side));
    preview(side);
    form.querySelector(`[data-file="${side}"]`).addEventListener("change", (e) => { attach(side, e.target.files[0]); e.target.value = ""; });
    const zone = form.querySelector(`[data-side="${side}"]`);
    zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drop"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("drop"));
    zone.addEventListener("drop", (e) => { e.preventDefault(); zone.classList.remove("drop"); attach(side, e.dataTransfer.files[0]); });
  });
  form.addEventListener("paste", (e) => {
    const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith("image/"));
    if (!file) return;
    e.preventDefault();
    attach(e.target.name === "back" ? "back" : "front", file);
  });
  thumbs();
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const front = form.front.value.trim(), back = form.back.value.trim();
    if (!(front || d.frontImg) || !(back || d.backImg)) return toast("Each side needs text or a picture.");
    update((st) => st.flashcards.push({ id: uid(), courseId: course.id, front, back, frontImg: d.frontImg, backImg: d.backImg, box: 0, due: todayKey() }));
    ui.cardDraft = null;
    setTimeout(() => document.querySelector('[data-addcard] [name="front"]')?.focus(), 0);
  });
}

function studyCards(list) {
  let i = 0, flipped = false;
  const deck = list.slice();
  openDialog(`<div data-box></div><div class="dlg-actions"><button class="btn" data-close>Close</button></div>`, (dlg) => {
    const box = dlg.querySelector("[data-box]");
    const draw = () => {
      if (i >= deck.length) { box.innerHTML = `<div class="center stack"><div style="font-size:3rem">🎉</div><h3>Deck done!</h3></div>`; return; }
      const c = deck[i];
      box.innerHTML = `<p class="center small muted">${i + 1} / ${deck.length}</p>
        <div class="flashcard ${flipped ? "flipped" : ""}" data-card tabindex="0" role="button" aria-label="Flip card"><div class="inner"><div class="face">${faceHTML(c.front, c.frontImg)}</div><div class="face back">${faceHTML(c.back, c.backImg)}</div></div></div>
        <div class="row" style="justify-content:center;margin-top:14px">${flipped ? `<button class="btn" data-no>↺ Again</button><button class="btn primary" data-yes>✓ Got it</button>` : `<span class="small muted">Tap to flip</span>`}</div>`;
      const card = box.querySelector("[data-card]");
      hydrate(card);
      card.addEventListener("click", () => { flipped = !flipped; draw(); });
      card.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); flipped = !flipped; draw(); } });
      box.querySelector("[data-yes]")?.addEventListener("click", () => { gradeCard(c.id, true); i++; flipped = false; draw(); });
      box.querySelector("[data-no]")?.addEventListener("click", () => { gradeCard(c.id, false); i++; flipped = false; draw(); });
    };
    draw();
  });
}

export function openCourseDialog(c = null) {
  const d = c ? { ...c } : { name: "", emoji: EMOJIS[S().courses.length % EMOJIS.length], color: COURSE_COLORS[S().courses.length % COURSE_COLORS.length] };
  openDialog(`
    <h2>${c ? "Edit course" : "New course"}</h2>
    <label class="field"><span>Course name</span><input type="text" data-name value="${esc(d.name)}" placeholder="e.g. STAT 200"></label>
    <div class="field"><span>Emoji</span><div class="emoji-row">${EMOJIS.map((e) => `<button type="button" class="${e === d.emoji ? "active" : ""}" data-emoji="${e}">${e}</button>`).join("")}</div></div>
    <div class="field"><span>Colour</span><div class="swatches">${COURSE_COLORS.map((col) => `<button type="button" class="${col === d.color ? "active" : ""}" data-color="${col}" style="background:${col}" aria-label="Colour ${col}"></button>`).join("")}</div></div>
    <div class="dlg-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save</button></div>`, (dlg, close) => {
    dlg.querySelectorAll("[data-emoji]").forEach((b) => b.addEventListener("click", () => { d.emoji = b.dataset.emoji; dlg.querySelectorAll("[data-emoji]").forEach((x) => x.classList.toggle("active", x === b)); }));
    dlg.querySelectorAll("[data-color]").forEach((b) => b.addEventListener("click", () => { d.color = b.dataset.color; dlg.querySelectorAll("[data-color]").forEach((x) => x.classList.toggle("active", x === b)); }));
    dlg.querySelector("[data-save]").addEventListener("click", () => {
      const name = dlg.querySelector("[data-name]").value.trim();
      if (!name) return toast("Name the course.");
      update((s) => {
        if (c) Object.assign(s.courses.find((x) => x.id === c.id), { name, emoji: d.emoji, color: d.color });
        else s.courses.push({ id: uid(), name, emoji: d.emoji, color: d.color, links: [], notes: "", createdAt: Date.now() });
      });
      close();
    });
  });
}
