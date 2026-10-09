"""文件名中题名部分截到 MAX_NAME_CHARS 字（overview#409 李小有詩記：题名塞子目致文件名超 255 字节）。

覆盖：
- get_path 按码位截到 60 字（SMP 汉字算一个字），与 ui cleanName 用同一组向量
- 新写长题名：文件名题名部分恰 60 字，UTF-8 字节不超限
- 旧档名是截断前的长名：再次 save 沿用旧档，不改名、不多出新档
"""
from __future__ import annotations

from pathlib import Path

import pytest

from book_index_manager import BookIndexManager, BookIndexStatus, BookIndexType
from book_index_manager.storage import MAX_NAME_CHARS

# 与 ui/tests/unit/storage.test.ts 的「cleanName 截断」用例同一组向量
LONG = '李小有詩記（' + '饑驅拙言、仗友隨鷗、葭園唱和、瞻烏歎、羈游譜、' * 4 + '𠀀尾）'


@pytest.fixture
def manager(tmp_path: Path) -> BookIndexManager:
    return BookIndexManager(storage_root=str(tmp_path), machine_id=1)


def _name_part(p: Path) -> str:
    return p.stem.split('-', 1)[1]


def test_max_name_chars_is_60():
    assert MAX_NAME_CHARS == 60


def test_get_path_caps_by_code_point(manager):
    p = manager.storage.get_path(BookIndexType.Work, 12345, '𠀀' * 70)
    assert _name_part(p) == '𠀀' * 60


def test_short_name_untouched(manager):
    p = manager.storage.get_path(BookIndexType.Work, 12345, '李小有詩記')
    assert _name_part(p) == '李小有詩記'


def test_long_title_written_capped(manager):
    md = {'type': 'work', 'title': LONG, 'authors': [{'name': '李槃', 'role': '撰'}]}
    manager.save_item(md, BookIndexType.Work, BookIndexStatus.Draft)
    path = manager.storage.find_file_by_id(md['id'])
    assert len(_name_part(path)) == MAX_NAME_CHARS
    assert len(path.name.encode('utf-8')) <= 255
    assert md['title'] == LONG  # 题名本身不截


def test_legacy_long_filename_kept(manager):
    md = {'type': 'work', 'title': LONG, 'authors': [{'name': '李槃', 'role': '撰'}]}
    manager.save_item(md, BookIndexType.Work, BookIndexStatus.Draft)
    capped = manager.storage.find_file_by_id(md['id'])
    # 模拟截断前写下的旧档：题名部分比 60 字长
    full = capped.with_name(capped.stem + '饑驅拙言仗友隨鷗.json')
    capped.rename(full)
    md['ai_note'] = '再存一次'
    manager.save_item(md, BookIndexType.Work, BookIndexStatus.Draft)
    files = sorted(capped.parent.glob(f"{md['id']}-*.json"))
    assert files == [full]
