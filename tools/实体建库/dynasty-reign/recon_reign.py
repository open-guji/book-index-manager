#!/usr/bin/env python3
"""库内年号 vs 源表 对勘引擎（块 B，见 计划/分块-B-对勘-Edwin.md）。全程只读。

    python3 recon_reign.py --root <book-index> --sources 源表/ --map 政权映射.tsv --out <目录> [--check-conservation]

输出（--out 下）：差异清单.tsv（前五列=总计划 §五契约；末尾加 序号／严重度）、匹配明细.tsv、对勘报告.md。
同输入复跑，差异清单.tsv 与匹配明细.tsv 逐字节相同（运行时刻只写在 对勘报告.md）。
"""
import re, argparse, collections, glob, hashlib, itertools, json, os, subprocess, sys, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from guji_norm import norm_name, norm_dynasty, norm_ruler, parse_year

try:
    import opencc
    _T2S = opencc.OpenCC('t2s')
except ImportError:
    _T2S = None

CATS = ('缺条', '单源待裁', '起讫分歧', '归属', '异体', '重名')
SEV_ORDER = {'高': 0, '中': 1, '低': 2}


# ---------------------------------------------------------------- 载入
def load_library(root):
    D, R = {}, []
    for dp, _, fs in os.walk(os.path.join(root, 'Entity')):
        for f in sorted(fs):
            if not f.endswith('.json'):
                continue
            d = json.load(open(os.path.join(dp, f), encoding='utf-8'))
            if d.get('promoted_to') or d.get('_promoted_to'):
                continue
            if d.get('subtype') == 'dynasty':
                D[d['id']] = d
            elif d.get('subtype') == 'reign':
                R.append(d)
    R.sort(key=lambda d: d['id'])
    return D, R


DILA_SKIP = {'平安時代', '江戸時代', '鎌倉時代', '室町時代', '飛鳥時代', '奈良時代', '東京時代', '安土桃山',
             '持明院統[北朝]', '大覚寺統[南朝]', '中華民國'}    # 日韩及民国，不属中国朝代年号（与 denominator.py 同口径）


# 局部别名（朝代, 帝王, 源写法）→ 库写法；不进全局 guji_norm（他朝「太和」是另一年号）
LOCAL_ALIAS = {('唐', '文宗', '大和'): '太和'}


def prep_dila(rows):
    """DILA 预处理：去日韩／民国／无年号行；朝代名去方括号别称（北魏[元魏;後魏]→北魏）；
    DILA 按帝王切分，同一年号跨帝（如嘉祐：仁宗→英宗）连续行并成一条（同名同朝、起年 ≤ 前一行止年+1）。"""
    out = []
    for r in rows:
        if r['朝代'] in DILA_SKIP or r['年号'].startswith('（無年號）'):
            continue
        r = dict(r, 朝代=re.sub(r'\[.*?\]', '', r['朝代']))
        r['年号'] = LOCAL_ALIAS.get((r['朝代'], r['帝王'], r['年号']), r['年号'])
        if r['起'] is None:
            continue
        p = out[-1] if out else None
        if (p and p['年号'] == r['年号'] and p['朝代'] == r['朝代'] and r['止'] is not None
                and p['止'] is not None and r['起'] <= p['止'] + 1):
            out[-1] = dict(p, 止=r['止'], 帝王=p['帝王'] if p['帝王'] == r['帝王'] else p['帝王'] + '→' + r['帝王'])
            continue
        out.append(r)
    return out


def load_sources(src_dir):
    rows, files = [], []
    for p in sorted(glob.glob(os.path.join(src_dir, '*.tsv'))):
        files.append(p)
        part = []
        for l in open(p, encoding='utf-8'):
            l = l.rstrip('\n')
            if not l or l.startswith('#'):
                continue
            c = l.split('\t')
            if c[0] == '来源':      # 表头（DILA 表无表头）
                continue
            c += [''] * (8 - len(c))
            part.append({'来源': c[0], '键': c[1], '年号': c[2], '朝代': c[3], '帝王': c[4],
                         '起': parse_year(c[5]), '止': parse_year(c[6]), '备注': c[7]})
        if part and part[0]['来源'].startswith('dila'):
            part = prep_dila(part)
        rows += part
    return rows, files


def load_map(path):
    m = collections.defaultdict(list)   # (来源, 源写法) -> [(dyn_id, name, 状态)]
    for l in open(path, encoding='utf-8'):
        l = l.rstrip('\n')
        if not l or l.startswith('#') or l.startswith('来源\t'):
            continue
        c = l.split('\t') + [''] * 5
        m[(c[0], c[1])].append((c[2], c[3], c[4]))
    return m


# ---------------------------------------------------------------- 匹配
def lib_index(R):
    idx = collections.defaultdict(list)
    for r in R:
        names = {r['primary_name']}
        names |= {a['name'] for a in r.get('alt_names', []) if a.get('type') != '全稱'}
        for n in names:
            idx[norm_name(n)].append(r)
    return idx


def score(row, r, map_ids):
    s = 0
    dyn_ok = r.get('dynasty_id') in map_ids
    if dyn_ok:
        s += 3
    ls = (r.get('dates') or {}).get('start')
    diff = None
    if row['起'] is not None and ls is not None:
        diff = abs(row['起'] - ls)
        s += {0: 3, 1: 2, 2: 1}.get(diff, 0)
    ruler_ok = None
    sr = norm_ruler(row['帝王'])
    if sr:
        ruler_ok = sr == norm_ruler((r.get('ruler') or {}).get('name'))
        if ruler_ok:
            s += 2
    valid = dyn_ok or (diff is not None and diff <= 2)
    return s, valid, dyn_ok, diff, ruler_ok


def match_source(rows, idx, dmap):
    """每个来源单独与库内配对。返回 pairs[(row_i, lib_id)] 及未配 row。"""
    by_src = collections.defaultdict(list)
    for i, r in enumerate(rows):
        by_src[r['来源']].append(i)
    out = {}
    for src, ids in by_src.items():
        groups = collections.defaultdict(list)
        for i in ids:
            groups[norm_name(rows[i]['年号'])].append(i)
        pairs, unmatched = [], []
        for nm in sorted(groups):
            cands = idx.get(nm, [])
            scored = []
            for i in groups[nm]:
                mids = {m[0] for m in dmap.get((src, rows[i]['朝代']), []) if m[0]}
                for r in cands:
                    s, valid, dyn_ok, diff, ruler_ok = score(rows[i], r, mids)
                    if valid:
                        scored.append((-s, rows[i]['键'], r['id'], i, r, dyn_ok, diff, ruler_ok, s))
            scored.sort(key=lambda t: t[:3])
            used_i, used_l = set(), set()
            for t in scored:
                _, _, lid, i, r, dyn_ok, diff, ruler_ok, s = t
                if i in used_i or lid in used_l:
                    continue
                used_i.add(i); used_l.add(lid)
                pairs.append({'i': i, 'lib': r, 'score': s, 'dyn_ok': dyn_ok, 'diff': diff, 'ruler_ok': ruler_ok})
            unmatched += [i for i in groups[nm] if i not in used_i]
        out[src] = (pairs, sorted(unmatched))
    return out


# ---------------------------------------------------------------- 工具
def fmt_span(s, e):
    f = lambda v: '' if v is None else str(v)
    return '%s-%s' % (f(s), f(e))


def lib_val(r, D):
    dt = r.get('dates') or {}
    return '%s｜%s｜%s' % (r['primary_name'], D.get(r.get('dynasty_id'), {}).get('primary_name', '?'),
                          fmt_span(dt.get('start'), dt.get('end')))


def src_val(row, dmap):
    m = dmap.get((row['来源'], row['朝代']), [])
    to = '+'.join(x[1] for x in m if x[1]) or ('边疆' if any(x[2] == '边疆' for x in m) else '未映射')
    return '%s:%s｜%s→%s｜%s' % (row['来源'], row['年号'], row['朝代'], to, fmt_span(row['起'], row['止']))


def git_short(path):
    try:
        return subprocess.check_output(['git', '-C', path, 'rev-parse', '--short', 'HEAD'],
                                       stderr=subprocess.DEVNULL).decode().strip()
    except Exception:
        return '?'


def sha8(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()[:8]


def is_simplified_of(lib_name, src_name):
    return _T2S is not None and _T2S.convert(lib_name) == src_name and lib_name != src_name


# ---------------------------------------------------------------- 主流程
def run(a):
    D, R = load_library(a.root)
    rows, files = load_sources(a.sources)
    dmap = load_map(a.map)
    idx = lib_index(R)
    res = match_source(rows, idx, dmap)
    nsrc = len(res)

    diffs = []   # (类别, 库内id, 库内值, 各源值, 建议, 严重度, sortkey)
    detail = []
    per_lib = collections.defaultdict(list)   # lib id -> [pair, row]
    unmatched_rows = []
    for src in sorted(res):
        pairs, un = res[src]
        for p in pairs:
            row = rows[p['i']]
            per_lib[p['lib']['id']].append((row, p))
            detail.append((row['来源'], row['键'], row['年号'], row['朝代'], row['帝王'],
                           '' if row['起'] is None else row['起'], '' if row['止'] is None else row['止'],
                           p['lib']['id'], p['lib']['primary_name'], p['score'],
                           'Y' if p['dyn_ok'] else 'N', '' if p['diff'] is None else p['diff'],
                           '' if p['ruler_ok'] is None else ('Y' if p['ruler_ok'] else 'N')))
        for i in un:
            row = rows[i]
            unmatched_rows.append(row)
            detail.append((row['来源'], row['键'], row['年号'], row['朝代'], row['帝王'],
                           '' if row['起'] is None else row['起'], '' if row['止'] is None else row['止'],
                           '', '', '', '', '', ''))

    # --- 缺条／单源待裁：源有库无（跨源聚合）。同名、同政权、起年相差 ≤1 的未配行并成一簇（DILA 起年常比通行起年早 1 年）
    def dyn_key(row):
        ids = sorted(m[0] for m in dmap.get((row['来源'], row['朝代']), []) if m[0])
        return '+'.join(ids) if ids else norm_dynasty(row['朝代'])
    by = collections.defaultdict(list)
    for row in unmatched_rows:
        by[(norm_name(row['年号']), dyn_key(row))].append(row)
    clusters = []
    for k in sorted(by):
        cur = []
        for row in sorted(by[k], key=lambda r: (10 ** 9 if r['起'] is None else r['起'], r['来源'])):
            if cur and row['起'] is not None and cur[-1]['起'] is not None and row['起'] - cur[-1]['起'] <= 1 \
                    and row['来源'] not in {x['来源'] for x in cur}:
                cur.append(row)
            else:
                if cur:
                    clusters.append((k, cur))
                cur = [row]
        if cur:
            clusters.append((k, cur))
    for k, g in clusters:
        border = all(any(x[2] == '边疆' for x in dmap.get((r['来源'], r['朝代']), [])) for r in g)
        nsr = len({r['来源'] for r in g})
        st = g[0]['起'] if g[0]['起'] is not None else 10 ** 9
        vals = '；'.join(src_val(r, dmap) for r in g)
        if border:
            diffs.append(('缺条', '', '', vals, '边疆政权，转块 C 列清单（不计分母）', '低', ('缺条', 0) + k + (st,)))
        elif nsr >= 2:
            diffs.append(('缺条', '', '', vals, '疑缺条，≥2 源都有；查是否争议年号', '高', ('缺条', 0) + k + (st,)))
        else:
            diffs.append(('单源待裁', '', '', vals, '库无、仅 1 源有；转块 C 裁定是否收（查异体或源误）', '中', ('单源待裁', 0) + k + (st,)))

    # --- 缺条：库有源无
    for r in R:
        if r['id'] not in per_lib:
            diffs.append(('缺条', r['id'], lib_val(r, D), '', '库内条在所有源表均无对应；查异体或库内误条',
                          '高' if nsrc >= 2 else '中', ('缺条', 1, r['id'], '', 0)))

    # --- 已配对：起讫分歧、归属、异体
    for lid in sorted(per_lib):
        lst = per_lib[lid]
        r = lst[0][1]['lib']
        dt = r.get('dates') or {}
        ls, le = dt.get('start'), dt.get('end')
        # 起讫分歧
        bad_start, bad_end, vals = [], [], []
        for row, p in lst:
            mism = False
            if row['起'] is not None and ls is not None and row['起'] != ls:
                bad_start.append(row); mism = True
            if row['止'] is not None and le is not None and row['止'] != le:
                bad_end.append(row); mism = True
            if mism:
                vals.append(src_val(row, dmap))
        if vals:
            bad = bad_start + bad_end
            agree = len({(b['起'], b['止']) for b in bad}) == 1 and len({b['来源'] for b in bad}) >= 2
            maxdiff = max([abs(b['起'] - ls) for b in bad_start] + [abs(b['止'] - le) for b in bad_end])
            if not bad_start and all(b['止'] == le + 1 for b in bad_end):
                sev, tip = '低', '仅止年多 1：源把改元当年算进本年号，库按新年号元年计（系统性口径差，非库错）'
            elif agree:
                sev, tip = '高', '≥2 源彼此一致而与库不同，倾向改库'
            elif maxdiff == 1 and any((row['起'], row['止']) == (ls, le) for row, _ in lst):
                sev, tip = '低', '差 1 年且另有源与库一致，查改元口径'
            elif maxdiff == 1:
                sev, tip = '中', '差 1 年，查是否"改元当年记起年"口径差'
            else:
                sev, tip = '中', '差 ≥2 年，查是否另一年号或抄误'
            diffs.append(('起讫分歧', lid, lib_val(r, D), '；'.join(vals), tip, sev, ('起讫分歧', 0, lid, '', 0)))
        # 归属
        mism = []
        ruler_mism = []
        for row, p in lst:
            m = [x for x in dmap.get((row['来源'], row['朝代']), []) if x[0]]
            if m and r.get('dynasty_id') not in {x[0] for x in m}:
                mism.append(row)
            if p['ruler_ok'] is False:
                ruler_mism.append(row)
        if mism or ruler_mism:
            rows_ = mism + [x for x in ruler_mism if x not in mism]
            parts = []
            if mism:
                parts.append('政权不符→块 C')
            if ruler_mism:
                parts.append('帝王写法不一→转块 E')
            diffs.append(('归属', lid, '%s｜%s' % (D.get(r['dynasty_id'], {}).get('primary_name', '?'), (r.get('ruler') or {}).get('name', '')),
                          '；'.join(src_val(x, dmap) + '｜' + x['帝王'] for x in rows_), '；'.join(parts),
                          '中' if mism else '低', ('归属', 0, lid, '', 0)))
        # 异体
        alt_names = [a['name'] for a in r.get('alt_names', [])]
        var = [row for row, _ in lst if row['年号'] != r['primary_name']]
        if var:
            names = sorted({x['年号'] for x in var})
            if all(n in alt_names for n in names):
                sev, tip = '低', '源写法已在库内别名'
            elif all(is_simplified_of(r['primary_name'], n) or norm_name(n) == norm_name(r['primary_name']) and _T2S is not None
                     and _T2S.convert(n) == n for n in names):
                sev, tip = '低', '仅简体写法差异，信息'
            else:
                sev, tip = '中', '建议补别名 type=異體'
            diffs.append(('异体', lid, r['primary_name'] + (('｜' + '、'.join(alt_names)) if alt_names else ''),
                          '；'.join('%s:%s' % (x['来源'], x['年号']) for x in var), tip, sev, ('异体', 0, lid, '', 0)))

    # --- 重名：库内同归一名≥2，或某源同名行数≠库内条数
    name_lib = collections.defaultdict(list)
    for r in R:
        name_lib[norm_name(r['primary_name'])].append(r)
    name_src = collections.defaultdict(lambda: collections.defaultdict(list))
    for row in rows:
        name_src[norm_name(row['年号'])][row['来源']].append(row)
    for nm in sorted(set(name_lib) | set(name_src)):
        L = name_lib.get(nm, [])
        S = name_src.get(nm, {})
        flag = False
        for src, rs in S.items():
            rs_nb = [x for x in rs if not any(m[2] == '边疆' for m in dmap.get((x['来源'], x['朝代']), []))]
            if (len(L) >= 2 or len(rs_nb) >= 2) and len(rs_nb) != len(L):
                flag = True
        matched_ids = {p['lib']['id'] for src in res for p in res[src][0]}
        unres_src = [rows[i] for src in res for i in res[src][1]
                     if norm_name(rows[i]['年号']) == nm
                     and not any(m[2] == '边疆' for m in dmap.get((rows[i]['来源'], rows[i]['朝代']), []))]
        if not flag or not (unres_src or any(r['id'] not in matched_ids for r in L)):
            continue
        sv = [x for rs in S.values() for x in rs if not any(m[2] == '边疆' for m in dmap.get((x['来源'], x['朝代']), []))]
        matched = {p['lib']['id'] for src in res for p in res[src][0] if norm_name(p['lib']['primary_name']) == nm}
        dangling = [r['id'] for r in L if r['id'] not in matched]
        tip = '库内 %d 条／源 %d 行；悬空库条：%s' % (len(L), len(sv), ','.join(dangling) or '无')
        diffs.append(('重名', ';'.join(r['id'] for r in L), '；'.join(lib_val(r, D) for r in L),
                      '；'.join(src_val(x, dmap) for x in sv), tip, '中', ('重名', 0, nm, '', 0)))

    diffs.sort(key=lambda d: (CATS.index(d[0]), SEV_ORDER[d[5]], d[6]))

    # --- 守恒
    cons = []
    ok = True
    n_lib = len(R)
    matched_lib = len(per_lib)
    lib_only = sum(1 for r in R if r['id'] not in per_lib)
    cons.append('库内 reign %d = 已配 %d + 库有源无 %d → %s' % (n_lib, matched_lib, lib_only, 'OK' if n_lib == matched_lib + lib_only else 'FAIL'))
    ok &= n_lib == matched_lib + lib_only
    for src in sorted(res):
        tot = sum(1 for r in rows if r['来源'] == src)
        pm, un = res[src]
        good = tot == len(pm) + len(un)
        ok &= good
        cons.append('%s：源行 %d = 已配 %d + 源有库无 %d → %s' % (src, tot, len(pm), len(un), 'OK' if good else 'FAIL'))
        ids = [p['lib']['id'] for p in pm]
        if len(ids) != len(set(ids)):
            ok = False
            cons.append('%s：库内条被重复配对 → FAIL' % src)
    return D, R, rows, files, res, diffs, detail, cons, ok


def write_outputs(a, D, R, rows, files, res, diffs, detail, cons, ok):
    os.makedirs(a.out, exist_ok=True)
    head = '# 库=%s@%s；源表=%s；脚本@%s\n' % (
        os.path.basename(os.path.abspath(a.root)), git_short(a.root),
        ','.join('%s:%s' % (os.path.basename(f), sha8(f)) for f in files), git_short(os.path.dirname(os.path.abspath(__file__))))
    with open(os.path.join(a.out, '差异清单.tsv'), 'w', encoding='utf-8') as f:
        f.write(head)
        f.write('类别\t库内 id\t库内值\t各源值\t建议\t序号\t严重度\n')
        for n, d in enumerate(diffs, 1):
            f.write('\t'.join([d[0], d[1], d[2], d[3], d[4], str(n), d[5]]) + '\n')
    with open(os.path.join(a.out, '匹配明细.tsv'), 'w', encoding='utf-8') as f:
        f.write(head)
        f.write('来源\t源内键\t源年号\t朝代(源)\t帝王(源)\t起\t止\t库id\t库名\t得分\t政权相符\t起年差\t帝王相符\n')
        for d in sorted(detail, key=lambda d: (d[0], str(d[1]))):
            f.write('\t'.join(str(x) for x in d) + '\n')
    cnt = collections.Counter((d[0], d[5]) for d in diffs)
    now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-7))).strftime('%Y-%m-%d %H:%M')
    with open(os.path.join(a.out, '对勘报告.md'), 'w', encoding='utf-8') as f:
        f.write('# 对勘报告\n\n运行：%s（洛杉矶，PDT）；%s\n\n## 守恒检查\n' % (now, head.strip()[2:]))
        for c in cons:
            f.write('- %s\n' % c)
        f.write('\n## 差异清单行数（类别×严重度）\n\n| 类别 | 高 | 中 | 低 | 合计 |\n|---|---|---|---|---|\n')
        for c in CATS:
            h, m, l = (cnt[(c, s)] for s in ('高', '中', '低'))
            f.write('| %s | %d | %d | %d | %d |\n' % (c, h, m, l, h + m + l))
        for src in sorted(res):
            pm, un = res[src]
            f.write('\n来源 %s：源行 %d，已配 %d，源有库无 %d。\n' % (src, len(pm) + len(un), len(pm), len(un)))
    return cnt


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', required=True)
    ap.add_argument('--sources', required=True)
    ap.add_argument('--map', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--check-conservation', action='store_true')
    a = ap.parse_args()
    D, R, rows, files, res, diffs, detail, cons, ok = run(a)
    cnt = write_outputs(a, D, R, rows, files, res, diffs, detail, cons, ok)
    print('\n'.join(cons))
    print('差异清单 %d 行：' % len(diffs) + '；'.join('%s %d' % (c, sum(v for (cc, s), v in cnt.items() if cc == c)) for c in CATS))
    if a.check_conservation and not ok:
        sys.exit(2)


if __name__ == '__main__':
    main()
