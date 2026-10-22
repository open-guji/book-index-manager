import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from adapters.naikaku import edition_label  # noqa: E402
import normalize  # noqa: E402


def test_edition_label_formats():
    assert edition_label('刊本::明天啓:020000:広益堂') == '明天啓2年刊本 広益堂'
    assert edition_label('刊本（序刊）::明崇禎:050000:') == '明崇禎5年刊本（序刊）'
    assert edition_label('刊本:明:::') == '明刊本'
    assert edition_label('刊本（序刊）:明万暦26年:::') == '明万暦26年刊本（序刊）'
    assert edition_label('刊本（序刊）:清嘉慶:清嘉慶:120000:浣月斎') == '清嘉慶12年刊本（序刊） 浣月斎'
    assert edition_label('刊本:::中華書局') == '刊本'
    assert edition_label('') == ''


def test_naikaku_fold_switch():
    try:
        normalize.enable_naikaku_fold(False)
        assert normalize.fold('兪') != normalize.fold('俞')
        normalize.enable_naikaku_fold(True)
        for a, b in (('兪', '俞'), ('喩', '喻'), ('纉', '缵'), ('褘', '祎'), ('淩', '凌')):
            assert normalize.fold(a) == normalize.fold(b), a
    finally:
        normalize.enable_naikaku_fold(False)
