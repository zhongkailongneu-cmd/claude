// Render single frames to PNG for checking a scene without a full render.
//   node render/still.mjs out/stills 0:20.0 45.2 bar:76.5 ...
// A time can be seconds, m:ss.s, or bar:N (N may be fractional).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { serve } from "./server.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [outDir, ...times] = process.argv.slice(2);
const tl = JSON.parse(fs.readFileSync(path.join(ROOT, "timeline.json"), "utf8"));
const BAR = (60 / tl.meta.bpm) * tl.meta.beatsPerBar;

function toFrame(s) {
  let sec;
  if (s.startsWith("bar:")) sec = Number(s.slice(4)) * BAR;
  else if (s.includes(":")) {
    const [m, x] = s.split(":");
    sec = Number(m) * 60 + Number(x);
  } else sec = Number(s);
  return Math.round(sec * tl.meta.fps);
}

fs.mkdirSync(outDir, { recursive: true });
const server = await serve(ROOT);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on("pageerror", (e) => console.error("pageerror:", e.message));
page.on("console", (m) => m.type() === "error" && console.error("console:", m.text()));
await page.goto(`http://127.0.0.1:${server.address().port}/render/index.html`);
await page.evaluate(() => window.ready);
for (const s of times) {
  const f = toFrame(s);
  const ms = await page.evaluate((i) => {
    const t0 = performance.now();
    window.renderFrame(i);
    return performance.now() - t0;
  }, f);
  const file = path.join(outDir, `f${String(f).padStart(5, "0")}.png`);
  await page.locator("#c").screenshot({ path: file });
  console.log(`${s} -> frame ${f} (${ms.toFixed(0)} ms) ${file}`);
}
await browser.close();
server.close();
