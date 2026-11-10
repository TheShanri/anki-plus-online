"""Closed 'brain fill' solid for the 3D atlas: the gross gyral meshes do not tile (cracks, a missing medial wall, open orbital
surfaces), so this voxelises their union, closes it, fills it and re-meshes it as ONE watertight shell (public/atlas/brainfill.glb).
The viewer draws it slightly inside the gyri (nothing can show through a crack) and uses it as the stencil volume that caps cut planes.
Run: npx @gltf-transform/cli copy public/atlas/gross.glb _atlas/fill/gross_raw.glb && ... dequantize _atlas/fill/gross_raw.glb _atlas/fill/gross_dq.glb
     tools/.venv/Scripts/python.exe -I tools/atlas/fill_brain.py   then tools/atlas/optimize_fill.sh"""
import os, sys, numpy as np, trimesh
from scipy import ndimage as ndi
from skimage import measure
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
F = os.path.join(ROOT, "_atlas/fill"); P = 0.0007
sc = trimesh.load(os.path.join(F, "gross_dq.glb"), force="scene")
ms = sc.dump()
V = np.vstack([m.vertices for m in ms]); lo = V.min(0) - 0.01; hi = V.max(0) + 0.01
shape = np.ceil((hi - lo) / P).astype(int)
print("grid", shape, lo, hi)
vox = np.zeros(shape, bool)
for m in ms:
    nm = (m.metadata or {}).get("name", "")
    vg = m.voxelized(P)
    idx = np.round((vg.points - lo) / P).astype(int)
    idx = idx[(idx >= 0).all(1) & (idx < shape).all(1)]
    vox[idx[:, 0], idx[:, 1], idx[:, 2]] = True
print("surface voxels", vox.sum())
np.save(os.path.join(F, "surf.npy"), vox); np.save(os.path.join(F, "origin.npy"), lo)
