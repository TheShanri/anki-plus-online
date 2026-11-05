"""CONTENT-3: content/nsci3250/pathways.json + cards/pathways-u{1,2,3}.json. Run: tools/.venv/Scripts/python.exe -I tools/content/build_pathways.py"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pwlib import Deck, C

D = Deck("pathway", "pathways-{u}", "pathways", "pathways")
PW = []
card = D.add


def pathway(slug, name, unit, modality, neurons, decussation, lesion, src, note=None):
    PW.append({"slug": slug, "name": name, "unit": unit, "modality": modality, "neurons": neurons,
               "decussation": decussation, "lesion": lesion, "sources": src})
    D.src(slug, *src)


def n(order, cell, tract, syn, level, dec=False):
    return {"order": order, "cell_body": cell, "tract": tract, "synapse": syn, "level": level, "decussates": dec}


# ============================== UNIT 1
pathway("dcml", "Dorsal column - medial lemniscus (body)", "u1", "Conscious proprioception, fine touch, vibration, pressure, skin stretch",
        [n(1, "dorsal root ganglion (pseudounipolar)", "fasciculus gracilis (legs, below T6) / fasciculus cuneatus (arms, above T6), dorsal funiculus", "gracile / cuneate nucleus, ipsilateral", "cord to caudal medulla"),
         n(2, "gracile / cuneate nucleus", "internal arcuate fibers then medial lemniscus", "contralateral VPL thalamus", "caudal medulla", True),
         n(3, "VPL nucleus of thalamus", "internal capsule (posterior limb)", "primary somatosensory cortex BA 3,1,2", "thalamus")],
        "Caudal medulla (internal arcuate fibers)", {"below_decussation": "ipsilateral loss", "above": "contralateral loss"},
        ["lecture-5", "lecture-9", "Sensory Pathway Cheat Sheet", "lab-5"])
card("u1", "dcml", "modality", "Which sensations does the dorsal column - medial lemniscus (DCML) pathway carry?", "Conscious proprioception, fine touch, vibration, pressure", [["proprioception", "position"], ["touch", "vibration", "pressure"]])
card("u1", "dcml", "first-order", "Where is the cell body of the first-order neuron of the DCML pathway?", "Dorsal root ganglion", [["dorsal root ganglion", "drg", "dorsal root ganglia"]])
card("u1", "dcml", "first-order-shape", "What is the shape of a dorsal root ganglion (first-order) neuron?", "Pseudounipolar", accept=["pseudo-unipolar", "pseudo unipolar"])
card("u1", "dcml", "fiber", "Which fiber types carry DCML information from the periphery?", "A-alpha (Ia/Ib) and A-beta (type II)", [["alpha", "aα", "ia", "1a"], ["beta", "aβ", "type ii", "type 2"]])
card("u1", "dcml", "receptors", "Name the cutaneous receptors served by the DCML pathway.", "Meissner, Merkel, Pacinian and Ruffini endings (plus muscle spindles and Golgi tendon organs for proprioception)", [["meissner"], ["merkel"], ["pacinian"], ["ruffini"]])
card("u1", "dcml", "tract-leg", "Which fasciculus of the dorsal column carries sensation from the legs (below T6)?", "Fasciculus gracilis", accept=["gracile fasciculus", "gracilis"], structure="fasciculus-gracilis")
card("u1", "dcml", "tract-arm", "Which fasciculus of the dorsal column carries sensation from the arms (above T6)?", "Fasciculus cuneatus", accept=["cuneate fasciculus", "cuneatus"], structure="fasciculus-cuneatus")
card("u1", "dcml", "topography", "In the dorsal columns, which fasciculus lies closest to the midline?", "Fasciculus gracilis (sacral/lower limb fibers lie medially; cervical fibers laterally)", [["gracilis", "gracile"]])
card("u1", "dcml", "funiculus", "In which funiculus of the spinal cord do DCML first-order axons ascend?", "Dorsal (posterior) funiculus", [["dorsal", "posterior"]])
card("u1", "dcml", "synapse-1", "Where do first-order DCML axons synapse?", "Gracile or cuneate nucleus in the caudal medulla (ipsilateral)", [["gracile", "gracilis", "cuneate", "cuneatus"], ["medulla"]])
card("u1", "dcml", "synapse-skip", "True or false: DCML first-order axons synapse in the dorsal horn on entering the cord.", "False", fmt="tf", accept=["false", "f"], explain="They ascend ipsilaterally without synapsing until the medulla.")
card("u1", "dcml", "second-order", "Where is the cell body of the second-order DCML neuron?", "Gracile or cuneate nucleus (caudal medulla)", [["gracile", "gracilis", "cuneate", "cuneatus"]])
card("u1", "dcml", "decussation", "Where does the DCML pathway decussate?", "Caudal medulla (internal arcuate fibers, the sensory decussation)", [["medulla"], ["internal arcuate", "arcuate", "sensory decussation"]])
card("u1", "dcml", "tract-above", "After crossing, in which tract do second-order DCML axons ascend?", "Medial lemniscus", accept=["medial lemniscus tract"])
card("u1", "dcml", "third-order", "Where is the cell body of the third-order DCML neuron (body)?", "Ventral posterolateral (VPL) nucleus of the thalamus", [["vpl", "ventral posterolateral", "ventroposterolateral", "posterolateral"]])
card("u1", "dcml", "cortex", "Which cortical area receives DCML information, and on which side of the stimulus?", "Primary somatosensory cortex (BA 3, 1, 2), contralateral", [["somatosensory", "postcentral", "3,1,2", "s1"], ["contralateral"]])
card("u1", "dcml", "capsule", "Third-order DCML axons travel from thalamus to cortex through which white-matter structure?", "Internal capsule (posterior limb)", [["internal capsule"]])
card("u1", "dcml", "lesion-below", "A lesion of the right dorsal column in the lumbar spinal cord causes loss of vibration sense on which side?", "Right (ipsilateral): the axons have not yet crossed", [["right", "ipsilateral", "same"]])
card("u1", "dcml", "lesion-above", "A lesion of the left medial lemniscus in the pons causes loss of fine touch on which side of the body?", "Right (contralateral): the axons crossed in the caudal medulla", [["right", "contralateral", "opposite"]])
card("u1", "dcml", "order-count", "How many neurons carry DCML information from receptor to cortex, and where is the last cell body?", "Three (DRG, gracile/cuneate nucleus, VPL thalamus); last in VPL", [["three", "3"], ["vpl", "thalamus"]])

pathway("alst", "Anterolateral spinothalamic pathway (body)", "u1", "Pain, temperature, itch, crude touch",
        [n(1, "dorsal root ganglion", "A-delta and C fibers, lateral dorsal root entry zone", "marginal zone (A-delta) / substantia gelatinosa onto nucleus proprius (C), ipsilateral", "level of entry"),
         n(2, "marginal zone nucleus (sharp pain) or nucleus proprius (dull pain)", "anterior white commissure then contralateral anterolateral tract", "contralateral VPL thalamus", "spinal cord, near entry level", True),
         n(3, "VPL nucleus of thalamus", "internal capsule", "primary somatosensory cortex", "thalamus")],
        "Spinal cord (anterior white commissure), near the level of entry", {"below_decussation": "ipsilateral loss only 1-2 segments at the lesion", "above": "contralateral loss below the lesion"},
        ["lecture-5", "lecture-9", "Sensory Pathway Cheat Sheet", "lab-5"])
card("u1", "alst", "modality", "Which sensations are carried by the anterolateral spinothalamic tract?", "Pain, temperature, itch and crude touch", [["pain"], ["temperature", "temp"]])
card("u1", "alst", "fiber", "Which two fiber types carry pain/temperature information into the cord?", "A-delta (lightly myelinated) and C (unmyelinated)", [["a-delta", "adelta", "aδ", "a delta", "type iii", "type 3"], ["c fiber", "c fibre", "c fibers", "unmyelinated", "type iv", "type 4", "c"]])
card("u1", "alst", "receptor", "Which receptor type detects the stimuli carried by the anterolateral system?", "Free nerve endings", [["free nerve"]])
card("u1", "alst", "fast-pain", "Which fiber type carries fast, sharp, well-localised pain?", "A-delta", [["a-delta", "adelta", "aδ", "a delta", "type iii", "type 3"]])
card("u1", "alst", "slow-pain", "Which fiber type carries slow, dull, burning pain?", "C fibers (unmyelinated)", [["c fiber", "c fibre", "c fibers", "unmyelinated", "type iv", "type 4", "c"]])
card("u1", "alst", "synapse-adelta", "Where do A-delta pain fibers synapse in the dorsal horn?", "Marginal zone (lamina I)", [["marginal", "lamina i"]])
card("u1", "alst", "synapse-c", "Where do C fibers synapse in the dorsal horn?", "Substantia gelatinosa (lamina II), onto dendrites of nucleus proprius neurons", [["substantia gelatinosa", "gelatinosa", "nucleus proprius", "lamina ii"]])
card("u1", "alst", "second-order", "Where is the second-order neuron cell body of the anterolateral pathway?", "Dorsal horn: marginal zone (fast pain) or nucleus proprius (slow pain)", [["dorsal horn", "marginal", "nucleus proprius"]])
card("u1", "alst", "decussation", "Where and through which structure does the anterolateral pathway decussate?", "In the spinal cord, through the anterior (ventral) white commissure, near the level of entry", [["anterior", "ventral"], ["commissure"]])
card("u1", "alst", "funiculus", "In which funiculi do second-order anterolateral axons ascend?", "Anterior and lateral funiculi (contralateral)", [["anterior", "ventral", "lateral"]])
card("u1", "alst", "third-order", "Where is the third-order neuron of the anterolateral pathway (body)?", "VPL nucleus of the thalamus", [["vpl", "ventral posterolateral", "ventroposterolateral"]])
card("u1", "alst", "lesion", "A right-sided spinal cord hemisection at T10 abolishes pain and temperature below the lesion on which side?", "Left (contralateral): second-order axons have already crossed", [["left", "contralateral", "opposite"]])
card("u1", "alst", "lesion-level", "A lesion of the right anterolateral tract in the cervical cord causes loss of pain/temperature on which side?", "Left (contralateral), beginning 1-2 segments below the lesion", [["left", "contralateral", "opposite"]])
card("u1", "alst", "modulation", "Which brainstem structures send descending fibers to modulate pain in the substantia gelatinosa?", "Periaqueductal grey and reticular formation (opiates act here)", [["periaqueductal", "pag", "reticular"]])
card("u1", "alst", "compare-dcml", "True or false: the DCML pathway crosses in the spinal cord while the anterolateral pathway crosses in the medulla.", "False (reversed): anterolateral crosses in the cord, DCML in the caudal medulla", fmt="tf", accept=["false", "f"])

pathway("dsct", "Dorsal spinocerebellar pathway (lower limb)", "u1", "Unconscious proprioception",
        [n(1, "dorsal root ganglion", "A-alpha (Ia/Ib) from muscle spindles and Golgi tendon organs", "Clarke's nucleus (C8-L2), ipsilateral", "level of entry"),
         n(2, "Clarke's nucleus (nucleus dorsalis)", "dorsal spinocerebellar tract (lateral funiculus), inferior cerebellar peduncle", "ipsilateral cerebellar cortex", "cord to cerebellum")],
        "None (ipsilateral throughout)", {"below_decussation": "ipsilateral incoordination", "above": "ipsilateral (no decussation)"},
        ["lecture-5", "Sensory Pathway Cheat Sheet", "lab-5"])
card("u1", "dsct", "modality", "Which sensory information does the dorsal spinocerebellar tract carry?", "Unconscious proprioception (muscle length, tension, joint position)", [["unconscious"], ["proprioception"]])
card("u1", "dsct", "receptors", "Which receptors give rise to the dorsal spinocerebellar pathway?", "Muscle spindles and Golgi tendon organs", [["spindle"], ["golgi", "tendon"]])
card("u1", "dsct", "fiber", "Which fiber type carries dorsal spinocerebellar afferents?", "A-alpha (Ia / Ib)", [["alpha", "aα", "ia", "1a"]])
card("u1", "dsct", "second-order", "Where is the second-order neuron cell body of the dorsal spinocerebellar tract?", "Clarke's nucleus (nucleus dorsalis) in the ipsilateral spinal cord", [["clarke", "nucleus dorsalis", "dorsalis"]])
card("u1", "dsct", "levels", "Over which spinal levels does Clarke's nucleus exist?", "C8 to L2", [["c8"], ["l2"]])
card("u1", "dsct", "funiculus", "In which funiculus does the dorsal spinocerebellar tract ascend?", "Lateral funiculus", [["lateral"]])
card("u1", "dsct", "decussation", "Does the dorsal spinocerebellar pathway decussate?", "No: ipsilateral throughout", [["no", "not", "ipsilateral"]])
card("u1", "dsct", "peduncle", "Through which cerebellar peduncle does the dorsal spinocerebellar tract enter the cerebellum?", "Inferior cerebellar peduncle", [["inferior", "icp"]])
card("u1", "dsct", "target", "Where do dorsal spinocerebellar axons terminate, and on which side of the body?", "Ipsilateral cerebellar cortex", [["cerebell"], ["ipsilateral", "same"]])
card("u1", "dsct", "lesion", "A lesion of the right dorsal spinocerebellar tract produces uncoordinated movement on which side?", "Right (ipsilateral)", [["right", "ipsilateral", "same"]])

pathway("sympathetic", "Sympathetic motor pathway", "u1", "Fight or flight (thoracolumbar outflow)",
        [n(1, "lateral horn T1-L2 (intermediolateral column)", "ventral root, lightly myelinated preganglionic (ACh)", "paravertebral (chain) or prevertebral ganglion", "T1-L2"),
         n(2, "sympathetic ganglion", "long unmyelinated postganglionic (norepinephrine)", "smooth muscle, cardiac muscle, glands", "periphery")],
        "None", {"below_decussation": "n/a", "above": "n/a"}, ["lecture-6"])
pathway("parasympathetic", "Parasympathetic motor pathway", "u1", "Rest and digest (craniosacral outflow)",
        [n(1, "nuclei of CN III, VII, IX, X or lateral horn S2-S4", "long preganglionic (ACh)", "ganglion near or in the target organ", "brainstem; S2-S4"),
         n(2, "ganglion on/near organ", "short postganglionic (ACh)", "target organ", "periphery")],
        "None", {"below_decussation": "n/a", "above": "n/a"}, ["lecture-6"])
pathway("umn-lmn", "Upper and lower motor neuron hierarchy", "u1", "Voluntary movement",
        [n(1, "UMN: layer V motor cortex", "descending tracts", "LMN in ventral horn or brainstem motor nucleus", "CNS"), n(2, "LMN: ventral horn (lamina IX)", "ventral root, nerve", "skeletal muscle", "spinal cord")],
        "see specific tracts", {"below_decussation": "n/a", "above": "n/a"}, ["lecture-6", "lecture-10"])
card("u1", "sympathetic", "preganglionic", "Where are sympathetic preganglionic cell bodies located?", "Lateral horn (intermediolateral column) of spinal cord levels T1-L2", [["lateral horn", "intermediolateral"], ["t1"], ["l2"]])
card("u1", "sympathetic", "outflow", "Sympathetic outflow is called what, in terms of spinal levels?", "Thoracolumbar (T1-L2)", [["thoracolumbar", "t1"]])
card("u1", "sympathetic", "ganglia", "Where do sympathetic preganglionic axons synapse?", "Paravertebral (sympathetic chain) or prevertebral ganglia", [["paravertebral", "chain", "prevertebral"]])
card("u1", "sympathetic", "fibers", "In the sympathetic system, are the preganglionic and postganglionic fibers short or long?", "Short preganglionic, long postganglionic", [["short"], ["long"]])
card("u1", "sympathetic", "transmitters", "Which transmitter do sympathetic postganglionic neurons release?", "Norepinephrine (preganglionic releases ACh)", [["norepinephrine", "noradrenaline", "ne"]])
card("u1", "sympathetic", "adrenal", "Which gland is a modified sympathetic ganglion stimulated directly by cholinergic preganglionic neurons?", "Adrenal medulla", [["adrenal"]])
card("u1", "sympathetic", "exit", "Through which root do autonomic preganglionic axons leave the spinal cord?", "Ventral root", [["ventral", "anterior"]])
card("u1", "parasympathetic", "preganglionic", "Which cranial nerves and spinal levels carry parasympathetic preganglionic outflow?", "CN III, VII, IX, X and sacral S2-S4", [["iii", "3", "oculomotor"], ["vii", "7", "facial"], ["ix", "9", "glossopharyngeal"], ["x", "10", "vagus"], ["s2", "sacral"]])
card("u1", "parasympathetic", "outflow-name", "Parasympathetic outflow is called what?", "Craniosacral", [["craniosacral"]])
card("u1", "parasympathetic", "fibers", "In the parasympathetic system, are preganglionic and postganglionic fibers short or long?", "Long preganglionic, short postganglionic (ganglia near or in the organ)", [["long"], ["short"]])
card("u1", "parasympathetic", "transmitters", "Which transmitter do parasympathetic postganglionic neurons release?", "Acetylcholine", [["acetylcholine", "ach"]])
card("u1", "parasympathetic", "sacral", "Where are sacral parasympathetic preganglionic cell bodies?", "Lateral horn of S2-S4", [["s2", "s2-s4", "s2-4"]])
card("u1", "umn-lmn", "umn", "Where is the cell body of an upper motor neuron of the corticospinal system?", "Layer V of primary motor cortex (precentral gyrus)", [["layer v", "layer 5", "precentral", "motor cortex"]])
card("u1", "umn-lmn", "lmn", "Where are lower motor neuron cell bodies located?", "Ventral horn of the spinal cord (lamina IX) or brainstem motor nuclei", [["ventral horn", "anterior horn", "motor nucle"]])
card("u1", "umn-lmn", "umn-lesion", "Damage to upper motor neurons produces which kind of paralysis?", "Spastic paralysis (hyperreflexia, rigidity)", [["spastic"]])
card("u1", "umn-lmn", "lmn-lesion", "Damage to lower motor neurons produces which kind of paralysis?", "Flaccid paralysis with atrophy", [["flaccid"]])
card("u1", "umn-lmn", "alpha-gamma", "What do alpha versus gamma motor neurons innervate?", "Alpha: extrafusal skeletal muscle fibers; gamma: intrafusal fibers of the muscle spindle", [["alpha", "extrafusal"], ["gamma", "intrafusal", "spindle"]])
card("u1", "umn-lmn", "limb-plexus", "Which spinal levels hold limb lower motor neurons for the arm and for the leg?", "Arm C5-T1 (brachial plexus); leg L2-S3 (lumbosacral)", [["c5"], ["t1"], ["l2", "l4"], ["s3"]])

# ============================== UNIT 2
pathway("trigeminal-discriminative", "Trigeminal discriminative touch (face)", "u2", "Fine touch, vibration, pressure from the face",
        [n(1, "trigeminal ganglion", "CN V", "principal sensory nucleus of V, ipsilateral", "rostral pons"),
         n(2, "principal sensory nucleus of V", "trigeminal lemniscus (joins medial lemniscus)", "contralateral VPM thalamus", "rostral pons", True),
         n(3, "VPM nucleus of thalamus", "internal capsule", "primary somatosensory cortex (face)", "thalamus")],
        "Pons (second-order fibers cross)", {"below_decussation": "ipsilateral facial loss", "above": "contralateral loss"}, ["lecture-9", "Sensory Pathway Cheat Sheet extended"])
pathway("trigeminal-pain", "Trigeminal pain and temperature (face)", "u2", "Pain, temperature, itch, crude touch from the face (CN V, VII, IX, X)",
        [n(1, "trigeminal ganglion (and geniculate/glossopharyngeal/vagal ganglia)", "spinal trigeminal tract", "spinal trigeminal nucleus, ipsilateral", "pons to caudal medulla"),
         n(2, "spinal trigeminal nucleus", "trigeminothalamic tract (beside anterolateral tract)", "contralateral VPM thalamus", "medulla", True),
         n(3, "VPM nucleus of thalamus", "internal capsule", "primary somatosensory cortex (face)", "thalamus")],
        "Brainstem, just after the spinal trigeminal nucleus", {"below_decussation": "ipsilateral facial pain loss", "above": "contralateral loss"}, ["lecture-9", "lab-9"])
pathway("jaw-jerk", "Mesencephalic V jaw-jerk reflex", "u2", "Proprioception from muscles of mastication",
        [n(1, "mesencephalic nucleus of V (inside the CNS)", "CN V", "motor nucleus of V (monosynaptic)", "midbrain / rostral pons")],
        "None", {"below_decussation": "n/a", "above": "n/a"}, ["lecture-9"])
card("u2", "trigeminal-discriminative", "modality", "Which sensations reach the principal sensory trigeminal nucleus?", "Fine touch, vibration, pressure from the face", [["touch"], ["vibration", "pressure"]])
card("u2", "trigeminal-discriminative", "first-order", "Where is the first-order cell body for facial touch?", "Trigeminal ganglion", [["trigeminal ganglion", "semilunar", "gasserian"]])
card("u2", "trigeminal-discriminative", "ganglion-location", "In which cranial fossa does the trigeminal ganglion lie?", "Middle cranial fossa", [["middle"]])
card("u2", "trigeminal-discriminative", "second-order", "Where is the second-order neuron for facial discriminative touch?", "Principal (chief) sensory nucleus of V, rostral pons", [["principal", "chief", "main"]])
card("u2", "trigeminal-discriminative", "level", "At which brainstem level is the principal sensory nucleus of V?", "Rostral pons", [["rostral pons", "mid pons", "pons"]])
card("u2", "trigeminal-discriminative", "tract", "Which tract carries second-order axons from the principal nucleus to the thalamus?", "Trigeminal lemniscus (part of the medial lemniscus)", [["trigeminal lemniscus", "medial lemniscus"]])
card("u2", "trigeminal-discriminative", "third-order", "Which thalamic nucleus relays facial somatosensation?", "Ventral posteromedial (VPM)", [["vpm", "ventral posteromedial", "ventroposteromedial", "posteromedial"]])
card("u2", "trigeminal-discriminative", "vs-body", "Which thalamic nucleus relays touch from the body versus the face?", "Body: VPL; face: VPM", [["vpl"], ["vpm"]])
card("u2", "trigeminal-discriminative", "cortex", "Where does VPM project?", "Primary somatosensory cortex (face area), via the internal capsule", [["somatosensory", "postcentral"]])
card("u2", "trigeminal-pain", "modality", "Which sensations are relayed by the spinal trigeminal nucleus?", "Pain, temperature, itch and crude touch", [["pain"], ["temperature", "temp"]])
card("u2", "trigeminal-pain", "nerves", "Which cranial nerves send pain/temperature input to the spinal trigeminal nucleus?", "V, VII, IX and X", [["v", "5", "trigeminal"], ["vii", "7", "facial"], ["ix", "9", "glossopharyngeal"], ["x", "10", "vagus"]])
card("u2", "trigeminal-pain", "second-order", "Where is the second-order neuron for facial pain and temperature?", "Spinal nucleus of the trigeminal nerve", [["spinal"]])
card("u2", "trigeminal-pain", "extent", "The spinal trigeminal nucleus is largest at which level?", "Caudal medulla (a long column from pons to upper cervical cord)", [["caudal medulla", "medulla"]])
card("u2", "trigeminal-pain", "tract", "Which tract carries second-order facial pain fibers to the thalamus?", "Trigeminothalamic tract", [["trigeminothalamic", "trigemino"]])
card("u2", "trigeminal-pain", "third-order", "Which thalamic nucleus relays facial pain and temperature?", "VPM", [["vpm", "ventral posteromedial", "ventroposteromedial", "posteromedial"]])
card("u2", "trigeminal-pain", "vs-spinal", "Facial pain and temperature fibers run next to which body pathway in the brainstem?", "Anterolateral spinothalamic tract", [["anterolateral", "spinothalamic"]])
card("u2", "trigeminal-pain", "ipsi-contra", "A lesion of the right spinal trigeminal nucleus/tract in the lateral medulla causes loss of facial pain on which side?", "Right (ipsilateral): fibers cross after the nucleus", [["right", "ipsilateral", "same"]])
card("u2", "trigeminal-pain", "lesion-above", "A lesion of the right trigeminothalamic tract (after crossing) causes facial pain loss on which side?", "Left (contralateral)", [["left", "contralateral", "opposite"]])
card("u2", "jaw-jerk", "cell-body", "Where are the cell bodies of mesencephalic V neurons, unlike other primary sensory neurons?", "Inside the brainstem, in the mesencephalic nucleus (not in a ganglion)", [["mesencephalic", "midbrain", "inside"]])
card("u2", "jaw-jerk", "target", "Mesencephalic V axons synapse monosynaptically on which nucleus?", "Motor nucleus of trigeminal", [["motor"]])
card("u2", "jaw-jerk", "purpose", "What is the purpose of the mesencephalic nucleus?", "Jaw reflex: proprioception from muscles of mastication (prevents biting too hard)", [["jaw", "mastication", "bite", "biting"]])

pathway("lcst", "Lateral corticospinal tract", "u2", "Voluntary movement of distal limbs",
        [n(1, "layer V pyramidal neurons, primary motor cortex", "corona radiata, internal capsule, cerebral peduncle, longitudinal pontine fibers, pyramid, lateral corticospinal tract", "lateral ventral horn LMNs (limb), ipsilateral to the tract", "caudal medulla (pyramidal decussation)", True),
         n(2, "alpha motor neuron, lateral ventral horn", "ventral root, spinal nerve", "limb skeletal muscle", "C5-T1 arm; L2-S3 leg")],
        "Caudal medulla (pyramidal / motor decussation, ~80%)", {"below_decussation": "ipsilateral spastic weakness (cord lesion)", "above": "contralateral spastic weakness"}, ["lecture-10", "lab-10", "lecture-14"])
pathway("acst", "Anterior corticospinal tract", "u2", "Voluntary axial / proximal movement",
        [n(1, "layer V pyramidal neurons (trunk motor cortex)", "pyramid (uncrossed ~20%), anterior corticospinal tract", "bilateral medial ventral horn", "no medullary decussation"),
         n(2, "alpha motor neuron, medial ventral horn", "ventral root", "axial muscle", "cervical / upper thoracic")],
        "No decussation in the medulla; bilateral termination", {"below_decussation": "mild bilateral trunk effects", "above": "mild bilateral trunk effects"}, ["lecture-10", "lab-10"])
pathway("corticobulbar", "Corticobulbar (corticonuclear) pathway", "u2", "Voluntary movement of face, jaw, tongue, pharynx",
        [n(1, "layer V neurons, lateral motor cortex", "corona radiata, internal capsule genu, cerebral peduncle", "cranial motor nuclei (V, VII, ambiguus, XII)", "axons cross just above each nucleus", True),
         n(2, "cranial motor nucleus", "cranial nerve", "head/neck skeletal muscle", "pons and medulla")],
        "Just superior to each motor nucleus", {"below_decussation": "LMN lesion: ipsilateral paralysis", "above": "UMN lesion: contralateral effect"}, ["lecture-10", "lab-10", "lecture-12"])
pathway("corticopontocerebellar", "Corticopontocerebellar pathway", "u2", "Cortical motor plan to the cerebellum",
        [n(1, "layer V cortical neurons", "cerebral peduncle", "ipsilateral pontine nuclei", "ventral pons"),
         n(2, "pontine nuclei", "transverse pontine fibers, middle cerebellar peduncle", "contralateral cerebellar cortex", "pons", True)],
        "Pons (transverse pontine fibers)", {"below_decussation": "n/a", "above": "n/a"}, ["lecture-10", "lecture-14"])
card("u2", "lcst", "origin", "Where do lateral corticospinal tract neurons have their cell bodies?", "Layer V of primary motor cortex (and premotor/sensory areas)", [["layer v", "layer 5", "motor cortex", "precentral"]])
card("u2", "lcst", "path", "Name the white-matter route of corticospinal axons from cortex to medulla.", "Corona radiata, internal capsule, cerebral peduncle, longitudinal fibers of the pons, pyramid", [["corona radiata"], ["internal capsule"], ["peduncle"], ["pons", "pontine"], ["pyramid"]])
card("u2", "lcst", "capsule", "Through which part of the internal capsule do cortical efferents (corticospinal/corticobulbar) descend?", "Anterior limb and genu (per lecture 10)", [["genu", "anterior limb", "posterior limb", "limb"]], note="Lecture 10 says anterior limb and genu; many texts say genu and posterior limb. Owner to settle which to credit.")
card("u2", "lcst", "midbrain", "In which midbrain structure do cortical efferents travel?", "Cerebral peduncles (crus cerebri)", [["cerebral peduncle", "crus cerebri", "peduncle"]])
card("u2", "lcst", "pons", "In which pontine structure do corticospinal fibers travel?", "Longitudinal fibers of the pons", [["longitudinal"]])
card("u2", "lcst", "medulla", "In which medullary structure do corticospinal fibers travel?", "Pyramids", [["pyramid"]])
card("u2", "lcst", "decussation", "Where does the lateral corticospinal tract decussate?", "Caudal medulla: pyramidal (motor) decussation", [["pyramidal", "motor decussation", "decussation of the pyramids", "caudal medulla", "medulla"]], structure="motor-decussation")
card("u2", "lcst", "percent", "What percentage of corticospinal fibers cross to form the lateral corticospinal tract?", "About 80%", [["80", "85", "90"]])
card("u2", "lcst", "funiculus", "In which funiculus does the lateral corticospinal tract travel?", "Lateral funiculus (dorsolateral)", [["lateral"]], structure="lateral-funiculus")
card("u2", "lcst", "target", "Where does the lateral corticospinal tract terminate?", "Lateral ventral horn motor neuron pools for limb muscles, ipsilateral to the tract", [["lateral"], ["ventral horn", "anterior horn"]], structure="lateral-corticospinal-tract")
card("u2", "lcst", "function", "What movements does the lateral corticospinal tract control?", "Voluntary movement of distal limb muscles", [["distal", "limb", "hand", "finger"]])
card("u2", "lcst", "lesion-cord", "A lesion of the right lateral corticospinal tract in the cervical cord causes spastic weakness on which side?", "Right (ipsilateral): the tract has already crossed", [["right", "ipsilateral", "same"]])
card("u2", "lcst", "lesion-capsule", "A stroke in the right internal capsule produces weakness on which side of the body?", "Left (contralateral)", [["left", "contralateral", "opposite"]])
card("u2", "lcst", "lesion-pyramid", "A lesion of the left pyramid (above the decussation) causes weakness on which side?", "Right (contralateral)", [["right", "contralateral", "opposite"]])
card("u2", "lcst", "umn-signs", "Name signs of an upper motor neuron lesion in the corticospinal tract.", "Spasticity, hyperreflexia, Babinski sign, no atrophy", [["spastic", "hyperreflexia", "babinski"]])
card("u2", "acst", "origin", "Anterior corticospinal fibers arise from which fraction of pyramidal fibers?", "The ~20% that do not cross in the medulla", [["20", "uncrossed", "do not cross", "not cross"]])
card("u2", "acst", "funiculus", "In which funiculus does the anterior corticospinal tract travel?", "Anterior (ventral) funiculus", [["anterior", "ventral"]], structure="anterior-funiculus")
card("u2", "acst", "target", "Where does the anterior corticospinal tract terminate?", "Medial ventral horn motor pools of axial (trunk) muscles, bilaterally", [["medial"], ["bilateral", "both"]])
card("u2", "acst", "function", "What does the anterior corticospinal tract control?", "Voluntary axial (trunk) and proximal limb muscles, bilaterally", [["axial", "trunk", "proximal"]])
card("u2", "acst", "decussation", "True or false: the anterior corticospinal tract decussates in the medulla.", "False (it stays uncrossed and terminates bilaterally)", fmt="tf", accept=["false", "f"])
card("u2", "corticobulbar", "target", "Name the brainstem motor nuclei that receive corticobulbar input for voluntary head movement.", "Motor trigeminal, facial, nucleus ambiguus, hypoglossal", [["trigeminal"], ["facial"], ["ambiguus"], ["hypoglossal"]])
card("u2", "corticobulbar", "motor-v", "Which cranial motor nucleus controls the muscles of mastication?", "Motor nucleus of the trigeminal nerve (CN V)", [["trigeminal", "v"]])
card("u2", "corticobulbar", "fiber-bundle", "Which fiber bundle conveys voluntary motor signals from cortex to the facial nucleus?", "Corticobulbar (and corticopontine) fibers", [["corticobulbar"]])
card("u2", "corticobulbar", "fiber-bundle-xi", "Which fiber bundle conveys voluntary signals from cortex to the spinal accessory nucleus (shrugging)?", "Corticospinal", [["corticospinal"]])
card("u2", "corticobulbar", "midline", "Where do corticobulbar axons cross relative to their target motor nucleus (as drawn in lab 10)?", "Just superior to the motor nucleus", [["superior", "above", "just above"]])
card("u2", "corticobulbar", "ambiguus", "Which nucleus controls muscles of speech and swallowing (CN IX, X)?", "Nucleus ambiguus", [["ambiguus"]])
card("u2", "corticobulbar", "hypoglossal", "Which motor nucleus controls the tongue muscles?", "Hypoglossal nucleus (CN XII)", [["hypoglossal", "xii", "12"]])
card("u2", "corticobulbar", "lmn-lesion-vii", "A lesion of the right facial nucleus/nerve paralyses which part of the face?", "The entire right half of the face (ipsilateral, upper and lower)", [["right", "ipsilateral"], ["entire", "whole", "upper and lower", "complete"]])
card("u2", "corticopontocerebellar", "synapse", "Where do corticopontine fibers synapse?", "Ipsilateral pontine nuclei in the ventral (basilar) pons", [["pontine nuclei", "pons"]], structure="pontine-protuberance")
card("u2", "corticopontocerebellar", "tract", "Pontine nuclei axons cross and enter the cerebellum via which peduncle?", "Middle cerebellar peduncle (transverse pontine fibers)", [["middle", "mcp"]])
card("u2", "corticopontocerebellar", "side", "Corticopontocerebellar information reaches which cerebellar hemisphere relative to the cortex?", "Contralateral", [["contralateral", "opposite"]])
card("u2", "corticopontocerebellar", "percent", "About what fraction of cortical efferent fibers at the midbrain are corticopontine?", "About 50%", [["50", "half"]])

for slug, name, orig, fn, dec in [
        ("rubrospinal", "Rubrospinal tract", "red nucleus (rostral midbrain)", "flexion of the contralateral upper limb", "ventral tegmental decussation (crosses in midbrain)"),
        ("tectospinal", "Tectospinal tract", "superior and inferior colliculi (tectum)", "turning head toward visual and auditory stimuli", "dorsal tegmental decussation (crosses in midbrain)"),
        ("reticulospinal", "Reticulospinal tracts", "pontine and medullary reticular formation", "posture, stepping; pontine facilitates extensors, medullary inhibits", "mostly ipsilateral"),
        ("vestibulospinal", "Vestibulospinal tract", "vestibular nuclei (medulla)", "posture and balance, righting reflexes", "mostly ipsilateral")]:
    pathway(slug, name, "u2", "Brainstem UMN pathway: " + fn, [n(1, orig, slug, "lower motor neurons in the ventral horn", "brainstem to spinal cord", "crosses" in dec)],
            dec, {"below_decussation": "UMN effects", "above": "decorticate/decerebrate posturing"}, ["lecture-10", "lab-10"])
card("u2", "rubrospinal", "origin", "Where do rubrospinal neurons originate?", "Red nucleus (rostral midbrain)", [["red nucleus"]], structure="red-nucleus")
card("u2", "rubrospinal", "function", "What movement does the rubrospinal tract promote?", "Flexion of the contralateral upper limb", [["flexion", "flex"], ["upper limb", "arm"]])
card("u2", "rubrospinal", "funiculus", "In which funiculus does the rubrospinal tract descend?", "Lateral funiculus (next to the lateral corticospinal tract)", [["lateral"]])
card("u2", "rubrospinal", "input", "The red nucleus receives input from which structures of the cerebellum?", "Contralateral deep cerebellar nuclei via the superior cerebellar peduncle", [["superior cerebellar", "scp", "deep", "interposed", "dentate"]])
card("u2", "rubrospinal", "decorticate", "Posturing with flexed arms (lesion above the red nucleus) is called what?", "Decorticate posture", [["decorticate"]])
card("u2", "rubrospinal", "decerebrate", "Posturing with extended arms (lesion below the red nucleus) is called what?", "Decerebrate posture", [["decerebrate"]])
card("u2", "tectospinal", "origin", "Where do tectospinal fibers arise?", "Superior and inferior colliculi (tectum of the midbrain)", [["colliculi", "colliculus", "tectum"]])
card("u2", "tectospinal", "function", "What does the tectospinal tract do?", "Turns the head and neck toward visual and auditory stimuli", [["head", "neck"]])
card("u2", "tectospinal", "level", "Tectospinal axons synapse on lower motor neurons at which spinal levels?", "Cervical and upper thoracic", [["cervical"]])
card("u2", "reticulospinal", "origin", "Where do reticulospinal fibers originate?", "Pontine and medullary reticular formation", [["reticular formation", "pontine", "medullary"]])
card("u2", "reticulospinal", "pontine", "Which reticulospinal tract facilitates extensor muscles?", "Pontine reticulospinal tract", [["pontine"]])
card("u2", "reticulospinal", "medullary", "Which reticulospinal tract inhibits extensors and facilitates flexion?", "Medullary reticulospinal tract", [["medullary"]])
card("u2", "vestibulospinal", "origin", "Where does the vestibulospinal tract originate?", "Vestibular nuclei (medulla)", [["vestibular"]])
card("u2", "vestibulospinal", "function", "What is the function of the vestibulospinal tract?", "Maintains head and body posture and balance (righting)", [["posture", "balance", "righting"]])
card("u2", "vestibulospinal", "target", "The vestibulospinal tract synapses on lower motor neurons of which muscles?", "Axial muscles (trunk, proximal), ventral horn", [["axial", "trunk", "proximal"]])
card("u2", "extrapyramidal", "anterior-tracts", "Which brainstem descending tracts innervate axial muscles (anterior funiculus)?", "Vestibulospinal, reticulospinal, tectospinal", [["vestibulospinal"], ["reticulospinal"], ["tectospinal"]], srcref="lecture-10")
card("u2", "extrapyramidal", "lateral-tracts", "Which descending tracts innervate limb muscles (lateral funiculus)?", "Lateral corticospinal and rubrospinal", [["lateral corticospinal"], ["rubrospinal"]], srcref="lecture-10")
card("u2", "extrapyramidal", "only-cortical", "Which descending tracts arise from the cortex?", "Corticospinal (lateral/anterior) and corticobulbar; the rest arise in the brainstem", [["corticospinal"], ["corticobulbar"]], srcref="lecture-10")
card("u2", "extrapyramidal", "what-is", "What does 'extrapyramidal' mean?", "All descending motor tracts that are not corticospinal (outside the pyramids)", [["not", "other", "outside", "brainstem", "non-corticospinal"]], srcref="lecture-10")

pathway("visual", "Visual pathway", "u2", "Vision",
        [n(1, "photoreceptors to bipolar cells (retina)", "retina", "retinal ganglion cells", "retina"),
         n(2, "retinal ganglion cell", "optic nerve, optic chiasm (nasal fibers cross), optic tract", "lateral geniculate nucleus", "optic chiasm", True),
         n(3, "lateral geniculate nucleus", "optic radiations", "primary visual cortex (calcarine, BA 17)", "occipital lobe")],
        "Optic chiasm (nasal hemiretina fibers cross)", {"below_decussation": "monocular blindness (optic nerve)", "above": "contralateral homonymous field loss"}, ["lecture-11", "lab-11"])
pathway("pupillary", "Pupillary light reflex", "u2", "Pupil constriction",
        [n(1, "retinal ganglion cell", "CN II to pretectal nucleus, bilateral to Edinger-Westphal nuclei", "CN III parasympathetic, ciliary ganglion, sphincter pupillae", "midbrain", True)],
        "Posterior commissure", {"below_decussation": "afferent defect", "above": "efferent defect"}, ["lecture-11", "lecture-12"])
pathway("corneal", "Corneal blink reflex", "u2", "Blink to corneal touch",
        [n(1, "trigeminal ganglion (V1)", "CN V", "spinal trigeminal nucleus then bilateral facial nuclei", "pons", True)],
        "Pons (bilateral facial nucleus input)", {"below_decussation": "afferent CN V lesion: no blink either eye", "above": "efferent CN VII lesion: no blink on that side"}, ["lecture-12"])
pathway("gaze", "Horizontal conjugate gaze", "u2", "Same-side gaze",
        [n(1, "frontal eye field (BA 8)", "to contralateral PPRF", "abducens nucleus, then MLF to contralateral oculomotor nucleus", "pons", True)],
        "FEF fibers cross to the contralateral PPRF", {"below_decussation": "MLF lesion: internuclear ophthalmoplegia", "above": "FEF lesion: eyes deviate to the lesion side"}, ["lecture-11", "lab-11"])
card("u2", "visual", "receptor", "Which retinal cells are the photoreceptors?", "Rods and cones", [["rod"], ["cone"]])
card("u2", "visual", "first-order", "In lecture 11's scheme, which retinal neurons are first-order and which second-order?", "Bipolar cells first-order; retinal ganglion cells second-order", [["bipolar"], ["ganglion"]], note="Lecture 11 labels bipolar cells first-order and ganglion cells second-order; photoreceptors are the receptors. Confirm convention.")
card("u2", "visual", "ganglion", "Retinal ganglion cell axons form which structure?", "Optic nerve (CN II)", [["optic nerve", "cn ii", "ii"]])
card("u2", "visual", "decussation", "Which retinal fibers cross in the optic chiasm?", "Nasal (medial) hemiretina fibers; temporal fibers do not cross", [["nasal"]])
card("u2", "visual", "chiasm-field", "Fibers crossing in the optic chiasm carry which part of each eye's visual field?", "Temporal (peripheral) visual field", [["temporal"]])
card("u2", "visual", "order", "List the visual pathway from eye to cortex.", "Optic nerve, optic chiasm, optic tract, lateral geniculate nucleus, optic radiations, primary visual cortex", [["optic nerve"], ["chiasm"], ["optic tract"], ["lateral geniculate", "lgn"], ["radiation"], ["primary visual", "calcarine", "striate", "v1"]])
card("u2", "visual", "thalamic", "Which thalamic nucleus relays vision to cortex?", "Lateral geniculate nucleus (LGN)", [["lateral geniculate", "lgn"]])
card("u2", "visual", "cortex", "Where do optic radiations terminate?", "Primary visual cortex (calcarine sulcus, BA 17)", [["primary visual", "calcarine", "17", "v1", "striate"]])
card("u2", "visual", "superior-field", "The upper visual field is represented in which part of primary visual cortex?", "Inferior bank (below the calcarine sulcus)", [["inferior", "below", "lingual"]])
card("u2", "visual", "other-targets", "Name the three main destinations of retinal ganglion cell axons.", "Hypothalamus (suprachiasmatic nucleus), lateral geniculate nucleus, midbrain (superior colliculus/pretectal nucleus)", [["suprachiasmatic", "hypothalam"], ["lateral geniculate", "lgn", "thalamus"], ["superior colliculus", "pretectal", "midbrain"]])
card("u2", "visual", "scn", "Which retinal projection modulates circadian rhythms?", "Retinohypothalamic projection to the suprachiasmatic nucleus", [["suprachiasmatic", "scn"]], structure="suprachiasmatic-nucleus")
card("u2", "visual", "lesion-nerve", "A lesion of the left optic nerve causes what deficit?", "Blindness in the left eye (monocular)", [["left"], ["blind", "monocular", "loss"]])
card("u2", "visual", "lesion-chiasm", "A lesion of the optic chiasm (e.g. pituitary tumor) causes what field defect?", "Bitemporal hemianopia (loss of peripheral vision in both eyes)", [["bitemporal", "tunnel", "peripheral"]])
card("u2", "visual", "lesion-tract", "A lesion of the right optic tract causes what field defect?", "Left homonymous hemianopia", [["left"], ["homonymous", "hemianop"]])
card("u2", "visual", "lesion-radiation", "Damage to the left inferior visual cortex causes what deficit?", "Right upper homonymous quadrantanopia", [["right"], ["upper", "superior"], ["quadrant"]])
card("u2", "visual", "lesion-cortex", "A left primary visual cortex lesion causes what deficit?", "Right homonymous hemianopia (macular sparing possible)", [["right"], ["homonymous", "hemianop"]])
card("u2", "visual", "what-where", "Which cortical stream identifies objects (the 'what' pathway) and where does it project?", "Ventral stream to the inferior temporal lobe", [["ventral"], ["temporal"]])
card("u2", "visual", "where", "Which stream processes spatial vision and visually guided movement?", "Dorsal ('where') stream to the parietal lobe", [["dorsal"], ["parietal"]])
card("u2", "pupillary", "afferent", "Which cranial nerve is the afferent limb of the pupillary light reflex?", "CN II (optic nerve)", [["ii", "2", "optic"]])
card("u2", "pupillary", "efferent", "Which cranial nerve and nucleus form the efferent limb of the pupillary light reflex?", "CN III from the Edinger-Westphal nucleus (parasympathetic)", [["iii", "3", "oculomotor"], ["edinger", "ew"]])
card("u2", "pupillary", "consensual", "Light in one eye causes constriction of which pupils?", "Both pupils (direct and consensual)", [["both"]])
card("u2", "pupillary", "pretectal", "Which midbrain area receives the optic input for the pupillary light reflex?", "Pretectal nucleus (near the superior colliculus)", [["pretectal", "pre-tectal"]])
card("u2", "corneal", "afferent", "Which nerve is the afferent limb of the corneal blink reflex?", "CN V (ophthalmic division)", [["v", "5", "trigeminal"]])
card("u2", "corneal", "efferent", "Which nerve and nucleus form the efferent limb of the corneal reflex?", "CN VII, facial nucleus", [["vii", "7", "facial"]])
card("u2", "corneal", "consensual", "Touching the left cornea closes which eyelids?", "Both (ipsilateral and contralateral)", [["both"]])
card("u2", "corneal", "nuclei", "Name the brainstem structures involved in the corneal blink reflex.", "CN V, spinal trigeminal nucleus, facial nucleus (CN VII)", [["spinal trigeminal", "spinal nucleus"], ["facial"]])
card("u2", "gaze", "fef", "Which cortical area drives voluntary horizontal saccades?", "Frontal eye field (BA 8)", [["frontal eye", "fef", "8"]])
card("u2", "gaze", "pprf", "Right frontal eye field activation drives the eyes to which side, via which brainstem center?", "To the left, via the left PPRF (paramedian pontine reticular formation)", [["left"], ["pprf", "paramedian pontine"]], structure="paramedian-pontine-reticular-formation")
card("u2", "gaze", "pprf-action", "The PPRF activates which muscles for same-side gaze?", "Ipsilateral lateral rectus (abducens) and contralateral medial rectus (via MLF)", [["lateral rectus", "abducens"], ["medial rectus", "oculomotor"]])
card("u2", "gaze", "mlf", "Which tract connects CN III, IV and VI nuclei for conjugate gaze?", "Medial longitudinal fasciculus (MLF)", [["mlf", "medial longitudinal"]])
card("u2", "gaze", "mlf-lesion", "A left MLF lesion in a patient asked to look right causes what finding?", "Left eye cannot adduct (medial rectus), right eye abducts; convergence intact", [["left"], ["adduct", "medial rectus"]])
card("u2", "gaze", "vor", "In the vestibulo-ocular reflex, turning the head right turns the eyes which way?", "To the left (opposite)", [["left", "opposite"]])
card("u2", "gaze", "sc", "Which midbrain structure mediates involuntary (reflexive) saccades?", "Superior colliculus", [["superior colliculus"]])
card("u2", "cochlear", "path", "Trace the auditory pathway from cochlear nerve to cortex.", "Cochlear nerve, cochlear nuclei (rostral medulla), inferior colliculus, medial geniculate nucleus, primary auditory cortex", [["cochlear nuclei", "cochlear nucleus"], ["inferior colliculus"], ["medial geniculate", "mgn"], ["auditory cortex", "primary auditory"]], srcref="lecture-8")
card("u2", "cochlear", "first-order", "Where are the cell bodies of the cochlear nerve?", "Spiral ganglion", [["spiral ganglion"]], srcref="lecture-8")
card("u2", "cochlear", "vestibular", "Where do vestibular nerve fibers synapse in the brainstem?", "Vestibular nuclei (and directly into the cerebellum)", [["vestibular nuclei", "vestibular nucleus", "vestibular"]], srcref="lecture-8")

# ============================== UNIT 3
pathway("cerebellar", "Cerebellar circuit (motor comparator)", "u3", "Compares intended and actual movement",
        [n(1, "mossy: pontine nuclei (contra, MCP), DSCT (ipsi, ICP), vestibular (ipsi); climbing: inferior olive (contra, ICP)", "mossy / climbing fibers", "granule then Purkinje cells", "cerebellar cortex"),
         n(2, "Purkinje cell (inhibitory)", "corticonuclear", "deep cerebellar nuclei", "cerebellum"),
         n(3, "deep cerebellar nuclei (excitatory)", "superior cerebellar peduncle", "contralateral red nucleus and VA/VL thalamus", "caudal midbrain", True)],
        "Caudal midbrain (decussation of the superior cerebellar peduncle)", {"below_decussation": "ipsilateral ataxia", "above": "contralateral ataxia"}, ["lecture-14", "lab-10"])
card("u3", "cerebellar", "plan", "Which peduncle carries the cortical motor plan to the cerebellum?", "Middle cerebellar peduncle", [["middle", "mcp"]])
card("u3", "cerebellar", "reality", "Which peduncle carries proprioceptive and olivary feedback into the cerebellum?", "Inferior cerebellar peduncle", [["inferior", "icp"]])
card("u3", "cerebellar", "output", "Which peduncle carries the major cerebellar output?", "Superior cerebellar peduncle", [["superior", "scp"]])
card("u3", "cerebellar", "input-olive", "Which structure gives rise to climbing fibers, and from which side?", "Contralateral inferior olivary nucleus (via ICP)", [["inferior olive", "olivary"], ["contralateral"]])
card("u3", "cerebellar", "input-dsct", "The dorsal spinocerebellar tract enters the cerebellum from which side and through which peduncle?", "Ipsilateral, inferior cerebellar peduncle", [["ipsilateral"], ["inferior", "icp"]])
card("u3", "cerebellar", "input-vest", "Vestibular input reaches the cerebellum from which side and through which peduncles?", "Ipsilateral, via ICP and MCP", [["ipsilateral"], ["inferior", "icp", "middle", "mcp"]])
card("u3", "cerebellar", "mossy", "Mossy fibers synapse on which cell type in the cerebellar cortex?", "Granule cells (parallel fibers excite Purkinje cells)", [["granule"]])
card("u3", "cerebellar", "climbing", "Climbing fibers synapse directly on which cell?", "Purkinje cell", [["purkinje"]])
card("u3", "cerebellar", "purkinje-output", "Is Purkinje cell output excitatory or inhibitory?", "Inhibitory to the deep cerebellar nuclei", [["inhibit"]])
card("u3", "cerebellar", "deep-output", "Is the output of the deep cerebellar nuclei excitatory or inhibitory?", "Excitatory", [["excit"]])
card("u3", "cerebellar", "decussation", "Where does the cerebellar output pathway decussate?", "Decussation of the SCP in the caudal midbrain (inferior colliculus level)", [["caudal midbrain", "inferior colliculus", "midbrain"]])
card("u3", "cerebellar", "targets", "Cerebellar output via the SCP goes to which contralateral targets?", "Red nucleus and VA/VL thalamus (then motor cortex)", [["red nucleus"], ["thalamus", "va", "vl"]])
card("u3", "cerebellar", "dentate", "Which deep nucleus belongs to the lateral hemisphere (pontocerebellum)?", "Dentate nucleus", [["dentate"]])
card("u3", "cerebellar", "fastigial", "Which deep nucleus serves the vermis (trunk, posture)?", "Fastigial nucleus", [["fastigial"]])
card("u3", "cerebellar", "interposed", "Which deep nucleus serves the paravermis (distal limbs)?", "Interposed nucleus (emboliform and globose)", [["interposed", "emboliform", "globose"]])
card("u3", "cerebellar", "flocculonodular", "The flocculonodular lobe projects to which structures?", "Vestibular nuclei (balance, eye movements)", [["vestibular"]])
card("u3", "cerebellar", "lesion-side", "A lesion of the right cerebellar hemisphere causes ataxia on which side?", "Right (ipsilateral)", [["right", "ipsilateral", "same"]])

pathway("basal-ganglia", "Basal ganglia motor loop", "u3", "Motor selection",
        [n(1, "cortex", "corticostriate", "striatum (caudate + putamen)", "forebrain"),
         n(2, "striatum", "striatopallidal (direct to GPi; indirect via GPe and STN)", "GPi", "forebrain"),
         n(3, "GPi (inhibitory)", "pallidothalamic", "VA/VL thalamus then cortex", "thalamus")],
        "None", {"below_decussation": "n/a", "above": "hyperkinesia (STN/striatum loss) or hypokinesia (nigral loss)"}, ["lecture-14"])
card("u3", "basal-ganglia", "input", "Which structure is the main input nucleus of the basal ganglia?", "Striatum (caudate + putamen)", [["striatum", "caudate", "putamen"]], structure="corpus-striatum")
card("u3", "basal-ganglia", "striatum", "Which two nuclei make up the dorsal striatum?", "Caudate nucleus and putamen", [["caudate"], ["putamen"]])
card("u3", "basal-ganglia", "lentiform", "Which two nuclei together form the lentiform nucleus?", "Putamen and globus pallidus", [["putamen"], ["globus pallidus", "pallidus"]], structure="lentiform-nucleus")
card("u3", "basal-ganglia", "ventral", "Which structures make up the ventral striatum?", "Nucleus accumbens and olfactory tubercle", [["accumbens"], ["olfactory tubercle"]])
card("u3", "basal-ganglia", "output", "Which nucleus is the primary output of the basal ganglia?", "Globus pallidus internus (GPi)", [["gpi", "globus pallidus internus", "internal"]])
card("u3", "basal-ganglia", "gpi-effect", "Is GPi output to the thalamus excitatory or inhibitory?", "Inhibitory", [["inhibit"]])
card("u3", "basal-ganglia", "thalamus", "Which thalamic nuclei relay basal ganglia output to motor cortex?", "VA/VL", [["va", "vl", "ventral anterior", "ventral lateral"]])
card("u3", "basal-ganglia", "direct", "In the direct 'go' pathway, what does the striatum do to GPi, and what is the net effect on cortex?", "Inhibits GPi, disinhibiting thalamus: excites cortex, promotes movement", [["inhibit"], ["excit", "facilitat", "promot", "movement"]])
card("u3", "basal-ganglia", "indirect", "In the indirect 'no-go' pathway, the striatum inhibits which nucleus, and what follows?", "GPe is inhibited, so STN is disinhibited, more GPi drive, less movement", [["gpe", "globus pallidus externus"], ["stn", "subthalamic"]])
card("u3", "basal-ganglia", "stn", "Is the subthalamic nucleus excitatory or inhibitory, and what is its net effect?", "Excitatory (to GPi); dampens movement", [["excit"], ["dampen", "decrease", "reduce", "no-go", "less"]])
card("u3", "basal-ganglia", "da-d1", "Dopamine acting on D1 receptors does what to the direct pathway?", "Excites (enhances) the direct 'go' pathway", [["excit", "enhanc", "facilitat"]])
card("u3", "basal-ganglia", "da-d2", "Dopamine acting on D2 receptors does what to the indirect pathway?", "Inhibits the indirect 'no-go' pathway", [["inhibit"]])
card("u3", "basal-ganglia", "sn-source", "Which nucleus supplies dopamine to the striatum?", "Substantia nigra pars compacta", [["substantia nigra", "snc", "pars compacta"]])
card("u3", "basal-ganglia", "parkinson", "Parkinson's disease follows loss of which neurons, and does it cause too much or too little movement?", "Dopaminergic substantia nigra neurons; hypokinesia / bradykinesia", [["substantia nigra", "nigra", "dopamin"], ["hypokines", "bradykines", "too little", "slow"]])
card("u3", "basal-ganglia", "huntington", "Huntington's disease involves degeneration of which structure and causes which movement?", "Striatum; chorea (hyperkinesia)", [["striatum", "caudate"], ["chorea", "hyperkines"]])
card("u3", "basal-ganglia", "ballismus", "Dysfunction of which nucleus causes ballismus?", "Subthalamic nucleus", [["subthalamic", "stn"]])

pathway("olfactory", "Olfactory pathway", "u3", "Smell",
        [n(1, "olfactory receptor neuron (bipolar, olfactory epithelium)", "CN I through the cribriform plate", "olfactory bulb (mitral cells)", "anterior cranial fossa"),
         n(2, "mitral cell, olfactory bulb", "olfactory tract", "olfactory tubercle, prepiriform cortex, amygdala; MD thalamus to orbitofrontal cortex", "base of frontal lobe")],
        "None in the main pathway (bypasses the thalamus)", {"below_decussation": "ipsilateral anosmia", "above": "n/a"}, ["lecture-15"])
card("u3", "olfactory", "first-order", "Where is the olfactory first-order neuron, and what is its shape?", "Olfactory epithelium; bipolar neuron", [["epithelium", "nasal"], ["bipolar"]])
card("u3", "olfactory", "bone", "Olfactory axons reach the olfactory bulb through which bone?", "Cribriform plate of the ethmoid", [["cribriform"]])
card("u3", "olfactory", "second-order", "Where are the second-order olfactory neurons?", "Olfactory bulb (mitral cells)", [["olfactory bulb", "bulb"]])
card("u3", "olfactory", "tract", "Which tract carries olfactory bulb output?", "Olfactory tract", [["olfactory tract"]])
card("u3", "olfactory", "cortex", "Name the primary olfactory cortical targets.", "Olfactory tubercle, prepiriform (piriform) cortex, amygdala", [["tubercle", "piriform", "prepiriform", "amygdala"]])
card("u3", "olfactory", "thalamus", "Is a thalamic relay required for olfaction to reach cortex?", "No: olfaction bypasses the thalamus (MD thalamus relays secondarily to orbitofrontal cortex)", [["no", "bypass"]])
card("u3", "olfactory", "orbitofrontal", "Through which thalamic nucleus does smell reach the orbitofrontal cortex?", "Mediodorsal (MD) nucleus", [["mediodorsal", "medial dorsal", "md"]])
card("u3", "olfactory", "special", "What is unusual about olfactory receptors compared with other special senses?", "They are neurons themselves and are replaced throughout life (~60 days)", [["neuron"], ["replace", "renew", "regenerat", "60"]])
card("u3", "olfactory", "lesion", "A fracture of the cribriform plate most likely causes loss of which sense?", "Smell (anosmia)", [["smell", "anosmia", "olfact"]])

pathway("limbic-fornix", "Hippocampal - fornix circuit", "u3", "Memory consolidation", [n(1, "hippocampus", "fornix (crus, body, column)", "mammillary bodies, septal nuclei, basal forebrain", "forebrain")], "None", {"below_decussation": "n/a", "above": "anterograde amnesia"}, ["lecture-15"])
pathway("limbic-amygdala", "Amygdala efferent pathway", "u3", "Fear, aggression, autonomic output", [n(1, "central nucleus of amygdala", "stria terminalis", "BNST, hypothalamus, brainstem autonomic nuclei", "forebrain")], "None", {"below_decussation": "n/a", "above": "blunted fear"}, ["lecture-15"])
pathway("limbic-septal", "Septal - habenular pathway", "u3", "Reward and aversion", [n(1, "septal nuclei", "stria medullaris thalami", "habenula", "forebrain / epithalamus")], "None", {"below_decussation": "n/a", "above": "n/a"}, ["lecture-15"])
pathway("reward", "Mesolimbic reward pathway", "u3", "Pleasure and reinforcement", [n(1, "ventral tegmental area (dopaminergic)", "medial forebrain bundle", "nucleus accumbens, prefrontal cortex", "midbrain to forebrain")], "None", {"below_decussation": "n/a", "above": "n/a"}, ["lecture-15"])
card("u3", "limbic-fornix", "tract", "Which tract connects the hippocampus with the mammillary bodies and basal forebrain?", "Fornix", [["fornix"]])
card("u3", "limbic-fornix", "parts", "Name the parts of the fornix from the hippocampus onward.", "Crus, body, column", [["crus"], ["body"], ["column"]])
card("u3", "limbic-fornix", "mammillary", "Which hypothalamic structures receive fornix fibers and are involved in spatial memory?", "Mammillary bodies", [["mammillary"]])
card("u3", "limbic-fornix", "function", "The hippocampal formation is critical for which memory process?", "Consolidation (formation) of explicit/declarative long-term memory, not retrieval", [["consolidat", "form", "encod"]])
card("u3", "limbic-fornix", "cholinergic", "Cholinergic input from the basal forebrain reaches the hippocampus via which tract?", "Fornix (septohippocampal pathway)", [["fornix"]])
card("u3", "limbic-amygdala", "tract", "Which tract is the main efferent bundle from the central nucleus of the amygdala?", "Stria terminalis", [["stria terminalis"]])
card("u3", "limbic-amygdala", "bnst", "What does BNST stand for?", "Bed nucleus of the stria terminalis", [["bed nucleus"]])
card("u3", "limbic-amygdala", "targets", "Name the amygdala's main efferent targets for autonomic and endocrine output.", "Hypothalamus (and pituitary regulation), brainstem autonomic nuclei such as the dorsal motor nucleus of vagus", [["hypothalam"], ["autonomic", "vagus", "brainstem"]])
card("u3", "limbic-septal", "tract", "Which tract links the septal nuclei with the habenula?", "Stria medullaris thalami", [["stria medullaris"]], structure="stria-medullaris-thalami")
card("u3", "limbic-septal", "habenula", "The habenula belongs to which diencephalic division?", "Epithalamus", [["epithalamus"]])
card("u3", "reward", "origin", "Where do the dopaminergic neurons of the reward pathway originate?", "Ventral tegmental area (VTA) of the midbrain", [["ventral tegmental", "vta"]])
card("u3", "reward", "target", "Which basal forebrain structure is the key target of the mesolimbic reward pathway?", "Nucleus accumbens", [["accumbens"]])
card("u3", "reward", "bundle", "Through which bundle do dopaminergic, serotonergic and noradrenergic fibers reach the forebrain?", "Medial forebrain bundle", [["medial forebrain"]])

# fill missing source refs for groups without a pathway entry
for g, s in {"extrapyramidal": ["lecture-10"], "cochlear": ["lecture-8"]}.items():
    D.src(g, *s)
D.dump("pathways")
with open(os.path.join(C, "pathways.json"), "w", encoding="utf8") as f:
    json.dump(PW, f, indent=1, ensure_ascii=False)
print(len(PW), "pathways")
