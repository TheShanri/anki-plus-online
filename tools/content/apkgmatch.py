"""Match apkg media images to deck embedded images by perceptual hash. Usage: apkgmatch.py OUT"""
import sys, os, json, glob, warnings
warnings.filterwarnings('ignore')
from PIL import Image
import numpy as np
OUT = sys.argv[1]
def dhash(path, n=16):
    try:
        im = Image.open(path).convert('L').resize((n + 1, n), Image.LANCZOS)
        a = np.asarray(im, dtype=np.int16)
        return (a[:, 1:] > a[:, :-1]).flatten()
    except Exception:
        return None
deck_imgs = []; H = []
for f in glob.glob(os.path.join(OUT, 'decks', '*', 'images', '*.webp')):
    h = dhash(f)
    if h is not None:
        deck_imgs.append(f); H.append(h)
H = np.array(H)
print('deck images', len(deck_imgs), flush=True)
res = {}
tot = hit = 0
for nj in glob.glob(os.path.join(OUT, 'apkg', '*', 'notes.json')):
    slug = os.path.basename(os.path.dirname(nj)); d = json.load(open(nj, encoding='utf-8'))
    cache = {}
    for n in d['notes']:
        for img in n.get('images', []):
            tot += 1
            p = os.path.join(os.path.dirname(nj), 'media', img)
            if img not in cache:
                h = dhash(p)
                if h is None: cache[img] = None
                else:
                    dist = (H != h).sum(axis=1); k = int(dist.argmin())
                    cache[img] = (deck_imgs[k], int(dist[k]))
            m = cache[img]
            if m and m[1] <= 40:
                hit += 1
                deckslug = m[0].split(os.sep + 'decks' + os.sep)[1].split(os.sep)[0] if os.sep in m[0] else m[0]
                rel = os.path.relpath(m[0], os.path.join(OUT, 'decks')).replace(chr(92), '/')
                res.setdefault(slug, {})[str(n['id'])] = dict(image=img, deck_image=rel, distance=m[1])
print('apkg images', tot, 'matched', hit)
json.dump(res, open(os.path.join(OUT, '_apkg_matches.json'), 'w'), indent=0)
