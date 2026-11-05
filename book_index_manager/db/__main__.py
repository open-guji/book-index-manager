"""目录库命令。

  python -m book_index_manager.db ddl [--constraints|--checks] 打印建表语句（或外键、悬空检查）
  python -m book_index_manager.db coverage --schema DIR        「schema 有、映射没有」检查，有 ERROR 退出码 1
  python -m book_index_manager.db roundtrip --root DIR [--type T …] [--dsn DSN] [--keep] [--create]
      拆表再还原、逐条比对；不给 --dsn 只在内存里做，给了就真灌进 PostgreSQL 再读回。
  python -m book_index_manager.db build --root DIR --dsn DSN [--full] [--verify]
      建库：表结构没变就按 git diff 增量，否则全量；id_map 装墓碑、台账、升格表并解到现行记录。
"""
import argparse
import collections
import glob
import json
import os
import sys
import time

from .mapping import RECORDS


def load_docs(root, name, limit=None):
    paths = sorted(glob.glob(os.path.join(root, name, '*', '*', '*', '*.json')))[:limit]
    docs = []
    for p in paths:
        with open(p, encoding='utf-8') as f:
            docs.append(json.load(f))
    return docs


def main(argv=None):
    ap = argparse.ArgumentParser(prog='python -m book_index_manager.db')
    sp = ap.add_subparsers(dest='cmd', required=True)
    p = sp.add_parser('ddl')
    p.add_argument('--constraints', action='store_true')
    p.add_argument('--checks', action='store_true')
    p = sp.add_parser('coverage')
    p.add_argument('--schema', required=True, help='book-index 的 schema/json 目录')
    p = sp.add_parser('build')
    p.add_argument('--root', required=True, help='book-index 仓根目录（工作区须在 HEAD 且干净）')
    p.add_argument('--dsn', required=True)
    p.add_argument('--full', action='store_true', help='不管上次建到哪，整库重建')
    p.add_argument('--verify', action='store_true', help='建完把四类记录还原，与文件逐条比对')
    p.add_argument('--text-root', help='book-text 仓根目录：给了就把它的 manifest、版本 index.json、辑佚一起进库')
    p = sp.add_parser('roundtrip')
    p.add_argument('--root', required=True, help='book-index 仓根目录')
    p.add_argument('--type', action='append', choices=sorted(RECORDS))
    p.add_argument('--limit', type=int)
    p.add_argument('--dsn')
    p.add_argument('--create', action='store_true', help='先清空并按映射建表（要 --dsn）')
    p.add_argument('--keep', action='store_true', help='比对全过才提交（要 --dsn）')
    a = ap.parse_args(argv)

    if a.cmd == 'ddl':
        from .ddl import checks_sql, constraints_sql, schema_sql
        sys.stdout.write(constraints_sql() if a.constraints else checks_sql() if a.checks else schema_sql())
        return 0
    if a.cmd == 'coverage':
        from .coverage import check
        errors, warns = check(a.schema)
        for e in errors:
            print('ERROR', e)
        for w in warns:
            print('WARN ', w)
        print('coverage：ERROR %d　WARN %d' % (len(errors), len(warns)))
        return 1 if errors else 0

    if a.cmd == 'build':
        from .build import build, verify
        build(a.root, a.dsn, full=a.full, text_root=a.text_root)
        if a.verify:
            return 1 if verify(a.root, a.dsn, text_root=a.text_root) else 0
        return 0

    types = a.type or ['Collection', 'Entity', 'Work', 'Book']
    if a.dsn and a.create:
        from .pg import _psycopg, create_schema
        psycopg, _ = _psycopg()
        with psycopg.connect(a.dsn) as conn, conn.cursor() as cur:
            create_schema(cur, drop=True)
    failed = 0
    for name in types:
        t0 = time.time()
        docs = load_docs(a.root, name, a.limit)
        rec = RECORDS[name]
        if a.dsn:
            from .pg import roundtrip_pg
            n_bad, keys = roundtrip_pg(a.dsn, rec, docs, keep=a.keep)
        else:
            from .shred import roundtrip
            bad, _ = roundtrip(rec, docs)
            n_bad = len(bad)
            keys = collections.Counter(k for _, ks in bad for k in ks)
            for oid, ks in bad[:5]:
                print('不一致', oid, ks)
        print('%s：%d 条，还原不一致 %d %s，%.0fs' % (name, len(docs), n_bad, dict(keys), time.time() - t0), flush=True)
        failed += n_bad
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
