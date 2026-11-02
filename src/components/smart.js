// SMART goals: the builder dialog, the live S/M/A/R/T checker, progress tracking and end-of-goal reviews.
import { S, update } from "../lib/store.js";
import { emit } from "../lib/bus.js";
import { esc, uid, todayKey, addDays, daysBetween, weekStartKey, fmtDate } from "../lib/utils.js";
import { avgDailySec, activeDays, secInRange, courseName, upcomingEvents, eventById } from "../lib/queries.js";
import { openDialog, courseOptions, toast } from "./ui.js";

export const MEASURES = {
  hours: { label: "Hours studied", unit: "h", auto: true },
  sessions: { label: "Focus sessions", unit: "sessions", auto: true },
  tasks: { label: "Tasks completed", unit: "tasks", auto: true },
  avgDaily: { label: "Average hours per day", unit: "h/day", auto: true },
  units: { label: "Count something (problems, pages, chapters…)", unit: "", auto: false },
  grade: { label: "Grade / score (%)", unit: "%", auto: false },
};
export const SCOPES = {
  daily: { label: "Today", emoji: "☀️" },
  weekly: { label: "This week", emoji: "📅" },
  exam: { label: "Exam prep", emoji: "🎯" },
  semester: { label: "Semester", emoji: "🎓" },
};

const VAGUE = [
  /\bstudy more\b/, /\bdo better\b/, /\bget better\b/, /\bwork harder\b/, /\bimprove\b/, /\bstuff\b/, /\bthings\b/,
  /\ba lot\b/, /\bsome\b/, /\btry to\b/, /\bbe good\b/, /\bmore\b/, /\bbetter\b/, /\bharder\b/, /\bsomething\b/,
];

/* ---------------- evaluation ---------------- */
export function goalDays(g) {
  const start = g.start || todayKey();
  return Math.max(1, daysBetween(start, g.deadline) + 1);
}

export function evaluate(g) {
  const out = {};
  const title = (g.title || "").trim().toLowerCase();
  const words = title.split(/\s+/).filter(Boolean);
  const vague = VAGUE.find((re) => re.test(title));
  if (!title) out.S = { ok: false, msg: "What exactly will you do? e.g. “Finish STAT 200 Ch 7 practice problems”" };
  else if (vague) out.S = { ok: false, msg: `“${title.match(vague)[0]}” is vague. Name the exact chapter, assignment or skill.` };
  else if (words.length < 3) out.S = { ok: false, msg: "Add a bit more detail — which chapter, topic or assignment?" };
  else out.S = { ok: true, msg: "Clear and specific ✓" };

  const target = +g.target || 0;
  if (!g.measure) out.M = { ok: false, msg: "Pick how you'll measure it." };
  else if (target <= 0) out.M = { ok: false, msg: "Set a number to hit (hours, problems, pages…)." };
  else if (g.measure === "units" && !(g.unit || "").trim()) out.M = { ok: false, msg: "What are you counting? e.g. problems, pages, chapters." };
  else out.M = { ok: true, msg: `Target: ${fmtTarget(g)} ✓` };

  out.A = achievable(g);

  if (g.courseId || (g.relevance || "").trim().length >= 3) {
    out.R = { ok: true, msg: `Linked to ${g.courseId ? courseName(g.courseId) : "“" + g.relevance.trim() + "”"} ✓` };
  } else out.R = { ok: false, msg: "Which course or bigger goal is this for?" };

  if (!g.deadline) out.T = { ok: false, msg: "By when? Pick a deadline." };
  else if (g.deadline < (g.start || todayKey())) out.T = { ok: false, msg: "The deadline is in the past." };
  else out.T = { ok: true, msg: `By ${fmtDate(g.deadline)} (${goalDays(g)} day${goalDays(g) > 1 ? "s" : ""}) ✓` };

  out.score = ["S", "M", "A", "R", "T"].filter((k) => out[k].ok).length;
  return out;
}

function achievable(g) {
  const target = +g.target || 0;
  if (!g.measure || target <= 0 || !g.deadline) return { ok: false, msg: "Set a target and deadline so we can check it's realistic." };
  const days = goalDays(g);
  const hasHistory = activeDays(14) >= 3;
  const avgH = hasHistory ? avgDailySec(14) / 3600 : null;
  const round1 = (n) => Math.round(n * 10) / 10;
  if (g.measure === "hours" || g.measure === "avgDaily") {
    const perDay = g.measure === "hours" ? target / days : target;
    if (perDay > 10) return { ok: false, warn: true, msg: `${round1(perDay)}h a day is intense — make sure you plan sleep and breaks. You can still save it.` };
    if (avgH !== null) {
      // Past goal reviews tune how much stretch is "realistic" for this student.
      const hr = hitRate();
      const factor = hr === null ? 1.75 : hr < 50 ? 1.3 : hr >= 80 ? 2 : 1.75;
      const stretch = Math.max(avgH * factor, avgH + (hr !== null && hr < 50 ? 0.5 : 1));
      if (perDay > stretch) {
        const sug = Math.max(avgH * 1.5, avgH + 0.5);
        const suggestTarget = g.measure === "hours" ? Math.ceil(sug * days * 2) / 2 : round1(sug);
        return { ok: false, warn: true, suggest: suggestTarget,
          msg: `You average ${round1(avgH)}h a day${hr !== null ? ` and hit ${hr}% of past goals` : ""}. ${round1(perDay)}h a day might be a stretch. Try ${suggestTarget}${g.measure === "hours" ? "h total" : "h/day"}?` };
      }
      return { ok: true, msg: `${round1(perDay)}h/day vs your ${round1(avgH)}h/day average — doable ✓` };
    }
    if (perDay > 6) return { ok: false, warn: true, msg: `${round1(perDay)}h a day is a lot. Start smaller — you can always raise it.` };
    return { ok: true, msg: `About ${round1(perDay)}h a day — sounds realistic ✓` };
  }
  if (g.measure === "sessions") {
    const perDay = target / days;
    if (perDay > 8) return { ok: false, msg: `${round1(perDay)} sessions a day is too many. Try fewer.` };
    return { ok: true, msg: `About ${round1(perDay)} session${perDay === 1 ? "" : "s"} a day ✓` };
  }
  if (g.measure === "grade") {
    if (target > 100) return { ok: false, msg: "Grades top out at 100%." };
    return { ok: true, msg: `Aim for ${target}% — use the grade calculator to see what you need ✓` };
  }
  const perDay = target / days;
  if (g.measure === "units" && perDay > 150) return { ok: false, warn: true, msg: `${Math.ceil(perDay)} ${g.unit || "items"} a day is a lot. Spread it over more days?` };
  return { ok: true, msg: `About ${Math.ceil(perDay)} ${g.measure === "units" ? g.unit || "items" : "tasks"} a day ✓` };
}

export function fmtTarget(g) {
  const m = MEASURES[g.measure];
  if (!m) return "";
  if (g.measure === "units") return `${g.target} ${g.unit || "items"}`;
  if (g.measure === "hours") return `${g.target}h`;
  if (g.measure === "avgDaily") return `${g.target}h/day avg`;
  if (g.measure === "grade") return `${g.target}%`;
  return `${g.target} ${m.unit}`;
}

/* ---------------- progress ---------------- */
export function progress(g) {
  const start = g.start || todayKey();
  const end = g.deadline;
  let current = 0;
  if (g.measure === "hours") current = secInRange(start, end, g.courseId || null) / 3600;
  else if (g.measure === "sessions") current = S().sessions.filter((s) => s.dateKey >= start && s.dateKey <= end && (!g.courseId || s.courseId === g.courseId)).length;
  else if (g.measure === "tasks") current = S().tasks.filter((t) => t.done && t.doneAt && dateOf(t.doneAt) >= start && dateOf(t.doneAt) <= end && (!g.courseId || t.courseId === g.courseId)).length;
  else if (g.measure === "avgDaily") {
    const upto = todayKey() < end ? todayKey() : end;
    const days = Math.max(1, daysBetween(start, upto) + 1);
    current = secInRange(start, upto, g.courseId || null) / 3600 / days;
  } else current = +g.manual || 0;
  const target = +g.target || 1;
  const pct = Math.max(0, Math.min(1, current / target));
  const daysLeft = Math.max(1, daysBetween(todayKey(), end) + 1);
  const remaining = Math.max(0, target - current);
  let daily = "";
  if (g.measure === "hours") daily = `${Math.round((remaining / daysLeft) * 60)} min/day to stay on track`;
  else if (g.measure === "units") daily = `${Math.ceil(remaining / daysLeft)} ${g.unit || "items"}/day to stay on track`;
  else if (g.measure === "sessions" || g.measure === "tasks") daily = `${Math.ceil(remaining / daysLeft)} ${MEASURES[g.measure].unit}/day to stay on track`;
  else if (g.measure === "avgDaily") daily = `Keep up ${g.target}h a day`;
  return { current, target, pct, remaining, daily: remaining > 0 && end >= todayKey() ? daily : "" };
}
const dateOf = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export function fmtCurrent(g, p) {
  const n = g.measure === "hours" || g.measure === "avgDaily" ? Math.round(p.current * 10) / 10 : Math.round(p.current);
  return `${n} / ${fmtTarget(g)}`;
}

// Auto-complete goals that hit their target; close ones whose deadline passed.
export function syncGoals() {
  const today = todayKey();
  const changes = [];
  for (const g of S().goals) {
    if (g.status !== "active") continue;
    const p = progress(g);
    if (g.measure !== "avgDaily" && p.pct >= 1) changes.push([g.id, "done"]);
    else if (g.deadline < today) changes.push([g.id, g.measure === "avgDaily" && p.pct >= 1 ? "done" : "ended"]);
  }
  if (!changes.length) return;
  update((st) => {
    for (const [id, status] of changes) {
      const g = st.goals.find((x) => x.id === id);
      if (g) { g.status = status; g.closedAt = Date.now(); }
    }
  });
  for (const [id, status] of changes) {
    const g = S().goals.find((x) => x.id === id);
    if (status === "done") emit("celebrate", { text: `SMART goal achieved: “${g.title}” 🎯 Take a sec to review it in Plan.`, big: true });
  }
}

/* ---------------- builder dialog ---------------- */
function defaultDeadline(scope) {
  const t = todayKey();
  if (scope === "daily") return t;
  if (scope === "weekly") return addDays(weekStartKey(t), 6);
  if (scope === "exam") return upcomingEvents().find((e) => e.type === "exam")?.date || addDays(t, 14);
  return addDays(t, 112);
}

const EXAMPLES = {
  daily: "Finish CPSC 210 Lab 4 parts A–C",
  weekly: "Complete STAT 200 Ch 7 practice problems",
  exam: "Review all MATH 100 midterm topics with practice tests",
  semester: "Average 2 focused hours a day this term",
};

export function openGoalBuilder(existing = null, preset = {}) {
  const st = S();
  const g = existing ? { ...existing } : {
    id: uid(), title: "", scope: "weekly", measure: "hours", unit: "", target: "", manual: 0,
    courseId: st.courses[0]?.id || "", relevance: "", eventId: "", start: todayKey(),
    deadline: defaultDeadline(preset.scope || "weekly"), status: "active", createdAt: Date.now(), makeTasks: false, ...preset,
  };
  const exams = upcomingEvents();
  openDialog(`
    <div class="row between"><h2>${existing ? "Edit" : "New"} SMART goal</h2><div class="smart-letters" data-letters></div></div>
    <div class="chips" data-scope>${Object.entries(SCOPES).map(([k, v]) => `<button class="chip ${g.scope === k ? "active" : ""}" data-v="${k}">${v.emoji} ${v.label}</button>`).join("")}</div>

    <label class="field"><span><b>S</b>pecific — What exactly will you do?</span>
      <input type="text" data-f="title" value="${esc(g.title)}" placeholder="e.g. ${EXAMPLES[g.scope]}"></label>
    <div class="smart-check" data-c="S"></div>

    <div class="field"><span><b>M</b>easurable — How will you know it's done?</span>
      <div class="row wrap">
        <select data-f="measure" class="grow" style="min-width:200px">${Object.entries(MEASURES).map(([k, v]) => `<option value="${k}" ${g.measure === k ? "selected" : ""}>${v.label}</option>`).join("")}</select>
        <input type="number" data-f="target" min="0" step="0.5" value="${esc(g.target)}" placeholder="Target" style="width:110px">
        <input type="text" data-f="unit" value="${esc(g.unit)}" placeholder="problems" style="width:130px" ${g.measure === "units" ? "" : "hidden"}>
      </div></div>
    <div class="smart-check" data-c="M"></div>

    <div class="field"><span><b>A</b>chievable — onTop checks this against your real study history</span></div>
    <div class="smart-check" data-c="A"></div>

    <div class="field"><span><b>R</b>elevant — Which course or bigger goal is this for?</span>
      <div class="row wrap">
        <select data-f="courseId" class="grow" style="min-width:160px">${courseOptions(st.courses, g.courseId, { none: "— no course —" })}</select>
        <select data-f="eventId" class="grow" style="min-width:160px"><option value="">— no exam/deadline —</option>${exams.map((e) => `<option value="${e.id}" ${g.eventId === e.id ? "selected" : ""}>${esc(courseName(e.courseId))}: ${esc(e.title)} (${fmtDate(e.date)})</option>`).join("")}</select>
      </div>
      <input type="text" data-f="relevance" value="${esc(g.relevance)}" placeholder="Why it matters, e.g. “to get a B+ in STAT 200”"></div>
    <div class="smart-check" data-c="R"></div>

    <label class="field"><span><b>T</b>ime-bound — By when?</span>
      <input type="date" data-f="deadline" value="${esc(g.deadline)}" min="${todayKey()}"></label>
    <div class="smart-check" data-c="T"></div>

    ${existing ? "" : `<label class="check small"><input type="checkbox" data-f="makeTasks" ${g.makeTasks ? "checked" : ""}> Turn this into daily tasks on my planner</label>`}
    <div class="dlg-actions">
      <button class="btn" data-close>Cancel</button>
      <button class="btn primary" data-save>Save goal</button>
    </div>`, (dlg, close) => {
    const refresh = () => {
      const ev = evaluate(g);
      dlg.querySelector("[data-letters]").innerHTML = ["S", "M", "A", "R", "T"].map((k) => `<span class="${ev[k].ok ? "ok" : ""}" title="${ev[k].msg}">${k}</span>`).join("");
      for (const k of ["S", "M", "A", "R", "T"]) {
        const el = dlg.querySelector(`[data-c="${k}"]`);
        el.className = `smart-check ${ev[k].ok ? "ok" : ev[k].warn ? "warn" : ""}`;
        el.innerHTML = `<b>${ev[k].ok ? "✓" : ev[k].warn ? "!" : "○"}</b><span>${esc(ev[k].msg)}${ev[k].suggest ? ` <button class="btn sm" data-suggest>Use ${ev[k].suggest}</button>` : ""}</span>`;
      }
      dlg.querySelector("[data-suggest]")?.addEventListener("click", () => {
        g.target = ev.A.suggest; dlg.querySelector('[data-f="target"]').value = g.target; refresh();
      });
      const save = dlg.querySelector("[data-save]");
      save.textContent = ev.score === 5 ? "Save SMART goal ✓" : `Save anyway (${ev.score}/5)`;
      save.className = `btn ${ev.score === 5 ? "primary" : ""}`;
      return ev;
    };
    dlg.querySelectorAll("[data-scope] .chip").forEach((b) => b.addEventListener("click", () => {
      g.scope = b.dataset.v;
      g.deadline = defaultDeadline(g.scope);
      if (g.scope === "semester" && g.measure === "hours") g.measure = "avgDaily";
      dlg.querySelectorAll("[data-scope] .chip").forEach((x) => x.classList.toggle("active", x === b));
      dlg.querySelector('[data-f="deadline"]').value = g.deadline;
      dlg.querySelector('[data-f="measure"]').value = g.measure;
      dlg.querySelector('[data-f="title"]').placeholder = "e.g. " + EXAMPLES[g.scope];
      refresh();
    }));
    dlg.querySelectorAll("[data-f]").forEach((el) => {
      const evt = el.tagName === "SELECT" || el.type === "checkbox" || el.type === "date" ? "change" : "input";
      el.addEventListener(evt, () => {
        const k = el.dataset.f;
        g[k] = el.type === "checkbox" ? el.checked : el.value;
        if (k === "measure") dlg.querySelector('[data-f="unit"]').hidden = g.measure !== "units";
        if (k === "eventId" && g.eventId) {
          const e = eventById(g.eventId);
          if (e) { g.deadline = e.date; g.courseId = e.courseId; dlg.querySelector('[data-f="deadline"]').value = e.date; dlg.querySelector('[data-f="courseId"]').value = e.courseId; }
        }
        refresh();
      });
    });
    refresh();
    dlg.querySelector("[data-save]").addEventListener("click", () => {
      const ev = evaluate(g);
      if (!g.title.trim()) { toast("Give your goal a name first."); return; }
      if (!g.deadline) { toast("Pick a deadline — every SMART goal is time-bound."); return; }
      g.target = +g.target || 0;
      g.smartScore = ev.score;
      update((s) => {
        const i = s.goals.findIndex((x) => x.id === g.id);
        const clean = { ...g }; delete clean.makeTasks;
        if (i >= 0) s.goals[i] = clean; else s.goals.push(clean);
        if (!existing && g.makeTasks) makeDailyTasks(s, g);
      });
      if (ev.score === 5) emit("say", { text: "That's a proper SMART goal 🎯 I'll track it for you." });
      else emit("say", { text: `Saved! It's ${ev.score}/5 SMART — tweak it later to make it even sharper.` });
      close();
    });
  });
}

function makeDailyTasks(s, g) {
  const days = goalDays(g);
  if (days > 21) { toast("That goal is long — its daily target shows on Today instead of individual tasks."); return; }
  const per = g.measure === "units" ? `${Math.ceil(g.target / days)} ${g.unit}` :
    g.measure === "hours" ? `${Math.round((g.target / days) * 60)} min` :
      g.measure === "sessions" ? `${Math.ceil(g.target / days)} session(s)` : "";
  const estMin = g.measure === "hours" ? Math.round((g.target / days) * 60) : g.measure === "sessions" ? Math.ceil(g.target / days) * 25 : 45;
  for (let i = 0; i < days; i++) {
    s.tasks.push({
      id: uid(), courseId: g.courseId, title: `${g.title}${per ? ` — ${per}` : ""}`, estMin, date: addDays(g.start || todayKey(), i),
      done: false, carried: 0, goalId: g.id, createdAt: Date.now(),
    });
  }
}

export function openGoalReview(g) {
  const p = progress(g);
  let hit = g.status === "done" ? "yes" : "";
  openDialog(`
    <h2>Goal review</h2>
    <p><b>${esc(g.title)}</b><br><span class="muted">${fmtCurrent(g, p)} · deadline ${fmtDate(g.deadline)}</span></p>
    <div class="field"><span>Did you hit it?</span>
      <div class="chips" data-hit>${[["yes", "✅ Yes"], ["partly", "🌗 Partly"], ["no", "❌ Not this time"]].map(([v, l]) => `<button class="chip ${hit === v ? "active" : ""}" data-v="${v}">${l}</button>`).join("")}</div></div>
    <label class="field"><span>What helped?</span><textarea data-helped rows="2" placeholder="e.g. studying right after class, library 3rd floor">${esc(g.review?.helped || "")}</textarea></label>
    <label class="field"><span>What got in the way?</span><textarea data-blocked rows="2" placeholder="e.g. phone, too ambitious target, other deadlines">${esc(g.review?.blocked || "")}</textarea></label>
    <p class="small muted">Your answers make the next goal's “Achievable” check smarter. Honest reflection = better plans.</p>
    <div class="dlg-actions"><button class="btn" data-close>Later</button><button class="btn primary" data-save>Save review</button></div>`, (dlg, close) => {
    dlg.querySelectorAll("[data-hit] .chip").forEach((b) => b.addEventListener("click", () => {
      hit = b.dataset.v; dlg.querySelectorAll("[data-hit] .chip").forEach((x) => x.classList.toggle("active", x === b));
    }));
    dlg.querySelector("[data-save]").addEventListener("click", () => {
      update((s) => {
        const x = s.goals.find((y) => y.id === g.id);
        x.review = { hit, helped: dlg.querySelector("[data-helped]").value.trim(), blocked: dlg.querySelector("[data-blocked]").value.trim(), at: Date.now() };
        if (x.status === "active" || x.status === "ended") x.status = hit === "yes" ? "done" : "missed";
      });
      toast("Review saved. On to the next one 💪");
      close();
    });
  });
}

// Past reviews inform the Achievable check: summarize hit-rate for the Plan page.
export function hitRate() {
  const reviewed = S().goals.filter((g) => g.review?.hit);
  if (!reviewed.length) return null;
  const score = reviewed.reduce((a, g) => a + (g.review.hit === "yes" ? 1 : g.review.hit === "partly" ? 0.5 : 0), 0);
  return Math.round((score / reviewed.length) * 100);
}
