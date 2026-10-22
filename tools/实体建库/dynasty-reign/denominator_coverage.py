#!/usr/bin/env python3
"""用归一键对 分母-两源一致.tsv 精算库内覆盖，输出库缺哪几条（块 B，Sasha 10-12 要求①）。

    python3 denominator_coverage.py --root <book-index> --denom 分母产出/分母-两源一致.tsv --map 政权映射.tsv --out 对勘产出/分母覆盖-两源一致.tsv
配对口径：归一年号名（含别名）相同，且 起年与维基起或 DILA 起任一相差 ≤2、或朝代落在映射内；一对一贪心（得分高者先）。
"""
import argparse, collections, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import recon_reign as rr
from guji_norm import norm_name


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', required=True)
    ap.add_argument('--denom', required=True)
    ap.add_argument('--map', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    D, R = rr.load_library(a.root)
    idx = rr.lib_index(R)
    dmap = rr.load_map(a.map)
    rows = [l.rstrip('\n').split('\t') for l in open(a.denom, encoding='utf-8')][1:]
    groups = collections.defaultdict(list)
    for i, r in enumerate(rows):
        groups[norm_name(r[0])].append(i)
    status = {}      # i -> (lib_id, 判据)
    used = set()
    for nm, ids in groups.items():
        cands = []
        for i in ids:
            name, wdyn, wst, ddyn, dst = rows[i]
            ws, ds = int(wst), int(dst)
            mids = {m[0] for m in dmap.get(('zhwp-中国年号列表', wdyn), []) if m[0]}
            for r in idx.get(nm, []):
                ls = (r.get('dates') or {}).get('start')
                dyn_ok = r.get('dynasty_id') in mids
                diff = min(abs(ws - ls), abs(ds - ls)) if ls is not None else None
                if dyn_ok or (diff is not None and diff <= 2):
                    sc = (3 if dyn_ok else 0) + {0: 3, 1: 2, 2: 1}.get(diff, 0)
                    cands.append((-sc, r['id'], i, '朝代+起年' if dyn_ok and diff is not None and diff <= 2 else ('仅朝代' if dyn_ok else '仅起年'), diff))
        for sc, lid, i, why, diff in sorted(cands, key=lambda t: t[:3]):
            if i in status or lid in used:
                continue
            status[i] = (lid, why, diff); used.add(lid)
    miss = [i for i in range(len(rows)) if i not in status]
    note = {}      # 库缺行 -> 同朝同名库条（多为跨帝／沿用分段，未必真缺）
    for i in miss:
        mids = {m[0] for m in dmap.get(('zhwp-中国年号列表', rows[i][1]), []) if m[0]}
        same = [r for r in idx.get(norm_name(rows[i][0]), []) if r.get('dynasty_id') in mids]
        if same:
            note[i] = '同朝同名库条：' + '；'.join('%s %s-%s' % (r['id'], (r.get('dates') or {}).get('start'), (r.get('dates') or {}).get('end')) for r in same)
    with open(a.out, 'w', encoding='utf-8') as f:
        f.write('# 分母-两源一致 %d 条 → 库内覆盖 %d，库缺 %d（归一键配对，库根=%s）\n' % (len(rows), len(status), len(miss), a.root))
        f.write('年号\t维基朝代\t维基起\tDILA朝代\tDILA起\t结果\t库id\t配对依据\t起年差\t备注\n')
        for i, r in enumerate(rows):
            s = status.get(i)
            f.write('\t'.join(r + (['库有', s[0], s[1], '' if s[2] is None else str(s[2])] if s else ['库缺', '', '', '', note.get(i, '')])) + '\n')
    print('两源一致 %d：库有 %d，库缺 %d' % (len(rows), len(status), len(miss)))
    for i in miss:
        print('  库缺：', '｜'.join(rows[i]), ('  ← ' + note[i]) if i in note else '')
    print('其中同朝同名库条已存在（多为沿用／跨帝分段）%d，彻底无同名库条 %d' % (len(note), len(miss) - len(note)))
    byw = collections.Counter(rows[i][1] for i in miss)
    print('库缺按维基朝代：', dict(byw))


if __name__ == '__main__':
    main()
