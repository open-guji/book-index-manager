"""recon_reign 金标测试：手造小库＋小源表，断言每类差异的正例与反例。
    python3 scripts/tests/run_tests.py          # 全过退出 0
    python3 scripts/tests/run_tests.py --break  # 故意改错一个期望，应变红（证明测试有牙）
"""
import json, os, sys, tempfile, types
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
import recon_reign as rr

def dyn(i, n, s, e): return {'id': i, 'subtype': 'dynasty', 'primary_name': n, 'dates': {'start': s, 'end': e}}
def rei(i, n, d, ruler, s, e, alt=()):
    r = {'id': i, 'subtype': 'reign', 'primary_name': n, 'dynasty_id': d, 'ruler': {'name': ruler}, 'dates': {'start': s, 'end': e}}
    if alt: r['alt_names'] = [{'name': a, 'type': '異體'} for a in alt]
    return r

LIB = [dyn('D1', '北宋', 960, 1127), dyn('D2', '南宋', 1127, 1279), dyn('D3', '三國吳', 222, 280), dyn('D4', '前涼', 317, 376),
       rei('R01', '建隆', 'D1', '趙匡胤', 960, 963),            # 完全一致
       rei('R02', '乾德', 'D1', '趙匡胤', 963, 968),            # 止年分歧（源 967）
       rei('R03', '開寶', 'D1', '趙匡胤', 968, 976),            # 源写简体 → 异体(低)
       rei('R04', '太平', 'D3', '孫亮', 256, 258),              # 重名 A
       rei('R05', '太平', 'D1', '趙炅', 976, 984),              # 重名 B（北宋太平興國省文）：源只有一行
       rei('R06', '咸淳', 'D2', '趙禥', 1265, 1274),            # 咸 不被 opencc 吃掉
       rei('R07', '孤條', 'D4', '張某', 330, 340),              # 库有源无
       rei('R08', '歸屬', 'D1', '趙某', 1000, 1005),            # 源政权为南宋 → 归属
       rei('R09', '龍啟', 'D1', '某甲', 1010, 1012, alt=('龍啓',)),  # 源写龙启 → 异体
       rei('R10', '止缺', 'D1', '趙某', 1020, 1025)]            # 源止年空 → 不进分歧
SRC = ['#fixture', '来源\t源内键\t年号\t朝代(源写法)\t帝王(源写法)\t起\t止\t备注',
       'S\ta1\t建隆\t北宋\t宋太祖 趙匡胤\t960\t963\t',
       'S\ta2\t乾德\t北宋\t宋太祖 趙匡胤\t963\t967\t',
       'S\ta3\t开宝\t北宋\t宋太祖 趙匡胤\t968\t976\t',
       'S\ta4\t太平\t孫吳\t吳廢帝 孫亮\t256\t258\t',
       'S\ta5\t咸淳\t南宋\t宋度宗 趙禥\t1265\t1274\t',
       'S\ta6\t歸屬\t南宋\t趙某\t1000\t1005\t',
       'S\ta7\t龙启\t北宋\t某甲\t1010\t1012\t',
       'S\ta8\t止缺\t北宋\t趙某\t1020\t\t',
       'S\ta9\t新增\t北宋\t趙某\t1030\t1031\t',            # 源有库无
       'S\tb1\t某蕃\t南詔及大理\t某\t800\t810\t']           # 边疆缺条
MAP = ['来源\t朝代(源写法)\t库内dynasty_id\t库内primary_name\t状态',
       'S\t北宋\tD1\t北宋\tauto', 'S\t南宋\tD2\t南宋\tauto', 'S\t孫吳\tD3\t三國吳\tauto', 'S\t南詔及大理\t\t\t边疆']

def build(tmp):
    root = os.path.join(tmp, 'lib', 'Entity', 'x'); os.makedirs(root)
    for d in LIB: json.dump(d, open(os.path.join(root, d['id'] + '.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    os.makedirs(os.path.join(tmp, 'src'))
    open(os.path.join(tmp, 'src', 'S.tsv'), 'w', encoding='utf-8').write('\n'.join(SRC) + '\n')
    open(os.path.join(tmp, 'map.tsv'), 'w', encoding='utf-8').write('\n'.join(MAP) + '\n')
    return types.SimpleNamespace(root=os.path.join(tmp, 'lib'), sources=os.path.join(tmp, 'src'), map=os.path.join(tmp, 'map.tsv'))

def _dila_ok():
    mk = lambda n, d, e, a, b: {'年号': n, '朝代': d, '帝王': e, '起': a, '止': b}
    rows = [mk('嘉祐', '北宋', '仁宗', 1056, 1063), mk('嘉祐', '北宋', '英宗', 1063, 1064),
            mk('承明', '北魏[元魏;後魏]', '孝文帝', 476, 477), mk('大化', '飛鳥時代', '孝德', 645, 650), mk('大和', '唐', '文宗', 827, 836), mk('大和', '北魏', '某', 500, 510)]
    o = rr.prep_dila(rows)
    return len(o) == 4 and o[2]['年号'] == '太和' and o[3]['年号'] == '大和' and o[0]['止'] == 1064 and o[0]['帝王'] == '仁宗→英宗' and o[1]['朝代'] == '北魏'


def main():
    brk = '--break' in sys.argv
    with tempfile.TemporaryDirectory() as tmp:
        a = build(tmp)
        D, R, rows, files, res, diffs, detail, cons, ok = rr.run(a)
    by = {}
    for d in diffs: by.setdefault((d[0], d[1]), d)
    has = lambda cat, lid: (cat, lid) in by
    sev = lambda cat, lid: by[(cat, lid)][5]
    T = [
        ('守恒', ok),
        ('R01 完全一致：无任何差异', not any(d[1] == 'R01' for d in diffs)),
        ('R02 止年分歧 正例', has('起讫分歧', 'R02')),
        ('prep_dila 跨帝合并＋去别称＋跳日韩', _dila_ok()),
        ('R01 起讫分歧 反例', not has('起讫分歧', 'R01')),
        ('R10 止年空不进分歧 反例', not has('起讫分歧', 'R10')),
        ('R03 简体异体(低) 正例', has('异体', 'R03') and sev('异体', 'R03') == '低'),
        ('R09 龙启：简体写法差异(低)', has('异体', 'R09') and sev('异体', 'R09') == '低'),
        ('R06 咸淳 完全匹配，无异体', not has('异体', 'R06')),
        ('R08 归属 正例（政权不符）', has('归属', 'R08')),
        ('R04 归属 反例（政权相符）', not has('归属', 'R04')),
        ('R07 库有源无 正例', has('缺条', 'R07')),
        ('R01 库有源无 反例', not has('缺条', 'R01')),
        ('源有库无：新增', any(d[0] == '单源待裁' and d[1] == '' and '新增' in d[3] for d in diffs)),
        ('边疆缺条为低', any(d[0] == '缺条' and '某蕃' in d[3] and d[5] == '低' for d in diffs)),
        ('重名：太平 库 2 条／源 1 行 → 悬空 R05', any(d[0] == '重名' and 'R05' in d[4] for d in diffs)),
        ('R01 重名 反例', not any(d[0] == '重名' and 'R01' in d[1] for d in diffs)),
        ('R05 配对未被 R04 抢占', 'R04' in {p['lib']['id'] for p in res['S'][0]} and 'R05' not in {p['lib']['id'] for p in res['S'][0]}),
    ]
    if brk:
        T[2] = ('（故意写错）R02 不应有分歧', not has('起讫分歧', 'R02'))
    bad = 0
    for name, passed in T:
        print(('PASS ' if passed else 'FAIL ') + name)
        bad += not passed
    print('cases', len(T), 'fail', bad)
    sys.exit(1 if bad else 0)

main()
