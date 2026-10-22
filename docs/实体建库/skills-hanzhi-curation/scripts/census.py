#!/usr/bin/env python3
"""漢志某一略的缺陷普查（只掃不改）。

用法：在庫根目錄執行
    python3 .claude/skills/hanzhi-curation/scripts/census.py 詩賦略
略名即 Work/1/e/u/1euhm19a23jsw/collated_edition/ 下的檔名（去 .json）。

輸出按缺陷類別分組計數並抽印樣本，結果另存 /tmp 供後續腳本讀取。
這是流程第 1 步「只掃不改」的工具——**不要在這裡改任何資料**。
"""
import json, os, re, sys, glob, collections
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import sectype

LUE = sys.argv[1] if len(sys.argv) > 1 else '諸子略'
HZ_WORK = '1euhm19a23jsw'
HZ = f'Work/1/e/u/{HZ_WORK}/collated_edition/{LUE}.json'
KZ_DIR = 'Work/1/e/v/1ev3bb40n3k74/collated_edition'   # 漢藝文志考證

IW = {}
for s in '0123456789abcdef': IW.update(json.load(open(f'index/works/{s}.json')))
IB = {}
for s in '0123456789abcdef': IB.update(json.load(open(f'index/books/{s}.json')))
IC = json.load(open('index/collections.json'))
PROD = {v['production_id'] for v in json.load(open('promotions.json'))['promotions'].values()}
ALLID = set(IW) | set(IB) | set(IC) | PROD

DIG = {'〇':0,'零':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9}
def cn2num(s):
    s = (s or '').strip()
    if not s: return None
    if re.fullmatch(r'\d+', s): return int(s)
    if not re.fullmatch(r'[〇零一二三四五六七八九十百千]+', s): return None
    t = sec = n = 0
    for ch in s:
        if ch in DIG: n = DIG[ch]
        elif ch == '十': sec += (n or 1) * 10; n = 0
        elif ch == '百': sec += (n or 1) * 100; n = 0
        elif ch == '千': t += sec + (n or 1) * 1000; sec = n = 0
    return t + sec + n

# ---- 讀該略的著錄條目與小序
d = json.load(open(HZ))
cur = None
E = []           # (家, 書名, work_id, 著錄原文)
XU = {}          # 家 -> (家數, 篇數) 依小序
F_XU = []        # 一個类下含多個屬的情形
for s in d.get('sections', []):
    # 經 sectype 歸一，兼認新舊兩制。原寫死簡體 `'书'`，漏掉 3,415 條 `書`；
    # 且此處原以 `k in ('序','小序','结语','結語')` 手列異體，是同一問題之另一面。
    k = sectype.canon(s.get('type') or s.get('section_kind'))
    if k == 'category':
        cur = s.get('title')
    elif k == 'book':
        E.append((cur, s.get('title'), s.get('work_id'), s.get('content', '')))
    elif k in ('preface', 'tally'):
        # 一個「类」下可能有多條小序（如詩賦略賦類實含屈原/陸賈/孫卿三屬），全部累加
        ms = re.findall(r'右(.{0,6}?)([〇零一二三四五六七八九十百千]+)家[，,]?([〇零一二三四五六七八九十百千]+)篇',
                        s.get('content', '') or '')
        if ms:
            j, p = XU.get(cur, (0, 0))
            XU[cur] = (j + sum(cn2num(m[1]) for m in ms), p + sum(cn2num(m[2]) for m in ms))
            if len(ms) > 1:
                F_XU.append((cur, [(m[0], cn2num(m[1]), cn2num(m[2])) for m in ms]))

# ---- 王應麟考證繫連表
KZLINK = collections.defaultdict(list)
for f in glob.glob(f'{KZ_DIR}/*.json'):
    def walk(o):
        if isinstance(o, dict):
            if sectype.canon(o.get('type')) == 'verification':
                ids = o.get('work_ids') or ([o['work_id']] if o.get('work_id') else [])
                for w in ids: KZLINK[w].append((os.path.basename(f)[:-5], o.get('title')))
            for v in o.values(): walk(v)
        elif isinstance(o, list):
            for v in o: walk(v)
    walk(json.load(open(f)))

F = collections.defaultdict(list)
BYT = collections.defaultdict(list)     # 題名 -> work_ids，查重複
INBOUND = collections.Counter()          # 被指向次數，查磁鐵

for p in glob.glob('Work/*/*/*/*.json'):
    try: x = json.load(open(p))
    except Exception: continue
    for r in (x.get('related_works') or []):
        if isinstance(r, dict) and r.get('id'): INBOUND[r['id']] += 1

for cat, ti, w, ct in E:
    C = (cat or '')[2:] or (cat or '?')
    if not w:
        F['條目未連作品'].append((C, ti)); continue
    if w not in IW:
        F['作品幽靈（work_id 不存在）'].append((C, ti, w)); continue
    x = json.load(open(IW[w]['path']))
    tag = f'{C}｜{ti}→「{x.get("title")}」'
    BYT[x.get('title')].append(w)
    desc = (x.get('description') or {}).get('text', '') or ''
    ib = x.get('indexed_by') or []
    bks = x.get('books') or []

    if INBOUND[w] >= 8: F['疑似磁鐵（被指 >=8 次）'].append((tag, INBOUND[w]))

    # 著錄
    for y in ib:
        sb = y.get('source_bid')
        if sb and sb not in ALLID: F['著錄來源書 ID 懸空'].append((tag, y.get('source'), sb))
        sm = y.get('summary') or ''
        if sm.count('《') != sm.count('》'): F['著錄摘要書名號不配對'].append((tag, y.get('source'), sm[:50]))
        if re.match(r'^[，。、；：)）》]', sm): F['著錄摘要以標點起首'].append((tag, y.get('source'), sm[:40]))
    seen = collections.Counter((y.get('source'), y.get('summary')) for y in ib)
    for k, n in seen.items():
        if n > 1: F['著錄條目完全重複'].append((tag, k[0], str(k[1])[:40]))
    if not ib: F['無任何著錄'].append((tag,))
    elif not any(y.get('source') == '漢書藝文志' for y in ib):
        F['缺漢志著錄'].append((tag, [y.get('source') for y in ib]))

    # 版本
    for b in bks:
        if b not in IB: F['books 指向不存在版本'].append((tag, b)); continue
        bd = json.load(open(IB[b]['path']))
        if bd.get('work_id') != w: F['版本 work_id 不回指'].append((tag, b, bd.get('work_id')))
        if not bd.get('edition') and not bd.get('publication_info'):
            F['版本缺版本名與出版資訊'].append((tag, b, bd.get('title')))
    if re.search(r'(已|今)?亡佚', desc) and bks:
        F['稱已亡佚卻掛有版本'].append((tag, len(bks)))

    # 考證：collated_edition 的繫連表，或記錄自身的 emendated_by
    if w not in KZLINK and not any(
            y.get('source') == '漢藝文志考證' for y in (x.get('emendated_by') or [])):
        F['無王應麟考證繫連'].append((tag,))

    # 描述
    if not desc: F['無描述'].append((tag,))
    elif len(desc) < 24: F['描述過簡(<24字)'].append((tag, desc))
    if not (x.get('description') or {}).get('sources'): F['描述無來源'].append((tag,))

    # 作者
    au = x.get('authors') or []
    if not au:
        nz = re.search(r'名([一-鿿]{1,3})[，。、）⟩]', ct)
        F['無作者' + ('（自注有人名）' if nz else '')].append((tag, nz.group(1) if nz else ''))
    else:
        a = au[0]
        for f_, lab in (('role', '缺 role'), ('dynasty', '缺朝代'), ('entity_id', '無 entity_id')):
            if not a.get(f_): F[f'作者{lab}'].append((tag, a.get('name')))

    # 卷篇數與漢志互核
    mi = x.get('measure_info')
    if not mi: F['無卷篇數'].append((tag,))
    else:
        m = re.match(r'([〇零一二三四五六七八九十百千]+)([篇卷])', mi)
        hz = [y for y in ib if y.get('source') == '漢書藝文志']
        if m and m.group(2) == '篇' and hz:
            hm = re.search(r'([〇零一二三四五六七八九十百千]+)篇',
                           hz[0].get('summary') or hz[0].get('title_info') or '')
            if hm and cn2num(hm.group(1)) != cn2num(m.group(1)):
                F['卷篇數與漢志著錄不符'].append((tag, mi, hm.group(1)))

    # 關聯
    rw = x.get('related_works') or []
    if not rw: F['無任何關聯'].append((tag,))
    for r in rw:
        if not isinstance(r, dict) or not r.get('id'): F['關聯條目殘缺'].append((tag, str(r)[:40])); continue
        if r['id'] == w: F['自我關聯'].append((tag,))
        elif r['id'] not in ALLID: F['關聯懸空'].append((tag, r['id']))
        elif r['id'] in IW and r.get('title') != IW[r['id']]['title']:
            F['關聯標籤與目標題不符'].append((tag, r.get('title'), IW[r['id']]['title']))

for t, ws in BYT.items():
    if len(ws) > 1: F['略內同題重複'].append((t, ws))

print(f'=== {LUE}：著錄 {len(E)} 條 ===\n')
if XU:
    print('小序核對（小序家數/篇數 vs 本庫條目數）')
    cnt = collections.Counter(c for c, *_ in E)
    for cat, (jia, pian) in XU.items():
        C = (cat or '')[2:] or cat
        n = cnt.get(cat, 0)
        flag = '' if n == jia else f'   <<< 差 {n - jia}'
        print(f'   {C:6s} 小序 {jia:4d} 家 {pian:5d} 篇 ｜ 本庫 {n:4d} 條{flag}')
    print()
if F_XU:
    print('注意：以下「类」在小序中實含多個「屬」，本庫已壓平為單一分類')
    for cat, ms in F_XU:
        print(f'   {cat}：' + '；'.join(f'{a or "?"}{j}家{pn}篇' for a, j, pn in ms))
    print()
for k, v in sorted(F.items(), key=lambda kv: -len(kv[1])):
    print(f'== {k}：{len(v)}')
    for r in v[:12]: print('   ', ' | '.join(str(z) for z in r)[:150])
    if len(v) > 12: print(f'    …餘 {len(v)-12} 條')
    print()

out = f'/tmp/census_{LUE}.json'
json.dump({k: [list(map(str, r)) for r in v] for k, v in F.items()},
          open(out, 'w'), ensure_ascii=False)
print('明細已存', out)
