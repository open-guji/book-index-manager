"""按人工／复核者选定的（记录号→Work）生成 write_plan.jsonl（L5，2026-11-12）。
用于存疑档中候选唯一可定的行：引擎不升档，由复核者逐条选同书后，用本脚本走与确定档同一套 writeplan 规则（K6–K9、已挂幂等、每 Work ≤3 藏本）。
    python3 plan_from_choices.py --source bsb --choices ch.tsv --works-root <book-index> --out DIR
choices.tsv：两列 source_record_id、work_id，无表头。"""
import argparse
import csv
import importlib
import json
import os

import tier
import workindex
import writeplan
import roots


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', required=True)
    ap.add_argument('--choices', required=True)
    ap.add_argument('--works-root', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--data-root')
    a = ap.parse_args()
    data_root = a.data_root or roots.library_data()
    if a.source in tier.EURO:
        from adapters import euro
        recs = euro.load(data_root, a.source)
    else:
        recs = importlib.import_module('adapters.' + a.source).load(data_root)
    by_id = {r['source_record_id']: r for r in recs}
    choice = {}
    for p in csv.reader(open(a.choices, encoding='utf-8'), delimiter='\t'):
        if len(p) >= 2:
            choice[p[0]] = p[1]
    res = workindex.Resources.scan(a.works_root)
    rows = []
    for rid, wid in choice.items():
        r = by_id.get(rid)
        if not r or not r.get('has_image'):
            continue
        mk = writeplan.make_item(a.source, r)
        rows.append(dict(rec=r, tier='确定', work_id=wid, codes=[], excluded='',
                         already_linked=res.already_linked(a.source, rid, wid, mk[1] if mk else None)))
    plan, dropped, linked = writeplan.build(a.source, rows, res.existing_groups(a.source))
    os.makedirs(a.out, exist_ok=True)
    with open(os.path.join(a.out, 'write_plan.jsonl'), 'w', encoding='utf-8') as f:
        for p in plan:
            f.write(json.dumps(p, ensure_ascii=False) + '\n')
    print(a.source, 'choices', len(choice), 'plan', len(plan), 'dropped', len(dropped), 'linked', len(linked))


if __name__ == '__main__':
    main()
