"""国書既有已落库项一致性筛（Everett，2026-10-15）：不用引擎判定，独立比 站方题名／著者 与所挂 Work 的题名（含 additional_titles）／著者。
用法：python3 kokusho_exist_screen.py --matches <engine kokusho matches.tsv> --works-root <book-index 根> --out <tsv>
题名关系：exact（折叠后全等）｜sub（一方含另一方）｜diff。著者关系：eq（名字集相交）｜diff｜lib缺｜work缺。
分类：OK＝exact∧eq；其余按下列给出 flag 列，供人核；不动库。"""
import argparse
import csv
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import normalize as n
import workindex

csv.field_size_limit(10 ** 8)


def titles(d):
    ts = [d.get('title', '')]
    for t in d.get('additional_titles') or []:
        ts.append(t if isinstance(t, str) else (t.get('title') or ''))
    return [x for x in ts if x]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--matches', required=True)
    ap.add_argument('--works-root', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    res = workindex.Resources.scan(a.works_root)
    path = {os.path.basename(f).split('-')[0].split('.')[0]: f for f in workindex.iter_work_files(a.works_root)}
    M = {r['source_record_id']: r for r in csv.DictReader(open(a.matches, encoding='utf-8'), delimiter='\t')}
    rows = []
    for (s, k), ws in res.linked.items():
        if s != 'kokusho' or k.startswith('group:'):
            continue
        r = M.get(k)
        for w in ws:
            d = json.load(open(path[w], encoding='utf-8'))
            lt = n.norm_title(r['lib_title']) if r else ''
            wts = [n.norm_title(t) for t in titles(d)]
            trel = 'exact' if lt in wts else ('sub' if any(lt and t and (lt in t or t in lt) for t in wts) else 'diff')
            lnames, _ = n.parse_kokusho_author(r['lib_author']) if r else (set(), None)
            lset = {n.fold(x) for x in lnames}
            wset = {n.fold(n.norm_author(x.get('name', ''))) for x in d.get('authors') or [] if x.get('name')}
            wset = {x for x in wset if x}
            if not lset:
                arel = 'lib缺'
            elif not wset:
                arel = 'work缺'
            else:
                arel = 'eq' if any(a_ == b or a_ in b or b in a_ for a_ in lset for b in wset) else 'diff'
            flag = '' if (trel == 'exact' and arel == 'eq') else ('题名' + trel if trel != 'exact' else '') + ('/' if trel != 'exact' and arel != 'eq' else '') + ('著者' + arel if arel != 'eq' else '')
            rows.append(dict(kokusho_bid=k, work_id=w, work_title=d.get('title', ''), lib_title=r['lib_title'] if r else '', lib_author=r['lib_author'] if r else '',
                             work_authors='/'.join(x.get('name', '') for x in d.get('authors') or []), 题名关系=trel, 著者关系=arel, flag=flag,
                             引擎tier=r['tier'] if r else '无记录', 引擎work=r['work_id'] if r else '', reason_codes=r['reason_codes'] if r else '', url=r['url'] if r else ''))
    rows.sort(key=lambda x: (x['flag'] == '', x['flag'], x['work_id']))
    with open(a.out, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]), delimiter='\t')
        w.writeheader()
        w.writerows(rows)
    import collections
    print(len(rows), dict(collections.Counter(x['flag'] or 'OK' for x in rows)))


if __name__ == '__main__':
    main()
