#!/usr/bin/env python3
"""块 E 步 1：从 book-index 盘点（帝王，朝代）对与年号序列。
用法：python3 ruler_pairs.py <book-index 根> > 对照底表.tsv   （库指纹写在 # 注释行）
列：库内ruler.name｜朝代｜朝代id｜年号数｜年号序列｜reign_ids"""
import json, os, sys, subprocess, collections
root = sys.argv[1]
D = {}; R = []
for dp, _, fs in os.walk(os.path.join(root, 'Entity')):
    for f in fs:
        if not f.endswith('.json'): continue
        d = json.load(open(os.path.join(dp, f), encoding='utf-8'))
        s = d.get('subtype')
        if s == 'dynasty': D[d['id']] = d
        elif s == 'reign': R.append(d)
fp = subprocess.run(['git', '-C', root, 'rev-parse', '--short=10', 'HEAD'], capture_output=True, text=True).stdout.strip()
pairs = collections.defaultdict(list)
for r in R:
    pairs[(r['ruler']['name'], r['dynasty_id'])].append(r)
print(f'# book-index {fp}; reign={len(R)}; dynasty={len(D)}; pairs(name,dynasty_id)={len(pairs)}')
print('库内ruler.name\t朝代\t朝代id\t年号数\t年号序列\treign_ids')
for (n, did), rs in sorted(pairs.items(), key=lambda kv: (D[kv[0][1]]['primary_name'], min(r['dates']['start'] for r in kv[1]))):
    rs.sort(key=lambda r: r['dates']['start'])
    seq = '；'.join(f"{r['primary_name']}({r['dates']['start']}-{r['dates'].get('end','')})" for r in rs)
    print('\t'.join([n, D[did]['primary_name'], did, str(len(rs)), seq, ','.join(r['id'] for r in rs)]))
