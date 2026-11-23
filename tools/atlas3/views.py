"""Atlas v3, step 6: how well each structure shows from each standard view, and a calm hull for the see-through mode.

Visibility: the outside surface (shell patches; for the medial views the half network of one hemisphere cut at the
midline) is rendered off screen with VTK, one flat id colour per label, from the eight standard views; the pixels of each
label are counted. The viewer flies to the view that shows a selected structure best, and uses the deep (see-through)
view when no standard view shows enough of it (thalamus, putamen, insula behind its opercula).

Hull: the brain mask closed with a 3 mm ball, smoothed, as one light mesh: the see-through mode draws its rim, so the deep
structures sit in a recognisable brain without the busy lines of every sulcus.

Writes _atlas/raw/v3/views.json and _atlas/raw/v3/hull.raw.glb.
Run: tools/.venv/Scripts/python.exe -I tools/atlas3/views.py
"""
import os, json, time
import numpy as np
import vtk
from vtk.util import numpy_support as ns
from scipy import ndimage as ndi
import trimesh

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
W = os.path.join(ROOT, "_atlas/raw/v3")
T0 = time.time()


def log(*a):
    print(f"[{time.time() - T0:6.1f}s]", *a, flush=True)


z = np.load(os.path.join(W, "patches.npz"))
P, F, LAB = z["P"].astype(np.float64), z["F"].astype(np.int64), z["LAB"].astype(np.int64)
meta = json.load(open(os.path.join(W, "labels.json")))
side = {L["id"]: L["side"] for L in meta["labels"]}
NL = len(meta["labels"]) + 1

VIEWS = {
    "left": (1, 0, 0), "right": (-1, 0, 0), "anterior": (0, 0, 1), "posterior": (0, 0, -1),
    "superior": (0, 1, 0.0001), "inferior": (0, -1, 0.0001), "medial-left": (-1, 0, 0), "medial-right": (1, 0, 0),
}
SIZE = 512


def polydata(faces, labels, flip):
    used, inv = np.unique(faces.ravel(), return_inverse=True)
    tri = inv.reshape(-1, 3)
    if flip is not None:
        tri[flip] = tri[flip][:, [0, 2, 1]]
    pd = vtk.vtkPolyData()
    pts = vtk.vtkPoints(); pts.SetData(ns.numpy_to_vtk(P[used], deep=True)); pd.SetPoints(pts)
    ca = vtk.vtkCellArray()
    ca.SetData(ns.numpy_to_vtk(np.arange(0, 3 * len(tri) + 1, 3, dtype=np.int64), deep=True), ns.numpy_to_vtk(tri.ravel().astype(np.int64), deep=True))
    pd.SetPolys(ca)
    col = np.stack([labels & 255, (labels >> 8) & 255, np.full_like(labels, 255)], 1).astype(np.uint8)
    arr = ns.numpy_to_vtk(col, deep=True, array_type=vtk.VTK_UNSIGNED_CHAR); arr.SetName("id")
    pd.GetCellData().SetScalars(arr)
    return pd


def render(pd, direction, clip=None):
    mapper = vtk.vtkPolyDataMapper(); mapper.SetInputData(pd)
    mapper.SetColorModeToDirectScalars(); mapper.SetScalarModeToUseCellData()
    if clip is not None:
        pl = vtk.vtkPlane(); pl.SetOrigin(0, 0, 0); pl.SetNormal(*clip); mapper.AddClippingPlane(pl)
    actor = vtk.vtkActor(); actor.SetMapper(mapper)
    prop = actor.GetProperty(); prop.SetInterpolationToFlat(); prop.LightingOff(); prop.SetAmbient(1.0); prop.SetDiffuse(0.0)
    ren = vtk.vtkRenderer(); ren.AddActor(actor); ren.SetBackground(0, 0, 0)
    win = vtk.vtkRenderWindow(); win.SetOffScreenRendering(1); win.AddRenderer(ren); win.SetSize(SIZE, SIZE)
    win.SetMultiSamples(0)
    cam = ren.GetActiveCamera()
    cam.SetFocalPoint(0, 0.01, -0.015)
    d = np.array(direction, float); d /= np.linalg.norm(d)
    cam.SetPosition(*(np.array([0, 0.01, -0.015]) + d * 1.0))
    cam.SetViewUp(0, 0, 1) if abs(d[1]) > 0.9 else cam.SetViewUp(0, 1, 0)
    cam.ParallelProjectionOn(); cam.SetParallelScale(0.1)
    ren.ResetCameraClippingRange()
    win.Render()
    w2i = vtk.vtkWindowToImageFilter(); w2i.SetInput(win); w2i.ReadFrontBufferOff(); w2i.Update()
    img = ns.vtk_to_numpy(w2i.GetOutput().GetPointData().GetScalars()).reshape(-1, 3 if w2i.GetOutput().GetNumberOfScalarComponents() == 3 else 4)
    ids = img[:, 0].astype(np.int64) + img[:, 1].astype(np.int64) * 256
    win.Finalize()
    return np.bincount(ids, minlength=NL)[:NL]


# exterior: the shell, every label as itself
ext = LAB[:, 1] == 0
pd_ext = polydata(F[ext], LAB[ext, 0], None)
# medial views: the network with one hemisphere removed. A triangle is drawn as the label on the kept side when the other
# side is outside or on the removed hemisphere; the midline structures are cut by a clip plane at x = 0.
def half(keep):
    # the midline structures stand in for their own cut faces: a wall between a kept structure and a midline one is drawn
    # as the midline structure (VTK draws no caps; without this the third ventricle would be a hole into the hemisphere)
    sd = np.array([side.get(int(a), "M") for a in range(NL)])
    kept = (sd == keep)
    mid = (sd == "M")
    a, b = LAB[:, 0], LAB[:, 1]
    a_k, b_k = kept[a] & (a > 0), kept[b] & (b > 0)
    a_m, b_m = mid[a] & (a > 0), mid[b] & (b > 0)
    a_in, b_in = a_k | a_m, b_k | b_m
    sel = (a_in ^ b_in) | (a_k & b_m) | (a_m & b_k)
    lab = np.where(a_in & ~(a_k & b_m), a, b)
    lab = np.where(a_k & b_m, b, lab)
    return polydata(F[sel], lab[sel], None)


out = {}
counts = {}
for name, d in VIEWS.items():
    if name == "medial-left":
        c = render(half("L"), d, clip=(1, 0, 0))
    elif name == "medial-right":
        c = render(half("R"), d, clip=(-1, 0, 0))
    else:
        c = render(pd_ext, d)
    counts[name] = c
    log(name, "pixels", int(c[1:].sum()))
for L in meta["labels"]:
    i = L["id"]
    out[i] = {k: int(counts[k][i]) for k in VIEWS}
json.dump(out, open(os.path.join(W, "views.json"), "w"))
log("views.json written")

# ------------------------------------------------------------------ hull
V = np.load(os.path.join(W, "labels.npy"), mmap_mode="r")
AFF = np.array(meta["affine"]); VOX = meta["voxel_mm"]
b = np.asarray(V[::2, ::2, ::2]) > 0  # 1 mm
ball = lambda r: (np.add.outer(np.add.outer(np.arange(-r, r + 1) ** 2, np.arange(-r, r + 1) ** 2), np.arange(-r, r + 1) ** 2) <= r * r)
hb = ndi.binary_fill_holes(ndi.binary_closing(np.pad(b, 6), ball(3))[6:-6, 6:-6, 6:-6])
sm = ndi.gaussian_filter(hb.astype(np.float32), 1.0)
from skimage import measure
verts, faces, _, _ = measure.marching_cubes(sm, 0.5)
mm = verts * (VOX * 2) + AFF[:3, 3]
Wv = np.stack([-mm[:, 0], mm[:, 2], mm[:, 1]], 1) / 1000.0
hull = trimesh.Trimesh(Wv, faces[:, [0, 2, 1]], process=True)
trimesh.smoothing.filter_taubin(hull, iterations=20)
import fast_simplification
v2, f2 = fast_simplification.simplify(hull.vertices.astype(np.float32), hull.faces.astype(np.int64), target_count=60000)
hull = trimesh.Trimesh(v2, f2, process=True)
trimesh.repair.fix_normals(hull)
open(os.path.join(W, "hull.raw.glb"), "wb").write(hull.export(file_type="glb", include_normals=True))
log("hull.raw.glb", len(hull.faces), "faces (pack.mjs compresses it)")
