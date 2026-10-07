import { hero } from './hero.js';
import { turtle } from './turtle.js';
import { manta } from './manta.js';
import { whale } from './whale.js';
import { lanternfish } from './lanternfish.js';
import { jellyfish } from './jellyfish.js';
import { anglerfish } from './anglerfish.js';
import { eel } from './eel.js';
import { outro } from './outro.js';

// One entry per page, in scroll order. `type` selects the animation branch in
// the vertex shader. `w`/`h` are the creature's rough extent in local units,
// used to fit it on screen. `pose(t)` returns its slow drift: position,
// rotation (x pitch, y yaw, z roll) and scale.

const s = Math.sin;

export const SHAPES = [
  {
    key: 'hero', type: 0, build: hero, center: true, spill: 1.7, w: 15, h: 9,
    pose: (t) => ({ p: [0, -0.4, -2], r: [0.95 + s(t * 0.21) * 0.04, 0, s(t * 0.17) * 0.03], k: 1 }),
  },
  {
    key: 'turtle', type: 1, build: turtle, w: 8.4, h: 5.5,
    pose: (t) => ({ p: [0, s(t * 0.5) * 0.18, 0], r: [0.62 + s(t * 0.3) * 0.05, -0.62 + s(t * 0.2) * 0.12, s(t * 0.4) * 0.07], k: 1 }),
  },
  {
    key: 'manta', type: 2, build: manta, w: 9.2, h: 6,
    pose: (t) => ({ p: [0, s(t * 0.45) * 0.22, 0], r: [1.12 + s(t * 0.27) * 0.06, 0.85 + s(t * 0.18) * 0.08, s(t * 0.33) * 0.05], k: 1 }),
  },
  {
    key: 'whale', type: 3, build: whale, w: 12.5, h: 5,
    pose: (t) => ({ p: [-0.4, s(t * 0.3) * 0.25, -1.5], r: [-0.58 + s(t * 0.2) * 0.04, -0.32 + s(t * 0.13) * 0.06, 0.2 + s(t * 0.25) * 0.04], k: 1 }),
  },
  {
    key: 'lanternfish', type: 4, build: lanternfish, w: 11.5, h: 7.5,
    pose: (t) => ({ p: [0, s(t * 0.5) * 0.15, 0], r: [0.12 + s(t * 0.3) * 0.04, -0.5 + s(t * 0.22) * 0.1, 0.04], k: 1 }),
  },
  {
    key: 'jellyfish', type: 5, build: jellyfish, w: 6.5, h: 9.5,
    pose: (t) => ({ p: [0, 2.2 + s(t * 0.35) * 0.3, 0], r: [0.38 + s(t * 0.25) * 0.05, t * 0.08, s(t * 0.3) * 0.06], k: 1 }),
  },
  {
    key: 'anglerfish', type: 6, build: anglerfish, w: 7.6, h: 5.8,
    pose: (t) => ({ p: [-0.4, -0.2, 0], r: [0.12 + s(t * 0.3) * 0.04, -0.62 + s(t * 0.2) * 0.1, s(t * 0.27) * 0.05], k: 1 }),
  },
  {
    key: 'eel', type: 7, build: eel, w: 13, h: 6,
    pose: (t) => ({ p: [0, 0, -1], r: [0.72 + s(t * 0.25) * 0.05, -0.22 + s(t * 0.17) * 0.08, 0.16], k: 1 }),
  },
  {
    key: 'outro', type: 8, build: outro, center: true, spill: 3, w: 18, h: 8,
    pose: (t) => ({ p: [0, -3.4, 0], r: [0.2, s(t * 0.05) * 0.05, 0], k: 1 }),
  },
];
