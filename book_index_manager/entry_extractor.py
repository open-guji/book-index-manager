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

from ._utils import read_promoted_to
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


def _first_author_dynasty(metadata: Dict[str, Any]) -> str:
    """authors[] 中第一个有非空 dynasty 的作者的朝代（不限第 1 位）；没有则空串。"""
    authors = metadata.get("authors", [])
    if isinstance(authors, list):
        for a in authors:
            if isinstance(a, dict) and isinstance(a.get("dynasty"), str) and a["dynasty"]:
                return a["dynasty"]
    return ""


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


def _extract_dating(metadata: Dict[str, Any]) -> Dict[str, Any]:
    """从 Book.dating 投影索引要用的两个字段：era（刊刻朝代）与 sort_year（排序锚点）。

    只投影这两个——索引是派生产物，只放列表/搜索够用的；reign/basis/based_on
    留在条目档给详情页。sort_year 取确切年，没有就取区间下界（「明洪武間」→ 1368），
    再没有就不给（只知朝代的条目靠 era 排，前端 sortYear 会退到朝代起始年）。

    读的是 dating，**不是** authors[0].dynasty——那是撰人朝代，走 dynasty 字段。
    史記·武英殿本 dynasty=西漢（司馬遷）、era=清（武英殿），本就是两回事。

    此前这里写的是 publication_info.year 的自由文本（"1589"／"清乾隆中後期抄本"），
    但 TS 端 IndexEntry 运行时类型从不读它，搜索分片也不带——零消费者，已删。
    与 ui/src/core/storage.ts 的 datingProjection 等价，两侧必须同步。
    方案：overview/项目进展/古籍索引网站/整体设计/2026-09-年代字段统一方案.md
    """
    out: Dict[str, Any] = {}
    dating = metadata.get("dating")
    if not isinstance(dating, dict):
        return out
    era = dating.get("era")
    if isinstance(era, str) and era:
        out["era"] = era
    year = dating.get("year")
    if isinstance(year, int) and not isinstance(year, bool):
        out["sort_year"] = year
    else:
        rng = dating.get("year_range")
        if isinstance(rng, list) and len(rng) == 2 and isinstance(rng[0], int):
            out["sort_year"] = rng[0]
    return out


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


def build_entity_index_entry(metadata: Dict[str, Any], id_str: str, rel_path: str,
                             promoted_to: Optional[str] = None) -> Dict[str, Any]:
    """Entity 类型的 index 条目（people/place/dynasty/...）。

    `period` 与 Work 同理，是选集合用的粗粒度时代轴，必须入 index
    （SCHEMA.md §period：「period 亦入 index/works/*.json，選集合不必逐檔開啟」）。
    """
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
    period = metadata.get("period")
    if period:
        entry["period"] = period
    # 与 build_index_entry 同：墓碑的 promoted_to 必须入 index。
    # 此前唯独 entity 这一支漏了，index 认不出哪些 entity 已升格，后果有三：
    #   一、chk_entity 报「索引之 promoted_to 與墓碑不符」29058 条（即全部
    #       entity 墓碑），甲级非零，promote_entity 的闸门长期放行不了；
    #   二、kaiyuanguji-web 打包的 loadShardedIndex() 靠 promoted_to 跳过
    #       墓碑，认不出就会把 entity 墓碑当普通条目，去读其 path；
    #   三、据此误判「entity 墓碑可随手清理」——实则 index 仍以其档为落点。
    # schema-v2：墓碑档不再写 promoted_to，权威是 promotions.json，由调用方查好传入；
    # 档上还留着旧印记的（迁移前）以档为先，与 build_derived.index_entry 同。
    promoted_to = read_promoted_to(metadata) or promoted_to
    if promoted_to:
        entry["promoted_to"] = promoted_to
    return entry


def build_index_entry(metadata: Dict[str, Any], type_val: BookIndexType, rel_path: str,
                      promoted_to: Optional[str] = None) -> Dict[str, Any]:
    """从 metadata dict 提取所有 index 字段。

    Entity 类型走单独的 build_entity_index_entry。
    其他类型（Book / Collection / Work）输出统一格式：
      {id, title, type, path, [author, era, sort_year, holder, dynasty, role,
       juan_count, measure_info, additional_titles, attached_texts,
       has_text, has_image, has_collated, edition, subtype, period, loss_status,
       original_title, work_id, promoted_to]}

    可选字段仅当有值时出现（避免索引 shard 充斥空字段）。
    schema-v2：本函数与 book-index `build/build_derived.py` 的 `index_entry()` 逐字对齐
    （键序、取值规则一致，二者生成的 index 逐字节相同）。`promoted_to` 的权威来源是
    promotions.json，由调用方查好传入；`has_text`／`has_image` 只由 resources 推；
    `has_collated` 取源档 `_has_collated`／`has_collated`（暂留源档，SCHEMA〈十〉例外）。
    """
    id_str = metadata.get("id") or metadata.get("ID", "")

    if type_val == BookIndexType.Entity:
        return build_entity_index_entry(metadata, id_str, rel_path, promoted_to)

    title = metadata.get("title", "未命名")
    author = _extract_first_author(metadata)
    dating = _extract_dating(metadata)
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
    entry.update(dating)  # era / sort_year，见 _extract_dating
    if holder:
        entry["holder"] = holder
    # dynasty（撰人朝代）：authors[] 中第一个有朝代的作者优先，顶层字段兜底。
    #
    # 顶层兜底：出土文献按设计 authors 为空、顶层有 dynasty（book-index-draft
    # 2026-08-19 实测 2139 条），只读作者会让 reindex 把它们的朝代抹掉。
    # 作者优先：作者朝代往往更精确（三國吳 vs 晉、元末明初 vs 明）。
    # 不只看 authors[0]：首位作者朝代空而后位有者（正式库约 50 条）也要取到
    # （overview#496 §六-1，与 book-index build/build_derived.py index_entry、
    # ui/src/core/storage.ts 三处同步）。注意这与卡片 dyn（成书朝代，顶层优先）
    # 语义不同，目录经理 10-09 定不统一。
    dynasty = _first_author_dynasty(metadata) or metadata.get("dynasty") or ""
    if dynasty:
        entry["dynasty"] = dynasty
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
    if metadata.get("_has_collated") or metadata.get("has_collated"):
        entry["has_collated"] = True
    if edition:
        entry["edition"] = edition
    if subtype:
        entry["subtype"] = subtype
    # 以下字段一度只由外部脚本写入 index 而 build_index_entry 不产出，
    # 导致任何 save_item / reindex 都会把它们从索引里抹掉。见 tests/test_entry_extractor.py。
    period = metadata.get("period")
    if period:
        entry["period"] = period
    loss_status = metadata.get("loss_status")
    if loss_status:
        entry["loss_status"] = loss_status
    original_title = metadata.get("original_title")
    if original_title:
        entry["original_title"] = original_title
    work_id = metadata.get("work_id")
    if work_id:
        entry["work_id"] = work_id
    # 条目档上是 `_promoted_to`（派生栏带底线前缀），index 侧不加底线——
    # 整个 index 文件都是派生产物，栏再加底线是重复。见 SCHEMA.md §索引檔。
    promoted_to = read_promoted_to(metadata) or promoted_to
    if promoted_to:
        entry["promoted_to"] = promoted_to
    return entry
