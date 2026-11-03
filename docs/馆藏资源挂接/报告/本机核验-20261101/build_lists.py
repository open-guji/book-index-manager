#!/usr/bin/env python3
"""生成本机核验待核清单（只读）。用法：python -I build_lists.py <book-index-manager根> <book_index_json根> <输出目录>"""
import json, sys, glob, random, os
sys.stdout.reconfigure(encoding='utf8')
bim, bij, out = sys.argv[1:4]
rep = f'{bim}/docs/馆藏资源挂接/报告'
os.makedirs(out, exist_ok=True)
H = ['batch', 'source', 'record_id', 'work_id', 'url', 'iiif_manifest', 'must_contain']

def rows_from_plan(path, batch, only=None):
    for l in open(path, encoding='utf8'):
        r = json.loads(l)
        if only and r['source'] != only: continue
        res = r['resource']; m = res.get('metadata', {})
        yield [batch, r['source'], r['record_id'], r['work_id'], res['url'], m.get('iiif_manifest', ''), '']

def write(name, rows):
    with open(f'{out}/{name}', 'w', encoding='utf8', newline='') as f:
        f.write('\t'.join(H) + '\n')
        for r in rows: f.write('\t'.join(r) + '\n')
    print(name, len(rows))

# 1 欧美 222：onb 158 / bnf 54 / cudl 10
a8 = glob.glob(f'{bij}/library_data/_匹配/欧美六馆/A8-20261026/A8_held_onb_bnf.jsonl')[0]
write('待核-欧美222.tsv', [r for r in rows_from_plan(a8, 'A8-held')])

# 2 ARC 24：A9 备而未写 + 升档 9
arc = list(rows_from_plan(f'{rep}/A9-日本诸馆C1挂接-20261026/a9_write_plan.jsonl', 'A9-0', only='arc'))
src = json.load(open(glob.glob(f'{bij}/library_data/立命館*')[0], encoding='utf8'))
by = {r['source_record_id']: r for r in src}
fin = json.load(open(f'{rep}/A9-日本诸馆存疑升档-20261101/最终.json', encoding='utf8'))
for k, v in fin.items():
    if v['source'] == 'arc':
        r = by[k]; arc.append(['A9-升档', 'arc', k, v['work_id'], r['url'], r.get('image_url', ''), ''])
write('待核-ARC24.tsv', arc)

# 3 日本三馆抽样（国書／内閣／NDL 各 40，种子 20261101）
rnd = random.Random(20261101); jp = []
for s in ('kokusho', 'naikaku', 'ndl'):
    rows = list(rows_from_plan(f'{rep}/A2-日本三馆重跑-20261026/{s}_write_plan_终.jsonl', 'A2-' + s))
    jp += rnd.sample(rows, min(40, len(rows)))
write('待核-日本三馆抽样120.tsv', jp)
