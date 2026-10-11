"""共用纯函数工具，避免 storage <-> migration 等模块间循环 import。"""


def strip_nulls(obj):
    """递归移除 dict 中值为 None 的字段。"""
    if isinstance(obj, dict):
        return {k: strip_nulls(v) for k, v in obj.items() if v is not None}
    if isinstance(obj, list):
        return [strip_nulls(item) for item in obj]
    return obj


# ── 派生欄位的底線前綴（SCHEMA.md §記錄之共通欄位）──────────────────
#
# 條目檔（Work/Book/Collection/Entity）裡，凡由其它欄位或外部檔案推導而來的欄位
# 一律以 `_` 起首：`_has_text`、`_has_image`、`_has_collated`、`_promoted_to`、
# `_promoted_at`。用意是让它们与手写栏一眼可分——校验时对 `_` 起首者一律重算比对，
# 手写无用。
#
# **`index/` 之欄不加底線**：整个 index 文件都是派生产物，档级已说明此事，
# 栏再加底线是重复。promotions.json 同理（它本身就是权威对照表）。
#
# tombstone 的 promoted_to / promoted_at 属派生：promotions.json 是权威，
# 条目档上的只是冗余副本。

PROMOTED_TO = "_promoted_to"
PROMOTED_AT = "_promoted_at"


def read_promoted_to(metadata: dict) -> object:
    """读条目档的 `_promoted_to`（schema-v2 起条目档不带，权威是 promotions.json）。"""
    if not isinstance(metadata, dict):
        return None
    return metadata.get(PROMOTED_TO)


def read_promoted_at(metadata: dict) -> object:
    """读条目档的 `_promoted_at`。"""
    if not isinstance(metadata, dict):
        return None
    return metadata.get(PROMOTED_AT)


def strip_promotion_marks(metadata: dict) -> None:
    """从 production 副本上摘掉 tombstone 标记。"""
    for key in (PROMOTED_TO, PROMOTED_AT):
        metadata.pop(key, None)
