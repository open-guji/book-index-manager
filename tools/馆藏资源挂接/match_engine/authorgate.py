"""K13 国書责任者闸（Milo 2026-10-15；Rowan R3-4c 抽核＋Silas 三档建议后改版）。
证据层次：本册责任＝详情页 detail.author（页面「責任表述」）；著作层著者＝detail.work[].author（列表层 author 是 Work 层，会借同 wid 他册，不用）。
分档码（G1/G2 放行，G3 拦）：
  G1_BOOK_AUTHOR_OK     本册责任非空且与 Work 著者相交 → 通过
  G1_WORK_LAYER_OK      本册责任空，work[] 恰一条且其著者与 Work 著者相交 → 通过（evidence 落盘）
  G2_TITLE_EXACT_NOAUTH 本册责任空，work[] 无著者（或无 work），但书名（题名／kshomei）与 Work 题名集全等且有影像 → 放行，每批分层抽核≥100，错挂>1% 停批（Silas ②）
  G3_NOT_IN_WORK        本册责任非空而不含 Work 著者（如九章算經 100350462）→ 拦
  G3_WORK_AUTHOR_DIFF   本册责任空，work[] 恰一条但著者不含 Work 著者 → 拦
  G3_MULTI_WORK         本册责任空，work[] 多条（多著作册）→ 拦
  G3_EMPTY_NO_EVIDENCE  本册责任空，work[] 无著者，且书名非全等或无影像 → 拦
Work 无著者时无从比：本册责任非空→G1_BOOK_AUTHOR_OK（无从否定）；空→按 G2 条件。返回 (code, evidence dict)。"""
import normalize as n


def _near(lset, wset):
    return any(a == b or a in b or b in a for a in lset for b in wset)


def _names(raw):
    return {n.fold(x) for x in n.parse_kokusho_author(raw)[0] if x}


def gate_names(author_book, detail_works, wnames, title_exact, has_image):
    wset = {n.fold(x) for x in wnames if x}
    book = _names(author_book)
    ev = dict(book_author=author_book, work_layer=' | '.join(detail_works), title_exact=int(bool(title_exact)), has_image=int(bool(has_image)))
    if book:
        return ('G1_BOOK_AUTHOR_OK' if (not wset or _near(book, wset)) else 'G3_NOT_IN_WORK'), ev
    if len(detail_works) > 1:
        return 'G3_MULTI_WORK', ev
    if len(detail_works) == 1:
        wl = _names(detail_works[0])
        if wl:
            return ('G1_WORK_LAYER_OK' if (not wset or _near(wl, wset)) else 'G3_WORK_AUTHOR_DIFF'), ev
    return ('G2_TITLE_EXACT_NOAUTH' if (title_exact and has_image) else 'G3_EMPTY_NO_EVIDENCE'), ev


def is_pass(code):
    return code.startswith(('G1', 'G2'))


def title_keys(work):
    ts = [work.get('title', '')] + [t if isinstance(t, str) else (t.get('title') or '') for t in work.get('additional_titles') or []]
    return {n.norm_title(t) for t in ts if t}


def gate_rec(rec, work_authors, tkeys):
    """rec＝adapter 输出；work_authors＝已归一著者名集；tkeys＝Work 题名键集（同 jp 折叠）。"""
    te = n.norm_title(rec['title_raw']) in tkeys or (rec.get('kshomei') and n.norm_title(rec['kshomei']) in tkeys)
    return gate_names(rec.get('author_book', ''), rec.get('detail_works') or [], work_authors, te, rec.get('has_image'))


def scan(plan_or_pairs, data_root, works_root):
    """plan 行（含 work_id＋record_id/source_record_id）或 (bid, work_id) 对；返回 [(bid, work_id, code, evidence)]，含放行档。"""
    import glob
    import json
    import os
    import workindex
    R = {}
    for f in sorted(glob.glob(os.path.join(data_root, 'kokusho', 'part-*.json'))):
        for r in json.load(open(f, encoding='utf-8')):
            d = (r.get('raw') or {}).get('detail') or {}
            R[str(r['source_record_id'])] = dict(title_raw=r['bookName'], kshomei=d.get('kshomei') or '', author_book=' '.join(d.get('author') or []),
                                                 detail_works=[' '.join(a.get('name', '') for a in (w.get('author') or [])) for w in (d.get('work') or [])],
                                                 has_image=bool(r.get('image_url')))
    path = {os.path.basename(f).split('-')[0].split('.')[0]: f for f in workindex.iter_work_files(works_root)}
    out = []
    for p in plan_or_pairs:
        bid, wid = (p if isinstance(p, tuple) else (p.get('source_record_id') or p.get('record_id') or '', p['work_id']))
        rec = R.get(bid)
        if rec is None or wid not in path:
            out.append((bid, wid, 'G3_NO_RECORD', {}))
            continue
        w = json.load(open(path[wid], encoding='utf-8'))
        wn = {n.norm_author(a.get('name', '')) for a in w.get('authors') or [] if a.get('name')}
        code, ev = gate_rec(rec, wn, title_keys(w))
        out.append((bid, wid, code, ev))
    return out


if __name__ == '__main__':
    import argparse
    import collections
    import json
    ap = argparse.ArgumentParser(description='国書责任者闸回扫：python3 authorgate.py --plan X.jsonl --data-root library_data --works-root ROOT')
    ap.add_argument('--plan', required=True)
    ap.add_argument('--data-root', required=True)
    ap.add_argument('--works-root', required=True)
    a = ap.parse_args()
    plan = [json.loads(l) for l in open(a.plan, encoding='utf-8') if l.strip()]
    res = scan(plan, a.data_root, a.works_root)
    for bid, wid, code, ev in res:
        print('\t'.join([bid, wid, code, ev.get('book_author', ''), ev.get('work_layer', '')]))
    print('#', len(plan), dict(collections.Counter(c for _, _, c, _ in res)))
