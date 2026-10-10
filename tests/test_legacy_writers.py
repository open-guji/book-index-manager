"""清退旧写法：写入点不再产出旧字段／旧格式（legacy.md §五）。"""
from __future__ import annotations

import json

import pytest

from book_index_manager import BookIndexManager, BookIndexStatus, BookIndexType


@pytest.fixture
def manager(tmp_path) -> BookIndexManager:
    return BookIndexManager(storage_root=str(tmp_path), machine_id=1)


def _saved(manager: BookIndexManager, metadata: dict, type_val=BookIndexType.Book) -> dict:
    path = manager.save_item(metadata, type_val, BookIndexStatus.Draft)
    return json.loads(path.read_text(encoding="utf-8"))


def test_save_item_does_not_migrate_chinese_keys_to_legacy_forms(manager):
    """中文键迁移已删：不再写出 role:"author"、字符串形 contained_in、占位 0／空串。"""
    out = _saved(manager, {
        "type": "book", "title": "测试", "作者": "某某", "收录于": "某丛书",
        "页数": "12", "册数": "3", "现藏于": "某馆", "出版年份": "1900",
    })
    assert "authors" not in out
    assert "contained_in" not in out
    assert "page_count" not in out and "juan_count" not in out
    assert "current_location" not in out and "publication_info" not in out


def test_save_item_still_migrates_volume_count(manager):
    out = _saved(manager, {"type": "book", "title": "测试", "volume_count": 4})
    assert out["juan_count"] == 4
    assert "volume_count" not in out
