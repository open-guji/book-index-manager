import json, time, urllib.request, ssl, re, sys
S = json.load(open('linksample.json'))
ctx = ssl.create_default_context(cafile='/root/.ccr/ca-bundle.crt')
out = []
for src, rid, url in S:
    key = rid
    if src == 'bnf':
        key = url.rsplit('/', 1)[-1]
    if src == 'onb':
        key = url.rsplit('/', 1)[-1].replace('%2B', '+')
    st, ok, n = 0, False, 0
    fetch = url + '?fo=json' if src == 'loc' else url   # loc 页面对云端出 Cloudflare 质询；同一 item 的 JSON 视图判内容
    for attempt in range(3):
        try:
            req = urllib.request.Request(fetch, headers={'User-Agent': 'Mozilla/5.0 (open-guji link audit)'})
            with urllib.request.urlopen(req, timeout=40, context=ctx) as r:
                st = r.status; body = r.read().decode('utf-8', 'replace'); n = len(body)
                ok = st == 200 and (key in body or key.lstrip('+') in body) and (src != 'loc' or '"digitized": true' in body)
            break
        except urllib.error.HTTPError as e:
            st = e.code
            if e.code == 429: time.sleep(20); continue
            break
        except Exception as e:
            st = repr(e)[:60]; time.sleep(3)
    out.append(dict(source=src, record_id=rid, url=url, status=st, bytes=n, id_in_page=ok))
    print(src, rid, st, n, ok, flush=True)
    time.sleep(2.5 if src == 'loc' else 1)
json.dump(out, open('linkcheck_out.json', 'w'), ensure_ascii=False, indent=0)
