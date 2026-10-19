// Full render: frames from headless Chromium -> H.264 segments -> MP4 with the BGM.
//   node render/render.mjs                    all frames, one worker per CPU
//   node render/render.mjs --workers 2        fewer parallel browsers
//   node render/render.mjs --from 0:20 --to 0:40 --out out/clip.mp4
// Each worker owns a contiguous frame range and pipes PNG frames into its own
// ffmpeg; the segments are then joined without re-encoding and muxed with
// build/bgm.wav. Frames are pure functions of time, so ranges are independent.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { serve } from "./server.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = path.join(ROOT, "build");
const tl = JSON.parse(fs.readFileSync(path.join(ROOT, "timeline.json"), "utf8"));
const FPS = tl.meta.fps;
const BAR = (60 / tl.meta.bpm) * tl.meta.beatsPerBar;
const TOTAL = Math.round(tl.meta.totalBars * BAR * FPS);

const opt = { workers: os.cpus().length, crf: 20, preset: "slow", out: "out/brain-atlas.mp4", from: "0", to: null };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) opt[argv[i].replace(/^--/, "")] = argv[i + 1];

function toFrame(s) {
  if (s == null) return TOTAL;
  let sec;
  if (String(s).startsWith("bar:")) sec = Number(s.slice(4)) * BAR;
  else if (String(s).includes(":")) {
    const [m, x] = s.split(":");
    sec = Number(m) * 60 + Number(x);
  } else sec = Number(s);
  return Math.min(TOTAL, Math.max(0, Math.round(sec * FPS)));
}

for (const f of ["beatmap.json", "bgm.wav"]) {
  if (!fs.existsSync(path.join(BUILD, f))) {
    console.error(`build/${f} is missing: run "python3 music/synth.py" first.`);
    process.exit(1);
  }
}

const first = toFrame(opt.from), last = toFrame(opt.to);
const workers = Math.max(1, Math.min(Number(opt.workers), last - first));
const out = path.resolve(ROOT, opt.out);
const segDir = path.join(BUILD, "segments");
fs.rmSync(segDir, { recursive: true, force: true });
fs.mkdirSync(segDir, { recursive: true });
fs.mkdirSync(path.dirname(out), { recursive: true });

// sRGB canvas -> BT.709 limited-range 4:2:0, tagged so players do not guess.
const COLOR = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];
const VF = "scale=in_range=pc:out_range=tv:out_color_matrix=bt709:flags=accurate_rnd+full_chroma_int,format=yuv420p";

function run(cmd, args, stdin = "ignore") {
  const p = spawn(cmd, args, { stdio: [stdin, "ignore", "pipe"] });
  let err = "";
  p.stderr.on("data", (d) => (err = (err + d).slice(-4000)));
  p.done = new Promise((res, rej) => p.on("close", (c) => (c === 0 ? res() : rej(new Error(`${cmd} exited ${c}\n${err}`)))));
  return p;
}

const server = await serve(ROOT);
const url = `http://127.0.0.1:${server.address().port}/render/index.html`;
const done = new Array(workers).fill(0);
const t0 = Date.now();

async function worker(w, a, b, file) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on("pageerror", (e) => console.error(`[w${w}] pageerror:`, e.message));
  await page.goto(url);
  await page.evaluate(() => window.ready);
  const ff = run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
    "-vf", VF, "-c:v", "libx264", "-preset", opt.preset, "-crf", String(opt.crf),
    "-tune", "animation", "-g", String(FPS * 2), "-threads", "1", ...COLOR, file,
  ], "pipe");
  for (let i = a; i < b; i++) {
    const data = await page.evaluate((i) => {
      window.renderFrame(i);
      return document.getElementById("c").toDataURL("image/png");
    }, i);
    const buf = Buffer.from(data.slice(data.indexOf(",") + 1), "base64");
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    done[w]++;
  }
  ff.stdin.end();
  await ff.done;
  await browser.close();
}

const ticker = setInterval(() => {
  const n = done.reduce((x, y) => x + y, 0), s = (Date.now() - t0) / 1000;
  const eta = n ? ((last - first - n) * s) / n : 0;
  console.log(`${n}/${last - first} frames  ${(n / s).toFixed(1)} fps  eta ${eta.toFixed(0)} s`);
}, 15000);

const segs = [];
const jobs = [];
const per = Math.ceil((last - first) / workers);
for (let w = 0; w < workers; w++) {
  const a = first + w * per, b = Math.min(last, a + per);
  if (a >= b) break;
  const file = path.join(segDir, `seg${w}.mp4`);
  segs.push(file);
  jobs.push(worker(w, a, b, file));
}
try {
  await Promise.all(jobs);
} finally {
  clearInterval(ticker);
  server.close();
}
console.log(`frames done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);

const list = path.join(segDir, "list.txt");
fs.writeFileSync(list, segs.map((s) => `file '${s}'`).join("\n") + "\n");
const startSec = first / FPS, durSec = (last - first) / FPS;
await run("ffmpeg", [
  "-hide_banner", "-loglevel", "error", "-y",
  "-f", "concat", "-safe", "0", "-i", list,
  "-ss", String(startSec), "-t", String(durSec), "-i", path.join(BUILD, "bgm.wav"),
  "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k",
  "-t", String(durSec), "-movflags", "+faststart", out,
]).done;
const mb = fs.statSync(out).size / 1e6;
console.log(`wrote ${path.relative(ROOT, out)} (${mb.toFixed(1)} MB, ${durSec.toFixed(1)} s)`);
