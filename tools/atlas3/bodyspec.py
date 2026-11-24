"""How Explore shows each course structure of the body layer (body.py): what it lights, what it shows around it, the brain
(hidden, a veil, shown, or the deep view of some labels), the view, a cut, and what to frame. export.py writes the result
into the catalog as each item's `body`.

  keys   body.json parts lit            marks   body.json marks shown as pins
  ctx    context: part groups or keys    brain   "hide" | "veil" | "show" | "deep"
  near   label keys (the deep view of them, or labels hidden with brain "show": hide)
  view   the camera                      cut     (axis, position in metres, flip) or a named cut
  frame  part keys whose box is framed (default: the lit parts and marks)
  stagger  metres between the cut faces of the layers (meninges)    skin   a tint over the brain's outside surface (pia)
"""
import json, os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

SKULL_CTX = ["skull"]
BASE = ("y", "base", False)  # the calvaria cut away: the cranial floor from above
STACK = dict(ctx=["stack"], brain="show", view="anterior", cut=("z", -0.012, False), stagger=0.006, frame=["parietal-bone.L", "parietal-bone.R", "frontal-bone"])
LUMBAR = ["vertebra-t11", "vertebra-t12", "vertebra-l1", "vertebra-l2"]
CERV = ["vertebra-c5", "vertebra-c6", "vertebra-c7", "vertebra-t1"]
CORD_IN = ["white-matter-of-spinal-cord", "anterior-horn-of-spinal-cord", "posterior-horn-of-spinal-cord", "central-canal"]
CORD_OUT = CORD_IN + ["anterior-root-of-spinal-nerve", "posterior-root-of-spinal-nerve", "spinal-ganglion.L", "spinal-ganglion.R"]
LAT_FUN = ["lateral-corticospinal-tract", "rubrospinal-tract", "lateral-reticulospinal-tract", "lateral-spinothalamic-tract", "anterior-spinocerebellar-tract",
           "posterior-spinocerebellar-tract", "lateral-fasciculus-proprius"]
ANT_FUN = ["anterior-corticospinal-tract", "anterior-spinothalamic-tract", "lateral-vestibulospinal-tract", "medial-vestibulospinal-tract",
           "medial-reticulospinal-tract", "tectospinal-tract", "anterior-fasciculus-proprius"]
EYE_CUT = ("x", "eyeL", False)  # a sagittal cut through the left eye, its lateral half removed


def XS(lv, lit, view="superior", extra_lit=(), approx=False):
    """A cord structure in the cord's cross-section at a level (c7, t6, l2): its section lit, the 3D cord below it."""
    return dict(keys=[f"xs-{lv}-{k}" for k in lit] + list(extra_lit), ctx=[f"xs-{lv}"] + CORD_IN, brain="hide", view=view,
                cut=("y", f"xs-{lv}", False), frame=[f"xs-{lv}-white-matter-of-spinal-cord"], approx=approx)
LR = lambda k: [f"{k}.L", f"{k}.R"]
VAULT = ("frontal-bone", "parietal-bone", "temporal-bone", "occipital-bone", "sphenoid-bone", "ethmoid-bone")

SPEC = {
    # the skull
    "frontal-bone": dict(keys=["frontal-bone"], ctx=SKULL_CTX, brain="hide", view="anterior"),
    "parietal-bone": dict(keys=LR("parietal-bone"), ctx=SKULL_CTX, brain="hide", view="left"),
    "temporal-bone": dict(keys=LR("temporal-bone"), ctx=SKULL_CTX, brain="hide", view="left"),
    "occipital-bone": dict(keys=["occipital-bone"], ctx=SKULL_CTX, brain="hide", view="posterior"),
    "sphenoid-bone": dict(keys=["sphenoid-bone"], marks=["sella-turcica"], ctx=SKULL_CTX, brain="hide", view="superior", cut=BASE),
    "cribriform-plate": dict(keys=["ethmoid-bone"], marks=["foramen-caecum"], ctx=SKULL_CTX, brain="hide", view="superior", cut=BASE, approx=True),
    "sagittal-suture": dict(keys=["suture-sagittal"], ctx=SKULL_CTX, brain="hide", view="superior"),
    "coronal-suture": dict(keys=["suture-coronal"], ctx=SKULL_CTX, brain="hide", view="superior"),
    "lambdoid-suture": dict(keys=["suture-lambdoid"], ctx=SKULL_CTX, brain="hide", view="posterior"),
    "bregma": dict(marks=["bregma"], keys=["suture-sagittal", "suture-coronal"], ctx=SKULL_CTX, brain="hide", view="superior", frame=["frontal-bone", "parietal-bone.L", "parietal-bone.R"]),
    "lambda": dict(marks=["lambda"], keys=["suture-sagittal", "suture-lambdoid"], ctx=SKULL_CTX, brain="hide", view="posterior", frame=["occipital-bone", "parietal-bone.L", "parietal-bone.R"]),
    "pterion": dict(marks=["pterion.L"], ctx=SKULL_CTX, brain="hide", view="left", frame=["temporal-bone.L", "sphenoid-bone"]),
    "foramen-magnum": dict(keys=["foramen-magnum"], ctx=SKULL_CTX, brain="hide", view="superior", cut=BASE, frame=["occipital-bone"]),
    "anterior-cranial-fossa": dict(keys=["anterior-cranial-fossa"], ctx=SKULL_CTX, brain="hide", view="superior", cut=BASE, frame=["sphenoid-bone", "occipital-bone", "frontal-bone"]),
    "middle-cranial-fossa": dict(keys=["middle-cranial-fossa"], ctx=SKULL_CTX, brain="hide", view="superior", cut=BASE, frame=["sphenoid-bone", "occipital-bone", "frontal-bone"]),
    "posterior-cranial-fossa": dict(keys=["posterior-cranial-fossa"], ctx=SKULL_CTX, brain="hide", view="superior", cut=BASE, frame=["sphenoid-bone", "occipital-bone", "frontal-bone"]),
    # the meninges
    "dura-mater": dict(keys=["dura-cranial", "falx-cerebri", "tentorium-cerebelli.L", "tentorium-cerebelli.R"], **STACK),
    "falx-cerebri": dict(keys=["falx-cerebri"], ctx=["dura"], brain="veil", view="left"),
    "tentorium-cerebelli": dict(keys=LR("tentorium-cerebelli"), ctx=["dura"], brain="veil", view="left", frame=["falx-cerebri", "tentorium-cerebelli.L", "tentorium-cerebelli.R"]),
    "arachnoid-mater": dict(keys=["arachnoid-mater"], **STACK),
    "pia-mater": dict(keys=[], skin="#e58a8a", **STACK),
    "subarachnoid-space": dict(keys=["subarachnoid-space"], **STACK),
    "subdural-space": dict(keys=["subdural-space"], **STACK),
    "epidural-space": dict(keys=["epidural-space"], **STACK),
    "meningeal-blood-vessels": dict(keys=["meningeal-blood-vessels"], marks=["pterion.L"], ctx=SKULL_CTX, brain="hide", view="right", cut=("x", 0.0, True), frame=["temporal-bone.L", "parietal-bone.L"]),
    "arachnoid-granulations": dict(keys=["arachnoid-granulations"], ctx=["arachnoid-mater"], vessels=["sss"], brain="veil", view="superior"),
    # the ventricles' apertures
    "foramen-of-magendie": dict(marks=["foramen-of-magendie"], brain="deep", near=["V4"], view="posterior"),
    "foramina-of-luschka": dict(marks=LR("foramen-of-luschka"), brain="deep", near=["V4"], view="posterior"),
    # the spine
    "vertebral-body": dict(keys=["vertebral-body"], ctx=["spine"], brain="hide", view="left", frame=LUMBAR, approx=True),
    "vertebral-arch": dict(keys=["vertebral-arch"], ctx=["spine"], brain="hide", view="left", frame=LUMBAR, approx=True),
    "spinous-process": dict(keys=["spinous-process"], ctx=["spine"], brain="hide", view="left", frame=LUMBAR, approx=True),
    "transverse-process": dict(keys=["transverse-process"], ctx=["spine"], brain="hide", view="posterior", frame=LUMBAR, approx=True),
    "vertebral-foramen": dict(keys=["vertebral-foramen"], ctx=["spine"], brain="hide", view="superior", cut=("y", "l1", False), frame=["vertebra-l1"], approx=True),
    "vertebral-canal": dict(keys=["vertebral-canal"], ctx=["spine"], brain="hide", view="left", cut=("x", 0.0, False), frame=LUMBAR, approx=True),
    "intervertebral-disc": dict(keys="disc-*", ctx=["spine"], brain="hide", view="left", frame=LUMBAR),
    "intervertebral-foramen": dict(keys=["intervertebral-foramen"], ctx=["spine"], brain="hide", view="left", frame=LUMBAR, approx=True),
    "atlas": dict(keys=["vertebra-c1"], ctx=["spine"], brain="hide", view="posterior", frame=["vertebra-c1", "vertebra-c2", "foramen-magnum"]),
    "axis": dict(keys=["vertebra-c2"], ctx=["spine"], brain="hide", view="left", frame=["vertebra-c1", "vertebra-c2", "vertebra-c3"]),
    "vertebra-prominens": dict(keys=["vertebra-c7"], ctx=["spine"], brain="hide", view="left", frame=["vertebra-c5", "vertebra-c7", "vertebra-t2"]),
    "coccyx": dict(keys=["coccyx"], ctx=["spine"], brain="hide", view="left", frame=["sacrum", "coccyx"]),
    # the spinal cord
    "conus-medullaris": dict(keys=["conus-medullaris"], ctx=CORD_OUT + ["cauda-equina"], brain="hide", view="posterior", frame=["conus-medullaris", "vertebra-l1"], approx=True),
    "cauda-equina": dict(keys=["cauda-equina"], ctx=CORD_OUT + ["spinal-dura", "filum-terminale"], brain="hide", view="posterior", frame=["cauda-equina"]),
    "filum-terminale": dict(keys=["filum-terminale"], ctx=CORD_OUT + ["cauda-equina", "sacrum", "coccyx"], brain="hide", view="left", frame=["filum-terminale"], approx=True),
    "denticulate-ligaments": dict(keys=["denticulate-ligaments"], ctx=CORD_OUT + ["spinal-dura"], brain="hide", view="anterior", frame=CERV, approx=True),
    "dorsal-rootlets": dict(keys=["posterior-root-of-spinal-nerve"], ctx=CORD_OUT, brain="hide", view="posterior", frame=CERV, approx=True),
    "ventral-rootlets": dict(keys=["anterior-root-of-spinal-nerve"], ctx=CORD_OUT, brain="hide", view="anterior", frame=CERV, approx=True),
    "dorsal-root": dict(keys=["posterior-root-of-spinal-nerve"], ctx=CORD_OUT, brain="hide", view="posterior", frame=CERV),
    "ventral-root": dict(keys=["anterior-root-of-spinal-nerve"], ctx=CORD_OUT, brain="hide", view="anterior", frame=CERV),
    "spinal-rootlets": dict(keys=["posterior-root-of-spinal-nerve", "anterior-root-of-spinal-nerve"], ctx=CORD_OUT, brain="hide", view="left", frame=CERV, approx=True),
    "spinal-roots": dict(keys=["posterior-root-of-spinal-nerve", "anterior-root-of-spinal-nerve"], ctx=CORD_OUT, brain="hide", view="left", frame=CERV),
    "dorsal-root-ganglion": dict(keys=LR("spinal-ganglion"), ctx=CORD_OUT, brain="hide", view="posterior", frame=CERV),
    "dural-sleeves": dict(keys=["spinal-dura"], ctx=CORD_OUT, brain="hide", view="anterior", frame=CERV, approx=True),
    "dural-sac": dict(keys=["spinal-dura"], ctx=CORD_OUT + ["cauda-equina"], brain="hide", view="left", frame=["spinal-dura"]),
    "spinal-nerves": dict(keys=["spinal-nerves"], ctx=CORD_OUT + ["dorsal-ramus", "ventral-ramus"], brain="hide", view="posterior", frame=CERV, approx=True),
    "dorsal-ramus": dict(keys=["dorsal-ramus"], ctx=CORD_OUT + ["spinal-nerves", "ventral-ramus"], brain="hide", view="left", frame=CERV, approx=True),
    "ventral-ramus": dict(keys=["ventral-ramus"], ctx=CORD_OUT + ["spinal-nerves", "dorsal-ramus"], brain="hide", view="left", frame=CERV, approx=True),
    "dorsal-horn": XS("c7", ["posterior-horn-of-spinal-cord"], extra_lit=["posterior-horn-of-spinal-cord"]),
    "lateral-horn": XS("t6", ["lateral-horn"], extra_lit=["lateral-horn"], approx=True),
    "intermediate-zone": XS("t6", ["lateral-intermediate-substance", "intermediomedial-nucleus", "intermediolateral-nucleus"]),
    "marginal-nucleus": XS("c7", ["marginal-nucleus"], approx=True),
    "substantia-gelatinosa": XS("c7", ["substantia-gelatinosa"], approx=True),
    "nucleus-proprius": XS("c7", ["nucleus-proprius"], extra_lit=["nucleus-proprius"]),
    "column-of-clarke": XS("t6", ["column-of-clarke"], extra_lit=["column-of-clarke"], approx=True),
    "ventral-commissure-of-spinal-cord": XS("c7", ["ventral-commissure-of-spinal-cord"], approx=True),
    "lateral-funiculus": XS("c7", LAT_FUN),
    "anterior-funiculus": XS("c7", ANT_FUN),
    "dorsal-root-entry-zone": XS("c7", ["posterolateral-tract"], extra_lit=["posterior-root-of-spinal-nerve"], approx=True),
    "lateral-dorsal-root-entry-zone": XS("c7", ["posterolateral-tract"], approx=True),
    "medial-dorsal-root-entry-zone": XS("c7", ["gracile-fasciculus", "cuneate-fasciculus"], extra_lit=["posterior-root-of-spinal-nerve"], approx=True),
    "anterior-spinal-artery": dict(keys=["anterior-spinal-artery"], ctx=CORD_OUT, vessels=["va", "ba"], brain="deep", near=["MoTg", "Py"], view="anterior", frame=["vertebra-c1", "vertebra-c4"], approx=True),
    "posterior-spinal-arteries": dict(keys=["posterior-spinal-arteries"], ctx=CORD_OUT, brain="hide", view="posterior", frame=CERV, approx=True),
    # the eye
    "cornea": dict(keys=LR("cornea"), ctx=["eye"], brain="hide", view="anterior"),
    "sclera": dict(keys=LR("sclera"), ctx=["eye"], brain="hide", view="anterior"),
    "iris": dict(keys=LR("iris"), ctx=["eye"], brain="hide", view="anterior"),
    "pupil": dict(keys=LR("pupil"), ctx=["eye"], brain="hide", view="anterior", approx=True),
    "lens": dict(keys=["lens.L"], ctx=["eye"], brain="hide", view="left", cut=EYE_CUT, frame=["sclera.L"]),
    "retina": dict(keys=["retina.L"], ctx=["eye"], brain="hide", view="left", cut=EYE_CUT, frame=["sclera.L"]),
    "photoreceptors": dict(keys=["retina.L"], ctx=["eye"], brain="hide", view="left", cut=EYE_CUT, frame=["sclera.L"], approx=True),
    "choroid": dict(keys=["choroid.L"], ctx=["eye"], brain="hide", view="left", cut=EYE_CUT, frame=["sclera.L"], approx=True),
    "vitreous-body": dict(keys=["vitreous-body.L"], ctx=["eye"], brain="hide", view="left", cut=EYE_CUT, frame=["sclera.L"], approx=True),
    "aqueous-humor": dict(keys=["aqueous-humor.L"], ctx=["eye"], brain="hide", view="left", cut=EYE_CUT, frame=["sclera.L"], approx=True),
    # the ear and the nose
    "cochlea": dict(keys=["cochlea.L"], ctx=["ear"], brain="hide", view="left", frame=["cochlea.L", "vestibule.L", "semicircular-canals.L", "ossicles.L"]),
    "spiral-ganglion": dict(keys=["cochlea.L"], ctx=["ear"], brain="hide", view="left", frame=["cochlea.L", "vestibule.L"], approx=True),
    "saccule": dict(keys=["vestibule.L"], ctx=["ear"], brain="hide", view="left", frame=["cochlea.L", "vestibule.L", "semicircular-canals.L"], approx=True),
    "olfactory-epithelium": dict(keys=["olfactory-epithelium"], ctx=["nose"], brain="show", view="left", cut=("x", 0.004, False), frame=["nasal-cavity", "olfactory-nerve"]),
    "olfactory-nerve": dict(keys=["olfactory-nerve"], ctx=["nose"], brain="show", view="left", cut=("x", 0.004, False), frame=["olfactory-nerve", "olfactory-epithelium"]),
    # nerves
    "accessory-nerve": dict(keys=LR("accessory-nerve"), ctx=CORD_IN, brain="deep", near=["MoTg", "Py"], view="posterior", frame=LR("accessory-nerve"), approx=True),
    "trigeminal-ganglion": dict(keys=["trigeminal-ganglion"], brain="show", view="inferior", frame=["trigeminal-ganglion"], approx=True),
    # drawn from this atlas's labels
    "hypothalamic-sulcus": dict(keys=["hypothalamic-sulcus"], brain="show", near=["V3"], view="left", cut=("x", 0.0005, False), frame=["hypothalamic-sulcus"], approx=True),
    "mesencephalic-trigeminal-nucleus": dict(keys=["mesencephalic-trigeminal-nucleus"], brain="deep", near=["PAG"], view="posterior", approx=True),
    "occipital-notch": dict(marks=LR("occipital-notch"), brain="show", view="left", approx=True),
    "lenticulostriate-arteries": dict(keys=["lenticulostriate-arteries"], vessels=["mca1", "ica"], brain="deep", near=["Pu", "GPe", "GPi"], view="anterior", approx=True),
    "callosomarginal-artery": dict(keys=["callosomarginal-artery"], vessels=["peri"], brain="show", sides="R", view="medial-right", approx=True),
}


def build(items, labels):
    """Set each course item's `body` from SPEC (only items with no labels of their own)."""
    bj = json.load(open(os.path.join(ROOT, "public/atlas3/body.json")))
    parts = {p["key"]: p for p in bj["parts"]}
    marks = {m["key"]: m for m in bj["marks"]}
    groups = {}
    for p in bj["parts"]:
        groups.setdefault(p["group"], []).append(p["key"])
    ids_of = {}
    for l in labels:
        ids_of.setdefault(l["key"], []).append(l["id"])
    box = lambda k: parts[k]["box"]
    # named contexts
    CTX = dict(
        skull=[k for k in groups["skull"] if parts[k]["kind"] in ("bone", "suture")],
        spine=[k for k in groups["spine"] if parts[k]["kind"] in ("bone", "disc")],
        dura=groups["dura"],
        eye=[k for k in groups["eye"] if parts[k]["kind"] in ("eye-sclera", "eye-cornea", "eye-iris", "eye-lens", "eye-retina")],
        ear=groups["ear"],
        nose=groups["nose"],
        stack=["arachnoid-mater", "dura-cranial", "falx-cerebri", "tentorium-cerebelli.L", "tentorium-cerebelli.R", "subarachnoid-space"]
        + [k for k in groups["skull"] if parts[k]["kind"] == "bone" and k.split(".")[0] in VAULT],
    )
    for lv in ("c7", "t6", "l2"):
        CTX[f"xs-{lv}"] = [k for k in parts if k.startswith(f"xs-{lv}-")]
    named = {
        "base": lambda: max(box("sphenoid-bone")[1][1], box("anterior-cranial-fossa")[1][1]) + 0.004,  # just above the cranial floor
        "eyeL": lambda: (box("sclera.L")[0][0] + box("sclera.L")[1][0]) / 2,
        "l1": lambda: (box("vertebra-l1")[0][1] + box("vertebra-l1")[1][1]) / 2 + 0.004,
        **{f"xs-{lv}": (lambda lv=lv: box(f"xs-{lv}-white-matter-of-spinal-cord")[1][1] + 0.0004) for lv in ("c7", "t6", "l2")},
    }
    n = 0
    for it in items:
        sp = SPEC.get(it["slug"])
        if not sp or it["ids"] or it.get("sulcus") is not None or it.get("area") is not None:
            continue
        keys = sp.get("keys", [])
        if keys == "disc-*":
            keys = [k for k in parts if k.startswith("disc-")]
        keys = [k for k in keys if k in parts]
        mk = [m for m in sp.get("marks", []) if m in marks]
        if not keys and not mk and not sp.get("skin"):
            print("  body: nothing for", it["slug"])
            continue
        ctx = []
        for c in sp.get("ctx", []):
            ctx += CTX.get(c, [c] if c in parts else [])
        ctx = [k for k in dict.fromkeys(ctx) if k in parts and k not in keys]
        fr = [k for k in (sp.get("frame") or []) if k in parts]
        lo, hi = [9.0] * 3, [-9.0] * 3
        for k in fr or keys:
            b = box(k)
            lo = [min(a, c) for a, c in zip(lo, b[0])]
            hi = [max(a, c) for a, c in zip(hi, b[1])]
        for m in mk if not fr else []:
            lo = [min(a, c - 0.012) for a, c in zip(lo, marks[m]["p"])]
            hi = [max(a, c + 0.012) for a, c in zip(hi, marks[m]["p"])]
        spec = dict(keys=keys, ctx=ctx, brain=sp.get("brain", "hide"), view=sp.get("view", "left"))
        if lo[0] < 9:
            spec["frame"] = [[round(v, 4) for v in lo], [round(v, 4) for v in hi]]
        if mk:
            spec["marks"] = [dict(text=marks[m]["name"], p=marks[m]["p"]) for m in mk]
        if sp.get("near") is not None:
            spec["near"] = [i for k in sp["near"] for i in ids_of.get(k, [])]
        if sp.get("cut"):
            ax, pos, flip = sp["cut"]
            spec["cut"] = dict(axis=ax, pos=round(float(named[pos]() if isinstance(pos, str) else pos), 4), flip=bool(flip))
        for k in ("stagger", "skin", "vessels", "sides"):
            if sp.get(k) is not None:
                spec[k] = sp[k]
        spec["approx"] = bool(sp.get("approx")) or any(parts[k].get("approx") for k in keys) or any(marks[m].get("approx") for m in mk)
        srcs = sorted({parts[k]["src"] for k in keys})
        if srcs:
            spec["src"] = srcs[0] if len(srcs) == 1 else "; ".join(srcs)
        it["body"] = spec
        n += 1
    print("body layer:", n, "course structures")
