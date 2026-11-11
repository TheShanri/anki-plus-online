"""Contact sheets for the v3 tracer from shoot.mjs's per-beat screenshots.
usage: python -I tools/pathways/v3/sheet.py _atlas/pw3_shots <key> [<key> ...]   (key = slug or slug-limb; needs Pillow)
Writes <dir>/<key>/sheet-<WxH>.png: every beat of that size tiled (desktop 3 across, phone 6 across) with the beat number."""
import glob, os, sys
from PIL import Image, ImageDraw

root = sys.argv[1]
for key in sys.argv[2:]:
    for size_dir in sorted(glob.glob(os.path.join(root, key, "*x*"))):
        files = sorted(glob.glob(os.path.join(size_dir, "beat[0-9][0-9].png")))
        if not files:
            continue
        w0, h0 = Image.open(files[0]).size
        phone = w0 < 700
        cols = 6 if phone else 3
        tw = 300 if phone else 640
        tiles = []
        for f in files:
            im = Image.open(f).convert("RGB")
            th = int(tw * im.size[1] / im.size[0])
            im = im.resize((tw, th), Image.LANCZOS)
            n = os.path.basename(f)[4:6]
            d = ImageDraw.Draw(im)
            d.rectangle((0, 0, 30, 20), fill=(0, 0, 0))
            d.text((5, 4), n, fill=(255, 255, 0))
            tiles.append(im)
        th = max(t.size[1] for t in tiles)
        rows = (len(tiles) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * tw + (cols - 1) * 6, rows * th + (rows - 1) * 6), (40, 40, 40))
        for i, t in enumerate(tiles):
            sheet.paste(t, ((i % cols) * (tw + 6), (i // cols) * (th + 6)))
        out = os.path.join(root, key, f"sheet-{os.path.basename(size_dir)}.png")
        sheet.save(out)
        print("wrote", out, len(tiles), "beats")
