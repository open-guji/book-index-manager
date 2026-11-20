"""目录库的版本：latest（跟 git main，catalog-sync 随时更新）与 stable（网站、搜索读它，可频繁晋升）。

  python -m book_index_manager.db release --dsn ADMIN_DSN init|status|promote|rollback N|freeze|unfreeze|resolve REF|changes …

库的布局（同一台 PostgreSQL 上）：
  catalog_latest   唯一的写者（catalog-sync）建它、更新它
  catalog_rN       晋升出来的只读副本，N 递增；保留最近 KEEP_OLD 个旧的，更旧的 DROP
  catalog_meta     小库：rel 表（每个 rel 的提交、表结构指纹、契约版、晋升时间）、pointer 表（stable 指到哪个 rel）、setting 表（冻结开关）

ADMIN_DSN 要有建库权限（CREATEDB），库名部分随便，这里按需替换。读者（网站、搜索、build）只用 resolve 回的 DSN，只读角色。

晋升（promote）：latest 的 `db check` 全 0、build_meta 比 stable 新、距上次晋升够一小时（--force 跳过），
`CREATE DATABASE catalog_rN TEMPLATE catalog_latest`（模板库不能有别的连接：先禁新连接、踢掉读者再复制，复制完恢复），
记 rel、把 stable 指过去、DROP 太旧的。**只在 catalog-sync 持锁时调用**（写者即调用者，复制期间 latest 无人写）。
回滚（rollback）：把 stable 指回还留着的旧 rel，不动数据。冻结（freeze）：晋升拒绝执行，stable 停在原处。
"""
import datetime
import json

from .build import _meta, ddl_sha
from .pg import _psycopg

LATEST_DB = 'catalog_latest'
META_DB = 'catalog_meta'
REL_PREFIX = 'catalog_r'
KEEP_OLD = 2          # stable 之外再留几个旧 rel
MIN_INTERVAL = 3600   # 两次晋升至少隔多少秒

META_SQL = '''
CREATE TABLE IF NOT EXISTS rel (
    n int PRIMARY KEY,
    db text NOT NULL,
    git_commit text, text_commit text, ddl_sha text,
    contract int,
    last_seq bigint,
    promoted_at timestamptz NOT NULL DEFAULT now(),
    dropped boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS pointer (name text PRIMARY KEY, rel int NOT NULL REFERENCES rel(n));
CREATE TABLE IF NOT EXISTS setting (key text PRIMARY KEY, value text);
'''


def _dsn(admin_dsn, dbname):
    from psycopg.conninfo import make_conninfo
    return make_conninfo(admin_dsn, dbname=dbname)


def _connect(admin_dsn, dbname, autocommit=False):
    psycopg, _ = _psycopg()
    return psycopg.connect(_dsn(admin_dsn, dbname), autocommit=autocommit)


def _ident(name):
    if not name.replace('_', '').isalnum():
        raise ValueError('库名不合法：%r' % name)
    return '"%s"' % name


def _server(admin_dsn):
    """连到服务器自带的 postgres 库做建库／删库／踢连接（这些命令不能在事务里）。"""
    return _connect(admin_dsn, 'postgres', autocommit=True)


def init(admin_dsn, meta_db=META_DB):
    """建 catalog_meta 与三张表（已有则不动）。"""
    with _server(admin_dsn) as conn, conn.cursor() as cur:
        cur.execute('SELECT 1 FROM pg_database WHERE datname = %s', (meta_db,))
        if not cur.fetchone():
            cur.execute('CREATE DATABASE %s' % _ident(meta_db))
    with _connect(admin_dsn, meta_db) as conn, conn.cursor() as cur:
        cur.execute(META_SQL)
        conn.commit()


def _rels(cur):
    cur.execute('SELECT n, db, git_commit, text_commit, ddl_sha, contract, last_seq, promoted_at, dropped '
                'FROM rel ORDER BY n')
    cols = ['n', 'db', 'git_commit', 'text_commit', 'ddl_sha', 'contract', 'last_seq', 'promoted_at', 'dropped']
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def _stable(cur):
    cur.execute("SELECT rel FROM pointer WHERE name = 'stable'")
    r = cur.fetchone()
    return r[0] if r else None


def _frozen(cur):
    cur.execute("SELECT value FROM setting WHERE key = 'freeze'")
    r = cur.fetchone()
    return bool(r and r[0] == '1')


def status(admin_dsn, meta_db=META_DB):
    with _connect(admin_dsn, meta_db) as conn, conn.cursor() as cur:
        return {'stable': _stable(cur), 'frozen': _frozen(cur), 'rels': _rels(cur)}


def set_freeze(admin_dsn, on, meta_db=META_DB):
    with _connect(admin_dsn, meta_db) as conn, conn.cursor() as cur:
        cur.execute("INSERT INTO setting (key, value) VALUES ('freeze', %s) "
                    "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", ('1' if on else '0',))
        conn.commit()


def latest_state(admin_dsn, latest_db=LATEST_DB):
    """latest 库的 build_meta 与 change_log 末尾 seq；没建好回 None。"""
    with _connect(admin_dsn, latest_db) as conn, conn.cursor() as cur:
        m = _meta(cur)
        if not m:
            return None
        cur.execute('SELECT coalesce(max(seq), 0) FROM change_log')
        return {'git_commit': m[0], 'ddl_sha': m[1], 'text_commit': m[2], 'last_seq': cur.fetchone()[0]}


def check_latest(admin_dsn, latest_db=LATEST_DB):
    """跑 checks.sql，回不过的条数。"""
    from .ddl import checks_sql
    bad = 0
    with _connect(admin_dsn, latest_db) as conn, conn.cursor() as cur:
        for q in checks_sql().splitlines():
            if q.startswith('SELECT'):
                cur.execute('SELECT count(*) FROM (%s) t' % q.rstrip(';'))
                bad += 1 if cur.fetchone()[0] else 0
    return bad


def promote(admin_dsn, contract=None, force=False, latest_db=LATEST_DB, meta_db=META_DB,
            min_interval=MIN_INTERVAL, log=print):
    """把 latest 晋升成新 rel 并设为 stable。回 {'promoted': rN} 或 {'skipped': 原因}。"""
    init(admin_dsn, meta_db)
    with _connect(admin_dsn, meta_db) as conn, conn.cursor() as cur:
        if _frozen(cur):
            return {'skipped': '已冻结'}
        rels = _rels(cur)
        stable = _stable(cur)
        cur_rel = next((r for r in rels if r['n'] == stable), None)
        now = datetime.datetime.now(datetime.timezone.utc)
        if cur_rel and not force and (now - cur_rel['promoted_at']).total_seconds() < min_interval:
            return {'skipped': '距上次晋升不足 %d 秒' % min_interval}
    st = latest_state(admin_dsn, latest_db)
    if not st:
        return {'skipped': 'latest 还没建好'}
    if cur_rel and (cur_rel['git_commit'], cur_rel['text_commit'], cur_rel['ddl_sha']) == \
            (st['git_commit'], st['text_commit'], st['ddl_sha']):
        return {'skipped': 'latest 与 stable 同一提交'}
    if st['ddl_sha'] != ddl_sha():
        return {'skipped': '库的表结构指纹与本代码不一致（latest 需先重建）'}
    bad = check_latest(admin_dsn, latest_db)
    if bad:
        return {'skipped': 'db check 不过 %d 条' % bad}

    n = max([r['n'] for r in rels], default=0) + 1
    target = '%s%d' % (REL_PREFIX, n)
    L, T = _ident(latest_db), _ident(target)
    with _server(admin_dsn) as conn, conn.cursor() as cur:
        cur.execute('ALTER DATABASE %s WITH ALLOW_CONNECTIONS false' % L)
        try:
            cur.execute('SELECT pg_terminate_backend(pid) FROM pg_stat_activity '
                        'WHERE datname = %s AND pid <> pg_backend_pid()', (latest_db,))
            cur.execute('CREATE DATABASE %s TEMPLATE %s' % (T, L))
        finally:
            cur.execute('ALTER DATABASE %s WITH ALLOW_CONNECTIONS true' % L)
    log('已复制 %s → %s' % (latest_db, target))

    with _connect(admin_dsn, meta_db) as conn, conn.cursor() as cur:
        cur.execute('INSERT INTO rel (n, db, git_commit, text_commit, ddl_sha, contract, last_seq) '
                    'VALUES (%s, %s, %s, %s, %s, %s, %s)',
                    (n, target, st['git_commit'], st['text_commit'], st['ddl_sha'], contract, st['last_seq']))
        cur.execute("INSERT INTO pointer (name, rel) VALUES ('stable', %s) "
                    "ON CONFLICT (name) DO UPDATE SET rel = EXCLUDED.rel", (n,))
        conn.commit()
        dropped = _prune(admin_dsn, cur, n, log)
        conn.commit()
    return {'promoted': 'r%d' % n, 'db': target, 'dropped': dropped}


def _prune(admin_dsn, cur, stable, log=print):
    """stable 之外只留最近 KEEP_OLD 个旧 rel，更旧的 DROP（连接强踢）。"""
    keep = sorted((r['n'] for r in _rels(cur) if not r['dropped'] and r['n'] != stable), reverse=True)[:KEEP_OLD]
    out = []
    for r in _rels(cur):
        if r['dropped'] or r['n'] == stable or r['n'] in keep:
            continue
        with _server(admin_dsn) as conn, conn.cursor() as c2:
            c2.execute('DROP DATABASE IF EXISTS %s WITH (FORCE)' % _ident(r['db']))
        cur.execute('UPDATE rel SET dropped = true WHERE n = %s', (r['n'],))
        out.append('r%d' % r['n'])
        log('已删 %s' % r['db'])
    return out


def rollback(admin_dsn, n, meta_db=META_DB):
    """stable 指回 rel n（须还留着）。回滚后建议 freeze，免得下一轮自动晋升又盖回去。"""
    with _connect(admin_dsn, meta_db) as conn, conn.cursor() as cur:
        r = next((r for r in _rels(cur) if r['n'] == n), None)
        if not r or r['dropped']:
            raise SystemExit('r%d 不存在或已删' % n)
        cur.execute("INSERT INTO pointer (name, rel) VALUES ('stable', %s) "
                    "ON CONFLICT (name) DO UPDATE SET rel = EXCLUDED.rel", (n,))
        conn.commit()
    return n


def resolve(admin_dsn, ref='stable', latest_db=LATEST_DB, meta_db=META_DB):
    """stable / latest / rN → (库名, 该库的 DSN, rel 信息或 None)。读者拿它的 DSN 去 read_records。"""
    ref = ref.strip().lower()
    if ref == 'latest':
        return latest_db, _dsn(admin_dsn, latest_db), None
    with _connect(admin_dsn, meta_db) as conn, conn.cursor() as cur:
        rels = {r['n']: r for r in _rels(cur)}
        if ref == 'stable':
            n = _stable(cur)
            if n is None:
                raise SystemExit('还没有 stable（先 promote）')
        elif ref.startswith('r') and ref[1:].isdigit():
            n = int(ref[1:])
        else:
            raise SystemExit('ref 只能是 stable、latest 或 rN：%r' % ref)
    r = rels.get(n)
    if not r or r['dropped']:
        raise SystemExit('r%s 不存在或已删' % n)
    return r['db'], _dsn(admin_dsn, r['db']), r


def changes(dsn, since_seq=0, until_seq=None):
    """某库的改动表里 (since, until] 的记录：[(seq, type, id, op)]。遇到 op=full 的行，读者须全量重来。"""
    with _connect(dsn, _dbname(dsn)) as conn, conn.cursor() as cur:
        if until_seq is None:
            cur.execute('SELECT seq, type, id, op FROM change_log WHERE seq > %s ORDER BY seq', (since_seq,))
        else:
            cur.execute('SELECT seq, type, id, op FROM change_log WHERE seq > %s AND seq <= %s ORDER BY seq',
                        (since_seq, until_seq))
        return cur.fetchall()


def _dbname(dsn):
    from psycopg.conninfo import conninfo_to_dict
    return conninfo_to_dict(dsn).get('dbname')


def changes_between(admin_dsn, a, b, meta_db=META_DB):
    """rel a → rel b（a<b）之间的改动：用 b 库里的 change_log，seq 区间取 (a.last_seq, b.last_seq]。
    中间若有全量重建（op=full）也会出现在里面，读者据此全量重来。"""
    with _connect(admin_dsn, meta_db) as conn, conn.cursor() as cur:
        rels = {r['n']: r for r in _rels(cur)}
    ra, rb = rels.get(a), rels.get(b)
    if not ra or not rb or rb['dropped']:
        raise SystemExit('rel 不存在或已删')
    return changes(_dsn(admin_dsn, rb['db']), ra['last_seq'] or 0, rb['last_seq'])


def main(args):
    """db release 子命令入口：args 已由 __main__ 解析。"""
    cmd = args.rcmd
    if cmd == 'init':
        init(args.dsn)
        print('catalog_meta 就绪')
    elif cmd == 'status':
        s = status(args.dsn)
        print('stable = %s　冻结 = %s' % (('r%d' % s['stable']) if s['stable'] else '无', s['frozen']))
        for r in s['rels']:
            print('  r%-4d %s　%s　%s　%s%s' % (r['n'], (r['git_commit'] or '')[:10], (r['text_commit'] or '')[:10],
                                                 r['promoted_at'].isoformat(timespec='seconds'), r['db'],
                                                 '　已删' if r['dropped'] else ''))
    elif cmd == 'promote':
        res = promote(args.dsn, contract=args.contract, force=args.force)
        print(json.dumps(res, ensure_ascii=False))
    elif cmd == 'rollback':
        print('stable → r%d' % rollback(args.dsn, args.n))
    elif cmd in ('freeze', 'unfreeze'):
        set_freeze(args.dsn, cmd == 'freeze')
        print('已%s' % ('冻结' if cmd == 'freeze' else '解冻'))
    elif cmd == 'resolve':
        db, dsn, r = resolve(args.dsn, args.ref)
        print(db if args.name else dsn)
    elif cmd == 'changes':
        a, b = args.since, args.until
        rows = changes_between(args.dsn, a, b)
        for r in rows:
            print('\t'.join(str(x) for x in r))
    return 0

