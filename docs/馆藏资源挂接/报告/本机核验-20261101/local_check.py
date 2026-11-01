#!/usr/bin/env python3
"""本机链接核验（只读，不下载影像）。用法：
  python -I local_check.py IN.tsv OUT.tsv [--interval 2.5] [--manifest]
规矩同 link_audit：同 host 相邻请求 >= 2 秒（低于 2 退出）；不同 host 并行；不登录、不绕反爬；
429/403 等一律记 blocked，不判死；只有 404/410 记 gone。--manifest 同时核 iiif_manifest（应为 JSON 且含 items/sequences）。
断点：OUT.tsv 已有的 (record_id,which) 跳过。"""
import sys, csv, json, time, ssl, argparse, threading, urllib.request, urllib.error, urllib.parse, collections
sys.stdout.reconfigure(encoding='utf8')
ap = argparse.ArgumentParser(); ap.add_argument('inp'); ap.add_argument('out')
ap.add_argument('--interval', type=float, default=2.5); ap.add_argument('--manifest', action='store_true')
a = ap.parse_args()
if a.interval < 2.0: sys.exit('interval < 2.0 不允许')
UA = 'open-guji-link-audit/1.0 (read-only link check; user machine; contact: sheldonli-babelstacks)'
ctx = ssl.create_default_context()
if hasattr(ssl, 'VERIFY_X509_STRICT'): ctx.verify_flags &= ~ssl.VERIFY_X509_STRICT

def q(u):
    p = urllib.parse.urlsplit(u)
    return urllib.parse.urlunsplit((p.scheme, p.netloc.encode('idna').decode(),
        urllib.parse.quote(p.path, safe="/%:@!$&'()*+,;=~-._"), urllib.parse.quote(p.query, safe="=&%:/?@!$'()*+,;~-._"), ''))

def fetch(u):
    req = urllib.request.Request(q(u), headers={'User-Agent': UA, 'Accept': '*/*'})
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
            return r.status, r.geturl(), r.read(400000)
    except urllib.error.HTTPError as e:
        return e.code, u, b''
    except Exception as e:
        return None, u, repr(e)[:80].encode()

def cls(code):
    if code is None: return 'neterr'
    if 200 <= code < 300: return 'ok'
    if code in (404, 410): return 'gone'
    if code in (401, 403, 429, 451, 502, 503, 504, 408): return 'blocked'
    return 'error'

rows = list(csv.DictReader(open(a.inp, encoding='utf8'), delimiter='\t'))
done = set()
try:
    for r in csv.DictReader(open(a.out, encoding='utf8'), delimiter='\t'): done.add((r['record_id'], r['which']))
except FileNotFoundError: pass
H = ['batch', 'source', 'record_id', 'work_id', 'which', 'url', 'code', 'cls', 'final_url', 'bytes', 'has_id', 'note']
lock = threading.Lock()
fresh = not done
fo = open(a.out, 'a', encoding='utf8', newline='')
if fresh: fo.write('\t'.join(H) + '\n')
hosts = collections.defaultdict(list)
for r in rows:
    for which, key in (('page', 'url'), ('manifest', 'iiif_manifest')):
        if which == 'manifest' and not (a.manifest and r[key]): continue
        if (r['record_id'], which) in done: continue
        hosts[urllib.parse.urlsplit(r[key]).netloc].append((r, which, r[key]))

def worker(items):
    for r, which, u in items:
        code, fu, body = fetch(u); c = cls(code)
        note = ''
        if which == 'manifest' and c == 'ok':
            try: j = json.loads(body); note = 'json-ok' if ('items' in j or 'sequences' in j) else 'json-no-items'
            except Exception: note = 'not-json'
        rid = r['record_id'].split('-')[-1]
        has = '' if not isinstance(body, bytes) or c != 'ok' else str(rid.encode() in body or rid.replace('_', '.').encode() in body)
        if code is None: note = body.decode('utf8', 'replace')
        with lock:
            fo.write('\t'.join(str(x) for x in [r['batch'], r['source'], r['record_id'], r['work_id'], which, u, code, c, fu if fu != u else '', len(body) if code else 0, has, note]) + '\n'); fo.flush()
        time.sleep(a.interval)

ts = [threading.Thread(target=worker, args=(v,)) for v in hosts.values()]
[t.start() for t in ts]; [t.join() for t in ts]
fo.close()
c = collections.Counter()
for r in csv.DictReader(open(a.out, encoding='utf8'), delimiter='\t'): c[(r['source'], r['which'], r['cls'])] += 1
for k, v in sorted(c.items()): print(k, v)
