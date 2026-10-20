# 大脑全景 · 前额叶亚区 —— 双语科普短片（无旁白，热血卡点配乐）

**成片：** `out/brain_pfc_bilingual.mp4`（1920×1080，30 fps，4 分 17 秒，H.264 + AAC）
**字幕文件：** `out/brain_pfc_bilingual.srt`（中英双语，与画面内烧录字幕同一份文案）

画面、字幕和配乐全部由本目录的 Python 代码生成，没有使用任何素材库、图片或音频文件。配色只用 Loyel 渐变蓝十档色值（见 `src/palette.py`）。

---

## 结构与时间轴

配乐速度 128.57 BPM，正好每拍 14 帧，所以每一个鼓点都落在整数帧上。一小节 = 1.867 秒。

| 时间 | 小节 | 段落 | 画面 | 音乐 |
|------|------|------|------|------|
| 0:00 | 1–4 | 序章 | 860 亿神经元计数、2% 体重 / 20% 能耗 | D 小调长音、心跳低鼓、闪烁铃音 |
| 0:07.5 | 5–6 | 标题 | **人类大脑 THE HUMAN BRAIN** | Braam 铜管冲击 + 太鼓 |
| 0:11.2 | 7–8 | 蓄力 | 军鼓滚奏每击一次，换一个脑叶高亮 | 军鼓滚奏 + 上升音效，最后一拍静音 |
| 0:14.9 | 9–56 | **第一部分 · 脑区巡礼** | 12 个脑区，每个 4 小节 | Drop A（四拍底鼓、滚动贝斯、超锯齿和弦、琶音） |
| 1:44.5 | 57–60 | 聚焦 | 镜头推进到前额叶，标出运动区（非前额叶） | 抒情段：钢琴预告主旋律 |
| 1:52.0 | 61–64 | 蓄力 | 7 个亚区缩写逐拍弹出 | 4 小节滚奏 + 滤波扫频，最后一拍静音 |
| 1:59.5 | 65–120 | **第二部分 · 前额叶七大亚区** | 7 个亚区，每个 8 小节（前 4 小节功能，后 4 小节证据） | Drop B 主旋律；2:44–3:14 切半速太鼓段 |
| 3:44.0 | 121–128 | 三网络模型 | CEN / DMN / SN 依次点亮 | 升调到 E 小调的高潮段 |
| 3:58.9 | 129–136 | 尾声 | 思考 · 抑制 · 选择 · 共情，逐词砸在重拍上 → 结语 → 参考文献 | 和弦重击 → E 大调收尾 |

第一部分 12 个脑区：额叶、顶叶、颞叶、枕叶｜岛叶、海马、杏仁核、基底神经节｜丘脑、下丘脑、小脑、脑干。

第二部分 7 个前额叶亚区：DLPFC、VLPFC、额极 FPC、OFC、vmPFC、ACC、dmPFC。每个亚区给出 Brodmann 分区、三条功能、一条关键实验证据和一条损伤表现或延伸发现，附作者、年份和期刊。

## 卡点是怎么对上的

- `src/timeline.py` 定义唯一的节拍网格；`src/cues.py` 定义每张卡片、每行文字出现的小节和拍。
- `src/music.py` 按这份网格编曲，同时把每个底鼓、拍手、军鼓、冲击音的精确时间写进 `build/events.json`。
- `src/render.py` 读同一份网格和事件表来驱动画面：
  - 底鼓：脑图轻微放大、高亮脉冲、粒子网络闪亮、右上角拍点指示；
  - 拍手（2、4 拍）：标题出现一帧残影；
  - 换卡的重拍：白闪 + 震屏 + 标题砸入；每条要点在第 2、3、4 拍各弹出一条，配一个"嗒"声；
  - 军鼓滚奏：每一击切换一个高亮脑区，越滚越快；
  - Drop 前的静音拍：画面压暗，只剩一条向两侧展开的光线，下一帧白闪进入 Drop。

## 重新生成

需要 Python 3、ffmpeg、npm（只用来下载字体）。

```bash
cd brain-video
./fetch_fonts.sh                  # Noto Sans SC / Oswald / Rajdhani / Orbitron（OFL 授权）
pip install -r requirements.txt   # numpy scipy pillow pycairo
cd src
python brain_art.py               # 约 2.5 分钟，生成 build/layers/*.png
python music.py                   # 约 40 秒，生成 build/bgm.wav 和 build/events.json
python make_video.py --jobs 4     # 4 核约 7 分钟，生成 out/ 下的 mp4 和 srt
```

检查单帧：`python render.py --still 531 --png frame.png`（帧号 = 秒 × 30）。

## 文件

```
src/
  timeline.py    节拍网格、段落、Drop 位置
  cues.py        每张卡片 / 每行文字的出现时刻
  content.py     全部中英双语文案与文献
  palette.py     Loyel 渐变蓝十档色值
  brain_art.py   外侧面、透视、岛叶开窗、正中矢状面四种脑图与 25 个区域高亮层
  music.py       配乐合成（鼓组、贝斯、超锯齿、主旋律、Braam、混响、侧链、限幅）
  render.py      逐帧渲染
  make_video.py  多进程渲染、拼接、混入配乐、导出字幕
```

## 科学准确性说明

- 脑图是示意图：脑区边界按主要沟回近似划分，深部结构为外侧投影位置，不等同于图谱级解剖精度。
- 各脑区功能是简化描述，真实认知依赖分布式网络协同，片尾也有这句声明。
- ACC 在不同文献中归入扣带 / 边缘系统或内侧前额叶，片中注明"常与内侧前额叶合并讨论"。vmPFC 与内侧 OFC 存在重叠。
- 主要文献：Azevedo 2009；Raichle & Gusnard 2002；Gogtay 2004；Scoville & Milner 1957；Hubel & Wiesel 1959；Funahashi, Bruce & Goldman-Rakic 1989；Milner 1963；Aron 2003；Koechlin 1999；Fleming 2010；Padoa-Schioppa & Assad 2006；Rolls 1994；Damasio 1994；Bechara 1994；Botvinick 2001；Rainville 1997；Amodio & Frith 2006；Frith & Frith 2006；Menon 2011。
