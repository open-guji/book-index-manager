#!/usr/bin/env python3
"""period 軸體檢：覆蓋率、枚舉合法、逾上限、索引同步、缺代者之構成。

每輪回填之後跑一次，數字可與前輪逐項比對。

用法：python3 scripts/period_health_check.py
"""
import json, glob, os, re, sys, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from period_bounds import PERIOD_YEARS, ORD

VALID = set(ORD)


def main():
    works = {}
    for p in glob.glob('Work/*/*/*/*.json'):
        if not re.match(r'^1[a-z0-9]{12}-', os.path.basename(p)):
            continue
        try:
            d = json.load(open(p, encoding='utf-8'))
        except Exception:
            print(f'!! JSON 壞檔 {p}')
            continue
        if d.get('type') != 'work' or d.get('_promoted_to') or d.get('promoted_to'):
            continue
        works[d['id']] = d

    n = len(works)
    has = [d for d in works.values() if d.get('period')]
    no = [d for d in works.values() if not d.get('period')]
    noup = [d for d in no if not d.get('period_upper')]
    print(f'活躍 Work {n}')
    print(f'  有 period {len(has)} ({len(has)/n:.1%})　缺 {len(no)} ({len(no)/n:.1%})')
    print(f'  缺 period 且缺上限 {len(noup)}')

    bad = [d['id'] for d in works.values()
           if d.get('period') and d['period'] not in VALID]
    badu = [d['id'] for d in works.values()
            if d.get('period_upper') and d['period_upper'] not in VALID]
    print(f'  枚舉不合：period {len(bad)}　upper {len(badu)}')

    over = [(d['id'], d.get('title'), d['period'], d['period_upper'])
            for d in works.values()
            if d.get('period') and d.get('period_upper')
            and PERIOD_YEARS[d['period']][0] > PERIOD_YEARS[d['period_upper']][1]]
    print(f'  period 逾上限 {len(over)}')
    for o in over[:5]:
        print(f'    {o[1]} {o[2]}>{o[3]}')

    IW = {}
    for s in '0123456789abcdef':
        IW.update(json.load(open(f'index/works/{s}.json')))
    mis = sum(1 for i, d in works.items()
              if i in IW and IW[i].get('period') != d.get('period'))
    orphan = sum(1 for i in works if i not in IW)
    print(f'  index period 不同步 {mis}　work 不在 index {orphan}')

    print('\n缺 period 者之構成：')
    cat = collections.Counter()
    for d in no:
        a = d.get('authors') or []
        if any(x.get('dynasty') for x in a):
            cat['A 撰人朝代歧義或非中土'] += 1
        elif any(x.get('entity_id') for x in a):
            cat['B 繫 entity 而 entity 無代'] += 1
        elif any(x.get('name') for x in a):
            cat['C 有名而無他證'] += 1
        else:
            cat['D 無撰人'] += 1
    for k, v in cat.most_common():
        print(f'  {k}: {v}')

    print('\n分代分佈：')
    for k, v in collections.Counter(d['period'] for d in has).most_common():
        print(f'  {k}: {v}')


if __name__ == '__main__':
    main()
