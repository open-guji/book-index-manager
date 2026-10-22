#!/usr/bin/env python3
"""馆藏资源挂接 R4：全库 resources 链接巡检（只读，不写库）。
用法（在 book-index 仓根）：
  python3 -I <本脚本> --out DIR [--sample-frac HOST=0.1 ...] [--hosts h1,h2] [--limit N] [--min-interval 2.0]
产物（DIR 下）：results.jsonl（断点，每条 url 一行）｜死链表.tsv｜统计.tsv｜请求间隔自检.txt
规矩：同一 host 相邻请求间隔 >= 2.0s（低于 2 直接退出）；不同 host 并行；429/403/超时/DNS 一律不判死，
只有 404/410（或 API 返回 missing）且隔开后二次确认才记 dead；无凭据、无登录、不下载影像。"""
import datetime, http.cookiejar, re, os, sys, json, time, random, argparse, threading, collections, urllib.parse, urllib.request, urllib.error, socket, ssl

UA = 'open-guji-link-audit/1.0 (read-only link check; contact: ai-team R4 Reid)'
HARD_MIN = 2.0
CRASHED = []


class HostLimiter:
    """每 host 一把锁：保证相邻请求发出时刻间隔 >= interval，并记录实际间隔供自检。"""
    def __init__(self, interval, clock=time.monotonic, sleep=time.sleep):
        self.interval, self.clock, self.sleep = interval, clock, sleep
        self.last = None; self.min_gap = None; self.n = 0; self.lock = threading.Lock()

    def wait(self):
        with self.lock:
            now = self.clock()
            if self.last is not None:
                need = self.last + self.interval - now
                if need > 0:
                    self.sleep(need); now = self.clock()
                gap = now - self.last
                self.min_gap = gap if self.min_gap is None else min(self.min_gap, gap)
            self.last = now; self.n += 1


def quote_url(u):
    """非 ASCII 路径/查询转义（原 wikisource 7 条 UnicodeEncodeError 的根因）；已转义的 % 保持不动。"""
    p = urllib.parse.urlsplit(u)
    return urllib.parse.urlunsplit((p.scheme, p.netloc.encode('idna').decode(),
        urllib.parse.quote(p.path, safe="/%:@!$&'()*+,;=~-._"),
        urllib.parse.quote(p.query, safe="=&%:/?@!$'()*+,;~-._"), ''))


def classify_status(code):
    if 200 <= code < 300: return 'ok'
    if 300 <= code < 400: return 'redirect'
    if code in (404, 410): return 'gone'          # 待二次确认才记 dead
    if code in (429, 403, 401, 451, 503, 502, 504, 408): return 'blocked'
    return 'error'


def http_probe(url, lim, timeout=25):
    """HEAD，不行再 GET 首字节。返回 (code|None, final_url, note)。每次实际请求前都过限速器。"""
    for method in ('HEAD', 'GET'):
        lim.wait()
        req = urllib.request.Request(quote_url(url), method=method, headers={'User-Agent': UA, **({'Range': 'bytes=0-0'} if method == 'GET' else {})})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, r.geturl(), method
        except urllib.error.HTTPError as e:
            if method == 'HEAD' and e.code in (400, 403, 405, 501): continue
            return e.code, url, method
        except (urllib.error.URLError, socket.timeout, ssl.SSLError, ConnectionError, OSError) as e:
            if method == 'HEAD': continue
            return None, url, '%s:%s' % (type(e).__name__, str(e)[:80])
    return None, url, 'unreachable'



UNJUDGED_HOSTS = {}   # 识典已有判据（headless 浏览器渲染后看落点），见 judge_shidianguji
NLC_MIN_BODY = 3000          # 实测：真条目 31249B，不存在 fid 798B（2026-10-15）
NPM_NOHIT = '沒有查詢結果'
NPM_LANDING = '古籍輿圖檢索系統-首頁'


def fetch_body(url, opener, lim, timeout=30, maxbytes=400000):
    """GET 并返回 (code, final_url, body_text)；HTTPError 也带回状态码；网络错 code=None。"""
    lim.wait()
    req = urllib.request.Request(quote_url(url), headers={'User-Agent': UA})
    try:
        with opener.open(req, timeout=timeout) as r:
            return r.status, r.geturl(), r.read(maxbytes).decode('utf-8', 'ignore')
    except urllib.error.HTTPError as e:
        return e.code, url, ''
    except Exception as e:
        return None, url, '%s:%s' % (type(e).__name__, str(e)[:80])


def judge_nlc(code, final, body):
    if code is None: return 'error', body
    if code != 200: return classify_status(code), 'HTTP %d' % code
    return ('gone', '页面仅 %dB（空壳，真条目约 31KB）' % len(body)) if len(body) < NLC_MIN_BODY else ('ok', '页面 %dB' % len(body))


SDG_MIN_BODY = 300          # 实测（2026-10-16）：真书 /book/SK0389 渲染后跳 /chapter/…，正文 844 字；假 id 跳 /?page_from=404_page，正文 8347 字（首页）


def judge_shidianguji(code, final, body):
    """识典是 SPA，HTTP 状态/壳页字节不可信；必须用渲染后的落点：假书→跳 `page_from=404_page`；
    真书→停在 /book/<id>/chapter/…且正文≥SDG_MIN_BODY。其余（壳未载入、已登录墙等）= unknown，不判死。
    调用方的 fetch 必须是 headless 浏览器渲染后返回 (200, 最终 URL, 页面可见文字)。"""
    if code is None: return 'error', body
    if code != 200: return classify_status(code), 'HTTP %d' % code
    if 'page_from=404_page' in (final or ''): return 'gone', '识典跳 404 页（%s）' % final
    if re.search(r'/book/[^/?#]+/chapter/', final or '') and len(body or '') >= SDG_MIN_BODY:
        return 'ok', '渲染后停于章节页，正文 %d 字' % len(body)
    return 'error', '壳未载入或落点不明（%s，正文 %d 字）' % (final, len(body or ''))


def browser_fetch_factory(lim, ua='open-guji-link-audit/1.0 (read-only check; ai-team R4)'):
    """返回 (fetch, close)。fetch(url)->(200|None, final_url, 可见文字)；用 Playwright/Chromium，可选依赖；每次先过限速器。"""
    from playwright.sync_api import sync_playwright
    import os
    pw = sync_playwright().start()
    exe = os.environ.get('CHROMIUM_PATH') or None
    br = pw.chromium.launch(headless=True, args=['--no-sandbox'], **({'executable_path': exe} if exe else {}))
    ctx = br.new_context(user_agent=ua, locale='zh-CN')

    def fetch(url):
        lim.wait(); pg = ctx.new_page()
        try:
            pg.goto(url, wait_until='domcontentloaded', timeout=60000)
            try: pg.wait_for_url(re.compile(r'(/chapter/|404_page)'), timeout=20000)
            except Exception: pass
            try: pg.wait_for_load_state('networkidle', timeout=30000)
            except Exception: pass
            pg.wait_for_timeout(2000)
            return 200, pg.url, pg.inner_text('body')
        except Exception as e:
            return None, url, '%s:%s' % (type(e).__name__, str(e)[:80])
        finally: pg.close()

    def close():
        br.close(); pw.stop()
    return fetch, close


def judge_npm(code, final, body):
    if code is None: return 'error', body
    if code != 200: return classify_status(code), 'HTTP %d' % code
    if 'Landing' in final or NPM_LANDING in body: return 'blocked', '被跳回首页（会话失效），不判死'
    return ('gone', '页面含「沒有查詢結果」') if NPM_NOHIT in body else ('ok', '命中结果页 %dB' % len(body))


def judge_ndl(url, lim):
    m = re.search(r'/pid/(\d+)', url)
    if not m: return None
    code, _, body = fetch_body('https://dl.ndl.go.jp/api/item/search/info:ndljp/pid/' + m.group(1), urllib.request.build_opener(), lim)
    if code is None: return 'error', body
    return classify_status(code), 'ndl API HTTP %d' % code


def kokusho_api(url):
    m = re.search(r'/biblio/(\d+)', url)
    return 'https://kokusho.nijl.ac.jp/api/biblioDetail/' + m.group(1) if m else None


def judge_kokusho(url, lim):
    """Remy 找到的接口（2026-10-15 我复测）：真 bid → 200 JSON（含 bid），不存在 → 404 HTML。"""
    api = kokusho_api(url)
    if not api: return 'error', 'url 无 /biblio/<数字>'
    code, _, body = fetch_body(api, urllib.request.build_opener(), lim)
    if code is None: return 'error', body
    if code == 200: return ('ok', 'kokusho API 200') if body.lstrip().startswith('{') else ('error', 'API 200 但非 JSON')
    return classify_status(code), 'kokusho API HTTP %d' % code


def wiki_title(url):
    p = urllib.parse.urlsplit(url)
    if p.path.startswith('/wiki/'): return urllib.parse.unquote(p.path[6:]).replace('_', ' ')
    q = urllib.parse.parse_qs(p.query)
    if p.path.endswith('index.php') and 'title' in q: return q['title'][0].replace('_', ' ')
    return None


def wiki_batch(host, urls, lim, timeout=30, backoff=(30, 60, 120), sleep=time.sleep, on_chunk=None):
    """MediaWiki API 一次最多 50 个标题。返回 {url: (verdict, note)}，verdict ok|missing|unknown。"""
    out = {}; titles = {}
    for u in urls:
        t = wiki_title(u)
        if t: titles.setdefault(t, []).append(u)
        else: out[u] = ('unknown', '非 /wiki/ 形式，走通用探测')
    keys = list(titles)
    for i in range(0, len(keys), 50):
        chunk = keys[i:i + 50]
        qs = urllib.parse.urlencode({'action': 'query', 'format': 'json', 'redirects': 1, 'titles': '|'.join(chunk)})
        req = urllib.request.Request('https://%s/w/api.php' % host, data=qs.encode('ascii'), headers={'User-Agent': UA})   # POST：50 个 CJK 标题编码后会超 GET 的 URL 长度（414）
        j = None; note = ''; retry_after = 0
        for wait in (0,) + tuple(backoff):
            if wait: sleep(max(wait, retry_after))
            lim.wait()
            try:
                with urllib.request.urlopen(req, timeout=timeout) as r: j = json.load(r)
                break
            except urllib.error.HTTPError as e:
                note = 'API HTTP %d' % e.code
                try: ra = int(e.headers.get('Retry-After', 0))
                except Exception: ra = 0
                retry_after = max(retry_after, min(ra, 300))
                if e.code not in (429, 403, 503, 502, 504): break
            except Exception as e:
                note = 'API 失败:%s' % type(e).__name__
        if j is None:
            v = 'blocked' if '429' in note or '403' in note or '503' in note else 'unknown'
            for t in chunk:
                for u in titles[t]: out[u] = (v, note)
            if on_chunk: on_chunk({u: out[u] for t in chunk for u in titles[t]})
            continue
        q = j.get('query', {})
        norm = {n['from']: n['to'] for n in q.get('normalized', [])}
        redir = {n['from']: n['to'] for n in q.get('redirects', [])}
        missing = {pg['title'] for pg in q.get('pages', {}).values() if 'missing' in pg or 'invalid' in pg}
        for t in chunk:
            f = norm.get(t, t); f = redir.get(f, f)
            for u in titles[t]: out[u] = ('missing', 'API missing') if f in missing else ('ok', 'API exists')
        if on_chunk: on_chunk({u: out[u] for t in chunk for u in titles[t]})
    return out


def collect(root='.'):
    """同 health_check.py 口径：遍历 Work/Book，跳过 merged_into；返回 {url: [(file,res_index,res_id,types)]}。"""
    byurl = collections.OrderedDict()
    for fam in ('Work', 'Book'):
        for d, _, fs in sorted(os.walk(os.path.join(root, fam))):
            for f in sorted(fs):
                if not f.endswith('.json'): continue
                p = os.path.join(d, f)
                try: j = json.load(open(p, encoding='utf-8'))
                except Exception: continue
                if j.get('merged_into'): continue
                for i, r in enumerate(j.get('resources') or []):
                    u = r.get('url')
                    if u: byurl.setdefault(u, []).append((os.path.relpath(p, root), i, r.get('id') or '', ','.join(r.get('types') or [])))
    return byurl


def stratified_sample(byurl, host, frac, seed=20261015):
    # seed 固定可复现；--monitor 模式按 ISO 周换种子，每周抽到不同的 5%
    """host×类型 分层抽样：每层按 frac 取（至少 1 条），固定种子可复现。"""
    rnd = random.Random(seed); strata = collections.defaultdict(list)
    for u, locs in byurl.items():
        if urllib.parse.urlsplit(u).netloc == host: strata[locs[0][3]].append(u)
    pick = []
    for k in sorted(strata):
        v = sorted(strata[k]); n = max(1, round(len(v) * frac)); pick += rnd.sample(v, min(n, len(v)))
    return pick


def load_done(path):
    done = {}
    if os.path.exists(path):
        for line in open(path, encoding='utf-8'):
            try: r = json.loads(line); done[r['url']] = r
            except Exception: pass
    return done


CLOSERS = []      # 浏览器等需关闭的资源


def probe_host(host, urls, interval, done, outf, outlock, stats_lim, backoff=(30, 60, 120), sleep=time.sleep):
    try:
        _probe_host(host, urls, interval, done, outf, outlock, stats_lim, backoff, sleep)
    except Exception as e:                     # 线程崩溃必须可见，不能静默少测一整个 host
        import traceback; traceback.print_exc()
        with outlock: outf.write(json.dumps({'url': host + '#崩溃', 'host': host, 'verdict': 'error', 'code': None, 'note': repr(e)[:200], 'final': '', 'ts': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}, ensure_ascii=False) + '\n')
        CRASHED.append(host)
    finally:
        while CLOSERS:
            try: CLOSERS.pop()()
            except Exception: pass


def _probe_host(host, urls, interval, done, outf, outlock, stats_lim, backoff, sleep):
    lim = HostLimiter(interval); stats_lim[host] = lim
    todo = [u for u in urls if u not in done]
    def emit(u, verdict, code, note, final=''):
        rec = {'url': u, 'host': host, 'verdict': verdict, 'code': code, 'note': note, 'final': final if final != u else '', 'ts': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
        with outlock: outf.write(json.dumps(rec, ensure_ascii=False) + '\n'); outf.flush()
    if host in ('commons.wikimedia.org', 'zh.wikisource.org', 'zh.wikipedia.org'):
        def flush(chunk_res):                      # 每批 50 条立即落盘：可见进度、可断点续跑
            for u, (v, n) in chunk_res.items():
                if v == 'unknown' and n.startswith('非'): continue
                if v == 'missing': emit(u, 'gone', None, n)      # 二次确认见 confirm_gone()
                else: emit(u, {'ok': 'ok', 'blocked': 'blocked'}.get(v, 'error'), None, n)
        res = wiki_batch(host, todo, lim, on_chunk=flush)
        rest = [u for u in todo if res[u][0] == 'unknown' and res[u][1].startswith('非')]
        todo = rest
    consecutive_429 = 0
    opener = None
    if host == 'rarebooks-maps.npm.edu.tw':        # 必须带会话 cookie，否则任何 search url 都跳首页
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        fetch_body('https://rarebooks-maps.npm.edu.tw/index.php', opener, lim)
    if host in UNJUDGED_HOSTS:
        for u in todo: emit(u, 'unjudged', None, UNJUDGED_HOSTS[host])
        return
    bfetch = bclose = None
    if host == 'www.shidianguji.com':
        bfetch, bclose = browser_fetch_factory(lim); CLOSERS.append(bclose)
    def judge(u):
        if bfetch: c, f, b = bfetch(u); return judge_shidianguji(c, f, b)
        if host == 'read.nlc.cn': c, f, b = fetch_body(u, urllib.request.build_opener(), lim); return judge_nlc(c, f, b)
        if host == 'rarebooks-maps.npm.edu.tw':
            c, f, b = fetch_body(u, opener, lim)
            v, n = judge_npm(c, f, b)
            if v == 'blocked':                           # 会话失效：重建 cookie 再试一次
                fetch_body('https://rarebooks-maps.npm.edu.tw/index.php', opener, lim); c, f, b = fetch_body(u, opener, lim); v, n = judge_npm(c, f, b)
            return v, n
        if host == 'dl.ndl.go.jp': return judge_ndl(u, lim)
        if host == 'kokusho.nijl.ac.jp': return judge_kokusho(u, lim)
        if host in STATUS_HOSTS: c, f, b = fetch_body(u, urllib.request.build_opener(), lim); return judge_status(c, f, b)
        return None
    for u in todo:
        j = judge(u)
        if j:
            v, note = j
            tries = 0
            while v in ('blocked', 'error') and tries < len(backoff):
                sleep(backoff[tries] if v == 'blocked' else (5, 10, 20)[tries % 3]); tries += 1; v, note = judge(u)   # npm 常见偶发 Connection reset
            consecutive_429 = consecutive_429 + 1 if v == 'blocked' else 0
            emit(u, v, None, note)
            if consecutive_429 >= 10:
                emit(host + '#熔断', 'blocked', None, '连续 10 条限流/拒绝，停该 host，上报'); break
            continue
        code, final, note = http_probe(u, lim)
        v = classify_status(code) if code else 'error'
        tries = 0
        while v == 'blocked' and tries < len(backoff):
            sleep(backoff[tries]); tries += 1; code, final, note = http_probe(u, lim); v = classify_status(code) if code else 'error'
        consecutive_429 = consecutive_429 + 1 if v == 'blocked' else 0
        emit(u, v, code, note, final)
        if consecutive_429 >= 10:
            emit(host + '#熔断', 'blocked', None, '连续 10 条限流/拒绝，停该 host，上报'); break


def confirm_gone(done, interval, outf, outlock, gap=600, sleep=time.sleep):
    """gone 的隔开 gap 秒后再测一次，仍 gone 才记 dead，否则回写新结论。"""
    gone = [r for r in done.values() if r['verdict'] == 'gone' and not r.get('confirmed')]
    if not gone: return
    sleep(gap); lims = {}
    for r in gone:
        h = r['host']; lim = lims.setdefault(h, HostLimiter(interval))
        # 二次确认一律直查页面（API 不解析简繁变体重定向，会把 301 的页面误判 missing）
        h = r['host']
        if h == 'read.nlc.cn': cc, ff, bb = fetch_body(r['url'], urllib.request.build_opener(), lim); c, _ = judge_nlc(cc, ff, bb)
        elif h == 'rarebooks-maps.npm.edu.tw':
            op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())); fetch_body('https://rarebooks-maps.npm.edu.tw/index.php', op, lim)
            cc, ff, bb = fetch_body(r['url'], op, lim); c, _ = judge_npm(cc, ff, bb)
        elif h == 'dl.ndl.go.jp': c, _ = judge_ndl(r['url'], lim) or ('error', '')
        elif h == 'www.shidianguji.com':
            if 'sdg' not in lims: lims['sdg'] = browser_fetch_factory(lim)
            cc, ff, bb = lims['sdg'][0](r['url']); c, _ = judge_shidianguji(cc, ff, bb)
        else: code, _, _ = http_probe(r['url'], lim); c = classify_status(code) if code else 'error'
        nv = 'dead' if c == 'gone' else c
        rec = dict(r, verdict=nv, confirmed=True, ts=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
        with outlock: outf.write(json.dumps(rec, ensure_ascii=False) + '\n'); outf.flush()
        done[r['url']] = rec
    if 'sdg' in lims: lims['sdg'][1]()



# ---------------------------------------------------------------------------
# 对外接口（给引擎 plancheck 用，fetch 由调用方注入）：
#   judge(site, url, record_id=None, fetch=None) -> {'status': 'ok'|'dead'|'unknown', 'reason': str, 'evidence': dict}
#   fetch(url) -> (http_code|None, final_url, body_text)；调用方自己负责同 host 间隔 >= 2 秒与 UA；
#   npm 要求 fetch 带会话 cookie（持久 cookiejar）；judge 遇到被跳回首页会先 fetch 首页暖会话再重试一次。
# status 语义：dead 仅表示"单次判据命中"，调用方应隔开时间二次确认再下死链结论（本脚本 confirm_gone 即此做法）。
# 429/403/超时/连接重置一律 unknown，不判死。
SITES = {'read.nlc.cn': 'nlc', 'dl.ndl.go.jp': 'ndl', 'rarebooks-maps.npm.edu.tw': 'npm',
         'www.shidianguji.com': 'shidianguji', 'kokusho.nijl.ac.jp': 'kokusho',
         'www.wul.waseda.ac.jp': 'waseda', 'archive.wul.waseda.ac.jp': 'waseda',
         'www.digital.archives.go.jp': 'naikaku'}
STATUS_SITES = {'waseda', 'naikaku'}   # 状态码本身有判别力（Remy 各 5 对：真 200／假 404）；naikaku 仅 curl 有效，headless 浏览器被 CloudFront 403
STATUS_HOSTS = {h for h, k in SITES.items() if k in STATUS_SITES}


def judge_status(code, final, body):
    if code is None: return 'error', body
    if code == 200: return 'ok', '200 %dB' % len(body or '')
    return classify_status(code), 'HTTP %d' % code


def site_of(url):
    return SITES.get(urllib.parse.urlsplit(url).netloc)


def _res(status, reason, **ev):
    return {'status': status, 'reason': reason, 'evidence': ev}


def judge(site, url, record_id=None, fetch=None):
    site = site or site_of(url)
    if fetch is None: raise ValueError('judge() 需要注入 fetch(url)->(code, final_url, body)')
    if site == 'nlc':
        c, f, b = fetch(url); v, n = judge_nlc(c, f, b)
    elif site == 'ndl':
        m = re.search(r'/pid/(\d+)', url)
        if not m: return _res('unknown', 'url 无 /pid/<数字>', site=site)
        c, f, b = fetch('https://dl.ndl.go.jp/api/item/search/info:ndljp/pid/' + m.group(1))
        v, n = (('error', b) if c is None else (classify_status(c), 'ndl API HTTP %d' % c))
    elif site == 'kokusho':
        api = kokusho_api(url)
        if not api: return _res('unknown', 'url 无 /biblio/<数字>', site=site)
        c, f, b = fetch(api)
        if c is None: v, n = 'error', b
        elif c == 200: v, n = ('ok', 'kokusho API 200') if (b or '').lstrip().startswith('{') else ('error', 'API 200 但非 JSON')
        else: v, n = classify_status(c), 'kokusho API HTTP %d' % c
    elif site == 'shidianguji':      # fetch 必须是浏览器渲染版（见 browser_fetch_factory）
        c, f, b = fetch(url); v, n = judge_shidianguji(c, f, b)
    elif site == 'npm':
        c, f, b = fetch(url); v, n = judge_npm(c, f, b)
        if v == 'blocked':
            fetch('https://rarebooks-maps.npm.edu.tw/index.php'); c, f, b = fetch(url); v, n = judge_npm(c, f, b)
    elif site in STATUS_SITES:
        c, f, b = fetch(url); v, n = judge_status(c, f, b)
    else:
        return _res('unknown', '无该站判据', site=site)
    st = {'ok': 'ok', 'gone': 'dead'}.get(v, 'unknown')
    return _res(st, n, site=site, code=c, final_url=f if f != url else '', body_bytes=len(b or ''), record_id=record_id)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True); ap.add_argument('--root', default='.')
    ap.add_argument('--hosts'); ap.add_argument('--limit', type=int, help='每 host 最多 N 条（试跑）')
    ap.add_argument('--sample-frac', action='append', default=[], help='HOST=0.1，分层抽样')
    ap.add_argument('--min-interval', type=float, default=HARD_MIN)
    ap.add_argument('--seed', type=int, default=20261015); ap.add_argument('--urls-file', help='只测此文件里的 url（每行一个，或 tsv 首列）')
    ap.add_argument('--confirm-gap', type=int, default=600)
    ap.add_argument('--monitor', action='store_true', help='定期小样监控：nlc＋npm 各按 ISO 周换种子分层抽 5%%（可用 --sample-frac 覆盖比例）')
    a = ap.parse_args()
    if a.monitor:
        wk = '%d%02d' % datetime.date.today().isocalendar()[:2]
        a.hosts = a.hosts or 'read.nlc.cn,rarebooks-maps.npm.edu.tw'
        for h in a.hosts.split(','): a.sample_frac.append('%s=0.05' % h)
        a.seed = int(wk)
    if a.min_interval < HARD_MIN: sys.exit('拒绝：--min-interval 不得小于 %.1f 秒' % HARD_MIN)
    os.makedirs(a.out, exist_ok=True)
    byurl = collect(a.root)
    fracs = dict(s.split('=') for s in a.sample_frac)
    hosts = collections.defaultdict(list)
    if a.urls_file:
        want = [l.split('\t')[0].strip() for l in open(a.urls_file, encoding='utf-8') if l.strip() and not l.startswith('url')]
        for u in want:
            hosts[urllib.parse.urlsplit(u).netloc].append(u); byurl.setdefault(u, [('', -1, '', '')])
    else:
        for u in byurl: hosts[urllib.parse.urlsplit(u).netloc].append(u)
        for h, f in fracs.items(): hosts[h] = stratified_sample(byurl, h, float(f), a.seed)
    if a.hosts: hosts = {h: hosts[h] for h in a.hosts.split(',') if h in hosts}
    if a.limit: hosts = {h: v[:a.limit] for h, v in hosts.items()}
    rpath = os.path.join(a.out, 'results.jsonl'); done = load_done(rpath)
    outlock = threading.Lock(); stats_lim = {}
    with open(rpath, 'a', encoding='utf-8') as outf:
        ts = [threading.Thread(target=probe_host, args=(h, v, a.min_interval, done, outf, outlock, stats_lim)) for h, v in hosts.items()]
        [t.start() for t in ts]; [t.join() for t in ts]
        done = load_done(rpath); confirm_gone(done, a.min_interval, outf, outlock, a.confirm_gap)
    done = load_done(rpath)
    with open(os.path.join(a.out, '死链表.tsv'), 'w', encoding='utf-8') as fo:
        fo.write('file\tres_index\tres_id\turl\tverdict\tcode\tevidence\tchecked_at\n')
        for u, r in done.items():
            if r['verdict'] in ('dead', 'gone'):
                for f, i, rid, _ in byurl.get(u, [('', -1, '', '')]):
                    fo.write('\t'.join(str(x) for x in (f, i, rid, u, r['verdict'], r.get('code') or '', r.get('note', ''), r['ts'])) + '\n')
    c = collections.defaultdict(collections.Counter)
    for r in done.values(): c[r['host']][r['verdict']] += 1
    with open(os.path.join(a.out, '统计.tsv'), 'w', encoding='utf-8') as fo:
        vs = ['ok', 'redirect', 'dead', 'gone', 'blocked', 'error', 'unjudged']; fo.write('host\ttotal\t' + '\t'.join(vs) + '\n')
        for h in sorted(c): fo.write('%s\t%d\t%s\n' % (h, sum(c[h].values()), '\t'.join(str(c[h][v]) for v in vs)))
    bad = False
    with open(os.path.join(a.out, '请求间隔自检.txt'), 'w', encoding='utf-8') as fo:
        for h, l in sorted(stats_lim.items()):
            ok = l.min_gap is None or l.min_gap >= HARD_MIN - 1e-3; bad |= not ok
            fo.write('%s\t请求%d次\t最小间隔=%s\t%s\n' % (h, l.n, 'n/a' if l.min_gap is None else '%.3fs' % l.min_gap, 'PASS' if ok else 'FAIL'))
    print(open(os.path.join(a.out, '统计.tsv'), encoding='utf-8').read()); print(open(os.path.join(a.out, '请求间隔自检.txt'), encoding='utf-8').read())
    if CRASHED: print('线程崩溃 host:', CRASHED)
    sys.exit(1 if (bad or CRASHED) else 0)


if __name__ == '__main__':
    main()
