"""生成 政权映射.tsv 的自动初版（块 B 步 2）。映射表是人写的小字典，本脚本只负责：
校验库内 primary_name 都存在、输出 TSV、统计源表各状态的行数。Sasha 复核后把 状态 改 confirmed。

    python3 build_dynasty_map.py --root <book-index> --source 源表/zhwp_中国年号列表.tsv --out 政权映射.tsv
"""
import argparse, collections, json, os, sys

SRC = 'zhwp-中国年号列表'
# 源写法 → 库内 primary_name 列表（多个＝歧义，匹配时靠起年消歧）；空列表＝边疆／无对应
MAP = {
    '西漢': ['西漢'], '新朝及更始': ['新', '玄漢'], '東漢': ['東漢'],
    '曹魏': ['三國魏'], '蜀漢': ['三國蜀'], '孫吳': ['三國吳'],
    '西晉': ['西晉'], '東晉': ['東晉'], '漢趙': ['前趙'], '成漢': ['成漢'],
    '前涼': ['前涼'], '後趙': ['後趙'], '代': ['代'], '前燕': ['前燕'], '前秦': ['前秦'],
    '後秦': ['後秦'], '後燕': ['後燕'], '西燕': ['西燕'], '西秦': ['西秦'],
    '後涼': ['後涼'], '南涼': ['南涼'], '南燕': ['南燕'], '西涼': ['西涼'],
    '夏': ['胡夏'], '北燕': ['北燕'], '北涼': ['北涼'],
    '宋': ['南朝宋'], '齊': ['南朝齊'], '梁': ['南朝梁', '西梁'], '陳': ['南朝陳'],
    '北魏': ['北魏'], '東魏': ['東魏'], '西魏': ['西魏'], '北齊': ['北齊'], '北周': ['北周'],
    '隋朝': ['隋'], '唐朝': ['唐', '武周'],
    '後梁': ['後梁'], '後唐': ['後唐'], '後晉': ['後晉'], '後漢': ['後漢'], '後周': ['後周'],
    '吳': ['楊吳'], '南唐': ['南唐'], '吳越': ['吳越'], '楚': ['馬楚'], '閩': ['閩'],
    '南漢': ['南漢'], '前蜀': ['前蜀'], '後蜀': ['後蜀'], '荊南': ['南平'], '北漢': ['北漢'],
    '北宋': ['北宋'], '南宋': ['南宋'], '遼朝': ['遼', '北遼'], '西遼': ['西遼'], '西夏': ['西夏'],
    '金朝': ['金', '後金'], '元朝': ['元', '北元'], '明朝': ['明'], '南明': ['南明'], '清朝': ['清'],
    # 边疆／域外：不计入主清单严重度，单列交块 C（总计划 §七、分块-A §七）
    '高句麗': [], '柔然': [], '高昌': [], '吐蕃': [], '于闐': [],
    '渤海以及東丹和定安': [], '南詔及大理': [],
}
# 同名异政权（Sasha 复核 ①）：源写法在别的来源里还可能指库内另一政权，追加为候选，匹配时靠起年消歧
EXTRA = {'楚': ['桓楚'], '齊': ['偽齊']}
# 库内无对应政权，保持不映射（避免误配进南朝／五代政权造成假「起讫分歧」）
NOT_IN_LIB = {'夏': '大夏（明玉珍）', '吳': '張吳（張士誠）', '陳': '大漢（陳友諒，库内有「大漢」但非陳）', '楚': '張邦昌大楚', '齊': '黃巢大齊'}
# DILA 朝代名（去方括号别称后）→ 库内 primary_name
SRC_DILA = 'dila-time'
MAP_DILA = {
    '西漢': ['西漢'], '東漢': ['東漢'], '新': ['新'], '曹魏': ['三國魏'], '蜀漢': ['三國蜀'], '孫吳': ['三國吳'],
    '西晉': ['西晉'], '東晉': ['東晉'], '成漢': ['成漢'], '前涼': ['前涼'], '前趙': ['前趙'], '後趙': ['後趙'],
    '前燕': ['前燕'], '前秦': ['前秦'], '後秦': ['後秦'], '後燕': ['後燕'], '西秦': ['西秦'], '後涼': ['後涼'],
    '南涼': ['南涼'], '南燕': ['南燕'], '西涼': ['西涼'], '胡夏': ['胡夏'], '北燕': ['北燕'], '北涼': ['北涼'],
    '劉宋': ['南朝宋'], '南齊': ['南朝齊'], '南梁': ['南朝梁', '西梁'], '陳': ['南朝陳'],
    '北魏': ['北魏'], '東魏': ['東魏'], '西魏': ['西魏'], '北齊': ['北齊'], '北周': ['北周'], '隋': ['隋'],
    '唐': ['唐'], '武周': ['武周'], '後梁': ['後梁'], '後唐': ['後唐'], '後晉': ['後晉'], '後漢': ['後漢'], '後周': ['後周'],
    '北宋': ['北宋'], '南宋': ['南宋'], '遼': ['遼', '北遼'], '西夏': ['西夏'], '金': ['金'], '後金': ['後金'],
    '元': ['元', '北元'], '明': ['明'], '清': ['清'],
}
BORDER = {'高句麗', '柔然', '高昌', '吐蕃', '于闐', '渤海以及東丹和定安', '南詔及大理'}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', required=True)
    ap.add_argument('--source', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    D = {}
    for dp, _, fs in os.walk(os.path.join(a.root, 'Entity')):
        for f in fs:
            if f.endswith('.json'):
                d = json.load(open(os.path.join(dp, f), encoding='utf-8'))
                if d.get('subtype') == 'dynasty' and not d.get('promoted_to') and not d.get('_promoted_to'):
                    D.setdefault(d['primary_name'], []).append(d['id'])
    cnt = collections.Counter()
    for l in open(a.source, encoding='utf-8'):
        if l.startswith('#') or l.startswith('来源\t'):
            continue
        p = l.rstrip('\n').split('\t')
        cnt[p[3]] += 1
    bad = [n for v in list(MAP.values()) + list(EXTRA.values()) + list(MAP_DILA.values()) for n in v if len(D.get(n, [])) != 1]
    if bad:
        sys.exit('库内 primary_name 不存在或不唯一: %s' % bad)
    unmapped = sorted(s for s in cnt if s not in MAP)
    rows = []
    for s in sorted(MAP):
        if s in BORDER:
            rows.append((SRC, s, '', '', '边疆'))
        for n in MAP[s] + EXTRA.get(s, []):
            rows.append((SRC, s, D[n][0], n, 'auto'))
    for s in sorted(MAP_DILA):
        for n in MAP_DILA[s]:
            rows.append((SRC_DILA, s, D[n][0], n, 'auto'))
    with open(a.out, 'w', encoding='utf-8') as f:
        f.write('# 政权映射：源写法→库内政权；多行＝歧义，匹配靠起年消歧。auto＝待 Sasha 复核。库根=%s\n' % a.root)
        f.write('# 同名异政权库无对应（不映射，勿并入南朝／五代）：%s\n' % '；'.join('%s→%s' % kv for kv in sorted(NOT_IN_LIB.items())))
        f.write('来源\t朝代(源写法)\t库内dynasty_id\t库内primary_name\t状态\n')
        for r in rows:
            f.write('\t'.join(r) + '\n')
    tot = sum(cnt.values())
    border = sum(c for s, c in cnt.items() if s in BORDER)
    mapped = sum(c for s, c in cnt.items() if s in MAP and s not in BORDER)
    print('源表行 %d：映射到库内政权 %d；边疆 %d；无法映射 %d（%s）' % (
        tot, mapped, border, tot - mapped - border, unmapped))


if __name__ == '__main__':
    main()
