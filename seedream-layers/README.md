# Seedream 图层光具座

复现小红书视频里的交互网页「One flat image in, a stack of editable layers out」：一个解释 Seedream 5.0 Pro 图层分离功能的单文件 HTML。

**直接打开 `seedream-layers.html` 即可**（单文件，无外部依赖，可离线运行）。

## 怎么做出来的

用 [Anatomy](https://github.com/wheresryan22/anatomy) skill（MIT），输入原作者的两句提示词：

```
/anatomy Explain how Seedream 5.0 splits an image into layers, and what cool things you can make with it. Do it in a single HTML file.
Change the camera/zoom for scenes 1 to 5 so it explains more clearly.
```

Anatomy 的思路是「用一台真实的机器来解释概念」。这里的机器是一台光具座：

| 概念 | 机器上的对应物 |
|---|---|
| 底图 + 5 个透明图层 | 6 片玻璃，每片装一层，没有内容的地方是透明的 |
| 图层按 z 顺序从前到后排好 | 剪叉伸缩架（lazy tongs）把玻璃按 z 顺序等距推开 |
| 合成回原图 | 玻璃合拢；前端相机屏幕显示正对着看的合成画面 |
| 视差（2.5D） | 相机在横滑台上平移，近的层移动得多，倍数等于到镜头的距离比 |

## 五个场景（按键 1–5）

每个场景都有自己的镜头和缩放，这是原作者第二句提示词要求的：

1. **拆分**：全景。手轮转动丝杠，玻璃先合拢再展开。
2. **视差**：推近到相机。屏幕上每层的位移 = 增益 × 相机位移 ÷ 该层到镜头的距离，读数里的倍数由同一个模型实时算出。
3. **换主体**：推近到 z3。鹦鹉以像素块溶解的方式换成巨嘴鸟，其他层不动；读数里的边界框（0–1000 网格）是页面加载时从画出来的图形实测的。
4. **换配色**：推近到底图和灯箱。只有底图的 8 个颜色从日落插值到月夜。
5. **移标题**：推近到 z4 和相机屏幕。标题层移到下方，会被 z5 的前景叶挡住，可以看出层的前后顺序。

拖动插图可以手动展开或合拢，左右方向键也行；页面右上角的按钮切换深浅色，第一次打开时跟随系统设置。

## 文件

- `art.mjs`：海报的 6 个图层（300 × 400 的 SVG）和两套底图配色
- `build.mjs`：光具座的几何、上色和交互逻辑；运行后生成 HTML
- `seedream-layers.html`：生成的成品页面

重新生成（需要 Node 20+，以及已安装的 Anatomy skill）：

```sh
node build.mjs                 # 跟随系统深浅色
node build.mjs --light         # 固定浅色，验证用
node build.mjs --dark          # 固定深色，验证用
ANATOMY=/path/to/anatomy node build.mjs   # skill 不在 ~/.claude/skills/anatomy 时
```

## 验证

- `scripts/lines.mjs`（线条端点检查）：浅色、深色、展开三种状态都是 `line ends: 0`
- `scripts/capture.mjs` / `drive.mjs`：桌面 1440、手机 390 都已截图检查，控制台无报错，没有横向滚动
- 没有接入 `kit/audit.mjs` 的几何审计（这张图没有管线和线缆，前后遮挡顺序是按结构手工排的）

## 说明

- 配色用 Loyel 渐变蓝，取代 Anatomy 默认的灰阶；海报本身保留自然色，因为「换配色」演示要靠颜色。
- 海报和六个图层是为了说明而手工画的，不是 Seedream 的真实输出。
- Seedream 5.0 Pro 于 2026 年 7 月 8 日发布；「最多 16 层」来自 Atlas Cloud 的 API 页，各平台给的上限不完全一致。
