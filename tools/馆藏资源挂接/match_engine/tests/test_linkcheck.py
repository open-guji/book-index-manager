"""R1-E6：linkcheck 接线层单测。全部离线：fetch 注入、sleep 注入。"""
import json
import os
import sys

import pytest
import linkcheck as K

NLC = 'http://read.nlc.cn/allSearch/searchDetail?searchType=10024&showType=1&indexName=data_892&fid=%s'
WAS = 'https://www.wul.waseda.ac.jp/kotenseki/html/ro13/%s/index.html'
NDL = 'https://dl.ndl.go.jp/pid/%s'
NPM = 'https://rarebooks-maps.npm.edu.tw/index.php?act=Display/image/%s'
NOSLEEP = lambda s: None


def fake_web(pages):
    """pages: {url: (code, body)}；未登记 → 404。记录调用序列。"""
    calls = []
    def fetch(url):
        calls.append(url)
        c, b = pages.get(url, (404, ''))
        return c, url, b
    fetch.calls = calls
    return fetch


def res(rid, url, md=None):
    return {'id': rid, 'url': url, 'metadata': md or {}}


WEB = {
    NLC % '001949164': (200, 'x' * 31000), NLC % '999999999': (200, 'x' * 798),
    'https://dl.ndl.go.jp/api/item/search/info:ndljp/pid/2574032': (200, '{"item":1}'),
    WAS % 'ro13_00059': (200, '<a href="https://archive.wul.waseda.ac.jp/x">'),
    WAS % 'ro13_99999': (404, ''),
    'https://kokusho.nijl.ac.jp/api/biblioDetail/100385351': (200, '{"bid":1}'),
    'https://www.digital.archives.go.jp/file/1': (200, '<html>x</html>'),
}


@pytest.mark.parametrize('rid,url,exp', [
    ('nlc', NLC % '001949164', 'ok'), ('nlc', NLC % '999999999', 'dead'),
    ('ndl', NDL % '2574032', 'ok'), ('ndl', NDL % '9999999', 'dead'),
    ('waseda', WAS % 'ro13_00059', 'ok'), ('waseda', WAS % 'ro13_99999', 'dead'),
    ('kokusho', 'https://kokusho.nijl.ac.jp/biblio/100385351', 'ok'), ('kokusho', 'https://kokusho.nijl.ac.jp/biblio/999999999', 'dead'),
    ('nat-archives-jp', 'https://www.digital.archives.go.jp/file/1', 'ok'), ('nat-archives-jp', 'https://www.digital.archives.go.jp/file/2', 'dead'),
])
def test_verdicts(rid, url, exp):
    site = K.site_of_item(rid, url)
    r = K.check_one(site, url, None, fake_web(WEB), K.Cache(), gap=0, sleep=NOSLEEP)
    assert r['status'] == exp


def test_waseda_domain_autodetect():
    assert K.site_of_item('', WAS % 'ro13_00059') == 'waseda'
    assert K.site_of_item('nat-archives-jp', 'https://www.digital.archives.go.jp/x') == 'naikaku'
    assert K.site_of_item('foo', 'https://example.org/x') is None


@pytest.mark.parametrize('code', [429, 403, 503])
def test_rate_limited_is_unknown_not_dead(code):
    f = fake_web({NLC % '1': (code, '')})
    r = K.check_one('nlc', NLC % '1', None, f, K.Cache(), gap=0, sleep=NOSLEEP)
    assert r['status'] == 'unknown'
    assert len(f.calls) == 1 + len(K.RETRY_BACKOFF)   # 退避重试后仍 unknown，不判死、不做 dead 二次确认


def test_429_then_recovers():
    seq = iter([(429, ''), (200, 'x' * 31000)]); waits = []
    def f(u): c, b = next(seq); return c, u, b
    r = K.check_one('nlc', NLC % '1', None, f, K.Cache(), gap=0, sleep=waits.append)
    assert r['status'] == 'ok' and waits == [30]


def test_timeout_is_unknown():
    r = K.check_one('nlc', NLC % '1', None, lambda u: (None, u, 'TimeoutError:x'), K.Cache(), gap=0, sleep=NOSLEEP)
    assert r['status'] == 'unknown'


def test_judge_exception_is_unknown():
    def boom(u): raise RuntimeError('x')
    r = K.check_one('nlc', NLC % '1', None, boom, K.Cache(), gap=0, sleep=NOSLEEP)
    assert r['status'] == 'unknown'


def test_dead_needs_second_confirmation_and_recovers():
    seq = iter([(200, 'x' * 700), (200, 'x' * 31000)])
    waits = []
    def f(u): c, b = next(seq); return c, u, b
    r = K.check_one('nlc', NLC % '1', None, f, K.Cache(), gap=600, sleep=waits.append)
    assert waits == [600] and r['status'] == 'ok'          # 首次 dead、二次 ok → ok


def test_dead_confirmed():
    waits = []
    r = K.check_one('nlc', NLC % '999999999', None, fake_web(WEB), K.Cache(), gap=600, sleep=waits.append)
    assert r['status'] == 'dead' and waits == [600] and '二次确认' in r['reason']


def test_shidianguji_always_unknown_no_network():
    f = fake_web({})
    for s, u in (('shidianguji', 'https://www.shidianguji.com/book/1'),):
        assert K.check_one(s, u, None, f, K.Cache(), sleep=NOSLEEP)['status'] == 'unknown'
    assert not f.calls


def test_cache_hit_no_network_and_persist(tmp_path):
    p = str(tmp_path / 'c.jsonl')
    f = fake_web(WEB)
    K.check_one('nlc', NLC % '001949164', None, f, K.Cache(p), sleep=NOSLEEP)
    n = len(f.calls)
    r = K.check_one('nlc', NLC % '001949164', None, f, K.Cache(p), sleep=NOSLEEP)     # 新 Cache 对象读文件
    assert r['cached'] and len(f.calls) == n


def test_unknown_not_cached(tmp_path):
    c = K.Cache(str(tmp_path / 'c.jsonl'))
    K.check_one('nlc', NLC % '1', None, fake_web({NLC % '1': (429, '')}), c, sleep=NOSLEEP)
    assert c.get('nlc', NLC % '1') is None


def test_cache_key_has_judge_version(tmp_path, monkeypatch):
    c = K.Cache(str(tmp_path / 'c.jsonl'))
    K.check_one('nlc', NLC % '001949164', None, fake_web(WEB), c, sleep=NOSLEEP)
    monkeypatch.setattr(K, 'JUDGE_VERSION', 'v2')
    assert c.get('nlc', NLC % '001949164') is None


def test_offline_miss_unknown_and_hit():
    c = K.Cache()
    assert K.check_one('nlc', NLC % '1', None, None, c, offline=True)['status'] == 'unknown'
    c.put('nlc', NLC % '1', dict(status='ok', reason='r', evidence={}))
    assert K.check_one('nlc', NLC % '1', None, None, c, offline=True)['status'] == 'ok'


def test_run_summary_dedupe_skip_and_sample():
    items = [('w%d' % i, res('nlc', NLC % '001949164')) for i in range(3)]
    items += [('wd', res('nlc', NLC % '999999999')), ('wn', res('foo', 'https://example.org/x')),
              ('ww', res('waseda', WAS % 'ro13_00059', {'waseda_id': 'ro13_00059'}))]
    out = K.run(items, fake_web(WEB), K.Cache(), gap=0, sleep=NOSLEEP)
    s = out['summary']
    assert s['candidates'] == 3 and s['ok'] == 2 and s['dead'] == 1 and s['skipped_no_criterion'] == {'foo': 1}
    assert s['by_site']['waseda'] == {'ok': 1}
    many = [('w%d' % i, res('nlc', NLC % ('%09d' % i))) for i in range(40)]
    a = K.run(many, fake_web({}), K.Cache(), sample=10, seed=1, gap=0, sleep=NOSLEEP)
    b = K.run(many, fake_web({}), K.Cache(), sample=10, seed=1, gap=0, sleep=NOSLEEP)
    assert a['summary']['checked'] == 10 and [r['url'] for r in a['rows']] == [r['url'] for r in b['rows']]


def test_fetcher_rejects_fast_interval():
    with pytest.raises(ValueError):
        K.Fetcher(1.0)


def test_fetcher_enforces_gap_per_host():
    t = [0.0]; slept = []
    def sl(x): slept.append(x); t[0] += x
    f = K.Fetcher(2.0, clock=lambda: t[0], sleep=sl)
    lim, _ = f._get('a.example')
    lim.wait(); lim.wait(); lim.wait()
    assert lim.min_gap >= 2.0 - 1e-9


def test_write_tsv(tmp_path):
    out = K.run([('w', res('nlc', NLC % '999999999'))], fake_web(WEB), K.Cache(), gap=0, sleep=NOSLEEP)
    K.write_tsv(out['rows'], str(tmp_path / 't.tsv'))
    t = open(tmp_path / 't.tsv', encoding='utf-8').read().splitlines()
    assert t[0].startswith('site\t') and 'dead' in t[1]


def test_dircache_shared_format_and_dead_needs_two(tmp_path, monkeypatch):
    tick = iter(range(1000, 2000))
    monkeypatch.setattr(K, 'la_now', lambda: '2026-10-15 03:%02d:%02d' % divmod(next(tick), 60))
    d = str(tmp_path / 'cache')
    c = K.DirCache(d)
    f = fake_web(WEB)
    r = K.check_one('nlc', NLC % '999999999', None, f, c, gap=0, sleep=NOSLEEP)
    assert r['status'] == 'dead'
    rows = [json.loads(l) for l in open(os.path.join(d, 'nlc.jsonl'), encoding='utf-8')]
    assert len(rows) == 2 and {'url', 'status', 'reason', 'body_bytes', 'checked_at'} <= set(rows[0])
    c2 = K.DirCache(d)
    assert c2.get('nlc', NLC % '999999999')['status'] == 'dead'            # 两条不同时间的 dead 才算确认
    # 单条 dead 的行（别人写的、尚未二次确认）→ 视为未命中
    c3 = K.DirCache(str(tmp_path / 'c3'))
    c3.put('nlc', NLC % '5', dict(status='dead', reason='x', evidence={}))
    assert c3.get('nlc', NLC % '5') is None


def test_make_cache_dispatch(tmp_path):
    assert isinstance(K.make_cache(str(tmp_path / 'dir')), K.DirCache)
    assert isinstance(K.make_cache(str(tmp_path / 'a.jsonl')), K.Cache)
    assert isinstance(K.make_cache(None), K.Cache)
