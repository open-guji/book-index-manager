import csv,glob,json,math,collections
csv.field_size_limit(10**9)
tot={}
for s,n in (('naikaku',2),('ndl',1),('kokusho',1)):
    segs={}
    for f in sorted(glob.glob(f'{s}_段?.tsv')):
        i=f.split('段')[1][0]
        rows=list(csv.reader(open(f),delimiter='\t')); hdr=rows[0]
        res={r[0]:r for r in csv.reader(open(f'{s}_段{i}_结果.tsv'),delimiter='\t')}
        for r in rows[1:]:
            x=res[r[0]]
            segs[r[1]]=(r,x)
    pick=json.load(open(f'{s}_pick.json'))
    C=collections.Counter(); keep=[]
    for rid,(r,x) in segs.items():
        C[x[2]]+=1
        if x[2]=='挂': keep.append((x[3] or pick[rid],r,x))
    keep.sort(key=lambda t:t[0])
    tot[s]=(dict(C),len(keep))
    sz=math.ceil(len(keep)/n)
    h=hdr[:1]+hdr[1:]+['初判note','初判理由']
    for i in range(n):
        with open(f'复核_{s}_{i+1}.tsv','w') as f:
            w=csv.writer(f,delimiter='\t',lineterminator='\n'); w.writerow(h)
            for k,(wid,r,x) in enumerate(keep[i*sz:(i+1)*sz],1):
                r2=list(r); r2[0]=str(k); r2[8]=r2[8]  # keep
                w.writerow(r2+[x[4],x[5]])
print(tot)
