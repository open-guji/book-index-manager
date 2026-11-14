"""首爾大學奎章閣韓國學研究院「中國本」（kyudb.snu.ac.kr，分类 SB|SBJG；L5，2026-11-14）。
原档由用户本机抓取（6,726 条书目，1,209 条有原文影像按钮）；每条＝一部藏本（book_cd），影像是站内 POST 弹窗无直链，
资源 url 取详情页。「中国本」按四部分类标注，含朝鮮刊漢籍（判本、年代见 version）。只挂 has_image 的条目。
责任者写法「楊愼(明) 選;袁宏道(明) 參閱 / 양신(명) 선;…」，取「 / 」前的汉字段。"""
import unicodedata

from adapters.jpc1 import finalize, load_json, parse_author, parse_title, record

SOURCE = 'kyu'
FILE = '奎章閣中國本.json'


def load(data_root):
    out = []
    for r in load_json(data_root, FILE):
        if not r.get('has_image'):
            continue
        title, juan, force, _ = parse_title(r['bookName'])
        names, lead, era = parse_author((r.get('author') or '').split(' / ')[0])
        unit = 'u:' + r['source_record_id']
        out.append(record(SOURCE, r, title, juan, names, lead, era, force, unit,
                          has_image=True, extra=dict(call_no=r.get('holding_id', ''))))
    return finalize(out)
