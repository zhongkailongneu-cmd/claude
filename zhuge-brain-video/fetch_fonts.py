"""Download Noto Serif SC / Noto Sans SC subsets that cover every character used in index.html.

Google Fonts' `text=` parameter returns a font containing only the requested glyphs, so the
fonts stay small. Characters are requested in chunks (URL length limit) and each chunk gets
its own @font-face with a matching unicode-range.
"""
import pathlib
import re
import subprocess
import urllib.parse

HERE = pathlib.Path(__file__).parent
OUT = HERE / "fonts"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
FACES = {"Noto Serif SC": [600, 900], "Noto Sans SC": [400, 500, 700]}
CHUNK = 300


def curl(url: str) -> bytes:
    return subprocess.run(["curl", "-sSf", "--max-time", "60", "-A", UA, url], check=True, capture_output=True).stdout


def main() -> None:
    html = (HERE / "index.html").read_text(encoding="utf-8")
    chars = sorted(set(html) | {chr(c) for c in range(0x20, 0x7F)} | set("—…·①②③④⑤⑥≈≠⇄→×±–「」『』【】（），。：；！？、"))
    chars = [c for c in chars if c.isprintable() and c != "\n"]
    chunks = [chars[i:i + CHUNK] for i in range(0, len(chars), CHUNK)]
    OUT.mkdir(exist_ok=True)
    for f in OUT.glob("*.woff2"):
        f.unlink()
    css = []
    for family, weights in FACES.items():
        slug = family.lower().replace(" ", "-")
        for w in weights:
            for i, chunk in enumerate(chunks):
                text = "".join(chunk)
                url = "https://fonts.googleapis.com/css2?family=" + urllib.parse.quote(family) + f":wght@{w}&text=" + urllib.parse.quote(text)
                face_css = curl(url).decode()
                src = re.search(r"url\((https://[^)]+)\)", face_css).group(1)
                name = f"{slug}-{w}-{i}.woff2"
                (OUT / name).write_bytes(curl(src))
                ranges = ",".join(f"U+{ord(c):04X}" for c in chunk)
                css.append(
                    f"@font-face{{font-family:'{family}';font-weight:{w};font-style:normal;"
                    f"src:url({name}) format('woff2');unicode-range:{ranges};}}"
                )
    (OUT / "fonts.css").write_text("\n".join(css) + "\n", encoding="utf-8")
    total = sum(p.stat().st_size for p in OUT.glob("*.woff2"))
    print(f"{len(chars)} chars, {len(css)} faces, {total / 1024:.0f} KiB")


if __name__ == "__main__":
    main()
