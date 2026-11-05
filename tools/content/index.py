"""Build structure_index.json and INVENTORY.md. Usage: index.py OUT"""
import sys, os, re, json, glob, unicodedata, collections
OUT = sys.argv[1]
def J(p):
    return json.load(open(os.path.join(OUT, p), encoding='utf-8'))

def norm(s):
    s = unicodedata.normalize('NFKD', s or '')
    s = ''.join(c for c in s if not unicodedata.combining(c)).lower()
    s = s.replace('’', "'").replace("'s ", ' ').replace("s' ", 's ')
    s = s.replace('gray', 'grey').replace('mamillary', 'mammillary').replace('sympahtetic', 'sympathetic')
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

# ---- manual synonyms / splits keyed by normalized structure name
SYN = {
 'foramina of monro': ['foramen of monro', 'foramina of monro', 'interventricular foramen', 'interventricular foramina', 'monro'],
 'foramina of magendie and luschka': ['foramen of magendie', 'foramina of magendie', 'magendie', 'luschka', 'median aperture', 'lateral aperture', 'lateral apertures', 'medial aperture'],
 'atrium or trigone': ['atrium', 'trigone', 'trigon'],
 'massa intermedia interthalamic adhesion': ['massa intermedia', 'interthalamic adhesion'],
 'interthalamic adhesion massa intermedia': ['massa intermedia', 'interthalamic adhesion'],
 'pituitary stalk': ['pituitary stalk', 'infundibulum', 'infundibular stalk', 'hypophyseal stalk'],
 'pituitary stalk usually ripped know general location': ['pituitary stalk', 'infundibulum', 'infundibular stalk'],
 'cerebral cortex cerebrum': ['cerebral cortex', 'cerebrum'],
 'longitudinal axis of the nervous system neuraxis': ['neuraxis', 'longitudinal axis'],
 'orientation of neuraxis in the cerebrum vs brainstem spinal cord': ['neuraxis'],
 'lateral vs medial median': ['lateral', 'medial', 'median'],
 'posterior vs anterior': ['posterior', 'anterior'], 'superior vs inferior': ['superior', 'inferior'], 'rostral vs caudal': ['rostral', 'caudal'],
 'dorsal vs ventral': ['dorsal', 'ventral'], 'superficial vs deep': ['superficial'],
 'sagittal midsagittal parasagittal': ['sagittal', 'midsagittal', 'parasagittal'], 'coronal frontal': ['coronal'], 'horizontal axial transverse': ['horizontal', 'axial plane'],
 'distinguish cervical thoracic lumbar and sacral vertebrae': ['cervical vertebra', 'thoracic vertebra', 'lumbar vertebra', 'sacral vertebra', 'cervical vertebrae', 'thoracic vertebrae', 'lumbar vertebrae'],
 'dura arachnoid and pia layers of meninges': ['dura mater', 'arachnoid mater', 'pia mater'],
 'epidural subdural subarachnoid spaces': ['epidural space', 'subdural space', 'subarachnoid space'],
 'dorsal and ventral rootlets and roots': ['dorsal root', 'ventral root', 'rootlet', 'rootlets'],
 'dorsal and ventral rami': ['dorsal ramus', 'ventral ramus', 'dorsal rami', 'ventral rami'],
 'superior middle inferior frontal gyri': ['superior frontal gyrus', 'middle frontal gyrus', 'inferior frontal gyrus', 'frontal gyri'],
 'superior middle inferior temporal gyri': ['superior temporal gyrus', 'middle temporal gyrus', 'inferior temporal gyrus', 'temporal gyri'],
 'superior middle inferior cerebellar peduncle': ['superior cerebellar peduncle', 'middle cerebellar peduncle', 'inferior cerebellar peduncle', 'cerebellar peduncle'],
 'primary motor cortex brodmann s area 4': ['primary motor cortex', 'brodmann area 4', 'ba 4', 'm1'],
 'primary motor cortex brodmann area 4': ['primary motor cortex', 'area 4', 'ba 4'],
 'premotor cortex ba 6': ['premotor cortex', 'ba 6', 'area 6'],
 'primary somatosensensory cortex ba 3 1 2': ['primary somatosensory cortex', 'somatosensory cortex', 'ba 3', 's1'],
 'primary somatosensory cortex ba 3 1 2': ['primary somatosensory cortex', 'somatosensory cortex', 's1'],
 'somatosensory association cortex ba 5 7': ['somatosensory association', 'ba 5', 'area 5'],
 'primary visual cortex ba 17': ['primary visual cortex', 'ba 17', 'area 17', 'v1', 'striate cortex'],
 'visual association cortex ba 18 19': ['visual association', 'ba 18', 'area 18', 'v2'],
 'primary auditory cortex ba 41 42': ['primary auditory cortex', 'ba 41', 'area 41', 'a1', 'heschl'],
 'auditory association area ba 22': ['auditory association', 'ba 22', 'area 22'],
 'orientation of motor homunculus': ['motor homunculus', 'homunculus'], 'orientation of somatosensory homunculus': ['sensory homunculus', 'somatosensory homunculus', 'homunculus'],
 'multimodal area parietal lobe general association area': ['multimodal', 'parietal association'], 'temporal lobe general association area': ['temporal association', 'temporal lobe association'],
 'broca s area': ['broca'], 'wernicke s area': ['wernicke'],
 'cranial nerves i viii ix x and xii on a wet specimen': ['cranial nerve', 'cranial nerves'], 'cranial nerves i xii on an image or schematic': ['cranial nerve', 'cranial nerves'],
 'brachium of the inferior colliculus': ['brachium of the inferior colliculus', 'brachium of inferior colliculus', 'inferior brachium'],
 'cuneate and gracile tubercles': ['cuneate tubercle', 'gracile tubercle', 'cuneate and gracile tubercles', 'tubercle'],
 'pyramids motor decussation': ['motor decussation', 'pyramidal decussation', 'decussation of the pyramids'],
 'dorsal motor nucleus of vagus dmv dmx': ['dorsal motor nucleus of vagus', 'dorsal motor nucleus of the vagus', 'dmv', 'dmx', 'dorsal motor nucleus'],
 'decussation of superior cerebellar peduncle x scp': ['decussation of the superior cerebellar peduncle', 'decussation of superior cerebellar peduncle', 'x scp'],
 'x scp decussation of superior cerebellar peduncle': ['decussation of the superior cerebellar peduncle', 'decussation of superior cerebellar peduncle'],
 'mlf medial longitudinal fasciculus': ['medial longitudinal fasciculus', 'mlf'], 'medial longitudinal fasciculus mlf': ['medial longitudinal fasciculus', 'mlf'],
 'anterolateral tract': ['anterolateral tract', 'anterolateral system', 'spinothalamic', 'als', 'alst'],
 'anterolateral spinothalamic tract': ['anterolateral', 'spinothalamic', 'alst'],
 'dorsal spinocerebellar tract': ['dorsal spinocerebellar', 'posterior spinocerebellar', 'dsct'],
 'column of clarke nucleus dorsalis': ['clarke', 'nucleus dorsalis', 'dorsal nucleus of clarke'],
 'drez lateral medial': ['drez', 'dorsal root entry zone', 'lissauer'], 'marginal nucleus': ['marginal nucleus', 'posteromarginal', 'lamina i'],
 'fasciculus gracilis': ['fasciculus gracilis', 'gracile fasciculus', 'gracile fascicle'], 'fasciculus cuneatus': ['fasciculus cuneatus', 'cuneate fasciculus', 'cuneate fascicle'],
 'dorsal columns': ['dorsal column', 'dorsal columns', 'posterior column', 'dcml'],
 'substantia gelatinosa': ['substantia gelatinosa', 'lamina ii'], 'nucleus proprius': ['nucleus proprius', 'lamina iii', 'lamina iv'],
 'intermediate zone': ['intermediate zone', 'intermediate grey', 'lamina vii'],
 'ventral commissure of spinal cord': ['ventral commissure', 'anterior white commissure', 'white commissure'],
 'anterior perforated substance': ['anterior perforated substance', 'anterior perforated space'],
 'transverse temporal gyrus': ['transverse temporal gyrus', 'transverse temporal gyri', 'heschl'],
 'parieto occipital fissure': ['parieto occipital', 'parietooccipital'], 'intraparietal fissure': ['intraparietal'],
 'inferior olivary nucleus': ['inferior olivary nucleus', 'inferior olive', 'olivary nucleus'], 'olive inferior olivary nucleus': ['inferior olivary nucleus', 'inferior olive', 'olive'],
 'principal sensory nucleus of trigeminal': ['principal sensory nucleus', 'chief sensory nucleus', 'main sensory nucleus', 'principal trigeminal'],
 'motor trigeminal nucleus': ['motor trigeminal nucleus', 'motor nucleus of v', 'trigeminal motor nucleus', 'motor nucleus of the trigeminal'],
 'periaqueductal grey matter': ['periaqueductal grey', 'pag'], 'periaqueductal grey': ['periaqueductal grey', 'pag'],
 'cn iii oculomotor nerve': ['oculomotor nerve', 'cn iii', 'cranial nerve iii', 'oculomotor'], 'cn iv trochlear nucleus': ['trochlear nucleus', 'cn iv', 'trochlear'],
 'cn vii facial': ['facial nerve', 'cn vii', 'cranial nerve vii', 'facial'], 'cn ix glossopharyngeal': ['glossopharyngeal', 'cn ix'], 'cn x vagus': ['vagus', 'cn x'], 'cn xii hypoglossal': ['hypoglossal', 'cn xii'],
 'vestibulocochlear complex': ['vestibulocochlear', 'vestibular nuclei', 'vestibular nucleus', 'cochlear nuclei', 'cn viii'],
 'location of limb lower motor neurons': ['lower motor neuron', 'lmn'], 'location of trunk lower motor neurons': ['lower motor neuron', 'lmn'],
 'anterior ventral funiculus': ['anterior funiculus', 'ventral funiculus'], 'lateral funiculus': ['lateral funiculus'],
 'optic nerve cn ii': ['optic nerve', 'cn ii'], 'optic tracts': ['optic tract', 'optic tracts'], 'optic tract': ['optic tract', 'optic tracts'],
 'mlf medial longitudinal fasciculus': ['medial longitudinal fasciculus', 'mlf'],
 'know that pprf lateral gaze center surrounds abducens nucleus': ['pprf', 'paramedian pontine reticular formation', 'lateral gaze'],
 'suprachiasmatic nucleus know general location of': ['suprachiasmatic'],
 'level of superior colliculus': ['superior colliculus'], 'level of inferior colliculus': ['inferior colliculus'],
 'x scp decussation of superior cerebellar peduncle': ['decussation of the superior cerebellar peduncle'],
 'pontine protuberance': ['pontine protuberance', 'basilar pons', 'basis pontis', 'ventral pons'],
 'the circle of willis': ['circle of willis'], 'posterior spinal arteries only in a picture': ['posterior spinal artery', 'posterior spinal arteries'],
 'lenticulostriate arteries penetrating anterior perforated substance': ['lenticulostriate'],
 'cerebellar branches three pairs supply cerebellum only id for superior cerebellar artery': ['superior cerebellar artery', 'sca', 'aica', 'pica'],
 'penetrating branches supply brain stem': ['penetrating branches', 'paramedian'],
 'median longitudinal cerebral fissure or the interhemispheric fissure': ['median longitudinal', 'interhemispheric fissure', 'longitudinal fissure'],
 'interhemispheric fissure or median longitudinal cerebral fissure': ['median longitudinal', 'interhemispheric fissure', 'longitudinal fissure'],
 'cortical ribbon or cortical grey matter': ['cortical ribbon', 'cortical grey matter', 'cerebral cortex'],
 'septum pellucidum which separates the two lateral ventricles': ['septum pellucidum'],
 'caudate head body tail': ['caudate'], 'corpus striatum is composed of': ['corpus striatum', 'striatum'], '1 head of the caudate nucleus': ['head of the caudate', 'caudate head', 'head of caudate'],
 '2 putamen': ['putamen'], '3 the region separating these two nuclear masses by fibers of the anterior limb of the internal capsule': ['anterior limb of the internal capsule'],
 'lentiform lens shaped nucleus is composed of putamen and globus pallidus': ['lentiform', 'lenticular nucleus'],
 'fornix crus body columns': ['fornix'], 'columns of the fornix': ['columns of the fornix', 'column of the fornix', 'fornix'],
 'stria medullaris thalamicus': ['stria medullaris'], 'pineal gland or body': ['pineal'], 'anterior thalamic nuclei creating anterior thalamic tubercles': ['anterior thalamic nuclei', 'anterior nucleus', 'anterior thalamic tubercle'],
 'medial and lateral geniculate nuclei': ['medial geniculate', 'lateral geniculate', 'geniculate nucle'], 'infundibular stalk infundibulum or pituitary stalk': ['infundibul', 'pituitary stalk'],
 'pituitary stalk infundibular stalk infundibulum': ['infundibul', 'pituitary stalk'],
 'thalamus dorsal thalamus': ['thalamus'], 'trigone or atrium': ['trigone', 'atrium'], 'basal forebrain nuclei area': ['basal forebrain'], 'major structures from coronal horizontal specimens i e basal ganglia thalamus corpus callosum': ['basal ganglia'],
 'differentiation of major imaging types': ['ct', 'mri', 'pet', 'imaging'], 'brain bleeds': ['hemorrhage', 'hematoma', 'bleed'],
 'middle cerebellar peduncle mcp': ['middle cerebellar peduncle', 'mcp'], 'dentate nucleus in cross section of cerebellum': ['dentate nucleus', 'dentate'],
 'superior cerebellar peduncle scp': ['superior cerebellar peduncle', 'scp'], 'inferior cerebellar peduncle icp': ['inferior cerebellar peduncle', 'icp'],
 'olive inferior olivary nucleus': ['olive', 'inferior olivary'],
}
GATE_NAMES = {'body', 'genu', 'anterior limb', 'posterior limb', 'splenium', 'anterior horn', 'posterior horn', 'inferior horn', 'tonsil', 'pons', 'medulla', 'midbrain', 'lens', 'iris', 'retina', 'cornea', 'sclera', 'choroid',
              'coronal', 'sagittal', 'horizontal', 'cerebellum', 'lambda', 'bregma', 'pterion'}
GATE_CTX = {'body': ['ventricle', 'corpus callosum', 'caudate', 'fornix'], 'genu': ['corpus callosum', 'internal capsule', 'facial'], 'splenium': ['corpus callosum', 'callosum'], 'anterior limb': ['internal capsule'], 'posterior limb': ['internal capsule'],
            'anterior horn': ['ventricle', 'spinal', 'lateral'], 'posterior horn': ['ventricle', 'lateral'], 'inferior horn': ['ventricle', 'lateral']}

def variants(t):
    out = {t}
    w = t.split()
    if not w: return out
    last = w[-1]
    for v in {last + 's', last + 'es', last[:-1] if last.endswith('s') else last, last[:-2] + 'y' if last.endswith('ies') else last,
              last[:-1] + 'i' if last.endswith('us') else last, last[:-1] + 'us' if last.endswith('i') else last, last[:-2] + 'a' if last.endswith('um') else last, last[:-2] + 'um' if last.endswith('a') else last}:
        out.add(' '.join(w[:-1] + [v]))
    return out

def terms_for(name):
    n = norm(name)
    if n in SYN: base = list(SYN[n])
    else:
        base = []
        main = re.sub(r'\(.*?\)', ' ', name)
        parts = re.split(r'\s*(?:/|;| vs\.? | or )\s*', main)
        base += [p for p in parts if p.strip()]
        for par in re.findall(r'\((.*?)\)', name):
            if re.match(r'\s*(singular|usually|know|only|i\.e|e\.g|creating|three)', par, re.I): continue
            for p in re.split(r'[,/]| or ', par):
                if len(p.strip()) >= 2: base.append(p)
        if ' and ' in main and ',' in main: base += [p for p in re.split(r',| and ', main) if p.strip()]
        base = [norm(b) for b in base]
        base = [b for b in base if b]
    # cn prefix
    res = set()
    for b in base:
        b = norm(b)
        if len(b) < 2: continue
        res |= variants(b)
    return sorted(res, key=len, reverse=True)

def build_re(terms):
    return re.compile('(?<![a-z0-9])(?:' + '|'.join(re.escape(t) for t in terms) + ')(?![a-z0-9])') if terms else None

# ---- load structures
structs = []
for u in (1, 2, 3):
    d = J(f'structures/unit{u}.json')
    seen = set()
    for it in d['flat']:
        name = it['name'].strip()
        if re.match(r'^(be able to|know that|note)', name, re.I) and len(name) > 60: continue
        key = (u, norm(name), it.get('lab'))
        structs.append(dict(unit=u, name=name, lab=it.get('lab'), group=it.get('group'), parent=it.get('parent'), note=it.get('note')))
for s in structs:
    s['terms'] = terms_for(s['name'])
    s['re'] = build_re(s['terms'])
    nn = norm(s['name'])
    s['gate'] = None
    if nn in GATE_NAMES and nn in GATE_CTX:
        ctxs = list(GATE_CTX[nn])
        s['gate'] = build_re(ctxs)

# ---- gather text sources
sources = []   # dict(deck, page, source, text, extra)
deckmeta = {}
for sj in sorted(glob.glob(os.path.join(OUT, 'decks', '*', 'slides.json'))):
    slug = os.path.basename(os.path.dirname(sj)); d = json.load(open(sj, encoding='utf-8'))
    deckmeta[slug] = d['meta']; deckmeta[slug]['slides'] = d['slides']
    for s in d['slides']:
        sources.append(dict(deck=slug, page=s['n'], source='slide', text=norm(' '.join([s['title'], s['text'], s['notes']]))))
    aj = os.path.join(os.path.dirname(sj), 'answers.json')
    if os.path.exists(aj):
        a = json.load(open(aj, encoding='utf-8'))
        for src in a['sources']:
            for p in src['pages']:
                sources.append(dict(deck=slug, page=p['n'], source='answers', text=norm(p['text']), extra=dict(answer_file=src['file'])))
for pj in sorted(glob.glob(os.path.join(OUT, 'practicals', 'practical-*.json')) + glob.glob(os.path.join(OUT, 'practicals', 'practice-practical-*.json'))):
    d = json.load(open(pj, encoding='utf-8'))
    for q in d['questions']:
        sources.append(dict(deck=d['slug'], page=q['page'], source='practical', text=norm(f"{q['question']} {q.get('answer') or ''}"), extra=dict(question=q['n'])))
for pj in sorted(glob.glob(os.path.join(OUT, 'practicals', 'exam-*.json'))):
    d = json.load(open(pj, encoding='utf-8'))
    for q in d['questions']:
        txt = q['question'] + ' ' + ' '.join(o['text'] for o in q['options'] if o['letter'] in q.get('answer_letters', []))
        sources.append(dict(deck=d['slug'], page=q['page'], source='exam', text=norm(txt), extra=dict(question=q['n'])))

# apkg decks: image-occlusion cards have no text, so link each apkg deck to its lab/lecture decks (deck-level hit)
APKG_LINK = {'lab-1': ['lab-01'], 'lab-2': ['lab-02'], 'lab-3': ['lab-03'], 'lab-4': ['lab-04'], 'lab-5': ['lab-05'], 'lab-7': ['lab-07'], 'lab-8-diagrams': ['lab-08'],
             'lab-8-surface-brainstem-histology': ['lab-08'], 'lab-13': ['lab-13', 'lab-13-unlabeled', 'atlas-horizontal-atlas-images'], 'lab-14': ['lab-14', 'lab-14-unlabeled', 'atlas-coronal-atlas-images'],
             'lab-15': ['lab-15'], 'lab-16': ['lab-16'], 'brainstem-overlay': ['atlas-brainstem-overlay', 'atlas-brainstem-atlas-and-model-key'], 'visual-system-supplemental-material': ['lab-11', 'lecture-11'],
             'unit-1-practice-practicals': ['practice-practical-lab3', 'practical-u1-2025', 'practical-u1-2024']}
slide_index = {(s['deck'], s['page']): s for s in sources if s['source'] == 'slide'}
decktext = collections.defaultdict(list)
for s in sources:
    if s['source'] in ('slide', 'practical'): decktext[s['deck']].append(s)
for aslug, links in APKG_LINK.items():
    if not os.path.exists(os.path.join(OUT, 'apkg', aslug, 'notes.json')): continue
    for lk in links:
        for s in decktext.get(lk, []):
            sources.append(dict(deck='apkg/' + aslug, page=None, source='apkg', text=s['text'], extra=dict(via=f"{lk}#{s['page']}", level='deck')))

# ---- match
index = collections.defaultdict(list)
per_struct_counts = {}
for s in structs:
    hits = []
    if s['re'] is None:
        per_struct_counts[(s['unit'], s['name'])] = 0; continue
    for src in sources:
        if s['re'].search(src['text']):
            if s['gate'] is not None and not s['gate'].search(src['text']): continue
            h = dict(deck=src['deck'], page=src['page'], source=src['source'])
            h.update(src.get('extra', {}))
            hits.append(h)
    # dedupe
    seen = set(); uniq = []
    for h in hits:
        k = (h['deck'], h['page'], h['source'], h.get('question'), h.get('via') if h['source'] == 'apkg' else None)
        if k in seen: continue
        seen.add(k); uniq.append(h)
    ap = {}
    rest = []
    for h in uniq:
        if h['source'] == 'apkg':
            ap.setdefault(h['deck'], []).append(h['via'])
        else: rest.append(h)
    for dk, vs in ap.items(): rest.append(dict(deck=dk, page=None, source='apkg', level='deck', via_pages=vs[:12]))
    s['hits'] = rest

by_name = collections.OrderedDict()
for s in structs:
    key = s['name']
    e = by_name.setdefault(key, dict(structure=key, units=[], labs=[], groups=[], note=s['note'], terms=s['terms'][:12], hits=[]))
    if s['unit'] not in e['units']: e['units'].append(s['unit'])
    if s['lab'] and s['lab'] not in e['labs']: e['labs'].append(s['lab'])
    if s['group'] and s['group'] not in e['groups']: e['groups'].append(s['group'])
    seenk = {(h['deck'], h['page'], h['source'], h.get('question')) for h in e['hits']}
    for h in s.get('hits', []):
        if (h['deck'], h['page'], h['source'], h.get('question')) not in seenk: e['hits'].append(h)
for e in by_name.values():
    e['counts'] = dict(collections.Counter(h['source'] for h in e['hits']))
json.dump(dict(generated_by='tools/content/index.py', note='Rough keyword map (case/accents/plural-insensitive, manual synonyms). Slide text only; labels baked into images are NOT searched. apkg hits come from perceptual image matching to slide images.',
               structure_count=len(by_name), structures=list(by_name.values())),
          open(os.path.join(OUT, 'structure_index.json'), 'w', encoding='utf-8'), indent=0, ensure_ascii=False)
# also machine-friendly flat dict
flat = {k: [dict(deck=h['deck'], page=h['page'], source=h['source']) for h in v['hits']] for k, v in by_name.items()}
json.dump(flat, open(os.path.join(OUT, 'structure_index_flat.json'), 'w', encoding='utf-8'), indent=0, ensure_ascii=False)
none = [e['structure'] for e in by_name.values() if not e['hits']]
slide_only_none = [e['structure'] for e in by_name.values() if not any(h['source'] in ('slide', 'answers') for h in e['hits'])]
print('structures', len(by_name), 'no source', len(none), 'no slide source', len(slide_only_none))
json.dump(dict(no_source=none, no_slide_or_answers=slide_only_none), open(os.path.join(OUT, '_struct_gaps.json'), 'w', encoding='utf-8'), indent=1)
