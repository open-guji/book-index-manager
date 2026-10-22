"""验收3 冲突与余量明细（块 B，Edwin）。
    python3 acceptance3_detail.py --root <book-index> --detail ../对勘产出/匹配明细.tsv --final ../对勘产出/起讫一致-终表.tsv --ledger ../裁决 --out ../对勘产出/验收3-冲突与余量明细.tsv
分节：D 有源皆不一致（逐条判合格）／C有账／C无账／E 无源匹配（列清单与去向）。
basis 具体＝去掉“通行紀年／自擬審定／據／DILA無／兩庫皆無／與CBDB、DILA相符”等笼统词后，剩余字符 ≥6。
D 合格＝basis 具体 且 裁决账里有该库条的 verdict（entity_ids 命中）；否则不合格并写缺什么。
"""
import argparse, collections, csv, glob, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from guji_norm import parse_year
from final_agreement import lib_reigns

GEN = re.compile(r'通行紀年|通行紀|P2[a-z]|自擬審定|據|DILA無|DILA|CBDB|兩庫皆無|兩庫|皆無|相符|與|[（）()；;，,、。\s]')


def main():
    ap = argparse.ArgumentParser()
    for k in ('root', 'detail', 'final', 'ledger', 'out'): ap.add_argument('--' + k, required=True)
    a = ap.parse_args()
    L = lib_reigns(a.root)
    led = collections.defaultdict(list)
    for f in sorted(glob.glob(os.path.join(a.ledger, 'verdicts*.jsonl'))):
        for l in open(f, encoding='utf-8'):
            if l.startswith('{'):
                d = json.loads(l)
                for e in d.get('entity_ids') or []: led[e].append('%s:%s' % (d.get('diff_id'), d.get('verdict')))
    spans = collections.defaultdict(lambda: collections.defaultdict(list))
    for l in open(a.detail, encoding='utf-8'):
        p = l.rstrip('\n').split('\t')
        if len(p) > 7 and p[7] and not l.startswith(('#', '来源\t')):
            spans[p[7]][p[0]].append((parse_year(p[5]), parse_year(p[6])))
    out, cnt = [], collections.Counter()
    for r in csv.reader((l for l in open(a.final, encoding='utf-8') if not l.startswith('#')), delimiter='\t'):
        if r[0] == '库id' or r[4][0] not in 'CDE': continue
        lid, nm, g = r[0], r[1], r[4][0]
        _, ls, le, basis, rv, ns = L[lid]
        sp = '；'.join('%s %s-%s' % (s, min(x[0] for x in v if x[0] is not None) if any(x[0] is not None for x in v) else '?', max(x[1] for x in v if x[1] is not None) if any(x[1] is not None for x in v) else '?') for s, v in sorted(spans[lid].items()))
        lv = '、'.join(led.get(lid, [])) or '无'
        spec = len(GEN.sub('', basis)) >= 6
        if g == 'D':
            why = []
            if not spec: why.append('basis 笼统')
            if lv == '无': why.append('账内无该库条 verdict')
            sec, ok = 'D有源皆不一致', ('合格' if not why else '不合格：' + '、'.join(why))
        elif g == 'C':
            sec, ok = ('C仅1源-有账' if lv != '无' else 'C仅1源-无账'), ('' if lv != '无' else '挂 overview#589')
        else:
            sec, ok = 'E无源匹配', ('账内 open' if lv != '无' else '无账') + '；挂 overview#589'
        cnt[(sec, ok.split('；')[0].split('：')[0])] += 1
        out.append((sec, lid, nm, '%s-%s' % (ls, le), sp, lv, rv, '具体' if spec else '笼统', ok, basis))
    out.sort(key=lambda x: x[0])
    with open(a.out, 'w', encoding='utf-8', newline='') as f:
        f.write('# 验收3 冲突与余量明细｜库=%s｜%s\n' % (a.root, '；'.join('%s/%s %d' % (k[0], k[1] or '-', v) for k, v in sorted(cnt.items()))))
        w = csv.writer(f, delimiter='\t', lineterminator='\n')
        w.writerow(('分节', '库id', '年号', '库起讫', '各源起讫(并集)', '裁决账 diff_id:verdict', 'review.status', 'basis是否具体', '结论/去向', 'basis'))
        w.writerows(out)
    for k, v in sorted(cnt.items()): print(k, v)
main()
