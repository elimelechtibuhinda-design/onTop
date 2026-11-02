// onTop entry: loads state, applies preferences, renders the shell + router, mounts Toppy and the focus timer.
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/fraunces/700.css";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "./styles/main.css";

import { registerSW } from "virtual:pwa-register";
import { S, loadState, subscribe, update } from "./lib/store.js";
import { requestPersistence } from "./lib/db.js";
import { on } from "./lib/bus.js";
import { todayKey } from "./lib/utils.js";
import { renderSetup } from "./views/setup.js";
import { renderToday } from "./views/today.js";
import { renderPlan, setPlanTab } from "./views/plan.js";
import { renderStats, setStatsOpts } from "./views/stats.js";
import { renderMe } from "./views/me.js";
import { initFocus, openFocus } from "./views/focus.js";
import { mountToppy, redraw as redrawToppy } from "./components/toppy.js";
import { syncGoals } from "./components/smart.js";
import { checkBadges } from "./lib/rewards.js";

const VIEWS = {
  today: { label: "Today", icon: "🏠", title: "Today", render: renderToday },
  plan: { label: "Plan", icon: "🗓️", title: "Plan", render: renderPlan },
  stats: { label: "Stats", icon: "📊", title: "Stats", render: renderStats },
  me: { label: "Me", icon: "🦉", title: "Me", render: renderMe },
};

const app = document.getElementById("app");
let current = localStorage.getItem("ontop-view") || "today";
if (!VIEWS[current]) current = "today";
let mainEl = null;
let pendingRender = false;

function applyPrefs() {
  const p = S().profile;
  const html = document.documentElement;
  html.dataset.theme = p.theme || "ubc";
  html.dataset.font = p.font || "default";
  html.dataset.motion = p.reducedMotion ? "reduced" : "full";
  html.dataset.contrast = p.highContrast ? "high" : "normal";
}

function shell() {
  app.innerHTML = `
    <div class="app">
      <nav class="rail" aria-label="Main">
        <div class="brand"><img src="./icon.svg" alt=""><b>on<span>Top</span></b></div>
        ${Object.entries(VIEWS).map(([id, v]) => `<button class="nav-btn" data-view="${id}"><span class="ico" aria-hidden="true">${v.icon}</span>${v.label}</button>`).join("")}
        <button class="nav-btn" data-focus style="margin-top:14px;background:var(--gold);color:#1a1300"><span class="ico">▶</span>Start focus</button>
        <div class="rail-foot">Your data stays on this device 🔒</div>
      </nav>
      <main class="main" id="main" tabindex="-1"></main>
      <nav class="tabbar" aria-label="Main">
        ${Object.entries(VIEWS).map(([id, v]) => `<button data-view="${id}"><span class="ico" aria-hidden="true">${v.icon}</span>${v.label}</button>`).join("")}
      </nav>
    </div>`;
  mainEl = document.getElementById("main");
  app.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => go(b.dataset.view)));
  app.querySelector("[data-focus]").addEventListener("click", () => openFocus({}));
}

function go(view, opts = {}) {
  if (view === "plan" && opts.tab) setPlanTab(opts.tab);
  if (view === "stats" && opts.recap) setStatsOpts({ recap: opts.recap });
  current = view;
  localStorage.setItem("ontop-view", view);
  render();
  mainEl.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

function render() {
  if (!mainEl) return;
  app.querySelectorAll("[data-view]").forEach((b) => {
    const on = b.dataset.view === current;
    b.classList.toggle("active", on);
    if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  const y = window.scrollY;
  VIEWS[current].render(mainEl);
  window.scrollTo({ top: y });
}

// Re-render on state changes, but never while the user is typing in the page or a dialog is open.
function scheduleRender() {
  const a = document.activeElement;
  const typing = a && mainEl?.contains(a) && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && !["checkbox", "radio", "range", "button", "submit"].includes(a.type)));
  if (typing) { pendingRender = true; return; }
  pendingRender = false;
  render();
}
document.addEventListener("focusout", () => setTimeout(() => { if (pendingRender) scheduleRender(); }, 0));

// Unfinished tasks from earlier days roll over to today.
function carryOver() {
  const today = todayKey();
  const stale = S().tasks.some((t) => !t.done && t.date && t.date < today);
  if (!stale) return;
  update((st) => {
    st.tasks.forEach((t) => {
      if (!t.done && t.date && t.date < today) { t.date = today; t.carried = (t.carried || 0) + 1; }
    });
  });
}

let lastDay = todayKey();
function onMinute() {
  if (todayKey() !== lastDay) { lastDay = todayKey(); carryOver(); render(); }
}

async function boot() {
  await loadState();
  applyPrefs();
  requestPersistence();
  registerSW({ immediate: true });
  mountToppy();
  initFocus();

  const startApp = () => {
    shell();
    carryOver();
    syncGoals();
    checkBadges();
    render();
    redrawToppy();
  };
  if (!S().profile.setupDone) renderSetup(app, startApp);
  else startApp();

  subscribe(() => { applyPrefs(); redrawToppy(); syncGoals(); if (mainEl) scheduleRender(); });
  on("go", ({ view, ...opts }) => go(view, opts));
  on("timerEnded", () => { syncGoals(); scheduleRender(); });
  setInterval(onMinute, 60000);
}

boot();
