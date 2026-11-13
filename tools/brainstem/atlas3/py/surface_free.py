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
        # frame: Sobotta 1909 fig. 648 (public domain), unit = (figure px - 330) * 1.4925, anterior to the left; the
        # divisions where the course's Lab 2 photo puts them (midbrain above the pons bulge, medulla below the bulge)
        "W": 1000, "H": 1050, "orient": "anterior left", "outline_soft": 5.0,
        "outline": [
            [[190, 118], [260, 112], [330, 112], [395, 114], [424, 138], [442, 188], [432, 236], [446, 282], [430, 330], [414, 372],
             # cerebellum (outer contour), joined to the brainstem through the medullary vela
             [440, 320], [480, 252], [560, 192], [640, 170], [705, 176], [765, 255], [830, 395], [900, 515], [932, 600], [912, 700], [852, 790],
             [762, 860], [662, 900], [562, 912], [478, 892], [424, 862], [408, 880],
             [404, 940], [396, 1000], [300, 1010], [250, 960], [214, 860], [184, 760], [165, 690], [122, 642], [86, 562], [70, 470], [80, 380],
             [110, 300], [150, 262], [174, 216], [188, 170]],
        ],
        "regions": {
            "midbrain": {"pts": [[150, 100], [440, 100], [452, 300], [414, 378], [150, 268]], "tissue": "landmark", "approx": False, "brainstem": True,
                         "anchor_out": ["cerebral-peduncles", "superior-colliculus", "inferior-colliculus", "cerebral-aqueduct"],
                         "src": [SAG_P, S648, OSX], "note": "The course's upper division of the brainstem, from the diencephalon to the top of the pons, around the cerebral aqueduct."},
            "pons": {"pts": [[150, 268], [414, 378], [404, 640], [165, 692], [50, 690], [50, 268]], "tissue": "landmark", "approx": False, "brainstem": True,
                     "anchor_out": ["longitudinal-fibers-of-the-pons", "pontine-protuberance"],
                     "src": [SAG_P, S648, OSX], "note": "The course's middle division: the ventral bulge (basilar pons) and the tegmentum behind it, under the upper fourth ventricle."},
            "medulla": {"pts": [[165, 692], [404, 640], [420, 1040], [150, 1040]], "tissue": "landmark", "approx": False, "brainstem": True,
                        "anchor_out": ["pyramids", "inferior-olivary-nucleus", "obex"],
                        "src": [SAG_P, S648, OSX], "note": "The course's lowest division, continuous with the spinal cord below the cut."},
            "pontine-protuberance": {"pts": [[152, 264], [210, 276], [262, 304], [300, 380], [306, 470], [298, 560], [262, 640], [176, 690], [122, 642], [86, 562],
                                             [70, 470], [80, 380], [110, 300]],
                                     "tissue": "zone", "approx": False, "src": [S648, "Lab 10 slide 11 (course)"],
                                     "note": "The basilar pons: the ventral bulge made by the pontine nuclei and the fibres through them."},
            "cerebellum": {"pts": [[440, 320], [480, 252], [560, 192], [640, 170], [705, 176], [765, 255], [830, 395], [900, 515], [932, 600], [912, 700],
                                   [852, 790], [762, 860], [662, 900], [562, 912], [478, 892], [424, 862], [418, 840], [436, 780], [462, 700], [490, 620],
                                   [532, 566], [490, 500], [456, 446], [430, 404], [416, 380]],
                           "tissue": "grey", "approx": False, "soft": 7.0, "src": [SAG_P + " (and Lab 7's review photo)", S648],
                           "note": "Behind the pons and medulla, over the fourth ventricle; the cut shows its folia and the white arbor vitae."},
            "fourth-ventricle": {"pts": [[406, 392], [420, 396], [456, 446], [490, 500], [532, 566], [490, 620], [462, 700], [436, 780], [418, 840], [406, 876],
                                         [401, 800], [399, 700], [399, 600], [401, 500]],
                                 "tissue": "space", "approx": False, "soft": 1.5, "src": [S648, OSX, "Lab 2 ventricular system (course)"],
                                 "note": "Tent-shaped: its floor is the back of the pons and upper medulla; its roof (the superior and inferior medullary vela) peaks at the fastigium in the cerebellum; it narrows to the obex."},
            "cerebral-aqueduct": {"pts": [[318, 114], [340, 112], [368, 168], [390, 238], [404, 308], [416, 380], [418, 398], [400, 400], [392, 382],
                                          [380, 314], [364, 248], [344, 178]],
                                  "tissue": "space", "approx": False, "soft": 1.0, "src": [S648, OSX, SAG_P],
                                  "note": "The narrow channel through the midbrain, from the third ventricle above to the fourth ventricle below."},
            "superior-colliculus": {"pts": [[350, 118], [395, 116], [424, 140], [442, 190], [434, 230], [384, 232], [362, 172]], "tissue": "grey",
                                    "clip_out": ["cerebral-aqueduct"], "src": [S648 + " (lamina quadrigemina)", OSX],
                                    "note": "The upper bump of the tectum, behind the aqueduct."},
            "inferior-colliculus": {"pts": [[384, 234], [434, 234], [446, 282], [430, 330], [414, 372], [398, 318]], "tissue": "grey",
                                    "clip_out": ["cerebral-aqueduct", "fourth-ventricle"], "src": [S648, OSX],
                                    "note": "The lower bump of the tectum, just above the fourth ventricle."},
            "cerebral-peduncles": {"pts": [[190, 120], [300, 116], [330, 160], [340, 230], [300, 290], [250, 290], [180, 262], [176, 216], [188, 170]],
                                   "tissue": "white", "clip_out": ["cerebral-aqueduct", "superior-colliculus", "inferior-colliculus"], "src": [S648 + " (cerebral peduncle)", OSX],
                                   "note": "The ventral midbrain (the cortical efferent fibres), in front of the tegmentum."},
            "mesencephalic-flexure": {"pts": [[192, 124], [262, 118], [330, 117], [394, 120], [394, 134], [330, 131], [262, 132], [196, 140]],
                                      "tissue": "landmark", "src": ["Lab 1 planes and Lab 2 brainstem lists (course)", STD],
                                      "note": "The bend of the neuraxis at the midbrain: above it the forebrain's axis runs front to back, below it the brainstem's runs top to bottom."},
            "longitudinal-fibers-of-the-pons": {"pts": [[200, 270], [252, 292], [282, 360], [290, 450], [280, 550], [252, 630], [206, 676], [182, 664], [222, 590],
                                                        [240, 500], [236, 400], [212, 320], [180, 284]],
                                                "tissue": "white", "approx": False, "src": [L10L, S648 + " (longitudinal fibers of pons)"],
                                                "note": "The corticospinal and corticobulbar fibres streaking down through the basilar pons, from the cerebral peduncle to the pyramid (the course's longitudinal section)."},
            "pyramids": {"pts": [[176, 690], [212, 684], [232, 760], [254, 860], [280, 960], [298, 1004], [262, 1002], [236, 930], [210, 840], [188, 760]],
                         "tissue": "white", "approx": False, "src": [L10L, S648], "note": "Along the front of the medulla: the corticospinal fibres leaving the pons."},
            "inferior-olivary-nucleus": {"ellipse": [262, 790, 24, 62, -14], "tissue": "grey", "clip_out": ["pyramids"],
                                         "src": [L10L + " (the olive, dorsal and lateral to the pyramid)", STD],
                                         "note": "Cut just off the midline (the course's longitudinal section), the olive lies behind the pyramid in the upper medulla."},
            "obex": {"ellipse": [404, 884, 8, 8, 0], "tissue": "landmark", "approx": False, "src": [S648 + " (calamus scriptorius)", STD],
                     "note": "The lower tip of the fourth ventricle, where it narrows into the central canal."},
        },
        "fibres": {},
        "detail": "sagittal",
    },
    "external-lateral": {
        "W": 760, "H": 1700, "x0": 0, "orient": "anterior left",
        "schematic": "Schematic after Sobotta 1909 (fig. 661): the course has no lateral brainstem image",
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


def branch(p0, p1, w0, w1):
    """a tapered branch as a closed polygon"""
    (x0, y0), (x1, y1) = p0, p1
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy) or 1
    nx, ny = -dy / L, dx / L
    pts = []
    for t in np.linspace(0, 1, 12):
        w = w0 + (w1 - w0) * t
        bend = 6 * math.sin(math.pi * t)
        pts.append([x0 + dx * t + nx * (w / 2 + bend), y0 + dy * t + ny * (w / 2 + bend)])
    for t in np.linspace(1, 0, 12):
        w = w0 + (w1 - w0) * t
        bend = 6 * math.sin(math.pi * t)
        pts.append([x0 + dx * t - nx * (w / 2 - bend), y0 + dy * t - ny * (w / 2 - bend)])
    return pts


def sagittal_detail(cfg):
    """the cerebellum's arbor vitae (white core, branches, twigs) and folia; pons striations; the central canal and the vela"""
    out = []
    root, hub = (536, 566), (610, 548)
    tips = [(560, 236), (650, 205), (742, 290), (820, 420), (880, 560), (872, 690), (790, 800), (680, 870), (566, 884), (486, 820)]
    polys = [branch(root, hub, 30, 26)]
    for tx, ty in tips:
        polys.append(branch(hub, (tx, ty), 22, 3))
        mx, my = hub[0] + (tx - hub[0]) * 0.55, hub[1] + (ty - hub[1]) * 0.55
        ang = math.atan2(ty - hub[1], tx - hub[0])
        for da in (-0.55, 0.55):
            L = 0.32 * math.hypot(tx - hub[0], ty - hub[1])
            polys.append(branch((mx, my), (mx + L * math.cos(ang + da), my + L * math.sin(ang + da)), 9, 2))
    shape = (int(round(cfg["H"] * SS)), int(round(cfg["W"] * SS)))
    cb = raster([soft(cfg["regions"]["cerebellum"]["pts"], 2.0)], shape)
    core = raster(polys, shape) & cb
    out.append({"d": mask_paths(core, step=1.6, sigma=0.9, eps=0.25, min_area=4), "k": "core"})
    # folia: short strokes from the surface toward the hub, every ~11 units along the outer contour
    ring = resample(soft(cfg["regions"]["cerebellum"]["pts"][:23], 2.0), 11.0, False)
    for i, (x, y) in enumerate(ring):
        if x < 470:
            continue
        vx, vy = hub[0] - x, hub[1] - y
        L = math.hypot(vx, vy) or 1
        ln = 26 + 14 * (i % 3)
        out.append({"d": curve([[x, y], [x + vx / L * ln, y + vy / L * ln]], False, step=2, sigma=0.5, eps=0.2), "k": "fine"})
    # transverse striations of the basilar pons and the central canal below the obex
    for y in range(300, 660, 26):
        out.append({"d": curve([[96 + abs(y - 470) * 0.18, y], [180, y + 6], [250, y + 2], [298 - abs(y - 470) * 0.22, y - 6]], False, step=3, sigma=1.2, eps=0.3), "k": "fine"})
    out.append({"d": curve([[404, 892], [400, 950], [395, 1004]], False, step=2, sigma=1, eps=0.2), "k": "line"})
    # the medullary vela: the roof of the fourth ventricle, up to the fastigium
    out.append({"d": curve([[414, 384], [456, 446], [490, 500], [532, 566]], False, step=2, sigma=1, eps=0.2), "k": "line"})
    out.append({"d": curve([[532, 566], [490, 620], [462, 700], [436, 780], [418, 840]], False, step=2, sigma=1, eps=0.2), "k": "line"})
    return out


def build(level):
    cfg = FREE[level]
    W, H = cfg["W"], cfg["H"]
    shape = (int(round(H * SS)), int(round(W * SS)))
    out_m = raster([soft(p, cfg.get("outline_soft", 3.0)) for p in cfg["outline"]], shape)
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
    detail = sagittal_detail(cfg) if cfg.get("detail") == "sagittal" else []
    plate = {"level": level, "viewBox": [0, 0, W, H], "mid": W / 2, "bleed": False, "sym": False, "view": "surface",
             **({"schematic": cfg["schematic"]} if cfg.get("schematic") else {}), **({"detail": detail} if detail else {}),
             "outline": mask_paths(out_m, step=2.0, sigma=1.5, eps=0.35, min_area=20), "bands": [],
             "regions": sorted(regions, key=lambda r: -areas[r["id"]]), "fibres": fibres,
             "sources": {"orient": cfg["orient"], "drawn": "one-sided vector drawing (no photo half)"}}
    json.dump(plate, open(f"{REPO}/src/data/brainstem-plates/{level}.json", "w"), separators=(",", ":"))
    print(level, len(regions), "regions", len(fibres), "fibres", os.path.getsize(f"{REPO}/src/data/brainstem-plates/{level}.json"), "bytes")


if __name__ == "__main__":
    for lv in (sys.argv[1:] or FREE.keys()):
        build(lv)
