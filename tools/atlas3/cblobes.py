"""Atlas v3: the cerebellar lobes, from Z-Anatomy's lobules.

The Allen atlas divides the cerebellar cortex only into zones (vermis, paravermis, lateral hemisphere). The lobes come from
Z-Anatomy's lobule surfaces (CC BY-SA 4.0; _atlas/raw/glb/s), carried into MNI space by zmap.py (the warp the v2 atlas fitted
on the cerebellum's outline among others): every Allen cortex voxel takes the lobe of the nearest lobule surface, so the
lobes follow the Allen folia while their borders (the primary and posterolateral fissures) follow Z-Anatomy's.

  zone x part -> leaf
  vermis       anterior lobe (I-V)  posterior lobe (VI-IX)  nodulus (X)
  paravermis   anterior lobe        posterior lobe          tonsil (IX)   flocculus (X)
  lateral      anterior lobe        posterior lobe          tonsil        flocculus

split(K, KI, AFF) rewrites the zone keys (CbV, CbPV, CbL) into these leaves in place and returns a report.
"""
import os
import numpy as np
import trimesh
from scipy.spatial import cKDTree

import zmap

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
GLB = os.path.join(ROOT, "_atlas/raw/glb/s")
VOX = 0.5

# Z-Anatomy object -> lobe part
PART = {
    "lingula-of-cerebellum": "ant", "central-lobule": "ant", "wing-of-central-lobule": "ant", "culmen": "ant",
    "anterior-quadrangular-lobule": "ant",
    "declive": "post", "posterior-quadrangular-lobule": "post", "folium-of-vermis": "post", "superior-semilunar-lobule": "post",
    "tuber-of-vermis": "post", "inferior-semilunar-lobule": "post", "gracile-lobule": "post", "pyramis-of-vermis": "post",
    "biventral-lobule": "post", "uvula-of-vermis": "post",
    "tonsil-of-cerebellum": "ton",
    "nodule-of-vermis": "nod",
    "flocculus": "floc", "peduncle-of-flocculus": "floc",
}
PARTS = ["ant", "post", "ton", "nod", "floc"]
# (zone, part) -> leaf key; the vermis has no tonsil or flocculus, the hemispheres no nodulus
LEAF = {
    ("CbV", "ant"): "CbVa", ("CbV", "post"): "CbVp", ("CbV", "ton"): "CbVp", ("CbV", "nod"): "Nod", ("CbV", "floc"): "Nod",
    ("CbPV", "ant"): "CbPVa", ("CbPV", "post"): "CbPVp", ("CbPV", "ton"): "TonPV", ("CbPV", "nod"): "CbPVp", ("CbPV", "floc"): "FlocPV",
    ("CbL", "ant"): "CbLa", ("CbL", "post"): "CbLp", ("CbL", "ton"): "TonL", ("CbL", "nod"): "CbLp", ("CbL", "floc"): "FlocL",
}


def lobule_points():
    pts, part = [], []
    for obj, p in PART.items():
        m = trimesh.load(os.path.join(GLB, obj + ".glb"), force="mesh")
        n = int(max(4000, m.area * 1e6 * 4))  # about four samples per mm2
        s, _ = trimesh.sample.sample_surface(m, n, seed=7)
        q = zmap.z_to_mni(np.vstack([np.asarray(m.vertices), s]))
        pts.append(q)
        part.append(np.full(len(q), PARTS.index(p), np.int8))
    return np.concatenate(pts), np.concatenate(part)


def split(K, KI, AFF, log=print):
    P, part = lobule_points()
    tree = cKDTree(P)
    zones = ["CbV", "CbPV", "CbL"]
    idx = np.argwhere(np.isin(K, [KI[z] for z in zones]))
    mni = idx * VOX + AFF[:3, 3]
    d, j = tree.query(mni, workers=-1)
    pp = part[j]
    zk = K[idx[:, 0], idx[:, 1], idx[:, 2]]
    report = dict(far_mm=round(float(np.percentile(d, 99)), 1))
    for z in zones:
        for pi, p in enumerate(PARTS):
            m = (zk == KI[z]) & (pp == pi)
            if not m.any():
                continue
            leaf = LEAF[(z, p)]
            K[idx[m, 0], idx[m, 1], idx[m, 2]] = KI[leaf]
            report[leaf] = report.get(leaf, 0) + round(float(m.sum()) * VOX ** 3, 1)
    log("cerebellar lobes (mm3):", report)
    return report
