# 人类大脑 · 前额叶皮层 —— 蓝色荧光粒子影片

A 3:16 film, 1920×1080 at 30 fps. It tours 13 major brain regions, then zooms into 7 subregions of the prefrontal cortex. Every element is drawn in blue fluorescent particles. Subtitles are bilingual (Chinese and English). There is no narration. The soundtrack is a 140 BPM epic electronic piece, and every visual hit lands on its beat grid.

- 成片：`output/brain_journey.mp4`（字幕已烧录）
- 软字幕：`output/brain_journey.srt`（中英双语，可在播放器里单独开关）

## 分镜与时间轴

| 时间 | 段落 | 内容 | 音乐 |
|---|---|---|---|
| 0:00 | 序章 | 神经元"星系"旋臂汇聚成大脑；"人 类 大 脑"四个字分别落在第 4 小节的四拍上 | 心跳 → 滤波琶音 → 军鼓滚奏 + 上升音效 → 1 拍静默 |
| 0:13.7 | PART I 全脑地图 | 13 个脑区，每个 4 小节：额叶 · 顶叶 · 颞叶 · 枕叶 · 岛叶 · 胼胝体 · 丘脑 · 下丘脑 · 基底神经节 · 海马 · 杏仁核 · 小脑 · 脑干 | Drop：四拍底鼓 + 滚动贝斯 + Supersaw，Dm–B♭–F–C |
| 1:42.9 | 过渡 | 其余脑区粒子散去，镜头推向额叶，"前额叶皮层"五个字按八分音符逐字砸出 | 心跳回归 + 钟琴旋律 → 上升音效 → 1.5 拍静默 |
| 1:56.6 | PART II 聚焦前额叶 | PFC 总览，7 个标签随军鼓逐个弹出；随后依次讲 DLPFC · VLPFC · OFC · VMPFC · ACC · DMPFC · FPC | 主 Drop：Braam + 冲击 + 英雄主旋律，Dm–B♭–Gm–A |
| 2:51.4 | 终章 协同网络 | 粒子流连接前额叶与全脑：额顶控制、突显、情绪调节、奖赏、默认模式、语言网络 | 2:58 升调到 E 小调，镜头高速环绕 |
| 3:05.1 | 尾声 | 大脑爆散成星尘，片尾卡与数据来源 | 最终冲击 + 长和弦余响 |

### 音画卡点是怎么对齐的

140 BPM 时每拍正好 18,900 个采样点（44.1 kHz）。`timeline.py` 定义了唯一的节拍网格，`music.py` 合成音乐时把每个底鼓、军鼓、镲片、冲击、上升音效和静默段的精确时间写进 `events.json`，`render.py` 再读取这些时间驱动画面：

| 音频事件 | 画面反应 |
|---|---|
| 底鼓（每拍） | 粒子亮度和尺度脉动，定位圈跳动 |
| 军鼓（2、4 拍） | 当前脑区迸发"神经冲动"火花 |
| 段落强拍 + 镲片 | 切换脑区：镜头甩动、标题砸入并带故障效果、冲击波光环 |
| 冲击音（Drop） | 闪白、粒子径向爆开再回收、镜头震动、推镜 |
| 上升音效 | 粒子高频抖动，标题微震 |
| 静默拍（Drop 前） | 全黑，只剩一道逐渐拉长的镜头光条 |
| 心跳（序章 / 过渡） | 粒子云随"咚-咚"呼吸 |

## 视觉

- **粒子模型（261,800 个点）**
  - 皮层取自 fsaverage5 软脑膜表面，按面积均匀采样，再用 Desikan–Killiany 图谱给每个点标注脑区。
  - 深部核团和脑干取自 DK 体积图谱（MNI152）。
  - 小脑和胼胝体由 MNI ICBM152 2009a 的灰质/白质概率图分割得到，小脑白质（"生命之树"）单独采样。
  - 下丘脑不在 DK 图谱中，按文献中的 MNI 坐标放置了一对小椭球。
- **前额叶亚区划分**（在 DK 标签上加坐标约束，属于近似划分）
  - DLPFC：额中回，加上额上回外侧部（y > 8）
  - VLPFC：岛盖部 + 三角部 + 眶部
  - OFC：外侧眶额
  - VMPFC：内侧眶额，加上 z < 2 的前扣带喙部
  - ACC：前扣带尾部，加上 z ≥ 2 的前扣带喙部
  - DMPFC：额上回内侧面（|x| < 14，y > 18）
  - FPC：y > 52 的前额叶
- **荧光效果**：粒子以加法混合累积，再叠加三级金字塔泛光。色调映射保持色相，所以高亮区仍是蓝色荧光，不会退化成灰白。正面朝向和景深会调节亮度，让大脑有体积感。
- **配色**：全部取自 Loyel 渐变蓝色板（#263B54 → #F4F7FB），没有使用其他蓝色。
- **字体**：Noto Sans SC（中文）、Orbitron（标题 / HUD）、Exo 2（英文字幕）。三者均为 OFL 授权。

## 科学性说明

- 屏幕上的 MNI 坐标是该脑区粒子的质心，由模型实际计算得到。
- 片尾注明"示意性可视化，脑区边界为近似划分"。图谱分区不等同于功能分区，前额叶亚区的边界在文献中本就有争议。
- 关键数字的来源：
  - 约 860 亿神经元、小脑约占 80%：Azevedo et al., 2009, *J Comp Neurol*
  - 胼胝体约 2 亿根纤维：Aboitiz et al., 1992, *Brain Res*
  - 右侧 IFG 与反应抑制：Aron et al., 2004/2014, *TICS*
  - Phineas Gage：Damasio et al., 1994, *Science*
  - 额极与分支 / 多任务：Koechlin et al., 1999, *Nature*
  - 额极与元认知：Fleming et al., 2010, *Science*
  - 前额叶成熟最晚：Gogtay et al., 2004, *PNAS*

## 复现

```bash
pip install numpy scipy opencv-python-headless nibabel pillow
./fetch_fonts.sh            # 下载字体（约 42 MB，不进 git）
python3 build_model.py      # -> model.npz（粒子模型）
python3 music.py            # -> bgm.wav + events.json（配乐与节拍事件）
python3 render.py --test 16,120     # 先看几帧 -> output/test_*.png
python3 render.py --workers 4       # 全片 -> output/brain_journey.mp4 + .srt
```

在 4 核机器上单帧约 0.35 s，整片大约需要 10–15 分钟。

## 文件

```
timeline.py     节拍网格、段落、和弦、全部文案与镜头机位（改文案或节奏只需改这里）
build_model.py  由图谱生成粒子模型
music.py        程序化合成 BGM，并导出节拍事件
render.py       粒子渲染、文字 / HUD、音画同步、并行编码与混流
data/           fsaverage5 表面、DK 图谱（来自 abagen）、MNI 灰质/白质模板（来自 nilearn）
output/         成片与字幕
```
