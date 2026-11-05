"""Cross-check OCR for rectangular masks: tight crop (no neighbours). Usage: python -I ocr_tight.py <deck>... -> content-build/ocr_tight/<deck>.json"""
import json, os, sys, tempfile
from PIL import Image
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
sys.path.insert(0, r"C:\Users\info\Desktop\ANKI PLUS\app")
import ocr  # noqa: E402
B = os.path.join(ROOT, "content-build")
os.makedirs(os.path.join(B, "ocr_tight"), exist_ok=True)
tmp = os.path.join(tempfile.gettempdir(), "ankiplus_tight_%d.png" % os.getpid())
for deck in sys.argv[1:]:
    res = {}
    d = json.load(open(os.path.join(B, "apkg", deck, "notes.json"), encoding="utf8"))
    for nt in d["notes"]:
        if "occlusions" not in nt:
            continue
        im = None
        for o in nt["occlusions"]:
            if o["shape"] != "rect":
                continue
            if im is None:
                im = Image.open(os.path.join(B, "apkg", deck, "media", nt["images"][0])).convert("RGB")
            W, H = im.size
            x0, y0 = max(0, int(o["left"] * W) - 3), max(0, int(o["top"] * H) - 3)
            x1, y1 = min(W, int((o["left"] + o["width"]) * W) + 3), min(H, int((o["top"] + o["height"]) * H) + 3)
            if x1 - x0 < 4 or y1 - y0 < 4:
                continue
            c = im.crop((x0, y0, x1, y1))
            sc = max(1.0, min(5.0, 110 / c.height))
            if sc > 1:
                c = c.resize((int(c.width * sc), int(c.height * sc)), Image.LANCZOS)
            bg = Image.new("RGB", (c.width + 24, c.height + 24), (255, 255, 255))
            bg.paste(c, (12, 12))
            bg.save(tmp)
            try:
                r = ocr.ocr_region(tmp, 0.0, 0.0, 1.0, 1.0, "en")
            except Exception:
                continue
            res.setdefault(str(nt["id"]), {})[str(o["cloze"])] = {"text": r.get("text", ""), "conf": r.get("confidence")}
    json.dump(res, open(os.path.join(B, "ocr_tight", deck + ".json"), "w", encoding="utf8"), ensure_ascii=False)
    print(deck, sum(len(v) for v in res.values()), flush=True)
