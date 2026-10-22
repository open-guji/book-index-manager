#!/usr/bin/env python3
"""验收5 抽检：分层随机抽 100 条（朝代20、年号80，年号按朝代层化比例分配，最大余数法）。
用法: python3 sample_audit.py <book-index根> <种子> > 抽检集.tsv
排除：至元(元)、中統、顯道（Sasha 10-13 已改）。同种子同库指纹→同结果。"""
import json,os,sys,random,collections,subprocess
root,seed=sys.argv[1],int(sys.argv[2])
D={};R=[]
for dp,_,fs in os.walk(os.path.join(root,'Entity')):
    for f in fs:
        if f.endswith('.json'):
            d=json.load(open(os.path.join(dp,f),encoding='utf8'))
            if d.get('subtype')=='dynasty': D[d['id']]=d
            elif d.get('subtype')=='reign': R.append(d)
fp=subprocess.run(['git','-C',root,'rev-parse','--short=10','HEAD'],capture_output=True,text=True).stdout.strip()
rnd=random.Random(seed)
EXC={'至元','中統','顯道'}
R=[r for r in R if r['primary_name'] not in EXC]
dyn=sorted(d['id'] for d in D.values() if 'dates' in d)  # 有起讫年的才可核；无 dates 的单列说明
nodates=len(D)-len(dyn)
sd=rnd.sample(dyn,20)
by=collections.defaultdict(list)
for r in sorted(R,key=lambda r:r['id']): by[r['dynasty_id']].append(r)
N=sum(len(v) for v in by.values()); K=80
quota={k:K*len(v)/N for k,v in by.items()}
alloc={k:int(q) for k,q in quota.items()}
rest=K-sum(alloc.values())
order=sorted(by,key=lambda k:(-(quota[k]-alloc[k]),rnd.random()))
for k in order[:rest]: alloc[k]+=1
sr=[]
for k in sorted(by):
    if alloc[k]: sr+=rnd.sample(by[k],alloc[k])
print(f'# book-index {fp}; seed={seed}; 年号池={N}(排除{sorted(EXC)}); 朝代池(有dates)={len(dyn)}/{len(D)}(无dates {nodates}); 层数={sum(1 for v in alloc.values() if v)}')
print('类型\tid\t名称\t朝代\t起\t止\t帝王\tbasis')
for i in sd:
    d=D[i];print('\t'.join(['朝代',i,d['primary_name'],'',str(d['dates'].get('start','')),str(d['dates'].get('end','')),'',d['dates'].get('basis','')]))
for r in sr:
    d=r['dates'];print('\t'.join(['年号',r['id'],r['primary_name'],D[r['dynasty_id']]['primary_name'],str(d['start']),str(d.get('end','')),r['ruler']['name'],d.get('basis','')]))
