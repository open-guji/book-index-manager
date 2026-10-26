"""初判结果 → 复核分段：全部「挂」行，加 Work 无著者的「存疑」行（附 Work ai_note 供认同）。"""
import csv,json,glob,collections,sys
BI='/home/user/book-index'
def load(wid):
    g=glob.glob(f'{BI}/Work/{wid[-3]}/{wid[-2]}/{wid[-1]}/{wid}*.json'); return json.load(open(g[0])) if g else {}
pick=json.load(open('pick.json'))
rows=[]
for i in range(1,8):
    seg={r[0]:r for r in list(csv.reader(open(f'段{i}.tsv'),delimiter='\t'))[1:]}
    for r in csv.reader(open(f'段{i}_结果.tsv'),delimiter='\t'):
        w=load(pick[r[1]])
        noau=not w.get('authors')
        if r[2]=='挂' or (r[2]=='存疑' and noau):
            s=seg[r[0]]
            rows.append([r[1],r[2],r[3] or pick[r[1]],r[4],r[5]]+s[3:9]+[(w.get('ai_note') or '')[:200] if noau else ''])
print(len(rows),collections.Counter(x[1] for x in rows))
N=int(sys.argv[1]); size=(len(rows)+N-1)//N
hdr=['record_id','初判','work_id','初判note','初判理由','KORCIS题名','KORCIS责任者','KORCIS版本','KORCIS其他','候选Work（[id] 题名|著者(朝代)|卷数|著录|已挂数）','其他同题Work','Work无著者时的ai_note']
for k in range(N):
    with open(f'复核{k+1}.tsv','w') as f:
        w=csv.writer(f,delimiter='\t',lineterminator='\n'); w.writerow(['序号']+hdr)
        for j,x in enumerate(rows[k*size:(k+1)*size],1): w.writerow([j]+x)
