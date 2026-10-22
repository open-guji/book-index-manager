"""K2 Book 层 resources 草案：把人工判「挂」的候选行转成 Book 层 resources 追加 patch（只出草案，不写库）。
输入：K2 候选清单 tsv（末列「人工判」＝挂）、各来源 library_data；输出 jsonl，一行一 Book：
  {book_id, work_id, add_resources:[…], resource_groups:{group:{label}}, from:[{source, record_id}], book_edition, site_version}
resources 项形状同 K1–K11（writeplan.make_item）；Book 层 types 取 image。
"""
import argparse
import csv
import importlib
import json
import os
import sys
import collections

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import writeplan  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--list', required=True)
    ap.add_argument('--data-root', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    rows = [r for r in csv.DictReader(open(a.list, encoding='utf-8'), delimiter='\t') if r['人工判'] == '挂']
    recs = {}
    for s in sorted({r['source'] for r in rows}):
        recs[s] = {x['source_record_id']: x for x in importlib.import_module('adapters.' + s).load(a.data_root)}
    by_book = collections.OrderedDict()
    for r in rows:
        rec = recs[r['source']].get(r['record_id'])
        made = writeplan.make_item(r['source'], rec) if rec else None
        if made is None:
            raise SystemExit('无法生成资源项：%s %s' % (r['source'], r['record_id']))
        item, grp, label = made
        bids = r['book_ids'].split(',')
        if len(bids) != 1:
            raise SystemExit('挂的行 Book 不唯一：%s' % r['record_id'])
        d = by_book.setdefault(bids[0], dict(book_id=bids[0], work_id=r['work_id'], add_resources=[], resource_groups={}, **{'from': []},
                                             book_edition=r['book_editions'], site_version=[]))
        d['add_resources'].append(item)
        d['resource_groups'][grp] = {'label': label}
        d['from'].append(dict(source=r['source'], record_id=r['record_id']))
        d['site_version'].append(r['site_version'])
    with open(a.out, 'w', encoding='utf-8') as f:
        for d in by_book.values():
            f.write(json.dumps(d, ensure_ascii=False) + '\n')
    print(len(rows), '行「挂」→', len(by_book), '本 Book')


main()
