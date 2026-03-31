"""
统计各叢書目錄的 imported 数据，更新 resource.json。

- 有 collection_id 的：从 volume_book_mapping 读取 book 数
- 有 work_id 的：统计 indexed_by 中引用该 work 的 Work 总数
- 有 collection_id 且是丛编：从 volume_book_mapping 读取 book 统计

用法:
    python -m book_index_manager.scripts.update_catalog_stats [DATA_ROOT]
"""

import json
import sys
import os
import glob

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')  # type: ignore


def count_indexed_by(data_root: str, work_id: str) -> int:
    """统计有多少 Work 的 indexed_by 引用了指定 work_id。"""
    count = 0
    for f in glob.glob(os.path.join(data_root, 'Work', '**', '*.json'), recursive=True):
        if any(skip in f for skip in ['collated_edition', '_catalog.json', 'index.json', 'index_']):
            continue
        try:
            with open(f, encoding='utf-8') as fh:
                data = json.load(fh)
            for item in data.get('indexed_by', []):
                bid = item.get('source_bid') if isinstance(item, dict) else None
                if bid == work_id:
                    count += 1
                    break
        except (json.JSONDecodeError, OSError):
            continue
    return count


def count_catalog_books(data_root: str, collection_id: str) -> int | None:
    """从 volume_book_mapping.json 读取 book 总数。"""
    prefix = collection_id[:3]
    c1, c2, c3 = prefix[0], prefix[1], prefix[2]

    for folder in [data_root]:
        col_dir = os.path.join(folder, 'Collection', c1, c2, c3, collection_id)
        if not os.path.exists(col_dir):
            continue
        total = 0
        for sub in os.listdir(col_dir):
            mapping = os.path.join(col_dir, sub, 'volume_book_mapping.json')
            if os.path.exists(mapping):
                try:
                    with open(mapping, encoding='utf-8') as fh:
                        d = json.load(fh)
                    total = max(total, len(d.get('books', [])))
                except (json.JSONDecodeError, OSError):
                    continue
        return total if total > 0 else None
    return None


def main():
    if len(sys.argv) > 1:
        data_root = sys.argv[1]
    else:
        candidates = [
            os.path.join(os.getcwd(), 'book-index-draft'),
            'D:/workspace/book-index-draft',
        ]
        data_root = next((c for c in candidates if os.path.exists(c)), candidates[0])

    print(f'数据目录: {data_root}')

    resource_file = os.path.join(data_root, 'resource.json')
    if not os.path.exists(resource_file):
        print(f'错误: 未找到 {resource_file}')
        sys.exit(1)

    with open(resource_file, encoding='utf-8') as f:
        data = json.load(f)

    updated = 0
    for item in data.get('resources', []):
        name = item.get('name', '')
        edition = item.get('edition', '')
        display = f'{name}·{edition}' if edition else name

        # 有 work_id → 统计 indexed_by
        work_id = item.get('work_id')
        if work_id:
            print(f'  {display}: 统计 indexed_by (work_id={work_id})...')
            count = count_indexed_by(data_root, work_id)
            old_imported = item.get('imported', 0)
            if count != old_imported:
                print(f'    imported: {old_imported} → {count}')
                item['imported'] = count
                updated += 1
            else:
                print(f'    imported: {count} (unchanged)')
            # total 至少 >= imported
            if item.get('total', 0) < count:
                print(f'    total: {item.get("total", 0)} → {count}')
                item['total'] = count
                updated += 1

        # 有 collection_id → 统计 catalog books
        collection_id = item.get('collection_id')
        if collection_id:
            print(f'  {display}: 统计 catalog books (collection_id={collection_id})...')
            book_count = count_catalog_books(data_root, collection_id)
            if book_count is not None:
                old_imported = item.get('imported', 0)
                if book_count != old_imported:
                    print(f'    imported: {old_imported} → {book_count}')
                    item['imported'] = book_count
                    updated += 1
                else:
                    print(f'    imported: {book_count} (unchanged)')
                # total 也同步为 book 数
                if item.get('total', 0) != book_count:
                    print(f'    total: {item.get("total", 0)} → {book_count}')
                    item['total'] = book_count
                    updated += 1

    if updated > 0:
        with open(resource_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write('\n')
        print(f'\n已更新 {updated} 个条目')
    else:
        print('\n所有数据已是最新')


if __name__ == '__main__':
    main()
