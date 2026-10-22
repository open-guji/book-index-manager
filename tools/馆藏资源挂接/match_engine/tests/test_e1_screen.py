import e1_screen as S


def test_title_keys():
    assert S.tkey('新序 xin xu 十卷') == S.tkey('新序')
    assert S.tkey2('新刊論衡') == S.tkey2('論衡')
    assert S.tkey('增補論衡') != S.tkey('論衡')            # 不剥 增補


def test_name_match():
    assert S.name_match('劉向', ['刘向'])[0] == '等'
    assert S.name_match('劉績', ['镏績'])[0] in ('等', '异写')
    assert S.name_match('張祜', ['張祐'])[0] == '异写'
    assert S.name_match('王充', ['王允'])[0] == '近似'      # 只作备注，不命中


def test_author_part_cut():
    assert S.au_names('(汉)刘向撰 版本项： 刻本') == ['刘向']
    assert S.page_era('(汉)刘向撰 版本项： 刻本') == '汉'
