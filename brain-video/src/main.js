// Frame-accurate renderer: window.renderFrame(frame) draws one frame (3D + HUD) deterministically.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { loadBrain, PAL } from './brain.js';
import { SCENES, FPS, BEAT, BAR, DURATION, TOTAL_FRAMES, barTime } from './scenes.js';
import { Hud } from './hud.js';

const params = new URLSearchParams(location.search);
const W = +params.get('w') || 1920;
const RS = +params.get('rs') || 1;   // internal 3D render scale (the HUD stays at full resolution)
const H = Math.round((W * 9) / 16);
const SCALE = W / 1920;

const stage = document.getElementById('stage');
stage.style.transform = `scale(${SCALE})`;
document.body.style.width = `${W}px`;
document.body.style.height = `${H}px`;

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gl'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
const RW = Math.round(W * RS), RH = Math.round(H * RS);
renderer.setSize(RW, RH, false);
renderer.domElement.style.width = '1920px'; renderer.domElement.style.height = '1080px';
renderer.toneMapping = THREE.NoToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(PAL.c100);
const camera = new THREE.PerspectiveCamera(30, W / H, 1, 4000);

// ---------------------------------------------------------------------------------------------- assets
const [regions, tl] = await Promise.all([
  fetch('/src/regions.json').then((r) => r.json()),
  fetch('/assets/timeline.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
]);
const brain = await loadBrain('/assets');
scene.add(brain.root);
const NS = Object.keys(brain.structs).length;
const structNames = Object.keys(brain.structs);

// background glow plate (radial gradient built only from palette colours)
{
  const c = document.createElement('canvas'); c.width = 512; c.height = 288;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(256 + 40, 144, 10, 256, 144, 330);
  gr.addColorStop(0, PAL.c90); gr.addColorStop(0.55, '#293f5c'); gr.addColorStop(1, PAL.c100);
  g.fillStyle = gr; g.fillRect(0, 0, 512, 288);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
}

// ---------------------------------------------------------------------------------------------- particles
const col = (h) => new THREE.Color(h);
function buildAssembly() {
  const pts = [];
  for (const side of ['L', 'R']) {
    const pos = brain.hemis[side].geo.attributes.position.array;
    for (let i = 0; i < pos.length / 3; i += 3) pts.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  }
  const n = pts.length / 3;
  const target = new Float32Array(pts);
  const rnd = new Float32Array(n * 3);
  let s = 12345;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < n * 3; i++) rnd[i] = r();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aTarget', new THREE.BufferAttribute(target, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 3));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uProg: { value: 0 }, uTime: { value: 0 }, uSize: { value: 1.35 }, uAlpha: { value: 1 }, uScale: { value: (RH / (2 * Math.tan(THREE.MathUtils.degToRad(15)))) },
      uA: { value: col(PAL.c40) }, uB: { value: col(PAL.c10) } },
    vertexShader: `
      attribute vec3 aTarget; attribute vec3 aRand;
      uniform float uProg, uTime, uSize, uAlpha, uScale; varying float vA; varying float vM;
      void main() {
        float k = clamp((uProg - aRand.x * 0.45) / 0.55, 0.0, 1.0);
        float e = k * k * (3.0 - 2.0 * k);
        float th = aRand.y * 6.2831, ph = acos(2.0 * aRand.z - 1.0);
        float R = 230.0 + aRand.x * 200.0;
        vec3 p0 = R * vec3(sin(ph) * cos(th), cos(ph) * 0.75, sin(ph) * sin(th));
        float ang = (1.0 - e) * (2.2 + aRand.y * 2.4) + uTime * 0.18 * (1.0 - e);
        float c = cos(ang), s = sin(ang);
        p0.xz = mat2(c, -s, s, c) * p0.xz;
        vec3 p = mix(p0, aTarget, e);
        p += (1.0 - e) * vec3(sin(uTime * 0.9 + aRand.x * 20.0), cos(uTime * 0.7 + aRand.y * 20.0), sin(uTime * 0.6 + aRand.z * 20.0)) * 7.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1.0, uSize * (0.55 + aRand.y) * uScale / -mv.z);
        vA = uAlpha * (0.22 + 0.78 * e);
        vM = aRand.z;
      }`,
    fragmentShader: `
      uniform vec3 uA; uniform vec3 uB; varying float vA; varying float vM;
      void main() {
        vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0;
        float a = smoothstep(1.0, 0.0, r);
        gl_FragColor = vec4(mix(uA, uB, vM) * a * vA, 1.0);
      }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.renderOrder = 8;
  scene.add(p);
  return p;
}
const assembly = buildAssembly();

function buildDust() {
  const n = 650;
  const base = new Float32Array(n * 3), rnd = new Float32Array(n);
  let s = 777;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < n; i++) { base[i * 3] = (r() - 0.5) * 700; base[i * 3 + 1] = (r() - 0.5) * 420; base[i * 3 + 2] = (r() - 0.5) * 700; rnd[i] = r(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(base, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 0.5 }, uScale: { value: (RH / (2 * Math.tan(THREE.MathUtils.degToRad(15)))) }, uA: { value: col(PAL.c50) }, uB: { value: col(PAL.c30) } },
    vertexShader: `
      attribute float aRand; uniform float uTime, uScale; varying float vM;
      void main() {
        vec3 p = position; p.y = mod(p.y + 210.0 + uTime * (3.0 + aRand * 5.0), 420.0) - 210.0; p.x += sin(uTime * 0.3 + aRand * 30.0) * 8.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1.0, (0.9 + aRand * 1.4) * uScale / -mv.z); vM = aRand;
      }`,
    fragmentShader: `
      uniform vec3 uA; uniform vec3 uB; uniform float uAlpha; varying float vM;
      void main() { vec2 d = gl_PointCoord - 0.5; float a = smoothstep(1.0, 0.0, length(d) * 2.0); gl_FragColor = vec4(mix(uA, uB, vM) * a * uAlpha * (0.35 + 0.65 * vM), 1.0); }`,
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = 1; scene.add(p);
  return p;
}
const dust = buildDust();

// ---------------------------------------------------------------------------------------------- control-loop arcs
const areaSet = (key) => {
  if (key === 'all') return Object.values(regions.pfc).flat();
  return regions.pfc[key];
};
const lobeSet = (k) => regions.lobes[k];
function resolvePoint(spec, surface = false) {
  if (Array.isArray(spec)) return new THREE.Vector3(...spec);
  const [kind, key] = spec.includes(':') ? spec.split(':') : [spec, null];
  if (kind === 'struct') return brain.structCentroid(key);
  if (kind === 'lobe') return surface ? brain.surfaceAnchor(lobeSet(key)) : brain.centroid(lobeSet(key));
  if (kind === 'pfc') return surface ? brain.surfaceAnchor(areaSet(key)) : brain.centroid(areaSet(key));
  if (kind === 'atoms') {
    const names = key === 'cingulate' ? regions.cingulate : regions.insula;
    return surface ? brain.surfaceAnchor(names) : brain.centroid(names);
  }
  if (kind === 'insula') return surface ? brain.surfaceAnchor(regions.insula) : brain.centroid(regions.insula);
  throw new Error('bad target ' + spec);
}

const ARC_DEFS = [
  { to: 'struct:thalamus', cn: '丘脑', en: 'THALAMUS' },
  { to: 'struct:caudate', cn: '基底节', en: 'BASAL GANGLIA' },
  { to: 'struct:amygdala', cn: '杏仁核', en: 'AMYGDALA' },
  { to: 'struct:hippocampus', cn: '海马', en: 'HIPPOCAMPUS' },
  { to: 'lobe:parietal', cn: '顶叶', en: 'PARIETAL', surface: true },
];
const arcGroup = new THREE.Group();
const arcs = [];
{
  const start = brain.surfaceAnchor(areaSet('dlpfc')).clone().lerp(brain.surfaceAnchor(areaSet('fpc')), 0.5);
  for (const d of ARC_DEFS) {
    const end = resolvePoint(d.to, d.surface);
    const mid = start.clone().lerp(end, 0.5); mid.y += 12 + start.distanceTo(end) * 0.05;
    const curve = new THREE.CatmullRomCurve3([start, start.clone().lerp(mid, 0.55).add(new THREE.Vector3(0, 6, 0)), mid, end.clone().lerp(mid, 0.5), end]);
    const geo = new THREE.TubeGeometry(curve, 90, 0.9, 6, false);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      uniforms: { uHead: { value: -1 }, uBase: { value: 0.0 }, uBoost: { value: 0 }, uA: { value: col(PAL.c50) }, uB: { value: col(PAL.c10) } },
      vertexShader: 'varying float vU; void main(){ vU = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uHead, uBase, uBoost; uniform vec3 uA, uB; varying float vU;
        void main(){ float d = vU - uHead; float g = exp(-d * d * 260.0) * step(0.0, uHead); float i = uBase + g * (1.2 + uBoost);
          gl_FragColor = vec4(mix(uA, uB, clamp(g, 0.0, 1.0)) * i, 1.0); }`,
    });
    const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 9; mesh.frustumCulled = false; mesh.visible = false;
    arcGroup.add(mesh);
    arcs.push({ mesh, mat, end, def: d });
  }
  scene.add(arcGroup);
}

// ---------------------------------------------------------------------------------------------- post-processing
const RT8 = params.get('rt8') === '1';
const composer = new EffectComposer(renderer, RT8 ? new THREE.WebGLRenderTarget(RW, RH, { type: THREE.UnsignedByteType, samples: 0 }) : undefined);
composer.setSize(RW, RH);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(RW, RH), 0.6, 0.55, 0.8);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const dither = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uSeed: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uSeed; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed) * 43758.5453); }
    void main(){ vec4 c = texture2D(tDiffuse, vUv); float n = h(gl_FragCoord.xy) + h(gl_FragCoord.xy + 17.3) - 1.0; gl_FragColor = vec4(c.rgb + n / 255.0, 1.0); }`,
});
composer.addPass(dither);

// ---------------------------------------------------------------------------------------------- scene states
const NA = 16;
const hex = (h) => new THREE.Color(h);
function newState() { return { solid: 0, opacity: 1, outline: 0, atoms: new Float32Array(NA * 6), structs: new Float32Array(NS * 6) }; }
function setAtomS(st, name, h, glow, solid, alpha = 1) {
  const i = brain.atomIndex[name]; const c = hex(h);
  st.atoms.set([c.r, c.g, c.b, glow, alpha, solid], i * 6);
}
function setStructS(st, name, focus, glow, alpha, h) {
  const j = structNames.indexOf(name); const c = hex(h);
  st.structs.set([focus, glow, alpha, c.r, c.g, c.b], j * 6);
}
function buildState(sc) {
  const st = newState();
  st.solid = sc.solid ?? 0; st.opacity = sc.hideBrain ? 0 : 1; st.outline = sc.outline ?? 0;
  for (const n of brain.atoms) setAtomS(st, n, n === 'none' ? (sc.none || PAL.c90) : (sc.cortex || PAL.c80), 0, 0);
  const all = (sc.structs && sc.structs.all) || [0, 0, 0.5, PAL.c60];
  for (const n of structNames) setStructS(st, n, all[0], all[1], all[2], all[3]);
  for (const [n, v] of Object.entries(sc.structs || {})) if (n !== 'all') setStructS(st, n, v[0], v[1], v[2], v[3]);
  for (const a of sc.atoms || []) setAtomS(st, a[0], a[1], a[2], a[3], a[4] ?? 1);
  return st;
}
function lerpState(a, b, k, out) {
  out.solid = a.solid + (b.solid - a.solid) * k;
  out.opacity = a.opacity + (b.opacity - a.opacity) * k;
  out.outline = a.outline + (b.outline - a.outline) * k;
  for (let i = 0; i < a.atoms.length; i++) out.atoms[i] = a.atoms[i] + (b.atoms[i] - a.atoms[i]) * k;
  for (let i = 0; i < a.structs.length; i++) out.structs[i] = a.structs[i] + (b.structs[i] - a.structs[i]) * k;
  return out;
}

for (const sc of SCENES) {
  sc._state = buildState(sc);
  const c = sc.cam;
  c._tgt = typeof c.tgt === 'string' ? resolvePoint(c.tgt) : new THREE.Vector3(...c.tgt);
  if (sc.marker) sc._marker = resolvePoint(sc.marker, true);
  sc.shift = sc.fx === 'finale' || sc.fx === 'outro' ? 520 : (sc.tag || sc.fx === 'overview' ? 270 : 0);
}

const ease = {
  out3: (x) => 1 - Math.pow(1 - x, 3),
  out4: (x) => 1 - Math.pow(1 - x, 4),
  io3: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  smooth: (x) => x * x * (3 - 2 * x),
};
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const wrapDeg = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

function camPose(sc, t) {
  const c = sc.cam;
  const u = Math.max(0, t - sc.t0);
  const d = c.drift || {};
  let az = c.az + (d.az || 0) * u, el = c.el + (d.el || 0) * u, dist = c.dist + (d.dist || 0) * u;
  if (c.to) {
    const k = ease.io3(clamp01((t - c.to.at[0]) / (c.to.at[1] - c.to.at[0])));
    az = c.az + (c.to.az - c.az) * k; el = c.el + (c.to.el - c.el) * k; dist = c.dist + (c.to.dist - c.dist) * k;
  }
  return { az, el, dist, tgt: c._tgt, fov: c.fov, shift: sc.shift };
}

const tmpState = newState();
const prevDist = { v: 0 };
const markerPt = new THREE.Vector3();
const hud = new Hud(document, { W, H, SCALE });

// text must be on screen once so every glyph subset is fetched before the first capture
await hud.preloadFonts(SCENES);

function sceneAt(t) {
  for (let i = SCENES.length - 1; i >= 0; i--) if (t >= SCENES[i].t0 - 1e-6) return i;
  return 0;
}

function pulseAt(frame, t) {
  if (tl && tl.kick) return tl.kick[Math.min(frame, tl.kick.length - 1)];
  const bf = (t / BEAT) % 1;
  return Math.exp(-bf * 6);
}

// ---------------------------------------------------------------------------------------------- frame
window.renderFrame = (frame) => {
  const t = frame / FPS;
  const si = sceneAt(t);
  const sc = SCENES[si];
  const prev = SCENES[Math.max(0, si - 1)];
  const u = t - sc.t0;
  const beat = u / BEAT;
  const beatIdx = Math.floor(beat + 1e-6);
  const beatFrac = beat - beatIdx;
  const pulse = pulseAt(frame, t);
  const barNow = Math.floor(t / BAR) + 1;

  // --- camera (whip from the previous pose on every cut)
  const cur = camPose(sc, t);
  let pose = cur;
  if (si > 0) {
    const pe = camPose(prev, prev.t1 - 1e-4);
    const target = { ...cur, az: pe.az + wrapDeg(cur.az - pe.az) };
    const dur = Math.min(1.25, 0.55 + Math.abs(wrapDeg(cur.az - pe.az)) / 260 + Math.abs(cur.dist - pe.dist) / 900);
    const k = ease.out4(clamp01(u / dur));
    pose = {
      az: pe.az + (target.az - pe.az) * k, el: pe.el + (cur.el - pe.el) * k, dist: pe.dist + (cur.dist - pe.dist) * k,
      tgt: new THREE.Vector3().lerpVectors(pe.tgt, cur.tgt, k), fov: cur.fov, shift: pe.shift + (cur.shift - pe.shift) * k,
    };
  }
  let dist = pose.dist * (1 - 0.006 * pulse);
  if (!sc.calm) dist *= 1 - 0.05 * Math.exp(-u / 0.13);
  const az = THREE.MathUtils.degToRad(pose.az), el = THREE.MathUtils.degToRad(pose.el);
  const shake = sc.calm ? 0 : 1.6 * Math.exp(-u / 0.10);
  camera.position.set(
    pose.tgt.x + dist * Math.sin(az) * Math.cos(el) + Math.sin(u * 91) * shake,
    pose.tgt.y + dist * Math.sin(el) + Math.cos(u * 73) * shake,
    pose.tgt.z + dist * Math.cos(az) * Math.cos(el));
  camera.fov = pose.fov; camera.lookAt(pose.tgt);
  camera.setViewOffset(W, H, -pose.shift * SCALE, 0, W, H);
  camera.updateProjectionMatrix();

  // --- visual state (blend from previous scene)
  const kState = si > 0 ? ease.out3(clamp01(u / 0.5)) : 1;
  const st = lerpState(si > 0 ? prev._state : sc._state, sc._state, kState, tmpState);

  // scene-specific effects on top of the blended state
  const fxInfo = applyFx(sc, st, u, beat, beatIdx, beatFrac, t);

  // --- apply to brain
  const sol = st.solid;
  for (let i = 0; i < NA; i++) {
    const o = i * 6, g = st.atoms[o + 3];
    brain.setAtomRaw(i, st.atoms[o], st.atoms[o + 1], st.atoms[o + 2], g * (1 + 0.35 * pulse), st.atoms[o + 4], st.atoms[o + 5]);
  }
  brain.setAtomsSolidFloor(sol);
  structNames.forEach((n, j) => {
    const o = j * 6, s = brain.structs[n];
    s.state.focus = st.structs[o]; s.state.glow = st.structs[o + 1] * (1 + 0.35 * pulse); s.state.alpha = st.structs[o + 2] * fxInfo.structAlpha;
    s.color.setRGB(st.structs[o + 3], st.structs[o + 4], st.structs[o + 5]);
  });
  const rhOn = fxInfo.clipX > 1.0;
  brain.hemis.R.mesh.visible = rhOn;
  brain.flushStructs(rhOn);
  brain.setCommon(fxInfo.clipX, t, pulse, st.opacity, fxInfo.cutOn, st.outline);

  // intro particles
  const introK = clamp01(t / barTime(4, 4));
  assembly.visible = t < barTime(5, 3);
  assembly.material.uniforms.uProg.value = ease.io3(introK) * 1.0;
  assembly.material.uniforms.uTime.value = t;
  assembly.material.uniforms.uAlpha.value = (t < barTime(5) ? 0.55 : Math.max(0, 1 - (t - barTime(5)) / 0.8) * 0.55);
  dust.material.uniforms.uTime.value = t;
  dust.material.uniforms.uAlpha.value = 0.55 + 0.25 * pulse;
  assembly.rotation.y = 0;

  // network arcs
  arcGroup.visible = sc.fx === 'network';
  if (arcGroup.visible) {
    arcs.forEach((a, i) => {
      const lit = beat >= 1 + i;
      a.mesh.visible = lit || beat > 6;
      const active = (beatIdx % 5) === i && beat >= 1;
      a.mat.uniforms.uBase.value = lit ? 0.55 : 0;
      a.mat.uniforms.uHead.value = active ? beatFrac * 1.15 - 0.075 : -1;
      a.mat.uniforms.uBoost.value = pulse * 0.6;
    });
  }

  // --- post
  bloom.strength = 0.42 + 0.3 * pulse + 0.8 * fxInfo.flash;
  bloom.radius = 0.55;
  bloom.threshold = 0.9;
  dither.uniforms.uSeed.value = (frame % 7) * 1.37;

  composer.render();

  // --- HUD (needs projected marker)
  let marker = null;
  if (sc._marker && sc.tag) {
    markerPt.copy(sc._marker).project(camera);
    marker = { x: (markerPt.x * 0.5 + 0.5) * 1920, y: (-markerPt.y * 0.5 + 0.5) * 1080 };
  }
  const labels = [];
  if (sc.fx === 'network') {
    arcs.forEach((a, i) => {
      markerPt.copy(a.end).project(camera);
      labels.push({ x: (markerPt.x * 0.5 + 0.5) * 1920, y: (-markerPt.y * 0.5 + 0.5) * 1080, cn: a.def.cn, en: a.def.en, on: beat >= 1 + i });
    });
  }
  hud.update({ t, frame, sc, prevSc: prev, si, u, beat, beatIdx, beatFrac, pulse, marker, labels, flash: fxInfo.flash, bands: tl && tl.bands ? tl.bands[Math.min(frame, tl.bands.length - 1)] : null,
    dip: fxInfo.dip, barNow });
  return true;
};

// ---------------------------------------------------------------------------------------------- scene effects
const LIT = PAL.c40;
function applyFx(sc, st, u, beat, beatIdx, beatFrac, t) {
  const info = { clipX: sc.rh ? 1e4 : 0.5, cutOn: 0, structAlpha: 1, flash: 0, dip: 0 };
  // hit flash on every cut (strong on the two drops)
  let f = sc.calm ? 0.05 * Math.exp(-u / 0.2) : 0.30 * Math.exp(-u / 0.10);
  if (sc.id === 'overview') f = 1.0 * Math.exp(-u / 0.22);
  if (sc.id === 'pfc') f = 1.2 * Math.exp(-u / 0.30);
  info.flash = f;

  if (sc.cut) {
    const k = clamp01((t - sc.cut.from) / (sc.cut.to - sc.cut.from));
    if (sc.cut.dir === 'in') info.clipX = 0.5 + (80 - 0.5) * ease.io3(k);
    else info.clipX = 80 + (0.5 - 80) * ease.io3(k);
    info.cutOn = k > 0 && k < 1 ? 1 : 0;
    if (sc.cut.dir === 'in' && k >= 1) info.clipX = 1e4;
  }
  if (sc.id === 'finale') { const k = clamp01((t - barTime(81)) / (barTime(82, 3) - barTime(81))); info.clipX = k >= 1 ? 1e4 : 0.5 + 79.5 * ease.io3(k); info.cutOn = k > 0 && k < 1 ? 1 : 0; }

  if (sc.fx === 'intro') {
    st.opacity = 0;
    info.structAlpha = 0;
    info.flash = t > barTime(4, 4) ? 0.9 * clamp01((t - barTime(4, 4)) / BEAT) : 0;
  }
  if (sc.id === 'overview') {
    // brain materialises under the assembled particles
    const k = ease.out3(clamp01(u / 0.45));
    st.opacity *= k;
    info.structAlpha = k;
  }
  if (sc.fx === 'build') {
    const k = clamp01(u / (4 * BAR));
    for (const n of ['dlpfc', 'vlpfc', 'fpc', 'ofc', 'vmpfc', 'dmpfc', 'acc']) {
      const o = brain.atomIndex[n] * 6; st.atoms[o + 3] = 0.03 + 0.18 * k * k;
    }
    if (beat >= 15) info.dip = clamp01(beat - 15) * 0.78;
    info.flash = (beat >= 12 ? 0.12 * Math.exp(-beatFrac * 5) * ((beatIdx - 11) / 4) : 0) + info.flash;
  }
  if (sc.fx === 'recap') {
    const groups = [
      { at: 0, structs: ['brainstem', 'cerebellum'] },
      { at: 2, structs: ['thalamus', 'hypothalamus', 'caudate', 'putamen', 'pallidum', 'accumbens'] },
      { at: 4, structs: ['amygdala', 'hippocampus'], atoms: ['cingulate', 'acc', 'insula'] },
    ];
    const fl = Math.exp(-beatFrac * 5);
    for (const g of groups) {
      if (beat < g.at) continue;
      const first = beatIdx === g.at || beatIdx === g.at + 1;
      const boost = beatIdx >= g.at ? (beatIdx === g.at || beatIdx === g.at + 1 ? fl : 0) : 0;
      for (const n of g.structs) setStructS(st, n, 1, 0.03 + 0.25 * boost, 1, beatIdx <= g.at + 1 ? PAL.c30 : PAL.c50);
      for (const n of g.atoms || []) setAtomS(st, n, beatIdx <= g.at + 1 ? PAL.c30 : PAL.c50, 0.03 + 0.25 * boost, 1);
    }
    if (beatIdx >= 6) {
      const kk = beatIdx === 6 ? ease.out3(clamp01(beatFrac * 2)) : 1;
      st.solid = kk;
      const tone = { occipital: PAL.c80, parietal: PAL.c60, temporal: PAL.c50 };
      for (const [n, c] of Object.entries(tone)) setAtomS(st, n, c, 0.05, 1);
      const frontalOn = beatIdx >= 7;
      for (const n of ['frontal', 'dlpfc', 'vlpfc', 'fpc', 'ofc', 'vmpfc', 'dmpfc']) setAtomS(st, n, frontalOn ? PAL.c40 : PAL.c60, frontalOn ? 0.04 + 0.14 * fl : 0.0, 1);
      for (const n of structNames) setStructS(st, n, 1, 0, 1, PAL.c70);
      if (beatIdx === 6) info.flash += 0.2 * fl;
      if (beatIdx === 7) info.flash += 0.3 * fl;
    }
  }
  if (sc.fx === 'pfcoverview') {
    // the corpus callosum only appears once the camera has swung round to the medial side
    const j = structNames.indexOf('corpusCallosum') * 6;
    st.structs[j + 2] = clamp01((u - 4.3) / 0.6);
  }
  if (sc.id === 'outro') {
    info.flash = 0;
  }
  return info;
}

window.__scenes = SCENES.map((s) => ({ id: s.id, t0: s.t0, t1: s.t1 }));
window.__dbg = { bloom, brain, composer, renderer, assembly, dust, arcGroup };
window.totalFrames = TOTAL_FRAMES;
window.ready = true;
