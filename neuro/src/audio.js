// Generative score and sound effects, synthesised live with the Web Audio API.
// Nothing is pre-recorded.
//
// Music bus: slow pad chords that change colour with the level (crystalline
//   at the molecular scale, warmer and fuller toward the whole person), a
//   sub drone, a glassy shimmer (fluttering at theta rhythm in the
//   hippocampus), a soft crackle of spikes, and breath on the body page.
// Effects bus: sounds tied to what you see (an action potential, a ring of
//   kinases switching on, a tetanus, an engram recalled, a heartbeat) and to
//   what you do (stroking particles, clicking, scrolling, using the controls).

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);

const PROGRESSIONS = {
  // D lydian / major: bright and crystalline, the molecular scale.
  micro: [[50, 57, 62, 66, 69], [47, 54, 59, 62, 66], [43, 50, 57, 59, 64], [45, 52, 57, 61, 64]],
  // D minor colours: cells and synapses.
  cell: [[38, 50, 57, 60, 64], [41, 53, 57, 60, 65], [46, 53, 58, 62, 65], [43, 50, 55, 58, 62]],
  // D dorian movement: regions and circuits.
  region: [[38, 50, 57, 59, 64], [43, 50, 55, 59, 62], [40, 52, 55, 59, 62], [45, 52, 57, 59, 64]],
  // Open suspended major: the whole brain, the body, the world.
  mind: [[38, 50, 57, 62, 64, 69], [46, 53, 58, 62, 65], [43, 50, 57, 62, 66], [45, 52, 57, 61, 64]],
};
const SCALE = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86, 88];

// Per page: harmony, brightness (Hz), spike rate (per s), shimmer level, sub level.
const SCENES = [
  { prog: 'mind', cut: 1800, spikes: 2.0, shimmer: 0.5, sub: 0.8 },
  { prog: 'micro', cut: 3200, spikes: 4.0, shimmer: 0.9, sub: 0.4 },
  { prog: 'micro', cut: 2800, spikes: 3.0, shimmer: 0.7, sub: 0.5 },
  { prog: 'cell', cut: 2400, spikes: 3.0, shimmer: 0.5, sub: 0.6 },
  { prog: 'cell', cut: 2200, spikes: 2.5, shimmer: 0.4, sub: 0.7 },
  { prog: 'cell', cut: 2000, spikes: 5.0, shimmer: 0.5, sub: 0.7 },
  { prog: 'region', cut: 1900, spikes: 3.0, shimmer: 0.65, sub: 0.75, theta: true },
  { prog: 'region', cut: 1800, spikes: 2.0, shimmer: 0.45, sub: 0.85 },
  { prog: 'region', cut: 1700, spikes: 1.5, shimmer: 0.5, sub: 0.85 },
  { prog: 'mind', cut: 1700, spikes: 1.5, shimmer: 0.45, sub: 0.9 },
  { prog: 'mind', cut: 1600, spikes: 2.0, shimmer: 0.4, sub: 1.0 },
  { prog: 'mind', cut: 1400, spikes: 0.8, shimmer: 0.3, sub: 1.0, breath: true },
  { prog: 'mind', cut: 2000, spikes: 1.0, shimmer: 0.6, sub: 0.7 },
];

export class NeuroScore {
  constructor() {
    this.ctx = null;
    this.on = false;
    this.sceneIndex = 0;
    this.scene = SCENES[0];
    this.chordAt = 0;
    this.chordIdx = 0;
    this.chord = PROGRESSIONS.mind[0];
    this.nextSpike = 0;
    this.vol = { music: 0.7, sfx: 0.8 };
    this.lastHover = 0;
    this.lastUi = 0;
  }

  get supported() {
    return !!(window.AudioContext || window.webkitAudioContext);
  }

  // ---------- graph ----------
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

    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(5.5, 2.6);
    this.verbIn = ctx.createGain();
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.8;
    this.verbIn.connect(this.verb).connect(verbOut).connect(this.master);

    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = 0.48;
    const fb = ctx.createGain();
    fb.gain.value = 0.36;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 2600;
    this.delay.connect(dlp).connect(fb).connect(this.delay);
    const dOut = ctx.createGain();
    dOut.gain.value = 0.45;
    this.delay.connect(dOut);
    dOut.connect(this.verbIn);
    dOut.connect(this.master);

    // Music: everything passes a brightness filter that follows the level.
    this.music = ctx.createGain();
    this.music.gain.value = this.vol.music;
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = this.scene.cut;
    this.tone.Q.value = 0.5;
    this.tone.connect(this.music);
    this.music.connect(this.master);
    const mVerb = ctx.createGain();
    mVerb.gain.value = 0.9;
    this.music.connect(mVerb).connect(this.verbIn);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.vol.sfx;
    this.sfx.connect(this.master);
    const sVerb = ctx.createGain();
    sVerb.gain.value = 0.45;
    this.sfx.connect(sVerb).connect(this.verbIn);
    const sDel = ctx.createGain();
    sDel.gain.value = 0.22;
    this.sfx.connect(sDel).connect(this.delay);

    this.white = this.noise(2, false);
    this.brown = this.noise(6, true);

    this.startDrone();
    this.startShimmer();
    this.startBreath();
    this.timer = setInterval(() => this.tick(), 100);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else if (this.on) this.ctx.resume();
    });
  }

  impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        lp += (Math.random() * 2 - 1 - lp) * (0.12 + 0.6 * (1 - t));
        d[i] = lp * Math.pow(1 - t, decay) * (i < 300 ? i / 300 : 1);
      }
    }
    return buf;
  }

  noise(seconds, brown) {
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

  pan(x) {
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (p) p.pan.value = Math.max(-1, Math.min(1, x));
    return p;
  }

  // Route a node to a bus, through an optional panner.
  out(node, bus, x = 0) {
    const p = x ? this.pan(x) : null;
    if (p) node.connect(p).connect(bus);
    else node.connect(bus);
  }

  // ---------- continuous layers ----------
  startDrone() {
    const ctx = this.ctx;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.06 * this.scene.sub;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const amt = ctx.createGain();
    amt.gain.value = 0.02;
    lfo.connect(amt).connect(this.droneGain.gain);
    lfo.start();
    [[midi(26), 'sine', 1], [midi(38), 'sine', 0.55], [midi(45), 'triangle', 0.14]].forEach(([f, type, g]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = rand(-4, 4);
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(this.droneGain);
      o.start();
    });
    this.droneGain.connect(this.tone);
  }

  // High glassy partials. In the hippocampus their amplitude flutters at ~6 Hz (theta).
  startShimmer() {
    const ctx = this.ctx;
    this.shimmer = ctx.createGain();
    this.shimmer.gain.value = 0.012 * this.scene.shimmer;
    this.thetaDepth = ctx.createGain();
    this.thetaDepth.gain.value = 0;
    const theta = ctx.createOscillator();
    theta.frequency.value = 6.2;
    theta.connect(this.thetaDepth).connect(this.shimmer.gain);
    theta.start();
    this.shimmerOsc = [86, 90, 93, 98].map((m, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = midi(m);
      const g = ctx.createGain();
      g.gain.value = 0.5 / (i + 1);
      const l = ctx.createOscillator();
      l.frequency.value = rand(0.05, 0.15);
      const la = ctx.createGain();
      la.gain.value = 0.35 / (i + 1);
      l.connect(la).connect(g.gain);
      l.start();
      o.connect(g).connect(this.shimmer);
      o.start();
      return o;
    });
    this.shimmer.connect(this.tone);
  }

  startBreath() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.brown;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.7;
    this.breath = ctx.createGain();
    this.breath.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 1 / 4.8;
    this.breathDepth = ctx.createGain();
    this.breathDepth.gain.value = 0;
    lfo.connect(this.breathDepth).connect(this.breath.gain);
    lfo.start();
    src.connect(bp).connect(this.breath).connect(this.tone);
    src.start();
  }

  padChord(notes, when, dur) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.075, when + 4);
    g.gain.setValueAtTime(0.075, when + dur - 5);
    g.gain.linearRampToValueAtTime(0, when + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 2;
    const cut = this.scene.cut * 0.5;
    f.frequency.setValueAtTime(cut * 0.6, when);
    f.frequency.linearRampToValueAtTime(cut * 1.3, when + dur * 0.5);
    f.frequency.linearRampToValueAtTime(cut * 0.7, when + dur);
    notes.forEach((m, k) => {
      for (const [type, det] of [['triangle', -7], ['sine', 6]]) {
        const o = ctx.createOscillator();
        o.type = k === 0 ? 'sine' : type;
        o.frequency.value = midi(m);
        o.detune.value = det + rand(-3, 3);
        const og = ctx.createGain();
        og.gain.value = (k === 0 ? 1 : 0.6) / notes.length;
        o.connect(og).connect(f);
        o.start(when);
        o.stop(when + dur + 0.1);
      }
    });
    f.connect(g).connect(this.tone);
  }

  // A single spike heard through an amplifier: a tiny band-passed click.
  spike(when, gain = 0.03, bus = this.tone, x = rand(-0.8, 0.8)) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = rand(1800, 4200);
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.0008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.012);
    src.connect(bp).connect(g);
    this.out(g, bus, x);
    src.start(when, Math.random() * 1.5);
    src.stop(when + 0.02);
  }

  // ---------- instruments ----------
  pluck(m, when, gain = 0.06, x = 0, decay = 1.6, bus = this.sfx) {
    const ctx = this.ctx;
    const f = midi(m);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    [[1, 'sine', 1], [2, 'triangle', 0.25], [3.01, 'sine', 0.08]].forEach(([ratio, type, amp]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * ratio;
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(when);
      o.stop(when + decay + 0.05);
    });
    this.out(g, bus, x);
  }

  bell(m, when, gain = 0.05, x = 0, bus = this.sfx) {
    const ctx = this.ctx;
    const f = midi(m);
    const outG = ctx.createGain();
    outG.gain.value = gain;
    [[1, 1, 4.2], [2.756, 0.35, 2.2], [5.404, 0.12, 1.1]].forEach(([ratio, amp, dec]) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(amp, when + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dec);
      o.connect(g).connect(outG);
      o.start(when);
      o.stop(when + dec + 0.05);
    });
    this.out(outG, bus, x);
  }

  // The rising "zip" of an action potential.
  zip(when, gain = 0.05, x = 0, up = true) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(up ? 180 : 900, when);
    o.frequency.exponentialRampToValueAtTime(up ? 1100 : 160, when + 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
    o.connect(g);
    this.out(g, this.sfx, x);
    o.start(when);
    o.stop(when + 0.25);
  }

  thump(when, f0 = 62, gain = 0.18, dur = 0.35) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0 * 1.6, when);
    o.frequency.exponentialRampToValueAtTime(f0, when + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g).connect(this.sfx);
    o.start(when);
    o.stop(when + dur + 0.05);
  }

  whoosh(when, f0, f1, dur = 1.1, gain = 0.06, x = 0) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2.2;
    bp.frequency.setValueAtTime(f0, when);
    bp.frequency.exponentialRampToValueAtTime(f1, when + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(bp).connect(g);
    this.out(g, this.sfx, x);
    src.start(when, Math.random());
    src.stop(when + dur + 0.05);
  }

  swell(m, when, gain = 0.05, dur = 3.5, bus = this.sfx) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + dur * 0.45);
    g.gain.linearRampToValueAtTime(0, when + dur);
    [0, 7, 12].forEach((iv, k) => {
      const o = ctx.createOscillator();
      o.type = k ? 'sine' : 'triangle';
      o.frequency.value = midi(m + iv);
      o.detune.value = rand(-6, 6);
      const og = ctx.createGain();
      og.gain.value = 1 / (k + 1.5);
      o.connect(og).connect(g);
      o.start(when);
      o.stop(when + dur + 0.05);
    });
    g.connect(bus);
  }

  chordTone(i) {
    const c = this.chord;
    return c[Math.min(c.length - 1, 1 + (i % (c.length - 1)))] + 12;
  }

  // ---------- events synced with the animations ----------
  event(name, k = 0) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + 0.03;
    const S = SCALE;
    switch (name) {
      case 'ap':
        this.zip(t, 0.045, -0.1);
        this.thump(t, 70, 0.08, 0.25);
        this.bell(this.chordTone(this.chordIdx) + 12, t + 0.05, 0.03, 0.15);
        break;
      case 'influx':
        this.whoosh(t, 3000, 500, 1.4, 0.035, -0.4);
        break;
      case 'phos':
        this.pluck(S[k % S.length], t, 0.035, (k / 11) * 1.4 - 0.7, 1.2);
        break;
      case 'dephos':
        this.whoosh(t, 1800, 300, 1.6, 0.02);
        this.pluck(S[0] - 12, t + 0.1, 0.03, 0, 2.4);
        break;
      case 'grow':
        this.bell(S[2 + ((k * 2) % 5)], t, 0.03, (k - 1.5) * 0.4);
        break;
      case 'node':
        this.pluck(S[3 + k] + 12, t, 0.018, (k / 7) * 1.4 - 0.7, 0.35);
        this.spike(t, 0.03, this.sfx, (k / 7) * 1.4 - 0.7);
        break;
      case 'wave':
        this.swell(this.chord[1] + 12, t, 0.025, 4);
        break;
      case 'release':
        this.spike(t, 0.05, this.sfx, 0);
        this.pluck(S[5], t, 0.015, 0, 0.5);
        break;
      case 'burst':
        for (let i = 0; i < 40; i++) this.spike(t + i * 0.04, 0.035 + i * 0.0006, this.sfx, rand(-0.3, 0.3));
        this.whoosh(t, 400, 2600, 1.6, 0.025);
        break;
      case 'ltp':
        [0, 2, 4, 7].forEach((d, i) => this.pluck(S[d], t + i * 0.09, 0.04, -0.3 + i * 0.2, 1.8));
        this.bell(S[7] + 12, t + 0.4, 0.03);
        break;
      case 'recall':
        this.chord.slice(1).forEach((m, i) => this.pluck(m + 12, t + i * 0.035, 0.03, -0.5 + i * 0.25, 2.4));
        this.bell(this.chord[2] + 24, t + 0.15, 0.025);
        break;
      case 'station':
        this.pluck([62, 66, 69, 73, 76][k % 5], t, 0.04, (k / 4) * 1.2 - 0.6, 1.4);
        break;
      case 'ripple':
        for (let i = 0; i < 8; i++) this.pluck(S[6 + (i % 4)] + 12, t + i * 0.028, 0.012, rand(-0.5, 0.5), 0.3);
        break;
      case 'loop':
        this.pluck([69, 62, 64, 66][k % 4], t, 0.04, [0.5, 0, -0.4, -0.1][k % 4], 1.5);
        break;
      case 'mod':
        if (k === 0) this.bell(50, t, 0.05, 0.2);
        else if (k === 1) this.swell(57, t, 0.03, 3);
        else if (k === 2) this.pluck(81, t, 0.035, 0.4, 0.9);
        else this.bell(74, t, 0.03, -0.3);
        break;
      case 'glide':
        this.whoosh(t, 600, 1400, 2.2, 0.012, rand(-0.6, 0.6));
        break;
      case 'switch':
        this.bell(69, t, 0.035, -0.2);
        this.bell(76, t + 0.12, 0.03, 0.2);
        break;
      case 'cen':
        [64, 66, 69].forEach((m, i) => this.pluck(m + 12, t + i * 0.11, 0.03, 0.3, 1));
        break;
      case 'dmn':
        this.swell(50, t, 0.04, 4.5);
        break;
      case 'slowwave':
        this.swell(38, t, 0.05, 4.5);
        this.whoosh(t, 200, 900, 3, 0.012);
        break;
      case 'heart':
        this.thump(t, 52, 0.16, 0.3);
        this.thump(t + 0.28, 46, 0.11, 0.3);
        break;
      case 'hpa':
        this.bell(45, t, 0.03, 0);
        break;
      case 'swell':
        this.swell(this.chord[0] + 12, t, 0.03, 5);
        break;
      default:
        break;
    }
  }

  // ---------- interaction ----------
  // Stroking the particles: a crackle whose density follows pointer speed.
  hover(speed, x) {
    if (!this.ready()) return;
    const now = this.ctx.currentTime;
    if (now - this.lastHover < 0.03) return;
    const p = Math.min(1, speed * 0.9);
    if (Math.random() > p) return;
    this.lastHover = now;
    this.spike(now + 0.005, 0.02 + 0.03 * p, this.sfx, x);
    if (Math.random() < 0.18 * p) this.pluck(SCALE[6 + Math.floor(Math.random() * 6)], now + 0.01, 0.012, x, 0.4);
  }

  // A click fires an action potential; rapid clicks potentiate (level 1–6).
  fire(level, x) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + 0.01;
    this.zip(t, 0.05, x);
    this.pluck(SCALE[Math.min(SCALE.length - 1, (level - 1) * 2)], t + 0.02, 0.045, x, 1.6);
    if (level >= 3) this.bell(SCALE[Math.min(SCALE.length - 1, level + 3)], t + 0.06, 0.02 + level * 0.004, x);
    if (level >= 5) {
      this.chord.slice(2).forEach((m, i) => this.pluck(m + 24, t + 0.1 + i * 0.05, 0.02, x, 1.8));
    }
  }

  transition(forward) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + 0.02;
    this.whoosh(t, forward ? 260 : 2400, forward ? 2400 : 260, 1.2, 0.045, forward ? 0.3 : -0.3);
    this.thump(t + 0.05, forward ? 48 : 58, 0.06, 0.6);
  }

  ui(kind, v = 0) {
    if (!this.ready()) return;
    const now = this.ctx.currentTime;
    if (kind === 'slide' && now - this.lastUi < 0.045) return;
    this.lastUi = now;
    const t = now + 0.005;
    switch (kind) {
      case 'hover':
        this.pluck(88, t, 0.008, 0, 0.12);
        break;
      case 'click':
        this.pluck(76, t, 0.03, 0, 0.35);
        break;
      case 'pick':
        this.pluck(74, t, 0.025, -0.1, 0.4);
        this.pluck(81, t + 0.06, 0.02, 0.1, 0.5);
        break;
      case 'slide':
        this.pluck(62 + Math.round(v * 24), t, 0.014, v * 1.2 - 0.6, 0.18);
        break;
      case 'open':
        this.whoosh(t, 500, 2600, 0.45, 0.025);
        this.pluck(81, t + 0.12, 0.02, 0, 0.6);
        break;
      case 'close':
        this.whoosh(t, 2600, 500, 0.4, 0.02);
        break;
      case 'reset':
        [81, 76, 69].forEach((m, i) => this.pluck(m, t + i * 0.07, 0.025, 0, 0.5));
        break;
      default:
        break;
    }
  }

  ready() {
    return this.on && this.ctx && this.ctx.state === 'running';
  }

  // ---------- clock ----------
  tick() {
    if (!this.ready()) return;
    const now = this.ctx.currentTime;
    if (now + 0.5 >= this.chordAt) {
      const prog = PROGRESSIONS[this.scene.prog];
      const at = Math.max(this.chordAt, now + 0.05);
      this.chord = prog[this.chordIdx % prog.length];
      this.padChord(this.chord, at, 14);
      this.chordIdx++;
      this.chordAt = at + 9.5;
    }
    // Poisson spike train for the next 250 ms.
    const rate = this.scene.spikes;
    if (this.nextSpike < now) this.nextSpike = now + 0.05;
    while (this.nextSpike < now + 0.25) {
      const burst = Math.random() < 0.08 ? 2 + Math.floor(Math.random() * 3) : 1;
      for (let i = 0; i < burst; i++) this.spike(this.nextSpike + i * rand(0.006, 0.012), rand(0.01, 0.026));
      this.nextSpike += -Math.log(1 - Math.random()) / rate;
    }
  }

  setScene(i) {
    const idx = Math.max(0, Math.min(SCENES.length - 1, i));
    if (idx === this.sceneIndex && this.ctx) return;
    const prevProg = this.scene.prog;
    this.sceneIndex = idx;
    this.scene = SCENES[idx];
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.tone.frequency.setTargetAtTime(this.scene.cut, now, 1.4);
    this.droneGain.gain.setTargetAtTime(0.06 * this.scene.sub, now, 2);
    this.shimmer.gain.setTargetAtTime(0.012 * this.scene.shimmer, now, 1.5);
    this.thetaDepth.gain.setTargetAtTime(this.scene.theta ? 0.012 * this.scene.shimmer : 0, now, 1);
    this.breathDepth.gain.setTargetAtTime(this.scene.breath ? 0.05 : 0, now, 1.5);
    this.breath.gain.setTargetAtTime(this.scene.breath ? 0.05 : 0, now, 1.5);
    // A new harmony starts soon after a change of scale.
    if (prevProg !== this.scene.prog) this.chordAt = Math.min(this.chordAt, now + 1.5);
  }

  setVolumes(music, sfx) {
    this.vol = { music, sfx };
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.music.gain.setTargetAtTime(music, now, 0.08);
    this.sfx.gain.setTargetAtTime(sfx, now, 0.05);
  }

  async start() {
    if (!this.supported) return false;
    if (!this.ctx) this.build();
    await this.ctx.resume();
    this.on = true;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(1.6, now, 1.2);
    if (this.chordAt < now) this.chordAt = now + 0.1;
    return true;
  }

  stop() {
    if (!this.ctx) return;
    this.on = false;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0, now, 0.3);
    clearTimeout(this.suspendTimer);
    this.suspendTimer = setTimeout(() => {
      if (!this.on) this.ctx.suspend();
    }, 1600);
  }
}
