"""Hand decisions for the official structure lists: merges, splits, canonical names, synonyms.
Imported by build_structures.py. R maps a normalised raw list text -> list of specs (None = not a structure)."""
import re
import unicodedata


def key(s):
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def S(name, syn=(), ab=(), parent=None, concept=False, lat=None, region=None):
    return dict(name=name, syn=list(syn), ab=list(ab), parent=parent, concept=concept, lat=lat, region=region)


R = {}


def add(raw, *specs):
    R[key(raw)] = list(specs) if specs != (None,) else None


# ---- unit 1
add("Cerebral Cortex (Cerebrum)", S("Cerebral cortex", ["cerebrum", "cortex"], lat="paired"))
add("Cerebral cortex", S("Cerebral cortex", ["cerebrum", "cortex"], lat="paired"))
add("Posterior vs. Anterior", S("Anterior", concept=True), S("Posterior", concept=True))
add("Superior vs. Inferior", S("Superior", concept=True), S("Inferior", concept=True))
add("Rostral vs. Caudal", S("Rostral", ["cephalic"], concept=True), S("Caudal", concept=True))
add("Dorsal vs. Ventral", S("Dorsal", concept=True), S("Ventral", concept=True))
add("Lateral vs. Medial; Median", S("Lateral", concept=True), S("Medial", concept=True), S("Median", ["midline"], concept=True))
add("Superficial vs. Deep", S("Superficial", concept=True), S("Deep", concept=True))
add("Sagittal (midsagittal, parasagittal)", S("Sagittal plane", ["sagittal", "midsagittal", "mid-sagittal", "parasagittal", "median plane"], concept=True))
add("Coronal (frontal)", S("Coronal plane", ["coronal", "frontal plane", "frontal"], concept=True))
add("Horizontal (axial, transverse)", S("Horizontal plane", ["horizontal", "axial", "transverse", "transverse plane", "axial plane"], concept=True))
add("Longitudinal axis of the nervous system (neuraxis)", S("Neuraxis", ["longitudinal axis of the nervous system", "longitudinal axis"], concept=True))
add("Orientation of neuraxis in the cerebrum vs. brainstem/spinal cord", S("Orientation of the neuraxis (cerebrum vs brainstem/spinal cord)", ["neuraxis orientation"], concept=True))
add("Lambdoid", S("Lambdoid suture", ["lambdoid"], region="skull"))
add("Lambda", S("Lambda", region="skull"))
add("Bregma", S("Bregma", region="skull"))
add("Pterion", S("Pterion", region="skull"))
add("Foramen magnum", S("Foramen magnum", region="skull"))
add("Foramina of Monro (singular: foramen)", S("Foramina of Monro", ["foramen of Monro", "interventricular foramen", "interventricular foramina", "foramina of Monroe"], lat="paired"))
add("Foramina of Magendie and Luschka (medial and lateral apertures)",
    S("Foramen of Magendie", ["median aperture", "medial aperture", "foramina of Magendie"], lat="midline"),
    S("Foramina of Luschka", ["lateral apertures", "lateral aperture", "foramen of Luschka"], lat="paired"))
add("Arachnoid granulations", S("Arachnoid granulations", ["arachnoid villi", "arachnoid granulation"]))
add("Basal ganglia (caudate, putamen, globus pallidus)", S("Basal ganglia", ["basal nuclei"]))
add("Massa intermedia/ Interthalamic adhesion", S("Interthalamic adhesion", ["massa intermedia", "thalamic adhesion", "intermediate mass"], lat="midline"))
add("Interthalamic adhesion (massa intermedia)", S("Interthalamic adhesion", ["massa intermedia", "thalamic adhesion"], lat="midline"))
add("Pituitary Stalk (usually ripped, know general location)", S("Pituitary stalk", ["infundibulum", "infundibular stalk", "infundibular stem", "hypophyseal stalk"], lat="midline"))
add("Pituitary stalk", S("Pituitary stalk", ["infundibulum", "infundibular stalk"], lat="midline"))
add("Infundibular stalk (infundibulum or pituitary stalk)", S("Pituitary stalk", ["infundibulum", "infundibular stalk"], lat="midline"))
add("pituitary stalk (infundibular stalk, infundibulum)", S("Pituitary stalk", ["infundibulum", "infundibular stalk"], lat="midline"))
add("Mesencephalic flexure", S("Mesencephalic flexure", ["cephalic flexure", "midbrain flexure"], concept=True))
add("Medulla", S("Medulla", ["medulla oblongata", "myelencephalon"], lat="midline"))
add("Primary Motor Cortex (Brodmann's area 4)", S("Primary motor cortex", ["M1", "motor cortex", "area 4"], ab=["BA 4"]))
add("Orientation of Motor Homunculus", S("Motor homunculus", ["orientation of motor homunculus", "motor map"], concept=True))
add("Premotor Cortex (BA 6)", S("Premotor cortex", ["premotor area", "supplementary motor area", "area 6"], ab=["BA 6", "SMA"]))
add("Broca's Area", S("Broca's area", ["Broca area", "motor speech area"], ab=["BA 44/45"]))
add("Anterior Cingulate Cortex", S("Anterior cingulate cortex", ["anterior cingulate"], ab=["ACC"]))
add("Dorsolateral Prefrontal Cortex", S("Dorsolateral prefrontal cortex", ["dorsolateral prefrontal"], ab=["DLPFC"]))
add("Orbitofrontal Cortex", S("Orbitofrontal cortex", ["orbitofrontal"], ab=["OFC"]))
add("Ventromedial Prefrontal Cortex", S("Ventromedial prefrontal cortex", ["ventromedial prefrontal"], ab=["vmPFC"]))
add("Primary Somatosensensory Cortex (BA 3,1,2)", S("Primary somatosensory cortex", ["somatosensory cortex", "primary sensory cortex", "primary somatosensensory cortex"], ab=["S1", "BA 3,1,2"]))
add("Orientation of Somatosensory Homunculus", S("Somatosensory homunculus", ["orientation of somatosensory homunculus", "sensory homunculus"], concept=True))
add("Somatosensory Association Cortex (BA 5&7)", S("Somatosensory association cortex", ["somatosensory association area", "parietal association cortex"], ab=["BA 5 & 7"]))
add("Multimodal area (Parietal lobe general association area)", S("Parietal lobe general association area", ["multimodal area", "parietal association area", "general parietal association cortex"]))
add("Primary Visual Cortex (BA 17)", S("Primary visual cortex", ["striate cortex", "visual cortex"], ab=["V1", "BA 17"]))
add("Visual Association Cortex (BA 18, 19)", S("Visual association cortex", ["visual association area", "extrastriate cortex"], ab=["V2", "BA 18, 19"]))
add("Primary Auditory Cortex (BA 41, 42)", S("Primary auditory cortex", ["auditory cortex"], ab=["A1", "BA 41, 42"]))
add("Auditory Association Area (BA 22)", S("Auditory association area", ["auditory association cortex"], ab=["BA 22"]))
add("Wernicke's Area", S("Wernicke's area", ["Wernicke area", "sensory speech area"]))
add("Temporal lobe general association area", S("Temporal lobe general association area", ["temporal association cortex", "temporal association area"]))
add("Association Fibers", S("Association fibers", ["association tracts"], concept=True))
add("Commissural Fibers", S("Commissural fibers", ["commissural tracts"], concept=True))
add("Projection Fibers", S("Projection fibers", ["projection tracts"], concept=True))
for _r in ("Interhemispheric fissure", "Interhemispheric Fissure or Median Longitudinal Cerebral Fissure",
           "Median Longitudinal Cerebral Fissure or the Interhemispheric Fissure"):
    add(_r, S("Interhemispheric fissure", ["longitudinal fissure", "median longitudinal cerebral fissure", "longitudinal cerebral fissure", "cerebral longitudinal fissure"]))
add("Lateral fissure", S("Lateral fissure", ["Sylvian fissure", "lateral sulcus", "sylvian sulcus"]))
add("Parieto-occipital fissure", S("Parieto-occipital fissure", ["parieto-occipital sulcus", "parietooccipital sulcus"]))
add("Intraparietal fissure", S("Intraparietal fissure", ["intraparietal sulcus"]))
add("Calcarine fissure", S("Calcarine fissure", ["calcarine sulcus"]))
add("Central sulcus", S("Central sulcus", ["central fissure", "fissure of Rolando", "Rolandic fissure"]))
add("Superior, Middle Inferior Frontal Gyri", S("Superior frontal gyrus", ab=["SFG"]), S("Middle frontal gyrus", ab=["MFG"]), S("Inferior frontal gyrus", ab=["IFG"]))
add("Superior, Middle, Inferior Temporal Gyri", S("Superior temporal gyrus", ab=["STG"]), S("Middle temporal gyrus", ab=["MTG"]), S("Inferior temporal gyrus", ab=["ITG"]))
add("Transverse temporal gyrus", S("Transverse temporal gyrus", ["Heschl's gyrus", "Heschl gyrus"]))
add("Distinguish cervical, thoracic, lumbar and sacral vertebrae",
    S("Cervical vertebrae", ["cervical vertebra", "cervical spine"], concept=True),
    S("Thoracic vertebrae", ["thoracic vertebra", "thoracic spine"], concept=True),
    S("Lumbar vertebrae", ["lumbar vertebra", "lumbar spine"], concept=True),
    S("Sacral vertebrae", ["sacrum", "sacral vertebra", "sacral spine"], concept=True))
add("Dura, Arachnoid and Pia layers of meninges", S("Dura mater", ["dura"]), S("Arachnoid mater", ["arachnoid"]), S("Pia mater", ["pia"]))
add("Epidural, subdural, subarachnoid spaces", S("Epidural space", ["extradural space"]), S("Subdural space"), S("Subarachnoid space"))
add("Dura mater", S("Dura mater", ["dura"]))
add("Arachnoid mater", S("Arachnoid mater", ["arachnoid"]))
add("Pia mater", S("Pia mater", ["pia"]))
add("Epidural space", S("Epidural space", ["extradural space"]))
add("Meningeal blood vessels", S("Meningeal blood vessels", ["meningeal arteries", "middle meningeal artery", "meningeal vessels", "meningeal veins"]))
add("Cerebral blood vessels", S("Cerebral blood vessels", ["cerebral arteries and veins", "cerebral vessels"]))
add("Conus Medullaris", S("Conus medullaris", lat="midline"))
add("Cauda Equina", S("Cauda equina", lat="midline"))
add("Filum Terminale", S("Filum terminale", lat="midline"))
add("Denticulate ligaments", S("Denticulate ligaments", ["denticulate ligament"]))
add("Dorsal and Ventral Rootlets and Roots", S("Dorsal rootlets", ["posterior rootlets"]), S("Ventral rootlets", ["anterior rootlets"]), S("Dorsal root", ["posterior root"]), S("Ventral root", ["anterior root"]))
add("Dorsal Root Ganglion", S("Dorsal root ganglion", ["spinal ganglion", "posterior root ganglion"], ab=["DRG"]))
add("Dural sleeves", S("Dural sleeves", ["dural sleeve"]))
add("Dorsal and Ventral Rami", S("Dorsal ramus", ["dorsal rami", "posterior ramus"]), S("Ventral ramus", ["ventral rami", "anterior ramus"]))
add("Be able to identify the following structures on a histological image of the spinal cord:", None)
add("Dorsal Horns", S("Dorsal horn", ["dorsal horns", "posterior horn of spinal cord", "posterior gray horn"]))
add("Ventral Horns", S("Ventral horn", ["ventral horns", "anterior horn of spinal cord", "anterior gray horn"]))
add("Lateral Horn", S("Lateral horn", ["intermediolateral cell column"], ab=["IML"]))
add("Intermediate Zone", S("Intermediate zone", ["intermediate gray", "zona intermedia"]))
add("Dorsal Columns", S("Dorsal columns", ["dorsal column", "posterior columns", "posterior funiculus", "dorsal funiculus"]))
for _r in ("Fasciculus Gracilis", "Gracile fasciculus"):
    add(_r, S("Fasciculus gracilis", ["gracile fasciculus", "fasciculus gracile"]))
for _r in ("Fasciculus Cuneatus", "Cuneate fasciculus"):
    add(_r, S("Fasciculus cuneatus", ["cuneate fasciculus"]))
add("Gracile nucleus", S("Gracile nucleus", ["nucleus gracilis", "gracilis nucleus"]))
add("Cuneate nucleus", S("Cuneate nucleus", ["nucleus cuneatus", "cuneatus nucleus"]))
for _r in ("Anterolateral Spinothalamic Tract", "Anterolateral tract"):
    add(_r, S("Anterolateral spinothalamic tract", ["anterolateral tract", "anterolateral system", "spinothalamic tract", "spinothalamic"], ab=["ALS", "STT"]))
add("Dorsal Spinocerebellar Tract", S("Dorsal spinocerebellar tract", ["posterior spinocerebellar tract"], ab=["DSCT"]))
add("DREZ (lateral & medial)", S("Dorsal root entry zone", ["dorsal root entry zone (DREZ)"], ab=["DREZ"]),
    S("Lateral dorsal root entry zone", ["lateral DREZ"], parent="Dorsal root entry zone"),
    S("Medial dorsal root entry zone", ["medial DREZ"], parent="Dorsal root entry zone"))
add("Marginal nucleus", S("Marginal nucleus", ["marginal zone", "marginal zone nucleus", "posteromarginal nucleus", "lamina I"], ab=["MN"]))
add("Substantia gelatinosa", S("Substantia gelatinosa", ["lamina II"], ab=["SG"]))
add("Nucleus proprius", S("Nucleus proprius", ["proper sensory nucleus"], ab=["NP"]))
add("Column of Clarke (Nucleus dorsalis)", S("Column of Clarke", ["Clarke's column", "nucleus dorsalis", "Clarke's nucleus", "nucleus dorsalis of Clarke", "dorsal nucleus of Clarke"]))
add("Ventral commissure of spinal cord", S("Ventral commissure of spinal cord", ["anterior white commissure", "ventral white commissure", "ventral commissure"]))
# ---- unit 2
for _r in ("Anterior nucleus", "anterior thalamic nuclei (creating anterior thalamic tubercles)"):
    add(_r, S("Anterior nucleus of thalamus", ["anterior nucleus", "anterior thalamic nucleus", "anterior thalamic nuclei", "anterior thalamic tubercle"], parent="Thalamus"))
add("Pulvinar", S("Pulvinar", ["pulvinar nucleus", "thalamic pulvinar"], parent="Thalamus"))
add("Medial geniculate nucleus", S("Medial geniculate nucleus", ["medial geniculate body", "medial geniculate"], ab=["MGN"], parent="Thalamus"))
add("Lateral geniculate nucleus", S("Lateral geniculate nucleus", ["lateral geniculate body", "lateral geniculate"], ab=["LGN"], parent="Thalamus"))
add("medial and lateral geniculate nuclei", S("Medial geniculate nucleus", ["medial geniculate body"], ab=["MGN"], parent="Thalamus"), S("Lateral geniculate nucleus", ["lateral geniculate body"], ab=["LGN"], parent="Thalamus"))
for _r in ("Pineal gland", "Pineal gland or body"):
    add(_r, S("Pineal gland", ["pineal body", "pineal", "epiphysis"], parent="Epithalamus", lat="midline"))
add("Optic chiasm", S("Optic chiasm", ["optic chiasma", "chiasm"], lat="midline"))
for _r in ("Optic tracts", "Optic tract"):
    add(_r, S("Optic tract", ["optic tracts"]))
add("Mammillary bodies", S("Mammillary bodies", ["mammillary body", "mamillary bodies", "mamillary body"]))
for _r in ("Superior Colliculus", "Superior colliculi"):
    add(_r, S("Superior colliculus", ["superior colliculi"]))
for _r in ("Inferior Colliculus", "Inferior colliculi"):
    add(_r, S("Inferior colliculus", ["inferior colliculi"]))
add("Brachium of the Inferior Colliculus", S("Brachium of the inferior colliculus", ["inferior brachium", "brachium of inferior colliculus", "brachium"]))
for _r in ("Cerebral Peduncles", "Cerebral peduncle", "Cerebral peduncles"):
    add(_r, S("Cerebral peduncles", ["cerebral peduncle", "crus cerebri", "basis pedunculi"]))
add("Interpeduncular Fossa", S("Interpeduncular fossa", lat="midline"))
add("Cerebellar Peduncles", S("Cerebellar peduncles", ["cerebellar peduncle"]))
for _r in ("Superior Cerebellar Peduncle", "Superior cerebellar peduncle (SCP)"):
    add(_r, S("Superior cerebellar peduncle", ["brachium conjunctivum"], ab=["SCP"], parent="Cerebellar peduncles"))
for _r in ("Middle Cerebellar Peduncle", "Middle cerebellar peduncle (MCP)"):
    add(_r, S("Middle cerebellar peduncle", ["brachium pontis"], ab=["MCP"], parent="Cerebellar peduncles"))
for _r in ("Inferior Cerebellar Peduncle", "Inferior cerebellar peduncle (ICP)"):
    add(_r, S("Inferior cerebellar peduncle", ["restiform body"], ab=["ICP"], parent="Cerebellar peduncles"))
add("Superior, middle, inferior cerebellar peduncle", S("Superior cerebellar peduncle", ab=["SCP"], parent="Cerebellar peduncles"),
    S("Middle cerebellar peduncle", ab=["MCP"], parent="Cerebellar peduncles"), S("Inferior cerebellar peduncle", ab=["ICP"], parent="Cerebellar peduncles"))
for _r in ("Transverse fibers of the pons", "Transverse fibers of pons"):
    add(_r, S("Transverse fibers of the pons", ["transverse pontine fibers", "transverse fibers of pons", "pontocerebellar fibers"]))
for _r in ("Longitudinal fibers of the pons", "Longitudinal fibers of pons"):
    add(_r, S("Longitudinal fibers of the pons", ["longitudinal fibers of pons", "longitudinal pontine fibers"]))
add("Facial Colliculus", S("Facial colliculus", ["facial colliculi"]))
for _r in ("Pyramids", "Pyramid"):
    add(_r, S("Pyramids", ["pyramid", "medullary pyramids", "medullary pyramid"]))
add("Pyramids/ motor decussation", S("Pyramids", ["pyramid"]), S("Motor decussation", ["decussation of the pyramids", "pyramidal decussation", "decussation of pyramids", "corticospinal decussation"]))
add("Olives", S("Olives", ["olive"]))
for _r in ("Olive (inferior olivary nucleus)", "Inferior olivary nucleus"):
    add(_r, S("Inferior olivary nucleus", ["inferior olive", "olivary nucleus"], ab=["ION"]))
add("Cuneate and Gracile Tubercles", S("Cuneate tubercle", ["cuneate tubercles", "tuberculum cuneatum"]), S("Gracile tubercle", ["gracile tubercles", "tuberculum gracile"]))
add("Obex", S("Obex", lat="midline"))
add("Area postrema", S("Area postrema", ["chemoreceptor trigger zone"], ab=["AP"]))
for _r in ("3rd ventricle", "Third ventricle"):
    add(_r, S("Third ventricle", ["3rd ventricle", "ventricle III"], ab=["3V"], lat="midline"))
for _r in ("4th Ventricle", "Fourth ventricle"):
    add(_r, S("Fourth ventricle", ["4th ventricle", "ventricle IV"], ab=["4V"], lat="midline"))
add("Cerebral Aqueduct", S("Cerebral aqueduct", ["aqueduct of Sylvius", "mesencephalic aqueduct", "aqueduct"], ab=["CA"], lat="midline"))
add("Interpeduncular cistern", S("Interpeduncular cistern", lat="midline"))
add("(Glossopharyngeal and vagus cannot be easily distinguished from one another; accessory is not present on our brainstems)", None)
for _r in ("Periaqueductal grey matter", "Periaqueductal grey"):
    add(_r, S("Periaqueductal gray", ["periaqueductal grey", "periaqueductal grey matter", "central gray"], ab=["PAG"]))
add("Red nucleus", S("Red nucleus", ["nucleus ruber"]))
add("Oculomotor nucleus", S("Oculomotor nucleus", ["CN III nucleus", "nucleus of CN III", "oculomotor somatic nucleus", "III nucleus"]))
add("Edinger-Westphal nucleus", S("Edinger-Westphal nucleus", ["Edinger Westphal nucleus", "visceral oculomotor nucleus"], ab=["EW"]))
add("Substantia nigra", S("Substantia nigra", ab=["SN"]))
add("CN III, Oculomotor nerve", S("Oculomotor nerve", ["cranial nerve III", "cranial nerve 3", "oculomotor"], ab=["CN III"]))
for _r in ("Medial longitudinal fasciculus (MLF)", "MLF (medial longitudinal fasciculus)"):
    add(_r, S("Medial longitudinal fasciculus", ab=["MLF"]))
add("Medial lemniscus", S("Medial lemniscus"))
for _r in ("CN IV, Trochlear nucleus", "Trochlear Nucleus"):
    add(_r, S("Trochlear nucleus", ["CN IV nucleus", "nucleus of CN IV", "IV nucleus"]))
for _r in ("Decussation of Superior Cerebellar Peduncle (X/SCP)", "X/SCP (Decussation of superior cerebellar peduncle)"):
    add(_r, S("Decussation of the superior cerebellar peduncle", ["SCP decussation", "decussation of superior cerebellar peduncle", "decussation of the SCP"], ab=["X/SCP"]))
add("Motor trigeminal nucleus", S("Motor trigeminal nucleus", ["trigeminal motor nucleus", "motor nucleus of trigeminal", "motor nucleus of V"]))
add("Principal sensory nucleus of trigeminal", S("Principal sensory nucleus of trigeminal", ["principal trigeminal nucleus", "chief sensory nucleus", "trigeminal principal sensory nucleus", "principal sensory trigeminal nucleus", "main sensory nucleus"]))
add("Pontine nuclei", S("Pontine nuclei", ["pontine nucleus", "basilar pontine nuclei"]))
add("Pontine protuberance", S("Pontine protuberance", ["basilar pons", "basis pontis", "ventral pons"]))
add("Abducens nucleus", S("Abducens nucleus", ["CN VI nucleus", "nucleus of CN VI", "VI nucleus"]))
add("Facial nucleus", S("Facial nucleus", ["CN VII nucleus", "facial motor nucleus", "nucleus of CN VII"]))
add("Vestibulocochlear complex", S("Vestibulocochlear complex", ["vestibulocochlear nuclei", "vestibular nuclei", "vestibular nucleus", "vestibular complex", "cochlear nuclei"]))
add("Cerebellum", S("Cerebellum", lat="midline"))
add("CN VII, Facial", S("Facial nerve", ["cranial nerve VII", "cranial nerve 7", "facial"], ab=["CN VII"]))
add("Hypoglossal nucleus", S("Hypoglossal nucleus", ["CN XII nucleus", "nucleus of CN XII", "XII nucleus"]))
add("Dorsal motor nucleus of vagus (DMV / DMX) Solitary nucleus",
    S("Dorsal motor nucleus of the vagus", ["dorsal motor nucleus of vagus", "dorsal motor nucleus of X", "dorsal vagal nucleus"], ab=["DMV", "DMX"]),
    S("Solitary nucleus", ["nucleus solitarius", "nucleus of the solitary tract", "solitary tract nucleus"], ab=["NTS"]))
add("Nucleus Ambiguus", S("Nucleus ambiguus", ["ambiguus nucleus"]))
add("CN IX, Glossopharyngeal", S("Glossopharyngeal nerve", ["cranial nerve IX", "cranial nerve 9", "glossopharyngeal"], ab=["CN IX"]))
add("CN X, Vagus", S("Vagus nerve", ["cranial nerve X", "cranial nerve 10", "vagus"], ab=["CN X"]))
add("CN XII, Hypoglossal", S("Hypoglossal nerve", ["cranial nerve XII", "cranial nerve 12", "hypoglossal"], ab=["CN XII"]))
add("Spinal trigeminal nucleus", S("Spinal trigeminal nucleus", ["spinal nucleus of trigeminal", "trigeminal spinal nucleus", "spinal nucleus of V"]))
add("Internal arcuate fibers", S("Internal arcuate fibers", ["internal arcuate fibres"]))
add("Lateral corticospinal tract", S("Lateral corticospinal tract", ["lateral CST"], ab=["LCST"]))
add("Anterior corticospinal tract", S("Anterior corticospinal tract", ["ventral corticospinal tract", "anterior CST"], ab=["ACST"]))
add("Lateral funiculus", S("Lateral funiculus", ["lateral column"]))
add("Anterior/ventral funiculus", S("Anterior funiculus", ["ventral funiculus", "anterior/ventral funiculus", "anterior column", "ventral column"]))
add("Location of limb lower motor neurons", S("Location of limb lower motor neurons", ["limb lower motor neurons", "lateral ventral horn"], concept=True))
add("Location of trunk lower motor neurons", S("Location of trunk lower motor neurons", ["trunk lower motor neurons", "medial ventral horn"], concept=True))
add("Optic nerve (CN II)", S("Optic nerve", ["cranial nerve II", "cranial nerve 2", "optic"], ab=["CN II"]))
add("Optic radiations", S("Optic radiations", ["geniculocalcarine tract", "optic radiation", "geniculocalcarine radiation"]))
add("Suprachiasmatic nucleus (know general location of)", S("Suprachiasmatic nucleus", ab=["SCN"]))
add("Know that PPRF (lateral gaze center) surrounds Abducens nucleus", S("Paramedian pontine reticular formation", ["lateral gaze center", "horizontal gaze center"], ab=["PPRF"]))
# ---- unit 3
add("Insular Cortex", S("Insular cortex", ["insula", "insular lobe"]))
add("Anterior horn", S("Anterior horn of lateral ventricle", ["anterior horn", "frontal horn", "anterior horn of the lateral ventricle", "frontal horn of lateral ventricle"], ab=["AH"], parent="Lateral ventricle", lat="paired"))
add("Posterior horn", S("Posterior horn of lateral ventricle", ["posterior horn", "occipital horn", "posterior horn of the lateral ventricle", "occipital horn of lateral ventricle"], ab=["PH"], parent="Lateral ventricle", lat="paired"))
add("Inferior horn", S("Inferior horn of lateral ventricle", ["inferior horn", "temporal horn", "inferior horn of the lateral ventricle", "temporal horn of lateral ventricle", "inferior horn of LV"], ab=["IH"], parent="Lateral ventricle", lat="paired"))
for _r in ("Atrium or trigone", "trigone or atrium"):
    add(_r, S("Atrium of lateral ventricle", ["atrium", "trigone", "trigone of lateral ventricle", "atrium or trigone"], parent="Lateral ventricle", lat="paired"))
add("Lateral ventricle", S("Lateral ventricle", ["lateral ventricles"], ab=["LV"], lat="paired"))
for _r in ("Septum pellucidum which separates the two lateral ventricles", "Septum pellucidum"):
    add(_r, S("Septum pellucidum", ["pellucid septum"], lat="midline"))
add("Genu", S("Genu of corpus callosum", ["genu", "genu of CC", "genu of the corpus callosum"], parent="Corpus callosum", lat="midline"))
add("Splenium", S("Splenium of corpus callosum", ["splenium", "splenium of CC", "splenium of the corpus callosum"], parent="Corpus callosum", lat="midline"))
add("Corpus callosum", S("Corpus callosum", ["callosum"], ab=["CC"], lat="midline"))
for _r in ("Caudate : head, body, tail", "caudate : head, body, tail"):
    add(_r, S("Caudate nucleus", ["caudate"], parent="Basal ganglia"),
        S("Head of caudate nucleus", ["caudate head", "head of caudate", "head of the caudate nucleus"], parent="Caudate nucleus"),
        S("Body of caudate nucleus", ["caudate body", "body of caudate", "body of the caudate nucleus"], parent="Caudate nucleus"),
        S("Tail of caudate nucleus", ["caudate tail", "tail of caudate", "tail of the caudate nucleus"], parent="Caudate nucleus"))
add("Putamen", S("Putamen", parent="Basal ganglia"))
add("Globus pallidus", S("Globus pallidus", ["pallidum"], ab=["GP"], parent="Basal ganglia"))
add("Corpus Striatum is composed of:", S("Corpus striatum", ["striatum"]))
add("1. Head of the caudate nucleus", S("Head of caudate nucleus", ["caudate head", "head of caudate"], parent="Caudate nucleus"))
add("2. Putamen", S("Putamen", parent="Basal ganglia"))
add("3. The region separating these two nuclear masses by fibers of the anterior limb of the internal capsule.", None)
add("Lentiform (lens shaped) nucleus is composed of Putamen and Globus pallidus", S("Lentiform nucleus", ["lenticular nucleus", "lentiform (lens shaped) nucleus", "lenticular"]))
add("Corpus Striatum and Lentiform nucleus", S("Corpus striatum", ["striatum"]), S("Lentiform nucleus", ["lenticular nucleus"]))
add("Anterior limb", S("Anterior limb of internal capsule", ["anterior limb", "internal capsule anterior limb"], ab=["ALIC"], parent="Internal capsule"))
add("Posterior limb", S("Posterior limb of internal capsule", ["posterior limb", "internal capsule posterior limb"], ab=["PLIC"], parent="Internal capsule"))
add("Internal Capsule", S("Internal capsule"))
for _r in ("Fornix (crus, body, columns)", "fornix (crus, body, columns)"):
    add(_r, S("Fornix"), S("Crus of fornix", ["fornix crus", "crura of fornix", "crus"], parent="Fornix"),
        S("Body of fornix", ["fornix body"], parent="Fornix"),
        S("Columns of the fornix", ["fornix columns", "columns of fornix", "column of the fornix"], parent="Fornix"))
for _r in ("Columns of the fornix", "columns of the fornix"):
    add(_r, S("Columns of the fornix", ["fornix columns", "columns of fornix"], parent="Fornix"))
for _r in ("Anterior perforated substance", "Anterior Perforated Substance"):
    add(_r, S("Anterior perforated substance", ["anterior perforated space"], ab=["APS"]))
add("Amygdala", S("Amygdala", ["amygdaloid nucleus", "amygdaloid body", "amygdaloid complex"]))
for _r in ("Thalamus", "thalamus (dorsal thalamus)"):
    add(_r, S("Thalamus", ["dorsal thalamus"]))
add("Lamina terminalis", S("Lamina terminalis", lat="midline"))
add("Anterior commissure", S("Anterior commissure", ab=["AC"], lat="midline"))
add("Posterior commissure", S("Posterior commissure", ab=["PC"], lat="midline"))
add("Stria medullaris thalamicus", S("Stria medullaris thalami", ["stria medullaris", "stria medullaris thalamicus"]))
add("Habenula", S("Habenula", ["habenular nuclei"], parent="Epithalamus"))
add("Epithalamus", S("Epithalamus", lat="midline"))
add("Midbrain", S("Midbrain", ["mesencephalon"], lat="midline"))
add("Pons", S("Pons", lat="midline"))
add("Cortical Ribbon or Cortical gray matter", S("Cortical ribbon", ["cortical gray matter", "cortical grey matter", "cortical gray"]))
add("basal forebrain nuclei area", S("Basal forebrain nuclei", ["basal forebrain area", "basal forebrain", "basal nucleus of Meynert"]))
add("Nucleus accumbens", S("Nucleus accumbens", ["accumbens"]))
add("subthalamic nucleus", S("Subthalamic nucleus", ab=["STN"]))
add("Tonsil", S("Cerebellar tonsil", ["tonsil", "tonsils"]))
add("Vermis", S("Vermis", ["cerebellar vermis"], lat="midline"))
add("Paravermis", S("Paravermis", ["paravermal zone", "intermediate zone of cerebellum", "paravermal"]))
add("Lateral hemisphere", S("Cerebellar lateral hemisphere", ["lateral hemisphere", "cerebellar hemisphere", "lateral cerebellar hemisphere"]))
add("Dentate nucleus (in cross-section of cerebellum)", S("Dentate nucleus", ["dentate", "lateral cerebellar nucleus"]))
add("Vertebral Artery", S("Vertebral artery", ["vertebral arteries"], ab=["VA"]))
add("Basilar Artery", S("Basilar artery", ["basilar"], lat="midline"))
add("Cerebellar branches (three pairs supply cerebellum) - only ID for Superior Cerebellar Artery", S("Superior cerebellar artery", ["superior cerebellar a."], ab=["SCA"]))
add("Penetrating branches (supply brain stem)", S("Penetrating branches (brainstem)", ["penetrating branches", "paramedian branches", "perforating branches of the basilar artery"]))
add("Pontine arteries", S("Pontine arteries", ["pontine branches", "pontine artery"]))
add("Posterior Cerebral Artery", S("Posterior cerebral artery", ab=["PCA"]))
add("Posterior Communicating Artery", S("Posterior communicating artery", ["PCom", "PComA"], ab=["PCoA"]))
add("Internal Carotid Artery", S("Internal carotid artery", ["internal carotid arteries", "internal carotid"], ab=["ICA"]))
add("Middle Cerebral Artery", S("Middle cerebral artery", ab=["MCA"]))
add("Lenticulostriate Arteries penetrating Anterior Perforated Substance", S("Lenticulostriate arteries", ["lenticulostriate", "lenticulostriate branches", "lateral striate arteries"]))
add("Anterior Cerebral Artery", S("Anterior cerebral artery", ab=["ACA"]))
add("Pericallosal Artery", S("Pericallosal artery"))
add("Callosomarginal Artery", S("Callosomarginal artery"))
add("Anterior Communicating Artery", S("Anterior communicating artery", ["ACom", "AComA"], ab=["ACoA"], lat="midline"))
add("The Circle of Willis", S("Circle of Willis", ["cerebral arterial circle", "circulus arteriosus"], lat="midline"))
add("Anterior spinal artery", S("Anterior spinal artery", ab=["ASA"], lat="midline"))
add("Posterior spinal arteries (only in a picture)", S("Posterior spinal arteries", ["posterior spinal artery"]))
add("Major structures from coronal/horizontal specimens (i.e. basal ganglia, thalamus, corpus callosum, ventricles, septum pellucidum)", None)
add("Differentiation of major imaging types", S("Major imaging types", ["CT vs MRI", "imaging modalities", "CT MRI differentiation"], concept=True))
add("Brain bleeds", S("Brain bleeds", ["intracranial hemorrhage", "intracranial hemorrhages", "hemorrhage types"], concept=True))
add("Parietal Bone", S("Parietal bone", lat="paired", region="skull"))
add("Frontal Bone", S("Frontal bone", lat="midline", region="skull"))
add("Temporal Bone", S("Temporal bone", lat="paired", region="skull"))
add("Occipital Bone", S("Occipital bone", lat="midline", region="skull"))
add("Sphenoid Bone", S("Sphenoid bone", ["sphenoid"], lat="midline", region="skull"))
add("Falx cerebri", S("Falx cerebri", ["falx"], parent="Dura mater", lat="midline"))
add("Tentorium cerebelli", S("Tentorium cerebelli", ["tentorium"], parent="Dura mater", lat="midline"))
add("Choroid plexus", S("Choroid plexus", ab=["ChP"]))
add("Superior sagittal sinus", S("Superior sagittal sinus", ab=["SSS"], lat="midline"))
add("Brainstem", S("Brainstem", ["brain stem"], lat="midline"))

CRANIALS = [("I", "Olfactory nerve", ["olfactory", "olfactory tract", "olfactory bulb"]), ("II", "Optic nerve", ["optic"]),
            ("III", "Oculomotor nerve", ["oculomotor"]), ("IV", "Trochlear nerve", ["trochlear"]), ("V", "Trigeminal nerve", ["trigeminal"]),
            ("VI", "Abducens nerve", ["abducens", "abducent nerve"]), ("VII", "Facial nerve", ["facial"]),
            ("VIII", "Vestibulocochlear nerve", ["vestibulocochlear", "vestibular nerve", "cochlear nerve", "auditory nerve"]),
            ("IX", "Glossopharyngeal nerve", ["glossopharyngeal"]), ("X", "Vagus nerve", ["vagus"]),
            ("XI", "Accessory nerve", ["spinal accessory nerve", "accessory", "spinal accessory"]), ("XII", "Hypoglossal nerve", ["hypoglossal"])]
ARABIC = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8, "IX": 9, "X": 10, "XI": 11, "XII": 12}
