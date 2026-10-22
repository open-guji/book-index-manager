#!/usr/bin/env python3
"""文本侧书名匹配（GUJI-509 续）：书名（＋作者／朝代）→ 候选 Work id。只依赖 export_titlekeys.py 的输出目录。

用法：
  python3 -I match_titles.py <标题键表目录> --title 光福志 [--author 徐傅] [--dynasty 清] [--author-id <entity_id>]
  python3 -I match_titles.py <标题键表目录> --id <旧id或草稿id>
  python3 -I match_titles.py <标题键表目录> --batch 查询.tsv [--out 结果.jsonl]   # 表头 title[,author,dynasty,author_id]
输出 JSONL：{query, status, via, candidates[{work_id, primary_title, key_kind, authors, author_ids, dynasty, via, author_signal, dynasty_signal}], reason}
匹配顺序：精确 → norm_key（异体）→ bare_key（去《》与首部[年号]标记）→ 墓碑旧题。
作者、朝代都是软信号（match|partial|mismatch|unknown），只降权排序、不排除；同名异修的 Work 全部保留。
status 与 match_names.py 一致：unique｜likely（多候选，仅一条作者或朝代 match）｜ambiguous｜redirected｜tombstone_name｜none。
绝不在 ambiguous 时自动取第一条。
"""
import argparse
import csv
import json
import sys
import unicodedata
from collections import defaultdict

_VARIANTS = {'尙': '尚', '郞': '郎', '戸': '戶', '叅': '參', '祕': '秘', '歴': '曆', '淸': '清',
             '彞': '彝', '啓': '啟', '裏': '裡', '羣': '群', '峯': '峰', '麤': '粗', '蹟': '跡',
             '爲': '為', '眞': '真',
             # GUJI-509 对 002/003 真实名单补：异体 → 通行字
             '𠮓': '變', '𫎇': '蒙', '鈎': '鉤', '温': '溫', '巖': '岩', '璇': '璿', '錄': '録',
             '决': '決', '藴': '蘊', '沈': '沉', '畧': '略', '復': '複', '冲': '沖', '頴': '穎',
             '註': '注', '内': '內',
             # GUJI-509 对 002/003 真实名单补（愼→慎 起）：异体 → 通行字
             '愼': '慎', '徳': '德', '峩': '峨', '衞': '衛', '綫': '線', '糺': '糾', '秌': '秋', '敍': '敘',
             '邨': '村', '躰': '體', '剏': '創', '剙': '創', '辤': '辭', '辞': '辭', '嵗': '歲',
             '歳': '歲', '隂': '陰', '夘': '卯', '凢': '凡', '荅': '答', '觧': '解', '髙': '高',
             '蘓': '蘇', '欵': '款', '槩': '概', '絶': '絕', '蠧': '蠹', '寳': '寶', '珤': '寶',
             '圎': '圓', '靑': '青', '氷': '冰', '屛': '屏', '巿': '市', '恠': '怪', '嶋': '島',
             '嶌': '島', '鬭': '鬥', '鬪': '鬥', '鬬': '鬥', '蔵': '藏', '搨': '拓', '厯': '曆',
             '筭': '算', '祘': '算', '緖': '緒', '鷄': '雞', '恆': '恒', '墻': '牆', '灋': '法'}
_TABLE = str.maketrans(_VARIANTS)


def norm_key(s):
    return unicodedata.normalize("NFKC", s).strip().translate(_TABLE)


def bare_key(s):
    import re
    s = norm_key(s).replace("《", "").replace("》", "")
    return re.sub(r"^(?:[\[［〔（(][^\]］〕）)]{1,8}[\]］〕）)])+", "", s).strip()


def _read(path):
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f, delimiter="\t"))


def _sig(q, vals):
    """q 与候选字段的软比较；vals 为候选侧的若干字符串。"""
    if not q:
        return "unknown"
    vals = [v for v in vals if v]
    if not vals:
        return "unknown"
    nq = norm_key(q)
    if any(norm_key(v) == nq for v in vals):
        return "match"
    if any(nq in norm_key(v) or norm_key(v) in nq for v in vals):
        return "partial"
    return "mismatch"


class TitleMatcher:
    def __init__(self, d):
        self.by_key, self.by_norm, self.by_bare = defaultdict(list), defaultdict(list), defaultdict(list)
        self.by_id = {}
        for r in _read(f"{d}/标题键表.tsv"):
            self.by_key[r["key"]].append(r)
            self.by_norm[r["norm_key"]].append(r)
            self.by_bare[r["bare_key"]].append(r)
            self.by_id.setdefault(r["work_id"], r)
        self.redirect, self.tomb = {}, defaultdict(list)
        for r in _read(f"{d}/标题重定向表.tsv"):
            self.redirect[r["old_id"]] = r
            if r["status"] == "merged" and r["old_title"]:
                self.tomb[bare_key(r["old_title"])].append(r)

    @staticmethod
    def _cand(r, via):
        return {"work_id": r["work_id"], "primary_title": r["primary_title"], "key_kind": r["key_kind"],
                "authors": r["authors"], "author_ids": r.get("author_ids", ""), "dynasty": r["dynasty"], "via": via}

    def resolve_id(self, wid):
        if wid in self.by_id:
            return {"status": "unique", "via": "live_id", "candidates": [self._cand(self.by_id[wid], "live_id")], "reason": ""}
        r = self.redirect.get(wid)
        if not r:
            return {"status": "none", "via": "", "candidates": [], "reason": "id 不在标题键表也不在重定向表"}
        row = self.by_id.get(r["final_id"])
        if not row:
            return {"status": "none", "via": r["status"], "candidates": [], "reason": "重定向目标不在 live：" + r["final_id"]}
        return {"status": "redirected", "via": r["status"], "candidates": [self._cand(row, r["status"])], "reason": ""}

    def match(self, title, author="", dynasty="", author_id=""):
        q = title.strip()
        for table, key, via in ((self.by_key, q, "exact"), (self.by_norm, norm_key(q), "norm"),
                                (self.by_bare, bare_key(q), "bare")):
            rows = table.get(key, [])
            if rows:
                break
        else:
            rows, via = [], ""
        if not rows:
            t = [x for x in self.tomb.get(bare_key(q), []) if self.by_id.get(x["final_id"])]
            if t:
                ids = {x["final_id"] for x in t}
                cands = [self._cand(self.by_id[i], "tombstone_title") for i in sorted(ids)]
                return {"status": "tombstone_name" if len(ids) == 1 else "ambiguous", "via": "tombstone_title",
                        "candidates": cands, "reason": "书名只命中已合并墓碑的旧题"}
            return {"status": "none", "via": "", "candidates": [], "reason": "标题键表无此名，走缺条目入口"}
        seen, cands = set(), []
        for r in rows:
            if r["work_id"] in seen:
                continue
            seen.add(r["work_id"])
            c = self._cand(r, via)
            ids = [x for x in r.get("author_ids", "").split("／") if x]
            if author_id and ids:  # id 级消歧优先于名字；id 来自专名匹配结果（已跟到终点）
                c["author_signal"] = "match" if author_id in ids else "mismatch"
            else:
                c["author_signal"] = _sig(author, r["authors"].split("／"))
            c["dynasty_signal"] = _sig(dynasty, [r["dynasty"]])
            cands.append(c)
        order = {"match": 0, "partial": 1, "unknown": 2, "mismatch": 3}
        cands.sort(key=lambda c: (order[c["author_signal"]], order[c["dynasty_signal"]],
                                  c["key_kind"] != "primary", c["work_id"]))
        if len(cands) == 1:
            c = cands[0]
            reason = ""
            if "mismatch" in (c["author_signal"], c["dynasty_signal"]):
                reason = "唯一候选但作者或朝代不一致，建议抽检"
            return {"status": "unique", "via": via, "candidates": cands, "reason": reason}
        top = [c for c in cands if c["author_signal"] == "match" or
               (not author and c["dynasty_signal"] == "match")]
        if len(top) == 1:
            return {"status": "likely", "via": via, "candidates": cands,
                    "reason": "多候选，仅一条作者（或朝代）吻合，其余降权保留；建议抽检"}
        return {"status": "ambiguous", "via": via, "candidates": cands,
                "reason": "同名多 Work（含同地异修），需作者／朝代／上下文消歧"}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dir")
    ap.add_argument("--title")
    ap.add_argument("--author", default="")
    ap.add_argument("--author-id", default="", help="作者实体 id（专名匹配结果），优先于 --author 名字比对")
    ap.add_argument("--dynasty", default="")
    ap.add_argument("--id")
    ap.add_argument("--batch")
    ap.add_argument("--out")
    a = ap.parse_args()
    m = TitleMatcher(a.dir)
    out = open(a.out, "w", encoding="utf-8") if a.out else sys.stdout
    if a.id:
        res = [({"id": a.id}, m.resolve_id(a.id))]
    elif a.title:
        res = [({"title": a.title, "author": a.author, "dynasty": a.dynasty, "author_id": a.author_id},
                m.match(a.title, a.author, a.dynasty, a.author_id))]
    elif a.batch:
        res = [(r, m.match(r["title"], r.get("author") or "", r.get("dynasty") or "", r.get("author_id") or "")) for r in _read(a.batch)]
    else:
        ap.error("需要 --title／--id／--batch 之一")
    for q, r in res:
        out.write(json.dumps({"query": q, **r}, ensure_ascii=False) + "\n")
    if a.batch:
        from collections import Counter
        print(json.dumps(Counter(r["status"] for _, r in res), ensure_ascii=False), file=sys.stderr)


if __name__ == "__main__":
    main()
