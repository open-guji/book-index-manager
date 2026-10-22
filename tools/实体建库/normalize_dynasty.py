#!/usr/bin/env python3
"""
normalize_dynasty.py - 朝代字段批量規範化腳本

規則來源: SCHEMA.md「朝代欄位規範化」章節

處理層級：
  1. 源文件: Work/<a>/<b>/<c>/*.json  (頂層 dynasty, authors[] 內的 dynasty)
             Entity/<a>/<b>/<c>/*.json (頂層 dynasty)
  2. 索引文件: index.json              (works[] 內的 dynasty)
  3. 分片索引: index/works/*.json, index/entities/*.json

操作:
  --dry-run  : 只輸出預覽統計，不落盤
  --commit   : 執行修改，寫回所有文件
  --force    : 即使 period/dynasty_basis 已存在也強制覆蓋（預設僅填空）
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# ---------- 規則表：完全按 SCHEMA.md L246-L371 ----------

# 規範朝代 -> period 映射（含通用、跨朝 period 值）
CANONICAL_TO_PERIOD: dict[str, str] = {
    # pre-qin
    "上古傳說": "pre-qin", "上古": "pre-qin",
    "夏": "pre-qin", "商": "pre-qin", "西周": "pre-qin", "東周": "pre-qin",
    "春秋": "pre-qin", "戰國": "pre-qin", "先秦": "pre-qin",
    "春秋齊": "pre-qin", "春秋晉": "pre-qin", "春秋吳": "pre-qin", "春秋魯": "pre-qin",
    "戰國齊": "pre-qin", "戰國楚": "pre-qin", "戰國趙": "pre-qin",
    # qin-han
    "秦": "qin-han", "西漢": "qin-han", "新": "qin-han", "東漢": "qin-han",
    # three-kingdoms
    "三國魏": "three-kingdoms", "三國蜀": "three-kingdoms", "三國吳": "three-kingdoms",
    "三國": "three-kingdoms",
    # jin
    "西晉": "jin", "東晉": "jin", "晉": "jin",
    "前涼": "jin", "前秦": "jin", "後秦": "jin", "西燕": "jin", "北涼": "jin",
    # nanbeichao
    "南朝宋": "nanbeichao", "南朝齊": "nanbeichao", "南朝梁": "nanbeichao", "南朝陳": "nanbeichao",
    "南朝": "nanbeichao",
    "北魏": "nanbeichao", "北齊": "nanbeichao", "北周": "nanbeichao", "北朝": "nanbeichao",
    "南北朝": "nanbeichao",
    # sui-tang
    "隋": "sui-tang", "唐": "sui-tang",
    # five-dynasties
    "後梁": "five-dynasties", "後唐": "five-dynasties", "後晉": "five-dynasties",
    "後漢": "five-dynasties", "後周": "five-dynasties", "五代": "five-dynasties",
    "前蜀": "five-dynasties", "後蜀": "five-dynasties", "楊吳": "five-dynasties",
    "南唐": "five-dynasties", "吳越": "five-dynasties", "閩": "five-dynasties",
    # song
    "北宋": "song", "南宋": "song",
    # liao-jin-yuan
    "遼": "liao-jin-yuan", "西夏": "liao-jin-yuan", "金": "liao-jin-yuan",
    "蒙古": "liao-jin-yuan", "元": "liao-jin-yuan", "偽齊": "liao-jin-yuan",
    # ming
    "明": "ming",
    # qing
    "清": "qing",
    # modern
    "中華民國": "modern", "中華人民共和國": "modern",
    # 跨朝代值 -> 粗粒度 period
    "秦漢": "qin-han", "隋唐": "sui-tang",
    "齊梁": "nanbeichao", "金元": "liao-jin-yuan",
    "宋、齊": "nanbeichao",
}

# 域外朝代 -> period = None
FOREIGN_CANONICAL = {"日本", "江戶時代", "朝鮮", "新羅", "韓國", "英國", "美國", "比利時"}

# 別名/同義 -> 規範名
ALIAS_TO_CANONICAL: dict[str, str] = {
    # SCHEMA 別名列
    "春秋戰國": "春秋",
    "漢前": "先秦", "漢以前": "先秦",
    "贏秦": "秦",
    "東漢末": "東漢",
    "曹魏": "三國魏",
    "蜀漢": "三國蜀",
    "孫吳": "三國吳",
    "姚秦": "後秦",
    "劉宋": "南朝宋", "宋(劉)": "南朝宋",
    "南齊": "南朝齊",
    "南梁": "南朝梁",
    "陳": "南朝陳",
    "後魏": "北魏",
    "吳(楊)": "楊吳",
    "閩國": "閩",
    "清末": "清",
    "民國": "中華民國", "民初": "中華民國",
    "當代": "中華人民共和國", "現代": "中華人民共和國", "近代": "中華人民共和國",
    # 域外別名
    "日": "日本",
    "日本江戶時代": "江戶時代", "日本寶永年間": "江戶時代",
    "朝鮮（明）": "朝鮮", "高麗": "朝鮮",
    # 垃圾值 -> 清潔後規範名（SCHEMA 垃圾值清理表）
    "明0": "明",
    "高宗乾隆": "清", "清 乾隆": "清", "清 高宗": "清",
    "世宗雍正": "清",
    "道光": "清",
    "康熙四十八年": "清",
    "玄宗": "唐",
}

# 完全垃圾值，直接轉 null（dynasty = None，period 留空）
GARBAGE_VALUES = {"@", "?", "不詳", "未詳", "西洋", "梁天竺", "廬陵鳳林書院"}

# 需人工逐條拆分的歧義值：這些原文無法自動定規範名，
# 但 period 可粗粒度自動填（宋/魏/漢…）或逐條判（null）
AMBIGUOUS_RAW = {"宋", "魏", "漢", "周", "齊", "梁", "吳", "蜀", "國朝"}

# 多數情況 "宋" 是北宋/南宋，這裡用啟發式：
# 若該 Work/Entity 已在某志中能讀出，則手動；自動腳本不做過度猜測。
# 這裡保守：AMBIGUOUS_RAW 中 dynasty 保持原值不動，但 period 先粗粒度兜底：
AMBIGUOUS_PERIOD_FALLBACK: dict[str, Optional[str]] = {
    "宋": None,      # 逐條判定
    "魏": None,      # 逐條
    "漢": "qin-han", # 西漢/東漢都在 qin-han，粗粒度可定
    "周": None,      # 逐條
    "齊": "nanbeichao",  # 南齊/北齊都在 nanbeichao
    "梁": None,      # nanbeichao 或 five-dynasties
    "吳": None,      # pre-qin / three-kingdoms / five-dynasties
    "蜀": None,      # three-kingdoms / five-dynasties
    "國朝": None,    # 多清，亦有明，逐條
}

# 跨朝代值：period 已在 CANONICAL_TO_PERIOD 處理；dynasty 保持原文
CROSS_DYNASTY_RAW = {"秦漢", "隋唐", "齊梁", "金元", "宋、齊",
                     "明末清初", "宋末元初", "元末明初"}

# 地點/外國非朝代的少量值：清 -> 明，或其他需要特判
SPECIAL_BRACKET = {
    "（清）": "清", "(清)": "清",
    "（明）": "明", "(明)": "明",
    "（宋）": "宋", "(宋)": "宋",
    "明 西洋": "明", "明 泰西": "明",
    "清 果親王": "清",
    "周（秦）": "周",
}


BASIS_SYNONYM = "synonym"
BASIS_CLEAN = "garbage_clean"
BASIS_CROSS = "cross_dynasty"
BASIS_FOREIGN = "foreign"
BASIS_ALREADY_CANONICAL = "already_canonical"


def classify_and_normalize(raw_dyn: Optional[str]) -> dict:
    """
    返回:
      { dynasty: str | None,
        period:  str | None,
        basis:   str | None,    # dynasty_basis（若改過 dynasty）
        changed: bool,
        category: str,          # debug
      }
    """
    if raw_dyn is None:
        return {"dynasty": None, "period": None,
                "basis": None, "changed": False, "category": "null"}

    raw = raw_dyn.strip()
    if raw == "":
        return {"dynasty": None, "period": None,
                "basis": None, "changed": bool(raw_dyn), "category": "empty"}

    # 1) 特殊括號 / 綴字先清理
    if raw in SPECIAL_BRACKET:
        cleaned = SPECIAL_BRACKET[raw]
        r2 = classify_and_normalize(cleaned)
        if r2["basis"]:
            r2["basis"] = f"{BASIS_CLEAN}:{raw}->{cleaned};" + r2["basis"]
        else:
            r2["basis"] = f"{BASIS_CLEAN}:{raw}->{cleaned}"
        r2["changed"] = True
        return r2

    # 2) 垃圾值
    if raw in GARBAGE_VALUES:
        return {"dynasty": None, "period": None,
                "basis": f"{BASIS_CLEAN}:{raw}",
                "changed": True, "category": "garbage"}

    # 3) 同義詞直接歸併
    if raw in ALIAS_TO_CANONICAL:
        canonical = ALIAS_TO_CANONICAL[raw]
        period = CANONICAL_TO_PERIOD.get(canonical)
        if canonical in FOREIGN_CANONICAL:
            period = None
        return {"dynasty": canonical, "period": period,
                "basis": f"{BASIS_SYNONYM}:{raw}->{canonical}",
                "changed": True, "category": "synonym"}

    # 4) 已是規範名
    if raw in CANONICAL_TO_PERIOD or raw in FOREIGN_CANONICAL or raw in CROSS_DYNASTY_RAW:
        if raw in FOREIGN_CANONICAL:
            period = None
        else:
            period = CANONICAL_TO_PERIOD.get(raw)
        return {"dynasty": raw, "period": period,
                "basis": None, "changed": False,
                "category": "canonical"}

    # 5) 歧義原文，保持 dynasty 不動，period 兜底
    if raw in AMBIGUOUS_RAW:
        period = AMBIGUOUS_PERIOD_FALLBACK.get(raw)
        return {"dynasty": raw, "period": period,
                "basis": None, "changed": False,  # 留待手動
                "category": "ambiguous"}

    # 6) 未知 -> 保持原值，記錄 unknown
    return {"dynasty": raw, "period": None,
            "basis": None, "changed": False, "category": "unknown"}


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")


# ================== 源文件 (Work / Entity) 處理 ==================

def iter_work_files(root: Path):
    return sorted((root / "Work").glob("?/?/?/*.json"))


def iter_entity_files(root: Path):
    return sorted((root / "Entity").glob("?/?/?/*.json"))


def process_work_data(data: dict, stats: Counter, force: bool) -> bool:
    """
    修改 Work JSON：
      - 頂層 dynasty 規範化
      - 頂層 period / dynasty_basis（若空則補）
      - authors[] 中每個 author 的 dynasty 同步規範化
    返回是否有變動。
    """
    changed = False

    # 頂層 dynasty
    raw_dyn = data.get("dynasty")
    res = classify_and_normalize(raw_dyn)
    if res["changed"] and (res["dynasty"] != raw_dyn):
        data["dynasty"] = res["dynasty"]
        if res["basis"]:
            data["dynasty_basis"] = res["basis"] + (
                ("; " + data["dynasty_basis"]) if data.get("dynasty_basis") and not force else "")
        changed = True
        stats[f"work.top.{res['category']}"] += 1

    # period 補值 / 強制覆蓋
    canonical = data.get("dynasty")
    new_period = None
    if canonical in FOREIGN_CANONICAL:
        new_period = None
    elif canonical in CANONICAL_TO_PERIOD:
        new_period = CANONICAL_TO_PERIOD[canonical]
    elif canonical in AMBIGUOUS_RAW:
        new_period = AMBIGUOUS_PERIOD_FALLBACK.get(canonical)
    else:
        new_period = None  # unknown / null / ambiguous-without-fallback

    cur_period = data.get("period")
    if new_period is not None:
        if force or not cur_period:
            if cur_period != new_period:
                data["period"] = new_period
                data["period_basis"] = (
                    f"據 dynasty「{canonical}」自動歸併"
                    if res["category"] != "ambiguous"
                    else f"據 dynasty「{canonical}」粗粒度 period 兜底（canonical 仍需人工拆分）"
                )
                changed = True
                stats["work.period_filled"] += 1
    elif canonical in FOREIGN_CANONICAL:
        if cur_period is not None and (force or False):
            # 域外一般不設 period；這裡僅移除錯誤 period（若 force）
            pass

    # authors[] 內的 dynasty
    authors = data.get("authors")
    if isinstance(authors, list):
        for a in authors:
            if not isinstance(a, dict):
                continue
            a_raw = a.get("dynasty")
            a_res = classify_and_normalize(a_raw)
            if a_res["changed"] and (a_res["dynasty"] != a_raw):
                a["dynasty"] = a_res["dynasty"]
                if a_res["basis"]:
                    a["dynasty_basis"] = a_res["basis"]
                changed = True
                stats[f"work.author.{a_res['category']}"] += 1

    if changed:
        data["updated_at"] = now_iso()
    return changed


def process_entity_data(data: dict, stats: Counter, force: bool) -> bool:
    changed = False
    raw_dyn = data.get("dynasty")
    res = classify_and_normalize(raw_dyn)
    if res["changed"] and (res["dynasty"] != raw_dyn):
        data["dynasty"] = res["dynasty"]
        if res["basis"]:
            data["dynasty_basis"] = res["basis"]
        changed = True
        stats[f"entity.top.{res['category']}"] += 1

    canonical = data.get("dynasty")
    new_period = None
    if canonical in FOREIGN_CANONICAL:
        new_period = None
    elif canonical in CANONICAL_TO_PERIOD:
        new_period = CANONICAL_TO_PERIOD[canonical]
    elif canonical in AMBIGUOUS_RAW:
        new_period = AMBIGUOUS_PERIOD_FALLBACK.get(canonical)

    cur_period = data.get("period")
    if new_period is not None:
        if force or not cur_period:
            if cur_period != new_period:
                data["period"] = new_period
                data["period_basis"] = (
                    f"據 dynasty「{canonical}」自動歸併"
                    if res["category"] != "ambiguous"
                    else f"據 dynasty「{canonical}」粗粒度 period 兜底（canonical 仍需人工拆分）"
                )
                changed = True
                stats["entity.period_filled"] += 1

    if changed:
        data["updated_at"] = now_iso()
    return changed


# ================== 索引 (index.json + index/*) 處理 ==================

def process_index_json(index_data: dict, stats: Counter) -> bool:
    """更新 index.json -> works[].dynasty（僅同步義/垃圾，不碰 ambiguous）"""
    changed = False
    works = index_data.get("works", {})
    for wid, w in works.items():
        if not isinstance(w, dict):
            continue
        raw = w.get("dynasty")
        res = classify_and_normalize(raw)
        if res["changed"]:
            w["dynasty"] = res["dynasty"]
            changed = True
            stats[f"index_json.{res['category']}"] += 1
    return changed


def process_shard_index(shard_path: Path, stats: Counter, kind: str) -> bool:
    """更新 index/works/*.json 或 index/entities/*.json 分片"""
    changed = False
    data = json.loads(shard_path.read_text(encoding="utf-8"))
    assert isinstance(data, dict)
    for _id, entry in data.items():
        if not isinstance(entry, dict):
            continue
        raw = entry.get("dynasty")
        res = classify_and_normalize(raw)
        if res["changed"]:
            entry["dynasty"] = res["dynasty"]
            changed = True
            stats[f"index_shard.{kind}.{res['category']}"] += 1

        # 補 period（index/works 的 entry 裡原來就有 period，index/entities 視情況）
        canonical = entry.get("dynasty")
        new_period = None
        if canonical in CANONICAL_TO_PERIOD:
            new_period = CANONICAL_TO_PERIOD[canonical]
        elif canonical in AMBIGUOUS_RAW:
            new_period = AMBIGUOUS_PERIOD_FALLBACK.get(canonical)

        if new_period is not None:
            cur_period = entry.get("period")
            if not cur_period:
                entry["period"] = new_period
                changed = True
                stats[f"index_shard.{kind}.period_filled"] += 1
    if changed:
        shard_path.write_text(
            json.dumps(data, indent=2, ensure_ascii=False),
            encoding="utf-8"
        )
    return changed


# ================== 主流程 ==================

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="不落盤")
    ap.add_argument("--force", action="store_true",
                    help="即使 period/dynasty_basis 已存在也覆蓋")
    ap.add_argument("--root", type=str, default=None)
    args = ap.parse_args()

    if args.root:
        root = Path(args.root).resolve()
    else:
        root = Path(__file__).resolve().parent.parent

    commit = not args.dry_run
    stats: Counter = Counter()

    # 1. Work 源文件
    for fp in iter_work_files(root):
        data = json.loads(fp.read_text(encoding="utf-8"))
        if process_work_data(data, stats, args.force):
            stats["work.files_changed"] += 1
            if commit:
                fp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n",
                              encoding="utf-8")

    # 2. Entity 源文件
    for fp in iter_entity_files(root):
        data = json.loads(fp.read_text(encoding="utf-8"))
        if process_entity_data(data, stats, args.force):
            stats["entity.files_changed"] += 1
            if commit:
                fp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n",
                              encoding="utf-8")

    # 3. index.json
    index_file = root / "index.json"
    if index_file.exists():
        idx = json.loads(index_file.read_text(encoding="utf-8"))
        if process_index_json(idx, stats):
            stats["index_json.changed"] = 1
            if commit:
                index_file.write_text(
                    json.dumps(idx, indent=2, ensure_ascii=False),
                    encoding="utf-8"
                )

    # 4. index/works shards
    for fp in sorted((root / "index" / "works").glob("*.json")):
        if process_shard_index(fp, stats, "works"):
            stats["index_shard.works.shards_changed"] += 1

    # 5. index/entities shards (若存在)
    ent_dir = root / "index" / "entities"
    if ent_dir.exists():
        for fp in sorted(ent_dir.glob("*.json")):
            if process_shard_index(fp, stats, "entities"):
                stats["index_shard.entities.shards_changed"] += 1

    # 報告
    mode = "[DRY-RUN] " if args.dry_run else "[COMMIT] "
    print(mode + "朝代規範化完成，統計：")
    for k, v in sorted(stats.items()):
        print(f"  {k:45s} {v:>6}")

    # 列出 remaining ambiguous (未自動拆分的宋/魏/漢/周/齊/梁/吳/蜀)
    # 用於生成 known-issues 清單
    amb_ctr = Counter()
    amb_examples: dict[str, list[str]] = {}

    def _walk_for_ambiguous(files, label):
        for fp in files:
            try:
                d = json.loads(fp.read_text(encoding="utf-8"))
            except Exception:
                continue
            if isinstance(d, dict):
                for raw in (d.get("dynasty"),):
                    if raw in AMBIGUOUS_RAW:
                        amb_ctr[f"{label}.{raw}"] += 1
                        amb_examples.setdefault(f"{label}.{raw}", [])
                        if len(amb_examples[f"{label}.{raw}"]) < 5:
                            amb_examples[f"{label}.{raw}"].append(
                                d.get("id", fp.stem)
                            )
                if label == "work":
                    for a in d.get("authors") or []:
                        if isinstance(a, dict):
                            ar = a.get("dynasty")
                            if ar in AMBIGUOUS_RAW:
                                amb_ctr[f"work.author.{ar}"] += 1

    _walk_for_ambiguous(iter_work_files(root), "work")
    _walk_for_ambiguous(iter_entity_files(root), "entity")

    if amb_ctr:
        print("\n仍需手動拆分的歧義朝代統計：")
        for k, v in sorted(amb_ctr.items(), key=lambda x: -x[1]):
            ex = ", ".join(amb_examples.get(k, [])[:3])
            print(f"  {k:30s} {v:>5}   例: {ex}")
    else:
        print("\n無需手動拆分的歧義朝代。")


if __name__ == "__main__":
    main()
