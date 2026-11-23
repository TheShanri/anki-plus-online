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


# 2026-11-22: corpus callosum and fornix parts, carved as a PARTITION of the parent (each triangle goes to the nearest
# part label, so neighbouring parts meet without overlap or gap). The labels are derived in build_atlas2.py.
PARTITIONS = {
    "corpus-callosum": (["genu-of-corpus-callosum", "body-of-corpus-callosum", "splenium-of-corpus-callosum"], "corpus-callosum", "cerebrum"),
}
# The fornix is cut on its own mesh, not through the MRI box: the Z-Anatomy fornix also carries the fimbria (running forward
# low and lateral along the hippocampus), which the MRI fornix label lacks, so a box mapping sent the fimbria to "columns".
# Model space (m): x left +, y up, z anterior +. Read off a side projection of the mesh (2026-11-22): the body is the medial
# top of the arch, the columns its medial front limb going down to the mammillary bodies, the crus the posterior limb
# arching down and out behind the thalamus; the fimbria below the crus is left out (not a course structure).
def fornix_part(c):
    ax, y, z = np.abs(c[:, 0]), c[:, 1], c[:, 2]
    col = (ax < 0.006) & (z > 0.006) & (y < 1.635)
    body = ~col & (ax < 0.008) & (y >= 1.630) & (z > -0.017)
    crus = ~col & ~body & (((z < -0.017) & (y > 1.619)) | ((ax >= 0.008) & (z < -0.010) & (y > 1.626)))
    return {"columns-of-the-fornix": col, "body-of-fornix": body, "crus-of-fornix": crus}


def carve_fornix():
    pieces = {}
    for side, m in side_geoms("fornix").items():
        for slug, sel in fornix_part(m.triangles_center).items():
            pieces.setdefault(slug, []).append(m.submesh([np.flatnonzero(sel)], append=True))
            print(f"{slug} {side}: {int(sel.sum())} of {len(m.faces)} faces")
    out = []
    for slug, ps in pieces.items():
        mesh = trimesh.util.concatenate(ps)
        mesh.export(os.path.join(ROOT, "public/atlas/s", f"mni-{slug}.glb"))
        bb = mesh.bounds
        out.append(dict(slug=slug, id=f"mni-{slug}", name=at[slug]["name"], region="cerebrum", bbox=[[round(float(v), 5) for v in bb[0]], [round(float(v), 5) for v in bb[1]]],
                        centroid=[round(float(v), 5) for v in mesh.vertices.mean(0)], faces=len(mesh.faces), carved=True))
    return out


def mask_of(slug):
    s = at[slug]
    return np.isin(v1, s["labels"]) if s["labels"] else np.zeros(v1.shape, bool)


def side_geoms(mesh_id):
    """{'L': Trimesh, 'R': Trimesh} in model (world) space; left = +x. A single midline mesh (the corpus callosum) is 'M'."""
    sc = trimesh.load(os.path.join(RAW, mesh_id + ".glb"), force="scene")
    out = {}
    for n in sc.graph.nodes_geometry:
        T, g = sc.graph[n]
        m = sc.geometry[g].copy()
        m.apply_transform(T)
        mx = m.vertices[:, 0].mean()
        out["M" if abs(mx) < 0.002 else "L" if mx > 0 else "R"] = m
    return out


def to_mni(m, lo, hi):
    """Triangle centres of a model mesh -> MNI mm, through the mesh box and the parent's MRI box."""
    mlo, mhi = m.bounds
    g = (m.triangles_center - mlo) / np.maximum(mhi - mlo, 1e-9)
    return np.stack([hi[0] - g[:, 0] * (hi[0] - lo[0]), lo[1] + g[:, 2] * (hi[1] - lo[1]), lo[2] + g[:, 1] * (hi[2] - lo[2])], axis=1)


def half_mask(side):
    half = np.zeros(v1.shape, bool)
    xs = np.arange(v1.shape[0]) * AFF[0, 0] + AFF[0, 3]
    if side == "M": half[:] = True
    else: half[(xs < 0) if side == "L" else (xs >= 0), :, :] = True
    return half


def carve_partition(parent_slug, parts, parent_mesh, region):
    """Each triangle of the parent mesh gets the part label nearest to its mapped MNI point."""
    lab = np.zeros(v1.shape, np.uint8)
    for i, p in enumerate(parts): lab[mask_of(p)] = i + 1
    nz = np.argwhere(lab > 0); clo = np.maximum(nz.min(0) - 12, 0); chi = np.minimum(nz.max(0) + 13, lab.shape)
    sub = lab[tuple(slice(a, b) for a, b in zip(clo, chi))]
    _, ind = ndi.distance_transform_edt(sub == 0, return_indices=True)
    near = sub[tuple(ind)]  # nearest part label everywhere in the crop
    pmask = mask_of(parent_slug)
    pieces = {p: [] for p in parts}
    for side, m in side_geoms(parent_mesh).items():
        pm = pmask & half_mask(side)
        lo, hi = mm_bbox(pm)
        mni = to_mni(m, lo, hi)
        ijk = np.rint(np.c_[mni, np.ones(len(mni))] @ INV.T)[:, :3].astype(int) - clo
        ijk = np.clip(ijk, 0, np.array(near.shape) - 1)
        tri_lab = near[ijk[:, 0], ijk[:, 1], ijk[:, 2]]
        for i, p in enumerate(parts):
            sel = np.flatnonzero(tri_lab == i + 1)
            if len(sel): pieces[p].append(m.submesh([sel], append=True))
            print(f"{p} {side}: {len(sel)} of {len(m.faces)} faces")
    out = []
    for p, ps in pieces.items():
        if not ps: continue
        mesh = trimesh.util.concatenate(ps)
        mesh.export(os.path.join(ROOT, "public/atlas/s", f"mni-{p}.glb"))
        bb = mesh.bounds
        out.append(dict(slug=p, id=f"mni-{p}", name=at[p]["name"], region=region, bbox=[[round(float(v), 5) for v in bb[0]], [round(float(v), 5) for v in bb[1]]],
                        centroid=[round(float(v), 5) for v in mesh.vertices.mean(0)], faces=len(mesh.faces), carved=True))
    return out


# Language areas: the course teaches them on the LEFT hemisphere only. Broca's area = pars opercularis + triangularis of
# the left inferior frontal gyrus (BA 44, 45); Wernicke's area = the posterior third of the left superior temporal gyrus
# (BA 22; owner 2026-11-22: the whole gyrus plus the supramarginal and angular gyri was shown, which is wrong).
def left_of(mesh_id):
    return side_geoms(mesh_id)["L"]


def language_areas():
    out = []
    broca = trimesh.util.concatenate([left_of("opercular-part-of-inferior-frontal-gyrus"), left_of("triangular-part-of-inferior-frontal-gyrus")])
    stg = left_of("superior-temporal-gyrus-lateral-part")
    z = stg.triangles_center[:, 2]  # model z = anterior
    zlo, zhi = np.percentile(stg.vertices[:, 2], [1, 99])
    wern = stg.submesh([np.flatnonzero(z <= zlo + (zhi - zlo) / 3)], append=True)
    for slug, name, mesh in (("broca-s-area", "Broca's area", broca), ("wernicke-s-area", "Wernicke's area", wern)):
        mesh.export(os.path.join(ROOT, "public/atlas/s", f"mni-{slug}.glb"))
        bb = mesh.bounds
        out.append(dict(slug=slug, id=f"mni-{slug}", name=name, region="cerebrum", bbox=[[round(float(v), 5) for v in bb[0]], [round(float(v), 5) for v in bb[1]]],
                        centroid=[round(float(v), 5) for v in mesh.vertices.mean(0)], faces=len(mesh.faces), carved=True))
        print(slug, len(mesh.faces), "faces")
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

for parent, (parts, mesh_id, region) in PARTITIONS.items():
    entries += carve_partition(parent, parts, mesh_id, region)
entries += carve_fornix()
entries += language_areas()

gp = os.path.join(B, "gap_entries.json")
old = json.load(open(gp)) if os.path.exists(gp) else []
new = {e["slug"]: e for e in entries}
merged = [new.pop(e["slug"], e) for e in old] + list(new.values())
json.dump(merged, open(gp, "w"), indent=1)
print("gap_entries.json:", len(merged), "entries")
