"""台湾「國家圖書館」古籍影像檢索适配器：`臺灣國家圖書館古籍影像.json`（C3，book-index-crawler `sites/ncl-rbook/`）→ 统一 Record。

记录号用書號（`extra.book_no`，站方影像与按書號检索的稳定键）；无書號＝无影像，`url` 空，只进三档表不进写入计划。
`url`＝按書號的 GET 检索 `OtherSearch/1/Identifier_BookNo/{書號}`（详情页链接带会话令牌，不稳定）。
"""
import json
import os

SOURCE = 'ncltw'
DEFAULT_PATH = '臺灣國家圖書館古籍影像.json'


def load(data_root, path=None):
    recs = json.load(open(os.path.join(data_root, path or DEFAULT_PATH), encoding='utf-8'))
    out = []
    for r in recs:
        ex = r.get('extra') or {}
        bno = ex.get('book_no') or ''
        out.append(dict(source=SOURCE, source_record_id=bno or 'cb' + r['source_record_id'], group_key='',
                        title_raw=r.get('title') or r.get('bookName') or '', author_raw=r.get('author') or '',
                        version_raw=r.get('edition') or r.get('version') or '', juan=None, class_raw=r.get('sort') or '',
                        url=r.get('url') or '', image_url='', has_image=bool(bno and r.get('url')),
                        extra=dict(holding_id=r.get('holding_id') or '', owner=ex.get('owner', ''), list_id=r['source_record_id'])))
    return out
