"""Add CONTENT-3 topics to course.json (idempotent)."""
import json, os
p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "content", "nsci3250", "course.json")
c = json.load(open(p, encoding="utf8"))
have = {t["slug"] for t in c["topics"]}
specs = [("pathways", "Pathways", "pathways", 90), ("sections", "Sections and levels", "sections", 91),
         ("clinical", "Clinical: lesion and deficit", "clinical", 92), ("practice-exam", "Practice exam", "practice_exam", 93)]
for u in ("u1", "u2", "u3"):
    for key, title, typ, pos in specs:
        slug = f"{key}-{u}"
        if slug in have: continue
        c["topics"].append({"slug": slug, "unit": u, "kind": "lab", "number": None, "title": title, "position": pos, "sources": [], "meta": {"type": typ}})
json.dump(c, open(p, "w", encoding="utf8"), indent=1, ensure_ascii=False)
print(len(c["topics"]))
