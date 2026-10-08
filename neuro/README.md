# Neuroplasticity · 神经可塑性粒子网页

A scroll-driven particle site about neuroplasticity. The journey climbs the nervous system's levels of organisation, L1 molecule to L10 brain–body–environment, following the user's reference figure (composition, connection, support, modulation and realisation axes). Every structure is drawn in low-saturation blue fluorescent particles; warmer accents mark only signals (ions, transmitters, neuromodulators, hormones). A score and sound effects are synthesised live in the browser.

- **Open:** `neuro/dist/index.html` (single file, three.js and fonts inlined, works offline).
- **GitHub Pages:** `docs/neuro/index.html` → `https://zhongkailongneu-cmd.github.io/claude/neuro/` once Pages serves `docs/`.
- **Build:** `npm install && npm run build:neuro` (or `npm run dev:neuro` for rebuild-on-change at http://localhost:8001).
- URL option: `?n=30000` sets the particle count (default 60,000 desktop / 26,000 phone).

---

## 实现方案

### 1. 页面结构：13 屏，沿组成轴自下而上

| # | 层级 | 英文标题（中空 + 蓝色荧光） | 粒子造型与动画 | 可塑性要点（页面内附文献） |
|---|---|---|---|---|
| 0 | 序章 | NEUROPLASTICITY | 巨型锥体神经元（双光子成像质感），动作电位沿轴突下行、反向传入树突；远处还有几个暗淡的神经元 | 总览与交互说明 |
| 1 | L1 分子 | MOLECULE | CaMKII 十二聚体（两层六元环枢纽 + 12 个激酶域），NMDA 受体开放，Ca²⁺ 涌入，T286 磷酸化沿环扩散后重置 | Giese 1998 |
| 2 | L2 亚细胞 | SPINE | 树突与蘑菇型、细长型、粗短型树突棘和丝状伪足；增强的棘头分四组轮流增大，伪足伸缩，线粒体沿树突漂移 | Matsuzaki 2004；Xu 2009 |
| 3 | L3 细胞 | NEURON & GLIA | 神经元、少突胶质（一个细胞包六段髓鞘）、星形胶质（终足接毛细血管）、小胶质；动作电位跳跃式传导，星形胶质 Ca²⁺ 波 | Henneberger 2010；McKenzie 2014 |
| 4 | L4 突触 | SYNAPSE | 三方突触：囊泡释放谷氨酸 → 高频刺激 → Ca²⁺ → AMPA 受体插入 PSD → 衰减，循环播放 | Bliss & Lømo 1973；Bi & Poo 1998 |
| 5 | L5 微环路 | ENGRAM | 约 140 个神经元组成的分层皮层柱；稀疏印迹细胞同步点亮，中间神经元随后给出反馈抑制 | Liu 2012；Han 2007 |
| 6 | L6 脑区 | HIPPOCAMPUS | 海马五张连续切片（CA + 齿状回），三突触通路脉冲，θ 节律明暗，尖波涟漪，新生神经元 | Maguire 2000；【争议】成年人神经发生 |
| 7 | L7 长程环路 | CIRCUIT | 皮层–纹状体–苍白球–丘脑环路，vmPFC→杏仁核；DA/5-HT/NE/ACh 四个调制系统轮流投射并弥散 | Schultz 1997；Reynolds 2001 |
| 8 | L7–8 结构底座 | WHITE MATTER | 纤维束追踪：胼胝体、皮质脊髓束、弓状束、扣带束、IFOF、钩束、ILF、小脑脚、丘脑辐射 | Scholz 2009 |
| 9 | L8 大尺度网络 | NETWORKS | DMN / SN / CEN 节点与连线；突显网络闪亮时 DMN 与 CEN 交替主导 | Raichle 2001；Sridharan 2008 |
| 10 | L9 全脑 | BRAIN | 带脑回与外侧裂的皮层、小脑、脑干；慢波从前向后扫过 | Draganski 2004；Elbert 1995 |
| 11 | L10 脑–身体–环境 | BODY & WORLD | 中枢与周围神经、迷走神经–心脏–肠道、HPA 轴、身体轮廓、环境与他人；心跳、呼吸、皮质醇回路 | Vyas 2002；Erickson 2011 |
| 12 | 终章 | KEEP REWIRING | 展开的皮层薄片随慢波起伏 | 五种层级关系回顾 |

翻页时，上一层级的结构缩小远去，粒子散成一团「信号云」，再从更大的尺度聚合成下一层级，产生一路拉远镜头的感觉；往回滚动则反向播放。

### 2. 粒子配色

- **主体**：所有神经结构都用 Loyel 色阶中的低饱和蓝（#E8EEF6 / #CCDBEB / #9FBDDA / #6C9AC4 / #497DAE），以加法混合加泛光呈现荧光感。
- **点缀色**：只给有含义的信号用，每页图例都有说明。
  - 谷氨酸、磷酸化、突显网络：柔金 #E3C27E
  - Ca²⁺：青 #8FD3D6
  - 多巴胺：琥珀 #F0B27A
  - 5-HT：玫瑰 #E7A1C1
  - 去甲肾上腺素、新生神经元：薄荷 #9FE0C0
  - 乙酰胆碱、钙调蛋白、中间神经元：薰衣草 #B9A6F0
  - 心脏：珊瑚 #E89A9A
  - 小胶质、皮质醇：琥珀 #E2B77D
- **界面**：所有界面颜色都取自 Loyel 色阶，不使用任何高饱和蓝。

### 3. 字体

- **标题字体**：参考站 usta.agency 在开发环境中被网络策略拦截，无法直接读取它的 CSS。Awwwards 把该站收录在「Websites using Oswald font」合集中（Honorable Mention，2024-04-05），所以标题默认用 **Oswald**。
- **中空处理**：中空字是 `-webkit-text-stroke` 描边加多层 `drop-shadow` 外发光。
  - 可变字体的轮廓有重叠，描边后字母内部会露出线条（Cinzel 处理前就很明显）。
  - 所以 `scripts/fonts.py` 用 fontTools 把每个字体实例化到固定字重，再用 skia-pathops 合并重叠轮廓，然后子集化为 woff2。
  - 处理后的字体存放在 `neuro/fonts/`（SIL OFL），构建时以 base64 内嵌进页面。
- **中文**：小字全部用中文，正文用 Noto Sans SC，可切换为 Noto Serif SC 或系统字体。

### 4. 页面设置（右上角「调节」）

- 标题荧光强度：0–200%，0 即纯描边
- 粒子荧光强度：20–200%，同时调节粒子光晕与泛光强度
- 标题字体：Oswald（原站字体）/ Bebas Neue / Orbitron / Cinzel / Krona One
- 字重（细 / 常规 / 粗）、标题字号（70–130%）、描边粗细（0.5–2×）
- 中文字体：黑体 / 宋体 / 系统
- 配乐音量、音效音量
- 设置保存在浏览器 localStorage 中，不可用时只在本次访问中生效

标题字号按「字符数 × 字体平均字宽」反算，换成宽体字也不会溢出。

### 5. 声音（Web Audio 实时合成，没有音频文件）

- **配乐**：
  - 和声随层级变化：分子层是明亮的 D 利底亚，细胞层是 D 小调色彩，环路层是 D 多利亚，全脑与身体层是开放的挂留大调
  - 其他声部：次低音 drone、高频玻璃质微光层（海马页以约 6 Hz 的 θ 节律颤动）、Poisson 随机发放的锋电位咔嗒声、身体页的呼吸声
- **画面同步音效**：`src/timing.js` 是唯一的时间表，着色器动画和声音事件都从这里取周期，保证同步。例如：
  - 动作电位的「zip」声
  - CaMKII 逐个磷酸化时的上行琶音
  - 跳跃式传导经过每个郎飞结时的嘀嗒
  - 高频刺激的连发脉冲与 LTP 上行和弦
  - 印迹细胞重新激活时的和弦
  - 三突触通路每到一站的音符
  - 环路循环琶音，四种调制系统各自的音色
  - 网络切换时的双音
  - 心跳
- **交互音效**：
  - 鼠标划过粒子时出现噼啪声，密度随鼠标速度变化
  - 点击发放动作电位：1 秒内连击按 AP → LTP ×2…×6 逐级升调、光环增强，并显示浮标
  - 翻页时有扫频声，滚动方向决定扫频方向
  - 按钮悬停与点击、滑块（音高随数值变化）、面板开合、恢复默认，各有提示音
- **触屏**：只有轻点才发放动作电位，滑动翻页不会发声。
- **启动方式**：浏览器要求用户先交互才能出声。点击「开启声音 · 进入」、右上角声音按钮，或在画面任意位置第一次点击，都会开启声音。

---

## Files

```
neuro/
  src/
    main.js          scroll, layout, render loop, pointer, sound wiring
    particles.js     particle field: morph (zoom-out), pointer, ripple, glow
    anim.glsl.js     per-page vertex-shader animations (GLSL)
    timing.js        shared periods for animation and sound events
    shapes/*.js      procedural point clouds, one file per page
      util.js        vectors, splines, branching trees, noise, palette
      neuron.js      pyramidal neuron generator (hero and background)
      brainshape.js  shared brain geometry (cortex with folds, cerebellum, stem)
    ambient.js       backdrop and neural dust
    post.js          bloom + tone mapping, vignette, grain
    audio.js         generative score and sound effects
    settings.js      settings panel, CSS variables, localStorage
    content.js       Chinese copy, scales, evidence, colour legends
    ui.js            panels, level ladder, scroll track
    styles.css       hollow neon type, layout, phone layout
    body.html        static page chrome
  fonts/             hollow-safe display fonts (generated) + OFL notice
  scripts/
    build.mjs        bundles to neuro/dist, docs/neuro and .artifact/
    fonts.py         regenerates fonts/ (fontTools + skia-pathops)
    shoot.mjs        headless screenshots of every page + console errors
```

To add a page: write `src/shapes/<name>.js` → add an entry (type, size, pose, sound events) in `src/shapes/index.js` → add an `animXxx` branch in `src/anim.glsl.js` and to `animate()` → add copy in `src/content.js` → add a scene in `src/audio.js` `SCENES`.

## Verify

```bash
npm run build:neuro
npm i -D playwright            # or PW_MODULE=/path/to/playwright/index.mjs
node neuro/scripts/shoot.mjs neuro/dist/index.html shots            # all pages, desktop + phone
PAGES=4.5 SIZES=desktop node neuro/scripts/shoot.mjs                # mid-transition
```

The page exposes `window.__neuro` (`jump(i)`, `audio`, `settings`, `soundOn()`) for automated checks. Checked so far, in software WebGL (SwiftShader):

- every page at 1440×900 and 390×844, plus mid-transition frames
- the settings panel (font switching, glow 0–200%, storage)
- mouse clicks and touch taps
- every sound event: each one measurably raises the output level, and there are no page errors

## Known limits

- The frame rate has not been measured on a real GPU, only rendered in software. Use `?n=` to lower the particle count on weak phones.
- The score and effects were checked by level meter, not by ear.
- The usta.agency font is taken from Awwwards' Oswald listing, because the site itself could not be opened from this environment. If the live site has changed, swap `FONTS.oswald` in `src/settings.js` and `FAMILIES` in `scripts/fonts.py`.
- Particle transition delays use `Math.random`, so each load scatters slightly differently. This makes no visible difference.
