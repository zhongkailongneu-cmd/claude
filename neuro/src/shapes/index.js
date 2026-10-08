import { T } from '../timing.js';
import { hero } from './hero.js';
import { molecule } from './molecule.js';
import { spine } from './spine.js';
import { glia } from './glia.js';
import { synapse } from './synapse.js';
import { engram } from './engram.js';
import { hippocampus, HIPPO_STATIONS } from './hippocampus.js';
import { circuit, LOOP_STATIONS } from './circuit.js';
import { tracts } from './tracts.js';
import { networks } from './networks.js';
import { brain } from './brain.js';
import { body } from './body.js';
import { outro } from './outro.js';

// One entry per page, in scroll order. `type` selects the animation branch in
// the vertex shader. `w`/`h` are the subject's rough extent in local units,
// used to fit it on screen. `pose(t)` returns its slow drift: position,
// rotation (x pitch, y yaw, z roll) and scale. `events` are the moments in
// each animation cycle that make a sound (phases are fractions of `period`).

const s = Math.sin;
const range = (n, f) => Array.from({ length: n }, (_, k) => f(k));

export const SHAPES = [
  {
    key: 'hero', type: 0, build: hero, center: true, spill: 1.25, w: 12, h: 12,
    pose: (t) => ({ p: [0, 0.9, -1.5], r: [0.08 + s(t * 0.13) * 0.04, s(t * 0.09) * 0.45, s(t * 0.11) * 0.03], k: 1 }),
    events: [{ period: T.heroAP, at: [0], name: 'ap' }],
  },
  {
    key: 'molecule', type: 1, build: molecule, w: 11, h: 8,
    pose: (t) => ({ p: [0, -0.4, 0], r: [0.42 + s(t * 0.2) * 0.04, t * 0.11, s(t * 0.15) * 0.05], k: 1 }),
    events: [
      { period: T.molCycle, at: [0], name: 'influx' },
      { period: T.molCycle, at: range(12, (k) => T.molStart + k * T.molStep), name: 'phos' },
      { period: T.molCycle, at: [T.molReset], name: 'dephos' },
    ],
  },
  {
    key: 'spine', type: 2, build: spine, w: 11.5, h: 7,
    pose: (t) => ({ p: [0, 0, 0], r: [0.32 + s(t * 0.21) * 0.05, -0.32 + s(t * 0.13) * 0.12, 0.1 + s(t * 0.17) * 0.04], k: 1 }),
    events: [{ period: T.spineCycle, at: [0, 0.25, 0.5, 0.75], name: 'grow' }],
  },
  {
    key: 'glia', type: 3, build: glia, w: 12, h: 9.2,
    pose: (t) => ({ p: [0, 0, 0], r: [0.12 + s(t * 0.19) * 0.05, -0.25 + s(t * 0.12) * 0.18, s(t * 0.16) * 0.03], k: 1 }),
    events: [
      { period: T.gliaAP, at: range(T.gliaNodes, (k) => (k * 0.6) / T.gliaNodes), name: 'node' },
      { period: T.gliaWave, at: [0], name: 'wave' },
    ],
  },
  {
    key: 'synapse', type: 4, build: synapse, w: 9.5, h: 12.5,
    pose: (t) => ({ p: [0, 0, 0], r: [0.22 + s(t * 0.17) * 0.05, s(t * 0.1) * 0.5, s(t * 0.13) * 0.04], k: 1 }),
    events: [
      { period: T.synCycle, at: [0, 0.06], name: 'release' },
      { period: T.synCycle, at: [T.synBurst0], name: 'burst' },
      { period: T.synCycle, at: [T.synBurst1 + 0.02], name: 'ltp' },
    ],
  },
  {
    key: 'engram', type: 5, build: engram, w: 7.6, h: 9.6,
    pose: (t) => ({ p: [0, 0, 0], r: [0.26 + s(t * 0.15) * 0.04, t * 0.1, s(t * 0.12) * 0.03], k: 1 }),
    events: [{ period: T.engram, at: [0], name: 'recall' }],
  },
  {
    key: 'hippocampus', type: 6, build: hippocampus, w: 9, h: 8.2,
    pose: (t) => ({ p: [0, 0.2, 0], r: [0.18 + s(t * 0.16) * 0.05, 0.5 + s(t * 0.11) * 0.14, s(t * 0.13) * 0.03], k: 1 }),
    events: [
      { period: T.hippoLoop, at: HIPPO_STATIONS, name: 'station' },
      { period: T.hippoSWR, at: [0], name: 'ripple' },
    ],
  },
  {
    key: 'circuit', type: 7, build: circuit, w: 9.2, h: 7.6,
    pose: (t) => ({ p: [0, 0.3, 0], r: [0.14 + s(t * 0.14) * 0.04, -0.18 + s(t * 0.1) * 0.14, 0], k: 1 }),
    events: [
      { period: T.loop, at: LOOP_STATIONS, name: 'loop' },
      { period: T.daBurst, at: [0, 0.25, 0.5, 0.75], name: 'mod' },
    ],
  },
  {
    key: 'tracts', type: 8, build: tracts, w: 9.6, h: 8,
    pose: (t) => ({ p: [0, 0.4, 0], r: [0.28 + s(t * 0.12) * 0.05, -0.62 + s(t * 0.07) * 0.5, 0], k: 1 }),
    events: [{ period: 2.6, at: [0], name: 'glide' }],
  },
  {
    key: 'networks', type: 9, build: networks, w: 9.2, h: 7.2,
    pose: (t) => ({ p: [0, 0, 0], r: [0.62 + s(t * 0.13) * 0.05, -0.55 + s(t * 0.09) * 0.25, 0], k: 1 }),
    events: [
      { period: T.netCycle, at: [0.43, 0.93], name: 'switch' },
      { period: T.netCycle, at: [0.47], name: 'cen' },
      { period: T.netCycle, at: [0.97], name: 'dmn' },
    ],
  },
  {
    key: 'brain', type: 10, build: brain, w: 9.2, h: 8.2,
    pose: (t) => ({ p: [0, 0.5, 0], r: [0.18 + s(t * 0.12) * 0.04, -0.55 + s(t * 0.08) * 0.45, 0], k: 1 }),
    events: [{ period: T.brainWave, at: [0], name: 'slowwave' }],
  },
  {
    key: 'body', type: 11, build: body, w: 9, h: 11.8,
    pose: (t) => ({ p: [0, 0, 0], r: [0.1 + s(t * 0.11) * 0.03, s(t * 0.09) * 0.35, 0], k: 1 }),
    events: [
      { period: T.heart, at: [0], name: 'heart' },
      { period: T.hpa, at: [0], name: 'hpa' },
    ],
  },
  {
    key: 'outro', type: 12, build: outro, center: true, spill: 2.2, w: 22, h: 8,
    pose: (t) => ({ p: [0, -3.2, 0], r: [0.32, s(t * 0.05) * 0.06, 0], k: 1 }),
    events: [{ period: 7, at: [0], name: 'swell' }],
  },
];
