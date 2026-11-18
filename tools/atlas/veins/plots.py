"""Check plots for build.py: orthographic projections of the brain points with the built veins (PIL only)."""
import os
import numpy as np
import ref

COL = {
    "sss": (30, 70, 210), "iss": (0, 150, 210), "straight": (200, 30, 30), "gcv": (230, 110, 0), "icv": (240, 160, 0), "basal": (150, 90, 0),
    "occipital": (190, 0, 190), "confluence": (0, 0, 0), "transverse": (0, 130, 0), "sigmoid": (210, 130, 0), "ijv": (40, 40, 40),
    "cavernous": (110, 0, 170), "sps": (120, 120, 0), "ips": (0, 120, 120), "intercavernous": (110, 0, 170),
    "scv": (60, 110, 230), "bridging": (230, 0, 120), "smcv": (0, 170, 170), "labbe": (120, 60, 200),
}


def render(V, gran, ica, outdir):
    os.makedirs(outdir, exist_ok=True)
    c = ref.context()
    tn = ref.mesh("tentorium-cerebelli")
    fx = ref.mesh("falx-cerebri")
    cc = ref.mesh("corpus-callosum")
    th = ref.mesh("thalamus")
    shots = [
        ("lateral", "lateral_L", ((-0.08, 0.08), (1.52, 1.72), (-0.11, 0.09)), None),
        ("superior", "superior", ((-0.08, 0.08), (1.52, 1.72), (-0.11, 0.09)), None),
        ("posterior", "posterior", ((-0.08, 0.08), (1.52, 1.72), (-0.11, 0.09)), None),
        ("inferior", "inferior", ((-0.08, 0.08), (1.52, 1.72), (-0.11, 0.09)), None),
        ("midline", "lateral_L", ((-0.01, 0.01), (1.54, 1.71), (-0.105, 0.085)), 0.005),
        ("deep", "lateral_L", ((-0.01, 0.01), (1.595, 1.66), (-0.06, 0.03)), 0.006),
        ("cav", "superior", ((-0.035, 0.035), (1.57, 1.61), (-0.01, 0.04)), None),
    ]
    for name, view, box, slab in shots:
        p = ref.Plot(view, box, 1100 if name in ("midline", "deep", "cav") else 900)
        for k, col in [("ctx_cerebrum", (222, 222, 222)), ("ctx_cerebellum", (205, 228, 205)), ("ctx_brainstem", (232, 212, 198))]:
            Vv = c[k].vertices
            if slab:
                Vv = Vv[np.abs(Vv[:, 0]) < slab]
            p.points(Vv, col, 1 if slab else 3, 1.0 if slab else 0.6)
        if slab:
            p.points(cc.vertices[np.abs(cc.vertices[:, 0]) < slab], (165, 165, 255), 1, 1.0)
            p.points(th.vertices, (255, 200, 200), 1, 0.8)
        p.points(fx.vertices, (240, 200, 120), 1, 0.5)
        T = tn.vertices
        p.points(T[np.abs(T[:, 0]) < slab] if slab else T, (150, 215, 150), 1, 0.5)
        for e in ica:
            p.line(e["pts"], (230, 60, 60), 3)
        for v in V:
            col = COL.get(v["id"], (0, 0, 0))
            wpx = max(1, int(round(v["r"].mean() * 2 * p.s)))
            p.line(v["pts"], col, wpx)
        for g in gran:
            p.points(np.array([g]), (255, 255, 255), 1, 1.5)
        p.save(os.path.join(outdir, f"veins_{name}.png"))
