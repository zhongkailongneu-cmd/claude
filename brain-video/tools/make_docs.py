#!/usr/bin/env python3
"""Generate the storyboard and subtitle files from timeline.json.

timeline.json is the single source of truth: the renderer, the music
generator and these documents all read it, so the cut points, the
subtitles and the beat grid can never drift apart.

Outputs
  storyboard.md                          分镜脚本
  subtitles/brain-atlas.zh-en.srt        bilingual (zh line + en line)
  subtitles/brain-atlas.zh.srt / .en.srt single-language tracks
  subtitles/brain-atlas.zh-en.ass        styled soft subtitles (Loyel palette)
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
T = json.loads((ROOT / "timeline.json").read_text(encoding="utf-8"))
META = T["meta"]
BAR = 60.0 / META["bpm"] * META["beatsPerBar"]  # seconds per bar

KIND_ZH = {
    "stat": "开场数据", "build": "蓄力", "title": "标题爆点", "overview": "总览",
    "region": "脑区", "breakdown": "间奏", "pfcbuild": "蓄力", "pfcintro": "前额叶概览",
    "pfcmap": "亚区地图", "subregion": "前额叶亚区", "finaleRapid": "高潮快切",
    "finaleNetwork": "高潮·网络", "finaleDeep": "高潮·深部连接", "finaleSlam": "终极重击",
    "outro": "尾声",
}
VIEW_ZH = {"lateral": "侧视图", "medial": "内侧视图", "dual": "侧+内侧分屏", "none": "—"}


def ts(sec, sep=","):
    ms = int(round(sec * 1000))
    h, ms = divmod(ms, 3600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}{sep}{ms:03d}"


def mmss(sec):
    m, s = divmod(sec, 60)
    return f"{int(m)}:{s:04.1f}"


def ass_time(sec):
    cs = int(round(sec * 100))
    h, cs = divmod(cs, 360000)
    m, cs = divmod(cs, 6000)
    s, cs = divmod(cs, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def all_subs():
    for sc in T["scenes"]:
        for sub in sc.get("subs", []):
            yield sc, sub


def validate():
    problems = []
    expect = 0
    for sc in T["scenes"]:
        if sc["bar"] != expect:
            problems.append(f"{sc['id']} starts at bar {sc['bar']}, expected {expect}")
        expect = sc["bar"] + sc["len"]
        for sub in sc.get("subs", []):
            if not (sc["bar"] <= sub["bar"] and sub["bar"] + sub["len"] <= sc["bar"] + sc["len"]):
                problems.append(f"{sc['id']} subtitle at bar {sub['bar']} leaves its scene")
    if expect != META["totalBars"]:
        problems.append(f"scenes end at bar {expect}, totalBars is {META['totalBars']}")
    m_end = 0
    for m in T["music"]:
        if m["bar"] != m_end:
            problems.append(f"music section {m['section']} starts at {m['bar']}, expected {m_end}")
        m_end = m["bar"] + m["len"]
    if m_end != META["totalBars"]:
        problems.append("music sections do not cover the whole video")
    return problems


def reading_speed():
    rows = []
    for sc, sub in all_subs():
        dur = sub["len"] * BAR
        zh = sum(1 for ch in sub["zh"] if not ch.isspace())
        en = len(sub["en"])
        rows.append((sc["id"], sub["bar"], zh / dur, en / dur))
    return rows


def write_srt():
    out = ROOT / "subtitles"
    out.mkdir(exist_ok=True)
    tracks = {"zh-en": [], "zh": [], "en": []}
    for i, (sc, sub) in enumerate(all_subs(), 1):
        a, b = sub["bar"] * BAR, (sub["bar"] + sub["len"]) * BAR - 0.05
        head = f"{i}\n{ts(a)} --> {ts(b)}\n"
        tracks["zh-en"].append(head + sub["zh"] + "\n" + sub["en"] + "\n")
        tracks["zh"].append(head + sub["zh"] + "\n")
        tracks["en"].append(head + sub["en"] + "\n")
    for name, blocks in tracks.items():
        (out / f"brain-atlas.{name}.srt").write_text("\n".join(blocks), encoding="utf-8")

    # ASS colours are &HAABBGGRR. Loyel: #FFFFFF text, #CCDBEB English, #263B54 outline.
    header = f"""[Script Info]
Title: {META['title_zh']} / {META['title_en']}
ScriptType: v4.00+
PlayResX: {META['width']}
PlayResY: {META['height']}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ZH,Noto Sans SC,46,&H00FFFFFF,&H00FFFFFF,&H00543B26,&H80543B26,1,0,0,0,100,100,1,0,1,3,0,2,80,80,78,1
Style: EN,Inter,30,&H00EBDBCC,&H00EBDBCC,&H00543B26,&H80543B26,0,0,0,0,100,100,0,0,1,2,0,2,80,80,36,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = []
    for sc, sub in all_subs():
        a, b = ass_time(sub["bar"] * BAR), ass_time((sub["bar"] + sub["len"]) * BAR - 0.05)
        lines.append(f"Dialogue: 0,{a},{b},ZH,,0,0,0,,{sub['zh']}")
        lines.append(f"Dialogue: 0,{a},{b},EN,,0,0,0,,{sub['en']}")
    (out / "brain-atlas.zh-en.ass").write_text(header + "\n".join(lines) + "\n", encoding="utf-8")


def md_escape(s):
    return s.replace("|", "\\|")


def write_storyboard():
    L = []
    total = META["totalBars"] * BAR
    L.append(f"# 分镜脚本 · {META['title_zh']}")
    L.append("")
    L.append(f"> {META['title_en']}")
    L.append("")
    L.append("本文件由 `tools/make_docs.py` 从 `timeline.json` 自动生成；渲染器与配乐生成器读取同一份时间线，"
             "因此这里写的每个切点都与成片和 BGM 的节拍一一对应。")
    L.append("")
    L.append("## 基本参数")
    L.append("")
    L.append("| 项目 | 设定 |")
    L.append("|---|---|")
    L.append(f"| 时长 | {mmss(total)}（{META['totalBars']} 小节） |")
    L.append(f"| 速度 | {META['bpm']} BPM，4/4 拍；1 小节 = {BAR:.1f} s = {int(BAR*META['fps'])} 帧，1 拍 = {BAR/4:.1f} s = {int(BAR*META['fps']/4)} 帧 |")
    L.append(f"| 画面 | {META['width']}×{META['height']}，{META['fps']} fps |")
    L.append("| 旁白 | 无；信息全部由画面文字与中英双语字幕承载 |")
    L.append("| 字幕 | 底部双语：中文在上（Noto Sans SC），英文在下（Inter）；每条 2 小节（3.2 s） |")
    L.append("| 配色 | Loyel 渐变蓝：#F4F7FB · #E8EEF6 · #CCDBEB · #9FBDDA · #6C9AC4 · #497DAE · #376392 · #2E5076 · #2B4868 · #263B54；深色底上的文字用 #FFFFFF |")
    L.append("| BGM | 代码合成（`music/synth.py`），热血电子 + 预告片式打击乐，D 小调 |")
    L.append("")
    L.append("## 卡点规则")
    L.append("")
    L.append("- **切镜只发生在小节强拍（第 1 拍）**，并伴随白闪、冲击波或横向故障切片；场景长度均为 2/4/8 小节，与音乐乐句对齐。")
    L.append("- **场景内部的动作落在拍点上**：标签、关键词、记忆槽、柱状图等元素每拍弹出一个；军鼓拍有轻微闪光，底鼓拍画面轻微缩放脉动。")
    L.append("- **三次“空拍”**：第 11、67、129 小节最后半拍全部静音、画面骤暗，下一强拍爆点（两个章节标题与结尾标语砸入）。")
    L.append("- 配乐生成器同时导出 `build/beatmap.json`（每个底鼓、军鼓、冲击的精确时间），渲染器据此驱动闪光与震屏，保证声画同步。")
    L.append("")
    L.append("## 音乐结构")
    L.append("")
    L.append("| 段落 | 小节 | 时间 | 内容 |")
    L.append("|---|---|---|---|")
    for m in T["music"]:
        a, b = m["bar"] * BAR, (m["bar"] + m["len"]) * BAR
        L.append(f"| {m['section']} | {m['bar']}–{m['bar']+m['len']-1} | {mmss(a)}–{mmss(b)} | {md_escape(m['desc'])} |")
    L.append("")

    chapters = [
        ("开场", 0, 16), ("第一章 · 主要脑区", 16, 60),
        ("过渡 · 走向前额叶", 60, 76), ("第二章 · 前额叶亚区", 76, 124), ("高潮与尾声", 124, 136),
    ]
    L.append("## 分镜")
    for name, a_bar, b_bar in chapters:
        L.append("")
        L.append(f"### {name}")
        L.append("")
        L.append("| 镜头 | 时间 | 小节 | 类型 / 视图 | 画面与卡点 | 字幕（中 / 英） |")
        L.append("|---|---|---|---|---|---|")
        for sc in T["scenes"]:
            if not (a_bar <= sc["bar"] < b_bar):
                continue
            a, b = sc["bar"] * BAR, (sc["bar"] + sc["len"]) * BAR
            kind = KIND_ZH.get(sc["kind"], sc["kind"])
            view = VIEW_ZH.get(sc.get("view", "none"), "—")
            title = ""
            if "title" in sc:
                t = sc["title"]
                title = f"**{t['zh']} {t['en']}**"
                if t.get("ba"):
                    title += f"（{t['ba']}）"
                if t.get("analogy_zh"):
                    title += f"<br>比喻：{t['analogy_zh']} / {t['analogy_en']}"
                title += "<br>"
            chips = ""
            if sc.get("chips"):
                chips = "<br>标签：" + " · ".join(f"{c['zh']} {c['en']}" for c in sc["chips"])
            note = ""
            if sc.get("note"):
                note = f"<br>【争议】{sc['note']['zh']}"
            subs = "<br>".join(
                f"[{sub['bar']}] {sub['zh']}<br>　 *{sub['en']}*" for sub in sc.get("subs", [])
            )
            visual = f"{title}{sc.get('visual','')}{chips}{note}"
            L.append(
                f"| {sc['id']} | {mmss(a)}–{mmss(b)} | {sc['bar']}–{sc['bar']+sc['len']-1} | {kind} / {view} | "
                f"{md_escape(visual)} | {md_escape(subs)} |"
            )
    L.append("")
    L.append("## 科学准确性说明")
    L.append("")
    L.append("- 【争议】**ACC 的归属**：前扣带皮层严格说属扣带皮层（边缘叶），但在功能研究中常与内侧前额叶一起讨论，片中以小字注明。")
    L.append("- 【争议】**VMPFC 与内侧 OFC 的边界**：两者在文献中定义重叠，片中明确说“部分重叠”。")
    L.append("- 【争议】**右侧额下回与“抑制”**：Aron 等认为 rIFG 专门实现反应抑制；Hampshire & Sharp (2015) 认为它更多反映注意控制。片中采用主流的“叫停冲动”表述。")
    L.append("- 【争议】**盖奇的损伤范围**：Damasio 等 (1994) 重建为双侧 VMPFC 损伤；Ratiu 等 (2004)、Van Horn 等 (2012) 认为主要是左侧。片中只说“铁棍贯穿头颅、性情大变”，不声称双侧。")
    L.append("- 【争议】**躯体标记假说**：爱荷华赌博任务证据有替代解释（Dunn, Dalgleish & Lawrence, 2006），片中称“假说”。")
    L.append("- 【待确认】“20 多岁才成熟”是对纵向 MRI 研究（Gogtay 2004 等）的通俗概括，不同个体与指标差异较大。")
    L.append("- 海马、杏仁核不在正中矢状面上，片中以“投影”方式画在内侧视图里，是教学示意。")
    L.append("")
    L.append("## 参考文献")
    L.append("")
    for r in T["references"]:
        L.append(f"- {r}")
    L.append("")
    L.append("## 字幕阅读速度自检")
    L.append("")
    L.append("| 镜头 | 小节 | 中文 字/秒 | 英文 字符/秒 |")
    L.append("|---|---|---|---|")
    for sid, bar, zh, en in reading_speed():
        flag = " ⚠" if zh > 7.0 or en > 21 else ""
        L.append(f"| {sid} | {bar} | {zh:.1f} | {en:.1f}{flag} |")
    L.append("")
    (ROOT / "storyboard.md").write_text("\n".join(L), encoding="utf-8")


def main():
    problems = validate()
    if problems:
        print("timeline problems:\n  " + "\n  ".join(problems))
        sys.exit(1)
    write_srt()
    write_storyboard()
    fast = [r for r in reading_speed() if r[2] > 7.0 or r[3] > 21]
    print(f"ok: {len(T['scenes'])} scenes, {sum(1 for _ in all_subs())} subtitles, "
          f"{META['totalBars'] * BAR:.1f} s; {len(fast)} subtitles above the reading-speed guide")


if __name__ == "__main__":
    main()
