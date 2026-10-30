/* ───────── timeline, comets, controls ───────── */
let TOTAL = 0;
SC.forEach((s, i) => { s.t0 = TOTAL; TOTAL += s.dur; s.el = $('#s' + i); });
const t_ = (i, lt) => SC[i].t0 + lt;
function seekTo(i, lt) { T = SC[i].t0 + lt; holdUntil = 0; }

/* analytic anchors, so comets can aim at scenes that are not on screen yet */
const A = {
  cubeStart: () => [WW / 2 - U.tw / 2 + U.cube / 2, CY + 8],
  cubeEnd: () => [WW / 2 + U.tw / 2 - U.cube / 2, CY + 8],
  orb: (nx, ny) => [WW / 2 + (nx - .5) * U.prW, CY - 20 + (ny - .5) * U.prH],
  mic: () => [WW / 2 - U.cpW / 2 + 38, CY - U.cpH / 2 - 10 + U.cpH - 38],
  pill: () => [WW / 2, CY],
  today: () => {
    const g = rectW($('#grid')), cw = (g.w - 13 * 6) / 14;
    return [g.x + 13 * (cw + 6) + cw / 2, g.y + 3 * (cw + 6) + cw / 2];
  },
  wl: () => { if (!wl.pos.length) wlMeasure(); return [wl.pos[0].x - 22, wl.base]; },
};
const comets = [
  { a: t_(0, .02), b: t_(0, .95), len: .3, w: 3.4, make: () => { const e = A.cubeStart(); return bez([WW + 70, -60], [WW * .7, WH * .08], [e[0] + 120, e[1] - 230], e); } },
  { a: t_(0, 4.3), b: t_(1, .78), len: .32, w: 3.2, make: () => { const s = A.cubeEnd(), e = A.orb(.5, .78); return bez(s, [s[0] + 140, s[1] - 250], [e[0] - 30, e[1] - 380], e); } },
  { a: t_(1, 5.4), b: t_(2, .55), len: .3, w: 3, make: () => { const s = A.orb(.8, .22), e = A.mic(); return bez(s, [s[0] - 120, s[1] - 200], [e[0] - 160, e[1] - 300], e); } },
  { a: t_(2, 7.28), b: t_(3, .5), len: .34, w: 3.2, make: () => { const r = rectW(cpS.send), s = [r.cx, r.cy], e = A.pill(); return bez(s, [s[0] + 70, s[1] - 330], [e[0] + 30, e[1] - 420], e); } },
  { a: t_(4, -.85), b: t_(4, .25), len: .3, w: 3.2, make: () => { const e = A.today(); return bez([e[0] - 150, -50], [e[0] - 90, e[1] * .35], [e[0] - 30, e[1] * .7], e); } },
  { a: t_(4, 5.35), b: t_(5, .75), len: .3, w: 3, make: () => { const s = A.today(), e = A.wl(); return bez(s, [s[0] + 90, s[1] + 160], [e[0] + 260, e[1] + 200], e); } },
  { a: t_(5, 0), b: t_(5, .95), len: .5, w: 2.6, make: () => bez([WW * .5, WH + 60], [WW * .5 + 40, WH * .82], [WW * .6, WH * .78], [WW * .66, WH * .7]) },
  { a: t_(5, .12), b: t_(5, 1.05), len: .5, w: 2.4, make: () => bez([WW + 50, WH * .95], [WW * .96, WH * .82], [WW * .91, WH * .74], [WW * .86, WH * .7]) },
];
const prevLayoutHook = window.__onLayout;
window.__onLayout = () => { prevLayoutHook && prevLayoutHook(); comets.forEach(c => { c.path = null; }); };

function drawFX() {
  const ff = $('#fx'), fb = $('#fxb'), c = ctxs.fx, b = ctxs.fxb;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, ff.width, ff.height); c.setTransform(k * DPR, 0, 0, k * DPR, 0, 0);
  b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(0, 0, fb.width, fb.height); b.setTransform(k * DPR, 0, 0, k * DPR, 0, 0);
  for (const cm_ of comets) {
    const u = (T - cm_.a) / (cm_.b - cm_.a);
    if (u < 0 || u > 1.32) { cm_.path = null; continue; }
    if (!cm_.path) cm_.path = cm_.make();
    drawComet(c, T, cm_);
  }
  if (cur === 5) {
    const lt = curLt(5);
    if (wl.dotA > .01 && wl.head) {
      const h = wl.head, sp = Math.sin(Math.PI * clamp(h.u));
      if (sp > .05) {
        const g = c.createLinearGradient(h.x - 80 * sp, h.y, h.x, h.y);
        g.addColorStop(0, rgba(TH.glow, 0)); g.addColorStop(1, rgba(mixc(TH.glow, WHITE, .7), .8 * wl.dotA));
        c.strokeStyle = g; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(h.x - 80 * sp, h.y); c.lineTo(h.x, h.y); c.stroke();
      }
      glowDot(c, h.x, h.y, 20, wl.dotA, TH.glow);
      c.fillStyle = `rgba(255,255,255,${wl.dotA.toFixed(3)})`; c.beginPath(); c.arc(h.x, h.y, 3.3, 0, 6.3); c.fill();
    }
    drawSmoke(b, lt, wl.smoke || 0);
  }
}

/* ───────── scene activation & main loop ───────── */
function activate(i) {
  if (i === cur) return;
  if (cur >= 0) { SC[cur].leave && SC[cur].leave(); SC[cur].el.classList.remove('on'); }
  cur = i;
  SC[i].el.classList.add('on');
  SC[i].enter && SC[i].enter();
}
let last = performance.now(), frameN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  try { step(dt); } catch (err) { if (!frame.warned) { frame.warned = true; console.error('aureole frame error', err); } }
}
function step(dt) {
  tickTheme(dt);
  const hold = isHeld() || lv.drag.on || pr.drag.on || tk.drag.on;
  if (!paused && !hold) { T += dt; if (T >= TOTAL) T -= TOTAL; }
  let i = SC.findIndex(s => T >= s.t0 && T < s.t0 + s.dur);
  if (i < 0) i = SC.length - 1;
  activate(i);
  tapOn = false;
  SC[i].render(T - SC[i].t0, dt);
  if (!tapOn) tapEl.style.opacity = 0;
  drawFX();
  if ((frameN++ & 3) === 0) updateChapters();
}

/* ───────── dock ───────── */
const chap = $('#chap');
SC.forEach((s, i) => {
  const b = document.createElement('button');
  b.type = 'button'; b.dataset.i = i; b.setAttribute('aria-label', s.name);
  b.innerHTML = `${s.name}<i></i>`;
  b.addEventListener('click', () => { seekTo(i, 0); paused = false; syncPlay(); });
  chap.append(b);
});
function updateChapters() {
  $$('button', chap).forEach((b, i) => {
    const p = i < cur ? 1 : i > cur ? 0 : clamp((T - SC[i].t0) / SC[i].dur);
    b.style.setProperty('--p', p.toFixed(3));
    b.classList.toggle('cur', i === cur);
  });
}
function syncPlay() {
  $('#icPause').style.display = paused ? 'none' : '';
  $('#icPlay').style.display = paused ? '' : 'none';
  $('#btnPlay').setAttribute('aria-label', paused ? '播放' : '暂停');
}
function togglePlay() { paused = !paused; syncPlay(); }
$('#btnPlay').addEventListener('click', togglePlay);
$('#btnReplay').addEventListener('click', () => { T = 0; holdUntil = 0; paused = false; syncPlay(); });
$$('#themes button').forEach(b => b.addEventListener('click', () => setTheme(b.dataset.theme)));
const dock = $('#dock');
dock.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') { dock.classList.add('touch'); clearTimeout(dock._t); dock._t = setTimeout(() => dock.classList.remove('touch'), 3500); } });
addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const kk = e.key;
  if (kk === ' ' || kk === 'k') { e.preventDefault(); togglePlay(); }
  else if (kk === '1') setTheme('orbit'); else if (kk === '2') setTheme('loyel'); else if (kk === '3') setTheme('aurora');
  else if (kk === 'ArrowRight') { seekTo((cur + 1) % SC.length, 0); }
  else if (kk === 'ArrowLeft') { seekTo((cur - 1 + SC.length) % SC.length, 0); }
  else if (kk === 'r') { T = 0; holdUntil = 0; paused = false; syncPlay(); }
});
stage.addEventListener('pointermove', e => { ptr.x = e.clientX / k; ptr.y = e.clientY / k; ptr.on = true; });
stage.addEventListener('pointerleave', () => { ptr.x = ptr.y = -999; });

/* ───────── boot ───────── */
SC.forEach(s => s.init && s.init());
layout();
let saved = null; try { saved = localStorage.getItem('aureole-theme'); } catch (e) { /* ignore */ }
setTheme(THEMES[saved] ? saved : 'loyel', true);
applyCSS();
if (matchMedia('(prefers-reduced-motion: reduce)').matches) { paused = true; T = t_(3, 2.9); }
syncPlay();
addEventListener('resize', () => requestAnimationFrame(layout));
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { layout(); });
setTimeout(() => { const h = $('#hint'); if (h) h.style.transition = 'opacity 1.2s', h.style.opacity = 0; }, 9000);
requestAnimationFrame(frame);

/* small hook for testing and embedding */
window.aureole = {
  get T() { return T; }, total: TOTAL, scenes: SC.map(s => ({ name: s.name, t0: s.t0, dur: s.dur })),
  seek: t => { T = t; holdUntil = 0; }, seekScene: seekTo,
  pause: () => { paused = true; syncPlay(); }, play: () => { paused = false; syncPlay(); }, theme: setTheme,
};
