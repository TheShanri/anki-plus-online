"""Map course structure names (content-build/structures/unit*.json) to atlas ids.
Writes src/data/atlas-map.json and _atlas/UNMATCHED.md. Run from repo root: python -I tools/atlas/build_map.py
Rules are matched in order against the normalised name (lowercase, alphanumerics only, single spaces).
Each rule: (regex, ids, fallback_parent_id or None). ids are exact when fallback is None; otherwise the
match is flagged approximate (the viewer shows the 'approximate location' badge and highlights the fallback/ids)."""
import json, re, os, collections

IDX = json.load(open("public/atlas/index.json"))["structures"]
FRONTAL_G = ["superior-frontal-gyrus", "middle-frontal-gyrus"]
CEREB_VERMIS = ["culmen", "declive", "folium-of-vermis", "nodule-of-vermis", "pyramis-of-vermis", "tuber-of-vermis", "uvula-of-vermis", "lingula-of-cerebellum", "central-lobule"]
R = [
    # --- skull / non-neural / spatial terms (no 3D)
    (r"\b(frontal|temporal|occipital|parietal|sphenoid) bone|^(sagittal|lambdoid|coronal|bregma|lambda|pterion)$|cranial (fossa|foramina)|foramen magnum|vertebra|vertebral|transverse process|spinous process|intervertebral|\bvs\b|orientation|flexure|neuraxis|midsagittal|horizontal|differentiation of|brain bleeds|major structures from|know that|be able to|cornea|sclera|^iris|^lens|retina|^choroid$|brachial plexus|lumbosacral plexus|epidural|subdural|subarachnoid space|composed of|^coronal frontal|^3 the region", None, "SKIP"),
    (r"^2 putamen", ["putamen"], None),
    (r"lenticulostriate", ["middle-cerebral-artery-m1"], "middle-cerebral-artery-m1"),
    # --- meninges
    (r"^dura( mater)?$|^dura arachnoid", ["falx-cerebri", "tentorium-cerebelli", "spinal-dura"], None),
    (r"falx cerebri", ["falx-cerebri"], None),
    (r"tentorium", ["tentorium-cerebelli"], None),
    (r"arachnoid mater|^pia mater", [], "meninges"),
    (r"arachnoid granulations", ["superior-sagittal-sinus"], "meninges"),
    (r"meningeal blood vessels", ["falx-cerebri", "tentorium-cerebelli"], "meninges"),
    (r"dural sleeves|denticulate", ["spinal-dura"], "spinal-dura"),
    (r"cerebral blood vessels|circle of willis", ["cerebral-arterial-circle"], None),
    # --- big divisions
    (r"^cerebral cortex|^cortical ribbon|cortical gray", ["frontal-lobe", "parietal-lobe", "temporal-lobe", "occipital-lobe", "limbic-lobe", "insula-subcentral-gyrus-and-ant-and-post-sulci"], None),
    (r"^brainstem$", ["brainstem"], None),
    (r"^cerebellum$", ["cerebellum"], None),
    # --- ventricles
    (r"foramina of monro", ["lateral-ventricle", "third-ventricle"], "third-ventricle"),
    (r"foramina of magendie", ["fourth-ventricle"], "fourth-ventricle"),
    (r"anterior horn|inferior horn|posterior horn$|^body$|atrium|trigone", ["lateral-ventricle"], "lateral-ventricle"),
    (r"septum pellucidum", ["septum-pellucidum"], None),
    (r"lateral ventricle", ["lateral-ventricle"], None),
    (r"third ventricle|3rd ventricle", ["third-ventricle"], None),
    (r"aqueduct", ["aqueduct-of-midbrain"], None),
    (r"fourth ventricle|4th ventricle", ["fourth-ventricle"], None),
    (r"septum pellucidum", ["septum-pellucidum"], None),
    (r"choroid plexus", ["choroid-plexus"], None),
    (r"superior sagittal sinus", ["superior-sagittal-sinus"], None),
    # --- cerebral nuclei / limbic
    (r"corpus callosum|^genu|^splenium", ["corpus-callosum"], None),
    (r"basal ganglia|corpus striatum", ["caudate-nucleus", "putamen", "globus-pallidus"], None),
    (r"lentiform", ["lentiform-nucleus"], None),
    (r"caudate", ["caudate-nucleus"], None),
    (r"^putamen", ["putamen"], None),
    (r"globus pallidus", ["globus-pallidus"], None),
    (r"nucleus accumbens", ["caudate-nucleus", "putamen"], "corpus-striatum"),
    (r"basal forebrain", ["basal-forebrain"], None),
    (r"hippocampus", ["hippocampus"], None),
    (r"amygdala", ["amygdaloid-body"], None),
    (r"parahippocampal", ["medial-occipitotemporal-gyrus-parahippocampal"], None),
    (r"^uncus", ["medial-occipitotemporal-gyrus-parahippocampal"], "limbic-lobe"),
    (r"fornix|columns of the fornix", ["fornix"], None),
    (r"cingulate gyrus", ["cingulate-gyrus-and-sulcus-middle-anterior-part", "cingulate-gyrus-and-sulcus-middle-posterior-part", "cingulate-gyrus-and-sulcus-posterior-dorsal-part", "cingulate-gyrus-posteroventral-part"], None),
    (r"anterior cingulate", ["cingulate-gyrus-and-sulcus-middle-anterior-part"], "limbic-lobe"),
    (r"anterior commissure", ["anterior-commissure"], None),
    (r"posterior commissure", ["posterior-commissure"], None),
    (r"commissural fibers", ["corpus-callosum", "anterior-commissure", "hippocampal-commissure"], None),
    (r"association fibers|projection fibers|optic radiations", ["white-matter-of-telencephalon"], "white-matter-of-telencephalon"),
    (r"internal capsule|anterior limb|posterior limb", ["white-matter-of-telencephalon"], "white-matter-of-telencephalon"),
    (r"anterior perforated", ["basal-forebrain"], "basal-forebrain"),
    (r"lamina terminalis", ["third-ventricle"], "third-ventricle"),
    (r"stria medullaris", ["stria-medullaris-thalami"], None),
    (r"habenula|epithalamus", ["habenula"], None),
    (r"pineal", ["habenula", "posterior-commissure"], "diencephalon"),
    # --- diencephalon
    (r"interthalamic|massa intermedia", ["thalamus"], "thalamus"),
    (r"medial and lateral geniculate", ["medial-geniculate-body", "lateral-geniculate-body"], None),
    (r"medial geniculate", ["medial-geniculate-body"], None),
    (r"lateral geniculate", ["lateral-geniculate-body"], None),
    (r"anterior thalamic|^anterior nucleus|pulvinar|^thalamus|dorsal thalamus", ["thalamus"], None),
    (r"hypothalamus", ["hypothalamus"], None),
    (r"suprachiasmatic", ["hypothalamus"], "hypothalamus"),
    (r"mammillary|mamillary", ["mamillary-body"], None),
    (r"pituitary|infundibul", ["hypothalamus"], "hypothalamus"),
    (r"optic chiasm", ["optic-chiasm"], None),
    (r"optic tract", ["optic-tract"], None),
    (r"optic nerve", ["optic-nerve-ii"], None),
    (r"subthalamic", ["thalamus"], "diencephalon"),
    # --- cortex areas
    (r"primary motor|^orientation of motor", ["precentral-gyrus"], None),
    (r"premotor", FRONTAL_G, "frontal-lobe"),
    (r"broca", ["opercular-part-of-inferior-frontal-gyrus", "triangular-part-of-inferior-frontal-gyrus"], None),
    (r"dorsolateral prefrontal", ["middle-frontal-gyrus"], "frontal-lobe"),
    (r"orbitofrontal", ["orbital-gyri"], None),
    (r"ventromedial prefrontal", ["straight-gyrus-gyrus-rectus", "orbital-gyri"], "frontal-lobe"),
    (r"primary somatosens|^orientation of somatosens", ["postcentral-gyrus"], None),
    (r"somatosensory association", ["superior-parietal-lobule"], None),
    (r"multimodal|parietal lobe general", ["parietal-lobe"], None),
    (r"primary visual", ["calcarine-sulcus", "cuneus", "lingual-gyrus"], "occipital-lobe"),
    (r"visual association", ["occipital-lobe"], None),
    (r"primary auditory", ["transverse-temporal-gyri"], None),
    (r"auditory association", ["superior-temporal-gyrus-lateral-part"], None),
    (r"wernicke", ["superior-temporal-gyrus-lateral-part", "angular-gyrus", "supramarginal-gyrus"], "temporal-lobe"),
    (r"temporal lobe general", ["temporal-lobe"], None),
    (r"insular cortex", ["insula-subcentral-gyrus-and-ant-and-post-sulci"], None),
    (r"interhemispheric fissure|median longitudinal cerebral", ["falx-cerebri"], "cerebrum"),
    (r"lateral fissure", ["lat-fis-post", "lat-fis-ant-horizont", "lat-fis-ant-vertical"], None),
    (r"central sulcus", ["central-sulcus"], None),
    (r"parieto occipital", ["parieto-occipital-sulcus"], None),
    (r"intraparietal", ["intraparietal-sulcus"], None),
    (r"calcarine", ["calcarine-sulcus"], None),
    (r"frontal gyri", ["superior-frontal-gyrus", "middle-frontal-gyrus", "opercular-part-of-inferior-frontal-gyrus", "triangular-part-of-inferior-frontal-gyrus", "orbital-part-of-inferior-frontal-gyrus"], None),
    (r"precentral gyrus", ["precentral-gyrus"], None),
    (r"postcentral gyrus", ["postcentral-gyrus"], None),
    (r"superior parietal lobule", ["superior-parietal-lobule"], None),
    (r"inferior parietal lobule", ["supramarginal-gyrus", "angular-gyrus"], None),
    (r"temporal gyri", ["superior-temporal-gyrus-lateral-part", "middle-temporal-gyrus", "inferior-temporal-gyrus"], None),
    (r"transverse temporal", ["transverse-temporal-gyri"], None),
    # --- midbrain
    (r"^midbrain", ["midbrain"], None),
    (r"superior colliculus|superior colliculi", ["superior-colliculus"], None),
    (r"brachium of the inferior|inferior colliculus|inferior colliculi", ["inferior-colliculus"], None),
    (r"cerebral peduncle", ["base-of-peduncle"], None),
    (r"interpeduncular", ["interpeduncular-fossa"], None),
    (r"periaqueductal", ["aqueduct-of-midbrain"], "midbrain"),
    (r"red nucleus", ["red-nucleus"], None),
    (r"edinger westphal", ["accessory-nucleus-of-oculomotor-nerve"], None),
    (r"oculomotor nucleus", ["nucleus-of-oculomotor-nerve"], None),
    (r"substantia nigra", ["base-of-peduncle"], "midbrain"),
    (r"cn iii|oculomotor nerve", ["oculomotor-nerve-iii"], None),
    (r"trochlear nucleus|cn iv trochlear nucleus", ["nucleus-of-trochlear-nerve"], None),
    (r"decussation of superior cerebellar|x scp", ["superior-cerebellar-peduncle"], "midbrain"),
    (r"superior cerebellar peduncle|^scp", ["superior-cerebellar-peduncle"], None),
    (r"^pons$", ["pons"], None),
    (r"middle cerebellar peduncle|transverse fibers|longitudinal fibers|pontine protuberance|pontine nuclei", ["pons"], "pons"),
    (r"^superior middle inferior cerebellar", ["superior-cerebellar-peduncle", "pons", "medulla-oblongata"], "brainstem"),
    (r"inferior cerebellar peduncle", ["medulla-oblongata"], "medulla-oblongata"),
    (r"cerebellar peduncles?$|superior middle inferior cerebellar", ["superior-cerebellar-peduncle"], "brainstem"),
    # --- brainstem tracts & nuclei
    (r"medial lemniscus|medial longitudinal fasciculus|^mlf|ppr?f", ["brainstem"], "brainstem"),
    (r"anterolateral tract|anterolateral spinothalamic", ["anterior-spinothalamic-tract", "lateral-spinothalamic-tract"], None),
    (r"motor trigeminal", ["motor-root-of-trigeminal-nerve"], "pons"),
    (r"principal sensory", ["sensory-root-of-trigeminal-nerve"], "pons"),
    (r"abducens nucleus", ["nucleus-of-abducens-nerve"], None),
    (r"facial colliculus", ["nucleus-of-abducens-nerve"], "pons"),
    (r"facial nucleus", ["motor-nucleus-of-facial-nerve"], None),
    (r"cn vii|facial$", ["facial-nerve-vii"], None),
    (r"vestibulocochlear", ["vestibular-nuclei", "anterior-cochlear-nucleus", "posterior-cochlear-nucleus"], None),
    (r"hypoglossal nucleus", ["nucleus-of-hypoglossal-nerve"], None),
    (r"dorsal motor nucleus of vagus", ["posterior-nucleus-of-vagus-nerve"], "medulla-oblongata"),
    (r"nucleus ambiguus", ["nucleus-ambiguus"], None),
    (r"cn ix|glossopharyngeal", ["glossopharyngeal-nerve-ix"], None),
    (r"cn x(?!i)|vagus", ["vagus-nerve-x"], None),
    (r"cn xii|hypoglossal", ["hypoglossal-nerve-xii"], None),
    (r"inferior olivary|^olive", ["olive"], None),
    (r"^olives", ["olive"], None),
    (r"pyramids? motor decussation|pyramids? ?/? ?motor", ["pyramid-of-medulla-oblongata"], "medulla-oblongata"),
    (r"^pyramids?$", ["pyramid-of-medulla-oblongata"], None),
    (r"gracile nucleus|cuneate nucleus|internal arcuate|spinal trigeminal|solitary|cuneate and gracile tubercles|obex|area postrema", ["medulla-oblongata"], "medulla-oblongata"),
    (r"^medulla", ["medulla-oblongata"], None),
    (r"interpeduncular cistern", ["interpeduncular-fossa"], "midbrain"),
    # --- cerebellum
    (r"tonsil", ["tonsil-of-cerebellum"], None),
    (r"flocculus", ["flocculus"], None),
    (r"^vermis", CEREB_VERMIS, None),
    (r"paravermis|lateral hemisphere", ["anterior-quadrangular-lobule", "posterior-quadrangular-lobule", "superior-semilunar-lobule", "inferior-semilunar-lobule", "biventral-lobule", "gracile-lobule"], "cerebellum"),
    (r"dentate nucleus", ["cerebellum"], "cerebellum"),
    # --- arteries
    (r"vertebral artery", ["vertebral-artery"], None),
    (r"basilar artery", ["basilar-artery"], None),
    (r"cerebellar branches", ["superior-cerebellar-artery", "anterior-inferior-cerebellar-artery", "posterior-inferior-cerebellar-artery"], None),
    (r"penetrating branches|pontine arteries", ["medial-pontine-branches-of-basilar-artery", "lateral-pontine-branches-of-basilar-artery"], None),
    (r"posterior cerebral artery", ["posterior-cerebral-artery"], None),
    (r"posterior communicating", ["posterior-communicating-artery"], None),
    (r"internal carotid", ["internal-carotid-artery"], None),
    (r"middle cerebral artery", ["middle-cerebral-artery-m1", "insular-branches-of-middle-cerebral-artery-m2", "middle-cerebral-artery-m3"], None),
    (r"lenticulostriate", ["middle-cerebral-artery-m1"], "middle-cerebral-artery-m1"),
    (r"anterior cerebral artery", ["anterior-cerebral-artery"], None),
    (r"pericallosal", ["pericallosal-artery"], None),
    (r"callosomarginal", ["anterior-cerebral-artery"], "anterior-cerebral-artery"),
    (r"anterior communicating", ["anterior-communicating-artery"], None),
    (r"anterior spinal artery|posterior spinal arteries", ["vertebral-artery"], "vertebral-artery"),
    # --- spinal cord
    (r"conus medullaris|filum terminale", ["cauda-equina"], "spinal-cord"),
    (r"cauda equina", ["cauda-equina"], None),
    (r"dorsal and ventral rootlets|roots?$|rootlets", ["anterior-root-of-spinal-nerve", "posterior-root-of-spinal-nerve"], None),
    (r"dorsal root ganglion", ["spinal-ganglion"], None),
    (r"^spinal nerves$|dorsal and ventral rami", ["anterior-root-of-spinal-nerve", "posterior-root-of-spinal-nerve"], "spinal-nerves"),
    (r"dorsal horns?|^dorsal horn", ["posterior-horn-of-spinal-cord"], None),
    (r"ventral horns?", ["anterior-horn-of-spinal-cord"], None),
    (r"lateral horn", ["intermediolateral-nucleus"], "spinal-cord"),
    (r"intermediate zone", ["lateral-intermediate-substance", "intermediomedial-nucleus", "intermediolateral-nucleus"], None),
    (r"dorsal columns", ["gracile-fasciculus", "cuneate-fasciculus"], None),
    (r"fasciculus gracilis|gracile fasciculus", ["gracile-fasciculus"], None),
    (r"fasciculus cuneatus|cuneate fasciculus", ["cuneate-fasciculus"], None),
    (r"dorsal spinocerebellar", ["posterior-spinocerebellar-tract"], None),
    (r"drez", ["posterolateral-tract"], "posterior-horn-of-spinal-cord"),
    (r"marginal nucleus|substantia gelatinosa", ["posterior-horn-of-spinal-cord"], "posterior-horn-of-spinal-cord"),
    (r"nucleus proprius", ["nucleus-proprius"], None),
    (r"clarke|nucleus dorsalis", ["intermediomedial-nucleus"], "grey-matter-of-spinal-cord"),
    (r"ventral commissure", ["anterior-horn-of-spinal-cord"], "grey-matter-of-spinal-cord"),
    (r"lateral corticospinal", ["lateral-corticospinal-tract"], None),
    (r"anterior corticospinal", ["anterior-corticospinal-tract"], None),
    (r"lateral funiculus", ["lateral-funiculus"], None),
    (r"anterior ventral funiculus|ventral funiculus|anterior funiculus", ["anterior-funiculus"], None),
    (r"lower motor neurons", ["anterior-horn-of-spinal-cord"], "grey-matter-of-spinal-cord"),
]

def norm(s):
    s = s.lower().replace("’", "'")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", s)).strip()

def collect():
    names = []
    def walk(n):
        if isinstance(n, dict):
            if "name" in n and not any(k in n for k in ("groups", "labs", "items")) and "heading" not in n:
                names.append(n["name"])
            for k, v in n.items():
                if k != "name": walk(v)
        elif isinstance(n, list):
            for v in n: walk(v)
    for u in (1, 2, 3):
        p = f"content-build/structures/unit{u}.json"
        if os.path.exists(p): walk(json.load(open(p, encoding="utf-8")))
    out = []
    for n in names:
        if n not in out: out.append(n)
    return out

def expand(ids):
    """resolve group ids to member leaf ids for validation"""
    return ids

names = collect()
out = {}; unmatched = []; skipped = []
for name in names:
    k = norm(name)
    hit = None
    for pat, ids, fb in R:
        if re.search(pat, k):
            hit = (ids, fb); break
    if hit is None:
        unmatched.append((name, None)); continue
    ids, fb = hit
    if fb == "SKIP":
        skipped.append(name); continue
    for i in ids + ([fb] if fb else []):
        assert i in IDX, f"unknown atlas id {i} for {name}"
    syn = []
    for i in ids:
        e = IDX[i]
        syn += [e["name"]] + ([e["latin"]] if e.get("latin") else [])
    syn = [s for s in dict.fromkeys(syn) if norm(s) != k]
    out[name] = {"meshIds": ids, "approximate": bool(fb), "synonyms": syn[:6]}
    if fb: out[name]["fallbackParentId"] = fb

os.makedirs("src/data", exist_ok=True)
json.dump(out, open("src/data/atlas-map.json", "w", indent=1, encoding="utf-8") if False else open("src/data/atlas-map.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
approx = [n for n, v in out.items() if v["approximate"]]
with open("_atlas/UNMATCHED.md", "w", encoding="utf-8") as f:
    f.write("# Atlas name mapping: unmatched and approximate\n\n")
    f.write(f"Course structure names: {len(names)}. Mapped exactly: {len(out) - len(approx)}. Mapped approximately (fallback parent highlighted, badge shown): {len(approx)}. No 3D model (skull, orientation terms, eye, plexuses, lecture-note text): {len(skipped)}. Unmatched: {len(unmatched)}.\n\n")
    f.write("## Approximate matches (Z-Anatomy has no mesh of its own)\n\n")
    for n in approx:
        f.write(f"- {n}: highlight {', '.join(out[n]['meshIds'])} (fallback parent: {out[n]['fallbackParentId']})\n")
    f.write("\n## No 3D model, intentionally (hide the Open in 3D atlas button)\n\n")
    for n in skipped: f.write(f"- {n}\n")
    f.write("\n## Unmatched: proposed fallback needed\n\n")
    for n, _ in unmatched: f.write(f"- {n}: (propose manually)\n")
print("names", len(names), "exact", len(out) - len(approx), "approx", len(approx), "skipped", len(skipped), "unmatched", len(unmatched))
print(unmatched)
