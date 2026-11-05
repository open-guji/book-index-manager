"""由 mapping 生成建表语句（PostgreSQL 16）。

  python -m book_index_manager.db ddl > schema/db/schema.sql

外键单独出（constraints()）：建表 → COPY → 外键 NOT VALID → 查悬空 → VALIDATE。
"""
from .mapping import ENUMS, INDEXES, RECORDS
from .tables import TABLES

HEADER = """-- book-index 规范化目录库表结构（v2，PostgreSQL 16）。
-- 本文件由 book-index-manager 生成，不要手改：python -m book_index_manager.db ddl
-- 真源是 git 里的 JSON；映射见 book_index_manager/db/mapping.py。
-- 约定：每类记录一张主表；数组对象进明细表（owner + seq 保序）；多类共用的明细表带 owner_type（W/B/C/E）；
--   依据、判断备注、ai_note 等审计字段不建列，进该行 notes（jsonb，键名照源文件）；
--   映射里没有的键、装不进列的值原样进 extra（jsonb），还原无损。
"""


def _col(t, c):
    s = '  %s %s' % (c, t.sqltype(c))
    if c in t.notnull:
        s += ' NOT NULL'
    return s


def create_table(t):
    lines = [_col(t, c) for c in t.cols]
    if t.pk:
        lines.append('  PRIMARY KEY (%s)' % ', '.join(t.pk))
    head = '-- %s\n' % t.comment if t.comment else ''
    users = sorted(t.users)
    if len(users) > 1:
        head += '-- 共用：%s\n' % '、'.join(users)
    return '%sCREATE TABLE %s (\n%s\n);' % (head, t.name, ',\n'.join(lines))


def schema_sql():
    out = [HEADER, 'CREATE EXTENSION IF NOT EXISTS pg_trgm;', '']
    for name, vals in ENUMS.items():
        out.append("CREATE TYPE %s AS ENUM (%s);" % (name, ', '.join("'%s'" % v for v in vals)))
    out.append('')
    for t in TABLES.values():
        out.append(create_table(t))
        out.append('')
    out.extend(i + ';' for i in INDEXES)
    out.append('')
    return '\n'.join(out)


def constraints_sql():
    out = ['-- 外键（生成物）：先 NOT VALID，查过悬空再 VALIDATE。']
    for t in TABLES.values():
        for cols, target, tcols in t.fk:
            name = '%s_%s_fk' % (t.name, '_'.join(cols))
            ref = '%s (%s)' % (target, ', '.join(tcols)) if tcols else target
            out.append('ALTER TABLE %s ADD CONSTRAINT %s FOREIGN KEY (%s) REFERENCES %s ON DELETE CASCADE NOT VALID;'
                       % (t.name, name, ', '.join(cols), ref))
    out.append('')
    return '\n'.join(out)


def summary():
    """[(表, 列数, 用到的记录类型)]，供文档与测试。"""
    return [(t.name, len(t.cols), sorted(t.users)) for t in TABLES.values()]


__all__ = ['schema_sql', 'constraints_sql', 'summary', 'RECORDS']
