// Sounds panel: piano playlist, ambient mixer, your own Spotify/YouTube playlist, stop-all.
// Used in Focus, the Me tab and the music bar's "Sounds" dialog.
import { S, update } from "../lib/store.js";
import { on } from "../lib/bus.js";
import { esc } from "../lib/utils.js";
import { AMBIENT, setAmbient, ambientLevel, unlockAudio } from "../lib/audio.js";
import * as piano from "../lib/player.js";
import { isUnlocked, unlockLevel } from "../lib/rewards.js";
import { mountEmbed, stopAllSound } from "./dock.js";
import { toast } from "./ui.js";

// Turns a Spotify/YouTube link into an embeddable player (or null).
export function embedFor(url) {
  if (!url) return null;
  let m;
  if ((m = url.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(playlist|album|track|artist|show|episode)\/([A-Za-z0-9]+)/i))
    || (m = url.match(/^spotify:(playlist|album|track|artist|show|episode):([A-Za-z0-9]+)/i))) {
    return { kind: "spotify", src: `https://open.spotify.com/embed/${m[1].toLowerCase()}/${m[2]}?utm_source=generator&theme=0` };
  }
  if ((m = url.match(/[?&]list=([A-Za-z0-9_-]+)/))) return { kind: "youtube", src: `https://www.youtube.com/embed/videoseries?list=${m[1]}` };
  if ((m = url.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{11})/))) return { kind: "youtube", src: `https://www.youtube.com/embed/${m[1]}` };
  return null;
}

export function renderSounds(container) {
  const p = S().profile;
  const ps = piano.pianoState();
  const embed = embedFor(p.playlistUrl);
  container.innerHTML = `
    <div class="stack">
      <div class="row between wrap">
        <div><h3>🎹 Focus piano</h3><p class="small muted">Real piano recordings — Satie, Chopin, Schumann. Calm, no lyrics.</p></div>
        <button class="btn sm danger" data-stopall>⏹ Stop all sound</button>
      </div>
      <div class="row wrap">
        <button class="btn primary" data-pp>${ps.playing ? "⏸ Pause" : "▶ Play"}</button>
        <button class="btn" data-next aria-label="Next track">⏭ Next</button>
        <label class="check small"><input type="checkbox" data-shuffle ${ps.shuffle ? "checked" : ""}> Shuffle</label>
      </div>
      <label class="mix-row"><span class="e" aria-hidden="true">🔊</span><span>Piano volume</span>
        <input type="range" min="0" max="1" step="0.05" value="${ps.volume}" data-pvol aria-label="Piano volume"></label>
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

      <div><h3>🎵 Your own playlist</h3><p class="small muted">Paste a Spotify or YouTube link.</p></div>
      <div class="row">
        <input type="url" placeholder="https://open.spotify.com/playlist/…" value="${esc(p.playlistUrl)}" data-playlist class="grow">
        <button class="btn sm" data-saveplaylist>Save</button>
      </div>
      ${p.playlistUrl ? `<div class="row wrap">
        ${embed ? `<button class="btn sm primary" data-embed>▶ Play in onTop</button>` : ""}
        <button class="btn sm" data-openplaylist>↗ Open in ${embed?.kind === "youtube" ? "YouTube" : "Spotify"}</button>
      </div>
      ${embed?.kind === "spotify" ? `<p class="tiny muted">Spotify plays full songs here only if you're logged in to Spotify in this browser — otherwise it plays 30-second previews (Spotify's rule, not ours). “Open in Spotify” always plays everything.</p>` : ""}
      ${!embed ? `<p class="tiny" style="color:var(--warn)">That link can't be played inside onTop. Use a full open.spotify.com or youtube.com link — short spotify.link links won't work.</p>` : ""}` : ""}
    </div>`;

  const tracksBox = container.querySelector("[data-tracks]");
  const drawTracks = () => {
    if (!tracksBox.isConnected) return off();
    const s = piano.pianoState();
    tracksBox.innerHTML = piano.PIANO.map((t) => {
      const cur = t.id === s.track.id;
      return `<button class="list-row" data-track="${t.id}" style="background:none;border:0;border-bottom:1px solid var(--rule);cursor:pointer;text-align:left;color:inherit;width:100%">
        <span style="width:20px">${cur && s.playing ? "🔊" : cur ? "⏸" : "▶"}</span>
        <span class="grow"><b class="small" style="${cur ? "color:var(--accent)" : ""}">${esc(t.title)}</b> <span class="tiny muted">· ${esc(t.composer)}</span></span></button>`;
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
  container.querySelector("[data-saveplaylist]").addEventListener("click", () => {
    const v = container.querySelector("[data-playlist]").value.trim();
    update((st) => { st.profile.playlistUrl = v; });
    renderSounds(container);
  });
  container.querySelector("[data-openplaylist]")?.addEventListener("click", () => window.open(p.playlistUrl, "_blank", "noopener"));
  container.querySelector("[data-embed]")?.addEventListener("click", () => {
    piano.pause();
    mountEmbed(embed);
    toast("Playing in the music bar — press play in the player 🎵");
  });
}
