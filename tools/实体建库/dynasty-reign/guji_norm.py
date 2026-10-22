"""归一函数库（块 B 步 1；纯函数，无 IO）。块 A 的 denominator.py 与块 F 共用。

两边（库、源）用同一函数归一，归一值作匹配键，原值留给报告和"异体"判定。
规则：NORMALIZE 逐字表（与 dynasty_reign_keys.json 同一份）→ opencc s2t → 例外表。
opencc 的字符级过转换（咸→鹹等）靠 PROTECT 在转换前占位、转换后还原；
上下文相关的词级转换（如"咸丰"）同样被占位挡住。
"""
import re

try:
    import opencc
    _S2T = opencc.OpenCC('s2t')
except ImportError:  # 退路：只用逐字表＋例外表，覆盖变差（见分块-B 设计 §七）
    _S2T = None

# 与 dynasty_reign_keys.json 的 normalize 字段一致，勿单改
NORMALIZE = {'尙': '尚', '郞': '郎', '戸': '戶', '叅': '參', '秘': '祕', '歴': '曆', '淸': '清'}
_NORM_TABLE = str.maketrans(NORMALIZE)

# 这些字 opencc 会改成别字，转换前占位、转换后还原
# 咸：咸豐、咸雍、咸熙…本字即"咸"，opencc 误转"鹹"（含词级"咸丰→鹹豐"）
PROTECT = '咸'
_PH = {c: chr(0xE000 + i) for i, c in enumerate(PROTECT)}
_PH_BACK = {v: k for k, v in _PH.items()}

# 例外表：归一后仍要合并的写法（key→value，两边都过此表）。每条注明理由。
# 步 1 实测（库 book-index 734 条 reign、源 zhwp 1279 行）：归一后库内 552 个不同年号名中 549 个在源表出现。
# 差集（原 5 个，现 3 个）逐个定性，均为真差异或待裁决，不靠例外表硬并：
#   龍啟 / 鹹豐：归一问题，已修（啓→啟 入下表；咸 入 PROTECT）。
#   太平天國：源表无此行（zhwp 该页未收太平天国），属"库有源无"，交 C 裁决。
#   紹武(1646)：源表无此行，同上。
#   永憙(145 東漢)：源有 永嘉(145 汉冲帝)；库以 永熹/永喜 为异体，疑库内误条或异说，交 C 裁决。
EXCEPTIONS = {
    '啓': '啟',  # 異體；库 龍啟，源（经 opencc）龙启→龍啓，两边并入同一键
}

# 氏族前缀（ruler 比对前去除）
CLAN_PREFIX = ('愛新覺羅', '孛兒只斤', '爱新觉罗', '孛儿只斤')


def norm_name(s):
    """年号／朝代名等的匹配键。"""
    if s is None:
        return ''
    s = str(s).strip().translate(_NORM_TABLE)
    s = ''.join(_PH.get(ch, ch) for ch in s)
    if _S2T is not None:
        s = _S2T.convert(s)
    s = ''.join(_PH_BACK.get(ch, ch) for ch in s)
    s = s.translate(_NORM_TABLE)
    for k, v in EXCEPTIONS.items():
        s = s.replace(k, v)
    return s


def norm_dynasty(s):
    """源朝代写法：去"朝"尾后归一。真正的源→库映射走 政权映射.tsv，不靠本函数猜。"""
    s = norm_name(s)
    return s[:-1] if len(s) >= 2 and s.endswith('朝') else s


def norm_ruler(s):
    """帝王人名：取空白分隔的末段（源常写"汉武帝 劉徹""清文宗 奕詝"），去氏族前缀后归一。
    库内 ruler.name 本身就是人名，同样过此函数。"""
    if not s:
        return ''
    s = str(s).strip().split()[-1] if str(s).strip() else ''
    for p in CLAN_PREFIX:
        if s.startswith(p) and len(s) > len(p):
            s = s[len(p):]
    return norm_name(s)


_YEAR = re.compile(r'^-?\d+$')


def parse_year(s):
    """源表起/止：空串＝未知(None)；整数字符串→int；0 年视为非法返回 None（无 0 年）。"""
    s = (s or '').strip()
    if not s or not _YEAR.match(s):
        return None
    v = int(s)
    return None if v == 0 else v
