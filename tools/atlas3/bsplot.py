"""Atlas v3: picture of one brainstem plate fitted into the atlas (for checking bsnuclei.py).

  tools/.venv/Scripts/python.exe -I tools/atlas3/bsplot.py <level-slug> <out.png>

The atlas's labels in the fitted section plane (one colour per label, names at their centroids) with the plate's drawn
regions mapped into the plane on top (white outlines, the plate's names in yellow). Uses the dumped pre-plate volume.
"""
import os, sys, json
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bsnuclei as B  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
W = os.path.join(ROOT, "_atlas/raw/v3")
K = np.load(os.path.join(W, "pre_plates.npy"))
meta = json.load(open(os.path.join(W, "pre_plates.json")))
KI, AFF = meta["KI"], np.array(meta["affine"])
inv = {v: k for k, v in KI.items()}
slug, out = sys.argv[1], sys.argv[2]
pl = next(p for p in B.fit_planes(K, KI, AFF, log=lambda *a: None) if p["slug"] == slug)
lab, xs, ds, fit, plate = pl["lab"], pl["xs"], pl["ds"], pl["fit"], pl["plate"]
S = 12  # px per mm
step = xs[1] - xs[0]
h, w = lab.shape[1], lab.shape[0]
rng = np.random.default_rng(3)
pal = rng.integers(40, 200, size=(int(lab.max()) + 1, 3)).astype(np.uint8)
pal[0] = (16, 16, 16)
img = pal[lab.T[::-1]]  # rows: dorsal (high d) at the top; columns: x from -36 (patient's left) to +36
im = Image.fromarray(img).resize((int(w * step * S), int(h * step * S)), Image.NEAREST)
dr = ImageDraw.Draw(im)


def to_px(x, d):
    return ((x - xs[0]) * S, (ds[-1] - d) * S)


for u in np.unique(lab):
    if u == 0:
        continue
    ij = np.argwhere(lab == u)
    if len(ij) < 30:
        continue
    for side in (-1, 1):
        m = ij[(xs[ij[:, 0]] * side) > 0] if inv.get(int(u)) not in ("V4", "Aq", "CeC") else ij
        if len(m) < 30:
            continue
        x, d = xs[m[:, 0]].mean(), ds[m[:, 1]].mean()
        dr.text(to_px(x, d), inv.get(int(u), "?"), fill=(230, 230, 230))
        if inv.get(int(u)) in ("V4", "Aq", "CeC"):
            break
for kind in ("regions", "fibres"):
    for r in plate.get(kind, []):
        for poly in B.parse_path(r["d"]):
            x = -fit["a"] * (poly[:, 0] - fit["mid"])
            d = fit["c"] - fit["b"] * poly[:, 1]
            pts = [to_px(a, b) for a, b in zip(x, d)]
            if len(pts) > 1:
                dr.line(pts + [pts[0]] if kind == "regions" else pts, fill=(255, 255, 255) if kind == "regions" else (120, 200, 255), width=2)
        if kind == "regions" and r.get("c"):
            x = -fit["a"] * (r["c"][0] - fit["mid"]); d = fit["c"] - fit["b"] * r["c"][1]
            dr.text(to_px(x, d + 0.8), r.get("slug", "")[:18], fill=(255, 220, 60))
# crop to the brainstem
nz = np.argwhere(lab.T[::-1] > 0)
im.save(out)
print(slug, "rms", round(fit["rms"], 2), "->", out)
