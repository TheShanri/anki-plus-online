"""OCR for polygon occlusion masks: deskew to the polygon's minimum-area rectangle, whiten everything outside the polygon,
try the 4 quarter-turns, keep the most confident reading.
Usage: python -I tools/content/ocr_poly.py <deck> ...  -> content-build/ocr_poly/<deck>.json {note: {cloze: {text, conf, rot}}}"""
import json, os, sys, tempfile
import cv2
import numpy as np

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
sys.path.insert(0, r"C:\Users\info\Desktop\ANKI PLUS\app")
import ocr  # noqa: E402

BUILD = os.path.join(ROOT, "content-build")
os.makedirs(os.path.join(BUILD, "ocr_poly"), exist_ok=True)
tmp = os.path.join(tempfile.gettempdir(), "ankiplus_poly_" + str(os.getpid()) + ".png")

for deck in sys.argv[1:]:
    res = {}
    d = json.load(open(os.path.join(BUILD, "apkg", deck, "notes.json"), encoding="utf8"))
    for nt in d["notes"]:
        if "occlusions" not in nt:
            continue
        polys = [o for o in nt["occlusions"] if o["shape"] == "polygon"]
        if not polys:
            continue
        img = cv2.imdecode(np.fromfile(os.path.join(BUILD, "apkg", deck, "media", nt["images"][0]), dtype=np.uint8), cv2.IMREAD_COLOR)
        H, W = img.shape[:2]
        for o in polys:
            pts = np.array([[float(v) for v in p.split(",")] for p in o["points"].split()], dtype=np.float32) * np.array([W, H], dtype=np.float32)
            rect = cv2.minAreaRect(pts)
            (cx, cy), (rw, rh), ang = rect
            mask = np.zeros((H, W), np.uint8)
            cv2.fillPoly(mask, [pts.astype(np.int32)], 255)
            # grow the polygon slightly so antialiased glyph edges survive
            mask = cv2.dilate(mask, np.ones((5, 5), np.uint8))
            white = np.full_like(img, 255)
            work = np.where(mask[..., None] > 0, img, white)
            M = cv2.getRotationMatrix2D((cx, cy), ang, 1.0)
            rot = cv2.warpAffine(work, M, (W, H), flags=cv2.INTER_CUBIC, borderValue=(255, 255, 255))
            x0, y0 = int(max(0, cx - rw / 2 - 4)), int(max(0, cy - rh / 2 - 4))
            x1, y1 = int(min(W, cx + rw / 2 + 4)), int(min(H, cy + rh / 2 + 4))
            crop = rot[y0:y1, x0:x1]
            if crop.size == 0:
                continue
            best = {"text": "", "conf": 0, "rot": 0}
            for k in (0, 1, 2, 3):
                c = np.rot90(crop, k)
                sc = max(1.0, min(4.0, 100 / c.shape[0]))
                if sc > 1:
                    c = cv2.resize(c, None, fx=sc, fy=sc, interpolation=cv2.INTER_CUBIC)
                pad = cv2.copyMakeBorder(np.ascontiguousarray(c), 8, 8, 8, 8, cv2.BORDER_CONSTANT, value=(255, 255, 255))
                cv2.imencode(".png", pad)[1].tofile(tmp)
                try:
                    r = ocr.ocr_region(tmp, 0.0, 0.0, 1.0, 1.0, "en")
                except Exception:
                    continue
                if r.get("text") and (r.get("confidence") or 0) > best["conf"]:
                    best = {"text": r["text"], "conf": r["confidence"], "rot": k}
            res.setdefault(str(nt["id"]), {})[str(o["cloze"])] = best
    json.dump(res, open(os.path.join(BUILD, "ocr_poly", deck + ".json"), "w", encoding="utf8"), ensure_ascii=False)
    print(deck, sum(len(v) for v in res.values()), flush=True)
