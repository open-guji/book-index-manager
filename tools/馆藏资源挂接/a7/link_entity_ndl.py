"""python3 link_entity_ndl.py <new-works-ndl.jsonl> [--write]（在 book-index 根下跑）
新建 NDL Work 的著者：现库同名同朝代只有一个 Entity（Work 用例与 Entity 名表都唯一且一致）才挂 entity_id。"""
import json, glob, collections, sys
new = [json.loads(l) for l in open(sys.argv[1])]
newids = {r['rec']['id'] for r in new if r['rec']['type'] == 'work'}
use = collections.defaultdict(set); ent = collections.defaultdict(set)
for f in glob.glob('Entity/*/*/*/*.json'):
    d = json.load(open(f))
    if d.get('merged_into') or d.get('subtype') != 'people': continue
    for n in [d.get('primary_name')] + [a if isinstance(a, str) else a.get('name') for a in d.get('aliases', []) or []]:
        if n: ent[(n, d.get('dynasty'))].add(d['id'])
for f in glob.glob('Work/*/*/*/*.json'):
    d = json.load(open(f))
    if d.get('id') in newids or d.get('merged_into'): continue
    for a in d.get('authors') or []:
        if a.get('entity_id'): use[(a.get('name'), a.get('dynasty'))].add(a['entity_id'])
FAMOUS = {'蘇軾', '裴度', '徐浩', '裴休', '阮元', '錢泳', '冷枚'}  # 二字名同名風險大，只留名家
out = []
for r in new:
    w = r['rec']
    if w['type'] != 'work': continue
    ch = False
    for a in w.get('authors', []):
        k = (a['name'], a.get('dynasty')); u, e = use.get(k, set()), ent.get(k, set())
        ids = u | e
        if len(ids) == 1 and (len(a['name']) >= 3 or a['name'] in FAMOUS):
            a['entity_id'] = next(iter(ids)); ch = True
        out.append((w['id'], a['name'], a.get('dynasty'), len(u), len(e), a.get('entity_id', '')))
    if ch:
        if '--write' in sys.argv:
            json.dump(w, open(r['path'], 'w', encoding='utf-8'), ensure_ascii=False, indent=2); open(r['path'], 'a').write('\n')
for o in out: print(*o, sep='\t')
