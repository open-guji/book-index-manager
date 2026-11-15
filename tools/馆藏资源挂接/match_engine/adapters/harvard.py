"""哈佛燕京图书馆中文在线书目（Harvard LibraryCloud，repository=Harvard Yenching，isOnline；L5，2026-11-15）。
用户本机经 API 取得；题名为「拼音 … | 汉字题名 12卷」，取含汉字的段；责任者取含汉字的名（「陳繼儒, 1558-1639」逗号后生卒年自动丢弃）。
一条 HOLLIS 记录（hollis_id，去掉 `_FHCL:…` 分册后缀）＝一个藏本；资源 url 取整书影像入口（nrs.harvard.edu/urn-3），其次 hdl/ids。"""
import re

from adapters.jpc1 import finalize, load_json, parse_author, parse_title, record

SOURCE = 'harvard'
FILE = '哈佛燕京中文在线.json'
CJK = re.compile(r'[㐀-鿿]')


def load(data_root):
    out = []
    for r in load_json(data_root, FILE):
        if not r.get('url'):
            continue
        title, juan, force, _ = parse_title(r['bookName'])
        names, lead, era = parse_author(r.get('author'))
        out.append(record(SOURCE, r, title, juan, names, lead, era, force, 'u:' + r['unit'],
                          has_image=True, extra=dict(call_no=r.get('holding_id', ''))))
    return finalize(out)
