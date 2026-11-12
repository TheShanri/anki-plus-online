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
        "medial-longitudinal-fasciculus": {
            "pts": [[504, 132], [522, 130], [536, 138], [538, 156], [530, 170], [514, 174], [505, 166]],
            "tissue": "white", "clip_out": ["fourth-ventricle"],
            "src": [KEY + ", Fig. 49", L8, COU + ", plate 20 (mlf)"],
            "note": "Not outlined on the course overlay: beside the midline under the floor of the fourth ventricle.",
        },
    },
    "pons-caudal": {
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
        "lateral-corticospinal-tract": {
            "pts": [[712, 250], [750, 232], [800, 240], [830, 268], [836, 310], [815, 345], [775, 356], [735, 346], [712, 310]],
            "tissue": "white", "clip_out": ["dorsal-spinocerebellar-tract", "anterolateral-spinothalamic-tract"],
            "src": [COU + ", plate 45 (lcs)", STD],
            "note": "Not outlined on the course overlay: the dorsal part of the lateral funiculus, medial to the dorsal spinocerebellar tract.",
        },
    },
}
