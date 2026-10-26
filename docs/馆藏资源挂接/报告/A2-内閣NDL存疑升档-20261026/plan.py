import csv,json,sys,collections,importlib
sys.path.insert(0,'/home/claude/bim/tools/馆藏资源挂接/match_engine')
import writeplan as WP
S='/tmp/claude-0/-home-claude/1caaa1a6-106a-5206-84af-c4b0a60f38bd/scratchpad/nn'
for src,rng in (('naikaku',range(1,8)),('ndl',range(8,11))):
    A=importlib.import_module('adapters.'+src)
    recs={r['source_record_id']:r for r in A.load('/home/claude/bij/library_data')}
    pick=json.load(open(f'{S}/{src}_pick.json'))
    out=[];st=collections.Counter();per=collections.Counter()
    for i in rng:
        for r in csv.reader(open(f'{S}/复核{i}_结果.tsv'),delimiter='\t'):
            st[r[2]]+=1
            if r[2] not in ('维持','改note'): continue
            m=WP.make_item(src,recs[r[1]])
            if not m: st['无item']+=1; continue
            item,grp,label=m
            if r[3].strip(): item['note']=r[3].strip()
            per[pick[r[1]]]+=1
            out.append(dict(work_id=pick[r[1]],source=src,record_id=r[1],resource=item,resource_group={grp:{'label':label}}))
    print(src,st,len(out),len(per),'K9超',sum(1 for v in per.values() if v>3))
    open(f'{S}/{src}_write_plan.jsonl','w').write(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in out))
