#!/usr/bin/env python3
"""校验裁决账 verdicts.jsonl（块 C 步 2）。
用法：python3 -I scripts/verdict_check.py 裁决/verdicts.jsonl
规则：必填字段；verdict∈{adopt,reject,open}；adopt/reject 的 sources 须来自 ≥2 条不同"链"
（同链＝按单源，adopt 不可、须改 open）；adopt 必有 action；rule 须是已登记规则；
reject 且 rule=R-范围 的行 note 须含 out-of-scope。
链：zhwp-*、zhwp-cite:* → zhwp；dila-* → dila；cbdb-* → cbdb；book:<书名> → 各书自成一链。
"""
import json, sys

REQ = ["diff_id", "verdict", "rule", "sources"]
RULES = {"R-两源", "R-史载例外", "R-范围"}
VERDICTS = {"adopt", "reject", "open"}


def chain(s):
    s = s.strip()
    if s.startswith(("zhwp-cite:", "zhwp")):
        return "zhwp"
    if s.startswith("dila"):
        return "dila"
    if s.startswith("cbdb"):
        return "cbdb"
    return s  # book:xxx 等各自一链


def check_row(n, r):
    e = []
    for k in REQ:
        if r.get(k) in (None, "", []):
            e.append(f"缺必填字段 {k}")
    v = r.get("verdict")
    if v not in VERDICTS:
        e.append(f"verdict 非法：{v}")
    if r.get("rule") not in RULES:
        e.append(f"rule 未登记：{r.get('rule')}")
    srcs = r.get("sources") or []
    if not isinstance(srcs, list):
        e.append("sources 须为数组")
        srcs = []
    chains = {chain(s) for s in srcs}
    if v in ("adopt", "reject") and r.get("rule") != "R-范围" and len(chains) < 2:
        e.append(f"{v} 需 ≥2 条独立链来源，现 {sorted(chains)}（同链按单源，应为 open）")
    if v == "adopt" and not r.get("action"):
        e.append("adopt 必有 action")
    if v == "reject" and r.get("rule") == "R-范围" and "out-of-scope" not in (r.get("note") or ""):
        e.append("R-范围 reject 的 note 须含 out-of-scope")
    return [f"第{n}行 {r.get('diff_id')}: {m}" for m in e]


def main(p):
    errs, n = [], 0
    for i, line in enumerate(open(p, encoding="utf-8"), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        n += 1
        try:
            errs += check_row(i, json.loads(line))
        except json.JSONDecodeError as ex:
            errs.append(f"第{i}行 JSON 错：{ex}")
    print(f"{n} 行，{len(errs)} 个错误")
    for m in errs:
        print(" ", m)
    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
