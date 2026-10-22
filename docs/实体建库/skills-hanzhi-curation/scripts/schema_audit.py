#!/usr/bin/env python3
# SCHEMA.md 與實際資料的一致性普查
import json, glob, collections, os

SCHEMA = {
 'work': {'id','type','subtype','title','additional_titles','description','authors',
          'parent_works','books','related_works','additional_works','measures',
          'measure_info','book_contained_in','sources','resources','resource_groups'},
 'book': {'id','type','title','work_id','contained_in','authors','publication_info',
          'current_location','volume_count','page_count','description','indexed_by',
          'resources','location_history','related_books','sources','resource_groups'},
 'collection': {'id','type','subtype','title','description','contained_in','authors',
                'publication_info','current_location','volume_count','history','books','sources'},
 'entity': {'id','type','subtype','primary_name','alt_names','dynasty','birth_year',
            'death_year','works','external_ids','description','sources'},
}
# 散文中描述、JSON 區塊未列者
PROSE = {'work': {'indexed_by','juan_count'}, 'book': {'indexed_by'}, 'collection': set(), 'entity': set()}

use = {k: collections.Counter() for k in SCHEMA}
shape = collections.defaultdict(collections.Counter)
PAT = {'work':'Work/*/*/*/*.json','book':'Book/*/*/*/*.json',
       'collection':'Collection/*/*/*/*.json','entity':'Entity/*/*/*/*.json'}
for kind, pat in PAT.items():
    for p in glob.glob(pat):
        try: d = json.load(open(p))
        except Exception: continue
        if not isinstance(d, dict) or d.get('type') not in (kind, kind.capitalize()): continue
        use[kind].update(d.keys())
        # 值形態
        for f in ('contained_in', 'books', 'sources', 'juan_count', 'description', 'related_works'):
            v = d.get(f)
            if v is None: continue
            if isinstance(v, list):
                if not v: t = 'list(空)'
                elif isinstance(v[0], dict): t = 'list[object:' + ','.join(sorted(v[0].keys())[:3]) + ']'
                elif isinstance(v[0], str): t = 'list[string]'
                else: t = 'list[' + type(v[0]).__name__ + ']'
            elif isinstance(v, dict): t = 'object:' + ','.join(sorted(v.keys())[:3])
            else: t = type(v).__name__
            shape[f'{kind}.{f}'][t] += 1

print('=' * 70)
print('一、實際使用而 SCHEMA.md 未列之欄位（JSON 區塊）')
for kind in SCHEMA:
    extra = {f: n for f, n in use[kind].items() if f not in SCHEMA[kind]}
    if not extra: continue
    print(f'\n[{kind}] 共 {len(extra)} 個')
    for f, n in sorted(extra.items(), key=lambda x: -x[1]):
        mark = '（散文中有述）' if f in PROSE[kind] else ''
        print(f'   {f:22s} {n:7d} {mark}')

print('\n' + '=' * 70)
print('二、SCHEMA.md 列出而實際從未使用之欄位')
for kind in SCHEMA:
    unused = sorted(SCHEMA[kind] - set(use[kind]))
    if unused: print(f'   [{kind}] {unused}')

print('\n' + '=' * 70)
print('三、同一欄位的值形態不一致')
for f, c in sorted(shape.items()):
    if len(c) > 1:
        print(f'   {f}')
        for t, n in c.most_common(): print(f'        {t:42s} {n:7d}')
