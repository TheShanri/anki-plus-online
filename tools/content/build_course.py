"""Build content/nsci3250/course.json (units + topics) from content-build/syllabus.json. Run with tools/.venv python -I."""
import json, os
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
B = os.path.join(ROOT, "content-build")
syl = json.load(open(os.path.join(B, "syllabus.json"), encoding="utf8"))
units = [{"slug": f"u{k}", "title": v, "position": int(k)} for k, v in syl["units"].items()]
# lecture/lab decks present in content-build
LECT_SRC = {18: ["decks/lecture-18-strokes-brain-bleeds"]}
LAB_SRC = {18: ["decks/lecture-18-cns-pathology-final"]}
APKG = {1: ["lab-1"], 2: ["lab-2"], 3: ["lab-3"], 4: ["lab-4"], 5: ["lab-5"], 7: ["lab-7"], 8: ["lab-8-diagrams", "lab-8-surface-brainstem-histology"],
        11: ["visual-system-supplemental-material"], 13: ["lab-13"], 14: ["lab-14"], 15: ["lab-15"], 16: ["lab-16"]}
topics, pos = [], {1: 0, 2: 0, 3: 0}
seen = set()
for row in syl["schedule"]:
    u = row.get("unit")
    if not u:
        continue
    lec, lab = row["lecture"], row["lab"]
    for kind, item in (("lecture", lec), ("lab", lab)):
        n = item.get("number")
        if not n or item.get("optional") or (kind, n) in seen:
            continue
        if kind == "lab" and n in (6, 12, 19, 20):
            continue
        seen.add((kind, n))
        srcs = []
        d = f"decks/{kind}-{n:02d}"
        if os.path.isdir(os.path.join(B, d)):
            srcs.append(d)
        srcs += (LECT_SRC if kind == "lecture" else LAB_SRC).get(n, [])
        if kind == "lab":
            srcs += [f"apkg/{a}" for a in APKG.get(n, [])]
            if n in (13, 14) and os.path.isdir(os.path.join(B, f"decks/lab-{n}-unlabeled")):
                srcs.append(f"decks/lab-{n}-unlabeled")
        pos[u] += 10
        t = {"slug": f"{kind}-{n}", "unit": f"u{u}", "kind": kind, "number": n, "title": item["topic"], "position": pos[u], "sources": srcs}
        if kind == "lab" and n == 18:
            t["meta"] = {"type": "clinical"}
        topics.append(t)
extra = [
    ("u1", "practical-u1", "Unit 1 practical exams", ["decks/practical-u1-2024", "decks/practical-u1-2025", "decks/practice-practical-lab3"], "practical"),
    ("u1", "practical-u1-practice", "Unit 1 practice practicals (Anki image occlusion)", ["apkg/unit-1-practice-practicals"], "practical"),
    ("u2", "brainstem-overlay", "Brainstem overlay atlas", ["apkg/brainstem-overlay", "decks/atlas-brainstem-overlay"], "atlas"),
    ("u2", "practical-u2", "Unit 2 practical exams", ["decks/practical-u2-2024", "decks/practical-u2-2025"], "practical"),
    ("u3", "practical-u3", "Unit 3 practical exam", ["decks/practical-u3-2025"], "practical"),
]
for u, slug, title, srcs, typ in extra:
    uu = int(u[1])
    pos[uu] += 10
    t = {"slug": slug, "unit": u, "kind": "lab", "number": None, "title": title, "position": pos[uu], "sources": srcs, "meta": {"type": typ}}
    topics.append(t)
for t in topics:
    t.setdefault("meta", {})
    if t["number"] is None:
        del t["number"]
json.dump({"slug": "nsci3250", "units": units, "topics": topics}, open(os.path.join(ROOT, "content", "nsci3250", "course.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
print(len(units), len(topics), [t["slug"] for t in topics])
