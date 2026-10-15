// The planet's layout: four longitude quadrants (one per season), the terrain
// height function, the spring brook, landmark spots and spawn points.
// Every position is a unit direction from the planet centre; heights are
// measured from the base radius R.

import * as THREE from 'three';
import { fbm } from './noise.js';

export const R = 10;
export const WATER = 0;
export const D2R = Math.PI / 180;

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export function dirLL(lat, lon, out = new THREE.Vector3()) {
  const la = lat * D2R, lo = lon * D2R;
  return out.set(Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo));
}

export function toLL(d) {
  return {
    lat: Math.asin(clamp(d.y, -1, 1)) / D2R,
    lon: (Math.atan2(d.z, d.x) / D2R + 360) % 360,
  };
}

// Unit tangent at d pointing toward target (great-circle heading).
export function tangentToward(d, target, out = new THREE.Vector3()) {
  out.copy(target).addScaledVector(d, -target.dot(d));
  if (out.lengthSq() < 1e-12) {
    out.set(1, 0, 0).addScaledVector(d, -d.x);
    if (out.lengthSq() < 1e-6) out.set(0, 0, 1).addScaledVector(d, -d.z);
  }
  return out.normalize();
}

// Walk `dist` world units from d along a tangent.
export function offsetDir(d, tangent, dist, out = new THREE.Vector3()) {
  const a = dist / R;
  return out.copy(d).multiplyScalar(Math.cos(a)).addScaledVector(tangent, Math.sin(a)).normalize();
}

export const SEASONS = [
  { key: 'spring', zh: '春', realm: '春之境', en: 'Spring', lon: 45, accent: '#E98BA8', soft: '#FBE3EA' },
  { key: 'summer', zh: '夏', realm: '夏之境', en: 'Summer', lon: 135, accent: '#4E9A52', soft: '#DDEFD9' },
  { key: 'autumn', zh: '秋', realm: '秋之境', en: 'Autumn', lon: 225, accent: '#D9693A', soft: '#F8E1D2' },
  { key: 'winter', zh: '冬', realm: '冬之境', en: 'Winter', lon: 315, accent: '#497DAE', soft: '#E8EEF6' },
];
export const POLE_INFO = { zh: '极', realm: '四季交汇', en: 'Crossroads', accent: '#376392', soft: '#E8EEF6' };

// Quadrant weights. The boundary longitude wanders with low-frequency noise so
// the seasons meet along organic edges, and the ±15° blend band gives the
// seamless colour/vegetation transition.
const BLEND = 30;
export function seasonWeights(d, out = [0, 0, 0, 0]) {
  let lon = Math.atan2(d.z, d.x) / D2R;
  lon += fbm(d.x * 1.7 + 7.3, d.y * 1.7 - 2.1, d.z * 1.7 + 4.4, 3) * 40;
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const dl = Math.abs(((((lon - SEASONS[i].lon) % 360) + 540) % 360) - 180);
    const w = clamp(0.5 + (45 - dl) / BLEND, 0, 1);
    out[i] = w;
    sum += w;
  }
  for (let i = 0; i < 4; i++) out[i] /= sum;
  return out;
}

const _w = [0, 0, 0, 0];
export function seasonAt(d) {
  seasonWeights(d, _w);
  let m = 0;
  for (let i = 1; i < 4; i++) if (_w[i] > _w[m]) m = i;
  return m;
}

// ---------------------------------------------------------------- spring brook
export const riverLon = (lat) => 42 + 9 * Math.sin(lat * 0.07) + 4 * Math.sin(lat * 0.19 + 1.3);
export const RIVER = [];
for (let lat = 54; lat >= -46.01; lat -= 2.5) RIVER.push(dirLL(lat, riverLon(lat)));
const RIVER_MID = dirLL(4, 45);

export function riverDist(d) {
  if (d.dot(RIVER_MID) < 0.42) return 99;
  let best = 1e9;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const a = RIVER[i], b = RIVER[i + 1];
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
    const apx = d.x - a.x, apy = d.y - a.y, apz = d.z - a.z;
    const t = clamp((apx * abx + apy * aby + apz * abz) / (abx * abx + aby * aby + abz * abz), 0, 1);
    const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
    const q = dx * dx + dy * dy + dz * dz;
    if (q < best) best = q;
  }
  return Math.sqrt(best) * R;
}

export function riverPoint(s, out = new THREE.Vector3()) {
  const f = clamp(s, 0, 1) * (RIVER.length - 1);
  const i = Math.min(RIVER.length - 2, Math.floor(f));
  return out.copy(RIVER[i]).lerp(RIVER[i + 1], f - i).normalize();
}

// Arched bridge across the brook. `along` runs across the water (deck length),
// `across` follows the current.
export const BRIDGE = (() => {
  const dir = dirLL(6, riverLon(6));
  const flow = dirLL(3, riverLon(3)).sub(dirLL(9, riverLon(9)));
  flow.addScaledVector(dir, -flow.dot(dir)).normalize();
  const along = new THREE.Vector3().crossVectors(dir, flow).normalize();
  return { dir, along, across: flow, L: 3.4, W: 1.05, base: 0.32 };
})();
export const bridgeDeckY = (z) => 0.12 + 0.5 * Math.cos((Math.PI * z) / BRIDGE.L);

// Height of the deck under direction p, or null when p is off the bridge.
const _bv = new THREE.Vector3();
export function bridgeDeck(p) {
  if (p.dot(BRIDGE.dir) < 0.97) return null;
  _bv.copy(p).sub(BRIDGE.dir);
  const z = _bv.dot(BRIDGE.along) * R;
  const x = _bv.dot(BRIDGE.across) * R;
  if (Math.abs(z) > BRIDGE.L / 2 || Math.abs(x) > BRIDGE.W / 2) return null;
  return BRIDGE.base + bridgeDeckY(z) + 0.04;
}

// ---------------------------------------------------------------- landmarks
export const SPOTS = {
  source: dirLL(54, riverLon(54)),
  southPond: dirLL(-46, riverLon(-46)),
  grove: dirLL(30, 74),
  camp: dirLL(14, 128),
  lake: dirLL(-20, 150),
  woods: dirLL(42, 112),
  cabin: dirLL(12, 224),
  pumpkin: dirLL(-16, 206),
  maple: dirLL(38, 250),
  peak: dirLL(24, 322),
  icelake: dirLL(-16, 298),
  snowman: dirLL(-6, 284),
  igloo: dirLL(-1, 291),
  pole: new THREE.Vector3(0, 1, 0),
};

export const LANDMARKS = [
  { id: 'bridge', season: 0, zh: '樱花溪桥', en: 'Sakura Brook Bridge', desc: '朱红拱桥跨过潺潺小溪，花瓣顺着水流漂向下游。', dir: BRIDGE.dir },
  { id: 'grove', season: 0, zh: '樱语林', en: 'Whispering Sakura Grove', desc: '成片的粉色树冠，风一吹便落英缤纷。', dir: SPOTS.grove },
  { id: 'source', season: 0, zh: '清泉池', en: 'Wellspring Pond', desc: '小溪从这里涌出，一路向南流去。', dir: SPOTS.source },
  { id: 'camp', season: 1, zh: '萤火营地', en: 'Firefly Camp', desc: '两顶帐篷围着篝火，萤火虫在松林间一闪一闪。', dir: SPOTS.camp },
  { id: 'lake', season: 1, zh: '松风湖', en: 'Pine Breeze Lake', desc: '湖面映着松影，适合坐在岸边发呆。', dir: SPOTS.lake },
  { id: 'woods', season: 1, zh: '翠松林', en: 'Emerald Pine Woods', desc: '星球上最茂密的松林，空气里有松针的味道。', dir: SPOTS.woods },
  { id: 'cabin', season: 2, zh: '丰收木屋', en: 'Harvest Cabin', desc: '烟囱飘着炊烟，门前堆着金色草垛和南瓜车。', dir: SPOTS.cabin },
  { id: 'pumpkin', season: 2, zh: '南瓜田', en: 'Pumpkin Patch', desc: '圆滚滚的南瓜躺在篱笆里，等着被摘回家。', dir: SPOTS.pumpkin },
  { id: 'maple', season: 2, zh: '枫红山丘', en: 'Maple Hills', desc: '起伏的山丘被枫叶染成金红，落叶铺满小径。', dir: SPOTS.maple },
  { id: 'peak', season: 3, zh: '极光雪峰', en: 'Aurora Peak', desc: '星球最高处，峰顶插着小红旗，极光在头顶摇曳。', dir: SPOTS.peak },
  { id: 'icelake', season: 3, zh: '镜冰湖', en: 'Mirror Ice Lake', desc: '湖面冻得结结实实，走上去会滑行，雪人在岸边守着。', dir: SPOTS.icelake },
  { id: 'igloo', season: 3, zh: '雪屋', en: 'Snow Igloo', desc: '用雪砖垒成的小圆屋，躲风雪正合适。', dir: SPOTS.igloo },
  { id: 'pole', season: -1, zh: '四季路标', en: 'Four Seasons Signpost', desc: '北极点上的路标，四块木牌各指向一个季节。', dir: SPOTS.pole },
];

// Where the season buttons drop the character, and what it faces on landing.
export const SPAWNS = [
  { dir: offsetDir(BRIDGE.dir, BRIDGE.along, -(BRIDGE.L / 2 + 1.7)), look: BRIDGE.dir },
  { dir: dirLL(-1, 131), look: SPOTS.camp },
  { dir: dirLL(-3, 227), look: SPOTS.cabin },
  { dir: dirLL(6, 317), look: SPOTS.peak },
];

// ---------------------------------------------------------------- terrain
function baseHeight(d, w) {
  const x = d.x, y = d.y, z = d.z;
  let h = 0.55 + fbm(x * 2.0, y * 2.0, z * 2.0, 4) * 0.35;
  h += w[0] * fbm(x * 3 + 5, y * 3, z * 3, 3) * 0.15;
  h += w[1] * (fbm(x * 3.5 + 9, y * 3.5, z * 3.5, 3) * 0.25 + 0.05);
  h += w[2] * (Math.abs(fbm(x * 2.8 + 13, y * 2.8, z * 2.8, 3)) * 0.75 + 0.05);
  const ridge = Math.max(0, 1 - Math.abs(fbm(x * 2.4 + 31, y * 2.4, z * 2.4, 4) * 2.0));
  h += w[3] * (ridge * ridge * ridge * 1.5 + 0.25);
  return h;
}

const _hw = [0, 0, 0, 0];
const feat = (type, dir, r, h = null) => ({ type, dir, r: r / R, cosR: Math.cos(r / R), h });
const BANK = BRIDGE.L / 2 + 0.55;
const FEAT = [
  feat('peak', SPOTS.peak, 3.6, 3.0),
  feat('peak', dirLL(40, 292), 2.4, 1.6),
  feat('peak', dirLL(-36, 338), 2.3, 1.3),
  feat('peak', dirLL(54, 338), 2.0, 1.1),
  feat('pad', SPOTS.camp, 2.0),
  feat('pad', SPOTS.cabin, 2.0),
  feat('pad', SPOTS.pumpkin, 1.9),
  feat('pad', SPOTS.pole, 1.4),
  feat('pad', SPOTS.igloo, 1.3),
  feat('pad', SPOTS.snowman, 0.9),
  feat('pad', offsetDir(BRIDGE.dir, BRIDGE.along, BANK), 1.1, 0.45),
  feat('pad', offsetDir(BRIDGE.dir, BRIDGE.along, -BANK), 1.1, 0.45),
  feat('bowl', SPOTS.source, 1.3, -0.45),
  feat('bowl', SPOTS.southPond, 1.7, -0.45),
  feat('bowl', SPOTS.lake, 2.4, -0.5),
  feat('bowl', SPOTS.icelake, 2.2, -0.45),
];
// Pads without an explicit height flatten to the natural height at their centre.
for (const f of FEAT) if (f.type === 'pad' && f.h === null) f.h = baseHeight(f.dir, seasonWeights(f.dir, _hw));

export const PEAK_TOP = 3.0;

export function height(d) {
  const w = seasonWeights(d, _hw);
  let h = baseHeight(d, w);
  for (const f of FEAT) {
    const c = d.dot(f.dir);
    if (c < f.cosR) continue;
    const t = 1 - Math.acos(Math.min(1, c)) / f.r;
    if (f.type === 'peak') {
      const s = smoothstep(0, 1, t);
      h += f.h * Math.pow(s, 1.5) * (1 + 0.12 * fbm(d.x * 9, d.y * 9, d.z * 9, 2));
    } else if (f.type === 'pad') {
      h = lerp(h, f.h, smoothstep(0, 0.45, t));
    } else {
      h = lerp(h, f.h, smoothstep(0, 0.6, t));
    }
  }
  const rd = riverDist(d);
  if (rd < 1) h = lerp(h, -0.35, smoothstep(0.85, 0.35, rd));
  return h;
}
