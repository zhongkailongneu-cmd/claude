import * as THREE from 'three';

// Behind the particles: a deep navy field with slow, faint clouds of
// fluorescence (like out-of-focus tissue), and "neural dust" that streams
// toward the camera as you scroll, so climbing the hierarchy feels like
// pulling back through space.

export function createBackdrop() {
  const uniforms = { uDepth: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uDepth;
      uniform float uTime;
      uniform float uAspect;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
        return s;
      }
      void main() {
        vec2 p = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5);
        // Loyel 100 → near-black navy
        vec3 top = vec3(0.035, 0.06, 0.105);
        vec3 bot = vec3(0.006, 0.012, 0.026);
        vec3 col = mix(bot, top, smoothstep(-0.6, 0.7, p.y));
        float t = uTime * 0.02;
        vec2 q = p * 1.6 + vec2(uDepth * 1.3, -uDepth * 0.6);
        float n = fbm(q + vec2(fbm(q * 1.3 + t), fbm(q * 1.1 - t)) * 1.4);
        float cloud = smoothstep(0.45, 0.95, n);
        // Loyel 60 / 50 tints for the clouds
        col += mix(vec3(0.286, 0.49, 0.682), vec3(0.424, 0.604, 0.769), n) * cloud * 0.07;
        col += vec3(0.16, 0.25, 0.38) * exp(-dot(p, p) * 2.2) * 0.14;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

export function createDust(count) {
  const pos = new Float32Array(count * 3);
  const data = new Float32Array(count * 4);
  const col = new Float32Array(count * 3);
  const tints = [
    [0.8, 0.86, 0.92], [0.62, 0.74, 0.85], [0.62, 0.74, 0.85], [0.42, 0.6, 0.77], [0.68, 0.74, 0.9],
    [0.89, 0.76, 0.49], [0.56, 0.83, 0.84], [0.73, 0.65, 0.94],
  ];
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * 24;
    pos[i * 3 + 1] = (Math.random() * 2 - 1) * 15;
    pos[i * 3 + 2] = Math.random() * 40;
    data[i * 4] = Math.random();
    data[i * 4 + 1] = 0.5 + Math.random() * Math.random() * 2.2;
    data[i * 4 + 2] = Math.random();
    data[i * 4 + 3] = 0.3 + Math.random() * 0.7;
    col.set(tints[Math.random() < 0.85 ? Math.floor(Math.random() * 5) : 5 + Math.floor(Math.random() * 3)], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aData', new THREE.BufferAttribute(data, 4));
  geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  const uniforms = { uTime: { value: 0 }, uScroll: { value: 0 }, uSizeK: { value: 2.6 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uScroll;
      uniform float uSizeK;
      attribute vec4 aData;
      attribute vec3 aCol;
      varying vec3 vCol;
      varying float vA;
      void main() {
        vec3 p = position;
        p.z = mod(p.z + uTime * 0.25 * aData.w + uScroll * 7.0, 40.0) - 26.0;
        p.x += sin(uTime * 0.13 + aData.x * 20.0) * 0.6;
        p.y += cos(uTime * 0.11 + aData.z * 20.0) * 0.4;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float ps = aData.y * uSizeK * 0.55 * (16.0 / -mv.z);
        gl_PointSize = max(ps, 1.0);
        float far = smoothstep(-44.0, -14.0, mv.z);
        float near = 1.0 - smoothstep(-5.0, -1.5, mv.z);
        vA = far * near * clamp(ps, 0.0, 1.0) * (0.25 + 0.2 * sin(uTime * (0.5 + aData.z) + aData.x * 30.0));
        vCol = aCol;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vCol;
      varying float vA;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float d2 = dot(c, c);
        if (d2 > 1.0) discard;
        float a = (exp(-d2 * 4.0) + exp(-d2 * 1.5) * 0.2) * vA;
        gl_FragColor = vec4(vCol * a, 1.0);
      }
    `,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, uniforms };
}
