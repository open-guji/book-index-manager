#!/usr/bin/env python3
"""B-修 步2：机械取证（不判定）。读试点清单，限速取原站页面，写取证列。
输出另有 author_field（作者栏原文，v2 匹配只看它；空＝取不到，不判）。\n用法：python3 -I cuowa_fetch.py 试点清单-B修.tsv OUT.tsv [--delay 2.2]
输出列：site url page_title page_author_hits(各记录作者名是否在页面文字中出现) page_snapshot(含作者/撰/著等标签的片段) status record_paths
说明：只取证，不写 verdict；简繁差异会让 hits 漏报，由定夺者人看 snapshot。"""
import sys, re, time, html, urllib.request, urllib.error
try:
    from opencc import OpenCC
    _t2s = OpenCC('t2s').convert
except Exception:
    _t2s = lambda x: x   # 无 opencc 则只做原样匹配，简繁差异会漏报
src, out = sys.argv[1], sys.argv[2]
delay = float(sys.argv[sys.argv.index('--delay') + 1]) if '--delay' in sys.argv else 2.2
LAB = re.compile(r'(作者|著者|撰者|責任者|责任者|编者|撰|著|纂|注|Author)[：: ]{0,3}[^\s<]{1,40}')
# v2（Marlowe 10-13 批）：只在「作者栏」内匹配；序跋者／评点者／校者不计；栏内有「等」→ 判 unknown（verdict 脚本做）
FIELD = re.compile(r'(?:Author|作者|著者|責任者)[：: ]+(.+?)(?= (?:Title|Edition|Description|Date|Publication|Source|題名|版本|卷數|Other)\b|$)')
FIELD_COLON = re.compile(r'(?:作者|著者)[：:]\s*([^\s]{1,20})')   # 维基文库页首「作者：某某」；导航栏里的「作者」无冒号
def author_field(t):
    m = FIELD_COLON.search(t)
    if m: return m.group(1)
    m = FIELD.search(t)
    return m.group(1).strip()[:80] if m else ''
def text_of(b):
    b = re.sub(r'(?is)<(script|style).*?</\1>', ' ', b)
    return html.unescape(re.sub(r'<[^>]+>', ' ', b))
rows = [l.rstrip('\n').split('\t') for l in open(src, encoding='utf-8')][1:]
with open(out, 'w', encoding='utf-8') as fo:
    fo.write('site\turl\tpage_title\tauthor_field\tauthor_hits\tpage_snapshot\tstatus\trecord_paths\n')
    for site, url, recs in rows:
        title = snap = hits = fld = ''; status = ''
        try:
            for attempt in range(3):
                try:
                    r = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (research)'}), timeout=25); break
                except urllib.error.HTTPError as e:
                    if e.code != 429 or attempt == 2: raise
                    time.sleep(15 * (attempt + 1))
            b = r.read(400000).decode('utf-8', 'ignore'); status = str(r.status)
            m = re.search(r'<title>(.*?)</title>', b, re.S); title = html.unescape(m.group(1)).strip() if m else ''
            t = re.sub(r'\s+', ' ', text_of(b))
            fld = author_field(t); ft = _t2s(fld)
            for rec in recs.split(';'):
                p, a, d = (rec.split('|') + ['', ''])[:3]
                hit = [n for n in a.split('/') if n and fld and (n in fld or _t2s(n) in ft)]
                hits += '%s:%s;' % (p.split('/')[-1][:12], ','.join(hit) or '无')
            snaps = [m.group(0) for m in LAB.finditer(t)][:6]
            snap = ' / '.join(snaps)[:200]
        except urllib.error.HTTPError as e: status = 'HTTP%d' % e.code
        except Exception as e: status = 'ERR:' + type(e).__name__
        fo.write('\t'.join(x.replace('\t', ' ').replace('\n', ' ') for x in (site, url, title, fld, hits, snap, status, recs)) + '\n'); fo.flush()
        time.sleep(delay)
