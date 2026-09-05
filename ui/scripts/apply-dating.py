#!/usr/bin/env python3
"""把生成好的 dating 批量写入 book-index 数据仓（Phase B 第二步）。

方案见 overview/项目进展/古籍索引网站/整体设计/2026-09-刊刻年代方案.md

    # 先预演，不写任何文件
    python scripts/apply-dating.py --dry-run

    # 确认无误后真写
    python scripts/apply-dating.py --apply

为什么直接写文件而不走 `book-index save`
------------------------------------------
`save` 是覆盖式写入 + 逐条更新索引，20k 条要跑很久。而索引条目
（entry_extractor.build_index_entry）只取 id/title/type/path/author/
year/holder/dynasty/juan_count/... —— **其中 year 只读 publication_info**，
不读 dating。也就是说新增 dating 字段**完全不影响索引**，
直接改 JSON 是安全的。

写完仍需 `book-index check-index` 复核（脚本会提示），确保没有意外。

安全措施
--------
- 默认 --dry-run，必须显式 --apply 才写
- 只增不改：已有 dating 且 source=manual 的跳过
- 不动 revision / revised_at（按要求不 bump 版本）
- 保持原文件的键序：dating 插在 publication_info 之后，没有就放 type 之后
- UTF-8 + LF + 尾随换行，与仓库现有风格一致（避免全库 CRLF 噪音）
- 逐条比对写入前后，只有 dating 一个键有差异才落盘
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ITEM_FILE_SUFFIX = ".json"


def load_dating(path: Path) -> dict:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def iter_book_files(root: Path):
    """遍历 Book 下的顶层 item 文件 `<id>-<title>.json`。"""
    book_dir = root / "Book"
    for dirpath, _dirnames, filenames in os.walk(book_dir):
        for fn in filenames:
            if not fn.endswith(ITEM_FILE_SUFFIX):
                continue
            # 跳过 collated_edition/ full_text/ 等子目录里的辅助文件
            if "-" not in fn:
                continue
            yield Path(dirpath) / fn


def insert_dating(meta: dict, dating: dict) -> dict:
    """把 dating 插进 metadata，保持一个稳定的键序。

    放在 publication_info 之后（语义相邻）；没有该键就放 type 之后。
    dict 在 py3.7+ 保序，重建一个新 dict 即可。
    """
    if "dating" in meta:
        # 已有：原地替换，键序不变
        out = dict(meta)
        out["dating"] = dating
        return out

    anchor = "publication_info" if "publication_info" in meta else "type"
    out: dict = {}
    placed = False
    for k, v in meta.items():
        out[k] = v
        if k == anchor:
            out["dating"] = dating
            placed = True
    if not placed:
        out["dating"] = dating
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="批量写入 dating 字段")
    ap.add_argument("--root", default="D:/workspace/book-index", help="数据仓根目录")
    ap.add_argument("--dating", default=None, help="dating.json 路径")
    ap.add_argument("--apply", action="store_true", help="真正写入（默认只预演）")
    ap.add_argument("--limit", type=int, default=0, help="只处理前 N 条（调试用）")
    args = ap.parse_args()

    root = Path(args.root)
    dating_path = Path(args.dating) if args.dating else Path(__file__).parent.parent / "dating.json"

    if not root.is_dir():
        print(f"数据仓不存在: {root}", file=sys.stderr)
        return 1
    if not dating_path.is_file():
        print(f"dating.json 不存在: {dating_path}", file=sys.stderr)
        return 1

    dating = load_dating(dating_path)
    print(f"数据仓   {root}")
    print(f"dating   {dating_path}  ({len(dating)} 条)")
    print(f"模式     {'写入' if args.apply else '预演（不写文件）'}")
    print()

    stats = {
        "scanned": 0, "matched": 0, "written": 0,
        "skip_manual": 0, "skip_same": 0, "no_dating": 0, "errors": 0,
    }
    samples: list[str] = []

    for path in iter_book_files(root):
        stats["scanned"] += 1
        if args.limit and stats["matched"] >= args.limit:
            break
        try:
            raw = path.read_text(encoding="utf-8")
            meta = json.loads(raw)
        except Exception as e:  # noqa: BLE001
            stats["errors"] += 1
            print(f"  读取失败 {path.name}: {e}", file=sys.stderr)
            continue

        if not isinstance(meta, dict) or meta.get("type") != "book":
            continue
        item_id = meta.get("id")
        if not item_id or item_id not in dating:
            stats["no_dating"] += 1
            continue

        stats["matched"] += 1
        existing = meta.get("dating")
        if isinstance(existing, dict) and existing.get("source") == "manual":
            stats["skip_manual"] += 1
            continue
        if existing == dating[item_id]:
            stats["skip_same"] += 1
            continue

        out = insert_dating(meta, dating[item_id])

        # 只允许 dating 一个键有差异——防止序列化把别的字段改了
        before = {k: v for k, v in meta.items() if k != "dating"}
        after = {k: v for k, v in out.items() if k != "dating"}
        if before != after:
            stats["errors"] += 1
            print(f"  ✗ {item_id} 除 dating 外还有差异，跳过", file=sys.stderr)
            continue

        if len(samples) < 5:
            d = dating[item_id]
            samples.append(
                f"  {item_id}  {d.get('era','')}{d.get('reign','')} "
                f"{d.get('year', d.get('year_range',''))}  「{meta.get('edition') or meta.get('title')}」")

        if args.apply:
            # LF + 尾随换行，与仓库风格一致；ensure_ascii=False 保中文
            text = json.dumps(out, ensure_ascii=False, indent=2) + "\n"
            path.write_text(text, encoding="utf-8", newline="\n")
        stats["written"] += 1

    print("═══ 结果 ═══")
    print(f"扫描文件      {stats['scanned']}")
    print(f"匹配到 dating {stats['matched']}")
    print(f"  将写入      {stats['written']}")
    print(f"  跳过·相同   {stats['skip_same']}")
    print(f"  跳过·人工   {stats['skip_manual']}")
    print(f"无 dating     {stats['no_dating']}")
    print(f"错误          {stats['errors']}")
    if samples:
        print("\n样例：")
        print("\n".join(samples))
    if not args.apply:
        print("\n这是预演。确认无误后加 --apply 真正写入。")
    else:
        print("\n写入完成。请复核：")
        print("  book-index check-index --status official")
        print("  git -C {} diff --stat | tail -3".format(root))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
