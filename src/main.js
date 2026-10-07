import * as THREE from 'three';
import { SHAPES } from './shapes/index.js';
import { ParticleField } from './particles.js';
import { createBackdrop, createSnow } from './ambient.js';
import { createComposer } from './post.js';
import { DeepScore } from './audio.js';
import { buildUI } from './ui.js';

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
  const canvas = document.getElementById('gl');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  } catch {
    document.querySelector('.loader-note').textContent = 'This browser could not start WebGL, so the creatures cannot be drawn. The text below still reads.';
    setTimeout(() => document.body.classList.add('ready'), 2500);
    panels.forEach((p, i) => { p.style.opacity = 1; p.style.visibility = 'visible'; p.style.position = 'relative'; p.style.minHeight = '100vh'; if (!i) p.classList.add('is-active'); });
    return;
  }
  renderer.setClearColor(0x01040b, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 0.1, 120);
  camera.position.set(0, 0, CAM_Z);

  const backdrop = createBackdrop();
  scene.add(backdrop.mesh);
  const snow = createSnow(mobile ? 900 : 2200);
  scene.add(snow.points);

  // Build every creature up front, one per tick, so the loader can count.
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
  // bodies stay coloured instead of saturating to white.
  U.uAlpha.value = (0.6 * clamp(Math.pow(36000 / N, 0.55), 0.45, 1.3)) / (mobile ? 1.3 : 1);

  const post = createComposer(renderer, scene, camera, { mobile });
  const audio = new DeepScore();

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
    snow.uniforms.uSizeK.value = k;
    backdrop.uniforms.uAspect.value = W / H;
    vh = track.firstElementChild?.getBoundingClientRect().height || H;
    readScroll();
  }

  function layout(shape) {
    const visH = 2 * CAM_Z * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const visW = visH * (W / H);
    if (shape.center) return { x: 0, y: 0, s: Math.min(1, (visW * 0.98 * (shape.spill || 1)) / shape.w, (visH * 1.15) / shape.h) };
    if (W / H > 1) {
      const s = Math.min(1.05, (visW * 0.5) / shape.w, (visH * 0.78) / shape.h);
      return { x: visW * 0.2, y: -visH * 0.02, s };
    }
    const s = Math.min(1, (visW * 0.94) / shape.w, (visH * 0.36) / shape.h);
    return { x: 0, y: visH * 0.26, s };
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
    soundLabel.textContent = on ? 'Sound on' : 'Sound off';
  }
  async function soundOn() {
    if (!audio.supported) {
      soundLabel.textContent = 'No audio';
      return;
    }
    const ok = await audio.start();
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

  // ---------- pointer ----------
  const ndc = new THREE.Vector2(0, 0);
  const mouseWorld = new THREE.Vector3(999, 999, 0);
  let lastMove = -10;
  let time = 0;
  let pointerSeen = false;
  const toWorld = (x, y, out) => {
    const v = new THREE.Vector3(x, y, 0.5).unproject(camera).sub(camera.position).normalize();
    const d = -camera.position.z / v.z;
    return out.copy(camera.position).addScaledVector(v, d);
  };
  addEventListener('pointermove', (e) => {
    ndc.set((e.clientX / W) * 2 - 1, -(e.clientY / H) * 2 + 1);
    lastMove = time;
    pointerSeen = true;
  }, { passive: true });

  document.addEventListener('click', (e) => {
    const goEl = e.target.closest('[data-go]');
    if (goEl) {
      e.preventDefault();
      go(Number(goEl.dataset.go));
      return;
    }
    if (e.target.closest('[data-action="dive"]')) {
      userMuted = false;
      soundOn();
      go(1);
    }
  });

  addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, a')) return;
    if (!audio.on && !userMuted) soundOn();
    if (reduced) return;
    const p = toWorld((e.clientX / W) * 2 - 1, -(e.clientY / H) * 2 + 1, new THREE.Vector3());
    U.uRipple.value.set(p.x, p.y, time, 1);
    if (audio.on) audio.ping(undefined, 0.07);
  });
  addEventListener('keydown', (e) => {
    if (!audio.on && !userMuted && (e.key === ' ' || e.key === 'Enter' || e.key.startsWith('Arrow') || e.key.startsWith('Page'))) soundOn();
  });

  // ---------- frame loop ----------
  let last = performance.now();
  let active = -1;
  let lastProg = -1;
  let slowFrames = 0;
  let sampled = 0;

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

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
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

    // Gentle camera parallax that follows the pointer.
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
    snow.uniforms.uTime.value = time;
    snow.uniforms.uScroll.value = prog;
    post.final.uniforms.uTime.value = time;

    if (Math.abs(prog - lastProg) > 1e-4) {
      updatePanels();
      lastProg = prog;
    }
    const idx = Math.round(prog);
    if (idx !== active) {
      active = idx;
      railButtons.forEach((b, i) => b.setAttribute('aria-current', String(i === idx)));
      audio.setScene(idx);
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
  updatePanels();
  requestAnimationFrame((t) => {
    last = t;
    frame(t);
    document.body.classList.add('ready');
  });

  // Hooks for automated screenshots.
  window.__deep = {
    jump(i) {
      window.scrollTo({ top: i * vh, behavior: 'auto' });
      target = prog = i;
    },
    setTime(t) { time = t; },
    audio,
  };
}

boot();
