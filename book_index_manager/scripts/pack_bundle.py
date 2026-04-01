"""
打包索引数据为 BundleStorage 可用的 JSON 文件。

输出结构:
    {output}/
    ├── index.json              # 全部索引条目（用于列表/搜索）
    ├── chunks/
    │   ├── CX.json             # 按 ID 前两位分组的详细数据
    │   ├── FC.json             # 包含：实体 JSON + collated_edition_index + volume_book_mapping
    │   └── GY.json
    ├── tiyao/
    │   ├── juan-001-010.json   # 整理本卷内容（每 10 卷一组）
    │   ├── juan-011-020.json
    │   ├── juanshou.json       # 卷首文件
    │   └── fulu.json           # 附录文件
    ├── resource.json           # 叢書目錄進度
    ├── resource-site.json      # 在線資源進度
    └── recommended.json        # 推薦數據

用法:
    python -m book_index_manager.scripts.pack_bundle [DATA_ROOT] [OUTPUT_DIR]
"""

import json
import sys
import os
import glob
import shutil

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')  # type: ignore

TIYAO_GROUP_SIZE = 10


def load_all_entities(data_root: str) -> dict[str, dict]:
    """加载所有 Work/Book/Collection JSON 文件，返回 {id: data}。"""
    entities: dict[str, dict] = {}
    for type_dir in ['Work', 'Book', 'Collection']:
        base = os.path.join(data_root, type_dir)
        if not os.path.exists(base):
            continue
        for f in glob.glob(os.path.join(base, '**', '*.json'), recursive=True):
            # 跳过非实体文件
            basename = os.path.basename(f)
            if not any(c in basename for c in ['-']):
                continue
            if any(skip in f.replace('\\', '/') for skip in [
                '/collated_edition/', '/volume_book_mapping', '_catalog.json',
            ]):
                continue
            try:
                with open(f, encoding='utf-8') as fh:
                    data = json.load(fh)
                eid = data.get('id', '')
                if eid:
                    entities[eid] = data
            except (json.JSONDecodeError, OSError):
                continue
    return entities


def load_index(data_root: str) -> dict:
    """从分片索引加载全部条目。"""
    index_dir = os.path.join(data_root, 'index')
    result: dict[str, dict] = {}

    # collections
    col_file = os.path.join(index_dir, 'collections.json')
    if os.path.exists(col_file):
        with open(col_file, encoding='utf-8') as f:
            result.update(json.load(f))

    # sharded books/works
    for type_key in ['books', 'works']:
        shard_dir = os.path.join(index_dir, type_key)
        if not os.path.exists(shard_dir):
            continue
        for shard_file in sorted(os.listdir(shard_dir)):
            if shard_file.endswith('.json'):
                with open(os.path.join(shard_dir, shard_file), encoding='utf-8') as f:
                    result.update(json.load(f))

    return result


def find_collated_files(data_root: str) -> dict[str, dict[str, str]]:
    """
    查找所有整理本文件。
    返回 {work_id: {filename: filepath}}
    """
    result: dict[str, dict[str, str]] = {}
    for type_dir in ['Work']:
        base = os.path.join(data_root, type_dir)
        if not os.path.exists(base):
            continue
        for idx_file in glob.glob(os.path.join(base, '**', 'collated_edition_index.json'), recursive=True):
            work_dir = os.path.dirname(idx_file)
            work_id = os.path.basename(work_dir)
            collated_dir = os.path.join(work_dir, 'collated_edition')
            if not os.path.exists(collated_dir):
                continue

            files: dict[str, str] = {}
            # index file
            files['collated_edition_index'] = idx_file
            # juan files
            for jf in sorted(os.listdir(collated_dir)):
                if jf.endswith('.json'):
                    files[jf] = os.path.join(collated_dir, jf)
            result[work_id] = files
    return result


def find_catalog_files(data_root: str) -> dict[str, list[tuple[str, str]]]:
    """
    查找所有 volume_book_mapping.json。
    返回 {collection_id: [(resource_id, filepath)]}
    """
    result: dict[str, list[tuple[str, str]]] = {}
    base = os.path.join(data_root, 'Collection')
    if not os.path.exists(base):
        return result
    for f in glob.glob(os.path.join(base, '**', 'volume_book_mapping.json'), recursive=True):
        parts = f.replace('\\', '/').split('/')
        # .../Collection/F/C/m/FCxxx/resourceId/volume_book_mapping.json
        resource_id = parts[-2]
        collection_id = parts[-3]
        result.setdefault(collection_id, []).append((resource_id, f))
    return result


def pack_chunks(entities: dict[str, dict], collated: dict, catalogs: dict, output_dir: str):
    """打包 chunks/{prefix}.json — 每个文件包含以 prefix 开头的所有实体数据。"""
    chunks_dir = os.path.join(output_dir, 'chunks')
    os.makedirs(chunks_dir, exist_ok=True)

    # 按前两位字符分组
    groups: dict[str, dict[str, object]] = {}
    for eid, data in entities.items():
        prefix = eid[:2]
        groups.setdefault(prefix, {})[eid] = data

    # 注入 collated_edition_index
    for work_id, files in collated.items():
        prefix = work_id[:2]
        groups.setdefault(prefix, {})
        if 'collated_edition_index' in files:
            try:
                with open(files['collated_edition_index'], encoding='utf-8') as f:
                    groups[prefix][f'{work_id}/collated_edition_index'] = json.load(f)
            except (json.JSONDecodeError, OSError):
                pass

    # 注入 volume_book_mapping
    for col_id, res_list in catalogs.items():
        prefix = col_id[:2]
        groups.setdefault(prefix, {})
        for resource_id, filepath in res_list:
            try:
                with open(filepath, encoding='utf-8') as f:
                    groups[prefix][f'{col_id}/{resource_id}/volume_book_mapping'] = json.load(f)
            except (json.JSONDecodeError, OSError):
                pass

    for prefix, data in groups.items():
        with open(os.path.join(chunks_dir, f'{prefix}.json'), 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))

    print(f'  chunks: {len(groups)} 个文件')


def pack_tiyao(collated: dict, output_dir: str):
    """打包整理本卷内容。"""
    tiyao_dir = os.path.join(output_dir, 'tiyao')
    os.makedirs(tiyao_dir, exist_ok=True)

    # 按组打包 juan 文件
    juan_groups: dict[str, dict[str, object]] = {}  # group_key -> {filename: data}
    special_files: dict[str, dict[str, object]] = {}  # special files (juanshou, fulu)

    for work_id, files in collated.items():
        for filename, filepath in files.items():
            if filename == 'collated_edition_index':
                continue

            try:
                with open(filepath, encoding='utf-8') as f:
                    data = json.load(f)
            except (json.JSONDecodeError, OSError):
                continue

            name = filename.replace('.json', '')

            # 判断文件类型
            match_juan = None
            import re
            m = re.match(r'juan(\d+)', name)
            if m:
                match_juan = int(m.group(1))

            if match_juan is not None:
                # 普通卷 → 按 10 卷分组
                group = ((match_juan - 1) // TIYAO_GROUP_SIZE) * TIYAO_GROUP_SIZE + 1
                start = group
                end = group + TIYAO_GROUP_SIZE - 1
                pad = lambda n: str(n).zfill(3)
                group_key = f'juan-{pad(start)}-{pad(end)}'
                juan_groups.setdefault(group_key, {})[filename] = data
            else:
                # 特殊文件（juanshou*, fulu 等）→ 按类型分组
                if name.startswith('juanshou'):
                    special_files.setdefault('juanshou', {})[filename] = data
                elif name == 'fulu':
                    special_files.setdefault('fulu', {})[filename] = data
                else:
                    special_files.setdefault('other', {})[filename] = data

    # 写入分组文件
    for group_key, data in juan_groups.items():
        with open(os.path.join(tiyao_dir, f'{group_key}.json'), 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))

    # 写入特殊文件
    for special_key, data in special_files.items():
        with open(os.path.join(tiyao_dir, f'{special_key}.json'), 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))

    total = len(juan_groups) + len(special_files)
    print(f'  tiyao: {total} 个文件 (卷组={len(juan_groups)}, 特殊={len(special_files)})')


def copy_standalone_files(data_root: str, output_dir: str):
    """复制独立 JSON 文件（resource.json, resource-site.json, recommended.json 等）。"""
    standalone = ['resource.json', 'resource-site.json', 'recommended.json']
    copied = 0
    for name in standalone:
        src = os.path.join(data_root, name)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(output_dir, name))
            copied += 1
    print(f'  独立文件: {copied} 个')


def pack_index(index_data: dict, output_dir: str):
    """写入 index.json。"""
    entries = list(index_data.values())
    with open(os.path.join(output_dir, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(entries, f, ensure_ascii=False, separators=(',', ':'))
    print(f'  index.json: {len(entries)} 条目')


def main():
    if len(sys.argv) > 1:
        data_root = sys.argv[1]
    else:
        data_root = 'D:/workspace/book-index-draft'

    if len(sys.argv) > 2:
        output_dir = sys.argv[2]
    else:
        output_dir = os.path.join(data_root, '_bundle')

    print(f'数据目录: {data_root}')
    print(f'输出目录: {output_dir}')

    if os.path.exists(output_dir):
        shutil.rmtree(output_dir)
    os.makedirs(output_dir)

    print('\n加载数据...')
    entities = load_all_entities(data_root)
    print(f'  实体: {len(entities)}')

    index_data = load_index(data_root)
    print(f'  索引条目: {len(index_data)}')

    collated = find_collated_files(data_root)
    print(f'  整理本: {len(collated)} 个作品')

    catalogs = find_catalog_files(data_root)
    print(f'  丛编目录: {len(catalogs)} 个丛编')

    print('\n打包...')
    pack_chunks(entities, collated, catalogs, output_dir)
    pack_tiyao(collated, output_dir)
    pack_index(index_data, output_dir)
    copy_standalone_files(data_root, output_dir)

    # 统计输出大小
    total_size = 0
    for dirpath, _, filenames in os.walk(output_dir):
        for f in filenames:
            total_size += os.path.getsize(os.path.join(dirpath, f))
    print(f'\n完成！总大小: {total_size / 1024 / 1024:.1f} MB')


if __name__ == '__main__':
    main()
