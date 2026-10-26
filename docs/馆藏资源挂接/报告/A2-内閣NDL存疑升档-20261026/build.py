import csv,json,glob,collections,sys
src=sys.argv[1]; SEGN=int(sys.argv[2])
sys.path.insert(0,'/home/claude/bim/tools/馆藏资源挂接/match_engine')
import importlib; A=importlib.import_module('adapters.'+src)
D='/mnt/project-files/a2-日本三馆/'; BI='/home/claude/book-index'
SITE={'naikaku':'nat-archives-jp','ndl':'ndl'}[src]; NM={'naikaku':'内閣','ndl':'NDL'}[src]
def load(wid):
    g=glob.glob(f'{BI}/Work/{wid[-3]}/{wid[-2]}/{wid[-1]}/{wid}*.json'); return json.load(open(g[0])) if g else None
recs={r['source_record_id']:r for r in A.load('/home/claude/bij/library_data')}
R=[r for r in csv.DictReader(open(D+f'{src}_matches_main-f33bde05.tsv'),delimiter='\t') if r['tier']=='存疑']
bad=set(open(D+'A2已判有疑Work.txt').read().split())|{'d59f6ekqiww8'}
skip=set(json.loads(l)['record_id'] for l in open(D+'r2_write_plan_终.jsonl'))
skip|=set(json.loads(l)['record_id'] for l in open(D+'A7转交NDL_write_plan_终.jsonl'))
skip|=set(r['record_id'] for r in csv.DictReader(open(D+'r2_剔除.tsv'),delimiter='\t'))
drop=collections.Counter(); keep=[]; dedup=[]; multi=[]
for r in R:
    codes=set(r['reason_codes'].split(';')); cands=[c for c in r['candidates'].split(',') if c]
    why=None; pick=None
    if r['has_image']!='1': why='无影像'
    elif not r['lib_author'].strip(): why='馆藏无责任者'
    elif r['already_linked']=='1' or r['excluded']: why='已挂/排除'
    elif 'GROUP_SPLIT' in codes or 'DUP_WORK_SUSPECT' in codes: why='疑重复Work交去重'; dedup.append(r)
    elif r['source_record_id'] in skip: why='A2已处理'
    elif any(c in bad for c in cands): why='A2有疑Work'
    elif len(cands)==1: pick=cands[0]
    else:
        ar=json.loads(r['evidence']).get('author_rel') or []
        good=[i for i,a in enumerate(ar) if a in('eq','alias')]
        if len(good)==1: pick=cands[good[0]]
        elif len(good)>1: why='同著者多Work'; multi.append(r)
        else: why='多候选无合'
    if why: drop[why]+=1
    else: keep.append((r,pick,[c for c in cands if c!=pick]))
print(src,len(R),drop,len(keep))
def wdesc(wid):
    w=load(wid)
    if not w: return f'{wid}:缺'
    if w.get('merged_into'):
        k=w['merged_into']; w=load(k) or w; wid=k
    au='、'.join(f"{a.get('name','')}({a.get('dynasty','')}){a.get('role','')}" for a in (w.get('authors') or []) if isinstance(a,dict))
    jc=w.get('juan_count',{}).get('number','') if isinstance(w.get('juan_count'),dict) else ''
    ib='；'.join(f"{i.get('source','')}:{i.get('title_info','')}{i.get('author_info','')}" for i in (w.get('indexed_by') or [])[:2])
    nres=sum(1 for x in (w.get('resources') or []) if x.get('id')==SITE)
    return f"[{wid}] {w.get('title','')} | {au} | 卷{jc} | {ib[:150]} | 已挂{NM}{nres}"
rows=[]
for r,pick,others in keep:
    c=recs.get(r['source_record_id'],{})
    rows.append([r['source_record_id'],r['reason_codes'],c.get('title_raw',r['lib_title']),c.get('author_raw',r['lib_author']),c.get('version_raw',r['lib_version']),c.get('class_raw',''),json.dumps(c.get('extra',{}),ensure_ascii=False)[:200],wdesc(pick),' ‖ '.join(wdesc(x) for x in others[:4])])
hdr=['record_id','原因码',f'{NM}题名',f'{NM}责任者',f'{NM}版本',f'{NM}分类',f'{NM}其他','候选Work（[id] 题名|著者(朝代)|卷数|著录|已挂数）','其他同题Work（仅供参考，不能挂）']
size=(len(rows)+SEGN-1)//SEGN
for i in range(SEGN):
    with open(f'{src}_段{i+1}.tsv','w') as f:
        w=csv.writer(f,delimiter='\t',lineterminator='\n'); w.writerow(['序号']+hdr)
        for k,x in enumerate(rows[i*size:(i+1)*size],1): w.writerow([k]+x)
json.dump({r['source_record_id']:p for r,p,_ in keep},open(f'{src}_pick.json','w'))
for nm,L in (('交去重_疑重复Work',dedup),('交去重_同著者多Work',multi)):
    with open(f'{src}_{nm}.tsv','w') as f:
        w=csv.writer(f,delimiter='\t',lineterminator='\n'); w.writerow(['record_id','题名','责任者','原因码','候选Work'])
        for r in L: w.writerow([r['source_record_id'],r['lib_title'],r['lib_author'],r['reason_codes'],r['candidates']])
print(len(rows),size)
