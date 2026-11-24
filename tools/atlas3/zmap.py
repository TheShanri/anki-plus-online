"""Z-Anatomy space -> v3 (MNI ICBM 2009b) space.

The v2 atlas registered the template INTO the Z-Anatomy mesh space (tools/atlas/section_volume.py): a landmark affine
(_atlas/atlas2_build/registration.json) plus a smooth multi-channel demons warp (_atlas/section/warp_fine.npz) fitted on
the brain outline, cerebellum, brainstem, basal ganglia, thalamus, hippocampus, amygdala, ventricles and callosum. That
warp is defined on a Z-space grid and maps a Z point to its MNI position, which is exactly the direction needed to bring
Z-Anatomy objects (brainstem nuclei, cerebellar lobules, cranial nerves ...) into the v3 atlas.

  z_to_mni(P)   Z-Anatomy world metres (N x 3) -> MNI mm (N x 3)
  mni_to_z(M)    the inverse: MNI mm -> Z-Anatomy world metres (the frame of the Pathway tracer and Blood supply)
  mni_to_world  MNI mm -> v3 world metres (X = patient's left, Y = up, Z = anterior)
"""
import os, json
import numpy as np
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
_reg = json.load(open(os.path.join(ROOT, "_atlas/atlas2_build/registration.json")))
M_MNI2Z = np.array(_reg["mni_mm_to_zanat_m"])
M_Z2MNI = np.linalg.inv(M_MNI2Z)
_w = np.load(os.path.join(ROOT, "_atlas/section/warp_fine.npz"))
V = _w["v"].astype(np.float32)  # (3, nx, ny, nz) displacement in Z millimetres
STEP = float(_w["step"])  # metres
LO = np.load(os.path.join(ROOT, "_atlas/fill/origin.npy")).astype(float)


def z_to_mni(P):
    P = np.asarray(P, float)
    vi = ((P - LO) / STEP).T
    disp = np.stack([ndi.map_coordinates(c, vi, order=1, mode="nearest") for c in V]).T / 1000.0
    q = P + disp
    return q @ M_Z2MNI[:3, :3].T + M_Z2MNI[:3, 3]


M_MNI2Z_3 = M_MNI2Z[:3, :3]


def mni_to_z(mm, iters=30):
    """The inverse of z_to_mni: MNI mm (N x 3) -> Z-Anatomy world metres. z_to_mni(P) = A (P + d(P)) + t with a smooth
    displacement d, so P = A^-1 (m - t) - d(P), solved by fixed-point iteration (it converges: d varies slowly)."""
    mm = np.asarray(mm, float)
    q = (mm - M_Z2MNI[:3, 3]) @ np.linalg.inv(M_Z2MNI[:3, :3]).T  # = P + d(P)
    P = q.copy()
    for _ in range(iters):
        vi = ((P - LO) / STEP).T
        d = np.stack([ndi.map_coordinates(c, vi, order=1, mode="nearest") for c in V]).T / 1000.0
        P_new = q - d
        if np.abs(P_new - P).max() < 1e-7:
            P = P_new
            break
        P = P_new
    return P


def mni_to_world(mm):
    mm = np.asarray(mm, float)
    return np.stack([-mm[:, 0], mm[:, 2], mm[:, 1]], 1) / 1000.0


def world_to_mni(w):
    w = np.asarray(w, float) * 1000.0
    return np.stack([-w[:, 0], w[:, 2], w[:, 1]], 1)
