"""id_generator 撞號之迴歸測試（2026-08-24 隋唐升格所出）。"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from book_index_manager.id_generator import (
    BookIndexIdGenerator, BookIndexStatus, BookIndexType)


def test_official_ids_unique_when_interleaved_with_draft():
    """official 之時間戳是**秒**級，一秒內可生成多條；
    若其間穿插 draft id 之生成，舊制會把 sequence 歸零而 timestamp 未推進，
    於是同一秒內先後兩個 official id 完全相同。"""
    g = BookIndexIdGenerator(1)
    ids = []
    for _ in range(100):
        ids.append(g.next_id(BookIndexStatus.Official, BookIndexType.Work))
        g.next_id(BookIndexStatus.Draft, BookIndexType.Work)
    assert len(set(ids)) == 100, f'official 撞號：{100 - len(set(ids))} 個重複'


def test_official_ids_unique_in_burst():
    g = BookIndexIdGenerator(1)
    ids = [g.next_id(BookIndexStatus.Official, BookIndexType.Work) for _ in range(300)]
    assert len(set(ids)) == 300, f'連發撞號：{300 - len(set(ids))} 個重複'


def test_draft_ids_unique_when_interleaved():
    g = BookIndexIdGenerator(1)
    ids = []
    for _ in range(100):
        ids.append(g.next_id(BookIndexStatus.Draft, BookIndexType.Work))
        g.next_id(BookIndexStatus.Official, BookIndexType.Work)
    assert len(set(ids)) == 100, f'draft 撞號：{100 - len(set(ids))} 個重複'


if __name__ == '__main__':
    for fn in (test_official_ids_unique_when_interleaved_with_draft,
               test_official_ids_unique_in_burst,
               test_draft_ids_unique_when_interleaved):
        fn(); print(f'  ✓ {fn.__name__}')
    print('三驗俱過')
