// Shared UI pieces: toasts, dialogs, confirm, confetti, progress ring.
import { esc } from "../lib/utils.js";

let toastBox = null;
export function toast(msg, ms = 2800) {
  if (!toastBox) {
    toastBox = document.createElement("div");
    toastBox.className = "toasts";
    toastBox.setAttribute("role", "status");
    document.body.appendChild(toastBox);
  }
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  toastBox.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// Opens a modal <dialog>. `html` is the inner markup; `mount(dlg, close)` wires events.
export function openDialog(html, mount, { onClose } = {}) {
  const dlg = document.createElement("dialog");
  dlg.innerHTML = `<div class="dlg">${html}</div>`;
  document.body.appendChild(dlg);
  const close = () => { if (dlg.open) dlg.close(); };
  dlg.addEventListener("close", () => { dlg.remove(); onClose && onClose(); });
  dlg.addEventListener("click", (e) => { if (e.target === dlg) close(); });
  dlg.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
  dlg.showModal();
  mount && mount(dlg, close);
  const first = dlg.querySelector("input, textarea, select");
  if (first) setTimeout(() => first.focus(), 30);
  return { dlg, close };
}

export function confirmDialog(message, { okText = "Yes", danger = false, title = "Are you sure?" } = {}) {
  return new Promise((resolve) => {
    let result = false;
    openDialog(`
      <h2>${esc(title)}</h2>
      <p>${esc(message)}</p>
      <div class="dlg-actions">
        <button class="btn" data-close>Cancel</button>
        <button class="btn ${danger ? "danger solid" : "primary"}" data-ok>${esc(okText)}</button>
      </div>`, (dlg, close) => {
      dlg.querySelector("[data-ok]").addEventListener("click", () => { result = true; close(); });
    }, { onClose: () => resolve(result) });
  });
}

export function confetti(count = 90) {
  if (document.documentElement.dataset.motion === "reduced" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const box = document.createElement("div");
  box.className = "confetti";
  const colors = ["#F2A900", "#00A7E1", "#0055B7", "#ffffff", "#97D4E9", "#2E8B57"];
  for (let i = 0; i < count; i++) {
    const p = document.createElement("i");
    p.style.left = Math.random() * 100 + "vw";
    p.style.background = colors[i % colors.length];
    p.style.animationDuration = 1.8 + Math.random() * 1.8 + "s";
    p.style.animationDelay = Math.random() * 0.4 + "s";
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4200);
}

export function ring(pct, { size = 120, stroke = 12, color = "#F2A900", track = "rgba(255,255,255,.18)", inner = "" } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, pct)));
  return `<div class="ring" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" aria-hidden="true">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
        stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}" style="transition:stroke-dashoffset .6s"/>
    </svg>
    <div class="ring-text">${inner}</div>
  </div>`;
}

export function emptyState(text) {
  return `<div class="empty">${text}</div>`;
}

export function courseOptions(courses, selected = "", { none = "General / no course" } = {}) {
  return `<option value="">${esc(none)}</option>` + courses.map((c) =>
    `<option value="${c.id}" ${c.id === selected ? "selected" : ""}>${esc(c.emoji)} ${esc(c.name)}</option>`).join("");
}
