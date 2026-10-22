"""块 D 步 4：题名拆分、卷数、丛书／合刻判据（承 D2 match_nlc.py，抽成可单测函数）。"""
import re

CN = {'〇': 0, '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9}
_NUM = r'[〇零一二三四五六七八九十百千廿卅\d]+'

# 丛书／合集标记。BASE＝国图 D2 版；EXT＝国書 D3 加的「大全／全集」。适配器按源选。
COLL_BASE = re.compile(r'叢書|丛书|全書|全书|集成|彙刻|匯刻|彙編|汇编|叢刊|丛刊|[一二三四五六七八九十百\d]+[種种編编]')
COLL_EXT = re.compile(COLL_BASE.pattern + r'|大全|全集')
# 去装饰词（并集：D3 比 D2 多 標題／魁本／大字；装饰词只用于降级召回，不影响确定档）
PREF = re.compile(r'^(欽定|钦定|御製|御制|御纂|御選|新刻|重刻|新鐫|新镌|校刻|重訂|重订|增訂|增订|重刊|新編|新编|新刊|新鍥|新锲|精刻|增刊|增補|增补|補刻|补刻|校正|詳註|详注|纂圖|篆圖|音註|音注|繡像|绣像|批點|批点|評點|评点|足本|校訂|校订|標題|标题|魁本|大字)+')
SPLIT = re.compile(r'[\s　]{2,}|\s+(?=[〇零一二三四五六七八九十百千\d]+[卷種种編编])')
# 局部标记（摘抄／節錄／殘本…）。只扫“归一时被丢掉的部分”：题名后附（rest）、括号注、国書「／」后的段；
# 不扫题名主体——《新序》《廣川書跋》《古品節錄》这类 Work 题名本身含这些字，题名全等时不算局部。
SUPPLEMENT = re.compile(r'續集|續編|續刻|補遺|補編|補刻|拾遺|後集|後編|外集|外編|別集|餘集|續|续集|续编|续刻|补遗|补编|补刻|拾遗|后集|后编|外编|别集|余集|续')


def supplement_marks(keys):
    """归一题名里的续／补／拾遗等标记集合（用于「记录是续集／补编，Work 题名无此标记」的降级）。"""
    return {m for k in keys for m in SUPPLEMENT.findall(k)}   # norm_title 输出简体，故两体都列


LOCAL_PART = re.compile(r'摘抄|抄錄|抄录|摘錄|摘录|節錄|节录|選錄|选录|節要|节要|節本|节本|殘本|残本|零本|零卷|存[一二三四五六七八九十百\d]+卷')


def cn2int(s):
    s = s.replace('廿', '二十').replace('卅', '三十')
    if re.fullmatch(r'\d+', s):
        return int(s)
    tot = cur = 0
    for ch in s:
        if ch in CN:
            cur = CN[ch]
        elif ch == '十':
            tot += (cur or 1) * 10; cur = 0
        elif ch == '百':
            tot += (cur or 1) * 100; cur = 0
        elif ch == '千':
            tot += (cur or 1) * 1000; cur = 0
    return tot + cur


def split_title(raw):
    """返回 (core_title_raw, rest, era_hint)。era_hint＝方志类题名开头的 [朝代] 前缀（只有题名像方志才算）。"""
    t = (raw or '').strip()
    era = None
    m = re.match(r'^[\[\(（［【〔]([^\]\)）］】〕]{1,6})[\]\)）］】〕]', t)
    if m and re.search(r'志|誌|縣|县|府|州|通志|志略', t):
        era = m.group(1)
    parts = SPLIT.split(t, maxsplit=1)
    core = parts[0]
    rest = parts[1] if len(parts) > 1 else ''
    # 题名后直接粘着卷数（故宮式「元豐類稿五十卷附錄一卷」）：在第一个「N卷」前切开
    mj = re.search(r'(?<=[㐀-鿿]{2})' + _NUM + r'[卷巻]', core)
    if mj:
        rest = (core[mj.start():] + ' ' + rest).strip()
        core = core[:mj.start()]
    return core, rest, era


def multi_title(rest):
    """题名后还跟着别的题名（合刻／合订本）：去掉卷册数与「附…」后仍有≥2 个汉字。"""
    r = re.sub(r'[〇零一二三四五六七八九十百千廿卅\d]+', '', rest or '')
    r = re.sub(r'[卷巻冊册函帙種种編编首末上下之，,；;、\s]', '', r)
    r = re.sub(r'附.*$', '', r)
    return len(re.findall(r'[㐀-鿿]', r)) >= 2


def parse_juan(rest, core=''):
    m = re.search(r'(' + _NUM + r')[卷巻]', rest or '') or re.search(r'(' + _NUM + r')[卷巻]', core or '')
    if m:
        try:
            return cn2int(m.group(1))
        except Exception:
            return None
    return None


def local_part_text(title, rest='', extra_segs=()):
    """被归一丢掉、但可能暗示“局部”的文字：括号注＋题名后附＋额外段。"""
    import unicodedata
    t = unicodedata.normalize('NFKC', title or '')
    brackets = re.findall(r'[\[\(（［【〔][^\]\)）］】〕]*[\]\)）］】〕]', t)
    return ' '.join(brackets + [rest or ''] + list(extra_segs))
