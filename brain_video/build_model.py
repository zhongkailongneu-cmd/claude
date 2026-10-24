"""Build the particle model of the brain used by the renderer.

Sources (all in MNI-like space, millimetres; x=right, y=anterior, z=superior):
  * fsaverage5 pial surfaces + Desikan-Killiany (DK) surface labels -> cortex
  * DK volumetric atlas (MNI152, 1 mm)                              -> deep nuclei, brainstem
  * MNI ICBM152 2009a GM/WM probability maps                         -> cerebellum, corpus callosum
  * Hypothalamus: two small ellipsoids (not in DK), placed from published MNI coordinates

Output: model.npz with per-particle position, normal, shading, category and region groups.
"""
import os
import numpy as np
import nibabel as nib
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
rng = np.random.default_rng(7)

# ---------------------------------------------------------------- DK label table
names = {}
for line in open(os.path.join(DATA, "atlas-desikankilliany.csv")).read().strip().splitlines()[1:]:
    i, lab, hemi, _ = line.split(",")
    names[int(i)] = (lab, hemi)


def ids(*labs):
    return [i for i, (lab, _) in names.items() if lab in labs]


CEREBELLUM, HYPOTHAL, CALLOSUM = 90, 91, 92

# P1 groups (whole-brain tour) -> list of DK / extra ids
P1 = {
    1: ids("superiorfrontal", "rostralmiddlefrontal", "caudalmiddlefrontal", "parsopercularis",
           "parstriangularis", "parsorbitalis", "lateralorbitofrontal", "medialorbitofrontal",
           "precentral", "paracentral", "frontalpole"),
    2: ids("superiorparietal", "inferiorparietal", "supramarginal", "postcentral", "precuneus"),
    3: ids("superiortemporal", "middletemporal", "inferiortemporal", "bankssts", "fusiform",
           "transversetemporal", "entorhinal", "temporalpole", "parahippocampal"),
    4: ids("lateraloccipital", "lingual", "cuneus", "pericalcarine"),
    5: ids("insula"),
    6: [CALLOSUM],
    7: ids("thalamusproper"),
    8: [HYPOTHAL],
    9: ids("caudate", "putamen", "pallidum", "accumbensarea"),
    10: ids("hippocampus"),
    11: ids("amygdala"),
    12: [CEREBELLUM],
    13: ids("brainstem"),
}

# ---------------------------------------------------------------- cortex (surface)
def load_surf(h):
    s = nib.load(os.path.join(DATA, f"fsaverage5-pial-{h}.surf.gii.gz"))
    v, f = s.darrays[0].data.astype(np.float64), s.darrays[1].data.astype(np.int64)
    lab = nib.load(os.path.join(DATA, f"atlas-desikankilliany-{h}.label.gii.gz")).darrays[0].data.astype(int)
    sulc = nib.load(os.path.join(DATA, "sulc_left.gii.gz" if h == "lh" else "sulc_right.gii.gz")).darrays[0].data
    return v, f, lab, sulc


def sample_surface(h, n):
    v, f, lab, sulc = load_surf(h)
    a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
    cr = np.cross(b - a, c - a)
    area = 0.5 * np.linalg.norm(cr, axis=1)
    fn = cr / (2 * area[:, None] + 1e-9)
    # keep faces whose three vertices are labelled cortex (drop medial wall, label 0)
    ok = (lab[f] > 0).all(1)
    p = area * ok
    tri = rng.choice(len(f), size=n, p=p / p.sum())
    r1, r2 = rng.random(n), rng.random(n)
    s1 = np.sqrt(r1)
    w = np.stack([1 - s1, s1 * (1 - r2), s1 * r2], 1)
    pos = (w[:, :, None] * v[f[tri]]).sum(1)
    vert = f[tri, np.argmax(w, 1)]
    sul = (w * sulc[f[tri]]).sum(1)
    nrm = fn[tri]
    # orient normals outward (away from hemisphere centre)
    ctr = v.mean(0)
    flip = ((pos - ctr) * nrm).sum(1) < 0
    if flip.mean() > 0.5:
        nrm = -nrm
    return pos, nrm, lab[vert], sul


cortex = []
for h in ("lh", "rh"):
    pos, nrm, lab, sul = sample_surface(h, 92000)
    cortex.append((pos, nrm, lab, sul))
c_pos = np.concatenate([c[0] for c in cortex])
c_nrm = np.concatenate([c[1] for c in cortex])
c_lab = np.concatenate([c[2] for c in cortex])
c_sul = np.concatenate([c[3] for c in cortex])
# gyral crowns bright, sulcal fundi dim
c_shade = 0.35 + 0.65 / (1 + np.exp(2.6 * c_sul))

# ---------------------------------------------------------------- volumes
dk_img = nib.load(os.path.join(DATA, "atlas-desikankilliany.nii.gz"))
dk = np.asarray(dk_img.dataobj).astype(int)
dk_aff = dk_img.affine
gm_img = nib.load(os.path.join(DATA, "mni_icbm152_gm_tal_nlin_sym_09a_converted.nii.gz"))
gm = gm_img.get_fdata() / 255.0
wm = nib.load(os.path.join(DATA, "mni_icbm152_wm_tal_nlin_sym_09a_converted.nii.gz")).get_fdata() / 255.0
t_aff = gm_img.affine
# DK resampled onto the template grid (both 1 mm, axis aligned)
off = (dk_aff[:3, 3] - t_aff[:3, 3]).astype(int)
dkt = np.zeros(gm.shape, int)
dkt[off[0]:off[0] + dk.shape[0], off[1]:off[1] + dk.shape[1], off[2]:off[2] + dk.shape[2]] = dk


def vox_to_world(idx, aff):
    return idx @ aff[:3, :3].T + aff[:3, 3]


def sample_mask(mask, aff, n, interior=0.25):
    """Sample n points in a voxel mask, favouring the boundary so the shape reads clearly."""
    er = ndimage.binary_erosion(mask)
    bnd = mask & ~er
    idx_b, idx_i = np.argwhere(bnd), np.argwhere(er)
    wts = np.concatenate([np.ones(len(idx_b)), np.full(len(idx_i), interior)])
    allidx = np.concatenate([idx_b, idx_i]) if len(idx_i) else idx_b
    pick = rng.choice(len(allidx), size=n, p=wts / wts.sum())
    pts = vox_to_world(allidx[pick] + rng.random((n, 3)) - 0.5, aff)
    ctr = pts.mean(0)
    nrm = pts - ctr
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-9
    return pts, nrm


vol = []  # (pos, nrm, dk_label, category, shade)


def add(mask, aff, n, label, cat, shade=0.85, interior=0.25):
    p, nn = sample_mask(mask, aff, n, interior)
    vol.append((p, nn, np.full(n, label), np.full(n, cat), np.full(n, shade)))


budget = {"thalamusproper": 2600, "caudate": 1700, "putamen": 2000, "pallidum": 800,
          "accumbensarea": 350, "hippocampus": 2300, "amygdala": 1200}
for i, (lab, hemi) in names.items():
    if lab in budget:
        add(dk == i, dk_aff, budget[lab], i, 1)
add(dk == ids("brainstem")[0], dk_aff, 11000, ids("brainstem")[0], 3, interior=0.15)

# cerebellum: brain tissue below the tentorium that DK does not label
X, Y, Z = np.meshgrid(*[np.arange(s) for s in gm.shape], indexing="ij")
wx, wy, wz = X + t_aff[0, 3], Y + t_aff[1, 3], Z + t_aff[2, 3]
tissue = (gm + wm) > 0.45
labelled = ndimage.binary_dilation(dkt > 0, iterations=2)
cand = tissue & ~labelled & (wy < -30) & (wz < 8)
lab_cc, ncomp = ndimage.label(cand)
sizes = ndimage.sum(cand, lab_cc, range(1, ncomp + 1))
cereb = lab_cc == (np.argmax(sizes) + 1)
cereb = ndimage.binary_closing(cereb, iterations=1)
cb_gm = cereb & (gm > 0.5)
cb_wm = cereb & (wm > 0.55)
p, nn = sample_mask(cb_gm, t_aff, 30000, interior=0.9)
vol.append((p, nn, np.full(len(p), CEREBELLUM), np.full(len(p), 2), np.full(len(p), 0.8)))
p, nn = sample_mask(cb_wm, t_aff, 7000, interior=0.6)   # arbor vitae
vol.append((p, nn, np.full(len(p), CEREBELLUM), np.full(len(p), 2), np.full(len(p), 1.0)))

# corpus callosum: midline white-matter arch, extended a little laterally
mid = (wm > 0.75) & (np.abs(wx) <= 2) & (wy > -45) & (wy < 38) & (wz > -2) & (wz < 36)
lab_m, nm = ndimage.label(mid)
sizes = ndimage.sum(mid, lab_m, range(1, nm + 1))
arch2d = (lab_m == (np.argmax(sizes) + 1)).any(0)          # (y,z) footprint of the arch
cc = np.zeros_like(mid)
for xi in range(gm.shape[0]):
    if abs(wx[xi, 0, 0]) <= 11:
        cc[xi] = arch2d & (wm[xi] > 0.6)
add(cc, t_aff, 6500, CALLOSUM, 4, shade=0.9, interior=0.5)

# hypothalamus (not in DK): paired ellipsoids flanking the third ventricle
for sx in (-1, 1):
    c0 = np.array([4.5 * sx, -5.0, -11.0])
    r = np.array([3.6, 6.5, 4.6])
    u = rng.normal(size=(700, 3))
    u /= np.linalg.norm(u, axis=1, keepdims=True)
    rad = rng.random(700) ** 0.35
    pts = c0 + u * r * rad[:, None]
    vol.append((pts, u, np.full(700, HYPOTHAL), np.full(700, 1), np.full(700, 0.9)))

v_pos = np.concatenate([v[0] for v in vol])
v_nrm = np.concatenate([v[1] for v in vol])
v_lab = np.concatenate([v[2] for v in vol])
v_cat = np.concatenate([v[3] for v in vol])
v_sh = np.concatenate([v[4] for v in vol])

pos = np.concatenate([c_pos, v_pos]).astype(np.float32)
nrm = np.concatenate([c_nrm, v_nrm]).astype(np.float32)
lab = np.concatenate([c_lab, v_lab]).astype(np.int16)
cat = np.concatenate([np.zeros(len(c_pos), int), v_cat]).astype(np.int8)
shade = np.concatenate([c_shade, v_sh]).astype(np.float32)
N = len(pos)

# ---------------------------------------------------------------- groups
g1 = np.zeros(N, np.int8)
for g, lst in P1.items():
    g1[np.isin(lab, lst)] = g


def is_(*labs):
    return np.isin(lab, ids(*labs))


x, y, z = pos[:, 0], pos[:, 1], pos[:, 2]
ctx = cat == 0
pfc_lat = is_("superiorfrontal", "rostralmiddlefrontal", "caudalmiddlefrontal", "parsopercularis",
              "parstriangularis", "parsorbitalis", "lateralorbitofrontal", "medialorbitofrontal",
              "frontalpole", "rostralanteriorcingulate", "caudalanteriorcingulate")
FPC = ctx & pfc_lat & (y > 52) & (z > -14) & ~is_("rostralanteriorcingulate", "caudalanteriorcingulate")
DLPFC = ctx & (is_("rostralmiddlefrontal", "caudalmiddlefrontal") | (is_("superiorfrontal") & (np.abs(x) >= 14))) & (y > 8)
VLPFC = ctx & is_("parsopercularis", "parstriangularis", "parsorbitalis")
OFC = ctx & is_("lateralorbitofrontal")
VMPFC = ctx & (is_("medialorbitofrontal") | (is_("rostralanteriorcingulate") & (z < 2)))
ACC = ctx & (is_("caudalanteriorcingulate") | (is_("rostralanteriorcingulate") & (z >= 2)))
DMPFC = ctx & is_("superiorfrontal") & (np.abs(x) < 14) & (y > 18) & (z > 8)
g2 = np.zeros(N, np.int8)
# order used in the film: 1 DLPFC, 2 VLPFC, 3 OFC, 4 VMPFC, 5 ACC, 6 DMPFC, 7 FPC (FPC wins overlaps)
for g, m in [(1, DLPFC), (2, VLPFC), (3, OFC), (4, VMPFC), (5, ACC), (6, DMPFC), (7, FPC)]:
    g2[m] = g

# extra target groups for the network finale (left hemisphere unless midline)
g3 = np.zeros(N, np.int8)
g3[is_("inferiorparietal", "superiorparietal") & (x < 0)] = 1      # posterior parietal
g3[is_("insula") & (x < 0)] = 2
g3[is_("amygdala") & (x < 0)] = 3
g3[is_("caudate", "putamen", "accumbensarea") & (x < 0)] = 4        # striatum
g3[is_("posteriorcingulate", "precuneus", "isthmuscingulate") & (x > 0)] = 5
g3[is_("superiortemporal", "bankssts") & (x < 0)] = 6

# per-particle randoms used by the renderer
phase = rng.random(N).astype(np.float32) * 6.2832
tone = rng.choice(3, size=N, p=[0.45, 0.35, 0.20]).astype(np.int8)
scatter = rng.normal(size=(N, 3)).astype(np.float32)
scatter /= np.linalg.norm(scatter, axis=1, keepdims=True)
# chaos cloud for the intro: a flattened spiral galaxy around the brain
r = 18 + 300 * rng.random(N) ** 1.35
th = rng.random(N) * 2 * np.pi
arm = (np.floor(rng.random(N) * 3) * 2 * np.pi / 3)
ang = th * 0.18 + arm + r / 65
chaos = np.stack([r * np.cos(ang), r * np.sin(ang), rng.normal(0, 6 + r * 0.05, N)], 1).astype(np.float32)
delay = rng.random(N).astype(np.float32)

np.savez_compressed(os.path.join(HERE, "model.npz"), pos=pos, nrm=nrm, lab=lab, cat=cat, shade=shade,
                    g1=g1, g2=g2, g3=g3, phase=phase, tone=tone, scatter=scatter, chaos=chaos, delay=delay)
print("particles", N, {k: int(v) for k, v in zip(["cortex", "deep", "cereb", "stem", "cc"], np.bincount(cat))})
print("g1", np.bincount(g1, minlength=14).tolist())
print("g2", np.bincount(g2, minlength=8).tolist())
print("g3", np.bincount(g3, minlength=7).tolist())
print("extent", pos.min(0).round(1), pos.max(0).round(1))
