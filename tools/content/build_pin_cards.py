"""Build pin cards from the Anki image-occlusion decks: one card per occlusion target.
Inputs : content-build/apkg/*/notes.json, content-build/ocr/*.json (tools/content/ocr_apkg.py),
         content/nsci3250/structures.json, tools/content/pin_overrides.json (hand decisions, by card slug),
         tools/content/pin_aliases.json (OCR string -> structure slug, hand-curated)
Output : content/nsci3250/cards/<topic>.json  (kind pin)  +  content-build/pin_review.json (what to look at)
Run    : tools/.venv/Scripts/python.exe -I tools/content/build_pin_cards.py"""
import glob, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cardlib import *  # noqa: F401,F403
from cardlib import GENERIC, BUILD, CONTENT, DECK_TOPIC, aliases, by_slug, clean_ocr, fuzz, img_size, index, keyn, match, overrides, shape_of, vocab_ok, structures

topics = {}
review = []
stats = {"exact": 0, "alias": 0, "fuzzy": 0, "ambiguous": 0, "none": 0}
for deck in sorted(DECK_TOPIC):
    d = json.load(open(os.path.join(BUILD, "apkg", deck, "notes.json"), encoding="utf8"))
    ocr = json.load(open(os.path.join(BUILD, "ocr", deck + ".json"), encoding="utf8"))
    rotp = os.path.join(BUILD, "ocr_rot", deck + ".json")
    rot = json.load(open(rotp, encoding="utf8")) if os.path.exists(rotp) else {}
    tightp = os.path.join(BUILD, "ocr_tight", deck + ".json")
    tight = json.load(open(tightp, encoding="utf8")) if os.path.exists(tightp) else {}
    polyp = os.path.join(BUILD, "ocr_poly", deck + ".json")
    poly = json.load(open(polyp, encoding="utf8")) if os.path.exists(polyp) else {}
    topic = DECK_TOPIC[deck]
    for ni, nt in enumerate(d["notes"], 1):
        if "occlusions" not in nt:
            continue
        key_ = str(nt["id"])
        shapes = [o for o in nt["occlusions"] if o["shape"] != "text"]
        if not shapes:
            continue
        mediafile = nt["images"][0]
        base = os.path.splitext(mediafile)[0]
        w, h = img_size(os.path.join(BUILD, "apkg", deck, "media", mediafile))
        if max(w, h) > 2000:
            sc = 2000 / max(w, h)
            w, h = round(w * sc), round(h * sc)
        image = f"apkg/{deck}/media/{base}.webp"
        masks = [shape_of(o) for o in shapes]
        caption = "; ".join(t for t in (re.sub(r"\s+", " ", o["text"]).strip() for o in nt["occlusions"] if o["shape"] == "text") if t and t != "\\")
        res = {r["cloze"]: dict(r) for r in ocr[key_]}
        for cz, rr in (poly.get(key_) or {}).items():
            cur = res.get(int(cz))
            if cur is not None and rr["text"]:
                cur.update({"text": rr["text"], "conf": rr["conf"]})
        for cz, rr in (rot.get(key_) or {}).items():
            cur = res.get(int(cz))
            if cur is not None and rr["text"] and (cur["conf"] or 0) < 0.85 or (cur is not None and rr["conf"] > (cur["conf"] or 0) + 0.05):
                cur.update({"text": rr["text"], "conf": rr["conf"]})
        for pos, o in enumerate(sorted(shapes, key=lambda x: x["cloze"])):
            slug = f"{deck}-io-{nt['id']}-c{o['cloze']}"
            r = res.get(o["cloze"], {"text": "", "conf": 0})
            text = clean_ocr(r["text"])
            conf = r.get("conf") or 0
            slug_m, how, score, second = match(text) if text else (None, "none", 0, None)
            g = GENERIC.get(keyn(text))
            if g:
                sib = " | ".join(keyn(res[c]["text"]) for c in res if c != o["cloze"])
                hits = [slug for slug, pats in g if any(re.search(p_, sib) for p_ in pats)]
                if len(set(hits)) == 1:
                    slug_m, how, score = hits[0], "alias", 100
                else:
                    slug_m, how, score = None, "none", 0
                    generic_unresolved = True
            ok = False
            notes = []
            if how == "fuzzy" and (score < 88 or (second and score - second < 4) or len(keyn(text)) < 6):
                notes.append(f"weak fuzzy match to '{by_slug[slug_m]['name']}' ({score:.0f})")
                slug_m, how2 = None, "none"
                how = "none"
            if how == "ambiguous":
                notes.append("ambiguous label matches several structures: " + str(second))
            words = len(text.split())
            if slug_m and how in ("exact", "alias"):
                ok = True
            elif slug_m and how == "fuzzy":
                ok = conf >= 0.85 and score >= 90
                if not ok:
                    notes.append(f"OCR '{text}' fuzzy-matched '{by_slug[slug_m]['name']}' ({score:.0f}, conf {conf:.2f})")
            elif slug_m and how == "ambiguous":
                ok = False
            else:
                if text and conf >= 0.93 and words <= 6 and vocab_ok(text):
                    ok = True
                    notes.append("label is not on the official structure list")
                else:
                    notes.append("OCR text not recognised" if text else "OCR returned nothing")
            tt = clean_ocr(((tight.get(key_) or {}).get(str(o["cloze"])) or {}).get("text", ""))
            tconf = ((tight.get(key_) or {}).get(str(o["cloze"])) or {}).get("conf") or 0
            if ok and tt and tconf >= 0.75 and o["shape"] == "rect":
                ts, thow, _, _ = match(tt)
                if how in ("exact", "alias") and thow in ("exact", "alias") and ts != slug_m:
                    ok = False
                    notes.append(f"OCR passes disagree: '{text}' vs tight crop '{tt}' ({by_slug[ts]['name']})")
                elif not slug_m and (fuzz.ratio(keyn(text), keyn(tt)) < 65 and fuzz.partial_ratio(keyn(text), keyn(tt)) < 88
                                     or (thow in ("exact", "alias") and not set(keyn(tt).split()) <= set(keyn(text).split()))):
                    ok = False
                    notes.append(f"OCR passes disagree: '{text}' vs tight crop '{tt}'")
            if words > 8 and not slug_m:
                ok = False
                notes.append("long free-text label (not a structure name)")
            st = by_slug.get(slug_m) if slug_m else None
            answer = st["name"] if st else text
            ov = overrides.get(slug)
            prompt_ov = None
            status = "live" if ok else "draft"
            how_final = how
            if ov:
                how_final = "override"
                if "structure" in ov:
                    st = by_slug[ov["structure"]] if ov["structure"] else None
                    slug_m = ov["structure"]
                if "answer" in ov:
                    answer = ov["answer"]
                elif st:
                    answer = st["name"]
                status = ov.get("status", "live")
                if ov.get("prompt"):
                    prompt_ov = ov["prompt"]
                notes = [ov["note"]] if ov.get("note") else (notes if status == "draft" else [])
            elif ok and how == "none":
                pass
            stats[how_final if how_final in stats else "none"] = stats.get(how_final if how_final in stats else "none", 0) + 1
            accept = []
            if st:
                accept = [v for v in st["synonyms"] + st["abbreviations"] if keyn(v) != keyn(answer)][:14]
            prompt = prompt_ov or "Name the structure."
            if prompt_ov and "Brodmann" in prompt_ov:
                accept = [f"BA {answer}", f"area {answer}", f"Brodmann area {answer}", f"Brodmann's area {answer}"]
            card = {"slug": slug, "kind": "pin", "topic": topic, "structure": slug_m, "status": status,
                    "position": ni * 100 + pos, "source": {"type": "apkg", "ref": f"apkg/{deck} note {nt['id']} cloze {o['cloze']}"},
                    "answer": answer, "accept": accept, "require_side": False,
                    "image": image, "w": w, "h": h, "target": masks[sorted(shapes, key=lambda x: x["cloze"]).index(o)] if False else shape_of(o),
                    "masks": masks, "pointer": {"type": "mask"}, "prompt": prompt, "followups": []}
            if caption:
                card["caption"] = caption
            if status == "draft":
                card["review_note"] = "; ".join(notes) + f" [OCR '{text}', conf {conf:.2f}]"
            if topic == "practical-u1-practice":
                card["tags"] = ["practice-practical"]
            topics.setdefault(topic, []).append(card)
            if status == "draft" or how in ("fuzzy", "none", "ambiguous") or conf < 0.9:
                review.append({"slug": slug, "deck": deck, "note": nt["id"], "ocr": text, "conf": conf, "status": status,
                               "answer": answer, "structure": slug_m, "how": how_final, "notes": notes})

os.makedirs(os.path.join(CONTENT, "cards"), exist_ok=True)
for topic, cards in topics.items():
    path = os.path.join(CONTENT, "cards", f"{topic}.json")
    existing = []
    if os.path.exists(path):
        existing = [c for c in json.load(open(path, encoding="utf8")) if c.get("source", {}).get("type") != "apkg"]
    json.dump(cards + existing, open(path, "w", encoding="utf8"), ensure_ascii=False, indent=1)
json.dump(review, open(os.path.join(BUILD, "pin_review.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
n = sum(len(v) for v in topics.values())
drafts = sum(1 for v in topics.values() for c in v if c["status"] == "draft")
nostruct = sum(1 for v in topics.values() for c in v if not c["structure"])
print("cards", n, "drafts", drafts, "no-structure", nostruct, stats, "review queue", len(review))
