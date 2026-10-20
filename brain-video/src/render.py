"""Frame renderer. Every animation is a pure function of time t, keyed to the
bar/beat grid and to the drum events the score wrote to build/events.json,
so a kick, a clap or an impact in the music moves the picture on the same
frame.

    python render.py --frames 0:7710 --out part0.mp4
    python render.py --still 2400 --png frame.png
"""

import argparse
import bisect
import json
import math
import os
import subprocess
import sys
from functools import lru_cache

import cairo
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageFilter

import content as C
import cues
from palette import (L10, L20, L30, L40, L50, L60, L70, L80, L90, L100,
                     WHITE, rgb, rgbf)
from timeline import FPS, BAR, BEAT, DURATION, bar_time as tb

W, H = 1920, 1080
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LAYERS = os.path.join(ROOT, "build", "layers")
FONTS = os.path.join(ROOT, "fonts")
MASTER_S = 2.4

with open(os.path.join(ROOT, "build", "events.json")) as f:
    EV = json.load(f)
with open(os.path.join(LAYERS, "meta.json")) as f:
    META = json.load(f)
KICKS = [e[0] for e in EV["kick"]]
CLAPS = [e[0] for e in EV["clap"]]
SNARES = [e[0] for e in EV["snare"]]


# ====================================================================== utils
def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def ease_out(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3


def ease_in_out(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def since(times, t):
    """Seconds since the latest event at or before t (inf if none)."""
    i = bisect.bisect_right(times, t + 1e-6) - 1
    return t - times[i] if i >= 0 else 1e9


def env(times, t, tau):
    d = since(times, t)
    return math.exp(-d / tau) if d < 8 * tau else 0.0


def count_since(times, t0, t):
    return bisect.bisect_right(times, t + 1e-6) - bisect.bisect_left(times, t0 - 1e-6)


def lerp(a, b, p):
    return a + (b - a) * p


# ====================================================================== fonts / text
FONT_FILES = dict(black="NotoSansSC_900Black.ttf", bold="NotoSansSC_700Bold.ttf",
                  med="NotoSansSC_500Medium.ttf", reg="NotoSansSC_400Regular.ttf",
                  osw="Oswald_600SemiBold.ttf", oswb="Oswald_700Bold.ttf",
                  raj="Rajdhani_600SemiBold.ttf", rajm="Rajdhani_500Medium.ttf",
                  orb="Orbitron_900Black.ttf", orbb="Orbitron_700Bold.ttf")


@lru_cache(maxsize=None)
def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, FONT_FILES[name]), size)


class Txt:
    __slots__ = ("img", "ox", "oy", "w")

    def __init__(self, img, ox, oy, w):
        self.img, self.ox, self.oy, self.w = img, ox, oy, w


@lru_cache(maxsize=6000)
def text(s, fname, size, color, tracking=0, glow=0, gcol=L40, galpha=0.9):
    f = font(fname, size)
    asc, desc = f.getmetrics()
    if tracking:
        widths = [f.getlength(c) for c in s]
        w = sum(widths) + tracking * (len(s) - 1)
    else:
        w = f.getlength(s)
    pad = int(glow * 3) + 4
    img = Image.new("RGBA", (int(math.ceil(w)) + 2 * pad, asc + desc + 2 * pad), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    col = rgb(color)
    if tracking:
        x = pad
        for c, cw in zip(s, widths):
            d.text((x, pad + asc), c, font=f, fill=col, anchor="ls")
            x += cw + tracking
    else:
        d.text((pad, pad + asc), s, font=f, fill=col, anchor="ls")
    if glow:
        a = img.getchannel("A").filter(ImageFilter.GaussianBlur(glow))
        a = a.point(lambda v: min(255, int(v * galpha * 1.6)))
        g = Image.new("RGBA", img.size, rgb(gcol) + (0,))
        g.putalpha(a)
        g.alpha_composite(img)
        img = g
    return Txt(img, pad, pad + asc, w)


_LUT = {}


def alpha_lut(k):
    q = round(k * 50)
    if q not in _LUT:
        kk = q / 50
        _LUT[q] = [min(255, int(v * kk + 0.5)) for v in range(256)]
    return _LUT[q]


def with_alpha(img, k):
    if k >= 0.999:
        return img
    out = img.copy()
    out.putalpha(img.getchannel("A").point(alpha_lut(max(0.0, k))))
    return out


def is_cjk(s):
    return any("　" <= c <= "鿿" or "＀" <= c <= "￯" for c in s)


@lru_cache(maxsize=2000)
def wrap(s, fname, size, max_w):
    f = font(fname, size)
    if f.getlength(s) <= max_w:
        return (s,)
    lines = []
    if is_cjk(s):
        cur = ""
        for c in s:
            if f.getlength(cur + c) > max_w:
                cut = max((cur.rfind(p) for p in "，、；：）"), default=-1)
                if cut >= len(cur) - 6 and cut > 0:
                    lines.append(cur[:cut + 1])
                    cur = cur[cut + 1:] + c
                else:
                    lines.append(cur)
                    cur = c
            else:
                cur += c
        lines.append(cur)
    else:
        cur = ""
        for word in s.split(" "):
            cand = (cur + " " + word).strip()
            if f.getlength(cand) > max_w and cur:
                lines.append(cur)
                cur = word
            else:
                cur = cand
        lines.append(cur)
    return tuple(lines)


class Frame:
    """One frame being built: background canvas, two vector layers (under and
    over the brain) and a list of text sprites drawn last."""

    def __init__(self, t):
        self.t = t
        self.canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))     # brain layer
        self.under = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
        self.cu = cairo.Context(self.under)
        self.over = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
        self.co = cairo.Context(self.over)
        self.sprites = []
        self.back = []

    def put(self, s, fname, size, color, x, y, anchor="l", alpha=1.0, tracking=0, glow=0,
            gcol=L40, scale=1.0, dx=0.0, dy=0.0, back=False):
        """Place text with its baseline at y. Returns the text width in px."""
        if alpha <= 0.003 or not s:
            return text(s or " ", fname, size, color, tracking).w
        tx = text(s, fname, size, color, tracking, glow, gcol)
        img = tx.img
        ox, oy, w = tx.ox, tx.oy, tx.w
        if abs(scale - 1) > 1e-3:
            nw, nh = max(1, int(img.width * scale)), max(1, int(img.height * scale))
            img = img.resize((nw, nh), Image.BILINEAR)
            ox, oy, w = ox * scale, oy * scale, w * scale
        if anchor == "c":
            x0 = x - w / 2
        elif anchor == "r":
            x0 = x - w
        else:
            x0 = x
        (self.back if back else self.sprites).append(
            (with_alpha(img, alpha), int(round(x0 - ox + dx)), int(round(y - oy + dy))))
        return tx.w * scale

    def lines(self, s, fname, size, color, x, y, max_w, lh, **kw):
        ls = wrap(s, fname, size, max_w)
        for i, line in enumerate(ls):
            self.put(line, fname, size, color, x, y + i * lh, **kw)
        return len(ls) * lh


def cairo_img(surf):
    surf.flush()
    return Image.frombuffer("RGBA", (W, H), bytes(surf.get_data()), "raw", "BGRa", 0, 1)


def set_col(ctx, hexc, a=1.0):
    r, g, b = rgbf(hexc)
    ctx.set_source_rgba(r, g, b, a)


def rrect(ctx, x, y, w, h, r):
    ctx.new_sub_path()
    ctx.arc(x + w - r, y + r, r, -math.pi / 2, 0)
    ctx.arc(x + w - r, y + h - r, r, 0, math.pi / 2)
    ctx.arc(x + r, y + h - r, r, math.pi / 2, math.pi)
    ctx.arc(x + r, y + r, r, math.pi, 1.5 * math.pi)
    ctx.close_path()


# ====================================================================== static images
def _background():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((xx - 700) / 1100) ** 2 + ((yy - 520) / 800) ** 2)
    t = np.clip(d, 0, 1)[..., None]
    a, b = np.array(rgb(L90), np.float32), np.array(rgb(L100), np.float32)
    img = a * (1 - t) + b * t
    return Image.fromarray(np.dstack([img, np.full((H, W), 255, np.float32)]).astype(np.uint8), "RGBA")


def _vignette():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H / 2) / (H * 0.66)) ** 2)
    a = np.clip((d - 0.55) / 0.6, 0, 1) ** 1.6 * 120
    out = np.zeros((H, W, 4), np.uint8)
    out[..., 3] = a.astype(np.uint8)
    return Image.fromarray(out, "RGBA")


BG = _background()
VIGNETTE = _vignette()
_fade = np.clip((1100 - np.arange(W)) / 140.0, 0, 1)
FADE_X = Image.fromarray((np.tile(_fade, (H, 1)) * 255).astype(np.uint8), "L")


# ====================================================================== brain layers
@lru_cache(maxsize=None)
def _master(name):
    return Image.open(os.path.join(LAYERS, name + ".png")).convert("RGBA")


@lru_cache(maxsize=None)
def layer(name, d):
    m = _master(name)
    return m.resize((int(round(1000 * d)), int(round(800 * d))), Image.LANCZOS)


class Place:
    def __init__(self, d, cu, sc):
        self.d, self.cu, self.sc = d, cu, sc

    def mix(self, other, p):
        return Place(lerp(self.d, other.d, p),
                     (lerp(self.cu[0], other.cu[0], p), lerp(self.cu[1], other.cu[1], p)),
                     (lerp(self.sc[0], other.sc[0], p), lerp(self.sc[1], other.sc[1], p)))

    def zoomed(self, z, focus=None):
        cu = self.cu if focus is None else focus
        return Place(self.d * z, cu if focus else self.cu, self.sc)

    def s(self, u, v):
        return (self.sc[0] + (u - self.cu[0]) * self.d, self.sc[1] + (v - self.cu[1]) * self.d)


P1 = Place(1.0, (520, 432), (545, 555))
P2 = Place(1.55, (330, 330), (540, 560))
PT = Place(0.82, (520, 432), (960, 560))
NETL = Place(0.74, (520, 432), (500, 470))
NETM = Place(0.74, (520, 432), (1420, 470))


def blit(target, name, layer_d, pl, alpha=1.0):
    img = layer(name, layer_d)
    ds = pl.d
    lx0, ly0 = pl.s(0, 0)
    lx1, ly1 = pl.s(1000, 800)
    x0, y0 = max(0, int(math.floor(lx0))), max(0, int(math.floor(ly0)))
    x1, y1 = min(W, int(math.ceil(lx1))), min(H, int(math.ceil(ly1)))
    if x1 <= x0 or y1 <= y0:
        return
    k = layer_d / ds

    def src(x, y):
        return ((x - pl.sc[0]) / ds + pl.cu[0]) * layer_d, ((y - pl.sc[1]) / ds + pl.cu[1]) * layer_d

    bx0, by0 = src(x0, y0)
    bx1, by1 = src(x1, y1)
    box = (clamp(bx0, 0, img.width), clamp(by0, 0, img.height), clamp(bx1, 0, img.width), clamp(by1, 0, img.height))
    patch = img.resize((x1 - x0, y1 - y0), Image.BILINEAR, box=box,
                       reducing_gap=None if k < 1.6 else 2.0)
    if alpha < 0.999:
        patch = with_alpha(patch, alpha)
    target.alpha_composite(patch, (x0, y0))


def draw_brain(fr, view, pl, layer_d, highlights=(), alpha=1.0, fade=0.0, base_alpha=1.0):
    """highlights: list of (mask_name, intensity) where intensity may exceed 1."""
    if fade > 0.001:
        tgt = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    else:
        tgt = fr.canvas
    blit(tgt, "base_" + view, layer_d, pl, alpha * base_alpha)
    for name, k in highlights:
        if k <= 0.01:
            continue
        kk = k * alpha
        blit(tgt, "hl_" + name, layer_d, pl, min(kk, 1.0))
        if kk > 1.0:
            blit(tgt, "hl_" + name, layer_d, pl, min(kk - 1.0, 1.0))
    if fade > 0.001:
        a = tgt.getchannel("A")
        if fade >= 0.999:
            m = FADE_X
        else:
            m = FADE_X.point(lambda v: int(255 - fade * (255 - v)))
        tgt.putalpha(ImageChops.multiply(a, m))
        fr.canvas.alpha_composite(tgt)


# ====================================================================== vector bits
rng = np.random.default_rng(5)
NP = 120
P_POS = rng.random((NP, 2)) * [W, H]
P_VEL = (rng.random((NP, 2)) - 0.5) * [26, 18]
P_R = 1.0 + rng.random(NP) * 1.8
P_PH = rng.random(NP) * 6.28


def draw_field(fr, energy, kick, density=1.0, speed=1.0):
    ctx = fr.cu
    t = fr.t
    # grid
    off = (t * 6) % 80
    set_col(ctx, L80, 0.22 + 0.25 * kick)
    ctx.set_line_width(1)
    for x in np.arange(-80, W + 80, 80):
        ctx.move_to(x + off, 0)
        ctx.line_to(x + off, H)
    for y in np.arange(-80, H + 80, 80):
        ctx.move_to(0, y + off * 0.5)
        ctx.line_to(W, y + off * 0.5)
    ctx.stroke()
    # particle network
    pos = (P_POS + P_VEL * t * speed) % [W, H]
    n = int(NP * density)
    pos = pos[:n]
    d = np.sqrt(((pos[:, None, :] - pos[None, :, :]) ** 2).sum(-1))
    ii, jj = np.nonzero(np.triu(d < 150, 1))
    ctx.set_line_width(1.0)
    for i, j in zip(ii, jj):
        a = (1 - d[i, j] / 150) * (0.16 + 0.3 * kick) * energy
        set_col(ctx, L50, a)
        ctx.move_to(*pos[i])
        ctx.line_to(*pos[j])
        ctx.stroke()
    for k in range(n):
        tw = 0.5 + 0.5 * math.sin(t * 2.0 + P_PH[k])
        set_col(ctx, L30, (0.25 + 0.45 * tw + 0.3 * kick) * energy)
        ctx.arc(pos[k, 0], pos[k, 1], P_R[k] * (1 + 0.6 * kick), 0, 6.283)
        ctx.fill()


def ring(ctx, x, y, r, col, a, w=2):
    set_col(ctx, col, a)
    ctx.set_line_width(w)
    ctx.arc(x, y, r, 0, 6.283)
    ctx.stroke()


def leader(fr, ax, ay, lx, ly, cn, en, p, align="l", alpha=1.0, kick=0.0):
    """Line from an anchor on the brain to a bilingual tag."""
    if p <= 0:
        return
    ctx = fr.co
    q = ease_out(p / 0.6)
    ex, ey = lerp(ax, lx, q), lerp(ay, ly, q)
    set_col(ctx, L10, 0.9 * alpha)
    ctx.set_line_width(1.6)
    ctx.move_to(ax, ay)
    ctx.line_to(ex, ey)
    ctx.stroke()
    ring(ctx, ax, ay, 7 + 4 * kick, L10, 0.95 * alpha, 2)
    set_col(ctx, L10, alpha)
    ctx.arc(ax, ay, 3, 0, 6.283)
    ctx.fill()
    pa = clamp((p - 0.45) / 0.4) * alpha
    if pa <= 0:
        return
    w1 = text(cn, "bold", 24, L10).w
    w2 = text(en, "osw", 20, L30, 2).w
    tw = w1 + 12 + w2
    x0 = lx if align == "l" else lx - tw
    set_col(ctx, L100, 0.6 * pa)
    rrect(ctx, x0 - 10, ly - 30, tw + 20, 40, 6)
    ctx.fill()
    set_col(ctx, L10, pa)
    ctx.set_line_width(2)
    ctx.move_to(x0 - 10, ly + 10)
    ctx.line_to(x0 - 10 + (tw + 20) * pa, ly + 10)
    ctx.stroke()
    fr.put(cn, "bold", 24, L10, x0, ly, alpha=pa)
    fr.put(en, "osw", 20, L30, x0 + w1 + 12, ly - 1, alpha=pa, tracking=2)


def slide(p, dist=46):
    """(alpha, dx) for an element p seconds after its entry."""
    q = ease_out(p / 0.22)
    return (q if p >= 0 else 0.0), (1 - q) * dist


def panel_box(fr, x0=1060, y0=118, x1=1870, y1=932, a=1.0, scan=None):
    ctx = fr.co
    set_col(ctx, L90, 0.62 * a)
    rrect(ctx, x0, y0, x1 - x0, y1 - y0, 14)
    ctx.fill()
    set_col(ctx, L60, 0.55 * a)
    ctx.set_line_width(1.5)
    rrect(ctx, x0, y0, x1 - x0, y1 - y0, 14)
    ctx.stroke()
    set_col(ctx, L40, 0.95 * a)
    ctx.set_line_width(3)
    for cx, cy, sx, sy in ((x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)):
        ctx.move_to(cx + sx * 28, cy)
        ctx.line_to(cx, cy)
        ctx.line_to(cx, cy + sy * 28)
    ctx.stroke()
    if scan is not None and 0 <= scan <= 1:
        y = y0 + (y1 - y0) * scan
        grad = cairo.LinearGradient(0, y - 60, 0, y)
        r, g, b = rgbf(L40)
        grad.add_color_stop_rgba(0, r, g, b, 0)
        grad.add_color_stop_rgba(1, r, g, b, 0.28 * a)
        ctx.set_source(grad)
        ctx.rectangle(x0 + 2, y - 60, x1 - x0 - 4, 60)
        ctx.fill()
        set_col(ctx, L20, 0.8 * a)
        ctx.set_line_width(2)
        ctx.move_to(x0 + 2, y)
        ctx.line_to(x1 - 2, y)
        ctx.stroke()


def bullet(fr, x, y, cn, en, p, kick=0.0, cn_size=32, en_size=23, max_w=700):
    a, dx = slide(p)
    if a <= 0:
        return 0
    ctx = fr.co
    set_col(ctx, L40, a)
    s = 7
    cx, cy = x + 8 + dx, y - 11
    ctx.move_to(cx, cy - s)
    ctx.line_to(cx + s, cy)
    ctx.line_to(cx, cy + s)
    ctx.line_to(cx - s, cy)
    ctx.close_path()
    ctx.fill()
    h = fr.lines(cn, "med", cn_size, WHITE, x + 34, y, max_w - 34, cn_size + 10, alpha=a, dx=dx)
    h += fr.lines(en, "raj", en_size, L40, x + 34, y + h - 4, max_w - 34, en_size + 6, alpha=a, dx=dx)
    return h


# ====================================================================== flashes / shake
FLASH = [(tb(4), 0.85), (tb(8), 0.95), (tb(64), 0.95), (tb(120), 0.9), (tb(130), 1.0),
         (tb(56), 0.4), (tb(60), 0.35), (tb(88), 0.3), (tb(104), 0.3)]
for i in range(1, 12):
    FLASH.append((tb(cues.region_start(i)), 0.5 if i in (4, 8) else 0.3))
for j in range(1, 7):
    FLASH.append((tb(cues.pfc_start(j)), 0.42))
for b in cues.page_flips():
    FLASH.append((tb(b), 0.16))
for b, beat in cues.OUTRO_WORDS:
    FLASH.append((tb(b, beat), 0.5))
for b in cues.NETWORK_STEPS[1:]:
    FLASH.append((tb(b), 0.3))
FLASH.sort()
FLASH_T = [f[0] for f in FLASH]


def flash_amount(t):
    i = bisect.bisect_right(FLASH_T, t + 1e-6) - 1
    tot = 0.0
    while i >= 0 and t - FLASH[i][0] < 0.7:
        tot += FLASH[i][1] * math.exp(-(t - FLASH[i][0]) / 0.11)
        i -= 1
    return tot


def shake_amount(t):
    i = bisect.bisect_right(FLASH_T, t + 1e-6) - 1
    if i < 0:
        return 0.0
    d = t - FLASH[i][0]
    return 18 * FLASH[i][1] * math.exp(-d / 0.12) if d < 0.8 else 0.0


GAPS = [(tb(7, 3), tb(8)), (tb(63, 3), tb(64)), (tb(119, 3.5), tb(120))]


# ====================================================================== subtitles
def _subs():
    s = []
    for i, R in enumerate(C.REGIONS):
        b = cues.region_start(i)
        s.append((b, b + 4, R["sub"]))
    s += [(56, 58, C.TRANSITION["zoom"]), (58, 60, C.TRANSITION["mature"]), (60, 64, C.TRANSITION["part2"])]
    for j, Pf in enumerate(C.PFC):
        b = cues.pfc_start(j)
        s += [(b, b + 4, Pf["sub"][0]), (b + 4, b + 8, Pf["sub"][1])]
    for k, b in enumerate(cues.NETWORK_STEPS):
        s.append((b, b + 2, C.NETWORK["subs"][k]))
    return s


SUBS = _subs()


def all_subtitles():
    """Every caption, including those already shown big on screen, for the .srt."""
    out = [(0, 2, C.INTRO["neurons"]), (2, 4, C.INTRO["energy"]), (4, 6, (C.INTRO["title"][0], "The Human Brain")),
           (6, 8, C.INTRO["part1"])]
    out += SUBS
    words = C.OUTRO["words"]
    out += [(128, 130, (" · ".join(w[0] for w in words), " · ".join(w[1].title() for w in words))),
            (130, 132, C.OUTRO["final"]), (132, 136, C.OUTRO["thanks"])]
    return out


def draw_subtitle(fr):
    t = fr.t
    bar = t / BAR
    for b0, b1, (cn, en) in SUBS:
        if b0 <= bar < b1:
            t0, t1 = tb(b0), tb(b1)
            a = clamp((t - t0) / 0.12) * clamp((t1 - t) / 0.12)
            ctx = fr.co
            grad = cairo.LinearGradient(0, 905, 0, 980)
            r, g, b = rgbf(L100)
            grad.add_color_stop_rgba(0, r, g, b, 0)
            grad.add_color_stop_rgba(1, r, g, b, 0.78)
            ctx.set_source(grad)
            ctx.rectangle(0, 905, W, 175)
            ctx.fill()
            set_col(ctx, L100, 0.78)
            ctx.rectangle(0, 980, W, 100)
            ctx.fill()
            fr.put(cn, "bold", 36, WHITE, 960, 1000, anchor="c", alpha=a, glow=6, gcol=L100)
            fr.put(en, "raj", 28, L20, 960, 1042, anchor="c", alpha=a)
            return


# ====================================================================== HUD
def section_label(bar):
    if bar < 8:
        return ("序章", "PROLOGUE")
    if bar < 56:
        return ("第一部分 · 脑区巡礼", "PART 1 · BRAIN REGIONS")
    if bar < 64:
        return ("聚焦前额叶", "ZOOM · PREFRONTAL")
    if bar < 120:
        return ("第二部分 · 前额叶亚区", "PART 2 · PFC SUBREGIONS")
    if bar < 128:
        return ("网络协同", "NETWORKS")
    return ("尾声", "EPILOGUE")


def draw_hud(fr, alpha, kick):
    if alpha <= 0:
        return
    t = fr.t
    bar = int(t // BAR)
    beat = int((t - bar * BAR) // BEAT)
    ctx = fr.co
    set_col(ctx, L10, alpha * (0.5 + 0.5 * kick))
    ctx.rectangle(40, 40, 12, 12)
    ctx.fill()
    fr.put("NEURO ATLAS", "orbb", 20, L30, 64, 54, alpha=alpha, tracking=5)
    cn, en = section_label(bar)
    w = fr.put(cn, "med", 18, L40, 64, 84, alpha=alpha)
    fr.put(en, "raj", 17, L50, 64 + w + 10, 84, alpha=alpha, tracking=1)
    if bar < 136:
        fr.put("BAR %03d" % (bar + 1), "orbb", 20, L30, 1872, 54, anchor="r", alpha=alpha, tracking=3)
        for k in range(4):
            x = 1872 - 6 - (3 - k) * 20
            if k == beat:
                set_col(ctx, L10, alpha)
                ctx.arc(x, 74, 6 + 2 * kick, 0, 6.283)
                ctx.fill()
            else:
                ring(ctx, x, 74, 5, L60, alpha, 1.5)
        fr.put("128.6 BPM", "raj", 16, L50, 1872, 102, anchor="r", alpha=alpha, tracking=1)
    # progress bar
    set_col(ctx, L80, 0.8 * alpha)
    ctx.rectangle(0, H - 5, W, 5)
    ctx.fill()
    set_col(ctx, L40, alpha)
    ctx.rectangle(0, H - 5, W * clamp(t / (136 * BAR)), 5)
    ctx.fill()
    set_col(ctx, L20, alpha)
    for b in (8, 56, 64, 120, 128):
        ctx.rectangle(W * b / 136 - 1, H - 9, 2, 9)
    ctx.fill()


def view_tag(fr, view, alpha):
    names = dict(lateral=("外侧面", "LATERAL VIEW"), glass=("透视", "GLASS VIEW"),
                 insula=("岛叶开窗", "INSULA WINDOW"), medial=("正中矢状面", "MEDIAL VIEW"))
    cn, en = names[view]
    w = fr.put(cn, "med", 17, L40, 64, 118, alpha=alpha * 0.9)
    fr.put(en, "raj", 16, L50, 64 + w + 8, 118, alpha=alpha * 0.9, tracking=2)
    fr.put("◀ 前 ANTERIOR", "med", 15, L60, 64, 930, alpha=alpha * 0.85)


# ====================================================================== scenes
LAB_P1 = {
    "frontal": ((290, 230), (-60, -175), "l"), "parietal": ((640, 210), (40, -150), "l"),
    "temporal": ((560, 520), (-200, 120), "r"), "occipital": ((875, 370), (40, -300), "r"),
    "insula": ((470, 400), (-120, -340), "l"), "hippocampus": ((600, 445), (-260, 200), "r"),
    "amygdala": ((392, 456), (-120, 190), "r"), "basal": ((450, 235), (-40, -175), "l"),
    "thalamus": ((528, 338), (60, -280), "l"), "hypothalamus": ((460, 402), (-140, 240), "r"),
    "cerebellum": ((800, 640), (0, 140), "r"), "brainstem": ((600, 700), (-180, 60), "r"),
}
LAB_P2 = {
    "dlpfc": ((285, 215), (0, -217), "l"), "vlpfc": ((300, 370), (-120, 200), "r"),
    "fpc": ((140, 355), (0, -440), "l"), "ofc": ((250, 455), (-40, 110), "r"),
    "vmpfc": ((210, 400), (-40, 190), "r"), "acc": ((300, 250), (120, -270), "l"),
    "dmpfc": ((230, 180), (-30, -165), "l"),
}


def kick_env(t):
    return env(KICKS, t, 0.11)


def scene_intro(fr, bar):
    t = fr.t
    k = kick_env(t)
    if bar < 4:
        e = clamp(t / 1.5)
        draw_field(fr, e, k, density=0.4 + 0.15 * bar, speed=0.6)
        # heartbeat ring pulses (beat 1 of every bar, also beat 3 in bars 2-3)
        hb = [tb(b) for b in range(4)] + [tb(b, 2) for b in (2, 3)]
        hb.sort()
        d = since(hb, t)
        if d < 1.2:
            ring(fr.co, 960, 480, 60 + d * 520, L40, 0.55 * (1 - d / 1.2), 2.5)
            ring(fr.co, 960, 480, 30 + d * 300, L30, 0.35 * (1 - d / 1.2), 1.5)
        hk = math.exp(-d / 0.15) if d < 1 else 0
        if bar < 2:
            p = ease_out((t - 0.4) / (tb(1, 2) - 0.4))
            n = int(86e9 * p)
            a = clamp((t - 0.3) / 0.4) * clamp((tb(2) - t) / 0.15)
            fr.put("{:,}".format(n), "orb", 112, L10, 960, 520, anchor="c", alpha=a, glow=10, gcol=L50,
                   scale=1 + 0.03 * hk)
            cn, en = C.INTRO["neurons"]
            fr.put(cn, "bold", 48, WHITE, 960, 620, anchor="c", alpha=a * clamp((t - 0.8) / 0.3))
            fr.put(en, "raj", 34, L30, 960, 668, anchor="c", alpha=a * clamp((t - 1.0) / 0.3), tracking=1)
            fr.put(C.INTRO["neurons_cite"], "rajm", 20, L50, 960, 712, anchor="c", alpha=a * clamp((t - 1.2) / 0.3))
        else:
            lt = t - tb(2)
            a = clamp(lt / 0.2) * clamp((tb(4) - t) / 0.12)
            cn, en = C.INTRO["energy"]
            fr.put(cn, "black", 64, WHITE, 960, 380, anchor="c", alpha=a, glow=8, gcol=L50)
            fr.put(en, "raj", 34, L30, 960, 430, anchor="c", alpha=a, tracking=1)
            ctx = fr.co
            for row, (lab_cn, lab_en, pct, t0) in enumerate((("体重", "BODY WEIGHT", 2, tb(2, 0)),
                                                              ("能耗", "ENERGY USE", 20, tb(2, 2)))):
                y = 520 + row * 90
                p = ease_out((t - t0) / 0.35)
                fr.put(lab_cn, "bold", 30, WHITE, 640, y + 10, anchor="r", alpha=a)
                fr.put(lab_en, "raj", 18, L40, 640, y + 34, anchor="r", alpha=a, tracking=2)
                set_col(ctx, L80, 0.8 * a)
                rrect(ctx, 670, y - 18, 640, 36, 6)
                ctx.fill()
                set_col(ctx, L40 if row == 0 else L20, a)
                rrect(ctx, 670, y - 18, max(12, 640 * pct / 20 * p), 36, 6)
                ctx.fill()
                fr.put("%d%%" % round(pct * p), "orb", 34, L10, 1340, y + 14, alpha=a * clamp(p * 3))
            fr.put(C.INTRO["energy_cite"], "rajm", 20, L50, 960, 740, anchor="c", alpha=a)
        return 0.0
    if bar < 6:
        lt = t - tb(4)
        draw_field(fr, 1.0, k, density=0.8)
        z = 1.0 + 0.06 * (1 - ease_out(lt / 0.6)) + 0.012 * k
        pl = PT.zoomed(z)
        draw_brain(fr, "lateral", pl, 0.82, [("pfc_lat", 0.25 + 0.35 * k)], alpha=0.5 * clamp(lt / 0.15))
        cn, en = C.INTRO["title"]
        slam = 1 + 0.35 * (1 - ease_out(lt / 0.18))
        fr.put(cn, "black", 190, WHITE, 960, 470, anchor="c", alpha=clamp(lt / 0.08), glow=14, gcol=L50,
               scale=slam * (1 + 0.012 * k))
        fr.put(en, "osw", 64, L30, 960, 580, anchor="c", alpha=clamp((lt - 0.12) / 0.2), tracking=26)
        tcn, ten = C.INTRO["tagline"]
        a = clamp((lt - BEAT * 2) / 0.25)
        fr.put(tcn, "bold", 36, L20, 960, 668, anchor="c", alpha=a)
        fr.put(ten, "raj", 28, L40, 960, 708, anchor="c", alpha=a, tracking=1)
        return 0.0
    # bars 6-7: build, lobes flash on every snare-roll hit
    lt = t - tb(6)
    draw_field(fr, 1.0, k, speed=1 + lt)
    n = count_since(SNARES, tb(6), t)
    seq = ["frontal", "parietal", "occipital", "temporal", "cerebellum", "brainstem"]
    hl = []
    if n:
        se = env(SNARES, t, 0.09)
        hl = [(seq[(n - 1) % 6], 0.5 + 0.9 * se)]
    z = 1.0 + 0.18 * ease_in_out(lt / (2 * BAR))
    draw_brain(fr, "lateral", PT.zoomed(z * (1 + 0.012 * k)), 0.82, hl, alpha=0.75)
    slam = 1 + 0.3 * (1 - ease_out(lt / 0.16))
    a = clamp(lt / 0.06)
    fr.put("PART 1", "orb", 120, L10, 960, 440, anchor="c", alpha=a, glow=12, gcol=L50, scale=slam)
    cn, en = C.INTRO["part1"]
    fr.put(cn, "black", 60, WHITE, 960, 540, anchor="c", alpha=clamp((lt - 0.1) / 0.15))
    fr.put(en.split(" · ")[1], "osw", 34, L30, 960, 600, anchor="c", alpha=clamp((lt - 0.2) / 0.2), tracking=8)
    return 0.0


def scene_part1(fr, bar):
    t = fr.t
    i = (bar - 8) // 4
    R = C.REGIONS[i]
    t0 = tb(cues.region_start(i))
    lt = t - t0
    L = 4 * BAR
    k = kick_env(t)
    draw_field(fr, 0.9, k)
    (au, av), (ldx, ldy), align = LAB_P1[R["mask"]]
    focus = (P1.cu[0] + 0.06 * (au - P1.cu[0]), P1.cu[1] + 0.06 * (av - P1.cu[1]))
    z = 1.0 + 0.03 * (lt / L) + 0.012 * k
    pl = Place(P1.d * z, focus, P1.sc)
    kk = 1.35 + 0.6 * math.exp(-lt / 0.25) + 0.4 * k
    # group watermark
    g_cn, g_en = C.GROUPS[R["group"]]
    fr.put(g_en, "oswb", 150, L80, 40 - (t * 12) % 200, 990, alpha=0.32, tracking=10, back=True)
    draw_brain(fr, R["view"], pl, 1.0, [(R["mask"], kk)], base_alpha=0.82)
    view_tag(fr, R["view"], 1.0)
    ax, ay = pl.s(au, av)
    leader(fr, ax, ay, ax + ldx, ay + ldy, R["cn"], R["en"], (lt - BEAT * 0.5) / 0.5, align, kick=k)
    # panel
    ex = clamp((L - lt) / 0.12)
    panel_box(fr, scan=lt / 0.35 if lt < 0.35 else None)
    X = 1100
    fr.put("%02d / 12" % (i + 1), "orbb", 24, L40, X, 168, alpha=ex, tracking=3)
    fr.put(g_cn + " · " + g_en, "med", 20, L40, X + 150, 166, alpha=ex)
    slam = 1 + 0.25 * (1 - ease_out(lt / 0.16))
    ghost = env(CLAPS, t, 0.05)
    if ghost > 0.05:
        fr.put(R["cn"], "black", 100, L40, X, 292, alpha=0.5 * ghost * ex, dx=10)
    fr.put(R["cn"], "black", 100, WHITE, X, 292, alpha=clamp(lt / 0.06) * ex, glow=10, gcol=L50, scale=slam)
    a, dx = slide(lt - 0.08)
    fr.put(R["en"], "osw", 40, L30, X, 352, alpha=a * ex, tracking=6, dx=dx)
    ctx = fr.co
    set_col(ctx, L50, ex)
    ctx.set_line_width(2)
    ctx.move_to(X, 384)
    ctx.line_to(X + 730 * ease_out((lt - 0.12) / 0.4), 384)
    ctx.stroke()
    y = 448
    for n_b, (cn, en) in enumerate(R["bullets"]):
        p = lt - BEAT * (n_b + 1)
        bullet(fr, X, y, cn, en, p if ex > 0.01 else -1, k)
        y += 98
    # key fact chip
    p = lt - BAR
    a, dx = slide(p)
    if a > 0:
        fcn, fen = R["fact"]
        en_lines = wrap(fen, "raj", 21, 680)
        hbox = 104 + 26 * (len(en_lines) - 1)
        set_col(ctx, L80, 0.85 * a * ex)
        rrect(ctx, X + dx, 744, 730, hbox, 10)
        ctx.fill()
        set_col(ctx, L50, a * ex)
        ctx.set_line_width(1.5)
        rrect(ctx, X + dx, 744, 730, hbox, 10)
        ctx.stroke()
        set_col(ctx, L40, a * ex)
        ctx.rectangle(X + dx, 744, 5, hbox)
        ctx.fill()
        fr.put("KEY FACT · 小知识", "med", 15, L40, X + 22, 768, alpha=a * ex, dx=dx)
        fr.put(fcn, "bold", 26, L10, X + 22, 802, alpha=a * ex, dx=dx)
        for li, line in enumerate(en_lines):
            fr.put(line, "raj", 21, L40, X + 22, 830 + 26 * li, alpha=a * ex, dx=dx)
    return 0.0


def scene_transition(fr, bar):
    t = fr.t
    k = kick_env(t)
    ctx = fr.co
    if bar < 60:
        lt = t - tb(56)
        draw_field(fr, 0.7, 0.0, speed=0.5)
        p = ease_in_out(lt / (4 * BAR))
        pl = P1.mix(P2, p)
        breathe = 0.5 + 0.5 * math.sin(2 * math.pi * lt / BAR - 1.5)
        hl = [("pfc_lat", 0.95 + 0.55 * breathe + 0.8 * math.exp(-lt / 0.3))]
        if bar >= 57:
            hl.append(("motor", 0.35 * clamp((t - tb(57)) / 0.3)))
        draw_brain(fr, "lateral", pl, 1.55, hl, fade=p, base_alpha=0.85)
        view_tag(fr, "lateral", 1.0)
        if bar >= 57:
            ax, ay = pl.s(470, 200)
            cn, en = C.TRANSITION["nonpfc"]
            leader(fr, ax, ay, ax - 40, ay - 120 + 50 * p, cn, en, (t - tb(57)) / 0.5, "r")
        panel_box(fr)
        X = 1100
        w = fr.put("FOCUS", "orbb", 22, L40, X, 168, tracking=3)
        fr.put("· 聚焦", "med", 20, L40, X + w + 10, 166)
        a = clamp(lt / 0.15)
        cn, en = C.TRANSITION["zoom_big"]
        fr.put(cn, "black", 104, WHITE, X, 300, alpha=a, glow=10, gcol=L50)
        fr.put(en, "osw", 44, L30, X, 364, alpha=clamp((lt - 0.2) / 0.3), tracking=8)
        fr.put("PFC", "orb", 40, L50, X, 430, alpha=clamp((lt - 0.4) / 0.3), tracking=10)
        p2 = t - tb(58)
        a2, dx = slide(p2)
        if a2 > 0:
            mcn, men = C.TRANSITION["mature"]
            h = fr.lines(mcn, "bold", 32, WHITE, X, 540, 720, 44, alpha=a2, dx=dx)
            h += fr.lines(men, "raj", 25, L40, X, 540 + h, 720, 32, alpha=a2, dx=dx)
            fr.put(C.TRANSITION["mature_cite"], "rajm", 20, L50, X, 540 + h + 12, alpha=a2, dx=dx)
            # 0-25 age bar
            y = 760
            q = ease_out((t - tb(58, 1)) / (2 * BEAT))
            set_col(ctx, L80, a2)
            rrect(ctx, X, y, 720, 18, 9)
            ctx.fill()
            set_col(ctx, L40, a2)
            rrect(ctx, X, y, max(18, 720 * q), 18, 9)
            ctx.fill()
            for age in (0, 5, 10, 15, 20, 25):
                fr.put(str(age), "orbb", 16, L40, X + 720 * age / 25, y + 46, anchor="c", alpha=a2)
            fr.put("岁 AGE", "med", 16, L50, X + 720, y + 74, anchor="r", alpha=a2)
        return 0.0
    # bars 60-63: build
    lt = t - tb(60)
    draw_field(fr, 1.0, k, speed=1 + 2 * lt)
    n = count_since(SNARES, tb(60), t)
    seq = ["dlpfc", "vlpfc", "fpc", "ofc"]
    hl = [("pfc_lat", 0.6)]
    if n:
        hl.append((seq[(n - 1) % 4], 0.8 + 1.0 * env(SNARES, t, 0.08)))
    z = 1.0 + 0.1 * ease_in_out(lt / (4 * BAR)) + 0.012 * k
    draw_brain(fr, "lateral", P2.zoomed(z), 1.55, hl, fade=1.0)
    view_tag(fr, "lateral", 1.0)
    panel_box(fr)
    X = 1100
    slam = 1 + 0.3 * (1 - ease_out(lt / 0.16))
    fr.put("PART 2", "orb", 100, L10, X, 270, alpha=clamp(lt / 0.06), glow=12, gcol=L50, scale=slam)
    cn, en = C.TRANSITION["part2"]
    fr.put(cn.split(" · ")[1], "black", 56, WHITE, X, 360, alpha=clamp((lt - 0.1) / 0.15))
    fr.put(en.split(" · ")[1], "osw", 28, L30, X, 410, alpha=clamp((lt - 0.2) / 0.2), tracking=5)
    for idx, Pf in enumerate(C.PFC):
        te = tb(61) + idx * BEAT
        a, dx = slide(t - te, 30)
        if a <= 0:
            continue
        col, row = idx % 2, idx // 2
        x, y = X + col * 370, 470 + row * 100
        set_col(ctx, L80, 0.85 * a)
        rrect(ctx, x + dx, y, 350, 80, 10)
        ctx.fill()
        set_col(ctx, L40, a)
        ctx.set_line_width(1.5)
        rrect(ctx, x + dx, y, 350, 80, 10)
        ctx.stroke()
        fr.put("%02d" % (idx + 1), "orbb", 18, L50, x + 18, y + 32, alpha=a, dx=dx)
        fr.put(Pf["abbr"], "orb", 30, L10, x + 62, y + 38, alpha=a, dx=dx)
        fr.put(Pf["cn"], "med", 20, L30, x + 62, y + 66, alpha=a, dx=dx)
    return 0.0


def scene_part2(fr, bar):
    t = fr.t
    j = (bar - 64) // 8
    Pf = C.PFC[j]
    t0 = tb(cues.pfc_start(j))
    lt = t - t0
    page = 0 if lt < 4 * BAR else 1
    pt = lt - page * 4 * BAR
    k = kick_env(t)
    draw_field(fr, 0.9, k)
    z = 1.0 + 0.04 * (lt / (8 * BAR)) + 0.012 * k
    pl = P2.zoomed(z)
    kk = 1.35 + 0.6 * math.exp(-pt / 0.25) + 0.4 * k
    fr.put(Pf["abbr"], "orb", 230, L80, 60 - (t * 10) % 300, 1000, alpha=0.3, tracking=20, back=True)
    draw_brain(fr, Pf["view"], pl, 1.55, [(Pf["mask"], kk)], fade=1.0, base_alpha=0.82)
    view_tag(fr, Pf["view"], 1.0)
    (au, av), (ldx, ldy), align = LAB_P2[Pf["mask"]]
    ax, ay = pl.s(au, av)
    leader(fr, ax, ay, ax + ldx, ay + ldy, Pf["cn"], Pf["abbr"], (lt - BEAT * 0.5) / 0.5, align, kick=k)
    if Pf["key"] == "ofc":
        a = clamp((lt - BAR) / 0.3)
        fr.put("额叶底面 · VENTRAL SURFACE", "med", 19, L30, ax + ldx, ay + ldy + 34, anchor="r", alpha=a)
    ex = clamp((4 * BAR - pt) / 0.1) if page == 0 else clamp((8 * BAR - lt) / 0.12)
    panel_box(fr, scan=pt / 0.35 if pt < 0.35 else None)
    X = 1100
    ctx = fr.co
    fr.put("PFC %02d / 07" % (j + 1), "orbb", 22, L40, X, 166, tracking=3)
    fr.put("前额叶亚区 · PREFRONTAL SUBREGION", "med", 18, L40, X + 190, 165)
    slam = 1 + 0.22 * (1 - ease_out(lt / 0.16))
    ghost = env(CLAPS, t, 0.05)
    if ghost > 0.05:
        fr.put(Pf["abbr"], "orb", 92, L40, X, 262, alpha=0.45 * ghost, dx=10)
    fr.put(Pf["abbr"], "orb", 92, L10, X, 262, alpha=clamp(lt / 0.06), glow=12, gcol=L50, scale=slam)
    a, dx = slide(lt - 0.06)
    fr.put(Pf["cn"], "black", 54, WHITE, X, 336, alpha=a, dx=dx)
    a, dx = slide(lt - 0.12)
    fr.put(Pf["en"], "osw", 26, L30, X, 378, alpha=a, tracking=3, dx=dx)
    a, dx = slide(lt - 0.18)
    if a > 0:
        set_col(ctx, L80, 0.8 * a)
        rrect(ctx, X + dx, 398, 730, 74, 10)
        ctx.fill()
        ring(ctx, X + 30 + dx, 435, 11, L40, a, 2)
        set_col(ctx, L40, a)
        ctx.arc(X + 30 + dx, 435, 4, 0, 6.283)
        ctx.fill()
        fr.put(Pf["loc"][0], "bold", 24, L20, X + 58, 430, alpha=a, dx=dx)
        fr.put(Pf["loc"][1], "raj", 20, L40, X + 58, 458, alpha=a, dx=dx)
    if page == 0:
        y = 530
        for n_b, (cn, en) in enumerate(Pf["bullets"]):
            p = pt - BEAT * (n_b + 1)
            h = bullet(fr, X, y, cn, en, p if ex > 0.01 else -1, k, cn_size=30, en_size=22, max_w=730)
            y += max(h, 70) + 26
        if "note" in Pf:
            a = clamp((pt - BAR) / 0.3)
            fr.put(Pf["note"][0] + " · " + Pf["note"][1], "med", 18, L50, X, 900, alpha=a)
    else:
        y = 512
        for n_e, (lcn, len_, cn, en, cite) in enumerate(Pf["ev"]):
            p = pt - (BEAT if n_e == 0 else BAR + BEAT)
            a, dx = slide(p)
            if a <= 0:
                continue
            a *= ex
            set_col(ctx, L40, a)
            ctx.rectangle(X + dx, y - 20, 4, 24)
            ctx.fill()
            w = fr.put(lcn, "bold", 22, L40, X + 14, y, alpha=a, dx=dx)
            fr.put(len_, "orbb", 14, L50, X + 24 + w, y - 1, alpha=a, tracking=3, dx=dx)
            yy = y + 42
            yy += fr.lines(cn, "bold", 27, WHITE, X, yy, 730, 38, alpha=a, dx=dx)
            yy += fr.lines(en, "raj", 22, L40, X, yy - 6, 730, 28, alpha=a, dx=dx) - 6
            fr.put("— " + cite, "rajm", 19, L50, X, yy + 22, alpha=a, dx=dx)
            y = yy + 74
    return 0.0


NET_COL = dict(cen=L30, dmn=L50, sn=L10)
NET_NODES = dict(
    cen=[("L", 285, 215, "DLPFC"), ("L", 700, 230, "PPC")],
    dmn=[("M", 200, 330, "mPFC"), ("M", 665, 230, "PCC"), ("L", 770, 330, "AG")],
    sn=[("M", 330, 215, "dACC"), ("L", 400, 410, "aINS")],
)
NET_HL = dict(cen=[("L", "dlpfc"), ("L", "parietal")],
              dmn=[("M", "vmpfc"), ("M", "dmpfc"), ("M", "pcc")],
              sn=[("M", "acc"), ("I", "insula")])


def scene_network(fr, bar):
    t = fr.t
    lt = t - tb(120)
    k = kick_env(t)
    step = min(3, (bar - 120) // 2)
    st = t - tb(120 + 2 * step)
    draw_field(fr, 1.0, k)
    nets = ["cen", "dmn", "sn"]
    active = nets if step == 3 else [nets[step]]
    hl_l, hl_m = [], []
    for nk in nets:
        on = nk in active
        lvl = (0.9 + 0.5 * math.exp(-st / 0.25) + 0.3 * k) if on else 0.0
        if step == 3:
            beat = int((t - tb(bar)) // BEAT)
            lvl = 0.55 + (0.6 if nets[beat % 3] == nk else 0) * env(KICKS, t, 0.2) + 0.2
        for side, m in NET_HL[nk]:
            (hl_l if side in "LI" else hl_m).append((m, lvl))
    zl = 1 + 0.012 * k
    draw_brain(fr, "lateral", NETL.zoomed(zl), 0.74, hl_l)
    draw_brain(fr, "medial", NETM.zoomed(zl), 0.74, hl_m)
    fr.put("外侧面 LATERAL", "med", 18, L40, 190, 770, alpha=0.9)
    fr.put("内侧面 MEDIAL", "med", 18, L40, 1110, 770, alpha=0.9)
    ctx = fr.co
    # edges and nodes
    pos = {}
    for nk in nets:
        for side, u, v, lab in NET_NODES[nk]:
            pl = (NETL if side == "L" else NETM).zoomed(zl)
            pos[(nk, lab)] = pl.s(u, v)
    for nk in nets:
        on = nk in active
        a = (1.0 if on else 0.18)
        nodes = [pos[(nk, n[3])] for n in NET_NODES[nk]]
        ctx.set_line_width(3 if on else 1.5)
        ctx.set_dash([14, 10], -t * 60)
        for p0, p1 in zip(nodes, nodes[1:] + nodes[:1] if len(nodes) > 2 else nodes[1:]):
            set_col(ctx, NET_COL[nk], 0.85 * a)
            mx, my = (p0[0] + p1[0]) / 2, min(p0[1], p1[1]) - 120
            ctx.move_to(*p0)
            ctx.curve_to(mx, my, mx, my, *p1)
            ctx.stroke()
        ctx.set_dash([])
        for (x, y), n in zip(nodes, NET_NODES[nk]):
            r = 11 + (6 * k if on else 0)
            set_col(ctx, NET_COL[nk], a)
            ctx.arc(x, y, r * 0.55, 0, 6.283)
            ctx.fill()
            ring(ctx, x, y, r + 6, NET_COL[nk], a * 0.9, 2.5)
            if on:
                ring(ctx, x, y, r + 6 + (st % BEAT) / BEAT * 30, NET_COL[nk], 0.5 * (1 - (st % BEAT) / BEAT), 2)
            fr.put(n[3], "orbb", 16, NET_COL[nk], x + 20, y - 14, alpha=a)
    # title
    cn, en = C.NETWORK["title"]
    fr.put(cn, "black", 46, WHITE, 960, 150, anchor="c", alpha=clamp(lt / 0.1), glow=8, gcol=L50)
    fr.put(en + "  ·  " + C.NETWORK["cite"], "raj", 22, L40, 960, 186, anchor="c", tracking=1)
    # description block
    if step < 3:
        N = C.NETWORK["nets"][step]
        a, dx = slide(st)
        col = NET_COL[N["key"]]
        fr.put(N["abbr"], "orb", 64, col, 560, 868, anchor="r", alpha=a, glow=8, gcol=L50, dx=dx)
        fr.put(N["cn"] + "  " + N["en"], "bold", 32, WHITE, 600, 820, alpha=a, dx=dx)
        w = fr.put(N["nodes"][0], "med", 21, L30, 600, 856, alpha=a, dx=dx)
        fr.put("|  " + N["nodes"][1], "raj", 23, L30, 600 + w + 14, 856, alpha=a, dx=dx)
        a2, dx2 = slide(st - BEAT)
        fr.put(N["role"][0] + " · " + N["role"][1], "med", 22, col, 600, 892, alpha=a2, dx=dx2)
        if N["key"] == "sn":
            beat = int(st // BEAT)
            tgt = "CEN" if beat % 2 == 0 else "DMN"
            ctx.set_line_width(3)
            set_col(ctx, L10, a2)
            for sgn in (-1, 1):
                y0 = 858 + sgn * 9
                x_from, x_to = (1450, 1500) if sgn < 0 else (1500, 1450)
                ctx.move_to(x_from, y0)
                ctx.line_to(x_to, y0)
                ctx.stroke()
                ctx.move_to(x_to, y0)
                ctx.line_to(x_to - 9 * (1 if x_to > x_from else -1), y0 - 6)
                ctx.line_to(x_to - 9 * (1 if x_to > x_from else -1), y0 + 6)
                ctx.close_path()
                ctx.fill()
            fr.put(tgt, "orbb", 28, L10, 1516, 870, alpha=a2, tracking=3)
    else:
        a, dx = slide(st)
        for c, N in enumerate(C.NETWORK["nets"]):
            x = 330 + c * 440
            fr.put(N["abbr"], "orb", 40, NET_COL[N["key"]], x, 840, anchor="c", alpha=a, dx=dx)
            fr.put(N["cn"], "bold", 22, WHITE, x, 878, anchor="c", alpha=a, dx=dx)
        fr.put(C.NETWORK["subs"][3][0], "black", 30, WHITE, 1560, 850, anchor="c",
               alpha=clamp((st - BEAT) / 0.2))
    return 0.0


def scene_outro(fr, bar):
    t = fr.t
    k = kick_env(t)
    final = tb(cues.OUTRO_FINAL)
    if t < final:
        draw_field(fr, 1.0, k)
        times = [tb(b, bt) for b, bt in cues.OUTRO_WORDS]
        w = max(0, bisect.bisect_right(times, t) - 1)
        lt = t - times[w]
        masks = [("lateral", "dlpfc"), ("lateral", "vlpfc"), ("lateral", "ofc"), ("medial", "dmpfc")]
        view, m = masks[w]
        draw_brain(fr, view, PT.zoomed(1.0 + 0.04 * math.exp(-lt / 0.2)), 0.82,
                   [(m, 0.8 + 0.8 * math.exp(-lt / 0.3))], alpha=0.55)
        cn, en = C.OUTRO["words"][w]
        slam = 1 + 0.4 * (1 - ease_out(lt / 0.14))
        fr.put(cn, "black", 210, WHITE, 960, 560, anchor="c", alpha=clamp(lt / 0.05), glow=16, gcol=L50, scale=slam)
        fr.put(en, "osw", 64, L30, 960, 660, anchor="c", alpha=clamp((lt - 0.06) / 0.12), tracking=30)
        ctx = fr.co
        for q in range(4):
            set_col(ctx, L10 if q <= w else L70, 1.0)
            ctx.arc(960 - 45 + q * 30, 730, 6, 0, 6.283)
            ctx.fill()
        return 0.0
    lt = t - final
    end = tb(136)
    fade_out = clamp((end + 1.5 - t) / 3.0)
    draw_field(fr, fade_out, k * fade_out, speed=0.5)
    up = ease_in_out((t - tb(132)) / (2 * BEAT))
    hl = [("pfc_lat", (1.0 + 0.8 * math.exp(-lt / 0.4)) * (1 - 0.7 * up))]
    draw_brain(fr, "lateral", PT.zoomed(1.0 + 0.05 * lt / (6 * BAR)), 0.82, hl, alpha=(0.6 - 0.35 * up) * fade_out)
    cn, en = C.OUTRO["final"]
    y = lerp(540, 250, up)
    fr.put(cn, "black", 96, WHITE, 960, y, anchor="c", alpha=clamp(lt / 0.1) * fade_out, glow=12, gcol=L50,
           scale=1 + 0.2 * (1 - ease_out(lt / 0.2)))
    fr.put(en, "osw", 46, L30, 960, y + 70, anchor="c", alpha=clamp((lt - 0.15) / 0.3) * fade_out, tracking=6)
    if up > 0:
        a = up * fade_out
        yy = 420
        fr.put("参考文献 · REFERENCES", "bold", 22, L40, 960, yy - 40, anchor="c", alpha=a)
        for i, ref in enumerate(C.OUTRO["refs"]):
            fr.put(ref, "rajm", 21, L30, 960, yy + i * 32, anchor="c", alpha=a * clamp((t - tb(132) - i * 0.12) / 0.3))
        dcn, den = C.OUTRO["disclaimer"]
        fr.put(dcn, "med", 22, L20, 960, 700, anchor="c", alpha=a)
        fr.put(den, "raj", 20, L40, 960, 730, anchor="c", alpha=a)
        ccn, cen = C.OUTRO["credits"]
        fr.put(ccn, "med", 19, L40, 960, 790, anchor="c", alpha=a)
        fr.put(cen, "raj", 18, L50, 960, 816, anchor="c", alpha=a)
        tcn, ten = C.OUTRO["thanks"]
        fr.put(tcn + "  ·  " + ten, "bold", 34, WHITE, 960, 900, anchor="c", alpha=a * clamp((t - tb(133)) / 0.4))
    return 0.0


# ====================================================================== frame
def render(fi):
    t = fi / FPS
    fr = Frame(t)
    bar = int(t // BAR)
    k = kick_env(t)
    if bar < 8:
        scene_intro(fr, bar)
    elif bar < 56:
        scene_part1(fr, bar)
    elif bar < 64:
        scene_transition(fr, bar)
    elif bar < 120:
        scene_part2(fr, bar)
    elif bar < 128:
        scene_network(fr, bar)
    else:
        scene_outro(fr, bar)
    draw_subtitle(fr)
    hud_a = clamp((t - 1.0) / 0.8) * clamp((tb(132) - t) / 0.6)
    draw_hud(fr, hud_a, k)
    # layer order: background, particle field, watermarks, brain, vector UI, text
    canvas = BG.copy()
    canvas.alpha_composite(cairo_img(fr.under))
    for img, x, y in fr.back:
        paste_clipped(canvas, img, x, y)
    canvas.alpha_composite(fr.canvas)
    canvas.alpha_composite(cairo_img(fr.over))
    for img, x, y in fr.sprites:
        paste_clipped(canvas, img, x, y)
    # gaps before drops: everything drops to near black except a thin line
    for g0, g1 in GAPS:
        if g0 <= t < g1:
            p = (t - g0) / (g1 - g0)
            ov = Image.new("RGBA", (W, H), rgb(L100) + (int(235 * clamp(p * 6)),))
            canvas.alpha_composite(ov)
            d = ImageDraw.Draw(canvas)
            half = int(40 + 900 * p ** 2)
            d.rectangle([960 - half, 538, 960 + half, 541], fill=rgb(L30) + (255,))
    fa = flash_amount(t)
    if fa > 0.01:
        canvas.alpha_composite(Image.new("RGBA", (W, H), rgb(L10) + (int(255 * min(0.92, fa)),)))
    canvas.alpha_composite(VIGNETTE)
    if t < 0.6:
        canvas.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, int(255 * (1 - t / 0.6)))))
    if t > DURATION - 1.2:
        canvas.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, int(255 * clamp((t - DURATION + 1.2) / 1.0)))))
    sh = shake_amount(t)
    out = canvas.convert("RGB")
    if sh > 0.5:
        dx = int(sh * math.sin(fi * 2.3))
        dy = int(sh * 0.6 * math.cos(fi * 3.1))
        shifted = Image.new("RGB", (W, H), rgb(L100))
        shifted.paste(out, (dx, dy))
        out = shifted
    return out


def paste_clipped(canvas, img, x, y):
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(W, x + img.width), min(H, y + img.height)
    if x1 <= x0 or y1 <= y0:
        return
    canvas.alpha_composite(img.crop((x0 - x, y0 - y, x1 - x, y1 - y)), (x0, y0))


# ====================================================================== cli
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", default=None)
    ap.add_argument("--out", default=None)
    ap.add_argument("--still", type=int, nargs="*")
    ap.add_argument("--png", default=None)
    a = ap.parse_args()
    if a.still:
        for fi in a.still:
            img = render(fi)
            path = a.png.replace("%d", str(fi)) if a.png else "frame_%05d.png" % fi
            img.save(path)
            print("saved", path)
        return
    f0, f1 = (int(x) for x in a.frames.split(":"))
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "%dx%d" % (W, H),
           "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-tune", "animation", "-crf", "20",
           "-pix_fmt", "yuv420p", "-g", "60", a.out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for fi in range(f0, f1):
        proc.stdin.write(render(fi).tobytes())
        if (fi - f0) % 300 == 0:
            print("frame", fi, flush=True)
    proc.stdin.close()
    proc.wait()


if __name__ == "__main__":
    sys.exit(main())
