import * as THREE from 'three';
import { ORBITS, PLUTO_E, PLUTO_I, OMEGA0 } from './shapes/hero.js';
import { GALAXY_SUN } from './shapes/galaxy.js';

// One GPU particle field that holds two bodies at a time (A and B).
// Scrolling drives uMorph from 0 → 1; each particle leaves A, swirls through a
// stardust vortex and settles into B on its own slightly delayed schedule.
//
// Every particle carries two colours (multi / mono). uMono blends between them
// with a wave that sweeps across the screen. uGlow fades the sprite from a
// plain dot (0, like the reference site) to a fluorescent core + halo.

const f = (x) => x.toFixed(5);
const OMEGAS = ORBITS.map((o) => f(OMEGA0 / Math.sqrt(o.P))).join(', ');

const vertex = /* glsl */ `
uniform float uTime;
uniform float uMorph;
uniform float uTypeA;
uniform float uTypeB;
uniform mat4 uModelA;
uniform mat4 uModelB;
uniform vec4 uParA;
uniform vec4 uParB;
uniform float uSpinA;
uniform float uSpinB;
uniform float uOccA;
uniform float uOccB;
uniform float uLitA;
uniform float uLitB;
uniform float uGainA;
uniform float uGainB;
uniform vec3 uSunDir;
uniform float uNight;
uniform float uSizeK;
uniform vec3 uMouse;
uniform float uMouseF;
uniform vec4 uRipple;
uniform float uMono;
uniform float uGlow;

attribute vec3 aPosA;
attribute vec3 aPosB;
attribute vec3 aColA;
attribute vec3 aColB;
attribute vec3 aMonA;
attribute vec3 aMonB;
attribute vec4 aAnimA;
attribute vec4 aAnimB;
attribute vec2 aSize;
attribute vec2 aRnd;

varying vec3 vColor;
varying float vAlpha;

const float PI = 3.14159265;
const float OM[9] = float[9](${OMEGAS});

vec3 ry(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 rz(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
vec3 rx(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
vec3 dirLL(float lat, float lon) { return vec3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon)); }

vec4 animHalo(vec3 p, vec4 a, float t) {
  p += vec3(sin(t * 0.13 + a.w * 31.0), sin(t * 0.11 + a.w * 17.0) * 0.7, cos(t * 0.12 + a.w * 23.0)) * 0.3;
  return vec4(p, 0.45 + 0.55 * pow(0.5 + 0.5 * sin(t * (0.5 + a.w) + a.w * 50.0), 2.0));
}

// Prograde orbit in the ecliptic (counter-clockwise seen from the north).
vec3 orbitPos(float r, float ang) {
  if (r < 0.0) {
    float a = -r;
    float rr = a * (1.0 - ${f(PLUTO_E * PLUTO_E)}) / (1.0 + ${f(PLUTO_E)} * cos(ang));
    return rx(vec3(cos(ang) * rr, 0.0, -sin(ang) * rr), ${f(PLUTO_I)});
  }
  return vec3(cos(ang) * r, 0.0, -sin(ang) * r);
}

// 0 · the system: planets orbit the Sun, the Moon circles Earth.
vec4 animHero(vec3 p, vec4 a, float t) {
  int part = int(a.x + 0.5);
  if (part == 0) {
    p = ry(p, t * 0.05);
    float b = length(p) > 0.9 ? 0.7 + 0.5 * sin(t * 1.3 + a.w * 40.0) : 0.9 + 0.2 * sin(t * 2.0 + a.w * 60.0);
    return vec4(p, b);
  }
  if (part <= 10) {
    int i = part == 10 ? 2 : part - 1;
    float r = i == 8 ? -a.y : a.y;
    vec3 c = orbitPos(r, a.z + t * OM[i]);
    if (part == 10) c += vec3(cos(t * 1.4 + a.z), 0.04, -sin(t * 1.4 + a.z)) * 0.36;
    float lit = dot(normalize(p), normalize(-c));
    return vec4(c + p, mix(0.16, 1.2, smoothstep(-0.25, 0.45, lit)));
  }
  if (part == 11) {
    vec3 c = orbitPos(a.y, a.z + t * 0.012);
    return vec4(c + vec3(0.0, p.y, 0.0), 0.55 + 0.45 * sin(t * 0.7 + a.w * 30.0));
  }
  float w = 0.24 * pow(a.y / 3.0, -1.5);
  vec3 c = orbitPos(a.y, a.z + t * w);
  return vec4(c + vec3(0.0, p.y, 0.0), 0.6 + 0.4 * sin(t * 1.1 + a.w * 30.0));
}

// 1 · the Sun: differential rotation, flickering granules, breathing
// prominences, an outward-streaming corona and periodic eruptions.
vec4 animSun(vec3 p, vec4 a, float t, vec4 par, float spin, out vec4 nrm) {
  int part = int(a.x + 0.5);
  float R = par.w;
  nrm = vec4(0.0);
  if (part <= 1) {
    float lat = asin(clamp(p.y / length(p), -1.0, 1.0));
    float diff = par.y * (1.0 - 1.6 * sin(lat) * sin(lat)) * sin(t * 0.05);
    vec3 q = rz(ry(p, t * par.x + spin + diff), par.z);
    if (part == 1) {
      q *= 1.0 + 0.012 * sin(t * 3.0 + a.w * 40.0);
      nrm = vec4(normalize(q), 5.0);
      return vec4(q, 1.25);
    }
    nrm = vec4(normalize(q), 2.0);
    return vec4(q, 0.86 + 0.28 * sin(t * (1.4 + a.w * 2.0) + a.w * 60.0));
  }
  if (part == 2) {
    vec3 d = normalize(p);
    float h = (length(p) - R) * (1.0 + 0.14 * sin(t * 0.55 + a.z * 2.0));
    vec3 q = d * (R + h) + vec3(sin(t * 0.4 + a.w * 9.0), cos(t * 0.33 + a.w * 7.0), 0.0) * 0.03;
    return vec4(q, 0.7 + 1.0 * pow(0.5 + 0.5 * sin(a.y * 14.0 - t * 1.6 + a.z), 3.0));
  }
  if (part == 3) {
    float ff = fract(a.y + t * (0.012 + a.z * 0.022));
    vec3 q = p * R * (1.02 + pow(ff, 1.35) * 1.9);
    float b = pow(1.0 - ff, 1.5) * smoothstep(0.0, 0.05, ff) * 1.5;
    return vec4(q, b);
  }
  if (part == 4) {
    float cyc = t / 7.5 + a.z * 0.25;
    float ph = fract(cyc);
    float n = floor(cyc) + a.z * 13.0;
    float lon = (hash11(n * 1.7) < 0.5 ? -1.0 : 1.0) * (1.25 + hash11(n * 2.3) * 0.5);
    float lat = (hash11(n * 3.1) - 0.5) * 1.3;
    vec3 d = dirLL(lat, lon);
    vec3 q = d * R * (1.0 + ph * 1.5 * a.y) + p * (0.3 + ph * 5.0);
    return vec4(q, pow(1.0 - ph, 1.6) * smoothstep(0.0, 0.04, ph) * 2.2);
  }
  return vec4(p, 1.0);
}

// 2 · planets: spin about a tilted axis, sloshing zonal jets, faster clouds,
// Keplerian rings, and (for Earth) a tidally locked Moon on an inclined orbit.
vec4 animPlanet(vec3 p, vec4 a, float t, vec4 par, float spin, float R, out vec4 nrm) {
  int part = int(a.x + 0.5);
  nrm = vec4(0.0);
  if (part == 4) {
    float w = par.w * pow(a.y / R, -1.5);
    float ang = a.z + t * w;
    vec3 q = rz(vec3(cos(ang) * a.y, p.y, -sin(ang) * a.y), par.z);
    return vec4(q, 1.0);
  }
  if (part == 5) {
    float th = t * par.w + 0.9;
    vec3 c = vec3(cos(th), 0.0, -sin(th)) * a.y;
    vec3 q = ry(p, th - PI * 0.5);
    nrm = vec4(normalize(rx(q, a.z)), 1.0);
    return vec4(rx(c + q, a.z), 1.0);
  }
  float lat = part == 6 ? a.y : asin(clamp(p.y / length(p), -1.0, 1.0));
  float jets = sin(lat * 6.0) * 0.7 + cos(lat * 2.0) * 0.6;
  float sh = par.y * jets * sin(t * 0.06 + 1.3);
  float drift = part == 1 ? t * par.x * 0.18 : 0.0;
  vec3 q = rz(ry(p, t * par.x + spin + sh + drift), par.z);
  float mode = part == 2 ? 4.0 : part == 3 ? 3.0 : 1.0;
  nrm = vec4(normalize(q), mode);
  float b = part == 3 ? 0.75 + 0.45 * sin(t * 2.3 + a.w * 40.0) : 1.0;
  return vec4(q, b);
}

// 3 · the Milky Way: slow rigid rotation; a ripple marks the Sun.
vec4 animGalaxy(vec3 p, vec4 a, float t, vec4 par, float spin) {
  int part = int(a.x + 0.5);
  float b = 0.8 + 0.25 * sin(t * (0.6 + a.w) + a.w * 40.0);
  if (part == 2) {
    vec3 c = vec3(cos(${f(GALAXY_SUN.a)}) * ${f(GALAXY_SUN.r)}, 0.0, sin(${f(GALAXY_SUN.a)}) * ${f(GALAXY_SUN.r)});
    float ph = fract(t * 0.45 + a.w * 0.08);
    p = c + (p - c) * (0.35 + ph * 1.6);
    b = 1.6 * (1.0 - ph);
  } else if (part == 3) {
    b = 1.5 + 0.6 * sin(t * 3.0);
  }
  return vec4(ry(p, -t * par.x - spin), b);
}

vec4 animate(float type, vec3 p, vec4 a, float t, vec4 par, float spin, float occ, out vec4 nrm) {
  nrm = vec4(0.0);
  if (a.x > 14.5) return animHalo(p, a, t);
  int ty = int(type + 0.5);
  if (ty == 0) return animHero(p, a, t + spin);
  if (ty == 1) return animSun(p, a, t, par, spin, nrm);
  if (ty == 2) return animPlanet(p, a, t, par, spin, occ, nrm);
  return animGalaxy(p, a, t, par, spin);
}

// Lighting, limb effects, occlusion behind the main sphere, and its shadow.
float shade(vec3 wp, vec3 lp, vec4 n, mat4 M, float occR, float lit) {
  float b = 1.0;
  vec3 C = M[3].xyz;
  float sc = length(M[0].xyz);
  vec3 V = normalize(cameraPosition - wp);
  float mode = n.w;
  if (mode > 0.5) {
    vec3 N = normalize(mat3(M) * n.xyz);
    float facing = dot(N, V);
    float L = dot(N, uSunDir);
    if (mode < 1.5) {
      b *= mix(0.05, 1.0, smoothstep(-0.2, 0.18, facing));
      if (lit > 0.5) b *= mix(uNight, 1.0, smoothstep(-0.12, 0.32, L)) * (0.8 + 0.3 * max(L, 0.0));
    } else if (mode < 2.5) {
      b *= mix(0.04, 1.0, smoothstep(-0.2, 0.15, facing)) * (0.45 + 0.55 * sqrt(max(facing, 0.0)));
    } else if (mode < 3.5) {
      b *= smoothstep(-0.05, 0.25, facing) * (1.0 - smoothstep(-0.25, 0.04, L)) * 1.6;
    } else if (mode < 4.5) {
      float rim = pow(1.0 - abs(facing), 2.2);
      b *= (0.12 + rim * 1.7) * (lit > 0.5 ? mix(0.1, 1.0, smoothstep(-0.3, 0.25, L)) : 1.0);
    } else {
      b *= pow(1.0 - abs(facing), 3.0) * 2.0;
    }
  }
  if (occR > 0.0 && (mode < 0.5 || mode > 3.5 || length(lp) > occR * 1.08)) {
    float r = occR * sc;
    vec3 oc = C - cameraPosition;
    vec3 d = -V;
    float tc = dot(oc, d);
    float dist = length(wp - cameraPosition);
    float perp2 = dot(oc, oc) - tc * tc;
    float inside = 1.0 - smoothstep(r * r * 0.9, r * r * 1.02, perp2);
    float behind = smoothstep(tc - r * 0.05, tc + r * 0.25, dist);
    b *= 1.0 - 0.96 * inside * behind;
    if (lit > 0.5) {
      vec3 cw = C - wp;
      float ts = dot(cw, uSunDir);
      float sp2 = dot(cw, cw) - ts * ts;
      b *= 1.0 - 0.78 * step(0.0, ts) * (1.0 - smoothstep(r * r * 0.82, r * r, sp2));
    }
  }
  return b;
}

void main() {
  float t = uTime;
  float m = clamp((uMorph - aRnd.x * 0.38) / 0.62, 0.0, 1.0);
  m = m * m * (3.0 - 2.0 * m);

  vec4 nA;
  vec4 nB;
  vec4 A = animate(uTypeA, aPosA, aAnimA, t, uParA, uSpinA, uOccA, nA);
  vec3 wA = (uModelA * vec4(A.xyz, 1.0)).xyz;
  float bA = A.w * uGainA * shade(wA, A.xyz, nA, uModelA, uOccA, uLitA);
  vec3 wB = wA;
  float bB = bA;
  if (m > 0.0) {
    vec4 B = animate(uTypeB, aPosB, aAnimB, t, uParB, uSpinB, uOccB, nB);
    wB = (uModelB * vec4(B.xyz, 1.0)).xyz;
    bB = B.w * uGainB * shade(wB, B.xyz, nB, uModelB, uOccB, uLitB);
  }
  vec3 wp = mix(wA, wB, m);

  // Mid-transition the particles swirl into a stardust vortex and stretch in depth.
  float mid = sin(PI * m);
  wp.xy = rot2(mid * 1.6 / (1.0 + length(wp.xy) * 0.12)) * wp.xy;
  vec3 sw = vec3(
    sin(wp.y * 0.55 + t * 0.7 + aRnd.y * 6.28),
    sin(wp.z * 0.5 + t * 0.6 + aRnd.x * 6.28),
    sin(wp.x * 0.45 + t * 0.8 + aRnd.y * 4.0)
  );
  wp += sw * mid * (1.0 + aRnd.y * 1.6);
  wp.z += mid * (aRnd.x - 0.5) * 7.0;

  // Pointer: a gravitational lens. Particles near the cursor are bent outward
  // onto an Einstein ring, and brighten where they bunch up.
  vec2 dm = wp.xy - uMouse.xy;
  float dd = length(dm);
  float RE = 0.8 * uMouseF;
  float infl = exp(-dd * dd * 0.09);
  float lensed = 0.5 * (dd + sqrt(dd * dd + 4.0 * RE * RE));
  float nd = mix(dd, lensed, infl);
  wp.xy = uMouse.xy + dm / max(dd, 1e-4) * nd;
  float ringGlow = uMouseF * infl * exp(-pow((nd - RE) * 3.0, 2.0));

  // Click: a shock wave of light expands from the click.
  float glow = 0.0;
  float age = t - uRipple.z;
  if (age > 0.0 && age < 4.0) {
    vec2 dr = wp.xy - uRipple.xy;
    float rr = length(dr);
    float ring = exp(-pow((rr - age * 5.5) * 1.2, 2.0)) * (1.0 - age / 4.0) * uRipple.w;
    wp.xy += dr / max(rr, 1e-3) * ring * 0.6;
    wp.z += ring * 0.5;
    glow = ring;
  }

  vec4 mv = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;

  float g = smoothstep(0.0, 0.45, uGlow);
  float size = mix(aSize.x, aSize.y, m) * (1.0 + mid * 0.25);
  float depth = -mv.z;
  float ps = size * uSizeK * (16.0 / depth) * mix(0.62, 1.0, g);
  gl_PointSize = max(ps, 1.0);

  // Colour: multi / mono, switched by a wave that sweeps across the screen.
  vec3 cMulti = mix(aColA * bA, aColB * bB, m);
  vec3 cMono = mix(aMonA * bA, aMonB * bB, m);
  float th = clamp(wp.x / 28.0 + 0.5, 0.0, 1.0) * 0.55;
  float mf = smoothstep(th, th + 0.45, uMono);
  float front = 1.0 - abs(mf * 2.0 - 1.0);
  vColor = mix(cMulti, cMono, mf) * (1.0 + front * 0.9);

  float twinkle = 0.92 + 0.08 * sin(t * (0.8 + aRnd.x * 2.2) + aRnd.y * 40.0);
  float fog = clamp(1.25 - (depth - 10.0) * 0.03, 0.35, 1.25);
  float tiny = clamp(ps, 0.0, 1.0);
  vAlpha = twinkle * fog * tiny * (1.0 + glow * 2.0 + ringGlow * 2.4);
}
`;

const fragment = /* glsl */ `
uniform float uAlpha;
uniform float uGlow;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(c, c);
  if (d2 > 1.0) discard;
  float g = smoothstep(0.0, 0.45, uGlow);
  float plain = 1.0 - smoothstep(0.55, 1.0, d2);
  float core = exp(-d2 * 6.0);
  float halo = exp(-d2 * 2.0) * (0.16 + 0.18 * min(uGlow, 1.5));
  float shape = mix(plain * 1.6, core + halo, g);
  float a = shape * vAlpha * uAlpha;
  vec3 col = vColor * a + vec3(pow(core, 4.0) * 0.28 * g * min(uGlow, 1.4) * vAlpha * uAlpha);
  gl_FragColor = vec4(col, 1.0);
}
`;

export class ParticleField {
  constructor(N) {
    this.N = N;
    this.seg = -1;
    const geo = new THREE.BufferGeometry();
    const mk = (n) => new THREE.BufferAttribute(new Float32Array(N * n), n).setUsage(THREE.DynamicDrawUsage);
    this.attr = {
      aPosA: mk(3), aPosB: mk(3), aColA: mk(3), aColB: mk(3), aMonA: mk(3), aMonB: mk(3), aAnimA: mk(4), aAnimB: mk(4), aSize: mk(2),
    };
    for (const [k, v] of Object.entries(this.attr)) geo.setAttribute(k, v);
    geo.setAttribute('position', this.attr.aPosA);
    const rnd = new Float32Array(N * 2);
    for (let i = 0; i < rnd.length; i++) rnd[i] = Math.random();
    geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 2));

    this.uniforms = {
      uTime: { value: 0 },
      uMorph: { value: 0 },
      uTypeA: { value: 0 },
      uTypeB: { value: 1 },
      uModelA: { value: new THREE.Matrix4() },
      uModelB: { value: new THREE.Matrix4() },
      uParA: { value: new THREE.Vector4() },
      uParB: { value: new THREE.Vector4() },
      uSpinA: { value: 0 },
      uSpinB: { value: 0 },
      uOccA: { value: 0 },
      uOccB: { value: 0 },
      uLitA: { value: 0 },
      uLitB: { value: 0 },
      uGainA: { value: 1 },
      uGainB: { value: 1 },
      uSunDir: { value: new THREE.Vector3(-1, 0.2, 0.32).normalize() },
      uNight: { value: 0.16 },
      uSizeK: { value: 2.6 },
      uAlpha: { value: 0.6 },
      uGlow: { value: 1 },
      uMono: { value: 0 },
      uMouse: { value: new THREE.Vector3(999, 999, 0) },
      uMouseF: { value: 0 },
      uRipple: { value: new THREE.Vector4(0, 0, -99, 0) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  // Load body `seg` as A and `seg + 1` as B. Returns the indices newly loaded
  // (so the caller can reset their spin phase while they are still hidden).
  setSegment(seg, shapes, built) {
    if (seg === this.seg) return null;
    const prev = this.seg;
    this.seg = seg;
    const ib = Math.min(seg + 1, built.length - 1);
    const a = built[seg];
    const b = built[ib];
    const at = this.attr;
    at.aPosA.array.set(a.pos);
    at.aPosB.array.set(b.pos);
    at.aColA.array.set(a.col);
    at.aColB.array.set(b.col);
    at.aMonA.array.set(a.mono);
    at.aMonB.array.set(b.mono);
    at.aAnimA.array.set(a.anim);
    at.aAnimB.array.set(b.anim);
    const sz = at.aSize.array;
    for (let i = 0; i < this.N; i++) {
      sz[i * 2] = a.size[i];
      sz[i * 2 + 1] = b.size[i];
    }
    for (const v of Object.values(at)) v.needsUpdate = true;
    const U = this.uniforms;
    const SA = shapes[seg];
    const SB = shapes[ib];
    U.uTypeA.value = SA.type;
    U.uTypeB.value = SB.type;
    U.uParA.value.fromArray(SA.par);
    U.uParB.value.fromArray(SB.par);
    U.uOccA.value = SA.occ || 0;
    U.uOccB.value = SB.occ || 0;
    U.uLitA.value = SA.lit || 0;
    U.uLitB.value = SB.lit || 0;
    U.uGainA.value = SA.gain || 1;
    U.uGainB.value = SB.gain || 1;
    return [seg, ib].filter((i) => i !== prev && i !== prev + 1);
  }
}
