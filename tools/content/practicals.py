"""Join practical exam question pages with answer keys. Usage: practicals.py RAW OUT"""
import sys, os, re, json, warnings
warnings.filterwarnings('ignore')
import fitz
RAW, OUT = sys.argv[1], sys.argv[2]
PD = os.path.join(OUT, 'practicals'); os.makedirs(PD, exist_ok=True)

FOOT = re.compile(r'Intended for University of Vermont NSCI\s*3250, Spring 2025\. Do not distribute\.|NSCI 3250 - Do not share|^3250, Spring 2025\. Do not distribute\.$', re.M)
COLORS = 'red|blue|green|yellow|purple|pink|black|white|orange|brown|gray|grey|teal|silver'
KINDS = 'pins?|chalk|clips?|wires?|pipe cleaners?|balls?|stickers?|arrows?|tags?|lines?|box|string|thread|flags?'
def markers(t):
    out = []
    for m in re.finditer(r'\b(%s)\s+(%s)\b' % (COLORS, KINDS), t, re.I):
        out.append(dict(color=m.group(1).lower(), marker=re.sub(r's$', '', m.group(2).lower())))
    for m in re.finditer(r'\b(circled|outlined|colored|highlighted|indicated|shown|enclosed)\s+(?:in|by|with)\s+(?:the\s+)?(%s)\b(?!\s+(?:pins?|chalk|clip|wire))' % COLORS, t, re.I):
        d = dict(color=m.group(2).lower(), marker=m.group(1).lower() + ' region')
        if d not in out: out.append(d)
    if re.search(r'star-?\s*shaped sticker|★', t): out.append(dict(color=None, marker='star sticker'))
    return out

def qtypes(q):
    s = q.lower(); t = []
    if re.search(r'true or false|true/false', s): t.append('true_false')
    if re.search(r'\n?\s*[a-d]\.\s', q) and re.search(r'which of the following|select|choose|is this|represents|\ba\.\s', s): t.append('multiple_choice')
    if re.search(r'\b(identify|name|what is the (name|structure)|what structure|what is this)\b', s) and not re.search(r'function|name one (function|fiber|receptor)|name a ', s): t.append('identify_structure')
    if re.search(r'function|functional name|what does|role', s): t.append('function')
    if re.search(r'what plane|plane of section', s): t.append('plane')
    if re.search(r'dorsal or ventral|ventral surface|dorsal surface', s): t.append('orientation')
    if re.search(r'symptom|pathology|syndrome|aphasia|damage to|lesion|hemorrhage|hematoma|bleed|stroke|tumor|aneurysm|hernia', s): t.append('clinical')
    if re.search(r'synapse|cell bod|first-order|second-order|third-order|ipsilateral|contralateral|decussat|where do|which spinal cord tract|axons from|enter', s): t.append('connectivity')
    if re.search(r'what cells|what type of (tissue|neuron)|shape of the neuron|neuron associated|pseudounipolar', s): t.append('cell_type')
    if re.search(r'fiber type|receptor|modalit|sensation', s): t.append('modality_or_receptor')
    if re.search(r'level|rostral|caudal|vertebral', s): t.append('level')
    if re.search(r'brodmann|brodman', s): t.append('brodmann')
    if re.search(r'homunculus|part of the body', s): t.append('homunculus')
    if re.search(r'vesicle|embryo', s): t.append('embryology')
    if re.search(r'arter|vessel|blood supply|circulation|vein|sinus', s): t.append('vascular')
    if re.search(r'cranial nerve|\bcn\b|innervat|muscle', s): t.append('cranial_nerve')
    if re.search(r'\btract\b|fasciculus|lemniscus', s): t.append('tract')
    return t or ['other']

def page_info(pdf):
    d = fitz.open(pdf); out = []
    for i, p in enumerate(d):
        t = FOOT.sub('', p.get_text()).strip()
        out.append(dict(n=i + 1, text=t, nimg=len(p.get_images())))
    return out

QM = re.compile(r'(?:^|\n)\s*(Question\s*#?\s*(\d+)|Bonus\s*(\d)?)\s*[:\n ]', re.I)
def split_questions(pages):
    qs = []; cur = None
    for pg in pages:
        t = pg['text']; marks = list(re.finditer(r'(?:Question\s*#?\s*(\d+)(?:\s*&\s*\d+)?|Bonus\s*(\d)?)(?=\s|:|$)', t, re.I))
        body = [m for m in marks if len(t[m.end():m.end() + 6].strip()) > 0 or True]
        # page text after a header like 'Question 1&2 | NSCI...' is an image-only page
        real = []
        for j, m in enumerate(marks):
            end = marks[j + 1].start() if j + 1 < len(marks) else len(t)
            seg = t[m.end():end].strip()
            if '&' in m.group(0) and len(seg) < 3: continue
            if len(seg) < 4 and not re.search(r'bonus', m.group(0), re.I): continue
            real.append((m, seg))
        if real:
            for m, seg in real:
                num = m.group(1) or ('B' + (m.group(2) or ''))
                num = int(num) if num.isdigit() else num
                if re.search(r'bonus', m.group(0), re.I): num = 'B' + (m.group(2) or '1' if True else '')
                cur = dict(n=num, text=re.sub(r'\s+', ' ', seg).strip(' |'), raw=seg, question_page=pg['n'], image_pages=[])
                if pg['nimg']: cur['image_pages'].append(pg['n'])
                qs.append(cur)
        elif cur is not None and pg['nimg']:
            cur['image_pages'].append(pg['n'])
        elif cur is not None and pg['text'] == '':
            pass
    # questions sharing a page also share image pages that followed
    last = None
    for q in qs:
        if last and q['question_page'] == last['question_page'] and not q['image_pages']: q['image_pages'] = list(last['image_pages'])
        last = q
    # propagate trailing image pages to earlier questions on the same page
    for i in range(len(qs) - 2, -1, -1):
        if qs[i]['question_page'] == qs[i + 1]['question_page'] and qs[i + 1]['image_pages'] and qs[i]['image_pages'] != qs[i + 1]['image_pages']:
            qs[i]['image_pages'] = sorted(set(qs[i]['image_pages'] + qs[i + 1]['image_pages']))
    return qs

def parse_key(text):
    text = re.sub(r'[_]{2,}', ' ', text)
    parts = re.split(r'(?m)^\s*(B\d|Bonus\s*\d?|\d{1,2})\s*[\.:]\s*', text)
    key = {}; head = parts[0]
    for i in range(1, len(parts) - 1, 2):
        k = parts[i]; v = re.sub(r'\s+', ' ', parts[i + 1]).strip()
        if k.isdigit(): k = int(k)
        elif k.lower().startswith('bonus'): k = 'B' + (re.sub(r'\D', '', k) or '1')
        key[k] = v
    return head, key

def build(slug, unit, year, date, pdf, key_pdf=None, key_page=None, note=None, deck_slug=None):
    pages = page_info(os.path.join(RAW, pdf))
    key = {}; head = ''
    if key_pdf:
        kd = fitz.open(os.path.join(RAW, key_pdf)); head, key = parse_key(''.join(p.get_text() for p in kd))
        keyfile = key_pdf
    elif key_page:
        head, key = parse_key(fitz.open(os.path.join(RAW, pdf))[key_page - 1].get_text()); keyfile = f'{pdf} (page {key_page})'
        pages = [p for p in pages if p['n'] != key_page]
    else: keyfile = None
    qs = split_questions(pages)
    # bonus numbering normalisation
    seen = {}
    for q in qs:
        if isinstance(q['n'], str):
            seen[q['n']] = seen.get(q['n'], 0) + 1
    out = []
    unresolved = [k for k in key if k not in [q['n'] for q in qs]]
    for q in qs:
        ans = key.get(q['n'])
        if ans:
            ans = re.sub(r'#\s*wrong.*$', '', ans).replace('NSCI 3250 - Do not share', '').strip()
            if slug == 'practical-u3-2025' and q['n'] == 'B3': ans = ans.replace('Posterior horn of LV (or inferior or trigone)', '').strip()
        rec = dict(n=q['n'], question=q['text'], page=q['question_page'], page_image=f'decks/{deck_slug or slug}/pages/{q["question_page"]:03d}.webp',
                   image_pages=q['image_pages'], image_page_files=[f'decks/{deck_slug or slug}/pages/{p:03d}.webp' for p in q['image_pages']],
                   marker=markers(q['text']), types=qtypes(q['text']), answer=ans)
        if re.search(r'[a-d]\.\s', q['text']) and 'multiple_choice' in rec['types']:
            rec['choices'] = re.findall(r'\b([A-D])\.\s*([^A-D]*?)(?=\s+[A-D]\.\s|$)', q['text'])
        out.append(rec)
    # stray answer text after last bonus (Unit 3 Q6)
    if slug == 'practical-u3-2025':
        for r in out:
            if r['n'] == 6 and not r['answer']:
                r['answer'] = 'Posterior horn of LV (or inferior or trigone)'; r['answer_note'] = 'answer line is out of order at the end of the key page; assigned to the only blank (Q6)'
    doc = dict(slug=slug, unit=unit, year=year, date=date, kind='practical', deck=f'decks/{deck_slug or slug}', source_pdf=pdf, answer_source=keyfile,
               key_header=re.sub(r'\s+', ' ', head).strip(), question_count=len(out), answered=sum(1 for r in out if r['answer']), note=note, questions=out,
               unmatched_answers=unresolved)
    json.dump(doc, open(os.path.join(PD, f'{slug}.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(slug, len(out), 'questions', doc['answered'], 'answers', 'unmatched', unresolved)
    return doc

build('practical-u1-2025', 1, 2025, '2025-02-06', 'Unit_1_Practical_2025_pictures.pdf', key_pdf='Unit_1_Practical_Exam_2025_Answers.pdf')
build('practical-u1-2024', 1, 2024, '2024-02-08', 'Unit_1_Practical_Exam_2024.pdf', key_pdf='Unit_1_Practical_Exam_2024_ANSWERS.pdf')
build('practical-u2-2024', 2, 2024, None, 'NSCI_3250_Unit_2_Practical_2024.pdf', note='Histological images only (questions 9-24, 34-40 plus bonus); no answer key in the course zip.')
build('practical-u2-2025', 2, 2025, '2025-03-06', 'NSCI_3250_Unit_2_Practical_2025.pdf', key_page=37)
build('practical-u3-2025', 3, 2025, '2025-04-15', 'Unit_3_Practical_2025_Pictures.pdf', key_page=32)
