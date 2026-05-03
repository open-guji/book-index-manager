"""共用纯函数工具，避免 storage <-> migration 等模块间循环 import。"""


def strip_nulls(obj):
    """递归移除 dict 中值为 None 的字段。"""
    if isinstance(obj, dict):
        return {k: strip_nulls(v) for k, v in obj.items() if v is not None}
    if isinstance(obj, list):
        return [strip_nulls(item) for item in obj]
    return obj
