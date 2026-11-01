import csv,json,glob,re,sys,collections,os
csv.field_size_limit(10**9)
R='/home/user/book-index-manager/docs/馆藏资源挂接/报告/'
M='/mnt/project-files/'
DIRS=[R+'A2-内閣NDL存疑升档-20261026',R+'A2-国書存疑升档-20261026',R+'A2-日本三馆存疑重判-20261101',R+'A2-日本三馆重跑-20261026',
      R+'A9-日本诸馆C1挂接-20261026',R+'A9-日本诸馆存疑升档-20261101',R+'A9续-京大贵重挂接-20261026',R+'A7-NDL丛书合刻-20261026',R+'A7-NDL新书建条-20261026',
      R+'C3-KORCIS挂接-20261026',R+'C3-臺灣國圖-20261026',R+'C3续-臺灣國圖存疑與越南漢喃挂接-20261026',R+'C3韩越续-KORCIS存疑與越南余量-20261026',R+'U2e-Book层资源核对与写入-20261101',
      M+'a2-日本三馆',M+'a9-日本诸馆',M+'waseda-a4',M+'kokusho-cy',M+'a7-资源挂接']
W=re.compile(r'd59f[0-9a-z]{8}')
def scan():
    files=[]
    for d in DIRS:
        for ext in ('tsv','jsonl','txt'):
            files+=glob.glob(d+'/**/*.'+ext,recursive=True)
    return [f for f in files if os.path.getsize(f)<8e6 and 'matches_main' not in f and 'raw' not in f]
def seen_map(rids, files):
    seen=collections.defaultdict(lambda:{'cands':set(),'files':set(),'dedup':False,'lack':False})
    for f in files:
        base=os.path.basename(f)
        try: txt=open(f,encoding='utf-8',errors='ignore').read()
        except: continue
        for line in txt.split('\n'):
            if not line: continue
            fields=re.split(r'\t|,|"',line)
            hit=[x.strip() for x in fields if x.strip() in rids]
            if not hit: continue
            cs=set(W.findall(line))
            for h in hit:
                s=seen[h]; s['cands']|=cs; s['files'].add(base)
                if '交去重' in base or 'DUP_WORK' in line: s['dedup']=True
                if '漏著者' in line or '漏著' in line: s['lack']=True
    return seen
if __name__=='__main__':
    srcs=sys.argv[1:]
    files=scan(); print(len(files),'files')
    ALL={}
    for src in srcs: ALL[src]=list(csv.DictReader(open(f'/tmp/claude-0/run/{src}/matches.tsv'),delimiter='\t'))
    allr=set()
    for v in ALL.values(): allr.update(r['source_record_id'] for r in v)
    SEEN=seen_map(allr,files); print('scanned',flush=True)
    for src in srcs:
        rows=ALL[src]
        seen=SEEN
        c=collections.Counter(); pool=[]
        for r in rows:
            if r['tier']=='无': continue
            if r['has_image']!='1': c['无影像']+=1; continue
            if r['already_linked']=='1' or r['excluded']: c['已挂排除']+=1; continue
            cands=[x for x in r['candidates'].split(',') if x]
            s=seen.get(r['source_record_id'])
            codes=set(r['reason_codes'].split(';'))
            if s is None: why='新(未见)'
            elif set(cands)-s['cands'] : why='候选变'
            elif s['dedup'] and not (codes&{'GROUP_SPLIT','DUP_WORK_SUSPECT'}): why='交去重回流'
            elif s['lack']: why='曾漏著者'
            elif r['tier']=='确定' and r['source_record_id'] and not any(('写' in f or 'write' in f or '终' in f or '最终' in f or 'final' in f) for f in s['files']): why='确定档未见写入'
            else: c['旧判未变']+=1; continue
            c[r['tier']+':'+why]+=1
            pool.append((r,why))
        print(src,len(rows),dict(c),flush=True)
        with open(f'/tmp/claude-0/delta/pool_{src}.tsv','w') as f:
            w=csv.writer(f,delimiter='\t',lineterminator='\n'); w.writerow(['source_record_id','tier','why','reason_codes','candidates','lib_title','lib_author'])
            for r,why in pool: w.writerow([r['source_record_id'],r['tier'],why,r['reason_codes'],r['candidates'],r['lib_title'],r['lib_author']])
