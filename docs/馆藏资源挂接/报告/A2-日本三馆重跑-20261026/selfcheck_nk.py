import csv,json,glob,re,unicodedata,sys
sys.path.insert(0,'/home/claude/open-guji/book-index-manager/tools/馆藏资源挂接/match_engine')
import normalize as n
root='/home/claude/book-index'
def W(i):
    q=glob.glob(f"{root}/Work/{i[-3]}/{i[-2]}/{i[-1]}/{i}-*.json"); return json.load(open(q[0])) if q else None
out=[]
for b in ['naikaku-A','naikaku-B']:
    done={r['record_id'] for r in csv.DictReader(open(f'/home/claude/a2/s2/{b}_盲检样本.tsv'),delimiter='\t')}
    for r in csv.DictReader(open(f'/home/claude/a2/s2/{b}_全表.tsv'),delimiter='\t'):
        if r['record_id'] in done: continue
        d=W(r['work_id']); blob=n.fold(json.dumps(d,ensure_ascii=False))
        hits=[]
        for part in re.split('[；;/]',r['馆藏责任者'] or ''):
            m=re.match(r'\s*([^:：]+)[:：](.+?)(（[^）]*）)?\s*$',part)
            if not m: continue
            role,name=m.group(1).strip(),m.group(2).strip()
            name=re.sub(r'^(釈|釋)','',name)
            if role in('著者','編者','選者','注釈者','訳者','補訂者') and len(name)>=2 and n.fold(name) not in blob:
                hits.append(role+':'+name)
        if hits: out.append((b,r['record_id'],r['work_id'],r['Work题名'],r['Work著者'],r['馆藏题名'],r['馆藏责任者'],';'.join(hits)))
for o in out: print('\t'.join(o))
print(len(out),file=sys.stderr)
