"""E1 规则圈集 T∧A∧U（Rhea 设计，Everett 固化）。

T 题名相等（可只差装饰前缀 新刊／新刻／新編／新鐫／校正／重刻／欽定／御製；
  增補／補註／音註／重修 不算装饰）；方括号年号不参与，卷数后缀剥去，罗马字剥去。
A 作者包含（去朝代／役割词；括号整段去掉；原字比对，不做繁简折叠；单字只许全等）。
U 候选唯一（T∧A 命中的候选恰好 1 个）。

用法：python3 e1_rule.py <对照表.tsv> <works-root> <out.tsv>
  对照表列：source_record_id 旧主类 升档原因码 旧reasons excluded 新档 lib_title lib_author url candidates
  works-root 必须是正式库 book-index（含 Work 目录）。
"""
import csv, re, sys, collections, unicodedata
import workindex, normalize as N

BR = re.compile(r'\[[^\]]*\]|［[^］]*］|[\(（【〔][^\)）】〕]*[\)）】〕]')
DEC = re.compile(r'^(?:重刊|新刊|新刻|新編|新编|新鐫|新镌|校正|重刻|欽定|钦定|御製|御制)+')
ROMAN = re.compile(r'[A-Za-zÀ-ɏ\s]+')
JT = re.compile(r'\s+[〇零一二三四五六七八九十百千廿卅\d]+[卷巻].*$')


def raw_names(a):
    a = unicodedata.normalize('NFKC', a)
    a = BR.sub('', a).replace(' ', '')
    return [x for x in (N.ROLE_C.sub('', t) for t in re.split(r'[,，、;；@]+', a)) if x]


def title_key(s):
    s = JT.sub('', s.strip())
    return ROMAN.sub('', N.norm_title(s, False))


def tvars(k):
    return {k, DEC.sub('', k)}


def title_ok(lib_title, work_keys):
    lt = tvars(title_key(lib_title))
    tt = set()
    for k in work_keys:
        tt |= tvars(ROMAN.sub('', k))
    return bool(lt & tt)


def author_ok(lib_author, work_names):
    la = raw_names(lib_author)
    return any(a == b or ((a in b or b in a) and min(len(a), len(b)) >= 2)
               for a in la for b in work_names)


def work_index(works):
    W = {}
    for w in works:
        ts = {w['title']} | {t if isinstance(t, str) else t.get('title', '')
                             for t in (w.get('additional_titles') or [])}
        if w.get('original_title'):
            ts.add(w['original_title'])
        names = set()
        for a in w.get('authors') or []:
            names.update(raw_names(a.get('name', '')))
        W[w['id']] = (w['title'], {N.norm_title(t, False) for t in ts if t}, names)
    return W


def circle(rows, W, layers='EH'):
    """返回 (命中[(row, work_id)], 计数)。"""
    res, cnt = [], collections.Counter()
    for r in rows:
        if not r['旧主类'] or r['旧主类'] not in layers:
            continue
        if (r['excluded'] or 'ERA_CONFLICT' in r['升档原因码']
                or 'A_ALIAS_ONLY' in r['升档原因码'] or r['新档'] == '确定'):
            continue
        cnt['可审' + r['旧主类']] += 1
        hit = []
        for c in filter(None, r['candidates'].split(',')):
            if c not in W:
                continue
            _, keys, names = W[c]
            if title_ok(r['lib_title'], keys) and author_ok(r['lib_author'], names):
                hit.append(c)
        if len(hit) == 1:
            cnt['命中' + r['旧主类']] += 1
            res.append((r, hit[0]))
    return res, cnt


COLS = ['source_record_id', '旧主类', 'work_id', 'work_title', 'work_authors',
        'lib_title', 'lib_author', 'url']


def main(tbl, root, out):
    works, _ = workindex.load_works(root)
    W = work_index(works)
    rows = list(csv.DictReader(open(tbl, encoding='utf-8'), delimiter='\t'))
    res, cnt = circle(rows, W)
    with open(out, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f, delimiter='\t')
        w.writerow(COLS)
        for r, c in res:
            w.writerow([r['source_record_id'], r['旧主类'], c, W[c][0],
                        '|'.join(sorted(W[c][2])), r['lib_title'], r['lib_author'], r['url']])
    print(dict(cnt))


if __name__ == '__main__':
    main(*sys.argv[1:4])
