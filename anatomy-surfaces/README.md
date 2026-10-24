# Anatomy 三色底板

给 [Anatomy](https://github.com/wheresryan22/anatomy) 插图用的可复用主题模板，提供三种底色：

| 色块 | 名称 | `data-surface` | 说明 |
|---|---|---|---|
| ⚪ | 浅蓝 | `light` | Loyel 渐变蓝浅色，系统浅色时默认使用 |
| 🔵 | 深蓝 | `navy` | Loyel 渐变蓝深色，系统深色时默认使用 |
| ⚫ | 黑色 | `black` | Anatomy 原版的灰黑，只在选中时使用 |

页面右上角放三个圆形色块，点哪个就切到哪种底色，选择会记在浏览器里；没选过时跟随系统深浅色。

## 文件

| 文件 | 用途 |
|---|---|
| `surfaces.mjs` | 唯一的源头：颜色变量、色块切换器、页面外壳 `pageDocument()` |
| `anatomy-surfaces.css`、`surface-picker.js` | 由 `node surfaces.mjs` 生成的静态版，给 React 或手写页面用 |
| `tokens.html` | 色板参考页：三种底色的每个变量并排显示 |
| `SKILL.md` | 作为 skill 时给 Claude 的使用说明 |

改颜色只改 `surfaces.mjs` 里的 `SURFACES`，然后运行 `node surfaces.mjs` 重新生成静态文件。

## 三种用法

1. **作为 skill（推荐）**：上传仓库根目录的 `anatomy-surfaces-skill.zip` 到 claude.ai 的 Skills。以后让 Claude 用 Anatomy 做图时，它会读 `SKILL.md`，自动套用三种底色。
2. **在构建脚本里引用**：`import { pageDocument, pickerHtml } from "../anatomy-surfaces/surfaces.mjs"`，用 `pageDocument()` 代替 Anatomy 的 `pageHtml()`。`../seedream-layers/build.mjs` 就是这样做的。
3. **静态引用**：在页面里加上 `anatomy-surfaces.css` 和 `surface-picker.js`，再把色块的 HTML 放进去（HTML 由 `pickerHtml()` 生成，也可以从 `seedream-layers.html` 里复制）。

## 规则

- 结构、线条、玻璃、屏幕的颜色只用变量（`--anatomy-*` 和 `--fig-*`），不要写死颜色值。
- 浅蓝和深蓝里的蓝色只用 Loyel 色板。
- 插图里画的内容（照片、海报、染色切片）保留自己的自然颜色，只有机器随底色变化。
- 不要给 `<body>` 加 `class="iso"`，否则会被 Anatomy 默认的灰色变量覆盖。
