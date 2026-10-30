/* ───────── fx: comets, glow dots, dither smoke ───────── */
const ptr = { x: -999, y: -999, on: false };

const bez = (p0, p1, p2, p3) => u => {
  const v = 1 - u, a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
};

function glowDot(ctx, x, y, r, a, col) {
  if (a <= 0.003 || r <= 0.1) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,255,255,${a.toFixed(3)})`);
  g.addColorStop(.16, rgba(mixc(WHITE, col, .3), a * .9));
  g.addColorStop(.42, rgba(col, a * .38));
  g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
}

function drawComet(ctx, T, c) {
  const u = (T - c.a) / (c.b - c.a);
  if (u < 0 || u > 1.32) return;
  const uh = (c.ease || eio2)(clamp(u));
  const tailK = u > 1 ? 1 - clamp((u - 1) / .24) : 1;
  const fade = sstep(0, .07, u) * (u > 1 ? 1 - clamp((u - 1) / .3) : 1);
  const u0 = Math.max(0, uh - c.len * tailK);
  const N = 28;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  let prev = c.path(u0);
  for (let i = 1; i <= N; i++) {
    const f = i / N, p = c.path(lerp(u0, uh, f));
    ctx.strokeStyle = rgba(mixc(TH.glow, WHITE, Math.pow(f, .8)), Math.pow(f, 1.6) * fade);
    ctx.lineWidth = lerp(.4, c.w, Math.pow(f, 1.15));
    ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
    prev = p;
  }
  const h = c.path(uh);
  glowDot(ctx, h[0], h[1], c.w * 7.5, .95 * fade, TH.glow);
  ctx.fillStyle = `rgba(255,255,255,${fade.toFixed(3)})`;
  ctx.beginPath(); ctx.arc(h[0], h[1], c.w * .95, 0, 6.2832); ctx.fill();
}

/* value-noise fbm for the dissolve cloud */
function vn(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
const fbm = (x, y) => vn(x, y) * .55 + vn(x * 2.1 + 7, y * 2.1 + 3) * .3 + vn(x * 4.3 + 11, y * 4.3 + 5) * .15;

/* grey dither cloud rising behind the closing title */
function drawSmoke(ctx, lt, amt) {
  if (amt <= 0.01) return;
  const P = 8, half = Math.min(230, WW * .3), cx = WW * .5 + Math.min(110, WW * .1);
  const col = mixc(WHITE, TH.soft, .22);
  const x0 = Math.floor((cx - half * 1.5) / P) * P;
  for (let y = 0; y < WH; y += P) {
    const wob = Math.sin(y * .011 + lt * .45) * 64 + Math.sin(y * .029 - lt * .8) * 18;
    const band = .62 + .38 * Math.sin(y * .0075 - lt * .5 + 1.2);
    const nearText = Math.abs(y - CY) < 46 ? .5 : 1;
    for (let x = x0; x < cx + half * 1.5; x += P) {
      const dx = (x - (cx + wob)) / half;
      const env = Math.exp(-dx * dx * 2.1);
      if (env < .04) continue;
      let v = fbm(x * .0105, y * .0088 - lt * .2) * env * band;
      const pd = Math.hypot(x - ptr.x, y - ptr.y);
      if (pd < 120) v += (1 - pd / 120) * .32;
      v = (v - .27) / .45;
      if (v <= 0) continue;
      v = Math.min(1, v);
      const s = P * (.22 + .62 * v);
      ctx.fillStyle = rgba(col, (.14 + .6 * v) * amt * nearText);
      ctx.fillRect(x + (P - s) / 2, y + (P - s) / 2, s, s);
    }
  }
}
