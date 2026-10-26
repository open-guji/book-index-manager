"""复核维持行（K9 前，含从严去以外全部）＋越南 8 部 → 盲检分段（不带任何先前判断）。"""
import csv,json,glob,random
BI='/home/user/book-index'
def load(wid):
    g=glob.glob(f'{BI}/Work/{wid[-3]}/{wid[-2]}/{wid[-1]}/{wid}*.json'); return json.load(open(g[0])) if g else {}
STRICT={(3,n) for n in (38,59,68,72,81,87)}
rows=[]
for i in range(1,7):
    inp={r[0]:r for r in list(csv.reader(open(f'复核{i}.tsv'),delimiter='\t'))[1:]}
    for r in csv.reader(open(f'复核{i}_结果.tsv'),delimiter='\t'):
        if r[2]=='维持' and (i,int(r[0])) not in STRICT:
            x=inp[r[0]]; w=load(x[3])
            an=(w.get('ai_note') or '').replace('\n',' ')[:300] if not w.get('authors') else ''
            rows.append(['KORCIS',x[1],x[6],x[7],x[8],x[9],x[10].replace('| 已挂韓國國中',' |'),x[11],an])
nb={}
for x in json.load(open('/home/user/book_index_json/library_data/越南漢喃古籍NomFoundation.json')):
    b=(x.get('extra') or {}).get('book_id') or x['source_record_id']
    nb.setdefault(b,dict(title=x['title'],author=x.get('author',''),edition=x.get('edition',''),period=x.get('period',''),holding=x.get('holding_id',''),lang=(x.get('extra') or {}).get('Language','')))
for r in csv.DictReader(open('nom_判定.tsv'),delimiter='\t'):
    n=nb[r['book_id']]; w=load(r['work_id'])
    au='、'.join(f"{a.get('name','')}({a.get('dynasty','')}){a.get('role','')}" for a in (w.get('authors') or []))
    an=(w.get('ai_note') or '')[:300] if not w.get('authors') else ''
    rows.append(['越南漢喃',r['book_id'],n['title'],n['author'],f"{n['edition']} {n['period']}",f"藏:{n['holding']} 语言:{n['lang']}",f"[{w['id']}] {w.get('title')} | {au}",'',an])
random.seed(7); random.shuffle(rows)
hdr=['来源','record_id','藏本题名','藏本责任者','藏本版本','藏本其他','候选Work（[id] 题名|著者(朝代)|卷数|著录）','其他同题Work（仅供参考）','Work无著者时的建条说明ai_note']
N=4; size=(len(rows)+N-1)//N
for k in range(N):
    with open(f'盲检{k+1}.tsv','w') as f:
        w=csv.writer(f,delimiter='\t',lineterminator='\n'); w.writerow(['序号']+hdr)
        for j,x in enumerate(rows[k*size:(k+1)*size],1): w.writerow([j]+x)
print(len(rows),size)
