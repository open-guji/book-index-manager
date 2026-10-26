import csv,json,glob,collections
D='/mnt/project-files/a2-日本三馆/'
BI='/home/claude/book-index'
def load(wid):
    g=glob.glob(f'{BI}/Work/{wid[-3]}/{wid[-2]}/{wid[-1]}/{wid}*.json'); return json.load(open(g[0])) if g else None
crawl={}
for f in sorted(glob.glob(D+'kokusho-raw/part-*.json')):
    for r in json.load(open(f)): crawl[str(r['source_record_id'])]=r
R=[r for r in csv.DictReader(open(D+'kokusho_matches_main-f33bde05.tsv'),delimiter='\t') if r['tier']=='存疑']
bad=set(open(D+'A2已判有疑Work.txt').read().split())
r2=set(json.loads(l)['record_id'] for l in open(D+'r2_write_plan_终.jsonl'))
rj=set(r['record_id'] for r in csv.DictReader(open(D+'r2_剔除.tsv'),delimiter='\t'))
drop=collections.Counter(); keep=[]; dedup=[]
for r in R:
    codes=set(r['reason_codes'].split(';'))
    cands=[c for c in r['candidates'].split(',') if c]
    why=None
    if r['has_image']!='1': why='K3无影像'
    elif not r['lib_author'].strip(): why='馆藏无责任者'
    elif r['already_linked']=='1' or r['excluded']: why='已挂/排除'
    elif 'GROUP_SPLIT' in codes or 'DUP_WORK_SUSPECT' in codes: why='疑重复Work交去重'; dedup.append(r)
    elif r['source_record_id'] in r2 or r['source_record_id'] in rj: why='A2已处理'
    elif any(c in bad for c in cands): why='A2有疑Work'
    elif len(cands)!=1: why='多候选'
    if why: drop[why]+=1
    else: keep.append(r)
print(drop,len(keep))
def wdesc(wid):
    w=load(wid)
    if not w: return f'{wid}:缺'
    if w.get('merged_into'):
        k=w['merged_into']; w=load(k) or w; wid=k
    au='、'.join(f"{a.get('name','')}({a.get('dynasty','')}){a.get('role','')}" for a in (w.get('authors') or []) if isinstance(a,dict))
    jc=w.get('juan_count',{}).get('number','') if isinstance(w.get('juan_count'),dict) else ''
    ib='；'.join(f"{i.get('source','')}:{i.get('title_info','')}{i.get('author_info','')}" for i in (w.get('indexed_by') or [])[:2])
    nres=sum(1 for x in (w.get('resources') or []) if x.get('id')=='kokusho')
    return f"[{wid}] {w.get('title','')} | {au} | 卷{jc} | {ib[:150]} | 已挂国書{nres}"
rows=[]
for r in keep:
    c=crawl[r['source_record_id']]; d=(c.get('raw') or {}).get('detail') or {}
    j=lambda x:' / '.join(x) if isinstance(x,list) else (x or '')
    works='；'.join(f"{w.get('name','')}〔{' '.join(a.get('name','')+a.get('role','') for a in (w.get('author') or []))}〕" for w in (d.get('work') or []))[:300]
    rows.append([r['source_record_id'],r['reason_codes'],c['bookName'],j(d.get('kshomeipdf'))[:150],j(d.get('author'))[:200],d.get('kansu',''),d.get('kansha',''),j(d.get('bpublish'))[:150],works,(d.get('chuki') or '')[:200],wdesc(r['candidates'].split(',')[0])])
hdr=['record_id','原因码','国書题名','国書各种书名','国書著者','卷数','刊写','出版','国書著作(work)及著者','注记','候选Work（[id] 题名|著者(朝代)|卷数|著录|已挂国書数）']
n=6; size=(len(rows)+n-1)//n
for i in range(n):
    with open(f'段{i+1}.tsv','w') as f:
        w=csv.writer(f,delimiter='\t',lineterminator='\n'); w.writerow(['序号']+hdr)
        for k,x in enumerate(rows[i*size:(i+1)*size],1): w.writerow([k]+x)
with open('交去重_疑重复Work.tsv','w') as f:
    w=csv.writer(f,delimiter='\t',lineterminator='\n'); w.writerow(['record_id','国書题名','国書著者','原因码','候选Work'])
    for r in dedup: w.writerow([r['source_record_id'],r['lib_title'],r['lib_author'],r['reason_codes'],r['candidates']])
print(len(rows),size)
