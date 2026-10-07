import * as THREE from 'three';

// Water column behind the creatures: a depth gradient with sun shafts near
// the surface, and drifting "marine snow" that rises past the camera as the
// visitor scrolls deeper.

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
      void main() {
        float d = uDepth;
        vec3 top = mix(vec3(0.035, 0.16, 0.26), vec3(0.008, 0.02, 0.05), smoothstep(0.0, 0.5, d));
        vec3 bot = mix(vec3(0.006, 0.04, 0.08), vec3(0.0, 0.004, 0.012), smoothstep(0.0, 0.7, d));
        top = mix(top, vec3(0.02, 0.05, 0.1), smoothstep(0.85, 1.0, d));
        vec3 col = mix(bot, top, pow(vUv.y, 1.35));

        vec2 p = vec2((vUv.x - 0.5) * uAspect, vUv.y);
        vec2 src = vec2(-0.35 * uAspect, 1.35);
        float ang = atan(p.x - src.x, src.y - p.y);
        float rays = pow(0.5 + 0.5 * sin(ang * 21.0 + uTime * 0.12 + sin(ang * 7.0 + uTime * 0.09) * 1.4), 7.0);
        rays += 0.6 * pow(0.5 + 0.5 * sin(ang * 34.0 - uTime * 0.1), 9.0);
        float surface = 1.0 - smoothstep(0.0, 0.38, d);
        float lit = surface + 0.35 * smoothstep(0.86, 1.0, d);
        col += vec3(0.16, 0.48, 0.6) * rays * pow(vUv.y, 2.2) * 0.13 * lit;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

export function createSnow(count) {
  const pos = new Float32Array(count * 3);
  const data = new Float32Array(count * 4);
  const col = new Float32Array(count * 3);
  const tints = [[0.6, 0.95, 1.0], [0.75, 0.8, 1.0], [1.0, 0.75, 0.95], [0.7, 1.0, 0.85]];
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * 22;
    pos[i * 3 + 1] = (Math.random() * 2 - 1) * 15;
    pos[i * 3 + 2] = -22 + Math.random() * 30;
    data[i * 4] = Math.random();
    data[i * 4 + 1] = 0.5 + Math.random() * Math.random() * 2.2;
    data[i * 4 + 2] = Math.random();
    data[i * 4 + 3] = 0.3 + Math.random() * 0.7;
    const t = tints[Math.floor(Math.random() * tints.length)];
    col.set(t, i * 3);
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
        p.y = mod(p.y + uTime * aData.w * 0.22 + uScroll * 4.0 + 15.0, 30.0) - 15.0;
        p.x += sin(uTime * 0.13 + aData.x * 20.0) * 0.6;
        p.z += cos(uTime * 0.11 + aData.z * 20.0) * 0.4;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float ps = aData.y * uSizeK * 0.55 * (16.0 / -mv.z);
        gl_PointSize = max(ps, 1.0);
        float edge = smoothstep(15.0, 11.0, abs(p.y));
        float far = smoothstep(-42.0, -12.0, mv.z);
        float near = 1.0 - smoothstep(-4.0, -1.0, mv.z);
        vA = edge * far * near * clamp(ps, 0.0, 1.0) * (0.25 + 0.2 * sin(uTime * (0.5 + aData.z) + aData.x * 30.0));
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
