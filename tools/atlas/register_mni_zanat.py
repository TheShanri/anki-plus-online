"""Fit an affine MNI(ICBM2009b, mm) -> Z-Anatomy (glTF metres, Y-up) on landmark structures present in both.
Run: tools/.venv/Scripts/python.exe -I tools/atlas/register_mni_zanat.py
Writes _atlas/atlas2_build/registration.json (4x4 row-major, mm->m) and prints residuals."""
import json, os, numpy as np, nibabel as nb, trimesh
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
os.makedirs(os.path.join(ROOT, '_atlas/atlas2_build'), exist_ok=True)
ahra = nb.load(os.path.join(ROOT, "_atlas/raw/ahra/annotation_full.nii.gz"))
A0 = np.asarray(ahra.dataobj); aff = ahra.affine
_nz = np.nonzero(A0); LAB = A0[_nz]; IJK = np.c_[_nz]; del A0
# (landmark, AHRA ids, Z-Anatomy glb, paired)
LM = [
 ("caudate", [10335,10336,10337], "caudate-nucleus", 1),
 ("putamen", [10338,146034754], "putamen", 1),
 ("globus pallidus", [10343,10344], "globus-pallidus", 1),
 ("thalamus", [10390], "thalamus", 1),
 ("hippocampus", [12171,12173,12174], "hippocampus", 1),
 ("amygdala", [10361], "amygdaloid-body", 1),
 ("lateral ventricle", [10597,10598,266441657,10599,10600], "lateral-ventricle", 1),
 ("habenula", [10452], "habenula", 1),
 ("fornix", [10576], "fornix", 1),
 ("third ventricle", [10602], "third-ventricle", 0),
 ("fourth ventricle", [12805], "fourth-ventricle", 0),
 ("corpus callosum", [10561], "corpus-callosum", 0),
 ("hypothalamus", [10467,10468,10473,10483,10495], "hypothalamus", 1),
 ("pons", [12405,12416], "pons", 0),
 ("medulla", [12535,12538,12600], "medulla-oblongata", 0),
 ("superior frontal gyrus", [12115], "superior-frontal-gyrus", 1),
 ("precentral gyrus", [12114], "precentral-gyrus", 1),
 ("cuneus", [12150], "cuneus", 1),
 ("lingual gyrus", [12151], "lingual-gyrus", 1),
]
def mni_c(ids, side):
    ijk = IJK[np.isin(LAB, ids)]
    xyz = nib_apply(ijk)
    if side == 1: xyz = xyz[xyz[:,0] > 0]
    elif side == -1: xyz = xyz[xyz[:,0] < 0]
    return xyz.mean(0)
def nib_apply(ijk): return ijk @ aff[:3,:3].T + aff[:3,3]
def z_c(name, side):
    sc = trimesh.load(os.path.join(ROOT, "_atlas/raw/glb/s", name + ".glb"), force="scene")
    v = np.concatenate([g.vertices for g in sc.dump()]) if hasattr(sc, "dump") else sc.vertices
    if side == 1: v = v[v[:,0] > 0]
    elif side == -1: v = v[v[:,0] < 0]
    return v.mean(0)
P, Q, names = [], [], []
for nm, ids, z, paired in LM:
    if paired:
        for s in (1, -1):
            # Z-Anatomy x sign vs MNI x sign unknown: pair MNI +x with Z +x first, test flip later
            P.append(mni_c(ids, s)); Q.append(z_c(z, s)); names.append(f"{nm} {'+x' if s>0 else '-x'}")
    else:
        P.append(mni_c(ids, 0)); Q.append(z_c(z, 0)); names.append(nm)
P = np.array(P); Q = np.array(Q)
np.savez(os.path.join(ROOT, '_atlas/atlas2_build/landmarks.npz'), P=P, Q=Q, names=np.array(names))
def fit(P, Q, w=None):
    X = np.c_[P, np.ones(len(P))]
    M, *_ = np.linalg.lstsq(X, Q, rcond=None)
    return M  # 4x3
def resid(M, P, Q): return np.linalg.norm(np.c_[P, np.ones(len(P))] @ M - Q, axis=1)
# Final transform uses the central landmarks only: cortex/fornix/caudate/corpus callosum differ in shape and definition
# between the BodyParts3D-derived Z-Anatomy brain and the MNI brain (centroid residuals 7-13 mm), which an affine cannot absorb.
EXCL = ("fornix", "superior frontal", "precentral", "lingual", "cuneus", "caudate", "corpus")
use = np.array([not any(e in n for e in EXCL) for n in names])
M_all = fit(P, Q); r_all = resid(M_all, P, Q) * 1000
M = fit(P[use], Q[use]); r_all_pts = resid(M, P, Q) * 1000
r_m = r_all_pts[use]
loo = []
idx = np.where(use)[0]
for i in idx:
    k = use.copy(); k[i] = False
    Mi = fit(P[k], Q[k]); loo.append(resid(Mi, P[i:i+1], Q[i:i+1])[0] * 1000)
print("affine (rows: x,y,z,1 -> X,Y,Z m)"); print(M)
print("scales m/mm:", np.linalg.svd(M[:3,:3])[1], "det", np.linalg.det(M[:3,:3]))
for n, a, u in zip(names, r_all_pts, use): print(f"  {n:34s} resid {a:5.1f} mm  {'(fitted)' if u else '(excluded from fit)'}")
print(f"central fit: n={use.sum()} RMS {np.sqrt((r_m**2).mean()):.2f} mm  max {r_m.max():.1f}  leave-one-out RMS {np.sqrt((np.array(loo)**2).mean()):.2f}; all-landmark affine RMS {np.sqrt((r_all**2).mean()):.2f} mm")
os.makedirs(os.path.join(ROOT, "_atlas/atlas2_build"), exist_ok=True)
T = np.eye(4); T[:3,:3] = M[:3,:].T; T[:3,3] = M[3,:]
json.dump({"mni_mm_to_zanat_m": T.tolist(), "rms_mm": float(np.sqrt((r_m**2).mean())), "loo_rms_mm": float(np.sqrt((np.array(loo)**2).mean())), "max_mm": float(r_m.max()), "n": int(use.sum()), "all_landmarks_rms_mm": float(np.sqrt((r_all**2).mean())), "landmarks": [n for n,u in zip(names,use) if u]}, open(os.path.join(ROOT, "_atlas/atlas2_build/registration.json"), "w"), indent=1)
