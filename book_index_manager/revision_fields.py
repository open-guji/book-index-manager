"""revision 的字段口径（SCHEMA〈十〉、F3-3）：`needs_bump(old, new)`。

`revision` 管的是「这条记录『是什么』的陈述」是否变了：题名、作者、年代、描述、资源、
著录、关系（存储一侧）等变了算；分类归属、反向链／成员清单、一切 `_` 派生栏、管理栏变了
不算（不 bump、也不刷新 `revised_at`）。**未登记的新字段按「算」处理**；要加不算的字段，
须登记进下面的 `NO_BUMP_FIELDS` 并在 SCHEMA〈十〉说明。

与 overview `F-数据结构/试验/F3/revision_fields.py` 同口径；schema-v2 新增了
`promoted_to`／`promoted_at`（旧墓碑印记）与 `contained_works`（旧叢編成员清单）两类旧字段，
它们是派生／成员清单，不算。
"""

# 不算：派生（build 生成、schema-v2 起不在源档里）、成员清单、管理栏
NO_BUMP_FIELDS = frozenset({
    'classification',                           # 分类移到 classification/ 类档；迁移期留在源档时也不算
    'books', 'contained_works',                 # 反向链／成员清单：由 Book.work_id、contained_in 生成
    '_edition_count', '_has_image', '_has_text', '_has_collated',
    'has_image', 'has_text', 'has_collated',    # 旧版重复字段，等价于 _has_*
    'promoted_to', 'promoted_at', '_promoted_to', '_promoted_at',   # 墓碑印记（schema-v2 起不写）
    'updated_at', 'revision', 'revised_at', 'schema_version', 'id', 'type', 'path',
})


def needs_bump(old: dict, new: dict) -> bool:
    """`old`→`new` 的变化里有没有「算」的字段。`_` 起首者一律不算。"""
    for k in set(old) | set(new):
        if k in NO_BUMP_FIELDS or k.startswith('_'):
            continue
        if old.get(k) != new.get(k):
            return True
    return False
