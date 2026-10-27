// SSRI and SNRI as a twin reuptake bench: two trays (a 5-HT synapse and an NE synapse), six revolving-door
// transporters on each back wall, and lit drug wedges that lock the doors outward-open.
// Run: node build.mjs [--light|--navy|--black]   (ARTIFACT_OUT=path also writes the Artifact fragment)
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createLane, occupancy, RATES } from "./model.mjs";
import * as D from "./draw.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const skills = join(homedir(), ".claude/skills");
const synced = existsSync(join(skills, "synced")) ? readdirSync(join(skills, "synced")).map((d) => join(skills, "synced", d)) : [];
const first = (paths, file) => paths.find((p) => p && existsSync(join(p, file)));
const ANATOMY = first([process.env.ANATOMY, join(skills, "anatomy"), ...synced.map((d) => join(d, "anatomy"))], "kit/iso-kit.mjs");
const ASSETS = first([process.env.MM_ASSETS, join(skills, "med-mechanism-figures/assets"), ...synced.map((d) => join(d, "med-mechanism-figures/assets"))], "surfaces.mjs");
if (!ANATOMY) throw new Error("找不到 anatomy skill：安装它，或设置 ANATOMY=/path/to/anatomy");
if (!ASSETS) throw new Error("找不到 med-mechanism-figures/assets：设置 MM_ASSETS=/path/to/assets");
const load = (dir, file) => import(pathToFileURL(join(dir, file)).href);
const k = await load(ANATOMY, "kit/iso-kit.mjs");
const G = await load(ANATOMY, "kit/lathe.mjs");
const { kitScript } = await load(ANATOMY, "scripts/inline-kit.mjs");
const { pageDocument, pickerHtml } = await load(ASSETS, "surfaces.mjs");
const { defineSources, defineParams, value, mark, auditOrExit, sourcesHtml, EVIDENCE_CSS } = await load(ASSETS, "evidence.mjs");

// ── 1. Evidence: every number on the page is registered here ──
const SOURCES = defineSources([
  { id: "kristensen11", cite: "Kristensen AS, Andersen J, Jørgensen TN 等（2011）· Pharmacol Rev 63(3):585–640 · doi:10.1124/pr.108.000869", level: "D", supports: "SERT、NET 属 SLC6 家族，依赖 Na⁺/Cl⁻，把释放的单胺摄回神经元" },
  { id: "coleman16", cite: "Coleman JA, Green EM, Gouaux E（2016）· Nature 532(7599):334–339 · doi:10.1038/nature17629", level: "C", supports: "人 SERT 晶体结构：（S）-西酞普兰和帕罗西汀占据中央位点，把 SERT 锁在外向开放构象；另有变构位点" },
  { id: "clark26", cite: "Clark AJ（1926）· J Physiol 61(4):530–546 · doi:10.1113/jphysiol.1926.sp002314", level: "C", supports: "占有理论：占有率 = C/(C+K)（单位点结合）" },
  { id: "meyer04", cite: "Meyer JH, Wilson AA, Sagrati S 等（2004）· Am J Psychiatry 161(5):826–835 · doi:10.1176/appi.ajp.161.5.826", level: "B", supports: "[¹¹C]DASB PET，77 例：5 种药在最低有效剂量时纹状体 SERT 占有率 76%–85%，约 80%" },
  { id: "takano06", cite: "Takano A, Suzuki K, Kosaka J 等（2006）· Psychopharmacology 185(3):395–399 · doi:10.1007/s00213-005-0304-0", level: "B", supports: "健康人 PET：度洛西汀 60 mg 单次给药后 6 h，SERT 占有率 81.8%" },
  { id: "owens01", cite: "Owens MJ, Knight DL, Nemeroff CB（2001）· Biol Psychiatry 50(5):345–350 · doi:10.1016/s0006-3223(01)01145-3", level: "C", supports: "表达人转运体的细胞：艾司西酞普兰 SERT Ki 1.1 nM（摘要已核）；NET Ki 7841 nM（正文表格数值，经二手文献转引）", pending: true },
  { id: "bymaster01", cite: "Bymaster FP, Dreshfield-Ahmad LJ, Threlkeld PG 等（2001）· Neuropsychopharmacology 25(6):871–880 · doi:10.1016/S0893-133X(01)00298-6", level: "C", supports: "人转运体结合：度洛西汀 Ki SERT 0.8 nM、NET 7.5 nM（比值 9）；文拉法辛 82 nM、2480 nM（比值 30）" },
  { id: "moriguchi17", cite: "Moriguchi S, Takano H, Kimura Y 等（2017）· Int J Neuropsychopharmacol 20(12):957–962 · doi:10.1093/ijnp/pyx069", level: "B", supports: "健康人 PET（8 例）：度洛西汀 20–60 mg 单次给药，NET 占有率约 30%–40%" },
  { id: "harvey00", cite: "Harvey AT, Rudolph RL, Preskorn SH（2000）· Arch Gen Psychiatry 57(5):503–509 · doi:10.1001/archpsyc.57.5.503", level: "B", supports: "健康男性：文拉法辛 75 mg/d 只抑制血小板 5-HT 摄取；375 mg/d 才出现 NE 摄取抑制（酪胺升压反应减弱）" },
  { id: "nguyen13", cite: "Nguyen HT, Guiard BP, Bacq A 等（2013）· Br J Pharmacol 168(1):103–116 · doi:10.1111/j.1476-5381.2012.01850.x", level: "C", supports: "小鼠微透析：艾司西酞普兰也能通过抑制 NET 中度升高额叶皮层去甲肾上腺素" },
  { id: "blier13", cite: "Blier P, El Mansari M（2013）· Philos Trans R Soc Lond B 368(1615):20120536 · doi:10.1098/rstb.2012.0536", level: "D", supports: "SSRI 增强 5-HT 传递，会抑制 NE 和 DA 神经元的活动" },
  { id: "blier94", cite: "Blier P, de Montigny C（1994）· Trends Pharmacol Sci 15(7):220–226 · doi:10.1016/0165-6147(94)90315-8", level: "D", supports: "抗抑郁药起效延迟与 5-HT 自身受体适应性变化的假说" },
  { id: "moncrieff22", cite: "Moncrieff J, Cooper RE, Stockmann T 等（2022 在线；2023）· Mol Psychiatry 28(8):3243–3256 · doi:10.1038/s41380-022-01661-0", level: "A", supports: "伞状综述：未发现 5-HT 降低导致抑郁的一致证据（该结论本身存在争议）" },
]);
const PARAMS = defineParams([
  { id: "kiSertEsc", label: "艾司西酞普兰 SERT Ki", value: 1.1, unit: "nM", level: "C", source: "owens01" },
  { id: "kiNetEsc", label: "艾司西酞普兰 NET Ki", value: 7841, unit: "nM", level: "C", source: "owens01", note: "待核原文表格" },
  { id: "kiSertDlx", label: "度洛西汀 SERT Ki", value: 0.8, unit: "nM", level: "C", source: "bymaster01" },
  { id: "kiNetDlx", label: "度洛西汀 NET Ki", value: 7.5, unit: "nM", level: "C", source: "bymaster01" },
  { id: "kiSertVlx", label: "文拉法辛 SERT Ki", value: 82, unit: "nM", level: "C", source: "bymaster01" },
  { id: "kiNetVlx", label: "文拉法辛 NET Ki", value: 2480, unit: "nM", level: "C", source: "bymaster01" },
  { id: "sertMin", label: "最低有效剂量时 SERT 占有率", value: 80, unit: "%", level: "B", source: "meyer04" },
  { id: "sertDlx", label: "度洛西汀 60 mg 后 6 h 的 SERT 占有率", value: 81.8, unit: "%", level: "B", source: "takano06" },
  { id: "netDlx", label: "度洛西汀 20–60 mg 的 NET 占有率", value: "30–40", unit: "%", level: "B", source: "moriguchi17" },
  { id: "vlxNe", label: "文拉法辛出现 NE 摄取抑制的剂量", value: 375, unit: "mg/d", level: "B", source: "harvey00", note: "75 mg/d 时未见" },
  { id: "rotors", label: "每条通道的转运体", value: 6, unit: "台", level: "S" },
  { id: "quanta", label: "每次释放的位点数（每个位点放出的概率 0.55）", value: RATES.quantaN, unit: "个", level: "S" },
  { id: "gain", label: "自身受体增益（急性 / 数周后）", value: "0.7 / 0.25", unit: "—", level: "S" },
  { id: "dose", label: "剂量档（相对标准浓度）", value: "×0.25–×4", unit: "—", level: "S" },
  { id: "dwell", label: "药物在转运体上的平均停留", value: Math.round(1 / RATES.koff), unit: "s（动画时间）", level: "S" },
]);
const v = (id) => value(PARAMS, id);
// Each drug as a concentration in units of its own SERT Ki, set so the SERT share matches the PET anchor at ×1.
const fromShare = (share) => share / (1 - share);
const DRUGS = [
  { key: "none", name: "无药", button: "1 无药", c: 0, ratio: 1, sertMark: "", netMark: "" },
  { key: "esc", name: "艾司西酞普兰", button: "2 SSRI · 艾司西酞普兰", c: fromShare(v("sertMin") / 100), ratio: v("kiNetEsc") / v("kiSertEsc"), sertMark: mark("meyer04", SOURCES), netMark: mark("owens01", SOURCES) },
  { key: "dlx", name: "度洛西汀", button: "3 SNRI · 度洛西汀", c: fromShare(v("sertDlx") / 100), ratio: v("kiNetDlx") / v("kiSertDlx"), sertMark: mark("takano06", SOURCES), netMark: mark("bymaster01", SOURCES) },
  { key: "vlx", name: "文拉法辛", button: "4 SNRI · 文拉法辛", c: fromShare(v("sertMin") / 100), ratio: v("kiNetVlx") / v("kiSertVlx"), sertMark: mark("meyer04", SOURCES), netMark: mark("bymaster01", SOURCES) },
];
const DOSES = [0.25, 0.5, 1, 2, 4];
const GAIN = { acute: 0.7, weeks: 0.25 };
const M = Object.fromEntries(SOURCES.map((s) => [s.id, () => mark(s.id, SOURCES)]));

// ── 2. The machine ──
const WIDTH = 680, HEIGHT = 362;
const PLATE = { x: -164, y: -60, w: 328, d: 122, r: 9 };
const L = 136;
const WALL_Y = -32, BLOCK_Y = -52, BLOCK_H = 30, FRONT_Y = 34, LEDGE = { d: 18, h: 5 };
const FLOOR = 1.5, R = 7, PAD_TOP = 2.3, TOP = 12.5, WING_TOP = 11.8, BALL_R = 2.2, END_H = 8;
const CY = WALL_Y + R + 0.5;
const ROTOR_U = [12, 31, 50, 86, 105, 124], NOZZLE_U = 68, CUP_U = [20, 44, 68, 92, 116], CUP_Y = 23, CUP_R = 3.4, CUP_TOP = FLOOR + 1.6;
const AUTO = { u: 84, y: -8 };
const MOUTH = { z0: 5.5, z1: 12, half: 4.2 };
const PED = { x: -12, y: -50, w: 24, d: 62, r: 2 }, PED_H = 10;
const RES = { at: [0, -36], r: 8, z0: PED_H + 1.6, z1: 47 };
const KNOB = [0, -2];
const DIAL_R = 7, DIAL_Z = LEDGE.h, DIAL_TOP = LEDGE.h + 3;
const GEOM = { R, padTop: PAD_TOP, top: TOP, wingTop: WING_TOP, floor: FLOOR, wallY: WALL_Y, mouth: MOUTH };
const LANES = [
  { id: "A", name: "5-HT", tx: "SERT", x0: -150, spoutX: -19, seed: 11 },
  { id: "B", name: "NE", tx: "NET", x0: 14, spoutX: 19, seed: 23 },
].map((lane) => ({
  ...lane,
  x1: lane.x0 + L,
  geo: {
    x0: lane.x0, x1: lane.x0 + L, wallY: WALL_Y, frontY: FRONT_Y, floor: FLOOR, r: BALL_R, R, cy: CY,
    rotors: ROTOR_U.map((u) => lane.x0 + u), nozzle: lane.x0 + NOZZLE_U, mouthZ: 8.5,
    cups: CUP_U.map((u) => [lane.x0 + u, CUP_Y]), auto: [lane.x0 + AUTO.u, AUTO.y], cupTop: CUP_TOP, spout: [lane.spoutX, 0, 9],
  },
}));

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -17, 0), ...k.boxCorners({ x: -150, y: BLOCK_Y, w: 300, d: 20 }, 0, BLOCK_H), [RES.at[0], RES.at[1], RES.z1 + 5]],
  WIDTH, HEIGHT, { pad: 22, azimuth: 56 },
);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const at = (point) => k.iso(point, P);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const K = { ...k };

function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -17, 12, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 22))) {
    out.push(S(k.cylinder(x, y, 7, -17, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -15.4, 3.4, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -12, 12, P, 8, 1.6), { tone: "mid", inner: Ln(k.sideSeam(PLATE, -6, P, 8), { tone: "faint" }) }));
  out.push(Ln(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 10);
  out.push(Ln(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }), Dots(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  const strip = { x: -150, y: 54, w: 300, d: 6, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.6, 0.6, [1.6, 3], P);
  out.push(Ln(ticks.minor, { tone: "lo" }), Ln(ticks.major, { tone: "mid" }));
  out.push(Dots([at([strip.x + 2, strip.y + 3, 0.6]), at([strip.x + strip.w - 2, strip.y + 3, 0.6])], { size: 0.45 }));
  return out.join("");
}

// The presynaptic terminal: a block with a seam band, a top groove, a rail for the bearing bridges and a port
// behind every transporter.
function block(lane) {
  const plan = { x: lane.x0, y: BLOCK_Y, w: L, d: WALL_Y - BLOCK_Y, r: 2 };
  const out = [S(k.slabOf(plan, 0, BLOCK_H, P, 4, 1), { tone: "mid", inner: Ln(k.sideSeam(plan, 23, P, 4), { tone: "faint" }) })];
  out.push(Ln(k.planOutline(k.insetPlan(plan, 3), BLOCK_H, P, 3), { tone: "faint" }));
  const screws = k.corners(plan, 6);
  out.push(Ln(screws.map(([x, y]) => k.ring(x, y, 1.6, BLOCK_H, P, 14)).join(""), { tone: "lo" }), Dots(screws.map(([x, y]) => at([x, y, BLOCK_H])), { size: 0.45 }));
  for (const u of ROTOR_U) {
    const x = lane.x0 + u;
    const quad = [[x - 4.2, WALL_Y, PAD_TOP], [x + 4.2, WALL_Y, PAD_TOP], [x + 4.2, WALL_Y, TOP - 1], [x - 4.2, WALL_Y, TOP - 1]];
    out.push(`<path class="mm-port" d="${k.pathOf(quad.map(at), true)}"/>`);
  }
  // Access panels on the face above the rail, each a closed outline with four screws.
  for (const [u0, u1] of [[4, NOZZLE_U - 10], [NOZZLE_U + 10, L - 4]]) {
    const panel = k.roundedPlan({ x: lane.x0 + u0, y: 17, w: u1 - u0, d: 9, r: 1.2 }, 3).map(([x, z]) => at([x, WALL_Y, z]));
    out.push(Ln(k.pathOf(panel, true), { tone: "lo" }));
    out.push(Dots([[u0 + 2, 18.8], [u1 - 2, 18.8], [u0 + 2, 24.2], [u1 - 2, 24.2]].map(([u, z]) => at([lane.x0 + u, WALL_Y, z])), { size: 0.4 }));
  }
  for (const [u0, u1] of [[3, NOZZLE_U - 8.5], [NOZZLE_U + 8.5, L - 3]]) {
    const rail = { x: lane.x0 + u0, y: WALL_Y, w: u1 - u0, d: 2, r: 0.5 };
    out.push(S(k.slabOf(rail, TOP, 1.6, P, 2, 0.3), { tone: "mid" }));
    const between = ROTOR_U.filter((u) => u > u0 && u < u1);
    const pins = [u0 + 2, ...between.slice(0, -1).map((u, i) => (u + between[i + 1]) / 2), u1 - 2];
    out.push(Dots(pins.map((u) => at([lane.x0 + u, WALL_Y + 1, TOP + 1.6])), { size: 0.4 }));
  }
  return out.join("");
}

// The reuptake counter on the terminal: a box with a dark window whose digits count the balls the
// transporters have carried back.
const COUNTER = { u: 104, y: -50, w: 26, d: 10, h: 7 };
function counterSvg(lane, sim) {
  const plan = { x: lane.x0 + COUNTER.u, y: COUNTER.y, w: COUNTER.w, d: COUNTER.d, r: 1 };
  const face = COUNTER.y + COUNTER.d;
  const out = [S(k.slabOf(plan, BLOCK_H, COUNTER.h, P, 3, 0.5), { tone: "mid" })];
  const win = [[plan.x + 3, face, BLOCK_H + 1.6], [plan.x + COUNTER.w - 3, face, BLOCK_H + 1.6], [plan.x + COUNTER.w - 3, face, BLOCK_H + 5.6], [plan.x + 3, face, BLOCK_H + 5.6]];
  out.push(`<path class="mm-screen" d="${k.pathOf(win.map(at), true)}"/>`);
  out.push(`<text class="mm-digits" data-counter="${lane.id}" transform="${k.sideMatrix([0, face], 0, P, "left")}" x="${(plan.x + COUNTER.w / 2).toFixed(1)}" y="${-(BLOCK_H + 2.5)}" font-size="3.4" text-anchor="middle">${String(sim.recycled % 10000).padStart(4, "0")}</text>`);
  out.push(Dots([at([plan.x + 2, plan.y + 2, BLOCK_H + COUNTER.h]), at([plan.x + COUNTER.w - 2, plan.y + 2, BLOCK_H + COUNTER.h])], { size: 0.4 }));
  return out.join("");
}

function tray(lane) {
  const plan = { x: lane.x0, y: WALL_Y, w: L, d: FRONT_Y - WALL_Y, r: 0.4 };
  const out = [S(k.slabOf(plan, 0, FLOOR, P, 2), { tone: "lo" })];
  const grid = [];
  for (let u = 17; u < L; u += 17) grid.push(k.lineOnTop([lane.x0 + u, WALL_Y], [lane.x0 + u, FRONT_Y], FLOOR, P));
  out.push(Ln(grid.join(""), { tone: "faint" }));
  return out.join("");
}

const endWall = (x) => S(k.slabOf({ x, y: WALL_Y, w: 3, d: FRONT_Y - WALL_Y, r: 0.5 }, FLOOR, END_H - FLOOR, P, 2, 0.4), { tone: "mid" });

function spout(x0) {
  const plan = { x: x0, y: -3, w: 9, d: 6, r: 0.8 };
  return [
    S(k.slabOf(plan, END_H, 0.7, P, 2), { tone: "mid" }),
    S(k.slabOf({ x: x0, y: -3, w: 9, d: 0.7, r: 0.2 }, END_H + 0.7, 1.6, P, 2), { tone: "mid" }),
    S(k.slabOf({ x: x0, y: 2.3, w: 9, d: 0.7, r: 0.2 }, END_H + 0.7, 1.6, P, 2), { tone: "mid" }),
  ].join("");
}

// The release port: a housing on the wall face, its mouth, a gate (live), the gate's guides and actuator.
function nozzleBack(lane) {
  const x = lane.x0 + NOZZLE_U;
  const plan = { x: x - 7, y: WALL_Y, w: 14, d: 7, r: 1.2 };
  const out = [S(k.slabOf(plan, 3, 16, P, 3, 0.5), { tone: "mid" })];
  const quad = [[x - MOUTH.half, WALL_Y + 7, MOUTH.z0], [x + MOUTH.half, WALL_Y + 7, MOUTH.z0], [x + MOUTH.half, WALL_Y + 7, MOUTH.z1], [x - MOUTH.half, WALL_Y + 7, MOUTH.z1]];
  out.push(`<path class="mm-port" d="${k.pathOf(quad.map(at), true)}"/>`);
  return out.join("");
}
function nozzleFront(lane) {
  const x = lane.x0 + NOZZLE_U;
  const out = [];
  for (const side of [-1, 1]) {
    const gx = side < 0 ? x - MOUTH.half - 1.9 : x + MOUTH.half + 0.7;
    out.push(S(k.slabOf({ x: gx, y: WALL_Y + 7, w: 1.2, d: 1.3, r: 0.2 }, 4.4, 10.6, P, 2), { tone: "mid" }));
  }
  out.push(S(k.cylinder(x, WALL_Y + 3.5, 2.6, 19, 3.2, P, 20), { tone: "mid" }));
  out.push(Ln(k.knurl(x, WALL_Y + 3.5, 2.6, 19, 22.2, 16, P), { tone: "lo" }));
  out.push(Dots([at([x, WALL_Y + 3.5, 22.2])], { size: 0.5, tone: "hi" }));
  return out.join("");
}

function cupSvg(x, y, auto) {
  const paths = k.cylinder(x, y, CUP_R, FLOOR, CUP_TOP - FLOOR, P, 28, 0.3);
  const rings = auto ? k.ring(x, y, 2.2, CUP_TOP, P, 24) + k.ring(x, y, 1.1, CUP_TOP, P, 16) : k.ring(x, y, 2.2, CUP_TOP, P, 24);
  return S(paths, { tone: "mid" }) + Ln(rings, { tone: auto ? "lo" : "faint" });
}

// The postsynaptic ledge: a label plate and a dial whose needle follows receptor occupancy.
function ledge(lane) {
  const plan = { x: lane.x0, y: FRONT_Y, w: L, d: LEDGE.d, r: 2 };
  const out = [S(k.slabOf(plan, 0, LEDGE.h, P, 4, 0.8), { tone: "mid", inner: Ln(k.sideSeam(plan, 5, P, 4), { tone: "faint" }) })];
  const screws = [[lane.x0 + 4, FRONT_Y + 4], [lane.x0 + L - 4, FRONT_Y + 4], [lane.x0 + 4, FRONT_Y + LEDGE.d - 4], [lane.x0 + L - 4, FRONT_Y + LEDGE.d - 4]];
  out.push(Dots(screws.map(([x, y]) => at([x, y, LEDGE.h])), { size: 0.45 }));
  const label = { x: lane.x0 + 14, y: FRONT_Y + 4, w: 46, d: 10, r: 1.2 };
  out.push(S(k.slabOf(label, LEDGE.h, 0.8, P, 3), { tone: "lo", crease: "none" }));
  out.push(Ln(k.planOutline(k.insetPlan(label, 1.4), LEDGE.h + 0.8, P, 3), { tone: "faint" }));
  out.push(k.faceTextSvg(k.topMatrix([label.x + 4, label.y + 6.6], LEDGE.h + 0.8, P, "x"), `${lane.name} · ${lane.tx}`, { size: 3.4, tone: "mid" }));
  const [dx, dy] = [lane.x0 + 104, FRONT_Y + LEDGE.d / 2];
  out.push(S(k.cylinder(dx, dy, DIAL_R, DIAL_Z, DIAL_TOP - DIAL_Z, P, 56, 0.6), { tone: "hi", crease: "lo" }));
  out.push(Ln(k.knurl(dx, dy, DIAL_R, DIAL_TOP - 1.8, DIAL_TOP, 60, P, 0.25), { tone: "lo" }));
  out.push(Ln(k.sideArc(dx, dy, DIAL_R, DIAL_TOP - 1.8, P, 32), { tone: "faint" }));
  out.push(Ln(k.ring(dx, dy, DIAL_R - 1.4, DIAL_TOP, P, 48), { tone: "lo" }));
  const ticks = k.radialTicks(dx, dy, DIAL_R - 1.4, 30, 5, DIAL_TOP, [0.8, 1.7], P, (-135 * Math.PI) / 180, (270 * Math.PI) / 180);
  out.push(Ln(ticks.minor, { tone: "lo" }), Ln(ticks.major, { tone: "mid" }));
  return { body: out.join(""), dial: [dx, dy] };
}

// The drug tower: a pedestal, a graduated glass reservoir whose lit level is the drug concentration, and a
// dosing knob on a tick ring.
function towerBack() {
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(PED, 2), 0, 0.1, P)}" style="filter:blur(4px)"/>`];
  out.push(S(k.slabOf(PED, 0, PED_H, P, 4, 0.8), { tone: "mid", inner: Ln(k.sideSeam(PED, 5, P, 4), { tone: "faint" }) }));
  out.push(Dots([[-8, -46], [8, -46], [-8, 8], [8, 8]].map(([x, y]) => at([x, y, PED_H])), { size: 0.45 }));
  out.push(S(k.cylinder(KNOB[0], KNOB[1], 8.4, PED_H, 0.6, P, 48), { tone: "lo" }));
  const ticks = k.radialTicks(KNOB[0], KNOB[1], 8, 20, 5, PED_H + 0.6, [0.9, 1.8], P, (-150 * Math.PI) / 180, (300 * Math.PI) / 180);
  out.push(Ln(ticks.minor, { tone: "lo" }), Ln(ticks.major, { tone: "mid" }));
  out.push(S(k.cylinder(KNOB[0], KNOB[1], 4.8, PED_H + 0.6, 4, P, 32), { tone: "mid" }));
  out.push(Ln(k.knurl(KNOB[0], KNOB[1], 4.8, PED_H + 0.6, PED_H + 4.6, 30, P), { tone: "lo" }));
  out.push(S(k.cylinder(RES.at[0], RES.at[1], 9.6, PED_H, 1.6, P, 48, 0.4), { tone: "mid" }));
  out.push(Dots([0, 90, 180, 270].map((a) => at([RES.at[0] + 8.8 * Math.cos((a + 45) * Math.PI / 180), RES.at[1] + 8.8 * Math.sin((a + 45) * Math.PI / 180), PED_H + 1.6])), { size: 0.4 }));
  return out.join("");
}
function towerGlass() {
  const [x, y] = RES.at;
  const wall = k.cylinder(x, y, RES.r, RES.z0, RES.z1 - RES.z0, P, 64);
  const grads = [];
  for (let z = RES.z0 + 5; z < RES.z1 - 2; z += 5) grads.push(k.sideArc(x, y, RES.r, z, P, 28));
  const out = [`<path class="mm-glass" d="${wall.fill}"/>`, Ln(grads.join(""), { tone: "faint" }), Ln(wall.outline, { tone: "hi" })];
  out.push(S(k.cylinder(x, y, 9.6, RES.z1, 2.4, P, 48, 0.4), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, 2.6, RES.z1 + 2.4, 2.2, P, 20), { tone: "mid" }));
  out.push(Ln(k.knurl(x, y, 2.6, RES.z1 + 2.4, RES.z1 + 4.6, 16, P), { tone: "lo" }));
  return out.join("");
}
const pointerD = (turn) => {
  const a = ((-150 + 300 * turn) * Math.PI) / 180;
  return k.lineOnTop([KNOB[0], KNOB[1]], [KNOB[0] + Math.sin(a) * 4, KNOB[1] - Math.cos(a) * 4], PED_H + 4.6, P);
};

// ── 3. First frame: the same model the page runs, so the still matches the live start ──
const START = { scene: 2, dose: 2, weeks: false };
const PRE_RUN = 30;
const sims = LANES.map((lane) => createLane(lane.geo, lane.seed));
const condition = (lane, scene, dose, weeks) => {
  const drug = DRUGS[scene];
  return { c: drug.c * DOSES[dose], ki: lane.id === "A" ? 1 : drug.ratio, gain: weeks ? GAIN.weeks : GAIN.acute };
};
for (let i = 0; i < PRE_RUN * 60; i++) LANES.forEach((lane, j) => sims[j].step(1 / 60, condition(lane, START.scene, START.dose, START.weeks)));

// The drug-free baseline: how many balls a lane holds on average with no drug and acute autoreceptors.
const baseline = (() => {
  const lane = createLane(LANES[0].geo, 99);
  let sum = 0, n = 0;
  for (let i = 0; i < 60 * 1200; i++) {
    lane.step(1 / 60, { c: 0, ki: 1, gain: GAIN.acute });
    if (i > 60 * 60) { sum += lane.balls.filter((b) => b.mode !== "cargo" && b.mode !== "fade").length; n++; }
  }
  return sum / n;
})();

function rotorFrame(lane, rotor) {
  const opts = {};
  if (rotor.cargo) {
    const c = rotor.cargo;
    opts.cargo = [c.x, c.y, PAD_TOP + BALL_R];
    const theta = ((90 + rotor.angle) * Math.PI) / 180;
    opts.sodium = [rotor.cx + 0.86 * R * Math.cos(theta), rotor.cy + 0.86 * R * Math.sin(theta), PAD_TOP + 0.9];
  }
  const w = rotor.wedge;
  if (w && (w.mode === "docked" || w.y < lane.geo.cy + R + 3)) opts.wedge = [w.x, w.y, w.mode === "docked" ? PAD_TOP : Math.max(FLOOR, w.z)];
  return D.rotorSvg(K, P, GEOM, rotor, opts);
}
const cupItems = (lane) => [
  ...lane.geo.cups.map(([x, y]) => [k.depthOf([x, y, FLOOR], P), cupSvg(x, y, false)]),
  [k.depthOf([lane.geo.auto[0], lane.geo.auto[1], FLOOR], P), cupSvg(lane.geo.auto[0], lane.geo.auto[1], true)],
];
function moversFrame(lane, sim, cups) {
  const items = [...cups];
  for (const b of sim.balls) {
    if (b.mode === "cargo" || b.mode === "gone") continue;
    items.push([k.depthOf([b.x, b.y, b.z], P), D.ballUse(K, P, [b.x, b.y, b.z], b.alpha)]);
  }
  for (const w of sim.wedges) {
    if (w.mode === "docked" || (w.mode === "dock" && w.y < lane.geo.cy + R + 3)) continue;
    items.push([k.depthOf([w.x, w.y, w.z + 2], P), D.wedgeUse(K, P, [w.x, w.y, w.z], w.alpha)]);
  }
  return items.sort((a, b) => a[0] - b[0]).map((item) => item[1]).join("");
}
const ballSymbol = S(G.sphereOf([0, 0, 0], BALL_R, P), { tone: "mid" });
const wedgeSymbol = S(k.extrude([[0, -2.5], [2.9, 1.7], [-2.9, 1.7]], 0, 5.6, P), { tone: "hi", lit: true, className: "mm-drug" });

function laneSvg(lane, sim, side) {
  const out = [block(lane), counterSvg(lane, sim), tray(lane), endWall(lane.x0)];
  if (side === "B") out.push(spout(12));
  const parts = [
    ...sim.rotors.map((rotor, i) => [rotor.cx, `<g data-rotor="${lane.id}${i}">${rotorFrame(lane, rotor)}</g>`]),
    [lane.x0 + NOZZLE_U, nozzleBack(lane) + `<g data-gate="${lane.id}">${D.gateSvg(K, P, GEOM, lane.x0 + NOZZLE_U, sim.throttle)}</g>` + nozzleFront(lane)],
  ].sort((a, b) => a[0] - b[0]);
  out.push(...parts.map((p) => p[1]));
  const ax = lane.geo.auto[0], ay = lane.geo.auto[1];
  out.push(k.wireSvg(at([ax - CUP_R + 0.4, ay - 1.4, CUP_TOP]), at([lane.x0 + NOZZLE_U + 5.6, WALL_Y + 7, 4.2]), { tone: "mid", size: 0.9 }));
  out.push(`<g data-movers="${lane.id}">${moversFrame(lane, sim, cupItems(lane))}</g>`);
  out.push(endWall(lane.x1 - 3));
  if (side === "A") out.push(spout(-21));
  const { body, dial } = ledge(lane);
  lane.dial = dial;
  out.push(body);
  out.push(`<path data-needle="${lane.id}" class="iso-line" data-tone="hi" data-free="start" style="stroke-width:1" d="${D.needleD(K, P, dial, DIAL_R - 2, DIAL_TOP + 0.1, sim.receptor)}"/>`);
  out.push(Dots([at([dial[0], dial[1], DIAL_TOP])], { size: 0.6, tone: "hi" }));
  return out.join("");
}

const levelOf = (c) => (c > 0 ? Math.min(1, Math.log(1 + c) / Math.log(1 + 20)) : 0);
const LIQ = { r: RES.r - 0.6, z0: RES.z0 + 0.2, h: RES.z1 - RES.z0 - 3 };
const startC = DRUGS[START.scene].c * DOSES[START.dose];
const doseTurn = (scene, dose) => (DRUGS[scene].c > 0 ? 0.2 + 0.15 * dose : 0);

const svg = k.figureSvg({
  width: WIDTH, height: HEIGHT,
  label: "一张双通道回收台。左槽是 5-HT 突触，右槽是去甲肾上腺素突触。每只槽的后墙是突触前末梢：中间的出料口按批随机放出小球，墙上六扇旋转门是转运体，把槽里的小球收回墙内。中间给药塔的发光液面是药物浓度，发亮的楔块是药物分子，卡进旋转门后门就转不动。槽前沿的小杯是突触后受体，前台的表盘显示它们的平均占有。",
  body: [
    `<defs><g id="mm-ball">${ballSymbol}</g><g id="mm-wedge">${wedgeSymbol}</g></defs>`,
    base(),
    laneSvg(LANES[0], sims[0], "A"),
    towerBack(),
    `<path data-pointer class="iso-line" data-tone="hi" data-free="end" style="stroke-width:1" d="${pointerD(doseTurn(START.scene, START.dose))}"/>`,
    Dots([at([KNOB[0], KNOB[1], PED_H + 4.6])], { size: 0.6, tone: "hi" }),
    `<g data-liquid>${D.liquidSvg(K, P, RES.at, LIQ.r, LIQ.z0, LIQ.h * levelOf(startC))}</g>`,
    towerGlass(),
    laneSvg(LANES[1], sims[1], "B"),
  ],
});

// ── 4. Live ──
const strip = (file) => readFileSync(join(HERE, file), "utf8").replace(/^export /gm, "").replace(/^import .*$/gm, "");
const live = `
${strip("model.mjs")}
${strip("draw.mjs")}
const K = { iso, depthOf, extrude, cylinder, slabOf, solidSvg, lineSvg, dotsSvg, lineOnTop, pathOf };
const P = ${JSON.stringify(P)};
const GEOM = ${JSON.stringify(GEOM)};
const LANES = ${JSON.stringify(LANES.map((l) => ({ id: l.id, x0: l.x0, geo: l.geo, seed: l.seed, dial: l.dial })))};
const DRUGS = ${JSON.stringify(DRUGS)};
const DOSES = ${JSON.stringify(DOSES)};
const GAIN = ${JSON.stringify(GAIN)};
const C = ${JSON.stringify({ R, PAD_TOP, BALL_R, FLOOR, CUP_R, CUP_TOP, DIAL_R, DIAL_TOP, PED_H, KNOB, RES, LIQ, PRE_RUN, baseline, START, NOZZLE_U })};
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const readout = document.querySelector("[data-readout]");
const status = document.querySelector("[data-status]");
const sceneButtons = [...document.querySelectorAll("[data-scene]")];
const doseLabel = document.querySelector("[data-dose-label]");
const weeksButton = document.querySelector("[data-weeks]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const sims = LANES.map((lane) => createLane(lane.geo, lane.seed));
const cupStrings = LANES.map((lane) => {
  const out = [];
  const cupOf = (x, y, auto) => {
    const paths = cylinder(x, y, C.CUP_R, C.FLOOR, C.CUP_TOP - C.FLOOR, P, 28, 0.3);
    const rings = auto ? ring(x, y, 2.2, C.CUP_TOP, P, 24) + ring(x, y, 1.1, C.CUP_TOP, P, 16) : ring(x, y, 2.2, C.CUP_TOP, P, 24);
    return solidSvg(paths, { tone: "mid" }) + lineSvg(rings, { tone: auto ? "lo" : "faint" });
  };
  lane.geo.cups.forEach(([x, y]) => out.push([depthOf([x, y, C.FLOOR], P), cupOf(x, y, false)]));
  out.push([depthOf([lane.geo.auto[0], lane.geo.auto[1], C.FLOOR], P), cupOf(lane.geo.auto[0], lane.geo.auto[1], true)]);
  return out;
});
const nodes = LANES.map((lane) => ({
  rotors: lane.geo.rotors.map((_, i) => svg.querySelector('[data-rotor="' + lane.id + i + '"]')),
  gate: svg.querySelector('[data-gate="' + lane.id + '"]'),
  movers: svg.querySelector('[data-movers="' + lane.id + '"]'),
  needle: svg.querySelector('[data-needle="' + lane.id + '"]'),
  counter: svg.querySelector('[data-counter="' + lane.id + '"]'),
}));
const liquid = svg.querySelector("[data-liquid]");
const pointer = svg.querySelector("[data-pointer]");
let scene = C.START.scene, dose = C.START.dose, weeks = C.START.weeks;
const conditionOf = (j) => { const drug = DRUGS[scene]; return { c: drug.c * DOSES[dose], ki: j === 0 ? 1 : drug.ratio, gain: weeks ? GAIN.weeks : GAIN.acute }; };
for (let i = 0; i < C.PRE_RUN * 60; i++) sims.forEach((sim, j) => sim.step(1 / 60, conditionOf(j)));

function rotorFrame(j, rotor) {
  const lane = LANES[j], opts = {};
  if (rotor.cargo) {
    const theta = ((90 + rotor.angle) * Math.PI) / 180;
    opts.cargo = [rotor.cargo.x, rotor.cargo.y, C.PAD_TOP + C.BALL_R];
    opts.sodium = [rotor.cx + 0.86 * C.R * Math.cos(theta), rotor.cy + 0.86 * C.R * Math.sin(theta), C.PAD_TOP + 0.9];
  }
  const w = rotor.wedge;
  if (w && (w.mode === "docked" || w.y < lane.geo.cy + C.R + 3)) opts.wedge = [w.x, w.y, w.mode === "docked" ? C.PAD_TOP : Math.max(C.FLOOR, w.z)];
  return rotorSvg(K, P, GEOM, rotor, opts);
}
function moversFrame(j) {
  const lane = LANES[j], sim = sims[j], items = [...cupStrings[j]];
  for (const b of sim.balls) {
    if (b.mode === "cargo" || b.mode === "gone") continue;
    items.push([depthOf([b.x, b.y, b.z], P), ballUse(K, P, [b.x, b.y, b.z], b.alpha)]);
  }
  for (const w of sim.wedges) {
    if (w.mode === "docked" || (w.mode === "dock" && w.y < lane.geo.cy + C.R + 3)) continue;
    items.push([depthOf([w.x, w.y, w.z + 2], P), wedgeUse(K, P, [w.x, w.y, w.z], w.alpha)]);
  }
  items.sort((a, b) => a[0] - b[0]);
  let out = "";
  for (const item of items) out += item[1];
  return out;
}
const levelOf = (c) => (c > 0 ? Math.min(1, Math.log(1 + c) / Math.log(1 + 20)) : 0);
let level = levelOf(DRUGS[scene].c * DOSES[dose]), turn = DRUGS[scene].c > 0 ? 0.2 + 0.15 * dose : 0;
const pct = (x) => (x >= 0.995 ? ">99" : x > 0 && x < 0.005 ? "<1" : String(Math.round(x * 100)));
function words() {
  const drug = DRUGS[scene], c = drug.c * DOSES[dose];
  const sert = occupancy(c, 1), net = occupancy(c, drug.ratio);
  const corner = drug.c > 0 ? "SERT " + pct(sert) + "%" + drug.sertMark + " · NET " + pct(net) + "%" + drug.netMark : "无药 · SERT 0% · NET 0%";
  const ratio = (sim) => (sim.count / C.baseline).toFixed(1);
  const lines = [
    drug.name + (drug.c > 0 ? " · 剂量 ×" + DOSES[dose] : "") + " · " + (weeks ? "数周后（自身受体脱敏）" : "急性"),
    "间隙 5-HT ×" + ratio(sims[0]) + " · NE ×" + ratio(sims[1]) + "（示意，相对无药基线）",
    "此刻卡住的转运体：SERT " + sims[0].blocked() + "/6 · NET " + sims[1].blocked() + "/6",
    "出料闸板开度：5-HT " + Math.round(sims[0].throttle * 100) + "% · NE " + Math.round(sims[1].throttle * 100) + "%（示意）",
  ];
  return { corner, lines };
}
let lastWords = 0;
function draw(now = 0, force = false) {
  sims.forEach((sim, j) => {
    const n = nodes[j];
    sim.rotors.forEach((rotor, i) => {
      const docking = rotor.wedge && rotor.wedge.mode === "dock";
      if (force || rotor.dirty || docking) { n.rotors[i].innerHTML = rotorFrame(j, rotor); rotor.dirty = false; }
    });
    n.gate.innerHTML = gateSvg(K, P, GEOM, LANES[j].x0 + C.NOZZLE_U, sim.throttle);
    n.movers.innerHTML = moversFrame(j);
    n.needle.setAttribute("d", needleD(K, P, LANES[j].dial, C.DIAL_R - 2, C.DIAL_TOP + 0.1, sim.receptor));
    const digits = String(sim.recycled % 10000).padStart(4, "0");
    if (n.counter.textContent !== digits) n.counter.textContent = digits;
  });
  liquid.innerHTML = liquidSvg(K, P, C.RES.at, C.LIQ.r, C.LIQ.z0, C.LIQ.h * level);
  const a = ((-150 + 300 * turn) * Math.PI) / 180;
  pointer.setAttribute("d", lineOnTop([C.KNOB[0], C.KNOB[1]], [C.KNOB[0] + Math.sin(a) * 4, C.KNOB[1] - Math.cos(a) * 4], C.PED_H + 4.6, P));
  if (force || now - lastWords > 250) {
    lastWords = now;
    const { corner, lines } = words();
    if (readout.textContent !== corner) readout.textContent = corner;
    const text = lines.join("\\n");
    if (status.dataset.text !== text) { status.dataset.text = text; status.innerHTML = lines.map((line) => "<span>" + line + "</span>").join(""); }
    stage.setAttribute("aria-valuetext", corner);
  }
}
let frame = 0, last = 0, visible = false, touring = !still.matches, clock = 0, idle = 0;
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  sims.forEach((sim, j) => sim.step(dt, conditionOf(j)));
  const c = DRUGS[scene].c * DOSES[dose];
  level += (levelOf(c) - level) * (1 - Math.exp(-dt / 0.6));
  turn += ((DRUGS[scene].c > 0 ? 0.2 + 0.15 * dose : 0) - turn) * (1 - Math.exp(-dt / 0.25));
  if (touring) { clock += dt; if (clock > 16) { clock = 0; select((scene + 1) % DRUGS.length, true); } }
  draw(now);
  frame = visible && !still.matches ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible && !still.matches) { last = 0; frame = requestAnimationFrame(tick); } };
// Under reduced motion the page shows still frames: each change runs the model ahead offscreen, then draws once.
function settleStill() {
  for (let i = 0; i < 60 * 60; i++) sims.forEach((sim, j) => sim.step(1 / 60, conditionOf(j)));
  level = levelOf(DRUGS[scene].c * DOSES[dose]); turn = DRUGS[scene].c > 0 ? 0.2 + 0.15 * dose : 0;
  draw(0, true);
}
function mark() {
  sceneButtons.forEach((b, i) => b.setAttribute("aria-pressed", String(i === scene)));
  doseLabel.textContent = DRUGS[scene].c > 0 ? "剂量 ×" + DOSES[dose] : "剂量 —";
  weeksButton.setAttribute("aria-pressed", String(weeks));
}
function select(next, fromTour = false) {
  scene = next;
  if (!fromTour) { dose = 2; hold(); }
  mark();
  if (still.matches) settleStill(); else draw(performance.now(), true);
}
function hold() { touring = false; clearTimeout(idle); idle = setTimeout(() => { touring = !still.matches; clock = 0; run(); }, 20000); }
function setDose(step) { if (DRUGS[scene].c <= 0) return; dose = Math.max(0, Math.min(DOSES.length - 1, dose + step)); hold(); mark(); if (still.matches) settleStill(); else draw(performance.now(), true); }
function toggleWeeks() { weeks = !weeks; hold(); mark(); if (still.matches) settleStill(); else draw(performance.now(), true); }
sceneButtons.forEach((b, i) => b.addEventListener("click", () => select(i)));
document.querySelector("[data-dose-down]").addEventListener("click", () => setDose(-1));
document.querySelector("[data-dose-up]").addEventListener("click", () => setDose(1));
weeksButton.addEventListener("click", toggleWeeks);
document.addEventListener("keydown", (event) => {
  if (event.target.closest && event.target.closest("input, textarea")) return;
  if (["1", "2", "3", "4"].includes(event.key)) { select(Number(event.key) - 1); return; }
  if (event.key === "ArrowLeft" || event.key === "-") { event.preventDefault(); setDose(-1); return; }
  if (event.key === "ArrowRight" || event.key === "+" || event.key === "=") { event.preventDefault(); setDose(1); return; }
  if (event.key === "w" || event.key === "W") toggleWeeks();
});
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
still.addEventListener("change", () => { touring = !still.matches; if (still.matches) settleStill(); else run(); });
mark();
draw(0, true);
`;

// ── 5. Copy ──
const intro = `<header class="mm-head">
  <p class="mm-kicker">神经精神药理学 · 单胺再摄取抑制（Monoamine reuptake inhibition）</p>
  <h1>SSRI 与 SNRI：卡住回收门，让递质在间隙里多停一会儿</h1>
  <p>5-羟色胺（5-HT）和去甲肾上腺素（NE）释放到突触间隙后，大部分由突触前膜上的转运体收回：5-HT 靠 SERT，NE 靠 NET。下面这台回收台把转运体做成墙上的旋转门，把药物分子做成发亮的楔块。盯着楔块看：SSRI 几乎只卡 SERT，SNRI 两种门都卡，但卡住 NET 的比例小得多。</p>
  ${pickerHtml({ corner: true })}
</header>`;
const caption = `左槽是 5-HT 突触，右槽是 NE 突触；两种递质来自不同的神经元，并排只是为了对照。后墙是突触前末梢：中间的出料口按批随机放出小球，每批多少颗是随机的，有时一颗也没有（示意），右前方的小杯是自身受体，球落进去，连杆就压低出料闸板。墙上的旋转门是转运体：朝槽的门格收进一颗球和一个 Na⁺ 点，转半圈送回末梢。槽前沿的小杯是突触后受体，前台表盘显示它们的平均占有；后墙顶上的计数器累计转运体收回的球数。中间量筒的发光液面代表药物浓度。球数、速率和时间都是示意值，动画时间经过任意缩放；只有转运体占有率按文献 Ki 和 PET 数据计算。`;
const controls = `<div class="mm-controls">
  <div class="mm-scenes" role="group" aria-label="选择药物">${DRUGS.map((d, i) => `<button type="button" data-scene="${i}" aria-pressed="${i === START.scene}">${d.button}</button>`).join("")}</div>
  <div class="mm-scenes" role="group" aria-label="剂量与时间">
    <button type="button" data-dose-down aria-label="减小剂量">−</button><span class="mm-dose" data-dose-label aria-live="polite">剂量 ×${DOSES[START.dose]}</span><button type="button" data-dose-up aria-label="加大剂量">+</button>
    <button type="button" data-weeks aria-pressed="false">W 数周后：自身受体脱敏</button>
  </div>
  <p class="mm-status" data-status aria-live="off"></p>
</div>`;
const steps = `<section class="mm-section"><h2>它是怎么工作的</h2><ol>
  <li><b>释放与扩散。</b>递质按批释放，在间隙里随机扩散，一部分短暂结合突触后受体，结合越多，表盘转得越高。</li>
  <li><b>转运体回收。</b>SERT 和 NET 属于依赖 Na⁺/Cl⁻ 的 SLC6 转运体${M.kristensen11()}：外向开放时接纳底物，经闭塞态转为内向开放，把递质送回末梢再利用。图中的旋转门就是这三个状态：朝槽、被两侧壳体封住、朝墙。</li>
  <li><b>药物卡在中央位点。</b>人 SERT 的晶体结构显示，（S）-西酞普兰和帕罗西汀占据中央结合位点，把 SERT 锁在外向开放构象，直接挡住 5-HT 结合${M.coleman16()}。图中楔块卡进朝槽的门格，门就转不动。</li>
  <li><b>卡住多少，取决于浓度和亲和力。</b>按单位点结合，占有率 = C/(C+Ki)${M.clark26()}。SSRI 在最低有效剂量时 SERT 占有率约 80%${M.meyer04()}。艾司西酞普兰对 NET 的 Ki 约为对 SERT 的 7000 倍${M.owens01()}，所以 NET 门几乎卡不住。度洛西汀的 NET/SERT Ki 比约 9${M.bymaster01()}，文拉法辛约 30${M.bymaster01()}：同样让 SERT 达到约 80%${M.meyer04()}，按模型推算度洛西汀卡住约三分之一的 NET，与 PET 实测的 30%–40% 接近${M.moriguchi17()}；文拉法辛要加大剂量才明显卡住 NET，这与健康志愿者要到 375 mg/d${M.harvey00()} 才出现 NE 摄取抑制一致。</li>
  <li><b>间隙递质增多，自身受体先踩刹车。</b>回收变慢，间隙里的球变多；自身受体也被更多地占据，压低释放，抵消一部分效果。动物实验提示，长期用药后自身受体脱敏，释放恢复，间隙递质进一步升高；这是解释抗抑郁药起效需要数周的主要假说之一${M.blier94()}。按 W 切换看看。</li>
</ol></section>`;
const limits = `<section class="mm-section"><h2>比喻的边界</h2><ul>
  <li>图中的转运体整体旋转；真实的 SERT 和 NET 靠跨膜螺旋的构象变化在外向开放、闭塞和内向开放之间切换，没有部件在转圈${M.coleman16()}。</li>
  <li>图中的楔块一卡就锁住门；药物结合是可逆的，楔块会随机进出，读数里的占有率是时间平均值${M.clark26()}。艾司西酞普兰还能结合 SERT 的变构位点，减慢自己从中央位点解离${M.coleman16()}，图中没有画。</li>
  <li>图中 SSRI 的楔块完全不碰 NET 门；在小鼠实验中，艾司西酞普兰也能通过抑制 NET 中度升高皮层去甲肾上腺素${M.nguyen13()}。选择性是程度问题。</li>
  <li>图中两条通道各自独立；真实的 5-HT 和 NE 系统相互调节，例如 5-HT 传递增强会抑制 NE 神经元的活动${M.blier13()}。</li>
  <li>图中的 Ki 换算成占有率时，假设脑内游离药物浓度与转运体直接平衡；体外 Ki 来自表达人转运体的细胞${M.owens01()}${M.bymaster01()}，体内占有率还受蛋白结合、血脑屏障和活性代谢物影响，所以 NET 占有率标为模型推算。</li>
  <li>图中阻断一发生，间隙递质马上升高；临床抗抑郁效果通常要数周才出现，自身受体脱敏只是假说之一${M.blier94()}，神经可塑性等其他机制仍在研究。自身受体小杯被画在出料口旁，真实的 5-HT1A 自身受体主要在中缝核神经元的胞体和树突上。</li>
  <li>图中药物的作用是让槽里的球变多，这容易让人以为抑郁症就是 5-HT 不够；一项伞状综述没有找到 5-HT 降低导致抑郁的一致证据${M.moncrieff22()}，这一结论本身也有争议。</li>
</ul></section>`;
const disclaimer = `<p class="mm-disclaimer">本图为机制示意，不能替代个体化诊疗；剂量和用法以药品说明书和临床指南为准。图中的「剂量 ×」只是相对浓度，不对应任何处方剂量。</p>`;

// 5-HT and 5-HT1A are names, not numbers; hide them from the unsourced-number check.
auditOrExit(PARAMS, SOURCES, { texts: [intro, caption, steps, limits].map((t) => t.replace(/5-HT1A|5-HT|5-羟色胺/g, "serotonin")) });

const figure = k.plateHtml({
  fig: "Fig 1", title: "再摄取回收台", hint: "1–4 选药 · ←→ 剂量 · W 数周后",
  readout: `SERT ${Math.round(occupancy(startC, 1) * 100)}%${DRUGS[START.scene].sertMark} · NET ${Math.round(occupancy(startC, DRUGS[START.scene].ratio) * 100)}%${DRUGS[START.scene].netMark}`,
  keys: [
    { mark: "lit", label: "发亮的楔块与液面：药物（SSRI 或 SNRI）" },
    { mark: "raised", label: "小球：5-HT（左槽）与 NE（右槽）" },
    { mark: "raised", label: "墙上的旋转门：SERT（左）与 NET（右）" },
  ],
  caption,
  body: `<div class="iso-stage" tabindex="0" role="group" aria-label="再摄取回收台：按 1 到 4 选药，左右方向键调剂量，W 切换数周后">${svg}</div>`,
}).replace("<figcaption", `${controls}<figcaption`);

const CSS = `
.mm-glass{fill:var(--fig-glass);fill-opacity:var(--fig-glass-o);stroke:none}
.mm-port{fill:var(--anatomy-shade-0);stroke:var(--anatomy-lo);stroke-width:var(--anatomy-weight);stroke-linejoin:round;vector-effect:non-scaling-stroke}
.mm-na{fill:var(--anatomy-dot);opacity:.85}
.iso-solid.mm-drug[data-lit]>.iso-top{fill:var(--anatomy-mid)}.iso-solid.mm-drug[data-lit]>.iso-shade,.iso-solid.mm-drug[data-lit]>.iso-fill{fill:var(--anatomy-muted)}
.mm-screen{fill:var(--fig-screen);stroke:var(--anatomy-lo);stroke-width:var(--anatomy-weight);vector-effect:non-scaling-stroke}
.mm-digits{fill:var(--mm-digit);font-family:var(--anatomy-mono);letter-spacing:.08em}
:root{--mm-digit:#CCDBEB}
.iso-stage{outline:none;overflow:hidden}.iso-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:6px}
.mm-head{position:relative}.mm-head p{margin:0 0 12px;max-width:62ch}
.mm-kicker{padding-right:104px;font-family:var(--anatomy-mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--anatomy-muted)}
.mm-head h1{margin:0 0 12px;color:var(--anatomy-strong);font-size:24px;line-height:1.3;font-weight:650;text-wrap:balance;word-break:keep-all}
.mm-controls{display:grid;gap:10px;margin-top:14px}
.mm-scenes{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.mm-scenes button{font:12px/1 var(--anatomy-mono);color:var(--anatomy-text);background:transparent;border:1px solid var(--anatomy-lo);border-radius:999px;padding:8px 12px;cursor:pointer;min-height:34px}
.mm-scenes button[aria-pressed="true"]{border-color:var(--anatomy-strong);color:var(--anatomy-strong)}
.mm-scenes button[data-dose-down],.mm-scenes button[data-dose-up]{width:34px;padding:0;font-size:15px}
.mm-dose{font:12px/1 var(--anatomy-mono);color:var(--anatomy-strong);min-width:64px;text-align:center}
.mm-status{display:grid;gap:2px;margin:0;font:12px/1.6 var(--anatomy-mono);color:var(--anatomy-text);font-variant-numeric:tabular-nums;min-height:6.4em}
.iso-caption{display:block}
.mm-section{margin-top:36px}.mm-section h2{color:var(--anatomy-strong);font-size:17px;margin:0 0 12px;font-weight:650}
.mm-section ol,.mm-section ul{margin:0;padding-left:22px;display:grid;gap:8px}.mm-section b{color:var(--anatomy-strong)}
@media (max-width:560px){.mm-head h1{font-size:20px}.iso-plate-corner[data-corner="title"]{display:none}.iso-plate .iso-stage .iso-svg{width:118%;margin-left:-9%;max-width:none}}
` + EVIDENCE_CSS;

const force = ["light", "navy", "black"].find((n) => process.argv.includes("--" + n)) || null;
const { html, fragment } = pageDocument({
  isoCss: k.ISO_CSS, title: "SSRI 与 SNRI 回收台",
  body: intro + figure + steps + limits + sourcesHtml(PARAMS, SOURCES) + disclaimer,
  script: kitScript() + live, css: CSS, force, key: "ssri-snri-surface",
});
const out = join(HERE, force ? `ssri-snri-${force}.html` : "ssri-snri.html");
writeFileSync(out, html);
if (process.env.ARTIFACT_OUT && !force) writeFileSync(process.env.ARTIFACT_OUT, fragment);
console.log("wrote", out, `· baseline ${baseline.toFixed(1)} balls · ${(html.length / 1024).toFixed(0)} KB`);
