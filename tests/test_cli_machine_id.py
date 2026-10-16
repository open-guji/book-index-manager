"""--machine-id / BOOK_INDEX_MACHINE_ID / 配置文件 / 租约默认 的优先级与落地。

机器码写进 ID 的 11 位 machine 段；不同用户用不同机器码，同秒生成也不撞号。
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pytest

from book_index_manager.__main__ import main
from book_index_manager.config import AppConfig
from book_index_manager.id_generator import BookIndexIdGenerator, smart_decode


def run_cli(monkeypatch, capsys, *args):
    monkeypatch.setattr(sys, "argv", ["book-index", *args])
    code = 0
    try:
        main()
    except SystemExit as e:
        code = int(e.code) if e.code is not None else 0
    cap = capsys.readouterr()
    return cap.out, cap.err, code


def machine_of(id_str: str) -> int:
    return BookIndexIdGenerator.parse(smart_decode(id_str)).machine_id


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    monkeypatch.delenv("BOOK_INDEX_MACHINE_ID", raising=False)
    monkeypatch.delenv("BOOK_INDEX_STORAGE_ROOT", raising=False)


@pytest.fixture
def root(tmp_path: Path) -> str:
    (tmp_path / "book-index-draft").mkdir()
    (tmp_path / "book-index").mkdir()
    return str(tmp_path)


def gen(monkeypatch, capsys, root, *extra):
    out, err, code = run_cli(monkeypatch, capsys, "gen-id", "--root", root, "--raw", *extra)
    assert code == 0, err
    return out.strip()


# ─── AppConfig ───

def test_config_default_is_unspecified():
    assert AppConfig().machine_id is None


def test_config_env(monkeypatch):
    monkeypatch.setenv("BOOK_INDEX_MACHINE_ID", "9")
    assert AppConfig().machine_id == 9


def test_config_env_empty_is_unspecified(monkeypatch):
    monkeypatch.setenv("BOOK_INDEX_MACHINE_ID", "")
    assert AppConfig().machine_id is None


def test_config_file(tmp_path):
    f = tmp_path / "c.ini"
    f.write_text("[Storage]\nroot = /x\nmachine_id = 4\n", encoding="utf-8")
    assert AppConfig(str(f)).machine_id == 4


def test_config_file_without_machine_id(tmp_path):
    f = tmp_path / "c.ini"
    f.write_text("[Storage]\nroot = /x\n", encoding="utf-8")
    assert AppConfig(str(f)).machine_id is None


# ─── CLI 优先级 ───

@pytest.mark.parametrize("n", [0, 1, 5, 2047])
def test_flag_sets_machine_id(monkeypatch, capsys, root, n):
    assert machine_of(gen(monkeypatch, capsys, root, "--machine-id", str(n))) == n


def test_default_is_lease_zero_and_registers(monkeypatch, capsys, root):
    assert machine_of(gen(monkeypatch, capsys, root)) == 0
    # 租约分配会在 root 下留登记表
    assert (Path(root) / ".machine_ids.json").exists()


def test_flag_does_not_touch_registry(monkeypatch, capsys, root):
    gen(monkeypatch, capsys, root, "--machine-id", "1")
    assert not (Path(root) / ".machine_ids.json").exists()


def test_env_used_when_no_flag(monkeypatch, capsys, root):
    monkeypatch.setenv("BOOK_INDEX_MACHINE_ID", "7")
    assert machine_of(gen(monkeypatch, capsys, root)) == 7


def test_flag_beats_env(monkeypatch, capsys, root):
    monkeypatch.setenv("BOOK_INDEX_MACHINE_ID", "7")
    assert machine_of(gen(monkeypatch, capsys, root, "--machine-id", "2")) == 2


def test_config_file_used_and_flag_beats_it(monkeypatch, capsys, root, tmp_path):
    f = tmp_path / "c.ini"
    f.write_text(f"[Storage]\nroot = {root}\nmachine_id = 6\n", encoding="utf-8")
    out, _, _ = run_cli(monkeypatch, capsys, "gen-id", "--config", str(f), "--raw")
    assert machine_of(out.strip()) == 6
    out, _, _ = run_cli(monkeypatch, capsys, "gen-id", "--config", str(f), "--machine-id", "3", "--raw")
    assert machine_of(out.strip()) == 3


@pytest.mark.parametrize("bad", ["2048", "-1", "abc"])
def test_flag_invalid_rejected(monkeypatch, capsys, root, bad):
    _, err, code = run_cli(monkeypatch, capsys, "gen-id", "--root", root, "--machine-id", bad)
    assert code != 0
    assert "machine" in err.lower()


def test_two_machine_ids_never_collide_same_type_status(monkeypatch, capsys, root):
    a = gen(monkeypatch, capsys, root, "--type", "work", "--status", "official", "--machine-id", "0")
    b = gen(monkeypatch, capsys, root, "--type", "work", "--status", "official", "--machine-id", "1")
    assert a != b


# ─── 其他子命令也吃 --machine-id ───

def test_draft_uses_machine_id(monkeypatch, capsys, root):
    out, err, code = run_cli(monkeypatch, capsys, "draft", "測試書", "--type", "work",
                             "--root", root, "--machine-id", "1")
    assert code == 0, err
    bid = re.search(r"\b([0-9a-z]{12,13})\b", out).group(1)
    assert machine_of(bid) == 1


def test_promote_uses_machine_id(monkeypatch, capsys, root):
    out, _, _ = run_cli(monkeypatch, capsys, "draft", "測試書", "--type", "work",
                        "--root", root, "--machine-id", "1")
    draft_id = re.search(r"\b([0-9a-z]{12,13})\b", out).group(1)
    out, err, code = run_cli(monkeypatch, capsys, "promote", draft_id,
                             "--root", root, "--machine-id", "2")
    assert code == 0, err
    line = next(l for l in out.strip().split("\n") if l.startswith("{"))
    assert machine_of(json.loads(line)["production_id"]) == 2
