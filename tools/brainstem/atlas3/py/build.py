# Step 3: the plate. Symmetric illustration geometry (the photo's right half, mirrored), the course overlay regions on
# both halves, authored extras, myelin-density bands, and the cleaned, graded density photo.
#   python build.py [level ...]   -> levels/<level>/plate.json, levels/<level>/density.webp, view/plate_<level>.jpg
import json, math, os, sys
import cv2
import numpy as np
from levels_cfg import LEVELS
from prep import BASE
from geom import SS, mask_paths, curve, raster, mirror_pts, anchor, centroid
try:
    from extras import EXTRAS
except ImportError:
    EXTRAS = {}

W = 1000
MID = W / 2

GREY = set("""red-nucleus substantia-nigra oculomotor-nucleus edinger-westphal-nucleus superior-colliculus inferior-colliculus
periaqueductal-gray trochlear-nucleus motor-trigeminal-nucleus principal-sensory-nucleus-of-trigeminal pontine-nuclei
vestibulocochlear-complex abducens-nucleus facial-nucleus solitary-nucleus dorsal-motor-nucleus-of-the-vagus hypoglossal-nucleus
inferior-olivary-nucleus gracile-nucleus cuneate-nucleus spinal-trigeminal-nucleus medial-geniculate-nucleus nucleus-ambiguus
locus-coeruleus pineal-gland pulvinar interpeduncular-nucleus""".split())
SPACE = {"cerebral-aqueduct", "fourth-ventricle", "interpeduncular-fossa"}
LANDMARK = {"facial-colliculus"}
NERVE_FIBRES = {"oculomotor-nerve", "trochlear-nerve", "trigeminal-nerve", "abducens-nerve", "facial-nerve", "vestibulocochlear-nerve",
                "glossopharyngeal-nerve", "vagus-nerve", "hypoglossal-nerve", "accessory-nerve"}


def tissue_of(slug):
    if slug in SPACE:
        return "space"
    if slug in GREY:
        return "grey"
    if slug in LANDMARK:
        return "landmark"
    if slug in NERVE_FIBRES:
        return "nerve"
    return "white"


def build(level):
    cfg = LEVELS[level]
    cj = json.load(open(f"{BASE}/levels/{level}/canon.json"))
    H = cj["H"]
    img = cv2.imread(f"{BASE}/levels/{level}/canon.png")
    tissue = (cv2.imread(f"{BASE}/levels/{level}/cmask.png", 0) > 0).astype(np.uint8)
    h2, w2 = tissue.shape
    mid = w2 // 2
    # symmetric tissue: the right half mirrored
    sym = tissue.copy()
    sym[:, : w2 - mid] = tissue[:, mid:][:, ::-1][:, : w2 - mid] if w2 - mid <= mid else sym[:, : w2 - mid]
    right = np.zeros_like(tissue)
    right[:, mid:] = 1
    hull = np.zeros_like(tissue)
    cnts, _ = cv2.findContours(sym, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.fillPoly(hull, [cv2.convexHull(np.vstack(cnts))], 1)

    def mirror(m):
        out = np.zeros_like(m)
        out[:, : w2 - mid] = m[:, mid:][:, ::-1][:, : w2 - mid]
        out[:, mid:] |= m[:, mid:]
        return out

    regions, fibres, report = [], [], []
    shapes = cj["shapes"]
    ex = EXTRAS.get(level, {})

    def emit(slug, mR, tissue_kind, src, approx=False, note=None, photoL=None, mid_struct=False):
        """mR: the structure on the plate's right half (canvas px). Emits the right, left (mirror) or midline instance."""
        if mR.sum() < 4:
            report.append(f"  EMPTY {slug}")
            return
        if mid_struct:
            m = mirror(mR)
            a, clr = anchor(m * right)
            regions.append({"id": f"{slug}-M", "slug": slug, "slugs": [slug], "side": "M", "tissue": tissue_kind, "d": mask_paths(m), "c": centroid(m), "a": a, "src": src, **({"approx": True} if approx else {}), **({"note": note} if note else {})})
            return
        mL = np.zeros_like(mR)
        mL[:, : w2 - mid] = mR[:, mid:][:, ::-1][:, : w2 - mid]
        aR, _ = anchor(mR)
        aL = [round(W - aR[0], 1), aR[1]]
        base = {"slug": slug, "slugs": [slug], "tissue": tissue_kind, "src": src, **({"approx": True} if approx else {}), **({"note": note} if note else {})}
        regions.append({"id": f"{slug}-R", "side": "R", "d": mask_paths(mR), "c": centroid(mR), "a": aR, **base})
        rl = {"id": f"{slug}-L", "side": "L", "d": mask_paths(mL), "c": centroid(mL), "a": aL, **base}
        if photoL is not None and photoL.sum() > 4:
            rl["dPhoto"] = mask_paths(photoL)
        regions.append(rl)

    def clip(m, kind):
        if kind == "space":
            out = m & (1 - sym) & hull
            return out if out.sum() > 0.25 * m.sum() else m
        return m & sym

    # course overlay areas
    for slug, lst in shapes["area"].items():
        if slug in ex.get("_skip", []):
            continue
        kind = ex.get(slug, {}).get("tissue") or tissue_of(slug)
        R = [s["pts"] for s in lst if s["side"] == "R"]
        L = [s["pts"] for s in lst if s["side"] == "L"]
        M = [s["pts"] for s in lst if s["side"] == "M"]
        spans = any(min(p[0] for p in s["pts"]) < MID - 6 and max(p[0] for p in s["pts"]) > MID + 6 for s in lst)
        if len(lst) == 1 and (M or spans):
            m = raster([lst[0]["pts"]], tissue.shape) * right
            emit(slug, clip(mirror(m), kind) * right, kind, ["course overlay"], mid_struct=True)
            report.append(f"  {slug}: midline")
            continue
        if R:
            mR = clip(raster(R, tissue.shape), kind) * right
            mPL = clip(raster(L, tissue.shape), kind) * (1 - right) if L else None
            # the photo's own left geometry: the professor's left outline against the photo's real (asymmetric) tissue
            if L:
                mPL = raster(L, tissue.shape) * (1 - right)
                mPL = (mPL & tissue) if kind != "space" else mPL
            emit(slug, mR, kind, ["course overlay"], photoL=mPL)
            report.append(f"  {slug}: right" + (" + photo left" if L else ""))
        elif L:
            mR = clip(raster([mirror_pts(p) for p in L], tissue.shape), kind) * right
            mPL = raster(L, tissue.shape) * (1 - right)
            mPL = (mPL & tissue) if kind != "space" else mPL
            emit(slug, mR, kind, ["course overlay (left, mirrored)"], photoL=mPL)
            report.append(f"  {slug}: left mirrored")

    # authored extras (right-side polygons or ellipses in plate units)
    for slug, e in ex.items():
        if slug.startswith("_"):
            continue
        if "pts" not in e and "ellipse" not in e:
            continue
        if "ellipse" in e:
            cx, cy, rx, ry, rot = e["ellipse"]
            t = np.linspace(0, 2 * math.pi, 72, endpoint=False)
            c, s_ = math.cos(math.radians(rot)), math.sin(math.radians(rot))
            pts = [[cx + rx * math.cos(a) * c - ry * math.sin(a) * s_, cy + rx * math.cos(a) * s_ + ry * math.sin(a) * c] for a in t]
        else:
            pts = e["pts"]
        kind = e.get("tissue") or tissue_of(slug)
        m = raster([pts], tissue.shape)
        if e.get("midline"):
            emit(slug, clip(mirror(m * right), kind) * right, kind, e.get("src", []), e.get("approx", True), e.get("note"), mid_struct=True)
        else:
            emit(slug, clip(m, kind) * right, kind, e.get("src", []), e.get("approx", True), e.get("note"))
        report.append(f"  {slug}: authored" + (" (approx)" if e.get("approx", True) else ""))

    # fibre courses (open paths)
    for slug, lst in shapes["fibres"].items():
        R = [s for s in lst if s["side"] in ("R", "M")]
        use = R if R else [{"pts": mirror_pts(s["pts"]), "closed": s["closed"]} for s in lst]
        kind = "nerve" if slug in NERVE_FIBRES else "fibres"
        for k, s in enumerate(use):
            d = curve(s["pts"], s.get("closed", False), step=2.0, sigma=1.0, eps=0.25)
            dl = curve(mirror_pts(s["pts"]), s.get("closed", False), step=2.0, sigma=1.0, eps=0.25)
            fibres.append({"id": f"{slug}-R{k}", "slug": slug, "side": "R", "tissue": kind, "d": d})
            fibres.append({"id": f"{slug}-L{k}", "slug": slug, "side": "L", "tissue": kind, "d": dl})
        report.append(f"  {slug}: {len(use)} fibre paths" + ("" if R else " (left, mirrored)"))

    # myelin density of the photo, used for the illustration's tonal bands (right half mirrored) and the photo itself
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    bg = cj["bg"]
    inside = g[tissue > 0]
    dark = np.percentile(inside, 1.5)
    dens = np.clip((bg - g) / max(20.0, bg - dark), 0, 1)
    dens_sym = dens.copy()
    dens_sym[:, : w2 - mid] = dens[:, mid:][:, ::-1][:, : w2 - mid]
    blur = cv2.GaussianBlur(dens_sym, (0, 0), 4.0 * SS) * sym
    bands = []
    for t in cfg.get("bands", (0.42, 0.66)):
        bm = (blur > t).astype(np.uint8) & sym
        bm = cv2.morphologyEx(bm, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
        bands.append(mask_paths(bm, step=3.0, sigma=1.4, eps=0.55, min_area=140))
    # the photo: density as luminance (white = myelin), outside the tissue black, edge feathered by ~1 px
    feather = cv2.GaussianBlur(tissue.astype(np.float32), (0, 0), 0.8)
    gamma = cfg.get("gamma", 0.92)
    photo = (np.power(dens, gamma) * feather * 255).clip(0, 255).astype(np.uint8)
    cv2.imwrite(f"{BASE}/levels/{level}/density.png", photo)
    cv2.imwrite(f"{BASE}/levels/{level}/density.webp", photo, [cv2.IMWRITE_WEBP_QUALITY, 88])

    plate = {
        "level": level,
        "viewBox": [0, 0, W, H],
        "mid": MID,
        "bleed": cj["bleed"],
        "outline": mask_paths(sym, step=2.0, sigma=1.5, eps=0.35, min_area=20),
        "bands": bands,
        "regions": sorted(regions, key=lambda r: -abs(cv2.contourArea(np.zeros((1, 1, 2), np.float32)))),
        "fibres": fibres,
        "photo": {"w": w2, "h": h2},
    }
    # big regions first so small ones sit on top (hover)
    areas = {}
    for r in regions:
        ys = [float(v) for v in r["d"].replace("M", " ").replace("C", " ").replace("Z", " ").split()[1::2]] if r["d"] else [0]
        areas[r["id"]] = (max(ys) - min(ys)) if ys else 0
    plate["regions"] = sorted(regions, key=lambda r: -areas[r["id"]])
    json.dump(plate, open(f"{BASE}/levels/{level}/plate.json", "w"))
    print(level, "regions", len(regions), "fibres", len(fibres), "bytes", len(json.dumps(plate)), "outline", len(plate["outline"]), "bands", sum(len(b) for b in bands), "regions", sum(len(r["d"]) + len(r.get("dPhoto", "")) for r in regions), "fibres", sum(len(f["d"]) for f in fibres))
    print("\n".join(report))
    return plate


if __name__ == "__main__":
    for lv in (sys.argv[1:] or LEVELS.keys()):
        build(lv)
