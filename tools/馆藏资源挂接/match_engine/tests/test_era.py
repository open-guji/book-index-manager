"""块 D 步 3 单测：era.py（用内联小键表，不依赖外部文件）。"""
import json
import pytest
import era


def _entry(i, name, start, end=None, **kw):
    e = {'id': i, 'primary_name': name, 'subtype': 'dynasty', 'start': start}
    if end is not None:
        e['end'] = end
    e.update(kw)
    return name, e


@pytest.fixture(autouse=True)
def keys(tmp_path):
    ents = [_entry('d1', '唐', 618, 907), _entry('d2', '北宋', 960, 1127), _entry('d3', '南宋', 1127, 1279),
            _entry('d4', '元', 1271, 1368), _entry('d5', '明', 1368, 1644), _entry('d6', '清', 1636, 1912),
            _entry('d7', '北周', 557, 581), _entry('d8', '前蜀', 907, 925), _entry('d9', '中華民國', 1912),
            _entry('d10', '宋', 420, 479), _entry('d11', '宋', 960, 1279), _entry('d12', '五代', 907, 960),
            _entry('d13', '商', -1600, -1046), _entry('d14', '遼金元', 916, 1368)]
    keys = {}
    for n, e in ents:
        keys.setdefault(n, []).append(e)
    p = tmp_path / 'k.json'
    p.write_text(json.dumps({'keys': keys, 'count': {}, 'normalize': {}, 'version': 1}), encoding='utf-8')
    era.MISSES.clear()
    era.load_keys(str(p))
    yield


@pytest.mark.parametrize('tok,rank', [('唐', 4), ('北宋', 5), ('南宋', 5), ('元', 6), ('明', 7), ('清', 8), ('北周', 2), ('前蜀', 4.5),
                                      ('中華民國', 9), ('五代', 4.5)])
def test_rank_from_keys(tok, rank):
    assert era.rank_of(tok)[0] == rank


def test_ambiguous_name_uses_legacy_not_union():
    """同名多政权（宋）：并集区间无意义，沿旧引擎取 5。"""
    r, src = era.rank_of('宋')
    assert r == 5 and src == 'legacy-ambiguous'


def test_unknown_token_recorded_not_silent():
    assert era.rank_of('某某朝')[0] is None
    assert era.report().get('某某朝') == 1


def test_single_char_new_names_not_matched_as_prefix():
    """键表里的单字名（商）不得拿来匹配版本串开头：「商務印書館」不是商朝。"""
    assert era.lead_era('商務印書館   清光緒24年[1898]') is None
    assert era.lead_era('清光緒24年[1898]') == 8


@pytest.mark.parametrize('raw,rank', [('(明)倪謙撰', 7), ('[宋]曾鞏撰', 5), ('(唐 )李翺撰', 4), ('(宋释)惠洪撰', 5), ('（清）孫家鼐編', 8),
                                      ('(北周)庾信撰', 2), ('(前蜀)杜光庭撰', 4.5)])
def test_author_era_bracket_is_era(raw, rank):
    assert era.author_era(raw) == rank


@pytest.mark.parametrize('raw', ['[唐順之撰]', '[吳昌綬]編', '[陳琯]', '陳琯', '', None])
def test_author_era_name_in_bracket_is_not_era(raw):
    assert era.author_era(raw) is None


def test_author_era_nonstrict_reproduces_old_flaw():
    assert era.author_era('[唐順之撰]', strict=False) == 4


@pytest.mark.parametrize('d,rank', [('北周', 2), ('前蜀', 4.5), ('唐', 4), ('', None), ('不明', None)])
def test_work_era(d, rank):
    assert era.work_era({'dynasty': d}) == rank


def test_open_ended_dynasty_buckets_by_start():
    assert era.rank_of('中華民國')[0] == 9
