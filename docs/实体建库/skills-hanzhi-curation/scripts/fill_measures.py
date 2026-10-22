#!/usr/bin/env python3
"""依漢志著錄標題末尾之篇卷數填入 measures／measure_info／juan_count。

用法：在庫根目錄執行
    python3 .claude/skills/hanzhi-curation/scripts/fill_measures.py 兵書略        # 乾跑
    python3 .claude/skills/hanzhi-curation/scripts/fill_measures.py 兵書略 --go   # 執行

零判斷批次：數字一律取自著錄標題（如「齊孫子八十九篇」），不作推測。
自動驗算各類篇卷數總和與小序所載之數，不合即印出——此為最好的免費檢查。
已有 measure_info 而與著錄不符者一律棄權，不覆寫。
"""
import json, os, re, sys, collections
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import sectype

LUE = sys.argv[1] if len(sys.argv) > 1 else None
if not LUE: sys.exit('用法：fill_measures.py <略名> [--go]')
DRY = '--go' not in sys.argv
HZ = f'Work/1/e/u/1euhm19a23jsw/collated_edition/{LUE}.json'

NUM = '[〇零一二三四五六七八九十百千]'
DIG = {'〇':0,'零':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9}
def cn2num(s):
    if not re.fullmatch(NUM + '+', s): return None
    t = sec = n = 0
    for ch in s:
        if ch in DIG: n = DIG[ch]
        elif ch == '十': sec += (n or 1)*10; n = 0
        elif ch == '百': sec += (n or 1)*100; n = 0
        elif ch == '千': t += sec + (n or 1)*1000; sec = n = 0
    return t + sec + n

def shard(i):
    h = 0
    for c in i: h = ((h * 31) + ord(c)) & 0xFFFFFFFF
    return '%x' % (h % 16)

IWX = {s: json.load(open(f'index/works/{s}.json')) for s in '0123456789abcdef'}
IW = {}
for s in '0123456789abcdef': IW.update(IWX[s])

d = json.load(open(HZ))
cur = None; E = []; XU = collections.defaultdict(list)
for s in d['sections']:
    # 經 sectype 歸一，兼認新舊兩制。**原寫死簡體 `'书'`**，那 3,415 條 `書`
    # （全在《直齋書錄解題》一部）一直被靜默漏掉——不報錯，只是那部整理本
    # 在此腳本眼裡是空的。2026-08-26 改。
    k = sectype.canon(s.get('type'))
    if k == 'category': cur = s['title'][2:]
    elif k == 'book': E.append((cur, s['title'], s.get('work_id')))
    elif k in ('tally', 'preface'):
        for m in re.finditer(rf'右(.{{0,6}}?)({NUM}+)家[，,]?({NUM}+)([篇卷])', s.get('content') or ''):
            XU[cur].append((cn2num(m.group(2)), cn2num(m.group(3)), m.group(4)))

plan, skip = [], []
tot = collections.Counter()
for c, t, w in E:
    m = re.search(rf'({NUM}+)([篇卷])$', t)
    if not m: skip.append((c, t, '標題末無篇卷數')); continue
    n, unit = cn2num(m.group(1)), m.group(2)
    if n is None: skip.append((c, t, '數字無法解析')); continue
    tot[(c, unit)] += n
    if w not in IW: skip.append((c, t, 'work_id 不存在')); continue
    x = json.load(open(IW[w]['path']))
    curmi = x.get('measure_info')
    if curmi:
        if curmi != f'{m.group(1)}{unit}':
            skip.append((c, t, f'已有 measure_info「{curmi}」與著錄「{m.group(1)}{unit}」不同 → 棄權'))
        continue
    plan.append((c, t, w, IW[w]['path'], n, unit, m.group(1)))

print(f'{LUE}：著錄 {len(E)} 條　待填 {len(plan)}　棄權／已有 {len(skip)}\n')
if XU:
    print('篇卷數驗算（本次抽出之數 vs 小序）')
    for c, rows in XU.items():
        jia = sum(r[0] for r in rows); pian = sum(r[1] for r in rows); unit = rows[0][2]
        got = tot.get((c, unit), 0)
        cnt = sum(1 for a, *_ in E if a == c)
        print(f'   {c:8s} 小序 {jia:4d}家 {pian:5d}{unit} ｜ 本庫 {cnt:4d}條 {got:5d}{unit}'
              + ('' if got == pian else f'   <<< {unit}數差 {got - pian}')
              + ('' if cnt == jia else f'   <<< 家數差 {cnt - jia}'))
    print()
if skip:
    print('棄權：')
    for r in skip: print('   ', ' | '.join(map(str, r)))
    print()
for r in plan[:15]: print(f'   {r[0]}｜{r[1]} → {r[6]}{r[5]}')
if len(plan) > 15: print(f'   …餘 {len(plan)-15} 條')

if DRY:
    print('\n[乾跑] 加 --go 執行'); sys.exit()

n = 0
for c, t, w, path, num, unit, cn in plan:
    x = json.load(open(path))
    # 2026-09-09 juan-unit 道修：unit 不一定是「卷」（漢志多是「篇」），
    # 之前不管三七二十一都塞進 juan_count.number，篇卷混作一談的根因即在此。
    x['juan_count'] = {"number": num, "unit": unit}
    x['measures'] = [{"unit": unit, "number": num}]
    x['measure_info'] = f'{cn}{unit}'
    json.dump(x, open(path, 'w'), ensure_ascii=False, indent=2)
    ie = IWX[shard(w)].get(w)
    if ie:
        ie['juan_count'] = {"number": num, "unit": unit}; ie['measure_info'] = f'{cn}{unit}'
    n += 1
for s in '0123456789abcdef':
    json.dump(IWX[s], open(f'index/works/{s}.json', 'w'), ensure_ascii=False, indent=2)
print('已填', n)
