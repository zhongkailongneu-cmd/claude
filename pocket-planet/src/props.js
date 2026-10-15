// Everything that stands on the planet: scattered trees, flowers and rocks
// (instanced), and the hand-built landmarks of each season. Each prop is a
// handful of low-poly primitives merged into one geometry with flat vertex
// colours, placed in a local frame whose +Y is the surface normal.

import * as THREE from 'three';
import { mulberry32, fbm } from './noise.js';
import {
  R, WATER, BRIDGE, SPOTS, SEASONS, SPAWNS, LANDMARKS, PEAK_TOP, seasonWeights, riverDist, riverLon,
  dirLL, toLL, tangentToward, offsetDir, bridgeDeckY, smoothstep,
} from './world.js';

const V3 = THREE.Vector3;
const Y = new V3(0, 1, 0), X = new V3(1, 0, 0);
let rng = mulberry32(2024);

// ---------------------------------------------------------------- geometry kit
function part(geo, color, { p = [0, 0, 0], r = [0, 0, 0], s = 1, jitter = 0.07 } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const m = new THREE.Matrix4().compose(
    new V3(...p),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),
    Array.isArray(s) ? new V3(...s) : new V3(s, s, s),
  );
  g.applyMatrix4(m);
  const base = new THREE.Color(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let f = 0; f < n; f += 3) {
    const k = 1 + (rng() * 2 - 1) * jitter;
    for (let j = 0; j < 3 && f + j < n; j++) col.set([base.r * k, base.g * k, base.b * k], (f + j) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'color') g.deleteAttribute(name);
  return g;
}

function merge(parts) {
  let total = 0;
  for (const p of parts) total += p.attributes.position.count;
  const pos = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o * 3);
    col.set(p.attributes.color.array, o * 3);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function prism(w, h, d) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g;
}

const Cyl = (rt, rb, h, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg);
const Cone = (r, h, seg = 7) => new THREE.ConeGeometry(r, h, seg);
const Ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
const Dodec = (r) => new THREE.DodecahedronGeometry(r, 0);
const Box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const pick = (a) => a[Math.floor(rng() * a.length)];

// Frame on the sphere: +Y = surface normal at d, +Z = forward tangent.
const _x = new V3(), _z = new V3(), _u = new V3();
export function frameMatrix(d, forward, h, s = 1, out = new THREE.Matrix4()) {
  _u.copy(d);
  _x.crossVectors(_u, forward).normalize();
  _z.crossVectors(_x, _u);
  out.makeBasis(_x.multiplyScalar(s), _u.clone().multiplyScalar(s), _z.multiplyScalar(s));
  out.setPosition(d.x * (R + h), d.y * (R + h), d.z * (R + h));
  return out;
}
export function yawTangent(d, yaw, out = new V3()) {
  const ref = Math.abs(d.y) < 0.95 ? Y : X;
  out.copy(ref).addScaledVector(d, -ref.dot(d)).normalize();
  return out.applyAxisAngle(d, yaw);
}

// ---------------------------------------------------------------- prop designs
function trunk(h = 0.8, r = 0.08, color = '#7E5444') {
  return part(Cyl(r * 0.7, r, h, 5), color, { p: [0, h / 2 - 0.12, 0] });
}

function sakura() {
  const parts = [trunk(0.95, 0.1, '#7A5142'),
    part(Cyl(0.035, 0.05, 0.5, 4), '#7A5142', { p: [0.16, 0.72, 0], r: [0, 0, -0.75] })];
  const pinks = ['#F4B4C7', '#F09CB5', '#F8CBDA', '#FAD9E3'];
  const blobs = 3 + Math.floor(rng() * 2);
  for (let k = 0; k < blobs; k++) {
    parts.push(part(Ico(0.36 + rng() * 0.14), pick(pinks), {
      p: [(rng() - 0.5) * 0.6, 0.98 + rng() * 0.32, (rng() - 0.5) * 0.6], r: [rng() * 3, rng() * 3, 0], s: [1, 0.85, 1],
    }));
  }
  return merge(parts);
}

function pine(greens, snow) {
  const parts = [trunk(0.5, 0.09, '#76503A')];
  const tiers = [[0.56, 0.72, 0.32], [0.43, 0.62, 0.7], [0.3, 0.52, 1.03]];
  for (const [r, h, y] of tiers) {
    parts.push(part(Cone(r, h), pick(greens), { p: [0, y + h / 2, 0], r: [0, rng() * 3, 0] }));
    if (snow) parts.push(part(Cone(r * 0.62, h * 0.42), '#F4F7FB', { p: [0, y + h * 0.79, 0], r: [0, rng() * 3, 0], jitter: 0.02 }));
  }
  return merge(parts);
}

function maple(colors) {
  const parts = [trunk(0.85, 0.1, '#6E4A36')];
  parts.push(part(Dodec(0.5), colors[0], { p: [0, 1.08, 0], s: [1, 0.85, 1], r: [rng(), rng(), 0] }));
  parts.push(part(Dodec(0.32), colors[1], { p: [0.34, 0.92, 0.1], r: [rng(), rng(), 0] }));
  parts.push(part(Dodec(0.3), colors[1], { p: [-0.3, 0.98, -0.12], r: [rng(), rng(), 0] }));
  return merge(parts);
}

function bush(color) {
  return merge([
    part(Ico(0.28), color, { p: [0, 0.14, 0], s: [1, 0.8, 1] }),
    part(Ico(0.2), color, { p: [0.22, 0.1, 0.05], s: [1, 0.8, 1] }),
    part(Ico(0.18), color, { p: [-0.18, 0.09, -0.08], s: [1, 0.8, 1] }),
  ]);
}

function rock(snow) {
  const parts = [part(Dodec(0.28), '#A8A29A', { p: [0, 0.04, 0], s: [1, 0.62, 0.9], r: [rng(), rng(), rng()] })];
  if (snow) parts.push(part(Dodec(0.24), '#F4F7FB', { p: [0, 0.16, 0], s: [1, 0.32, 0.86], jitter: 0.02 }));
  return merge(parts);
}

function flower(color) {
  return merge([
    part(Cyl(0.012, 0.014, 0.24, 3), '#5E9E4A', { p: [0, 0.1, 0] }),
    part(Ico(0.06), color, { p: [0, 0.23, 0], jitter: 0.03 }),
    part(Ico(0.025), '#F6D35B', { p: [0, 0.27, 0], jitter: 0.02 }),
  ]);
}

function grass(color) {
  return merge([0, 1, 2].map((k) =>
    part(Cone(0.035, 0.28, 3), color, { p: [Math.cos(k * 2.1) * 0.05, 0.1, Math.sin(k * 2.1) * 0.05], r: [Math.cos(k * 2.1) * 0.3, 0, Math.sin(k * 2.1) * 0.3] })));
}

function mushroom() {
  return merge([
    part(Cyl(0.03, 0.04, 0.14, 5), '#F3E6CF', { p: [0, 0.05, 0] }),
    part(Cone(0.11, 0.09, 6), '#D44B3D', { p: [0, 0.15, 0] }),
  ]);
}

function pumpkin() {
  return merge([
    part(Ico(0.17, 1), '#E98A35', { p: [0, 0.1, 0], s: [1, 0.72, 1] }),
    part(Cyl(0.015, 0.022, 0.08, 4), '#5E7A35', { p: [0, 0.24, 0] }),
  ]);
}

function hay() {
  return merge([
    part(Cyl(0.28, 0.28, 0.55, 9), '#E2BC5C', { p: [0, 0.26, 0], r: [0, 0, Math.PI / 2] }),
    part(Cyl(0.285, 0.285, 0.05, 9), '#C99B3F', { p: [0, 0.26, 0], r: [0, 0, Math.PI / 2] }),
  ]);
}

const fencePost = () => part(Cyl(0.035, 0.04, 0.42, 5), '#9C6A43', { p: [0, 0.17, 0] });
const fenceRail = () => part(Box(0.035, 0.035, 1), '#B07A4F', {});

function bridge() {
  const { L, W } = BRIDGE;
  const parts = [];
  const N = 11;
  const seg = (z0, z1, x, w, t, color, yOff = 0) => {
    const y0 = bridgeDeckY(z0) + yOff, y1 = bridgeDeckY(z1) + yOff;
    const len = Math.hypot(z1 - z0, y1 - y0);
    parts.push(part(Box(w, t, len * 1.04), color, { p: [x, (y0 + y1) / 2, (z0 + z1) / 2], r: [-Math.atan2(y1 - y0, z1 - z0), 0, 0] }));
  };
  for (let i = 0; i < N; i++) {
    const z0 = -L / 2 + (i * L) / N, z1 = z0 + L / N;
    seg(z0, z1, 0, W, 0.07, i % 2 ? '#B07A4F' : '#A06D45');
    seg(z0, z1, W / 2, 0.07, 0.14, '#C9503C', -0.05);
    seg(z0, z1, -W / 2, 0.07, 0.14, '#C9503C', -0.05);
  }
  const posts = 6;
  for (let k = 0; k <= posts; k++) {
    const z = -L / 2 + (k * L) / posts;
    for (const x of [-W / 2 + 0.03, W / 2 - 0.03]) {
      parts.push(part(Cyl(0.035, 0.04, 0.44, 5), '#D9573F', { p: [x, bridgeDeckY(z) + 0.22, z] }));
      if (k === 0 || k === posts) parts.push(part(Cone(0.06, 0.12, 6), '#E7B347', { p: [x, bridgeDeckY(z) + 0.5, z] }));
    }
    if (k < posts) {
      const z1 = z + L / posts;
      for (const x of [-W / 2 + 0.03, W / 2 - 0.03]) {
        const y0 = bridgeDeckY(z) + 0.4, y1 = bridgeDeckY(z1) + 0.4;
        const len = Math.hypot(z1 - z, y1 - y0);
        parts.push(part(Box(0.05, 0.05, len * 1.02), '#D9573F', { p: [x, (y0 + y1) / 2, (z + z1) / 2], r: [-Math.atan2(y1 - y0, z1 - z), 0, 0] }));
      }
    }
  }
  for (const z of [-L / 4, L / 4]) for (const x of [-W / 2 + 0.05, W / 2 - 0.05])
    parts.push(part(Cyl(0.06, 0.06, 1.0, 6), '#8A5A3B', { p: [x, bridgeDeckY(z) - 0.5, z] }));
  return merge(parts);
}

function stoneLantern() {
  return {
    solid: merge([
      part(Box(0.3, 0.08, 0.3), '#A7A39C', { p: [0, 0.04, 0] }),
      part(Cyl(0.06, 0.07, 0.36, 6), '#A7A39C', { p: [0, 0.26, 0] }),
      part(Box(0.26, 0.05, 0.26), '#9B978F', { p: [0, 0.46, 0] }),
      part(Cone(0.24, 0.16, 4), '#8F8B84', { p: [0, 0.71, 0], r: [0, Math.PI / 4, 0] }),
      part(Ico(0.04), '#8F8B84', { p: [0, 0.81, 0] }),
    ]),
    glow: part(Box(0.16, 0.14, 0.16), '#FFD98A', { p: [0, 0.56, 0], jitter: 0 }),
  };
}

function tent(color, dark) {
  return merge([
    part(prism(1.15, 0.86, 1.3), color, {}),
    part(prism(0.46, 0.52, 0.02), dark, { p: [0, 0, 0.66], jitter: 0 }),
    part(Cyl(0.02, 0.02, 0.98, 4), '#7A5038', { p: [0, 0.45, 0.68] }),
    part(Box(1.4, 0.02, 1.6), '#C9B48A', { p: [0, 0.0, 0.05] }),
  ]);
}

function campfire() {
  const parts = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    parts.push(part(Dodec(0.09), '#9A958E', { p: [Math.cos(a) * 0.3, 0.04, Math.sin(a) * 0.3], r: [rng(), rng(), 0] }));
  }
  for (let k = 0; k < 3; k++)
    parts.push(part(Cyl(0.045, 0.05, 0.48, 5), '#6E4630', { p: [0, 0.07, 0], r: [Math.PI / 2 - 0.25, (k / 3) * Math.PI, 0] }));
  for (const [x, z, ry] of [[0, 1.05, 0], [-1.0, -0.2, 1.3]])
    parts.push(part(Cyl(0.12, 0.12, 0.8, 7), '#8A5A3B', { p: [x, 0.12, z], r: [0, ry, Math.PI / 2] }));
  return merge(parts);
}

function cabin() {
  return {
    solid: merge([
      part(Box(1.85, 0.16, 1.55), '#9E958A', { p: [0, 0.04, 0] }),
      part(Box(1.7, 1.1, 1.4), '#C98B5A', { p: [0, 0.65, 0] }),
      part(prism(1.7, 0.72, 1.4), '#C08254', { p: [0, 1.2, 0] }),
      part(prism(2.1, 0.86, 1.75), '#A8483A', { p: [0, 1.17, 0] }),
      part(Box(0.26, 0.75, 0.26), '#8D827A', { p: [0.5, 1.62, -0.32] }),
      part(Box(0.4, 0.78, 0.05), '#6B4530', { p: [0, 0.51, 0.71] }),
      part(Box(0.6, 0.06, 0.32), '#8A6040', { p: [0, 0.14, 0.86] }),
      part(Box(0.38, 0.05, 0.06), '#7A5038', { p: [-0.52, 0.48, 0.72] }),
      part(Box(0.38, 0.05, 0.06), '#7A5038', { p: [0.52, 0.48, 0.72] }),
    ]),
    glow: merge([
      part(Box(0.32, 0.28, 0.04), '#FFD98A', { p: [-0.52, 0.66, 0.71], jitter: 0 }),
      part(Box(0.32, 0.28, 0.04), '#FFD98A', { p: [0.52, 0.66, 0.71], jitter: 0 }),
      part(Box(0.04, 0.28, 0.32), '#FFD98A', { p: [0.86, 0.68, 0], jitter: 0 }),
      part(Box(0.04, 0.28, 0.32), '#FFD98A', { p: [-0.86, 0.68, 0], jitter: 0 }),
    ]),
    chimneyTop: new V3(0.5, 2.05, -0.32),
  };
}

function cart() {
  const parts = [
    part(Box(0.8, 0.26, 0.52), '#9C6A43', { p: [0, 0.34, 0] }),
    part(Box(0.05, 0.05, 0.7), '#7A5038', { p: [0.18, 0.3, 0.6], r: [0.15, 0, 0] }),
    part(Box(0.05, 0.05, 0.7), '#7A5038', { p: [-0.18, 0.3, 0.6], r: [0.15, 0, 0] }),
  ];
  for (const x of [-0.42, 0.42]) parts.push(part(Cyl(0.2, 0.2, 0.06, 8), '#5E3E2B', { p: [x, 0.2, 0], r: [0, 0, Math.PI / 2] }));
  for (const [x, z] of [[-0.2, -0.08], [0.18, 0.06], [0, 0.12]])
    parts.push(part(Ico(0.15, 1), '#EE8E36', { p: [x, 0.55, z], s: [1, 0.72, 1] }));
  return merge(parts);
}

function snowman() {
  return merge([
    part(Ico(0.42, 1), '#F4F7FB', { p: [0, 0.36, 0], jitter: 0.03 }),
    part(Ico(0.3, 1), '#F4F7FB', { p: [0, 0.92, 0], jitter: 0.03 }),
    part(Ico(0.22, 1), '#F4F7FB', { p: [0, 1.32, 0], jitter: 0.03 }),
    part(Cone(0.045, 0.24, 5), '#EE8435', { p: [0, 1.32, 0.3], r: [Math.PI / 2, 0, 0] }),
    part(Ico(0.03), '#263B54', { p: [-0.08, 1.4, 0.19] }),
    part(Ico(0.03), '#263B54', { p: [0.08, 1.4, 0.19] }),
    part(Ico(0.035), '#263B54', { p: [0, 1.0, 0.29] }),
    part(Ico(0.035), '#263B54', { p: [0, 0.86, 0.3] }),
    part(new THREE.TorusGeometry(0.21, 0.06, 5, 10), '#D9573F', { p: [0, 1.13, 0], r: [Math.PI / 2, 0, 0] }),
    part(Box(0.1, 0.32, 0.05), '#D9573F', { p: [0.14, 0.98, 0.18], r: [0, 0, 0.2] }),
    part(Cyl(0.15, 0.15, 0.04, 8), '#2B4868', { p: [0, 1.5, 0] }),
    part(Cyl(0.11, 0.11, 0.22, 8), '#2B4868', { p: [0, 1.62, 0] }),
    part(Cyl(0.02, 0.02, 0.5, 4), '#6E4630', { p: [0.38, 0.95, 0], r: [0, 0, -1.0] }),
    part(Cyl(0.02, 0.02, 0.5, 4), '#6E4630', { p: [-0.38, 0.95, 0], r: [0, 0, 1.0] }),
  ]);
}

function igloo() {
  return merge([
    part(new THREE.SphereGeometry(0.85, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), '#F4F7FB', { p: [0, -0.02, 0], jitter: 0.04 }),
    part(Box(0.62, 0.52, 0.6), '#E8EEF6', { p: [0, 0.26, 0.82], jitter: 0.03 }),
    part(Box(0.36, 0.38, 0.03), '#2B4868', { p: [0, 0.2, 1.12], jitter: 0 }),
    part(new THREE.TorusGeometry(0.62, 0.025, 3, 18), '#CCDBEB', { p: [0, 0.42, 0], r: [Math.PI / 2, 0, 0], jitter: 0 }),
  ]);
}

function flag() {
  return {
    pole: merge([
      part(Cyl(0.025, 0.03, 1.0, 5), '#8B5E4A', { p: [0, 0.45, 0] }),
      part(Ico(0.045), '#E7B347', { p: [0, 0.97, 0] }),
    ]),
    cloth: part(Box(0.42, 0.26, 0.02), '#D9573F', { p: [0.21, 0, 0], jitter: 0.04 }),
  };
}

function signpost() {
  const parts = [
    part(Cyl(0.06, 0.075, 1.65, 6), '#8B5E4A', { p: [0, 0.7, 0] }),
    part(Cone(0.1, 0.14, 6), '#E7B347', { p: [0, 1.6, 0] }),
  ];
  SEASONS.forEach((s, i) => {
    const a = -s.lon * (Math.PI / 180);
    const y = 1.36 - i * 0.18;
    const m = new THREE.Matrix4().makeRotationY(a);
    const board = part(Box(0.6, 0.15, 0.05), s.accent, { p: [0.36, y, 0], jitter: 0.03 });
    const tip = part(Cone(0.1, 0.14, 3), s.accent, { p: [0.72, y, 0], r: [0, 0, -Math.PI / 2], jitter: 0.03 });
    board.applyMatrix4(m); tip.applyMatrix4(m);
    parts.push(board, tip);
  });
  return merge(parts);
}

// ---------------------------------------------------------------- placement
export function buildProps(scene, surf) {
  rng = mulberry32(2024);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const obstacles = [];
  const exclusions = [];
  const kinds = {};

  const kind = (name, geo, cast = true) => (kinds[name] = { geo, list: [], cast });
  for (let i = 0; i < 3; i++) kind('sakura' + i, sakura());
  for (let i = 0; i < 3; i++) kind('pine' + i, pine(['#3F8F4A', '#4AA055', '#57AD5F', '#368144'], false));
  for (let i = 0; i < 2; i++) kind('snowpine' + i, pine(['#2F6B4F', '#357656', '#2A5F47'], true));
  kind('maple0', maple(['#D9483B', '#E35F3F']));
  kind('maple1', maple(['#E8823A', '#F09A45']));
  kind('maple2', maple(['#F0B83F', '#E9A43A']));
  kind('bush', bush('#4E9A47'));
  kind('rock', rock(false));
  kind('snowrock', rock(true));
  kind('flowerP', flower('#F49AB4'), false);
  kind('flowerW', flower('#FFF6F8'), false);
  kind('flowerY', flower('#F6D35B'), false);
  kind('grassS', grass('#86C46A'), false);
  kind('grassU', grass('#3F8A3E'), false);
  kind('grassA', grass('#D6A64A'), false);
  kind('mushroom', mushroom(), false);
  kind('pumpkin', pumpkin());
  kind('hay', hay());
  kind('post', fencePost());
  kind('rail', fenceRail());

  const put = (name, d, fwd, h, s = 1, obstacleR = 0) => {
    kinds[name].list.push(frameMatrix(d, fwd, h, s));
    if (obstacleR) obstacles.push({ dir: d.clone(), r: obstacleR * s });
  };
  const putYaw = (name, d, s, obstacleR, sink = 0.04) => put(name, d, yawTangent(d, rng() * Math.PI * 2), surf(d) - sink, s, obstacleR);

  const statics = [];
  const addStatic = (geo, d, fwd, h, { glow = null, obstacle = 0, s = 1 } = {}) => {
    const m = frameMatrix(d, fwd, h, s);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.applyMatrix4(m);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    if (glow) { const g = new THREE.Mesh(glow, glowMat); g.applyMatrix4(m); scene.add(g); }
    if (obstacle) obstacles.push({ dir: d.clone(), r: obstacle });
    statics.push(mesh);
    return m;
  };
  const exclude = (d, r) => exclusions.push({ dir: d, cos: Math.cos(r / R) });

  // ---- spring: bridge, stone lanterns
  addStatic(bridge(), BRIDGE.dir, BRIDGE.along, BRIDGE.base);
  exclude(BRIDGE.dir, 2.8);
  const lantern = stoneLantern();
  for (const side of [-1, 1]) {
    const d = offsetDir(offsetDir(BRIDGE.dir, BRIDGE.along, side * (BRIDGE.L / 2 + 0.45)), BRIDGE.across, 0.85);
    addStatic(lantern.solid, d, BRIDGE.along, surf(d) - 0.03, { glow: lantern.glow, obstacle: 0.2 });
  }
  exclude(SPOTS.source, 1.6);
  exclude(SPOTS.southPond, 1.9);

  // ---- summer: camp
  const campFwd = tangentToward(SPOTS.camp, SPAWNS[1].dir);
  const campSide = new V3().crossVectors(SPOTS.camp, campFwd);
  const tents = [
    [offsetDir(offsetDir(SPOTS.camp, campFwd, -0.9), campSide, 0.95), '#EE8A5B', '#7A3B2A', 0.5],
    [offsetDir(offsetDir(SPOTS.camp, campFwd, -0.7), campSide, -1.05), '#F2C14E', '#7A5A22', -0.45],
  ];
  for (const [d, c, dark, yaw] of tents) {
    const fwd = tangentToward(d, SPOTS.camp).applyAxisAngle(d, yaw * 0.4);
    addStatic(tent(c, dark), d, fwd, surf(d) - 0.02, { obstacle: 0.75 });
  }
  const fireDir = offsetDir(SPOTS.camp, campFwd, 0.55);
  addStatic(campfire(), fireDir, campFwd, surf(fireDir) - 0.02, { obstacle: 0.4 });
  exclude(SPOTS.camp, 2.6);
  exclude(SPOTS.lake, 2.7);
  const fireH = surf(fireDir);
  const flameGroup = new THREE.Group();
  flameGroup.applyMatrix4(frameMatrix(fireDir, campFwd, fireH));
  const flameA = new THREE.Mesh(Cone(0.15, 0.48, 5), new THREE.MeshBasicMaterial({ color: '#FFAA45' }));
  const flameB = new THREE.Mesh(Cone(0.09, 0.32, 5), new THREE.MeshBasicMaterial({ color: '#FFE38A' }));
  flameA.position.y = 0.3; flameB.position.y = 0.26;
  flameGroup.add(flameA, flameB);
  scene.add(flameGroup);
  const fireLight = new THREE.PointLight('#FFB066', 7, 5.5, 1.6);
  fireLight.position.copy(fireDir).multiplyScalar(R + fireH + 0.6);
  scene.add(fireLight);

  // ---- autumn: cabin, hay, cart, pumpkin field
  const cabinFwd = tangentToward(SPOTS.cabin, SPAWNS[2].dir);
  const cabinSide = new V3().crossVectors(SPOTS.cabin, cabinFwd);
  const cab = cabin();
  const cabinH = surf(SPOTS.cabin) - 0.05;
  const cabinM = addStatic(cab.solid, SPOTS.cabin, cabinFwd, cabinH, { glow: cab.glow, obstacle: 1.15 });
  const chimneyTop = cab.chimneyTop.clone().applyMatrix4(cabinM);
  exclude(SPOTS.cabin, 2.6);
  for (const [a, b] of [[0.9, 1.25], [1.25, 1.45], [0.55, 1.6]]) {
    const d = offsetDir(offsetDir(SPOTS.cabin, cabinFwd, a), cabinSide, b);
    put('hay', d, yawTangent(d, rng() * 6), surf(d) - 0.03, 1, 0.38);
  }
  {
    const d = offsetDir(offsetDir(SPOTS.cabin, cabinFwd, 1.1), cabinSide, -1.35);
    addStatic(cart(), d, tangentToward(d, SPAWNS[2].dir).applyAxisAngle(d, 0.6), surf(d) - 0.03, { obstacle: 0.5 });
  }
  {
    // fenced pumpkin field
    const c = SPOTS.pumpkin;
    const f0 = tangentToward(c, SPOTS.cabin), s0 = new V3().crossVectors(c, f0);
    const half = 1.35, step = 0.45;
    const corner = (u, v) => offsetDir(offsetDir(c, f0, u), s0, v);
    const ring = [];
    for (let u = -half; u < half - 1e-6; u += step) ring.push([u, -half]);
    for (let v = -half; v < half - 1e-6; v += step) ring.push([half, v]);
    for (let u = half; u > -half + 1e-6; u -= step) ring.push([u, half]);
    for (let v = half; v > -half + 1e-6; v -= step) ring.push([-half, v]);
    const pts = ring.map(([u, v]) => corner(u, v));
    pts.forEach((d, i) => {
      put('post', d, f0, surf(d) - 0.03, 1);
      const [u, v] = ring[i];
      const isGate = Math.abs(u - half) < 1e-6 && Math.abs(v) < step * 0.9;
      if (isGate) return;
      const n = pts[(i + 1) % pts.length];
      const mid = d.clone().add(n).normalize();
      const fwd = tangentToward(mid, n);
      const len = d.distanceTo(n) * R;
      for (const hh of [0.14, 0.3]) {
        const m = frameMatrix(mid, fwd, surf(mid) + hh, 1);
        m.multiply(new THREE.Matrix4().makeScale(1, 1, len));
        kinds.rail.list.push(m);
      }
    });
    for (let u = -half + 0.35; u < half - 0.2; u += 0.5)
      for (let v = -half + 0.35; v < half - 0.2; v += 0.5) {
        const d = corner(u + (rng() - 0.5) * 0.15, v + (rng() - 0.5) * 0.15);
        put('pumpkin', d, yawTangent(d, rng() * 6), surf(d) - 0.03, 0.75 + rng() * 0.6);
      }
    exclude(c, 2.1);
  }

  // ---- winter: peak flag, snowman, igloo
  const peakTop = SPOTS.peak;
  const fl = flag();
  const flagH = surf(peakTop) - 0.06;
  addStatic(fl.pole, peakTop, yawTangent(peakTop, 0), flagH, { obstacle: 0.12 });
  const flagGroup = new THREE.Group();
  flagGroup.applyMatrix4(frameMatrix(peakTop, yawTangent(peakTop, 0), flagH));
  const cloth = new THREE.Mesh(fl.cloth, mat);
  cloth.position.y = 0.8;
  cloth.castShadow = true;
  flagGroup.add(cloth);
  scene.add(flagGroup);
  exclude(peakTop, 1.1);
  addStatic(snowman(), SPOTS.snowman, tangentToward(SPOTS.snowman, SPAWNS[3].dir), surf(SPOTS.snowman) - 0.08, { obstacle: 0.45 });
  exclude(SPOTS.snowman, 1.2);
  addStatic(igloo(), SPOTS.igloo, tangentToward(SPOTS.igloo, SPAWNS[3].dir), surf(SPOTS.igloo) - 0.05, { obstacle: 0.9 });
  exclude(SPOTS.igloo, 1.8);
  exclude(SPOTS.icelake, 2.5);

  // ---- north pole: signpost. Its boards point down the meridians, so the
  // frame is the world frame (up = +Y).
  {
    const m = new THREE.Matrix4().makeTranslation(0, R + surf(SPOTS.pole) - 0.05, 0);
    const mesh = new THREE.Mesh(signpost(), mat);
    mesh.applyMatrix4(m);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    obstacles.push({ dir: SPOTS.pole.clone(), r: 0.15 });
    exclude(SPOTS.pole, 1.6);
  }
  for (const s of SPAWNS) exclude(s.dir, 2.0);

  // ---- scatter vegetation on a jittered Fibonacci lattice
  const near = (d, spot, r) => d.dot(spot) > Math.cos(r / R);
  const w = [0, 0, 0, 0];
  const N = 3400, GA = Math.PI * (3 - Math.sqrt(5));
  const d = new V3();
  for (let i = 0; i < N; i++) {
    const y = 1 - ((i + 0.5) / N) * 2, rr = Math.sqrt(1 - y * y), th = i * GA;
    d.set(Math.cos(th) * rr, y, Math.sin(th) * rr);
    d.add(new V3((rng() - 0.5) * 0.03, (rng() - 0.5) * 0.03, (rng() - 0.5) * 0.03)).normalize();
    if (exclusions.some((e) => d.dot(e.dir) > e.cos)) continue;
    const h = surf(d);
    if (h < 0.24) continue;
    const rd = riverDist(d);
    if (rd < 1.0) continue;
    seasonWeights(d, w);
    let u = rng(), s = 0;
    for (; s < 3; s++) { if (u < w[s]) break; u -= w[s]; }
    const cl = fbm(d.x * 2.6 + 50, d.y * 2.6, d.z * 2.6, 3);
    const p = rng();
    const dd = d.clone();
    if (s === 0) {
      const t = 0.15 + cl * 0.35 + (near(d, SPOTS.grove, 4.2) ? 0.4 : 0) + (rd < 2.2 ? 0.12 : 0);
      if (p < t) putYaw('sakura' + Math.floor(rng() * 3), dd, 0.8 + rng() * 0.45, 0.25);
      else if (p < t + 0.38) putYaw(pick(['flowerP', 'flowerP', 'flowerW', 'flowerY']), dd, 0.8 + rng() * 0.6, 0, 0.01);
      else if (p < t + 0.6) putYaw('grassS', dd, 0.8 + rng() * 0.5, 0, 0.01);
      else if (p < t + 0.63) putYaw('rock', dd, 0.5 + rng() * 0.6, 0.22);
    } else if (s === 1) {
      const t = 0.22 + cl * 0.4 + (near(d, SPOTS.woods, 4.5) ? 0.4 : 0);
      if (p < t) putYaw('pine' + Math.floor(rng() * 3), dd, 0.85 + rng() * 0.6, 0.25);
      else if (p < t + 0.12) putYaw('bush', dd, 0.8 + rng() * 0.6, 0.22);
      else if (p < t + 0.42) putYaw('grassU', dd, 0.8 + rng() * 0.6, 0, 0.01);
      else if (p < t + 0.47) putYaw('flowerY', dd, 0.8 + rng() * 0.4, 0, 0.01);
      else if (p < t + 0.5) putYaw('rock', dd, 0.5 + rng() * 0.7, 0.22);
    } else if (s === 2) {
      const t = 0.17 + cl * 0.35 + (near(d, SPOTS.maple, 4.5) ? 0.4 : 0);
      if (p < t) putYaw('maple' + Math.floor(rng() * 3), dd, 0.8 + rng() * 0.5, 0.25);
      else if (p < t + 0.06) putYaw('mushroom', dd, 0.8 + rng() * 0.8, 0, 0.01);
      else if (p < t + 0.2) putYaw('grassA', dd, 0.8 + rng() * 0.6, 0, 0.01);
      else if (p < t + 0.23) putYaw('pumpkin', dd, 0.6 + rng() * 0.5, 0);
      else if (p < t + 0.27) putYaw('rock', dd, 0.5 + rng() * 0.7, 0.22);
    } else {
      const t = h < 2.1 ? 0.15 + cl * 0.35 : 0;
      if (p < t) putYaw('snowpine' + Math.floor(rng() * 2), dd, 0.8 + rng() * 0.6, 0.25);
      else if (p < t + 0.07) putYaw('snowrock', dd, 0.5 + rng() * 0.8, 0.22);
    }
  }

  // Trees are "shy": in follow mode, any tree standing between the camera and
  // the character shrinks into the ground and pops back once the view is clear.
  const shy = [];
  const SHY = /^(sakura|pine|snowpine|maple)/;
  for (const [name, k] of Object.entries(kinds)) {
    if (!k.list.length) continue;
    const im = new THREE.InstancedMesh(k.geo, mat, k.list.length);
    k.list.forEach((m, i) => {
      im.setMatrixAt(i, m);
      if (SHY.test(name)) {
        const up = new V3().setFromMatrixColumn(m, 1);
        const p = new V3().setFromMatrixPosition(m).add(up.multiplyScalar(0.9));
        shy.push({ im, i, base: m, p, s: 1 });
      }
    });
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = k.cast;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    im.name = name;
    scene.add(im);
  }

  // ---- chimney smoke
  const smokeMat = [];
  const puffs = [];
  const cabinUp = SPOTS.cabin.clone();
  for (let i = 0; i < 6; i++) {
    const m = new THREE.MeshLambertMaterial({ color: '#E8EEF6', flatShading: true, transparent: true, opacity: 0.8, depthWrite: false });
    const mesh = new THREE.Mesh(Ico(0.16), m);
    smokeMat.push(m);
    puffs.push({ mesh, phase: i / 6 });
    scene.add(mesh);
  }
  const smokeSide = cabinSide.clone();

  const countInstances = Object.values(kinds).reduce((a, k) => a + k.list.length, 0);

  const _seg = new V3(), _ap = new V3(), _sc = new THREE.Matrix4(), _mm = new THREE.Matrix4();
  function updateShy(dt, camPos, target, active) {
    _seg.subVectors(camPos, target);
    const len2 = _seg.lengthSq();
    const a = 1 - Math.exp(-dt * 9);
    const dirty = new Set();
    for (const tr of shy) {
      let want = 1;
      if (active) {
        _ap.subVectors(tr.p, target);
        const u = _ap.dot(_seg) / len2;
        if (u > 0.04 && u < 1.15) {
          const d2 = _ap.addScaledVector(_seg, -Math.min(u, 1)).lengthSq();
          if (d2 < 1.25) want = 0;
        }
      }
      if (Math.abs(want - tr.s) < 0.002) continue;
      tr.s += (want - tr.s) * a;
      if (Math.abs(want - tr.s) < 0.002) tr.s = want;
      const k = Math.max(0.001, tr.s);
      _mm.copy(tr.base).multiply(_sc.makeScale(k, k, k));
      tr.im.setMatrixAt(tr.i, _mm);
      dirty.add(tr.im);
    }
    for (const im of dirty) im.instanceMatrix.needsUpdate = true;
  }

  function update(t) {
    const fl1 = 1 + Math.sin(t * 13.1) * 0.12 + Math.sin(t * 7.3) * 0.08;
    const fl2 = 1 + Math.sin(t * 15.7 + 1) * 0.15;
    flameA.scale.set(1, fl1, 1);
    flameB.scale.set(1, fl2, 1);
    flameA.rotation.y = t * 1.3;
    fireLight.intensity = 6 + Math.sin(t * 11) * 1.2 + Math.sin(t * 17.3) * 0.8;
    cloth.rotation.y = Math.sin(t * 2.2) * 0.35;
    cloth.scale.x = 1 + Math.sin(t * 5.1) * 0.05;
    for (const p of puffs) {
      const u = (t * 0.22 + p.phase) % 1;
      p.mesh.position.copy(chimneyTop)
        .addScaledVector(cabinUp, u * 2.0)
        .addScaledVector(smokeSide, Math.sin(u * 4 + p.phase * 6) * 0.25 + u * 0.6);
      p.mesh.scale.setScalar(0.6 + u * 1.8);
      p.mesh.material.opacity = 0.75 * (1 - u) * smoothstep(0, 0.08, u);
      p.mesh.rotation.set(u * 3, u * 2, 0);
    }
  }

  return { obstacles, update, updateShy, countInstances };
}
