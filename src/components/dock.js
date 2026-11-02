// Music bar: shows whenever anything is playing (piano, background sounds or your playlist),
// on every screen including focus mode. One tap stops everything.
import { on } from "../lib/bus.js";
import { esc } from "../lib/utils.js";
import { AMBIENT, ambientPlaying, stopAllAmbient } from "../lib/audio.js";
import * as piano from "../lib/player.js";
import { openDialog } from "./ui.js";
import { renderSounds } from "./sounds.js";

let el = null;
let embed = null;          // { kind, src } of the mounted Spotify/YouTube player
let embedOpen = true;

export function mountDock() {
  el = document.createElement("div");
  el.className = "dock";
  el.setAttribute("role", "region");
  el.setAttribute("aria-label", "Music");
  el.innerHTML = `<div class="dock-bar"></div><div class="dock-embed" hidden></div>`;
  document.body.appendChild(el);
  on("music", draw);
  draw();
}

function pianoActive() {
  const s = piano.pianoState();
  return s.playing || s.time > 0;
}

function draw() {
  if (!el) return;
  const amb = ambientPlaying();
  const active = pianoActive() || amb.length || embed;
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
    : embed ? `<span class="dock-title"><b>🎵 Your playlist</b><span>${embed.kind === "youtube" ? "YouTube" : "Spotify"}</span></span>`
      : `<span class="dock-title"><b>${ambText} Background sounds</b><span>${amb.length} playing</span></span>`}
    ${ambText && pianoActive() ? `<span class="dock-amb" title="Background sounds playing">${ambText}</span>` : ""}
    ${embed ? `<button class="icon-btn" data-embedtoggle aria-label="${embedOpen ? "Hide" : "Show"} playlist player">${embedOpen ? "▾" : "▴"}</button>` : ""}
    <button class="icon-btn" data-mixer aria-label="Sound settings" title="Sound settings">🎛️</button>
    <button class="icon-btn dock-stop" data-stop aria-label="Stop all sound" title="Stop all sound">✕</button>`;
  const q = (s2) => el.querySelector(s2);
  q("[data-prev]")?.addEventListener("click", () => piano.prev());
  q("[data-pp]")?.addEventListener("click", () => piano.toggle());
  q("[data-next]")?.addEventListener("click", () => piano.next());
  q("[data-embedtoggle]")?.addEventListener("click", () => { embedOpen = !embedOpen; el.querySelector(".dock-embed").hidden = !embedOpen; draw(); });
  q("[data-mixer]").addEventListener("click", openSoundsDialog);
  q("[data-stop]").addEventListener("click", stopAllSound);
}

export function openSoundsDialog() {
  openDialog(`<div data-sounds></div><div class="dlg-actions"><button class="btn" data-close>Done</button></div>`, (dlg) => {
    renderSounds(dlg.querySelector("[data-sounds]"));
  });
}

// The iframe lives here (outside the page views) so it keeps playing when you switch tabs.
export function mountEmbed(e) {
  if (!el || !e) return;
  embed = e;
  embedOpen = true;
  const box = el.querySelector(".dock-embed");
  const h = e.kind === "youtube" ? 180 : 152;
  box.innerHTML = `<iframe src="${esc(e.src)}" style="width:100%;height:${h}px;border:0;border-radius:12px;display:block"
    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" title="Your playlist"></iframe>`;
  box.hidden = false;
  draw();
}

export function stopAllSound() {
  piano.stop();
  stopAllAmbient();
  if (el) { el.querySelector(".dock-embed").innerHTML = ""; el.querySelector(".dock-embed").hidden = true; }
  embed = null;
  draw();
}
