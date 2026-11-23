"""Atlas v3, step 1: the label volume (ICBM 2009b nonlinear symmetric, 0.5 mm, the Allen grid).

One integer volume is the single source of truth: every 3D surface (mesh.py) and every cut face of the viewer come
from it, so neighbouring structures share their boundaries exactly (no gaps, no overlaps).

Sources (licences verified, see docs/ATLAS_V3.md):
  Allen Human Reference Atlas 3D 2020 v1.0.0, annotation_full.nii.gz (CC BY 4.0)       every "ahra:" row of spec.py
  _atlas/atlas2_build/vol1.npy (tools/atlas/build_atlas2.py, same grid)              "v1:" rows: internal capsule
       limbs, corona radiata, centrum semiovale, corpus callosum / fornix parts, periaqueductal grey, and the Harvard
       Ascending Arousal Network v2.0 nuclei (CC0) as "aan:" rows
  _atlas/atlas2_build/vol2.npy (HCP-842 80-bundle atlas, CC BY 4.0)                    "hcp:" rows (ML, MLF)
Derived here (documented at each step): fimbria, rostrum of the corpus callosum, interthalamic adhesion, septum
pellucidum, choroid plexus, optic chiasm, suprachiasmatic nucleus, posterior commissure, external and extreme capsules,
cerebellar white matter, the dentate / interposed / fastigial split of the Allen deep cerebellar nuclei.

Then: left/right split at the midline, a closed cortical shell (no white matter on the outer cerebral surface), holes
inside the brain filled, specks (< MIN_PART voxels) merged into their surroundings.

Output: _atlas/raw/v3/labels.npy (uint16, Allen grid) and _atlas/raw/v3/labels.json (label table).
Run (repo root): tools/.venv/Scripts/python.exe -I tools/atlas3/labels.py
"""
import os, sys, json, time, csv
import numpy as np
import nibabel as nib
from scipy import ndimage as ndi

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from spec import ROWS, BY_KEY, KEYS  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RAW = os.path.join(ROOT, "_atlas/raw")
OUT = os.path.join(RAW, "v3")
os.makedirs(OUT, exist_ok=True)
VOX = 0.5
MIN_PART = 24  # voxels (3 mm^3): smaller islands of a label merge into their neighbours
T0 = time.time()


def log(*a):
    print(f"[{time.time() - T0:6.1f}s]", *a, flush=True)


try:
    os.nice(5)  # noqa
except Exception:
    pass

ann = nib.load(os.path.join(RAW, "ahra/annotation_full.nii.gz"))
A = np.asarray(ann.dataobj).astype(np.int32)
AFF = ann.affine
SHAPE = A.shape
AC = {}
for r in csv.DictReader(open(os.path.join(RAW, "ahra/vc.csv"), encoding="utf8")):
    if r["annotated"] == "True":
        AC[r["acronym"]] = int(r["id"])
xs = np.arange(SHAPE[0]) * VOX + AFF[0, 3]
ys = np.arange(SHAPE[1]) * VOX + AFF[1, 3]
zs = np.arange(SHAPE[2]) * VOX + AFF[2, 3]
X0 = int(round(-AFF[0, 3] / VOX))  # the voxel column at x = 0
log("Allen grid", SHAPE, "midline column", X0)

# ------------------------------------------------------------------ 1. leaf keys (before the left/right split)
KI = {k: i + 1 for i, k in enumerate(KEYS)}  # 0 = outside / sulcal fluid
K = np.zeros(SHAPE, np.uint16)
used = set()
for r in ROWS:
    if not r["src"].startswith("ahra:"):
        continue
    for acr in r["src"][5:].split(","):
        if acr not in AC:
            raise SystemExit(f"unknown Allen acronym {acr}")
        K[A == AC[acr]] = KI[r["key"]]
        used.add(AC[acr])
present = set(np.unique(A).tolist()) - {0}
left = sorted(a for a, i in AC.items() if i in present - used)
log("Allen labels without a v3 row:", left or "none")


def m(*keys):
    return np.isin(K, [KI[k] for k in keys])


# atlas2 volumes on the same grid
a2 = json.load(open(os.path.join(ROOT, "public/atlas2/atlas2.json")))
v1 = np.load(os.path.join(ROOT, "_atlas/atlas2_build/vol1.npy"), mmap_mode="r")
v2 = np.load(os.path.join(ROOT, "_atlas/atlas2_build/vol2.npy"), mmap_mode="r")
k1 = {l["key"]: l["id"] for l in a2["leaf1"]}
k2 = {l["key"]: l["id"] for l in a2["leaf2"]}
fwm0 = m("FWM")
for r in ROWS:
    s = r["src"]
    if s.startswith("v1:") or s.startswith("aan:"):
        mk = np.asarray(v1 == k1[s.split(":")[1]])
        if r["key"] in ("ICa", "ICg", "ICp", "CR", "CSO"):
            mk &= fwm0  # white-matter subdivisions only take white matter
        if r["key"] in ("CCg", "CCb", "CCs"):
            mk &= (A == AC["cc"])
        if r["key"] in ("FXc", "FXb", "FXr"):
            mk &= (A == AC["fx"])
        K[mk] = KI[r["key"]]
del fwm0
# Allen corpus callosum voxels outside atlas2's three parts take the nearest part (no holes in the callosum)
ccA = A == AC["cc"]
rest = ccA & ~m("CCg", "CCb", "CCs")
if rest.any():
    parts = m("CCg", "CCb", "CCs")
    nzc = np.argwhere(ccA)
    bb = tuple(slice(int(a) - 2, int(b) + 3) for a, b in zip(nzc.min(0), nzc.max(0)))
    _, ind = ndi.distance_transform_edt(~parts[bb], return_indices=True)
    sub, rr = K[bb], rest[bb]
    sub[rr] = sub[tuple(i[rr] for i in ind)]
    del ind, parts
log("corpus callosum voxels outside the atlas2 parts:", int(rest.sum()))
del ccA, rest
teg = m("MTg", "PnTg", "MoTg", "mRt", "PnO")
for k in ("ML", "MLF"):
    K[np.asarray(v2 == k2[k]) & teg] = KI[k]
del teg, v1, v2
# the mirrored annotation leaves the midline column empty where both neighbours agree (vermis, medial cortex): fill it
a_, b_ = K[X0 - 1], K[X0 + 1]
fix = (K[X0] == 0) & (a_ == b_) & (a_ > 0) & (A[X0] != 0) | ((K[X0] == 0) & (a_ == b_) & np.isin(a_, [KI["CbV"], KI["V3"], KI["Aq"], KI["V4"], KI["PnBa"], KI["PnTg"], KI["MoTg"]]))
K[X0][fix] = a_[fix]
log("sources composed; midline column fixed", int(fix.sum()))

# ------------------------------------------------------------------ 2. derived structures (central crop)
C = tuple(slice(int((a - AFF[i, 3]) / VOX), int((b - AFF[i, 3]) / VOX)) for i, (a, b) in enumerate(((-62, 62), (-100, 66), (-60, 50))))
Kc = K[C]  # view
X = xs[C[0]][:, None, None]
Y = ys[C[1]][None, :, None]
Z = zs[C[2]][None, None, :]
x0 = int(round(-xs[C[0]][0] / VOX))
Ac = A[C]


def mc(*keys):
    return np.isin(Kc, [KI[k] for k in keys])


def dist(mask):
    return ndi.distance_transform_edt(~mask, sampling=VOX)


# fornix: Allen "fx" in four parts. Fimbria: along the hippocampus (below z = -4 mm and over 14 mm from the midline);
# columns: in front of the thalamus and below its top (they arch down behind the anterior commissure); crus: behind
# y = -22 mm; body: the rest (where atlas2's split exists it is kept, the fimbria is new)
fx = Ac == AC["fx"]
thal = mc("ANC", "MD", "VA", "LD", "MiN", "THM", "VL", "LP", "Pul", "CM", "VPL", "VPM")
ty = np.argwhere(thal)
y_ant = ty[:, 1].max() * VOX + ys[C[1]][0]
z_top = np.percentile(ty[:, 2], 90) * VOX + zs[C[2]][0]
fim = fx & (Z < -4) & (np.abs(X) > 14)  # (empty in the Allen labels: no fimbria row)
col = fx & ~fim & (Y > y_ant - 3) & (Z < z_top)
crus = fx & ~fim & ~col & (Y < -22)
body = fx & ~fim & ~col & ~crus
Kc[col] = KI["FXc"]; Kc[crus] = KI["FXr"]; Kc[body] = KI["FXb"]
log(f"fornix: columns {int(col.sum())} body {int(body.sum())} crus {int(crus.sum())} fimbria {int(fim.sum())}")

# corpus callosum: Witelson-style fifths from atlas2 (genu, body, splenium); the rostrum is the thin limb that turns
# back and down from the genu: callosal voxels behind (>= 4 mm) and below (>= 4 mm) the most anterior midline point
cc = mc("CCg", "CCb", "CCs")
mid = np.argwhere(cc[x0 - 4:x0 + 5])
yy = mid[:, 1] * VOX + ys[C[1]][0]
zz = mid[:, 2] * VOX + zs[C[2]][0]
apex = np.argmax(yy)
ya, za = yy[apex], zz[apex]
ros = cc & mc("CCg") & (Y < ya - 4) & (Z < za - 4)
Kc[ros] = KI["CCr"]
log(f"corpus callosum apex y {ya:.1f} z {za:.1f}: rostrum {int(ros.sum())}")

# interthalamic adhesion: thalamic grey within 1 mm of the midline (bridging the third ventricle)
ia = thal & (np.abs(X) <= 1.0)
Kc[ia] = KI["IA"]
log("interthalamic adhesion", int(ia.sum()))

# septum pellucidum: the midline sheet between the two lateral ventricles (white, septal or unlabelled voxels within
# 2 mm of the midline with a lateral ventricle within 3 mm on both sides)
lv = mc("aLV", "bLV", "xLV", "pLV", "iLV")
dLl = ndi.distance_transform_edt(~(lv & (X < 0)), sampling=VOX)
dLr = ndi.distance_transform_edt(~(lv & (X > 0)), sampling=VOX)
sp = (np.abs(X) <= 2.0) & (dLl <= 3.0) & (dLr <= 3.0) & (mc("FWM", "SEP", "CR") | (Kc == 0))
Kc[sp] = KI["SP"]
del dLl, dLr
log("septum pellucidum", int(sp.sum()))

# choroid plexus: in the choroid fissure of each lateral ventricle, the cleft between the fornix / fimbria and the
# thalamus (body), crus (atrium) or hippocampus (inferior horn): fluid voxels within 2.5 mm of the fornix and 4 mm of
# the thalamus or 3 mm of the hippocampus (not in the anterior horn)
fxall = mc("FXc", "FXb", "FXr")
cp = lv & (dist(fxall) <= 2.5) & ((dist(thal) <= 4.0) | (dist(mc("HiH", "HiB", "HiT")) <= 3.0)) & ~mc("aLV")
cp = ndi.binary_opening(cp, iterations=1)
Kc[cp] = KI["CP"]
log("choroid plexus", int(cp.sum()))

# optic chiasm: the optic tracts meet at the midline (the Allen tracts stop short): bridge them within 8 mm
och = mc("OT") & (np.abs(X) <= 8.0)
bridge = ndi.binary_closing(och, structure=np.ones((13, 1, 1), bool)) & (np.abs(X) <= 8.0)
Kc[bridge & ((Kc == 0) | mc("OT", "HTpo", "HTso", "FWM"))] = KI["OCh"]
ocm = mc("OCh")
log("optic chiasm", int(ocm.sum()))

# suprachiasmatic nucleus: a small paired nucleus on the dorsal surface of the chiasm beside the third ventricle:
# hypothalamic voxels within 1.5 mm of the chiasm and 0.5 to 2.5 mm from the midline
scn = mc("HTpo", "HTso") & (dist(ocm) <= 1.5) & (np.abs(X) >= 0.5) & (np.abs(X) <= 2.5)
Kc[scn] = KI["SCN"]
log("suprachiasmatic nucleus", int(scn.sum()))

# posterior commissure: midline white or unlabelled voxels within 2 mm of the aqueduct / third ventricle junction and
# of the pretectum / pineal / habenula, within 3.5 mm of the superior colliculus
pc = (np.abs(X) <= 4.5) & (dist(mc("Aq")) <= 2.0) & (dist(mc("PTR", "Pin", "HN")) <= 2.0) & (dist(mc("SC")) <= 3.5) & (mc("FWM", "PTR", "MTg") | (Kc == 0))
Kc[pc] = KI["PC"]
log("posterior commissure", int(pc.sum()))

# external capsule (putamen | claustrum) and extreme capsule (claustrum | insula): white matter in each gap
wm = mc("FWM", "CR")
dPu, dCl, dIn = dist(mc("Pu")), dist(mc("Cla")), dist(mc("SIG", "LIG", "LI", "FI", "TI"))
ec = wm & (dPu <= 4.0) & (dCl <= 4.0) & (dPu <= dIn)
exc = wm & (dCl <= 3.0) & (dIn <= 3.0) & (dIn < dPu)
Kc[ec] = KI["EC"]; Kc[exc] = KI["ExC"]
del dPu, dCl, dIn
log(f"external capsule {int(ec.sum())} extreme capsule {int(exc.sum())}")

# cerebellum: Allen hindbrain white matter inside the closed cerebellum is the arbor vitae (cerebellar white matter)
cbm = mc("CbV", "CbPV", "CbL", "DN")
ball = lambda r: (np.add.outer(np.add.outer(np.arange(-r, r + 1) ** 2, np.arange(-r, r + 1) ** 2), np.arange(-r, r + 1) ** 2) <= r * r)
cbc = ndi.binary_fill_holes(ndi.binary_closing(np.pad(cbm, 6), ball(5))[6:-6, 6:-6, 6:-6])
Kc[mc("BSW") & cbc & ~mc("SCP", "MCP", "ICP")] = KI["CbW"]
# deep cerebellar nuclei: the Allen label is one blob per side; dentate is lateral (> 10.5 mm), the interposed nuclei
# between, the fastigial nucleus beside the midline in the roof of the fourth ventricle (< 6.5 mm)
dn = mc("DN")
Kc[dn & (np.abs(X) < 10.5)] = KI["IPN"]
Kc[dn & (np.abs(X) < 6.5)] = KI["FN"]
ax = np.abs(np.argwhere(dn)[:, 0] * VOX + xs[C[0]][0])
log(f"deep nuclei |x| {ax.min():.1f}..{ax.max():.1f} mm: dentate {int((ax >= 10.5).sum())} interposed {int(((ax < 10.5) & (ax >= 6.5)).sum())} fastigial {int((ax < 6.5).sum())}")
# forebrain white matter left as thin rims inside the brainstem: the nearest brainstem part
bsk = ["MTg", "PnTg", "MoTg", "PnBa", "Py", "IO", "CPd", "SN", "RN", "PAG", "SC", "ICo", "SCP", "MCP", "ICP", "BSW", "Aq", "V4", "LC", "DR", "MnR", "VTA", "LDTg", "mRt", "PBC", "PnO", "PTg", "ML", "MLF"]
bs = mc(*bsk)
rim = mc("FWM") & (Z < -8) & (dist(bs) <= 1.6)
if rim.any():
    _, ind = ndi.distance_transform_edt(~bs, return_indices=True)
    Kc[rim] = Kc[tuple(i[rim] for i in ind)]
    del ind
log("brainstem rims re-assigned", int(rim.sum()))
del Kc, Ac, thal, lv, cbc, bs

# ------------------------------------------------------------------ 3. holes, closed cortical shell, specks
CTX = [r["key"] for r in ROWS if r["tissue"] == "ctx"]
WMK = ["FWM", "CR", "CSO", "EC", "ExC"]
nz = np.argwhere(K > 0)
B = tuple(slice(max(int(a) - 3, 0), min(int(b) + 4, s)) for a, b, s in zip(nz.min(0), nz.max(0), SHAPE))
del nz
Kb = K[B]  # view on the brain's box
brain = Kb > 0
# holes: unlabelled voxels enclosed by the brain take the nearest label
filled = ndi.binary_fill_holes(brain)
holes = filled & ~brain
if holes.any():
    _, ind = ndi.distance_transform_edt(~brain, return_indices=True)
    Kb[holes] = Kb[tuple(i[holes] for i in ind)]
    del ind
log("holes filled", int(holes.sum()))
del filled, holes
# closed cortical shell: cerebral white matter must not touch the outside (sulcal fluid included) where cortex lies
# within 3 mm: such voxels take the cortex label found by growing the cortex outwards voxel by voxel (6 steps).
# White matter far from any cortex (the ventral forebrain surface) is a real exposure and stays.
ctx_lab = np.where(np.isin(Kb, [KI[k] for k in CTX]), Kb, 0).astype(np.uint16)
grown = ctx_lab.copy()
for _ in range(6):
    g = ndi.grey_dilation(grown, size=(3, 3, 3))
    grown = np.where(grown == 0, g, grown)
del g
out = ~(Kb > 0)
touch = ndi.binary_dilation(out, structure=ndi.generate_binary_structure(3, 1)) & np.isin(Kb, [KI[k] for k in WMK]) & (grown > 0)
Kb[touch] = grown[touch]
log(f"cortical shell: {int(touch.sum())} white-matter voxels on the surface became cortex")
left_wm = ndi.binary_dilation(out, structure=ndi.generate_binary_structure(3, 1)) & np.isin(Kb, [KI[k] for k in WMK])
log(f"white matter still on the surface (no cortex within 3 mm): {int(left_wm.sum())} voxels")
del ctx_lab, grown, out, touch, left_wm, brain, Kb


# specks: islands smaller than MIN_PART voxels merge into the most common neighbouring label
def despeck(K):
    n_fixed = 0
    objs = ndi.find_objects(K)
    for lab, sl in enumerate(objs, start=1):
        if sl is None:
            continue
        sl = tuple(slice(max(s.start - 2, 0), s.stop + 2) for s in sl)
        sub = K[sl]
        mk = sub == lab
        cc, n = ndi.label(mk, structure=ndi.generate_binary_structure(3, 1))
        if n <= 1:
            continue
        sizes = np.bincount(cc.ravel(), minlength=n + 1)[1:]
        keep = int(np.argmax(sizes)) + 1
        small = set((np.nonzero(sizes < MIN_PART)[0] + 1).tolist()) - {keep}
        if not small:
            continue
        for j, isl_sl in enumerate(ndi.find_objects(cc), start=1):
            if j not in small or isl_sl is None:
                continue
            bb = tuple(slice(max(s.start - 1, 0), s.stop + 1) for s in isl_sl)
            isl = cc[bb] == j
            ring = ndi.binary_dilation(isl) & ~isl
            box = sub[bb]
            vals = box[ring]
            vals = vals[vals != lab]
            box[isl] = np.bincount(vals).argmax() if len(vals) else 0
            n_fixed += int(isl.sum())
    return n_fixed


log("specks merged (pre-split)", despeck(K))

# ------------------------------------------------------------------ 4. left / right split
names, rows_out = [], []
SIDE = np.where(xs < 0, 0, 1)  # MNI x < 0 is the patient's left; the x = 0 column goes right
LUT = np.zeros((len(KEYS) + 1, 2), np.uint16)
for k in KEYS:
    r = BY_KEY[k]
    if r["side"] == "M":
        rows_out.append(dict(key=k, side="M"))
        LUT[KI[k], :] = len(rows_out)
    else:
        rows_out.append(dict(key=k, side="L")); LUT[KI[k], 0] = len(rows_out)
        rows_out.append(dict(key=k, side="R")); LUT[KI[k], 1] = len(rows_out)
V = np.zeros(SHAPE, np.uint16)
for i in range(SHAPE[0]):
    V[i] = LUT[K[i], SIDE[i]]
del K
log("left/right split:", len(rows_out), "labels")
log("specks merged (post-split)", despeck(V))

# ------------------------------------------------------------------ 5. table + save
cnt = np.bincount(V.ravel(), minlength=len(rows_out) + 1)
objs = ndi.find_objects(V)
table = []
for i, ro in enumerate(rows_out, start=1):
    r = BY_KEY[ro["key"]]
    sl = objs[i - 1] if i - 1 < len(objs) else None
    if sl is None or cnt[i] == 0:
        log("EMPTY label", ro["key"], ro["side"])
        bbox = None; cen = None
    else:
        sub = V[sl] == i
        cc = np.array(ndi.center_of_mass(sub)) + [s.start for s in sl]
        cen = [round(float(xs[0] + cc[0] * VOX), 2), round(float(ys[0] + cc[1] * VOX), 2), round(float(zs[0] + cc[2] * VOX), 2)]
        bbox = [[round(float(xs[sl[0].start]), 2), round(float(ys[sl[1].start]), 2), round(float(zs[sl[2].start]), 2)],
                [round(float(xs[sl[0].stop - 1]), 2), round(float(ys[sl[1].stop - 1]), 2), round(float(zs[sl[2].stop - 1]), 2)]]
    table.append(dict(id=i, key=ro["key"], side=ro["side"], name=r["name"], tissue=r["tissue"], quality=r["quality"], src=r["src"],
                      course=r["course"], voxels=int(cnt[i]), mm3=round(float(cnt[i]) * VOX ** 3, 1), centroid_mm=cen, bbox_mm=bbox))
np.save(os.path.join(OUT, "labels.npy"), V)
json.dump(dict(space="ICBM 2009b nonlinear symmetric (RAS mm, AC origin)", voxel_mm=VOX, shape=list(SHAPE), affine=AFF.tolist(), labels=table),
          open(os.path.join(OUT, "labels.json"), "w"), indent=1)
log("saved", os.path.join(OUT, "labels.npy"), "brain voxels", int((V > 0).sum()), f"= {float((V > 0).sum()) * VOX ** 3 / 1000:.0f} cm3")
