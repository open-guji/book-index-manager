#!/usr/bin/env python3
"""块 C 批量机械归类：读 C3-输入.tsv（c3_slice.py 产出），按分区把机械类直接写成裁决行，
需判断的行写入「待判」tsv，不自判。规则全来自 Sasha 的止年裁决 ② 与 R-两源：
  起讫分歧(低)：起年差≠0 或 止年差≥2 → 待判；止年差≤1 → 口径差，≥2 条独立链 reject，单链 open
  起讫分歧(高/中)、归属(中)、缺条(≥2源)、重名(有悬空库条或单链) → 待判
  归属(低)＝仅帝王写法不一 → open（转块 E）；单源待裁 → open；异体 → open；
  缺条(库有源无) → open（只记录）；重名(无悬空库条且≥2链) → reject
用法: python3 c3_classify.py --in ../裁决/C3-输入.tsv --zone "C2或其他" --out ../裁决/verdicts-C2.jsonl --pending ../裁决/C2-待判.tsv --header "<头注释>"
"""
import argparse, csv, json, re

R = re.compile(r'｜(-?\d+)-(-?\d+)$')

def chains(srcs):
    return {s.split(':')[0].split('-')[0] for s in srcs if ':' in s}

def fmt_srcs(x):
    r = []
    for s in x.split('；'):
        if ':' in s:
            c, rest = s.split(':', 1)
            dyn = rest.split('｜')[1].split('→')[0] if '｜' in rest else ''
            k = c + ':' + rest.split('｜')[0] + '(' + dyn + ')'
            if k not in r: r.append(k)
    return r

def classify(f):
    cat, ids, lib, src, sug, no, sev = f[:7]
    ss = fmt_srcs(src); ent = [i for i in ids.split(';') if i]
    o = {"diff_id": no, "verdict": "open", "rule": "R-两源", "sources": ss or ["library-only:所有源表均无对应"]}
    if ent: o["entity_ids"] = ent
    nch = len(chains(ss))
    if cat == '起讫分歧':
        if sev != '低': return None
        m = R.search(lib); ls, le = int(m[1]), int(m[2])
        d = []
        for s in src.split('；'):
            mm = R.search(s)
            if mm: d.append((int(mm[1]) - ls, int(mm[2]) - le))
        if not d: return None
        if any(a != 0 for a, b in d) or any(abs(b) >= 2 for a, b in d): return None
        if nch >= 2:
            o.update(verdict="reject", action="不改", note="止年差1，库间隔0/1 口径差（两源同向）；起年一致")
        else:
            o["note"] = "止年差%+d，库间隔0/1 口径差，不动数据；单源不足以 reject，记 open" % d[0][1]
    elif cat == '归属':
        if sev != '低': return None
        o["note"] = "仅帝王写法不一，ruler.name 不动，转块 E（Sylvie）"
    elif cat == '缺条':
        if '库内条在所有源表均无对应' not in sug: return None
        o["note"] = "库有源无，只记录不动；是否误条或异体待查"
    elif cat == '单源待裁':
        o["note"] = "库无、仅1源有；无第三独立来源，不入 PR"
    elif cat == '重名':
        if '悬空库条：无' not in sug or nch < 2: return None
        o.update(verdict="reject", action="不改", note="同名分属不同政权，库内各条均在，无悬空库条")
    elif cat == '异体':
        o["note"] = "建议补别名 type=異體，仅 zhwp 单源，待第二源" if sev == '中' else "仅简体写法差异，无需动作"
    else:
        return None
    return o

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--in', dest='inp', required=True); ap.add_argument('--zone', required=True)
    ap.add_argument('--out', required=True); ap.add_argument('--pending', required=True)
    ap.add_argument('--header', default=''); ap.add_argument('--skip', default='', help='已有账本，其 diff_id 跳过')
    a = ap.parse_args()
    skip = set()
    if a.skip:
        for l in open(a.skip, encoding='utf-8'):
            if l.startswith('{'): skip.add(json.loads(l)['diff_id'])
    rows, hdr = [], None
    for l in open(a.inp, encoding='utf-8'):
        if l.startswith('#'): continue
        f = l.rstrip('\n').split('\t')
        if f[0] == '类别': hdr = f; continue
        if len(f) >= 9 and f[8] == a.zone and f[5] not in skip: rows.append(f)
    ok, pend = [], []
    for f in rows:
        o = classify(f)
        (ok if o else pend).append(o or f)
    with open(a.out, 'w', encoding='utf-8') as fo:
        if a.header: fo.write('# ' + a.header + '\n')
        for o in ok: fo.write(json.dumps(o, ensure_ascii=False) + '\n')
    with open(a.pending, 'w', encoding='utf-8') as fp:
        fp.write('\t'.join(hdr) + '\n')
        for f in pend: fp.write('\t'.join(f) + '\n')
    print('机械入账 %d，待判 %d' % (len(ok), len(pend)))

if __name__ == '__main__': main()
