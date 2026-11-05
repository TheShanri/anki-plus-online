"""Build content-build/decks/<slug>/ for every canonical lecture/lab/atlas/practical/etc.
Usage: decks.py RAW OUT [--only slug,slug] [--workers N]
Resumable: a deck with slides.json (written last) is skipped.
"""
import sys, os, re, json, io, hashlib, traceback, warnings, time
warnings.filterwarnings('ignore')
from multiprocessing import Pool

RAW = sys.argv[1]; OUT = sys.argv[2]
ONLY = None; WORKERS = 7
if '--only' in sys.argv: ONLY = set(sys.argv[sys.argv.index('--only') + 1].split(','))
if '--workers' in sys.argv: WORKERS = int(sys.argv[sys.argv.index('--workers') + 1])
DECKS = os.path.join(OUT, 'decks')

def slugify(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')

def keyof(stem):
    s = re.sub(r' - Copy\b', '', stem)
    s = re.sub(r'\s*\((20\d\d)\)', '', s)
    s = re.sub(r'[_ ]20\d\d(?=[_ ]|$)', '', s)
    m = re.search(r'(?<=[A-Za-z&)_ ])(\d)$', s)
    if m and not re.search(r'(Lab|Lecture|Unit|session|Session)[ _]?\d$', s): s = s[:-1]
    s = re.sub(r'[_ ]updated', '', s, flags=re.I)
    return re.sub(r'[^a-z0-9]+', ' ', s.lower()).strip()

def discover():
    man = json.load(open(os.path.join(OUT, 'manifest.json'), encoding='utf-8'))
    groups = {}
    answers = {'lab': {}, 'assign': {}, 'exam': {}, 'si': {}}
    for rel, m in man.items():
        if not m['canonical']: continue
        k = m['kind']; stem, ext = os.path.splitext(os.path.basename(rel)); ext = ext.lower()
        if k == 'lab_answers':
            answers['lab'].setdefault(m['number'], []).append(rel); continue
        if k == 'assignment' and m['role'] == 'answers':
            answers['assign'].setdefault(m['unit'], []).append(rel); continue
        if k == 'practice_exam' and m['role'] == 'answers':
            answers['exam'][m['unit']] = rel; continue
        if k == 'si_session' and m['role'] == 'answers':
            answers['si'][m['number']] = rel; continue
        if k in ('lecture', 'lab', 'atlas', 'practical', 'cheatsheet', 'assignment', 'practice_exam', 'si_session') or (k == 'other' and 'Lecutre_12' in rel):
            if k == 'practical' and m.get('role') != 'practice' and ext == '.pptx': pass
            g = groups.setdefault((k, keyof(stem), m['year'] if k in ('practical', 'practice_exam', 'si_session') else 0), dict(kind=k, unit=m['unit'], number=m['number'], year=m['year'], stem=stem, role=m['role'], pdf=None, pptx=None, answers=[]))
            g['pdf' if ext == '.pdf' else 'pptx' if ext == '.pptx' else 'other'] = rel
    # manual pairing: Unit 3 assignment pptx + labeling pdf
    decks = []
    for (k, key, yr), g in groups.items():
        n, u = g['number'], g['unit']
        if k == 'lecture': slug = f'lecture-{n:02d}' + ('-' + slugify(re.sub(r'^Lecture \d+ - ', '', g['stem']))[:30] if n == 18 else '')
        elif k == 'lab': slug = f'lab-{n:02d}' + ('-unlabeled' if 'unlabeled' in key else '')
        elif k == 'atlas': slug = 'atlas-' + slugify(g['stem'])
        elif k == 'practical': slug = ('practice-practical-lab%d' % n) if g['role'] == 'practice' else f'practical-u{u}-{yr}'
        elif k == 'practice_exam': slug = f'practice-exam-u{u}'
        elif k == 'si_session': slug = f'si-session-{n}-test'
        elif k == 'cheatsheet': slug = 'cheatsheet-' + slugify(g['stem'])
        elif k == 'assignment': slug = ('lab-08-blank-drawings' if g['role'] == 'blank' else f'assignment-u{u}-' + slugify(g['stem'])[:30])
        else: slug = slugify(g['stem'])[:40]
        g['slug'] = slug
        if k == 'lab' and n in answers['lab'] and 'unlabeled' not in key: g['answers'] = answers['lab'][n]
        if k == 'assignment' and g['role'] != 'blank' and u in answers['assign']: g['answers'] = answers['assign'][u]
        if k == 'practice_exam' and u in answers['exam']: g['answers'] = [answers['exam'][u]]
        if k == 'si_session' and n in answers['si']: g['answers'] = [answers['si'][n]]
        decks.append(g)
    # sanitize: the Unit 3 'Labeling' pdf pairs with the 2025 pptx
    byslug = {d['slug']: d for d in decks}
    a = [d for d in decks if d['slug'].startswith('assignment-u3')]
    pp = [d for d in a if d['pptx'] and not d['pdf']]; pf = [d for d in a if d['pdf'] and not d['pptx']]
    if pp and pf:
        pp[0]['pdf'] = pf[0]['pdf']
        if not pp[0]['answers']: pp[0]['answers'] = pf[0]['answers']
        decks.remove(pf[0])
    # Unit 3 practice exam key is byte-identical to the exam copy: keep answers but flag
    decks.sort(key=lambda d: d['slug'])
    return decks

# ---------- image helpers
from PIL import Image
def save_webp(img, path, longside, q):
    if img.mode not in ('RGB', 'L'):
        if img.mode in ('RGBA', 'LA', 'P'):
            img = img.convert('RGBA'); bg = Image.new('RGB', img.size, (255, 255, 255)); bg.paste(img, mask=img.split()[-1]); img = bg
        else: img = img.convert('RGB')
    w, h = img.size; s = longside / max(w, h)
    if s < 1: img = img.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    img.save(path, 'WEBP', quality=q, method=4)

def render_pdf(pdf, outdir, thumbdir, longside=1600, q=80, thumbs=True, tlong=320):
    import fitz
    os.makedirs(outdir, exist_ok=True)
    if thumbs: os.makedirs(thumbdir, exist_ok=True)
    d = fitz.open(pdf); sizes = []
    for i, p in enumerate(d):
        out = os.path.join(outdir, f'{i + 1:03d}.webp'); tp = os.path.join(thumbdir, f'{i + 1:03d}.webp') if thumbs else None
        r = p.rect; s = longside / max(r.width, r.height)
        if not os.path.exists(out) or (thumbs and not os.path.exists(tp)):
            pix = p.get_pixmap(matrix=fitz.Matrix(s, s), alpha=False)
            im = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
            if not os.path.exists(out): save_webp(im, out, longside, q)
            if thumbs and not os.path.exists(tp): save_webp(im, tp, tlong, 70)
        sizes.append((round(r.width), round(r.height)))
    return sizes

def pdf_page_info(pdf):
    import fitz
    d = fitz.open(pdf); pages = []
    for i, p in enumerate(d):
        text = p.get_text().strip()
        title = ''; best = 0
        try:
            blocks = p.get_text('dict')['blocks']
            cands = []
            for b in blocks:
                for l in b.get('lines', []):
                    t = ''.join(s['text'] for s in l['spans']).strip()
                    if len(t) < 3: continue
                    sz = max(s['size'] for s in l['spans'])
                    cands.append((l['bbox'][1], sz, t))
            if cands:
                top = [c for c in cands if c[0] < p.rect.height * 0.3] or cands
                mx = max(c[1] for c in top)
                title = ' '.join(c[2] for c in sorted(top) if c[1] >= mx - 0.5)[:200]
        except Exception: pass
        words = len(text.split())
        # label-ish fragments: short lines
        frags = [l for l in text.split('\n') if 0 < len(l.strip()) <= 28]
        pages.append(dict(text=text, title=title, nimg=len(p.get_images()), ndraw=len(p.get_drawings()), words=words, frags=len(frags), rect=(p.rect.width, p.rect.height)))
    return pages

def extract_pdf_images(pdf, imgdir, minpx=150):
    import fitz
    os.makedirs(imgdir, exist_ok=True)
    d = fitz.open(pdf); per = {}; seen = {}
    for i, p in enumerate(d):
        fl = []
        for k, im in enumerate(p.get_images(full=True)):
            xref = im[0]
            if xref in seen:
                if seen[xref]: fl.append(seen[xref])
                continue
            seen[xref] = None
            try:
                info = d.extract_image(xref)
                if not info or info['width'] < minpx or info['height'] < minpx: continue
                img = Image.open(io.BytesIO(info['image'])); img.load()
                if im[1]:  # smask
                    try:
                        mk = fitz.Pixmap(d, im[1]); m = Image.frombytes('L', (mk.width, mk.height), mk.samples)
                        if m.size != img.size: m = m.resize(img.size)
                        img = img.convert('RGBA'); img.putalpha(m)
                    except Exception: pass
                name = f'p{i + 1:03d}_{k + 1}.webp'
                save_webp(img, os.path.join(imgdir, name), 1600, 80)
                seen[xref] = 'images/' + name; fl.append('images/' + name)
            except Exception: continue
        per[i + 1] = fl
    return per

# ---------- pptx
def walk_shapes(shapes, ox=0, oy=0, sx=1.0, sy=1.0):
    from pptx.enum.shapes import MSO_SHAPE_TYPE
    for sh in shapes:
        try:
            if sh.shape_type == MSO_SHAPE_TYPE.GROUP:
                gx, gy, gw, gh = sh.left or 0, sh.top or 0, sh.width or 1, sh.height or 1
                try:
                    xf = sh._element.grpSpPr.xfrm
                    cx, cy, cw, ch = xf.chOff.x, xf.chOff.y, xf.chExt.cx or 1, xf.chExt.cy or 1
                except Exception:
                    cx, cy, cw, ch = gx, gy, gw, gh
                nsx, nsy = gw / cw, gh / ch
                # child coords: X = ox + sx*(gx + (x-cx)*nsx)
                yield from walk_shapes(sh.shapes, ox + sx * (gx - cx * nsx), oy + sy * (gy - cy * nsy), sx * nsx, sy * nsy)
                continue
        except Exception: pass
        yield sh, ox, oy, sx, sy

def pptx_extract(pptx, imgdir, want_images=True):
    from pptx import Presentation
    from pptx.enum.shapes import MSO_SHAPE_TYPE
    prs = Presentation(pptx)
    os.makedirs(imgdir, exist_ok=True)
    slides = []; hashes = {}; hashcount = {}
    # pass1: count hash usage across slides to drop repeated logos
    blobs = []
    for si, sl in enumerate(prs.slides):
        texts = []; title = ''
        try:
            if sl.shapes.title is not None and sl.shapes.title.has_text_frame: title = sl.shapes.title.text_frame.text.strip()
        except Exception: pass
        pics = []
        for sh, ox, oy, sx, sy in walk_shapes(sl.shapes):
            try:
                if sh.has_text_frame and sh.text_frame.text.strip(): texts.append(sh.text_frame.text.strip())
                elif getattr(sh, 'has_table', False) and sh.has_table:
                    for r in sh.table.rows: texts.append(' | '.join(c.text.strip() for c in r.cells))
            except Exception: pass
            try:
                if sh.shape_type == MSO_SHAPE_TYPE.PICTURE:
                    pics.append(sh)
            except Exception: pass
            # pictures as fills / placeholders
            try:
                if hasattr(sh, 'image') and sh.shape_type != MSO_SHAPE_TYPE.PICTURE: pics.append(sh)
            except Exception: pass
        notes = ''
        try:
            if sl.has_notes_slide: notes = sl.notes_slide.notes_text_frame.text.strip()
        except Exception: pass
        slides.append(dict(title=title, text='\n'.join(texts), notes=notes, pics=pics, hidden=sl._element.get('show') == '0'))
        for pc in pics:
            try:
                h = hashlib.sha1(pc.image.blob).hexdigest(); hashcount[h] = hashcount.get(h, 0) + 1
            except Exception: pass
    skipped = 0; vector = 0
    res = []
    for si, s in enumerate(slides):
        files = []
        if want_images:
            for k, pc in enumerate(s['pics']):
                try:
                    im = pc.image; h = hashlib.sha1(im.blob).hexdigest()
                    if h in hashes:
                        if hashes[h] and hashes[h] not in files: files.append(hashes[h])
                        continue
                    hashes[h] = None
                    if im.ext.lower() in ('emf', 'wmf'): vector += 1; continue
                    if hashcount.get(h, 0) > 4 and len(slides) > 6: skipped += 1; continue  # repeated logo/banner
                    img = Image.open(io.BytesIO(im.blob)); img.load()
                    if min(img.size) < 120: skipped += 1; continue
                    name = f's{si + 1:03d}_{k + 1}.webp'
                    save_webp(img, os.path.join(imgdir, name), 1600, 80)
                    hashes[h] = 'images/' + name; files.append('images/' + name)
                except Exception: skipped += 1
        res.append(dict(title=s['title'], text=s['text'], notes=s['notes'], image_files=files, hidden=s['hidden']))
    return res, dict(slide_w=prs.slide_width, slide_h=prs.slide_height, skipped_small_or_repeated=skipped, vector_images_skipped=vector, n_slides=len(slides))

# ---------- pptx compositor (for decks without a PDF)
def composite_pptx(pptx, outdir, thumbdir, longside=1600, q=80):
    from pptx import Presentation
    from pptx.enum.shapes import MSO_SHAPE_TYPE
    from PIL import ImageDraw, ImageFont
    prs = Presentation(pptx)
    os.makedirs(outdir, exist_ok=True); os.makedirs(thumbdir, exist_ok=True)
    W, H = prs.slide_width, prs.slide_height; s = longside / max(W, H)
    cw, ch = round(W * s), round(H * s)
    def font(pt):
        for fn in ('arial.ttf', 'C:/Windows/Fonts/arial.ttf'):
            try: return ImageFont.truetype(fn, max(8, int(pt * s * 12700 / 12700 * 12700 / 12700 * (914400 / 72) / 914400 * 1)))
            except Exception: continue
        return ImageFont.load_default()
    for si, sl in enumerate(prs.slides):
        out = os.path.join(outdir, f'{si + 1:03d}.webp')
        if os.path.exists(out): continue
        im = Image.new('RGB', (cw, ch), (255, 255, 255)); dr = ImageDraw.Draw(im)
        try:
            bgc = sl.background.fill.fore_color.rgb
            if bgc is not None: im.paste((bgc[0], bgc[1], bgc[2]), (0, 0, cw, ch))
        except Exception: pass
        for sh, ox, oy, sx, sy in walk_shapes(sl.shapes):
            try:
                x = (ox + sx * (sh.left or 0)) * s; y = (oy + sy * (sh.top or 0)) * s
                w = sx * (sh.width or 0) * s; h = sy * (sh.height or 0) * s
            except Exception: continue
            try:
                if sh.shape_type == MSO_SHAPE_TYPE.PICTURE:
                    pic = Image.open(io.BytesIO(sh.image.blob)); pic.load(); pic = pic.convert('RGBA')
                    cl, cr, ct, cb = sh.crop_left, sh.crop_right, sh.crop_top, sh.crop_bottom
                    pw, ph = pic.size
                    pic = pic.crop((int(cl * pw), int(ct * ph), int(pw - cr * pw), int(ph - cb * ph)))
                    pic = pic.resize((max(1, int(w)), max(1, int(h))))
                    im.paste(pic, (int(x), int(y)), pic)
                    continue
            except Exception: pass
            try:
                col = None
                try:
                    if sh.line.fill.type is not None and sh.line.color and sh.line.color.type is not None: col = tuple(sh.line.color.rgb)
                except Exception: pass
                lw = 3
                try:
                    if sh.line.width: lw = max(2, int(sh.line.width * s))
                except Exception: pass
                if sh.shape_type == MSO_SHAPE_TYPE.LINE or sh.__class__.__name__ == 'Connector':
                    bx, by, ex, ey = sh.begin_x, sh.begin_y, sh.end_x, sh.end_y
                    X0, Y0 = (ox + sx * bx) * s, (oy + sy * by) * s; X1, Y1 = (ox + sx * ex) * s, (oy + sy * ey) * s
                    c = col or (255, 0, 0)
                    dr.line([X0, Y0, X1, Y1], fill=c, width=lw)
                    import math
                    a = math.atan2(Y1 - Y0, X1 - X0)
                    for da in (2.6, -2.6):
                        dr.line([X1, Y1, X1 + 18 * math.cos(a + da), Y1 + 18 * math.sin(a + da)], fill=c, width=lw)
                    continue
                if sh.shape_type == MSO_SHAPE_TYPE.AUTO_SHAPE:
                    nm = str(sh.auto_shape_type).lower()
                    fill = None
                    try:
                        if sh.fill.type == 1: fill = tuple(sh.fill.fore_color.rgb)
                    except Exception: pass
                    box = [x, y, x + w, y + h]
                    if 'arrow' in nm:
                        dr.polygon([(x, y + h * .3), (x + w * .6, y + h * .3), (x + w * .6, y), (x + w, y + h / 2), (x + w * .6, y + h), (x + w * .6, y + h * .7), (x, y + h * .7)], outline=col or (255, 0, 0), fill=fill or (255, 0, 0))
                    elif 'oval' in nm: dr.ellipse(box, outline=col or (255, 0, 0), width=lw, fill=None if fill is None else fill)
                    else: dr.rectangle(box, outline=col or (255, 0, 0) if col or fill is None else None, width=lw, fill=fill)
                if sh.has_text_frame and sh.text_frame.text.strip():
                    pt = 14
                    try:
                        for p in sh.text_frame.paragraphs:
                            for r in p.runs:
                                if r.font.size: pt = r.font.size.pt; raise StopIteration
                    except StopIteration: pass
                    px = max(9, int(pt * s * 914400 / 72 / 914400 * 12700 / 12700 * 1.0 * (12700 / 12700) * 1)) if False else max(9, int(pt * (longside / (max(W, H) / 12700)) * 1))
                    try: f = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', px)
                    except Exception: f = ImageFont.load_default()
                    dr.multiline_text((x + 3, y + 2), sh.text_frame.text, fill=(0, 0, 0), font=f)
            except Exception: continue
        save_webp(im, out, longside, q)
        save_webp(im, os.path.join(thumbdir, f'{si + 1:03d}.webp'), 320, 70)
    return len(prs.slides)

# ---------- main per deck
def guess_flags(info, deck, pdf_or_pptx_title=''):
    nimg, ndraw, words, frags = info['nimg'], info['ndraw'], info['words'], info['frags']
    t = (info['title'] + ' ' + pdf_or_pptx_title).lower()
    kind = deck['kind']
    has_img = nimg > 0
    labels_text = frags >= 4 and words <= 80
    has_labels = bool(has_img and (labels_text or ndraw >= 6) and 'unlabeled' not in deck['slug'])
    quiz_kw = bool(re.search(r'unlabel|quiz|identify|\bid\b|practice|name the|label the|blank|what is this|can you', t))
    sparse = has_img and words <= 14 and frags <= 4
    unlabeled = bool(has_img and (('unlabeled' in deck['slug']) or quiz_kw or (kind in ('practical',) ) or (kind in ('atlas', 'lab') and sparse and ndraw < 6)))
    if kind == 'practical': has_labels = False
    return has_labels, unlabeled

def parse_answers(pdf, outdir, slug):
    import fitz
    d = fitz.open(pdf)
    adir = os.path.join(outdir, 'answers_pages'); pages = []; render = any(len(p.get_images()) for p in d) and len(d) <= 40
    if render: os.makedirs(adir, exist_ok=True)
    for i, p in enumerate(d):
        text = p.get_text().strip()
        rec = dict(n=i + 1, text=text)
        qs = re.findall(r'(?m)^\s*(\d{1,3})[\.\)]\s+(.+)$', text)
        if qs: rec['numbered_lines'] = [dict(q=int(a), text=b.strip()) for a, b in qs]
        if render:
            r = p.rect; s = 1600 / max(r.width, r.height); f = os.path.join(adir, f'{i + 1:03d}.webp')
            if not os.path.exists(f):
                pix = p.get_pixmap(matrix=fitz.Matrix(s, s), alpha=False)
                save_webp(Image.frombytes('RGB', (pix.width, pix.height), pix.samples), f, 1600, 75)
            rec['image'] = 'answers_pages/%03d.webp' % (i + 1)
        pages.append(rec)
    return pages

def norm_words(t):
    return set(re.findall(r'[a-z]{4,}', t.lower()))

def build(deck):
    t0 = time.time(); slug = deck['slug']; od = os.path.join(DECKS, slug)
    if os.path.exists(os.path.join(od, 'slides.json')): return slug, 'skipped', 0
    os.makedirs(od, exist_ok=True)
    pdf = os.path.join(RAW, deck['pdf']) if deck['pdf'] else None
    pptx = os.path.join(RAW, deck['pptx']) if deck['pptx'] else None
    imgdir = os.path.join(od, 'images'); meta = dict(slug=slug, kind=deck['kind'], unit=deck['unit'], number=deck['number'], year=deck['year'], pdf=deck['pdf'], pptx=deck['pptx'], notes=[])
    pinfo = None; px = None; pmeta = {}
    try:
        if pdf:
            render_pdf(pdf, os.path.join(od, 'pages'), os.path.join(od, 'thumbs'))
            pinfo = pdf_page_info(pdf)
        elif pptx:
            n = composite_pptx(pptx, os.path.join(od, 'pages'), os.path.join(od, 'thumbs'))
            meta['notes'].append('No PDF export: page renders are a rough composite of pictures, arrows/shapes and text boxes drawn from the PPTX (backgrounds, fonts and effects are approximate).')
        if pptx:
            px, pmeta = pptx_extract(pptx, imgdir)
        elif pdf:
            per = extract_pdf_images(pdf, imgdir)
        else:
            raise RuntimeError('no source')
    except Exception as e:
        meta['notes'].append('ERROR ' + repr(e)); meta['traceback'] = traceback.format_exc()[-1500:]
        json.dump(dict(meta=meta, slides=[]), open(os.path.join(od, 'error.json'), 'w'), indent=1)
        return slug, 'error ' + repr(e), time.time() - t0
    slides = []
    if pinfo is not None:
        n = len(pinfo)
        # map pptx slides to pdf pages
        mapping = {}
        if px:
            vis = [i for i, s in enumerate(px) if not s['hidden']]
            if len(px) == n: mapping = {i: i for i in range(n)}
            elif len(vis) == n: mapping = {k: vis[k] for k in range(n)}
            else:
                j = 0
                for k in range(n):
                    best, bj = 0, None
                    a = norm_words(pinfo[k]['text'])
                    for jj in range(j, min(len(px), j + 6)):
                        b = norm_words(px[jj]['text'] + ' ' + px[jj]['title'])
                        sc = len(a & b) / (len(a | b) or 1)
                        if sc > best: best, bj = sc, jj
                    if bj is not None and best > 0.25: mapping[k] = bj; j = bj + 1
                meta['notes'].append(f'PPTX has {len(px)} slides vs PDF {n} pages; matched {len(mapping)} by text similarity.')
        meta['slide_count_pptx'] = len(px) if px else None
        for k in range(n):
            info = pinfo[k]; ps = px[mapping[k]] if px and k in mapping else None
            files = ps['image_files'] if ps else per_files(per, k + 1) if not px and pdf else []
            title = (ps['title'] if ps and ps['title'] else info['title'])
            if ps and not files and info['nimg'] and not px: files = []
            hl, uq = guess_flags(info, deck, title)
            slides.append(dict(n=k + 1, title=title, text=info['text'], notes=ps['notes'] if ps else '', image_files=files,
                               has_labels=hl, is_unlabeled_quiz=uq, page_image=f'pages/{k + 1:03d}.webp', thumb=f'thumbs/{k + 1:03d}.webp',
                               pptx_slide=(mapping[k] + 1) if ps else None, pdf_embedded_images=info['nimg']))
    else:
        for k, s in enumerate(px):
            info = dict(nimg=len(s['image_files']), ndraw=0, words=len(s['text'].split()), frags=len([l for l in s['text'].split('\n') if 0 < len(l.strip()) <= 28]), title=s['title'])
            hl, uq = guess_flags(info, deck, s['title'])
            slides.append(dict(n=k + 1, title=s['title'], text=s['text'], notes=s['notes'], image_files=s['image_files'], has_labels=hl, is_unlabeled_quiz=uq,
                               page_image=f'pages/{k + 1:03d}.webp', thumb=f'thumbs/{k + 1:03d}.webp', pptx_slide=k + 1))
    meta.update({k: v for k, v in pmeta.items() if k in ('skipped_small_or_repeated', 'vector_images_skipped')})
    meta['page_count'] = len(slides)
    meta['image_count'] = len({f for s in slides for f in s['image_files']})
    # answers
    if deck['answers']:
        srcs = []
        for a in deck['answers']:
            pg = parse_answers(os.path.join(RAW, a), od, slug)
            ym = re.search(r'(20\d\d)', os.path.basename(a))
            srcs.append(dict(file=a, year=int(ym.group(1)) if ym else None, page_count=len(pg), pages=pg))
        json.dump(dict(slug=slug, sources=srcs), open(os.path.join(od, 'answers.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
        meta['answers_files'] = deck['answers']
    json.dump(dict(meta=meta, slides=slides), open(os.path.join(od, 'slides.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    return slug, 'ok %d pages' % len(slides), time.time() - t0

def per_files(per, n): return per.get(n, [])

if __name__ == '__main__':
    decks = discover()
    if ONLY: decks = [d for d in decks if d['slug'] in ONLY]
    # largest first
    def weight(d):
        w = 0
        for k in ('pdf', 'pptx'):
            if d[k]: w += os.path.getsize(os.path.join(RAW, d[k]))
        return -w
    decks.sort(key=weight)
    json.dump([{k: v for k, v in d.items()} for d in decks], open(os.path.join(OUT, '_decks_plan.json'), 'w', encoding='utf-8'), indent=1)
    print(len(decks), 'decks', flush=True)
    os.makedirs(DECKS, exist_ok=True)
    with Pool(WORKERS) as pool:
        for slug, st, dt in pool.imap_unordered(build, decks):
            print(f'{slug}: {st} ({dt:.0f}s)', flush=True)
