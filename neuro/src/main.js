import * as THREE from 'three';
import { SHAPES } from './shapes/index.js';
import { ParticleField } from './particles.js';
import { createBackdrop, createDust } from './ambient.js';
import { createComposer } from './post.js';
import { NeuroScore } from './audio.js';
import { buildUI } from './ui.js';
import { createSettings } from './settings.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const params = new URLSearchParams(location.search);
const coarse = matchMedia('(pointer: coarse)').matches;
const mobile = coarse || Math.min(innerWidth, innerHeight) < 600;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const N = clamp(Number(params.get('n')) || (mobile ? 26000 : 60000), 2000, 200000);
const FOV = 40;
const CAM_Z = 16;

async function boot() {
  const { panels, railButtons } = buildUI();
  const hint = document.getElementById('hint');
  const soundBtn = document.getElementById('sound');
  const soundLabel = soundBtn.querySelector('.sound-label');
  const loaderCount = document.getElementById('loader-count');
  const track = document.getElementById('track');
  const sparks = document.getElementById('sparks');
  const canvas = document.getElementById('gl');
  const audio = new NeuroScore();

  // Settings apply to type immediately; particle glow and volume are wired once the scene exists.
  let applyGlow = () => {};
  const settings = createSettings({
    onChange: (s) => {
      applyGlow(s.particleGlow);
      audio.setVolumes(s.music, s.sfx);
    },
    sound: (kind, v) => audio.ui(kind, v),
  });

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  } catch {
    document.querySelector('.loader-note').textContent = '这个浏览器无法启动 WebGL，粒子无法绘制；下方文字仍可阅读。';
    setTimeout(() => document.body.classList.add('ready'), 2500);
    panels.forEach((p, i) => { p.style.opacity = 1; p.style.visibility = 'visible'; p.style.position = 'relative'; p.style.minHeight = '100vh'; if (!i) p.classList.add('is-active'); });
    return;
  }
  renderer.setClearColor(0x02060d, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 0.1, 120);
  camera.position.set(0, 0, CAM_Z);

  const backdrop = createBackdrop();
  scene.add(backdrop.mesh);
  const dust = createDust(mobile ? 900 : 2200);
  scene.add(dust.points);

  // Build every page up front, one per tick, so the loader can count.
  const built = [];
  for (let k = 0; k < SHAPES.length; k++) {
    built.push(SHAPES[k].build(N));
    loaderCount.textContent = Math.round(((k + 1) / SHAPES.length) * N).toLocaleString('en-US');
    await new Promise((r) => setTimeout(r, 0));
  }

  const field = new ParticleField(N);
  scene.add(field.points);
  const U = field.uniforms;
  // Keep overall brightness steady whatever the particle count, so dense
  // structures stay blue instead of saturating to white.
  const baseAlpha = (0.6 * clamp(Math.pow(36000 / N, 0.55), 0.45, 1.3)) / (mobile ? 1.3 : 1);

  const post = createComposer(renderer, scene, camera, { mobile });
  applyGlow = (g) => {
    U.uGlow.value = g;
    U.uAlpha.value = baseAlpha * Math.pow(g, 0.6);
    post.setGlow(g);
  };
  applyGlow(settings.state.particleGlow);
  audio.setVolumes(settings.state.music, settings.state.sfx);

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
    const k = 2.6 * ((H * dpr) / 1080) * (mobile ? 1.25 : 1);
    U.uSizeK.value = k;
    dust.uniforms.uSizeK.value = k;
    backdrop.uniforms.uAspect.value = W / H;
    vh = track.firstElementChild?.getBoundingClientRect().height || H;
    readScroll();
  }

  function layout(shape) {
    const visH = 2 * CAM_Z * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const visW = visH * (W / H);
    if (shape.center) return { x: 0, y: 0, s: Math.min(1, (visW * 0.98 * (shape.spill || 1)) / shape.w, (visH * 1.1) / shape.h) };
    if (W / H > 1) {
      const s = Math.min(1.05, (visW * 0.42) / shape.w, (visH * 0.78) / shape.h);
      return { x: visW * 0.18, y: -visH * 0.01, s };
    }
    const s = Math.min(1, (visW * 0.9) / shape.w, (visH * 0.4) / shape.h);
    return { x: -visW * 0.02, y: visH * 0.24, s };
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
  let userMuted = false;
  function setSoundUI(on) {
    soundBtn.setAttribute('aria-pressed', String(on));
    soundLabel.textContent = on ? '声音 开' : '声音 关';
  }
  async function soundOn() {
    if (!audio.supported) {
      soundLabel.textContent = '不支持音频';
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
  soundBtn.addEventListener('click', () => {
    if (audio.on) {
      userMuted = true;
      soundOff();
    } else {
      userMuted = false;
      soundOn();
    }
  });

  // Soft ticks when the pointer reaches a control, a blip when one is pressed.
  document.addEventListener('pointerover', (e) => {
    const b = e.target.closest('button, a');
    if (!b || (e.relatedTarget && b.contains(e.relatedTarget))) return;
    audio.ui('hover');
  });

  // ---------- pointer ----------
  const ndc = new THREE.Vector2(0, 0);
  const mouseWorld = new THREE.Vector3(999, 999, 0);
  let lastMove = -10;
  let time = 0;
  let pointerSeen = false;
  let lastPX = 0;
  let lastPY = 0;
  let lastPT = 0;
  const toWorld = (x, y, out) => {
    const v = new THREE.Vector3(x, y, 0.5).unproject(camera).sub(camera.position).normalize();
    const d = -camera.position.z / v.z;
    return out.copy(camera.position).addScaledVector(v, d);
  };
  const overUI = (el) => el && el.closest && el.closest('button, a, .settings, .rail, .topbar');
  addEventListener('pointermove', (e) => {
    ndc.set((e.clientX / W) * 2 - 1, -(e.clientY / H) * 2 + 1);
    lastMove = time;
    pointerSeen = true;
    const now = performance.now();
    const dt = Math.max(1, now - lastPT);
    const speed = Math.hypot(e.clientX - lastPX, e.clientY - lastPY) / dt;
    lastPX = e.clientX;
    lastPY = e.clientY;
    lastPT = now;
    if (!overUI(e.target) && e.pointerType !== 'touch') audio.hover(speed, ndc.x * 0.8);
  }, { passive: true });

  document.addEventListener('click', (e) => {
    const goEl = e.target.closest('[data-go]');
    if (goEl) {
      e.preventDefault();
      audio.ui('click');
      go(Number(goEl.dataset.go));
      return;
    }
    if (e.target.closest('[data-action="enter"]')) {
      userMuted = false;
      soundOn().then(() => audio.ui('click'));
      go(1);
      return;
    }
    if (e.target.closest('.cta, .chip')) audio.ui('click');
  });

  // Click: fire an action potential. Clicks less than a second apart act like
  // a high-frequency train and potentiate: brighter ring, rising pitch.
  let ltp = 0;
  let lastClick = -10;
  function fireAt(cx, cy) {
    if (!audio.on && !userMuted) soundOn();
    if (!document.getElementById('settings').hidden) settings.setOpen(false);
    const now = performance.now() / 1000;
    ltp = now - lastClick < 1.0 ? Math.min(6, ltp + 1) : 1;
    lastClick = now;
    const x = (cx / W) * 2 - 1;
    audio.fire(ltp, x * 0.8);
    showSpark(cx, cy, ltp);
    if (reduced) return;
    const p = toWorld(x, -(cy / H) * 2 + 1, new THREE.Vector3());
    U.uRipple.value.set(p.x, p.y, time, 0.75 + 0.22 * ltp);
    U.uBoost.value = Math.max(U.uBoost.value, (ltp - 1) / 5);
  }
  // Mouse and pen fire on press. A finger fires only on a tap, so swiping
  // through the pages stays silent.
  let tap = null;
  addEventListener('pointerdown', (e) => {
    if (overUI(e.target)) return;
    if (e.pointerType === 'touch') tap = { x: e.clientX, y: e.clientY, t: performance.now() };
    else fireAt(e.clientX, e.clientY);
  });
  addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch' || !tap) return;
    const moved = Math.hypot(e.clientX - tap.x, e.clientY - tap.y);
    if (moved < 12 && performance.now() - tap.t < 400 && !overUI(e.target)) fireAt(e.clientX, e.clientY);
    tap = null;
  });
  addEventListener('pointercancel', () => { tap = null; });

  function showSpark(x, y, level) {
    const el = document.createElement('span');
    el.className = 'spark';
    el.style.left = `${x}px`;
    el.style.top = `${y - 18}px`;
    el.innerHTML = level === 1 ? '<b>AP</b><small>动作电位</small>' : `<b>LTP ×${level}</b>${level >= 4 ? '<small>突触增强</small>' : ''}`;
    sparks.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  addEventListener('keydown', (e) => {
    if (!audio.on && !userMuted && (e.key === ' ' || e.key === 'Enter' || e.key.startsWith('Arrow') || e.key.startsWith('Page'))) soundOn();
  });

  // ---------- frame loop ----------
  let last = performance.now();
  let active = -1;
  let lastProg = -1;
  let slowFrames = 0;
  let sampled = 0;
  let prevTime = 0;

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

  // Sounds that belong to the animation on screen fire as its cycle passes them.
  function fireEvents(idx, t0, t1) {
    for (const ev of SHAPES[idx].events || []) {
      ev.at.forEach((phase, k) => {
        if (Math.floor(t1 / ev.period - phase) > Math.floor(t0 / ev.period - phase)) audio.event(ev.name, k);
      });
    }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    prevTime = time;
    time += dt * (reduced ? 0.4 : 1);

    prog += (target - prog) * (1 - Math.exp(-dt * 4.2));
    if (Math.abs(target - prog) < 1e-4) prog = target;

    const seg = clamp(Math.floor(prog), 0, n - 2);
    const local = clamp(prog - seg, 0, 1);
    field.setSegment(seg, SHAPES, built);
    U.uMorph.value = smoothstep(0.08, 0.92, local);
    modelFor(SHAPES[seg], U.uModelA.value, time);
    modelFor(SHAPES[seg + 1], U.uModelB.value, time);
    U.uTime.value = time;
    U.uBoost.value = Math.max(0, U.uBoost.value - dt * 0.25);

    const px = pointerSeen && !coarse ? ndc.x : Math.sin(time * 0.1) * 0.3;
    const py = pointerSeen && !coarse ? ndc.y : Math.sin(time * 0.13) * 0.2;
    camera.position.x += (px * 0.9 - camera.position.x) * 0.03;
    camera.position.y += (py * 0.5 - camera.position.y) * 0.03;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    const recent = time - lastMove < 1.2;
    U.uMouseF.value += ((recent ? 1 : 0) - U.uMouseF.value) * 0.06;
    if (pointerSeen) toWorld(ndc.x, ndc.y, mouseWorld);
    U.uMouse.value.copy(mouseWorld);

    backdrop.uniforms.uDepth.value = prog / (n - 1);
    backdrop.uniforms.uTime.value = time;
    dust.uniforms.uTime.value = time;
    dust.uniforms.uScroll.value = prog;
    post.final.uniforms.uTime.value = time;

    if (Math.abs(prog - lastProg) > 1e-4) {
      updatePanels();
      lastProg = prog;
    }
    const idx = Math.round(prog);
    if (idx !== active) {
      if (active >= 0) audio.transition(idx > active);
      active = idx;
      railButtons.forEach((b, i) => b.setAttribute('aria-current', String(i === idx)));
      audio.setScene(idx);
    }
    if (Math.abs(prog - idx) < 0.25) fireEvents(idx, prevTime, time);

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
  updatePanels();
  requestAnimationFrame((t) => {
    last = t;
    frame(t);
    document.body.classList.add('ready');
  });

  // Hooks for automated screenshots and checks.
  window.__neuro = {
    jump(i) {
      window.scrollTo({ top: i * vh, behavior: 'auto' });
      target = prog = i;
    },
    setTime(t) { time = t; },
    audio,
    settings,
    soundOn,
  };
}

boot();
