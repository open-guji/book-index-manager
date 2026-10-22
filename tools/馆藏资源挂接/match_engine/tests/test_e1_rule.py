import e1_rule as R


def test_title_decor_prefix_ok():
    assert R.title_ok('新刊史記 十卷', {R.title_key('史記')})


def test_title_non_decor_rejected():
    assert not R.title_ok('增補史記', {R.title_key('史記')})
    assert not R.title_ok('重修史記', {R.title_key('史記')})


def test_title_juan_suffix_and_roman():
    assert R.title_ok('史記 二十卷', {R.title_key('史記')})


def test_author_bracket_removed_and_role_stripped():
    assert R.raw_names('[明]王世貞撰') == ['王世貞']
    assert R.raw_names('（明）王世貞') == ['王世貞']


def test_author_raw_chars_no_fold():
    assert not R.author_ok('王世贞', {'王世貞'})


def test_author_containment_len2():
    assert R.author_ok('王世貞', {'王世貞'})
    assert R.author_ok('歐陽修', {'歐陽'})
    assert not R.author_ok('王', {'王世貞'})


def test_circle_unique_only():
    W = {'a': ('史記', {R.N.norm_title('史記', False)}, {'司馬遷'}),
         'b': ('史記', {R.N.norm_title('史記', False)}, {'司馬遷'})}
    base = {'旧主类': 'E', 'excluded': '', '升档原因码': '', '旧reasons': '', '新档': '', 'lib_title': '史記', 'lib_author': '司馬遷'}
    res, _ = R.circle([dict(base, candidates='a')], W)
    assert len(res) == 1
    res, _ = R.circle([dict(base, candidates='a,b')], W)
    assert res == []
