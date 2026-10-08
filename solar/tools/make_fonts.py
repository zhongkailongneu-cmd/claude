"""Prepare the display fonts for hollow (stroked) neon type.

Variable-font instances keep overlapping contours, and `-webkit-text-stroke`
draws every contour, so overlaps show up as stray lines inside the letters.
This merges overlaps (fontTools + skia-pathops), subsets to the characters the
page uses and writes woff2 files that the build inlines as base64.

    pip install fonttools skia-pathops brotli
    python3 solar/tools/make_fonts.py <dir with @fontsource packages unpacked>
"""
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.ttLib.removeOverlaps import removeOverlaps
from fontTools import subset

SRC = Path(sys.argv[1])
OUT = Path(__file__).resolve().parent.parent / "fonts"
FONTS = [
    ("oswald", "oswald-latin-400-normal.woff2", "Oswald-400"),
    ("oswald", "oswald-latin-500-normal.woff2", "Oswald-500"),
    ("oswald", "oswald-latin-600-normal.woff2", "Oswald-600"),
    ("bebas-neue", "bebas-neue-latin-400-normal.woff2", "BebasNeue-400"),
    ("orbitron", "orbitron-latin-600-normal.woff2", "Orbitron-600"),
    ("michroma", "michroma-latin-400-normal.woff2", "Michroma-400"),
    ("syncopate", "syncopate-latin-700-normal.woff2", "Syncopate-700"),
]
TEXT = "".join(chr(c) for c in range(0x20, 0x7F)) + "·–—‘’“”…°×"

OUT.mkdir(exist_ok=True)
for pkg, name, out in FONTS:
    path = next(SRC.glob(f"fontsource-{pkg}-*/package/files/{name}"))
    font = TTFont(path)
    removeOverlaps(font)
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["kern", "liga"]
    opts.name_IDs = ["*"]
    sub = subset.Subsetter(opts)
    sub.populate(text=TEXT)
    sub.subset(font)
    font.flavor = "woff2"
    dest = OUT / f"{out}.woff2"
    font.save(dest)
    print(f"{dest.name}: {dest.stat().st_size} bytes")
