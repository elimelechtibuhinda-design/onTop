// Music bar: shows whenever anything is playing (music or background sounds),
// on every screen including focus mode. One tap stops everything.
import { on } from "../lib/bus.js";
import { esc } from "../lib/utils.js";
import { AMBIENT, ambientPlaying, stopAllAmbient } from "../lib/audio.js";
import * as piano from "../lib/player.js";
import { openDialog } from "./ui.js";
import { renderSounds } from "./sounds.js";

let el = null;

export function mountDock() {
  el = document.createElement("div");
  el.className = "dock";
  el.setAttribute("role", "region");
  el.setAttribute("aria-label", "Music");
  el.innerHTML = `<div class="dock-bar"></div>`;
  document.body.appendChild(el);
  on("music", draw);
  draw();
}

function pianoActive() {
  return piano.pianoState().active;
}

function draw() {
  if (!el) return;
  const amb = ambientPlaying();
  const active = pianoActive() || amb.length;
  el.hidden = !active;
  if (!active) return;
  const s = piano.pianoState();
  const ambText = amb.map((id) => AMBIENT.find((a) => a.id === id)?.emoji).join("");
  el.querySelector(".dock-bar").innerHTML = `
    ${pianoActive() ? `
      <span class="dock-title"><b>${s.playlist.emoji} ${esc(s.track.title)}</b><span>${esc(s.track.composer)}</span></span>
      <button class="icon-btn" data-prev aria-label="Previous track">⏮</button>
      <button class="icon-btn dock-pp" data-pp aria-label="${s.playing ? "Pause" : "Play"}">${s.playing ? "⏸" : "▶"}</button>
      <button class="icon-btn" data-next aria-label="Next track">⏭</button>`
    : `<span class="dock-title"><b>${ambText} Background sounds</b><span>${amb.length} playing</span></span>`}
    ${ambText && pianoActive() ? `<span class="dock-amb" title="Background sounds playing">${ambText}</span>` : ""}
    <button class="icon-btn" data-mixer aria-label="Sound settings" title="Sound settings">🎛️</button>
    <button class="icon-btn dock-stop" data-stop aria-label="Stop all sound" title="Stop all sound">✕</button>`;
  const q = (s2) => el.querySelector(s2);
  q("[data-prev]")?.addEventListener("click", () => piano.prev());
  q("[data-pp]")?.addEventListener("click", () => piano.toggle());
  q("[data-next]")?.addEventListener("click", () => piano.next());
  q("[data-mixer]").addEventListener("click", openSoundsDialog);
  q("[data-stop]").addEventListener("click", stopAllSound);
}

export function openSoundsDialog() {
  openDialog(`<div data-sounds></div><div class="dlg-actions"><button class="btn" data-close>Done</button></div>`, (dlg) => {
    renderSounds(dlg.querySelector("[data-sounds]"));
  });
}

export function stopAllSound() {
  piano.stop();
  stopAllAmbient();
  draw();
}
