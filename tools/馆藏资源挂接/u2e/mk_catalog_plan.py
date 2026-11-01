"""U2-e：日本诸馆「无影像确定档」Book 层书目页（catalog）写入计划。2026-11-01。
输入：book_candidates.py --has-image 0 的 STRONG 行（人工剔除表另给），各馆 library_data。
输出 jsonl（write_plan_apply_r3.py 的 Book 级行格式：work_id 填 Book id，attach_level=book）。
用法：python3 mk_catalog_plan.py --cands shoryobu=bc0.tsv nagoya=bc0.tsv --allow 挂.txt --data-root <library_data> --out plan.jsonl
"""
import argparse, csv, importlib, json, os, sys, collections
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'match_engine'))
import writeplan  # noqa: E402

DETAILS = {'shoryobu': '宮内庁書陵部館藏書目頁（著錄版本、冊數；無線上影像）', 'nagoya': '名古屋大學附屬圖書館館藏書目頁（著錄版本、冊數；無線上影像）'}
SHORT = {'shoryobu': '書陵部藏本書目', 'nagoya': '名大藏本書目'}

ap = argparse.ArgumentParser()
ap.add_argument('--cands', nargs='+', required=True)
ap.add_argument('--allow', required=True, help='人工判「挂」的 record_id 清单（每行一个，# 后为注释）'); ap.add_argument('--data-root', required=True); ap.add_argument('--out', required=True)
a = ap.parse_args()
allow = set(l.split('#')[0].strip() for l in open(a.allow, encoding='utf-8')) - {''}
plan = collections.defaultdict(list); cnt = collections.Counter()
for kv in a.cands:
    s, path = kv.split('=', 1)
    recs = {x['source_record_id']: x for x in importlib.import_module('adapters.' + s).load(a.data_root)}
    for r in csv.DictReader(open(path, encoding='utf-8'), delimiter='\t'):
        if r['level'] != 'STRONG' or ',' in r['book_ids'] or r['record_id'] not in allow: cnt['skip'] += 1; continue
        if r['book_already_has_source'] == '1': cnt['book已有该馆'] += 1; continue
        rec = dict(recs[r['record_id']], has_image=True)
        made = writeplan.make_item(s, rec)
        item, grp, label = made
        item['types'] = ['catalog']; item['details'] = DETAILS[s]
        label = SHORT[s] + label[label.index('：'):] if '：' in label else SHORT[s]
        plan[r['book_ids']].append({'work_id': r['book_ids'], 'attach_level': 'book', 'source': s, 'resource': item,
                                    'resource_group': {grp: {'label': label}}, 'record_id': r['record_id'], 'title': r['work_title']})
url2b = collections.defaultdict(set)
for b, l in plan.items():
    for x in l: url2b[x['resource']['url']].add(b)
n = 0
with open(a.out, 'w', encoding='utf-8') as f:
    for b, l in plan.items():
        seen = set(); l = [x for x in l if x['resource']['url'] not in seen and not seen.add(x['resource']['url'])]
        l = [x for x in l if len(url2b[x['resource']['url']]) == 1]
        l.sort(key=lambda x: x['resource']['group'])
        for x in l[:3]: f.write(json.dumps(x, ensure_ascii=False) + '\n'); n += 1
print('plan', n, dict(cnt))
