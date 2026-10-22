#!/usr/bin/env python3
"""B-修 v2 机器初判（Marlowe 10-13 批的规则）。读 cuowa_fetch.py v2 输出，写 verdict_machine。
规则：只看「作者栏」（author_field）里出现了哪几条记录的作者；序跋者／评点者／校者在栏外，不计。
  栏为空（取不到）→ unknown；栏内含「等」→ unknown；命中记录数 1 → keep_one；≥2 → keep_all；0 → unknown。
用法：python3 -I cuowa_verdict_v2.py FETCH_V2.tsv OUT.tsv [--compare 试点复核-Sol.tsv]
--compare：对 Sol 的 30 行算一致率，并列出不一致行。"""
import csv, re, sys

src, out = sys.argv[1], sys.argv[2]
rows = list(csv.DictReader(open(src, encoding='utf-8'), delimiter='\t'))


def verdict(r):
    fld = re.split(r' (?:Licensing|Summary|Permission|Source|Title|Edition|Description|Date)\b', r['author_field'])[0]
    if not fld or len(fld) > 40 or fld.startswith('随机原本') or '等' in fld:   # 过长／导航栏噪声＝取不到，不判
        return 'unknown'
    got = [h for h in (x.split(':', 1) for x in r['author_hits'].split(';') if x) if h[1] and h[1] != '无']
    return 'keep_one' if len(got) == 1 else 'keep_all' if len(got) >= 2 else 'unknown'


with open(out, 'w', encoding='utf-8', newline='') as f:
    w = csv.writer(f, delimiter='\t')
    w.writerow(['site', 'url', 'status', 'author_field', 'author_hits', 'verdict_machine'])
    for r in rows:
        r['v'] = verdict(r)
        w.writerow([r['site'], r['url'], r['status'], r['author_field'], r['author_hits'], r['v']])
from collections import Counter
print(Counter((r['site'], r['v']) for r in rows))
if '--compare' in sys.argv:
    sol = {r['url']: r for r in csv.DictReader(open(sys.argv[sys.argv.index('--compare') + 1], encoding='utf-8'), delimiter='\t')}
    mine = {r['url']: r['v'] for r in rows}
    n = ag = 0
    for u, s in sol.items():
        sv = s['your_verdict(keep_one|keep_all|unknown)'].strip()
        n += 1
        if mine.get(u) == sv:
            ag += 1
        else:
            print('不一致', mine.get(u), '<>', sv, u[:90], '|', s['note'][:60])
    print('一致率 %d/%d = %.0f%%' % (ag, n, 100.0 * ag / n))
