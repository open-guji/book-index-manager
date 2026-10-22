"""块 D 步 1：从旧抽检／人工标签生成金标 gold/*.tsv（只读 book_index_json）。
用法：python3 -I build_gold.py [BOOK_INDEX_JSON=/home/user/book_index_json]
金标列：source｜source_record_id｜work_id｜label(同|异|存疑)｜set(A 已验确定档|B 存疑档人标)｜origin
"""
import csv, json, os, re, sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else '/home/user/book_index_json'
M = os.path.join(ROOT, 'library_data', '_匹配')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gold')
os.makedirs(OUT, exist_ok=True)


def tsv(path):
    return list(csv.DictReader(open(path, encoding='utf-8'), delimiter='\t'))


def gold_nlc():
    rows, seen = [], set()
    d = os.path.join(M, '國圖數字古籍')
    for fn in ('抽检-50.md', '抽检-追加50.md', '抽检-追加60.md', '抽检-追加25.md'):
        for ln in open(os.path.join(d, fn), encoding='utf-8'):
            m = re.match(r'\|\s*\d+\s*\|\s*\[([^\]]+)\]\([^)]*\)\s*\|(.*)\|\s*([^|]+?)\s*\|\s*$', ln)
            if not m:
                continue
            fid, mid, verdict = m.group(1), m.group(2), m.group(3)
            w = re.search(r'（(d59[0-9a-z]{9})）|\((d59[0-9a-z]{9})\)|(d59[0-9a-z]{9})', mid)
            if fid in seen or not w:
                continue
            seen.add(fid)
            rows.append(('nlc', fid, next(g for g in w.groups() if g), '同' if verdict.startswith('对') else '异', 'A', fn))
    return rows


def gold_kokusho():
    return [('kokusho', r['bid'], r['本仓Work'].split()[0], '同' if r['判定'] == '对' else '异', 'A', '抽检明细.tsv')
            for r in tsv(os.path.join(M, '国書漢籍', '抽检明细.tsv'))]


def gold_ndl():
    out = []
    for r in tsv(os.path.join(M, 'NDL古典籍', '抽检明细.tsv')):
        lab = '同' if r['判'] == '对' else ('存疑' if '合刻' in r['判'] else '异')
        out.append(('ndl', r['source_record_id'], r['Work'], lab, 'A', '抽检明细.tsv'))
    return out


def gold_glm():
    """B 集：国图存疑档 GLM 对照 100＋67 条的人标（同／异／不确定）；用于「不要把存疑误放行」。"""
    rows = []
    d = os.path.join(M, '外部模型对照')
    for sub, fn in (('', 'claude_label.json'), ('v2-提示词调优', 'claude_label.json')):
        base = os.path.join(d, sub)
        items = json.load(open(os.path.join(base, 'items.json'), encoding='utf-8'))
        lab = json.load(open(os.path.join(base, fn), encoding='utf-8'))
        lab = lab.get('labels', lab)
        for it in items:
            v = lab.get(str(it['n']))
            if v is None:
                continue
            fid = it['url'].split('fid=')[-1]
            if fid in {r[1] for r in rows}:
                continue  # v1／v2 两批抽样有重叠，取先出现者
            rows.append(('nlc', fid, '', {'同': '同', '异': '异'}.get(v, '存疑'), 'B', (sub or 'v1') + '/' + fn))
    return rows


def main():
    allrows = {'nlc': gold_nlc() + gold_glm(), 'kokusho': gold_kokusho(), 'ndl': gold_ndl()}
    for src, rows in allrows.items():
        with open(os.path.join(OUT, src + '.tsv'), 'w', encoding='utf-8', newline='') as f:
            w = csv.writer(f, delimiter='\t')
            w.writerow(['source', 'source_record_id', 'work_id', 'label', 'set', 'origin'])
            w.writerows(rows)
        a = sum(1 for r in rows if r[4] == 'A'); b = len(rows) - a
        print(src, 'A', a, 'B', b)


if __name__ == '__main__':
    main()
