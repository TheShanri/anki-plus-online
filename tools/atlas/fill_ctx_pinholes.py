"""Closes the see-through pinholes of the context cerebrum shell at the orbital roof that fill_ctx_holes.py cannot see:
they are not open boundary loops but gaps between long triangles. The shell is rasterised straight from below (along +y);
every pixel inside the silhouette with no triangle over it, near the orbit (|x| 0.1-0.45, z 0.3-0.7), is a pinhole. Each one is
patched with a local Delaunay triangulation of the vertices of the triangles around it (faces added only, nothing else moves).
Run (repo root, after the three gltf-transform steps in fill_ctx_holes.py, starting from the current public/atlas/context.glb):
  tools/.venv/Scripts/python.exe -I tools/atlas/fill_ctx_pinholes.py            # reads _atlas/fill/ctx_dq.glb, writes _atlas/fill/ctx_fixed.glb
  npx @gltf-transform/cli optimize _atlas/fill/ctx_fixed.glb public/atlas/context.glb --compress meshopt --texture-compress false --simplify false --instance false --palette false --join false --flatten false
PROBE=1 only reports the pinholes."""
import os, numpy as np, trimesh
from scipy import ndimage as ndi
from scipy.spatial import Delaunay
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
F_DIR = os.path.join(ROOT, "_atlas/fill")
sc = trimesh.load(os.path.join(F_DIR, "ctx_dq.glb"), force="scene")
name = list(sc.geometry)[0]
g = sc.geometry[name]; g.merge_vertices()
V = g.vertices; F = g.faces
STEP = 0.0015; X0, X1, Z0, Z1 = -0.6, 0.6, -0.8, 0.8
W = int((X1 - X0) / STEP); H = int((Z1 - Z0) / STEP)

def bary(t, X, Z):
    a, b, c = t
    den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    if abs(den) < 1e-14: return None
    l1 = ((b[1] - c[1]) * (X - c[0]) + (c[0] - b[0]) * (Z - c[1])) / den
    l2 = ((c[1] - a[1]) * (X - c[0]) + (a[0] - c[0]) * (Z - c[1])) / den
    return (l1 >= -1e-9) & (l2 >= -1e-9) & (l1 + l2 <= 1 + 1e-9)

def coverage(Vv, Ff):
    cov = np.zeros((H, W), np.int32)
    for t in Vv[Ff][:, :, [0, 2]]:
        mn = t.min(0); mx = t.max(0)
        i0 = int((mn[0] - X0) / STEP); i1 = int((mx[0] - X0) / STEP) + 1
        j0 = int((mn[1] - Z0) / STEP); j1 = int((mx[1] - Z0) / STEP) + 1
        X, Z = np.meshgrid(X0 + (np.arange(i0, i1) + .5) * STEP, Z0 + (np.arange(j0, j1) + .5) * STEP)
        m = bary(t, X, Z)
        if m is not None: cov[j0:j1, i0:i1] += m
    return cov

def pinholes(cov):
    holes = ndi.binary_fill_holes(cov > 0) & (cov == 0)
    lab, n = ndi.label(holes)
    out = []
    for i in range(1, n + 1):
        ys, xs = np.where(lab == i)
        cx = X0 + xs.mean() * STEP; cz = Z0 + ys.mean() * STEP
        if 0.1 < abs(cx) < 0.45 and 0.3 < cz < 0.7 and abs(cx) > 0.12: out.append((i, cx, cz, len(xs)))
    return lab, out

cov = coverage(V, F)
lab, ph = pinholes(cov)
print("pinholes before:", [(round(x, 3), round(z, 3), n) for _, x, z, n in ph])
if os.environ.get("PROBE"): raise SystemExit
mask = np.isin(lab, [i for i, *_ in ph])
# group the 1-pixel crack chains and blobs: dilate so near pieces merge into one patch
grp, ng = ndi.label(ndi.binary_dilation(mask, iterations=8))
newf = []
T = V[F][:, :, [0, 2]]
tmn = T.min(1); tmx = T.max(1)
for gi in range(1, ng + 1):
    ys, xs = np.where((grp == gi) & mask)
    if not len(xs): continue
    hx = X0 + (xs + .5) * STEP; hz = Z0 + (ys + .5) * STEP
    pad = 4 * STEP
    near = (tmx[:, 0] >= hx.min() - pad) & (tmn[:, 0] <= hx.max() + pad) & (tmx[:, 1] >= hz.min() - pad) & (tmn[:, 1] <= hz.max() + pad)
    vs = np.unique(F[near].ravel())
    P = V[vs][:, [0, 2]]
    dl = Delaunay(P)
    made = 0
    for s in dl.simplices:
        tri = P[s]
        m = bary(tri, hx, hz)
        if m is None or not m.any(): continue
        a, b, c = vs[s]
        n = np.cross(V[b] - V[a], V[c] - V[a])
        newf.append([a, b, c] if n[1] < 0 else [a, c, b]); made += 1
    print(" patch at", round(hx.mean(), 3), round(hz.mean(), 3), "holes px", len(xs), "triangles", made)
if newf:
    g2 = trimesh.Trimesh(V, np.vstack([F, np.array(newf)]), process=False)
    sc.geometry[name] = g2
    _ = g2.vertex_normals
    cov2 = coverage(g2.vertices, g2.faces)
    print("pinholes after:", [(round(x, 3), round(z, 3), n) for _, x, z, n in pinholes(cov2)[1]])
    sc.export(os.path.join(F_DIR, "ctx_fixed.glb"))
