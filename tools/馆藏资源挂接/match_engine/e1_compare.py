"""R1-E1：国图三档对照表（旧匹配表 × 引擎新档 × 引擎新档+别名实验）。
用法：python3 e1_compare.py <旧匹配表.tsv> <引擎默认matches.tsv> <引擎--alias matches.tsv> <Work库根> <输出.tsv>
旧主类：Rhea（R2）的 9 类（分块-R2 §二）——近似题名且无「缺责任者／不合」→H；其后按
方志(A)→合刻丛书(B)→朝代(C)→缺责任者(D)→不合(E)→多Work(F)→装饰词(G)→其他(I)取首个命中。只对旧档＝存疑的行归类。"""
import csv, glob, json, os, re, sys

old_p, new_p, al_p, root, out = sys.argv[1:6]


def old_class(tier, reasons):
    if tier != '存疑':
        return ''
    r = reasons or ''
    has_near = '近似题名' in r
    if has_near and '缺一方' not in r and '责任者不合' not in r:
        return 'H'
    if '地方志带朝代前缀' in r:
        return 'A'
    if '多个题名' in r or '丛书/合集' in r:
        return 'B'
    if '朝代冲突' in r or '版本早于作者朝代' in r:
        return 'C'
    if '责任者缺一方' in r:
        return 'D'
    if '责任者不合' in r:
        return 'E'
    if '同题多 Work' in r or '多个 Work 同题同责任者' in r:
        return 'F'
    if '去装饰词' in r or '降存疑' in r:
        return 'G'
    return 'I'


def rd(p):
    return {r['source_record_id']: r for r in csv.DictReader(open(p, encoding='utf-8'), delimiter='\t')}


old, new, al = rd(old_p), rd(new_p), rd(al_p)
need = {r['work_id'] for r in list(new.values()) + list(al.values()) if r['work_id']}
winfo = {}
for f in glob.iglob(os.path.join(root, 'Work', '*', '*', '*', '*.json')):
    wid = os.path.basename(f).split('-')[0]
    if wid in need:
        d = json.load(open(f, encoding='utf-8'))
        a = d.get('authors') or []
        winfo[wid] = ('/'.join(x.get('name', '') for x in a), '/'.join(sorted({x.get('dynasty') or '' for x in a} - {''})))
cols = ['source_record_id', '旧档', '旧主类', '新档', '新档(+别名)', '升档原因码', 'work_id', 'work_title', 'work_authors', 'work_dynasty', 'candidates',
        'lib_title', 'lib_author', 'lib_version', 'url', 'excluded', '旧reasons']
with open(out, 'w', encoding='utf-8', newline='') as f:
    w = csv.writer(f, delimiter='\t')
    w.writerow(cols)
    for k, o in old.items():
        n = new[k]; a = al[k]
        wid = a['work_id'] or n['work_id']
        au, dy = winfo.get(wid, ('', ''))
        w.writerow([k, o['tier'], old_class(o['tier'], o['reasons']), n['tier'], a['tier'], a['reason_codes'], wid, a['work_title'] or n['work_title'], au, dy,
                    a['candidates'] or n['candidates'], n['lib_title'], n['lib_author'], n['lib_version'], n['url'], a['excluded'] or n['excluded'], o['reasons']])
