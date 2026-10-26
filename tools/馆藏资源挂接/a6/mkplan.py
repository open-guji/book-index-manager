"""A6续：上图藏书 Book 层「年同」档 → 写入计划（在当前 book-index 工作树上重放）。
python3 mkplan.py <book-index> <A6匹配表.tsv> <上图藏書 part 目录> <out.jsonl> <skip.tsv>"""
import csv, json, os, sys, re, glob, collections
root, tsv, rawdir, out, skipf = sys.argv[1:6]
idx = {}
for sub in ('Work', 'Book'):
    for dp, dn, fn in os.walk(os.path.join(root, sub)):
        for f in fn:
            if f.endswith('.json'):
                idx[f.split('-')[0]] = os.path.join(dp, f)
cache = {}
def load(i):
    if i not in cache:
        p = idx.get(i); cache[i] = json.load(open(p, encoding='utf-8')) if p else None
    return cache[i]
def resolve(i, depth=0):
    d = load(i)
    if d is None or depth > 10: return None, None
    m = d.get('merged_into')
    if m: return resolve(m if isinstance(m, str) else m.get('id'), depth + 1)
    return i, d
raw = {}
for p in sorted(glob.glob(os.path.join(rawdir, 'part-*.json'))):
    for r in json.load(open(p, encoding='utf-8')):
        u = r.get('url') or ''
        m = re.search(r'instance/([0-9a-z]+)$', u)
        if m: raw[m.group(1)] = r
SH = '上海圖書館'
NUM = {'〇':0,'零':0,'一':1,'二':2,'兩':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9}
def cn(t):
    v = 0; cur = 0
    for ch in t:
        if ch in NUM: cur = NUM[ch]
        elif ch == '十': v += (cur or 1) * 10; cur = 0
        elif ch == '百': v += (cur or 1) * 100; cur = 0
        elif ch == '千': v += (cur or 1) * 1000; cur = 0
    return v + cur
def juan(t):
    """首个「N卷」或「不分卷」；无则 None。"""
    t = re.sub(r'\[[^\]]*\]', '', t or '')
    m = re.search(r'(不分卷)|([〇零一二兩三四五六七八九十百千]+)卷', t)
    if not m: return None
    return 0 if m.group(1) else cn(m.group(2))
REIGN = {'洪武':1368,'建文':1399,'永樂':1403,'洪熙':1425,'宣德':1426,'正統':1436,'景泰':1450,'天順':1457,'成化':1465,'弘治':1488,'正德':1506,'嘉靖':1522,'隆慶':1567,'萬曆':1573,'泰昌':1620,'天啟':1621,'天啓':1621,'崇禎':1628,'順治':1644,'康熙':1662,'雍正':1723,'乾隆':1736,'嘉慶':1796,'道光':1821,'咸豐':1851,'同治':1862,'光緒':1875,'宣統':1909,'民國':1912}
def reign_years(t):
    out = set()
    for m in re.finditer(r'(%s)(元|[0-9]+|[〇一二三四五六七八九十]+)年' % '|'.join(REIGN), t or ''):
        n = 1 if m.group(2) == '元' else (int(m.group(2)) if m.group(2).isdigit() else cn(m.group(2)))
        out.add(REIGN[m.group(1)] + n - 1)
    return out
def year_self_conflict(v):
    """上图版本串里年号紀年與括注公元年自相矛盾（如「光緒17年(1883)」）。"""
    ry = reign_years(v); gy = set(int(y) for y in re.findall(r'(?<!\d)1[0-9]{3}(?!\d)', v or ''))
    return len(ry) == 1 and len(gy) == 1 and ry != gy
def ntype(t):
    t = t or ''
    if '影印' in t: return '影印'
    if '石印' in t: return '石印'
    if '鉛印' in t or '排印' in t: return '鉛印'
    if '活字' in t: return '活字'
    if '油印' in t: return '油印'
    if '鈐印' in t: return '鈐印'
    if '曬印' in t or '曬藍' in t: return '曬印'
    if '稿本' in t: return '稿本'
    if '抄' in t or '鈔' in t or '寫本' in t: return '抄本'
    if '拓' in t: return '拓本'
    if '刻' in t or '套印' in t: return '刻本'
    return None
def type_conflict(shl_title, shl_label, b):
    a = ntype(' '.join(re.findall(r'\[([^\]]*)\]', shl_title or '')).replace('善本', '')) or ntype(shl_label)
    bb = ntype(b.get('edition') or '') or ntype(b.get('edition_type') or '')
    if a is None or bb is None: return False
    return a != bb
STRIP = re.compile(r'(清|明|元|宋|民國|中華民國|日本|朝鮮)|(%s)' % '|'.join(REIGN) + r'|[〇零一二三四五六七八九十百元]+年|間|初|末|前期|後期|中期|至|刻本|刻|印本|木活字|活字|鉛印|石印|影印|排印|油印|鈐印|抄本|鈔本|抄|稿本|本|朱墨|套|藍|補版|修|重|遞修|增|後印|印|上海|北京|廣州|杭州|成都|長沙|南京|蘇州|天津')
def pub_conflict(shl_pub, b):
    p = re.sub(r'[\s()（）]', '', shl_pub or '')
    bp = STRIP.sub('', (b.get('edition') or '').split(';')[0])
    if len(p) < 2 or len(bp) < 2: return False
    common = set(p) & set(bp)
    return len(common) < 2
def juan_conflict(a, b):
    if a is None or b is None: return False
    if {a, b} <= {0, 1}: return False   # 不分卷≈一卷
    return a != b
rows = [r for r in csv.DictReader(open(tsv, encoding='utf-8'), delimiter='\t') if r['Book依据'].endswith('（年同）')]
plan = collections.defaultdict(list); skips = []; st = collections.Counter()
for r in rows:
    inst = r['上图instance']; b0 = r['Book']; w0 = r['Work候选'].split(';')[0].split('|')[0]
    rr = raw.get(inst)
    if not rr: skips.append((inst, b0, 'RAW_NO_URL')); continue
    bid, bd = resolve(b0)
    if not bd: skips.append((inst, b0, 'BOOK_MISSING')); continue
    if bid != b0: st['book_followed_keeper'] += 1
    wid, wd = resolve(w0)
    bw, _ = resolve(bd.get('work_id') or '')
    if not wd or bw != wid:
        skips.append((inst, b0, 'BOOK_WORK_MISMATCH %s→%s vs %s' % (w0, wid, bw))); continue
    if not any(SH in (p.get('institution') or '') for p in bd.get('provenance') or []):
        skips.append((inst, bid, 'NO_SHLIB_PROVENANCE')); continue
    ex = rr.get('extra') or {}
    if year_self_conflict(rr.get('version')) or year_self_conflict(ex.get('edition_label')):
        skips.append((inst, bid, 'YEAR_SELF_CONFLICT ' + (rr.get('version') or ''))); continue
    if type_conflict(r['题名'], ex.get('edition_label') or rr.get('version'), bd):
        skips.append((inst, bid, 'TYPE_CONFLICT %s｜%s' % (r['题名'], bd.get('edition')))); continue
    if pub_conflict(ex.get('publisher'), bd):
        skips.append((inst, bid, 'PUB_CONFLICT %s｜%s' % (ex.get('publisher'), bd.get('edition')))); continue
    ja, jb = juan(r['题名']), juan(bd.get('measure_info') or '')
    if juan_conflict(ja, jb):
        skips.append((inst, bid, 'JUAN_CONFLICT %s≠%s' % (ja, jb))); continue
    label = ex.get('edition_label') or rr.get('version') or ''
    md = {'shlib_instance': inst}
    if ex.get('work_uri'): md['shlib_work'] = ex['work_uri'].rsplit('/', 1)[-1]
    for k in ('edition_label', 'publisher', 'extent', 'call_number', 'holding_number'):
        if ex.get(k): md[k if k != 'edition_label' else 'edition'] = ex[k]
    g = 'shlib-' + inst
    item = {'id': 'shlib', 'group': g, 'group_role': 'origin',
            'name': '上海圖書館古籍書目', 'short_name': '上圖',
            'url': rr['url'], 'types': ['catalog'],
            'details': '上海圖書館館藏書目頁（著錄版本、版式、序跋、批校；無線上影像）',
            'metadata': md}
    plan[bid].append({'work_id': bid, 'attach_level': 'book', 'source': 'shlib', 'resource': item,
                      'resource_group': {g: {'label': '上海圖書館藏本書目：' + (label or '版本未詳')}},
                      'a6_row': r['序号'], 'title': r['题名']})
url2b = collections.defaultdict(set)
for bid, lst in plan.items():
    for x in lst: url2b[x['resource']['url']].add(bid)
multi = {u for u, s in url2b.items() if len(s) > 1}
for bid in list(plan):
    keep = []; seen = set()
    for x in plan[bid]:
        u = x['resource']['url']; i = x['resource']['metadata']['shlib_instance']
        if u in multi: skips.append((i, bid, 'URL_MULTI_BOOK ' + '/'.join(sorted(url2b[u])))); continue
        if u in seen: continue
        seen.add(u); keep.append(x)
    if keep: plan[bid] = keep
    else: del plan[bid]
n = 0
with open(out, 'w', encoding='utf-8') as f:
    for bid, lst in plan.items():
        lst.sort(key=lambda x: x['resource']['group'])
        if len(lst) > 3:
            for x in lst[3:]: skips.append((x['resource']['metadata']['shlib_instance'], bid, 'CAP3'))
            lst = lst[:3]
        for x in lst:
            f.write(json.dumps(x, ensure_ascii=False) + '\n'); n += 1
with open(skipf, 'w', encoding='utf-8') as f:
    f.write('上图instance\tBook\t原因\n')
    for s in skips: f.write('\t'.join(s) + '\n')
c = collections.Counter(s[2].split()[0] for s in skips)
print('rows', len(rows), 'plan', n, 'books', len(plan), dict(st), dict(c))
