"""目录库版本（release.py）与改动表（change_log）：要一台真 PostgreSQL，环境变量 BIM_TEST_DSN 给个有建库权限的连接串，
没有就跳过（CI 起一个 postgres 服务）。"""
import copy
import json
import os
import subprocess

import pytest

from book_index_manager.db import release
from book_index_manager.db.build import build, read_records
from book_index_manager.storage import shard_dirs

ADMIN = os.environ.get('BIM_TEST_DSN')
pytestmark = pytest.mark.skipif(not ADMIN, reason='没有 BIM_TEST_DSN')

LATEST, META = 'bimt_latest', 'bimt_meta'
WORK = {'id': 'd59df01avcw0', 'type': 'work', 'title': '紅樓夢', 'subtype': 'book', 'schema_version': 1}
WORK2 = {'id': 'd59df01avcw1', 'type': 'work', 'title': '石頭記', 'subtype': 'book', 'schema_version': 1}


def _git(root, *a):
    subprocess.run(['git', '-C', str(root)] + list(a), check=True, capture_output=True)


def _put(root, name, doc):
    d = os.path.join(root, name, *shard_dirs(doc['id']))
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, '%s-%s.json' % (doc['id'], doc['title'])), 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False)


def _rm(root, i):
    for dp, _, fs in os.walk(root):
        for f in fs:
            if f.startswith(i + '-'):
                os.remove(os.path.join(dp, f))


def _commit(root, msg):
    _git(root, 'add', '-A')
    _git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', msg)


def _drop_all():
    from book_index_manager.db.pg import _psycopg
    psycopg, _ = _psycopg()
    with psycopg.connect(release._dsn(ADMIN, 'postgres'), autocommit=True) as c, c.cursor() as cur:
        cur.execute("SELECT datname FROM pg_database WHERE datname = ANY(%s) OR datname LIKE 'catalog_r%%'",
                    ([LATEST, META],))
        for (n,) in cur.fetchall():
            cur.execute('DROP DATABASE "%s" WITH (FORCE)' % n)


@pytest.fixture
def repo(tmp_path):
    _drop_all()
    root = str(tmp_path / 'bi')
    os.makedirs(root)
    _git(root, 'init', '-q')
    for n in ('Work', 'Book', 'Collection', 'Entity'):
        os.makedirs(os.path.join(root, n))
    _put(root, 'Work', WORK)
    _commit(root, 'c1')
    with __import__('psycopg').connect(release._dsn(ADMIN, 'postgres'), autocommit=True) as c:
        c.execute('CREATE DATABASE %s' % LATEST)
    yield root
    _drop_all()


def _latest_dsn():
    return release._dsn(ADMIN, LATEST)


def test_change_log_and_read_ids(repo):
    build(repo, _latest_dsn(), log=lambda *_: None)
    assert [r[1:] for r in release.changes(_latest_dsn(), 0)] == [('*', '*', 'full')]
    # 增量：改一条、加一条
    w = copy.deepcopy(WORK)
    w['title'] = '紅樓夢新'
    _rm(repo, WORK['id'])
    _put(repo, 'Work', w)
    _put(repo, 'Work', WORK2)
    _commit(repo, 'c2')
    build(repo, _latest_dsn(), log=lambda *_: None)
    rows = release.changes(_latest_dsn(), 1)
    assert {(t, i, op) for _, t, i, op in rows} >= {('Work', 'd59df01avcw0', 'upsert'), ('Work', 'd59df01avcw1', 'upsert'),
                                                    ('id_map', '*', 'upsert')}
    # 删除
    _rm(repo, WORK2['id'])
    _commit(repo, 'c3')
    build(repo, _latest_dsn(), log=lambda *_: None)
    assert ('Work', 'd59df01avcw1', 'delete') in {r[1:] for r in release.changes(_latest_dsn(), 3)}
    # read_records 带 ids
    got = read_records(_latest_dsn(), 'Work', ids=['d59df01avcw0', 'nope'])
    assert list(got['Work']) == ['d59df01avcw0']
    assert got['Work']['d59df01avcw0'][1]['title'] == '紅樓夢新'
    assert len(read_records(_latest_dsn(), 'Work')['Work']) == 1


def test_promote_resolve_rollback(repo, monkeypatch):
    monkeypatch.setattr(release, 'check_latest', lambda *a, **k: 0)
    release.init(ADMIN)
    assert release.promote(ADMIN, latest_db=LATEST, meta_db=META)['skipped'].startswith('latest 还没')
    build(repo, _latest_dsn(), log=lambda *_: None)
    r = release.promote(ADMIN, contract=7, latest_db=LATEST, meta_db=META, log=lambda *_: None)
    assert r['promoted'] == 'r1'
    s = release.status(ADMIN, META)
    assert s['stable'] == 1 and s['rels'][0]['contract'] == 7 and s['rels'][0]['last_seq'] >= 1
    # 同一提交不再晋升；间隔不足也不晋升
    assert 'skipped' in release.promote(ADMIN, latest_db=LATEST, meta_db=META, force=True)
    # stable 读到的与 latest 同
    db, dsn, _ = release.resolve(ADMIN, 'stable', LATEST, META)
    assert db == 'catalog_r1' and list(read_records(dsn, 'Work')['Work']) == ['d59df01avcw0']
    assert release.resolve(ADMIN, 'latest', LATEST, META)[0] == LATEST
    # latest 前进后，stable 不动；间隔不足跳过，force 晋升
    _put(repo, 'Work', WORK2)
    _commit(repo, 'c2')
    build(repo, _latest_dsn(), log=lambda *_: None)
    assert len(read_records(release.resolve(ADMIN, 'stable', LATEST, META)[1], 'Work')['Work']) == 1
    assert '不足' in release.promote(ADMIN, latest_db=LATEST, meta_db=META)['skipped']
    assert release.promote(ADMIN, latest_db=LATEST, meta_db=META, force=True, log=lambda *_: None)['promoted'] == 'r2'
    assert len(read_records(release.resolve(ADMIN, 'stable', LATEST, META)[1], 'Work')['Work']) == 2
    # r1→r2 之间的改动
    got = release.changes_between(ADMIN, 1, 2, META)
    assert ('Work', 'd59df01avcw1', 'upsert') in {r[1:] for r in got}
    # 回滚、冻结
    assert release.rollback(ADMIN, 1, META) == 1
    assert len(read_records(release.resolve(ADMIN, 'stable', LATEST, META)[1], 'Work')['Work']) == 1
    release.set_freeze(ADMIN, True, META)
    assert release.promote(ADMIN, latest_db=LATEST, meta_db=META, force=True) == {'skipped': '已冻结'}
    release.set_freeze(ADMIN, False, META)
    # 只留最近 2 个旧 rel：再晋升几次后 r1 被删
    for k in range(3, 6):
        _rm(repo, WORK2['id'])
        _put(repo, 'Work', dict(WORK2, title='x%d' % k))
        _commit(repo, 'c%d' % k)
        build(repo, _latest_dsn(), log=lambda *_: None)
        release.promote(ADMIN, latest_db=LATEST, meta_db=META, force=True, log=lambda *_: None)
    s = release.status(ADMIN, META)
    assert s['stable'] == 5 and [r['n'] for r in s['rels'] if not r['dropped']] == [3, 4, 5]
    with pytest.raises(SystemExit):
        release.resolve(ADMIN, 'r1', LATEST, META)
