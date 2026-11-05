"""Parse written practice exams / SI tests (question + options + marked answer) -> content-build/practicals/exams-*.json
Usage: exams.py RAW OUT"""
import sys, os, re, json, warnings
warnings.filterwarnings('ignore')
import fitz
RAW, OUT = sys.argv[1], sys.argv[2]
os.makedirs(os.path.join(OUT, 'practicals'), exist_ok=True)

def get_lines(path):
    d = fitz.open(path); res = []
    for pi, p in enumerate(d):
        rects = []
        try:
            for dr in p.get_drawings():
                f = dr.get('fill')
                if f and tuple(f) != (1, 1, 1) and dr['rect'].width > 20: rects.append((dr['rect'], tuple(f)))
        except Exception: pass
        for b in p.get_text('dict')['blocks']:
            for l in b.get('lines', []):
                sp = [s for s in l['spans'] if s['text'].strip()]
                if not sp: continue
                text = ''.join(s['text'] for s in l['spans']).strip()
                bold = any((s['flags'] & 16) or 'Bold' in s['font'] for s in sp)
                nonblack = any(s['color'] not in (0, 0x000000) for s in sp)
                lr = fitz.Rect(l['bbox'])
                hl = any(lr.intersects(r) and (lr & r).get_area() > 0.5 * lr.get_area() for r, f in rects)
                ital = any(s['flags'] & 2 for s in sp)
                res.append(dict(text=text, bold=bold, color=nonblack, hl=hl, page=pi + 1, y=l['bbox'][1], x=l['bbox'][0]))
    return res

def parse(path):
    L = get_lines(path)
    qs = []; cur = None; lastopt = None
    for l in L:
        t = l['text']
        m = re.match(r'^(\d{1,2})[\.\)]\s*(.*)$', t)
        mo = re.match(r'^([a-eA-E])[\.\)]\s*(.*)$', t)
        if m and (cur is None or int(m.group(1)) == cur['n'] + 1 or int(m.group(1)) == 1) and not (mo and cur and lastopt):
            cur = dict(n=int(m.group(1)), stem=m.group(2), options=[], page=l['page'], _marks=[]); qs.append(cur); lastopt = None; continue
        if cur is None: continue
        if mo and re.match(r'^[a-eA-E]$', mo.group(1)) and (not cur['options'] or mo.group(1).lower() == chr(ord(cur['options'][-1]['letter']) + 1)) and (mo.group(1).lower() == 'a' or cur['options']):
            op = dict(letter=mo.group(1).lower(), text=mo.group(2), marked=l['bold'] or l['hl'])
            cur['options'].append(op); lastopt = op; continue
        if lastopt is not None and not re.match(r'^\d', t): lastopt['text'] += ' ' + t; lastopt['marked'] = lastopt['marked'] or l['bold'] or l['hl']
        else: cur['stem'] += ' ' + t
    for q in qs:
        # a bold marker on nearly every option means no real marking
        marked = [o['letter'] for o in q['options'] if o['marked']]
        q['marked_options'] = marked if 0 < len(marked) < len(q['options']) else []
        for o in q['options']: o.pop('marked', None)
        q.pop('_marks', None)
        q['stem'] = re.sub(r'\s+', ' ', q['stem']).strip()
        for o in q['options']: o['text'] = re.sub(r'\s+', ' ', o['text']).strip()
    return qs

def qtype(q):
    s = q['stem'].lower()
    if not q['options']: return 'free_response'
    return 'multiple_choice'

EXAMS = [
    ('practice-exam-u1', 1, 'Unit 1 Practice Exam Student Copy .pdf', 'Unit 1 Practice Exam Key.pdf'),
    ('practice-exam-u2', 2, 'Unit 2 practice exam student copy.pdf', 'Unit 2 practice exam student answer key.pdf'),
    ('practice-exam-u3', 3, 'Unit 3 Practice Exam.pdf', 'Unit 3 Practice Exam Answer Key .pdf'),
    ('si-session-4', 1, 'SI session 4 Test.pdf', 'SI session 4 Test Key.pdf'),
    ('si-session-5', 2, 'SI session 5 Test.pdf', 'SI session 5 Test Key.pdf'),
    ('si-session-7', 3, 'SI session 7 Test .pdf', 'SI session 7 Test key 1.pdf'),
    ('si-session-8', 3, 'SI session 8 Test.pdf', 'SI session 8 Test key.pdf'),
]
for slug, unit, qf, kf in EXAMS:
    q = parse(os.path.join(RAW, qf)); k = parse(os.path.join(RAW, kf))
    kd = {x['n']: x for x in k}
    out = []
    for x in q:
        key = kd.get(x['n'])
        rec = dict(n=x['n'], type=qtype(x), question=x['stem'], options=x['options'], page=x['page'],
                   answer_letters=(key['marked_options'] if key else []) or x['marked_options'])
        if key:
            rec['answer_text'] = [o['text'] for o in key['options'] if o['letter'] in rec['answer_letters']]
            if not rec['answer_letters']:
                rec['answer_note'] = 'no answer marked in key file text/format'
            # SI keys sometimes annotate in text ("Correct", "Answer:")
            m = [o['text'] for o in key['options'] if re.search(r'\(correct|\bcorrect\b|✓|answer', o['text'], re.I)]
            if m and not rec['answer_letters']:
                rec['answer_letters'] = [o['letter'] for o in key['options'] if re.search(r'\(correct|\bcorrect\b|✓|answer', o['text'], re.I)]
                rec['answer_text'] = m; rec.pop('answer_note', None)
        out.append(rec)
    doc = dict(slug=slug, unit=unit, question_file=qf, key_file=kf, question_count=len(out), answered=sum(1 for r in out if r['answer_letters']), questions=out)
    if qf.startswith('Unit 3 Practice Exam') : doc['note'] = 'Unit 3 Practice Exam, its Answer Key and SI session 8 Test key are byte-identical PDFs.'
    json.dump(doc, open(os.path.join(OUT, 'practicals', f'exam-{slug}.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(slug, len(out), 'questions;', doc['answered'], 'with answers; free_response', sum(1 for r in out if r['type'] == 'free_response'))
