"""确定档二次闸（宁缺毋滥）：
F1 题名带前置括注（(原本備旨)…）而 Work 题名不含括注字 → 存疑；
F2 站方责任者含注释／评点／翻译类次要责任者，其名不在 Work 责任者里 → 存疑（可能是另一部注本 Work）；
F3 站方版本串里的公元年早于 Work 首位著者朝代起年（留 30 年余量）→ 存疑。"""
import csv, json, glob, os, re, sys
BOOK_INDEX = os.environ.get('BOOK_INDEX', '../book-index')
COMM = re.compile(r'(口義|集註|集注|集解|正義|音義|批評|評點|評|箋|疏|註|注|句解|諺解|懸吐|譯|補|增補|附註|講義|輯註)$')
def work(wid):
    g = glob.glob(f'{BOOK_INDEX}/Work/{wid[-3]}/{wid[-2]}/{wid[-1]}/{wid}-*.json')
    return json.load(open(g[0])) if g else {}
START = [('民國', 1912), ('清', 1600), ('明', 1340), ('元', 1230), ('金', 1115), ('南宋', 1110), ('北宋', 960), ('趙宋', 960), ('宋', 960),
         ('遼', 907), ('五代', 907), ('唐', 618), ('隋', 581), ('朝鮮', 1360), ('江戶', 1590), ('日本', 0), ('高麗', 900)]
def start(dyn):
    for k, y in START:
        if dyn.startswith(k):
            return y
    return 0
def verdict(r):
    w = work(r['work_id']); wt = w.get('title', ''); names = ''.join(a.get('name', '') for a in w.get('authors', []))
    m = re.match(r'^\(([^)]+)\)', r['lib_title'])
    if m and m.group(1) not in wt:
        return 'F1'
    for seg in r['lib_author'].split('；')[1:]:
        seg = re.sub(r'^\([^)]*\)', '', seg)
        mm = COMM.search(seg)
        if mm:
            nm = seg[:mm.start()].replace('等', '').strip()
            if nm and nm[:2] not in names:
                return 'F2'
    ys = [int(y) for y in re.findall(r'(?<![0-9])(1[0-9]{3})(?![0-9])', r['lib_version'])]
    au = w.get('authors') or []
    if ys and au and min(ys) < start(au[0].get('dynasty', '')) - 30:
        return 'F3'
    return ''
if __name__ == '__main__':
    rows = [r for r in csv.DictReader(open(sys.argv[1]), delimiter='\t') if r['tier'] == '确定']
    out = {r['source_record_id']: verdict(r) for r in rows}
    json.dump(out, open(sys.argv[2], 'w'), ensure_ascii=False)
    from collections import Counter; print(Counter(out.values()))
