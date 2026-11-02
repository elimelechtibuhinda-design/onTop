// Me: profile, Toppy, level/badges/garden, themes, sounds, accessibility, notifications, data & privacy.
import { S, update, replaceState, saveNow, defaultState, freezeSaves } from "../lib/store.js";
import { kvSet, doodleAll, doodleDelete, doodleClear, doodlePut } from "../lib/db.js";
import { esc, uid, download, todayKey, fmtDate } from "../lib/utils.js";
import { levelInfo, RANKS, courseName } from "../lib/queries.js";
import { BADGES, UNLOCKS, UNLOCK_NAMES, isUnlocked, unlockLevel, plantEmoji } from "../lib/rewards.js";
import { toppySvg, requestNotifications, redraw as redrawToppy } from "../components/toppy.js";
import { renderSounds } from "../components/sounds.js";
import { openDialog, confirmDialog, toast } from "../components/ui.js";

const THEME_SWATCH = {
  ubc: "linear-gradient(135deg,#002145,#0055B7 60%,#F2A900)",
  "ubc-dark": "linear-gradient(135deg,#040c16,#13263c 60%,#40B4E5)",
  library: "linear-gradient(135deg,#3a2414,#7b4a24 60%,#e9b65c)",
  nightsky: "linear-gradient(135deg,#06061a,#2a2766 60%,#ffd36b)",
  matcha: "linear-gradient(135deg,#2f4a22,#5a8a3a 60%,#c8e09a)",
  sunset: "linear-gradient(135deg,#5c1f2f,#d9542b 60%,#ffb347)",
};

let installPrompt = null;
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; });

export function renderMe(el) {
  const st = S();
  const p = st.profile;
  const lvl = levelInfo();
  el.innerHTML = `
    <div class="grid-2">
      <div class="card">
        <div class="row" style="gap:16px">
          <div style="width:90px;flex:none">${toppySvg("happy", p.outfit)}</div>
          <div class="grow">
            <h2>${esc(p.name || "Student")}</h2>
            <p class="muted">${lvl.rank.emoji} ${lvl.rank.name} · Level ${lvl.level} · ${st.xp} XP</p>
            <div class="bar gold" style="margin-top:8px"><i style="width:${(lvl.into / lvl.need) * 100}%"></i></div>
            <p class="tiny muted" style="margin-top:4px">${lvl.need - lvl.into} XP to level ${lvl.level + 1} · 1 XP per focused minute${lvl.next ? ` · ${lvl.next.xp - st.xp} XP to ${lvl.next.emoji} ${lvl.next.name}` : ""}</p>
          </div>
        </div>
        <div class="row wrap" style="margin-top:14px;gap:6px">${RANKS.map((r) => `<span class="pill ${st.xp >= r.xp ? "gold" : ""}">${r.emoji} ${r.name}</span>`).join("")}</div>
      </div>
      <div class="card stack">
        <h3>Profile</h3>
        <label class="field"><span>Your name</span><input type="text" data-p="name" value="${esc(p.name)}"></label>
        <div class="row wrap">
          <label class="field grow"><span>Daily study goal (min)</span><input type="number" data-p="dailyGoalMin" min="15" step="15" value="${p.dailyGoalMin}"></label>
          <label class="field grow"><span>Usual study time</span><select data-p="studyHour">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${p.studyHour === h ? "selected" : ""}>${new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: "numeric" })}</option>`).join("")}</select></label>
        </div>
      </div>
    </div>

    <div class="section card">
      <div class="card-head"><h3>🏅 Badges</h3><span class="small muted">${Object.keys(st.badges).length}/${BADGES.length}</span></div>
      <div class="badge-grid">${BADGES.map((b) => `<div class="badge ${st.badges[b.id] ? "" : "locked"}"><span class="e">${b.emoji}</span><b>${b.name}</b><span>${st.badges[b.id] ? "Earned " + new Date(st.badges[b.id]).toLocaleDateString() : b.desc}</span></div>`).join("")}</div>
    </div>

    <div class="section card">
      <div class="card-head"><h3>🌱 Study garden</h3><span class="small muted">${st.garden.filter((g) => g.kind !== "wilted").length} plants · ${st.garden.filter((g) => g.kind === "wilted").length} wilted</span></div>
      <div class="garden" aria-label="Your study garden">${st.garden.slice(-200).map((g) => `<span title="${fmtDate(g.date)} · ${esc(courseName(g.courseId))}">${plantEmoji(g.kind)}</span>`).join("") || `<p class="small muted" style="grid-column:1/-1;text-align:center">Finish a session to plant your first seed 🌱</p>`}</div>
      <p class="tiny muted" style="margin-top:8px">🌱 under 10 min · 🌷 10+ · 🌻 25+ · 🌳 60+ · 🥀 ended a timed session early</p>
    </div>

    <div class="grid-2 section">
      <div class="card stack">
        <h3>🦉 Toppy</h3>
        <div class="field"><span>Personality</span>
          <div class="chips">${[["friend", "😊 Chill friend"], ["coach", "📣 Coach"], ["quiet", "🤫 Quiet"]].map(([v, l]) => `<button class="chip ${p.personality === v ? "active" : ""}" data-pers="${v}">${l}</button>`).join("")}</div>
          <span class="hint">${p.personality === "coach" ? "“Let's GO. Midterm doesn't care.”" : p.personality === "quiet" ? "No messages — just the timer." : "“No stress, just 10 mins?”"}</span></div>
        <div class="field"><span>Outfit</span>
          <div class="outfits">${Object.keys(UNLOCKS.outfit).map((o) => {
            const ok = isUnlocked("outfit", o);
            return `<button class="outfit ${p.outfit === o ? "active" : ""} ${ok ? "" : "locked"}" data-outfit="${o}" ${ok ? "" : "disabled"}>${toppySvg("happy", o)}<div>${ok ? UNLOCK_NAMES[o] : "🔒 Lvl " + unlockLevel("outfit", o)}</div></button>`;
          }).join("")}</div></div>
        <label class="check"><input type="checkbox" data-t="notifications" ${p.notifications ? "checked" : ""}> Browser notifications (reminders while in another tab)</label>
        <label class="check"><input type="checkbox" data-t="chime" ${p.chime ? "checked" : ""}> Chime when Toppy talks</label>
        <label class="check"><input type="checkbox" data-t="eyeRule" ${p.eyeRule ? "checked" : ""}> 20-20-20 eye reminders</label>
        <p class="tiny muted">Reminders work while onTop is open (any tab). Install it as an app so it can stay open all day.</p>
      </div>
      <div class="card stack">
        <h3>🎨 Themes</h3>
        <div class="theme-grid">${Object.keys(UNLOCKS.theme).map((t) => {
          const ok = isUnlocked("theme", t);
          return `<button class="theme-sw ${p.theme === t ? "active" : ""} ${ok ? "" : "locked"}" data-theme-pick="${t}" ${ok ? "" : "disabled"}>
            <div class="sw" style="background:${THEME_SWATCH[t]}"></div><b class="small">${UNLOCK_NAMES[t]}</b><div class="tiny muted">${ok ? "" : "🔒 Level " + unlockLevel("theme", t)}</div></button>`;
        }).join("")}</div>
        <h3 style="margin-top:8px">♿ Accessibility</h3>
        <label class="check"><input type="checkbox" data-t="font" ${p.font === "easy" ? "checked" : ""}> Easy-read font (Atkinson Hyperlegible, dyslexia-friendly spacing)</label>
        <label class="check"><input type="checkbox" data-t="reducedMotion" ${p.reducedMotion ? "checked" : ""}> Reduce motion</label>
        <label class="check"><input type="checkbox" data-t="highContrast" ${p.highContrast ? "checked" : ""}> High contrast</label>
        <h3 style="margin-top:8px">🔔 Sound cues</h3>
        <label class="check"><input type="checkbox" data-t="soundCues" ${p.soundCues ? "checked" : ""}> Bell when focus ends, chime when break ends</label>
        <label class="check"><input type="checkbox" data-t="tick" ${p.tick ? "checked" : ""}> Quiet ticking clock during focus</label>
      </div>
    </div>

    <div class="grid-2 section">
      <div class="card" data-sounds></div>
      <div class="stack">
        <div class="card">
          <div class="card-head"><h3>📋 Exam-day checklist</h3></div>
          ${st.checklist.map((c) => `<div class="list-row"><label class="check grow"><input type="checkbox" data-check="${c.id}" ${c.done ? "checked" : ""}> ${esc(c.text)}</label><button class="icon-btn" data-delcheck="${c.id}" aria-label="Remove">✕</button></div>`).join("")}
          <form class="row" data-addcheck style="margin-top:8px"><input type="text" name="t" placeholder="Add item, e.g. Formula sheet" class="grow"><button class="btn sm">Add</button></form>
          <p class="tiny muted" style="margin-top:6px">Shows up on Today when an exam is 2 days away.</p>
        </div>
        <div class="card"><div class="card-head"><h3>🖼️ Break-art gallery</h3></div><div data-gallery class="grid-3"><p class="small muted">Loading…</p></div></div>
      </div>
    </div>

    <div class="grid-2 section">
      <div class="card stack">
        <h3>💾 Your data</h3>
        <p class="small muted">Last backup: ${p.lastBackup ? new Date(p.lastBackup).toLocaleString() : "never"}</p>
        <div class="row wrap">
          <button class="btn primary" data-backup>⬇ Back up my data</button>
          <button class="btn" data-restore>⬆ Restore from backup</button>
          <button class="btn" data-csv>📄 Export sessions (CSV)</button>
        </div>
        <p class="small muted">Moving to a new phone or laptop? Back up here, then Restore on the other device.</p>
        <input type="file" accept="application/json,.json" data-file hidden>
        ${installPrompt ? `<button class="btn gold" data-install>📲 Install onTop as an app</button>` : `<p class="tiny muted">📲 To install: on iPhone tap Share → “Add to Home Screen”; on Android/Chrome use the menu → “Install app”.</p>`}
      </div>
      <div class="card stack">
        <h3>🔒 Privacy</h3>
        <p><b>Your data never leaves your device.</b> No accounts. No tracking. No ads. Everything is stored in this browser only.</p>
        <p class="small muted">That also means if you clear your browser data, it's gone — so back up now and then.</p>
        <button class="btn danger" data-wipe>Delete everything</button>
      </div>
    </div>
    <p class="footer-note">onTop · made with 💙💛 for students · not an official UBC app</p>`;

  // Profile fields
  el.querySelectorAll("[data-p]").forEach((i) => i.addEventListener("change", () => update((s) => {
    const k = i.dataset.p;
    s.profile[k] = k === "name" ? i.value.trim() : +i.value;
  })));
  el.querySelectorAll("[data-pers]").forEach((b) => b.addEventListener("click", () => update((s) => { s.profile.personality = b.dataset.pers; })));
  el.querySelectorAll("[data-outfit]").forEach((b) => b.addEventListener("click", () => { update((s) => { s.profile.outfit = b.dataset.outfit; }); redrawToppy(); }));
  el.querySelectorAll("[data-theme-pick]").forEach((b) => b.addEventListener("click", () => update((s) => { s.profile.theme = b.dataset.themePick; })));
  el.querySelectorAll("[data-t]").forEach((c) => c.addEventListener("change", async () => {
    const k = c.dataset.t;
    if (k === "notifications") {
      if (c.checked) { if (!(await requestNotifications())) c.checked = false; }
      else update((s) => { s.profile.notifications = false; });
      return;
    }
    update((s) => { s.profile[k] = k === "font" ? (c.checked ? "easy" : "default") : c.checked; });
  }));
  renderSounds(el.querySelector("[data-sounds]"));

  el.querySelectorAll("[data-check]").forEach((c) => c.addEventListener("change", () => update((s) => { s.checklist.find((x) => x.id === c.dataset.check).done = c.checked; })));
  el.querySelectorAll("[data-delcheck]").forEach((b) => b.addEventListener("click", () => update((s) => { s.checklist = s.checklist.filter((x) => x.id !== b.dataset.delcheck); })));
  el.querySelector("[data-addcheck]").addEventListener("submit", (e) => {
    e.preventDefault();
    const t = e.target.t.value.trim();
    if (t) update((s) => s.checklist.push({ id: uid(), text: t, done: false }));
  });

  renderGallery(el.querySelector("[data-gallery]"));

  el.querySelector("[data-backup]").addEventListener("click", backupNow);
  const file = el.querySelector("[data-file]");
  el.querySelector("[data-restore]").addEventListener("click", () => file.click());
  file.addEventListener("change", () => restoreFrom(file.files[0]));
  el.querySelector("[data-csv]").addEventListener("click", exportCsv);
  el.querySelector("[data-install]")?.addEventListener("click", async () => { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; });
  el.querySelector("[data-wipe]").addEventListener("click", wipeAll);
}

async function renderGallery(box) {
  let items = [];
  try { items = (await doodleAll()).sort((a, b) => b.createdAt - a.createdAt); } catch { /* no IDB */ }
  if (!box.isConnected) return;
  if (!items.length) { box.innerHTML = `<p class="small muted">Doodles you save on breaks show up here ✏️</p>`; return; }
  box.innerHTML = items.map((d) => `<div style="position:relative"><img src="${d.data}" alt="Doodle from ${new Date(d.createdAt).toLocaleDateString()}" style="width:100%;border-radius:10px;border:1px solid var(--rule);background:#fff">
    <button class="icon-btn" data-deldood="${d.id}" style="position:absolute;top:4px;right:4px;background:var(--surface)" aria-label="Delete doodle">✕</button></div>`).join("");
  box.querySelectorAll("[data-deldood]").forEach((b) => b.addEventListener("click", async () => { await doodleDelete(b.dataset.deldood); renderGallery(box); }));
}

/* ---------------- data ---------------- */
export async function backupNow() {
  await saveNow();
  let doodles = [];
  try { doodles = await doodleAll(); } catch { /* ignore */ }
  update((s) => { s.profile.lastBackup = Date.now(); });
  const payload = { app: "onTop", format: 1, exportedAt: new Date().toISOString(), state: S(), doodles };
  download(`ontop-backup-${todayKey()}.json`, JSON.stringify(payload));
  toast("Backup downloaded 💾 Keep it somewhere safe (Drive, iCloud, email to yourself).");
}

async function restoreFrom(file) {
  if (!file) return;
  let data;
  try { data = JSON.parse(await file.text()); } catch { return toast("That file isn't a valid onTop backup."); }
  if (data?.app !== "onTop" || !data.state) return toast("That file isn't an onTop backup.");
  const n = data.state.sessions?.length || 0;
  if (!(await confirmDialog(`Restore this backup from ${new Date(data.exportedAt).toLocaleString()} (${n} sessions)? It replaces everything currently in onTop on this device.`, { okText: "Restore", danger: true, title: "Restore backup?" }))) return;
  replaceState(data.state);
  try { await doodleClear(); for (const d of data.doodles || []) await doodlePut(d); } catch { /* ignore */ }
  toast("Restored ✓ Welcome back!");
}

function exportCsv() {
  const rows = [["date", "start_time", "course", "minutes", "distracted_minutes", "focus_1to4", "mode", "note"]];
  S().sessions.slice().sort((a, b) => a.start - b.start).forEach((s) => rows.push([
    s.dateKey, new Date(s.start).toTimeString().slice(0, 5), courseName(s.courseId), Math.round(s.durationSec / 60),
    Math.round((s.distractedSec || 0) / 60), s.focus || "", s.mode || "", s.note || "",
  ]));
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  download(`ontop-sessions-${todayKey()}.csv`, csv, "text/csv");
}

async function wipeAll() {
  if (!(await confirmDialog("This permanently deletes ALL your onTop data on this device: courses, sessions, goals, notes, flashcards, garden, everything.", { okText: "Continue", danger: true, title: "Delete everything?" }))) return;
  openDialog(`
    <h2>Last check</h2>
    <p>Type <b>DELETE</b> to confirm. Consider backing up first.</p>
    <input type="text" data-confirm autocomplete="off">
    <div class="dlg-actions"><button class="btn" data-close>Cancel</button><button class="btn" data-bk>Back up first</button><button class="btn danger solid" data-go disabled>Delete everything</button></div>`, (dlg) => {
    const input = dlg.querySelector("[data-confirm]"), go = dlg.querySelector("[data-go]");
    input.addEventListener("input", () => { go.disabled = input.value.trim() !== "DELETE"; });
    dlg.querySelector("[data-bk]").addEventListener("click", backupNow);
    go.addEventListener("click", async () => {
      freezeSaves();
      await kvSet("state", defaultState());
      try { await doodleClear(); } catch { /* ignore */ }
      ["ontop-timer", "ontop-mix"].forEach((k) => localStorage.removeItem(k));
      location.reload();
    });
  });
}
