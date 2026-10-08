import * as THREE from 'three';

// Deep-space backdrop behind the bodies: a near-black gradient, faint nebula
// clouds, and a warm glow where the Sun's light comes from (it fades as the
// journey moves outward). A twinkling starfield drifts past as you scroll.
// Both follow the multi / mono palette switch.

export function createBackdrop() {
  const uniforms = {
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uMono: { value: 0 },
    uDepth: { value: 0 },
    uGlowPos: { value: new THREE.Vector2(-0.1, 0.6) },
    uGlowAmt: { value: 0.5 },
    uGlowSize: { value: 0.6 },
    uNebula: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uAspect;
      uniform float uMono;
      uniform float uDepth;
      uniform vec2 uGlowPos;
      uniform float uGlowAmt;
      uniform float uGlowSize;
      uniform float uNebula;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
        return s;
      }
      void main() {
        vec2 p = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5);
        vec3 col = mix(vec3(0.004, 0.006, 0.016), vec3(0.008, 0.016, 0.036), vUv.y);

        // Nebula: two layers of slow noise, tinted per palette.
        vec2 q = p * 1.6 + vec2(uDepth * 1.4, uDepth * 0.4);
        float n1 = fbm(q + vec2(uTime * 0.004, 0.0));
        float n2 = fbm(q * 1.7 - vec2(0.0, uTime * 0.003) + n1 * 0.8);
        float neb = smoothstep(0.42, 0.85, n1 * 0.6 + n2 * 0.55) * uNebula;
        vec3 multi = mix(vec3(0.05, 0.16, 0.24), vec3(0.24, 0.07, 0.3), smoothstep(0.3, 0.75, n2));
        multi = mix(multi, vec3(0.32, 0.1, 0.16), smoothstep(0.62, 0.9, n1) * 0.6);
        vec3 mono = mix(vec3(0.15, 0.23, 0.33), vec3(0.22, 0.31, 0.43), n2);
        col += mix(multi, mono, uMono) * neb * 0.16;

        // Sunlight: the Sun is orange in both palettes.
        vec2 gp = vec2((uGlowPos.x - 0.5) * uAspect, uGlowPos.y - 0.5);
        float gd = length(p - gp);
        float glow = exp(-gd * gd / (uGlowSize * uGlowSize)) * uGlowAmt;
        col += vec3(1.0, 0.5, 0.16) * glow * 0.22 + vec3(1.0, 0.75, 0.4) * pow(glow, 3.0) * 0.12;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

// Star colours by spectral class (O/B blue-white … K/M orange-red) for multi,
// and Loyel blues for mono.
const MULTI = [[0.7, 0.8, 1.0], [0.85, 0.9, 1.0], [1.0, 1.0, 1.0], [1.0, 0.95, 0.82], [1.0, 0.82, 0.6], [1.0, 0.66, 0.5]];
const MONO = [[0.8, 0.86, 0.92], [0.62, 0.74, 0.85], [0.91, 0.93, 0.96], [0.42, 0.6, 0.77]];

export function createStars(count) {
  const pos = new Float32Array(count * 3);
  const data = new Float32Array(count * 4);
  const col = new Float32Array(count * 3);
  const mono = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * 34;
    pos[i * 3 + 1] = (Math.random() * 2 - 1) * 20;
    pos[i * 3 + 2] = -40 + Math.random() * 34;
    data[i * 4] = Math.random();
    data[i * 4 + 1] = 0.45 + Math.pow(Math.random(), 4) * 2.6;
    data[i * 4 + 2] = Math.random();
    data[i * 4 + 3] = 0.3 + Math.random() * 0.7;
    col.set(MULTI[Math.floor(Math.pow(Math.random(), 0.8) * MULTI.length)], i * 3);
    mono.set(MONO[Math.floor(Math.random() * MONO.length)], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aData', new THREE.BufferAttribute(data, 4));
  geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aMono', new THREE.BufferAttribute(mono, 3));
  const uniforms = { uTime: { value: 0 }, uScroll: { value: 0 }, uSizeK: { value: 2.6 }, uMono: { value: 0 }, uGlow: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uScroll;
      uniform float uSizeK;
      uniform float uMono;
      uniform float uGlow;
      attribute vec4 aData;
      attribute vec3 aCol;
      attribute vec3 aMono;
      varying vec3 vCol;
      varying float vA;
      void main() {
        vec3 p = position;
        // Lateral drift with scroll: nearer stars move more (parallax).
        float par = 0.4 + 0.6 * smoothstep(-40.0, -6.0, p.z);
        p.x = mod(p.x - uScroll * 2.2 * par + 34.0, 68.0) - 34.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float g = smoothstep(0.0, 0.45, uGlow);
        float ps = aData.y * uSizeK * 0.5 * (16.0 / -mv.z) * mix(0.7, 1.0, g);
        gl_PointSize = max(ps, 1.0);
        float tw = 0.55 + 0.45 * pow(0.5 + 0.5 * sin(uTime * (0.4 + aData.z * 1.6) + aData.x * 60.0), 3.0);
        float edge = smoothstep(34.0, 28.0, abs(p.x));
        vA = edge * clamp(ps, 0.0, 1.0) * tw * (0.35 + aData.w * 0.4);
        vCol = mix(aCol, aMono, uMono);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uGlow;
      varying vec3 vCol;
      varying float vA;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float d2 = dot(c, c);
        if (d2 > 1.0) discard;
        float g = smoothstep(0.0, 0.45, uGlow);
        float a = mix(1.0 - smoothstep(0.5, 1.0, d2), exp(-d2 * 4.0) + exp(-d2 * 1.5) * 0.2, g) * vA;
        gl_FragColor = vec4(vCol * a, 1.0);
      }
    `,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = -5;
  return { points, uniforms };
}
