// All sound in onTop is synthesized with the Web Audio API: ambient noise beds,
// procedurally generated lo-fi, and cue sounds. No audio files, works offline, royalty-free.

let ctx = null;
let master, ambientBus, musicBus;
const playing = {};          // ambient id -> { gain, stop() }
let music = null;            // { id, stop() }
let musicVolume = 0.5;
let ducked = false;

export const AMBIENT = [
  { id: "rain", emoji: "🌧️", name: "Rain" },
  { id: "cafe", emoji: "☕", name: "Café murmur" },
  { id: "brown", emoji: "🟤", name: "Brown noise" },
  { id: "fire", emoji: "🔥", name: "Fireplace" },
  { id: "ocean", emoji: "🌊", name: "Ocean" },
  { id: "library", emoji: "📚", name: "Library hum" },
];
export const TRACKS = [
  { id: "rainy", name: "Rainy Window", bpm: 72, chords: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]] },
  { id: "library", name: "Late at Koerner", bpm: 78, chords: [[57, 60, 64, 67], [50, 53, 57, 60], [55, 59, 62, 65], [48, 52, 55, 59]] },
  { id: "sunset", name: "Wreck Beach Sunset", bpm: 70, chords: [[51, 55, 58, 62], [48, 51, 55, 58], [53, 56, 60, 63], [46, 50, 53, 56]] },
];

function ensure() {
  if (ctx) { if (ctx.state === "suspended") ctx.resume(); return ctx; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  ambientBus = ctx.createGain(); ambientBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = musicVolume; musicBus.connect(master);
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
    if (cur) { cur.stop(); cur.gain.disconnect(); delete playing[id]; }
    return;
  }
  if (cur) { cur.gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.1); return; }
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ambientBus);
  gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.3);
  playing[id] = { gain, stop: BUILDERS[id](gain) };
}
export const ambientPlaying = () => Object.keys(playing);
export function stopAllAmbient() { Object.keys(playing).forEach((id) => setAmbient(id, 0)); }

/* ---------- procedural lo-fi ---------- */
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

function startTrack(track) {
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(musicBus);
  out.gain.setTargetAtTime(0.6, ctx.currentTime, 0.5);
  const lp = filter("lowpass", 2200); lp.connect(out);    // warm "tape" tone
  const spb = 60 / track.bpm;
  let step = 0;                                           // 8th-note steps
  let next = ctx.currentTime + 0.1;

  const keys = (notes, t, dur) => notes.forEach((n, i) => {
    ["sine", "triangle"].forEach((type, k) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = type; o.frequency.value = midi(n); o.detune.value = (Math.random() - 0.5) * 12;
      const peak = (k ? 0.025 : 0.04);
      g.gain.setValueAtTime(0.0001, t + i * 0.03);
      g.gain.exponentialRampToValueAtTime(peak, t + i * 0.03 + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(lp); o.start(t); o.stop(t + dur + 0.1);
    });
  });
  const bass = (n, t, dur) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = "sine"; o.frequency.value = midi(n - 12);
    g.gain.setValueAtTime(0.13, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
  };
  const kick = (t) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.25);
    g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.4);
  };
  const hit = (t, freq, type, dur, gain) => {
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer("white");
    const f = filter(type, freq, 1); const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out); src.start(t, Math.random() * 3, dur + 0.05);
  };

  const schedule = () => {
    while (next < ctx.currentTime + 0.4) {
      const bar = Math.floor(step / 8) % track.chords.length;
      const pos = step % 8;
      const swing = pos % 2 ? spb * 0.12 : 0;
      const t = next + swing;
      const chord = track.chords[bar];
      if (pos === 0) keys(chord, t, spb * 4);
      if (pos === 0 || pos === 4) bass(chord[0], t, spb * 1.6);
      if (pos === 3) bass(chord[0], t, spb * 0.5);
      if (pos === 0 || pos === 5) kick(t);
      if (pos === 2 || pos === 6) hit(t, 1800, "bandpass", 0.16, 0.18);
      hit(t, 8000, "highpass", 0.04, pos % 2 ? 0.03 : 0.05);
      if (Math.random() < 0.25) hit(t + Math.random() * spb, 5000, "highpass", 0.01, 0.06); // vinyl crackle
      next += spb / 2;
      step++;
    }
  };
  const h = setInterval(schedule, 100);
  schedule();
  return () => {
    clearInterval(h);
    out.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    setTimeout(() => out.disconnect(), 1500);
  };
}

export function playMusic(id) {
  if (!ensure()) return;
  stopMusic();
  const track = TRACKS.find((t) => t.id === id);
  if (!track) return;
  music = { id, stop: startTrack(track) };
}
export function stopMusic() { if (music) { music.stop(); music = null; } }
export const musicPlaying = () => music?.id || null;
export function setMusicVolume(v) {
  musicVolume = v;
  if (ctx) musicBus.gain.setTargetAtTime(ducked ? 0 : v, ctx.currentTime, 0.2);
}

// Auto-ducking: fade music out on break, back in on focus.
export function duck(on) {
  ducked = on;
  if (!ctx) return;
  musicBus.gain.setTargetAtTime(on ? 0 : musicVolume, ctx.currentTime, 0.6);
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
