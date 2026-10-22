"""R1-E1 第一批 667：Rhea 人核「升」行 → 最终表（Everett，2026-10-15）。
用法：python3 e1_final.py --human E1第一批-人核结果-Rhea.tsv --matches <engine nlc matches.tsv> --judge <linkcheck tsv>
        --works-root <book-index 根> --overview-root <overview> --outdir <目录> [--cap 3]
过滤顺序：人核=升 → R1–R3/R7/并条剔除 → judge 判假单列 → 已挂(基线已含) → K9（每 Work ≤cap，已挂者先占额；writeplan.rank_key）。
输出：最终表.tsv（入选）、剔除行.tsv（含原因）、同书重复Work清单.tsv、汇总.txt。
"""
import argparse
import collections
import csv
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import exclusions
import workindex
import writeplan
import e1_screen as sc

csv.field_size_limit(10 ** 8)


def fid_of(url):
    m = re.search(r'fid=([0-9A-Za-z]+)', url or '')
    return m.group(1) if m else ''


def main():
    ap = argparse.ArgumentParser()
    for k in ('human', 'matches', 'judge', 'works-root', 'overview-root', 'outdir'):
        ap.add_argument('--' + k, required=True)
    ap.add_argument('--cap', type=int, default=3)
    ap.add_argument('--drop', default='', help='额外剔除 tsv：source_record_id<TAB>原因（# 开头为注释）')
    a = ap.parse_args()
    hr = [r for r in csv.DictReader((l for l in open(a.human, encoding='utf-8') if not l.startswith('#')), delimiter='\t')]
    mt = {r['source_record_id']: r for r in csv.DictReader(open(a.matches, encoding='utf-8'), delimiter='\t')}
    jd = {}
    for r in csv.DictReader(open(a.judge, encoding='utf-8'), delimiter='\t'):
        jd[fid_of(r['url'])] = r
    wr = getattr(a, 'works_root')
    path = {os.path.basename(f).split('-')[0].split('.')[0]: f for f in workindex.iter_work_files(wr)}
    wc = {}

    def work(i):
        if i not in wc:
            wc[i] = json.load(open(path[i], encoding='utf-8')) if i in path else None
        return wc[i]
    ex = exclusions.load_exclusions(getattr(a, 'overview_root'), set(path))
    res = workindex.Resources.scan(wr)
    existing = res.existing_groups('nlc')

    extra_drop = {}
    if a.drop:
        for l in open(a.drop, encoding='utf-8'):
            if l.strip() and not l.startswith('#') and not l.startswith('source_record_id'):
                p = l.rstrip('\n').split('\t')
                extra_drop[p[0]] = p[1] if len(p) > 1 else '额外剔除'
    listing = {r['source_record_id']: r for r in csv.DictReader(open(os.path.join(os.path.dirname(a.human), 'E1第一批-667清单.tsv'), encoding='utf-8'), delimiter='\t')}
    drops, cand = [], []
    for r in hr:
        if r['人核'] != '升':
            continue
        sid, wid = r['source_record_id'], r['work_id']
        d = work(wid)
        m = mt.get(sid)
        why = None
        lc = {c.strip() for c in re.split(r'[;,，；]', (listing.get(sid) or {}).get('candidates', '')) if c.strip()}
        if sid in extra_drop:
            why = extra_drop[sid]
        elif wid not in lc:
            why = '自查:选中Work不在候选列表'
        elif d is None:
            why = 'Work不存在'
        elif m is None:
            why = '引擎无该记录'
        elif d.get('merged_into'):
            why = 'R1(并条→%s)' % d['merged_into']
        elif ex.get(wid):
            why = ','.join(sorted(ex[wid]))
        else:
            j = jd.get(sid)
            if j is None:
                why = 'judge未判'
            elif j['verdict'] != 'ok':
                why = 'judge判假(%s)' % j.get('reason', '')
            elif ('nlc', sid) in res.linked and wid in res.linked[('nlc', sid)]:
                why = '已挂(基线已含)'
            elif res.linked.get(('nlc', sid)):
                why = 'R7(已挂他处:%s)' % ','.join(sorted(res.linked[('nlc', sid)]))
        if why:
            drops.append(dict(stratum=r['stratum'], source_record_id=sid, work_id=wid, 原因=why, work_title=(d or {}).get('title', '')))
            continue
        rec = dict(source_record_id=sid, url=m['url'], has_image=str(m.get('has_image')) in ('1', 'True', 'true'),
                   version_raw=m.get('lib_version', ''), juan=None)
        if 'JUAN_GAP' in (m.get('reason_codes') or ''):
            rec['juan'] = 0
        else:
            rec['juan'] = 1
        cand.append(dict(r=r, rec=rec, d=d, m=m))

    by = collections.defaultdict(list)
    for c in cand:
        by[c['r']['work_id']].append(c)
    final = []
    for wid, lst in by.items():
        lst.sort(key=lambda c: writeplan.rank_key(c['rec']))
        room = max(0, a.cap - len(existing.get(wid, ())))
        for i, c in enumerate(lst):
            made = writeplan.make_item('nlc', c['rec'])
            if made is None:
                drops.append(dict(stratum=c['r']['stratum'], source_record_id=c['rec']['source_record_id'], work_id=wid, 原因='无影像', work_title=c['d'].get('title', '')))
                continue
            if i >= room:
                drops.append(dict(stratum=c['r']['stratum'], source_record_id=c['rec']['source_record_id'], work_id=wid,
                                  原因='K9超容被舍(已挂%d)' % len(existing.get(wid, ())), work_title=c['d'].get('title', '')))
                continue
            item, grp, label = made
            notes = []
            pe = re.search(r'[(（\[]+([^()（）\[\]]{1,6})[)）\]]', c['r'].get('页面责任者', ''))
            wd = {x.get('dynasty', '') for x in c['d'].get('authors') or [] if x.get('dynasty')}
            if not wd:
                notes.append('Work无朝代，凭年号与作者常识核')
            elif pe and (pe.group(1)[:1] not in ''.join(wd) or (re.search('[末初]', ''.join(wd)) and pe.group(1) not in wd)):
                notes.append('朝代标注不同(页%s/库%s)' % (pe.group(1), '/'.join(sorted(wd))))
            if '异写' in c['r'].get('备注／理由', ''):
                notes.append('责任者异写')
            final.append(dict(stratum=c['r']['stratum'], source_record_id=c['rec']['source_record_id'], work_id=wid,
                              work_title=c['d'].get('title', ''), label=label, nlc_fid=item['metadata']['nlc_fid'], group=grp,
                              resource=json.dumps(item, ensure_ascii=False), 备注='；'.join(notes)))
    order = {'UP': 0, 'I': 1, 'G': 2, 'A': 3, 'ALIAS': 4}
    final.sort(key=lambda x: (order.get(x['stratum'], 9), x['work_id'], x['source_record_id']))

    # 同书重复 Work：同一页面题名＋责任者核出的候选里，Rhea 备注含「重复」「合纂」之外，另找同题名同作者的多 Work
    dup = collections.defaultdict(set)
    for r in hr:
        if r['人核'] == '升':
            dup[(r['页面题名'].strip(), r['work_id'])].add(r['source_record_id'])
    cands = {r['source_record_id']: r for r in csv.DictReader(open(os.path.join(os.path.dirname(a.human), 'E1第一批-667清单.tsv'), encoding='utf-8'), delimiter='\t')}
    dgrp = []
    hmap = {r['source_record_id']: r['人核'] + ':' + r['work_id'] for r in hr}
    for sid, r in cands.items():
        cs = [c.strip() for c in re.split(r'[;,，；]', r.get('candidates', '')) if c.strip()]
        pt = sc.tkey(r.get('work_title') and r.get('lib_title', '') or r.get('lib_title', ''))
        live = []
        for c in cs:
            d = work(c)
            if not d or d.get('merged_into'):
                continue
            ts = [d.get('title', '')] + [t if isinstance(t, str) else t.get('title', '') for t in d.get('additional_titles') or []]
            if any(sc.tkey(t) == pt or sc.tkey2(t) == sc.tkey2(r.get('lib_title', '')) for t in ts if t):
                live.append(c)
        an = collections.defaultdict(list)
        for c in live:
            for x in work(c).get('authors') or []:
                if x.get('name'):
                    an[sc.n.fold(x['name'])].append(c)
        shared = {c for v in an.values() if len(set(v)) > 1 for c in v}
        live = [c for c in live if c in shared]
        if len(live) > 1:
            dgrp.append(dict(source_record_id=sid, stratum=r['stratum'], 页面题名=r.get('lib_title', ''), 候选Work=';'.join(live),
                             候选题名=';'.join(work(c).get('title', '') for c in live),
                             候选责任者=';'.join('/'.join(x.get('name', '') for x in work(c).get('authors') or []) for c in live),
                             人核=hmap.get(sid, '')))
    outd = a.outdir
    os.makedirs(outd, exist_ok=True)

    def wtsv(name, rows, cols):
        with open(os.path.join(outd, name), 'w', encoding='utf-8', newline='') as f:
            w = csv.DictWriter(f, fieldnames=cols, delimiter='\t', extrasaction='ignore')
            w.writeheader()
            w.writerows(rows)
    wtsv('E1第一批-最终表.tsv', final, ['stratum', 'source_record_id', 'work_id', 'work_title', 'label', 'nlc_fid', 'group', 'resource', '备注'])
    wtsv('E1第一批-最终表-剔除行.tsv', sorted(drops, key=lambda x: (order.get(x['stratum'], 9), x['source_record_id'])), ['stratum', 'source_record_id', 'work_id', 'work_title', '原因'])
    wtsv('E1第一批-多候选Work对照.tsv', dgrp, ['source_record_id', 'stratum', '页面题名', '候选Work', '候选题名', '候选责任者', '人核'])
    cnt = collections.Counter(x['stratum'] for x in final)
    dc = collections.Counter((x['stratum'], re.sub(r'\(.*', '', x['原因'])) for x in drops)
    lines = ['人核升 %d 行 → 最终入选 %d；剔除 %d' % (sum(1 for r in hr if r['人核'] == '升'), len(final), len(drops)),
             '按层入选：' + ' '.join('%s=%d' % (k, cnt[k]) for k in order),
             '剔除按层×原因：']
    for (s, why), v in sorted(dc.items(), key=lambda kv: (order.get(kv[0][0], 9), kv[0][1])):
        lines.append('  %s\t%s\t%d' % (s, why, v))
    lines.append('入选涉及 Work 数：%d；备注含朝代标注不同：%d；Work无朝代：%d；责任者异写：%d' % (len({x['work_id'] for x in final}), sum('朝代标注不同' in x['备注'] for x in final), sum('Work无朝代' in x['备注'] for x in final), sum('异写' in x['备注'] for x in final)))
    open(os.path.join(outd, 'E1第一批-最终表-汇总.txt'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
