"""各馆挂接总台账：各馆 ×（引擎档位）× 已挂／未挂，挂接后可随时复跑。只读，不写任何库。

  python3 ledger.py --out DIR [--works-root <book-index>] [--data-root <library_data>] [--overview-root <overview>]
                    [--matches-dir DIR2 | --skip-engine] [--sources nlc,kokusho,ndl,naikaku,waseda]

两部分：
1. 有引擎适配器的 5 源（nlc／kokusho／ndl／naikaku／waseda）：对现库跑 match_engine（每源约 1–3 分钟；
   --matches-dir 给出已有的 <源>/matches.tsv 时直接读，不重跑），按 档位 × 有无影像 × 挂接状态 交叉计数。
   挂接状态：已挂（匹配 Work）＝matches.tsv already_linked＝1；已挂（别处）＝该记录已挂在库内别的 Work／Book；未挂。
   「写入计划」＝引擎 write_plan.jsonl 条数（已按口径扣掉已挂、排除、无影像、K9 每 Work ≤3；早稲田按 K12 以阅览器入口为链接）。
2. 没有适配器的档（方志、趙城金藏、家譜、故宫善本／輿圖、関西、Bodleian、全国漢籍、上图藏书）：只数条数与已挂数
   （按站方记录号、故宫 item_id、或 URL 认），档位一律记「未跑引擎」。敦煌（用户 10-24 定搁置）、中國古籍總目（走总目录入，
   不是资源挂接）只列不数。
输出：DIR/台账.md、DIR/台账-引擎源.tsv、DIR/台账-其他档.tsv、DIR/资源按站点.tsv，引擎输出在 DIR/engine/<源>/。
"""
import argparse
import collections
import csv
import glob
import json
import os
import re
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ME = os.path.join(HERE, 'match_engine')
sys.path.insert(0, ME)
import roots        # noqa: E402
import workindex    # noqa: E402
import writeplan    # noqa: E402

ENGINE_SOURCES = ['nlc', 'kokusho', 'ndl', 'naikaku', 'waseda']
NAMES = {'nlc': '国图 數字古籍', 'kokusho': '国書データベース 漢籍', 'ndl': 'NDL 古典籍（汉籍）', 'naikaku': '内閣文庫 漢書',
         'waseda': '早稲田 古典籍総合DB'}

# 没有适配器的档：(名称, 相对 library_data 的路径或目录, 站点 id, 认挂接的办法)
OTHER = [
    ('国图 數字方志', '中國國家圖書館 數字方志.json', 'nlc', 'fid'),
    ('国图 趙城金藏', '中國國家圖書館 趙城金藏.json', 'nlc', 'fid'),
    ('家譜（read.nlc.cn 影像）', '家譜（read.nlc.cn 影像）.json', 'nlc', 'fid'),
    ('台北故宫 善本古籍', '臺灣故宮博物院善本古籍', 'npm-rarebooks', 'item_id'),
    ('台北故宫 明清輿圖', '臺灣故宮博物院明清輿圖', 'npm-rarebooks', 'url'),   # 典藏号与善本有 223 件重号（同一件既在善本也在輿圖），只认輿圖链接
    ('関西大学 KU-ORCAS', '関西大学KU-ORCAS.json', 'kansai', 'url'),
    ('牛津 Bodleian', '牛津博德利图书馆.json', 'bodleian', 'url'),
    ('全国漢籍データベース', 'kanseki', 'kanseki', 'url'),
    ('上海圖書館藏書（_整理）', '_整理/上海圖書館藏書', 'shlib', 'url'),
]
LISTED_ONLY = [('敦煌遺書', '敦煌遺書（單獨品類）', '用户 10-24 定搁置不碰'),
               ('中國古籍總目（上图联合目录平台）', '上海圖書館古籍聯合目錄（中國古籍總目）', '走总目录入工程建 Work／Book，不是资源挂接')]


def norm_url(u):
    u = (u or '').strip().split('#')[0]
    u = re.sub(r'^https?://', '', u).rstrip('/')
    return u.lower()


def site_of(rid):
    x = rid or '?'
    for p in ('shidianguji', 'wikisource', 'npm-rarebooks'):
        if x.startswith(p):
            return p
    return x


class LinkIndex:
    """库内在世 Work／Book 的全部资源项：按站方记录号、group、故宫 item_id、URL 建索引。"""

    def __init__(self, root):
        self.keys = collections.defaultdict(set)   # (site, 记录号) -> {实体 id}
        self.groups = collections.defaultdict(set)
        self.items = collections.defaultdict(set)  # 故宫 item_id
        self.urls = collections.defaultdict(set)
        self.fids = collections.defaultdict(set)   # nlc fid（url 里的 fid=…，含方志／家譜等无 nlc_fid 的旧项）
        self.site_items = {'Work': collections.Counter(), 'Book': collections.Counter()}
        self.site_ents = {'Work': collections.Counter(), 'Book': collections.Counter()}
        self.site_img = {'Work': collections.Counter(), 'Book': collections.Counter()}
        self.live = collections.Counter()
        self.work_has = {}
        self.book_work_has = set()
        for kind in ('Work', 'Book'):
            for f in glob.iglob(os.path.join(root, kind, '*', '*', '*', '*.json')):
                try:
                    d = json.load(open(f, encoding='utf-8'))
                except Exception:
                    continue
                if d.get('merged_into') or d.get('promoted_to') or d.get('status') == 'merged':
                    continue
                self.live[kind] += 1
                i = d.get('id')
                rs = d.get('resources') or []
                if kind == 'Work':
                    self.work_has[i] = bool(rs)
                elif rs and d.get('work_id'):
                    self.book_work_has.add(d['work_id'])
                seen = set()
                for r in rs:
                    s = site_of(r.get('id'))
                    self.site_items[kind][s] += 1
                    seen.add(s)
                    if 'image' in (r.get('types') or []):
                        self.site_img[kind][s] += 1
                    md = r.get('metadata') or {}
                    k = workindex.RECORD_KEY.get(r.get('id'))
                    if k and md.get(k):
                        self.keys[(r['id'], str(md[k]))].add(i)
                    if r.get('group'):
                        self.groups[r['group']].add(i)
                    if md.get('item_id'):
                        self.items[str(md['item_id'])].add(i)
                    urls = [r.get('url')] + [v.get('url') for v in r.get('volumes') or [] if isinstance(v, dict)]
                    for u in urls:
                        if u:
                            self.urls[norm_url(u)].add(i)
                            m = re.search(r'[?&]fid=([^&#\s]+)', u)
                            if m and 'nlc.cn' in u:
                                self.fids[m.group(1)].add(i)
                for s in seen:
                    self.site_ents[kind][s] += 1

    def work_any(self):
        return sum(1 for w, h in self.work_has.items() if h or w in self.book_work_has)

    def linked_engine(self, source, row):
        """引擎源一行（matches.tsv）是否已挂在库内任何实体上。"""
        site = workindex.SITE_OF_SOURCE[source]
        rid, gk = row['source_record_id'], row.get('group_key') or ''
        pre = writeplan.SITES[source]['prefix']
        cands = [rid, gk] + (['pid' + rid] if source == 'ndl' else [])
        if any(c and self.keys.get((site, c)) for c in cands):
            return True
        if any(c and self.groups.get(pre + c) for c in (rid, gk)):
            return True
        if source == 'ndl':
            m = re.search(r'pid/(\d+)', row.get('image_url') or row.get('url') or '')
            if m and (self.groups.get('ndl-' + m.group(1)) or self.keys.get((site, 'pid' + m.group(1)))):
                return True
        if source == 'nlc' and self.fids.get(rid):
            return True
        return any(u and self.urls.get(norm_url(u)) for u in (row.get('url'), row.get('image_url')))

    def linked_other(self, how, rec):
        if how == 'fid':
            m = re.search(r'[?&]fid=([^&#\s]+)', rec.get('url') or '')
            if m and (self.fids.get(m.group(1)) or self.keys.get(('nlc', m.group(1))) or self.groups.get('nlc-' + m.group(1))):
                return True
        if how == 'item_id':
            if rec.get('holding_id') and self.items.get(str(rec['holding_id'])):
                return True
        return any(u and self.urls.get(norm_url(u)) for u in (rec.get('url'), rec.get('source_url'), rec.get('image_url')))


def load_records(path):
    files = sorted(glob.glob(os.path.join(path, 'part-*.json'))) if os.path.isdir(path) else [path]
    for f in files:
        d = json.load(open(f, encoding='utf-8'))
        if isinstance(d, dict):
            d = next((v for v in d.values() if isinstance(v, list)), [])
        yield from d


def run_engine(sources, works_root, data_root, overview_root, out):
    for s in sources:
        o = os.path.join(out, 'engine', s)
        cmd = [sys.executable, os.path.join(ME, 'engine.py'), '--source', s, '--works-root', works_root, '--data-root', data_root,
               '--out', o, '--emit-write-plan']
        if overview_root:
            cmd += ['--overview-root', overview_root]
        t = time.time()
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL)
        print(f'engine {s} {time.time() - t:.0f}s', file=sys.stderr)
    return os.path.join(out, 'engine')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--works-root', default=roots.book_index())
    ap.add_argument('--data-root', default=roots.library_data())
    ap.add_argument('--overview-root', default=roots.overview())
    ap.add_argument('--matches-dir', help='已有引擎输出目录（含 <源>/matches.tsv）；给出则不重跑引擎')
    ap.add_argument('--skip-engine', action='store_true', help='不跑引擎，只出其他档与资源计数')
    ap.add_argument('--sources', default=','.join(ENGINE_SOURCES))
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    if not a.works_root or not a.data_root:
        ap.error('找不到 book-index 或 library_data：用 --works-root／--data-root 或环境变量 BOOK_INDEX／BOOK_INDEX_JSON')
    os.makedirs(a.out, exist_ok=True)
    sources = [s for s in a.sources.split(',') if s]
    head = subprocess.run(['git', '-C', a.works_root, 'rev-parse', '--short=10', 'HEAD'], capture_output=True, text=True).stdout.strip()
    dhead = subprocess.run(['git', '-C', a.data_root, 'rev-parse', '--short=7', 'HEAD'], capture_output=True, text=True).stdout.strip()
    t0 = time.time()
    mdir = a.matches_dir or (None if a.skip_engine else run_engine(sources, a.works_root, a.data_root, a.overview_root, a.out))
    li = LinkIndex(a.works_root)
    print(f'link index {time.time() - t0:.0f}s', file=sys.stderr)

    eng_rows, eng_sum = [], []
    for s in sources if mdir else []:
        p = os.path.join(mdir, s, 'matches.tsv')
        if not os.path.exists(p):
            continue
        c = collections.Counter()
        for r in csv.DictReader(open(p, encoding='utf-8'), delimiter='\t'):
            img = '有影像' if r.get('has_image') in ('1', 'True', 'true') else '无影像'
            st = '已挂（匹配 Work）' if r.get('already_linked') == '1' else ('已挂（别处）' if li.linked_engine(s, r) else '未挂')
            c[(r['tier'], img, st)] += 1
        for (t, img, st), n in sorted((k, v) for k, v in c.items() if isinstance(k, tuple)):
            eng_rows.append([s, NAMES[s], t, img, st, n])
        tot = sum(v for k, v in c.items() if isinstance(k, tuple))
        tier = collections.Counter()
        linked = 0
        for k, v in c.items():
            if isinstance(k, tuple):
                tier[k[0]] += v
                linked += v if k[2] != '未挂' else 0
        eng_sum.append(dict(source=s, name=NAMES[s], total=tot, tier=tier, linked=linked, room=sum(1 for _ in open(os.path.join(mdir, s, 'write_plan.jsonl'), encoding='utf-8')) if os.path.exists(os.path.join(mdir, s, 'write_plan.jsonl')) else None,
                            conf_unlinked=sum(v for k, v in c.items() if isinstance(k, tuple) and k[0] == '确定' and k[2] == '未挂')))

    other = []
    for name, rel, site, how in OTHER:
        p = os.path.join(a.data_root, rel)
        if not os.path.exists(p):
            other.append([name, rel, site, 0, 0, 0, '档不存在'])
            continue
        n = linked = img = 0
        for rec in load_records(p):
            n += 1
            img += bool(rec.get('image_url')) or how == 'fid'
            linked += li.linked_other(how, rec)
        other.append([name, rel, site, n, img, linked, '未跑引擎'])

    with open(os.path.join(a.out, '台账-引擎源.tsv'), 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f, delimiter='\t')
        w.writerow(['source', '馆', '档位', '影像', '挂接状态', '条数'])
        w.writerows(eng_rows)
    with open(os.path.join(a.out, '台账-其他档.tsv'), 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f, delimiter='\t')
        w.writerow(['馆', '档（library_data 下）', '站点 id', '条数', '有影像', '已挂', '档位'])
        w.writerows(other)
    with open(os.path.join(a.out, '资源按站点.tsv'), 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f, delimiter='\t')
        w.writerow(['层', '站点 id', '资源项', '实体数', '标 image'])
        for kind in ('Work', 'Book'):
            for s, v in li.site_items[kind].most_common():
                w.writerow([kind, s, v, li.site_ents[kind][s], li.site_img[kind][s]])

    L = [f'# 馆藏资源挂接总台账', '',
         f'> 生成：{time.strftime("%Y-%m-%d %H:%M %Z")}；book-index `{head}`；book_index_json `{dhead}`；'
         f'复跑：`python3 tools/馆藏资源挂接/ledger.py --out <目录>`（book-index-manager）。', '',
         f'在世 Work {li.live["Work"]:,}，Book {li.live["Book"]:,}；Work 本身或其下 Book 挂有任何资源的 Work **{li.work_any():,}**'
         f'（{li.work_any() / max(1, li.live["Work"]):.1%}）。', '',
         '## 一、有引擎适配器的 5 源（对现库重跑）', '',
         '| 馆 | 记录（组） | 确定 | 存疑 | 无 | 已挂 | 确定未挂 | 写入计划 |', '|---|---:|---:|---:|---:|---:|---:|---:|']
    for e in eng_sum:
        L.append(f"| {e['name']}（`{e['source']}`） | {e['total']:,} | {e['tier']['确定']:,} | {e['tier']['存疑']:,} | {e['tier']['无']:,} | "
                 f"{e['linked']:,} | {e['conf_unlinked']:,} | {'—' if e['room'] is None else format(e['room'], ',')} |")
    L += ['', '「已挂」含挂在匹配 Work 与挂在库内别处两种；「写入计划」＝引擎按口径出的 write_plan 条数（扣掉已挂、排除、无影像、K9 截断；国書另有 K3 无影像不写）。「确定未挂」与「写入计划」之差多是无影像、K9 截断或排除。明细见 `台账-引擎源.tsv`。', '',
          '## 二、没有适配器的档（只数已挂）', '', '| 馆 | 条数 | 有影像 | 已挂 | 说明 |', '|---|---:|---:|---:|---|']
    for name, rel, site, n, img, linked, note in other:
        L.append(f'| {name}（`{site}`） | {n:,} | {img:,} | {linked:,} | {note} |')
    for name, rel, note in LISTED_ONLY:
        L.append(f'| {name} | — | — | — | {note} |')
    L += ['', '「已挂」按站方记录号（国图 fid）、故宫 item_id 或 URL 认，可能漏认没有记录号的旧项；方志／趙城／家譜按 fid 计「有影像」。', '',
          '## 三、正式库资源按站点（前 15）', '', '| 层 | 站点 id | 资源项 | 实体数 |', '|---|---|---:|---:|']
    for kind in ('Work', 'Book'):
        for s, v in li.site_items[kind].most_common(15):
            L.append(f'| {kind} | `{s}` | {v:,} | {li.site_ents[kind][s]:,} |')
    open(os.path.join(a.out, '台账.md'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')
    print('\n'.join(L))


if __name__ == '__main__':
    main()
