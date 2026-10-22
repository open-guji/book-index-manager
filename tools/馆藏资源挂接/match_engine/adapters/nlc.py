"""国图中華古籍資源庫（數字古籍）适配器：`_整理/數字古籍.json`（整份列表）→ 统一 Record。"""
import json
import os
import re

SOURCE = 'nlc'
DEFAULT_PATH = '_整理/數字古籍.json'


def load(data_root, path=None):
    recs = json.load(open(os.path.join(data_root, path or DEFAULT_PATH), encoding='utf-8'))
    out = []
    for r in recs:
        url = r.get('url') or r.get('source_url') or ''
        m = re.search(r'fid=([^&#\s]+)', url)
        rid = r.get('source_record_id') or (m.group(1) if m else '')
        image = r.get('image_url') or ''
        out.append(dict(source=SOURCE, source_record_id=rid, group_key='', title_raw=r.get('title') or r.get('bookName') or '',
                        author_raw=r.get('author') or '', version_raw=r.get('version') or r.get('edition') or '', juan=None,
                        class_raw=r.get('sort') or '', url=url, image_url=image, has_image=True,   # 數字古籍列表：每条均为国图已数字化影像
                        extra=dict(digitized=(r.get('extra') or {}).get('數位化狀態', ''))))
    return out
