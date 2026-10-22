"""块 D 步 2 单测：normalize.py。期望值全部来自旧报告里的真实错例或已核对的异体对。"""
import pytest
import normalize as N

# (a, b)：归一后应同键
SAME = [
    ('戲瑕', '戯瑕'), ('勅修百丈清規', '敕修百丈清規'), ('不繫舟漁集', '不繋舟漁集'),
    ('疎影樓詞續鈔', '疏影樓詞續鈔'), ('鉅鹿東觀集', '钜鹿東觀集'), ('紀效新書', '紀効新書'), ('百丈淸規', '百丈清規'),
    ('國淸百錄', '國清百錄'), ('隸辨', '隷辨'), ('學蔀通辨', '学蔀通弁'), 
    ('唐類函', '唐类函'), ('太平御覽', '太平御览'), ('欽定四庫全書總目', '钦定四库全书总目'),
    ('經典釋文', '経典釈文'), ('図書寮', '圖書寮'), ('齋', '斋'), ('竝', '並'), ('廼', '乃'),
    ('曾鞏', '曾巩'), ('朱熹', '朱熹'), ('章頴', '章穎'),
    ('史記', '史记'), ('通鑒釋文辯誤', '通鉴释文辩误'),
    # R1-A4（2026-10-15）新增 7 对（攷→考 于 #477 后重开）
    ('過去荘厳劫千佛名経', '過去莊嚴刼千佛名經'), ('大般湼槃經', '大般涅槃經'),
    ('藥師瑠璃光如來', '藥師琉璃光如來'), ('按鍳演義', '按鑑演義'), ('大乗掌珎論', '大乘掌珍論'),
    ('法句譬喩經', '法句譬喻經'), ('唐詩艶逸品', '唐詩艷逸品'),
]
# 不得同键：D2 报告的同名异书、语义不同字
DIFF = [
    ('文集', '文輯'), ('釋車', '釋軍'), ('銷', '消'), ('瓣香', '辨香'),
    ('朱國楨', '朱國禎'), ('陸化熙', '陸化熈'.replace('熈', '熹')), ('王士點', '王士錄'),
    ('辨惑編', '辯惑編'), ('周易', '尚書'), ('論語', '孟子'),
]


@pytest.mark.parametrize('a,b', SAME)
def test_title_same(a, b):
    assert N.norm_title(a) == N.norm_title(b)


@pytest.mark.parametrize('a,b', DIFF)
def test_text_not_merged(a, b):
    assert N.norm_title(a) != N.norm_title(b)


@pytest.mark.parametrize('raw,expect', [
    ('頌天臚筆 三卷', '颂天胪笔'), ('唐類函二百卷', '唐类函'), ('論語集解（附札記）', '论语集解'.replace('集', '集')),
    ('史記 　130卷', '史记'), ('說文解字注·十五卷', '说文解字注'), ('〔宋〕東坡集', '东坡集'),
])
def test_title_strip(raw, expect):
    assert N.norm_title(raw) == N.norm_title(expect)


@pytest.mark.parametrize('raw,expect', [
    ('[宋]曾鞏撰', '曾巩'), ('(明)倪謙撰', '倪谦'), ('[(明)倪谦撰]', '倪谦'), ('陳琯', '陈琯'),
    ('(清)王仁俊輯', '王仁俊'), ('[王仁俊]編', '王仁俊'), ('[康有為撰]', '康有为'), ('（清）孫家鼐編', '孙家鼐'),
    ('(清)顧嗣立刪補', '顾嗣立'), ('(明)鄭之玄評點', '郑之玄评点'),  # 評點不在 ROLE（同 D2）：保守，宁可存疑
     ('歐陽修撰', '欧阳修'), ('釋慧遠', '释慧远'),
    ('(宋)朱服[等]校定', '朱服等校定'), ('(元)王士點撰', '王士点'), ('(南朝宋)畺良耶舍譯', '畺良耶舍'),
])
def test_author(raw, expect):
    assert N.norm_author(raw).split('|')[0] == N.norm_author(expect).split('|')[0] or N.norm_author(raw) == N.norm_author(expect)


def test_author_surname_not_eaten_as_era():
    """D2 暴露的错例：「陳／宋」当朝代吃掉作者姓（「陳琯」成「琯」）。"""
    assert N.norm_author('陳琯') == '陈琯'
    assert N.norm_author('宋祁') == '宋祁'


def test_square_bracket_author_kept():
    assert N.norm_author('[倪謙]') == '倪谦'


def test_wangshidian_not_stripped():
    """D3 的 ROLE 含 点，会把 王士點 吃成 王士；中文侧不应如此。"""
    assert N.norm_author('王士點') == '王士点'


def test_kokusho_author_formats():
    assert N.parse_kokusho_author('朱／熹 撰')[0] == {N.fold('朱熹')}
    names, era = N.parse_kokusho_author('（魏）／何／晏 集解')
    assert era == '魏' and N.fold('何晏') in names


def test_fold_idempotent():
    for s in ['辯', '辩', '辨', '弁', '淸', '清', '疎', '疏', '經', '经', '斎', '齋']:
        assert N.fold(N.fold(s)) == N.fold(s)


def test_conflicts_conservative():
    """③与②冲突的字对一律不合并，且已列入 CONFLICTS 清单。"""
    ks = {c[0] for c in N.CONFLICTS}
    assert {'集', '连', '销', '瓣', '馀', '祯', '辩'} <= ks
    for k in ('集', '连', '销', '瓣', '馀', '祯', '辩'):
        assert N.fold(k) == N._base(k)


def test_layer3_adds_something():
    assert N.fold('淸') == N.fold('清') and N.fold('疎') == N.fold('疏')


def test_empty_inputs():
    assert N.norm_title(None) == '' and N.norm_title('') == ''
    assert N.norm_author(None) == '' and N.norm_text('') == ''


def test_cn_mode_keeps_lian_lian_apart():
    """jp 表有 連→聯、余→餘（日文用法）；中文来源（国图）用 jp=False 不得并字。"""
    assert N.norm_title('連山', jp=False) != N.norm_title('聯山', jp=False)
    assert N.norm_title('連山') == N.norm_title('聯山')            # 日文来源沿 D3
    assert N.fold('隷辨') == N.fold('隸辨')


@pytest.mark.parametrize('raw', ['王某彙編', '王某汇编', '王某匯編'])
def test_author_huibian_stripped(raw):
    assert N.norm_author(raw, True) == '王某'
