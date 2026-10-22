#!/usr/bin/env python3
"""
统计 book-index 中 Work 与 Book 的文字资源覆盖率。

用法:
    python 古籍索引网站/stat-work-resources.py [--index-root PATH] [--by-juan]

输出:
    - Work 段：总数、有/无任意资源占比、按 resource id 分组覆盖率、
      可选按四库总目卷号分组统计
    - Book 段：总数、有/无任意资源占比、按 resource id 分组覆盖率、
      按 work_id 反查 Work.dynasty 后的朝代分组统计
"""

import argparse
import json
import os
import sys
from collections import Counter, defaultdict

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

DEFAULT_INDEX_ROOT = r'D:\workspace\book-index'


def parse_args():
    p = argparse.ArgumentParser(description='统计 Work 文字资源覆盖率')
    p.add_argument('--index-root', default=DEFAULT_INDEX_ROOT, help='索引根目录')
    p.add_argument('--by-juan', action='store_true', help='按四库总目卷号分组统计')
    return p.parse_args()


def walk_typed(root: str, type_name: str):
    """遍历某类型 JSON（work / book），返回 (filepath, data_dict) 迭代器。"""
    for dirpath, _, filenames in os.walk(root):
        for fn in filenames:
            if not fn.endswith('.json'):
                continue
            fp = os.path.join(dirpath, fn)
            try:
                with open(fp, 'r', encoding='utf-8') as f:
                    data = json.load(f)
            except Exception:
                continue
            if isinstance(data, dict) and data.get('type') == type_name:
                yield fp, data


def walk_works(work_root: str):
    """遍历所有 Work JSON，返回 (filepath, work_dict) 迭代器。"""
    yield from walk_typed(work_root, 'work')


def walk_books(book_root: str):
    """遍历所有 Book JSON，返回 (filepath, book_dict) 迭代器。"""
    yield from walk_typed(book_root, 'book')


def normalize_source(resource_id: str) -> str:
    """将 resource id 归一化到来源分组。

    例如 wikisource-siku, wikisource-sibu-congkan 都归为 wikisource。
    """
    if resource_id.startswith('wikisource'):
        return 'wikisource'
    return resource_id


def load_juan_mapping(index_root: str) -> dict[str, int]:
    """加载 work_id → 卷号 映射（从四库总目 collated_edition）。"""
    collated_dir = os.path.join(
        index_root, 'Work', 'G', 'Y', '4', 'GY4HvsY3w3u', 'collated_edition')
    mapping = {}
    if not os.path.isdir(collated_dir):
        return mapping
    for fn in os.listdir(collated_dir):
        if not fn.startswith('juan') or not fn.endswith('.json'):
            continue
        # Extract juan number from filename like juan001.json
        num_str = fn.removeprefix('juan').removesuffix('.json')
        try:
            juan_num = int(num_str)
        except ValueError:
            continue
        fp = os.path.join(collated_dir, fn)
        try:
            with open(fp, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception:
            continue
        for section in data.get('sections', []):
            wid = section.get('work_id')
            if wid:
                mapping[wid] = juan_num
    return mapping


def print_bar(label: str, count: int, total: int, width: int = 30):
    """打印带进度条的统计行。"""
    pct = count / total * 100 if total else 0
    filled = int(width * count / total) if total else 0
    bar = '█' * filled + '░' * (width - filled)
    print(f'  {label:<20s} {bar} {count:>6d} / {total}  ({pct:5.1f}%)')


def print_coverage_section(entity_label: str, total: int, with_any: int,
                            source_counter: Counter, source_detail_counter: Counter,
                            multi_source_counter: Counter):
    """打印一段通用的「总览 + 按来源 + 多源覆盖」统计块。"""
    without = total - with_any
    print(f'{"=" * 70}')
    print(f'  {entity_label} 总数:         {total}')
    print(f'  有文字资源:        {with_any}  ({with_any / max(total, 1) * 100:.1f}%)')
    print(f'  无文字资源:        {without}  ({without / max(total, 1) * 100:.1f}%)')
    print(f'{"=" * 70}\n')

    print('按来源覆盖率（归一化）:')
    for source, count in source_counter.most_common():
        print_bar(source, count, total)
    print()

    if len(source_detail_counter) > len(source_counter):
        print('按原始 resource id:')
        for rid, count in source_detail_counter.most_common():
            print_bar(rid, count, total)
        print()

    print('资源来源数分布:')
    for n in sorted(multi_source_counter.keys()):
        label = f'{n} 个来源' if n > 0 else '无资源'
        print_bar(label, multi_source_counter[n], total)
    print()


def load_work_dynasty_mapping(work_root: str) -> dict[str, str]:
    """加载 work_id → dynasty 映射，供 Book 段按朝代分组用。"""
    mapping = {}
    for _, work in walk_works(work_root):
        wid = work.get('id', '')
        dynasty = work.get('dynasty')
        if wid and dynasty:
            mapping[wid] = dynasty
    return mapping


def main():
    args = parse_args()
    work_root = os.path.join(args.index_root, 'Work')
    book_root = os.path.join(args.index_root, 'Book')

    print(f'索引目录: {args.index_root}')
    print('\n' + '#' * 70)
    print('# 一、Work 段')
    print('#' * 70 + '\n')
    print(f'Work 目录: {work_root}')
    print('扫描中...\n')

    total_works = 0
    with_any_resource = 0
    source_counter = Counter()        # source -> count of works having it
    source_detail_counter = Counter()  # raw resource id -> count
    multi_source_counter = Counter()   # number of distinct sources per work

    # For --by-juan
    juan_mapping = {}
    juan_stats = defaultdict(lambda: {'total': 0, 'with_resource': 0, 'sources': Counter()})
    if args.by_juan:
        print('加载卷号映射...')
        juan_mapping = load_juan_mapping(args.index_root)
        print(f'已映射 {len(juan_mapping)} 个 work_id 到卷号\n')

    for fp, work in walk_works(work_root):
        total_works += 1
        resources = work.get('resources', [])
        raw_ids = [r.get('id', '') for r in resources if r.get('id')]
        sources = set(normalize_source(rid) for rid in raw_ids)

        if sources:
            with_any_resource += 1

        for s in sources:
            source_counter[s] += 1
        for rid in set(raw_ids):
            source_detail_counter[rid] += 1
        multi_source_counter[len(sources)] += 1

        # Juan stats
        if args.by_juan:
            wid = work.get('id', '')
            juan = juan_mapping.get(wid)
            if juan is not None:
                juan_stats[juan]['total'] += 1
                if sources:
                    juan_stats[juan]['with_resource'] += 1
                for s in sources:
                    juan_stats[juan]['sources'][s] += 1

    # ── 总览 + 按来源 + 多源覆盖 ──
    print_coverage_section('Work', total_works, with_any_resource,
                            source_counter, source_detail_counter, multi_source_counter)

    # ── 按卷号分组 ──
    if args.by_juan and juan_stats:
        print(f'{"=" * 70}')
        print('按四库总目卷号统计（每10卷一组）:\n')
        # Group by 10
        group_size = 10
        max_juan = max(juan_stats.keys())
        all_sources = sorted(source_counter.keys())

        # Header
        header = f'  {"卷范围":<14s} {"总数":>5s} {"有资源":>6s} {"覆盖率":>6s}'
        for s in all_sources:
            header += f'  {s:>10s}'
        print(header)
        print('  ' + '-' * (len(header) - 2))

        for start in range(1, max_juan + 1, group_size):
            end = min(start + group_size - 1, max_juan)
            g_total = sum(juan_stats[j]['total'] for j in range(start, end + 1))
            g_with = sum(juan_stats[j]['with_resource'] for j in range(start, end + 1))
            if g_total == 0:
                continue
            pct = g_with / g_total * 100
            row = f'  卷{start:03d}-{end:03d}   {g_total:>5d} {g_with:>6d} {pct:>5.1f}%'
            for s in all_sources:
                sc = sum(juan_stats[j]['sources'].get(s, 0) for j in range(start, end + 1))
                row += f'  {sc:>10d}'
            print(row)

        print()

    # ════════════════════════════════════════════════════════════
    # 二、Book 段
    # ════════════════════════════════════════════════════════════
    print('\n' + '#' * 70)
    print('# 二、Book 段')
    print('#' * 70 + '\n')
    print(f'Book 目录: {book_root}')
    print('扫描中...\n')

    total_books = 0
    book_with_any_resource = 0
    book_source_counter = Counter()
    book_source_detail_counter = Counter()
    book_multi_source_counter = Counter()

    print('加载 Work.dynasty 映射...')
    dynasty_mapping = load_work_dynasty_mapping(work_root)
    print(f'已映射 {len(dynasty_mapping)} 个 work_id 到朝代\n')

    dynasty_stats = defaultdict(lambda: {'total': 0, 'with_resource': 0})

    for fp, book in walk_books(book_root):
        total_books += 1
        resources = book.get('resources', [])
        raw_ids = [r.get('id', '') for r in resources if r.get('id')]
        sources = set(normalize_source(rid) for rid in raw_ids)

        if sources:
            book_with_any_resource += 1

        for s in sources:
            book_source_counter[s] += 1
        for rid in set(raw_ids):
            book_source_detail_counter[rid] += 1
        book_multi_source_counter[len(sources)] += 1

        wid = book.get('work_id', '')
        dynasty = dynasty_mapping.get(wid, '未知')
        dynasty_stats[dynasty]['total'] += 1
        if sources:
            dynasty_stats[dynasty]['with_resource'] += 1

    print_coverage_section('Book', total_books, book_with_any_resource,
                            book_source_counter, book_source_detail_counter,
                            book_multi_source_counter)

    # ── 按朝代分组（经 Book.work_id 反查 Work.dynasty） ──
    if dynasty_stats:
        print(f'{"=" * 70}')
        print('按朝代统计（经 work_id 反查 Work.dynasty）:\n')
        header = f'  {"朝代":<10s} {"总数":>6s} {"有资源":>6s} {"覆盖率":>6s}'
        print(header)
        print('  ' + '-' * (len(header) - 2))
        for dynasty, stat in sorted(dynasty_stats.items(), key=lambda kv: -kv[1]['total']):
            d_total = stat['total']
            d_with = stat['with_resource']
            pct = d_with / d_total * 100 if d_total else 0
            print(f'  {dynasty:<10s} {d_total:>6d} {d_with:>6d} {pct:>5.1f}%')
        print()

    print('统计完成。')


if __name__ == '__main__':
    main()
