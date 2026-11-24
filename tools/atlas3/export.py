"""Atlas v3, step 5: public/atlas3/index.json, the label table the viewer reads.

Per label: id, key, side, name, tissue, quality, source, course slugs, centroid and box (world metres), an anchor on its
outside surface (for label pins; null for deep structures), the plane through its largest cross-section on each axis,
and whether it reaches the outside surface. Groups (lobes) list their leaf ids.
World frame: X = patient's left (-x MNI), Y = up (z), Z = anterior (y), metres.
Run: tools/.venv/Scripts/python.exe -I tools/atlas3/export.py
"""
import os, sys, json, hashlib
import numpy as np
from scipy import ndimage as ndi

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from spec import GROUPS  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
W = os.path.join(ROOT, "_atlas/raw/v3")
OUT = os.path.join(ROOT, "public/atlas3")
os.makedirs(OUT, exist_ok=True)
meta = json.load(open(os.path.join(W, "labels.json")))
AFF = np.array(meta["affine"]); VOX = meta["voxel_mm"]
V = np.load(os.path.join(W, "labels.npy"), mmap_mode="r")
z = np.load(os.path.join(W, "patches.npz"))
P, F, LAB = z["P"], z["F"], z["LAB"]


def w(mm):  # MNI mm -> world metres
    x, y, zz = mm
    return [round(-x / 1000, 5), round(zz / 1000, 5), round(y / 1000, 5)]


# exterior vertices per label (shell patches have LAB1 == 0)
ext = LAB[:, 1] == 0
fe = F[ext]
le = LAB[ext, 0]
vid = fe.ravel()
vl = np.repeat(le, 3)
order = np.argsort(vl, kind="stable")
vl, vid = vl[order], vid[order]
starts = np.searchsorted(vl, np.arange(len(meta["labels"]) + 2))

# share of each label's boundary area that faces the outside (a deep structure touching the outside in a small cistern,
# like the thalamus at the transverse fissure, is still "deep")
tri = P[F].astype(np.float64)
area = 0.5 * np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1)
NLAB = len(meta["labels"]) + 1
tot = np.bincount(LAB[:, 0], weights=area, minlength=NLAB) + np.bincount(LAB[:, 1], weights=area, minlength=NLAB)
ext_area = np.bincount(LAB[LAB[:, 1] == 0, 0], weights=area[LAB[:, 1] == 0], minlength=NLAB)
del tri

VIS = json.load(open(os.path.join(W, "views.json"))) if os.path.exists(os.path.join(W, "views.json")) else {}
objs = ndi.find_objects(np.asarray(V))
labels = []
for L in meta["labels"]:
    i = L["id"]
    rec = {k: L[k] for k in ("id", "key", "side", "name", "tissue", "quality", "src", "course")}
    rec["vol"] = L["mm3"]
    rec["area"] = round(float(tot[i]) * 1e6, 1)  # boundary area, mm2
    rec["vis"] = VIS.get(str(i), {})  # visible pixels per standard view (views.py; 1 px = 0.1526 mm2)
    if L["centroid_mm"]:
        rec["centroid"] = w(L["centroid_mm"])
        lo, hi = L["bbox_mm"]
        a, b = w(lo), w(hi)
        rec["bbox"] = [[min(a[k], b[k]) for k in range(3)], [max(a[k], b[k]) for k in range(3)]]
    else:
        rec["centroid"] = None; rec["bbox"] = None
    s, e = starts[i], starts[i + 1]
    if e > s:
        pts = P[np.unique(vid[s:e])].astype(np.float64)
        mean = pts.mean(0)
        k = np.argmin(((pts - mean) ** 2).sum(1))
        rec["anchor"] = [round(float(v), 5) for v in pts[k]]
        rec["exterior"] = True
        rec["extFrac"] = round(float(ext_area[i] / max(tot[i], 1e-12)), 3)
    else:
        rec["anchor"] = None
        rec["exterior"] = False
        rec["extFrac"] = 0.0
    sl = objs[i - 1] if i - 1 < len(objs) else None
    if sl is not None:
        sub = np.asarray(V[sl]) == i
        cx = int(np.argmax(sub.sum((1, 2)))) + sl[0].start
        cy = int(np.argmax(sub.sum((0, 2)))) + sl[1].start
        cz = int(np.argmax(sub.sum((0, 1)))) + sl[2].start
        mm = AFF[:3, 3] + np.array([cx, cy, cz]) * VOX
        rec["cut"] = {"x": round(-mm[0] / 1000, 5), "y": round(mm[2] / 1000, 5), "z": round(mm[1] / 1000, 5)}
    else:
        rec["cut"] = None
    labels.append(rec)

# outline groups: cut-face borders are drawn only between different groups (no line between the internal capsule and the
# white matter around it, between two gyri across the cortical ribbon, between the horns of one ventricle ...)
OG = {
    "cwm": ["FWM", "CR", "CSO", "ICa", "ICg", "ICp", "EC", "ExC", "OR", "CCr", "CCg", "CCb", "CCs"],
    "cau": ["CaH", "CaB", "CaT"],
    "hip": ["HiH", "HiB", "HiT"],
    "hyp": ["HTpo", "HTso", "HTtu"],
    "cbx": ["CbVa", "CbVp", "Nod", "CbPVa", "CbPVp", "TonPV", "FlocPV", "CbLa", "CbLp", "TonL", "FlocL"],
}
og_of = {k: g for g, ks in OG.items() for k in ks}
LVK = {"aLV", "bLV", "xLV", "pLV", "iLV"}
gid = {}
for r in labels:
    if r["tissue"] == "ctx":
        g = "ctx"
    elif r["key"] in LVK:
        g = "lv." + r["side"]
    elif r["key"] in og_of:
        g = og_of[r["key"]] + ("" if og_of[r["key"]] in ("cwm", "cbx") else "." + r["side"])
    else:
        g = "id%d" % r["id"]
    r["og"] = gid.setdefault(g, len(gid) + 1)

key_ids = {}
for r in labels:
    key_ids.setdefault(r["key"], []).append(r["id"])
NAMES = {"frontal-lobe": "Frontal lobe", "parietal-lobe": "Parietal lobe", "temporal-lobe": "Temporal lobe", "occipital-lobe": "Occipital lobe",
         "insular-cortex": "Insula", "limbic-lobe": "Limbic lobe"}
groups = {g: {"name": NAMES.get(g, g), "ids": sorted(i for k in keys for i in key_ids.get(k, []))} for g, keys in GROUPS.items()}
import surfregions  # noqa: E402
sulci = [dict(id=sid, key=k, name=nm, course=sl) for sid, k, nm, sl, _, _ in surfregions.SULCI]
areas = [dict(bit=b, key=k, name=nm, course=sl, side=rule[-1]) for b, k, nm, sl, rule in surfregions.AREAS]
body = dict(labels=labels, groups=groups, sulci=sulci, areas=areas, credits=[
    "Allen Human Reference Atlas 3D, 2020 (Ding et al. 2016; Allen Institute for Brain Science), CC BY 4.0",
    "ICBM 2009b nonlinear symmetric template (Fonov et al. 2009, 2011), (c) McConnell Brain Imaging Centre, MNI",
    "Harvard Ascending Arousal Network atlas v2.0 (Edlow et al. 2023), CC0",
    "Advanced Atlas of 80 Bundles, HCP-842 (Yeh et al. 2018), CC BY 4.0",
])
raw = json.dumps(body, separators=(",", ":"))
body["version"] = hashlib.sha1(raw.encode()).hexdigest()[:10]
json.dump(body, open(os.path.join(OUT, "index.json"), "w"), separators=(",", ":"))
print("index.json:", len(labels), "labels,", sum(1 for r in labels if r["exterior"]), "on the outside;", os.path.getsize(os.path.join(OUT, "index.json")) // 1024, "KB")

# ------------------------------------------------------------------ catalog.json: the structure list of the viewer
# Course structures (content/nsci3250/structures.json) with the v3 leaves they light up, plus every v3 leaf that is not
# a course structure of its own ("atlas extras", shown after "Oh, I'm just curious"). Parts nest under the smallest
# course structure that contains all their leaves (fornix -> crus, body, columns).
course = json.load(open(os.path.join(ROOT, "content/nsci3250/structures.json"), encoding="utf8"))
by_course = {}
for r in labels:
    for c in r["course"]:
        by_course.setdefault(c, set()).add(r["id"])
# the brain's developmental divisions, as unions of what the course calls the parts (every leaf belongs to one): the
# hindbrain (rhombencephalon) = pons + medulla + cerebellum, its rostral part (metencephalon) = pons + cerebellum, the
# forebrain (prosencephalon) = everything above the midbrain, the telencephalon = the forebrain without the diencephalon.
# The cranial nerves belong to none of them.
nrv = {r["id"] for r in labels if r["tissue"] == "nrv"}
all_ids = {r["id"] for r in labels} - nrv
hind = by_course.get("pons", set()) | by_course.get("medulla", set()) | by_course.get("cerebellum", set())
mid_ = by_course.get("midbrain", set())
fore = all_ids - hind - mid_ - by_course.get("brainstem", set())
DIV = {
    "brain": all_ids,
    "rhombencephalon": hind,
    "metencephalon": by_course.get("pons", set()) | by_course.get("cerebellum", set()),
    "prosencephalon": fore,
    "telencephalon": fore - by_course.get("diencephalon", set()),
}
for k, v in DIV.items():
    if v:
        by_course[k] = set(v)
items = []
for s in course:
    ids = sorted(by_course.get(s["slug"], []))
    items.append(dict(slug=s["slug"], name=s["name"], region=s.get("region") or "", syn=list(dict.fromkeys((s.get("synonyms") or []) + (s.get("abbreviations") or []))), ids=ids, concept=bool(s.get("concept"))))
covered = set(i for it in items for i in it["ids"])
REGION_OF = {"ctx": "cerebral cortex", "gm": "deep grey matter", "wm": "white matter", "tract": "brainstem", "csf": "ventricular system", "plx": "ventricular system", "cbx": "cerebellum", "bs": "brainstem", "nrv": "cranial nerves"}
extra = {}
for r in labels:
    # a leaf whose course slugs do not single it out (or that has none) becomes its own atlas item, both sides together
    exact = any(set(by_course.get(c, [])) == set(key_ids[r["key"]]) for c in r["course"])
    # nor when a course structure of the same name holds it (the two halves of the tonsil, paravermal and lateral)
    named = any(s["name"].lower() == r["name"].lower() and r["id"] in by_course.get(s["slug"], ()) for s in course)
    if exact or named:
        continue
    e = extra.setdefault(r["key"], dict(slug="atlas:" + r["key"], name=r["name"], region=REGION_OF.get(r["tissue"], "brain"), syn=[], ids=[], concept=False, extra=True))
    e["ids"].append(r["id"])
items += list(extra.values())
sul_of = {s["course"]: s["id"] for s in sulci if s["course"]}
area_of = {a["course"]: a["bit"] for a in areas}
# the homunculi are drawn on the primary motor and somatosensory cortex
area_of.update({"motor-homunculus": next(a["bit"] for a in areas if a["key"] == "m1"), "somatosensory-homunculus": next(a["bit"] for a in areas if a["key"] == "s1")})
for it in items:
    if it["slug"] in sul_of:
        it["sulcus"] = sul_of[it["slug"]]
    if it["slug"] in area_of:
        it["area"] = area_of[it["slug"]]
# sulci that are not course structures become atlas items too
for s_ in sulci:
    if not s_["course"]:
        items.append(dict(slug="atlas:sulcus-" + s_["key"], name=s_["name"], region="cerebral cortex", syn=[], ids=[], concept=False, extra=True, sulcus=s_["id"]))
# the generic "sulcus" lights every named sulcus
for it in items:
    if it["slug"] == "sulcus":
        it["sulcus"] = -1
# tracts drawn as fibres (fibres.py): "hcp" or "pathway", the client loads public/atlas3/fibres/<slug>.json
FIB = os.path.join(ROOT, "public/atlas3/fibres/index.json")
fib = json.load(open(FIB)) if os.path.exists(FIB) else {}
for it in items:
    if it["slug"] in fib:
        it["fibre"] = fib[it["slug"]]
# arteries and sinuses (vessels.py): the vessel keys a course item lights, shown around a see-through brain
ARTERIES = ["ica", "mca1", "mca2", "mca3", "mcap", "mcat", "aca", "acao", "peri", "acom", "pcom", "pca", "ba", "va", "sca", "aica", "pica", "ponl", "ponm"]
VESSEL_OF = {
    "internal-carotid-artery": ["ica"], "middle-cerebral-artery": ["mca1", "mca2", "mca3", "mcap", "mcat"],
    "anterior-cerebral-artery": ["aca", "acao"], "pericallosal-artery": ["peri"], "anterior-communicating-artery": ["acom"],
    "posterior-communicating-artery": ["pcom"], "posterior-cerebral-artery": ["pca"], "basilar-artery": ["ba"],
    "vertebral-artery": ["va"], "superior-cerebellar-artery": ["sca"], "posterior-inferior-cerebellar-artery": ["pica"],
    "pontine-arteries": ["ponl", "ponm"], "penetrating-branches-brainstem": ["ponm"],
    "circle-of-willis": ["acom", "aca", "ica", "pcom", "pca", "ba"], "cerebral-blood-vessels": ARTERIES,
    "superior-sagittal-sinus": ["sss"], "dural-venous-sinuses": ["sss", "iss", "strs", "trs", "sigs", "occs", "cavs", "sps", "ips"],
}
VJ = os.path.join(ROOT, "public/atlas3/vessels.json")
have_v = {v["key"] for v in json.load(open(VJ))["vessels"]} if os.path.exists(VJ) else set()
for it in items:
    ks = [k for k in VESSEL_OF.get(it["slug"], []) if k in have_v]
    if ks and not it["ids"]:
        it["vessels"] = ks
# the body layer (body.py): skull, meninges, spine and cord, eye, ear, nose ... for the course items with no labels of their own
import bodyspec  # noqa: E402

bodyspec.build(items, meta["labels"])
# nesting: parent = the smallest other item whose leaves strictly contain this item's leaves. Umbrella terms (gyrus,
# cortical ribbon, cerebrospinal fluid, fibre classes ...) never act as parents: they would swallow the whole list.
UMBRELLA = {"gyrus", "cortical-ribbon", "cerebral-cortex", "allocortex", "paleocortex", "archicortex", "white-matter", "cerebrospinal-fluid",
            "ventricular-system", "brain", "telencephalon", "prosencephalon", "rhombencephalon", "metencephalon", "commissural-fibers",
            "projection-fibers", "association-fibers", "prefrontal-cortex", "cerebellar-cortex", "deep-cerebellar-nuclei", "sulcus"}
sets = [frozenset(it["ids"]) for it in items]
for i, it in enumerate(items):
    if not it["ids"]:
        continue
    best = None
    for j, jt in enumerate(items):
        if i == j or not jt["ids"] or not (sets[i] < sets[j]) or jt["slug"] in UMBRELLA:
            continue
        if best is None or len(sets[j]) < len(sets[best]):
            best = j
    it["parent"] = items[best]["slug"] if best is not None else None
json.dump(dict(version=body["version"], items=items), open(os.path.join(OUT, "catalog.json"), "w"), separators=(",", ":"))
print("catalog.json:", len(items), "items;", sum(1 for it in items if it["ids"]), "with 3D;", len(extra), "atlas extras;",
      "course structures without 3D:", sum(1 for it in items if not it["ids"] and not it.get("extra") and not it.get("concept") and it.get("sulcus") is None
                                             and it.get("area") is None and not it.get("fibre") and not it.get("vessels") and not it.get("body")))
