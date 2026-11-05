"""Write INVENTORY.md. Usage: inventory.py OUT"""
import sys, os, re, json, glob, collections
OUT = sys.argv[1]
def J(p): return json.load(open(os.path.join(OUT, p), encoding='utf-8'))
man = J('manifest.json')
decks = {}
for sj in sorted(glob.glob(os.path.join(OUT, 'decks', '*', 'slides.json'))):
    slug = os.path.basename(os.path.dirname(sj)); d = J(f'decks/{slug}/slides.json'); decks[slug] = d
idx = J('structure_index.json')['structures']
gaps = J('_struct_gaps.json')
L = []
def w(s=''): L.append(s)

n_files = len(man); n_can = sum(1 for m in man.values() if m['canonical'])
kinds = collections.Counter(m['kind'] for m in man.values() if m['canonical'])
pages = sum(len(d['slides']) for d in decks.values())
imgs = sum(d['meta'].get('image_count', 0) for d in decks.values())
apk = {os.path.basename(os.path.dirname(p)): J(os.path.relpath(p, OUT).replace(os.sep, '/')) for p in glob.glob(os.path.join(OUT, 'apkg', '*', 'notes.json'))}
w('# NSCI 3250 Human Neuroanatomy (UVM) - source inventory'); w()
w(f'Built from the course zip: {n_files} raw files, {n_can} canonical (see `manifest.json`). {len(decks)} decks rendered, {pages} page images, {imgs} extracted embedded images, {len(apk)} Anki decks ({sum(a["note_count"] for a in apk.values())} notes, {sum(a["card_count"] for a in apk.values())} cards).')
w(); w('Layout: `decks/<slug>/{pages,thumbs,images}/`, `slides.json`, optional `answers.json` + `answers_pages/`; `apkg/<slug>/{notes.json,media/,README.md}`; `structures/unit{1,2,3}.json`; `practicals/*.json`; `photos/`; `syllabus.json`; `snell_toc.json`; `structure_index.json`.')
w(); w('Course units (from the 2026 syllabus): Unit 1 = lectures 1-6 / labs 1-5 (Written+Practical Exam 1: 2026-02-05); Unit 2 = lectures 7-12 / labs 7-11 (exam 2026-03-05); Unit 3 = lectures 13-19 / labs 13-17 (exam 2026-04-14).')

def title_of(slug, d):
    m = d['meta']; f = m.get('pdf') or m.get('pptx') or slug
    return os.path.splitext(os.path.basename(f))[0]

def unit_of(slug, d):
    u = d['meta'].get('unit'); return u
unit_decks = {1: [], 2: [], 3: [], None: []}
for slug, d in decks.items(): unit_decks[unit_of(slug, d)].append(slug)
# structure coverage per unit
by_unit = {1: [], 2: [], 3: []}
for e in idx:
    for u in e['units']: by_unit[u].append(e)
sflat = {u: J(f'structures/unit{u}.json') for u in (1, 2, 3)}

def deck_line(slug, d):
    sl = d['slides']; m = d['meta']
    nlab = sum(1 for s in sl if s['has_labels']); nq = sum(1 for s in sl if s['is_unlabeled_quiz'])
    notes = sum(1 for s in sl if s['notes'])
    ans = ''
    if os.path.exists(os.path.join(OUT, 'decks', slug, 'answers.json')):
        a = J(f'decks/{slug}/answers.json'); ans = ' answers: ' + ', '.join(f"{s['file']} ({s['page_count']}p)" for s in a['sources'])
    warn = ' [composite render, no PDF]' if any('composite' in n for n in m['notes']) else ''
    return f"- `{slug}` ({m['kind']}) {title_of(slug, d)}: {len(sl)} pages, {m.get('image_count', 0)} images, ~{nlab} labeled-image pages, ~{nq} unlabeled-quiz pages, {notes} with speaker notes;{ans}{warn}"

for u in (1, 2, 3):
    w(); w(f'## Unit {u}'); w()
    for kind, label in (('lecture', 'Lectures'), ('lab', 'Labs'), ('atlas', 'Atlases'), ('assignment', 'Assignments'), ('cheatsheet', 'Cheat sheets'), ('practical', 'Practical exams / practice practical'), ('practice_exam', 'Practice exams'), ('si_session', 'SI session tests'), ('other', 'Other')):
        ls = [s for s in unit_decks[u] if decks[s]['meta']['kind'] == kind]
        if not ls: continue
        w(f'**{label}**'); w()
        for s in sorted(ls): w(deck_line(s, decks[s]))
        w()
    a_u = [(k, v) for k, v in apk.items() if True]
    # apkg by unit using manifest
    amap = {}
    for rel, m in man.items():
        if m['kind'] == 'apkg' and m['canonical']:
            from re import sub
            s = os.path.splitext(os.path.basename(rel))[0].replace('Neuroanatomy_', '').replace('Neuroanatomy', '')
            s = sub(r'[^a-z0-9]+', '-', s.lower()).strip('-'); amap[s] = m['unit']
    ls = [k for k, v in amap.items() if v == u and k in apk]
    if ls:
        w('**Anki decks (image-occlusion)**'); w()
        for k in sorted(ls): w(f"- `apkg/{k}`: {apk[k]['note_count']} notes / {apk[k]['card_count']} cards / {apk[k]['media_files']} media; note types {', '.join(t['name'] for t in apk[k]['note_types'])}")
        w()
    ents = by_unit[u]
    sl = sum(1 for e in ents if e['counts'].get('slide') or e['counts'].get('answers'))
    pr = sum(1 for e in ents if e['counts'].get('practical'))
    ap = sum(1 for e in ents if e['counts'].get('apkg'))
    ex = sum(1 for e in ents if e['counts'].get('exam'))
    w(f"**Structure list coverage**: {len(ents)} distinct list entries; {sl} found in slide/answer text, {ap} linked to an Anki deck, {pr} appear in a practical question/answer, {ex} in a written practice exam.")
    w()

# decks without unit
if unit_decks[None]:
    w(); w('## Unassigned'); w()
    for s in sorted(unit_decks[None]): w(deck_line(s, decks[s]))

w(); w('## Structure-list items found in NO source'); w()
w('Search = case/accents/plural-insensitive phrase match on slide titles, text, notes, lab answers, practical Q/A and exam text, plus manual synonyms. Labels baked into images (most atlas/lab figures) are not searchable, so an item missing here may still be shown in a picture.'); w()
ns = gaps['no_source']
w(f'No source at all: {len(ns)}');
for n in ns: w(f'- {n}')
w()
w('Items with matches only outside slide text (no slide/answers hit): ' + (', '.join(f'`{x}`' for x in gaps['no_slide_or_answers']) or 'none'))
w(); w('Weakest coverage (<= 2 slide/answer hits):'); w()
weak = [e for e in idx if sum(e['counts'].get(k, 0) for k in ('slide', 'answers')) <= 2 and e['hits']]
for e in weak[:80]: w(f"- {e['structure']} (units {e['units']}): {e['counts']}")

# practicals
w(); w('## Practical exam format'); w()
w('Source: `practicals/practical-*.json` (question text from the PDF text layer, pins/markers parsed from the wording, answers joined from the key).'); w()
w('- 40 numbered questions + 1-3 bonus questions, timed stations; each question page is a photo of a pinned/tagged specimen (colored pins, chalk, pipe cleaner, clip, wire, ball, star sticker) or a histological/schematic image with a colored region (circled, outlined, colored, highlighted), 1-2 questions per station ("Question 1&2" image pages).')
w('- Unit 1: Q1-~30 wet specimens (skull/sutures/foramen, meninges, brain divisions, ventricles, deep forebrain, cortex functional areas, spinal cord/vertebrae), Q31-40 spinal cord histology (level, cells in highlighted region, tract name, receptors, fibre types, first/second-order neurons, ipsilateral vs contralateral).')
w('- Unit 2: wet brainstem and cranial nerves, then histological brainstem cross-sections with nuclei/tracts circled in colour, plus eye/visual pathway specimens (cornea, retina, lens, ciliary body, optic radiations).')
w('- Unit 3: coronal/horizontal sections, deep forebrain, cerebellum, herniation/foramen magnum, blood vessels (Circle of Willis, spinal arteries), MRI/CT picture choice, brain-bleed and stroke pathology.')
w('- Pattern: a "name it" stem (identify structure at pin) is often followed by a dependent "theory" stem about the same station ("what muscle does it innervate", "what tract contains...", "what space is lateral to...", "which vessel supplies...").'); w()
types = collections.OrderedDict()
for p in sorted(glob.glob(os.path.join(OUT, 'practicals', 'practical-*.json')) + glob.glob(os.path.join(OUT, 'practicals', 'practice-practical-*.json'))):
    d = json.load(open(p, encoding='utf-8'))
    c = collections.Counter(t for q in d['questions'] for t in q['types'])
    w(f"- `{d['slug']}`: {d['question_count']} questions, {d.get('answered', 0)} with answers; types: " + ', '.join(f'{k} {v}' for k, v in c.most_common()))
    for t, n in c.items(): types.setdefault(t, collections.Counter())[d['slug']] = n
w(); w('### Recurring question types in practicals (with examples)'); w()
ex = collections.defaultdict(list)
for p in sorted(glob.glob(os.path.join(OUT, 'practicals', 'practical-*.json'))):
    d = json.load(open(p, encoding='utf-8'))
    for q in d['questions']:
        for t in q['types']:
            if len(ex[t]) < 3 and q.get('answer'): ex[t].append(f"{d['slug']} Q{q['n']}: {q['question'][:100]} -> {q['answer'][:60]}")
for t, v in sorted(types.items(), key=lambda kv: -sum(kv[1].values())):
    w(f"- **{t}** ({sum(v.values())} questions)")
    for e in ex[t]: w(f'  - {e}')

w(); w('## Written practice exams and SI tests (theory question types)'); w()
CLUS = [('negative/exception stem (FALSE / NOT / EXCEPT)', r'\bfalse\b|\bnot\b|\bexcept\b|incorrect'),
        ('lesion / deficit localisation (what would be lost / damaged)', r'lesion|damage|injur|deficit|patient|symptom|infarct|stroke|loss of|paraly|palsy|syndrome|tumor'),
        ('pathway tracing (tract, decussation, synapse, 1st/2nd/3rd order)', r'pathway|tract|decussat|synaps|order neuron|lemniscus|ascending|descending|relay'),
        ('cranial nerve / nucleus function and testing', r'cranial nerve|\bcn\b|nucleus|nuclei|innervat|muscle|reflex'),
        ('embryology / development', r'embry|vesicle|neural tube|neural crest|develop|alar|basal plate|sulcus limitans'),
        ('cells / histology / neurotransmitter / myelin', r'neuron|glia|astrocyte|oligodendro|schwann|myelin|neurotransmitter|axon|dendrite|synapse'),
        ('vascular supply', r'arter|vein|venous|circle of willis|blood supply|sinus'),
        ('imaging / pathology', r'\bct\b|\bmri\b|\bpet\b|imaging|hemorrhage|hematoma|aneurysm'),
        ('cortex layers / functional areas / Brodmann', r'brodmann|layer|cortex|area \d|gyrus'),
        ('ventricles / CSF / meninges', r'ventric|csf|cerebrospinal|menin|dura|arachnoid'),
        ('motor systems / basal ganglia / cerebellum', r'motor|basal ganglia|cerebell|upper motor|lower motor|corticospinal'),
        ('matching / drawing / ordering (free response)', r'draw|label|line|match|order|arrange')]
for p in sorted(glob.glob(os.path.join(OUT, 'practicals', 'exam-*.json'))):
    d = json.load(open(p, encoding='utf-8'))
    c = collections.Counter()
    for q in d['questions']:
        txt = (q['question'] + ' ' + ' '.join(o['text'] for o in q['options'])).lower()
        for name, rx in CLUS:
            if re.search(rx, q['question'].lower() if name.startswith(('negative', 'lesion')) else txt): c[name] += 1
    w(f"- `{d['slug']}` (unit {d['unit']}): {d['question_count']} questions, {d['answered']} with a marked answer ({sum(1 for q in d['questions'] if q['type'] == 'free_response')} free-response); " + '; '.join(f'{k} {v}' for k, v in c.most_common(6)))
w(); w('Answer keys: Unit 2 practice exam and SI keys mark the correct option in bold; the Unit 1 practice exam "Key" file is visually identical to the student copy (no answers recoverable), and the Unit 3 "Answer Key" is byte-identical to the Unit 3 Practice Exam / SI session 8 test (answers are bold-marked in that file).')

w(); w('## Known problems / caveats'); w()
for s, d in sorted(decks.items()):
    for n in d['meta']['notes']:
        w(f'- `{s}`: {n}')
w('- Anki decks are 100% image-occlusion notes with empty Header/Back Extra fields: answers exist only as text baked into the image under the mask, so they cannot be searched; structure-index "apkg" hits are deck-level (the linked lab deck mentions the structure).')
w('- `practical-u1-2024`: question 1/2 text in the exam PDF both say "suture" but the key answers Q1 "Frontal bone" (probably a typo in the exam); `practical-u2-2024` contains only histology questions and has no key in the zip.')
w('- Syllabus lists "April 31" for Lecture 17/Lab 17; treated as March 31.')
w('- Heuristics only: `has_labels` / `is_unlabeled_quiz` are guesses from text/drawing density and titles.')
open(os.path.join(OUT, 'INVENTORY.md'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')
print('INVENTORY.md', len(L), 'lines')
