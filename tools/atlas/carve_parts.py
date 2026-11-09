"""Exact 3D parts without a registration error: carve a sub-structure out of its parent's Z-Anatomy mesh using the MRI label.
Why: a straight MNI -> model affine is only good to 3-6 mm, which put tiny thalamic nuclei in the wrong place (they were demoted to
'approximate'). Here the PARENT mesh (thalamus, caudate) is already exact; we only need where, inside the parent, the part lies.
That is expressed in parent-normalised coordinates: for each hemisphere the parent's MRI mask gets a bounding box, every triangle of the
parent mesh gets its normalised position in the parent's mesh box, mapped into the parent's MRI box, and kept when that MNI point falls
in the part's label mask (dilated 1.5 mm). The result is a surface patch of the real mesh: pulvinar = the posterior-lateral thalamus
surface, caudate head / body / tail = the real caudate cut where the MRI label cuts it.
Run (repo root):  tools/.venv/Scripts/python.exe -I tools/atlas/carve_parts.py   then tools/.venv/Scripts/python.exe -I tools/atlas/link_atlas2.py
Writes public/atlas/s/mni-<slug>.glb (uncompressed, small) and merges entries into _atlas/atlas2_build/gap_entries.json."""
import json, os, numpy as np, trimesh, nibabel as nb
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
B = os.path.join(ROOT, "_atlas/atlas2_build")
AFF = nb.load(os.path.join(ROOT, "_atlas/raw/ahra/annotation_full.nii.gz")).affine
INV = np.linalg.inv(AFF)
v1 = np.load(os.path.join(B, "vol1.npy"))
at = json.load(open(os.path.join(ROOT, "public/atlas2/atlas2.json")))["structures"]
RAW = os.path.join(ROOT, "_atlas/raw/glb/s")

# part slug -> (parent atlas2 slug for the MRI box, parent mesh id, region)
PARTS = {
    "pulvinar": ("thalamus", "thalamus", "diencephalon"),
    "anterior-nucleus-of-thalamus": ("thalamus", "thalamus", "diencephalon"),
    "head-of-caudate-nucleus": ("caudate-nucleus", "caudate-nucleus", "cerebrum"),
    "body-of-caudate-nucleus": ("caudate-nucleus", "caudate-nucleus", "cerebrum"),
    "tail-of-caudate-nucleus": ("caudate-nucleus", "caudate-nucleus", "cerebrum"),
}


def mask_of(slug):
    s = at[slug]
    return np.isin(v1, s["labels"]) if s["labels"] else np.zeros(v1.shape, bool)


def side_geoms(mesh_id):
    """{'L': Trimesh, 'R': Trimesh} in model (world) space; left = +x."""
    sc = trimesh.load(os.path.join(RAW, mesh_id + ".glb"), force="scene")
    out = {}
    for n in sc.graph.nodes_geometry:
        T, g = sc.graph[n]
        m = sc.geometry[g].copy()
        m.apply_transform(T)
        out["L" if m.vertices[:, 0].mean() > 0 else "R"] = m
    return out


def mm_bbox(mask):
    ijk = np.argwhere(mask)
    xyz = ijk @ AFF[:3, :3].T + AFF[:3, 3]
    return xyz.min(0), xyz.max(0)


entries = []
for slug, (parent_slug, parent_mesh, region) in PARTS.items():
    part = mask_of(slug)
    part = ndi.binary_dilation(part, iterations=3)  # ~1.5 mm at 0.5 mm voxels
    pmask = mask_of(parent_slug)
    geoms = side_geoms(parent_mesh)
    pieces = []
    for side, m in geoms.items():
        # MNI x is negative on the left; the model's x is positive on the left
        half = np.zeros(v1.shape, bool)
        xs = np.arange(v1.shape[0]) * AFF[0, 0] + AFF[0, 3]
        half[(xs < 0) if side == "L" else (xs >= 0), :, :] = True
        pm = pmask & half
        if pm.sum() < 10:
            print("no parent mask", slug, side); continue
        lo, hi = mm_bbox(pm)
        mlo, mhi = m.bounds
        c = m.triangles_center
        g = (c - mlo) / np.maximum(mhi - mlo, 1e-9)       # normalised position in the mesh box (model x, y up, z anterior)
        mni = np.stack([hi[0] - g[:, 0] * (hi[0] - lo[0]),  # model x <-> MNI -x
                        lo[1] + g[:, 2] * (hi[1] - lo[1]),  # model z (anterior) <-> MNI y
                        lo[2] + g[:, 1] * (hi[2] - lo[2])], axis=1)  # model y (up) <-> MNI z
        ijk = np.rint(np.c_[mni, np.ones(len(mni))] @ INV.T)[:, :3].astype(int)
        ok = np.all((ijk >= 0) & (ijk < np.array(v1.shape)), axis=1)
        sel = np.zeros(len(c), bool)
        sel[ok] = part[ijk[ok, 0], ijk[ok, 1], ijk[ok, 2]]
        if sel.sum() < 6:
            print("empty carve", slug, side, int(sel.sum())); continue
        sub = m.submesh([np.flatnonzero(sel)], append=True)
        # drop specks
        parts_ = sub.split(only_watertight=False)
        keep = [p for p in parts_ if len(p.faces) >= max(6, 0.1 * max(len(q.faces) for q in parts_))]
        pieces.append(trimesh.util.concatenate(keep))
        print(f"{slug} {side}: {len(keep[0].faces) if keep else 0}+ faces of {len(m.faces)}")
    if not pieces:
        continue
    mesh = trimesh.util.concatenate(pieces)
    mesh.export(os.path.join(ROOT, "public/atlas/s", f"mni-{slug}.glb"))
    bb = mesh.bounds
    entries.append(dict(slug=slug, id=f"mni-{slug}", name=at[slug]["name"], region=region,
                        bbox=[[round(float(v), 5) for v in bb[0]], [round(float(v), 5) for v in bb[1]]],
                        centroid=[round(float(v), 5) for v in mesh.vertices.mean(0)], faces=len(mesh.faces), carved=True))

gp = os.path.join(B, "gap_entries.json")
old = json.load(open(gp)) if os.path.exists(gp) else []
new = {e["slug"]: e for e in entries}
merged = [new.pop(e["slug"], e) for e in old] + list(new.values())
json.dump(merged, open(gp, "w"), indent=1)
print("gap_entries.json:", len(merged), "entries")
