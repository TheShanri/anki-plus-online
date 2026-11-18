"""Reference geometry for the venous build: the brain (context.glb), dura and a few landmarks, in glTF metres (same space
as gross.glb), plus a tiny PIL renderer for orthographic check plots (no matplotlib in the venv)."""
import json, os
import numpy as np
import trimesh
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
RAW = os.path.join(ROOT, "_atlas", "raw", "glb")


def load(path):
    sc = trimesh.load(path, force="scene")
    out = []
    for name, geom in sc.geometry.items():
        pass
    for node in sc.graph.nodes_geometry:
        T, gname = sc.graph[node]
        g = sc.geometry[gname].copy()
        g.apply_transform(T)
        out.append((node, g))
    return out


def mesh(name):
    parts = load(os.path.join(RAW, "s", name + ".glb"))
    return trimesh.util.concatenate([g for _, g in parts])


def context():
    return {n: g for n, g in load(os.path.join(RAW, "context.glb"))}


# views: (axis right, axis up) as unit vectors; depth axis = right x up
VIEWS = {
    "lateral_L": (np.array([0, 0, 1.0]), np.array([0, 1.0, 0])),   # seen from +x (left side), anterior to the right
    "superior": (np.array([1.0, 0, 0]), np.array([0, 0, -1.0])),   # from above, anterior at the bottom? (x right)
    "posterior": (np.array([1.0, 0, 0]), np.array([0, 1.0, 0])),   # from behind (-z): left (+x) on the left of the image? see note
    "inferior": (np.array([1.0, 0, 0]), np.array([0, 0, 1.0])),
}


class Plot:
    def __init__(self, view, box=((-0.08, 0.08), (1.40, 1.72), (-0.11, 0.10)), px=900):
        self.r, self.u = VIEWS[view]
        lo = np.array([b[0] for b in box]); hi = np.array([b[1] for b in box])
        corners = np.array([[x, y, z] for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])])
        R = corners @ self.r; U = corners @ self.u
        self.r0, self.r1, self.u0, self.u1 = R.min(), R.max(), U.min(), U.max()
        self.s = px / max(self.r1 - self.r0, self.u1 - self.u0)
        self.W = int((self.r1 - self.r0) * self.s) + 1
        self.H = int((self.u1 - self.u0) * self.s) + 1
        self.img = Image.new("RGB", (self.W, self.H), (255, 255, 255))
        self.d = ImageDraw.Draw(self.img)

    def xy(self, P):
        P = np.atleast_2d(P)
        return np.stack([(P @ self.r - self.r0) * self.s, (self.u1 - P @ self.u) * self.s], 1)

    def points(self, P, col, step=1, r=0.6):
        for x, y in self.xy(P[::step]):
            self.d.ellipse([x - r, y - r, x + r, y + r], fill=col)

    def line(self, P, col, w=2):
        q = [tuple(p) for p in self.xy(P)]
        if len(q) > 1:
            self.d.line(q, fill=col, width=w)

    def text(self, P, s, col=(0, 0, 0)):
        x, y = self.xy(P)[0]
        self.d.text((x + 3, y - 6), s, fill=col)

    def save(self, path):
        self.img.save(path)
