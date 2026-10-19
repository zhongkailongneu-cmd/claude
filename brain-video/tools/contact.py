#!/usr/bin/env python3
"""Tile preview JPEGs into 2x2 contact sheets.  usage: contact.py <dir> <out_prefix> [cols]"""
import sys, glob, os
from PIL import Image, ImageDraw
d, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 2
files = sorted(glob.glob(os.path.join(d, '*.jpg')))
per = cols * 2
for n in range(0, len(files), per):
    chunk = files[n:n + per]
    ims = [Image.open(f) for f in chunk]
    w, h = ims[0].size
    sheet = Image.new('RGB', (w * cols, h * 2), (38, 59, 84))
    for i, (im, f) in enumerate(zip(ims, chunk)):
        sheet.paste(im, ((i % cols) * w, (i // cols) * h))
        ImageDraw.Draw(sheet).text(((i % cols) * w + 8, (i // cols) * h + h - 16), os.path.basename(f), fill=(204, 219, 235))
    sheet.save(f'{out}_{n // per:02d}.jpg', quality=88)
    print(f'{out}_{n // per:02d}.jpg', [os.path.basename(f) for f in chunk])
