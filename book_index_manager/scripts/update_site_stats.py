"""
统计各在线资源网站在索引数据中的覆盖情况，更新 resource-site.json。

用法:
    python -m book_index_manager.scripts.update_site_stats [DATA_ROOT]

DATA_ROOT 默认为当前目录下的 book-index-draft，或通过参数指定。
"""

import json
import sys
import os
import glob
from pathlib import Path

# Windows 终端编码修复
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')  # type: ignore

# 资源 ID 前缀 → 站点 ID 映射
SITE_PREFIXES = {
    'ctext': 'ctext',
    'wikisource': 'wikisource',
    'shidianguji': 'shidianguji',
    'archive': 'archive',
    'nlc': 'nlc',
    'harvard': 'harvard',
}


def get_site(resource_id: str) -> str | None:
    """将资源 ID 映射到站点 ID。"""
    for prefix, site in sorted(SITE_PREFIXES.items(), key=lambda x: -len(x[0])):
        if resource_id == prefix or resource_id.startswith(prefix + '-'):
            return site
    return None


def count_site_resources(data_root: str) -> dict[str, dict[str, int]]:
    """
    扫描 Work/ 和 Book/ 目录，统计每个站点覆盖的实体数。

    返回: {site_id: {"works": N, "books": N}}
    """
    site_works: dict[str, set[str]] = {}
    site_books: dict[str, set[str]] = {}

    for type_dir in ['Work', 'Book']:
        base = os.path.join(data_root, type_dir)
        if not os.path.exists(base):
            continue
        for f in glob.glob(os.path.join(base, '**', '*.json'), recursive=True):
            # 跳过非实体文件
            if any(skip in f for skip in [
                'collated_edition', 'volume_book_mapping', '_catalog.json',
                'collated_edition_index', 'resource.json', 'resource-site.json',
                'recommended.json', 'index.json',
            ]):
                continue
            try:
                with open(f, encoding='utf-8') as fh:
                    data = json.load(fh)
                etype = data.get('type', '')
                eid = data.get('id', '')
                if not eid:
                    continue
                for r in data.get('resources', []):
                    rid = r.get('id', '')
                    if not rid:
                        continue
                    site = get_site(rid)
                    if not site:
                        continue
                    if etype == 'work':
                        site_works.setdefault(site, set()).add(eid)
                    elif etype == 'book':
                        site_books.setdefault(site, set()).add(eid)
            except (json.JSONDecodeError, OSError):
                continue

    result: dict[str, dict[str, int]] = {}
    all_sites = set(list(site_works.keys()) + list(site_books.keys()))
    for site in all_sites:
        result[site] = {
            'works': len(site_works.get(site, set())),
            'books': len(site_books.get(site, set())),
        }
    return result


def update_resource_site_json(data_root: str, stats: dict[str, dict[str, int]]) -> None:
    """更新 resource-site.json 中各站点的 imported 字段。"""
    site_file = os.path.join(data_root, 'resource-site.json')
    if not os.path.exists(site_file):
        print(f'  未找到 {site_file}，跳过')
        return

    with open(site_file, encoding='utf-8') as f:
        data = json.load(f)

    updated = 0
    for item in data.get('resources', []):
        site_id = item.get('id', '')
        if site_id in stats:
            site_stat = stats[site_id]
            new_imported = site_stat['works'] + site_stat['books']
            old_imported = item.get('imported', 0)
            if new_imported != old_imported:
                print(f'  {site_id}: {old_imported} → {new_imported} (works={site_stat["works"]}, books={site_stat["books"]})')
                item['imported'] = new_imported
                updated += 1
            else:
                print(f'  {site_id}: {new_imported} (unchanged)')

    if updated > 0:
        with open(site_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write('\n')
        print(f'\n已更新 {updated} 个站点的统计数据')
    else:
        print('\n所有统计数据已是最新')


def main():
    if len(sys.argv) > 1:
        data_root = sys.argv[1]
    else:
        # 默认查找
        candidates = [
            os.path.join(os.getcwd(), 'book-index-draft'),
            'D:/workspace/book-index-draft',
        ]
        data_root = next((c for c in candidates if os.path.exists(c)), candidates[0])

    print(f'数据目录: {data_root}')

    if not os.path.exists(data_root):
        print(f'错误: 目录不存在 {data_root}')
        sys.exit(1)

    print('正在统计各站点资源覆盖...')
    stats = count_site_resources(data_root)

    print(f'\n统计结果:')
    for site, s in sorted(stats.items(), key=lambda x: -(x[1]['works'] + x[1]['books'])):
        total = s['works'] + s['books']
        print(f'  {site:20s}  works={s["works"]:5d}  books={s["books"]:5d}  total={total:5d}')

    print(f'\n更新 resource-site.json...')
    update_resource_site_json(data_root, stats)


if __name__ == '__main__':
    main()
