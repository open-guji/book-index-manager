"""由 mapping 推出每张表的列、主键与外键（建表语句与装载共用）。"""
from collections import OrderedDict

from .mapping import ENUMS, RECORDS, TYPES, C, Kid, N


class Table:
    def __init__(self, name, comment=''):
        self.name, self.comment = name, comment
        self.cols = OrderedDict()      # 列名 → 类型名（TYPES／ENUMS 的键）
        self.notnull = set()
        self.pk = []
        self.fk = []                   # (列元组, 目标表, 目标列元组或 None)
        self.users = set()             # 用到本表的记录类型

    def add(self, col, type, notnull=False):
        old = self.cols.get(col)
        if old is not None and old != type:
            raise ValueError('%s.%s 类型冲突：%s / %s' % (self.name, col, old, type))
        self.cols[col] = type
        if notnull:
            self.notnull.add(col)

    def sqltype(self, col):
        t = self.cols[col]
        return t if t in ENUMS else TYPES[t]


def _field_cols(fields, scalar):
    """[(列名, C)]"""
    out = []
    for key, spec in fields.items():
        if isinstance(spec, C):
            out.append((spec.col or key, spec))
        elif isinstance(spec, tuple):
            out.extend((s.col, s) for s in spec)
    if scalar is not None:
        out.append((scalar.col, scalar))
    return out


def _has_notes(fields):
    return any(spec is N for spec in fields.values())


def kid_uses():
    """[(Record, 键, Kid, 上层 Kid 或 None)]，含 sub。"""
    out = []
    for rec in RECORDS.values():
        for key, kid in rec.kids.items():
            out.append((rec, key, kid, None))
            for sk, sub in kid.sub.items():
                out.append((rec, key + '[].' + sk, sub, kid))
    return out


def build_tables():
    tables = OrderedDict()

    def table(name):
        if name not in tables:
            tables[name] = Table(name)
        return tables[name]

    tables['build_meta'] = t = Table('build_meta', '建库记录：库里现在对应的 git 提交；ddl_sha 变了要全量重建')
    t.add('git_commit', 'text', True)
    t.add('built_at', 'text', True)
    t.add('ddl_sha', 'text', True)
    t.add('mode', 'text', True)
    t.pk = ['git_commit']

    # 主表
    for rec in RECORDS.values():
        t = table(rec.table)
        t.users.add(rec.name)
        for key, spec in rec.cols.items():
            t.add(spec.col or key, spec.type, spec.notnull)
        for key, fl in rec.flat.items():
            for col, spec in _field_cols(fl.fields, None):
                t.add(col, spec.type, spec.notnull)
        t.add('file_name', 'text')   # 源文件名（`{id}-{题名}.json`）：题名部分是建档时的，不总等于今天的题名，库产出 _build/ 要原样用
        t.add('notes', 'jsonb')
        t.add('extra', 'jsonb')
        t.pk = ['id']
        for st, side in rec.side.items():
            s = table(side.table)
            s.users.add(rec.name)
            s.comment = '%s 子类（subtype=%s）' % (rec.table, st)
            s.add('id', 'text', True)
            for key, spec in side.fields.items():
                if isinstance(spec, C):
                    s.add(spec.col or key, spec.type, spec.notnull)
            for key, fl in side.flat.items():
                for col, spec in _field_cols(fl.fields, None):
                    s.add(col, spec.type, spec.notnull)
            s.pk = ['id']
            s.fk.append((('id',), rec.table, None))

    # 明细表：先登记用途，判断是否多类共用
    uses = kid_uses()
    for rec, key, kid, parent in uses:
        table(kid.table).users.add(rec.name)
    for rec, key, kid, parent in uses:
        t = table(kid.table)
        shared = len(t.users) > 1
        if not t.pk:
            t.add(kid.owner, 'text', True)
            pk = [kid.owner]
            if shared:
                t.add('owner_type', 'char1', True)
            for fc in kid.fixed:
                t.add(fc, 'text', True)
                pk.append(fc)
            if parent is not None:
                t.add(kid.parent, 'int', True)
                pk.append(kid.parent)
                t.fk.append(((kid.owner, kid.parent), parent.table, (parent.owner, 'seq')))
            if kid.mode == 'list':
                t.add('seq', 'int', True)
                pk.append('seq')
            elif kid.mode == 'dict':
                t.add(kid.dictkey, 'text', True)
                pk.append(kid.dictkey)
            if kid.table == 'id_map':
                pk.append('direct_into')   # 台账里同一旧号偶有几个去向（history 7 条），都留
            t.pk = pk
            if not shared and parent is None and kid.table not in ('id_map',):
                t.fk.append(((kid.owner,), rec.table, ('id',)))
        else:
            if [c for c in kid.fixed if c not in t.cols]:
                raise ValueError('%s 各用途的区分列不一致' % kid.table)
        for col, spec in _field_cols(kid.fields, kid.scalar):
            t.add(col, spec.type, False)
        for c, ty in kid.cols.items():
            t.add(c, ty)
        if _has_notes(kid.fields):
            t.add('notes', 'jsonb')
    for name, t in tables.items():
        if name != 'build_meta' and 'extra' not in t.cols and not t.name in [s.table for r in RECORDS.values()
                                                                            for s in r.side.values()]:
            t.add('extra', 'jsonb')
    # notes 与 extra 挪到最后，便于读
    for t in tables.values():
        for c in ('notes', 'extra'):
            if c in t.cols:
                t.cols.move_to_end(c)
    return tables


TABLES = build_tables()
