#!/usr/bin/env python3
"""块 D 溯源校验：book-index 相对基线新增的 description.sources 字符串，其书名须出自裁决账里
该实体行的 book:<书名> 来源（账外书名一律报错）。
用法：python3 -I scripts/d_check.py <book-index 工作树> <基线 git ref> 裁决/verdicts*.jsonl
退出码 0＝通过，1＝有账外书名或无账可依。
"""
import json, re, subprocess, sys


def core(name):
    return re.split(r"[·・卷]", name.strip().strip("《》"))[0]


def ledger_books(files):
    m = {}  # entity_id -> set(书名核)
    for f in files:
        for l in open(f, encoding="utf-8"):
            if not l.startswith("{"):
                continue
            r = json.loads(l)
            bs = {core(s[5:]) for s in r.get("sources", []) if s.startswith("book:")}
            for i in r.get("entity_ids", []) or []:
                m.setdefault(i, set()).update(bs)
    return m


def main():
    root, base, *files = sys.argv[1:]
    books = ledger_books(files)
    names = subprocess.run(["git", "-C", root, "diff", "--name-only", "-z", base, "--", "Entity"],
                           capture_output=True, text=True, check=True).stdout.split("\0")
    errs = 0
    for p in names:
        if not p:
            continue
        try:
            new = json.load(open(f"{root}/{p}", encoding="utf-8"))
        except OSError:
            continue
        old_txt = subprocess.run(["git", "-C", root, "show", f"{base}:{p}"], capture_output=True, text=True).stdout
        old = json.loads(old_txt) if old_txt else {}
        olds = {json.dumps(s, ensure_ascii=False) for s in (old.get("description") or {}).get("sources", [])}
        for s in (new.get("description") or {}).get("sources", []):
            if json.dumps(s, ensure_ascii=False) in olds:
                continue
            txt = s if isinstance(s, str) else json.dumps(s, ensure_ascii=False)
            ok = [b for b in books.get(new["id"], ()) if b and re.search("《" + re.escape(b) + "(?=[》·卷])", txt)]
            if not ok:
                errs += 1
                print(f"{p}: 新增来源「{txt}」的书名不在账本该实体的 book: 来源中（账内书名：{sorted(books.get(new['id'], [])) or '无'}）")
    print(f"检查 {len(names)} 个文件，{errs} 处错误")
    sys.exit(1 if errs else 0)


main()
