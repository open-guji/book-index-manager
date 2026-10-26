import json,csv,glob,os
csv.field_size_limit(10**9)
root='/home/claude/book-index'; A='/home/claude/a2'
def W(i):
    q=glob.glob(f"{root}/Work/{i[-3]}/{i[-2]}/{i[-1]}/{i}-*.json"); return json.load(open(q[0])) if q else None
bad=set()
for f in glob.glob(f'{A}/s2/*结论*.tsv')+glob.glob(f'{A}/s3/*结论*.tsv')+glob.glob(f'{A}/up/盲检结论.tsv')+glob.glob(f'{A}/out/盲检结论.tsv'):
    for r in csv.DictReader(open(f),delimiter='\t'):
        if r.get('结论')!='同书': bad.add(r['work_id'])
for f in [f'{A}/final/naikaku_剔除.tsv']:
    for r in csv.DictReader(open(f),delimiter='\t'): bad.add(r['work_id'])
bad.add('d59f6ekqiww8')
rows=[];skipped=0
for s in ['naikaku','kokusho','ndl']:
    M={}
    for r in csv.DictReader(open(f'{A}/eng2/{s}/matches.tsv'),delimiter='\t'): M.setdefault(r['source_record_id'],r)
    for l in open(f'{A}/eng2/{s}/write_plan.jsonl'):
        p=json.loads(l)
        if p['work_id'] in bad: skipped+=1; continue
        m=M.get(p['record_id']) or {}; d=W(p['work_id']) or {}
        rows.append(dict(source=s,record_id=p['record_id'],work_id=p['work_id'],Work题名=d.get('title'),
          Work著者='、'.join(('(%s)'%a['dynasty'] if a.get('dynasty') else '')+a.get('name','') for a in d.get('authors') or []),
          馆藏题名=m.get('lib_title'),馆藏责任者=m.get('lib_author'),馆藏版本=m.get('lib_version'),reason=m.get('reason_codes')))
print('bad works',len(bad),'skipped rows',skipped,'candidates',len(rows),{s:sum(r['source']==s for r in rows) for s in ['naikaku','kokusho','ndl']})
json.dump(rows,open(f'{A}/r2/cands.json','w'),ensure_ascii=False)
cols=['序号','record_id','work_id','Work题名','Work著者','馆藏题名','馆藏责任者','馆藏版本']
src={'naikaku':'国立公文書館内閣文庫','kokusho':'国書データベース（国文学研究資料館）','ndl':'国立国会図書館'}
k=0
for s in ['naikaku','kokusho','ndl']:
    rs=[r for r in rows if r['source']==s]
    for c in range(0,len(rs),80):
        k+=1; ch=rs[c:c+80]
        with open(f'{A}/r2/{s}_{k:02d}_样本.tsv','w') as f:
            f.write('\t'.join(cols)+'\n')
            for i,r in enumerate(ch,1): f.write('\t'.join([str(i)]+[str(r[x] or '') for x in cols[1:]])+'\n')
