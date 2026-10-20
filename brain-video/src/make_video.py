"""Render all frames in parallel chunks, join them, add the score, and write
bilingual .srt captions next to the video.

    python make_video.py            # full video -> out/brain_pfc_bilingual.mp4
    python make_video.py --jobs 4
"""

import argparse
import math
import os
import subprocess
import sys

from timeline import DURATION, FPS, BAR

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
BUILD = os.path.join(ROOT, "build")
OUT = os.path.join(ROOT, "out")
NAME = "brain_pfc_bilingual"


def srt_time(sec):
    ms = int(round(sec * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return "%02d:%02d:%02d,%03d" % (h, m, s, ms)


def write_srt(path):
    from render import all_subtitles
    with open(path, "w", encoding="utf-8") as f:
        for n, (b0, b1, (cn, en)) in enumerate(all_subtitles(), 1):
            f.write("%d\n%s --> %s\n%s\n%s\n\n" % (n, srt_time(b0 * BAR), srt_time(b1 * BAR - 0.05), cn, en))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 4)
    ap.add_argument("--range", default=None, help="first:last frame, for test renders")
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    chunk_dir = os.path.join(BUILD, "chunks")
    os.makedirs(chunk_dir, exist_ok=True)
    n_frames = math.ceil(DURATION * FPS)
    f0, f1 = (0, n_frames) if a.range is None else (int(x) for x in a.range.split(":"))
    step = math.ceil((f1 - f0) / a.jobs)
    procs, parts = [], []
    for j in range(a.jobs):
        s, e = f0 + j * step, min(f1, f0 + (j + 1) * step)
        if s >= e:
            break
        part = os.path.join(chunk_dir, "part%02d.mp4" % j)
        parts.append(part)
        procs.append(subprocess.Popen([sys.executable, os.path.join(HERE, "render.py"),
                                       "--frames", "%d:%d" % (s, e), "--out", part]))
    if any(p.wait() for p in procs):
        sys.exit("a render chunk failed")
    lst = os.path.join(chunk_dir, "list.txt")
    with open(lst, "w") as f:
        f.writelines("file '%s'\n" % p for p in parts)
    out = os.path.join(OUT, NAME + ".mp4" if a.range is None else NAME + "_test.mp4")
    subprocess.check_call(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst,
                           "-ss", "%.4f" % (f0 / FPS), "-t", "%.4f" % ((f1 - f0) / FPS),
                           "-i", os.path.join(BUILD, "bgm.wav"),
                           "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k",
                           "-movflags", "+faststart", out])
    write_srt(os.path.join(OUT, NAME + ".srt"))
    print("wrote", out)


if __name__ == "__main__":
    sys.exit(main())
