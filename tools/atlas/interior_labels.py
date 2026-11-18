"""The inside of the Explore atlas: one labelled volume that drives the cut faces (and the interior meshes).

Sources (all already in _atlas/raw, licences verified, see docs/ATLAS_INTERIOR_PLAN.md):
  Allen Human Reference Atlas 3D 2020 (CC BY 4.0)  annotation_full.nii.gz, 0.5 mm, ICBM 2009b sym: every named region
  _atlas/atlas2_build/vol1.npy (build_atlas2.py)    same grid: Harvard AAN v2.0 (CC0) PAG + brainstem nuclei, derived
                                                    internal capsule limbs
  _atlas/atlas2_build/vol2.npy                     HCP-842 80-bundle atlas (CC BY 4.0): medial lemniscus, MLF
Derived here (MNI space, documented per label in DERIVED below): septum pellucidum, interthalamic adhesion, corpus callosum
genu/body/splenium, fornix columns/body/crus/fimbria, choroid plexus, optic chiasm, posterior commissure, external and
extreme capsules, centrum semiovale, cerebellar white matter.

Registration into the Z-Anatomy mesh space: the warp of section_volume.py (landmark affine + multi-channel demons,
_atlas/section/warp_fine.npz). In Z space the labels are clipped to the Z-Anatomy brain (brain solid + brainstem +
cerebellum); voxels of that solid outside the template brain (rim, the lower medulla) take the nearest label.

Output
  public/atlas/interior.bin.gz  gzip( 64-byte header + RG8 voxels, x fastest ). R = label index, G = smooth boundary value
                                m = g_best - g_second of the Gaussian-smoothed label indicators (0 on a border, 1 deep inside),
                                so the shader rebuilds each border as a smooth curve. Header: 'AIL1', u16 nx ny nz, u16 nlab,
                                f32 corner xyz (m, box corner), f32 step (m).
  public/atlas/interior.json    label table (name, slug, ids, tissue class, tone, group, centroid, bounds, best cut planes)
  _atlas/interior/*.png, dice.json   overlays and Dice against the Z-Anatomy meshes

Run (repo root, low priority): tools/.venv/Scripts/python.exe -I tools/atlas/interior_labels.py [--redo]
"""
import os, sys, gzip, json, struct, hashlib, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np  # noqa: E402
from scipy import ndimage as ndi  # noqa: E402
import section_volume as sv  # noqa: E402  (T1, Allen labels, registration helpers; sets low priority)

ROOT = sv.ROOT
W = os.path.join(ROOT, "_atlas/interior"); os.makedirs(W, exist_ok=True)
REDO = "--redo" in sys.argv
log = sv.log
STEP = 0.0005  # 0.5 mm in Z space
VOX = 0.5      # MNI voxel, mm
A = sv.A
AFF = sv.AFF
ACR = {r["acronym"]: int(i) for i, r in sv.R.items()}


def mni_axes():
    return [np.arange(A.shape[i]) * VOX + AFF[i, 3] for i in range(3)]


# ---------------------------------------------------------------- the label table
# key, name, Allen acronyms (leaf ids in annotation_full), class, tone, group, sub-line, atlas ids (index.json; first = pick)
# class: ctx field cortex (CSF/grey/white from the tissue field) | wm field white matter (white unless the field says CSF) |
#        cb cerebellum (field) | g grey nucleus (flat) | w white tract (flat) | csf ventricle | plx choroid plexus
# tone: -0.3 (darker than cortex, e.g. pigmented nigra) .. 0 cortex grey .. 1 white matter
# sub: hairline strength between two labels of the same group (0 none .. 1 full)
SPEC = []
def lab(key, name, acr, cls, tone, grp, ids, sub=0.0, slug=None):
    SPEC.append(dict(key=key, name=name, acr=list(acr), cls=cls, tone=tone, grp=grp, ids=list(ids), sub=sub, slug=slug))

STRI = ["corpus-striatum", "basal-ganglia"]
lab("CaH", "Head of caudate nucleus", ["CaH"], "g", 0.0, "cau", ["mni-head-of-caudate-nucleus", "caudate-nucleus", "dorsal-striatum", *STRI], slug="head-of-caudate-nucleus")
lab("CaB", "Body of caudate nucleus", ["CaB"], "g", 0.0, "cau", ["mni-body-of-caudate-nucleus", "caudate-nucleus", "dorsal-striatum", *STRI], slug="body-of-caudate-nucleus")
lab("CaT", "Tail of caudate nucleus", ["CaT"], "g", 0.0, "cau", ["mni-tail-of-caudate-nucleus", "caudate-nucleus", "dorsal-striatum", *STRI], slug="tail-of-caudate-nucleus")
lab("Pu", "Putamen", ["Pu", "PuPV"], "g", 0.0, "pu", ["putamen", "lentiform-nucleus", "dorsal-striatum", *STRI], slug="putamen")
lab("NAC", "Nucleus accumbens", ["NAC"], "g", 0.05, "nac", ["mni-nucleus-accumbens", "basal-forebrain", *STRI], slug="nucleus-accumbens")
lab("GPe", "Globus pallidus, external segment", ["GPe"], "g", 0.42, "gpe", ["globus-pallidus", "lentiform-nucleus", *STRI], slug="globus-pallidus")
lab("GPi", "Globus pallidus, internal segment", ["GPi"], "g", 0.52, "gpi", ["globus-pallidus", "lentiform-nucleus", *STRI], slug="globus-pallidus")
lab("Cla", "Claustrum", ["Cla"], "g", 0.0, "cla", [])
lab("SEP", "Septal nuclei", ["SEP"], "g", 0.12, "sep", ["septal-nuclei", "basal-forebrain"], slug="basal-forebrain-nuclei")
lab("BF", "Basal forebrain (substantia innominata)", ["BF"], "g", 0.12, "bf", ["basal-forebrain"], slug="basal-forebrain-nuclei")
lab("BNST", "Bed nucleus of the stria terminalis", ["BNST"], "g", 0.12, "bnst", ["stria-terminalis"], slug="bed-nucleus-of-the-stria-terminalis")
lab("AMY", "Amygdala", ["AMY", "AAA", "CEN", "CoA", "CoP", "Me", "AHA", "La", "BL", "BM"], "g", 0.04, "amy", ["amygdaloid-body"], slug="amygdala")
lab("HiH", "Hippocampus (head)", ["HiH"], "g", 0.04, "hip", ["hippocampus"], slug="hippocampus")
lab("HiB", "Hippocampus (body)", ["HiB"], "g", 0.04, "hip", ["hippocampus"], slug="hippocampus")
lab("HiT", "Hippocampus (tail)", ["HiT"], "g", 0.04, "hip", ["hippocampus"], slug="hippocampus")
TH = ["thalamus", "diencephalon"]
lab("ANC", "Anterior nucleus of thalamus", ["ANC"], "g", 0.26, "th", ["mni-anterior-nucleus-of-thalamus", *TH], 0.45, slug="anterior-nucleus-of-thalamus")
lab("MD", "Mediodorsal nucleus of thalamus", ["MD"], "g", 0.26, "th", TH, 0.45, slug="mediodorsal-nucleus")
lab("LD", "Lateral dorsal nucleus of thalamus", ["LD"], "g", 0.26, "th", TH, 0.45)
lab("LP", "Lateral posterior nucleus of thalamus", ["LP"], "g", 0.26, "th", TH, 0.45)
lab("Pul", "Pulvinar", ["Pul"], "g", 0.26, "th", ["mni-pulvinar", *TH], 0.45, slug="pulvinar")
lab("VA", "Ventral anterior nucleus of thalamus", ["VA"], "g", 0.26, "th", TH, 0.45, slug="va-vl-nuclei")
lab("VL", "Ventral lateral nucleus of thalamus", ["VL"], "g", 0.26, "th", TH, 0.45, slug="va-vl-nuclei")
lab("VPL", "Ventral posterolateral nucleus (VPL)", ["VPL"], "g", 0.26, "th", TH, 0.45, slug="ventral-posterolateral-nucleus")
lab("VPM", "Ventral posteromedial nucleus (VPM)", ["VPM"], "g", 0.26, "th", TH, 0.45, slug="ventral-posteromedial-nucleus")
lab("LGN", "Lateral geniculate nucleus", ["DLG"], "g", 0.2, "lgn", ["lateral-geniculate-body", *TH], slug="lateral-geniculate-nucleus")
lab("MGN", "Medial geniculate nucleus", ["MG"], "g", 0.2, "mgn", ["medial-geniculate-body", *TH], slug="medial-geniculate-nucleus")
lab("CM", "Centromedian nucleus of thalamus", ["CM", "Pf"], "g", 0.26, "th", TH, 0.45)
lab("MiN", "Midline nuclei of thalamus", ["MiN", "Re"], "g", 0.26, "th", TH, 0.45)
lab("THM", "Thalamus", ["THM"], "g", 0.3, "th", TH, 0.45, slug="thalamus")
lab("IA", "Interthalamic adhesion (massa intermedia)", [], "g", 0.26, "th", TH, 0.45, slug="interthalamic-adhesion")
lab("HN", "Habenula", ["HN"], "g", 0.12, "hn", ["habenula", "diencephalon"], slug="habenula")
lab("Pin", "Pineal gland", ["Pin"], "g", 0.16, "pin", ["mni-pineal-gland", "diencephalon"], slug="pineal-gland")
lab("ZI", "Zona incerta", ["ZI"], "g", 0.22, "zi", ["diencephalon"])
lab("STN", "Subthalamic nucleus", ["STH"], "g", 0.02, "stn", ["mni-subthalamic-nucleus", "diencephalon"], slug="subthalamic-nucleus")
HY = ["hypothalamus", "diencephalon"]
lab("HTHpo", "Hypothalamus (preoptic region)", ["HTH", "HTHpo"], "g", 0.1, "hth", HY, slug="hypothalamus")
lab("HTHso", "Hypothalamus (supraoptic region)", ["HTHso"], "g", 0.1, "hth", HY, slug="hypothalamus")
lab("HTHtub", "Hypothalamus (tuberal region)", ["HTHtub"], "g", 0.1, "hth", HY, slug="hypothalamus")
lab("MB", "Mammillary body", ["HTHma"], "g", 0.16, "mb", ["mamillary-body", *HY], slug="mammillary-bodies")
# white matter tracts (flat white)
lab("CCg", "Corpus callosum (genu)", [], "w", 1.0, "cc", ["corpus-callosum", "commissural-fibres-of-telencephalon"], slug="genu-of-corpus-callosum")
lab("CCb", "Corpus callosum (body)", [], "w", 1.0, "cc", ["corpus-callosum", "commissural-fibres-of-telencephalon"], slug="body-of-corpus-callosum")
lab("CCs", "Corpus callosum (splenium)", [], "w", 1.0, "cc", ["corpus-callosum", "commissural-fibres-of-telencephalon"], slug="splenium-of-corpus-callosum")
lab("FXc", "Fornix (column)", [], "w", 0.95, "fx", ["fornix"], slug="columns-of-the-fornix")
lab("FXb", "Fornix (body)", [], "w", 0.95, "fx", ["fornix"], slug="body-of-fornix")
lab("FXr", "Fornix (crus)", [], "w", 0.95, "fx", ["fornix"], slug="crus-of-fornix")
lab("FIM", "Fimbria of the hippocampus", [], "w", 0.95, "fx", ["fornix", "hippocampus"], slug="fornix")
lab("ac", "Anterior commissure", ["ac"], "w", 1.0, "ac", ["anterior-commissure", "commissural-fibres-of-telencephalon"], slug="anterior-commissure")
lab("PC", "Posterior commissure", [], "w", 1.0, "pc", ["posterior-commissure"], slug="posterior-commissure")
lab("mtt", "Mammillothalamic tract", ["mtt"], "w", 0.95, "mtt", ["diencephalon"])
lab("ot", "Optic tract", ["ot"], "w", 0.95, "ot", ["optic-tract"], slug="optic-tract")
lab("OCh", "Optic chiasm", [], "w", 0.95, "ot", ["optic-chiasm"], slug="optic-chiasm")
lab("olt", "Olfactory tract", ["olt"], "w", 0.9, "olt", ["olfactory-nerve-i"], slug="olfactory-tract")
IC = ["mni-internal-capsule", "white-matter-of-telencephalon"]
lab("ICa", "Internal capsule (anterior limb)", [], "w", 1.0, "ic", ["mni-anterior-limb-of-internal-capsule", *IC], slug="anterior-limb-of-internal-capsule")
lab("ICg", "Internal capsule (genu)", [], "w", 1.0, "ic", ["mni-genu-of-internal-capsule", *IC], slug="genu-of-internal-capsule")
lab("ICp", "Internal capsule (posterior limb)", [], "w", 1.0, "ic", ["mni-posterior-limb-of-internal-capsule", *IC], slug="posterior-limb-of-internal-capsule")
lab("EC", "External capsule", [], "w", 1.0, "ec", ["white-matter-of-telencephalon"])
lab("ExC", "Extreme capsule", [], "w", 1.0, "exc", ["white-matter-of-telencephalon"])
lab("or", "Optic radiation", ["or"], "wm", 1.0, "wm", ["white-matter-of-telencephalon"], slug="optic-radiations")
lab("CSO", "Centrum semiovale", [], "wm", 1.0, "wm", ["white-matter-of-telencephalon"], slug="centrum-semiovale")
lab("FWM", "Cerebral white matter", ["FWM"], "wm", 1.0, "wm", ["white-matter-of-telencephalon"], slug="white-matter")
# CSF spaces
LV = ["lateral-ventricle"]
lab("aLV", "Lateral ventricle (anterior horn)", ["aLV"], "csf", 0, "lv", ["mni-anterior-horn-of-lateral-ventricle", *LV], slug="anterior-horn-of-lateral-ventricle")
lab("bLV", "Lateral ventricle (body)", ["bLV"], "csf", 0, "lv", ["mni-body-of-lateral-ventricle", *LV], slug="body-of-lateral-ventricle")
lab("xLV", "Lateral ventricle (atrium / trigone)", ["xLV"], "csf", 0, "lv", ["mni-atrium-of-lateral-ventricle", *LV], slug="atrium-of-lateral-ventricle")
lab("pLV", "Lateral ventricle (posterior horn)", ["pLV"], "csf", 0, "lv", ["mni-posterior-horn-of-lateral-ventricle", *LV], slug="posterior-horn-of-lateral-ventricle")
lab("iLV", "Lateral ventricle (inferior horn)", ["iLV"], "csf", 0, "lv", ["mni-inferior-horn-of-lateral-ventricle", *LV], slug="inferior-horn-of-lateral-ventricle")
lab("3V", "Third ventricle", ["3V"], "csf", 0, "v3", ["third-ventricle"], slug="third-ventricle")
lab("Aq", "Cerebral aqueduct", ["Aq"], "csf", 0, "aq", ["aqueduct-of-midbrain"], slug="cerebral-aqueduct")
lab("4V", "Fourth ventricle", ["4V"], "csf", 0, "v4", ["fourth-ventricle"], slug="fourth-ventricle")
lab("cec", "Central canal", ["cec"], "csf", 0, "aq", ["central-canal"])
lab("SP", "Septum pellucidum", [], "g", 0.3, "sp", ["septum-pellucidum"], slug="septum-pellucidum")
lab("CP", "Choroid plexus", [], "plx", 0, "cp", ["choroid-plexus"], slug="choroid-plexus")
# brainstem
MB_ = ["midbrain", "brainstem"]
lab("SC", "Superior colliculus", ["SC"], "g", 0.08, "sc", ["superior-colliculus", "tectum-of-midbrain", *MB_], slug="superior-colliculus")
lab("IC", "Inferior colliculus", ["IC"], "g", 0.08, "icol", ["inferior-colliculus", "tectum-of-midbrain", *MB_], slug="inferior-colliculus")
lab("PTR", "Pretectal area", ["PTR"], "g", 0.2, "ptr", MB_, slug="pretectal-nucleus")
lab("PAG", "Periaqueductal grey", [], "g", 0.04, "pag", ["mni-periaqueductal-gray", "tegmentum-of-midbrain", *MB_], slug="periaqueductal-gray")
lab("MTg", "Midbrain tegmentum", ["MTg"], "g", 0.36, "teg", ["tegmentum-of-midbrain", *MB_], slug="midbrain")
lab("RN", "Red nucleus", ["RN"], "g", 0.18, "rn", ["red-nucleus", "tegmentum-of-midbrain", *MB_], slug="red-nucleus")
lab("SN", "Substantia nigra", ["SN"], "g", -0.16, "sn", ["mni-substantia-nigra", *MB_], slug="substantia-nigra")
lab("cpd", "Cerebral peduncle (crus cerebri)", ["cpd"], "w", 0.95, "cpd", ["base-of-peduncle", "cerebral-peduncle", *MB_], slug="cerebral-peduncles")
lab("scp", "Superior cerebellar peduncle", ["scp"], "w", 0.92, "scp", ["superior-cerebellar-peduncle"], slug="superior-cerebellar-peduncle")
lab("mcp", "Middle cerebellar peduncle", ["mcp"], "w", 0.92, "mcp", ["mni-middle-cerebellar-peduncle"], slug="middle-cerebellar-peduncle")
lab("icp", "Inferior cerebellar peduncle", ["icp"], "w", 0.92, "icp", ["mni-inferior-cerebellar-peduncle"], slug="inferior-cerebellar-peduncle")
lab("PnBa", "Basilar part of pons", ["PnBa"], "g", 0.58, "pnba", ["pons", "brainstem"], slug="pons")
lab("PnTg", "Pontine tegmentum", ["PnTg"], "g", 0.36, "teg", ["tegmentum-of-pons", "pons", "brainstem"], slug="pons")
lab("MoTg", "Medulla (tegmentum)", ["MoTg"], "g", 0.36, "teg", ["medulla-oblongata", "brainstem"], slug="medulla")
lab("MoPy", "Pyramid of medulla", ["MoPy"], "w", 0.95, "py", ["pyramid-of-medulla-oblongata", "medulla-oblongata", "brainstem"], slug="pyramids")
lab("IO", "Inferior olivary nucleus", ["IO"], "g", 0.0, "io", ["olive", "medulla-oblongata", "brainstem"], slug="inferior-olivary-nucleus")
for k, nm, ids, sl in [("LC", "Locus coeruleus", ["tegmentum-of-pons", "pons"], None), ("DR", "Dorsal raphe nucleus", ["tegmentum-of-midbrain", "midbrain"], None),
                       ("MnR", "Median raphe nucleus", ["tegmentum-of-pons", "pons"], None), ("VTA", "Ventral tegmental area", ["tegmentum-of-midbrain", "midbrain"], "ventral-tegmental-area"),
                       ("LDTg", "Laterodorsal tegmental nucleus", ["tegmentum-of-pons", "pons"], None), ("mRt", "Mesencephalic reticular formation", ["tegmentum-of-midbrain", "midbrain"], None),
                       ("PBC", "Parabrachial complex", ["tegmentum-of-pons", "pons"], None), ("PnO", "Pontine reticular formation (oral part)", ["tegmentum-of-pons", "pons"], None),
                       ("PTg", "Pedunculotegmental nucleus", ["tegmentum-of-midbrain", "midbrain"], None)]:
    lab(k, nm, [], "g", 0.36, "teg", [*ids, "brainstem"], slug=sl)
lab("ML", "Medial lemniscus", [], "g", 0.62, "teg", ["mni-medial-lemniscus", "brainstem"], 0.3, slug="medial-lemniscus")
lab("MLF", "Medial longitudinal fasciculus", [], "g", 0.62, "teg", ["mni-medial-longitudinal-fasciculus", "brainstem"], 0.3, slug="medial-longitudinal-fasciculus")
lab("BSW", "Brainstem white matter", ["HWM"], "w", 0.85, "bsw", ["brainstem"])
# cerebellum (field: folia and arbor vitae from the tissue field)
lab("CBV", "Cerebellar vermis", ["CBV"], "cb", 0, "cb", ["cerebellum"], slug="vermis")
lab("CBPV", "Paravermis (cerebellum)", ["CBPV"], "cb", 0, "cb", ["cerebellum"], slug="paravermis")
lab("CBL", "Cerebellar hemisphere", ["CBL"], "cb", 0, "cb", ["cerebellum"], slug="cerebellar-lateral-hemisphere")
lab("CBW", "Cerebellar white matter (arbor vitae)", [], "cb", 0, "cb", ["cerebellum"], slug="cerebellar-white-matter")
lab("DN", "Deep cerebellar nuclei (dentate)", ["CbDN"], "g", 0.0, "dn", ["cerebellum"], slug="dentate-nucleus")
# cortex (field): named by gyrus
CTX = [("CgG", "Cingulate gyrus", ["CgGr", "CgGc", "IsCPH"], ["cingulate-gyrus-and-sulcus-middle-anterior-part", "limbic-lobe"], "cingulate-gyrus"),
       ("Ins", "Insula", ["LIG", "SIG", "LI", "FI", "TI"], ["insula-subcentral-gyrus-and-ant-and-post-sulci"], "insular-cortex"),
       ("PHG", "Parahippocampal gyrus", ["APH", "PPH", "AG", "PRG"], ["medial-occipitotemporal-gyrus-parahippocampal", "limbic-lobe"], "parahippocampal-gyrus"),
       ("SCG", "Subcallosal (paraterminal) gyrus", ["SCG"], ["limbic-lobe"], None),
       ("SFG", "Superior frontal gyrus", ["SFG", "PaCG"], ["superior-frontal-gyrus", "frontal-lobe"], "superior-frontal-gyrus"),
       ("MFG", "Middle frontal gyrus", ["MFG"], ["middle-frontal-gyrus", "frontal-lobe"], "middle-frontal-gyrus"),
       ("IFG", "Inferior frontal gyrus", ["IFGtr", "IFGop", "FrO"], ["triangular-part-of-inferior-frontal-gyrus", "frontal-lobe"], "inferior-frontal-gyrus"),
       ("Orb", "Orbital gyri", ["MOrG", "AOrG", "POrG", "LOrG", "LOG"], ["orbital-gyri", "frontal-lobe"], "orbitofrontal-cortex"),
       ("ReG", "Gyrus rectus", ["ReG"], ["straight-gyrus-gyrus-rectus", "frontal-lobe"], None),
       ("FP", "Frontal pole", ["FP", "FMG", "RoG"], ["transverse-frontopolar-gyrus-and-sulcus", "frontal-lobe"], None),
       ("PrCG", "Precentral gyrus", ["PrCG"], ["precentral-gyrus", "frontal-lobe"], "precentral-gyrus"),
       ("PCL", "Paracentral lobule", ["PCLr", "PCLc"], ["paracentral-gyrus-and-sulcus"], None),
       ("PoCG", "Postcentral gyrus", ["PoCG"], ["postcentral-gyrus", "parietal-lobe"], "postcentral-gyrus"),
       ("SPL", "Superior parietal lobule", ["SPL"], ["superior-parietal-lobule", "parietal-lobe"], "superior-parietal-lobule"),
       ("SMG", "Supramarginal gyrus", ["SMG", "PaO"], ["supramarginal-gyrus", "parietal-lobe"], "inferior-parietal-lobule"),
       ("AnG", "Angular gyrus", ["AnG"], ["angular-gyrus", "parietal-lobe"], "inferior-parietal-lobule"),
       ("PrCun", "Precuneus", ["PrCun"], ["precuneus", "parietal-lobe"], None),
       ("STG", "Superior temporal gyrus", ["STG", "PLT", "PLP"], ["superior-temporal-gyrus-lateral-part", "temporal-lobe"], "superior-temporal-gyrus"),
       ("TTG", "Transverse temporal gyrus (Heschl)", ["TTG"], ["transverse-temporal-gyri", "temporal-lobe"], "transverse-temporal-gyrus"),
       ("MTG", "Middle temporal gyrus", ["MTG"], ["middle-temporal-gyrus", "temporal-lobe"], "middle-temporal-gyrus"),
       ("ITG", "Inferior temporal gyrus", ["ITG"], ["inferior-temporal-gyrus", "temporal-lobe"], "inferior-temporal-gyrus"),
       ("FuG", "Fusiform (occipitotemporal) gyrus", ["FuGt", "FuGo"], ["lateral-occipitotemporal-gyrus", "temporal-lobe"], None),
       ("TP", "Temporal pole", ["TP"], ["temporal-pole", "temporal-lobe"], None),
       ("Cun", "Cuneus", ["Cun"], ["cuneus", "occipital-lobe"], None),
       ("LiG", "Lingual gyrus", ["LiG"], ["lingual-gyrus", "occipital-lobe"], None),
       ("OccL", "Lateral occipital gyri", ["SOG", "IOG", "OP"], ["lateral-occipital-gyrus-middle-occipital-gyrus", "occipital-lobe"], None),
       ("Olf", "Olfactory cortex", ["OB", "AON", "Pir"], ["olfactory-nerve-i"], "piriform-cortex")]
for k, nm, acr, ids, sl in CTX:
    lab(k, nm, acr, "ctx", 0, "ctx", ids, slug=sl)

KEYS = [s["key"] for s in SPEC]
IDX = {k: i + 1 for i, k in enumerate(KEYS)}  # 0 = no label (outside, sulcal CSF)
assert len(KEYS) < 255


# ---------------------------------------------------------------- 1. MNI label volume
def mni_labels():
    cache = os.path.join(W, "mni_labels.npy")
    if os.path.exists(cache) and not REDO:
        return np.load(cache)
    L = np.zeros(A.shape, np.uint8)
    lut = np.zeros(int(A.max()) + 1, np.uint8)
    used = set()
    for s in SPEC:
        for a in s["acr"]:
            if a not in ACR: raise SystemExit(f"unknown Allen acronym {a}")
            lut[ACR[a]] = IDX[s["key"]]; used.add(ACR[a])
    present = set(int(i) for i in np.unique(A)) - {0}
    missing = sorted(sv.R[i]["acronym"] for i in present - used)
    log("Allen labels without a slot:", missing)
    L[:] = lut[A]
    def m(*keys): return np.isin(L, [IDX[k] for k in keys])
    # the mirrored annotation leaves the exact midline column empty in places (vermis, medial cortex): copy the neighbours
    x0 = int(round(-AFF[0, 3] / VOX))
    a, b = L[x0 - 1], L[x0 + 1]
    fix = (L[x0] == 0) & (a == b) & (a > 0)
    L[x0][fix] = a[fix]
    log(f"midline column: {int(fix.sum())} voxels copied from the neighbours")
    # Harvard AAN nuclei and the derived internal capsule limbs from build_atlas2's volume (same grid)
    a2 = json.load(open(os.path.join(ROOT, "public/atlas2/atlas2.json")))
    v1 = np.load(os.path.join(ROOT, "_atlas/atlas2_build/vol1.npy"), mmap_mode="r")
    k1 = {l["key"]: l["id"] for l in a2["leaf1"]}
    for k in ("PAG", "ICa", "ICg", "ICp", "LC", "DR", "MnR", "VTA", "LDTg", "mRt", "PBC", "PnO", "PTg"):
        mk = np.asarray(v1 == k1[k])
        if k.startswith("IC"): mk &= m("FWM")  # the capsule only takes white matter
        L[mk] = IDX[k]
    del v1
    # HCP-842 medial lemniscus and MLF inside the brainstem tegmentum
    v2 = np.load(os.path.join(ROOT, "_atlas/atlas2_build/vol2.npy"), mmap_mode="r")
    k2 = {l["key"]: l["id"] for l in a2["leaf2"]}
    teg = m("MTg", "PnTg", "MoTg", "mRt", "PnO")
    for k in ("ML", "MLF"):
        L[np.asarray(v2 == k2[k]) & teg] = IDX[k]
    del v2
    # ---- derived (in a central crop: the distance maps of the full 0.5 mm grid would not fit in memory) ----
    full = L
    C = tuple(slice(max(0, int((a - AFF[i, 3]) / VOX)), min(A.shape[i], int((b - AFF[i, 3]) / VOX))) for i, (a, b) in enumerate(((-62, 62), (-100, 62), (-62, 48))))
    L = full[C]  # a view: writes go to the full volume
    Ac = A[C]
    x, y, z = (mni_axes()[i][C[i]] for i in range(3))
    X = x[:, None, None]; Y = y[None, :, None]; Z = z[None, None, :]
    x0 = int(round(-x[0] / VOX))
    def m(*keys): return np.isin(L, [IDX[k] for k in keys])
    # corpus callosum parts: genu = anterior fifth, splenium = posterior fifth of its midline length (Witelson-style split)
    cc = Ac == ACR["cc"]
    ys = np.argwhere(cc[x0 - 6:x0 + 7])[:, 1] * VOX + y[0]
    y0, y1 = ys.min(), ys.max(); Lc = y1 - y0
    L[cc & (Y > y1 - 0.2 * Lc)] = IDX["CCg"]
    L[cc & (Y < y0 + 0.2 * Lc)] = IDX["CCs"]
    L[cc & (Y <= y1 - 0.2 * Lc) & (Y >= y0 + 0.2 * Lc)] = IDX["CCb"]
    log(f"corpus callosum y {y0:.1f}..{y1:.1f} mm: genu > {y1 - 0.2 * Lc:.1f}, splenium < {y0 + 0.2 * Lc:.1f}")
    # fornix parts. columns: in front of the thalamus, below the body (they arch down behind the anterior commissure);
    # fimbria: along the hippocampus in the temporal lobe; crus: the posterior limbs behind the thalamus; body: the rest
    fx = Ac == ACR["fx"]
    thal = np.isin(Ac, [ACR[k] for k in ("THM", "ANC", "MD", "VA", "LD", "Re", "MiN")])
    tyx = np.argwhere(thal)[:, 1] * VOX + y[0]
    y_ant = tyx.max()
    tz = np.argwhere(thal)[:, 2] * VOX + z[0]
    z_top = np.percentile(tz, 90)
    fim = fx & (Z < -4) & (np.abs(X) > 14)
    col = fx & ~fim & (Y > y_ant - 3) & (Z < z_top)
    crus = fx & ~fim & ~col & (Y < -22)
    body = fx & ~fim & ~col & ~crus
    L[fim] = IDX["FIM"]; L[col] = IDX["FXc"]; L[crus] = IDX["FXr"]; L[body] = IDX["FXb"]
    log(f"fornix: columns {int(col.sum())}, body {int(body.sum())}, crus {int(crus.sum())}, fimbria {int(fim.sum())} voxels (thalamus front y {y_ant:.1f})")
    # interthalamic adhesion: thalamic grey bridging the third ventricle (within 1 mm of the midline)
    ia = thal & (np.abs(X) <= 1.0)
    L[ia] = IDX["IA"]
    log(f"interthalamic adhesion {int(ia.sum())} voxels")
    # septum pellucidum: the thin midline sheet between the two lateral ventricles (white matter, septal or unlabelled voxels
    # within 2 mm of the midline that have a lateral ventricle within 3 mm on both sides), below the callosum
    lv = m("aLV", "bLV", "xLV", "pLV", "iLV")
    dL = ndi.distance_transform_edt(~(lv & (X < 0)), sampling=VOX)
    dR = ndi.distance_transform_edt(~(lv & (X > 0)), sampling=VOX)
    sp = (np.abs(X) <= 2.0) & (dL <= 3.0) & (dR <= 3.0) & (m("FWM", "SEP") | (L == 0))
    L[sp] = IDX["SP"]
    del dL, dR
    log(f"septum pellucidum {int(sp.sum())} voxels")
    # choroid plexus: in the choroid fissure, the cleft of the lateral ventricle between the fornix (or fimbria) and the
    # thalamus (body), the crus (atrium, glomus) and the hippocampus (inferior horn); CSF voxels within 2.5 mm of the fornix
    # and 4 mm of the thalamus or hippocampus
    fxall = m("FXc", "FXb", "FXr", "FIM")
    dfx = ndi.distance_transform_edt(~fxall, sampling=VOX)
    dth = ndi.distance_transform_edt(~thal, sampling=VOX)
    dhi = ndi.distance_transform_edt(~m("HiH", "HiB", "HiT"), sampling=VOX)
    cp = lv & (dfx <= 2.5) & ((dth <= 4.0) | (dhi <= 3.0)) & ~m("aLV")
    cp = ndi.binary_opening(cp, iterations=1)
    L[cp] = IDX["CP"]
    del dfx, dth, dhi
    log(f"choroid plexus {int(cp.sum())} voxels")
    # optic chiasm: the optic tracts meet at the midline (the Allen tract stops 2.5 mm short): bridge them within 8 mm
    ot = m("ot")
    och = ot & (np.abs(X) <= 8.0)
    bridge = ndi.binary_closing(och, structure=np.ones((13, 1, 1), bool)) & (np.abs(X) <= 8.0)
    L[bridge & ((L == 0) | m("ot", "HTHpo", "HTHso", "FWM"))] = IDX["OCh"]
    log(f"optic chiasm {int((L == IDX['OCh']).sum())} voxels")
    # posterior commissure: white bundle across the midline at the junction of the third ventricle and the aqueduct, under
    # the pineal and habenula, rostral to the superior colliculus: midline white/unlabelled voxels within 2 mm of both the
    # aqueduct/third ventricle and the pretectum/pineal
    dAq = ndi.distance_transform_edt(~m("Aq"), sampling=VOX)
    dPre = ndi.distance_transform_edt(~m("PTR", "Pin", "HN"), sampling=VOX)
    dSC = ndi.distance_transform_edt(~m("SC"), sampling=VOX)
    pc = (np.abs(X) <= 4.5) & (dAq <= 2.0) & (dPre <= 2.0) & (dSC <= 3.5) & (m("FWM", "PTR", "MTg") | (L == 0))
    L[pc] = IDX["PC"]
    del dAq, dPre, dSC
    log(f"posterior commissure {int(pc.sum())} voxels")
    # external capsule (putamen | claustrum) and extreme capsule (claustrum | insular cortex): white matter in the gap
    wm = m("FWM")
    dPu = ndi.distance_transform_edt(~m("Pu"), sampling=VOX)
    dCl = ndi.distance_transform_edt(~m("Cla"), sampling=VOX)
    dIn = ndi.distance_transform_edt(~m("Ins"), sampling=VOX)
    ec = wm & (dPu <= 4.0) & (dCl <= 4.0) & (dPu <= dIn)
    exc = wm & (dCl <= 3.0) & (dIn <= 3.0) & (dIn < dPu)
    L[ec] = IDX["EC"]; L[exc] = IDX["ExC"]
    del dPu, dCl, dIn
    log(f"external capsule {int(ec.sum())}, extreme capsule {int(exc.sum())} voxels")
    # centrum semiovale: hemispheric white matter above the corpus callosum
    zcc = (np.argwhere(cc[x0 - 4:x0 + 5])[:, 2] * VOX + z[0]).max()
    L[m("FWM") & (Z > zcc + 2)] = IDX["CSO"]
    # hindbrain white matter: inside the cerebellum it is the arbor vitae; in the brainstem it keeps "brainstem white matter"
    cbm = m("CBV", "CBPV", "CBL", "DN")
    cbc = ndi.binary_fill_holes(ndi.binary_closing(np.pad(cbm, 6), sv.ball(5))[6:-6, 6:-6, 6:-6])
    L[m("BSW") & cbc] = IDX["CBW"]
    # forebrain white matter inside the brainstem (thin Allen rims between its parts): the nearest brainstem part
    bs = m("MTg", "PnTg", "MoTg", "PnBa", "MoPy", "IO", "cpd", "SN", "RN", "PAG", "SC", "IC", "scp", "mcp", "icp", "BSW", "Aq", "4V", "LC", "DR", "MnR", "VTA", "LDTg", "mRt", "PBC", "PnO", "PTg", "ML", "MLF")
    rim = m("FWM") & (Z < -8) & (ndi.distance_transform_edt(~bs, sampling=VOX) <= 1.6)
    if rim.any():
        _, ind = ndi.distance_transform_edt(~bs, return_indices=True)
        L[rim] = L[tuple(i[rim] for i in ind)]
        del ind
    log(f"brainstem rims re-assigned: {int(rim.sum())} voxels")
    L = full
    np.save(cache, L)
    return L


# ---------------------------------------------------------------- 2. into Z space
def z_box():
    """Box of every non-cortical label in Z space (1 mm pass), padded 3 mm, on the field's 0.5 mm grid."""
    import section_hires as sh
    corner, lo1, shape1, lo05, shape05 = sh.grids()
    return corner, lo05, shape05


def warp_labels(L):
    cache = os.path.join(W, "z_labels.npz")
    if os.path.exists(cache) and not REDO:
        z = np.load(cache); return z["lab"], z["lo"], z["shape"]
    v, vstep = sv.register()
    corner, lo05, shape05 = z_box()
    # the 1 mm pass finds the interior box (every label but cortex and generic white matter), the 0.5 mm pass fills it
    lo1 = corner + 0.0005; sh1 = (shape05 // 2)
    c = sv.mapping(v, vstep, lo1, sh1, 0.001)
    l1 = ndi.map_coordinates(L, c, order=0, mode="constant")
    del c
    inner = np.isin(l1, [IDX[s["key"]] for s in SPEC if s["cls"] not in ("ctx", "wm")])
    nz = np.argwhere(inner)
    a0 = np.maximum(nz.min(0) * 2 - 6, 0); a1 = np.minimum(nz.max(0) * 2 + 8, shape05)
    lo = lo05 + a0 * STEP; shape = (a1 - a0).astype(int)
    log("interior box (0.5 mm voxels)", shape.tolist(), "origin", lo.round(4).tolist())
    out = np.zeros(tuple(shape), np.uint8)
    CH = 24
    for x0 in range(0, shape[0], CH):
        n = min(CH, shape[0] - x0)
        lo_s = lo + np.array([x0 * STEP, 0, 0]); shs = np.array([n, shape[1], shape[2]])
        c = sv.mapping(v, vstep, lo_s, shs, STEP)
        out[x0:x0 + n] = ndi.map_coordinates(L, c, order=0, mode="constant")
    np.savez_compressed(cache, lab=out, lo=lo, shape=shape)
    return out, lo, shape


def z_solid(lo, shape):
    zm = sv.z_masks()
    sol = sv.FILL | zm["brainstem"] | zm["cerebellum"]
    return sv.resample_z_mask(sol, lo, shape, STEP)


def z_fix(lab, lo, shape):
    """Clip to the Z-Anatomy brain; its voxels outside the (closed) template brain take the nearest label."""
    sol = z_solid(lo, shape)
    cut = int(((lab > 0) & ~sol).sum())
    lab = np.where(sol, lab, 0).astype(np.uint8)
    # the closed template brain, at 1 mm (closing at 0.5 mm with a 3 mm ball is slow)
    c1 = ndi.binary_fill_holes(ndi.binary_closing(np.pad(lab[::2, ::2, ::2] > 0, 5), sv.ball(3))[5:-5, 5:-5, 5:-5])
    brainA = np.repeat(np.repeat(np.repeat(c1, 2, 0), 2, 1), 2, 2)[: shape[0], : shape[1], : shape[2]]
    gap = sol & ~brainA
    if gap.any():
        _, ind = ndi.distance_transform_edt(lab == 0, return_indices=True)
        lab[gap] = lab[tuple(i[gap] for i in ind)]
        del ind
    log(f"Z clip: {cut} labelled voxels outside the Z-Anatomy brain removed, {int(gap.sum())} rim voxels filled")
    return lab


def smooth_boundaries(lab, sigma=0.6):
    """Winner label and boundary value m = g_best - g_second of the Gaussian-smoothed indicators (per label, in its own box)."""
    best = np.zeros(lab.shape, np.float32); second = np.zeros(lab.shape, np.float32); win = np.zeros(lab.shape, np.uint8)
    pad = 4
    for k in np.unique(lab):
        if k == 0:
            g = ndi.gaussian_filter((lab == 0).astype(np.float32), sigma)
            sl = tuple(slice(0, n) for n in lab.shape)
        else:
            nz = np.argwhere(lab == k)
            a0 = np.maximum(nz.min(0) - pad, 0); a1 = np.minimum(nz.max(0) + pad + 1, lab.shape)
            sl = tuple(slice(a, b) for a, b in zip(a0, a1))
            g = ndi.gaussian_filter((lab[sl] == k).astype(np.float32), sigma)
        b = best[sl]; s = second[sl]; w = win[sl]
        up = g > b
        s[up] = b[up]; s[~up] = np.maximum(s[~up], g[~up])
        b[up] = g[up]; w[up] = k
    lost = sorted(set(int(i) for i in np.unique(lab)) - set(int(i) for i in np.unique(win)))
    if lost: log("labels lost to smoothing:", [KEYS[i - 1] for i in lost if i])
    m = np.clip(best - second, 0, 1)
    return win, m


# ---------------------------------------------------------------- 3. checks: Dice against the Z-Anatomy meshes, overlays
DICE = {"caudate": ("CaH", "CaB", "CaT"), "putamen": ("Pu",), "pallidum": ("GPe", "GPi"), "thalamus": ("ANC", "MD", "LD", "LP", "Pul", "VA", "VL", "VPL", "VPM", "CM", "MiN", "THM", "IA", "LGN", "MGN"),
        "hippocampus": ("HiH", "HiB", "HiT"), "amygdala": ("AMY",), "latvent": ("aLV", "bLV", "xLV", "pLV", "iLV", "CP"), "v3": ("3V",), "v4": ("4V",),
        "cc": ("CCg", "CCb", "CCs"), "aq": ("Aq",), "cerebellum": ("CBV", "CBPV", "CBL", "CBW", "DN"),
        "brainstem": ("MTg", "PnTg", "MoTg", "PnBa", "MoPy", "IO", "cpd", "SN", "RN", "PAG", "SC", "IC", "scp", "icp", "BSW", "Aq", "4V", "LC", "DR", "MnR", "VTA", "LDTg", "mRt", "PBC", "PnO", "PTg", "ML", "MLF", "PTR")}


def dice(lab, lo, shape):
    zm = sv.z_masks()
    out = {}
    old = json.load(open(os.path.join(ROOT, "_atlas/section/dice.json"))) if os.path.exists(os.path.join(ROOT, "_atlas/section/dice.json")) else {}
    for k, keys in DICE.items():
        zk = sv.resample_z_mask(zm[k], lo, shape, STEP)
        lk = np.isin(lab, [IDX[x] for x in keys])
        if k in ("cerebellum",): lk = ndi.binary_fill_holes(lk)
        d = 2 * (lk & zk).sum() / max(1, lk.sum() + zk.sum())
        out[k] = dict(dice=round(float(d), 3), affine=old.get(k, {}).get("affine"))
        log(f"  dice {k:12s} {d:.3f}  (affine only {out[k]['affine']})")
    json.dump(out, open(os.path.join(W, "dice.json"), "w"), indent=1)
    return out


def overlays(lab, lo, shape):
    from PIL import Image, ImageDraw
    rng = np.random.default_rng(7)
    pal = np.zeros((256, 3), np.uint8)
    for s in SPEC:
        i = IDX[s["key"]]
        if s["cls"] == "ctx": pal[i] = (150, 135, 128)
        elif s["cls"] in ("wm",): pal[i] = (238, 232, 220)
        elif s["cls"] == "cb": pal[i] = (175, 150, 140)
        elif s["cls"] == "csf": pal[i] = (40, 50, 80)
        elif s["cls"] == "plx": pal[i] = (190, 80, 110)
        elif s["cls"] == "w": pal[i] = (250, 248, 238)
        else: pal[i] = rng.integers(70, 230, 3)
    sol_all = z_solid(lo, shape)
    views = {"mid": (0, 0.0), "par4": (0, -0.004), "cor_ac": (2, 0.0141), "cor_thal": (2, -0.004), "cor_sn": (2, -0.012), "ax_thal": (1, 1.625)}
    for nm, (axis, wv) in views.items():
        k = int(round((wv - lo[axis]) / STEP))
        if not 0 <= k < shape[axis]: continue
        s = np.take(lab, k, axis=axis)
        img = pal[s].copy()
        edge = np.zeros(s.shape, bool); edge[:-1] |= s[:-1] != s[1:]; edge[:, :-1] |= s[:, :-1] != s[:, 1:]
        img[edge] = (20, 20, 20)
        # Z-Anatomy outline of the brain solid and the brainstem/cerebellum meshes (green)
        sol = np.take(sol_all, k, axis=axis)
        img[sol & ~ndi.binary_erosion(sol)] = (0, 200, 0)
        img = img.transpose(1, 0, 2)[::-1]
        if axis != 0: img = img[:, ::-1]
        up = 3
        im = Image.fromarray(img).resize((img.shape[1] * up, img.shape[0] * up), Image.NEAREST)
        d = ImageDraw.Draw(im)
        for i in np.unique(s):
            if i == 0: continue
            mk = s == i
            lb, n = ndi.label(mk)
            for j in range(1, n + 1):
                p = np.argwhere(lb == j)
                if len(p) < 30: continue
                c = p.mean(0)
                col = c[0] if axis == 0 else s.shape[0] - 1 - c[0]
                d.text((col * up, (s.shape[1] - 1 - c[1]) * up), KEYS[i - 1], fill=(0, 0, 0))
        im.save(os.path.join(W, f"ov_{nm}.png"))


# ---------------------------------------------------------------- 4. table + file
HUES = {"g": "#b6a7a0", "w": "#efe7d6", "csf": "#4f5d77", "plx": "#b0566f", "ctx": "#a8988f", "wm": "#efe7d6", "cb": "#b09a8c"}


def table(win, lo, shape, index_ids):
    rows = []
    gid = {}
    for s in SPEC:
        i = IDX[s["key"]]
        ids = [x for x in s["ids"] if x in index_ids]
        g = gid.setdefault(s["grp"], len(gid) + 1)
        rows.append(dict(i=i, key=s["key"], name=s["name"], slug=s["slug"], ids=ids, cls=s["cls"], tone=s["tone"], grp=g, sub=s["sub"]))
    # centroid, bounds, best cut (largest cross-section) per label, in world metres
    objs = ndi.find_objects(win)
    for r in rows:
        sl = objs[r["i"] - 1] if r["i"] - 1 < len(objs) else None
        if sl is None: r["vox"] = 0; continue
        mk = win[sl] == r["i"]
        r["vox"] = int(mk.sum())
        off = np.array([s_.start for s_ in sl])
        p = np.argwhere(mk) + off
        w = lo + p * STEP
        r["centroid"] = [round(float(v), 5) for v in w.mean(0)]
        r["min"] = [round(float(v), 5) for v in w.min(0)]
        r["max"] = [round(float(v), 5) for v in w.max(0)]
        best = []
        for ax in range(3):
            prof = np.bincount(p[:, ax] - p[:, ax].min())
            kk = int(prof.argmax()) + p[:, ax].min()
            best.append(round(float(lo[ax] + kk * STEP), 5))
        r["best"] = best
    missing = [r["key"] for r in rows if not r.get("vox")]
    if missing: log("labels with no voxels in Z space:", missing)
    return rows


def write(win, m, lo, shape, rows):
    nx, ny, nz = shape
    head = (b"AIL1" + struct.pack("<4H", nx, ny, nz, len(rows)) + struct.pack("<3f", *(lo - STEP / 2)) + struct.pack("<f", STEP)).ljust(64, b"\0")
    m8 = np.clip(np.round(m * 255), 0, 255).astype(np.uint8)
    # deep inside a region the boundary value is irrelevant: flatten it (smaller file)
    m8[m8 > 200] = 255
    rg = np.stack([win, m8], -1)
    data = head + np.ascontiguousarray(rg.transpose(2, 1, 0, 3)).tobytes()
    out = os.path.join(ROOT, "public/atlas/interior.bin.gz")
    with gzip.open(out, "wb", compresslevel=9) as f: f.write(data)
    ver = hashlib.sha1(data).hexdigest()[:10]
    meta = dict(version=ver, corner=[float(v) for v in lo - STEP / 2], step=STEP, dims=[int(nx), int(ny), int(nz)], labels=rows,
                sources=["Allen Human Reference Atlas 3D 2020 (CC BY 4.0)", "Harvard Ascending Arousal Network atlas v2.0 (CC0)",
                         "Advanced Atlas of 80 Bundles / HCP-842 (CC BY 4.0)", "ICBM 2009b template (MNI/McGill)", "Z-Anatomy (CC BY-SA 4.0)"])
    json.dump(meta, open(os.path.join(ROOT, "public/atlas/interior.json"), "w", encoding="utf8"), separators=(",", ":"), ensure_ascii=False)
    src = ("/** Content hash of public/atlas/interior.bin.gz (written by tools/atlas/interior_labels.py), used as a cache key. */
"
           f'export const INTERIOR_VERSION = "{ver}";
')
    open(os.path.join(ROOT, "src/components/atlas/section/interior-version.ts"), "w", newline="
").write(src)
    log("wrote", out, os.path.getsize(out) // 1024, "KB; raw", len(data) // 1024, "KB; interior.json",
        os.path.getsize(os.path.join(ROOT, "public/atlas/interior.json")) // 1024, "KB; version", ver)


if __name__ == "__main__":
    L = mni_labels()
    lab, lo, shape = warp_labels(L)
    del L
    lab = z_fix(lab, lo, shape)
    win, m = smooth_boundaries(lab)
    idx = json.load(open(os.path.join(ROOT, "public/atlas/index.json"), encoding="utf8"))["structures"]
    rows = table(win, lo, shape, set(idx) | {"olfactory-nerve-i"})
    write(win, m, lo, shape, rows)
    dice(win, lo, shape)
    overlays(win, lo, shape)
    log("done")
