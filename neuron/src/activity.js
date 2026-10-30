// Spreading activity. A cascade starts at one or more seed neurons and travels along the real
// axon connections: a neuron fires when the pulse from a presynaptic cell has run the length of
// the axon (at SPEED world units per second) plus a short synaptic delay. Fire times are written
// into the data texture the shaders read (8 slots per neuron, oldest overwritten).

export const SPEED = 1.9;
const SYN_DELAY = 0.07;

export class Activity {
  constructor(net, texture, rng = Math.random) {
    this.net = net;
    this.N = net.N;
    this.texture = texture;
    this.rng = rng;
    this.data = net.tex;
  }

  growth(i, S) {
    const n = this.net.neurons[i];
    return Math.min(1, Math.max(0, (S - n.birth) / n.span));
  }

  active(i, S) { return this.growth(i, S) >= 0.38; }

  // neurons that have grown enough to fire, nearest to the camera's focus first (with some randomness)
  pickSeeds(S, fx, fy, count = 1, radius = 6) {
    const c = [];
    for (let i = 0; i < this.N; i++) {
      if (!this.active(i, S)) continue;
      const n = this.net.neurons[i];
      const d = Math.hypot(n.pos[0] - fx, n.pos[1] - fy);
      if (d > radius) continue;
      c.push({ i, k: d + this.rng() * 1.4 });
    }
    c.sort((a, b) => a.k - b.k);
    return c.slice(0, Math.max(count, Math.min(c.length, count * 3))).sort(() => this.rng() - 0.5).slice(0, count).map((x) => x.i);
  }

  schedule(id, tf) {
    const N = this.N;
    let best = 0;
    let bt = Infinity;
    for (let s = 0; s < 8; s++) {
      const row = 2 + (s >> 2);
      const t = this.data[(row * N + id) * 4 + (s & 3)];
      if (t < bt) { bt = t; best = s; }
    }
    this.data[((2 + (best >> 2)) * N + id) * 4 + (best & 3)] = tf;
  }

  trigger(seeds, now, S, { maxDelay = 3.2, p = 0.9 } = {}) {
    const N = this.N;
    const dist = new Float32Array(N).fill(Infinity);
    const done = new Uint8Array(N);
    for (const s of seeds) dist[s] = 0;
    const g = this.net.graph;
    for (;;) {
      let u = -1;
      let bd = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
      if (u < 0) break;
      done[u] = 1;
      for (const e of g[u]) {
        if (e.tSyn > S - 0.02) continue;
        if (!this.active(e.dst, S)) continue;
        if (this.rng() > p) continue;
        const nd = dist[u] + e.len / SPEED + SYN_DELAY;
        if (nd < dist[e.dst] && nd < maxDelay) dist[e.dst] = nd;
      }
    }
    let n = 0;
    for (let i = 0; i < N; i++) if (dist[i] < Infinity) { this.schedule(i, now + dist[i]); n++; }
    this.texture.needsUpdate = true;
    return n;
  }
}
