"""Atlas v3: work on the brainstem plates alone (bsnuclei.py) without the whole pipeline.

  BS_DUMP=1 tools/.venv/Scripts/python.exe -I tools/atlas3/labels.py    # once: the volume as the plates find it
  BS_DIAG=1 tools/.venv/Scripts/python.exe -I tools/atlas3/bsdev.py [KEY ...]

Carves into a copy of the dumped volume and prints, per structure, its volume on each side and what lies under its shape.
"""
import os, sys, json
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bsnuclei  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
W = os.path.join(ROOT, "_atlas/raw/v3")
K = np.load(os.path.join(W, "pre_plates.npy"))
meta = json.load(open(os.path.join(W, "pre_plates.json")))
KI, AFF = meta["KI"], np.array(meta["affine"])
for k in bsnuclei.IMPORT:  # structures added to the spec after the dump
    if k not in KI:
        KI[k] = max(KI.values()) + 1
only = sys.argv[1:]
if only:
    bsnuclei.ORDER = [k for k in bsnuclei.ORDER if k in only]
rep = bsnuclei.carve(K, KI, AFF)
x0 = AFF[0, 3]
xs = x0 + np.arange(K.shape[0]) * bsnuclei.VOX
for key in bsnuclei.ORDER:
    if key not in KI:
        continue
    m = K == KI[key]
    per_x = m.sum((1, 2))
    left = float(per_x[xs < 0].sum()) * bsnuclei.VOX ** 3
    right = float(per_x[xs > 0].sum()) * bsnuclei.VOX ** 3
    mid = float(per_x[xs == 0].sum()) * bsnuclei.VOX ** 3
    print(f"{key:5s} left {left:7.1f}  right {right:7.1f}  midline {mid:5.1f} mm3")
