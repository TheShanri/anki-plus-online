import json,os,sys,warnings
warnings.filterwarnings('ignore')
import fitz
root=os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..'))+'/'
out={}
for slug in sorted(os.listdir(root+'content-build/decks')):
    p=root+f'content-build/decks/{slug}/slides.json'
    if not os.path.exists(p): continue
    d=json.load(open(p,encoding='utf8'))
    pdf=d['meta'].get('pdf')
    if not pdf: continue
    fp=root+'_source/raw/'+pdf
    if not os.path.exists(fp): print('missing',slug,pdf); continue
    doc=fitz.open(fp)
    pages=[]
    for i,pg in enumerate(doc):
        info=pg.get_text('dict')
        spans=[]
        for b in info['blocks']:
            if b['type']!=0: continue
            for l in b['lines']:
                for s in l['spans']:
                    t=s['text'].strip()
                    if t: spans.append((t,[round(x,1) for x in s['bbox']],round(s['size'],1)))
        pages.append({'n':i+1,'w':pg.rect.width,'h':pg.rect.height,'nimg':len(pg.get_images()),'nspans':len(spans),'spans':spans})
    out[slug]={'pdf':pdf,'pages':pages}
    print(slug,len(doc),sum(p['nspans'] for p in pages))
json.dump(out,open(sys.argv[1],'w'))
