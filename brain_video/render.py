"""Render the fluorescent-particle brain film, locked to the beat grid in timeline.py / events.json.

usage:
  python3 render.py --test 12.0,30.5          # write test PNGs at those times (seconds)
  python3 render.py --workers 4               # render the full film -> output/brain_journey.mp4
"""
import argparse
import json
import math
import os
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

import timeline as TL
from timeline import (W, H, FPS, BAR, BEAT, DURATION, t_of, REGIONS, PFC_OVERVIEW, PFC_SUBS, NETWORKS,
                      INTRO_CUES, BREAK_CUES, FINALE_CUES, GAPS, RISERS)

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "fonts")
cv2.setNumThreads(1)


# ======================================================================= palette (Loyel 渐变蓝)
def hexc(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32) / 255.0


L = {10: hexc("#F4F7FB"), 20: hexc("#E8EEF6"), 30: hexc("#CCDBEB"), 40: hexc("#9FBDDA"), 50: hexc("#6C9AC4"),
     60: hexc("#497DAE"), 70: hexc("#376392"), 80: hexc("#2E5076"), 90: hexc("#2B4868"), 100: hexc("#263B54")}
WHITE = np.ones(3, np.float32)

# ======================================================================= model
M = np.load(os.path.join(HERE, "model.npz"))
POS, NRM, CAT, SHADE = M["pos"], M["nrm"], M["cat"], M["shade"]
G1, G2, G3 = M["g1"].astype(np.int64), M["g2"].astype(np.int64), M["g3"].astype(np.int64)
PHASE, TONE, SCAT, CHAOS, DELAY = M["phase"], M["tone"], M["scatter"], M["chaos"], M["delay"]
NP = len(POS)
BASE_COL = np.stack([L[70], L[60], L[50]])[TONE]
HI_COL = np.stack([L[50], L[40], L[50]])[TONE]
CHAOS_COL = np.stack([L[50], L[40], L[60]])[TONE]
CENTER = np.array([0.0, -17.0, 5.0], np.float32)
LEFT_CTX = (CAT == 0) & (POS[:, 0] < 0)
FRONTAL = (G1 == 1)
IS_CTX = CAT == 0


def centroid(mask, side=None):
    p = POS[mask]
    if side == "L":
        p = p[p[:, 0] < 0]
    elif side == "R":
        p = p[p[:, 0] > 0]
    return p.mean(0)


C1 = {g: centroid(G1 == g, "L" if g in (1, 2, 3, 4, 5, 7, 9, 10, 11) else None) for g in range(1, 14)}
C2 = {g: centroid(G2 == g, "R" if g in (4, 5, 6) else "L") for g in range(1, 8)}
C3 = {g: centroid(G3 == g) for g in range(1, 7)}
GROUP_IDX1 = {g: np.flatnonzero(G1 == g) for g in range(1, 14)}
GROUP_IDX2 = {g: np.flatnonzero(G2 == g) for g in range(1, 8)}
GROUP_IDX3 = {g: np.flatnonzero(G3 == g) for g in range(1, 7)}
ALL_PFC = np.flatnonzero(G2 > 0)
ALL_CTX = np.flatnonzero(IS_CTX)
FRONT_IDX = np.flatnonzero(FRONTAL)
# direction of the "pop" for each group (away from the group centroid)
POP_DIR = np.zeros_like(POS)
for g, idx in GROUP_IDX1.items():
    d = POS[idx] - POS[idx].mean(0)
    POP_DIR[idx] = d / (np.linalg.norm(d, axis=1, keepdims=True) + 1e-6)
for g, idx in GROUP_IDX2.items():
    d = POS[idx] - POS[idx].mean(0)
    POP_DIR[idx] = d / (np.linalg.norm(d, axis=1, keepdims=True) + 1e-6)

rs = np.random.default_rng(3)
DUST = (rs.random((2600, 3)).astype(np.float32) - 0.5) * np.array([1500, 1500, 1000], np.float32)
DUST_V = rs.normal(0, 4, (2600, 3)).astype(np.float32)
DUST_I = (0.25 + 0.75 * rs.random(2600)).astype(np.float32)

# ======================================================================= music events
EV = json.load(open(os.path.join(HERE, "events.json")))
KICKS = np.array(EV["kick"])
CLAPS = np.array(EV["clap"])
CRASH = np.array(EV["crash"])
HEART = np.array(sorted(EV["heart"] + [h + 0.21 for h in EV["heart"]]))
TOMS = np.array(EV["tom"])
SNARES = np.array(EV["snare"])
IMP_T = np.array([i[0] for i in EV["impact"]])
IMP_S = np.array([i[1] for i in EV["impact"]])


def since(arr, t):
    i = np.searchsorted(arr, t, "right") - 1
    return (t - arr[i]) if i >= 0 else 1e9


def env(arr, t, tau):
    d = since(arr, t)
    return math.exp(-d / tau) if d < 20 * tau else 0.0


def impact_env(t, tau=0.5):
    i = np.searchsorted(IMP_T, t, "right") - 1
    if i < 0:
        return 0.0, 1e9
    d = t - IMP_T[i]
    return IMP_S[i] * math.exp(-d / tau), d


def riser_level(t):
    for a, b in RISERS:
        ta, tb = t_of(a), t_of(b)
        if ta <= t < tb:
            return ((t - ta) / (tb - ta)) ** 2
    return 0.0


def in_gap(t):
    for a, b in GAPS:
        ta, tb = t_of(a), t_of(b)
        if ta <= t < tb:
            return (t - ta) / (tb - ta)
    return None


# ======================================================================= easing
def ease_out(x):
    x = min(max(x, 0.0), 1.0)
    return 1 - (1 - x) ** 3


def ease_io(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def ease_in(x):
    x = min(max(x, 0.0), 1.0)
    return x ** 2.4


def ease_whip(x):
    x = min(max(x, 0.0), 1.0)
    return 1 - 2 ** (-10 * x) if x < 1 else 1.0


EASES = {"out": ease_out, "io": ease_io, "in": ease_in, "whip": ease_whip}

# ======================================================================= camera keyframes
D0, FOCAL = 600.0, 2900.0


def V(az, el, dist, tgt, cx=0.6, cortex=0.34, deep=0.14, medial=0.0):
    return dict(az=az, el=el, dist=dist, tgt=np.array(tgt, np.float32), cx=cx, cortex=cortex, deep=deep,
                medial=medial)


KF = []  # (t0, view, transition seconds, ease, azimuth drift deg/s)
KF.append((0.0, V(236, 30, 1.85, CENTER, cx=0.5, cortex=0.7, deep=0.35), 0, "io", -2.0))
KF.append((t_of(1.5), V(168, 12, 1.12, CENTER, cx=0.5, cortex=0.95, deep=0.4), t_of(6.5) - t_of(1.5), "io", -1.2))
for k, R in enumerate(REGIONS):
    v = R[4]
    deep_view = "cortex" in v
    KF.append((t_of(8 + 4 * k), V(v["az"], v["el"], v["dist"], v["tgt"], cx=0.6,
                                  cortex=v.get("cortex", 0.3), deep=0.3 if deep_view else 0.1),
               0.55, "whip", 2.4 if k % 2 == 0 else -2.4))
KF.append((t_of(60), V(165, 18, 1.08, (0, -12, 6), cx=0.5, cortex=0.42, deep=0.16), 1.4, "io", -2.0))
KF.append((t_of(64), V(126, 12, 0.6, (0, 44, 12), cx=0.5, cortex=0.5, deep=0.08), t_of(67.625) - t_of(64), "in", 0))
ov = PFC_OVERVIEW[4]
KF.append((t_of(68), V(ov["az"], ov["el"], ov["dist"], ov["tgt"], cx=0.56, cortex=ov["cortex"], deep=0.08), 0.5, "whip", 2.0))
for j, R in enumerate(PFC_SUBS):
    v = R[4]
    KF.append((t_of(72 + 4 * j), V(v["az"], v["el"], v["dist"], v["tgt"], cx=0.6, cortex=v["cortex"], deep=0.08,
                                   medial=1.0 if v.get("medial") else 0.0), 0.55, "whip", 2.0 if j % 2 == 0 else -2.0))
KF.append((t_of(100), V(150, 18, 1.04, (0, -14, 6), cx=0.6, cortex=0.2, deep=0.14), 0.6, "whip", 7.0))
KF.append((t_of(104), V(None, 14, 1.0, (0, -14, 6), cx=0.5, cortex=0.5, deep=0.32), 0.5, "out", 26.0))
KF.append((t_of(108), V(None, 10, 1.25, (0, -14, 6), cx=0.5, cortex=0.5, deep=0.3), 0.4, "out", 8.0))
KF_T = np.array([k[0] for k in KF])


def angdiff(a, b):
    return ((b - a + 180) % 360) - 180


def blend(p, s, w):
    o = {}
    for k in s:
        if k == "az":
            o[k] = p[k] + angdiff(p[k], s[k]) * w
        else:
            o[k] = p[k] + (s[k] - p[k]) * w
    return o


def state_at(i, t):
    t0, v, trans, ease, drift = KF[i]
    s = dict(v)
    s["az"] = v["az"] + drift * (t - t0)
    if i > 0 and trans > 0 and t - t0 < trans:
        s = blend(state_at(i - 1, t), s, EASES[ease]((t - t0) / trans))
    return s


for i, kf in enumerate(KF):            # resolve "continue previous azimuth" keyframes
    if kf[1]["az"] is None:
        kf[1]["az"] = state_at(i - 1, kf[0])["az"]


def camera(t):
    i = max(0, int(np.searchsorted(KF_T, t, "right") - 1))
    return state_at(i, t)


def basis(az, el):
    a, e = math.radians(az), math.radians(el)
    off = np.array([math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)], np.float32)
    f = -off
    r = np.cross(f, [0, 0, 1]).astype(np.float32)
    r /= np.linalg.norm(r)
    u = np.cross(r, f).astype(np.float32)
    return off, f, r, u


class Cam:
    def __init__(self, st, shake=(0.0, 0.0)):
        self.st = st
        self.off, self.f, self.r, self.u = basis(st["az"], st["el"])
        self.D = D0 * st["dist"]
        self.C = st["tgt"] + self.off * self.D
        self.cx = W * st["cx"] + shake[0]
        self.cy = H * 0.5 + shake[1]

    def project(self, P):
        Vv = P - self.C
        x, y, z = Vv @ self.r, Vv @ self.u, Vv @ self.f
        z = np.maximum(z, 1e-3)
        return self.cx + FOCAL * x / z, self.cy - FOCAL * y / z, z

    def project1(self, p):
        sx, sy, z = self.project(np.asarray(p, np.float32)[None])
        return float(sx[0]), float(sy[0]), float(z[0])


# ======================================================================= script lookup
def block_info(t):
    bar = t / BAR
    if 8 <= bar < 60:
        k = int((bar - 8) // 4)
        return "p1", k, t - t_of(8 + 4 * k)
    if 68 <= bar < 100:
        k = int((bar - 68) // 4)
        return "p2", k, t - t_of(68 + 4 * k)
    return None, -1, 0.0


def section(t):
    bar = t / BAR
    for name, (a, b) in [("intro", TL.INTRO), ("p1", TL.P1), ("break", TL.BREAK), ("p2", TL.P2),
                         ("finale", TL.FINALE), ("outro", TL.OUTRO)]:
        if a <= bar < b:
            return name
    return "outro"


def cues():
    """all bilingual subtitle cues as (t0, t1, zh, en)"""
    out = [(t_of(a), t_of(b), zh, en) for a, b, zh, en in INTRO_CUES]
    for k, R in enumerate(REGIONS):
        b = 8 + 4 * k
        out += [(t_of(b), t_of(b + 2), *R[3][0]), (t_of(b + 2), t_of(b + 4), *R[3][1])]
    out += [(t_of(a), t_of(b), zh, en) for a, b, zh, en in BREAK_CUES]
    for k, R in enumerate([PFC_OVERVIEW] + PFC_SUBS):
        b = 68 + 4 * k
        out += [(t_of(b), t_of(b + 2), *R[3][0]), (t_of(b + 2), t_of(b + 4), *R[3][1])]
    out += [(t_of(a), t_of(b), zh, en) for a, b, zh, en in FINALE_CUES]
    return out


CUES = cues()

# ======================================================================= sparks (neural impulses)
def build_sparks():
    rg = np.random.default_rng(5)
    sp = []

    def spawn(t, pool, n, dur=(0.3, 0.65)):
        if len(pool) < 2:
            return
        a = rg.choice(pool, n)
        for ai in a:
            cand = rg.choice(pool, 24)
            d = np.linalg.norm(POS[cand] - POS[ai], axis=1)
            bi = cand[np.argmin(np.abs(d - 24))]
            sp.append((t + rg.random() * 0.05, rg.uniform(*dur), ai, bi))

    dt = 1.0 / FPS
    t = 0.0
    while t < DURATION:
        sec = section(t)
        blk, k, tb = block_info(t)
        pool, rate = None, 0
        if sec == "intro" and t > t_of(3):
            pool, rate = ALL_CTX, 10 + 70 * riser_level(t)
        elif blk == "p1":
            pool, rate = GROUP_IDX1[k + 1], 26
        elif sec == "break":
            pool, rate = FRONT_IDX, 8 + 60 * riser_level(t)
        elif blk == "p2":
            pool, rate = (ALL_PFC if k == 0 else GROUP_IDX2[k]), 30
        elif sec == "finale":
            pool, rate = np.concatenate([ALL_PFC, np.flatnonzero(G3 > 0)]), 45
        if pool is not None and in_gap(t) is None:
            n = rg.poisson(rate * dt)
            if n:
                spawn(t, pool, n)
        t += dt
    for arr, n in ((CLAPS, 14), (HEART[::2], 10), (TOMS, 5)):
        for tc in arr:
            blk, k, _ = block_info(tc)
            sec = section(tc)
            if blk == "p1":
                pool = GROUP_IDX1[k + 1]
            elif blk == "p2":
                pool = ALL_PFC if k == 0 else GROUP_IDX2[k]
            elif sec in ("break", "intro"):
                pool = FRONT_IDX if sec == "break" else ALL_CTX
            elif sec == "finale":
                pool = ALL_PFC
            else:
                continue
            spawn(tc, pool, n, (0.22, 0.45))
    sp.sort(key=lambda s: s[0])
    return np.array([s[0] for s in sp]), np.array([s[1] for s in sp]), np.array([s[2] for s in sp]), np.array([s[3] for s in sp])


SP_T, SP_D, SP_A, SP_B = build_sparks()


# ======================================================================= text sprites
_fonts = {}


def font(name, size):
    key = (name, size)
    if key not in _fonts:
        path = {"zh900": "Noto_Sans_SC_wght_900.ttf", "zh700": "Noto_Sans_SC_wght_700.ttf",
                "zh500": "Noto_Sans_SC_wght_500.ttf", "zh400": "Noto_Sans_SC_wght_400.ttf",
                "orb900": "Orbitron_wght_900.ttf", "orb700": "Orbitron_wght_700.ttf", "orb500": "Orbitron_wght_500.ttf",
                "exo400": "Exo_2_wght_400.ttf", "exo500": "Exo_2_wght_500.ttf", "exo600": "Exo_2_wght_600.ttf",
                "exo700": "Exo_2_wght_700.ttf"}[name]
        _fonts[key] = ImageFont.truetype(os.path.join(FONTS, path), size)
    return _fonts[key]


_sprites = {}


def sprite(text, fname, size, tracking=0.0, glow_sigma=None):
    key = (text, fname, size, tracking)
    if key in _sprites:
        return _sprites[key]
    f = font(fname, size)
    pad = int(size * 0.95) + 16
    widths = [f.getlength(ch) for ch in text]
    tw = int(sum(widths) + tracking * max(0, len(text) - 1)) + 2
    asc, desc = f.getmetrics()
    img = Image.new("L", (tw + 2 * pad, asc + desc + 2 * pad), 0)
    d = ImageDraw.Draw(img)
    if tracking:
        x = pad
        for ch, wd in zip(text, widths):
            d.text((x, pad), ch, font=f, fill=255)
            x += wd + tracking
    else:
        d.text((pad, pad), text, font=f, fill=255)
    a = np.asarray(img, np.float32) / 255.0
    g = cv2.GaussianBlur(a, (0, 0), glow_sigma or max(2.0, size * 0.12))
    g2 = cv2.GaussianBlur(a, (0, 0), max(5.0, size * 0.28))
    s = dict(a=a, g=g, g2=g2, w=tw, h=asc + desc, asc=asc, pad=pad)
    _sprites[key] = s
    return s


def blit(img, spr, x, y, color, alpha=1.0, glow=0.0, glow_col=None, anchor="l", scale=1.0, glitch=0.0, seed=0,
         reveal=1.0):
    """x,y = anchor point; anchor 'l' (left, baseline-ish top), 'c' (center), 'r' (right). y is the text top."""
    if alpha <= 0.003:
        return
    a, g = spr["a"], spr["g"] + 0.5 * spr["g2"]
    if reveal < 1.0:                      # left-to-right wipe
        cut = int(spr["pad"] + spr["w"] * max(0.0, reveal))
        a = a.copy()
        a[:, cut:] = 0
        g = cv2.GaussianBlur(a, (0, 0), 3)
    if scale != 1.0:
        nh, nw = max(1, int(a.shape[0] * scale)), max(1, int(a.shape[1] * scale))
        a = cv2.resize(a, (nw, nh), interpolation=cv2.INTER_LINEAR)
        g = cv2.resize(g, (nw, nh), interpolation=cv2.INTER_LINEAR)
    if glitch > 0:
        rg = np.random.default_rng(seed)
        a = a.copy()
        hh = a.shape[0]
        for _ in range(6):
            y0 = rg.integers(0, hh)
            y1 = min(hh, y0 + rg.integers(3, max(4, hh // 5)))
            a[y0:y1] = np.roll(a[y0:y1], int(rg.normal(0, 40 * glitch)), axis=1)
    pad = spr["pad"] * scale
    w = spr["w"] * scale
    if anchor == "c":
        X = x - w / 2 - pad
    elif anchor == "r":
        X = x - w - pad
    else:
        X = x - pad
    Y = y - pad
    X, Y = int(round(X)), int(round(Y))
    h_, w_ = a.shape
    x0, y0, x1, y1 = max(0, X), max(0, Y), min(W, X + w_), min(H, Y + h_)
    if x1 <= x0 or y1 <= y0:
        return
    A = a[y0 - Y:y1 - Y, x0 - X:x1 - X] * alpha
    reg = img[y0:y1, x0:x1]
    if glow > 0:
        G = g[y0 - Y:y1 - Y, x0 - X:x1 - X] * (alpha * glow)
        reg += G[..., None] * (glow_col if glow_col is not None else L[50])
    reg *= (1 - A[..., None])
    reg += A[..., None] * color


def text_width(text, fname, size, tracking=0.0):
    return sprite(text, fname, size, tracking)["w"]


# ======================================================================= render helpers
YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)
_bg_cache = {}


def background(cx):
    key = int(round(cx / 16.0)) * 16
    cx = key
    if key not in _bg_cache:
        r = np.sqrt(((XX - cx) / (W * 0.62)) ** 2 + ((YY - H * 0.48) / (H * 0.75)) ** 2)
        g = np.clip(1 - r, 0, 1) ** 1.6
        bg = g[..., None] * L[100] * 0.42 + (g ** 3)[..., None] * L[80] * 0.10
        _bg_cache[key] = bg.astype(np.float32)
    return _bg_cache[key]


VIGNETTE = (1 - 0.38 * np.clip(np.sqrt(((XX - W / 2) / (W * 0.6)) ** 2 + ((YY - H / 2) / (H * 0.62)) ** 2) - 0.45, 0, 1)
            ).astype(np.float32)[..., None]
SUB_SHADE = np.clip((YY[:, :1] - 840) / 200, 0, 1).astype(np.float32)[..., None] ** 1.3
SLOGAN_BAND = np.sin(np.linspace(0, np.pi, 520)).astype(np.float32)[:, None, None] ** 0.7
GRAIN = [cv2.resize(np.random.default_rng(i).normal(0, 0.006, (H // 2, W // 2)).astype(np.float32), (W, H))[..., None]
         for i in range(4)]


def splat(sx, sy, col):
    """bilinear additive splat of points into an H*W*3 buffer"""
    ok = (sx >= 0) & (sx < W - 1) & (sy >= 0) & (sy < H - 1)
    sx, sy, col = sx[ok], sy[ok], col[ok]
    x0 = sx.astype(np.int32)
    y0 = sy.astype(np.int32)
    fx = (sx - x0).astype(np.float32)
    fy = (sy - y0).astype(np.float32)
    idx = y0 * W + x0
    I = np.concatenate([idx, idx + 1, idx + W, idx + W + 1])
    wts = np.concatenate([(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy])
    out = np.empty((H * W, 3), np.float32)
    for c in range(3):
        cc = col[:, c]
        out[:, c] = np.bincount(I, weights=wts * np.tile(cc, 4), minlength=H * W)
    return out.reshape(H, W, 3)


def glow(img):
    s1 = cv2.resize(img, (W // 2, H // 2), interpolation=cv2.INTER_AREA)
    s2 = cv2.resize(s1, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
    s3 = cv2.resize(s2, (W // 8, H // 8), interpolation=cv2.INTER_AREA)
    g1 = cv2.GaussianBlur(s1, (0, 0), 2.2)
    g2 = cv2.GaussianBlur(s2, (0, 0), 3.5)
    g3 = cv2.GaussianBlur(s3, (0, 0), 6.0)
    up = (cv2.resize(g1, (W, H)) * 0.9 + cv2.resize(g2, (W, H)) * 1.0 + cv2.resize(g3, (W, H)) * 1.3)
    return up


TILES = [(x, y) for y in range(0, H, 270) for x in range(0, W, 320)]


def hud_composite(img, mask_u8, color, glow_amt=0.8, additive=False, sigma=3.0):
    """composite an anti-aliased uint8 line mask, tile by tile so empty areas cost nothing"""
    pad = int(sigma * 3) + 2
    for (x, y) in TILES:
        if not mask_u8[y:y + 270, x:x + 320].any():
            continue
        x0, y0, x1, y1 = max(0, x - pad), max(0, y - pad), min(W, x + 320 + pad), min(H, y + 270 + pad)
        m = mask_u8[y0:y1, x0:x1].astype(np.float32) / 255.0
        gl = cv2.GaussianBlur(m, (0, 0), sigma) if glow_amt else None
        iy0, ix0 = y - y0, x - x0
        iy1, ix1 = iy0 + min(270, H - y), ix0 + min(320, W - x)
        reg = img[y:y + 270, x:x + 320]
        mm = m[iy0:iy1, ix0:ix1, None]
        if gl is not None:
            reg += gl[iy0:iy1, ix0:ix1, None] * color * glow_amt
        if additive:
            reg += mm * color
        else:
            reg *= (1 - mm)
            reg += mm * color


def tonemap(x, k=1.15):
    """hue-preserving exposure curve: bright areas keep their blue instead of clipping to grey-white"""
    m = x[..., 2:3]          # every Loyel tone has blue as its largest channel, so blue == max channel
    y = x * ((1.0 - np.exp(-k * m)) / np.maximum(m, 1e-5))
    wmix = np.clip((k * m - 2.4) * 0.16, 0.0, 0.5)
    y += (1.0 - y) * wmix
    return y


# ======================================================================= per-frame scene state
def highlight_weights(t):
    w1, w2, w3 = np.zeros(14, np.float32), np.zeros(8, np.float32), np.zeros(7, np.float32)
    blk, k, tb = block_info(t)
    if blk == "p1":
        w1[k + 1] = 1.0 + 0.6 * math.exp(-tb / 0.22)
        if k > 0:
            w1[k] = max(w1[k], math.exp(-tb / 0.12))
    elif blk == "p2":
        if k == 0:
            for g in range(1, 8):
                # each subregion flashes when its tag pops (on the claps: beats 1,3,5,...)
                tp = (2 * g - 1) * BEAT
                w2[g] = 0.8 if tb >= tp else 0.35
                if tb >= tp:
                    w2[g] += 0.9 * math.exp(-(tb - tp) / 0.2)
        else:
            w2[k] = 1.0 + 0.6 * math.exp(-tb / 0.22)
            if k > 1:
                w2[k - 1] = max(w2[k - 1], math.exp(-tb / 0.12))
            elif k == 1:
                w2[1:] = np.maximum(w2[1:], 0.55 * math.exp(-tb / 0.12))
    sec = section(t)
    if sec == "break":
        bar = t / BAR
        w1[1] = 0.15 + 0.55 * ease_io((bar - 60) / 6)
        if bar >= 64:
            w2[1:] = 0.25 + 0.5 * ease_io((bar - 64) / 3.6)
    if sec == "finale":
        bar = t / BAR
        for i, (src, dst, _, _) in enumerate(NETWORKS):
            on = t_of(100) + (2 * i + 1) * BEAT
            if t >= on:
                fl = math.exp(-(t - on) / 0.25)
                w2[src] = max(w2[src], 0.7 + 0.7 * fl)
                w3[dst] = max(w3[dst], 0.6 + 0.7 * fl)
        if bar >= 104:
            w2[1:] = np.maximum(w2[1:], 0.9)
    if sec == "outro":
        fade = math.exp(-(t - t_of(108)) / 1.0)
        w2[1:] = 0.9 * fade
    return w1, w2, w3


def particle_frame(t, cam, st):
    """returns (positions (n,3), colours*intensity (n,3)) for the brain particles"""
    sec = section(t)
    bar = t / BAR
    kick = env(KICKS, t, 0.11)
    heart = env(HEART, t, 0.16)
    imp, imp_d = impact_env(t, 0.35)
    ris = riser_level(t)
    P = POS
    # ---- intro: galaxy of neurons converging into the brain
    morph = 1.0
    if bar < 7.0:
        ang = 0.12 * t
        ca, sa = math.cos(ang), math.sin(ang)
        ch = CHAOS @ np.array([[ca, sa, 0], [-sa, ca, 0], [0, 0, 1]], np.float32)
        m = np.clip(((t - t_of(1.5)) / (t_of(6.0) - t_of(1.5))) * 1.6 - DELAY * 0.6, 0, 1)
        e = m * m * (3 - 2 * m)
        sw = (1 - e) * 1.8
        cs, sn = np.cos(sw), np.sin(sw)
        Q = ch + (POS - ch) * e[:, None]
        Q = Q - CENTER
        Q = np.stack([Q[:, 0] * cs - Q[:, 1] * sn, Q[:, 0] * sn + Q[:, 1] * cs, Q[:, 2]], 1) + CENTER
        P = Q.astype(np.float32)
        morph = e
    else:
        P = POS.copy()
    w1, w2, w3 = highlight_weights(t)
    h = np.maximum(np.maximum(w1[G1], w2[G2]), w3[G3])
    hc = np.minimum(h, 1.0)
    # ---- displacement: pop of the active region + kick breathing + riser jitter + impacts
    blk, k, tb = block_info(t)
    if blk is not None and bar >= 8:
        pop = 7.0 * math.exp(-tb / 0.2) + 1.6 * kick
        P += POP_DIR * (pop * hc)[:, None]
    P = CENTER + (P - CENTER) * (1 + 0.010 * kick + 0.006 * heart)
    if ris > 0:
        P += SCAT * (np.sin(PHASE * 7 + t * 37.0) * 2.8 * ris)[:, None]
    if imp > 0.01 and sec != "outro":
        P = CENTER + (P - CENTER) * (1 + 0.16 * imp) + SCAT * (imp * 5.0)
    if sec == "break":
        # everything that is not frontal drifts away, then snaps back on the drop
        dis = ease_io((bar - 60) / 6.5) * 120.0
        P = P + SCAT * (dis * (~FRONTAL))[:, None]
    if sec == "outro":
        d = t - t_of(108)
        R = 360 * (1 - math.exp(-d / 1.6))
        P = P + SCAT * R + (P - CENTER) * (0.5 * (1 - math.exp(-d / 1.8)))
    # ---- intensity
    alpha = np.where(IS_CTX, st["cortex"], st["deep"]).astype(np.float32)
    if bar < 8:
        alpha = alpha * (0.55 + 0.45 * morph)
    if sec == "break" and bar < 68:
        alpha = np.where(FRONTAL, alpha, alpha * (1 - 0.75 * ease_io((bar - 60) / 6)))
    if st["medial"] > 0.001:
        alpha = np.where(LEFT_CTX, alpha * (1 - 0.95 * st["medial"]), alpha)
        hc = np.where(LEFT_CTX, hc * (1 - 0.95 * st["medial"]), hc)
        h = np.where(LEFT_CTX, h * (1 - 0.95 * st["medial"]), h)
    I = SHADE * alpha * (1 - hc) + (0.55 + 0.45 * SHADE) * h * 1.75
    # facing (front surfaces brighter) and depth cueing
    to_cam = cam.C - P
    to_cam /= np.linalg.norm(to_cam, axis=1, keepdims=True) + 1e-6
    facing = (NRM * to_cam).sum(1)
    I *= np.where(IS_CTX, 0.5 + 0.5 * np.clip(facing * 1.4 + 0.45, 0, 1), 1.0)
    z = (P - cam.C) @ cam.f
    I *= np.clip(1.0 - 0.38 * (z - cam.D) / 100.0, 0.45, 1.5)
    I *= 0.82 + 0.18 * np.sin(PHASE + t * 2.6)
    I *= 1 + 0.22 * kick + 0.35 * heart * (bar < 8 or sec in ("break", "outro"))
    I *= 1 + 0.55 * kick * hc
    I *= (1.0 / st["dist"]) ** 1.25
    if bar < 7.0:
        I *= 1.0 + 5.0 * (1 - morph) ** 1.5
    if sec == "outro":
        d = t - t_of(108)
        I *= (1 + 5.0 * (1 - math.exp(-d / 1.2))) * math.exp(-max(0.0, d - 0.9) / 2.6)
    col = BASE_COL * (1 - hc)[:, None] + HI_COL * hc[:, None]
    if bar < 7.0:
        col = CHAOS_COL * (1 - morph)[:, None] + col * morph[:, None]
    return P, col * I[:, None]


def stream_points(t, cam):
    """network finale: particle streams flowing from PFC subregions to their partners"""
    pts, cols = [], []
    for i, (src, dst, _, _) in enumerate(NETWORKS):
        on = t_of(100) + (2 * i + 1) * BEAT
        if t < on:
            continue
        a, b = C2[src].copy(), C3[dst].copy()
        if src in (4, 5, 6):
            a = centroid(G2 == src)  # midline
        mid = (a + b) / 2
        out = mid - CENTER
        out = out / (np.linalg.norm(out) + 1e-6)
        ctrl = mid + out * 0.45 * np.linalg.norm(b - a) + np.array([0, 0, 22], np.float32)
        n = 1400
        rg = np.random.default_rng(100 + i)
        u0 = rg.random(n)
        jit = rg.normal(0, 1.6, (n, 3)) * (1 + 1.5 * rg.random((n, 1)) ** 4)
        grow = min(1.0, (t - on) / 0.6)
        u = (u0 + (t - on) * 0.55) % 1.0
        u = u * grow
        q = ((1 - u) ** 2)[:, None] * a + (2 * u * (1 - u))[:, None] * ctrl + (u ** 2)[:, None] * b + jit
        inten = (np.sin(np.pi * u) ** 0.5 + 0.25) * 2.6 * (1 + 0.6 * env(KICKS, t, 0.11))
        fl = math.exp(-(t - on) / 0.35)
        inten = inten * (1 + 1.5 * fl)
        if t > t_of(108):
            inten = inten * math.exp(-(t - t_of(108)) / 0.2)
        pts.append(q.astype(np.float32))
        cols.append(inten[:, None] * L[20][None])
    if not pts:
        return None, None
    return np.concatenate(pts), np.concatenate(cols)


def spark_points(t, P):
    i1 = np.searchsorted(SP_T, t, "right")
    i0 = np.searchsorted(SP_T, t - 0.8, "left")
    if i1 <= i0:
        return None, None
    ts, ds, a, b = SP_T[i0:i1], SP_D[i0:i1], SP_A[i0:i1], SP_B[i0:i1]
    u = (t - ts) / ds
    ok = (u >= 0) & (u < 1.25)
    if not ok.any():
        return None, None
    u, a, b = u[ok], a[ok], b[ok]
    pa, pb = P[a], P[b]
    pts, cols = [], []
    for k in range(7):          # head + fading trail
        uk = np.clip(u - k * 0.05, 0, 1)
        q = pa + (pb - pa) * uk[:, None]
        q = q + (q - CENTER) * (0.04 * np.sin(np.pi * uk))[:, None]   # slight outward arc
        inten = (1.0 - k / 7) ** 1.6 * 2.2 * np.clip(1.25 - u, 0, 1) * (u - k * 0.05 > 0)
        pts.append(q)
        cols.append(inten[:, None] * L[10][None])
    return np.concatenate(pts).astype(np.float32), np.concatenate(cols).astype(np.float32)


def dust_points(t):
    q = DUST + DUST_V * t
    q = (q + 750) % 1500 - 750
    q[:, 2] = np.clip(q[:, 2], -500, 500)
    return q + CENTER, (DUST_I * 0.22)[:, None] * L[50][None]


# ======================================================================= overlay (text + HUD)
PART_LABEL = {"p1": ("PART I", "全脑地图", "WHOLE-BRAIN ATLAS"),
              "break": ("PART II", "聚焦前额叶", "PREFRONTAL FOCUS"),
              "p2": ("PART II", "聚焦前额叶", "PREFRONTAL FOCUS"),
              "finale": ("FINALE", "协同网络", "BRAIN NETWORKS")}


def fade_in_out(t, t0, t1, fi=0.12, fo=0.15):
    if t < t0 or t >= t1:
        return 0.0
    return min(1.0, (t - t0) / fi, (t1 - t) / fo)


def draw_card(img, hud, t, tb, idx_text, total_text, zh, en, tag, anchor_xy, mni):
    """left title card with leader line to the region"""
    x0 = 112
    blk_len = 4 * BAR
    a_out = min(1.0, (blk_len - tb) / 0.12)
    a = min(1.0, tb / 0.06) * a_out
    slam = 1.0 + 0.22 * math.exp(-tb / 0.07)
    glitch = max(0.0, 1 - tb / 0.18)
    kick = env(KICKS, t, 0.11)
    # index number
    blit(img, sprite(idx_text, "orb900", 112), x0, 170, L[50], a * 0.95, glow=0.9, glow_col=L[60], glitch=glitch,
         seed=int(t * 30))
    if total_text:
        wnum = text_width(idx_text, "orb900", 112)
        blit(img, sprite(total_text, "orb500", 30), x0 + wnum + 14, 236, L[40], a * 0.8)
    # chinese title (slams in on the downbeat)
    blit(img, sprite(zh, "zh900", 104), x0, 318, WHITE, a, glow=1.1 + 0.6 * kick, glow_col=L[50], scale=slam,
         glitch=glitch * 0.8, seed=int(t * 30) + 7)
    # english title types on in 16ths
    n = len(en)
    rev = min(1.0, max(0.0, (tb - 0.05) / (BEAT * 1.0)))
    blit(img, sprite(en, "orb700", 36, tracking=5), x0 + 2, 470, L[40], a, glow=0.6, glow_col=L[60], reveal=rev)
    # divider + tag
    lw = int(440 * ease_out((tb - 0.05) / 0.35))
    if lw > 2:
        cv2.line(hud, (x0, 540), (x0 + lw, 540), int(200 * a), 2, cv2.LINE_AA)
        cv2.rectangle(hud, (x0, 534), (x0 + 10, 546), int(230 * a), -1, cv2.LINE_AA)
    ta = a * min(1.0, max(0.0, (tb - BEAT) / 0.2))
    blit(img, sprite(tag, "exo500", 24, tracking=3), x0, 560, L[40], ta * 0.9)
    # leader line from the card to the region
    if anchor_xy is not None:
        ax, ay = anchor_xy
        sx, sy = x0 + 440, 540
        g = ease_out((tb - 0.12) / 0.3)
        if g > 0:
            ex, ey = sx + (ax - sx) * g, sy + (ay - sy) * g
            cv2.line(hud, (int(sx), int(sy)), (int(ex), int(ey)), int(170 * a), 1, cv2.LINE_AA)
            if g > 0.98:
                r = int(12 + 5 * kick)
                cv2.circle(hud, (int(ax), int(ay)), r, int(230 * a), 2, cv2.LINE_AA)
                cv2.circle(hud, (int(ax), int(ay)), 3, int(255 * a), -1, cv2.LINE_AA)
                if mni is not None:
                    txt = "MNI  %+d, %+d, %+d" % tuple(int(round(v)) for v in mni)
                    spr = sprite(txt, "exo500", 18, tracking=2)
                    bx, by = int(ax) + 18, int(ay) + 8
                    img[max(0, by):min(H, by + 30), max(0, bx):min(W, bx + spr["w"] + 14)] *= 1 - 0.6 * a
                    blit(img, spr, bx + 7, by + 4, L[20], a * 0.95)


def draw_subtitle(img, t):
    for (t0, t1, zh, en) in CUES:
        a = fade_in_out(t, t0, t1)
        if a > 0:
            lift = 8 * (1 - ease_out((t - t0) / 0.2))
            blit(img, sprite(zh, "zh500", 42), W / 2, 905 + lift, WHITE, a, glow=0.35, glow_col=L[50], anchor="c")
            blit(img, sprite(en, "exo500", 28, tracking=1), W / 2, 972 + lift, L[30], a * 0.95, anchor="c")


def draw_hud_frame(img, hud, t, sec):
    a = 0.0
    if 8 <= t / BAR < 108:
        a = min(1.0, (t - t_of(8)) / 0.3)
    if a <= 0:
        return
    c = int(150 * a)
    m, ln = 44, 46
    for (x, y, dx, dy) in [(m, m, 1, 1), (W - m, m, -1, 1), (m, H - m, 1, -1), (W - m, H - m, -1, -1)]:
        cv2.line(hud, (x, y), (x + dx * ln, y), c, 2, cv2.LINE_AA)
        cv2.line(hud, (x, y), (x, y + dy * ln), c, 2, cv2.LINE_AA)
    lab = PART_LABEL.get(sec)
    if lab:
        blit(img, sprite(lab[0], "orb700", 20, tracking=4), 96, 66, L[40], a)
        blit(img, sprite(lab[1], "zh500", 20), 96, 96, L[20], a * 0.9)
        wz = text_width(lab[1], "zh500", 20)
        blit(img, sprite(lab[2], "exo500", 17, tracking=3), 96 + wz + 14, 98, L[50], a * 0.9)
    blk, k, tb = block_info(t)
    if blk is not None:
        n = 13 if blk == "p1" else 8
        cur = k
        x1 = W - 96
        txt = ("%02d / %02d" % (k + 1, n)) if blk == "p1" else ("PFC" if k == 0 else "%02d / 07" % k)
        blit(img, sprite(txt, "orb700", 22, tracking=3), x1, 66, L[40], a, anchor="r")
        seg = 22
        for i in range(n):
            xx = x1 - (n - i) * (seg + 6) + 6
            val = 230 if i == cur else (120 if i < cur else 50)
            cv2.line(hud, (xx, 108), (xx + seg, 108), int(val * a), 3 if i == cur else 2, cv2.LINE_AA)


def overlay(img, hud, rings, t, cam):
    sec = section(t)
    bar = t / BAR
    gap = in_gap(t)
    kick = env(KICKS, t, 0.11)
    # ---------------- intro title: 人 类 大 脑 on the four beats of bar 4, english types on in bar 5
    if 4 <= bar < 7.75:
        chars = "人类大脑"
        size, trk = 168, 46
        widths = [text_width(c, "zh900", size) for c in chars]
        total = sum(widths) + trk * 3
        x = W / 2 - total / 2
        zoom = 1 + 0.06 * riser_level(t)
        shake = riser_level(t) * 6
        for i, c in enumerate(chars):
            tc = t_of(4, i)
            if t >= tc:
                dt = t - tc
                sc = (1 + 0.5 * math.exp(-dt / 0.06)) * zoom
                cxc = x + widths[i] / 2
                cxc = W / 2 + (cxc - W / 2) * zoom
                blit(img, sprite(c, "zh900", size), cxc + np.sin(t * 61 + i) * shake, 360 - (sc - 1) * 60,
                     WHITE, min(1, dt / 0.04), glow=1.4 + 0.8 * math.exp(-dt / 0.15), glow_col=L[50], anchor="c",
                     scale=sc)
            x += widths[i] + trk
        if bar >= 5:
            en = "THE HUMAN BRAIN"
            rev = min(1.0, (t - t_of(5)) / BAR)
            blit(img, sprite(en, "orb900", 54, tracking=20), W / 2, 590, L[30], 1.0, glow=0.8, glow_col=L[60],
                 anchor="c", reveal=rev, scale=zoom)
    # ---------------- break: PART II title
    if 64 <= bar < 67.625:
        rl = riser_level(t)
        shake = rl * 8
        blit(img, sprite("PART II", "orb700", 30, tracking=10), W / 2, 300, L[40], min(1, (t - t_of(64)) / 0.1),
             glow=0.6, anchor="c")
        chars = "前额叶皮层"
        size, trk = 150, 30
        widths = [text_width(c, "zh900", size) for c in chars]
        total = sum(widths) + trk * (len(chars) - 1)
        x = W / 2 - total / 2
        for i, c in enumerate(chars):
            tc = t_of(65, i * 0.5)
            if t >= tc:
                dt = t - tc
                sc = 1 + 0.45 * math.exp(-dt / 0.06)
                blit(img, sprite(c, "zh900", size), x + widths[i] / 2 + np.sin(t * 57 + i * 2) * shake,
                     380 - (sc - 1) * 50, WHITE, min(1, dt / 0.04), glow=1.3 + rl, glow_col=L[50], anchor="c", scale=sc)
            x += widths[i] + trk
        if bar >= 66:
            rev = min(1.0, (t - t_of(66)) / BAR)
            blit(img, sprite("PREFRONTAL CORTEX", "orb900", 50, tracking=16), W / 2 + np.sin(t * 43) * shake, 580,
                 L[30], 1.0, glow=0.8 + rl, glow_col=L[60], anchor="c", reveal=rev)
    # ---------------- region cards
    blk, k, tb = block_info(t)
    if blk == "p1":
        R = REGIONS[k]
        anchor = cam.project1(C1[k + 1])[:2]
        draw_card(img, hud, t, tb, "%02d" % (k + 1), "/ 13", R[0], R[1], R[2], anchor, C1[k + 1])
    elif blk == "p2" and k > 0:
        R = PFC_SUBS[k - 1]
        anchor = cam.project1(C2[k])[:2]
        draw_card(img, hud, t, tb, "%02d" % k, "/ 07", R[0], R[1], R[2], anchor, C2[k])
    elif blk == "p2" and k == 0:
        R = PFC_OVERVIEW
        draw_card(img, hud, t, tb, "PFC", "", R[0], R[1], R[2], None, None)
        # callout tags, one per clap
        items = []
        for g in range(1, 8):
            sx, sy, _ = cam.project1(C2[g])
            items.append((sy, sx, g))
        items.sort()
        a_out = min(1.0, (4 * BAR - tb) / 0.12)
        for row, (sy, sx, g) in enumerate(items):
            tp = (2 * g - 1) * BEAT
            if tb < tp:
                continue
            dt = tb - tp
            a = min(1.0, dt / 0.05) * a_out
            ty = 250 + row * 92
            tx = 1560
            cv2.line(hud, (int(sx), int(sy)), (tx - 16, ty + 16), int(150 * a), 1, cv2.LINE_AA)
            cv2.circle(hud, (int(sx), int(sy)), 6, int(240 * a), -1, cv2.LINE_AA)
            sc = 1 + 0.3 * math.exp(-dt / 0.06)
            abbr, zh = PFC_SUBS[g - 1][1], PFC_SUBS[g - 1][0]
            blit(img, sprite(abbr, "orb700", 26, tracking=3), tx, ty, WHITE, a, glow=0.9, glow_col=L[50], scale=sc)
            blit(img, sprite(zh, "zh500", 20), tx, ty + 36, L[30], a * 0.9)
    # ---------------- finale legend + slogan
    if sec == "finale":
        if bar < 104:
            tl = t - t_of(100)
            a_out = min(1.0, (t_of(104) - t) / 0.15)
            a = min(1.0, tl / 0.08) * a_out
            blit(img, sprite("协同网络", "zh900", 92), 112, 200, WHITE, a, glow=1.1, glow_col=L[50],
                 scale=1 + 0.2 * math.exp(-tl / 0.07))
            blit(img, sprite("BRAIN NETWORKS", "orb700", 30, tracking=5), 114, 330, L[40], a, glow=0.5)
            for i, (src, dst, zh, en) in enumerate(NETWORKS):
                on = t_of(100) + (2 * i + 1) * BEAT
                if t < on:
                    continue
                dt = t - on
                ai = min(1.0, dt / 0.05) * a_out
                y = 410 + i * 74
                cv2.line(hud, (114, y + 16), (114 + int(34 * ease_out(dt / 0.2)), y + 16), int(220 * ai), 3, cv2.LINE_AA)
                blit(img, sprite(zh, "zh700", 28), 164, y - 4, WHITE, ai, glow=0.5, scale=1 + 0.2 * math.exp(-dt / 0.06))
                wz = text_width(zh, "zh700", 28)
                blit(img, sprite(en, "exo500", 22, tracking=1), 164 + wz + 16, y + 3, L[40], ai)
        else:
            tl = t - t_of(104)
            band = min(1.0, tl / 0.15) * min(1.0, (t_of(107.875) - t) / 0.1)
            img[200:720] *= (1 - 0.6 * band * SLOGAN_BAND)
            chars = "认识大脑"
            size, trk = 120, 24
            widths = [text_width(c, "zh900", size) for c in chars]
            total = sum(widths) + trk * 3
            x = W / 2 - total / 2
            fade = min(1.0, (t_of(107.875) - t) / 0.1)
            for i, c in enumerate(chars):
                tc = t_of(104, i)
                if t >= tc:
                    dt = t - tc
                    sc = 1 + 0.45 * math.exp(-dt / 0.06)
                    blit(img, sprite(c, "zh900", size), x + widths[i] / 2, 330 - (sc - 1) * 40, WHITE,
                         min(1, dt / 0.04) * fade, glow=1.3, glow_col=L[50], anchor="c", scale=sc)
                x += widths[i] + trk
            chars2 = "就是认识你自己"
            size2, trk2 = 84, 14
            widths = [text_width(c, "zh900", size2) for c in chars2]
            total = sum(widths) + trk2 * (len(chars2) - 1)
            x = W / 2 - total / 2
            for i, c in enumerate(chars2):
                tc = t_of(105, i * 0.5)
                if t >= tc:
                    dt = t - tc
                    sc = 1 + 0.4 * math.exp(-dt / 0.06)
                    blit(img, sprite(c, "zh900", size2), x + widths[i] / 2, 480 - (sc - 1) * 30, L[20],
                         min(1, dt / 0.04) * fade, glow=1.1, glow_col=L[50], anchor="c", scale=sc)
                x += widths[i] + trk2
            if bar >= 106:
                rev = min(1.0, (t - t_of(106)) / (BAR * 1.0))
                blit(img, sprite("TO KNOW THE BRAIN IS TO KNOW YOURSELF", "orb700", 34, tracking=8), W / 2, 610,
                     L[30], fade, glow=0.7, glow_col=L[60], anchor="c", reveal=rev)
    # ---------------- outro end card
    if sec == "outro" or bar >= 108:
        tl = t - t_of(108.5)
        if tl > 0:
            a = min(1.0, tl / 0.8) * min(1.0, max(0.0, (DURATION - 0.6 - t) / 1.6))
            blit(img, sprite("人类大脑 · 前额叶皮层", "zh900", 72), W / 2, 400, WHITE, a, glow=1.0, glow_col=L[50], anchor="c")
            blit(img, sprite("THE HUMAN BRAIN  /  PREFRONTAL CORTEX", "orb700", 28, tracking=8), W / 2, 510, L[30], a,
                 glow=0.5, anchor="c")
            cv2.line(hud, (W // 2 - 260, 580), (W // 2 + 260, 580), int(140 * a), 1, cv2.LINE_AA)
            blit(img, sprite("示意性可视化 · 脑区边界为近似划分", "zh400", 22), W / 2, 608, L[40], a * 0.9, anchor="c")
            blit(img, sprite("Schematic visualization · region boundaries are approximate", "exo400", 20, tracking=1),
                 W / 2, 644, L[50], a * 0.9, anchor="c")
            blit(img, sprite("Brain model: fsaverage5 · MNI ICBM152 2009a · Desikan–Killiany atlas", "exo400", 18,
                             tracking=1), W / 2, 720, L[50], a * 0.75, anchor="c")
            blit(img, sprite("Music & particles generated procedurally", "exo400", 18, tracking=1), W / 2, 750,
                 L[50], a * 0.75, anchor="c")
    # ---------------- subtitles
    draw_subtitle(img, t)
    # ---------------- HUD frame
    draw_hud_frame(img, hud, t, sec)
    # ---------------- shockwave rings on crashes / impacts
    for arr, strength in ((CRASH, 0.7), (IMP_T, 1.0)):
        d = since(arr, t)
        if d < 1.0:
            if blk == "p1":
                cxy = cam.project1(C1[k + 1])[:2]
            elif blk == "p2" and k > 0:
                cxy = cam.project1(C2[k])[:2]
            else:
                cxy = (cam.cx, cam.cy)
            r = int(30 + 1100 * ease_out(d / 0.9))
            val = int(150 * strength * (1 - d) ** 2)
            if val > 2:
                cv2.circle(rings, (int(cxy[0]), int(cxy[1])), r, val, 2, cv2.LINE_AA)
                if strength >= 1.0:
                    cv2.circle(rings, (int(cxy[0]), int(cxy[1])), int(r * 0.72), val // 2, 1, cv2.LINE_AA)
    # ---------------- gap: lens streak growing across the silence
    if gap is not None:
        gl = int(W * 0.5 * gap ** 1.5)
        cv2.line(rings, (W // 2 - gl, H // 2), (W // 2 + gl, H // 2), 255, 2, cv2.LINE_AA)


# ======================================================================= frame
def render_frame(t):
    st = camera(t)
    imp, imp_d = impact_env(t, 0.3)
    shake = (imp * 16 * math.sin(t * 53.0), imp * 12 * math.cos(t * 47.0))
    # punch-in zoom on impacts
    if imp_d < 0.6:
        st = dict(st)
        st["dist"] = st["dist"] * (1 - 0.06 * imp)
    cam = Cam(st, shake)
    sec = section(t)
    gap = in_gap(t)

    P, C = particle_frame(t, cam, st)
    pts, cols = [P], [C]
    sp, sc = spark_points(t, P)
    if sp is not None:
        pts.append(sp)
        cols.append(sc * (1.0 / st["dist"]))
    if sec in ("finale", "outro"):
        q, qc = stream_points(t, cam)
        if q is not None:
            pts.append(q)
            cols.append(qc)
    dp, dc = dust_points(t)
    dz = (dp - cam.C) @ cam.f
    pts.append(dp)
    cols.append(dc * np.clip(500 / np.maximum(dz, 1), 0.2, 2.5)[:, None])
    allp, allc = np.concatenate(pts), np.concatenate(cols)
    sx, sy, z = cam.project(allp)
    ok = z > 30
    buf = splat(sx[ok], sy[ok], allc[ok])

    img = background(W * st["cx"]).copy()
    img += buf * 0.55
    img += glow(buf) * 0.42
    flash = 0.08 * env(CRASH, t, 0.10) + (0.32 * imp * math.exp(-imp_d / 0.07) if imp_d < 0.6 else 0.0)
    if flash > 0.003:
        img += flash * L[40]
    img *= VIGNETTE
    img = tonemap(img)
    if gap is not None:
        img *= 0.06 * (1 - gap)
    if any(fade_in_out(t, a, b) > 0 for a, b, _, _ in CUES):
        img[840:] *= (1 - 0.5 * SUB_SHADE[840:])
    hud = np.zeros((H, W), np.uint8)
    rings = np.zeros((H, W), np.uint8)
    overlay(img, hud, rings, t, cam)
    hud_composite(img, hud, L[40], 0.8)
    hud_composite(img, rings, L[40], 1.4, additive=True, sigma=5.0)
    img += GRAIN[int(t * FPS) % len(GRAIN)]
    if t < 0.6:
        img *= t / 0.6
    if t > DURATION - 0.6:
        img *= max(0.0, (DURATION - t) / 0.6)
    return (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)


# ======================================================================= main
def render_range(f0, f1, out_path):
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
           "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-threads", "1",
           out_path]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for f in range(f0, f1):
        p.stdin.write(render_frame(f / FPS).tobytes())
        if (f - f0) % 150 == 0:
            print(f"[{os.getpid()}] frame {f}/{f1}", flush=True)
    p.stdin.close()
    p.wait()


def write_srt(path):
    def ts(x):
        ms = int(round(x * 1000))
        return "%02d:%02d:%02d,%03d" % (ms // 3600000, ms // 60000 % 60, ms // 1000 % 60, ms % 1000)
    items = sorted(CUES)
    extra = [(t_of(4), t_of(7.75), "人类大脑", "THE HUMAN BRAIN"),
             (t_of(65), t_of(67.625), "前额叶皮层", "PREFRONTAL CORTEX"),
             (t_of(104), t_of(107.875), "认识大脑，就是认识你自己", "To know the brain is to know yourself")]
    items = sorted(items + extra)
    with open(path, "w", encoding="utf-8") as fh:
        for i, (a, b, zh, en) in enumerate(items, 1):
            fh.write(f"{i}\n{ts(a)} --> {ts(b)}\n{zh}\n{en}\n\n")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--test", default="")
    ap.add_argument("--outdir", default=os.path.join(HERE, "output"))
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--chunk", default="")
    args = ap.parse_args()
    os.makedirs(args.outdir, exist_ok=True)
    if args.test:
        import time
        for tt in [float(x) for x in args.test.split(",")]:
            t0 = time.time()
            fr = render_frame(tt)
            Image.fromarray(fr).save(os.path.join(args.outdir, f"test_{tt:07.2f}.png"))
            print(f"t={tt:.2f}s rendered in {time.time() - t0:.2f}s")
        sys.exit(0)
    if args.chunk:
        a, b, path = args.chunk.split(":")
        render_range(int(a), int(b), path)
        sys.exit(0)
    nframes = int(round(DURATION * FPS))
    seg = os.path.join(args.outdir, "segments")
    os.makedirs(seg, exist_ok=True)
    bounds = np.linspace(0, nframes, args.workers * 3 + 1).astype(int)
    jobs = [(bounds[i], bounds[i + 1], os.path.join(seg, f"seg_{i:03d}.mp4")) for i in range(len(bounds) - 1)]
    running = []
    for (a, b, path) in jobs:
        while len(running) >= args.workers:
            running = [p for p in running if p.poll() is None]
            if len(running) >= args.workers:
                import time
                time.sleep(1)
        running.append(subprocess.Popen([sys.executable, __file__, "--chunk", f"{a}:{b}:{path}"]))
    for p in running:
        p.wait()
    lst = os.path.join(seg, "list.txt")
    with open(lst, "w") as fh:
        for (_, _, path) in jobs:
            fh.write(f"file '{os.path.abspath(path)}'\n")
    silent = os.path.join(args.outdir, "video_silent.mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", silent],
                   check=True)
    srt = os.path.join(args.outdir, "brain_journey.srt")
    write_srt(srt)
    final = os.path.join(args.outdir, "brain_journey.mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", silent, "-i", os.path.join(HERE, "bgm.wav"),
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", final],
                   check=True)
    print("done:", final)
