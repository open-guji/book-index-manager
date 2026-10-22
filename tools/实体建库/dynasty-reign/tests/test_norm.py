import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from guji_norm import norm_name, norm_ruler, norm_dynasty, parse_year

CASES = [
    (norm_name, '义熙', '義熙'), (norm_name, '義熙', '義熙'),
    (norm_name, '咸豐', '咸豐'), (norm_name, '咸丰', '咸豐'),   # 咸不被改成鹹
    (norm_name, '咸雍', '咸雍'), (norm_name, '咸熙', '咸熙'),
    (norm_name, '乾统', '乾統'), (norm_name, '元丰', '元豐'),
    (norm_name, '寿昌', '壽昌'), (norm_name, '龙启', '龍啟'),
    (norm_name, '尙書', '尚書'), (norm_name, '歴', '曆'),
    (norm_name, '太平天国', '太平天國'),
    (norm_name, '', ''), (norm_name, None, ''),
    (norm_name, '建隆', '建隆'),
    (norm_ruler, '汉武帝 劉徹', '劉徹'), (norm_ruler, '清文宗 奕詝', '奕詝'),
    (norm_ruler, '趙秦王 刘曜', '劉曜'), (norm_ruler, '劝利晟', '勸利晟'),
    (norm_ruler, '愛新覺羅福臨', '福臨'), (norm_ruler, '', ''), (norm_ruler, None, ''),
    (norm_ruler, '趙匡胤', '趙匡胤'),
    (norm_dynasty, '唐朝', '唐'), (norm_dynasty, '南詔及大理', '南詔及大理'),
    (norm_dynasty, '清朝', '清'), (norm_dynasty, '朝', '朝'),
    (norm_dynasty, '孙吴', '孫吳'),
]
YEARS = [('-140', -140), ('960', 960), ('', None), ('？', None), ('0', None), (None, None), (' 12 ', 12)]

bad = 0
for f, a, want in CASES:
    got = f(a)
    if got != want:
        bad += 1
        print('FAIL', f.__name__, repr(a), '->', repr(got), 'want', repr(want))
for a, want in YEARS:
    got = parse_year(a)
    if got != want:
        bad += 1
        print('FAIL parse_year', repr(a), '->', got, 'want', want)
print('cases', len(CASES) + len(YEARS), 'fail', bad)
sys.exit(1 if bad else 0)
