#!/usr/bin/env python3
"""升格之 id 撞號：跨進程一支之迴歸測試。

`BookIndexIdGenerator` 之 `(last_timestamp, sequence)` 是進程內狀態，而 official id
之時戳單位是**秒**——故兩個進程於同一秒各自從 sequence=0 起，必得同號。
2026-08-24 南北朝升格實見（`promote --batch b2 && promote --batch b3` 二進程同秒，
《文選》撞上《宋書》而覆寫之）。

per-status 狀態（`id_generator` 之另一支修法）管不著這一支——本測試以**新生成器**
模擬「另一個進程」，其狀態必為初值。

可獨立執行：`python3 tests/test_promote_id_collision.py`
"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from book_index_manager.id_generator import (
    BookIndexIdGenerator, BookIndexStatus, BookIndexType, base36_encode,
)
from book_index_manager.promotion import _mint_unique_official_id, PromotionsStore, PromotionRecord


class _FakeStorage:
    """只認得「哪些 id 已有實檔」之最小 storage。"""

    def __init__(self, draft_root, existing=()):
        self.draft_root = Path(draft_root)
        self.official_root = Path(draft_root).parent / 'book-index'
        self._existing = set(existing)

    def find_file_by_id(self, id_str, quiet=False):
        return Path(f'/fake/{id_str}.json') if id_str in self._existing else None


def _fresh_gen():
    """新生成器＝新進程：狀態為初值，同一秒內必再從 sequence=0 起。"""
    return BookIndexIdGenerator(machine_id=1)


def test_naked_generator_collides_across_processes():
    """先立其病：兩個生成器同秒各自鑄號，必撞。"""
    a = _fresh_gen().next_id(BookIndexStatus.Official, BookIndexType.Work)
    b = _fresh_gen().next_id(BookIndexStatus.Official, BookIndexType.Work)
    assert a == b, (
        '前提已不成立：同秒之兩個新生成器竟不撞。'
        '若 official 之時戳已改為毫秒級，本測試須重寫。'
    )
    print('  ✓ 前提成立：裸生成器跨進程同秒必撞')


def test_mint_skips_taken_by_promotions_json():
    """已錄於 promotions.json 之號不再發。"""
    with tempfile.TemporaryDirectory() as d:
        draft = Path(d) / 'book-index-draft'
        draft.mkdir()
        taken = base36_encode(_fresh_gen().next_id(BookIndexStatus.Official, BookIndexType.Work))
        (draft / 'promotions.json').write_text(json.dumps({
            'version': 1,
            'promotions': {'1evtest0000000': {
                'production_id': taken, 'type': 'work', 'promoted_at': '2026-08-24T00:00:00Z'}},
        }, ensure_ascii=False), encoding='utf-8')

        store = PromotionsStore(draft)
        got_val, got = _mint_unique_official_id(
            _fresh_gen(), _FakeStorage(draft), BookIndexType.Work, store)
        assert got != taken, f'鑄出已被 promotions.json 佔用之號 {got}'
        print(f'  ✓ 避開 promotions.json 已佔之 {taken} → {got}')


def test_mint_skips_taken_by_existing_file():
    """兩倉已有實檔之號不再發（promotions.json 尚未落盤之窗口）。"""
    with tempfile.TemporaryDirectory() as d:
        draft = Path(d) / 'book-index-draft'
        draft.mkdir()
        taken = base36_encode(_fresh_gen().next_id(BookIndexStatus.Official, BookIndexType.Work))
        store = PromotionsStore(draft)
        got_val, got = _mint_unique_official_id(
            _fresh_gen(), _FakeStorage(draft, existing={taken}), BookIndexType.Work, store)
        assert got != taken, f'鑄出已有實檔之號 {got}'
        print(f'  ✓ 避開實檔已佔之 {taken} → {got}')


def test_mint_many_all_distinct():
    """一進程連鑄三百，皆相異，且無一撞既有者。"""
    with tempfile.TemporaryDirectory() as d:
        draft = Path(d) / 'book-index-draft'
        draft.mkdir()
        store = PromotionsStore(draft)
        gen = _fresh_gen()
        st = _FakeStorage(draft)
        seen = set()
        for _ in range(300):
            _, s = _mint_unique_official_id(gen, st, BookIndexType.Work, store)
            assert s not in seen, f'一進程之內鑄出重號 {s}'
            seen.add(s)
        print(f'  ✓ 連鑄 300 皆相異')


if __name__ == '__main__':
    for fn in (test_naked_generator_collides_across_processes,
               test_mint_skips_taken_by_promotions_json,
               test_mint_skips_taken_by_existing_file,
               test_mint_many_all_distinct):
        print(fn.__name__)
        fn()
    print('\n全部通過')
