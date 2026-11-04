"""第 12 组 S2-T：additional_titles 里 type:"附刻" 的项拆成 index 条目的 attached_texts。"""
from book_index_manager.entry_extractor import split_extra_titles


def test_split_by_type():
    new = ["甲", {"book_title": "乙"}, {"book_title": "丙", "type": "附刻"}, {"book_title": "丁", "type": "附刻"}]
    assert split_extra_titles(new) == (["甲", "乙"], ["丙", "丁"])


def test_empty_and_garbage():
    assert split_extra_titles(None) == ([], [])
    assert split_extra_titles([{"book_title": ""}, 3, {"type": "附刻"}]) == ([], [])
