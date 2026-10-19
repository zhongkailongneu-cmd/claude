// Brain assets -> three.js objects, with per-area / per-structure visual state.
// All colours come from the Loyel gradient-blue palette (see PAL); lighting is white, so shading only
// scales those colours.
import * as THREE from 'three';

export const PAL = {
  c10: '#F4F7FB', c20: '#E8EEF6', c30: '#CCDBEB', c40: '#9FBDDA', c50: '#6C9AC4',
  c60: '#497DAE', c70: '#376392', c80: '#2E5076', c90: '#2B4868', c100: '#263B54',
};

const BLEND = {
  transparent: true,
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.OneFactor,
  blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
};

// ---------------------------------------------------------------------------------------------- shaders

const CORTEX_VERT = /* glsl */`
attribute float aDepth;
attribute vec4 aW0; attribute vec4 aW1; attribute vec4 aW2; attribute vec4 aW3;
varying vec3 vN; varying vec3 vV; varying vec3 vW;
varying float vDepth;
varying vec4 vW0; varying vec4 vW1; varying vec4 vW2; varying vec4 vW3;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  vW = (modelMatrix * vec4(position, 1.0)).xyz;
  vDepth = aDepth; vW0 = aW0; vW1 = aW1; vW2 = aW2; vW3 = aW3;
  gl_Position = projectionMatrix * mv;
}`;

const CORTEX_FRAG = /* glsl */`
uniform float uClipX; uniform float uCutOn; uniform float uTime; uniform float uPulse; uniform float uOpacity;
uniform float uOutline;
uniform vec3 uSulcCol; uniform vec3 uRimCol; uniform vec3 uHiCol;
uniform vec3 uTint[16]; uniform vec3 uSt[16];   // per atom: tint rgb | glow, alpha, solidness
varying vec3 vN; varying vec3 vV; varying vec3 vW;
varying float vDepth;
varying vec4 vW0; varying vec4 vW1; varying vec4 vW2; varying vec4 vW3;
void main() {
  if (vW.x > uClipX) discard;
  vec3 N = normalize(vN);
  bool front = gl_FrontFacing;
  if (!front) N = -N;
  vec3 V = normalize(vV);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 2.2);
  float cut = uCutOn * (1.0 - smoothstep(0.0, 1.6, uClipX - vW.x));   // bright band at the cut plane

  // smooth atom weights -> sharpened -> blended state (smooth, curved region borders)
  float w[16];
  w[0]=vW0.x; w[1]=vW0.y; w[2]=vW0.z; w[3]=vW0.w; w[4]=vW1.x; w[5]=vW1.y; w[6]=vW1.z; w[7]=vW1.w;
  w[8]=vW2.x; w[9]=vW2.y; w[10]=vW2.z; w[11]=vW2.w; w[12]=vW3.x; w[13]=vW3.y; w[14]=vW3.z; w[15]=vW3.w;
  float tot = 1e-5, mx = 0.0;
  vec3 tint = vec3(0.0); vec3 st = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    float wi = max(w[i], 0.0); wi *= wi; wi = wi * wi * wi;   // sharpen: w^6 (cheap multiplies instead of pow)
    w[i] = wi;
    tot += wi; mx = max(mx, wi);
    tint += wi * uTint[i]; st += wi * uSt[i];
  }
  float inv = 1.0 / tot;
  tint *= inv; st *= inv;
  float maxn = mx * inv;
  float tdiff = 0.0;
  for (int i = 0; i < 16; i++) tdiff += w[i] * inv * (length(uTint[i] - tint) + 0.25 * abs(uSt[i].x - st.x));
  float line = (1.0 - smoothstep(0.50, 0.70, maxn)) * smoothstep(0.015, 0.07, tdiff) * uOutline;
  float glow = st.x;

  vec3 Lk = normalize(vec3(-0.45, 0.55, 0.70));
  vec3 Lf = normalize(vec3(0.60, -0.30, 0.50));
  float wrap = max(dot(N, Lk), 0.0) * 0.86 + max(dot(N, Lf), 0.0) * 0.20 + 0.14;
  vec3 base = mix(tint, uSulcCol, vDepth * 0.68);
  vec3 Hh = normalize(Lk + V);
  float spec = pow(max(dot(N, Hh), 0.0), 38.0) * 0.16 * (1.0 - vDepth);
  vec3 solid = base * wrap + uRimCol * fres * 0.55 + uHiCol * glow * (0.30 + 0.70 * wrap) + uHiCol * line * 0.55 + uHiCol * spec;
  if (!front) solid = uSulcCol * 0.55;

  float scan = 0.5 + 0.5 * sin(vW.y * 0.55 - uTime * 2.4);
  vec3 holo = uRimCol * (fres * 0.72 + 0.03 + 0.05 * vDepth) * (0.85 + 0.15 * scan)
            + tint * 0.045 + uHiCol * glow * (0.35 + 0.65 * fres + 0.2 * wrap) + uHiCol * line * 0.4;

  float sol = front ? st.z : 0.0;   // back faces only contribute to the hologram
  vec3 col = mix(holo, solid, sol) * st.y * uOpacity;
  col += uHiCol * cut * 0.9 * uOpacity;
  col *= 1.0 + uPulse * 0.18;
  float a = sol * st.y * uOpacity;
  gl_FragColor = vec4(col, a);
}`;

const SOLID_VERT = /* glsl */`
attribute float aPhase;
attribute float aFade;
varying vec3 vN; varying vec3 vV; varying vec3 vW; varying float vPhase; varying float vFade;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  vW = (modelMatrix * vec4(position, 1.0)).xyz;
  vPhase = aPhase; vFade = aFade;
  gl_Position = projectionMatrix * mv;
}`;

const SOLID_FRAG = /* glsl */`
uniform float uClipX; uniform float uClipOn; uniform float uTime; uniform float uPulse;
uniform float uFocus; uniform float uGlow; uniform float uAlpha; uniform float uBump;
uniform vec3 uColor; uniform vec3 uRimCol; uniform vec3 uHiCol;
varying vec3 vN; varying vec3 vV; varying vec3 vW; varying float vPhase; varying float vFade;
void main() {
  if (uClipOn > 0.5 && vW.x > uClipX) discard;
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  float fold = 0.5;
  if (uBump > 0.0) {
    // cerebellar folia: parallel arcs (level sets of a distance field in the y-z plane), bump-mapped analytically.
    // MNI coords from the three.js world position: x = w.x, y = -w.z, z = w.y
    float x = vW.x, y = -vW.z, z = vW.y;
    float dy = y + 8.0, dz = z - 18.0;
    float R0 = sqrt(dy * dy + dz * dz) + 1e-3;
    float wp = 0.09 * x + 0.05 * y;
    float r = R0 + 2.2 * sin(wp);
    float k = 6.2831853 / 2.9;
    float ph = r * k;
    fold = 0.5 + 0.5 * sin(ph);
    float c = cos(ph) * k;
    vec3 gMni = vec3(2.2 * 0.09 * cos(wp), dy / R0 + 2.2 * 0.05 * cos(wp), dz / R0);
    vec3 gW = vec3(gMni.x, gMni.z, -gMni.y) * c;
    vec3 gV = (viewMatrix * vec4(gW, 0.0)).xyz;
    gV -= N * dot(gV, N);
    N = normalize(N - uBump * 0.085 * gV);
  }
  vec3 V = normalize(vV);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 2.0);
  vec3 Lk = normalize(vec3(-0.45, 0.55, 0.70));
  vec3 Lf = normalize(vec3(0.60, -0.30, 0.50));
  float wrap = max(dot(N, Lk), 0.0) * 0.72 + max(dot(N, Lf), 0.0) * 0.22 + 0.22;
  vec3 base = uColor * mix(1.0, 0.74 + 0.26 * fold, uBump);
  vec3 Hh = normalize(Lk + V);
  float spec = pow(max(dot(N, Hh), 0.0), 34.0) * 0.10;
  vec3 solid = base * wrap + uRimCol * fres * 0.34 + uHiCol * uGlow * (0.30 + 0.70 * wrap) + uHiCol * spec;
  float scan = 0.5 + 0.5 * sin(vW.y * 0.55 - uTime * 2.4);
  vec3 holo = uRimCol * (fres * 0.95 + 0.05) * (0.85 + 0.15 * scan) + uHiCol * uGlow * 0.5 * (0.4 + fres);
  float f = vFade * uAlpha;
  vec3 col = mix(holo, solid, uFocus) * f;
  col *= 1.0 + uPulse * 0.22 * uFocus;
  gl_FragColor = vec4(col, uFocus * f);
}`;

// ---------------------------------------------------------------------------------------------- loader

function view(buf, item) {
  const T = { float32: Float32Array, uint32: Uint32Array, uint8: Uint8Array }[item.dtype];
  return new T(buf, item.offset, item.count);
}

export async function loadBrain(base) {
  const meta = await (await fetch(`${base}/brain.json`)).json();
  const buf = await (await fetch(`${base}/brain.bin`)).arrayBuffer();
  const B = (name) => view(buf, meta.buffers[name]);
  const areaId = new Map(meta.areas.map((n, i) => [n, i]));

  const col = (hex) => new THREE.Color(hex);
  const uCommon = () => ({
    uClipX: { value: 1e4 }, uTime: { value: 0 }, uPulse: { value: 0 },
    uRimCol: { value: col(PAL.c40) }, uHiCol: { value: col(PAL.c10) },
  });

  const root = new THREE.Group();
  const out = { root, meta, areaId, hemis: {}, structs: {}, uniforms: [] };

  // ---------------- cortex
  const atoms = meta.atoms;
  const atomIndex = Object.fromEntries(atoms.map((n, i) => [n, i]));
  const tintArr = Array.from({ length: 16 }, () => new THREE.Vector3(0.1, 0.2, 0.3));
  const stArr = Array.from({ length: 16 }, () => new THREE.Vector3(0, 1, 0));
  out.atoms = atoms; out.atomIndex = atomIndex;

  for (const side of ['L', 'R']) {
    const g = new THREE.BufferGeometry();
    const pos = B(`cortex${side}.position`);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(B(`cortex${side}.normal`), 3));
    g.setAttribute('aDepth', new THREE.BufferAttribute(B(`cortex${side}.depth`), 1));
    const nv = pos.length / 3;
    const w16 = B(`cortex${side}.atomw`);
    for (let k = 0; k < 4; k++) {
      const arr = new Uint8Array(nv * 4);
      for (let i = 0; i < nv; i++) for (let c = 0; c < 4; c++) arr[i * 4 + c] = w16[i * 16 + k * 4 + c];
      g.setAttribute(`aW${k}`, new THREE.BufferAttribute(arr, 4, true));
    }
    g.setIndex(new THREE.BufferAttribute(B(`cortex${side}.index`), 1));
    g.computeBoundingSphere();
    const mat = new THREE.ShaderMaterial({
      ...BLEND, vertexShader: CORTEX_VERT, fragmentShader: CORTEX_FRAG, side: THREE.DoubleSide, depthWrite: false,
      uniforms: {
        ...uCommon(), uOpacity: { value: 1 }, uSulcCol: { value: col(PAL.c90) }, uCutOn: { value: 0 },
        uOutline: { value: 0 }, uTint: { value: tintArr }, uSt: { value: stArr },
      },
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.renderOrder = 5;
    mesh.frustumCulled = false;
    root.add(mesh);
    out.uniforms.push(mat.uniforms);
    out.hemis[side] = { mesh, mat, area: B(`cortex${side}.area`), geo: g, centroids: meta.cortex[side].centroids };
  }

  // atom state: tint colour, glow, alpha, solidness (0 = hologram, 1 = solid)
  out.setAtom = (name, hex, glow = 0, alpha = 1, solid = 0) => {
    const i = atomIndex[name];
    const c = new THREE.Color(hex);
    tintArr[i].set(c.r, c.g, c.b);
    stArr[i].set(glow, alpha, solid);
  };
  out.setAtomRaw = (i, r, g, b, glow, alpha, solid) => { tintArr[i].set(r, g, b); stArr[i].set(glow, alpha, solid); };
  out.setAllAtoms = (hex, glow = 0, alpha = 1, solid = 0) => { for (const n of atoms) out.setAtom(n, hex, glow, alpha, solid); };
  out.setAtomsSolidFloor = (solidGlobal) => {
    for (let i = 0; i < atoms.length; i++) stArr[i].z = Math.max(stArr[i].z, solidGlobal);
    for (const side of ['L', 'R']) {
      const h = out.hemis[side];
      h.mat.depthWrite = solidGlobal > 0.5;
      h.mat.side = solidGlobal > 0.5 ? THREE.FrontSide : THREE.DoubleSide;
    }
  };

  // ---------------- deep structures
  const group = (name, color, opts = {}) => {
    const names = opts.names || [name];
    const members = [];
    for (const nm of names) {
      if (!meta.meshes[nm]) continue;
      const g = new THREE.BufferGeometry();
      const pos = B(`${nm}.position`);
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(B(`${nm}.normal`), 3));
      const nv = pos.length / 3;
      g.setAttribute('aPhase', new THREE.BufferAttribute(meta.buffers[`${nm}.phase`] ? B(`${nm}.phase`) : new Float32Array(nv), 1));
      g.setAttribute('aFade', new THREE.BufferAttribute(meta.buffers[`${nm}.fade`] ? B(`${nm}.fade`) : new Float32Array(nv).fill(1), 1));
      g.setIndex(new THREE.BufferAttribute(B(`${nm}.index`), 1));
      g.computeBoundingSphere();
      const mat = new THREE.ShaderMaterial({
        ...BLEND, vertexShader: SOLID_VERT, fragmentShader: SOLID_FRAG, side: THREE.DoubleSide, depthWrite: false,
        uniforms: {
          ...uCommon(), uClipOn: { value: nm.endsWith('R') ? 1 : 0 }, uFocus: { value: 0 }, uGlow: { value: 0 },
          uAlpha: { value: 1 }, uBump: { value: opts.bump || 0 }, uColor: { value: col(color) },
        },
      });
      const mesh = new THREE.Mesh(g, mat);
      mesh.renderOrder = 2;
      mesh.frustumCulled = false;
      root.add(mesh);
      out.uniforms.push(mat.uniforms);
      members.push({ name: nm, mesh, mat });
    }
    const s = { name, members, state: { focus: 0, glow: 0, alpha: 1 }, color: new THREE.Color(color) };
    out.structs[name] = s;
    return s;
  };
  group('brainstem', PAL.c70);
  group('cerebellum', PAL.c60, { bump: 1 });
  group('thalamus', PAL.c60, { names: ['thalamusL', 'thalamusR'] });
  group('hypothalamus', PAL.c60);
  group('caudate', PAL.c60, { names: ['caudateL', 'caudateR'] });
  group('putamen', PAL.c60, { names: ['putamenL', 'putamenR'] });
  group('pallidum', PAL.c60, { names: ['pallidumL', 'pallidumR'] });
  group('accumbens', PAL.c60, { names: ['accumbensL', 'accumbensR'] });
  group('hippocampus', PAL.c60, { names: ['hippocampusL', 'hippocampusR'] });
  group('amygdala', PAL.c60, { names: ['amygdalaL', 'amygdalaR'] });
  group('corpusCallosum', PAL.c60);

  out.flushStructs = (rhOn = true) => {
    for (const s of Object.values(out.structs)) {
      for (const m of s.members) {
        const u = m.mat.uniforms;
        u.uFocus.value = s.state.focus;
        u.uGlow.value = s.state.glow;
        u.uAlpha.value = s.state.alpha;
        u.uColor.value.copy(s.color);
        m.mat.depthWrite = s.state.focus > 0.55;
        m.mesh.visible = s.state.alpha > 0.002 && (rhOn || !m.name.endsWith('R'));
      }
    }
  };

  out.setCommon = (clipX, time, pulse, opacity = 1, cutOn = 0, outline = 0) => {
    for (const u of out.uniforms) {
      u.uClipX.value = clipX; u.uTime.value = time; u.uPulse.value = pulse;
      if (u.uOpacity) { u.uOpacity.value = opacity; u.uCutOn.value = cutOn; u.uOutline.value = outline; }
    }
  };

  // centroid (three coords) of a list of Glasser area names, both hemispheres or one side
  out.centroid = (names, side = 'L') => {
    const c = new THREE.Vector3(); let n = 0;
    for (const nm of names) {
      const id = areaId.get(nm);
      const p = id && out.hemis[side].centroids[id];
      if (p) { c.x += p[0]; c.y += p[1]; c.z += p[2]; n++; }
    }
    return n ? c.multiplyScalar(1 / n) : c;
  };
  // vertex of the given areas (left hemisphere) closest to their mean: a point on the visible surface
  out.surfaceAnchor = (names, side = 'L') => {
    const ids = new Set(names.map((n) => areaId.get(n)).filter(Boolean));
    const h = out.hemis[side];
    const pos = h.geo.attributes.position.array;
    const c = out.centroid(names, side);
    let best = -1, bd = 1e9;
    for (let i = 0; i < h.area.length; i++) {
      if (!ids.has(h.area[i])) continue;
      const dx = pos[i * 3] - c.x, dy = pos[i * 3 + 1] - c.y, dz = pos[i * 3 + 2] - c.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    return new THREE.Vector3(pos[best * 3], pos[best * 3 + 1], pos[best * 3 + 2]);
  };
  out.structCentroid = (name) => {
    const s = out.structs[name]; const c = new THREE.Vector3(); let n = 0;
    for (const m of s.members) {
      if (m.name.endsWith('R')) continue;
      const p = meta.meshes[m.name].centroid; c.x += p[0]; c.y += p[1]; c.z += p[2]; n++;
    }
    return c.multiplyScalar(1 / Math.max(n, 1));
  };
  return out;
}
