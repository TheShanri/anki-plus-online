"""Shared matching helpers for the content builders: normalisation, structure index, fuzzy match, vocabulary."""

import glob, json, os, re, struct, sys, unicodedata
from rapidfuzz import fuzz

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
BUILD = os.path.join(ROOT, "content-build")
CONTENT = os.path.join(ROOT, "content", "nsci3250")

DECK_TOPIC = {"lab-1": "lab-1", "lab-2": "lab-2", "lab-3": "lab-3", "lab-4": "lab-4", "lab-5": "lab-5", "lab-7": "lab-7",
              "lab-8-diagrams": "lab-8", "lab-8-surface-brainstem-histology": "lab-8", "brainstem-overlay": "brainstem-overlay",
              "visual-system-supplemental-material": "lab-11", "lab-13": "lab-13", "lab-14": "lab-14", "lab-15": "lab-15",
              "lab-16": "lab-16", "unit-1-practice-practicals": "practical-u1-practice"}


def norm(s):
    s = unicodedata.normalize("NFKD", s.lower().replace("&", " and "))
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"\b(the|of the)\b", " ", s)
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    s = re.sub(r"\b(\w{4,}?)(es|s)\b", r"\1", s) if False else s
    return re.sub(r"\s+", " ", s)


def singular(s):
    return " ".join(w[:-1] if len(w) > 4 and w.endswith("s") and not w.endswith(("ss", "us", "is")) else w for w in s.split())


def keyn(s):
    return singular(norm(s))


def img_size(path):
    with open(path, "rb") as f:
        b = f.read(65536)
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", b[16:24])
    if b[:2] == b"\xff\xd8":
        i = 2
        while i < len(b):
            if b[i] != 0xFF:
                i += 1
                continue
            m = b[i + 1]
            if 0xC0 <= m <= 0xCF and m not in (0xC4, 0xC8, 0xCC):
                h, w = struct.unpack(">HH", b[i + 5:i + 9])
                return w, h
            i += 2 + struct.unpack(">H", b[i + 2:i + 4])[0]
    raise ValueError(path)


def clean_ocr(t):
    t = t.replace("​", "").replace("一", "-").replace("←", " ").replace("→", " ")
    t = re.sub(r"\s+", " ", t).strip(" -;,")
    return t


structures = json.load(open(os.path.join(CONTENT, "structures.json"), encoding="utf8"))
by_slug = {s["slug"]: s for s in structures}
index = {}   # normalised string -> set(slug)
for s in structures:
    for v in [s["name"]] + s["synonyms"] + s["abbreviations"]:
        index.setdefault(keyn(v), set()).add(s["slug"])
cand_keys = list(index.keys())
aliases = {}
ap = os.path.join(HERE, "pin_aliases.json")
if os.path.exists(ap):
    for k, v in json.load(open(ap, encoding="utf8")).items():
        aliases[keyn(k)] = v
overrides = {}
op = os.path.join(HERE, "pin_overrides.json")
if os.path.exists(op):
    overrides = json.load(open(op, encoding="utf8"))

# vocabulary from slides, practicals, structures (to judge whether an unmatched OCR string is real text)
vocab = set()
for f in glob.glob(os.path.join(BUILD, "decks", "*", "slides.json")):
    try:
        for sl in json.load(open(f, encoding="utf8"))["slides"]:
            for fld in ("title", "text", "notes"):
                vocab.update(re.findall(r"[a-z][a-z'\-]{2,}", unicodedata.normalize("NFKD", (sl.get(fld) or "").lower())))
    except Exception:
        pass
for f in glob.glob(os.path.join(BUILD, "practicals", "*.json")):
    vocab.update(re.findall(r"[a-z][a-z'\-]{2,}", json.dumps(json.load(open(f, encoding="utf8"))).lower()))
for s in structures:
    for v in [s["name"]] + s["synonyms"]:
        vocab.update(re.findall(r"[a-z][a-z'\-]{2,}", v.lower()))


def variants(t):
    out = [t]
    u = re.sub(r"^[\d\s.\-:]+(?=[A-Za-z])", "", t)
    out.append(u)
    out.append(re.sub(r"^(CN\s*)?[IVX]{1,4}\.?\s+(?=[A-Za-z])", "", u))
    out.append(re.sub(r"\s*\(.*?\)\s*", " ", u).strip())
    out.append(re.sub(r"\s+(a\.?k\.?a\.?:?|aka).*$", "", u, flags=re.I).strip())
    out.append(re.sub(r"[;:].*$", "", u).strip())
    m = re.match(r"^(.*?)\s*\((.*?)\)?$", u)
    if m:
        out += [m.group(1), m.group(2)]
    out = [x for x in out if x]
    seen, res = set(), []
    for x in out:
        if keyn(x) not in seen:
            seen.add(keyn(x))
            res.append(x)
    return res


def match(text):
    """-> (slug|None, how, score, runner_up) using exact (name/synonym/alias) then fuzzy match."""
    best = (None, "none", 0, None)
    for v in variants(text):
        k = keyn(v)
        if not k:
            continue
        if k in aliases:
            return aliases[k], "alias", 100, None
        if k in index:
            sl = sorted(index[k])
            return (sl[0], "exact" if len(sl) == 1 else "ambiguous", 100, ", ".join(sl) if len(sl) > 1 else None)
        if len(k) < 5:
            continue
        scored = sorted(((fuzz.ratio(k, c), c) for c in cand_keys), reverse=True)[:4]
        sc, c = scored[0]
        second = max((x for x in scored[1:] if index[x[1]] != index[c]), default=(0, None))[0]
        if sc > best[2]:
            best = (sorted(index[c])[0], "fuzzy", sc, second)
    return best


GENERIC = {
    "body": [("body-of-corpus-callosum", [r"genu", r"splenium", r"corpus callosum"]), ("body-of-caudate-nucleus", [r"head", r"tail", r"caudate"]),
             ("body-of-fornix", [r"crus", r"column", r"fornix"]), ("body-of-lateral-ventricle", [r"horn", r"atrium", r"trigon"])],
    "genu": [("genu-of-corpus-callosum", [r"splenium", r"body", r"corpus callosum"]), ("genu-of-internal-capsule", [r"limb", r"internal capsule"])],
    "head": [("head-of-caudate-nucleus", [r"tail", r"body", r"caudate", r"putamen"])],
    "tail": [("tail-of-caudate-nucleus", [r"head", r"body", r"caudate", r"putamen"])],
    "column": [("columns-of-the-fornix", [r"crus", r"body", r"fornix"])],
    "crus": [("crus-of-fornix", [r"column", r"body", r"fornix"])],
}
generic_unresolved = False


def vocab_ok(t):
    ws = re.findall(r"[a-z][a-z'\-]{2,}", unicodedata.normalize("NFKD", t.lower()))
    return bool(ws) and all(w in vocab for w in ws)


def shape_of(o):
    if o["shape"] == "rect":
        return {"shape": "rect", "x": o["left"], "y": o["top"], "w": o["width"], "h": o["height"]}
    pts = [[float(v) for v in p.split(",")] for p in o["points"].split()]
    return {"shape": "polygon", "points": pts}


