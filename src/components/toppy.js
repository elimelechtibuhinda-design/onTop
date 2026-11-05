// Toppy: the study-buddy owl. Draws itself by mood/outfit, talks in speech bubbles,
// and runs the nudge engine (study reminders, break reminders, late-night guard, 20-20-20).
import { S, update } from "../lib/store.js";
import { on, emit } from "../lib/bus.js";
import { esc, todayKey, daysBetween, pick, dateKey } from "../lib/utils.js";
import {
  streakInfo, nextExam, weekSec, courseName, lastStudiedKey, upcomingEvents, secOn, dueReviews,
} from "../lib/queries.js";
import { softPing } from "../lib/audio.js";
import { toast, confetti } from "./ui.js";
import { timerSnapshot } from "../views/focus.js";

/* ---------------- drawing ---------------- */
export function toppySvg(mood = "happy", outfit = "cap") {
  const eyes = {
    happy: `<path d="M30 46 q8 -9 16 0" stroke="#002145" stroke-width="4" fill="none" stroke-linecap="round"/>
            <path d="M54 46 q8 -9 16 0" stroke="#002145" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    neutral: `<circle cx="38" cy="45" r="9" fill="#fff"/><circle cx="62" cy="45" r="9" fill="#fff"/>
              <circle cx="39" cy="46" r="4.5" fill="#002145"/><circle cx="61" cy="46" r="4.5" fill="#002145"/>`,
    sleepy: `<path d="M30 47 h16 M54 47 h16" stroke="#002145" stroke-width="4" stroke-linecap="round"/>
             <text x="74" y="22" font-size="13" font-weight="800" fill="#97D4E9">z</text><text x="82" y="13" font-size="10" font-weight="800" fill="#97D4E9">z</text>`,
    excited: `<circle cx="38" cy="45" r="11" fill="#fff"/><circle cx="62" cy="45" r="11" fill="#fff"/>
              <circle cx="38" cy="45" r="6" fill="#002145"/><circle cx="62" cy="45" r="6" fill="#002145"/>
              <circle cx="40" cy="42" r="2.2" fill="#fff"/><circle cx="64" cy="42" r="2.2" fill="#fff"/>
              <path d="M10 20 l3 6 l6 1 l-5 4 l1 6 l-5 -3 l-5 3 l1 -6 l-5 -4 l6 -1z" fill="#F2A900"/>`,
    worried: `<circle cx="38" cy="47" r="8" fill="#fff"/><circle cx="62" cy="47" r="8" fill="#fff"/>
              <circle cx="38" cy="49" r="3.5" fill="#002145"/><circle cx="62" cy="49" r="3.5" fill="#002145"/>
              <path d="M28 35 l14 4 M72 35 l-14 4" stroke="#002145" stroke-width="3.5" stroke-linecap="round"/>`,
  }[mood] || "";
  const beak = mood === "worried"
    ? `<path d="M46 60 h8 l-4 5z" fill="#F2A900"/>`
    : `<path d="M44 58 h12 l-6 8z" fill="#F2A900"/>`;
  const outfits = {
    none: "",
    cap: `<path d="M22 22 L50 10 L78 22 L50 32Z" fill="#F2A900"/><path d="M72 25 v13" stroke="#F2A900" stroke-width="2.5"/><circle cx="72" cy="40" r="3" fill="#F2A900"/>`,
    headphones: `<path d="M18 50 Q18 14 50 14 Q82 14 82 50" stroke="#1d1d1d" stroke-width="5" fill="none"/>
                 <rect x="11" y="44" width="12" height="20" rx="5" fill="#F2A900"/><rect x="77" y="44" width="12" height="20" rx="5" fill="#F2A900"/>`,
    scarf: `<path d="M24 72 Q50 84 76 72 L76 80 Q50 92 24 80Z" fill="#F2A900"/>
            <path d="M30 76 l4 4 M40 79 l4 4 M52 80 l4 3 M64 78 l4 3" stroke="#002145" stroke-width="3"/>
            <rect x="62" y="78" width="9" height="18" rx="2" fill="#F2A900"/>`,
    sunglasses: `<rect x="26" y="38" width="22" height="14" rx="5" fill="#111"/><rect x="52" y="38" width="22" height="14" rx="5" fill="#111"/>
                 <path d="M48 44 h4" stroke="#111" stroke-width="3"/><path d="M30 41 l6 0" stroke="#fff" stroke-width="2" opacity=".6"/>`,
    crown: `<path d="M28 24 L32 6 L41 18 L50 4 L59 18 L68 6 L72 24Z" fill="#F2A900"/><circle cx="50" cy="15" r="3" fill="#00A7E1"/>`,
  }[outfit] || "";
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Toppy the owl, feeling ${mood}">
    <path d="M24 30 L30 12 L42 26Z M76 30 L70 12 L58 26Z" fill="#0055B7"/>
    <ellipse cx="50" cy="57" rx="34" ry="36" fill="#0055B7"/>
    <ellipse cx="50" cy="68" rx="22" ry="21" fill="#97D4E9"/>
    <path d="M18 60 Q10 72 22 82 M82 60 Q90 72 78 82" stroke="#003d85" stroke-width="7" fill="none" stroke-linecap="round"/>
    ${eyes}${beak}${outfit === "sunglasses" ? outfits : ""}
    <path d="M40 92 v5 M46 92 v5 M54 92 v5 M60 92 v5" stroke="#F2A900" stroke-width="3" stroke-linecap="round"/>
    ${outfit !== "sunglasses" ? outfits : ""}
  </svg>`;
}

export function currentMood() {
  if (excitedUntil > Date.now()) return "excited";
  const exam = nextExam();
  const studiedToday = secOn(todayKey()) > 0;
  if (exam && daysBetween(todayKey(), exam.date) <= 2 && !studiedToday) return "worried";
  if (studiedToday || streakInfo().streak >= 2) return "happy";
  const last = S().sessions.reduce((m, s) => (!m || s.dateKey > m ? s.dateKey : m), null);
  if (!last ? Date.now() - S().profile.createdAt > 86400000 : daysBetween(last, todayKey()) >= 2) return "sleepy";
  return "neutral";
}

/* ---------------- lines ---------------- */
const LINES = {
  usualTime: {
    friend: ["It's {time}, your usual study time. Want to start {course}? Even 10 minutes counts 💙", "Hey {name}! Study o'clock. Wanna do one quick round?"],
    coach: ["{time}. Study time. Let's get after {course} — one Pomodoro, go!", "Clock says study. You say? Let's GO, {name}."],
  },
  examLow: {
    friend: ["Your {course} {type} is in {days} days and you've done {week} this week. Just one Pomodoro? 🙏", "{course} {type} in {days} days… a little session now would feel really good later."],
    coach: ["{course} {type}: {days} days. This week: {week}. That's not enough. One Pomodoro. Now.", "{days} days to {course}. The {type} doesn't care how you feel. Start."],
  },
  neglected: {
    friend: ["You haven't opened {course} in {days} days 👀 Wanna say hi to it?", "{course} misses you ({days} days!). Maybe a quick review?"],
    coach: ["{days} days without {course}. That's a gap. Close it today.", "{course} — {days} days untouched. Fix it."],
  },
  longFocus: {
    friend: ["You've been going {mins} minutes. Your brain needs 5. Stand up, drink water 💧", "{mins} minutes straight — amazing! Now stretch and grab some water 🌿"],
    coach: ["{mins} minutes. Great work. Mandatory 5-minute break — recovery is training too.", "Break time, champ. {mins} minutes earned it. Water. Stretch. Back in 5."],
  },
  eye: {
    friend: ["👀 20-20-20: look at something 20 feet away for 20 seconds.", "Eye break! Look out the window for 20 seconds 🌲"],
    coach: ["20-20-20. Eyes off the screen, 20 feet away, 20 seconds. Go.", "Eye reset: 20 seconds, far away. Then back to it."],
  },
  lateNight: {
    friend: ["It's {time}. Sleep helps memory more than another hour of cramming. Go to bed 🌙", "Psst, it's {time}… your brain files today's learning while you sleep. Bedtime? 😴"],
    coach: ["{time}. Shut it down. Sleep is part of the study plan.", "It's {time}. Recovery wins exams. Bed. Now."],
  },
  breakStart: {
    friend: ["Break time! Drink some water 💧 or play a quick game.", "Nice round! Stretch, sip water, look outside 🌤️"],
    coach: ["Round done. Hydrate. Move. Reset.", "Good work. 5 minutes. Water, stretch — no phone doom-scroll."],
  },
  reviews: {
    friend: ["You've got {n} topic review{s} due today. Quick refresh = way better memory 🧠"],
    coach: ["{n} review{s} due. Spaced repetition only works if you show up."],
  },
  poke: {
    friend: ["Hi {name}! You're doing great 💙", "Hoot hoot! Need a study buddy? I'm here.", "Small steps every day beat cramming. Proud of you!", "You've got this! 💙💛"],
    coach: ["What are we crushing today, {name}?", "Discipline > motivation. Start the timer.", "Champions do the boring reps.", "No excuses. Now study."],
  },
};

function fill(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ""));
}
function line(key, vars = {}) {
  const p = S().profile.personality === "coach" ? "coach" : "friend";
  const time = new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return fill(pick(LINES[key][p]), { name: S().profile.name || "friend", time, ...vars });
}

/* ---------------- bubble & delivery ---------------- */
let wrap, btn, bubbleEl, hideTimer, excitedUntil = 0, mutedUntil = 0;

export function mountToppy() {
  wrap = document.createElement("div");
  wrap.className = "toppy-wrap";
  wrap.innerHTML = `<div class="bubble-slot"></div><button class="toppy-btn" aria-label="Toppy: go to Today, or talk to Toppy"></button>`;
  document.body.appendChild(wrap);
  btn = wrap.querySelector(".toppy-btn");
  btn.addEventListener("click", () => {
    if (bubbleEl) return hideBubble();
    // Anywhere but Today, Toppy takes you home. On Today, Toppy talks.
    const onToday = document.querySelector('[data-view="today"].active');
    if (!onToday && !document.body.classList.contains("focus-open")) return emit("go", { view: "today" });
    say(line("poke"), {
      force: true,
      actions: [
        { label: "▶ Start studying", run: () => emit("startFocus", {}) },
        { label: "🔕 Quiet 1h", run: () => { mutedUntil = Date.now() + 3600000; toast("Toppy will stay quiet for an hour."); } },
      ],
    });
  });
  redraw();
  on("celebrate", ({ text, big }) => celebrate(text, big));
  on("say", ({ text, actions }) => say(text, { actions }));
  on("breakStart", () => sayBreakStart());
  setInterval(redraw, 60000);
  setTimeout(runNudges, 6000);
  setInterval(runNudges, 60000);
}

export function redraw() {
  if (!btn) return;
  const p = S().profile;
  wrap.hidden = !S().profile.setupDone;
  btn.innerHTML = toppySvg(currentMood(), p.outfit);
  btn.classList.toggle("excited", excitedUntil > Date.now());
}

export function hideBubble() {
  clearTimeout(hideTimer);
  bubbleEl?.remove();
  bubbleEl = null;
}

export function say(text, { actions = [], force = false, notify = true, ms = 14000 } = {}) {
  const p = S().profile;
  if (!force && (p.personality === "quiet" || Date.now() < mutedUntil)) return false;
  if (!wrap) return false;
  hideBubble();
  bubbleEl = document.createElement("div");
  bubbleEl.className = "bubble";
  bubbleEl.setAttribute("role", "status");
  bubbleEl.innerHTML = `<button class="icon-btn x" aria-label="Close">✕</button><div style="padding-right:18px">${esc(text)}</div>` +
    (actions.length ? `<div class="b-actions">${actions.map((a, i) => `<button class="btn sm ${i ? "" : "primary"}" data-i="${i}">${esc(a.label)}</button>`).join("")}</div>` : "");
  wrap.querySelector(".bubble-slot").appendChild(bubbleEl);
  bubbleEl.querySelector(".x").addEventListener("click", hideBubble);
  bubbleEl.querySelectorAll("[data-i]").forEach((b) => b.addEventListener("click", () => { actions[+b.dataset.i].run(); hideBubble(); }));
  hideTimer = setTimeout(hideBubble, ms);
  if (p.chime) softPing();
  if (notify && document.hidden) systemNotify(text);
  return true;
}

function celebrate(text, big) {
  excitedUntil = Date.now() + 6000;
  redraw();
  setTimeout(redraw, 6200);
  if (big) confetti();
  if (!say(text, { notify: false })) toast(text);
}

export async function systemNotify(text) {
  if (!S().profile.notifications || !("Notification" in window) || Notification.permission !== "granted") return;
  const opts = { body: text, icon: "./icon-192.png", badge: "./icon-192.png", tag: "dialedin-toppy" };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return reg.showNotification("Toppy 🦉", opts);
    new Notification("Toppy 🦉", opts);
  } catch { /* notifications blocked */ }
}

export async function requestNotifications() {
  if (!("Notification" in window)) { toast("This browser doesn't support notifications."); return false; }
  const res = await Notification.requestPermission();
  const ok = res === "granted";
  update((st) => { st.profile.notifications = ok; });
  toast(ok ? "Notifications on — Toppy can reach you even in another tab." : "Notifications blocked. You can allow them in browser settings.");
  return ok;
}

/* ---------------- nudge engine ---------------- */
let lastEyeAt = 0;
function cooled(id, ms) {
  const last = S().nudges[id] || 0;
  return Date.now() - last > ms;
}
function mark(id) { update((st) => { st.nudges[id] = Date.now(); }); }

function nudge(id, cooldownMs, text, opts) {
  if (!cooled(id, cooldownMs)) return false;
  if (say(text, opts)) { mark(id); return true; }
  return false;
}

export function runNudges() {
  const st = S();
  if (!st.profile.setupDone || st.profile.personality === "quiet") return;
  const t = timerSnapshot();
  const now = new Date();
  const h = now.getHours(), m = now.getMinutes();
  const H = 3600000;

  // Late-night guard: 00:30 – 05:00
  if ((h === 0 && m >= 30) || (h >= 1 && h < 5)) {
    if (nudge("lateNight", 45 * 60000, line("lateNight"))) return;
  }

  if (t.active && t.phase === "focus") {
    const mins = Math.floor(t.continuousSec / 60);
    if (mins >= 55 && nudge("longFocus", 25 * 60000, line("longFocus", { mins }))) return;
    if (st.profile.eyeRule && t.continuousSec >= 20 * 60) {
      const since = Date.now() - Math.max(lastEyeAt, t.phaseStart);
      if (since >= 20 * 60000) { lastEyeAt = Date.now(); say(line("eye")); return; }
    }
    return; // don't pester with study nudges while studying
  }
  if (t.active) return;

  const today = todayKey();
  const studiedToday = secOn(today) > 0;
  const startAction = (courseId) => [{ label: "▶ Start", run: () => emit("startFocus", { courseId }) }];

  if (h === st.profile.studyHour && !studiedToday) {
    const c = st.courses[0];
    if (nudge("usualTime", 20 * H, line("usualTime", { course: c ? c.name : "something" }), { actions: startAction(c?.id) })) return;
  }

  const exam = upcomingEvents().find((e) => e.type === "exam" && daysBetween(today, e.date) <= 3);
  if (exam && weekSec(exam.courseId) < 3600) {
    const days = daysBetween(today, exam.date);
    const week = Math.round(weekSec(exam.courseId) / 60) + " min";
    if (nudge("examLow", 6 * H, line("examLow", { course: courseName(exam.courseId), type: "exam", days, week }), { actions: startAction(exam.courseId) })) return;
  }

  const due = dueReviews().length;
  if (due && nudge("reviews", 8 * H, line("reviews", { n: due, s: due > 1 ? "s" : "" }), { actions: [{ label: "See reviews", run: () => emit("go", { view: "plan", tab: "reviews" }) }] })) return;

  for (const c of st.courses) {
    const last = lastStudiedKey(c.id);
    const ref = last || (c.createdAt ? dateKey(new Date(c.createdAt)) : null);
    if (!ref) continue;
    const days = daysBetween(ref, today);
    if (days >= 5 && nudge("neglected:" + c.id, 24 * H, line("neglected", { course: c.name, days }), { actions: startAction(c.id) })) return;
  }
}

export function sayBreakStart() { say(line("breakStart")); }
export { line as toppyLine };
