"""越南漢喃余量：按 book_id 归并后，题名（归一、去套语前缀）对现库 Work 全等或去前缀相合，不论责任者，出候选供逐部核判。"""
import json,glob,os,re,sys,collections
sys.path.insert(0,'/home/user/book-index-manager/tools/馆藏资源挂接/match_engine')
from normalize import norm_title
BI='/home/user/book-index'
done={x['book_id'] for x in json.load(open('/home/user/book-index-manager/docs/馆藏资源挂接/报告/C3续-臺灣國圖存疑與越南漢喃挂接-20261026/nom_候选.json'))}
PFX=re.compile(r'^(新刊|新刻|重刊|重刻|新鐫|新鋟|新編|新增|增補|增廣|校正|重訂|新訂|欽定|御製|御纂|御選|精選|新選|大字|繡像|全像|新版|新印)+')
def key(t): return norm_title(PFX.sub('',t or ''),jp=False)
idx=collections.defaultdict(list)
for f in glob.glob(f'{BI}/Work/*/*/*/*.json'):
    try: w=json.load(open(f))
    except Exception: continue
    if w.get('merged_into') or w.get('deleted'): continue
    k=key(w.get('title',''))
    if len(k)>=2: idx[k].append(w)
recs=json.load(open('/home/user/book_index_json/library_data/越南漢喃古籍NomFoundation.json'))
books=collections.OrderedDict()
for r in recs:
    raw=r.get('raw') or ''
    bid=(r.get('extra') or {}).get('book_id') or r['source_record_id']
    books.setdefault(bid,[]).append(r)
out=[]
for bid,L in books.items():
    if bid in done: continue
    r=L[0]; t=re.sub(r'\s*[\(（].*?[\)）]\s*$','',r['title'] or '').strip()
    t=re.sub(r'\s*(卷|第)\s*[0-9一二三四五六七八九十上下]+.*$','',t)
    ws=idx.get(key(t)) or []
    if not ws: continue
    def wd(w):
        au='、'.join(f"{a.get('name','')}({a.get('dynasty','')}){a.get('role','')}" for a in (w.get('authors') or []) if isinstance(a,dict))
        ib='；'.join(f"{i.get('source','')}:{i.get('title_info','')}{i.get('author_info','')}" for i in (w.get('indexed_by') or [])[:2])
        n=sum(1 for x in (w.get('resources') or []) if x.get('id')=='nomfoundation')
        return f"[{w['id']}] {w.get('title','')}|{au}|{ib[:120]}|已挂漢喃{n}"
    out.append(dict(book_id=bid,n_vol=len(L),title=r['title'],author=r.get('author',''),edition=r.get('edition',''),period=r.get('period',''),holding=r.get('holding_id',''),sort=r.get('sort',''),lang=(r.get('extra') or {}).get('Language',''),desc=((r.get('extra') or {}).get('Description','') or '')[:300],extent=r.get('extent',''),url=r['url'],works=[wd(w) for w in ws[:6]],n_works=len(ws)))
json.dump(out,open(sys.argv[1],'w'),ensure_ascii=False,indent=1)
print(len(books),len(done),len(out),collections.Counter(min(x['n_works'],4) for x in out))
