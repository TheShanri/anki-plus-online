import sys, os, json, glob, warnings
warnings.filterwarnings('ignore')
import pillow_heif; pillow_heif.register_heif_opener()
from PIL import Image, ImageOps
import fitz
RAW, OUT = sys.argv[1], sys.argv[2]
os.makedirs(os.path.join(OUT, 'photos'), exist_ok=True)
res = []
for f in sorted(glob.glob(os.path.join(RAW, '*'))):
    if f.lower().endswith(('.heic', '.jpg', '.jpeg')):
        im = ImageOps.exif_transpose(Image.open(f)).convert('RGB')
        w, h = im.size; s = 1600 / max(w, h)
        if s < 1: im = im.resize((round(w * s), round(h * s)), Image.LANCZOS)
        name = os.path.splitext(os.path.basename(f))[0].replace(' ', '_') + '.webp'
        im.save(os.path.join(OUT, 'photos', name), 'WEBP', quality=82)
        res.append(dict(source=os.path.basename(f), file='photos/' + name, original_size=[w, h]))
        print(name, w, h)
json.dump(res, open(os.path.join(OUT, 'photos', 'photos.json'), 'w'), indent=1)
# snell toc
p = os.path.join(RAW, 'csfiles/home_dir/courses/202301-10895/Snell-Neuroanatomy-7th-Edition.pdf')
d = fitz.open(p)
toc = d.get_toc(simple=True)
json.dump(dict(source='Snell-Neuroanatomy-7th-Edition.pdf', page_count=len(d), note='outline/bookmarks only; no page content extracted',
               entries=[dict(level=l, title=t, page=pg) for l, t, pg in toc]), open(os.path.join(OUT, 'snell_toc.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print('toc entries', len(toc), 'pages', len(d))
