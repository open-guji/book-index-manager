"""由 mapping 生成建表语句（PostgreSQL 16）。

  python -m book_index_manager.db ddl > schema/db/schema.sql

外键单独出（constraints()）：建表 → COPY → 外键 NOT VALID → 查悬空 → VALIDATE。
"""
from .mapping import ENUMS, INDEXES, RECORDS, REFS
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
    out = ['-- 外键（生成物）：先 NOT VALID，查过悬空再 VALIDATE。都是 DEFERRABLE：增量建库先删后灌，提交时才查。']
    for t in TABLES.values():
        for cols, target, tcols in t.fk:
            name = '%s_%s_fk' % (t.name, '_'.join(cols))
            ref = '%s (%s)' % (target, ', '.join(tcols)) if tcols else target
            out.append('ALTER TABLE %s ADD CONSTRAINT %s FOREIGN KEY (%s) REFERENCES %s ON DELETE CASCADE '
                       'DEFERRABLE NOT VALID;' % (t.name, name, ', '.join(cols), ref))
    out.append('-- 跨记录引用（目标唯一的才加外键；悬空清单见 checks.sql）')
    for table, col, targets in REFS:
        if len(targets) == 1:
            out.append('ALTER TABLE %s ADD CONSTRAINT %s_%s_ref FOREIGN KEY (%s) REFERENCES %s (id) DEFERRABLE NOT VALID;'
                       % (table, table, col, col, targets[0]))
    out.append('')
    return '\n'.join(out)


def checks_sql():
    """悬空与口径检查（灌库后、VALIDATE 前跑；每条应返回 0 行）。"""
    out = ['-- 悬空与口径检查（生成物）：灌库后、VALIDATE 前跑，每条应返回 0 行。']
    for table, col, targets in REFS:
        t = TABLES[table]
        key = t.pk[0]
        cond = ' AND '.join('NOT EXISTS (SELECT 1 FROM %s x WHERE x.id = r.%s)' % (tg, col) for tg in targets)
        out.append("SELECT '%s.%s 悬空' chk, r.%s, r.%s FROM %s r WHERE r.%s IS NOT NULL AND %s;"
                   % (table, col, key, col, table, col, cond))
    out.append('-- 旧号要解得到现行记录，终点不能还是墓碑')
    out.append("SELECT 'id_map.live_id 解不到' chk, m.old_id, m.src, m.direct_into FROM id_map m WHERE m.live_id IS NULL;")
    out.append("SELECT 'id_map.live_id 仍是墓碑' chk, m.old_id, m.live_id FROM id_map m "
               "WHERE m.live_id IN (SELECT old_id FROM id_map WHERE src = 'tombstone');")
    out.append('-- 共用明细表的 owner_type 与 id 实际所在主表一致')
    mains = {r.owner_type: r.table for r in RECORDS.values()}
    for t in TABLES.values():
        if 'owner_type' not in t.cols:
            continue
        owner = t.pk[0]
        live = t.name == 'id_map' and 'live_id' in t.cols   # 旧号多已不在主表，查它解到的现行记录
        if live:
            owner = 'live_id'
        cond = ' OR '.join("(r.owner_type = '%s' AND EXISTS (SELECT 1 FROM %s x WHERE x.id = r.%s))"
                           % (ot, mains[ot], owner) for ot in sorted(mains))
        out.append("SELECT '%s.owner_type 不符' chk, r.%s FROM %s r WHERE %sNOT (%s);"
                   % (t.name, owner, t.name, 'r.live_id IS NOT NULL AND ' if live else '', cond))
    out.append('-- 四类主表 id 不得重复')
    out.append("SELECT 'id 跨类重复' chk, id FROM (%s) t GROUP BY id HAVING count(*) > 1;"
               % ' UNION ALL '.join('SELECT id FROM %s' % r.table for r in RECORDS.values()))
    out.append('')
    return '\n'.join(out)


def summary():
    """[(表, 列数, 用到的记录类型)]，供文档与测试。"""
    return [(t.name, len(t.cols), sorted(t.users)) for t in TABLES.values()]


__all__ = ['schema_sql', 'constraints_sql', 'checks_sql', 'summary', 'RECORDS']
