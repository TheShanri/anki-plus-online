"""Closed 'brain fill' solid for the 3D atlas.
The gross gyral meshes are a cortical ribbon that does not tile (cracks), has no medial wall and is open at the base, so a
section through it shows a hollow shell. This voxelises the meshes, seals the medial wall and base per coronal slice (hull edges of
the cerebral cortex, so the brainstem hanging below does not drag the base down), fills, smooths and re-meshes ONE watertight shell
-> public/atlas/brainfill.glb (drawn just inside the gyri as the backer, and the stencil volume that caps cut planes).
Run (repo root):
  npx @gltf-transform/cli copy public/atlas/gross.glb _atlas/fill/gross_raw.glb   (decode meshopt; use _atlas/backup/gross.glb if gross was rebuilt)
  npx @gltf-transform/cli dequantize _atlas/fill/gross_raw.glb _atlas/fill/gross_dq.glb
  tools/.venv/Scripts/python.exe -I tools/atlas/fill_brain.py     then tools/atlas/optimize_fill.sh"""
import os, json, sys, numpy as np, trimesh
from scipy import ndimage as ndi
from scipy.spatial import ConvexHull
from skimage import measure
from skimage.draw import line
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
F = os.path.join(ROOT, "_atlas/fill"); P = 0.0007; R = 9
idx = json.load(open(os.path.join(ROOT, "public/atlas/index.json")))["structures"]
sc = trimesh.load(os.path.join(F, "gross_dq.glb"), force="scene")
ms = sc.dump()
V = np.vstack([m.vertices for m in ms]); lo = V.min(0) - 0.01; hi = V.max(0) + 0.01
shape = np.ceil((hi - lo) / P).astype(int)
cache = os.path.join(F, "vox.npz")
if os.path.exists(cache):
    z = np.load(cache); cortex, rest = z["cortex"], z["rest"]
else:
    cortex = np.zeros(shape, bool); rest = np.zeros(shape, bool)
    for m in ms:
        nm = (m.metadata or {}).get("name", "")
        tgt = cortex if idx.get(nm, {}).get("region") == "cerebrum" else rest
        pts = m.voxelized(P).points
        i = np.round((pts - lo) / P).astype(int)
        i = i[(i >= 0).all(1) & (i < shape).all(1)]
        tgt[i[:, 0], i[:, 1], i[:, 2]] = True
    np.savez_compressed(cache, cortex=cortex, rest=rest)
x0 = int(round(-lo[0] / P))
disk = (np.mgrid[-R:R + 1, -R:R + 1] ** 2).sum(0) <= R * R
fc = np.zeros(shape, bool)
for k in range(shape[2]):
    xs, ys = np.nonzero(cortex[:, :, k])
    if len(xs) < 30: continue
    sl = np.pad(cortex[:, :, k], R + 1)
    for sgn in (-1, 1):
        sel = (xs - x0) * sgn >= 0
        if sel.sum() < 30: continue
        pts = np.c_[xs[sel], ys[sel]].astype(float)
        try: h = ConvexHull(pts)
        except Exception: continue
        v = pts[h.vertices]
        for a, b in zip(v, np.roll(v, -1, 0)):
            rr, cc = line(int(a[0]), int(a[1]), int(b[0]), int(b[1])); sl[rr + R + 1, cc + R + 1] = True
    sl = ndi.binary_closing(sl, disk)
    fc[:, :, k] = ndi.binary_fill_holes(sl)[R + 1:-R - 1, R + 1:-R - 1]
fc = ndi.binary_closing(np.pad(fc, 8), np.ones((1, 1, 9), bool))[8:-8, 8:-8, 8:-8]
# the hull chords over the sulci would plug them: keep only what lies within 9 mm of the real cortex or inside the medial/basal seal
dist = ndi.distance_transform_edt(~(cortex | rest)) * P
fr = ndi.binary_fill_holes(ndi.binary_closing(np.pad(rest, 6), (np.mgrid[-4:5, -4:5, -4:5] ** 2).sum(0) <= 16)[6:-6, 6:-6, 6:-6])
f = ndi.binary_fill_holes(fc | fr)
# 2D hole filling along every axis closes the remaining internal voids (a section must be solid all through)
for ax in range(3):
    b = np.moveaxis(f, ax, 0)
    f = f | np.moveaxis(np.stack([ndi.binary_fill_holes(s) for s in b]), 0, ax)
np.save(os.path.join(F, "fill.npy"), f)
# smooth + mesh
g = ndi.gaussian_filter(f.astype(np.float32), 2.0)
vt, fa, nr, _ = measure.marching_cubes(np.pad(g, 1), 0.5, spacing=(P, P, P))
vt = vt + lo - P
mesh = trimesh.Trimesh(vt, fa, process=True)
mesh = max(mesh.split(only_watertight=False), key=lambda m: len(m.faces))
import fast_simplification as fs
v2, f2 = fs.simplify(np.asarray(mesh.vertices, np.float32), np.asarray(mesh.faces, np.int32), target_reduction=0.9)
mesh = trimesh.Trimesh(v2, f2, process=True)
mesh.merge_vertices(); trimesh.repair.fill_holes(mesh); trimesh.repair.fix_winding(mesh); trimesh.repair.fix_normals(mesh)
if mesh.volume < 0: mesh.invert()
print("faces", len(mesh.faces), "watertight", mesh.is_watertight, "bounds", mesh.bounds.tolist())
sc2 = trimesh.Scene(); sc2.add_geometry(mesh, node_name="brainfill", geom_name="brainfill")
sc2.export(os.path.join(F, "brainfill_raw.glb"))
