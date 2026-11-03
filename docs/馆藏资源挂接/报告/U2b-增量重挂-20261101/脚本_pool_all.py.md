import json,csv,sys,collections
csv.field_size_limit(10**9)
sys.argv=['x']
import delta
files=delta.scan()
srcs='kokusho ndl naikaku waseda utokyo ioc shoryobu keio arc nagoya kyoto ncltw nlc'.split()
bad=set(open('/mnt/project-files/a2-日本三馆/A2已判有疑Work.txt').read().split())|{'d59f6ekqiww8'}
ALL={s:list(csv.DictReader(open(f'/tmp/claude-0/run/{s}/matches.tsv'),delimiter='\t')) for s in srcs}
plans={s:{p['record_id']:p for p in map(json.loads,open(f'/tmp/claude-0/run/{s}/write_plan.jsonl'))} for s in srcs}
allr={r['source_record_id'] for v in ALL.values() for r in v if r['tier']!='无'}
seen=delta.seen_map(allr,files)
pool=[];cnt=collections.Counter()
for s in srcs:
    for r in ALL[s]:
        t=r['tier']
        if t=='无' or r['has_image']!='1' or r['already_linked']=='1' or r['excluded']: continue
        rid=r['source_record_id']; cands=[x for x in r['candidates'].split(',') if x]; codes=set(r['reason_codes'].split(';'))
        sn=seen.get(rid)
        inplan = rid in plans[s]
        if s=='nlc' and t=='存疑': continue   # 国图存疑归 U2a
        if t=='确定' and not inplan: continue  # 确定未入写计划＝K9满/合刻等，引擎已闸
        # why changed
        if sn is None: why='未见'
        elif set(cands)-sn['cands']: why='候选变'
        elif sn['dedup'] and not (codes&{'GROUP_SPLIT','DUP_WORK_SUSPECT'}): why='交去重回流'
        elif sn['lack']: why='曾漏著者'
        elif s in('utokyo','ioc','shoryobu','keio','arc','nagoya','kyoto') and t=='存疑' and len(cands)>1: why='A9多候选'
        else: continue
        # prefilters (存疑)
        if t=='存疑':
            if not r['lib_author'].strip(): cnt[(s,'无责任者')]+=1; continue
            if codes&{'GROUP_SPLIT','DUP_WORK_SUSPECT'}: cnt[(s,'仍疑重复')]+=1; continue
            if any(x in bad for x in cands): cnt[(s,'A2有疑Work')]+=1; continue
            if not cands: continue
            if len(cands)>1:
                ar=json.loads(r['evidence']).get('author_rel') or []
                good=[i for i,a in enumerate(ar) if a in('eq','alias')]
                if len(good)!=1: cnt[(s,'多候选无唯一合')]+=1; continue
        if t=='存疑' and why=='曾漏著者':
            ar=json.loads(r['evidence']).get('author_rel') or []
            if not any(a in('eq','alias') for a in ar[:len(cands)]): cnt[(s,'曾漏著者仍不合')]+=1; continue
        pool.append((s,rid,t,why))
c=collections.Counter((s,t,w) for s,_,t,w in pool)
for k,v in sorted(c.items()): print(k,v)
print(len(pool)); print(sorted(cnt.items()))
json.dump(pool,open('pool_all.json','w'),ensure_ascii=False)
