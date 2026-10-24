---
name: anatomy-surfaces
description: Three switchable surfaces for Anatomy figures and other isometric HTML explainers made for this user — light blue and navy (Loyel gradient blue) plus Anatomy's original black — with a three-swatch picker that follows the viewer's theme until they pick. Use it together with the anatomy skill whenever building an Anatomy figure, an interactive explainer page or an isometric SVG page (medical mechanisms, pharmacology, neuroscience, technical concepts), so the page ships with these three surfaces instead of Anatomy's grey default. Also use it when the user asks for "三种底色", "浅蓝深蓝黑色", "Loyel 底色" or the surface picker on a figure.
---

# Anatomy surfaces

Anatomy draws every fill and stroke from CSS tokens (`--anatomy-*`). This skill swaps its grey token sets for three surfaces the user chose:

| Surface | `data-surface` | Look | Used when |
|---|---|---|---|
| 浅蓝 | `light` | Loyel light blue, white tops, navy ink | Default for a light system theme |
| 深蓝 | `navy` | Loyel navy blueprint, pale ink | Default for a dark system theme |
| 黑色 | `black` | Anatomy's original near-black and greys | Only when picked (it is the look of the original Anatomy videos) |

With no pick the page follows the viewer: light → 浅蓝, dark → 深蓝. A pick on the swatches sets `data-surface` on `<html>`, wins over the system, and is remembered in that browser.

## Files (in this skill's base directory)

- `surfaces.mjs`: the one source. Exports `SURFACES`, `surfaceCss()`, `pickerHtml()`, `PICKER_CSS`, `pickerScript()`, `baseCss()` and `pageDocument()`. `node surfaces.mjs` regenerates the three files below.
- `anatomy-surfaces.css`, `surface-picker.js`: the same, as static files, for React/Next.js or hand-written pages.
- `tokens.html`: every token of every surface as chips, for checking a colour.

## Use with an Anatomy build script

Build the figure exactly as the anatomy skill says. Only the page shell changes: use `pageDocument` instead of the kit's `pageHtml`, because `pageHtml` puts `class="iso"` on `<body>`, which brings back the grey tokens.

```js
import { pathToFileURL } from "node:url";
import { join } from "node:path";
const SURF = "<this skill's base directory>";   // printed as "Base directory for this skill"
const { pageDocument, pickerHtml } = await import(pathToFileURL(join(SURF, "surfaces.mjs")).href);

const header = `<header class="fig-head" style="position:relative">
  <h1>…</h1>
  ${pickerHtml({ corner: true })}
</header>`;
const force = ["light", "navy", "black"].find((n) => process.argv.includes("--" + n)) || null;
const { html, fragment } = pageDocument({
  isoCss: k.ISO_CSS,                 // the kit's CSS
  title: "…",                        // a 2–4 word name
  body: header + k.plateHtml({ … }) + sections,
  script: kitScript() + live,        // the figure's live code; the picker code is appended for you
  css: FIGURE_CSS,                   // the figure's own styles
  force,                             // pins one surface, for checks
  key: "my-figure-surface",          // localStorage key, one per page
});
writeFileSync(force ? `page-${force}.html` : "page.html", html);
```

`fragment` is the same page without `<!doctype>`/`<html>`/`<body>`: publish that file as a claude.ai Artifact.

Options: `system: { light: "light", dark: "black" }` makes black the dark default instead of navy; `width` sets the page column (760).

## Rules

- **Colour only through tokens.** Never type a hex into figure CSS for structure, ink, glass or screens. Use `--anatomy-*`, and for the four things the kit has no token for, `--fig-glass` with `--fig-glass-o` (glass tint and opacity), `--fig-screen` (ground of a recessed screen) and `--fig-lens` (lens or window fill).
- **Blues are Loyel only** in 浅蓝 and 深蓝. `--anatomy-blue` is a Loyel blue on every surface. Red and green tokens stay for real colour channels or warnings.
- **Content colour is the subject's own.** An image, a stained cell, a drug's label colour or a poster drawn inside the figure keeps its natural colours on every surface; only the machine follows the surface.
- **One lit part.** `--anatomy-lit` is navy on 浅蓝 and white on 深蓝 and 黑色; keep exactly one lit part, as the anatomy skill says.
- **Don't add `class="iso"`** to `<body>` or a wrapper, and don't use `figureSvg({ standalone })` for the page: both bring back Anatomy's grey tokens. A lone exported `.svg` is the exception; it stays grey.

## Verify all three

Build each surface (`--light`, `--navy`, `--black`) and run the anatomy checks on every one:

```sh
node scripts/lines.mjs page-light.html && node scripts/lines.mjs page-navy.html && node scripts/lines.mjs page-black.html
node scripts/capture.mjs page.html --out shots/phone.png --width 390 --select main
```

Each must print `line ends: 0` and a clean console. Then click each swatch once in `drive.mjs` and confirm `aria-pressed` follows and `localStorage` holds the pick. Read the screenshots: on 黑色 the faint lines are dim by design (it is the original look); on 浅蓝 check that light-coloured content (white text, pale glass) still reads.
