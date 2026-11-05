"""Practical-exam cards: identify stations -> pin cards (pointer existing), dependent stems -> theory cards (followups),
stand-alone stems -> theory cards with the station image. Output: content/nsci3250/cards/practical-u{1,2,3}.json
(only cards with source.type == 'practical' are replaced). Run: tools/.venv/Scripts/python.exe -I tools/content/build_practical_cards.py"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
from cardlib import BUILD, CONTENT, by_slug, match, keyn, index

EXAMS = [("practical-u1-2024", "practical-u1"), ("practical-u1-2025", "practical-u1"), ("practice-practical-lab3", "practical-u1"),
         ("practical-u2-2024", "practical-u2"), ("practical-u2-2025", "practical-u2"), ("practical-u3-2025", "practical-u3")]
EXTRA_ALIAS = {"caudate": "caudate-nucleus", "pica": None, "sympahtetic pre ganglionics": None, "principal sensory nucleu of v": "principal-sensory-nucleus-of-trigeminal",
               "mid sagittal or sagittal": "sagittal-plane", "ciliary body": None, "posterior horn of lv or inferior or trigone": "posterior-horn-of-lateral-ventricle"}
NOT_PIN = re.compile(r"(name one|name a |name the arterial|this structure|question \d|you named|answer for question|what space is located|which .* (is|are) (indicated|colored)? ?(deep|medial)|"
                     r"true or false|what is the function|what tract|where|axons from|which (cranial nerve|muscle|spinal))", re.I)
PIN_START = re.compile(r"^(\(refer[^)]*\)\s*)?([a-z]\)\s*|a\.\s*)?(name|identify|what is (the )?(anatomical |functional )?name|what is the structure|what structure|which ventricle|provide the functional name|what fold|id the|what part of the ventricular|what major structure|what white matter tract is shown|what white matter separates|what vessels)", re.I)
FORCE_PIN_NO = {("practical-u1-2024", 5), ("practical-u1-2025", 11)}


def img(relpath):
    return Image.open(os.path.join(BUILD, relpath)).size


def facet_for(q):
    t = q["question"].lower()
    if "muscle" in t:
        return "muscle"
    if "innervat" in t or "cranial nerve" in t:
        return "cranial_nerve"
    if "brodmann" in t or "brodman" in t:
        return "brodmann"
    if "vesicle" in t or "embryolog" in t:
        return "embryology"
    if "supply" in t or "artery" in t or "vessel" in t or "circulation" in t or "perfusion" in t:
        return "supply"
    if "fiber type" in t:
        return "fiber_type"
    if "receptor" in t:
        return "receptor"
    if "first-order" in t or "second-order" in t or "cell bodies" in t:
        return "order"
    if "ipsilateral or contralateral" in t:
        return "side"
    if "level" in t or "section" in t.split("?")[0] and "spinal cord" in t:
        return "level"
    if "damage" in t or "symptom" in t or "pathology" in t or "herniation" in t or "bleed" in t or "hematoma" in t or "aneurysm" in t:
        return "lesion"
    if "travels through" in t or "pass through" in t or "tract" in t:
        return "passes" if ("through" in t or "travels" in t) else "connections"
    if "synapse" in t or "originate" in t or "origin of" in t or "associated" in t or "deep" in t:
        return "connections"
    return "function"


OPT = re.compile(r"(?:^|\s)([A-E])[\.\)]\s+")


def parse_choices(text):
    ms = list(OPT.finditer(text))
    if len(ms) < 3 or ms[0].group(1) != "A":
        return None, None
    stem = text[:ms[0].start()].strip()
    opts = []
    for i, m in enumerate(ms):
        end = ms[i + 1].start() if i + 1 < len(ms) else len(text)
        opts.append((m.group(1), text[m.end():end].strip()))
    return stem, opts


def theory(q, exam, topic, structure, pin_slug, img_info, pos):
    n = q["n"]
    slug = f"{exam}-q{str(n).zfill(2)}"
    text = re.sub(r"\s+", " ", q["question"]).strip()
    ans = (q.get("answer") or "").strip()
    c = {"slug": slug, "kind": "theory", "topic": topic, "structure": structure, "status": "live", "position": pos,
         "source": {"type": "practical", "ref": f"{exam} Q{n}"}, "facet": facet_for(q), "prompt": text, "answer": ans, "accept": [],
         "keywords": None, "choices": None, "format": "type", "require_side": False}
    if pin_slug:
        c["after_pin"] = pin_slug
    if img_info:
        c.update(img_info)
    notes = []
    if not ans:
        c["status"] = "draft"
        notes.append("no answer key in the course zip")
    if re.match(r"^(true or false|true or false:)", text, re.I) or "true or false" in text.lower()[:20]:
        c["format"] = "tf"
        c["answer"] = "True" if ans.lower().startswith("t") else "False" if ans else ""
    else:
        stem, opts = parse_choices(text)
        if opts:
            letter = re.match(r"^\(?([A-E])\b", ans)
            chosen = next((o for o in opts if letter and o[0] == letter.group(1)), None)
            c["format"] = "choice"
            c["prompt"] = stem
            c["choices"] = [o[1] for o in opts]
            if chosen:
                c["answer"] = chosen[1]
            else:
                c["status"] = "draft"; notes.append("could not match the key letter to an option")
        elif re.search(r"\b[A-D]( [A-D])+\b\s*$|\(A, B, C, or D\)", text):
            c["format"] = "choice"; c["choices"] = ["A", "B", "C", "D"]; c["answer"] = ans[:1] if ans else ""
        else:
            alts = [a.strip() for a in re.split(r",|/|;| or ", ans) if a.strip()]
            if len(alts) > 1 and (re.search(r"name one|name a|one ", text, re.I) or len(alts) >= 2):
                c["format"] = "keywords"; c["keywords"] = [alts]
            elif len(ans.split()) > 4:
                c["status"] = "draft" if c["status"] != "draft" else "draft"
                notes.append("free-text answer; add keyword groups")
    if notes:
        c["review_note"] = "; ".join(notes)
    return c


cards = {"practical-u1": [], "practical-u2": [], "practical-u3": []}
stats = {"pin": 0, "theory": 0}
for exam, topic in EXAMS:
    p = json.load(open(os.path.join(BUILD, "practicals", exam + ".json"), encoding="utf8"))
    last_pin = None
    pins = {}
    for q in p["questions"]:
        n = q["n"]
        text = re.sub(r"\s+", " ", q["question"]).strip()
        files = q.get("image_page_files") or ([q["page_image"]] if q.get("page_image") else [])
        is_pin = bool(PIN_START.search(text)) and not NOT_PIN.search(text) and (n, exam) not in FORCE_PIN_NO and (exam, n) not in FORCE_PIN_NO
        if exam == "practical-u1-2024" and n in (12, 17, 23, 31, 32, 33):
            is_pin = n == 12
        if exam == "practical-u2-2025" and n in (8, 24):
            is_pin = True
        if exam == "practical-u1-2025" and n in (17, 24):
            is_pin = True
        if exam == "practical-u1-2025" and n in (2, 13):
            is_pin = False
        if exam == "practical-u3-2025" and n in (28, 30, 33, 6, 8, 9, 13, 26, 21, 23, 29):
            is_pin = n in (6, 8, 9, 13, 21, 23, 26, 29, 33)
        if exam == "practical-u3-2025" and n == "B2":
            is_pin = True
        if exam == "practical-u3-2025" and n in (10, 12, 16, 18):
            is_pin = False
        if exam == "practice-practical-lab3":
            is_pin = n in (1, 3, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 18)
            if n in (2, 4, 16, 17):
                last_pin = None
        slug_q = f"{exam}-q{str(n).zfill(2)}"
        pos = len(cards[topic]) + 1
        if is_pin:
            ans = (q.get("answer") or "").split(" This image")[0].strip()
            key = keyn(re.sub(r"\(.*?\)", "", ans)) or keyn(ans)
            st = EXTRA_ALIAS.get(key, "MISS")
            how = "alias"
            if st == "MISS":
                st, how, sc, _ = match(ans) if ans else (None, "none", 0, None)
                if how == "fuzzy" and sc < 88:
                    st = None
                if how == "ambiguous":
                    st = None
            canon = by_slug[st]["name"] if st else ans
            accept = [ans] if ans and keyn(ans) != keyn(canon) else []
            mk = (q.get("marker") or [{}])[0]
            color = " ".join(x for x in (mk.get("color"), mk.get("marker")) if x) or None
            w = h = None
            extra = []
            if files:
                w, h = img(files[0])
                extra = files[1:]
            notes = []
            status = "live"
            if not ans:
                status = "draft"; notes.append("no answer key in the course zip (practical-u2-2024 has none): owner must supply the answer")
            if exam == "practical-u1-2024" and n == 1:
                status = "draft"; notes.append("exam asks for a suture but the key says 'Frontal bone': probable key/question mismatch")
            if ans and not st:
                notes.append("answer is not on the official structure list") if how in ("none", "fuzzy") else None
            c = {"slug": slug_q, "kind": "pin", "topic": topic, "structure": st, "status": status, "position": pos,
                 "source": {"type": "practical", "ref": f"{exam} Q{n}"}, "answer": canon, "accept": accept, "require_side": False,
                 "image": files[0] if files else None, "w": w, "h": h, "target": None, "masks": [],
                 "pointer": {"type": "existing", "color": color}, "prompt": text, "followups": [], "followup_cards": [],
                 "tags": ["practical", exam]}
            if extra:
                c["extra_images"] = extra
            if notes:
                c["review_note"] = "; ".join(x for x in notes if x)
            cards[topic].append(c)
            pins[n] = c
            last_pin = c
            stats["pin"] += 1
        else:
            # dependent? refers to a question number, or follows a pin on the same image page(s)
            m = re.search(r"question (\d+)", text, re.I)
            dep = pins.get(int(m.group(1))) if m else None
            if not dep and last_pin and (set(q.get("image_pages") or []) & set(last_pin.get("_pages", [])) or q.get("page") == last_pin.get("_page") or not q.get("image_pages")):
                dep = last_pin
            if not dep and last_pin and files and last_pin.get("image") in files:
                dep = last_pin
            info = None
            if not dep and files:
                w, h = img(files[0])
                mk = (q.get("marker") or [{}])[0]
                color = " ".join(x for x in (mk.get("color"), mk.get("marker")) if x) or None
                info = {"image": files[0], "w": w, "h": h, "pointer": {"type": "existing", "color": color}}
            t = theory(q, exam, topic, dep["structure"] if dep else None, dep["slug"] if dep else None, info, pos)
            cards[topic].append(t)
            stats["theory"] += 1
            if dep:
                dep["followup_cards"].append(t["slug"])
                if dep["structure"]:
                    dep["followups"].append(f"{dep['structure']}:{t['facet']}")
        if is_pin:
            last_pin["_pages"] = q.get("image_pages") or []
            last_pin["_page"] = q.get("page")
for topic, lst in cards.items():
    for c in lst:
        c.pop("_pages", None); c.pop("_page", None)
    path = os.path.join(CONTENT, "cards", topic + ".json")
    old = []
    if os.path.exists(path):
        old = [c for c in json.load(open(path, encoding="utf8")) if c.get("source", {}).get("type") != "practical"]
    json.dump(old + lst, open(path, "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print(topic, len(lst), "practical cards;", sum(1 for c in lst if c["kind"] == "pin"), "pins")
print(stats)
