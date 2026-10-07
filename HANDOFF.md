# HANDOFF · 交给其他 agent 复刻 / 继续开发

Read this first, then `README.md`. The source in this repo **is** the finished site; do not regenerate it from the brief. Build it, open it, and change it from there.

## 1. 最快上手

```bash
npm install
npm run build        # writes dist/index.html (single file, three.js inlined, works offline)
npm run dev          # rebuild on change + serve dist/ at http://localhost:8000
```

- `dist/index.html` 可直接双击打开。
- URL 参数 `?n=30000` 可改粒子数量（默认电脑 60000 / 手机 26000）。
- 构建脚本还会生成 `.artifact/luminous-deep.html`（不进 Git）：通过 import map 从 jsDelivr 加载 three.js 的轻量版，只用于 claude.ai 预览。其他环境不需要。

## 2. 原始需求（用户原话）

> 做一个类似 usta.agency 的粒子网页，这次的粒子主题换成海洋生物，海洋生物一定要有水母，海龟，蓝鲸，魔鬼鱼，灯笼鱼，发光电鳗等，粒子配色要比原网页丰富（水母以蓝色荧光粒子为主色，选择某种生物以粉红色荧光为主色，其他粒子颜色你自行发挥），网页要有与之契合的神秘、深邃的配乐，首页大标题，以及每页的描述动物的英文字体选用中空、外层蓝色荧光，所有构成海洋动物的粒子不管是什么颜色，必须为荧光粒子

注意：参考站 usta.agency 在开发环境中无法访问，版式是按"随滚动变形的粒子网站"的常见做法设计的，不是逐项复刻。

## 3. 架构一页纸

```
scroll position ──► prog (0..8, 平滑追随)
                     │ seg = floor(prog), local = prog - seg
                     ▼
        ParticleField 同时持有 A = SHAPES[seg] 与 B = SHAPES[seg+1]
        uMorph = smoothstep(local)；每个粒子有随机延迟 aRnd.x
                     │
   顶点着色器：animate(typeA, posA, animA) → wA；animate(typeB, …) → wB
   位置 = mix(wA, wB, m) + 过渡中段的"浮游生物"散射 + 鼠标推开 + 点击光波
                     ▼
   加法混合的发光点精灵 → UnrealBloom（改成圆形高斯核）→ 保色相的色调映射 + 暗角 + 颗粒
```

要点：
- **每种生物 = 一个 `src/shapes/*.js` 文件**，返回 N 个点（位置、颜色、大小、4 维动画参数 `anim`）。用固定种子的随机数，所以形状每次相同。
- `anim.x` 是"部件编号"（如海龟 1=前鳍、2=后鳍），着色器据此决定怎么动；编号 9 保留给环境浮游粒子（`util.js` 的 `HALO`）。
- **动画全部写在 `src/particles.js` 的顶点着色器里**（`animTurtle`、`animManta`……），CPU 每帧只更新两个模型矩阵。
- `src/shapes/index.js` 决定每页的 `type`（对应哪个着色器分支）、模型尺寸 `w/h`、以及缓慢漂移的姿态 `pose(t)`。
- 新增一种生物：写一个 shape 文件 → 在 `index.js` 加一项 → 在 `particles.js` 加一个 `animXxx` 并加入 `animate()` → 在 `content.js` 加文案。

## 4. 每页设计要点

| 页 | 配色（均为高饱和荧光色） | 关键造型 |
|---|---|---|
| 首页 | 青、蓝、绿、紫、粉 | 五条旋臂的漩涡，粒子沿对数螺旋流入中心 |
| 海龟 | 荧光绿、荧光橙/琥珀、荧光红，每块盾片一个主色 | 玳瑁：锯齿状甲缘、鹰喙、长前鳍 |
| 魔鬼鱼 | **荧光粉红**、洋红、浅粉 | 菱形翼面、头鳍、鳃裂、肩部浅色斑块、细长尾 |
| 蓝鲸 | 靛蓝、淡紫、淡青 | 喉部平行褶皱、两个喷气孔、小背鳍、缺口尾叶 |
| 灯笼鱼 | 金黄鱼身、青色发光器 | 大眼、沿身体的发光点阵、分叉尾，后面一小群鱼 |
| 水母 | **蓝色荧光**为主，少量紫 | 伞缘光点、放射管、四条口腕、28 条触手加一条长触手 |
| 鮟鱇 | 紫色鱼身、黄绿诱饵 | 大嘴针状牙齿、钓竿和发光诱饵、扇形鳍 |
| 电鳗 | 绿、青、橙腹，电弧为紫白 | S 形身体、沿身体传导的放电脉冲、闪烁电弧 |
| 结尾 | 青、绿、紫、粉渐变 | 起伏的海面网格 |

## 5. 字体与配色

- 标题、英文名、英文描述句：`color: transparent` + `-webkit-text-stroke`（中空），外加多层 `drop-shadow` 形成蓝色荧光。进入页面时逐字闪烁通电（`.ch` + `@keyframes neon-on`）。
- 字体：Krona One（标题）、Sora（正文）、IBM Plex Mono（标签），均来自 Google Fonts。
- 界面元素用 Loyel 渐变蓝色板；生物粒子色不受该色板限制。

## 6. 配乐（`src/audio.js`）

全部由 Web Audio 实时合成，没有音频文件：失谐锯齿波和弦铺底、次低音 drone、棕噪声海流、卷积混响（程序生成的脉冲响应）、带反馈的延迟、钟声、鲸歌、声呐、气泡、电流声。每页对应一个场景（`SCENES`），控制和声、低通截止频率和各声部出现频率。必须由用户手势触发，否则浏览器不让出声。

## 7. 踩过的坑（别再踩）

1. **可变字体描边会露出内部线条**（Unbounded 的轮廓有重叠），改用静态字体 Krona One。
2. **UnrealBloomPass 默认核会在孤立亮点周围画出方块光斑**。解决：把每个模糊核的 sigma 改成 `radius / 2.4`（`src/post.js`）。
3. **粒子太密会全部曝成白色**。解决：按粒子总数缩放 `uAlpha`，并用保色相的色调映射，而不是逐通道压缩。
4. **窄屏上 Krona One 的大写字母很宽**，标题字号必须按 `--len`（最长一行的字符数）反算，见 `styles.css`。
5. **手机竖屏**：生物放在上半屏，文字压在下半屏并加渐变遮罩；不要让 `fixed` 的面板被地址栏挡住，用 `100lvh`。
6. 电鳗的电弧一开始被做成了"腿"。电弧要细、锯齿、短命（着色器里按时间片随机开关）。

## 8. 如何验证改动（无界面 Chromium）

页面暴露了 `window.__deep.jump(i)`，可跳到第 i 页（i 可以是小数，比如 `4.5` 就是两种生物的过渡中途）。用 Playwright + SwiftShader 软件渲染即可截图：

```js
chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
// page.goto('file:///…/dist/index.html?n=30000')
// await page.waitForFunction(() => window.__deep && document.body.classList.contains('ready'))
// await page.evaluate(i => window.__deep.jump(i), 3)
```

截图要同时看 1440×900 和 390×844 两种尺寸。配乐可通过 `window.__deep.audio` 接分析器测音量。

## 9. 已知局限

- 粒子的过渡延迟用 `Math.random`，所以每次打开的粒子分布略有不同，视觉上没有区别。
- 没有在真实 GPU 上测过帧率，只在软件渲染下验证了画面。低端手机可以用 `?n=` 降粒子数。
- 配乐的听感没有经过人耳验证，只测了音量和是否报错。
