"""S1-S5 新字段校验测试（issue open-guji-core/overview#278）。

每个字段至少一条合法用例、一条非法用例；classification 覆盖 l1-l4 前缀链。
词表用手写小 fixture，不依赖真实 classific.json。
"""

import csv
import io
import json
import sys

import pytest

from book_index_manager.__main__ import main

from book_index_manager import (
    build_vocab,
    classification_ok,
    edition_type_ok,
    provenance_ok,
    physical_description_ok,
    base_edition_ok,
    dates_ok,
    external_ids_ok,
    derive_member_type,
    member_type_ok,
    validate_work_fields,
    validate_book_fields,
    validate_entity_fields,
    validate_collection_fields,
)


@pytest.fixture
def vocab():
    rows = [
        {"cata_l1": "經部", "cata_l2": "易類", "cata_l3": "易傳", "cata_l4": "繫辭傳"},
        {"cata_l1": "經部", "cata_l2": "易類", "cata_l3": "易經"},
        {"cata_l1": "經部", "cata_l2": "書類"},
        {"cata_l1": "史部", "cata_l2": "正史類"},
    ]
    return build_vocab(rows)


# ─── classification ───

def test_classification_l1_ok(vocab):
    assert classification_ok({"l1": "經部"}, vocab) is True


def test_classification_l1_bad(vocab):
    assert classification_ok({"l1": "子部"}, vocab) is False


def test_classification_l2_in_vocab(vocab):
    assert classification_ok({"l1": "經部", "l2": "易類"}, vocab) is True


def test_classification_l2_not_in_vocab(vocab):
    # l2 不在词表（沿用父级前缀也救不了）
    assert classification_ok({"l1": "經部", "l2": "禮類"}, vocab) is False


def test_classification_l2_wrong_parent(vocab):
    # l2 存在但挂在别的 l1 下
    assert classification_ok({"l1": "史部", "l2": "易類"}, vocab) is False


def test_classification_l3_ok(vocab):
    assert classification_ok({"l1": "經部", "l2": "易類", "l3": "易經"}, vocab) is True


def test_classification_l3_bad(vocab):
    assert classification_ok({"l1": "經部", "l2": "易類", "l3": "不存在"}, vocab) is False


def test_classification_l4_ok(vocab):
    assert classification_ok({"l1": "經部", "l2": "易類", "l3": "易傳", "l4": "繫辭傳"}, vocab) is True


def test_classification_l4_bad(vocab):
    assert classification_ok({"l1": "經部", "l2": "易類", "l3": "易傳", "l4": "不存在"}, vocab) is False


def test_classification_empty_ok(vocab):
    assert classification_ok({}, vocab) is True


def test_classification_orphan_child_bad(vocab):
    # 无 l1 却有 l2
    assert classification_ok({"l2": "易類"}, vocab) is False
    # 有 l1 无 l2 却有 l3
    assert classification_ok({"l1": "經部", "l3": "易經"}, vocab) is False
    # 有 l2 无 l3 却有 l4
    assert classification_ok({"l1": "經部", "l2": "易類", "l4": "繫辭傳"}, vocab) is False


def test_validate_work_fields_missing_key_passes(vocab):
    assert validate_work_fields({"id": "x", "type": "work"}, vocab) == []


def test_validate_work_fields_bad(vocab):
    errs = validate_work_fields(
        {"id": "x", "type": "work", "classification": {"l1": "子部"}}, vocab)
    assert len(errs) == 1 and "classification" in errs[0]


# ─── edition_type ───

def test_edition_type_ok():
    assert edition_type_ok("刻本") is True
    assert edition_type_ok("鉛印本") is True


def test_edition_type_bad():
    assert edition_type_ok("手抄本") is False
    assert edition_type_ok("") is False
    assert edition_type_ok(None) is False


# ─── provenance ───

def test_provenance_ok():
    assert provenance_ok([{"institution": "國家圖書館", "call_number": "123"}]) is True
    assert provenance_ok([{"institution": "北大圖書館"}]) is True
    assert provenance_ok([]) is True


def test_provenance_bad():
    assert provenance_ok("國家圖書館") is False
    assert provenance_ok([{"institution": "  "}]) is False
    assert provenance_ok([{"institution": "北大", "call_number": 123}]) is False
    assert provenance_ok(["北大"]) is False


# ─── physical_description ───

def test_physical_description_ok():
    assert physical_description_ok(
        {"source": "館藏目錄", "binding": "線裝"}) is True


def test_physical_description_bad():
    # 无 source
    assert physical_description_ok({"binding": "線裝"}) is False
    # 有 source 但无内容字段
    assert physical_description_ok({"source": "館藏目錄"}) is False
    # 非字符串内容
    assert physical_description_ok({"source": "館藏目錄", "binding": 123}) is False


# ─── base_edition ───

def test_base_edition_ok():
    be = [{"role": "底本", "name": "文淵閣四庫全書本", "source": "館藏",
           "book_id": "b1", "work_id": "w1"}]
    assert base_edition_ok(be, "b0", {"b1"}, {"w1"}) is True
    # 无引用 id 也合法
    be2 = [{"role": "參校", "name": "某本", "source": "某目錄"}]
    assert base_edition_ok(be2, "b0", set(), set()) is True


def test_base_edition_bad():
    # 非法 role
    assert base_edition_ok([{"role": "正本", "name": "x", "source": "y"}],
                           "b0", set(), set()) is False
    # 自引用
    assert base_edition_ok([{"role": "底本", "name": "x", "source": "y", "book_id": "b0"}],
                           "b0", {"b0"}, set()) is False
    # 引用未知 book
    assert base_edition_ok([{"role": "底本", "name": "x", "source": "y", "book_id": "zzz"}],
                           "b0", {"b1"}, set()) is False
    # 引用未知 work
    assert base_edition_ok([{"role": "底本", "name": "x", "source": "y", "work_id": "zzz"}],
                           "b0", set(), {"w1"}) is False
    # name 为空
    assert base_edition_ok([{"role": "底本", "name": " ", "source": "y"}],
                           "b0", set(), set()) is False


def test_validate_book_fields_missing_keys_pass():
    assert validate_book_fields({"id": "b0", "type": "book"}) == []


def test_validate_book_fields_reports_each_field():
    book = {"id": "b0", "type": "book", "edition_type": "手抄本",
            "provenance": "某館", "physical_description": {"binding": "線裝"},
            "base_edition": [{"role": "正本", "name": "x", "source": "y"}]}
    errs = validate_book_fields(book, set(), set())
    assert len(errs) == 4
    joined = " ".join(errs)
    for f in ("edition_type", "provenance", "physical_description", "base_edition"):
        assert f in joined


# ─── dates ───

def test_dates_ok():
    assert dates_ok({"dates": {"birth": 1900, "death": 1980}}) is None
    assert dates_ok({}) is None  # 无 dates 键即过
    assert dates_ok({"dates": {"floruit": [1500, 1560]}}) is None


def test_dates_bad():
    assert dates_ok({"dates": {"birth": "1900"}}) is not None
    assert dates_ok({"dates": {"floruit": [1560, 1500]}}) is not None
    assert dates_ok({"dates": {"floruit": [1500]}}) is not None
    assert dates_ok({"dates": {"birth": 1980, "death": 1900}}) is not None
    assert dates_ok({"dates": {"birth": 1900}, "birth_year": 1901}) is not None


def test_validate_entity_fields():
    assert validate_entity_fields({"id": "e1", "type": "entity"}) == []
    errs = validate_entity_fields({"id": "e1", "dates": {"birth": "庚午"}})
    assert len(errs) == 1 and "dates" in errs[0]


# ─── external_ids ───

def test_external_ids_ok():
    assert external_ids_ok({}) is None
    assert external_ids_ok({"external_ids": {"wikidata_id": "Q123",
                                             "viaf_id": "123456"}}) is None


def test_external_ids_bad():
    assert external_ids_ok({"external_ids": {"wikidata_id": "123"}}) is not None
    assert external_ids_ok({"external_ids": {"viaf_id": "abc"}}) is not None


# ─── member_type ───

def test_derive_member_type():
    assert derive_member_type({"books": ["b1"]}) == "Book"
    assert derive_member_type({"contained_works": ["w1"]}) == "Work"
    assert derive_member_type({"books": ["b1"], "contained_works": ["w1"]}) == "mixed"
    assert derive_member_type({}) is None
    assert derive_member_type({}, reverse_has_book=True) == "Book"
    assert derive_member_type({}, reverse_has_work=True) == "Work"


def test_member_type_ok():
    assert member_type_ok({}) is True  # 无 _member_type 即过
    assert member_type_ok({"_member_type": "Book", "books": ["b1"]}) is True
    assert member_type_ok({"_member_type": "Work", "books": ["b1"]}) is False
    assert member_type_ok({"_member_type": "Nope", "books": ["b1"]}) is False
    assert member_type_ok({"_member_type": "Book"}, reverse_has_book=True) is True


def test_validate_collection_fields():
    assert validate_collection_fields({"id": "c1"}) == []
    errs = validate_collection_fields({"id": "c1", "_member_type": "Work", "books": ["b1"]})
    assert len(errs) == 1 and "_member_type" in errs[0]


# ─── scan-fields CLI ───

def _write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")


def test_scan_fields_cli(tmp_path, monkeypatch, capsys):
    root = tmp_path / "ws"
    (root / "book-index").mkdir(parents=True)
    (root / "book-index-draft").mkdir(parents=True)
    (root / "book-index" / "classific.json").write_text(
        json.dumps([{"cata_l1": "經部", "cata_l2": "易類"}], ensure_ascii=False),
        encoding="utf-8")
    _write(root / "book-index-draft" / "Work" / "a" / "b" / "c" / "w1-test.json",
           {"id": "w1", "type": "work", "title": "t",
            "classification": {"l1": "子部"}})
    _write(root / "book-index-draft" / "Book" / "a" / "b" / "c" / "b1-test.json",
           {"id": "b1", "type": "book", "title": "t", "edition_type": "手抄本"})
    _write(root / "book-index-draft" / "Entity" / "a" / "b" / "c" / "e1-test.json",
           {"id": "e1", "type": "entity",
            "external_ids": {"wikidata_id": "123"}})
    _write(root / "book-index-draft" / "Collection" / "a" / "b" / "c" / "c1-test.json",
           {"id": "c1", "type": "collection", "books": ["b1"], "_member_type": "Work"})

    monkeypatch.setattr(sys, "argv", ["book-index", "scan-fields", "--root", str(root)])
    try:
        main()
    except SystemExit as e:
        assert e.code in (None, 0), f"scan-fields exited {e.code}"
    out, _ = capsys.readouterr()
    rows = list(csv.DictReader(io.StringIO(out)))
    assert {r["field"] for r in rows} == {
        "classification", "edition_type", "external_ids", "_member_type"}
    assert [r["id"] for r in rows if r["field"] == "classification"] == ["w1"]
