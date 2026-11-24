"""Atlas v3 in the Pathway tracer's frame, with the arterial territories: the copy Blood supply draws.

Blood supply lives in the old atlas's frame (Z-Anatomy, patient's left = +X), where its own arteries, veins and flow lines
are. This writes the v3 patch network there (zmap.mni_to_frame: mirror across the symmetric template's midline, then the
inverse warp; normals mirrored and turned by the warp's linear part; the mirror and the registration's own reflection cancel, so the
triangles keep their winding): _atlas/raw/v3/shell_f.raw.glb and inner_f.raw.glb (pack.mjs -> public/atlas3/shell_f.glb, inner_f.glb).

The outside surface carries _TERR: the artery whose territory each vertex lies in (index into ARTERIES + 1, 0 none), from
the course's supply map (src/data/supply-map.json): a structure's first artery, and where the map shares a structure
between two arteries (the precentral gyrus between the MCA and the ACA, the inferior temporal gyrus between the PCA and
the MCA, the cerebellar hemispheres between the SCA and the PICA ...) by where the surface lies and faces: the medial
surface and the convexity's medial strip to the ACA, the lateral convexity to the MCA, the inferior and medial
temporo-occipital surface and the occipital pole to the PCA, the cerebellum's upper surface to the SCA and its lower to
the PICA. The assignment is then smoothed over 4 mm (majority of the neighbours), so borders are not mesh borders.
Run after bake.py: tools/.venv/Scripts/python.exe -I tools/atlas3/frameglb.py
"""
import os, sys, json, struct
import numpy as np
from scipy.spatial import cKDTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import zmap  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
W = os.path.join(ROOT, "_atlas/raw/v3")
SUPPLY = json.load(open(os.path.join(ROOT, "src/data/supply-map.json"), encoding="utf8"))
ARTERIES = [a["id"] for a in SUPPLY["arteries"]]
TI = {a: i + 1 for i, a in enumerate(ARTERIES)}

# old mesh ids of the supply map's units without a course slug -> v3 keys
OLDMAP = {
    "cuneus": ["Cun"], "lingual-gyrus": ["LiG"], "precuneus": ["PrCun"], "paracentral-gyrus-and-sulcus": ["PCLr", "PCLc"],
    "straight-gyrus-gyrus-rectus": ["ReG"], "lateral-occipital-gyrus-middle-occipital-gyrus": ["IOG"], "inferior-occipital-gyrus-and-sulcus": ["IOG"],
    "occipital-pole": ["OP"], "superior-occipital-gyri": ["SOG"], "lateral-occipitotemporal-gyrus": ["FuGt", "FuGo"], "temporal-pole": ["TP"],
    "temporal-plane": ["PLT", "PLP"], "septal-nuclei": ["SEP"],
    "lingula-of-cerebellum": ["CbVa"], "central-lobule": ["CbVa"], "wing-of-central-lobule": ["CbVa"], "culmen": ["CbVa"],
    "pyramis-of-vermis": ["CbVp"], "uvula-of-vermis": ["CbVp"], "nodule-of-vermis": ["Nod"],
    "anterior-quadrangular-lobule": ["CbLa", "CbPVa"], "posterior-quadrangular-lobule": ["CbLp", "CbPVp"], "superior-semilunar-lobule": ["CbLp", "CbPVp"],
    "inferior-semilunar-lobule": ["CbLp", "CbPVp"], "gracile-lobule": ["CbLp", "CbPVp"], "biventral-lobule": ["CbLp", "CbPVp"],
}


def key_arteries():
    """v3 key -> the arteries of the most specific supply unit that holds it (first = its colour)."""
    meta = json.load(open(os.path.join(W, "labels.json")))
    key_of = {L["id"]: L["key"] for L in meta["labels"]}
    cat = {it["slug"]: it["ids"] for it in json.load(open(os.path.join(ROOT, "public/atlas3/catalog.json")))["items"]}
    best = {}
    for u in SUPPLY["units"]:
        keys = set()
        if u.get("slug") and cat.get(u["slug"]):
            keys |= {key_of[i] for i in cat[u["slug"]]}
        for m in u["meshes"]:
            keys |= set(OLDMAP.get(m, []))
        arts = [a for a in u["arteries"] if a in TI]
        if not keys or not arts:
            continue
        for k in keys:
            # the most specific unit wins (the pyramids over the medulla); a shared cerebellar lobule unit is merged
            if k not in best or len(keys) < best[k][0]:
                best[k] = (len(keys), arts)
            elif len(keys) == best[k][0]:
                best[k] = (len(keys), list(dict.fromkeys(best[k][1] + arts)))
    out = {k: v[1] for k, v in best.items()}
    # the posterior lobe spans both surfaces: its upper surface (simple and superior semilunar lobules, declive, folium) is
    # the SCA's, its lower (inferior semilunar, gracile and biventral lobules, pyramis, uvula) the PICA's
    for k in ("CbLp", "CbPVp", "CbVp"):
        out[k] = ["sca", "pica"]
    return out


def territories(P, N, vkey, arts_of):
    """Per outside vertex: the territory index (see the module doc)."""
    mni = zmap.world_to_mni(P)
    nm = zmap.world_to_mni(N) / 1000.0  # direction in MNI axes (x right, y anterior, z up)
    x, y, z = mni[:, 0], mni[:, 1], mni[:, 2]
    toward_mid = -np.sign(x) * nm[:, 0]  # > 0: faces the midline
    t = np.zeros(len(P), np.int16)
    for k in np.unique(vkey):
        sel = vkey == k
        arts = arts_of.get(k)
        if not arts:
            continue
        a = arts[0]
        t[sel] = TI[a]
        s = set(arts[:2])
        if s == {"aca", "mca"}:
            # the medial surface and the convexity's medial strip (about 2 cm from the midline, above the cingulate
            # level) to the ACA, the lateral convexity to the MCA
            aca = (toward_mid > 0.45) | ((np.abs(x) < 22) & (z > 38))
            t[sel] = np.where(aca[sel], TI["aca"], TI["mca"])
        elif s == {"pca", "mca"}:
            pca = (nm[:, 2] < -0.35) | (toward_mid > 0.45) | (y < -88)
            t[sel] = np.where(pca[sel], TI["pca"], TI["mca"])
        elif s == {"aca", "pca"}:
            t[sel] = np.where((y > -45)[sel], TI["aca"], TI["pca"])
        elif s == {"sca", "pica"}:
            t[sel] = np.where((nm[:, 2] > 0.0)[sel], TI["sca"], TI["pica"])
    return t


def smooth(P, t, r=0.004, rounds=2):
    tree = cKDTree(P)
    for _ in range(rounds):
        nb = tree.query_ball_point(P, r)
        out = t.copy()
        for i, ns in enumerate(nb):
            if len(ns) > 2:
                v = t[ns]
                v = v[v > 0]
                if len(v):
                    out[i] = np.bincount(v).argmax()
        t = out
    return t


def write_glb(path, P, F, attrs):
    blobs, views, accs, offs = [], [], [], 0

    def add(arr, ctype, typ, norm=False, target=None, minmax=False):
        nonlocal offs
        raw = np.ascontiguousarray(arr).tobytes()
        pad = (-len(raw)) % 4
        views.append(dict(buffer=0, byteOffset=offs, byteLength=len(raw), **({"target": target} if target else {})))
        acc = dict(bufferView=len(views) - 1, componentType=ctype, count=int(arr.shape[0]), type=typ)
        if norm:
            acc["normalized"] = True
        if minmax:
            acc["min"] = arr.min(0).tolist(); acc["max"] = arr.max(0).tolist()
        accs.append(acc)
        blobs.append(raw + b"\0" * pad); offs += len(raw) + pad
        return len(accs) - 1

    am = {"POSITION": add(P.astype(np.float32), 5126, "VEC3", target=34962, minmax=True)}
    for name, arr, ct, typ, norm in attrs:
        am[name] = add(arr, ct, typ, norm, 34962)
    ind = add(F.astype(np.uint32).ravel(), 5125, "SCALAR", target=34963)
    gl = dict(asset=dict(version="2.0", generator="anki-plus atlas3 frameglb.py"), scene=0, scenes=[dict(nodes=[0])],
              nodes=[dict(mesh=0, name=os.path.basename(path).split(".")[0])], meshes=[dict(primitives=[dict(attributes=am, indices=ind, mode=4)])],
              buffers=[dict(byteLength=offs)], bufferViews=views, accessors=accs)
    js = json.dumps(gl, separators=(",", ":")).encode()
    js += b" " * ((-len(js)) % 4)
    bin_ = b"".join(blobs)
    with open(path, "wb") as fh:
        fh.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)))
        fh.write(struct.pack("<II", len(js), 0x4E4F534A)); fh.write(js)
        fh.write(struct.pack("<II", len(bin_), 0x004E4942)); fh.write(bin_)
    print("wrote", path, len(F), "triangles", f"{os.path.getsize(path) / 1e6:.1f} MB", flush=True)


def main():
    z = np.load(os.path.join(W, "patches.npz"))
    P, F, LAB = z["P"].astype(np.float64), z["F"].astype(np.int64), z["LAB"].astype(np.int64)
    A = np.load(os.path.join(W, "bake_arrays.npz"))
    NA, NB, AO, SULC, AREAS, VLAB = A["NA"], A["NB"], A["AO"], A["SULC"], A["AREAS"], A["VLAB"]
    meta = json.load(open(os.path.join(W, "labels.json")))
    key_of = {L["id"]: L["key"] for L in meta["labels"]}
    # territories on the outside surface (in the atlas's own space, before the frame change)
    ext = LAB[:, 1] == 0
    ext_v = np.unique(F[ext].ravel())
    vkey = np.array([key_of.get(int(l), "") for l in VLAB[ext_v, 0]])
    TERR = np.zeros(len(P), np.uint8)
    t = territories(P[ext_v], NA[ext_v], vkey, key_arteries())
    TERR[ext_v] = smooth(P[ext_v], t).astype(np.uint8)
    print("territories:", {ARTERIES[i - 1]: int((TERR[ext_v] == i).sum()) for i in range(1, len(ARTERIES) + 1) if (TERR[ext_v] == i).any()}, flush=True)
    # the frame change: positions through mni_to_frame, normals mirrored and through the frame's linear part
    Pf = zmap.mni_to_frame(zmap.world_to_mni(P))
    Lin = np.linalg.inv(zmap.M_Z2MNI[:3, :3])  # MNI mm -> frame m (the warp's linear part)
    Ninv = np.linalg.inv(Lin).T  # normals go through the inverse transpose

    def nrm(Nw):
        n = zmap.world_to_mni(Nw) / 1000.0  # world direction -> MNI axes
        n = n * [-1.0, 1.0, 1.0]  # the mirror
        n = n @ Ninv.T
        return (n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-20)).astype(np.float32)

    for name, sel, with_b in (("shell_f", np.nonzero(ext)[0], False), ("inner_f", np.nonzero(~ext)[0], True)):
        # the frame change is a mirror composed with the registration's own reflection (its axes): orientation kept, so the
        # triangles keep their winding (a front still faces the second region)
        f = F[sel]
        used, inv = np.unique(f.ravel(), return_inverse=True)
        tri = inv.reshape(-1, 3)
        attrs = [("NORMAL", nrm(NA[used]), 5126, "VEC3", False), ("_LABELS", VLAB[used].astype(np.uint16), 5123, "VEC2", False)]
        if with_b:
            attrs.append(("_NORMALB", nrm(NB[used] + 1e-9), 5126, "VEC3", False))
        else:
            attrs.append(("_AO", np.round(AO[used] * 255).astype(np.uint8)[:, None], 5121, "SCALAR", True))
            attrs.append(("_SULC", SULC[used].astype(np.uint8)[:, None], 5121, "SCALAR", False))
            attrs.append(("_AREAS", AREAS[used].astype(np.float32)[:, None], 5126, "SCALAR", False))
            attrs.append(("_TERR", TERR[used].astype(np.uint8)[:, None], 5121, "SCALAR", False))
        write_glb(os.path.join(W, name + ".raw.glb"), Pf[used], tri, attrs)


if __name__ == "__main__":
    main()
