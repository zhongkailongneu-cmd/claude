import './guard.js';
import * as THREE from 'three';
import { NeuronField } from './field.js';
import { Activity } from './activity.js';
import { createComposer } from './post.js';
import { THEMES, applyUI } from './themes.js';
import { Scrambler, bindCounters, buildChart, buildOpps, buildThemeSwitch } from './ui.js';
import { Score, MUSIC } from './audio.js';

// ---------------------------------------------------------------------------------------
// Scroll story. `p` is the smoothed scroll progress; the growth clock is S = p + intro - 1,
// so the intro (S -1 -> 0) grows the hero neuron by itself and every later stage is scroll-driven.
//   p 0 one neuron · 1 extend · 2 expand · 3 connect · 4 network · 5 ignite
//   p 5.8 -> 6.9 console tilts up · 7 -> 8 console scrolls, closing call to action
// ---------------------------------------------------------------------------------------
const P_MAX = 8;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const mobile = matchMedia('(max-width: 860px)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const debugP = q.has('p') ? parseFloat(q.get('p')) : null;
const skipIntro = q.has('skip') || debugP !== null;

const safe = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

// ---- renderer -------------------------------------------------------------------------------------
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: q.has('shot') });
renderer.setClearColor(0x000000, 1);
let dprCap = mobile ? 1.5 : 2;
let dpr = Math.min(window.devicePixelRatio || 1, dprCap);

const field = new NeuronField({ mobile, count: q.has('n') ? parseInt(q.get('n'), 10) : undefined });
const activity = new Activity(field.net, field.texture);
const post = createComposer(renderer, field.scene, field.camera, { mobile });
if (q.has('b')) post.bloom.strength = parseFloat(q.get('b'));
if (q.has('g')) field.gainMul = parseFloat(q.get('g'));
const baseBloom = post.bloom.strength;

const bg = { c1: new THREE.Color(), c2: new THREE.Color(), hot: new THREE.Color(), vig: 0.5, tone: 1.3, bloom: 1 };
const bgT = { c1: new THREE.Color(), c2: new THREE.Color(), hot: new THREE.Color(), vig: 0.5, tone: 1.3, bloom: 1 };

let vw = innerWidth;
let vh = innerHeight;
function resize() {
  vw = innerWidth; vh = innerHeight;
  renderer.setPixelRatio(dpr);
  renderer.setSize(vw, vh, false);
  field.setSize(vw, vh, dpr);
  post.resize(vw, vh, dpr);
  $('track').style.height = `${(P_MAX + 1) * vh}px`;
  measureDash();
}

// ---- themes ------------------------------------------------------------------------------------------
let themeId = 'violet';
const audio = new Score();
let markTheme = () => {};
function setTheme(id, { instant = false, silent = false } = {}) {
  const th = THEMES[id] || THEMES.violet;
  themeId = th.id;
  field.setTheme(th, instant);
  bgT.c1.set(th.bg1); bgT.c2.set(th.bg2); bgT.hot.set(th.hot); bgT.vig = th.vignette; bgT.tone = th.tone; bgT.bloom = th.bloom;
  if (instant) { bg.c1.copy(bgT.c1); bg.c2.copy(bgT.c2); bg.hot.copy(bgT.hot); bg.vig = bgT.vig; bg.tone = bgT.tone; bg.bloom = bgT.bloom; }
  applyUI(th);
  markTheme(th.id);
  safe.set('neuron-theme', th.id);
  audio.setTheme(th.id, { chime: !silent });
}

// ---- text sections ----------------------------------------------------------------------------------
const sections = [...document.querySelectorAll('.txt')].map((el) => ({
  el,
  k: parseInt(el.dataset.k, 10),
  scr: new Scrambler(el.querySelector('.h')),
  on: false,
}));
let introDone = skipIntro;

function updateText(p) {
  const textScale = vh / 900;
  for (const s of sections) {
    const k = s.k;
    const inA = k - 0.22, inB = k - 0.04, outA = k + 0.27, outB = k + 0.5;
    let a = smooth(inA, inB, p) * (1 - smooth(outA, outB, p));
    if (k === 0) a = (1 - smooth(outA, outB, p)) * (introDone ? 1 : 0);
    // the closing stage lingers until the console takes over
    if (k === 5) a = smooth(inA, inB, p) * (1 - smooth(5.55, 5.85, p));
    let y = 0;
    if (p < k && k > 0) y = (k - p) / 0.22 * 46 * textScale;
    const outStart = k === 5 ? 5.55 : outA;
    if (p > outStart) y = -((p - outStart) / 0.3) * 130 * textScale;
    s.el.style.opacity = a.toFixed(3);
    s.el.style.transform = `translate3d(0,${y.toFixed(1)}px,0)`;
    s.el.classList.toggle('live', a > 0.004);
    const want = k === 0 ? introDone && p < k + 0.35 : p > k - 0.14 && p < (k === 5 ? 5.7 : k + 0.34);
    if (want && !s.on) {
      s.on = true;
      s.el.classList.add('shown');
      s.scr.play(k === 0 ? 0 : 60, 1);
    } else if (!want && s.on && (p < k - 0.22 || p > (k === 5 ? 5.9 : k + 0.5))) {
      s.on = false;
      s.el.classList.remove('shown');
      s.scr.hide();
    }
  }
}

// ---- console (dashboard) ----------------------------------------------------------------------------------
const dashWrap = $('dashWrap');
const dash = $('dash');
const outro = $('outro');
buildChart($('bars'));
buildOpps($('opps'));
const setCounters = bindCounters(dash);
let dashH = 1200;
function measureDash() { dashH = dash.offsetHeight || 1200; }

function updateDash(p) {
  const rise = clamp((p - 5.8) / 1.1);
  const e = easeInOut(rise);
  dashWrap.classList.toggle('live', p > 5.78);
  const topFinal = vh * (mobile ? 0.3 : 0.2);
  let y = lerp(vh * 1.04, topFinal, 1 - Math.pow(1 - rise, 2.3));
  const scrollPhase = clamp(p - 7);
  y -= scrollPhase * Math.max(0, dashH - vh * 0.7 + topFinal * 0.3);
  const rot = (1 - e) * 58;
  const sc = lerp(0.8, 1, e);
  dash.style.transform = rise >= 1 ? `translate3d(0,${y.toFixed(1)}px,0)` : `translate3d(0,${y.toFixed(1)}px,0) rotateX(${rot.toFixed(2)}deg) scale(${sc.toFixed(4)})`;
  dash.style.opacity = (smooth(0, 0.22, rise) * (1 - smooth(7.45, 7.9, p))).toFixed(3);
  setCounters(lerp(0.18, 1, easeOut(clamp(rise * 1.05))));
  const o = smooth(7.45, 7.95, p);
  outro.style.opacity = o.toFixed(3);
  outro.classList.toggle('live', o > 0.01);
  outro.classList.toggle('on', o > 0.6);
}

// ---- audio + controls --------------------------------------------------------------------------------------------
const sndBtn = $('snd');
function paintSound() { sndBtn.setAttribute('aria-pressed', String(audio.on)); }
sndBtn.addEventListener('click', async () => {
  if (!audio.started) await audio.start(); else audio.toggle();
  safe.set('neuron-sound', audio.on ? 'on' : 'off');
  paintSound();
});
audio.onChange = paintSound;

markTheme = buildThemeSwitch($('themes'), themeId, (id) => setTheme(id));
addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input,textarea')) return;
  if (e.key === 'm' || e.key === 'M') sndBtn.click();
  if (e.key === '1') setTheme('violet');
  if (e.key === '2') setTheme('loyel');
  if (e.key === '3') setTheme('aurora');
});

// ---- pointer ----------------------------------------------------------------------------------------------------------------
const ptr = { x: 0, y: 0, tx: 0, ty: 0, active: false };
addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  ptr.tx = (e.clientX / vw) * 2 - 1;
  ptr.ty = -((e.clientY / vh) * 2 - 1);
  ptr.active = true;
});
addEventListener('pointerleave', () => { ptr.active = false; });

// ---- beat -> activity -----------------------------------------------------------------------------------------------------------
// Every quarter note (from the score when it is playing, otherwise from a 140 BPM fallback clock) kicks the
// image: a visual punch, and on a schedule that tightens as the story builds, a cascade of firing.
let punch = 0;
let beatCount = 0;
let tNow = 0;
let prog = 0;
let intro = skipIntro ? 1 : 0;

function storyS() { return prog + intro - 1; }
function cascadeEvery(S) {
  if (S < -0.08) return 0;
  if (S < 2.4) return 4;
  if (S < 3.6) return 4;
  if (S < 4.7) return 2;
  return 1;
}
function onBeat(step) {
  const strong = step === 0 || step === 8;
  punch = Math.max(punch, strong ? 1 : 0.55);
  const S = storyS();
  const every = cascadeEvery(S);
  beatCount++;
  if (!every || beatCount % every !== 0) return;
  const seeds = S < 0.9 ? [0] : activity.pickSeeds(S, field.camTgt.x, field.camTgt.y, S > 4.8 ? 3 : S > 3.6 ? 2 : 1);
  if (seeds.length) activity.trigger(seeds, tNow + 0.02, S, { p: S > 4.7 ? 0.97 : 0.88, maxDelay: S > 4.7 ? 3.6 : 3.0 });
}
audio.onStep = (info) => {
  if (info.step % 4 !== 0) return;
  const lat = (audio.ctx.outputLatency || audio.ctx.baseLatency || 0.03);
  const wait = Math.max(0, (info.when - audio.ctx.currentTime - lat) * 1000);
  setTimeout(() => onBeat(info.step), wait);
};
let fallbackStep = 0;
setInterval(() => {
  if (audio.on || document.hidden) return;
  onBeat((fallbackStep++ % 4) * 4);
}, 60000 / 140);

// ---- loader / intro --------------------------------------------------------------------------------------------------------------------
const loader = $('loader');
let introT0 = skipIntro ? null : null;
function enter(withSound) {
  loader.classList.add('out');
  document.documentElement.style.overflow = '';
  document.body.classList.add('is-in');
  introT0 = performance.now() / 1000;
  setTimeout(() => { introDone = true; }, 1400);
  if (withSound) audio.start().then(() => { safe.set('neuron-sound', 'on'); paintSound(); });
  else safe.set('neuron-sound', 'off');
}
$('enterSound').addEventListener('click', () => enter(true));
$('enterMute').addEventListener('click', () => enter(false));
$('toTop').addEventListener('click', (e) => { e.preventDefault(); scrollTo({ top: 0, behavior: 'smooth' }); });
document.querySelector('.brand').addEventListener('click', (e) => { e.preventDefault(); scrollTo({ top: 0, behavior: 'smooth' }); });
document.querySelectorAll('a[href="#"]').forEach((a) => a.addEventListener('click', (e) => e.preventDefault()));
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
scrollTo(0, 0);

// ---- main loop ---------------------------------------------------------------------------------------------------------------------------------
let prevProg = 0;
let last = performance.now();
let frames = 0;
let accDt = 0;
let started = false;
let nextDebugFire = 0;
const dbgT = q.has('dbgT') ? parseFloat(q.get('dbgT')) : null; // test aid: freeze the clock X seconds after a cascade started
let dbgFired = false;

function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) { last = now; return; }
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  tNow = dbgT !== null ? 100 : tNow + dt;

  const target = debugP !== null ? debugP : clamp(scrollY / vh, 0, P_MAX);
  prog += (target - prog) * (debugP !== null ? 1 : 1 - Math.exp(-dt * (reduced ? 14 : 5.2)));
  const speed = Math.abs(prog - prevProg) / Math.max(dt, 1e-3);
  prevProg = prog;
  const p = prog;

  if (skipIntro) intro = 1;
  else if (introT0 !== null) intro = easeOut(clamp((now / 1000 - introT0) / 5.2));
  const S = storyS();

  updateDash(p);

  if (dbgT !== null && !dbgFired) {
    dbgFired = true;
    const seeds = S < 0.9 ? [0] : activity.pickSeeds(S, field.camTgt.x, field.camTgt.y, 2);
    activity.trigger(seeds, tNow - dbgT, S, { p: 1, maxDelay: 4 });
  }
  if (q.has('fire') && dbgT === null && tNow >= nextDebugFire) {
    nextDebugFire = tNow + 2.2;
    const seeds = S < 0.9 ? [0] : activity.pickSeeds(S, field.camTgt.x, field.camTgt.y, 3);
    activity.trigger(seeds, tNow + 0.1, S, { p: 0.95, maxDelay: 3.5 });
  }

  ptr.x += (ptr.tx - ptr.x) * 0.12;
  ptr.y += (ptr.ty - ptr.y) * 0.12;
  punch *= Math.exp(-dt * 7.5);
  const heat = 0.5 * smooth(4.2, 5.3, p) * (1 - 0.5 * smooth(5.9, 6.9, p)) + 0.28 * punch * smooth(3.2, 5.0, p);
  post.final.uniforms.uPunch.value = punch * smooth(1.0, 4.5, p) * 0.8 + punch * 0.15;

  field.update(dt, tNow, {
    S, p, heat, punch: punch * smooth(2.0, 4.5, p),
    dust: 1 - smooth(5.9, 6.8, p) * 0.4,
    cx: ptr.active ? ptr.x : 0,
    cy: ptr.active ? ptr.y : 0,
  });

  const k = 1 - Math.exp(-dt * 3.2);
  bg.c1.lerp(bgT.c1, k); bg.c2.lerp(bgT.c2, k); bg.hot.lerp(bgT.hot, k);
  bg.vig += (bgT.vig - bg.vig) * k; bg.tone += (bgT.tone - bg.tone) * k; bg.bloom += (bgT.bloom - bg.bloom) * k;
  post.bloom.strength = baseBloom * bg.bloom * (1 + 0.35 * heat);
  const fu = post.final.uniforms;
  fu.uBg1.value.copy(bg.c1); fu.uBg2.value.copy(bg.c2); fu.uHot.value.copy(bg.hot);
  fu.uVig.value = bg.vig; fu.uTone.value = bg.tone; fu.uTime.value = tNow;

  updateText(p);
  $('nav').classList.toggle('solid', p > 6.85);
  $('cue').classList.toggle('gone', p > 0.12);
  audio.update(dt, p, speed);

  post.composer.render(dt);

  frames++; accDt += dt;
  if (frames === 70) {
    if (accDt / frames > 0.028 && dpr > 1) { dpr = Math.max(1, dpr * 0.75); resize(); }
    frames = 0; accDt = 0;
  }
  if (!started) { started = true; document.documentElement.dataset.ready = '1'; }
}

// ---- boot --------------------------------------------------------------------------------------------------------------------------------------------
const saved = safe.get('neuron-theme');
setTheme(q.get('theme') || (THEMES[saved] ? saved : 'violet'), { instant: true, silent: true });
resize();
addEventListener('resize', resize);
if (!skipIntro) document.documentElement.style.overflow = 'hidden';

if (skipIntro) {
  loader.classList.add('out');
  loader.style.transition = 'none';
  document.body.classList.add('is-in');
} else {
  const bar = $('ldBar');
  const t0 = performance.now();
  const step = () => {
    const f = clamp((performance.now() - t0) / 1300);
    bar.style.transform = `scaleX(${easeOut(f)})`;
    if (f < 1) requestAnimationFrame(step); else loader.classList.add('ready');
  };
  requestAnimationFrame(step);
}
requestAnimationFrame(frame);
window.__neuron = { setTheme, audio, Score, MUSIC, field, activity, get p() { return prog; } };
