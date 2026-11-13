# Surface plates without a course photo to mirror: the midsagittal section and the lateral view. One-sided vector
# drawings (no left/right halves: every region is "M" and the plate says sym: false), authored in their own frame:
#  - midsagittal: the frame of the course's Lab 2 midsagittal photo (the brainstem crop, anterior to the left), with the
#    course's own midbrain / pons / medulla outlines on it; inner details after OpenStax A&P fig. 13.11 (CC BY, in the
#    course's Lab 2 deck), Sobotta 1909 fig. 648 (public domain) and the Lab 10 longitudinal-section slide.
#  - lateral: drawn after Sobotta 1909 fig. 661 (public domain), the course has no lateral brainstem image.
#   python surface_free.py [level ...]  -> src/data/brainstem-plates/<level>.json
import json, math, os, sys
import cv2
import numpy as np
from geom import SS, mask_paths, curve, raster, anchor, centroid, resample, smooth
from paths import REPO

SAG_P = "course Lab 2 midsagittal photo (brainstem outlined: midbrain, pons, medulla)"
OSX = "OpenStax Anatomy & Physiology fig. 13.11 (CC BY 4.0, in the course's Lab 2 deck)"
S648 = "Sobotta 1909 fig. 648 (public domain)"
L10L = "Lab 10 slide 26 (course: longitudinal section of the brainstem)"
S661 = "Sobotta 1909 fig. 661 (public domain)"
STD = "standard position"


def ell(cx, cy, rx, ry, rot=0, n=48):
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    return [[cx + rx * math.cos(a) * c - ry * math.sin(a) * s, cy + rx * math.cos(a) * s + ry * math.sin(a) * c] for a in np.linspace(0, 2 * math.pi, n, endpoint=False)]


FREE = {
    "midsagittal": {
        "W": 1000, "H": 800, "orient": "anterior left",
        "outline": [
            # brainstem
            [[212, 98], [260, 80], [330, 64], [395, 60], [432, 78], [458, 110], [466, 145], [472, 175], [462, 210], [450, 232], [452, 236],
             [480, 170], [520, 120], [600, 70], [700, 72], [790, 120], [850, 210], [868, 320], [850, 430], [805, 520], [740, 590], [660, 640],
             [580, 660], [520, 640], [484, 598], [474, 600], [482, 690], [490, 760], [350, 770], [338, 700], [318, 620], [295, 545], [280, 490],
             [210, 470], [165, 440], [135, 390], [122, 330], [128, 270], [150, 235], [200, 222], [212, 170], [210, 130]],
        ],
        "regions": {
            "midbrain": {"pts": [[150, 30], [520, 30], [470, 232], [150, 224]], "tissue": "landmark", "approx": False, "brainstem": True,
                         "anchor_out": ["cerebral-peduncles", "superior-colliculus", "inferior-colliculus", "cerebral-aqueduct"],
                         "src": [SAG_P, OSX], "note": "The course's own outline: the upper division of the brainstem, around the cerebral aqueduct."},
            "pons": {"pts": [[100, 224], [470, 232], [470, 472], [280, 492], [100, 482]], "tissue": "landmark", "approx": False, "brainstem": True,
                     "anchor_out": ["longitudinal-fibers-of-the-pons"],
                     "src": [SAG_P, OSX], "note": "The course's own outline: the middle division, its ventral part bulging forward."},
            "medulla": {"pts": [[100, 482], [280, 492], [470, 472], [520, 800], [100, 800]], "tissue": "landmark", "approx": False, "brainstem": True,
                        "anchor_out": ["pyramids", "inferior-olivary-nucleus"],
                        "src": [SAG_P, OSX], "note": "The course's own outline: the lowest division, continuous with the spinal cord."},
            "cerebellum": {"pts": [[452, 236], [480, 170], [520, 120], [600, 70], [700, 72], [790, 120], [850, 210], [868, 320], [850, 430], [805, 520],
                                   [740, 590], [660, 640], [580, 660], [520, 640], [484, 598], [470, 566], [478, 515], [490, 455], [504, 405], [522, 365],
                                   [538, 338], [512, 294], [480, 256]],
                           "tissue": "grey", "approx": False, "src": [SAG_P + " (and Lab 7's review photo)", S648],
                           "note": "Behind the pons and medulla, over the fourth ventricle (the arbor vitae shows in the cut)."},
            "fourth-ventricle": {"pts": [[446, 232], [478, 258], [510, 296], [534, 338], [518, 362], [498, 404], [484, 452], [474, 510], [466, 562], [456, 562],
                                         [448, 500], [441, 420], [438, 330]],
                                 "tissue": "space", "approx": False, "src": [OSX, S648, "Lab 2 ventricular system (course)"],
                                 "note": "Between the pons and upper medulla in front and the cerebellum behind; its tent-shaped roof points into the cerebellum."},
            "cerebral-aqueduct": {"pts": [[325, 64], [342, 64], [384, 104], [420, 154], [448, 214], [452, 234], [438, 236], [426, 214], [398, 162], [364, 116]],
                                  "tissue": "space", "approx": False, "src": [SAG_P + " (the channel in the midbrain)", OSX, S648],
                                  "note": "The narrow channel through the midbrain, from the third ventricle to the fourth."},
            "superior-colliculus": {"pts": [[398, 62], [430, 78], [455, 106], [462, 136], [440, 142], [412, 122], [394, 90]], "tissue": "grey",
                                    "clip_out": ["cerebral-aqueduct"], "src": [S648, OSX], "note": "The upper bump of the tectum, behind the aqueduct."},
            "inferior-colliculus": {"pts": [[462, 142], [472, 176], [462, 208], [450, 226], [434, 204], [440, 170], [440, 148]], "tissue": "grey",
                                    "clip_out": ["cerebral-aqueduct"], "src": [S648, OSX], "note": "The lower bump of the tectum, above the fourth ventricle."},
            "cerebral-peduncles": {"pts": [[210, 100], [262, 82], [300, 120], [302, 200], [262, 222], [204, 222], [212, 160]], "tissue": "white",
                                   "src": [OSX, S648], "note": "The ventral midbrain (the cortical efferent fibres), seen in the cut."},
            "mesencephalic-flexure": {"pts": [[216, 106], [262, 89], [330, 73], [393, 70], [394, 84], [332, 87], [266, 103], [222, 120]],
                                      "tissue": "landmark", "src": ["Lab 1 planes and Lab 2 brainstem lists (course)", STD],
                                      "note": "The bend of the neuraxis at the midbrain: above it the forebrain's axis runs front to back, below it the brainstem's runs top to bottom."},
            "longitudinal-fibers-of-the-pons": {"pts": [[215, 226], [262, 225], [292, 262], [306, 330], [306, 400], [300, 470], [286, 486], [262, 476],
                                                        [250, 400], [240, 330], [226, 272]],
                                                "tissue": "white", "approx": False, "src": [L10L, OSX],
                                                "note": "The corticospinal and corticobulbar fibres streaking down through the ventral pons, from the cerebral peduncle to the pyramid (the course's longitudinal section)."},
            "pyramids": {"pts": [[282, 490], [302, 486], [315, 560], [332, 650], [352, 762], [336, 764], [316, 652], [298, 566]], "tissue": "white",
                         "approx": False, "src": [L10L, OSX], "note": "Along the front of the medulla: the corticospinal fibres leaving the pons."},
            "inferior-olivary-nucleus": {"ellipse": [340, 575, 20, 58, -12], "tissue": "grey", "clip_out": ["pyramids"],
                                         "src": [L10L + " (the olive, dorsal and lateral to the pyramid)", S648],
                                         "note": "Cut just off the midline (the course's longitudinal section), the olive lies behind the pyramid in the upper medulla."},
        },
        "fibres": {},
    },
    "external-lateral": {
        "W": 760, "H": 1700, "x0": 0, "orient": "anterior left",
        "outline": [
            [[140, 470], [230, 420], [330, 380], [380, 330], [430, 290], [470, 296], [520, 288], [560, 330], [590, 400], [620, 450], [625, 500],
             [612, 540], [600, 600], [590, 700], [570, 800], [560, 900], [545, 1000], [530, 1100], [520, 1200], [505, 1300], [490, 1400],
             [470, 1500], [455, 1600], [440, 1642], [330, 1652], [300, 1600], [285, 1500], [270, 1400], [255, 1300], [240, 1200], [225, 1100],
             [215, 1050], [180, 1000], [140, 950], [110, 880], [95, 800], [100, 700], [120, 620], [150, 560], [140, 500]],
        ],
        "regions": {
            "pons": {"pts": [[95, 600], [240, 590], [350, 560], [400, 620], [330, 700], [290, 860], [260, 960], [220, 1030], [180, 1000], [130, 940],
                             [100, 850], [92, 750]], "tissue": "zone", "approx": False, "brainstem": True,
                     "src": [S661, "Lab 2 brainstem (course)"], "note": "The bulging ventral pons, here from the side."},
            "cerebral-peduncles": {"pts": [[140, 470], [230, 420], [330, 386], [362, 420], [348, 500], [300, 560], [240, 590], [160, 600], [140, 540]],
                                   "tissue": "white", "src": [S661, "Lab 7 (course)"], "note": "The cerebral peduncle on the side of the midbrain, emerging under the thalamus."},
            "superior-colliculus": {"pts": [[470, 300], [520, 290], [555, 320], [560, 370], [530, 395], [490, 380], [468, 340]], "tissue": "grey",
                                    "src": [S661], "note": "The upper bump of the tectum, at the back of the midbrain."},
            "inferior-colliculus": {"pts": [[502, 410], [545, 400], [580, 430], [585, 490], [560, 520], [520, 510], [500, 470]], "tissue": "grey",
                                    "src": [S661], "note": "The lower bump of the tectum, just above where the trochlear nerve leaves."},
            "brachium-of-the-inferior-colliculus": {"pts": [[502, 438], [470, 428], [420, 418], [384, 418], [384, 440], [430, 452], [480, 466], [504, 470]],
                                                    "tissue": "white", "clip_out": ["inferior-colliculus"], "src": [S661 + " (inferior quadrigeminal brachium)"],
                                                    "note": "From the inferior colliculus forward to the medial geniculate nucleus."},
            "medial-geniculate-nucleus": {"ellipse": [360, 425, 28, 22, 0], "tissue": "grey", "clip_out": ["cerebral-peduncles"],
                                          "src": [S661 + " (medial geniculate body)"], "note": "The small bump at the end of the brachium of the inferior colliculus."},
            "middle-cerebellar-peduncle": {"pts": [[300, 620], [380, 600], [420, 640], [410, 720], [380, 790], [330, 800], [280, 820], [262, 760], [272, 690]],
                                           "tissue": "white", "clip_out": ["trigeminal-nerve"], "src": [S661 + " (brachium of pons)"],
                                           "note": "The lateral pons sweeping back into the cut peduncles."},
            "superior-cerebellar-peduncle": {"pts": [[420, 790], [450, 700], [490, 620], [530, 560], [556, 572], [522, 650], [482, 742], [452, 806]],
                                             "tissue": "white", "src": [S661 + " (brachium conjunctivum)"], "note": "Along the upper edge of the cut peduncles, up to the inferior colliculus."},
            "inferior-cerebellar-peduncle": {"pts": [[420, 1000], [452, 960], [472, 1050], [472, 1150], [442, 1232], [412, 1200], [418, 1100]],
                                             "tissue": "white", "src": [S661 + " (restiform body)"], "note": "Up the back of the medulla into the cut peduncles."},
            "cerebellar-peduncles": {"ellipse": [362, 890, 82, 108, -18], "tissue": "white", "approx": False,
                                     "src": [S661 + " (the cut surface)", "Lab 7 'Cerebellar peduncles' (course)"],
                                     "note": "The cut surface left where the cerebellum was removed: the superior, middle and inferior cerebellar peduncles together."},
            "trigeminal-nerve": {"pts": [[200, 700], [240, 690], [280, 720], [300, 780], [280, 800], [240, 790], [210, 760]], "tissue": "nerve",
                                 "src": [S661], "note": "Its root on the side of the pons (motor and sensory parts)."},
            "vestibulocochlear-nerve": {"pts": [[250, 985], [285, 965], [312, 985], [286, 1010]], "tissue": "nerve", "src": [S661 + " (acoustic nerve)"],
                                        "note": "At the cerebellopontine angle, behind the facial nerve."},
            "facial-nerve": {"pts": [[222, 1022], [258, 1006], [280, 1030], [244, 1048]], "tissue": "nerve", "src": [S661],
                             "note": "At the cerebellopontine angle, in front of the vestibulocochlear nerve."},
            "olives": {"ellipse": [232, 1190, 28, 92, -4], "tissue": "grey", "src": [S661], "note": "The oval bulge on the side of the upper medulla."},
            "glossopharyngeal-nerve": {"pts": [[268, 1098], [310, 1093], [318, 1130], [276, 1135]], "tissue": "nerve", "src": [S661 + " (root filaments)"],
                                       "note": "Rootlets behind the olive, above the vagus."},
            "vagus-nerve": {"pts": [[270, 1140], [318, 1138], [322, 1200], [280, 1205]], "tissue": "nerve", "src": [S661 + " (root filaments)"],
                            "note": "Rootlets behind the olive, below the glossopharyngeal."},
            "pyramids": {"pts": [[212, 1056], [236, 1062], [248, 1200], [262, 1350], [278, 1500], [262, 1502], [244, 1350], [228, 1200], [204, 1066]],
                         "tissue": "white", "src": [S661], "note": "The front edge of the medulla, in front of the olive."},
            "cuneate-tubercle": {"ellipse": [452, 1480, 20, 70, 4], "tissue": "grey", "src": [S661], "note": "On the back of the lower medulla, lateral to the gracile tubercle."},
            "gracile-tubercle": {"ellipse": [490, 1410, 15, 60, 4], "tissue": "grey", "src": [S661 + " (clava)"], "note": "The clava, beside the obex on the back of the medulla."},
        },
        "fibres": {
            "trochlear-nerve": {"paths": [[[560, 540], [520, 560], [460, 580], [380, 600], [300, 612], [230, 612], [170, 602]]], "src": [S661],
                                "note": "Leaves the back of the midbrain below the inferior colliculus and wraps forward around the cerebral peduncle."},
            "hypoglossal-nerve": {"paths": [[[206, 1120], [198, 1200], [204, 1282]]], "src": [S661, STD], "note": "Rootlets in front of the olive (preolivary sulcus)."},
            "accessory-nerve": {"paths": [[[300, 1600], [306, 1450], [312, 1320], [322, 1230]]], "src": [S661 + " (root filaments of accessory nerve)"],
                                "note": "Spinal rootlets climbing beside the cord and medulla; not present on the course brainstems."},
        },
    },
}


def soft(pts, sigma=4.0):
    """an authored polygon as a smooth closed curve (resampled every 3 units, Gaussian-smoothed over ~3 sigma samples)"""
    return smooth(resample(pts, 3.0, True), sigma, True).tolist()


def build(level):
    cfg = FREE[level]
    W, H = cfg["W"], cfg["H"]
    shape = (int(round(H * SS)), int(round(W * SS)))
    out_m = raster([soft(p, 3.0) for p in cfg["outline"]], shape)
    regions, pending = [], {}
    for slug, e in cfg["regions"].items():
        pts = ell(*e["ellipse"]) if "ellipse" in e else soft(e["pts"], e.get("soft", 3.0))
        m = raster([pts], shape)
        if e["tissue"] not in ("landmark",) or e.get("brainstem"):
            m = m & out_m
        for o in e.get("clip_out", []):
            if o in pending:
                m = m & (1 - pending[o])
        pending[slug] = m
    for slug, e in cfg["regions"].items():
        m = pending[slug]
        am = m.copy()
        for o in e.get("anchor_out", []):
            if o in pending:
                am = am & (1 - pending[o])
        a, _ = anchor(am if am.sum() > 4 else m)
        regions.append({"id": f"{slug}-M", "slug": slug, "slugs": [slug], "side": "M", "tissue": e["tissue"], "d": mask_paths(m), "c": centroid(m), "a": a,
                        "src": e.get("src", []), **({"approx": True} if e.get("approx", True) else {}), **({"note": e["note"]} if e.get("note") else {})})
    fibres = []
    for slug, e in cfg["fibres"].items():
        for k, pts in enumerate(e["paths"]):
            fibres.append({"id": f"{slug}-M{k}", "slug": slug, "side": "R", "tissue": "nerve", "d": curve(pts, False, step=2.0, sigma=1.0, eps=0.25),
                           **({"approx": True} if e.get("approx", True) else {}), **({"note": e["note"]} if e.get("note") else {}), "src": e.get("src", [])})
    areas = {r["id"]: (lambda ys: max(ys) - min(ys))([float(v) for v in r["d"].replace("M", " ").replace("C", " ").replace("Z", " ").split()[1::2]]) for r in regions}
    plate = {"level": level, "viewBox": [0, 0, W, H], "mid": W / 2, "bleed": False, "sym": False, "view": "surface",
             "outline": mask_paths(out_m, step=2.0, sigma=1.5, eps=0.35, min_area=20), "bands": [],
             "regions": sorted(regions, key=lambda r: -areas[r["id"]]), "fibres": fibres,
             "sources": {"orient": cfg["orient"], "drawn": "one-sided vector drawing (no photo half)"}}
    json.dump(plate, open(f"{REPO}/src/data/brainstem-plates/{level}.json", "w"), separators=(",", ":"))
    print(level, len(regions), "regions", len(fibres), "fibres", os.path.getsize(f"{REPO}/src/data/brainstem-plates/{level}.json"), "bytes")


if __name__ == "__main__":
    for lv in (sys.argv[1:] or FREE.keys()):
        build(lv)
