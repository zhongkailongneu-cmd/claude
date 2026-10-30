import * as THREE from 'three';
import { generateNetwork } from './neurons.js';

// All colours are display-space values (the Loyel tokens must reach the screen unchanged).
THREE.ColorManagement.enabled = false;

export const CAM_FOV = 40;
export const CAM_Z = 1 / Math.tan((CAM_FOV / 2) * (Math.PI / 180));

// ---------------------------------------------------------------------------------------------
// Shaders. A neuron's growth progress is f = clamp((S - birth) / span, 0, 1) where S is the story
// clock. A vertex is visible once the growth front f has passed its `aGrow`. Fire events (8 per
// neuron, kept in a data texture) drive the soma flash and the action potential that runs along
// the axon at `uSpeed` world units per second.
// ---------------------------------------------------------------------------------------------
const COMMON = /* glsl */ `
precision highp float;
precision highp int;
uniform sampler2D uTex;
uniform float uTime;
uniform float uS;
uniform float uSpeed;

// total fire terms for neuron nid at path distance dist
void fireTerms(int nid, float dist, out float pulse, out float trail, out float flash) {
  pulse = 0.0; trail = 0.0; flash = 0.0;
  for (int r = 0; r < 2; r++) {
    vec4 ev = texelFetch(uTex, ivec2(nid, 2 + r), 0);
    for (int c = 0; c < 4; c++) {
      float lt = uTime - ev[c];
      if (lt > 0.0 && lt < 5.0) {
        float dd = dist - lt * uSpeed;
        pulse += exp(-dd * dd * 70.0);
        trail += (dd < 0.0 ? exp(dd * 0.9) : 0.0) * exp(-lt * 0.55) * 0.5;
        flash += exp(-lt * 2.6);
      }
    }
  }
}
`;

const RIBBON_VERT = /* glsl */ `
${COMMON}
attribute vec3 aNext;
attribute vec4 aInfo;   // aGrow, neuron id, width factor, kind (0 dendrite / 1 axon / 2 twig)
attribute float aDist;
attribute float aSide;

uniform vec2 uRes;
uniform float uDpr;
uniform float uCamZ;
uniform float uGain;
uniform float uWidth;
uniform float uHeat;
uniform float uBase;
uniform vec3 uDend;
uniform vec3 uAxon;
uniform vec3 uSyn;
uniform vec3 uHot;

varying vec3 vCol;
varying float vSide;

void main() {
  int nid = int(aInfo.y + 0.5);
  vec4 n0 = texelFetch(uTex, ivec2(nid, 0), 0);
  vec4 n1 = texelFetch(uTex, ivec2(nid, 1), 0);
  float f = clamp((uS - n0.w) / n1.x, 0.0, 1.0);
  float behind = f - aInfo.x;
  float kind = aInfo.w;

  float seg = length(aNext - position);
  float sw0 = 0.007 * sin(uTime * 0.8 + aDist * 5.0 + n1.z * 30.0);
  float sw1 = 0.007 * sin(uTime * 0.8 + (aDist + seg) * 5.0 + n1.z * 30.0);
  vec3 p0 = position + vec3(sw0, sw0 * 0.7, sw0 * 0.4);
  vec3 p1 = aNext + vec3(sw1, sw1 * 0.7, sw1 * 0.4);

  vec4 q0 = projectionMatrix * modelViewMatrix * vec4(p0, 1.0);
  vec4 q1 = projectionMatrix * modelViewMatrix * vec4(p1, 1.0);
  vec2 d0 = q0.xy / q0.w;
  vec2 d1 = q1.xy / q1.w;
  vec2 dir = (d1 - d0) * uRes;
  float l = length(dir);
  dir = l > 1e-5 ? dir / l : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);

  float pulse; float trail; float flash;
  fireTerms(nid, aDist, pulse, trail, flash);
  float isAxon = kind > 0.5 ? 1.0 : 0.0;
  pulse *= isAxon;
  trail *= isAxon;
  float dendGlow = (1.0 - isAxon) * flash * exp(-aDist * 0.9);

  float rawPx = uWidth * aInfo.z * uDpr * (uCamZ / q0.w) * (1.0 + 1.1 * pulse);
  float px = max(rawPx, 0.65 * uDpr);
  vec2 off = nrm * aSide * px / uRes * 2.0;
  gl_Position = vec4((d0 + off) * q0.w, q0.z, q0.w);
  vSide = aSide;

  float vis = smoothstep(0.0, 0.012, behind);
  float head = exp(-max(behind, 0.0) * 22.0) * (1.0 - smoothstep(0.88, 1.0, f));
  float fog = clamp(1.3 - (q0.w - 2.6) * 0.07, 0.3, 1.0);
  float base = mix(0.5, 0.66, isAxon) * uBase;
  float thin = clamp(rawPx / (0.65 * uDpr), 0.4, 1.0);
  float a = vis * base * fog * thin * uGain * (1.0 + 3.2 * head + 7.0 * pulse + 1.7 * trail + 1.8 * dendGlow + uHeat);

  vec3 col = mix(uDend, uAxon, isAxon);
  col = mix(col, uSyn, clamp(0.35 * (kind > 1.5 ? 1.0 : 0.0) + 0.5 * dendGlow, 0.0, 1.0));
  col = mix(col, uHot, clamp(head * 0.8 + pulse * 0.85 + trail * 0.25, 0.0, 1.0));
  vCol = col * a;
}
`;

const RIBBON_FRAG = /* glsl */ `
precision highp float;
varying vec3 vCol;
varying float vSide;
void main() {
  float e = 1.0 - abs(vSide);
  float prof = e * e * (3.0 - 2.0 * e);
  gl_FragColor = vec4(vCol * prof, 1.0);
}
`;

const NODE_VERT = /* glsl */ `
${COMMON}
attribute vec4 aA;   // neuron id, aGrow, size (world units), kind (0 soma / 1 growth cone / 2 bouton / 3 spine)
attribute vec4 aB;   // path distance, synapse time, random, -

uniform float uDpr;
uniform float uPS;     // pixels per world unit at distance 1
uniform float uGain;
uniform float uHeat;
uniform vec3 uDend;
uniform vec3 uAxon;
uniform vec3 uSyn;
uniform vec3 uHot;

varying vec3 vCol;
varying float vKind;
varying float vFlash;

void main() {
  int nid = int(aA.x + 0.5);
  vec4 n0 = texelFetch(uTex, ivec2(nid, 0), 0);
  vec4 n1 = texelFetch(uTex, ivec2(nid, 1), 0);
  float f = clamp((uS - n0.w) / n1.x, 0.0, 1.0);
  float kind = aA.w;
  vec4 q = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  float size = aA.z;
  float vis = 0.0;
  vec3 col = uDend;
  float flash = 0.0;
  float pulse; float trail; float fl;
  fireTerms(nid, aB.x, pulse, trail, fl);
  float fog = clamp(1.3 - (q.w - 2.6) * 0.07, 0.3, 1.0);

  if (kind < 0.5) {                      // soma
    vis = smoothstep(0.0, 0.05, f);
    flash = fl;
    size *= 1.0 + 0.32 * min(flash, 1.6);
    col = mix(uDend, uHot, 0.5 + 0.3 * min(flash, 1.0)) * (0.8 + 1.35 * min(flash, 1.5) + uHeat * 0.8);
  } else if (kind < 1.5) {               // growth cone: only while the front is passing
    float d = f - aA.y;
    vis = smoothstep(-0.003, 0.002, d) * (1.0 - smoothstep(0.015, 0.09, d));
    col = uHot * 1.4;
    flash = 0.0;
  } else if (kind < 2.5) {               // bouton (synapse)
    float age = uS - aB.y;
    vis = step(0.0, age);
    float ff = exp(-max(age, 0.0) * 7.0) * vis;
    flash = ff;
    size *= 1.0 + 3.0 * ff + 1.4 * pulse;
    col = mix(uSyn, uHot, clamp(ff + pulse, 0.0, 1.0)) * (0.3 + 3.2 * ff + 2.4 * pulse + uHeat * 0.5);
  } else {                               // dendritic spine
    vis = smoothstep(0.0, 0.02, f - aA.y);
    size *= 1.0 + 1.2 * pulse * 0.0;
    col = mix(uDend, uHot, clamp(fl * exp(-aB.x * 0.9) * 0.6, 0.0, 1.0)) * 0.55;
  }
  vKind = kind;
  vFlash = flash;
  vCol = col * vis * fog * uGain;
  float px = size * uPS / q.w;
  px = kind < 0.5 ? min(px, 50.0) : px;
  gl_PointSize = max(px * uDpr, 1.0) * step(0.003, vis);
  gl_Position = vis < 0.003 ? vec4(2.0, 2.0, 2.0, 1.0) : q;
}
`;

const NODE_FRAG = /* glsl */ `
precision highp float;
varying vec3 vCol;
varying float vKind;
varying float vFlash;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0) discard;
  float a;
  if (vKind < 0.5) {            // soma: bright core, soft halo, faint membrane ring
    float core = exp(-d * d * 16.0);
    float halo = exp(-d * d * 3.2) * 0.42;
    float ring = smoothstep(0.1, 0.0, abs(d - 0.5)) * 0.22;
    a = core + halo + ring;
  } else if (vKind < 1.5) {
    a = exp(-d * d * 9.0);
  } else if (vKind < 2.5) {
    float core = exp(-d * d * 12.0);
    float ring = smoothstep(0.12, 0.0, abs(d - (0.35 + 0.5 * (1.0 - min(vFlash, 1.0))))) * min(vFlash, 1.0) * 0.8;
    a = core + exp(-d * d * 3.0) * 0.3 + ring;
  } else {
    a = exp(-d * d * 6.0) * 0.8;
  }
  gl_FragColor = vec4(vCol * a, 1.0);
}
`;

const DUST_VERT = /* glsl */ `
precision highp float;
attribute vec4 aA;   // world position + seed
attribute float aSize;
uniform float uTime;
uniform float uDpr;
uniform float uPS;
uniform float uDust;
uniform vec3 uDend;
uniform vec3 uHot;
varying vec3 vCol;
void main() {
  float s = aA.w;
  vec3 p = aA.xyz + vec3(sin(uTime * 0.21 + s * 40.0), cos(uTime * 0.17 + s * 23.0), sin(uTime * 0.13 + s * 11.0)) * 0.09
         + vec3(0.0, uTime * 0.012 * (0.4 + s), 0.0);
  p.y = mod(p.y + 2.8, 5.6) - 2.8;
  vec4 q = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  gl_Position = q;
  float tw = 0.5 + 0.5 * sin(uTime * (0.7 + s * 1.9) + s * 50.0);
  float fog = clamp(1.25 - (q.w - 2.6) * 0.08, 0.15, 1.0);
  gl_PointSize = max(aSize * uPS / q.w * uDpr, 1.0);
  vCol = mix(uDend, uHot, s * s) * (0.2 + 0.6 * tw) * fog * uDust * 0.55;
}
`;
const DUST_FRAG = /* glsl */ `
precision highp float;
varying vec3 vCol;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0) discard;
  gl_FragColor = vec4(vCol * exp(-d * d * 3.5), 1.0);
}
`;

const additive = {
  transparent: true, depthWrite: false, depthTest: false, blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation,
};

// ---- camera path ---------------------------------------------------------------------------------
// keyframes at integer story stages; Catmull-Rom through them, plus a slow orbit in the finale
const KEYS = [
  { pos: [0.0, 0.05, 3.0], tgt: [0.0, 0.0, 0.0] },        // 0  one neuron
  { pos: [1.4, 0.1, 3.2], tgt: [1.4, 0.0, -0.1] },        // 1  extend
  { pos: [1.5, 0.0, 4.7], tgt: [1.5, 0.0, -0.4] },        // 2  expand
  { pos: [1.9, -0.1, 4.0], tgt: [1.9, 0.0, -0.5] },       // 3  connect
  { pos: [1.2, 0.0, 7.2], tgt: [1.2, 0.0, -1.0] },        // 4  network
  { pos: [0.8, 0.45, 6.3], tgt: [1.3, 0.0, -1.2] },       // 5  ignite
  { pos: [1.2, 0.3, 7.6], tgt: [1.3, 0.0, -1.2] },        // 6  dashboard
  { pos: [1.2, 0.3, 7.8], tgt: [1.3, 0.0, -1.2] },        // 7
  { pos: [1.2, 0.3, 7.8], tgt: [1.3, 0.0, -1.2] },        // 8
];
function smoothstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function cr(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
export function cameraAt(p, time, aspect, out, story) {
  const n = KEYS.length - 1;
  const pp = Math.min(Math.max(p, 0), n - 0.0001);
  const i = Math.floor(pp);
  const t = pp - i;
  const k = (j) => KEYS[Math.min(n, Math.max(0, j))];
  const pos = [0, 0, 0];
  const tgt = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    pos[a] = cr(k(i - 1).pos[a], k(i).pos[a], k(i + 1).pos[a], k(i + 2).pos[a], t);
    tgt[a] = cr(k(i - 1).tgt[a], k(i).tgt[a], k(i + 1).tgt[a], k(i + 2).tgt[a], t);
  }
  // the camera rides the hero's growing axon tip during "extend", then settles on a forming synapse
  if (story) {
    const wTip = smoothstep(0.25, 0.8, p) * (1 - smoothstep(1.35, 1.9, p));
    const wFoc = smoothstep(2.5, 2.95, p) * (1 - smoothstep(3.25, 3.75, p));
    const T = story.tip;
    const F = story.focus;
    for (let a = 0; a < 3; a++) {
      const tipPos = T[a] + [0.28, 0.1, 2.7][a];
      const tipTgt = T[a] + [0.4, 0.0, 0.0][a];
      const fPos = F[a] + [0.0, 0.12, 3.4][a];
      const fTgt = F[a];
      pos[a] += (tipPos - pos[a]) * wTip;
      tgt[a] += (tipTgt - tgt[a]) * wTip;
      pos[a] += (fPos - pos[a]) * wFoc;
      tgt[a] += (fTgt - tgt[a]) * wFoc;
    }
  }
  // narrow (portrait) screens: step back so the same scene still fits horizontally
  const fit0 = aspect < 1.5 ? Math.min(2.6, 1.5 / Math.max(aspect, 0.3)) : 1;
  const fit = fit0 * (1 - 0.45 * smoothstep(2.0, 4.0, p));
  const rel = [pos[0] - tgt[0], pos[1] - tgt[1], (pos[2] - tgt[2]) * fit];
  // slow orbit once the network exists
  const orbit = Math.min(1, Math.max(0, (p - 3.6) / 1.2)) * 0.34;
  const ang = Math.sin(time * 0.11) * orbit;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  out.pos.set(tgt[0] + rel[0] * ca + rel[2] * sa, tgt[1] + rel[1], tgt[2] - rel[0] * sa + rel[2] * ca);
  out.tgt.set(tgt[0], tgt[1], tgt[2]);
}

export class NeuronField {
  constructor({ mobile = false, count, seed } = {}) {
    this.mobile = mobile;
    this.net = generateNetwork({ count: count ?? (mobile ? 78 : 130), seed: seed ?? 20250, mobile });
    this.N = this.net.N;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 0.05, 60);
    this.camera.position.set(0, 0, CAM_Z);
    this.camPos = new THREE.Vector3();
    this.camTgt = new THREE.Vector3();
    this.aspect = 1.78;

    const names = ['dend', 'axon', 'syn', 'hot'];
    this.cur = Object.fromEntries(names.map((n) => [n, new THREE.Color()]));
    this.tgt = Object.fromEntries(names.map((n) => [n, new THREE.Color()]));
    this.gainCur = 1;
    this.gainTgt = 1;
    this.gainMul = 1;

    this.texture = new THREE.DataTexture(this.net.tex, this.N, 4, THREE.RGBAFormat, THREE.FloatType);
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;

    const shared = {
      uTex: { value: this.texture }, uTime: { value: 0 }, uS: { value: -1 }, uSpeed: { value: 1.9 },
      uDpr: { value: 1 }, uPS: { value: 500 }, uCamZ: { value: CAM_Z }, uGain: { value: 1 }, uHeat: { value: 0 }, uBase: { value: 1 },
      uDend: { value: this.cur.dend }, uAxon: { value: this.cur.axon }, uSyn: { value: this.cur.syn }, uHot: { value: this.cur.hot },
    };
    this.uniforms = { ...shared, uRes: { value: new THREE.Vector2(1, 1) }, uWidth: { value: 1.2 } };

    // ribbons
    const r = this.net.ribbon;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(r.position, 3));
    geo.setAttribute('aNext', new THREE.BufferAttribute(r.aNext, 3));
    geo.setAttribute('aInfo', new THREE.BufferAttribute(r.aInfo, 4));
    geo.setAttribute('aDist', new THREE.BufferAttribute(r.aDist, 1));
    geo.setAttribute('aSide', new THREE.BufferAttribute(r.aSide, 1));
    geo.setIndex(new THREE.BufferAttribute(r.index, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(1, 0, -1), 100);
    this.ribbons = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: RIBBON_VERT, fragmentShader: RIBBON_FRAG, uniforms: this.uniforms, side: THREE.DoubleSide, ...additive }));
    this.ribbons.frustumCulled = false;

    // somas, growth cones, boutons, spines
    const nd = this.net.nodes;
    const ngeo = new THREE.BufferGeometry();
    ngeo.setAttribute('position', new THREE.BufferAttribute(nd.position, 3));
    ngeo.setAttribute('aA', new THREE.BufferAttribute(nd.aA, 4));
    ngeo.setAttribute('aB', new THREE.BufferAttribute(nd.aB, 4));
    ngeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(1, 0, -1), 100);
    this.nodes = new THREE.Points(ngeo, new THREE.ShaderMaterial({ vertexShader: NODE_VERT, fragmentShader: NODE_FRAG, uniforms: this.uniforms, ...additive }));
    this.nodes.frustumCulled = false;

    // drifting "neurotransmitter" dust through the whole volume
    const nDust = mobile ? 900 : 2200;
    const da = new Float32Array(nDust * 4);
    const ds = new Float32Array(nDust);
    let s = 91;
    const rr = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < nDust; i++) {
      da.set([-3.5 + rr() * 9.5, -2.8 + rr() * 5.6, -4 + rr() * 6, rr()], i * 4);
      ds[i] = 0.009 + rr() * rr() * 0.026;
    }
    const dgeo = new THREE.BufferGeometry();
    dgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nDust * 3), 3));
    dgeo.setAttribute('aA', new THREE.BufferAttribute(da, 4));
    dgeo.setAttribute('aSize', new THREE.BufferAttribute(ds, 1));
    dgeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);
    this.dustU = { uTime: this.uniforms.uTime, uDpr: this.uniforms.uDpr, uPS: this.uniforms.uPS, uDust: { value: 1 }, uDend: this.uniforms.uDend, uHot: this.uniforms.uHot };
    this.dust = new THREE.Points(dgeo, new THREE.ShaderMaterial({ vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, uniforms: this.dustU, ...additive }));
    this.dust.frustumCulled = false;

    this.scene.add(this.dust, this.ribbons, this.nodes);
  }

  setTheme(theme, instant = false) {
    this.tgt.dend.set(theme.c1);
    this.tgt.axon.set(theme.axon);
    this.tgt.syn.set(theme.syn);
    this.tgt.hot.set(theme.hot);
    this.gainTgt = theme.gain;
    if (instant) {
      for (const k of Object.keys(this.cur)) this.cur[k].copy(this.tgt[k]);
      this.gainCur = this.gainTgt;
    }
  }

  setSize(w, h, dpr) {
    this.aspect = w / h;
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
    this.uniforms.uRes.value.set(w * dpr, h * dpr);
    this.uniforms.uDpr.value = dpr;
    this.uniforms.uPS.value = (h * 0.5) / Math.tan((CAM_FOV * Math.PI) / 360);
    this.uniforms.uWidth.value = Math.min(1.5, Math.max(1.0, 0.95 + (Math.min(w, 1600) / 1600) * 0.6));
  }

  update(dt, t, s) {
    const k = 1 - Math.exp(-dt * 3.2);
    for (const key of Object.keys(this.cur)) this.cur[key].lerp(this.tgt[key], k);
    this.gainCur += (this.gainTgt - this.gainCur) * k;
    const u = this.uniforms;
    u.uTime.value = t;
    u.uS.value = s.S;
    u.uGain.value = this.gainCur * this.gainMul;
    u.uHeat.value = s.heat;
    u.uBase.value = 1 - 0.32 * smoothstep(2.3, 3.6, s.p) + 0.1 * smoothstep(0.0, 0.2, 0.2 - s.p);
    this.dustU.uDust.value = s.dust;
    const tip = this.net.heroTip(s.S);
    cameraAt(s.p, t, this.aspect, { pos: this.camPos, tgt: this.camTgt }, { tip, focus: this.net.focus3 });
    // beat punch: a tiny push towards the scene
    const punch = s.punch || 0;
    this.camera.position.copy(this.camPos).lerp(this.camTgt, punch * 0.012);
    this.camera.position.x += s.cx * 0.05;
    this.camera.position.y += s.cy * 0.035;
    this.camera.lookAt(this.camTgt);
  }
}
