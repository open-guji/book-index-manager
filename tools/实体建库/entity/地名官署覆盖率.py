#!/usr/bin/env python3
"""地名／官署覆盖率只读统计（docs/entity-build/覆盖率口径.md §3、§4）。

用法：python3 -I 地名官署覆盖率.py <book-index 路径> <book-index-draft 路径> [阈值T=20]

只读：读两仓 Entity/**/*.json；不写任何文件。
- 地名（旧口径）：分母＝草稿库 place 按 primary_name 去重数；分子＝其中在正式库 live place 有同名者
  （主名或 alt_names 命中）。
- 地名（新口径）：分母＝被 live 人物 native_place 引用、且（草稿或正式库已有同名地名，或引用人数≥T）的去重地名；
  分子＝其中在正式库 live place 有同名者。另给 T=10/20/50 的敏感度。
- 官署：分母＝草稿库 concrete 条 ∪ 正式库 live concrete 中主名不在草稿 concrete 内者（分子未必⊂草稿，
  并集才保证 分子≤分母）；分子＝正式库 live office_level=concrete 的条数。概念条（concept）不计。
live＝type=entity 且无 merged_into 的条目。
"""
import collections
import glob
import json
import os
import sys


def load_entities(repo):
    out = []
    for p in glob.glob(os.path.join(repo, "Entity", "**", "*.json"), recursive=True):
        try:
            with open(p, encoding="utf-8") as f:
                d = json.load(f)
        except Exception:
            continue
        if isinstance(d, dict) and d.get("type") == "entity" and not d.get("merged_into"):
            out.append(d)
    return out


def names_of(e):
    s = {e.get("primary_name")}
    for a in e.get("alt_names") or []:
        if isinstance(a, dict) and a.get("name"):
            s.add(a["name"])
        elif isinstance(a, str):
            s.add(a)
    s.discard(None)
    return s


def pct(a, b):
    return f"{a} / {b} = {100.0 * a / b:.1f}%" if b else f"{a} / 0"


def main(live_repo, draft_repo, t=20):
    live = load_entities(live_repo)
    draft = load_entities(draft_repo)

    live_place = [e for e in live if e.get("subtype") == "place"]
    draft_place = [e for e in draft if e.get("subtype") == "place"]
    live_place_names = set()
    for e in live_place:
        live_place_names |= names_of(e)
    draft_place_pn = {e["primary_name"] for e in draft_place if e.get("primary_name")}
    draft_place_all = set()
    for e in draft_place:
        draft_place_all |= names_of(e)

    # —— 地名旧口径
    old_num = sum(1 for n in draft_place_pn if n in live_place_names)
    print(f"[地名·旧口径] live place={len(live_place)}；草稿 place 去重名={len(draft_place_pn)}")
    print(f"  建档率：{pct(old_num, len(draft_place_pn))}（分子＝草稿去重名中正式库 live 有同名者）")
    print(f"  草稿未升格：{len(draft_place_pn) - old_num}")

    # —— 地名新口径
    np_cnt = collections.Counter()
    for e in live:
        if e.get("subtype") == "people":
            n = (e.get("native_place") or "").strip()
            if n:
                np_cnt[n] += 1
    known = live_place_names | draft_place_all
    print("[地名·新口径] 注：籍贯为自由文本、按名字全等匹配，未做别名／同名异地归并，结果为上界")
    print(f"[地名·新口径] live 人物有籍贯：{sum(np_cnt.values())} 条，去重名 {len(np_cnt)}")
    for tt in sorted({10, t, 50}):
        den = [n for n, c in np_cnt.items() if n in known or c >= tt]
        num = [n for n in den if n in live_place_names]
        tag = "（默认）" if tt == t else ""
        print(f"  T={tt}{tag}：{pct(len(num), len(den))}【上界】"
              f"（A 档 草稿/正式库已有且被引用 {sum(1 for n in np_cnt if n in known)}，"
              f"C 档 无草稿且≥T {sum(1 for n, c in np_cnt.items() if n not in known and c >= tt)}）")

    # —— 官署
    live_off = [e for e in live if e.get("subtype") == "office" and e.get("office_level") == "concrete"]
    draft_off = [e for e in draft if e.get("subtype") == "office" and e.get("office_level") == "concrete"]
    draft_off_names = set()
    for e in draft_off:
        draft_off_names |= names_of(e)
    in_draft = sum(1 for e in live_off if e.get("primary_name") in draft_off_names)
    concept_live = sum(1 for e in live if e.get("subtype") == "office" and e.get("office_level") == "concept")
    print(f"[官署] 草稿 concrete={len(draft_off)}；live concrete={len(live_off)}（另 live concept {concept_live}，不计）")
    extra = len(live_off) - in_draft
    den = len(draft_off) + extra
    print(f"  分母＝草稿 concrete {len(draft_off)} ＋ live 中不在草稿内者 {extra} ＝ {den}")
    print(f"  建档率：{pct(len(live_off), den)}")


if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) not in (2, 3):
        sys.exit(__doc__)
    main(a[0], a[1], int(a[2]) if len(a) == 3 else 20)
