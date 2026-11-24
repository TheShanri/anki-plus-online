"""Atlas v3: sulci and functional areas as regions of the outside surface.

A sulcus is the groove between two gyri. On the outside surface it is drawn as the walls of that groove: the surface of
either gyrus within reach of their shared border (the border of their outside patches, which runs along the bottom of the
sulcus in the Allen labels) and below the gyral crowns (ambient occlusion, i.e. inside the groove). Each outside vertex
carries at most one sulcus id (_SULC); selecting a sulcus lights its walls.

Functional areas (Broca, Wernicke, premotor cortex ...) are surface regions too, often parts of gyri; each outside
vertex carries a bit mask of the areas it belongs to (_AREAS, up to 24 areas, stored exactly in a float).

Definitions follow the course slides (Lecture 3 "functional anatomy of the cerebrum", Lab 3) and are documented per entry.
"""
import numpy as np
from scipy.spatial import cKDTree

# id, key, name, course slug, gyrus pairs (keys, both sides handled by the caller), reach mm
SULCI = [
    (1, "cs", "Central sulcus", "central-sulcus", [("PrCG", "PoCG"), ("PCLr", "PCLc")], 9.0),
    (2, "lf", "Lateral fissure (Sylvian)", "lateral-fissure",
     [(a, b) for a in ("IFGtr", "IFGop", "FrO", "PrCG", "PoCG", "SMG", "PaO", "LOrG") for b in ("STG", "PLP", "PLT", "TTG", "TP")], 11.0),
    (3, "cal", "Calcarine fissure", "calcarine-fissure", [("Cun", "LiG"), ("Cun", "OP"), ("LiG", "OP")], 8.0),
    (4, "pos", "Parieto-occipital fissure", "parieto-occipital-fissure", [("PrCun", "Cun"), ("SPL", "SOG"), ("PrCun", "SOG")], 8.0),
    (5, "ips", "Intraparietal sulcus", "intraparietal-fissure", [("SPL", "SMG"), ("SPL", "AnG")], 8.0),
    (6, "pocs", "Postcentral sulcus", "postcentral-sulcus", [("PoCG", "SPL"), ("PoCG", "SMG")], 7.0),
    (7, "prcs", "Precentral sulcus", None, [("PrCG", "SFG"), ("PrCG", "MFG"), ("PrCG", "IFGop")], 7.0),
    (8, "sts", "Superior temporal sulcus", None, [("STG", "MTG"), ("PLT", "MTG")], 7.0),
    (9, "its", "Inferior temporal sulcus", None, [("MTG", "ITG")], 7.0),
    (10, "sfs", "Superior frontal sulcus", None, [("SFG", "MFG")], 7.0),
    (11, "ifs", "Inferior frontal sulcus", None, [("MFG", "IFGtr"), ("MFG", "IFGop")], 7.0),
    (12, "cgs", "Cingulate sulcus", None, [("CgGr", "SFG"), ("CgGr", "PaCG"), ("CgGc", "SFG"), ("CgGc", "PaCG"), ("CgGc", "PCLr"), ("CgGc", "PCLc"), ("CgGr", "PCLr")], 7.0),
    (13, "cos", "Collateral sulcus", None, [("PPH", "FuGt"), ("APH", "FuGt"), ("PPH", "FuGo"), ("PRG", "FuGt")], 7.0),
    (14, "ihf", "Interhemispheric (longitudinal) fissure", "interhemispheric-fissure", [], 0.0),
]

# functional areas: bit, key, name, course slug, rule. Rules:
#   ("labels", keys, side)              whole gyri
#   ("near", keys, toward_keys, mm, side)  the part of `keys` within mm of `toward_keys` (e.g. premotor = SFG/MFG near PrCG)
#   ("far", keys, from_keys, mm, side)     the part of `keys` farther than mm from `from_keys`
#   ("band", keys, sulcus_pairs, mm, side) the part of `keys` within mm of the border of the pairs (calcarine banks)
# side: "LR" both hemispheres, "L" the (usually dominant) left only
AREAS = [
    (0, "m1", "Primary motor cortex", "primary-motor-cortex", ("labels", ["PrCG", "PCLr"], "LR")),
    (1, "pm", "Premotor cortex", "premotor-cortex", ("near", ["SFG", "MFG", "IFGop"], ["PrCG"], 16.0, "LR")),
    (2, "fef", "Frontal eye field", "frontal-eye-field", ("near", ["MFG"], ["PrCG"], 12.0, "LR")),
    (3, "broca", "Broca's area", "broca-s-area", ("labels", ["IFGop", "IFGtr"], "L")),
    (4, "dlpfc", "Dorsolateral prefrontal cortex", "dorsolateral-prefrontal-cortex", ("far", ["MFG", "SFG"], ["PrCG"], 16.0, "LR")),
    (5, "ofc", "Orbitofrontal cortex", "orbitofrontal-cortex", ("labels", ["MOrG", "AOrG", "POrG", "LOrG", "ReG"], "LR")),
    (6, "vmpfc", "Ventromedial prefrontal cortex", "ventromedial-prefrontal-cortex", ("labels", ["ReG", "MOrG", "RoG", "SCG"], "LR")),
    (7, "acc", "Anterior cingulate cortex", "anterior-cingulate-cortex", ("labels", ["CgGr"], "LR")),
    (8, "s1", "Primary somatosensory cortex", "primary-somatosensory-cortex", ("labels", ["PoCG", "PCLc"], "LR")),
    (9, "s2a", "Somatosensory association cortex", "somatosensory-association-cortex", ("labels", ["SPL"], "LR")),
    (10, "pga", "Parietal lobe general association area", "parietal-lobe-general-association-area", ("labels", ["SMG", "AnG", "PrCun"], "LR")),
    (11, "v1", "Primary visual cortex", "primary-visual-cortex", ("band", ["Cun", "LiG", "OP"], [("Cun", "LiG"), ("Cun", "OP"), ("LiG", "OP")], 9.0, "LR")),
    (12, "va", "Visual association cortex", "visual-association-cortex", ("labels", ["Cun", "LiG", "SOG", "IOG", "OP", "FuGo"], "LR")),
    (13, "a1", "Primary auditory cortex", "primary-auditory-cortex", ("labels", ["TTG"], "LR")),
    (14, "aa", "Auditory association area", "auditory-association-area", ("labels", ["STG", "PLT"], "LR")),
    (15, "wern", "Wernicke's area", "wernicke-s-area", ("far", ["STG", "PLT"], ["TP", "PLP"], 22.0, "L")),
    (16, "tga", "Temporal lobe general association area", "temporal-lobe-general-association-area", ("labels", ["MTG", "ITG"], "LR")),
    (17, "pfc", "Prefrontal cortex", "prefrontal-cortex", ("far", ["SFG", "MFG", "IFGtr", "FP", "FMG", "MOrG", "AOrG", "POrG", "LOrG", "ReG", "RoG", "PaCG"], ["PrCG"], 16.0, "LR")),
    (18, "dvs", "Dorsal visual stream", "dorsal-visual-stream", ("labels", ["SOG", "SPL", "AnG"], "LR")),
    (19, "vvs", "Ventral visual stream", "ventral-visual-stream", ("labels", ["IOG", "FuGo", "FuGt", "ITG"], "LR")),
]


def compute(P, vlab_ext, ao, key_of, side_of, log=print):
    """P: outside-vertex positions (world m); vlab_ext: their label; ao: their ambient occlusion.
    Returns (sulcus id per vertex uint8, area mask per vertex uint32, report)."""
    n = len(P)
    keys = np.array([key_of.get(int(l), "") for l in vlab_ext])
    sides = np.array([side_of.get(int(l), "M") for l in vlab_ext])
    q = np.round(P * 1e7).astype(np.int64)
    # vertices shared by two outside patches (same position, different labels) are the borders between gyri
    order = np.lexsort(q.T[::-1])
    qs = q[order]
    same = np.all(qs[1:] == qs[:-1], axis=1)
    pa, pb = order[:-1][same], order[1:][same]
    border = {}
    for a, b in zip(pa, pb):
        ka, kb = keys[a], keys[b]
        if ka == kb or sides[a] != sides[b]:
            continue
        border.setdefault((sides[a],) + tuple(sorted((ka, kb))), []).append(P[a])
    sulc = np.zeros(n, np.uint8)
    rep = {}
    deep = ao < np.percentile(ao, 55)  # inside a groove (lower half of the outside surface's openness)
    for sid, skey, name, slug, pairs, reach in SULCI:
        if skey == "ihf":
            # the medial walls facing the midline above the corpus callosum and around it
            m = (np.abs(P[:, 0]) < 0.006) & np.isin(keys, ["SFG", "PaCG", "CgGr", "CgGc", "PCLr", "PCLc", "PrCun", "Cun", "IsCPH", "FP", "FMG", "RoG", "SCG", "OP", "LiG"]) & (P[:, 1] > -0.02)
            sulc[m & (sulc == 0)] = sid
            rep[skey] = int(m.sum())
            continue
        for side in ("L", "R"):
            pts = [p for (sd, a, b), v in border.items() if sd == side and (a, b) in {tuple(sorted(pp)) for pp in pairs} for p in v]
            if len(pts) < 5:
                continue
            tree = cKDTree(np.array(pts))
            cand = np.nonzero((sides == side) & np.isin(keys, list({k for pr in pairs for k in pr})) & deep & (sulc == 0))[0]
            if not len(cand):
                continue
            d, _ = tree.query(P[cand], distance_upper_bound=reach / 1000.0)
            hit = cand[np.isfinite(d)]
            sulc[hit] = sid
            rep[f"{skey}.{side}"] = int(len(hit))
    log("sulci (outside vertices):", rep)

    areas = np.zeros(n, np.uint32)
    arep = {}
    for bit, akey, name, slug, rule in AREAS:
        kind = rule[0]
        side_ok = (sides == "L") if rule[-1] == "L" else (sides != "M")
        if kind == "labels":
            m = np.isin(keys, rule[1]) & side_ok
        elif kind in ("near", "far"):
            base = np.isin(keys, rule[1]) & side_ok
            ref = np.isin(keys, rule[2])
            m = np.zeros(n, bool)
            for side in ("L", "R"):
                r = ref & (sides == side)
                b = np.nonzero(base & (sides == side))[0]
                if not r.any() or not len(b):
                    continue
                d, _ = cKDTree(P[r]).query(P[b])
                ok = d <= rule[3] / 1000.0 if kind == "near" else d > rule[3] / 1000.0
                m[b[ok]] = True
        elif kind == "band":
            m = np.zeros(n, bool)
            for side in ("L", "R"):
                pts = [p for (sd, a, b), v in border.items() if sd == side and (a, b) in {tuple(sorted(pp)) for pp in rule[2]} for p in v]
                b = np.nonzero(np.isin(keys, rule[1]) & side_ok & (sides == side))[0]
                if len(pts) < 5 or not len(b):
                    continue
                d, _ = cKDTree(np.array(pts)).query(P[b])
                m[b[d <= rule[3] / 1000.0]] = True
        else:
            raise ValueError(kind)
        areas[m] |= np.uint32(1 << bit)
        arep[akey] = int(m.sum())
    log("functional areas (outside vertices):", arep)
    return sulc, areas, dict(sulci=rep, areas=arep)
