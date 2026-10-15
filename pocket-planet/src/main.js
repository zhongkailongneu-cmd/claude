import * as THREE from 'three';
import {
  R, WATER, SEASONS, LANDMARKS, SPAWNS, height, seasonAt, seasonWeights, bridgeDeck, toLL, clamp, lerp, smoothstep, tangentToward,
} from './world.js';
import { buildTerrain, buildWater } from './planet.js';
import { buildSurface } from './surface.js';
import { buildProps } from './props.js';
import { buildEffects } from './effects.js';
import { buildCharacter } from './character.js';
import { initUI } from './ui.js';

const V3 = THREE.Vector3;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
const PR = Math.min(devicePixelRatio || 1, 2);
renderer.setPixelRatio(PR);
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 700);

scene.add(new THREE.AmbientLight('#E8EEF6', 1.15));
const sun = new THREE.DirectionalLight('#FFF3E0', 2.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -14.5, right: 14.5, top: 14.5, bottom: -14.5, near: 18, far: 64 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight('#9FBDDA', 0.55);
scene.add(fill, fill.target);

// ---------------------------------------------------------------- world
const uWaterTime = { value: 0 };
const terrain = buildTerrain();
scene.add(terrain);
scene.add(buildWater(uWaterTime));
const surf = buildSurface(terrain.geometry);
const props = buildProps(scene, surf);
const fx = buildEffects(scene, surf);
const hero = buildCharacter();
scene.add(hero.root);

// marker that floats over the character in the overview
const marker = new THREE.Mesh(
  new THREE.OctahedronGeometry(0.5, 0),
  new THREE.MeshBasicMaterial({ color: '#F4F7FB', transparent: true, opacity: 0.95 }),
);
marker.scale.set(0.8, 1.3, 0.8);
scene.add(marker);

// ---------------------------------------------------------------- character state
const ch = {
  p: SPAWNS[0].dir.clone(),
  f: tangentToward(SPAWNS[0].dir, SPAWNS[0].look),
  vel: new V3(),
  h: 0,
  vy: 0,
  air: false,
  water: false,
  ice: false,
  speed: 0,
};

function groundAt(p, curH = -9) {
  let g = surf(p);
  const deck = bridgeDeck(p);
  let onDeck = false;
  if (deck !== null && curH >= deck - 0.38) { g = Math.max(g, deck); onDeck = true; }
  let water = false, ice = false;
  if (!onDeck && g < WATER + 0.02) {
    if (seasonWeights(p)[3] > 0.5) { ice = true; g = WATER + 0.02; }
    else { water = true; g = Math.max(g, WATER - 0.3); }
  }
  return { g, water, ice };
}
ch.h = groundAt(ch.p).g;

const _q = new THREE.Quaternion(), _v = new V3(), _w = new V3();
function transport(vec, from, to) {
  _q.setFromUnitVectors(from, to);
  const len = vec.length();
  vec.applyQuaternion(_q).addScaledVector(to, -vec.dot(to));
  if (vec.lengthSq() > 1e-12) vec.setLength(len);
}

function collide(p) {
  for (const o of props.obstacles) {
    const c = p.dot(o.dir);
    if (c < 0.97) continue;
    _v.copy(p).sub(o.dir).multiplyScalar(R);
    const dist = _v.length();
    const min = o.r + 0.2;
    if (dist < min && dist > 1e-6) {
      p.addScaledVector(_v, (min - dist) / dist / R).normalize();
    }
  }
}

// ---------------------------------------------------------------- input
const keys = new Set();
const GAME = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight']);
let lastInput = 0;
addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (GAME.has(e.code)) { keys.add(e.code); e.preventDefault(); lastInput = performance.now(); }
  if (e.code === 'Space' && !e.repeat) jump();
  if (!e.repeat && /^Digit[1-4]$/.test(e.code)) hopTo(+e.code.slice(5) - 1);
  if (!e.repeat && (e.code === 'KeyV' || e.code === 'Digit5')) toggleOverview();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

function jump() {
  if (hop || ch.air) return;
  ch.air = true;
  ch.vy = 6.2;
}

// camera orbit by drag, zoom by wheel
const follow = { yaw: 0, pitch: 0.5, dist: 6.6 };
const ov = { az: 1.2, el: 0.95, zoom: 1 };
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  if (mode === 'follow') {
    follow.yaw -= dx * 0.006;
    follow.pitch = clamp(follow.pitch + dy * 0.004, 0.08, 1.25);
  } else {
    ov.az += dx * 0.005;
    ov.el = clamp(ov.el + dy * 0.004, -1.3, 1.3);
  }
  lastDrag = performance.now();
});
const endDrag = (e) => { if (drag && drag.id === e.pointerId) drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
let lastDrag = 0;
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const k = Math.exp(e.deltaY * 0.001);
  if (mode === 'follow') follow.dist = clamp(follow.dist * k, 3.2, 12);
  else ov.zoom = clamp(ov.zoom * k, 0.7, 1.7);
}, { passive: false });

// ---------------------------------------------------------------- modes
let mode = 'overview';
let modeAt = 0;
let introPending = true;
function setMode(m) {
  if (m === mode) return;
  mode = m;
  modeAt = clock;
  introPending = false;
  ui.setOverview(m === 'overview');
}
function toggleOverview() { setMode(mode === 'overview' ? 'follow' : 'overview'); }

let hop = null;
function hopTo(i) {
  const sp = SPAWNS[i];
  const from = ch.p.clone(), to = sp.dir.clone();
  const ang = from.angleTo(to);
  const face = tangentToward(to, sp.look);
  setMode('follow');
  follow.yaw = 0;
  if (ang < 0.01) { ch.f.copy(face); return; }
  const axis = new V3().crossVectors(from, to);
  if (axis.lengthSq() < 1e-10) axis.set(0, 1, 0).cross(from);
  axis.normalize();
  hop = { t: 0, dur: 1.0 + ang * 0.55, from, to, ang, axis, h0: ch.h, h1: groundAt(to).g, face };
  ch.air = false; ch.vy = 0;
}

const ui = initUI({ onSeason: hopTo, onOverview: toggleOverview, onJump: jump });
ui.setOverview(true);

// ---------------------------------------------------------------- update
const desired = new V3(), old = new V3();
let hopLift = 0;

function updateWalk(dt) {
  const k = (a, b) => (keys.has(a) || keys.has(b) ? 1 : 0);
  const fwd = clamp(k('KeyW', 'ArrowUp') - k('KeyS', 'ArrowDown') + ui.joy.y, -1, 1);
  const turn = clamp(k('KeyA', 'ArrowLeft') - k('KeyD', 'ArrowRight') - ui.joy.x, -1, 1);
  if ((Math.abs(fwd) > 0.05 || Math.abs(turn) > 0.05) && mode === 'overview') setMode('follow');
  if (Math.abs(fwd) > 0.05 || Math.abs(turn) > 0.05) introPending = false;

  const up = ch.p;
  if (turn) ch.f.applyAxisAngle(up, turn * 2.5 * dt);
  const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const max = (run ? 4.6 : 2.7) * (ch.water ? 0.55 : 1);
  desired.copy(ch.f).multiplyScalar(fwd * max * (fwd < 0 ? 0.6 : 1));
  const acc = ch.ice ? 1.3 : 12;
  ch.vel.lerp(desired, 1 - Math.exp(-acc * dt));
  ch.speed = ch.vel.dot(ch.f);

  if (ch.vel.lengthSq() > 1e-8) {
    old.copy(ch.p);
    ch.p.addScaledVector(ch.vel, dt / R).normalize();
    collide(ch.p);
    transport(ch.f, old, ch.p);
    ch.f.normalize();
    transport(ch.vel, old, ch.p);
  }
  // ease the camera back behind the character while walking forward
  if (Math.abs(fwd) > 0.05 && performance.now() - lastDrag > 600) follow.yaw *= Math.exp(-dt * 1.8);

  const g = groundAt(ch.p, ch.h);
  if (ch.air) {
    ch.vy -= 19 * dt;
    ch.h += ch.vy * dt;
    if (ch.h <= g.g) { ch.h = g.g; ch.air = false; ch.vy = 0; }
  } else if (g.g < ch.h - 0.45) {
    ch.air = true; ch.vy = 0;
  } else {
    ch.h = lerp(ch.h, g.g, 1 - Math.exp(-dt * 22));
  }
  ch.water = g.water && !ch.air;
  ch.ice = g.ice;
}

const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
function updateHop(dt) {
  hop.t += dt;
  const u = Math.min(1, hop.t / hop.dur);
  const e = ease(u);
  ch.p.copy(hop.from).applyAxisAngle(hop.axis, hop.ang * e).normalize();
  const arc = Math.sin(Math.PI * u) * (1.2 + hop.ang * 2.6);
  ch.h = Math.max(surf(ch.p), lerp(hop.h0, hop.h1, e) + arc);
  _w.copy(hop.to);
  const travel = u < 0.98 ? tangentToward(ch.p, _w, new V3()) : hop.face.clone();
  ch.f.copy(travel).lerp(hop.face, smoothstep(0.65, 1, u));
  ch.f.addScaledVector(ch.p, -ch.f.dot(ch.p)).normalize();
  ch.vel.set(0, 0, 0);
  ch.speed = 0;
  hopLift = Math.sin(Math.PI * u) * Math.min(7, hop.ang * 4.5);
  if (u >= 1) {
    ch.p.copy(hop.to);
    ch.f.copy(hop.face);
    ch.h = groundAt(ch.p).g;
    hop = null;
    hopLift = 0;
  }
}

const _m = new THREE.Matrix4(), _x = new V3();
function placeCharacter(dt, t) {
  _x.crossVectors(ch.p, ch.f).normalize();
  _m.makeBasis(_x, ch.p, ch.f);
  hero.root.quaternion.setFromRotationMatrix(_m);
  hero.root.position.copy(ch.p).multiplyScalar(R + ch.h);
  hero.ripple.position.y = (WATER - ch.h) / 0.85 + 0.02;
  hero.animate(dt, t, { speed: hop ? 0 : ch.speed, air: ch.air || !!hop, wading: ch.water });
}

// ---------------------------------------------------------------- camera
const cam = { dir: new V3(0.4, 0.8, 0.45).normalize(), r: 40, up: new V3(0, 1, 0), look: new V3() };
const tPos = new V3(), tLook = new V3(), tUp = new V3(), tDir = new V3(), axis = new V3();

function overviewDistance() {
  const vf = (camera.fov * Math.PI) / 180;
  const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
  return 16.5 / Math.sin(Math.min(vf, hf) / 2);
}

function slerpDir(u, target, a) {
  const ang = Math.acos(clamp(u.dot(target), -1, 1));
  if (ang < 1e-5) return u.copy(target);
  axis.crossVectors(u, target);
  if (axis.lengthSq() < 1e-10) axis.set(0, 1, 0).cross(u);
  return u.applyAxisAngle(axis.normalize(), ang * a).normalize();
}

function updateCamera(dt) {
  if (mode === 'follow') {
    const up = ch.p;
    const f = _v.copy(ch.f).applyAxisAngle(up, follow.yaw);
    const D = follow.dist + hopLift;
    const base = _w.copy(up).multiplyScalar(R + ch.h);
    tPos.copy(base).addScaledVector(up, D * Math.sin(follow.pitch) + hopLift * 0.4).addScaledVector(f, -D * Math.cos(follow.pitch));
    tLook.copy(base).addScaledVector(up, 0.75).addScaledVector(f, 1.1);
    tUp.copy(up);
    const r = tPos.length();
    const minR = R + Math.max(WATER, height(tDir.copy(tPos).divideScalar(r))) + 0.9;
    if (r < minR) tPos.setLength(minR);
  } else {
    if (!reducedMotion && !drag) ov.az += dt * 0.07;
    const dist = overviewDistance() * ov.zoom;
    tPos.set(Math.cos(ov.el) * Math.cos(ov.az), Math.sin(ov.el), Math.cos(ov.el) * Math.sin(ov.az)).multiplyScalar(dist);
    tLook.set(0, 0, 0);
    tUp.set(0, 1, 0);
  }
  const since = clock - modeAt;
  const kBase = mode === 'follow' ? (hop ? 4 : 7) : 4;
  const k = lerp(1.6, kBase, smoothstep(0, 1.6, since));
  const a = 1 - Math.exp(-dt * k);
  const tr = tPos.length();
  slerpDir(cam.dir, tDir.copy(tPos).divideScalar(tr), a);
  cam.r = lerp(cam.r, tr, a);
  cam.look.lerp(tLook, a);
  cam.up.lerp(tUp, a);
  if (cam.up.lengthSq() < 1e-4) cam.up.copy(tUp);
  cam.up.normalize();

  camera.position.copy(cam.dir).multiplyScalar(cam.r);
  camera.up.copy(cam.up);
  camera.lookAt(cam.look);

  // key light from over the viewer's shoulder, fill from behind the planet
  const cd = _v.copy(camera.position).normalize();
  const right = _w.crossVectors(cd, camera.up).normalize();
  sun.position.copy(cd).addScaledVector(camera.up, 0.75).addScaledVector(right, -0.45).normalize().multiplyScalar(40);
  fill.position.copy(sun.position).multiplyScalar(-1);

  // overview marker
  const show = mode === 'overview' ? 1 : 0;
  marker.material.opacity = lerp(marker.material.opacity, show * 0.95, a);
  marker.visible = marker.material.opacity > 0.02;
  marker.position.copy(ch.p).multiplyScalar(R + ch.h + 2.2 + Math.sin(clock * 3) * 0.2);
  marker.quaternion.setFromUnitVectors(Y, ch.p);
  marker.rotateY(clock * 1.5);
}
const Y = new V3(0, 1, 0);

// ---------------------------------------------------------------- landmark card
let lastKey = '', lastSeason = null, uiTimer = 0;
function updateUI() {
  const { lat, lon } = toLL(ch.p);
  const season = lat > 78 ? -1 : seasonAt(ch.p);
  let best = null, bd = Infinity;
  for (const lm of LANDMARKS) {
    if (lm.season !== season) continue;
    const d = Math.acos(clamp(ch.p.dot(lm.dir), -1, 1)) * R;
    if (d < bd) { bd = d; best = lm; }
  }
  if (season !== lastSeason) {
    if (lastSeason !== null) ui.showBanner(season);
    ui.setActive(season);
    hero.scarf.visible = season === 3;
    lastSeason = season;
  }
  if (best && best.id !== lastKey) {
    ui.setCard(best);
    lastKey = best.id;
  }
  ui.setMeta(lat, lon, Math.max(0, Math.round((bd - 1.2) / 0.55)));
}

// ---------------------------------------------------------------- loop
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  fx.resize(h, camera.fov, PR);
}
addEventListener('resize', resize);
resize();

let clock = 0;
let last = performance.now();
cam.r = overviewDistance();
cam.dir.set(Math.cos(ov.el) * Math.cos(ov.az), Math.sin(ov.el), Math.cos(ov.el) * Math.sin(ov.az));

function step(dt) {
  clock += dt;
  if (introPending && clock > 2.6) setMode('follow');
  if (hop) updateHop(dt); else updateWalk(dt);
  placeCharacter(dt, clock);
  updateCamera(dt);
  uWaterTime.value = clock;
  fx.update(clock, dt);
  props.update(clock);
  _v.copy(ch.p).multiplyScalar(R + ch.h + 0.5);
  props.updateShy(dt, camera.position, _v, mode === 'follow');
  uiTimer -= dt;
  if (uiTimer <= 0) { updateUI(); uiTimer = 0.15; }
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  step(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
updateUI();
requestAnimationFrame(frame);
document.body.classList.add('ready');

// test hook: jump to a season, toggle overview, advance time deterministically
window.__planet = {
  hop: hopTo,
  overview: (on = true) => setMode(on ? 'overview' : 'follow'),
  advance(sec, fps = 30) { for (let i = 0; i < sec * fps; i++) step(1 / fps); renderer.render(scene, camera); },
  press(code, on = true) { if (on) keys.add(code); else keys.delete(code); },
  get state() { return { mode, ...toLL(ch.p), h: ch.h, season: lastSeason, card: lastKey, instances: props.countInstances }; },
};
