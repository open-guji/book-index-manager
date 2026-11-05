"""装进 PostgreSQL 与读回（要 psycopg 3；bim 本身不依赖它，只有建库时才装）。"""
import collections
import json

from .ddl import constraints_sql, schema_sql
from .shred import Rows, restore, shred
from .tables import TABLES


def _psycopg():
    try:
        import psycopg
        from psycopg.types.json import Jsonb
    except ImportError as e:  # pragma: no cover
        raise SystemExit('建库要 psycopg 3：pip install "psycopg[binary]"') from e
    return psycopg, Jsonb


def create_schema(cur, drop=False):
    if drop:
        cur.execute('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
    cur.execute(schema_sql())


def add_constraints(cur):
    cur.execute(constraints_sql())


NUL_KEY = '\x01nul'   # jsonb 存不了 \u0000：含它的值整体转成 JSON 字符串包一层，读回时拆开


def _js_in(v):
    s = json.dumps(v, ensure_ascii=False)
    return {NUL_KEY: s} if '\\u0000' in s else v


def _js_out(v):
    if isinstance(v, dict) and len(v) == 1 and NUL_KEY in v:
        return json.loads(v[NUL_KEY])
    return v


def copy_rows(cur, rows):
    """rows：Rows 或 {表: [行]}。按列集合分组 COPY。"""
    _, Jsonb = _psycopg()
    data = rows.t if isinstance(rows, Rows) else rows
    for table, rs in data.items():
        t = TABLES[table]
        groups = collections.defaultdict(list)
        for r in rs:
            groups[tuple(r)].append(r)
        for cols, grp in groups.items():
            js = [t.cols[c] == 'jsonb' for c in cols]
            with cur.copy('COPY %s (%s) FROM STDIN' % (table, ','.join(cols))) as cp:
                for r in grp:
                    cp.write_row([Jsonb(_js_in(r[c])) if j else r[c] for c, j in zip(cols, js)])


def fetch_rows(cur, tables, where=None):
    """读回 {表: [行]}。where：{表: (sql 条件, 参数)}。"""
    out = {}
    for table in tables:
        cond, args = (where or {}).get(table, (None, ()))
        cur.execute('SELECT * FROM %s%s' % (table, ' WHERE ' + cond if cond else ''), args)
        names = [c.name for c in cur.description]
        js = [TABLES[table].cols.get(n) == 'jsonb' for n in names]
        out[table] = [{k: (_js_out(v) if j else v) for k, v, j in zip(names, r, js) if v is not None}
                      for r in cur.fetchall()]
    return out


def tables_of(rec):
    names = {rec.table}
    names.update(s.table for s in rec.side.values())
    for kid in rec.kids.values():
        names.add(kid.table)
        names.update(s.table for s in kid.sub.values())
    return sorted(names)


def roundtrip_pg(dsn, rec, docs, keep=False, log=print):
    """拆表 → COPY → 读回 → 还原 → 逐条比对。回 (不一致条数, 各键计数)。不 keep 则回滚。"""
    psycopg, _ = _psycopg()
    rows = Rows()
    for d in docs:
        shred(rec, d, rows)
    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        copy_rows(cur, rows)
        log('灌库 %s' % {t: len(r) for t, r in rows.t.items()})
        back = restore(rec, fetch_rows(cur, tables_of(rec)))
        bad = collections.Counter()
        n_bad = 0
        for d in docs:
            r = back.get(d['id'])
            if r != d:
                n_bad += 1
                diff = sorted(k for k in set(d) | set(r or {}) if d.get(k) != (r or {}).get(k))
                bad.update(diff)
                if n_bad <= 5:
                    log('不一致 %s %s' % (d['id'], json.dumps({k: [d.get(k), (r or {}).get(k)] for k in diff[:2]},
                                                           ensure_ascii=False, default=str)[:400]))
        if keep and not n_bad:
            conn.commit()
        else:
            conn.rollback()
    return n_bad, bad
