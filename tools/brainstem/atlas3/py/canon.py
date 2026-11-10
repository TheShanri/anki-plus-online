# Step 2: put each section photo in the canonical plate frame (midline vertical at x = 500, 1000 units wide, dorsal up)
# and carry the overlay outlines along. Writes levels/<level>/canon.json, canon.png (colour), mask.png (canonical, SS x).
#   python canon.py [level ...]
import json, math, os, sys
import cv2
import numpy as np
from levels_cfg import LEVELS
from prep import load_photo, tissue_mask, BASE

PW = 1000          # plate width in units
SS = 1.6           # photo pixels per plate unit
PAD = 36           # margin in plate units


def tissue_mask2(img):
    """darkness OR texture, then close and fill holes that are not true (bright, flat) holes"""
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    h, w = g.shape
    hist = np.bincount(g.astype(np.uint8).ravel(), minlength=256)
    hist[:200] = 0
    hist[254:] = 0  # pure white padding is not the slide's paper
    bg = float(np.argmax(np.convolve(hist, np.ones(3), "same")))  # the paper's own tone (its histogram peak)
    gb = cv2.GaussianBlur(g, (0, 0), 1.5)
    dark = np.clip(bg - gb, 0, 255)
    mu = cv2.blur(g, (9, 9))
    sd = np.sqrt(np.clip(cv2.blur(g * g, (9, 9)) - mu * mu, 0, None))
    m = ((dark > 9) | (sd > 7)).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11)))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    big = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    keep = (lab == big).astype(np.uint8)
    inv = (1 - keep).astype(np.uint8)
    inv[:5] = 1; inv[-5:] = 1; inv[:, :5] = 1; inv[:, -5:] = 1  # background reaching the frame (through a scan edge) is outside
    n2, lab2, st2, _ = cv2.connectedComponentsWithStats(inv, 4)
    for k in range(1, n2):
        x, y, ww, hh, a = st2[k]
        if x == 0 or y == 0 or x + ww >= w or y + hh >= h:
            continue
        keep[lab2 == k] = 1  # every interior hole is tissue here; ventricles and the aqueduct come from the overlays
    return keep, bg


def canon(level):
    cfg = LEVELS[level]
    d, img = load_photo(cfg["slide"])
    pj = json.load(open(f"{BASE}/levels/{level}/prep.json"))
    tilt = math.radians(cfg.get("tilt", pj.get("tilt_img", pj["tilt_deg"])))
    x0 = cfg.get("x0", pj.get("x0_img", pj["x0"]))
    yc = pj["yc"]
    h, w = img.shape[:2]
    # rotation about (x0, yc) taking the axis direction (sin t, cos t) to (0, 1)
    R = np.array([[math.cos(tilt), -math.sin(tilt)], [math.sin(tilt), math.cos(tilt)]])
    if cfg.get("flip"):
        R = np.array([[-1, 0], [0, 1]]) @ R
    c = np.array([x0, yc])
    A1 = np.hstack([R, (c - R @ c)[:, None]])  # photo -> rotated photo (midline at x = x0)
    rot = cv2.warpAffine(img, A1, (w, h), flags=cv2.INTER_CUBIC, borderValue=(255, 255, 255))
    mask, bg = tissue_mask2(img)
    rmask = cv2.warpAffine(mask, A1, (w, h), flags=cv2.INTER_NEAREST, borderValue=0)
    # the photo's own frame after rotation (tissue cut by the frame edge is a "bleed")
    frame = cv2.warpAffine(np.ones((h, w), np.uint8), A1, (w, h), flags=cv2.INTER_NEAREST, borderValue=0)
    ys, xs = np.nonzero(rmask)
    top, bot = ys.min(), ys.max()
    ext = xs.max() - x0  # the right half is the plate's photo half; the left may be clipped by the frame in photo-only view
    bleed = cfg.get("bleed", False)
    if bleed:
        # the frame cuts the section: the plate edge is the cut, symmetric about the midline
        fx = np.nonzero(frame[int((top + bot) / 2)])[0]
        ext = min(ext, x0 - fx.min() - 3, fx.max() - x0 - 3)
    k = (PW / 2 - (0 if bleed else PAD)) / ext
    padv = PAD
    H = int(round((bot - top) * k + 2 * padv))
    A2 = np.array([[k, 0, PW / 2 - x0 * k], [0, k, padv - top * k]])  # rotated photo -> plate units
    M = np.vstack([A2, [0, 0, 1]]) @ np.vstack([A1, [0, 0, 1]])  # photo -> plate units
    Ms = np.diag([SS, SS, 1]) @ M
    W2, H2 = int(round(PW * SS)), int(round(H * SS))
    cimg = cv2.warpAffine(img, Ms[:2], (W2, H2), flags=cv2.INTER_CUBIC, borderValue=(255, 255, 255))
    cmask = cv2.warpAffine(mask, Ms[:2], (W2, H2), flags=cv2.INTER_NEAREST, borderValue=0)
    if cfg.get("clip"):
        cm = np.zeros_like(cmask)
        cv2.fillPoly(cm, [(np.array(cfg["clip"]) * SS).astype(np.int32)], 1)
        cmask = cmask & cm
    for poly in cfg.get("erase", []):
        cv2.fillPoly(cmask, [(np.array(poly) * SS).astype(np.int32)], 0)
    for poly in cfg.get("keep", []):
        cv2.fillPoly(cmask, [(np.array(poly) * SS).astype(np.int32)], 1)
    if cfg.get("mirror_left_above"):
        Y = int(cfg["mirror_left_above"] * SS)
        mid = W2 // 2
        left = cmask[:Y, :mid]
        cmask[:Y, W2 - left.shape[1]:] |= left[:, ::-1]
    # smooth the outline: open/close at ~2 plate units, keep the largest piece
    r = int(2.5 * SS) | 1
    se = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    cmask = cv2.morphologyEx(cv2.morphologyEx(cmask, cv2.MORPH_OPEN, se), cv2.MORPH_CLOSE, se)
    inv_ = (1 - cmask).astype(np.uint8)
    n_, lab_, st_, _ = cv2.connectedComponentsWithStats(inv_, 4)
    for k_ in range(1, n_):
        x_, y_, w_, h_, a_ = st_[k_]
        if x_ > 0 and y_ > 0 and x_ + w_ < W2 and y_ + h_ < H2:
            cmask[lab_ == k_] = 1  # interior holes: tissue (spaces come from the overlays)
    n_, lab_, st_, _ = cv2.connectedComponentsWithStats(cmask, 8)
    if n_ > 2:
        cmask = (lab_ == 1 + int(np.argmax(st_[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)
    out = f"{BASE}/levels/{level}"
    cv2.imwrite(f"{out}/canon.png", cimg)
    cv2.imwrite(f"{out}/cmask.png", cmask * 255)

    def tf(pts):
        p = np.asarray(pts, np.float64)
        q = p @ M[:2, :2].T + M[:2, 2]
        return [[round(float(x), 2), round(float(y), 2)] for x, y in q]

    by = {s["i"]: s for s in d["shapes"]}
    shapes = {"area": {}, "fibres": {}}
    for kind in ("area", "fibres"):
        for slug, ids in cfg.get(kind, {}).items():
            lst = []
            for i in ids:
                s = by[i]
                for p in s["polys"]:
                    q = tf(p["pts"])
                    cx = np.mean([a[0] for a in q])
                    lst.append({"i": i, "pts": q, "closed": p["closed"], "side": "R" if cx > PW / 2 + 4 else ("L" if cx < PW / 2 - 4 else "M")})
            shapes[kind][slug] = lst
    json.dump({"level": level, "W": PW, "H": H, "SS": SS, "k": k, "M": M.tolist(), "bg": bg, "bleed": bleed, "shapes": shapes}, open(f"{out}/canon.json", "w"))
    # debug: canonical photo with the overlay outlines and the midline
    vis = cimg.copy()
    for kind in shapes.values():
        for slug, lst in kind.items():
            for s in lst:
                pts = (np.array(s["pts"]) * SS).astype(np.int32)
                cv2.polylines(vis, [pts], s["closed"], (0, 0, 255) if s["side"] == "R" else (255, 0, 0), 2)
    cnts, _ = cv2.findContours(cmask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    cv2.drawContours(vis, cnts, -1, (0, 160, 0), 2)
    cv2.line(vis, (W2 // 2, 0), (W2 // 2, H2), (0, 200, 255), 1)
    for gx in range(0, PW + 1, 50):
        cv2.line(vis, (int(gx * SS), 0), (int(gx * SS), 8), (0, 0, 0), 1)
        cv2.putText(vis, str(gx), (int(gx * SS) + 2, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 1)
    for gy in range(0, H + 1, 50):
        cv2.line(vis, (0, int(gy * SS)), (8, int(gy * SS)), (0, 0, 0), 1)
        cv2.putText(vis, str(gy), (10, int(gy * SS) + 4), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 1)
    cv2.imwrite(f"{BASE}/view/canon_{level}.jpg", vis, [cv2.IMWRITE_JPEG_QUALITY, 88])
    print(level, "H", H, "k %.3f" % k, "tilt %.2f" % math.degrees(tilt), "x0 %.0f" % x0, "bleed", bleed)


if __name__ == "__main__":
    for lv in (sys.argv[1:] or LEVELS.keys()):
        canon(lv)
