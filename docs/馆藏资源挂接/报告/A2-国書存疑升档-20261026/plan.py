import csv,json,sys,collections
sys.path.insert(0,'/home/claude/bim/tools/馆藏资源挂接/match_engine')
from adapters import kokusho as K
import writeplan as WP
S='/tmp/claude-0/-home-claude/1caaa1a6-106a-5206-84af-c4b0a60f38bd/scratchpad'
recs={r['source_record_id']:r for r in K.load(S+'/kdata')}
init={}
for i in range(1,7):
    for r in csv.reader(open(f'{S}/ko/段{i}_结果.tsv'),delimiter='\t'):
        if r[2]=='挂': init[r[1]]=r[3]
out=[];st=collections.Counter()
for i in range(1,4):
    for r in csv.reader(open(f'{S}/ko/复核{i}_结果.tsv'),delimiter='\t'):
        st[r[2]]+=1
        if r[2] not in ('维持','改note'): continue
        rec=recs[r[1]]; m=WP.make_item('kokusho',rec)
        if not m: st['无影像?']+=1; continue
        item,grp,label=m
        if r[3].strip(): item['note']=r[3].strip()
        out.append(dict(work_id=init[r[1]],source='kokusho',record_id=r[1],resource=item,resource_group={grp:{'label':label}}))
print(st,len(out))
open(f'{S}/ko/国書存疑升档_write_plan.jsonl','w').write(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in out))
