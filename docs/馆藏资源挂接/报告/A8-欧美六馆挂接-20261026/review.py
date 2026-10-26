"""汇总六馆写入草案 → 复核表（含 Work 著者/朝代/卷数，站方题名全文/责任/版本/年份），并跑二道闸。"""
import json, glob, os, re, csv, sys, collections
BI = '/home/user/book-index'
A8 = '/tmp/claude-0/a8'
SRC = ['bsb', 'sbb', 'loc', 'cudl', 'onb', 'bnf']
path = {}
for f in glob.glob(BI + '/Work/*/*/*/*.json'):
    path[os.path.basename(f).split('-')[0].split('.')[0]] = f
REIGN = dict(順治=(1644, 1661), 康熙=(1662, 1722), 雍正=(1723, 1735), 乾隆=(1736, 1795), 嘉慶=(1796, 1820), 道光=(1821, 1850), 咸豐=(1851, 1861),
             同治=(1862, 1874), 光緒=(1875, 1908), 宣統=(1909, 1911), 民國=(1912, 1949), 洪武=(1368, 1398), 永樂=(1403, 1424), 宣德=(1426, 1435),
             正統=(1436, 1449), 景泰=(1450, 1457), 天順=(1457, 1464), 成化=(1465, 1487), 弘治=(1488, 1505), 正德=(1506, 1521), 嘉靖=(1522, 1566),
             隆慶=(1567, 1572), 萬曆=(1573, 1620), 天啟=(1621, 1627), 崇禎=(1628, 1644))
DYN = dict(先秦=-2000, 周=-1100, 秦=-221, 漢=-206, 西漢=-206, 東漢=25, 三國=220, 魏=220, 晉=265, 西晉=265, 東晉=317, 南北朝=420, 宋=960, 南朝宋=420, 齊=479, 梁=502,
           陳=557, 北魏=386, 隋=581, 唐=618, 五代=907, 遼=916, 金=1115, 元=1271, 明=1368, 清=1644, 民國=1912, 南宋=1127, 北宋=960)


def year_of(*ss):
    for s in ss:
        for m in re.finditer(r'(?<!\d)(1[0-9]\d\d|[5-9]\d\d)(?!\d)', s or ''):
            return int(m.group(1))
    return None


def gate(w, rec_title, ver, period, rest):
    """→ 闸码列表（空＝过）。"""
    out = []
    y = year_of(period, ver)
    m = re.match(r'^\[([^\]]+)\]', w['title'])
    if m:
        rg = REIGN.get(m.group(1)[:2])
        if not rg:
            out.append('G_GAZ_PREFIX_UNK')
        elif y is None:
            out.append('G_GAZ_NOYEAR')
        elif not (rg[0] - 1 <= y <= rg[1] + 30):
            out.append('G_GAZ_YEAR')
    if y:
        starts = [DYN.get(a.get('dynasty') or '') for a in w.get('authors') or [] if DYN.get(a.get('dynasty') or '')]
        if starts and y < min(starts) - 5:
            out.append('G_YEAR_BEFORE_AUTHOR')
    return out


ANNOT = re.compile(r'([\u3400-\u9fff]{2,4})(?:[\(（][^)）]*[\)）])?\s*(?:輯註|輯注|箋註|箋注|集註|集注|集解|補註|補注|音註|音注|句解|註釋|注釋|註|注|箋|疏|解)(?=$|[\s;；,，)）])')


def gate_annot(w, lib_author):
    """站方责任里有「某某注／箋／疏」而某某不是 Work 著者、Work 题名又无注疏字样 → 疑注本挂到本文（K14）。"""
    if re.search(r'[注註箋疏解]', w['title']):
        return []
    names = {a.get('name', '') for a in w.get('authors') or []}
    for m in ANNOT.finditer(lib_author or ''):
        n = re.sub(r'^[\(（]?[^)）]*[\)）]', '', m.group(1))
        if n and not any(n in x or x in n for x in names):
            return ['G_ANNOT']
    return []


rows = []
for s in SRC:
    M = {r['source_record_id']: r for r in csv.DictReader(open(f'{A8}/{s}/matches.tsv'), delimiter='\t')}
    for line in open(f'{A8}/{s}/write_plan.jsonl'):
        p = json.loads(line)
        m = M[p['record_id']]
        w = json.load(open(path[p['work_id']]))
        ex = {}
        rows.append(dict(source=s, record_id=p['record_id'], work_id=p['work_id'], work_title=w['title'],
                         work_authors='；'.join(f"{a.get('dynasty','')}·{a.get('name','')}·{a.get('role','')}" for a in w.get('authors') or []),
                         work_juan=str((w.get('juan_count') or {}).get('number', '')), n_res=str(len(w.get('resources') or [])),
                         lib_title=m['lib_title'], lib_author=m['lib_author'], lib_version=m['lib_version'], url=p['resource']['url'],
                         gate=','.join(gate(w, m['lib_title'], m['lib_version'], '', '') + (gate_annot(w, m['lib_author']) if s != 'loc' else []))))
with open(f'{A8}/review_all.tsv', 'w', encoding='utf-8', newline='') as f:
    wr = csv.DictWriter(f, fieldnames=list(rows[0]), delimiter='\t')
    wr.writeheader(); wr.writerows(rows)
print(len(rows), collections.Counter(r['gate'] for r in rows).most_common())
