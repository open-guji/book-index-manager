"""欧美诸馆适配器（A8，2026-10-26）：C2 抓取的 bnf／bsb／sbb（柏林）／loc／cudl／onb 六馆 → 统一 Record。
梵蒂冈（vatlib）只有藏号无题名，不接。

各馆题名、责任者写法不一，统一做法：
- 题名：NFKC 后取含汉字的那一段（柏林「罗马字 = 汉字」取等号右侧；cudl「罗马字 汉字」去罗马字），
  去掉 `@ `、方括号（补题）；「X X」两段相同（onb）收成一段；` : `／`;`／`.` 之后与卷数注、册次注进 rest。
- 卷数：rest 或题名尾的「N 卷／N卷／卷数汉字」；「卷6-7」「卷八至九」「第一函」「上冊」「殘」视作分册／残本（LOCAL_PART）。
- 责任者：汉字名（去 *清*、(清)、[ ] 与役割词）→ names；罗马字名（loc 全是拼音「Chen, Jiru, 1558-1639, bian ji」）→ roman，
  判定时与 Work 著者的拼音比（tier.auth_relation 的 pinyin 开关）。loc 的役割 xu／ba／ti／ke／cang ban 等不算责任者。
- 只出有影像（image_url 非空）的记录；bnf 无 Gallica 链接的三万条是纯书目，不出（K3：无影像不写，同 A5/A6 口径）。
"""
import glob
import json
import os
import re
import unicodedata

from normalize import norm_author, fold, PUNCT
from titleparse import cn2int, LOCAL_PART

FILES = {
    'bnf': ('bnf/part-*.json',),
    'bsb': ('巴伐利亚州立图书馆.json',),
    'sbb': ('柏林国家图书馆.json',),
    'loc': ('美国国会图书馆.json',),
    'cudl': ('剑桥大学图书馆.json',),
    'onb': ('奥地利国家图书馆.json',),
}
HAN = re.compile(r'[㐀-鿿\U00020000-\U0002ffff]')
LATIN = re.compile(r"[A-Za-zÀ-ɏ'’ʻ]")
_NUM = r'[〇零一二三四五六七八九十百千廿卅\d]+'
JUAN_ANY = re.compile(r'(' + _NUM + r')\s*[卷巻]')
# 分册／残本标记（本记录只是整书的若干卷册）
PART = re.compile(r'[卷巻]\s*' + _NUM + r'\s*(?:[-－~～至到]\s*(?:[卷巻]\s*)?' + _NUM + r')|第\s*' + _NUM + r'\s*[函冊册卷巻本]|'
                  r'(?:^|\s)[上中下][冊册卷巻](?:$|\s)|殘|残|存\s*' + _NUM + r'|零本|零卷|^\s*' + _NUM + r'\s+第')
# loc 罗马字役割里不算责任者的（序、跋、题、刻、藏版、书、校印等）
LOC_NONAUTHOR = re.compile(r'^(?:hou |zi |jiu |yuan )?(?:xu|ba|ti|ti ci|ti ba|ke|ke ben|cang ban|shu|chu ban|yin|kan|jiao kan|jiao yin|shou cang|zeng|'
                           r'former owner|printer|publisher|calligrapher|owner|binder|donor|collector|engraver|bookseller|xu ke)$')
UNKNOWN = ('不详', '不詳', '佚名', '阙名', '闕名', '无名氏', '無名氏', '作者不明', '抄手不详', '抄手不詳')
ERA_MARK = re.compile(r'^\s*[\*\(（\[［]\s*(周|秦|漢|汉|魏|晉|晋|宋|齊|齐|梁|陳|陈|隋|唐|五代|遼|辽|金|元|明|清|民國|民国|南朝宋|北魏|後漢|东汉|東漢|西漢|西汉)\s*[\*\)）\]］]')


def _nfkc(s):
    return unicodedata.normalize('NFKC', s or '')


def han_part(s):
    """从混合字符串里取汉字段：按 ` = ` 分，取第一个含汉字的段；再去罗马字词。"""
    s = _nfkc(s).strip()
    s = re.sub(r'^@\s*', '', s)
    for seg in re.split(r'\s+=\s+', s):
        if HAN.search(seg):
            s = seg
            break
    # 罗马字词（含连字符、撇号）去掉；保留汉字、数字、标点
    s = re.sub(r"[A-Za-zÀ-ɏ'’ʻ]+(?:[\-\.][A-Za-zÀ-ɏ'’ʻ]+)*\.?", ' ', s)
    s = re.sub(r'\s+', ' ', s).strip(' ,;:/')
    return s


def split_title(t):
    """→ (core, rest)。core＝题名主体（去方括号补题符），rest＝卷数／册次／副题等。"""
    t = t.replace('［', '[').replace('］', ']')
    if re.fullmatch(r'\[[^\]]+\]', t):
        t = t[1:-1]
    t = re.sub(r'^\[([^\]]+)\]', r'\1', t)
    # 并列题名 「题名 : 副题／卷数」「题名 ; 卷数」「题名. 题名2」
    m = re.search(r'\s[:;]\s|\s?:\s|\.\s|\s\[', t)
    core, rest = (t[:m.start()], t[m.end() - (1 if t[m.end() - 1] == '[' else 0):]) if m else (t, '')
    # 题名后空格接卷册注（「書法雅言 1 卷」「五車韻府 卷6-7」「欽定大清會典事例 1220卷 …」）
    m2 = re.search(r'\s(?=' + _NUM + r'\s*[卷巻回冊册函]|[卷巻]\s*' + _NUM + r'|第\s*' + _NUM + r'|[上中下][冊册卷巻]\b|殘|残|存' + _NUM + r'|\d+\s|\d+$|\()', core)
    if m2:
        rest = (core[m2.start():] + ' ' + rest).strip()
        core = core[:m2.start()]
    # 题名直接粘卷数（「弘簡錄254卷」「(四卷)」）
    m3 = re.search(r'(?<=[㐀-鿿]{2})(?:' + _NUM + r'|不分)[卷巻]', core)
    if m3:
        rest = (core[m3.start():] + ' ' + rest).strip()
        core = core[:m3.start()]
    core = core.strip(' ,，;；:：.')
    # onb「明史藁 明史藁」「御纂醫宗金鑑 御纂醫宗金鑑」：两段相同收一段
    p = core.split(' ')
    if len(p) == 2 and p[0] == p[1]:
        core = p[0]
    return core, rest


def juan_of(*ss):
    for s in ss:
        m = JUAN_ANY.search(_nfkc(s))
        if m:
            try:
                return cn2int(m.group(1))
            except Exception:
                return None
    return None


def han_names(s):
    """汉字责任者 → (名集合, 首名集合, 朝代标注)。"""
    s = _nfkc(s)
    era_tok = None
    names, lead = set(), set()
    for tok in re.split(r'[；;]|(?<=[㐀-鿿])\s+(?=[㐀-鿿\(\[\*（［])', s):
        tok = tok.strip()
        if not tok:
            continue
        m = ERA_MARK.match(tok)
        if m:
            era_tok = era_tok or m.group(1)
            tok = tok[m.end():]
        tok = re.sub(r'\*[^*]*\*', ' ', tok)
        tok = re.sub(r"[A-Za-zÀ-ɏ'’ʻ]+(?:[\-\.,][A-Za-zÀ-ɏ'’ʻ ]+)*", ' ', tok)   # 罗马字／生卒注
        tok = re.sub(r'-?\d{3,4}\??-?\d{0,4}\??', ' ', tok)
        if not HAN.search(tok):
            continue
        if any(u in tok for u in UNKNOWN):
            continue
        if re.search(r'[぀-ヿ]', tok):        # 片假名读音（柏林日本书的「フカネ, スケヒト」）
            continue
        # 「深根, 輔仁」式：逗号分隔的姓名，拼回
        if re.fullmatch(r'\s*[㐀-鿿]{1,3}\s*,\s*[㐀-鿿]{1,4}\s*', tok):
            tok = tok.replace(',', '').replace(' ', '')
        tok = re.sub(r'(?:合畫|合画|梓|刊行|鐫|镌)(?=$|\s)', ' ', tok)
        for n in norm_author(tok, False).split('|'):
            n = PUNCT.sub('', n)
            if 2 <= len(n) <= 8 and HAN.search(n):
                names.add(n)
                if not lead:
                    lead.add(n)
    return names, lead, era_tok


def roman_names(s, loc=False):
    """罗马字责任者（「Chen, Jiru, 1558-1639, bian ji」「Agui, 1717-1797, zhuan」「Zhang, Jinwu」）→ 拼音键集合。"""
    out = []
    for tok in re.split(r'[；;]', _nfkc(s)):
        tok = tok.strip()
        if not tok or HAN.search(tok) or not LATIN.search(tok):
            continue
        if re.search(r'\(China\)|Library|Collection|Sheng|Xian|Fu\b|Wu ying dian|tang\b|guan\b|ju\b|shu ju|shu yuan|Emperor', tok, re.I) and ',' not in tok.split(' ', 1)[0]:
            continue
        f = [x.strip() for x in tok.split(',')]
        surname, given, roles = f[0], '', []
        for x in f[1:]:
            x = re.sub(r'^(?:active |approximately |ca\. ?|fl\. ?|jin shi |ju ren )?[\d\-\?\s]+(?:(?:st|nd|rd|th) century)?(?:B\. ?C\.?|A\. ?D\.?)?\s*', '', x).strip()
            if not x or re.search(r'\d|active|cent|B\. ?C|fl\.|^ca\b', x):
                continue
            if x[0].isupper() and not given and not roles:
                given = x
            elif x[0].islower():
                roles.append(x.lower())
        if loc and roles and all(LOC_NONAUTHOR.match(x) for x in roles):
            continue
        if not re.fullmatch(r"[A-Za-zÀ-ɏ'’ʻ\- ]+", surname + ' ' + given):
            continue
        key = re.sub(r"[^a-z]", '', unicodedata.normalize('NFKD', (surname + given).lower()).replace('ü', 'v'))
        key = re.sub(r'[^a-z]', '', key)
        if 3 <= len(key) <= 18:
            out.append(key)
    return out


def _records(data_root, source):
    for pat in FILES[source]:
        for f in sorted(glob.glob(os.path.join(data_root, pat))):
            yield from json.load(open(f, encoding='utf-8'))


def _version(r):
    v = _nfkc(r.get('version') or '')
    return re.sub(r'\s+', ' ', v).strip()


def load(data_root, source):
    out = []
    for r in _records(data_root, source):
        img = r.get('image_url') or ''
        if not img:
            continue
        raw_title = r.get('bookName') or r.get('title') or ''
        if source == 'loc':
            # loc 题名本身即汉字题名（245 880），罗马字在 extra.title_romanized
            pass
        t = han_part(raw_title)
        if not HAN.search(t):
            continue
        core, rest = split_title(t)
        author = r.get('author') or ''
        names, lead, era_tok = han_names(author)
        roman = roman_names(author, loc=(source == 'loc'))
        juan = juan_of(rest, core)
        force = []
        part = bool(PART.search(rest) or PART.search(core))
        if part:
            force.append('LOCAL_PART')
        # 多题名：rest 去卷册数与「附…」后仍有≥2 个汉字的独立题名（「弢甫集 : 十四卷. 弢甫五嶽集 : 五種二十卷」）
        rr = re.sub(r'附[^,，.;；]*', '', rest)
        rr = re.sub(_NUM + r'\s*[卷巻回冊册函種种編编]|不分[卷巻]|[卷巻首末上下之第冊册函]', '', rr)
        if re.search(r'[\.;；]\s*[㐀-鿿]{2,}', rest) and len(HAN.findall(rr)) >= 2:
            force.append('MULTI_TITLE')
        sort = r.get('sort') or ''
        p = dict(wname='', names=names, lead=lead, era_token=era_tok, juan=juan, segs=[core] if core else [], alts=[],
                 sort='', force=force, roman=roman)
        rid = r.get('source_record_id') or ''
        ex = r.get('extra') or {}
        parent = (ex.get('parent_b3kat_id') if source == 'bsb' else (ex.get('parent_ppn') or [''])[0] if source == 'sbb' else '') or ''
        set_key = parent or '|'.join([PUNCT.sub('', fold(core, False)), PUNCT.sub('', fold(author, False)), PUNCT.sub('', _version(r))])
        out.append(dict(source=source, source_record_id=rid, group_key=set_key, set_parent=parent, set_order=_order(source, ex, rest), title_raw=core, author_raw=author,
                        version_raw=_version(r), juan=juan, class_raw=sort, url=r.get('url') or '',
                        image_url=img, has_image=True,
                        extra=dict(holding_id=r.get('holding_id', ''), extent=r.get('extent', ''), rest=rest, period=r.get('period', ''),
                                   full_title=raw_title),
                        parsed=p))
    # 同一套书的各册（bsb parent_b3kat_id、柏林 parent_ppn，其余按 题名＋责任者＋版本）：
    # 卷册注只是分册，不当残本；写入时一套一项（writeplan 按 group 去重，取首册）
    sizes, first = {}, {}
    for x in out:
        k = x['group_key']
        sizes[k] = sizes.get(k, 0) + 1
        first[k] = min(first.get(k, x['source_record_id']), x['source_record_id'])
    for x in out:
        n = sizes[x['group_key']]
        x['extra']['set_size'] = n
        x['extra']['set_order'] = x.pop('set_order')
        x['extra']['set_id'] = x.pop('set_parent') or (first[x['group_key']] if n > 1 else '')
        f = x['parsed']['force']
        if n > 1 and 'LOCAL_PART' in f and not re.search(r'殘|残|存\s*' + _NUM + r'|零本|零卷', x['extra']['rest'] + x['title_raw']):
            f.remove('LOCAL_PART')
    return out


def _order(source, ex, rest):
    """分册序：bsb series、其余取 rest 里第一个数字（「1 第一函」「卷2-3」）；无则 0。"""
    v = (ex.get('series') or [''])[0] if source == 'bsb' else ''
    m = re.match(r'\d+', str(v)) or re.search(r'\d+', rest or '')
    if m:
        return int(m.group(0))
    m = re.search(r'(' + _NUM + r')', rest or '')
    try:
        return cn2int(m.group(1)) if m else 0
    except Exception:
        return 0
