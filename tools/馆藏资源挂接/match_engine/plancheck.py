"""写入计划校验：python3 plancheck.py --source nlc --works-root ROOT --dir OUT
1) write_plan.jsonl 每项过 resources[] 单项规则（common.md §三）；2) 每 Work 每来源（计划＋库内现有）≤3；
3) linked_draft.jsonl（已挂项按同规则重出）与库内现有项 id/group 一致率、全字段一致率。"""
import argparse
import collections
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import workindex  # noqa: E402
import exclusions  # noqa: E402
import roots  # noqa: E402

TYPES = {'image', 'text', 'physical', 'catalog', 'annotated'}
SITE = {'nlc': 'nlc', 'ncltw': 'ncl-tw', 'kokusho': 'kokusho', 'ndl': 'ndl', 'naikaku': 'nat-archives-jp', 'waseda': 'waseda'}


def check_item(it, groups):
    e = []
    for k in ('id', 'name', 'types'):
        if not it.get(k):
            e.append('缺' + k)
    if it.get('url') is None or not str(it.get('url', '')).startswith('http'):
        e.append('url')
    if not set(it.get('types') or []) <= TYPES:
        e.append('types非法')
    if 'physical' in (it.get('types') or []):
        e.append('Work层不得physical')
    if it.get('group'):
        if it.get('group_role') not in ('origin', 'mirror', 'derivative', 'source'):
            e.append('group_role')
        if not (groups.get(it['group']) or {}).get('label'):
            e.append('组缺label')
    if it.get('metadata') is not None and not isinstance(it['metadata'], dict):
        e.append('metadata非对象')
    return e


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', required=True)
    ap.add_argument('--works-root', default=roots.book_index(), help='缺省 $BOOK_INDEX 或 ../book-index')
    ap.add_argument('--dir', required=True)
    ap.add_argument('--verify-content', action='store_true', help='对 write_plan 链接做内容判据（Reid link_audit.judge），有 dead 则退出码 2')
    ap.add_argument('--sample', type=int, default=150, help='内容判据抽样条数（默认 150，分层，种子固定）；--all 全量')
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--seed', type=int, default=20261015)
    ap.add_argument('--cache', help='判据缓存：目录＝与 Reid 共享的 判据缓存/<site>.jsonl；*.jsonl＝单文件（大文件，不提交进仓）')
    ap.add_argument('--offline', action='store_true', help='只读缓存，不联网')
    ap.add_argument('--min-interval', type=float, default=2.0)
    ap.add_argument('--confirm-gap', type=int, default=600, help='dead 二次确认间隔秒')
    ap.add_argument('--overview-root', default=roots.overview(), help='读 R2/R3/R7 台账的 overview 根（缺省 $OVERVIEW_ROOT 或 ../overview）')
    ap.add_argument('--ledger-dir', help='古籍目录进度台账根；缺省按 --overview-root')
    ap.add_argument('--plan-dir', help='放 dupx-同题异作者清单.tsv 的目录；缺省按 --overview-root')
    ap.add_argument('--data-root', help='library_data 根；kokusho 时用于国書责任者闸（authorgate）')
    ap.add_argument('--no-occupancy', action='store_true', help='跳过 R1–R3/R7 占用检查（默认每批写前自动跑）')
    a = ap.parse_args()
    site, key = SITE[a.source], workindex.RECORD_KEY[SITE[a.source]]
    plan = [json.loads(l) for l in open(os.path.join(a.dir, 'write_plan.jsonl'), encoding='utf-8')]
    lnk = [json.loads(l) for l in open(os.path.join(a.dir, 'linked_draft.jsonl'), encoding='utf-8')]
    errs = collections.Counter()
    for p in plan + lnk:
        for m in check_item(p['resource'], p['resource_group']):
            errs[m] += 1
    existing = {}
    per_work = collections.Counter()
    for f in workindex.iter_work_files(a.works_root):
        d = json.load(open(f, encoding='utf-8'))
        for r in d.get('resources') or []:
            if r.get('id') == site:
                existing[(d['id'], r.get('group'))] = (r, (d.get('resource_groups') or {}).get(r.get('group'), {}))
                per_work[d['id']] += 1
    add = collections.Counter(p['work_id'] for p in plan)
    over = sum(1 for w, n in add.items() if per_work[w] + n > 3 and per_work[w] < 3)
    over_new = sum(1 for w, n in add.items() if per_work[w] + n > 3)
    for w, n in add.items():
        if per_work[w] + n > 3:
            print('OVER', w, per_work[w], n)
    idg = full = miss = 0
    diffs = collections.Counter()
    examples = []
    for p in lnk:
        it = p['resource']
        k = (p['work_id'], it['group'])
        ex = existing.get(k)
        if not ex:
            miss += 1
            continue
        r, g = ex
        ok_idg = r.get('id') == it['id'] and r.get('group') == it['group']
        idg += ok_idg
        diff = [f for f in ('types', 'group_role', 'name', 'short_name', 'url') if r.get(f) != it.get(f)]
        diff += ['md.' + m for m in set(r.get('metadata') or {}) ^ set(it['metadata'])]
        diff += ['md.' + m + '=' for m in it['metadata'] if m in (r.get('metadata') or {}) and r['metadata'][m] != it['metadata'][m]]
        if g.get('label') != p['resource_group'][it['group']]['label']:
            diff.append('label')
        for dname in diff:
            diffs[dname] += 1
        if not diff:
            full += 1
        elif len(examples) < 8:
            examples.append((k, diff, r.get('metadata'), it['metadata'], g.get('label'), p['resource_group'][it['group']]['label']))
    occ = []
    if not a.no_occupancy:
        paths = {os.path.basename(f).split('-')[0].split('.')[0]: f for f in workindex.iter_work_files(a.works_root)}
        ex = exclusions.load_exclusions(a.overview_root, set(paths), a.ledger_dir, os.path.join(a.plan_dir, 'dupx-同题异作者清单.tsv') if a.plan_dir else None)
        for p in plan:
            w = p['work_id']
            rid = p.get('source_record_id') or p.get('record_id') or ''
            if w not in paths:
                occ.append((rid, w, 'R1缺失'))
                continue
            mi = json.load(open(paths[w], encoding='utf-8')).get('merged_into')
            if mi:
                occ.append((rid, w, 'R1并条→' + mi))
            for r in sorted(ex.get(w, ())):
                occ.append((rid, w, r))
    out = dict(source=a.source, plan_items=len(plan), linked_draft=len(lnk), item_errors=dict(errs), works_over_cap_after_plan=over_new,
               works_newly_over_cap=over, occupancy_rows=len(occ), occupancy=[list(o) for o in occ], linked_not_found_in_lib=miss, id_group_same=idg, full_same=full, field_diffs=dict(diffs))
    gate_hits = []
    if a.source == 'kokusho' and a.data_root:    # K13 硬规则：国書责任（详情页本册）空／不含 Work 著者 → 不写
        import authorgate
        gate_all = authorgate.scan(plan, a.data_root, a.works_root)
        gate_hits = [(b, w, c, ev.get('book_author', '')) for b, w, c, ev in gate_all if not authorgate.is_pass(c)]
        out['author_gate_tiers'] = dict(collections.Counter(c for _, _, c, _ in gate_all))
    out['author_gate_hits'] = [list(h) for h in gate_hits]
    rc = 3 if (occ or gate_hits) else 0
    if a.verify_content:
        import linkcheck
        fetch = None if a.offline else linkcheck.Fetcher(a.min_interval)
        res = linkcheck.run([(p['work_id'], p['resource']) for p in plan], fetch, linkcheck.make_cache(a.cache),
                            None if a.all else a.sample, a.seed, a.offline, gap=a.confirm_gap)
        linkcheck.write_tsv(res['rows'], os.path.join(a.dir, 'content_check.tsv'))
        out['content'] = res['summary']
        if fetch:
            out['content']['min_gap_by_host'] = {h: (round(g, 2) if g is not None else None) for h, (g, n) in fetch.gaps().items()}
        if res['summary']['dead']:
            out.setdefault('item_errors', {})['CONTENT_FAIL'] = res['summary']['dead']
            rc = 2
        if res['summary']['unknown']:
            out['warnings'] = {'NEED_HUMAN': res['summary']['unknown']}
    print(json.dumps(out, ensure_ascii=False, indent=1))
    for e in examples:
        print(e)
    json.dump(out, open(os.path.join(a.dir, 'plancheck.json'), 'w'), ensure_ascii=False, indent=1)
    sys.exit(rc)


if __name__ == '__main__':
    main()
