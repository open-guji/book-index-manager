import csv,json,math,collections,sys
sys.path.insert(0,'/home/user/book-index-manager/tools/馆藏资源挂接/match_engine')
csv.field_size_limit(10**9)
import build_sheets_lib as L
keep={(r['s'],r['rid']):r for r in json.load(open('keep.json'))}
byrid={r['rid']:r for r in keep.values()}
ini={}
for i in range(1,6):
    sh={r[0]:r for r in csv.reader(open(f'sheets/初判{i}.tsv'),delimiter='\t')}
    for r in csv.reader(open(f'results/初判{i}_结果.tsv'),delimiter='\t'):
        if r[3]=='挂': ini[sh[r[0]][2]]=(sh[r[0]],r)
rev={}
for j in (1,2):
    sh={r[0]:r for r in csv.reader(open(f'sheets/复核{j}.tsv'),delimiter='\t')}
    for r in csv.reader(open(f'results/复核{j}_结果.tsv'),delimiter='\t'):
        rev[r[1]]=r
        assert sh[r[0]][2]==r[1]
fin={}
C=collections.Counter()
for rid,(sh,x) in ini.items():
    v=rev[rid]; C[v[2]]+=1
    if v[2] in('维持','維持','改note','改Note'): fin[rid]=(x[4],v[3] if v[2].startswith('改') else x[5])
print(C,len(fin))
json.dump(fin,open('finalB.json','w'),ensure_ascii=False)
rows=[byrid[r] for r in fin]
rows.sort(key=lambda r:r['pick'])
sz=math.ceil(len(rows)/2)
for j in range(2):
    with open(f'sheets/盲检B_{j+1}.tsv','w') as f:
        w=csv.writer(f,delimiter='\t',lineterminator='\n'); w.writerow(['序号','馆','record_id','馆藏题名','馆藏责任者','馆藏版本／分类／其他','候选Work（[id] 题名|著者(朝代)|卷数|著录|已挂各站数）','其他同题Work（仅供参考，不能挂）'])
        for k,r in enumerate(rows[j*sz:(j+1)*sz],1):
            w.writerow([k,L.NM[r['s']],r['rid'],r['title'],r['au'],'；'.join(x for x in (r['ver'],r['cls'],r['extra']) if x),L.wdesc(fin[r['rid']][0]),' ‖ '.join(L.wdesc(x) for x in r['others'])])
    print(j+1,len(rows[j*sz:(j+1)*sz]))
