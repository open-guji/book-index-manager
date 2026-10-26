"""N 判二次核：不论作者，题名核心互相包含（≥3 字）或别名命中的现库 Work 全列出来，人再看。"""
import sys, os, csv, re, pickle
S = os.path.abspath(sys.argv[1])
ME = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'match_engine')
sys.path.insert(0, ME); os.chdir(ME)
import workindex, roots
from normalize import norm_title
from titleparse import split_title
rev = {r['idx']: r for r in csv.DictReader(open(f'{S}/review.tsv'), delimiter='\t')}
ver = dict(l.split() for l in open(f'{S}/verdicts.txt'))
PK = f'{S}/works.pkl'
if os.path.exists(PK):
    W = pickle.load(open(PK, 'rb'))
else:
    works, _ = workindex.load_works(roots.book_index())
    W = []
    for w in works:
        ts = [w.get('title') or ''] + [a if isinstance(a, str) else (a.get('name') or a.get('title') or '') for a in (w.get('additional_titles') or []) + ([w['original_title']] if w.get('original_title') else [])]
        au = '/'.join((a.get('name') or '') for a in w.get('authors') or [])
        W.append((w['id'], w.get('title') or '', au, {norm_title(t) for t in ts if t}))
    pickle.dump(W, open(PK, 'wb'))
PREFIX = re.compile(r'^(新刊|新刻|新鐫|新編|重刊|重刻|重編|重校|增訂|增補|增注|校正|御製|欽定|皇明|大明|皇清|大清|國朝|明|清|宋)')
SUF = re.compile(r'(全集|文集|詩集|集|稿|藳|鈔|抄|錄|一卷|二卷)$')
def cores(t):
    t = norm_title(split_title(t)[0] if isinstance(split_title(t), tuple) else t)
    out = {t}
    t2 = PREFIX.sub('', t); out.add(t2)
    t3 = SUF.sub('', t2); out.add(t3)
    return {c for c in out if len(c) >= 3}
o = open(f'{S}/recheck-n.tsv', 'w')
for i, v in ver.items():
    r = rev[i]
    if v != 'N': continue
    cs = cores(re.split(r'\s{2,}|　', r['lib_title'])[0])
    hits = []
    for wid, t, au, nts in W:
        for nt in nts:
            if any(c == nt or (len(c) >= 3 and c in nt and len(nt) <= len(c) + 8) or (len(nt) >= 3 and nt in c and len(nt) >= len(c) - 2) for c in cs):
                hits.append(f'{wid} {t}（{au}）'); break
        if len(hits) > 8: break
    o.write('\t'.join([i, r['src'], r['lib_title'], r['lib_author'], str(len(hits)), ' ‖ '.join(hits)]) + '\n')
print('done')
