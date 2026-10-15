// Ambient life: falling petals / leaves / snow and blinking fireflies (one GPU
// particle system per season), sparkles drifting down the brook, the bending
// aurora ribbons over winter, a starfield and a small moon.

import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { R, WATER, SPOTS, seasonAt, riverPoint, RIVER, dirLL, tangentToward, toLL } from './world.js';

const V3 = THREE.Vector3;

const DRIFT_VERT = /* glsl */ `
  uniform float uTime, uR, uSize, uScale, uMode, uSpeed, uRange;
  attribute vec3 aDir;
  attribute vec4 aSeed;
  attribute float aGround;
  varying float vAlpha, vMix, vSpin;
  vec3 tangentOf(vec3 d) {
    vec3 r = abs(d.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    return normalize(cross(r, d));
  }
  void main() {
    vec3 d = normalize(aDir);
    vec3 t1 = tangentOf(d), t2 = cross(d, t1);
    float t = uTime;
    float h; vec2 off; float a;
    if (uMode < 0.5) {
      // fall straight toward the planet centre (radial gravity), swaying as it goes
      float ph = fract(aSeed.x + t * uSpeed * (0.6 + 0.6 * aSeed.y) / uRange);
      h = aGround + 0.04 + (1.0 - ph) * uRange;
      float sway = 0.25 + 0.35 * aSeed.y;
      off = vec2(sin(t * 0.9 + aSeed.z * 6.28), cos(t * 0.7 + aSeed.w * 6.28)) * sway * (0.3 + ph);
      a = smoothstep(0.0, 0.1, ph) * (1.0 - smoothstep(0.92, 1.0, ph));
    } else if (uMode < 1.5) {
      // firefly: hover low, wander, blink
      h = aGround + 0.25 + aSeed.y * 1.5 + sin(t * 0.8 + aSeed.x * 20.0) * 0.22;
      off = vec2(sin(t * 0.37 + aSeed.z * 30.0), cos(t * 0.29 + aSeed.w * 30.0)) * 0.6;
      float b = sin(t * (1.2 + aSeed.w * 2.0) + aSeed.x * 40.0);
      a = smoothstep(-0.3, 0.85, b);
    } else {
      // brook sparkle: CPU moves aDir along the stream, shader twinkles it
      h = aGround;
      off = vec2(0.0);
      a = 0.35 + 0.65 * smoothstep(-0.2, 1.0, sin(t * 5.0 + aSeed.x * 50.0));
    }
    vec3 p = d * (uR + h) + t1 * off.x + t2 * off.y;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uSize * (0.6 + 0.8 * aSeed.z) * uScale / -mv.z, 1.0, 64.0);
    vAlpha = a * smoothstep(1.2, 3.2, -mv.z);
    vMix = aSeed.w;
    vSpin = aSeed.x * 6.28 + t * (0.8 + aSeed.y * 2.0);
  }
`;

const DRIFT_FRAG = /* glsl */ `
  uniform vec3 uColA, uColB;
  uniform float uShape, uOpacity;
  varying float vAlpha, vMix, vSpin;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float a;
    if (uShape < 0.5) {
      a = smoothstep(0.5, 0.3, length(c));
    } else if (uShape < 1.5) {
      // petal: a spinning ellipse
      float cs = cos(vSpin), sn = sin(vSpin);
      vec2 q = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs);
      a = smoothstep(0.5, 0.38, length(q * vec2(1.0, 1.9)));
    } else if (uShape < 2.5) {
      // leaf: a spinning diamond
      float cs = cos(vSpin), sn = sin(vSpin);
      vec2 q = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs);
      a = smoothstep(0.5, 0.42, abs(q.x) * 1.6 + abs(q.y));
    } else {
      // glow: bright core and soft halo
      float r = length(c);
      a = pow(smoothstep(0.5, 0.0, r), 2.2) + 0.3 * smoothstep(0.5, 0.0, r);
    }
    a *= vAlpha * uOpacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(mix(uColA, uColB, vMix), a);
    #include <colorspace_fragment>
  }
`;

const AURORA_VERT = /* glsl */ `
  uniform float uTime, uR, uSpan, uAlt, uHeight, uPhase;
  uniform vec3 uC, uT, uB;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    float u = uv.x, v = uv.y;
    float t = uTime * 0.35 + uPhase;
    float a = (u - 0.5) * uSpan;
    // the ribbon's footprint snakes sideways over time: the "bending" curtain
    float bend = sin(u * 6.0 + t * 1.3) * 0.11 + sin(u * 13.0 - t * 1.9) * 0.04;
    vec3 base = normalize(uC * cos(a) + uT * sin(a) + uB * bend);
    float r = uR + uAlt + v * uHeight + sin(u * 9.0 + t * 2.0) * 0.3;
    vec3 p = base * r + uB * v * 0.7 * sin(u * 4.0 + t);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const AURORA_FRAG = /* glsl */ `
  uniform float uTime, uPhase, uIntensity;
  uniform vec3 uLow, uMid, uTop;
  varying vec2 vUv;
  void main() {
    float u = vUv.x, v = vUv.y;
    float t = uTime + uPhase * 10.0;
    float rays = 0.5 + 0.5 * sin(u * 110.0 + t * 0.8 + sin(u * 17.0 + t * 0.5) * 3.0);
    rays = 0.45 + 0.55 * rays * (0.6 + 0.4 * sin(u * 37.0 - t * 0.6));
    float edge = smoothstep(0.0, 0.14, u) * smoothstep(1.0, 0.86, u);
    float vert = smoothstep(0.0, 0.07, v) * pow(1.0 - v, 1.5);
    vec3 col = mix(uLow, uMid, smoothstep(0.05, 0.45, v));
    col = mix(col, uTop, smoothstep(0.45, 0.95, v));
    float pulse = 0.75 + 0.25 * sin(uTime * 0.7 + uPhase * 3.0);
    float a = edge * vert * rays * uIntensity * pulse;
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }
`;

const STAR_VERT = /* glsl */ `
  uniform float uTime, uPR;
  attribute float aSize, aPhase;
  attribute vec3 color;
  varying float vA;
  varying vec3 vCol;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPR;
    vA = 0.55 + 0.45 * sin(uTime * (0.6 + aPhase * 1.7) + aPhase * 40.0);
    vCol = color;
  }
`;
const STAR_FRAG = /* glsl */ `
  varying float vA;
  varying vec3 vCol;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, r);
    gl_FragColor = vec4(vCol, a * a * vA);
    #include <colorspace_fragment>
  }
`;

export function buildEffects(scene, surf) {
  const rng = mulberry32(99);
  const uTime = { value: 0 };
  const uScale = { value: 600 };
  const systems = [];

  function randomDirIn(season, bias, biasR) {
    const d = new V3();
    for (let tries = 0; tries < 400; tries++) {
      if (bias && rng() < 0.6) {
        const spot = bias[Math.floor(rng() * bias.length)];
        d.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(biasR / R * 2).add(spot).normalize();
      } else {
        const z = rng() * 2 - 1, a = rng() * Math.PI * 2, r = Math.sqrt(1 - z * z);
        d.set(Math.cos(a) * r, z, Math.sin(a) * r);
      }
      if (seasonAt(d) === season) return d;
    }
    return d;
  }

  function drift({ count, season, mode, shape, size, speed = 0.4, range = 4, colA, colB, additive = false, bias = null, biasR = 4, opacity = 1 }) {
    const dir = new Float32Array(count * 3), seed = new Float32Array(count * 4), ground = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const d = randomDirIn(season, bias, biasR);
      dir.set([d.x, d.y, d.z], i * 3);
      seed.set([rng(), rng(), rng(), rng()], i * 4);
      ground[i] = Math.max(WATER, surf(d));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    geo.setAttribute('aGround', new THREE.BufferAttribute(ground, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: DRIFT_VERT,
      fragmentShader: DRIFT_FRAG,
      uniforms: {
        uTime, uScale, uR: { value: R }, uSize: { value: size }, uMode: { value: mode }, uSpeed: { value: speed },
        uRange: { value: range }, uColA: { value: new THREE.Color(colA) }, uColB: { value: new THREE.Color(colB) },
        uShape: { value: shape }, uOpacity: { value: opacity },
      },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    systems.push(pts);
    return pts;
  }

  drift({ count: 460, season: 0, mode: 0, shape: 1, size: 0.1, speed: 0.32, range: 4.4, colA: '#F6A9C0', colB: '#FFE6EE', bias: [SPOTS.grove, dirLL(6, 44)], biasR: 5 });
  drift({ count: 280, season: 1, mode: 1, shape: 3, size: 0.42, colA: '#F3FF9A', colB: '#FFD36B', additive: true, bias: [SPOTS.camp, SPOTS.woods, SPOTS.lake], biasR: 4.5 });
  drift({ count: 320, season: 2, mode: 0, shape: 2, size: 0.14, speed: 0.42, range: 4.4, colA: '#E0592E', colB: '#F2B33D', bias: [SPOTS.maple, SPOTS.cabin], biasR: 5 });
  drift({ count: 900, season: 3, mode: 0, shape: 0, size: 0.1, speed: 0.62, range: 7.5, colA: '#FFFFFF', colB: '#E8EEF6', opacity: 0.95 });

  // brook sparkles: CPU walks each one downstream
  const SPARK = 70;
  const spark = drift({ count: SPARK, season: 0, mode: 2, shape: 3, size: 0.16, colA: '#FFFFFF', colB: '#E8EEF6', additive: true, opacity: 0.9 });
  const sparkState = Array.from({ length: SPARK }, () => ({ s: rng(), off: (rng() - 0.5) * 0.5, v: 0.012 + rng() * 0.01 }));
  const sparkDir = spark.geometry.attributes.aDir;
  spark.geometry.attributes.aGround.array.fill(WATER + 0.05);
  const _p = new V3(), _q = new V3(), _side = new V3();

  // aurora ribbons above winter
  const auroraGeo = new THREE.PlaneGeometry(1, 1, 160, 18);
  const ribbons = [
    { c: dirLL(14, 316), alt: 5.4, h: 3.2, span: 1.35, phase: 0 },
    { c: dirLL(30, 300), alt: 6.4, h: 2.8, span: 1.05, phase: 2.1 },
    { c: dirLL(0, 334), alt: 5.0, h: 2.4, span: 0.95, phase: 4.3 },
  ];
  for (const rb of ribbons) {
    const east = tangentToward(rb.c, dirLL(toLL(rb.c).lat, toLL(rb.c).lon + 10));
    const north = new V3().crossVectors(east, rb.c).normalize();
    const mat = new THREE.ShaderMaterial({
      vertexShader: AURORA_VERT,
      fragmentShader: AURORA_FRAG,
      uniforms: {
        uTime, uR: { value: R }, uSpan: { value: rb.span }, uAlt: { value: rb.alt }, uHeight: { value: rb.h },
        uPhase: { value: rb.phase }, uC: { value: rb.c }, uT: { value: east }, uB: { value: north },
        uIntensity: { value: 0.95 },
        uLow: { value: new THREE.Color('#7DF2BE') }, uMid: { value: new THREE.Color('#58D8C2') }, uTop: { value: new THREE.Color('#B994FF') },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(auroraGeo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    scene.add(mesh);
  }

  // starfield
  {
    const N = 1800;
    const pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N), col = new Float32Array(N * 3);
    const tints = ['#FFFFFF', '#E8EEF6', '#CCDBEB', '#FFF1D6'].map((h) => new THREE.Color(h));
    for (let i = 0; i < N; i++) {
      const z = rng() * 2 - 1, a = rng() * Math.PI * 2, r = Math.sqrt(1 - z * z), d = 180 + rng() * 120;
      pos.set([Math.cos(a) * r * d, z * d, Math.sin(a) * r * d], i * 3);
      size[i] = 1.2 + Math.pow(rng(), 3) * 3.4;
      phase[i] = rng();
      const c = tints[Math.floor(rng() * tints.length)];
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
      uniforms: { uTime, uPR: { value: Math.min(devicePixelRatio, 2) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const stars = new THREE.Points(geo, mat);
    stars.frustumCulled = false;
    scene.add(stars);
  }

  // a little moon on a tilted orbit, plus two pebble asteroids
  const orbit = new THREE.Group();
  orbit.rotation.set(0.45, 0, 0.25);
  scene.add(orbit);
  const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 1), new THREE.MeshLambertMaterial({ color: '#E8EEF6', flatShading: true }));
  orbit.add(moon);
  const rocks = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35 + i * 0.12, 0), new THREE.MeshLambertMaterial({ color: '#9FBDDA', flatShading: true }));
    rocks.push({ m, a: i * 2.1, r: 17 + i * 2.5, s: 0.05 + i * 0.02, y: (i - 1) * 3 });
    orbit.add(m);
  }

  function update(t, dt = 1 / 60) {
    uTime.value = t;
    // brook sparkles
    for (let i = 0; i < SPARK; i++) {
      const s = sparkState[i];
      s.s += s.v * dt;
      if (s.s > 1) s.s -= 1;
      riverPoint(s.s, _p);
      riverPoint(Math.min(1, s.s + 0.01), _q);
      _side.crossVectors(_p, _q.sub(_p)).normalize();
      _p.addScaledVector(_side, (s.off + Math.sin(t * 0.8 + i) * 0.08) / R).normalize();
      sparkDir.setXYZ(i, _p.x, _p.y, _p.z);
    }
    sparkDir.needsUpdate = true;
    const a = t * 0.035;
    moon.position.set(Math.cos(a) * 24, 0, Math.sin(a) * 24);
    moon.rotation.y = t * 0.1;
    for (const r of rocks) {
      const b = r.a + t * r.s;
      r.m.position.set(Math.cos(b) * r.r, r.y, Math.sin(b) * r.r);
      r.m.rotation.set(t * 0.3, t * 0.2, 0);
    }
  }

  function resize(h, fov, pr) {
    uScale.value = (h * pr) / (2 * Math.tan((fov * Math.PI) / 360));
  }

  return { update, resize, uTime };
}
