"""Atlas v3: the cranial nerves, from Z-Anatomy (CC BY-SA 4.0), carried into MNI space by zmap.py.

Z-Anatomy draws each nerve from its nucleus through the brainstem to the periphery. The atlas keeps the part a brain atlas
shows: from where the nerve leaves the brain (its first voxels outside the brain that touch the brainstem, or the optic
chiasm) along the nerve for its cisternal length (geodesic, through the nerve's own voxels only), which ends about where
it enters its foramen. Only voxels outside the brain are taken, so the nerves never change the brain itself, and a part
of a nerve that the warp lays across other tissue is simply not kept (it is not connected to the root).

add(K, ids_of, AFF, keys) writes the nerves into K (labels outside the brain) and returns a report.
"""
import os
import numpy as np
import trimesh
from scipy import ndimage as ndi

import zmap

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
GLB = os.path.join(ROOT, "_atlas/raw/glb/s")
VOX = 0.5

BRAINSTEM = ["MTg", "mRt", "PnBa", "PnTg", "PnO", "MoTg", "BSW", "CPd", "Py", "IO", "SC", "ICo", "SCP", "MCP", "ICP", "PAG",
             "SN", "LC", "ML", "MLF", "IPF", "ALS", "DSCT", "Sp5", "VCx", "LFP", "PyX", "Gr", "Cu"]
# key: (Z-Anatomy objects, cisternal length in mm, where it leaves the brain)
NERVES = {
    "CN2": (["optic-nerve-ii"], 18.0, ["OCh"]),
    "CN3": (["oculomotor-nerve-iii"], 24.0, BRAINSTEM),
    "CN4": (["trochlear-nerve-iv"], 36.0, BRAINSTEM),
    "CN5": (["trigeminal-nerve-v", "sensory-root-of-trigeminal-nerve", "motor-root-of-trigeminal-nerve"], 20.0, BRAINSTEM),
    "CN6": (["abducens-nerve-vi"], 22.0, BRAINSTEM),
    "CN7": (["facial-nerve-vii"], 16.0, BRAINSTEM),
    "CN8": (["vestibulocochlear-nerve-viii", "cochlear-nerve", "vestibular-nerve"], 16.0, BRAINSTEM),
    "CN9": (["glossopharyngeal-nerve-ix"], 18.0, BRAINSTEM),
    "CN10": (["vagus-nerve-x"], 18.0, BRAINSTEM),
    "CN12": (["hypoglossal-nerve-xii"], 15.0, BRAINSTEM),
}


def voxelize(objs, AFF, shape):
    """The nerve's voxels (indices into the atlas grid), both sides."""
    out = []
    for obj in objs:
        m = trimesh.load(os.path.join(GLB, obj + ".glb"), force="mesh")
        q = trimesh.Trimesh(vertices=zmap.z_to_mni(np.asarray(m.vertices)), faces=np.asarray(m.faces), process=False)
        for part in q.split(only_watertight=False):
            vg = part.voxelized(pitch=VOX)
            try:
                vg = vg.fill()
            except Exception:
                pass
            out.append(np.asarray(vg.points))
    if not out:
        return np.zeros((0, 3), int)
    idx = np.round((np.concatenate(out) - AFF[:3, 3]) / VOX).astype(int)
    ok = np.all((idx >= 0) & (idx < np.array(shape)), 1)
    return np.unique(idx[ok], axis=0)


def add(K, ids_of, AFF, keys, log=print):
    """keys: nerve key -> label id to write. ids_of(key) -> the label ids of an atlas key (any side)."""
    report = {}
    s26 = ndi.generate_binary_structure(3, 3)
    for key, (objs, length, at) in NERVES.items():
        if key not in keys:
            continue
        idx = voxelize(objs, AFF, K.shape)
        if not len(idx):
            log(f"  {key}: no voxels")
            continue
        lo = np.maximum(idx.min(0) - 3, 0)
        hi = np.minimum(idx.max(0) + 4, K.shape)
        sub = K[lo[0]:hi[0], lo[1]:hi[1], lo[2]:hi[2]]
        nerve = np.zeros(sub.shape, bool)
        nerve[tuple((idx - lo).T)] = True
        cand = nerve & (sub == 0)
        hosts = np.isin(sub, [i for k in at for i in ids_of(k)])
        seed = cand & ndi.binary_dilation(hosts, s26)
        kept = np.zeros_like(cand)
        if not seed.any() and hosts.any():
            # the warp left a small gap between the nerve and where it leaves the brain (the optic nerve under the
            # chiasm): the nerve's nearest voxels are joined to their nearest host voxel by a bridge, up to 3 mm long
            dh, ih = ndi.distance_transform_edt(~hosts, sampling=VOX, return_indices=True)
            near = cand & (dh <= 3.0)
            if near.any():
                seed = near & (dh <= dh[near].min() + 0.75)
                bridge = np.zeros_like(cand)
                for p in np.argwhere(seed):
                    q = ih[:, p[0], p[1], p[2]]
                    for t in np.linspace(0.0, 1.0, 9):
                        bridge[tuple(np.round(p + t * (q - p)).astype(int))] = True
                kept |= ndi.binary_dilation(bridge, s26) & (sub == 0)
        if seed.any():
            # grow along the nerve from where it leaves the brain, about 0.5 mm per step
            front = seed.copy()
            kept |= seed
            for _ in range(int(round(length / VOX))):
                front = ndi.binary_dilation(front, s26) & cand & ~kept
                if not front.any():
                    break
                kept |= front
        sub[kept] = keys[key]
        report[key] = round(float(kept.sum()) * VOX ** 3, 1)
        log(f"  {key:5s} {report[key]:7.1f} mm3 (of {float(cand.sum()) * VOX ** 3:.0f} mm3 of nerve outside the brain)")
    return report
