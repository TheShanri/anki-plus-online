import os, re, sys, json, hashlib
raw = sys.argv[1]; out = sys.argv[2]
files = []
for dp, dn, fn in os.walk(raw):
    for f in fn:
        p = os.path.join(dp, f)
        files.append(os.path.relpath(p, raw).replace('\\', '/'))
files.sort()

def sha(p):
    h = hashlib.sha1()
    with open(os.path.join(raw, p), 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()

def parse(rel):
    base = os.path.basename(rel)
    stem, ext = os.path.splitext(base)
    ext = ext.lower()
    s = stem
    copy = bool(re.search(r' - Copy\b', s))
    s = re.sub(r' - Copy\b', '', s)
    ym = re.search(r'[(_ ]((?:20)2[3-6])[)_ ]?', s)
    year = int(ym.group(1)) if ym else None
    suffix_dig = False
    s2 = s
    s2 = re.sub(r'\s*\((20\d\d)\)', '', s2)
    s2 = re.sub(r'[_ ]20\d\d(?=[_ ]|$)', '', s2)
    m = re.search(r'(?<=[A-Za-z&)_ ])(\d)$', s2)
    if m and not re.search(r'(Lab|Lecture|Unit|session|Session)[ _]?\d$', s2):
        suffix_dig = True; s2 = s2[:-1]
    s2 = re.sub(r'_new1?$', '', s2)
    s2 = re.sub(r'[_ ]updated','',s2,flags=re.I)
    key = re.sub(r'[^a-z0-9]+', ' ', s2.lower()).strip()
    return dict(base=base, ext=ext, copy=copy, year=year, suffix=suffix_dig, key=key, stem=stem)

def classify(rel, p):
    b = p['base']; k = p['key']; ext = p['ext']
    kind = 'other'; unit = None; number = None; role = None; note = None
    low = b.lower()
    if ext == '.apkg': kind = 'apkg'
    elif ext in ('.heic', '.jpg', '.jpeg'): kind = 'photo'
    elif 'syllabus' in low: kind = 'syllabus'
    elif 'structure_list' in low: kind = 'structure_list'
    elif 'cheat sheet' in low or 'cranial nerve chart' in low: kind = 'cheatsheet'
    elif low.startswith('si session'):
        kind = 'si_session'; number = int(re.search(r'session (\d+)', low).group(1))
        role = 'answers' if 'key' in low else 'questions'
    elif 'atlas' in low or 'internal morphology' in low or 'brainstem overlay' in low: kind = 'atlas'
    elif 'practice practical' in low: kind = 'practical'; role = 'practice'
    elif 'practice exam' in low:
        kind = 'practice_exam'; role = 'answers' if 'key' in low or 'answer' in low else 'questions'
    elif re.search(r'unit_?\s?\d_practical|unit_\d_practical|practical_(20|exam)|_unit_\d_practical', low) or re.search(r'unit_\d_practical', low) or 'practical' in low:
        kind = 'practical_answers' if ('answer' in low) else 'practical'
    elif 'assignment' in low:
        kind = 'assignment'; role = 'answers' if ('answer' in low) else 'questions'
    elif re.match(r'lab[_ ]\d+', low) and 'blank_drawings' in low:
        kind = 'assignment'; role = 'blank'
    elif re.match(r'lab[_ ]\d+', low):
        kind = 'lab_answers' if ('answer' in low or 'answesrs' in low) else 'lab'
    elif re.match(r'lec', low):
        kind = 'lecture'
        if 'questions' in low: kind = 'other'; note = 'cranial nerve testing question set'
    m = re.match(r'(?:lab|lecture|lecutre)[_ ]0?(\d+)', low)
    if m: number = int(m.group(1))
    m = re.search(r'unit[_ ](\d)', low)
    if m: unit = int(m.group(1))
    elif number is not None:
        if kind in ('lecture', 'other') and 'lecture' in low or 'lecutre' in low:
            unit = 1 if 1 <= number <= 6 else 2 if 7 <= number <= 12 else 3 if number >= 13 else None
        elif kind in ('lab', 'lab_answers'):
            unit = 1 if 1 <= number <= 6 else 2 if 7 <= number <= 12 else 3
    m = re.search(r'lab[ _](\d+)', low)
    if kind == 'apkg':
        if m: number = int(m.group(1))
        unit = (1 if number and number <= 6 else 2 if number and number <= 12 else 3) if number else None
        if 'unit 1' in low: unit = 1
        if 'brainstem overlay' in low or 'visual' in low: unit = 2
    if kind == 'si_session': unit = {4: 1, 5: 2, 7: 3, 8: 3}.get(number)
    if kind == 'practical' and role == 'practice' : unit = 1; number = 3
    if kind == 'cheatsheet' and unit is None: unit = 1 if 'sensory' in low else 2
    if kind == 'atlas':
        unit = 2 if 'brainstem' in low else 3
    if kind == 'lecture' and 'cranial nerve chart' in low: kind = 'cheatsheet'
    if 'unit 1 practice' in low or 'unit_1' in low or 'unit 1' in low: unit = 1
    if 'unit 2' in low or 'unit_2' in low: unit = 2
    if 'unit 3' in low or 'unit_3' in low: unit = 3
    if 'blank_drawings' in low: unit = 2; number = 8
    if 'brainstem_atlas' in low: unit = 2
    if 'nbh' in low: kind = 'other'; note = 'unrelated event flyer'
    if 'snell' in low and ext == '.pdf': kind = 'other'; note = 'copyrighted textbook; outline only'
    if 'student guide' in low: kind = 'other'; note = 'Anki install guide'
    if ext == '.html': kind = 'other'
    return kind, unit, number, role, note

recs = {}
for rel in files:
    p = parse(rel)
    kind, unit, number, role, note = classify(rel, p)
    year = p['year']
    if year is None:
        year = 2026 if kind == 'syllabus' else 2025
    recs[rel] = dict(kind=kind, unit=unit, number=number, role=role, year=year, note=note,
                     _p=p, ext=p['ext'], size=os.path.getsize(os.path.join(raw, rel)))
# hash dupes
by_hash = {}
for rel in files:
    by_hash.setdefault(sha(rel), []).append(rel)
for h, lst in by_hash.items():
    for r in lst: recs[r]['_hash'] = h

def score(rel):
    r = recs[rel]; p = r['_p']
    s = 0
    if p['copy']: s -= 100
    if p['suffix']: s -= 10
    if p['year'] in (None, 2025, 2026): s += 50
    else: s += (p['year'] - 2000)  # newer prior year better
    if '_new' in p['stem']: s -= 5
    return s

groups = {}
for rel, r in recs.items():
    p = r['_p']
    gkey = (p['key'], r['ext'], r['kind'], r['role'])
    # practicals/exams/answers: year distinguishes items
    if r['kind'] in ('practical', 'practical_answers', 'practice_exam', 'si_session', 'apkg', 'photo') or (r['kind']=='assignment' and r['role']=='answers'):
        gkey += (r['year'],)
    groups.setdefault(gkey, []).append(rel)

# lecture/lab etc: merge ext into same group for naming dup? keep per-ext (pptx vs pdf both canonical, different roles)
for gk, lst in groups.items():
    lst.sort(key=lambda x: -score(x))
    best = lst[0]
    for rel in lst:
        recs[rel]['canonical'] = (rel == best)
        recs[rel]['duplicate_of'] = None if rel == best else best
# identical-hash safety (e.g. Unit 3 practice exam == answer key content-hash); keep as is but note
for h, lst in by_hash.items():
    if len(lst) > 1:
        for r in lst:
            recs[r]['identical_content_files'] = [x for x in lst if x != r]
# year-tagged ones in lecture/lab/atlas/structure: if a current (None/2025) exists in same key ignoring ext -> already handled by group. If only year-tagged exists, it is canonical (done).
# 2025+2024 structure lists: key differs (unit_1 vs unit_1 2024?) handled by year strip -> same group, fine, but keep the 2024 as 'kept for diff'
for rel, r in recs.items():
    if r['kind'] == 'structure_list' and not r['canonical']:
        r['note'] = (r['note'] or '') + 'prior-year structure list kept only for diff'
    if r['kind'] in ('lecture', 'lab', 'lab_answers', 'atlas', 'assignment'):
        pass
res = {}
for rel in files:
    r = recs[rel]
    res[rel] = {k: r[k] for k in ('canonical', 'kind', 'unit', 'number', 'year', 'duplicate_of', 'role', 'note', 'ext', 'size') }
    if 'identical_content_files' in r: res[rel]['identical_content_files'] = r['identical_content_files']
json.dump(res, open(out, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
for rel in files:
    r = res[rel]
    print(('C ' if r['canonical'] else '  '), r['kind'][:10].ljust(10), r['unit'], r['number'], r['year'], r['role'], '|', rel[:80], '->', (r['duplicate_of'] or '')[:40])
