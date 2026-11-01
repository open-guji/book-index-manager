import csv,math,collections
csv.field_size_limit(10**9)
keep=[];C=collections.Counter()
for i in range(1,6):
    rows=list(csv.reader(open(f'sheets/初判{i}.tsv'),delimiter='\t')); hdr=rows[0]
    res={r[0]:r for r in csv.reader(open(f'results/初判{i}_结果.tsv'),delimiter='\t')}
    assert len(res)==len(rows)-1,(i,len(res))
    for r in rows[1:]:
        x=res[r[0]]; C[x[3]]+=1
        if x[3]=='挂': keep.append((i,r,x))
print(C,len(keep))
keep.sort(key=lambda t:t[2][4])
h=hdr+['初判note','初判理由']
sz=math.ceil(len(keep)/2)
for j in range(2):
    with open(f'sheets/复核{j+1}.tsv','w') as f:
        w=csv.writer(f,delimiter='\t',lineterminator='\n'); w.writerow(h)
        for k,(i,r,x) in enumerate(keep[j*sz:(j+1)*sz],1): w.writerow([k]+r[1:]+[x[5],x[6]])
    print(j+1,len(keep[j*sz:(j+1)*sz]))
