#!/usr/bin/env python3
"""块 A 步 6：年号分母。读 源表/*.tsv（zhwp、dila），用块 B 的 guji_norm 归一，
键＝(归一年号名, 起年)，起年容差 ±TOL（DILA 给的是实际历日，早期十月岁首会比通行起年早 1 年）。
用法：python3 -I denominator.py <源表目录> <政权映射.tsv> <输出目录>
输出：分母-两源一致.tsv、分母-维基独有.tsv、分母-DILA独有.tsv、分母-存疑空起年.tsv，并在 stdout 打印计数。"""
import sys, os, csv, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from guji_norm import norm_name, parse_year
TOL = 1
JP_KR = {'平安時代', '江戸時代', '鎌倉時代', '室町時代', '飛鳥時代', '奈良時代', '東京時代', '安土桃山',
         '持明院統[北朝]', '大覚寺統[南朝]', '中華民國'}

def read(p):
    return [l.rstrip('\n').split('\t') for l in open(p, encoding='utf8') if l.strip() and not l.startswith('#')]

def main(src, mapf, out):
    frontier = {r[1] for r in read(mapf) if len(r) >= 5 and r[4] == '边疆'}
    wp, dl, doubt, skipped = [], [], [], collections.Counter()
    for r in read(os.path.join(src, 'zhwp_中国年号列表.tsv')):
        if r[0].startswith('来源'): continue
        if r[3] in frontier: skipped['维基·边疆'] += 1; continue
        if r[3] in ('中華民國', '民国'): skipped['维基·民国'] += 1; continue
        s = parse_year(r[5])
        if s is None: doubt.append(r); continue
        wp.append((norm_name(r[2]), s, r))
    for r in read(os.path.join(src, 'dila_紀年.tsv')):
        if r[3] in JP_KR: skipped['DILA·日韩民国'] += 1; continue
        if r[2].startswith('（無年號）'): skipped['DILA·无年号'] += 1; continue
        s = parse_year(r[5])
        if s is None: continue
        e = parse_year(r[6])
        if dl and dl[-1][0] == norm_name(r[2]) and dl[-1][2][3] == r[3] and e is not None \
                and dl[-1][3] is not None and s <= dl[-1][3] + 1:
            # DILA 按帝王切分，同一年号跨帝（如嘉祐：仁宗→英宗）并成一条
            p = dl[-1]; dl[-1] = (p[0], p[1], p[2][:6] + [r[6]] + p[2][7:], e)
            continue
        dl.append((norm_name(r[2]), s, r, e))
    byname = collections.defaultdict(list)
    for i, (n, s, r, _e) in enumerate(dl): byname[n].append(i)
    used, both, wonly = set(), [], []
    for n, s, r in wp:
        hit = next((i for i in byname[n] if i not in used and abs(dl[i][1] - s) <= TOL), None)
        if hit is None: wonly.append(r)
        else: used.add(hit); both.append((r, dl[hit][2]))
    donly = [dl[i][2] for i in range(len(dl)) if i not in used]
    os.makedirs(out, exist_ok=True)
    def w(name, head, rows):
        with open(os.path.join(out, name), 'w', encoding='utf8') as f:
            f.write(head + '\n')
            for x in rows: f.write('\t'.join(x) + '\n')
    w('分母-两源一致.tsv', '年号\t维基朝代\t维基起\tDILA朝代\tDILA起', [(a[2], a[3], a[5], b[3], b[5]) for a, b in both])
    w('分母-维基独有.tsv', '年号\t朝代\t帝王\t起\t止', [(r[2], r[3], r[4], r[5], r[6]) for r in wonly])
    w('分母-DILA独有.tsv', '年号\t朝代\t帝王\t起\t止', [(r[2], r[3], r[4], r[5], r[6]) for r in donly])
    w('分母-存疑空起年.tsv', '年号\t朝代\t帝王\t备注', [(r[2], r[3], r[4], r[7][:60]) for r in doubt])
    print('维基(非边疆有起年)', len(wp), '｜DILA(中国有起年)', len(dl), '｜跳过', dict(skipped))
    print('两源一致', len(both), '｜维基独有', len(wonly), '｜DILA独有', len(donly), '｜存疑空起年', len(doubt))
    print('并集(分母上界)', len(both) + len(wonly) + len(donly))

if __name__ == '__main__':
    main(*sys.argv[1:4])
