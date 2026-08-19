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


# ── 回归保护：index 里实际存在的字段必须由 build_index_entry 产出 ──
#
# 这些字段一度只有外部脚本往 index shard 里写，build_index_entry 不产出，
# 于是任何一次 save_item / reindex 都会把它们从索引里悄悄抹掉。
# book-index-draft 实测：works 有 period 40738 条、loss_status 4249 条、
# original_title 153 条、promoted_to 14 条；books 有 work_id 312 条、
# promoted_to 50 条；entities 有 period 12911 条。
# 一次 `book-index reindex` 会把它们全部清零。

def test_work_entry_keeps_period_and_loss_status():
    entry = build_index_entry(
        {"id": "w1", "title": "孫子", "period": "pre-qin", "loss_status": "partially_extant"},
        BookIndexType.Work,
        "Work/w/1.json",
    )
    assert entry["period"] == "pre-qin"
    assert entry["loss_status"] == "partially_extant"


def test_work_entry_keeps_original_title():
    entry = build_index_entry(
        {"id": "w1", "title": "年譜", "original_title": "摭遺"},
        BookIndexType.Work,
        "Work/w/1.json",
    )
    assert entry["original_title"] == "摭遺"


def test_book_entry_keeps_work_id():
    entry = build_index_entry(
        {"id": "b1", "title": "孫子", "work_id": "1ev3bbesj0oow"},
        BookIndexType.Book,
        "Book/b/1.json",
    )
    assert entry["work_id"] == "1ev3bbesj0oow"


def test_tombstone_entry_keeps_promoted_to():
    """promoted_to 是网站做 draft→production 重定向的依据，抹掉会让重定向失效。"""
    entry = build_index_entry(
        {"id": "w1", "title": "X", "promoted_to": "d59dh3z6zmyo"},
        BookIndexType.Work,
        "Work/w/1.json",
    )
    assert entry["promoted_to"] == "d59dh3z6zmyo"


def test_entity_entry_keeps_period():
    entry = build_entity_index_entry(
        {"primary_name": "孫武", "dynasty": "先秦", "period": "pre-qin"},
        "e1", "Entity/e/1.json",
    )
    assert entry["period"] == "pre-qin"


def test_new_fields_omitted_when_absent():
    entry = build_index_entry({"id": "w1", "title": "X"}, BookIndexType.Work, "Work/w/1.json")
    for k in ("period", "loss_status", "original_title", "work_id", "promoted_to"):
        assert k not in entry
    assert "period" not in build_entity_index_entry({"primary_name": "某"}, "e1", "Entity/e/1.json")
