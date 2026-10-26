"""块 D 步 4 单测：tier.py。每个 reason 码 ≥2 条用例（含旧实测错例）＋对抗集＋属性测试。"""
import json
import random
import re

import pytest

import era
import tier
from normalize import norm_author
from tier import Policy, judge
from workindex import WorkIndex


@pytest.fixture(autouse=True, scope='module')
def keys(tmp_path_factory):
    def e(i, n, s, en=None):
        d = {'id': i, 'primary_name': n, 'subtype': 'dynasty', 'start': s}
        if en is not None:
            d['end'] = en
        return n, d
    ents = [e('1', '唐', 618, 907), e('2', '北宋', 960, 1127), e('3', '南宋', 1127, 1279), e('4', '元', 1271, 1368),
            e('5', '明', 1368, 1644), e('6', '清', 1636, 1912), e('7', '北周', 557, 581), e('8', '宋', 420, 479), e('9', '宋', 960, 1279),
            e('10', '漢', -206, 8), e('11', '漢', 947, 950), e('12', '陳', 557, 589), e('13', '隋', 581, 618)]
    ks = {}
    for n, d in ents:
        ks.setdefault(n, []).append(d)
    p = tmp_path_factory.mktemp('k') / 'k.json'
    p.write_text(json.dumps({'keys': ks, 'count': {}, 'normalize': {}, 'version': 1}), encoding='utf-8')
    era.load_keys(str(p))
    yield


POL = Policy()


def W(i, title, authors=(), juan=None, unit='卷', add=()):
    return dict(id=i, title=title, authors=[dict(name=n, dynasty=d) for n, d in authors],
                juan_count=dict(number=juan, unit=unit) if juan else None, additional_titles=list(add))


def wi_of(*works, jp=False, entities=None):
    return WorkIndex.build(works, jp=jp, entities=entities)


def R(title, author='', version='', source='nlc', **kw):
    d = dict(source=source, title_raw=title, author_raw=author, version_raw=version)
    d.update(kw)
    return d


def K(title, names, era_token=None, **kw):
    p = dict(segs=[title], wname='', names=set(names), era_token=era_token)
    p.update(kw)
    return dict(source='kokusho', title_raw=title, parsed=p)


def codes(res):
    return set(res.codes)


# ---------------------------------------------------------------- 确定（四个充分条件）
BASE = wi_of(W('W1', '論衡', [('王充', '漢')]), W('W2', '文心雕龍', [('劉勰', '元')]), W('W3', '琴川志', [('孫應時', '宋')]),
             W('W4', '陳氏書畫錄', [('陳琯', '清')]), W('W5', '松雪齋集', [('倪謙', '明')]))


@pytest.mark.parametrize('rec,wid', [
    (R('論衡', '王充'), 'W1'),
    (R('論衡 三十卷', '[漢]王充撰'), 'W1'),
    (R('文心雕龍', '劉勰 撰'), 'W2'),
    (R('陳氏書畫錄', '[陳琯]'), 'W4'),            # 旧实测错例：陈琯。方括号内是人名不是朝代（旧引擎把「陳」当陈朝）
    (R('松雪齋集', '[(明)倪謙撰]'), 'W5'),         # 旧实测错例：方括号+圆括号朝代
])
def test_confirmed(rec, wid):
    r = judge(rec, BASE, POL)
    assert r.tier == '确定' and r.work_id == wid
    assert r.codes == ['T_EXACT', 'A_EQ', 'W_UNIQUE', 'ERA_OK']


# ---------------------------------------------------------------- 各降级码，每码 ≥2 例
CASES = [
    # (code, wi, rec)
    ('T_FUZZY', BASE, R('重刊論衡', '王充')),
    ('T_FUZZY', BASE, R('新刻文心雕龍', '劉勰')),
    ('T_AUTHOR_NEAR', wi_of(W('N1', '東坡先生詩集', [('蘇軾', '宋')])), R('東坡先生詩集選', '蘇軾')),
    ('T_AUTHOR_NEAR', wi_of(W('N2', '日知錄集釋', [('顧炎武', '清')])), R('日知錄集釋補', '顧炎武')),
    ('A_MISSING', BASE, R('論衡', '')),
    ('A_MISSING', wi_of(W('N3', '無名氏書')), R('無名氏書', '張三')),
    ('A_DIFF', wi_of(W('S1', '釋車', [('朱駿聲', '清')])), R('釋車', '蕭掄')),     # 同题异书
    ('A_DIFF', BASE, R('論衡', '某某')),
    ('ERA_CONFLICT', BASE, R('論衡', '[明]王充')),
    ('ERA_CONFLICT', BASE, R('松雪齋集', '[唐]倪謙')),
    ('ERA_VERSION_EARLIER', wi_of(W('V1', '集古錄', [('歐陽修', '明')])), R('集古錄', '歐陽修', '宋刻本')),
    ('ERA_VERSION_EARLIER', wi_of(W('V2', '詩品', [('鍾嶸', '清')])), R('詩品', '鍾嶸', '唐寫本')),
    ('JUAN_GAP', wi_of(W('J1', '說文', [('許慎', '漢')], juan=3)), R('說文 一百卷', '許慎')),
    ('JUAN_GAP', wi_of(W('J2', '史記', [('司馬遷', '漢')], juan=2)), R('史記 一百三十卷', '司馬遷')),
    ('COLLECTION', BASE, R('論衡  全書', '王充')),
    ('COLLECTION', wi_of(W('C1', '六十種曲', [('毛晉', '明')])), R('六十種曲', '毛晉')),     # 旧实测错例：六十種曲
    ('MULTI_TITLE', BASE, R('論衡  文心雕龍', '王充')),
    ('MULTI_TITLE', wi_of(W('M1', '吳越所見書畫錄', [('陸時化', '清')])), R('吳越所見書畫錄 六卷  書畫說鈴', '陸時化')),   # 旧实测错例：合刻
    ('LOCAL_PART', BASE, R('論衡  存三卷', '王充')),
    ('LOCAL_PART', BASE, R('論衡  摘抄', '王充')),
    ('GAZETTEER_PREFIX', wi_of(W('G1', '琴川志', [('孫應時', '宋')])), R('[宋]琴川志', '孫應時')),
    ('GAZETTEER_PREFIX', wi_of(W('G2', '江寧縣志', [('某人', '清')])), R('[清]江寧縣志', '某人')),
    ('MULTI_WORK', wi_of(W('D1', '詩集', [('甲', '明')]), W('D2', '詩集', [('乙', '清')])), R('詩集', '')),
    ('MULTI_WORK', wi_of(W('D3', '文集', [('丙', '明')]), W('D4', '文集', [('丙', '唐')])), R('文集', '[明]丙')),   # 都 eq 但一个朝代冲突→good=1, eq=2
    ('DUP_WORK_SUSPECT', wi_of(W('P1', '論語注', [('何晏', '魏')]), W('P2', '論語注', [('何晏', '魏')])), R('論語注', '何晏')),
    ('DUP_WORK_SUSPECT', wi_of(W('P3', '孟子注', [('趙岐', '漢')]), W('P4', '孟子注', [('趙岐', '漢')])), R('孟子注', '趙岐')),
    ('T_MISS', BASE, R('完全不存在的書', '某')),
    ('T_MISS', BASE, R('另一部沒有的書', '')),
    ('T_EMPTY', BASE, R('', '王充')),
    ('T_EMPTY', BASE, R('   ', '')),
    ('NOT_HANZI', BASE, R('Analects', '')),
    ('NOT_HANZI', BASE, R('123', '')),
]


@pytest.mark.parametrize('code,wi,rec', CASES, ids=[f'{c}-{i}' for i, (c, _, _) in enumerate(CASES)])
def test_downgrade_code(code, wi, rec):
    r = judge(rec, wi, POL)
    assert r.tier != '确定'
    assert code in r.codes, (r.codes, r.tier)
    assert r.tier == ('无' if code in tier.CODES_NONE else '存疑')


def test_none_tier_has_no_work_and_doubt_may_have_one():
    assert judge(R('不存在的書', ''), BASE, POL).work_id == ''
    assert judge(R('重刊論衡', '王充'), BASE, POL).work_id == 'W1'      # T_FUZZY 唯一时仍给首选候选，但不确定


def test_a_alias_only_kokusho():
    wi = wi_of(W('A1', '鐵網珊瑚', [('朱存理', '明')]), jp=True, entities={'e1': {'name': '朱存理', 'alts': ['野航']}})
    wi.works['A1']['alias'] = {'野航'}    # build 没有 entity_id 的 authors，直接放别名
    r = judge(K('鐵網珊瑚', {'野航'}), wi, POL)
    assert r.tier == '存疑' and 'A_ALIAS_ONLY' in r.codes and r.work_id == 'A1'


def test_a_alias_only_second():
    wi = wi_of(W('A2', '玉海', [('王應麟', '宋')]), jp=True)
    wi.works['A2']['alias'] = {'厚齋'}
    r = judge(K('玉海', {'厚齋'}), wi, POL)
    assert 'A_ALIAS_ONLY' in r.codes and r.tier == '存疑'


def test_group_split_and_cap_dropped_are_passthrough_codes():
    """GROUP_SPLIT／CAP_DROPPED 由 groups／writeplan 产生；tier 只负责把适配器给的 force 降级。"""
    wi = wi_of(W('F1', '論衡', [('王充', '漢')]), jp=True)
    for c in ('GROUP_SPLIT', 'CAP_DROPPED'):
        r = judge(K('論衡', {'王充'}, force=[c]), wi, POL)
        assert r.tier == '存疑' and c in r.codes


def test_kokusho_parsed_confirmed_and_multi():
    wi = wi_of(W('K1', '論衡', [('王充', '漢')]), jp=True)
    assert judge(K('論衡', {'王充'}), wi, POL).tier == '确定'
    r = judge(dict(source='kokusho', title_raw='論衡／文心雕龍', parsed=dict(segs=['論衡', '文心雕龍'], wname='', names={'王充'})), wi, POL)
    assert r.tier == '存疑' and 'MULTI_TITLE' in r.codes


def test_ndl_wildcard_author():
    wi = wi_of(W('N1', '紅豆詞', [('繆荃孫', '清')]), jp=True)
    rec = dict(source='ndl', title_raw='紅豆詞', parsed=dict(segs=['紅豆詞'], wname='', names={norm_author('繆〓孫')}))
    r = judge(rec, wi, POL)
    assert r.tier == '确定'
    rec2 = dict(source='ndl', title_raw='紅豆詞', parsed=dict(segs=['紅豆詞'], wname='', names={norm_author('繆〓某')}))
    assert judge(rec2, wi, POL).tier == '存疑'


def test_old_bug_chen_surname_not_dynasty():
    """旧 author_era 把「[陳琯]」的陳当陈朝（序 2）与清（8）判朝代冲突；strict 后不再。"""
    r = judge(R('陳氏書畫錄', '[陳琯]'), BASE, POL)
    assert r.tier == '确定' and 'ERA_CONFLICT' not in r.codes


def test_old_bug_tang_shunzhi():
    wi = wi_of(W('T1', '荊川集', [('唐順之', '明')]))
    assert judge(R('荊川集', '[唐順之撰]'), wi, POL).tier == '确定'


# ---------------------------------------------------------------- 对抗集（补充，约 30 条；与上面合计 ≥60）
ADV_NOT_CONFIRMED = [
    R('論衡', '王充', '宋刻本'),                    # 宋刻王充(汉)：版本晚于作者正常 → 其实应确定，见 ADV_CONFIRMED，这里不放
]
ADV_NOT_CONFIRMED = [
    R('論衡  全集', '王充'), R('論衡  叢書', '王充'), R('論衡  三種', '王充'), R('論衡  欽定四庫全書', '王充'),
    R('論衡 二十八卷  文心雕龍 十卷', '王充'), R('[清]琴川志', '孫應時'), R('論衡', '劉勰'), R('論衡', ''),
    R('文心雕龍  殘本', '劉勰'), R('文心雕龍  零本', '劉勰'), R('文心雕龍  存二卷', '劉勰'), R('文心雕龍 序', '劉勰'),
    R('新刻論衡', '王充'), R('重訂文心雕龍', '劉勰'), R('論衡釋', '王充'), R('文心雕龍選', '劉勰'),
]
ADV_CONFIRMED = [
    R('論衡', '王充', '宋刻本'), R('論衡', '[漢]王充撰', '明嘉靖刻本'), R('文心雕龍', '劉勰撰'), R('文心雕龍 十卷', '[梁]劉勰'),
    R('論衡', '王充 著'), R('論衡 三十卷', '王充撰'), R('文心雕龍', '（梁）劉勰'), R('琴川志', '孫應時 撰'),
]


@pytest.mark.parametrize('rec', ADV_NOT_CONFIRMED, ids=lambda r: r['title_raw'] + '|' + r['author_raw'])
def test_adversarial_not_confirmed(rec):
    assert judge(rec, BASE, POL).tier != '确定'


@pytest.mark.parametrize('rec', ADV_CONFIRMED, ids=lambda r: r['title_raw'] + '|' + r['author_raw'])
def test_adversarial_confirmed(rec):
    assert judge(rec, BASE, POL).tier == '确定'


def test_all_codes_have_text():
    assert set(tier.ALL_CODES) == set(tier.TEXT)


def test_every_doubt_has_codes():
    for c, wi, rec in CASES:
        r = judge(rec, wi, POL)
        assert r.codes, c


# ---------------------------------------------------------------- 属性测试
TITLES = ['論衡', '文心雕龍', '史記通論', '東坡集', '日知錄', '說文解字', '玉海', '朱子語類']
AUTHORS = [('王充', '漢'), ('劉勰', '元'), ('司馬遷', '漢'), ('蘇軾', '宋'), ('顧炎武', '清'), ('許慎', '漢'), ('王應麟', '宋'), ('黎靖德', '宋')]


def _base_case(i):
    t, (a, d) = TITLES[i % len(TITLES)], AUTHORS[i % len(AUTHORS)]
    works = [W('B%d' % i, t, [(a, d)])]
    return works, R(t, '[%s]%s' % (d, a)), t, a, d


def _break(mut, works, rec, t, a, d, i):
    """施加一个「去掉某个充分条件」的扰动，返回新 (works, rec)。"""
    rec = dict(rec)
    works = list(works)
    if mut == 'title':        # 题名不再全等（尾部加字）
        rec['title_raw'] = t + '補'
    elif mut == 'title_prefix':
        rec['title_raw'] = '新刻' + t
    elif mut == 'author_missing':
        rec['author_raw'] = ''
    elif mut == 'author_diff':
        rec['author_raw'] = '某乙丙'
    elif mut == 'dup_work':
        works.append(W('DUP%d' % i, t, [(a, d)]))
    elif mut == 'era':
        wrong = '明' if d != '明' else '唐'
        cur = re.sub(r'^\[[^\]]*\]', '', rec['author_raw'])
        rec['author_raw'] = '[%s]%s' % (wrong, cur)
    elif mut == 'coll':
        rec['title_raw'] = t + '  叢書'
    elif mut == 'multi':
        rec['title_raw'] = t + '  別有他書'
    elif mut == 'local':
        rec['title_raw'] = t + '  存三卷'
    return works, rec


def test_property_missing_condition_never_confirmed():
    muts = ['title', 'title_prefix', 'author_missing', 'author_diff', 'dup_work', 'era', 'coll', 'multi', 'local']
    rng = random.Random(580583)
    n_conf = n_broken = 0
    for i in range(1000):
        works, rec, t, a, d = _base_case(i)
        assert judge(rec, wi_of(*works), POL).tier == '确定', (rec,)       # 未扰动必确定
        n_conf += 1
        k = rng.randint(1, 3)
        picks = rng.sample(muts, k)
        w2, r2 = works, rec
        for m in picks:
            w2, r2 = _break(m, w2, r2, t, a, d, i)
        res = judge(r2, wi_of(*w2), POL)
        n_broken += 1
        assert res.tier != '确定', (picks, r2, res.codes)
    assert n_conf == n_broken == 1000


def test_property_oracle_confirmed_implies_four_conditions():
    """随机题名／作者／朝代组合；独立 oracle 重算四条件，judge 判确定时必须全成立。"""
    rng = random.Random(7)
    pool_t = TITLES + ['論衡注', '文心雕龍注', '史記']
    pool_a = AUTHORS + [('', '')]
    n_conf = 0
    for _ in range(1000):
        works = []
        for j in range(rng.randint(1, 4)):
            t = rng.choice(pool_t)
            au = [rng.choice(pool_a)] if rng.random() < 0.9 else []
            works.append(W('R%d' % j, t, [x for x in au if x[0]]))
        wi = wi_of(*works)
        if rng.random() < 0.7:        # 多数记录取自某个 Work（否则几乎从不命中，属性测试空转）
            src = rng.choice(works)
            t = src['title']
            a, d = (src['authors'][0]['name'], src['authors'][0]['dynasty']) if src['authors'] else ('', '')
            if rng.random() < 0.2:
                d = rng.choice(['明', '唐', '清'])
        else:
            t = rng.choice(pool_t)
            a, d = rng.choice(pool_a)
        rec = R(t, ('[%s]%s' % (d, a)) if a and rng.random() < 0.6 else a)
        res = judge(rec, wi, POL)
        if res.tier != '确定':
            continue
        n_conf += 1
        w = next(x for x in works if x['id'] == res.work_id)
        same_title = [x for x in works if x['title'] == t]
        eq_auth = [x for x in same_title if {y['name'] for y in x['authors']} & {a}]
        assert w['title'] == t                                   # T_EXACT
        assert a and w in eq_auth                                # A_EQ
        assert len(eq_auth) == 1                                 # W_UNIQUE（同题同责任者只一个）
        if rec['author_raw'].startswith('['):                    # ERA_OK
            assert all(y['dynasty'] == d for y in w['authors'] if y['name'] == a)
    assert n_conf > 100      # 属性测试得真有确定样本，否则是空转


def test_local_part_text_only_scans_dropped_text():
    from titleparse import local_part_text, LOCAL_PART
    hit = lambda t, r='': bool(LOCAL_PART.search(local_part_text(t, r)))
    assert not hit("新序")
    assert not hit("廣川書跋")
    assert not hit("節要集")
    assert hit("某書[摘抄]")
    assert hit("某書", "存一卷")


def test_author_names_not_eaten_by_role_chars():
    """Sol 复核（步 6）：末字像役割词的真人名不得被剥。"""
    import normalize
    assert normalize.parse_kokusho_author('蔡／元定 撰', primary_only=True)[0] == {'蔡元定'}
    assert normalize.parse_kokusho_author('陳／文述 撰', primary_only=True)[0] == normalize.parse_kokusho_author('陳／文述撰', primary_only=True)[0]
    import adapters.ndl as ndl
    assert '夏树芳' in ndl.parse_ndl_author('明夏樹芳輯')[0]


def test_zhong_in_name_not_taken_as_chongzhuan():
    import tier
    pol = tier.Policy()
    r = dict(source='nlc', source_record_id='x', group_key='', title_raw='庸齋日記', author_raw='(明)徐三重撰', version_raw='', juan=None,
             class_raw='', url='', image_url='', has_image=True, extra={})
    assert tier.prepare(r, pol.profile('nlc')).names == {'徐三重'}


# ---- SUPPLEMENT：记录自身题名带续／补遗等标记而 Work 题名无（Silas 抽检 kokusho 300092672）
def _kok(wname, seg, names):
    return dict(source='kokusho', title_raw=seg, author_raw='', version_raw='',
                parsed=dict(wid='1', wname=wname, names=set(norm_author(n, True) for n in names), era_token=None, juan=None, segs=[seg], alts=[], sort=''))


def test_supplement_via_work_name_downgrades():
    wi = wi_of(W('w1', '釋氏稽古略', [('覺岸', '宋')]), jp=True)
    r = judge(_kok('釋氏稽古略', '釋鑑稽古略續集', ['覺岸', '幻輪']), wi, POL)
    assert r.tier == '存疑' and 'SUPPLEMENT' in r.codes


def test_supplement_not_triggered_when_work_has_marker():
    wi = wi_of(W('w1', '圖繪寶鑑續編', [('韓昂', '明')]), jp=True)
    r = judge(_kok('圖繪寶鑑續編', '圖繪寶鑑續編', ['韓昂']), wi, POL)
    assert 'SUPPLEMENT' not in r.codes


def test_supplement_nlc_style_marker_mismatch_and_plain_buzhu_ok():
    wi = wi_of(W('w1', '容齋隨筆', [('洪邁', '宋')]), W('w2', '蒙求', [('李瀚', '唐')]), jp=True)
    r = judge(_kok('容齋隨筆', '容齋隨筆續筆', ['洪邁']), wi, POL)
    assert r.tier == '存疑' and 'SUPPLEMENT' in r.codes
    r2 = judge(_kok('蒙求', '徐状元補注蒙求', ['李瀚']), wi, POL)      # 補注／増補 是版本修饰，不算续集
    assert 'SUPPLEMENT' not in r2.codes


def test_nlc_alias_experiment_flag_only_changes_nlc_when_on():
    """R1-E1：nlc 默认 alias=False（指纹不变）；--alias 实验配置下，仅别名相合→A_ALIAS_ONLY，仍为存疑、不升档。"""
    import dataclasses
    assert POL.profile('nlc').alias is False
    pol = tier.Policy()
    pol.profiles['nlc'] = dataclasses.replace(pol.profiles['nlc'], alias=True)
    wi = wi_of(W('A9', '鐵網珊瑚', [('朱存理', '明')]), jp=False)
    wi.works['A9']['alias'] = {'野航'}
    r = judge(R('鐵網珊瑚', '野航'), wi, pol)
    assert r.tier == '存疑' and 'A_ALIAS_ONLY' in r.codes
    r0 = judge(R('鐵網珊瑚', '野航'), wi, POL)
    assert 'A_ALIAS_ONLY' not in r0.codes


# ---------------------------------------------------------------- 已知非重复 Work 对
def _sibs():
    return wi_of(jp=True, *[W('Q1', '瀕湖脈學', [('李時珍', '明')], ), W('Q2', '奇經八脈考', [('李時珍', '明')], add=['瀕湖脈學'])])


def test_known_nondup_pref_main_title(monkeypatch):
    rec = K('瀕湖脈學', {norm_author('李時珍', True)})
    assert 'DUP_WORK_SUSPECT' in judge(rec, _sibs(), POL).codes
    monkeypatch.setattr(tier, 'KNOWN_NONDUP', {frozenset(('Q1', 'Q2'))})
    r = judge(rec, _sibs(), POL)
    assert 'DUP_WORK_SUSPECT' not in r.codes and r.work_id == 'Q1'


def test_known_nondup_not_listed_stays_dup(monkeypatch):
    monkeypatch.setattr(tier, 'KNOWN_NONDUP', {frozenset(('Q1', 'Zx'))})
    assert 'DUP_WORK_SUSPECT' in judge(K('瀕湖脈學', {norm_author('李時珍', True)}), _sibs(), POL).codes


def test_known_nondup_multi_title_unchanged(monkeypatch):
    monkeypatch.setattr(tier, 'KNOWN_NONDUP', {frozenset(('Q1', 'Q2'))})
    r = judge(R('瀕湖脈學  奇經八脈考', '李時珍'), _sibs(), POL)
    assert r.tier != '确定'


def test_known_nondup_uses_segs_not_wname(monkeypatch):
    """合刻名 wname 排在 keys 首位；认主题名须用本册 segs[0]（旧误选：瀕湖脈學 册被挂到合刻名 奇經八脈考）。"""
    monkeypatch.setattr(tier, 'KNOWN_NONDUP', {frozenset(('Q1', 'Q2'))})
    r = judge(K('瀕湖脈學', {norm_author('李時珍', True)}, wname='奇經八脈考'), _sibs(), POL)
    assert r.work_id == 'Q1' and 'DUP_WORK_SUSPECT' not in r.codes


# ---------------------------------------------------------------- R1-E5 刹车（早稲田）：ALT_TITLE_SIBLING／A_SECONDARY_ONLY
def WS(title, names, lead=None, **kw):
    p = dict(segs=[title], wname='', names=set(names), era_token=None, lead=set(lead if lead is not None else list(names)[:1]))
    p.update(kw)
    return dict(source='waseda', title_raw=title, parsed=p)


def test_alt_title_sibling_caishi_yueling():
    """蔡氏月令：只靠 Work 附加题名命中，且早稲田多一个责任者蔡雲 → 存疑。"""
    wi = wi_of(W('Y1', '月令章句', [('蔡邕', '漢')], add=['蔡氏月令']), jp=True)
    r = judge(WS('蔡氏月令', {'蔡邕', '蔡云'}, lead={'蔡邕'}), wi, POL)
    assert r.tier == '存疑' and 'ALT_TITLE_SIBLING' in r.codes


def test_alt_title_sibling_zhouyi_zhushu():
    """周易注疏：另有同名主题名 Work，靠责任者落到版本级 Work（附加题名）→ 存疑。"""
    wi = wi_of(W('Z1', '周易注疏', [('王弼', '魏')]), W('Z2', '宋監本周易正義', [('孔穎達', '唐')], add=['周易註疏']), jp=True)
    r = judge(WS('周易注疏', {norm_author('孔穎達', True)}), wi, POL)
    assert r.tier == '存疑' and 'ALT_TITLE_SIBLING' in r.codes


def test_alt_title_plain_alias_still_confirmed():
    """单一 Work、无额外责任者的正当别名仍确定。"""
    wi = wi_of(W('A1', '論語集解', [('何晏', '魏')], add=['論語註疏']), jp=True)
    assert judge(WS('論語註疏', {'何晏'}), wi, POL).tier == '确定'


def test_a_secondary_only():
    """庸行編：站方首位责任者史典，Work 仅牟允中（第二位）→ 存疑。"""
    wi = wi_of(W('H1', '庸行編', [('牟允中', '明')]), jp=True)
    import dataclasses
    pol = Policy()
    pol.profiles['waseda'] = dataclasses.replace(pol.profiles['waseda'], lead_brake=True)     # 默认关（Rhea 裁决 K13：完整责任表述内相交即可）
    r = judge(WS('庸行編', {'史典', '牟允中'}, lead={'史典'}), wi, pol)
    assert r.tier == '存疑' and 'A_SECONDARY_ONLY' in r.codes
    assert judge(WS('庸行編', {'史典', '牟允中'}, lead={'牟允中'}), wi, pol).tier == '确定'
    assert judge(WS('庸行編', {'史典', '牟允中'}, lead={'史典'}), wi, POL).tier == '确定'


def test_brakes_off_for_other_sources():
    wi = wi_of(W('H2', '庸行編', [('牟允中', '明')]), jp=True)
    k = K('庸行編', {'史典', '牟允中'}, lead={'史典'})
    assert judge(k, wi, POL).tier == '确定'


def test_human_verdicts(monkeypatch):
    wi = wi_of(W('H9', '庸行編', [('牟允中', '明')]), jp=True)
    rec = WS('庸行編', {'牟允中'}); rec['source_record_id'] = 'zz1'
    monkeypatch.setattr(tier, 'HUMAN', {('waseda', 'zz1'): 'reject'})
    r = judge(rec, wi, POL)
    assert r.tier == '存疑' and 'HUMAN_REJECT' in r.codes


def test_split_title_unjuan_marks():
    """A7：国图「记政录 不分卷」「甫田集 □□卷」——单空格或粘连的不分卷／缺数卷注要切到 rest，否则题名键带「不分卷」永远对不上。"""
    from titleparse import split_title
    assert split_title('记政录 不分卷')[:2] == ('记政录', '不分卷')
    assert split_title('督抚疏稿不分卷')[:2] == ('督抚疏稿', '不分卷')
    assert split_title('文太史甫田集 □□卷')[:2] == ('文太史甫田集', '□□卷')
    assert split_title('元豐類稿五十卷附錄一卷')[:2] == ('元豐類稿', '五十卷附錄一卷')
    assert split_title('分卷')[0] == '分卷'
