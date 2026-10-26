"""对 KORCIS rec_key 取国中自馆控制号与互联网公开状态 → _kol.json（可断点续跑）。"""
import json, re, sys, time, os, urllib.request, concurrent.futures as cf
out = sys.argv[2]; keys = [l.strip() for l in open(sys.argv[1]) if l.strip()]
res = json.load(open(out)) if os.path.exists(out) else {}
def get(u):
    for i in range(4):
        try: return urllib.request.urlopen(u, timeout=90).read().decode('utf8', 'replace')
        except Exception as e: err = e; time.sleep(3 * (i + 1))
    raise err
def one(k):
    x = get(f'https://www.nl.go.kr/korcis/openapi/detail.do?rec_key={k}')
    kol = (re.findall(r'<LOCAL_CONTROL_NO>([^<]*)<', x) or [''])[0].strip()
    holds = re.findall(r'<HOLDINFO>(.*?)</HOLDINFO>', x, re.S)
    call = ''; 
    for h in holds:
        if '<ORIGINAL_YN>Y' in h:
            call = (re.findall(r'<CALL_NO>([^<]*)<', h) or [''])[0].strip(); break
    d = dict(kol=kol, call_no=call, public=False, uses=[])
    if kol:
        h = get('https://www.nl.go.kr/NL/contents/search.do?srchTarget=total&kwd=' + kol)
        t = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', h))
        uses = re.findall(r'자료이용 : (\[[^\]]*\])', t)
        d['uses'] = sorted(set(uses)); d['hits'] = t.count(kol)
        d['public'] = any('관외이용' in u for u in uses)
    return k, d
todo = [k for k in keys if k not in res]
with cf.ThreadPoolExecutor(3) as ex:
    for i, (k, d) in enumerate(ex.map(one, todo)):
        res[k] = d
        if i % 50 == 0:
            json.dump(res, open(out, 'w'), ensure_ascii=False); print(i, len(todo), flush=True)
json.dump(res, open(out, 'w'), ensure_ascii=False); print('done', len(res))
