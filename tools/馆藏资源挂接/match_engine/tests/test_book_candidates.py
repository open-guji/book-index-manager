import book_candidates as B


def test_reign_year():
    assert B.reign_year('日本天保丁酉(八年)津藩', '天保') == 8
    assert B.reign_year('清嘉慶二十一年胡氏', '嘉慶') == 21
    assert B.reign_year('刊 天保８序', '天保') == 8
    assert B.reign_year('清乾隆間寶笏樓刻本', '乾隆') is None


def test_parse_type():
    reigns = {'嘉慶', '乾隆'}
    assert B.parse_version('清嘉慶二十一年胡氏原刊本', reigns) == ('嘉慶', '清', '刻')
    assert B.parse_version('清寫', reigns)[2] == '抄'
    assert B.parse_version('清乾隆間鈔本', reigns)[2] == '抄'
    assert B.parse_version('', reigns) == ('', '', '')
