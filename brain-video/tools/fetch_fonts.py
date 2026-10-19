#!/usr/bin/env python3
"""Download subset web fonts for exactly the characters the video uses.

Google Fonts' css2 API accepts a `text=` parameter and returns a font
file that contains only those glyphs, which keeps the CJK font tiny
(tens of KB instead of ~10 MB). All four families are under the SIL Open
Font License 1.1 (see fonts/OFL.txt).

Run again whenever timeline.json gains new characters.
"""
import json
import pathlib
import re
import string
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONTS = ROOT / "fonts"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

# Characters drawn by the renderer itself (HUD labels, chapter cards ...).
UI_TEXT = (
    "第一二章脑区前额叶皮层亚区侧视图内侧视图正中矢状面参考文献谢谢观看大脑地图"
    "比喻证据经典研究争议提示延迟反应记忆槽规则停止信号主目标子任务书签返回信心"
    "探索利用价值逆转选项眼眶铁棍躯体信号错误相关负波冲突侧翼任务疼痛"
    "运动前区初级运动皮层前额叶注意情绪目标网络协同杏仁核海马丘脑下丘脑垂体"
    "视觉听觉触觉味觉嗅觉中继绕过心跳呼吸觉醒腹侧背侧是什么在哪里通路"
    "脑重神经元病例克公斤亿能量消耗体重约占年手术切除双侧无法形成新"
    "视听触味嗅工作台刹车估价师顾问纠错雷达多线程卡点画面字幕"
    "胼胝体扣带回中央沟外侧裂顶枕沟距状沟小脑脑干中脑脑桥延髓脊髓"
    "额叶顶叶颞叶枕叶上中下回布罗德曼区布洛卡韦尼克嗅味"
    "０１２３４５６７８９"
)


def collect_text():
    tl = json.loads((ROOT / "timeline.json").read_text(encoding="utf-8"))
    chunks = [UI_TEXT]

    def walk(v):
        if isinstance(v, str):
            chunks.append(v)
        elif isinstance(v, dict):
            for x in v.values():
                walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)

    walk(tl)
    # labels hard-coded in the renderer
    for js in sorted((ROOT / "render").glob("*.js")):
        chunks.append(js.read_text(encoding="utf-8"))
    return "".join(chunks)


def cjk_chars(text):
    return sorted({c for c in text if ord(c) > 127})


def latin_chars(text):
    extra = {c for c in text if 127 < ord(c) < 0x3000}
    return string.printable.strip() + " " + "".join(sorted(extra)) + "·–—…’‘“”×≈→←↓↑⇄✓◆%°"


def fetch(family, weight, chars, out_name):
    q = urllib.parse.urlencode({"family": f"{family}:wght@{weight}", "text": chars, "display": "block"})
    css_url = "https://fonts.googleapis.com/css2?" + q
    req = urllib.request.Request(css_url, headers={"User-Agent": UA})
    css = urllib.request.urlopen(req, timeout=60).read().decode("utf-8")
    m = re.search(r"url\((https://[^)]+)\)", css)
    if not m:
        raise RuntimeError(f"no font url for {family} {weight}:\n{css[:400]}")
    data = urllib.request.urlopen(urllib.request.Request(m.group(1), headers={"User-Agent": UA}), timeout=60).read()
    (FONTS / out_name).write_bytes(data)
    print(f"{out_name:<32} {len(data) / 1024:7.1f} KB")


def main():
    FONTS.mkdir(exist_ok=True)
    text = collect_text()
    cjk = "".join(cjk_chars(text))
    latin = latin_chars(text)
    # The CJK font also needs Latin digits/punctuation used inside Chinese lines.
    cjk_all = cjk + string.digits + string.ascii_letters + " .,:;!?%/()-~+·“”‘’…—←→⇄✓◆"
    for w in (500, 700, 900):
        fetch("Noto Sans SC", w, cjk_all, f"NotoSansSC-{w}.woff2")
    for w in (600, 800):
        fetch("Barlow Condensed", w, latin, f"BarlowCondensed-{w}.woff2")
    for w in (400, 600):
        fetch("Inter", w, latin, f"Inter-{w}.woff2")
    fetch("JetBrains Mono", 500, latin, "JetBrainsMono-500.woff2")
    print(f"{len(cjk)} CJK characters")


if __name__ == "__main__":
    main()
