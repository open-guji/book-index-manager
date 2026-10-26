"""盲检同书行 → 只留互联网公开（kol public）→ 全局 K9 → korcis_cy_write_plan.jsonl；越南剔盲检不同 → nom_write_plan.jsonl。
用法：python3 mkplan.py <kol_cy.json>（与 library_data/korcis/_kol.json 合并后供适配器读）"""
import csv,json,glob,sys,collections,shutil,os
sys.path.insert(0,'/home/user/book-index-manager/tools/馆藏资源挂接/match_engine')
from adapters import korcis as A
import writeplan
BI='/home/user/book-index'; LD='/home/user/book_index_json/library_data'
def load(wid):
    g=glob.glob(f'{BI}/Work/{wid[-3]}/{wid[-2]}/{wid[-1]}/{wid}*.json'); return json.load(open(g[0])) if g else {}
kp=f'{LD}/korcis/_kol.json'; kol=json.load(open(kp)); new=json.load(open(sys.argv[1]))
for k,v in new.items(): kol.setdefault(k,v)
json.dump(kol,open(kp,'w'),ensure_ascii=False)
recs={r['source_record_id']:r for r in A.load(LD)}
pick=json.load(open('pick.json'))
note={}
for i in range(1,7):
    inp={r[0]:r for r in list(csv.reader(open(f'复核{i}.tsv'),delimiter='\t'))[1:]}
    for r in csv.reader(open(f'复核{i}_结果.tsv'),delimiter='\t'): note[r[1]]=r[3]
ok=[]; nomdrop=set(); st=collections.Counter()
for i in range(1,5):
    L=list(csv.reader(open(f'盲检{i}.tsv'),delimiter='\t'))[1:]
    res=list(csv.reader(open(f'盲检{i}_结果.tsv'),delimiter='\t'))
    for a,b in zip(L,res):
        if a[1]=='越南漢喃':
            if b[2]!='同书': nomdrop.add(a[2])
            continue
        if b[2]!='同书': st['盲检剔']+=1; continue
        ok.append(a[2])
st['盲检同书']=len(ok)
cand=collections.defaultdict(list)
for rid in ok:
    r=recs[rid]; k=kol.get(rid) or {}
    if not k.get('kol'): st['无控制号']+=1; continue
    if not k.get('public'): st['只限馆内']+=1; continue
    cand[pick[rid]].append(r)
plan=[]
for wid,L in cand.items():
    w=load(wid); have={x.get('group') for x in (w.get('resources') or []) if x.get('id')=='nlk'}
    L.sort(key=writeplan.rank_key)
    for r in L:
        item,grp,label=writeplan.make_item('korcis',r)
        if grp in have: st['已在']+=1; continue
        if len(have)>=3: st['K9满']+=1; continue
        have.add(grp)
        if note.get(r['source_record_id']): item['note']=note[r['source_record_id']]
        plan.append(dict(work_id=wid,source='korcis',record_id=r['source_record_id'],resource=item,resource_group={grp:{'label':label}}))
st['写入计划']=len(plan); st['Work']=len({p['work_id'] for p in plan})
with open('korcis_cy_write_plan.jsonl','w') as f:
    for p in plan: f.write(json.dumps(p,ensure_ascii=False)+'\n')
nl=[l for l in open('nom_write_plan.jsonl') if json.loads(l)['record_id'] not in nomdrop]
open('nom_write_plan.jsonl','w').writelines(nl)
print(dict(st),'nom',len(nl),'剔',sorted(nomdrop))
