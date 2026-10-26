"""C1 日本诸馆第二批六库的公共适配层（A9，2026-10-26）：东大数字档案、东文研善本、書陵部、慶應、立命館 ARC、名大。

原档在 book_index_json `library_data/<馆>.json`（JSON 数组，统一字段 bookName/author/version/url/image_url/holding_id/raw/extra）。
各馆题名、责任者写法不同，本模块给共用的解析：
  * 责任者：括号里是朝代的当朝代、是役割的当役割、其余（字号、子目名、【著者】类标签）丢掉；按空白和 ；、・，切成段，
    段尾粘着的役割词（撰／注／校…）剥下来；朝代或前置（「明 李賢」）或粘连（「唐李嶠」），粘连时名字两种写法都收；
    只留主责任者（撰／注／編…），校／訂／刊／序跋等次要役割只在没有主责任者时补用。
  * 题名：去馆藏号括注、整体括号拆开、按 `. `（慶應合刻）／` ; `（东大册次）切段，第一段为题名，余段＝另一书（合刻→MULTI_TITLE）；
    题名后的卷数用 titleparse.split_title 切；「殘／存」尾缀剥掉并记 LOCAL_PART。
  * 写入单位（unit）：一个藏本。按册著录的馆（东大按 holding_id、書陵部按 parent_id、慶應按题名＋责任者＋版本、ARC 按去分册号的 holding_id）
    同 unit 的记录 group_key 相同，引擎对它们做 GROUP_SPLIT 检查，write_plan 同 Work 同 unit 只写一条。
"""
import json
import os
import re
import unicodedata

from normalize import fold, PUNCT
from titleparse import split_title, parse_juan, multi_title

DYN = sorted({
    '先秦', '周', '秦', '漢', '汉', '前漢', '後漢', '西漢', '東漢', '三國', '魏', '蜀', '吳', '吴', '晉', '晋', '西晉', '東晉',
    '劉宋', '南朝宋', '南齊', '齊', '梁', '陳', '北魏', '北齊', '北周', '隋', '唐', '五代', '後梁', '後唐', '後晉', '後漢', '後周',
    '南唐', '前蜀', '後蜀', '吳越', '宋', '北宋', '南宋', '遼', '金', '元', '明', '清', '淸', '民國', '民国', '朝鮮', '日本', '高麗',
}, key=len, reverse=True)
_DYN_RE = '|'.join(map(re.escape, DYN))
# 役割词（长的在前）。主＝撰著編注一类；次＝校訂刊刻序跋批點書画等
ROLE_PRIMARY = ['奉敕撰', '奉勅撰', '奉敕編', '奉勅編', '奉敕', '奉勅', '撰略例', '注略例', '撰音義', '集解', '正義', '音義', '集註', '集注',
                '纂輯', '纂修', '編輯', '輯次', '輯錄', '輯録', '編纂', '編集', '選註', '箋註', '箋注', '補注', '補註', '直解', '講釈', '仮名講釈',
                '原著', '著述', '索隠', '索隱', '合編', '續證類', '證類', '譯', '訳', '撰', '著', '編', '纂', '輯', '注', '註', '疏', '箋', '述', '選', '學', '集', '輯', '作']
ROLE_SECONDARY = ['校訂', '校勘', '校正', '校刊', '校梓', '編校', '参校', '參校', '叅閲', '參閲', '参閲', '批評', '評點', '批點', '評閲',
                  '筆録', '筆錄', '刊行', '開雕', '重訂', '増補', '增補', '補', '校', '訂', '閲', '閱', '較', '評', '批', '點', '点', '序', '跋',
                  '題', '書', '画', '畫', '繪', '絵', '刊', '刋', '梓', '刻', '鐫', '識', '写', '寫', '鈔', '抄', '録', '錄', '鑑定', '鑒定', '譯述']
ROLES = sorted(set(ROLE_PRIMARY) | set(ROLE_SECONDARY), key=len, reverse=True)
_ROLE_RE = '|'.join(map(re.escape, ROLES))
ROLE_TOKEN = re.compile(r'^(?:(?:' + _ROLE_RE + r')+)$')
ROLE_TAIL = re.compile(r'(?:等)?(?:奉敕|奉勅)?(?:' + _ROLE_RE + r')$')     # 只剥一个役割词：「吳敬梓撰」剥「撰」不剥「梓」
CJK = re.compile(r'[㐀-鿿\U00020000-\U0002ffff]')
BAD_NAMES = {'闕名', '阙名', '不详', '不詳', '佚名', '无名氏', '無名氏', '不著撰人', '作者不明', '後人', '后人', '口闕名', '□闕名'}


def _role_kind(r):
    for x in ROLES:            # 复合役割取首个役割词定主次（「撰略例」＝主，「編校」＝次）
        if r.startswith(x):
            return 'p' if x in ROLE_PRIMARY else 's'
    return 'p'


def _clean_name(t):
    t = re.sub(r'等$', '', t)
    n = PUNCT.sub('', fold(t))
    n = re.sub(r'[\[\]［］〔〕□〓]', '', n)
    return n if 2 <= len(n) <= 8 and CJK.search(n) and n not in BAD_NAMES and fold(n) not in {fold(b) for b in BAD_NAMES} else ''


def parse_author(s, structured=None):
    """→ (names 主责任者归一名集合, lead 首位责任者名集合, era_token 首位主责任者的朝代或 None)。
    structured：[(朝代, 名, 役割)]（东文研 detail.撰者），给了就不再解析原串。"""
    persons = []        # [names 变体集合, 朝代, 朝代是否显式, 役割]
    if structured:
        for dyn, nm, role in structured:
            n = _clean_name(unicodedata.normalize('NFKC', nm or ''))
            if n:
                persons.append([{n}, (dyn or '').strip() or None, True, role or ''])
    else:
        s = unicodedata.normalize('NFKC', s or '')
        s = re.sub(r'【[^】]*】', ' ', s)                          # 【著者】【述者】标签
        s = re.sub(r'\[ほか\]|ほか', ' ', s)

        def paren(m):
            g = m.group(1).strip()
            if re.fullmatch(r'(?:' + _DYN_RE + r')', g):
                return f' \x01{g} '
            if ROLE_TOKEN.match(g):
                return f' {g} '
            return ' '
        s = re.sub(r'[(（〔\[［]([^)）〕\]］]{0,12})[)）〕\]］]', paren, s)
        toks = [t for t in re.split(r'[\s；;、，,・/／|]+', s) if t]
        pend_dyn, open_ = None, []
        for t in toks:
            if t.startswith('\x01'):
                pend_dyn = t[1:]
                continue
            if t in DYN:
                pend_dyn = t
                continue
            if ROLE_TOKEN.match(t):
                for p in open_:
                    p[3] = p[3] or t
                open_ = []
                continue
            role, orig = '', None
            m = ROLE_TAIL.search(t)
            if m and len(t) - len(m.group(0)) >= 2:
                role, orig, t = m.group(0).lstrip('等'), t, t[:m.start()]
            t = re.sub(r'等$', '', t)
            dyn, explicit, variants = pend_dyn, pend_dyn is not None, set()
            if orig and len(role) == 1 and not orig.endswith('等' + role):      # 「王士點」：末字也可能是名字本身，原串一并收
                variants.add(_clean_name(orig))
            if pend_dyn is None:
                md = re.match(r'(?:' + _DYN_RE + r')', t)
                if md and len(t) - md.end() >= 2:
                    dyn = md.group(0)
                    variants.add(_clean_name(t[md.end():]))
            variants.add(_clean_name(t))
            variants.discard('')
            pend_dyn = None
            if not variants:
                continue
            p = [variants, dyn, explicit, role]
            persons.append(p)
            if role:
                for q in open_:
                    q[3] = q[3] or role
                open_ = []
            else:
                open_.append(p)
    prim = [p for p in persons if _role_kind(p[3]) == 'p'] if persons else []
    use = prim or persons
    names = set().union(*(p[0] for p in use)) if use else set()
    lead = set(use[0][0]) if use else set()
    era = use[0][1] if use else None
    return names, lead, era


class Splitter:
    """按馆切题名段：multi=True 表示后段是另一部书（合刻），False 表示后段只是册次。"""

    def __init__(self, pattern, multi):
        self.re, self.multi = re.compile(pattern), multi

    def split(self, t):
        return self.re.split(t)


BRACKETS = re.compile(r'[\[(（［〔][^\])）］〕]*[\])）］〕]')
APPEND = re.compile(r'序目|目録|目錄|目|圖|図|首|末|附録|附錄|拾遺|補遺|原闕|闕|存|殘|缺|欠|序|表|譜|考證|音義|釋文')   # 卷数附注里常见的附件名，不算另一部书
TAIL_PART = re.compile(r'(?:殘|残|存)$')


def parse_title(raw, splitter=None):
    """→ (题名主体, 卷数, force 码列表, 供局部判据的原串)。splitter：按馆切合刻／册次的正则。"""
    t = unicodedata.normalize('NFKC', raw or '').replace('巻', '卷').strip()
    t = re.sub(r'\s*\[[A-Za-z]?\d[\w\-:]*\]\s*', ' ', t).strip()          # 东大「[A006267-13]」馆藏号
    m = re.fullmatch(r'[（(［\[〔]([^）)］\]〕]+)[）)］\]〕]', t)              # 「（八種画譜）」「［周易伝義講釈聞書］」整体括号
    if m:
        t = m.group(1).strip()
    force = []
    parts = [x.strip() for x in (splitter.split(t) if splitter else [t]) if x.strip()]
    first = parts[0] if parts else ''
    core, rest, _ = split_title(first)
    core = core.strip()
    m = re.search(r'\s+(?=存|闕|殘|缺)', core)              # 慶應「詩疑 存巻1至3…」
    if m:
        rest, core = core[m.end():] + ' ' + rest, core[:m.start()]
        force.append('LOCAL_PART')
    core = re.sub(r'(?<=[\u3400-\u9fff]{2})[〇零一二三四五六七八九十百千\d]+回$', '', core)      # 「儒林外史五十六回」
    if TAIL_PART.search(core) and len(core) > 2:
        core = TAIL_PART.sub('', core)
        force.append('LOCAL_PART')
    if re.search(r'存\s*[卷巻冊册第\d一二三四五六七八九十]|[殘残]\s*[卷巻\d一二三四五六七八九十]|殘本|残本|零本', rest + ' ' + ' '.join(parts[1:])):
        force.append('LOCAL_PART')      # 殘本／存若干卷：口径 LOCAL_PART 降存疑（「闕巻7」这类小阙不算）
    if multi_title(APPEND.sub('', BRACKETS.sub('', rest))):
        force.append('MULTI_TITLE')
    if splitter is not None and splitter.multi:
        for x in parts[1:]:          # 「後漢書 90巻. 志 30巻」的「志」是同书一部分；后段题名 ≥2 字才算另一部书
            if len(CJK.findall(APPEND.sub('', split_title(x)[0]))) >= 2:
                force.append('MULTI_TITLE')
                break
    return core, parse_juan(rest, core), force, t


def load_json(data_root, fname):
    return json.load(open(os.path.join(data_root, fname), encoding='utf-8'))


def record(source, r, title, juan, names, lead, era_tok, force, unit, sort='', has_image=None, extra=None, url=None):
    img = r.get('image_url') or ''
    hi = bool(img) if has_image is None else has_image
    p = dict(wname='', names=names, lead=lead, era_token=era_tok, juan=juan, segs=[title] if title else [], alts=[], sort=sort,
             force=list(dict.fromkeys(force)))
    ex = dict(unit=unit, holding_id=r.get('holding_id', ''), extent=r.get('extent', ''), edition=r.get('edition', ''),
              period=r.get('period', ''))
    ex.update(extra or {})
    return dict(source=source, source_record_id=str(r['source_record_id']), group_key=unit, title_raw=r.get('bookName') or '',
                author_raw=r.get('author') or '', version_raw=r.get('version') or '', juan=juan, class_raw=r.get('sort') or '',
                url=url or r.get('url') or '', image_url=img, has_image=hi, extra=ex, parsed=p)


def finalize(out):
    """每个写入单位选一条代表记录（有影像优先，再按记录号）：其记录号进 group／metadata，其页面作资源 url。
    書陵部已由适配器给了总条（unit_record／unit_url），不覆盖。"""
    by = {}
    for r in out:
        by.setdefault(r['group_key'], []).append(r)
    for rs in by.values():
        rep = min(rs, key=lambda r: (not r['has_image'], r['source_record_id']))
        for r in rs:
            r['extra'].setdefault('unit_record', rep['source_record_id'])
            r['extra'].setdefault('unit_url', rep['url'])
    return out
