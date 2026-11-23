"""3D meshes for white-matter landmarks and brainstem nuclei that only the MRI atlas had (2026-11-22): the association
tracts (arcuate, superior/inferior longitudinal, inferior fronto-occipital, uncinate, cingulum), the corticospinal and
corticopontine tracts, the corona radiata and centrum semiovale, the locus coeruleus and the raphe nuclei.

Placement: the cerebral structures are mapped MNI -> model per hemisphere by normalising inside the white matter: the AHRA
forebrain white matter box (MNI) onto the Z-Anatomy "White matter of telencephalon" box (model). The global affine of
register_mni_zanat.py is good near the centre (1-4 mm) but 9-18 mm off at the cortex, where these tracts run; the
per-hemisphere white-matter box keeps them inside the model's white matter. The score printed for each mesh is the share
of its vertices inside the model's white matter (or brainstem) mesh, for both mappings; the better one is written.
Brainstem nuclei use the affine (its residual there is 1-4 mm).
Run (repo root): tools/.venv/Scripts/python.exe -I tools/atlas/wm_meshes.py, then tools/atlas/optimize_gap.sh (meshopt into
public/atlas/s), then link_atlas2.py. Writes _atlas/atlas2_build/glb/mni-<slug>.glb and merges entries into
_atlas/atlas2_build/gap_entries.json."""
import json, os, numpy as np, nibabel as nb, trimesh
from scipy import ndimage as ndi
from skimage import measure

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
B = os.path.join(ROOT, "_atlas/atlas2_build")
ann = nb.load(os.path.join(ROOT, "_atlas/raw/ahra/annotation_full.nii.gz"))
AFF = ann.affine
v1 = np.load(os.path.join(B, "vol1.npy")); v2 = np.load(os.path.join(B, "vol2.npy"))
at = json.load(open(os.path.join(ROOT, "public/atlas2/atlas2.json")))
T = np.array(json.load(open(os.path.join(B, "registration.json")))["mni_mm_to_zanat_m"])
RAW = os.path.join(ROOT, "_atlas/raw/glb/s")

CEREBRAL = ["arcuate-fasciculus", "superior-longitudinal-fasciculus", "inferior-longitudinal-fasciculus", "inferior-fronto-occipital-fasciculus",
            "uncinate-fasciculus", "cingulum", "corona-radiata", "centrum-semiovale"]
# the corticospinal / corticopontine tracts run from the cortex down the brainstem: the white-matter box above the
# midbrain, the affine below it (blended over 10 mm)
DESCENDING = ["corticospinal-tract", "corticopontine-tract"]
BRAINSTEM = ["locus-coeruleus", "dorsal-raphe-nucleus", "median-raphe-nucleus"]


def load_mesh(name):
    sc = trimesh.load(os.path.join(RAW, name + ".glb"), force="scene")
    return trimesh.util.concatenate([g.copy().apply_transform(t) for t, g in [(sc.graph[n][0], sc.geometry[sc.graph[n][1]]) for n in sc.graph.nodes_geometry]])


wm = load_mesh("white-matter-of-telencephalon")
bs = trimesh.util.concatenate([load_mesh(n) for n in ("midbrain", "pons", "medulla-oblongata") if os.path.exists(os.path.join(RAW, n + ".glb"))])
print("wm watertight", wm.is_watertight, "bs watertight", bs.is_watertight)

# MNI white matter box per hemisphere (AHRA forebrain white matter + the derived corona / centrum labels that replaced it in vol1)
A = np.asarray(ann.dataobj)
L1 = {d["key"]: d["id"] for d in at["leaf1"]}
fwm = (A == 10557) | np.isin(v1, [L1["CR"], L1["CSO"]])
del A
ijk = np.argwhere(fwm[::2, ::2, ::2]) * 2
mni_wm = ijk @ AFF[:3, :3].T + AFF[:3, 3]
boxes = {}
for side, sel_m, sel_z in (("L", mni_wm[:, 0] < 0, wm.vertices[:, 0] > 0), ("R", mni_wm[:, 0] >= 0, wm.vertices[:, 0] <= 0)):
    m = mni_wm[sel_m]; z = wm.vertices[sel_z]
    boxes[side] = (np.percentile(m, 0.5, axis=0), np.percentile(m, 99.5, axis=0), np.percentile(z, 0.5, axis=0), np.percentile(z, 99.5, axis=0))


def by_box(p):
    """MNI mm -> model m through the per-hemisphere white-matter boxes (model x = left, y = up, z = anterior)."""
    out = np.zeros_like(p)
    for side in ("L", "R"):
        sel = p[:, 0] < 0 if side == "L" else p[:, 0] >= 0
        lo, hi, zlo, zhi = boxes[side]
        g = (p[sel] - lo) / (hi - lo)   # MNI x (right +), y (anterior +), z (up +)
        # model x: left is +x; the left hemisphere's MNI box runs from its lateral edge (lo x) to the midline (hi x)
        mx = zhi[0] - g[:, 0] * (zhi[0] - zlo[0]) if side == "L" else zhi[0] - g[:, 0] * (zhi[0] - zlo[0])
        my = zlo[1] + g[:, 2] * (zhi[1] - zlo[1])
        mz = zlo[2] + g[:, 1] * (zhi[2] - zlo[2])
        out[sel] = np.c_[mx, my, mz]
    return out


def by_affine(p): return p @ T[:3, :3].T + T[:3, 3]


_vox = {}
def inside(mesh, pts):
    """Share of points inside the mesh (a filled 1 mm voxelisation: trimesh.contains needs rtree, not installed)."""
    k = id(mesh)
    if k not in _vox: _vox[k] = mesh.voxelized(0.001).fill()
    return float(_vox[k].is_filled(pts).mean())


def mask_of(slug):
    s = at["structures"][slug]
    m = np.zeros(v1.shape, bool)
    if s["labels"]: m |= np.isin(v1, s["labels"])
    if s["tracts"]: m |= np.isin(v2, s["tracts"])
    return m


def mirrored(m):
    """The mask mirrored across the midline and added (ICBM 2009b *symmetric* space, so this is exact). Used for the
    corticopontine tracts: in the tract volume's per-voxel winner the left ones lost almost every voxel to the
    neighbouring bundles (79 voxels left vs 8784 right), so the 3D model takes the right side for both."""
    i0 = -AFF[0, 3] / AFF[0, 0]
    idx = np.rint(2 * i0 - np.arange(m.shape[0])).astype(int)
    ok = (idx >= 0) & (idx < m.shape[0])
    out = m.copy(); out[ok] |= m[idx[ok]]
    return out


def surface(m, smooth=1.0, level=0.45, step=1):
    cc, n = ndi.label(m, structure=np.ones((3, 3, 3)))
    if n > 1:
        sz = ndi.sum(m, cc, range(1, n + 1)); m = np.isin(cc, [i + 1 for i, s in enumerate(sz) if s >= 0.03 * sz.max()])
    nz = np.argwhere(m); lo = np.maximum(nz.min(0) - 4, 0); hi = np.minimum(nz.max(0) + 5, m.shape)
    sub = ndi.gaussian_filter(m[tuple(slice(a, b) for a, b in zip(lo, hi))].astype(np.float32), smooth)
    verts, faces, _, _ = measure.marching_cubes(sub, level, step_size=step)
    verts = verts + lo
    return verts @ AFF[:3, :3].T + AFF[:3, 3], faces


def finish(verts_m, faces, slug, region):
    mesh = trimesh.Trimesh(verts_m, faces, process=True)
    if np.linalg.det(T[:3, :3]) < 0 or mesh.volume < 0: mesh.invert()
    h0 = mesh.bounds.copy()
    # (no quadric decimation: on these thin branching surfaces it left metre-long spikes; the resolution comes from the
    # marching-cubes step instead, and the file from meshopt compression, tools/atlas/optimize_gap.sh)
    trimesh.smoothing.filter_taubin(mesh, iterations=8)
    # quadric decimation of these thin, branching surfaces leaves a few runaway vertices (metre-long spikes): drop every
    # face that leaves the raw surface's box or has an edge longer than 6 mm
    v = mesh.vertices
    out = np.any((v < h0[0] - 0.002) | (v > h0[1] + 0.002), axis=1)
    long_e = mesh.edges_unique_length > 0.006
    bad_v = np.zeros(len(v), bool); bad_v[out] = True; bad_v[mesh.edges_unique[long_e].ravel()] = True
    keep = ~bad_v[mesh.faces].any(axis=1)
    if (~keep).any():
        print(f"  {slug}: dropped {int((~keep).sum())} spike faces")
        mesh.update_faces(keep); mesh.remove_unreferenced_vertices()
    mesh.fix_normals()
    mesh.export(os.path.join(B, "glb", f"mni-{slug}.glb"))  # compressed into public/atlas/s by tools/atlas/optimize_gap.sh
    bb = mesh.bounds
    return dict(slug=slug, id=f"mni-{slug}", name=at["structures"][slug]["name"], region=region,
                bbox=[[round(float(v), 5) for v in bb[0]], [round(float(v), 5) for v in bb[1]]],
                centroid=[round(float(v), 5) for v in mesh.vertices.mean(0)], faces=len(mesh.faces), registered=True)


entries = []
rng = np.random.default_rng(1)
for slug in CEREBRAL + DESCENDING:
    m = mask_of(slug)
    if slug == "centrum-semiovale": m = ndi.binary_opening(m, iterations=1)
    if slug == "corticopontine-tract": m = mirrored(m)
    big = slug in ("corona-radiata", "centrum-semiovale")
    mni, faces = surface(m, smooth=1.2 if big else 1.0, step=3 if big else 2)
    a, b_ = by_affine(mni), by_box(mni)
    if slug in DESCENDING:
        # box above the midbrain (MNI z > 0), affine below, blended between z -10 and 0
        w = np.clip((mni[:, 2] + 10) / 10, 0, 1)[:, None]
        b_ = w * b_ + (1 - w) * a
    s = rng.choice(len(mni), min(3000, len(mni)), replace=False)
    sa, sb = inside(wm, a[s]), inside(wm, b_[s])
    use = b_ if not (sa > sb + 0.02) else a
    print(f"{slug:40s} inside WM: affine {sa:.2f}  box {sb:.2f} -> {'affine' if use is a else 'box'}")
    entries.append(finish(use, faces, slug, "cerebrum"))
for slug in BRAINSTEM:
    mni, faces = surface(mask_of(slug), smooth=0.8, level=0.4)
    a = by_affine(mni)
    print(f"{slug:40s} inside brainstem: {inside(bs, a):.2f}")
    entries.append(finish(a, faces, slug, "brainstem"))

gp = os.path.join(B, "gap_entries.json")
old = json.load(open(gp)) if os.path.exists(gp) else []
new = {e["slug"]: e for e in entries}
merged = [new.pop(e["slug"], e) for e in old] + list(new.values())
json.dump(merged, open(gp, "w"), indent=1)
print("gap_entries.json:", len(merged), "entries")
