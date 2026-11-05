// Dialed In entry: loads state, applies preferences, renders the shell + router, mounts Toppy and the focus timer.
import "./lib/rename-migrate.js";
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
import { S, store, loadState, subscribe, update, replaceState } from "./lib/store.js";
import { requestPersistence } from "./lib/db.js";
import { on } from "./lib/bus.js";
import { todayKey } from "./lib/utils.js";
import { renderSetup } from "./views/setup.js";
import { renderToday } from "./views/today.js";
import { renderPlan, setPlanTab } from "./views/plan.js";
import { renderStats, setStatsOpts } from "./views/stats.js";
import { renderMe } from "./views/me.js";
import { initFocus, openFocus, isFocusActive } from "./views/focus.js";
import { mountToppy, redraw as redrawToppy } from "./components/toppy.js";
import { mountDock } from "./components/dock.js";
import { syncGoals } from "./components/smart.js";
import { checkBadges } from "./lib/rewards.js";
import { countOpen } from "./lib/analytics.js";
import { initSync } from "./lib/sync.js";
import { unusedImageIds, removeImage } from "./lib/images.js";
import { openJoinDialog } from "./components/sync-ui.js";
import { syncInfo } from "./lib/sync.js";

const VIEWS = {
  today: { label: "Today", icon: "🏠", title: "Today", render: renderToday },
  plan: { label: "Plan", icon: "🗓️", title: "Plan", render: renderPlan },
  stats: { label: "Stats", icon: "📊", title: "Stats", render: renderStats },
  me: { label: "Me", icon: "🦉", title: "Me", render: renderMe },
};

const app = document.getElementById("app");
let current = localStorage.getItem("dialedin-view") || "today";
if (!VIEWS[current]) current = "today";
let mainEl = null;
let pendingRender = false;

function applyPrefs() {
  const p = S().profile;
  const html = document.documentElement;
  html.dataset.theme = p.theme || "classic";
  html.dataset.font = p.font || "default";
  html.dataset.motion = p.reducedMotion ? "reduced" : "full";
  html.dataset.contrast = p.highContrast ? "high" : "normal";
}

function shell() {
  app.innerHTML = `
    <div class="app">
      <nav class="rail" aria-label="Main">
        <button class="brand" data-home aria-label="Dialed In — go to Today"><img src="./icon.svg" alt=""><b>Dialed<span> In</span></b></button>
        ${Object.entries(VIEWS).map(([id, v]) => `<button class="nav-btn" data-view="${id}"><span class="ico" aria-hidden="true">${v.icon}</span>${v.label}</button>`).join("")}
        <button class="nav-btn" data-focus style="margin-top:14px;background:var(--gold);color:#1a1300"><span class="ico">▶</span>Start focus</button>
        <div class="rail-foot">Your study data stays on this device 🔒</div>
      </nav>
      <main class="main" id="main" tabindex="-1"></main>
      <nav class="tabbar" aria-label="Main">
        ${Object.entries(VIEWS).map(([id, v]) => `<button data-view="${id}"><span class="ico" aria-hidden="true">${v.icon}</span>${v.label}</button>`).join("")}
      </nav>
    </div>`;
  mainEl = document.getElementById("main");
  app.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => go(b.dataset.view)));
  app.querySelector("[data-focus]").addEventListener("click", () => openFocus({}));
  app.querySelector("[data-home]").addEventListener("click", () => go("today"));
}

function go(view, opts = {}) {
  if (view === "plan" && opts.tab) setPlanTab(opts.tab);
  if (view === "stats" && opts.recap) setStatsOpts({ recap: opts.recap });
  current = view;
  localStorage.setItem("dialedin-view", view);
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
  // We loaded fine: clear the reload-retry counter and the cache-busting ?r= from the address bar.
  try { sessionStorage.removeItem("dialedin-retry"); } catch { /* ignore */ }
  if (location.search.includes("r=")) history.replaceState(null, "", location.pathname + location.hash);
  await loadState();
  applyPrefs();
  requestPersistence();
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      const busy = () => isFocusActive() || document.querySelector("dialog[open]");
      if (!busy()) return updateSW(true);
      showUpdateBanner(() => updateSW(true));
      // …and apply it on its own as soon as the session/dialog is over.
      const h = setInterval(() => { if (!busy()) { clearInterval(h); updateSW(true); } }, 5000);
    },
  });
  mountToppy();
  mountDock();
  initFocus();

  const startApp = () => {
    document.getElementById("about")?.remove();   // the intro is only for people who haven't set up yet
    try { localStorage.setItem("dialedin-setup", "1"); } catch { /* ignore */ }   // hides it instantly on the next load
    shell();
    initSync();
    // Opened from a sync QR code / link: offer to join (the code stays in the #fragment, never sent anywhere).
    const m = location.hash.match(/sync=([0-9A-Za-z-]+)/);
    if (m) {
      history.replaceState(null, "", location.pathname + location.search);
      if (!syncInfo().on) setTimeout(() => openJoinDialog(m[1]), 400);
    }
    carryOver();
    syncGoals();
    checkBadges();
    render();
    redrawToppy();
  };
  countOpen();
  if (store.loadFailed) { renderLoadError(); return; }
  if (!S().profile.setupDone) {
    renderSetup(app, startApp);
    const m = location.hash.match(/sync=([0-9A-Za-z-]+)/);
    if (m) { history.replaceState(null, "", location.pathname + location.search); setTimeout(() => openJoinDialog(m[1], () => location.reload()), 400); }
  }
  else startApp();

  subscribe(() => { applyPrefs(); redrawToppy(); syncGoals(); if (mainEl) scheduleRender(); });
  on("go", ({ view, ...opts }) => go(view, opts));
  on("imagesArrived", () => scheduleRender());
  // Tidy pictures no card uses any more (sync does this itself when it's on).
  setTimeout(async () => { if (!syncInfo().on) for (const id of await unusedImageIds().catch(() => [])) removeImage(id); }, 5000);
  on("timerEnded", () => { syncGoals(); scheduleRender(); });
  setInterval(onMinute, 60000);
}

// A new version is ready. Never reload on our own: a student could be mid-check-in.
function showUpdateBanner(apply) {
  if (document.querySelector(".update-banner")) return;
  const b = document.createElement("div");
  b.className = "update-banner";
  b.innerHTML = `<span>✨ Dialed In has an update</span><button class="btn sm gold">Refresh</button><button class="icon-btn" aria-label="Later">✕</button>`;
  b.querySelector(".btn").addEventListener("click", apply);
  b.querySelector(".icon-btn").addEventListener("click", () => b.remove());
  document.body.appendChild(b);
}

// Saved data exists but couldn't be read. Don't show setup (that would look like a fresh start)
// and don't save anything — the real data stays untouched until it can be read again.
function renderLoadError() {
  app.innerHTML = `<div class="setup"><div class="setup-card stack">
    <h2>We couldn't open your saved data 😕</h2>
    <p>Nothing has been changed or deleted. This usually fixes itself — try reloading.</p>
    <p class="small muted">If you're in a private/incognito window, or your browser blocks site storage, Dialed In can't read your data there.</p>
    <div class="row wrap"><button class="btn primary" data-reload>Reload</button>
      <button class="btn" data-restore>Restore from a backup file</button></div>
    <input type="file" accept="application/json,.json" data-file hidden>
  </div></div>`;
  app.querySelector("[data-reload]").addEventListener("click", () => location.reload());
  const file = app.querySelector("[data-file]");
  app.querySelector("[data-restore]").addEventListener("click", () => file.click());
  file.addEventListener("change", async () => {
    try {
      const data = JSON.parse(await file.files[0].text());
      if (!["DialedIn", "Dialed In"].includes(data?.app) || !data.state) throw new Error();
      store.loadFailed = false;
      replaceState(data.state);
      setTimeout(() => location.reload(), 300);
    } catch { alert("That file isn't an Dialed In backup."); }
  });
}

boot();
