import csv,json,collections,sys,importlib
sys.path.insert(0,'/home/user/book-index-manager/tools/馆藏资源挂接/match_engine')
import writeplan as WP
def sheet(fn): return [r for r in csv.reader(open(fn),delimiter='\t')][1:]
drop_nums={('A','kokusho',1):{10,32,41,42},('A','ndl',1):{26},
 ('B','ndl',1):{8,21,31},('B','naikaku',1):{1,2,3,16}}
final={}; rej=collections.Counter()
plans={s:{json.loads(l)['record_id']:json.loads(l) for l in open(f'/tmp/w/s3/{s}_严格保留.jsonl')} for s in ('naikaku','ndl','kokusho')}
pick={s:json.load(open(f'{s}_pick.json')) for s in ('naikaku','ndl','kokusho')}
notes=json.load(open('notes_rev.json'))
for grp,sets in (('A',(('naikaku',3),('ndl',1),('kokusho',1))),('B',(('naikaku',2),('ndl',1),('kokusho',1)))):
    for s,n in sets:
        for i in range(1,n+1):
            sh={r[0]:r for r in sheet(f'盲检{grp}_{s}_{i}.tsv')}
            for r in csv.reader(open(f'盲检{grp}_{s}_{i}_结果.tsv'),delimiter='\t'):
                num=int(r[0]); rid=sh[r[0]][1]
                if r[2] not in('同书','同書'): rej[(grp,s,'非同书')]+=1; continue
                if num in drop_nums.get((grp,s,i),()): rej[(grp,s,'自留')]+=1; continue
                wid = plans[s][rid]['work_id'] if grp=='A' else pick[s][rid]
                final[(s,rid)]=(wid,'' if grp=='A' else notes.get(rid,''),grp)
R={}
out=collections.defaultdict(list); per=collections.Counter()
for (s,rid),(wid,note,grp) in sorted(final.items(),key=lambda kv:(kv[1][0],kv[0])):
    if per[wid,s]>=3: rej[('K9',s)]+=1; continue
    if grp=='A': p=plans[s][rid]
    else:
        if s not in R:
            A=importlib.import_module('adapters.'+s)
            R[s]={r['source_record_id']:r for r in A.load('/home/user/book_index_json/library_data')}
        m=WP.make_item(s,R[s][rid])
        if not m: rej[('无item',s)]+=1; continue
        item,g,label=m
        if note.strip(): item['note']=note.strip()
        p=dict(work_id=wid,source=s,record_id=rid,resource=item,resource_group={g:{'label':label}})
    per[wid,s]+=1; out[s].append(p)
for s in out:
    open(f'final_{s}.jsonl','w').write(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in out[s]))
    print(s,len(out[s]),len({x['work_id'] for x in out[s]}))
print(dict(rej))
