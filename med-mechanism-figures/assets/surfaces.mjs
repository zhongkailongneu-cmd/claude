// Three surfaces for Anatomy figures: light blue and navy (Loyel gradient blue) and Anatomy's original black.
// One source for the tokens, the swatch picker and the page shell. Run `node surfaces.mjs` to write the
// static files beside it (anatomy-surfaces.css, surface-picker.js, tokens.html).
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Tokens every surface shares.
const COMMON = {
  "anatomy-weight": ".6px",
  "anatomy-ease": "cubic-bezier(.32,.72,0,1)",
  "anatomy-mono": 'ui-monospace,"SF Mono",Menlo,Consolas,monospace',
};

// Each surface sets every Anatomy token, plus four figure tokens (--fig-*) that kit tokens don't cover:
// a glass tint and its opacity, the ground of a recessed screen, and a lens or window fill.
export const SURFACES = {
  light: {
    label: "浅蓝",
    swatch: "#F4F7FB",
    scheme: "light",
    tokens: {
      "anatomy-page": "#E8EEF6", "anatomy-card": "#F4F7FB", "anatomy-text": "#2B4868", "anatomy-strong": "#263B54", "anatomy-muted": "#497DAE",
      "anatomy-paper": "#F4F7FB", "anatomy-face": "#FFFFFF", "anatomy-top": "#FFFFFF",
      "anatomy-shade-0": "#CCDBEB", "anatomy-shade-1": "#E8EEF6", "anatomy-shade-2": "#E8EEF6", "anatomy-shade-3": "#F4F7FB",
      "anatomy-lit-top": "#FFFFFF", "anatomy-lit-shade": "#E8EEF6",
      "anatomy-hi": "#2E5076", "anatomy-mid": "#6C9AC4", "anatomy-lo": "#9FBDDA", "anatomy-faint": "#CCDBEB", "anatomy-lit": "#263B54",
      "anatomy-halo": "#6C9AC4", "anatomy-halo-opacity": ".3", "anatomy-dot": "#2B4868",
      "anatomy-red": "#e5484d", "anatomy-green": "#30a46c", "anatomy-blue": "#376392",
      "fig-glass": "#9FBDDA", "fig-glass-o": ".16", "fig-screen": "#263B54", "fig-lens": "#CCDBEB",
    },
  },
  navy: {
    label: "深蓝",
    swatch: "#2B4868",
    scheme: "dark",
    tokens: {
      "anatomy-page": "#263B54", "anatomy-card": "#2B4868", "anatomy-text": "#CCDBEB", "anatomy-strong": "#F4F7FB", "anatomy-muted": "#9FBDDA",
      "anatomy-paper": "#2B4868", "anatomy-face": "#2E5076", "anatomy-top": "#2E5076",
      "anatomy-shade-0": "#263B54", "anatomy-shade-1": "#2B4868", "anatomy-shade-2": "#2B4868", "anatomy-shade-3": "#2E5076",
      "anatomy-lit-top": "#376392", "anatomy-lit-shade": "#2E5076",
      "anatomy-hi": "#E8EEF6", "anatomy-mid": "#9FBDDA", "anatomy-lo": "#6C9AC4", "anatomy-faint": "#497DAE", "anatomy-lit": "#FFFFFF",
      "anatomy-halo": "#263B54", "anatomy-halo-opacity": ".85", "anatomy-dot": "#E8EEF6",
      "anatomy-red": "#ff6b6b", "anatomy-green": "#6be0a0", "anatomy-blue": "#9FBDDA",
      "fig-glass": "#CCDBEB", "fig-glass-o": ".08", "fig-screen": "#263B54", "fig-lens": "#9FBDDA",
    },
  },
  black: {
    label: "黑色",
    swatch: "#131313",
    scheme: "dark",
    tokens: {
      "anatomy-page": "#0b0b0b", "anatomy-card": "#131313", "anatomy-text": "#a3a3a3", "anatomy-strong": "#e6e6e6", "anatomy-muted": "#6e6e6e",
      "anatomy-paper": "#131313", "anatomy-face": "#1b1b1b", "anatomy-top": "#1c1c1c",
      "anatomy-shade-0": "#0f0f0f", "anatomy-shade-1": "#121212", "anatomy-shade-2": "#151515", "anatomy-shade-3": "#181818",
      "anatomy-lit-top": "#262626", "anatomy-lit-shade": "#1d1d1d",
      "anatomy-hi": "#d4d4d4", "anatomy-mid": "#6a6a6a", "anatomy-lo": "#3e3e3e", "anatomy-faint": "#2a2a2a", "anatomy-lit": "#ffffff",
      "anatomy-halo": "#050505", "anatomy-halo-opacity": ".9", "anatomy-dot": "#e6e6e6",
      "anatomy-red": "#ff6b6b", "anatomy-green": "#6be0a0", "anatomy-blue": "#6C9AC4",
      "fig-glass": "#e6e6e6", "fig-glass-o": ".05", "fig-screen": "#0b0b0b", "fig-lens": "#6a6a6a",
    },
  },
};
export const NAMES = Object.keys(SURFACES);

const decls = (tokens) => Object.entries(tokens).map(([name, value]) => `--${name}:${value}`).join(";");
const block = (selector, name) => `${selector}{${decls(SURFACES[name].tokens)};color-scheme:${SURFACES[name].scheme}}`;

// The token CSS. With no pick the page follows the viewer: `system.light` for light, `system.dark` for dark
// (prefers-color-scheme, or data-theme="light|dark" on the root). A pick sets data-surface on the root and wins.
export function surfaceCss({ system = { light: "light", dark: "navy" } } = {}) {
  return [
    `:root{${decls(COMMON)}}`,
    block(":root", system.light),
    `@media (prefers-color-scheme:dark){${block(':root:not([data-theme="light"])', system.dark)}}`,
    block(':root[data-theme="dark"]', system.dark),
    block(':root[data-theme="light"]', system.light),
    ...NAMES.map((name) => block(`:root[data-surface="${name}"]`, name)),
  ].join("\n");
}

// The picker: one round swatch per surface. Place it anywhere; add `as-picker--corner` to pin it top-right
// of a positioned parent.
export function pickerHtml({ label = "底色", corner = false } = {}) {
  const buttons = NAMES.map((name) => {
    const s = SURFACES[name];
    return `<button type="button" class="as-swatch" data-pick="${name}" aria-pressed="false" aria-label="${s.label}底色" title="${s.label}" style="background:${s.swatch}"></button>`;
  }).join("");
  return `<div class="as-picker${corner ? " as-picker--corner" : ""}" role="group" aria-label="${label}">${buttons}</div>`;
}

export const PICKER_CSS = `
.as-picker{display:inline-flex;gap:8px}
.as-picker--corner{position:absolute;top:-4px;right:0}
.as-swatch{width:24px;height:24px;border-radius:50%;padding:0;cursor:pointer;border:1px solid var(--anatomy-mid)}
.as-swatch[aria-pressed="true"]{box-shadow:0 0 0 2px var(--anatomy-page),0 0 0 3.5px var(--anatomy-strong)}
.as-swatch:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:5px}
`;

// The picker's behaviour. `key` names the localStorage entry, so each page can remember its own pick.
export function pickerScript({ system = { light: "light", dark: "navy" }, key = "anatomy-surface" } = {}) {
  return `
(() => {
  const root = document.documentElement;
  const names = ${JSON.stringify(NAMES)};
  const swatches = [...document.querySelectorAll(".as-swatch")];
  const dark = () => root.getAttribute("data-theme") === "dark" || (root.getAttribute("data-theme") !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  const now = () => root.getAttribute("data-surface") || (dark() ? ${JSON.stringify(system.dark)} : ${JSON.stringify(system.light)});
  const mark = () => { const n = now(); swatches.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.pick === n))); };
  if (!root.hasAttribute("data-surface")) { try { const saved = localStorage.getItem(${JSON.stringify(key)}); if (names.includes(saved)) root.setAttribute("data-surface", saved); } catch (e) {} }
  swatches.forEach((b) => b.addEventListener("click", () => {
    root.setAttribute("data-surface", b.dataset.pick);
    try { localStorage.setItem(${JSON.stringify(key)}, b.dataset.pick); } catch (e) {}
    mark();
  }));
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", mark);
  new MutationObserver(mark).observe(root, { attributes: true, attributeFilter: ["data-theme", "data-surface"] });
  mark();
})();
`;
}

// Page chrome Anatomy's pageHtml would otherwise give, without its class="iso" body (which would bring back
// the grey tokens): a token background, a CJK-friendly font stack and a safe-area side gutter.
export function baseCss({ width = 760 } = {}) {
  return `
*{box-sizing:border-box}
body{margin:0;background:var(--anatomy-page);color:var(--anatomy-text);font:14px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI","PingFang SC","Noto Sans CJK SC",sans-serif;-webkit-font-smoothing:antialiased;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.iso-page{width:min(${width}px,100%);margin:0 auto;padding-block:56px 88px}
`;
}

const escape = (text) => String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Replaces Anatomy's pageHtml. Returns `html` (a standalone file) and `fragment` (for publishing as a claude.ai
// Artifact, which wraps the page in its own document). `isoCss` is the kit's ISO_CSS; `force` pins one surface
// (for screenshots and checks).
export function pageDocument({ isoCss, title, body, script = "", css = "", width = 760, lang = "zh-CN", force = null, system, key }) {
  if (!isoCss) throw new Error("pageDocument needs isoCss: pass the kit's ISO_CSS");
  if (force && !NAMES.includes(force)) throw new Error(`force must be one of ${NAMES.join(", ")}`);
  const head = `<title>${escape(title)}</title><meta name="claude:viewport-fit-sides" content="cover"><style>${isoCss}${baseCss({ width })}${surfaceCss({ system })}${PICKER_CSS}${css}</style>`;
  const code = (script + pickerScript({ system, key })).replace(/<\/(script)/gi, "<\\/$1");
  const content = `<main class="iso-page">${body}</main><script type="module">${code}</script>`;
  const html = `<!doctype html><html lang="${lang}"${force ? ` data-surface="${force}"` : ""}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">${head}</head><body>${content}</body></html>`;
  return { html, fragment: head + content };
}

// A reference page: every token of every surface as a chip, with a sample card drawn from the tokens.
function tokensPage() {
  const names = Object.keys(SURFACES.light.tokens);
  const column = (name) => {
    const s = SURFACES[name];
    const chips = names.map((token) => {
      const value = s.tokens[token];
      const swatch = value.startsWith("#") ? `<span class="tk-chip" style="background:${value}"></span>` : `<span class="tk-chip tk-num">${value}</span>`;
      return `<li>${swatch}<code>--${token}</code><span class="tk-val">${value}</span></li>`;
    }).join("");
    return `<section class="tk-col" data-surface="${name}" style="${decls(s.tokens)};color-scheme:${s.scheme}">
<h2>${s.label} <small>${name}</small></h2>
<div class="tk-card"><span class="tk-fig">Fig 1</span><svg viewBox="0 0 120 80" aria-hidden="true"><path d="M10 45 60 20 110 45 60 70Z" fill="var(--anatomy-top)" stroke="var(--anatomy-hi)" stroke-width=".8"/><path d="M10 45v6l50 25v-6Z" fill="var(--anatomy-shade-1)" stroke="var(--anatomy-hi)" stroke-width=".8"/><path d="M110 45v6L60 76v-6Z" fill="var(--anatomy-shade-3)" stroke="var(--anatomy-hi)" stroke-width=".8"/><path d="M40 40 60 30 80 40 60 50Z" fill="none" stroke="var(--anatomy-lit)" stroke-width="1.2"/><path d="M25 46 60 29" stroke="var(--anatomy-lo)" stroke-width=".6"/></svg><span class="tk-read">readout · 34.0</span></div>
<ul>${chips}</ul></section>`;
  };
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Anatomy 三色底板</title><style>
*{box-sizing:border-box}body{margin:0;background:#E8EEF6;color:#263B54;font:13px/1.5 ui-sans-serif,system-ui,"PingFang SC","Noto Sans CJK SC",sans-serif;padding:32px max(16px,env(safe-area-inset-left,0px))}
h1{font-size:20px;margin:0 0 6px}p{margin:0 0 20px;color:#2B4868;max-width:70ch}
.tk-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
.tk-col{background:var(--anatomy-page);color:var(--anatomy-text);padding:16px;border-radius:6px;min-width:0}
.tk-col h2{margin:0 0 12px;font-size:15px;color:var(--anatomy-strong)}.tk-col small{font:11px ui-monospace,monospace;color:var(--anatomy-muted)}
.tk-card{position:relative;background:var(--anatomy-card);box-shadow:0 0 0 1px var(--anatomy-mid);padding:26px 12px 22px;margin-bottom:12px}
.tk-card svg{display:block;width:70%;margin:0 auto}.tk-fig,.tk-read{position:absolute;font:10px ui-monospace,monospace;color:var(--anatomy-muted)}.tk-fig{top:8px;left:10px}.tk-read{bottom:6px;right:10px;color:var(--anatomy-text)}
ul{list-style:none;margin:0;padding:0;display:grid;gap:4px}li{display:grid;grid-template-columns:18px 1fr auto;gap:8px;align-items:center;min-width:0}
.tk-chip{width:18px;height:14px;border-radius:3px;box-shadow:0 0 0 1px var(--anatomy-mid)}.tk-num{box-shadow:none;font-size:9px;color:var(--anatomy-muted)}
code{font:11px ui-monospace,monospace;color:var(--anatomy-strong);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tk-val{font:11px ui-monospace,monospace;color:var(--anatomy-muted)}
</style></head><body><h1>Anatomy 三色底板</h1><p>浅蓝和深蓝用 Loyel 渐变蓝，黑色是 Anatomy 原版的灰阶。每一列都是同一组变量名，换底色只换数值。--fig-* 是插图里常用、但 Anatomy 套件本身没有的四个变量：玻璃色和透明度、屏幕底色、镜片色。</p><div class="tk-grid">${NAMES.map(column).join("")}</div></body></html>`;
}

// `node surfaces.mjs` writes the static files for projects that don't build with Node.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const here = dirname(fileURLToPath(import.meta.url));
  const header = "/* Generated by surfaces.mjs. Edit the tokens there, then run `node surfaces.mjs`. */\n";
  writeFileSync(join(here, "anatomy-surfaces.css"), header + surfaceCss() + "\n" + PICKER_CSS);
  writeFileSync(join(here, "surface-picker.js"), header + pickerScript());
  writeFileSync(join(here, "tokens.html"), tokensPage());
  console.log("wrote anatomy-surfaces.css, surface-picker.js, tokens.html");
}
