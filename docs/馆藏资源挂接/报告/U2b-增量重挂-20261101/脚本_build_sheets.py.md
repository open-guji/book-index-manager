import csv,json,glob,sys,importlib,math,collections,re
csv.field_size_limit(10**9)
sys.path.insert(0,'/home/user/book-index-manager/tools/馆藏资源挂接/match_engine')
import normalize as n, titleparse as tp
BI='/home/user/book-index'; RUN='/tmp/claude-0/run/'; LIB='/home/user/book_index_json/library_data'
NM={'naikaku':'内閣','ndl':'NDL','kokusho':'国書','waseda':'早稲田','nlc':'国圖','ncltw':'臺灣國圖','utokyo':'東大','ioc':'東文研','shoryobu':'書陵部','keio':'慶應','arc':'ARC','nagoya':'名大','kyoto':'京大貴重'}
SITE={'naikaku':'nat-archives-jp','ndl':'ndl','kokusho':'kokusho','waseda':'waseda','nlc':'nlc','ncltw':'ncl-tw'}
def load(wid):
    g=glob.glob(f'{BI}/Work/{wid[-3]}/{wid[-2]}/{wid[-1]}/{wid}-*.json') or glob.glob(f'{BI}/Work/{wid[-3]}/{wid[-2]}/{wid[-1]}/{wid}.json'); return json.load(open(g[0])) if g else None
def wdesc(wid):
    w=load(wid)
    if not w: return f'{wid}:缺'
    if w.get('merged_into'):
        k=w['merged_into']; w=load(k) or w; wid=k
    au='、'.join(f"{a.get('name','')}({a.get('dynasty','')}){a.get('role','')}" for a in (w.get('authors') or []) if isinstance(a,dict))
    jc=w.get('juan_count',{}).get('number','') if isinstance(w.get('juan_count'),dict) else ''
    ib='；'.join(f"{i.get('source','')}:{i.get('title_info','')}{i.get('author_info','')}" for i in (w.get('indexed_by') or [])[:2])
    byres=collections.Counter(x.get('id') for x in (w.get('resources') or []))
    return f"[{wid}] {w.get('title','')} | {au} | 卷{jc} | {ib[:150]} | 已挂:{dict(byres)}"
pool=json.load(open('/tmp/claude-0/delta/pool_all.json'))
# waseda 确定 plan rows unseen
wp=json.load(open('/tmp/claude-0/delta/wp_class.json'))
have={(s,r) for s,r,_,_ in pool}
for s,rid,wid,k,_ in wp:
    if s=='waseda' and k!='见且Work同': pool.append((s,rid,'确定','未见' if k=='未见' else 'Work新'))
M={};PL={};REC={}
for s in set(p[0] for p in pool):
    M[s]={r['source_record_id']:r for r in csv.DictReader(open(RUN+f'{s}/matches.tsv'),delimiter='\t')}
    PL[s]={}
    for l in open(RUN+f'{s}/write_plan.jsonl'):
        p=json.loads(l); PL[s][p['record_id']]=p
    try:
        A=importlib.import_module('adapters.'+s); REC[s]={r['source_record_id']:r for r in A.load(LIB)}
    except Exception as e:
        print('adapter fail',s,repr(e)[:100]); REC[s]={}
rows=[]
for s,rid,t,why in pool:
    m=M[s].get(rid)
    if not m: print('nomatch',s,rid); continue
    cands=[x for x in m['candidates'].split(',') if x]
    if t=='确定' and rid in PL[s]: pick=PL[s][rid]['work_id']
    else:
        ar=json.loads(m['evidence']).get('author_rel') or []
        good=[i for i,a in enumerate(ar) if a in('eq','alias')]
        pick=cands[0] if len(cands)==1 else cands[good[0]] if len(good)==1 else None
    if not pick: print('nopick',s,rid); continue
    c=REC[s].get(rid,{})
    rows.append(dict(s=s,rid=rid,t=t,why=why,codes=m['reason_codes'],title=c.get('title_raw',m['lib_title']),au=c.get('author_raw',m['lib_author']),ver=c.get('version_raw',m['lib_version']),cls=c.get('class_raw',''),extra=json.dumps(c.get('extra',{}),ensure_ascii=False)[:200],pick=pick,others=[x for x in cands if x!=pick][:4]))
json.dump(rows,open('rows.json','w'),ensure_ascii=False)
print(len(rows),collections.Counter((r['s'],r['t']) for r in rows))
