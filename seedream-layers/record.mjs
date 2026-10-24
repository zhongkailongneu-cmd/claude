// Record the page's idle tour as a vertical 1080×1920 MP4, one frame at a time on a fake clock,
// so every frame is exactly 1/fps apart however long a screenshot takes.
// Run: node record.mjs --surface light|dark|black [--seconds 32] [--fps 30] [--out file.mp4]
// Needs the forced builds first: node build.mjs --light / --dark / --black
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
let playwright;
try { playwright = require("playwright"); } catch { playwright = require("/opt/node-tools/node_modules/playwright"); }

const arg = (name, fallback) => {
  const i = process.argv.indexOf("--" + name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const surface = arg("surface", "light");
const seconds = Number(arg("seconds", 32));
const fps = Number(arg("fps", 30));
const out = arg("out", join(HERE, `seedream-layers-${surface}.mp4`));
const page_ = join(HERE, `seedream-layers-${surface}.html`);

const VIEW = { width: 360, height: 640 };   // 9:16 phone screen
const SCALE = 3;                             // → 1080 × 1920

// For a short video: keep the kicker, headline, card and scene buttons; drop the long text below.
const VIDEO_CSS = `
.sl-head p:not(.sl-kicker),.sl-section,.iso-legend,.as-picker{display:none!important}
.iso-page{padding-block:0!important;min-height:100vh;display:flex;flex-direction:column;justify-content:center}
.sl-head h1{margin-bottom:0!important}
.iso-figure{margin:18px 0 0!important}
.iso-plate{padding:40px 12px 54px!important}
.sl-scenes{gap:6px!important;flex-wrap:nowrap!important;justify-content:space-between}
.sl-scene{font-size:11px!important;padding:7px 9px!important;min-height:30px!important;gap:4px!important}
html,body{overflow:hidden}
`;

const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: SCALE });
const page = await context.newPage();
const START = new Date("2026-10-24T09:00:00Z").getTime();
await page.clock.install({ time: START });
await page.clock.pauseAt(START + 1000);      // stop the clock flowing on its own; frames advance it by hand
await page.goto(pathToFileURL(page_).href);
await page.addStyleTag({ content: VIDEO_CSS });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);              // real time: let the IntersectionObserver report the figure as visible
await page.clock.runFor(50);

const ffmpeg = spawn("ffmpeg", [
  "-y", "-loglevel", "error",
  "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
  "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
  "-metadata", `title=Seedream 图层光具座 · ${surface}`,
  out,
], { stdio: ["pipe", "inherit", "inherit"] });
const done = new Promise((resolve, reject) => ffmpeg.on("close", (code) => (code === 0 ? resolve() : reject(new Error("ffmpeg exited " + code)))));

const frames = Math.round(seconds * fps);
const step = 1000 / fps;
let clock = 0;
for (let i = 0; i < frames; i++) {
  const shot = await page.screenshot({ type: "jpeg", quality: 94 });
  if (!ffmpeg.stdin.write(shot)) await new Promise((r) => ffmpeg.stdin.once("drain", r));
  const next = Math.round((i + 1) * step);
  await page.clock.runFor(next - clock);
  clock = next;
  if (i % (fps * 4) === 0) process.stdout.write(`${surface} ${(i / fps).toFixed(0)}s · ${await page.locator("[data-readout]").textContent()}\n`);
}
ffmpeg.stdin.end();
await done;
await browser.close();
console.log("wrote", out);
