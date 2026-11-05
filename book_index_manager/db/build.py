"""建库：全量或按 git diff 增量，外加 id_map（旧 id → 现行 id）。

  python -m book_index_manager.db build --root ../book-index --dsn "…" [--full]

- 库里 build_meta 记着上次建到哪个提交（git_commit）和表结构指纹（ddl_sha）。指纹变了、没有记录、或 --full 时全量重建；
  否则只把 `git diff 上次..HEAD` 里改动的四类记录删了重灌。
- id_map 每次整表重算（六十余万行，几秒）：记录里的墓碑（src='tombstone'）随记录灌；另外三个来源
    promotions/*.json                          草稿 id → 正式 id（kind='promoted'，src='promotions'）
    .claude/qa/purge-tombstones/ledger/*.tsv   清墓碑与并条历史台账、草稿墓碑改指（kind='merged'，src=文件名）
  live_id 沿链解到现行记录；解不到的留空（checks.sql 报）。
- 读的是工作区文件，要求工作区在 HEAD 且干净（四类目录、promotions、台账），否则拒绝增量。
"""
import csv
import datetime
import glob
import hashlib
import json
import os
import subprocess
import time

from ..storage import shard_dirs
from .ddl import constraints_sql, schema_sql
from .mapping import RECORDS
from .pg import _psycopg, copy_rows, tables_of
from .shred import Rows, shred
from .tables import TABLES

DIRS = {r.name: r for r in RECORDS.values()}
LEDGER_DIR = os.path.join('.claude', 'qa', 'purge-tombstones', 'ledger')
TYPE_CODE = {'work': 'W', 'book': 'B', 'collection': 'C', 'entity': 'E', 'people': 'E'}


def ddl_sha():
    return hashlib.sha256((schema_sql() + constraints_sql()).encode('utf-8')).hexdigest()[:16]


def git(root, *args):
    return subprocess.run(['git', '-C', root] + list(args), check=True, capture_output=True, text=True).stdout


def record_paths(root, name, ids=None):
    if ids is None:
        return sorted(glob.glob(os.path.join(root, name, '*', '*', '*', '*.json')))
    out = []
    for i in sorted(ids):
        out.extend(glob.glob(os.path.join(root, name, *shard_dirs(i), glob.escape(i) + '-*.json')))
    return out


def load(paths):
    docs = []
    for p in paths:
        with open(p, encoding='utf-8') as f:
            docs.append(json.load(f))
    return docs


# ---------------------------------------------------------------- id_map 的另外三个来源

def _code(t):
    return TYPE_CODE.get((t or '').lower(), (t or '?')[:1].upper())


def ledger_rows(root):
    """台账与升格表 → id_map 行（未解 live_id）。"""
    rows = {}

    def put(r):
        key = (r['old_id'], r['kind'], r['src'], r['direct_into'])
        old = rows.get(key)
        if old is None:
            rows[key] = r
        else:   # history 里同一对 (旧号, 留存号) 按字段各一行：合并，有值的优先
            for k, v in r.items():
                if v and not old.get(k):
                    old[k] = v

    for f in sorted(glob.glob(os.path.join(root, LEDGER_DIR, '*.tsv'))):
        src = os.path.splitext(os.path.basename(f))[0]
        with open(f, encoding='utf-8', newline='') as fh:
            rd = csv.DictReader(fh, delimiter='\t')
            for t in rd:
                if 'draft_id' in t:          # 草稿墓碑改指：old_target → new_target
                    old, into, extra = t['draft_id'], t.get('new_target'), {'old_target': t.get('old_target')}
                    title = t.get('new_name')
                elif 'keeper' in t:          # 并条历史（删 merged_in/merged_from/merge_history 前导出）
                    old, into, extra = t['old_id'], t['keeper'], {'field': t.get('field')}
                    title = t.get('title')
                    if t.get('extra'):
                        extra['extra'] = t['extra']
                else:                        # 清墓碑
                    old, into, extra = t['id'], t.get('merged_into'), {}
                    title = t.get('title')
                    if t.get('final_keeper') and t['final_keeper'] != into:
                        extra['final_keeper'] = t['final_keeper']
                if not old or not into or old == into:
                    continue
                r = {'old_id': old, 'owner_type': _code(t.get('type')), 'kind': 'merged', 'src': src,
                     'direct_into': into, 'title': title or None}
                for k in ('rule', 'at', 'by', 'why'):
                    if t.get(k):
                        r[k] = t[k]
                extra = {k: v for k, v in extra.items() if v}
                if extra:
                    r['extra'] = extra
                put({k: v for k, v in r.items() if v is not None})
    from pathlib import Path

    from ..promotion import load_all_raw
    for draft_id, p in load_all_raw(Path(root)).items():
        into = p.get('production_id') if isinstance(p, dict) else None
        if not into:
            continue
        r = {'old_id': draft_id, 'owner_type': _code(p.get('type')), 'kind': 'promoted', 'src': 'promotions',
             'direct_into': into}
        if p.get('promoted_at'):
            r['at'] = p['promoted_at']
        rest = {k: v for k, v in p.items() if k not in ('production_id', 'type', 'promoted_at')}
        if rest:
            r['extra'] = rest
        put(r)
    return list(rows.values())


def resolve_chain(live, rows):
    """rows：[(旧号, kind, src, 直接去向)]。回各行的 live_id（解不到为 None）。
    链上走一步时，同一旧号几处来源：墓碑优先，其次台账（文件名大者即新者优先），最后升格表。旧号本身现行就指自己。"""
    rank = {'tombstone': 2, 'promotions': 0}
    nxt = {}
    for old, kind, src, into in sorted(rows, key=lambda x: (rank.get(x[2], 1), x[2])):
        nxt[old] = into    # 后写的优先级高
    memo = {}

    def walk(x):
        seen = []
        while x not in live and x in nxt and x not in seen:
            if x in memo:
                x = memo[x] or x
                break
            seen.append(x)
            x = nxt[x]
        got = x if x in live else None
        for s in seen:
            memo[s] = got
        return got

    return [old if old in live else walk(into) for old, kind, src, into in rows]


def resolve_live(cur):
    """沿链把 id_map.live_id 解到现行记录（四张主表里的 id）。回 (已解, 解不到)。"""
    live = set()
    for r in RECORDS.values():
        cur.execute('SELECT id FROM %s' % r.table)
        live.update(x for (x,) in cur.fetchall())
    cur.execute("SELECT old_id FROM id_map WHERE src = 'tombstone'")
    live.difference_update(x for (x,) in cur.fetchall())     # 墓碑记录不算现行
    cur.execute('SELECT old_id, kind, src, direct_into FROM id_map')
    rows = cur.fetchall()
    lids = resolve_chain(live, rows)
    out = [(lid,) + tuple(r) for lid, r in zip(lids, rows)]
    bad = sum(1 for x in lids if x is None)
    cur.execute('CREATE TEMP TABLE _live (live_id text, old_id text, kind text, src text, direct_into text) ON COMMIT DROP')
    with cur.copy('COPY _live FROM STDIN') as cp:
        for r in out:
            cp.write_row(r)
    cur.execute('UPDATE id_map m SET live_id = l.live_id FROM _live l WHERE m.old_id = l.old_id AND m.kind = l.kind '
                'AND m.src = l.src AND m.direct_into = l.direct_into AND m.live_id IS DISTINCT FROM l.live_id')
    return len(rows) - bad, bad


# ---------------------------------------------------------------- 建库

def _meta(cur):
    try:
        cur.execute('SELECT git_commit, ddl_sha FROM build_meta')
        r = cur.fetchone()
        return r
    except Exception:
        cur.connection.rollback()
        return None


def changed_ids(root, since):
    """git diff since..HEAD 里四类记录的 {类型: {id}}，以及台账／升格表有没有动。"""
    out = {n: set() for n in DIRS}
    other = False
    diff = git(root, 'diff', '--name-status', '--no-renames', '-z', since, 'HEAD', '--',
               *DIRS, 'promotions', LEDGER_DIR)
    parts = diff.split('\0')
    for status, path in zip(parts[0::2], parts[1::2]):
        top = path.split('/', 1)[0]
        if top in out and path.endswith('.json'):
            base = os.path.basename(path)
            out[top].add(base.split('-', 1)[0].rsplit('.', 1)[0])
        elif path:
            other = True
    return out, other


def _dirty(root):
    st = git(root, 'status', '--porcelain', '--', *DIRS, 'promotions', LEDGER_DIR)
    return [l for l in st.splitlines() if l.strip()]


def _delete(cur, rec, ids):
    ids = sorted(ids)
    for table in tables_of(rec):
        t = TABLES[table]
        col = 'id' if 'id' in t.pk else t.pk[0]
        cur.execute('DELETE FROM %s WHERE %s = ANY(%%s)' % (table, col), (ids,))


def _load_ledgers(cur, root):
    cur.execute("DELETE FROM id_map WHERE src <> 'tombstone'")
    rows = ledger_rows(root)
    for r in rows:
        r.setdefault('live_id', None)
    copy_rows(cur, {'id_map': [{k: v for k, v in r.items() if v is not None} for r in rows]})
    return len(rows)


def build(root, dsn, full=False, log=print):
    psycopg, _ = _psycopg()
    t0 = time.time()
    head = git(root, 'rev-parse', 'HEAD').strip()
    sha = ddl_sha()
    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        meta = None if full else _meta(cur)
        mode = 'full' if meta is None or meta[1] != sha else 'incremental'
        if mode == 'incremental':
            dirty = _dirty(root)
            if dirty:
                raise SystemExit('工作区有未提交的改动，不能增量：%s' % dirty[:5])
            if meta[0] == head:
                log('库已在 %s，无需更新' % head[:10])
                return {'mode': 'noop', 'commit': head}
        stats = {'mode': mode, 'commit': head}
        cur.execute('SET CONSTRAINTS ALL DEFERRED')   # 先删后灌、跨类引用，外键到提交时才查
        if mode == 'full':
            cur.execute('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
            cur.execute(schema_sql())
            for name, rec in DIRS.items():
                rows = Rows()
                docs = load(record_paths(root, name))
                for d in docs:
                    shred(rec, d, rows)
                copy_rows(cur, rows)
                stats[name] = len(docs)
                log('%s：%d 条，%.0fs' % (name, len(docs), time.time() - t0))
            stats['id_map_ledger'] = _load_ledgers(cur, root)
            cur.execute(constraints_sql())
        else:
            ch, other = changed_ids(root, meta[0])
            for name, ids in ch.items():
                if not ids:
                    continue
                rec = DIRS[name]
                _delete(cur, rec, ids)
                rows = Rows()
                docs = load(record_paths(root, name, ids))
                for d in docs:
                    shred(rec, d, rows)
                copy_rows(cur, rows)
                stats[name] = {'changed': len(ids), 'present': len(docs)}
                log('%s：改动 %d 个 id，现存 %d 条，%.0fs' % (name, len(ids), len(docs), time.time() - t0))
            if other or any(ch.values()):
                stats['id_map_ledger'] = _load_ledgers(cur, root)
        ok, bad = resolve_live(cur)
        stats['live_resolved'], stats['live_unresolved'] = ok, bad
        cur.execute('DELETE FROM build_meta')
        cur.execute('INSERT INTO build_meta (git_commit, built_at, ddl_sha, mode) VALUES (%s, %s, %s, %s)',
                    (head, datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'), sha, mode))
        conn.commit()
    stats['seconds'] = round(time.time() - t0)
    log('建库完成 %s' % json.dumps(stats, ensure_ascii=False))
    return stats


def verify(root, dsn, log=print):
    """库里的四类记录还原后与工作区文件逐条相等（增量建库的门禁）。回不一致条数。"""
    from .pg import fetch_rows
    from .shred import restore
    psycopg, _ = _psycopg()
    bad = 0
    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        for name, rec in DIRS.items():
            docs = {d['id']: d for d in load(record_paths(root, name))}
            back = restore(rec, fetch_rows(cur, tables_of(rec)))
            n = sum(1 for i, d in docs.items() if back.get(i) != d) + len(set(back) - set(docs))
            log('%s：文件 %d、库 %d、不一致 %d' % (name, len(docs), len(back), n))
            bad += n
    return bad
