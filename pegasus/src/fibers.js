import * as THREE from 'three';

// All colours here are display-space values: the hex codes of the themes (including the exact
// Loyel tokens) must reach the screen unchanged, so three's sRGB->linear conversion is off.
THREE.ColorManagement.enabled = false;

// A single GPU "fibre field": N strands x M segments drawn as screen-space ribbons.
// Every scene is a parametric formula evaluated in the vertex shader, so the CPU
// only uploads a handful of uniforms per frame. A strand carries one random id and
// can therefore sit in the fan, the funnel, the hyperboloid, the tube or the iris and
// glide between them with a per-strand delay.
//
//   scene 0-3  "cone bundle": cubic-Bezier spine + width profile with a waist
//   scene 4    twisted ruled surface (hyperboloid)
//   scene 5    glossy tube following a looping trochoid spine
//   scene 6    radial iris with a glass rim

export const CAM_FOV = 40;
export const CAM_Z = 1 / Math.tan((CAM_FOV / 2) * (Math.PI / 180)); // world half-height at z=0 is exactly 1

const VERT = /* glsl */ `
precision highp float;
precision highp int;

attribute float aId;
attribute float aT;
attribute float aSide;

uniform vec2 uRes;
uniform float uDpr;
uniform vec2 uView;       // half extents of the view at z=0 (W, 1)
uniform float uTime;
uniform float uN;
uniform float uCamZ;
uniform int uA;
uniform int uB;
uniform float uMorph;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform vec3 uHot;
uniform float uGain;
uniform float uWidth;
uniform float uReveal;    // intro: 0..1 strands grow out of the origin
uniform vec4 uFx;         // x tube draw-in, y tube fly, z hyperboloid twist offset, w iris scale
uniform vec4 uIris;       // cx, cy, tilt, spin
uniform vec2 uMouse;      // world units
uniform float uBeat;

varying vec3 vCol;
varying float vSide;
varying float vSharp;

struct Sc { vec3 p; float vis; float wid; vec3 tint; };

uint pcg(uint v) {
  uint s = v * 747796405u + 2891336289u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float rnd(uint seed) { return float(pcg(seed)) / 4294967295.0; }

vec2 bez(vec2 a, vec2 b, vec2 c, vec2 d, float s) {
  float u = 1.0 - s;
  return u * u * u * a + 3.0 * u * u * s * b + 3.0 * u * s * s * c + s * s * s * d;
}
vec2 dbez(vec2 a, vec2 b, vec2 c, vec2 d, float s) {
  float u = 1.0 - s;
  return 3.0 * u * u * (b - a) + 6.0 * u * s * (c - b) + 3.0 * s * s * (d - c);
}

// ---- scenes 0..3 ------------------------------------------------------------------
// pa = p0,p1   pb = p2,p3   (normalised: x in units of W, y in units of H)
// w  = (waist position, width at start, width at end, lower-side skew)
// w2 = (start exponent, end exponent, curl, min strand length)
void conePar(int k, out vec4 pa, out vec4 pb, out vec4 w, out vec4 w2) {
  if (k == 0) {        // hero: fan opening to the right from a point on the left edge
    pa = vec4(-1.04, 0.0, -0.38, 0.0);  pb = vec4(0.28, 0.05, 0.96, 0.10);
    w = vec4(0.15, 0.03, 2.4, 0.35);    w2 = vec4(1.0, 1.5, 0.7, 0.5);
  } else if (k == 1) { // platform: waist near the middle, spray on the left, bundle bending down on the right
    pa = vec4(-1.40, 0.10, -0.90, 0.05); pb = vec4(-0.05, -0.02, 0.62, -1.05);
    w = vec4(0.40, 3.0, 1.7, 0.30);      w2 = vec4(1.7, 1.5, 1.5, 0.45);
  } else if (k == 2) { // problem: funnel into a node, thin beam leaves to the right
    pa = vec4(-1.30, 0.05, -0.90, 0.0);  pb = vec4(0.0, 0.10, 1.30, 0.30);
    w = vec4(0.30, 2.5, 0.50, 0.0);      w2 = vec4(1.6, 1.1, 1.0, 0.6);
  } else {             // solution: a single bright beam on the diagonal
    pa = vec4(-1.30, -0.80, -0.42, -0.34); pb = vec4(0.40, 0.20, 1.30, 0.72);
    w = vec4(0.15, 0.008, 0.036, 0.0);     w2 = vec4(1.0, 1.0, 0.2, 0.7);
  }
}

Sc sCone(int k, float t, vec4 h, vec4 g) {
  vec4 pa; vec4 pb; vec4 w; vec4 w2;
  conePar(k, pa, pb, w, w2);
  float s = t * mix(w2.w, 1.0, h.y);
  vec2 p0 = pa.xy; vec2 p1 = pa.zw; vec2 p2 = pb.xy; vec2 p3 = pb.zw;
  vec2 c = bez(p0, p1, p2, p3, s);
  vec2 d = dbez(p0, p1, p2, p3, s) * uView;
  d = normalize(d);
  vec2 nw = vec2(-d.y, d.x);
  float sw = w.x;
  float width = s < sw ? w.y * pow(1.0 - s / sw, w2.x) : w.z * pow((s - sw) / (1.0 - sw), w2.y);
  width += 0.012;
  float a = h.x * 2.0 - 1.0;
  a = sign(a) * pow(abs(a), 1.15);
  float sk = a < 0.0 ? 1.0 + w.w : 1.0;
  float curl = w2.z;
  float wave = sin(s * (6.0 + g.x * 7.0) + g.y * 6.2832 + uTime * (0.18 + 0.3 * g.z)) * (0.05 + 0.09 * curl)
             + sin(s * (14.0 + g.w * 9.0) - g.x * 6.2832 - uTime * 0.45) * 0.02 * curl;
  float off = (a * sk + wave) * width;
  Sc o;
  o.p = vec3(c * uView + nw * off, (g.w - 0.5) * width * 0.5);
  o.vis = 1.0;
  o.wid = 1.0;
  // lower / outer strands lean towards the secondary colour, a few strands carry the accent
  o.tint = vec3(smoothstep(0.1, 1.0, -a) * 0.85 + smoothstep(0.75, 1.0, abs(a)) * 0.25,
                step(0.94, g.y) * 0.8,
                0.55 + 0.7 * g.z * g.z + (k == 3 ? 0.55 : 0.0));
  return o;
}

// ---- scene 4: hyperboloid lattice -----------------------------------------------------
Sc sHyper(float t, vec4 h, vec4 g, float fid) {
  float lane = floor(fid / 9.0);
  float ph = lane / floor(uN / 9.0) * 6.28318;
  float xl = 1.08 * uView.x;
  float R = 1.55;
  float tw = 2.62 + uFx.z + 0.05 * sin(uTime * 0.33);
  vec3 A = vec3(-xl, R * cos(ph), R * sin(ph));
  vec3 B = vec3( xl, R * cos(ph + tw), R * sin(ph + tw));
  vec3 p = mix(A, B, t);
  float tilt = 0.30 + 0.07 * sin(uTime * 0.21);
  float ct = cos(tilt); float st = sin(tilt);
  p = vec3(p.x, p.y * ct - p.z * st, p.y * st + p.z * ct);
  Sc o;
  o.p = p;
  o.vis = mod(fid, 9.0) < 0.5 ? 1.0 : 0.0;
  o.wid = 1.75 + 0.5 * g.x;
  o.tint = vec3(1.0 - smoothstep(0.0, 0.55, t), smoothstep(0.42, 1.0, t) * 0.95, 1.5);
  return o;
}

// ---- scene 5: glossy tube -----------------------------------------------------------------
vec3 tubeSpine(float s) {
  float ph = mix(0.3, 10.2, s) + uTime * 0.03;
  return vec3(((ph - 5.25) - 1.45 * sin(ph)) * 0.42,
              -cos(ph) * 0.58 + 0.10 * sin(ph * 0.5),
              0.25 * sin(ph * 0.7));
}
Sc sTube(float t, vec4 h, vec4 g) {
  float s = clamp(t, 0.0, 1.0);
  vec3 c = tubeSpine(s);
  vec3 T = normalize(tubeSpine(min(s + 0.004, 1.2)) - tubeSpine(max(s - 0.004, 0.0)));
  vec3 N = normalize(vec3(-T.y, T.x, 0.0) + vec3(0.0, 0.0, 1e-4));
  vec3 B = normalize(cross(T, N));
  float ph = mix(0.3, 10.2, s);
  float r = 0.046 * (0.82 + 0.28 * sin(ph * 1.3)) * (0.35 + 0.65 * smoothstep(0.0, 0.08, s) * smoothstep(1.0, 0.92, s));
  float a = h.x * 6.28318 + s * 2.4;
  vec3 rad = cos(a) * N + sin(a) * B;
  vec3 p = c + rad * r * (0.94 + 0.06 * h.y);
  // fly-through: the tube grows, slides to the lower-left and tips towards the camera
  float f = uFx.y;
  p.xy = p.xy * mix(1.0, 4.2, f) + f * vec2(-0.9, -0.55);
  p.z += f * 0.9;
  float draw = uFx.x * 1.25;
  Sc o;
  o.p = p;
  o.vis = 1.0 - smoothstep(draw - 0.12, draw, t);
  o.wid = 1.0;
  float gloss = pow(max(dot(rad, normalize(vec3(0.35, 0.75, 0.55))), 0.0), 3.0);
  o.tint = vec3(smoothstep(0.55, 1.0, s) * 0.9,
                0.5 * pow(0.5 + 0.5 * sin(ph * 1.6 + 1.0), 3.0) + step(0.97, g.y) * 0.6,
                0.45 + 1.9 * gloss);
  return o;
}

// ---- scene 6: iris --------------------------------------------------------------------------
Sc sIris(float t, vec4 h, vec4 g) {
  float R1 = max(uFx.w, 0.001) * 0.82;
  float r0 = 0.2 * R1;
  float isRim = step(0.93, g.w);
  float ang = h.x * 6.28318 * 7.0 + h.z * 0.4 + uIris.w;
  vec3 p;
  float vis = 1.0;
  float br = 1.0;
  float tt = t;
  if (isRim > 0.5) {
    float a2 = t * 6.28318 + h.y * 6.0;
    float rr = R1 * (1.16 + 0.02 * h.z);
    p = vec3(cos(a2) * rr, sin(a2) * rr, -R1 * 0.15);
    vis = 0.1; br = 0.6;
  } else {
    float end = 0.55 + 0.45 * h.y;
    float rr = mix(r0, R1 * end, pow(t, 0.9));
    float bend = (g.x - 0.5) * 0.55 * t + 0.35 * t * t * sin(g.y * 6.0 + uTime * 0.2);
    float a = ang + bend;
    float z = -pow(rr / R1, 2.0) * R1 * 0.35;
    p = vec3(cos(a) * rr, sin(a) * rr, z);
    br = (0.5 + 1.8 * pow(1.0 - t, 2.2));
  }
  float tl = uIris.z;
  float ct = cos(tl); float st = sin(tl);
  p = vec3(p.x, p.y * ct - p.z * st, p.y * st + p.z * ct);
  p.xy += uIris.xy;
  Sc o;
  o.p = p;
  o.vis = vis * smoothstep(0.0, 0.05, uFx.w);
  o.wid = 0.85;
  o.tint = vec3(0.78 + 0.2 * g.x, 0.0, br);
  return o;
}

Sc evalScene(int k, float t, vec4 h, vec4 g, float fid) {
  if (k < 4) return sCone(k, t, h, g);
  if (k == 4) return sHyper(t, h, g, fid);
  if (k == 5) return sTube(t, h, g);
  return sIris(t, h, g);
}

void main() {
  uint id = uint(aId * uN + 0.5);
  float fid = float(id);
  vec4 h = vec4(rnd(id * 8u + 1u), rnd(id * 8u + 2u), rnd(id * 8u + 3u), rnd(id * 8u + 4u));
  vec4 g = vec4(rnd(id * 8u + 5u), rnd(id * 8u + 6u), rnd(id * 8u + 7u), rnd(id * 8u + 8u));
  float t = aT;
  float dt = 0.012;

  float m = uMorph;
  if (uA != uB) {
    float d = h.z * 0.5;
    m = smoothstep(d, d + 0.5, uMorph);
  }

  Sc a0 = evalScene(uA, t, h, g, fid);
  Sc a1 = evalScene(uA, t + dt, h, g, fid);
  Sc s0 = a0; Sc s1 = a1;
  if (uA != uB) {
    Sc b0 = evalScene(uB, t, h, g, fid);
    Sc b1 = evalScene(uB, t + dt, h, g, fid);
    s0.p = mix(a0.p, b0.p, m); s1.p = mix(a1.p, b1.p, m);
    s0.vis = mix(a0.vis, b0.vis, m);
    s0.wid = mix(a0.wid, b0.wid, m);
    s0.tint = mix(a0.tint, b0.tint, m);
    // strands swirl through free space while they change shape
    vec3 sv = (vec3(g.x, g.y, g.z) - 0.5) * 2.0;
    float sine = sin(3.14159 * m);
    vec3 swirl = sv * sine * (0.28 + 0.4 * sin(t * 4.0 + g.w * 6.0)) * vec3(uView.x * 0.45, 0.6, 0.5);
    s0.p += swirl; s1.p += swirl;
  }
  vec3 p0 = s0.p; vec3 p1 = s1.p;

  // pointer pushes strands aside like a hand through water
  vec2 dm = p0.xy - uMouse;
  float dl = length(dm) + 1e-4;
  float push = exp(-dot(dm, dm) * 2.4) * 0.055;
  vec2 pd = (dm / dl) * push + vec2(-dm.y, dm.x) / dl * push * 0.5;
  p0.xy += pd; p1.xy += pd;

  vec4 q0 = projectionMatrix * modelViewMatrix * vec4(p0, 1.0);
  vec4 q1 = projectionMatrix * modelViewMatrix * vec4(p1, 1.0);
  vec2 n0 = q0.xy / q0.w;
  vec2 n1 = q1.xy / q1.w;
  vec2 dir = (n1 - n0) * uRes;
  float len = length(dir);
  dir = len > 1e-5 ? dir / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float px = max(uWidth * s0.wid * uDpr * (uCamZ / q0.w), 0.75 * uDpr);
  vec2 off = nrm * aSide * px / uRes * 2.0;
  gl_Position = vec4((n0 + off) * q0.w, q0.z, q0.w);
  vSide = aSide;
  vSharp = clamp((s0.wid - 1.3) / 0.7, 0.0, 1.0);

  // alpha ---------------------------------------------------------------------------------
  float fade = smoothstep(0.0, 0.035, t) * (1.0 - smoothstep(0.82, 1.0, t));
  float head = uReveal * 1.25;
  float intro = 1.0 - smoothstep(head - 0.14, head, t);
  float br = 0.30 + 0.70 * g.w * g.w;
  float pf = pow(0.5 + 0.5 * sin(6.2832 * (t * (0.8 + g.x * 1.2) - uTime * (0.05 + 0.1 * g.y) + g.z)), 28.0);
  float alpha = fade * intro * (1.0 - 0.45 * sin(3.14159 * m) * float(uA != uB)) * s0.vis * br * s0.tint.z * uGain * (1.0 + 1.5 * pf) * (1.0 + 0.22 * uBeat);
  alpha *= 0.19 * (0.75 + 0.25 * uWidth);

  vec3 col = mix(uC1, uC2, clamp(s0.tint.x + (g.x - 0.5) * 0.3, 0.0, 1.0));
  col = mix(col, uC3, clamp(s0.tint.y, 0.0, 1.0));
  col = mix(col, uHot, clamp(pf * 0.65 + (s0.tint.z > 1.2 ? 0.18 : 0.0), 0.0, 1.0));
  vCol = col * alpha;
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec3 vCol;
varying float vSide;
varying float vSharp;
void main() {
  float e = 1.0 - abs(vSide);
  float prof = mix(e * e * (3.0 - 2.0 * e), smoothstep(0.0, 0.32, e), vSharp);
  gl_FragColor = vec4(vCol * prof, 1.0);
}
`;

const DUST_VERT = /* glsl */ `
precision highp float;
attribute vec4 aA;   // x,y in [-1,1], depth factor, seed
attribute vec2 aB;   // size, kind (0 dust / 1 bokeh)
uniform float uTime;
uniform float uDpr;
uniform vec2 uView;
uniform float uScroll;
uniform float uCamZ;
uniform float uBokeh;
uniform float uDust;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uHot;
varying vec3 vCol;
varying float vKind;
void main() {
  float kind = aB.y;
  float drift = uTime * (0.006 + 0.012 * aA.w) * (kind > 0.5 ? 0.6 : 1.0);
  float y = mod(aA.y * 0.5 + 0.5 + drift + uScroll * 0.09 * (0.3 + aA.z), 1.0) * 2.5 - 1.25;
  float x = aA.x * uView.x * 1.1 + sin(uTime * 0.2 + aA.w * 20.0) * 0.03;
  vec3 p = vec3(x, y, (aA.z - 0.5) * 1.6);
  vec4 q = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  gl_Position = q;
  float tw = 0.55 + 0.45 * sin(uTime * (0.8 + aA.w * 2.0) + aA.w * 40.0);
  float size = aB.x * uDpr * (uCamZ / q.w);
  gl_PointSize = size;
  vKind = kind;
  if (kind > 0.5) {
    float vis = uBokeh * smoothstep(-0.05, 0.45, x / uView.x);
    vCol = mix(uC2, uC1, aA.w) * 0.16 * vis;
  } else {
    vCol = mix(uC1, uHot, aA.w * aA.w) * (0.35 + 0.65 * tw) * uDust * 0.55;
  }
}
`;

const DUST_FRAG = /* glsl */ `
precision highp float;
varying vec3 vCol;
varying float vKind;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0) discard;
  float a;
  if (vKind > 0.5) a = (0.55 + 0.45 * smoothstep(0.55, 0.98, d)) * (1.0 - smoothstep(0.9, 1.0, d));
  else a = exp(-d * d * 3.5);
  gl_FragColor = vec4(vCol * a, 1.0);
}
`;

const NODE_VERT = /* glsl */ `
precision highp float;
uniform vec3 uPos;
uniform float uDpr;
uniform float uCamZ;
uniform float uTime;
uniform float uAmt;
varying float vAmt;
void main() {
  vec4 q = projectionMatrix * modelViewMatrix * vec4(uPos, 1.0);
  gl_Position = q;
  vAmt = uAmt;
  gl_PointSize = (30.0 + 3.0 * sin(uTime * 2.2)) * uDpr * (uCamZ / q.w);
}
`;
const NODE_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uHot;
uniform vec3 uC1;
varying float vAmt;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0) discard;
  float core = exp(-d * d * 55.0);
  float halo = exp(-d * d * 7.0) * 0.38;
  float ring = smoothstep(0.34, 0.30, d) * smoothstep(0.2, 0.26, d) * 0.5;
  vec3 col = uHot * (core * 1.6 + ring) + uC1 * halo;
  gl_FragColor = vec4(col * vAmt, 1.0);
}
`;

// Waist (node) position of the cone scenes, mirrored from conePar() above for the CPU side.
const CONE_NODE = {
  1: { b: [-1.40, 0.10, -0.90, 0.05, -0.05, -0.02, 0.62, -1.05], s: 0.40, amt: 1.0 },
  2: { b: [-1.30, 0.05, -0.90, 0.0, 0.0, 0.10, 1.30, 0.30], s: 0.30, amt: 1.0 },
  3: { b: [-1.30, -0.80, -0.42, -0.34, 0.40, 0.20, 1.30, 0.72], s: 0.15, amt: 0.35 },
};
function bez1(a, b, c, d, s) { const u = 1 - s; return u * u * u * a + 3 * u * u * s * b + 3 * u * s * s * c + s * s * s * d; }
function nodeOf(k, W) {
  const n = CONE_NODE[k];
  if (!n) return null;
  const [x0, y0, x1, y1, x2, y2, x3, y3] = n.b;
  return { x: bez1(x0, x1, x2, x3, n.s) * W, y: bez1(y0, y1, y2, y3, n.s), amt: n.amt };
}

function buildStrandGeometry(N, M) {
  const verts = N * (M + 1) * 2;
  const aId = new Float32Array(verts);
  const aT = new Float32Array(verts);
  const aSide = new Float32Array(verts);
  const index = new Uint32Array(N * M * 6);
  let v = 0;
  let k = 0;
  for (let n = 0; n < N; n++) {
    const base = v;
    for (let m = 0; m <= M; m++) {
      for (let s = -1; s <= 1; s += 2) {
        aId[v] = n / N;
        aT[v] = m / M;
        aSide[v] = s;
        v++;
      }
    }
    for (let m = 0; m < M; m++) {
      const a = base + m * 2;
      index[k++] = a; index[k++] = a + 1; index[k++] = a + 2;
      index[k++] = a + 1; index[k++] = a + 3; index[k++] = a + 2;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  geo.setAttribute('aId', new THREE.BufferAttribute(aId, 1));
  geo.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
  geo.setAttribute('aSide', new THREE.BufferAttribute(aSide, 1));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);
  return geo;
}

function buildDustGeometry(nDust, nBokeh, seedRand) {
  const n = nDust + nBokeh;
  const aA = new Float32Array(n * 4);
  const aB = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const bokeh = i >= nDust;
    // dust is denser on the left, where the fibre bundles live
    const x = bokeh ? 0.05 + seedRand() * 1.0 : Math.pow(seedRand(), 1.3) * 2 - 1;
    aA[i * 4] = bokeh ? x : x + (seedRand() - 0.5) * 0.2;
    aA[i * 4 + 1] = seedRand() * 2 - 1;
    aA[i * 4 + 2] = seedRand();
    aA[i * 4 + 3] = seedRand();
    aB[i * 2] = bokeh ? 26 + seedRand() * seedRand() * 120 : 1.2 + seedRand() * seedRand() * 4.2;
    aB[i * 2 + 1] = bokeh ? 1 : 0;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aA', new THREE.BufferAttribute(aA, 4));
  geo.setAttribute('aB', new THREE.BufferAttribute(aB, 2));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);
  return geo;
}

function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Fibers {
  constructor({ mobile = false, strands, segments } = {}) {
    this.mobile = mobile;
    this.N = strands ?? (mobile ? 520 : 900);
    this.M = segments ?? (mobile ? 64 : 96);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 0.05, 40);
    this.camera.position.set(0, 0, CAM_Z);

    this.cur = { c1: new THREE.Color(), c2: new THREE.Color(), c3: new THREE.Color(), hot: new THREE.Color() };
    this.tgt = { c1: new THREE.Color(), c2: new THREE.Color(), c3: new THREE.Color(), hot: new THREE.Color() };
    this.gainCur = 1;
    this.gainTgt = 1;
    this.gainMul = 1;

    const common = {
      uTime: { value: 0 }, uDpr: { value: 1 }, uView: { value: new THREE.Vector2(1.78, 1) }, uCamZ: { value: CAM_Z },
      uC1: { value: this.cur.c1 }, uC2: { value: this.cur.c2 }, uC3: { value: this.cur.c3 }, uHot: { value: this.cur.hot },
    };
    this.uniforms = {
      ...common,
      uRes: { value: new THREE.Vector2(1, 1) },
      uN: { value: this.N },
      uA: { value: 0 }, uB: { value: 0 }, uMorph: { value: 0 },
      uGain: { value: 1 }, uWidth: { value: 1.15 }, uReveal: { value: 0 },
      uFx: { value: new THREE.Vector4(1, 0, 0, 0) },
      uIris: { value: new THREE.Vector4(0, 0.35, 0.9, 0) },
      uMouse: { value: new THREE.Vector2(9, 9) },
      uBeat: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation,
      side: THREE.DoubleSide,
    });
    this.fibers = new THREE.Mesh(buildStrandGeometry(this.N, this.M), mat);
    this.fibers.frustumCulled = false;
    this.scene.add(this.fibers);

    const rand = mulberry(7);
    this.dustUniforms = {
      ...common,
      uScroll: { value: 0 }, uBokeh: { value: 1 }, uDust: { value: 1 },
    };
    const dmat = new THREE.ShaderMaterial({
      vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, uniforms: this.dustUniforms,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation,
    });
    this.dust = new THREE.Points(buildDustGeometry(mobile ? 300 : 650, mobile ? 14 : 30, rand), dmat);
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);

    this.nodeUniforms = { ...common, uPos: { value: new THREE.Vector3() }, uAmt: { value: 0 } };
    const ngeo = new THREE.BufferGeometry();
    ngeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    ngeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);
    this.node = new THREE.Points(ngeo, new THREE.ShaderMaterial({
      vertexShader: NODE_VERT, fragmentShader: NODE_FRAG, uniforms: this.nodeUniforms,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation,
    }));
    this.node.frustumCulled = false;
    this.scene.add(this.node);
  }

  setTheme(theme, instant = false) {
    this.tgt.c1.set(theme.c1); this.tgt.c2.set(theme.c2); this.tgt.c3.set(theme.c3); this.tgt.hot.set(theme.hot);
    this.gainTgt = theme.gain;
    if (instant) {
      for (const k of Object.keys(this.cur)) this.cur[k].copy(this.tgt[k]);
      this.gainCur = this.gainTgt;
    }
  }

  setSize(w, h, dpr) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const view = new THREE.Vector2(w / h, 1);
    this.uniforms.uView.value.copy(view);
    this.dustUniforms.uView.value.copy(view);
    this.uniforms.uRes.value.set(w * dpr, h * dpr);
    this.uniforms.uDpr.value = dpr;
    this.dustUniforms.uDpr.value = dpr;
    this.nodeUniforms.uDpr.value = dpr;
    // thin ribbons are enough on a phone's tiny viewport, keep the aspect forgiving
    this.uniforms.uWidth.value = Math.min(1.5, Math.max(1.0, 0.95 + (Math.min(w, 1600) / 1600) * 0.6));
  }

  update(dt, t, s) {
    const k = 1 - Math.exp(-dt * 3.2);
    for (const key of Object.keys(this.cur)) this.cur[key].lerp(this.tgt[key], k);
    this.gainCur += (this.gainTgt - this.gainCur) * k;

    const u = this.uniforms;
    u.uTime.value = t;
    this.dustUniforms.uTime.value = t;
    u.uGain.value = this.gainCur * this.gainMul;
    u.uA.value = s.A; u.uB.value = s.B; u.uMorph.value = s.morph;
    u.uReveal.value = s.reveal;
    u.uFx.value.set(s.tubeDraw, s.fly, s.twist, s.irisScale);
    u.uIris.value.set(s.irisCx, s.irisCy, s.irisTilt, s.irisSpin);
    u.uMouse.value.set(s.mx, s.my);
    u.uBeat.value = s.beat;
    this.dustUniforms.uScroll.value = s.p;
    this.dustUniforms.uBokeh.value = s.bokeh * s.reveal;
    this.dustUniforms.uDust.value = s.dustVis * Math.min(1, s.reveal * 2);
    // glowing node on the waist of the funnel scenes
    const W = this.uniforms.uView.value.x;
    const na = nodeOf(s.A, W);
    const nb = nodeOf(s.B, W);
    const mm = s.A === s.B ? 0 : s.morph;
    const pa = na || nb;
    const pb = nb || na;
    this.nodeUniforms.uTime.value = t;
    if (pa && pb) {
      const e = mm * mm * (3 - 2 * mm);
      this.nodeUniforms.uPos.value.set(pa.x + (pb.x - pa.x) * e, pa.y + (pb.y - pa.y) * e, 0);
      this.nodeUniforms.uAmt.value = ((na ? na.amt : 0) * (1 - e) + (nb ? nb.amt : 0) * e) * s.reveal;
    } else this.nodeUniforms.uAmt.value = 0;
    // parallax: the camera drifts a little against the pointer
    this.camera.position.x += (s.cx * 0.06 - this.camera.position.x) * 0.04;
    this.camera.position.y += (s.cy * 0.04 - this.camera.position.y) * 0.04;
    this.camera.lookAt(0, 0, 0);
  }
}
