// Terrain and water meshes. The terrain is a subdivided icosahedron whose
// vertices are pushed out by the height function; each triangle gets one flat
// colour from the four season palettes, blended by the quadrant weights.

import * as THREE from 'three';
import { R, WATER, height, seasonWeights, smoothstep } from './world.js';
import { fbm, mulberry32 } from './noise.js';

const C = (h) => new THREE.Color(h);
const PAL = {
  springA: C('#B3DE8E'), springB: C('#97CF77'), petal: C('#F7C4D3'),
  sumA: C('#5DAB4D'), sumB: C('#4A9641'), sumC: C('#74BE5C'),
  autA: C('#E4B04E'), autB: C('#D78B3A'), autC: C('#C46936'),
  snowA: C('#F4F7FB'), snowB: C('#E8EEF6'), rock: C('#A59D94'),
  cliff: C('#B89F80'), sand: C('#EAD8A8'), bed: C('#B79F78'), iceBed: C('#CCDBEB'),
};

const _w = [0, 0, 0, 0];
const cs = new THREE.Color(), cu = new THREE.Color(), ca = new THREE.Color(), cw = new THREE.Color();

function groundColor(c, h, slope, r, out) {
  const w = seasonWeights(c, _w);
  const n1 = fbm(c.x * 5, c.y * 5, c.z * 5, 2);
  const n2 = fbm(c.x * 7 + 3, c.y * 7 - 1, c.z * 7 + 2, 2);

  cs.copy(PAL.springA).lerp(PAL.springB, smoothstep(-0.2, 0.3, n1));
  cs.lerp(PAL.petal, smoothstep(0.1, 0.32, n2) * 0.75);
  cu.copy(PAL.sumA).lerp(PAL.sumB, smoothstep(-0.25, 0.25, n1)).lerp(PAL.sumC, smoothstep(0.15, 0.4, n2) * 0.6);
  ca.copy(PAL.autA).lerp(PAL.autB, smoothstep(-0.25, 0.2, n1)).lerp(PAL.autC, smoothstep(0.1, 0.4, n2) * 0.7);
  cw.copy(PAL.snowA).lerp(PAL.snowB, smoothstep(-0.1, 0.3, n1));
  if (h > 0.9) cw.lerp(PAL.rock, smoothstep(0.8, 0.62, slope));

  out.setRGB(0, 0, 0)
    .add(cs.multiplyScalar(w[0])).add(cu.multiplyScalar(w[1]))
    .add(ca.multiplyScalar(w[2])).add(cw.multiplyScalar(w[3]));

  const winter = smoothstep(0.4, 0.6, w[3]);
  out.lerp(PAL.cliff, (1 - winter) * smoothstep(0.76, 0.6, slope) * 0.7);
  out.lerp(PAL.sand, smoothstep(0.24, 0.1, h) * (1 - winter));
  out.lerp(PAL.bed, smoothstep(-0.05, -0.3, h) * (1 - winter));
  out.lerp(PAL.iceBed, smoothstep(0.1, -0.2, h) * winter);
  return out.multiplyScalar(0.94 + r * 0.1);
}

export function buildTerrain() {
  const geo = new THREE.IcosahedronGeometry(1, 30);
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  const pos = geo.attributes.position;
  const n = pos.count;
  const hs = new Float32Array(n);
  const cache = new Map();
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const key = `${Math.round(v.x * 1e5)},${Math.round(v.y * 1e5)},${Math.round(v.z * 1e5)}`;
    let h = cache.get(key);
    if (h === undefined) { h = height(v); cache.set(key, h); }
    hs[i] = h;
    pos.setXYZ(i, v.x * (R + h), v.y * (R + h), v.z * (R + h));
  }

  const col = new Float32Array(n * 3);
  const rng = mulberry32(7);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const cen = new THREE.Vector3(), nrm = new THREE.Vector3(), tmp = new THREE.Vector3();
  const out = new THREE.Color();
  for (let f = 0; f < n; f += 3) {
    a.fromBufferAttribute(pos, f); b.fromBufferAttribute(pos, f + 1); c.fromBufferAttribute(pos, f + 2);
    cen.copy(a).add(b).add(c).normalize();
    nrm.subVectors(c, b).cross(tmp.subVectors(a, b)).normalize();
    const slope = Math.abs(nrm.dot(cen));
    groundColor(cen, (hs[f] + hs[f + 1] + hs[f + 2]) / 3, slope, rng(), out);
    for (let k = 0; k < 3; k++) col.set([out.r, out.g, out.b], (f + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// One water sphere at sea level shows wherever the terrain dips below it: the
// brook and ponds in spring, the lake in summer, the ice lake in winter (frozen
// faces get the ice colour and stop rippling).
export function buildWater(uTime) {
  const geo = new THREE.IcosahedronGeometry(R + WATER, 20);
  geo.deleteAttribute('uv');
  const pos = geo.attributes.position;
  const n = pos.count;
  const col = new Float32Array(n * 3), ice = new Float32Array(n);
  const w = [0, 0, 0, 0];
  const v = new THREE.Vector3(), cen = new THREE.Vector3();
  const water = C('#6C9AC4'), brook = C('#9FBDDA'), iceC = C('#E8EEF6'), out = new THREE.Color();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    ice[i] = smoothstep(0.42, 0.58, seasonWeights(v, w)[3]);
  }
  for (let f = 0; f < n; f += 3) {
    cen.set(0, 0, 0);
    for (let k = 0; k < 3; k++) cen.add(v.fromBufferAttribute(pos, f + k));
    cen.normalize();
    seasonWeights(cen, w);
    out.copy(water).lerp(brook, w[0] * 0.75).lerp(iceC, smoothstep(0.42, 0.58, w[3]));
    for (let k = 0; k < 3; k++) col.set([out.r, out.g, out.b], (f + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aIce', new THREE.BufferAttribute(ice, 1));

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.86 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'attribute float aIce;\nuniform float uTime;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float wv = sin(dot(position, vec3(0.9, 1.3, 1.1)) * 1.6 + uTime * 1.4) * 0.5
               + sin(dot(position, vec3(-1.7, 0.6, 1.9)) * 1.3 - uTime * 1.1) * 0.5;
      transformed += normalize(position) * wv * 0.045 * (1.0 - aIce);`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  return mesh;
}
