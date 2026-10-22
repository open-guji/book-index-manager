#!/usr/bin/env python3
"""步3初算：对照底表 × 匹配明细(zhwp) × dila_紀年 → 帝王年号对照.tsv（首轮，独立来源判定待来源可信度表）。
用法: python3 ruler_titles.py  （在 朝代年号录入/ 下运行）"""
import re,collections
def rows(p):
    return [l.rstrip('\n').split('\t') for l in open(p,encoding='utf8') if l.strip() and not l.startswith('#')]
base=rows('对照底表.tsv')[1:]
zh={}
for x in rows('对勘产出/匹配明细.tsv')[1:]:
    if len(x)>7 and x[7]: zh[x[7]]=x
dila=collections.defaultdict(list)
for x in rows('源表/dila_紀年.tsv'):
    if len(x)>6 and not x[2].startswith('（無'):
        try: dila[x[2].strip('（）')].append((x[3],x[4],int(x[5]),int(x[6])))
        except ValueError: pass
out=[]; cnt=collections.Counter()
for name,dyn,did,n,seq,ids in base:
    ids=ids.split(',')
    eras=re.findall(r'([^；(]+)\((-?\d+)-(-?\d+)\)',seq)
    zt=set();zs=[];ze=[]
    for i in ids:
        if i in zh:
            r=zh[i]; zt.add(r[4])
            if re.fullmatch(r'-?\d+',r[5]) and re.fullmatch(r'-?\d+',r[6]): zs.append(int(r[5])); ze.append(int(r[6]))
    dt=set();ds=[];de=[];dhit=0;conf=[]
    for en,s,e in eras:
        hit=[d for d in dila.get(en,[]) if abs(d[2]-int(s))<=1]
        near=[d for d in dila.get(en,[]) if 1<abs(d[2]-int(s))<=10]  # DILA无朝代键，近距(≤10年)同名才疑为同一年号的起年冲突，远处同名视作他朝
        if not hit and near:
            conf.append('%s(库%s/DILA%s)'%(en,s,'|'.join(str(d[2]) for d in near)))
        if hit:
            dhit+=1
            for d in hit: dt.add(d[1]); ds.append(d[2]); de.append(d[3])
    nz=sum(1 for i in ids if i in zh)
    srcs=[]
    if nz: srcs.append('zhwp(%d/%d)'%(nz,len(ids)))
    if dhit: srcs.append('DILA(%d/%d)'%(dhit,len(eras)))
    tier='冲突' if (nz and conf) else '已对勘' if (nz and dhit) else '单源' if srcs else '无源'
    cnt[tier]+=1
    lo=min(zs+ds) if zs+ds else ''; hi=max(ze+de) if ze+de else ''
    note=[]
    if tier=='已对勘': note.append('双源一致；上游未证')
    if conf: note.append('起年相差≥2或不一致，需第三源:'+'；'.join(conf))
    if len(zt)>1: note.append('zhwp帝王写法不一:'+'/'.join(sorted(zt)))
    out.append([name,'','',dyn,f'{lo}~{hi}' if lo!='' else '',seq,name,','.join(ids),'；'.join(srcs) or '无',tier,'/'.join(sorted(zt)),'/'.join(sorted(dt)),'；'.join(note)])
with open('帝王年号对照.tsv','w',encoding='utf8') as f:
    f.write('# 首轮初算：来源列仅为命中计数，"已对勘"＝zhwp与DILA各命中≥1条年号且无冲突年号(同名但起年差≥2→冲突，需第三源)；已对勘≠已核实（zhwp按匹配明细；DILA按年号名+起年±1）；独立性以来源可信度表为准；庙号/谥号列待拆，先留源写法\n')
    f.write('本名\t庙号\t谥号\t朝代\t在位起止(源并集)\t年号序列\t库内ruler.name\treign_ids\t来源\t对勘层级\tzhwp帝王写法\tDILA帝王写法\t备注\n')
    for o in out: f.write('\t'.join(o)+'\n')
print(len(out),dict(cnt))
