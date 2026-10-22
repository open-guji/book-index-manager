#!/usr/bin/env python3
"""年号＋年数→公元（块 F 步 3 参考实现）。纯函数 lookup，只读键表；run_cases 读 测试集/纪年换算.tsv 逐条断言。

    python3 reign_year.py --keys <dynasty_reign_keys.json> --cases ../测试集/纪年换算.tsv
    python3 reign_year.py --keys <…json> --ask 萬曆 10 [--hint 明]
规则（交接档 §二·4）：公元＝start＋年数−1，改元当年算元年；公元前为负、无 0 年（前1 之后是公元1）。
越界＝换算结果 > 该年号 end（end 缺则不判）。用例的「期望公元」只许来自人工年表依据，不得拿本程序自算回填。
"""
import argparse, json, os, re, sys


DIG = {'〇': 0, '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
       '元': 1, '兩': 2, '两': 2}


def parse_n(s):
    """年数：阿拉伯数字、元、一二三…、十/二十一/廿/卅/百；失败返回 None。"""
    s = str(s).strip().rstrip('年')
    if s.isdigit():
        return int(s)
    s = s.replace('廿', '二十').replace('卅', '三十')
    if not s or any(c not in DIG and c not in '十百' for c in s):
        return None
    if '百' in s:
        h, _, rest = s.partition('百')
        return (DIG[h] if h else 1) * 100 + (parse_n(rest) or 0 if rest else 0)
    if '十' in s:
        t, _, u = s.partition('十')
        return (DIG[t] if t else 1) * 10 + (DIG[u] if u else 0)
    if len(s) == 1:
        return DIG[s]
    return int(''.join(str(DIG[c]) for c in s))      # 二〇 一类逐位


def to_ad(start, n):
    """起年 start（公元前为负）的第 n 年 → 公元年（无 0 年）。"""
    y = start + n - 1
    return y + 1 if start < 0 and y >= 0 else y


def lookup(doc, name, n, hint=None):
    """候选 [{ad, id, dynasty, ruler, start, end, in_range, via}]；hint 为朝代名（含上级，如 宋→北宋）。"""
    keys = doc['keys']
    norm = str.maketrans(doc.get('normalize') or {})
    nm = name.translate(norm)
    cs = [c for c in keys.get(nm, []) if c['subtype'] == 'reign']
    if hint:
        h = hint.translate(norm)
        hid = {c['id'] for c in keys.get(h, []) if c['subtype'] == 'dynasty'}
        parent = {c['id']: c.get('parent_id') for v in keys.values() for c in v if c['subtype'] == 'dynasty'}

        def under(d):
            seen = set()
            while d and d not in seen:
                if d in hid:
                    return True
                seen.add(d)
                d = parent.get(d)
            return False
        cs = [c for c in cs if under(c.get('dynasty_id'))]
    by_dy = {}
    for v in keys.values():
        for c in v:
            if c['subtype'] == 'reign' and c.get('start') is not None:
                by_dy.setdefault(c.get('dynasty_id'), {})[c['id']] = c
    out = []
    for c in cs:
        if c.get('start') is None:
            continue
        ad = to_ad(c['start'], n)
        e = c.get('end')
        # 同年改元：结果年恰是本年号 end，且同朝代另有年号该年起 → 新旧两候选并列，标 gaiyuan_with
        gw = sorted(i for i, o in by_dy.get(c.get('dynasty_id'), {}).items()
                    if i != c['id'] and o['start'] == ad) if e is not None and ad == e else []
        out.append({'ad': ad, 'id': c['id'], 'dynasty': c.get('dynasty'), 'ruler': c.get('ruler'),
                    'start': c['start'], 'end': e, 'in_range': e is None or ad <= e, 'via': c['via'],
                    'gaiyuan_with': gw})
    return out


def run_cases(doc, path):
    ok = bad = 0
    for ln, l in enumerate(open(path, encoding='utf-8'), 1):
        if l.startswith('#') or not l.strip() or l.startswith('用例号'):
            continue
        c = l.rstrip('\n').split('\t') + [''] * 8
        cid, text, name, n, hint, exp, basis, typ = c[:8]
        errs, warns = [], []
        if not basis.strip():
            errs.append('依据为空')
        nn = parse_n(n)
        res = lookup(doc, name, nn, hint or None) if nn else []
        inr = [r for r in res if r['in_range']]
        if exp in ('无', '不存在'):
            if res:
                errs.append('期望不存在，实得 %s' % [(r['ad'], r['dynasty']) for r in res])
        elif exp == '越界':
            if not res or inr:
                errs.append('期望越界，实得 %s' % [(r['ad'], r['in_range']) for r in res])
        else:
            if exp.lstrip('-').isdigit() is False:
                errs.append('期望公元不是整数/无/越界: %r' % exp)
            elif int(exp) not in [r['ad'] for r in inr]:
                errs.append('期望 %s 不在 %s' % (exp, [(r['ad'], r['dynasty']) for r in inr]))
            elif typ == '重名消歧' and len({r['id'] for r in inr}) != 1:
                errs.append('带朝代提示仍不唯一: %s' % [(r['ad'], r['dynasty']) for r in inr])
            if typ == '重名消歧' and hint and len({r['id'] for r in lookup(doc, name, nn)}) < 2:
                warns.append('标重名消歧但库内现仅此一条（待块 C 补同名年号后才真正消歧）')
        print(('PASS ' if not errs else 'FAIL ') + cid + ' ' + text + ('' if not errs else '  ' + '；'.join(errs))
              + ('' if not warns else '  [WARN] ' + '；'.join(warns)))
        ok += not errs
        bad += bool(errs)
    print('cases %d fail %d' % (ok + bad, bad))
    return bad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--keys', required=True)
    ap.add_argument('--cases')
    ap.add_argument('--ask', nargs=2, metavar=('年号', '年数'))
    ap.add_argument('--hint')
    a = ap.parse_args()
    doc = json.load(open(a.keys, encoding='utf-8'))
    if a.ask:
        for r in lookup(doc, a.ask[0], parse_n(a.ask[1]), a.hint):
            print(r)
        return
    sys.exit(1 if run_cases(doc, a.cases) else 0)


if __name__ == '__main__':
    main()
