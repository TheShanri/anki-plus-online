"""Second OCR pass for tall (vertical-text) occlusion masks: rotate the crop 90 deg both ways and keep the best.
Usage: python -I tools/content/ocr_rot.py <deck> ...   -> content-build/ocr_rot/<deck>.json  {note: {cloze: {text, conf, rot}}}"""
import json, os, sys, tempfile
from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
sys.path.insert(0, r"C:\Users\info\Desktop\ANKI PLUS\app")
import ocr  # noqa: E402

BUILD = os.path.join(ROOT, "content-build")
os.makedirs(os.path.join(BUILD, "ocr_rot"), exist_ok=True)


def bbox(o):
    if o["shape"] == "rect":
        return (o["left"], o["top"], o["width"], o["height"])
    pts = [tuple(float(v) for v in p.split(",")) for p in o["points"].split()]
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    return (min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys))


tmp = os.path.join(tempfile.gettempdir(), "ankiplus_rot.png")
for deck in sys.argv[1:]:
    out = os.path.join(BUILD, "ocr_rot", deck + ".json")
    res = {}
    d = json.load(open(os.path.join(BUILD, "apkg", deck, "notes.json"), encoding="utf8"))
    for nt in d["notes"]:
        if "occlusions" not in nt:
            continue
        im = None
        for o in nt["occlusions"]:
            if o["shape"] == "text":
                continue
            x, y, w, h = bbox(o)
            if im is None:
                im = Image.open(os.path.join(BUILD, "apkg", deck, "media", nt["images"][0])).convert("RGB")
            W, H = im.size
            if h * H < 1.3 * w * W:
                continue
            padx, pady = max(6, w * W * 0.3), max(6, h * H * 0.08)
            box = (max(0, int(x * W - padx)), max(0, int(y * H - pady)), min(W, int((x + w) * W + padx)), min(H, int((y + h) * H + pady)))
            crop = im.crop(box)
            best = {"text": "", "conf": 0, "rot": 0}
            for ang in (-90, 90):
                r = crop.rotate(ang, expand=True)
                sc = max(1.0, min(4.0, 90 / r.height))
                if sc > 1:
                    r = r.resize((int(r.width * sc), int(r.height * sc)), Image.LANCZOS)
                r.save(tmp)
                try:
                    x_ = ocr.ocr_region(tmp, 0.0, 0.0, 1.0, 1.0, "en")
                except Exception:
                    continue
                if (x_.get("confidence") or 0) > best["conf"] and x_.get("text"):
                    best = {"text": x_["text"], "conf": x_["confidence"], "rot": ang}
            res.setdefault(str(nt["id"]), {})[str(o["cloze"])] = best
    json.dump(res, open(out, "w", encoding="utf8"), ensure_ascii=False)
    print(deck, sum(len(v) for v in res.values()), flush=True)
