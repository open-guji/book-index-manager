import csv, json, os, sys, collections
sys.path.insert(0, '.')
import workindex, exclusions, writeplan
from adapters import nlc
root, ids_tsv, outdir = '/home/user/bi-e1', sys.argv[1], sys.argv[2]
DR = '/home/user/book_index_json/library_data'
want = list(csv.DictReader(open(ids_tsv, encoding='utf-8'), delimiter='\t'))
want = [r for r in want if r['source_record_id'] != '2642']      # 2642 存疑行不得入
recs = {r['source_record_id']: r for r in nlc.load(DR)}
paths = {os.path.basename(f).split('-')[0].split('.')[0]: f for f in workindex.iter_work_files(root)}
ex = exclusions.load_exclusions(None, set(paths), '/home/user/overview/项目进展/古籍目录/进度', os.path.join(exclusions.DATA_DIR, 'dupx-同题异作者清单.tsv'))
per = collections.defaultdict(set); fid_at = collections.defaultdict(set)
for w, f in paths.items():
    d = json.load(open(f, encoding='utf-8'))
    for r in d.get('resources') or []:
        if r.get('id') == 'nlc':
            per[w].add(r.get('group'))
            fid = (r.get('metadata') or {}).get('nlc_fid')
            if fid: fid_at[fid].add(w)
rows, dropped = [], []
by_work = collections.defaultdict(list)
for r in want:
    rid, w = r['source_record_id'], r['work_id']
    rec = recs.get(rid); why = []
    if rec is None: why.append('国图列表无此记录')
    if w not in paths: why.append('R1缺失')
    else:
        d = json.load(open(paths[w], encoding='utf-8'))
        if d.get('merged_into'): why.append('R1并条→' + d['merged_into'])
    why += sorted(ex.get(w, ()))
    if rid in fid_at: why.append('已落库@' + ','.join(sorted(fid_at[rid])))
    made = writeplan.make_item('nlc', rec) if rec and not why else None
    if not why and made is None: why.append('无影像/缺记录号')
    if why: dropped.append((rid, w, ';'.join(why), rec['title_raw'] if rec else '')); continue
    by_work[w].append((rec, made))
plan = []
for w, xs in by_work.items():
    xs.sort(key=lambda x: writeplan.rank_key(x[0]))
    kept = len(per.get(w, ()))
    for rec, (item, grp, label) in xs:
        if grp in per.get(w, ()):
            dropped.append((rec['source_record_id'], w, '同group已在该Work', rec['title_raw'])); continue
        if kept >= writeplan.MAX_ITEMS:
            dropped.append((rec['source_record_id'], w, 'K9超容(库内%d+rank_key序)' % len(per.get(w, ())), rec['title_raw'])); continue
        kept += 1
        plan.append(dict(work_id=w, source='nlc', record_id=rec['source_record_id'], resource=item, resource_group={grp: {'label': label}}))
os.makedirs(outdir, exist_ok=True)
with open(os.path.join(outdir, 'E1b_write_plan.jsonl'), 'w', encoding='utf-8') as f:
    for p in sorted(plan, key=lambda p: p['record_id']): f.write(json.dumps(p, ensure_ascii=False) + '\n')
with open(os.path.join(outdir, 'E1b_剔除与超容.tsv'), 'w', encoding='utf-8', newline='') as f:
    wr = csv.writer(f, delimiter='\t'); wr.writerow(['source_record_id', 'work_id', '剔除原因', '站方题名']); wr.writerows(sorted(dropped))
print(len(want), 'plan', len(plan), 'works', len({p['work_id'] for p in plan}), 'dropped', len(dropped), collections.Counter(d[2].split('(')[0].split('@')[0] for d in dropped))
