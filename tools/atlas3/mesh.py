"""Atlas v3, step 2: surfaces from the label volume.

VTK SurfaceNets (Schroeder et al. 2022) turns the multi-label volume into ONE surface network: every triangle separates
exactly two regions (a structure and a neighbour, or a structure and the outside, label 0). Triangles are grouped into
interface PATCHES by their label pair; each patch is decimated on its own with its boundary vertices locked, so the
patches still meet exactly after decimation (no cracks anywhere, also between two gyri or a nucleus and the capsule).

The viewer draws the patch network with one shader that knows both labels of every triangle: seen from the outside it
is the structure's surface, seen from inside a structure (after a cut) it is that structure's cut face. So the 3D
model, the cut faces and picking all come from the same triangles.

Outputs (_atlas/raw/v3/):
  patches.npz   P (float32 N x 3, world metres), F (uint32 M x 3), LAB (uint16 M x 2: label in front of the normal is
                LAB[:,1], behind it LAB[:,0]), patch table (pair, first face, face count)
Run: tools/.venv/Scripts/python.exe -I tools/atlas3/mesh.py [--reduction 0.75]
"""
import os, sys, json, time
import numpy as np
import vtk
from vtk.util import numpy_support as ns

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
W = os.path.join(ROOT, "_atlas/raw/v3")
RED = float(sys.argv[sys.argv.index("--reduction") + 1]) if "--reduction" in sys.argv else 0.75
T0 = time.time()


def log(*a):
    print(f"[{time.time() - T0:6.1f}s]", *a, flush=True)


V = np.load(os.path.join(W, "labels.npy"), mmap_mode="r")
meta = json.load(open(os.path.join(W, "labels.json")))
AFF = np.array(meta["affine"])
VOX = meta["voxel_mm"]
NL = len(meta["labels"])
nz = np.argwhere(np.asarray(V[::4, ::4, ::4]) > 0) * 4
lo = np.maximum(nz.min(0) - 6, 0)
hi = np.minimum(nz.max(0) + 7, V.shape)
sub = np.ascontiguousarray(V[lo[0]:hi[0], lo[1]:hi[1], lo[2]:hi[2]])
log("crop", sub.shape, "labels", NL)

img = vtk.vtkImageData()
img.SetDimensions(*sub.shape)
img.SetSpacing(VOX, VOX, VOX)
img.SetOrigin(*(AFF[:3, 3] + lo * VOX))
img.GetPointData().SetScalars(ns.numpy_to_vtk(sub.ravel(order="F"), deep=True, array_type=vtk.VTK_UNSIGNED_SHORT))
del sub
sn = vtk.vtkSurfaceNets3D()
sn.SetInputData(img)
sn.SetBackgroundLabel(0)
sn.GenerateLabels(NL, (1, NL))
sn.SetOutputMeshTypeToTriangles()
sn.SmoothingOn()
sn.SetNumberOfIterations(40)
sn.SetRelaxationFactor(0.5)
sn.SetConstraintDistance(0.6)
sn.Update()
out = sn.GetOutput()
P = ns.vtk_to_numpy(out.GetPoints().GetData()).astype(np.float64)
F = ns.vtk_to_numpy(out.GetPolys().GetConnectivityArray()).reshape(-1, 3).astype(np.int64)
B = ns.vtk_to_numpy(out.GetCellData().GetArray("BoundaryLabels")).reshape(-1, 2).astype(np.int64)
del out, sn, img
log("surface network:", len(P), "points", len(F), "triangles")

# orientation: which label lies in front of each triangle's normal? sample the volume 0.25 mm along +/- n
a, b, c = P[F[:, 0]], P[F[:, 1]], P[F[:, 2]]
n = np.cross(b - a, c - a)
n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
cen = (a + b + c) / 3


def lab_at(q):
    v = np.round((q - AFF[:3, 3]) / VOX).astype(np.int64)
    v = np.clip(v, 0, np.array(V.shape) - 1)
    return np.asarray(V[v[:, 0], v[:, 1], v[:, 2]])


fr, bk = lab_at(cen + 0.3 * n), lab_at(cen - 0.3 * n)
ok_fwd = (fr == B[:, 1]) & (bk == B[:, 0])
ok_rev = (fr == B[:, 0]) & (bk == B[:, 1])
log(f"orientation check: normal points from LAB0 to LAB1 in {ok_fwd.mean():.3f} of triangles, the reverse in {ok_rev.mean():.3f}")
flip = ok_rev & ~ok_fwd if ok_rev.mean() > ok_fwd.mean() else np.zeros(len(F), bool)
if ok_rev.mean() > ok_fwd.mean():
    F = F[:, [0, 2, 1]]
    log("convention: flipped all triangles so the normal points from LAB0 to LAB1")
del a, b, c, n, cen, fr, bk

# patches: one per unordered pair; normals point from the larger label to the smaller (so the outside, 0, is in front)
hi_l = np.maximum(B[:, 0], B[:, 1])
lo_l = np.minimum(B[:, 0], B[:, 1])
swap = B[:, 0] < B[:, 1]  # stored as (LAB0=larger, LAB1=smaller): reverse the winding where needed
F[swap] = F[swap][:, [0, 2, 1]]
key = hi_l * 65536 + lo_l
order = np.argsort(key, kind="stable")
key, F = key[order], F[order]
uk, start, count = np.unique(key, return_index=True, return_counts=True)
log("patches:", len(uk), "| exterior (with label 0):", int((uk % 65536 == 0).sum()))

# decimate each patch with its boundary locked
outP, outF, outL, table = [], [], [], []
nv = 0
for i, (k, s, cnt) in enumerate(zip(uk, start, count)):
    f = F[s:s + cnt]
    used, inv = np.unique(f.ravel(), return_inverse=True)
    pts = P[used]
    tri = inv.reshape(-1, 3)
    if cnt >= 40 and RED > 0:
        pd = vtk.vtkPolyData()
        vp = vtk.vtkPoints(); vp.SetData(ns.numpy_to_vtk(pts, deep=True)); pd.SetPoints(vp)
        ca = vtk.vtkCellArray()
        ca.SetData(ns.numpy_to_vtk(np.arange(0, 3 * len(tri) + 1, 3, dtype=np.int64), deep=True), ns.numpy_to_vtk(tri.ravel().astype(np.int64), deep=True))
        pd.SetPolys(ca)
        d = vtk.vtkDecimatePro()
        d.SetInputData(pd)
        d.SetTargetReduction(RED)
        d.PreserveTopologyOn()
        d.BoundaryVertexDeletionOff()
        d.SplittingOff()
        d.SetFeatureAngle(75)
        d.Update()
        o = d.GetOutput()
        pts = ns.vtk_to_numpy(o.GetPoints().GetData()).astype(np.float64)
        tri = ns.vtk_to_numpy(o.GetPolys().GetConnectivityArray()).reshape(-1, 3)
        u2, inv2 = np.unique(tri.ravel(), return_inverse=True)
        pts, tri = pts[u2], inv2.reshape(-1, 3)
    table.append((int(k // 65536), int(k % 65536), sum(len(x) for x in outF), len(tri)))
    outP.append(pts); outF.append(tri + nv); nv += len(pts)
    outL.append(np.repeat([[k // 65536, k % 65536]], len(tri), 0))
    if i % 500 == 0:
        log(f"  patch {i}/{len(uk)}")
P2 = np.concatenate(outP); F2 = np.concatenate(outF); L2 = np.concatenate(outL)
log(f"decimated ({RED:.2f}): {len(F)} -> {len(F2)} triangles, {len(P2)} vertices")

# world frame for three.js: X = patient's left (-x MNI), Y = up (z), Z = anterior (y); metres
Wd = np.stack([-P2[:, 0], P2[:, 2], P2[:, 1]], 1) / 1000.0
# the axis swap is a proper rotation (det +1), so the winding (and the normal direction) is kept
np.savez(os.path.join(W, "patches.npz"), P=Wd.astype(np.float32), F=F2.astype(np.uint32), LAB=L2.astype(np.uint16), table=np.array(table, np.int64))
log("saved patches.npz")
