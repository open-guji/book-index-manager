#!/usr/bin/env python3
"""Migrate index.json -> sharded index files under index/ directory."""

import json
import sys
from pathlib import Path

NUM_SHARDS = 16


def shard_of(id_str: str, n: int = NUM_SHARDS) -> int:
    h = 0
    for c in id_str:
        h = ((h * 31) + ord(c)) & 0xFFFFFFFF
    return h % n


def main():
    root = Path(__file__).resolve().parent.parent
    index_file = root / "index.json"

    if not index_file.exists():
        print(f"Error: {index_file} not found")
        sys.exit(1)

    with open(index_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    index_dir = root / "index"

    # collections — single file
    col_dir = index_dir
    col_dir.mkdir(parents=True, exist_ok=True)
    collections = data.get("collections", {})
    with open(col_dir / "collections.json", "w", encoding="utf-8") as f:
        json.dump(collections, f, indent=2, ensure_ascii=False)
    print(f"collections: {len(collections)} entries -> index/collections.json")

    # books and works — 16 shards each
    total = len(collections)
    for type_key in ["books", "works"]:
        type_dir = index_dir / type_key
        type_dir.mkdir(parents=True, exist_ok=True)

        shards = {i: {} for i in range(NUM_SHARDS)}
        section = data.get(type_key, {})
        for id_str, entry in section.items():
            shards[shard_of(id_str)][id_str] = entry

        for shard_num, shard_data in shards.items():
            shard_file = type_dir / f"{shard_num:x}.json"
            with open(shard_file, "w", encoding="utf-8") as f:
                json.dump(shard_data, f, indent=2, ensure_ascii=False)

        counts = [len(shards[i]) for i in range(NUM_SHARDS)]
        total += sum(counts)
        print(f"{type_key}: {sum(counts)} entries -> 16 shards (min={min(counts)}, max={max(counts)})")

    print(f"\nTotal: {total} entries migrated")
    print(f"Old index.json kept at {index_file} — delete manually after verifying")


if __name__ == "__main__":
    main()
