// Multi-process frame renderer.
//   node tools/render.mjs --out <dir> [--width 1920] [--workers 3] [--start 0] [--end N] [--quality 95]
// Frames already on disk are skipped, so an interrupted run can simply be restarted.
import { chromium } from 'playwright-core';
import { serve } from './serve.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(args.out || 'frames');
const W = +args.width || 1920;
const quality = +args.quality || 95;

if (process.env.RENDER_WORKER) {
  const [k, n, start, end] = JSON.parse(process.env.RENDER_WORKER);
  const { server, port } = await serve(root);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: W, height: Math.round(W * 9 / 16) } });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/src/index.html?w=${W}&rs=${args.rs || 1}`);
  await page.waitForFunction('window.ready === true', null, { timeout: 300000 });
  let done = 0;
  for (let f = start + k; f < end; f += n) {
    const file = path.join(outDir, `f${String(f).padStart(5, '0')}.jpg`);
    if (fs.existsSync(file)) continue;
    await page.evaluate((f) => window.renderFrame(f), f);
    const buf = await page.screenshot({ type: 'jpeg', quality });
    fs.writeFileSync(file + '.tmp', buf);
    fs.renameSync(file + '.tmp', file);
    done++;
    if (done % 25 === 0) process.send({ k, done, f });
  }
  process.send({ k, finished: true, done });
  await browser.close(); server.close();
  process.exit(0);
} else {
  fs.mkdirSync(outDir, { recursive: true });
  const workers = +args.workers || 3;
  const total = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'timeline.json'), 'utf8')).frames;
  const start = +args.start || 0, end = Math.min(+args.end || total, total);
  const t0 = Date.now();
  let finished = 0, count = 0;
  const per = new Array(workers).fill(0);
  await new Promise((resolve) => {
    for (let k = 0; k < workers; k++) {
      const child = fork(fileURLToPath(import.meta.url), process.argv.slice(2), { env: { ...process.env, RENDER_WORKER: JSON.stringify([k, workers, start, end]) } });
      child.on('message', (m) => {
        if (m.finished) { per[k] = m.done; finished++; if (finished === workers) resolve(); return; }
        per[k] = m.done;
        count = per.reduce((a, b) => a + b, 0);
        const el = (Date.now() - t0) / 1000;
        console.log(`rendered ~${count}/${end - start} frames  ${(count / el).toFixed(2)} fps  elapsed ${el.toFixed(0)}s  eta ${(((end - start) - count) / (count / el) / 60).toFixed(1)} min`);
      });
      child.on('exit', (code) => { if (code !== 0 && finished < workers) { console.error(`worker ${k} exited with ${code}`); finished++; if (finished === workers) resolve(); } });
    }
  });
  console.log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
}
