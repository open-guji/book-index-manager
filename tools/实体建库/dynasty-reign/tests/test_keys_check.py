"""keys_check 夹具测试：一个全好的小键表（8 项全 PASS），再各造一个坏的，断言对应项变红。
    python3 scripts/tests/test_keys_check.py
"""
import copy, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import keys_check as kc

def d(i, n, s, e, via='primary_name', **kw):
    c = {'id': i, 'subtype': 'dynasty', 'primary_name': n, 'via': via, 'start': s, 'end': e}; c.update(kw); return c
def r(i, n, dy, dn, s, e, **kw):
    c = {'id': i, 'subtype': 'reign', 'primary_name': n, 'via': 'primary_name', 'dynasty_id': dy, 'dynasty': dn, 'start': s, 'end': e}; c.update(kw); return c

GOOD = {'version': 1, 'count': {'keys': 5, 'dynasty': 2, 'reign': 2}, 'normalize': {'淸': '清'}, 'keys': {
    '明': [d('D1', '明', 1368, 1644)],
    '清': [d('D2', '清', 1644, 1912)],
    '洪武': [r('R1', '洪武', 'D1', '明', 1368, 1398)],
    '太平': [r('R2', '太平', 'D1', '明', 1400, 1401), r('R3', '太平', 'D2', '清', 1700, 1701)],
    '周': [d('D3', '北周', 557, 581, via='簡稱', ambiguous=True), d('D4', '後周', 951, 960, via='簡稱', ambiguous=True)]}}
GOOD['count'] = {'keys': 5, 'dynasty': 4, 'reign': 3}
GOOD['keys']['北周'] = [d('D3', '北周', 557, 581)]; GOOD['keys']['後周'] = [d('D4', '後周', 951, 960)]
GOOD['count']['keys'] = 7
LIB = {'D1': {'subtype': 'dynasty', 'primary_name': '明'}, 'D2': {'subtype': 'dynasty', 'primary_name': '清'},
       'D3': {'subtype': 'dynasty', 'primary_name': '北周', 'alt_names': [{'name': '周', 'type': '簡稱', 'ambiguous': True}]},
       'D4': {'subtype': 'dynasty', 'primary_name': '後周', 'alt_names': [{'name': '周', 'type': '簡稱', 'ambiguous': True}]},
       'R1': {'subtype': 'reign', 'primary_name': '洪武'}, 'R2': {'subtype': 'reign', 'primary_name': '太平'},
       'R3': {'subtype': 'reign', 'primary_name': '太平'}}

def status(doc, lib=LIB, no=None):
    return {x[0]: x[2] for x in kc.check(doc, lib)}

def mut(f):
    x = copy.deepcopy(GOOD); f(x); return x

CASES = [
    ('好键表全 PASS', GOOD, None, 'PASS'),
    ('1 count.keys 不符', mut(lambda x: x['count'].update(keys=99)), 1, 'FAIL'),
    ('1 count.reign 与库不符', mut(lambda x: x['count'].update(reign=9)), 1, 'FAIL'),
    ('2 库内名反查不到', mut(lambda x: x['keys'].pop('洪武')), 2, 'FAIL'),
    ('3 别名 ambiguous 缺', mut(lambda x: x['keys']['周'][0].pop('ambiguous')), 3, 'FAIL'),
    ('4 年号 dynasty_id 悬空', mut(lambda x: x['keys']['洪武'][0].update(dynasty_id='NOPE')), 4, 'FAIL'),
    ('5 start>end', mut(lambda x: x['keys']['洪武'][0].update(start=1500)), 5, 'FAIL'),
    ('5 含 0 年', mut(lambda x: x['keys']['洪武'][0].update(start=0)), 5, 'FAIL'),
    ('6 排序错（年号在朝代前）', mut(lambda x: x['keys']['周'].reverse()), 6, 'FAIL'),
    ('7 同朝代同起年重名', mut(lambda x: x['keys']['太平'].__setitem__(1, r('R3', '太平', 'D1', '明', 1400, 1401))), 7, 'WARN'),
    ('8 含 cbdb 字段', mut(lambda x: x['keys']['明'][0].update(cbdb_id='1')), 8, 'FAIL'),
]

if __name__ == '__main__':
    fail = 0
    for name, doc, no, want in CASES:
        st = status(doc)
        ok = all(v == 'PASS' for v in st.values()) if no is None else (st[no] == want)
        print(('PASS ' if ok else 'FAIL ') + name, '' if ok else st)
        fail += not ok
    # 确定性：两份不同 → 第 6 项红
    st = {x[0]: x[2] for x in kc.check(GOOD, LIB, mut(lambda x: x['keys'].pop('明')))}
    ok = st[6] == 'FAIL'; print(('PASS ' if ok else 'FAIL ') + '6 两次产出不一致'); fail += not ok
    print('cases %d fail %d' % (len(CASES) + 1, fail)); sys.exit(1 if fail else 0)
