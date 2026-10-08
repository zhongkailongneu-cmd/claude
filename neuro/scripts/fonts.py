"""Prepare the hollow-title fonts.

Hollow neon letters are drawn with -webkit-text-stroke, which strokes every
contour. Variable fonts keep overlapping contours (a bar crossing a stem, a
serif joining a stroke), so a stroked variable font shows lines inside the
letters. This script instantiates each family at fixed weights, merges the
overlaps (skia-pathops), subsets to the Latin characters the titles use and
writes small woff2 files to neuro/fonts/. The build inlines them.

    pip install fonttools skia-pathops brotli
    python3 neuro/scripts/fonts.py

Sources are the @fontsource npm packages (Google Fonts builds, SIL OFL 1.1).
"""

import io
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.ttLib.removeOverlaps import removeOverlaps
from fontTools.varLib import instancer
from fontTools.subset import Options, Subsetter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "fonts"

# (css family, npm package, file in package, weights; None = static font)
FAMILIES = [
    ("Oswald", "@fontsource-variable/oswald", "oswald-latin-wght-normal.woff2", [300, 500, 700]),
    ("Bebas Neue", "@fontsource/bebas-neue", "bebas-neue-latin-400-normal.woff2", None),
    ("Orbitron", "@fontsource-variable/orbitron", "orbitron-latin-wght-normal.woff2", [400, 600, 800]),
    ("Cinzel", "@fontsource-variable/cinzel", "cinzel-latin-wght-normal.woff2", [400, 600, 800]),
    ("Krona One", "@fontsource/krona-one", "krona-one-latin-400-normal.woff2", None),
]

TEXT = "".join(chr(c) for c in range(0x20, 0x7F)) + "–—·’‘“”…×→←↑↓°"


def fetch(pkg, name, tmp):
    tgz = subprocess.run(["npm", "pack", pkg, "--silent"], cwd=tmp, check=True, capture_output=True, text=True).stdout.strip().splitlines()[-1]
    with tarfile.open(Path(tmp) / tgz) as tf:
        return tf.extractfile(f"package/files/{name}").read()


def subset(font):
    opts = Options()
    opts.flavor = "woff2"
    opts.layout_features = ["kern", "liga", "case", "cpsp"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    s = Subsetter(opts)
    s.populate(text=TEXT)
    s.subset(font)
    font.flavor = "woff2"


def main():
    OUT.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for family, pkg, name, weights in FAMILIES:
            data = fetch(pkg, name, tmp)
            for w in weights or [400]:
                font = TTFont(io.BytesIO(data))
                if "fvar" in font:
                    font = instancer.instantiateVariableFont(font, {"wght": w}, overlap=instancer.OverlapMode.REMOVE)
                else:
                    removeOverlaps(font)
                subset(font)
                slug = family.lower().replace(" ", "-")
                dest = OUT / f"{slug}-{w}.woff2"
                font.save(dest)
                print(f"{dest.relative_to(ROOT)}  {dest.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    sys.exit(main())
