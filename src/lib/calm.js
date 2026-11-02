// Calm, sleep-style music generated live: soft pads, gentle chimes and slow fingerpicked guitar,
// all through a long reverb. No beats, no noise, endless. Works in real time and offline
// (the same scheduler renders into an OfflineAudioContext for testing).

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export const PRESETS = {
  drift: {   // warm major-9 pads, occasional chimes
    chordSec: 10, padLevel: 0.05, chime: 0.55, guitar: 0,
    chords: [[48, 55, 59, 62, 64], [45, 52, 55, 59, 60], [41, 48, 52, 55, 57], [43, 50, 55, 57, 62]],
    chimeNotes: [72, 74, 76, 79, 81, 84],
  },
  night: {   // darker, lower, sparser
    chordSec: 12, padLevel: 0.05, chime: 0.35, guitar: 0,
    chords: [[45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [48, 55, 60, 64, 67], [43, 50, 55, 59, 62]],
    chimeNotes: [69, 72, 74, 76, 79],
  },
  floating: { // one slow drone that barely moves
    chordSec: 16, padLevel: 0.045, chime: 0.25, guitar: 0,
    chords: [[38, 45, 50, 57, 64], [38, 45, 52, 57, 62], [38, 45, 50, 55, 62]],
    chimeNotes: [74, 76, 78, 81, 83, 86],
  },
  fingerpick: { // slow, soft nylon-style guitar arpeggios over a whisper of pad
    chordSec: 6, padLevel: 0.012, chime: 0, guitar: 1,
    chords: [[48, 55, 60, 64, 67], [45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [43, 50, 55, 59, 62]],
    pattern: [0, 2, 3, 4, 3, 2, 1, 2],
  },
  campfire: {
    chordSec: 7, padLevel: 0.012, chime: 0, guitar: 1,
    chords: [[40, 47, 52, 55, 59], [48, 52, 55, 60, 64], [43, 47, 50, 55, 59], [38, 45, 50, 54, 57]],
    pattern: [0, 2, 4, 3, 1, 3, 2, 4],
  },
};

// Seeded random so a preset sounds similar each time but never loops exactly.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function makeReverb(ctx, seconds = 5) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  const conv = ctx.createConvolver();
  conv.buffer = buf;
  return conv;
}

// Karplus–Strong plucked string, rendered once per pitch and cached.
const pluckCache = new Map();
function pluckBuffer(ctx, note) {
  const key = ctx.sampleRate + ":" + note;
  if (pluckCache.has(key)) return pluckCache.get(key);
  const sr = ctx.sampleRate, f = midi(note), period = Math.round(sr / f);
  const len = Math.floor(sr * 3.5);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const ring = new Float32Array(period);
  for (let i = 0; i < period; i++) ring[i] = (Math.random() * 2 - 1) * 0.5;
  // soften the attack: pre-filter the burst a few times (warmer, nylon-like)
  for (let pass = 0; pass < 3; pass++) for (let i = 1; i < period; i++) ring[i] = 0.5 * (ring[i] + ring[i - 1]);
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const next = (idx + 1) % period;
    const v = 0.4985 * (ring[idx] + ring[next]);
    d[i] = ring[idx];
    ring[idx] = v;
    idx = next;
  }
  pluckCache.set(key, buf);
  return buf;
}

// Builds the output chain and returns a scheduler that fills [from, to) with notes.
export function createCalm(ctx, destination, presetId, seed = Date.now()) {
  const P = PRESETS[presetId] || PRESETS.drift;
  const rand = rng(seed);
  const out = ctx.createGain();
  out.gain.value = 1;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -26; comp.ratio.value = 3; comp.attack.value = 0.05; comp.release.value = 0.6;
  const reverb = makeReverb(ctx);
  const wet = ctx.createGain(); wet.gain.value = 0.55;
  const dry = ctx.createGain(); dry.gain.value = 0.45;
  const bus = ctx.createGain();
  bus.connect(dry).connect(comp);
  bus.connect(reverb).connect(wet).connect(comp);
  comp.connect(out).connect(destination);
  const warm = ctx.createBiquadFilter(); warm.type = "lowpass"; warm.frequency.value = 1400; warm.Q.value = 0.4;
  warm.connect(bus);

  const pad = (note, t, dur, level) => {
    ["sine", "triangle"].forEach((type, k) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = type; o.frequency.value = midi(note); o.detune.value = (k ? 5 : -5) + (rand() - 0.5) * 4;
      const peak = level * (k ? 0.45 : 1);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + Math.min(4, dur / 3));
      g.gain.setValueAtTime(peak, t + dur - 4);
      g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(g).connect(warm);
      o.start(t); o.stop(t + dur + 0.1);
    });
  };
  const chime = (note, t) => {
    [[1, 0.03], [2, 0.006]].forEach(([mult, peak]) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "sine"; o.frequency.value = midi(note) * mult;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
      o.connect(g).connect(bus);
      o.start(t); o.stop(t + 4.6);
    });
  };
  const pluck = (note, t, level) => {
    const src = ctx.createBufferSource(); const g = ctx.createGain(); const lp = ctx.createBiquadFilter();
    src.buffer = pluckBuffer(ctx, note);
    lp.type = "lowpass"; lp.frequency.value = 2200;
    g.gain.value = level;
    src.connect(lp).connect(g).connect(bus);
    src.start(t);
  };

  let chordIdx = 0;
  let nextChordAt = ctx.currentTime + 0.2;
  function schedule(to) {
    while (nextChordAt < to) {
      const t = nextChordAt;
      const chord = P.chords[chordIdx % P.chords.length];
      const len = P.chordSec;
      // Pads overlap the next chord so changes are seamless.
      if (P.padLevel) chord.forEach((n, i) => pad(n + (i === 0 ? 0 : 12), t, len + 4, P.padLevel / (i === 0 ? 1.2 : 1.8)));
      if (P.chime && P.chimeNotes) {
        const count = 1 + Math.floor(rand() * 3);
        for (let i = 0; i < count; i++) if (rand() < P.chime) chime(P.chimeNotes[Math.floor(rand() * P.chimeNotes.length)], t + 1 + rand() * (len - 2));
      }
      if (P.guitar) {
        const step = len / P.pattern.length;
        P.pattern.forEach((pi, i) => {
          const humanize = (rand() - 0.5) * 0.04;
          const vel = 0.22 + rand() * 0.08 - (i ? 0 : -0.05);
          pluck(chord[pi] + 12, t + i * step + humanize, vel);
        });
      }
      chordIdx++;
      nextChordAt += len;
    }
  }
  return { output: out, schedule };
}

// Real-time player for one preset; returns { stop(), setLevel(v) }.
export function startCalm(ctx, destination, presetId) {
  const level = ctx.createGain();
  level.gain.value = 0;
  level.connect(destination);
  const gen = createCalm(ctx, level, presetId);
  level.gain.setTargetAtTime(1, ctx.currentTime, 1.2);   // gentle fade-in
  const tick = () => gen.schedule(ctx.currentTime + 2);
  tick();
  const h = setInterval(tick, 500);
  return {
    stop() {
      clearInterval(h);
      level.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
      setTimeout(() => level.disconnect(), 4000);
    },
  };
}
