"""块 D 步 5：同书成组。

* 国書：以 raw.detail.work[0].wid（国書「著作」id）成组；责任者缺失的书志借组内兄弟的责任者（组内名字并集 >4 则不借）；
  组内确定档指向 ≥2 个 Work 的，全部降存疑（GROUP_SPLIT）。
* NDL：按（归一题名, 责任者原串, 版本原串）成组＝一个藏本，一组出一行，影像取组内第一个有影像的册。
* 国图：每条自成一组（group_key 空）。
本模块是纯函数／纯数据整理，不判三档；与 tier.judge 的接口＝记录里的 parsed.names／parsed.borrowed 与 force 码。
"""
import collections

from normalize import norm_title

MAX_BORROW_NAMES = 4


def kokusho_wid(rec):
    det = (rec.get('raw') or {}).get('detail') or {}
    w = det.get('work') or []
    return str(w[0].get('wid', '')) if w else ''


def group_names(parsed_by_wid):
    """parsed_by_wid: {wid: [names 集合...]} → {wid: 组内名字并集}（并集过杂的不借）。"""
    out = {}
    for wid, sets in parsed_by_wid.items():
        u = set().union(*sets) if sets else set()
        if u and len(u) <= MAX_BORROW_NAMES:
            out[wid] = u
    return out


def kokusho_group_count(records):
    return len({kokusho_wid(r) for r in records})


def ndl_groups(records):
    """→ OrderedDict[(归一题名, 责任者, 版本)] -> [records]（NDL 按册著录，按键归并成藏本）。"""
    g = collections.OrderedDict()
    for r in records:
        k = (norm_title(r.get('bookName') or r.get('title_raw') or ''), r.get('author', r.get('author_raw', '')), r.get('version', r.get('version_raw', '')))
        g.setdefault(k, []).append(r)
    return g


def load_whitelist(overview_root, plan_dir=None):
    """合刻组白名单（Sabine 维护，overview 计划/合刻组白名单.tsv）→ {(site, group_key): {work_id...} 或 空集＝不限}。"""
    import os
    out = {}
    from exclusions import default_plan_dir
    plan_dir = plan_dir or default_plan_dir(overview_root)
    if not plan_dir:
        return out
    f = os.path.join(plan_dir, '合刻组白名单.tsv')
    if not os.path.exists(f):
        return out
    for line in open(f, encoding='utf-8'):
        if line.startswith('#') or line.startswith('group_key') or not line.strip():
            continue
        p = line.rstrip('\n').split('\t')
        if len(p) >= 2 and p[0].strip() and p[1].strip():
            ws = {x.strip() for x in (p[2] if len(p) > 2 else '').split(',') if x.strip()}
            out.setdefault((p[1].strip(), p[0].strip()), set()).update(ws)
    return out


def apply_group_split(rows, site='kokusho', whitelist=None):
    """rows：已判定的行（dict：group_key／tier／work_id／codes list）。就地修改：
    同 group_key 的确定档指向 >1 个 Work → 这些行全部降存疑并加 GROUP_SPLIT。返回被降级的组数。
    whitelist：{(site, group_key): {Work id}}；命中的组，涉及Work 为空则整组免降，非空则只免降指向这些 Work 的行
    （这些行也不计入“多 Work”判断，其余 Work 仍按规则）。"""
    whitelist = whitelist or {}

    def exempt(r):
        w = whitelist.get((site, r.get('group_key')))
        return w is not None and (not w or r['work_id'] in w)
    gw = collections.defaultdict(set)
    for r in rows:
        if r['tier'] == '确定' and r.get('group_key') and not exempt(r):
            gw[r['group_key']].add(r['work_id'])
    bad = {k for k, v in gw.items() if len(v) > 1}
    for r in rows:
        if r['tier'] == '确定' and r.get('group_key') in bad and not exempt(r):
            r['tier'] = '存疑'
            r['codes'] = list(r['codes']) + ['GROUP_SPLIT']
    return len(bad)
