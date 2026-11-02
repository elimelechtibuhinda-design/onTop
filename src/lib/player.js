// Music player: real public-domain recordings (see public/music/CREDITS.md), in playlists
// (piano, acoustic). One <audio> element, looping playlist, shuffle, volume, auto-ducking
// on breaks, and Media Session so lock-screen / keyboard media keys work.
import { emit } from "./bus.js";

const PIANO = [
  { id: "gymnopedie1", title: "Gymnopédie No. 1", composer: "Erik Satie", file: "satie-gymnopedie-1.mp3" },
  { id: "nocturne92", title: "Nocturne Op. 9 No. 2", composer: "Frédéric Chopin", file: "chopin-nocturne-op9-no2.mp3" },
  { id: "gnossienne1", title: "Gnossienne No. 1", composer: "Erik Satie", file: "satie-gnossienne-1.mp3" },
  { id: "traumerei", title: "Träumerei", composer: "Robert Schumann", file: "schumann-traumerei.mp3" },
  { id: "nocturne91", title: "Nocturne Op. 9 No. 1", composer: "Frédéric Chopin", file: "chopin-nocturne-op9-no1.mp3" },
  { id: "gnossienne3", title: "Gnossienne No. 3", composer: "Erik Satie", file: "satie-gnossienne-3.mp3" },
  { id: "nocturne322", title: "Nocturne Op. 32 No. 2", composer: "Frédéric Chopin", file: "chopin-nocturne-op32-no2.mp3" },
  { id: "nocturne20", title: "Nocturne in C-sharp minor", composer: "Frédéric Chopin", file: "chopin-nocturne-no20.mp3" },
];

// Some acoustic recordings are CC BY / CC BY-SA, so their performer and license are shown in the app.
const ACOUSTIC = [
  { id: "romance", title: "Romance Anónimo", composer: "Traditional (Spain)", credit: "Jim Greeninger · CC0", file: "guitar-romance-anonimo.mp3" },
  { id: "sor35", title: "Study Op. 35 No. 17", composer: "Fernando Sor", credit: "Jujutacular · CC BY-SA 3.0", file: "guitar-sor-op35-no17.mp3" },
  { id: "bourree", title: "Bourrée in E minor, BWV 996", composer: "J. S. Bach", credit: "Guilherme Facchetti · CC BY 3.0", file: "guitar-bach-bourree-996.mp3" },
  { id: "sor11", title: "Minuet Op. 11 No. 2", composer: "Fernando Sor", credit: "Jujutacular · CC BY-SA 3.0", file: "guitar-sor-op11-no2.mp3" },
  { id: "recuerdos", title: "Recuerdos de la Alhambra", composer: "Francisco Tárrega", credit: "Carlo Alberto Boni · CC BY-SA 3.0", file: "guitar-recuerdos-alhambra.mp3" },
  { id: "sor31", title: "Study Op. 31 No. 1", composer: "Fernando Sor", credit: "Jujutacular · CC BY-SA 3.0", file: "guitar-sor-op31-no1.mp3" },
];

export const PLAYLISTS = {
  piano: { name: "Focus piano", emoji: "🎹", blurb: "Satie, Chopin, Schumann — calm, no lyrics.", tracks: PIANO },
  acoustic: { name: "Acoustic guitar", emoji: "🎸", blurb: "Simple, warm classical guitar.", tracks: ACOUSTIC },
};
const listOf = (id) => Object.keys(PLAYLISTS).find((k) => PLAYLISTS[k].tracks.some((t) => t.id === id));

const KEY = "ontop-piano";
const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })();

const audio = new Audio();
audio.preload = "none";
const st = {
  list: PLAYLISTS[saved.list] ? saved.list : "piano",
  index: 0,
  volume: saved.volume ?? 0.6,
  shuffle: !!saved.shuffle,
  ducked: false,
  warmed: new Set(),
};
audio.volume = st.volume;
const tracks = () => PLAYLISTS[st.list].tracks;
st.index = Math.max(0, tracks().findIndex((t) => t.id === saved.trackId));

const src = (t) => `${import.meta.env.BASE_URL}music/${t.file}`;
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify({ list: st.list, trackId: current().id, volume: st.volume, shuffle: st.shuffle })); } catch { /* ignore */ }
}
const changed = () => { persist(); emit("music"); };

export const current = () => tracks()[st.index];
export const currentList = () => st.list;
export const isPlaying = () => !audio.paused && !audio.ended;
export const pianoState = () => ({ list: st.list, playlist: PLAYLISTS[st.list], track: current(), playing: isPlaying(), volume: st.volume, shuffle: st.shuffle, time: audio.currentTime, duration: audio.duration || 0 });

function load(i) {
  st.index = (i + tracks().length) % tracks().length;
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
  if (id) {
    st.list = listOf(id) || st.list;
    load(tracks().findIndex((t) => t.id === id));
  }
  else if (!audio.src) load(st.index);
  fade(st.ducked ? 0.15 * st.volume : st.volume, 0);
  try { await audio.play(); } catch { /* autoplay blocked until a tap */ }
  changed();
}
export function pause() { audio.pause(); changed(); }
export function toggle() { isPlaying() ? pause() : play(); }
export function next() {
  const n = tracks().length;
  const i = st.shuffle && n > 1
    ? (st.index + 1 + Math.floor(Math.random() * (n - 1))) % n
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
// Switch playlists; keeps playing if something was playing.
export function setPlaylist(id) {
  if (!PLAYLISTS[id] || id === st.list) return;
  const was = isPlaying();
  st.list = id;
  load(0);
  if (was) play(); else changed();
}

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
    title: t.title, artist: t.composer, album: `onTop · ${PLAYLISTS[st.list].name}`,
    artwork: [{ src: `${import.meta.env.BASE_URL}icon-512.png`, sizes: "512x512", type: "image/png" }],
  });
  navigator.mediaSession.setActionHandler("play", () => play());
  navigator.mediaSession.setActionHandler("pause", () => pause());
  navigator.mediaSession.setActionHandler("nexttrack", () => next());
  navigator.mediaSession.setActionHandler("previoustrack", () => prev());
  navigator.mediaSession.setActionHandler("stop", () => stop());
}
