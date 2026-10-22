"""收口验收 3：库内每条 reign 的起讫年与 ≥2 个来源一致的占比，余者分类（块 B，Edwin）。
    python3 final_agreement.py --root <book-index> --detail ../对勘产出/匹配明细.tsv --out ../对勘产出/起讫一致-终表.tsv
分级（只数“已配对”的源行；DILA 跨帝分段已在 recon 里合并，但匹配明细是合并前的行，这里按库 id 聚合取并集起止）：
  A 严格一致：≥2 源 起、止都与库相等
  B 口径一致：≥2 源 起相等（或 DILA 早 1 年）且 止相等或比库多 1（源把改元当年算进旧年号）
  C 仅 1 源一致（B 口径）  D 无源一致（有匹配但都不一致）  E 无任何源匹配（库有源无）
"""
import argparse, collections, csv, glob, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from guji_norm import parse_year


def lib_reigns(root):
    out = {}
    for f in glob.glob(os.path.join(root, 'Entity', '**', '*.json'), recursive=True):
        try:
            d = json.load(open(f, encoding='utf-8'))
        except Exception:
            continue
        if d.get('subtype') == 'reign' and not d.get('promoted_to') and not d.get('_promoted_to'):
            dt = d.get('dates') or {}
            out[d['id']] = (d['primary_name'], dt.get('start'), dt.get('end'), (dt.get('basis') or ''),
                            (d.get('review') or {}).get('status', ''), len((d.get('description') or {}).get('sources') or []))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', required=True); ap.add_argument('--detail', required=True); ap.add_argument('--out', required=True)
    a = ap.parse_args()
    L = lib_reigns(a.root)
    M = collections.defaultdict(lambda: collections.defaultdict(list))   # lid -> 来源 -> [(起,止)]
    for l in open(a.detail, encoding='utf-8'):
        if l.startswith('#') or l.startswith('来源\t'):
            continue
        p = l.rstrip('\n').split('\t')
        if len(p) < 8 or not p[7]:
            continue
        M[p[7]][p[0]].append((parse_year(p[5]), parse_year(p[6])))
    rows, cnt = [], collections.Counter()
    for lid, (nm, ls, le, basis, rv, ns) in sorted(L.items()):
        src_res = {}
        for s, spans in M.get(lid, {}).items():
            st = [x[0] for x in spans if x[0] is not None]; en = [x[1] for x in spans if x[1] is not None]
            if not st or not en:
                src_res[s] = '源缺值'; continue
            b, e = min(st), max(en)
            if (b, e) == (ls, le): src_res[s] = '严格'
            elif b in (ls, ls - 1) and e in (le, le + 1) and (b, e) != (ls, le): src_res[s] = '口径'
            else: src_res[s] = '不一致(%s-%s)' % (b, e)
        ok = [s for s, r in src_res.items() if r in ('严格', '口径')]
        strict = [s for s, r in src_res.items() if r == '严格']
        if len(strict) >= 2: g = 'A严格'
        elif len(ok) >= 2: g = 'B口径'
        elif len(ok) == 1: g = 'C仅1源一致'
        elif src_res: g = 'D有源皆不一致'
        else: g = 'E无源匹配'
        cnt[g] += 1
        rows.append((lid, nm, ls, le, g, '；'.join('%s:%s' % kv for kv in sorted(src_res.items())), rv, ns, basis[:60]))
    with open(a.out, 'w', encoding='utf-8') as f:
        n = len(L)
        f.write('# 库=%s 共 %d 条 reign；A严格 %d，B口径 %d → ≥2源一致 %d（%.1f%%）；C %d，D %d，E %d\n' % (
            a.root, n, cnt['A严格'], cnt['B口径'], cnt['A严格'] + cnt['B口径'], 100.0 * (cnt['A严格'] + cnt['B口径']) / n,
            cnt['C仅1源一致'], cnt['D有源皆不一致'], cnt['E无源匹配']))
        f.write('库id\t年号\t库起\t库止\t分级\t各源结果\treview.status\tsources条数\tbasis(前60字)\n')
        for r in rows: f.write('\t'.join(str(x) for x in r) + '\n')
    print(open(a.out, encoding='utf-8').readline().strip())


if __name__ == '__main__':
    main()
