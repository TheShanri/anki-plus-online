"""Round 2 edits to src/data/pathway-map.json: slide-depth additions (basal ganglia direct / indirect, visual SC and SCN
branches, rubrospinal crossing, vestibulospinal label) and the five new course pathways (cochlear, vestibular, solitary,
stretch reflex, withdrawal reflex). Idempotent. Run from the repo root: python tools/pathways/patch_map_round2.py"""
import json

P = "src/data/pathway-map.json"
d = json.load(open(P, encoding="utf8"))
pw = d["pathways"]


def st(k, label, phys, path, ids=None, marks=None, **kw):
    s = {"k": k, "label": label, "phys": phys, "path": path}
    if ids:
        s["ids"] = ids
    if marks:
        s["marks"] = marks
    s.update(kw)
    return s


def mark(p, kind, text):
    return {"p": p, "kind": kind, "text": text}


# ---- basal ganglia: direct "go", indirect "no-go", dopamine from the substantia nigra (slides: STN, D1 / D2) ----
bg = pw["basal-ganglia"]["neurons"][1]
bg["stretches"] = [
    st("direct", "Direct 'go' pathway: striatum inhibits the GPi, which disinhibits VA/VL thalamus and so excites the cortex", "c",
       [["putamen", "c", 0.5], ["globus-pallidus", "c", 0.5, -0.004]], ["globus-pallidus"],
       [mark(["globus-pallidus", "c", 0.5, -0.004], "syn", "GPi (output)")]),
    st("indirect", "Indirect 'no-go' pathway: striatum inhibits the GPe, which disinhibits the STN; the STN excites the GPi", "c",
       [["putamen", "c", 0.5], ["globus-pallidus", "c", 0.5, 0.005], ["mni-subthalamic-nucleus", "c", 0.5], ["globus-pallidus", "c", 0.5, -0.004]],
       ["mni-subthalamic-nucleus"], [mark(["mni-subthalamic-nucleus", "c", 0.5], "syn", "Subthalamic nucleus (STN)")]),
    st("snc", "Substantia nigra pars compacta: dopamine to the striatum (D1 excites the direct pathway, D2 inhibits the indirect)", "c",
       [["mni-substantia-nigra", "c", 0.5], ["putamen", "c", 0.5, 0, -0.004]], ["mni-substantia-nigra"],
       [mark(["mni-substantia-nigra", "c", 0.5], "soma", "Substantia nigra (dopamine: D1 / D2)")]),
]
bg["syn"] = "Globus pallidus internus (GPi), directly or via the GPe and the subthalamic nucleus"
pw["basal-ganglia"]["region"] = "movement"

# ---- visual: branches to the superior colliculus and the suprachiasmatic nucleus (no impulse, drawn in the field colour) ----
vis = pw["visual"]["neurons"][1]
if not any(s["k"] == "sc" for s in vis["stretches"]):
    vis["stretches"] += [
        st("sc", "Branch of the optic tract to the superior colliculus (reflex eye and head movements)", "c",
           [["optic-tract", "c", 0.5, 0, 0, 0, "z"], ["superior-colliculus", "c", 0.5]], ["superior-colliculus"], noLesion=True),
        st("scn", "Branch of the optic chiasm to the suprachiasmatic nucleus of the hypothalamus", "c",
           [["optic-chiasm", "m", 0.5], ["hypothalamus", "c", 0.5, 0, 0.004, 0]], None, noLesion=True),
    ]

# ---- rubrospinal: crossing wording ----
for s in pw["rubrospinal"]["neurons"][0]["stretches"]:
    if s["k"] == "rn":
        s["label"] = "Red nucleus (rostral midbrain tegmentum); the axons cross to the contralateral side"
        for m in s.get("marks", []):
            if m["kind"] == "dec":
                m["text"] = "Crosses (contralateral upper limb)"

# ---- dorsal column somatotopy ----
for s in pw["dcml"]["neurons"][0]["stretches"]:
    if s["k"] == "dc":
        s["label"] = "Fasciculus gracilis (legs, medial) / cuneatus (arms, lateral) in the dorsal funiculus"

# ---- vestibulospinal label ----
for s in pw["vestibulospinal"]["neurons"][0]["stretches"]:
    if s["k"] == "vn":
        s["label"] = "Vestibular nuclei (medulla), then the vestibulospinal tract"

# ---- new pathways ----
SP = ["spinal-ganglion", "i", 0.4, -0.003]
pw["cochlear"] = {
    "loss": "hearing", "region": "hearing", "quality": "partial",
    "neurons": [
        {"short": "Spiral ganglion (cochlear nerve, CN VIII)", "syn": "Cochlear nuclei, rostral medulla", "synKeys": ["cochlear nucle"],
         "stretches": [st("nerve", "Cochlear nerve (CN VIII) to the cochlear nuclei", "i",
                          [["cochlear-nerve", "i", 0.1], ["cochlear-nerve", "i", 0.9], ["anterior-cochlear-nucleus", "i", 0.5]],
                          ["cochlear-nerve"], [mark(["cochlear-nerve", "i", 0.1], "soma", "Spiral ganglion (CN VIII)")], noLesion=True)]},
        {"short": "Cochlear nuclei", "syn": "Inferior colliculus", "synKeys": ["inferior colliculus", "colliculus"],
         "stretches": [st("cn", "Cochlear nuclei, relaying up the brainstem to the inferior colliculus", "i",
                          [["anterior-cochlear-nucleus", "i", 0.5], ["inferior-colliculus", "i", 0.5]],
                          ["anterior-cochlear-nucleus", "posterior-cochlear-nucleus"],
                          [mark(["anterior-cochlear-nucleus", "i", 0.5], "soma", "Cochlear nuclei"), mark(["inferior-colliculus", "i", 0.5], "syn", "Inferior colliculus (auditory reflexes)")], noLesion=True)]},
        {"short": "Inferior colliculus", "syn": "Medial geniculate nucleus of the thalamus", "synKeys": ["medial geniculate", "geniculate", "mgn"],
         "stretches": [st("ic", "Inferior colliculus to the medial geniculate nucleus", "i",
                          [["inferior-colliculus", "i", 0.5], ["medial-geniculate-body", "i", 0.5]], ["inferior-colliculus"],
                          [mark(["medial-geniculate-body", "i", 0.5], "syn", "Medial geniculate nucleus")], noLesion=True)]},
        {"short": "Medial geniculate nucleus", "syn": "Primary auditory cortex (BA 41, 42)", "synKeys": ["auditory", "transverse temporal", "heschl", "41"],
         "stretches": [st("mgn", "Medial geniculate, internal capsule, transverse temporal gyrus (primary auditory cortex)", "i",
                          [["medial-geniculate-body", "i", 0.5], ["mni-internal-capsule", "i", 0.5, 0.01], ["transverse-temporal-gyri", "i", 0.5]],
                          ["medial-geniculate-body", "transverse-temporal-gyri"],
                          [mark(["transverse-temporal-gyri", "i", 0.5], "syn", "Primary auditory cortex (BA 41, 42)")], noLesion=True)]},
    ],
}
pw["vestibular"] = {
    "loss": "head position and acceleration (balance)", "region": "balance", "quality": "partial",
    "neurons": [
        {"short": "Vestibular ganglion (CN VIII)", "syn": "Vestibular nuclei (and directly the cerebellum)", "synKeys": ["vestibular nucle"],
         "stretches": [
             st("nerve", "Vestibular nerve (CN VIII) to the vestibular nuclei", "i",
                [["vestibular-nerve", "i", 0.1], ["vestibular-nerve", "i", 0.9], ["vestibular-nuclei", "i", 0.5]], ["vestibular-nerve"],
                [mark(["vestibular-nerve", "i", 0.1], "soma", "Vestibular ganglion (CN VIII)")], noLesion=True),
             st("icp", "Direct input to the cerebellum through the inferior cerebellar peduncle (juxtarestiform body)", "i",
                [["vestibular-nuclei", "i", 0.5], ["mni-inferior-cerebellar-peduncle", "i", 0.5], ["cerebellum", "i", 0.4]], ["mni-inferior-cerebellar-peduncle"], noLesion=True),
         ]},
        {"short": "Vestibular nuclei", "syn": "Thalamus; eye-movement nuclei; cervical cord; ventral horn", "synKeys": ["thalamus", "mlf", "ventral horn"],
         "stretches": [
             st("mlf", "Ascending MLF to the eye-movement nuclei (vestibulo-ocular reflex: the eyes move opposite to the head)", "i",
                [["vestibular-nuclei", "i", 0.5], ["mni-medial-longitudinal-fasciculus", "i", 0.5], ["mni-medial-longitudinal-fasciculus", "i", 1]], ["mni-medial-longitudinal-fasciculus"],
                [mark(["vestibular-nuclei", "i", 0.5], "soma", "Vestibular nuclei")], noLesion=True),
             st("vst", "Vestibulospinal tract to the ventral horn (trunk muscles, righting)", "i",
                [["vestibular-nuclei", "i", 0.5], ["lateral-vestibulospinal-tract", "i", 1], ["lateral-vestibulospinal-tract", "i", 0.3]], ["lateral-vestibulospinal-tract"], noLesion=True),
             st("thal", "Ascending to the thalamus (conscious perception of movement)", "i",
                [["vestibular-nuclei", "i", 0.5], ["thalamus", "i", 0.4, 0.004, 0, -0.006]], None, noLesion=True),
         ]},
    ],
}
pw["solitary"] = {
    "loss": "taste and visceral sensation", "region": "taste and viscera", "quality": "partial",
    "neurons": [
        {"short": "Peripheral ganglion of CN VII, IX or X", "syn": "Solitary nucleus (rostral: taste; caudal: cardiovascular, respiratory, GI)", "synKeys": ["solitary"],
         "stretches": [st("cn", "Cranial nerve to the solitary tract and solitary nucleus", "i",
                          [["vagus-nerve-x", "i", 0.2], ["medulla-oblongata", "i", 0.55, 0.004, 0, 0.006]], ["vagus-nerve-x"],
                          [mark(["vagus-nerve-x", "i", 0.2], "soma", "Ganglion (CN VII, IX, X)"), mark(["medulla-oblongata", "i", 0.55, 0.004, 0, 0.006], "syn", "Solitary nucleus")], noLesion=True)]},
        {"short": "Solitary nucleus", "syn": "Salivatory nuclei, dorsal motor nucleus of the vagus, nucleus ambiguus, lateral horn T1 to L2", "synKeys": ["salivatory", "ambiguus", "vagus", "lateral horn"],
         "stretches": [
             st("ia", "To the inferior salivatory nucleus", "i", [["medulla-oblongata", "i", 0.55, 0.004, 0, 0.006], ["inferior-salivatory-nucleus", "i", 0.5]], ["inferior-salivatory-nucleus"], noLesion=True),
             st("na", "To the nucleus ambiguus", "i", [["medulla-oblongata", "i", 0.55, 0.004, 0, 0.006], ["nucleus-ambiguus", "i", 0.5]], ["nucleus-ambiguus"], noLesion=True),
             st("sa", "To the superior salivatory nucleus", "i", [["medulla-oblongata", "i", 0.55, 0.004, 0, 0.006], ["superior-salivatory-nucleus", "i", 0.5]], ["superior-salivatory-nucleus"], noLesion=True),
             st("lh", "To the lateral horn (T1 to L2)", "i", [["medulla-oblongata", "i", 0.55, 0.004, 0, 0.006], ["lateral-intermediate-substance", "i", 0.7]], None, noLesion=True),
         ]},
    ],
}
pw["stretch-reflex"] = {
    "loss": "muscle length reflex (knee jerk)", "region": "the muscle served", "quality": "partial",
    "neurons": [
        {"short": "Dorsal root ganglion (muscle spindle Ia afferent)", "syn": "Alpha motor neuron, directly (no interneuron)", "synKeys": ["alpha", "motor neuron", "ventral horn"],
         "stretches": [st("ia", "Ia afferent: dorsal root, straight onto the alpha motor neuron in the ventral horn", "i",
                          [SP, ["posterior-root-of-spinal-nerve", "i", 0.4], ["anterior-horn-of-spinal-cord", "i", 0.4]], None,
                          [mark(SP, "soma", "1st-order cell body: dorsal root ganglion"), mark(["anterior-horn-of-spinal-cord", "i", 0.4], "syn", "Alpha motor neuron (one synapse)")], noLesion=True)]},
        {"short": "Alpha motor neuron (ventral horn)", "syn": "Skeletal muscle (neuromuscular junction)", "synKeys": ["muscle"],
         "stretches": [st("lmn", "Ventral root and spinal nerve to the muscle", "i",
                          [["anterior-horn-of-spinal-cord", "i", 0.4], ["anterior-root-of-spinal-nerve", "i", 0.4]], None, noLesion=True)]},
    ],
}
pw["withdrawal-reflex"] = {
    "loss": "withdrawal from a skin stimulus", "region": "the limb served", "quality": "partial",
    "neurons": [
        {"short": "Dorsal root ganglion (skin receptor)", "syn": "Interneuron(s) in the dorsal / ventral horn", "synKeys": ["interneuron"],
         "stretches": [st("root", "Dorsal root to the dorsal horn", "i",
                          [SP, ["posterior-root-of-spinal-nerve", "i", 0.4], ["posterior-horn-of-spinal-cord", "i", 0.4]], None,
                          [mark(SP, "soma", "1st-order cell body: dorsal root ganglion")], noLesion=True)]},
        {"short": "Interneuron(s)", "syn": "Alpha motor neuron in the ventral horn", "synKeys": ["alpha", "motor neuron", "ventral horn"],
         "stretches": [st("int", "Spinal interneurons (a local circuit, open to descending modulation)", "i",
                          [["posterior-horn-of-spinal-cord", "i", 0.4], ["intermediate-zone-of-spinal-cord", "i", 0.4], ["anterior-horn-of-spinal-cord", "i", 0.4]], None,
                          [mark(["intermediate-zone-of-spinal-cord", "i", 0.4], "syn", "Interneuron(s)")], noLesion=True)]},
        {"short": "Alpha motor neuron (ventral horn)", "syn": "Skeletal muscle", "synKeys": ["muscle"],
         "stretches": [st("lmn", "Ventral root and spinal nerve to the muscle", "i",
                          [["anterior-horn-of-spinal-cord", "i", 0.4], ["anterior-root-of-spinal-nerve", "i", 0.4]], None, noLesion=True)]},
    ],
}
json.dump(d, open(P, "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
print("patched", len(pw), "pathways")
