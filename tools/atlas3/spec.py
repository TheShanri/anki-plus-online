"""Atlas v3: the structure table (one row per label of the v3 volume, before the left/right split).

Every label is a LEAF: a region of the 0.5 mm label volume (tools/atlas3/labels.py). Groups (lobes, thalamus,
lateral ventricle ...) are defined in GROUPS below and are unions of leaves; the viewer selects a group by lighting
its leaves.

Row fields
  key     short code (unique); the left/right copies become KEY.L / KEY.R (patient's left / right)
  name    display name (course wording where the course names it)
  src     where the voxels come from: Allen HRA 3D 2020 acronyms ("ahra:PrCG,..."), "aan:LC" (Harvard AAN v2, CC0),
          "v1:ICa" (atlas2 derived volume, same grid), "hcp:ML" (HCP-842 80 bundles, CC BY 4.0), or "derived"
          (computed in labels.py, documented there)
  tissue  ctx cortex | gm grey nucleus | wm white matter | tract compact tract | csf ventricle | plx choroid plexus |
          cbx cerebellar cortex | bs brainstem region
  side    LR (split at the midline into .L / .R) | M (one midline structure)
  course  course structure slugs (content/nsci3250/structures.json) this leaf belongs to
  quality exact | derived | regional (the source only has the enclosing region)
"""

ROWS = []


def row(key, name, src, tissue, side="LR", course=(), quality="exact", stage=False):
    """stage: an intermediate key, used while composing and fully rewritten into other keys before the split"""
    ROWS.append(dict(key=key, name=name, src=src, tissue=tissue, side=side, course=list(course), quality=quality, stage=stage))


# ------------------------------------------------------------------ cerebral cortex (Allen gyri, Ding et al. 2016)
F, P, T, O, L, I = "frontal-lobe", "parietal-lobe", "temporal-lobe", "occipital-lobe", "limbic", "insular-cortex"
CX = ["cerebral-cortex", "cortical-ribbon", "gyrus"]
row("SFG", "Superior frontal gyrus", "ahra:SFG", "ctx", course=["superior-frontal-gyrus", F, "prefrontal-cortex", *CX])
row("PaCG", "Paracingulate gyrus", "ahra:PaCG", "ctx", course=["superior-frontal-gyrus", F, *CX])
row("MFG", "Middle frontal gyrus", "ahra:MFG", "ctx", course=["middle-frontal-gyrus", F, "prefrontal-cortex", *CX])
row("IFGop", "Inferior frontal gyrus, pars opercularis", "ahra:IFGop", "ctx", course=["inferior-frontal-gyrus", F, *CX])
row("IFGtr", "Inferior frontal gyrus, pars triangularis", "ahra:IFGtr", "ctx", course=["inferior-frontal-gyrus", F, *CX])
row("FrO", "Frontal operculum", "ahra:FrO", "ctx", course=["inferior-frontal-gyrus", F, *CX])
row("PrCG", "Precentral gyrus", "ahra:PrCG", "ctx", course=["precentral-gyrus", F, "primary-motor-cortex", *CX])
row("PCLr", "Paracentral lobule, anterior part", "ahra:PCLr", "ctx", course=[F, *CX])
row("PCLc", "Paracentral lobule, posterior part", "ahra:PCLc", "ctx", course=[P, *CX])
row("ReG", "Gyrus rectus (straight gyrus)", "ahra:ReG", "ctx", course=[F, "ventromedial-prefrontal-cortex", "orbitofrontal-cortex", *CX])
row("MOrG", "Medial orbital gyrus", "ahra:MOrG", "ctx", course=[F, "orbitofrontal-cortex", *CX])
row("AOrG", "Anterior orbital gyrus", "ahra:AOrG", "ctx", course=[F, "orbitofrontal-cortex", *CX])
row("POrG", "Posterior orbital gyrus", "ahra:POrG", "ctx", course=[F, "orbitofrontal-cortex", *CX])
row("LOrG", "Lateral orbital gyrus", "ahra:LOrG", "ctx", course=[F, "orbitofrontal-cortex", *CX])
row("LOG", "Lateral olfactory gyrus", "ahra:LOG", "ctx", course=[F, *CX])
row("FP", "Frontal pole", "ahra:FP", "ctx", course=[F, "prefrontal-cortex", *CX])
row("FMG", "Frontomarginal gyrus", "ahra:FMG", "ctx", course=[F, "prefrontal-cortex", *CX])
row("RoG", "Rostral gyrus", "ahra:RoG", "ctx", course=[F, "ventromedial-prefrontal-cortex", *CX])
row("SCG", "Subcallosal (parolfactory) gyrus", "ahra:SCG", "ctx", course=[L, *CX])
row("PoCG", "Postcentral gyrus", "ahra:PoCG", "ctx", course=["postcentral-gyrus", P, "primary-somatosensory-cortex", *CX])
row("SPL", "Superior parietal lobule", "ahra:SPL", "ctx", course=["superior-parietal-lobule", P, "somatosensory-association-cortex", *CX])
row("SMG", "Supramarginal gyrus", "ahra:SMG", "ctx", course=["inferior-parietal-lobule", P, *CX])
row("AnG", "Angular gyrus", "ahra:AnG", "ctx", course=["inferior-parietal-lobule", P, *CX])
row("PrCun", "Precuneus", "ahra:PrCun", "ctx", course=[P, *CX])
row("PaO", "Parietal operculum", "ahra:PaO", "ctx", course=[P, *CX])
row("STG", "Superior temporal gyrus", "ahra:STG", "ctx", course=["superior-temporal-gyrus", T, "auditory-association-area", *CX])
row("PLT", "Planum temporale", "ahra:PLT", "ctx", course=["superior-temporal-gyrus", T, "auditory-association-area", *CX])
row("PLP", "Planum polare", "ahra:PLP", "ctx", course=["superior-temporal-gyrus", T, *CX])
row("TTG", "Transverse temporal gyrus (Heschl)", "ahra:TTG", "ctx", course=["transverse-temporal-gyrus", T, "primary-auditory-cortex", *CX])
row("MTG", "Middle temporal gyrus", "ahra:MTG", "ctx", course=["middle-temporal-gyrus", T, "temporal-lobe-general-association-area", *CX])
row("ITG", "Inferior temporal gyrus", "ahra:ITG", "ctx", course=["inferior-temporal-gyrus", T, "temporal-lobe-general-association-area", *CX])
row("TP", "Temporal pole", "ahra:TP", "ctx", course=[T, *CX])
row("FuGt", "Fusiform gyrus, temporal part", "ahra:FuGt", "ctx", course=[T, "ventral-visual-stream", *CX])
row("FuGo", "Fusiform gyrus, occipital part", "ahra:FuGo", "ctx", course=[O, "ventral-visual-stream", "visual-association-cortex", *CX])
row("PRG", "Perirhinal gyrus", "ahra:PRG", "ctx", course=[T, *CX])
row("APH", "Parahippocampal gyrus, anterior part", "ahra:APH", "ctx", course=["parahippocampal-gyrus", L, *CX])
row("PPH", "Parahippocampal gyrus, posterior part", "ahra:PPH", "ctx", course=["parahippocampal-gyrus", L, *CX])
row("AG", "Ambient gyrus (uncus)", "ahra:AG", "ctx", course=["uncus", "parahippocampal-gyrus", L, *CX])
row("CgGr", "Cingulate gyrus, anterior part", "ahra:CgGr", "ctx", course=["cingulate-gyrus", "anterior-cingulate-cortex", L, *CX])
row("CgGc", "Cingulate gyrus, posterior part", "ahra:CgGc", "ctx", course=["cingulate-gyrus", L, *CX])
row("IsCPH", "Isthmus of the cingulate gyrus", "ahra:IsCPH", "ctx", course=["cingulate-gyrus", L, *CX])
row("Cun", "Cuneus", "ahra:Cun", "ctx", course=[O, "visual-association-cortex", *CX])
row("LiG", "Lingual gyrus", "ahra:LiG", "ctx", course=[O, "visual-association-cortex", *CX])
row("SOG", "Superior occipital gyrus", "ahra:SOG", "ctx", course=[O, "visual-association-cortex", *CX])
row("IOG", "Inferior occipital gyrus", "ahra:IOG", "ctx", course=[O, "visual-association-cortex", *CX])
row("OP", "Occipital pole", "ahra:OP", "ctx", course=[O, "primary-visual-cortex", *CX])
row("SIG", "Short insular gyri", "ahra:SIG", "ctx", course=[I, *CX])
row("LIG", "Long insular gyrus", "ahra:LIG", "ctx", course=[I, *CX])
row("LI", "Limen insulae", "ahra:LI", "ctx", course=[I, *CX])
row("FI", "Frontal agranular insular cortex", "ahra:FI", "ctx", course=[I, *CX])
row("TI", "Temporal agranular insular cortex", "ahra:TI", "ctx", course=[I, *CX])
row("OB", "Olfactory bulb", "ahra:OB", "gm", course=["olfactory-bulb"])
row("AON", "Anterior olfactory nucleus", "ahra:AON", "gm", course=["olfactory-bulb", "paleocortex"])
row("Pir", "Piriform cortex", "ahra:Pir", "ctx", course=["piriform-cortex", "paleocortex", "allocortex", *CX])
row("HiH", "Hippocampus, head", "ahra:HiH", "ctx", course=["hippocampus", "archicortex", "allocortex"])
row("HiB", "Hippocampus, body", "ahra:HiB", "ctx", course=["hippocampus", "archicortex", "allocortex"])
row("HiT", "Hippocampus, tail", "ahra:HiT", "ctx", course=["hippocampus", "archicortex", "allocortex"])

# ------------------------------------------------------------------ basal ganglia, basal forebrain, amygdala
BG = ["basal-ganglia"]
row("CaH", "Head of caudate nucleus", "ahra:CaH", "gm", course=["head-of-caudate-nucleus", "caudate-nucleus", "corpus-striatum", *BG])
row("CaB", "Body of caudate nucleus", "ahra:CaB", "gm", course=["body-of-caudate-nucleus", "caudate-nucleus", "corpus-striatum", *BG])
row("CaT", "Tail of caudate nucleus", "ahra:CaT", "gm", course=["tail-of-caudate-nucleus", "caudate-nucleus", "corpus-striatum", *BG])
row("Pu", "Putamen", "ahra:Pu,PuPV", "gm", course=["putamen", "lentiform-nucleus", "corpus-striatum", *BG])
row("GPe", "Globus pallidus, external segment", "ahra:GPe", "gm", course=["globus-pallidus", "lentiform-nucleus", "corpus-striatum", *BG])
row("GPi", "Globus pallidus, internal segment", "ahra:GPi", "gm", course=["globus-pallidus", "lentiform-nucleus", "corpus-striatum", *BG])
row("NAC", "Nucleus accumbens", "ahra:NAC", "gm", course=["nucleus-accumbens", *BG])
row("Cla", "Claustrum", "ahra:Cla", "gm")
row("SEP", "Septal nuclei", "ahra:SEP", "gm", course=["basal-forebrain-nuclei"])
row("BF", "Basal forebrain (substantia innominata)", "ahra:BF", "gm", course=["basal-forebrain-nuclei", "anterior-perforated-substance"])
row("BNST", "Bed nucleus of the stria terminalis", "ahra:BNST", "gm", course=["bed-nucleus-of-the-stria-terminalis"])
row("AMY", "Amygdala", "ahra:AMY,AAA,CEN,CoA,CoP,Me,AHA,La,BL,BM", "gm", course=["amygdala"])

# ------------------------------------------------------------------ diencephalon
TH = ["thalamus", "diencephalon"]
row("ANC", "Anterior nucleus of thalamus", "ahra:ANC", "gm", course=["anterior-nucleus-of-thalamus", *TH])
row("MD", "Mediodorsal nucleus of thalamus", "ahra:MD", "gm", course=["mediodorsal-nucleus", *TH])
row("LD", "Lateral dorsal nucleus of thalamus", "ahra:LD", "gm", course=TH)
row("LP", "Lateral posterior nucleus of thalamus", "ahra:LP", "gm", course=TH)
row("Pul", "Pulvinar", "ahra:Pul", "gm", course=["pulvinar", *TH])
row("VA", "Ventral anterior nucleus of thalamus", "ahra:VA", "gm", course=["va-vl-nuclei", *TH])
row("VL", "Ventral lateral nucleus of thalamus", "ahra:VL", "gm", course=["va-vl-nuclei", *TH])
row("VPL", "Ventral posterolateral nucleus (VPL)", "ahra:VPL", "gm", course=["ventral-posterolateral-nucleus", *TH])
row("VPM", "Ventral posteromedial nucleus (VPM)", "ahra:VPM", "gm", course=["ventral-posteromedial-nucleus", *TH])
row("LGN", "Lateral geniculate nucleus", "ahra:DLG", "gm", course=["lateral-geniculate-nucleus", *TH])
row("MGN", "Medial geniculate nucleus", "ahra:MG", "gm", course=["medial-geniculate-nucleus", *TH])
row("CM", "Centromedian and parafascicular nuclei", "ahra:CM,Pf", "gm", course=TH)
row("MiN", "Midline nuclei of thalamus", "ahra:MiN,Re", "gm", course=TH)
row("THM", "Thalamus (other nuclei)", "ahra:THM", "gm", course=TH)
row("IA", "Interthalamic adhesion", "derived", "gm", side="M", course=["interthalamic-adhesion", "thalamus", "diencephalon"], quality="derived")
row("HN", "Habenula", "ahra:HN", "gm", course=["habenula", "epithalamus", "diencephalon"])
row("Pin", "Pineal gland", "ahra:Pin", "gm", side="M", course=["pineal-gland", "epithalamus", "diencephalon"])
row("ZI", "Zona incerta", "ahra:ZI", "gm", course=["diencephalon"])
row("STN", "Subthalamic nucleus", "ahra:STH", "gm", course=["subthalamic-nucleus", "diencephalon"])
HY = ["hypothalamus", "diencephalon"]
row("HTpo", "Hypothalamus, preoptic region", "ahra:HTH,HTHpo", "gm", course=HY)
row("HTso", "Hypothalamus, supraoptic region", "ahra:HTHso", "gm", course=HY)
row("HTtu", "Hypothalamus, tuberal region", "ahra:HTHtub", "gm", course=HY)
row("MB", "Mammillary body", "ahra:HTHma", "gm", course=["mammillary-bodies", *HY])
row("SCN", "Suprachiasmatic nucleus", "derived", "gm", course=["suprachiasmatic-nucleus", *HY], quality="derived")
row("PTR", "Pretectal area", "ahra:PTR", "gm", course=["pretectal-nucleus", "midbrain"])

# ------------------------------------------------------------------ white matter of the forebrain
row("FWM", "Cerebral white matter", "ahra:FWM", "wm", course=["white-matter"])
row("CR", "Corona radiata", "v1:CR", "wm", course=["projection-fibers", "white-matter"], quality="derived")
row("CSO", "Centrum semiovale", "v1:CSO", "wm", course=["centrum-semiovale", "white-matter"], quality="derived")
row("ICa", "Internal capsule, anterior limb", "v1:ICa", "wm", course=["anterior-limb-of-internal-capsule", "internal-capsule", "projection-fibers"], quality="derived")
row("ICg", "Internal capsule, genu", "v1:ICg", "wm", course=["genu-of-internal-capsule", "internal-capsule", "projection-fibers"], quality="derived")
row("ICp", "Internal capsule, posterior limb", "v1:ICp", "wm", course=["posterior-limb-of-internal-capsule", "internal-capsule", "projection-fibers"], quality="derived")
row("EC", "External capsule", "derived", "wm", course=["white-matter"], quality="derived")
row("ExC", "Extreme capsule", "derived", "wm", course=["white-matter"], quality="derived")
CC = ["corpus-callosum", "commissural-fibers"]
row("CCr", "Rostrum of corpus callosum", "derived", "wm", side="M", course=CC, quality="derived")
row("CCg", "Genu of corpus callosum", "v1:ccG", "wm", side="M", course=["genu-of-corpus-callosum", *CC], quality="derived")
row("CCb", "Body of corpus callosum", "v1:ccB", "wm", side="M", course=["body-of-corpus-callosum", *CC], quality="derived")
row("CCs", "Splenium of corpus callosum", "v1:ccS", "wm", side="M", course=["splenium-of-corpus-callosum", *CC], quality="derived")
row("AC", "Anterior commissure", "ahra:ac", "wm", side="M", course=["anterior-commissure", "commissural-fibers"])
row("PC", "Posterior commissure", "derived", "wm", side="M", course=["posterior-commissure", "epithalamus"], quality="derived")
FX = ["fornix"]
row("FXc", "Column of fornix", "v1:fxCo", "wm", course=["columns-of-the-fornix", *FX], quality="derived")
row("FXb", "Body of fornix", "v1:fxB", "wm", course=["body-of-fornix", *FX], quality="derived")
row("FXr", "Crus of fornix", "v1:fxCr", "wm", course=["crus-of-fornix", *FX], quality="derived")
# (the fimbria is not separable in the Allen labels: its fibres are part of the hippocampus labels there)
row("MTT", "Mammillothalamic tract", "ahra:mtt", "wm", course=["diencephalon"])
row("OR", "Optic radiation", "ahra:or", "wm", course=["optic-radiations", "projection-fibers"])
row("OT", "Optic tract", "ahra:ot", "wm", course=["optic-tract"])
row("OCh", "Optic chiasm", "derived", "wm", side="M", course=["optic-chiasm"], quality="derived")
row("OLT", "Olfactory tract", "ahra:olt", "wm", course=["olfactory-tract"])

# ------------------------------------------------------------------ ventricles
LV = ["lateral-ventricle", "ventricular-system", "cerebrospinal-fluid"]
row("aLV", "Anterior horn of lateral ventricle", "ahra:aLV", "csf", course=["anterior-horn-of-lateral-ventricle", *LV])
row("bLV", "Body of lateral ventricle", "ahra:bLV", "csf", course=["body-of-lateral-ventricle", *LV])
row("xLV", "Atrium of lateral ventricle", "ahra:xLV", "csf", course=["atrium-of-lateral-ventricle", *LV])
row("pLV", "Posterior horn of lateral ventricle", "ahra:pLV", "csf", course=["posterior-horn-of-lateral-ventricle", *LV])
row("iLV", "Inferior horn of lateral ventricle", "ahra:iLV", "csf", course=["inferior-horn-of-lateral-ventricle", *LV])
row("V3", "Third ventricle", "ahra:3V", "csf", side="M", course=["third-ventricle", "ventricular-system", "cerebrospinal-fluid"])
row("Aq", "Cerebral aqueduct", "ahra:Aq", "csf", side="M", course=["cerebral-aqueduct", "ventricular-system", "cerebrospinal-fluid"])
row("V4", "Fourth ventricle", "ahra:4V", "csf", side="M", course=["fourth-ventricle", "ventricular-system", "cerebrospinal-fluid"])
row("CeC", "Central canal", "ahra:cec", "csf", side="M", course=["ventricular-system", "cerebrospinal-fluid"])
row("SP", "Septum pellucidum", "derived", "wm", side="M", course=["septum-pellucidum"], quality="derived")
row("CP", "Choroid plexus", "derived", "plx", course=["choroid-plexus"], quality="derived")

# ------------------------------------------------------------------ brainstem
MBR = ["midbrain", "brainstem"]
row("SC", "Superior colliculus", "ahra:SC", "gm", course=["superior-colliculus", *MBR])
row("ICo", "Inferior colliculus", "ahra:IC", "gm", course=["inferior-colliculus", *MBR])
row("PAG", "Periaqueductal grey", "v1:PAG", "gm", side="M", course=["periaqueductal-gray", *MBR], quality="derived")
row("MTg", "Midbrain tegmentum", "ahra:MTg", "bs", course=MBR)
row("RN", "Red nucleus", "ahra:RN", "gm", course=["red-nucleus", *MBR])
row("SN", "Substantia nigra", "ahra:SN", "gm", course=["substantia-nigra", *MBR])
row("VTA", "Ventral tegmental area", "aan:VTA", "gm", side="M", course=["ventral-tegmental-area", *MBR])
row("CPd", "Cerebral peduncle (crus cerebri)", "ahra:cpd", "wm", course=["cerebral-peduncles", *MBR])
row("DR", "Dorsal raphe nucleus", "aan:DR", "gm", side="M", course=MBR)
row("mRt", "Mesencephalic reticular formation", "aan:mRt", "bs", course=MBR)
row("PTg", "Pedunculotegmental nucleus", "aan:PTg", "gm", course=MBR)
PO = ["pons", "brainstem"]
row("PnBa", "Basilar part of pons", "ahra:PnBa", "bs", side="M", course=["transverse-fibers-of-the-pons", "pontine-nuclei", "pontine-protuberance", *PO])
row("PnTg", "Pontine tegmentum", "ahra:PnTg", "bs", side="M", course=PO)
row("LC", "Locus coeruleus", "aan:LC", "gm", course=PO)
row("MnR", "Median raphe nucleus", "aan:MnR", "gm", side="M", course=PO)
row("LDTg", "Laterodorsal tegmental nucleus", "aan:LDTg", "gm", course=PO)
row("PBC", "Parabrachial complex", "aan:PBC", "gm", course=PO)
row("PnO", "Pontine reticular formation (oral part)", "aan:PnO", "bs", course=PO)
MED = ["medulla", "brainstem"]
row("MoTg", "Medulla (tegmentum)", "ahra:MoTg", "bs", side="M", course=MED)
row("Py", "Pyramid", "ahra:MoPy", "wm", course=["pyramids", *MED])
row("IO", "Inferior olivary nucleus", "ahra:IO", "gm", course=["inferior-olivary-nucleus", "olives", *MED])
row("ML", "Medial lemniscus", "hcp:ML", "tract", course=["medial-lemniscus", "brainstem"], quality="derived")
row("MLF", "Medial longitudinal fasciculus", "hcp:MLF", "tract", course=["medial-longitudinal-fasciculus", "brainstem"], quality="derived")
row("BSW", "Brainstem white matter", "ahra:HWM", "wm", side="M", course=["brainstem"])
row("SCP", "Superior cerebellar peduncle", "ahra:scp", "wm", course=["superior-cerebellar-peduncle", "cerebellar-peduncles"])
row("MCP", "Middle cerebellar peduncle", "ahra:mcp", "wm", course=["middle-cerebellar-peduncle", "cerebellar-peduncles"])
row("ICP", "Inferior cerebellar peduncle", "ahra:icp", "wm", course=["inferior-cerebellar-peduncle", "cerebellar-peduncles"])

# brainstem nuclei and tracts placed from the course's level plates (tools/atlas3/bsnuclei.py)
PL = "plate"
row("III", "Oculomotor nucleus", PL, "gm", course=["oculomotor-nucleus", *MBR], quality="derived")
row("EW", "Edinger-Westphal nucleus", PL, "gm", course=["edinger-westphal-nucleus", *MBR], quality="derived")
row("IV", "Trochlear nucleus", PL, "gm", course=["trochlear-nucleus", *MBR], quality="derived")
row("BIC", "Brachium of the inferior colliculus", PL, "tract", course=["brachium-of-the-inferior-colliculus", *MBR], quality="derived")
row("xSCP", "Decussation of the superior cerebellar peduncles", PL, "tract", side="M", course=["decussation-of-the-superior-cerebellar-peduncle", *MBR], quality="derived")
row("IPF", "Interpeduncular fossa", PL, "csf", side="M", course=["interpeduncular-fossa", "interpeduncular-cistern"], quality="derived")
row("Vmo", "Motor trigeminal nucleus", PL, "gm", course=["motor-trigeminal-nucleus", *PO], quality="derived")
row("Vps", "Principal sensory nucleus of trigeminal", PL, "gm", course=["principal-sensory-nucleus-of-trigeminal", *PO], quality="derived")
row("VI", "Abducens nucleus", PL, "gm", course=["abducens-nucleus", *PO], quality="derived")
row("VII", "Facial nucleus", PL, "gm", course=["facial-nucleus", *PO], quality="derived")
row("FCol", "Facial colliculus", PL, "gm", course=["facial-colliculus", *PO], quality="derived")
row("PPRF", "Paramedian pontine reticular formation", PL, "bs", course=["paramedian-pontine-reticular-formation", *PO], quality="derived")
row("LFP", "Longitudinal fibres of the pons", PL, "tract", course=["longitudinal-fibers-of-the-pons", *PO], quality="derived")
row("VCx", "Vestibular and cochlear nuclei", PL, "gm", course=["vestibulocochlear-complex", "vestibular-nuclei", "cochlear-nuclei", "brainstem"], quality="derived")
row("Sp5", "Spinal trigeminal nucleus", PL, "gm", course=["spinal-trigeminal-nucleus", "brainstem"], quality="derived")
row("Sol", "Solitary nucleus", PL, "gm", course=["solitary-nucleus", *MED], quality="derived")
row("DMX", "Dorsal motor nucleus of the vagus", PL, "gm", course=["dorsal-motor-nucleus-of-the-vagus", *MED], quality="derived")
row("XII", "Hypoglossal nucleus", PL, "gm", course=["hypoglossal-nucleus", *MED], quality="derived")
row("Amb", "Nucleus ambiguus", PL, "gm", course=["nucleus-ambiguus", *MED], quality="derived")
row("Gr", "Gracile nucleus", PL, "gm", course=["gracile-nucleus", *MED], quality="derived")
row("Cu", "Cuneate nucleus", PL, "gm", course=["cuneate-nucleus", *MED], quality="derived")
row("IAF", "Internal arcuate fibres", PL, "tract", course=["internal-arcuate-fibers", *MED], quality="derived")
row("PyX", "Pyramidal (motor) decussation", PL, "tract", side="M", course=["motor-decussation", *MED], quality="derived")
row("ALS", "Anterolateral system (spinothalamic tract)", PL, "tract", course=["anterolateral-spinothalamic-tract", "brainstem"], quality="derived")
row("DSCT", "Dorsal spinocerebellar tract", PL, "tract", course=["dorsal-spinocerebellar-tract", "brainstem"], quality="derived")

# ------------------------------------------------------------------ cerebellum
CB = ["cerebellum", "cerebellar-cortex"]
# the Allen zones, split into lobes by cblobes.py (Z-Anatomy lobules): zone x lobe leaves
row("CbV", "Vermis", "ahra:CBV", "cbx", side="M", stage=True)
row("CbPV", "Paravermis", "ahra:CBPV", "cbx", stage=True)
row("CbL", "Cerebellar hemisphere (lateral)", "ahra:CBL", "cbx", stage=True)
ZL, AL, PL_, FN = "ahra+zanat", "cerebellar-anterior-lobe", "cerebellar-posterior-lobe", "flocculonodular-lobe"
VE, PV, LH = "vermis", "paravermis", "cerebellar-lateral-hemisphere"
row("CbVa", "Vermis, anterior lobe", ZL, "cbx", side="M", course=[VE, AL, *CB], quality="derived")
row("CbVp", "Vermis, posterior lobe", ZL, "cbx", side="M", course=[VE, PL_, *CB], quality="derived")
row("Nod", "Nodulus", ZL, "cbx", side="M", course=["nodulus", VE, FN, *CB], quality="derived")
row("CbPVa", "Paravermis, anterior lobe", ZL, "cbx", course=[PV, AL, *CB], quality="derived")
row("CbPVp", "Paravermis, posterior lobe", ZL, "cbx", course=[PV, PL_, *CB], quality="derived")
row("TonPV", "Cerebellar tonsil", ZL, "cbx", course=["cerebellar-tonsil", PV, PL_, *CB], quality="derived")
row("FlocPV", "Flocculus", ZL, "cbx", course=["flocculus", FN, *CB], quality="derived")
row("CbLa", "Lateral hemisphere, anterior lobe", ZL, "cbx", course=[LH, AL, *CB], quality="derived")
row("CbLp", "Lateral hemisphere, posterior lobe", ZL, "cbx", course=[LH, PL_, *CB], quality="derived")
row("TonL", "Cerebellar tonsil", ZL, "cbx", course=["cerebellar-tonsil", LH, PL_, *CB], quality="derived")
row("FlocL", "Flocculus", ZL, "cbx", course=["flocculus", FN, *CB], quality="derived")
row("CbW", "Cerebellar white matter", "derived", "wm", course=["cerebellar-white-matter", "cerebellum"], quality="derived")
DCN = ["deep-cerebellar-nuclei", "cerebellum"]
row("DN", "Dentate nucleus", "ahra:CbDN", "gm", course=["dentate-nucleus", *DCN], quality="derived")
row("IPN", "Interposed nuclei (emboliform, globose)", "derived", "gm", course=["interposed-nuclei", "interposed-nucleus", *DCN], quality="derived")
row("FN", "Fastigial nucleus", "derived", "gm", course=["fastigial-nucleus", *DCN], quality="derived")

# ------------------------------------------------------------------ small structures no source labels (extras.py)
row("Pit", "Pituitary gland (hypophysis)", "template", "gm", side="M", course=["pituitary-gland"], quality="derived")
row("PitS", "Pituitary stalk (infundibulum)", "derived", "gm", side="M", course=["pituitary-stalk"], quality="derived")
row("LT", "Lamina terminalis", "derived", "gm", side="M", course=["lamina-terminalis"], quality="derived")
row("IVF", "Interventricular foramen (of Monro)", "derived", "csf", course=["foramina-of-monro"], quality="derived")
row("Obex", "Obex", "derived", "bs", side="M", course=["obex", "medulla"], quality="derived")
row("AP", "Area postrema", "derived", "bs", course=["area-postrema", "medulla"], quality="derived")
row("GrT", "Gracile tubercle", "derived", "bs", course=["gracile-tubercle", "medulla"], quality="derived")
row("CuT", "Cuneate tubercle", "derived", "bs", course=["cuneate-tubercle", "medulla"], quality="derived")

# ------------------------------------------------------------------ cranial nerves (cnerves.py: Z-Anatomy, root to foramen)
CN = ["cranial-nerves"]
ZN = "zanat"
row("CN2", "Optic nerve (II)", ZN, "nrv", course=["optic-nerve", *CN], quality="regional")
row("CN3", "Oculomotor nerve (III)", ZN, "nrv", course=["oculomotor-nerve", *CN], quality="regional")
row("CN4", "Trochlear nerve (IV)", ZN, "nrv", course=["trochlear-nerve", *CN], quality="regional")
row("CN5", "Trigeminal nerve (V)", ZN, "nrv", course=["trigeminal-nerve", *CN], quality="regional")
row("CN6", "Abducens nerve (VI)", ZN, "nrv", course=["abducens-nerve", *CN], quality="regional")
row("CN7", "Facial nerve (VII)", ZN, "nrv", course=["facial-nerve", *CN], quality="regional")
row("CN8", "Vestibulocochlear nerve (VIII)", ZN, "nrv", course=["vestibulocochlear-nerve", *CN], quality="regional")
row("CN9", "Glossopharyngeal nerve (IX)", ZN, "nrv", course=["glossopharyngeal-nerve", *CN], quality="regional")
row("CN10", "Vagus nerve (X)", ZN, "nrv", course=["vagus-nerve", *CN], quality="regional")
row("CN12", "Hypoglossal nerve (XII)", ZN, "nrv", course=["hypoglossal-nerve", *CN], quality="regional")

KEYS = [r["key"] for r in ROWS]
assert len(KEYS) == len(set(KEYS)), "duplicate keys"
BY_KEY = {r["key"]: r for r in ROWS}

# ------------------------------------------------------------------ groups (unions of leaves) for the structure list
GROUPS = {
    "frontal-lobe": ["SFG", "PaCG", "MFG", "IFGop", "IFGtr", "FrO", "PrCG", "PCLr", "ReG", "MOrG", "AOrG", "POrG", "LOrG", "LOG", "FP", "FMG", "RoG"],
    "parietal-lobe": ["PoCG", "PCLc", "SPL", "SMG", "AnG", "PrCun", "PaO"],
    "temporal-lobe": ["STG", "PLT", "PLP", "TTG", "MTG", "ITG", "TP", "FuGt", "PRG"],
    "occipital-lobe": ["Cun", "LiG", "SOG", "IOG", "OP", "FuGo"],
    "insular-cortex": ["SIG", "LIG", "LI", "FI", "TI"],
    "limbic-lobe": ["CgGr", "CgGc", "IsCPH", "SCG", "APH", "PPH", "AG", "HiH", "HiB", "HiT"],
}
