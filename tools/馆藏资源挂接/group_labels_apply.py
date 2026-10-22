"""按 dry-run 清单把 resource_groups.label 写进 book-index 工作树（只改 resource_groups／revision／revised_at）。
    python3 group_labels_apply.py --root <book-index 工作树> --dryrun <group补label-dryrun.tsv> --batch 1 --revised-at 2026-10-13 [--size 200] [--write]
默认只演练（不写）。--batch 按清单里记录路径排序后切片，每批 ≤ size 条记录。
每条写前自检：除 resource_groups／revision／revised_at 外的字段、resources 逐字不变；已有组键不覆盖（幂等）；
未取出 label 的组跳过并列出。revision：次版本+1、patch 归 0。
"""
import argparse, csv, json, os, sys

ALLOWED = {'resource_groups', 'revision', 'revised_at'}


def bump(rev):
    a, b, _ = (rev or '1.0.0').split('.')
    return '%s.%d.0' % (a, int(b) + 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', required=True); ap.add_argument('--dryrun', required=True)
    ap.add_argument('--batch', type=int, required=True); ap.add_argument('--size', type=int, default=200)
    ap.add_argument('--revised-at', required=True); ap.add_argument('--write', action='store_true')
    a = ap.parse_args()
    per, skipped = {}, []
    for r in list(csv.reader(open(a.dryrun, encoding='utf-8'), delimiter='\t'))[1:]:
        path, wid, grp, lab = r[:4]
        if grp.split('-', 1)[0] not in ('nlc', 'kokusho'):
            sys.exit('前缀异常，停：' + grp)
        if not lab:
            skipped.append((path, grp, r[4])); continue
        per.setdefault(path, []).append((grp, lab))
    paths = sorted(per)[(a.batch - 1) * a.size: a.batch * a.size]
    if not paths:
        sys.exit('该批无记录')
    added = changed = 0
    for p in paths:
        fp = os.path.join(a.root, p)
        t = open(fp, encoding='utf-8').read()
        d = json.loads(t)
        before = json.loads(t)
        rg = dict(d.get('resource_groups') or {})
        new = [(g, l) for g, l in per[p] if g not in rg]
        if not new:
            continue
        for g, l in new:
            rg[g] = {'label': l}
        out = {}
        for k, v in d.items():
            out[k] = v
            if k == 'resources' and 'resource_groups' not in d:
                out['resource_groups'] = rg
        out['resource_groups'] = rg
        out['revision'] = bump(d.get('revision')); out['revised_at'] = a.revised_at
        diff = {k for k in set(out) | set(before) if out.get(k) != before.get(k)}
        assert diff <= ALLOWED, (p, diff)
        assert out['resources'] == before['resources'], p
        old_rg = before.get('resource_groups') or {}
        assert all(old_rg[k] == rg[k] for k in old_rg), p
        added += len(new); changed += 1
        if a.write:
            open(fp, 'w', encoding='utf-8').write(json.dumps(out, ensure_ascii=False, indent=2) + '\n')
    print('批 %d：记录 %d 条改动，新增组 %d；%s；未取出 label 跳过（全清单）%d 个' % (a.batch, changed, added, '已写' if a.write else '演练未写', len(skipped)))
    for s in skipped:
        print('  未处理：', *s)


main()
