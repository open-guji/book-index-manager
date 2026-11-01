import csv,json,collections,sys,importlib,glob
sys.path.insert(0,'/home/user/book-index-manager/tools/馆藏资源挂接/match_engine')
import writeplan as WP
csv.field_size_limit(10**9)
keep={r['rid']:r for r in json.load(open('keep.json'))}
fin=json.load(open('finalB.json'))
rej=collections.Counter(); final={}; notsame=[]
# A
for i in (1,2,3):
    sh={r[0]:r for r in csv.reader(open(f'sheets/盲检A_{i}.tsv'),delimiter='\t')}
    res=list(csv.reader(open(f'results/盲检A_{i}_结果.tsv'),delimiter='\t')); assert len(res)==len(sh)-1
    for r in res:
        rid=sh[r[0]][2]; k=keep[rid]
        if r[2] in('同书','同書'): final[rid]=(k['pick'],'','A')
        else: rej['A:'+r[2]]+=1; notsame.append((k['s'],rid,k['pick'],'A',r[2],r[3]))
# B
for j in (1,2):
    sh={r[0]:r for r in csv.reader(open(f'sheets/盲检B_{j}.tsv'),delimiter='\t')}
    res=list(csv.reader(open(f'results/盲检B_{j}_结果.tsv'),delimiter='\t')); assert len(res)==len(sh)-1
    for r in res:
        rid=sh[r[0]][2]; k=keep[rid]
        if r[2] in('同书','同書'): final[rid]=(fin[rid][0],fin[rid][1],'B')
        else: rej['B:'+r[2]]+=1; notsame.append((k['s'],rid,fin[rid][0],'B',r[2],r[3]))
EXTRA=set(open('selfdrop.txt').read().split()) if glob.glob('selfdrop.txt') else set()
for x in EXTRA: final.pop(x,None)
print(rej,len(final),'selfdrop',len(EXTRA))
# build plan
REC={};PL={}
out=collections.defaultdict(list); per=collections.Counter()
LIB='/home/user/book_index_json/library_data'
for rid,(wid,note,grp) in sorted(final.items(),key=lambda kv:(kv[1][0],kv[0])):
    k=keep[rid]; s=k['s']
    if s not in REC:
        A=importlib.import_module('adapters.'+s); REC[s]={r['source_record_id']:r for r in A.load(LIB)}
        PL[s]={}
        for l in open(f'/tmp/claude-0/run/{s}/write_plan.jsonl'):
            p=json.loads(l); PL[s][p['record_id']]=p
    if grp=='A' and rid in PL[s]: p=PL[s][rid]
    else:
        m=WP.make_item(s,REC[s][rid])
        if not m: rej[('无item',s)]+=1; continue
        item,g,label=m
        if note.strip(): item['note']=note.strip()
        p=dict(work_id=wid,source=s,record_id=rid,resource=item,resource_group={g:{'label':label}})
    if per[wid,s]>=3: rej[('K9批内',s)]+=1; continue
    per[wid,s]+=1; out[s].append(p)
allp=[]
for s in out:
    allp+=out[s]; print(s,len(out[s]),len({x['work_id'] for x in out[s]}))
open('write_plan_final.jsonl','w').write(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in allp))
with open('不同与存疑.tsv','w') as f:
    f.write('馆\trecord_id\twork_id\t轮\t盲检结论\t理由\n')
    for t in notsame: f.write('\t'.join(t)+'\n')
print(len(allp),dict(rej))
