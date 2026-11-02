// Stats: week chart, course split, year heatmap, best focus time, balance warning, weekly recap image, session log.
import { S, update } from "../lib/store.js";
import { esc, todayKey, addDays, weekStartKey, fmtHM, fmtDate, fmtTime, parseKey, download } from "../lib/utils.js";
import { secOn, secInRange, courseName, courseColor, streakInfo, upcomingEvents, weekDays, levelInfo } from "../lib/queries.js";
import { confirmDialog, openDialog, toast } from "../components/ui.js";

const ui = { range: "week", logLimit: 30 };
export function setStatsOpts(o) { Object.assign(ui, o); }

export function renderStats(el) {
  const st = S();
  if (!st.sessions.length) {
    el.innerHTML = `<div class="empty">No sessions yet. Start a focus session from Today and your stats will appear here 📊</div>`;
    return;
  }
  const today = todayKey();
  const wk = weekStartKey();
  const weekTotal = secInRange(wk, today);
  const lastWeekTotal = secInRange(addDays(wk, -7), addDays(wk, -1));
  const allTotal = st.sessions.reduce((a, s) => a + s.durationSec, 0);
  const streak = streakInfo().streak;
  el.innerHTML = `
    <div class="grid-3">
      <div class="card"><span class="label">This week</span><div class="big-num">${fmtHM(weekTotal)}</div>
        <p class="small ${weekTotal >= lastWeekTotal ? "" : "muted"}">${lastWeekTotal ? (weekTotal >= lastWeekTotal ? "▲ " : "▼ ") + fmtHM(Math.abs(weekTotal - lastWeekTotal)) + " vs last week" : "First week — nice start!"}</p></div>
      <div class="card"><span class="label">All time</span><div class="big-num">${fmtHM(allTotal)}</div><p class="small muted">${st.sessions.length} sessions</p></div>
      <div class="card"><span class="label">Streak · best day</span><div class="big-num">🔥 ${streak}</div><p class="small muted">Best day: ${fmtHM(st.records.bestDaySec)}</p></div>
    </div>
    ${balanceWarning()}
    <div class="grid-2 section">
      <div class="card"><div class="card-head"><h3>This week</h3><span class="small muted">goal line = ${fmtHM(st.profile.dailyGoalMin * 60)}/day</span></div>${weekChart()}</div>
      <div class="card"><div class="card-head"><h3>By course</h3>
        <div class="chips">${["week", "month", "all"].map((r) => `<button class="chip ${ui.range === r ? "active" : ""}" data-range="${r}">${r === "all" ? "All time" : "This " + r}</button>`).join("")}</div></div>
        ${courseSplit()}</div>
    </div>
    <div class="card section"><div class="card-head"><h3>Your study year</h3>
      <div class="heat-legend">Less ${HEAT.map((c) => `<i style="background:${c}"></i>`).join("")} More</div></div>
      <div class="heatmap">${heatmap()}</div></div>
    <div class="grid-2 section">
      <div class="card">${bestFocus()}</div>
      <div class="card"><div class="card-head"><h3>📬 Weekly recap</h3></div>
        <p class="small muted">A shareable card with your week: hours, best day, streak and a highlight. Perfect for the group chat.</p>
        <div class="row" style="margin-top:10px"><button class="btn primary" data-recap>Make this week's recap</button><button class="btn" data-recaplast>Last week</button></div></div>
    </div>
    <div class="card section"><div class="card-head"><h3>Session log</h3></div>${sessionLog()}</div>`;

  el.querySelectorAll("[data-range]").forEach((b) => b.addEventListener("click", () => { ui.range = b.dataset.range; renderStats(el); }));
  el.querySelector("[data-recap]").addEventListener("click", () => openRecap(weekStartKey()));
  el.querySelector("[data-recaplast]").addEventListener("click", () => openRecap(addDays(weekStartKey(), -7)));
  el.querySelector("[data-more]")?.addEventListener("click", () => { ui.logLimit += 50; renderStats(el); });
  el.querySelectorAll("[data-delsess]").forEach((b) => b.addEventListener("click", async () => {
    if (await confirmDialog("Delete this session from your log?", { okText: "Delete", danger: true })) update((s) => { s.sessions = s.sessions.filter((x) => x.id !== b.dataset.delsess); });
  }));
  if (ui.recap) { const w = ui.recap; ui.recap = null; setTimeout(() => openRecap(w), 50); }
}

function weekChart() {
  const days = weekDays();
  const vals = days.map((d) => secOn(d) / 60);
  const goal = S().profile.dailyGoalMin;
  const max = Math.max(goal * 1.15, ...vals, 30);
  const W = 340, H = 170, pb = 24, pt = 18, bw = 30, gap = (W - 7 * bw) / 8;
  const y = (v) => H - pb - (v / max) * (H - pb - pt);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Minutes studied each day this week">
    <line x1="0" x2="${W}" y1="${y(goal)}" y2="${y(goal)}" stroke="var(--gold)" stroke-dasharray="4 4" stroke-width="1.5"/>
    ${days.map((d, i) => {
      const x = gap + i * (bw + gap), v = vals[i];
      const isToday = d === todayKey();
      return `<rect x="${x}" y="${y(v)}" width="${bw}" height="${Math.max(2, H - pb - y(v))}" rx="6" fill="${v >= goal ? "var(--gold)" : "var(--accent)"}" opacity="${v ? 1 : .25}"><title>${fmtDate(d)}: ${Math.round(v)} min</title></rect>
        ${v ? `<text class="v" x="${x + bw / 2}" y="${y(v) - 5}" text-anchor="middle">${v >= 60 ? Math.round(v / 6) / 10 + "h" : Math.round(v) + "m"}</text>` : ""}
        <text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" ${isToday ? 'style="font-weight:800;fill:var(--ink)"' : ""}>${parseKey(d).toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2)}</text>`;
    }).join("")}
  </svg>`;
}

function courseSplit() {
  const today = todayKey();
  const from = ui.range === "week" ? weekStartKey() : ui.range === "month" ? today.slice(0, 8) + "01" : "0000-00-00";
  const totals = {};
  S().sessions.filter((s) => s.dateKey >= from).forEach((s) => { totals[s.courseId || ""] = (totals[s.courseId || ""] || 0) + s.durationSec; });
  const rows = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return `<p class="small muted">Nothing in this range yet.</p>`;
  const sum = rows.reduce((a, r) => a + r[1], 0);
  return rows.map(([id, sec]) => `<div class="hbar"><span class="name">${esc(courseName(id))}</span>
    <div class="bar"><i style="width:${(sec / rows[0][1]) * 100}%;background:${courseColor(id)}"></i></div>
    <span class="val">${fmtHM(sec)} · ${Math.round((sec / sum) * 100)}%</span></div>`).join("");
}

const HEAT = ["var(--surface-2)", "#97D4E9", "#40B4E5", "#0055B7", "#002145"];
function heatmap() {
  const today = parseKey(todayKey());
  const start = parseKey(weekStartKey(addDays(todayKey(), -364)));
  const mins = {};
  S().sessions.forEach((s) => { mins[s.dateKey] = (mins[s.dateKey] || 0) + s.durationSec / 60; });
  const cell = 12, g = 3;
  const cols = Math.ceil(((today - start) / 86400000 + 1) / 7);
  let rects = "", months = "";
  let lastMonth = -1;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < 7; r++) {
      const d = new Date(start); d.setDate(start.getDate() + c * 7 + r);
      if (d > today) continue;
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const m = mins[k] || 0;
      const lvl = m === 0 ? 0 : m < 30 ? 1 : m < 60 ? 2 : m < 120 ? 3 : 4;
      rects += `<rect x="${30 + c * (cell + g)}" y="${16 + r * (cell + g)}" width="${cell}" height="${cell}" rx="3" fill="${HEAT[lvl]}"><title>${fmtDate(k)}: ${Math.round(m)} min</title></rect>`;
      if (r === 0 && d.getMonth() !== lastMonth && c < cols - 2) {
        lastMonth = d.getMonth();
        months += `<text x="${30 + c * (cell + g)}" y="10">${d.toLocaleDateString(undefined, { month: "short" })}</text>`;
      }
    }
  }
  const W = 30 + cols * (cell + g);
  return `<svg class="chart" width="${W}" height="${16 + 7 * (cell + g)}" role="img" aria-label="Heatmap of study minutes over the past year">
    ${months}<text x="0" y="${16 + 1 * (cell + g) + 10}">Tue</text><text x="0" y="${16 + 3 * (cell + g) + 10}">Thu</text><text x="0" y="${16 + 5 * (cell + g) + 10}">Sat</text>${rects}</svg>`;
}

function bestFocus() {
  const rated = S().sessions.filter((s) => s.focus > 0);
  const buckets = Array.from({ length: 12 }, (_, i) => ({ from: i * 2, n: 0, sum: 0 }));
  rated.forEach((s) => { const b = buckets[Math.floor(new Date(s.start).getHours() / 2)]; b.n++; b.sum += s.focus; });
  const used = buckets.filter((b) => b.n);
  const label = (h) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d.toLocaleTimeString(undefined, { hour: "numeric" }); };
  if (rated.length < 5) {
    return `<div class="card-head"><h3>⏰ Best focus time</h3></div><p class="small muted">Rate your focus after ${5 - rated.length} more session${5 - rated.length > 1 ? "s" : ""} and onTop will show when you focus best.</p>`;
  }
  const best = used.filter((b) => b.n >= 2).sort((a, b) => b.sum / b.n - a.sum / a.n)[0] || used.sort((a, b) => b.sum / b.n - a.sum / a.n)[0];
  return `<div class="card-head"><h3>⏰ Best focus time</h3></div>
    <p>You focus best <b>${label(best.from)}–${label(best.from + 2)}</b> <span class="muted small">(avg ${(best.sum / best.n).toFixed(1)}/4 over ${best.n} sessions)</span></p>
    <div style="margin-top:10px">${used.map((b) => `<div class="hbar"><span class="name small">${label(b.from)}–${label(b.from + 2)}</span>
      <div class="bar"><i style="width:${(b.sum / b.n / 4) * 100}%;${b === best ? "background:var(--gold)" : ""}"></i></div><span class="val small">${(b.sum / b.n).toFixed(1)}</span></div>`).join("")}</div>
    <p class="tiny muted" style="margin-top:6px">Try scheduling your hardest work in that window.</p>`;
}

function balanceWarning() {
  const from = addDays(todayKey(), -13);
  const totals = {};
  S().sessions.filter((s) => s.dateKey >= from && s.courseId).forEach((s) => { totals[s.courseId] = (totals[s.courseId] || 0) + s.durationSec; });
  const sum = Object.values(totals).reduce((a, b) => a + b, 0);
  if (sum < 3600 || S().courses.length < 2) return "";
  const [domId, domSec] = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
  const share = domSec / sum;
  if (share < 0.6) return "";
  const domNext = upcomingEvents(domId)[0]?.date || "9999";
  const neglected = S().courses.filter((c) => c.id !== domId).map((c) => ({ c, share: (totals[c.id] || 0) / sum, next: upcomingEvents(c.id)[0] }))
    .filter((x) => x.next && x.next.date < domNext && x.share < 0.15).sort((a, b) => a.next.date.localeCompare(b.next.date))[0];
  if (!neglected) return "";
  return `<div class="card section" style="border-color:var(--warn);background:var(--warn-soft)">
    <b>⚖️ Course balance check</b>
    <p class="small">In the last 2 weeks, <b>${Math.round(share * 100)}%</b> of your time went to ${esc(courseName(domId))} and <b>${Math.round(neglected.share * 100)}%</b> to ${esc(neglected.c.name)}. Your ${esc(neglected.c.name)} ${esc(neglected.next.title)} is sooner (${fmtDate(neglected.next.date)}).</p></div>`;
}

function sessionLog() {
  const list = S().sessions.slice().sort((a, b) => b.start - a.start);
  const shown = list.slice(0, ui.logLimit);
  let html = "", lastDay = null;
  for (const s of shown) {
    if (s.dateKey !== lastDay) {
      lastDay = s.dateKey;
      html += `<div class="label" style="margin:14px 0 4px">${fmtDate(s.dateKey, { weekday: "long", month: "short", day: "numeric" })} · ${fmtHM(secOn(s.dateKey))}</div>`;
    }
    html += `<div class="list-row"><span class="dot" style="background:${courseColor(s.courseId)}"></span>
      <div class="grow"><b class="small">${esc(courseName(s.courseId))}</b> <span class="tiny muted">${fmtTime(s.start)} · ${s.mode || ""}${s.focus ? " · " + ["", "😩", "😐", "🙂", "🔥"][s.focus] : ""}${s.distractedSec ? ` · ${fmtHM(s.distractedSec)} distracted` : ""}</span>
        ${s.note ? `<div class="small muted">${esc(s.note)}</div>` : ""}</div>
      <span class="mono small">${fmtHM(s.durationSec)}</span>
      <button class="icon-btn" data-delsess="${s.id}" aria-label="Delete session">✕</button></div>`;
  }
  if (list.length > shown.length) html += `<button class="btn sm" data-more style="margin-top:10px">Show more</button>`;
  return html;
}

/* ---------------- weekly recap image ---------------- */
function recapData(weekKey) {
  const end = addDays(weekKey, 6);
  const sessions = S().sessions.filter((s) => s.dateKey >= weekKey && s.dateKey <= end);
  const total = sessions.reduce((a, s) => a + s.durationSec, 0);
  const byDay = weekDays(weekKey).map((d) => ({ d, sec: secOn(d) }));
  const best = byDay.slice().sort((a, b) => b.sec - a.sec)[0];
  const byCourse = {};
  sessions.forEach((s) => { byCourse[s.courseId || ""] = (byCourse[s.courseId || ""] || 0) + s.durationSec; });
  const top = Object.entries(byCourse).sort((a, b) => b[1] - a[1]);
  const noted = sessions.filter((s) => s.note).sort((a, b) => (b.focus || 0) - (a.focus || 0) || b.durationSec - a.durationSec)[0];
  return { weekKey, end, total, byDay, best, top, note: noted?.note || "", count: sessions.length, streak: streakInfo().streak };
}

function drawRecap(d) {
  const W = 1080, H = 1350;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#002145"); grad.addColorStop(0.7, "#0055B7"); grad.addColorStop(1, "#00A7E1");
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.fillStyle = "rgba(242,169,0,.25)"; g.beginPath(); g.arc(W - 80, 80, 260, 0, Math.PI * 2); g.fill();
  const font = (w, s) => `${w} ${s}px Inter, system-ui, sans-serif`;
  g.fillStyle = "#F2A900"; g.font = font(800, 40); g.fillText("onTop · weekly recap", 80, 120);
  g.fillStyle = "#c9d8ea"; g.font = font(500, 34);
  g.fillText(`${fmtDate(d.weekKey, { month: "short", day: "numeric" })} – ${fmtDate(d.end, { month: "short", day: "numeric" })}`, 80, 172);
  g.fillStyle = "#fff"; g.font = font(800, 180); g.fillText(fmtHM(d.total), 76, 380);
  g.font = font(600, 40); g.fillStyle = "#c9d8ea"; g.fillText(`studied · ${d.count} session${d.count === 1 ? "" : "s"} · 🔥 ${d.streak}-day streak`, 80, 445);
  // bars
  const max = Math.max(...d.byDay.map((x) => x.sec), 1);
  d.byDay.forEach((x, i) => {
    const bx = 80 + i * 132, bh = (x.sec / max) * 300, by = 840 - bh;
    g.fillStyle = x === d.best && x.sec ? "#F2A900" : "rgba(255,255,255,.85)";
    g.beginPath(); g.roundRect ? g.roundRect(bx, by, 92, Math.max(bh, 6), 16) : g.rect(bx, by, 92, Math.max(bh, 6)); g.fill();
    g.fillStyle = "#c9d8ea"; g.font = font(600, 30);
    g.fillText(parseKey(x.d).toLocaleDateString(undefined, { weekday: "short" }), bx + 14, 890);
  });
  g.fillStyle = "#fff"; g.font = font(700, 40);
  if (d.best.sec) g.fillText(`⭐ Best day: ${parseKey(d.best.d).toLocaleDateString(undefined, { weekday: "long" })} (${fmtHM(d.best.sec)})`, 80, 980);
  if (d.top[0]) g.fillText(`📚 Top course: ${courseName(d.top[0][0])} (${fmtHM(d.top[0][1])})`, 80, 1045);
  if (d.note) {
    g.font = font(500, 34); g.fillStyle = "#e6eef8";
    const text = `“${d.note.length > 90 ? d.note.slice(0, 88) + "…" : d.note}”`;
    wrapText(g, text, 80, 1125, W - 160, 44);
  }
  g.fillStyle = "#F2A900"; g.font = font(700, 30);
  g.fillText(`${levelInfo().rank.emoji} ${levelInfo().rank.name} · Lvl ${levelInfo().level}`, 80, H - 70);
  g.fillStyle = "#c9d8ea"; g.textAlign = "right"; g.fillText("Go Birds 💙💛", W - 80, H - 70);
  return cv;
}
function wrapText(g, text, x, y, maxW, lh) {
  let line = "";
  for (const word of text.split(" ")) {
    const test = line ? line + " " + word : word;
    if (g.measureText(test).width > maxW && line) { g.fillText(line, x, y); line = word; y += lh; } else line = test;
  }
  g.fillText(line, x, y);
}

export function openRecap(weekKey) {
  const data = recapData(weekKey);
  const cv = drawRecap(data);
  const url = cv.toDataURL("image/png");
  update((s) => { s.profile.lastRecapWeek = weekKey; });
  openDialog(`
    <h2>📬 Weekly recap</h2>
    <img src="${url}" alt="Weekly recap: ${fmtHM(data.total)} studied" style="width:100%;border-radius:14px">
    <div class="dlg-actions"><button class="btn" data-close>Close</button><button class="btn" data-dl>⬇ Download</button><button class="btn primary" data-share>Share</button></div>`, (dlg) => {
    dlg.querySelector("[data-dl]").addEventListener("click", () => cv.toBlob((b) => download(`ontop-recap-${weekKey}.png`, b)));
    dlg.querySelector("[data-share]").addEventListener("click", () => cv.toBlob(async (b) => {
      const file = new File([b], `ontop-recap-${weekKey}.png`, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: "My onTop week", text: `I studied ${fmtHM(data.total)} this week with onTop 💙💛` }); } catch { /* cancelled */ }
      } else { download(file.name, b); toast("Sharing isn't supported here — downloaded the image instead."); }
    }));
  });
}
