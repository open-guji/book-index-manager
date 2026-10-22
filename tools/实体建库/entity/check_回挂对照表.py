#!/usr/bin/env python3
"""回挂对照表自校验：每行 Work.authors[authors_index].name 必须等于「作者名」，且 entity_id 在 book-index 正式库存在。
用法：python3 check_回挂对照表.py <对照表.tsv> <book-index-draft 根目录> <book-index 根目录>
不等或缺失 → 打印并以非零退出。"""
import sys,csv,json,glob,os
tsv,draft,prod=sys.argv[1:4]
idx={os.path.basename(f).split('-')[0]:f for f in glob.glob(draft+'/Work/*/*/*/*.json')}
ents=set()
for f in glob.glob(prod+'/index/entities/*.json'): ents|=set(json.load(open(f,encoding='utf-8')))
bad=0;n=0;skip=0
for r in list(csv.reader(open(tsv,encoding='utf-8'),delimiter='\t'))[1:]:
    n+=1;name,wid,eid,ai=r[0],r[1],r[3],r[8]
    if not eid: skip+=1;continue  # 「勿挂／暂不建」行
    f=idx.get(wid)
    if not f: print('NOWORK',name,wid);bad+=1;continue
    a=[x.get('name','').strip() for x in json.load(open(f,encoding='utf-8')).get('authors') or []]
    if not ai.isdigit() or int(ai)>=len(a) or a[int(ai)]!=name: print('MISALIGN',name,wid,ai,a);bad+=1
    if eid not in ents: print('NOENT',name,eid);bad+=1
print('rows',n,'skipped(无entity_id)',skip,'bad',bad);sys.exit(1 if bad else 0)
