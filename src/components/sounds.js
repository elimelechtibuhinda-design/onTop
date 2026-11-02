// Sounds panel: music playlists (piano, acoustic), ambient mixer, stop-all.
// Used in Focus, the Me tab and the music bar's "Sounds" dialog.
import { on } from "../lib/bus.js";
import { esc } from "../lib/utils.js";
import { AMBIENT, setAmbient, ambientLevel, unlockAudio } from "../lib/audio.js";
import * as piano from "../lib/player.js";
import { isUnlocked, unlockLevel } from "../lib/rewards.js";
import { stopAllSound } from "./dock.js";
import { toast } from "./ui.js";

export function renderSounds(container) {
  const ps = piano.pianoState();
  container.innerHTML = `
    <div class="stack">
      <div class="row between wrap">
        <div><h3>🎶 Focus music</h3><p class="small muted" data-blurb>${esc(ps.playlist.blurb)}</p></div>
        <button class="btn sm danger" data-stopall>⏹ Stop all sound</button>
      </div>
      <div class="chips" data-lists>${Object.entries(piano.PLAYLISTS).map(([id, pl]) => `<button class="chip ${ps.list === id ? "active" : ""}" data-list="${id}">${pl.emoji} ${esc(pl.name)}</button>`).join("")}</div>
      <div class="row wrap">
        <button class="btn primary" data-pp>${ps.playing ? "⏸ Pause" : "▶ Play"}</button>
        <button class="btn" data-next aria-label="Next track">⏭ Next</button>
        <label class="check small"><input type="checkbox" data-shuffle ${ps.shuffle ? "checked" : ""}> Shuffle</label>
      </div>
      <label class="mix-row"><span class="e" aria-hidden="true">🔊</span><span>Music volume</span>
        <input type="range" min="0" max="1" step="0.05" value="${ps.volume}" data-pvol aria-label="Music volume"></label>
      <div class="stack tight" data-tracks></div>

      <div><h3>🌧️ Background sounds</h3><p class="small muted">Mix them, e.g. rain + café. Slide to 0 to turn one off.</p></div>
      <div class="mixer">
        ${AMBIENT.map((a) => {
          const ok = isUnlocked("sound", a.id);
          return `<label class="mix-row ${ok ? "" : "locked"}">
            <span class="e" aria-hidden="true">${a.emoji}</span>
            <span>${esc(a.name)}${ok ? "" : ` <span class="tiny">🔒 Lvl ${unlockLevel("sound", a.id)}</span>`}</span>
            <input type="range" min="0" max="1" step="0.05" value="${ambientLevel(a.id)}" data-amb="${a.id}" ${ok ? "" : "disabled"} aria-label="${esc(a.name)} volume">
          </label>`;
        }).join("")}
      </div>

    </div>`;

  const tracksBox = container.querySelector("[data-tracks]");
  const drawTracks = () => {
    if (!tracksBox.isConnected) return off();
    const s = piano.pianoState();
    container.querySelectorAll("[data-list]").forEach((b) => b.classList.toggle("active", b.dataset.list === s.list));
    const blurb = container.querySelector("[data-blurb]");
    if (blurb) blurb.textContent = s.playlist.blurb;
    tracksBox.innerHTML = s.playlist.tracks.map((t) => {
      const cur = t.id === s.track.id;
      return `<button class="list-row" data-track="${t.id}" style="background:none;border:0;border-bottom:1px solid var(--rule);cursor:pointer;text-align:left;color:inherit;width:100%">
        <span style="width:20px">${cur && s.playing ? "🔊" : cur ? "⏸" : "▶"}</span>
        <span class="grow"><b class="small" style="${cur ? "color:var(--accent)" : ""}">${esc(t.title)}</b> <span class="tiny muted">· ${esc(t.composer)}${t.credit ? ` · played by ${esc(t.credit)}` : ""}</span></span></button>`;
    }).join("");
    tracksBox.querySelectorAll("[data-track]").forEach((b) => b.addEventListener("click", () => {
      const s2 = piano.pianoState();
      if (s2.track.id === b.dataset.track && s2.playing) piano.pause(); else piano.play(b.dataset.track);
    }));
    const pp = container.querySelector("[data-pp]");
    if (pp) pp.textContent = s.playing ? "⏸ Pause" : "▶ Play";
  };
  const off = on("music", drawTracks);
  drawTracks();

  container.querySelectorAll("[data-list]").forEach((b) => b.addEventListener("click", () => piano.setPlaylist(b.dataset.list)));
  container.querySelector("[data-pp]").addEventListener("click", () => piano.toggle());
  container.querySelector("[data-next]").addEventListener("click", () => piano.next());
  container.querySelector("[data-shuffle]").addEventListener("change", (e) => piano.setShuffle(e.target.checked));
  container.querySelector("[data-pvol]").addEventListener("input", (e) => piano.setVolume(+e.target.value));
  container.querySelector("[data-stopall]").addEventListener("click", () => {
    stopAllSound();
    container.querySelectorAll("[data-amb]").forEach((r) => { r.value = 0; });
    toast("All sound stopped 🔇");
  });
  container.querySelectorAll("[data-amb]").forEach((r) => r.addEventListener("input", () => {
    unlockAudio();
    setAmbient(r.dataset.amb, +r.value);
  }));
}
