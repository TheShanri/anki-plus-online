"""Atlas v3: the body around the brain. The skull, the dura, the spine and the spinal cord, the eye, the ear and the nose,
from Z-Anatomy (CC BY-SA 4.0) as the old atlas and the Pathway tracer had them (their frame: zmap.frame_to_mni, then the
v3 world), and the parts no mesh exists for, drawn from landmarks and from the atlas's own labels (marked approximate):
the meninges as layers around this brain, the cranial fossae and the parts of a vertebra as regions of the bone, the
spinal arteries along the cord, the lenticulostriate and middle meningeal arteries, the accessory nerve, the spinal nerves
and their rami, laminae and columns of the cord, the hypothalamic sulcus, the apertures of the fourth ventricle ...

Writes _atlas/raw/v3/body.raw.glb (one named mesh per part; pack.mjs -> public/atlas3/body.glb) and
public/atlas3/body.json: parts (key, name, kind, group, side, box, approx, src) and marks (named points).
Needs _atlas/raw/v3/body_src/{head-targets,eye}.json (tools/atlas3/glbdump.mjs of public/pathways/*.glb).
Run: tools/.venv/Scripts/python.exe -I tools/atlas3/body.py
"""
import os, sys, json
import numpy as np
import trimesh
from scipy import ndimage as ndi
from scipy.spatial import cKDTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import zmap  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
RAW = os.path.join(ROOT, "_atlas/raw/v3")
GLB = os.path.join(ROOT, "_atlas/raw/glb/s")
SK = os.path.join(ROOT, "_atlas/skull_raw")
SRC = os.path.join(RAW, "body_src")
Z = "Z-Anatomy (CC BY-SA 4.0), warped onto this brain"
ZGEN = "drawn from Z-Anatomy landmarks (approximate)"
VGEN = "drawn from this atlas's labels (approximate)"

PARTS, MARKS = [], []


def to_world(P):
    """The tracer's frame (Z-Anatomy model, metres, patient's left +X) -> v3 world metres."""
    P = np.asarray(P, float).reshape(-1, 3)
    return zmap.mni_to_world(zmap.frame_to_mni(P))


# The warp is fitted on the brain: below the skull it carries the Z-Anatomy body with the head's pitch (the atlas is
# AC-PC horizontal), so the spine would lean back 16 degrees. The spine and the cord are bent upright below the foramen
# magnum (the bend grows over C1-C4, so the cord stays on the brainstem), and the cord's top is drawn up to meet this
# atlas's medulla, which ends 1 cm higher than Z-Anatomy's cord begins.
BEND = None  # (pivot y, pivot z, angle, length of the bend), set once the sources are read
STRETCH = None  # (cord top y, gap, top centre shift x, z)


def bend(W):
    if BEND is None:
        return W
    yp, zp, ang, ln = BEND
    W = W.copy()
    d = yp - W[:, 1]
    t = np.clip(d / ln, 0, 1)
    a = ang * t * t * (3 - 2 * t)
    dy, dz = W[:, 1] - yp, W[:, 2] - zp
    W[:, 1] = yp + dy * np.cos(a) - dz * np.sin(a)
    W[:, 2] = zp + dy * np.sin(a) + dz * np.cos(a)
    return W


def stretch(W):
    if STRETCH is None:
        return W
    ytop, gap, sx, sz = STRETCH
    W = W.copy()
    t = np.clip((W[:, 1] - (ytop - 0.03)) / 0.03, 0, 1)
    w = t * t * (3 - 2 * t)
    W[:, 1] += gap * w
    W[:, 0] += sx * w
    W[:, 2] += sz * w
    return W


def place(V, group, key):
    W = to_world(V)
    if group in ("spine", "cord") or key.startswith("accessory-nerve"):
        W = bend(W)
    if group == "cord":
        W = stretch(W)
    return W


def add(key, name, kind, group, V, F, side="M", approx=False, src=Z, world=False):
    V = np.asarray(V, float)
    F = np.asarray(F, np.int64)
    if not world:
        V = place(V, group, key)
    m = trimesh.Trimesh(vertices=V, faces=F, process=True)
    m.remove_unreferenced_vertices()
    if not len(m.faces):
        print("  (empty)", key)
        return None
    PARTS.append(dict(key=key, name=name, kind=kind, group=group, side=side, approx=approx, src=src, mesh=m))
    return m


def mark(key, name, p, group, world=False, approx=False):
    p = np.asarray(p, float).reshape(1, 3)
    w = p if world else to_world(p)
    MARKS.append(dict(key=key, name=name, p=[round(float(v), 5) for v in w[0]], group=group, approx=approx))


def scene_nodes(path):
    s = trimesh.load(path)
    out = {}
    for n in s.graph.nodes_geometry:
        T, g = s.graph[n]
        m = s.geometry[g]
        out[n] = (trimesh.transformations.transform_points(np.asarray(m.vertices), T), np.asarray(m.faces))
    return out


def raw(obj):
    m = trimesh.load(os.path.join(GLB, obj + ".glb"), force="mesh")
    return np.asarray(m.vertices), np.asarray(m.faces)


def dumped(name):
    d = json.load(open(os.path.join(SRC, name + ".json")))
    return {k: (np.array(v["v"], float).reshape(-1, 3), np.array(v["f"], np.int64).reshape(-1, 3)) for k, v in d.items()}


def mirror(V, F):
    return V * [-1.0, 1.0, 1.0], F[:, ::-1]


def sub(V, F, fmask):
    F2 = F[fmask]
    used = np.unique(F2)
    remap = -np.ones(len(V), np.int64)
    remap[used] = np.arange(len(used))
    return V[used], remap[F2]


def face_centres(V, F):
    return V[F].mean(1)


def face_normals(V, F):
    n = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)


def majority(F, mask, passes=3):
    """Each triangle takes the majority of itself and its edge neighbours (clears speckles from region masks)."""
    adj = trimesh.graph.face_adjacency(F)
    m = mask.astype(float)
    for _ in range(passes):
        acc = m.copy()
        cnt = np.ones(len(m))
        np.add.at(acc, adj[:, 0], m[adj[:, 1]])
        np.add.at(acc, adj[:, 1], m[adj[:, 0]])
        np.add.at(cnt, adj[:, 0], 1)
        np.add.at(cnt, adj[:, 1], 1)
        m = (acc / cnt > 0.5).astype(float)
    return m > 0.5


def merge(parts):
    Vs, Fs, o = [], [], 0
    for V, F in parts:
        Vs.append(V)
        Fs.append(F + o)
        o += len(V)
    return np.vstack(Vs), np.vstack(Fs)


def smooth_line(P, k=3):
    P = np.asarray(P, float)
    if len(P) < 3:
        return P
    out = P.copy()
    for _ in range(k):
        out[1:-1] = (out[:-2] + 2 * out[1:-1] + out[2:]) / 4
    return out


def resample(P, step):
    P = np.asarray(P, float)
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]
    if d[-1] <= 0:
        return P
    t = np.linspace(0, d[-1], max(2, int(d[-1] / step) + 1))
    return np.stack([np.interp(t, d, P[:, k]) for k in range(3)], 1)


def tube(P, r, sides=10, closed=False):
    """A tube along a polyline (radius r, scalar or per point); open tubes are capped."""
    P = np.asarray(P, float)
    keep = np.r_[True, np.linalg.norm(np.diff(P, axis=0), axis=1) > 1e-7]
    P = P[keep]
    n = len(P)
    r = np.broadcast_to(np.asarray(r, float), (len(keep),))[keep] if np.ndim(r) else np.full(n, float(r))
    if closed:
        T = P[(np.arange(n) + 1) % n] - P[(np.arange(n) - 1) % n]
    else:
        T = np.gradient(P, axis=0)
    T /= np.maximum(np.linalg.norm(T, axis=1, keepdims=True), 1e-12)
    ref = np.array([0.0, 0.0, 1.0]) if abs(T[0][2]) < 0.9 else np.array([1.0, 0.0, 0.0])
    N = np.zeros_like(P)
    N[0] = np.cross(T[0], ref)
    N[0] /= np.linalg.norm(N[0])
    for i in range(1, n):
        v = N[i - 1] - np.dot(N[i - 1], T[i]) * T[i]
        ln = np.linalg.norm(v)
        N[i] = v / ln if ln > 1e-9 else N[i - 1]
    B = np.cross(T, N)
    a = np.linspace(0, 2 * np.pi, sides, endpoint=False)
    V = (P[:, None, :] + r[:, None, None] * (np.cos(a)[None, :, None] * N[:, None, :] + np.sin(a)[None, :, None] * B[:, None, :])).reshape(-1, 3)
    F = []
    segs = n if closed else n - 1
    for i in range(segs):
        j = (i + 1) % n
        for k in range(sides):
            k2 = (k + 1) % sides
            a0, a1, b0, b1 = i * sides + k, i * sides + k2, j * sides + k, j * sides + k2
            F += [[a0, b0, a1], [a1, b0, b1]]
    if not closed:
        c0, c1 = len(V), len(V) + 1
        V = np.vstack([V, P[0], P[-1]])
        for k in range(sides):
            k2 = (k + 1) % sides
            F.append([c0, k2, k])
            F.append([c1, (n - 1) * sides + k, (n - 1) * sides + k2])
    return V, np.array(F, np.int64)


def ring(c, normal, radius, r_tube, n=40):
    normal = np.asarray(normal, float) / np.linalg.norm(normal)
    ref = np.array([0.0, 1.0, 0.0]) if abs(normal[1]) < 0.9 else np.array([1.0, 0.0, 0.0])
    u = np.cross(normal, ref)
    u /= np.linalg.norm(u)
    v = np.cross(normal, u)
    a = np.linspace(0, 2 * np.pi, n, endpoint=False)
    P = np.asarray(c) + radius * (np.cos(a)[:, None] * u + np.sin(a)[:, None] * v)
    return tube(P, r_tube, sides=8, closed=True)


def sphere(c, r, sub_=2):
    s = trimesh.creation.icosphere(subdivisions=sub_, radius=r)
    return np.asarray(s.vertices) + np.asarray(c, float), np.asarray(s.faces)


# ------------------------------------------------------------------ sources (all in the tracer's frame)
lm = json.load(open(os.path.join(SK, "skull-landmarks.json")))
L, VERT, SUT = lm["landmarks"], lm["vertebrae"], lm["sutures"]
skull = scene_nodes(os.path.join(SK, "skull.glb"))
spine = scene_nodes(os.path.join(SK, "spine-atlas.glb"))
parts_json = json.load(open(os.path.join(ROOT, "public/pathways/parts.json")))["parts"]
HT_OFF = np.array(parts_json["head-targets"]["worldOffset"], float)
head = {k: (V + HT_OFF, F) for k, (V, F) in dumped("head-targets").items()}
eye = dumped("eye")

SIDE = lambda n: ("L", n[:-2]) if n.endswith("_l") else ("R", n[:-2]) if n.endswith("_r") else ("M", n)

# the bend: pivot at the foramen magnum, angle that makes C1 -> L5 vertical, grown over 6 cm (C1 to about C4)
_fm = to_world(np.mean(lm["foramen_magnum_ring"], 0))[0]
_c1 = to_world(spine["vertebra-c1"][0]).mean(0)
_l5 = to_world(spine["vertebra-l5"][0]).mean(0)
_v = _l5 - _c1
BEND = (float(_fm[1]), float(_fm[2]), float(np.arctan2(_v[2], -_v[1])), 0.06)
print(f"spine bent upright by {np.degrees(BEND[2]):.1f} degrees below the foramen magnum")
# the stretch: this atlas's medulla ends at its volume's lowest slice; the cord's top is drawn up to its centre there
_meta = json.load(open(os.path.join(RAW, "labels.json")))
_LV = np.load(os.path.join(RAW, "labels.npy"), mmap_mode="r")
_bot = np.argwhere(np.asarray(_LV[:, :, 0]) > 0)
_bot_mm = np.c_[_bot.astype(float), np.zeros(len(_bot))] @ np.array(_meta["affine"])[:3, :3].T + np.array(_meta["affine"])[:3, 3]
_bot_w = zmap.mni_to_world(_bot_mm).mean(0)
_wm = bend(to_world(trimesh.load(os.path.join(GLB, "white-matter-of-spinal-cord.glb"), force="mesh").vertices))
_ytop = _wm[:, 1].max()
_topc = _wm[_wm[:, 1] > _ytop - 0.003].mean(0)
STRETCH = (float(_ytop), float(_bot_w[1] - _ytop), float(_bot_w[0] - _topc[0]), float(_bot_w[2] - _topc[2]))
print(f"cord top drawn up {STRETCH[1] * 1000:.1f} mm to the medulla (shift x {STRETCH[2] * 1000:.1f}, z {STRETCH[3] * 1000:.1f} mm)")


def title(s):
    return s[0].upper() + s[1:]


# ------------------------------------------------------------------ skull
BONES = {
    "frontal-bone": "Frontal bone", "parietal-bone": "Parietal bone", "temporal-bone": "Temporal bone", "occipital-bone": "Occipital bone",
    "sphenoid-bone": "Sphenoid bone", "ethmoid-bone": "Ethmoid bone", "maxilla": "Maxilla", "zygomatic-bone": "Zygomatic bone", "nasal-bone": "Nasal bone",
    "lacrimal-bone": "Lacrimal bone", "palatine-bone": "Palatine bone", "inferior-nasal-concha": "Inferior nasal concha", "vomer": "Vomer", "mandible": "Mandible",
}
SUTURES = {"suture-sagittal": "Sagittal suture", "suture-coronal": "Coronal suture", "suture-lambdoid": "Lambdoid suture", "suture-squamous": "Squamous suture"}


def keyof(base, side):
    return base if side == "M" else f"{base}.{side}"


for node, (V, F) in skull.items():
    side, base = SIDE(node)
    if base in BONES:
        add(keyof(base, side), BONES[base], "bone", "skull", V, F, side)
    elif base in SUTURES:
        add(keyof(base, side), SUTURES[base], "suture", "skull", V, F, side)
    elif base == "falx-cerebri":
        add("falx-cerebri", "Falx cerebri", "dura", "dura", V, F)
    elif base == "tentorium-cerebelli":
        add(keyof("tentorium-cerebelli", side), "Tentorium cerebelli", "dura", "dura", V, F, side)

# landmarks
for k, name in [("bregma", "Bregma"), ("lambda", "Lambda"), ("foramen_magnum", "Foramen magnum"), ("foramen_ovale", "Foramen ovale"),
                ("foramen_spinosum", "Foramen spinosum"), ("optic_canal", "Optic canal"), ("hypoglossal_canal", "Hypoglossal canal"),
                ("jugular_foramen", "Jugular foramen"), ("foramen_caecum", "Foramen caecum"), ("sella_turcica", "Sella turcica")]:
    mark(k.replace("_", "-"), name, L[k], "skull")
mark("pterion.L", "Pterion", L["pterion"], "skull")
mark("pterion.R", "Pterion", L["pterion_R"], "skull")
add("foramen-magnum", "Foramen magnum", "ring", "skull", *tube(lm["foramen_magnum_ring"], 0.0014, closed=True))

# the cranial fossae: the inner surface of the skull base nearest each fossa's landmarks
FOSSA = {"anterior-cranial-fossa": ["fossa_anterior_L", "fossa_anterior_R"], "middle-cranial-fossa": ["fossa_middle_L", "fossa_middle_R"],
         "posterior-cranial-fossa": ["fossa_posterior", "fossa_posterior_L", "fossa_posterior_R"]}
base_nodes = [n for n in skull if SIDE(n)[1] in ("frontal-bone", "ethmoid-bone", "sphenoid-bone", "temporal-bone", "occipital-bone", "parietal-bone")]
BV, BF = merge([skull[n] for n in base_nodes])
bc, bn = face_centres(BV, BF), face_normals(BV, BF)
cav = np.mean([L[k] for k in ("fossa_middle_L", "fossa_middle_R")], 0) + [0, 0.03, 0]  # inside the cranial cavity
inner = np.einsum("ij,ij->i", bn, cav - bc) > 0
lab_pts = [(fk, L[k]) for fk, ks in FOSSA.items() for k in ks]
tree = cKDTree([p for _, p in lab_pts])
d, ix = tree.query(bc)
floor = inner & (bn[:, 1] > 0.2) & (d < 0.05) & (bc[:, 1] < cav[1] + 0.012)
for fk in FOSSA:
    sel = majority(BF, floor & np.array([lab_pts[i][0] == fk for i in ix]))
    V2, F2 = sub(BV, BF, sel)
    add(fk, title(fk.replace("-", " ")), "region", "skull", V2, F2, approx=True, src=ZGEN)

# ------------------------------------------------------------------ the spine
VNAME = {"c1": "C1 (atlas)", "c2": "C2 (axis)", "c7": "C7 (vertebra prominens)"}
vert_nodes = {}
for node, (V, F) in spine.items():
    side, base = SIDE(node)
    if base.startswith("vertebra-"):
        lv = base.split("-")[1]
        vert_nodes[lv.upper()] = (V, F)
        add(base, f"Vertebra {VNAME.get(lv, lv.upper())}", "bone", "spine", V, F)
    elif base in ("sacrum", "coccyx"):
        add(base, title(base), "bone", "spine", V, F)
    elif base.startswith("disc-"):
        a, b = base[5:].split("-")
        add(base, f"Intervertebral disc {a.upper()}-{b.upper()}", "disc", "spine", V, F)
    elif base == "spinal-ganglion":
        add(keyof("spinal-ganglion", side), "Dorsal root ganglia", "ganglion", "cord", V, F, side)

from shapely.geometry import LineString, Polygon, MultiPolygon, Point  # noqa: E402
from shapely.ops import unary_union  # noqa: E402

# parts of each vertebra, by its own axes (approximate: regions of the bone, not its true boundaries)
VP = {"body": [], "arch": [], "spinous": [], "transverse": []}
foramen_rings, canal_pts, canal_r, canal_at = [], [], [], []
for lv, a in VERT.items():
    if lv not in vert_nodes:
        continue
    V, F = vert_nodes[lv]
    # the canal and the body from the bone itself (the landmark file's anchors are rough). The meshes are surfaces, so a
    # slice through a vertebra is a set of rings: the largest hole is the body's hollow inside (its cross-section), and
    # the vertebral foramen is the hole behind it, near the midline, of a canal's size
    y0, y1 = V[:, 1].min(), V[:, 1].max()
    mesh_v = trimesh.Trimesh(V, F, process=False)
    body_poly, canal = None, None
    for t in np.linspace(0.2, 0.85, 14):
        yy = y0 + t * (y1 - y0)
        segs = trimesh.intersections.mesh_plane(mesh_v, plane_normal=[0, 1, 0], plane_origin=[0, yy, 0])
        if not len(segs):
            continue
        u = unary_union([LineString([(q[0], q[2]), (r_[0], r_[2])]) for q, r_ in segs]).buffer(0.0007, quad_segs=2)
        holes = sorted([Polygon(h) for g in (u.geoms if isinstance(u, MultiPolygon) else [u]) for h in g.interiors], key=lambda h: -h.area)
        if not holes:
            continue
        big = holes[0] if (lv != "C1" and holes[0].area > 4.5e-4) else None
        if big is not None and 0.3 < t < 0.7 and (body_poly is None or big.area > body_poly.area):
            body_poly = big
        for h in holes:
            if not (6e-5 < h.area < 6e-4) or abs(h.centroid.x - V[:, 0].mean()) > 0.004:
                continue
            if big is not None and h is not big and h.centroid.y > big.centroid.y:
                continue  # in front of the body: not the canal
            if big is not None and h is big:
                continue
            if canal is None or h.area > canal[1].area:
                canal = (yy, h)
    if canal is None:
        print("  no canal found in", lv)
        continue
    yy, hole = canal
    fo = np.array([hole.centroid.x, yy, hole.centroid.y])
    rad = float(np.sqrt(hole.area / np.pi))
    up = np.array([0.0, 1.0, 0.0])
    # backwards: toward the spinous process's tip (the most posterior bone near the midline)
    mid = V[np.abs(V[:, 0] - fo[0]) < 0.004]
    tip = mid[np.argmin(mid[:, 2])]
    ap = tip - fo
    ap[1] = 0
    ap /= np.linalg.norm(ap)
    lat = np.cross(up, ap)
    lat /= np.linalg.norm(lat)
    fc = face_centres(V, F) - fo
    fa, fl = fc @ ap, fc @ lat
    half_w = 0.5 * (V[:, 0].max() - V[:, 0].min())
    if body_poly is not None:
        bp = body_poly.buffer(0.0015)
        fcw = face_centres(V, F)
        body = majority(F, np.array([bp.contains(Point(x_, z_)) for x_, z_ in fcw[:, [0, 2]]]))
    else:
        body = np.zeros(len(F), bool)
    spin = majority(F, (fa > rad + 0.006) & (np.abs(fl) < max(0.006, 0.22 * half_w)))
    trans = majority(F, (np.abs(fl) > rad + 0.006) & (fa > -rad * 0.6) & (fa < rad + 0.006) & (np.abs(fl) > 0.55 * half_w))
    if lv != "C1":
        VP["body"].append(sub(V, F, body))
    VP["arch"].append(sub(V, F, ~body))
    VP["spinous"].append(sub(V, F, spin))
    VP["transverse"].append(sub(V, F, trans & ~body))
    foramen_rings.append(ring(fo, up, rad * 0.97, 0.0007))
    canal_pts.append(fo)
    canal_r.append(rad * 0.92)
    canal_at.append((lv, (fo, rad)))
add("vertebral-body", "Vertebral bodies", "region", "spine", *merge(VP["body"]), approx=True, src=ZGEN)
add("vertebral-arch", "Vertebral arches", "region", "spine", *merge(VP["arch"]), approx=True, src=ZGEN)
add("spinous-process", "Spinous processes", "region", "spine", *merge(VP["spinous"]), approx=True, src=ZGEN)
add("transverse-process", "Transverse processes", "region", "spine", *merge(VP["transverse"]), approx=True, src=ZGEN)
add("vertebral-foramen", "Vertebral foramina", "ring", "spine", *merge(foramen_rings), approx=True, src=ZGEN)
cp = np.array(canal_pts)
add("vertebral-canal", "Vertebral canal", "space", "spine", *tube(smooth_line(cp, 2), np.array(canal_r), sides=16), approx=True, src=ZGEN)
# intervertebral foramina: between neighbouring pedicles, each side
iv = []
for (a, fa_), (b, fb_) in zip(canal_at[1:-1], canal_at[2:]):
    fo = (fa_[0] + fb_[0]) / 2
    r_ = (fa_[1] + fb_[1]) / 2
    for s_ in (1, -1):
        p = fo + np.array([s_ * (r_ + 0.006), 0, 0.002])
        iv.append(ring(p, [s_, 0, 0], 0.0042 if a.startswith("L") else 0.0032, 0.0006))
add("intervertebral-foramen", "Intervertebral foramina", "ring", "spine", *merge(iv), approx=True, src=ZGEN)

# ------------------------------------------------------------------ the spinal cord (Z-Anatomy: the whole cord, both sides in one mesh)
CORD = {
    "white-matter-of-spinal-cord": ("Spinal cord", "cord-wm"),
    "anterior-horn-of-spinal-cord": ("Ventral (anterior) horn", "cord-gm"),
    "posterior-horn-of-spinal-cord": ("Dorsal (posterior) horn", "cord-gm"),
    "intermediolateral-nucleus": ("Intermediolateral nucleus", "cord-gm"),
    "intermediomedial-nucleus": ("Intermediomedial nucleus", "cord-gm"),
    "lateral-intermediate-substance": ("Lateral intermediate substance", "cord-gm"),
    "nucleus-proprius": ("Nucleus proprius", "cord-gm"),
    "central-canal": ("Central canal", "csf"),
    "anterior-root-of-spinal-nerve": ("Ventral roots", "nerve"),
    "posterior-root-of-spinal-nerve": ("Dorsal roots", "nerve"),
    "cauda-equina": ("Cauda equina", "nerve"),
    "spinal-dura": ("Spinal dura mater (dural sac)", "dura"),
}
TRACTS = ["lateral-corticospinal-tract", "anterior-corticospinal-tract", "rubrospinal-tract", "lateral-reticulospinal-tract", "medial-reticulospinal-tract",
          "lateral-vestibulospinal-tract", "medial-vestibulospinal-tract", "tectospinal-tract", "spinotectal-tract", "anterior-spinothalamic-tract",
          "lateral-spinothalamic-tract", "anterior-spinocerebellar-tract", "posterior-spinocerebellar-tract", "anterior-fasciculus-proprius",
          "lateral-fasciculus-proprius", "posterior-fasciculus-proprius", "gracile-fasciculus", "cuneate-fasciculus", "posterolateral-tract"]
cordV = {}
for obj, (name, kind) in CORD.items():
    V, F = raw(obj)
    cordV[obj] = (V, F)
    add(obj, name, kind, "cord", V, F)
for obj in TRACTS:
    V, F = raw(obj)
    cordV[obj] = (V, F)
    add(obj, title(obj.replace("-", " ")), "tract", "cord", V, F)

wmV, wmF = cordV["white-matter-of-spinal-cord"]
y_lo = wmV[:, 1].min()
add("conus-medullaris", "Conus medullaris", "region", "cord", *sub(wmV, wmF, face_centres(wmV, wmF)[:, 1] < y_lo + 0.022), approx=True, src=ZGEN)
# the lateral horn: the intermediolateral column, T1 to L2 (cord segments; vertebral levels C7/T1 to T11/T12)
ilV, ilF = cordV["intermediolateral-nucleus"]
y_t1 = spine["disc-c7-t1"][0][:, 1].mean()
y_l2 = spine["disc-t11-t12"][0][:, 1].mean()
yc = face_centres(ilV, ilF)[:, 1]
add("lateral-horn", "Lateral horn (T1-L2)", "cord-gm", "cord", *sub(ilV, ilF, (yc < y_t1) & (yc > y_l2)), approx=True, src=ZGEN)
# laminae I and II: the dorsal cap of the dorsal horn, slab by slab
phV, phF = cordV["posterior-horn-of-spinal-cord"]
pc = face_centres(phV, phF)
slab = np.floor((pc[:, 1] - y_lo) / 0.002).astype(int)
frac = np.zeros(len(pc))
for s in np.unique(slab):
    m = slab == s
    z = pc[m, 2]
    frac[m] = (z - z.min()) / max(z.max() - z.min(), 1e-6)  # 0 = the dorsal tip (posterior is -Z)
add("marginal-nucleus", "Marginal zone (lamina I)", "cord-gm", "cord", *sub(phV, phF, frac < 0.14), approx=True, src=ZGEN)
add("substantia-gelatinosa", "Substantia gelatinosa (lamina II)", "cord-gm", "cord", *sub(phV, phF, (frac >= 0.14) & (frac < 0.38)), approx=True, src=ZGEN)


def cord_slices(V, step=0.004):
    """Per level along the cord: (y, centre, half width, anterior z, posterior z) of a mesh's cross-section."""
    out = []
    y0, y1 = V[:, 1].min(), V[:, 1].max()
    for y in np.arange(y0 + step / 2, y1, step):
        m = np.abs(V[:, 1] - y) < step / 2
        if m.sum() < 8:
            continue
        P = V[m]
        out.append((y, P.mean(0), (P[:, 0].max() - P[:, 0].min()) / 2, P[:, 2].max(), P[:, 2].min()))
    return out


cs = cord_slices(wmV)
cyl = np.array([c[0] for c in cs])
ccen = np.array([c[1] for c in cs])
chw = np.array([c[2] for c in cs])
cant = np.array([c[3] for c in cs])
cpost = np.array([c[4] for c in cs])

# Clarke's column (nucleus dorsalis): the medial base of the dorsal horn, C8 to L3 (vertebral levels C7 to T12)
y_c8 = spine["disc-c6-c7"][0][:, 1].mean()
y_l3 = vert_nodes["T12"][0][:, 1].mean()
cl = {s: [] for s in (1, -1)}
for y, c, hw, za, zp in cs:
    if not (y_l3 < y < y_c8):
        continue
    m = np.abs(phV[:, 1] - y) < 0.002
    P = phV[m]
    if len(P) < 6:
        continue
    zb = P[:, 2].max()  # the ventral base of the dorsal horn
    for s in (1, -1):
        Q = P[(np.sign(P[:, 0] - c[0]) == s) & (P[:, 2] > zb - 0.0012)]
        if len(Q):
            q = Q[np.argmin(np.abs(Q[:, 0] - c[0]))]
            cl[s].append([q[0] - s * 0.0002, y, q[2] - 0.0004])
cv = [tube(smooth_line(resample(np.array(cl[s]), 0.002), 3), 0.0006, sides=8) for s in (1, -1) if len(cl[s]) > 3]
add("column-of-clarke", "Clarke's column (nucleus dorsalis), C8-L3", "cord-gm", "cord", *merge(cv), approx=True, src=ZGEN)
# the ventral white commissure: across the midline between the central canal and the anterior median fissure
ccV, _ = cordV["central-canal"]
vc_pts = []
for y, c, hw, za, zp in cs:
    m = np.abs(ccV[:, 1] - y) < 0.002
    cz = ccV[m, 2].mean() if m.any() else c[2]
    vc_pts.append([c[0], y, cz + 0.4 * (za - cz)])
add("ventral-commissure-of-spinal-cord", "Ventral (anterior) white commissure", "tract", "cord", *tube(smooth_line(np.array(vc_pts), 3), 0.0006, sides=8), approx=True, src=ZGEN)

# ------------------------------------------------------------------ cross-sections of the cord (the textbook view): at three
# levels, every part's section as a flat face (Z-Anatomy's meshes are open, so each slice's outline is closed by a 0.12 mm
# buffer and filled), the derived parts cut from them (laminae I and II from the dorsal horn's tip, the lateral horn,
# Clarke's column, the ventral white commissure)
import shapely  # noqa: E402
from shapely.geometry import LineString, Polygon, MultiPolygon, Point, box as sbox  # noqa: E402
from shapely.ops import unary_union  # noqa: E402


def section_poly(V, F, y, tol=0.00012):
    segs = trimesh.intersections.mesh_plane(trimesh.Trimesh(V, F, process=False), plane_normal=[0, 1, 0], plane_origin=[0, y, 0])
    if not len(segs):
        return None
    u = unary_union([LineString([(a[0], a[2]), (b[0], b[2])]) for a, b in segs]).buffer(tol, quad_segs=2)
    parts = list(u.geoms) if isinstance(u, MultiPolygon) else [u]
    f = unary_union([Polygon(p.exterior) for p in parts]).buffer(-tol * 0.9)
    return None if f.is_empty else f


def slab(poly, y):
    V, F = [], []
    for t in shapely.constrained_delaunay_triangles(poly).geoms:
        c = list(t.exterior.coords)[:3]
        i = len(V)
        V += [[x, y, z] for x, z in c]
        a, b, d = np.array(V[i]), np.array(V[i + 1]), np.array(V[i + 2])
        F.append([i, i + 1, i + 2] if np.cross(b - a, d - a)[1] > 0 else [i, i + 2, i + 1])
    return np.array(V), np.array(F, np.int64)


XS_LEVELS = {"c7": ("C7", "disc-c6-c7"), "t6": ("T6", "disc-t4-t5"), "l2": ("L2", "disc-t11-t12")}
XS_GREY = ["anterior-horn-of-spinal-cord", "posterior-horn-of-spinal-cord", "lateral-intermediate-substance"]
XS_NUC = ["nucleus-proprius", "intermediolateral-nucleus", "intermediomedial-nucleus"]
# (cut in the atlas's world, so each section is level with Explore's horizontal cut)
WPART = {p["key"]: p["mesh"] for p in PARTS}
for lv, (seg, disc) in XS_LEVELS.items():
    y = float(np.asarray(WPART[disc].vertices)[:, 1].mean())
    polys = {}
    for k in ["white-matter-of-spinal-cord"] + TRACTS + XS_GREY + XS_NUC + ["central-canal"]:
        if k in WPART:
            p_ = section_poly(np.asarray(WPART[k].vertices), np.asarray(WPART[k].faces), y)
            if p_ is not None:
                polys[k] = p_
    if "white-matter-of-spinal-cord" not in polys:
        continue
    wm_ = polys["white-matter-of-spinal-cord"]
    grey = unary_union([polys[k] for k in XS_GREY if k in polys])
    ph = polys.get("posterior-horn-of-spinal-cord")
    der = {}
    if ph is not None:
        x0, z0, x1, z1 = ph.bounds  # the dorsal tip is at the smallest z (posterior)
        der["marginal-nucleus"] = ph.intersection(sbox(x0 - 1, z0 - 1, x1 + 1, z0 + 0.14 * (z1 - z0)))
        der["substantia-gelatinosa"] = ph.intersection(sbox(x0 - 1, z0 + 0.14 * (z1 - z0), x1 + 1, z0 + 0.38 * (z1 - z0)))
        # Clarke's column (C8-L3): the medial base of the dorsal horn
        if lv in ("t6", "l2"):
            pts = []
            for g in (ph.geoms if isinstance(ph, MultiPolygon) else [ph]):
                xs_, zs_ = np.array(g.exterior.coords).T
                base = zs_ > np.percentile(zs_, 70)
                i = np.argmin(np.abs(xs_[base] - wm_.centroid.x))
                pts.append(Point(xs_[base][i], zs_[base][i] - 0.0003).buffer(0.00055))
            der["column-of-clarke"] = unary_union(pts)
    if lv in ("t6", "l2") and "intermediolateral-nucleus" in polys:
        der["lateral-horn"] = polys["intermediolateral-nucleus"].buffer(0.0003)
    cc = polys.get("central-canal")
    if cc is not None:
        cx, cz = cc.centroid.x, cc.centroid.y
        za = wm_.bounds[3]
        der["ventral-commissure-of-spinal-cord"] = sbox(cx - 0.0006, cz + 0.0006, cx + 0.0006, cz + 0.4 * (za - cz)).buffer(0.0003).intersection(wm_)
    layer = lambda k: 0.00003 if k in TRACTS else 0.00006 if k in XS_GREY else 0.00009 if k in XS_NUC or k == "central-canal" else 0.00012 if k in der else 0.0
    for k, p_ in list(polys.items()) + list(der.items()):
        if p_ is None or p_.is_empty:
            continue
        kind = ("xs-wm" if k == "white-matter-of-spinal-cord" else "xs-tract" if k in TRACTS or k == "ventral-commissure-of-spinal-cord"
                else "csf" if k == "central-canal" else "xs-gm" if k in XS_GREY else "xs-nuc")
        V, F = slab(p_, y + layer(k))
        name = (dict(CORD).get(k, (title(k.replace("-", " ")),))[0] if k in CORD else title(k.replace("-", " "))) + f" (section at {seg})"
        add(f"xs-{lv}-{k}", name, kind, "cord", V, F, approx=k in der, src=ZGEN if k in der else Z, world=True)

# ------------------------------------------------------------------ the spinal arteries (along the cord's surface)
asa = np.array([[c[0], y, za + 0.0007] for y, c, hw, za, zp in cs])
psa = {s: np.array([[c[0] + s * 0.5 * hw, y, zp + 0.09 * (za - zp) - 0.0005] for y, c, hw, za, zp in cs]) for s in (1, -1)}
add("anterior-spinal-artery", "Anterior spinal artery", "artery", "cord", *tube(smooth_line(asa, 4), 0.0006, sides=8), approx=True, src=ZGEN)
add("posterior-spinal-arteries", "Posterior spinal arteries", "artery", "cord",
    *merge([tube(smooth_line(psa[s], 4), 0.0005, sides=8) for s in (1, -1)]), approx=True, src=ZGEN)

# filum terminale: from the conus down the dural sac to the coccyx
duV, _ = cordV["spinal-dura"]
co = wmV[np.argmin(wmV[:, 1])]
sac_end = duV[np.argmin(duV[:, 1])]
coc = spine["coccyx"][0]
coc_tip = coc[np.argmin(coc[:, 1])] + [0, 0, -0.004]
fil = resample(np.array([co, (co + sac_end) / 2 + [0, 0, -0.001], sac_end, (sac_end + coc_tip) / 2 + [0, 0, -0.004], coc_tip]), 0.004)
add("filum-terminale", "Filum terminale", "nerve", "cord", *tube(smooth_line(fil, 3), 0.0005, sides=8), approx=True, src=ZGEN)

# denticulate ligaments: teeth of pia from the cord's sides to the dura, between the roots (about 21 a side)
den = []
dyl = [y for y in cyl if y > y_l2]
for y in np.linspace(min(dyl) + 0.01, max(dyl) - 0.01, 21):
    i = np.argmin(np.abs(cyl - y))
    c, hw = ccen[i], chw[i]
    m = np.abs(duV[:, 1] - y) < 0.003
    for s in (1, -1):
        Q = duV[m & (np.sign(duV[:, 0] - c[0]) == s)]
        if not len(Q):
            continue
        dx = np.abs(Q[:, 0] - c[0]).max() * 0.92
        z0 = c[2] + 0.0
        base = [[c[0] + s * hw * 0.96, y - 0.008, z0], [c[0] + s * hw * 0.96, y + 0.008, z0], [c[0] + s * max(dx, hw + 0.003), y, z0]]
        den.append((np.array(base), np.array([[0, 1, 2], [0, 2, 1]])))
add("denticulate-ligaments", "Denticulate ligaments", "pia", "cord", *merge(den), approx=True, src=ZGEN)

# spinal nerves and their rami, from each dorsal root ganglion outwards (C2 to L5)
gm = trimesh.Trimesh(*merge([spine[n] for n in spine if SIDE(n)[1] == "spinal-ganglion"]), process=True)
comps = gm.split(only_watertight=False)
sn, dr, vr = [], [], []
for g in comps:
    c = np.asarray(g.vertices).mean(0)
    i = np.argmin(np.abs(cyl - c[1]))
    cc = ccen[i]
    out = c - [cc[0], c[1], cc[2]]
    out[1] = 0
    out /= np.linalg.norm(out)
    s = np.sign(c[0] - cc[0])
    p1 = c + out * 0.008
    sn.append(tube([c, p1], 0.0011, sides=8))
    dr.append(tube(smooth_line(resample(np.array([p1, p1 + [s * 0.006, -0.002, -0.008], p1 + [s * 0.012, -0.006, -0.022]]), 0.002), 2), 0.0006, sides=8))
    vr.append(tube(smooth_line(resample(np.array([p1, p1 + [s * 0.012, -0.004, 0.004], p1 + [s * 0.03, -0.012, 0.012]]), 0.002), 2), 0.0009, sides=8))
add("spinal-nerves", "Spinal nerves", "nerve", "cord", *merge(sn), approx=True, src=ZGEN)
add("dorsal-ramus", "Dorsal rami", "nerve", "cord", *merge(dr), approx=True, src=ZGEN)
add("ventral-ramus", "Ventral rami", "nerve", "cord", *merge(vr), approx=True, src=ZGEN)

# ------------------------------------------------------------------ the eye (the Pathway tracer's eye model, placed in the orbit; the right one mirrored)
ebV = head["organ_eyeball"][0]
off = ebV.mean(0) - eye["sclera"][0].mean(0)
EYE = {"sclera": ("Sclera", "eye-sclera"), "cornea": ("Cornea", "eye-cornea"), "iris": ("Iris", "eye-iris"), "lens": ("Lens", "eye-lens"), "retina": ("Retina", "eye-retina")}
eyeL = {k: (V + off, F) for k, (V, F) in eye.items()}
for k, (name, kind) in EYE.items():
    V, F = eyeL[k]
    add(f"{k}.L", name, kind, "eye", V, F, "L")
    add(f"{k}.R", name, kind, "eye", *mirror(V, F), side="R")
ec = ebV.mean(0)
axis = head["organ_cornea"][0].mean(0) - ec
axis /= np.linalg.norm(axis)
# choroid: between the retina and the sclera; vitreous body: inside the retina behind the lens; aqueous humour: between the cornea and the lens
rV, rF = eyeL["retina"]
sV, _ = eyeL["sclera"]
rs = np.linalg.norm(sV - ec, axis=1).max()
rr_ = np.linalg.norm(rV - ec, axis=1)
chV = ec + (rV - ec) * ((rr_ + 0.35 * (rs * 0.96 - rr_)) / rr_)[:, None]
lensV = eyeL["lens"][0]
lens_back = (lensV - ec) @ axis
vit = trimesh.convex.convex_hull(np.vstack([rV[((rV - ec) @ axis) < lens_back.min()], lensV[((lensV - ec) @ axis) < np.percentile(lens_back, 40)]]))
vV = ec + (np.asarray(vit.vertices) - ec) * 0.985
cV = eyeL["cornea"][0]
iV = eyeL["iris"][0]
aq = trimesh.convex.convex_hull(np.vstack([cV, iV, lensV[((lensV - ec) @ axis) > np.percentile(lens_back, 60)]]))
aV = ec + (np.asarray(aq.vertices) - ec) * 0.995
# the pupil: the iris's inner rim
ia = (iV - ec) @ axis
ip = iV - ec - np.outer(ia, axis)
rad = np.linalg.norm(ip, axis=1)
pr = float(np.percentile(rad, 2))
pc_ = ec + axis * float(np.median(ia[rad < pr * 1.15]))
for side, M in (("L", lambda V, F: (V, F)), ("R", mirror)):
    add(f"choroid.{side}", "Choroid", "eye-choroid", "eye", *M(chV, rF), side=side, approx=True, src=ZGEN)
    add(f"vitreous-body.{side}", "Vitreous body", "eye-vitreous", "eye", *M(vV, np.asarray(vit.faces)), side=side, approx=True, src=ZGEN)
    add(f"aqueous-humor.{side}", "Aqueous humour (anterior chamber)", "eye-aqueous", "eye", *M(aV, np.asarray(aq.faces)), side=side, approx=True, src=ZGEN)
    add(f"pupil.{side}", "Pupil", "ring", "eye", *M(*ring(pc_, axis, pr, 0.00045)), side=side, approx=True, src=ZGEN)

# ------------------------------------------------------------------ the ear and the nose (head-targets: the left ear; the right mirrored)
EAR = {"organ_cochlea": ("cochlea", "Cochlea", "ear"), "organ_vestibule": ("vestibule", "Vestibule (utricle and saccule)", "ear"),
       "organ_semicircular_canals": ("semicircular-canals", "Semicircular canals", "ear"), "bone_ossicles": ("ossicles", "Ossicles", "bone")}
for obj, (key, name, kind) in EAR.items():
    V, F = head[obj]
    add(f"{key}.L", name, kind, "ear", V, F, "L")
    add(f"{key}.R", name, kind, "ear", *mirror(V, F), side="R")
add("nasal-cavity", "Nasal cavity", "space", "nose", *head["organ_nasal_cavity.001"])
add("olfactory-epithelium", "Olfactory epithelium", "epith", "nose", *head["organ_olfactory_epithelium.001"])
add("olfactory-nerve", "Olfactory nerve (fila olfactoria)", "nerve", "nose", *head["nerve_olfactory"])

# ------------------------------------------------------------------ the accessory nerve (XI): spinal roots from C1-C5 up through the foramen magnum, out by the jugular foramen
for s in (1, -1):
    y5 = vert_nodes["C5"][0][:, 1].mean()
    pts = []
    for y in np.linspace(y5, cyl.max() - 0.002, 10):
        i = np.argmin(np.abs(cyl - y))
        c, hw = ccen[i], chw[i]
        pts.append([c[0] + s * (hw + 0.002), y, c[2] - 0.0005])
    fm = np.array(L["foramen_magnum"])
    jf = np.array(L["jugular_foramen"]) * [s if np.sign(L["jugular_foramen"][0]) == 1 else -s, 1, 1]
    top = [fm[0] + s * 0.012, fm[1] + 0.004, fm[2] + 0.004]
    pts += [top, (np.array(top) + jf) / 2 + [0, 0.004, 0], jf, jf + [s * 0.006, -0.02, -0.004]]
    add(f"accessory-nerve.{'L' if s > 0 else 'R'}", "Accessory nerve (XI)", "nerve", "nerves", *tube(smooth_line(resample(np.array(pts), 0.003), 4), 0.0011, sides=10),
        side="L" if s > 0 else "R", approx=True, src=ZGEN)

# ------------------------------------------------------------------ the brain's own labels (for the parts drawn from them)
meta = json.load(open(os.path.join(RAW, "labels.json")))
AFF = np.array(meta["affine"])
LV = np.load(os.path.join(RAW, "labels.npy"), mmap_mode="r")
KEYS = {}
for l in meta["labels"]:
    KEYS.setdefault(l["key"], []).append(l["id"])
NAMES = {l["key"]: l["name"] for l in meta["labels"]}


def vox_world(ijk):
    mm = np.asarray(ijk, float) @ AFF[:3, :3].T + AFF[:3, 3]
    return zmap.mni_to_world(mm)


def crop(keys_list, pad=6):
    """Boolean masks of several key sets on one shared crop, its origin, and the labels there."""
    ms = [np.isin(LV, [i for k in keys for i in KEYS.get(k, [])]) for keys in keys_list]
    any_ = np.zeros(LV.shape, bool)
    for m in ms:
        any_ |= m
    idx = np.argwhere(any_)
    lo, hi = np.maximum(idx.min(0) - pad, 0), np.minimum(idx.max(0) + pad + 1, LV.shape)
    sl = tuple(slice(a, b) for a, b in zip(lo, hi))
    return [m[sl] for m in ms], lo, np.asarray(LV[sl])


TH = [k for k, n in NAMES.items() if "thalam" in n.lower() and not any(w in n.lower() for w in ("subthalam", "hypothalam", "mammillothalamic", "geniculate"))] + ["IA"]
HY = [k for k in NAMES if k.startswith("HT")] + ["MB"]
(mV3, mHY, mTH), lo, _ = crop([["V3"], HY, TH])
nearHY = ndi.binary_dilation(mHY, iterations=3)
nearTH = ndi.binary_dilation(mTH, iterations=3)
cand = np.argwhere(mV3 & nearHY & nearTH)
# the hypothalamic sulcus: on each wall of the third ventricle, the line where the thalamus above meets the hypothalamus below
hs = {}
if len(cand):
    W = vox_world(cand + lo)
    for s in (1, -1):
        Q = W[np.sign(W[:, 0]) == s]
        if len(Q) < 10:
            continue
        zb = np.round(Q[:, 2] / 0.0015).astype(int)
        pts = [np.median(Q[zb == b], axis=0) for b in np.unique(zb) if (zb == b).sum() >= 2]
        P = np.array(sorted(pts, key=lambda p: -p[2]))
        P[:, 0] = s * np.maximum(np.abs(P[:, 0]), 0.0008)
        hs[s] = smooth_line(resample(P, 0.0015), 4)
if hs:
    add("hypothalamic-sulcus", "Hypothalamic sulcus", "groove", "brain", *merge([tube(hs[s], 0.00045, sides=8) for s in hs]), approx=True, src=VGEN, world=True)

# the apertures of the fourth ventricle: the median (Magendie) at its caudal roof, the lateral (Luschka) at the tips of the lateral recesses
(mV4,), lo4, _ = crop([["V4"]])
W4 = vox_world(np.argwhere(mV4) + lo4)
ycut = W4[:, 1].min() + 0.0025
mag = W4[W4[:, 1] < ycut].mean(0) + [0, 0, -0.0015]
mark("foramen-of-magendie", "Median aperture (foramen of Magendie)", mag, "ventricles", world=True, approx=True)
for s, side in ((1, "L"), (-1, "R")):
    Q = W4[np.sign(W4[:, 0]) == s]
    far = Q[np.abs(Q[:, 0]) >= np.percentile(np.abs(Q[:, 0]), 99)]
    mark(f"foramen-of-luschka.{side}", "Lateral aperture (foramen of Luschka)", far.mean(0) + [s * 0.001, 0, 0], "ventricles", world=True, approx=True)

# the preoccipital notch: where the inferior temporal gyrus meets the inferior occipital gyrus at the hemisphere's lower lateral edge
(mITG, mIOG), loo, sub_ = crop([["ITG"], ["IOG"]])
outside = sub_ == 0
edge = mITG & ndi.binary_dilation(mIOG, iterations=2) & ndi.binary_dilation(outside, iterations=2)
We = vox_world(np.argwhere(edge) + loo)
for s, side in ((1, "L"), (-1, "R")):
    Q = We[np.sign(We[:, 0]) == s]
    if not len(Q):
        continue
    Q = Q[np.abs(Q[:, 0]) > 0.75 * np.abs(Q[:, 0]).max()]
    mark(f"occipital-notch.{side}", "Preoccipital notch", Q[np.argmin(Q[:, 1])], "brain", world=True, approx=True)

# the mesencephalic trigeminal nucleus: a thin column at the lateral edge of the periaqueductal grey, down to the motor
# trigeminal nucleus along the lateral edge of the rostral fourth ventricle
(mPAG, mV4b), lop, _ = crop([["PAG"], ["V4"]])
Wp = vox_world(np.argwhere(mPAG) + lop)
Wv = vox_world(np.argwhere(mV4b) + lop)
vmo = [l for l in meta["labels"] if l["key"] == "Vmo"]
y_end = min(zmap.mni_to_world(np.array([l["centroid_mm"]]))[0][1] for l in vmo) if vmo else Wp[:, 1].min() - 0.008
mes = {1: [], -1: []}
for y in np.arange(Wp[:, 1].max() - 0.001, y_end, -0.001):
    src_ = Wp if np.any(np.abs(Wp[:, 1] - y) < 0.0005) else Wv
    q = src_[np.abs(src_[:, 1] - y) < 0.0005]
    if len(q) < 4:
        continue
    zc = q[:, 2].mean()
    for s in (1, -1):
        qs = q[(np.sign(q[:, 0]) == s) & (q[:, 2] <= zc + 0.0005)]
        if len(qs):
            p = qs[np.argmax(np.abs(qs[:, 0]))]
            mes[s].append(p + [s * 0.0006, 0, 0])
mv = [tube(smooth_line(resample(np.array(mes[s]), 0.0012), 4), 0.0005, sides=8) for s in mes if len(mes[s]) > 4]
if mv:
    add("mesencephalic-trigeminal-nucleus", "Mesencephalic nucleus of the trigeminal nerve", "nucleus", "brain", *merge(mv), approx=True, src=VGEN, world=True)

# ------------------------------------------------------------------ the meninges around this brain: arachnoid and dura as layers over its outline
hull = trimesh.load(os.path.join(RAW, "hull.raw.glb")).to_geometry()
hV, hF = np.asarray(hull.vertices), np.asarray(hull.faces)
hn = np.asarray(hull.vertex_normals)
if np.mean(np.einsum("ij,ij->i", hn, hV - hV.mean(0))) < 0:
    hn = -hn
# the skull fitted around this brain: the warped bone comes up to 6 mm inside the brain's outline in places (the orbital
# roofs, the lower temporal squama); a smooth outward displacement field (Gaussian-weighted pushes, 8 mm) moves the bone,
# its sutures and landmarks until the inner table clears the outline by CLEAR everywhere (room for the meninges)
CLEAR = 0.0038
ht = cKDTree(hV)
CRANIAL = ("frontal-bone", "parietal-bone", "occipital-bone", "temporal-bone", "sphenoid-bone", "ethmoid-bone")
cranial = [p for p in PARTS if p["group"] == "skull" and p["key"].split(".")[0] in CRANIAL]


def sdist(P):
    d, j = ht.query(P)
    return np.einsum("ij,ij->i", P - hV[j], hn[j]), hn[j], d


moved = [p for p in PARTS if p["group"] in ("skull", "eye", "ear", "nose")]
for it_ in range(9):
    B = np.vstack([np.asarray(p["mesh"].vertices) for p in cranial])
    sd, nrm, d = sdist(B)
    bad = (sd < CLEAR) & (d < 0.03)
    print(f"skull fit {it_}: {bad.sum()} bone points within {CLEAR * 1000:.1f} mm of the brain (min {sd[d < 0.03].min() * 1000:.1f} mm)")
    if not bad.any():
        break
    src_p, push = B[bad], nrm[bad] * (CLEAR - sd[bad])[:, None] * 1.6
    pt_ = cKDTree(src_p)

    def field(P, sig=0.008):
        out = np.zeros_like(P)
        for i, nb in enumerate(pt_.query_ball_point(P, 3 * sig)):
            if not nb:
                continue
            w = np.exp(-np.sum((src_p[nb] - P[i]) ** 2, 1) / (2 * sig * sig))
            out[i] = (w[:, None] * push[nb]).sum(0) / (w.sum() + 0.15)
        return out

    for p in moved:
        V = np.asarray(p["mesh"].vertices)
        p["mesh"] = trimesh.Trimesh(vertices=V + field(V), faces=np.asarray(p["mesh"].faces), process=False)
    for m_ in MARKS:
        if m_["group"] == "skull":
            q = np.array([m_["p"]])
            m_["p"] = [round(float(v), 5) for v in (q + field(q))[0]]
# the sutures onto the outer surface: drawn along the contact lines between the bones, they lie inside the bone's
# thickness; each point is lifted along the radius from the cranial centre to just outside the outer table there
ctr = hV.mean(0)
bones_w = [p for p in PARTS if p["group"] == "skull" and p["kind"] == "bone" and p["key"].split(".")[0] in CRANIAL]
BW = np.vstack([np.asarray(p["mesh"].vertices) for p in bones_w])
BN = np.vstack([np.asarray(p["mesh"].vertex_normals) for p in bones_w])
rad_b = (BW - ctr) / np.linalg.norm(BW - ctr, axis=1, keepdims=True)
outer_b = np.einsum("ij,ij->i", BN, rad_b) > 0.3
ot = cKDTree(BW[outer_b])
r_out = np.linalg.norm(BW[outer_b] - ctr, axis=1)
for p in PARTS:
    if p["kind"] != "suture":
        continue
    V = np.asarray(p["mesh"].vertices)
    d_, j = ot.query(V, k=6)
    r_new = r_out[j].max(1) + 0.0006
    rad = (V - ctr) / np.linalg.norm(V - ctr, axis=1, keepdims=True)
    lift = np.maximum(r_new - np.linalg.norm(V - ctr, axis=1), 0)
    p["mesh"] = trimesh.Trimesh(vertices=V + rad * lift[:, None], faces=np.asarray(p["mesh"].faces), process=False)
# each eye turned about its centre so it looks straight ahead in the atlas (the warp tilts the head's gaze with AC-PC)
for side in ("L", "R"):
    eps = [p for p in PARTS if p["group"] == "eye" and p["key"].endswith("." + side)]
    sc_ = next(p for p in eps if p["key"].startswith("sclera."))
    co_ = next(p for p in eps if p["key"].startswith("cornea."))
    c0 = np.asarray(sc_["mesh"].vertices).mean(0)
    g0 = np.asarray(co_["mesh"].vertices).mean(0) - c0
    g0 /= np.linalg.norm(g0)
    g1 = np.array([g0[0], 0.0, g0[2]])
    g1 /= np.linalg.norm(g1)
    R = trimesh.geometry.align_vectors(g0, g1)[:3, :3]
    for p in eps:
        V = np.asarray(p["mesh"].vertices)
        p["mesh"] = trimesh.Trimesh(vertices=c0 + (V - c0) @ R.T, faces=np.asarray(p["mesh"].faces), process=False)
OFFS = "this brain's outline, offset (approximate)"
for key, name, kind, d in (("arachnoid-mater", "Arachnoid mater", "arachnoid", 0.0009), ("dura-cranial", "Dura mater (cranial)", "dura", 0.0022)):
    add(key, name, kind, "meninges", hV + hn * d, hF, approx=True, src=OFFS, world=True)
# the spaces: thin shells between the layers (the subarachnoid space holds the CSF; the subdural and cranial epidural spaces are potential spaces)
for key, name, d0, d1 in (("subarachnoid-space", "Subarachnoid space", 0.0001, 0.0008), ("subdural-space", "Subdural space", 0.0011, 0.0019),
                          ("epidural-space", "Epidural space", 0.0026, 0.0034)):
    V = np.vstack([hV + hn * d1, hV + hn * d0])
    F = np.vstack([hF, hF[:, ::-1] + len(hV)])
    add(key, name, "space-" + key.split("-")[0], "meninges", V, F, approx=True, src=OFFS, world=True)

# arachnoid granulations: tufts of arachnoid pushing into the superior sagittal sinus
ves = trimesh.load(os.path.join(RAW, "vessels.raw.glb"))
VES = {n: ves.geometry[n] for n in ves.geometry}
sss = np.asarray(VES["sss"].vertices)
zs = sss[:, 2]
gran = []
for t in np.linspace(0.25, 0.8, 9):
    z0 = np.quantile(zs, t)
    q = sss[np.abs(zs - z0) < 0.003]
    if not len(q):
        continue
    c = q.mean(0)
    hw = (q[:, 0].max() - q[:, 0].min()) / 2
    for s in (1, -1):
        gran.append(sphere([c[0] + s * (hw + 0.0012), c[1] - 0.0015, z0], 0.0018, 1))
add("arachnoid-granulations", "Arachnoid granulations", "arachnoid", "meninges", *merge(gran), approx=True, src="placed along the superior sagittal sinus (approximate)", world=True)

# ------------------------------------------------------------------ arteries drawn from landmarks and labels
# the middle meningeal artery: from the foramen spinosum up the inner surface of the temporal bone; the anterior branch
# under the pterion toward the vertex, the posterior branch back over the temporal and parietal bones
bone_w = merge([(np.asarray(p["mesh"].vertices), np.asarray(p["mesh"].faces)) for p in cranial])
bzc, bzn = face_centres(*bone_w), face_normals(*bone_w)
MK = {m_["key"]: np.array(m_["p"]) for m_ in MARKS}
cav_c = (MK["bregma"] + MK["sella-turcica"]) / 2
inn = np.einsum("ij,ij->i", bzn, cav_c - bzc) > 0
it = cKDTree(bzc[inn])


def on_inner(P, depth=0.0012):
    P = np.asarray(P, float)
    _, j = it.query(P)
    return bzc[inn][j] + bzn[inn][j] * depth


fs = MK["foramen-spinosum"]
mm = []
for s in (1, -1):
    f = fs * [s * (np.sign(fs[0]) or 1), 1, 1]
    pt = MK["pterion.L" if s > 0 else "pterion.R"]
    br = MK["bregma"]
    la = MK["lambda"]
    split = f + [s * 0.012, 0.018, 0.0]
    ant = [f, split, pt + [-s * 0.002, -0.004, -0.004], (pt + br) / 2 + [s * 0.035, 0, 0], br + [s * 0.02, -0.01, -0.01]]
    post = [split, split + [s * 0.01, 0.015, -0.03], (split + la) / 2 + [s * 0.04, 0.0, 0], la + [s * 0.035, -0.015, 0.01]]
    for path in (ant, post):
        P = smooth_line(on_inner(smooth_line(resample(np.array(path), 0.004), 3)), 3)
        mm.append(tube(P, np.linspace(0.0009, 0.0005, len(P)), sides=8))
add("meningeal-blood-vessels", "Middle meningeal artery", "artery", "meninges", *merge(mm), approx=True, src=ZGEN, world=True)

# the lenticulostriate arteries: from the first part of the middle cerebral artery up through the anterior perforated
# substance into the lentiform nucleus
m1 = np.asarray(VES["mca1"].vertices)
pu = {l["side"]: zmap.mni_to_world(np.array([l["centroid_mm"]]))[0] for l in meta["labels"] if l["key"] == "Pu"}
lsa = []
for s, side in ((1, "L"), (-1, "R")):
    q = m1[np.sign(m1[:, 0]) == s]
    if not len(q) or side not in pu:
        continue
    a = q[np.argmin(np.abs(q[:, 0]))]
    b = q[np.argmax(np.abs(q[:, 0]))]
    for k, t in enumerate(np.linspace(0.2, 0.75, 6)):
        st_ = a + t * (b - a)
        tg = pu[side] + [s * (-0.004 + 0.002 * k), 0.006 + 0.002 * (k % 2), (k - 2.5) * 0.004]
        ctrl = st_ + [0, 0.012, 0.002]
        P = np.array([(1 - u) ** 2 * st_ + 2 * (1 - u) * u * ctrl + u ** 2 * tg for u in np.linspace(0, 1, 14)])
        lsa.append(tube(P, np.linspace(0.00045, 0.0003, len(P)), sides=6))
if lsa:
    add("lenticulostriate-arteries", "Lenticulostriate arteries", "artery", "brain", *merge(lsa), approx=True, src="drawn from the middle cerebral artery to the lentiform nucleus (approximate)", world=True)

# the callosomarginal artery: off the pericallosal artery at the genu, along the cingulate sulcus
(mCG, mUP), loc, _ = crop([["CgGr", "CgGc"], ["SFG", "PaCG", "PCLr", "PCLc"]])
Wc = vox_world(np.argwhere(mCG & ndi.binary_dilation(mUP, iterations=2)) + loc)
peri = np.asarray(VES["peri"].vertices)
cma = []
for s in (1, -1):
    Q = Wc[np.sign(Wc[:, 0]) == s]
    if len(Q) < 20:
        continue
    zb = np.round(Q[:, 2] / 0.003).astype(int)
    pts = [Q[zb == b][np.argmin(np.abs(Q[zb == b][:, 0]))] for b in np.unique(zb)]
    P = np.array(sorted(pts, key=lambda p: -p[2]))
    P[:, 0] = s * 0.001
    pr_ = peri[np.sign(peri[:, 0]) == s] if np.any(np.sign(peri[:, 0]) == s) else peri
    P = np.vstack([pr_[np.argmin(np.linalg.norm(pr_ - P[0], axis=1))], P])
    cma.append(tube(smooth_line(resample(P, 0.003), 5), 0.0007, sides=8))
if cma:
    add("callosomarginal-artery", "Callosomarginal artery", "artery", "brain", *merge(cma), approx=True, src="drawn along the cingulate sulcus of this atlas (approximate)", world=True)

# the trigeminal ganglion: the crescent at the front of Z-Anatomy's trigeminal nerve, where its three divisions start
tgV, tgF = raw("trigeminal-nerve-v")
tc = face_centres(tgV, tgF)
gsel = np.zeros(len(tc), bool)
for s in (1, -1):
    m = np.sign(tc[:, 0]) == s
    if m.any():
        gsel |= m & (tc[:, 2] > np.percentile(tc[m, 2], 45))
add("trigeminal-ganglion", "Trigeminal ganglion", "ganglion", "nerves", *sub(tgV, tgF, gsel), approx=True, src="the front of Z-Anatomy's trigeminal nerve (approximate)")

# ------------------------------------------------------------------ write
if __name__ == "__main__":
    scene = trimesh.Scene()
    table = []
    for p in PARTS:
        m = p["mesh"]
        scene.add_geometry(m, node_name=p["key"], geom_name=p["key"])
        lo_, hi_ = m.bounds
        e = dict(key=p["key"], name=p["name"], kind=p["kind"], group=p["group"], side=p["side"],
                 box=[[round(float(v), 4) for v in lo_], [round(float(v), 4) for v in hi_]], src=p["src"])
        if p["approx"]:
            e["approx"] = True
        table.append(e)
    out = os.path.join(RAW, "body.raw.glb")
    scene.export(out, file_type="glb")
    json.dump(dict(parts=table, marks=MARKS, credit="Z-Anatomy (CC BY-SA 4.0) and the Pathway tracer's models, warped onto this brain; approximate parts drawn from landmarks"),
              open(os.path.join(ROOT, "public/atlas3/body.json"), "w"), indent=1)
    tri = sum(len(p["mesh"].faces) for p in PARTS)
    print(f"{len(PARTS)} parts, {len(MARKS)} marks, {tri} triangles; wrote {out} ({os.path.getsize(out) / 1e6:.1f} MB)")
    for g in sorted({p["group"] for p in PARTS}):
        ps = [p for p in PARTS if p["group"] == g]
        print(f"  {g:10s} {len(ps):3d} parts {sum(len(p['mesh'].faces) for p in ps):7d} triangles")
