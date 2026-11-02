// First-time setup: name → courses → exam dates → study style → "You're onTop ✓". Under a minute.
import { update } from "../lib/store.js";
import { esc, uid, todayKey } from "../lib/utils.js";
import { COURSE_COLORS } from "../lib/queries.js";
import { toppySvg } from "../components/toppy.js";
import { EMOJIS } from "./plan.js";

export function renderSetup(root, onDone) {
  const d = { name: "", courses: [], exams: [], mode: "pomodoro", dailyGoalMin: 120 };
  let step = 0;
  let emoji = EMOJIS[0];

  const draw = () => {
    const steps = [welcome, courses, exams, style, done];
    root.innerHTML = `<div class="setup"><div class="setup-card">
      <img class="toppy-big" alt="" src="data:image/svg+xml;utf8,${encodeURIComponent(toppySvg(step === 4 ? "excited" : "happy", "cap"))}">
      <div class="setup-steps" aria-label="Step ${step + 1} of 5">${[0, 1, 2, 3, 4].map((i) => `<i class="${i <= step ? "on" : ""}"></i>`).join("")}</div>
      <div class="stack">${steps[step]()}</div>
    </div></div>`;
    wire();
    root.querySelector("input")?.focus();
  };

  const welcome = () => `
    <h1>Hi! I'm Toppy 🦉</h1>
    <p class="muted">I'll help you stay <b>onTop</b> of your studies. Quick setup — under a minute.</p>
    <label class="field"><span>What should we call you?</span><input type="text" data-name value="${esc(d.name)}" placeholder="First name" autocomplete="given-name"></label>
    <p class="tiny muted">🔒 No sign-up. Everything stays on this device.</p>
    <div class="dlg-actions"><button class="btn primary" data-next>Next →</button></div>`;

  const courses = () => `
    <h2>What are you studying, ${esc(d.name || "friend")}?</h2>
    <p class="small muted">Add your courses. You can change these any time.</p>
    <div class="emoji-row">${EMOJIS.slice(0, 12).map((e) => `<button type="button" class="${e === emoji ? "active" : ""}" data-emoji="${e}">${e}</button>`).join("")}</div>
    <form class="row" data-add><input type="text" name="c" placeholder="e.g. STAT 200" class="grow"><button class="btn">Add</button></form>
    <div class="chips">${d.courses.map((c, i) => `<span class="chip" style="border-color:${c.color}">${c.emoji} ${esc(c.name)} <button class="icon-btn" data-rm="${i}" aria-label="Remove" style="min-height:20px;min-width:20px">✕</button></span>`).join("") || `<span class="small muted">No courses yet</span>`}</div>
    <div class="dlg-actions"><button class="btn ghost" data-back>← Back</button><button class="btn primary" data-next>${d.courses.length ? "Next →" : "Skip for now →"}</button></div>`;

  const exams = () => `
    <h2>When are your exams?</h2>
    <p class="small muted">Optional — this starts your countdowns. Add midterms, finals, big deadlines.</p>
    ${d.courses.length ? d.courses.map((c, i) => `<div class="row wrap">
      <span style="min-width:120px"><b>${c.emoji} ${esc(c.name)}</b></span>
      <input type="text" data-et="${i}" placeholder="Midterm" value="${esc(d.exams[i]?.title || "")}" style="flex:1;min-width:100px">
      <input type="date" data-ed="${i}" value="${d.exams[i]?.date || ""}" min="${todayKey()}" style="flex:1;min-width:140px"></div>`).join("")
      : `<p class="muted">Add courses first to set exam dates — or skip, you can add them later in Plan → Calendar.</p>`}
    <div class="dlg-actions"><button class="btn ghost" data-back>← Back</button><button class="btn primary" data-next>Next →</button></div>`;

  const style = () => `
    <h2>How do you like to study?</h2>
    <div class="stack tight">
      ${[["pomodoro", "🍅 Pomodoro", "25 min focus, 5 min break"], ["deep", "🧘 Long focus", "50 min focus, 10 min break"], ["stopwatch", "⏱️ Free timer", "Count up, break whenever"]].map(([v, l, s]) => `
        <button class="card flat row" data-mode="${v}" style="cursor:pointer;text-align:left;${d.mode === v ? "border-color:var(--gold);box-shadow:0 0 0 2px var(--gold)" : ""}">
          <b style="min-width:130px">${l}</b><span class="small muted">${s}</span></button>`).join("")}
    </div>
    <div class="field"><span>Daily study goal</span>
      <div class="chips">${[60, 120, 180, 240].map((m) => `<button class="chip ${d.dailyGoalMin === m ? "active" : ""}" data-goal="${m}">${m / 60}h</button>`).join("")}</div></div>
    <div class="dlg-actions"><button class="btn ghost" data-back>← Back</button><button class="btn primary" data-next>Finish →</button></div>`;

  const done = () => `
    <div class="center stack">
      <h1>You're onTop ✓</h1>
      <p class="muted">Hit the big <b>Start</b> button whenever you're ready. I'll remind you to study, take breaks, and celebrate your wins.</p>
      <button class="btn gold lg" data-finish>Let's go 🚀</button>
    </div>`;

  const wire = () => {
    const q = (s) => root.querySelector(s);
    q("[data-back]")?.addEventListener("click", () => { step--; draw(); });
    q("[data-next]")?.addEventListener("click", () => {
      if (step === 0) d.name = q("[data-name]").value.trim();
      if (step === 2) {
        d.exams = d.courses.map((_, i) => ({ title: q(`[data-et="${i}"]`).value.trim() || "Exam", date: q(`[data-ed="${i}"]`).value }));
      }
      step++; draw();
    });
    q("[data-name]")?.addEventListener("keydown", (e) => { if (e.key === "Enter") q("[data-next]").click(); });
    root.querySelectorAll("[data-emoji]").forEach((b) => b.addEventListener("click", () => { emoji = b.dataset.emoji; draw(); }));
    q("[data-add]")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = e.target.c.value.trim();
      if (!name) return;
      d.courses.push({ id: uid(), name, emoji, color: COURSE_COLORS[d.courses.length % COURSE_COLORS.length], links: [], notes: "", createdAt: Date.now() });
      emoji = EMOJIS[d.courses.length % EMOJIS.length];
      draw();
    });
    root.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => { d.courses.splice(+b.dataset.rm, 1); draw(); }));
    root.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => { d.mode = b.dataset.mode; draw(); }));
    root.querySelectorAll("[data-goal]").forEach((b) => b.addEventListener("click", () => { d.dailyGoalMin = +b.dataset.goal; draw(); }));
    q("[data-finish]")?.addEventListener("click", () => {
      update((st) => {
        st.profile.name = d.name;
        st.profile.timerMode = d.mode;
        st.profile.dailyGoalMin = d.dailyGoalMin;
        st.profile.setupDone = true;
        st.profile.createdAt = Date.now();
        st.profile.lastBackup = Date.now();   // don't nag about backups on day one
        st.courses.push(...d.courses);
        st.profile.lastCourseId = d.courses[0]?.id || "";
        d.exams.forEach((ex, i) => {
          if (ex.date) st.events.push({ id: uid(), courseId: d.courses[i].id, title: ex.title, type: "exam", date: ex.date });
        });
      });
      onDone();
    });
  };
  draw();
}

