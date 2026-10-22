import json,sys,os,collections,io,contextlib
JSON_MODE='--json' in sys.argv
_args=[a for a in sys.argv[1:] if a!='--json']
root=_args[0]
_buf=io.StringIO()
_ctx=contextlib.redirect_stdout(_buf) if JSON_MODE else contextlib.nullcontext()
_ctx.__enter__()
D={};R=[]
for dp,_,fs in os.walk(os.path.join(root,'Entity')):
    for f in fs:
        if not f.endswith('.json'): continue
        d=json.load(open(os.path.join(dp,f)))
        if d.get('subtype')=='dynasty': D[d['id']]=d
        elif d.get('subtype')=='reign': R.append(d)
print('dynasty',len(D),'reign',len(R))
# dynasty
print('dyn no dates',sum(1 for d in D.values() if not d.get('dates')))
print('dyn no period',sum(1 for d in D.values() if not d.get('period')))
print('dyn with parent',sum(1 for d in D.values() if d.get('parent_id')))
print('dyn with alt_names',sum(1 for d in D.values() if d.get('alt_names')))
print('dyn ambiguous alt',sum(1 for d in D.values() for a in d.get('alt_names',[]) if a.get('ambiguous')))
# reign
print('reign no dynasty_id',sum(1 for r in R if not r.get('dynasty_id')))
print('reign bad dynasty_id',sum(1 for r in R if r.get('dynasty_id') and r['dynasty_id'] not in D))
print('reign no ruler',sum(1 for r in R if not r.get('ruler')))
print('reign ruler entity_id',sum(1 for r in R if r.get('ruler',{}).get('entity_id')))
print('reign no start',sum(1 for r in R if not r.get('dates',{}).get('start')))
print('reign no end',sum(1 for r in R if r.get('dates',{}).get('end') is None))
print('reign alt_names',sum(1 for r in R if r.get('alt_names')))
print('reign desc sources nonempty',sum(1 for r in R if r.get('description',{}).get('sources')))
print('review status',collections.Counter(r.get('review',{}).get('status') for r in R+list(D.values())))
cnt=collections.Counter(r['dynasty_id'] for r in R)
byd=collections.defaultdict(list)
for r in R: byd[D.get(r['dynasty_id'],{}).get('primary_name','?')].append(r)
print('--- reigns per dynasty (>0)')
for k,v in sorted(byd.items(),key=lambda x:-len(x[1])): print(k,len(v),end='; ')
print()
print('dynasties with 0 reign:',[d['primary_name'] for i,d in D.items() if i not in cnt][:80], sum(1 for i in D if i not in cnt))
# dup triple
t=collections.Counter((r['primary_name'],r['dynasty_id'],r.get('dates',{}).get('start')) for r in R)
print('dup triples',[k for k,v in t.items() if v>1])
# same-dynasty overlap
ov=[]
for k,v in byd.items():
    pass
# date sanity
bad=[(r['primary_name'],r['dates']) for r in R if r.get('dates',{}).get('end') is not None and r['dates'].get('start') and r['dates']['end']<r['dates']['start']]
print('end<start',bad)
# reigns outside dynasty range
out=[]
for r in R:
    d=D.get(r.get('dynasty_id'))
    if d and d.get('dates') and r.get('dates'):
        ds,de=d['dates'].get('start'),d['dates'].get('end')
        s=r['dates'].get('start')
        if ds is not None and s is not None and (s<ds-5 or (de is not None and s>de+5)): out.append((r['primary_name'],d['primary_name'],s,ds,de))
print('reign start outside dynasty +-5:',len(out),out[:15])
names=collections.Counter(r['primary_name'] for r in R)
print('distinct names',len(names),'dup names',sum(1 for v in names.values() if v>1))
# ruler names distribution
print('missing ruler.name',sum(1 for r in R if not r.get('ruler',{}).get('name')))
print('keys used',collections.Counter(k for r in R for k in r).most_common())

# ---- --json：结构化输出（块 B 步 3 新增；无 --json 时上面的输出逐字不变）
_ctx.__exit__(None,None,None)
if JSON_MODE:
    def _r1(r):
        d=D.get(r.get('dynasty_id')); dt=r.get('dates',{})
        if not d or not d.get('dates'): return None
        ds,de=d['dates'].get('start'),d['dates'].get('end'); st=dt.get('start'); en=dt.get('end',st)
        w=[]
        if ds is not None and st is not None and st<ds-5: w.append('start<dyn.start-5')
        if de is not None and en is not None and en>de+5: w.append('end>dyn.end+5')
        return w or None
    r1=[{'id':r['id'],'name':r['primary_name'],'rule':w} for r in R for w in [_r1(r)] if w]
    rn=collections.Counter((r['ruler']['name'],D[r['dynasty_id']]['primary_name']) for r in R if r['dynasty_id'] in D and r.get('ruler',{}).get('name'))
    out={'dynasty':len(D),'reign':len(R),
         'reign_out_of_range':len(out),   # 旧口径：起年落区间外±5（与总计划第三节"4 条"同口径）
         'reign_r1_warn':r1,              # check_v2 R1 同口径：起<朝代起-5 或 止>朝代止+5
         'reign_sources_nonempty':[{'id':r['id'],'name':r['primary_name']} for r in R if r.get('description',{}).get('sources')],
         'dynasty_sources_nonempty':[{'id':d['id'],'name':d['primary_name']} for d in D.values() if d.get('description',{}).get('sources')],
         'review_status':dict(collections.Counter(x.get('review',{}).get('status') for x in R+list(D.values()))),
         'distinct_reign_names':len(names),'dup_reign_names':sum(1 for v in names.values() if v>1),
         'rulers':{'pairs':len(rn),'distinct_names':len({k[0] for k in rn})}}
    print(json.dumps(out,ensure_ascii=False,indent=1,sort_keys=True))
