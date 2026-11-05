"""ATLAS-2 builder: curriculum label volumes in ICBM2009b-symmetric space (0.5 mm) + 1 mm brain-only T1.
Sources (all downloaded to _atlas/raw, untrusted data, only read as arrays):
  Allen Human Reference Atlas 3D 2020 (CC BY 4.0)         annotation_full.nii.gz (both hemispheres mirrored)
  ICBM 2009b nonlinear symmetric T1 (MNI licence)          template
  Advanced Atlas of 80 Bundles (Garyfallidis/Yeh, CC BY 4.0)  .trk streamlines (ICBM 2009a space)
Run: tools/.venv/Scripts/python.exe -I tools/atlas/build_atlas2.py
Outputs: public/atlas2/{template.nii.gz,labels.nii.gz,tracts.nii.gz,atlas2.json}, _atlas/atlas2_build/*.npy
"""
import json, os, sys, gzip, numpy as np, nibabel as nb
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RAW = os.path.join(ROOT, "_atlas/raw")
OUT = os.path.join(ROOT, "public/atlas2")
BUILD = os.path.join(ROOT, "_atlas/atlas2_build")
os.makedirs(OUT, exist_ok=True); os.makedirs(BUILD, exist_ok=True)

ann = nb.load(os.path.join(RAW, "ahra/annotation_full.nii.gz"))
A = np.asarray(ann.dataobj).astype(np.int64)
AFF = ann.affine  # 0.5 mm, RAS, ICBM2009b sym
VOX = 0.5

# ---- AHRA acronym -> id (from official voxel_count.csv shipped with the atlas) -----------------
import csv
AC2ID, ID2NAME = {}, {}
for r in csv.DictReader(open(os.path.join(RAW, "ahra/vc.csv"), encoding="utf8")):
    if r["annotated"] == "True":
        AC2ID[r["acronym"]] = int(r["id"]); ID2NAME[int(r["id"])] = r["name"]

# ---- Structure spec: slug -> (name, quality, source, vol1 leaf keys, vol2 leaf keys) -------------------------
# quality: exact (the atlas labels this very structure) | derived (computed from atlas labels, documented) |
#          regional (the atlas only has the enclosing region: the whole region is lit, flagged in the UI)
AHRA = "Allen Human Reference Atlas 3D 2020 (CC BY 4.0)"
HCP = "Advanced Atlas of 80 Bundles / HCP-842 (CC BY 4.0)"
DER = "Derived from " + "Allen Human Reference Atlas 3D 2020"
S = {}
def add(slug, name, q, src, v1=(), v2=()): S[slug] = dict(name=name, quality=q, source=src, v1=list(v1), v2=list(v2))
THAL = ["ANC","LD","MD","Re","LP","Pul","VA","VL","VPL","VPM","DLG","MG","CM","Pf","MiN","THM"]
HYP = ["HTH","HTHpo","HTHso","HTHtub","HTHma"]
add("substantia-nigra","Substantia nigra","exact",AHRA,["SN"])
add("red-nucleus","Red nucleus","exact",AHRA,["RN"])
add("subthalamic-nucleus","Subthalamic nucleus","exact",AHRA,["STH"])
add("pineal-gland","Pineal gland","exact",AHRA,["Pin"])
add("mammillary-bodies","Mammillary bodies","exact",AHRA,["HTHma"])
add("hypothalamus","Hypothalamus","exact",AHRA,HYP)
add("superior-colliculus","Superior colliculus","exact",AHRA,["SC"])
add("inferior-colliculus","Inferior colliculus","exact",AHRA,["IC"])
add("cerebral-peduncles","Cerebral peduncles","exact",AHRA,["cpd"])
add("superior-cerebellar-peduncle","Superior cerebellar peduncle","exact",AHRA,["scp"])
add("middle-cerebellar-peduncle","Middle cerebellar peduncle","exact",AHRA,["mcp"])
add("inferior-cerebellar-peduncle","Inferior cerebellar peduncle","exact",AHRA,["icp"])
add("cerebellar-peduncles","Cerebellar peduncles","exact",AHRA,["scp","mcp","icp"])
add("inferior-olivary-nucleus","Inferior olivary nucleus","exact",AHRA,["IO"])
add("olives","Olives","exact",AHRA,["IO"])
add("pyramids","Pyramids","exact",AHRA,["MoPy"])
add("dentate-nucleus","Dentate nucleus","regional",AHRA + ": cerebellar deep nuclei (dentate, interposed, fastigial are not separated)",["CbDN"])
add("vermis","Vermis","exact",AHRA,["CBV"])
add("paravermis","Paravermis","exact",AHRA,["CBPV"])
add("cerebellar-lateral-hemisphere","Cerebellar lateral hemisphere","exact",AHRA,["CBL"])
add("cerebellum","Cerebellum","exact",AHRA,["CBV","CBPV","CBL","CbDN"])
add("lateral-ventricle","Lateral ventricle","exact",AHRA,["aLV","bLV","xLV","pLV","iLV"])
add("anterior-horn-of-lateral-ventricle","Anterior horn of lateral ventricle","exact",AHRA,["aLV"])
add("body-of-lateral-ventricle","Body of lateral ventricle","exact",AHRA,["bLV"])
add("atrium-of-lateral-ventricle","Atrium of lateral ventricle","exact",AHRA,["xLV"])
add("posterior-horn-of-lateral-ventricle","Posterior horn of lateral ventricle","exact",AHRA,["pLV"])
add("inferior-horn-of-lateral-ventricle","Inferior horn of lateral ventricle","exact",AHRA,["iLV"])
add("third-ventricle","Third ventricle","exact",AHRA,["3V"])
add("fourth-ventricle","Fourth ventricle","exact",AHRA,["4V"])
add("cerebral-aqueduct","Cerebral aqueduct","exact",AHRA,["Aq"])
add("caudate-nucleus","Caudate nucleus","exact",AHRA,["CaH","CaB","CaT"])
add("head-of-caudate-nucleus","Head of caudate nucleus","exact",AHRA,["CaH"])
add("body-of-caudate-nucleus","Body of caudate nucleus","exact",AHRA,["CaB"])
add("tail-of-caudate-nucleus","Tail of caudate nucleus","exact",AHRA,["CaT"])
add("putamen","Putamen","exact",AHRA,["Pu","PuPV"])
add("globus-pallidus","Globus pallidus","exact",AHRA,["GPe","GPi"])
add("lentiform-nucleus","Lentiform nucleus","exact",AHRA,["Pu","PuPV","GPe","GPi"])
add("corpus-striatum","Corpus striatum","exact",AHRA,["CaH","CaB","CaT","Pu","PuPV","NAC"])
add("basal-ganglia","Basal ganglia","exact",AHRA,["CaH","CaB","CaT","Pu","PuPV","GPe","GPi"])
add("nucleus-accumbens","Nucleus accumbens","exact",AHRA,["NAC"])
add("amygdala","Amygdala","exact",AHRA,["AMY","AAA","CEN","CoA","CoP","Me","AHA","La","BL","BM"])
add("hippocampus","Hippocampus","exact",AHRA,["HiH","HiB","HiT"])
add("thalamus","Thalamus","exact",AHRA,THAL)
add("anterior-nucleus-of-thalamus","Anterior nucleus of thalamus","exact",AHRA,["ANC"])
add("pulvinar","Pulvinar","exact",AHRA,["Pul"])
add("lateral-geniculate-nucleus","Lateral geniculate nucleus","exact",AHRA,["DLG"])
add("medial-geniculate-nucleus","Medial geniculate nucleus","exact",AHRA,["MG"])
add("habenula","Habenula","exact",AHRA,["HN"])
add("epithalamus","Epithalamus","exact",AHRA,["HN","Pin"])
add("fornix","Fornix","exact",AHRA,["fx"])
add("corpus-callosum","Corpus callosum","exact",AHRA,["cc"])
add("anterior-commissure","Anterior commissure","exact",AHRA,["ac"])
add("optic-tract","Optic tract","exact",AHRA,["ot"])
add("optic-radiations","Optic radiations","exact",AHRA,["or"])
add("basal-forebrain-nuclei","Basal forebrain nuclei","exact",AHRA,["BF","SEP"])
add("superior-frontal-gyrus","Superior frontal gyrus","exact",AHRA,["SFG"])
add("middle-frontal-gyrus","Middle frontal gyrus","exact",AHRA,["MFG"])
add("inferior-frontal-gyrus","Inferior frontal gyrus","exact",AHRA,["IFGtr","IFGop"])
add("precentral-gyrus","Precentral gyrus","exact",AHRA,["PrCG"])
add("postcentral-gyrus","Postcentral gyrus","exact",AHRA,["PoCG"])
add("superior-parietal-lobule","Superior parietal lobule","exact",AHRA,["SPL"])
add("inferior-parietal-lobule","Inferior parietal lobule","exact",AHRA,["SMG","AnG"])
add("superior-temporal-gyrus","Superior temporal gyrus","exact",AHRA,["STG"])
add("middle-temporal-gyrus","Middle temporal gyrus","exact",AHRA,["MTG"])
add("inferior-temporal-gyrus","Inferior temporal gyrus","exact",AHRA,["ITG"])
add("transverse-temporal-gyrus","Transverse temporal gyrus","exact",AHRA,["TTG"])
add("cingulate-gyrus","Cingulate gyrus","exact",AHRA,["CgGr","CgGc"])
add("parahippocampal-gyrus","Parahippocampal gyrus","exact",AHRA,["APH","PPH"])
add("insular-cortex","Insular cortex","exact",AHRA,["LIG","SIG"])
add("orbitofrontal-cortex","Orbitofrontal cortex","exact",AHRA,["MOrG","AOrG","POrG","LOrG"])
add("primary-motor-cortex","Primary motor cortex","regional",AHRA + ": precentral gyrus (BA 4 is not drawn separately)",["PrCG"])
add("primary-somatosensory-cortex","Primary somatosensory cortex","regional",AHRA + ": postcentral gyrus",["PoCG"])
add("broca-s-area","Broca's area","regional",AHRA + ": pars triangularis + opercularis",["IFGtr","IFGop"])
add("primary-auditory-cortex","Primary auditory cortex","regional",AHRA + ": transverse temporal (Heschl's) gyrus",["TTG"])
add("anterior-cingulate-cortex","Anterior cingulate cortex","regional",AHRA + ": rostral cingulate gyrus",["CgGr"])
add("dorsolateral-prefrontal-cortex","Dorsolateral prefrontal cortex","regional",AHRA + ": middle frontal gyrus",["MFG"])
add("ventromedial-prefrontal-cortex","Ventromedial prefrontal cortex","regional",AHRA + ": gyrus rectus + medial orbital gyrus",["ReG","MOrG"])
add("midbrain","Midbrain","regional",AHRA,["MTg","cpd","SC","IC","SN","RN","PTR"])
add("pons","Pons","exact",AHRA,["PnBa","PnTg"])
add("medulla","Medulla","exact",AHRA,["MoPy","MoTg","IO"])
add("brainstem","Brainstem","exact",AHRA,["MTg","cpd","SC","IC","SN","RN","PTR","PnBa","PnTg","MoPy","MoTg","IO"])
for slug, nm in [("oculomotor-nucleus","Oculomotor nucleus"),("trochlear-nucleus","Trochlear nucleus"),("edinger-westphal-nucleus","Edinger-Westphal nucleus")]:
    add(slug, nm, "regional", AHRA + ": midbrain tegmentum (nucleus not drawn separately)", ["MTg"])
for slug, nm in [("motor-trigeminal-nucleus","Motor trigeminal nucleus"),("principal-sensory-nucleus-of-trigeminal","Principal sensory nucleus of trigeminal"),
                 ("abducens-nucleus","Abducens nucleus"),("facial-nucleus","Facial nucleus"),("facial-colliculus","Facial colliculus"),
                 ("vestibulocochlear-complex","Vestibulocochlear complex"),("paramedian-pontine-reticular-formation","Paramedian pontine reticular formation")]:
    add(slug, nm, "regional", AHRA + ": pontine tegmentum (nucleus not drawn separately)", ["PnTg"])
for slug, nm in [("hypoglossal-nucleus","Hypoglossal nucleus"),("dorsal-motor-nucleus-of-the-vagus","Dorsal motor nucleus of the vagus"),("solitary-nucleus","Solitary nucleus"),
                 ("nucleus-ambiguus","Nucleus ambiguus"),("gracile-nucleus","Gracile nucleus"),("cuneate-nucleus","Cuneate nucleus"),
                 ("spinal-trigeminal-nucleus","Spinal trigeminal nucleus"),("internal-arcuate-fibers","Internal arcuate fibers"),
                 ("gracile-tubercle","Gracile tubercle"),("cuneate-tubercle","Cuneate tubercle"),("area-postrema","Area postrema"),("obex","Obex")]:
    add(slug, nm, "regional", AHRA + ": medullary tegmentum (nucleus not drawn separately)", ["MoTg"])
add("pontine-nuclei","Pontine nuclei","regional",AHRA + ": basilar pons",["PnBa"])
add("pontine-protuberance","Pontine protuberance","exact",AHRA,["PnBa","PnTg"])
add("transverse-fibers-of-the-pons","Transverse fibers of the pons","regional",AHRA + ": basilar pons",["PnBa"])
# derived
DSRC = "Derived: periaqueductal grey = midbrain-tegmentum voxels within 4 mm of the aqueduct (AHRA labels)"
add("periaqueductal-gray","Periaqueductal gray","derived",DSRC,["PAG"])
ICSRC = "Derived: white matter of forebrain between caudate/thalamus and lentiform nucleus (AHRA labels); genu at the anterior thalamic pole"
add("internal-capsule","Internal capsule","derived",ICSRC,["ICa","ICg","ICp"])
add("anterior-limb-of-internal-capsule","Anterior limb of internal capsule","derived",ICSRC,["ICa"])
add("genu-of-internal-capsule","Genu of internal capsule","derived",ICSRC,["ICg"])
add("posterior-limb-of-internal-capsule","Posterior limb of internal capsule","derived",ICSRC,["ICp"])
# tracts
add("medial-lemniscus","Medial lemniscus","exact",HCP,[],["ML"])
add("medial-longitudinal-fasciculus","Medial longitudinal fasciculus","exact",HCP,[],["MLF"])
add("anterolateral-spinothalamic-tract","Anterolateral spinothalamic tract","regional",HCP + ": spinothalamic bundle (brainstem and thalamic course only)",[],["STT"])
add("association-fibers","Association fibers","exact",HCP,[],["AF","IFOF","ILF","SLF","UF","CING"])
add("projection-fibers","Projection fibers","exact",HCP + " + derived internal capsule",["ICa","ICg","ICp","cpd","or"],["CST","CPT"])
add("commissural-fibers","Commissural fibers","exact",AHRA,["cc","ac"])
add("longitudinal-fibers-of-the-pons","Longitudinal fibers of the pons","derived","Derived: HCP-842 corticospinal + corticopontine bundles inside the AHRA basilar pons",[],["PONSL"])

# neighbours are only offered for structures that are not enclosing groups
GROUPS = {"cerebellum","brainstem","midbrain","pons","medulla","basal-ganglia","corpus-striatum","lentiform-nucleus","lateral-ventricle","caudate-nucleus","thalamus","hypothalamus",
          "amygdala","hippocampus","cerebellar-peduncles","epithalamus","internal-capsule","projection-fibers","association-fibers","commissural-fibers","olives","pontine-protuberance"}

# ---- 1. AHRA leaf volume ------------------------------------------------------------------------
leaf1 = []  # ordered list of vol1 leaf keys
for s in S.values():
    for k in s["v1"]:
        if k not in leaf1: leaf1.append(k)
idx1 = {k: i + 1 for i, k in enumerate(leaf1)}
leaf2 = ["ML", "MLF", "STT", "CST", "CPT", "AF", "IFOF", "ILF", "SLF", "UF", "CING", "PONSL"]
THR = {"ML": 0.30, "MLF": 0.30, "STT": 0.30, "CST": 0.25, "CPT": 0.25, "AF": 0.20, "IFOF": 0.20, "ILF": 0.20, "SLF": 0.20, "UF": 0.20, "CING": 0.20}
LUT_ONLY = os.environ.get("LUT_ONLY") == "1"   # reuse vol1/vol2 from a previous run (skips the slow volume steps)
if LUT_ONLY:
    vol1 = np.load(os.path.join(BUILD, "vol1.npy")); vol2 = np.load(os.path.join(BUILD, "vol2.npy"))
else:
    vol1 = np.zeros(A.shape, np.uint8)
    DERIVED1 = {"PAG", "ICa", "ICg", "ICp"}
    for k in leaf1:
        if k in DERIVED1: continue
        vol1[A == AC2ID[k]] = idx1[k]

    def mask(keys): return np.isin(A, [AC2ID[k] for k in keys])
    # PAG
    aq = mask(["Aq"]); mtg = mask(["MTg"])
    d = ndi.distance_transform_edt(~aq, sampling=VOX)
    pag = mtg & (d <= 4.0)
    vol1[pag] = idx1["PAG"]
    # internal capsule
    fwm = A == AC2ID.get("FWM", 10557)
    cth = mask(["CaH", "CaB", "CaT", "THM", "ANC", "LD", "MD", "Re", "LP", "Pul", "VA", "VL", "VPL", "VPM", "DLG", "MG", "CM", "Pf", "MiN", "HTH"])
    lent = mask(["Pu", "PuPV", "GPe", "GPi"])
    dA = ndi.distance_transform_edt(~cth, sampling=VOX); dB = ndi.distance_transform_edt(~lent, sampling=VOX)
    ic = fwm & (dA <= 4.5) & (dB <= 4.5)
    ic = ndi.binary_opening(ic, iterations=1)
    lab, n = ndi.label(ic)
    sizes = ndi.sum(ic, lab, range(1, n + 1)); ic = np.isin(lab, [i + 1 for i, sz in enumerate(sizes) if sz > 2000])
    # genu: y of anterior thalamic pole
    ijk = np.argwhere(mask(["THM", "ANC", "MD", "VA"]))
    ythal = (ijk[:, 1] * VOX + AFF[1, 3]).max()
    yy = (np.arange(A.shape[1]) * VOX + AFF[1, 3])[None, :, None]
    ic_a = ic & (yy > ythal + 3); ic_g = ic & (np.abs(yy - ythal) <= 3); ic_p = ic & (yy < ythal - 3)
    vol1[ic_a] = idx1["ICa"]; vol1[ic_g] = idx1["ICg"]; vol1[ic_p] = idx1["ICp"]
    print("IC voxel mm3", ic.sum() * VOX ** 3, "anterior thal pole y", ythal)

    # ---- 2. tract volume (HCP-842 80-bundle atlas, streamlines -> smoothed track density, argmax) ---------
    TR = os.path.join(RAW, "hcp80/x/Atlas_80_Bundles/bundles")
    BUNDLES = {"ML": ["ML_L", "ML_R"], "MLF": ["MLF_L", "MLF_R"], "STT": ["STT_L", "STT_R"], "CST": ["CST_L", "CST_R"],
               "CPT": ["FPT_L", "FPT_R", "PPT_L", "PPT_R", "TPT_L", "TPT_R", "OPT_L", "OPT_R"],
               "AF": ["AF_L", "AF_R"], "IFOF": ["IFOF_L", "IFOF_R"], "ILF": ["ILF_L", "ILF_R"], "SLF": ["SLF_L", "SLF_R"],
               "UF": ["UF_L", "UF_R"], "CING": ["C_L", "C_R"]}
    SHIFT = np.array([float(os.environ.get(k, 0)) for k in ("TSX", "TSY", "TSZ")])  # optional 2009a->2009b correction (mm), documented
    inv = np.linalg.inv(AFF)
    dens = {}
    for key, files in BUNDLES.items():
        D = np.zeros(A.shape, np.float32)
        for f in files:
            sl = nb.streamlines.load(os.path.join(TR, f + ".trk")).streamlines
            for s in sl:
                # resample along the streamline so each 0.25 mm step is visited
                seg = np.diff(s, axis=0); L = np.r_[0, np.cumsum(np.linalg.norm(seg, axis=1))]
                if L[-1] < 1e-3: continue
                t = np.arange(0, L[-1], 0.25)
                p = np.c_[[np.interp(t, L, s[:, i]) for i in range(3)]].T + SHIFT
                ijk = np.rint(p @ inv[:3, :3].T + inv[:3, 3]).astype(int)
                ok = np.all((ijk >= 0) & (ijk < A.shape), axis=1)
                ijk = ijk[ok]
                # one count per streamline per voxel
                u = np.unique(ijk, axis=0); D[u[:, 0], u[:, 1], u[:, 2]] += 1
        D = ndi.gaussian_filter(D, 1.2 / VOX)
        dens[key] = D / max(D.max(), 1e-9)
        print("bundle", key, "streams density max done")
    # per-bundle threshold: relative to that bundle's own peak (fraction documented in atlas2.json)
    vol2 = np.zeros(A.shape, np.uint8)
    best = np.zeros(A.shape, np.float32)
    for key in BUNDLES:
        v = dens[key] / THR[key]
        m = (v >= 1) & (v > best)
        # tracts are only kept where they are in brain white matter/brainstem (not outside the brain)
        vol2[m] = leaf2.index(key) + 1; best[m] = v[m]
    brain = ndi.binary_fill_holes(ndi.binary_closing(A > 0, iterations=4))
    vol2[~brain] = 0
    # pontine longitudinal fibres
    pnba = A == AC2ID["PnBa"]
    long_m = np.isin(vol2, [leaf2.index("CST") + 1, leaf2.index("CPT") + 1]) & pnba
    vol2[long_m] = leaf2.index("PONSL") + 1
    # ---- 3. crop & write ------------------------------------------------------------------------------
    nz = np.argwhere(brain)
    lo = np.maximum(nz.min(0) - 8, 0); hi = np.minimum(nz.max(0) + 9, A.shape)
    sl = tuple(slice(a, b) for a, b in zip(lo, hi))
    off = AFF.copy(); off[:3, 3] = AFF[:3, :3] @ lo + AFF[:3, 3]
    def save(arr, path, aff, dtype):
        img = nb.Nifti1Image(arr.astype(dtype), aff); img.header.set_data_dtype(dtype); img.set_qform(aff, 1); img.set_sform(aff, 1)
        nb.save(img, path); print(path, arr.shape, os.path.getsize(path) // 1024, "KB")
    save(vol1[sl], os.path.join(OUT, "labels.nii.gz"), off, np.uint8)
    save(vol2[sl], os.path.join(OUT, "tracts.nii.gz"), off, np.uint8)
    np.save(os.path.join(BUILD, "vol1.npy"), vol1); np.save(os.path.join(BUILD, "vol2.npy"), vol2)
    # template at 1 mm, brain-only, uint8
    t1i = nb.load(os.path.join(RAW, "mni09b/x/mni_icbm152_nlin_sym_09b/mni_icbm152_t1_tal_nlin_sym_09b_hires.nii"))
    T = np.asarray(t1i.dataobj).astype(np.float32)
    bm = ndi.binary_dilation(brain, iterations=3)
    T = np.where(bm, T, 0)
    T = T[sl]; bmc = bm[sl]
    h = (np.array(T.shape) // 2) * 2
    T = T[:h[0], :h[1], :h[2]].reshape(h[0] // 2, 2, h[1] // 2, 2, h[2] // 2, 2).mean(axis=(1, 3, 5))
    p99 = np.percentile(T[T > 0], 99.7)
    T8 = np.clip(T / p99 * 255, 0, 255).astype(np.uint8)
    a1 = off.copy(); a1[:3, :3] *= 2; a1[:3, 3] = off[:3, 3] + off[:3, :3] @ np.array([0.5, 0.5, 0.5]) - a1[:3, :3] @ np.array([0.5, 0.5, 0.5]) * 0  # voxel centre of 2x2x2 block
    a1[:3, 3] = off[:3, 3] + off[:3, :3] @ np.array([0.5, 0.5, 0.5])
    save(T8, os.path.join(OUT, "template.nii.gz"), a1, np.uint8)


# ---- 4. LUT + neighbours -----------------------------------------------------------------------------
vox1 = np.argwhere(np.ones((1, 1, 1)))  # unused
leaf_names = {k: ID2NAME[AC2ID[k]] for k in leaf1 if k in AC2ID}
leaf_names.update({"PAG": "Periaqueductal gray (derived)", "ICa": "Internal capsule, anterior limb (derived)", "ICg": "Internal capsule, genu (derived)", "ICp": "Internal capsule, posterior limb (derived)"})
t_names = {"ML": "Medial lemniscus", "MLF": "Medial longitudinal fasciculus", "STT": "Spinothalamic tract", "CST": "Corticospinal tract", "CPT": "Corticopontine tracts",
           "AF": "Arcuate fasciculus", "IFOF": "Inferior fronto-occipital fasciculus", "ILF": "Inferior longitudinal fasciculus", "SLF": "Superior longitudinal fasciculus",
           "UF": "Uncinate fasciculus", "CING": "Cingulum", "PONSL": "Longitudinal fibers of the pons (derived)"}
# centroid (MNI mm), bbox, volume per structure; coarse distance for neighbours at 2 mm
def centroid_of(m):
    ijk = np.argwhere(m)
    if len(ijk) == 0: return None
    xyz = ijk @ AFF[:3, :3].T + AFF[:3, 3]
    return xyz
masks = {}
d1 = vol1[::2, ::2, ::2]; d2 = vol2[::2, ::2, ::2]   # 1 mm for centroids / neighbours (the 0.5 mm volumes are what is shipped)
AFF1 = AFF.copy(); AFF1[:3, :3] = AFF[:3, :3] * 2
for slug, s in S.items():
    m = np.zeros(d1.shape, bool)
    if s["v1"]: m |= np.isin(d1, [idx1[k] for k in s["v1"]])
    if s["v2"]: m |= np.isin(d2, [leaf2.index(k) + 1 for k in s["v2"]])
    masks[slug] = m
    ijk = np.argwhere(m)
    if len(ijk) == 0:
        print("EMPTY", slug); s["empty"] = True; continue
    xyz = ijk @ AFF1[:3, :3].T + AFF1[:3, 3]
    s["volume_mm3"] = round(float(len(xyz) * 1.0), 1)
    right = xyz[xyz[:, 0] > 1.5]; left = xyz[xyz[:, 0] < -1.5]
    paired = len(right) > 0.2 * len(xyz) and len(left) > 0.2 * len(xyz)
    s["paired"] = bool(paired)
    s["centroid"] = [round(float(v), 1) for v in (xyz.mean(0) if not paired else right.mean(0))]
    s["bbox"] = [[round(float(v), 1) for v in xyz.min(0)], [round(float(v), 1) for v in xyz.max(0)]]
print("masks done", flush=True)
cand = [k for k, s_ in S.items() if not s_.get("empty") and k not in GROUPS]
M = {k: masks[k] for k in cand}
sz = {k: int(M[k].sum()) for k in cand}
mind = {}
for k in cand:
    dk = ndi.distance_transform_edt(~M[k], sampling=1.0).astype(np.float32)
    for o in cand:
        if o != k: mind[(k, o)] = float(dk[M[o]].min())
    del dk
NB = {}
for k in cand:
    rows = []
    for o in cand:
        if o == k: continue
        if (M[k] & M[o]).sum() > 0.05 * min(sz[k], sz[o]): continue  # nested / enclosing
        rows.append((mind[(k, o)], o))
    rows.sort()
    NB[k] = [o for _, o in rows[:8]]
out = dict(
    version=1, space="ICBM 2009b nonlinear symmetric (MNI), mm", leaf1=[dict(id=idx1[k], key=k, name=leaf_names.get(k, k)) for k in leaf1],
    leaf2=[dict(id=i + 1, key=k, name=t_names[k]) for i, k in enumerate(leaf2)],
    structures={slug: dict(name=s["name"], quality=s["quality"], source=s["source"], labels=[idx1[k] for k in s["v1"]], tracts=[leaf2.index(k) + 1 for k in s["v2"]],
                           centroid=s.get("centroid"), bbox=s.get("bbox"), volume_mm3=s.get("volume_mm3"), paired=s.get("paired"), group=slug in GROUPS, neighbors=NB.get(slug, []))
                for slug, s in S.items() if not s.get("empty")},
    tractThresholds=THR,
)
json.dump(out, open(os.path.join(OUT, "atlas2.json"), "w"), separators=(",", ":"))
print("atlas2.json", os.path.getsize(os.path.join(OUT, "atlas2.json")) // 1024, "KB", len(out["structures"]), "structures")
