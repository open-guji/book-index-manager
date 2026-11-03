import json,csv,math,collections,re,sys,glob,os
sys.path.insert(0,'/home/user/book-index-manager/tools/馆藏资源挂接/match_engine')
import normalize as n, titleparse as tp
import build_sheets_lib as L
rows=json.load(open('rows.json'))
MARK=re.compile(r'首書|頭書|頭註|頭注|鼇頭|鰲頭|標註|標注|音註|音注|諺解|講義|講釈|科注|科註|國字解|国字解|和解|俚諺|鈔|抄|数首|數首|摘|節要|抜|拔|選|撮要|略解|啓蒙|傍訓|增補|増補|補註|補注')
# strict gate for A2 three 确定
keep=[];strict_drop=[]
for r in rows:
    if r['t']=='确定' and r['s'] in('naikaku','ndl','kokusho'):
        d=L.load(r['pick']);
        if d and d.get('merged_into'): d=L.load(d['merged_into']) or d
        core=tp.split_title(r['title'])[0]; why=[]
        if n.norm_title(core)!=n.norm_title(d['title']): why.append('TITLE')
        au=n.fold(re.sub(r'[\s／/]','',r['au'] or ''))
        names=[n.fold(re.sub(r'^釋|^释','',a.get('name',''))) for a in d.get('authors') or [] if a.get('name')]
        if not au: why.append('NOAUTH')
        elif names and not any(x and x in au for x in names): why.append('AUTH')
        if MARK.search(r['title']) and not MARK.search(d['title']): why.append('MARK')
        if why: strict_drop.append((r,why)); continue
    keep.append(r)
print('strict drop',len(strict_drop),'keep',len(keep))
with open('严格剔除.tsv','w') as f:
    f.write('source\trecord_id\twork_id\t馆藏题名\t馆藏责任者\t原因\n')
    for r,w in strict_drop: f.write(f"{r['s']}\t{r['rid']}\t{r['pick']}\t{r['title']}\t{r['au']}\t{';'.join(w)}\n")
def desc(r):
    return [L.wdesc(r['pick']),' ‖ '.join(L.wdesc(x) for x in r['others'])]
def write(fn,rs,blind):
    with open(fn,'w') as f:
        w=csv.writer(f,delimiter='\t',lineterminator='\n')
        w.writerow(['序号','馆','record_id']+([] if blind else ['原因码'])+['馆藏题名','馆藏责任者','馆藏版本／分类／其他','候选Work（[id] 题名|著者(朝代)|卷数|著录|已挂各站数）','其他同题Work（仅供参考，不能挂）'])
        for k,r in enumerate(rs,1):
            w.writerow([k,L.NM[r['s']],r['rid']]+([] if blind else [r['codes']])+[r['title'],r['au'],'；'.join(x for x in (r['ver'],r['cls'],r['extra']) if x)]+desc(r))
def chunks(rs,n_):
    rs=sorted(rs,key=lambda r:r['pick']); sz=math.ceil(len(rs)/n_); return [rs[i*sz:(i+1)*sz] for i in range(n_)]
os.makedirs('sheets',exist_ok=True)
cert=[r for r in keep if r['t']=='确定']; sus=[r for r in keep if r['t']=='存疑']
for i,c in enumerate(chunks(cert,3),1): write(f'sheets/盲检A_{i}.tsv',c,True)
a2=[r for r in sus if r['s'] in('naikaku','ndl','kokusho')]
a9=[r for r in sus if r['s'] in('utokyo','ioc','shoryobu','keio','nagoya','arc')]
ky=[r for r in sus if r['s']=='kyoto']; tw=[r for r in sus if r['s']=='ncltw']
g={'日系A2':a2,'A9六馆':a9,'京大贵重':ky,'台湾国图':tw}
# initial sheets: 5 agents
init=[('1',a2[:len(a2)//2]),('2',a2[len(a2)//2:]),('3',a9),('4',ky),('5',tw)]
for k,rs in init: write(f'sheets/初判{k}.tsv',sorted(rs,key=lambda r:r['pick']),False)
json.dump(keep,open('keep.json','w'),ensure_ascii=False)
print(len(cert),collections.Counter(r['s'] for r in cert)); print([ (k,len(rs)) for k,rs in init])
