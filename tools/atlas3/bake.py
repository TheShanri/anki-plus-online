"""Atlas v3, step 3: shading data for the patch network and the raw GLBs.

Per vertex of every patch (a = LAB0 behind the normal, b = LAB1 in front):
  NORMAL    smooth outward normal of region a's whole boundary at that point (all of a's patches, area-weighted), so a
            structure is shaded smoothly across the borders of its patches
  _NORMALB  the same for region b (interior patches only)
  _LABELS   (a, b) uint16
  _AO       ambient occlusion of the outside surface (exterior patches only): the share of open directions around the
            point within 10 mm, sampled in the label volume (sulci and the depths of the lateral fissure come out dark)
Writes _atlas/raw/v3/shell.raw.glb (patches with b = 0: the brain as seen from outside) and inner.raw.glb (all other
patches: the inside, drawn for cuts and hidden structures). pack.mjs then quantises and meshopt-compresses them.
Run: tools/.venv/Scripts/python.exe -I tools/atlas3/bake.py
"""
import os, json, struct, time
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
W = os.path.join(ROOT, "_atlas/raw/v3")
T0 = time.time()


def log(*a):
    print(f"[{time.time() - T0:6.1f}s]", *a, flush=True)


z = np.load(os.path.join(W, "patches.npz"))
P, F, LAB = z["P"].astype(np.float64), z["F"].astype(np.int64), z["LAB"].astype(np.int64)
log("patches:", len(P), "vertices", len(F), "triangles")

# global point identity (patches duplicate their border vertices)
q = np.round(P * 1e7).astype(np.int64)
_, gid = np.unique(q, axis=0, return_inverse=True)
gid = gid.ravel()
G = int(gid.max()) + 1
log("distinct points", G)

a, b, c = P[F[:, 0]], P[F[:, 1]], P[F[:, 2]]
fn = np.cross(b - a, c - a) * 0.5  # area-weighted, points from LAB0 into LAB1
del a, b, c


def region_normals():
    """Sum of outward face normals per (region, point)."""
    reg = np.concatenate([LAB[:, 0], LAB[:, 1]])
    sgn = np.concatenate([np.ones(len(F)), -np.ones(len(F))])
    keys, vecs = [], []
    for k in range(3):
        pid = gid[F[:, k]]
        kk = reg * G + np.concatenate([pid, pid])
        keep = reg > 0
        keys.append(kk[keep])
        vecs.append((np.concatenate([fn, fn]) * sgn[:, None])[keep])
    keys = np.concatenate(keys); vecs = np.concatenate(vecs)
    uk, inv = np.unique(keys, return_inverse=True)
    acc = np.zeros((len(uk), 3))
    np.add.at(acc, inv, vecs)
    acc /= np.linalg.norm(acc, axis=1, keepdims=True) + 1e-20
    return uk, acc


uk, acc = region_normals()
log("region normals:", len(uk))


def lookup(region, pids):
    k = region * G + pids
    i = np.searchsorted(uk, k)
    i = np.clip(i, 0, len(uk) - 1)
    ok = uk[i] == k
    out = np.zeros((len(k), 3))
    out[ok] = acc[i[ok]]
    return out


# per vertex: the labels of its patch (every vertex belongs to exactly one patch)
vlab = np.zeros((len(P), 2), np.int64)
vlab[F[:, 0]] = LAB; vlab[F[:, 1]] = LAB; vlab[F[:, 2]] = LAB
NA = lookup(vlab[:, 0], gid)
NB = np.where((vlab[:, 1] > 0)[:, None], lookup(vlab[:, 1], gid), 0.0)
log("vertex normals done")

# ambient occlusion of the outside surface, from the label volume
V = np.load(os.path.join(W, "labels.npy"), mmap_mode="r")
meta = json.load(open(os.path.join(W, "labels.json")))
AFF = np.array(meta["affine"]); VOX = meta["voxel_mm"]
ext_v = np.nonzero(vlab[:, 1] == 0)[0]
rng = np.random.default_rng(7)
dirs = rng.normal(size=(48, 3)); dirs /= np.linalg.norm(dirs, axis=1, keepdims=True)
DIST = np.array([1.5, 3.0, 5.0, 7.5, 10.0])
WDIST = np.array([1.0, 0.9, 0.7, 0.5, 0.35])
Vs = np.asarray(V)
solid = Vs > 0
del Vs


def world_to_vox(p):  # world metres -> MNI mm -> voxel
    mni = np.stack([-p[:, 0], p[:, 2], p[:, 1]], 1) * 1000.0
    return np.round((mni - AFF[:3, 3]) / VOX).astype(np.int64)


AO = np.ones(len(P), np.float32)
CH = 40000
for s in range(0, len(ext_v), CH):
    idx = ext_v[s:s + CH]
    p, n = P[idx], NA[idx]
    occ = np.zeros(len(idx)); wsum = 0.0
    for d in dirs:
        cos = n @ d  # world-space normal vs direction
        dd = np.where(cos[:, None] < 0, -d, d)  # flip into the outward hemisphere
        cw = np.abs(cos)
        for dist, wd in zip(DIST, WDIST):
            v = world_to_vox(p + dd * (dist / 1000.0))
            v = np.clip(v, 0, np.array(solid.shape) - 1)
            hit = solid[v[:, 0], v[:, 1], v[:, 2]]
            occ += hit * wd * cw
        wsum += 1
    norm = (WDIST.sum() * np.abs(dirs @ np.array([0, 0, 1.0])).mean())  # rough normaliser
    AO[idx] = np.clip(1.0 - occ / (wsum * WDIST.sum() * 0.5), 0.0, 1.0)
log("ambient occlusion:", len(ext_v), "exterior vertices; mean", round(float(AO[ext_v].mean()), 3))
del solid


def oct_free(n):
    n = n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-20)
    return n.astype(np.float32)


def write_glb(path, sel_faces, with_b):
    f = F[sel_faces]
    used, inv = np.unique(f.ravel(), return_inverse=True)
    tri = inv.reshape(-1, 3).astype(np.uint32)
    pos = P[used].astype(np.float32)
    nrm = oct_free(NA[used])
    lab = vlab[used].astype(np.uint16)
    attrs = [("POSITION", pos, 5126, "VEC3", False), ("NORMAL", nrm, 5126, "VEC3", False), ("_LABELS", lab, 5123, "VEC2", False)]
    if with_b:
        attrs.append(("_NORMALB", oct_free(NB[used] + 1e-9), 5126, "VEC3", False))
    else:
        attrs.append(("_AO", np.round(AO[used] * 255).astype(np.uint8)[:, None], 5121, "SCALAR", True))
    blobs, views, accs, offs = [], [], [], 0
    def add(arr, ctype, typ, norm=False, target=None, minmax=False):
        nonlocal offs
        raw = np.ascontiguousarray(arr).tobytes()
        pad = (-len(raw)) % 4
        views.append(dict(buffer=0, byteOffset=offs, byteLength=len(raw), **({"target": target} if target else {})))
        acc = dict(bufferView=len(views) - 1, componentType=ctype, count=int(arr.shape[0]), type=typ)
        if norm: acc["normalized"] = True
        if minmax:
            acc["min"] = arr.min(0).tolist(); acc["max"] = arr.max(0).tolist()
        accs.append(acc)
        blobs.append(raw + b"\0" * pad); offs += len(raw) + pad
        return len(accs) - 1
    am = {}
    for name, arr, ct, typ, norm in attrs:
        am[name] = add(arr, ct, typ, norm, 34962, minmax=(name == "POSITION"))
    ind = add(tri.ravel(), 5125, "SCALAR", target=34963)
    gl = dict(asset=dict(version="2.0", generator="anki-plus atlas3 bake.py"), scene=0, scenes=[dict(nodes=[0])],
              nodes=[dict(mesh=0, name=os.path.basename(path).split(".")[0])],
              meshes=[dict(primitives=[dict(attributes=am, indices=ind, mode=4)])],
              buffers=[dict(byteLength=offs)], bufferViews=views, accessors=accs)
    js = json.dumps(gl, separators=(",", ":")).encode()
    js += b" " * ((-len(js)) % 4)
    bin_ = b"".join(blobs)
    with open(path, "wb") as fh:
        fh.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)))
        fh.write(struct.pack("<II", len(js), 0x4E4F534A)); fh.write(js)
        fh.write(struct.pack("<II", len(bin_), 0x004E4942)); fh.write(bin_)
    log("wrote", path, len(tri), "triangles", len(pos), "vertices", f"{os.path.getsize(path) / 1e6:.1f} MB")


ext = LAB[:, 1] == 0
write_glb(os.path.join(W, "shell.raw.glb"), np.nonzero(ext)[0], False)
write_glb(os.path.join(W, "inner.raw.glb"), np.nonzero(~ext)[0], True)
