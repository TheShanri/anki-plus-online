"""CONTENT-3: written-exam MCQ -> theory cards in practice-exam-u* topics. Run with -I."""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pwlib import C, ROOT
P = os.path.join(ROOT, "content-build", "practicals")
# Unit 1 practice-exam key is blank in the source: answers below are from standard neuroanatomy (draft).
U1_KEY = {1:"a",2:"c",3:"e",4:"b",5:"a",6:"d",7:"c",8:"b",9:"e",10:"e",11:"d",12:"b",13:"b",14:"c",15:"a",16:"a",17:"e",18:"d",19:"e",20:"b",
          21:"e",22:"c",23:"b",24:"b",25:"d",26:"e",27:"b",28:"d",29:"c",30:"b"}
EXAMS = [("u1", "practice-exam-u1", "Practice exam 1", True), ("u1", "si-session-4", "SI session 4 test", False),
         ("u2", "practice-exam-u2", "Practice exam 2", False), ("u2", "si-session-5", "SI session 5 test", False),
         ("u3", "practice-exam-u3", "Practice exam 3 (= SI session 8 test)", False), ("u3", "si-session-7", "SI session 7 test", False)]
IMG = re.compile(r"\b(below|diagram|picture|pictured|figure|drawing|draw)\b", re.I)
out = {"u1": [], "u2": [], "u3": []}
norm = lambda s: re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()
for unit, ex, label, blank in EXAMS:
    d = json.load(open(os.path.join(P, f"exam-{ex}.json"), encoding="utf8"))
    for q in d["questions"]:
        if q["type"] != "multiple_choice" or len(q["options"]) < 2:
            continue
        if IMG.search(q["question"]):
            continue
        letters = U1_KEY.get(q["n"]) if blank else None
        ans = [letters] if blank else q.get("answer_letters", [])
        opts = {o["letter"]: o["text"].strip() for o in q["options"]}
        card = {"slug": f"written-{unit}-{ex}-q{q['n']:02d}", "kind": "theory", "topic": f"practice-exam-{unit}", "status": "live",
                "position": len(out[unit]) + 1, "source": {"type": "exam", "ref": f"{ex} Q{q['n']} ({label})"},
                "facet": "written", "prompt": q["question"].strip(), "format": "choice", "choices": [o["text"].strip() for o in q["options"]],
                "accept": [], "require_side": False, "tags": ["written", ex]}
        if len(ans) != 1 or ans[0] not in opts:
            card["status"] = "draft"; card["review_note"] = f"key lists {ans or 'no'} answer(s); multi-answer or unreadable"
            card["answer"] = " | ".join(opts[a] for a in ans if a in opts) or opts[sorted(opts)[0]]
            if len(ans) != 1: card["status"] = "draft"
        else:
            card["answer"] = opts[ans[0]]
        if blank:
            card["status"] = "draft"; card["review_note"] = "Unit 1 practice-exam key file is blank in the source; answer chosen from standard neuroanatomy. TA owner to confirm."
        out[unit].append(card)
# the Unit 3 key for the practice exam is shared with SI 8; dedupe identical prompts across files
for u in out:
    seen = set(); keep = []
    for c in out[u]:
        k = norm(c["prompt"])
        if k in seen: continue
        seen.add(k); keep.append(c)
    for i, c in enumerate(keep): c["position"] = i + 1
    json.dump(keep, open(os.path.join(C, "cards", f"written-{u}.json"), "w", encoding="utf8"), indent=1, ensure_ascii=False)
    print(u, len(keep), sum(1 for c in keep if c["status"] == "draft"))
