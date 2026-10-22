import json,os,collections
D={};R=[];P=collections.defaultdict(list)
for dp,_,fs in os.walk('Entity'):
    for f in fs:
        if not f.endswith('.json'): continue
        d=json.load(open(os.path.join(dp,f)))
        s=d.get('subtype')
        if s=='dynasty': D[d['id']]=d
        elif s=='reign': R.append(d)
        elif s in('people',None) and not d.get('merged_into'):
            P[d.get('primary_name')].append(d)
            for a in d.get('alt_names',[]):
                n=a['name'] if isinstance(a,dict) else a
                P[n].append(d)
rn=collections.Counter()
for r in R: rn[(r['ruler']['name'],D[r['dynasty_id']]['primary_name'])]+=1
print('distinct (ruler,dynasty)',len(rn),'distinct ruler names',len({k[0] for k in rn}))
hit=0;hit_dyn=0;multi=0;miss=[]
for (n,dy),c in rn.items():
    cand=P.get(n,[])
    if cand: hit+=1
    else: miss.append((n,dy))
    if any(x.get('dynasty')==dy for x in cand): hit_dyn+=1
print('name exact in people:',hit,'; with same dynasty:',hit_dyn)
print('miss sample',miss[:25])
# weird ruler names
print([k for k in rn if len(k[0])>5 or '、' in k[0] or '/' in k[0] or '?' in k[0] or k[0] in('','未詳')][:30])
