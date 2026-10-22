"""reign_year 逻辑测试（用手造小键表；这只测代码逻辑，不是金标——金标在 测试集/纪年换算.tsv，依据由人给）。"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import reign_year as ry

def d(i, n, p=None): return {'id': i, 'subtype': 'dynasty', 'primary_name': n, 'via': 'primary_name', **({'parent_id': p} if p else {})}
def r(i, n, dy, dn, s, e): return {'id': i, 'subtype': 'reign', 'primary_name': n, 'via': 'primary_name', 'dynasty_id': dy, 'dynasty': dn, 'start': s, 'end': e}
DOC = {'normalize': {'淸': '清'}, 'keys': {
    '宋': [d('S', '宋')], '北宋': [d('N', '北宋', 'S')], '明': [d('M', '明')],
    '太平': [r('R1', '太平', 'N', '北宋', 976, 984), r('R2', '太平', 'W', '孫吳', 256, 258)],
    '孫吳': [d('W', '孫吳')],
    '前元': [r('Q', '前元', 'H', '西漢', -1, 3)], '西漢': [d('H', '西漢')],
    '清': [d('C', '清')], '順治': [r('SZ', '順治', 'C', '清', 1644, 1661)]}}
DOC2 = {'keys': {'甲': [r('A', '甲', 'X', '某', 100, 102)], '乙': [r('B', '乙', 'X', '某', 102, 105)]}}
T = [
    ('元=1', ry.parse_n('元'), 1), ('二十一', ry.parse_n('二十一'), 21), ('廿', ry.parse_n('廿'), 20), ('十', ry.parse_n('十'), 10),
    ('一百零五', ry.parse_n('一百零五'), 105), ('阿拉伯', ry.parse_n('12年'), 12),
    ('公元后', ry.to_ad(1573, 10), 1582), ('前1年元年', ry.to_ad(-1, 1), -1), ('前1 起第2年=公元1', ry.to_ad(-1, 2), 1),
    ('前140 第6年=前135', ry.to_ad(-140, 6), -135),
    ('无提示返回全部', len(ry.lookup(DOC, '太平', 3)), 2),
    ('提示 宋 取北宋（上级）', [x['ad'] for x in ry.lookup(DOC, '太平', 3, '宋')], [978]),
    ('提示 孫吳', [x['ad'] for x in ry.lookup(DOC, '太平', 3, '孫吳')], [258]),
    ('越界标记', [x['in_range'] for x in ry.lookup(DOC, '太平', 10, '宋')], [False]),
    ('改元当年 end 年算在内', [x['in_range'] for x in ry.lookup(DOC, '太平', 9, '宋')], [True]),
    ('不存在年号', ry.lookup(DOC, '不存在', 1), []),
    ('同年改元标记新旧候选', [x['gaiyuan_with'] for x in ry.lookup(DOC2, '甲', 3)], [['B']]),
    ('跨 0 年', [x['ad'] for x in ry.lookup(DOC, '前元', 2)], [1]),
]
fail = 0
for name, got, want in T:
    ok = got == want; fail += not ok
    print(('PASS ' if ok else 'FAIL ') + name, '' if ok else '%r != %r' % (got, want))
print('cases %d fail %d' % (len(T), fail)); sys.exit(1 if fail else 0)
