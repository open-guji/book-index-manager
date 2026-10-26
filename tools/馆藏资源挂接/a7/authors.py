"""国图著者串 → Work.authors[]。只处理国图格式「（清）某某撰」「(明)甲，乙輯」「（清）甲編次   （清）乙編次」。"""
import re
import unicodedata

DYN = {'清': '清', '明': '明', '元': '元', '唐': '唐', '宋': '宋', '金': '金', '遼': '遼', '隋': '隋', '晉': '晉', '漢': '漢',
       '後漢': '東漢', '東漢': '東漢', '西漢': '西漢', '南朝宋': '南朝宋', '南朝梁': '南朝梁', '南朝陳': '南朝陳', '南朝齊': '南朝齊',
       '北魏': '北魏', '北齊': '北齊', '北周': '北周', '五代': '五代', '戰國': '戰國', '春秋': '春秋', '周': '周', '秦': '秦',
       '三國魏': '三國魏', '魏': '三國魏', '吳': '三國吳', '蜀': '三國蜀', '西晉': '西晉', '東晉': '東晉', '南唐': '南唐', '後蜀': '後蜀',
       '民國': '中華民國', '中華民國': '中華民國', '日本': '日本', '朝鮮': '朝鮮', '高麗': '高麗', '北宋': '北宋', '南宋': '南宋',
       '前蜀': '前蜀', '吳越': '吳越', '西夏': '西夏', '梁': '南朝梁', '齊': '南朝齊', '陳': '南朝陳', '後唐': '後唐', '後晉': '後晉',
       '後周': '後周', '後梁': '後梁', '後漢五代': '後漢'}
PERIOD = {'清': 'qing', '明': 'ming', '元': 'liao-jin-yuan', '金': 'liao-jin-yuan', '遼': 'liao-jin-yuan', '西夏': 'liao-jin-yuan',
          '唐': 'sui-tang', '隋': 'sui-tang', '宋': 'song', '北宋': 'song', '南宋': 'song', '中華民國': 'modern',
          '五代': 'five-dynasties', '南唐': 'five-dynasties', '後蜀': 'five-dynasties', '前蜀': 'five-dynasties', '吳越': 'five-dynasties',
          '西漢': 'qin-han', '東漢': 'qin-han', '漢': 'qin-han', '秦': 'qin-han', '晉': 'jin', '西晉': 'jin', '東晉': 'jin',
          '三國魏': 'three-kingdoms', '三國吳': 'three-kingdoms', '三國蜀': 'three-kingdoms',
          '南朝宋': 'nanbeichao', '南朝梁': 'nanbeichao', '南朝陳': 'nanbeichao', '南朝齊': 'nanbeichao', '北魏': 'nanbeichao',
          '北齊': 'nanbeichao', '北周': 'nanbeichao', '戰國': 'pre-qin', '春秋': 'pre-qin', '周': 'pre-qin'}
FOREIGN = re.compile(r'^(美國|英國|法國|德國|俄國|日本國?|意大利|比利時|葡萄牙|西班牙|荷蘭|瑞士|奧國|美|英|法|德|俄)$')
ROLES = ['藏並編', '重輯', '重編', '採錄', '選錄', '填詞', '製曲', '類注', '校注', '編輯', '編次', '編譯', '纂輯', '纂修', '評選', '評點', '述略',
         '集注', '集解', '箋注', '補注', '增訂', '重訂', '校刊', '校訂', '校閱', '參訂', '編纂', '輯錄', '同撰', '奉敕撰', '奉敕編', '奉敕輯',
         '撰', '輯', '編', '纂', '修', '校', '注', '譯', '述', '錄', '選', '評', '訂', '著', '書', '繪', '藏', '奏', '刻', '鈔', '抄', '題', '序', '跋', '等']
ROLE_RE = re.compile('(' + '|'.join(sorted(map(re.escape, ROLES), key=len, reverse=True)) + r')+$')


def parse(raw):
    """→ (authors 列表, 是否有拿不准之处)。拿不准（括号套括号、外文名、无名字）时调用方转人看。"""
    s = unicodedata.normalize('NFKC', raw or '').strip()
    if not s:
        return [], False
    out, unsure, dyn = [], False, None
    for seg in re.split(r'\s{2,}|　+', s):
        seg = seg.strip()
        if not seg:
            continue
        m = re.match(r'^\(([^()]{1,6})\)\s*', seg)
        monk = False
        if m:
            tok = m.group(1)
            if tok.endswith('释') or tok.endswith('釋'):
                monk, tok = True, tok[:-1]
            if FOREIGN.match(tok):
                dyn, unsure = None, True
            elif tok in DYN:
                dyn = DYN[tok]
            else:
                dyn, unsure = None, True
            seg = seg[m.end():]
        role_m = ROLE_RE.search(seg)
        role = role_m.group(0) if role_m else ''
        body = seg[:role_m.start()] if role_m else seg
        if role.startswith('等'):
            role = role[1:]
        parts = [p for p in re.split(r'[，,、；;]', body) if p.strip()]
        for i, p in enumerate(parts):
            p = p.strip()
            sub = re.match(r'^\(([^()]{1,6})\)\s*', p)
            if sub and sub.group(1) in DYN:
                dyn = DYN[sub.group(1)]; p = p[sub.end():]
            etc = p.endswith('等')
            p = p.rstrip('等').strip()
            pr = ROLE_RE.search(p)
            prole = None
            if pr and len(p) - len(pr.group(0)) >= 2:
                prole = pr.group(0); p = p[:pr.start()]
            if re.search(r'[\[\]()（）?？〓□]', p) or not re.fullmatch(r'[㐀-鿿𠀀-𱍊]{2,8}', p):
                unsure = True
                p = re.sub(r'[\[\]]', '', p)
            if not p:
                continue
            if monk and not p.startswith('釋'):
                p = '釋' + p
            r = prole or role or '撰'
            if p.startswith('題') and len(p) >= 3:      # 「題介石逸叟撰」：題署之名
                p, r = p[1:], '題' + r
            if (etc or (i == len(parts) - 1 and role_m and role_m.group(0).startswith('等'))) and not r.startswith('等'):
                r = '等' + r
            a = dict(name=p, role=r)
            if dyn:
                a['dynasty'] = dyn
            if not (prole or role):
                a['role_basis'] = '國圖著錄未標責任方式，暫作撰'
            out.append(a)
    if not out:
        unsure = True
    return out, unsure
