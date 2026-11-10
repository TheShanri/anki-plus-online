# Step 1: tissue mask + midline of each overlay photo. Writes levels/<level>/prep.json and a debug image.
#   python prep.py [level ...]
import json, math, sys, os
import cv2
import numpy as np
from levels_cfg import LEVELS

from paths import BASE, REPO  # noqa: E402,F401


def load_photo(slide):
    d = json.load(open(f"{BASE}/shapes/ovp{slide}.json"))
    img = cv2.imread(f"{BASE}/pptx/overlay/ppt/media/{d['photo']}", cv2.IMREAD_COLOR)
    return d, img


def tissue_mask(img):
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    h, w = g.shape
    border = np.concatenate([g[:8].ravel(), g[-8:].ravel(), g[:, :8].ravel(), g[:, -8:].ravel()])
    bg = np.percentile(border, 70)
    dark = np.clip(bg - cv2.GaussianBlur(g, (0, 0), 2.0), 0, 255)
    m = (dark > 14).astype(np.uint8)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, k)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    if n <= 1:
        return m, bg
    big = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    keep = np.zeros_like(m)
    for k_ in range(1, n):
        if k_ == big or st[k_, cv2.CC_STAT_AREA] > 0.02 * st[big, cv2.CC_STAT_AREA]:
            keep[lab == k_] = 1
    # fill holes that are not real background (keep the aqueduct-like true holes: bright as the background)
    inv = (1 - keep).astype(np.uint8)
    n2, lab2, st2, _ = cv2.connectedComponentsWithStats(inv, 4)
    for k_ in range(1, n2):
        x, y, ww, hh, a = st2[k_]
        if x == 0 or y == 0 or x + ww >= w or y + hh >= h:
            continue
        mean_dark = dark[lab2 == k_].mean()
        if a < 0.0004 * h * w or mean_dark > 7:
            keep[lab2 == k_] = 1
    return keep, bg


def poly_centroid(pts):
    p = np.array(pts, np.float64)
    return p.mean(0)


def reflect(p, th, x0, yc):
    """reflect points about the line through (x0, yc) with direction (sin th, cos th) (th = tilt from vertical)"""
    p = np.asarray(p, np.float64)
    d = np.array([math.sin(th), math.cos(th)])
    q = p - np.array([x0, yc])
    proj = (q @ d)[:, None] * d
    return np.array([x0, yc]) + 2 * proj - q


def midline(cfg, shapes, mask):
    by = {s["i"]: s for s in shapes}
    pairs, singles = [], []
    for slug, ids in cfg["area"].items():
        cs = [poly_centroid(by[i]["polys"][0]["pts"]) for i in ids if i in by]
        if len(cs) == 2:
            pairs.append((cs[0], cs[1]))
    h, w = mask.shape
    yc = h / 2
    ys, xs = np.nonzero(mask[::4, ::4])
    mp = np.stack([xs * 4, ys * 4], 1).astype(np.float64)
    best = None
    for th_deg in np.arange(-12, 12.01, 0.5):
        th = math.radians(th_deg)
        for x0 in np.arange(w * 0.3, w * 0.7, 3):
            c = 0.0
            for a, b in pairs:
                c += np.sum((reflect([a], th, x0, yc)[0] - b) ** 2)
            c = c / max(1, len(pairs))
            if best is None or c < best[0]:
                best = (c, th, x0)
    # refine with the mask's mirror overlap as a secondary term
    c0, th, x0 = best
    def score(th, x0):
        r = reflect(mp, th, x0, yc).round().astype(int)
        ok = (r[:, 0] >= 0) & (r[:, 0] < w) & (r[:, 1] >= 0) & (r[:, 1] < h)
        inside = np.zeros(len(r), bool)
        inside[ok] = mask[r[ok, 1], r[ok, 0]] > 0
        pc = sum(np.sum((reflect([a], th, x0, yc)[0] - b) ** 2) for a, b in pairs) / max(1, len(pairs))
        return inside.mean(), pc
    return th, x0, yc, score(th, x0), len(pairs)


def run(level):
    cfg = LEVELS[level]
    d, img = load_photo(cfg["slide"])
    mask, bg = tissue_mask(img)
    th, x0, yc, sc, npairs = midline(cfg, d["shapes"], mask)
    out = f"{BASE}/levels/{level}"
    os.makedirs(out, exist_ok=True)
    cv2.imwrite(f"{out}/mask.png", mask * 255)
    prev = json.load(open(f"{out}/prep.json")) if os.path.exists(f"{out}/prep.json") else {}
    keep = {k: v for k, v in prev.items() if k.endswith("_img")}  # the hand-checked midline (mirror correlation), kept
    json.dump({**keep, "level": level, "photo": d["photo"], "w": d["w"], "h": d["h"], "bg": float(bg), "tilt_deg": math.degrees(th), "x0": x0, "yc": yc, "mirror_overlap": sc[0], "pair_err_px": math.sqrt(sc[1]), "pairs": npairs}, open(f"{out}/prep.json", "w"), indent=1)
    vis = img.copy()
    cnts, _ = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    cv2.drawContours(vis, cnts, -1, (0, 0, 255), 3)
    dvec = np.array([math.sin(th), math.cos(th)])
    p1 = np.array([x0, yc]) - dvec * 2000
    p2 = np.array([x0, yc]) + dvec * 2000
    cv2.line(vis, tuple(p1.astype(int)), tuple(p2.astype(int)), (255, 0, 0), 3)
    s = 900 / max(vis.shape[:2])
    cv2.imwrite(f"{BASE}/view/prep_{level}.jpg", cv2.resize(vis, None, fx=s, fy=s, interpolation=cv2.INTER_AREA))
    print(level, "tilt %.1f x0 %.0f overlap %.3f pairErr %.1fpx pairs %d" % (math.degrees(th), x0, sc[0], math.sqrt(sc[1]), npairs))


if __name__ == "__main__":
  for lv in (sys.argv[1:] or LEVELS.keys()):
    run(lv)
