"""自志書著錄語取撰人名。

體例：「《書名》卷數 〔朝代〕〔官職〕人名+役」。書名與卷數先剔，餘者方是撰人語。
不剔則《韓詩外傳》之「傳」、《風俗通義》之「義」皆被當作役字，題名末字誤作人名。
"""
import re

# 役字只取確為著錄體例者。「定」「續」「說」「解」之屬太弱——
# 《喪服後定》之「定」是題名之末字，非役字。
ROLE = (r'(?:撰|注|集注|集解|解詁|箋注|箋|述|訓|音義|義疏|疏|章句|編|輯|校|譔)')
NUM = r'[一二三四五六七八九十百千零〇兩0-9]+'
_PAT = re.compile(rf'([一-鿿]{{2,5}})\s*({ROLE})(?![一-鿿])')
_DYN = re.compile(r'^(後漢|東漢|西漢|三國魏|南朝宋|西晉|東晉|北魏|後魏|東魏|西魏|北齊|北周|'
                  r'前秦|後秦|後梁|後唐|後晉|後周|五代|國朝|皇朝|本朝|'
                  r'漢|魏|蜀|吳|晉|宋|齊|梁|陳|周|隋|唐|遼|金|元|明|清|秦)')
# 尊稱、字號之屬，非另一人
HONORIFIC = {'曹大家': '班昭', '大家': '班昭', '鄭元': '鄭玄', '鄭氏': '鄭玄',
             '康成': '鄭玄', '衛宏': '衛敬仲', '劉熈': '劉熙', '郭氏': '郭憲'}
STOP = {'不知', '未詳', '闕名', '失名', '無名', '亡名', '不著', '原本', '舊本', '今本',
        '其書', '此書', '本書', '是書', '後人', '時人', '門人', '弟子', '諸儒',
        '群儒', '史官', '國史', '有司', '奉敕', '奉勅', '不詳', '無撰'}


def cut_appendix(ti):
    """截去「梁有…亡」之附記——所記為他書，非本條之撰人。"""
    if not ti:
        return ti
    for k in ('梁有', '梁又有'):
        i = ti.find(k)
        if i >= 0:
            return ti[:i]
    return ti


def strip_title(ti, title, alts=()):
    """剔書名與卷數，餘者方可求撰人。"""
    if not ti:
        return ''
    s = re.sub(r'《[^》]*》', '｜', cut_appendix(ti))
    for t in ([title] + list(alts)):
        if t and len(t) >= 2:
            s = s.replace(t, '｜')
    s = re.sub(rf'{NUM}\s*(?:卷|篇|冊|帙|首|通|部|門|類)', '｜', s)
    return s


def names_in(ti, title, alts=()):
    """返回候選撰人名之集。一名兼收全形與去官職之尾 2、3 字，寧寬勿誤判。"""
    s = strip_title(ti, title, alts)
    out = set()
    for m in _PAT.finditer(s):
        n = m.group(1)
        n2 = _DYN.sub('', n)      # 去朝代冠首；去盡則非人名之形，仍取原捕
        n = n2 if len(n2) >= 2 else n
        if n in STOP or any(c in n for c in '卷篇書｜（）()'):
            continue
        out.add(n)
        for k in (2, 3):                 # 去官職冠首（如「太子文學劉楨」）
            if len(n) > k:
                out.add(n[-k:])
    return out


# ── 三道免誤判之閘 ──────────────────────────────────────────
# 一、本條 authors 之名先剔——一節可以既書撰人又書注者（「張衡二京賦二卷傳巽注」），
#     整節放過則注者漏網，故不放節而剔名
# 二、異體字先歸一（說／説、眾／衆…），否則題名剔不淨
# 三、所取之名與役字合成之語，若為題名之省稱（作子序列比），是題名不是撰人
# 四、撰人語必起於句首或界隔之後——「古文論語注」之「文論語注」上承一「古」字，
#     是題名之殘非撰人之名
# 五、人名與題名不共二字連文——「古文論語」與《論語訓說》共「論語」，是題名不是人
VARIANT = str.maketrans({
    '説': '說', '衆': '眾', '眞': '真', '竝': '並', '内': '內', '爲': '為',
    '溫': '温', '羣': '群', '畧': '略', '徧': '遍', '牀': '床', '册': '冊',
    '况': '況', '凉': '涼', '决': '決', '万': '萬', '与': '與', '尔': '爾',
    '弃': '棄', '峯': '峰', '嶽': '岳', '喫': '吃', '搨': '拓', '菴': '庵',
    '楊': '揚',    # 揚雄／楊雄，志書兩寫
    '鹹': '咸',    # 繁化過度之誤（咸→鹹）
    '裏': '裡', '衆': '眾',
})


def norm(s):
    return (s or '').translate(VARIANT)


def is_subseq(small, big):
    it = iter(big)
    return all(c in it for c in small)


# 異說之語：其後所稱非本志所定之撰人
HEARSAY = ('或云', '或曰', '或作', '一云', '一曰', '疑', '世傳', '相承', '舊題',
           '舊稱', '未詳', '不知', '案', '按')
# 附記亡書之語：「梁有《毛詩》十卷，馬融注，亡」——馬融非本條之撰人
APPENDIX = ('梁有', '梁又有', '又有', '亡', '闕', '今亡', '已亡')
DELIM = set('｜（）()〔〕[]、，,。;；:：　 《》「」『』/·•\t\n')


def conflicting_names(title_info, title, alts=(), authors=()):
    """返回與題名、本條撰人俱無關之他人名；無者返空集。"""
    raw = norm(title_info)
    t = norm(title)
    alts = [norm(a) for a in alts if a]
    s = strip_title(raw, t, alts)
    for a in sorted({norm(x) for x in authors if x}, key=len, reverse=True):
        s = s.replace(a, '｜')          # 閘一：本條撰人先剔
    out = set()
    for m in _PAT.finditer(s):
        if m.start() > 0 and s[m.start() - 1] not in DELIM:
            continue                     # 閘四：撰人語必起於句首或界隔之後
        if any(k in s[max(0, m.start() - 6):m.start()] for k in HEARSAY):
            continue                     # 閘七：或云、舊題之屬是異說非著錄
        span = m.group(0).strip()
        n = m.group(1)
        n2 = _DYN.sub('', n)      # 去朝代冠首；去盡則非人名之形，仍取原捕
        n = n2 if len(n2) >= 2 else n
        if n in STOP or any(c in n for c in '卷篇書｜（）()'):
            continue
        # 閘三：所取之語是題名之省稱
        if any(span in x or is_subseq(span, x) for x in [t] + alts if x):
            continue
        if _shares_run(n, [t] + alts):
            continue                     # 閘五
        role = m.group(2)
        out.add((n, role))
        for k in (2, 3):
            if len(n) > k and not _shares_run(n[-k:], [t] + alts):
                out.add((n[-k:], role))
    return out


# 題名自言其為注本者
ZHU_MARK = ('注', '箋', '疏', '章句', '集解', '解詁', '音義', '訓', '正義', '傳')


def is_commentary(title, original_title=None):
    return bool(original_title) or any(k in (title or '') for k in ZHU_MARK)


def _shares_run(name, titles, k=2):
    """名與題名有 k 字以上連文者，是題名之殘。"""
    runs = {name[i:i + k] for i in range(len(name) - k + 1)}
    return any(t and any(r in t for r in runs) for t in titles)


def node_conflicts(title_info, title, authors, alts=(), commentary=False):
    """節之撰人與本條 authors 相牴否。"""
    auth = {norm(a) for a in authors if a}
    if not auth:
        return None
    # 閘八：著錄之主體以撰人定。節既書本條撰人，其節即屬本條——
    #      所連之注者是附記（隋志「《神異經》一卷東方朔撰，張華注」），
    #      非另一書之著錄。真當拆者，其節無撰人而唯有注者
    #      （舊唐志「又四十卷酈道元注」）。
    body = norm(cut_appendix(title_info))
    if any(a in body for a in auth):
        return None
    pairs = conflicting_names(title_info, title, alts, auth)
    # 閘六：注本之著錄節書原典撰人，是體例非相牴
    #      （隋志「《孟子》十四卷孟軻撰，趙岐注」繫於《孟子趙岐注》正合）
    if commentary:
        pairs = {(n, r) for n, r in pairs if r != '撰'}
    ns = {n for n, _ in pairs}
    if not ns:
        return None
    if ns & auth or any(any(a in n or n in a for a in auth) for n in ns):
        return None
    return sorted(ns)
