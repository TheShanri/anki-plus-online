"""Contact sheet per pathway from the per-beat screenshots of vet.mjs --steps.
usage: python -I tools/pathways/sheet.py <dir> <slug> [<slug> ...]   (needs Pillow)
Crops the schematic + 3D scene + caption of each vet-<slug>-beatNN.png and tiles them 4 across with the beat number."""
import glob, os, sys
from PIL import Image, ImageDraw

d = sys.argv[1]
for slug in sys.argv[2:]:
    files = sorted(glob.glob(os.path.join(d, f"vet-{slug}-beat[0-9][0-9].png")))
    if not files:
        print("no shots for", slug); continue
    cols, tw = 4, 470
    tiles = []
    for i, f in enumerate(files):
        im = Image.open(f).convert("RGB")
        w, h = im.size
        sx = w / 1440
        im = im.crop((0, int(180 * sx), int(1050 * sx), int(880 * sx)))
        th = int(tw * im.size[1] / im.size[0])
        im = im.resize((tw, th), Image.LANCZOS)
        ImageDraw.Draw(im).rectangle((0, 0, 26, 18), fill=(0, 0, 0))
        ImageDraw.Draw(im).text((4, 3), str(i), fill=(255, 255, 0))
        tiles.append(im)
    th = tiles[0].size[1]
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tw, rows * th), (10, 10, 10))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * tw, (i // cols) * th))
    out = os.path.join(d, f"sheet-{slug}.png")
    sheet.save(out)
    print(out, len(tiles), "beats")
