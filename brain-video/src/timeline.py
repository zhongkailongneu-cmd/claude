"""Shared musical grid. Music and picture both read time from here, so every
visual hit lands on the sample the drum hit lands on."""

FPS = 30
SR = 48000
BEAT_FRAMES = 14                      # 14 frames per beat at 30 fps
BPM = 60.0 * FPS / BEAT_FRAMES         # = 128.57 BPM
BEAT = 60.0 / BPM                      # seconds per beat (0.4667 s)
BAR = 4 * BEAT                         # seconds per 4/4 bar (1.8667 s)
BEAT_SAMPLES = round(BEAT * SR)        # 22400 samples, exact

# (name, first bar, number of bars)
SECTIONS = [
    ("intro",      0,   8),   # 0-3 atmosphere, 4-5 title braam, 6-7 build
    ("part1",      8,  48),   # 12 brain regions x 4 bars
    ("transition", 56,  8),   # 56-59 breakdown / zoom, 60-63 build
    ("part2",      64, 56),   # 7 PFC subregions x 8 bars
    ("network",   120,  8),   # triple-network climax
    ("outro",     128,  8),   # final hits, references, fade
]
TOTAL_BARS = 136
TAIL = 3.0                             # reverb tail after the last bar
DURATION = TOTAL_BARS * BAR + TAIL

PART1_START, REGION_BARS = 8, 4
PART2_START, PFC_BARS = 64, 8


def bar_time(bar, beat=0.0):
    return (bar * 4 + beat) * BEAT


def section_at(bar):
    for name, start, n in SECTIONS:
        if start <= bar < start + n:
            return name, bar - start
    return "end", bar - TOTAL_BARS


# Bars whose last beat is left silent so the next downbeat hits harder.
GAP_BEFORE = [8, 64]
# Big downbeats: braam/impact + white flash + camera shake.
DROPS = [8, 64, 120, 128]
