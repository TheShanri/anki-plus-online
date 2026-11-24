"""Atlas v3: brainstem nuclei and tracts from the course's own brainstem plates.

The Allen atlas stops at the brainstem's divisions (tegmentum, basilar pons, pyramids, olive). The cranial-nerve nuclei
and the brainstem tracts come from the course's level plates (src/data/brainstem-plates/*.json: vector drawings of the
Lab 8 sections, each region sourced and owner-reviewed for the brainstem atlas). Per plate level:

  1. the section plane: through the brainstem's centre line at the level's MNI height (brainstem-levels.json, mniZ),
     perpendicular to the brainstem's long axis (the plates are true transverse sections);
  2. plate -> plane: x = -a (px - mid), d = c - b py (the plate is dorsal-up, its patient's left on the left), fitted by
     least squares on landmarks drawn on the plate AND labelled in the atlas (colliculi, red nucleus, nigra, peduncles,
     aqueduct, fourth ventricle, cerebellar peduncles, lemniscus, MLF, olive, pyramids ...), outliers > 3 mm dropped;
  3. every imported region becomes a 2D signed distance field in its plane.
Between two plates that show a structure, its cross-sections are blended along the axis (signed distances mixed by the
position between the planes); past the first / last plate it tapers out over EXT mm (anatomical extent; the nuclei that
appear on one plate only get their standard rostro-caudal length). Voxels are only taken from their HOSTS (tegmentum,
basilar pons ...), so the nuclei sit inside the Allen brainstem and the outside surface never changes.

carve(K, KI, keys) writes the new keys into the label volume K (before the left/right split) and returns a report.
"""
import os, json, re
import numpy as np
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PLATES = os.path.join(ROOT, "src/data/brainstem-plates")
LEVELS = json.load(open(os.path.join(ROOT, "src/data/brainstem-levels.json"), encoding="utf8"))["levels"]
VOX = 0.5
DIAG = bool(os.environ.get("BS_DIAG"))

# plate landmark slug -> v3 key (labelled in both)
LANDMARK = {
    "superior-colliculus": "SC", "inferior-colliculus": "ICo", "red-nucleus": "RN", "substantia-nigra": "SN",
    "cerebral-peduncles": "CPd", "periaqueductal-gray": "PAG", "cerebral-aqueduct": "Aq", "fourth-ventricle": "V4",
    "medial-geniculate-nucleus": "MGN", "medial-lemniscus": "ML", "medial-longitudinal-fasciculus": "MLF",
    "middle-cerebellar-peduncle": "MCP", "superior-cerebellar-peduncle": "SCP", "inferior-cerebellar-peduncle": "ICP",
    "inferior-olivary-nucleus": "IO", "pyramids": "Py", "pontine-protuberance": "PnBa", "central-canal": "CeC",
}
TEG = ["MTg", "PnTg", "MoTg", "mRt", "PnO", "BSW"]
# nuclei may also take voxels of the HCP-derived lemniscus / MLF and of the tracts carved before them from the plates (a
# nucleus drawn on the plate wins over a tract)
NUC = TEG + ["MLF", "ML", "ALS", "DSCT", "IAF"]
# key: (plate slugs, from "regions" or "fibres", hosts, extension beyond the end plates in mm (rostral, caudal),
#       stroke radius for fibres in mm)
IMPORT = {
    "ALS": (["anterolateral-spinothalamic-tract"], "regions", TEG, (3.0, 3.0), 0),
    "DSCT": (["dorsal-spinocerebellar-tract"], "regions", TEG + ["ICP"], (2.0, 3.0), 0),
    "LFP": (["longitudinal-fibers-of-the-pons"], "regions", ["PnBa"], (3.0, 3.0), 0),
    "BIC": (["brachium-of-the-inferior-colliculus"], "regions", TEG + ["ICo", "SC", "PTR"], (2.0, 2.0), 0),
    "xSCP": (["decussation-of-the-superior-cerebellar-peduncle"], "regions", TEG + ["SCP"], (1.5, 1.5), 0),
    "PyX": (["motor-decussation"], "regions", ["Py", "MoTg", "BSW"], (2.0, 3.0), 0),
    "IAF": (["internal-arcuate-fibers"], "fibres", ["MoTg", "BSW"], (1.5, 1.5), 0.45),
    "III": (["oculomotor-nucleus"], "regions", NUC + ["PAG"], (2.5, 2.5), 0),
    "EW": (["edinger-westphal-nucleus"], "regions", NUC + ["PAG"], (2.5, 2.0), 0),
    "IV": (["trochlear-nucleus"], "regions", NUC + ["PAG", "DR"], (1.5, 1.5), 0),
    "Vmo": (["motor-trigeminal-nucleus"], "regions", NUC, (2.5, 2.5), 0),
    # lateral in the pontine tegmentum, where the trigeminal root comes in through the middle cerebellar peduncle
    "Vps": (["principal-sensory-nucleus-of-trigeminal"], "regions", NUC + ["MCP"], (2.5, 2.5), 0),
    # under the facial colliculus: it may take the colliculus' voxels
    "VI": (["abducens-nucleus"], "regions", NUC + ["FCol"], (2.0, 2.0), 0),
    "VII": (["facial-nucleus"], "regions", NUC, (2.5, 2.5), 0),
    "PPRF": (["paramedian-pontine-reticular-formation"], "regions", NUC, (4.0, 2.0), 0),
    "VCx": (["vestibulocochlear-complex"], "regions", NUC + ["ICP"], (2.0, 2.0), 0),
    "Sp5": (["spinal-trigeminal-nucleus"], "regions", NUC, (2.0, 4.0), 0),
    "Sol": (["solitary-nucleus"], "regions", NUC, (2.0, 2.0), 0),
    "DMX": (["dorsal-motor-nucleus-of-the-vagus"], "regions", NUC, (2.0, 2.0), 0),
    "XII": (["hypoglossal-nucleus"], "regions", NUC, (2.0, 2.0), 0),
    "Amb": (["nucleus-ambiguus"], "regions", NUC, (2.0, 2.0), 0),
    "Gr": (["gracile-nucleus"], "regions", NUC, (1.5, 4.0), 0),
    "Cu": (["cuneate-nucleus"], "regions", NUC, (1.5, 4.0), 0),
    # the floor tissue over the abducens nucleus (the atlas's fourth ventricle reaches a little deeper than the plate's
    # floor here, so the colliculus and the nucleus are moved down onto the atlas's floor, never into the ventricle)
    "FCol": (["facial-colliculus"], "regions", ["PnTg", "MoTg", "BSW"], (1.5, 1.5), 0),
    "IPF": (["interpeduncular-fossa"], "regions", ["__outside__"], (3.0, 3.0), 0),
}
# carving order: tracts first (a nucleus drawn over a tract wins), then the nuclei from the midline outwards (none takes
# another's voxels, so the medial columns claim their place before the lateral ones are moved in)
ORDER = ["ALS", "DSCT", "LFP", "BIC", "xSCP", "PyX", "IAF", "IPF", "FCol", "XII", "DMX", "Sol", "Gr", "Cu", "Amb", "PPRF", "VI",
         "VII", "VCx", "Sp5", "Vmo", "Vps", "IV", "III", "EW"]
# on the midline: one centre for both halves when a section is laid on the next
MIDLINE = {"xSCP", "PyX", "IPF"}


def parse_path(d):
    """SVG path with absolute M, C, Z only (the plates) -> list of polygons (N x 2)."""
    toks = re.findall(r"[MCZ]|-?\d*\.?\d+(?:e-?\d+)?", d)
    polys, cur, i, cmd = [], [], 0, None
    pen = None
    while i < len(toks):
        t = toks[i]
        if t in "MCZ":
            cmd = t
            i += 1
            if cmd == "Z":
                if cur:
                    polys.append(np.array(cur))
                cur = []
            continue
        if cmd == "M":
            pen = (float(toks[i]), float(toks[i + 1])); i += 2
            if cur:
                polys.append(np.array(cur))
            cur = [pen]
            cmd = "C"  # implicit lineto is never used by the plates; treat following pairs as curves
        elif cmd == "C":
            c1 = (float(toks[i]), float(toks[i + 1])); c2 = (float(toks[i + 2]), float(toks[i + 3])); p = (float(toks[i + 4]), float(toks[i + 5]))
            i += 6
            for s in np.linspace(0.125, 1.0, 8):
                u = 1 - s
                cur.append((u ** 3 * pen[0] + 3 * u * u * s * c1[0] + 3 * u * s * s * c2[0] + s ** 3 * p[0],
                            u ** 3 * pen[1] + 3 * u * u * s * c1[1] + 3 * u * s * s * c2[1] + s ** 3 * p[1]))
            pen = p
        else:
            i += 1
    if cur:
        polys.append(np.array(cur))
    return polys


def centreline(K, KI, AFF):
    """Brainstem centre (MNI mm) per axial slice, smoothed, and its unit tangent (rostral)."""
    keys = ["MTg", "PnTg", "MoTg", "PnBa", "Py", "IO", "BSW", "CPd", "SN", "RN", "PAG", "Aq", "V4", "MLF", "ML", "mRt", "PnO"]
    bs = np.isin(K, [KI[k] for k in keys if k in KI])
    zs, cs = [], []
    for k in range(K.shape[2]):
        sl = bs[:, :, k]
        if sl.sum() < 40:
            continue
        ij = np.argwhere(sl)
        c = ij.mean(0) * VOX + AFF[:2, 3]
        zs.append(k * VOX + AFF[2, 3]); cs.append(c)
    zs, cs = np.array(zs), np.array(cs)
    cy = ndi.gaussian_filter1d(cs[:, 1], 6)
    return zs, cy


def plane_at(zs, cy, z, theta=None, delta=0.0):
    """Plane through the centre line at height z; tilted by theta (radians, forward about x) or along the local tangent."""
    y = float(np.interp(z, zs, cy))
    if theta is None:
        dy = float(np.interp(z + 1, zs, cy) - np.interp(z - 1, zs, cy)) / 2.0
        theta = float(np.arctan2(dy, 1.0))
    n = np.array([0.0, np.sin(theta), np.cos(theta)])  # rostral
    U = np.array([1.0, 0.0, 0.0])  # MNI +x (patient's right)
    Vd = np.cross(n, U); Vd /= np.linalg.norm(Vd)
    if Vd[1] > 0:  # dorsal = posterior (-y)
        Vd = -Vd
    return np.array([0.0, y, z]) + n * delta, n, U, Vd


def midline_extent_plate(plate):
    """Dorsal (top) and ventral (bottom) crossings of the plate outline with its midline."""
    ys = []
    mid = plate["mid"]
    for poly in parse_path(plate["outline"]):
        a, b = poly, np.roll(poly, -1, axis=0)
        cross = (a[:, 0] - mid) * (b[:, 0] - mid) <= 0
        for p, q in zip(a[cross], b[cross]):
            if abs(q[0] - p[0]) < 1e-9:
                continue
            t = (mid - p[0]) / (q[0] - p[0])
            ys.append(p[1] + t * (q[1] - p[1]))
    return (min(ys), max(ys)) if len(ys) >= 2 else None


BODY = ["MTg", "PnTg", "MoTg", "PnBa", "Py", "IO", "BSW", "CPd", "SN", "RN", "PAG", "Aq", "MLF", "ML", "mRt", "PnO", "SC", "ICo", "PTR", "DR", "MnR", "VTA", "CeC"]


def midline_extent_atlas(lab, xs, ds, KI):
    m = np.isin(lab, [KI[k] for k in BODY if k in KI]) & (np.abs(xs)[:, None] < 1.5)
    if not m.any():
        return None
    dd = ds[np.argwhere(m)[:, 1]]
    return dd.max(), dd.min()


def sample_plane(K, AFF, c, U, Vd, half=36.0, step=0.25):
    xs = np.arange(-half, half + step / 2, step)
    ds = np.arange(-half, half + step / 2, step)
    X, D = np.meshgrid(xs, ds, indexing="ij")
    P = c[None, None, :] + X[..., None] * U + D[..., None] * Vd
    vox = (P - AFF[:3, 3]) / VOX
    lab = ndi.map_coordinates(K, [vox[..., 0], vox[..., 1], vox[..., 2]], order=0, mode="constant")
    return xs, ds, lab


def fit_level(plate, lab, xs, ds, KI):
    """Least-squares x = -a (px - mid), d = c - b py on landmark centroids (per side) and the midline extremes of the
    section (ventral always; dorsal unless the plate bleeds into the cerebellum); 3 mm outliers dropped."""
    mid = plate["mid"]
    pairs = []
    for r in plate["regions"]:
        k = LANDMARK.get(r.get("slug"))
        if not k or k not in KI or not r.get("c"):
            continue
        m = lab == KI[k]
        if r.get("side") == "L":
            m = m & (xs[:, None] < 0)  # patient's left = MNI x < 0
        elif r.get("side") == "R":
            m = m & (xs[:, None] > 0)
        if m.sum() < 6:
            continue
        ij = np.argwhere(m)
        pairs.append((r["c"][0], r["c"][1], xs[ij[:, 0]].mean(), ds[ij[:, 1]].mean(), r.get("slug"), r.get("side")))
    pe, ae = midline_extent_plate(plate), midline_extent_atlas(lab, xs, ds, KI)
    if pe and ae:
        pairs.append((mid, pe[1], 0.0, ae[1], "ventral surface", "M"))
        # the dorsal midline is ambiguous over the fourth ventricle (the plate's outline runs over its roof, the atlas's
        # brainstem stops at its floor): used only where the section is closed dorsally (the midbrain's tectum)
        v4 = any(r.get("slug") == "fourth-ventricle" for r in plate["regions"])
        if not plate.get("bleed") and not v4:
            pairs.append((mid, pe[0], 0.0, ae[0], "dorsal surface", "M"))
    if len(pairs) < 4:
        return None, pairs
    P = np.array([p[:4] for p in pairs], float)
    keep = np.ones(len(P), bool)
    for _ in range(4):
        px, py, x, d = P[keep].T
        du = px - mid
        a = -(du @ x) / max(du @ du, 1e-9)
        Am = np.c_[-py, np.ones_like(py)]
        (b, c0), *_ = np.linalg.lstsq(Am, d, rcond=None)
        res = np.hypot(-a * (P[:, 0] - mid) - P[:, 2], c0 - b * P[:, 1] - P[:, 3])
        nk = res < 3.0
        if nk.sum() < 4 or (nk == keep).all():
            break
        keep = nk
    return dict(a=float(a), b=float(b), c=float(c0), mid=mid, rms=float(np.sqrt((res[keep] ** 2).mean())), n=int(keep.sum()), total=len(P), dropped=[pairs[i][4] for i in np.nonzero(~keep)[0]]), pairs


def sdf2d(polys, fit, xs, ds, radius=0.0):
    """Signed distance (mm, negative inside) of plate polygons (or stroked polylines) mapped into the plane grid."""
    from skimage.draw import polygon as fill_poly
    step = xs[1] - xs[0]
    mask = np.zeros((len(xs), len(ds)), bool)
    for poly in polys:
        x = -fit["a"] * (poly[:, 0] - fit["mid"])
        d = fit["c"] - fit["b"] * poly[:, 1]
        ix = (x - xs[0]) / step
        idd = (d - ds[0]) / step
        if radius > 0:
            # a stroked fibre: dense samples along the polyline, dilated to the radius
            t = np.linspace(0, 1, max(2, int(np.hypot(np.diff(ix), np.diff(idd)).sum() * 2)))
            si = np.interp(t, np.linspace(0, 1, len(ix)), ix)
            sd = np.interp(t, np.linspace(0, 1, len(idd)), idd)
            ok = (si >= 0) & (si < len(xs)) & (sd >= 0) & (sd < len(ds))
            mask[si[ok].astype(int), sd[ok].astype(int)] = True
        else:
            rr, cc = fill_poly(ix, idd, shape=mask.shape)
            mask[rr, cc] = True
    if radius > 0:
        mask = ndi.distance_transform_edt(~mask) * step <= radius
    if not mask.any():
        return None
    return (ndi.distance_transform_edt(~mask) - ndi.distance_transform_edt(mask)) * step


# nuclei are drawn inside the tegmentum on the plates: a section that the fit leaves partly in the ventricle or past the
# surface is moved (in its plane, at most SNAP mm) to where it lies in its host tissue. The thin surface tracts (the
# anterolateral system, the dorsal spinocerebellar tract, the brachium of the inferior colliculus) are moved too: drawn a
# millimetre past the atlas's surface they would otherwise vanish, since the outside surface never changes.
SNAP = {k: 2.0 for k in ("III", "EW", "IV", "Vmo", "Vps", "VI", "VII", "PPRF", "VCx", "Sp5", "Sol", "DMX", "XII", "Amb", "Gr", "Cu")}
SNAP.update({"ALS": 2.5, "DSCT": 2.5, "BIC": 2.5, "Vps": 3.0, "FCol": 3.5, "VI": 3.5})
# the thinnest a nucleus is drawn (its largest inscribed radius in a section, mm): smaller drawings are grown to it, so a
# nucleus is never a speck (the abducens nucleus is about 2 mm across)
MIN_R = {k: 0.65 for k in SNAP if k not in ("ALS", "DSCT", "BIC", "FCol")}
MIN_R["VI"] = 0.9


def snap(sd, pl, host_ids, max_mm=2.0):
    """Move a section's shape into its host tissue. The two halves move as mirror images (the left one by (di, dj), the
    right one by (-di, dj)), so a pair stays symmetric about the midline."""
    host = np.isin(pl["lab"], host_ids)
    inside = sd < 0
    n_in = inside.sum()
    if not n_in:
        return sd, 0.0
    step = pl["xs"][1] - pl["xs"][0]
    nx = sd.shape[0]
    c0 = (nx - 1) / 2.0  # the midline column (the grid is symmetric about x = 0)
    ij = np.argwhere(inside)
    sgn = np.where(ij[:, 0] > c0, -1, 1)

    def out_of(di, dj):
        ii, jj = ij[:, 0] + sgn * di, ij[:, 1] + dj
        ok = (ii >= 0) & (ii < host.shape[0]) & (jj >= 0) & (jj < host.shape[1])
        return 1.0 - host[ii[ok], jj[ok]].sum() / n_in

    best = (out_of(0, 0), 0, 0)
    if best[0] < 0.05:
        return sd, 0.0
    R = int(np.ceil(max_mm / step))
    for di in range(-R, R + 1):
        for dj in range(-R, R + 1):
            dist = np.hypot(di, dj) * step
            if dist > max_mm:
                continue
            out = out_of(di, dj)
            if out + 0.02 * dist < best[0] + 0.02 * np.hypot(best[1], best[2]) * step:
                best = (out, di, dj)
    _, di, dj = best
    if di == 0 and dj == 0:
        return sd, 0.0
    right = (np.arange(nx) > c0)[:, None]
    lh = np.where(right, 50.0, sd)
    rh = np.where(right, sd, 50.0)
    moved = np.minimum(ndi.shift(lh, (di, dj), order=0, mode="constant", cval=50.0),
                       ndi.shift(rh, (-di, dj), order=0, mode="constant", cval=50.0))
    return moved, float(np.hypot(di, dj) * step)


def fit_planes(K, KI, AFF, log=print):
    """The section plane of every plate level in the atlas, rostral first."""
    zs, cy = centreline(K, KI, AFF)
    lv = [L for L in LEVELS if L.get("mniZ") is not None and os.path.exists(os.path.join(PLATES, L["slug"] + ".json"))]
    lv = sorted(lv, key=lambda L: -L["mniZ"])  # rostral first
    planes = []
    for L in lv:
        if L["mniZ"] < zs.min() + 2:
            log(f"  {L['slug']}: below the atlas (z {L['mniZ']}), skipped")
            continue
        plate = json.load(open(os.path.join(PLATES, L["slug"] + ".json"), encoding="utf8"))
        # the landmarks a section at this level can show at all: those found by the planes through the level's nominal
        # height (any tilt). The HCP lemniscus and MLF stop short of the closed medulla, and a landmark the atlas lacks
        # here must not pull the plane to a level where it has one.
        seen = set()
        for th in np.radians(np.arange(0, 46, 5)):
            c, n, U, Vd = plane_at(zs, cy, L["mniZ"], th, 0.0)
            xs, ds, lab = sample_plane(K, AFF, c, U, Vd)
            _, pairs = fit_level(plate, lab, xs, ds, KI)
            seen |= {(p[4], p[5]) for p in pairs}
        possible = len(seen)
        # the plane that best fits the plate: tilt 0-45 degrees forward and +/- 8 mm along the axis, scored by the landmark
        # fit (rms, plus 2 mm for every landmark it misses or drops, plus the drawing's squash, plus 0.25 mm per mm away
        # from the level's nominal height), and caudal of the level above (sections never cross)
        best = None
        for th in np.radians(np.arange(0, 46, 5)):
            for dl in np.arange(-8.0, 8.1, 2.0):
                c, n, U, Vd = plane_at(zs, cy, L["mniZ"], th, dl)
                if planes and c[2] > planes[-1]["c"][2] - 3.0:
                    continue
                xs, ds, lab = sample_plane(K, AFF, c, U, Vd)
                fit, pairs = fit_level(plate, lab, xs, ds, KI)
                if not fit:
                    continue
                # every landmark the plate draws should be found and fit; the drawing's scale should be about the same
                # across and down (a squashed fit is a wrong plane)
                score = fit["rms"] + 2.0 * max(0, possible - fit["n"]) + 4.0 * abs(np.log(abs(fit["a"]) / max(fit["b"], 1e-6))) + 0.25 * abs(dl)
                if best is None or score < best[0]:
                    best = (score, c, n, U, Vd, xs, ds, fit)
        if not best:
            log(f"  {L['slug']}: too few landmarks, skipped")
            continue
        _, c, n, U, Vd, xs, ds, fit = best
        log(f"  {L['slug']:18s} z {L['mniZ']:6.1f} -> {c[2]:6.1f}  tilt {np.degrees(np.arccos(n[2])):4.1f} deg  landmarks {fit['n']}/{fit['total']}  rms {fit['rms']:.2f} mm  scale {abs(fit['a']):.4f}/{fit['b']:.4f} mm per unit" + (f"  dropped {fit['dropped']}" if fit["dropped"] else ""))
        _, _, lab = sample_plane(K, AFF, c, U, Vd)
        planes.append(dict(slug=L["slug"], c=c, n=n, U=U, V=Vd, xs=xs, ds=ds, fit=fit, plate=plate, lab=lab))
    return planes


def carve(K, KI, AFF, log=print):
    planes = fit_planes(K, KI, AFF, log)
    # brainstem box (voxels) to evaluate
    bs = np.isin(K, [KI[k] for k in TEG + ["PnBa", "Py", "PAG", "ICP", "SCP", "ICo", "MGN", "SN", "RN", "CPd"] if k in KI])
    lo = np.argwhere(bs).min(0) - 12
    hi = np.argwhere(bs).max(0) + 12
    lo = np.maximum(lo, 0); hi = np.minimum(hi, K.shape)
    sub = K[lo[0]:hi[0], lo[1]:hi[1], lo[2]:hi[2]]
    gi = np.indices(sub.shape).reshape(3, -1).T
    P = (gi + lo) * VOX + AFF[:3, 3]
    report = {}
    for key in ORDER:
        if key not in KI:
            continue
        slugs, kind, hosts, (ext_r, ext_c), rad = IMPORT[key]
        secs = []
        for i, pl in enumerate(planes):
            items = [r for r in pl["plate"][kind] if r.get("slug") in slugs]
            if not items:
                continue
            polys = [p for r in items for p in parse_path(r["d"])]
            sd = sdf2d(polys, pl["fit"], pl["xs"], pl["ds"], radius=rad)
            if sd is None:
                continue
            # both sides alike: the template is symmetric, while the plates often draw a structure on one side only, or the
            # two sides a little differently (real sections). Where a drawing and the mirror image of the other side's
            # overlap, the section is their mean shape; where they do not (one side drawn), the union of the two.
            sdm = sd[::-1, :]  # the plane grid is symmetric about the midline
            sd = 0.5 * (sd + sdm) if ((sd < 0) & (sdm < 0)).any() else np.minimum(sd, sdm)
            if not (sd < 0).any():
                continue
            if key in MIN_R and -sd.min() < MIN_R[key]:
                sd = sd - (MIN_R[key] + sd.min())
            if key in SNAP:
                sd, shift = snap(sd, pl, [KI[h] for h in hosts if h in KI], SNAP[key])
                if shift > 0.01:
                    log(f"      {key} on {pl['slug']}: moved {shift:.1f} mm into its host tissue")
            secs.append((i, sd))
        if not secs:
            log(f"  {key}: on no plate in the atlas range")
            continue
        val = np.full(len(P), np.inf, np.float32)

        def sample(pl, sd, Q):
            rel = Q - pl["c"]
            step = pl["xs"][1] - pl["xs"][0]
            ix = (rel @ pl["U"] - pl["xs"][0]) / step
            idd = (rel @ pl["V"] - pl["ds"][0]) / step
            return ndi.map_coordinates(sd, [ix, idd], order=1, mode="constant", cval=50.0)

        def centres(pl, sd):
            """The section's centre on each side (MNI mm); a midline structure has one centre for both."""
            ij = np.argwhere(sd < 0)
            x, d = pl["xs"][ij[:, 0]], pl["ds"][ij[:, 1]]
            out = {}
            for side, m in (("L", x < 0), ("R", x >= 0)):
                if key in MIDLINE:
                    m = np.ones(len(x), bool)
                if m.any():
                    out[side] = pl["c"] + x[m].mean() * pl["U"] + d[m].mean() * pl["V"]
            return out

        sv = [(i, sd, (P - planes[i]["c"]) @ planes[i]["n"]) for i, sd in secs]
        # between consecutive sections: the two shapes are laid on each other (centre on centre, per side) and blended by
        # the position between the planes, so a nucleus that lies a little elsewhere at the next level is swept from one
        # place to the other instead of thinning out in between
        for (i, sd0, s0), (j, sd1, s1) in zip(sv[:-1], sv[1:]):
            between = (s0 <= 0) & (s1 >= 0)
            if not between.any():
                continue
            Q = P[between]
            a0, a1 = s0[between], s1[between]
            t = np.clip(a0 / np.where(np.abs(a0 - a1) < 1e-9, -1e-9, a0 - a1), 0, 1)
            c0, c1 = centres(planes[i], sd0), centres(planes[j], sd1)
            D = np.zeros_like(Q)
            lq = Q[:, 0] < 0
            for side, m in (("L", lq), ("R", ~lq)):
                if side in c0 and side in c1:
                    D[m] = c1[side] - c0[side]
            blend = (1 - t) * sample(planes[i], sd0, Q - t[:, None] * D) + t * sample(planes[j], sd1, Q + (1 - t)[:, None] * D)
            val[between] = np.minimum(val[between], blend)
        # beyond the first (rostral) and last (caudal) sections: taper out
        for (i, sd, s), ext, sgn in ((sv[0], ext_r, 1), (sv[-1], ext_c, -1)):
            if ext <= 0:
                continue
            past = (sgn * s >= 0) & (sgn * s <= ext)
            r_in = float(-np.min(sd))
            taper = r_in * (1 - np.sqrt(np.clip(1 - (sgn * s[past] / ext) ** 2, 0, 1)))
            val[past] = np.minimum(val[past], sample(planes[i], sd, P[past]) + taper)
        inside = (val < 0).reshape(sub.shape)
        if hosts == ["__outside__"]:
            host = sub == 0
        else:
            host = np.isin(sub, [KI[h] for h in hosts if h in KI])
        take = inside & host
        if DIAG:
            u, cnt = np.unique(sub[inside], return_counts=True)
            inv = {v: k for k, v in KI.items()}
            top = sorted(zip(cnt, u), reverse=True)[:5]
            log(f"      {key} under its shape: " + ", ".join(f"{inv.get(int(uu), 'outside')} {100 * cc / max(1, inside.sum()):.0f}%" for cc, uu in top))
        sub[take] = KI[key]
        report[key] = dict(voxels=int(take.sum()), mm3=round(float(take.sum()) * VOX ** 3, 1), plates=[planes[i]["slug"] for i, _ in secs],
                           lost_to_hosts=round(float((inside & ~host).sum()) / max(1, inside.sum()), 3))
        log(f"  {key:5s} {report[key]['mm3']:7.1f} mm3 from {report[key]['plates']}  ({100 * report[key]['lost_to_hosts']:.0f}% of its shape fell outside its hosts)")
    return report
