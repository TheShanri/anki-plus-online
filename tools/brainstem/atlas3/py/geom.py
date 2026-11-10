# Raster <-> vector helpers for the plates (plate units: 1000 wide).
import math
import cv2
import numpy as np

SS = 1.6


def resample(pts, step, closed=True):
    p = np.asarray(pts, np.float64)
    if closed:
        p = np.vstack([p, p[:1]])
    seg = np.sqrt(((p[1:] - p[:-1]) ** 2).sum(1))
    L = np.concatenate([[0], np.cumsum(seg)])
    if L[-1] < 1e-6:
        return p[:1]
    n = max(4 if closed else 2, int(round(L[-1] / step)))
    t = np.linspace(0, L[-1], n, endpoint=not closed)
    x = np.interp(t, L, p[:, 0])
    y = np.interp(t, L, p[:, 1])
    return np.stack([x, y], 1)


def smooth(p, sigma, closed=True):
    if sigma <= 0 or len(p) < 5:
        return p
    r = int(math.ceil(3 * sigma))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    if closed:
        q = np.vstack([p[-r:], p, p[:r]])
        return np.stack([np.convolve(q[:, i], k, "valid") for i in range(2)], 1)
    q = np.vstack([np.repeat(p[:1], r, 0), p, np.repeat(p[-1:], r, 0)])
    out = np.stack([np.convolve(q[:, i], k, "valid") for i in range(2)], 1)
    out[0], out[-1] = p[0], p[-1]
    return out


def dp(p, eps, closed=True):
    c = p.astype(np.float32).reshape(-1, 1, 2)
    return cv2.approxPolyDP(c, eps, closed).reshape(-1, 2).astype(np.float64)


def fmt(v):
    s = f"{v:.1f}"
    return s[:-2] if s.endswith(".0") else s


def bezier(p, closed=True):
    """Catmull-Rom through the points as cubic Beziers"""
    n = len(p)
    if n < 3:
        return "M" + " L".join(f"{fmt(x)} {fmt(y)}" for x, y in p)
    out = [f"M{fmt(p[0][0])} {fmt(p[0][1])}"]
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        p0 = p[(i - 1) % n] if closed or i > 0 else p[0]
        p1 = p[i]
        p2 = p[(i + 1) % n]
        p3 = p[(i + 2) % n] if closed or i + 2 < n else p[n - 1]
        c1 = p1 + (p2 - p0) / 6
        c2 = p2 - (p3 - p1) / 6
        out.append(f"C{fmt(c1[0])} {fmt(c1[1])} {fmt(c2[0])} {fmt(c2[1])} {fmt(p2[0])} {fmt(p2[1])}")
    if closed:
        out.append("Z")
    return "".join(out)


def curve(pts, closed=True, step=2.0, sigma=1.2, eps=0.3):
    p = resample(pts, step, closed)
    p = smooth(p, sigma, closed)
    p = dp(p, eps, closed)
    if closed and len(p) < 3:
        return ""
    return bezier(p, closed)


def mask_paths(m, scale=SS, step=2.2, sigma=1.3, eps=0.4, min_area=6.0):
    """binary mask (canvas px) -> one evenodd path (plate units)"""
    cnts, _ = cv2.findContours(m.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    parts = []
    for c in cnts:
        a = cv2.contourArea(c) / (scale * scale)
        if a < min_area:
            continue
        pts = c.reshape(-1, 2).astype(np.float64) / scale + 0.5 / scale
        d = curve(pts, True, step, sigma, eps)
        if d:
            parts.append(d)
    return "".join(parts)


def raster(polys, shape, scale=SS):
    m = np.zeros(shape, np.uint8)
    for p in polys:
        cv2.fillPoly(m, [np.round(np.asarray(p) * scale).astype(np.int32)], 1)
    return m


def mirror_mask(m):
    return m[:, ::-1]


def mirror_pts(pts, W=1000):
    return [[W - x, y] for x, y in pts]


def anchor(m, scale=SS):
    """pole of inaccessibility (plate units) and its clearance"""
    if m.sum() == 0:
        return None, 0
    d = cv2.distanceTransform(np.pad(m.astype(np.uint8), 1), cv2.DIST_L2, 5)[1:-1, 1:-1]
    y, x = np.unravel_index(np.argmax(d), d.shape)
    return [round(x / scale, 1), round(y / scale, 1)], float(d.max() / scale)


def centroid(m, scale=SS):
    ys, xs = np.nonzero(m)
    return [round(xs.mean() / scale, 1), round(ys.mean() / scale, 1)]
