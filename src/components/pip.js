// Pop-out mini timer. Uses Document Picture-in-Picture (always on top, Chrome/Edge 116+);
// falls back to a small popup window elsewhere. Shows the clock, a "Got distracted" button
// and answers focus pings while the student works in other apps.
import { esc } from "../lib/utils.js";

let win = null;
let handlers = {};

export const pipSupported = () => "documentPictureInPicture" in window;
export const pipOpen = () => !!win && !win.closed;

const CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Inter, system-ui, sans-serif; background: radial-gradient(circle at 50% 20%, #0b3a75, #002145 70%); color: #fff;
    height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 10px; text-align: center; }
  body.break { background: radial-gradient(circle at 50% 20%, #1f7a55, #0d4632 70%); }
  .phase { font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #F2A900; }
  .clock { font-size: 44px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1; }
  .row { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
  button { font: inherit; font-weight: 700; font-size: 13px; border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.1);
    color: #fff; border-radius: 10px; padding: 7px 10px; cursor: pointer; }
  button:hover { background: rgba(255,255,255,.2); }
  button.gold { background: #F2A900; border-color: #F2A900; color: #1a1300; }
  .ask { font-weight: 700; font-size: 14px; }
  .msg { font-size: 12px; color: #c9d8ea; min-height: 16px; }`;

export async function openPip(h) {
  handlers = h;
  if (pipOpen()) { win.focus(); return true; }
  try {
    if (pipSupported()) {
      win = await window.documentPictureInPicture.requestWindow({ width: 300, height: 210 });
    } else {
      win = window.open("", "ontop-mini", "width=320,height=240,popup=yes");
      if (!win) return false;
      win.document.title = "onTop timer";
    }
  } catch { win = null; return false; }
  const style = win.document.createElement("style");
  style.textContent = CSS;
  win.document.head.appendChild(style);
  win.document.body.innerHTML = `<div class="phase" data-phase></div><div class="clock" data-clock>--:--</div><div data-area></div><div class="msg" data-msg></div>`;
  win.addEventListener("pagehide", () => { win = null; handlers.onClose?.(); });
  showButtons();
  return true;
}

export function closePip() {
  if (pipOpen()) win.close();
  win = null;
}

export function updatePip(display, phaseLabel, isBreak) {
  if (!pipOpen()) return;
  const d = win.document;
  d.querySelector("[data-clock]").textContent = display;
  d.querySelector("[data-phase]").textContent = phaseLabel;
  d.body.classList.toggle("break", !!isBreak);
}

function area() { return win.document.querySelector("[data-area]"); }
function msg(t) { if (pipOpen()) win.document.querySelector("[data-msg]").textContent = t; }

export function showButtons() {
  if (!pipOpen()) return;
  area().innerHTML = `<div class="row"><button data-dis>😵 Got distracted</button><button data-pause>⏯</button><button data-back title="Back to onTop">↩</button></div>`;
  area().querySelector("[data-dis]").addEventListener("click", () => askReason());
  area().querySelector("[data-pause]").addEventListener("click", () => handlers.onPause?.());
  area().querySelector("[data-back]").addEventListener("click", () => { window.focus(); handlers.onBack?.(); });
}

export const REASONS = [["phone", "📱 Phone"], ["chat", "💬 Chat"], ["social", "📲 Social"], ["noise", "🔊 Noise"], ["tired", "😴 Tired"], ["other", "🤔 Other"]];

function askReason() {
  handlers.onDistracted?.(null);
  area().innerHTML = `<div class="ask">What pulled you away?</div><div class="row">${REASONS.map(([k, l]) => `<button data-r="${k}">${esc(l)}</button>`).join("")}</div>`;
  area().querySelectorAll("[data-r]").forEach((b) => b.addEventListener("click", () => {
    handlers.onReason?.(b.dataset.r);
    showButtons(); msg("Logged. Back to it 💪");
  }));
  setTimeout(() => { if (pipOpen() && area().querySelector("[data-r]")) showButtons(); }, 8000);
}

// Focus ping inside the mini window.
export function pipPing() {
  if (!pipOpen()) return false;
  area().innerHTML = `<div class="ask">Still on task? 🎯</div><div class="row"><button class="gold" data-y>✅ Yes</button><button data-n>😵 I drifted</button></div>`;
  area().querySelector("[data-y]").addEventListener("click", () => { handlers.onPing?.(true); showButtons(); msg("Nice — keep going 🔥"); });
  area().querySelector("[data-n]").addEventListener("click", () => { handlers.onPing?.(false); askReason(); });
  return true;
}
