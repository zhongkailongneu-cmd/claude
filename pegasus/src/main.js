import './guard.js';
import * as THREE from 'three';
import { Fibers } from './fibers.js';
import { createComposer } from './post.js';
import { THEMES, applyUI } from './themes.js';
import { Scrambler, bindCounters, buildChart, buildOpps, buildThemeSwitch } from './ui.js';
import { Score, MUSIC } from './audio.js';

// ---------------------------------------------------------------------------------------
// Scroll story. `p` is a continuous progress value: scene k is fully formed at p = k.
//   0 fan · 1 platform · 2 funnel · 3 beam · 4 hyperboloid · 5 tube · 6 iris + dashboard
//   p 5.8 -> 6.9   dashboard tilts up from below, numbers count up
//   p 7 -> 8       dashboard scrolls through, closing call to action fades in
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

// ---- renderer ---------------------------------------------------------------------------
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: q.has('shot') });
renderer.setClearColor(0x000000, 1);
let dprCap = mobile ? 1.5 : 2;
let dpr = Math.min(window.devicePixelRatio || 1, dprCap);

const fibers = new Fibers({ mobile, strands: q.has('n') ? parseInt(q.get('n'), 10) : undefined });
const post = createComposer(renderer, fibers.scene, fibers.camera, { mobile });
if (q.has('b')) post.bloom.strength = parseFloat(q.get('b'));
if (q.has('g')) fibers.gainMul = parseFloat(q.get('g'));

const baseBloom = post.bloom.strength;
const bg = { c1: new THREE.Color(), c2: new THREE.Color(), hot: new THREE.Color(), vig: 0.5, tone: 1.3, bloom: 1 };
const bgT = { c1: new THREE.Color(), c2: new THREE.Color(), hot: new THREE.Color(), vig: 0.5, tone: 1.3, bloom: 1 };

let vw = innerWidth;
let vh = innerHeight;
function resize() {
  vw = innerWidth; vh = innerHeight;
  renderer.setPixelRatio(dpr);
  renderer.setSize(vw, vh, false);
  fibers.setSize(vw, vh, dpr);
  post.resize(vw, vh, dpr);
  $('track').style.height = `${(P_MAX + 1) * vh}px`;
  measureDash();
}

// ---- themes ---------------------------------------------------------------------------------
let themeId = 'violet';
const audio = new Score();
let markTheme = () => {};
function setTheme(id, { instant = false, silent = false } = {}) {
  const th = THEMES[id] || THEMES.violet;
  themeId = th.id;
  fibers.setTheme(th, instant);
  bgT.c1.set(th.bg1); bgT.c2.set(th.bg2); bgT.hot.set(th.hot); bgT.vig = th.vignette; bgT.tone = th.tone; bgT.bloom = th.bloom;
  if (instant) { bg.c1.copy(bgT.c1); bg.c2.copy(bgT.c2); bg.hot.copy(bgT.hot); bg.vig = bgT.vig; bg.tone = bgT.tone; bg.bloom = bgT.bloom; }
  applyUI(th);
  markTheme(th.id);
  safe.set('pegasus-theme', th.id);
  audio.setTheme(th.id, { chime: !silent });
}

// ---- text sections ----------------------------------------------------------------------------
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
    let y = 0;
    if (p < k && k > 0) y = (k - p) / 0.22 * 46 * textScale;
    if (p > outA) y = -((p - outA) / 0.23) * 130 * textScale;
    s.el.style.opacity = a.toFixed(3);
    s.el.style.transform = `translate3d(0,${y.toFixed(1)}px,0)`;
    const live = a > 0.004;
    s.el.classList.toggle('live', live);
    const want = k === 0 ? introDone && p < k + 0.35 : p > k - 0.14 && p < k + 0.34;
    if (want && !s.on) {
      s.on = true;
      s.el.classList.add('shown');
      s.scr.play(k === 0 ? 0 : 60, 1);
    } else if (!want && s.on && (p < k - 0.22 || p > k + 0.5)) {
      s.on = false;
      s.el.classList.remove('shown');
      s.scr.hide();
    }
  }
}

// ---- dashboard -----------------------------------------------------------------------------------
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
  const live = p > 5.78;
  dashWrap.classList.toggle('live', live);
  let topFinal = vh * (mobile ? 0.3 : 0.27);
  // position leads (ease-out) while the tilt follows the slower ease-in-out
  let y = lerp(vh * 1.04, topFinal, 1 - Math.pow(1 - rise, 2.3));
  const scrollPhase = clamp(p - 7);
  const extra = scrollPhase * Math.max(0, dashH - vh * 0.7 + topFinal * 0.3);
  y -= extra;
  const rot = (1 - e) * 58;
  const sc = lerp(0.8, 1, e);
  dash.style.transform = rise >= 1 ? `translate3d(0,${y.toFixed(1)}px,0)` : `translate3d(0,${y.toFixed(1)}px,0) rotateX(${rot.toFixed(2)}deg) scale(${sc.toFixed(4)})`;
  dash.style.opacity = (smooth(0, 0.22, rise) * (1 - smooth(7.45, 7.9, p))).toFixed(3);
  setCounters(lerp(0.18, 1, easeOut(clamp(rise * 1.05))));
  const o = smooth(7.45, 7.95, p);
  outro.style.opacity = o.toFixed(3);
  outro.classList.toggle('live', o > 0.01);
  outro.classList.toggle('on', o > 0.6);
  dash.style.pointerEvents = 'none';
  return { y, e };
}

// ---- scene state from progress ------------------------------------------------------------------------
function sceneState(p) {
  let A; let B; let morph;
  if (p >= 6) { A = 6; B = 6; morph = 0; } else {
    A = Math.floor(Math.max(p, 0));
    const local = Math.max(p, 0) - A;
    morph = smooth(0.32, 0.86, local);
    B = A + 1;
    if (morph <= 0) B = A;
    if (morph >= 1) { A = B; morph = 0; }
  }
  return { A, B, morph };
}

// ---- audio + controls --------------------------------------------------------------------------------
const sndBtn = $('snd');
let soundWanted = safe.get('pegasus-sound') !== 'off';
function paintSound() { sndBtn.setAttribute('aria-pressed', String(audio.on)); }
sndBtn.addEventListener('click', async () => {
  if (!audio.started) { await audio.start(); soundWanted = true; } else { audio.toggle(); soundWanted = audio.on; }
  safe.set('pegasus-sound', soundWanted ? 'on' : 'off');
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

// ---- pointer ---------------------------------------------------------------------------------------------
const ptr = { x: 0, y: 0, tx: 0, ty: 0, active: false };
addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  ptr.tx = (e.clientX / vw) * 2 - 1;
  ptr.ty = -((e.clientY / vh) * 2 - 1);
  ptr.active = true;
});
addEventListener('pointerleave', () => { ptr.active = false; });

// ---- loader / intro ------------------------------------------------------------------------------------------
const loader = $('loader');
let introT0 = skipIntro ? -1000 : null; // null: intro not started
function enter(withSound) {
  loader.classList.add('out');
  document.documentElement.style.overflow = '';
  document.body.classList.add('is-in');
  introT0 = performance.now() / 1000;
  setTimeout(() => { introDone = true; }, 1100);
  if (withSound) audio.start().then(() => { soundWanted = true; safe.set('pegasus-sound', 'on'); paintSound(); });
  else { safe.set('pegasus-sound', 'off'); }
}
$('enterSound').addEventListener('click', () => enter(true));
$('enterMute').addEventListener('click', () => enter(false));
$('toTop').addEventListener('click', (e) => { e.preventDefault(); scrollTo({ top: 0, behavior: 'smooth' }); });
document.querySelector('.brand').addEventListener('click', (e) => { e.preventDefault(); scrollTo({ top: 0, behavior: 'smooth' }); });

// ---- main loop ------------------------------------------------------------------------------------------------
let prog = 0;
let prevProg = 0;
let tNow = 0;
let last = performance.now();
let frames = 0;
let accDt = 0;
let started = false;

function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) { last = now; return; }
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  tNow += dt;

  const target = debugP !== null ? debugP : clamp(scrollY / vh, 0, P_MAX);
  prog += (target - prog) * (debugP !== null ? 1 : 1 - Math.exp(-dt * (reduced ? 14 : 5.2)));
  const speed = Math.abs(prog - prevProg) / Math.max(dt, 1e-3);
  prevProg = prog;
  const p = prog;

  const sc = sceneState(p);
  const reveal = introT0 === null ? 0 : easeOut(clamp((now / 1000 - introT0) / 3.4));
  const d = updateDash(p);

  // iris follows the top edge of the dashboard
  const irisE = smooth(5.8, 6.9, p);
  const topWorld = 1 - (2 * d.y) / vh;
  const fin = smooth(7.3, 7.95, p);
  const irisCy = lerp(lerp(0.1, Math.max(topWorld + 0.04, 0.1), irisE), 0.2, fin);

  ptr.x += (ptr.tx - ptr.x) * 0.12;
  ptr.y += (ptr.ty - ptr.y) * 0.12;

  const state = {
    ...sc,
    p,
    reveal,
    tubeDraw: smooth(4.72, 5.42, p),
    fly: smooth(5.3, 5.95, p),
    twist: (1 - smooth(3.3, 4.25, p)) * 1.25 - smooth(4.4, 5.0, p) * 0.7,
    irisScale: (smooth(5.5, 6.6, p) * 0.97 + 0.03 * smooth(5.45, 5.6, p)) * (1 + 0.32 * fin),
    irisCx: 0,
    irisCy,
    irisTilt: lerp(1.15, 0.1, smooth(5.8, 6.8, p)),
    irisSpin: tNow * 0.025,
    mx: ptr.active ? ptr.x * (vw / vh) : 9,
    my: ptr.active ? ptr.y : 9,
    bokeh: 1 - smooth(0.05, 0.75, p),
    dustVis: 1 - smooth(5.9, 6.7, p) * 0.5,
    beat: audio.level,
    cx: ptr.active ? ptr.x : 0,
    cy: ptr.active ? ptr.y : 0,
  };
  fibers.update(dt, tNow, state);

  // background / tone colours glide towards the active theme
  const k = 1 - Math.exp(-dt * 3.2);
  bg.c1.lerp(bgT.c1, k); bg.c2.lerp(bgT.c2, k); bg.hot.lerp(bgT.hot, k);
  bg.vig += (bgT.vig - bg.vig) * k; bg.tone += (bgT.tone - bg.tone) * k; bg.bloom += (bgT.bloom - bg.bloom) * k;
  post.bloom.strength = baseBloom * bg.bloom;
  const fu = post.final.uniforms;
  fu.uBg1.value.copy(bg.c1); fu.uBg2.value.copy(bg.c2); fu.uHot.value.copy(bg.hot);
  fu.uVig.value = bg.vig; fu.uTone.value = bg.tone; fu.uTime.value = tNow;

  updateText(p);
  $('nav').classList.toggle('solid', p > 6.85);
  $('cue').classList.toggle('gone', p > 0.12);
  audio.update(dt, p, speed);

  post.composer.render(dt);

  // simple adaptive quality: drop the pixel ratio on slow machines
  frames++; accDt += dt;
  if (frames === 70) {
    const avg = accDt / frames;
    if (avg > 0.028 && dpr > 1) {
      dpr = Math.max(1, dpr * 0.75);
      resize();
    }
    frames = 0; accDt = 0;
  }
  if (!started) { started = true; document.documentElement.dataset.ready = '1'; }
}

// demo links: keep the page where it is instead of jumping to '#'
document.querySelectorAll('a[href="#"]').forEach((a) => a.addEventListener('click', (e) => e.preventDefault()));
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
scrollTo(0, 0);

// ---- boot --------------------------------------------------------------------------------------------------------
const saved = safe.get('pegasus-theme');
const startTheme = q.get('theme') || (THEMES[saved] ? saved : 'violet');
setTheme(startTheme, { instant: true, silent: true });
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
    if (f < 1) requestAnimationFrame(step);
    else loader.classList.add('ready');
  };
  requestAnimationFrame(step);
}
requestAnimationFrame(frame);
window.__pegasus = { setTheme, audio, Score, MUSIC, get p() { return prog; } };
