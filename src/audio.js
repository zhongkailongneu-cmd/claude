// Generative deep-sea score, synthesised live with the Web Audio API.
// Layers: slow detuned pad chords, a breathing sub drone, filtered ocean
// rumble, glassy bells through a long delay, distant whale song, sonar pings,
// bubbles and (for the eel) electric crackle. Each page sets a "scene" that
// changes harmony, how muffled the water sounds and how often each voice
// appears. Nothing is pre-recorded, so the score never loops exactly.

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);

const PROGRESSIONS = {
  // D dorian, open and suspended: wonder near the surface.
  sunlit: [[50, 57, 60, 64, 65], [43, 50, 57, 59, 62], [41, 48, 52, 57, 64], [48, 55, 62, 64, 67]],
  // D minor with a lydian #11 colour: the twilight zone.
  twilight: [[38, 50, 57, 64, 65], [46, 53, 57, 64], [43, 50, 58, 62, 69], [45, 52, 55, 62, 67]],
  // D phrygian, the flat second pressing on the root: the midnight zone.
  midnight: [[38, 50, 51, 57, 65], [39, 51, 55, 58, 62], [43, 50, 55, 58, 65], [36, 48, 51, 55, 62]],
};
const BELL_SCALE = [62, 65, 67, 69, 72, 74, 77, 79, 81];

// Per page: harmony, water cutoff (Hz), and [min, max] seconds between events.
const SCENES = [
  { prog: 'sunlit', cut: 2600, bell: [3, 7], whale: [40, 70], ping: null, bubble: [3, 7], zap: null, sub: 0.6 },
  { prog: 'sunlit', cut: 2400, bell: [3.5, 8], whale: [45, 80], ping: null, bubble: [2.5, 6], zap: null, sub: 0.6 },
  { prog: 'sunlit', cut: 2100, bell: [3, 7], whale: [35, 60], ping: null, bubble: [5, 10], zap: null, sub: 0.7 },
  { prog: 'twilight', cut: 1600, bell: [6, 12], whale: [7, 13], ping: [40, 70], bubble: [12, 22], zap: null, sub: 0.85 },
  { prog: 'twilight', cut: 1400, bell: [1.8, 4.5], whale: [40, 80], ping: [22, 40], bubble: [14, 26], zap: null, sub: 0.9 },
  { prog: 'twilight', cut: 1250, bell: [1.4, 3.5], whale: [50, 90], ping: [18, 32], bubble: null, zap: null, sub: 0.95 },
  { prog: 'midnight', cut: 1000, bell: [5, 10], whale: null, ping: [10, 20], bubble: null, zap: null, sub: 1 },
  { prog: 'midnight', cut: 1150, bell: [6, 12], whale: null, ping: [25, 45], bubble: null, zap: [1.4, 3.8], sub: 1 },
  { prog: 'sunlit', cut: 1900, bell: [2.5, 6], whale: [25, 50], ping: [40, 70], bubble: [6, 12], zap: null, sub: 0.7 },
];

export class DeepScore {
  constructor() {
    this.ctx = null;
    this.on = false;
    this.scene = SCENES[0];
    this.sceneIndex = 0;
    this.next = {};
    this.chordAt = 0;
    this.chordIdx = 0;
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
    comp.threshold.value = -20;
    comp.knee.value = 14;
    comp.ratio.value = 3;
    comp.attack.value = 0.03;
    comp.release.value = 0.5;
    this.master.connect(comp).connect(ctx.destination);

    // Everything passes a low-pass "water" filter that closes as you descend.
    this.water = ctx.createBiquadFilter();
    this.water.type = 'lowpass';
    this.water.frequency.value = this.scene.cut;
    this.water.Q.value = 0.6;
    this.water.connect(this.master);

    this.dry = ctx.createGain();
    this.dry.gain.value = 0.7;
    this.dry.connect(this.water);

    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(7, 2.4);
    this.verbIn = ctx.createGain();
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.85;
    this.verbIn.connect(this.verb).connect(verbOut).connect(this.water);

    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = 0.62;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 1700;
    this.delay.connect(dlp).connect(fb).connect(this.delay);
    const dOut = ctx.createGain();
    dOut.gain.value = 0.5;
    this.delay.connect(dOut);
    dOut.connect(this.verbIn);
    dOut.connect(this.dry);

    this.padBus = this.bus(0.45, 0.75, 0);
    this.fxBus = this.bus(0.35, 0.9, 0.25);

    this.startDrone();
    this.startRumble();
    this.timer = setInterval(() => this.tick(), 200);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else if (this.on) this.ctx.resume();
    });
  }

  bus(dry, wet, delay) {
    const g = this.ctx.createGain();
    const d = this.ctx.createGain();
    d.gain.value = dry;
    const w = this.ctx.createGain();
    w.gain.value = wet;
    g.connect(d).connect(this.dry);
    g.connect(w).connect(this.verbIn);
    if (delay) {
      const s = this.ctx.createGain();
      s.gain.value = delay;
      g.connect(s).connect(this.delay);
    }
    return g;
  }

  // Long, dark reverb tail: noise that gets duller as it decays.
  impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        lp += (Math.random() * 2 - 1 - lp) * (0.08 + 0.6 * (1 - t));
        d[i] = lp * Math.pow(1 - t, decay) * (i < 400 ? i / 400 : 1);
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

  startDrone() {
    const ctx = this.ctx;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.07 * this.scene.sub;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.025;
    lfo.connect(lfoAmt).connect(this.droneGain.gain);
    lfo.start();
    [[midi(26), 'sine', 1], [midi(38), 'sine', 0.7], [midi(45), 'triangle', 0.18]].forEach(([f, type, g]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = rand(-4, 4);
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(this.droneGain);
      o.start();
    });
    this.droneGain.connect(this.dry);
  }

  startRumble() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(6, true);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 340;
    const g = ctx.createGain();
    g.gain.value = 0.11;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const amt = ctx.createGain();
    amt.gain.value = 0.06;
    lfo.connect(amt).connect(g.gain);
    lfo.start();
    src.connect(lp).connect(g).connect(this.dry);
    src.start();
  }

  chord(notes, when, dur) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.09, when + 4.5);
    g.gain.setValueAtTime(0.09, when + dur - 6);
    g.gain.linearRampToValueAtTime(0, when + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 3;
    const cut = this.scene.cut * 0.42;
    f.frequency.setValueAtTime(cut * 0.55, when);
    f.frequency.linearRampToValueAtTime(cut * 1.25, when + dur * 0.5);
    f.frequency.linearRampToValueAtTime(cut * 0.6, when + dur);
    notes.forEach((m, k) => {
      for (const det of [-9, 8]) {
        const o = ctx.createOscillator();
        o.type = k === 0 ? 'triangle' : 'sawtooth';
        o.frequency.value = midi(m);
        o.detune.value = det + rand(-3, 3);
        const og = ctx.createGain();
        og.gain.value = (k === 0 ? 0.9 : 0.55) / notes.length;
        o.connect(og).connect(f);
        o.start(when);
        o.stop(when + dur + 0.2);
      }
    });
    f.connect(g).connect(this.padBus);
  }

  bell(when) {
    const ctx = this.ctx;
    const deep = this.sceneIndex >= 6;
    const m = BELL_SCALE[Math.floor(Math.random() * BELL_SCALE.length)] + (deep ? -12 : Math.random() < 0.3 ? 12 : 0);
    const f = midi(m);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) pan.pan.value = rand(-0.7, 0.7);
    const out = ctx.createGain();
    out.gain.value = 0.9;
    [[1, 0.06, 4.5], [2.756, 0.022, 2.2], [5.404, 0.008, 1.1]].forEach(([ratio, amp, dec]) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(amp, when + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dec);
      o.connect(g).connect(out);
      o.start(when);
      o.stop(when + dec + 0.1);
    });
    if (pan) out.connect(pan).connect(this.fxBus);
    else out.connect(this.fxBus);
  }

  whale(when) {
    const ctx = this.ctx;
    const dur = rand(4, 7);
    const f0 = rand(70, 130);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, when);
    o.frequency.exponentialRampToValueAtTime(f0 * rand(1.5, 2.3), when + dur * 0.35);
    o.frequency.exponentialRampToValueAtTime(f0 * rand(0.65, 0.9), when + dur);
    const vib = ctx.createOscillator();
    vib.frequency.value = rand(3.5, 5.5);
    const vibAmt = ctx.createGain();
    vibAmt.gain.value = f0 * 0.025;
    vib.connect(vibAmt).connect(o.frequency);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3.5;
    bp.frequency.setValueAtTime(380, when);
    bp.frequency.linearRampToValueAtTime(880, when + dur * 0.4);
    bp.frequency.linearRampToValueAtTime(300, when + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.22, when + 1.2);
    g.gain.setValueAtTime(0.22, when + dur - 1.6);
    g.gain.linearRampToValueAtTime(0, when + dur);
    o.connect(bp).connect(g).connect(this.fxBus);
    o.start(when);
    vib.start(when);
    o.stop(when + dur + 0.1);
    vib.stop(when + dur + 0.1);
  }

  ping(when = this.ctx.currentTime + 0.02, gain = 0.09) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(midi(86), when);
    o.frequency.exponentialRampToValueAtTime(midi(85.6), when + 1.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 1.6);
    o.connect(g).connect(this.fxBus);
    o.start(when);
    o.stop(when + 1.7);
  }

  bubbles(when) {
    const ctx = this.ctx;
    const n = 2 + Math.floor(Math.random() * 6);
    let t = when;
    for (let i = 0; i < n; i++) {
      t += rand(0.04, 0.16);
      const o = ctx.createOscillator();
      o.type = 'sine';
      const f = rand(260, 700);
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * rand(2.4, 3.6), t + rand(0.05, 0.09));
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.035, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.connect(g).connect(this.dry);
      o.start(t);
      o.stop(t + 0.12);
    }
  }

  zap(when) {
    const ctx = this.ctx;
    const dur = rand(0.12, 0.38);
    const src = ctx.createBufferSource();
    src.buffer = this.zapBuf || (this.zapBuf = this.noiseBuffer(1, false));
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = rand(1800, 4200);
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    for (let t = 0; t < dur; t += 0.012) g.gain.setValueAtTime(Math.random() < 0.45 ? rand(0.02, 0.07) : 0, when + t);
    g.gain.setValueAtTime(0, when + dur);
    src.connect(bp).connect(g).connect(this.fxBus);
    src.start(when, Math.random() * 0.5);
    src.stop(when + dur + 0.05);

    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(rand(48, 70), when);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0, when);
    og.gain.linearRampToValueAtTime(0.05, when + 0.02);
    og.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.15);
    o.connect(lp).connect(og).connect(this.dry);
    o.start(when);
    o.stop(when + dur + 0.2);
  }

  tick() {
    if (!this.on || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (now + 0.5 >= this.chordAt) {
      const prog = PROGRESSIONS[this.scene.prog];
      const at = Math.max(this.chordAt, now + 0.05);
      this.chord(prog[this.chordIdx % prog.length], at, 15);
      this.chordIdx++;
      this.chordAt = at + 10.5;
    }
    const voices = { bell: (t) => this.bell(t), whale: (t) => this.whale(t), ping: (t) => this.ping(t), bubble: (t) => this.bubbles(t), zap: (t) => this.zap(t) };
    for (const [name, play] of Object.entries(voices)) {
      const range = this.scene[name];
      if (!range) continue;
      if (this.next[name] === undefined) this.next[name] = now + rand(range[0] * 0.3, range[1] * 0.6);
      if (now >= this.next[name]) {
        play(now + 0.08);
        this.next[name] = now + rand(range[0], range[1]);
      }
    }
  }

  setScene(i) {
    if (i === this.sceneIndex && this.ctx) return;
    this.sceneIndex = i;
    this.scene = SCENES[Math.max(0, Math.min(SCENES.length - 1, i))];
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.water.frequency.setTargetAtTime(this.scene.cut, now, 1.6);
    this.droneGain.gain.setTargetAtTime(0.07 * this.scene.sub, now, 2);
    // Pull voices that are now more frequent forward, so a scene is heard soon.
    for (const name of ['bell', 'whale', 'ping', 'bubble', 'zap']) {
      const range = this.scene[name];
      if (!range) continue;
      const soon = now + rand(0.5, Math.min(range[1], 4));
      if (this.next[name] === undefined || this.next[name] > soon) this.next[name] = soon;
    }
  }

  async start() {
    if (!this.supported) return false;
    if (!this.ctx) this.build();
    await this.ctx.resume();
    this.on = true;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(1.8, now, 1.4);
    if (this.chordAt < now) this.chordAt = now + 0.1;
    return true;
  }

  stop() {
    if (!this.ctx) return;
    this.on = false;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0, now, 0.35);
    clearTimeout(this.suspendTimer);
    this.suspendTimer = setTimeout(() => {
      if (!this.on) this.ctx.suspend();
    }, 1800);
  }
}
