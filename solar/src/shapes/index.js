import { hero } from './hero.js';
import { sun, SUN_R } from './sun.js';
import { mercury, MERCURY_R } from './mercury.js';
import { venus, VENUS_R } from './venus.js';
import { earth, EARTH_R } from './earth.js';
import { mars, MARS_R } from './mars.js';
import { jupiter, JUPITER_R } from './jupiter.js';
import { saturn, SATURN_R } from './saturn.js';
import { uranus, URANUS_R } from './uranus.js';
import { neptune, NEPTUNE_R } from './neptune.js';
import { pluto, PLUTO_R } from './pluto.js';
import { galaxy } from './galaxy.js';

// One entry per page, in scroll order.
//   type   shader branch: 0 system overview · 1 Sun · 2 planet · 3 galaxy
//   w, h   rough extent in local units, used to fit the body on screen
//   max    upper bound on the fit scale (lets small bodies fill the frame)
//   par    [spin rad/s, band shear, axial tilt rad, moon / ring orbit speed]
//   occ    radius of the main sphere, which hides particles passing behind it
//   lit    1 when the body is lit by the (off-screen) Sun
//   gain   brightness multiplier for the whole body
//   face   longitude (°) facing the camera when the page is first reached
//   pose   slow drift: position, rotation (x pitch, y yaw, z roll) and scale

const s = Math.sin;
const D = Math.PI / 180;
const planet = (R, extra = {}) => ({ type: 2, w: R * 2.6, h: R * 2.9, max: 1.2, occ: R, lit: 1, gain: 1.12, ...extra });
const drift = (pitch, yaw, roll = 0, bob = 0.1) => (t) => ({
  p: [0, s(t * 0.4) * bob, 0],
  r: [pitch + s(t * 0.21) * 0.025, yaw + s(t * 0.13) * 0.05, roll],
  k: 1,
});

export const SHAPES = [
  {
    key: 'hero', type: 0, build: hero, center: true, spill: 1.25, w: 21, h: 13, occ: 0.85, lit: 0, gain: 1.1, par: [0, 0, 0, 0],
    pose: (t) => ({ p: [0, -0.6, -1], r: [1.02 + s(t * 0.11) * 0.03, s(t * 0.05) * 0.08, 0.12], k: 1 }),
  },
  {
    key: 'sun', type: 1, build: sun, w: 6.4, h: 6.4, max: 1.25, occ: SUN_R, lit: 0, gain: 0.62, par: [0.03, 0.14, 7.25 * D, SUN_R], face: 0,
    pose: drift(0.12, -0.1, 0, 0.06),
  },
  { key: 'mercury', ...planet(MERCURY_R), gain: 0.95, build: mercury, par: [0.035, 0, 0.03 * D, 0], face: 40, pose: drift(0.18, 0) },
  { key: 'venus', ...planet(VENUS_R), build: venus, par: [-0.09, 0, 2.6 * D, 0], face: -20, pose: drift(0.16, 0) },
  {
    key: 'earth', ...planet(EARTH_R), build: earth, w: 10.4, h: 7.2, max: 1.15, par: [0.09, 0, 23.44 * D, 0.07], face: 100,
    pose: drift(0.3, 0.05, 0, 0.08),
  },
  { key: 'mars', ...planet(MARS_R), build: mars, par: [0.09, 0, 25.19 * D, 0], face: -65, pose: drift(0.2, 0) },
  { key: 'jupiter', ...planet(JUPITER_R), gain: 0.95, build: jupiter, par: [0.16, 0.12, 3.13 * D, 0], face: 45, pose: drift(0.12, 0) },
  {
    key: 'saturn', ...planet(SATURN_R), build: saturn, w: 12.6, h: 7, par: [0.15, 0.07, 26.73 * D, 0.18], face: 0,
    pose: drift(0.42, 0.1, 0, 0.08),
  },
  {
    key: 'uranus', ...planet(URANUS_R), build: uranus, w: 9, h: 9, par: [0.11, 0, 97.77 * D, 0.12], face: 0,
    pose: drift(0.2, -1.1, 0, 0.08),
  },
  { key: 'neptune', ...planet(NEPTUNE_R), build: neptune, par: [0.12, 0.06, 28.32 * D, 0], face: 30, pose: drift(0.2, 0) },
  { key: 'pluto', ...planet(PLUTO_R), build: pluto, par: [-0.03, 0, 12 * D, 0], face: 165, pose: drift(0.18, 0) },
  {
    key: 'galaxy', type: 3, build: galaxy, center: true, spill: 1.05, w: 25, h: 15, occ: 0, lit: 0, par: [0.02, 0, 0, 0],
    pose: (t) => ({ p: [0, -0.4, -1], r: [1.12 + s(t * 0.09) * 0.03, s(t * 0.05) * 0.06, 0.1], k: 1 }),
  },
];
