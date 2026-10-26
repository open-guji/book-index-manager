import json,csv,glob,collections,sys
csv.field_size_limit(10**9)
root='/home/claude/book-index'; A='/home/claude/a2'
def W(i):
    q=glob.glob(f"{root}/Work/{i[-3]}/{i[-2]}/{i[-1]}/{i}-*.json"); return json.load(open(q[0])) if q else None
bad=set(open('/mnt/project-files/a2-日本三馆/A2已判有疑Work.txt').read().split())
for f in glob.glob(f'{A}/r2/*_结论.tsv'):
    for r in csv.DictReader(open(f),delimiter='\t'):
        if r['结论']!='同书': bad.add(r['work_id'])
r2={json.loads(l)['record_id'] for l in open(f'{A}/r2/r2_write_plan_终.jsonl')}
M={}
for r in csv.DictReader(open(f'{A}/eng2/ndl/matches.tsv'),delimiter='\t'): M.setdefault(r['source_record_id'],r)
c=collections.Counter(); out=[]; seen=set()
for l in open('linkplan-ndl.jsonl'):
    p=json.loads(l); wid=p['work_id']; g=p['resource']['group']
    if p['record_id'] in r2: c['r2重叠']+=1; continue
    if wid in bad: c['已判有疑Work']+=1; continue
    d=W(wid)
    if not d: c['Work缺']+=1; continue
    if d.get('merged_into'): c['已并']+=1; continue
    res=d.get('resources') or []
    if any(x.get('group')==g or x.get('url')==p['resource']['url'] for x in res): c['已在库']+=1; continue
    if sum(1 for x in res if x.get('id')=='ndl')>=3: c['K9满']+=1; continue
    if (p['record_id'],wid) in seen: c['重复']+=1; continue
    seen.add((p['record_id'],wid))
    m=M.get(p['record_id']) or {}
    out.append(dict(p=p,record_id=p['record_id'],work_id=wid,Work题名=d.get('title'),
      Work著者='、'.join(('(%s)'%a['dynasty'] if a.get('dynasty') else '')+a.get('name','') for a in d.get('authors') or []),
      馆藏题名=m.get('lib_title') or '',馆藏责任者=m.get('lib_author') or '',馆藏版本=m.get('lib_version') or p['resource']['metadata'].get('edition',''),basis=p.get('basis')))
    c['候选']+=1
print(c, 'no lib info',sum(1 for o in out if not o['馆藏题名']))
json.dump(out,open('cands.json','w'),ensure_ascii=False)
cols=['序号','record_id','work_id','Work题名','Work著者','馆藏题名','馆藏责任者','馆藏版本']
for k,i in enumerate(range(0,len(out),80),1):
    with open(f'a7_{k:02d}_样本.tsv','w') as f:
        f.write('\t'.join(cols)+'\n')
        for j,r in enumerate(out[i:i+80],1): f.write('\t'.join([str(j)]+[str(r[x] or '').replace('\t',' ') for x in cols[1:]])+'\n')
