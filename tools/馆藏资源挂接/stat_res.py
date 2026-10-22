import os, json, collections, sys
os.chdir('/home/user/book-index')
out = {}
for fam in ('Work', 'Book'):
    n = merged = withres = withgrp = prov = 0
    site = collections.Counter(); typ = collections.Counter(); sitetyp = collections.Counter()
    nres = 0
    for d, _, fs in os.walk(fam):
        for f in fs:
            if not f.endswith('.json'): continue
            try: j = json.load(open(os.path.join(d, f), encoding='utf-8'))
            except Exception: continue
            n += 1
            if j.get('merged_into'):
                merged += 1; continue
            if j.get('provenance'): prov += 1
            rs = j.get('resources') or []
            if rs: withres += 1
            if j.get('resource_groups'): withgrp += 1
            for r in rs:
                nres += 1
                site[r.get('id')] += 1
                ts = r.get('types') or ([r['type']] if r.get('type') else [])
                for t in ts: typ[t] += 1
                sitetyp[(r.get('id'), ','.join(sorted(ts)))] += 1
    out[fam] = dict(files=n, merged_into=merged, live=n - merged, with_resources=withres, no_resources=n - merged - withres,
                    with_provenance=prov, with_groups=withgrp, resources_total=nres,
                    types=dict(typ), top_sites=site.most_common(25))
print(json.dumps(out, ensure_ascii=False, indent=1))
