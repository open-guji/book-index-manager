"""块 D 步 5 单测：groups／exclusions／workindex 读盘。真基线的数字验收见 步5-报告；这里用小夹具＋可选的真数据冒烟。"""
import json
import os

import pytest

import exclusions
import groups
import workindex as W


def _w(root, wid, title, res=None, **kw):
    d = root / 'Work' / '1' / 'a' / 'b'
    d.mkdir(parents=True, exist_ok=True)
    w = dict(id=wid, title=title, authors=[dict(name='某甲', dynasty='明')])
    w.update(kw)
    if res:
        w['resources'] = res
    (d / f'{wid}-{title}.json').write_text(json.dumps(w, ensure_ascii=False), encoding='utf-8')


@pytest.fixture
def root(tmp_path):
    _w(tmp_path, 'w1', '甲書', res=[dict(id='nlc', metadata={'nlc_fid': '123'})])
    _w(tmp_path, 'w2', '乙書')
    _w(tmp_path, 'w3', '已并書', merged_into='w1')
    _w(tmp_path, 'w4', '升格書', promoted_to='x')
    b = tmp_path / 'Book' / '1' / 'a' / 'b'
    b.mkdir(parents=True)
    (b / 'b1.json').write_text(json.dumps(dict(id='b1', work_id='w2', resources=[dict(id='kokusho', metadata={'kokusho_bid': '77'})])), encoding='utf-8')
    return tmp_path


def test_live_excludes_tombstones(root):
    works, tomb = W.load_works(str(root))
    assert {w['id'] for w in works} == {'w1', 'w2'} and tomb == 2


def test_existing_res_includes_book_level(root):
    R = W.Resources.scan(str(root))
    assert R.existing_res('w1') == 1 and R.existing_res('w2') == 1 and R.existing_res('zz') == 0


def test_already_linked_idempotent(root):
    R = W.Resources.scan(str(root))
    assert R.already_linked('nlc', '123', 'w1') == 1
    assert R.already_linked('nlc', '123', 'w2') == 0      # 同记录挂在别的 Work 上不算已挂
    assert R.already_linked('kokusho', '77', 'w2') == 1   # 经 Book 层挂的也算
    assert R.already_linked('nlc', '999', 'w1') == 0


def test_build_from_root(root):
    wi = W.build_from_root(str(root), jp=False)
    assert set(wi.works) == {'w1', 'w2'} and wi.n_tombstone == 2


def test_kokusho_group_count_and_borrow():
    recs = [dict(raw=dict(detail=dict(work=[dict(wid=7)]))), dict(raw=dict(detail=dict(work=[dict(wid=7)]))),
            dict(raw=dict(detail=dict(work=[dict(wid=8)]))), dict(raw=dict(detail={}))]
    assert groups.kokusho_group_count(recs) == 3     # 7、8、无著作('')
    assert groups.group_names({'7': [{'甲'}, {'乙'}]}) == {'7': {'甲', '乙'}}
    assert groups.group_names({'7': [set('abcde')]}) == {}      # 并集 >4 不借
    assert groups.group_names({'7': [set()]}) == {}


def test_apply_group_split():
    rows = [dict(group_key='g', tier='确定', work_id='A', codes=['T_EXACT']), dict(group_key='g', tier='确定', work_id='B', codes=[]),
            dict(group_key='h', tier='确定', work_id='C', codes=[]), dict(group_key='h', tier='确定', work_id='C', codes=[]),
            dict(group_key='', tier='确定', work_id='D', codes=[]), dict(group_key='', tier='确定', work_id='E', codes=[])]
    assert groups.apply_group_split(rows) == 1
    assert [r['tier'] for r in rows] == ['存疑', '存疑', '确定', '确定', '确定', '确定']
    assert 'GROUP_SPLIT' in rows[0]['codes']


def test_ndl_groups_by_title_author_version():
    r = lambda t, a, v: dict(bookName=t, author=a, version=v)
    g = groups.ndl_groups([r('論衡', '王充', '明'), r('論衡', '王充', '明'), r('論衡', '王充', '清'), r('史記', '司馬遷', '明')])
    assert sorted(len(v) for v in g.values()) == [1, 1, 2]


def test_exclusions(tmp_path):
    prog = tmp_path / '项目进展' / '古籍目录' / '进度' / 'B4-別集類'
    prog.mkdir(parents=True)
    recs = {'a': dict(action='hold', work_id='wA', reason='near_dup:xx'),
            'b': dict(action='hold', reason='work_class_conflict:d59f2mt3rmdc 正式库 子部'),
            'c': dict(action='hold', work_id='wC', reason='no_main_author'),
            'd': dict(action='book', work_id='wD', work_side='draft'),
            'e': dict(action='book', work_id='wE', work_side='prod')}
    (prog / 'ledger.json').write_text(json.dumps(dict(records=recs)), encoding='utf-8')
    plan = tmp_path / '项目进展' / '馆藏资源挂接' / '计划'
    plan.mkdir(parents=True)
    (plan / 'dupx-同题异作者清单.tsv').write_text('http://u\tWork/1/h/f/d59f2humu1hf-邇言.json\tWork/3/b/6/d59f2mrl53b6-邇言.json\n', encoding='utf-8')
    ex = exclusions.load_exclusions(str(tmp_path), known_ids={'d59f2mt3rmdc'})
    assert ex['wA'] == {'R2'} and ex['d59f2mt3rmdc'] == {'R2'} and ex['wD'] == {'R3'}
    assert ex['d59f2humu1hf'] == {'R7'} and ex['d59f2mrl53b6'] == {'R7'}
    assert 'wC' not in ex and 'wE' not in ex


BI = os.environ.get('BOOK_INDEX_ROOT', '/home/user/bi-7e72')   # book-index@7e7247c8fa 检出


@pytest.mark.skipif(not os.path.isdir(BI + '/Work'), reason='无 book-index 基线')
def test_real_baseline_live_count():
    works, tomb = W.load_works(BI)
    assert len(works) == 131696 and tomb == 395       # book-index@7e7247c8fa（stat_res.py 同口径）


def test_group_split_whitelist():
    def mk():
        return [dict(group_key='G', tier='确定', work_id='A', codes=[]), dict(group_key='G', tier='确定', work_id='B', codes=[]),
                dict(group_key='G', tier='确定', work_id='C', codes=[])]
    r = mk(); assert groups.apply_group_split(r, 'kokusho', {('kokusho', 'G'): set()}) == 0 and all(x['tier'] == '确定' for x in r)
    r = mk(); assert groups.apply_group_split(r, 'kokusho', {('kokusho', 'G'): {'A', 'B'}}) == 0       # 剩 C 一个 Work，不构成拆分
    r = mk(); assert groups.apply_group_split(r, 'kokusho', {('kokusho', 'G'): {'A'}}) == 1
    assert [x['tier'] for x in r] == ['确定', '存疑', '存疑']
    r = mk(); assert groups.apply_group_split(r, 'kokusho', {('ndl', 'G'): set()}) == 1
    r = mk(); assert groups.apply_group_split(r) == 1


def test_explicit_dirs_override_overview_root(tmp_path):
    """GUJI-361：ledger_dir／dupx／plan_dir 显式给出时不依赖 overview 目录布局。"""
    import groups
    led = tmp_path / 'x' / 'L'
    led.mkdir(parents=True)
    (led / 'ledger.json').write_text(json.dumps({'records': {'a': {'action': 'hold', 'reason': 'near_dup:', 'work_id': 'd59f2mt3rmdc'}}}), encoding='utf-8')
    dupx = tmp_path / 'y' / 'dupx.tsv'
    dupx.parent.mkdir()
    dupx.write_text('k\t/Work/a/b/c/d59f2nf4b9xe-x.json\n', encoding='utf-8')
    ex = exclusions.load_exclusions(None, None, str(led), str(dupx))
    assert ex['d59f2mt3rmdc'] == {'R2'} and ex['d59f2nf4b9xe'] == {'R7'}
    pd = tmp_path / 'p'
    pd.mkdir()
    (pd / '合刻组白名单.tsv').write_text('g1\tkokusho\tW1,W2\n', encoding='utf-8')
    assert groups.load_whitelist(None, str(pd)) == {('kokusho', 'g1'): {'W1', 'W2'}}


def test_default_plan_dir_prefers_repo_data(tmp_path, monkeypatch):
    """GUJI-361 切换：tools/馆藏资源挂接/data 有 dupx／白名单时优先，缺则回退 overview 旧路径。"""
    d = tmp_path / 'data'
    d.mkdir()
    monkeypatch.setattr(exclusions, 'DATA_DIR', str(d))
    ov = str(tmp_path / 'ov')
    assert exclusions.default_plan_dir(ov) == os.path.join(ov, '项目进展', '馆藏资源挂接', '计划')
    (d / '合刻组白名单.tsv').write_text('g1\tkokusho\tW1\n', encoding='utf-8')
    assert exclusions.default_plan_dir(ov) == str(d)
    import groups
    assert groups.load_whitelist(None) == {('kokusho', 'g1'): {'W1'}}
    assert exclusions.default_paths(ov)[1] == os.path.join(str(d), 'dupx-同题异作者清单.tsv')
