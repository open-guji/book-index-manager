"""group 补 resource_groups.label 的 dry-run（只读 book-index）。
    python3 group_labels.py --root <book-index 根> [--layer Work] [--out dryrun.tsv] [--learn]
找出 resource 带 group 而 resource_groups 无该键的记录，按 metadata.edition 生成拟 label；
取不出 edition 的只列出（label 列空），不猜。--learn：用已有正确 label 反推各前缀生成规则的命中率。
"""
import argparse, collections, glob, json, os, sys


def gen_label(r):
    """按前缀给拟 label；返回 (label|None, 原因)"""
    g = r.get('group') or ''
    m = r.get('metadata') or {}
    ed = (m.get('edition') or '').strip()
    pre = g.split('-', 1)[0]
    if not ed:
        return None, '无 edition'
    if pre == 'nlc':
        return '國圖藏本：' + ed, ''
    if pre == 'kokusho':
        h = (m.get('holder') or '').strip()
        return '國書·%s%s' % (h + '藏' if h else '', ed) if h else '國書·' + ed, ''
    if pre == 'ndl':
        return 'NDL藏本：' + ed, ''
    return None, '前缀 %s 无规则' % pre


def records(root, layer):
    for f in sorted(glob.glob(os.path.join(root, layer, '**', '*.json'), recursive=True)):
        try:
            yield f, json.load(open(f, encoding='utf-8'))
        except Exception:
            continue


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', required=True); ap.add_argument('--layer', default='Work')
    ap.add_argument('--out'); ap.add_argument('--learn', action='store_true')
    a = ap.parse_args()
    learn = collections.Counter(); miss = []
    rows = []; stats = collections.Counter()
    for f, d in records(a.root, a.layer):
        rg = d.get('resource_groups') or {}
        seen = {}
        for r in d.get('resources') or []:
            g = r.get('group')
            if not g: continue
            if g in rg:
                if a.learn:
                    lab, _ = gen_label(r)
                    ok = lab == (rg[g] or {}).get('label')
                    learn[(g.split('-', 1)[0], ok)] += 1
                    if not ok and len(miss) < 15: miss.append((g, (rg[g] or {}).get('label'), lab))
                continue
            if g in seen: continue
            lab, why = gen_label(r)
            seen[g] = 1
            stats[(g.split('-', 1)[0], 'ok' if lab else why)] += 1
            rows.append((os.path.relpath(f, a.root), d.get('id'), g, lab or '', why, (r.get('metadata') or {}).get('edition', '')))
    if a.learn:
        print('已有label 复现率：', sorted(learn.items())); [print(m) for m in miss]
    for k, v in sorted(stats.items()): print(k, v)
    print('缺项 group 数', len(rows), '涉及记录', len({r[0] for r in rows}))
    if a.out:
        with open(a.out, 'w', encoding='utf-8') as f:
            f.write('路径\twork_id\tgroup\t拟label\t未取出原因\tedition\n')
            for r in rows: f.write('\t'.join(r) + '\n')


main()
