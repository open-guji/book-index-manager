"""国書/NDL 严格二道闸：引擎确定档之上再要求 ①馆藏题名核心（去卷数、新字体折叠）＝Work 题名；②馆藏责任者非空且含 Work 某著者；③无节选／和刻注释／抄录标记。"""
import sys,csv,json,re,glob,os
sys.path.insert(0,'/home/claude/open-guji/book-index-manager/tools/馆藏资源挂接/match_engine')
import normalize as n, titleparse as tp
csv.field_size_limit(10**9)
root='/home/claude/book-index'
MARK=re.compile(r'首書|頭書|頭註|頭注|鼇頭|鰲頭|標註|標注|音註|音注|諺解|講義|講釈|科注|科註|國字解|国字解|和解|俚諺|鈔|抄|数首|數首|摘|節要|抜|拔|選|撮要|略解|啓蒙|傍訓|增補|増補|補註|補注')
def W(i):
    q=glob.glob(f"{root}/Work/{i[-3]}/{i[-2]}/{i[-1]}/{i}-*.json"); return json.load(open(q[0])) if q else None
def run(src):
    M={}
    for r in csv.DictReader(open(f'/home/claude/a2/eng/{src}/matches.tsv'),delimiter='\t'): M.setdefault(r['source_record_id'],r)
    keep=[];drop=[]
    for l in open(f'/home/claude/a2/eng/{src}/write_plan.jsonl'):
        p=json.loads(l); m=M[p['record_id']]; d=W(p['work_id'])
        core=tp.split_title(m['lib_title'])[0]
        wt=n.norm_title(d['title']); lt=n.norm_title(core)
        why=[]
        if lt!=wt: why.append('TITLE')
        au=n.fold(re.sub(r'[\s／/]','',m['lib_author'] or ''))
        names=[n.fold(re.sub(r'^釋|^释','',a.get('name',''))) for a in d.get('authors') or [] if a.get('name')]
        if not au: why.append('NOAUTH')
        elif names and not any(x and x in au for x in names): why.append('AUTH')
        if MARK.search(m['lib_title']) and not MARK.search(d['title']): why.append('MARK')
        (drop if why else keep).append((p,why,m,d))
    return keep,drop
for s in ['kokusho','ndl']:
    k,d=run(s)
    import collections
    print(s,'keep',len(k),'drop',len(d),collections.Counter(';'.join(w) for _,w,_,_ in d).most_common(8))
    os.makedirs('/home/claude/a2/s3',exist_ok=True)
    with open(f'/home/claude/a2/s3/{s}_严格保留.jsonl','w') as f:
        for p,_,_,_ in k: f.write(json.dumps(p,ensure_ascii=False)+'\n')
    with open(f'/home/claude/a2/s3/{s}_严格剔除.tsv','w') as f:
        f.write('record_id\twork_id\tWork题名\t馆藏题名\t馆藏责任者\t原因\n')
        for p,w,m,dd in d: f.write(f"{p['record_id']}\t{p['work_id']}\t{dd['title']}\t{m['lib_title']}\t{m['lib_author']}\t{';'.join(w)}\n")
