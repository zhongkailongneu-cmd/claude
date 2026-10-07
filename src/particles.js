import * as THREE from 'three';

// One GPU particle field that holds two creatures at a time (A and B).
// Scrolling drives uMorph from 0 → 1; each particle leaves A, swirls through
// the water and settles into B on its own slightly delayed schedule.

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

const float PI = 3.14159265;

mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }

vec4 animHalo(vec3 p, vec4 a, float t) {
  p += vec3(sin(t * 0.21 + a.w * 31.0), sin(t * 0.17 + a.w * 17.0) * 0.8, cos(t * 0.19 + a.w * 23.0)) * 0.45;
  return vec4(p, 0.55 + 0.45 * sin(t * (0.6 + a.w) + a.w * 50.0));
}

// 0 · whirlpool: particles flow inward along spiral arms and sink into the throat.
vec4 animHero(vec3 p, vec4 a, float t) {
  int part = int(a.x + 0.5);
  if (part == 1) {
    p.xz = rot2(-t * 0.35 - a.y * 1.5) * p.xz;
    return vec4(p, 0.7);
  }
  float f = fract(a.y - t * (0.016 + a.w * 0.014));
  float rad = 1.45 + pow(f, 1.2) * 6.6;
  float ang = a.z + log(rad + 0.4) * 2.3 - t * 0.16;
  float sink = exp(-(rad - 1.45) * 0.85);
  float fall = 1.0 - smoothstep(0.0, 0.07, f);
  vec3 q = vec3(cos(ang) * rad, -2.6 * sink - fall * 3.0, sin(ang) * rad);
  q += p * (0.35 + f * 0.9);
  float b = (0.9 + 1.7 * sink) * (1.0 - fall * 0.85) * (1.0 - smoothstep(0.88, 1.0, f));
  return vec4(q, b);
}

// 1 · sea turtle: front flippers beat in a slow underwater flight stroke.
vec4 animTurtle(vec3 p, vec4 a, float t) {
  int part = int(a.x + 0.5);
  float w = t * 1.15;
  if (part == 1) {
    vec3 root = vec3(0.95, -0.05, 1.45 * a.z);
    vec3 q = p - root;
    float d = a.y;
    float ang = (sin(w - d * 0.9) * 0.62 + 0.1) * a.z * (0.55 + 0.45 * d);
    q.yz = rot2(ang) * q.yz;
    q.xz = rot2(cos(w - d * 0.6) * 0.22 * a.z) * q.xz;
    p = root + q;
  } else if (part == 2) {
    vec3 root = vec3(-1.55, -0.08, 0.95 * a.z);
    vec3 q = p - root;
    q.yz = rot2(sin(w + 1.3) * 0.22 * a.z) * q.yz;
    p = root + q;
  } else if (part == 3) {
    p.y += sin(w * 0.5) * 0.05;
    p.z += sin(w * 0.33) * 0.06 * max(p.x - 1.8, 0.0);
  }
  return vec4(p, 1.0);
}

// 2 · manta: travelling wave along the wings, outward from the body.
vec4 animManta(vec3 p, vec4 a, float t) {
  int part = int(a.x + 0.5);
  float w = t * 1.2;
  float s = a.y;
  if (part == 0 || part == 3) {
    float ph = w - s * 1.7;
    p.y += sin(ph) * pow(s, 1.55) * 1.25;
    p.z *= 1.0 - 0.07 * s * s * (0.5 + 0.5 * sin(ph));
    p.y += sin(w * 1.6 - p.x * 1.3) * 0.05 * (0.3 + s);
  } else if (part == 1) {
    p.y += sin(w * 0.9 + a.z) * 0.07 * a.y;
    p.z += sin(w * 0.7) * 0.05 * a.y * a.z;
  } else if (part == 2) {
    float k = clamp((-p.x - 1.6) / 3.2, 0.0, 1.0);
    p.z += sin(w * 1.3 + p.x * 1.1) * 0.25 * k;
    p.y += sin(w - 1.0) * 0.12 * k;
  }
  p.y += sin(w - 0.6) * 0.08;
  return vec4(p, 1.0);
}

// 3 · blue whale: slow vertical body wave, strongest at the flukes.
vec4 animWhale(vec3 p, vec4 a, float t) {
  int part = int(a.x + 0.5);
  float w = t * 0.75;
  float u = a.y;
  p.y += sin(w - u * 2.6) * pow(u, 2.4) * 0.8;
  if (part == 1) {
    float d = abs(a.z);
    p.y += sin(w * 0.9 + 0.5) * 0.3 * d;
  }
  return vec4(p, 1.0);
}

// 4 · lanternfish: side-to-side swimming; photophores pulse.
vec4 animLantern(vec3 p, vec4 a, float t) {
  float part = floor(a.x + 0.001);
  float sc = (a.x - part) * 10.0;
  float u = a.y;
  float ph = a.z;
  float w = t * 2.6 + ph;
  p.z += sin(w - u * 5.5) * (0.03 + 0.42 * u * u) * sc;
  if (sc < 0.9) {
    p += vec3(sin(t * 0.4 + ph) * 0.35, sin(t * 0.55 + ph * 1.7) * 0.25, cos(t * 0.35 + ph) * 0.3);
  }
  float b = 1.0;
  if (part > 2.5) b = 0.8 + 1.0 * pow(0.5 + 0.5 * sin(t * 1.7 + a.w * 12.0 + u * 6.0), 3.0);
  return vec4(p, b);
}

// 5 · jellyfish: bell contracts and relaxes; tentacles trail and wave.
// Rim lights spin a pinwheel of light around the bell (Atolla's "alarm").
vec4 animJelly(vec3 p, vec4 a, float t) {
  int part = int(a.x + 0.5);
  float w = t * 1.35;
  float pulse = pow(0.5 + 0.5 * sin(w), 1.8);
  float bob = sin(w - 1.4) * 0.22;
  float b = 1.0;
  if (part <= 2 || part == 5) {
    float s = a.y;
    float k = 1.0 - 0.15 * pulse * smoothstep(0.1, 1.0, s);
    p.xz *= k;
    p.y += 0.18 * pulse * s * s + bob;
    if (part == 2) b = 0.8 + 2.2 * pow(0.5 + 0.5 * sin(t * 2.4 - a.z * 3.0), 8.0);
  } else if (part == 3) {
    float d = a.y;
    p.xz *= 1.0 - 0.1 * pulse * (1.0 - d);
    p.x += sin(w * 0.7 - d * 3.5 + a.z) * 0.28 * d;
    p.z += cos(w * 0.6 - d * 3.0 + a.z) * 0.28 * d;
    p.y += sin(w - 1.4 - d * 1.2) * 0.22 + 0.09 * pulse * (1.0 - d);
  } else if (part == 4) {
    float d = a.y;
    p.xz *= 1.0 - 0.15 * pulse * (1.0 - d) * 0.9;
    p.x += sin(w * 0.8 - d * 5.0 + a.z) * 0.4 * d;
    p.z += cos(w * 0.7 - d * 4.2 + a.z * 1.3) * 0.4 * d;
    p.y += sin(w - 1.4 - d * 2.0) * 0.22 + 0.18 * pulse * (1.0 - d) + d * d * 0.25 * pulse;
    b = 1.0 - d * 0.3;
  }
  return vec4(p, b);
}

// 6 · anglerfish: jaw works slowly, the lure sways and pulses.
vec4 animAngler(vec3 p, vec4 a, float t) {
  int part = int(a.x + 0.5);
  float b = 1.0;
  if (part == 1) {
    vec2 h = vec2(-0.3, -0.5);
    float ang = -0.08 - 0.08 * sin(t * 0.9);
    p.xy = h + rot2(ang) * (p.xy - h);
  } else if (part == 4 || part == 5) {
    float d = a.y;
    p.x += sin(t * 1.1) * 0.35 * d * d;
    p.y += sin(t * 1.5 + 0.7) * 0.2 * d * d;
    p.z += sin(t * 0.8) * 0.25 * d * d;
    if (part == 5) b = 1.0 + 0.8 * pow(0.5 + 0.5 * sin(t * 2.2), 2.0);
  } else if (part == 6) {
    p.z += sin(t * 2.4 + a.z - a.y * 2.0) * 0.18 * a.y;
  }
  p.y += sin(t * 0.7) * 0.12;
  return vec4(p, b);
}

// 7 · electric eel: travelling body wave, discharge pulses, flickering arcs.
vec4 animEel(vec3 p, vec4 a, float t) {
  int part = int(a.x + 0.5);
  float u = a.y;
  float w = t * 1.9;
  p.z += sin(w - u * 10.0) * (0.18 + 0.42 * u);
  p.y += sin(w * 0.6 - u * 5.0) * 0.18 * u;
  float band = fract(u * 2.5 - t * 0.55);
  float pulse = exp(-pow((band - 0.5) * 9.0, 2.0));
  float b = 1.0 + 1.3 * pulse;
  if (part == 1) {
    p.y += sin(t * 6.0 - u * 55.0) * 0.05;
    b = 1.0 + 0.8 * pulse;
  } else if (part == 3) {
    float k = floor(t * 11.0 + a.z * 3.17);
    float on = step(0.7, hash11(k + a.z * 13.7));
    p += (vec3(hash11(k * 1.3 + a.z * 7.1), hash11(k * 2.1 + a.z * 5.3), hash11(k * 0.7 + a.z * 3.7)) - 0.5) * 0.3;
    p += (vec3(hash11(k + a.w * 91.0), hash11(k + a.w * 57.0), hash11(k + a.w * 33.0)) - 0.5) * 0.03;
    b = on * (1.5 + pulse * 1.5);
  }
  return vec4(p, b);
}

// 8 · sea surface: rolling swell; crests glow brighter.
vec4 animOutro(vec3 p, vec4 a, float t) {
  float h = 0.55 * sin(p.x * 0.42 + t * 0.7) + 0.38 * sin(p.z * 0.55 + t * 0.55 + p.x * 0.18) + 0.16 * sin((p.x + p.z) * 1.1 - t * 1.3);
  p.y += h;
  return vec4(p, 0.6 + 0.9 * smoothstep(-0.4, 1.0, h));
}

vec4 animate(float type, vec3 p, vec4 a, float t) {
  if (a.x > 8.5) return animHalo(p, a, t);
  int ty = int(type + 0.5);
  if (ty == 0) return animHero(p, a, t);
  if (ty == 1) return animTurtle(p, a, t);
  if (ty == 2) return animManta(p, a, t);
  if (ty == 3) return animWhale(p, a, t);
  if (ty == 4) return animLantern(p, a, t);
  if (ty == 5) return animJelly(p, a, t);
  if (ty == 6) return animAngler(p, a, t);
  if (ty == 7) return animEel(p, a, t);
  return animOutro(p, a, t);
}

void main() {
  float t = uTime;
  float m = clamp((uMorph - aRnd.x * 0.38) / 0.62, 0.0, 1.0);
  m = m * m * (3.0 - 2.0 * m);

  vec4 A = animate(uTypeA, aPosA, aAnimA, t);
  vec4 B = m > 0.0 ? animate(uTypeB, aPosB, aAnimB, t) : A;
  vec3 wA = (uModelA * vec4(A.xyz, 1.0)).xyz;
  vec3 wB = (uModelB * vec4(B.xyz, 1.0)).xyz;
  vec3 wp = mix(wA, wB, m);

  // Mid-transition the particles scatter into a drifting plankton cloud.
  float mid = sin(PI * m);
  vec3 sw = vec3(
    sin(wp.y * 0.55 + t * 0.7 + aRnd.y * 6.28),
    sin(wp.z * 0.5 + t * 0.6 + aRnd.x * 6.28),
    sin(wp.x * 0.45 + t * 0.8 + aRnd.y * 4.0)
  );
  wp += sw * mid * (1.4 + aRnd.y * 1.6);
  wp.y += mid * (aRnd.x - 0.5) * 2.0;

  // Pointer: particles part around the cursor like plankton around a hand.
  vec2 dm = wp.xy - uMouse.xy;
  float dd = length(dm);
  float push = uMouseF * exp(-dd * dd * 0.4);
  wp.xy += dm / max(dd, 1e-3) * push * 1.3;
  wp.z += push * 0.7;

  // Click: a ring of light ripples outward.
  float glow = 0.0;
  float age = t - uRipple.z;
  if (age > 0.0 && age < 4.0) {
    vec2 dr = wp.xy - uRipple.xy;
    float rr = length(dr);
    float ring = exp(-pow((rr - age * 5.0) * 1.2, 2.0)) * (1.0 - age / 4.0) * uRipple.w;
    wp.xy += dr / max(rr, 1e-3) * ring * 0.55;
    wp.z += ring * 0.45;
    glow = ring;
  }

  vec4 mv = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;

  float size = mix(aSize.x, aSize.y, m) * (1.0 + mid * 0.2);
  float depth = -mv.z;
  float ps = size * uSizeK * (16.0 / depth);
  gl_PointSize = max(ps, 1.0);

  float twinkle = 0.78 + 0.22 * sin(t * (0.8 + aRnd.x * 2.2) + aRnd.y * 40.0);
  float fog = clamp(1.25 - (depth - 10.0) * 0.035, 0.35, 1.25);
  float tiny = clamp(ps, 0.0, 1.0);
  vColor = mix(aColA * A.w, aColB * B.w, m);
  vAlpha = twinkle * fog * tiny * (1.0 + glow * 2.0 + push * 0.5);
}
`;

const fragment = /* glsl */ `
uniform float uAlpha;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(c, c);
  if (d2 > 1.0) discard;
  float core = exp(-d2 * 6.0);
  float halo = exp(-d2 * 2.0) * 0.28;
  float a = (core + halo) * vAlpha * uAlpha;
  vec3 col = vColor * a + vec3(pow(core, 4.0) * 0.3 * vAlpha * uAlpha);
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

  // Load creature `seg` as A and `seg + 1` as B.
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
