"""A7：N 判（新书）→ 新 Work ＋ 每个国图藏本一个 Book（挂资源）。只写新文件。
    python3 build_new.py <工作目录 S> <book-index> <revised_at> [--write]
"""
import sys, os, csv, json, re, collections
S, BI, DAY = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2]), sys.argv[3]
WRITE = '--write' in sys.argv
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import authors
ME = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'match_engine')
sys.path.insert(0, ME); sys.path.insert(0, os.path.join(BI, '.claude/qa'))
cwd = os.getcwd(); os.chdir(ME)
import importlib, writeplan, roots
from titleparse import split_title
recs = {r['source_record_id']: r for r in importlib.import_module('adapters.nlc').load(roots.library_data())}
os.chdir(BI)
import mintid
mintid.LANE_MACHINE.setdefault('resA7', 2031)
import opencc
cc = opencc.OpenCC('s2t')

rev = {r['idx']: r for r in csv.DictReader(open(f'{S}/review.tsv'), delimiter='\t')}
ver = dict(l.split() for l in open(f'{S}/verdicts.txt'))
SKIP = {'6': '民國人著作', '53': '外國人著作譯本', '58': '外國人著作譯本', '59': '民國人編'}
AUTHOR_FIX = json.load(open(f'{S}/author-fix.json'))
TITLE_FIX = json.load(open(f'{S}/title-fix.json')) if os.path.exists(f'{S}/title-fix.json') else {}
D = '〇零一二三四五六七八九十百千'
def cn(s):
    v = {'〇': 0, '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9}
    if s.isdigit(): return int(s)
    n, cur = 0, 0
    for ch in s:
        if ch in v: cur = v[ch]
        elif ch == '十': n += (cur or 1) * 10; cur = 0
        elif ch == '百': n += (cur or 1) * 100; cur = 0
        elif ch == '千': n += (cur or 1) * 1000; cur = 0
    return n + cur
def juan(js):
    m = re.match(r'^([' + D + r'\d]+)[卷巻]', js or '')
    return cn(m.group(1)) if m else None

PERIOD = authors.PERIOD
plan, skipped = [], []
for i, v in ver.items():
    r = rev[i]
    if r['src'] != 'nlc' or v != 'N': continue
    if i in SKIP: skipped.append((i, SKIP[i])); continue
    raw = re.split(r'\s{2,}|　', r['lib_title'].strip())[0] if '  ' in r['lib_title'] or '　' in r['lib_title'] else r['lib_title'].strip()
    t, js, _ = split_title(r['lib_title'])
    t = TITLE_FIX.get(i) or t.strip()
    t = re.sub(r'^\[([^\]]+)\]', r'\1', t) if t.startswith('[') and not re.match(r'^\[[^\]]+\]$', t) else t
    au, unsure = authors.parse(r['lib_author'])
    if i in AUTHOR_FIX: au, unsure = AUTHOR_FIX[i], False
    n = juan(js)
    plan.append(dict(idx=i, title=t, juan=n, juan_raw=js, authors=au, unsure=unsure, lib_title=r['lib_title'], lib_author=r['lib_author'],
                     rids=r['rids'].split(';'), version=r['version']))
wids = mintid.mint('Work', 'resA7', len(plan))
nb = sum(len(p['rids']) for p in plan)
bids = mintid.mint('Book', 'resA7', nb)
files = []
bi = iter(bids)
for p, wid in zip(plan, wids):
    au = p['authors']
    w = collections.OrderedDict(schema_version=1, id=wid, type='work', title=p['title'])
    if au:
        w['authors'] = [{k: a[k] for k in ('name', 'role', 'dynasty', 'original_name', 'name_basis', 'role_basis') if k in a} for a in au]
    dyn = au[0].get('dynasty') if au else None
    if dyn:
        w['dynasty'] = dyn; w['dynasty_basis'] = 'author_propagation'
        if dyn in PERIOD:
            w['period'] = PERIOD[dyn]; w['period_basis'] = '據 authors[0].dynasty「%s」' % dyn
    if p['juan']:
        w['juan_count'] = {'number': p['juan']}
    if p['juan_raw']:
        w['measure_info'] = p['juan_raw']
    w['ai_note'] = ('%s 資源 A7（缺 Work 書目複核）據國圖中華古籍資源庫著錄新建：題名「%s」、責任者「%s」。'
                    '對現庫同作者近題、不論作者同題兩輪查無同書後立條；責任者由國圖著錄串解析%s。'
                    '依據見 book-index-manager docs/馆藏资源挂接/报告/A7-缺Work复核与补挂-20261026.md') % (
        DAY, p['lib_title'].strip(), p['lib_author'].strip(), '，有拿不準處（括號、缺字或外國名）待人覆核' if p['unsure'] else '')
    w['revision'] = '1.0.0'; w['revised_at'] = DAY
    name = re.sub(r'[\\/:*?"<>|\s]', '', p['title'])[:40]
    files.append((mintid.path_for(wid, name, 'Work'), w))
    for rid in p['rids']:
        item, grp, label = writeplan.make_item('nlc', recs[rid])
        bid = next(bi)
        ed = recs[rid].get('version') or p['version']
        b = collections.OrderedDict(schema_version=1, id=bid, type='book', title=p['title'], work_id=wid)
        if ed: b['edition'] = re.sub(r'\s{2,}', ' ', ed.strip())
        b['resources'] = [item]; b['resource_groups'] = {grp: {'label': label}}
        b['ai_note'] = '%s 資源 A7 新建：國圖著錄題名「%s」、版本項「%s」；隨新建 Work %s 立條。' % (DAY, p['lib_title'].strip(), (ed or '').strip(), wid)
        b['revision'] = '1.0.0'; b['revised_at'] = DAY
        files.append((mintid.path_for(bid, name, 'Book'), b))
with open(f'{S}/new-works.jsonl', 'w') as f:
    for fp, d in files:
        f.write(json.dumps(dict(path=fp, rec=d), ensure_ascii=False) + '\n')
if WRITE:
    for fp, d in files:
        assert not os.path.exists(fp), fp
        os.makedirs(os.path.dirname(fp), exist_ok=True)
        open(fp, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')
print('works', len(plan), 'books', nb, 'skipped', skipped, 'unsure', sum(p['unsure'] for p in plan), '(written)' if WRITE else '(dry)')
