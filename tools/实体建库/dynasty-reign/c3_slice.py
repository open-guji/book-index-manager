#!/usr/bin/env python3
"""块 C3 切片：按政权把差异清单切成 C3（宋至清）／C2（其余库内政权）／边疆／待划。零判断，只过滤。
用法: python3 c3_slice.py --root <book-index 根> --list ../对勘产出/差异清单.tsv --out ../裁决/C3-输入.tsv
"""
import argparse, csv, glob, json, re, collections, hashlib

C3 = {'北宋', '南宋', '遼', '北遼', '西遼', '金', '後金', '西夏', '元', '北元', '明', '南明', '清'}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', required=True); ap.add_argument('--list', required=True); ap.add_argument('--out', required=True)
    a = ap.parse_args()
    dn, rid = {}, {}
    for f in glob.glob(a.root + '/Entity/**/*.json', recursive=True):
        try: d = json.load(open(f, encoding='utf-8'))
        except Exception: continue
        if d.get('subtype') == 'dynasty': dn[d['id']] = d['primary_name']
        elif d.get('subtype') == 'reign': rid[d['id']] = d.get('dynasty_id')
    raw = open(a.list, encoding='utf-8').read()
    lines = raw.split('\n')
    head, rows = lines[0], list(csv.reader(lines[2:], delimiter='\t'))
    rows = [r for r in rows if r]
    out, cnt = [], collections.Counter()
    for r in rows:
        ds = set()
        for i in r[1].split(';'):
            if i in rid: ds.add(dn.get(rid[i], '?'))
        if not ds:
            for m in re.findall(r'→([^｜;]*)｜', r[3]): ds |= {x for x in m.split('+') if x}
        if '→边疆' in r[3]: zone = '边疆'
        elif not ds: zone = '待划'
        elif ds & C3: zone = 'C3'
        else: zone = 'C2或其他'
        out.append(r + ['+'.join(sorted(ds)), zone]); cnt[(zone, r[0])] += 1
    with open(a.out, 'w', encoding='utf-8') as f:
        f.write('# 来源差异清单 sha256=%s；%s\n' % (hashlib.sha256(raw.encode()).hexdigest()[:12], head.lstrip('# ')))
        f.write('\t'.join(['类别','库内 id','库内值','各源值','建议','序号','严重度','政权','分区']) + '\n')
        for r in out: f.write('\t'.join(r) + '\n')
    for k, v in sorted(cnt.items()): print(k, v)
    print('总', len(rows), '= ', sum(cnt.values()))
main()
