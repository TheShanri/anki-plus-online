# Surface plates, step 1: put a course specimen photo (Lab 7 "Brainstem Anterior (Ventral) View", "Brainstem Posterior
# (Dorsal) View, Cerebellum removed") in the canonical plate frame: 1000 units wide, the specimen's midline vertical at
# x = 500, rostral up. Writes levels/<level>/canon.png, cmask.png, canon.json in the same form as canon.py, so build.py
# (symmetric illustration from the right half, authored regions from extras.py, photo density) runs on it unchanged.
#   python surface_canon.py [level ...]
import json, math, os, sys
import cv2
import numpy as np
from paths import BASE, REPO
from levels_cfg import SURFACES

PW = 1000
SS = 1.6
PAD = 24


def specimen_mask(img, bg, cfg_thr=(22, 12)):
    """the specimen against the photo's card: away from the card's tone, or textured"""
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    gb = cv2.GaussianBlur(g, (0, 0), 1.5)
    diff = np.abs(gb - bg)
    mu = cv2.blur(g, (9, 9))
    sd = np.sqrt(np.clip(cv2.blur(g * g, (9, 9)) - mu * mu, 0, None))
    m = ((diff > cfg_thr[0]) | (sd > cfg_thr[1])).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    keep = (lab == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)
    inv = (1 - keep).astype(np.uint8)
    h, w = keep.shape
    n2, lab2, st2, _ = cv2.connectedComponentsWithStats(inv, 4)
    for k in range(1, n2):
        x, y, ww, hh, a = st2[k]
        if x == 0 or y == 0 or x + ww >= w or y + hh >= h:
            continue
        keep[lab2 == k] = 1
    return keep


def symmetry_score(m, x0, ang, rows=None):
    h, w = m.shape
    R = cv2.getRotationMatrix2D((x0, h / 2), ang, 1.0)
    r = cv2.warpAffine(m, R, (w, h), flags=cv2.INTER_NEAREST)
    xi = int(round(x0))
    half = min(xi, w - xi)
    if rows:
        r = r[rows[0]:rows[1]]
    L = r[:, xi - half:xi][:, ::-1].astype(np.float32)
    Rr = r[:, xi:xi + half].astype(np.float32)
    return float((L * Rr).sum() / max(1.0, (np.maximum(L, Rr)).sum()))


def run(level):
    cfg = SURFACES[level]
    img0 = cv2.imread(f"{REPO}/content-build/{cfg['file']}", cv2.IMREAD_COLOR)
    x, y, w, h = cfg["rect"]
    img = img0[y:y + h, x:x + w].copy()
    # the slide's coloured overlay marks (circles, arrows) on the specimen: inpaint every saturated pixel
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    hue = hsv[:, :, 0]
    sat = ((hsv[:, :, 1] > 80) & (hsv[:, :, 2] > 60) & ((hue < 8) | (hue > 50))).astype(np.uint8)  # the photo itself is sepia
    sat = cv2.dilate(sat, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    if sat.any():
        img = cv2.inpaint(img, sat, 6, cv2.INPAINT_TELEA)
    for poly in cfg.get("erase_px", []):  # the slide's own arrows/labels that reach into the photo (photo px)
        mk = np.zeros(img.shape[:2], np.uint8)
        cv2.fillPoly(mk, [np.array(poly, np.int32)], 1)
        img = cv2.inpaint(img, mk, 5, cv2.INPAINT_TELEA)
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    border = np.concatenate([g[:6].ravel(), g[-6:].ravel(), g[:, :6].ravel(), g[:, -6:].ravel()])
    bg = float(np.median(border))
    m = specimen_mask(img, bg, tuple(cfg.get("thr", (22, 12))))
    # midline: the most symmetric vertical axis (small tilts allowed), searched around the configured guess
    best = (-1, cfg["mid"], 0.0)
    for ang in np.arange(-3, 3.01, 0.5):
        for x0 in range(cfg["mid"] - 30, cfg["mid"] + 31, 2):
            s = symmetry_score(m, x0, ang, cfg.get("sym_rows"))
            if s > best[0]:
                best = (s, x0, ang)
    _, x0, ang = best
    if "mid_fixed" in cfg:
        x0, ang = cfg["mid_fixed"]
    R = cv2.getRotationMatrix2D((x0, h / 2), ang, 1.0)
    A1 = np.vstack([R, [0, 0, 1]])
    rm = cv2.warpAffine(m, R, (w, h), flags=cv2.INTER_NEAREST)
    ys, xs = np.nonzero(rm)
    ext = max(x0 - xs.min(), xs.max() - x0)
    k = (PW / 2 - PAD) / ext
    top, bot = ys.min(), ys.max()
    H = int(round((bot - top) * k + 2 * PAD))
    A2 = np.array([[k, 0, PW / 2 - x0 * k], [0, k, PAD - top * k], [0, 0, 1]])
    M = A2 @ A1
    Ms = np.diag([SS, SS, 1]) @ M
    W2, H2 = int(round(PW * SS)), int(round(H * SS))
    cimg = cv2.warpAffine(img, Ms[:2], (W2, H2), flags=cv2.INTER_CUBIC, borderValue=(bg, bg, bg))
    cmask = cv2.warpAffine(m, Ms[:2], (W2, H2), flags=cv2.INTER_NEAREST, borderValue=0)
    if cfg.get("clip"):
        cm = np.zeros_like(cmask)
        cv2.fillPoly(cm, [(np.array(cfg["clip"]) * SS).astype(np.int32)], 1)
        cmask = cmask & cm
    for poly in cfg.get("keep", []):  # specimen the mask misses (a cut surface as pale as the card), plate units
        cv2.fillPoly(cmask, [(np.array(poly) * SS).astype(np.int32)], 1)
    if cfg.get("erode"):  # the mask catches the specimen's soft shadow halo; pull the edge in
        e_ = int(cfg["erode"] * SS) | 1
        cmask = cv2.erode(cmask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (e_, e_)))
    r = int(2.0 * SS) | 1
    se = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    cmask = cv2.morphologyEx(cv2.morphologyEx(cmask, cv2.MORPH_OPEN, se), cv2.MORPH_CLOSE, se)
    n_, lab_, st_, _ = cv2.connectedComponentsWithStats(cmask, 8)
    if n_ > 2:
        cmask = (lab_ == 1 + int(np.argmax(st_[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)
    # straighten a bent specimen: the local midline per row (mirror symmetry of the photo itself), smoothed, and each
    # row shifted so the midline is x = 500 all the way down (a horizontal displacement field, no scaling)
    shift = np.zeros(H2, np.float32)
    if cfg.get("straighten"):
        gg = cv2.GaussianBlur(cv2.cvtColor(cimg, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 2.0)
        win = int(cfg["straighten"].get("win", 110) * SS)
        ys_, xs_ = [], []
        for Y in range(0, H2 - int(30 * SS), int(15 * SS)):
            band = gg[Y:Y + int(30 * SS)]
            mrow = cmask[Y:Y + int(30 * SS)].mean(0)
            if (mrow > 0.5).sum() < 2 * win + 20:
                continue
            rows = cfg["straighten"].get("rows")
            if rows and not (rows[0] * SS <= Y <= rows[1] * SS):
                continue
            best_ = None
            for dx in range(-int(60 * SS), int(60 * SS) + 1, 2):
                c0 = W2 // 2 + dx
                L = band[:, c0 - win:c0][:, ::-1]
                Rr = band[:, c0:c0 + win]
                if L.shape != Rr.shape or L.size == 0:
                    continue
                sc = -float(np.abs(L - Rr).mean())
                if best_ is None or sc > best_[0]:
                    best_ = (sc, dx)
            ys_.append(Y + 15 * SS)
            xs_.append(best_[1])
        ys_, xs_ = np.array(ys_), np.array(xs_, np.float32)
        for lo, hi, val in cfg["straighten"].get("pin", []):  # rows (plate units) whose offset is known (e.g. 0 below the obex)
            sel = (ys_ >= lo * SS) & (ys_ <= hi * SS)
            xs_[sel] = val * SS
        med = np.array([np.median(xs_[max(0, i - 3):i + 4]) for i in range(len(xs_))])
        shift = np.interp(np.arange(H2), ys_, med).astype(np.float32)
        shift = cv2.GaussianBlur(shift.reshape(-1, 1), (1, 0), 40 * SS).ravel() if False else np.convolve(np.pad(shift, (int(40 * SS),), mode="edge"), np.ones(int(80 * SS) + 1) / (int(80 * SS) + 1), "valid")[:H2]
        mx = (np.arange(W2)[None, :] + shift[:, None]).astype(np.float32)
        my = np.repeat(np.arange(H2, dtype=np.float32)[:, None], W2, 1)
        cimg = cv2.remap(cimg, mx, my, cv2.INTER_CUBIC, borderValue=(bg, bg, bg))
        cmask = cv2.remap(cmask, mx, my, cv2.INTER_NEAREST, borderValue=0)
        print("  straightened: row offsets (plate units) " + ", ".join(f"y{int(y / SS)}:{s_ / SS:+.0f}" for y, s_ in zip(ys_[::4], med[::4])))
    for poly in cfg.get("erase", []):  # slide marks left on the photo after straightening (plate units)
        mk = np.zeros(cimg.shape[:2], np.uint8)
        cv2.fillPoly(mk, [(np.array(poly) * SS).astype(np.int32)], 1)
        cimg = cv2.inpaint(cimg, mk, 6, cv2.INPAINT_TELEA)
    out = f"{BASE}/levels/{level}"
    os.makedirs(out, exist_ok=True)
    cv2.imwrite(f"{out}/canon.png", cimg)
    cv2.imwrite(f"{out}/cmask.png", cmask * 255)
    json.dump({"level": level, "W": PW, "H": H, "SS": SS, "k": k, "M": M.tolist(), "bg": bg, "bleed": False,
               "shapes": {"area": {}, "fibres": {}}, "surface": True, "shift": [round(float(v) / SS, 2) for v in shift[::int(10 * SS)]]}, open(f"{out}/canon.json", "w"))
    # a gridded view for authoring (plate units, grid every 25, labels every 50)
    vis = cimg.copy()
    cnts, _ = cv2.findContours(cmask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    cv2.drawContours(vis, cnts, -1, (0, 160, 0), 1)
    for gx in range(0, PW + 1, 25):
        X = int(gx * SS)
        cv2.line(vis, (X, 0), (X, H2), (0, 0, 255) if gx % 100 == 0 else (230, 170, 120), 1)
        if gx % 50 == 0:
            cv2.putText(vis, str(gx), (X + 2, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 200), 1)
    for gy in range(0, H + 1, 25):
        Y = int(gy * SS)
        cv2.line(vis, (0, Y), (W2, Y), (0, 0, 255) if gy % 100 == 0 else (230, 170, 120), 1)
        if gy % 50 == 0:
            cv2.putText(vis, str(gy), (2, Y - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 200), 1)
    os.makedirs(f"{BASE}/view", exist_ok=True)
    cv2.imwrite(f"{BASE}/view/canon_{level}.jpg", vis, [cv2.IMWRITE_JPEG_QUALITY, 88])
    print(level, "H", H, "k %.3f" % k, "mid x %.0f" % x0, "tilt %.1f" % ang, "symmetry %.3f" % best[0], "bg %.0f" % bg)


if __name__ == "__main__":
    for lv in (sys.argv[1:] or SURFACES.keys()):
        run(lv)
