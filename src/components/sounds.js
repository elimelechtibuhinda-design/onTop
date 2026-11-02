// Sound mixer panel: ambient beds, procedural lo-fi tracks, playlist link. Used in Focus and Me.
import { S, update } from "../lib/store.js";
import { esc } from "../lib/utils.js";
import {
  AMBIENT, TRACKS, setAmbient, playMusic, stopMusic, musicPlaying, setMusicVolume, unlockAudio,
} from "../lib/audio.js";
import { isUnlocked, unlockLevel } from "../lib/rewards.js";

const MIX_KEY = "ontop-mix";
export function loadMix() {
  try { return JSON.parse(localStorage.getItem(MIX_KEY)) || { music: 0.5 }; } catch { return { music: 0.5 }; }
}
function saveMix(mix) { try { localStorage.setItem(MIX_KEY, JSON.stringify(mix)); } catch { /* full */ } }

// Turns a Spotify/YouTube link into an embeddable player URL (or null).
export function embedUrl(url) {
  if (!url) return null;
  let m;
  if ((m = url.match(/open\.spotify\.com\/(playlist|album|track)\/([A-Za-z0-9]+)/))) return `https://open.spotify.com/embed/${m[1]}/${m[2]}`;
  if ((m = url.match(/[?&]list=([A-Za-z0-9_-]+)/))) return `https://www.youtube.com/embed/videoseries?list=${m[1]}`;
  if ((m = url.match(/(?:youtu\.be\/|v=)([A-Za-z0-9_-]{11})/))) return `https://www.youtube.com/embed/${m[1]}`;
  return null;
}

export function renderSounds(container, { dark = false } = {}) {
  const mix = loadMix();
  const playing = musicPlaying();
  const p = S().profile;
  const embed = embedUrl(p.playlistUrl);
  container.innerHTML = `
    <div class="stack">
      <div>
        <h3>Focus sounds</h3>
        <p class="small muted">Mix them, e.g. rain + café. Everything is generated on your device — works offline.</p>
      </div>
      <div class="mixer">
        ${AMBIENT.map((a) => {
          const ok = isUnlocked("sound", a.id);
          return `<label class="mix-row ${ok ? "" : "locked"}">
            <span class="e" aria-hidden="true">${a.emoji}</span>
            <span>${esc(a.name)}${ok ? "" : ` <span class="tiny">🔒 Lvl ${unlockLevel("sound", a.id)}</span>`}</span>
            <input type="range" min="0" max="1" step="0.05" value="${mix[a.id] || 0}" data-amb="${a.id}" ${ok ? "" : "disabled"} aria-label="${esc(a.name)} volume">
          </label>`;
        }).join("")}
      </div>
      <div>
        <h3>Lo-fi beats</h3>
        <p class="small muted">Endless, generated live. Fades out on breaks automatically.</p>
      </div>
      <div class="chips">
        ${TRACKS.map((t) => {
          const ok = isUnlocked("track", t.id);
          return `<button class="chip ${playing === t.id ? "active" : ""}" data-track="${t.id}" ${ok ? "" : "disabled"}>
            ${playing === t.id ? "⏸" : "▶"} ${esc(t.name)}${ok ? "" : ` 🔒 Lvl ${unlockLevel("track", t.id)}`}</button>`;
        }).join("")}
      </div>
      <label class="mix-row"><span class="e">🎚️</span><span>Music volume</span>
        <input type="range" min="0" max="1" step="0.05" value="${mix.music ?? 0.5}" data-musicvol aria-label="Music volume"></label>
      <div>
        <h3>Your own playlist</h3>
        <p class="small muted">Paste a Spotify or YouTube playlist link.</p>
      </div>
      <div class="row">
        <input type="url" placeholder="https://open.spotify.com/playlist/…" value="${esc(p.playlistUrl)}" data-playlist class="grow">
        <button class="btn sm" data-saveplaylist>Save</button>
      </div>
      ${p.playlistUrl ? `<div class="row wrap">
        <button class="btn sm" data-openplaylist>↗ Open beside onTop</button>
        ${embed ? `<button class="btn sm" data-embed>🎵 Show player here</button>` : ""}
      </div><div data-embedslot></div>` : ""}
    </div>`;

  container.querySelectorAll("[data-amb]").forEach((r) => r.addEventListener("input", () => {
    unlockAudio();
    mix[r.dataset.amb] = +r.value;
    setAmbient(r.dataset.amb, +r.value);
    saveMix(mix);
  }));
  container.querySelectorAll("[data-track]").forEach((b) => b.addEventListener("click", () => {
    unlockAudio();
    if (musicPlaying() === b.dataset.track) stopMusic();
    else { setMusicVolume(mix.music ?? 0.5); playMusic(b.dataset.track); }
    renderSounds(container, { dark });
  }));
  container.querySelector("[data-musicvol]").addEventListener("input", (e) => {
    mix.music = +e.target.value; setMusicVolume(mix.music); saveMix(mix);
  });
  container.querySelector("[data-saveplaylist]").addEventListener("click", () => {
    const v = container.querySelector("[data-playlist]").value.trim();
    update((st) => { st.profile.playlistUrl = v; });
    renderSounds(container, { dark });
  });
  container.querySelector("[data-openplaylist]")?.addEventListener("click", () => {
    window.open(p.playlistUrl, "ontop-music", "width=420,height=640");
  });
  container.querySelector("[data-embed]")?.addEventListener("click", () => {
    container.querySelector("[data-embedslot]").innerHTML =
      `<iframe src="${esc(embed)}" style="width:100%;height:160px;border:0;border-radius:12px" allow="autoplay; encrypted-media" loading="lazy" title="Your playlist"></iframe>`;
  });
}

// Restore saved ambient volumes (needs a user gesture before audio can start).
export function restoreMix() {
  const mix = loadMix();
  unlockAudio();
  setMusicVolume(mix.music ?? 0.5);
  AMBIENT.forEach((a) => { if (mix[a.id] > 0 && isUnlocked("sound", a.id)) setAmbient(a.id, mix[a.id]); });
}
