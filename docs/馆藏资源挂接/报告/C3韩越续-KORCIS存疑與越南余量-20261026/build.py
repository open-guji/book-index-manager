"""KORCIS 带影像存疑档机械预筛与分段（仿 C3续 build.py）。用法：python3 build.py <matches.tsv> <段数>"""
import csv,json,glob,collections,sys
csv.field_size_limit(10**8)
sys.path.insert(0,'/home/user/book-index-manager/tools/馆藏资源挂接/match_engine')
from adapters import korcis as A
BI='/home/user/book-index'; MT=sys.argv[1]; SEGN=int(sys.argv[2]); SITE='nlk'
def load(wid):
    g=glob.glob(f'{BI}/Work/{wid[-3]}/{wid[-2]}/{wid[-1]}/{wid}*.json'); return json.load(open(g[0])) if g else None
recs={r['source_record_id']:r for r in A.load('/home/user/book_index_json/library_data')}
R=[r for r in csv.DictReader(open(MT),delimiter='\t') if r['tier']=='存疑']
import re
KOR=re.compile(r'\((朝鮮|高麗|韓國|新羅|日本)\)|發給|受給|撰給|所志')
KORW=re.compile(r'朝鮮|高麗|新羅|韓國|日本')
def wd(wid):
    w=load(wid) or {}
    return ' '.join(str(a.get('dynasty','')) for a in (w.get('authors') or []) if isinstance(a,dict))
drop=collections.Counter(); keep=[]; dedup=[]; multi=[]
for r in R:
    codes=set(r['reason_codes'].split(';')); cands=[c for c in r['candidates'].split(',') if c]
    why=None; pick=None
    if not r['lib_author'].strip(): why='馆藏无责任者'
    elif r['already_linked']=='1' or r['excluded']: why='已挂/排除'
    elif 'GROUP_SPLIT' in codes or 'DUP_WORK_SUSPECT' in codes: why='疑重复Work交去重'; dedup.append(r)
    elif not cands: why='无候选'
    elif 'A_DIFF' in codes and KOR.search(r['lib_author']) and not any(KORW.search(wd(c)) for c in cands): why='朝鲜人著作或文书，著者与中土 Work 不合'
    elif len(cands)==1: pick=cands[0]
    else:
        ar=json.loads(r['evidence']).get('author_rel') or []
        good=[i for i,a in enumerate(ar) if a in('eq','alias')]
        if len(good)==1: pick=cands[good[0]]
        elif good: why='同著者多Work'; multi.append(r)
        else: why='多候选无合'
    if why: drop[why]+=1
    else: keep.append((r,pick,[c for c in cands if c!=pick]))
print(len(R),dict(drop),len(keep))
def wdesc(wid):
    w=load(wid)
    if not w: return f'{wid}:缺'
    if w.get('merged_into'):
        k=w['merged_into']; w=load(k) or w; wid=k
    au='、'.join(f"{a.get('name','')}({a.get('dynasty','')}){a.get('role','')}" for a in (w.get('authors') or []) if isinstance(a,dict))
    jc=w.get('juan_count',{}).get('number','') if isinstance(w.get('juan_count'),dict) else ''
    ib='；'.join(f"{i.get('source','')}:{i.get('title_info','')}{i.get('author_info','')}" for i in (w.get('indexed_by') or [])[:2])
    nres=sum(1 for x in (w.get('resources') or []) if x.get('id')==SITE)
    return f"[{wid}] {w.get('title','')} | {au} | 卷{jc} | {ib[:150]} | 已挂韓國國中{nres}"
rows=[]; pickmap={}
for r,pick,others in keep:
    c=recs.get(r['source_record_id'],{}); ex=c.get('extra',{})
    w=load(pick)
    if w and w.get('merged_into'): pick=w['merged_into']
    pickmap[r['source_record_id']]=pick
    rows.append([r['source_record_id'],r['reason_codes'],ex.get('title_full') or c.get('title_raw',''),ex.get('author_full') or r['lib_author'],c.get('version_raw',r['lib_version']),f"藏館:{ex.get('library','')} 存卷:{ex.get('part','')}",wdesc(pick),' ‖ '.join(wdesc(x) for x in others[:4])])
hdr=['record_id','原因码','KORCIS题名','KORCIS责任者','KORCIS版本','KORCIS其他','候选Work（[id] 题名|著者(朝代)|卷数|著录|已挂数）','其他同题Work（仅供参考，不能挂）']
size=(len(rows)+SEGN-1)//SEGN
for i in range(SEGN):
    with open(f'段{i+1}.tsv','w') as f:
        w=csv.writer(f,delimiter='\t',lineterminator='\n'); w.writerow(['序号']+hdr)
        for k,x in enumerate(rows[i*size:(i+1)*size],1): w.writerow([k]+x)
json.dump(pickmap,open('pick.json','w'))
for nm,L in (('交去重_疑重复Work',dedup),('交去重_同著者多Work',multi)):
    with open(f'{nm}.tsv','w') as f:
        w=csv.writer(f,delimiter='\t',lineterminator='\n'); w.writerow(['record_id','题名','责任者','原因码','候选Work'])
        for r in L: w.writerow([r['source_record_id'],r['lib_title'],r['lib_author'],r['reason_codes'],r['candidates']])
print(len(rows),size)
