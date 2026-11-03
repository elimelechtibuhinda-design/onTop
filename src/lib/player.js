// Focus-music player. Two kinds of track:
//  - generated calm music (calm.js): soft pads, chimes, gentle fingerpicked guitar — endless
//  - a few quiet public-domain piano recordings (see public/music/CREDITS.md)
// Every track has a gain so they all sit at the same calm loudness (~-38 dBFS, measured).
// Looping playlist, shuffle, volume, auto-ducking on breaks, Media Session for recordings.
import { emit } from "./bus.js";
import { getAudio } from "./audio.js";
import { startCalm } from "./calm.js";

const CALM = [
  { id: "drift", title: "Drift", composer: "Soft pads & chimes", gen: "drift", gain: 0.33 },
  { id: "night", title: "Night", composer: "Low, slow, sleepy", gen: "night", gain: 0.33 },
  { id: "floating", title: "Floating", composer: "One gentle drone", gen: "floating", gain: 0.43 },
];
const GUITAR = [
  { id: "fingerpick", title: "Fingerpicking", composer: "Slow nylon guitar", gen: "fingerpick", gain: 1 },
  { id: "campfire", title: "Campfire", composer: "Warm, simple chords", gen: "campfire", gain: 0.98 },
];
const PIANO = [
  { id: "gymnopedie1", title: "Gymnopédie No. 1", composer: "Erik Satie", file: "satie-gymnopedie-1.mp3", gain: 0.71 },
  { id: "gnossienne1", title: "Gnossienne No. 1", composer: "Erik Satie", file: "satie-gnossienne-1.mp3", gain: 1 },
  { id: "traumerei", title: "Träumerei", composer: "Robert Schumann", file: "schumann-traumerei.mp3", gain: 0.71 },
  { id: "gnossienne3", title: "Gnossienne No. 3", composer: "Erik Satie", file: "satie-gnossienne-3.mp3", gain: 1 },
];

export const PLAYLISTS = {
  calm: { name: "Calm (sleep-style)", emoji: "🌙", blurb: "Soft, slow and endless — like sleep music. No beats.", tracks: CALM },
  guitar: { name: "Soft guitar", emoji: "🎸", blurb: "Gentle fingerpicked guitar, slow and simple.", tracks: GUITAR },
  piano: { name: "Quiet piano", emoji: "🎹", blurb: "Satie & Schumann — the calmest real recordings.", tracks: PIANO },
};
const listOf = (id) => Object.keys(PLAYLISTS).find((k) => PLAYLISTS[k].tracks.some((t) => t.id === id));

const KEY = "dialedin-music";
const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })();

const audio = new Audio();
audio.preload = "none";
const st = {
  list: PLAYLISTS[saved.list] ? saved.list : "calm",
  index: 0,
  volume: saved.volume ?? 0.8,
  shuffle: !!saved.shuffle,
  ducked: false,
  started: false,      // a track is loaded/playing (drives the music bar)
  genPlaying: false,
  warmed: new Set(),
};
const tracks = () => PLAYLISTS[st.list].tracks;
st.index = Math.max(0, tracks().findIndex((t) => t.id === saved.trackId));

let gen = null;        // live generator { stop() }
let genGain = null;    // GainNode for generated music

const src = (t) => `${import.meta.env.BASE_URL}music/${t.file}`;
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify({ list: st.list, trackId: current().id, volume: st.volume, shuffle: st.shuffle })); } catch { /* ignore */ }
}
const changed = () => { persist(); emit("music"); };

export const current = () => tracks()[st.index];
export const isPlaying = () => (current().gen ? st.genPlaying : !audio.paused && !audio.ended);
export const pianoState = () => ({
  list: st.list, playlist: PLAYLISTS[st.list], track: current(), playing: isPlaying(), active: st.started,
  volume: st.volume, shuffle: st.shuffle,
});

// Effective level: user volume × per-track loudness match × break ducking.
const level = (t = current()) => st.volume * (t.gain ?? 1) * (st.ducked ? 0.25 : 1);
function applyLevel(ms = 0) {
  const t = current();
  if (t.gen) {
    const a = getAudio();
    if (genGain && a) genGain.gain.setTargetAtTime(level(t), a.ctx.currentTime, ms ? ms / 3000 : 0.05);
  } else fade(level(t), ms);
}

function stopGen() {
  if (gen) { gen.stop(); gen = null; }
  st.genPlaying = false;
}
function load(i) {
  stopGen();
  audio.pause();
  st.index = (i + tracks().length) % tracks().length;
  const t = current();
  if (!t.gen) { audio.src = src(t); warm(t); }
  mediaSession();
}
// Fetch the whole file once so the service worker can cache it for offline use.
function warm(t) {
  if (st.warmed.has(t.id)) return;
  st.warmed.add(t.id);
  fetch(src(t)).catch(() => {});
}

export async function play(id) {
  if (id) { st.list = listOf(id) || st.list; load(tracks().findIndex((t) => t.id === id)); }
  else if (!st.started) load(st.index);
  st.started = true;
  const t = current();
  if (t.gen) {
    const a = getAudio();
    if (!a) return;
    if (!gen) {
      genGain = a.ctx.createGain();
      genGain.gain.value = level(t);
      genGain.connect(a.master);
      gen = startCalm(a.ctx, genGain, t.gen);
    }
    st.genPlaying = true;
  } else {
    if (!audio.src) audio.src = src(t);
    fade(level(t), 0);
    try { await audio.play(); } catch { /* autoplay blocked until a tap */ }
  }
  changed();
}
export function pause() {
  if (current().gen) stopGen(); else audio.pause();
  changed();
}
export function toggle() { isPlaying() ? pause() : play(); }
export function next() {
  const n = tracks().length;
  const i = st.shuffle && n > 1 ? (st.index + 1 + Math.floor(Math.random() * (n - 1))) % n : st.index + 1;
  const was = isPlaying() || !st.started;
  load(i);
  if (was) play(); else changed();
}
export function prev() {
  if (!current().gen && audio.currentTime > 4) { audio.currentTime = 0; return; }
  const was = isPlaying();
  load(st.index - 1);
  if (was) play(); else changed();
}
export function stop() {
  stopGen();
  audio.pause();
  if (audio.src) audio.currentTime = 0;
  st.started = false;
  changed();
}
export function setVolume(v) { st.volume = v; applyLevel(); changed(); }
export function setShuffle(on) { st.shuffle = on; changed(); }
export function setPlaylist(id) {
  if (!PLAYLISTS[id] || id === st.list) return;
  const was = isPlaying();
  st.list = id;
  load(0);
  if (was) play(); else changed();
}

// Auto-ducking: much quieter during breaks, back to normal on focus.
let fadeTimer = null;
function fade(to, ms = 1200) {
  clearInterval(fadeTimer);
  to = Math.max(0, Math.min(1, to));
  if (!ms) { audio.volume = to; return; }
  const from = audio.volume, steps = 20;
  let i = 0;
  fadeTimer = setInterval(() => {
    i++;
    audio.volume = Math.max(0, Math.min(1, from + ((to - from) * i) / steps));
    if (i >= steps) clearInterval(fadeTimer);
  }, ms / steps);
}
export function duckPiano(on) { st.ducked = on; applyLevel(1200); }

audio.addEventListener("ended", () => next());
audio.addEventListener("play", () => emit("music"));
audio.addEventListener("pause", () => emit("music"));

function mediaSession() {
  if (!("mediaSession" in navigator)) return;
  const t = current();
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title, artist: t.composer, album: `Dialed In · ${PLAYLISTS[st.list].name}`,
    artwork: [{ src: `${import.meta.env.BASE_URL}icon-512.png`, sizes: "512x512", type: "image/png" }],
  });
  navigator.mediaSession.setActionHandler("play", () => play());
  navigator.mediaSession.setActionHandler("pause", () => pause());
  navigator.mediaSession.setActionHandler("nexttrack", () => next());
  navigator.mediaSession.setActionHandler("previoustrack", () => prev());
  navigator.mediaSession.setActionHandler("stop", () => stop());
}
