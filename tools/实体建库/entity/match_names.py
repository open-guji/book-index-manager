#!/usr/bin/env python3
"""文本侧专名匹配（GUJI-509 草案，接口说明见 docs/entity-build/文本侧匹配接口.md）。

只依赖 export_keytable.py 的输出目录（键表.tsv／重定向表.tsv），标准库即可。

用法：
  python3 -I match_names.py <键表目录> --name 蘇軾 [--dynasty 宋] [--subtype people] [--work 書名]
  python3 -I match_names.py <键表目录> --id <旧id或草稿id>
  python3 -I match_names.py <键表目录> --batch 查询.tsv [--out 结果.jsonl]
      查询.tsv 表头：name[, dynasty, subtype, work]（制表符分隔，UTF-8）
输出 JSONL，每个查询一行：
  {query:{...}, status, via, candidates:[{entity_id, primary_name, subtype, dynasty, key_kind, via}], reason}
status：unique 唯一候选可直接挂（朝代不一致时 reason 提示抽检）｜likely 多候选仅一条朝代吻合｜ambiguous 多候选无法定，必须人判｜
        redirected 经重定向表落到 live｜tombstone_name 名字只命中墓碑旧名，已跟到 final（较弱，建议抽检）｜
        retired 命中退役条｜weak 单字人名（失名条／字号残片），一律不自动挂，reason「单字/失名条，勿自动挂」｜none 未命中（走缺实体入口 GUJI-395）
朝代只是软信号（候选带 dynasty_signal：match|partial|mismatch|unknown），只降权不排除。绝不在 ambiguous 时自动取第一条。
作品软信号 --work：候选 works（键表由 Work.authors[].entity_id 反查）含该书名 → work_signal=match 并排前；
多候选仅一条含该书名 → likely；唯一候选但其已知作品不含 → unique 附抽检提示；只排序不排除。
place/office/reign 的 dynasty 可含多朝（「／」连接），任一朝吻合即 match。
"""
import argparse
import csv
import json
import sys
import unicodedata
from collections import defaultdict

# 与 export_keytable.py 的 _VARIANTS 保持一致（键表里已有 norm_key 列，查询侧须用同一张表）
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


def _read(path):
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f, delimiter="\t"))


class Matcher:
    def __init__(self, d):
        self.by_key = defaultdict(list)
        self.by_norm = defaultdict(list)
        self.by_id = {}
        for r in _read(f"{d}/键表.tsv"):
            self.by_key[r["key"]].append(r)
            self.by_norm[r["norm_key"]].append(r)
            self.by_id.setdefault(r["entity_id"], r)
        self.redirect = {}
        self.tomb_names = defaultdict(list)
        for r in _read(f"{d}/重定向表.tsv"):
            self.redirect[r["old_id"]] = r
            if r["old_name"] and r["status"] in ("merged", "retired"):
                self.tomb_names[norm_key(r["old_name"])].append(r)

    @staticmethod
    def _cand(r, via):
        return {"entity_id": r["entity_id"], "primary_name": r["primary_name"], "subtype": r["subtype"],
                "dynasty": r["dynasty"], "key_kind": r["key_kind"], "via": via,
                "works": r.get("works", ""), "life": r.get("life", ""),
                "native_place": r.get("native_place", ""), "period": r.get("period", "")}

    def resolve_id(self, eid):
        """旧 id／草稿 id → live。"""
        if eid in self.by_id:
            return {"status": "unique", "via": "live_id",
                    "candidates": [self._cand(self.by_id[eid], "live_id")], "reason": ""}
        r = self.redirect.get(eid)
        if not r:
            return {"status": "none", "via": "", "candidates": [], "reason": "id 不在键表也不在重定向表"}
        if r["status"] == "retired":
            return {"status": "retired", "via": "retired", "candidates": [], "reason": "该 id 已退役，不得取用，报缺"}
        row = self.by_id.get(r["final_id"])
        if r["status"].startswith("promoted-dangling") or not row:
            return {"status": "none", "via": r["status"], "candidates": [],
                    "reason": "重定向目标不在 live：" + r["final_id"]}
        return {"status": "redirected", "via": r["status"],
                "candidates": [self._cand(row, r["status"])], "reason": ""}

    def _match0(self, name, dynasty="", subtype="", work=""):
        q = name.strip()
        rows, via = self.by_key.get(q, []), "exact"
        if not rows:
            rows, via = self.by_norm.get(norm_key(q), []), "norm"
        if subtype:
            # 官署名常同时作为 collective（机构／群体）入库：查 office 时一并查 collective（GUJI-509 对稿）
            ok = {subtype, "collective"} if subtype == "office" else {subtype}
            rows = [r for r in rows if r["subtype"] in ok]
        if not rows:
            tomb = [t for t in self.tomb_names.get(norm_key(q), [])
                    if not subtype or (self.by_id.get(t["final_id"]) or {}).get("subtype", subtype) == subtype]
            live = [(t, self.by_id.get(t["final_id"])) for t in tomb if t["status"] == "merged"]
            live = [(t, r) for t, r in live if r]
            if live:
                ids = {r["entity_id"] for _, r in live}
                cands = [self._cand(r, "tombstone_name") for _, r in live]
                return {"status": "tombstone_name" if len(ids) == 1 else "ambiguous", "via": "tombstone_name",
                        "candidates": _dedup(cands), "reason": "名字只命中已合并墓碑的旧名"}
            if any(t["status"] == "retired" for t in tomb):
                return {"status": "retired", "via": "retired_name", "candidates": [],
                        "reason": "名字只命中退役条"}
            if tomb:
                return {"status": "none", "via": "tombstone_name", "candidates": [],
                        "reason": "名字命中墓碑旧名，但 final 不在本键表（样例截断或 final 已非 live）"}
            return {"status": "none", "via": "", "candidates": [], "reason": "键表无此名，走缺实体入口"}
        cands = _dedup([self._cand(r, via) for r in rows])
        for c in cands:
            c["dynasty_signal"] = _dyn_signal(dynasty, c["dynasty"])
            c["work_signal"] = _work_signal(work, c["works"])
        # 朝代／作品只是软信号：只降权排序，绝不排除（帝王等朝代标注与年号表不一致，见设计文档 §三）
        order = {"match": 0, "partial": 1, "unknown": 2, "mismatch": 3}
        worder = {"match": 0, "unknown": 1, "none": 2}
        cands.sort(key=lambda c: (worder[c["work_signal"]], order[c["dynasty_signal"]],
                                  c["key_kind"] != "primary", c["entity_id"]))
        # 单字人名（失名条、字号残片）一律不自动挂（GUJI-509 对稿①）
        if len(q) == 1 and subtype in ("", "people") and any(c["subtype"] == "people" for c in cands):
            return {"status": "weak", "via": via, "candidates": cands, "reason": "单字/失名条，勿自动挂"}
        # 单字朝代／年号只在朝代语境可配：未指定 subtype=dynasty/reign 也没给朝代 → weak
        if len(q) == 1 and all(c["subtype"] in ("dynasty", "reign") for c in cands) \
                and subtype not in ("dynasty", "reign") and not dynasty:
            return {"status": "weak", "via": via, "candidates": cands, "reason": "单字朝代/年号，仅朝代语境可配"}
        reason = ""
        if len(cands) == 1:
            status = "unique"
            if cands[0]["dynasty_signal"] == "mismatch":
                reason = "唯一候选但朝代不一致（%s≠%s），建议抽检" % (dynasty, cands[0]["dynasty"])
            elif cands[0]["work_signal"] == "none":
                reason = "唯一候选但其已知作品不含《%s》，建议抽检" % work.strip("《》")
        else:
            wtop = [c for c in cands if c["work_signal"] == "match"]
            top = [c for c in cands if c["dynasty_signal"] in ("match", "partial")]
            if len(wtop) == 1:
                status, reason = "likely", "多候选，仅一条已知作品含《%s》，其余降权保留；建议抽检" % work.strip("《》")
            elif len(top) == 1 and top[0]["dynasty_signal"] == "match":
                status, reason = "likely", "多候选，仅一条朝代吻合，其余降权保留；建议抽检"
            else:
                status, reason = "ambiguous", "同名多候选，需上下文（朝代／作品／作者）消歧"
        return {"status": status, "via": via, "candidates": cands, "reason": reason}


    _SUFFIX = ("府", "州", "縣", "郡", "道", "路")

    def match(self, name, dynasty="", subtype="", work=""):
        """基础匹配＋两类回查（Thaddeus 册002/003 试跑建议）：
        ①地名省称（揚州→揚州府）：none 时补「府/州/縣/郡/道/路」后缀回查，只在 place 范围，命中一律 likely 抽检；
        ②清諱避讳字对（玄↔元，如 鄭元≈鄭玄）：人名含玄／元时用对位字回查，命中则把 unique 降为 likely 并附候选。"""
        r = self._match0(name, dynasty, subtype, work)
        q = name.strip()
        if r["status"] == "none" and subtype in ("", "place") and len(q) >= 2:
            cands = []
            for suf in self._SUFFIX:
                rr = self._match0(q + suf, dynasty, "place", work)
                if rr["status"] in ("unique", "likely", "ambiguous"):
                    cands += rr["candidates"]
            if cands:
                return {"status": "likely", "via": "place_suffix", "candidates": _dedup(cands),
                        "reason": "省称回查（加府／州／縣等后缀），须抽检；多候选勿取第一条"}
        if subtype in ("", "people") and len(q) >= 2 and ("玄" in q or "元" in q):
            alt = q.replace("玄", "\0").replace("元", "玄").replace("\0", "元")
            ra = self._match0(alt, dynasty, "people", work)
            if ra["status"] in ("unique", "likely", "ambiguous") and r["status"] in ("none", "unique", "likely", "ambiguous"):
                cands = _dedup(r["candidates"] + ra["candidates"])
                return {"status": "likely" if r["status"] != "ambiguous" else "ambiguous",
                        "via": r["via"] or "bihui", "candidates": cands,
                        "reason": "清諱避讳字对（玄↔元）：『%s』亦有候选，须抽检" % alt}
        return r


def _work_signal(w, works):
    """作品软信号：match＝候选已知作品含此书名；none＝有作品信息但不含；unknown＝未给书名或候选无作品信息。"""
    if not w or not works:
        return "unknown"
    nw = bare(w)
    for x in works.split(";"):
        nx = bare(x)
        if nx and (nx == nw or (len(nw) >= 3 and len(nx) >= 3 and (nw in nx or nx in nw))):
            return "match"
    return "none"


def bare(s):
    return norm_key(s).replace("《", "").replace("》", "")


def _dyn_signal(q, d):
    if not q:
        return "unknown"
    if not d:
        return "unknown"
    nq = norm_key(q)
    sig = "mismatch"
    for part in d.split("／"):  # place/office/reign 可跨多朝，以「／」连接
        nd = norm_key(part)
        if nq == nd:
            return "match"
        if nq in nd or nd in nq:  # 宋／北宋、南宋；清／清末
            sig = "partial"
    return sig


def _dedup(cands):
    seen, out = set(), []
    for c in cands:
        k = c["entity_id"]
        if k not in seen:
            seen.add(k)
            out.append(c)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dir")
    ap.add_argument("--name")
    ap.add_argument("--dynasty", default="")
    ap.add_argument("--subtype", default="")
    ap.add_argument("--work", default="", help="书名软信号：候选已知作品含它则升权（只排序不排除）")
    ap.add_argument("--id")
    ap.add_argument("--batch")
    ap.add_argument("--out")
    a = ap.parse_args()
    m = Matcher(a.dir)
    out = open(a.out, "w", encoding="utf-8") if a.out else sys.stdout
    if a.id:
        res = [({"id": a.id}, m.resolve_id(a.id))]
    elif a.name:
        res = [({"name": a.name, "dynasty": a.dynasty, "subtype": a.subtype, "work": a.work},
                m.match(a.name, a.dynasty, a.subtype, a.work))]
    elif a.batch:
        res = []
        for r in _read(a.batch):
            res.append((r, m.match(r["name"], r.get("dynasty") or "", r.get("subtype") or "", r.get("work") or "")))
    else:
        ap.error("需要 --name／--id／--batch 之一")
    for q, r in res:
        out.write(json.dumps({"query": q, **r}, ensure_ascii=False) + "\n")
    if a.batch:
        from collections import Counter
        print(json.dumps(Counter(r["status"] for _, r in res), ensure_ascii=False), file=sys.stderr)


if __name__ == "__main__":
    main()
