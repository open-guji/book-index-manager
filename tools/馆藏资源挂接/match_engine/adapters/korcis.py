"""韩国古文献综合目录 KORCIS 适配器：`korcis/part-*.json`（C3，book-index-crawler `sites/korcis/`）→ 统一 Record。

只取 `extra.has_original`（站方有原文影像）的记录。题名尾部的存卷（`. 卷1-3`、`, 第6, 9`）切出放 `extra.part`；
责任者 `名(朝代) 撰 ; 名(朝代) 編` 改成国图体例 `(朝代)名撰；(朝代)名編`。
记录号＝KORCIS rec_key。Open API 记录没有可读链接：影像链接由 `korcis/_kol.json`（rec_key → 国中自馆控制号 KOL…、
是否互联网公开）补上，url＝按控制号的国中 GET 检索；缺控制号或只限馆内／协约馆阅览的 has_image=False，不进写入计划。
"""
import glob
import json
import os
import re

SOURCE = 'korcis'
DEFAULT_DIR = 'korcis'
KOL_FILE = '_kol.json'
NLK_SEARCH = 'https://www.nl.go.kr/NL/contents/search.do?srchTarget=total&kwd={}'

PART = re.compile(r'\s*[.,:]\s*(?:卷|第|冊|册|권|제)\s*[0-9][0-9\s,\-~-]*(?:[卷冊册]|\s*$).*$')


def split_part(title):
    """`松川先生遺集. 卷1-7` → (`松川先生遺集`, `卷1-7`)。"""
    t = (title or '').strip()
    m = PART.search(t)
    if not m or m.start() == 0:
        return t, ''
    return t[:m.start()].strip(), m.group(0).lstrip(' .,:').strip()


AUTH = re.compile(r'^\[?(?P<name>[^\[\]()]+?)\]?\s*(?:\((?P<dyn>[^()]{1,6})\))?\s*(?P<role>[^\s()]*)$')


def norm_author(a):
    """`梁應鼎(朝鮮) 著 ; 梁曼容(朝鮮) 編` → `(朝鮮)梁應鼎著；(朝鮮)梁曼容編`；认不出的段原样保留。"""
    out = []
    for seg in re.split(r'\s*;\s*', a or ''):
        seg = re.sub(r'\.\.\.', '', seg).strip()
        if not seg:
            continue
        m = AUTH.match(seg)
        if not m:
            out.append(seg)
            continue
        name, dyn, role = m.group('name').strip(), m.group('dyn'), m.group('role')
        out.append((f'({dyn})' if dyn else '') + name + role)
    return '；'.join(out)


def load(data_root, path=None):
    d = os.path.join(data_root, path or DEFAULT_DIR)
    kol = {}
    kp = os.path.join(d, KOL_FILE)
    if os.path.exists(kp):
        kol = json.load(open(kp, encoding='utf-8'))
    out = []
    for f in sorted(glob.glob(os.path.join(d, 'part-*.json'))):
        for r in json.load(open(f, encoding='utf-8')):
            ex = r.get('extra') or {}
            if not ex.get('has_original'):
                continue
            rid = r['source_record_id']
            title, part = split_part(r.get('title') or r.get('bookName') or '')
            k = kol.get(rid) or {}
            cno = k.get('kol') or ''
            public = bool(cno and k.get('public'))
            edition = ' '.join(x for x in (r.get('edition') or '', r.get('period') or '') if x)
            out.append(dict(source=SOURCE, source_record_id=rid, group_key='', title_raw=title,
                            author_raw=norm_author(r.get('author') or ''), version_raw=edition, juan=None,
                            class_raw=r.get('sort') or '', url=NLK_SEARCH.format(cno) if cno else '', image_url='',
                            has_image=public,
                            extra=dict(part=part, library=ex.get('library', ''), kol=cno, call_number=k.get('call_no', ''),
                                       title_full=r.get('title') or '', author_full=r.get('author') or '')))
    return out
