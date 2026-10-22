#!/usr/bin/env python3
"""块 E 步 2：对带族姓前缀的 ruler.name，查人物库主名，产出拟名。
用法：python3 ruler_names.py <book-index 根> 对照底表.tsv"""
import json, os, sys, collections
root, base = sys.argv[1], sys.argv[2]
CLANS = ['愛新覺羅', '孛兒只斤', '完顏', '耶律', '拓跋', '禿髮', '宇文', '慕容', '爾朱', '賀蘭', '獨孤', '長孫', '元']
P = collections.defaultdict(list)
for dp, _, fs in os.walk(os.path.join(root, 'Entity')):
    for f in fs:
        if not f.endswith('.json'): continue
        d = json.load(open(os.path.join(dp, f), encoding='utf-8'))
        if d.get('subtype') in ('dynasty', 'reign', 'place', 'office') or d.get('merged_into'): continue
        if d.get('type') != 'entity': continue
        P[d.get('primary_name')].append(d)
print('库内ruler.name\t朝代\t命中族姓\t去族姓名\t人物库:全名主名条\t人物库:去族姓主名条\t建议')
for l in open(base, encoding='utf-8'):
    if l.startswith('#') or l.startswith('库内'): continue
    n, dy = l.split('\t')[:2]
    c = next((c for c in CLANS[:-1] if n.startswith(c) and len(n) > len(c)), None)
    if not c: continue
    s = n[len(c):]
    a, b = [x.get('dynasty') for x in P.get(n, [])], [x.get('dynasty') for x in P.get(s, [])]
    sug = '从人物库全名' if a and not b else ('去族姓' if b and not a else ('待Sasha定' if a and b else '去族姓（人物库均无条）'))
    print(f'{n}\t{dy}\t{c}\t{s}\t{a}\t{b}\t{sug}')
