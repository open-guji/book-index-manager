"""京都大学貴重資料デジタルアーカイブ 漢籍（C1，kyoto_rmda；A9续）。一个 item 页一条，全部有 IIIF 清单；每条自成藏本。
题名常带角書「(秘伝)眼科全書」「(付釈音)尚書注疏」，去掉角書当题名；残本「存巻17、18」「(存1巻)」由 parse_title 记 LOCAL_PART。
索书号不能当藏本：同号下常是不同书（「醫學統宗」各子目、「帝範」与「帝鑑図説」同号），所以每条自成单位。
版本：站方「形態・版情報」多是尺寸装订（「刊 和大」「27 (cm)*折帖本」），改由 出版情報＋出版年（和暦）＋写刊の別 拼；
尺寸串里的「和／支」是和本／支那本（中国本），拼成「和刻本」「中國刊本」等。"""
import re
import unicodedata

from adapters.jpc1 import finalize, load_json, parse_author, parse_title, record

SOURCE = 'kyoto'
FILE = '京都大学貴重資料デジタルアーカイブ漢籍.json'
KAKUGAKI = re.compile(r'^[(（]([^)）]{1,8})[)）]\s*(?=\S)')
FLAG = re.compile(r'【[^】]*】')


def clean_title(t):
    t = unicodedata.normalize('NFKC', t or '').strip()
    t = FLAG.sub(' ', t)
    m = KAKUGAKI.match(t)
    if m:
        t = t[m.end():]
    return re.sub(r'\s+', ' ', t).strip()


def edition(raw):
    def g(k):
        v = raw.get(k) or ''
        return '；'.join(v) if isinstance(v, list) else v
    pub = re.sub(r'\[(?:出版地|出版者|出版年)不明\]', '', g('出版情報'))
    pub = re.sub(r'^[\s:,，]+|[\s:,，]+$', '', re.sub(r'\s*[:,]\s*(?=[:,]|$)', '', pub))
    year = g('出版年（和暦）').strip()
    kind = g('写刊の別').strip()
    shape = unicodedata.normalize('NFKC', g('形態・版情報'))
    origin = '和' if re.search(r'(?:^|\s|\*)和(?:\s|大|中|小|$)', shape) else '中國' if re.search(r'(?:^|\s)支(?:\s|大|中|小|$)', shape) else ''
    kind = {'刊': '和刻本' if origin == '和' else origin + '刊本', '写': origin + '寫本'}.get(kind, kind)
    if year and kind and year.endswith(('刊', '写')):
        kind = ''           # 「応永19 写」「宣和6 刊(大蔵経版)」已含写刊
    return ' '.join(x for x in (pub, year, kind) if x and x != '----')


VOL = re.compile(r'\s+[卷巻]\s*第?\s*[\d一二三四五六七八九十百上中下]+.*$')     # 「法苑珠林 巻第75」「昌黎先生集 巻1-4」：单卷／零本
CONTENTS = re.compile(r'^(\S{2,})\s+(?=\S*、)')                                   # 「周易 周易上経、周易下経、繋辞…」：后段是子目列表


def split_volume(t):
    """→ (题名, 是否零本)。parse_title 认得「医説 10巻」，认不得卷次在前、数字与卷字间有空格、子目列表这几种。"""
    t = re.sub(r'(\d)\s+([卷巻])', r'\1\2', t)
    m = VOL.search(t)
    if m and m.start() >= 2:
        return t[:m.start()], True
    m = CONTENTS.match(t)
    if m:
        return m.group(1), False
    return t, False


def load(data_root):
    out = []
    for r in load_json(data_root, FILE):
        t, part = split_volume(clean_title(r['bookName']))
        title, juan, force, _ = parse_title(t)
        if part:
            force.append('LOCAL_PART')
        names, lead, era = parse_author(r.get('author'))
        r = dict(r, version=edition(r.get('raw') or {}))
        out.append(record(SOURCE, r, title, juan, names, lead, era, force, r['source_record_id'], sort=r.get('sort') or '',
                          extra=dict(call_no=r.get('holding_id', ''), collections=(r.get('extra') or {}).get('collections', []),
                                     kanseki_basis=(r.get('extra') or {}).get('kanseki_basis', ''))))
    return finalize(out)
