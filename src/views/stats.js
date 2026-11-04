// Stats: week chart, course split, year heatmap, best focus time, balance warning, weekly recap image, session log.
import { S, update } from "../lib/store.js";
import { esc, todayKey, addDays, weekStartKey, fmtHM, fmtDate, fmtTime, parseKey, download, dateKey } from "../lib/utils.js";
import { secOn, secInRange, courseName, courseColor, streakInfo, upcomingEvents, weekDays, levelInfo } from "../lib/queries.js";
import { confirmDialog, openDialog, toast, courseOptions } from "../components/ui.js";
import { xpFromSessions } from "../lib/sync-merge.js";

const ui = { range: "week", logLimit: 30, chart: "days", weekOffset: 0 };
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
      ${distractedTile()}
    </div>
    ${balanceWarning()}
    <div class="card section" data-activity>${activityCard()}</div>
    <div class="card section">${focusQuality()}</div>
    <div class="card section"><div class="card-head"><h3>By course</h3>
      <div class="chips">${["week", "month", "all"].map((r) => `<button class="chip ${ui.range === r ? "active" : ""}" data-range="${r}">${r === "all" ? "All time" : "This " + r}</button>`).join("")}</div></div>
      ${courseSplit()}</div>
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

  wireActivity(el.querySelector("[data-activity]"));
  el.querySelectorAll("[data-range]").forEach((b) => b.addEventListener("click", () => { ui.range = b.dataset.range; renderStats(el); }));
  el.querySelector("[data-recap]").addEventListener("click", () => openRecap(weekStartKey()));
  el.querySelector("[data-recaplast]").addEventListener("click", () => openRecap(addDays(weekStartKey(), -7)));
  el.querySelector("[data-more]")?.addEventListener("click", () => { ui.logLimit += 50; renderStats(el); });
  el.querySelectorAll("[data-delsess]").forEach((b) => b.addEventListener("click", async () => {
    if (await confirmDialog("Delete this session from your log?", { okText: "Delete", danger: true })) update((s) => { s.sessions = s.sessions.filter((x) => x.id !== b.dataset.delsess); recount(s); });
  }));
  el.querySelectorAll("[data-editsess]").forEach((b) => b.addEventListener("click", () => editSession(b.dataset.editsess)));
  if (ui.recap) { const w = ui.recap; ui.recap = null; setTimeout(() => openRecap(w), 50); }
}

/* ---------- focused vs distracted, by day or by week ---------- */
const distOf = (s) => (s.pausedSec || 0) + (s.distractedSec || 0);
function totalsBetween(fromKey, toKey) {
  let focus = 0, dist = 0;
  for (const s of S().sessions) if (s.dateKey >= fromKey && s.dateKey <= toKey) { focus += s.durationSec; dist += distOf(s); }
  return { focus, dist };
}
const pct = (dist, focus) => (focus + dist ? Math.round((dist / (focus + dist)) * 100) : 0);
const shortDur = (sec) => (sec < 60 ? (sec ? Math.round(sec) + "s" : "0m") : fmtHM(sec));

function distractedTile() {
  const wk = weekStartKey(), today = todayKey();
  const now = totalsBetween(wk, today);
  const last = totalsBetween(addDays(wk, -7), addDays(wk, -1));
  const t = totalsBetween(today, today);
  const delta = now.dist - last.dist;
  const deltaTxt = last.dist || last.focus
    ? `<span style="color:${delta <= 0 ? "var(--ok)" : "var(--danger)"}">${delta <= 0 ? "▼" : "▲"} ${shortDur(Math.abs(delta))}</span> vs last week`
    : "";
  return `<div class="card"><span class="label">Distracted this week</span><div class="big-num">${shortDur(now.dist)}</div>
    <p class="small muted">${pct(now.dist, now.focus)}% of your study time · today ${shortDur(t.dist)}${deltaTxt ? "<br>" + deltaTxt : ""}</p></div>`;
}

function buckets() {
  if (ui.chart === "weeks") {
    return Array.from({ length: 8 }, (_, i) => {
      const from = addDays(weekStartKey(), -7 * (7 - i)), to = addDays(from, 6);
      return { from, to, label: fmtDate(from, { month: "short", day: "numeric" }), long: `Week of ${fmtDate(from, { month: "short", day: "numeric" })}`, current: i === 7, ...totalsBetween(from, to) };
    });
  }
  const start = addDays(weekStartKey(), ui.weekOffset * 7);
  return weekDays(start).map((d) => ({
    from: d, to: d, label: parseKey(d).toLocaleDateString(undefined, { weekday: "short" }), long: fmtDate(d, { weekday: "long", month: "short", day: "numeric" }),
    current: d === todayKey(), ...totalsBetween(d, d),
  }));
}

function activityCard() {
  const b = buckets();
  const sum = b.reduce((a, x) => ({ focus: a.focus + x.focus, dist: a.dist + x.dist }), { focus: 0, dist: 0 });
  const start = addDays(weekStartKey(), ui.weekOffset * 7);
  const title = ui.chart === "weeks" ? "Last 8 weeks"
    : ui.weekOffset === 0 ? "This week" : `${fmtDate(start, { month: "short", day: "numeric" })} – ${fmtDate(addDays(start, 6), { month: "short", day: "numeric" })}`;
  return `
    <div class="card-head" style="flex-wrap:wrap">
      <h3>Focused vs distracted · ${esc(title)}</h3>
      <div class="row">
        ${ui.chart === "days" ? `<button class="icon-btn" data-wk="-1" aria-label="Previous week">←</button><button class="icon-btn" data-wk="1" aria-label="Next week" ${ui.weekOffset >= 0 ? "disabled" : ""}>→</button>` : ""}
        <div class="chips" role="tablist">${[["days", "Days"], ["weeks", "Weeks"]].map(([v, l]) => `<button class="chip ${ui.chart === v ? "active" : ""}" role="tab" aria-selected="${ui.chart === v}" data-chart="${v}">${l}</button>`).join("")}</div>
      </div>
    </div>
    <div class="legend" aria-hidden="true"><span><i style="background:var(--series-focus)"></i>Focused</span><span><i style="background:var(--series-distract)"></i>Distracted (paused)</span>${ui.chart === "days" ? `<span><i class="goal-key"></i>Daily goal</span>` : ""}</div>
    <div class="chart-wrap">${activitySvg(b)}<div class="chart-tip" hidden></div></div>
    <p class="small muted" style="margin-top:6px">${fmtHM(sum.focus)} focused · <b style="color:var(--ink)">${shortDur(sum.dist)} distracted</b> (${pct(sum.dist, sum.focus)}% of study time)</p>
    <details class="small" style="margin-top:6px"><summary>Show as table</summary>
      <table class="data-table"><thead><tr><th>${ui.chart === "weeks" ? "Week" : "Day"}</th><th>Focused</th><th>Distracted</th><th>%</th></tr></thead>
      <tbody>${b.map((x) => `<tr><td>${esc(x.long)}</td><td>${fmtHM(x.focus)}</td><td>${shortDur(x.dist)}</td><td>${pct(x.dist, x.focus)}%</td></tr>`).join("")}</tbody></table>
    </details>`;
}

// Rounded-top column, square at the baseline (4px data-end radius).
function col(x, yTop, w, base, fill) {
  const h = base - yTop;
  if (h <= 0.5) return "";
  const r = Math.min(4, w / 2, h);
  return `<path d="M${x},${base} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + w - r} Q${x + w},${yTop} ${x + w},${yTop + r} V${base} Z" fill="${fill}"/>`;
}

function activitySvg(b) {
  const W = 680, H = 230, L = 40, R = 8, T = 16, B = 30;
  const goalMin = S().profile.dailyGoalMin;
  const maxMin = Math.max(...b.map((x) => Math.max(x.focus, x.dist) / 60), ui.chart === "days" ? goalMin : 0, 30);
  const step = maxMin <= 60 ? 15 : maxMin <= 180 ? 30 : maxMin <= 480 ? 60 : maxMin <= 1200 ? 120 : 300;
  const top = Math.ceil(maxMin / step) * step;
  const y = (min) => T + (H - T - B) * (1 - min / top);
  const base = y(0);
  const band = (W - L - R) / b.length;
  const w = Math.min(22, (band - 14) / 2);
  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  const tickLabel = (m) => (m === 0 ? "0" : m % 60 === 0 ? `${m / 60}h` : m >= 60 ? `${Math.floor(m / 60)}h${m % 60}` : `${m}m`);
  // one selective label: the biggest focused value
  const best = b.reduce((bi, x, i) => (x.focus > b[bi].focus ? i : bi), 0);
  return `<svg class="chart activity" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Focused and distracted time per ${ui.chart === "weeks" ? "week" : "day"}">
    ${ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule)" stroke-width="1"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${tickLabel(v)}</text>`).join("")}
    ${ui.chart === "days" ? `<line x1="${L}" x2="${W - R}" y1="${y(goalMin)}" y2="${y(goalMin)}" stroke="var(--ink-soft)" stroke-width="1"/>` : ""}
    ${b.map((x, i) => {
      const cx = L + band * i + band / 2;
      const fx = cx - w - 1, dx = cx + 1;   // 2px surface gap between the pair
      return `${col(fx, y(x.focus / 60), w, base, "var(--series-focus)")}${col(dx, y(x.dist / 60), w, base, "var(--series-distract)")}
        ${i === best && x.focus ? `<text class="v" x="${cx - w / 2 - 1}" y="${y(x.focus / 60) - 6}" text-anchor="middle">${shortDur(x.focus)}</text>` : ""}
        <text x="${cx}" y="${H - 10}" text-anchor="middle" ${x.current ? 'style="font-weight:800;fill:var(--ink)"' : ""}>${esc(x.label)}</text>
        <rect class="hit" data-i="${i}" x="${L + band * i}" y="${T}" width="${band}" height="${H - T - B}" fill="transparent"/>`;
    }).join("")}
  </svg>`;
}

function wireActivity(card) {
  const rerender = () => { card.innerHTML = activityCard(); wireActivity(card); };
  card.querySelectorAll("[data-chart]").forEach((c) => c.addEventListener("click", () => { ui.chart = c.dataset.chart; rerender(); }));
  card.querySelectorAll("[data-wk]").forEach((c) => c.addEventListener("click", () => { ui.weekOffset = Math.min(0, ui.weekOffset + +c.dataset.wk); rerender(); }));
  const b = buckets();
  const tip = card.querySelector(".chart-tip"), wrap = card.querySelector(".chart-wrap");
  const show = (e, i) => {
    const x = b[i];
    tip.innerHTML = `<b>${esc(x.long)}</b><div><i style="background:var(--series-focus)"></i>Focused ${fmtHM(x.focus)}</div><div><i style="background:var(--series-distract)"></i>Distracted ${shortDur(x.dist)} <span class="muted">(${pct(x.dist, x.focus)}%)</span></div>`;
    tip.hidden = false;
    const r = wrap.getBoundingClientRect();
    const left = Math.min(Math.max(0, e.clientX - r.left + 12), r.width - tip.offsetWidth);
    tip.style.left = left + "px";
    tip.style.top = Math.max(0, e.clientY - r.top - tip.offsetHeight - 10) + "px";
  };
  card.querySelectorAll(".hit").forEach((h) => {
    h.addEventListener("pointermove", (e) => show(e, +h.dataset.i));
    h.addEventListener("pointerdown", (e) => show(e, +h.dataset.i));
    h.addEventListener("pointerleave", () => { tip.hidden = true; });
  });
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
    return `<div class="card-head"><h3>⏰ Best focus time</h3></div><p class="small muted">Rate your focus after ${5 - rated.length} more session${5 - rated.length > 1 ? "s" : ""} and Dialed In will show when you focus best.</p>`;
  }
  const best = used.filter((b) => b.n >= 2).sort((a, b) => b.sum / b.n - a.sum / a.n)[0] || used.sort((a, b) => b.sum / b.n - a.sum / a.n)[0];
  return `<div class="card-head"><h3>⏰ Best focus time</h3></div>
    <p>You focus best <b>${label(best.from)}–${label(best.from + 2)}</b> <span class="muted small">(avg ${(best.sum / best.n).toFixed(1)}/4 over ${best.n} sessions)</span></p>
    <div style="margin-top:10px">${used.map((b) => `<div class="hbar"><span class="name small">${label(b.from)}–${label(b.from + 2)}</span>
      <div class="bar"><i style="width:${(b.sum / b.n / 4) * 100}%;${b === best ? "background:var(--gold)" : ""}"></i></div><span class="val small">${(b.sum / b.n).toFixed(1)}</span></div>`).join("")}</div>
    <p class="tiny muted" style="margin-top:6px">Try scheduling your hardest work in that window.</p>`;
}

const REASON_LABEL = { phone: "📱 Phone", chat: "💬 Chat", social: "📲 Social media", noise: "🔊 Noise", tired: "😴 Tired", other: "🤔 Other" };
const REASON_TIP = {
  phone: "Put your phone in another room (or a drawer) during focus blocks — out of sight really is out of mind.",
  chat: "Mute chats for the length of one Pomodoro. People can wait 25 minutes.",
  social: "Log out of social apps on your study device, or use a site blocker during focus time.",
  noise: "Try the rain or brown-noise sounds, or noise-cancelling headphones.",
  tired: "Tiredness beats willpower. Try a short walk, water, or studying earlier in the day.",
  other: "Write the distraction in the parking lot and deal with it after the session.",
};

// Distraction measured three ways: what you log (taps), random "still on task?" check-ins, and your own rating.
function focusQuality() {
  const from = addDays(todayKey(), -13);
  const recent = S().sessions.filter((s) => s.dateKey >= from);
  const tracked = recent.filter((s) => s.distractions !== undefined);
  if (!tracked.length) {
    return `<div class="card-head"><h3>🎯 Focus quality</h3></div><p class="small muted">After your next session you'll see how often you get distracted, what pulls you away, and how often you're on task when Dialed In checks in.</p>`;
  }
  const hours = tracked.reduce((a, s) => a + s.durationSec, 0) / 3600;
  const dCount = tracked.reduce((a, s) => a + (s.distractions || 0), 0);
  const lostSec = tracked.reduce((a, s) => a + (s.pausedSec || 0), 0);
  const lostPct = hours ? Math.round((lostSec / (hours * 3600 + lostSec)) * 100) : 0;
  const perHour = hours ? dCount / hours : 0;
  const pings = tracked.reduce((a, s) => ({ yes: a.yes + (s.pings?.yes || 0), no: a.no + (s.pings?.no || 0) }), { yes: 0, no: 0 });
  const answered = pings.yes + pings.no;
  const onTask = answered ? Math.round((pings.yes / answered) * 100) : null;
  const rated = recent.filter((s) => s.focus > 0);
  const avgRating = rated.length ? rated.reduce((a, s) => a + s.focus, 0) / rated.length : null;
  const reasons = {};
  tracked.forEach((s) => Object.entries(s.reasons || {}).forEach(([k, v]) => { reasons[k] = (reasons[k] || 0) + v; }));
  const top = Object.entries(reasons).sort((a, b) => b[1] - a[1]);
  const wk = weekStartKey();
  const rate = (list) => { const h = list.reduce((a, s) => a + s.durationSec, 0) / 3600; return h ? list.reduce((a, s) => a + (s.distractions || 0), 0) / h : null; };
  const thisW = rate(tracked.filter((s) => s.dateKey >= wk));
  const lastW = rate(tracked.filter((s) => s.dateKey < wk && s.dateKey >= addDays(wk, -7)));
  const trend = thisW !== null && lastW !== null && lastW > 0
    ? (thisW <= lastW ? `▼ ${Math.round((1 - thisW / lastW) * 100)}% fewer than last week 🎉` : `▲ ${Math.round((thisW / lastW - 1) * 100)}% more than last week`) : "";
  const maxR = top[0]?.[1] || 1;
  return `<div class="card-head"><h3>🎯 Focus quality</h3><span class="small muted">last 2 weeks</span></div>
    <div class="grid-3">
      <div><span class="label">On task when checked</span><div class="big-num">${onTask === null ? "—" : onTask + "%"}</div>
        <p class="tiny muted">${answered ? `${pings.yes} of ${answered} “still on task?” check-ins` : "Turn on focus pings to measure this"}</p></div>
      <div><span class="label">Time distracted</span><div class="big-num">${fmtHM(lostSec)}</div>
        <p class="tiny muted">${lostPct}% of your study time · ${dCount} pause${dCount === 1 ? "" : "s"} (${perHour.toFixed(1)}/hour) ${trend ? "· " + trend : ""}</p></div>
      <div><span class="label">Your focus rating</span><div class="big-num">${avgRating === null ? "—" : ["", "😩", "😐", "🙂", "🔥"][Math.round(avgRating)] + " " + avgRating.toFixed(1)}</div>
        <p class="tiny muted">out of 4, from your check-ins</p></div>
    </div>
    ${top.length ? `<div style="margin-top:14px"><span class="label">What pulls you away</span>
      ${top.map(([k, v]) => `<div class="hbar"><span class="name small">${REASON_LABEL[k] || k}</span><div class="bar"><i style="width:${(v / maxR) * 100}%;background:var(--warn)"></i></div><span class="val small">${v}×</span></div>`).join("")}
      <p class="small" style="margin-top:8px">💡 ${esc(REASON_TIP[top[0][0]] || REASON_TIP.other)}</p></div>` : ""}
    <p class="tiny muted" style="margin-top:10px">Pausing the timer = distracted: that time is tracked separately and never counts as study. Browsers can't see your other tabs or apps (a privacy protection), so Dialed In measures focus from your pauses, random check-ins and your own rating — no spying.</p>`;
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

// After a session is edited or deleted, XP and the best-day record follow the log again.
function recount(st) {
  st.xp = xpFromSessions(st.sessions);
  const days = {};
  st.sessions.forEach((x) => { days[x.dateKey] = (days[x.dateKey] || 0) + x.durationSec; });
  st.records.bestDaySec = Math.max(0, ...Object.values(days));
}

// Fix a session after the fact, e.g. the timer kept running because they forgot to pause.
function editSession(id) {
  const s = S().sessions.find((x) => x.id === id);
  if (!s) return;
  const start = new Date(s.start);
  const hhmm = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
  const focusMin = Math.round(s.durationSec / 60);
  const distMin = Math.round(distOf(s) / 60);
  openDialog(`
    <h2>Edit session</h2>
    <p class="small muted">Forgot to pause? Fix the times here — your stats and XP update to match.</p>
    <label class="field"><span>Course</span><select data-course>${courseOptions(S().courses, s.courseId || "")}</select></label>
    <div class="row wrap">
      <label class="field grow"><span>Day</span><input type="date" data-date value="${s.dateKey}" max="${todayKey()}"></label>
      <label class="field grow"><span>Started at</span><input type="time" data-start value="${hhmm}"></label>
    </div>
    <div class="row wrap">
      <label class="field grow"><span>Focused (min)</span><input type="number" data-focus min="1" max="1440" value="${focusMin}"></label>
      <label class="field grow"><span>Distracted (min)</span><input type="number" data-dist min="0" max="1440" value="${distMin}"></label>
    </div>
    <label class="field"><span>Note</span><input type="text" data-note value="${esc(s.note || "")}" placeholder="What did you work on?"></label>
    <div class="dlg-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save</button></div>`, (dlg, close) => {
    const val = (k) => dlg.querySelector(`[data-${k}]`).value;
    dlg.querySelector("[data-save]").addEventListener("click", () => {
      const fm = Math.round(+val("focus")), dm = Math.max(0, Math.round(+val("dist") || 0));
      if (!(fm >= 1) || fm > 1440) return toast("Focused time should be between 1 and 1440 minutes.");
      if (dm > 1440) return toast("Distracted time should be at most 1440 minutes.");
      if (!val("date")) return toast("Pick a day.");
      const [y, mo, d] = val("date").split("-").map(Number);
      const [h, mi] = (val("start") || hhmm).split(":").map(Number);
      const startMs = new Date(y, mo - 1, d, h, mi).getTime();
      update((st) => {
        const x = st.sessions.find((z) => z.id === id);
        if (!x) return;
        x.courseId = val("course");
        x.start = startMs;
        x.dateKey = dateKey(new Date(startMs));
        x.durationSec = fm === focusMin ? x.durationSec : fm * 60;   // keep exact seconds if unchanged
        if (dm !== distMin) { x.pausedSec = dm * 60; x.distractedSec = 0; }
        x.note = val("note").trim();
        x.edited = Date.now();
        recount(st);
      });
      toast("Session updated ✓");
      close();
    });
  });
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
      <div class="grow"><b class="small">${esc(courseName(s.courseId))}</b> <span class="tiny muted">${fmtTime(s.start)} · ${s.mode || ""}${s.focus ? " · " + ["", "😩", "😐", "🙂", "🔥"][s.focus] : ""}${s.distractions ? ` · 😵 ${s.distractions}×` : ""}${(s.pausedSec || 0) + (s.distractedSec || 0) >= 30 ? ` · ${fmtHM((s.pausedSec || 0) + (s.distractedSec || 0))} distracted` : ""}</span>
        ${s.note ? `<div class="small muted">${esc(s.note)}</div>` : ""}</div>
      <span class="mono small">${fmtHM(s.durationSec)}</span>
      <button class="icon-btn" data-editsess="${s.id}" aria-label="Edit session">✏️</button>
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
  g.fillStyle = "#F2A900"; g.font = font(800, 40); g.fillText("Dialed In · weekly recap", 80, 120);
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
  g.fillStyle = "#c9d8ea"; g.textAlign = "right"; g.fillText("Keep it up 💙💛", W - 80, H - 70);
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
    dlg.querySelector("[data-dl]").addEventListener("click", () => cv.toBlob((b) => download(`dialedin-recap-${weekKey}.png`, b)));
    dlg.querySelector("[data-share]").addEventListener("click", () => cv.toBlob(async (b) => {
      const file = new File([b], `dialedin-recap-${weekKey}.png`, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: "My Dialed In week", text: `I was dialed in for ${fmtHM(data.total)} this week 💙💛 imdialedin.app` }); } catch { /* cancelled */ }
      } else { download(file.name, b); toast("Sharing isn't supported here — downloaded the image instead."); }
    }));
  });
}
