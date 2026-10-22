"""把确定档 write_plan.jsonl 写进 book-index 工作树（R3 副本：write_plan_apply.py 加 naikaku/waseda 站名与 R3 ai_note）。
    python3 write_plan_apply.py --root <book-index> --plan <write_plan.jsonl> --revised-at 2026-10-13 [--write]
默认只演练。只改 resources／resource_groups／revision／revised_at／ai_note；已有 resources 逐项不变（只在末尾追加）；
幂等：同 group 或同 url 已在则跳过；Work 不存在／已并（merged_into）跳过；同来源藏本写后超 3 个则跳过；全部跳过项列出，不静默。
"""
import argparse, collections, json, os, sys

ALLOWED = {'resources', 'resource_groups', 'revision', 'revised_at', 'ai_note'}
SITE = {'nlc': '國圖', 'kokusho': '國書', 'ndl': 'NDL', 'naikaku': '內閣文庫', 'waseda': '早稲田'}


def bump(rev):
    a, b, _ = (rev or '1.0.0').split('.')
    return '%s.%d.0' % (a, int(b) + 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', required=True); ap.add_argument('--plan', required=True)
    ap.add_argument('--revised-at', required=True); ap.add_argument('--write', action='store_true')
    a = ap.parse_args()
    idx = {}
    for sub in ('Work', 'Book'):   # Book 级行（plan 里 work_id 填 Book id，attach_level=book）
        for dp, dn, fn in os.walk(os.path.join(a.root, sub)):
            for f in fn:
                if f.endswith('.json'):
                    idx[f.split('-')[0]] = os.path.join(dp, f)
    per = collections.OrderedDict()
    for l in open(a.plan, encoding='utf-8'):
        if l.strip():
            r = json.loads(l); per.setdefault(r['work_id'], []).append(r)
    stat = collections.Counter(); skipped = []; files = []
    for wid, rows in per.items():
        fp = idx.get(wid)
        if not fp:
            skipped.append((wid, 'WORK_MISSING')); stat['skip_missing'] += len(rows); continue
        raw = open(fp, encoding='utf-8').read()
        before = json.loads(raw)
        ind = len(raw.split('\n')[1]) - len(raw.split('\n')[1].lstrip(' '))   # 沿用原文件缩进，免整文件重排
        if before.get('merged_into'):
            skipped.append((wid, 'MERGED_INTO')); stat['skip_merged'] += len(rows); continue
        d = json.loads(json.dumps(before))
        res = d.setdefault('resources', []); rg = dict(d.get('resource_groups') or {})
        n_add = collections.Counter()
        for r in rows:
            it = r['resource']; g = it['group']
            if g in rg or any(x.get('group') == g or x.get('url') == it['url'] for x in res):
                skipped.append((wid, 'ALREADY ' + g)); stat['skip_already'] += 1; continue
            if sum(1 for x in res if x.get('id') == it['id']) >= 3:
                skipped.append((wid, 'CAP ' + g)); stat['skip_cap'] += 1; continue
            res.append(it); rg.update(r['resource_group']); n_add[r['source']] += 1; stat['add_' + r['source']] += 1
        if not n_add:
            continue
        d['resource_groups'] = rg
        d['revision'] = bump(d.get('revision')); d['revised_at'] = a.revised_at
        note = a.revised_at + ' R3 馆藏挂接：按确定档补挂 ' + '、'.join('%s %d 条' % (SITE[s], n) for s, n in n_add.items()) + '（影像）。依据见 overview 馆藏资源挂接/计划/R3-首批核对报告-Rowan.md。'
        d['ai_note'] = ((d.get('ai_note') or '') + '\n\n' + note).strip()
        diff = {k for k in set(d) | set(before) if d.get(k) != before.get(k)}
        assert diff <= ALLOWED, (wid, diff)
        assert d['resources'][:len(before.get('resources') or [])] == (before.get('resources') or []), wid
        files.append(fp)
        if a.write:
            open(fp, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=ind or 2) + '\n')
    print(dict(stat), 'works_changed', len(files), '(已写)' if a.write else '(演练未写)')
    for s in skipped[:40]:
        print('  skip', *s)
    open(os.environ.get('FILES_OUT', '/dev/null'), 'w', encoding='utf-8').write('\n'.join(files) + '\n')


main()
