"""KU-ORCAS 适配器（L5）：册次不当卷数，同书各册成一个 unit。"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from adapters import kansai  # noqa: E402


def _rec(title, author='', version='v'):
    return dict(bookName=title, author=author, version=version, sort='經部詩類', url='u/' + title, image_url='', holding_id='h', source_record_id=title)


def test_volume_suffix_stripped_and_grouped(monkeypatch):
    rows = [_rec('詩經説約 巻21-22', '顧夢麟纂述'), _rec('詩經説約 巻1-2', '顧夢麟纂述'), _rec('論語徴 癸', '物茂卿著')]
    monkeypatch.setattr(kansai, 'load_json', lambda root, f: rows)
    out = kansai.load('x')
    assert out[0]['title_raw'] and out[0]['juan'] is None
    assert out[0]['group_key'] == out[1]['group_key'] != out[2]['group_key']
