"""块 D 步 2：题名／责任者归一（合并 D2 国图、D3 国書、N 的 NDL 三套）。

折叠顺序固定（设计 §三）：
  ①NFKC＋去括注 ②日文新字体表 data/jp_variants.tsv（364 条 N1＋7 条 R1-A4）→OpenCC t2s→EXTRA 兜底
  ③scripts/data/match_variants.json（4,355 条等价类）——只在**不改变②已有结果**时叠加；
    与②冲突的字对（②对该字有结果、③会改成别的）取更保守者＝保留②，并记入 CONFLICTS。
不用 朝代年号录入/scripts/guji_norm.py 的 NORMALIZE（Sasha：只管年号／朝代名，不用于题名）。
纯函数，无 IO（表在 import 时读一次）。
"""
import json
import os
import re
import unicodedata

import opencc

HERE = os.path.dirname(os.path.abspath(__file__))
_t2s = opencc.OpenCC('t2s')


def _load_jp():
    t = {}
    for line in open(os.path.join(HERE, 'data', 'jp_variants.tsv'), encoding='utf-8'):
        line = line.rstrip('\n')
        if not line or line.startswith('#') or line.startswith('jp\t'):
            continue
        a, b = line.split('\t')[:2]
        t[a] = b
    t['遥'] = '遙'  # N1 人工订正：源表方向反（见 jp_variants.tsv 头注）
    return str.maketrans(t)


# jp_variants 里「键本身是中文里的另一个字」的条目，对中文来源会并错字，中文模式剔除；
# 沪→濾 是源表错误（沪＝滬简化字），两种模式都剔除。
_JP_CN_EXCLUDE = {'連', '余', '予', '欠', '缶', '醋', '煙'}
_JP_ALWAYS_EXCLUDE = {'沪'}


def _filter(t, drop):
    return {k: v for k, v in t.items() if chr(k) not in drop}


_JP = _load_jp()
_JP_CN = str.maketrans(_filter(_JP, _JP_CN_EXCLUDE | _JP_ALWAYS_EXCLUDE))
_JP = str.maketrans(_filter(_JP, _JP_ALWAYS_EXCLUDE))
# 兜底：jp_variants 未收、或 t2s 之后仍不一致的常见异体（D3 版；D2 里会误伤的几项已去）
EXTRA = str.maketrans({'嶋': '岛', '嶌': '岛', '島': '岛', '浄': '净', '淨': '净', '塩': '盐', '鹽': '盐', '㪽': '',
                       '〔': '', '〕': '', '彜': '彝', '彞': '彝', '峯': '峰', '瑯': '琅', '煕': '熙', '熈': '熙', '巻': '卷', '弁': '辨',
                       '辯': '辨', '辧': '辨', '寚': '宝', '眞': '真', '舘': '馆', '館': '馆', '敎': '教', '㕘': '参', '隷': '隶',
                       # A7（10-26）：国图无档里同作者近题的高频异写；槁在书名里几乎都作稿（雜槁、遺槁）
                       '畧': '略', '藳': '稿', '槁': '稿', '渖': '沈', '盫': '盦', '朢': '望'})
# 内閣文庫专用异体折叠（沿旧 match_naikaku.py 的 VAR）；只在 enable_naikaku_fold() 后生效，
# 不改国图／国書／NDL 的既有匹配与指纹。
_NAIKAKU_FOLD = str.maketrans({'兪': '俞', '喩': '喻', '纉': '缵', '褘': '祎', '袆': '祎', '淩': '凌'})
_naikaku_on = False


def enable_naikaku_fold(on=True):
    global _naikaku_on
    _naikaku_on = on


def _base(s, jp=True):
    r = _t2s.convert(s.translate(_JP if jp else _JP_CN)).translate(EXTRA)
    return r.translate(_NAIKAKU_FOLD) if _naikaku_on else r


def _load_mv():
    # 查找顺序：环境变量 MATCH_VARIANTS → 本目录 data/（迁移后随工具走）→ 旧位置 overview/scripts/data/
    for p in (os.environ.get('MATCH_VARIANTS'), os.path.join(HERE, 'data', 'match_variants.json'),
              os.path.normpath(os.path.join(HERE, '..', '..', 'data', 'match_variants.json'))):
        if p and os.path.exists(p):
            return json.load(open(p, encoding='utf-8'))
    if os.environ.get('MATCH_VARIANTS'):
        raise FileNotFoundError(os.environ['MATCH_VARIANTS'])
    return {}


# ③里语义上并非同字异写、并字会造成假等价的条目：保守不合并（设计 §七 最可能出错的一处）。
# 理由：集≠輯（文集／文輯；国图 4,060 个串受影响）；連≠聯；銷≠消；瓣≠辨；餘≠余（姓）；禎≠楨（朱國楨／朱國禎须 Entity 别名才能确认）。
REJECT = {'集': '集≠輯', '连': '連≠聯', '销': '銷≠消', '瓣': '瓣≠辨', '馀': '餘≠余', '祯': '禎≠楨', '辩': '辯≠辨（Sasha：不同字，人名地名里区分）'}


def _build_layer3():
    """返回 (可安全叠加的字表, 冲突字对列表)。冲突＝③会改变②对该字已有的结果。"""
    safe, conflicts = {}, []
    for k, v in _load_mv().items():
        if len(k) != 1 or len(v) != 1 or k == v:
            continue
        bk, bv = _base(k), _base(v)
        if k in REJECT:
            conflicts.append((k, v, bk, bv))
            continue
        if bk == bv:
            continue                      # ②已把两者折到同一键，③冗余
        if bk != k:
            conflicts.append((k, v, bk, bv))   # ②对 k 已有结果且与 v 的结果不同：保守不合并
        else:
            safe[k] = v                   # ②对 k 无结果：叠加 k→v
    return str.maketrans(safe), conflicts


_L3, CONFLICTS = _build_layer3()


def fold(s, jp=True):
    """先 ② 折到简体键，再叠 ③，再 ② 收尾（保证繁／简写法落到同一键，如 辯／辩→辨）。
    jp=True（默认，国書／NDL 用，沿 D3）含日文新字体表；jp=False（国图等中文来源）剔除
    jp_variants 里 連→聯、余→餘、予→豫 这类「键是中文另一个字」的折叠（见 test_cn_mode）。"""
    return _base(_base(s, jp).translate(_L3), jp)


BRACKET = re.compile(r'[\[\(（［【〔][^\]\)）］】〕]*[\]\)）］】〕]')
PUNCT = re.compile(r'[\s　·・,，.。、;；:：!！?？"\'“”‘’「」『』《》〈〉\-－—_/／\\|*＊]+')
JUAN = re.compile(r'[〇零一二三四五六七八九十百千廿卅\d]+[卷巻]')


def norm_text(s, jp=True):
    if not s:
        return ''
    s = unicodedata.normalize('NFKC', str(s))
    s = BRACKET.sub('', s)
    return PUNCT.sub('', fold(s, jp))


def norm_title(s, jp=True):
    s = unicodedata.normalize('NFKC', str(s or ''))
    s = BRACKET.sub('', s)
    s = JUAN.sub('', s)
    return PUNCT.sub('', fold(s, jp))


ROLE = re.compile(r'(?:彙編|汇编|匯編|[撰著編编輯辑注註释釋校纂述譔選选訂订評评補补箋笺疏傳传伝畫画書书等修譯译増增刻刊錄录抄鈔钞集者訳解点訓定次刪删]|奉敕|奉勅|同撰|共撰|原著)+$')
ROLE_ONLY = re.compile(r'^(?:[撰著編编輯辑注註释釋校纂述譔選选訂订評评補补箋笺疏傳传伝畫画書书等修譯译増增刻刊錄录抄鈔钞集者訳解点訓定次刪删序跋跋絵蔵/]|奉敕|奉勅|重修|重撰|［.］|\[.\])+$')
# 中文 Work／国图侧责任方式词：D2 原表＋少量安全扩展（増訳刪删、重修重撰、原著、奉敕）。
# 不含 点／訓／解／次／定：它们是国書日文役割词（訓点），但会吃掉中文人名末字（王士點→王士）。
ROLE_C = re.compile(r'(?:彙編|汇编|匯編|[撰著編编輯辑注註释釋校纂述譔選选訂订評评補补箋笺疏傳传伝畫画書书等修譯译増增刻刊錄录抄鈔钞集者訳刪删]|奉敕|奉勅|同撰|共撰|原著)+$')
SECONDARY = re.compile(r'校|訓|点|刊|写|書写|跋|序|画|絵|刻|蔵|印|版')   # 非主责任者的役割


def _tok_name(t):
    t = re.sub(r'[（(][^）)]*[）)]', '', t)
    split_name = '／' in t or '/' in t        # 「蔡／元定」式：姓名已与役割分词，末字不是役割词（元定≠元＋定）
    t = t.replace('／', '').replace('/', '')
    q = (ROLE_C if split_name else ROLE).sub('', t)   # 「姓／名」式只剥中文役割词，与 Work 侧 norm_author 对称（国書役割词 定／点／訓 不剥：蔡元定）
    t = q if len(q) >= 2 else t
    return PUNCT.sub('', fold(unicodedata.normalize('NFKC', t)))


def parse_kokusho_author(s, primary_only=False):
    """国書责任者串 → (名字集合, 朝代标注或None)。
    例：「朱／熹 撰」→{朱熹}；「（魏）／何／晏 集解」→{何晏}，朝代「魏」。"""
    if not s:
        return set(), None
    s = unicodedata.normalize('NFKC', str(s))
    era = None
    m = re.match(r'^[\s]*[（(]([^）)]{1,4})[）)][\s/]*', s)
    if m:
        era = m.group(1)
        s = s[m.end():]
    names = set()
    for g in re.findall(r'[（(]([^）)]*)[）)]', s):
        g2 = g.replace('/', '').strip()
        if '/' in g and re.fullmatch(r'[㐀-鿿々〇]{2,6}', g2):
            names.add(_tok_name(g2))
    base = re.sub(r'[（(][^）)]*[）)]', ' ', s)
    cur = []
    for t in re.split(r'\s+', base.strip()):
        if not t or t == '/':
            continue
        if ROLE_ONLY.match(t):
            if primary_only and SECONDARY.search(t) and cur:
                cur.pop()
            continue
        if re.search(r'[㐀-鿿]', t):
            cur.append(t)
    for t in cur:
        n = _tok_name(t)
        if n:
            names.add(n)
    return {n for n in names if n}, era


# 朝代标注（方括号内）——D2 的显式列表。D3 版用「开头任意 ≤4 字方括号」会把「[王仁俊]編」误当朝代吃掉，不沿用。
_ERA_BRACKET = re.compile(
    r'[\[［【〔]\s*(?:周|秦|漢|汉|魏|蜀|吳|吴|晉|晋|宋|齊|齐|梁|陳|陈|隋|唐|五代|十六國|十六国|遼|辽|金|元|明|清|民國|民国|日本|朝鮮|朝鲜|高麗|高丽|'
    r'[東西南北前後后]?[漢汉魏晉晋宋齊齐梁陳陈周秦趙赵燕涼凉]|南朝[宋齊梁陳]|劉宋|刘宋)\s*[\]］】〕]')


def norm_author(s, jp=True):
    """book-index 侧／国图 Work.authors[].name 归一：去 [朝代] 标注与圆括号注，取主名，去责任方式词。"""
    if not s:
        return ''
    s = unicodedata.normalize('NFKC', str(s))
    s = _ERA_BRACKET.sub(' ', s)
    s = re.sub(r'[\[\]［］【】〔〕]', '', s)          # 其余方括号表示「推定著者」，去括号留内容
    s = re.sub(r'[\(（][^\)）]*[\)）]', ' ', s)         # 圆括号内是朝代／别称，整体去掉
    s = fold(s, jp)
    out = []
    for p in re.split(r'[;；,，、/／@\s]+|\band\b', s):
        p = re.sub(r'^[題题]', '', p.strip())
        q = ROLE_C.sub('', p)
        p = q if len(q) >= 2 else p
        if len(p) > 3 and p[0] in '釋释':
            p = p[1:]
        p = PUNCT.sub('', p)
        if p:
            out.append(p)
    return '|'.join(out)
