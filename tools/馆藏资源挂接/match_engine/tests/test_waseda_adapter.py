import os
import sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from adapters import waseda as W  # noqa: E402


@pytest.mark.parametrize('raw,main,vol', [
    ('吳王書画 go ō shoga', '吳王書画', ''),
    ('万国公法. 巻1-4 / 恵頓 [著] ; 丁韙良 [訳] bankoku kōhō', '万国公法', '巻1-4'),
    ('論語集解 : 十巻 / 何晏 集解 rongo shūkai', '論語集解', '十巻'),
    ('史記. 巻1-130 shiki', '史記', '巻1-130'),
    ('[※]春秋左氏伝 shunjū sashiden', '春秋左氏伝', ''),
    ('唐詩選 tōshisen / 李攀龍 編', '唐詩選', ''),
    ('Shiki', '', ''),
    ('', '', ''),
    ('東海道中膝栗毛. 初編 tōkaidō chū hizakurige', '東海道中膝栗毛', '初編'),
    ('文選. 巻1 / 蕭統 bunsen', '文選', '巻1'),
])
def test_title_parts(raw, main, vol):
    assert W.title_parts(raw) == (main, vol)


@pytest.mark.parametrize('vol,n', [('巻1-4', 4), ('巻3', 3), ('卷2-10', 10), ('', None), ('初編', None), ('巻 5', 5)])
def test_juan(vol, n):
    assert W.juan_of(vol) == n


@pytest.mark.parametrize('rid,top', [
    ('he13_02378_0033', 'he13_02378'), ('he13_02378', 'he13_02378'), ('ya09_00034_0001_0002', 'ya09_00034'), ('_0001', '_0001')])
def test_top_id(rid, top):
    assert W.top_id(rid) == top


def test_author_washo():
    assert W.parse_author('鳥居 清経 torii, kiyotsune') == {W.fold('鳥居清経')}


def test_author_hanseki_dates():
    a = W.parse_author('吴, 昌硕, (1844-1927) Wu, Changshuo 王, 一亭, Wang, Yiting')
    assert W.fold('吴昌硕') in a and W.fold('王一亭') in a and len(a) == 2


def test_author_bare_years_and_unknown():
    assert W.parse_author('') == set()
    assert W.parse_author(None) == set()
    assert W.parse_author('佚名 itsumei') == set()


def test_author_single_char_dropped():
    assert W.parse_author('李 ri') == set()


def test_load_roundtrip(tmp_path):
    import json
    d = tmp_path / 'waseda'
    d.mkdir()
    recs = [
        dict(source_record_id='he13_02378', bookName='史記. 巻1-130 shiki', author='司馬, 遷, (前145-前86) Sima, Qian', version='', sort='漢籍'),
        dict(source_record_id='he13_02378_0001', bookName='史記. 巻1 shiki', author='', sort='漢籍', image_url='http://x'),
        dict(source_record_id='x1', bookName='Shiki only', sort='叢書'),
        dict(source_record_id='x2', bookName='諸子叢書 shoshi sōsho', sort='諸子叢書'),
    ]
    json.dump(recs, open(d / 'part-001.json', 'w', encoding='utf-8'), ensure_ascii=False)
    out = W.load(str(tmp_path))
    assert [o['group_key'] for o in out] == ['he13_02378', 'he13_02378', 'x1', 'x2']
    assert out[0]['parsed']['segs'] == ['史記'] and out[0]['juan'] == 130
    assert out[1]['has_image'] and not out[0]['has_image']
    assert out[2]['parsed']['segs'] == [] and out[2]['title_raw'] == ''
    assert out[3]['parsed']['force'] == ['COLLECTION']
    assert W.fold('司馬遷') in out[0]['parsed']['names']
