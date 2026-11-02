// Piano player: real public-domain recordings (see public/music/CREDITS.md).
// One <audio> element, a looping playlist, shuffle, volume, auto-ducking on breaks,
// and Media Session so lock-screen / keyboard media keys work.
import { emit } from "./bus.js";

export const PIANO = [
  { id: "gymnopedie1", title: "Gymnopédie No. 1", composer: "Erik Satie", file: "satie-gymnopedie-1.mp3" },
  { id: "nocturne92", title: "Nocturne Op. 9 No. 2", composer: "Frédéric Chopin", file: "chopin-nocturne-op9-no2.mp3" },
  { id: "gnossienne1", title: "Gnossienne No. 1", composer: "Erik Satie", file: "satie-gnossienne-1.mp3" },
  { id: "traumerei", title: "Träumerei", composer: "Robert Schumann", file: "schumann-traumerei.mp3" },
  { id: "nocturne91", title: "Nocturne Op. 9 No. 1", composer: "Frédéric Chopin", file: "chopin-nocturne-op9-no1.mp3" },
  { id: "gnossienne3", title: "Gnossienne No. 3", composer: "Erik Satie", file: "satie-gnossienne-3.mp3" },
  { id: "nocturne322", title: "Nocturne Op. 32 No. 2", composer: "Frédéric Chopin", file: "chopin-nocturne-op32-no2.mp3" },
  { id: "nocturne20", title: "Nocturne in C-sharp minor", composer: "Frédéric Chopin", file: "chopin-nocturne-no20.mp3" },
];

const KEY = "ontop-piano";
const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })();

const audio = new Audio();
audio.preload = "none";
const st = {
  index: Math.max(0, PIANO.findIndex((t) => t.id === saved.trackId)),
  volume: saved.volume ?? 0.6,
  shuffle: !!saved.shuffle,
  ducked: false,
  warmed: new Set(),
};
audio.volume = st.volume;

const src = (t) => `${import.meta.env.BASE_URL}music/${t.file}`;
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify({ trackId: current().id, volume: st.volume, shuffle: st.shuffle })); } catch { /* ignore */ }
}
const changed = () => { persist(); emit("music"); };

export const current = () => PIANO[st.index];
export const isPlaying = () => !audio.paused && !audio.ended;
export const pianoState = () => ({ track: current(), playing: isPlaying(), volume: st.volume, shuffle: st.shuffle, time: audio.currentTime, duration: audio.duration || 0 });

function load(i) {
  st.index = (i + PIANO.length) % PIANO.length;
  audio.src = src(current());
  warm(current());
  mediaSession();
}
// Fetch the whole file once so the service worker can cache it for offline use.
function warm(t) {
  if (st.warmed.has(t.id)) return;
  st.warmed.add(t.id);
  fetch(src(t)).catch(() => {});
}

export async function play(id) {
  if (id) load(PIANO.findIndex((t) => t.id === id));
  else if (!audio.src) load(st.index);
  fade(st.ducked ? 0.15 * st.volume : st.volume, 0);
  try { await audio.play(); } catch { /* autoplay blocked until a tap */ }
  changed();
}
export function pause() { audio.pause(); changed(); }
export function toggle() { isPlaying() ? pause() : play(); }
export function next() {
  const i = st.shuffle && PIANO.length > 1
    ? (st.index + 1 + Math.floor(Math.random() * (PIANO.length - 1))) % PIANO.length
    : st.index + 1;
  const was = isPlaying() || !audio.src;
  load(i);
  if (was) play(); else changed();
}
export function prev() {
  if (audio.currentTime > 4) { audio.currentTime = 0; return; }
  const was = isPlaying();
  load(st.index - 1);
  if (was) play(); else changed();
}
export function stop() {
  audio.pause();
  audio.currentTime = 0;
  changed();
}
export function setVolume(v) {
  st.volume = v;
  audio.volume = st.ducked ? 0.15 * v : v;
  changed();
}
export function setShuffle(on) { st.shuffle = on; changed(); }

// Auto-ducking: quieter during breaks, back to full on focus.
let fadeTimer = null;
function fade(to, ms = 1200) {
  clearInterval(fadeTimer);
  if (!ms) { audio.volume = to; return; }
  const from = audio.volume, steps = 20;
  let i = 0;
  fadeTimer = setInterval(() => {
    i++;
    audio.volume = Math.max(0, Math.min(1, from + ((to - from) * i) / steps));
    if (i >= steps) clearInterval(fadeTimer);
  }, ms / steps);
}
export function duckPiano(on) {
  st.ducked = on;
  fade(on ? 0.15 * st.volume : st.volume);
}

audio.addEventListener("ended", () => next());
audio.addEventListener("play", () => emit("music"));
audio.addEventListener("pause", () => emit("music"));
audio.addEventListener("timeupdate", () => emit("musicTime"));

function mediaSession() {
  if (!("mediaSession" in navigator)) return;
  const t = current();
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title, artist: t.composer, album: "onTop · Focus piano",
    artwork: [{ src: `${import.meta.env.BASE_URL}icon-512.png`, sizes: "512x512", type: "image/png" }],
  });
  navigator.mediaSession.setActionHandler("play", () => play());
  navigator.mediaSession.setActionHandler("pause", () => pause());
  navigator.mediaSession.setActionHandler("nexttrack", () => next());
  navigator.mediaSession.setActionHandler("previoustrack", () => prev());
  navigator.mediaSession.setActionHandler("stop", () => stop());
}
