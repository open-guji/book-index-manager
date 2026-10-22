#!/usr/bin/env python3
"""Work 标题键表导出（GUJI-509 续，与 export_keytable.py 同构；设计见 docs/entity-build/文本侧匹配接口.md §八）。

用法：
  python3 -I export_titlekeys.py <book-index 路径> <输出目录> [--limit N]

只读 <book-index>/Work/**/*.json 与 promotions/*.json，写 <输出目录>/：
  标题键表.tsv     key, work_id, primary_title, key_kind, authors, dynasty, cand_n, norm_key, norm_cand_n, bare_key, author_ids
  标题重定向表.tsv  old_id, status(merged|promoted|promoted-dangling), final_id, old_title
  标题键表.meta.json  源 commit、脚本 sha256、行数、两表 sha256
key_kind：primary｜alt:additional（additional_titles）｜alt:original（original_title）。
authors：authors[].name 以「／」连接（消歧用，原字形）；author_ids：与 authors 逐位对齐的 authors[].entity_id（缺则空位，可喂专名匹配结果做 id 级消歧）；dynasty：Work.dynasty。
norm_key：与 export_keytable 同一张异体折叠表；bare_key：norm_key 再去掉《》与首部「[光緒]」「（清）」类时代标记，
  使「[光緒]光福志」「光福志」「《光福志》」互通（同名异修仍是不同 Work，靠 authors／dynasty 区分）。
  norm_cand_n：同 bare_key 下不同 Work 的个数（宽松匹配命中时看它，不看 cand_n）。
merged_into 的 Work 不入标题键表，走重定向表；promoted 取 promotions 里 type=work 的草稿 id→正式 id，final 须落 live。
输出排序确定，同输入逐字节可复现。
"""
import argparse
import csv
import glob
import hashlib
import importlib.util
import json
import os
import re
import subprocess
from collections import defaultdict

_HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("export_keytable", os.path.join(_HERE, "export_keytable.py"))
_ek = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_ek)
norm_key = _ek.norm_key

_BRACKET_PREFIX = re.compile(r"^(?:[\[［〔（(][^\]］〕）)]{1,8}[\]］〕）)])+")


def bare_key(s):
    s = norm_key(s).replace("《", "").replace("》", "")
    s = _BRACKET_PREFIX.sub("", s).strip()
    return s


def load_works(repo):
    works = {}
    for p in glob.glob(os.path.join(repo, "Work", "**", "*.json"), recursive=True):
        try:
            with open(p, encoding="utf-8") as f:
                d = json.load(f)
        except Exception:
            continue
        if isinstance(d, dict) and d.get("type") == "work" and d.get("id"):
            works[d["id"]] = d
    return works


def final_id(works, wid):
    seen = set()
    while wid in works and works[wid].get("merged_into") and wid not in seen:
        seen.add(wid)
        wid = works[wid]["merged_into"]
    return wid


def titles_for(w):
    if w.get("title"):
        yield w["title"], "primary"
    for t in w.get("additional_titles") or []:
        if isinstance(t, str) and t:
            yield t, "alt:additional"
    if isinstance(w.get("original_title"), str) and w["original_title"]:
        yield w["original_title"], "alt:original"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("repo")
    ap.add_argument("out")
    ap.add_argument("--limit", type=int, default=0, help="仅样例用：live Work 只取 id 排序后前 N 条")
    a = ap.parse_args()

    works = load_works(a.repo)
    live = {k: w for k, w in works.items() if not w.get("merged_into")}
    if a.limit:
        keep = set(sorted(live)[: a.limit])
        live = {k: w for k, w in live.items() if k in keep}

    rows = []
    owners, nowners = defaultdict(set), defaultdict(set)
    for wid, w in live.items():
        al = [x for x in (w.get("authors") or []) if isinstance(x, dict) and x.get("name")]
        au = "／".join(x["name"] for x in al)
        # 与 authors 逐位对齐；无 entity_id 的位置留空（GUJI-509 对稿④）
        aid = "／".join(x.get("entity_id") or "" for x in al)
        for t, kind in titles_for(w):
            rows.append((t, wid, w.get("title") or "", kind, au, w.get("dynasty") or "", aid))
            owners[t].add(wid)
            nowners[bare_key(t)].add(wid)
    rows = sorted(set(rows), key=lambda r: (r[0], r[1], r[3]))

    os.makedirs(a.out, exist_ok=True)
    with open(os.path.join(a.out, "标题键表.tsv"), "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter="\t", lineterminator="\n")
        w.writerow(["key", "work_id", "primary_title", "key_kind", "authors", "dynasty",
                    "cand_n", "norm_key", "norm_cand_n", "bare_key", "author_ids"])
        for t, wid, pt, kind, au, dyn, aid in rows:
            bk = bare_key(t)
            w.writerow([t, wid, pt, kind, au, dyn, len(owners[t]), norm_key(t), len(nowners[bk]), bk, aid])

    redirects = [(wid, "merged", final_id(works, wid), w.get("title") or "")
                 for wid, w in works.items() if w.get("merged_into")]
    seen_old = {r[0] for r in redirects}
    promo = {}
    for p in sorted(glob.glob(os.path.join(a.repo, "promotions", "*.json"))):
        try:
            with open(p, encoding="utf-8") as f:
                d = json.load(f)
        except Exception:
            continue
        for old, v in (d.get("promotions") or {}).items() if isinstance(d, dict) else []:
            if isinstance(v, dict) and v.get("type") == "work" and v.get("production_id"):
                promo[old] = v["production_id"]
    n_dangling = 0
    for old, new in promo.items():
        if old in seen_old:
            continue
        fin = final_id(works, new)
        t = works.get(fin)
        ok = bool(t) and not t.get("merged_into")
        n_dangling += 0 if ok else 1
        redirects.append((old, "promoted" if ok else "promoted-dangling", fin, ""))
    redirects.sort()
    with open(os.path.join(a.out, "标题重定向表.tsv"), "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter="\t", lineterminator="\n")
        w.writerow(["old_id", "status", "final_id", "old_title"])
        w.writerows(redirects)

    def sha256(p):
        with open(p, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()
    try:
        src = subprocess.run(["git", "-C", a.repo, "rev-parse", "HEAD"], capture_output=True,
                             text=True, check=True).stdout.strip()
    except Exception:
        src = ""
    meta = {"source_repo": "open-guji/book-index", "source_commit": src, "limit": a.limit,
            "key_rows": len(rows), "live_works": len(live), "redirect_rows": len(redirects),
            "promoted_dangling": n_dangling,
            "ambiguous_titles": sum(1 for v in owners.values() if len(v) > 1),
            "titlekeys_sha256": sha256(os.path.join(a.out, "标题键表.tsv")),
            "redirect_sha256": sha256(os.path.join(a.out, "标题重定向表.tsv")),
            "script_sha256": sha256(os.path.abspath(__file__))}
    with open(os.path.join(a.out, "标题键表.meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")
    print(json.dumps(meta, ensure_ascii=False))


if __name__ == "__main__":
    main()
