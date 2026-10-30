/* ───────── utils ───────── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const prog = (x, a, b) => clamp((x - a) / (b - a));
const eo3 = t => 1 - Math.pow(1 - t, 3);
const ei2 = t => t * t;
const eio3 = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const eio2 = t => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const eoE = t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const eoB = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const pulse = (x, a, b) => Math.sin(Math.PI * prog(x, a, b));
const wall = () => performance.now() / 1000;
const hash = (i, j = 0) => { let h = Math.imul(i * 374761393 + j * 668265263 + 1274126177, 1103515245); h ^= h >>> 13; h = Math.imul(h, 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/* ───────── colour & palettes ───────── */
const hex = h => {
  h = h.replace('#', '');
  const n = h.length === 8 ? 4 : 3, o = [];
  for (let i = 0; i < n; i++) o.push(parseInt(h.substr(i * 2, 2), 16));
  if (n === 3) o.push(255);
  o[3] /= 255;
  return o;
};
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${(c[3] * a).toFixed(3)})`;
const rgb3 = c => `${c[0] | 0},${c[1] | 0},${c[2] | 0}`;
const WHITE = hex('#ffffff');

/* Three palettes. Token meaning:
   acc/soft/light  accent, light accent (text, ring), lightest accent (done-state fills)
   glow            halo & comet colour          btn/onbtn  primary button fill & its icon
   t0-t4           the level track gradient     h0-h4      heat-map steps
   b0-b2           task slider gradient         later/plan/quick/first  priority orb tints */
const RAW = {
  orbit: {
    label: 'Orbit 原版',
    acc: '#6f86ff', soft: '#9db6ff', light: '#c9dcff', glow: '#3f63ff', btn: '#5b6cf0', onbtn: '#ffffff', edge: '#a9b8ff',
    cube: '#38b6f5', kw: '#9a8fe6', later: '#a89cff', plan: '#9db6ff', quick: '#8fe3df', first: '#ffffff',
    h0: '#121214', h1: '#26344c', h2: '#46557b', h3: '#6682bd', h4: '#87aef8',
    t0: '#4a3fe0', t1: '#3b4ff0', t2: '#2e74e8', t3: '#35b0f0', t4: '#4cc3f5',
    b0: '#14172b', b1: '#4558c8', b2: '#a9c4ff', amb: 0.55,
  },
  /* Loyel 2025 gradient blue — only the ten official steps, no other blue */
  loyel: {
    label: 'Loyel 渐变蓝',
    acc: '#6C9AC4', soft: '#9FBDDA', light: '#CCDBEB', glow: '#6C9AC4', btn: '#497DAE', onbtn: '#FFFFFF', edge: '#9FBDDA',
    cube: '#9FBDDA', kw: '#9FBDDA', later: '#497DAE', plan: '#6C9AC4', quick: '#9FBDDA', first: '#F4F7FB',
    h0: '#263B5466', h1: '#2B4868', h2: '#376392', h3: '#6C9AC4', h4: '#CCDBEB',
    t0: '#376392', t1: '#497DAE', t2: '#6C9AC4', t3: '#9FBDDA', t4: '#CCDBEB',
    b0: '#263B54', b1: '#376392', b2: '#9FBDDA', amb: 0.6,
  },
  /* Aurora green — ten-step ramp built on the same structure as Loyel:
     #F2FBF7 #E0F6EC #BDEBD6 #8DDDBA #5BCB9C #38B386 #279470 #1F7559 #1B5B48 #153F34 */
  aurora: {
    label: '极光绿',
    acc: '#5BCB9C', soft: '#8DDDBA', light: '#BDEBD6', glow: '#38B386', btn: '#279470', onbtn: '#FFFFFF', edge: '#8DDDBA',
    cube: '#5BCB9C', kw: '#8DDDBA', later: '#279470', plan: '#5BCB9C', quick: '#7FE5D3', first: '#F2FBF7',
    h0: '#153F3466', h1: '#1B5B48', h2: '#279470', h3: '#5BCB9C', h4: '#BDEBD6',
    t0: '#1F7559', t1: '#279470', t2: '#38B386', t3: '#5BCB9C', t4: '#7FE5D3',
    b0: '#153F34', b1: '#279470', b2: '#BDEBD6', amb: 0.8,
  },
};
const THEMES = {};
for (const n in RAW) {
  THEMES[n] = {};
  for (const k in RAW[n]) THEMES[n][k] = k === 'label' ? RAW[n][k] : k === 'amb' ? [RAW[n][k], 0, 0, 1] : hex(RAW[n][k]);
}
let themeName = 'loyel';
let TH = JSON.parse(JSON.stringify(THEMES.loyel));
let thFrom = null, thTo = null, thT = 1;
const rootStyle = document.documentElement.style;

function applyCSS() {
  const set = (k, c) => { rootStyle.setProperty('--' + k, rgba(c)); rootStyle.setProperty('--' + k + '-rgb', rgb3(c)); };
  set('acc', TH.acc); set('soft', TH.soft); set('light', TH.light); set('glow', TH.glow);
  rootStyle.setProperty('--btn', rgba(TH.btn)); rootStyle.setProperty('--onbtn', rgba(TH.onbtn));
  rootStyle.setProperty('--edge-rgb', rgb3(TH.edge));
  rootStyle.setProperty('--cube', rgba(TH.cube));
  for (let i = 0; i < 5; i++) rootStyle.setProperty('--h' + i, rgba(TH['h' + i]));
  for (let i = 0; i < 3; i++) rootStyle.setProperty('--b' + i, rgba(TH['b' + i]));
  const amb = $('#amb'); if (amb) amb.style.opacity = TH.amb[0];
}
function setTheme(name, instant) {
  if (!THEMES[name]) return;
  themeName = name;
  thFrom = JSON.parse(JSON.stringify(TH));
  thTo = THEMES[name];
  thT = instant ? 1 : 0;
  if (instant) tickTheme(0);
  $$('#themes button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.theme === name)));
  try { localStorage.setItem('aureole-theme', name); } catch (e) { /* storage unavailable */ }
}
function tickTheme(dt) {
  if (thT >= 1 && !thFrom) return;
  thT = Math.min(1, thT + dt / 0.75);
  const e = eio2(thT);
  for (const k in thTo) {
    if (k === 'label') continue;
    TH[k] = mixc(thFrom[k], thTo[k], e);
  }
  applyCSS();
  if (thT >= 1) thFrom = null;
}
/* piecewise colour along the five track stops */
function trackColor(f) {
  const x = clamp(f) * 4, i = Math.min(3, x | 0);
  return mixc(TH['t' + i], TH['t' + (i + 1)], x - i);
}

/* ───────── layout ───────── */
const stage = $('#stage'), world = $('#world');
let k = 1, WW = 1280, WH = 720, CY = 346, DPR = 1;
const U = {};
const sizedCanvases = [];

function fit(c, w, h) {
  c.width = Math.max(1, Math.ceil(w * k * DPR));
  c.height = Math.max(1, Math.ceil(h * k * DPR));
  c.style.width = w + 'px';
  c.style.height = h + 'px';
  const ctx = c.getContext('2d');
  ctx.setTransform(k * DPR, 0, 0, k * DPR, 0, 0);
  return ctx;
}
const ctxs = {};

function layout() {
  const W = innerWidth, H = innerHeight;
  DPR = Math.min(2, window.devicePixelRatio || 1);
  k = W < 700 ? clamp(W / 470, .62, 1.05) : clamp(Math.min(W / 1040, H / 660), .7, 1.5);
  WW = W / k; WH = H / k; CY = WH / 2 - 14;
  world.style.width = WW + 'px';
  world.style.height = WH + 'px';
  world.style.transform = `scale(${k})`;

  U.pitch = 24;
  U.cols = Math.max(8, Math.floor(Math.min(640, WW - 56) / U.pitch));
  U.tw = U.cols * U.pitch;
  U.cube = Math.round(clamp(U.tw * .24, 92, 150));
  U.stageH = Math.max(U.cube, 5 * U.pitch + 6);
  U.prW = Math.round(Math.min(520, WW - 32)); U.prH = Math.round(U.prW * .62);
  U.cpW = Math.round(Math.min(460, WW - 32)); U.cpH = 196;
  U.tkW = Math.round(Math.min(500, WW - 32)); U.tkH = 244;
  U.cmW = Math.round(Math.min(520, WW - 32));
  const v = (n, x) => world.style.setProperty(n, x + 'px');
  v('--tw', U.tw); v('--cubeS', U.cube); v('--stageH', U.stageH); v('--prW', U.prW); v('--prH', U.prH);
  v('--cpW', U.cpW); v('--cpH', U.cpH); v('--tkW', U.tkW); v('--tkH', U.tkH); v('--cmW', U.cmW);
  $$('.scene').forEach(s => { s.style.top = '-14px'; s.style.bottom = '14px'; });

  ctxs.track = fit($('#trackC'), U.tw, U.stageH);
  ctxs.dots = fit($('#dotC'), U.prW, U.prH);
  ctxs.wave = fit($('#waveC'), U.cpW, U.cpH);
  const sl = $('#slider');
  U.sw = Math.max(120, U.tkW - 178);
  sl.style.flex = 'none'; sl.style.width = U.sw + 'px';
  ctxs.bar = fit($('#barC'), U.sw, 34);

  const cm = $('#cm'); cm.style.marginTop = '0px';
  cm.style.marginTop = -(cm.offsetHeight / 2 + 4) + 'px';
  const soon = $('#soon'), narrow = WW < 760;
  soon.style.left = narrow ? '0' : Math.max(20, WW * .5 - 380) + 'px';
  soon.style.right = narrow ? '0' : 'auto';
  soon.style.textAlign = narrow ? 'center' : 'left';
  soon.style.top = narrow ? (CY - 112) + 'px' : CY + 'px';
  soon.style.transform = narrow ? 'none' : 'translateY(-50%)';
  const t = $('#wlTitle'); t.style.top = CY + 'px';
  t.style.fontSize = (WW < 560 ? 36 : 46) + 'px';

  const fb = $('#fxb'), ff = $('#fx');
  for (const c of [fb, ff]) { c.width = Math.ceil(W * DPR); c.height = Math.ceil(H * DPR); }
  ctxs.fxb = fb.getContext('2d'); ctxs.fx = ff.getContext('2d');
  if (window.__onLayout) window.__onLayout();
}

/* world-space rectangle of any element (CSS px → world units) */
function rectW(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left / k, y: r.top / k, w: r.width / k, h: r.height / k, cx: (r.left + r.width / 2) / k, cy: (r.top + r.height / 2) / k };
}

/* ───────── text helpers ───────── */
/* two stacked layers: new text rises in with blur, old text lifts out */
class Swap {
  constructor(el, o = {}) {
    this.el = el; this.dy = o.dy ?? .5; this.dur = o.dur ?? .5; this.bl = o.blur ?? 7;
    this.a = document.createElement('i'); this.b = document.createElement('i');
    el.append(this.a, this.b); // current text first: the grid baseline must come from a layer that has text
    this.reset();
  }
  reset() { this.cur = null; this.a.innerHTML = ''; this.b.innerHTML = ''; this.t = -9; this.prev = false; this.apply(1); }
  set(html) {
    if (html === this.cur) return;
    this.b.innerHTML = this.a.innerHTML;
    this.prev = !!this.cur;
    this.a.innerHTML = html;
    this.cur = html; this.t = wall();
  }
  tick() { this.apply(clamp((wall() - this.t) / this.dur)); }
  apply(p) {
    const e = eo3(p), a = this.a.style, b = this.b.style;
    a.opacity = e; a.transform = `translateY(${((1 - e) * this.dy).toFixed(3)}em)`; a.filter = p < 1 ? `blur(${((1 - e) * this.bl).toFixed(2)}px)` : 'none';
    if (this.prev && p < 1) { b.opacity = 1 - e; b.transform = `translateY(${(-e * this.dy).toFixed(3)}em)`; b.filter = `blur(${(e * this.bl).toFixed(2)}px)`; }
    else b.opacity = 0;
  }
}
/* characters flicker through random glyphs, then lock in left to right */
class Scr {
  constructor(el) { this.el = el; this.reset(); }
  reset() { this.cur = null; this.prevS = ''; this.t = 0; this.dur = .7; this.el.textContent = ''; this.el.style.opacity = 0; }
  set(txt, dur = .7) {
    if (txt === this.cur) return;
    this.prevS = this.cur || ''; this.cur = txt; this.t = wall(); this.dur = dur;
  }
  tick() {
    if (this.cur === null) return;
    const p = clamp((wall() - this.t) / this.dur), s = this.cur, n = s.length;
    if (p >= 1) { if (this.el.textContent !== s) this.el.textContent = s; this.el.style.opacity = 1; this.el.style.filter = 'none'; return; }
    let out = '';
    for (let i = 0; i < n; i++) {
      const ch = s[i];
      const same = this.prevS.length === n && this.prevS[i] === ch;
      if (same || !/[0-9A-Za-z]/.test(ch) || p * 1.3 - .12 >= (i + 1) / n * .85) out += ch;
      else out += /[0-9]/.test(ch) ? (Math.random() * 10 | 0) : 'abcdefghjkmnoprstuvwxyz'[Math.random() * 23 | 0];
    }
    this.el.textContent = out;
    this.el.style.opacity = this.prevS ? 1 : clamp(p * 4);
    this.el.style.filter = this.prevS ? 'none' : `blur(${((1 - p) * 3).toFixed(1)}px)`;
  }
}
