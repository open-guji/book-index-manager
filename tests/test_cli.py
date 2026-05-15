"""
CLI smoke tests for book_index_manager.__main__

之前 __main__.py（367 行）coverage 0% — 用户每天用的命令完全没保护网。
本文件用 monkeypatch 替换 sys.argv 直接调 main()，配合 tmp_path 起隔离 root。
"""
from __future__ import annotations

import io
import json
import re
import sys
from pathlib import Path

import pytest

from book_index_manager.__main__ import main


# 提取 stdout 里的第一个 base36 ID（12-13 字符纯小写字母数字）。
# draft 输出 path 含 ID，gen-id --raw 输出纯 ID — 此正则两种都吃。
_ID_RE = re.compile(r"\b([0-9a-z]{12,13})\b")


def extract_id(text: str) -> str:
    m = _ID_RE.search(text)
    assert m, f"no base36 ID found in: {text!r}"
    return m.group(1)


def run_cli(monkeypatch, capsys, *args, stdin: str | None = None):
    """跑一次 CLI，返回 (stdout, stderr, exit_code).

    exit_code 0 表示正常结束（main 没 sys.exit）；非 0 由 SystemExit 捕获。
    """
    monkeypatch.setattr(sys, "argv", ["book-index", *args])
    if stdin is not None:
        monkeypatch.setattr(sys, "stdin", io.StringIO(stdin))
    code = 0
    try:
        main()
    except SystemExit as e:
        code = int(e.code) if e.code is not None else 0
    captured = capsys.readouterr()
    return captured.out, captured.err, code


@pytest.fixture
def root(tmp_path: Path) -> str:
    """每个测试一个隔离的 storage root"""
    (tmp_path / "book-index-draft").mkdir()
    (tmp_path / "book-index").mkdir()
    return str(tmp_path)


# ─── 不需要 storage 的纯命令 ───

def test_no_args_prints_help(monkeypatch, capsys):
    out, err, code = run_cli(monkeypatch, capsys)
    assert code == 0
    assert "Commands" in out or "subcommand" in out.lower() or "usage" in out.lower()


def test_gen_id_raw(monkeypatch, capsys, root):
    out, _, code = run_cli(monkeypatch, capsys, "gen-id", "--root", root, "--type", "work", "--raw")
    assert code == 0
    bid = out.strip()
    assert bid  # 非空
    assert all(c in "0123456789abcdefghijklmnopqrstuvwxyz" for c in bid), bid


def test_gen_id_verbose(monkeypatch, capsys, root):
    out, _, code = run_cli(monkeypatch, capsys, "gen-id", "--root", root, "--type", "book")
    assert code == 0
    assert "Generated ID" in out


def test_parse_id(monkeypatch, capsys, root):
    # 先 gen 一个再 parse
    out, _, _ = run_cli(monkeypatch, capsys, "gen-id", "--root", root, "--type", "work", "--raw")
    bid = out.strip()
    out, _, code = run_cli(monkeypatch, capsys, "parse-id", "--root", root, bid)
    assert code == 0
    # 至少含类型字段（具体格式由 handler 决定）
    assert "work" in out.lower() or "Work" in out


def test_get_config(monkeypatch, capsys, root):
    out, _, code = run_cli(monkeypatch, capsys, "get-config", "--root", root)
    assert code == 0
    # JSON 输出含 storage_root
    parsed = json.loads(out.strip())
    assert "storage_root" in parsed or "root" in str(parsed).lower()


# ─── 需要 storage：draft → get → update → delete 闭环 ───

def test_draft_creates_work(monkeypatch, capsys, root):
    out, _, code = run_cli(monkeypatch, capsys,
                            "draft", "紅樓夢測試", "--type", "work", "--root", root)
    assert code == 0
    # 输出含新 ID（在 path 里）
    bid = extract_id(out)
    assert len(bid) >= 12


def test_draft_get_roundtrip(monkeypatch, capsys, root):
    # draft 创建
    out, _, _ = run_cli(monkeypatch, capsys,
                         "draft", "史記測試", "--type", "work", "--root", root)
    bid = extract_id(out)

    # get 验证
    out2, _, code = run_cli(monkeypatch, capsys, "get", "--bid", bid, "--root", root)
    assert code == 0
    parsed = json.loads(out2.strip())
    assert parsed.get("title") == "史記測試"
    assert parsed.get("type") == "work"


def test_get_unknown_id(monkeypatch, capsys, root):
    out, _, code = run_cli(monkeypatch, capsys, "get", "--bid", "nonexistent99", "--root", root)
    assert code == 0
    parsed = json.loads(out.strip())
    assert "error" in parsed


def test_update_title(monkeypatch, capsys, root):
    out, _, _ = run_cli(monkeypatch, capsys, "draft", "舊", "--type", "book", "--root", root)
    bid = extract_id(out)

    out, _, code = run_cli(monkeypatch, capsys,
                            "update", "--bid", bid, "--title", "新", "--root", root)
    assert code == 0

    out, _, _ = run_cli(monkeypatch, capsys, "get", "--bid", bid, "--root", root)
    assert json.loads(out.strip()).get("title") == "新"


def test_delete(monkeypatch, capsys, root):
    out, _, _ = run_cli(monkeypatch, capsys, "draft", "待删", "--type", "book", "--root", root)
    bid = extract_id(out)

    _, _, code = run_cli(monkeypatch, capsys, "delete", "--bid", bid, "--root", root)
    assert code == 0

    out, _, _ = run_cli(monkeypatch, capsys, "get", "--bid", bid, "--root", root)
    assert "error" in json.loads(out.strip())


# ─── save：JSON 字面量 + stdin ───

def test_save_inline_json(monkeypatch, capsys, root):
    # 先生成一个合法 ID
    out, _, _ = run_cli(monkeypatch, capsys, "gen-id", "--type", "work", "--raw", "--root", root)
    bid = out.strip()

    metadata = {"id": bid, "type": "work", "title": "save 测试", "authors": [{"name": "测试者"}]}
    _, _, code = run_cli(monkeypatch, capsys,
                          "save", json.dumps(metadata, ensure_ascii=False), "--root", root)
    assert code == 0

    out, _, _ = run_cli(monkeypatch, capsys, "get", "--bid", bid, "--root", root)
    assert json.loads(out.strip())["title"] == "save 测试"


def test_save_stdin(monkeypatch, capsys, root):
    out, _, _ = run_cli(monkeypatch, capsys, "gen-id", "--type", "book", "--raw", "--root", root)
    bid = out.strip()
    metadata = {"id": bid, "type": "book", "title": "stdin 来的"}

    _, _, code = run_cli(monkeypatch, capsys, "save", "-", "--root", root,
                          stdin=json.dumps(metadata, ensure_ascii=False))
    assert code == 0
    out, _, _ = run_cli(monkeypatch, capsys, "get", "--bid", bid, "--root", root)
    assert json.loads(out.strip())["title"] == "stdin 来的"


# ─── asset directory + add-resource ───

def test_init_asset_dir(monkeypatch, capsys, root):
    out, _, _ = run_cli(monkeypatch, capsys, "draft", "需要资源", "--type", "book", "--root", root)
    bid = extract_id(out)

    _, _, code = run_cli(monkeypatch, capsys, "init-asset", "--bid", bid, "--root", root)
    assert code == 0
    # 资源目录在某处被创建（具体路径由 storage 决定）
    matches = list(Path(root).rglob(bid))
    assert any(p.is_dir() for p in matches), f"no asset dir for {bid}"


def test_add_resource(monkeypatch, capsys, root):
    out, _, _ = run_cli(monkeypatch, capsys, "draft", "带资源", "--type", "book", "--root", root)
    bid = extract_id(out)

    _, _, code = run_cli(monkeypatch, capsys,
                          "add-resource", "--bid", bid,
                          "--name", "维基文库", "--url", "https://zh.wikisource.org/...",
                          "--type", "text", "--root", root)
    assert code == 0

    out, _, _ = run_cli(monkeypatch, capsys, "get", "--bid", bid, "--root", root)
    parsed = json.loads(out.strip())
    resources = parsed.get("resources", [])
    assert any(r.get("name") == "维基文库" for r in resources)


# ─── reindex / shadow-reindex / check-index ───

def test_shadow_reindex_no_orphans(monkeypatch, capsys, root):
    # 创建 1 条
    run_cli(monkeypatch, capsys, "draft", "建一个", "--type", "work", "--root", root)
    _, _, code = run_cli(monkeypatch, capsys,
                          "shadow-reindex", "--target", "draft", "--workers", "2", "--root", root)
    assert code == 0


def test_reindex_full(monkeypatch, capsys, root):
    run_cli(monkeypatch, capsys, "draft", "重建测试", "--type", "work", "--root", root)
    _, _, code = run_cli(monkeypatch, capsys,
                          "reindex", "--target", "draft", "--workers", "2", "--root", root)
    assert code == 0


def test_check_index(monkeypatch, capsys, root):
    run_cli(monkeypatch, capsys, "draft", "校验", "--type", "book", "--root", root)
    _, _, code = run_cli(monkeypatch, capsys,
                          "check-index", "--target", "draft", "--root", root)
    assert code == 0


# ─── validate-lineage / migrate ───

def test_validate_lineage_empty(monkeypatch, capsys, root):
    _, _, code = run_cli(monkeypatch, capsys,
                          "validate-lineage", "--target", "draft", "--root", root)
    assert code == 0


def test_migrate_dry_run(monkeypatch, capsys, root):
    run_cli(monkeypatch, capsys, "draft", "old", "--type", "book", "--root", root)
    _, _, code = run_cli(monkeypatch, capsys,
                          "migrate", "--target", "draft", "--dry-run", "--root", root)
    assert code == 0


# ─── promote ───

def test_promote_single_id(monkeypatch, capsys, root):
    out, _, _ = run_cli(monkeypatch, capsys, "draft", "升级测试", "--type", "work", "--root", root)
    draft_id = extract_id(out)

    out, err, code = run_cli(monkeypatch, capsys, "promote", draft_id, "--root", root)
    assert code == 0
    line = next(l for l in out.strip().split("\n") if l.startswith("{"))
    parsed = json.loads(line)
    assert parsed["status"] == "success"
    assert parsed["draft_id"] == draft_id
    assert parsed["production_id"] != draft_id
    assert "1 succeeded, 0 failed" in err


def test_promote_multiple_ids(monkeypatch, capsys, root):
    out, _, _ = run_cli(monkeypatch, capsys, "draft", "A", "--type", "work", "--root", root)
    d1 = extract_id(out)
    out, _, _ = run_cli(monkeypatch, capsys, "draft", "B", "--type", "work", "--root", root)
    d2 = extract_id(out)

    out, err, code = run_cli(monkeypatch, capsys, "promote", d1, d2, "--root", root)
    assert code == 0
    success_lines = [l for l in out.strip().split("\n") if l.startswith("{")]
    assert len(success_lines) == 2
    assert "2 succeeded, 0 failed" in err


def test_promote_batch_file(monkeypatch, capsys, root, tmp_path):
    out, _, _ = run_cli(monkeypatch, capsys, "draft", "X", "--type", "work", "--root", root)
    d1 = extract_id(out)
    out, _, _ = run_cli(monkeypatch, capsys, "draft", "Y", "--type", "work", "--root", root)
    d2 = extract_id(out)

    batch = tmp_path / "promote.txt"
    batch.write_text(f"# 注释行\n{d1}\n\n{d2}\n", encoding="utf-8")

    out, err, code = run_cli(monkeypatch, capsys,
                              "promote", "--batch", str(batch), "--root", root)
    assert code == 0
    assert "2 succeeded, 0 failed" in err


def test_promote_dry_run(monkeypatch, capsys, root):
    out, _, _ = run_cli(monkeypatch, capsys, "draft", "干跑", "--type", "work", "--root", root)
    draft_id = extract_id(out)

    out, err, code = run_cli(monkeypatch, capsys,
                              "promote", draft_id, "--dry-run", "--root", root)
    assert code == 0
    line = next(l for l in out.strip().split("\n") if l.startswith("{"))
    parsed = json.loads(line)
    assert parsed["status"] == "dry-run"
    assert parsed["title"] == "干跑"
    assert "[dry-run]" in err

    # dry-run 不应该真改文件：再次 promote 应当 succeed（说明没动状态）
    out, _, code = run_cli(monkeypatch, capsys, "promote", draft_id, "--root", root)
    assert code == 0


def test_promote_unknown_id_fails(monkeypatch, capsys, root):
    # 形状合法但磁盘没文件
    out, _, _ = run_cli(monkeypatch, capsys, "gen-id", "--type", "work", "--raw", "--root", root)
    fake = out.strip()

    out, err, code = run_cli(monkeypatch, capsys, "promote", fake, "--root", root)
    assert code == 1
    line = next(l for l in out.strip().split("\n") if l.startswith("{"))
    parsed = json.loads(line)
    assert parsed["status"] == "error"


def test_promote_already_promoted_fails(monkeypatch, capsys, root):
    out, _, _ = run_cli(monkeypatch, capsys, "draft", "Z", "--type", "work", "--root", root)
    draft_id = extract_id(out)
    run_cli(monkeypatch, capsys, "promote", draft_id, "--root", root)

    out, err, code = run_cli(monkeypatch, capsys, "promote", draft_id, "--root", root)
    assert code == 1
    line = next(l for l in out.strip().split("\n") if l.startswith("{"))
    parsed = json.loads(line)
    assert parsed["status"] == "error"
    assert "already promoted" in parsed["message"]


def test_promote_no_ids_errors(monkeypatch, capsys, root):
    out, _, code = run_cli(monkeypatch, capsys, "promote", "--root", root)
    assert code == 1
    parsed = json.loads(out.strip().split("\n")[0])
    assert parsed["status"] == "error"


# ─── validate-promotions ───

def test_validate_promotions_clean(monkeypatch, capsys, root):
    """空仓 + 一次成功 promote 后应该 OK。"""
    out, _, _ = run_cli(monkeypatch, capsys, "draft", "正常", "--type", "work", "--root", root)
    draft_id = extract_id(out)
    run_cli(monkeypatch, capsys, "promote", draft_id, "--root", root)

    out, _, code = run_cli(monkeypatch, capsys, "validate-promotions", "--root", root)
    assert code == 0
    assert "OK" in out


def test_validate_promotions_reports_issues(monkeypatch, capsys, root, tmp_path):
    """人为破坏后应当 exit 1 并报 E03。"""
    out, _, _ = run_cli(monkeypatch, capsys, "draft", "坏", "--type", "work", "--root", root)
    draft_id = extract_id(out)
    # 手工写 promoted_to 但不进 promotions.json
    from pathlib import Path as _P
    work_files = list((_P(root) / "book-index-draft" / "Work").rglob(f"{draft_id}-*.json"))
    assert work_files
    p = work_files[0]
    data = json.loads(p.read_text(encoding="utf-8"))
    data["promoted_to"] = "fakefakefake1"
    p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

    out, _, code = run_cli(monkeypatch, capsys, "validate-promotions", "--root", root)
    assert code == 1
    assert "E03" in out
