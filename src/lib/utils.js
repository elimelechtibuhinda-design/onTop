// Small shared helpers: dates, formatting, DOM.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const pad = (n) => String(n).padStart(2, "0");

export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const todayKey = () => dateKey(new Date());
export function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}
export function daysBetween(fromKey, toKey) {
  return Math.round((parseKey(toKey) - parseKey(fromKey)) / 86400000);
}
export const daysUntil = (key) => daysBetween(todayKey(), key);

// Monday-based week start.
export function weekStartKey(key = todayKey()) {
  const d = parseKey(key);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return dateKey(d);
}

export function fmtDate(key, opts = { weekday: "short", month: "short", day: "numeric" }) {
  return parseKey(key).toLocaleDateString(undefined, opts);
}

export function fmtHMS(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
export function fmtHM(sec) {
  const mins = Math.round(sec / 60);
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h <= 0) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}
export function fmtTime(ms) {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function dayOfYear(d = new Date()) {
  return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
}

export function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

export function pick(arr, seed) {
  if (seed == null) return arr[Math.floor(Math.random() * arr.length)];
  return arr[Math.abs(seed) % arr.length];
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function download(filename, content, type = "application/json") {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Tiny, safe markdown: headings, bold, italics, inline code, links, lists, paragraphs.
export function markdown(src) {
  const lines = esc(src).split("\n");
  let html = "", list = null;
  const inline = (t) => t
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const line of lines) {
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)/))) {
      closeList();
      const n = m[1].length + 2;
      html += `<h${n}>${inline(m[2])}</h${n}>`;
    } else if ((m = line.match(/^\s*[-*]\s+(.*)/))) {
      if (list !== "ul") { closeList(); html += "<ul>"; list = "ul"; }
      html += `<li>${inline(m[1])}</li>`;
    } else if ((m = line.match(/^\s*\d+\.\s+(.*)/))) {
      if (list !== "ol") { closeList(); html += "<ol>"; list = "ol"; }
      html += `<li>${inline(m[1])}</li>`;
    } else if (!line.trim()) {
      closeList();
    } else {
      closeList();
      html += `<p>${inline(line)}</p>`;
    }
  }
  closeList();
  return html;
}
