import { glslTiming } from './timing.js';
import { MOL_PORE, MOL_SINK } from './shapes/molecule.js';
import { SPINE } from './shapes/spine.js';
import { GLIA } from './shapes/glia.js';
import { HIPPO_STATIONS } from './shapes/hippocampus.js';

// Per-page animation, run in the vertex shader. Each function takes a
// particle's local position and its anim vec4 (x = part id), and returns the
// animated position plus a brightness multiplier in w. Timing constants come
// from timing.js so the sounds in main.js land on the same beats.

const v3 = (a) => `vec3(${a.map((x) => x.toFixed(3)).join(', ')})`;
const f = (x) => x.toFixed(4);

export const ANIM_GLSL = /* glsl */ `
${glslTiming()}
const vec3 MOL_PORE = ${v3(MOL_PORE)};
const vec3 MOL_SINK = ${v3(MOL_SINK)};
const float SP_R0 = ${f(SPINE.r0)};
const float SP_LEN = ${f(SPINE.len)};
const float SP_ANGLES = ${f(SPINE.angles)};
const float GL_U0 = ${f(GLIA.u0)};
const float GL_DU = ${f(GLIA.du)};
const float HS_EC = ${f(HIPPO_STATIONS[0])};
const float HS_DG = ${f(HIPPO_STATIONS[1])};
const float HS_CA3 = ${f(HIPPO_STATIONS[2])};
const float HS_CA1 = ${f(HIPPO_STATIONS[3])};
const vec3 HEART = vec3(0.32, 1.65, 0.45);
const float PI = 3.14159265;
const float TAU = 6.2831853;

mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float gp(float x, float w) { return exp(-x * x * w * w); }
float wrap1(float d) { return d - floor(d + 0.5); }

vec4 animHalo(vec3 p, vec4 a, float t) {
  p += vec3(sin(t * 0.21 + a.w * 31.0), sin(t * 0.17 + a.w * 17.0) * 0.8, cos(t * 0.19 + a.w * 23.0)) * 0.45;
  return vec4(p, 0.55 + 0.45 * sin(t * (0.6 + a.w) + a.w * 50.0));
}

// 0 · giant pyramidal neuron: AP from the soma down the axon, back-propagating into dendrites.
vec4 animHero(vec3 p, vec4 a, float t) {
  int part = int(a.x + 0.5);
  float tc = fract(t / T_heroAP) * T_heroAP;
  float d = a.y;
  vec3 sway = vec3(sin(t * 0.37 + a.z * 6.28), sin(t * 0.29 + a.z * 4.1) * 0.6, cos(t * 0.33 + a.z * 5.3)) * 0.14 * pow(d, 1.5);
  float b = 1.0;
  if (part == 0) {
    float e = exp(-tc * 4.0);
    p *= 1.0 + 0.06 * e;
    b = 1.0 + 1.6 * e;
  } else if (part == 1) {
    b = 0.8 + 1.7 * gp(d - tc * 0.8, 7.0) * (1.0 - 0.45 * d);
    p += sway;
  } else if (part == 2) {
    b = 0.85 + 2.6 * gp(d - tc * 1.05, 11.0);
    p += sway * 0.5;
  } else if (part == 3) {
    b = 0.7 + 1.8 * pow(0.5 + 0.5 * sin(t * (0.7 + a.w * 1.6) + a.w * 40.0), 12.0) + 1.1 * gp(d - tc * 0.8, 7.0);
    p += sway;
  } else if (part == 4) {
    b = 2.4 * exp(-fract(t * (0.22 + a.w * 0.25) + a.z * 7.0) * 8.0);
    p += sway;
  } else if (part == 5) {
    float tb = fract(t / (T_heroAP * 1.37) + a.z) * T_heroAP * 1.37;
    b = 0.55 + 1.1 * gp(d - tb * 0.7, 6.0);
    p += sway * 0.6;
  }
  return vec4(p, b);
}

// 1 · CaMKII: pore opens, Ca2+ floods in, phosphorylation sweeps the ring, phosphatase resets it.
vec4 animMolecule(vec3 p, vec4 a, float t) {
  int part = int(a.x + 0.5);
  float ph = fract(t / T_molCycle);
  float k = floor(a.z * 12.0 + 0.5);
  float s0 = T_molStart + k * T_molStep;
  float on = smoothstep(s0, s0 + 0.012, ph) * (1.0 - smoothstep(T_molReset, T_molReset + 0.06, ph));
  float flash = step(s0, ph) * exp(-(ph - s0) * T_molCycle * 3.0);
  float open = smoothstep(0.0, 0.02, ph) * (1.0 - smoothstep(0.28, 0.45, ph));
  vec3 radial = normalize(vec3(p.x, 0.0, p.z) + 1e-4);
  float b = 1.0;
  if (part == 0) {
    b = 0.9 + 0.25 * on;
  } else if (part == 1) {
    p += vec3(sin(t * 1.3 + a.z * 20.0 + a.y * 3.0), cos(t * 1.1 + a.z * 13.0), sin(t * 0.9 + a.z * 7.0 + a.y * 2.0)) * 0.07 * a.y;
    p += radial * 0.25 * on * a.y;
    b = 0.8 + 0.5 * on;
  } else if (part == 2 || part == 3) {
    p += radial * 0.3 * on;
    p += vec3(sin(t * 0.8 + a.z * 40.0), cos(t * 0.7 + a.z * 30.0), sin(t * 0.6 + a.z * 20.0)) * 0.05;
    b = part == 2 ? 0.7 + 0.9 * on + 1.4 * flash : 2.3 * on + 2.0 * flash;
  } else if (part == 4) {
    float ang = a.z + t * (0.35 / (0.4 + a.y * 0.25));
    p = vec3(cos(ang) * a.y, p.y + sin(t * 0.7 + a.w * 20.0) * 0.25, sin(ang) * a.y);
    float lag = smoothstep(0.02, 0.12, ph) * (1.0 - smoothstep(0.55, 0.85, ph));
    b = 0.22 + 1.4 * lag * (0.6 + 0.4 * sin(t * 6.0 + a.w * 40.0));
  } else if (part == 5) {
    p.xz = rot2(t * 0.12) * p.xz;
    p.y += sin(t * 0.5 + a.w * 6.28) * 0.3;
    b = 0.8 + 0.5 * open;
  } else if (part == 6) {
    float fl = fract(a.w + t * 0.55);
    vec3 top = MOL_PORE + vec3(0.0, 0.9, 0.0);
    vec3 mid = MOL_PORE - vec3(0.0, 0.6, 0.0);
    vec3 q = fl < 0.4 ? mix(top, mid, fl / 0.4) : mix(mid, MOL_SINK, (fl - 0.4) / 0.6);
    p = q + p * (0.6 + fl * 4.0);
    b = open * 1.8 * (1.0 - smoothstep(0.8, 1.0, fl));
  } else if (part == 7) {
    p.y += sin(p.x * 1.4 + t * 0.9) * 0.05 + sin(p.z * 1.7 + t * 0.7) * 0.04;
    b = 0.8;
  } else if (part == 8) {
    b = 0.9 + 0.9 * open;
  }
  return vec4(p, b);
}

// 2 · dendritic spines: potentiated heads swell in four staggered groups; filopodia probe.
float axisY(float x) { return 0.25 * sin(x * 0.35); }
vec4 animSpine(vec3 p, vec4 a, float t) {
  int part = int(a.x + 0.5);
  if (part == 0) {
    float c = mod(t * 1.7, 16.0) - 8.0;
    return vec4(p, 0.85 + 0.7 * gp(p.x - c, 0.9));
  }
  if (part == 4) {
    float ly = p.y - axisY(p.x);
    float nx = mod(p.x + t * 0.12 + SP_LEN, 2.0 * SP_LEN) - SP_LEN;
    return vec4(nx, ly + axisY(nx), p.z, 0.85);
  }
  if (part == 6) {
    float c = fract(t * 0.32 + a.z * 0.37);
    return vec4(p, 0.55 + 1.6 * gp(a.y - c, 12.0));
  }
  float xb = a.z;
  float h = hash11(xb * 7.13 + 3.1);
  float pot = step(0.45, h);
  float grp = floor(hash11(xb * 3.71 + 1.7) * 4.0);
  float ph = fract(t / T_spineCycle - grp * 0.25);
  float env = smoothstep(0.0, 0.08, ph) * (1.0 - smoothstep(0.45, 0.9, ph)) * pot;
  float ayb = axisY(xb);
  vec2 q = vec2(p.y - ayb, p.z);
  float r = length(q);
  float b = 1.0;
  if (part == 1) {
    q *= (SP_R0 + (r - SP_R0) * (1.0 + 0.16 * env)) / max(r, 1e-3);
    b = 0.9 + 0.6 * env;
  } else if (part == 3) {
    float L = 0.3 + 0.7 * (0.5 + 0.5 * sin(t * 0.45 + h * 40.0));
    q *= (SP_R0 + (r - SP_R0) * L) / max(r, 1e-3);
    b = 0.35 + 0.65 * L;
  } else {
    float st = TAU / SP_ANGLES;
    float ths = floor(atan(q.y, q.x) / st + 0.5) * st;
    vec2 dir = vec2(cos(ths), sin(ths));
    float g = 1.0 + 0.5 * env;
    float rc = a.y;
    float rc2 = SP_R0 + (rc - SP_R0) * (1.0 + 0.16 * env);
    float al = dot(q, dir);
    vec2 pv = q - dir * al;
    q = dir * (rc2 + (al - rc) * g) + pv * g;
    p.x = xb + (p.x - xb) * g;
    if (part == 2) b = 0.95 + 0.9 * env;
    else if (part == 5) b = 2.3 * env * (0.7 + 0.3 * sin(t * 9.0 + a.w * 30.0));
    else b = 2.2 * exp(-ph * 12.0) * pot;
  }
  p.y = ayb + q.x;
  p.z = q.y;
  return vec4(p, b);
}

// 3 · neuron + glia: saltatory conduction node to node; astrocyte Ca2+ wave; motile microglia.
vec4 animGlia(vec3 p, vec4 a, float t) {
  int part = int(a.x + 0.5);
  float ph = fract(t / T_gliaAP);
  float b = 1.0;
  if (part == 0) {
    b = 0.85 + 1.4 * gp(a.y - ph * T_gliaAP * 0.9, 6.0) * (1.0 - 0.4 * a.y);
    p += vec3(sin(t * 0.4 + a.z * 6.0), cos(t * 0.33 + a.z * 4.0), sin(t * 0.3 + a.z * 5.0)) * 0.05 * a.y;
  } else if (part == 2 || part == 3) {
    float pa = fract(ph - a.z * 0.5);
    float k = floor(pa / 0.6 * T_gliaNodes);
    float uk = GL_U0 + k * GL_DU;
    float live = step(pa, 0.6);
    if (part == 2) b = 0.7 + 2.6 * gp(a.y - uk, 28.0) * live + 0.9 * gp(a.y, 14.0) * exp(-pa * 18.0);
    else b = 0.85 + 0.5 * gp(a.y - uk, 9.0) * live;
  } else if (part == 1) {
    float w = fract(t / T_gliaWave) * 1.7;
    b = 0.75 + 1.5 * gp(a.y - w, 5.0);
    p += vec3(sin(t * 0.5 + a.z * 9.0), cos(t * 0.4 + a.z * 7.0), sin(t * 0.45 + a.z * 5.0)) * 0.05 * a.y;
  } else if (part == 4) {
    b = 0.9;
  } else if (part == 5) {
    p += vec3(sin(t * 0.8 + a.z * 30.0), cos(t * 0.6 + a.z * 20.0), sin(t * 0.7 + a.z * 10.0)) * 0.22 * a.y * a.y;
    b = 0.85 + 0.25 * sin(t * 1.3 + a.z * 10.0);
  } else if (part == 6) {
    b = 0.6 + 0.35 * sin(a.y * 26.0 - t * 3.0);
  }
  return vec4(p, b);
}

// 4 · synapse: baseline release → tetanus → Ca2+ → AMPA insertion → decay.
vec4 animSynapse(vec3 p, vec4 a, float t) {
  int part = int(a.x + 0.5);
  float ph = fract(t / T_synCycle);
  float burst = smoothstep(T_synBurst0 - 0.01, T_synBurst0 + 0.01, ph) * (1.0 - smoothstep(T_synBurst1 - 0.01, T_synBurst1 + 0.01, ph));
  float pot = smoothstep(T_synBurst1 - 0.02, T_synBurst1 + 0.1, ph) * (1.0 - smoothstep(0.8, 0.98, ph));
  float rel = exp(-ph * 25.0) + step(0.06, ph) * exp(-(ph - 0.06) * 25.0);
  // Warped time: vesicles cycle five times faster during the burst.
  float bw = T_synBurst1 - T_synBurst0;
  float W = t + 4.0 * T_synCycle * (floor(t / T_synCycle) * bw + clamp(ph - T_synBurst0, 0.0, bw));
  float b = 1.0;
  if (part == 0) {
    b = 1.0 + 0.3 * burst;
  } else if (part == 1) {
    if (a.y < 1.8) {
      float v = fract(W / 3.2 + a.z);
      if (v < 0.42) {
        p.y -= (a.y - 0.66) * smoothstep(0.0, 0.3, v);
        float fuse = smoothstep(0.3, 0.42, v);
        p.y = mix(p.y, 0.48, fuse * 0.5);
        b = 1.0 - fuse;
      } else {
        b = smoothstep(0.6, 0.9, v);
      }
    } else {
      p += vec3(sin(t * 0.5 + a.z * 30.0), cos(t * 0.4 + a.z * 20.0), 0.0) * 0.04;
      b = 0.9;
    }
  } else if (part == 2) {
    float g = fract(W * 0.9 + a.w);
    p.y = 0.42 - g * 0.5;
    p.xz *= 1.0 + g * 0.5;
    b = (0.12 + 2.0 * burst + 1.0 * rel) * sin(PI * g);
  } else if (part == 3) {
    b = 0.95 + 0.35 * pot;
  } else if (part == 4) {
    b = 0.85 + 1.0 * pot + 0.4 * burst;
  } else if (part == 5) {
    b = 0.9 + 0.7 * pot + 1.2 * burst * (0.5 + 0.5 * sin(t * 25.0 + a.z * 40.0));
  } else if (part == 6) {
    p.y -= a.y * (1.0 - pot);
    b = 0.2 + 1.5 * pot;
  } else if (part == 7) {
    p += vec3(sin(t * 3.0 + a.w * 90.0), cos(t * 2.6 + a.w * 70.0), sin(t * 2.2 + a.w * 50.0)) * 0.08;
    b = 2.2 * burst * (0.6 + 0.4 * sin(t * 18.0 + a.w * 50.0)) + 0.6 * pot * exp(-max(ph - T_synBurst1, 0.0) * 10.0);
  } else if (part == 8) {
    p.x += sin(t * 0.6 + a.y * 2.0) * 0.05;
    b = 0.75 + 0.7 * smoothstep(0.2, 0.36, ph) * (1.0 - smoothstep(0.5, 0.75, ph));
  }
  return vec4(p, b);
}

// 5 · engram: sparse background firing; the ensemble lights up together on recall.
vec4 animEngram(vec3 p, vec4 a, float t) {
  int part = int(a.x + 0.5);
  float tc = fract(t / T_engram) * T_engram;
  float env = exp(-tc * 2.2);
  float b = 1.0;
  if (part == 0) {
    float sp = pow(max(0.0, sin(t * (0.5 + a.z * 1.3) + a.z * 60.0)), 50.0);
    b = 0.5 + 1.8 * sp * (1.0 - a.y * 0.5);
  } else if (part == 1) {
    b = 0.8 + 2.6 * env * (1.0 - 0.35 * a.y) + 0.15 * sin(t * 1.3 + a.z * 6.0);
  } else if (part == 2) {
    b = 0.1 + 0.7 * env + 2.2 * env * gp(a.y - min(tc * 1.6, 1.4), 6.0);
  } else if (part == 3) {
    float inh = step(0.3, tc) * exp(-max(tc - 0.3, 0.0) * 3.0);
    float sp = pow(max(0.0, sin(t * (0.9 + a.z * 1.5) + a.z * 40.0)), 40.0);
    b = 0.55 + 1.7 * inh + 1.2 * sp;
  } else if (part == 4) {
    b = 0.35 + 0.25 * sin(t * 0.8 + a.z * 20.0 + a.y * 6.0);
  } else if (part == 5) {
    b = 0.55;
  }
  return vec4(p, b);
}

// 6 · hippocampus: trisynaptic loop, theta breathing, sharp-wave ripples, newborn cells.
vec4 animHippo(vec3 p, vec4 a, float t) {
  int part = int(a.x + 0.5);
  float c = fract(t / T_hippoLoop);
  float theta = 0.9 + 0.1 * sin(t * TAU * 0.75);
  float sw = fract(t / T_hippoSWR) * T_hippoSWR;
  float b = 1.0;
  if (part == 0) {
    float front = 0.95 - sw * 1.4;
    float swr = gp(a.y - front, 6.0) * exp(-sw * 1.2) * step(sw, 0.8);
    float hit = 0.6 * gp(wrap1(c - HS_CA3), 10.0) * step(0.6, a.y) + 0.6 * gp(wrap1(c - HS_CA1), 10.0) * step(a.y, 0.45);
    b = theta * (0.9 + 1.8 * swr + hit);
  } else if (part == 1) {
    b = theta * (0.95 + 0.6 * gp(wrap1(c - HS_DG), 10.0));
  } else if (part == 2) {
    b = 0.12 + 2.6 * gp(wrap1(a.y - c), 16.0);
  } else if (part == 3) {
    b = 0.25 + 1.8 * pow(0.5 + 0.5 * sin(t * 0.8 + a.z * 40.0), 6.0);
  } else if (part == 4) {
    b = theta * (0.85 + 0.6 * gp(wrap1(c - HS_EC), 10.0));
  } else if (part == 5) {
    b = 0.7;
  }
  return vec4(p, b);
}

// 7 · cortico-basal ganglia loop + the four modulatory systems, firing in turn.
vec4 animCircuit(vec3 p, vec4 a, float t) {
  int part = int(a.x + 0.5);
  float c = fract(t / T_loop);
  float b = 1.0;
  if (part == 0) {
    b = 0.55;
  } else if (part <= 3) {
    float hit = a.y < -0.5 ? 0.0 : gp(wrap1(c - a.y), 9.0);
    b = 0.8 + 1.4 * hit;
    if (part == 2) {
      float pm = fract(t / T_daBurst);
      b += 0.6 * smoothstep(0.08, 0.2, pm) * (1.0 - smoothstep(0.25, 0.5, pm));
    }
  } else if (part == 5) {
    b = 0.3 + 2.2 * gp(wrap1(a.y - c), 14.0);
  } else {
    float pm = fract(t / T_daBurst - a.z * 0.25);
    if (part == 6) {
      b = 0.8 + 1.8 * exp(-pm * 9.0);
    } else if (part == 7) {
      b = 0.45 + 2.0 * gp(a.y - pm * 1.6, 6.0);
    } else {
      float cl = smoothstep(0.12, 0.35, pm) * (1.0 - smoothstep(0.4, 0.95, pm));
      p += vec3(sin(t * 0.5 + a.w * 30.0), cos(t * 0.4 + a.w * 20.0), sin(t * 0.45 + a.w * 10.0)) * 0.25 * (0.3 + cl);
      b = 0.2 + 1.6 * cl;
    }
  }
  return vec4(p, b);
}

// 8 · white matter: packets of activity travel along every streamline.
vec4 animTracts(vec3 p, vec4 a, float t) {
  if (int(a.x + 0.5) == 1) return vec4(p, 0.5);
  float c = fract(t * (0.16 + a.z * 0.14) + a.z * 7.0);
  return vec4(p, 0.5 + 1.7 * gp(a.y - c, 13.0) + 0.15 * sin(t * 2.0 + a.y * 30.0 + a.z * 50.0));
}

// 9 · large-scale networks: DMN → (SN) → CEN → (SN) → DMN, anticorrelated.
vec4 animNetworks(vec3 p, vec4 a, float t) {
  int part = int(a.x + 0.5);
  if (part == 0) return vec4(p, 0.55);
  float ph = fract(t / T_netCycle);
  float dmn = 1.0 - smoothstep(0.36, 0.46, ph) + smoothstep(0.9, 0.98, ph);
  float cen = smoothstep(0.42, 0.5, ph) * (1.0 - smoothstep(0.86, 0.94, ph));
  float sn = gp(ph - 0.43, 25.0) + gp(ph - 0.93, 25.0);
  int net = int(a.z + 0.5);
  float act = net == 0 ? dmn : net == 1 ? 0.2 + 1.3 * sn : cen;
  if (part == 1) return vec4(p, 0.3 + 1.6 * act);
  return vec4(p, 0.08 + act * (0.45 + 1.8 * gp(a.y - fract(t * 0.55 + a.w), 9.0)));
}

// 10 · whole brain: a slow wave sweeps front to back; sparks fire.
vec4 animBrain(vec3 p, vec4 a, float t) {
  int part = int(a.x + 0.5);
  float front = 4.6 - fract(t / T_brainWave) * 9.6;
  float b = 1.0;
  if (part == 0) {
    b = 0.55 + 0.6 * a.y + 1.1 * gp(p.x - front, 0.8) * (0.5 + 0.5 * a.y);
    p *= 1.0 + 0.008 * sin(t * 0.8);
  } else if (part == 1) {
    b = 0.75 + 0.35 * a.y + 0.6 * gp(p.x - front, 0.8);
  } else if (part == 2) {
    b = 0.8 + 1.1 * gp(a.y - fract(t * 0.35), 8.0);
  } else if (part == 3) {
    b = 2.6 * pow(max(0.0, sin(t * (0.6 + a.z * 2.0) + a.z * 90.0)), 40.0);
  }
  return vec4(p, b);
}

// 11 · brain–body–environment: heartbeat, vagal traffic, breathing, HPA axis.
vec4 animBody(vec3 p, vec4 a, float t) {
  int part = int(a.x + 0.5);
  float hb = fract(t / T_heart) * T_heart;
  float beat = exp(-hb * 9.0) + 0.6 * step(0.28, hb) * exp(-max(hb - 0.28, 0.0) * 10.0);
  float hp = fract(t / T_hpa);
  float b = 1.0;
  if (part == 0) {
    b = 0.85 + 0.2 * sin(t * 0.9 + p.x * 3.0) + 0.7 * gp(hp - 0.93, 14.0);
  } else if (part == 1) {
    b = 0.9 + 1.4 * gp(a.y - fract(t * 0.45), 9.0);
  } else if (part == 2) {
    b = 0.7 + 1.5 * gp(a.y - fract(t * 0.3 + a.z * 0.5) * 1.3, 7.0);
  } else if (part == 3) {
    b = 0.8 + 1.6 * gp(a.y - (1.0 - fract(t * 0.5)), 9.0) + 0.6 * beat * gp(a.y - 0.45, 6.0);
  } else if (part == 4) {
    p = HEART + (p - HEART) * (1.0 + 0.12 * beat);
    b = 0.9 + 1.2 * beat;
  } else if (part == 5) {
    b = 0.75 + 0.5 * sin(a.y * 40.0 - t * 2.0);
  } else if (part == 6) {
    p.xz *= 1.0 + 0.015 * sin(t * TAU / 4.8) * step(-0.6, p.y) * step(p.y, 3.2);
    b = 0.55;
  } else if (part == 7) {
    b = a.y > 0.9 ? 0.5 + 0.3 * sin(t + a.z * 10.0) : 0.35 + 0.8 * gp(a.y - fract(t * 0.12) * 1.2, 5.0);
  } else if (part == 8) {
    b = 0.35 + 2.0 * gp(a.y - hp, 10.0);
  }
  return vec4(p, b);
}

// 12 · unfolded cortical sheet rolling with slow waves.
vec4 animOutro(vec3 p, vec4 a, float t) {
  float h = 0.5 * sin(p.x * 0.42 + t * 0.6) + 0.35 * sin(p.z * 0.55 + t * 0.5 + p.x * 0.2) + 0.15 * sin((p.x + p.z) * 1.1 - t * 1.2);
  p.y += h;
  float b = 0.55 + 0.9 * smoothstep(-0.3, 1.0, h);
  if (int(a.x + 0.5) == 1) b *= 1.1 + a.y * 0.4 + 1.2 * pow(max(0.0, sin(t * (0.5 + a.z) + a.z * 70.0)), 30.0);
  return vec4(p, b);
}

vec4 animate(float type, vec3 p, vec4 a, float t) {
  if (a.x > 8.5 && a.x < 9.5) return animHalo(p, a, t);
  int ty = int(type + 0.5);
  if (ty == 0) return animHero(p, a, t);
  if (ty == 1) return animMolecule(p, a, t);
  if (ty == 2) return animSpine(p, a, t);
  if (ty == 3) return animGlia(p, a, t);
  if (ty == 4) return animSynapse(p, a, t);
  if (ty == 5) return animEngram(p, a, t);
  if (ty == 6) return animHippo(p, a, t);
  if (ty == 7) return animCircuit(p, a, t);
  if (ty == 8) return animTracts(p, a, t);
  if (ty == 9) return animNetworks(p, a, t);
  if (ty == 10) return animBrain(p, a, t);
  if (ty == 11) return animBody(p, a, t);
  return animOutro(p, a, t);
}
`;
