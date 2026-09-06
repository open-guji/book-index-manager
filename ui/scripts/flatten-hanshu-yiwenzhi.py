#!/usr/bin/env python3
"""把《漢書藝文志》整理本从旧的嵌套结构改成全库通用的扁平结构。

    python scripts/flatten-hanshu-yiwenzhi.py            # 预演
    python scripts/flatten-hanshu-yiwenzhi.py --apply    # 真写

问题
----
book-text 61 部整理本里，只有這一部（d59f23o7ygw2）用舊的嵌套形態：
書目條塞在 `category` 節的 `works[]` 陣列裡；其餘 48 部都是扁平的
兄弟節（`type: "book"`）。前端只渲染扁平形態，於是這部書頁面上只剩
一列類名（易/書/詩/禮…），一條正文都不顯示。

轉換
----
把每個 category 節展開成一串兄弟節，與其他整理本一致：

    category（類名，保留 xiaoxu/total 等欄）
      ├ preface       ← 類序（原 xiaoxu）
      ├ book × N      ← 原 works[]（標題與 work_id）
      └ tally         ← 類末統計（原 total + total_notes）

**正文只取 `works[].entry`，不從 md 抓。** md 裡雖有更完整的條目文字
（含夾注），但兩份數據對不上——儒家類 json 58 條、md 50 條，順序不同，
按標題匹配也只有 45/58（內/内、弢/韜等異體，以及「劉向所序」拆條）。
按位置對齊會張冠李戴，那是造假不是遷移。故本次只做結構轉換：
把已有的 662 條書目、38 篇小序、38 條類末統計從嵌套裡放出來。
md 正文的併入是另一件事，須人工核對異體與拆條後再做。

安全措施
--------
- 預設預演；--apply 才寫
- work_id 原樣保留（那是人工/腳本匹配的成果，不可丟）
- 轉換後節數 = 類數 + 書條數 + 序數 + 統計數，逐卷打印供核對
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

WORK_DIR = Path("D:/workspace/book-text/Work/g/w/2/d59f23o7ygw2/collated_edition")



def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=str(WORK_DIR))
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    base = Path(args.dir)
    if not base.is_dir():
        print(f"目录不存在: {base}", file=sys.stderr)
        return 1

    print(f"整理本 {base}\n模式 {'写入' if args.apply else '预演'}\n")
    problems: list[str] = []
    tot_before = tot_after = 0

    for jf in sorted((base / "juan").glob("*.json")):
        obj = json.loads(jf.read_text(encoding="utf-8"))
        secs = obj.get("sections") or []
        if not any(isinstance(s, dict) and s.get("works") for s in secs):
            continue

        lue = obj.get("lue") or ""   # 仅用于日志
        new_secs: list[dict] = []
        for s in secs:
            if not isinstance(s, dict):
                new_secs.append(s)
                continue
            works = s.get("works") or []
            if not works:
                new_secs.append(s)
                continue

            cat = {k: v for k, v in s.items() if k not in ("works", "work_count", "xiaoxu", "total", "total_notes")}
            cat["type"] = "category"
            new_secs.append(cat)

            # 類序
            if s.get("xiaoxu"):
                new_secs.append({
                    "title": f"{s.get('title','')}類序",
                    "level": 3, "type": "preface", "content": s["xiaoxu"],
                })

            for w in works:
                sec = {
                    "title": w.get("entry", ""),
                    "level": 3, "type": "book",
                }
                if w.get("work_id"):
                    sec["work_id"] = w["work_id"]
                if w.get("page"):
                    sec["page"] = w["page"]
                new_secs.append(sec)

            # 類末統計
            if s.get("total"):
                content = s["total"]
                for n in (s.get("total_notes") or []):
                    content += f"\n⟨{n}⟩"
                new_secs.append({
                    "title": f"{s.get('title','')}類結語",
                    "level": 3, "type": "tally", "content": content,
                })

        tot_before += len(secs)
        tot_after += len(new_secs)
        kinds: dict[str, int] = {}
        for s in new_secs:
            kinds[s.get("type", "?")] = kinds.get(s.get("type", "?"), 0) + 1
        print(f"  {jf.name}  {lue}: {len(secs)} → {len(new_secs)} 节  {kinds}")

        if args.apply:
            obj["sections"] = new_secs
            jf.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n",
                          encoding="utf-8", newline="\n")

    print(f"\n合计 {tot_before} → {tot_after} 节")
    if problems:
        print(f"\n⚠ {len(problems)} 处需注意:")
        for p in problems[:20]:
            print("  " + p)
    if not args.apply:
        print("\n这是预演。确认无误后加 --apply。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
