"""R1-E1 第一批 667 规则筛（Everett，2026-10-15；规则来自 Rhea，原型 E1第一批-规则筛原型-Rhea.py）。
用法：python3 e1_screen.py --list E1第一批-667清单.tsv --pages E1第一批-页面抓取.tsv --works-root <book-index 根>
        --matches <engine nlc 在同一 Work 库上的 matches.tsv> --judge <linkcheck 输出 tsv> --overview-root <overview> --out <结果.tsv>

规则（全满足才「可升」，否则「待人核」）：
  T 页面题名＝候选题名／别名（归一后，或仅差『新刊 新刻 新編 新鐫 校正 重刻 欽定 御製…』类装饰前缀、[年号] 朝代前缀；不剥 增補／補註／音註／重修／增修）
  A 页面责任者与候选 Work 某责任者同人；或经 Entity 别名＝引擎 A_ALIAS_ONLY 且候选就是引擎选中的 work_id
  U 满足 T、A 的候选恰一个；朝代无 ERA_CONFLICT（清单已剔）
K9：同一来源机构每 Work ≤3 个藏本；序＝有影像＞版本信息明确＞卷数完整＞record_id；已挂者先占额（只对规则可升的行取舍）
占用：R1（目标并条）、R2／R3（#576 ledger hold／draft）、R7（url 已挂他处），来自 exclusions.py 与 merged_into
judge：linkcheck 全量，判假的行从可升剔出并单列。
"""
import argparse
import collections
import csv
import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import exclusions
import normalize as n
import workindex

csv.field_size_limit(10 ** 8)
PRE = re.compile(r'^(新刊|新刻|新編|新编|新鐫|新镌|新鍥|新锲|校正|重刻|重刊|重鐫|欽定|钦定|御製|御制|精選|精选|全像|繡像|绣像|出相|點板|点板)+')
# Rhea 裁决：同书同人的字形异写，规则里不拦，备注标「责任者异写」
VARIANT_PEOPLE = [('劉績', '镏績'), ('李冗', '李冘'), ('張祜', '張祐')]
ROLE = r'(纂修|撰|著|編輯|编辑|編|编|輯|辑|注|註|譯|译|校訂|校订|校|訂|订|纂|述|修|審|审|選|选|題|题|等)+'


def clean(s):
    s = re.sub(r'\s+[a-zA-Z].*$', '', (s or '').strip())
    s = re.sub(r'\s+[一二三四五六七八九十百零〇\d]+[卷册冊集].*$', '', s)
    s = re.sub(r'^[\[［【（(][^\]］】）)]{1,6}[\]］】）)]', '', s)
    return re.sub(r'[\s\[\]（）()]', '', s)


def tkey(s):
    return n.norm_title(clean(s), False)


def tkey2(s):
    return n.norm_title(PRE.sub('', clean(s)), False)


def page_author_part(s):
    return re.split(r'版本项|出版发行|版本书目', s or '')[0]


def au_names(s):
    s = re.sub(r'\([^)]*\)|（[^）]*）|\[[^\]]*\]|\[|\]', '', page_author_part(s))
    s = re.sub(ROLE + r'|\s', ' ', s)
    return [x for x in re.split(r'[ ,，、]+', s) if x]


def page_era(s):
    m = re.search(r'[(（\[]([^)）\]]{1,6})[)）\]]', page_author_part(s))
    return m.group(1) if m else ''


def name_match(w_name, p_names):
    """→ ('等'|'异写'|'近似'|'', 页面名)；等＝fold 后相等或互含（≥2 字），异写＝Rhea 裁决表，近似＝同长度仅 1 字差（不算命中，只作备注）。"""
    wf = n.fold(w_name)
    for p in p_names:
        pf = n.fold(p)
        if wf and pf and (wf == pf or wf in pf or pf in wf):
            return '等', p
    for a, b in VARIANT_PEOPLE:
        for p in p_names:
            if {n.fold(w_name), n.fold(p)} == {n.fold(a), n.fold(b)}:
                return '异写', p
    for p in p_names:
        pf = n.fold(p)
        if len(pf) == len(wf) and len(wf) >= 2 and sum(x != y for x, y in zip(wf, pf)) == 1:
            return '近似', p
    return '', ''


def main():
    ap = argparse.ArgumentParser()
    for a in ('list', 'pages', 'works-root', 'matches', 'judge', 'overview-root', 'out'):
        ap.add_argument('--' + a, required=True)
    ap.add_argument('--cap', type=int, default=3)
    a = ap.parse_args()
    rows = list(csv.DictReader(open(getattr(a, 'list'), encoding='utf-8'), delimiter='\t'))
    pages = {}
    for r in csv.DictReader(open(a.pages, encoding='utf-8'), delimiter='\t'):
        pages[r['sid']] = r
    mt = {r['source_record_id']: r for r in csv.DictReader(open(a.matches, encoding='utf-8'), delimiter='\t')}
    jd = {}
    for r in csv.DictReader(open(a.judge, encoding='utf-8'), delimiter='\t'):
        jd[r.get('url') or r.get('item_url') or ''] = r
    works_root = getattr(a, 'works_root')
    path = {os.path.basename(f).split('-')[0].split('.')[0]: f for f in workindex.iter_work_files(works_root)}
    wcache = {}

    def work(i):
        if i not in wcache:
            wcache[i] = json.load(open(path[i], encoding='utf-8')) if i in path else None
        return wcache[i]
    ex = exclusions.load_exclusions(getattr(a, 'overview_root'), set(path))
    res = workindex.Resources.scan(works_root)
    existing = res.existing_groups('nlc')

    out = []
    for r in rows:
        sid = r['source_record_id']
        p = pages.get(sid)
        o = dict(source_record_id=sid, stratum=r['stratum'], 规则结论='', work_id='', 题名规则='', 责任者规则='', K9取舍='', R占用码='',
                 judge结论='', 页面题名='', 页面责任者='', 库Work题名='', 库Work责任者='', 库Work朝代='', 备注='')
        notes = []
        o['页面题名'] = clean(p['页面题名']) if p else ''
        o['页面责任者'] = page_author_part(p['页面责任者']).strip() if p else ''
        j = jd.get(r['url'])
        if j:
            o['judge结论'] = '%s(%s)' % (j.get('verdict'), j.get('reason', ''))
        else:
            o['judge结论'] = '未判'
        cands = [c.strip() for c in re.split(r'[;,，；]', r['candidates']) if c.strip()]
        hits, seen = [], []
        if not p:
            o['规则结论'] = '待人核-无页面'
        else:
            pa = au_names(p['页面责任者'])
            for c in cands:
                d = work(c)
                if d is None:
                    continue
                if d.get('merged_into'):
                    seen.append(c)
                    continue
                ts = [d.get('title', '')] + [t if isinstance(t, str) else t.get('title', '') for t in d.get('additional_titles') or []] + ([d['original_title']] if d.get('original_title') else [])
                t_eq = any(tkey(p['页面题名']) == tkey(t) for t in ts if t)
                t_pre = any(tkey2(p['页面题名']) == tkey2(t) for t in ts if t)
                wnames = [x.get('name', '') for x in d.get('authors') or []]
                best, who = '', ''
                for wn in wnames:
                    m, pn = name_match(wn, pa)
                    if m in ('等', '异写') and (not best or best == '异写'):
                        best, who = m, pn
                a_al = 'A_ALIAS_ONLY' in r['升档原因码'] and bool(r['work_id']) and c == r['work_id']
                if (t_eq or t_pre) and (best or a_al):
                    hits.append((c, '题等' if t_eq else '去前缀', ('等' if best == '等' else '异写') if best else '别名'))
            if len(hits) == 1:
                o['规则结论'] = '可升'
                o['work_id'], o['题名规则'], o['责任者规则'] = hits[0]
            elif len(hits) > 1:
                o['规则结论'] = '待人核-多候选'
                o['work_id'] = ';'.join(h[0] for h in hits)
            else:
                o['规则结论'] = '待人核-无规则命中'
                o['work_id'] = r['work_id']
            if seen:
                notes.append('候选并条:' + ','.join(seen))
        wid = o['work_id'] if ';' not in o['work_id'] else (r['work_id'] or '')
        d = work(wid) if wid else None
        if d:
            o['库Work题名'] = d.get('title', '')
            o['库Work责任者'] = '；'.join(x.get('name', '') for x in d.get('authors') or [])
            o['库Work朝代'] = '；'.join(sorted({x.get('dynasty', '') for x in d.get('authors') or [] if x.get('dynasty')}))
            pe = page_era(p['页面责任者']) if p else ''
            if pe and o['库Work朝代'] and n.fold(pe)[:1] not in n.fold(o['库Work朝代']):
                notes.append('朝代标注不同(页%s/库%s)' % (pe, o['库Work朝代']))
            if o['责任者规则'] == '异写':
                notes.append('责任者异写')
            if d.get('merged_into'):
                o['R占用码'] = 'R1'
            codes = set(ex.get(wid, ())) | ({'R1'} if d.get('merged_into') else set())
            o['R占用码'] = ','.join(sorted(codes))
        lk = res.linked.get(('nlc', str(sid)), set())
        if lk and o['规则结论'] == '可升':
            o['规则结论'] = '已挂(基线已含)'
            o['备注'] = (o['备注'] + ' 已挂于' + ','.join(sorted(lk))).strip()
            o['K9取舍'] = '-'
        elif lk:
            o['备注'] = (o['备注'] + ' 另已挂于' + ','.join(sorted(lk))).strip()
        if j and j.get('verdict') == 'dead':
            o['规则结论'] = 'judge判假(剔出可升)' if o['规则结论'] == '可升' else o['规则结论']
        if o['R占用码'] and o['规则结论'] == '可升':
            o['规则结论'] = '待人核-R占用(' + o['R占用码'] + ')'
        o['备注'] = ' '.join(notes)
        o['_rec'] = mt.get(sid, {})
        out.append(o)

    # K9：只对规则可升的行
    by = collections.defaultdict(list)
    for o in out:
        if o['规则结论'] == '可升':
            by[o['work_id']].append(o)

    def rank(o):
        m = o['_rec']
        img = 1 if str(m.get('has_image')) in ('True', '1', 'true') else 0
        ver = 1 if re.search(r'[\[［]?\s*(宋|元|明|清|民國|民国|唐|漢|汉)|\d{3,4}|刻本|抄本|写本|寫本|稿本|活字', m.get('lib_version', '') or '') else 0
        full = 0 if 'JUAN_GAP' in (m.get('reason_codes') or '') else 1
        return (-img, -ver, -full, o['source_record_id'])
    for w, lst in by.items():
        room = max(0, a.cap - len(existing.get(w, ())))
        lst.sort(key=rank)
        for i, o in enumerate(lst):
            o['K9取舍'] = '入选' if i < room else '超容被舍'
            if room < len(lst) and i == 0 and existing.get(w):
                o['备注'] = (o['备注'] + ' 已挂%d占额' % len(existing[w])).strip()
    for o in out:
        if not o['K9取舍']:
            o['K9取舍'] = '-'
        o.pop('_rec', None)
    order = {'UP': 0, 'I': 1, 'G': 2, 'A': 3, 'ALIAS': 4}
    out.sort(key=lambda o: (order.get(o['stratum'], 9), o['source_record_id']))
    cols = ['source_record_id', 'stratum', '规则结论', 'work_id', '题名规则', '责任者规则', 'K9取舍', 'R占用码', 'judge结论', '页面题名', '页面责任者',
            '库Work题名', '库Work责任者', '库Work朝代', '备注']
    with open(a.out, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=cols, delimiter='\t', extrasaction='ignore')
        w.writeheader()
        w.writerows(out)
    summ = collections.Counter((o['stratum'], o['规则结论']) for o in out)
    ok = collections.Counter(o['stratum'] for o in out if o['规则结论'] == '可升' and o['K9取舍'] == '入选')
    lines = ['按层汇总（规则结论）：']
    for k, v in sorted(summ.items(), key=lambda kv: (order.get(kv[0][0], 9), kv[0][1])):
        lines.append('  %s\t%s\t%d' % (k[0], k[1], v))
    lines.append('规则可升且 K9 入选：' + ' '.join('%s=%d' % (k, ok[k]) for k in order) + '  合计 %d' % sum(ok.values()))
    lines.append('judge 判假：%d；R 占用转人核：%d' % (sum(1 for o in out if o['规则结论'].startswith('judge判假')), sum(1 for o in out if o['规则结论'].startswith('待人核-R占用'))))
    open(a.out + '.summary.txt', 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
