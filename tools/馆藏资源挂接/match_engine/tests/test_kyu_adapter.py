"""奎章閣中國本适配器（L5）：只收有影像的条目，一条一个 unit。"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from adapters import kyu  # noqa: E402


def _rec(rid, img):
    return dict(bookName='家禮', author='朱熹(宋) 編 / 주희(송) 편', version='木版本 1759', url='u/' + rid, image_url='',
                holding_id='奎中 314', source_record_id=rid, has_image=img)


def test_only_with_image(monkeypatch):
    monkeypatch.setattr(kyu, 'load_json', lambda root, f: [_rec('A', True), _rec('B', False)])
    out = kyu.load('x')
    assert [r['source_record_id'] for r in out] == ['A'] and out[0]['has_image']
    assert '朱熹' in out[0]['parsed']['names']
