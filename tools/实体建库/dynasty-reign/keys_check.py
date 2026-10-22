#!/usr/bin/env python3
"""朝代／年号键表体检（块 F 步 2）：只读 dynasty_reign_keys.json（可选再读库根对账），逐项 PASS/FAIL/WARN。

    python3 keys_check.py --keys <_build/dynasty_reign_keys.json> [--root <book-index>] [--out 报告.md]
退出码：有 FAIL＝1，否则 0。体检项见 计划/分块-F-键表-Edwin.md §3.1。
"""
import argparse, collections, hashlib, json, os, sys

EXT_IDS = ('cbdb', 'dila', 'chgis')


def load_lib(root):
    """库内未升格的 dynasty／reign 条：{id: entry}。"""
    lib = {}
    for dp, _, fs in os.walk(os.path.join(root, 'Entity')):
        for f in fs:
            if f.endswith('.json'):
                d = json.load(open(os.path.join(dp, f), encoding='utf-8'))
                if d.get('subtype') in ('dynasty', 'reign') and not d.get('promoted_to') and not d.get('_promoted_to'):
                    lib[d['id']] = d
    return lib


def lib_names(d, norm):
    out = [(d['primary_name'], False)]
    for al in d.get('alt_names') or []:
        if isinstance(al, dict) and al.get('name') and al.get('type') != '全稱':
            out.append((al['name'], bool(al.get('ambiguous'))))
    return [(n.translate(norm), amb) for n, amb in out]


def check(doc, lib=None, doc2=None):
    """返回 [(序号, 名称, 状态, 详情列表)]；状态 PASS／FAIL／WARN／SKIP。"""
    keys = doc.get('keys', {})
    norm = str.maketrans(doc.get('normalize') or {})
    cands = [(k, c) for k, v in keys.items() for c in v]
    dyn_ids = {c['id'] for _, c in cands if c['subtype'] == 'dynasty'}
    res = []

    def add(no, name, bad, skip=False, warn=False):
        res.append((no, name, 'SKIP' if skip else ('PASS' if not bad else ('WARN' if warn else 'FAIL')), bad[:30] + (['…共 %d 条' % len(bad)] if len(bad) > 30 else [])))

    # 1 count
    bad = []
    if doc['count'].get('keys') != len(keys):
        bad.append('count.keys=%s ≠ len(keys)=%d' % (doc['count'].get('keys'), len(keys)))
    if lib is not None:
        for st in ('dynasty', 'reign'):
            n = sum(1 for d in lib.values() if d['subtype'] == st)
            if doc['count'].get(st) != n:
                bad.append('count.%s=%s ≠ 库内 %d' % (st, doc['count'].get(st), n))
    add(1, 'count 与库对账', bad)
    # 2 每条库内名都能反查
    if lib is None:
        add(2, '库内名均可反查', [], skip=True)
    else:
        bad = []
        for i, d in sorted(lib.items()):
            for nm, _ in lib_names(d, norm):
                if i not in {c['id'] for c in keys.get(nm, [])}:
                    bad.append('%s %s：键 %r 下无该 id' % (i, d['primary_name'], nm))
        add(2, '库内名均可反查', bad)
    # 3 ambiguous
    bad, dup = [], []
    if lib is not None:
        for i, d in lib.items():
            pn = d['primary_name'].translate(norm)
            for nm, amb in lib_names(d, norm)[1:]:
                if amb:
                    if nm == pn:     # 别名与 primary_name 同名：键表取 primary 候选（不带 ambiguous），属库内冗余
                        dup.append('%s 别名 %r 与 primary_name 同名且标 ambiguous（库内冗余，键表取 primary）' % (i, nm))
                        continue
                    for c in keys.get(nm, []):
                        if c['id'] == i and not c.get('ambiguous'):
                            bad.append('%s 别名 %r 库内 ambiguous 而键表无' % (i, nm))
    for k, v in keys.items():
        al = [c for c in v if c['via'] != 'primary_name' and c['subtype'] == 'dynasty']
        if len({c['id'] for c in v if c['subtype'] == 'dynasty'}) >= 2 and any(not c.get('ambiguous') for c in al):
            bad.append('键 %r 有 ≥2 个朝代候选，但别名候选未全标 ambiguous' % k)
    add(3, 'ambiguous 对账', bad or dup, warn=not bad)
    # 4 悬空
    bad = []
    for k, c in cands:
        if c['subtype'] == 'reign' and c.get('dynasty_id') not in dyn_ids:
            bad.append('键 %r：年号 %s 的 dynasty_id %s 不在朝代候选里' % (k, c['id'], c.get('dynasty_id')))
        if c.get('parent_id') and c['parent_id'] not in dyn_ids:
            bad.append('键 %r：%s 的 parent_id %s 不在朝代候选里' % (k, c['id'], c['parent_id']))
        if lib is not None and c['id'] not in lib:
            bad.append('键 %r：候选 id %s 不在库内（已升格草稿或悬空）' % (k, c['id']))
    add(4, '无悬空 id', bad)
    # 5 起讫
    bad = []
    seen = set()
    for k, c in cands:
        if c['id'] in seen:
            continue
        seen.add(c['id'])
        s, e = c.get('start'), c.get('end')
        if s == 0 or e == 0:
            bad.append('%s %s：含 0 年（start=%s end=%s）' % (c['id'], c['primary_name'], s, e))
        elif s is not None and e is not None and s > e:
            bad.append('%s %s：start %s > end %s' % (c['id'], c['primary_name'], s, e))
    add(5, '起讫合法（start≤end、无 0 年）', bad)
    # 6 排序与确定性
    bad = []
    for k, v in keys.items():
        o = [(c['subtype'] != 'dynasty', c.get('start') or 0, c['id']) for c in v]
        if o != sorted(o):
            bad.append('键 %r 候选排序不是「朝代在前、起年升序、id」' % k)
    if doc2 is not None and json.dumps(doc, sort_keys=True) != json.dumps(doc2, sort_keys=True):
        bad.append('两次产出内容不一致')
    add(6, '排序与确定性' + ('' if doc2 is not None else '（未给第二份，只验排序）'), bad)
    # 7 重名年号消歧力（警告级：数据问题转块 C）
    bad = []
    for k, v in keys.items():
        rs = [c for c in v if c['subtype'] == 'reign' and c['via'] == 'primary_name']
        if len(rs) >= 2:
            cnt = collections.Counter((c.get('dynasty_id'), c.get('start')) for c in rs)
            for (dy, st), n in cnt.items():
                if n >= 2:
                    bad.append('年号 %r：同朝代 %s 同起年 %s 有 %d 条，文本侧无法区分' % (k, dy, st, n))
    add(7, '重名年号可消歧（同朝代同起年）', bad, warn=True)
    # 8 无外部 id 字段
    bad = []
    for k, c in cands:
        for f in c:
            if any(x in f.lower() for x in EXT_IDS):
                bad.append('键 %r：候选含外部 id 字段 %r' % (k, f))
    add(8, '不含外部 id', bad)
    return res


def report(res, meta):
    out = ['# 键表体检 %s' % meta, '']
    for no, name, st, bad in res:
        out.append('- 第 %d 项 %s：**%s**' % (no, name, st))
        out += ['  - ' + b for b in bad]
    return '\n'.join(out) + '\n'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--keys', required=True)
    ap.add_argument('--keys2', help='第二次产出，用于确定性对比')
    ap.add_argument('--root', help='book-index 库根，给了则做库对账')
    ap.add_argument('--out')
    a = ap.parse_args()
    raw = open(a.keys, 'rb').read()
    doc = json.loads(raw)
    d2 = json.load(open(a.keys2, encoding='utf-8')) if a.keys2 else None
    lib = load_lib(a.root) if a.root else None
    res = check(doc, lib, d2)
    meta = 'sha256=%s keys=%d dynasty=%s reign=%s%s' % (hashlib.sha256(raw).hexdigest()[:12], len(doc['keys']),
          doc['count'].get('dynasty'), doc['count'].get('reign'), '' if lib is not None else '（未对库）')
    txt = report(res, meta)
    print(txt)
    if a.out:
        open(a.out, 'w', encoding='utf-8').write(txt)
    sys.exit(1 if any(r[2] == 'FAIL' for r in res) else 0)


if __name__ == '__main__':
    main()
