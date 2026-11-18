"""Builds public/atlas/veins.json: the centrelines of the cerebral veins and dural venous sinuses for the Drainage mode of the
blood supply atlas, oriented WITH the flow, in glTF metres (same space as gross.glb), with a radius per point.

Sources
- Z-Anatomy (CC BY-SA 4.0) splines (tools/atlas/veins/dump_splines.py): superior sagittal, transverse, sigmoid, superior and
  inferior petrosal and intercavernous sinuses, internal jugular vein, internal carotid artery. Their radii in Z-Anatomy are
  token (0.5 mm bevel); real calibres are set here (textbook adult values, rounded).
- Re-routed against the Z-Anatomy brain and dura (the Z-Anatomy straight, inferior sagittal and occipital sinus splines do not
  meet this brain: the straight sinus passes through the third ventricle): straight sinus along the falx-tentorium junction,
  inferior sagittal sinus in the free edge of the falx over the corpus callosum, occipital sinus behind the vermis, confluence
  at the posterior end of the junction.
- Built here (no Z-Anatomy object exists): superior cerebral veins with their bridging segments, superficial middle cerebral
  vein, inferior anastomotic vein (Labbe), internal cerebral veins, basal veins, great cerebral vein, cavernous sinus body,
  arachnoid granulations. Placed on / between the Z-Anatomy surfaces (snapped to the cortex, routed in the cisterns).
The result is shared under CC BY-SA 4.0 (adapted from Z-Anatomy).

Run: tools/.venv/Scripts/python.exe -I tools/atlas/veins/build.py [--plots <dir>]
"""
import json, os, sys
import numpy as np
from scipy.spatial import cKDTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ref  # noqa: E402

MM = 0.001
SPL = json.load(open(os.path.join(ref.ROOT, "_atlas", "raw", "veins", "splines.json")))
OUT = os.path.join(ref.ROOT, "public", "atlas", "veins.json")


# ---------------------------------------------------------------- polyline helpers
def arclen(P):
    d = np.linalg.norm(np.diff(P, axis=0), axis=1)
    return np.concatenate([[0], np.cumsum(d)])


def resample(P, step=0.8 * MM, R=None):
    """Even arc-length resampling (linear), optionally carrying a per-point value."""
    s = arclen(P)
    n = max(2, int(round(s[-1] / step)) + 1)
    t = np.linspace(0, s[-1], n)
    Q = np.stack([np.interp(t, s, P[:, k]) for k in range(3)], 1)
    return (Q, np.interp(t, s, R)) if R is not None else Q


def catmull(C, step=0.8 * MM):
    """Centripetal Catmull-Rom through control points, then even resampling."""
    C = np.asarray(C, float)
    if len(C) < 3:
        return resample(C, step)
    P = np.vstack([2 * C[0] - C[1], C, 2 * C[-1] - C[-2]])
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        t0 = 0.0
        t1 = t0 + np.linalg.norm(p1 - p0) ** 0.5 + 1e-9
        t2 = t1 + np.linalg.norm(p2 - p1) ** 0.5 + 1e-9
        t3 = t2 + np.linalg.norm(p3 - p2) ** 0.5 + 1e-9
        for t in np.linspace(t1, t2, 24, endpoint=False):
            a1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1
            a2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2
            a3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3
            b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2
            b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3
            out.append((t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2)
    out.append(C[-1])
    return resample(np.array(out), step)


def smooth(P, iters=6, lam=0.5, fix_ends=True):
    P = P.copy()
    for _ in range(iters):
        Q = P.copy()
        Q[1:-1] = P[1:-1] + lam * (0.5 * (P[:-2] + P[2:]) - P[1:-1])
        if not fix_ends:
            Q[0], Q[-1] = P[0], P[-1]
        P = Q
    return P


def ramp(n, a, b, ease=True):
    t = np.linspace(0, 1, n)
    if ease:
        t = t * t * (3 - 2 * t)
    return a + (b - a) * t


def sp(name):
    return np.array([p[:3] for p in SPL[name]["pts"]])


def ctrl(name):
    return np.array([p[:3] for p in SPL[name]["ctrl"]])


def mirror(P):
    Q = np.array(P, float).copy()
    Q[:, 0] *= -1
    return Q


# ---------------------------------------------------------------- reference surfaces
ctx = ref.context()
CEREBRUM, CEREBELLUM, STEM = ctx["ctx_cerebrum"], ctx["ctx_cerebellum"], ctx["ctx_brainstem"]


def dense(mesh, n):
    import trimesh

    pts, _ = trimesh.sample.sample_surface(mesh, n, seed=7)
    return np.vstack([pts, mesh.vertices])


BRAIN_PTS = np.vstack([dense(CEREBRUM, 260000), dense(CEREBELLUM, 120000), dense(STEM, 40000)])
BRAIN_T = cKDTree(BRAIN_PTS)
C_CEREBRUM = np.array([0, 1.630, -0.010])
C_CEREBELLUM = np.array([0, 1.585, -0.050])


def push_out(P, R, clear=0.5 * MM, iters=40, centre=None, keep=None):
    """Moves centreline points out of the brain until the tube (radius R) clears the surface by `clear`.
    Direction: away from the nearest surface sample, oriented away from `centre` (the brain is not watertight)."""
    P = P.copy()
    for _ in range(iters):
        d, i = BRAIN_T.query(P)
        need = R + clear - d
        if need.max() <= 1e-5:
            break
        Q = BRAIN_PTS[i]
        v = P - Q
        cen = centre if centre is not None else np.where((P[:, 1:2] < 1.6) & (P[:, 2:3] < -0.03), C_CEREBELLUM, C_CEREBRUM)
        o = P - cen
        flip = (v * o).sum(1) < 0
        v[flip] = o[flip]
        v /= np.linalg.norm(v, axis=1, keepdims=True) + 1e-12
        step = np.clip(need, 0, None)[:, None] * 0.6
        if keep is not None:
            step[keep] = 0
        P = P + v * step
        P[1:-1] = P[1:-1] + 0.3 * (0.5 * (P[:-2] + P[2:]) - P[1:-1]) * (need[1:-1, None] > 0)
    return P


def clearance(P, R):
    d, _ = BRAIN_T.query(P)
    return (d - R).min()


# ray casting on the cerebrum (numpy Moller-Trumbore, no rtree in the venv)
TRI = CEREBRUM.triangles


def ray_out(o, d):
    """Outermost hit of the ray o + t d (t > 0) with the cerebrum; None if no hit."""
    v0, v1, v2 = TRI[:, 0], TRI[:, 1], TRI[:, 2]
    e1, e2 = v1 - v0, v2 - v0
    h = np.cross(d, e2)
    a = (e1 * h).sum(1)
    ok = np.abs(a) > 1e-12
    f = np.where(ok, 1.0 / np.where(ok, a, 1), 0)
    s = o - v0
    u = f * (s * h).sum(1)
    q = np.cross(s, e1)
    v = f * (q @ d)
    t = f * (e2 * q).sum(1)
    hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 0)
    if not hit.any():
        return None
    return o + d * t[hit].max()


def on_surface(points_dirs, lift):
    """points_dirs: list of (origin, direction); returns the outermost surface points lifted along the ray."""
    out = []
    for o, d in points_dirs:
        d = d / np.linalg.norm(d)
        h = ray_out(o, d)
        out.append(None if h is None else h + d * lift)
    return out


# ---------------------------------------------------------------- vessels
V = []  # dicts: id, name, side, kind, profile, pts (N x 3), r (N), [w] (N), [n] (N x 3 outward for "tri")


def add(id_, name, side, P, R, kind="sinus", profile="round", **extra):
    P = np.asarray(P, float)
    R = np.broadcast_to(np.asarray(R, float), (len(P),)).copy()
    V.append(dict(id=id_, name=name, side=side, kind=kind, profile=profile, pts=P, r=R, **extra))


# confluence of sinuses: posterior end of the falx-tentorium junction (internal occipital protuberance)
CONF = np.array([0.0, 1.5895, -0.0880])

# ---- superior sagittal sinus (Z-Anatomy, its last part re-routed to the confluence), triangular in the falx
sss = sp("Superior sagittal sinus")
cut = np.argmax((sss[:, 2] < -0.085) & (sss[:, 1] < 1.606))  # behind the occipital poles, leave the spline here
sss = np.vstack([sss[:cut], catmull([sss[cut - 1], (sss[cut - 1] + CONF) / 2 + np.array([0, 0.0, -0.002]), CONF])[1:]])
sss = resample(smooth(resample(sss, 0.8 * MM), 4))
n = len(sss)
s = arclen(sss) / arclen(sss)[-1]
w = np.interp(s, [0, 0.12, 0.45, 0.8, 1], [0.9, 1.8, 3.2, 4.0, 4.2]) * MM  # half-width of the base
# outward normal in the sagittal plane (away from the brain): perpendicular to the tangent, pointing away from the centre
tan = np.gradient(sss, axis=0)
tan /= np.linalg.norm(tan, axis=1, keepdims=True)
nrm = np.cross(tan, np.array([1.0, 0, 0]))
flip = ((sss - C_CEREBRUM) * nrm).sum(1) < 0
nrm[flip] *= -1
nrm /= np.linalg.norm(nrm, axis=1, keepdims=True)
H = 1.35 * w  # base to apex
# keep the triangle (apex pointing into the falx) clear of the hemispheres: shift outward where needed
shift = np.zeros(n)
for i in range(n):
    near = BRAIN_PTS[BRAIN_T.query_ball_point(sss[i], 9 * MM)]
    if not len(near):
        continue
    rel = near - sss[i]
    u = np.abs(rel[:, 0])
    m = (u < w[i]) & (np.abs((rel * tan[i]).sum(1)) < 2 * MM)
    if not m.any():
        continue
    nn = (rel[m] * nrm[i]).sum(1)
    inner = -2 * H[i] / 3 + (H[i]) * u[m] / w[i]  # inner boundary of the triangle at this lateral offset
    shift[i] = max(0.0, (nn - inner + 0.5 * MM).max())
shift = np.convolve(np.pad(shift, 6, mode="edge"), np.ones(13) / 13, mode="valid")
shift = np.maximum(shift, 0)
sss = sss + nrm * shift[:, None]
add("sss", "Superior sagittal sinus", "m", sss, H * 0.55, profile="tri", w=w, n=nrm, h=H)
SSS = sss

# ---- arachnoid granulations: small knobs bulging into the lateral lacunae of the SSS (CSF return, lab 2)
gran = []
rng = np.random.default_rng(3)
for u in np.linspace(0.18, 0.78, 9):
    i = int(u * (n - 1))
    for sx in (1, -1):
        p = sss[i] + np.array([sx * (w[i] + 0.6 * MM), 0, 0]) - nrm[i] * (H[i] * 0.15) + tan[i] * rng.uniform(-2, 2) * MM
        gran.append(p.tolist())

# ---- inferior sagittal sinus: in the free edge of the falx, ~3 mm above the corpus callosum, then down behind the splenium
cc = ref.mesh("corpus-callosum").vertices
ccm = cc[np.abs(cc[:, 0]) < 0.004]


def cc_top(z):
    s_ = ccm[np.abs(ccm[:, 2] - z) < 0.0025]
    return s_[:, 1].max()


S0 = np.array([0.0, 1.6142, -0.0520])  # start of the straight sinus: tentorial apex, behind and below the splenium
iss_c = [[0, cc_top(z) + 3.2 * MM, z] for z in (0.032, 0.022, 0.010, -0.002, -0.014, -0.026, -0.036)]
iss_c += [[0, 1.6405, -0.0455], [0, 1.6330, -0.0515], [0, 1.6235, -0.0545], S0 + np.array([0, 0.0015, -0.0005])]
iss = catmull(iss_c)
add("iss", "Inferior sagittal sinus", "m", iss, ramp(len(iss), 0.55 * MM, 1.25 * MM, False))

# ---- straight sinus: along the junction of the falx cerebri and the tentorium cerebelli, to the confluence
tn = ref.mesh("tentorium-cerebelli").vertices
tm = tn[np.abs(tn[:, 0]) < 0.002]
ridge = []
for z in np.arange(-0.056, -0.083, -0.006):
    s_ = tm[np.abs(tm[:, 2] - z) < 0.003]
    ridge.append([0, s_[:, 1].max() + 1.6 * MM, z])
straight = catmull([S0] + ridge + [CONF + np.array([0, 0.0012, 0.0012])])
add("straight", "Straight sinus", "m", straight, ramp(len(straight), 1.7 * MM, 2.4 * MM, False))

# ---- great cerebral vein (of Galen): from the union of the internal cerebral veins, under the splenium, into the straight sinus
UNION = np.array([0.0, 1.6212, -0.0292])
gcv = catmull([UNION, [0, 1.6188, -0.0345], [0, 1.6158, -0.0410], [0, 1.6146, -0.0468], S0 + np.array([0, 0, -0.0012])])
add("gcv", "Great cerebral vein", "m", gcv, ramp(len(gcv), 1.25 * MM, 1.8 * MM, False), kind="vein")

# ---- internal cerebral veins: roof of the third ventricle (velum interpositum), from the interventricular foramen back
for sx, side in ((1, "l"), (-1, "r")):
    icv = catmull([[sx * 0.0030, 1.6312, 0.0068], [sx * 0.0024, 1.6328, 0.0010], [sx * 0.0022, 1.6326, -0.0070], [sx * 0.0022, 1.6302, -0.0160], [sx * 0.0020, 1.6265, -0.0235], [sx * 0.0008, 1.6225, -0.0282], UNION + np.array([0, 0, -0.0006])])
    add("icv", "Internal cerebral vein", side, icv, ramp(len(icv), 0.6 * MM, 0.95 * MM, False), kind="vein")

# ---- basal veins (of Rosenthal): from below the anterior perforated substance, around the cerebral peduncle, to the great vein
for sx, side in ((1, "l"), (-1, "r")):
    bc = [[sx * 0.0150, 1.6015, 0.0135], [sx * 0.0200, 1.6030, 0.0060], [sx * 0.0232, 1.6060, -0.0030], [sx * 0.0225, 1.6100, -0.0110], [sx * 0.0175, 1.6140, -0.0185], [sx * 0.0095, 1.6175, -0.0255], [sx * 0.0030, 1.6195, -0.0300], UNION + np.array([0, -0.0006, -0.0018])]
    bv = catmull(bc)  # in the ambient cistern, hugging the midbrain: no push (the cistern is not a gap in these meshes)
    add("basal", "Basal vein", side, smooth(bv, 3), ramp(len(bv), 0.6 * MM, 0.9 * MM, False), kind="vein")

# ---- occipital sinus: from the margin of the foramen magnum, up behind the vermis (falx cerebelli), into the confluence
occ_c = [[0, 1.5470, -0.0360], [0, 1.5525, -0.0520], [0, 1.5600, -0.0660], [0, 1.5700, -0.0770], [0, 1.5800, -0.0850], CONF + np.array([0, -0.0015, -0.0005])]
occ = catmull(occ_c)
occ = push_out(occ, np.full(len(occ), 1.0 * MM), clear=0.4 * MM, centre=C_CEREBELLUM, keep=np.arange(len(occ)) > len(occ) - 4)
add("occipital", "Occipital sinus", "m", smooth(occ, 3), ramp(len(occ), 0.7 * MM, 1.1 * MM, False))

# ---- confluence: a short horizontal body joining the sinuses
conf = catmull([CONF + np.array([0.007, 0.0004, 0.0005]), CONF, CONF + np.array([-0.007, 0.0004, 0.0005])])
add("confluence", "Confluence of sinuses", "m", conf, np.full(len(conf), 3.6 * MM))

# ---- transverse and sigmoid sinuses, internal jugular vein (Z-Anatomy; transverse start moved to the confluence)
tr0 = sp("Transverse sinus.l")
k = np.argmax(tr0[:, 0] > 0.02)
trc = [CONF + np.array([0.004, 0.0005, 0.0003]), [0.0125, 1.5895, -0.0855]] + tr0[k::6].tolist() + [tr0[-1].tolist()]
SIG = sp("Sigmoid sinus.l")
IJV = ctrl("Internal jugular vein.l")
for sx, side in ((1, "l"), (-1, "r")):
    t = catmull(trc)
    if sx < 0:
        t = mirror(t)
    t = push_out(t, np.full(len(t), 3.0 * MM), clear=0.4 * MM, centre=C_CEREBELLUM, keep=np.arange(len(t)) < 6)
    t = smooth(t, 6)
    add("transverse", "Transverse sinus", side, t, ramp(len(t), 3.0 * MM, 3.1 * MM, False))
    sg = resample(SIG if sx > 0 else mirror(SIG))
    jf = sg[-1]  # jugular foramen
    sg = push_out(sg, np.full(len(sg), 3.2 * MM), clear=0.4 * MM, centre=C_CEREBELLUM)
    sg = smooth(np.vstack([t[-1:], sg[1:]]), 5)
    add("sigmoid", "Sigmoid sinus", side, sg, ramp(len(sg), 3.1 * MM, 3.5 * MM, False))
    ij = IJV if sx > 0 else mirror(IJV)
    lo = ij[(ij[:, 1] < 1.5585) & (ij[:, 1] > 1.53)]
    bulb = jf + np.array([sx * -0.0035, -0.0040, 0.0030])
    ijc = [sg[-1], bulb] + lo.tolist() + [[sx * 0.0318, 1.5300, 0.0002]]
    ijl = catmull(ijc)
    s_ = arclen(ijl) / arclen(ijl)[-1]
    add("ijv", "Internal jugular vein", side, ijl, np.interp(s_, [0, 0.12, 0.3, 1], [3.6, 5.2, 4.6, 4.4]) * MM)

# ---- cavernous sinus (beside the sella, around the internal carotid), petrosal and intercavernous sinuses
for sx, side in ((1, "l"), (-1, "r")):
    cav = catmull([[sx * 0.0128, 1.5940, 0.0262], [sx * 0.0136, 1.5928, 0.0180], [sx * 0.0142, 1.5905, 0.0100], [sx * 0.0145, 1.5885, 0.0040]])
    s_ = np.linspace(0, 1, len(cav))
    env = np.sin(np.clip(s_, 0, 1) * np.pi) ** 0.35
    add("cavernous", "Cavernous sinus", side, cav, np.maximum(env, 0.25) * 3.9 * MM, profile="oval", ry=1.45)

    sps = ctrl("Superior petrosal sinus.l")[::-1]  # Z-Anatomy runs it from the transverse end: flow is cavernous -> transverse
    if sx < 0:
        sps = mirror(sps)
    spl = catmull([[sx * 0.0145, 1.5890, 0.0050]] + sps[1:].tolist())
    spl = push_out(spl, np.full(len(spl), 1.0 * MM), clear=0.3 * MM, keep=(np.arange(len(spl)) < 4) | (np.arange(len(spl)) > len(spl) - 4))
    add("sps", "Superior petrosal sinus", side, smooth(spl, 3), np.full(len(spl), 1.0 * MM))

    ips = ctrl("Inferior petrosal sinus.l")
    if sx < 0:
        ips = mirror(ips)
    ipl = catmull([[sx * 0.0135, 1.5880, 0.0050]] + ips[1:].tolist())
    add("ips", "Inferior petrosal sinus", side, ipl, np.full(len(ipl), 1.15 * MM))

ic = catmull([[0.0105, 1.5960, 0.0230], [0, 1.5995, 0.0222], [-0.0105, 1.5960, 0.0230]])
add("intercavernous", "Intercavernous sinuses", "m", ic, np.full(len(ic), 0.75 * MM))
ic2 = catmull([[0.0112, 1.5915, 0.0075], [0, 1.5945, 0.0080], [-0.0112, 1.5915, 0.0075]])
add("intercavernous", "Intercavernous sinuses", "m", ic2, np.full(len(ic2), 0.75 * MM))

# ---- the internal carotid artery through the cavernous sinus (context, drawn faint red)
ica = []
for sx, side in ((1, "l"), (-1, "r")):
    c_ = sp("Internal carotid artery.l" if sx > 0 else "Internal carotid artery.r")
    c_ = c_[(c_[:, 1] > 1.566) & (c_[:, 1] < 1.6045)]
    ica.append(dict(side=side, pts=resample(c_, 0.8 * MM), r=1.45 * MM))

# ---------------------------------------------------------------- superficial veins (snapped to the cortex)
LIFT = 1.0 * MM


def snap_coronal(z, phi, sx):
    """Surface point of the convexity on the coronal plane z, at elevation phi (deg) on side sx."""
    # a small bundle of rays (cracks between the gyral patches let a single ray through): the outermost hit wins
    best = None
    for dz in (-0.0015, 0, 0.0015):
        for dp in (-2.0, 0, 2.0):
            o = np.array([0.0, 1.625, z + dz])
            a = np.radians(phi + dp)
            d = np.array([sx * np.cos(a), np.sin(a), 0.0])
            h = ray_out(o, d)
            if h is not None and (best is None or np.linalg.norm(h - o) > best[0]):
                best = (np.linalg.norm(h - o), h - np.array([0, 0, dz]), d)
    return None if best is None else best[1] + best[2] * LIFT


def snap_lateral(y, z, sx):
    best = None
    for dy in (-0.0012, 0, 0.0012):
        for dz in (-0.0012, 0, 0.0012):
            h = ray_out(np.array([0.0, y + dy, z + dz]), np.array([sx, 0.0, 0.0]))
            if h is not None and (best is None or abs(h[0]) > abs(best[0])):
                best = h - np.array([0, dy, dz])
    return None if best is None else best + np.array([sx * LIFT, 0, 0])


def sss_at(z):
    """SSS sample nearest to the coronal plane z (upper part only)."""
    m = SSS[:, 1] > 1.64
    i = np.argmin(np.abs(SSS[m, 2] - z))
    j = np.flatnonzero(m)[i]
    return j


# superior cerebral veins: up the convexity, the posterior ones running obliquely forward (against the sinus flow); the last
# segment crosses the subdural space as a bridging vein and enters the lateral wall of the sinus
SCV = [(0.050, 0.050), (0.032, 0.030), (0.014, 0.010), (-0.004, -0.012), (-0.026, -0.034), (-0.044, -0.056), (-0.060, -0.074)]
for sx, side in ((1, "l"), (-1, "r")):
    for ze, zs in SCV:
        zs2 = zs + (-0.003 if sx < 0 else 0.0)  # left and right are not mirror images
        path = []
        for u in np.linspace(0, 1, 7):
            phi = 14 + (62 - 14) * u
            z = zs2 + (ze - zs2) * (u ** 1.4)
            p = snap_coronal(z, phi, sx)
            if p is not None:
                path.append(p)
        last_ok = path[-1]
        # the parasagittal end: the highest snapped point still at least 7 mm from the midline
        for phi in np.arange(66, 89, 1.5):
            p = snap_coronal(ze, phi, sx)
            if p is None:
                continue
            if abs(p[0]) < 0.0075:
                break
            last_ok = p
        path.append(last_ok)
        if len(path) < 5:
            continue
        P = catmull(path)
        P = smooth(P, 40, 0.5)
        P = push_out(P, np.full(len(P), 1.0 * MM), clear=0.35 * MM)
        P = smooth(P, 10, 0.5)
        j = sss_at(P[-1][2] + 0.002)
        wall = SSS[j] + np.array([sx * (V[0]["w"][j] * 0.75), 0, 0]) - V[0]["n"][j] * (V[0]["h"][j] * 0.05)
        top = P[-1] + np.array([0, 0.0025, 0]) + V[0]["n"][j] * 0.001
        br = catmull([P[-1], top * 0.5 + wall * 0.5 + np.array([sx * 0.0012, 0.0008, 0]), wall])
        add("scv", "Superior cerebral veins", side, P, ramp(len(P), 0.55 * MM, 1.0 * MM, False), kind="vein")
        add("bridging", "Bridging veins", side, br, np.full(len(br), 0.95 * MM), kind="vein")

# superficial middle cerebral vein: along the lateral sulcus (upper edge of the superior temporal gyrus), forward and then
# medially along the lesser wing of the sphenoid to the cavernous sinus
stg = ref.mesh("superior-temporal-gyrus-lateral-part").vertices
for sx, side in ((1, "l"), (-1, "r")):
    g = stg[stg[:, 0] * sx > 0.03]
    pts = []
    for z in np.arange(-0.030, 0.022, 0.004):
        s_ = g[np.abs(g[:, 2] - z) < 0.002]
        if not len(s_):
            continue
        y = s_[:, 1].max() + 0.0015
        p = snap_lateral(y, z, sx)
        if p is not None:
            pts.append(p)
    lat = catmull(pts[::2] + ([pts[-1]] if len(pts) % 2 == 0 else []))
    lat = smooth(lat, 30)
    tip = lat[-1]
    med = catmull([tip, tip + np.array([-sx * 0.006, -0.002, 0.006]), [sx * 0.032, 1.5975, 0.0315], [sx * 0.022, 1.5960, 0.0300], [sx * 0.0145, 1.5945, 0.0262]])
    path = np.vstack([lat, med[1:]])
    path = push_out(resample(path), np.full(len(resample(path)), 0.9 * MM), clear=0.35 * MM, keep=np.arange(len(resample(path))) > len(resample(path)) - 6)
    path = smooth(path, 12)
    add("smcv", "Superficial middle cerebral vein", side, path, np.full(len(path), 0.95 * MM), kind="vein")
    SM = path

    # inferior anastomotic vein (of Labbe): from the superficial middle cerebral vein across the temporal lobe to the transverse sinus
    i0 = int(len(lat) * 0.35)
    start = lat[i0]
    tv = [v for v in V if v["id"] == "transverse" and v["side"] == side][0]["pts"]
    end = tv[int(len(tv) * 0.82)]
    mids = []
    for u in np.linspace(0.12, 0.88, 9):
        y = start[1] + (end[1] + 0.006 - start[1]) * u - 0.008 * np.sin(np.pi * u)
        z = start[2] + (end[2] - start[2]) * u
        p = snap_lateral(y, z, sx)
        if p is not None:
            mids.append(p)
    lab = catmull([start] + mids + [end])
    lab = smooth(lab, 25)
    keep = np.arange(len(lab)) > len(lab) - 5
    lab = push_out(lab, np.full(len(lab), 0.8 * MM), clear=0.3 * MM, keep=keep)
    add("labbe", "Inferior anastomotic vein (of Labbe)", side, lab, np.full(len(lab), 0.8 * MM), kind="vein")


# ---------------------------------------------------------------- write
def r5(a):
    return [round(float(x), 5) for x in np.asarray(a).ravel()]


def r2mm(a):
    return [round(float(x) / MM, 2) for x in np.asarray(a).ravel()]


out = {
    "version": 1,
    "note": "Cerebral veins and dural venous sinuses for the Drainage mode. Centrelines oriented with the flow, glTF metres (same space as gross.glb), radii in mm. Built by tools/atlas/veins/build.py from Z-Anatomy (CC BY-SA 4.0) splines and surfaces; shared under CC BY-SA 4.0.",
    "vessels": [],
    "granulations": [r5(g) for g in gran],
    "ica": [dict(side=c["side"], pts=r5(c["pts"]), r=round(c["r"] / MM, 2)) for c in ica],
}
for v in V:
    e = dict(id=v["id"], name=v["name"], side=v["side"], kind=v["kind"], profile=v["profile"], pts=r5(resample(v["pts"], 0.8 * MM) if False else v["pts"]), r=r2mm(v["r"]))
    if v["profile"] == "tri":
        e["w"] = r2mm(v["w"])
        e["h"] = r2mm(v["h"])
        e["n"] = [round(float(x), 4) for x in v["n"].ravel()]
    if v["profile"] == "oval":
        e["ry"] = v["ry"]
    out["vessels"].append(e)

# report
for v in V:
    print("%-11s %s  n=%4d  len=%5.1f mm  min clearance %+.2f mm" % (v["id"], v["side"], len(v["pts"]), arclen(v["pts"])[-1] / MM, clearance(v["pts"], v["r"]) / MM))
json.dump(out, open(OUT, "w"), separators=(",", ":"))
print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")

if "--plots" in sys.argv:
    import plots

    plots.render(V, gran, ica, sys.argv[sys.argv.index("--plots") + 1])
