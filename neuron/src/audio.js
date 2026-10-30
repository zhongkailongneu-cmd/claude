// "Ignite": a hot-blooded battle-anthem, synthesised live with the Web Audio API.
// Nothing is pre-recorded, so there are no licences to worry about.
//
//  · 150 BPM, 4/4, minor key, an 8-bar loop: i - VI - III - VII | i - VI - VII - V
//    (the "rising hero" progression: Am F C G | Am F G E in the original key)
//  · drums: kick, snare, hats, taiko "don / ka" and fills, crash cymbals
//  · driving eighth-note saw bass, distorted power-chord chugs, a heroic lead motif
//  · plucked arpeggio and a saw pad for the opening, risers and booms between stages
//  · every layer is gated by one "energy" value that follows the scroll story:
//    a heartbeat and a pad while a single cell grows, drums when it connects, bass and
//    chugs while the network forms, the lead when it ignites.
//  · the score emits a callback for every 16th step so the neurons can fire on the beat.
// Each colour theme has its own key and tempo: Violet = A minor 150, Loyel = E minor 144,
// Aurora = D minor 156.

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export const MUSIC = {
  violet: { name: 'A minor', tr: 0, tempo: 150, leadCut: 3300, shimmer: 1.0 },
  loyel: { name: 'E minor', tr: -5, tempo: 144, leadCut: 4200, shimmer: 1.2 },
  aurora: { name: 'D minor', tr: 5, tempo: 156, leadCut: 3700, shimmer: 1.5 },
};

// chord roots (semitones above the tonic) and qualities for the 8-bar loop
const PROG = [[0, 'm'], [-4, 'M'], [3, 'M'], [-2, 'M'], [0, 'm'], [-4, 'M'], [-2, 'M'], [7, 'M']];
// lead motifs as [step, chord-tone index, length in steps]; tones are [root, 3rd, 5th, root+12, 3rd+12]
const MOTIF_A = [[0, 2, 3], [3, 2, 1], [4, 3, 3], [7, 2, 1], [8, 1, 4], [12, 0, 2], [14, 1, 2]];
const MOTIF_B = [[0, 3, 3], [3, 3, 1], [4, 4, 3], [7, 3, 1], [8, 2, 4], [12, 1, 2], [14, 2, 2]];
const ARP8 = [0, 1, 2, 3, 2, 1, 2, 1];
const ARP16 = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 3];
const CHUG = [0, 2, 3, 4, 6, 8, 10, 11, 12, 14];

function distCurve(k = 3.2) {
  const c = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; c[i] = Math.tanh(k * x); }
  return c;
}

export class Score {
  constructor() {
    this.ctx = null;
    this.on = false;
    this.started = false;
    this.level = 0;
    this.onChange = null;
    this.onStep = null;
    this.themeId = 'violet';
    this.m = MUSIC.violet;
    this.tempo = this.m.tempo;
    this.tonic = 57 + this.m.tr;
    this.E = 0;
    this.Etarget = 0;
    this.gs = 0;
    this.nextTime = 0;
    this.timer = 0;
    this.stage = 0;
    this.risen = false;
  }

  get supported() { return !!(window.AudioContext || window.webkitAudioContext); }
  get stepDur() { return 60 / this.tempo / 4; }

  // ---- graph ------------------------------------------------------------------------------------
  build(ctx) {
    this.ctx = ctx;
    const sr = ctx.sampleRate;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.knee.value = 10; this.comp.ratio.value = 4.5; this.comp.attack.value = 0.003; this.comp.release.value = 0.14;
    // a gentle tanh soft-clip after the compressor guarantees the output never exceeds full scale
    this.clip = ctx.createWaveShaper();
    const cv = new Float32Array(2048);
    for (let i = 0; i < 2048; i++) { const x = (i / 2047) * 2 - 1; cv[i] = Math.tanh(x * 1.05) * 0.97; }
    this.clip.curve = cv;
    this.master.connect(this.comp);
    this.comp.connect(this.clip);
    this.clip.connect(ctx.destination);

    // drums go straight to the master; the musical layers share a "duck" bus that pumps on the kick
    this.drums = ctx.createGain(); this.drums.gain.value = 0.95; this.drums.connect(this.master);
    this.duck = ctx.createGain(); this.duck.gain.value = 1; this.duck.connect(this.master);
    this.leadBus = ctx.createGain(); this.leadBus.gain.value = 0.7; this.leadBus.connect(this.master);

    // reverb
    const len = Math.floor(sr * 2.6);
    const ir = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        lp += ((Math.random() * 2 - 1) - lp) * (0.7 * (1 - t) + 0.06);
        d[i] = lp * Math.pow(1 - t, 3.0);
      }
    }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir;
    this.revSend = ctx.createGain(); this.revSend.gain.value = 1;
    const revOut = ctx.createGain(); revOut.gain.value = 0.55;
    this.revSend.connect(this.verb); this.verb.connect(revOut); revOut.connect(this.master);

    // dotted-eighth stereo delay for lead and arps
    this.delSend = ctx.createGain(); this.delSend.gain.value = 1;
    const beat = 60 / this.tempo;
    for (const [mult, pan] of [[0.75, -0.6], [0.5, 0.6]]) {
      const dl = ctx.createDelay(1.5); dl.delayTime.value = beat * mult;
      const fb = ctx.createGain(); fb.gain.value = 0.34;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3600;
      const pn = ctx.createStereoPanner(); pn.pan.value = pan;
      this.delSend.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(pn); pn.connect(this.master); pn.connect(this.revSend);
      (this.delays = this.delays || []).push(dl);
    }

    // shared noise buffer
    const nlen = sr * 2;
    this.noiseBuf = ctx.createBuffer(1, nlen, sr);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
    this.curve = distCurve(3.4);

    // scroll whoosh
    const wn = ctx.createBufferSource(); wn.buffer = this.noiseBuf; wn.loop = true;
    this.whooshF = ctx.createBiquadFilter(); this.whooshF.type = 'bandpass'; this.whooshF.frequency.value = 400; this.whooshF.Q.value = 1.2;
    this.whooshG = ctx.createGain(); this.whooshG.gain.value = 0;
    wn.connect(this.whooshF); this.whooshF.connect(this.whooshG); this.whooshG.connect(this.master); this.whooshG.connect(this.revSend);
    wn.start();

    this.nextTime = ctx.currentTime + 0.12;
    this.gs = 0;
  }

  noise(t, dur) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur);
    return s;
  }

  env(g, t, peak, attack, decay, floor = 0.0001) {
    g.gain.setValueAtTime(floor, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, floor * 2), t + attack);
    g.gain.exponentialRampToValueAtTime(floor, t + attack + decay);
  }

  // ---- drums ---------------------------------------------------------------------------------------
  kick(t, v) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(175, t);
    o.frequency.exponentialRampToValueAtTime(54, t + 0.085);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.34);
    const g = ctx.createGain();
    this.env(g, t, v, 0.003, 0.4);
    o.connect(g); g.connect(this.drums);
    o.start(t); o.stop(t + 0.5);
    const n = this.noise(t, 0.02);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400;
    const ng = ctx.createGain(); this.env(ng, t, v * 0.35, 0.001, 0.012);
    n.connect(hp); hp.connect(ng); ng.connect(this.drums);
    // sidechain pump
    this.duck.gain.setValueAtTime(1, t);
    this.duck.gain.linearRampToValueAtTime(0.52, t + 0.012);
    this.duck.gain.linearRampToValueAtTime(1, t + 0.2);
  }

  snare(t, v) {
    const ctx = this.ctx;
    const n = this.noise(t, 0.25);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2100; bp.Q.value = 0.8;
    const g = ctx.createGain(); this.env(g, t, v * 0.9, 0.002, 0.19);
    n.connect(bp); bp.connect(g); g.connect(this.drums); g.connect(this.revSend);
    const n2 = this.noise(t, 0.1);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6500;
    const g2 = ctx.createGain(); this.env(g2, t, v * 0.45, 0.001, 0.07);
    n2.connect(hp); hp.connect(g2); g2.connect(this.drums);
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(215, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    const g3 = ctx.createGain(); this.env(g3, t, v * 0.55, 0.002, 0.11);
    o.connect(g3); g3.connect(this.drums); o.start(t); o.stop(t + 0.15);
  }

  hat(t, v, open = false) {
    const ctx = this.ctx;
    const n = this.noise(t, open ? 0.4 : 0.07);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7800;
    const g = ctx.createGain(); this.env(g, t, v, 0.001, open ? 0.3 : 0.04);
    n.connect(hp); hp.connect(g); g.connect(this.drums);
  }

  taiko(t, v, pitch = 1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(150 * pitch, t); o.frequency.exponentialRampToValueAtTime(66 * pitch, t + 0.14);
    const g = ctx.createGain(); this.env(g, t, v, 0.004, 0.62);
    o.connect(g); g.connect(this.drums); g.connect(this.revSend);
    o.start(t); o.stop(t + 0.75);
    const n = this.noise(t, 0.08);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const ng = ctx.createGain(); this.env(ng, t, v * 0.6, 0.002, 0.06);
    n.connect(lp); lp.connect(ng); ng.connect(this.drums);
  }

  crash(t, v) {
    const ctx = this.ctx;
    const n = this.noise(t, 2.6);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3600;
    const g = ctx.createGain(); this.env(g, t, v, 0.004, 2.2);
    n.connect(hp); hp.connect(g); g.connect(this.drums); g.connect(this.revSend);
  }

  boom(t, v) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(28, t + 1.0);
    const g = ctx.createGain(); this.env(g, t, v, 0.01, 1.8);
    o.connect(g); g.connect(this.drums); g.connect(this.revSend);
    o.start(t); o.stop(t + 2);
  }

  riser(t, dur, v) {
    const ctx = this.ctx;
    const n = this.noise(t, dur + 0.1);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.2;
    bp.frequency.setValueAtTime(260, t); bp.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
    n.connect(bp); bp.connect(g); g.connect(this.master); g.connect(this.revSend);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(1500, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, t); lp.frequency.exponentialRampToValueAtTime(5000, t + dur);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(v * 0.35, t + dur); og.gain.linearRampToValueAtTime(0, t + dur + 0.05);
    o.connect(lp); lp.connect(og); og.connect(this.master); o.start(t); o.stop(t + dur + 0.1);
  }

  // ---- melodic layers --------------------------------------------------------------------------------
  bass(t, note, dur, v) {
    const ctx = this.ctx;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = midi(note);
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = midi(note - 12);
    const mix = ctx.createGain(); mix.gain.value = 0.5;
    const sub = ctx.createGain(); sub.gain.value = 0.55;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3;
    lp.frequency.setValueAtTime(1500, t); lp.frequency.exponentialRampToValueAtTime(330, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.006);
    g.gain.setValueAtTime(v, t + Math.max(0.02, dur - 0.04)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.03);
    o1.connect(mix); mix.connect(lp); o2.connect(sub); sub.connect(lp); lp.connect(g); g.connect(this.duck);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  }

  power(t, note, dur, v) {
    const ctx = this.ctx;
    const sum = ctx.createGain(); sum.gain.value = 0.2;
    for (const iv of [0, 7, 12]) {
      for (const det of [-9, 9]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = midi(note + iv); o.detune.value = det;
        o.connect(sum); o.start(t); o.stop(t + dur + 0.12);
      }
    }
    const ws = ctx.createWaveShaper(); ws.curve = this.curve; ws.oversample = '2x';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000; lp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.005);
    g.gain.setValueAtTime(v * 0.85, t + Math.max(0.01, dur - 0.04)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    sum.connect(ws); ws.connect(lp); lp.connect(g); g.connect(this.duck);
    const rs = ctx.createGain(); rs.gain.value = 0.18; g.connect(rs); rs.connect(this.revSend);
  }

  lead(t, note, dur, v, brightness = 3300) {
    const ctx = this.ctx;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = midi(note);
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = midi(note); o2.detune.value = 8;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.6;
    const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(15, t + Math.min(0.35, dur));
    lfo.connect(lg); lg.connect(o1.detune); lg.connect(o2.detune);
    const m1 = ctx.createGain(); m1.gain.value = 0.55;
    const m2 = ctx.createGain(); m2.gain.value = 0.35;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.4;
    lp.frequency.setValueAtTime(brightness * 1.5, t); lp.frequency.exponentialRampToValueAtTime(brightness, t + 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012);
    g.gain.setValueAtTime(v * 0.9, t + Math.max(0.02, dur - 0.06)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
    o1.connect(m1); o2.connect(m2); m1.connect(lp); m2.connect(lp); lp.connect(g); g.connect(this.leadBus);
    const ds = ctx.createGain(); ds.gain.value = 0.32; g.connect(ds); ds.connect(this.delSend);
    const rs = ctx.createGain(); rs.gain.value = 0.2; g.connect(rs); rs.connect(this.revSend);
    for (const o of [o1, o2, lfo]) { o.start(t); o.stop(t + dur + 0.15); }
  }

  pluck(t, note, v, pan = 0) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(note);
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = midi(note); o2.detune.value = -6;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
    lp.frequency.setValueAtTime(4200, t); lp.frequency.exponentialRampToValueAtTime(650, t + 0.16);
    const g = ctx.createGain(); this.env(g, t, v, 0.003, 0.2);
    const pn = ctx.createStereoPanner(); pn.pan.value = pan;
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(pn); pn.connect(this.duck);
    const ds = ctx.createGain(); ds.gain.value = 0.36; pn.connect(ds); ds.connect(this.delSend);
    const rs = ctx.createGain(); rs.gain.value = 0.2; pn.connect(rs); rs.connect(this.revSend);
    o.start(t); o2.start(t); o.stop(t + 0.3); o2.stop(t + 0.3);
  }

  pad(t, notes, dur, v) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900 + 1500 * smooth(0, 4, this.E); lp.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.35);
    g.gain.setValueAtTime(v, t + dur - 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6);
    lp.connect(g); g.connect(this.duck);
    const rs = ctx.createGain(); rs.gain.value = 0.5; g.connect(rs); rs.connect(this.revSend);
    for (const n of notes) {
      for (const det of [-8, 8]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = det;
        const og = ctx.createGain(); og.gain.value = 0.1 / Math.sqrt(notes.length);
        o.connect(og); og.connect(lp); o.start(t); o.stop(t + dur + 0.7);
      }
    }
  }

  // ---- sequencer --------------------------------------------------------------------------------------------
  chord(bar) {
    const [r, q] = PROG[bar];
    const third = q === 'm' ? 3 : 4;
    return { r, third, tones: [r, r + third, r + 7, r + 12, r + 12 + third] };
  }

  step(i, t) {
    const E = this.E;
    const s = i % 16;
    const bar = Math.floor(i / 16) % 8;
    const c = this.chord(bar);
    const T = this.tonic;
    const L = (a, b) => smooth(a, b, E);
    const dur = this.stepDur;
    const fillBar = bar % 4 === 3;
    const k = this.m;

    let kick = false;
    let snare = false;

    // pad: one chord per bar
    if (s === 0) this.pad(t, [T - 12 + c.r + 12, T - 12 + c.r + 12 + c.third, T - 12 + c.r + 19, T + c.r + 12], dur * 16, 0.55 * (0.45 + 0.55 * L(0, 2.5)));

    // plucked arpeggio: eighths in the build-up, sixteenths once the drums are in
    const lr = c.r > 4 ? c.r - 12 : c.r; // keep the dominant (E) chord in the same register
    const arpBase = T + 12 + lr;
    const arpV = 0.16 * (0.5 + 0.5 * L(0, 1.2));
    if (E < 2.5) {
      if (s % 2 === 0) {
        this.pluck(t, arpBase + [0, c.third, 7, 12, 7, c.third, 7, c.third][s / 2], arpV, (s / 2) % 2 ? 0.35 : -0.35);
      }
    } else if (L(2.5, 3.3) > 0.02) {
      const idx = ARP16[s];
      const tone = [0, c.third, 7, 12, 12 + c.third][idx % 5];
      this.pluck(t, arpBase + tone, 0.12 * L(2.5, 3.3) * (s % 4 === 0 ? 1.2 : 0.8), s % 2 ? 0.4 : -0.4);
    }

    // heartbeat taiko while a single cell grows
    const heart = 1 - L(1.5, 2.0);
    if (heart > 0.05) {
      if (s === 0) this.taiko(t, 0.5 * heart, 0.9);
      if (s === 8) this.taiko(t, 0.3 * heart, 0.8);
    }

    // drums
    const vKick = L(1.2, 1.8);
    if (vKick > 0.05) {
      let pat = [0, 8];
      if (E >= 2.3) pat = [0, 8, 10];
      if (E >= 3.6) pat = [0, 3, 8, 10];
      const extra = fillBar && s >= 12 && E >= 3.4 && s % 1 === 0;
      if (pat.includes(s) || (extra && s % 2 === 1)) { this.kick(t, 0.9 * vKick); kick = true; }
    }
    const vSnare = L(2.1, 2.7);
    if (vSnare > 0.05) {
      if (s === 4 || s === 12) { this.snare(t, 0.7 * vSnare); snare = true; }
      if (fillBar && E >= 3.0 && s >= 12 && s !== 12) this.snare(t, (0.35 + 0.1 * (s - 12)) * vSnare);
      if (fillBar && bar === 7 && E >= 4.4 && (s === 8 || s === 10)) this.snare(t, 0.4 * vSnare);
    }
    const vHat = L(1.6, 2.2);
    if (vHat > 0.05) {
      if (s % 2 === 0) this.hat(t, (s % 4 === 2 ? 0.3 : 0.19) * vHat);
      else if (E >= 3.4) this.hat(t, 0.1 * L(3.4, 3.9));
      if (s === 14 && E >= 2.8) this.hat(t, 0.22, true);
    }
    const vTaiko = L(1.8, 2.4);
    if (vTaiko > 0.05 && heart < 0.5) {
      if (s === 0) this.taiko(t, 0.75 * vTaiko, 1);
      if (s === 8) this.taiko(t, 0.55 * vTaiko, 0.92);
      if (E >= 2.8 && (s === 6 || s === 14)) this.taiko(t, 0.32 * vTaiko, 1.35);
      if (bar === 7 && s >= 12 && E >= 4.0) this.taiko(t, 0.5, 1.1 + 0.08 * (s - 12));
    }

    // crashes
    if (s === 0 && E >= 3.3 && (bar % 4 === 0 || E >= 5.0)) this.crash(t, 0.32 * L(3.3, 3.8));

    // bass
    const vBass = L(1.4, 2.0);
    if (vBass > 0.05) {
      const root = T - 24 + c.r;
      if (E < 2.3) {
        if (s === 0) this.bass(t, root, dur * 8, 0.5 * vBass);
        if (s === 8) this.bass(t, root, dur * 8, 0.45 * vBass);
      } else if (s % 2 === 0) {
        const note = root + (s === 6 || s === 14 ? 12 : 0);
        this.bass(t, note, dur * 1.7, 0.5 * vBass);
      }
    }

    // distorted power chords: chugs, then sustained
    const vPow = L(2.6, 3.2);
    if (vPow > 0.05) {
      const root = T - 12 + c.r;
      if (CHUG.includes(s)) this.power(t, root, dur * 1.6, 0.24 * vPow);
      if (s === 0 && E >= 4.2) this.power(t, root + 12, dur * 15.5, 0.08 * L(4.2, 4.8));
    }

    // lead
    const vLead = L(3.2, 3.8);
    if (vLead > 0.05) {
      const motif = bar < 4 ? MOTIF_A : MOTIF_B;
      const base = T + 12 + lr;
      for (const [st, ti, ln] of motif) {
        if (st === s) {
          const note = base + c.tones[ti];
          this.lead(t, note, dur * ln * 0.95, 0.2 * vLead, k.leadCut);
          if (E >= 4.5) this.lead(t, note + 12, dur * ln * 0.95, 0.08 * L(4.5, 5.2), k.leadCut * 1.2);
        }
      }
    }

    if (this.onStep) this.onStep({ step: s, bar, when: t, kick, snare, gs: i });
  }

  scheduleUntil(until) {
    while (this.nextTime < until) {
      this.step(this.gs, this.nextTime);
      this.gs++;
      this.nextTime += this.stepDur;
    }
  }

  // ---- public API ------------------------------------------------------------------------------------------------
  async start() {
    if (this.started) { this.setOn(true); return; }
    if (!this.supported) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.build(new AC({ latencyHint: 'interactive' }));
    this.started = true;
    await this.ctx.resume();
    this.nextTime = this.ctx.currentTime + 0.1;
    this.scheduleUntil(this.ctx.currentTime + 0.4);
    this.timer = setInterval(() => {
      if (this.ctx && this.on && this.ctx.state === 'running') this.scheduleUntil(this.ctx.currentTime + 0.4);
    }, 60);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else if (this.on) { this.ctx.resume(); this.nextTime = Math.max(this.nextTime, this.ctx.currentTime + 0.1); }
    });
    this.setOn(true);
  }

  setOn(on) {
    if (!this.ctx) return;
    this.on = on;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(on ? 0.72 : 0, t, on ? 0.6 : 0.15);
    if (on) { if (this.ctx.state !== 'running') this.ctx.resume(); this.nextTime = Math.max(this.nextTime, t + 0.1); }
    else setTimeout(() => { if (!this.on && this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }, 1200);
    this.onChange && this.onChange(on);
  }

  toggle() { this.setOn(!this.on); }

  setTheme(id, { chime = true } = {}) {
    this.themeId = id;
    this.m = MUSIC[id] || MUSIC.violet;
    this.tempo = this.m.tempo;
    this.tonic = 57 + this.m.tr;
    if (!this.ctx) return;
    const beat = 60 / this.tempo;
    this.delays.forEach((d, i) => { d.delayTime.value = beat * (i ? 0.5 : 0.75); });
    if (this.on && chime) {
      const t = this.ctx.currentTime + 0.03;
      const base = this.tonic + 12;
      [0, 7, 12, 15, 19].forEach((n, i) => this.lead(t + i * 0.065, base + n, 0.22, 0.16, this.m.leadCut));
      this.crash(t + 0.3, 0.2);
    }
  }

  update(dt, p, speed) {
    // energy follows the story: quiet while one cell grows, everything in at the ignition
    let target = clamp(p * 1.18, 0, 6.2);
    target = target + (4.6 - target) * smooth(5.9, 6.9, p);
    target = target + (3.9 - target) * smooth(7.3, 7.9, p);
    this.Etarget = target;
    this.E += (target - this.E) * Math.min(1, dt * 1.3);
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    const sp = clamp(speed / 3.2);
    this.whooshG.gain.setTargetAtTime(sp * 0.16, t, 0.1);
    this.whooshF.frequency.setTargetAtTime(260 + sp * 2800, t, 0.1);

    // a boom and a crash each time a new story stage locks in; a riser into the ignition
    const idx = Math.round(clamp(p, 0, 6));
    if (idx !== this.stage && Math.abs(p - idx) < 0.22) {
      const up = idx > this.stage;
      this.stage = idx;
      if (up) {
        this.boom(t + 0.02, 0.45 + 0.05 * idx);
        this.crash(t + 0.02, 0.18 + 0.03 * idx);
      }
    }
    if (p > 4.45 && p < 4.9 && !this.risen) { this.risen = true; this.riser(t, 2.2, 0.28); }
    if (p < 4.2) this.risen = false;
  }
}
