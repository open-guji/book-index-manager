"""写入计划的 work_id 沿 merged_into 链换成现 keeper（重放前用）。"""
import json, os, sys, collections
BI, src, dst = sys.argv[1:4]
idx = {}
for dp, dn, fn in os.walk(BI + '/Work'):
    for f in fn:
        if f.endswith('.json'): idx[f.split('-')[0]] = os.path.join(dp, f)
def keeper(w, seen=()):
    fp = idx.get(w)
    if not fp: return None
    d = json.load(open(fp))
    m = d.get('merged_into') or d.get('promoted_to')
    if isinstance(m, dict): m = m.get('id')
    if m:
        return None if m in seen else keeper(m, seen + (w,))
    return w
c = collections.Counter()
with open(dst, 'w') as f:
    for l in open(src):
        p = json.loads(l); k = keeper(p['work_id'])
        if k is None: c['lost'] += 1; continue
        if k != p['work_id']: c['remapped'] += 1; p.setdefault('merged_from', p['work_id']); p['work_id'] = k
        else: c['same'] += 1
        f.write(json.dumps(p, ensure_ascii=False) + '\n')
print(dict(c))
