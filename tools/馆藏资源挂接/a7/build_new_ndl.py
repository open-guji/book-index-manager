"""A7-NDL：逐组判定表（结论＝建）→ 新 Work ＋ 每个 NDL 藏本一个 Book（挂 ndl 影像）。只写新文件。
    BOOK_INDEX_JSON=<book_index_json> python3 build_new_ndl.py <判定.json|jsonl> <book-index> <revised_at> [--write]
判定表每行：{"组","结论","title","juan","authors":[{name,dynasty,role}],"editions":{record_id: 版本}}；
著录由逐组人工式判定给出（NDL 著者串混写和刻、朝鲜、洋人，不走 authors.py 自动解析）。
"""
import sys, os, json, re, collections, importlib
J, BI, DAY = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2]), sys.argv[3]
WRITE = '--write' in sys.argv
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); import authors
ME = os.path.join(os.path.dirname(HERE), 'match_engine')
sys.path.insert(0, ME); sys.path.insert(0, os.path.join(BI, '.claude/qa'))
os.chdir(ME)
import writeplan, roots
recs = {r['source_record_id']: r for r in importlib.import_module('adapters.ndl').load(roots.library_data())}
os.chdir(BI)
import mintid
mintid.LANE_MACHINE.setdefault('resA2', 2047)
PERIOD = authors.PERIOD
REF = 'book-index-manager docs/馆藏资源挂接/报告/A7-NDL新书建条-20261026.md'

_t = open(J).read()
rows = json.loads(_t) if _t.lstrip().startswith('[') else [json.loads(l) for l in _t.splitlines() if l.strip()]
plan = [v for v in rows if v['结论'] == '建']
for p in plan:
    assert p['title'] and '〓' not in p['title'], p
    for a in p['authors']:
        assert a['name'] and '〓' not in a['name'], p
wids = mintid.mint('Work', 'resA2', len(plan))
bids = iter(mintid.mint('Book', 'resA2', sum(len(p['editions']) for p in plan)))
files = []
for p, wid in zip(plan, wids):
    w = collections.OrderedDict(schema_version=1, id=wid, type='work', title=p['title'])
    au = [{k: a[k] for k in ('name', 'role', 'dynasty') if a.get(k)} for a in p['authors']]
    if au:
        w['authors'] = au
        dyn = au[0].get('dynasty')
        if dyn:
            w['dynasty'] = dyn; w['dynasty_basis'] = 'author_propagation'
            if dyn in PERIOD:
                w['period'] = PERIOD[dyn]; w['period_basis'] = '據 authors[0].dynasty「%s」' % dyn
    if p.get('juan'):
        w['juan_count'] = {'number': int(p['juan'])}
    rid0 = next(iter(p['editions']))
    w['ai_note'] = ('%s 資源 A7-NDL（缺 Work 書目複核）據國立國會圖書館古典籍著錄新建：題名「%s」、責任者「%s」。'
                    '對現庫同作者全部 Work 與不論作者同題逐組查無同書後立條；責任者經人工式逐組整理（和刻訓點者、校訂者不入）。依據見 %s') % (
        DAY, recs[rid0]['title_raw'], recs[rid0]['author_raw'], REF)
    w['revision'] = '1.0.0'; w['revised_at'] = DAY
    name = re.sub(r'[\\/:*?"<>|\s]', '', p['title'])[:40]
    files.append((mintid.path_for(wid, name, 'Work'), w))
    for rid, ed in p['editions'].items():
        mk = writeplan.make_item('ndl', recs[rid])
        assert mk, rid
        item, grp, label = mk
        bid = next(bids)
        b = collections.OrderedDict(schema_version=1, id=bid, type='book', title=p['title'], work_id=wid)
        if ed: b['edition'] = ed.strip()
        b['resources'] = [item]; b['resource_groups'] = {grp: {'label': label}}
        b['ai_note'] = '%s 資源 A7-NDL 新建：NDL 著錄題名「%s」、版本「%s」；隨新建 Work %s 立條。' % (DAY, recs[rid]['title_raw'], recs[rid]['version_raw'], wid)
        b['revision'] = '1.0.0'; b['revised_at'] = DAY
        files.append((mintid.path_for(bid, name, 'Book'), b))
out = os.path.join(os.path.dirname(J), 'new-works-ndl.jsonl')
with open(out, 'w') as f:
    for fp, d in files:
        f.write(json.dumps(dict(path=fp, rec=d), ensure_ascii=False) + '\n')
if WRITE:
    for fp, d in files:
        assert not os.path.exists(fp), fp
        os.makedirs(os.path.dirname(fp), exist_ok=True)
        open(fp, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')
print('works', len(plan), 'books', len(files) - len(plan), '(written)' if WRITE else '(dry)')
