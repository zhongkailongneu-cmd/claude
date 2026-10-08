import * as THREE from 'three';
import { SHAPES } from './shapes/index.js';
import { ParticleField } from './particles.js';
import { createBackdrop, createStars } from './ambient.js';
import { createComposer } from './post.js';
import { SpaceScore } from './audio.js';
import { buildUI } from './ui.js';
import { createSettings } from './settings.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const DEG = Math.PI / 180;

const params = new URLSearchParams(location.search);
const coarse = matchMedia('(pointer: coarse)').matches;
const mobile = coarse || Math.min(innerWidth, innerHeight) < 600;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const N = clamp(Number(params.get('n')) || (mobile ? 28000 : 60000), 2000, 200000);
const FOV = 40;
const CAM_Z = 16;

async function boot() {
  const { panels, railButtons } = buildUI();
  const hint = document.getElementById('hint');
  const soundBtn = document.getElementById('sound');
  const soundLabel = soundBtn.querySelector('.sound-label');
  const loaderCount = document.getElementById('loader-count');
  const track = document.getElementById('track');
  const canvas = document.getElementById('gl');
  const audio = new SpaceScore();

  // Settings drive the particle uniforms, the text styling and the mix.
  let field = null;
  let post = null;
  let stars = null;
  let userMuted = false;
  const settings = createSettings({
    onChange(key, value, state) {
      if (key === 'palette') audio.palette(value === 'mono');
      else if (key === 'glow') { applyGlow(state.glow); audio.slider(value / 100); }
      else if (key === 'textGlow' || key === 'size') audio.slider(key === 'size' ? (value - 80) / 45 : value / 100);
      else if (key === 'font') audio.uiClick();
      else if (key === 'music' || key === 'sfx') { audio.setVolumes(state.music / 100, state.sfx / 100); audio.slider(value / 100); }
      else if (key === 'panel') audio.panel(value);
    },
  });
  audio.setVolumes(settings.state.music / 100, settings.state.sfx / 100);

  function applyGlow(v) {
    const g = v / 70;
    if (field) field.uniforms.uGlow.value = g;
    if (stars) stars.uniforms.uGlow.value = g;
    if (post) post.setGlow(g);
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  } catch {
    document.querySelector('.loader-note').textContent = '这个浏览器无法启动 WebGL，粒子无法绘制，文字仍可阅读。';
    setTimeout(() => document.body.classList.add('ready'), 2500);
    panels.forEach((p, i) => { p.style.opacity = 1; p.style.visibility = 'visible'; p.style.position = 'relative'; p.style.minHeight = '100vh'; if (!i) p.classList.add('is-active'); });
    return;
  }
  renderer.setClearColor(0x02040a, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 0.1, 140);
  camera.position.set(0, 0, CAM_Z);

  const backdrop = createBackdrop();
  scene.add(backdrop.mesh);
  stars = createStars(mobile ? 1600 : 3600);
  scene.add(stars.points);

  // Build every body up front, one per tick, so the loader can count.
  const built = [];
  for (let k = 0; k < SHAPES.length; k++) {
    built.push(SHAPES[k].build(N));
    loaderCount.textContent = Math.round(((k + 1) / SHAPES.length) * N).toLocaleString('en-US');
    await new Promise((r) => setTimeout(r, 0));
  }

  field = new ParticleField(N);
  scene.add(field.points);
  const U = field.uniforms;
  // Keep overall brightness steady whatever the particle count, so dense
  // surfaces stay coloured instead of saturating to white.
  U.uAlpha.value = (0.62 * clamp(Math.pow(36000 / N, 0.55), 0.45, 1.3)) / (mobile ? 1.65 : 1);

  post = createComposer(renderer, scene, camera, { mobile });
  applyGlow(settings.state.glow);
  U.uMono.value = settings.state.palette === 'mono' ? 1 : 0;
  let monoSmooth = U.uMono.value;

  // ---------- layout ----------
  let W = innerWidth;
  let H = innerHeight;
  let vh = H;
  let dprCap = mobile ? 1.5 : 1.75;

  function resize() {
    W = innerWidth;
    H = innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    post.resize(W, H, dpr);
    const k = 2.6 * ((H * dpr) / 1080) * (mobile ? 1.2 : 1);
    U.uSizeK.value = k;
    stars.uniforms.uSizeK.value = k;
    backdrop.uniforms.uAspect.value = W / H;
    vh = track.firstElementChild?.getBoundingClientRect().height || H;
    readScroll();
  }

  function layout(shape) {
    const visH = 2 * CAM_Z * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const visW = visH * (W / H);
    const max = shape.max || 1.05;
    if (shape.center) return { x: 0, y: 0, s: Math.min(1, (visW * 0.98 * (shape.spill || 1)) / shape.w, (visH * 1.15) / shape.h) };
    if (W / H > 1) {
      const s = Math.min(max, (visW * 0.5) / shape.w, (visH * 0.8) / shape.h);
      return { x: visW * 0.21, y: -visH * 0.01, s };
    }
    const s = Math.min(max * 0.95, (visW * 0.96) / shape.w, (visH * 0.4) / shape.h);
    return { x: 0, y: visH * 0.25, s };
  }

  const tmpP = new THREE.Vector3();
  const tmpS = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const tmpE = new THREE.Euler();
  function modelFor(shape, out, t) {
    const L = layout(shape);
    const pose = shape.pose(t);
    const s = L.s * pose.k;
    tmpP.set(L.x + pose.p[0] * s, L.y + pose.p[1] * s, pose.p[2]);
    tmpE.set(pose.r[0], pose.r[1], pose.r[2], 'XYZ');
    tmpQ.setFromEuler(tmpE);
    tmpS.set(s, s, s);
    out.compose(tmpP, tmpQ, tmpS);
  }

  // ---------- scroll ----------
  const n = SHAPES.length;
  let target = 0;
  let prog = 0;
  function readScroll() {
    target = clamp(window.scrollY / vh, 0, n - 1);
  }
  addEventListener('scroll', readScroll, { passive: true });
  addEventListener('resize', resize);

  function go(i) {
    window.scrollTo({ top: i * vh, behavior: reduced ? 'auto' : 'smooth' });
  }

  // ---------- sound ----------
  function setSoundUI(on) {
    soundBtn.setAttribute('aria-pressed', String(on));
    soundLabel.textContent = on ? '声音 开' : '声音 关';
  }
  async function soundOn() {
    if (!audio.supported) {
      soundLabel.textContent = '无音频';
      return;
    }
    const ok = await audio.start();
    audio.setScene(active < 0 ? 0 : active);
    setSoundUI(ok);
  }
  function soundOff() {
    audio.stop();
    setSoundUI(false);
  }
  function toggleSound() {
    if (audio.on) {
      userMuted = true;
      soundOff();
    } else {
      userMuted = false;
      soundOn();
    }
  }
  soundBtn.addEventListener('click', toggleSound);

  // ---------- spin (drag to rotate) ----------
  // Each page keeps a spin phase: base (so the chosen longitude faces the
  // camera when the page loads) plus whatever the visitor has dragged.
  const spinBase = new Float32Array(n);
  const spinDrag = new Float32Array(n);
  let spinVel = 0;
  function resetBase(i) {
    const sh = SHAPES[i];
    spinBase[i] = sh.type === 0 ? 0 : -(sh.face || 0) * DEG - sh.par[0] * time;
  }

  // ---------- pointer ----------
  const ndc = new THREE.Vector2(0, 0);
  const mouseWorld = new THREE.Vector3(999, 999, 0);
  let lastMove = -10;
  let time = 0;
  let pointerSeen = false;
  let lastPX = 0, lastPY = 0, lastPT = 0;
  let drag = null;
  const toWorld = (x, y, out) => {
    const v = new THREE.Vector3(x, y, 0.5).unproject(camera).sub(camera.position).normalize();
    const d = -camera.position.z / v.z;
    return out.copy(camera.position).addScaledVector(v, d);
  };
  const onUI = (el) => el.closest('button, a, input, select, label, .settings, .topbar, .rail');

  addEventListener('pointermove', (e) => {
    ndc.set((e.clientX / W) * 2 - 1, -(e.clientY / H) * 2 + 1);
    const now = performance.now();
    const dtp = Math.max(1, now - lastPT);
    const speed = Math.hypot(e.clientX - lastPX, e.clientY - lastPY) / dtp; // px per ms
    if (pointerSeen && !drag && !onUI(e.target)) audio.lens(speed, ndc.x);
    if (drag && e.pointerId === drag.id) {
      const dx = e.clientX - drag.x;
      drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0));
      if (drag.moved > 6) document.body.classList.add('dragging');
      const page = Math.round(prog);
      const k = SHAPES[page].type === 0 ? 40 : 4.2;
      const d = (dx / W) * k;
      spinDrag[page] += d;
      spinVel = spinVel * 0.6 + (d / (dtp / 1000)) * 0.4;
      drag.x = e.clientX;
    }
    lastPX = e.clientX;
    lastPY = e.clientY;
    lastPT = now;
    lastMove = time;
    pointerSeen = true;
  }, { passive: true });

  addEventListener('pointerdown', (e) => {
    if (onUI(e.target)) return;
    if (!audio.on && !userMuted) soundOn();
    drag = { id: e.pointerId, x: e.clientX, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: 0 };
    spinVel = 0;
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const click = drag.moved < 6 && performance.now() - drag.t0 < 450;
    drag = null;
    document.body.classList.remove('dragging');
    if (click && e.type === 'pointerup' && !reduced) {
      const p = toWorld((e.clientX / W) * 2 - 1, -(e.clientY / H) * 2 + 1, new THREE.Vector3());
      U.uRipple.value.set(p.x, p.y, time, 1);
      audio.pulse((e.clientX / W) * 2 - 1);
    }
  };
  addEventListener('pointerup', endDrag);
  addEventListener('pointercancel', endDrag);

  document.addEventListener('click', (e) => {
    const goEl = e.target.closest('[data-go]');
    if (goEl) {
      e.preventDefault();
      audio.uiClick();
      go(Number(goEl.dataset.go));
      return;
    }
    if (e.target.closest('[data-action="launch"]')) {
      userMuted = false;
      soundOn().then(() => audio.uiClick());
      go(1);
      return;
    }
    if (e.target.closest('.settings button, .gear')) audio.uiClick();
  });
  let hoverEl = null;
  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest('button, a, select');
    if (el && el !== hoverEl) audio.uiHover();
    hoverEl = el;
  });

  addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea')) return;
    const k = e.key.toLowerCase();
    if (k === 'c') settings.togglePalette();
    else if (k === 'm') toggleSound();
    else if (k === 's') settings.toggleOpen();
    else if (!audio.on && !userMuted && (e.key === ' ' || e.key === 'Enter' || e.key.startsWith('Arrow') || e.key.startsWith('Page'))) soundOn();
  });

  // ---------- frame loop ----------
  let last = performance.now();
  let active = -1;
  let lastProg = -1;
  let slowFrames = 0;
  let sampled = 0;
  let whooshDest = 0;
  const glowA = { x: 0, y: 0, amt: 0, size: 0 };
  const glowB = { x: 0, y: 0, amt: 0, size: 0 };
  const proj = new THREE.Vector3();

  function updatePanels() {
    panels.forEach((el, i) => {
      const d = prog - i;
      const o = clamp(1 - Math.abs(d) * 2.6, 0, 1);
      el.style.opacity = o.toFixed(3);
      el.style.visibility = o > 0.002 ? 'visible' : 'hidden';
      el.style.transform = `translate3d(0, ${(-d * 70).toFixed(1)}px, 0)`;
      el.classList.toggle('is-active', Math.abs(d) < 0.3);
    });
    hint.style.opacity = String(1 - smoothstep(0.02, 0.2, prog));
  }

  // Where the sunlight comes from, per page (screen uv, amount, size).
  function glowFor(i, model, out) {
    const sh = SHAPES[i];
    if (sh.type === 0 || sh.type === 1 || sh.type === 3) {
      proj.setFromMatrixPosition(model).project(camera);
      out.x = proj.x * 0.5 + 0.5;
      out.y = proj.y * 0.5 + 0.5;
      out.amt = sh.type === 1 ? 0.6 : sh.type === 0 ? 0.55 : 0.4;
      out.size = sh.type === 1 ? 0.5 : 0.26;
    } else {
      out.x = W / H > 1 ? -0.06 : -0.3;
      out.y = W / H > 1 ? 0.62 : 0.9;
      out.amt = 0.62 / (1 + (i - 2) * 0.32);
      out.size = 0.55;
    }
    return out;
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt * (reduced ? 0.4 : 1);

    prog += (target - prog) * (1 - Math.exp(-dt * 4.2));
    if (Math.abs(target - prog) < 1e-4) prog = target;

    const dest = Math.round(target);
    if (dest !== whooshDest && Math.abs(target - prog) > 0.25) {
      audio.whoosh(Math.sign(target - prog), clamp(Math.abs(target - prog), 0.5, 1));
      whooshDest = dest;
    }

    const seg = clamp(Math.floor(prog), 0, n - 2);
    const local = clamp(prog - seg, 0, 1);
    const fresh = field.setSegment(seg, SHAPES, built);
    if (fresh) fresh.forEach(resetBase);
    U.uMorph.value = smoothstep(0.08, 0.92, local);
    modelFor(SHAPES[seg], U.uModelA.value, time);
    modelFor(SHAPES[seg + 1], U.uModelB.value, time);
    U.uTime.value = time;

    // Drag inertia.
    if (!drag) {
      const page = Math.round(prog);
      spinDrag[page] += spinVel * dt;
      spinVel *= Math.exp(-dt * 2.2);
    }
    audio.spin(Math.abs(spinVel) / (SHAPES[Math.round(prog)].type === 0 ? 60 : 6));
    U.uSpinA.value = spinBase[seg] + spinDrag[seg];
    U.uSpinB.value = spinBase[seg + 1] + spinDrag[seg + 1];

    // Palette: a 1.4 s sweep.
    const monoT = settings.state.palette === 'mono' ? 1 : 0;
    const step = dt / 1.4;
    U.uMono.value += clamp(monoT - U.uMono.value, -step, step);
    monoSmooth += (monoT - monoSmooth) * (1 - Math.exp(-dt * 2.5));
    backdrop.uniforms.uMono.value = monoSmooth;
    stars.uniforms.uMono.value = monoSmooth;

    // Gentle camera parallax that follows the pointer.
    const px = pointerSeen && !coarse ? ndc.x : Math.sin(time * 0.1) * 0.3;
    const py = pointerSeen && !coarse ? ndc.y : Math.sin(time * 0.13) * 0.2;
    camera.position.x += (px * 0.8 - camera.position.x) * 0.03;
    camera.position.y += (py * 0.45 - camera.position.y) * 0.03;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    const recent = time - lastMove < 1.4 && !drag;
    U.uMouseF.value += ((recent ? 1 : 0) - U.uMouseF.value) * 0.06;
    if (pointerSeen) toWorld(ndc.x, ndc.y, mouseWorld);
    U.uMouse.value.copy(mouseWorld);

    // Sunlight glow in the backdrop, blended between the two pages.
    glowFor(seg, U.uModelA.value, glowA);
    glowFor(seg + 1, U.uModelB.value, glowB);
    const mg = U.uMorph.value;
    backdrop.uniforms.uGlowPos.value.set(glowA.x + (glowB.x - glowA.x) * mg, glowA.y + (glowB.y - glowA.y) * mg);
    backdrop.uniforms.uGlowAmt.value = (glowA.amt + (glowB.amt - glowA.amt) * mg) * (0.4 + 0.6 * Math.min(1, U.uGlow.value));
    backdrop.uniforms.uGlowSize.value = glowA.size + (glowB.size - glowA.size) * mg;
    backdrop.uniforms.uDepth.value = prog / (n - 1);
    backdrop.uniforms.uTime.value = time;
    stars.uniforms.uTime.value = time;
    stars.uniforms.uScroll.value = prog;
    post.final.uniforms.uTime.value = time;

    if (Math.abs(prog - lastProg) > 1e-4) {
      updatePanels();
      lastProg = prog;
    }
    const idx = Math.round(prog);
    if (idx !== active) {
      const first = active < 0;
      active = idx;
      railButtons.forEach((b, i) => b.setAttribute('aria-current', String(i === idx)));
      audio.setScene(idx);
      if (!first) {
        audio.arrive(idx);
        audio.neon();
      }
    }

    post.composer.render(dt);

    // If the first seconds run slowly, render at a lower resolution.
    if (sampled < 150) {
      sampled++;
      if (dt > 1 / 32) slowFrames++;
      if (sampled === 150 && slowFrames > 90 && dprCap > 1) {
        dprCap = Math.max(1, dprCap * 0.7);
        resize();
      }
    }
    requestAnimationFrame(frame);
  }

  resize();
  prog = target;
  whooshDest = Math.round(target);
  updatePanels();
  requestAnimationFrame((t) => {
    last = t;
    frame(t);
    document.body.classList.add('ready');
  });

  // Hooks for automated screenshots and tests.
  window.__solar = {
    jump(i) {
      window.scrollTo({ top: i * vh, behavior: 'auto' });
      target = prog = i;
      whooshDest = Math.round(i);
    },
    setTime(t) { time = t; },
    spin(i, a) { spinDrag[i] = a; },
    pointer(x, y) { ndc.set(x, y); pointerSeen = true; lastMove = time; },
    audio,
    settings,
    get state() { return { prog, target, active, mono: U.uMono.value, glow: U.uGlow.value }; },
  };
}

boot();
