# Structures the course overlay does not outline, authored on the plate's right half (plate units: 1000 wide,
# midline x = 500, dorsal up) and mirrored by build.py. Each one is placed from the section photo itself and checked
# against a course source (the atlas key pages = the DeArmond figures of the same sections, the Lab 8 histology
# cards) and an open atlas (Coulombe et al. 2021, CC BY). Anything not confirmed closely is approx (shown as such).
#
# keys per structure: pts | ellipse [cx, cy, rx, ry, rot], tissue, approx (default True), src, note,
#   clip_out [slugs]: subtract regions already placed; cut_from [slugs]: take this part out of a broader course region.
# level keys: _skip [course slugs replaced by an authored region], _approx {course slug: why}, _fibres {slug: {paths}}.

KEY = "course atlas key (DeArmond figure of the same section)"
L8 = "Lab 8 histology cards (course)"
COU = "Coulombe et al. 2021 (CC BY 4.0)"
STD = "standard position"

EXTRAS = {
    "midbrain-sc": {
        "_approx": {
            "cerebral-aqueduct": "The lumen is collapsed in this section; the outline is the course overlay's, inside the periaqueductal gray.",
        },
        "medial-longitudinal-fasciculus": {
            "pts": [[548, 292], [566, 288], [580, 296], [582, 318], [574, 342], [562, 362], [552, 368], [546, 350], [544, 320]],
            "tissue": "white", "clip_out": ["oculomotor-nucleus", "edinger-westphal-nucleus", "red-nucleus", "periaqueductal-gray"],
            "src": [KEY + ", Fig. 54", L8, COU + ", plate 4"],
            "note": "Not outlined on the course overlay: the dark bundle along the ventrolateral side of the oculomotor nucleus.",
        },
        "medial-geniculate-nucleus": {
            "pts": [[838, 247], [866, 240], [892, 256], [905, 288], [904, 328], [890, 356], [862, 368], [838, 356], [826, 326], [826, 284]],
            "tissue": "grey", "clip_out": ["cerebral-peduncles"],
            "src": [L8, KEY + ", Fig. 54", COU + ", plate 4 (MG)"],
            "note": "The pale oval at the lateral edge; the section cuts the thalamus obliquely, so only its caudal end shows.",
        },
        "brachium-of-the-inferior-colliculus": {
            "pts": [[760, 222], [800, 226], [836, 240], [830, 252], [812, 262], [790, 258], [770, 250], [752, 238]],
            "tissue": "white", "clip_out": ["anterolateral-spinothalamic-tract", "superior-colliculus", "medial-geniculate-nucleus"],
            "src": [KEY + ", Fig. 54", COU + ", plate 4 (bic)"],
            "note": "The fibre band at the dorsolateral surface, running to the medial geniculate nucleus.",
        },
    },
    "midbrain-ic": {
        "_skip": ["inferior-colliculus"],
        "_approx": {
            "cerebral-aqueduct": "The lumen is collapsed in this section; the outline is the course overlay's, inside the periaqueductal gray.",
        },
        "inferior-colliculus": {
            "pts": [[566, 52], [600, 42], [650, 40], [700, 48], [745, 72], [775, 108], [790, 145], [788, 182], [770, 206], [735, 212],
                    [700, 200], [672, 175], [655, 140], [640, 108], [615, 84], [588, 70]],
            "tissue": "grey", "approx": False, "clip_out": ["periaqueductal-gray"],
            "src": ["course overlay (dorsal outline)", KEY + ", Fig. 52 (nucleus of the inferior colliculus)", COU + ", plate 8"],
            "note": "The course overlay marks the dorsal surface; extended to the nucleus that shows on the section (Fig. 52).",
        },
        "medial-longitudinal-fasciculus": {
            "pts": [[512, 276], [530, 274], [552, 280], [566, 292], [560, 306], [540, 310], [520, 306], [510, 295]],
            "tissue": "white", "clip_out": ["trochlear-nucleus", "decussation-of-the-superior-cerebellar-peduncle", "periaqueductal-gray"],
            "src": [KEY + ", Fig. 52", COU + ", plate 8"],
            "note": "Not outlined on the course overlay: just ventral to the trochlear nucleus, beside the midline.",
        },
        "brachium-of-the-inferior-colliculus": {
            "pts": [[782, 108], [800, 126], [812, 160], [813, 198], [803, 224], [790, 218], [792, 186], [793, 150], [786, 124]],
            "tissue": "white", "clip_out": ["inferior-colliculus", "anterolateral-spinothalamic-tract"],
            "src": [KEY + ", Fig. 52", STD],
            "note": "Leaves the inferior colliculus laterally; a thin band at the dorsolateral surface.",
        },
        "transverse-fibers-of-the-pons": {
            "pts": [[502, 762], [560, 754], [640, 752], [720, 744], [790, 724], [850, 702], [880, 712], [874, 742], [840, 776], [790, 802],
                    [720, 832], [650, 852], [580, 864], [502, 868]],
            "tissue": "white", "clip_out": ["cerebral-peduncles"],
            "src": [KEY + ", Fig. 52", COU + ", plate 8 (tfp)"],
            "note": "The rostral end of the basis pontis: transverse fibres heading for the middle cerebellar peduncle.",
        },
        "pontine-nuclei": {
            "pts": [[502, 600], [540, 590], [585, 600], [600, 640], [600, 700], [585, 738], [545, 748], [502, 748]],
            "tissue": "grey", "clip_out": ["cerebral-peduncles", "transverse-fibers-of-the-pons"],
            "src": [KEY + ", Fig. 52", COU + ", plate 8 (Pn)"],
            "note": "The grey matter between the fibre bundles of the rostral basis pontis.",
        },
    },
    "pons-mid": {
        "pontine-protuberance": {
            "pts": [[502, 292], [560, 292], [640, 296], [690, 302], [716, 330], [722, 380], [728, 420], [742, 452], [748, 476], [745, 502],
                    [720, 530], [680, 548], [620, 560], [560, 567], [502, 569]],
            "tissue": "landmark", "approx": False, "anchor_out": ["longitudinal-fibers-of-the-pons", "pontine-nuclei"],
            "src": ["Lab 10 slide 11 (course: 'the ventral pons is dominated by the pontine protuberance')", KEY + ", Fig. 49 (basilar pons)", COU + ", plate 20"],
            "note": "The ventral bulge of the pons (basilar pons): the pontine nuclei with the longitudinal and transverse fibres; drawn as its outline, the structures inside stay hoverable.",
        },
        "medial-longitudinal-fasciculus": {
            "pts": [[504, 132], [522, 130], [536, 138], [538, 156], [530, 170], [514, 174], [505, 166]],
            "tissue": "white", "clip_out": ["fourth-ventricle"],
            "src": [KEY + ", Fig. 49", L8, COU + ", plate 20 (mlf)"],
            "note": "Not outlined on the course overlay: beside the midline under the floor of the fourth ventricle.",
        },
    },
    "pons-caudal": {
        "cerebellum": {
            "pts": [[500, 150], [560, 140], [580, 120], [620, 92], [700, 88], [760, 94], [800, 104], [806, 60], [790, 20], [500, 20]],
            "midline": True, "tissue": "grey", "approx": False,
            "clip_out": ["fourth-ventricle", "superior-cerebellar-peduncle", "middle-cerebellar-peduncle"],
            "src": ["the section photo (folia over the fourth ventricle)", "Lab 8 slide 7 (course: the same level with the cerebellum attached)", "Lab 10 slide 25 (course: gross pons with the cerebellum)", COU + ", plate 24"],
            "note": "The vermis (nodulus) that roofs the fourth ventricle; the section is cut off at the photo's edge, so only this strip shows.",
        },
        "pontine-protuberance": {
            "pts": [[502, 455], [580, 455], [660, 460], [722, 472], [742, 500], [746, 560], [746, 610], [732, 650], [702, 690], [650, 716],
                    [580, 731], [502, 736]],
            "tissue": "landmark", "approx": False, "anchor_out": ["longitudinal-fibers-of-the-pons", "pontine-nuclei"],
            "src": ["Lab 10 slides 11, 13, 25 (course: the ventral bulge of the pons, made by the pontine nuclei and their fibres)", KEY + ", Fig. 48 (basilar pons)", STD],
            "note": "The ventral bulge of the pons (basilar pons): the pontine nuclei with the longitudinal and transverse fibres; drawn as its outline, the structures inside stay hoverable.",
        },
        "medial-longitudinal-fasciculus": {
            "pts": [[504, 270], [522, 268], [540, 276], [546, 296], [538, 314], [518, 318], [505, 310]],
            "tissue": "white", "clip_out": ["abducens-nucleus", "facial-colliculus", "fourth-ventricle"],
            "src": [KEY + ", Fig. 48", L8, COU + ", plate 24 (mlf, Sp5, icp)"],
            "note": "Not outlined on the course overlay: beside the midline, ventromedial to the abducens nucleus.",
        },
        "spinal-trigeminal-nucleus": {
            "pts": [[688, 290], [712, 284], [734, 292], [744, 312], [738, 334], [716, 342], [694, 334], [684, 312]],
            "tissue": "grey", "clip_out": ["vestibulocochlear-complex", "facial-nucleus", "middle-cerebellar-peduncle"],
            "src": [KEY + ", Fig. 48", L8, COU + ", plate 24 (mlf, Sp5, icp)"],
            "note": "Not outlined on the course overlay: lateral tegmentum, between the vestibular nuclei and the facial nucleus.",
        },
        "inferior-cerebellar-peduncle": {
            "pts": [[716, 222], [736, 214], [752, 226], [756, 256], [748, 282], [730, 288], [716, 272], [712, 246]],
            "tissue": "white", "clip_out": ["superior-cerebellar-peduncle", "vestibulocochlear-complex", "middle-cerebellar-peduncle", "spinal-trigeminal-nucleus"],
            "src": [L8, COU + ", plate 24 (icp)", STD],
            "note": "Not outlined on the course overlay and not separable on this section: lateral to the vestibular nuclei, turning into the cerebellum.",
        },
    },
    "medulla-rostral": {
        "medial-longitudinal-fasciculus": {
            "pts": [[504, 305], [525, 302], [540, 312], [542, 335], [532, 352], [512, 354], [504, 342]],
            "tissue": "white", "clip_out": ["hypoglossal-nucleus", "medial-lemniscus"],
            "src": [KEY + ", Fig. 44", L8, COU + ", plates 28-29 (mlf, Sp5, Amb)"],
            "note": "Not outlined on the course overlay: beside the midline, ventral to the hypoglossal nucleus, dorsal to the medial lemniscus.",
        },
        "spinal-trigeminal-nucleus": {
            "pts": [[740, 312], [770, 300], [795, 318], [805, 352], [798, 388], [775, 404], [750, 396], [735, 365], [733, 335]],
            "tissue": "grey", "clip_out": ["inferior-cerebellar-peduncle", "dorsal-spinocerebellar-tract"],
            "src": [KEY + ", Fig. 44", L8, COU + ", plates 28-29 (mlf, Sp5, Amb)"],
            "note": "Not outlined on the course overlay: the pale column medial to the spinal trigeminal tract, ventromedial to the inferior cerebellar peduncle.",
        },
        "nucleus-ambiguus": {
            "ellipse": [758, 445, 13, 12, 0],
            "tissue": "grey", "clip_out": ["spinal-trigeminal-nucleus", "inferior-olivary-nucleus", "anterolateral-spinothalamic-tract"],
            "src": [KEY + ", Fig. 44", L8],
            "note": "Not visible in a myelin stain: placed in the ventrolateral reticular formation, dorsal to the inferior olive (Fig. 44).",
        },
    },
    "medulla-mid": {
        "hypoglossal-nucleus": {
            "ellipse": [522, 262, 13, 17, 0], "tissue": "grey",
            "src": [KEY + ", Fig. 41", COU + ", plate 38 (12N, 10N, Amb, mlf)"],
            "note": "Not outlined on the course overlay and not distinct in this stain: ventrolateral to the central canal (Fig. 41).",
        },
        "dorsal-motor-nucleus-of-the-vagus": {
            "ellipse": [540, 232, 12, 11, -20], "tissue": "grey", "clip_out": ["hypoglossal-nucleus"],
            "src": [KEY + ", Fig. 41 (highlighted)", COU + ", plate 38 (12N, 10N, Amb, mlf)"],
            "note": "Not outlined on the course overlay: dorsolateral to the hypoglossal nucleus (Fig. 41).",
        },
        "solitary-nucleus": {
            "ellipse": [562, 210, 13, 12, 0], "tissue": "grey", "clip_out": ["gracile-nucleus", "cuneate-nucleus", "dorsal-motor-nucleus-of-the-vagus"],
            "src": [KEY + ", Fig. 41", COU + ", plate 38 (12N, 10N, Amb, mlf)"],
            "note": "Not outlined on the course overlay: lateral to the dorsal motor nucleus of the vagus, around the solitary tract (Fig. 41).",
        },
        "nucleus-ambiguus": {
            "ellipse": [790, 432, 12, 11, 0], "tissue": "grey",
            "clip_out": ["spinal-trigeminal-nucleus", "anterolateral-spinothalamic-tract", "pyramids"],
            "src": [KEY + ", Fig. 41"],
            "note": "Not visible in a myelin stain: placed in the ventrolateral reticular formation (Fig. 41).",
        },
        "medial-longitudinal-fasciculus": {
            "pts": [[503, 292], [520, 290], [530, 300], [528, 318], [512, 322], [503, 314]],
            "tissue": "white", "clip_out": ["medial-lemniscus", "hypoglossal-nucleus"],
            "src": [KEY + ", Fig. 41", COU + ", plate 38 (12N, 10N, Amb, mlf)"],
            "note": "Not outlined on the course overlay: beside the midline, dorsal to the medial lemniscus.",
        },
    },
    "medulla-caudal": {
        "lateral-corticospinal-tract": {
            "pts": [[745, 430], [790, 425], [835, 440], [845, 480], [840, 530], [815, 560], [780, 560], [752, 530], [742, 480]],
            "tissue": "white",
            "clip_out": ["dorsal-spinocerebellar-tract", "spinal-trigeminal-nucleus", "motor-decussation", "anterolateral-spinothalamic-tract"],
            "src": [KEY + ", Fig. 40", COU + ", plate 45 (lcs)"],
            "note": "Not outlined on the course overlay: where the decussating fibres gather in the lateral funiculus, medial to the dorsal spinocerebellar tract.",
        },
        "pyramids": {
            "pts": [[520, 612], [560, 600], [610, 605], [648, 640], [655, 700], [640, 760], [600, 800], [560, 812], [525, 805], [515, 760], [515, 680]],
            "tissue": "white", "cut_from": ["motor-decussation"],
            "src": ["course overlay ('Pyramids/Motor Decussation')", KEY + ", Fig. 40", COU + ", plate 45 (py)"],
            "note": "The course labels this whole shape 'Pyramids/Motor Decussation'; its ventral part, beside the anterior median fissure, is the pyramid.",
        },
        "anterior-corticospinal-tract": {
            "pts": [[552, 748], [598, 740], [636, 750], [650, 778], [628, 802], [586, 812], [556, 806], [546, 780]],
            "tissue": "white",
            "src": ["Lab 10 slide 20 answer key (course: the uncrossed fibres stay on the ventral aspect)", "Lecture 10 slide 15 (course)", KEY + ", Fig. 40"],
            "note": "The ~20% of pyramidal fibres that do not cross stay in the ventral part of the pyramid and continue as the anterior corticospinal tract (the course's Lab 10 drawing); not separable in this stain.",
        },
        "medial-longitudinal-fasciculus": {
            "pts": [[540, 520], [565, 515], [590, 528], [594, 556], [580, 578], [556, 580], [540, 565]],
            "tissue": "white",
            "src": [KEY + ", Fig. 40", STD],
            "note": "Not outlined on the course overlay: in the anterior funiculus beside the decussation (Fig. 40).",
        },
        "_fibres": {
            "accessory-nerve": {
                "paths": [[[700, 592], [742, 575], [790, 552], [840, 528], [890, 505], [958, 488]]],
                "src": [KEY + ", Fig. 40 (fascicles of the spinal accessory nerve)", STD],
                "note": "Rootlets from the accessory nucleus in the ventral horn, leaving the lateral surface (Fig. 40).",
            },
        },
    },
    "cervicomedullary": {
        # the grey matter as the section shows it (pale, unstained), so the motor neuron pools sit in a real ventral horn
        "dorsal-horn": {
            "pts": [[717, 125], [733, 143], [727, 173], [707, 200], [700, 227], [693, 247], [667, 254], [637, 248], [632, 228], [650, 213],
                    [673, 200], [690, 173], [700, 143], [706, 126]],
            "tissue": "grey", "approx": False, "clip_out": ["fasciculus-cuneatus", "fasciculus-gracilis"],
            "src": ["the section itself (unstained grey matter)", "Lab 5 / Lecture 4 (dorsal horn)", COU + ", plate 45"],
            "note": "Context for the cervical cord: the posterior grey column, drawn on the pale (unmyelinated) tissue of the section.",
        },
        "ventral-horn": {
            "pts": [[590, 373], [600, 363], [640, 353], [687, 350], [733, 352], [787, 357], [823, 367], [832, 383], [817, 400], [787, 413],
                    [753, 420], [720, 428], [687, 442], [660, 460], [633, 465], [603, 460], [592, 433], [589, 400]],
            "tissue": "grey", "approx": False,
            "src": ["the section itself (unstained grey matter)", "Lab 5 / Lecture 4 (ventral horn)", COU + ", plate 45"],
            "note": "Context for the cervical cord: the anterior grey column, drawn on the pale (unmyelinated) tissue of the section.",
        },
        "lateral-funiculus": {
            "pts": [[724, 120], [770, 132], [830, 166], [890, 210], [940, 262], [975, 322], [995, 385], [985, 440], [955, 488], [905, 525],
                    [855, 548], [805, 560], [790, 530], [772, 490], [752, 452], [740, 426], [790, 413], [818, 401], [833, 383], [824, 366],
                    [790, 355], [742, 351], [742, 330], [748, 300], [752, 260], [745, 215], [740, 175], [735, 145]],
            "tissue": "white", "approx": False, "clip_out": ["dorsal-horn", "ventral-horn", "fasciculus-cuneatus", "fasciculus-gracilis"],
            "anchor_out": ["dorsal-spinocerebellar-tract", "anterolateral-spinothalamic-tract", "lateral-corticospinal-tract"],
            "src": ["Lab 10 slide 21 (course)", "Unit 2 online lab assignment slide 17 (course)", COU + ", plate 45", STD],
            "note": "The white matter between the dorsal root entry zone and the ventral root exit zone; it holds the dorsal spinocerebellar, lateral corticospinal and anterolateral tracts (hover them on top).",
        },
        "anterior-funiculus": {
            "pts": [[502, 352], [545, 356], [588, 372], [590, 400], [592, 433], [603, 461], [633, 467], [660, 462], [687, 443], [720, 429],
                    [740, 426], [752, 452], [772, 490], [790, 530], [805, 560], [760, 600], [502, 600]],
            "tissue": "white", "approx": False, "clip_out": ["ventral-horn", "lateral-funiculus"],
            "anchor_out": ["anterior-corticospinal-tract", "anterolateral-spinothalamic-tract"],
            "src": ["Lab 10 slides 21-22 (course)", "Unit 2 online lab assignment slide 17 (course)", COU + ", plate 45", STD],
            "note": "The white matter between the anterior median fissure and the ventral root exit zone; the anterior corticospinal tract runs along its medial edge.",
        },
        "location-of-limb-lower-motor-neurons": {
            "pts": [[712, 346], [790, 352], [838, 368], [838, 396], [815, 410], [770, 422], [728, 432], [712, 436]],
            "tissue": "grey", "within": ["ventral-horn"],
            "src": ["Lab 10 slide 22 and its answer key (course: the limb motor neuron pool, lateral ventral horn)", "Lecture 10 slide 24 (course)", STD],
            "note": "Lower motor neurons for the limbs lie in the lateral part of the ventral horn (the course's Lab 10 drawing); not visible as such in a myelin stain.",
        },
        "location-of-trunk-lower-motor-neurons": {
            "pts": [[586, 366], [640, 350], [672, 348], [672, 452], [650, 468], [600, 468], [584, 432]],
            "tissue": "grey", "within": ["ventral-horn"],
            "src": ["Lab 10 slide 22 and its answer key (course: the trunk motor neuron pool, medial ventral horn)", "Lecture 10 slide 24 (course)", STD],
            "note": "Lower motor neurons for the trunk (axial) muscles lie in the medial part of the ventral horn (the course's Lab 10 drawing); not visible as such in a myelin stain.",
        },
        "anterior-corticospinal-tract": {
            "ellipse": [530, 468, 22, 46, 0],
            "tissue": "white", "clip_out": ["ventral-horn"],
            "src": ["Lab 10 slide 22 and its answer key (course)", "Lecture 10 slides 15, 24 (course)", COU + ", plate 45 (acs)"],
            "note": "The uncrossed corticospinal fibres, along the anterior median fissure in the anterior funiculus (the course's Lab 10 drawing); not separable in this stain.",
        },
        "lateral-corticospinal-tract": {
            "pts": [[712, 250], [750, 232], [800, 240], [830, 268], [836, 310], [815, 345], [775, 356], [735, 346], [712, 310]],
            "tissue": "white", "clip_out": ["dorsal-spinocerebellar-tract", "anterolateral-spinothalamic-tract"],
            "src": [COU + ", plate 45 (lcs)", STD],
            "note": "Not outlined on the course overlay: the dorsal part of the lateral funiculus, medial to the dorsal spinocerebellar tract.",
        },
    },
}


# Surface plates (Lab 7 specimen photos, canonical frame from surface_canon.py; right half authored and mirrored).
# Positions come from the specimen photo itself and the course's own marks on the same photo in the Lab 7 slides
# (registered onto the canonical photo: SIFT + similarity transform, then the straightening shift); second source:
# the course's Lab 8 surface line drawings and the Lab 7 summary drawings, then Sobotta 1909 figs. 647/659 (public domain).
L7V = "Lab 7 ventral surface slides (course marks on the same specimen)"
L7D = "Lab 7 dorsal surface slides (course marks on the same specimen)"
L8S = "Lab 8 surface line drawing (course)"
L7S = "Lab 7 summary drawing (course)"
SOB = "Sobotta 1909 (public domain)"
EXTRAS.update({
    "external-anterior": {
        "midbrain": {
            "pts": [[500, 236], [600, 230], [680, 266], [745, 330], [756, 408], [726, 448], [640, 440], [570, 432], [500, 430]],
            "tissue": "zone", "approx": False, "midline": True,
            "src": [L7V, "Lab 2 'Brainstem' (course)"], "note": "The ventral midbrain: the cerebral peduncles and the interpeduncular fossa between them.",
        },
        "pons": {
            "pts": [[500, 430], [570, 432], [640, 442], [684, 462], [700, 505], [712, 560], [724, 620], [724, 680], [712, 726], [690, 768], [640, 790], [580, 795], [500, 796]],
            "tissue": "zone", "approx": False, "midline": True,
            "src": [L7V, "Lab 2 'Brainstem' (course)"], "note": "The ventral pons, from the cerebral peduncles to the pontomedullary junction.",
        },
        "medulla": {
            "pts": [[500, 796], [586, 795], [632, 806], [642, 870], [632, 960], [596, 1000], [586, 1100], [580, 1200], [576, 1290], [500, 1296]],
            "tissue": "zone", "approx": False, "midline": True,
            "src": [L7V, "Lab 2 'Brainstem' (course)"], "note": "The ventral medulla, from the pontomedullary junction to the cut spinal cord.",
        },
        "cerebral-peduncles": {
            "pts": [[548, 318], [560, 262], [615, 236], [676, 274], [739, 336], [751, 409], [724, 446], [673, 452], [630, 440], [590, 420], [560, 395], [542, 352]],
            "tissue": "white", "approx": False,
            "src": [L7V + ": 'CEREBRAL peduncles' outline", L8S, SOB + " fig. 647"],
            "note": "The course's own outline on this specimen (Lab 7, 'Landmarks of Ventral Midbrain').",
        },
        "interpeduncular-cistern": {
            "pts": [[500, 300], [566, 300], [560, 348], [534, 408], [500, 446]], "midline": True,
            "tissue": "landmark", "src": [L7V + ": the cistern is the CSF pool of the subarachnoid space here", STD],
            "note": "The enlarged pool of CSF in the subarachnoid space over the interpeduncular fossa (the course names both for this spot); drawn as the pool, a little larger than the fossa.",
        },
        "interpeduncular-fossa": {
            "pts": [[500, 318], [550, 318], [520, 390], [500, 432]], "midline": True,
            "tissue": "space", "src": [L7V + ": the triangle between the peduncles", L8S],
            "note": "The course marks it as the triangle between the peduncles; on this specimen the upper brainstem is bent, so the outline is approximate.",
        },
        "oculomotor-nerve": {
            "pts": [[530, 300], [565, 292], [600, 300], [615, 330], [612, 370], [590, 392], [555, 395], [528, 378], [520, 340]],
            "tissue": "nerve", "approx": False, "src": [L7V + ": 'oculomotor nerves (CN III)' box", L8S],
            "note": "Its cut root, leaving the medial side of the cerebral peduncle into the interpeduncular fossa.",
        },
        "transverse-fibers-of-the-pons": {
            "pts": [[500, 440], [570, 443], [640, 458], [672, 490], [686, 540], [690, 600], [684, 660], [668, 720], [640, 765], [600, 785], [540, 792], [500, 794]],
            "tissue": "white", "approx": False,
            "src": [L7V + ": 'lateral striations = transverse fibers of the pons'", L8S],
            "note": "The ventral surface of the pons: its striations are the transverse fibres crossing to the middle cerebellar peduncle.",
        },
        "middle-cerebellar-peduncle": {
            "pts": [[672, 490], [690, 466], [702, 505], [714, 560], [726, 620], [726, 680], [714, 726], [692, 762], [664, 768], [668, 720], [684, 660], [690, 600], [686, 540]],
            "tissue": "white", "approx": True,
            "src": [L8S, SOB + " fig. 647", STD],
            "note": "Lateral to the trigeminal root the pons continues as the middle cerebellar peduncle (cut where the cerebellum was removed).",
        },
        "trigeminal-nerve": {
            "pts": [[690, 540], [720, 534], [746, 548], [757, 575], [752, 610], [735, 640], [712, 650], [700, 620], [694, 580]],
            "tissue": "nerve", "approx": False, "src": [L7V + ": 'CN V (Trigeminal nerve)' arrow", L8S],
            "note": "Its large root leaves the lateral pons, at the junction with the middle cerebellar peduncle.",
        },
        "abducens-nerve": {
            "pts": [[583, 698], [596, 692], [612, 730], [622, 762], [610, 772], [598, 740]],
            "tissue": "nerve", "approx": False, "src": [L7V + ": 'CN VI (Abducens nerve)' arrow", L8S],
            "note": "Leaves at the pontomedullary junction, just lateral to the pyramid.",
        },
        "facial-nerve": {
            "pts": [[660, 736], [690, 727], [714, 731], [712, 750], [684, 757], [660, 752]],
            "tissue": "nerve", "approx": False, "src": [L7V + ": 'CN VII (Facial nerve)' arrow", L8S],
            "note": "Leaves at the cerebellopontine angle, medial to the vestibulocochlear nerve.",
        },
        "vestibulocochlear-nerve": {
            "pts": [[714, 744], [742, 731], [790, 728], [810, 745], [808, 768], [770, 771], [730, 769], [712, 760]],
            "tissue": "nerve", "approx": False, "src": [L7V + ": 'CN VIII (Vestibulocochlear nerves)' arrow", L8S],
            "note": "Leaves at the cerebellopontine angle, the most lateral of the nerves at the pontomedullary junction.",
        },
        "pyramids": {
            "pts": [[504, 800], [540, 798], [578, 805], [584, 850], [582, 950], [578, 1050], [574, 1150], [566, 1226], [504, 1228]],
            "tissue": "white", "approx": False, "src": [L7V + ": 'The pyramids' outline", L8S, SOB + " fig. 647"],
            "note": "The two ridges beside the anterior median fissure: the corticospinal fibres.",
        },
        "olives": {
            "pts": [[586, 796], [608, 790], [626, 810], [633, 860], [628, 915], [612, 955], [594, 960], [585, 920], [584, 850]],
            "tissue": "grey", "approx": False, "clip_out": ["pyramids"], "src": [L7V + ": 'The olives' outline", L8S, SOB + " fig. 647"],
            "note": "The oval bulge lateral to the pyramid, made by the inferior olivary nucleus beneath the surface.",
        },
        "motor-decussation": {
            "pts": [[500, 1168], [518, 1170], [524, 1226], [500, 1230]], "midline": True,
            "tissue": "white", "src": [L8S + " ('Pyramidal decussation')", SOB + " fig. 647"],
            "note": "Where the pyramids cross, at the medulla-spinal cord junction; not distinct on this specimen.",
        },
        "hypoglossal-nerve": {
            "pts": [[592, 905], [620, 912], [680, 934], [736, 954], [736, 966], [680, 950], [620, 928], [590, 920]],
            "tissue": "nerve", "approx": False, "src": [L7V + ": 'Cranial nerve XII (Hypoglossal)' arrow", L8S],
            "note": "Its rootlets leave between the pyramid and the olive (preolivary sulcus).",
        },
        "glossopharyngeal-nerve": {
            "pts": [[628, 806], [680, 800], [740, 812], [772, 830], [762, 846], [700, 838], [640, 836]],
            "tissue": "nerve", "src": [L7V + ": 'IX and X difficult to distinguish'", L8S],
            "note": "Rootlets behind the olive (postolivary sulcus), the upper part of the IX/X bundle; the course notes IX and X are difficult to tell apart here.",
        },
        "vagus-nerve": {
            "pts": [[636, 842], [700, 844], [764, 852], [775, 884], [760, 900], [700, 886], [642, 872]],
            "tissue": "nerve", "src": [L7V + ": 'IX and X difficult to distinguish'", L8S],
            "note": "Rootlets behind the olive (postolivary sulcus), below the glossopharyngeal; the course notes IX and X are difficult to tell apart here.",
        },
        "_fibres": {
            "accessory-nerve": {
                "paths": [[[592, 1250], [606, 1160], [622, 1070], [640, 990], [664, 930]]],
                "src": [L8S, SOB + " fig. 647"],
                "note": "Not present on the course brainstems (the course list says so); its spinal rootlets run up beside the cord and medulla, after the course line drawing.",
            },
        },
    },
    "external-posterior": {
        "pulvinar": {
            "pts": [[575, 300], [650, 300], [730, 320], [800, 345], [850, 380], [860, 405], [800, 412], [720, 405], [650, 385], [600, 365]],
            "tissue": "grey", "src": [L7S + " ('Thalamic pulvinar')", L7D, SOB + " fig. 659"],
            "note": "The posterior pole of the thalamus, overhanging the midbrain (diencephalon).",
        },
        "pineal-gland": {
            "ellipse": [500, 336, 22, 26, 0], "midline": True, "tissue": "grey",
            "src": [L7S + " ('Pineal gland')", L7D],
            "note": "In the midline between the rostral ends of the superior colliculi (epithalamus).",
        },
        "superior-colliculus": {
            "ellipse": [560, 392, 54, 44, 0], "tissue": "grey", "approx": False, "clip_out": ["pineal-gland"],
            "src": [L7D + ": 'Superior colliculi' circle", L7S, SOB + " fig. 659"],
            "note": "The upper pair of the four bumps on the dorsal midbrain.",
        },
        "inferior-colliculus": {
            "ellipse": [557, 478, 50, 36, 0], "tissue": "grey", "approx": False, "clip_out": ["superior-colliculus"],
            "src": [L7D + ": 'Inferior colliculi' circle", L7S, SOB + " fig. 659"],
            "note": "The lower pair of the four bumps on the dorsal midbrain.",
        },
        "brachium-of-the-inferior-colliculus": {
            "pts": [[598, 474], [622, 452], [652, 430], [684, 412], [698, 424], [668, 448], [640, 470], [612, 490]],
            "tissue": "white", "clip_out": ["inferior-colliculus", "superior-colliculus"],
            "src": [L7D + " (dotted arrow: IC to MGN)", L7S],
            "note": "The fibre band running from the inferior colliculus up and laterally to the medial geniculate nucleus.",
        },
        "medial-geniculate-nucleus": {
            "ellipse": [700, 425, 22, 18, 0], "tissue": "grey", "clip_out": ["pulvinar"],
            "src": [L7S + " ('Medial geniculate body')", SOB + " fig. 659"],
            "note": "The small bump under the pulvinar at the end of the brachium of the inferior colliculus (thalamus).",
        },
        "cerebral-peduncles": {
            "pts": [[700, 446], [730, 428], [746, 446], [750, 490], [742, 524], [712, 524], [692, 502], [690, 468]],
            "tissue": "white", "clip_out": ["medial-geniculate-nucleus", "brachium-of-the-inferior-colliculus"],
            "src": [L7S + " ('Cerebral Peduncles')", STD],
            "note": "The lateral side of the midbrain, seen past the colliculi.",
        },
        "superior-cerebellar-peduncle": {
            "pts": [[524, 622], [601, 641], [637, 690], [605, 720], [562, 703], [526, 688]],
            "tissue": "white", "approx": False, "src": [L7D + ": 'Superior cerebellar peduncles' outline", L7S],
            "note": "The course's own outline on this specimen: the cut peduncle forming the upper lateral wall of the fourth ventricle.",
        },
        "inferior-cerebellar-peduncle": {
            "pts": [[605, 738], [645, 701], [684, 753], [667, 802], [633, 808], [605, 787]],
            "tissue": "white", "approx": False, "clip_out": ["superior-cerebellar-peduncle"],
            "src": [L7D + ": 'Inferior cerebellar peduncles' outline", L7S],
            "note": "The course's own outline on this specimen: the cut peduncle at the lower lateral edge of the fourth ventricle.",
        },
        "middle-cerebellar-peduncle": {
            "pts": [[640, 688], [712, 680], [790, 700], [830, 740], [832, 780], [800, 805], [730, 805], [680, 795], [668, 760]],
            "tissue": "white", "approx": False, "clip_out": ["inferior-cerebellar-peduncle", "superior-cerebellar-peduncle"],
            "src": [L7D + ": 'Middle cerebellar peduncles' outline", L7S],
            "note": "The course's own outline on this specimen: the largest cut peduncle, on the side of the pons.",
        },
        "fourth-ventricle": {
            "pts": [[500, 640], [522, 648], [560, 672], [586, 720], [596, 770], [590, 812], [574, 852], [550, 890], [524, 922], [500, 946]],
            "midline": True, "tissue": "space", "approx": False,
            "src": [L7S + " ('IV ventricle')", "Lab 7 'Review the ventricular system from the dorsal view' (course)", SOB + " fig. 659"],
            "note": "Its floor (the rhomboid fossa), opened by removing the cerebellum.",
        },
        "facial-colliculus": {
            "ellipse": [527, 745, 20, 28, 0], "tissue": "landmark", "approx": False,
            "src": [L7D + ": 'Facial colliculi' circle", L7S, SOB + " fig. 659"],
            "note": "The bump on the floor of the fourth ventricle beside the midline, over the abducens nucleus and the facial nerve fibres.",
        },
        "area-postrema": {
            "pts": [[500, 904], [512, 906], [522, 922], [510, 936], [500, 938]], "midline": True, "tissue": "landmark",
            "src": [L7D + ": 'obex ... area postrema'", SOB + " fig. 659"],
            "note": "The chemosensitive strip at the caudal tip of the fourth ventricle, just above the obex.",
        },
        "obex": {
            "ellipse": [500, 944, 9, 8, 0], "midline": True, "tissue": "landmark", "approx": False,
            "src": [L7D + ": 'Obex' circle", L7S],
            "note": "The most inferior, pointed end of the fourth ventricle.",
        },
        "gracile-tubercle": {
            "ellipse": [548, 926, 20, 44, -8], "tissue": "grey", "approx": False, "clip_out": ["fourth-ventricle", "obex", "area-postrema"],
            "src": [L7D + ": 'Gracile tubercles' outline", L7S],
            "note": "Beside the obex: the bump over the gracile nucleus (lower body).",
        },
        "cuneate-tubercle": {
            "ellipse": [592, 936, 21, 47, -8], "tissue": "grey", "approx": False, "clip_out": ["gracile-tubercle", "fourth-ventricle"],
            "src": [L7D + ": 'Cuneate tubercles' outline", L7S],
            "note": "Lateral to the gracile tubercle: the bump over the cuneate nucleus (upper body).",
        },
        "_fibres": {
            "trochlear-nerve": {
                "paths": [[[508, 505], [540, 511], [575, 520], [620, 526], [680, 530], [735, 530]]],
                "approx": False, "src": [L7S + " ('Trochlear N.')", L8S],
                "note": "The only nerve leaving the dorsal brainstem, just below the inferior colliculi; it wraps around the cerebral peduncle.",
            },
        },
    },
})
