"""3D neighbours from real geometry, per hemisphere.
Why: the old neighbours came from index.json bboxes/centroids. A paired mesh (left + right in one file) has one bbox that
spans both hemispheres, so the middle temporal gyrus 'touched' the pons and the corpus callosum.
Here every mesh is split into side units (Z-Anatomy ships .l/.r nodes; MNI gap meshes are split by connected component),
each unit is sampled on its surface, and two units are neighbours when their surfaces touch (share a boundary) or come close.
A left unit only competes with left units and midline structures.

Writes index.structures[id].nbs = {"L": [...], "R": [...], "M": [...]} and the legacy flat `neighbors`.
Entries are "mesh-id" (a midline structure) or "mesh-id:L" / "mesh-id:R" (that hemisphere's half of the mesh).
Run (repo root):  tools/.venv/Scripts/python.exe -I tools/atlas/neighbors3d.py [--vet]
Also imported by link_atlas2.py (compute())."""
import json, os, re, sys, numpy as np, trimesh
from scipy.spatial import cKDTree

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RAW = os.path.join(ROOT, "_atlas/raw/glb")
GAP = os.path.join(ROOT, "_atlas/atlas2_build/glb")
NS = 1400          # surface samples per unit
TOUCH = 0.0025     # metres: surfaces closer than this count as touching
MAXD = 0.006       # a neighbour must come within this distance somewhere
TOPN = 6


# One structure drawn inside / as part of another is not its neighbour.
PART_OF = {
    "lentiform-nucleus": ["putamen", "globus-pallidus"],
    "mni-internal-capsule": ["mni-anterior-limb-of-internal-capsule", "mni-posterior-limb-of-internal-capsule", "mni-genu-of-internal-capsule", "internal-capsule",
                             "genu-of-internal-capsule", "anterior-limb-of-internal-capsule", "posterior-limb-of-internal-capsule"],
    "internal-capsule": ["genu-of-internal-capsule", "anterior-limb-of-internal-capsule", "posterior-limb-of-internal-capsule"],
    "medulla-oblongata": ["olive", "pyramid-of-medulla-oblongata", "nucleus-ambiguus", "nucleus-of-hypoglossal-nerve", "posterior-nucleus-of-vagus-nerve"],
    "midbrain": ["superior-colliculus", "inferior-colliculus", "base-of-peduncle", "red-nucleus", "mni-substantia-nigra", "mni-periaqueductal-gray",
                 "nucleus-of-oculomotor-nerve", "accessory-nucleus-of-oculomotor-nerve", "nucleus-of-trochlear-nerve", "interpeduncular-fossa"],
    "pons": ["nucleus-of-abducens-nerve", "motor-nucleus-of-facial-nerve", "mni-longitudinal-fibers-of-the-pons", "superior-salivatory-nucleus"],
    "thalamus": ["habenula", "medial-geniculate-body", "lateral-geniculate-body"],
    "lateral-ventricle": ["mni-anterior-horn-of-lateral-ventricle", "mni-body-of-lateral-ventricle", "mni-atrium-of-lateral-ventricle", "mni-posterior-horn-of-lateral-ventricle",
                          "mni-inferior-horn-of-lateral-ventricle", "anterior-horn-of-lateral-ventricle", "body-of-lateral-ventricle"],
}
PART_PAIRS = {frozenset((a, b)) for a, bs in PART_OF.items() for b in bs}
CORTEX_PARENTS = {"frontal-lobe", "parietal-lobe", "temporal-lobe", "occipital-lobe", "limbic-lobe", "insula"}


def mesh_path(sid, e):
    p = os.path.join(GAP, sid + ".glb") if sid.startswith("mni-") else os.path.join(RAW, "s", sid + ".glb")
    return p if os.path.exists(p) else None


def load_units(sid, e):
    """-> list of (side, points[N,3], bbox) for a mesh; side in L, R, M (left = +x)."""
    p = mesh_path(sid, e)
    if not p:
        return []
    sc = trimesh.load(p, force="scene")
    parts = []
    for n in sc.graph.nodes_geometry:
        T, g = sc.graph[n]
        m = sc.geometry[g].copy()
        m.apply_transform(T)
        if len(m.faces) == 0:
            continue
        comps = m.split(only_watertight=False) if len(m.faces) > 20 else [m]
        for c in comps:
            if len(c.faces) < 4:
                continue
            parts.append(c)
    if not parts:
        return []
    out = {"L": [], "R": [], "M": []}
    for c in parts:
        cx = float(c.vertices[:, 0].mean())
        w = float(np.ptp(c.vertices[:, 0]))
        side = "M" if (abs(cx) < 0.002 or (w > 0.05 and abs(cx) < 0.006)) else ("L" if cx > 0 else "R")
        out[side].append(c)
    units = []
    for side, cs in out.items():
        if not cs:
            continue
        m = trimesh.util.concatenate(cs) if len(cs) > 1 else cs[0]
        pts = m.sample(NS, return_index=False) if len(m.faces) > 4 else m.vertices
        pts = np.asarray(pts, dtype=np.float32)
        units.append((side, pts, (pts.min(0), pts.max(0))))
    return units


def compute(S, cur, verbose=False):
    """S = index structures; cur = ids that have curriculum meaning. Returns {id: {"L":[..],"R":[..],"M":[..]}}."""
    bad_name = re.compile(r"sulcus|fis|fissure|^lat_|ramus|nerve|artery|sinus|root|dura|falx|tentorium", re.I)
    units = {}
    for sid, e in S.items():
        if not e.get("file"):
            continue
        u = load_units(sid, e)
        if u:
            units[sid] = u
    cands = []
    for sid in units:
        e = S[sid]
        if sid not in cur or bad_name.search(e["name"]) or bad_name.search(sid):
            continue
        # per-unit size (the index bbox of a paired mesh spans both hemispheres)
        big = max(float(np.linalg.norm(hi - lo)) for _, _, (lo, hi) in units[sid])
        if big >= 0.12 or e["region"] in ("meninges", "vessels", "cranial-nerves", "spinal-nerves"):
            continue
        if sid in ("white-matter-of-telencephalon", "lentiform-nucleus"):  # lentiform = putamen + pallidum, redundant as a neighbour
            continue
        cands.append(sid)
    trees = {(sid, side): cKDTree(pts) for sid in cands for side, pts, _ in units[sid]}
    res = {}
    for sid in units:
        if sid not in cur:
            continue
        e = S[sid]
        rows = {"L": [], "R": [], "M": []}
        for side, pts, (lo, hi) in units[sid]:
            for o in cands:
                if o == sid or S[o].get("parent") == sid or e.get("parent") == o or frozenset((sid, o)) in PART_PAIRS:
                    continue
                # surface cortex is not "next to" a registered (approximate) deep label
                if e.get("parent") in CORTEX_PARENTS and o.startswith("mni-"):
                    continue
                for oside, opts, (olo, ohi) in units[o]:
                    # same hemisphere only (midline structures touch both)
                    if side != "M" and oside != "M" and side != oside:
                        continue
                    gap = np.maximum(0, np.maximum(lo - ohi, olo - hi))
                    if np.linalg.norm(gap) > MAXD:
                        continue
                    d, _ = trees[(o, oside)].query(pts)
                    dmin = float(d.min())
                    if dmin > MAXD:
                        continue
                    ca = float((d < TOUCH).mean())
                    d2, _ = trees[(sid, side)].query(opts) if (sid, side) in trees else (None, None)
                    cb = float((d2 < TOUCH).mean()) if d2 is not None else 0.0
                    # sampled surfaces that largely coincide = one structure drawn inside another: not a neighbour
                    if ca > 0.9 and cb > 0.9:
                        continue
                    key = o if oside == "M" else f"{o}:{oside}"
                    rows[side].append((-(max(ca, cb) + 0.5 * min(ca, cb)), dmin, key))
        out = {}
        for side, lst in rows.items():
            if not lst:
                continue
            lst.sort()
            seen, keep, fam = set(), [], 0
            for sc_, dm, k in lst:
                base = k.split(":")[0]
                if "internal-capsule" in base:  # the capsule and its three parts count as one family
                    if fam >= 2:
                        continue
                    fam += 1
                if k in seen or (side != "M" and base in seen):
                    continue
                seen.add(k)
                if side != "M":
                    seen.add(base)
                keep.append(k)
            out[side] = keep[: TOPN if side != "M" else 2 * TOPN]
        res[sid] = out
    return res


def apply(S, res):
    for sid, e in S.items():
        e.pop("nbs", None)
        e.pop("neighbors", None)
        r = res.get(sid)
        if not r:
            continue
        e["nbs"] = r
        flat = []
        for side in ("L", "M", "R"):
            for k in r.get(side, []):
                b = k.split(":")[0]
                if b not in flat:
                    flat.append(b)
        e["neighbors"] = flat[:TOPN]


VET = ["middle-temporal-gyrus", "superior-temporal-gyrus-lateral-part", "inferior-temporal-gyrus", "precentral-gyrus", "postcentral-gyrus", "angular-gyrus",
       "supramarginal-gyrus", "cuneus", "lingual-gyrus", "cingulate-gyrus", "parahippocampal-gyrus", "medial-occipitotemporal-gyrus-parahippocampal",
       "thalamus", "putamen", "globus-pallidus", "caudate-nucleus", "amygdaloid-body", "hippocampus", "hypothalamus", "pons", "midbrain", "medulla-oblongata",
       "red-nucleus", "olive", "inferior-colliculus", "superior-colliculus", "cerebellum", "flocculus", "dentate-nucleus", "lateral-ventricle", "third-ventricle",
       "fourth-ventricle", "fornix", "corpus-callosum", "mamillary-body", "insula", "superior-frontal-gyrus", "orbital-gyri", "mni-substantia-nigra",
       "mni-subthalamic-nucleus", "mni-internal-capsule", "mni-nucleus-accumbens", "mni-inferior-horn-of-lateral-ventricle", "mni-periaqueductal-gray"]

if __name__ == "__main__":
    p = os.path.join(ROOT, "public/atlas/index.json")
    idx = json.load(open(p, encoding="utf8"))
    S = idx["structures"]
    amap = json.load(open(os.path.join(ROOT, "src/data/atlas-map.json"), encoding="utf8"))
    links = json.load(open(os.path.join(ROOT, "src/data/atlas-links.json"), encoding="utf8"))
    cur = set(i for v in amap.values() for i in v["meshIds"]) | set(i for v in links.values() for i in v["meshIds"]) | set(k for k in S if k.startswith("mni-"))
    res = compute(S, cur)
    if "--vet" in sys.argv:
        for sid in VET:
            if sid in S:
                print(f"{S[sid]['name']}  [{sid}]")
                for side in ("L", "M"):
                    if res.get(sid, {}).get(side):
                        print("   ", side, ", ".join((S[k.split(':')[0]]['name'] + ('(' + k.split(':')[1] + ')' if ':' in k else '')) for k in res[sid][side]))
    if "--write" in sys.argv:
        apply(S, res)
        json.dump(idx, open(p, "w", encoding="utf8"), separators=(",", ":"), ensure_ascii=False)
        print("written", len(res))
