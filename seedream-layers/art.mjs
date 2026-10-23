// The poster that gets split: six layers drawn in a 300 × 400 frame (u right, v down).
// Every layer is transparent except for its own element, as Seedream 5.0 Pro returns them.

export const POSTER = { w: 300, h: 400 };

// The base layer's palette is the only thing "Recolour" changes.
export const PALETTES = {
  sunset: { sky0: "#E47A63", sky1: "#F3A57D", sky2: "#FBD9B0", sun: "#FFF1D8", far: "#D08C7C", mid: "#A9646A", near: "#77435A", ground: "#4F2D47" },
  night: { sky0: "#17143A", sky1: "#33296A", sky2: "#6B5A9E", sun: "#F1EBD4", far: "#5C4D8C", mid: "#463A72", near: "#2F2756", ground: "#211C40" },
};

const f = (n) => Math.round(n * 10) / 10;
const pts = (list) => list.map(([x, y]) => `${f(x)} ${f(y)}`).join(" L");
const poly = (list) => `M${pts(list)}Z`;

function bezier(p0, c, p1, t) {
  const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, d = t * t;
  return [a * p0[0] + b * c[0] + d * p1[0], a * p0[1] + b * c[1] + d * p1[1]];
}
function tangent(p0, c, p1, t) {
  const x = 2 * (1 - t) * (c[0] - p0[0]) + 2 * t * (p1[0] - c[0]);
  const y = 2 * (1 - t) * (c[1] - p0[1]) + 2 * t * (p1[1] - c[1]);
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}

// A palm frond: a curved rib with leaflets swept toward the tip on both sides.
function frond(p0, c, p1, length, count, fills, rib) {
  const leaves = [[], []];
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    const [px, py] = bezier(p0, c, p1, t);
    const [tx, ty] = tangent(p0, c, p1, t);
    const L = length * (1 - 0.62 * t);
    const w = 3.4 * (1 - 0.5 * t);
    for (const side of [1, -1]) {
      const nx = -ty * side, ny = tx * side;
      const dx = nx * Math.cos(0.62) + tx * Math.sin(0.62);
      const dy = ny * Math.cos(0.62) + ty * Math.sin(0.62);
      const tip = [px + dx * L, py + dy * L];
      const mid = [px + dx * L * 0.5, py + dy * L * 0.5];
      leaves[i % 2].push(poly([[px - tx * w, py - ty * w], [mid[0] + nx * w * 0.2 - tx * w * 0.6, mid[1] + ny * w * 0.2 - ty * w * 0.6], tip, [mid[0] + tx * w * 0.9, mid[1] + ty * w * 0.9], [px + tx * w, py + ty * w]]));
    }
  }
  const spine = `M${f(p0[0])} ${f(p0[1])}Q${f(c[0])} ${f(c[1])} ${f(p1[0])} ${f(p1[1])}`;
  return `<path fill="${fills[0]}" d="${leaves[0].join("")}"/><path fill="${fills[1]}" d="${leaves[1].join("")}"/><path fill="none" stroke="${rib}" stroke-width="1.6" stroke-linecap="round" d="${spine}"/>`;
}

// A broad leaf with notches cut into both edges, from its stalk to its tip.
function notchedLeaf(base, tip, width, fill, vein) {
  const [bx, by] = base, [tx, ty] = tip;
  const len = Math.hypot(tx - bx, ty - by);
  const ax = (tx - bx) / len, ay = (ty - by) / len;
  const nx = -ay, ny = ax;
  const at = (s, o) => [bx + ax * s * len + nx * o, by + ay * s * len + ny * o];
  const half = (s) => width * Math.sin(Math.PI * Math.min(1, s * 1.08)) * (0.55 + 0.45 * (1 - s));
  const sideOf = (sign) => {
    const out = [];
    for (let i = 0; i <= 18; i++) {
      const s = i / 18;
      const notch = i > 2 && i < 16 && i % 3 === 0 ? 0.42 : 1;
      out.push(at(s, sign * half(s) * notch));
    }
    return out;
  };
  const left = sideOf(1), right = sideOf(-1).reverse();
  const veins = [];
  for (let i = 2; i < 16; i += 3) {
    const s = (i + 1.5) / 18;
    const p = at(s, 0);
    for (const sign of [1, -1]) {
      const q = at(Math.min(1, s + 0.09), sign * half(s) * 0.8);
      veins.push(`M${f(p[0])} ${f(p[1])}L${f(q[0])} ${f(q[1])}`);
    }
  }
  const spine = at(0.98, 0);
  return `<path fill="${fill}" d="${poly([...left, ...right])}"/><path fill="none" stroke="${vein}" stroke-width="1.1" stroke-linecap="round" d="M${f(bx)} ${f(by)}L${f(spine[0])} ${f(spine[1])}${veins.join("")}"/>`;
}

const v = (name) => `var(--sl-${name})`;

export function layers() {
  const base = [
    `<rect x="0" y="0" width="300" height="400" fill="url(#sl-sky)"/>`,
    `<circle cx="196" cy="168" r="66" fill="${v("sun")}" opacity=".22"/>`,
    `<circle cx="196" cy="168" r="50" fill="${v("sun")}"/>`,
    `<path fill="${v("far")}" d="M0 252L40 214L78 236L120 196L162 228L206 186L250 222L300 200L300 400L0 400Z"/>`,
    `<path fill="${v("mid")}" d="M0 288L52 254L96 278L148 240L198 272L244 248L300 270L300 400L0 400Z"/>`,
    `<path fill="${v("near")}" d="M0 330C60 300 110 318 160 306C210 294 250 310 300 300L300 400L0 400Z"/>`,
    `<path fill="${v("ground")}" d="M0 374C80 360 200 368 300 356L300 400L0 400Z"/>`,
  ].join("");

  const fronds = [
    frond([-8, -6], [70, 10], [150, 92], 30, 13, ["#1F5A43", "#2C7A56"], "#174636"),
    frond([-10, 12], [40, 60], [86, 176], 28, 12, ["#2C7A56", "#3E9466"], "#174636"),
    frond([24, -10], [100, -6], [172, 34], 24, 11, ["#3E9466", "#2C7A56"], "#174636"),
    frond([-10, 50], [8, 120], [36, 190], 22, 9, ["#1F5A43", "#3E9466"], "#174636"),
  ].join("");

  const branch = [
    `<path fill="#5B3A29" d="M-6 290C60 280 140 262 236 233L239 240C150 270 70 297 -6 313Z"/>`,
    `<path fill="#5B3A29" d="M150 259C168 242 182 228 198 214L201 218C187 232 174 246 160 262Z"/>`,
    `<path fill="none" stroke="#3B2418" stroke-width="1.1" stroke-linecap="round" d="M8 298C60 290 110 280 150 268M40 300C80 292 120 284 170 268"/>`,
    `<path fill="#3E9466" d="M198 214C206 200 222 196 232 200C224 212 210 216 198 214Z"/>`,
    `<path fill="#2C7A56" d="M228 236C240 226 256 228 262 236C252 244 238 244 228 236Z"/>`,
  ].join("");

  const parrot = [
    `<path fill="#B42A22" d="M128 236L152 236L162 362L150 378L140 368Z"/>`,
    `<path fill="#2D63B0" d="M140 300L154 300L162 362L150 378L142 368Z"/>`,
    `<ellipse cx="136" cy="200" rx="24" ry="44" fill="#D7362B" transform="rotate(-8 136 200)"/>`,
    `<circle cx="126" cy="150" r="22" fill="#D7362B"/>`,
    `<path fill="#2D63B0" d="M140 176C164 186 168 232 157 292L146 300C140 262 134 222 131 190Z"/>`,
    `<path fill="#3E9A5B" d="M141 205C152 212 158 226 158 240C150 234 142 224 138 214Z"/>`,
    `<path fill="#F2C12E" d="M140 177C157 185 161 203 157 220C147 212 139 199 136 186Z"/>`,
    `<ellipse cx="117" cy="152" rx="10" ry="12" fill="#F4EADF"/>`,
    `<circle cx="119" cy="148" r="3.4" fill="#FFFFFF"/><circle cx="119.4" cy="148" r="2" fill="#1E1E1E"/>`,
    `<path fill="#EDE6D8" d="M107 148C96 146 87 157 91 172C95 165 100 161 109 161Z"/>`,
    `<path fill="#2A2A2A" d="M108 161C102 163 98 169 100 176C106 176 110 170 112 163Z"/>`,
    `<path fill="#6B6B6B" d="M124 252C120 256 122 262 128 262C132 262 133 258 131 254ZM138 249C134 253 136 259 142 259C146 258 147 254 145 250Z"/>`,
  ].join("");

  const toucan = [
    `<path fill="#1D1D22" d="M132 238L152 238L158 344L142 352Z"/>`,
    `<ellipse cx="138" cy="204" rx="22" ry="42" fill="#1D1D22" transform="rotate(-6 138 204)"/>`,
    `<circle cx="132" cy="158" r="20" fill="#1D1D22"/>`,
    `<ellipse cx="124" cy="180" rx="12" ry="18" fill="#F6E7A6"/>`,
    `<ellipse cx="148" cy="246" rx="7" ry="6" fill="#C8312B"/>`,
    `<path fill="#F28A24" d="M116 142C96 132 64 140 50 166C70 160 96 158 116 160Z"/>`,
    `<path fill="#F7C744" d="M116 142C98 134 70 140 56 156C76 148 98 146 116 150Z"/>`,
    `<path fill="#E9632B" d="M116 160C96 162 70 168 50 168C68 176 96 176 118 170Z"/>`,
    `<path fill="#1D1D22" d="M50 166C52 162 56 160 58 160C56 164 54 168 50 168Z"/>`,
    `<circle cx="131" cy="151" r="5.2" fill="#3EA2D6"/><circle cx="131" cy="151" r="2.1" fill="#111"/>`,
    `<path fill="#5E6670" d="M126 252C122 256 124 262 130 262C134 262 135 258 133 254ZM140 249C136 253 138 259 144 259C148 258 149 254 147 250Z"/>`,
  ].join("");

  const title = [
    `<g transform="rotate(-8 188 76)">`,
    `<text x="188" y="88" text-anchor="middle" font-family="'Arial Black','Helvetica Neue',Arial,sans-serif" font-weight="900" font-size="40" textLength="190" lengthAdjust="spacingAndGlyphs" fill="#FFF6E8" stroke="#6A2622" stroke-width="2.6" paint-order="stroke">TROPICAL</text>`,
    `<text x="188" y="106" text-anchor="middle" font-family="'Helvetica Neue',Arial,sans-serif" font-weight="700" font-size="9" textLength="150" lengthAdjust="spacing" fill="#FFF6E8" stroke="#6A2622" stroke-width="1.2" paint-order="stroke">VISIT THE ISLANDS · 1958</text>`,
    `</g>`,
  ].join("");

  const front = [
    notchedLeaf([312, 408], [196, 300], 44, "#17493A", "#0F3529"),
    notchedLeaf([300, 410], [254, 318], 26, "#226148", "#0F3529"),
    frond([-10, 410], [10, 360], [74, 330], 20, 9, ["#17493A", "#226148"], "#0F3529"),
  ].join("");

  return { base, fronds, branch, parrot, toucan, title, front };
}

// Names for the readout, front to back is z 5 → z 0.
export const NAMES = ["底图", "棕榈叶", "树枝", "鹦鹉", "标题", "前景叶"];
