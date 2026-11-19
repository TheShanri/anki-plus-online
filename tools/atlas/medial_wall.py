"""Medial wall of the right hemisphere from the labelled interior (public/atlas/interior.bin.gz + interior.json).

Z-Anatomy's gyral shell has no medial wall in the frontal / callosal region, so a midsagittal view showed a flat sheet (or a
hole) there. This builds the real medial surface from the Allen labels already registered to the model, as a height field
seen from the midline: for every (y, z) column, the depth of the first hemisphere tissue going laterally from x = 0 (right
hemisphere, x < 0), smoothed, triangulated on the grid. Columns without tissue within 15 mm are left open.
Each vertex carries its wall kind as a colour (r = 1 cortex / hemispheric white matter, 0 the diencephalon's ventricular
wall: thalamus, hypothalamus), so the viewer paints the cingulate in the cortex tint and the third ventricle's wall in a
grey-matter tone. Near the label box's sides the wall recedes laterally, so the Z-Anatomy gyral shell takes over along a
gyral contour instead of a straight seam.
Writes _atlas/medial_wall.obj (model metres; "v x y z r g b").   usage: python -I tools/atlas/medial_wall.py <repo root>
"""
import gzip, json, struct, sys
import numpy as np
from scipy import ndimage

root = sys.argv[1]
raw = gzip.open(f"{root}/public/atlas/interior.bin.gz", "rb").read()
assert raw[:4] == b"AIL1"
nx, ny, nz = struct.unpack_from("<3H", raw, 4)
cx, cy, cz, step = struct.unpack_from("<4f", raw, 12)
vol = np.frombuffer(raw, np.uint8, nx * ny * nz * 2, 64).reshape(nz, ny, nx, 2)[..., 0]  # z, y, x
meta = json.load(open(f"{root}/public/atlas/interior.json"))
non_tissue = {0} | {r["i"] for r in meta["labels"] if r["cls"] in ("csf", "plx")}
tissue = ~np.isin(vol, list(non_tissue))
xs = cx + (np.arange(nx) + 0.5) * step
i0 = int(np.searchsorted(xs, 0.0)) - 1            # last voxel column with x < 0
depth_max = int(0.015 / step)
cols = tissue[:, :, max(0, i0 - depth_max):i0 + 1][:, :, ::-1]  # z, y, k (k = voxels from the midline outward)
has = cols.any(2)
first = np.where(has, cols.argmax(2), depth_max).astype(np.float32)
# the wall's kind at the first tissue voxel: deep grey matter (0: thalamus, hypothalamus) or anything else (1)
cls_of = np.ones(256, np.float32)
for r in meta["labels"]:
    if r["cls"] == "g": cls_of[r["i"]] = 0.0
labcols = vol[:, :, max(0, i0 - depth_max):i0 + 1][:, :, ::-1]
fi = np.minimum(first.astype(int), labcols.shape[2] - 1)
kind = cls_of[np.take_along_axis(labcols, fi[..., None], 2)[..., 0]]
has = ndimage.binary_opening(has, iterations=1)
# smooth the depth (only over covered columns), sub-voxel: a soft, gyral relief rather than voxel steps
w = ndimage.gaussian_filter(has.astype(np.float32), 1.2)
d = ndimage.gaussian_filter(np.where(has, first, 0), 1.2) / np.maximum(w, 1e-3)
kind = np.clip(ndimage.gaussian_filter(np.where(has, kind, 1.0), 1.5), 0, 1)
# recede near the box's sides (top, front, back): up to 10 mm deeper over the last 8 mm
jz, jy = np.meshgrid(np.arange(nz), np.arange(ny), indexing="ij")
edge = np.minimum.reduce([jz, nz - 1 - jz, ny - 1 - jy]).astype(np.float32)
d = d + 20.0 * np.clip(1.0 - edge / 16.0, 0, 1) ** 2
X = -(d + 0.5) * step - 0.0002                    # x of the surface (right hemisphere, negative)
Z, Y = np.meshgrid(cz + (np.arange(nz) + 0.5) * step, cy + (np.arange(ny) + 0.5) * step, indexing="ij")
idx = -np.ones(has.shape, int)
idx[has] = np.arange(has.sum())
V = np.stack([X[has], Y[has], Z[has], kind[has]], 1)
F = []
a, b, c, e = idx[:-1, :-1], idx[1:, :-1], idx[:-1, 1:], idx[1:, 1:]
ok = (a >= 0) & (b >= 0) & (c >= 0) & (e >= 0)
# no curtains: where the first tissue jumps by more than 3 mm between neighbouring columns (the gyrus rectus' lower edge
# over the uncus, the callosum's edge over the ventricle's wall) the surface is split, and what lies deeper shows through
F0 = first
q = np.stack([F0[:-1, :-1], F0[1:, :-1], F0[:-1, 1:], F0[1:, 1:]])
ok &= (q.max(0) - q.min(0)) <= 6
for A, B, C, E in zip(a[ok], b[ok], c[ok], e[ok]):
    F.append((A, C, B)); F.append((B, C, E))
with open(f"{root}/_atlas/medial_wall.obj", "w") as o:
    for p in V:
        o.write(f"v {p[0]:.5f} {p[1]:.5f} {p[2]:.5f} {p[3]:.3f} {p[3]:.3f} {p[3]:.3f}\n")
    for t in F:
        o.write(f"f {t[0]+1} {t[1]+1} {t[2]+1}\n")
print("verts", len(V), "faces", len(F))
