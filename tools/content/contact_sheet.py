"""Contact sheet of occlusion-target crops for manual review.
Usage: python -I contact_sheet.py <out_prefix> <cards-json-with-slugs> [start] [count]
 where the json is a list of {"slug": ...} (e.g. content-build/pin_review.json filtered by tools); the sheet shows each
 target region (with margin) from the original image plus the card number and the OCR text."""
import json, os, re, sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
BUILD = os.path.join(ROOT, "content-build")
out_prefix, listpath = sys.argv[1], sys.argv[2]
start = int(sys.argv[3]) if len(sys.argv) > 3 else 0
count = int(sys.argv[4]) if len(sys.argv) > 4 else 24
items = json.load(open(listpath, encoding="utf8"))[start:start + count]
cards = {}
import glob
for f in glob.glob(os.path.join(ROOT, "content", "nsci3250", "cards", "*.json")):
    for c in json.load(open(f, encoding="utf8")):
        cards[c["slug"]] = c
try:
    font = ImageFont.truetype("arial.ttf", 15)
except OSError:
    font = ImageFont.load_default()

CW, CH, COLS = 520, 150, 3
rows = (len(items) + COLS - 1) // COLS
sheet = Image.new("RGB", (CW * COLS, CH * rows), "white")
d = ImageDraw.Draw(sheet)
for i, it in enumerate(items):
    c = cards[it["slug"]]
    m = re.match(r"(.+)-io-(\d+)-c(\d+)$", c["slug"])
    deck = m.group(1)
    src = os.path.join(BUILD, "apkg", deck, "media")
    base = os.path.splitext(os.path.basename(c["image"]))[0]
    path = next(os.path.join(src, f) for f in os.listdir(src) if os.path.splitext(f)[0] == base)
    im = Image.open(path).convert("RGB")
    W, H = im.size
    t = c["target"]
    if t["shape"] == "rect":
        x0, y0, x1, y1 = t["x"], t["y"], t["x"] + t["w"], t["y"] + t["h"]
    else:
        xs = [p[0] for p in t["points"]]; ys = [p[1] for p in t["points"]]
        x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
    px, py = (x1 - x0) * W, (y1 - y0) * H
    padx, pady = max(px * 0.4, 25), max(py * 0.8, 18)
    box = (max(0, int(x0 * W - padx)), max(0, int(y0 * H - pady)), min(W, int(x1 * W + padx)), min(H, int(y1 * H + pady)))
    crop = im.crop(box)
    rotated = crop.height > 1.4 * crop.width
    if rotated:
        crop = crop.rotate(-90, expand=True)
    s = min((CW - 10) / crop.width, (CH - 28) / crop.height, 4.0)
    crop = crop.resize((max(1, int(crop.width * s)), max(1, int(crop.height * s))), Image.LANCZOS)
    cx, cy = (i % COLS) * CW, (i // COLS) * CH
    sheet.paste(crop, (cx + 4, cy + 22))
    # outline the target rect inside the crop
    rx0, ry0 = (x0 * W - box[0]) * s + cx + 4, (y0 * H - box[1]) * s + cy + 22
    rx1, ry1 = (x1 * W - box[0]) * s + cx + 4, (y1 * H - box[1]) * s + cy + 22
    if not rotated:
        d.rectangle([rx0 - 1, ry0 - 1, rx1 + 1, ry1 + 1], outline=(255, 0, 0))
    d.rectangle([cx, cy, cx + CW - 1, cy + CH - 1], outline=(160, 160, 160))
    d.text((cx + 4, cy + 3), f"#{start + i} {it.get('ocr', '')[:60]}", fill=(0, 0, 160), font=font)
out = f"{out_prefix}_{start}.png"
sheet.save(out)
print(out, len(items))
