# Which overlay shapes (indices in the slide's shape list, see ov_to_photo.py) stand for which structure.
# kind: "area" = closed outline; "fibres" = open dotted/solid paths (nerve rootlets, crossing fibres).
LEVELS = {
    "midbrain-sc": {
        "slide": 1, "flip": True,
        "area": {
            "red-nucleus": [2, 3], "interpeduncular-fossa": [4], "cerebral-peduncles": [5, 6],
            "oculomotor-nucleus": [7, 9], "edinger-westphal-nucleus": [8, 10], "cerebral-aqueduct": [14],
            "superior-colliculus": [17, 18], "periaqueductal-gray": [19], "substantia-nigra": [21, 22],
            "medial-lemniscus": [31], "anterolateral-spinothalamic-tract": [32],
        },
        "fibres": {"oculomotor-nerve": [23, 24, 25, 26, 27, 28]},
    },
    "midbrain-ic": {
        "slide": 2, "mirror_left_above": 300,
        "keep": [[[210, 85], [260, 62], [330, 58], [400, 68], [450, 56], [500, 46], [550, 56], [600, 68], [670, 58], [740, 62], [790, 85], [790, 300], [210, 300]]],
        "area": {
            "periaqueductal-gray": [1], "cerebral-peduncles": [2, 3], "substantia-nigra": [4, 5],
            "decussation-of-the-superior-cerebellar-peduncle": [6], "medial-lemniscus": [7, 8],
            "anterolateral-spinothalamic-tract": [10, 11], "trochlear-nucleus": [13, 14], "cerebral-aqueduct": [20],
            "inferior-colliculus": [23, 24],
        },
        "fibres": {"trochlear-nerve": [17, 18]},
    },
    "pons-mid": {
        "slide": 3,
        "area": {
            "fourth-ventricle": [2], "superior-cerebellar-peduncle": [3, 13], "motor-trigeminal-nucleus": [5, 6],
            "principal-sensory-nucleus-of-trigeminal": [9, 10], "middle-cerebellar-peduncle": [14, 15],
            "medial-lemniscus": [16, 17], "anterolateral-spinothalamic-tract": [18, 19],
            "longitudinal-fibers-of-the-pons": [34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45],
            "pontine-nuclei": [60, 61, 62, 63, 64, 65, 66],
        },
        "fibres": {"transverse-fibers-of-the-pons": [21, 22, 23, 24, 25, 26, 27, 28], "trigeminal-nerve": [76, 77, 78, 79, 80, 82, 83, 84, 85, 86]},
    },
    "pons-caudal": {
        "slide": 4, "bleed": True,
        "clip": [[0, 140], [60, 118], [130, 100], [200, 92], [255, 92], [300, 88], [380, 92], [425, 120], [440, 140], [500, 150], [560, 140], [580, 120], [620, 92], [700, 88], [750, 95], [800, 92], [870, 100], [940, 118], [1000, 140],
                 [1000, 430], [940, 470], [870, 520], [800, 560], [760, 600], [750, 780], [250, 780], [240, 565], [200, 555], [130, 520], [60, 470], [0, 420]],
        "area": {
            "fourth-ventricle": [2], "facial-colliculus": [3], "superior-cerebellar-peduncle": [6, 7],
            "middle-cerebellar-peduncle": [9, 10], "vestibulocochlear-complex": [11], "abducens-nucleus": [14, 17],
            "facial-nucleus": [18, 22], "medial-lemniscus": [31, 35], "anterolateral-spinothalamic-tract": [33, 36],
            "longitudinal-fibers-of-the-pons": [46, 47, 48, 49, 50, 51, 52, 53],
            "pontine-nuclei": [62, 63, 64, 65, 66, 67],
        },
        "fibres": {
            "facial-nerve": [21, 23], "vestibulocochlear-nerve": [25, 27], "abducens-nerve": [28, 29],
            "transverse-fibers-of-the-pons": [37, 38, 39, 40, 41, 42, 43, 44, 45],
        },
    },
    "medulla-rostral": {
        "slide": 5,
        "area": {
            "inferior-cerebellar-peduncle": [2, 3], "solitary-nucleus": [5, 35], "vestibulocochlear-complex": [7, 37],
            "dorsal-motor-nucleus-of-the-vagus": [11, 36], "hypoglossal-nucleus": [14, 34], "fourth-ventricle": [16],
            "inferior-olivary-nucleus": [18, 19], "pyramids": [20, 32], "medial-lemniscus": [21, 33],
            "anterolateral-spinothalamic-tract": [23, 38], "dorsal-spinocerebellar-tract": [25, 39],
        },
        "fibres": {"vagus-nerve": [26, 40], "glossopharyngeal-nerve": [27, 41], "hypoglossal-nerve": [30]},
    },
    "medulla-mid": {
        "slide": 6,
        "keep": [[[330, 42], [380, 45], [430, 55], [460, 68], [480, 84], [490, 90], [510, 88], [525, 70], [550, 52], [600, 42], [660, 40], [660, 300], [330, 300]]],
        "area": {
            "gracile-nucleus": [2, 19], "cuneate-nucleus": [3, 20], "fasciculus-cuneatus": [4, 21],
            "spinal-trigeminal-nucleus": [5, 22], "dorsal-spinocerebellar-tract": [6, 23],
            "anterolateral-spinothalamic-tract": [7, 24], "pyramids": [9], "medial-lemniscus": [17, 25],
        },
        "fibres": {"internal-arcuate-fibers": [10, 11, 12, 13, 14, 15]},
    },
    "medulla-caudal": {
        "slide": 7,
        "area": {
            "gracile-nucleus": [2, 11], "fasciculus-gracilis": [3, 12], "cuneate-nucleus": [4, 10],
            "fasciculus-cuneatus": [5, 13], "spinal-trigeminal-nucleus": [6, 14], "dorsal-spinocerebellar-tract": [7, 16],
            "anterolateral-spinothalamic-tract": [8, 15], "motor-decussation": [9],
        },
        "fibres": {},
    },
    "cervicomedullary": {
        "slide": 8,
        "area": {
            "fasciculus-gracilis": [2, 8], "fasciculus-cuneatus": [3, 9], "dorsal-spinocerebellar-tract": [4, 10],
            "anterolateral-spinothalamic-tract": [6, 11],
        },
        "fibres": {},
    },
}
