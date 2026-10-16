"""
黄金样例对拍（overview#568 B4 步骤 1）。

`tests/golden/entries.json` 与 `ui/tests/unit/golden-parity.test.ts` 读同一份文件：
`build_index_entry(record) == expect_index_entry`。Python 与 TS 两份提取逻辑此前只靠人工同窗改，
这里改成机器对拍——改坏任一侧，两个测试之一立刻红。

KNOWN_RED_UNTIL：旧写法负例里，Python 仍保留读法的几条。读法删掉的那一步（S2 闸后的步骤 4／
步骤 6）合并时，对应 xfail 会因 strict 变成失败，逼着把名字从这里删掉。
"""
import json
from pathlib import Path

import pytest

from book_index_manager.entry_extractor import build_index_entry
from book_index_manager.id_generator import BookIndexType

GOLDEN = Path(__file__).parent / "golden" / "entries.json"
CASES = json.loads(GOLDEN.read_text(encoding="utf-8"))

KNOWN_RED_UNTIL: dict[str, str] = {}


def _params():
    out = []
    for c in CASES:
        marks = []
        if c["name"] in KNOWN_RED_UNTIL:
            marks.append(pytest.mark.xfail(strict=True, reason=KNOWN_RED_UNTIL[c["name"]]))
        out.append(pytest.param(c, id=c["name"], marks=marks))
    return out


@pytest.mark.parametrize("case", _params())
def test_build_index_entry_matches_golden(case):
    expect = case["expect_index_entry"]
    got = build_index_entry(case["record"], BookIndexType[case["type"]], expect["path"])
    assert got == expect


def test_golden_file_shape():
    assert CASES, "golden 不能为空"
    assert any(c["negative"] for c in CASES) and any(not c["negative"] for c in CASES)
    for c in CASES:
        assert set(c) >= {"name", "type", "record", "expect_index_entry", "negative"}
        assert c["type"] in BookIndexType.__members__
    assert len({c["name"] for c in CASES}) == len(CASES), "name 不得重复"
    assert KNOWN_RED_UNTIL.keys() <= {c["name"] for c in CASES}
