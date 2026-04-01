"""
根据 volume_book_mapping.json 批量创建缺失的 Book JSON 文件。

扫描指定 Collection 的 catalog，找到有 book_id 但无对应文件的条目，
创建 Book JSON 并更新索引。

用法:
    python -m book_index_manager.scripts.create_books_from_catalog <collection_id> [DATA_ROOT]

示例:
    python -m book_index_manager.scripts.create_books_from_catalog FCmzokMAKks D:/workspace/book-index-draft
"""

import json
import sys
import os
import glob

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')  # type: ignore


def find_catalog_files(data_root: str, collection_id: str) -> list[str]:
    """找到指定 collection 下所有 volume_book_mapping.json。"""
    prefix = collection_id[:3]
    c1, c2, c3 = prefix[0], prefix[1], prefix[2]
    col_dir = os.path.join(data_root, 'Collection', c1, c2, c3, collection_id)
    results = []
    if os.path.exists(col_dir):
        for sub in os.listdir(col_dir):
            mapping = os.path.join(col_dir, sub, 'volume_book_mapping.json')
            if os.path.exists(mapping):
                results.append(mapping)
    return results


def book_file_exists(data_root: str, book_id: str) -> bool:
    """检查 Book JSON 文件是否存在。"""
    prefix = book_id[:3]
    c1, c2, c3 = prefix[0], prefix[1], prefix[2]
    search_dir = os.path.join(data_root, 'Book', c1, c2, c3)
    if not os.path.exists(search_dir):
        return False
    return any(f.startswith(f'{book_id}-') and f.endswith('.json') for f in os.listdir(search_dir))


def create_book_file(data_root: str, book_id: str, book_data: dict, catalog_data: dict) -> str:
    """创建 Book JSON 文件，返回文件路径。"""
    title = book_data.get('title', '未命名')
    collection_id = catalog_data.get('collection_id', '')
    collection_title = catalog_data.get('title', '')
    resource_name = catalog_data.get('resource_name', '')
    volumes = book_data.get('volumes', [])

    # 构建 Book JSON
    book = {
        'id': book_id,
        'type': 'book',
        'title': title,
    }

    # work_id
    work_id = book_data.get('work_id')
    if work_id:
        book['work_id'] = work_id

    # contained_in
    contained_in_entry: dict = {'id': collection_id}
    if isinstance(volumes, list) and len(volumes) > 0:
        if isinstance(volumes[0], int):
            if len(volumes) == 1:
                contained_in_entry['volume_index'] = volumes[0]
            else:
                contained_in_entry['volume_range'] = [volumes[0], volumes[-1]]
    book['contained_in'] = [contained_in_entry]

    # edition
    edition = book_data.get('edition') or collection_title
    if edition:
        book['edition'] = edition

    # section
    section = book_data.get('section')
    if section:
        book['section'] = section

    # 构建路径
    prefix = book_id[:3]
    c1, c2, c3 = prefix[0], prefix[1], prefix[2]
    dir_path = os.path.join(data_root, 'Book', c1, c2, c3)
    os.makedirs(dir_path, exist_ok=True)

    # 文件名：清理 title 中的非法字符
    safe_title = title.replace('/', '·').replace('\\', '·').replace(':', '：').replace('?', '？').replace('"', '＂').replace('<', '＜').replace('>', '＞').replace('|', '｜').replace('*', '＊')
    file_name = f'{book_id}-{safe_title}.json'
    file_path = os.path.join(dir_path, file_name)

    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(book, f, ensure_ascii=False, indent=2)
        f.write('\n')

    return file_path


def update_index(data_root: str, book_id: str, book_data: dict, catalog_data: dict, file_path: str):
    """更新分片索引。"""
    # 计算分片
    h = 0
    for c in book_id:
        h = ((h * 31) + ord(c)) & 0xFFFFFFFF
    shard = h % 16

    shard_file = os.path.join(data_root, 'index', 'books', f'{shard:x}.json')
    shard_data = {}
    if os.path.exists(shard_file):
        with open(shard_file, encoding='utf-8') as f:
            shard_data = json.load(f)

    # 相对路径
    rel_path = os.path.relpath(file_path, data_root).replace('\\', '/')

    entry = {
        'id': book_id,
        'title': book_data.get('title', ''),
        'type': 'Book',
        'path': rel_path,
    }

    work_id = book_data.get('work_id')
    if work_id:
        entry['work_id'] = work_id

    edition = book_data.get('edition') or catalog_data.get('title', '')
    if edition:
        entry['edition'] = edition

    shard_data[book_id] = entry

    with open(shard_file, 'w', encoding='utf-8') as f:
        json.dump(shard_data, f, ensure_ascii=False, indent=2)
        f.write('\n')


def main():
    if len(sys.argv) < 2:
        print('用法: python -m book_index_manager.scripts.create_books_from_catalog <collection_id> [DATA_ROOT]')
        sys.exit(1)

    collection_id = sys.argv[1]
    if len(sys.argv) > 2:
        data_root = sys.argv[2]
    else:
        candidates = [
            os.path.join(os.getcwd(), 'book-index-draft'),
            'D:/workspace/book-index-draft',
        ]
        data_root = next((c for c in candidates if os.path.exists(c)), candidates[0])

    print(f'数据目录: {data_root}')
    print(f'Collection: {collection_id}')

    catalog_files = find_catalog_files(data_root, collection_id)
    if not catalog_files:
        print(f'错误: 未找到 {collection_id} 的 volume_book_mapping.json')
        sys.exit(1)

    total_created = 0
    total_skipped = 0

    for catalog_path in catalog_files:
        print(f'\n处理: {catalog_path}')
        with open(catalog_path, encoding='utf-8') as f:
            catalog_data = json.load(f)

        books = catalog_data.get('books', [])
        print(f'  目录条目: {len(books)}')

        for book in books:
            book_id = book.get('book_id')
            if not book_id:
                continue

            if book_file_exists(data_root, book_id):
                total_skipped += 1
                continue

            file_path = create_book_file(data_root, book_id, book, catalog_data)
            update_index(data_root, book_id, book, catalog_data, file_path)
            total_created += 1

        print(f'  创建: {total_created}, 已存在跳过: {total_skipped}')

    print(f'\n完成: 共创建 {total_created} 个 Book 文件')


if __name__ == '__main__':
    main()
