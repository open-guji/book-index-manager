"""K2 Book 层候选（只读、不改 matches.tsv，不影响指纹；由 E 块／人工判，引擎不自动挂）。

输入：某来源的 matches.tsv（确定档、未排除、有影像）＋ book-index 的 Book/（work_id、edition）。
口径（口径.md K2）：站方版本（刊年／朝代年号／刊抄类型）与库内已有 Book.edition 一致，题名责任者已由 Work 层确定，且无需新建 Book。
这里只出「候选」，三档：
  STRONG  年号与年数、版式类型都相同，且该 Work 下符合的 Book 恰 1 本
  MEDIUM  年号与类型相同但一方没写年数（或只写到朝代级且类型相同），Work 下符合的 Book 恰 1 本（来源版本本身只写到朝代）
  ERA_ONLY 站方只写到年号、没写刊抄类型，库内同年号 Book 恰 1 本（类型待人核）
  AMBIG   同上但符合的 Book 多于 1 本（列出全部，留人工）
主文件只含 STRONG／MEDIUM／AMBIG（供人工判）；ERA_ONLY／ERA_AMBIG（站方没写刊抄类型）另写 *_weak.tsv，仅备查。
站方无版本或版式类型不明的，不出候选。

用法：python3 book_candidates.py --matches OUT/nlc/matches.tsv --book-root <book-index>/Book --keys $DYNASTY_KEYS --out OUT/nlc/book_candidates.tsv
"""
import argparse
import csv
import glob
import json
import os
import re
import collections

TYPES = [('活字', r'活字|聚珍|木活|銅活|铜活'), ('石印', r'石印|影印|縮印'), ('鉛印', r'鉛印|铅印|排印|洋裝'),
         ('抄', r'抄|鈔|钞|寫|写|謄|誊'), ('稿', r'稿'), ('拓', r'拓'), ('刻', r'刻|刊|槧|版|板|印')]
ERA_WORDS = ['江戸', '江户', '室町', '鎌倉', '镰仓', '平安', '安土桃山', '桃山', '南北朝', '明治', '大正', '昭和', '民國', '民国']
DYN = ['先秦', '漢', '汉', '三國', '晉', '晋', '南北朝', '隋', '唐', '五代', '宋', '遼', '金', '元', '明', '清', '民國', '民国', '日本']
VAGUE_TOKENS = {'初', '末', '間', '间', '中', '前', '後', '后', '期'}


CN = {'〇': 0, '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9}


def cn_int(t):
    if t == '元':
        return 1
    if any(c in t for c in '十廿卅'):
        v = 0
        rest = t
        for ch, mul in (('廿', 20), ('卅', 30)):
            if ch in rest:
                v += mul
                rest = rest.replace(ch, '')
        if '十' in rest:
            a, _, b = rest.partition('十')
            v += (CN.get(a, 1) if a else 1) * 10 + (CN.get(b, 0) if b else 0)
            return v
        return v + (CN.get(rest, 0) if rest else 0)
    if all(c in CN for c in t):
        n = 0
        for c in t:
            n = n * 10 + CN[c]
        return n
    return None


def reign_year(s, reign):
    """年号后的年数（阿拉伯／全角／汉字；日本版的「丁酉(八年)」括注也认）。取不到返回 None。"""
    if not reign or reign not in s:
        return None
    t = s[s.index(reign) + len(reign):]
    t = t.translate(str.maketrans('０１２３４５６７８９', '0123456789'))
    m = re.match(r'\s*(\d{1,2})', t)
    if m:
        return int(m.group(1))
    m = re.match(r'\s*([元〇零一二三四五六七八九十廿卅]{1,3})年', t)
    if m:
        return cn_int(m.group(1))
    m = re.match(r'[^\s()（）]{0,3}[(（]([元一二三四五六七八九十廿卅]{1,3})年[)）]', t)
    if m:
        return cn_int(m.group(1))
    return None


def load_names(keys_path):
    d = json.load(open(keys_path, encoding='utf-8'))
    reigns, dyns = set(), set()
    for k, vs in d['keys'].items():
        for v in vs:
            if v.get('subtype') == 'reign':
                reigns.add(k)
            elif v.get('subtype') == 'dynasty':
                dyns.add(k)
    reigns = {r for r in reigns if len(r) >= 2}
    return reigns, dyns


def parse_version(s, reigns):
    """→ (年号/时代 or '', 朝代 or '', 类型 or '')。字符串可为「明嘉靖[1522-1566]」「刊 寛文９」「日本江戶間鈔本」。"""
    s = (s or '').strip()
    if not s:
        return '', '', ''
    s0 = re.sub(r'\[[^\]]*\]', '', s)
    ty = ''
    for name, pat in TYPES:
        if re.search(pat, s0):
            ty = name
            break
    reign = ''
    for r in sorted(reigns, key=len, reverse=True):
        if r in s0:
            reign = r
            break
    if not reign:
        for w in ERA_WORDS:
            if w in s0:
                reign = w
                break
    dyn = ''
    for d in DYN:
        if s0.startswith(d) or ('日本' + d) in s0 or d in s0[:2]:
            dyn = d
            break
    if not dyn:
        m = re.match(r'([^\[\s]{1,3}?)\[', s)
        if m:
            dyn = m.group(1)
    if not dyn and any(w in s0 for w in ERA_WORDS[:7]):
        dyn = '日本'
    return reign, dyn, ty


def load_books(book_root):
    by_work = collections.defaultdict(list)
    for f in glob.glob(os.path.join(book_root, '**', '*.json'), recursive=True):
        try:
            d = json.load(open(f, encoding='utf-8'))
        except Exception:
            continue
        if d.get('type') != 'book' or not d.get('edition') or not d.get('work_id'):
            continue
        by_work[d['work_id']].append(dict(id=d['id'], edition=d['edition'],
                                          has_src=[r.get('id') for r in d.get('resources') or []]))
    return by_work


def run(matches, book_root, keys, out, source):
    reigns, _ = load_names(keys)
    books = load_books(book_root)
    rows = list(csv.DictReader(open(matches, encoding='utf-8'), delimiter='\t'))
    parsed = {}
    cnt = collections.Counter()
    res = []
    for x in rows:
        if x['tier'] != '确定' or not x['work_id'] or x['excluded'] or x['has_image'] != '1':
            continue
        bs = books.get(x['work_id'])
        if not bs:
            cnt['无库内Book'] += 1
            continue
        rv = parse_version(x['lib_version'], reigns)
        if not (rv[0] or rv[1]):
            cnt['站方版本不足'] += 1
            continue
        if not rv[2] and not rv[0]:
            cnt['站方仅朝代无版式'] += 1
            continue
        hit_s, hit_m, hit_e = [], [], []
        for b in bs:
            if b['id'] not in parsed:
                parsed[b['id']] = parse_version(b['edition'], reigns)
            bv = parsed[b['id']]
            if rv[2] and bv[2] != rv[2]:
                continue
            if not rv[2]:
                if bv[0] == rv[0]:
                    hit_e.append(b)
                continue
            if rv[0] and bv[0] == rv[0]:
                ys, yb = reign_year(x['lib_version'], rv[0]), reign_year(b['edition'], bv[0])
                if ys is not None and yb is not None and ys != yb:
                    continue                      # 年号相同但年数不同＝不是同一版
                (hit_s if ys is not None and yb is not None else hit_m).append(b)
            elif not rv[0] and rv[1] and bv[1] == rv[1] and not bv[0]:
                hit_m.append(b)
        hits, lvl = (hit_s, 'STRONG') if hit_s else ((hit_m, 'MEDIUM') if hit_m else (hit_e, 'ERA_ONLY'))
        if not hits:
            cnt['无同版Book'] += 1
            continue
        if len(hits) > 1:
            lvl = 'ERA_AMBIG' if lvl == 'ERA_ONLY' else 'AMBIG'
        cnt[lvl] += 1
        res.append(dict(level=lvl, source=source, record_id=x['source_record_id'], work_id=x['work_id'], work_title=x['work_title'],
                        site_version=x['lib_version'], book_ids=','.join(b['id'] for b in hits),
                        book_editions=' | '.join(b['edition'] for b in hits),
                        book_already_has_source=int(any(source in b['has_src'] or (source == 'kokusho' and 'kokusho' in b['has_src']) for b in hits)),
                        already_linked=x['already_linked'], url=x['url']))
    cols = ['level', 'source', 'record_id', 'work_id', 'work_title', 'site_version', 'book_ids', 'book_editions',
            'book_already_has_source', 'already_linked', 'url']
    for path, keep in ((out, {'STRONG', 'MEDIUM', 'AMBIG'}), (out.replace('.tsv', '_weak.tsv'), {'ERA_ONLY', 'ERA_AMBIG'})):
        with open(path, 'w', encoding='utf-8', newline='') as f:
            w = csv.DictWriter(f, fieldnames=cols, delimiter='\t')
            w.writeheader()
            w.writerows(sorted((r for r in res if r['level'] in keep), key=lambda r: (r['level'], r['work_id'], r['record_id'])))
    return cnt


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--matches', required=True)
    ap.add_argument('--book-root', required=True)
    ap.add_argument('--keys', default=os.environ.get('DYNASTY_KEYS'))
    ap.add_argument('--out', required=True)
    ap.add_argument('--source', required=True)
    a = ap.parse_args()
    print(dict(run(a.matches, a.book_root, a.keys, a.out, a.source)))
