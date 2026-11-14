"""3D brainstem for the brainstem atlas and Explore's Brainstem focus.

Builds public/atlas/brainstem3d.glb (one named node per pickable part, Z-Anatomy model space = the same space as gross.glb)
and src/data/brainstem-3d.json (parts, label anchors, the section planes of every plate level, sources).

* Real Z-Anatomy meshes (CC BY-SA 4.0) wherever one exists: midbrain, pons, medulla, cerebral peduncles, SCP/ICP, thalamus,
  geniculate bodies, pineal, mammillary bodies, optic chiasm/tract/nerve, hypothalamus, cranial nerves III-XII, upper cord.
* Landmarks without a mesh are surface patches cut out of the real surface along a smooth scalar field (exact triangle
  splitting, so the outline is a clean curve, not a staircase): colliculi, facial colliculus, floor of the 4th ventricle,
  obex, area postrema, gracile/cuneate tubercles, olives, pyramids, pyramidal decussation, interpeduncular fossa, basilar
  pons, middle cerebellar peduncle, pulvinar. Positions: the model's own relief (depth maps), the buried Z-Anatomy olive and
  pyramid meshes (the patch is the surface over them), the course Lab 7 specimen photos (relative positions on the
  external-anterior / external-posterior plates) and Sobotta 1909 figs. 647 / 659 / 661 (public domain); see NOTES below.
* Nerves are clipped to their root (outside the brainstem, within a radius of the exit) and thickened a little so they can
  be picked; the trochlear nerve's dorsal start and the accessory nerve are authored tubes (approximate).
* Section planes: each plate level is a plane through landmarks the plate itself shows (see LEVELS), oriented across the
  brainstem's long axis; the axis distance from the pontomesencephalic junction is compared with Coulombe et al. 2021.

Run (repo root):  tools/.venv/Scripts/python.exe -I tools/brainstem/bs3d/build.py
Needs the raw meshes in _atlas/raw/glb/s and the decoded mni-* meshes in _atlas/raw/bs3d (see decode() below).
"""
import json, os, subprocess, sys
import numpy as np
import trimesh
from scipy.spatial import cKDTree

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
RAW = [os.path.join(ROOT, "_atlas/raw/glb/s"), os.path.join(ROOT, "_atlas/raw/bs3d")]
TMP = os.path.join(ROOT, "_atlas/raw/bs3d/brainstem3d_raw.glb")
OUT_GLB = os.path.join(ROOT, "public/atlas/brainstem3d.glb")
OUT_JSON = os.path.join(ROOT, "src/data/brainstem-3d.json")
NAMES = {k: v["name"] for k, v in json.load(open(os.path.join(ROOT, "src/data/brainstem-levels.json"), encoding="utf8"))["structures"].items()}


def decode():
    """mni-* meshes are only published meshopt-compressed: decode them once into _atlas/raw/bs3d."""
    for sid in ["mni-inferior-cerebellar-peduncle", "mni-pulvinar", "mni-pineal-gland"]:
        dst = os.path.join(ROOT, "_atlas/raw/bs3d", sid + ".glb")
        if os.path.exists(dst):
            continue
        tmp = dst + ".tmp.glb"
        subprocess.run(["npx", "--yes", "@gltf-transform/cli", "copy", f"public/atlas/s/{sid}.glb", tmp], cwd=ROOT, check=True, shell=True)
        subprocess.run(["npx", "--yes", "@gltf-transform/cli", "dequantize", tmp, dst], cwd=ROOT, check=True, shell=True)
        os.remove(tmp)


# ---------------------------------------------------------------- meshes as (V, F, N) in millimetres

class M:
    def __init__(self, V, F, N=None):
        self.V = np.asarray(V, float)
        self.F = np.asarray(F, np.int64).reshape(-1, 3)
        if N is None:
            N = trimesh.Trimesh(self.V, self.F, process=False).vertex_normals if len(self.F) else np.zeros_like(self.V)
        self.N = np.nan_to_num(np.asarray(N, float))

    def compact(self):
        if not len(self.F):
            return M(np.zeros((0, 3)), np.zeros((0, 3), np.int64), np.zeros((0, 3)))
        used = np.unique(self.F)
        remap = -np.ones(len(self.V), np.int64)
        remap[used] = np.arange(len(used))
        return M(self.V[used], remap[self.F], self.N[used])

    def faces(self, mask):
        return M(self.V, self.F[mask], self.N).compact()

    @staticmethod
    def cat(ms):
        ms = [m for m in ms if len(m.F)]
        if not ms:
            return M(np.zeros((0, 3)), np.zeros((0, 3), np.int64), np.zeros((0, 3)))
        V, F, N, o = [], [], [], 0
        for m in ms:
            V.append(m.V); N.append(m.N); F.append(m.F + o); o += len(m.V)
        return M(np.vstack(V), np.vstack(F), np.vstack(N))


def load(sid):
    """{'L': M, 'R': M} (or {'M': M}); Z-Anatomy '.l' nodes are at +x (the subject's left)."""
    for base in RAW:
        p = os.path.join(base, sid + ".glb")
        if os.path.exists(p):
            break
    else:
        raise FileNotFoundError(sid)
    sc = trimesh.load(p, force="scene")
    out = {}
    for nd in sc.graph.nodes_geometry:
        T, g = sc.graph[nd]
        m = sc.geometry[g].copy()
        m.apply_transform(T)
        mm = M(m.vertices * 1000.0, m.faces)
        n = nd.lower()
        side = "R" if ".r." in n or n.endswith(".r") else "L" if ".l." in n or n.endswith(".l") else None
        if side is None:
            c = mm.V[mm.F].mean(1)[:, 0]
            if sid.startswith("mni-"):
                out["L"] = M.cat([out.get("L", M.cat([])), mm.faces(c >= 0)])
                out["R"] = M.cat([out.get("R", M.cat([])), mm.faces(c < 0)])
                continue
            side = "M"
        out[side] = M.cat([out.get(side, M.cat([])), mm])
    return out


def both(sid):
    d = load(sid)
    return M.cat(list(d.values()))


# ---------------------------------------------------------------- exact split of a mesh along a scalar field (f > 0 inside)

def split(m, f):
    f = np.nan_to_num(np.asarray(f, float), nan=-1.0, posinf=1.0, neginf=-1.0)
    f = np.where(np.abs(f) < 1e-7, 1e-7, f)
    s = f > 0
    if not len(m.F):
        return m, m
    cnt = s[m.F].sum(1)
    inside = [m.F[cnt == 3]]
    outside = [m.F[cnt == 0]]
    V, N = list(m.V), list(m.N)
    cache = {}

    def cut(a, b):
        k = (a, b) if a < b else (b, a)
        if k not in cache:
            t = f[a] / (f[a] - f[b])
            V.append(m.V[a] + t * (m.V[b] - m.V[a]))
            n = m.N[a] + t * (m.N[b] - m.N[a])
            N.append(n / (np.linalg.norm(n) + 1e-12))
            cache[k] = len(V) - 1
        return cache[k]

    ins, outs = [], []
    for tri in m.F[(cnt == 1) | (cnt == 2)]:
        a, b, c = (int(x) for x in tri)
        sa, sb, sc_ = bool(s[a]), bool(s[b]), bool(s[c])
        lone_in = (int(sa) + int(sb) + int(sc_)) == 1
        # rotate so the lone vertex is first (cyclic order kept)
        if (sa if lone_in else not sa):
            pass
        elif (sb if lone_in else not sb):
            a, b, c = b, c, a
        else:
            a, b, c = c, a, b
        p, q = cut(a, b), cut(a, c)
        lone = [(a, p, q)]
        quad = [(p, b, c), (p, c, q)]
        if lone_in:
            ins += lone; outs += quad
        else:
            outs += lone; ins += quad
    V, N = np.array(V), np.array(N)
    fi = np.vstack(inside + ([np.array(ins)] if ins else []))
    fo = np.vstack(outside + ([np.array(outs)] if outs else []))
    return M(V, fi, N).compact(), M(V, fo, N).compact()


# ---------------------------------------------------------------- fields

def ell(V, c, a):
    """1 - normalised squared distance (> 0 inside an ellipse/ellipsoid); a = semi-axes in mm (None: unbounded)."""
    s = np.zeros(len(V))
    for k in range(3):
        if a[k]:
            s += ((V[:, k] - c[k]) / a[k]) ** 2
    return 1 - s


def AND(*fs):
    return np.minimum.reduce(fs)


class Dist:
    def __init__(self, m, n=60000):
        tm = trimesh.Trimesh(m.V, m.F, process=False)
        pts, fi = trimesh.sample.sample_surface(tm, n, seed=1)
        self.kd = cKDTree(np.vstack([pts, m.V]))
        self.pts = np.vstack([pts, m.V])
        self.nrm = np.vstack([tm.face_normals[fi], m.N])

    def d(self, V):
        return self.kd.query(V)[0]

    def signed(self, V):
        d, i = self.kd.query(V)
        return np.sign(((V - self.pts[i]) * self.nrm[i]).sum(1) + 1e-9) * d


# ---------------------------------------------------------------- build

def main():
    decode()
    host = {k: load(k) for k in ["midbrain", "pons", "medulla-oblongata"]}
    vent = both("fourth-ventricle")
    olive, pyr = load("olive"), load("pyramid-of-medulla-oblongata")
    body = M.cat([M.cat(list(host[k].values())) for k in host] + [both("base-of-peduncle")])
    bodyD = Dist(body, 250000)
    ventD = Dist(vent, 80000)
    parts = []  # dicts: id, slug, name, kind, side, m, approx, note

    def add(pid, slug, side, m, kind, approx=False, note=None, name=None):
        if len(m.F):
            parts.append(dict(id=pid, slug=slug, side=side, m=m, kind=kind, approx=approx, note=note, name=name))

    # ---- axis: midline sagittal profile centre (dorsal-most + ventral-most) / 2 per millimetre of height
    cord = both("white-matter-of-spinal-cord")
    cord = split(cord, cord.V[:, 1] - 1522.0)[0]
    cord = split(cord, 1541.0 - cord.V[:, 1])[0]
    allb = M.cat([body, cord])
    ys = np.arange(1513.0, 1616.5, 1.0)
    ax = []
    for y in ys:
        sel = (np.abs(allb.V[:, 1] - y) < 0.8) & (np.abs(allb.V[:, 0]) < 2.0)
        z = allb.V[sel, 2]
        ax.append([0.0, y, (z.min() + z.max()) / 2 if len(z) > 3 else np.nan])
    ax = np.array(ax)
    ok = ~np.isnan(ax[:, 2])
    ax[:, 2] = np.interp(ax[:, 1], ax[ok, 1], ax[ok, 2])
    k = np.ones(9) / 9
    ax[:, 2] = np.convolve(np.pad(ax[:, 2], 4, mode="edge"), k, mode="valid")
    seg = np.linalg.norm(np.diff(ax, axis=0), axis=1)
    arc = np.concatenate([[0], np.cumsum(seg)])

    def axis_at(y):
        z = np.interp(y, ax[:, 1], ax[:, 2])
        w = np.abs(ax[:, 1] - y) <= 8.0  # the local long axis: a line fitted over +-8 mm
        k_ = np.polyfit(ax[w, 1], ax[w, 2], 1)[0]
        t = np.array([0.0, 1.0, k_])
        return np.array([0, y, z]), t / np.linalg.norm(t), float(np.interp(y, ax[:, 1], arc))

    # ventral pontomesencephalic (PMJ) and pontomedullary junctions on the midline, from the pons mesh
    pV = M.cat(list(host["pons"].values())).V
    vmid = pV[np.abs(pV[:, 0]) < 1.0]
    vmid = vmid[vmid[:, 2] > np.percentile(vmid[:, 2], 60)]
    PMJ_y, PoMJ_y = vmid[:, 1].max(), vmid[:, 1].min()
    s_pmj = axis_at(PMJ_y)[2]
    s_pomj = axis_at(PoMJ_y)[2]
    # Coulombe et al. 2021 distances are from the PMJ along the axis; scale by pons length (theirs: PoMJ between plate 24 at
    # -21.33 and plate 28 at -26.31 mm; ~ -24.0)
    scale = (s_pmj - s_pomj) / 24.0

    def y_at_arc(s):
        return float(np.interp(s, arc, ax[:, 1]))

    dec_top = y_at_arc(s_pmj - 42.2 * scale)  # Coulombe pl. 40: onset of the pyramidal decussation
    dec_bot = y_at_arc(s_pmj - 48.7 * scale)  # pl. 43: lowest medulla at the decussation

    # ---- patches (left side at +x; mirrored for the right)
    def mirror(fn):
        return lambda V, N, side: fn(V * np.array([1 if side == "L" else -1, 1, 1]), N * np.array([1 if side == "L" else -1, 1, 1]))

    dors = lambda V, N, zmax, nz=-0.2: AND((zmax - V[:, 2]) / 2.0, (-N[:, 2] + nz) * 4)
    ventr = lambda V, N, zmin, nz=0.15: AND((V[:, 2] - zmin) / 2.0, (N[:, 2] - nz) * 4)
    oliveD = {s: Dist(olive[s], 20000) for s in olive}
    pyrD = {s: Dist(pyr[s], 20000) for s in pyr}
    OBEX = np.array([0.0, 1569.4])

    P = [
        # id, slug, hosts, side (LR|M), field(V, N, side), approx, note
        ("facial-colliculus", "facial-colliculus", ["pons"], "LR",
         mirror(lambda V, N: AND(ell(V, (3.1, 1581.6, 0), (1.7, 2.4, None)), dors(V, N, -15))), True,
         "Surface patch: the medial eminence over the abducens nucleus, just above the striae medullares (course Lab 7 posterior view; Sobotta 659)."),
        ("area-postrema", "area-postrema", ["medulla-oblongata"], "LR",
         mirror(lambda V, N: AND(ell(V, (1.0, 1570.7, 0), (0.85, 1.25, None)), dors(V, N, -19))), True,
         "Surface patch: the narrow strip on each side of the caudal tip of the fourth ventricle, just above the obex."),
        ("obex", "obex", ["medulla-oblongata"], "M",
         lambda V, N, side: AND(ell(V, (0, OBEX[1], 0), (0.9, 0.75, None)), dors(V, N, -19)), True,
         "The caudal tip of the fourth ventricle (where the model's floor closes)."),
        ("floor-of-the-fourth-ventricle", "fourth-ventricle", ["pons", "medulla-oblongata"], "M",
         lambda V, N, side: AND(1.3 - ventD.d(V), (V[:, 1] - OBEX[1]) / 0.5, -N[:, 2] * 3 + 0.3), False,
         "The rhomboid fossa: the brainstem surface under the Z-Anatomy fourth-ventricle cast (cerebellum removed)."),
        ("superior-colliculus", "superior-colliculus", ["midbrain"], "LR",
         mirror(lambda V, N: AND(ell(V, (3.0, 1612.2, 0), (3.1, 2.9, None)), dors(V, N, -15, -0.25))), False,
         "The upper pair of the four bumps of the midbrain tectum (relief of the Z-Anatomy midbrain)."),
        ("inferior-colliculus", "inferior-colliculus", ["midbrain"], "LR",
         mirror(lambda V, N: AND(ell(V, (2.8, 1604.6, 0), (3.0, 2.6, None)), dors(V, N, -16, -0.25))), False,
         "The lower pair of the tectal bumps (relief of the Z-Anatomy midbrain)."),
        ("gracile-tubercle", "gracile-tubercle", ["medulla-oblongata"], "LR",
         mirror(lambda V, N: AND(ell(V, (2.1, 1567.6, 0), (1.5, 2.6, None)), dors(V, N, -24))), True,
         "Surface patch beside the posterior median sulcus at and below the obex (course Lab 7; Sobotta 659)."),
        ("cuneate-tubercle", "cuneate-tubercle", ["medulla-oblongata"], "LR",
         mirror(lambda V, N: AND(ell(V, (5.0, 1568.6, 0), (1.5, 2.8, None)), dors(V, N, -20, 0.0))), True,
         "Surface patch lateral to the gracile tubercle, slightly higher (course Lab 7; Sobotta 659)."),
        ("olives", "olives", ["medulla-oblongata"], "LR",
         lambda V, N, side: AND(1.9 - oliveD[side].d(V), (N[:, 0] * (1 if side == "L" else -1) + 0.05) * 4), False,
         "The surface over the Z-Anatomy inferior olive mesh."),
        ("pyramids", "pyramids", ["medulla-oblongata"], "LR",
         lambda V, N, side: AND(1.7 - pyrD[side].d(V), ventr(V, N, -18, 0.1)), False,
         "The surface over the Z-Anatomy pyramid mesh, from the pons to the decussation."),
        ("pyramidal-decussation", "motor-decussation", ["medulla-oblongata"], "M",
         lambda V, N, side: AND(ell(V, (0, (dec_top + dec_bot) / 2, 0), (2.6, (dec_top - dec_bot) / 2 + 0.6, None)), (V[:, 2] + 23.0) / 2.0), True,
         "Ventral midline where the pyramids' fibres cross, placed from Coulombe et al. 2021 (plates 40-43, scaled to this model)."),
        ("interpeduncular-fossa", "interpeduncular-fossa", ["midbrain"], "M",
         lambda V, N, side: AND(ell(V, (0, 1609.6, 0), (2.7, 5.6, None)), ventr(V, N, -6, 0.15)), True,
         "The floor between the cerebral peduncles (posterior perforated substance), where the oculomotor nerves exit."),
        ("middle-cerebellar-peduncle", "middle-cerebellar-peduncle", ["pons"], "LR",
         mirror(lambda V, N: (V[:, 0] - 14.6) / 0.8), False,
         "The pons lateral to the trigeminal roots, cut where it enters the cerebellum."),
        ("basilar-pons", "transverse-fibers-of-the-pons", ["pons"], "LR",
         mirror(lambda V, N: AND((V[:, 2] + 6.0) / 2.0, (N[:, 2] + 0.25) * 3)), False,
         "The ventral (basilar) pons: the pontine protuberance with its transverse fibres."),
    ]
    rest = {k: dict(host[k]) for k in host}
    pieces = {}
    for pid, slug, hosts, sd, fn, approx, note in P:
        for h in hosts:
            for side, m in list(rest[h].items()):
                f = fn(m.V, m.N, side)
                inn, out = split(m, f)
                rest[h][side] = out
                key = (pid, "M" if sd == "M" else side)
                pieces.setdefault(key, []).append(inn)
        for (p2, side), ms in list(pieces.items()):
            if p2 == pid:
                add(pid + ("" if side == "M" else "." + side), slug, side, M.cat(ms), "patch", approx, note)
    for h, slug in [("midbrain", "midbrain"), ("pons", "pons"), ("medulla-oblongata", "medulla")]:
        for side, m in rest[h].items():
            add(f"{h}.{side}", slug, side, m, "body")
    add("upper-cervical-cord", "spinal-cord", "M", cord, "body", note="Upper cervical cord (clipped).")

    # ---- real meshes
    def real(sid, slug, kind="mesh", keep=None, approx=False, note=None, name=None, prefix=None):
        for side, m in load(sid).items():
            if keep is not None:
                c = m.V[m.F].mean(1)
                m = m.faces(keep(c, side))
            add(f"{prefix or slug}.{side}" if side != "M" else (prefix or slug), slug, side, m, kind, approx, note, name)

    real("base-of-peduncle", "cerebral-peduncles")
    real("superior-cerebellar-peduncle", "superior-cerebellar-peduncle", keep=lambda c, s: c[:, 2] > -31.0, note="Cut where it enters the cerebellum.")
    real("mni-inferior-cerebellar-peduncle", "inferior-cerebellar-peduncle", note="Cut where it enters the cerebellum.")
    midD = Dist(M.cat(list(host["midbrain"].values())), 60000)
    real("inferior-colliculus", "brachium-of-the-inferior-colliculus",
         keep=lambda c, s: (midD.signed(c) > -0.05) & (np.abs(c[:, 0]) > 4.5),
         note="The Z-Anatomy inferior colliculus mesh where it leaves the tectum: the brachium running to the medial geniculate body.")
    real("superior-colliculus", "brachium-of-the-superior-colliculus", kind="context",
         keep=lambda c, s: (midD.signed(c) > -0.05) & (np.abs(c[:, 0]) > 5.5), name="Brachium of the superior colliculus")
    real("medial-geniculate-body", "medial-geniculate-nucleus")
    real("lateral-geniculate-body", "lateral-geniculate-nucleus")
    real("mni-pineal-gland", "pineal-gland")
    real("mamillary-body", "mammillary-bodies")
    real("optic-chiasm", "optic-chiasm")
    real("optic-tract", "optic-tract")
    real("hypothalamus", "hypothalamus", kind="context")
    # thalamus with its pulvinar (the pulvinar is the thalamic surface over the MRI-carved mni-pulvinar patch)
    pul = load("mni-pulvinar")
    for side, m in load("thalamus").items():
        pd = Dist(pul[side], 20000)
        inn, out = split(m, 0.7 - pd.d(m.V))
        add(f"pulvinar.{side}", "pulvinar", side, inn, "patch", False, "The posterior pole of the thalamus (Z-Anatomy thalamus over the MRI-carved pulvinar).")
        add(f"thalamus.{side}", "thalamus", side, out, "context")

    # ---- cranial nerves: the root outside the brainstem, within a radius of the exit, thickened to be pickable
    NERVES = [
        ("olfactory-nerve-i", "olfactory-nerve", 60, 0.0),
        ("optic-nerve-ii", "optic-nerve", 14, 0.0),
        ("oculomotor-nerve-iii", "oculomotor-nerve", 15, 0.35),
        ("trochlear-nerve-iv", "trochlear-nerve", 16, 0.15),
        ("abducens-nerve-vi", "abducens-nerve", 14, 0.2),
        ("facial-nerve-vii", "facial-nerve", 10, 0.3),
        ("vestibulocochlear-nerve-viii", "vestibulocochlear-nerve", 9, 0.45),
        ("glossopharyngeal-nerve-ix", "glossopharyngeal-nerve", 10, 0.15),
        ("vagus-nerve-x", "vagus-nerve", 11, 0.2),
        ("hypoglossal-nerve-xii", "hypoglossal-nerve", 9, 0.1),
    ]
    exits = {}
    for sid, slug, R, infl in NERVES:
        for side, m in load(sid).items():
            if side == "M":
                continue
            d = bodyD.d(m.V)
            if slug in ("olfactory-nerve", "optic-nerve"):
                ex = m.V[np.argmin(m.V[:, 2])]  # the end nearest the brainstem (posterior)
                outside = np.ones(len(m.V), bool)
            else:
                close = m.V[d < 0.8]
                ex = close.mean(0) if len(close) else m.V[np.argmin(d)]
                outside = bodyD.signed(m.V) > -0.15
            keepv = outside & (np.linalg.norm(m.V - ex, axis=1) < R)
            sub = m.faces(keepv[m.F].all(1))
            if not len(sub.F):
                continue
            # keep the connected pieces that touch the brainstem (or the chiasm for II)
            tm = trimesh.Trimesh(sub.V, sub.F, process=False)
            comps = tm.split(only_watertight=False)
            keepc = []
            for cmp in comps:
                if slug in ("olfactory-nerve", "optic-nerve") or bodyD.d(cmp.vertices).min() < 3.0:
                    keepc.append(cmp)
            if not keepc:
                continue
            cm = trimesh.util.concatenate(keepc)
            if slug == "olfactory-nerve":  # context only: a lighter mesh
                import fast_simplification
                v_, f_ = fast_simplification.simplify(cm.vertices, cm.faces, target_reduction=0.8)
                cm = trimesh.Trimesh(v_, f_, process=False)
            mm = M(cm.vertices, cm.faces)
            mm.V = mm.V + mm.N * infl
            exits[f"{slug}.{side}"] = ex
            add(f"{slug}.{side}", slug, side, mm, "nerve")

    def tube(points, r, n=10, steps=60):
        from scipy.interpolate import CubicSpline
        pts = np.array(points, float)
        t = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
        cs = CubicSpline(t, pts, bc_type="natural")
        ts = np.linspace(0, t[-1], steps)
        C = cs(ts)
        T = cs(ts, 1)
        T /= np.linalg.norm(T, axis=1)[:, None]
        V, Nn, F = [], [], []
        ref = np.array([0, 0, 1.0]) if abs(T[0, 2]) < 0.9 else np.array([1.0, 0, 0])
        for i in range(steps):
            a = np.cross(T[i], ref); a /= np.linalg.norm(a); b = np.cross(T[i], a)
            rr = r(i / (steps - 1)) if callable(r) else r
            for j in range(n):
                th = 2 * np.pi * j / n
                d = np.cos(th) * a + np.sin(th) * b
                V.append(C[i] + rr * d); Nn.append(d)
        for i in range(steps - 1):
            for j in range(n):
                a0, a1 = i * n + j, i * n + (j + 1) % n
                b0, b1 = a0 + n, a1 + n
                F += [(a0, b0, a1), (a1, b0, b1)]
        # end caps
        for i, rev in ((0, True), (steps - 1, False)):
            ci = len(V); V.append(C[i]); Nn.append(-T[i] if rev else T[i])
            for j in range(n):
                a0, a1 = i * n + j, i * n + (j + 1) % n
                F.append((ci, a1, a0) if rev else (ci, a0, a1))
        return M(np.array(V), np.array(F), np.array(Nn))

    # trochlear: the dorsal exit just below the inferior colliculus, around the lateral midbrain to the Z-Anatomy root
    for side, sg in (("L", 1), ("R", -1)):
        iv = [p for p in parts if p["id"] == f"trochlear-nerve.{side}"]
        if iv:
            V = iv[0]["m"].V
            end = V[np.argmin(V[:, 2])]  # its posterior-most point
            pts = [np.array([sg * 2.4, 1600.8, -21.4]), np.array([sg * 6.5, 1601.4, -21.2]), np.array([sg * 11.0, 1602.2, -17.0]), np.array([sg * 14.2, 1602.6, -10.5])]
            pts = [bodyD.pts[bodyD.kd.query(q)[1]] + bodyD.nrm[bodyD.kd.query(q)[1]] * 0.6 for q in pts]
            iv[0]["m"] = M.cat([iv[0]["m"], tube(pts + [end], 0.42)])
            iv[0]["note"] = "Its dorsal exit below the inferior colliculus and the turn around the midbrain are drawn (approximate); the rest is the Z-Anatomy nerve."
    # trigeminal: the Z-Anatomy root attaches ~6 mm higher than on the course specimen (V at 43 % of the pons height on the
    # Lab 7 ventral photo, Z-Anatomy 22 %); the root is drawn at the course level, where the model's own intrapontine motor
    # root (motor-root-of-trigeminal-nerve) also lies, as a thick sensory root with a thin motor root above it.
    mr = load("motor-root-of-trigeminal-nerve")
    for side, sg in (("L", 1), ("R", -1)):
        y0 = float(mr[side].V[:, 1].mean())
        q = np.array([sg * 15.5, y0, -1.5])
        i = bodyD.kd.query(q)[1]
        ex = bodyD.pts[i]
        nn = bodyD.nrm[i]
        pts = [ex - nn * 1.0, ex + np.array([sg * 3.2, 0.6, 4.2]), ex + np.array([sg * 6.5, 1.4, 9.0]), ex + np.array([sg * 9.0, 2.2, 13.5])]
        root = tube(pts, lambda u: 2.0 - 0.25 * u, 14, 40)
        motor = tube([p + np.array([-sg * 0.3, 2.0, -0.4]) for p in pts], 0.55, 8, 30)
        exits[f"trigeminal-nerve.{side}"] = ex
        add(f"trigeminal-nerve.{side}", "trigeminal-nerve", side, M.cat([root, motor]), "nerve", True,
            "Drawn at the course specimen's level (Lab 7 ventral view: about 43 % down the pons, at the junction with the middle cerebellar peduncle); the large sensory root with the small motor root above it.")

    # accessory: spinal rootlets up the lateral cord to the jugular foramen with the vagus (the course specimens lack it)
    for side, sg in (("L", 1), ("R", -1)):
        pts = [(sg * 6.4, 1523.0, -27.4), (sg * 6.9, 1530.0, -26.8), (sg * 8.2, 1544.0, -25.0), (sg * 10.6, 1558.0, -21.5), (sg * 13.5, 1566.0, -18.0), (sg * 17.5, 1569.5, -14.5)]
        add(f"accessory-nerve.{side}", "accessory-nerve", side, tube(pts, 0.45), "nerve", True,
            "Drawn (approximate): the spinal accessory root rising along the lateral cord beside the medulla to join the vagus at the jugular foramen. The course notes it is not present on the lab brainstems.")
        for k, yy in enumerate([1527.0, 1536.0, 1546.0]):
            q = np.interp(yy, [p[1] for p in pts], np.arange(len(pts)))
            i = int(q); f = q - i
            a = np.array(pts[i]) * (1 - f) + np.array(pts[min(i + 1, len(pts) - 1)]) * f
            root = np.array([sg * 5.0, yy - 2.5, a[2] - 0.8])
            parts[-1 - 0]["m"] = M.cat([parts[-1]["m"], tube([root, (root + a) / 2 + np.array([sg * 0.6, 0, 0]), a], 0.18, 6, 12)])

    # ---- names and anchors
    ROMAN = {"olfactory-nerve": "I", "optic-nerve": "II", "oculomotor-nerve": "III", "trochlear-nerve": "IV", "trigeminal-nerve": "V", "abducens-nerve": "VI",
             "facial-nerve": "VII", "vestibulocochlear-nerve": "VIII", "glossopharyngeal-nerve": "IX", "vagus-nerve": "X", "accessory-nerve": "XI", "hypoglossal-nerve": "XII"}
    SPECIAL = {"floor-of-the-fourth-ventricle": "Floor of the fourth ventricle", "basilar-pons": "Basilar pons (transverse fibres)", "pyramidal-decussation": "Pyramidal (motor) decussation",
               "upper-cervical-cord": "Upper cervical spinal cord"}
    for p in parts:
        base = p["id"].split(".")[0]
        nm = p["name"] or SPECIAL.get(base) or NAMES.get(p["slug"]) or p["slug"].replace("-", " ").capitalize()
        if p["slug"] in ROMAN:
            nm = f"{nm} ({ROMAN[p['slug']]})"
        p["name"] = nm
        m = p["m"]
        if p["kind"] == "nerve" and f"{p['slug']}.{p['side']}" in exits:
            a = exits[f"{p['slug']}.{p['side']}"]
            i = np.argmin(np.linalg.norm(m.V - a, axis=1) - 0.0)
            # a point 2.5 mm out along the root: label anchor
            dd = np.linalg.norm(m.V - a, axis=1)
            cand = np.where(np.abs(dd - 2.5) < 0.8)[0]
            anc = m.V[cand].mean(0) if len(cand) else m.V[i]
        else:
            tri = m.V[m.F]
            ar = np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1)
            c = (tri.mean(1) * ar[:, None]).sum(0) / ar.sum()
            j = np.argmin(np.linalg.norm(m.V - c, axis=1))
            anc = m.V[j] + m.N[j] * 0.3
        p["anchor"] = anc

    # ---- section planes (each through landmarks the plate shows; oriented across the long axis)
    def P_of(pid):
        return next(p for p in parts if p["id"] == pid)

    def centre(pid):
        m = P_of(pid)["m"]
        tri = m.V[m.F]
        ar = np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1)
        return (tri.mean(1) * ar[:, None]).sum(0) / ar.sum()

    def across(pt):
        a, t, s = axis_at(pt[1])
        n = t * np.array([0, 1, 1]); n /= np.linalg.norm(n)
        if n[1] < 0:
            n = -n
        return n

    def plane_through(pl, pr, pv):
        n = np.cross(pr - pl, pv - (pl + pr) / 2)
        n /= np.linalg.norm(n)
        if n[1] < 0:
            n = -n
        return n

    LEV = {}
    scL, scR = centre("superior-colliculus.L"), centre("superior-colliculus.R")
    iii = (exits["oculomotor-nerve.L"] + exits["oculomotor-nerve.R"]) / 2
    LEV["midbrain-sc"] = ((scL + scR) / 2, plane_through(scL, scR, iii),
                          "Through the superior colliculi and the oculomotor roots in the interpeduncular fossa (both on the plate).")
    icL, icR = centre("inferior-colliculus.L"), centre("inferior-colliculus.R")
    ventral_ic = np.array([0, PMJ_y - 2.0, np.interp(PMJ_y - 2.0, vmid[:, 1][np.argsort(vmid[:, 1])], vmid[:, 2][np.argsort(vmid[:, 1])])])
    LEV["midbrain-ic"] = ((icL + icR) / 2, plane_through(icL, icR, ventral_ic),
                          "Through the inferior colliculi and, ventrally, the top of the basilar pons (the plate shows pontine nuclei).")
    vL, vR = exits["trigeminal-nerve.L"], exits["trigeminal-nerve.R"]
    LEV["pons-mid"] = ((vL + vR) / 2, across((vL + vR) / 2), "Through the trigeminal roots (and the model's intrapontine motor roots), across the long axis.")
    fcL, fcR = centre("facial-colliculus.L"), centre("facial-colliculus.R")
    yv = PoMJ_y + 2.5
    ventral_pc = np.array([0, yv, np.interp(yv, vmid[:, 1][np.argsort(vmid[:, 1])], vmid[:, 2][np.argsort(vmid[:, 1])])])
    LEV["pons-caudal"] = ((fcL + fcR) / 2, plane_through(fcL, fcR, ventral_pc),
                          "Through the facial colliculi and, ventrally, the caudal basilar pons 2.5 mm above the pontomedullary junction (the plate shows the abducens fibres crossing it).")
    oc = (olive["L"].V.mean(0) + olive["R"].V.mean(0)) / 2
    LEV["medulla-rostral"] = (oc, across(oc), "Through the middle of the olives (mid-height of the inferior olive), across the long axis.")
    gt = (centre("gracile-tubercle.L") + centre("gracile-tubercle.R")) / 2
    gt[1] = min(gt[1], OBEX[1] - 1.2)  # closed medulla: below the obex
    LEV["medulla-mid"] = (gt, across(gt), "Through the gracile and cuneate tubercles just below the obex (closed medulla), across the long axis.")
    dc = centre("pyramidal-decussation")
    LEV["medulla-caudal"] = (dc, across(dc), "Through the pyramidal decussation, across the long axis.")
    a_c, t_c, s_c = axis_at(y_at_arc(axis_at(dc[1])[2] - 7.0))
    LEV["cervicomedullary"] = (a_c, across(a_c), "Upper cervical cord, about 7 mm (along the axis) below the decussation.")
    LEV["midsagittal"] = (np.array([0, 1572.0, -12.0]), np.array([1.0, 0, 0]), "The median plane.")
    COUL = {"midbrain-sc": 10.12, "midbrain-ic": 3.20, "pons-mid": -17.09, "pons-caudal": -21.33, "medulla-rostral": -26.31, "medulla-mid": -36.87,
            "medulla-caudal": -42.20, "cervicomedullary": -51.70}
    levels = {}
    for lv, (p, n, why) in LEV.items():
        rec = {"p": [round(float(x) / 1000, 6) for x in p], "n": [round(float(x), 5) for x in n], "why": why}
        if lv != "midsagittal":
            # where the plane meets the axis, in mm from the PMJ along it
            best = min(range(len(ax)), key=lambda i: abs(np.dot(ax[i] - p, n)))
            s = arc[best] - s_pmj
            rec["axisMm"] = round(float(s), 1)
            rec["coulombeMm"] = COUL[lv]
            rec["coulombeScaledMm"] = round(COUL[lv] * scale, 1)
            # which parts it passes through
        cuts = []
        for q in parts:
            sd = (q["m"].V - p) @ n
            near = np.linalg.norm((q["m"].V - p) - np.outer(sd, n), axis=1) < 30
            if near.any() and (sd[near] > 0).any() and (sd[near] < 0).any():
                cuts.append(q["slug"])
        rec["cuts"] = sorted(set(cuts))
        rec["radius"] = 0.024 if lv != "midsagittal" else 0.05
        levels[lv] = rec

    # ---- export
    sc = trimesh.Scene()
    meta = []
    tot = 0
    for p in parts:
        m = p["m"]
        bad = ~np.isfinite(m.V).all(1)
        if bad.any():
            print("non-finite vertices in", p["id"], int(bad.sum()))
            m = m.faces(~bad[m.F].any(1))
            p["m"] = m
        tm = trimesh.Trimesh(m.V / 1000.0, m.F, vertex_normals=m.N, process=False)
        sc.add_geometry(tm, geom_name=p["id"], node_name=p["id"])
        tot += len(m.F)
        meta.append({k: v for k, v in {
            "id": p["id"], "slug": p["slug"], "name": p["name"], "kind": p["kind"], "side": p["side"],
            "approx": p["approx"] or None, "note": p["note"],
            "anchor": [round(float(x) / 1000, 6) for x in p["anchor"]],
        }.items() if v is not None})
    sc.export(TMP, include_normals=True)
    rel = lambda p: os.path.relpath(p, ROOT).replace(os.sep, "/")
    subprocess.run(" ".join(["npx", "--yes", "@gltf-transform/cli", "optimize", rel(TMP), rel(OUT_GLB), "--compress", "meshopt", "--texture-compress", "false",
                    "--simplify", "false", "--instance", "false", "--palette", "false", "--join", "false", "--flatten", "false"]), cwd=ROOT, check=True, shell=True,
                   stdout=subprocess.DEVNULL)
    out = {
        "version": 1,
        "file": "brainstem3d.glb",
        "bytes": os.path.getsize(OUT_GLB),
        "units": "metres, Z-Anatomy model space (+x = subject's left, +y up, +z anterior), the same space as gross.glb",
        "parts": meta,
        "levels": levels,
        "axis": [[round(float(a[0]) / 1000, 6), round(float(a[1]) / 1000, 6), round(float(a[2]) / 1000, 6)] for a in ax[::3]],
        "junctions": {"pmj": round(float(PMJ_y) / 1000, 6), "pomj": round(float(PoMJ_y) / 1000, 6), "obex": round(float(OBEX[1]) / 1000, 6),
                      "decussation": [round(dec_top / 1000, 6), round(dec_bot / 1000, 6)], "coulombeScale": round(float(scale), 3)},
        "sources": [
            "Z-Anatomy (CC BY-SA 4.0): every mesh; landmark patches are cut from its surfaces",
            "Course Lab 7 wet-specimen photos (anterior and posterior views; external-anterior / external-posterior plates): relative positions of the colliculi, facial colliculus, obex, area postrema, tubercles, olives, pyramids, nerve roots",
            "Sobotta 1909, figs. 647 (ventral), 659 (rhomboid fossa), 661 (lateral) - public domain",
            "Coulombe et al. 2021, Front. Neuroanat. 15:627656 (CC BY 4.0): plate distances from the pontomesencephalic junction, used to check the section planes and to place the pyramidal decussation",
        ],
    }
    json.dump(out, open(OUT_JSON, "w", encoding="utf8"), indent=1)
    print(f"{len(parts)} parts, {tot} faces, glb {os.path.getsize(OUT_GLB)} bytes; PMJ y {PMJ_y:.2f} PoMJ y {PoMJ_y:.2f} scale {scale:.3f} decussation {dec_top:.1f}-{dec_bot:.1f}")
    for lv, r in levels.items():
        print(f"  {lv:18s} p={[round(x*1000,1) for x in r['p']]} n={r['n']} axis {r.get('axisMm')} vs Coulombe scaled {r.get('coulombeScaledMm')}")


if __name__ == "__main__":
    main()
