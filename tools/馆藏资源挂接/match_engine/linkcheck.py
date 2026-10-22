"""链接内容判据接线层（R1-E6，Everett，2026-10-15）：把 Reid 的 `link_audit.judge()` 接进引擎 plancheck。
判据本身（nlc 页面大小／ndl API／npm 文案／早稲田入口）归 Reid；本模块只做：站点识别、注入 fetch（同 host≥2s、UA、
npm 持久 cookie）、抽样、缓存（键＝站点|URL|判据版本）、dead 二次确认（隔开 gap 秒）、汇总与退出码。判据不联网，fetch 可替换，单测全离线。
status：ok／dead／unknown。429／403／超时一律 unknown，不判死；识典／国書恒 unknown（无判据）。"""
import collections
import http.cookiejar
import json
import os
import random
import sys
import threading
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import link_audit as LA  # noqa: E402

JUDGE_VERSION = 'reid-5de36a9e'          # 判据库改了就换，旧缓存自然失效
SITE_OF_ID = {'nlc': 'nlc', 'ndl': 'ndl', 'kokusho': 'kokusho', 'waseda': 'waseda', 'nat-archives-jp': 'naikaku',
              'shidianguji': 'shidianguji', 'npm': 'npm'}
RECORD_META = ('waseda_id', 'nlc_fid', 'kokusho_bid', 'ndl_pid', 'ndl_record', 'record_id')


def site_of_item(rid, url):
    """资源 id 优先，其次按域名。无判据的站（如 naikaku）→ None。"""
    s = SITE_OF_ID.get(rid)
    if s:
        return s
    if urllib.parse.urlsplit(url).netloc == 'www.wul.waseda.ac.jp':
        return 'waseda'
    return LA.site_of(url)


class Fetcher:
    """真实 fetch：每 host 一把 HostLimiter（≥interval），npm 持久 cookie，UA 由 link_audit 定。"""
    def __init__(self, interval=2.0, clock=time.monotonic, sleep=time.sleep):
        if interval < LA.HARD_MIN:
            raise ValueError('min-interval 不得小于 %.1f 秒' % LA.HARD_MIN)
        self.interval, self.clock, self.sleep = interval, clock, sleep
        self.lims, self.openers, self.lock = {}, {}, threading.Lock()

    def _get(self, host):
        with self.lock:
            if host not in self.lims:
                self.lims[host] = LA.HostLimiter(self.interval, clock=self.clock, sleep=self.sleep)
                self.openers[host] = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
            return self.lims[host], self.openers[host]

    def __call__(self, url):
        lim, op = self._get(urllib.parse.urlsplit(url).netloc)
        return LA.fetch_body(url, op, lim)

    def gaps(self):
        return {h: (l.min_gap, l.n) for h, l in self.lims.items()}


def _key(site, url):
    return '%s|%s|%s' % (site, url, JUDGE_VERSION)


class Cache:
    """jsonl 追加式缓存；offline 时只读。缓存文件是大文件，不提交进仓。"""
    def __init__(self, path=None):
        self.path, self.d, self.lock = path, {}, threading.Lock()
        if path and os.path.exists(path):
            for l in open(path, encoding='utf-8'):
                if l.strip():
                    r = json.loads(l)
                    self.d[r['key']] = r

    def get(self, site, url):
        return self.d.get(_key(site, url))

    def put(self, site, url, rec):
        rec = dict(rec, key=_key(site, url))
        with self.lock:
            self.d[rec['key']] = rec
            if self.path:
                with open(self.path, 'a', encoding='utf-8') as f:
                    f.write(json.dumps(rec, ensure_ascii=False) + '\n')


class DirCache:
    """与 Reid 约定的共享缓存：`<dir>/<site>.jsonl`，行={url,status,reason,body_bytes,checked_at(洛杉矶),v}，只追加，读取最新一条；
    dead 须有≥2 条不同时间的 dead 记录才算确认（否则视为未命中，重测）。缓存文件是大文件，不提交进仓。"""
    def __init__(self, d):
        self.dir, self.d, self.lock = d, collections.defaultdict(lambda: collections.defaultdict(list)), threading.Lock()
        os.makedirs(d, exist_ok=True)
        for f in os.listdir(d):
            if f.endswith('.jsonl'):
                for l in open(os.path.join(d, f), encoding='utf-8'):
                    if l.strip():
                        r = json.loads(l)
                        self.d[f[:-6]][r['url']].append(r)

    def get(self, site, url):
        rows = [r for r in self.d[site].get(url, []) if r.get('v', JUDGE_VERSION) == JUDGE_VERSION]
        if not rows:
            return None
        last = rows[-1]
        if last['status'] == 'dead' and len({r['checked_at'] for r in rows if r['status'] == 'dead'}) < 2:
            return None
        return dict(status=last['status'], reason=last['reason'], evidence=dict(body_bytes=last.get('body_bytes', '')))

    def put(self, site, url, rec, first=None):
        now = la_now()
        rows = ([first] if first else []) + [rec]
        with self.lock:
            for i, x in enumerate(rows):
                row = dict(url=url, status=x['status'], reason=x['reason'], body_bytes=(x.get('evidence') or {}).get('body_bytes', ''),
                           checked_at=x.get('checked_at') or now, v=JUDGE_VERSION)
                self.d[site][url].append(row)
                with open(os.path.join(self.dir, site + '.jsonl'), 'a', encoding='utf-8') as f:
                    f.write(json.dumps(row, ensure_ascii=False) + '\n')


def make_cache(path):
    """路径是目录（或不带 .jsonl 后缀）→ 共享 DirCache；.jsonl 文件 → 单文件 Cache；None → 内存。"""
    if path and not path.endswith('.jsonl'):
        return DirCache(path)
    return Cache(path)


def la_now():
    import datetime
    try:
        import zoneinfo
        return datetime.datetime.now(zoneinfo.ZoneInfo('America/Los_Angeles')).strftime('%Y-%m-%d %H:%M:%S')
    except Exception:
        return time.strftime('%Y-%m-%d %H:%M:%S')


def judge_once(site, url, fetch, rid=None):
    try:
        v = LA.judge(site, url, record_id=rid, fetch=fetch)
    except Exception as e:                      # 判据异常一律 unknown，不判死
        return dict(status='unknown', reason='judge 异常:%s' % type(e).__name__, evidence={})
    return v


RETRY_BACKOFF = (30, 60, 120)             # 429/403/超时/reset：退避重试，仍不行则 unknown（绝不判死）
NO_CRITERION = ('无已验证判据', '无该站判据', 'SPA 壳')


def check_one(site, url, rid, fetch, cache, offline=False, gap=600, sleep=time.sleep, backoff=RETRY_BACKOFF):
    """→ dict(status, reason, evidence, cached)。dead 须隔 gap 秒二次确认才算 dead；一次 dead 二次非 dead → 取二次结果。"""
    hit = cache.get(site, url) if cache else None
    if hit:
        return dict(hit, cached=True)
    if offline:
        return dict(status='unknown', reason='离线模式且缓存未命中', evidence={}, cached=False)
    v = judge_once(site, url, fetch, rid)
    tries = 0
    while v['status'] == 'unknown' and tries < len(backoff) and not any(m in v['reason'] for m in NO_CRITERION) and site != 'shidianguji':
        sleep(backoff[tries]); tries += 1
        v = judge_once(site, url, fetch, rid)
    first = None
    if v['status'] == 'dead':
        first = dict(v, checked_at=la_now())
        sleep(gap)
        v2 = judge_once(site, url, fetch, rid)
        v = dict(v2, reason=v2['reason'] + ('（二次确认）' if v2['status'] == 'dead' else '（首次 dead、二次不 dead，取二次）'))
    rec = dict(status=v['status'], reason=v['reason'], evidence=v.get('evidence') or {}, cached=False)
    if cache and v['status'] != 'unknown':           # unknown 不落缓存，下次重测
        if isinstance(cache, DirCache):
            cache.put(site, url, rec, first=first)
        else:
            cache.put(site, url, rec)
    return rec


def item_record_id(res):
    md = res.get('metadata') or {}
    for k in RECORD_META:
        if md.get(k):
            return md[k]
    return None


def collect(items):
    """items: [(work_id, resource)] → 去重后的待测列表 [(site, url, rid, [work_id…])]；无判据站点单列 skipped。"""
    by, skipped = collections.OrderedDict(), collections.Counter()
    for wid, res in items:
        site = site_of_item(res.get('id'), res.get('url', ''))
        if not site:
            skipped[res.get('id')] += 1
            continue
        k = (site, res['url'])
        if k not in by:
            by[k] = [site, res['url'], item_record_id(res), []]
        by[k][3].append(wid)
    return list(by.values()), dict(skipped)


def run(items, fetch, cache=None, sample=None, seed=20261015, offline=False, workers=8, gap=600, sleep=time.sleep):
    """→ dict(rows, summary)。sample=None 全量；否则每站按比例不足时取全，总数≈sample（分层，种子固定）。"""
    todo, skipped = collect(items)
    total = len(todo)
    if sample and sample < total:
        rng = random.Random(seed)
        bysite = collections.defaultdict(list)
        for t in todo:
            bysite[t[0]].append(t)
        pick = []
        for s in sorted(bysite):
            n = max(1, round(sample * len(bysite[s]) / total))
            pick += rng.sample(bysite[s], min(n, len(bysite[s])))
        todo = pick
    rows = []
    # 不同 host 并行，同 host 由 Fetcher 的 HostLimiter 串行限速
    def work(t):
        site, url, rid, wids = t
        r = check_one(site, url, rid, fetch, cache, offline, gap, sleep)
        return dict(site=site, record_id=rid or '', url=url, work_ids=wids, **r)
    with ThreadPoolExecutor(max_workers=workers) as ex:
        rows = list(ex.map(work, todo))
    by_site = collections.defaultdict(collections.Counter)
    for r in rows:
        by_site[r['site']][r['status']] += 1
    cnt = collections.Counter(r['status'] for r in rows)
    summary = dict(candidates=total, checked=len(rows), ok=cnt['ok'], dead=cnt['dead'], unknown=cnt['unknown'],
                   cached=sum(1 for r in rows if r.get('cached')), skipped_no_criterion=skipped,
                   by_site={s: dict(c) for s, c in by_site.items()}, judge_version=JUDGE_VERSION,
                   sample=sample, seed=seed if sample else None)
    return dict(rows=rows, summary=summary)


def write_tsv(rows, path):
    with open(path, 'w', encoding='utf-8') as f:
        f.write('site\trecord_id\turl\tverdict\treason\tcode\tbody_bytes\tcached\twork_ids\n')
        for r in rows:
            ev = r.get('evidence') or {}
            f.write('\t'.join(str(x) for x in (r['site'], r['record_id'], r['url'], r['status'], r['reason'], ev.get('code', ''),
                                              ev.get('body_bytes', ''), int(bool(r.get('cached'))), ','.join(r['work_ids'][:3]))) + '\n')


def library_items(works_root, sites):
    """库内现有 resources（供对已写入项做零误报实跑）：→ [(work_id, resource)]，sites 为资源 id 集合。"""
    import workindex
    out = []
    for f in workindex.iter_work_files(works_root):
        d = json.load(open(f, encoding='utf-8'))
        for r in d.get('resources') or []:
            if r.get('id') in sites and str(r.get('url', '')).startswith('http'):
                out.append((d['id'], r))
    return out


def main():
    import argparse
    ap = argparse.ArgumentParser(description='对库内现有资源 / url 列表做内容判据（只读）')
    ap.add_argument('--works-root'); ap.add_argument('--sites', default='nlc,ndl,waseda')
    ap.add_argument('--urls-file', help='每行 "资源id<TAB>url"（或仅 url，按域名识别），与 --works-root 二选一')
    ap.add_argument('--out', required=True); ap.add_argument('--cache')
    ap.add_argument('--sample', type=int); ap.add_argument('--seed', type=int, default=20261015)
    ap.add_argument('--offline', action='store_true'); ap.add_argument('--min-interval', type=float, default=2.0)
    ap.add_argument('--confirm-gap', type=int, default=600)
    a = ap.parse_args()
    if a.urls_file:
        items = []
        for l in open(a.urls_file, encoding='utf-8'):
            p = l.rstrip('\n').split('\t')
            if p and p[-1].startswith('http'):
                items.append((p[0] if len(p) > 1 else '', dict(id=p[0] if len(p) > 1 else '', url=p[-1])))
    else:
        items = library_items(a.works_root, set(a.sites.split(',')))
    fetch = None if a.offline else Fetcher(a.min_interval)
    res = run(items, fetch, make_cache(a.cache), a.sample, a.seed, a.offline, gap=a.confirm_gap)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)) or '.', exist_ok=True)
    write_tsv(res['rows'], a.out)
    if fetch:
        res['summary']['min_gap_by_host'] = {h: (round(g, 2) if g is not None else None) for h, (g, n) in fetch.gaps().items()}
    json.dump(res['summary'], open(a.out + '.summary.json', 'w'), ensure_ascii=False, indent=1)
    print(json.dumps(res['summary'], ensure_ascii=False, indent=1))
    sys.exit(2 if res['summary']['dead'] else 0)


if __name__ == '__main__':
    main()
