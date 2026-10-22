#!/usr/bin/env python3
"""馆藏资源挂接 B 块：全库 resources 静态体检（只读）。
用法（在 book-index 仓根）：python3 -I <本脚本> OUT.tsv
问题类：dup（同记录内 url 或 (id,group) 重复）｜dupx（同一 url 挂在多条记录）｜id（缺失或格式不合）
｜type（types 缺失、取值不合、仅有旧 type）｜layer（Work 层写 physical，K4）｜group（group 缺 role、role 不合、group 不在 resource_groups、resource_groups 键无人引用）
口径依据：项目进展/馆藏资源挂接/计划/口径.md。链接可达另跑，不在此脚本。"""
import os, sys, json, re, collections
TYPES = {'image', 'text', 'physical', 'catalog', 'annotated'}
ROLES = {'origin', 'mirror', 'derivative', 'source'}
IDRE = re.compile(r'^[a-z0-9][a-z0-9_-]*$')
out = sys.argv[1]
rows = []
byurl = collections.defaultdict(list)
for fam in ('Work', 'Book'):
    for d, _, fs in os.walk(fam):
        for f in fs:
            if not f.endswith('.json'): continue
            p = os.path.join(d, f)
            try: j = json.load(open(p, encoding='utf-8'))
            except Exception: continue
            if j.get('merged_into'): continue
            rs = j.get('resources') or []
            rg = j.get('resource_groups') or {}
            seen_url = {}; seen_ig = {}; used = set()
            for i, r in enumerate(rs):
                def add(prob, ev, sug='fix'):
                    rows.append((p, fam, i, r.get('id') or '', r.get('url') or '', prob, sug, ev))
                rid = r.get('id'); url = r.get('url'); g = r.get('group')
                if not rid: add('id', '缺 id')
                elif not IDRE.match(rid): add('id', '格式不合:' + rid)
                ts = r.get('types')
                if ts is None:
                    add('type', '仅旧 type=%s' % r.get('type') if r.get('type') else '缺 types')
                elif not ts or not set(ts) <= TYPES:
                    add('type', '取值不合:%s' % ts)
                if fam == 'Work' and ts and 'physical' in ts: add('layer', 'Work 层 physical', 'migrate')
                if url:
                    if url in seen_url: add('dup', 'url 与第%d条重复' % seen_url[url], 'delete')
                    else: seen_url[url] = i
                    byurl[url].append((p, i))
                if (rid, g) in seen_ig and g: add('dup', '(id,group) 与第%d条重复' % seen_ig[(rid, g)], 'fix')
                else: seen_ig[(rid, g)] = i
                if g:
                    used.add(g)
                    if g not in rg: add('group', 'group 不在 resource_groups:' + g)
                    if r.get('group_role') not in ROLES: add('group', 'group_role 缺或不合:%s' % r.get('group_role'))
            for k in rg:
                if k not in used: rows.append((p, fam, -1, '', '', 'group', 'fix', 'resource_groups 键无人引用:' + k))
for url, locs in byurl.items():
    paths = {p for p, _ in locs}
    if len(paths) > 1:
        for p, i in locs: rows.append((p, p.split('/')[0], i, '', url, 'dupx', 'fix', '同 url 见于 %d 条记录' % len(paths)))
with open(out, 'w', encoding='utf-8') as fo:
    fo.write('file\tlayer\tres_index\tsite\turl\tproblem\tsuggest\tevidence\n')
    for r in rows: fo.write('\t'.join(str(x).replace('\t', ' ') for x in r) + '\n')
c = collections.Counter(r[5] for r in rows)
print(len(rows), dict(c))
