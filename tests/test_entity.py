"""Entity type 端到端测试：ID / storage / index / manager。"""
import json
from pathlib import Path

import pytest

from book_index_manager import BookIndexManager, BookIndexType, BookIndexStatus
from book_index_manager.storage import TYPE_KEY_MAP, type_key_of


# ---------- TYPE_KEY_MAP ----------

def test_type_key_map_covers_all_active_types():
    """4 个活跃 type 都在映射表里（Reserved 槽位不在）。"""
    assert TYPE_KEY_MAP[BookIndexType.Book] == "books"
    assert TYPE_KEY_MAP[BookIndexType.Collection] == "collections"
    assert TYPE_KEY_MAP[BookIndexType.Work] == "works"
    assert TYPE_KEY_MAP[BookIndexType.Entity] == "entities"


def test_type_key_of_entity_is_entities():
    """Entity 的 index key 是 entities，不是拼接出来的 entitys。"""
    assert type_key_of(BookIndexType.Entity) == "entities"


# ---------- Entity 文件落盘 + 索引 ----------

@pytest.fixture
def manager(tmp_path: Path) -> BookIndexManager:
    return BookIndexManager(storage_root=str(tmp_path), machine_id=1)


def _entity_metadata() -> dict:
    return {
        "type": "entity",
        "subtype": "people",
        "primary_name": "蘇軾",
        "alt_names": [
            {"name": "子瞻", "type": "字"},
            {"name": "東坡居士", "type": "號"},
        ],
        "dynasty": "宋",
        "birth_year": 1037,
        "death_year": 1101,
        "works": [],
        "external_ids": {"cbdb_id": 3767},
    }


def test_save_entity_creates_file_under_entity_dir(manager: BookIndexManager, tmp_path: Path):
    meta = _entity_metadata()
    saved_path = manager.save_item(meta, status=BookIndexStatus.Draft)

    # 文件在 Draft/Entity/ 下（Entity 是 enum.name，首字母大写）
    assert "Entity" in saved_path.parts
    assert saved_path.exists()

    # ID 解析回来必须是 Entity 类型
    content = json.loads(saved_path.read_text(encoding="utf-8"))
    assert content["primary_name"] == "蘇軾"
    from book_index_manager.id_generator import BookIndexIdGenerator, smart_decode
    comp = BookIndexIdGenerator.parse(smart_decode(content["id"]))
    assert comp.type == BookIndexType.Entity


def test_save_entity_writes_to_entities_shard(manager: BookIndexManager, tmp_path: Path):
    """存 Entity 后，index/entities/*.json 分片里应当有这条记录。"""
    meta = _entity_metadata()
    manager.save_item(meta, status=BookIndexStatus.Draft)

    entities_dir = tmp_path / "book-index-draft" / "index" / "entities"
    assert entities_dir.exists(), "index/entities 目录应被创建"

    # 至少有一个分片包含这个 entity
    all_entries: dict = {}
    for shard_file in entities_dir.glob("*.json"):
        all_entries.update(json.loads(shard_file.read_text(encoding="utf-8")))

    assert len(all_entries) == 1
    entry = next(iter(all_entries.values()))
    assert entry["type"] == "entity"
    assert entry["subtype"] == "people"
    assert entry["primary_name"] == "蘇軾"
    assert entry["dynasty"] == "宋"
    assert entry["birth_year"] == 1037
    assert entry["death_year"] == 1101
    assert entry["cbdb_id"] == 3767
    # 不应混入 Work/Book 的字段
    assert "title" not in entry
    assert "author" not in entry


def test_entity_index_entry_omits_missing_optional_fields(manager: BookIndexManager, tmp_path: Path):
    """没有 birth_year/dynasty/cbdb_id 的 Entity，index 条目里不应出现这些键。"""
    meta = {
        "type": "entity",
        "subtype": "people",
        "primary_name": "無名氏",
    }
    manager.save_item(meta, status=BookIndexStatus.Draft)

    entities_dir = tmp_path / "book-index-draft" / "index" / "entities"
    all_entries: dict = {}
    for shard_file in entities_dir.glob("*.json"):
        all_entries.update(json.loads(shard_file.read_text(encoding="utf-8")))

    entry = next(iter(all_entries.values()))
    assert entry["primary_name"] == "無名氏"
    assert "birth_year" not in entry
    assert "death_year" not in entry
    assert "dynasty" not in entry
    assert "cbdb_id" not in entry


def test_get_entity_roundtrip(manager: BookIndexManager):
    """save 后用 get_item 按 ID 可以取回 metadata。"""
    meta = _entity_metadata()
    saved_path = manager.save_item(meta, status=BookIndexStatus.Draft)
    id_str = json.loads(saved_path.read_text(encoding="utf-8"))["id"]

    got = manager.get_item(id_str)
    assert got is not None
    assert got["primary_name"] == "蘇軾"
    assert got["external_ids"]["cbdb_id"] == 3767


def test_rebuild_index_includes_entities(manager: BookIndexManager, tmp_path: Path):
    """deep reindex 必须扫描 Entity 目录并写入 entities 分片。"""
    # 先存 1 个 Entity 和 1 个 Work，确保混合场景工作
    ent = _entity_metadata()
    manager.save_item(ent, status=BookIndexStatus.Draft)

    work_meta = {
        "type": "work",
        "title": "東坡七集",
        "authors": [{"name": "蘇軾", "dynasty": "宋", "role": "撰"}],
    }
    manager.save_item(work_meta, status=BookIndexStatus.Draft)

    # 清掉所有 index 分片，强制 rebuild
    index_dir = tmp_path / "book-index-draft" / "index"
    for p in index_dir.rglob("*.json"):
        p.unlink()

    manager.storage.rebuild_index(status=BookIndexStatus.Draft, workers=2)

    # entities 和 works 分片都应重新生成
    assert any((index_dir / "entities").glob("*.json")), "entities 分片应重建"
    assert any((index_dir / "works").glob("*.json")), "works 分片应重建"

    all_entities: dict = {}
    for shard_file in (index_dir / "entities").glob("*.json"):
        all_entities.update(json.loads(shard_file.read_text(encoding="utf-8")))
    assert len(all_entities) == 1
    assert next(iter(all_entities.values()))["primary_name"] == "蘇軾"


def test_load_entries_entity(manager: BookIndexManager):
    """load_entries("entity") 应返回所有已索引的 Entity。"""
    for name in ("蘇軾", "王安石"):
        manager.save_item(
            {"type": "entity", "subtype": "people", "primary_name": name, "dynasty": "宋"},
            status=BookIndexStatus.Draft,
        )

    entries = manager.storage.load_entries("entity", status=BookIndexStatus.Draft)
    names = {e["primary_name"] for e in entries}
    assert names == {"蘇軾", "王安石"}
