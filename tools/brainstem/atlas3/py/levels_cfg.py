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
        "keep": [[[190, 300], [186, 250], [190, 200], [200, 160], [218, 122], [242, 92], [272, 68], [305, 54], [340, 50], [375, 54], [410, 64], [445, 74], [475, 80], [500, 82], [525, 80], [555, 74], [590, 64], [625, 54], [660, 50], [695, 54], [728, 68], [758, 92], [782, 122], [800, 160], [810, 200], [814, 250], [810, 300], [810, 300], [190, 300]]],
        "clip": [[0, 931], [0, 420], [150, 380], [190, 300], [186, 250], [190, 200], [200, 160], [218, 122], [242, 92], [272, 68], [305, 54], [340, 50], [375, 54], [410, 64], [445, 74], [475, 80], [500, 82], [525, 80], [555, 74], [590, 64], [625, 54], [660, 50], [695, 54], [728, 68], [758, 92], [782, 122], [800, 160], [810, 200], [814, 250], [810, 300], [850, 380], [1000, 420], [1000, 931]],
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
        "erase": [[[440, 0], [590, 0], [590, 43], [560, 45], [530, 46], [500, 47], [470, 48], [440, 51]]],
        "keep": [[[440, 52], [470, 49], [500, 48], [530, 47], [560, 46], [590, 44], [590, 62], [440, 64]]],
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
        "clip": [[250, 780], [245, 640], [230, 590], [194, 565], [179, 559], [164, 549], [150, 536], [137, 519], [125, 499], [115, 476], [106, 451], [99, 424], [94, 395], [91, 365], [90, 335], [91, 305], [94, 275], [99, 246], [106, 219], [115, 194], [125, 171], [137, 151], [150, 134], [164, 121], [179, 111], [194, 105], [200, 104], [240, 94], [300, 88], [380, 92], [420, 120], [440, 140], [500, 150], [500, 150], [560, 140], [580, 120], [620, 92], [700, 88], [760, 94], [800, 104], [806, 105], [821, 111], [836, 121], [850, 134], [863, 151], [875, 171], [885, 194], [894, 219], [901, 246], [906, 275], [909, 305], [910, 335], [909, 365], [906, 395], [901, 424], [894, 451], [885, 476], [875, 499], [863, 519], [850, 536], [836, 549], [821, 559], [806, 565], [770, 590], [755, 640], [750, 780]],
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
        "clip": [[0, 884], [0, 440], [50, 420], [78, 395], [100, 340], [107, 270], [110, 200], [120, 140], [138, 95], [155, 78], [210, 55], [300, 0], [700, 0], [790, 55], [845, 78], [862, 95], [880, 140], [890, 200], [893, 270], [900, 340], [922, 395], [950, 420], [1000, 440], [1000, 884]],
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
