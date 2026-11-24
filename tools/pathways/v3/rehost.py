"""Pathway tracer on the 3D atlas v3: re-host the built pathways onto the atlas's anatomy.

The pathways were built (build.mjs) around the old atlas's meshes, in the Z-Anatomy frame, where the brainstem nuclei and
the gyri sit up to 16 mm from where the course's plates and the v3 atlas put them. This step, run after build.mjs:

  1. the v3 structure behind each old brain host (a course structure of the v3 catalog, both sides), its surface carried
     into the tracer's frame by the inverse of the atlas warp (zmap.mni_to_z): public/pathways/v3/hosts3.glb, one closed
     mesh per structure and side ("<old id>.<L|R|M>"), with hosts3.json (names);
  2. a smooth warp of the brain (thin-plate spline) that takes each old host's centre to its v3 structure's centre, side
     by side, and leaves the body alone (anchors below the brain and around the head);
  3. every pathway's points (fibres, cell bodies, synapses, crossings, carved stops) through that warp, endpoints that end
     in a re-hosted structure pulled just inside it, and the brain hosts renamed "w:<old id>" (drawn from hosts3.glb);
  4. old brain hosts with no v3 counterpart (cochlear and salivatory nuclei, the cerebellar lobules ...) are carried by the
     same warp, so they stay around their fibres: also in hosts3.glb.

Input: the build's public/pathways/v3/*.json (copied once to _atlas/pw3_built/ and always read from there).
Run:  node tools/pathways/v3/oldmeshes.mjs _atlas/pw3_raw/oldhosts.json <ids>   (rehost.py prints the command)
      tools/.venv/Scripts/python.exe -I tools/pathways/v3/rehost.py
"""
import os, sys, json, glob, shutil, subprocess
import numpy as np
import trimesh
from scipy.interpolate import RBFInterpolator
from scipy.spatial import cKDTree

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools/atlas3"))
import zmap  # noqa: E402

PW = os.path.join(ROOT, "public/pathways/v3")
BUILT = os.path.join(ROOT, "_atlas/pw3_built")
RAW = os.path.join(ROOT, "_atlas/raw/v3")
OLDJ = os.path.join(ROOT, "_atlas/pw3_raw/oldhosts.json")

# old atlas host -> v3 course structure (catalog slug)
MAP = {
    "precentral-gyrus": "precentral-gyrus", "postcentral-gyrus": "postcentral-gyrus", "paracentral-gyrus-and-sulcus": ["atlas:PCLr", "atlas:PCLc"],
    "middle-frontal-gyrus": "middle-frontal-gyrus", "transverse-temporal-gyri": "transverse-temporal-gyrus",
    "medial-occipitotemporal-gyrus-parahippocampal": "parahippocampal-gyrus", "cuneus": "atlas:Cun", "lingual-gyrus": "atlas:LiG",
    "orbital-gyri": ["atlas:MOrG", "atlas:AOrG", "atlas:POrG", "atlas:LOrG"],
    "white-matter-of-telencephalon": "white-matter", "mni-posterior-limb-of-internal-capsule": "posterior-limb-of-internal-capsule",
    "mni-genu-of-internal-capsule": "genu-of-internal-capsule", "mni-internal-capsule": "internal-capsule",
    "putamen": "putamen", "globus-pallidus": "globus-pallidus", "mni-subthalamic-nucleus": "subthalamic-nucleus",
    "mni-substantia-nigra": "substantia-nigra", "mni-nucleus-accumbens": "nucleus-accumbens", "septal-nuclei": "atlas:SEP",
    "amygdaloid-body": "amygdala", "hippocampus": "hippocampus", "fornix": "fornix", "mamillary-body": "mammillary-bodies",
    "habenula": "habenula", "hypothalamus": "hypothalamus", "thalamus": "thalamus", "lateral-geniculate-body": "lateral-geniculate-nucleus",
    "medial-geniculate-body": "medial-geniculate-nucleus", "optic-tract": "optic-tract", "optic-chiasm": "optic-chiasm",
    "midbrain": "midbrain", "pons": "pons", "medulla-oblongata": "medulla",
    "red-nucleus": "red-nucleus", "superior-colliculus": "superior-colliculus", "inferior-colliculus": "inferior-colliculus",
    "base-of-peduncle": "cerebral-peduncles", "olive": "inferior-olivary-nucleus", "pyramid-of-medulla-oblongata": "pyramids",
    "mni-medial-lemniscus": "medial-lemniscus", "mni-medial-longitudinal-fasciculus": "medial-longitudinal-fasciculus",
    "mni-longitudinal-fibers-of-the-pons": "longitudinal-fibers-of-the-pons", "mni-middle-cerebellar-peduncle": "middle-cerebellar-peduncle",
    "mni-inferior-cerebellar-peduncle": "inferior-cerebellar-peduncle", "superior-cerebellar-peduncle": "superior-cerebellar-peduncle",
    "motor-nucleus-of-facial-nerve": "facial-nucleus", "vestibular-nuclei": "vestibular-nuclei", "posterior-nucleus-of-vagus-nerve": "dorsal-motor-nucleus-of-the-vagus",
    "nucleus-ambiguus": "nucleus-ambiguus", "nucleus-of-oculomotor-nerve": "oculomotor-nucleus", "accessory-nucleus-of-oculomotor-nerve": "edinger-westphal-nucleus",
    "nucleus-of-abducens-nerve": "abducens-nucleus", "nucleus-of-hypoglossal-nerve": "hypoglossal-nucleus", "flocculus": "flocculus",
}
# old brain hosts kept as they are but carried by the warp: no v3 counterpart, or a different granularity, or a thin tract
# the warped fibres would leave (checked: under 50 % of a tract's fibre points stay inside its v3 shape, rehost_stats.json),
# or the caudal medulla below the atlas's last slice
CARRY = ["posterior-cochlear-nucleus", "anterior-cochlear-nucleus", "inferior-salivatory-nucleus", "superior-salivatory-nucleus",
         "posterior-quadrangular-lobule", "anterior-quadrangular-lobule", "calcarine-sulcus", "stria-terminalis", "stria-medullaris-thalami"]
KEEP_OLD = {"mni-longitudinal-fibers-of-the-pons", "mni-genu-of-internal-capsule", "mni-posterior-limb-of-internal-capsule", "mni-internal-capsule",
            "mni-medial-lemniscus", "mni-medial-longitudinal-fasciculus", "fornix", "optic-chiasm", "optic-tract", "medulla-oblongata",
            "pyramid-of-medulla-oblongata", "superior-cerebellar-peduncle", "septal-nuclei"}
CARRY += sorted(KEEP_OLD)  # (they still anchor the warp: the landmarks use every pair of MAP)
Y_BRAIN = 1.545  # Z-frame height of the brain's lowest part (the medulla's end): below it nothing moves


def label_meshes():
    """v3 label surfaces (world metres): faces of every patch touching the label, oriented outward."""
    z = np.load(os.path.join(RAW, "patches.npz"))
    return z["P"].astype(np.float64), z["F"].astype(np.int64), z["LAB"].astype(np.int64)


def closed_mesh(P, F, LAB, ids):
    sel0 = np.isin(LAB[:, 0], ids) & ~np.isin(LAB[:, 1], ids)
    sel1 = np.isin(LAB[:, 1], ids) & ~np.isin(LAB[:, 0], ids)
    faces = np.concatenate([F[sel0], F[sel1][:, ::-1]])  # normal from LAB0 into LAB1: flip those where the label is LAB1
    if not len(faces):
        return None
    used, inv = np.unique(faces.ravel(), return_inverse=True)
    m = trimesh.Trimesh(vertices=P[used], faces=inv.reshape(-1, 3), process=False)
    m.merge_vertices()
    return m


def main():
    os.makedirs(BUILT, exist_ok=True)
    if not glob.glob(os.path.join(BUILT, "*.json")):
        for f in glob.glob(os.path.join(PW, "*.json")):
            shutil.copy(f, BUILT)
    meta = json.load(open(os.path.join(RAW, "labels.json")))
    by_id = {L["id"]: L for L in meta["labels"]}
    cat = json.load(open(os.path.join(ROOT, "public/atlas3/catalog.json")))
    cat_ids = {it["slug"]: it["ids"] for it in cat["items"]}
    if not os.path.exists(OLDJ):
        ids = " ".join(list(MAP) + CARRY)
        sys.exit(f"first: node tools/pathways/v3/oldmeshes.mjs _atlas/pw3_raw/oldhosts.json {ids}")
    old = json.load(open(OLDJ))
    P, F, LAB = label_meshes()

    # ---------------------------------------------------------------- 1. v3 hosts in the tracer frame
    scene = trimesh.Scene()
    names = {}
    src_pts, dst_pts = [], []
    for oid, slug in MAP.items():
        ids = sorted({i for sl in (slug if isinstance(slug, list) else [slug]) for i in (cat_ids.get(sl) or [])})
        if not ids or oid not in old:
            print(f"  {oid}: no v3 structure ({slug})")
            continue
        o = old[oid]
        opos = np.array(o["pos"]).reshape(-1, 3)
        for side in ("L", "R", "M"):
            sid = [i for i in ids if by_id[i]["side"] == side]
            if not sid:
                continue
            m = closed_mesh(P, F, LAB, sid)
            if m is None:
                continue
            m.vertices = zmap.mni_to_frame(zmap.world_to_mni(np.asarray(m.vertices)))
            m.invert()  # the mirror turned the triangles inside out
            if oid not in KEEP_OLD:
                scene.add_geometry(m, node_name=f"{oid}.{side}", geom_name=f"{oid}.{side}")
                names[f"{oid}.{side}"] = slug if isinstance(slug, str) else slug[0]
            # landmark: the old structure's centre on that side -> the v3 structure's centre (Z frame)
            sel = opos[:, 0] > 0 if side == "L" else opos[:, 0] < 0 if side == "R" else np.ones(len(opos), bool)
            if sel.sum() > 20:
                src_pts.append(opos[sel].mean(0)); dst_pts.append(np.asarray(m.vertices).mean(0))
    src_pts, dst_pts = np.array(src_pts), np.array(dst_pts)
    print("landmarks:", len(src_pts), " mean shift", np.round(np.linalg.norm(dst_pts - src_pts, axis=1).mean() * 1000, 1), "mm")

    # ---------------------------------------------------------------- 2. the warp: landmarks + fixed anchors (body, around the head)
    c = dst_pts.mean(0)
    anchors = []
    for y in np.linspace(0.6, Y_BRAIN - 0.02, 12):
        for x in (-0.15, 0.0, 0.15):
            for zz in (-0.15, 0.0, 0.15):
                anchors.append([x, y, zz])
    # a shell 15 mm outside the brain's outline: the skull, the face and the body never move
    hull = trimesh.load(os.path.join(RAW, "hull_z.raw.glb"), force="mesh")
    hv, hn = np.asarray(hull.vertices), np.asarray(hull.vertex_normals)
    out_n = np.where(((hv - hv.mean(0)) * hn).sum(1, keepdims=True) < 0, -hn, hn)  # outward
    pick = np.random.default_rng(3).choice(len(hv), size=min(400, len(hv)), replace=False)
    anchors += list(hv[pick] + out_n[pick] * 0.015)
    anchors = np.array(anchors)
    X = np.concatenate([src_pts, anchors]); D = np.concatenate([dst_pts - src_pts, np.zeros_like(anchors)])
    tps = RBFInterpolator(X, D, kernel="thin_plate_spline", smoothing=1e-7)

    def warp(p):
        p = np.asarray(p, float).reshape(-1, 3)
        out = p.copy()
        m = p[:, 1] > Y_BRAIN - 0.03  # the brain and the region just below it
        if m.any():
            out[m] = p[m] + tps(p[m])
        return out

    # ---------------------------------------------------------------- 3. old brain hosts carried by the warp
    for oid in CARRY:
        if oid not in old:
            continue
        o = old[oid]
        v = warp(np.array(o["pos"]).reshape(-1, 3))
        m = trimesh.Trimesh(vertices=v, faces=np.array(o["idx"]).reshape(-1, 3), process=False)
        scene.add_geometry(m, node_name=f"{oid}.X", geom_name=f"{oid}.X")
        names[f"{oid}.X"] = None
    out = os.path.join(RAW, "hosts3.raw.glb")
    scene.export(out, file_type="glb")
    json.dump(dict(hosts=names), open(os.path.join(PW, "hosts3.json"), "w"), indent=0)
    subprocess.run(["node", os.path.join(ROOT, "tools/atlas3/pack_one.mjs"), out, os.path.join(PW, "hosts3.glb")], check=True, cwd=ROOT)

    # ---------------------------------------------------------------- 4. the pathways through the warp, re-hosted
    rehosted = (set(MAP) - KEEP_OLD) | set(CARRY)
    meshes = {}
    for k, g in scene.geometry.items():
        meshes[k] = g

    def remap_host(h):
        # the host keys stay (a:<old id>): only the geometry behind them changes (hosts3.glb), so names, links and insets
        # keep working
        return h

    MESHDATA = {}

    def mdata(k):
        """Per host mesh: its triangles, and a KD-tree over surface samples (vertices and face centres) with their normals."""
        if k not in MESHDATA:
            m = meshes[k]
            v, fn = np.asarray(m.vertices), np.asarray(m.face_normals)
            tri = np.asarray(m.triangles)
            samp = np.concatenate([v, tri.mean(1)])
            nrm = np.concatenate([np.asarray(m.vertex_normals), fn])
            MESHDATA[k] = (tri, cKDTree(samp), samp, nrm)
        return MESHDATA[k]

    def inside(k, p):
        """Generalised winding number of the point (works for the slightly open meshes too)."""
        tri = mdata(k)[0]
        a, b, c = tri[:, 0] - p, tri[:, 1] - p, tri[:, 2] - p
        la, lb, lc = np.linalg.norm(a, axis=1), np.linalg.norm(b, axis=1), np.linalg.norm(c, axis=1)
        num = np.einsum("ij,ij->i", a, np.cross(b, c))
        den = la * lb * lc + np.einsum("ij,ij->i", a, b) * lc + np.einsum("ij,ij->i", b, c) * la + np.einsum("ij,ij->i", c, a) * lb
        w = np.arctan2(num, den).sum() * 2.0 / (4 * np.pi)
        return abs(w) > 0.5

    def inside_point(host, p):
        """Pull a point into its re-hosted structure (the nearest surface sample, 0.3 mm inside), if it lies outside."""
        if not isinstance(host, str) or not host.startswith("a:") or host[2:].split("@")[0] not in rehosted:
            return p
        base, _, side = host[2:].partition("@")
        cands = [k for k in meshes if k.startswith(base + ".") and (not side or k.endswith("." + side) or k.endswith(".M") or k.endswith(".X"))]
        if not cands:
            return p
        best = None
        for k in cands:
            if inside(k, p):
                return p
            _, tree, samp, nrm = mdata(k)
            d, i = tree.query(p)
            if best is None or d < best[1]:
                best = (samp[i] - nrm[i] * 0.0003, d)
        return best[0] if best is not None else p

    stats = []
    HOST_STATS = {}
    for f in sorted(glob.glob(os.path.join(BUILT, "*.json"))):
        name = os.path.basename(f)
        pw = json.load(open(f))
        if not isinstance(pw, dict) or "beats" not in pw:
            shutil.copy(f, os.path.join(PW, name))
            continue
        moved = 0
        for b in pw["beats"]:
            for side in ("L", "R"):
                sb = b.get(side)
                if not sb:
                    continue
                for fb in sb.get("f", []):
                    pts = np.array(fb["pts"], float).reshape(-1, 3)
                    w = warp(pts)
                    moved += int((np.linalg.norm(w - pts, axis=1) > 1e-4).sum())
                    fb["pts"] = [round(float(v), 5) for v in w.ravel()]
                    fb["seg"] = [[i, remap_host(h)] for i, h in fb.get("seg", [])]
                for mk in ("soma", "syn", "start"):
                    if sb.get(mk):
                        sb[mk]["host"] = remap_host(sb[mk]["host"])
                        p = warp([sb[mk]["p"]])[0]
                        p = inside_point(sb[mk]["host"], p)
                        sb[mk]["p"] = [round(float(v), 5) for v in p]
                if sb.get("cross"):
                    cr = sb["cross"]
                    p0 = np.array(cr["p"], float)
                    p1 = warp([p0])[0]
                    dy = float(p1[1] - p0[1])
                    cr["p"] = [round(float(v), 5) for v in p1]
                    cr["host"] = remap_host(cr["host"])
                    for k in ("yMin", "yMax"):
                        if k in cr:
                            cr[k] = round(cr[k] + dy, 5)
                for st in sb.get("stops", []):
                    st["key"] = remap_host(st["key"]) if st["key"].startswith(("a:", "u:")) else st["key"]
                    if st.get("carve"):
                        st["carve"]["mesh"] = remap_host(st["carve"]["mesh"])
                        st["carve"]["p"] = [round(float(v), 5) for v in warp([st["carve"]["p"]])[0]]
        # fibre ends that end in a re-hosted structure: pulled inside it, the last few points eased along
        for b in pw["beats"]:
            for side in ("L", "R"):
                sb = b.get(side) or {}
                for fb in sb.get("f", []):
                    pts = np.array(fb["pts"], float).reshape(-1, 3)
                    segs = fb.get("seg", [])
                    if len(pts) < 2 or not segs:
                        continue
                    for end, host in ((0, segs[0][1]), (len(pts) - 1, segs[-1][1])):
                        q = inside_point(host, pts[end])
                        dq = q - pts[end]
                        if np.linalg.norm(dq) < 1e-6:
                            continue
                        n = min(6, len(pts) - 1)
                        for k in range(n):
                            i = end + k if end == 0 else end - k
                            pts[i] += dq * (1 - k / n)
                    fb["pts"] = [round(float(v), 5) for v in pts.ravel()]
        if "geo" in pw:
            # proxies, connectors and nerve tubes in the brain move with it
            for k, g in pw["geo"].items():
                if isinstance(g, dict):
                    for kk in ("pts", "p", "c", "center"):
                        if kk in g and isinstance(g[kk], list) and g[kk] and isinstance(g[kk][0], (int, float)):
                            arr = np.array(g[kk], float)
                            if arr.size % 3 == 0:
                                g[kk] = [round(float(v), 5) for v in warp(arr.reshape(-1, 3)).ravel()]
        json.dump(pw, open(os.path.join(PW, name), "w"), separators=(",", ":"))
        # check: the fibre points that run in one re-hosted structure, inside it
        n_in = n_all = 0
        worst = []
        for b in pw["beats"]:
            for side in ("L", "R"):
                for fb in (b.get(side) or {}).get("f", []):
                    pts = np.array(fb["pts"], float).reshape(-1, 3)
                    segs = fb.get("seg", [])
                    for si, (i0, h) in enumerate(segs):
                        i1 = segs[si + 1][0] if si + 1 < len(segs) else len(pts)
                        if not (isinstance(h, str) and h.startswith("a:") and h[2:].split("@")[0] in rehosted):
                            continue
                        base, _, sd = h[2:].partition("@")
                        cands = [k for k in meshes if k.startswith(base + ".") and (not sd or k.endswith("." + sd) or k.endswith(".M") or k.endswith(".X"))]
                        idx = list(range(i0, i1, 3))
                        ok = sum(1 for i in idx if any(inside(k, pts[i]) for k in cands))
                        n_in += ok; n_all += len(idx)
                        agg = HOST_STATS.setdefault(base, [0, 0])
                        agg[0] += ok; agg[1] += len(idx)
                        if idx and ok / len(idx) < 0.6:
                            worst.append(f"{base}@{sd or '-'} {ok}/{len(idx)}")
        stats.append((name, moved, n_in, n_all, worst))
    print("pathways re-hosted:", len(stats), " points moved:", sum(st[1] for st in stats))
    print("per host (inside / sampled):")
    for base, (a_, n_) in sorted(HOST_STATS.items(), key=lambda t: t[1][0] / max(1, t[1][1])):
        print(f"    {base:46s} {a_:4d}/{n_:4d} = {100 * a_ / max(1, n_):5.1f}%")
    json.dump({k: v for k, v in HOST_STATS.items()}, open(os.path.join(ROOT, "_atlas/pw3_raw/rehost_stats.json"), "w"))
    for name, moved, n_in, n_all, worst in stats:
        if n_all:
            print(f"  {name:36s} inside {100 * n_in / n_all:5.1f}% of {n_all:5d} sampled points" + (f"   low: {'; '.join(worst[:4])}" if worst else ""))


if __name__ == "__main__":
    main()
