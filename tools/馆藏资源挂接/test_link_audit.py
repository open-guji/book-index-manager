import link_audit as L

def test_quote_unicode():
    u = L.quote_url('https://zh.wikisource.org/wiki/孟子解')
    u.encode('ascii'); assert '%E5%AD%9F' in u
    assert L.quote_url('https://a.org/x%20y') == 'https://a.org/x%20y'

def test_classify():
    assert [L.classify_status(c) for c in (200, 301, 404, 429, 500)] == ['ok', 'redirect', 'gone', 'blocked', 'error']

def test_limiter_gap_fake_clock():
    t = [0.0]
    lim = L.HostLimiter(2.0, clock=lambda: t[0], sleep=lambda s: t.__setitem__(0, t[0] + s))
    for _ in range(5): lim.wait(); t[0] += 0.1
    assert lim.n == 5 and lim.min_gap >= 2.0

def test_wiki_title():
    assert L.wiki_title('https://commons.wikimedia.org/wiki/File:A_b%C3%A9.pdf') == 'File:A bé.pdf'
    assert L.wiki_title('https://x.org/foo') is None

def test_wiki_batch_429_is_blocked_not_dead(monkeypatch):
    import urllib.error
    def boom(*a, **k): raise urllib.error.HTTPError('u', 429, 'x', {}, None)
    monkeypatch.setattr(L.urllib.request, 'urlopen', boom)
    lim = L.HostLimiter(0, clock=lambda: 0.0, sleep=lambda s: None)
    r = L.wiki_batch('commons.wikimedia.org', ['https://commons.wikimedia.org/wiki/File:A.pdf'], lim, sleep=lambda s: None)
    assert r['https://commons.wikimedia.org/wiki/File:A.pdf'][0] == 'blocked'

def test_judges():
    assert L.judge_nlc(200, 'u', 'x' * 798)[0] == 'gone'
    assert L.judge_nlc(200, 'u', 'x' * 31249)[0] == 'ok'
    assert L.judge_npm(200, 'https://h/index.php?act=Landing/index', 'x')[0] == 'blocked'
    assert L.judge_npm(200, 'u', '..沒有查詢結果..')[0] == 'gone'
    assert L.judge_npm(200, 'u', 'y' * 70000)[0] == 'ok'

def test_judge_api_injected_fetch():
    assert L.judge('nlc', 'u', fetch=lambda u: (200, u, 'x' * 800))['status'] == 'dead'
    assert L.judge('nlc', 'u', fetch=lambda u: (200, u, 'x' * 31000))['status'] == 'ok'
    assert L.judge('ndl', 'https://dl.ndl.go.jp/pid/99999999', fetch=lambda u: (404, u, ''))['status'] == 'dead'
    assert L.judge('ndl', 'https://dl.ndl.go.jp/pid/1', fetch=lambda u: (429, u, ''))['status'] == 'unknown'
    assert L.judge('shidianguji', 'u', fetch=lambda u: (200, u, 'x'))['status'] == 'unknown'
    k = 'https://kokusho.nijl.ac.jp/biblio/100385351'
    assert L.judge('kokusho', k, fetch=lambda u: (200, u, '{"bid":"1"}'))['status'] == 'ok'
    assert L.judge('kokusho', k, fetch=lambda u: (404, u, '<html>'))['status'] == 'dead'
    calls = []
    def f(u):
        calls.append(u)
        return (200, 'https://h/index.php?act=Landing/index', '') if len(calls) == 1 else (200, u, 'y' * 70000)
    assert L.judge('npm', 'https://rarebooks-maps.npm.edu.tw/index.php?act=x', fetch=f)['status'] == 'ok'

def test_status_sites():
    u = 'https://www.digital.archives.go.jp/file/1072006'
    assert L.site_of(u) == 'naikaku' and L.site_of('https://www.wul.waseda.ac.jp/kotenseki/html/ya09/ya09_00239/index.html') == 'waseda'
    assert L.judge(None, u, fetch=lambda x: (200, x, 'x' * 123812))['status'] == 'ok'
    assert L.judge(None, u, fetch=lambda x: (404, x, 'x' * 431))['status'] == 'dead'
    assert L.judge('naikaku', u, fetch=lambda x: (403, x, ''))['status'] == 'unknown'

def test_wiki_batch_flushes_per_chunk(monkeypatch):
    import io, json
    class R(io.BytesIO):
        def __enter__(self): return self
        def __exit__(self, *a): pass
    monkeypatch.setattr(L.urllib.request, 'urlopen', lambda *a, **k: R(json.dumps({'query': {'pages': {}}}).encode()))
    lim = L.HostLimiter(0, clock=lambda: 0.0, sleep=lambda s: None)
    urls = ['https://zh.wikisource.org/wiki/T%d' % i for i in range(120)]
    sizes = []
    L.wiki_batch('zh.wikisource.org', urls, lim, on_chunk=lambda d: sizes.append(len(d)))
    assert sizes == [50, 50, 20]

def test_wiki_batch_uses_post_for_long_titles(monkeypatch):
    import io, json
    seen = {}
    class R(io.BytesIO):
        def __enter__(self): return self
        def __exit__(self, *a): pass
    def fake(req, timeout=0):
        seen['data'] = req.data; seen['url'] = req.full_url
        return R(json.dumps({'query': {'pages': {}}}).encode())
    monkeypatch.setattr(L.urllib.request, 'urlopen', fake)
    lim = L.HostLimiter(0, clock=lambda: 0.0, sleep=lambda s: None)
    urls = ['https://commons.wikimedia.org/wiki/File:' + ('摛藻堂四庫全書薈要第153冊' * 4) + str(i) + '.djvu' for i in range(50)]
    L.wiki_batch('commons.wikimedia.org', urls, lim)
    assert seen['data'] is not None and '?' not in seen['url'] and len(seen['data']) > 4000


def test_judge_shidianguji():
    J = L.judge_shidianguji
    assert J(200, 'https://www.shidianguji.com/?page_from=404_page', 'x' * 8347)[0] == 'gone'
    assert J(200, 'https://www.shidianguji.com/book/SK0389/chapter/1jpjjgm6ronjn', 'x' * 844)[0] == 'ok'
    assert J(200, 'https://www.shidianguji.com/book/123/chapter/abc', 'x' * 42)[0] == 'error'   # 壳未载入不判死
    assert J(None, 'u', 'timeout')[0] == 'error'
    r = L.judge('shidianguji', 'https://www.shidianguji.com/book/ZZ99999X', fetch=lambda u: (200, 'https://www.shidianguji.com/?page_from=404_page', 'x' * 8347))
    assert r['status'] == 'dead'
