"""第 12 组 S2-T：additional_titles 并入附刻之书后，index 条目的 additional_titles／attached_texts 与旧写法逐字相同。"""
from book_index_manager.entry_extractor import split_extra_titles


def test_old_shape():
    assert split_extra_titles(["甲", {"book_title": "乙"}], [{"book_title": "丙"}, {"book_title": "丁"}]) == (["甲", "乙"], ["丙", "丁"])


def test_new_shape_equals_old():
    new = ["甲", {"book_title": "丙", "type": "附刻"}, {"book_title": "丁", "type": "附刻"}]
    assert split_extra_titles(new) == (["甲"], ["丙", "丁"])


def test_empty_and_garbage():
    assert split_extra_titles(None, None) == ([], [])
    assert split_extra_titles([{"book_title": ""}, 3, {"type": "附刻"}], "x") == ([], [])
