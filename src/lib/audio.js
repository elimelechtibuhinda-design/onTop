// Ambient beds and cue sounds, synthesized with the Web Audio API (no files, works offline).
// Piano music lives in player.js.
import { duckPiano } from "./player.js";
import { emit } from "./bus.js";

let ctx = null;
let master, ambientBus;
const playing = {};          // ambient id -> { gain, stop() }

export const AMBIENT = [
  { id: "rain", emoji: "🌧️", name: "Rain" },
  { id: "cafe", emoji: "☕", name: "Café murmur" },
  { id: "brown", emoji: "🟤", name: "Brown noise" },
  { id: "fire", emoji: "🔥", name: "Fireplace" },
  { id: "ocean", emoji: "🌊", name: "Ocean" },
  { id: "library", emoji: "📚", name: "Library hum" },
];

function ensure() {
  if (ctx) { if (ctx.state === "suspended") ctx.resume(); return ctx; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  ambientBus = ctx.createGain(); ambientBus.connect(master);
  return ctx;
}
export function unlockAudio() { ensure(); }

/* ---------- noise sources ---------- */
const buffers = {};
function noiseBuffer(kind) {
  if (buffers[kind]) return buffers[kind];
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  if (kind === "white") {
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } else if (kind === "pink") {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = .99886 * b0 + w * .0555179; b1 = .99332 * b1 + w * .0750759; b2 = .969 * b2 + w * .153852;
      b3 = .8665 * b3 + w * .3104856; b4 = .55 * b4 + w * .5329522; b5 = -.7616 * b5 - w * .016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * .5362) * .11; b6 = w * .115926;
    }
  } else {
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + .02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }
  buffers[kind] = buf;
  return buf;
}
function noise(kind) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(kind);
  src.loop = true;
  src.start(0, Math.random() * 3);
  return src;
}
function filter(type, freq, q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  return f;
}
function lfo(freq, depth, target, offset) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = freq; g.gain.value = depth;
  o.connect(g).connect(target);
  target.value = offset;
  o.start();
  return o;
}
// A short filtered noise "event" (rain drop, crackle, clink, page turn).
function burst(out, { freq = 3000, type = "bandpass", q = 1, dur = 0.05, gain = 0.2, kind = "white" } = {}) {
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(kind);
  const f = filter(type, freq, q);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 3, dur + 0.05);
}
function ping(out, freq, gain = 0.05, dur = 0.6, type = "sine") {
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t); o.stop(t + dur + 0.05);
}
// Fires `fn` at random intervals between min and max ms until stopped.
function sprinkle(fn, min, max) {
  let alive = true, h;
  const loop = () => { if (!alive) return; fn(); h = setTimeout(loop, min + Math.random() * (max - min)); };
  h = setTimeout(loop, Math.random() * max);
  return () => { alive = false; clearTimeout(h); };
}

const BUILDERS = {
  rain(out) {
    const src = noise("pink");
    const hp = filter("highpass", 500), lp = filter("lowpass", 7000);
    const g = ctx.createGain(); g.gain.value = 0.9;
    src.connect(hp).connect(lp).connect(g).connect(out);
    const stopDrops = sprinkle(() => burst(out, { freq: 2500 + Math.random() * 3000, q: 4, dur: 0.03, gain: 0.25 }), 40, 220);
    return () => { stopDrops(); src.stop(); };
  },
  cafe(out) {
    const src = noise("pink");
    const bp = filter("bandpass", 600, 0.8);
    const g = ctx.createGain();
    src.connect(bp).connect(g).connect(out);
    const l1 = lfo(0.37, 0.25, g.gain, 0.6);
    const l2 = lfo(0.11, 200, bp.frequency, 650);
    const stopClinks = sprinkle(() => ping(out, 2200 + Math.random() * 1800, 0.04, 0.4, "triangle"), 1800, 6000);
    const stopTalk = sprinkle(() => burst(out, { freq: 300 + Math.random() * 500, q: 3, dur: 0.25, gain: 0.25, kind: "pink" }), 150, 600);
    return () => { stopClinks(); stopTalk(); src.stop(); l1.stop(); l2.stop(); };
  },
  brown(out) {
    const src = noise("brown");
    const g = ctx.createGain(); g.gain.value = 0.8;
    src.connect(g).connect(out);
    return () => src.stop();
  },
  fire(out) {
    const src = noise("brown");
    const lp = filter("lowpass", 600);
    const g = ctx.createGain(); g.gain.value = 0.9;
    src.connect(lp).connect(g).connect(out);
    const l = lfo(0.6, 0.2, g.gain, 0.8);
    const stopCrackle = sprinkle(() => burst(out, { freq: 2500 + Math.random() * 4000, type: "highpass", dur: 0.02 + Math.random() * 0.04, gain: 0.35 }), 60, 700);
    return () => { stopCrackle(); src.stop(); l.stop(); };
  },
  ocean(out) {
    const src = noise("pink");
    const lp = filter("lowpass", 900);
    const g = ctx.createGain();
    src.connect(lp).connect(g).connect(out);
    const l1 = lfo(0.08, 0.45, g.gain, 0.55);
    const l2 = lfo(0.08, 500, lp.frequency, 900);
    return () => { src.stop(); l1.stop(); l2.stop(); };
  },
  library(out) {
    const src = noise("pink");
    const lp = filter("lowpass", 350);
    const g = ctx.createGain(); g.gain.value = 0.5;
    src.connect(lp).connect(g).connect(out);
    const hum = ctx.createOscillator(); hum.frequency.value = 120;
    const hg = ctx.createGain(); hg.gain.value = 0.015;
    hum.connect(hg).connect(out); hum.start();
    const stopPages = sprinkle(() => burst(out, { freq: 3500, q: 0.6, dur: 0.35, gain: 0.08 }), 9000, 22000);
    return () => { stopPages(); src.stop(); hum.stop(); };
  },
};

export function setAmbient(id, volume) {
  if (!ensure()) return;
  const cur = playing[id];
  if (volume <= 0) {
    if (cur) { cur.stop(); cur.gain.disconnect(); delete playing[id]; emit("music"); }
    return;
  }
  if (cur) { cur.vol = volume; cur.gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.1); emit("music"); return; }
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ambientBus);
  gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.3);
  playing[id] = { gain, vol: volume, stop: BUILDERS[id](gain) };
  emit("music");
}
export const ambientLevel = (id) => playing[id]?.vol || 0;
export const ambientPlaying = () => Object.keys(playing);
export function stopAllAmbient() { Object.keys(playing).forEach((id) => setAmbient(id, 0)); }

// Auto-ducking: piano and ambient get quieter on breaks, back to full on focus.
export function duck(on) {
  duckPiano(on);
  if (!ctx) return;
  ambientBus.gain.setTargetAtTime(on ? 0.3 : 1, ctx.currentTime, 0.6);
}

/* ---------- cues ---------- */
export function bell() {        // focus finished
  if (!ensure()) return;
  [0, 0.18, 0.36].forEach((d, i) => setTimeout(() => {
    ping(master, [880, 1108.7, 1318.5][i], 0.18, 1.6);
    ping(master, [1760, 2217, 2637][i], 0.04, 1.0);
  }, d * 1000));
}
export function chime() {       // break finished
  if (!ensure()) return;
  [0, 0.15].forEach((d, i) => setTimeout(() => ping(master, [659.3, 987.8][i], 0.16, 1.2, "triangle"), d * 1000));
}
export function softPing() {    // Toppy speaks
  if (!ensure()) return;
  ping(master, 1046.5, 0.06, 0.35);
}
export function tickSound() {
  if (!ctx || ctx.state !== "running") return;
  burst(master, { freq: 4000, q: 2, dur: 0.015, gain: 0.05 });
}
