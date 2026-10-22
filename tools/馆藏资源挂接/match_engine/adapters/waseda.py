"""早稲田大学図書館 古典籍总合数据库适配器：`waseda/part-*.json` → 统一 Record（R1-E5，Everett，2026-10-15）。
一条记录＝一个著录单位（顶层册或其子册，id 形如 he13_02378_0033）；匹配以单条记录为单位，
group_key＝顶层册 id（去掉末尾 `_NNNN`），供将来写入时按顶层册收敛、每 Work≤3 藏本。
题名：`中文题名. 卷次 / 责任表述 罗马字`——取 ` / ` 左侧、剥去罗马字段、取首个 `. `／` : ` 之前。
责任者：`姓 名 romaji, romaji` 或 `姓, 名, (生-卒) romaji`——以拉丁字母段为人与人的分界，每段 CJK 拼成一个名；
责任方式在 author 字段里已丢失，故所有名一视同仁（画者等多入名集合只会让“相交”更宽，须靠题名全等＋唯一 Work 挡）。
目前只用于出三档表，不出 write_plan（站点 waseda 尚未在 resource-site 登记）。"""
import glob
import json
import os
import re
import unicodedata

from normalize import fold, PUNCT

SOURCE = 'waseda'
DIR = 'waseda'
LAT = re.compile(r"[A-Za-zĀĪŪĒŌāīūēō][A-Za-zĀĪŪĒŌāīūēō'’\-]*(?:[ ,.:;]+[A-Za-zĀĪŪĒŌāīūēō'’\-]+)*")
SUB_ID = re.compile(r'(?:_\d{4})+$')
CJK = re.compile(r'[\u3040-\u30ff\u3400-\u9fff]')
VOLN = re.compile(r'[巻卷]\s*(\d+)(?:\s*[-~]\s*(\d+))?')


def top_id(rid):
    return SUB_ID.sub('', rid) or rid


def title_parts(book_name):
    """→ (题名主体, 卷次段)。"""
    s = unicodedata.normalize('NFKC', book_name or '')
    left = s.split(' / ')[0]
    left = LAT.sub(' ', left)
    left = re.sub(r'[\[\]※]', '', left)
    parts = re.split(r'\.\s|\s:\s', left, maxsplit=1)
    main = re.sub(r'\s+', ' ', parts[0]).strip()
    return main, (parts[1].strip() if len(parts) > 1 else '')


def juan_of(vol):
    best = None
    for m in VOLN.finditer(unicodedata.normalize('NFKC', vol or '')):
        n = int(m.group(2) or m.group(1))
        best = n if best is None else max(best, n)
    return best


def parse_author(s):
    """→ 归一后的人名集合。"""
    s = unicodedata.normalize('NFKC', s or '')
    s = re.sub(r'\([^)]*\)', ' ', s)                       # (1844-1927)、(13th/14th cent.)
    s = re.sub(r'(?<![\u3040-\u9fff])-?\d{3,4}\??-?\d{0,4}\??', ' ', s)  # 无括号的生卒年
    out = set()
    for seg in LAT.split(s):
        nm = PUNCT.sub('', fold(re.sub(r'[\s,，、]+', '', seg)))
        if 2 <= len(nm) <= 8 and CJK.search(nm) and nm not in ('阙名', '不详', '佚名', '无名氏', '作者不明'):
            out.add(nm)
    return out


def parse_author_first(s):
    """首个人名（拉丁字母段为界的第一个 CJK 段）；缺则空集。"""
    s = unicodedata.normalize('NFKC', s or '')
    s = re.sub(r'\([^)]*\)', ' ', s)
    s = re.sub(r'(?<![\u3040-\u9fff])-?\d{3,4}\??-?\d{0,4}\??', ' ', s)
    for seg in LAT.split(s):
        nm = PUNCT.sub('', fold(re.sub(r'[\s,，、]+', '', seg)))
        if 2 <= len(nm) <= 8 and CJK.search(nm) and nm not in ('阙名', '不详', '佚名', '无名氏', '作者不明'):
            return {nm}
    return set()


def load(data_root, path=DIR):
    out = []
    for f in sorted(glob.glob(os.path.join(data_root, path, 'part-*.json'))):
        for r in json.load(open(f, encoding='utf-8')):
            rid = r['source_record_id']
            main, vol = title_parts(r['bookName'])
            author = r.get('author') or ''
            version = r.get('version') or ''
            sort = r.get('sort') or ''
            force = []
            if not CJK.search(main):
                main = ''                  # 纯罗马字题名：segs 为空，judge 自然落 T_EMPTY
            if '叢書' in sort:
                force.append('COLLECTION')
            juan = juan_of(vol)
            p = dict(wname='', names=parse_author(author), lead=parse_author_first(author), era_token=None, juan=juan, segs=[main] if main else [], alts=[], sort=sort, force=force)
            out.append(dict(source=SOURCE, source_record_id=rid, group_key=top_id(rid), title_raw=main, author_raw=author,
                            version_raw=version, juan=juan, class_raw=sort, url=r.get('url') or '',
                            image_url=r.get('image_url') or '', has_image=bool(r.get('image_url')),
                            extra=dict(holding_id=r.get('holding_id', ''), extent=r.get('extent', ''), vol=vol), parsed=p))
    return out
