"""
entry_extractor 单测

build_index_entry 是 metadata → index entry 的纯函数。从 storage.py
（858 行的上帝类）抽出来后，可独立验证字段映射。

下游一致性：与 ui/src/core/storage.ts 的 IndexFileEntry 类型对齐。
"""
import pytest

from book_index_manager.id_generator import BookIndexType
from book_index_manager.entry_extractor import (
    build_index_entry,
    build_entity_index_entry,
    _extract_titles_list,
    _extract_first_author,
    _extract_year,
    _extract_holder,
    _extract_juan_count,
    _extract_resource_flags,
)


# ── _extract_titles_list ──

def test_extract_titles_list_strings():
    assert _extract_titles_list(["a", "b"]) == ["a", "b"]


def test_extract_titles_list_objects():
    assert _extract_titles_list([{"book_title": "a"}, {"book_title": "b"}]) == ["a", "b"]


def test_extract_titles_list_mixed():
    assert _extract_titles_list(["a", {"book_title": "b"}, ""]) == ["a", "b"]


def test_extract_titles_list_invalid():
    assert _extract_titles_list(None) == []
    assert _extract_titles_list("not a list") == []
    assert _extract_titles_list([{"no_title": "x"}]) == []


# ── _extract_first_author ──

def test_extract_first_author_dict():
    r = _extract_first_author({"authors": [{"name": "施耐庵", "dynasty": "明", "role": "撰"}]})
    assert r == {"name": "施耐庵", "dynasty": "明", "role": "撰"}


def test_extract_first_author_string_list():
    r = _extract_first_author({"authors": ["施耐庵"]})
    assert r["name"] == "施耐庵"
    assert r["dynasty"] == ""
    assert r["role"] == ""


def test_extract_first_author_string():
    r = _extract_first_author({"authors": "施耐庵"})
    assert r["name"] == "施耐庵"


def test_extract_first_author_missing():
    assert _extract_first_author({})["name"] == ""
    assert _extract_first_author({"authors": []})["name"] == ""


# ── _extract_year / holder / juan_count ──

def test_extract_year_dict():
    assert _extract_year({"publication_info": {"year": "1850"}}) == "1850"


def test_extract_year_string():
    assert _extract_year({"publication_info": "明嘉靖"}) == "明嘉靖"


def test_extract_juan_count_dict():
    assert _extract_juan_count({"juan_count": {"number": 100, "description": "百回"}}) == 100


def test_extract_juan_count_int():
    assert _extract_juan_count({"juan_count": 100}) == 100


def test_extract_juan_count_zero():
    assert _extract_juan_count({"juan_count": {"number": 0}}) == 0
    assert _extract_juan_count({}) == 0


# ── _extract_resource_flags ──

def test_resource_flags_new_format():
    r = _extract_resource_flags({
        "resources": [
            {"types": ["text"]},
            {"types": ["image"]},
        ]
    })
    assert r == {"has_text": True, "has_image": True}


def test_resource_flags_old_format():
    r = _extract_resource_flags({
        "resources": [{"type": "text+image"}]
    })
    assert r == {"has_text": True, "has_image": True}


def test_resource_flags_only_text():
    r = _extract_resource_flags({"resources": [{"types": ["text"]}]})
    assert r == {"has_text": True, "has_image": False}


def test_resource_flags_empty():
    assert _extract_resource_flags({}) == {"has_text": False, "has_image": False}
    assert _extract_resource_flags({"resources": []}) == {"has_text": False, "has_image": False}


# ── build_index_entry：完整映射 ──

def test_build_minimal_work():
    entry = build_index_entry(
        {"id": "1ev123", "title": "史記"},
        BookIndexType.Work,
        "Work/1/e/v/1ev123-史記.json",
    )
    assert entry["id"] == "1ev123"
    assert entry["title"] == "史記"
    assert entry["type"] == "Work"
    assert entry["path"] == "Work/1/e/v/1ev123-史記.json"
    # 可选字段空时不出现
    assert "author" not in entry
    assert "juan_count" not in entry


def test_build_full_work():
    entry = build_index_entry(
        {
            "id": "w1",
            "title": "水滸傳",
            "authors": [{"name": "施耐庵", "dynasty": "明", "role": "撰"}],
            "juan_count": {"number": 100, "description": "一百回"},
            "measure_info": "二十卷一百回",
            "edition": "袁無涯本",
            "subtype": "novel",
            "additional_titles": ["忠義水滸傳", {"book_title": "水滸全傳"}],
            "attached_texts": [{"book_title": "李卓吾批點"}],
            "resources": [{"types": ["text", "image"]}],
        },
        BookIndexType.Work,
        "Work/w/1.json",
    )
    assert entry["author"] == "施耐庵"
    assert entry["dynasty"] == "明"
    assert entry["role"] == "撰"
    assert entry["juan_count"] == 100
    assert entry["measure_info"] == "二十卷一百回"
    assert entry["edition"] == "袁無涯本"
    assert entry["subtype"] == "novel"
    assert entry["additional_titles"] == ["忠義水滸傳", "水滸全傳"]
    assert entry["attached_texts"] == ["李卓吾批點"]
    assert entry["has_text"] is True
    assert entry["has_image"] is True


def test_build_entity_routes_to_entity_extractor():
    entry = build_index_entry(
        {"id": "e1", "primary_name": "孔子", "subtype": "people", "dynasty": "周"},
        BookIndexType.Entity,
        "Entity/e/1.json",
    )
    assert entry["type"] == "entity"
    assert entry["primary_name"] == "孔子"
    assert entry["subtype"] == "people"
    assert entry["dynasty"] == "周"


def test_build_entity_omits_optional():
    entry = build_entity_index_entry({"primary_name": "孔子"}, "e1", "Entity/e/1.json")
    assert "dynasty" not in entry
    assert "birth_year" not in entry
    assert "death_year" not in entry
    assert "cbdb_id" not in entry


def test_build_entity_with_external_ids():
    entry = build_entity_index_entry(
        {"primary_name": "孔子", "external_ids": {"cbdb_id": 12345}},
        "e1", "Entity/e/1.json",
    )
    assert entry["cbdb_id"] == 12345


# ── 回归保护：可选字段空值不出现，避免 index shard 充斥空字段 ──

def test_optional_fields_omitted_when_empty():
    entry = build_index_entry(
        {"id": "b1", "title": "X", "authors": [], "edition": "", "subtype": ""},
        BookIndexType.Book,
        "Book/x.json",
    )
    assert "author" not in entry
    assert "edition" not in entry
    assert "subtype" not in entry
