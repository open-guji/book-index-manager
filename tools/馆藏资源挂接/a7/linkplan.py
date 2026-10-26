"""verdicts S* → 写入计划（同 write_plan.jsonl 格式），合并引擎 eng2 计划，按 K9 截额。"""
import sys, os, csv, json, re, collections
ME = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'match_engine')
_S = os.path.abspath(sys.argv[1])
sys.path.insert(0, ME); os.chdir(ME)
import roots
import importlib, workindex, writeplan
S = _S; src = sys.argv[2]; BI = roots.book_index(); DATA = roots.library_data()
rev = {r['idx']: r for r in csv.DictReader(open(f'{S}/review.tsv'), delimiter='\t')}
ver = dict(l.split() for l in open(f'{S}/verdicts.txt'))
recs = {r['source_record_id']: r for r in importlib.import_module('adapters.' + src).load(DATA)}
res = workindex.Resources.scan(BI)
existing = res.existing_groups(src)
plan = [json.loads(l) for l in open(f'{S}/eng2-{src}/write_plan.jsonl')]
for p in plan: p['basis'] = 'engine'
seen = {p['record_id'] for p in plan}
per = collections.Counter(p['work_id'] for p in plan)
add, capped, noimg = 0, 0, 0
for idx, v in ver.items():
    r = rev[idx]
    if r['src'] != src or not v.startswith('S'): continue
    wids = re.findall(r'(?:^|‖ )([0-9a-z]{12}) ', r['top3'])
    wid = wids[int(v[1:]) - 1]
    for rid in r['rids'].split(';'):
        if rid in seen: continue
        made = writeplan.make_item(src, recs[rid])
        if not made: noimg += 1; continue
        item, grp, label = made
        if grp in existing.get(wid, set()): continue
        if len(existing.get(wid, set())) + per[wid] >= writeplan.MAX_ITEMS:
            capped += 1; continue
        per[wid] += 1; seen.add(rid); add += 1
        plan.append(dict(work_id=wid, source=src, record_id=rid, resource=item, resource_group={grp: {'label': label}}, basis=f'A7 逐条核 #{idx}'))
with open(f'{S}/linkplan-{src}.jsonl', 'w') as f:
    for p in plan: f.write(json.dumps(p, ensure_ascii=False) + '\n')
print(src, 'engine', sum(1 for p in plan if p['basis']=='engine'), 'review_add', add, 'capped', capped, 'noimg', noimg, 'works', len(per))
