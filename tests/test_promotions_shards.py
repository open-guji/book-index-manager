"""promotions 分片形（`promotions/<草稿id末2位>.json`）：读、写、迁移、与整档兼容。"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from book_index_manager import BookIndexManager, BookIndexStatus, BookIndexType
from book_index_manager.exceptions import BookIndexError
from book_index_manager.promotion import (
    PROMOTIONS_DIRNAME,
    PROMOTIONS_FILENAME,
    PromotionRecord,
    PromotionsStore,
    load_all,
    promotion_shard_key,
    split_promotions,
)


def _rec(pid: str) -> PromotionRecord:
    return PromotionRecord(production_id=pid, type="work", promoted_at="2026-10-08T00:00:00Z")


def _seed_legacy(root: Path, ids) -> None:
    root.mkdir(parents=True, exist_ok=True)
    payload = {"version": 1, "promotions": {d: _rec("p" + d).to_dict() for d in sorted(ids)}}
    (root / PROMOTIONS_FILENAME).write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
                                            encoding="utf-8")


IDS = ["1aaaaaaaaaaxy", "1bbbbbbbbbbxy", "1ccccccccccz9", "1dddddddddd00"]


def test_split_then_load_all_identical(tmp_path: Path):
    _seed_legacy(tmp_path, IDS)
    before = load_all(tmp_path)
    out = split_promotions(tmp_path)
    assert out == {"records": 4, "shards": 3}
    assert not (tmp_path / PROMOTIONS_FILENAME).exists()
    assert load_all(tmp_path) == before
    shard = json.loads((tmp_path / PROMOTIONS_DIRNAME / "xy.json").read_text(encoding="utf-8"))
    assert shard["version"] == 1
    assert list(shard["promotions"]) == ["1aaaaaaaaaaxy", "1bbbbbbbbbbxy"]
    assert (tmp_path / PROMOTIONS_DIRNAME / "xy.json").read_text(encoding="utf-8").endswith("}\n")


def test_shard_key_is_last_two_chars():
    assert promotion_shard_key("1jb8icg27zjsx") == "sx"


def test_store_writes_only_touched_shard(tmp_path: Path):
    _seed_legacy(tmp_path, IDS)
    split_promotions(tmp_path)
    z9 = tmp_path / PROMOTIONS_DIRNAME / "z9.json"
    z9_before = z9.read_bytes()
    store = PromotionsStore(tmp_path)
    store.add("1eeeeeeeeeexy", _rec("pe"))
    store.save()
    assert z9.read_bytes() == z9_before
    xy = json.loads((tmp_path / PROMOTIONS_DIRNAME / "xy.json").read_text(encoding="utf-8"))
    assert "1eeeeeeeeeexy" in xy["promotions"]
    assert not (tmp_path / PROMOTIONS_FILENAME).exists()


def test_store_merges_with_disk_per_shard(tmp_path: Path):
    """两个进程各自 load 后先后 save，彼此写入的目都保住。"""
    _seed_legacy(tmp_path, IDS)
    split_promotions(tmp_path)
    a, b = PromotionsStore(tmp_path), PromotionsStore(tmp_path)
    a.load(), b.load()
    a.add("1eeeeeeeeeexy", _rec("pe"))
    b.add("1ffffffffffxy", _rec("pf"))
    a.save()
    b.save()
    got = load_all(tmp_path)
    assert {"1eeeeeeeeeexy", "1ffffffffffxy"} <= set(got)
    assert len(got) == 6


def test_store_remove_deletes_empty_shard(tmp_path: Path):
    _seed_legacy(tmp_path, IDS)
    split_promotions(tmp_path)
    store = PromotionsStore(tmp_path)
    store.remove("1dddddddddd00")
    store.save()
    assert not (tmp_path / PROMOTIONS_DIRNAME / "00.json").exists()
    assert "1dddddddddd00" not in load_all(tmp_path)


def test_store_refuses_write_when_both_forms_present(tmp_path: Path):
    _seed_legacy(tmp_path, IDS)
    (tmp_path / PROMOTIONS_DIRNAME).mkdir()
    store = PromotionsStore(tmp_path)
    store.add("1eeeeeeeeeexy", _rec("pe"))
    with pytest.raises(BookIndexError):
        store.save()


def test_legacy_form_unchanged_without_dir(tmp_path: Path):
    _seed_legacy(tmp_path, IDS)
    store = PromotionsStore(tmp_path)
    store.add("1eeeeeeeeeexy", _rec("pe"))
    store.save()
    assert not (tmp_path / PROMOTIONS_DIRNAME).exists()
    data = json.loads((tmp_path / PROMOTIONS_FILENAME).read_text(encoding="utf-8"))
    assert len(data["promotions"]) == 5


def test_promote_end_to_end_on_sharded_repo(tmp_path: Path):
    """分片形的正式仓上 promote、resolve_id、validate 照常。"""
    manager = BookIndexManager(storage_root=str(tmp_path), machine_id=1)
    meta = {"type": "work", "title": "甲", "authors": [{"name": "某", "role": "撰"}]}
    manager.save_item(meta, BookIndexType.Work, BookIndexStatus.Draft)
    first = manager.promote_to_official(meta["id"])
    split_promotions(tmp_path / "book-index")

    meta2 = {"type": "work", "title": "乙", "authors": [{"name": "某", "role": "撰"}]}
    manager.save_item(meta2, BookIndexType.Work, BookIndexStatus.Draft)
    second = manager.promote_to_official(meta2["id"])

    root = tmp_path / "book-index"
    assert not (root / PROMOTIONS_FILENAME).exists()
    got = load_all(root)
    assert got[meta["id"]].production_id == first
    assert got[meta2["id"]].production_id == second
    assert manager.resolve_id(meta2["id"])[0] == second
    assert manager.resolve_id(meta["id"])[0] == first
    assert [i for i in manager.validate_promotions() if i.severity == "error"] == []
