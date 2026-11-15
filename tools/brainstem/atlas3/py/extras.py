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
        # The grey matter H traced from the stain itself (the unstained, pale tissue: Weil stains myelin only), then cut into
        # the parts Lecture 4 / Lab 5 name: dorsal horn (with the substantia gelatinosa cap), intermediate zone (with the grey
        # commissure and the central canal) and ventral horn (with the course's limb and trunk motor pools).
        "_masks": {
            "grey": {
                "pts": [[500, 324], [540, 320], [575, 310], [605, 293], [622, 268], [628, 240], [630, 205], [650, 188], [678, 172], [688, 140],
                        [692, 100], [712, 88], [742, 98], [746, 150], [746, 200], [748, 242], [734, 262], [708, 282], [700, 300], [724, 318],
                        [790, 332], [852, 348], [884, 374], [874, 410], [832, 432], [782, 452], [732, 472], [672, 490], [618, 492], [584, 478],
                        [570, 442], [574, 396], [566, 368], [500, 356]],
                "pale": 0.55, "blur": 1.6, "open": 5, "close": 25, "soften": 3.0,
            },
        },
        "dorsal-horn": {
            "from": "grey", "pts_cut": [[560, 60], [800, 60], [800, 306], [560, 306]],
            "tissue": "grey", "approx": False,
            "cut_from": ["fasciculus-cuneatus", "fasciculus-gracilis"],
            "src": ["the section itself (unstained grey matter, traced)", "Lecture 4 slides 30-31 (course: dorsal horn, intermediate zone, ventral horn)", "Lab 5 (course)", COU + ", plate 45"],
            "note": "The posterior grey column, traced from the pale (unmyelinated) tissue of the section. Its apex reaches the dorsolateral sulcus, where the dorsal roots enter (the dorsal root entry zone, Lecture 4).",
        },
        "substantia-gelatinosa": {
            "pts": [[626, 188], [748, 188], [748, 266], [626, 266]], "pale": 0.3, "blur": 1.4, "open": 5, "close": 9, "soften": 2.5, "sub": True,
            "tissue": "grey", "approx": False, "within": ["dorsal-horn"],
            "src": ["the section itself (the palest, cell-dense cap of the dorsal horn)", "Lab 5 and Lecture 4 (course: substantia gelatinosa)", COU + ", plate 45 (SGe)"],
            "note": "The pale cap of the dorsal horn (lamina II), where pain and temperature fibres synapse. At this upper cervical level it runs on rostrally as the caudal part of the spinal trigeminal nucleus.",
        },
        "intermediate-zone": {
            "from": "grey", "pts_cut": [[500, 300], [800, 300], [880, 330], [880, 338], [700, 350], [585, 356], [576, 374], [500, 374]],
            "tissue": "grey", "approx": False, "midline": True,
            "cut_from": ["fasciculus-cuneatus", "fasciculus-gracilis"],
            "src": ["the section itself (unstained grey matter, traced)", "Lecture 4 slides 30-31 (course: intermediate zone between the horns)", COU + ", plate 45"],
            "note": "The grey matter between the dorsal and ventral horns, joined across the midline by the grey commissure around the central canal. (The lateral horn of the intermediate zone exists only from T1 to L2, not at this cervical level.)",
        },
        "central-canal": {
            "ellipse": [500, 341, 4.5, 4, 0], "tissue": "space", "midline": True,
            "src": ["Lecture 7 slide 9 (course: the central canal continues the fourth ventricle below the obex)", "Lecture 1 (course)", STD],
            "note": "In the middle of the grey commissure. Usually obliterated in adult sections, as here, so its place is marked rather than traced.",
        },
        "ventral-horn": {
            "from": "grey", "pts_cut": [[577, 374], [586, 357], [700, 350], [880, 338], [900, 338], [900, 520], [577, 520]],
            "tissue": "grey", "approx": False,
            "src": ["the section itself (unstained grey matter, traced)", "Lecture 4 slides 30-31 (course: ventral horn)", "Lab 5 (course)", COU + ", plate 45"],
            "note": "The anterior grey column, traced from the pale tissue of the section: the lower motor neurons of the neck and upper limb (the course's limb and trunk pools are inside it).",
        },
        "ventral-commissure-of-spinal-cord": {
            "pts": [[500, 351], [520, 351], [545, 354], [568, 360], [566, 368], [540, 366], [515, 364], [500, 364]], "midline": True,
            "tissue": "white", "approx": False, "clip_out": ["intermediate-zone", "ventral-horn"],
            "src": ["the section itself (the thin dark band below the grey commissure)", "Lab 5 (course: ventral commissure)", "Lecture 5 (course: spinothalamic fibres cross here)", COU + ", plate 45"],
            "note": "The thin white band between the grey commissure and the anterior median fissure, where the spinothalamic (anterolateral) fibres cross.",
        },
        "dorsal-columns": {
            "from": ["fasciculus-gracilis", "fasciculus-cuneatus"], "tissue": "zone", "approx": False,
            "anchor_out": ["fasciculus-gracilis", "fasciculus-cuneatus"],
            "src": ["Lecture 4 slide 30 (course: the dorsal, lateral and ventral funiculi)", "Lab 5 (course: dorsal columns)", STD],
            "note": "The posterior funiculus: fasciculus gracilis (medial, lower body) and fasciculus cuneatus (lateral, upper body), both hoverable inside.",
        },
        "lateral-funiculus": {
            "pts": [[722, 92], [770, 132], [830, 166], [890, 210], [940, 262], [975, 322], [995, 385], [985, 440], [955, 488], [905, 525],
                    [855, 548], [805, 560], [790, 530], [772, 490], [752, 452], [740, 426], [700, 420], [640, 360], [640, 300], [662, 262],
                    [700, 236], [716, 180], [714, 120]],
            "tissue": "white", "approx": False,
            "clip_out": ["dorsal-horn", "ventral-horn", "intermediate-zone", "substantia-gelatinosa", "fasciculus-cuneatus", "fasciculus-gracilis"],
            "anchor_out": ["dorsal-spinocerebellar-tract", "anterolateral-spinothalamic-tract", "lateral-corticospinal-tract"],
            "src": ["Lab 10 slide 21 (course)", "Unit 2 online lab assignment slide 17 (course)", COU + ", plate 45", STD],
            "note": "The white matter between the dorsal root entry zone and the ventral root exit zone; it holds the dorsal spinocerebellar, lateral corticospinal and anterolateral tracts (hover them on top).",
        },
        "anterior-funiculus": {
            "pts": [[502, 352], [545, 356], [588, 372], [590, 400], [592, 433], [603, 461], [633, 467], [660, 462], [687, 443], [720, 429],
                    [740, 426], [752, 452], [772, 490], [790, 530], [805, 560], [760, 600], [502, 600]],
            "tissue": "white", "approx": False, "clip_out": ["ventral-horn", "intermediate-zone", "central-canal", "lateral-funiculus"],
            "anchor_out": ["anterior-corticospinal-tract", "anterolateral-spinothalamic-tract", "ventral-commissure-of-spinal-cord"],
            "src": ["Lab 10 slides 21-22 (course)", "Unit 2 online lab assignment slide 17 (course)", COU + ", plate 45", STD],
            "note": "The white matter between the anterior median fissure and the ventral root exit zone; the anterior corticospinal tract runs along its medial edge.",
        },
        "location-of-limb-lower-motor-neurons": {
            "from": "ventral-horn", "pts_cut": [[712, 330], [900, 330], [900, 520], [700, 520], [694, 440], [700, 380]],
            "tissue": "grey", "sub": True,
            "src": ["Lab 10 slide 22 and its answer key (course: the limb motor neuron pool, lateral ventral horn)", "Lecture 10 slide 24 (course)", STD],
            "note": "Lower motor neurons for the limbs lie in the lateral part of the ventral horn (the course's Lab 10 drawing); not visible as such in a myelin stain.",
        },
        "location-of-trunk-lower-motor-neurons": {
            "from": "ventral-horn", "pts_cut": [[540, 340], [652, 340], [660, 400], [654, 520], [540, 520]],
            "tissue": "grey", "sub": True,
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


# The ventral regions below the midbrain were authored on the photo before surface_canon.py straightened the bent
# specimen: carry them through the same row shift (x_new = x_old - shift(y)); points on the midline seam stay put.
def _carry_straightening(level, keys):
    import json as _json, os as _os
    from paths import BASE as _B
    f = f"{_B}/levels/{level}/canon.json"
    if not _os.path.exists(f):
        return
    sh = _json.load(open(f)).get("shift") or [0]

    def s_at(y):
        i = max(0.0, min(len(sh) - 1.0, y / 10.0))
        a = int(i)
        b = min(a + 1, len(sh) - 1)
        return sh[a] + (sh[b] - sh[a]) * (i - a)

    def tf(p):
        x, y = p
        return [x if x <= 505 else round(x - s_at(y), 1), y]

    lv = EXTRAS[level]
    for k in keys:
        e = lv[k]
        if "pts" in e:
            e["pts"] = [tf(p) for p in e["pts"]]
        if "ellipse" in e:
            cx, cy = e["ellipse"][:2]
            e["ellipse"][0] = tf([cx, cy])[0]
    for k, e in lv.get("_fibres", {}).items():
        e["paths"] = [[tf(p) for p in path] for path in e["paths"]]


_carry_straightening("external-anterior", ["pons", "medulla", "transverse-fibers-of-the-pons", "middle-cerebellar-peduncle", "trigeminal-nerve",
                                           "abducens-nerve", "facial-nerve", "vestibulocochlear-nerve", "pyramids", "olives", "hypoglossal-nerve",
                                           "glossopharyngeal-nerve", "vagus-nerve", "motor-decussation"])
# the midbrain level, re-read on the straightened photo (Lab 7 'Landmarks of Ventral Midbrain' marks carried over)
EXTRAS["external-anterior"].update({
    "midbrain": {**EXTRAS["external-anterior"]["midbrain"], "pts": [[500, 236], [600, 224], [690, 238], [765, 296], [800, 360], [796, 412], [740, 444], [640, 446], [560, 432], [500, 405]]},
    "cerebral-peduncles": {**EXTRAS["external-anterior"]["cerebral-peduncles"],
                           "pts": [[526, 332], [556, 266], [618, 228], [690, 240], [760, 298], [795, 358], [790, 408], [742, 438], [680, 448], [610, 442], [560, 428], [532, 400]]},
    "oculomotor-nerve": {**EXTRAS["external-anterior"]["oculomotor-nerve"],
                         "pts": [[575, 270], [615, 262], [655, 275], [672, 310], [668, 350], [650, 372], [610, 378], [580, 362], [568, 320]]},
    "interpeduncular-fossa": {**EXTRAS["external-anterior"]["interpeduncular-fossa"], "pts": [[500, 322], [528, 330], [520, 385], [500, 420]]},
    "interpeduncular-cistern": {**EXTRAS["external-anterior"]["interpeduncular-cistern"], "pts": [[500, 300], [548, 305], [546, 360], [526, 410], [500, 440]]},
    "mammillary-bodies": {"ellipse": [537, 293, 28, 25, 0], "tissue": "grey", "approx": False, "src": [L7V, L8S],
                          "note": "The paired bumps behind the infundibulum (hypothalamus), in front of the interpeduncular fossa."},
    "pituitary-stalk": {"ellipse": [500, 226, 26, 18, 0], "midline": True, "tissue": "grey", "src": [L8S + " ('Infundibulum')", "Lab 2 (course)"],
                        "note": "The cut stalk of the pituitary (infundibulum), between the optic chiasm and the mammillary bodies."},
    "optic-chiasm": {"pts": [[500, 176], [548, 178], [552, 214], [500, 210]], "midline": True, "tissue": "white", "src": [L8S, "Lab 7 (course)"],
                     "note": "Where the optic nerves cross, in front of the infundibulum (diencephalon)."},
    "optic-tract": {"pts": [[548, 184], [606, 186], [666, 210], [726, 246], [776, 288], [762, 304], [704, 270], [644, 240], [586, 222], [552, 214]],
                    "tissue": "white", "src": [L8S, "Lab 7 (course)"], "note": "From the chiasm back around the cerebral peduncle (diencephalon)."},
})
for _k in ("transverse-fibers-of-the-pons", "pons"):
    EXTRAS["external-anterior"][_k]["pts"][0] = [500, 404]
EXTRAS["external-anterior"]["oculomotor-nerve"]["approx"] = False
EXTRAS["external-anterior"]["cerebral-peduncles"]["clip_out"] = ["oculomotor-nerve"]
EXTRAS["external-anterior"]["cerebral-peduncles"]["anchor_out"] = ["oculomotor-nerve"]

# Drawing lines without a structure of their own (mirrored unless "mid"): sulci, striations, grooves.
EXTRAS["external-anterior"]["_detail"] = (
    [{"pts": [[500, 404], [500, 600], [500, 792]], "mid": True},  # basilar sulcus of the pons
     {"pts": [[500, 798], [500, 1000], [500, 1230]], "mid": True},  # anterior median fissure
     {"pts": [[586, 800], [585, 880], [588, 958]]},  # preolivary sulcus (XII)
     {"pts": [[631, 806], [636, 880], [626, 956]]},  # postolivary sulcus (IX, X)
     {"pts": [[505, 797], [560, 795], [600, 797], [640, 791], [690, 774]]}]  # pontomedullary junction
    + [{"pts": [[505, y], [560, y + 4], [622, y + 2], [672, y - 8]], "k": "fine"} for y in range(428, 780, 24)]  # transverse striations
    + [{"pts": p, "k": "fine"} for p in ([[548, 410], [620, 330], [700, 262]], [[580, 430], [660, 350], [740, 290]], [[620, 442], [700, 372], [775, 332]])]
)
EXTRAS["external-posterior"]["_detail"] = (
    [{"pts": [[500, 650], [500, 800], [500, 934]], "mid": True},  # median sulcus of the fourth ventricle floor
     {"pts": [[500, 952], [500, 1100], [500, 1250]], "mid": True},  # posterior median sulcus
     {"pts": [[500, 352], [500, 430], [500, 505]], "mid": True},  # between the colliculi
     {"pts": [[505, 437], [560, 441], [606, 432]]},  # between superior and inferior colliculus
     {"pts": [[522, 662], [548, 702], [560, 762], [552, 822], [530, 882], [510, 926]], "k": "fine"},  # sulcus limitans
     {"pts": [[505, 796], [540, 793], [575, 801], [592, 808]], "k": "fine"},  # striae medullares
     {"pts": [[505, 809], [545, 807], [586, 816]], "k": "fine"},
     {"pts": [[570, 975], [566, 1060], [560, 1150], [556, 1240]], "k": "fine"}]  # posterior intermediate sulcus
)


# ---------------------------------------------------------------------------------------------------------------------
# Atlas resolution, round 3 (2026-11-14, owner: "more resolution and specific highlights"): real shapes traced from the
# stain (substantia nigra and its two parts, the cord's grey matter, the central grey), fibre systems as fine bundles that
# follow the stain, and the grey/white architecture each level needs (central canal, central grey, reticular formation,
# PPRF). Course wins over the open atlases; parts not visible in a myelin stain are marked approximate.
L4 = "Lecture 4 slides 30-31 (course: dorsal horn, intermediate zone, ventral horn; dorsal, lateral and ventral funiculi)"
L7 = "Lecture 7 slide 9 (course: fourth ventricle, central canal)"
L8_9 = "Lab 8 slide 9 (course: 'axons sweeping down and across the midline from the gracile and cuneate nuclei ... internal arcuate fibers')"
L9_7 = "Lab 9 slide 7 (course: the internal arcuate fibers sweep ventrally and cross the midline to a space just above the pyramid)"
L10_15 = "Lab 10 slide 15 (course: 'In the reticular formation is an ill-defined nucleus called Nucleus Ambiguus')"
L10P = "Lecture 10 slide 22 (course: pyramidal decussation, 80% of corticospinal fibres cross to form the lateral corticospinal tract)"
L11 = "Lab 11 slide 4 (course: the lateral gaze center = the nucleus of the MLF = the PPRF)"
L14 = "Lecture 14 slides 28-29 (course: substantia nigra pars compacta, dopamine to the striatum)"
U3 = "Unit 3 lab assignment answer key (course: 'divided into two parts: the pars compacta (SNc) and the pars reticulata (SNr)')"
TRACED = "the section itself (traced from the stain)"


def _bundle(inner, outer, n, jitter=1.6, seed=0):
    """n fine fibre courses between two guide curves (same direction): each one interpolated between the guides at an even
    spacing, with a little deterministic waviness so the bundle reads as fibres, not as hatching."""
    import numpy as _np

    def norm(c, k):
        c = _np.asarray(c, float)
        seg = _np.sqrt(((c[1:] - c[:-1]) ** 2).sum(1))
        L = _np.concatenate([[0], _np.cumsum(seg)])
        t = _np.linspace(0, L[-1], k)
        return _np.stack([_np.interp(t, L, c[:, 0]), _np.interp(t, L, c[:, 1])], 1)

    k = 24
    a, b = norm(inner, k), norm(outer, k)
    rng = _np.random.default_rng(seed)
    out = []
    for i in range(n):
        t = i / max(1, n - 1)
        p = a * (1 - t) + b * t
        ph = rng.uniform(0, 6.28)
        w = _np.sin(_np.linspace(0, 3.2, k) + ph) * jitter
        d = _np.gradient(p, axis=0)
        nrm = _np.stack([-d[:, 1], d[:, 0]], 1) / (_np.linalg.norm(d, axis=1, keepdims=True) + 1e-6)
        q = p + nrm * w[:, None]
        q[0], q[-1] = p[0], p[-1]
        out.append([[round(float(x), 1), round(float(y), 1)] for x, y in q[::2].tolist() + [q[-1].tolist()]])
    return out


# --- rostral midbrain: the substantia nigra traced, with its two parts -----------------------------------------------
_SN_NOTE = ("The pale band between the cerebral peduncle and the tegmentum (Lecture 14 / Lab 14), traced from the stain. "
            "Its dopaminergic neurons (pars compacta) degenerate in Parkinson's disease.")
EXTRAS["midbrain-sc"].setdefault("_skip", []).append("substantia-nigra")
EXTRAS["midbrain-sc"].update({
    "substantia-nigra": {
        "pts": [[572, 604], [566, 560], [596, 528], [646, 492], [698, 452], [748, 408], [788, 366], [822, 356], [834, 392], [806, 436],
                [762, 486], [704, 536], [646, 572], [604, 600]],
        "pale": 0.42, "blur": 1.6, "open": 7, "close": 17, "tissue": "grey", "approx": False,
        "clip_out": ["cerebral-peduncles", "red-nucleus", "interpeduncular-fossa", "medial-lemniscus"],
        "src": [TRACED, "course overlay (position)", KEY + ", Fig. 54", COU + ", plate 4 (SNC, SNR)"],
        "note": _SN_NOTE,
    },
    "substantia-nigra-pars-compacta": {
        "from": "substantia-nigra", "parent": "substantia-nigra",
        "pts_cut": [[560, 540], [600, 516], [650, 482], [700, 442], [750, 398], [792, 358], [830, 350], [826, 372], [790, 396], [750, 432],
                    [702, 474], [654, 510], [606, 540], [574, 560]],
        "tissue": "grey",
        "src": [U3, L14, KEY + ", Fig. 54", COU + ", plate 4 (SNC)"],
        "note": "The dorsal, cell-dense strip of the substantia nigra (dopaminergic, neuromelanin) next to the tegmentum. The border between the two parts is not visible in a myelin stain; drawn after the atlases.",
    },
    "substantia-nigra-pars-reticulata": {
        "from": "substantia-nigra", "parent": "substantia-nigra", "clip_out": ["substantia-nigra-pars-compacta"],
        "tissue": "grey",
        "src": [U3, KEY + ", Fig. 54", COU + ", plate 4 (SNR)"],
        "note": "The ventral, larger part of the substantia nigra next to the cerebral peduncle, whose fibres interdigitate with it (GABAergic output of the basal ganglia). The border with the pars compacta is drawn after the atlases.",
    },
})

# --- caudal midbrain: the substantia nigra traced; the decussation of the superior cerebellar peduncles as fibres -----
EXTRAS["midbrain-ic"].setdefault("_skip", []).append("substantia-nigra")
EXTRAS["midbrain-ic"].update({
    "substantia-nigra": {
        "pts": [[540, 560], [548, 520], [590, 488], [650, 462], [700, 440], [750, 414], [796, 402], [806, 430], [780, 466], [730, 500],
                [680, 530], [628, 560], [580, 584], [548, 586]],
        "pale": 0.42, "blur": 1.6, "open": 7, "close": 17, "tissue": "grey", "approx": False,
        "clip_out": ["cerebral-peduncles", "medial-lemniscus", "decussation-of-the-superior-cerebellar-peduncle", "pontine-nuclei"],
        "src": [TRACED, "course overlay (position)", KEY + ", Fig. 52", COU + ", plate 8 (SNC, SNR)"],
        "note": _SN_NOTE,
    },
    "substantia-nigra-pars-compacta": {
        "from": "substantia-nigra", "parent": "substantia-nigra",
        "pts_cut": [[530, 520], [580, 486], [640, 456], [700, 430], [760, 400], [810, 392], [812, 412], [770, 424], [716, 448], [656, 474],
                    [598, 500], [552, 530], [534, 548]],
        "tissue": "grey",
        "src": [U3, L14, KEY + ", Fig. 52", COU + ", plate 8 (SNC)"],
        "note": "The dorsal, cell-dense strip of the substantia nigra (dopaminergic) next to the medial lemniscus. The border between the two parts is not visible in a myelin stain; drawn after the atlases.",
    },
    "substantia-nigra-pars-reticulata": {
        "from": "substantia-nigra", "parent": "substantia-nigra", "clip_out": ["substantia-nigra-pars-compacta"],
        "tissue": "grey",
        "src": [U3, KEY + ", Fig. 52", COU + ", plate 8 (SNR)"],
        "note": "The ventral part of the substantia nigra, interdigitating with the cerebral peduncle. The border with the pars compacta is drawn after the atlases.",
    },
})
EXTRAS["midbrain-ic"].setdefault("_fibres", {}).update({
    "decussation-of-the-superior-cerebellar-peduncle": {
        "paths": _bundle([[702, 300], [662, 314], [612, 328], [560, 340], [500, 350], [445, 360]],
                         [[708, 424], [672, 446], [622, 470], [562, 486], [500, 492], [445, 492]], 9, 1.4, 11),
        "fine": True, "approx": False,
        "src": [TRACED + ": the oblique streaks entering from the dorsolateral tegmentum", KEY + ", Fig. 52", COU + ", plate 8 (xscp)"],
        "note": "Each superior cerebellar peduncle sweeps ventromedially and crosses the midline here, on its way to the opposite red nucleus and thalamus.",
    },
    "transverse-fibers-of-the-pons": {
        "paths": _bundle([[499, 774], [560, 766], [640, 764], [720, 756], [790, 736], [846, 716]],
                         [[499, 856], [580, 852], [650, 842], [720, 822], [790, 792], [840, 760]], 6, 1.2, 12),
        "fine": True, "approx": False,
        "src": [TRACED, KEY + ", Fig. 52", COU + ", plate 8 (tfp)"],
        "note": "The rostral end of the basis pontis: transverse fibres crossing to the middle cerebellar peduncle.",
    },
})

# --- rostral pons (trigeminal level): transverse fibres as fine bundles that follow the stain; reticular formation -----
_TFP_NOTE = ("Pontocerebellar fibres: from the pontine nuclei they cross the midline and run laterally, around the longitudinal "
             "(corticospinal and corticobulbar) bundles, into the opposite middle cerebellar peduncle.")
EXTRAS["pons-mid"].update({
    "_skip_fibres": ["transverse-fibers-of-the-pons"],
    "reticular-formation": {
        "pts": [[503, 180], [540, 176], [600, 170], [650, 176], [690, 196], [700, 230], [690, 262], [660, 280], [600, 286], [540, 286], [503, 286]],
        "tissue": "zone", "midline": True,
        "clip_out": ["medial-longitudinal-fasciculus", "medial-lemniscus", "anterolateral-spinothalamic-tract", "motor-trigeminal-nucleus",
                     "principal-sensory-nucleus-of-trigeminal", "superior-cerebellar-peduncle", "fourth-ventricle", "pontine-protuberance"],
        "src": ["Lectures 10-11 (course: the reticular formation of the tegmentum)", KEY + ", Fig. 49", COU + ", plate 20"],
        "note": "The tegmentum's core between the named nuclei and tracts: a diffuse net of neurons with no sharp borders (shown only when lit).",
    },
    "_fibres": {
        "transverse-fibers-of-the-pons": {
            "paths": _bundle([[499, 300], [560, 296], [620, 292], [665, 292], [695, 300], [714, 312]],
                             [[499, 352], [560, 350], [615, 346], [652, 340], [688, 330], [714, 330]], 6, 1.4, 21)
                     + _bundle([[499, 386], [540, 380], [580, 392], [622, 380], [662, 372], [700, 364]],
                               [[499, 446], [532, 452], [576, 470], [628, 452], [664, 420], [700, 388]], 3, 1.0, 22)
                     + _bundle([[499, 502], [560, 502], [612, 490], [646, 462], [668, 422], [684, 382], [704, 350]],
                               [[499, 538], [570, 540], [630, 522], [672, 490], [700, 450], [712, 410], [720, 378]], 9, 1.4, 23),
            "fine": True, "approx": False,
            "src": [TRACED + ": the dark transverse streaks of the basilar pons", "course overlay (dotted transverse fibres)", "Lab 7 (course: 'lateral striations = transverse fibers of the pons')", KEY + ", Fig. 49", COU + ", plate 20"],
            "note": _TFP_NOTE,
        },
    },
})

# --- caudal pons (facial colliculus level): transverse fibres, the PPRF (Lab 11), reticular formation ------------------
EXTRAS["pons-caudal"].update({
    "_skip_fibres": ["transverse-fibers-of-the-pons"],
    "paramedian-pontine-reticular-formation": {
        "ellipse": [548, 334, 21, 26, -10], "tissue": "grey",
        "clip_out": ["medial-longitudinal-fasciculus", "abducens-nucleus", "medial-lemniscus"],
        "src": [L11, "Lab 11 list: ID on histological images (course)", KEY + ", Fig. 48", STD],
        "note": "The lateral gaze center (the nucleus of the MLF, the PPRF; the course uses the terms synonymously): paramedian tegmentum, ventral to the abducens nucleus beside the MLF. Not visible in a myelin stain.",
    },
    "reticular-formation": {
        "pts": [[503, 320], [530, 318], [580, 296], [630, 296], [680, 316], [704, 350], [690, 372], [640, 372], [600, 366], [560, 366], [503, 368]],
        "tissue": "zone", "midline": True,
        "clip_out": ["medial-longitudinal-fasciculus", "abducens-nucleus", "facial-nucleus", "medial-lemniscus", "anterolateral-spinothalamic-tract",
                     "spinal-trigeminal-nucleus", "vestibulocochlear-complex", "paramedian-pontine-reticular-formation", "fourth-ventricle", "facial-colliculus"],
        "src": ["Lectures 10-11 (course: the reticular formation of the tegmentum)", KEY + ", Fig. 48", COU + ", plate 24"],
        "note": "The tegmentum's core between the named nuclei and tracts: a diffuse net of neurons with no sharp borders (shown only when lit); the PPRF is its paramedian part.",
    },
    "_fibres": {
        "transverse-fibers-of-the-pons": {
            "paths": _bundle([[499, 462], [560, 458], [620, 456], [680, 456], [722, 450], [750, 438]],
                             [[499, 524], [560, 524], [620, 518], [680, 506], [724, 482], [752, 466]], 6, 1.4, 31)
                     + _bundle([[499, 668], [560, 676], [620, 668], [668, 640], [694, 600], [712, 560], [730, 522], [752, 500]],
                               [[499, 708], [570, 712], [640, 698], [690, 668], [718, 628], [736, 585], [754, 550]], 9, 1.4, 32),
            "fine": True, "approx": False,
            "src": [TRACED + ": the transverse streaks dorsal and ventral to the longitudinal bundle", "course overlay (dotted transverse fibres)", KEY + ", Fig. 48", COU + ", plate 24"],
            "note": _TFP_NOTE,
        },
    },
})

# --- rostral medulla (olive level): reticular formation (the course places nucleus ambiguus in it) --------------------
EXTRAS["medulla-rostral"].update({
    "reticular-formation": {
        "pts": [[503, 360], [540, 350], [600, 330], [660, 320], [720, 330], [745, 372], [760, 420], [770, 470], [740, 500], [690, 486],
                [640, 470], [590, 440], [550, 420], [503, 420]],
        "tissue": "zone", "midline": True,
        "clip_out": ["medial-longitudinal-fasciculus", "medial-lemniscus", "hypoglossal-nucleus", "dorsal-motor-nucleus-of-the-vagus", "solitary-nucleus",
                     "spinal-trigeminal-nucleus", "nucleus-ambiguus", "inferior-olivary-nucleus", "anterolateral-spinothalamic-tract",
                     "dorsal-spinocerebellar-tract", "inferior-cerebellar-peduncle", "vestibulocochlear-complex", "fourth-ventricle", "pyramids"],
        "src": [L10_15, "Lectures 10-11 (course)", KEY + ", Fig. 44", COU + ", plates 28-29"],
        "note": "The tegmentum's core between the named nuclei and tracts, dorsal to the inferior olive; the course places nucleus ambiguus in it (shown only when lit).",
    },
})

# --- caudal medulla (tubercles): internal arcuate fibres as fine bundles; central grey and canal ---------------------
EXTRAS["medulla-mid"].update({
    "_skip_fibres": ["internal-arcuate-fibers"],
    "central-gray": {
        "pts": [[503, 160], [530, 166], [556, 190], [574, 230], [580, 280], [574, 330], [556, 360], [530, 372], [503, 374]],
        "pale": 0.5, "blur": 2.0, "open": 7, "close": 19, "tissue": "grey", "midline": True, "approx": False,
        "clip_out": ["gracile-nucleus", "cuneate-nucleus", "medial-lemniscus", "fasciculus-cuneatus"],
        "src": [TRACED, L7, KEY + ", Fig. 41", COU + ", plate 38"],
        "note": "The grey matter around the central canal of the closed medulla, continuous with the cord's intermediate grey. The hypoglossal and dorsal vagal nuclei and the solitary nucleus sit in it (hover them on top).",
    },
    "central-canal": {
        "ellipse": [500, 246, 5, 5, 0], "tissue": "space", "midline": True,
        "src": [L7, KEY + ", Fig. 41", STD],
        "note": "The closed medulla has a central canal instead of the fourth ventricle (Lecture 7); it is collapsed in this section, so its place is marked.",
    },
    "_fibres": {
        "internal-arcuate-fibers": {
            "paths": _bundle([[548, 212], [570, 246], [584, 300], [578, 360], [550, 420], [500, 452], [474, 464], [466, 486]],
                             [[662, 328], [684, 370], [676, 428], [640, 476], [580, 506], [500, 526], [472, 534], [464, 560]], 13, 1.5, 41),
            "fine": True, "approx": False,
            "src": [TRACED + ": the dark arcs from the nuclei around the central grey to the raphe", L8_9, L9_7, "course overlay (arcuate lines)", KEY + ", Fig. 41"],
            "note": "Axons of the gracile and cuneate nuclei sweep ventrally and medially around the central grey, cross the midline (the sensory decussation) and turn 90 degrees to run up as the opposite medial lemniscus.",
        },
    },
})

# --- motor decussation: central grey, ventral horn, central canal; the pyramidal decussation as fibres ----------------
EXTRAS["medulla-caudal"].update({
    "central-gray": {
        "pts": [[503, 326], [540, 330], [572, 350], [584, 390], [572, 428], [546, 456], [503, 468]],
        "pale": 0.5, "blur": 2.0, "open": 7, "close": 21, "tissue": "grey", "midline": True, "approx": False,
        "clip_out": ["gracile-nucleus", "cuneate-nucleus", "motor-decussation", "fasciculus-gracilis"],
        "src": [TRACED, L7, KEY + ", Fig. 40", COU + ", plate 45"],
        "note": "The grey matter around the central canal, where the cord's grey commissure and intermediate zone continue into the medulla.",
    },
    "central-canal": {
        "ellipse": [500, 398, 5, 5, 0], "tissue": "space", "midline": True,
        "src": [L7, KEY + ", Fig. 40", STD],
        "note": "In the middle of the central grey; collapsed in this section, so its place is marked.",
    },
    "ventral-horn": {
        "pts": [[614, 530], [660, 522], [706, 530], [744, 566], [740, 640], [726, 694], [690, 694], [652, 650], [626, 600]],
        "pale": 0.6, "blur": 2.6, "open": 5, "close": 25, "tissue": "grey", "approx": False,
        "clip_out": ["pyramids", "anterolateral-spinothalamic-tract", "lateral-corticospinal-tract", "anterior-corticospinal-tract"],
        "src": [TRACED + ": the pale islands lateral to the decussating fibres", L4, KEY + ", Fig. 40 (ventral horn, spinal accessory nucleus)", COU + ", plate 45"],
        "note": "The cord's ventral horn, being cut off from the central grey by the crossing corticospinal fibres; the accessory nerve (XI) rootlets arise from it at this level.",
    },
})
EXTRAS["medulla-caudal"].setdefault("_fibres", {})["motor-decussation"] = {
    "paths": _bundle([[612, 612], [580, 580], [540, 540], [500, 512], [460, 490], [400, 468], [330, 458], [270, 462], [232, 470]],
                     [[590, 720], [565, 680], [535, 636], [500, 596], [462, 566], [410, 540], [340, 522], [280, 515], [240, 522]], 10, 2.0, 51),
    "fine": True, "approx": False,
    "src": [TRACED + ": the dark interlacing bundles between the central grey and the pyramids", "course overlay ('Pyramids/Motor Decussation')", L10P, KEY + ", Fig. 40"],
    "note": "About 80% of the corticospinal fibres leave the pyramid dorsally, cross the midline in interlacing bundles and run dorsolaterally into the opposite lateral funiculus as the lateral corticospinal tract.",
}


# Cord look (owner review 2026-11-15: "the grey H must be unmistakable"): the grey matter in a strong tone with one ink
# contour, the white funiculi light around it (as in the Lab 5 / Lecture 4 drawings), the motor pools as quiet sub-zones.
EXTRAS["cervicomedullary"]["_look"] = "cord"
EXTRAS["cervicomedullary"]["_edge"] = ["grey"]
EXTRAS["medulla-caudal"]["_look"] = "cord"
EXTRAS["medulla-caudal"]["_edge"] = ["central-gray", "ventral-horn", "spinal-trigeminal-nucleus", "gracile-nucleus", "cuneate-nucleus"]
EXTRAS["medulla-caudal"]["ventral-horn"]["soften"] = 4.0
EXTRAS["medulla-caudal"]["central-gray"]["soften"] = 3.0

# The H drawn as one smooth outline laid on the traced pale tissue (the raw trace is ragged at the neck and merges the
# substantia gelatinosa with its neighbours): slender dorsal horn with its apex at the dorsal root entry zone and the
# gelatinosa cap, intermediate zone and grey commissure, stout ventral horn. Checked against the photo half (fill check).
EXTRAS["cervicomedullary"]["_masks"]["grey"] = {
    "pts": [[500, 331], [540, 329], [575, 321], [600, 306], [618, 289], [632, 269], [640, 250], [634, 229], [645, 208], [668, 198],
            [690, 192], [694, 160], [697, 125], [701, 99], [722, 95], [728, 125], [729, 160], [733, 190], [742, 205], [745, 228],
            [735, 248], [712, 258], [700, 273], [694, 290], [698, 305], [714, 318], [742, 330], [790, 336], [830, 346], [854, 360],
            [862, 378], [852, 396], [826, 412], [790, 430], [750, 448], [712, 466], [672, 482], [630, 486], [598, 474], [584, 450],
            [582, 415], [586, 381], [570, 366], [540, 358], [500, 355]],
    "smooth": True, "soft": 2.5,
}
EXTRAS["cervicomedullary"]["substantia-gelatinosa"].update({
    "pts": [[641, 232], [649, 211], [669, 201], [694, 197], [722, 199], [739, 209], [741, 229], [730, 247], [708, 255], [670, 253], [647, 245]],
    "smooth": True, "soft": 2.5,
})
for _k in ("pale", "blur", "open", "close", "soften"):
    EXTRAS["cervicomedullary"]["substantia-gelatinosa"].pop(_k, None)

EXTRAS["cervicomedullary"]["intermediate-zone"]["pts_cut"] = [[500, 300], [722, 300], [722, 345], [585, 356], [576, 374], [500, 374]]
EXTRAS["cervicomedullary"]["ventral-horn"]["pts_cut"] = [[577, 374], [586, 357], [722, 345], [722, 300], [900, 300], [900, 520], [577, 520]]

EXTRAS["cervicomedullary"]["lateral-corticospinal-tract"]["clip_out"] = ["dorsal-spinocerebellar-tract", "anterolateral-spinothalamic-tract", "dorsal-horn", "substantia-gelatinosa", "intermediate-zone", "ventral-horn"]

# the motor-decussation ventral horn drawn as one smooth shape over the traced pale islands (the raw trace is ragged)
EXTRAS["medulla-caudal"]["ventral-horn"].update({
    "pts": [[628, 548], [660, 534], [700, 538], [728, 560], [736, 600], [728, 640], [712, 676], [690, 690], [664, 676], [646, 640], [632, 600]],
    "smooth": True, "soft": 2.5,
})
for _k in ("pale", "blur", "open", "close", "soften"):
    EXTRAS["medulla-caudal"]["ventral-horn"].pop(_k, None)
