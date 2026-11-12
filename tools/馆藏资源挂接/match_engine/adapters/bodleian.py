"""牛津大学博德利图书馆 Digital Bodleian（Chinese Maps／Manuscripts／Printed Books；L5，2026-11-12）。
著录体例同国图（题名带「不分卷」「N卷」，版本「明萬曆中刊本」，责任者「(唐)韓愈」），按记录一条一个藏本，记录号＝站方 UUID。
无汉字题名（缺题名 182、纯西文）、以【】括起的拓片／舆图集合、无影像（无 IIIF manifest）者不进写入计划。责任者无汉字则置空。"""
import json
import os
import re

SOURCE = 'bodleian'
FILE = '牛津博德利图书馆.json'
CJK = re.compile(r'[㐀-鿿]')


def load(data_root):
    recs = json.load(open(os.path.join(data_root, FILE), encoding='utf-8'))
    out = []
    for r in recs:
        title = (r.get('bookName') or '').strip()
        au = (r.get('author') or '').strip()
        if not CJK.search(au):
            au = ''
        ok = bool(CJK.search(title)) and not title.startswith('【') and bool(r.get('image_url'))
        out.append(dict(source=SOURCE, source_record_id=r['source_record_id'], group_key='', title_raw=title, author_raw=au,
                        version_raw=(r.get('version') or '').strip(), juan=None, class_raw='', url=r.get('url') or '',
                        image_url=r.get('image_url') or '', has_image=ok,
                        extra=dict(holding_id=r.get('holding_id') or '')))
    return out
