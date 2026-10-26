import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from adapters import ncltw  # noqa: E402
import writeplan  # noqa: E402

URL = 'https://rbook.ncl.edu.tw/NCLSearch/Search/OtherSearch/1/Identifier_BookNo/02362'


def _rec(book_no, url):
    return dict(bookName='古列女傳', title='古列女傳', author='(漢)劉向撰', edition='明黃魯曾刊本', version='明黃魯曾刊本',
                sort='史部-傳記類', url=url, source_url=url, source_id='ncl-rbook', source_record_id='907487',
                holding_id='205.1 02362', extra=dict(owner='國家圖書館', book_no=book_no, category='傳記類', has_image=bool(book_no)))


def test_load_and_make_item(tmp_path):
    (tmp_path / ncltw.DEFAULT_PATH).write_text(json.dumps([_rec('02362', URL), _rec('', '')], ensure_ascii=False), encoding='utf-8')
    a, b = ncltw.load(str(tmp_path))
    assert a['source_record_id'] == '02362' and a['has_image'] and a['url'] == URL
    assert b['source_record_id'] == 'cb907487' and not b['has_image']     # 无書號＝无影像，不进计划
    item, grp, label = writeplan.make_item('ncltw', a)
    assert item['id'] == 'ncl-tw' and grp == 'ncltw-02362' and item['url'] == URL
    assert item['metadata'] == dict(ncltw_bookno='02362', call_number='205.1 02362', edition='明黃魯曾刊本')
    assert label == '臺灣國家圖書館藏本：明黃魯曾刊本'
    assert writeplan.make_item('ncltw', b) is None
