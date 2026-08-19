"""index shard 写入沿用既有缩进。

仓库里各 shard 缩进并不统一：book-index-draft 的 index/works、index/entities 是 1，
index/books、index/collections 与 production 全仓是 2，历史上由不同脚本写成。
若一律按 indent=2 重写，改一条就把整个 shard 重排——七万余条的 works shard
会产生四十余万行 diff，把真正的改动淹掉。
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from book_index_manager import BookIndexManager, BookIndexStatus, BookIndexType
from book_index_manager.storage import BookIndexStorage, shard_of


@pytest.fixture
def manager(tmp_path: Path) -> BookIndexManager:
    return BookIndexManager(storage_root=str(tmp_path), machine_id=1)


def _work_shard_path(manager: BookIndexManager, wid: str) -> Path:
    st = manager.storage
    return st._shard_path(st.draft_root, "works", shard_of(wid))


def _indent_of(path: Path) -> int:
    second = path.read_text(encoding="utf-8").split("\n")[1]
    return len(second) - len(second.lstrip(" "))


def test_new_shard_defaults_to_indent_2(manager: BookIndexManager):
    meta = {"type": "work", "title": "甲"}
    manager.save_item(meta, BookIndexType.Work, BookIndexStatus.Draft)
    assert _indent_of(_work_shard_path(manager, meta["id"])) == 2


def test_existing_indent_1_shard_stays_indent_1(manager: BookIndexManager):
    """draft 的 index/works 就是 indent=1，再存一条不该把整个 shard 重排。"""
    first = {"type": "work", "title": "甲"}
    manager.save_item(first, BookIndexType.Work, BookIndexStatus.Draft)
    shard = _work_shard_path(manager, first["id"])

    # 改写成 indent=1，模拟仓库现状
    data = json.loads(shard.read_text(encoding="utf-8"))
    shard.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    assert _indent_of(shard) == 1

    second = {"type": "work", "title": "乙", "id": None}
    second.pop("id")
    manager.save_item(second, BookIndexType.Work, BookIndexStatus.Draft)

    # 落在同一个 shard 才验证得到；不同 shard 就只验证原 shard 没被动
    if _work_shard_path(manager, second["id"]) == shard:
        assert second["id"] in json.loads(shard.read_text(encoding="utf-8"))
    assert _indent_of(shard) == 1


def test_reindex_preserves_indent_1(manager: BookIndexManager):
    meta = {"type": "work", "title": "甲"}
    manager.save_item(meta, BookIndexType.Work, BookIndexStatus.Draft)
    shard = _work_shard_path(manager, meta["id"])
    data = json.loads(shard.read_text(encoding="utf-8"))
    shard.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

    manager.storage.rebuild_index(BookIndexStatus.Draft)
    assert _indent_of(shard) == 1
    assert meta["id"] in json.loads(shard.read_text(encoding="utf-8"))


def test_detect_indent_edge_cases(tmp_path: Path):
    empty = tmp_path / "empty.json"
    empty.write_text("{}", encoding="utf-8")
    assert BookIndexStorage._detect_shard_indent(empty) == 2

    missing = tmp_path / "nope.json"
    assert BookIndexStorage._detect_shard_indent(missing) == 2

    closing = tmp_path / "closing.json"
    closing.write_text("{\n}", encoding="utf-8")
    assert BookIndexStorage._detect_shard_indent(closing) == 2

    four = tmp_path / "four.json"
    four.write_text(json.dumps({"a": {"b": 1}}, indent=4), encoding="utf-8")
    assert BookIndexStorage._detect_shard_indent(four) == 4


def test_reindex_preserves_period_and_promoted_to(manager: BookIndexManager):
    """reindex 不该把 period / loss_status / promoted_to 从索引里抹掉。"""
    meta = {"type": "work", "title": "孫子", "period": "pre-qin",
            "loss_status": "partially_extant", "original_title": "吳孫子兵法"}
    manager.save_item(meta, BookIndexType.Work, BookIndexStatus.Draft)
    wid = meta["id"]

    manager.storage.rebuild_index(BookIndexStatus.Draft)
    entry = json.loads(_work_shard_path(manager, wid).read_text(encoding="utf-8"))[wid]
    assert entry["period"] == "pre-qin"
    assert entry["loss_status"] == "partially_extant"
    assert entry["original_title"] == "吳孫子兵法"


def test_promote_then_reindex_keeps_promoted_to(manager: BookIndexManager):
    """promote 写进 draft shard 的 promoted_to，reindex 后必须还在——
    网站的 draft→production 重定向靠它。"""
    meta = {"type": "work", "title": "測試"}
    manager.save_item(meta, BookIndexType.Work, BookIndexStatus.Draft)
    wid = meta["id"]
    prod_id = manager.promote_to_official(wid)

    manager.storage.rebuild_index(BookIndexStatus.Draft)
    entry = json.loads(_work_shard_path(manager, wid).read_text(encoding="utf-8"))[wid]
    assert entry["promoted_to"] == prod_id
