"""Render a card's full image with all masks outlined (target red). Usage: python -I show_card.py out.png slug [slug...] (tiles side by side)"""
import glob, json, os, re, sys
from PIL import Image, ImageDraw
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
cards = {}
for f in glob.glob(os.path.join(ROOT, "content", "nsci3250", "cards", "*.json")):
    for c in json.load(open(f, encoding="utf8")):
        cards[c["slug"]] = c
tiles = []
for slug in sys.argv[2:]:
    c = cards[slug]
    deck = re.match(r"(.+)-io-", slug).group(1)
    src = os.path.join(ROOT, "content-build", "apkg", deck, "media")
    base = os.path.splitext(os.path.basename(c["image"]))[0]
    im = Image.open(next(os.path.join(src, f) for f in os.listdir(src) if os.path.splitext(f)[0] == base)).convert("RGB")
    W, H = im.size
    s = min(900 / W, 700 / H)
    im = im.resize((int(W * s), int(H * s)))
    d = ImageDraw.Draw(im)
    for m in c["masks"]:
        col = "red" if m == c["target"] else "blue"
        if m["shape"] == "rect":
            d.rectangle([m["x"] * im.width, m["y"] * im.height, (m["x"] + m["w"]) * im.width, (m["y"] + m["h"]) * im.height], outline=col, width=3 if col == "red" else 1)
        else:
            d.polygon([(x * im.width, y * im.height) for x, y in m["points"]], outline=col)
    tiles.append(im)
w = sum(t.width for t in tiles); h = max(t.height for t in tiles)
out = Image.new("RGB", (w, h), "white")
x = 0
for t in tiles:
    out.paste(t, (x, 0)); x += t.width
out.save(sys.argv[1])
