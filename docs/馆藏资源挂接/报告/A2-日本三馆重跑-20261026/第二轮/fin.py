import csv,json,collections
drop={'kokusho_02':{3,10,22,39,43,45,59,60,61,75,13,67,68,69,70,71,12,38,41},'kokusho_03':{36,62},'ndl_05':{4,34},'naikaku_01':set(),'kokusho_04':set()}
ok=set();badw=set();rej=[]
for b,d in drop.items():
    S={r['序号']:r for r in csv.DictReader(open(f'{b}_样本.tsv'),delimiter='\t')}
    for r in csv.DictReader(open(f'{b}_结论.tsv'),delimiter='\t'):
        n=int(r['序号']); s=S[r['序号']]
        if r['结论']=='同书' and n not in d: ok.add((s['record_id'],s['work_id']))
        else:
            badw.add(s['work_id']); rej.append([b,r['序号'],s['record_id'],s['work_id'],s['Work题名'],s['馆藏题名'],r['结论'] if n not in d else '同书→复核从严剔',r.get('备注','')])
plan=[];cnt=collections.Counter()
for s in ['naikaku','kokusho','ndl']:
    for l in open(f'/home/claude/a2/eng2/{s}/write_plan.jsonl'):
        p=json.loads(l)
        if (p['record_id'],p['work_id']) in ok and p['work_id'] not in badw: plan.append(l); cnt[s]+=1
        elif (p['record_id'],p['work_id']) in ok: rej.append([s,'',p['record_id'],p['work_id'],'','','同 Work 另有非同书行，整 Work 剔',''])
open('r2_write_plan_终.jsonl','w').writelines(plan)
with open('r2_剔除.tsv','w') as f:
    f.write('批\t序号\trecord_id\twork_id\tWork题名\t馆藏题名\t结论\t备注\n')
    for r in rej: f.write('\t'.join(x.replace('\t',' ') for x in r)+'\n')
print(cnt,len(plan),'works',len({json.loads(l)['work_id'] for l in plan}),'rej',len(rej))
