import * as THREE from 'three';
import { ANIM_GLSL } from './anim.glsl.js';

// One GPU particle field that holds two pages at a time (A and B).
// Scrolling drives uMorph from 0 → 1; each particle leaves A, drifts through a
// cloud of signal and settles into B on its own slightly delayed schedule.
// Going down the page climbs the hierarchy, so the old level shrinks away and
// the new one arrives from larger: a zoom out.

const vertex = /* glsl */ `
uniform float uTime;
uniform float uMorph;
uniform float uTypeA;
uniform float uTypeB;
uniform mat4 uModelA;
uniform mat4 uModelB;
uniform float uSizeK;
uniform vec3 uMouse;
uniform float uMouseF;
uniform vec4 uRipple;
uniform float uBoost;

attribute vec3 aPosA;
attribute vec3 aPosB;
attribute vec3 aColA;
attribute vec3 aColB;
attribute vec4 aAnimA;
attribute vec4 aAnimB;
attribute vec2 aSize;
attribute vec2 aRnd;

varying vec3 vColor;
varying float vAlpha;

${ANIM_GLSL}

void main() {
  float t = uTime;
  float m = clamp((uMorph - aRnd.x * 0.38) / 0.62, 0.0, 1.0);
  m = m * m * (3.0 - 2.0 * m);

  vec4 A = animate(uTypeA, aPosA, aAnimA, t);
  vec4 B = m > 0.0 ? animate(uTypeB, aPosB, aAnimB, t) : A;
  vec3 cA = (uModelA * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 cB = (uModelB * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 wA = (uModelA * vec4(A.xyz, 1.0)).xyz;
  vec3 wB = (uModelB * vec4(B.xyz, 1.0)).xyz;
  wA = cA + (wA - cA) * (1.0 - 0.6 * m);
  wB = cB + (wB - cB) * (1.0 + 0.9 * (1.0 - m));
  vec3 wp = mix(wA, wB, m);

  // Mid-transition the particles loosen into a drifting cloud of signal.
  float mid = sin(PI * m);
  vec3 sw = vec3(
    sin(wp.y * 0.55 + t * 0.7 + aRnd.y * 6.28),
    sin(wp.z * 0.5 + t * 0.6 + aRnd.x * 6.28),
    sin(wp.x * 0.45 + t * 0.8 + aRnd.y * 4.0)
  );
  wp += sw * mid * (1.2 + aRnd.y * 1.4);

  // Pointer: fibres part around the cursor and light up, as if touched.
  vec2 dm = wp.xy - uMouse.xy;
  float dd = length(dm);
  float push = uMouseF * exp(-dd * dd * 0.35);
  wp.xy += dm / max(dd, 1e-3) * push * 0.9;
  wp.z += push * 0.5;

  // Click: an action potential spreads out as a ring of light.
  float glow = 0.0;
  float age = t - uRipple.z;
  if (age > 0.0 && age < 4.0) {
    vec2 dr = wp.xy - uRipple.xy;
    float rr = length(dr);
    float ring = exp(-pow((rr - age * 5.5) * 1.3, 2.0)) * (1.0 - age / 4.0) * uRipple.w;
    wp.xy += dr / max(rr, 1e-3) * ring * 0.5;
    wp.z += ring * 0.4;
    glow = ring;
  }

  vec4 mv = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;

  float size = mix(aSize.x, aSize.y, m) * (1.0 + mid * 0.2);
  float depth = -mv.z;
  float ps = size * uSizeK * (16.0 / depth);
  gl_PointSize = max(ps, 1.0);

  float twinkle = 0.8 + 0.2 * sin(t * (0.8 + aRnd.x * 2.2) + aRnd.y * 40.0);
  float fog = clamp(1.25 - (depth - 10.0) * 0.035, 0.35, 1.25);
  float tiny = clamp(ps, 0.0, 1.0);
  vColor = mix(aColA * A.w, aColB * B.w, m);
  vAlpha = twinkle * fog * tiny * (1.0 + glow * 2.0 + push * 1.1) * (1.0 + uBoost * 0.35);
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
  float core = exp(-d2 * 6.0);
  float halo = exp(-d2 * 2.0) * 0.3 * uGlow;
  float a = (core + halo) * vAlpha * uAlpha;
  vec3 col = vColor * a + vec3(pow(core, 4.0) * 0.25 * vAlpha * uAlpha);
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
      aPosA: mk(3), aPosB: mk(3), aColA: mk(3), aColB: mk(3), aAnimA: mk(4), aAnimB: mk(4), aSize: mk(2),
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
      uSizeK: { value: 2.6 },
      uAlpha: { value: 0.62 },
      uGlow: { value: 1 },
      uBoost: { value: 0 },
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
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  // Load page `seg` as A and `seg + 1` as B.
  setSegment(seg, shapes, built) {
    if (seg === this.seg) return;
    this.seg = seg;
    const a = built[seg];
    const b = built[Math.min(seg + 1, built.length - 1)];
    const at = this.attr;
    at.aPosA.array.set(a.pos);
    at.aPosB.array.set(b.pos);
    at.aColA.array.set(a.col);
    at.aColB.array.set(b.col);
    at.aAnimA.array.set(a.anim);
    at.aAnimB.array.set(b.anim);
    const sz = at.aSize.array;
    for (let i = 0; i < this.N; i++) {
      sz[i * 2] = a.size[i];
      sz[i * 2 + 1] = b.size[i];
    }
    for (const v of Object.values(at)) v.needsUpdate = true;
    this.uniforms.uTypeA.value = shapes[seg].type;
    this.uniforms.uTypeB.value = shapes[Math.min(seg + 1, shapes.length - 1)].type;
  }
}
