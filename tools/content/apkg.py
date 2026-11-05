"""Parse .apkg decks. Usage: apkg.py RAW OUT"""
import sys, os, re, json, zipfile, sqlite3, tempfile, warnings, glob, collections, html
import zstandard
RAW, OUT = sys.argv[1], sys.argv[2]
TMP = sys.argv[3] if len(sys.argv) > 3 else tempfile.gettempdir()
dctx = zstandard.ZstdDecompressor()

def zs(b):
    if b[:4] == b'\x28\xb5\x2f\xfd':
        return dctx.decompressobj().decompress(b)
    return b

def varint(b, i):
    r = 0; s = 0
    while True:
        c = b[i]; i += 1; r |= (c & 0x7f) << s; s += 7
        if not c & 0x80: return r, i

def parse_pb(b):
    """generic protobuf -> list of (field, wiretype, value)"""
    i = 0; out = []
    while i < len(b):
        k, i = varint(b, i); f, w = k >> 3, k & 7
        if w == 0: v, i = varint(b, i)
        elif w == 2:
            l, i = varint(b, i); v = b[i:i + l]; i += l
        elif w == 1: v = b[i:i + 8]; i += 8
        elif w == 5: v = b[i:i + 4]; i += 4
        else: raise ValueError('wt %d' % w)
        out.append((f, w, v))
    return out

def media_map(raw):
    """returns dict zipname -> real filename"""
    raw = zs(raw)
    try:
        j = json.loads(raw.decode('utf-8'))
        if isinstance(j, dict): return {k: v for k, v in j.items()}
    except Exception: pass
    m = {}; idx = 0
    for f, w, v in parse_pb(raw):
        if f == 1 and w == 2:
            ent = parse_pb(v); name = None; legacy = None
            for ff, ww, vv in ent:
                if ff == 1: name = vv.decode('utf-8', 'replace')
                if ff == 4: legacy = vv
            m[str(legacy if legacy is not None else idx)] = name
            idx += 1
    return m

IO_RE = re.compile(r'\{\{c(\d+)::image-occlusion:(\w+)((?::[^:{}]*)*)\}\}')
def parse_occlusion(text):
    shapes = []
    for m in IO_RE.finditer(text or ''):
        d = dict(cloze=int(m.group(1)), shape=m.group(2))
        for part in m.group(3).split(':'):
            if '=' in part:
                k, v = part.split('=', 1)
                if k in ('points', 'text', 'fill'): d[k] = v
                else:
                    try: d[k] = float(v)
                    except ValueError: d[k] = v
        shapes.append(d)
    return shapes

def strip(t):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', t or ''))).strip()

def parse_deck(path, slug):
    z = zipfile.ZipFile(path); names = z.namelist()
    od = os.path.join(OUT, 'apkg', slug); os.makedirs(os.path.join(od, 'media'), exist_ok=True)
    # media
    mm = media_map(z.read('media')) if 'media' in names else {}
    written = 0; missing = 0; mapping = {}
    for zn, real in mm.items():
        if zn not in names: missing += 1; continue
        real = os.path.basename(real.replace('\\', '/')) if real else zn
        data = zs(z.read(zn))
        with open(os.path.join(od, 'media', real), 'wb') as f: f.write(data)
        mapping[zn] = real; written += 1
    # collection
    for cand in ('collection.anki21b', 'collection.anki21', 'collection.anki2'):
        if cand in names:
            data = zs(z.read(cand))
            tp = os.path.join(TMP, f'col_{slug}.sqlite'); open(tp, 'wb').write(data)
            con = sqlite3.connect(tp)
            tabs = {r[0] for r in con.execute("select name from sqlite_master where type='table'")}
            nn = con.execute('select count(*) from notes').fetchone()[0]
            if nn == 0 and cand != names[-1]:
                con.close(); continue
            used = cand; break
    else:
        raise RuntimeError('no collection')
    ntypes = {};
    if 'notetypes' in tabs:
        for nid, name in con.execute('select id,name from notetypes'):
            fl = [r[0] for r in con.execute('select name from fields where ntid=? order by ord', (nid,))]
            tm = [r[0] for r in con.execute('select name from templates where ntid=? order by ord', (nid,))]
            ntypes[nid] = dict(name=name, fields=fl, templates=tm)
        decks = {i: n.replace('\x1f', '::') for i, n in con.execute('select id,name from decks')}
    else:
        cj = con.execute('select models,decks from col').fetchone()
        for mid, m in json.loads(cj[0]).items():
            ntypes[int(mid)] = dict(name=m['name'], fields=[f['name'] for f in sorted(m['flds'], key=lambda x: x['ord'])], templates=[t['name'] for t in m['tmpls']])
        decks = {int(i): d['name'].replace('\x1f', '::') for i, d in json.loads(cj[1]).items()}
    cards = collections.defaultdict(list)
    for cid, nid, did, ordn in con.execute('select id,nid,did,ord from cards'):
        cards[nid].append(dict(card_id=cid, ord=ordn, deck=decks.get(did, str(did))))
    notes = []
    for nid, guid, mid, tags, flds, sfld in con.execute('select id,guid,mid,tags,flds,sfld from notes order by id'):
        nt = ntypes.get(mid, dict(name=str(mid), fields=[], templates=[]))
        vals = flds.split('\x1f')
        fields = {}
        for i, v in enumerate(vals):
            fields[nt['fields'][i] if i < len(nt['fields']) else f'field{i}'] = v
        # rewrite media refs to real names (src already real names in new exports)
        rec = dict(id=nid, guid=guid, note_type=nt['name'], fields=fields, tags=[t for t in tags.strip().split(' ') if t],
                   deck=(cards[nid][0]['deck'] if cards[nid] else None), card_count=len(cards[nid]), cards=cards[nid])
        occ = None
        for k, v in fields.items():
            if 'image-occlusion' in (v or ''): occ = parse_occlusion(v); break
        if occ is not None: rec['occlusions'] = occ
        imgs = re.findall(r'<img[^>]+src=["\']([^"\']+)["\']', ' '.join(vals))
        if imgs: rec['images'] = imgs
        snds = re.findall(r'\[sound:([^\]]+)\]', ' '.join(vals))
        if snds: rec['sounds'] = snds
        notes.append(rec)
    con.close()
    try: os.remove(tp)
    except Exception: pass
    ntcount = collections.Counter(n['note_type'] for n in notes)
    deckcount = collections.Counter(c['deck'] for n in notes for c in n['cards'])
    doc = dict(source_file=os.path.basename(path), slug=slug, collection_file=used, note_count=len(notes), card_count=sum(n['card_count'] for n in notes),
               note_types=[dict(nt, count=ntcount.get(nt['name'], 0)) for nt in ntypes.values() if ntcount.get(nt['name'], 0)],
               decks=dict(deckcount), media_files=written, media_missing=missing, notes=notes)
    json.dump(doc, open(os.path.join(od, 'notes.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    # README
    samples = []
    for n in notes[:3]:
        samples.append('; '.join(f'{k}={strip(v)[:60]!r}' for k, v in n['fields'].items() if strip(v))[:240])
    occn = sum(1 for n in notes if n.get('occlusions') is not None)
    allfield = ' '.join(strip(v) for n in notes for v in n['fields'].values())
    tagset = collections.Counter(t for n in notes for t in n['tags'])
    readme = [f'# {slug}', '', f'Source: `{os.path.basename(path)}`', '',
              f'- {len(notes)} notes, {doc["card_count"]} cards, {written} media files',
              '- Note types: ' + ', '.join(f"{k} ({v})" for k, v in ntcount.items()),
              f'- Image Occlusion notes: {occn}' + (' (shapes in `occlusions`: cloze number, shape rect/ellipse/polygon, left/top/width/height as fractions of the image)' if occn else ''),
              '- Decks: ' + ', '.join(f'{k} ({v})' for k, v in list(deckcount.items())[:6]),
              ('- Top tags: ' + ', '.join(f'{k} ({v})' for k, v in tagset.most_common(6))) if tagset else '- No tags',
              '- Cards are image-occlusion: the label text is baked into the image (`media/`) and the mask rectangles hide it; there is no separate text answer field unless Header/Back Extra is filled.' if occn else '',
              '', 'Sample notes:'] + [f'- {s}' for s in samples]
    open(os.path.join(od, 'README.md'), 'w', encoding='utf-8').write('\n'.join(readme) + '\n')
    return slug, len(notes), doc['card_count'], written, missing, dict(ntcount)

def slug_of(f):
    s = os.path.splitext(os.path.basename(f))[0].replace('Neuroanatomy_', '').replace('Neuroanatomy', '')
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')

if __name__ == '__main__':
    tot = [0, 0]
    for f in sorted(glob.glob(os.path.join(RAW, '*.apkg'))):
        r = parse_deck(f, slug_of(f)); print(r, flush=True); tot[0] += r[1]; tot[1] += r[2]
    print('TOTAL notes/cards', tot)
