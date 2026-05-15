"""Draft → Production promotion 端到端测试。

覆盖：
1. 基本 promote 流程：新 ID 生成、production 文件落盘、tombstone 写入。
2. promotions.json 维护。
3. 引用重写：其他 draft 文件里 work_id/related_books 等指向被升 ID 的引用自动改为 production-id。
4. Asset dir 物理拷贝。
5. Tombstone 写保护：save_item 拒绝写已 promoted 的文件。
6. resolve_id 重定向。
7. 重复 promote 报错。
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from book_index_manager import (
    BookIndexManager,
    BookIndexStatus,
    BookIndexType,
)
from book_index_manager.exceptions import BookIndexError, StorageError
from book_index_manager.promotion import (
    PROMOTIONS_FILENAME,
    PromotionsStore,
)


@pytest.fixture
def manager(tmp_path: Path) -> BookIndexManager:
    """每个测试一个隔离的 workspace（含 book-index/ 和 book-index-draft/）。"""
    return BookIndexManager(storage_root=str(tmp_path), machine_id=1)


def _save_draft_work(manager: BookIndexManager, title: str, extra: dict | None = None) -> str:
    """快速建一个 draft Work，返回它的 id。"""
    metadata = {"type": "work", "title": title, "authors": [{"name": "测试作者", "role": "撰"}]}
    if extra:
        metadata.update(extra)
    manager.save_item(metadata, BookIndexType.Work, BookIndexStatus.Draft)
    return metadata["id"]


def _save_draft_book(manager: BookIndexManager, title: str, work_id: str, extra: dict | None = None) -> str:
    metadata = {"type": "book", "title": title, "work_id": work_id}
    if extra:
        metadata.update(extra)
    manager.save_item(metadata, BookIndexType.Book, BookIndexStatus.Draft)
    return metadata["id"]


# ── 1. 基本流程 ──

def test_promote_creates_official_file_with_new_id(manager: BookIndexManager, tmp_path: Path):
    draft_id = _save_draft_work(manager, "测试作品")

    prod_id = manager.promote_to_official(draft_id)

    # 新 ID 不同
    assert prod_id != draft_id

    # production 文件存在于 book-index/
    prod_path = manager.find_item_path(prod_id)
    assert prod_path is not None
    assert "book-index" in str(prod_path)
    assert "book-index-draft" not in str(prod_path)

    # production 内容里 id 是新 ID，没有 promoted_to
    with open(prod_path, encoding="utf-8") as f:
        prod_data = json.load(f)
    assert prod_data["id"] == prod_id
    assert prod_data["title"] == "测试作品"
    assert "promoted_to" not in prod_data


def test_promote_writes_tombstone_on_draft(manager: BookIndexManager):
    draft_id = _save_draft_work(manager, "测试作品")
    prod_id = manager.promote_to_official(draft_id)

    draft_path = manager.storage.find_file_by_id(draft_id)
    assert draft_path is not None
    with open(draft_path, encoding="utf-8") as f:
        draft_data = json.load(f)

    assert draft_data["id"] == draft_id  # 自身 ID 不变
    assert draft_data["promoted_to"] == prod_id
    assert draft_data["promoted_at"]  # 有时间戳
    assert draft_data["title"] == "测试作品"  # 其他字段保留


def test_promote_new_id_has_official_status_bit(manager: BookIndexManager):
    draft_id = _save_draft_work(manager, "测试")
    prod_id = manager.promote_to_official(draft_id)

    from book_index_manager.id_generator import BookIndexIdGenerator, smart_decode

    components = BookIndexIdGenerator.parse(smart_decode(prod_id))
    assert components.status == BookIndexStatus.Official
    assert components.type == BookIndexType.Work


# ── 2. promotions.json ──

def test_promote_writes_promotions_json(manager: BookIndexManager, tmp_path: Path):
    draft_id = _save_draft_work(manager, "测试")
    prod_id = manager.promote_to_official(draft_id)

    pjson = tmp_path / "book-index-draft" / PROMOTIONS_FILENAME
    assert pjson.exists()
    with open(pjson, encoding="utf-8") as f:
        data = json.load(f)

    assert data["version"] == 1
    assert draft_id in data["promotions"]
    rec = data["promotions"][draft_id]
    assert rec["production_id"] == prod_id
    assert rec["type"] == "work"
    assert rec["promoted_at"]


def test_promotions_json_sorted_by_key(manager: BookIndexManager, tmp_path: Path):
    ids = [_save_draft_work(manager, f"作品{i}") for i in range(3)]
    for d in ids:
        manager.promote_to_official(d)

    pjson = tmp_path / "book-index-draft" / PROMOTIONS_FILENAME
    with open(pjson, encoding="utf-8") as f:
        data = json.load(f)

    keys = list(data["promotions"].keys())
    assert keys == sorted(keys)


# ── 3. 引用重写 ──

def test_promote_rewrites_book_work_id_reference(manager: BookIndexManager):
    work_draft = _save_draft_work(manager, "红楼梦")
    book_draft = _save_draft_book(manager, "甲戌本", work_draft)

    work_prod = manager.promote_to_official(work_draft)

    # Book 还在 draft 仓，但 work_id 应改为新的 work_prod
    book_path = manager.storage.find_file_by_id(book_draft)
    assert "book-index-draft" in str(book_path)
    with open(book_path, encoding="utf-8") as f:
        book_data = json.load(f)
    assert book_data["work_id"] == work_prod


def test_promote_rewrites_related_books_array(manager: BookIndexManager):
    work_draft = _save_draft_work(manager, "作品A")

    # 建一个 Book，它的 related_books 引用 work_draft（虽然 work_id 应该是 work_draft 才对，
    # 但 related_books 也可能含其它 ID——测试通用字符串替换）
    sibling = _save_draft_book(
        manager, "兄弟书", work_id=work_draft,
        extra={"related_books": [work_draft, "other_id_unrelated_xx"]},
    )

    work_prod = manager.promote_to_official(work_draft)

    sib_path = manager.storage.find_file_by_id(sibling)
    with open(sib_path, encoding="utf-8") as f:
        sib_data = json.load(f)
    assert work_prod in sib_data["related_books"]
    assert work_draft not in sib_data["related_books"]


def test_promote_does_not_rewrite_skipped_files(manager: BookIndexManager):
    """tombstone 文件自己的 id 字段不应被替换。"""
    draft_id = _save_draft_work(manager, "测试")
    prod_id = manager.promote_to_official(draft_id)

    draft_path = manager.storage.find_file_by_id(draft_id)
    with open(draft_path, encoding="utf-8") as f:
        draft_data = json.load(f)
    # 自己的 id 保持 draft_id；只有 promoted_to 指向 prod_id
    assert draft_data["id"] == draft_id
    assert draft_data["promoted_to"] == prod_id


def test_promote_with_rewrite_refs_false_skips_rewrite(manager: BookIndexManager):
    work_draft = _save_draft_work(manager, "作品A")
    book_draft = _save_draft_book(manager, "某版本", work_draft)

    manager.promote_to_official(work_draft, rewrite_refs=False)

    book_path = manager.storage.find_file_by_id(book_draft)
    with open(book_path, encoding="utf-8") as f:
        book_data = json.load(f)
    # 关闭引用重写时，book 的 work_id 仍指向老 ID
    assert book_data["work_id"] == work_draft


# ── 4. Asset dir ──

def test_promote_copies_asset_dir(manager: BookIndexManager, tmp_path: Path):
    draft_id = _save_draft_work(manager, "测试")

    # 手工建一个 asset dir 模拟 collated_edition
    asset = manager.init_asset_dir(draft_id)
    (asset / "note.md").write_text("# 测试", encoding="utf-8")

    prod_id = manager.promote_to_official(draft_id)

    # production asset dir 存在且内容拷过去
    prod_path = manager.find_item_path(prod_id)
    prod_asset = prod_path.parent / prod_id
    assert prod_asset.is_dir()
    assert (prod_asset / "note.md").read_text(encoding="utf-8") == "# 测试"

    # draft asset dir 仍存在（物理拷贝，不是 move）
    assert asset.is_dir()
    assert (asset / "note.md").exists()


# ── 5. Tombstone 写保护 ──

def test_save_item_refuses_to_overwrite_tombstone(manager: BookIndexManager):
    draft_id = _save_draft_work(manager, "测试")
    manager.promote_to_official(draft_id)

    # 再次 save 同 ID 应当被拒
    metadata = {"id": draft_id, "type": "work", "title": "尝试覆盖", "authors": []}
    with pytest.raises(StorageError, match="promoted to"):
        manager.save_item(metadata, BookIndexType.Work, BookIndexStatus.Draft)


def test_save_item_allows_tombstone_edit_with_opt_in(manager: BookIndexManager):
    draft_id = _save_draft_work(manager, "测试")
    manager.promote_to_official(draft_id)

    metadata = {"id": draft_id, "type": "work", "title": "强行改", "authors": []}
    # 直接调底层 storage.save_item 走 opt-in 路径
    from book_index_manager.id_generator import smart_decode
    id_val = smart_decode(draft_id)
    manager.storage.save_item(BookIndexType.Work, id_val, metadata, allow_tombstone_edit=True)

    draft_path = manager.storage.find_file_by_id(draft_id)
    with open(draft_path, encoding="utf-8") as f:
        data = json.load(f)
    assert data["title"] == "强行改"


# ── 6. resolve_id ──

def test_resolve_id_returns_production_for_promoted(manager: BookIndexManager):
    draft_id = _save_draft_work(manager, "测试")
    prod_id = manager.promote_to_official(draft_id)

    canonical, redirected_from = manager.resolve_id(draft_id)
    assert canonical == prod_id
    assert redirected_from == draft_id


def test_resolve_id_returns_self_for_unpromoted(manager: BookIndexManager):
    draft_id = _save_draft_work(manager, "测试")

    canonical, redirected_from = manager.resolve_id(draft_id)
    assert canonical == draft_id
    assert redirected_from is None


# ── 7. 错误路径 ──

def test_promote_invalid_id_shape(manager: BookIndexManager):
    with pytest.raises(BookIndexError, match="Invalid base36 ID shape"):
        manager.promote_to_official("not-a-real-id")


def test_promote_already_promoted_raises(manager: BookIndexManager):
    draft_id = _save_draft_work(manager, "测试")
    manager.promote_to_official(draft_id)

    with pytest.raises(BookIndexError, match="already promoted"):
        manager.promote_to_official(draft_id)


def test_promote_official_id_raises(manager: BookIndexManager):
    """不能"重升级"已经是 official 的 ID。"""
    # 直接生成一个 official Work
    metadata = {"type": "work", "title": "已正式", "authors": []}
    manager.save_item(metadata, BookIndexType.Work, BookIndexStatus.Official)
    official_id = metadata["id"]

    with pytest.raises(BookIndexError, match="not a draft"):
        manager.promote_to_official(official_id)


def test_promote_missing_draft_raises(manager: BookIndexManager):
    # 用 id_gen 生一个合法形状但磁盘不存在的 ID
    id_val = manager.id_gen.next_id(BookIndexStatus.Draft, BookIndexType.Work)
    fake_id = manager.encode_id(id_val)
    with pytest.raises(BookIndexError, match="Draft file not found"):
        manager.promote_to_official(fake_id)


# ── 8. Index shard 标记 ──

def test_promote_marks_draft_shard_entry(manager: BookIndexManager):
    draft_id = _save_draft_work(manager, "测试")
    prod_id = manager.promote_to_official(draft_id)

    # draft shard 里这条 entry 应该有 promoted_to
    from book_index_manager.storage import type_key_of
    shard = manager.storage._load_shard(
        manager.storage.draft_root, type_key_of(BookIndexType.Work), draft_id
    )
    assert shard[draft_id].get("promoted_to") == prod_id


def test_promote_writes_production_shard_entry(manager: BookIndexManager):
    draft_id = _save_draft_work(manager, "测试")
    prod_id = manager.promote_to_official(draft_id)

    from book_index_manager.storage import type_key_of
    shard = manager.storage._load_shard(
        manager.storage.official_root, type_key_of(BookIndexType.Work), prod_id
    )
    assert prod_id in shard
    assert shard[prod_id].get("title") == "测试"


# ── 9. PromotionsStore 单元测试 ──

def test_promotions_store_empty_when_file_missing(tmp_path: Path):
    (tmp_path / "book-index-draft").mkdir()
    store = PromotionsStore(tmp_path / "book-index-draft")
    assert store.load() == {}


def test_promotions_store_round_trip(tmp_path: Path):
    from book_index_manager.promotion import PromotionRecord
    root = tmp_path / "book-index-draft"
    root.mkdir()
    store = PromotionsStore(root)
    store.add("abc", PromotionRecord("xyz", "work", "2026-05-13T00:00:00Z"))
    store.save()

    store2 = PromotionsStore(root)
    rec = store2.get("abc")
    assert rec is not None
    assert rec.production_id == "xyz"
    assert rec.type == "work"


# ── 10. validate_promotions ──

def test_validate_clean_after_promote(manager: BookIndexManager):
    """正常 promote 后 validate 应零问题。"""
    draft_id = _save_draft_work(manager, "正常")
    manager.promote_to_official(draft_id)

    issues = manager.validate_promotions()
    assert issues == []


def test_validate_detects_missing_production_file(manager: BookIndexManager, tmp_path: Path):
    """E01：promotions.json 有记录但 production 文件被手工删了。"""
    draft_id = _save_draft_work(manager, "测试")
    prod_id = manager.promote_to_official(draft_id)

    prod_path = manager.find_item_path(prod_id)
    prod_path.unlink()
    # 同时也要从 official shard 删，以免 find_file_by_id 通过 shard 还能找到
    # 但 find_file_by_id 是按目录扫，不读 shard，所以删文件就够了

    issues = manager.validate_promotions()
    codes = [i.code for i in issues]
    assert "E01" in codes


def test_validate_detects_tombstone_promotions_mismatch(manager: BookIndexManager):
    """E02：tombstone 的 promoted_to 与 promotions.json 不一致。"""
    draft_id = _save_draft_work(manager, "测试")
    prod_id = manager.promote_to_official(draft_id)

    # 手工把 tombstone 的 promoted_to 改成别的
    draft_path = manager.storage.find_file_by_id(draft_id)
    data = json.loads(draft_path.read_text(encoding="utf-8"))
    data["promoted_to"] = "fakeotheridxx"
    draft_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

    issues = manager.validate_promotions()
    codes = [i.code for i in issues]
    assert "E02" in codes


def test_validate_detects_orphan_tombstone(manager: BookIndexManager):
    """E03：tombstone 上写了 promoted_to 但 promotions.json 没记录。"""
    draft_id = _save_draft_work(manager, "测试")

    # 不调 promote，直接手工给 D 加 promoted_to
    draft_path = manager.storage.find_file_by_id(draft_id)
    data = json.loads(draft_path.read_text(encoding="utf-8"))
    data["promoted_to"] = "fakefakefake1"
    data["promoted_at"] = "2026-05-13T00:00:00Z"
    draft_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

    issues = manager.validate_promotions()
    codes = [i.code for i in issues]
    assert "E03" in codes


def test_validate_detects_naked_reference(manager: BookIndexManager):
    """E04：promote 后人为引入裸引用（模拟 rewrite 漏掉的情况）。"""
    work_draft = _save_draft_work(manager, "作品A")
    work_prod = manager.promote_to_official(work_draft)

    # 创建一个新 Book，work_id 指向已 promoted 的 draft（裸引用）
    book = {
        "type": "book",
        "title": "新书",
        "work_id": work_draft,  # 故意用 draft-id
    }
    manager.save_item(book, BookIndexType.Book, BookIndexStatus.Draft)

    issues = manager.validate_promotions()
    codes = [i.code for i in issues]
    assert "E04" in codes


def test_validate_ignores_tombstone_self_reference(manager: BookIndexManager):
    """tombstone 文件自己的 id 字段虽然出现了 draft-id 但不该报 E04。"""
    draft_id = _save_draft_work(manager, "测试")
    manager.promote_to_official(draft_id)

    issues = manager.validate_promotions()
    # tombstone 的 id 字段就是 draft_id，不应当算 E04
    naked_refs = [i for i in issues if i.code == "E04"]
    assert naked_refs == []


# ── 11. _sync_work_books_link dedup（regression：promote 不重复 append） ──

def test_promote_book_does_not_duplicate_in_work_books(manager: BookIndexManager):
    """Regression: 之前 promote Book 后 Work.books 出现 [P, P] 重复。

    场景：Work 已 promote。下属 Book 升级时：
      Phase 1 save production Book → _sync 把 P append 到 Work.books（此时仍含 D）
      Phase 4 rewrite_references 改 D→P → Work.books 出现 P 两次

    fix：_sync_work_books_link 加全量 dedup。
    """
    # 1. 建 Work + 1 个 Book，Book.work_id 指向 Work
    work_draft = _save_draft_work(manager, "测试 Work")
    book_draft = _save_draft_book(manager, "版本一", work_draft)

    # 验证初始 Work.books 含 1 项
    work_data = manager.get_item(work_draft)
    assert work_data["books"] == [book_draft]

    # 2. 先 promote Work
    work_prod = manager.promote_to_official(work_draft)

    # 此时 production Work.books 应含 [book_draft]（rewrite 没改 Book id）
    prod_work = manager.get_item(work_prod)
    assert prod_work["books"] == [book_draft]

    # 3. 再 promote Book（这是触发 bug 的关键路径）
    book_prod = manager.promote_to_official(book_draft)

    # 关键断言：Work.books 应该恰好 [book_prod]，没有重复
    prod_work_after = manager.get_item(work_prod)
    assert prod_work_after["books"] == [book_prod], \
        f'expected [{book_prod!r}], got {prod_work_after["books"]!r}'


def test_sync_work_books_dedupes_existing_duplicates(manager: BookIndexManager):
    """_sync_work_books_link 应清理已有重复（防御性，不只针对 self）。"""
    work_id = _save_draft_work(manager, "测试 Work")
    # 手工把 Work.books 写成有重复的脏状态
    work = manager.get_item(work_id)
    work["books"] = ["bookA", "bookA", "bookB", "bookB", "bookC"]
    from book_index_manager.id_generator import smart_decode, BookIndexIdGenerator
    work_id_val = smart_decode(work_id)
    manager.storage.save_item(BookIndexType.Work, work_id_val, work)

    # save 一个 work_id=work_id 的 Book，触发 sync
    book_meta = {"type": "book", "title": "新增", "work_id": work_id}
    manager.save_item(book_meta, BookIndexType.Book, BookIndexStatus.Draft)
    new_book_id = book_meta["id"]

    work_after = manager.get_item(work_id)
    # books 应去重 + 追加 self
    assert work_after["books"] == ["bookA", "bookB", "bookC", new_book_id]
