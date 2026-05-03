"""
metadata → index entry 字段提取（纯函数）。

历史上这部分逻辑写在 BookIndexStorage._build_index_entry，是 858 行
storage.py 中最容易独立测试的部分（无 IO，仅字典字段映射）。抽出来
以便：

1. 单元测试可以直接传 dict 验证输出（不需要文件系统）
2. 其他工具（如 reindex 脚本、迁移脚本）可以复用
3. 与 TS 端 IndexEntry 字段对齐时，作为 single source of truth

字段映射规则与 ui/src/core/storage.ts 的 IndexFileEntry 保持一致。
"""
from typing import Any, Dict, List, Optional

from .id_generator import BookIndexType


def _extract_titles_list(raw: Any) -> List[str]:
    """从 additional_titles / attached_texts 提取字符串列表。

    输入可能是：
    - 字符串列表 ["a", "b"] → 原样
    - 对象列表 [{"book_title": "a"}, ...] → 提取 book_title
    - 其他/None → 空列表
    """
    if not isinstance(raw, list):
        return []
    result: List[str] = []
    for t in raw:
        if isinstance(t, str) and t:
            result.append(t)
        elif isinstance(t, dict) and t.get("book_title"):
            result.append(t["book_title"])
    return result


def _extract_first_author(metadata: Dict[str, Any]) -> Dict[str, str]:
    """从 metadata.authors 提取首位作者的 name/dynasty/role。

    historic shape 兼容：
    - [{"name": ..., "dynasty": ..., "role": ...}, ...] → 取第一个
    - ["施耐庵", ...] → name
    - "施耐庵" → name
    """
    out = {"name": "", "dynasty": "", "role": ""}
    authors = metadata.get("authors", [])
    if isinstance(authors, list) and len(authors) > 0:
        first = authors[0]
        if isinstance(first, dict):
            out["name"] = first.get("name", "")
            out["dynasty"] = first.get("dynasty", "")
            out["role"] = first.get("role", "")
        else:
            out["name"] = str(first)
    elif isinstance(authors, str):
        out["name"] = authors
    return out


def _extract_year(metadata: Dict[str, Any]) -> str:
    """从 publication_info 提取年份字符串。"""
    pub = metadata.get("publication_info")
    if isinstance(pub, dict):
        return pub.get("year", "")
    if isinstance(pub, str):
        return pub
    return ""


def _extract_holder(metadata: Dict[str, Any]) -> str:
    """从 current_location 提取持有方名称。"""
    loc = metadata.get("current_location")
    if isinstance(loc, dict):
        return loc.get("name", "")
    if isinstance(loc, str):
        return loc
    return ""


def _extract_juan_count(metadata: Dict[str, Any]) -> int:
    """从 juan_count 提取卷数（int）。

    juan_count 可能是 dict（{"number": ..., "description": ...}）
    或纯数字。
    """
    vc = metadata.get("juan_count")
    if isinstance(vc, dict):
        return vc.get("number", 0) or 0
    if isinstance(vc, (int, float)):
        return int(vc)
    return 0


def _extract_resource_flags(metadata: Dict[str, Any]) -> Dict[str, bool]:
    """从 resources 提取 has_text / has_image 标记。

    新格式 resources[].types: ["text", "image"]
    旧格式 resources[].type: "text" | "image" | "text+image"
    """
    has_text = False
    has_image = False
    resources = metadata.get("resources", [])
    if not isinstance(resources, list):
        return {"has_text": False, "has_image": False}

    for r in resources:
        if not isinstance(r, dict):
            continue
        types_arr = r.get("types")
        if isinstance(types_arr, list) and types_arr:
            if "text" in types_arr:
                has_text = True
            if "image" in types_arr:
                has_image = True
        else:
            rt = r.get("type", "")
            if rt in ("text", "text+image"):
                has_text = True
            if rt in ("image", "text+image"):
                has_image = True
    return {"has_text": has_text, "has_image": has_image}


def build_entity_index_entry(metadata: Dict[str, Any], id_str: str, rel_path: str) -> Dict[str, Any]:
    """Entity 类型的 index 条目（people/place/dynasty/...）。"""
    subtype = metadata.get("subtype", "people")
    primary_name = metadata.get("primary_name", "")
    dynasty = metadata.get("dynasty", "")
    birth_year = metadata.get("birth_year")
    death_year = metadata.get("death_year")

    external = metadata.get("external_ids") or {}
    cbdb_id = external.get("cbdb_id") if isinstance(external, dict) else None

    entry: Dict[str, Any] = {
        "id": id_str,
        "type": "entity",
        "subtype": subtype,
        "primary_name": primary_name,
        "path": rel_path,
    }
    if dynasty:
        entry["dynasty"] = dynasty
    if birth_year is not None:
        entry["birth_year"] = birth_year
    if death_year is not None:
        entry["death_year"] = death_year
    if cbdb_id is not None:
        entry["cbdb_id"] = cbdb_id
    return entry


def build_index_entry(metadata: Dict[str, Any], type_val: BookIndexType, rel_path: str) -> Dict[str, Any]:
    """从 metadata dict 提取所有 index 字段。

    Entity 类型走单独的 build_entity_index_entry。
    其他类型（Book / Collection / Work）输出统一格式：
      {id, title, type, path, [author, year, holder, dynasty, role,
       juan_count, measure_info, additional_titles, attached_texts,
       has_text, has_image, edition, subtype]}

    可选字段仅当有值时出现（避免索引 shard 充斥空字段）。
    """
    id_str = metadata.get("id") or metadata.get("ID", "")

    if type_val == BookIndexType.Entity:
        return build_entity_index_entry(metadata, id_str, rel_path)

    title = metadata.get("title", "未命名")
    author = _extract_first_author(metadata)
    year = _extract_year(metadata)
    holder = _extract_holder(metadata)
    juan_count = _extract_juan_count(metadata)
    measure_info = metadata.get("measure_info", "") or ""
    edition = metadata.get("edition", "")
    subtype = metadata.get("subtype", "")
    additional_titles = _extract_titles_list(metadata.get("additional_titles", []))
    attached_texts = _extract_titles_list(metadata.get("attached_texts", []))
    flags = _extract_resource_flags(metadata)

    entry: Dict[str, Any] = {
        "id": id_str,
        "title": title,
        "type": type_val.name,
        "path": rel_path,
    }
    if author["name"]:
        entry["author"] = author["name"]
    if year:
        entry["year"] = year
    if holder:
        entry["holder"] = holder
    if author["dynasty"]:
        entry["dynasty"] = author["dynasty"]
    if author["role"]:
        entry["role"] = author["role"]
    if juan_count:
        entry["juan_count"] = juan_count
    if measure_info:
        entry["measure_info"] = measure_info
    if additional_titles:
        entry["additional_titles"] = additional_titles
    if attached_texts:
        entry["attached_texts"] = attached_texts
    if flags["has_text"]:
        entry["has_text"] = True
    if flags["has_image"]:
        entry["has_image"] = True
    if edition:
        entry["edition"] = edition
    if subtype:
        entry["subtype"] = subtype
    return entry
