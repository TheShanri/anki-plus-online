"""Offline sanity renders: each listed mesh in red on the grey cortex, lateral (left hemisphere) or medial/inferior view, as one contact sheet.
Used to verify that a mesh id really is the gyrus its name says.
  tools/.venv/Scripts/python.exe -I tools/atlas/render_check.py out.png view(lat|med|inf|sup) id1 id2 ...
"""
import json, os, sys, numpy as np, trimesh
from PIL import Image, ImageDraw
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
idx = json.load(open(os.path.join(ROOT, "public/atlas/index.json"), encoding="utf8"))["structures"]
LOBES = {"frontal-lobe", "parietal-lobe", "temporal-lobe", "occipital-lobe", "limbic-lobe", "insula"}
_cache = {}
def pts(sid, side="L", n=6000):
    k = (sid, side)
    if k in _cache: return _cache[k]
    p = os.path.join(ROOT, "_atlas/raw/glb/s", sid + ".glb")
    if not os.path.exists(p): p = os.path.join(ROOT, "_atlas/atlas2_build/glb", sid + ".glb")
    sc = trimesh.load(p, force="scene"); out = []
    for nd in sc.graph.nodes_geometry:
        T, g = sc.graph[nd]; m = sc.geometry[g].copy(); m.apply_transform(T)
        if len(m.faces) < 1: continue
        out.append(m.sample(min(n, max(200, len(m.faces) * 3))))
    a = np.vstack(out) if out else np.zeros((0, 3))
    if side == "L": a = a[a[:, 0] > 0.001]
    _cache[k] = a; return a
def proj(a, view):
    if view == "lat": return -a[:, 2], a[:, 1], a[:, 0]       # anterior on the left, depth = +x toward the viewer
    if view == "med": return a[:, 2], a[:, 1], -a[:, 0]
    if view == "inf": return a[:, 0] * -1, -a[:, 2] * -1, -a[:, 1]
    return a[:, 0] * -1, a[:, 2], a[:, 1]
out, view, ids = sys.argv[1], sys.argv[2], sys.argv[3:]
import struct
_b = open(os.path.join(ROOT, "public/atlas/gross.glb"), "rb").read(); _j = json.loads(_b[20:20 + struct.unpack("<I", _b[12:16])[0]])
ctx = [n["name"] for n in _j["nodes"] if n.get("name") and not n["name"].endswith("_m") and n["name"] in idx]  # exactly what the viewer's solid brain draws
base = np.vstack([pts(k, "L", 2500) for k in ctx])
CW, CH, cols = 320, 260, 4
rows = (len(ids) + cols - 1) // cols
img = Image.new("RGB", (cols * CW, rows * CH), "white"); dr = ImageDraw.Draw(img)
bx, by, _ = proj(base, view); x0, x1, y0, y1 = bx.min(), bx.max(), by.min(), by.max()
sc = min((CW - 20) / (x1 - x0), (CH - 40) / (y1 - y0))
def draw(a, ox, oy, col, r):
    x, y, d = proj(a, view); o = np.argsort(d)
    for i in o: 
        px, py = ox + 10 + (x[i] - x0) * sc, oy + 30 + (y1 - y[i]) * sc
        dr.ellipse((px - r, py - r, px + r, py + r), fill=col)
for n, sid in enumerate(ids):
    ox, oy = (n % cols) * CW, (n // cols) * CH
    draw(base, ox, oy, (185, 179, 176), 1)
    t = pts(sid, "L", 5000)
    if len(t): draw(t, ox, oy, (209, 18, 43), 1.4)
    dr.text((ox + 6, oy + 6), idx[sid]["name"][:48], fill=(0, 0, 0))
img.save(out)
