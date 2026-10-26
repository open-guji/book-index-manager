"""（原因码含义见输出目录 README；NO_IMAGE 与 T_MISS 类不写原因文字以控体积）KORCIS 全量 515,616 条与越南漢喃 1,018 部的逐条挂接状态表（挂／未挂＋原因），落 book_index_json _匹配。
用法：python3 status.py <matches.tsv> <group2work.json> <输出目录>"""
import csv,json,glob,os,sys,collections,re
csv.field_size_limit(10**8)
E=os.path.dirname(os.path.abspath(__file__)); LD='/home/user/book_index_json/library_data'; BI='/home/user/book-index'
MT,G2W,OUT=sys.argv[1:4]; os.makedirs(OUT,exist_ok=True)
g2w=json.load(open(G2W)); kol=json.load(open(f'{LD}/korcis/_kol.json'))
mine={json.loads(l)['record_id'] for l in open(f'{E}/korcis_cy_write_plan.jsonl')}
pick=json.load(open(f'{E}/pick.json'))
def rd(p): return list(csv.reader(open(p),delimiter='\t'))
init={};rev={};blind={}
for i in range(1,8):
    for r in rd(f'{E}/段{i}_结果.tsv'): init[r[1]]=(r[2],r[5])
for i in range(1,7):
    for r in rd(f'{E}/复核{i}_结果.tsv'): rev[r[1]]=(r[2],r[4])
STRICT_IDS={rd(f'{E}/复核3.tsv')[n][1] for n in (38,59,68,72,81,87)}
for i in range(1,5):
    for r in rd(f'{E}/盲检{i}_结果.tsv'): blind[r[1]]=(r[2],r[3])
def load(wid):
    g=glob.glob(f'{BI}/Work/{wid[-3]}/{wid[-2]}/{wid[-1]}/{wid}*.json'); return json.load(open(g[0])) if g else {}
KOR=re.compile(r'\((朝鮮|高麗|韓國|新羅|日本)\)|發給|受給|撰給|所志'); KORW=re.compile(r'朝鮮|高麗|新羅|韓國|日本')
def wdyn(c): return ' '.join(str(a.get('dynasty','')) for a in (load(c).get('authors') or []) if isinstance(a,dict))
def prefilter(r):
    codes=set(r['reason_codes'].split(';')); cands=[c for c in r['candidates'].split(',') if c]
    if not r['lib_author'].strip(): return 'P_NO_AUTHOR','馆藏无责任者，无法过著者闸'
    if r['already_linked']=='1' or r['excluded']: return 'P_EXCLUDED','已挂或先后规则排除'
    if 'GROUP_SPLIT' in codes or 'DUP_WORK_SUSPECT' in codes: return 'P_DUP_WORK','候选 Work 疑重复，交去重'
    if not cands: return 'P_NO_CAND','无候选'
    if len(cands)>1:
        ar=json.loads(r['evidence']).get('author_rel') or []
        good=[a for a in ar if a in('eq','alias')]
        if len(good)>1: return 'P_MULTI_SAME_AUTHOR','同著者多 Work，交去重'
        if not good: return 'P_MULTI_NO_AUTHOR','同题多 Work，著者都不合'
    if 'A_DIFF' in codes and KOR.search(r['lib_author']) and not any(KORW.search(wdyn(c)) for c in cands): return 'P_KOREAN_WORK','朝鲜人著作或古文书，与同题中土 Work 著者不合'
    return None
NOMATCH={'T_MISS':'库内无同题 Work','NOT_HANZI':'题名非汉字','T_EMPTY':'题名为空'}
M={r['source_record_id']:r for r in csv.DictReader(open(MT),delimiter='\t')}
cnt=collections.Counter()
with open(f'{OUT}/korcis_挂接状态.tsv','w') as f:
    w=csv.writer(f,delimiter='\t',lineterminator='\n')
    w.writerow(['rec_key','有原文影像','引擎档位','结论','work_id','原因码','原因'])
    for p in sorted(glob.glob(f'{LD}/korcis/part-*.json')):
        for x in json.load(open(p)):
            rid=x['source_record_id']; img=bool((x.get('extra') or {}).get('has_original'))
            g='korcis-'+rid
            if not img:
                row=[rid,'N','','未挂','','NO_IMAGE','']
            else:
                m=M[rid]; tier=m['tier']
                if g in g2w: row=[rid,'Y',tier,'已挂',g2w[g],'LINKED_C3' if rid not in mine else 'LINKED_C3X','首批确定档写入' if rid not in mine else '本批存疑升档写入']
                elif tier=='无':
                    c=[k for k in NOMATCH if k in m['reason_codes']] or ['T_MISS']
                    row=[rid,'Y',tier,'未挂','',c[0],'']
                elif tier=='确定':
                    k=kol.get(rid) or {}
                    if not k.get('kol'): row=[rid,'Y',tier,'未挂',m['work_id'],'NO_CONTROL_NO','无国中控制号，无稳定影像链接']
                    elif not k.get('public'): row=[rid,'Y',tier,'未挂',m['work_id'],'LIBRARY_ONLY','影像只限国中及协约馆阅览，非互联网公开']
                    else: row=[rid,'Y',tier,'未挂',m['work_id'],'GATE_OR_K9','二道闸（冠称括注／注本次要责任者）改存疑或 K9 满']
                else:
                    wid=pick.get(rid,'')
                    pf=prefilter(m) if rid not in pick else None
                    if pf: row=[rid,'Y',tier,'未挂','',pf[0],pf[1]]
                    elif init[rid][0]!='挂' and rid not in rev: row=[rid,'Y',tier,'未挂',wid,'R1_'+('UNSURE' if init[rid][0]=='存疑' else 'NO'),'初判'+init[rid][0]+'：'+init[rid][1]]
                    elif rev[rid][0]!='维持': row=[rid,'Y',tier,'未挂',wid,'R2_NO','复核否：'+rev[rid][1]]
                    elif rid in STRICT_IDS: row=[rid,'Y',tier,'未挂',wid,'R2_STRICT','复核后从严去：题名讹脱字只靠单项佐证']
                    elif blind[rid][0]!='同书': row=[rid,'Y',tier,'未挂',wid,'R3_BLIND','盲检'+blind[rid][0]+'：'+blind[rid][1]]
                    else:
                        k=kol.get(rid) or {}
                        if not k.get('kol'): row=[rid,'Y',tier,'未挂',wid,'NO_CONTROL_NO','无国中控制号，无稳定影像链接']
                        elif not k.get('public'): row=[rid,'Y',tier,'未挂',wid,'LIBRARY_ONLY','影像只限国中及协约馆阅览，非互联网公开']
                        else: row=[rid,'Y',tier,'未挂',wid,'K9','同 Work 已有 3 个 nlk 藏本（K9）或 Work 已并入满额 keeper']
            cnt[(row[1],row[3],row[5])]+=1; w.writerow(row)
for k,v in sorted(cnt.items(),key=lambda x:-x[1]): print(k,v)
# 越南
recs=json.load(open(f'{LD}/越南漢喃古籍NomFoundation.json')); books=collections.OrderedDict()
for x in recs: books.setdefault((x.get('extra') or {}).get('book_id') or x['source_record_id'],[]).append(x)
old={x['book_id'] for x in json.load(open(f'{E}/../C3续-臺灣國圖存疑與越南漢喃挂接-20261026/nom_候选.json'))}
new={x['book_id'] for x in json.load(open(f'{E}/nom_候选2.json'))}
nj={r['book_id']:r for r in csv.DictReader(open(f'{E}/nom_判定.tsv'),delimiter='\t')}
c2=collections.Counter()
with open(f'{OUT}/nomfoundation_挂接状态.tsv','w') as f:
    w=csv.writer(f,delimiter='\t',lineterminator='\n'); w.writerow(['book_id','卷数','题名','责任者','语言','结论','work_id','原因码','原因'])
    for b,L in books.items():
        x=L[0]; g='nom-'+b; base=[b,len(L),x['title'],x.get('author',''),(x.get('extra') or {}).get('Language','')]
        if g in g2w: row=base+['已挂',g2w[g],'LINKED','C3续 或本批写入']
        elif b in nj: row=base+['未挂',nj[b]['work_id'],'BLIND_NO','盲检不同：Work 为國圖新建 stub，源著录无著者，著者闸过不了']
        elif b in new: row=base+['未挂','','R1_NO','题名与库内 Work 全等，但逐部核判为同题异书、泛称或无著者（见报告）']
        elif b in old: row=base+['未挂','','R1_NO_C3X','C3续 已核：题名全等但著者不合或仅刊行者校字者（见 C3续 报告）']
        else: row=base+['未挂','','NO_WORK','库内无同题 Work（多为越南人著作、喃字书）']
        c2[(row[5],row[7])]+=1; w.writerow(row)
print(dict(c2))
