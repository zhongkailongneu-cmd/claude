// Starter: a one-compartment PK tank, wired to the anatomy kit, the three surfaces, the evidence registry and
// the Chinese copy template. Grow it into a full anatomy figure (40–80 parts); keep the wiring.
// Run: node starter-build.mjs [--light|--navy|--black]   (ARTIFACT_OUT=path writes the Artifact fragment)
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const skills = join(homedir(), ".claude/skills");
const synced = existsSync(join(skills, "synced")) ? readdirSync(join(skills, "synced")).map((d) => join(skills, "synced", d)) : [];
const first = (paths, file) => paths.find((p) => p && existsSync(join(p, file)));
// The anatomy kit and this skill's assets, wherever they are installed.
const ANATOMY = first([process.env.ANATOMY, join(HERE, "../../anatomy"), join(skills, "anatomy"), join(process.cwd(), ".claude/skills/anatomy"), ...synced.map((d) => join(d, "anatomy"))], "kit/iso-kit.mjs");
const ASSETS = first([process.env.MM_ASSETS, HERE, join(skills, "med-mechanism-figures/assets"), ...synced.map((d) => join(d, "med-mechanism-figures/assets"))], "surfaces.mjs");
if (!ANATOMY) throw new Error("找不到 anatomy skill：安装它，或设置 ANATOMY=/path/to/anatomy");
if (!ASSETS) throw new Error("找不到 med-mechanism-figures/assets：设置 MM_ASSETS=/path/to/assets");
const load = (dir, file) => import(pathToFileURL(join(dir, file)).href);
const k = await load(ANATOMY, "kit/iso-kit.mjs");
const G = await load(ANATOMY, "kit/lathe.mjs");
const { kitScript } = await load(ANATOMY, "scripts/inline-kit.mjs");
const { pageDocument, pickerHtml } = await load(ASSETS, "surfaces.mjs");
const { defineSources, defineParams, value, mark, auditOrExit, sourcesHtml, EVIDENCE_CSS } = await load(ASSETS, "evidence.mjs");

// ── 1. Evidence first: every number on the page is registered here ──
const SOURCES = defineSources([
  { id: "rowland", cite: "Rowland M, Tozer TN · Clinical Pharmacokinetics and Pharmacodynamics: Concepts and Applications（教科书，用前写明版次）", level: "D", supports: "一室模型与一级消除 C(t) = C₀·e^(−kt)；蓄积因子 R = 1/(1 − e^(−kτ))" },
]);
const PARAMS = defineParams([
  { id: "dose", label: "单次剂量", value: 1000, unit: "mg", level: "S" },
  { id: "V", label: "表观分布容积", value: 50, unit: "L", level: "S" },
  { id: "half", label: "半衰期 t½", value: 6, unit: "h", level: "S" },
  { id: "tau", label: "给药间隔 τ", value: 8, unit: "h", level: "S" },
]);
const DOSE = value(PARAMS, "dose"), V = value(PARAMS, "V"), HALF = value(PARAMS, "half"), TAU = value(PARAMS, "tau");
const KEL = Math.LN2 / HALF;
const M_MODEL = mark("rowland", SOURCES);

// ── 2. The machine: a graduated glass tank on a plate; level = concentration ──
const WIDTH = 600, HEIGHT = 360;
const PLATE = { x: -70, y: -48, w: 150, d: 96, r: 8 };
const TANK = { r: 26, z0: 5, z1: 92 };
const LEVEL_MAX = TANK.z1 - TANK.z0 - 8;     // liquid height at C_FULL
const C_FULL = 40;                            // mg/L at LEVEL_MAX
const P = k.fitProjection([...k.boxCorners(PLATE, -17, 0), [0, 0, TANK.z1 + 2], [44, 0, 20]], WIDTH, HEIGHT, { pad: 28, azimuth: 40 });
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const at = (point) => k.iso(point, P);

function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -17, 12, P)}"/>`];
  for (const [x, y] of k.corners(PLATE, 20).sort((a, b) => k.depthOf([...a, 0], P) - k.depthOf([...b, 0], P))) {
    out.push(S(k.cylinder(x, y, 6.5, -17, 1.6, P, 24), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5, -15.4, 3.4, P, 24), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -12, 12, P, 8, 1.4), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2, 0, P, 16)).join(""), { tone: "lo" }), D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  const label = { x: -62, y: 30, w: 40, d: 10, r: 1.2 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 3), { tone: "lo", crease: "none" }));
  out.push(k.faceTextSvg(k.topMatrix([label.x + 4, label.y + 6], 0.8, P, "x"), "1-COMPARTMENT", { size: 2.4, tone: "mid" }));
  out.push(S(k.cylinder(0, 0, TANK.r + 3, 0, TANK.z0, P, 48, 0.8), { tone: "mid" }));
  return out.join("");
}
// The outlet leaves the tank wall along +x at the bottom; its valve stands for clearance (CL).
function outlet() {
  const F = G.frameAlong([0, 0, 11], [1, 0, 0]);
  const start = Math.sqrt(TANK.r ** 2 - 2.2 ** 2);
  return S(G.disc(start, 44, 2.2, F, P), { tone: "mid" }) + S(k.cylinder(36, 0, 3.2, 13, 3, P, 24), { tone: "mid" }) + L(k.knurl(36, 0, 3.2, 13, 16, 24, P), { tone: "lo" });
}
function glass() {
  const wall = k.cylinder(0, 0, TANK.r, TANK.z0, TANK.z1 - TANK.z0, P, 64);
  return `<path class="mm-glass" d="${wall.fill}"/>` + L(wall.outline, { tone: "hi" }) + L(k.ring(0, 0, TANK.r, TANK.z1, P, 64), { tone: "hi" }) + L(k.ring(0, 0, TANK.r - 1.2, TANK.z1, P, 64), { tone: "faint" });
}

const svg = k.figureSvg({
  width: WIDTH, height: HEIGHT,
  label: "一个带刻度的玻璃水箱：液面高度代表血药浓度，底部出水阀代表清除率；每次给药液面上升，随后按指数下降。",
  body: [base(), outlet(), `<g data-part="liquid"></g>`, glass()],
});

// ── 3. Live: the level follows C(t) from the registered parameters ──
const live = `
const P = ${JSON.stringify(P)};
const C = ${JSON.stringify({ DOSE, V, KEL, TAU, C_FULL, LEVEL_MAX, TANK, M_MODEL })};
const stage = document.querySelector(".iso-stage");
const liquid = stage.querySelector('[data-part="liquid"]');
const readout = document.querySelector("[data-readout]");
const buttons = [...document.querySelectorAll("[data-scene]")];
const still = matchMedia("(prefers-reduced-motion: reduce)");
let scene = 0, hours = 0, last = 0, frame = 0, visible = false;
const conc = (t) => { let c = 0; const doses = scene === 0 ? [0] : Array.from({ length: 6 }, (_, i) => i * C.TAU); for (const d of doses) if (t >= d) c += (C.DOSE / C.V) * Math.exp(-C.KEL * (t - d)); return c; };
function draw() {
  const c = conc(hours);
  const h = Math.max(0.3, (c / C.C_FULL) * C.LEVEL_MAX);
  liquid.innerHTML = solidSvg(cylinder(0, 0, C.TANK.r - 1.4, C.TANK.z0, h, P, 64), { tone: "hi", lit: true });
  const text = "t " + hours.toFixed(1) + " h · C " + c.toFixed(1) + " mg/L（示意）· 一级消除" + C.M_MODEL;
  if (readout.textContent !== text) readout.textContent = text;
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  hours += dt * 3;                        // animation runs at 3 h per second
  if (hours > 48) { hours = 0; if (!still.matches) select((scene + 1) % 2); }
  draw();
  frame = visible && !still.matches ? requestAnimationFrame(tick) : 0;
}
function select(i) { scene = i; hours = 0; buttons.forEach((b, j) => b.setAttribute("aria-pressed", String(i === j))); draw(); }
const run = () => { if (!frame && visible && !still.matches) { last = 0; frame = requestAnimationFrame(tick); } };
new IntersectionObserver((e) => { visible = e[e.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
buttons.forEach((b, i) => b.addEventListener("click", () => select(i)));
document.addEventListener("keydown", (e) => { if (e.key === "1" || e.key === "2") select(Number(e.key) - 1); });
if (still.matches) hours = 12;
select(0);
`;

// ── 4. Chinese copy (references/copy-zh.md) ──
const intro = `<header class="mm-head">
  <p class="mm-kicker">药代动力学 · 一室模型（One-compartment model）</p>
  <h1>药物为什么会在体内蓄积</h1>
  <p>把身体看成一个水箱：液面是血药浓度，出水阀是清除率。每给一次药，液面先升高，再按指数下降。下一剂在液面降到零之前就来了，所以液面会一次比一次高，直到达到稳态。</p>
  ${pickerHtml({ corner: true })}
</header>`;
const caption = `水箱的截面积代表表观分布容积，出水阀代表清除率。动画速度为每秒 3 小时（示意）。`;
const steps = `<section class="mm-section"><h2>它是怎么工作的</h2><ol>
  <li><b>给药。</b>一剂药倒入水箱，液面升高，高度等于剂量除以分布容积。</li>
  <li><b>消除。</b>出水速度与液面高度成正比，所以液面按指数下降${M_MODEL}。</li>
  <li><b>蓄积。</b>下一剂在液面降到零之前到来，液面一次比一次高，直到每个间隔排出的量等于加入的量，即达到稳态。</li>
</ol></section>`;
const limits = `<section class="mm-section"><h2>比喻的边界</h2><ul>
  <li>图中的水箱是一个均匀搅拌的整体；真实的药物在体内往往先经过分布相，需要多室模型来描述。</li>
  <li>图中的截面积是真实的容积；表观分布容积是一个换算量，组织结合高的药物，它可以远大于体液总量。</li>
  <li>图中的出水量严格正比于液面；药物代谢饱和时会变成非线性消除。</li>
</ul></section>`;
const disclaimer = `<p class="mm-disclaimer">本图为机制示意，不能替代个体化诊疗；剂量和用法以药品说明书和临床指南为准。</p>`;

auditOrExit(PARAMS, SOURCES, { texts: [intro, caption, steps, limits] });

const figure = k.plateHtml({
  fig: "Fig 1", title: "一室模型水箱", hint: "按键 1–2", readout: "t 0.0 h",
  keys: [{ mark: "lit", label: "液面：血药浓度" }, { mark: "raised", label: "水箱与出水阀：分布容积与清除率" }],
  caption,
  body: `<div class="iso-stage" tabindex="0" role="group" aria-label="一室模型水箱：按 1 单次给药，按 2 多次给药">${svg}</div>`,
}).replace("<figcaption", `<div class="mm-scenes" role="group" aria-label="场景"><button type="button" data-scene="0" aria-pressed="true">1 单次给药</button><button type="button" data-scene="1" aria-pressed="false">2 多次给药</button></div><figcaption`);

const CSS = `
.mm-glass{fill:var(--fig-glass);fill-opacity:var(--fig-glass-o);stroke:none}
.iso-stage{outline:none}.iso-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:6px}
.mm-head{position:relative}.mm-head p{margin:0 0 12px;max-width:62ch}
.mm-kicker{padding-right:104px;font-family:var(--anatomy-mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--anatomy-muted)}
.mm-head h1{margin:0 0 12px;color:var(--anatomy-strong);font-size:24px;line-height:1.3;font-weight:650;text-wrap:balance;word-break:keep-all}
.mm-scenes{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.mm-scenes button{font:12px/1 var(--anatomy-mono);color:var(--anatomy-text);background:transparent;border:1px solid var(--anatomy-lo);border-radius:999px;padding:8px 12px;cursor:pointer;min-height:34px}
.mm-scenes button[aria-pressed="true"]{border-color:var(--anatomy-strong);color:var(--anatomy-strong)}
.iso-caption{display:block}
.mm-section{margin-top:36px}.mm-section h2{color:var(--anatomy-strong);font-size:17px;margin:0 0 12px;font-weight:650}
.mm-section ol,.mm-section ul{margin:0;padding-left:22px;display:grid;gap:8px}.mm-section b{color:var(--anatomy-strong)}
@media (max-width:560px){.mm-head h1{font-size:20px}.iso-plate-corner[data-corner="title"]{display:none}}
` + EVIDENCE_CSS;

const force = ["light", "navy", "black"].find((n) => process.argv.includes("--" + n)) || null;
const { html, fragment } = pageDocument({
  isoCss: k.ISO_CSS, title: "一室模型水箱",
  body: intro + figure + steps + limits + sourcesHtml(PARAMS, SOURCES) + disclaimer,
  script: kitScript() + live, css: CSS, force, key: "pk-tank-surface",
});
const out = join(process.cwd(), force ? `pk-tank-${force}.html` : "pk-tank.html");
writeFileSync(out, html);
if (process.env.ARTIFACT_OUT && !force) writeFileSync(process.env.ARTIFACT_OUT, fragment);
console.log("wrote", out);
