"""Stylised brain illustrations (lateral, glass, insula and medial views) drawn
with cairo and numpy, saved as high-resolution RGBA layers.

Coordinates are in a 1000 x 800 unit box, anterior (front of the head) on the
left. Every region is a soft mask; the video composites a neutral base layer
per view plus one highlight layer per region."""

import json
import os
import sys

import cairo
import numpy as np
from PIL import Image
from scipy import ndimage

from palette import L10, L20, L30, L40, L50, L60, L70, L80, L90, L100, rgbf

UW, UH = 1000, 800
S = 2.4                                   # master pixels per unit
PW, PH = int(UW * S), int(UH * S)

OUT = os.path.join(os.path.dirname(__file__), "..", "build", "layers")

# ---------------------------------------------------------------- geometry
CEREBRUM = [(95, 385), (101, 318), (128, 250), (176, 192), (243, 145), (328, 108),
            (430, 86), (535, 80), (640, 92), (735, 124), (820, 178), (885, 250),
            (928, 330), (945, 400), (932, 462), (884, 505), (808, 532), (728, 557),
            (640, 586), (545, 606), (455, 603), (382, 586), (330, 558), (303, 522),
            (298, 492), (284, 480), (232, 474), (168, 462), (122, 435)]
CEREBELLUM = [(652, 590), (700, 550), (780, 528), (860, 518), (915, 545), (928, 605),
              (893, 662), (812, 700), (722, 698), (664, 656)]
BRAINSTEM = [(548, 598), (600, 585), (652, 584), (664, 640), (652, 700), (642, 790),
             (594, 790), (588, 712), (560, 674), (540, 634)]

CENTRAL = [(548, 78), (531, 140), (514, 204), (501, 262), (482, 322), (463, 376), (453, 418)]
PRECENTRAL = [(486, 84), (470, 148), (455, 210), (440, 270), (423, 330), (410, 392)]
POSTCENTRAL = [(612, 90), (593, 150), (577, 214), (563, 270), (549, 326), (536, 388)]
SFS = [(168, 232), (238, 192), (318, 165), (398, 150), (462, 146)]
IFS = [(132, 332), (198, 313), (278, 297), (358, 286), (432, 279)]
SYLVIAN = [(300, 480), (360, 453), (440, 431), (520, 410), (590, 388), (640, 356), (662, 326)]
SYL_RAMI = [[(318, 470), (284, 452), (250, 440)], [(340, 462), (333, 420), (342, 382)]]
STS = [(332, 527), (420, 506), (520, 486), (610, 460), (690, 420), (732, 378)]
ITS = [(382, 572), (480, 557), (580, 537), (680, 512), (760, 492)]
IPS = [(570, 244), (640, 228), (720, 236), (790, 262), (842, 302)]
OCC_S = [[(860, 302), (902, 344)], [(842, 424), (912, 432)], [(800, 160), (790, 192)]]
PO_LINE = [(803, 160), (785, 535)]
TP_END = (792, 372)

# deep structures, lateral projection
THALAMUS = dict(c=(528, 338), r=(60, 34), a=-12)
HYPOTHAL = dict(c=(462, 396), r=(30, 19), a=20)
PUTAMEN = dict(c=(452, 330), r=(56, 38), a=-15)
PALLIDUM = dict(c=(470, 340), r=(28, 22), a=-15)
AMYGDALA = dict(c=(392, 456), r=(24, 17), a=15)
PITUITARY = dict(c=(452, 432), r=(12, 9), a=0)
CAUDATE = [(392, 300), (405, 258), (450, 228), (520, 216), (590, 226), (645, 258),
           (675, 305), (672, 355), (650, 395), (622, 422)]
HIPPO = [(418, 462), (470, 470), (530, 465), (585, 447), (625, 420), (650, 385), (658, 352)]
INSULA = [(338, 458), (372, 392), (430, 352), (510, 342), (585, 362), (615, 392),
          (570, 425), (470, 452), (400, 468)]

# medial (midsagittal) view
CALLOSUM = [(352, 352), (318, 318), (312, 272), (338, 232), (395, 205), (470, 192),
            (550, 192), (620, 206), (672, 236), (692, 272), (672, 302), (640, 292),
            (608, 264), (550, 246), (470, 246), (406, 258), (372, 284), (370, 318), (384, 346)]
UNDER_CC = [(386, 352), (374, 300), (420, 262), (550, 252), (640, 294), (700, 296),
            (722, 340), (700, 445), (560, 470), (400, 425)]
M_THALAMUS = dict(c=(534, 322), r=(58, 34), a=-8)
M_BRAINSTEM = [(522, 372), (588, 366), (618, 410), (642, 470), (652, 540), (644, 620),
               (642, 790), (594, 790), (592, 642), (562, 584), (532, 524), (514, 452)]
M_SULCI = [[(805, 165), (770, 250), (735, 322)], [(735, 322), (800, 365), (870, 386), (938, 392)],
           [(548, 80), (540, 114)], [(470, 122), (462, 90)]]
FORNIX = [(652, 300), (600, 318), (530, 306), (470, 312), (440, 340), (446, 380)]


# ---------------------------------------------------------------- helpers
def catmull(pts, closed=True, n=24):
    p = np.asarray(pts, float)
    if closed:
        p = np.vstack([p[-1], p, p[0], p[1]])
    else:
        p = np.vstack([2 * p[0] - p[1], p, 2 * p[-1] - p[-2]])
    t = np.linspace(0, 1, n, endpoint=False)[:, None]
    out = []
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
        out.append(0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t ** 2
                          + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    if not closed:
        out.append(p[-2][None])
    return np.vstack(out)


def _surface():
    surf = cairo.ImageSurface(cairo.FORMAT_A8, PW, PH)
    ctx = cairo.Context(surf)
    ctx.scale(S, S)
    return surf, ctx


def _to_np(surf):
    surf.flush()
    buf = np.ndarray((PH, surf.get_stride()), np.uint8, surf.get_data())
    return buf[:, :PW].astype(np.float32) / 255.0


def fill_mask(poly):
    surf, ctx = _surface()
    ctx.move_to(*poly[0])
    for pt in poly[1:]:
        ctx.line_to(*pt)
    ctx.close_path()
    ctx.fill()
    return _to_np(surf)


def ellipse_mask(e):
    surf, ctx = _surface()
    ctx.translate(*e["c"])
    ctx.rotate(np.radians(e["a"]))
    ctx.scale(*e["r"])
    ctx.arc(0, 0, 1, 0, 2 * np.pi)
    ctx.fill()
    return _to_np(surf)


def ellipse_poly(e, n=90):
    t = np.linspace(0, 2 * np.pi, n, endpoint=False)
    a = np.radians(e["a"])
    x, y = e["r"][0] * np.cos(t), e["r"][1] * np.sin(t)
    return np.stack([e["c"][0] + x * np.cos(a) - y * np.sin(a),
                     e["c"][1] + x * np.sin(a) + y * np.cos(a)], 1)


def stroke_mask(lines, width, closed=False):
    surf, ctx = _surface()
    ctx.set_line_width(width)
    ctx.set_line_cap(cairo.LINE_CAP_ROUND)
    ctx.set_line_join(cairo.LINE_JOIN_ROUND)
    for ln in lines:
        ctx.move_to(*ln[0])
        for pt in ln[1:]:
            ctx.line_to(*pt)
        if closed:
            ctx.close_path()
        ctx.new_sub_path()
    ctx.stroke()
    return _to_np(surf)


def tube_mask(center, r0, r1):
    pts = catmull(center, closed=False, n=30)
    surf, ctx = _surface()
    for i, (x, y) in enumerate(pts):
        r = r0 + (r1 - r0) * i / (len(pts) - 1)
        ctx.arc(x, y, r, 0, 2 * np.pi)
        ctx.fill()
    return _to_np(surf)


def blur(a, sigma_px):
    return ndimage.gaussian_filter(a, sigma_px, mode="constant")


XG, YG = np.meshgrid((np.arange(PW) + 0.5) / S, (np.arange(PH) + 0.5) / S)


def interp_y(pts, extend=True):
    """x as a function of y along a roughly vertical polyline."""
    pts = sorted(pts, key=lambda p: p[1])
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    if extend:
        ys = [-100] + ys + [1000]
        xs = [xs[0] - (xs[1] - xs[0]) / (ys[2] - ys[1]) * (ys[1] + 100)] + xs + [xs[-1]]
    return np.interp(YG, ys, xs)


def interp_x(pts):
    pts = sorted(pts, key=lambda p: p[0])
    return np.interp(XG, [p[0] for p in pts], [p[1] for p in pts])


def soft(b, sigma=1.1):
    return blur(b.astype(np.float32), sigma)


# ---------------------------------------------------------------- textures
def labyrinth(seed, s1=5.2, s2=11.0, iters=34):
    """Turing-style labyrinth stripes: reads as gyri and sulci."""
    rng = np.random.default_rng(seed)
    h, w = PH // 2, PW // 2
    x = rng.standard_normal((h, w)).astype(np.float32)
    for _ in range(iters):
        x = ndimage.gaussian_filter(x, s1) - ndimage.gaussian_filter(x, s2)
        x = np.tanh(3.0 * x / (x.std() + 1e-6))
    x = ndimage.gaussian_filter(x, 1.0)
    return ndimage.zoom(x, 2, order=1)[:PH, :PW]


def iso_lines(p, width_px):
    gy, gx = np.gradient(p)
    g = np.sqrt(gx * gx + gy * gy) + 1e-4
    return np.clip(1.0 - np.abs(p) / g / width_px, 0, 1)


def folia(mask, spacing_units=13.0, width_px=2.0):
    d = ndimage.distance_transform_edt(mask > 0.5) / S
    wob = blur(np.random.default_rng(7).standard_normal(mask.shape).astype(np.float32), 30) * 40
    p = np.sin((d + wob) / spacing_units * 2 * np.pi)
    return iso_lines(p, width_px) * (d > 4)


# ---------------------------------------------------------------- layers
class Layer:
    def __init__(self):
        self.rgb = np.zeros((PH, PW, 3), np.float32)   # premultiplied
        self.a = np.zeros((PH, PW), np.float32)

    def over(self, color, alpha):
        alpha = np.clip(alpha, 0, 1).astype(np.float32)
        if isinstance(color, str):
            color = np.array(rgbf(color), np.float32)
        col = color if color.ndim == 3 else color[None, None, :]
        self.rgb = col * alpha[..., None] + self.rgb * (1 - alpha[..., None])
        self.a = alpha + self.a * (1 - alpha)

    def save(self, name):
        a = np.clip(self.a, 0, 1)
        rgb = np.where(a[..., None] > 1e-4, self.rgb / np.maximum(a[..., None], 1e-4), 0)
        img = np.dstack([np.clip(rgb, 0, 1), a])
        Image.fromarray((img * 255 + 0.5).astype(np.uint8), "RGBA").save(
            os.path.join(OUT, name + ".png"), compress_level=1)


def vgrad(c_top, c_bot, y0=80, y1=620):
    t = np.clip((YG - y0) / (y1 - y0), 0, 1)[..., None]
    a, b = np.array(rgbf(c_top), np.float32), np.array(rgbf(c_bot), np.float32)
    return a * (1 - t) + b * t


def draw_body(layer, mask, top, bot, lines, line_col, line_a, rim_col, rim_a, shade=None):
    col = vgrad(top, bot)
    if shade is not None:
        col = col * (0.84 + 0.16 * shade[..., None])
    layer.over(col, mask * 0.97)
    layer.over(line_col, lines * mask * line_a)
    rim = np.clip(mask - blur(mask, 16), 0, 1) * 2.2
    layer.over(rim_col, np.clip(rim, 0, 1) * rim_a)


def outline(layer, mask, col, width_px=4.5, glow_col=L50, glow_a=0.55):
    edge = np.clip(mask - blur(mask, width_px * 0.5), 0, 1)
    edge = np.clip(edge * 3.2, 0, 1) * (mask > 0.02)
    glow = blur(mask, 16) * (1 - mask)
    layer.over(glow_col, np.clip(glow * 2.0, 0, 1) * glow_a)
    layer.over(col, edge)


def highlight(mask, gyri, name, fill_a=0.5, meta=None):
    lay = Layer()
    m = np.clip(mask, 0, 1)
    outer = blur(m, 26) * (1 - m)
    outer = outer / (outer.max() + 1e-6)
    lay.over(L40, outer * 0.85)
    inner = np.clip(m - blur(m, 20), 0, 1)
    lay.over(vgrad(L50, L60), m * fill_a)
    lay.over(L30, np.clip(inner * 1.6, 0, 1) * 0.55)
    lay.over(L10, gyri * m * 0.42)
    edge = np.clip((m - blur(m, 2.2)) * 3.5, 0, 1) * (m > 0.05)
    lay.over(L10, edge)
    lay.save("hl_" + name)
    if meta is not None:
        ys, xs = np.nonzero(m > 0.5)
        meta[name] = dict(cx=float(xs.mean() / S), cy=float(ys.mean() / S),
                          x0=float(xs.min() / S), x1=float(xs.max() / S),
                          y0=float(ys.min() / S), y1=float(ys.max() / S))


def main():
    os.makedirs(OUT, exist_ok=True)
    meta = {}
    print("masks...", flush=True)
    cer = fill_mask(catmull(CEREBRUM))
    cbl = fill_mask(catmull(CEREBELLUM))
    bst = fill_mask(catmull(BRAINSTEM))

    # lobes by geometric rules
    cs = interp_y(CENTRAL)
    po = np.interp(YG, [PO_LINE[0][1], PO_LINE[1][1]], [PO_LINE[0][0], PO_LINE[1][0]])
    syl = interp_x(SYLVIAN[:-1] + [TP_END])
    occ_b = XG > po
    tem_b = (~occ_b) & (XG >= 296) & (YG > syl)
    fro_b = (~occ_b) & (~tem_b) & (XG < cs)
    par_b = (~occ_b) & (~tem_b) & (~fro_b)
    lobes = {k: soft(b) * cer for k, b in
             dict(frontal=fro_b, parietal=par_b, temporal=tem_b, occipital=occ_b).items()}

    # lateral PFC subregions
    pre = interp_y(PRECENTRAL)
    pm = pre - np.interp(YG, [100, 380], [80, 15])
    sfs, ifs = interp_x(SFS), interp_x(IFS)
    ifs = np.where(XG < 132, 332, ifs)
    sfs = np.where(XG < 168, 232, sfs)
    pfc_b = fro_b & (XG < pm)
    fpc_b = pfc_b & (((XG - 100) / 96) ** 2 + ((YG - 362) / 128) ** 2 < 1)
    ofc_b = pfc_b & ~fpc_b & (YG > 392 + 0.2 * (XG - 100))
    vl_b = pfc_b & ~fpc_b & ~ofc_b & (YG > ifs)
    dl_b = pfc_b & ~fpc_b & ~ofc_b & (YG <= ifs) & (YG > sfs - 24)
    motor_b = fro_b & ~pfc_b
    sub = {k: soft(b) * cer for k, b in
           dict(dlpfc=dl_b, vlpfc=vl_b, fpc=fpc_b, ofc=ofc_b, pfc_lat=pfc_b, motor=motor_b).items()}

    print("textures...", flush=True)
    lab = labyrinth(11)
    gyri = iso_lines(lab, 2.4)
    shade = lab
    lab_m = labyrinth(23)
    gyri_m = iso_lines(lab_m, 2.4)

    major = stroke_mask([catmull(l, False) for l in
                         [CENTRAL, PRECENTRAL[:3], PRECENTRAL[3:], POSTCENTRAL, SFS, IFS,
                          SYLVIAN, STS, ITS, IPS] + SYL_RAMI + OCC_S], 3.0) * cer
    fol = folia(cbl)

    # ----------------------------------------------------------- lateral base
    print("lateral...", flush=True)
    base = Layer()
    draw_body(base, bst, L80, L90, stroke_mask([[(568, 640), (650, 640)], [(560, 660), (655, 662)],
                                                  [(610, 700), (612, 790)]], 1.6), L50, 0.5, L40, 0.35)
    outline(base, bst, L40, glow_a=0.3)
    draw_body(base, cbl, L80, L90, fol, L50, 0.65, L40, 0.4)
    outline(base, cbl, L40, glow_a=0.3)
    draw_body(base, cer, L70, L90, gyri, L50, 0.42, L50, 0.35, shade)
    base.over(L50, blur(major, 5) * 0.8)
    base.over(L30, major * 0.8)
    outline(base, cer, L30)
    base.save("base_lateral")

    for k, m in lobes.items():
        highlight(m, gyri, k, meta=meta)
    highlight(cbl, fol, "cerebellum", meta=meta)
    highlight(bst, np.zeros_like(bst), "brainstem", meta=meta)
    for k in ("dlpfc", "vlpfc", "fpc", "ofc"):
        highlight(sub[k], gyri, k, meta=meta)
    highlight(sub["pfc_lat"], gyri, "pfc_lat", fill_a=0.42, meta=meta)
    highlight(sub["motor"], gyri, "motor", fill_a=0.3, meta=meta)

    # ----------------------------------------------------------- insula view
    print("insula...", flush=True)
    ins = fill_mask(catmull(INSULA))
    fan = stroke_mask([[(352, 452), (380 + 60 * i, 350 + 4 * abs(i - 3))] for i in range(5)], 2.0) * ins
    lay = Layer()
    draw_body(lay, bst, L80, L90, np.zeros_like(bst), L50, 0, L40, 0.35)
    outline(lay, bst, L40, glow_a=0.3)
    draw_body(lay, cbl, L80, L90, fol, L50, 0.65, L40, 0.4)
    outline(lay, cbl, L40, glow_a=0.3)
    window = blur(ins, 30) * 1.8
    body = cer * (1 - np.clip(window, 0, 0.72))
    draw_body(lay, body, L70, L90, gyri, L50, 0.42, L50, 0.3, shade)
    lay.over(L40, major * 0.6 * (1 - np.clip(window, 0, 0.8)))
    lay.over(L60, ins * 0.35)
    lay.over(L40, fan * 0.5)
    outline(lay, cer, L30)
    lay.save("base_insula")
    highlight(ins, fan, "insula", meta=meta)

    # ----------------------------------------------------------- glass view
    print("glass...", flush=True)
    deep = dict(thalamus=ellipse_mask(THALAMUS), hypothalamus=np.maximum(ellipse_mask(HYPOTHAL), ellipse_mask(PITUITARY)),
                putamen=ellipse_mask(PUTAMEN), pallidum=ellipse_mask(PALLIDUM),
                caudate=tube_mask(CAUDATE, 30, 8), amygdala=ellipse_mask(AMYGDALA),
                hippocampus=tube_mask(HIPPO, 22, 9))
    stalk = stroke_mask([[(462, 410), (455, 428)]], 5)
    deep["hypothalamus"] = np.maximum(deep["hypothalamus"], stalk)
    deep["basal"] = np.maximum.reduce([deep["putamen"], deep["caudate"], deep["pallidum"]])
    hippo_lines = stroke_mask([catmull(HIPPO, False)], 1.4) * deep["hippocampus"]

    lay = Layer()
    draw_body(lay, bst, L80, L90, np.zeros_like(bst), L50, 0, L40, 0.3)
    outline(lay, bst, L40, glow_a=0.25)
    draw_body(lay, cbl, L80, L90, fol, L50, 0.5, L40, 0.3)
    outline(lay, cbl, L40, glow_a=0.25)
    lay.over(vgrad(L80, L90), cer * 0.55)
    lay.over(L50, gyri * cer * 0.16)
    lay.over(L40, major * 0.22)
    order = ["caudate", "putamen", "pallidum", "thalamus", "hypothalamus", "hippocampus", "amygdala"]
    for k in order:
        m = deep[k]
        lay.over(vgrad(L60, L70), m * 0.78)
        lay.over(L40, np.clip((m - blur(m, 2.0)) * 3.0, 0, 1) * (m > 0.05) * 0.9)
    lay.over(L40, hippo_lines * 0.5)
    outline(lay, cer, L30, glow_a=0.4)
    lay.save("base_glass")
    for k in ("thalamus", "hypothalamus", "hippocampus", "amygdala", "basal"):
        highlight(deep[k], hippo_lines if k == "hippocampus" else np.zeros_like(cer), k, fill_a=0.7, meta=meta)

    # ----------------------------------------------------------- medial view
    print("medial...", flush=True)
    cc = fill_mask(catmull(CALLOSUM))
    under = fill_mask(catmull(UNDER_CC))
    dist = ndimage.distance_transform_edt(cc < 0.5) / S
    band_b = (dist > 0) & (dist < 58) & (cer > 0.5) & (under < 0.5) & (cc < 0.5)
    band = soft(band_b) * cer
    acc = soft(band_b & (XG < 452), 2.5) * cer
    pcc = soft(band_b & (XG > 572), 2.5) * cer
    mf_b = (cer > 0.5) & (XG < 560) & ~band_b & (cc < 0.5) & (under < 0.5)
    dm_b = mf_b & (XG <= 425) & (YG < 296) & (dist >= 58)
    vm_b = mf_b & (XG < 382) & (YG >= 296) & ~tem_b
    sma_b = mf_b & (XG > 425) & (YG < 300)
    med = dict(dmpfc=soft(dm_b, 2.5) * cer, vmpfc=soft(vm_b, 2.5) * cer, acc=acc, pcc=pcc, sma=soft(sma_b) * cer)
    mth = ellipse_mask(M_THALAMUS)
    mbs = fill_mask(catmull(M_BRAINSTEM))
    band_edges = np.clip((band - blur(band, 2.0)) * 3.0, 0, 1) * (band > 0.05)
    cc_lines = iso_lines(np.sin(XG / 7.0), 1.2) * cc
    msulci = stroke_mask([catmull(l, False) for l in M_SULCI], 3.0) * cer
    fornix = stroke_mask([catmull(FORNIX, False)], 6) * (1 - cc)

    lay = Layer()
    draw_body(lay, cbl, L80, L90, fol, L50, 0.55, L40, 0.4)
    outline(lay, cbl, L40, glow_a=0.3)
    gm = cer * (1 - under * 0.0)
    draw_body(lay, gm, L70, L90, gyri_m * (1 - band) * (1 - under), L50, 0.42, L50, 0.35, lab_m)
    lay.over(L80, blur(under, 8) * 0.6)
    lay.over(L40, band_edges * 0.85)
    lay.over(L50, blur(msulci, 5) * 0.8)
    lay.over(L30, msulci * 0.8)
    lay.over(vgrad(L50, L60), cc * 0.9)
    lay.over(L40, cc_lines * 0.35)
    lay.over(L30, np.clip((cc - blur(cc, 2.0)) * 3, 0, 1) * (cc > 0.05))
    lay.over(L60, fornix * 0.7)
    lay.over(vgrad(L60, L70), mth * 0.85)
    lay.over(L40, np.clip((mth - blur(mth, 2.0)) * 3, 0, 1) * (mth > 0.05))
    draw_body(lay, mbs, L80, L90, stroke_mask([[(600, 400), (612, 780)]], 1.4), L50, 0.5, L40, 0.4)
    outline(lay, mbs, L40, glow_a=0.25)
    outline(lay, cer, L30)
    lay.save("base_medial")
    for k, m in med.items():
        highlight(m, gyri_m, k, meta=meta)

    with open(os.path.join(OUT, "meta.json"), "w") as f:
        json.dump(meta, f, indent=1)
    print("done", flush=True)


if __name__ == "__main__":
    sys.exit(main())
