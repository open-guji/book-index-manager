import csv, json, os, sys, collections
sys.path.insert(0, '.')
import workindex, exclusions
root = '/home/user/bi-e1'
src, out, kept_out = sys.argv[1:4]
rows = list(csv.DictReader(open(src, encoding='utf-8'), delimiter='\t'))
paths = {os.path.basename(f).split('-')[0].split('.')[0]: f for f in workindex.iter_work_files(root)}
ex = exclusions.load_exclusions(None, set(paths), '/home/user/overview/项目进展/古籍目录/进度', os.path.join(exclusions.DATA_DIR, 'dupx-同题异作者清单.tsv'))
nlc_per = collections.Counter(); fid_at = collections.defaultdict(set)
need = {r['rule_work_id'] for r in rows}
for w, f in paths.items():
    d = json.load(open(f, encoding='utf-8'))
    for r in d.get('resources') or []:
        if r.get('id') == 'nlc':
            nlc_per[w] += 1
            fid = (r.get('metadata') or {}).get('nlc_fid')
            if fid: fid_at[fid].add(w)
batch = collections.Counter()
res = []
for r in sorted(rows, key=lambda r: r['source_record_id']):
    w, rid = r['rule_work_id'], r['source_record_id']
    why = []
    if w not in paths: why.append('R1缺失')
    else:
        d = json.load(open(paths[w], encoding='utf-8'))
        if d.get('merged_into'): why.append('R1并条→' + d['merged_into'])
        if d.get('promoted_to'): why.append('R1升级→' + str(d['promoted_to']))
    why += sorted(ex.get(w, ()))
    if rid in fid_at:
        why.append('已落库@' + ','.join(sorted(fid_at[rid])))
    if not why:
        batch[w] += 1
        if nlc_per[w] + batch[w] > 3: why.append('K9超容(库内nlc %d+本批第%d条)' % (nlc_per[w], batch[w]))
    res.append((r, why))
with open(out, 'w', encoding='utf-8', newline='') as f:
    wr = csv.writer(f, delimiter='\t'); wr.writerow(['stratum', 'source_record_id', 'rule_work_id', '剔除原因', 'lib_title', 'lib_author', 'url'])
    for r, why in res:
        if why: wr.writerow([r['stratum'], r['source_record_id'], r['rule_work_id'], ';'.join(why), r['lib_title'], r['lib_author'], r['url']])
with open(kept_out, 'w', encoding='utf-8', newline='') as f:
    wr = csv.writer(f, delimiter='\t'); wr.writerow(['stratum', 'source_record_id', 'rule_work_id', 'lib_title', 'lib_author', 'url'])
    for r, why in res:
        if not why: wr.writerow([r['stratum'], r['source_record_id'], r['rule_work_id'], r['lib_title'], r['lib_author'], r['url']])
c = collections.Counter(x.split('→')[0].split('@')[0].split('(')[0] for _, why in res for x in why)
print(len(rows), 'kept', sum(1 for _, w in res if not w), 'dropped', sum(1 for _, w in res if w), dict(c))
