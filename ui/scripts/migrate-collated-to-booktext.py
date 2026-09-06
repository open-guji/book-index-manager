#!/usr/bin/env python3
"""把 book-index 里误建的整理本搬到 book-text，并归一到现行形态。

    python scripts/migrate-collated-to-booktext.py            # 预演
    python scripts/migrate-collated-to-booktext.py --apply    # 真搬

背景
----
2026-08-26 拆仓后定的规则：两个元数据仓（book-index / book-index-draft）之下
**再无资产目录**，collated_edition/ 一律进 book-text。kaiyuanguji-web 的
bundle-data.mjs 只从 TEXT_DIR 收资产，写进 book-index 的整理本它根本不看——
于是 has_collated 标记有、tab 出得来、点进去「未找到整理本数据」，线上 404。

2026-09-03 起新建的一批補志整理本三条全违反：错仓、中文 type、旧文件名。
本脚本一次性纠正，三件事同时做：

1. 搬仓        book-index/Work/../{id}/collated_edition → book-text 同路径
2. 归一形态    collated_edition_index.json → index.json
               中文卷名 → juan/NNN.json（原名存 juan_files_original，
               与 book-text 既有 46/48 部的做法一致）
               删 total_juan（口径混乱、无人维护，2026-09-03 已从数据和类型里删）
3. 归一词汇    section.type 中文 → 英文枚举（见 TYPE_MAP）

text/*.md 一并搬；_working/ 是工作数据不是发布内容，也搬（保持整体性）。

安全措施
--------
- 默认预演，必须显式 --apply
- 目标已存在同名文件时**不覆盖**，报错并跳过整部（d59f2mel8d1c 在两仓都有，
  book-text 侧是真数据、book-index 侧只有 _working/，故只搬 _working/）
- 搬完逐条比对 section 数与 type 分布，数目对不上就报错
- 不动 book-index 的条目 JSON 本身（只删 collated_edition 目录）
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from collections import Counter
from pathlib import Path

# 2026-08-26 英文枚举迁移的映射表。
# 见 overview/项目进展/古籍索引网站/整体设计/2026-08-section-type-英文枚举迁移.md
TYPE_MAP = {
    "书": "book", "書": "book",
    "类": "category", "類": "category",
    "结语": "tally", "結語": "tally",
    "考证": "verification", "考證": "verification",
    "序": "preface", "部": "preface",
    "论": "comment", "論": "comment",
    "文": "prose", "詩": "poem", "诗": "poem",
    "其他": "page_header",
}

INDEX_OLD = "collated_edition_index.json"
INDEX_NEW = "index.json"


def norm_type(t):
    """中文 → 英文枚举；已是英文或未知值原样返回（宁可露出也不吞掉）。"""
    if not isinstance(t, str):
        return t
    return TYPE_MAP.get(t, t)


def convert_sections(obj) -> int:
    """就地把 sections[].type 转英文，返回改动的节数。"""
    n = 0
    secs = obj.get("sections") if isinstance(obj, dict) else (obj if isinstance(obj, list) else None)
    for s in (secs or []):
        if not isinstance(s, dict):
            continue
        t = s.get("type")
        new = norm_type(t)
        if new != t:
            s["type"] = new
            n += 1
        # 嵌套子节（部分整理本有 children/sections）
        for key in ("children", "sections"):
            if isinstance(s.get(key), list):
                n += convert_sections({"sections": s[key]})
    return n


def dump(path: Path, obj) -> None:
    """UTF-8 + LF + 尾随换行 + indent=2，与两仓现有风格一致。"""
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8", newline="\n")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--index-root", default="D:/workspace/book-index")
    ap.add_argument("--text-root", default="D:/workspace/book-text")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    idx_root, txt_root = Path(args.index_root), Path(args.text_root)
    for p in (idx_root, txt_root):
        if not p.is_dir():
            print(f"仓不存在: {p}", file=sys.stderr)
            return 1

    dirs = sorted(idx_root.glob("Work/*/*/*/*/collated_edition"))
    print(f"源仓 {idx_root}\n目标 {txt_root}")
    print(f"待搬整理本 {len(dirs)} 部｜模式 {'写入' if args.apply else '预演'}\n")

    tot = Counter()
    problems: list[str] = []

    for src in dirs:
        wid = src.parent.name
        rel = src.relative_to(idx_root)
        dst = txt_root / rel
        # 源里的 .json（排除清单档）与 .md
        juans = sorted(p for p in src.rglob("*.json")
                       if p.name != INDEX_OLD and "_working" not in p.parts)
        working = sorted(p for p in src.rglob("*") if "_working" in p.parts and p.is_file())
        mds = sorted(src.rglob("*.md"))
        idx_file = src / INDEX_OLD

        # 目标冲突检查：book-text 已有正式内容的，只搬 _working/
        dst_has_real = (dst / INDEX_NEW).exists() or (dst / "juan").is_dir()
        if dst_has_real and juans:
            problems.append(f"{wid}: book-text 已有正式整理本，源仓却也有 {len(juans)} 个卷文件——需人工判断")
            continue

        # 中文卷名 → juan/NNN.json，原名留档
        rename: dict[str, str] = {}
        if juans:
            order = [p.name for p in juans]
            if idx_file.exists():
                try:
                    declared = json.loads(idx_file.read_text(encoding="utf-8")).get("juan_files") or []
                    # 以清单档的顺序为准（那是整理时定的卷次），漏的补在后面
                    order = [f for f in declared if (src / f).exists()]
                    order += [p.name for p in juans if p.name not in order]
                except Exception:
                    pass
            for i, name in enumerate(order, 1):
                rename[name] = f"juan/{i:03d}.json"

        sec_before = Counter()
        sec_after = Counter()
        converted = 0

        print(f"  {wid}  卷 {len(juans)}｜md {len(mds)}｜_working {len(working)}"
              + ("  ← 目标已有正式内容，只搬 _working/" if dst_has_real else ""))

        # ── 卷文件：转 type + 改名 ──
        for p in juans:
            try:
                obj = json.loads(p.read_text(encoding="utf-8"))
            except Exception as e:
                problems.append(f"{wid}/{p.name}: 读取失败 {e}")
                continue
            secs = obj.get("sections") if isinstance(obj, dict) else (obj if isinstance(obj, list) else [])
            for s in (secs or []):
                if isinstance(s, dict) and s.get("type"):
                    sec_before[s["type"]] += 1
            converted += convert_sections(obj)
            for s in (secs or []):
                if isinstance(s, dict) and s.get("type"):
                    sec_after[s["type"]] += 1
            if args.apply:
                out = dst / rename[p.name]
                out.parent.mkdir(parents=True, exist_ok=True)
                dump(out, obj)

        # ── 清单档：改名 + juan_files 重写 + 删 total_juan ──
        if idx_file.exists() and not dst_has_real:
            try:
                idx = json.loads(idx_file.read_text(encoding="utf-8"))
            except Exception as e:
                problems.append(f"{wid}/{INDEX_OLD}: 读取失败 {e}")
                idx = None
            if idx is not None:
                original = idx.get("juan_files") or []
                idx["juan_files"] = [rename[n] for n in original if n in rename]
                if original:
                    idx["juan_files_original"] = original
                # total_juan：口径混乱、无人维护，2026-09-03 已从数据和类型里删
                idx.pop("total_juan", None)
                idx.setdefault("type", "catalog")  # 這批全是補志書目
                # juan_groups 里的文件名同步改
                for g in (idx.get("juan_groups") or []):
                    if isinstance(g, dict) and isinstance(g.get("files"), list):
                        g["files"] = [rename.get(f, f) for f in g["files"]]
                if args.apply:
                    dst.mkdir(parents=True, exist_ok=True)
                    dump(dst / INDEX_NEW, idx)

        # ── text/*.md 与 _working/ 原样搬 ──
        for p in mds + working:
            relp = p.relative_to(src)
            if args.apply:
                out = dst / relp
                out.parent.mkdir(parents=True, exist_ok=True)
                if out.exists():
                    problems.append(f"{wid}/{relp}: 目标已存在，跳过")
                    continue
                shutil.copy2(p, out)

        if sec_before != sec_after and sum(sec_before.values()) != sum(sec_after.values()):
            problems.append(f"{wid}: 节数对不上 {sum(sec_before.values())} → {sum(sec_after.values())}")

        tot["juan"] += len(juans)
        tot["md"] += len(mds)
        tot["working"] += len(working)
        tot["converted"] += converted
        for k, v in sec_before.items():
            tot[f"src:{k}"] += v

        # ── 源目录删除 ──
        if args.apply and not dst_has_real:
            shutil.rmtree(src)
        elif args.apply and dst_has_real:
            # 只搬了 _working/，把它删掉即可
            for w in working:
                w.unlink(missing_ok=True)
            shutil.rmtree(src, ignore_errors=True)

    print("\n═══ 汇总 ═══")
    print(f"卷文件 {tot['juan']}｜md {tot['md']}｜_working {tot['working']}")
    print(f"type 转换 {tot['converted']} 节")
    print("源 type 分布: " + ", ".join(
        f"{k[4:]}={v}" for k, v in sorted(tot.items()) if k.startswith("src:")))
    if problems:
        print(f"\n⚠ 需注意 {len(problems)} 处:")
        for p in problems[:20]:
            print("  " + p)
    if not args.apply:
        print("\n这是预演。确认无误后加 --apply。")
    else:
        print("\n搬迁完成。请复核：")
        print("  book-index: git status（应只有 collated_edition 目录被删）")
        print("  book-text:  git status（应只有新增）")
        print("  book-index check-index --root /d/workspace --target official")
    return 1 if problems and args.apply else 0


if __name__ == "__main__":
    raise SystemExit(main())
