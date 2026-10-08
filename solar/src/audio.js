// Generative space score and interaction sounds, synthesised live with the
// Web Audio API (no audio files).
//
// Music: slow detuned pad chords, a sub drone, starlight bells through a long
// delay, and per-page voices modelled on real space recordings — the Sun's
// low roar (helioseismology sonifications), Earth's "chorus" (rising
// magnetospheric chirps), Jupiter's whistlers (falling tones from lightning),
// Saturn's kilometric radiation (gliding radio tones), winds for Venus, Mars
// and Neptune, glassy ice chimes for the ice giants, sparse pings at Pluto.
//
// SFX: warp whoosh on page transitions, an arrival chime per body (pitch
// falls with distance from the Sun), a click shock wave, lensing sparkles
// under the cursor, a drag-spin wind, UI ticks, a palette arpeggio, slider
// ticks and the buzz of the neon headline lighting up.

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (l) => l[Math.floor(Math.random() * l.length)];

const PROGRESSIONS = {
  wonder: [[38, 50, 57, 61, 64, 68], [35, 47, 54, 57, 61, 64], [31, 43, 50, 54, 57, 62], [33, 45, 52, 57, 59, 64]],
  solar: [[26, 38, 45, 50, 52, 57], [24, 36, 43, 48, 50, 55], [22, 34, 41, 46, 50, 53], [24, 36, 43, 50, 52, 55]],
  inner: [[38, 50, 54, 57, 62, 64], [43, 50, 55, 59, 62, 66], [40, 52, 55, 59, 62, 67], [45, 52, 57, 61, 64, 66]],
  dusty: [[38, 50, 53, 57, 62, 64], [34, 46, 53, 57, 60, 62], [36, 48, 55, 58, 62, 67], [33, 45, 52, 57, 60, 64]],
  giant: [[26, 38, 45, 50, 54, 57], [31, 43, 50, 55, 59, 62], [28, 40, 47, 52, 55, 59], [33, 45, 52, 57, 61, 64]],
  ice: [[38, 45, 50, 52, 57, 59], [36, 43, 48, 50, 55, 57], [41, 48, 53, 55, 60, 62], [39, 46, 51, 53, 58, 60]],
  far: [[38, 45, 57, 64], [38, 45, 55, 62], [36, 43, 55, 62], [38, 45, 57, 62]],
  cosmos: [[26, 38, 45, 50, 54, 57, 64], [31, 43, 50, 55, 59, 62, 66], [33, 45, 52, 57, 61, 64, 69], [38, 50, 57, 62, 66, 69]],
};
const STAR_SCALE = [74, 76, 78, 81, 83, 86, 88, 90, 93];
const ICE_SCALE = [79, 81, 84, 86, 88, 91, 93, 96];

// Per page: harmony, pad cutoff, chord length, and [min, max] seconds between
// voices. roar / wind are continuous beds: [level, centre Hz, gustiness].
const SCENES = [
  { prog: 'wonder', cut: 2200, len: 13, star: [1.6, 4], ping: [18, 36], sub: 0.7 },
  { prog: 'solar', cut: 1500, len: 15, star: [5, 10], flare: [3, 7], roar: 1, sub: 1.1 },
  { prog: 'inner', cut: 2600, len: 11, star: [2, 5], swift: [5, 9], sub: 0.6 },
  { prog: 'inner', cut: 1600, len: 13, star: [4, 8], wind: [0.9, 260, 0.35], sub: 0.8 },
  { prog: 'inner', cut: 2300, len: 12, star: [2, 5], chorus: [4, 9], sub: 0.65 },
  { prog: 'dusty', cut: 1900, len: 12, star: [3, 7], wind: [0.55, 950, 0.8], sub: 0.7 },
  { prog: 'giant', cut: 1800, len: 15, star: [3, 6], whistler: [4, 9], sub: 1 },
  { prog: 'giant', cut: 2000, len: 15, star: [3, 6], skr: [6, 11], cascade: [5, 10], sub: 0.9 },
  { prog: 'ice', cut: 2100, len: 14, star: [5, 9], ice: [2, 5], wind: [0.3, 700, 0.4], sub: 0.75 },
  { prog: 'ice', cut: 1800, len: 14, star: [5, 9], ice: [3, 6], wind: [0.75, 620, 1], sub: 0.85 },
  { prog: 'far', cut: 1400, len: 16, star: [7, 13], ping: [7, 14], sub: 0.6 },
  { prog: 'cosmos', cut: 2600, len: 13, star: [0.8, 2.4], ping: [25, 45], sub: 0.9 },
];
// Arrival chimes, highest near the Sun (the Sun itself gets a gong).
const ARRIVE = [69, 45, 86, 83, 81, 79, 74, 72, 69, 67, 64, 62];

export class SpaceScore {
  constructor() {
    this.ctx = null;
    this.on = false;
    this.sceneIndex = 0;
    this.scene = SCENES[0];
    this.next = {};
    this.chordAt = 0;
    this.chordIdx = 0;
    this.musicVol = 0.7;
    this.sfxVol = 0.7;
    this.lastTick = {};
  }

  get supported() {
    return !!(window.AudioContext || window.webkitAudioContext);
  }

  build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = (this.ctx = new AC());

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.01;
    comp.release.value = 0.4;
    this.master.connect(comp).connect(ctx.destination);

    this.musicGain = ctx.createGain();
    this.sfxGain = ctx.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    this.setVolumes(this.musicVol, this.sfxVol);

    // Music: dry + long bright reverb + feedback delay.
    this.mDry = ctx.createGain();
    this.mDry.gain.value = 0.7;
    this.mDry.connect(this.musicGain);
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(8, 2.2, 0.35);
    this.verbIn = ctx.createGain();
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.9;
    this.verbIn.connect(this.verb).connect(verbOut).connect(this.musicGain);
    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = 0.68;
    const fb = ctx.createGain();
    fb.gain.value = 0.45;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 2400;
    this.delay.connect(dlp).connect(fb).connect(this.delay);
    const dOut = ctx.createGain();
    dOut.gain.value = 0.45;
    this.delay.connect(dOut);
    dOut.connect(this.verbIn);
    dOut.connect(this.mDry);

    this.padBus = this.bus(this.mDry, this.verbIn, 0.42, 0.8, 0);
    this.fxBus = this.bus(this.mDry, this.verbIn, 0.3, 0.95, 0.3);

    // SFX: dry + a shorter reverb, on their own volume.
    this.sDry = ctx.createGain();
    this.sDry.connect(this.sfxGain);
    this.sVerb = ctx.createConvolver();
    this.sVerb.buffer = this.impulse(3, 2.6, 0.5);
    this.sVerbIn = ctx.createGain();
    this.sVerbIn.connect(this.sVerb).connect(this.sfxGain);
    this.sfx = this.bus(this.sDry, this.sVerbIn, 0.75, 0.55, 0);

    this.noiseBuf = this.noiseBuffer(2, false);
    this.brownBuf = this.noiseBuffer(6, true);

    this.startDrone();
    this.startBeds();
    this.startSpin();
    this.timer = setInterval(() => this.tick(), 150);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else if (this.on) this.ctx.resume();
    });
  }

  bus(dryDest, wetDest, dry, wet, delay) {
    const g = this.ctx.createGain();
    const d = this.ctx.createGain();
    d.gain.value = dry;
    const w = this.ctx.createGain();
    w.gain.value = wet;
    g.connect(d).connect(dryDest);
    g.connect(w).connect(wetDest);
    if (delay) {
      const s = this.ctx.createGain();
      s.gain.value = delay;
      g.connect(s).connect(this.delay);
    }
    return g;
  }

  // Reverb tail: stereo noise that darkens as it decays.
  impulse(seconds, decay, bright) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        lp += (Math.random() * 2 - 1 - lp) * (0.06 + bright * (1 - t));
        d[i] = lp * Math.pow(1 - t, decay) * (i < 300 ? i / 300 : 1);
      }
    }
    return buf;
  }

  noiseBuffer(seconds, brown) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  noise(brown = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = brown ? this.brownBuf : this.noiseBuf;
    s.loop = true;
    return s;
  }

  panner(v) {
    if (!this.ctx.createStereoPanner) return this.ctx.createGain();
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, v));
    return p;
  }

  setVolumes(music, sfx) {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.musicGain.gain.setTargetAtTime(Math.pow(music, 1.6) * 1.1, now, 0.08);
    this.sfxGain.gain.setTargetAtTime(Math.pow(sfx, 1.6) * 1.1, now, 0.08);
  }

  // ---------- continuous layers ----------
  startDrone() {
    const ctx = this.ctx;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.06 * this.scene.sub;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.045;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.02;
    lfo.connect(lfoAmt).connect(this.droneGain.gain);
    lfo.start();
    [[midi(26), 'sine', 1], [midi(33), 'sine', 0.45], [midi(38), 'triangle', 0.25]].forEach(([f, type, g]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = rand(-4, 4);
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(this.droneGain);
      o.start();
    });
    this.droneGain.connect(this.mDry);
  }

  startBeds() {
    const ctx = this.ctx;
    // Solar roar: brown noise, low-passed, breathing slowly.
    const roar = this.noise(true);
    const rlp = ctx.createBiquadFilter();
    rlp.type = 'lowpass';
    rlp.frequency.value = 260;
    rlp.Q.value = 0.9;
    this.roarGain = ctx.createGain();
    this.roarGain.gain.value = 0;
    const breath = ctx.createOscillator();
    breath.frequency.value = 0.09;
    const bAmt = ctx.createGain();
    bAmt.gain.value = 90;
    breath.connect(bAmt).connect(rlp.frequency);
    breath.start();
    roar.connect(rlp).connect(this.roarGain).connect(this.mDry);
    roar.start();

    // Wind: band-passed white noise with a gusting centre frequency.
    const wind = this.noise(false);
    this.windBp = ctx.createBiquadFilter();
    this.windBp.type = 'bandpass';
    this.windBp.frequency.value = 600;
    this.windBp.Q.value = 0.8;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.gust = ctx.createOscillator();
    this.gust.frequency.value = 0.13;
    this.gustAmt = ctx.createGain();
    this.gustAmt.gain.value = 200;
    this.gust.connect(this.gustAmt).connect(this.windBp.frequency);
    this.gust.start();
    const wPan = this.panner(0);
    if (wPan.pan) {
      const sway = ctx.createOscillator();
      sway.frequency.value = 0.07;
      const swayAmt = ctx.createGain();
      swayAmt.gain.value = 0.6;
      sway.connect(swayAmt).connect(wPan.pan);
      sway.start();
    }
    wind.connect(this.windBp).connect(this.windGain).connect(wPan).connect(this.mDry);
    wind.start();
    this.applyBeds();
  }

  applyBeds() {
    const now = this.ctx.currentTime;
    const sc = this.scene;
    this.roarGain.gain.setTargetAtTime(sc.roar ? 0.16 * sc.roar : 0, now, 1.5);
    if (sc.wind) {
      const [lvl, hz, gust] = sc.wind;
      this.windGain.gain.setTargetAtTime(0.09 * lvl, now, 1.5);
      this.windBp.frequency.setTargetAtTime(hz, now, 1.5);
      this.gustAmt.gain.setTargetAtTime(hz * 0.45 * gust, now, 1.5);
      this.gust.frequency.setTargetAtTime(0.08 + gust * 0.25, now, 1.5);
    } else this.windGain.gain.setTargetAtTime(0, now, 1.2);
    this.droneGain.gain.setTargetAtTime(0.06 * sc.sub, now, 2);
  }

  // Drag-to-spin wind: a band-passed noise whose level follows drag speed.
  startSpin() {
    const ctx = this.ctx;
    const src = this.noise(false);
    this.spinBp = ctx.createBiquadFilter();
    this.spinBp.type = 'bandpass';
    this.spinBp.frequency.value = 500;
    this.spinBp.Q.value = 1.4;
    this.spinG = ctx.createGain();
    this.spinG.gain.value = 0;
    src.connect(this.spinBp).connect(this.spinG).connect(this.sfx);
    src.start();
  }

  spin(speed) {
    if (!this.on || !this.ctx) return;
    const now = this.ctx.currentTime;
    const s = Math.min(1, Math.abs(speed));
    this.spinG.gain.setTargetAtTime(s * 0.18, now, 0.06);
    this.spinBp.frequency.setTargetAtTime(380 + s * 2200, now, 0.08);
  }

  // ---------- music voices ----------
  chord(notes, when, dur) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.085, when + 4);
    g.gain.setValueAtTime(0.085, when + dur - 5);
    g.gain.linearRampToValueAtTime(0, when + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 2.5;
    const cut = this.scene.cut * 0.45;
    f.frequency.setValueAtTime(cut * 0.55, when);
    f.frequency.linearRampToValueAtTime(cut * 1.3, when + dur * 0.5);
    f.frequency.linearRampToValueAtTime(cut * 0.6, when + dur);
    notes.forEach((m, k) => {
      for (const det of [-8, 7]) {
        const o = ctx.createOscillator();
        o.type = k === 0 ? 'triangle' : k % 2 ? 'sawtooth' : 'triangle';
        o.frequency.value = midi(m);
        o.detune.value = det + rand(-3, 3);
        const og = ctx.createGain();
        og.gain.value = (k === 0 ? 0.9 : 0.5) / notes.length;
        o.connect(og).connect(f);
        o.start(when);
        o.stop(when + dur + 0.2);
      }
    });
    f.connect(g).connect(this.padBus);
  }

  bell(when, m, { gain = 0.05, pan = rand(-0.7, 0.7), dest = this.fxBus, ratios = [[1, 1, 4.5], [2.756, 0.36, 2.2], [5.404, 0.13, 1.1]], decay = 1 } = {}) {
    const ctx = this.ctx;
    const f = midi(m);
    const out = this.panner(pan);
    for (const [ratio, amp, dec] of ratios) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(amp * gain, when + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dec * decay);
      o.connect(g).connect(out);
      o.start(when);
      o.stop(when + dec * decay + 0.1);
    }
    out.connect(dest);
  }

  star(when) {
    const deep = this.sceneIndex >= 10;
    this.bell(when, pick(STAR_SCALE) - (deep ? 12 : 0) + (Math.random() < 0.2 ? 12 : 0), { gain: 0.045 });
  }

  ice(when) {
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      this.bell(when + i * rand(0.05, 0.14), pick(ICE_SCALE), { gain: 0.03, ratios: [[1, 1, 2.2], [2.0, 0.3, 1.4], [3.01, 0.18, 0.8], [4.1, 0.1, 0.5]] });
    }
  }

  swift(when) {
    // Mercury: a quick run of notes, the swiftest orbit.
    const up = Math.random() < 0.5;
    const notes = [74, 76, 78, 81, 83, 86, 88];
    notes.forEach((m, i) => this.bell(when + i * 0.085, up ? m : notes[notes.length - 1 - i], { gain: 0.025, pan: -0.6 + (i / notes.length) * 1.2, decay: 0.6 }));
  }

  cascade(when) {
    // Saturn's rings: a falling shower of glassy notes.
    const notes = [93, 90, 88, 86, 83, 81, 78, 76, 74];
    notes.forEach((m, i) => this.bell(when + i * rand(0.07, 0.12), m, { gain: 0.022, pan: 0.7 - (i / notes.length) * 1.4, decay: 0.8 }));
  }

  chorus(when) {
    // Earth's magnetospheric chorus: bursts of rising chirps, like birdsong.
    const ctx = this.ctx;
    const n = 3 + Math.floor(Math.random() * 6);
    let t = when;
    const pan = this.panner(rand(-0.6, 0.6));
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.7;
    bp.connect(pan).connect(this.fxBus);
    for (let i = 0; i < n; i++) {
      t += rand(0.08, 0.26);
      const o = ctx.createOscillator();
      o.type = 'sine';
      const f0 = rand(700, 1300);
      const d = rand(0.12, 0.32);
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * rand(1.8, 2.6), t + d);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.03, t + d * 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(bp);
      o.start(t);
      o.stop(t + d + 0.05);
    }
  }

  whistler(when) {
    // Jupiter: lightning whistlers, tones falling from high to low.
    const ctx = this.ctx;
    const d = rand(1.2, 2.2);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(rand(3200, 5200), when);
    o.frequency.exponentialRampToValueAtTime(rand(280, 520), when + d);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.035, when + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, when + d);
    o.connect(g).connect(this.panner(rand(-0.8, 0.8))).connect(this.fxBus);
    o.start(when);
    o.stop(when + d + 0.1);
  }

  skr(when) {
    // Saturn kilometric radiation: eerie gliding tones with a wobble.
    const ctx = this.ctx;
    const d = rand(3, 5);
    const f0 = rand(320, 520);
    for (const k of [1, 1.5]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f0 * k, when);
      o.frequency.linearRampToValueAtTime(f0 * k * rand(1.2, 1.6), when + d * 0.45);
      o.frequency.linearRampToValueAtTime(f0 * k * rand(0.8, 1.05), when + d);
      const vib = ctx.createOscillator();
      vib.frequency.value = rand(5, 8);
      const va = ctx.createGain();
      va.gain.value = f0 * 0.03;
      vib.connect(va).connect(o.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(k === 1 ? 0.028 : 0.014, when + d * 0.4);
      g.gain.linearRampToValueAtTime(0, when + d);
      o.connect(g).connect(this.fxBus);
      o.start(when);
      vib.start(when);
      o.stop(when + d + 0.1);
      vib.stop(when + d + 0.1);
    }
  }

  flare(when) {
    // Solar eruption: a crackling burst over a low swell.
    const ctx = this.ctx;
    const d = rand(0.8, 1.6);
    const src = this.noise(false);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = rand(900, 2200);
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    for (let t = 0; t < d; t += 0.02) g.gain.setValueAtTime(Math.random() < 0.4 ? rand(0.01, 0.05) * (1 - t / d) : 0, when + t);
    g.gain.setValueAtTime(0, when + d);
    src.connect(bp).connect(g).connect(this.panner(rand(-0.7, 0.7))).connect(this.fxBus);
    src.start(when, Math.random());
    src.stop(when + d + 0.05);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(55, when);
    o.frequency.exponentialRampToValueAtTime(38, when + d * 2);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0, when);
    og.gain.linearRampToValueAtTime(0.06, when + 0.3);
    og.gain.exponentialRampToValueAtTime(0.0001, when + d * 2);
    o.connect(og).connect(this.mDry);
    o.start(when);
    o.stop(when + d * 2 + 0.1);
  }

  ping(when, gain = 0.06, dest = this.fxBus) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(midi(86), when);
    o.frequency.exponentialRampToValueAtTime(midi(85.6), when + 1.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 1.6);
    o.connect(g).connect(dest);
    o.start(when);
    o.stop(when + 1.7);
  }

  tick() {
    if (!this.on || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (now + 0.5 >= this.chordAt) {
      const prog = PROGRESSIONS[this.scene.prog];
      const at = Math.max(this.chordAt, now + 0.05);
      const len = this.scene.len;
      this.chord(prog[this.chordIdx % prog.length], at, len + 4);
      this.chordIdx++;
      this.chordAt = at + len;
    }
    const voices = {
      star: (t) => this.star(t), ping: (t) => this.ping(t), ice: (t) => this.ice(t), swift: (t) => this.swift(t),
      cascade: (t) => this.cascade(t), chorus: (t) => this.chorus(t), whistler: (t) => this.whistler(t),
      skr: (t) => this.skr(t), flare: (t) => this.flare(t),
    };
    for (const [name, play] of Object.entries(voices)) {
      const range = this.scene[name];
      if (!range) continue;
      if (this.next[name] === undefined) this.next[name] = now + rand(range[0] * 0.3, range[1] * 0.6);
      if (now >= this.next[name]) {
        play(now + 0.06);
        this.next[name] = now + rand(range[0], range[1]);
      }
    }
  }

  setScene(i) {
    const idx = Math.max(0, Math.min(SCENES.length - 1, i));
    if (idx === this.sceneIndex && this.ctx) return;
    this.sceneIndex = idx;
    this.scene = SCENES[idx];
    if (!this.ctx) return;
    this.applyBeds();
    const now = this.ctx.currentTime;
    // Change harmony soon rather than waiting out the current chord.
    this.chordAt = Math.min(this.chordAt, now + 2.5);
    for (const name of Object.keys(this.next)) if (!this.scene[name]) delete this.next[name];
    for (const name of ['star', 'ping', 'ice', 'swift', 'cascade', 'chorus', 'whistler', 'skr', 'flare']) {
      const range = this.scene[name];
      if (!range) continue;
      const soon = now + rand(0.8, Math.min(range[1], 3.5));
      if (this.next[name] === undefined || this.next[name] > soon) this.next[name] = soon;
    }
  }

  // ---------- interaction sounds ----------
  ready() {
    return this.on && this.ctx && this.ctx.state === 'running';
  }

  throttle(name, ms) {
    const t = performance.now();
    if (this.lastTick[name] && t - this.lastTick[name] < ms) return false;
    this.lastTick[name] = t;
    return true;
  }

  // Page transition: a warp whoosh, rising when travelling outward.
  whoosh(dir = 1, power = 1) {
    if (!this.ready() || !this.throttle('whoosh', 500)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    const d = 1.3;
    const src = this.noise(false);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.6;
    const f0 = dir > 0 ? 300 : 2600, f1 = dir > 0 ? 2800 : 280;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + d);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16 * power, t + d * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    const pan = this.panner(0);
    if (pan.pan) {
      pan.pan.setValueAtTime(-0.7 * dir, t);
      pan.pan.linearRampToValueAtTime(0.7 * dir, t + d);
    }
    src.connect(bp).connect(g).connect(pan).connect(this.sfx);
    src.start(t, Math.random());
    src.stop(t + d + 0.05);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(dir > 0 ? 70 : 140, t);
    o.frequency.exponentialRampToValueAtTime(dir > 0 ? 140 : 60, t + d);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0, t);
    og.gain.linearRampToValueAtTime(0.07 * power, t + d * 0.5);
    og.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(og).connect(this.sfx);
    o.start(t);
    o.stop(t + d + 0.05);
  }

  // Arrival at a body: a bell chord (a gong for the Sun).
  arrive(i) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + 0.05;
    const m = ARRIVE[Math.max(0, Math.min(ARRIVE.length - 1, i))];
    if (i === 1) {
      this.bell(t, m, { gain: 0.16, pan: 0.2, dest: this.sfx, ratios: [[1, 1, 6], [1.52, 0.6, 4.5], [2.31, 0.45, 3.5], [3.12, 0.25, 2.5], [4.2, 0.12, 1.6]] });
    } else {
      this.bell(t, m, { gain: 0.08, pan: 0.25, dest: this.sfx });
      this.bell(t + 0.11, m + 7, { gain: 0.045, pan: 0.35, dest: this.sfx });
      this.bell(t + 0.22, m + 12, { gain: 0.03, pan: 0.45, dest: this.sfx, decay: 0.8 });
    }
  }

  // Click: the shock wave — a soft thump, a burst of noise and a ringing tone.
  pulse(x = 0) {
    if (!this.ready()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    const pan = this.panner(x * 0.8);
    pan.connect(this.sfx);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.45);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0, t);
    og.gain.linearRampToValueAtTime(0.34, t + 0.01);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(og).connect(pan);
    o.start(t);
    o.stop(t + 0.6);
    const src = this.noise(false);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(3500, t);
    bp.frequency.exponentialRampToValueAtTime(400, t + 0.6);
    bp.Q.value = 0.8;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(0.11, t + 0.02);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    src.connect(bp).connect(ng).connect(pan);
    src.start(t, Math.random());
    src.stop(t + 0.75);
    this.bell(t + 0.03, pick([86, 88, 90, 93]), { gain: 0.05, pan: x, dest: this.sfx, decay: 0.7 });
  }

  // Cursor lensing: faint sparkles, more of them the faster the cursor moves.
  lens(speed, x = 0) {
    if (!this.ready() || speed < 0.15 || !this.throttle('lens', 90 - Math.min(60, speed * 40))) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f = rand(2400, 5200);
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 1.06, t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(Math.min(0.032, 0.01 + speed * 0.008), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + rand(0.08, 0.18));
    o.connect(g).connect(this.panner(x)).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.2);
  }

  uiHover() {
    if (!this.ready() || !this.throttle('hover', 60)) return;
    const t = this.ctx.currentTime + 0.003;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 1900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.04, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g).connect(this.sDry);
    o.start(t);
    o.stop(t + 0.06);
  }

  uiClick() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + 0.003;
    [[1320, 0], [1980, 0.05]].forEach(([f, dt]) => {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t + dt);
      g.gain.linearRampToValueAtTime(0.045, t + dt + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.09);
      o.connect(g).connect(this.sfx);
      o.start(t + dt);
      o.stop(t + dt + 0.1);
    });
  }

  // Palette switch: a bright rising arpeggio to multi, a cool falling one to mono.
  palette(toMono) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + 0.02;
    const notes = toMono ? [88, 83, 81, 76, 74, 69] : [69, 74, 76, 81, 86, 88, 93];
    notes.forEach((m, i) => this.bell(t + i * 0.07, m, { gain: toMono ? 0.04 : 0.045, pan: -0.8 + (i / notes.length) * 1.6, dest: this.sfx, decay: 0.8 }));
    const src = this.noise(false);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = toMono ? 3000 : 5000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.03, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    src.connect(hp).connect(g).connect(this.sfx);
    src.start(t, Math.random());
    src.stop(t + 1.2);
  }

  // Slider moved: a soft tick whose pitch follows the value (0..1).
  slider(v) {
    if (!this.ready() || !this.throttle('slider', 55)) return;
    const t = this.ctx.currentTime + 0.003;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = midi(64 + v * 30);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g).connect(this.sDry);
    o.start(t);
    o.stop(t + 0.1);
  }

  // Neon headline lighting up: a mains buzz that flickers with the letters.
  neon() {
    if (!this.ready()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.12;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 100;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 900;
    hp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    // Same rhythm as the CSS neon-on keyframes (1.5 s).
    const steps = [[0, 0], [0.1, 0.055], [0.165, 0.006], [0.285, 0.055], [0.36, 0.012], [0.48, 0.04], [0.9, 0.02], [1.4, 0]];
    for (const [dt, v] of steps) g.gain.linearRampToValueAtTime(v, t + dt);
    o.connect(hp).connect(g).connect(this.sDry);
    o.start(t);
    o.stop(t + 1.5);
  }

  panel(open) {
    if (!this.ready()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    const src = this.noise(false);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2;
    bp.frequency.setValueAtTime(open ? 800 : 2600, t);
    bp.frequency.exponentialRampToValueAtTime(open ? 2600 : 800, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.08, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    src.connect(bp).connect(g).connect(this.sfx);
    src.start(t, Math.random());
    src.stop(t + 0.32);
  }

  // ---------- transport ----------
  async start() {
    if (!this.supported) return false;
    if (!this.ctx) this.build();
    await this.ctx.resume();
    this.on = true;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(1, now + 2.5);
    this.applyBeds();
    return this.ctx.state === 'running';
  }

  stop() {
    if (!this.ctx) return;
    this.on = false;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0, now + 0.8);
    setTimeout(() => { if (!this.on) this.ctx.suspend(); }, 900);
  }
}
