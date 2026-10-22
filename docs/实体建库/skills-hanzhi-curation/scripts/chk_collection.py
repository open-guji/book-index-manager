#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Collection 層之校驗——升格前的體檢。比照 chk_entity.py，分甲乙丙三級。

  甲 阻塞升格：升格不可逆，此類必須清盡方可升。
  乙 存疑：可帶病升格而記其疑。
  丙 體例之異：不阻塞。

Collection 與 Work／Entity 之別，在其**引用面極廣而成員列表語義有三**
（見 SCHEMA〈Collection 的三種成員列表〉）：
  `books`           成員是具體版本（Book ID 陣列）
  `contained_works` 成員是作品（帶冊次）
  `contains`        本叢編之結構組成部分（聖諭、進表、總目、選印來源）
三者不可互換；尤不可以 Collection id 混入 `books`——那是巢狀，當用子條之
`contained_in` 表之。

又：Book→Collection 之 `contained_in` 有兩萬三千餘處，而 Collection 之
`books` 止四百餘——**此關係本是單向的**（大叢編不逐一列其書），
不可以「雙向不合」論之。此點與人物↔作品之雙向不同，勿誤驗。

用法：python3 .claude/skills/hanzhi-curation/scripts/chk_collection.py [--all]
"""
import json, os, sys, glob, collections

ROOT = os.getcwd()
PROD = next((r for r in ('../book-index', 'book-index') if os.path.isdir(r + '/Work')), None)
DIG = '0123456789abcdefghijklmnopqrstuvwxyz'
SUBTYPES = {'work_collection', 'book_collection'}
IDXF = 'index/collections.json'


def u36(s):
    n = 0
    for c in s:
        if c not in DIG: return None
        n = n * 36 + DIG.index(c)
    return n


def bits(i):
    v = u36(i)
    if v is None: return None
    return {'status': (v >> 62) & 1, 'type': (v >> 59) & 7}


def load(root):
    out = {}
    for p in glob.glob(root + '/Collection/*/*/*/*.json'):
        try: d = json.load(open(p))
        except Exception: continue
        if isinstance(d, dict) and d.get('id'): out[d['id']] = (d, p)
    return out


def main():
    ALLF = '--all' in sys.argv
    A = collections.defaultdict(list)   # 甲
    B = collections.defaultdict(list)   # 乙
    C = collections.defaultdict(list)   # 丙

    dc = load('.')
    pc = load(PROD) if PROD else {}
    IX = json.load(open(IDXF))
    PR = json.load(open('promotions.json'))['promotions']

    # 兩倉之 Work／Book id（含墓碑，墓碑另記）
    def ids(root, t):
        live, tomb = set(), set()
        for p in glob.glob(f'{root}/{t}/*/*/*/*.json'):
            try: d = json.load(open(p))
            except Exception: continue
            (tomb if d.get('_promoted_to') else live).add(d.get('id'))
        return live, tomb
    dwl, dwt = ids('.', 'Work'); dbl, dbt = ids('.', 'Book')
    pwl = ids(PROD, 'Work')[0] if PROD else set()
    pbl = ids(PROD, 'Book')[0] if PROD else set()
    allc = set(dc) | set(pc)

    tombs = {i for i, (d, _) in dc.items() if d.get('_promoted_to')}
    live = {i: v for i, v in dc.items() if i not in tombs}

    for i, (d, p) in dc.items():
        b = bits(i)
        # ── id 之位 ──
        if b is None or len(i) not in (12, 13):
            A['id 非 base36 或長度不合'].append((i, p))
        elif b['type'] != 2:
            A['id 之 type 位非 Collection（2）'].append((i, b['type']))
        elif i in tombs and b['status'] != 1:
            A['墓碑而 id 之 status 位非 draft'].append((i,))
        # ── 分片與檔名 ──
        want = f'Collection/{i[-3]}/{i[-2]}/{i[-1]}'
        if os.path.dirname(os.path.relpath(p, '.')) != want:
            A['目錄分片錯置（取 id 末三字）'].append((i, p, want))
        # 檔名之 id 段須即其 id
        if os.path.basename(p).split('-')[0] != i:
            A['檔名之 id 與內容不符'].append((i, p))
        # ── 索引 ──
        e = IX.get(i)
        if not e:
            A['未入索引'].append((i, d.get('title')))
        else:
            if e.get('path') != os.path.relpath(p, '.').replace(os.sep, '/'):
                A['索引之 path 不符'].append((i, e.get('path'), p))
            if e.get('title') != d.get('title'):
                A['索引之 title 不符'].append((i, e.get('title'), d.get('title')))
            if e.get('type') != 'Collection':
                C['索引之 type 非「Collection」'].append((i, e.get('type')))
        if i in tombs:
            # 墓碑只驗骨架
            if set(d) - {'schema_version', 'id', 'type', 'title', '_promoted_to', '_promoted_at'}:
                B['墓碑帶多餘欄位（舊式全文墓碑）'].append((i, sorted(set(d) - {'schema_version','id','type','title','_promoted_to','_promoted_at'})[:6]))
            if e and e.get('promoted_to') != d.get('_promoted_to'):
                A['墓碑之索引 promoted_to 不符'].append((i, e.get('promoted_to'), d.get('_promoted_to')))
            if PR.get(i, {}).get('production_id') != d.get('_promoted_to'):
                A['墓碑與 promotions.json 不符'].append((i,))
            if PROD and d.get('_promoted_to') not in pc:
                A['墓碑所指之 production 條不存在'].append((i, d.get('_promoted_to')))
            continue

        # ── 必填與枚舉 ──
        if not d.get('title'): A['無 title'].append((i,))
        st = d.get('subtype')
        if not st: A['無 subtype'].append((i, d.get('title')))
        elif st not in SUBTYPES: A['subtype 不合枚舉'].append((i, st))
        if d.get('type') != 'collection': A['type 非 collection'].append((i, d.get('type')))
        if 'schema_version' not in d: C['無 schema_version'].append((i,))
        if not (d.get('description') or {}).get('text'): C['description.text 空'].append((i, d.get('title')))

        # ── 三種成員列表 ──
        for w in (d.get('contained_works') or []):
            if not isinstance(w, dict): A['contained_works 元素非物件'].append((i, w)); continue
            wi = w.get('id')
            if not wi: A['contained_works 元素無 id'].append((i, w.get('title')))
            elif wi in allc: A['contained_works 之 id 實為 Collection'].append((i, wi))
            elif wi in pwl or wi in dwl: pass
            elif wi in dwt: B['contained_works 指向 draft 墓碑（當改指 production）'].append((i, wi))
            else: A['contained_works 懸空'].append((i, wi, w.get('title')))
        seenw = collections.Counter(w.get('id') for w in (d.get('contained_works') or []) if isinstance(w, dict))
        for k, n in seenw.items():
            if n > 1: B['contained_works 重複'].append((i, k, n))

        for bk in (d.get('books') or []):
            bi = bk.get('id') if isinstance(bk, dict) else bk
            if not bi: A['books 元素無 id'].append((i, bk))
            elif bi in allc: A['books 混入 Collection id（巢狀當用子條之 contained_in）'].append((i, bi))
            elif bi in pbl: pass
            elif bi in dbl: B['books 指向尚在 draft 之 Book'].append((i, bi))
            elif bi in dbt: B['books 指向 draft 墓碑（當改指 production）'].append((i, bi))
            else: A['books 懸空'].append((i, bi))
        seenb = collections.Counter((bk.get('id') if isinstance(bk, dict) else bk) for bk in (d.get('books') or []))
        for k, n in seenb.items():
            if n > 1: B['books 重複'].append((i, k, n))

        for c in (d.get('contains') or []):
            if not isinstance(c, dict): A['contains 元素非物件'].append((i, c)); continue
            for k, pool in (('work_id', pwl | dwl), ('book_id', pbl | dbl), ('collection_id', allc)):
                if c.get(k) and c[k] not in pool:
                    A[f'contains[].{k} 懸空'].append((i, c[k]))

        # ── 巢狀 ──
        for x in (d.get('contained_in') or []):
            xi = x if isinstance(x, str) else (x.get('id') if isinstance(x, dict) else None)
            if not xi: A['contained_in 元素無 id'].append((i, x))
            elif xi not in allc: A['contained_in 懸空'].append((i, xi))
            elif xi == i: A['contained_in 自指'].append((i,))
        for r in (d.get('related_collections') or []):
            ri = r.get('collection_id') if isinstance(r, dict) else r
            if ri and ri not in allc: A['related_collections 懸空'].append((i, ri))
        if d.get('work_id') and d['work_id'] not in (pwl | dwl):
            A['work_id 懸空'].append((i, d['work_id']))
        for rb in (d.get('related_books') or []):
            if rb and rb not in (pbl | dbl): A['related_books 懸空'].append((i, rb))
        for s in (d.get('indexed_by') or []):
            if isinstance(s, dict) and s.get('source_bid') and s['source_bid'] not in (pwl | dwl | pbl | dbl):
                A['indexed_by[].source_bid 懸空'].append((i, s['source_bid']))

        # ── 孤懸 ──
        if not (d.get('contained_works') or d.get('books') or d.get('contains')):
            B['三種成員列表俱空'].append((i, d.get('title')))

        # ── 派生欄位 ──
        ts = set()
        for r in (d.get('resources') or []):
            if isinstance(r, dict): ts.update(r.get('types') or ([r['type']] if r.get('type') else []))
        for k, v in (('_has_text', 'text' in ts), ('_has_image', 'image' in ts)):
            if bool(d.get(k)) != v: C[f'派生欄 {k} 與 resources 不符'].append((i, d.get(k), v))

        # ── 格式 ──
        raw = open(p, encoding='utf-8').read()
        if not raw.endswith('\n'): C['JSON 缺檔尾換行'].append((i,))
        if '\n  "' not in raw and len(raw) > 80: C['JSON 縮排疑非 2'].append((i,))

    # ── 巢狀成環 ──
    parent = {i: [(x if isinstance(x, str) else x.get('id')) for x in (d.get('contained_in') or [])]
              for i, (d, _) in dc.items() if i not in tombs}
    def cyc(n, seen):
        if n in seen: return True
        for q in parent.get(n, []):
            if q and cyc(q, seen | {n}): return True
        return False
    for i in parent:
        if cyc(i, set()): A['contained_in 成環'].append((i,))

    # ── 索引之殘留與排序 ──
    for k, v in IX.items():
        if k not in dc: A['索引指向不存在之記錄'].append((k, v.get('title')))
    if list(IX) != sorted(IX): C['索引未按 id 排序'].append(('index/collections.json',))

    # ── 同題而未分（乙）──
    byt = collections.defaultdict(list)
    for i, (d, _) in live.items(): byt[d.get('title')].append(i)
    for t, g in byt.items():
        if len(g) > 1:
            sts = [dc[x][0].get('subtype') for x in g]
            eds = [dc[x][0].get('edition') or (dc[x][0].get('publication_info') or {}).get('year') for x in g]
            if len(set(zip(sts, eds))) < len(g):
                A['同題且 subtype／版本俱同（疑重出）'].append((t, g))
            else:
                B['同題而 subtype 或版本各異（合例之層級，記之以備覈）'].append((t, list(zip(g, sts, eds))))

    n = len(live)
    print(f'draft Collection 活條 {n}　墓碑 {len(tombs)}　索引 {len(IX)}　'
          f'production 掛載 {"是" if PROD else "否"}　已升格 {len(pc)}')
    for lab, buck in (('甲】阻塞升格——升格不可逆，必須清盡', A),
                      ('乙】存疑——可帶病升格而記其疑', B),
                      ('丙】體例之異——不阻塞', C)):
        tot = sum(len(v) for v in buck.values())
        print(f'\n【{lab}　{tot} 條')
        for k, v in sorted(buck.items(), key=lambda x: -len(x[1])):
            print(f'  {len(v):6}  {k}')
            for x in (v if ALLF else v[:4]): print('           ', x)
            if not ALLF and len(v) > 4: print(f'            …餘 {len(v)-4}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
