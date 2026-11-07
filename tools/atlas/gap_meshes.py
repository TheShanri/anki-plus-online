"""3D gap meshes: marching cubes on the ATLAS-2 label volumes, registered MNI -> Z-Anatomy, written as GLB.
Only for curriculum structures that Z-Anatomy lacks (3D approximate / none) and that have an exact or derived label.
Run: tools/.venv/Scripts/python.exe -I tools/atlas/gap_meshes.py   (then tools/atlas/optimize_gap.sh)
Outputs raw GLBs to _atlas/atlas2_build/glb/, plus _atlas/atlas2_build/gap_entries.json"""
import json, os, re, numpy as np, nibabel as nb, trimesh
from scipy import ndimage as ndi
from skimage import measure
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
B = os.path.join(ROOT, "_atlas/atlas2_build"); os.makedirs(os.path.join(B, "glb"), exist_ok=True)
AFF = nb.load(os.path.join(ROOT, "_atlas/raw/ahra/annotation_full.nii.gz")).affine
v1 = np.load(os.path.join(B, "vol1.npy")); v2 = np.load(os.path.join(B, "vol2.npy"))
at = json.load(open(os.path.join(ROOT, "public/atlas2/atlas2.json")))
reg = json.load(open(os.path.join(B, "registration.json")))
T = np.array(reg["mni_mm_to_zanat_m"])
amap = json.load(open(os.path.join(ROOT, "src/data/atlas-map.json")))
structs = json.load(open(os.path.join(ROOT, "content/nsci3250/structures.json"), encoding="utf8"))
norm = lambda s: re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()
BYN = {norm(k): v for k, v in amap.items()}
REGION = {"internal-capsule": "cerebrum", "anterior-limb-of-internal-capsule": "cerebrum", "genu-of-internal-capsule": "cerebrum", "posterior-limb-of-internal-capsule": "cerebrum",
          "association-fibers": "cerebrum", "projection-fibers": "cerebrum", "commissural-fibers": "cerebrum", "optic-radiations": "cerebrum", "nucleus-accumbens": "cerebrum",
          "anterior-horn-of-lateral-ventricle": "ventricles", "body-of-lateral-ventricle": "ventricles", "atrium-of-lateral-ventricle": "ventricles",
          "posterior-horn-of-lateral-ventricle": "ventricles", "inferior-horn-of-lateral-ventricle": "ventricles"}
def region_of(slug, s):
    if slug in REGION: return REGION[slug]
    c = s["centroid"]
    if s["name"] and any(k in slug for k in ("cerebell", "vermis")): return "cerebellum"
    if c[2] < 0 and c[1] < -20 and c[2] > -70 and abs(c[0]) < 20: return "brainstem"
    return "diencephalon" if abs(c[0]) < 25 and c[2] < 20 else "cerebrum"
# Only structures inside the region where the affine fit is good (thalamus/basal ganglia/brainstem/ventricles: 1-4 mm).
# Cortical gyri, fornix, caudate, corpus callosum, cuneus and cerebellar hemispheres fit badly (9-18 mm) and stay MRI-only.
MESH_OK = {"anterior-horn-of-lateral-ventricle", "body-of-lateral-ventricle", "inferior-horn-of-lateral-ventricle", "posterior-horn-of-lateral-ventricle",
           "atrium-of-lateral-ventricle", "internal-capsule", "anterior-limb-of-internal-capsule", "genu-of-internal-capsule", "posterior-limb-of-internal-capsule",
           "pineal-gland", "middle-cerebellar-peduncle", "inferior-cerebellar-peduncle", "substantia-nigra", "medial-lemniscus", "medial-longitudinal-fasciculus",
           "longitudinal-fibers-of-the-pons", "subthalamic-nucleus", "periaqueductal-gray", "red-nucleus", "superior-cerebellar-peduncle", "nucleus-accumbens"}
FORCE = {"periaqueductal-gray", "genu-of-internal-capsule", "inferior-horn-of-lateral-ventricle"}  # Z-Anatomy map entry points at the aqueduct / a parent, not the structure
OPEN = {"periaqueductal-gray", "inferior-horn-of-lateral-ventricle"}  # structures whose label has thin spurious columns
gaps = []
for st in structs:
    slug = st["slug"]
    if slug not in at["structures"] or slug not in MESH_OK: continue
    s = at["structures"][slug]
    if s["quality"] not in ("exact", "derived") or s.get("group") and slug not in ("internal-capsule", "association-fibers", "projection-fibers"): continue
    names = [st["name"]] + st.get("synonyms", [])
    ent = next((BYN[norm(n)] for n in names if norm(n) in BYN), None)
    if ent and not ent["approximate"] and ent["meshIds"] and slug not in FORCE: continue
    gaps.append(slug)
print(len(gaps), "gap structures:", gaps)
out = []
for slug in gaps:
    s = at["structures"][slug]
    m = np.zeros(v1.shape, np.float32)
    if s["labels"]: m[np.isin(v1, s["labels"])] = 1
    if s["tracts"]: m[np.isin(v2, s["tracts"])] = 1
    # drop stray label voxels far from the structure (they became long slivers, e.g. in the inferior horn and the periaqueductal gray)
    # thin one-voxel-wide columns (the PAG label runs down the central canal) are removed by a small opening
    op = ndi.binary_opening(m > 0, iterations=2) if slug in OPEN else m > 0
    if op.sum() > 0.5 * (m > 0).sum(): m = op.astype(np.float32)
    cc, ncc = ndi.label(m > 0, structure=np.ones((3, 3, 3)))
    if ncc > 1:
        sizes = ndi.sum(m > 0, cc, range(1, ncc + 1))
        keep = [i + 1 for i, sz in enumerate(sizes) if sz >= 0.05 * sizes.max()]
        if len(keep) < ncc: print("  dropped", ncc - len(keep), "stray component(s) of", slug)
        m[~np.isin(cc, keep)] = 0
    nz = np.argwhere(m > 0)
    if len(nz) < 50: print("skip tiny", slug); continue
    lo = np.maximum(nz.min(0) - 4, 0); hi = np.minimum(nz.max(0) + 5, m.shape)
    sub = m[tuple(slice(a, b) for a, b in zip(lo, hi))]
    sub = ndi.gaussian_filter(sub, 1.0)
    verts, faces, _, _ = measure.marching_cubes(sub, 0.45, spacing=(1, 1, 1))
    verts = verts + lo  # voxel index coords
    mni = verts @ AFF[:3, :3].T + AFF[:3, 3]
    z = mni @ T[:3, :3].T + T[:3, 3]
    mesh = trimesh.Trimesh(z, faces, process=True)
    if np.linalg.det(T[:3, :3]) < 0: mesh.invert()
    tgt = 6000 if len(mesh.faces) > 6000 else len(mesh.faces)
    if len(mesh.faces) > tgt:
        mesh = mesh.simplify_quadric_decimation(face_count=tgt)
    trimesh.smoothing.filter_taubin(mesh, iterations=8)
    mesh.fix_normals()
    mesh.export(os.path.join(B, "glb", f"mni-{slug}.glb"))
    bb = mesh.bounds
    out.append(dict(slug=slug, id=f"mni-{slug}", name=s["name"], region=region_of(slug, s), bbox=[[round(float(v), 5) for v in bb[0]], [round(float(v), 5) for v in bb[1]]],
                    centroid=[round(float(v), 5) for v in mesh.vertices.mean(0)], faces=len(mesh.faces)))
    print(slug, len(mesh.faces), "faces")
# merge into the existing file instead of overwriting: structures that already got a registered mesh are no longer "gaps"
# on a re-run, and a plain overwrite would drop their entries (and so their meshes from the index).
gp = os.path.join(B, "gap_entries.json")
old = json.load(open(gp)) if os.path.exists(gp) else []
new = {e["slug"]: e for e in out}
merged = [new.pop(e["slug"], e) for e in old] + list(new.values())
json.dump(merged, open(gp, "w"), indent=1)
print("gap_entries.json:", len(merged), "entries")
