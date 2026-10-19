# 大脑地图 · Brain Atlas

一支 3 分 37 秒的卡点科普视频：先依次介绍人类大脑的 10 个重要脑区，再聚焦前额叶皮层的 6 个亚区（DLPFC、VLPFC、额极、OFC、VMPFC、ACC）。无旁白，中英双语字幕，热血电子 BGM，150 BPM，所有切镜落在小节强拍上。画面只用 Loyel 渐变蓝色板。

| 文件 | 内容 |
|---|---|
| [`out/brain-atlas.mp4`](out/brain-atlas.mp4) | 成片：1920×1080，30 fps，H.264 + AAC，字幕已烧录在画面里 |
| [`out/poster.png`](out/poster.png) | 封面帧 |
| [`out/contact-sheet.jpg`](out/contact-sheet.jpg) | 每个场景一帧的总览图 |
| [`storyboard.md`](storyboard.md) | 分镜脚本：音乐结构、逐场景画面与字幕、卡点规则、科学准确性说明、参考文献 |
| [`subtitles/`](subtitles/) | 字幕稿：`zh-en.srt`（双语）、`zh.srt`、`en.srt`、`zh-en.ass`（带样式） |

画面、配乐、分镜和字幕全部由本目录的代码生成，没有外部素材；字体是 SIL OFL 授权的开源字体（见 [`fonts/README.md`](fonts/README.md)）。

## 如何复现

需要 Python 3.10+、Node 18+、ffmpeg（带 libx264），以及一个 Chromium。

```bash
cd brain-video

# 1. 依赖
python3 -m pip install numpy scipy
npm install                       # 只装 playwright 1.56.1
npx playwright install chromium   # 机器上已有 Playwright 的 Chromium 时可跳过

# 2. 分镜脚本 + 字幕稿（读 timeline.json，写 storyboard.md 与 subtitles/）
python3 tools/make_docs.py

# 3. 配乐（写 build/bgm.wav 与 build/beatmap.json，约 1.5 分钟）
python3 music/synth.py

# 4. 渲染成片（写 out/brain-atlas.mp4；4 核机器约 15 分钟）
node render/render.mjs
```

三步都是确定性的：随机数有固定种子，每一帧只取决于它的时间，所以重跑得到同样的画面和音频。

常用选项：

```bash
node render/render.mjs --workers 2 --crf 18          # 并行浏览器数量、画质（CRF 越小越清晰，文件越大）
node render/render.mjs --from bar:76 --to bar:84 --out out/dlpfc.mp4   # 只渲染一段（秒、m:ss 或 bar:小节）
node render/still.mjs build/stills 0:20 bar:76.5     # 导出单帧 PNG，用来检查画面
node render/preview.mjs                              # 打开打印出的地址并点击页面：带音乐实时预览
python3 tools/fetch_fonts.py                         # 字幕里出现新汉字时，重新下载字体子集
```

## 工作原理

```
timeline.json ──┬─> tools/make_docs.py ──> storyboard.md, subtitles/*.srt|ass
                ├─> music/synth.py ──────> build/bgm.wav + build/beatmap.json
                └─> render/*.js ─────────> 每一帧（Canvas 2D）──> render.mjs ──> out/brain-atlas.mp4
```

- **唯一的时间来源是 `timeline.json`**：速度、段落、34 个场景（起始小节、长度、标题、字幕、要点）和参考文献都写在这里。分镜、配乐、画面三者读同一份数据，所以改一个场景的长度，三者会一起变。
- **卡点**：`music/synth.py` 按段落排出鼓组、合成器与冲击音，同时把每一次底鼓、军鼓、镲片、冲击和“空拍”的精确时间写进 `build/beatmap.json`。渲染器用这些时间驱动闪白、震屏、冲击波和切镜故障效果，所以画面跟的是实际听到的声音，而不只是理论拍点。
- **渲染**：`render/index.html` 在无头 Chromium 里把第 *i* 帧画到 1920×1080 画布上。`render.mjs` 开多个浏览器并行渲染不同的帧段，每段直接用管道送进 ffmpeg 编码，最后无损拼接并混入配乐。
- **字幕**：成片里的字幕由渲染器直接画在画面上（中文 Noto Sans SC，英文 Inter）。`subtitles/` 里的同一份字幕可以单独用于剪辑软件或平台的外挂字幕。

## 修改内容

| 想改什么 | 改哪里 | 之后重跑 |
|---|---|---|
| 字幕文字、场景标题、要点、参考文献 | `timeline.json` | 第 2、4 步（出现新汉字时先跑 `tools/fetch_fonts.py`） |
| 场景长度或顺序 | `timeline.json` 的 `scenes` 与 `music.sections` | 第 2、3、4 步 |
| 编曲、音色、响度 | `music/synth.py` | 第 3、4 步 |
| 脑区轮廓与亚区形状 | `render/geometry.js`（侧视图 `LATERAL`、内侧视图 `MEDIAL`） | 第 4 步 |
| 版式、动画、小部件 | `render/scenes.js`、`render/widgets.js`、`render/ui.js` | 第 4 步 |
| 配色 | `render/palette.js`（只含 Loyel 渐变蓝 10 档与白色） | 第 4 步 |

## 目录

```
brain-video/
├── timeline.json        时间线：节拍、段落、场景、字幕、参考文献
├── storyboard.md        分镜脚本（生成）
├── subtitles/           字幕稿（生成）
├── tools/               make_docs.py（分镜与字幕）、fetch_fonts.py（字体子集）
├── music/synth.py       配乐合成
├── render/              画面：main.js 帧入口，scenes.js 场景，widgets.js 实验小图，
│                        brain.js + geometry.js 大脑绘制，render.mjs 成片，still.mjs 单帧
├── fonts/               字体子集 + OFL 许可
├── out/                 成片、封面、总览图
└── build/               中间产物（配乐、节拍表、视频分段），不入库
```

## 说明

- 脑图是示意图，比例和边界做了简化；亚区边界在文献中本身存在差异。具体的【争议】点（例如 ACC 是否算前额叶、盖奇的损伤是单侧还是双侧、海马与杏仁核为何以投影方式画在内侧视图里）写在 [`storyboard.md`](storyboard.md) 的“科学准确性说明”一节。
- 引用的研究都列在片尾和分镜脚本末尾，便于核对。
