"""A8 欧美六馆适配器（adapters/euro.py）与拼音责任者比对（tier.auth_relation pinyin）。"""
import os
import sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from adapters import euro as E  # noqa: E402
import tier  # noqa: E402


@pytest.mark.parametrize('raw,core,rest', [
    ('五車韻府 卷6-7', '五車韻府', '卷6-7'),
    ('鄒平縣志 ; 十八卷, 姓氏 [一卷]', '鄒平縣志', '十八卷, 姓氏 [一卷]'),
    ('明史藁 明史藁', '明史藁', ''),
    ('Han i araha = 御製滿洲蒙古漢字三合切韻淸文鑑 1 第一函', '御製滿洲蒙古漢字三合切韻淸文鑑', '1 第一函'),
    ('Jin Zhang suo cang jia gu bu ci 金璋所藏甲骨卜辞', '金璋所藏甲骨卜辞', ''),
    ('[藥方雜抄]', '藥方雜抄', ''),
    ('弘簡錄 254卷', '弘簡錄', '254卷'),
    ('@ 書法雅言 1 卷', '書法雅言', '1 卷'),
])
def test_title(raw, core, rest):
    assert E.split_title(E.han_part(raw)) == (core, rest)


def test_juan_and_part():
    assert E.juan_of('十八卷, 姓氏 [一卷]') == 18
    assert E.PART.search('卷6-7') and E.PART.search('1 第一函') and E.PART.search('卷八至九')
    assert not E.PART.search('十八卷')


def test_han_names():
    names, lead, era_tok = E.han_names('*清* 阿桂；*清* 賽尚阿')
    assert names == {'阿桂', '赛尚阿'} and lead == {'阿桂'} and era_tok == '清'
    assert E.han_names('作者不详; 抄手不详')[0] == set()
    assert E.han_names('深根, 輔仁；フカネ, スケヒト')[0] == {'深根辅仁'}
    assert '范廷瑚' in E.han_names('陳藎謨訂 胡邵瑛纂 范廷瑚梓')[0]


def test_roman_names_loc_roles():
    # 只作序跋（xu／jiu xu／ba）与收藏者不算责任者；多役割里只要有一个著述役割就留
    s = ('Wang, Shilai, zuan xiu, xu；Hang, Yunlong, tong jiao, ba；Dai, Wenwu, xu；Wang, Tianbi, jiu xu；'
         'Gao, Hongcai, 1852-1918 collector')
    assert E.roman_names(s, loc=True) == ['wangshilai', 'hangyunlong']
    assert E.roman_names('Agui, 1717-1797, zhuan；China. Wu ying dian, ke', loc=True) == ['agui']
    assert E.roman_names('Yang, Xiong, 53 B.C.-18 A.D., zhuan', loc=True) == ['yangxiong']


def _w(*authors):
    return dict(id='w', title='t', authors=set(authors), alias=set(), eras=[], juan=None, juan_unit=None)


def test_pinyin_relation():
    pol = tier.Policy()
    prof = pol.profile('loc')
    assert tier.auth_relation(set(), _w('陈继儒'), prof, pol, ['chenjiru']) == 'eq'
    assert tier.auth_relation(set(), _w('王天壁'), prof, pol, ['wangshilai']) == 'diff'
    assert tier.auth_relation(set(), _w('释自如'), prof, pol, ['ziru']) == 'eq'
    # 非拼音源不受影响
    assert tier.auth_relation(set(), _w('陈继儒'), pol.profile('nlc'), pol, ['chenjiru']) == 'missing'
