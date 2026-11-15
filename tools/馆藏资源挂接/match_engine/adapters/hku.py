"""香港大學馮平山圖書館善本書影像庫（digitalrepository.lib.hku.hk；L5，2026-11-15）。
用户本机抓取 116 种（968 册），全部有开放影像；一种＝一个藏本（id）。title 数组首项拼音、次项汉字题名（可带「[三卷]」）；
creator 如「謝蕡, 1521年進士.」，取逗号前的名字；影像为站内查看器，无 manifest 直链，资源 url 取详情页。"""
import re

from adapters.jpc1 import finalize, load_json, parse_author, parse_title, record

SOURCE = 'hku'
FILE = '港大馮平山善本.json'


def load(data_root):
    out = []
    for r in load_json(data_root, FILE):
        title, juan, force, _ = parse_title(r['bookName'])
        names, lead, era = parse_author(r.get('author'))
        out.append(record(SOURCE, r, title, juan, names, lead, era, force, 'u:' + r['source_record_id'],
                          has_image=True, extra=dict(call_no=r.get('holding_id', ''))))
    return finalize(out)
