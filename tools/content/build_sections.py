"""CONTENT-3: section cards (level identification) + label-occlusion pin cards from PDF text labels.
Needs spans.json produced by scan_spans.py. Run: tools/.venv/Scripts/python.exe -I tools/content/build_sections.py <spans.json> [--review]"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pwlib import ROOT, C

SPANS = json.load(open(sys.argv[1], encoding="utf8"))
REVIEW = "--review" in sys.argv
S = json.load(open(os.path.join(C, "structures.json"), encoding="utf8"))
by = {s["slug"]: s for s in S}
norm = lambda t: re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", t.lower().replace("’", "'").replace("'", "")).strip())
STOP = {"genu", "body", "head", "tail", "anterior", "posterior", "crus", "columns", "column", "superior", "inferior", "lateral", "medial", "pons", "fissure", "horn", "ventricle", "gyrus", "nucleus", "tract", "root", "process", "arch"}
idx = {}
for s in S:
    if s.get("concept"):
        continue
    for k in {norm(s["name"])} | {norm(x) for x in s.get("synonyms", []) + s.get("abbreviations", [])}:
        if k and len(k) > 2:
            idx.setdefault(k, set()).add(s["slug"])
IDX = {k: next(iter(v)) for k, v in idx.items() if len(v) == 1 and k not in STOP}

# slug -> (deck, labelled pages, extra stoplist of spans indices to ignore as prose)
PAGES = {"lab-13": [7, 8, 9, 10, 11, 12], "lab-14": [4, 5, 6, 7, 8, 9, 10, 11, 12, 13], "lab-04": [3, 10, 12], "lecture-04": [30, 31], "lab-01": [14],
         "lecture-11": [25], "lab-11": [3]}
# labelled-image pages where only listed span indexes are label targets (others only masked)
ONLY = {("lab-01", 14): [16, 32], ("lecture-11", 25): [30], ("lab-04", 3): [2], ("lab-04", 10): [27], ("lab-11", 3): []}
FORCE = {  # (deck,page,first span index) -> (structure slug, answer, accept)
    ("lab-01", 14, 16): ("temporal-bone", "Temporal bone", ["temporal"]),
    ("lab-01", 14, 32): ("pterion", "Pterion", []),
    ("lecture-11", 25, 30): ("paramedian-pontine-reticular-formation", "Paramedian pontine reticular formation (PPRF)", ["pprf", "lateral gaze center", "horizontal gaze center"]),
    ("lab-04", 10, 27): ("dural-sleeves", "Dural sleeves", ["dural sleeve"]),
    ("lab-04", 3, 2): ("vertebral-arch", "Vertebral arch", ["arch"]),
    ("lecture-04", 30, 13): ("intermediate-zone", "Intermediate zone (lateral horn)", ["lateral horn", "intermediate gray"]),
    ("lecture-04", 31, 8): ("intermediate-zone", "Intermediate zone (lateral horn)", ["lateral horn", "intermediate gray"]),
    ("lecture-04", 30, 27): ("lateral-funiculus", "Lateral funiculus", ["lateral column"]),
    ("lecture-04", 30, 28): ("anterior-funiculus", "Anterior (ventral) funiculus", ["ventral funiculus", "anterior column", "ventral column"]),
}
# lab-13: stacked "Internal Capsule / Genu" labels
FORCE.update({
    ("lab-13", 9, 13): ("genu-of-internal-capsule", "Genu of internal capsule", ["internal capsule genu", "knee of internal capsule"]),
    ("lab-13", 10, 19): ("genu-of-internal-capsule", "Genu of internal capsule", ["internal capsule genu", "knee of internal capsule"]),
    ("lab-13", 9, 12): ("anterior-limb-of-internal-capsule", "Anterior limb of internal capsule", ["anterior limb"]),
    ("lab-13", 9, 14): ("posterior-limb-of-internal-capsule", "Posterior limb of internal capsule", ["posterior limb"]),
    ("lab-13", 10, 18): ("anterior-limb-of-internal-capsule", "Anterior limb of internal capsule", ["anterior limb"]),
    ("lab-13", 10, 20): ("posterior-limb-of-internal-capsule", "Posterior limb of internal capsule", ["posterior limb"]),
})
SKIP_GENERIC = set()


def line_groups(pg):
    """Return label groups: list of dicts {idx:[...], text, bbox}. Spans sharing a text line with others are prose."""
    sp = pg["spans"]
    rows = []
    for i, (t, b, sz) in enumerate(sp):
        mates = [j for j, (t2, b2, s2) in enumerate(sp) if j != i and abs((b2[1] + b2[3]) / 2 - (b[1] + b[3]) / 2) < 4 and (b2[0] - b[2] < 10 and b[0] - b2[2] < 10)]
        rows.append((i, bool(mates)))
    prose = {i for i, m in rows if m}
    cand = [i for i in range(len(sp)) if i not in prose and len(sp[i][0]) <= 32 and sp[i][2] >= 8 and not re.fullmatch(r"\d+", sp[i][0])]
    cand.sort(key=lambda i: (sp[i][1][1], sp[i][1][0]))
    groups, used = [], set()
    for i in cand:
        if i in used:
            continue
        g = [i]; used.add(i)
        changed = True
        while changed:
            changed = False
            for j in cand:
                if j in used:
                    continue
                last = sp[g[-1]][1]; b = sp[j][1]
                cx1, cx2 = (last[0] + last[2]) / 2, (b[0] + b[2]) / 2
                if 0 <= b[1] - last[1] < 18 and b[1] > last[1] and abs(cx1 - cx2) < 40 and b[1] - last[3] < 4:
                    g.append(j); used.add(j); changed = True; break
        groups.append(g)
    return groups


def merged_masks(pg):
    W, H = pg["w"], pg["h"]
    out = []
    for i, (t, b, sz) in enumerate(pg["spans"]):
        if re.fullmatch(r"\d+", t) and b[1] < 40 and b[0] < 30:
            continue
        x0, y0, x1, y1 = b[0] - 1.5, b[1] - 0.5, b[2] + 1.5, b[3] + 0.5
        out.append({"shape": "rect", "x": round(max(x0, 0) / W, 4), "y": round(max(y0, 0) / H, 4), "w": round((min(x1, W) - max(x0, 0)) / W, 4), "h": round((min(y1, H) - max(y0, 0)) / H, 4)})
    return out


def rect_of(pg, g):
    W, H = pg["w"], pg["h"]
    bs = [pg["spans"][i][1] for i in g]
    x0, y0, x1, y1 = min(b[0] for b in bs) - 1.5, min(b[1] for b in bs) - 0.5, max(b[2] for b in bs) + 1.5, max(b[3] for b in bs) + 0.5
    return {"shape": "rect", "x": round(x0 / W, 4), "y": round(y0 / H, 4), "w": round((x1 - x0) / W, 4), "h": round((y1 - y0) / H, 4)}


from PIL import Image
def imsize(deck, n):
    return Image.open(os.path.join(ROOT, "content-build", "decks", deck, "pages", f"{n:03d}.webp")).size


def titleize(slug, text):
    return by[slug]["name"]


unit_of = {"lab-13": "u3", "lab-14": "u3", "lab-04": "u1", "lecture-04": "u1", "lab-01": "u1", "lecture-11": "u2", "lab-11": "u2"}
cards = {"u1": [], "u2": [], "u3": []}
rep = []
for deck, pages in PAGES.items():
    u = unit_of[deck]
    for n in pages:
        pg = SPANS[deck]["pages"][n - 1]
        masks = merged_masks(pg)
        targets = []
        groups = line_groups(pg)
        for g in groups:
            key = (deck, n, g[0])
            texts = [pg["spans"][i][0] for i in g]
            cand = []
            if (deck, n) in ONLY:
                continue
            if key in FORCE:
                cand.append((FORCE[key], g))
            else:
                full = norm(" ".join(texts))
                if full in IDX:
                    cand.append(((IDX[full], by[IDX[full]]["name"], []), g))
                elif len(texts) == 1 and norm(texts[0]) in IDX:
                    cand.append(((IDX[norm(texts[0])], by[IDX[norm(texts[0])]]["name"], []), g))
                else:
                    # stacked: "<last line> <first line>" e.g. Body + Corpus callosum, Head + Caudate
                    for k in range(1, len(texts)):
                        for cmb in (norm(texts[k] + " of " + texts[0]), norm(texts[k] + " " + texts[0])):
                            if cmb in IDX:
                                cand.append(((IDX[cmb], by[IDX[cmb]]["name"], []), [g[k]])); break
            for (slug, ans, acc), gg in cand:
                targets.append((slug, ans, acc, gg))
        if (deck, n) in ONLY:
            for first in ONLY[(deck, n)]:
                key = (deck, n, first)
                slug, ans, acc = FORCE[key]
                targets.append((slug, ans, acc, [first] if key != ('lab-01', 14, 32) else [32, 33, 34, 35, 36, 37, 38]))
        for slug, ans, acc, gg in targets:
            tgt = rect_of(pg, gg)
            s = by[slug]
            acc = sorted(set(acc) | {a for a in s.get("synonyms", []) + s.get("abbreviations", []) if norm(a) != norm(ans)})
            c = {"slug": f"sections-{deck}-p{n:02d}-{slug}-{gg[0]}", "kind": "pin", "topic": f"sections-{u}", "structure": slug, "status": "live",
                 "position": len(cards[u]) + 1 + 200, "source": {"type": "pdf-labels", "ref": f"{deck} page {n} text label"},
                 "answer": ans, "accept": acc, "require_side": False,
                 "image": f"decks/{deck}/pages/{n:03d}.webp", "w": imsize(deck, n)[0], "h": imsize(deck, n)[1],
                 "target": tgt, "masks": masks, "pointer": {"type": "mask"}, "prompt": "Name the structure the leader line / label points to.", "followups": [], "tags": ["section", "label-occlusion"]}
            if REVIEW:
                rep.append((deck, n, slug, ans, gg))
            cards[u].append(c)

# ----------------------- level-identification cards (section kind): images are clean embedded photos
def lvl(u, slug, image, w, h, answer, accept, prompt, ref, explain=None, status="live", note=None):
    c = {"slug": f"sections-{u}-{slug}", "kind": "section", "topic": f"sections-{u}", "status": status, "position": len(cards[u]) + 1,
         "source": {"type": "slides", "ref": ref}, "image": image, "w": w, "h": h, "prompt": prompt, "answer": answer, "accept": accept,
         "require_side": False, "format": "type", "tags": ["section", "level"], "pointer": {"type": "mask"}}
    del c["pointer"]
    if explain: c["explain"] = explain
    if note: c["review_note"] = note; c["status"] = "draft"
    cards[u].append(c)


BS = [("rostral-midbrain", "lab-10/images/s007_1.webp", 692, 528, "Rostral midbrain", ["rostral midbrain", "superior colliculus level", "midbrain at the superior colliculus", "upper midbrain"], "Level of the superior colliculus: red nuclei, substantia nigra, cerebral peduncles."),
      ("caudal-midbrain", "lab-10/images/s009_1.webp", 524, 492, "Caudal midbrain", ["caudal midbrain", "inferior colliculus level", "midbrain at the inferior colliculus", "lower midbrain"], "Level of the inferior colliculus: decussation of the superior cerebellar peduncle."),
      ("rostral-pons", "lab-10/images/s011_1.webp", 800, 468, "Rostral pons", ["rostral pons", "upper pons", "trigeminal nerve level", "level of the trigeminal nerve"], "Level of the trigeminal nerve: principal sensory and motor trigeminal nuclei, MCP."),
      ("caudal-pons", "lab-10/images/s013_1.webp", 784, 532, "Caudal pons", ["caudal pons", "lower pons", "facial colliculus level", "level of the facial colliculus"], "Level of the facial colliculus: abducens and facial nuclei."),
      ("rostral-medulla", "lab-10/images/s015_1.webp", 624, 508, "Rostral medulla", ["rostral medulla", "upper medulla", "level of the olive", "olive level"], "Level of the olive: inferior olivary nucleus, pyramids."),
      ("caudal-medulla", "lab-10/images/s017_1.webp", 584, 460, "Caudal medulla", ["caudal medulla", "lower medulla", "cuneate and gracile tubercles", "level of the cuneate and gracile tubercles"], "Level of the gracile and cuneate nuclei: the sensory decussation (internal arcuate fibers)."),
      ("cervicomedullary", "lab-10/images/s019_1.webp", 1236, 1600, "Brainstem to spinal cord transition (motor decussation)", ["motor decussation", "pyramidal decussation", "cervicomedullary junction", "spinal cord transition", "medulla spinal cord junction"], "Level of the motor (pyramidal) decussation at the medulla-spinal cord junction."),
      ("cervical-cord-histology", "lab-10/images/s021_1.webp", 1236, 1600, "Cervical spinal cord", ["cervical", "cervical cord", "cervical spinal cord"], "Cervical level: large ventral horns for limb muscles and a large amount of white matter.")]
for slug, img, w, h, ans, acc, ex in BS:
    lvl("u2" if "cord" not in slug else "u1", slug, f"decks/{img.split('/')[0]}/images/{img.split('/')[-1]}", w, h, ans, acc, "Which brainstem / spinal level is this section?" if "cord" not in slug else "Which spinal cord level is this section? (cervical, thoracic, lumbar or sacral)", f"lab-10 ({ex[:0]}level titles)", explain=ex)
SP4 = [("cervical", "lab-05/images/s004_1.webp", 1008, 1600, "Cervical spinal cord", "Large oval cord, large dorsal columns and a large ventral horn; much white matter."),
       ("thoracic", "lab-05/images/s006_1.webp", 826, 1228, "Thoracic spinal cord", "Small ventral horns, a lateral horn (T1-L2), small grey matter overall."),
       ("lumbar", "lab-05/images/s008_1.webp", 1000, 1273, "Lumbar spinal cord", "Large, round cord with big ventral and dorsal horns (limb enlargement) and less white matter."),
       ("sacral", "lab-05/images/s010_1.webp", 1012, 1174, "Sacral spinal cord", "Small cord with mostly grey matter and little white matter.")]
for slug, img, w, h, ans, ex in SP4:
    lvl("u1", f"spinal-{slug}", f"decks/{img.split('/')[0]}/images/{img.split('/')[-1]}", w, h, ans, [ans.split()[0].lower()], "Which spinal cord level is this section? (cervical, thoracic, lumbar or sacral)", "lab-5 (unlabelled spinal cord sections)", explain=ex)
COR = [("1", "most anterior (frontal pole, surface view)"), ("2", "anterior to the corpus callosum"), ("3", "genu of the corpus callosum"), ("4", "anterior horns of the lateral ventricles"),
       ("5", "level of the nucleus accumbens"), ("6", "anterior commissure"), ("7", "anterior part of the thalamus"), ("8", "level of the substantia nigra"),
       ("9", "posterior thalamus"), ("10", "trigone of the lateral ventricles"), ("11", "posterior to the thalamus"), ("12", "posterior to the corpus callosum")]
for i, (num, desc) in enumerate(COR):
    n = i + 3
    wh = {3: (898, 764), 4: (927, 784), 5: (909, 852), 6: (917, 878), 7: (963, 949), 8: (953, 928), 9: (963, 917), 10: (992, 977), 11: (1000, 1050), 12: (979, 1052), 13: (1003, 1084), 14: (1038, 1068)}[n]
    first = desc.split(" (")[0]
    lvl("u3", f"coronal-{num}", f"decks/lab-14/images/s{n:03d}_1.webp", wh[0], wh[1], f"Coronal section {num}: {desc}", [desc, first, f"section {num}", f"#{num}"],
        "Which coronal plane (landmark level) is this section? Lab 14 numbers them from anterior (#1) to posterior (#12).", "lab-14 slide titles")
HOR = [("above the corpus callosum (centrum semiovale)", "lab-13/images/s006_1.webp"), ("through the body of the corpus callosum", "lab-13/images/s007_1.webp"), ("through the lateral ventricles (caudate head and septum pellucidum)", "lab-13/images/s008_1.webp"),
       ("through the thalamus and internal capsule (level 1)", "lab-13/images/s009_1.webp"), ("through the thalamus: putamen, globus pallidus and fornix (level 2)", "lab-13/images/s010_1.webp"), ("through the hypothalamus", "lab-13/images/s011_1.webp"), ("most inferior view (hippocampus, amygdala, midbrain)", "lab-13/images/s012_1.webp")]
for i, (desc, img) in enumerate(HOR):
    first = re.sub(r"\s*\(.*", "", desc)
    lvl("u3", f"horizontal-{i+1}", f"decks/{img.split('/')[0]}/images/{img.split('/')[-1]}", 1236, 1600, f"Horizontal section {i+1}: {desc}", [first, desc, f"section {i+1}"],
        "At which level was this horizontal section cut? (Lab 13 tour, numbered from superior #1 to inferior #7.)", "lab-13 slide titles", explain="Horizontal section tour (lab 13).")

# text-only landmark cards (section kind)
def txt(u, slug, prompt, answer, accept, ref, kw=None):
    c = {"slug": f"sections-{u}-{slug}", "kind": "section", "topic": f"sections-{u}", "status": "live", "position": len(cards[u]) + 1, "source": {"type": "slides", "ref": ref},
         "prompt": prompt, "answer": answer, "accept": accept, "require_side": False, "format": "keywords" if kw else "type", "tags": ["section", "landmark"]}
    if kw: c["keywords"] = kw
    cards[u].append(c)


for slug, p, a, acc in [("fac-colliculus", "Which brainstem level shows the facial colliculus?", "Caudal pons", ["caudal pons", "lower pons"]),
                        ("trig-motor", "Which brainstem level shows the motor and principal sensory nuclei of the trigeminal nerve?", "Rostral pons", ["rostral pons", "upper pons"]),
                        ("olive", "Which brainstem level is called the level of the olive?", "Rostral medulla", ["rostral medulla", "upper medulla"]),
                        ("cuneate", "Which brainstem level shows the cuneate and gracile tubercles and sensory decussation?", "Caudal medulla", ["caudal medulla", "lower medulla"]),
                        ("xscp", "At which brainstem level does the superior cerebellar peduncle decussate?", "Caudal midbrain (inferior colliculus level)", ["caudal midbrain", "inferior colliculus level", "inferior colliculus"]),
                        ("sc-level", "Which midbrain level shows the red nuclei and the substantia nigra?", "Rostral midbrain (superior colliculus level)", ["rostral midbrain", "superior colliculus level", "superior colliculus"]),
                        ("motor-dec", "At which level is the motor (pyramidal) decussation?", "Brainstem to spinal cord transition (caudal medulla)", ["caudal medulla", "medulla spinal cord junction", "cervicomedullary junction"]),
                        ("clarke", "At which spinal levels does the column of Clarke (nucleus dorsalis) exist?", "C8 to L2", ["c8-l2", "c8 to l2"]),
                        ("lateral-horn", "At which spinal levels is the lateral horn present?", "T1 to L2 (sympathetic) and S2-S4 (parasympathetic)", ["t1-l2", "t1 to l2"]),
                        ("lumbar-vs-thoracic", "Which spinal level has small ventral horns and a distinct lateral horn?", "Thoracic", ["thoracic", "t1-l2"])]:
    txt("u2" if slug not in ("clarke", "lateral-horn", "lumbar-vs-thoracic") else "u1", slug, p, a, acc, "lab-8, lab-10, lecture-6")

for u in cards:
    # pin cards come first in the file (positions already offset)
    with open(os.path.join(C, "cards", f"sections-{u}.json"), "w", encoding="utf8") as f:
        json.dump(cards[u], f, indent=1, ensure_ascii=False)
print({u: (sum(1 for c in cards[u] if c["kind"] == "pin"), sum(1 for c in cards[u] if c["kind"] == "section")) for u in cards})
if REVIEW:
    for r in rep:
        print(r)
