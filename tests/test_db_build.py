"""db/build.py 里不碰数据库的部分：台账解析、链解析、git diff 取改动。"""
import json
import os
import subprocess

from book_index_manager.db.build import LEDGER_DIR, changed_ids, ledger_rows, resolve_chain


def test_resolve_chain_priority_and_cycles():
    live = {'L1', 'L2', 'L3'}
    rows = [
        ('a', 'merged', 'purge-20261101', 'b'),      # a → b → L1
        ('b', 'merged', 'purge-20261101', 'L1'),
        ('c', 'promoted', 'promotions', 'L2'),       # 升格说 L2，台账说 L3：台账优先
        ('c', 'merged', 'history-20261103', 'L3'),
        ('d', 'merged', 'purge-20261101', 'L2'),     # 墓碑最优先
        ('d', 'tombstone', 'tombstone', 'L3'),
        ('x', 'merged', 'purge-20261101', 'y'),      # 环：解不到
        ('y', 'merged', 'purge-20261101', 'x'),
        ('L1', 'merged', 'purge-20261101', 'L2'),    # 旧号本身现行：指自己
        ('z', 'merged', 'purge-20261101', 'gone'),   # 断链
    ]
    got = dict(((r[0], r[2]), lid) for r, lid in zip(rows, resolve_chain(live, rows)))
    assert got[('a', 'purge-20261101')] == 'L1'
    assert got[('b', 'purge-20261101')] == 'L1'
    assert got[('c', 'promotions')] == 'L2'          # 每行先走自己的直接去向
    assert got[('d', 'purge-20261101')] == 'L2'
    assert got[('x', 'purge-20261101')] is None
    assert got[('L1', 'purge-20261101')] == 'L1'
    assert got[('z', 'purge-20261101')] is None
    # 链中间节点按优先级走：e → c，c 取台账的 L3
    assert resolve_chain(live, rows + [('e', 'merged', 'purge-20261101', 'c')])[-1] == 'L3'


def _write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)


def test_ledger_rows(tmp_path):
    d = os.path.join(tmp_path, LEDGER_DIR)
    _write(os.path.join(d, 'purge-20261101.tsv'),
           'id\ttype\ttitle\tmerged_into\tfinal_keeper\n'
           'p1\twork\t甲\tk1\tk2\n'
           'p2\tbook\t乙\t\t\n')                         # 无去向：跳过
    _write(os.path.join(d, 'history-20261103.tsv'),
           'old_id\tkeeper\ttype\tfield\ttitle\tat\tby\trule\twhy\textra\n'
           'h1\tk1\tentity\tmerged_from\t\t2026-11-03\tA11\t\t\t\n'
           'h1\tk1\tentity\tmerge_history\t丙\t\t\tR1\t同人\t\n'   # 同一对按字段合并
           'k1\tk1\tentity\tmerged_from\t\t\t\t\t\t\n')           # 自指：跳过
    _write(os.path.join(d, 'draft-retarget-20261105.tsv'),
           'draft_id\ttype\told_target\tnew_target\tnew_name\n'
           'd1\tbook\tp1\tk1\t丁\n')
    _write(os.path.join(tmp_path, 'promotions.json'), json.dumps(
        {'version': 1, 'promotions': {'d2': {'production_id': 'k3', 'type': 'work', 'promoted_at': '2026-01-01'}}}))
    rows = {(r['old_id'], r['src']): r for r in ledger_rows(str(tmp_path))}
    assert set(rows) == {('p1', 'purge-20261101'), ('h1', 'history-20261103'),
                         ('d1', 'draft-retarget-20261105'), ('d2', 'promotions')}
    p1 = rows[('p1', 'purge-20261101')]
    assert (p1['owner_type'], p1['direct_into'], p1['extra']) == ('W', 'k1', {'final_keeper': 'k2'})
    h1 = rows[('h1', 'history-20261103')]
    assert (h1['title'], h1['rule'], h1['why'], h1['at'], h1['by']) == ('丙', 'R1', '同人', '2026-11-03', 'A11')
    assert rows[('d1', 'draft-retarget-20261105')]['extra'] == {'old_target': 'p1'}
    d2 = rows[('d2', 'promotions')]
    assert (d2['kind'], d2['direct_into'], d2['owner_type'], d2['at']) == ('promoted', 'k3', 'W', '2026-01-01')


def test_changed_ids(tmp_path):
    root = str(tmp_path)

    def g(*a):
        subprocess.run(['git', '-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t'] + list(a),
                       check=True, capture_output=True)
    g('init', '-q')
    _write(os.path.join(root, 'Work', 'c', 'b', 'a', 'abc-甲.json'), '{}')
    _write(os.path.join(root, 'Book', 'f', 'e', 'd', 'def-乙.json'), '{}')
    g('add', '-A'); g('commit', '-qm', '1')
    base = subprocess.run(['git', '-C', root, 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()
    os.remove(os.path.join(root, 'Work', 'c', 'b', 'a', 'abc-甲.json'))
    _write(os.path.join(root, 'Work', 'c', 'b', 'a', 'abc-甲改.json'), '{"x":1}')   # 改名
    _write(os.path.join(root, 'Book', 'f', 'e', 'd', 'def-乙.json'), '{"y":1}')
    _write(os.path.join(root, 'README.md'), 'x')                                    # 无关文件不算
    g('add', '-A'); g('commit', '-qm', '2')
    ch, other = changed_ids(root, base)
    assert ch['Work'] == {'abc'} and ch['Book'] == {'def'} and not other
    _write(os.path.join(root, LEDGER_DIR, 'purge-1.tsv'), 'id\n')
    g('add', '-A'); g('commit', '-qm', '3')
    assert changed_ids(root, base)[1] is True


def test_record_paths_use_shard_dirs(tmp_path):
    from book_index_manager.db.build import record_paths
    from book_index_manager.storage import shard_dirs
    p = os.path.join(tmp_path, 'Work', *shard_dirs('d59fuoeo5d6o'), 'd59fuoeo5d6o-困學紀聞.json')
    _write(p, '{}')
    assert record_paths(str(tmp_path), 'Work', {'d59fuoeo5d6o'}) == [p]
    assert record_paths(str(tmp_path), 'Work') == [p]


def test_shred_files_keeps_file_name(tmp_path):
    from book_index_manager.db.build import shred_files
    from book_index_manager.db.mapping import RECORDS
    from book_index_manager.db.shred import Rows
    rec = [r for r in RECORDS.values() if r.name == 'Work'][0]
    p = os.path.join(tmp_path, 'w1-舊題名.json')
    _write(p, json.dumps({'id': 'w1', 'type': 'work', 'title': '新題名'}, ensure_ascii=False))
    rows = Rows()
    assert shred_files(rec, [p], rows) == 1
    assert rows.t[rec.table][0]['file_name'] == 'w1-舊題名.json'
