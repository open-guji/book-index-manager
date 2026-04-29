"""
扫描 Work/ 目录，把 has_collated 字段写回 index/works/*.json 分片。

dev server (vite-plugin-api.ts) 启动时不再逐条 fs.existsSync，列表/统计接口
直接读索引里的 has_collated。每次新增/删除 collated_edition 目录后跑一次即可。

用法:
    python -m book_index_manager.scripts.update_has_collated [DATA_ROOT]

DATA_ROOT 默认为 ./book-index-draft，或回退到 D:/workspace/book-index-draft。
"""

import json
import os
import sys
from pathlib import Path

from ..storage import shard_of, NUM_SHARDS

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')  # type: ignore


def scan_collated_works(work_root: Path) -> set[str]:
    """扫描 Work/c1/c2/c3/<id>/collated_edition，返回有整理本的 work id 集合。"""
    found: set[str] = set()
    if not work_root.exists():
        return found
    # 三级散列目录：Work/<c1>/<c2>/<c3>/<id>/collated_edition
    for c1 in work_root.iterdir():
        if not c1.is_dir():
            continue
        for c2 in c1.iterdir():
            if not c2.is_dir():
                continue
            for c3 in c2.iterdir():
                if not c3.is_dir():
                    continue
                for entry in c3.iterdir():
                    # entry 既可能是 <id>-<title>.json，也可能是 <id>/ 目录
                    if entry.is_dir() and (entry / 'collated_edition').is_dir():
                        found.add(entry.name)
    return found


def update_shards(data_root: Path, collated_ids: set[str]) -> tuple[int, int]:
    """根据 collated_ids 更新 index/works/*.json。返回 (新增, 移除) 计数。"""
    shard_dir = data_root / 'index' / 'works'
    if not shard_dir.exists():
        print(f'  跳过：{shard_dir} 不存在')
        return 0, 0

    added = 0
    removed = 0

    for shard_idx in range(NUM_SHARDS):
        shard_path = shard_dir / f'{shard_idx:x}.json'
        if not shard_path.exists():
            continue
        with shard_path.open(encoding='utf-8') as f:
            shard = json.load(f)

        dirty = False
        for wid, entry in shard.items():
            should_have = wid in collated_ids
            current = bool(entry.get('has_collated'))
            if should_have and not current:
                entry['has_collated'] = True
                dirty = True
                added += 1
            elif not should_have and current:
                entry.pop('has_collated', None)
                dirty = True
                removed += 1

        if dirty:
            with shard_path.open('w', encoding='utf-8') as f:
                json.dump(shard, f, ensure_ascii=False, indent=2)
                f.write('\n')

    return added, removed


def main():
    if len(sys.argv) > 1:
        data_root = Path(sys.argv[1])
    else:
        candidates = [
            Path.cwd() / 'book-index-draft',
            Path('D:/workspace/book-index-draft'),
        ]
        data_root = next((c for c in candidates if c.exists()), candidates[0])

    print(f'数据目录: {data_root}')
    if not data_root.exists():
        print(f'错误: 目录不存在 {data_root}')
        sys.exit(1)

    work_root = data_root / 'Work'
    print(f'扫描 {work_root} ...')
    collated_ids = scan_collated_works(work_root)
    print(f'  发现 {len(collated_ids)} 个有 collated_edition 的 Work')

    # 校验 shard 分布（仅打印，不影响执行）
    shard_counts: dict[int, int] = {}
    for wid in collated_ids:
        shard_counts[shard_of(wid)] = shard_counts.get(shard_of(wid), 0) + 1
    if shard_counts:
        print(f'  分片分布: {dict(sorted(shard_counts.items()))}')

    print('\n更新 index/works/*.json ...')
    added, removed = update_shards(data_root, collated_ids)
    if added or removed:
        print(f'  新增 has_collated: {added}, 移除（已不存在）: {removed}')
    else:
        print('  无变化')


if __name__ == '__main__':
    main()
