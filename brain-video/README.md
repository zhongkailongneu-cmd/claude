# 人类大脑 · 由内而外的脑区之旅 / The Human Brain — an inside-out tour

无旁白、中英双语字幕、150 BPM 热血 BGM 的 3D 脑区科普短片（约 2 分 18 秒，1920×1080 @ 30 fps）。
A narration-free, bilingual (中文 / English) 3D tour of the brain's regions that ends on the sub-regions of the
prefrontal cortex, cut to an original 150 BPM "hot-blooded" soundtrack. Every cut, caption and hit lands on the beat grid.

交付物 / Deliverables (`out/`)

| 文件 | 说明 |
|---|---|
| `brain_tour.mp4` | 成片（H.264 + AAC，字幕已烧录） |
| `brain_tour.zh-en.srt` / `.zh.srt` / `.en.srt` | 与画面同源的字幕（双语 / 仅中文 / 仅英文） |

## 叙事逻辑 / Order of the tour

**由内而外、由低到高（inside-out, low → high）**——越往上，功能越抽象、越灵活，最后落到前额叶。

| 章节 | 脑区 |
|---|---|
| ① 生命基石 Life support | 脑干 → 小脑 |
| ② 中继与调控 Relay & regulate | 丘脑 → 下丘脑 → 基底节 |
| ③ 情绪与记忆 Emotion & memory | 杏仁核 → 海马 → 扣带回 → 岛叶 |
| ④ 大脑皮层 Cerebral cortex | 枕叶 → 顶叶 → 颞叶 → 额叶（感知 → 整合 → 执行） |
| 前额叶皮层 Prefrontal cortex | 外侧：DLPFC → VLPFC；前端：额极；腹侧：眶额；内侧：vmPFC → dmPFC → ACC；再到控制环路与执行功能 |

镜头也遵循这条线：先把皮层变成全息透明，由深到浅逐个点亮，再让皮层“重建”，最后推进到额叶前端。

## 音乐与卡点 / Music and sync

* 150 BPM → 每拍 12 帧、每小节 48 帧，镜头切换、字幕、关键词芯片、计数器都落在小节/拍点上。
* 86 小节结构：片头(1–4) → 高潮一(5–36，A 小调) → 过渡(37–40) → 搭建(41–44，第 44 小节第 4 拍为一拍绝对静音) → 高潮二(45–76，第 61 小节升调至 B 小调) → 控制环路(77–80，半速) → 终章(81–84，8 个执行功能词各占一拍) → 片尾(85–86)。
* 音乐用 numpy 纯合成（鼓组、侧链、八分低音、拨弦琶音、超级锯齿主奏、太鼓、铜管、合唱铺底、上升音/冲击声）。
* 画面的脉冲与底部频谱条读取的是由成品音频分析出的 `assets/timeline.json`（每帧的底鼓/军鼓包络与 48 段频谱），因此与声音逐帧对齐。

## 数据与致谢 / Data and credits

* 皮层：HCP S1200 fsLR-32k 平均软脑膜表面（经 `hcp_utils`，MIT）与 Glasser 等 (2016) *Nature* HCP-MMP1.0 脑区图谱（180 个分区/半球）。
* 皮层下：Desikan–Killiany / aseg 1 mm MNI 体素图谱（经 `abagen`，Apache-2.0）：丘脑、尾状核、壳核、苍白球、伏隔核、海马、杏仁核、脑干。
* 小脑、下丘脑、胼胝体为**示意性**程序化模型。脑区边界为示意，亚区划分取自 Glasser 分区的常见归并，不同定义下会有差异。
* 科普内容，不构成医疗建议 / For education only, not medical advice.
* 配色全部取自 Loyel 渐变蓝十档色板（`#F4F7FB` … `#263B54`），光照为白光。

## 复现 / Reproduce

```bash
cd brain-video
npm install                                   # three, playwright-core, fonts
python -m venv .venv && . .venv/bin/activate
pip install -r tools/requirements.txt
pip download abagen --no-deps -d /tmp/abagen && unzip -j /tmp/abagen/abagen-*.whl 'abagen/data/atlas-desikankilliany.nii.gz' -d /tmp/abagen/data

# 1) 网格与图谱 -> assets/brain.bin
python -I tools/prep_data.py --hcp "$(python -c 'import hcp_utils,os;print(os.path.dirname(hcp_utils.__file__)+"/data")' 2>/dev/null)" \
       --dk /tmp/abagen/data/atlas-desikankilliany.nii.gz --regions src/regions.json --out assets
# 2) 音乐 + 节拍时间线 -> bgm.wav, assets/timeline.json
python -I tools/music.py /tmp/bgm assets
# 3) 逐帧渲染（Chromium + SwiftShader，无需 GPU）
node tools/render.mjs --out /tmp/frames --workers 2 --rs 0.8
# 4) 字幕与合成
node tools/make_srt.mjs out
ffmpeg -framerate 30 -i /tmp/frames/f%05d.jpg -i /tmp/bgm/bgm.wav \
  -vf "scale=in_color_matrix=bt601:out_color_matrix=bt709:in_range=pc:out_range=tv,format=yuv420p" \
  -c:v libx264 -preset slow -crf 17 -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -c:a aac -b:a 256k -movflags +faststart -shortest out/brain_tour.mp4
```

`tools/preview.mjs` 可按场景名或帧号快速出预览图，`tools/contact.py` 拼接触表，`tools/audio_report.py` 画音频结构图。
