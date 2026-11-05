"""Parse structure-list PDFs/DOCX into hierarchical JSON. Usage: structures.py RAW OUTDIR"""
import sys, os, re, json, warnings
warnings.filterwarnings('ignore')
import fitz, docx
raw, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)

def clean_bullet(t):
    t = t.replace(' ', ' ')
    m = re.match(r'^\s*([-�•·▪●–\-o])\s+(?=\S)', t)
    bullet = False
    if m and (m.group(1) != 'o' or True):
        bullet = True; t = t[m.end():]
    return t, bullet

def pdf_lines(path):
    d = fitz.open(path)
    res = []
    for pi, pg in enumerate(d):
        W = pg.rect.width
        cols = {0: [], 1: []}
        for b in pg.get_text('dict')['blocks']:
            for l in b.get('lines', []):
                t = ''.join(s['text'] for s in l['spans'])
                if not t.strip():
                    continue
                bold = any(s['flags'] & 16 for s in l['spans'] if s['text'].strip())
                x0, y0, x1, y1 = l['bbox']
                c = 0 if x0 < W * 0.5 - 5 else 1
                cols[c].append(dict(raw=t, x0=x0, x1=x1, y0=y0, bold=bold, page=pi + 1, col=c))
        for c in (0, 1):
            L = sorted(cols[c], key=lambda r: (round(r['y0']), r['x0']))
            if not L: continue
            colmin = min(r['x0'] for r in L if not r['bold'] or True)
            colmax = max(r['x1'] for r in L)
            # merge same-y fragments
            M = []
            for r in L:
                if M and abs(M[-1]['y0'] - r['y0']) < 3:
                    M[-1]['raw'] += r['raw']; M[-1]['x1'] = r['x1']; M[-1]['bold'] = M[-1]['bold'] and r['bold']
                else:
                    M.append(r)
            for r in M:
                r['colmin'] = colmin; r['colmax'] = colmax
                res.append(r)
    return res

def build(lines):
    """lines: dicts raw,x0,x1,bold,colmin,colmax -> nested tree"""
    recs = []
    for r in lines:
        t = r['raw']
        lead = len(t) - len(t.lstrip(' '))
        t2, bullet = clean_bullet(t.strip() and t)
        t2 = re.sub(r'\s+', ' ', t2).strip()
        if not t2: continue
        recs.append(dict(text=t2, bullet=bullet, bold=r['bold'], indent=round(r['x0'] - r['colmin']) + lead * 4,
                         x0=r['x0'], x1=r['x1'], colmax=r['colmax'], colmin=r['colmin'], page=r['page']))
    # drop doc title lines
    recs = [r for r in recs if not (r['bold'] and re.match(r'^(nsci|unit \d+( structure list)?$|structure list$)', r['text'], re.I))]
    nb = [r for r in recs if not r['bold']]
    bullet_doc = len(nb) > 0 and sum(r['bullet'] for r in nb) > 0.5 * len(nb)
    if bullet_doc:
        for r in recs: r['indent'] = 0
    # merge wrapped lines
    merged = []
    for r in recs:
        if merged:
            p = merged[-1]
            wrapped = bullet_doc and (not r['bullet'] and not r['bold'] and not p['bold'] and not r['text'].startswith('*'))
            conn = re.search(r'(of|or|a|on|an|the|and|&|to|at|in|vs\.?)$|[,\-–(/]$', p['text'].strip(), re.I)
            nearedge = p['x1'] >= p['colmax'] - 40
            wrapped = wrapped or (not bullet_doc and r['bold'] == p['bold'] and not r['text'].startswith('*') and (
                r['text'][:1].islower() or r['text'][:1] in '(&' or conn or (p['bold'] and re.search(r'Level of \w+$', p['text'])) or (not p['bold'] and p['x1'] >= p['colmax'] - 6 and r['x0'] >= p['x0'])))
            # continuation lines of bullets are indented further than bullet text start
            if wrapped:
                p['text'] += ' ' + r['text']; p['x1'] = r['x1']; continue
        merged.append(dict(r))
    return merged

NOTE_RE = re.compile(r'\(([^)]*)\)')

def item(rec):
    text = rec['text']
    notes = []
    if text.startswith('*'):
        return dict(name=text.lstrip('* ').strip(), note=text, is_note=True)
    m = NOTE_RE.findall(text)
    name = text
    d = dict(name=name)
    if m:
        d['parenthetical'] = m
    low = text.lower()
    if re.search(r'\bknow\b|left vs|usually|general location|not present|cannot be', low):
        d['note'] = text
    return d

def to_tree(recs, kind):
    labs = []
    cur_lab = None; cur_grp = None; last_item = None
    def new_lab(title):
        nonlocal cur_lab, cur_grp, last_item
        cur_lab = dict(heading=title, groups=[], items=[]); labs.append(cur_lab); cur_grp = None; last_item = None
    def new_grp(title):
        nonlocal cur_grp, last_item
        if cur_lab is None: new_lab('(preamble)')
        cur_grp = dict(heading=title, items=[]); cur_lab['groups'].append(cur_grp); last_item = None
    i = 0
    base_item_indent = {}
    while i < len(recs):
        r = recs[i]
        centered = r['bold'] and (r['x0'] - r['colmin'] > 30 and r['x0'] - r['colmin'] > 0 and abs((r['x0'] + r['x1']) / 2 - (r['colmin'] + r['colmax']) / 2) < 40 and len(r['text']) < 60)
        is_lab = r['bold'] and re.match(r'^(lab|labs)\b', r['text'], re.I)
        if r['bold'] and (centered or is_lab):
            title = [r['text']]
            while i + 1 < len(recs) and recs[i + 1]['bold'] and (recs[i + 1]['x0'] - recs[i + 1]['colmin'] > 30 or recs[i+1]['text'].startswith('(')) and abs(recs[i+1]['y0'] if False else 0) == 0 and recs[i + 1]['page'] == r['page']:
                i += 1; title.append(recs[i]['text'])
            t = ' / '.join(title)
            if re.match(r'^(nsci|unit)\b', t, re.I) and not re.search(r'lab', t, re.I):
                preamble = t
                if not labs: new_lab(t)
                else: new_lab(t)
            else:
                new_lab(t)
        elif r['bold']:
            new_grp(r['text'])
        else:
            it = item(r)
            it['indent'] = r['indent']
            if it.get('is_note'):
                tgt = cur_grp if cur_grp else cur_lab
                if tgt is None: new_lab('(preamble)'); tgt = cur_lab
                tgt.setdefault('notes', []).append(it['note'])
                if last_item is not None: last_item.setdefault('notes', []).append(it['note'])
            else:
                if cur_lab is None: new_lab('(preamble)')
                if cur_grp is None: new_grp(None) if False else None
                tgt = cur_grp['items'] if cur_grp else cur_lab['items']
                # nesting by indent relative to previous items
                parent = None
                for cand in reversed(tgt):
                    if cand['indent'] < it['indent']:
                        parent = cand; break
                    if cand['indent'] == it['indent']:
                        break
                if parent is not None:
                    parent.setdefault('children', []).append(it)
                else:
                    tgt.append(it)
                last_item = it
        i += 1
    return labs

# Unit 1 hand nesting where the PDF flattens indentation (same x)
UNIT1_PARENTS = {
    'Lateral ventricle': ['Anterior horn', 'Body', 'Inferior horn', 'Posterior horn', 'Atrium or trigone'],
    'Dura mater': ['Falx cerebri', 'Tentorium cerebelli'],
    'Basal ganglia (caudate, putamen, globus pallidus)': [],
    'Sagittal (midsagittal, parasagittal)': [],
    'Dorsal Horns': [], 'Fasciculus Gracilis': [], 'Dorsal Columns': ['Fasciculus Gracilis', 'Fasciculus Cuneatus'],
}

def regroup(labs, parents):
    def fix(items):
        out = []
        i = 0
        while i < len(items):
            it = items[i]
            kids = parents.get(it['name'].strip())
            if kids:
                names = [k.strip().lower() for k in kids]
                j = i + 1
                while j < len(items) and items[j]['name'].strip().lower().rstrip() in names:
                    it.setdefault('children', []).append(items[j]); j += 1
                it['nesting_inferred'] = True
                out.append(it); i = j
            else:
                out.append(it); i += 1
        return out
    for lab in labs:
        lab['items'] = fix(lab['items'])
        for g in lab['groups']:
            g['items'] = fix(g['items'])

def flatten(labs):
    names = []
    def walk(items, lab, grp, parent=None):
        for it in items:
            names.append(dict(name=it['name'], lab=lab, group=grp, parent=parent, note=it.get('note')))
            walk(it.get('children', []), lab, grp, it['name'])
    for lab in labs:
        walk(lab['items'], lab['heading'], None)
        for g in lab['groups']:
            walk(g['items'], lab['heading'], g['heading'])
    return names

def docx_lines(path):
    d = docx.Document(path)
    res = []
    for p in d.paragraphs:
        t = p.text.replace('\t', ' ').strip()
        if not t: continue
        bold = bool(p.runs) and all((r.bold or False) for r in p.runs if r.text.strip())
        res.append(dict(raw=t, x0=0, x1=0, colmin=0, colmax=999, bold=bold, page=1))
    return res

def parse(fname, kind):
    p = os.path.join(raw, fname)
    if fname.endswith('.docx'):
        lines = docx_lines(p)
        # docx: no wrap merge; headings bold; first lines
        recs = []
        for r in lines:
            t = re.sub(r'\s+', ' ', r['raw']).strip()
            recs.append(dict(text=t, bullet=False, bold=r['bold'], indent=0, x0=0, x1=0, colmax=999, colmin=0, page=1))
        labs = []
        # docx titles: 'Lab 13 - HORIZONTAL SECTIONS' bold
        cur_lab = None; cur_grp = None
        for r in recs:
            if re.match(r'^(nsci|unit \d)', r['text'], re.I) and r['bold']:
                continue
            if r['bold'] and re.match(r'^lab\b', r['text'], re.I):
                cur_lab = dict(heading=r['text'], groups=[], items=[]); labs.append(cur_lab); cur_grp = None
            elif r['bold']:
                if cur_lab is None: cur_lab = dict(heading='(preamble)', groups=[], items=[]); labs.append(cur_lab)
                cur_grp = dict(heading=r['text'], items=[]); cur_lab['groups'].append(cur_grp)
            else:
                if cur_lab is None: cur_lab = dict(heading='(preamble)', groups=[], items=[]); labs.append(cur_lab)
                it = item(r)
                if it.get('is_note'):
                    (cur_grp or cur_lab).setdefault('notes', []).append(it['note'])
                    if (cur_grp or cur_lab)['items']: (cur_grp or cur_lab)['items'][-1].setdefault('notes', []).append(it['note'])
                    continue
                it['indent'] = 0
                (cur_grp['items'] if cur_grp else cur_lab['items']).append(it)
        return labs, [r['text'] for r in recs]
    lines = pdf_lines(p)
    recs = build(lines)
    labs = to_tree(recs, kind)
    return labs, [dict(page=r['page'], text=r['text'], bold=r['bold'], indent=r['indent'], bullet=r['bullet']) for r in recs]

def strip_indent(items):
    for it in items:
        it.pop('indent', None)
        strip_indent(it.get('children', []))

FILES = {
    'unit1': ['Structure_List_Unit_1.pdf', 'Structure_List_Unit_1_2024.pdf'],
    'unit2': ['Structure_List_Unit_2_2025.pdf', 'Structure_List_Unit_2_2024.pdf'],
    'unit3': ['Structure_List_Unit_3.docx', 'Structure_List_Unit_3.pdf'],
}
results = {}
for u, (main, alt) in FILES.items():
    labs, rl = parse(main, u)
    if u == 'unit1': regroup(labs, UNIT1_PARENTS)
    for lab in labs:
        strip_indent(lab['items'])
        for g in lab['groups']: strip_indent(g['items'])
    flat = flatten(labs)
    # diff vs alt
    alabs, arl = parse(alt, u)
    if u == 'unit1': regroup(alabs, UNIT1_PARENTS)
    aflat = flatten(alabs)
    norm = lambda s: re.sub(r'[^a-z0-9]+', ' ', s.lower()).strip()
    def fulltext(rl):
        return norm(' '.join(x if isinstance(x, str) else x['text'] for x in rl))
    ft_cur, ft_old = fulltext(rl), fulltext(arl)
    diff = dict(compared_file=alt, method='item text not found anywhere in the other version (normalized)',
                only_in_canonical=sorted({x['name'] for x in flat if norm(x['name']) and norm(x['name']) not in ft_old}),
                only_in_other=sorted({x['name'] for x in aflat if norm(x['name']) and norm(x['name']) not in ft_cur}))
    doc = dict(unit=int(u[-1]), source_file=main, labs=labs, structure_count=len(flat), flat=flat,
               raw_lines=rl, diff_vs_other_version=diff)
    json.dump(doc, open(os.path.join(out, u + '.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(u, len(labs), 'labs', len(flat), 'items;', 'diff +', len(diff['only_in_canonical']), '-', len(diff['only_in_other']))
