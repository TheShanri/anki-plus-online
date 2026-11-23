"""Build content/nsci3250/structures.json from content-build/structures/unit{1,2,3}.json.
Deterministic: all hand decisions (merges, splits, synonyms) live in structure_specs.py.
Run: tools/.venv/Scripts/python.exe -I tools/content/build_structures.py"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from structure_specs import R, S, key, CRANIALS, ARABIC  # noqa: E402

ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
BUILD = os.path.join(ROOT, "content-build")
OUT = os.path.join(ROOT, "content", "nsci3250", "structures.json")

PROPER = {"broca's", "wernicke's", "monro", "magendie", "luschka", "willis", "clarke", "clarke's", "edinger-westphal",
          "sylvian", "brodmann's"}


def clean(s):
    s = s.replace("�", "'").replace("’", "'")
    return re.sub(r"\s+", " ", s).strip(" :;")


def slugify(s):
    return key(s).replace(" ", "-")


def sentence(s):
    out = []
    for w in s.split(" "):
        core = re.sub(r"[^A-Za-z']", "", w)
        if core.lower() in PROPER:
            out.append(w[0].upper() + w[1:])
        elif len(core) >= 2 and core.isupper():
            out.append(w)
        else:
            out.append(w.lower())
    r = " ".join(out)
    return r[:1].upper() + r[1:]


def spec_for(raw, group):
    k = key(raw)
    g = key(group or "")
    if k == "body":
        if "corpus callosum" in g:
            return [S("Body of corpus callosum", ["body", "corpus callosum body", "body of CC", "body of the corpus callosum"], parent="Corpus callosum", lat="midline")]
        return [S("Body of lateral ventricle", ["body", "lateral ventricle body", "body of the lateral ventricle", "body of LV"], parent="Lateral ventricle", lat="paired")]
    if k == "genu" and "internal capsule" in g:
        return [S("Genu of internal capsule", ["genu", "knee of internal capsule", "internal capsule genu"], parent="Internal capsule")]
    if k == "sagittal":
        return [S("Sagittal suture", ["sagittal"], region="skull", lat="midline")]
    if k == "coronal":
        return [S("Coronal suture", ["coronal"], region="skull", lat="paired")]
    return R.get(k, "MISSING")


REGION_BY_GROUP = {"skull": "skull", "sutures": "skull", "cranial foramina": "skull", "meninges": "meninges", "divisions": "brain divisions",
                   "directions": "orientation", "planes": "orientation", "ventricular system": "ventricular system", "telencephalon": "telencephalon",
                   "diencephalon": "diencephalon", "brainstem": "brainstem", "functional designations": "cerebral cortex",
                   "cerebral fiber tracts": "cerebral white matter", "anatomical structures": "cerebral cortex",
                   "spine vertebrae": "vertebral column", "spinal cord dissections": "spinal cord", "telencephalic structures": "telencephalon",
                   "lateral ventricles": "ventricular system", "corpus callosum": "cerebral white matter", "basal ganglia": "basal ganglia",
                   "internal capsule": "cerebral white matter", "limbic system": "limbic system", "diencephalic structures": "diencephalon",
                   "brainstem structures": "brainstem", "posterior circulation": "blood supply", "anterior circulation": "blood supply",
                   "id on histological images": "brainstem"}


def region_for(name, group, labname, unit):
    n = key(name)
    if any(w in n for w in ("artery", "arteries", "circle of willis")):
        return "blood supply"
    if "cerebellar" in n or n in ("cerebellum", "vermis", "flocculus", "paravermis", "dentate nucleus"):
        return "cerebellum"
    if unit == 2 and "nerve" in n:
        return "cranial nerves"
    if "ventricle" in n or "aqueduct" in n:
        return "ventricular system"
    if any(w in n for w in ("cornea", "sclera", "retina", "iris", "lens", "choroid", "optic", "geniculate", "suprachiasmatic", "gaze")) and "plexus" not in n:
        return "visual system"
    g = key(group or "")
    if g in REGION_BY_GROUP:
        return REGION_BY_GROUP[g]
    if unit == 1 and "lab 5" in key(labname or ""):
        return "spinal cord"
    if "cervical spinal cord" in g or "motor decussation" in g:
        return "spinal cord"
    return "brainstem" if unit == 2 else "cerebrum"


MIDLINE_NAMES = {"midbrain", "pons", "medulla", "brainstem", "cerebellum", "vermis", "third ventricle", "fourth ventricle", "pineal gland",
                 "optic chiasm", "interthalamic adhesion", "corpus callosum", "obex", "cerebral aqueduct", "septum pellucidum", "fornix",
                 "anterior commissure", "posterior commissure", "lamina terminalis", "pituitary stalk", "conus medullaris", "cauda equina",
                 "filum terminale", "interpeduncular fossa", "area postrema", "epithalamus", "motor decussation",
                 "ventral commissure of spinal cord", "circle of willis", "basilar artery", "anterior spinal artery",
                 "superior sagittal sinus", "falx cerebri", "tentorium cerebelli", "frontal bone", "occipital bone", "sphenoid bone",
                 "foramen magnum", "hypothalamus"}


def laterality_for(name, concept, region):
    n = key(name)
    if concept:
        return "n/a"
    if n in MIDLINE_NAMES:
        return "midline"
    # language areas: one hemisphere (the dominant one, the left in most people), not a pair (owner audit 2026-11-22)
    if n in (key("Broca's area"), key("Wernicke's area")):
        return "left"
    if region in ("vertebral column", "meninges", "brain divisions", "skull"):
        return "n/a"
    if region == "spinal cord":
        return "paired" if any(w in n for w in ("horn", "column", "tract", "funiculus", "nerve", "root", "ramus", "fasciculus", "nucleus", "ganglion", "ligament", "zone", "rootlets")) else "n/a"
    return "paired"


def lab_label(lab, unit):
    lab = clean(lab or "")
    if unit == 2 and re.search(r"lab\s*8,\s*9", lab, re.I):
        return "Labs 8-10"
    m = re.search(r"lab\s*(\d+)", lab, re.I)
    return f"Lab {m.group(1)}" if m else lab


structs, order, auto = {}, [], []


def get(name, unit):
    k = key(name)
    if k not in structs:
        structs[k] = dict(slug=slugify(name), name=name, unit=unit, synonyms=[], abbreviations=[], region=None, lists=[],
                          laterality=None, parent=None, concept=False)
        order.append(k)
    return structs[k]


def addsyn(s, vals, field="synonyms"):
    have = {key(x) for x in s["synonyms"] + s["abbreviations"]} | {key(s["name"])}
    for v in vals:
        if key(v) and key(v) not in have:
            s[field].append(v)
            have.add(key(v))


for unit in (1, 2, 3):
    d = json.load(open(os.path.join(BUILD, "structures", f"unit{unit}.json"), encoding="utf8"))
    for f in d["flat"]:
        raw = clean(f["name"])
        specs = spec_for(raw, f["group"])
        if specs is None:
            continue
        if specs == "MISSING":
            m = re.match(r"^(.*?)\s*\(([^()]*)\)\s*$", raw)
            name, syn, ab = raw, [], []
            if m and m.group(1):
                name, inner = m.group(1), m.group(2)
                (ab if re.fullmatch(r"[A-Z/ ]{2,8}", inner) else syn).append(inner)
            if " or " in name:
                parts = [p.strip() for p in name.split(" or ")]
                name, syn = parts[0], syn + parts[1:]
            specs = [S(sentence(name), syn, ab)]
            auto.append(raw)
        lab, group = lab_label(f["lab"], unit), clean(f["group"] or "") or None
        for sp in specs:
            s = get(sp["name"], unit)
            addsyn(s, sp["syn"])
            addsyn(s, sp["ab"], "abbreviations")
            note = f["note"] or (raw if key(raw) != key(sp["name"]) else None)
            ent = dict(unit=unit, lab=lab, group=group, note=note)
            if ent not in s["lists"]:
                s["lists"].append(ent)
            if sp["parent"]:
                s["parent"] = key(sp["parent"])
            elif f.get("parent") and not s["parent"]:
                s["parent"] = key(f["parent"])
            s["concept"] = s["concept"] or sp["concept"]
            s["laterality"] = sp["lat"] or s["laterality"]
            s["region"] = sp["region"] or s["region"]
            s.setdefault("_hint", region_for(sp["name"], group, f["lab"], unit))

for roman, name, syn in CRANIALS:
    s = get(name, 2)
    n = ARABIC[roman]
    suffix = "th" if n > 3 else {1: "st", 2: "nd", 3: "rd"}[n]
    addsyn(s, [f"cranial nerve {roman}", f"cranial nerve {n}", f"{n}{suffix} cranial nerve", roman] + syn)
    addsyn(s, [f"CN {roman}"], "abbreviations")
    groups = ([] if roman == "XI" else ["Cranial nerves I-VIII, IX/X, and XII on a wet specimen"]) + ["Cranial nerves I-XII on an image or schematic"]
    for grp in groups:
        ent = dict(unit=2, lab="Lab 7", group=grp, note="Accessory nerve is not present on our brainstems" if roman == "XI" else None)
        if ent not in s["lists"]:
            s["lists"].append(ent)
    s["region"] = "cranial nerves"
    s["laterality"] = "paired"

for k in order:
    s = structs[k]
    if s["parent"]:
        p = structs.get(s["parent"])
        s["parent"] = p["slug"] if p else None
    s["region"] = s["region"] or s.pop("_hint", None) or "brain"
    s.pop("_hint", None)
    s["laterality"] = s["laterality"] or laterality_for(s["name"], s["concept"], s["region"])
    if s["slug"] in ("broca-s-area", "wernicke-s-area"):
        s["laterality"] = "left"
    if s["parent"] is None and s["slug"] in ("putamen", "globus-pallidus", "caudate-nucleus"):
        s["parent"] = "basal-ganglia"

out = []
for k in order:
    s = structs[k]
    unit = min(l["unit"] for l in s["lists"]) if s["lists"] else s["unit"]
    out.append({"slug": s["slug"], "name": s["name"], "unit": f"u{unit}", "synonyms": s["synonyms"], "abbreviations": s["abbreviations"],
                "region": s["region"], "lists": s["lists"], "laterality": s["laterality"], "parent": s["parent"], "concept": s["concept"],
                "info": {}, "atlas": {"meshIds": [], "approximate": False}})
slugs = [o["slug"] for o in out]
assert len(set(slugs)) == len(slugs), "duplicate slugs"
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, "w", encoding="utf8"), ensure_ascii=False, indent=1)
print(len(out), "structures; auto-derived:", len(auto))
for u in auto:
    print("  auto:", u)
