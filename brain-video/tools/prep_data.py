#!/usr/bin/env python3
"""Build the binary mesh bundle used by the renderer (assets/brain.bin + assets/brain.json).

Inputs (all open data shipped inside PyPI wheels, nothing is downloaded at run time):
  * hcp_utils/data      -> HCP S1200 fsLR-32k pial surfaces, sulcal depth, Glasser HCP-MMP1.0 parcellation
  * abagen atlas volume -> Desikan-Killiany + aseg style 1 mm MNI volume (thalamus, basal ganglia, hippocampus, ...)

Usage:
  python -I tools/prep_data.py --hcp <hcp_utils/data dir> --dk <atlas-desikankilliany.nii.gz> \
         --regions src/regions.json --out assets

Coordinates: MNI mm (x right, y anterior, z superior) are rotated to three.js axes (x, z, -y), a proper
rotation, so triangle winding is preserved.
"""
import argparse
import json
import os

import nibabel as nib
import numpy as np
import scipy.sparse as sp
from scipy.ndimage import gaussian_filter
from skimage import measure

# --------------------------------------------------------------------------------------------- helpers


def to_three(p):
    """MNI (x, y, z) -> three.js (x, z, -y)."""
    p = np.asarray(p, dtype=np.float64)
    return np.stack([p[..., 0], p[..., 2], -p[..., 1]], axis=-1)


def vertex_normals(v, f):
    fn = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])  # area-weighted
    n = np.zeros_like(v)
    for k in range(3):
        np.add.at(n, f[:, k], fn)
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    return n / np.maximum(ln, 1e-12)


def adjacency(nv, f):
    i = np.concatenate([f[:, 0], f[:, 1], f[:, 2], f[:, 1], f[:, 2], f[:, 0]])
    j = np.concatenate([f[:, 1], f[:, 2], f[:, 0], f[:, 0], f[:, 1], f[:, 2]])
    a = sp.coo_matrix((np.ones(len(i)), (i, j)), shape=(nv, nv)).tocsr()
    a.data[:] = 1.0
    return a


def smooth(v, f, iters, lam=0.5, mu=-0.53):
    """Taubin (shrink-free) Laplacian smoothing."""
    a = adjacency(len(v), f)
    deg = np.asarray(a.sum(1)).ravel()
    inv = sp.diags(1.0 / np.maximum(deg, 1))
    lap = inv @ a
    v = v.copy()
    for _ in range(iters):
        v += lam * (lap @ v - v)
        v += mu * (lap @ v - v)
    return v


class Pack:
    """Concatenate typed arrays into one binary blob and record offsets in a JSON manifest."""

    def __init__(self):
        self.chunks, self.items, self.pos = [], {}, 0

    def add(self, name, arr, dtype):
        arr = np.ascontiguousarray(arr, dtype=dtype)
        pad = (-self.pos) % 4
        if pad:
            self.chunks.append(b'\0' * pad)
            self.pos += pad
        self.items[name] = {'offset': self.pos, 'count': int(arr.size), 'dtype': np.dtype(dtype).name,
                            'shape': list(arr.shape)}
        raw = arr.tobytes()
        self.chunks.append(raw)
        self.pos += len(raw)

    def write(self, out_dir):
        with open(os.path.join(out_dir, 'brain.bin'), 'wb') as fh:
            fh.write(b''.join(self.chunks))


# --------------------------------------------------------------------------------------------- cortex


# Exclusive "atoms" that partition the cortex; scene states are set per atom. Priority = order of the tests in
# atom_of(): PFC sub-regions first, then insula, cingulate, the four lobes, then the rest of the frontal lobe.
ATOMS = ['none', 'frontal', 'parietal', 'temporal', 'occipital', 'insula', 'cingulate',
         'dlpfc', 'vlpfc', 'fpc', 'ofc', 'vmpfc', 'dmpfc', 'acc']
NATOM = 16  # padded to 4 x vec4


def make_atom_of(regions):
    table = {}
    for k, names in regions['pfc'].items():
        for n in names:
            table.setdefault(n, k)
    for n in regions['insula']:
        table.setdefault(n, 'insula')
    for n in regions['cingulate']:
        table.setdefault(n, 'cingulate')
    for lobe in ('occipital', 'parietal', 'temporal', 'frontal'):
        for n in regions['lobes'][lobe]:
            table.setdefault(n, lobe)
    return table


def build_cortex(hcp_dir, pack, meta, regions):
    vi = np.load(os.path.join(hcp_dir, 'fMRI_vertex_info_32k.npz'))
    mmp = np.load(os.path.join(hcp_dir, 'mmp_1.0.npz'))
    sulc_img = nib.load(os.path.join(hcp_dir, 'S1200.sulc_MSMAll.32k_fs_LR.dscalar.nii'))
    sulc_all = np.asarray(sulc_img.dataobj)[0].astype(np.float64)  # 59412 cortical grayordinates

    ids, labels, lab_ids = mmp['map_all'], mmp['labels'], mmp['ids']
    name_of = {int(i): str(n) for i, n in zip(lab_ids, labels)}
    areas = ['']  # index 0 = medial wall / unassigned
    for i in range(1, 181):
        nm = name_of[i]
        assert nm.startswith('L_'), nm
        assert name_of[i + 180] == 'R_' + nm[2:], (nm, name_of[i + 180])
        areas.append(nm[2:])
    meta['areas'] = areas
    atom_table = make_atom_of(regions)
    unassigned = [a for a in areas[1:] if a not in atom_table]
    print('areas without an atom (shown as "none"):', unassigned)
    meta['atoms'] = ATOMS
    atom_of_area = np.array([ATOMS.index(atom_table.get(a, 'none')) if a else 0 for a in areas])

    sides = {'L': (vi['grayl'], slice(0, 29696), 0), 'R': (vi['grayr'], slice(29696, 59412), 180)}
    meta['cortex'] = {}
    for side, (gray, sl, id_off) in sides.items():
        g = nib.load(os.path.join(hcp_dir, f'S1200.{side}.pial_MSMAll.32k_fs_LR.surf.gii'))
        v = g.darrays[0].data.astype(np.float64)
        f = g.darrays[1].data.astype(np.int64)
        nv = len(v)
        sulc = np.zeros(nv)
        sulc[gray] = sulc_all[sl]
        area = np.zeros(nv, dtype=np.int64)
        area[gray] = ids[sl] - id_off
        assert area.max() == 180 and area.min() == 0

        # smooth the medial-wall patch of the sulcal map so it does not show a seam
        n0 = vertex_normals(v, f)
        vs = smooth(v, f, 8)
        off = np.einsum('ij,ij->i', v - vs, n0)  # >0 on gyral crowns, <0 in fundi
        corr = np.corrcoef(off[gray], sulc[gray])[0, 1]
        print(f'[{side}] corr(convexity offset, sulc) = {corr:+.3f}')
        sign = -1.0 if corr < 0 else 1.0
        sulc_gyral = sign * sulc  # positive = gyral crown, negative = sulcal fundus

        # deepen the folds a little (group-average pial surfaces are over-smoothed)
        v_disp = v + n0 * (1.35 * sulc_gyral)[:, None]
        n1 = vertex_normals(v_disp, f)
        v_disp = smooth(v_disp, f, 2, 0.35, -0.37)
        n1 = vertex_normals(v_disp, f)

        depth = np.clip(0.5 - 0.5 * sulc_gyral / 0.9, 0.0, 1.0)  # 1 = deep sulcus, 0 = crown
        depth[area == 0] = 0.35

        # smooth partition-of-unity weights per atom (so region borders become smooth iso-contours in the shader)
        W = np.zeros((nv, NATOM))
        W[np.arange(nv), atom_of_area[area]] = 1.0
        adj = adjacency(nv, f)
        lap = sp.diags(1.0 / np.maximum(np.asarray(adj.sum(1)).ravel(), 1)) @ adj
        for _ in range(3):
            W = 0.45 * W + 0.55 * (lap @ W)
        pack.add(f'cortex{side}.atomw', np.round(W * 255), np.uint8)

        v3 = to_three(v_disp)
        n3 = to_three(n1)
        pack.add(f'cortex{side}.position', v3, np.float32)
        pack.add(f'cortex{side}.normal', n3, np.float32)
        pack.add(f'cortex{side}.depth', depth, np.float32)
        pack.add(f'cortex{side}.area', area, np.uint8)
        pack.add(f'cortex{side}.index', f, np.uint32)

        cen = {}
        for a in range(1, 181):
            m = area == a
            if m.any():
                cen[a] = [round(float(x), 2) for x in v3[m].mean(0)]
        meta['cortex'][side] = {'vertexCount': nv, 'faceCount': int(len(f)), 'centroids': cen}
        print(f'[{side}] verts {nv} faces {len(f)} bbox(three) {v3.min(0).round(0)} {v3.max(0).round(0)}')


# --------------------------------------------------------------------------------------------- subcortex

# label ids inside the abagen atlas volume (identified from centroid + volume): left 35-41, right 76-82
SUB_IDS = {
    'thalamus': (35, 76), 'caudate': (36, 77), 'putamen': (37, 78), 'pallidum': (38, 79),
    'accumbens': (39, 80), 'hippocampus': (40, 81), 'amygdala': (41, 82),
}
BRAINSTEM_ID = 83


def mask_to_mesh(mask, affine, sigma=0.9, smooth_iters=25):
    pad = 4
    m = np.pad(mask.astype(np.float32), pad)
    m = gaussian_filter(m, sigma)
    verts, faces, _, _ = measure.marching_cubes(m, level=0.5)
    verts = verts - pad
    xyz = nib.affines.apply_affine(affine, verts)
    faces = faces[:, ::-1].copy()  # marching_cubes winding is opposite of what we need
    xyz = smooth(xyz, faces, smooth_iters)
    return xyz, faces


def implicit_to_mesh(fn, lo, hi, step, level=0.0, smooth_iters=12):
    xs = np.arange(lo[0], hi[0] + step, step)
    ys = np.arange(lo[1], hi[1] + step, step)
    zs = np.arange(lo[2], hi[2] + step, step)
    X, Y, Z = np.meshgrid(xs, ys, zs, indexing='ij')
    F = fn(X, Y, Z).astype(np.float32)
    verts, faces, _, _ = measure.marching_cubes(F, level=level)
    xyz = verts * step + np.array([xs[0], ys[0], zs[0]])
    faces = faces[:, ::-1].copy()
    xyz = smooth(xyz, faces, smooth_iters)
    return xyz, faces


def ellipsoid(X, Y, Z, c, a):
    q = np.sqrt(((X - c[0]) / a[0]) ** 2 + ((Y - c[1]) / a[1]) ** 2 + ((Z - c[2]) / a[2]) ** 2)
    return (q - 1.0) * min(a)  # approximate signed distance (negative inside)


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)


def add_mesh(pack, meta, name, xyz, faces, extra=None):
    n = vertex_normals(xyz, faces)
    v3, n3 = to_three(xyz), to_three(n)
    pack.add(f'{name}.position', v3, np.float32)
    pack.add(f'{name}.normal', n3, np.float32)
    pack.add(f'{name}.index', faces, np.uint32)
    if extra is not None:
        for k, arr in extra.items():
            pack.add(f'{name}.{k}', arr, np.float32)
    c = v3.mean(0)
    meta['meshes'][name] = {'vertexCount': len(xyz), 'faceCount': int(len(faces)),
                            'centroid': [round(float(x), 2) for x in c],
                            'min': [round(float(x), 2) for x in v3.min(0)],
                            'max': [round(float(x), 2) for x in v3.max(0)]}
    print(f'[{name}] verts {len(xyz)} faces {len(faces)} centroid(three) {np.round(c, 1)}')


def build_subcortex(dk_path, pack, meta):
    img = nib.load(dk_path)
    vol = np.asarray(img.dataobj).astype(np.int32)
    aff = img.affine
    meta['meshes'] = {}
    for name, (lid, rid) in SUB_IDS.items():
        for side, i in (('L', lid), ('R', rid)):
            xyz, faces = mask_to_mesh(vol == i, aff, sigma=0.9 if name in ('thalamus', 'putamen', 'caudate') else 0.7)
            add_mesh(pack, meta, f'{name}{side}', xyz, faces)
    # brainstem: fade out the artificial cut at the bottom of the atlas box in the shader via `fade`
    xyz, faces = mask_to_mesh(vol == BRAINSTEM_ID, aff, sigma=1.2, smooth_iters=30)
    fade = np.clip((xyz[:, 2] + 70.0) / 22.0, 0, 1)  # 0 at z=-70 mm, 1 above z=-48 mm
    add_mesh(pack, meta, 'brainstem', xyz, faces, {'fade': fade})


def build_procedural(pack, meta):
    # --- cerebellum: two lateral lobes + vermis, smooth union
    def cb(X, Y, Z):
        d = None
        for sx in (-1, 1):
            e = ellipsoid(X, Y, Z, (sx * 29, -68, -39), (31, 27, 19.5))
            d = e if d is None else smin(d, e, 6.0)
        d = smin(d, ellipsoid(X, Y, Z, (0, -66, -35), (10, 26, 20)), 6.0)
        # flatten the tentorial surface and notch the front for the brainstem / peduncles
        d = np.maximum(d, (Z - (-20.0 - 0.06 * np.abs(X) - 0.1 * (Y + 68) ** 2 / 27.0)) * 0.9)
        d = np.maximum(d, -ellipsoid(X, Y, Z, (0, -41, -38), (13, 12, 22)))
        return d  # folia are drawn in the shader as a bump map (see SOLID_FRAG, uBump)
    xyz, faces = implicit_to_mesh(cb, (-66, -102, -62), (66, -34, -12), 0.9, 0.0, 12)
    add_mesh(pack, meta, 'cerebellum', xyz, faces)

    # --- hypothalamus (+ pituitary stalk and gland), stylised: small paired ovoids under the thalamus
    def hy(X, Y, Z):
        d = None
        for sx in (-1, 1):
            e = ellipsoid(X, Y, Z, (sx * 4.5, -3, -10.5), (4.2, 6.5, 5.0))
            d = e if d is None else smin(d, e, 2.0)
        d = smin(d, ellipsoid(X, Y, Z, (0, -1, -18), (1.7, 2.0, 5.5)), 2.0)   # infundibulum
        d = smin(d, ellipsoid(X, Y, Z, (0, -1, -25), (5.0, 4.0, 3.2)), 2.0)   # pituitary gland
        return d
    xyz, faces = implicit_to_mesh(hy, (-14, -14, -32), (14, 10, 0), 0.5, 0.0, 10)
    add_mesh(pack, meta, 'hypothalamus', xyz, faces)

    # --- corpus callosum: arched band along the midline, drawn as a swept ellipse
    s = np.linspace(0, 1, 120)
    y = np.interp(s, [0, .08, .5, .92, 1], [29, 32, 0, -34, -38])
    z = np.interp(s, [0, .08, .25, .5, .75, .92, 1], [-1, 8, 19, 26, 22, 12, 2])
    pts = np.stack([np.zeros_like(s), y, z], 1)
    pts = np.stack([np.zeros_like(s), np.convolve(y, np.ones(7) / 7, 'same'), np.convolve(z, np.ones(7) / 7, 'same')], 1)
    pts[:3], pts[-3:] = np.stack([np.zeros(3), y[:3], z[:3]], 1), np.stack([np.zeros(3), y[-3:], z[-3:]], 1)

    def cc(X, Y, Z):
        d = np.full(X.shape, 1e3, np.float32)
        for p in pts:
            d = np.minimum(d, np.sqrt((X - p[0]) ** 2 * 0.012 + (Y - p[1]) ** 2 + (Z - p[2]) ** 2) - 3.2)
        side = np.abs(X) - 9.0
        return -smin(-d, -side, 3.5)   # smooth intersection: rounded lateral edges instead of a flat-sided slab
    xyz, faces = implicit_to_mesh(cc, (-12, -46, -6), (12, 40, 36), 0.7, 0.0, 10)
    add_mesh(pack, meta, 'corpusCallosum', xyz, faces)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--hcp', required=True)
    ap.add_argument('--dk', required=True)
    ap.add_argument('--regions', required=True)
    ap.add_argument('--out', required=True)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    pack, meta = Pack(), {}
    with open(args.regions) as fh:
        regions = json.load(fh)
    build_cortex(args.hcp, pack, meta, regions)
    build_subcortex(args.dk, pack, meta)
    build_procedural(pack, meta)
    pack.write(args.out)
    meta['buffers'] = pack.items
    meta['sources'] = {
        'cortex': 'HCP S1200 fsLR-32k group-average pial (MSMAll) via hcp_utils (MIT); Glasser et al. 2016 Nature HCP-MMP1.0',
        'subcortex': 'Desikan-Killiany/aseg 1 mm MNI volume via abagen (Apache-2.0); cerebellum, hypothalamus and corpus callosum are stylised procedural models',
    }
    with open(os.path.join(args.out, 'brain.json'), 'w') as fh:
        json.dump(meta, fh, separators=(',', ':'))
    print('wrote', args.out, os.path.getsize(os.path.join(args.out, 'brain.bin')) // 1024, 'KB')


if __name__ == '__main__':
    main()
