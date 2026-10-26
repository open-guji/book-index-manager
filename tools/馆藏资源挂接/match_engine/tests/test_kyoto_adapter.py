import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from adapters import kyoto  # noqa: E402
import writeplan  # noqa: E402


def test_clean_title_and_volume():
    assert kyoto.clean_title('(秘伝)眼科全書 6巻') == '眼科全書 6巻'
    assert kyoto.clean_title('推字函【宋版】 巻第11') == '推字函 巻第11'
    assert kyoto.split_volume('法苑珠林 巻第75') == ('法苑珠林', True)
    assert kyoto.split_volume('朱文公校昌黎先生集 巻1-4') == ('朱文公校昌黎先生集', True)
    assert kyoto.split_volume('彙苑詳註 36 巻') == ('彙苑詳註 36巻', False)
    assert kyoto.split_volume('周易 周易上経、周易下経、繋辞') == ('周易', False)
    assert kyoto.split_volume('医説 10巻') == ('医説 10巻', False)


def test_edition():
    assert kyoto.edition({'出版年（和暦）': '寛永3年', '写刊の別': '刊', '形態・版情報': '刊 和大'}) == '寛永3年 和刻本'
    assert kyoto.edition({'出版年（和暦）': '嘉慶17年', '写刊の別': '刊', '形態・版情報': '刊 支小'}) == '嘉慶17年 中國刊本'
    assert kyoto.edition({'出版年（和暦）': '応永19 写', '写刊の別': '写', '形態・版情報': '25.7×12.5 (cm)*折帖本'}) == '応永19 写'
    assert kyoto.edition({'出版情報': '[出版地不明] : [出版者不明] , [出版年不明]', '出版年': '----'}) == ''


def test_load_and_make_item(tmp_path):
    r = dict(bookName='(新編)医学正伝 8巻', title='(新編)医学正伝 8巻', author='(明)虞摶(天民)撰', version='刊 和大', sort='',
             url='https://rmda.kulib.kyoto-u.ac.jp/item/rb00000875', source_id='kyoto_rmda', source_record_id='RB00000875',
             holding_id='イ/1/貴', image_url='https://rmda.kulib.kyoto-u.ac.jp/iiif/metadata_manifest/RB00000875/manifest.json',
             raw={'出版年（和暦）': '慶安元年', '写刊の別': '刊', '形態・版情報': '刊 和大'}, extra={'collections': ['富士川文庫']})
    (tmp_path / kyoto.FILE).write_text(json.dumps([r], ensure_ascii=False), encoding='utf-8')
    rec, = kyoto.load(str(tmp_path))
    assert rec['parsed']['segs'] == ['医学正伝'] and rec['juan'] == 8
    assert rec['parsed']['era_token'] == '明' and '虞抟' in rec['parsed']['names']
    item, grp, label = writeplan.make_item('kyoto', rec)
    assert item['id'] == 'kyoto-rmda' and grp == 'kyoto-RB00000875'
    assert item['metadata'] == {'kyoto_record': 'RB00000875', 'call_no': 'イ/1/貴', 'edition': '慶安元年 和刻本',
                                'iiif_manifest': r['image_url']}
    assert label == '京大藏本：慶安元年 和刻本'
