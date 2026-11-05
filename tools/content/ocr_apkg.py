"""OCR every occlusion region of the Anki image-occlusion decks (labels are baked into the image).
Usage: python -I tools/content/ocr_apkg.py <deck> [<deck> ...]   -> content-build/ocr/<deck>.json
Reuses the reference app's ocr module (RapidOCR) read-only."""
import json, os, sys, time
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
sys.path.insert(0, r"C:\Users\info\Desktop\ANKI PLUS\app")
import ocr  # noqa: E402

BUILD = os.path.join(ROOT, "content-build")
os.makedirs(os.path.join(BUILD, "ocr"), exist_ok=True)


def bbox(o):
    if o["shape"] == "rect":
        return (o["left"], o["top"], o["width"], o["height"])
    pts = [tuple(float(v) for v in p.split(",")) for p in o["points"].split()]
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    return (min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys))


for deck in sys.argv[1:]:
    out = os.path.join(BUILD, "ocr", deck + ".json")
    res = json.load(open(out, encoding="utf8")) if os.path.exists(out) else {}
    d = json.load(open(os.path.join(BUILD, "apkg", deck, "notes.json"), encoding="utf8"))
    for nt in d["notes"]:
        key = str(nt["id"])
        if key in res or "occlusions" not in nt:
            continue
        masks = [o for o in nt["occlusions"] if o["shape"] != "text"]
        if not masks:
            res[key] = []
            continue
        img = os.path.join(BUILD, "apkg", deck, "media", nt["images"][0])
        regs = [bbox(o) for o in masks]
        try:
            r = ocr.ocr_regions(img, regs, "en")
        except Exception as e:  # noqa
            r = [{"text": "", "confidence": 0, "error": str(e)}] * len(masks)
        res[key] = [{"cloze": o["cloze"], "text": x.get("text", ""), "conf": x.get("confidence")} for o, x in zip(masks, r)]
        json.dump(res, open(out, "w", encoding="utf8"), ensure_ascii=False)
    print(deck, "done", len(res), flush=True)
