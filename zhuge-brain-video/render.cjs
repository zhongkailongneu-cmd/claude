// Deterministic frame renderer: drives window.__render(t) in index.html and pipes JPEG frames to ffmpeg.
//   node render.cjs timeline <dir>             -> timeline.json + subtitles.srt
//   node render.cjs stills <dir> <t> [t ...]   -> PNG previews at the given seconds
//   node render.cjs video <out.mp4> [workers]  -> silent H.264 video (parallel segments, concatenated)
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const FPS = 30;
const PAGE = 'file://' + path.resolve(__dirname, 'index.html');

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(PAGE);
  await page.waitForFunction(() => window.__ready === true);
  // load every face up front: hidden scenes would otherwise trigger late font swaps
  await page.evaluate(async () => {
    const all = document.documentElement.innerHTML;
    const faces = ['600 20px "Noto Serif SC"', '900 20px "Noto Serif SC"', '400 20px "Noto Sans SC"', '500 20px "Noto Sans SC"', '700 20px "Noto Sans SC"'];
    await Promise.all(faces.map(f => document.fonts.load(f, all)));
    await document.fonts.ready;
  });
  return page;
}

const srtTime = t => {
  const ms = Math.round(t * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
};

async function timeline(dir) {
  const browser = await chromium.launch();
  const page = await openPage(browser);
  const tl = await page.evaluate(() => window.__timeline);
  await browser.close();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(tl, null, 2));
  const srt = tl.caps.map((c, i) => `${i + 1}\n${srtTime(c.s)} --> ${srtTime(c.e)}\n${c.text}\n`).join('\n');
  fs.writeFileSync(path.join(dir, 'subtitles.srt'), srt);
  console.log(`total ${tl.total.toFixed(2)}s, ${tl.caps.length} captions`);
  return tl;
}

async function stills(dir, times) {
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const page = await openPage(browser);
  for (const t of times) {
    await page.evaluate(x => window.__render(x), t);
    await page.screenshot({ path: path.join(dir, `still_${String(t).replace('.', '_')}.png`) });
  }
  await browser.close();
}

async function segment(f0, f1, out) {
  const browser = await chromium.launch();
  const page = await openPage(browser);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-g', '150', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))));
  for (let f = f0; f < f1; f++) {
    await page.evaluate(x => window.__render(x), f / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if ((f - f0) % 300 === 0) console.log(`[${path.basename(out)}] ${f - f0}/${f1 - f0}`);
  }
  ff.stdin.end();
  await done;
  await browser.close();
}

async function video(out, workers) {
  const tl = await timeline(path.dirname(path.resolve(out)));
  const frames = Math.ceil(tl.total * FPS);
  const tmp = fs.mkdtempSync(path.join(path.dirname(path.resolve(out)), '.seg-'));
  const per = Math.ceil(frames / workers);
  const segs = [];
  for (let i = 0; i < workers; i++) {
    const f0 = i * per, f1 = Math.min(frames, f0 + per);
    if (f0 < f1) segs.push({ f0, f1, file: path.join(tmp, `seg${i}.mp4`) });
  }
  await Promise.all(segs.map(s => segment(s.f0, s.f1, s.file)));
  const list = path.join(tmp, 'list.txt');
  fs.writeFileSync(list, segs.map(s => `file '${s.file}'`).join('\n'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out]);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`wrote ${out}: ${frames} frames`);
}

(async () => {
  const [mode, a, ...rest] = process.argv.slice(2);
  if (mode === 'timeline') await timeline(a);
  else if (mode === 'stills') await stills(a, rest.map(Number));
  else if (mode === 'video') await video(a, Number(rest[0] || 3));
  else throw new Error('usage: timeline|stills|video');
})().catch(e => { console.error(e); process.exit(1); });
