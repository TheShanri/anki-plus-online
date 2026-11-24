"""Blood supply: the two arteries the model has no vessel for, drawn from landmarks (marked approximate in the app).

  Anterior choroidal artery (achor): from the posterior wall of the internal carotid just below its terminus,
    posteriorly under the optic tract, between the uncus and the cerebral peduncle, into the temporal horn through
    the choroidal fissure, ending along the choroid plexus of the inferior horn.
  Posterior spinal arteries (psa): from the vertebral artery near the origin of PICA, posteriorly around the medulla
    to its dorsolateral surface, then down the posterolateral surface of the medulla and the cord (the dorsal root
    entry zone), as far down as the anterior spinal artery is drawn.

Waypoints come from the v3 label volume (optic tract, cerebral peduncle, inferior horn, choroid plexus, the brainstem's
outline per level) and the vessel file's own carotid and vertebral lines; everything is converted into the vessel
frame (zmap.mni_to_frame) and smoothed (Catmull-Rom, resampled every 0.5 mm). Writes the segments into
public/atlas/arteries-flow.json (replacing earlier copies of them).
Run: tools/.venv/Scripts/python.exe -I tools/atlas3/supplyvessels.py
"""
import os, json, sys
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import zmap  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
W = os.path.join(ROOT, "_atlas/raw/v3")
FLOW = os.path.join(ROOT, "public/atlas/arteries-flow.json")

meta = json.load(open(os.path.join(W, "labels.json")))
AFF = np.array(meta["affine"])
VOL = np.load(os.path.join(W, "labels.npy"), mmap_mode="r")
ids = {}
for l in meta["labels"]:
    ids.setdefault(l["key"], []).append((l["id"], l.get("side", "M")))


def vox_mm(mask_ids):
    """MNI mm of every voxel of these labels."""
    m = np.isin(VOL, list(mask_ids))
    ijk = np.argwhere(m)
    return ijk @ AFF[:3, :3].T + AFF[:3, 3]


def lab(key, side):
    return [i for i, s in ids.get(key, []) if s == side or s == "M"]


def catmull(pts, step=0.0005):
    """A smooth line through the points (centripetal Catmull-Rom), resampled every `step` metres."""
    P = np.asarray(pts, float)
    P = np.vstack([P[0] * 2 - P[1], P, P[-1] * 2 - P[-2]])
    out = [P[1]]
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        n = max(4, int(np.linalg.norm(p2 - p1) / step * 3))
        for t in np.linspace(0, 1, n)[1:]:
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out = np.array(out)
    # resample by arc length
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(out, axis=0), axis=1))]
    s = np.arange(0, d[-1], step)
    return np.stack([np.interp(s, d, out[:, k]) for k in range(3)], 1)


flow = json.load(open(FLOW))
seg = flow["segments"]


def line(name):
    return np.array(seg[name]["lines"][0], float).reshape(-1, 3)


def achor(side):
    """MNI side: the patient's left is MNI -x."""
    sx = -1 if side == "l" else 1
    ica = line(f"ica.{side}")
    # origin: the posterior wall of the carotid, 2 mm below its terminus (where the PComm leaves it), in MNI
    term_f = ica[-1]
    o_f = term_f + np.array([0, -0.002, -0.0018])
    o = zmap.frame_to_mni([o_f])[0]
    side_lab = "L" if side == "l" else "R"
    ot = vox_mm(lab("OT", side_lab))
    ot = ot[np.sign(ot[:, 0]) == sx]
    cpd = vox_mm(lab("CPd", side_lab))
    cpd = cpd[np.sign(cpd[:, 0]) == sx]
    ilv = vox_mm(lab("iLV", side_lab))
    ilv = ilv[np.sign(ilv[:, 0]) == sx]
    cp = vox_mm(lab("CP", side_lab))
    cp = cp[np.sign(cp[:, 0]) == sx]
    # under the optic tract: its anterior third and its middle, 1.5 mm below its lower surface
    ys = np.sort(ot[:, 1])
    pts = [o]
    for q in (0.75, 0.45, 0.2):
        y = np.quantile(ys, q)
        sl = ot[np.abs(ot[:, 1] - y) < 1.0]
        p = np.array([np.median(sl[:, 0]), y, sl[:, 2].min() - 1.5])
        pts.append(p)
    # around the cerebral peduncle: lateral to its lateral surface at the level of the tract's posterior end
    y = np.quantile(ys, 0.05)
    sl = cpd[np.abs(cpd[:, 1] - y) < 1.5]
    if len(sl):
        lat = sl[:, 0].min() if sx < 0 else sl[:, 0].max()
        pts.append(np.array([lat + sx * 2.0, y - 1.0, np.median(sl[:, 2]) - 1.0]))
    # into the temporal horn: the choroid plexus inside the inferior horn (within 1.5 mm of its voxels), entered at its
    # anterior end (the inferior choroidal point) and followed 8 mm back along it
    from scipy.spatial import cKDTree
    near = cKDTree(ilv).query(cp, distance_upper_bound=1.5)[0] < np.inf
    cpi = cp[near] if near.sum() > 5 else ilv
    # (the artery runs back from the carotid: it enters the horn behind the uncus, at about the level of the peduncle
    # point, then runs further back with the plexus; it never turns forward to the tip of the horn)
    ped_y = pts[-1][1]
    ent = cpi[(cpi[:, 1] < ped_y - 1) & (cpi[:, 1] > ped_y - 6)]
    a = np.median(ent, axis=0) if len(ent) else cpi[np.argmin(np.abs(cpi[:, 1] - (ped_y - 3)))]
    along = cpi[(cpi[:, 1] < a[1] - 6) & (cpi[:, 1] > a[1] - 10)]
    b = np.median(along, axis=0) if len(along) else a + np.array([0, -8.0, 0])
    pts += [a, b]
    P = np.array(pts)
    print(side, "achor waypoints (MNI mm):", np.round(P, 1).tolist())
    F = zmap.mni_to_frame(P)
    return catmull(F)


def psa(side):
    sx = -1 if side == "l" else 1
    side_lab = "L" if side == "l" else "R"
    pica = seg[f"pica.{side}"]["lines"][0]
    o_f = np.array(pica[:3], float)  # PICA's origin on the vertebral artery
    o = zmap.frame_to_mni([o_f])[0]
    asa = line(f"anterior-spinal.{side}")
    bottom_y_f = asa[:, 1].min()
    stem_keys = {"MoTg", "BSW", "Py", "IO", "Gr", "Cu", "FGr", "FCu", "Sp5", "GrT", "CuT", "ICP", "ALS", "DSCT", "LCST", "ACST", "VH", "PyX", "IAF", "ML", "MLF", "XII", "DMX", "Sol", "Amb", "AP", "Obex", "CeC", "mRt"}
    ms = []
    for k in stem_keys:
        ms += [i for i, s in ids.get(k, [])]
    stem = vox_mm(ms)
    # the dorsolateral surface per 2 mm level, from 3 mm below PICA's origin down to the bottom of the volume
    # the posterolateral sulcus: about 40 degrees from the posterior midline
    d = np.array([sx * 0.64, -0.77, 0.0])
    pts = [o]
    z0 = o[2] - 3.0
    z = z0
    while z > stem[:, 2].min() + 1.0:
        sl = stem[np.abs(stem[:, 2] - z) < 1.0]
        sl = sl[np.sign(sl[:, 0] - 0.0001) == sx] if (np.sign(sl[:, 0]) == sx).sum() > 20 else sl
        if len(sl) > 20:
            p = sl[np.argmax(sl @ d)] + d * 0.7
            pts.append(np.array([p[0], p[1], z]))
        z -= 2.0
    P = np.array(pts)
    F = zmap.mni_to_frame(P)
    # down to the level the anterior spinal artery reaches, straight below the last point
    if F[-1, 1] > bottom_y_f:
        last = F[-1]
        tail = [last + np.array([0, -(last[1] - bottom_y_f) * t, 0]) for t in (0.5, 1.0)]
        F = np.vstack([F, tail])
    return catmull(F)


out = {}
for s in ("l", "r"):
    a = achor(s)
    out[f"anterior-choroidal.{s}"] = {"artery": "achor", "side": s, "flow": "fwd", "radius": 0.0005, "parent": f"ica.{s}", "lines": [np.round(a.ravel(), 5).tolist()], "approx": True}
    p = psa(s)
    out[f"posterior-spinal.{s}"] = {"artery": "psa", "side": s, "flow": "fwd", "radius": 0.0003, "parent": f"vertebral.{s}", "lines": [np.round(p.ravel(), 5).tolist()], "approx": True}
    print(s, "achor", len(a), "pts, length %.1f mm" % (np.linalg.norm(np.diff(a, axis=0), axis=1).sum() * 1000), a[0].round(4), a[-1].round(4))
    print(s, "psa", len(p), "pts, length %.1f mm" % (np.linalg.norm(np.diff(p, axis=0), axis=1).sum() * 1000), p[0].round(4), p[-1].round(4))
for k in list(seg):
    if k.startswith("anterior-choroidal.") or k.startswith("posterior-spinal."):
        del seg[k]
seg.update(out)
json.dump(flow, open(FLOW, "w"), separators=(",", ":"))
print("written", FLOW)
