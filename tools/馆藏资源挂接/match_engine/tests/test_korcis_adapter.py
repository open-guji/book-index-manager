import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from adapters import korcis  # noqa: E402
import writeplan  # noqa: E402


def _rec(rid, title, author, has_original=True):
    return dict(bookName=title, title=title, author=author, edition='木板本', period='哲宗 12(1861)', sort='',
                url='https://www.nl.go.kr/korcis/openapi/detail.do?rec_key=' + rid, source_id='korcis', source_record_id=rid,
                extra=dict(library='국립중앙도서관', has_original=has_original))


def test_split_part_and_author():
    assert korcis.split_part('松川先生遺集. 卷1-7') == ('松川先生遺集', '卷1-7')
    assert korcis.split_part('釋譜詳節. 第6, 9, 13, 19') == ('釋譜詳節', '第6, 9, 13, 19')
    assert korcis.split_part('昌舍集 : (幷)附錄, 世系') == ('昌舍集 : (幷)附錄, 世系', '')
    assert korcis.norm_author('梁應鼎(朝鮮) 著 ; 梁曼容(朝鮮) 編') == '(朝鮮)梁應鼎著；(朝鮮)梁曼容編'
    assert korcis.norm_author('[崔益鉉](朝鮮) 受給') == '(朝鮮)崔益鉉受給'
    assert korcis.norm_author('朴相璜...等編') == '朴相璜等編'


def test_load_and_make_item(tmp_path):
    d = tmp_path / korcis.DEFAULT_DIR
    d.mkdir()
    recs = [_rec('1', '千字文. 卷1', '周興嗣(梁) 著'), _rec('2', '千字文', '周興嗣(梁) 著'), _rec('3', '千字文', '周興嗣(梁) 著'),
            _rec('4', '千字文', '周興嗣(梁) 著', has_original=False)]
    (d / 'part-001.json').write_text(json.dumps(recs, ensure_ascii=False), encoding='utf-8')
    (d / korcis.KOL_FILE).write_text(json.dumps({'1': dict(kol='KOL000000002', call_no='古1', public=True),
                                                 '2': dict(kol='KOL000000003', call_no='', public=False)}), encoding='utf-8')
    a, b, c = korcis.load(str(tmp_path))         # 无原文影像的 4 不载入
    assert a['title_raw'] == '千字文' and a['extra']['part'] == '卷1' and a['author_raw'] == '(梁)周興嗣著'
    assert a['has_image'] and a['url'] == korcis.NLK_SEARCH.format('KOL000000002')
    assert not b['has_image'] and not c['has_image'] and c['url'] == ''     # 只限馆内阅览／缺控制号：不进计划
    item, grp, label = writeplan.make_item('korcis', a)
    assert item['id'] == 'nlk' and grp == 'korcis-1' and item['types'] == ['image']
    assert item['metadata'] == dict(korcis_rec_key='1', nlk_control_no='KOL000000002', holder='국립중앙도서관', call_number='古1',
                                    part='卷1', edition='木板本 哲宗 12(1861)')
    assert label == '韓國國立中央圖書館數字化藏本：木板本 哲宗 12(1861)'
    assert writeplan.make_item('korcis', b) is None
