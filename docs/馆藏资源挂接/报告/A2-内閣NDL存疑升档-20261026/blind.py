import csv,json
S='.'
keep={}
for f in ('naikaku','ndl'):
    for l in open(f'{f}_write_plan.jsonl'): keep[json.loads(l)['record_id']]=f
rows={'naikaku':[],'ndl':[]};hdr={}
for i in range(1,11):
    rd=list(csv.reader(open(f'复核{i}.tsv'),delimiter='\t'));h=rd[0]
    src='naikaku' if i<8 else 'ndl'
    ix=[j for j,c in enumerate(h) if c not in('初判note','初判理由','原因码','序号')]
    hdr[src]=[h[j] for j in ix]
    for r in rd[1:]:
        if r[1] in keep: rows[src].append([r[j] for j in ix])
n=0
for src,rs in rows.items():
    for k in range(0,len(rs),165):
        n+=1;w=csv.writer(open(f'盲检{n}.tsv','w'),delimiter='\t')
        w.writerow(['序号']+hdr[src])
        for q,r in enumerate(rs[k:k+165],1): w.writerow([q]+r)
        print(n,src,len(rs[k:k+165]))
