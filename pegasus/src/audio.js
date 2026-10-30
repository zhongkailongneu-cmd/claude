// Generative BGM, synthesised live with the Web Audio API (nothing is pre-recorded, no licences).
//
// The reference clip carries a dark, cinematic bed: most of its energy sits in a 35-65 Hz
// sub-bass drone with a thin band of air above 4 kHz and a very slow (~1.4 s) pulse. This
// score follows that recipe and makes it react to the page:
//   · sub drone + slow heartbeat pulse       (grows as the story deepens)
//   · detuned saw pad, one chord per ~16 s   (cut-off opens with scroll progress)
//   · glassy bell notes through a stereo delay and a long reverb
//   · filtered "air" noise                   (the 4-8 kHz shimmer)
//   · scroll-speed whoosh and a soft boom each time a new scene locks in
// Each colour theme has its own key, voicings, scale and brightness, and switching theme
// plays a short chime in the new key.

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export const MUSIC = {
  // D minor, suspended and lydian-tinted: the original dark violet mood.
  violet: {
    root: 26, // D1, 36.7 Hz
    chords: [[50, 57, 60, 64, 65], [46, 53, 57, 60, 64], [43, 50, 55, 58, 62], [45, 52, 57, 62, 67]],
    scale: [62, 65, 67, 69, 72, 74, 77, 79, 81, 84],
    cut: 520, bright: 1.0, shimmer: 1.0, pulse: 1.0, detune: 7,
  },
  // F lydian: calm, crystalline, steel-blue.
  loyel: {
    root: 29, // F1, 43.7 Hz
    chords: [[41, 53, 57, 60, 64, 67], [38, 50, 57, 60, 64, 67], [46, 53, 57, 62, 64], [43, 55, 60, 62, 67]],
    scale: [65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84],
    cut: 680, bright: 1.25, shimmer: 1.15, pulse: 0.75, detune: 5,
  },
  // E lydian: open, glowing, northern-lights.
  aurora: {
    root: 28, // E1, 41.2 Hz
    chords: [[40, 52, 56, 59, 63], [49, 56, 59, 63, 64], [45, 52, 56, 59, 63], [42, 54, 57, 61, 64]],
    scale: [64, 66, 68, 71, 73, 76, 78, 80, 83, 85, 88],
    cut: 760, bright: 1.45, shimmer: 1.4, pulse: 0.6, detune: 9,
  },
};

export class Score {
  constructor() {
    this.ctx = null;
    this.on = false;
    this.started = false;
    this.level = 0;
    this.avg = 0;
    this.onChange = null;
    this.themeId = 'violet';
    this.m = MUSIC.violet;
    this.progress = 0;
    this.energy = 0;
    this.sceneIdx = 0;
    this.nextPulse = 0;
    this.nextNote = 0;
    this.nextChord = 0;
    this.chordIdx = 0;
    this.activePads = [];
    this.timer = 0;
  }

  get supported() { return !!(window.AudioContext || window.webkitAudioContext); }

  // Builds the node graph on any context, real or offline (used by the render test).
  build(ctx) {
    this.ctx = ctx;
    const sr = ctx.sampleRate;

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 18; comp.ratio.value = 3.2; comp.attack.value = 0.02; comp.release.value = 0.4;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.82;
    this.master.connect(this.analyser);
    this.bins = new Uint8Array(this.analyser.frequencyBinCount);

    this.dry = ctx.createGain();
    this.dry.gain.value = 0.85;
    this.dry.connect(this.master);

    // reverb: noise with a darkening, exponentially decaying tail
    const len = Math.floor(sr * 4.8);
    const ir = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        lp += ((Math.random() * 2 - 1) - lp) * (0.62 * (1 - t) + 0.035);
        d[i] = lp * Math.pow(1 - t, 2.7) * (i < sr * 0.02 ? i / (sr * 0.02) : 1);
      }
    }
    this.verb = ctx.createConvolver();
    this.verb.buffer = ir;
    this.revSend = ctx.createGain();
    this.revSend.gain.value = 1;
    const revOut = ctx.createGain();
    revOut.gain.value = 0.95;
    this.revSend.connect(this.verb);
    this.verb.connect(revOut);
    revOut.connect(this.master);

    // ping-pong style stereo delay for the bells
    this.delSend = ctx.createGain();
    this.delSend.gain.value = 1;
    for (const [time, pan] of [[0.37, -0.7], [0.53, 0.7]]) {
      const dl = ctx.createDelay(1.5);
      dl.delayTime.value = time;
      const fb = ctx.createGain();
      fb.gain.value = 0.4;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 3400;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 280;
      const pn = ctx.createStereoPanner();
      pn.pan.value = pan;
      this.delSend.connect(dl);
      dl.connect(lp); lp.connect(hp); hp.connect(fb); fb.connect(dl);
      hp.connect(pn); pn.connect(this.master); pn.connect(this.revSend);
    }

    // ---- sub drone: sine at the root, a triangle an octave up, and a quiet fifth ----------------
    this.drone = [];
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.0;
    droneGain.connect(this.dry);
    this.droneGain = droneGain;
    const mk = (type, mult, vol, lpf) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = midi(this.m.root) * mult;
      const g = ctx.createGain();
      g.gain.value = vol;
      if (lpf) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = lpf;
        o.connect(f); f.connect(g);
      } else o.connect(g);
      g.connect(droneGain);
      o.start();
      this.drone.push(o);
    };
    mk('sine', 1, 0.5);
    mk('triangle', 2, 0.30, 260);
    mk('sawtooth', 2, 0.07, 330);
    mk('sine', 3, 0.12);
    mk('sine', 4, 0.03);
    const breathe = ctx.createOscillator();
    breathe.frequency.value = 0.07;
    const bg = ctx.createGain();
    bg.gain.value = 0.12;
    breathe.connect(bg); bg.connect(droneGain.gain);
    breathe.start();

    // ---- pad bus ----------------------------------------------------------------------------------
    this.padBus = ctx.createGain();
    this.padBus.gain.value = 0.9;
    this.padBus.connect(this.dry);
    const padVerb = ctx.createGain();
    padVerb.gain.value = 0.75;
    this.padBus.connect(padVerb); padVerb.connect(this.revSend);

    // ---- air noise ------------------------------------------------------------------------------------
    const nlen = sr * 2;
    const nb = ctx.createBuffer(1, nlen, sr);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
    const air = ctx.createBufferSource();
    air.buffer = nb; air.loop = true;
    const ahp = ctx.createBiquadFilter();
    ahp.type = 'highpass'; ahp.frequency.value = 4200;
    const abp = ctx.createBiquadFilter();
    abp.type = 'bandpass'; abp.frequency.value = 6400; abp.Q.value = 0.6;
    this.airGain = ctx.createGain();
    this.airGain.gain.value = 0.03;
    air.connect(ahp); ahp.connect(abp); abp.connect(this.airGain);
    this.airGain.connect(this.revSend);
    this.airGain.connect(this.dry);
    const airLfo = ctx.createOscillator();
    airLfo.frequency.value = 0.09;
    const airLfoG = ctx.createGain();
    airLfoG.gain.value = 0.014;
    airLfo.connect(airLfoG); airLfoG.connect(this.airGain.gain);
    air.start(); airLfo.start();

    // ---- scroll whoosh ----------------------------------------------------------------------------------
    const wn = ctx.createBufferSource();
    wn.buffer = nb; wn.loop = true;
    this.whooshF = ctx.createBiquadFilter();
    this.whooshF.type = 'bandpass'; this.whooshF.frequency.value = 400; this.whooshF.Q.value = 1.1;
    this.whooshG = ctx.createGain();
    this.whooshG.gain.value = 0;
    wn.connect(this.whooshF); this.whooshF.connect(this.whooshG);
    this.whooshG.connect(this.dry); this.whooshG.connect(this.revSend);
    wn.start();

    this.t0 = ctx.currentTime;
    this.nextPulse = ctx.currentTime + 0.4;
    this.nextNote = ctx.currentTime + 3;
    this.nextChord = ctx.currentTime;
  }

  // ---- voices -----------------------------------------------------------------------------------------------
  pad(chord, t, dur) {
    const ctx = this.ctx;
    const set = { stop: t + dur + 6.5 };
    const out = ctx.createGain();
    set.out = out;
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.2, t + 4.2);
    out.gain.setValueAtTime(0.2, t + dur - 1);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur + 5.5);
    out.connect(this.padBus);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = this.padCut();
    f.Q.value = 0.5;
    f.connect(out);
    this.padFilters = this.padFilters || new Set();
    this.padFilters.add(f);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rand(0.05, 0.11);
    const lg = ctx.createGain();
    lg.gain.value = 260;
    lfo.connect(lg); lg.connect(f.frequency);
    lfo.start(t); lfo.stop(set.stop);
    for (const n of chord) {
      for (const dt of [-1, 1]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midi(n);
        o.detune.value = dt * this.m.detune + rand(-2, 2);
        const g = ctx.createGain();
        g.gain.value = 0.11 / Math.sqrt(chord.length);
        o.connect(g); g.connect(f);
        o.start(t); o.stop(set.stop);
      }
    }
    setTimeout(() => this.padFilters.delete(f), (set.stop - ctx.currentTime + 0.5) * 1000);
    return set;
  }

  padCut() { return (this.m.cut + 1300 * this.energy) * this.m.bright; }

  kick(t, level) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(96, t);
    o.frequency.exponentialRampToValueAtTime(37, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    o.connect(g); g.connect(this.dry);
    o.start(t); o.stop(t + 0.9);
  }

  bell(freq, t, vol = 0.08, sendDelay = 0.7) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = freq * 2.003;
    const o3 = ctx.createOscillator(); o3.type = 'sine'; o3.frequency.value = freq * 3.01;
    const g2 = ctx.createGain(); g2.gain.value = 0.28;
    const g3 = ctx.createGain(); g3.gain.value = 0.1;
    o1.connect(g); o2.connect(g2); g2.connect(g); o3.connect(g3); g3.connect(g);
    const pn = ctx.createStereoPanner();
    pn.pan.value = rand(-0.5, 0.5);
    g.connect(pn);
    pn.connect(this.dry);
    const ds = ctx.createGain(); ds.gain.value = sendDelay; pn.connect(ds); ds.connect(this.delSend);
    const rs = ctx.createGain(); rs.gain.value = 0.9; pn.connect(rs); rs.connect(this.revSend);
    for (const o of [o1, o2, o3]) { o.start(t); o.stop(t + 3.6); }
  }

  boom(t, level = 0.5) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    o.connect(g); g.connect(this.dry); g.connect(this.revSend);
    o.start(t); o.stop(t + 2.3);
  }

  // Lookahead scheduler: queue everything that should sound before `until`.
  scheduleUntil(until) {
    const m = this.m;
    const now = this.ctx.currentTime;
    this.activePads = this.activePads.filter((p) => p.stop > now);
    while (this.nextChord < until) {
      const chord = m.chords[this.chordIdx % m.chords.length];
      this.activePads.push(this.pad(chord, this.nextChord, 16));
      this.chordIdx++;
      this.nextChord += 16;
    }
    const pulseLevel = (0.1 + 0.34 * this.energy) * m.pulse;
    while (this.nextPulse < until) {
      this.kick(this.nextPulse, pulseLevel);
      // a faint second beat, like a distant heart
      if (this.energy > 0.15) this.kick(this.nextPulse + 0.46, pulseLevel * 0.42);
      this.nextPulse += 1.44;
    }
    while (this.nextNote < until) {
      const base = pick(m.scale);
      const arp = Math.random() < 0.28;
      const vol = rand(0.045, 0.09) * (0.8 + 0.5 * m.shimmer);
      if (arp) {
        const i = Math.max(0, m.scale.indexOf(base));
        for (let k = 0; k < 4; k++) this.bell(midi(m.scale[Math.min(m.scale.length - 1, i + k)] + (Math.random() < 0.2 ? 12 : 0)), this.nextNote + k * 0.19, vol * (1 - k * 0.12));
      } else {
        this.bell(midi(base), this.nextNote, vol);
        if (Math.random() < 0.3) this.bell(midi(base + 12), this.nextNote + 0.02, vol * 0.4);
      }
      const rate = (0.55 + 0.9 * this.energy) * m.shimmer;
      this.nextNote += rand(2.0, 6.2) / rate;
    }
  }

  // ---- public API --------------------------------------------------------------------------------------------------
  async start() {
    if (this.started) { this.setOn(true); return; }
    if (!this.supported) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.build(new AC({ latencyHint: 'playback' }));
    this.started = true;
    await this.ctx.resume();
    this.scheduleUntil(this.ctx.currentTime + 2.5);
    this.timer = setInterval(() => this.ctx && this.ctx.state === 'running' && this.scheduleUntil(this.ctx.currentTime + 2.5), 400);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else if (this.on) this.ctx.resume();
    });
    this.setOn(true);
  }

  setOn(on) {
    if (!this.ctx) return;
    this.on = on;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(on ? 0.95 : 0, t, on ? 1.4 : 0.25);
    this.droneGain.gain.setTargetAtTime(on ? 0.34 : 0, t, on ? 2.0 : 0.25);
    if (on && this.ctx.state !== 'running') this.ctx.resume();
    if (!on) setTimeout(() => { if (!this.on && this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }, 1400);
    this.onChange && this.onChange(on);
  }

  toggle() { this.setOn(!this.on); }

  setTheme(id, { chime = true } = {}) {
    this.themeId = id;
    this.m = MUSIC[id] || MUSIC.violet;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // glide the drone to the new key and start the new key's chords from the next bar
    this.drone.forEach((o, i) => o.frequency.setTargetAtTime(midi(this.m.root) * [1, 2, 2, 3, 4][i], t, 1.2));
    this.chordIdx = 0;
    this.nextChord = Math.max(t + 0.2, t);
    // let the old key's chords fade out instead of clashing with the new key
    for (const p of this.activePads) { p.out.gain.cancelScheduledValues(t); p.out.gain.setTargetAtTime(0.0001, t, 0.7); }
    this.activePads = [];
    if (this.on && chime) {
      const s = this.m.scale;
      [0, 2, 4, 6].forEach((k, i) => this.bell(midi(s[Math.min(s.length - 1, k + 1)] + 12), t + 0.05 + i * 0.13, 0.07, 0.9));
    }
  }

  update(dt, p, speed) {
    this.progress = p;
    this.energy = smooth(0, 3.6, p) * (1 - smooth(5.9, 7.2, p) * 0.55);
    if (!this.ctx || !this.on) { this.level *= 0.9; return; }
    const t = this.ctx.currentTime;
    const sp = clamp(speed / 3.2);
    this.whooshG.gain.setTargetAtTime(sp * 0.2 * this.m.bright, t, 0.12);
    this.whooshF.frequency.setTargetAtTime(260 + sp * 2600, t, 0.12);
    for (const f of this.padFilters || []) f.frequency.setTargetAtTime(this.padCut(), t, 0.8);
    this.airGain.gain.setTargetAtTime(0.026 + 0.022 * this.energy * this.m.bright, t, 1.5);
    // a soft boom + bell when a new scene locks in
    const idx = Math.round(clamp(p, 0, 7));
    if (idx !== this.sceneIdx) {
      if (Math.abs(p - idx) < 0.25) {
        this.sceneIdx = idx;
        this.boom(t + 0.02, 0.32 + 0.08 * Math.min(idx, 5));
        const s = this.m.scale;
        this.bell(midi(s[(idx * 2) % s.length] + 12), t + 0.15, 0.08, 0.9);
      }
    }
    // loudness of the low band drives the fibres' glow
    // transient energy in the lowest bins relative to its own slow average -> kick-shaped pulses
    this.analyser.getByteFrequencyData(this.bins);
    const cur = (this.bins[0] + this.bins[1]) / 510;
    this.avg += (cur - this.avg) * Math.min(1, dt * 0.9);
    const lv = clamp((cur - this.avg) * 7);
    this.level += (lv - this.level) * Math.min(1, dt * (lv > this.level ? 14 : 4));
  }
}
