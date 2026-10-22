#!/usr/bin/env python3
"""块 E 步 5：拟名对人物库匹配，列缺条／待消歧帝王。
用法：python3 ruler_demand.py <book-index 根> 对照底表.tsv ruler改名清单.tsv > 帝王需求单-Soren.tsv"""
import json, os, sys, collections
root, base, ren = sys.argv[1:4]
newname = {}
for l in list(open(ren, encoding='utf-8'))[1:]:
    rid, old, new = l.split('\t')[:3]; newname[old] = new
P = collections.defaultdict(list)
for dp, _, fs in os.walk(os.path.join(root, 'Entity')):
    for f in fs:
        if not f.endswith('.json'): continue
        d = json.load(open(os.path.join(dp, f), encoding='utf-8'))
        if d.get('subtype') in ('dynasty', 'reign', 'place', 'office') or d.get('merged_into') or d.get('type') != 'entity': continue
        names = [d.get('primary_name')] + [a['name'] if isinstance(a, dict) else a for a in d.get('alt_names', [])]
        for n in set(names):
            if n: P[n].append(d)
print('拟本名\t朝代\t年号序列\t人物库现状\t候选(id:朝代)')
cnt = collections.Counter()
for l in open(base, encoding='utf-8'):
    if l.startswith('#') or l.startswith('库内'): continue
    c = l.rstrip('\n').split('\t')
    n, dy = c[0], c[1]; n = newname.get(n, n)
    cand = P.get(n, [])
    same = [x for x in cand if x.get('dynasty') == dy]
    if not cand: st = '无条'
    elif len(same) == 1: st = '已有（朝代相符）'
    elif len(same) > 1: st = '同朝代多条待消歧'
    else: st = '有同名条但朝代不符或未填，待消歧'
    cnt[st] += 1
    if st == '已有（朝代相符）': continue
    print('\t'.join([n, dy, c[4], st, '；'.join(f"{x['id']}:{x.get('dynasty')}" for x in cand)]))
print('#', dict(cnt), file=sys.stderr)
