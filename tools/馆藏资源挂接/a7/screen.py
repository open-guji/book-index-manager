"""A7 缺 Work 复核：引擎「无」档且未挂 → 对现库查同作者近题／近题，分档。"""
import sys, os, csv, json, re, collections, pickle
ME = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'match_engine')
_S = os.path.abspath(sys.argv[1])
sys.path.insert(0, ME); os.chdir(ME)
import roots
import era, tier, workindex, importlib
from normalize import norm_title
from titleparse import PREF
S = _S; BI = roots.book_index(); DATA = roots.library_data()
era.load_keys(None, os.path.join(roots.overview(), '项目进展/朝代年号录入/政权映射.tsv'))
works, _ = workindex.load_works(BI)
ids = {a['entity_id'] for w in works for a in w.get('authors') or [] if a.get('entity_id')}
ents = workindex.load_entities(BI, ids)
pol = tier.Policy()
STRIP = re.compile(r'(先生|文集|詩集|诗集|全集|遺稿|遗稿|遺集|遗集|集|稿|槁|文|詩|诗|草|錄|录|鈔|钞|抄|編|编|書|书|记|記|志|考|說|说|論|论)$')
def bg(s): return {s[i:i+2] for i in range(len(s)-1)} if len(s) > 1 else {s}
def dice(a, b):
    A, B = bg(a), bg(b)
    return 2 * len(A & B) / (len(A) + len(B)) if A and B else 0
ROLEX = re.compile(r'(重辑|重编|采录|选录|填词|制曲|类注|校注|编辑|编次|编译|纂辑|评选|评点|藏|奏|修|选|辑|编|撰|著|注|述|录|订|校|鉴定)+$')
GAZ = re.compile(r'[志誌]\s+(洪武|永乐|永樂|宣德|正统|正統|景泰|天顺|天順|成化|弘治|正德|嘉靖|隆庆|隆慶|万历|萬曆|天启|天啟|崇祯|崇禎|顺治|順治|康熙|雍正|乾隆|嘉庆|嘉慶|道光|咸丰|咸豐|同治|光绪|光緒|宣统|宣統)')
def authsim(A, B):
    best = 0
    for a in A:
        for b in B:
            if a and b and len(a) >= 2 and len(b) >= 2:
                best = max(best, len(set(a) & set(b)) / min(len(set(a)), len(set(b))))
    return best
def chov(q, k):
    sq, sk = STRIP.sub('', q) or q, STRIP.sub('', k) or k
    A, B = set(sq), set(sk)
    return len(A & B) / min(len(A), len(B)) * 0.8 if A and B and min(len(A), len(B)) >= 2 else 0
def sim(q, k):
    if not q or not k: return 0
    if q == k: return 1
    sq, sk = STRIP.sub('', q), STRIP.sub('', k)
    if sq and sq == sk and len(sq) >= 2: return 0.95
    sh, lo = sorted((q, k), key=len)
    if len(sh) >= 2 and sh in lo: return 0.6 + 0.4 * len(sh) / len(lo)
    return dice(q, k)
out = {}
for src in ('nlc', 'ndl'):
    prof = pol.profile(src)
    wi = workindex.WorkIndex.build(works, jp=prof.jp, entities=ents)
    bgi = collections.defaultdict(set)
    for wid, info in wi.works.items():
        for k in info['tkeys']:
            for b in bg(k): bgi[b].add(wid)
    authidx = collections.defaultdict(list)
    for wid, info in wi.works.items():
        for n in info['authors'] | info['alias']:
            authidx[n].append(wid)
    recs = {r['source_record_id']: r for r in importlib.import_module('adapters.' + src).load(DATA)}
    rows = list(csv.DictReader(open(f'{S}/eng2-{src}/matches.tsv', encoding='utf-8'), delimiter='\t'))
    res = []
    for m in rows:
        if m['tier'] != '无' or m['already_linked'] != '0':
            continue
        r = recs[m['source_record_id']]
        q = tier.prepare(r, prof)
        key = q.main_key or (q.keys[0] if q.keys else '')
        best_same, best_any = (0, None), (0, None)
        qn = {ROLEX.sub('', n) or n for n in q.names}
        for n in qn:
            for wid in authidx.get(n, ()):
                s = max(max(sim(key, k), chov(key, k)) for k in wi.works[wid]['tkeys'])
                if s > best_same[0]: best_same = (s, wid)
        cand = collections.Counter()
        for b in bg(key): 
            for wid in bgi.get(b, ()): cand[wid] += 1
        for wid, _ in cand.most_common(1500):
            s = max(sim(key, k) for k in wi.works[wid]['tkeys'])
            if s > best_any[0]: best_any = (s, wid)
            if s >= 0.3 and authsim(qn, wi.works[wid]['authors'] | wi.works[wid]['alias']) >= 0.66 and s > best_same[0]:
                best_same = (s, wid)
        sa = {}
        for n in qn:
            for wid in authidx.get(n, ()):
                sa[wid] = max(max(sim(key, k), chov(key, k)) for k in wi.works[wid]['tkeys'])
        for wid, _ in cand.most_common(1500):
            if authsim(qn, wi.works[wid]['authors'] | wi.works[wid]['alias']) >= 0.66:
                sa[wid] = max(sa.get(wid, 0), max(sim(key, k) for k in wi.works[wid]['tkeys']))
        top3 = sorted(sa.items(), key=lambda x: -x[1])[:3]
        def fmt(wid, sc):
            w = wi.works[wid]; j = w['juan']
            return f"{wid} {w['title']}{'['+str(j)+'卷]' if j else ''}（{'/'.join(sorted(w['authors']))[:16]}）{sc:.2f}"
        same_top3 = ' ‖ '.join(fmt(*x) for x in top3 if x[1] >= 0.2)
        def show(x):
            if not x[1]: return ''
            w = wi.works[x[1]]; return f"{x[1]} {w['title']}（{'/'.join(sorted(w['authors']))[:16]}）{x[0]:.2f}"
        wa = wi.works[best_any[1]]['authors'] if best_any[1] else set()
        if not key:
            cls = 'X 题名空'
        elif q.is_coll or q.is_multi:
            cls = 'L 丛书合刻'
        elif GAZ.search(r['title_raw'] or ''):
            cls = 'G 方志带纂修年号'
        elif best_same[0] >= 0.3:
            cls = 'K 同作者近题'
        elif best_any[0] >= 0.75 and (not q.names or not wa):
            cls = 'H 近题一方无作者'
        elif best_any[0] >= 0.75:
            cls = 'D 近题异作者'
        elif not q.names:
            cls = 'N 无责任者'
        else:
            cls = 'C 可建'
        res.append(dict(source=src, rid=m['source_record_id'], cls=cls, key=key, names='|'.join(sorted(q.names)), a_era=q.a_era, juan=q.juan,
                        lib_title=m['lib_title'], lib_author=m['lib_author'], lib_version=m['lib_version'], has_image=m['has_image'],
                        same=show(best_same), near=show(best_any), same_wid=best_same[1] or '', same_top3=same_top3,
                        same_key=max(wi.works[best_same[1]]['tkeys'], key=lambda k: sim(key, k)) if best_same[1] else '',
                        same_auth_exact=int(bool(best_same[1] and qn & (wi.works[best_same[1]]['authors'] | wi.works[best_same[1]]['alias']))),
                        n_same_auth_hits=sum(1 for n in qn for wid in authidx.get(n, ()) if max(sim(key, k) for k in wi.works[wid]['tkeys']) >= 0.6), url=m['url'], image_url=m['image_url'], codes=m['reason_codes']))
    out[src] = res
    print(src, collections.Counter(x['cls'] for x in res))
with open(f'{S}/screen.tsv', 'w', encoding='utf-8', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(out['nlc'][0]), delimiter='\t'); w.writeheader()
    for src in out: w.writerows(out[src])
