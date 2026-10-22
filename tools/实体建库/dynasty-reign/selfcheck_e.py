"""块E 步4 自检：python3 selfcheck_e.py 帝王年号对照.tsv <book-index根>
1 同一帝王年号序列：相邻 start_next<end_prev 为重叠；start_next-end_prev≥2 为空档；0或1为相接（库内两种写法并存：止年=下号起年，或止年+1=下号起年）
2 在位起止(源并集)与年号序列首尾相合占比（首尾各容差±1年：在位止年常记继位年，年号止年记末年）
3 年号起讫落在朝代区间（库 dynasty.dates，按名称精确匹配）内"""
import sys,re,csv,json,glob
tsv,root=sys.argv[1:3]
dy={}
for f in glob.glob(root+'/Entity/**/*.json',recursive=True):
    try:d=json.load(open(f))
    except: continue
    if d.get('subtype')=='dynasty' and d.get('dates',{}).get('start') is not None:
        dy[d['primary_name']]=(d['dates']['start'],d['dates'].get('end'))
rows=[r for r in csv.reader(open(tsv,encoding='utf8'),delimiter='\t') if r and not r[0].startswith('#')]
hdr,rows=rows[0],rows[1:]
ix={h:i for i,h in enumerate(hdr)}
pat=re.compile(r'([^；(（]+)[(（](-?\d+)-(-?\d+)[)）]')
ov=[];gap=[];ok=0;tot=0;rm=0;rt=0;rmiss=[];dyo=[];dyn=set()
for r in rows:
    eras=[(m[0],int(m[1]),int(m[2])) for m in pat.findall(r[ix['年号序列']])]
    if not eras: continue
    tot+=1;bad=False
    s=sorted(eras,key=lambda e:(e[1],e[2]))
    for a,b in zip(s,s[1:]):
        if b[1]<a[2]: ov.append((r[0],r[3],a,b));bad=True
        elif b[1]>a[2]+1: gap.append((r[0],r[3],a,b));bad=True
    if not bad: ok+=1
    m=re.match(r'(-?\d+)~(-?\d+)',r[ix['在位起止(源并集)']])
    if m:
        rt+=1
        if abs(int(m[1])-s[0][1])<=1 and abs(int(m[2])-max(e[2] for e in eras))<=1: rm+=1
        else: rmiss.append((r[0],r[3],m[0],s[0][1],max(e[2] for e in eras)))
    d=r[ix['朝代']]
    if d in dy:
        a,b=dy[d]
        for e in eras:
            if e[1]<a-1 or (b is not None and e[2]>b+1): dyo.append((r[0],d,e,(a,b)));break
    else: dyn.add(d)
P=lambda *a:print(*a)
P('# 块E 步4 自检（selfcheck_e.py）\n')
P(f'- 有年号序列的帝王行 {tot}；相邻年号相接/无重叠无空档 {ok}；重叠 {len(ov)} 条、空档 {len(gap)} 条')
P(f'- 在位起止与年号首尾相合 {rm}/{rt}')
P(f'- 年号越出朝代区间（±1）{len(dyo)} 行；朝代名在库里无 dates 或不同名，未检 {len(dyn)} 个：{"、".join(sorted(dyn))}\n')
P('## 重叠');[P(f'- {x[0]}（{x[1]}）：{x[2]} / {x[3]}') for x in ov]
P('\n## 空档');[P(f'- {x[0]}（{x[1]}）：{x[2]} → {x[3]}') for x in gap]
P('\n## 在位起止与年号首尾不合');[P(f'- {x[0]}（{x[1]}）在位 {x[2]}；年号首 {x[3]} 尾 {x[4]}') for x in rmiss]
P('\n## 越出朝代区间');[P(f'- {x[0]}：{x[1]} 年号 {x[2]} 朝代 {x[3]}') for x in dyo]
