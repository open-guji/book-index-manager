import csv,collections,json
exec(open('build.py').read().split("R=[r for r")[0])   # load(), crawl, D, BI
bad=set(open(D+'A2已判有疑Work.txt').read().split())
r2=set(json.loads(l)['record_id'] for l in open(D+'r2_write_plan_终.jsonl'))
rj=set(r['record_id'] for r in csv.DictReader(open(D+'r2_剔除.tsv'),delimiter='\t'))
R=[r for r in csv.DictReader(open(D+'kokusho_matches_main-f33bde05.tsv'),delimiter='\t') if r['tier']=='存疑' and r['has_image']=='1' and r['lib_author'].strip() and not r['excluded'] and r['already_linked']=='0']
M=[r for r in R if len([c for c in r['candidates'].split(',') if c])>1 and 'GROUP_SPLIT' not in r['reason_codes'] and 'DUP_WORK_SUSPECT' not in r['reason_codes'] and r['source_record_id'] not in r2|rj]
src=open('build.py').read(); exec(src[src.index('def wdesc'):src.index('rows=[]')])
pick=[];multi=[]
for r in M:
    cs=[x for x in r['candidates'].split(',') if x]; ar=json.loads(r['evidence'])['author_rel']
    good=[i for i,a in enumerate(ar) if a in('eq','alias')]
    if len(good)==1 and cs[good[0]] not in bad: pick.append((r,cs[good[0]],[c for c in cs if c!=cs[good[0]]]))
    elif len(good)>1: multi.append(r)
rows=[]
for r,c0,others in pick:
    c=crawl[r['source_record_id']]; d=(c.get('raw') or {}).get('detail') or {}
    j=lambda x:' / '.join(x) if isinstance(x,list) else (x or '')
    works='；'.join(f"{w.get('name','')}〔{' '.join(a.get('name','')+a.get('role','') for a in (w.get('author') or []))}〕" for w in (d.get('work') or []))[:300]
    rows.append([r['source_record_id'],r['reason_codes'],c['bookName'],j(d.get('kshomeipdf'))[:150],j(d.get('author'))[:200],d.get('kansu',''),d.get('kansha',''),j(d.get('bpublish'))[:150],works,(d.get('chuki') or '')[:200],wdesc(c0),' ‖ '.join(wdesc(x) for x in others[:4])])
hdr=['record_id','原因码','国書题名','国書各种书名','国書著者','卷数','刊写','出版','国書著作(work)及著者','注记','候选Work（[id] 题名|著者(朝代)|卷数|著录|已挂国書数）','其他同题Work（仅供参考，不能挂）']
n=2; size=(len(rows)+n-1)//n
for i in range(n):
    with open(f'段{7+i}.tsv','w') as f:
        w=csv.writer(f,delimiter='\t',lineterminator='\n'); w.writerow(['序号']+hdr)
        for k,x in enumerate(rows[i*size:(i+1)*size],1): w.writerow([k]+x)
with open('交去重_同著者多Work.tsv','w') as f:
    w=csv.writer(f,delimiter='\t',lineterminator='\n'); w.writerow(['record_id','国書题名','国書著者','原因码','候选Work','author_rel'])
    for r in multi: w.writerow([r['source_record_id'],r['lib_title'],r['lib_author'],r['reason_codes'],r['candidates'],json.loads(r['evidence'])['author_rel']])
print(len(rows),size,len(multi))
