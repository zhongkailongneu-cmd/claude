/* ───────── timeline state ───────── */
let T = 0, cur = -1, holdUntil = 0, paused = false;
const SC = [];
const isHeld = () => wall() < holdUntil;
const holdFor = s => { holdUntil = Math.max(holdUntil, wall() + s); };
const curLt = i => T - SC[i].t0;

function rr(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
const setO = (el, o) => { el.style.opacity = o; };
const tapEl = $('#tap0');
let tapOn = false;
function tapShow(el, p) {
  const r = rectW(el);
  tapEl.style.opacity = (Math.sin(Math.PI * p) * .95).toFixed(3);
  tapEl.style.transform = `translate(${r.cx}px,${r.cy}px) scale(${(.55 + .7 * eo3(p)).toFixed(3)})`;
  tapOn = true;
}
/* pointer position in a box's own coordinates (world units) */
function localPt(e, el) {
  const r = el.getBoundingClientRect();
  return [(e.clientX - r.left) / k, (e.clientY - r.top) / k];
}
function drag(el, { start, move, end }) {
  el.addEventListener('pointerdown', e => {
    if (start && start(e) === false) return;
    el.setPointerCapture(e.pointerId);
    const mv = ev => move(ev), up = ev => {
      el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      end && end(ev);
    };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    move(e);
    e.preventDefault();
  });
}

/* ════════════ 01 · LEVEL ════════════ */
const lv = { drag: { on: false, p: 0, w: 0 }, words: [['Idea', 0], ['Task', .24], ['Mission', .52], ['Goal', .82]], sug: .4 };
SC.push({
  name: 'Level', dur: 4.6,
  init() {
    lv.swap = new Swap($('#lvWord'), { dy: .55, dur: .55 });
    lv.hd = $('#lvHd'); lv.cube = $('#cube'); lv.stage = $('#lvStage'); lv.sugg = $('#lvSugg');
    lv.bs = $$('#cube .cube-in b'); lv.glass = $('#cube .cube-glass'); lv.halo = $('#cube .cube-halo');
    lv.flash = $('#cube .cube-flash'); lv.solid = $('#cube .cube-solid');
    lv.bri = []; lv.cr = [];
    for (let c = 0; c < 48; c++) { lv.bri[c] = []; for (let r = 0; r < 5; r++) { const v = hash(c * 7 + 3, r * 5 + 1); lv.bri[c][r] = v < .34 ? .08 + v * .55 : .55 + (v - .34) * .68; } }
    for (let i = 0; i < 9; i++) lv.cr[i] = hash(i * 13 + 5, 2);
    drag(lv.stage, {
      start: () => { const lt = curLt(0); if (cur !== 0 || lt < 1.2 || lt > 3.65) return false; lv.drag.on = true; },
      move: e => { const [x] = localPt(e, lv.stage); lv.drag.p = clamp((x - U.cube / 2) / (U.tw - U.cube)); },
      end: () => { lv.drag.on = false; holdFor(2.6); },
    });
  },
  enter() { lv.swap.reset(); lv.drag.on = false; lv.drag.w = 0; },
  render(lt, dt) {
    const tw = U.tw, cs = U.cube, D = lv.drag, held = D.on || isHeld();
    D.w += ((held ? 1 : 0) - D.w) * (1 - Math.exp(-dt * (held ? 14 : 1.7)));
    const auto = eio3(prog(lt, 1.55, 3.25));
    const p = lerp(auto, D.p, D.w);
    const sp = Math.sin(Math.PI * prog(lt, 1.55, 3.25)) * (1 - D.w);
    const leave = prog(lt, 3.7, 4.5);
    const cubeIn = eoB(prog(lt, .72, 1.32));
    const white = sstep(3.2, 3.5, lt) * (p > .92 ? 1 : 0);
    const cx = cs / 2 + p * (tw - cs);
    const sc = Math.max(0, cubeIn) * (1 - .76 * ei2(leave));
    lv.cube.style.transform = `translate(${cx.toFixed(2)}px,${((U.stageH - cs) / 2).toFixed(1)}px) scale(${(sc * (1 + .1 * sp)).toFixed(3)},${(sc * (1 - .03 * sp)).toFixed(3)})`;
    lv.cube.style.opacity = clamp(cubeIn * 3) * (1 - sstep(.93, 1, leave));
    const base = mixc(TH.t1, TH.cube, p), tone = mixc(base, WHITE, white), tm = wall();
    for (let i = 0; i < 9; i++) {
      const hl = (i === 3 || i === 8) ? .6 * (1 - p) : 0;
      const o = clamp(.1 + p * (.5 + .5 * lv.cr[i]) + hl + .06 * Math.sin(tm * 2.2 + i * 1.7) + white);
      lv.bs[i].style.background = rgba(tone); lv.bs[i].style.opacity = o.toFixed(3);
    }
    lv.flash.style.opacity = (pulse(lt, 3.2, 3.75) * .75).toFixed(3);
    lv.solid.style.opacity = sstep(.45, .95, leave);
    lv.glass.style.opacity = 1 - sstep(.5, .95, leave);
    lv.halo.style.opacity = (clamp(cubeIn) * (1 - .6 * leave) * (.75 + .25 * sp + .25 * white)).toFixed(3);

    const titleIn = eo3(prog(lt, .95, 1.55));
    lv.hd.style.opacity = titleIn * (1 - prog(lt, 3.65, 4.05));
    lv.hd.style.transform = `translateY(${((1 - titleIn) * 10).toFixed(2)}px)`;
    let wi = 0; for (let i = 0; i < lv.words.length; i++) if (p >= lv.words[i][1]) wi = i;
    if (lt > 1.0) lv.swap.set(lv.words[wi][0]); else lv.swap.reset();
    lv.swap.tick();
    lv.hd.style.setProperty('--kwc', rgba(mixc(WHITE, TH.kw, clamp(p * 1.15))));

    const sx = (Math.round(lv.sug * U.cols) + .5) * U.pitch - 3.5;
    lv.sugg.style.opacity = prog(lt, 2.1, 2.6) * (1 - prog(lt, 3.65, 4.0));
    lv.sugg.style.transform = `translate(${sx}px,${U.stageH / 2}px)`;

    drawTrack(lt, p, leave, sp, prog(lt, .9, 1.4));
  },
});

function drawTrack(lt, p, leave, sp, vis) {
  const c = ctxs.track, tw = U.tw, cs = U.cube, sh = U.stageH, pitch = U.pitch, cols = U.cols, rows = 5, cell = 17;
  c.clearRect(0, 0, tw, sh);
  if (vis <= .01) return;
  const cx = cs / 2 + p * (tw - cs), y0 = (sh - (rows * pitch - (pitch - cell))) / 2, tm = wall();
  for (let ci = 0; ci < cols; ci++) {
    const x = ci * pitch, mx = x + cell / 2, dx = mx - cx, f = ci / (cols - 1);
    const lvA = 1 - prog(leave, f * .5, f * .5 + .5);
    if (lvA <= .01) continue;
    const col = trackColor(f);
    const lit = dx > 0 ? clamp(1 - dx / (pitch * 1.9)) : 1;
    const wake = dx <= 0 ? Math.exp(dx / (pitch * 5)) : 0;
    for (let r = 0; r < rows; r++) {
      const y = y0 + r * pitch;
      if (lit > .02) {
        const b = lv.bri[ci % 48][r] * (.84 + .16 * Math.sin(tm * 2.3 + ci * 1.9 + r * 1.3));
        const s = cell * (.5 + .5 * lit);
        c.fillStyle = rgba(col, clamp(b * (.78 + .5 * wake)) * lit * lvA * vis);
        rr(c, x + (cell - s) / 2, y + (cell - s) / 2, s, s, 5 * s / cell); c.fill();
      } else if (dx < pitch * 7) {
        c.fillStyle = `rgba(255,255,255,${((1 - dx / (pitch * 7)) * .5 * lvA * vis).toFixed(3)})`;
        c.beginPath(); c.arc(mx, y + cell / 2, 1.6, 0, 6.3); c.fill();
      }
    }
  }
  if (sp > .05) {
    const g = c.createLinearGradient(cx - cs * 1.4, 0, cx - cs * .2, 0);
    g.addColorStop(0, rgba(TH.soft, 0)); g.addColorStop(1, rgba(TH.soft, .2 * sp));
    c.fillStyle = g; c.fillRect(Math.max(0, cx - cs * 1.4), y0, cs * 1.2, rows * pitch);
  }
}

/* ════════════ 02 · PRIORITY ════════════ */
const pr = {
  keys: [[.55, .5, .78], [1.5, .5, .78], [2.3, .26, .78], [3.3, .30, .20], [4.4, .80, .22], [9, .80, .22]],
  drag: { on: false, x: .5, y: .78, w: 0 }, heat: null, oc: null,
};
const prZone = (x, y) => { const u = 1 - y; if (x >= .6 && u >= .55) return 'first'; if (x >= .45 && u < .55) return 'plan'; if (u >= .55) return 'quick'; return 'later'; };
const prLabel = { first: 'Do first', plan: 'Plan', quick: 'Quick', later: 'Later' };
function prScript(lt) {
  const K = pr.keys;
  if (lt <= K[0][0]) return [K[0][1], K[0][2]];
  for (let i = 0; i < K.length - 1; i++) {
    if (lt < K[i + 1][0]) {
      const e = eio3(prog(lt, K[i][0], K[i + 1][0])), arc = K[i][2] !== K[i + 1][2] ? .03 * Math.sin(Math.PI * e) : 0;
      return [lerp(K[i][1], K[i + 1][1], e), lerp(K[i][2], K[i + 1][2], e) - arc];
    }
  }
  const L = K[K.length - 1]; return [L[1], L[2]];
}
SC.push({
  name: 'Priority', dur: 6.0,
  init() {
    pr.swap = new Swap($('#prWord'), { dy: .5, dur: .45 });
    pr.hd = $('#prHd'); pr.card = $('#prCard'); pr.axU = $('#axU'); pr.axI = $('#axI');
    pr.hd.style.setProperty('--kwc', '#fff');
    pr.oc = TH.plan.slice();
    drag(pr.card, {
      start: () => { const lt = curLt(1); if (cur !== 1 || lt < 1.3 || lt > 5.1) return false; pr.drag.on = true; },
      move: e => { const [x, y] = localPt(e, pr.card); pr.drag.x = clamp(x / U.prW, .07, .93); pr.drag.y = clamp(y / U.prH, .1, .9); },
      end: () => { pr.drag.on = false; holdFor(3); },
    });
  },
  enter() { pr.swap.reset(); pr.drag.on = false; pr.drag.w = 0; pr.heat = null; pr.zone = null; },
  render(lt, dt) {
    const D = pr.drag, held = D.on || isHeld();
    D.w += ((held ? 1 : 0) - D.w) * (1 - Math.exp(-dt * (held ? 16 : 1.6)));
    const out = prog(lt, 5.25, 5.85), cardIn = eo3(prog(lt, .85, 1.7));
    pr.card.style.opacity = cardIn * (1 - sstep(.1, .9, out));
    pr.card.style.transform = `scale(${(lerp(.6, 1, cardIn) * (1 - .06 * out)).toFixed(4)})`;
    const [sx, sy] = prScript(lt), ox = lerp(sx, D.x, D.w), oy = lerp(sy, D.y, D.w);
    const z = prZone(ox, oy);
    const target = TH[z === 'first' ? 'first' : z];
    pr.oc = mixc(pr.oc, target, 1 - Math.exp(-dt * 7));
    if (lt > 1.35) pr.swap.set(prLabel[z]); else pr.swap.reset();
    pr.swap.tick();
    const hdA = prog(lt, 1.3, 1.8) * (1 - out);
    pr.hd.style.opacity = hdA; pr.hd.style.transform = `translateY(${((1 - hdA) * 8).toFixed(2)}px)`;
    const ax = prog(lt, 4.4, 5.0) * (1 - out);
    pr.axU.style.opacity = ax; pr.axI.style.opacity = ax;
    drawDots(lt, dt, ox, oy, z, eoB(prog(lt, .6, 1.2)) * (1 - ei2(out)), prog(lt, .7, 1.6) * (1 - sstep(.0, .8, out)));
  },
});

function drawDots(lt, dt, ox, oy, zone, orbIn, dotsIn) {
  const c = ctxs.dots, W = U.prW, H = U.prH, pad = 28, pitch = 22;
  const cols = Math.floor((W - pad * 2) / pitch) + 1, rows = Math.floor((H - pad * 2) / pitch) + 1;
  const offX = (W - (cols - 1) * pitch) / 2, offY = (H - (rows - 1) * pitch) / 2;
  if (!pr.heat || pr.heat.length !== cols * rows) pr.heat = new Float32Array(cols * rows);
  c.clearRect(0, 0, W, H);
  const px = ox * W, py = oy * H, R = clamp(W * .094, 30, 52), decay = Math.exp(-dt * 1.7);
  const ringR = Math.max(0, (lt - .7) * 520), ringA = 1 - prog(lt, .7, 1.7);
  const oc = pr.oc, tm = wall();
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = offX + i * pitch, y = offY + j * pitch, idx = j * cols + i;
      const d = Math.hypot(x - px, y - py), f = Math.exp(-Math.pow(d / (R * 1.45), 2)) * orbIn;
      pr.heat[idx] = Math.max(f, pr.heat[idx] * decay);
      const h = pr.heat[idx];
      const fm = (x / W) * .6 + (1 - y / H) * .4;
      let a = .1 + .22 * fm * fm;
      a += h * .85 + (ringA > 0 ? .55 * Math.exp(-Math.pow((d - ringR) / 46, 2)) * ringA : 0);
      a *= dotsIn;
      if (a < .01) continue;
      const r = 1.3 + h * 2.7 + .25 * Math.sin(tm * 1.6 + i * .7 + j * .5);
      c.fillStyle = rgba(mixc(WHITE, oc, clamp(h * 1.3)), clamp(a));
      c.beginPath(); c.arc(x, y, r, 0, 6.3); c.fill();
    }
  }
  /* suggested target ring */
  const sx = W * .73, sy = H * .76, sa = dotsIn * (.55 + .25 * Math.sin(tm * 2.1));
  c.strokeStyle = `rgba(255,255,255,${sa.toFixed(3)})`; c.lineWidth = 1.3;
  c.beginPath(); c.arc(sx, sy, 6.5, 0, 6.3); c.stroke();
  if (orbIn <= .01) return;
  /* glass orb */
  const rad = R * Math.max(.05, orbIn), first = zone === 'first' ? 1 : 0;
  let g = c.createRadialGradient(px, py, rad * .35, px, py, rad * 2.6);
  g.addColorStop(0, rgba(oc, .42 * orbIn)); g.addColorStop(1, rgba(oc, 0));
  c.fillStyle = g; c.beginPath(); c.arc(px, py, rad * 2.6, 0, 6.3); c.fill();
  g = c.createRadialGradient(px - rad * .3, py - rad * .38, 0, px, py, rad);
  g.addColorStop(0, 'rgba(255,255,255,.28)'); g.addColorStop(.6, 'rgba(255,255,255,.05)'); g.addColorStop(1, rgba(oc, .2));
  c.fillStyle = g; c.beginPath(); c.arc(px, py, rad, 0, 6.3); c.fill();
  c.strokeStyle = 'rgba(255,255,255,.72)'; c.lineWidth = 1.6; c.beginPath(); c.arc(px, py, Math.max(.1, rad - .8), 0, 6.3); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = 1; c.beginPath(); c.arc(px, py, Math.max(.1, rad - 6), 0, 6.3); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 2.2; c.lineCap = 'round';
  c.beginPath(); c.arc(px, py, Math.max(.1, rad - 3.5), Math.PI * 1.08, Math.PI * 1.42); c.stroke();
  const dc = mixc(WHITE, oc, .22), s = rad * .3, dr = rad * .13;
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    glowDot(c, px + a * s, py + b * s, dr * 3.2, .55 * orbIn, oc);
    c.fillStyle = rgba(dc, orbIn); c.beginPath(); c.arc(px + a * s, py + b * s, dr, 0, 6.3); c.fill();
  }
  if (first > 0) {
    c.fillStyle = `rgba(255,255,255,${(.85 * orbIn).toFixed(3)})`;
    for (let n = 0; n < 8; n++) { const ang = n * Math.PI / 4 + tm * .25; c.beginPath(); c.arc(px + Math.cos(ang) * rad * .78, py + Math.sin(ang) * rad * .78, rad * .045, 0, 6.3); c.fill(); }
  }
}

/* ════════════ 03 · CAPTURE ════════════ */
const cpS = { words: ['Finish', 'the', 'deck', 'by', 'Monday'], wt: [2.35, 2.75, 3.15, 3.5, 3.85], spans: [] };
SC.push({
  name: 'Capture', dur: 7.8,
  init() {
    const host = $('#words');
    cpS.words.forEach((w, i) => { const s = document.createElement('span'); s.className = 'wd'; s.textContent = w + (i < cpS.words.length - 1 ? ' ' : ''); host.append(s); cpS.spans.push(s); });
    for (const id of ['cp', 'hello', 'cpCard', 'ph', 'mic', 'icMic', 'icStop', 'chip', 'rec', 'recT', 'ondev', 'send']) cpS[id] = $('#' + id);
    cpS.fill = $('#send .fill'); cpS.sendIc = $('#send svg');
    cpS.mic.addEventListener('click', () => { if (cur !== 2) return; const lt = curLt(2); seekTo(2, lt < 1.5 ? 1.45 : lt < 4.7 ? 4.68 : 1.45); });
    cpS.send.addEventListener('click', () => { if (cur !== 2) return; const lt = curLt(2); if (lt > 5.4 && lt < 6.9) seekTo(2, 6.86); });
  },
  enter() { holdUntil = 0; },
  render(lt, dt) {
    const cpIn = eo3(prog(lt, .12, .8)), exit = sstep(7.15, 7.6, lt);
    const scl = lerp(1, .74, eio3(prog(lt, 4.85, 6.4)));
    cpS.cp.style.transform = `scale(${scl.toFixed(4)})`;
    cpS.cpCard.style.opacity = cpIn * (1 - exit);
    cpS.cpCard.style.transform = `translateY(${((1 - cpIn) * 18).toFixed(2)}px)`;
    cpS.hello.style.opacity = cpIn * (1 - exit);
    cpS.hello.style.filter = `blur(${((1 - cpIn) * 6 + exit * 4).toFixed(2)}px)`;
    cpS.hello.style.transform = `translateY(${((1 - cpIn) * 12).toFixed(2)}px)`;

    const recOn = sstep(1.55, 1.85, lt) - sstep(4.75, 5.05, lt);
    cpS.ph.style.opacity = (1 - sstep(1.55, 1.85, lt)) * .98;
    cpS.icMic.style.opacity = 1 - recOn; cpS.icStop.style.opacity = recOn;
    const press = pulse(lt, 1.45, 1.75) + pulse(lt, 4.68, 4.98);
    cpS.mic.style.transform = `scale(${(1 - .07 * Math.sin(Math.min(1, press) * Math.PI / 2)).toFixed(3)})`;
    cpS.mic.style.setProperty('--micg', (.32 + .55 * recOn).toFixed(3));
    cpS.chip.style.opacity = 1 - recOn;
    cpS.rec.style.opacity = recOn; cpS.ondev.style.opacity = recOn;
    const sec = clamp(Math.floor(lt - 1.7), 0, 3);
    cpS.recT.textContent = '00:0' + sec;
    const sendOn = sstep(5.3, 5.8, lt), sendDot = sstep(6.98, 7.3, lt);
    cpS.send.style.opacity = (1 - recOn) * (1 - sstep(7.3, 7.4, lt));
    cpS.send.style.transform = `scale(${(1 - .58 * sendDot - .08 * pulse(lt, 6.86, 7.05)).toFixed(3)})`;
    cpS.fill.style.opacity = Math.max(sendOn, sendDot);
    cpS.fill.style.background = rgba(mixc(TH.btn, WHITE, sendDot));
    cpS.fill.style.boxShadow = `0 0 ${(22 + 18 * sendDot).toFixed(0)}px rgba(${rgb3(mixc(TH.glow, WHITE, sendDot * .6))},${(.55 + .4 * sendDot).toFixed(2)})`;
    cpS.sendIc.style.opacity = (.38 + .62 * sendOn) * (1 - sendDot);

    cpS.words.forEach((w, i) => {
      const e = eo3(prog(lt, cpS.wt[i], cpS.wt[i] + .42));
      let bl = (1 - e) * 5, op = e;
      if (i >= 2) { const q = Math.sin(Math.PI * prog(lt, 5.5 + .2 * (i - 2), 6.1 + .2 * (i - 2))); bl += 3 * q; op *= 1 - .4 * q; }
      cpS.spans[i].style.opacity = op.toFixed(3);
      cpS.spans[i].style.filter = bl > .05 ? `blur(${bl.toFixed(2)}px)` : 'none';
    });

    /* waveform */
    const L = (.2 + .8 * sstep(2.1, 2.5, lt) * (1 - sstep(4.4, 4.7, lt)) * (.55 + .45 * Math.abs(Math.sin(lt * 6.1)) * Math.abs(Math.sin(lt * 2.3 + .4)))) * (1 - sstep(4.75, 5.0, lt));
    drawWave(lt, L, sstep(1.7, 2.0, lt), sstep(5.0, 5.5, lt), 1 - sstep(5.45, 5.8, lt));

    if (lt > 1.15 && lt < 1.7) tapShow(cpS.mic, prog(lt, 1.15, 1.7));
    else if (lt > 4.4 && lt < 4.95) tapShow(cpS.mic, prog(lt, 4.4, 4.95));
    else if (lt > 6.5 && lt < 7.05) tapShow(cpS.send, prog(lt, 6.5, 7.05));
  },
});

function drawWave(lt, L, vis, contract, fade) {
  const c = ctxs.wave, W = U.cpW, H = U.cpH;
  c.clearRect(0, 0, W, H);
  const a0 = vis * fade;
  if (a0 <= .01) return;
  const n = 49, rows = 7, x0 = 22, pitch = (W - 44) / (n - 1), rp = 6.4, yc = 106, xc = W / 2;
  const c0 = n / 2 + 6 * Math.sin(lt * 1.3), sig = 9 + 3 * Math.sin(lt * .9);
  const keep = 1 - contract;
  for (let i = 0; i < n; i++) {
    const env = Math.exp(-Math.pow((i - c0) / sig, 2));
    const amp = L * env * (.4 + .6 * vn(i * .45, lt * 6));
    for (let j = 0; j < rows; j++) {
      const d = j - 3;
      const v = clamp(amp * 3.6 - Math.abs(d) + .5);
      const bl = d === 0 ? .26 : .07;
      let a = Math.max(bl, v) * a0;
      if (a < .01) continue;
      const x = xc + (x0 + i * pitch - xc) * keep, y = yc + d * rp * (1 - contract * .9);
      c.fillStyle = rgba(mixc(WHITE, TH.soft, Math.abs(d) / 5 * .55), clamp(a));
      c.beginPath(); c.arc(x, y, 1.35 + v * 1.1, 0, 6.3); c.fill();
    }
  }
  if (contract > .6) glowDot(c, xc, yc, 13 * contract, (contract - .6) / .4 * fade * vis * .9, TH.soft);
}

/* ════════════ 04 · TASK ════════════ */
const tk = { prg: .64, drag: { on: false, p: .64, w: 0 }, tw: 150 };
SC.push({
  name: 'Task', dur: 7.2,
  init() {
    for (const id of ['tk', 'tkCard', 'tkIn', 'tkDot', 'ring', 'arc', 'ringFill', 'spks', 'tkTime', 'tkLeft', 'strike', 'slider', 'knob', 'xBtn', 'cBtn']) tk[id] = $('#' + id);
    tk.scr = new Scr(tk.tkTime);
    tk.sTitle = new Swap($('#tkTitle'), { dy: .45, dur: .5, blur: 6 });
    tk.sSub = new Swap($('#tkSub'), { dy: .6, dur: .5, blur: 5 });
    tk.core = $('#ring .core'); tk.knobIc = $('#knob svg');
    for (let i = 0; i < 12; i++) tk.spks.append(document.createElement('i')), tk.spks.lastChild.className = 'spk';
    tk.sp = $$('.spk', tk.spks);
    tk.cBtn.addEventListener('click', () => { if (cur === 3 && curLt(3) < 3.0) seekTo(3, 2.92); });
    tk.xBtn.addEventListener('click', () => { if (cur === 3 && curLt(3) < 6.4) seekTo(3, 6.35); });
    drag(tk.slider, {
      start: () => { const lt = curLt(3); if (cur !== 3 || lt < 1.8 || lt > 3.1) return false; tk.drag.on = true; },
      move: e => { const [x] = localPt(e, tk.slider); tk.drag.p = clamp(x / U.sw); },
      end: () => {
        tk.drag.on = false;
        if (tk.drag.p > .96) { tk.drag.p = 1; tk.drag.w = 1; seekTo(3, 3.2); } else holdFor(2.2);
      },
    });
  },
  enter() { tk.scr.reset(); tk.sTitle.reset(); tk.sSub.reset(); tk.drag.on = false; tk.drag.w = 0; holdUntil = 0; },
  render(lt, dt) {
    const W = U.tkW, H = U.tkH, D = tk.drag, held = D.on || isHeld();
    D.w += ((held ? 1 : 0) - D.w) * (1 - Math.exp(-dt * (held ? 18 : 1.6)));
    const pillIn = eo3(prog(lt, .1, .5)), ex = eoE(prog(lt, .45, 1.2)), col = eio3(prog(lt, 6.5, 7.1));
    const ex2 = ex * (1 - col), w = lerp(150, W, ex2), h = lerp(54, H, ex2);
    const card = tk.tkCard.style;
    card.width = w.toFixed(1) + 'px'; card.height = h.toFixed(1) + 'px';
    card.setProperty('--r', lerp(27, 56, ex2).toFixed(1) + 'px');
    card.opacity = pillIn * (1 - sstep(7.0, 7.2, lt));
    const push = eoB(prog(lt, 3.15, 3.9));
    tk.tk.style.transform = `scale(${lerp(1 + .27 * push, 1, col).toFixed(4)})`;
    tk.tkDot.style.opacity = (1 - ex2) * pillIn;
    tk.tkDot.style.transform = `scale(${(.55 + .45 * pillIn).toFixed(3)})`;
    const cIn = sstep(.8, 1.4, lt), cOut = sstep(6.45, 6.85, lt);
    tk.tkIn.style.opacity = cIn * (1 - cOut);
    tk.tkIn.style.filter = (cIn < 1 || cOut > 0) ? `blur(${((1 - cIn) * 5 + cOut * 5).toFixed(2)}px)` : 'none';

    const chk = sstep(3.25, 3.6, lt), done = sstep(3.3, 3.6, lt), dim = sstep(6.15, 6.5, lt);
    const Lc = 175.93, frac = lerp(.72, 1, chk);
    tk.arc.style.strokeDasharray = `${(Lc * frac).toFixed(2)} ${Lc}`;
    tk.arc.style.transform = `rotate(${((1 - sstep(.9, 1.9, lt)) * 300).toFixed(1)}deg)`;
    tk.arc.style.stroke = rgba(mixc(TH.soft, TH.light, chk));
    tk.ringFill.style.opacity = chk; tk.core.style.opacity = 1 - chk;
    tk.ringFill.style.transform = `scale(${(.7 + .3 * eoB(chk)).toFixed(3)})`;
    const sp = prog(lt, 3.3, 4.15);
    tk.sp.forEach((s, i) => {
      if (sp <= 0 || sp >= 1) { s.style.opacity = 0; return; }
      const ang = i / 12 * 6.2832 + hash(i, 3) * .5, dist = lerp(22, 46 + 16 * hash(i, 7), eo3(sp));
      s.style.opacity = (Math.pow(1 - sp, 1.2) * .95).toFixed(3);
      s.style.transform = `translate(${(Math.cos(ang) * dist).toFixed(1)}px,${(Math.sin(ang) * dist).toFixed(1)}px) scale(${(1 - sp * .5).toFixed(2)})`;
    });

    /* time + text */
    if (lt >= .95) {
      tk.scr.set(lt < 3.75 ? '1:02:13' : lt < 4.0 ? '1:02:12' : 'Done', lt >= 4.0 ? .5 : .75);
      tk.tkTime.style.fontSize = lt >= 4.0 ? '32px' : '';
    } else tk.scr.reset();
    tk.scr.tick();
    tk.tkLeft.style.opacity = sstep(1.3, 1.7, lt) * (1 - sstep(3.8, 4.0, lt));
    if (lt >= 1.0) {
      tk.sTitle.set(lt < 4.0 ? 'Finish the deck' : lt < 5.0 ? 'Deck finished' : lt < 5.9 ? `<span style="color:var(--soft);font-weight:500">1h 02m <span style="font-weight:400">early</span></span>` : 'Nice work.');
      tk.sSub.set(lt < 1.3 ? '' : lt < 2.3 ? 'Task · 25% left · due Mon 18:00' : lt < 3.9 ? 'Reminder <b>2</b> of <b>4</b> · next at <b>10%</b>' : '');
    } else { tk.sTitle.reset(); tk.sSub.reset(); }
    tk.sTitle.tick(); tk.sSub.tick();
    const st = eo3(prog(lt, 3.35, 3.8));
    tk.strike.style.width = (tk.sTitle.a.offsetWidth + 6) + 'px';
    tk.strike.style.transform = `scaleX(${st.toFixed(3)})`;
    tk.strike.style.opacity = st > 0 ? 1 - sstep(4.0, 4.2, lt) : 0;

    /* slider */
    const reveal = eo3(prog(lt, 1.15, 1.85));
    const script = lt < 3.3 ? .64 * reveal : lerp(.64, 1, eoB(prog(lt, 3.3, 3.9)));
    const prg = lerp(script, D.p, D.w);
    tk.prg = prg;
    const sw = U.sw;
    tk.knob.style.transform = `translateX(${(prg * sw).toFixed(2)}px)`;
    tk.knob.style.opacity = clamp(reveal * 3);
    tk.knob.style.background = rgba(mixc(WHITE, [170, 172, 184, 1], dim));
    tk.knobIc.style.opacity = sstep(4.1, 4.4, lt) * (1 - dim * .4);
    drawBar(lt, prg, sw, sstep(3.95, 4.5, lt), dim, reveal);

    const bg = mixc(mixc([TH.acc[0], TH.acc[1], TH.acc[2], .22], TH.light, done), [255, 255, 255, .12], dim);
    tk.cBtn.style.background = rgba(bg);
    tk.cBtn.style.color = rgba(mixc(mixc(TH.soft, [12, 20, 36, 1], done), [160, 162, 172, 1], dim));
    tk.cBtn.style.boxShadow = done > .01 && dim < .5 ? `0 0 ${(26 * done).toFixed(0)}px rgba(${rgb3(TH.glow)},${(.6 * done * (1 - dim)).toFixed(2)})` : 'none';
    tk.xBtn.style.opacity = 1 - .62 * done;
    if (lt > 2.85 && lt < 3.35) tapShow(tk.cBtn, prog(lt, 2.85, 3.35));
  },
});

function drawBar(lt, prg, sw, solid, dim, reveal) {
  const c = ctxs.bar, h = 34;
  c.clearRect(0, 0, sw, h);
  const a = clamp(reveal * 2) * (1 - .55 * dim);
  c.fillStyle = `rgba(255,255,255,${(.075 * a).toFixed(3)})`; rr(c, 0, 3, sw, h - 6, (h - 6) / 2); c.fill();
  const kx = prg * sw;
  if (kx > 4) {
    const pitch = 5.6, cols = Math.floor(kx / pitch);
    for (let i = 0; i < cols; i++) {
      const x = i * pitch + 3, f = x / kx, cc = f < .55 ? mixc(TH.b0, TH.b1, f / .55) : mixc(TH.b1, TH.b2, (f - .55) / .45);
      for (let r = -2; r <= 2; r++) {
        const rad = (.5 + 1.6 * Math.pow(f, 1.5)) * (Math.abs(r) === 2 ? .78 : 1);
        c.fillStyle = rgba(cc, clamp(.14 + .86 * Math.pow(f, 1.1)) * a * (1 - solid));
        c.beginPath(); c.arc(x, h / 2 + r * 5.4, rad, 0, 6.3); c.fill();
      }
    }
    if (solid > .01) {
      const g = c.createLinearGradient(0, 0, kx, 0);
      g.addColorStop(0, rgba(TH.b0)); g.addColorStop(.55, rgba(TH.b1)); g.addColorStop(1, rgba(TH.b2));
      c.globalAlpha = solid * a; c.fillStyle = g; rr(c, 0, 4, Math.max(kx, 8), h - 8, (h - 8) / 2); c.fill(); c.globalAlpha = 1;
    }
    c.fillStyle = `rgba(255,255,255,${(.8 * a * (1 - solid)).toFixed(3)})`;
    if (kx > sw * .46) { c.beginPath(); c.arc(sw * .42, h / 2, 2, 0, 6.3); c.fill(); }
  }
  const ahead = 1 - solid;
  if (sw * .8 > kx + 14) { c.fillStyle = `rgba(255,255,255,${(.34 * a * ahead).toFixed(3)})`; c.beginPath(); c.arc(sw * .8, h / 2, 2.4, 0, 6.3); c.fill(); }
  if (sw * .91 > kx + 14) { c.fillStyle = `rgba(255,255,255,${(.78 * a * ahead).toFixed(3)})`; c.beginPath(); c.arc(sw * .91, h / 2, 2.9, 0, 6.3); c.fill(); }
}

/* ════════════ 05 · COMPLETED ════════════ */
/* demo data: 14 weeks (Sun-first rows) ending Wed 14 Oct 2026 */
const HEAT = [
  [0, 2, 2, 0, 0, 3, 1, 1, 3, 1, 0, 0, 1, 3],
  [2, 4, 0, 3, 0, 3, 2, 2, 3, 3, 3, 2, 3, 3],
  [3, 1, 2, 0, 1, 3, 3, 2, 0, 3, 3, 3, 1, 1],
  [1, 0, 2, 4, 1, 3, 3, 1, 0, 0, 2, 0, 2, 0],
  [3, 1, 1, 2, 3, 0, 2, 1, 3, 0, 0, 1, 3, -1],
  [1, 1, 2, 0, 2, 0, 0, 2, 3, 0, 0, 1, 2, -1],
  [1, 1, 2, 2, 1, 1, 0, 3, 3, 0, 1, 0, 2, -1],
];
const cm = { cells: [], stats: [] };
SC.push({
  name: 'Completed', dur: 6.0,
  init() {
    const grid = $('#grid'), start = new Date(2026, 6, 12);
    for (let c = 0; c < 14; c++) for (let r = 0; r < 7; r++) {
      const l = HEAT[r][c], el = document.createElement('i');
      if (l < 0) el.className = 'void';
      else { el.dataset.l = l; if (c === 13 && r === 3) el.className = 'today'; }
      el.dataset.c = c; el.dataset.r = r;
      grid.append(el); cm.cells.push({ el, c, r, l, h: hash(c * 17 + r, 9) });
    }
    const mo = $('#months');
    [['Jul', 0], ['Aug', 3], ['Sep', 8], ['Oct', 12]].forEach(([n, c]) => { const e = document.createElement('em'); e.textContent = n; e.style.left = (c / 14 * 100) + '%'; mo.append(e); });
    cm.mo = mo; cm.head = $('#cmHead'); cm.leg = $('#cmLeg'); cm.box = $('#cmStats'); cm.root = $('#cm'); cm.tip = $('#tip'); cm.grid = grid;
    cm.stats = $$('#cmStats > div');
    cm.today = cm.cells.find(c => c.el.classList.contains('today'));
    const fmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    grid.addEventListener('pointermove', e => {
      const i = e.target.closest && e.target.closest('i');
      if (!i || i.classList.contains('void') || cur !== 4) return cmTip(null);
      const lt = curLt(4); if (lt < 2 || lt > 4.9) return cmTip(null);
      holdFor(1.4);
      const c = +i.dataset.c, r = +i.dataset.r, d = new Date(start.getTime() + (c * 7 + r) * 864e5);
      const n = i.classList.contains('today') ? null : [0, 1, 2, 4, 7][+i.dataset.l];
      cmTip(i, `${n === null ? 'Today · in progress' : n + (n === 1 ? ' task' : ' tasks')}<small>${fmt.format(d)}</small>`);
    });
    grid.addEventListener('pointerleave', () => cmTip(null));
  },
  enter() { cmTip(null); },
  leave() { cmTip(null); },
  render(lt) {
    const ex = prog(lt, 5.0, 5.85);
    for (const o of cm.cells) {
      const start = .25 + (13 - o.c) * .055 + o.r * .014 + o.h * .1;
      const p = prog(lt, start, start + .5);
      let op = eo3(p), tx = 0, bl = (1 - p) * 3.2, sc = lerp(.35, 1, eoB(p));
      if (o === cm.today) { op = clamp(p * 1.6) * (1 - sstep(5.55, 5.8, lt)); }
      else if (ex > 0) { const q = prog(ex, (1 - o.c / 14) * .35, (1 - o.c / 14) * .35 + .5); op *= 1 - q; tx = -q * (24 + o.h * 50); bl += q * 6; }
      const s = o.el.style;
      s.opacity = op.toFixed(3);
      const scT = o === cm.today ? (p < 1 ? sc : 1 + .45 * sstep(5.1, 5.5, lt)) : sc;
      s.transform = p < 1 || ex > 0 || o === cm.today ? `translateX(${tx.toFixed(1)}px) scale(${scT.toFixed(3)})` : 'none';
      s.filter = bl > .1 ? `blur(${bl.toFixed(2)}px)` : 'none';
    }
    const glowT = sstep(5.1, 5.45, lt);
    cm.today.el.style.background = glowT > .01 ? rgba(WHITE, glowT) : '';
    cm.today.el.style.boxShadow = glowT > .01 ? `0 0 ${(26 * glowT).toFixed(0)}px rgba(${rgb3(TH.glow)},.95)` : '';
    const fade = 1 - prog(lt, 5.0, 5.5), hA = prog(lt, .9, 1.5);
    cm.head.style.opacity = hA * fade; cm.head.style.transform = `translateY(${((1 - hA) * 8).toFixed(1)}px)`;
    cm.mo.style.opacity = prog(lt, 1.1, 1.6) * fade;
    cm.leg.style.opacity = prog(lt, 1.7, 2.2) * fade;
    cm.box.style.borderColor = `rgba(255,255,255,${(.1 * prog(lt, 2.0, 2.5) * fade).toFixed(3)})`;
    cm.stats.forEach((d, i) => {
      const s0 = 2.1 + i * .18, p = prog(lt, s0, s0 + .55), b = d.firstElementChild;
      d.style.opacity = eo3(p) * fade; d.style.filter = p < 1 ? `blur(${((1 - p) * 4).toFixed(1)}px)` : 'none';
      const v = +b.dataset.v, dd = +b.dataset.d, q = eo3(prog(lt, s0, s0 + 1));
      b.textContent = (v * q).toFixed(dd);
    });
    if (fade < .98) cmTip(null);
  },
});
function cmTip(i, html) {
  const t = cm.tip;
  $$('#grid .hov').forEach(e => e.classList.remove('hov'));
  if (!i) { t.style.opacity = 0; return; }
  i.classList.add('hov');
  const r = rectW(i), b = rectW(cm.root);
  t.innerHTML = html; t.style.opacity = 1;
  t.style.left = (r.cx - b.x) + 'px'; t.style.top = (r.y - b.y) + 'px';
}

/* ════════════ 06 · WELCOME ════════════ */
const wl = { text: 'Welcome to Orbit.', pos: [], spans: [] };
SC.push({
  name: 'Orbit', dur: 6.6,
  init() {
    const t = $('#wlTitle');
    [...wl.text].forEach(ch => { const s = document.createElement('span'); s.textContent = ch; t.append(s); wl.spans.push(s); });
    wl.soon = $('#soon'); wl.title = t;
    window.__onLayout = wlMeasure;
  },
  enter() { wl.spans.forEach((s, i) => { s.textContent = wl.text[i]; }); },
  render(lt) {
    const out = 1 - sstep(5.7, 6.5, lt);
    if (!wl.pos.length) wlMeasure();
    const u = eio2(prog(lt, 1.0, 2.35)), x0 = wl.pos[0].x - 22, xl = wl.pos[wl.pos.length - 1].x;
    const reach = lerp(x0, xl + 70, u), back = eio3(prog(lt, 2.35, 2.8));
    wl.head = { x: lerp(reach, xl, back), y: wl.base, u };
    wl.spans.forEach((s, i) => {
      const q = clamp((reach - (wl.pos[i].x - 14)) / 60) * (lt > 1.0 ? 1 : 0);
      if (q <= 0) { s.style.opacity = 0; return; }
      if (q < 1 && wl.text[i] !== ' ' && wl.text[i] !== '.') s.textContent = q < .55 ? 'abcdefghilmnoprtw'[Math.random() * 17 | 0] : wl.text[i]; else s.textContent = wl.text[i];
      s.style.opacity = (q * out).toFixed(3);
      s.style.filter = q < 1 ? `blur(${((1 - q) * 5).toFixed(1)}px)` : 'none';
      s.style.transform = q < 1 ? `translateY(${((1 - q) * 6).toFixed(1)}px)` : 'none';
    });
    wl.soon.style.opacity = sstep(3.3, 3.9, lt) * out;
    wl.soon.style.filter = `blur(${((1 - sstep(3.3, 3.9, lt)) * 4).toFixed(1)}px)`;
    wl.smoke = sstep(2.3, 3.8, lt) * out;
    wl.dotA = lt > .7 ? (1 - sstep(2.75, 3.3, lt)) * (lt < 1.0 ? .75 + .25 * Math.sin(lt * 30) : 1) : 0;
  },
});
function wlMeasure() {
  if (!wl.spans.length) return;
  const tr = rectW(wl.title);
  wl.pos = wl.spans.map(s => { const r = rectW(s); return { x: r.cx, w: r.w }; });
  wl.base = tr.cy + tr.h * .3;
}
