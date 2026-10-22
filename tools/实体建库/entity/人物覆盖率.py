#!/usr/bin/env python3
"""人物覆盖率只读统计（总计划第四节人物口径）。

用法：python3 -I 人物覆盖率.py <book-index 仓库路径> [未链接清单.tsv]
  例：python3 -I 人物覆盖率.py /path/to/book-index /tmp/unlinked.tsv

只读：只读取仓库里的 Entity/*.json 与 Work/*.json；可选的 tsv 参数是本机输出路径，
写出「未链接的多作品作者」清单（剔非人名后），按出现 Work 数降序，列为：名字、Work 数。

口径（10-14 用户简化口径）：
- 分母：多作品作者，即在 ≥2 部 Work 的 authors[] 中出现的名字（按名字符串去重），
  再剔除非人名（占位词、官撰类、机构），见 classify()。
- 建档率：分母中，名字已链到 live（未墓碑）的 people Entity 的比例。
  链接方法：取该名下出现次数最多的 entity_id，核对其为 live people。
- CBDB 对齐率（参考，分母为全分母）：上一项中 Entity 带 cbdb_id 的比例。
- 别名归并（参考）：名字形如「甲·乙」且「乙」唯一对应一个 live 人物（primary_name 或 alt_names）时，
  视为已链接，单列一行。
"""
import collections
import glob
import json
import os
import re
import sys


def load(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


PLACEHOLDER = {
    "佚名", "佚名氏", "不著編人", "不著撰人", "無名氏", "失名", "作者未詳", "撰人不詳",
    "未詳", "不詳", "佚", "無名", "佚名編", "編者", "校者", "注者", "譯者", "纂", "編",
    "撰", "佚名撰",
}
OFFICIAL = re.compile(r"^(官撰|御撰|敕撰|奉敕撰|欽定|御定|官修|敕修|奉敕|御纂|御選|御製)")
EXPLICIT_INST = {"學部", "欽天監"}
INST_SUFFIX = (
    "館", "局", "社", "署", "書院", "大學", "學校", "書店", "出版社", "公司",
    "委員會", "研究所", "研究院", "圖書館", "學部", "書局", "衙門",
)
INST_INFIX = ("書局", "編譯", "出版社", "委員會", "圖書館", "研究所")


def classify(name):
    """返回非人名类别，人名返回 None。"""
    if name in PLACEHOLDER:
        return "placeholder"
    if OFFICIAL.search(name):
        return "official"
    if name in EXPLICIT_INST:
        return "institution"
    if name.endswith(INST_SUFFIX) or any(s in name for s in INST_INFIX):
        return "institution"
    return None


def main(repo, tsv_path=None):
    entity_dir = os.path.join(repo, "Entity")
    work_dir = os.path.join(repo, "Work")

    ents = {}
    for p in glob.glob(os.path.join(entity_dir, "**", "*.json"), recursive=True):
        d = load(p)
        if d and d.get("type") == "entity":
            ents[d["id"]] = d
    live_ppl = {k: v for k, v in ents.items()
                if v.get("subtype") == "people" and not v.get("merged_into")}

    name_works = collections.defaultdict(set)
    name_eid = collections.defaultdict(collections.Counter)
    for p in glob.glob(os.path.join(work_dir, "**", "*.json"), recursive=True):
        d = load(p)
        if not d or d.get("type") != "work":
            continue
        for a in d.get("authors") or []:
            if not isinstance(a, dict) or not a.get("name"):
                continue
            name_works[a["name"]].add(d["id"])
            if a.get("entity_id"):
                name_eid[a["name"]][a["entity_id"]] += 1

    alt_idx = collections.defaultdict(set)
    pn_idx = collections.defaultdict(set)
    for k, v in live_ppl.items():
        pn_idx[v.get("primary_name")].add(k)
        for a in v.get("alt_names") or []:
            if isinstance(a, dict) and a.get("name"):
                alt_idx[a["name"]].add(k)

    def linked_eid(name):
        if name_eid.get(name):
            eid = name_eid[name].most_common(1)[0][0]
            e = ents.get(eid)
            if e and e.get("subtype") == "people" and not e.get("merged_into"):
                return eid
        return None

    multi = [n for n, ws in name_works.items() if len(ws) >= 2]
    cls = collections.Counter()
    excluded = set()
    for n in multi:
        c = classify(n)
        if c:
            cls[c] += 1
            excluded.add(n)
    denom = [n for n in multi if n not in excluded]

    linked = [n for n in denom if linked_eid(n)]
    unlinked = [n for n in denom if not linked_eid(n)]
    with_cbdb = [n for n in linked
                 if (ents[linked_eid(n)].get("external_ids") or {}).get("cbdb_id")]

    alias_hit = []
    for n in unlinked:
        if "·" not in n:
            continue
        cand = n.split("·")[-1]
        s = pn_idx.get(cand, set()) | alt_idx.get(cand, set())
        if len(s) == 1:
            alias_hit.append(n)

    den = len(denom)

    def pct(x):
        return 100.0 * x / den if den else 0.0

    print(f"多作品作者名（≥2 部 Work）：{len(multi)}")
    print(f"剔除非人名：{len(excluded)}  {dict(cls)}")
    print(f"分母：{den}")
    print(f"建档率（已链到 live 人物）：{len(linked)} / {den} = {pct(len(linked)):.1f}%")
    print(f"CBDB 对齐率（参考，占分母）：{len(with_cbdb)} / {den} = {pct(len(with_cbdb)):.1f}%")
    print(f"别名归并可链（参考）：{len(alias_hit)}；"
          f"归并后建档率 {pct(len(linked) + len(alias_hit)):.1f}%")
    print(f"live 人物 Entity：{len(live_ppl)}")

    if tsv_path:
        rows = sorted(unlinked, key=lambda n: (-len(name_works[n]), n))
        with open(tsv_path, "w", encoding="utf-8") as f:
            f.write("name\twork_count\n")
            for n in rows:
                f.write(f"{n}\t{len(name_works[n])}\n")
        print(f"未链接清单：{len(rows)} 行 → {tsv_path}")


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        sys.exit(__doc__)
    main(*sys.argv[1:])
