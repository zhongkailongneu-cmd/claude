# Luminous Deep · 荧光深海粒子网页

A scroll-driven particle website about ocean life. Every creature is drawn in fluorescent particles that dissolve into drifting plankton and re-form as the next animal while you scroll. A score generated live in the browser plays underneath.

**Live site (GitHub Pages):** https://zhongkailongneu-cmd.github.io/claude/ (served from `docs/`; see "Publish" below).

**Open `dist/index.html` directly.** It is a single self-contained file (three.js inlined), so double-clicking it works offline.

---

## 实现方案

### 1. 页面结构（9 屏，按"下潜"顺序排列）

| # | 页面 | 粒子主色 | 动画 |
|---|------|---------|------|
| 0 | 首页 · LUMINOUS DEEP | 青 / 蓝 / 紫 / 粉 多彩 | 发光浮游生物组成的漩涡，粒子沿旋臂流入中心"深渊" |
| 1 | 海龟 Sea Turtle（玳瑁） | 荧光绿 + 琥珀 + 荧光红 | 前鳍划水、头部微动 |
| 2 | 魔鬼鱼 Manta Ray | **荧光粉红**（原型：粉色蝠鲼 Inspector Clouseau） | 双翼行波拍动、尾巴摆动 |
| 3 | 蓝鲸 Blue Whale | 靛蓝 / 长春花紫 / 淡青喉褶 | 身体上下波动，尾鳍最强 |
| 4 | 灯笼鱼 Lanternfish | 金色鱼身 + 青色发光器 | 左右摆尾游动，发光器明灭，周围有一小群鱼 |
| 5 | 水母 Jellyfish | **蓝色荧光** | 伞体收缩舒张，触手拖曳，伞缘光点旋转（Atolla 的"防盗警报"） |
| 6 | 鮟鱇 Anglerfish | 紫罗兰鱼身 + 黄绿诱饵灯 | 下颌开合、钓竿摇摆、诱饵脉动 |
| 7 | 电鳗 Electric Eel | 电光绿 / 青绿 / 橙色腹部 + 紫白电弧 | 身体行波，放电脉冲沿身体传导，电弧闪烁 |
| 8 | 结尾 · KEEP THE DEEP GLOWING | 多彩海面网格 | 海面涌浪，"返回海面"按钮 |

### 2. 粒子系统（Three.js + 自定义着色器）

- **一个 GPU 粒子场**（桌面 60,000 / 手机 26,000 个粒子）。每种生物都由程序化建模生成同样数量的点，每个点带有位置、颜色、大小和 4 个动画参数。
- **形变（morph）**：粒子场同时持有"当前生物 A"和"下一个生物 B"。滚动进度驱动 `uMorph` 0→1；每个粒子有随机延迟，过渡中段会散成一团漂流的浮游生物再重新聚合。
- **生物动画全部在顶点着色器中完成**（鳍拍动、伞体脉动、身体行波、电弧闪烁），CPU 只负责每帧更新两个模型矩阵。
- **荧光效果**：加法混合 + 柔光点精灵（亮核 + 光晕）+ UnrealBloom 泛光。最后一道后期按色相保持的方式压缩高光，密集处发出白热光芯但保留颜色，并加暗角与轻微颗粒。
- **交互**：鼠标划过时粒子像水中浮游生物一样被拨开；点击发出一圈光波（开声音时伴随声呐"叮"声）；镜头随鼠标轻微视差。
- 背景是随深度变暗的水柱渐变，浅层带光束（god rays），"海雪"粒子随下潜向上漂过。

### 3. 字体

- 首页大标题和每页的英文动物名、英文描述句：**中空描边 + 外层蓝色荧光**（`-webkit-text-stroke` 描边 + 多层 `drop-shadow` 发光），进入页面时逐字"霓虹灯通电"闪烁。
- 标题字体用 Krona One。它是静态字体，没有重叠轮廓，描边后不会露出内部线条（可变字体 Unbounded 会出现这个问题，测试后已替换）。
- 正文 Sora，数据标签 IBM Plex Mono。

### 4. 配乐（Web Audio 实时生成，无音频文件）

- 慢速失谐和弦铺底（三套和声：浅海 D 多利亚 → 暮光层 D 小调 #11 → 午夜层 D 弗里几亚）
- 次低音呼吸 drone、海流低频噪声、长混响 + 延迟
- 玻璃质感钟声、远处鲸歌、声呐脉冲、气泡；电鳗页有电流噼啪声
- 每页切换一个"场景"：水下低通滤波随深度逐渐闭合（越深越闷），各声部出现频率随生物变化
- 浏览器要求用户先交互才能出声：点"Dive in with sound"、右上角声音按钮，或在页面任意位置第一次点击都会开启

### 5. 配色说明

- 生物粒子按需求使用高饱和荧光色：水母以蓝色荧光为主，魔鬼鱼以粉红荧光为主，其余各自配色。
- 界面元素（导航、标签、分隔线、正文文字、霓虹字外圈光晕）使用 Loyel 渐变蓝色板（#E8EEF6 / #CCDBEB / #9FBDDA / #6C9AC4 / #376392 / #263B54）。

---

## Files

```
src/
  main.js          scroll, layout, render loop, pointer + sound wiring
  particles.js     particle field + all creature animation shaders
  shapes/*.js      procedural point-cloud models, one file per creature
  ambient.js       water-column backdrop and marine snow
  post.js          bloom + final tone/vignette/grain pass
  audio.js         generative score (Web Audio)
  content.js       page copy and facts
  ui.js            builds panels, rail and scroll track
  styles.css       hollow neon type, layout, phone layout
  body.html        static page chrome
scripts/build.mjs  bundles everything into dist/index.html
dist/index.html    the built, self-contained page
```

## Develop

```bash
npm install
npm run build      # writes dist/index.html
npm run dev        # rebuilds on change, serves dist/ at http://localhost:8000
```

## Publish (GitHub Pages)

`docs/index.html` is the page GitHub Pages serves: the claude.ai artifact export of this site, which loads three.js from jsDelivr. It is not rewritten by `npm run build`; copy a new export (or `dist/index.html`, which has three.js inlined) over it to update the live site. In the repository: Settings → Pages → Build and deployment → Source "Deploy from a branch", pick the branch and the `/docs` folder.

URL options: `?n=30000` sets the particle count.

## Notes on accuracy

- **Electric eels** live in South American fresh water and do not bioluminesce. The glow on that page stands in for their electric discharge, and the page says so.
- **Lanternfish** here means the family Myctophidae (灯笼鱼科). The deep-sea anglerfish, which people also sometimes call a "lantern fish" because of its glowing lure, has its own page.
- Facts are sourced from: Gruber & Sparks 2015 (hawksbill fluorescence); the pink reef manta "Inspector Clouseau" at Lady Elliot Island; de Santana et al. 2019 (*Electrophorus voltai*, 860 V); Martini & Haddock 2017, *Scientific Reports* (76% of observed animals bioluminescent).
