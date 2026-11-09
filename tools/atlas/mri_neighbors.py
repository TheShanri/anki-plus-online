"""Vetted MRI-tab neighbours for public/atlas2/atlas2.json (replaces the neighbour lists from build_atlas2.py).
Problems with the old lists: whole-brain aggregates (thalamus, hippocampus, pons...) had NO neighbours, cortical gyri listed long
tracts (optic radiations, spinothalamic tract) and nested duplicates (broca-s-area, primary-somatosensory-cortex), and both
hemispheres were mixed. Here every structure is measured on one hemisphere (right half + midline) against structures of the same half,
nested/overlapping labels and long tracts are skipped (tracts only count for non-cortical subjects), and ranking is by gap, then contact.
Run (repo root):  tools/.venv/Scripts/python.exe -I tools/atlas/mri_neighbors.py [--vet] [--write]"""
import json, os, sys, numpy as np
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
P = os.path.join(ROOT, "public/atlas2/atlas2.json")
B = os.path.join(ROOT, "_atlas/atlas2_build")
at = json.load(open(P, encoding="utf8"))
S = at["structures"]
v1 = np.load(os.path.join(B, "vol1.npy"))[::2, ::2, ::2]
v2 = np.load(os.path.join(B, "vol2.npy"))[::2, ::2, ::2]
import nibabel as nb
AFF = nb.load(os.path.join(ROOT, "_atlas/raw/ahra/annotation_full.nii.gz")).affine.copy()
AFF[:3, :3] *= 2
# voxel -> MNI x
xs = (np.arange(v1.shape[0]) * AFF[0, 0] + AFF[0, 3])
half = (xs > -1.5)[:, None, None]  # right half (+ midline)

AGGREGATE = {"cerebellum", "brainstem", "basal-ganglia", "corpus-striatum", "lentiform-nucleus", "cerebellar-peduncles", "epithalamus", "internal-capsule",
             "projection-fibers", "association-fibers", "commissural-fibers", "olives", "pontine-protuberance", "pontine-nuclei"}
LONG_TRACTS = {"optic-radiations", "anterolateral-spinothalamic-tract", "medial-lemniscus", "medial-longitudinal-fasciculus", "association-fibers", "projection-fibers",
               "commissural-fibers", "longitudinal-fibers-of-the-pons", "transverse-fibers-of-the-pons", "internal-arcuate-fibers", "anterior-commissure"}
CORTEX = {"superior-frontal-gyrus", "middle-frontal-gyrus", "inferior-frontal-gyrus", "precentral-gyrus", "postcentral-gyrus", "superior-parietal-lobule", "inferior-parietal-lobule",
          "superior-temporal-gyrus", "middle-temporal-gyrus", "inferior-temporal-gyrus", "transverse-temporal-gyrus", "cingulate-gyrus", "parahippocampal-gyrus", "insular-cortex",
          "orbitofrontal-cortex", "primary-motor-cortex", "primary-somatosensory-cortex", "broca-s-area", "primary-auditory-cortex", "anterior-cingulate-cortex",
          "dorsolateral-prefrontal-cortex", "ventromedial-prefrontal-cortex"}
DEEP_FOR_CORTEX = {"inferior-horn-of-lateral-ventricle", "body-of-lateral-ventricle", "atrium-of-lateral-ventricle", "anterior-horn-of-lateral-ventricle", "posterior-horn-of-lateral-ventricle",
                   "lateral-ventricle", "pulvinar", "thalamus"}

masks = {}
for k, s in S.items():
    m = np.zeros(v1.shape, bool)
    if s.get("labels"): m |= np.isin(v1, s["labels"])
    if s.get("tracts"): m |= np.isin(v2, s["tracts"])
    m &= half
    if m.sum() >= 3: masks[k] = m
sz = {k: int(m.sum()) for k, m in masks.items()}
idxs = {k: np.flatnonzero(m) for k, m in masks.items()}  # flat voxel indices: pair tests then cost only the size of the other structure


def neighbours(k):
    dk = ndi.distance_transform_edt(~masks[k], sampling=1.0).astype(np.float32).ravel()
    mk = masks[k].ravel()
    rows = []
    for o, m in masks.items():
        if o == k or o in AGGREGATE and k not in AGGREGATE and False:
            continue
        if mk[idxs[o]].sum() > 0.05 * min(sz[k], sz[o]):
            continue  # nested / enclosing / duplicate label
        if o in AGGREGATE:
            continue
        if k in CORTEX and (o in LONG_TRACTS or o in DEEP_FOR_CORTEX):
            continue
        if o in LONG_TRACTS and k not in LONG_TRACTS and sz[o] > 4000:
            continue  # a long tract passes near everything
        d = dk[idxs[o]]
        gap = float(d.min())
        if gap > 4:
            continue
        contact = int((d <= 2).sum())
        rows.append((round(gap), -contact, o))
    rows.sort()
    return [o for _, _, o in rows[:8]]


out = {k: neighbours(k) for k in masks if k not in AGGREGATE}
if "--vet" in sys.argv:
    for k in ["middle-temporal-gyrus", "precentral-gyrus", "angular-gyrus", "cingulate-gyrus", "thalamus", "hippocampus", "amygdala", "caudate-nucleus", "putamen", "globus-pallidus",
              "hypothalamus", "pons", "midbrain", "medulla", "red-nucleus", "substantia-nigra", "dentate-nucleus", "inferior-olivary-nucleus", "fourth-ventricle", "lateral-ventricle",
              "corpus-callosum", "fornix", "superior-colliculus", "nucleus-accumbens", "insular-cortex", "orbitofrontal-cortex"]:
        if k in out: print(f"{k}: OLD {', '.join(S[k].get('neighbors', [])[:6]) or '-'} | NEW {', '.join(out[k][:6]) or '-'}")
if "--write" in sys.argv:
    for k, s in S.items(): s["neighbors"] = out.get(k, [])
    json.dump(at, open(P, "w", encoding="utf8"), separators=(",", ":"), ensure_ascii=False)
    print("written", len(out))
