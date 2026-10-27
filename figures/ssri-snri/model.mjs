// The reuptake bench as a pure model: one lane is one synapse (a tray, a release port, six transporters, five
// receptor cups and one autoreceptor cup). Every rate here is illustrative (registered as level S in build.mjs);
// only the drug occupancy follows registered numbers: p = C / (C + Ki).
// The build imports it to measure the drug-free baseline; the page inlines the same source to run it live.

export function mulberry32(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const RATES = {
  release: 1.0, // release events per second at full throttle
  quantaN: 4, // release sites per event; each fires with quantaP, so an event can release nothing
  quantaP: 0.55,
  diffusion: 150, // world units² per second
  wedgeDiffusion: 70,
  capture: 25, // per second while a ball sits in an open transporter's mouth
  mouth: 7.5, // radius of that mouth zone
  leak: 0.035, // per second per ball: diffusion out of the cleft and other clearance
  turn: 0.32, // seconds per quarter turn of a transporter
  hold: 0.16, // seconds in the occluded state
  bindReceptor: 6, // per second while a ball sits over a free cup
  receptorDwell: 0.7, // mean seconds a ball stays in a cup
  autoDwell: 0.5,
  koff: 0.32, // per second: drug leaves its transporter (dwell about 3 s)
  dock: 70, // world units per second while a wedge travels to a transporter
  autoTau: 2.5, // seconds: the autoreceptor signal is a running average of its cup
  countTau: 9, // seconds: running average of the balls in the cleft
  receptorTau: 1.6,
  maxBalls: 70,
};

const TAU = Math.PI * 2;
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// geo: { x0, x1, wallY, frontY, floor, r, R, rotors: [x…], cy, nozzle: x, mouthZ, cups: [[x, y]…], auto: [x, y],
//        cupTop, spout: [x, y, z] }
export function createLane(geo, seed, rates = RATES) {
  const rand = mulberry32(seed);
  const randn = () => {
    let u = 0;
    while (u === 0) u = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rand());
  };
  const ballZ = geo.floor + geo.r;
  const yMin = geo.cy + geo.R + geo.r + 0.6;
  const bounds = { x0: geo.x0 + 3 + geo.r, x1: geo.x1 - 3 - geo.r, y0: yMin, y1: geo.frontY - geo.r - 0.4 };
  const mouthOf = (rotor) => [rotor.cx, yMin + 1.2];
  const lane = {
    balls: [],
    wedges: [],
    rotors: geo.rotors.map((cx) => ({ cx, cy: geo.cy, angle: 0, phase: "idle", t: 0, cargo: null, drug: "none", wedge: null, dirty: true })),
    cups: geo.cups.map(([x, y]) => ({ x, y, ball: null })),
    auto: { x: geo.auto[0], y: geo.auto[1], ball: null },
    count: 0, // running average of the balls in the cleft
    receptor: 0, // running average share of receptor cups occupied
    autoAct: 0, // running average of the autoreceptor cup
    busy: 0, // running average share of transporters mid-cycle
    open: 1, // running average share idle and free of drug
    throttle: 1,
    released: 0,
    failures: 0,
    recycled: 0,
    time: 0,
  };

  const walk = (thing, dt, diffusion) => {
    const tauV = 0.3;
    const sigma = Math.sqrt(2 * diffusion) / tauV;
    const decay = Math.exp(-dt / tauV);
    const kick = sigma * Math.sqrt(((1 - decay * decay) * tauV) / 2);
    thing.vx = thing.vx * decay + kick * randn();
    thing.vy = thing.vy * decay + kick * randn();
    thing.x += thing.vx * dt;
    thing.y += thing.vy * dt;
    if (thing.x < bounds.x0) { thing.x = 2 * bounds.x0 - thing.x; thing.vx = Math.abs(thing.vx); }
    if (thing.x > bounds.x1) { thing.x = 2 * bounds.x1 - thing.x; thing.vx = -Math.abs(thing.vx); }
    if (thing.y < bounds.y0) { thing.y = 2 * bounds.y0 - thing.y; thing.vy = Math.abs(thing.vy); }
    if (thing.y > bounds.y1) { thing.y = 2 * bounds.y1 - thing.y; thing.vy = -Math.abs(thing.vy); }
  };

  function release() {
    let quanta = 0;
    for (let i = 0; i < rates.quantaN; i++) if (rand() < rates.quantaP) quanta++;
    if (!quanta) { lane.failures++; return; }
    for (let i = 0; i < quanta && lane.balls.length < rates.maxBalls; i++) {
      lane.balls.push({
        x: geo.nozzle + (i - (quanta - 1) / 2) * 2.4, y: geo.wallY + 7.4, z: geo.mouthZ,
        vx: randn() * 9, vy: 26 + rand() * 18, vz: 8 + rand() * 8, mode: "fly", t: 0, alpha: 1,
      });
      lane.released++;
    }
  }

  function spawnWedge(mode) {
    const [x, y, z] = geo.spout;
    const wedge = { x, y, z, vx: (geo.spout[0] < (geo.x0 + geo.x1) / 2 ? 1 : -1) * (14 + rand() * 8), vy: randn() * 6, vz: 0, mode, t: 0, alpha: 1, rotor: null };
    lane.wedges.push(wedge);
    return wedge;
  }

  function step(dt, { c = 0, ki = 1, gain = 0.7 } = {}) {
    lane.time += dt;
    // Release, throttled by the autoreceptor.
    lane.throttle = Math.max(0, 1 - gain * lane.autoAct);
    if (rand() < rates.release * lane.throttle * dt) release();

    // Balls.
    for (const ball of lane.balls) {
      if (ball.mode === "fly") {
        ball.vz -= 140 * dt;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        ball.z += ball.vz * dt;
        if (ball.z <= ballZ) { ball.z = ballZ; ball.mode = "free"; ball.vy *= 0.3; ball.vx *= 0.3; }
        ball.x = Math.min(bounds.x1, Math.max(bounds.x0, ball.x));
        ball.y = Math.min(bounds.y1, Math.max(bounds.y0, ball.y));
      } else if (ball.mode === "free") {
        walk(ball, dt, rates.diffusion);
        if (rand() < rates.leak * dt) { ball.mode = "fade"; ball.t = 0; continue; }
        for (const cup of lane.cups) {
          if (cup.ball || Math.hypot(ball.x - cup.x, ball.y - cup.y) > 3.2) continue;
          if (rand() < rates.bindReceptor * dt) { cup.ball = ball; ball.mode = "receptor"; ball.cup = cup; ball.t = 0; ball.dwell = -Math.log(1 - rand()) * rates.receptorDwell; }
        }
        const cup = lane.auto;
        if (ball.mode === "free" && !cup.ball && Math.hypot(ball.x - cup.x, ball.y - cup.y) < 3.2 && rand() < rates.bindReceptor * dt) {
          cup.ball = ball; ball.mode = "auto"; ball.cup = cup; ball.t = 0; ball.dwell = -Math.log(1 - rand()) * rates.autoDwell;
        }
        if (ball.mode !== "free") { ball.x = ball.cup.x; ball.y = ball.cup.y; ball.z = geo.cupTop + geo.r - 0.9; continue; }
        for (const rotor of lane.rotors) {
          if (rotor.phase !== "idle" || rotor.drug !== "none") continue;
          const [mx, my] = mouthOf(rotor);
          if (Math.hypot(ball.x - mx, ball.y - my) > rates.mouth) continue;
          if (rand() < rates.capture * dt) { rotor.phase = "t1"; rotor.t = 0; rotor.cargo = ball; rotor.dirty = true; ball.mode = "cargo"; ball.rotor = rotor; ball.fx = ball.x; ball.fy = ball.y; break; }
        }
      } else if (ball.mode === "receptor" || ball.mode === "auto") {
        ball.t += dt;
        if (ball.t > ball.dwell) { ball.cup.ball = null; ball.cup = null; ball.mode = "free"; ball.z = ballZ; ball.vx = randn() * 12; ball.vy = -Math.abs(randn()) * 12; }
      } else if (ball.mode === "fade") {
        ball.t += dt;
        ball.alpha = 1 - ease(ball.t / 0.5);
      }
    }

    // Transporters: outward-open → occluded → inward-open, a half turn per transported ball.
    for (const rotor of lane.rotors) {
      if (rotor.phase === "idle") {
        // Binding needs an idle, outward-open transporter. kon is scaled by the share of time transporters spend
        // turning, so the share a drug holds over time matches p = C / (C + Ki) (Ki is measured without transport).
        const kon = rates.koff * (c / ki) * (1 + lane.busy / Math.max(0.05, lane.open));
        if (rotor.drug === "none" && c > 0 && rand() < kon * dt) {
          let wedge = null, best = Infinity;
          for (const w of lane.wedges) {
            if (w.mode !== "free") continue;
            const d = Math.hypot(w.x - rotor.cx, w.y - rotor.cy);
            if (d < best) { best = d; wedge = w; }
          }
          if (!wedge) wedge = spawnWedge("free");
          wedge.mode = "dock"; wedge.t = 0; wedge.from = [wedge.x, wedge.y, wedge.z]; wedge.rotor = rotor;
          const [mx, my] = mouthOf(rotor);
          wedge.duration = Math.max(0.3, Math.hypot(wedge.x - mx, wedge.y - my) / rates.dock);
          rotor.drug = "docking"; rotor.wedge = wedge; rotor.dirty = true;
        } else if (rotor.drug === "bound" && rand() < rates.koff * dt) {
          const wedge = rotor.wedge;
          const [mx, my] = mouthOf(rotor);
          wedge.mode = "free"; wedge.x = mx; wedge.y = my + 1.5; wedge.z = geo.floor; wedge.vx = randn() * 6; wedge.vy = 16; wedge.rotor = null;
          rotor.drug = "none"; rotor.wedge = null; rotor.dirty = true;
        }
        continue;
      }
      rotor.t += dt;
      rotor.dirty = true;
      if (rotor.phase === "t1") {
        rotor.angle = -90 * ease(rotor.t / rates.turn);
        if (rotor.t >= rates.turn) { rotor.phase = "hold"; rotor.t = 0; rotor.angle = -90; }
      } else if (rotor.phase === "hold") {
        if (rotor.t >= rates.hold) { rotor.phase = "t2"; rotor.t = 0; }
      } else if (rotor.phase === "t2") {
        rotor.angle = -90 - 90 * ease(rotor.t / rates.turn);
        if (rotor.t >= rates.turn) {
          rotor.phase = "idle"; rotor.t = 0; rotor.angle = 0;
          if (rotor.cargo) { rotor.cargo.mode = "gone"; rotor.cargo = null; lane.recycled++; }
        }
      }
      if (rotor.cargo) {
        const theta = ((90 + rotor.angle) * Math.PI) / 180;
        let px = rotor.cx + 0.5 * geo.R * Math.cos(theta), py = rotor.cy + 0.5 * geo.R * Math.sin(theta);
        if (rotor.phase === "t1") {
          const k = ease(rotor.t / (rates.turn * 0.7)); // the ball rolls in from where it was caught
          px = rotor.cargo.fx + (px - rotor.cargo.fx) * k;
          py = rotor.cargo.fy + (py - rotor.cargo.fy) * k;
        }
        rotor.cargo.x = px;
        rotor.cargo.y = py;
        rotor.cargo.z = ballZ;
      }
    }

    // Drug wedges: a pool that follows the concentration, each one wandering until it docks.
    const target = c > 0 ? Math.max(1, Math.min(6, Math.round(1.5 * Math.log(1 + c) + 0.6))) : 0;
    const free = lane.wedges.filter((w) => w.mode === "free" || w.mode === "drop");
    if (free.length < target && rand() < 1.2 * dt) spawnWedge("drop");
    if (free.length > target && rand() < 1.2 * dt) { const w = free.find((x) => x.mode === "free"); if (w) { w.mode = "fade"; w.t = 0; } }
    for (const w of lane.wedges) {
      if (w.mode === "drop") {
        w.x += w.vx * dt; w.vz -= 140 * dt; w.z += w.vz * dt;
        if (w.z <= geo.floor) { w.z = geo.floor; w.mode = "free"; w.vx *= 0.4; }
      } else if (w.mode === "free") {
        walk(w, dt, rates.wedgeDiffusion);
      } else if (w.mode === "dock") {
        w.t += dt;
        const s = ease(w.t / w.duration);
        const [mx, my] = mouthOf(w.rotor);
        const tx = w.rotor.cx, ty = w.rotor.cy + 0.5 * geo.R;
        const k = Math.min(1, s * 1.25);
        const mxk = w.from[0] + (mx - w.from[0]) * k, myk = w.from[1] + (my - w.from[1]) * k;
        const tail = Math.max(0, (s - 0.8) / 0.2);
        w.x = mxk + (tx - mxk) * tail; w.y = myk + (ty - myk) * tail; w.z = w.from[2] + (geo.floor - w.from[2]) * s;
        if (w.t >= w.duration) { w.mode = "docked"; w.x = tx; w.y = ty; w.z = geo.floor; w.rotor.drug = "bound"; w.rotor.dirty = true; }
      } else if (w.mode === "fade") {
        w.t += dt; w.alpha = 1 - ease(w.t / 0.5);
      }
    }

    lane.balls = lane.balls.filter((b) => b.mode !== "gone" && !(b.mode === "fade" && b.t > 0.5));
    lane.wedges = lane.wedges.filter((w) => !(w.mode === "fade" && w.t > 0.5));

    // Running averages.
    const out = lane.balls.filter((b) => b.mode !== "cargo" && b.mode !== "fade").length;
    const a = (tau) => 1 - Math.exp(-dt / tau);
    lane.count += (out - lane.count) * a(rates.countTau);
    lane.receptor += (lane.cups.filter((cup) => cup.ball).length / lane.cups.length - lane.receptor) * a(rates.receptorTau);
    lane.autoAct += ((lane.auto.ball ? 1 : 0) - lane.autoAct) * a(rates.autoTau);
    const n = lane.rotors.length;
    lane.busy += (lane.rotors.filter((r) => r.phase !== "idle").length / n - lane.busy) * a(4);
    lane.open += (lane.rotors.filter((r) => r.phase === "idle" && r.drug === "none").length / n - lane.open) * a(4);
    return lane;
  }

  lane.step = step;
  lane.blocked = () => lane.rotors.filter((r) => r.drug !== "none").length;
  return lane;
}

// The share of transporters a drug holds at concentration c (in units of its SERT Ki): one-site binding.
export const occupancy = (c, ki) => (c > 0 ? c / (c + ki) : 0);
