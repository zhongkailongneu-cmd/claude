// Exact ground height on the faceted terrain. The character and every prop
// stand on the actual low-poly triangles (not the smooth height function), so
// feet never float above or sink into a facet. Triangles are bucketed on a
// 2.5° lat/lon grid; the two polar caps keep their own short lists.

import { R, height, D2R } from './world.js';

const NLAT = 72, NLON = 144;

export function buildSurface(geo) {
  const pos = geo.attributes.position.array;
  const nTri = pos.length / 9;
  const buckets = Array.from({ length: NLAT * NLON }, () => []);
  const polarN = [], polarS = [];
  const lat = new Float64Array(3), lon = new Float64Array(3);

  for (let t = 0; t < nTri; t++) {
    const o = t * 9;
    let minLat = 90, maxLat = -90;
    for (let k = 0; k < 3; k++) {
      const x = pos[o + k * 3], y = pos[o + k * 3 + 1], z = pos[o + k * 3 + 2];
      lat[k] = Math.asin(y / Math.hypot(x, y, z)) / D2R;
      lon[k] = (Math.atan2(z, x) / D2R + 360) % 360;
      minLat = Math.min(minLat, lat[k]);
      maxLat = Math.max(maxLat, lat[k]);
    }
    if (maxLat > 84) { polarN.push(t); continue; }
    if (minLat < -84) { polarS.push(t); continue; }
    let lo = 0, hi = 0;
    for (let k = 1; k < 3; k++) {
      const dl = ((lon[k] - lon[0] + 540) % 360) - 180;
      lo = Math.min(lo, dl);
      hi = Math.max(hi, dl);
    }
    const i0 = Math.floor(((minLat + 90) / 180) * NLAT), i1 = Math.floor(((maxLat + 90) / 180) * NLAT);
    const j0 = Math.floor(((lon[0] + lo) / 360) * NLON), j1 = Math.floor(((lon[0] + hi) / 360) * NLON);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) buckets[i * NLON + (((j % NLON) + NLON) % NLON)].push(t);
  }

  // Ray from the planet centre along d against triangle t (Möller–Trumbore).
  function hit(t, dx, dy, dz) {
    const o = t * 9;
    const ax = pos[o], ay = pos[o + 1], az = pos[o + 2];
    const e1x = pos[o + 3] - ax, e1y = pos[o + 4] - ay, e1z = pos[o + 5] - az;
    const e2x = pos[o + 6] - ax, e2y = pos[o + 7] - ay, e2z = pos[o + 8] - az;
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) return -1;
    const inv = 1 / det;
    const tx = -ax, ty = -ay, tz = -az;
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < -1e-6 || u > 1 + 1e-6) return -1;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < -1e-6 || u + v > 1 + 1e-6) return -1;
    return (e2x * qx + e2y * qy + e2z * qz) * inv;
  }

  function test(list, d) {
    for (let k = 0; k < list.length; k++) {
      const r = hit(list[k], d.x, d.y, d.z);
      if (r > 0) return r;
    }
    return -1;
  }

  // Ground height above R for unit direction d.
  return function groundHeight(d) {
    const la = Math.asin(Math.max(-1, Math.min(1, d.y))) / D2R;
    const lo = (Math.atan2(d.z, d.x) / D2R + 360) % 360;
    let r = -1;
    if (la > 81) r = test(polarN, d);
    else if (la < -81) r = test(polarS, d);
    if (r < 0) {
      const i = Math.min(NLAT - 1, Math.floor(((la + 90) / 180) * NLAT));
      const j = Math.floor((lo / 360) * NLON) % NLON;
      r = test(buckets[i * NLON + j], d);
    }
    return r > 0 ? r - R : height(d);
  };
}
