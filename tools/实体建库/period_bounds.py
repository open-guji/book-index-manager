"""著錄志之時代上限表（catalog_bound）。見 SCHEMA〈period_upper〉。

一書見於某志，其時代不得晚於該志。只給上限，不給下限——早期志書亡佚極多，
一部漢代之書可能遲至《宋史·藝文志》方首見著錄。
"""
import re

ORD = ['pre-qin', 'qin-han', 'three-kingdoms', 'jin', 'nanbeichao', 'sui-tang',
       'five-dynasties', 'song', 'liao-jin-yuan', 'ming', 'qing', 'modern']
I = {p: i for i, p in enumerate(ORD)}

BOUND = {
    '漢書藝文志':       ('qin-han',        '班固《漢書》成於東漢建初，本劉歆《七略》'),
    '漢藝文志考證':     ('qin-han',        '宋王應麟考證漢志'),
    '後漢藝文志':       ('qin-han',        '清姚振宗補後漢，斷代'),
    '三國藝文志':       ('three-kingdoms', '清姚振宗補三國，斷代'),
    '補晋書藝文志':     ('jin',            '清人補晉，斷代'),
    '隋書經籍志':       ('sui-tang',       '唐長孫無忌等，成於顯慶元年（656）'),
    '隋書經籍志考證':   ('sui-tang',       '清姚振宗考證隋志'),
    '舊唐書經籍志':     ('sui-tang',       '後晉劉昫，本唐開元《群書四部錄》'),
    '新唐書藝文志':     ('sui-tang',       '宋歐陽修等（1060），著錄唐代著述'),
    '崇文總目':         ('song',           '宋王堯臣等（1041），北宋崇文院藏書'),
    '直齋書錄解題':     ('song',           '南宋陳振孫（1249）'),
    '宋史藝文志':       ('song',           '元脫脫等（1345），著錄宋代藏書'),
    '宋史藝文志補':     ('song',           '清人補'),
    '元史藝文志':       ('liao-jin-yuan',  '清錢大昕補元，斷代'),
    '補遼金元藝文志':   ('liao-jin-yuan',  '清人補遼金元，斷代'),
    '明史藝文志':       ('ming',           '清張廷玉等（1739），只錄明人著述，斷代'),
    '國史經籍志':       ('ming',           '明焦竑（1590）'),
    '經義考':           ('qing',           '清朱彝尊（1700）'),
    '欽定四庫全書總目': ('qing',           '清紀昀等（1782）'),
    '四庫全書總目':     ('qing',           '同上'),
    '書目答問':         ('qing',           '清張之洞（1875）'),
    '清史稿藝文志':     ('qing',           '民國趙爾巽等（1927），著錄清人著述'),
    '四庫全書存目叢書': ('qing',           '現代影印，收明清'),
    '續修四庫全書':     ('modern',         '現代影印'),
    '中國通俗小說書目': ('modern',         '孫楷第（1933）'),
}

# 大量著錄古書之清人輯本／注本者——見於此類志書不足以判 qing
QING_JIYI = {'清史稿藝文志', '欽定四庫全書總目', '四庫全書總目', '經義考',
             '書目答問', '四庫全書存目叢書', '續修四庫全書'}


def tightest(sources):
    """諸志中最緊之上限；無可據者返 None。

    sources 可為志書名之序列，亦可為 indexed_by 之節（dict）——後者會跳過
    標了 misattached 的節（同題異書誤併，非本書之著錄，見 mark_misattached_nodes.py）。
    """
    bs = []
    for s in sources:
        if isinstance(s, dict):
            if s.get('misattached'):
                continue
            s = s.get('source')
        if s in BOUND:
            bs.append(BOUND[s][0])
    return min(bs, key=lambda x: I[x]) if bs else None


# ═══ dynasty → period 全表（規則1 粗粒度自消歧）═══
# 判「兩個 dynasty 寫法是否同代」用此表，勿用他處之簡表——
# 簡表缺「三國吳」「前涼」「齊梁」之屬，會把詳值誤判為異代而改壞。
DYNASTY_PERIOD = {
    # 先秦
    '先秦': 'pre-qin', '上古': 'pre-qin', '上古傳說': 'pre-qin', '商': 'pre-qin',
    '春秋': 'pre-qin', '戰國': 'pre-qin', '春秋魯': 'pre-qin', '春秋晉': 'pre-qin',
    '春秋齊': 'pre-qin', '春秋吳': 'pre-qin', '春秋鄭': 'pre-qin', '春秋衛': 'pre-qin',
    '戰國楚': 'pre-qin', '戰國齊': 'pre-qin', '戰國魏': 'pre-qin', '戰國趙': 'pre-qin',
    '戰國韓': 'pre-qin', '戰國燕': 'pre-qin', '戰國秦': 'pre-qin',
    # 秦漢
    '秦': 'qin-han', '漢': 'qin-han', '東漢': 'qin-han', '西漢': 'qin-han',
    '後漢': 'qin-han', '兩漢': 'qin-han', '新': 'qin-han',
    # 三國
    '三國': 'three-kingdoms', '三國魏': 'three-kingdoms', '曹魏': 'three-kingdoms',
    '三國吳': 'three-kingdoms', '孫吳': 'three-kingdoms', '三國蜀': 'three-kingdoms',
    '蜀漢': 'three-kingdoms',
    # 晉（含十六國）
    '晉': 'jin', '西晉': 'jin', '東晉': 'jin', '兩晉': 'jin',
    '前秦': 'jin', '後秦': 'jin', '前涼': 'jin', '後涼': 'jin', '北涼': 'jin',
    '西涼': 'jin', '南涼': 'jin', '前燕': 'jin', '後燕': 'jin', '南燕': 'jin',
    '北燕': 'jin', '夏': 'jin', '成漢': 'jin', '十六國': 'jin',
    # 南北朝
    '南北朝': 'nanbeichao', '南朝': 'nanbeichao', '北朝': 'nanbeichao',
    '劉宋': 'nanbeichao', '南朝宋': 'nanbeichao', '南齊': 'nanbeichao', '南朝齊': 'nanbeichao',
    '南朝梁': 'nanbeichao', '南朝陳': 'nanbeichao', '齊梁': 'nanbeichao',
    '北魏': 'nanbeichao', '後魏': 'nanbeichao', '東魏': 'nanbeichao', '西魏': 'nanbeichao',
    '北齊': 'nanbeichao', '北周': 'nanbeichao',
    # 隋唐
    '隋': 'sui-tang', '唐': 'sui-tang', '隋唐': 'sui-tang',
    # 五代十國
    '五代': 'five-dynasties', '後梁': 'five-dynasties', '後唐': 'five-dynasties',
    '後晉': 'five-dynasties', '後周': 'five-dynasties', '南唐': 'five-dynasties',
    '前蜀': 'five-dynasties', '後蜀': 'five-dynasties', '吳越': 'five-dynasties',
    # 宋
    '北宋': 'song', '南宋': 'song',
    # 遼金元
    '遼': 'liao-jin-yuan', '金': 'liao-jin-yuan', '元': 'liao-jin-yuan',
    '遼金元': 'liao-jin-yuan', '西夏': 'liao-jin-yuan',
    # 明清近代
    '明': 'ming', '清': 'qing',
    '中華民國': 'modern', '民國': 'modern', '中華人民共和國': 'modern',
    '現代': 'modern', '近代': 'modern',
    '宋末元初': 'liao-jin-yuan',  # 非歧義——指宋元之交確定之世，非「宋」字之歧讀，
                                    # 逕定即可（原僅入 AMBIGUOUS_LATEST 供上限用，2026-08-24 補正）
}

# 歧義寫法：單書此字不足以定代，須以 catalog_bound 或他證消歧
# 「國朝」「皇朝」「本朝」之義隨志書而異——《國史經籍志》（明焦竑）之「國朝」是明，
# 《清史稿》之「國朝」是清。不可入 DYNASTY_PERIOD，須看所出之志。
AMBIGUOUS = {'宋', '魏', '周', '吳', '蜀', '齊', '梁', '陳', '燕', '涼', '漢後',
             '國朝', '皇朝', '本朝'}

# 「國朝」之解：以著錄之志為據
GUOCHAO = {
    '國史經籍志': 'ming',        # 明焦竑
    '明史藝文志': 'ming',
    '欽定四庫全書總目': 'qing', '四庫全書總目': 'qing',
    '清史稿藝文志': 'qing', '經義考': 'qing', '書目答問': 'qing',
    '宋史藝文志': 'song', '崇文總目': 'song', '直齋書錄解題': 'song',
    '新唐書藝文志': 'sui-tang', '舊唐書經籍志': 'sui-tang', '隋書經籍志': 'sui-tang',
}


def same_period(a, b):
    """兩個 dynasty 寫法是否同代。任一為歧義寫法或不在表中則返 None（不可判）。"""
    if not a or not b:
        return None
    if a in AMBIGUOUS or b in AMBIGUOUS:
        return None
    pa, pb = DYNASTY_PERIOD.get(a), DYNASTY_PERIOD.get(b)
    if pa is None or pb is None:
        return None
    return pa == pb


# ═══ 版本年代為時代上限（edition_bound）═══
# 一書之刊本、寫本、鈔本，其年代不早於成書之年——故版本年代亦是時代上限。
# 與 catalog_bound 同理而別源：彼據著錄之志，此據存世之本。
#
# **陷阱一：現代影印／整理本無用。** 「中華再造善本」「四庫全書存目叢書」
# 「長沙馬王堆漢墓簡帛集成本」之年代皆現代，上限 modern 不排除任何事。
# 故只取推得之上限早於 modern 者。
#
# **陷阱二：無年代之版本不可用。** 「鈔本」「舊鈔本」「日本鈔本」未著其年，
# 不可據以定限。
EDITION_BOUND = [
    ('宋', 'song'), ('遼', 'liao-jin-yuan'), ('金', 'liao-jin-yuan'), ('元', 'liao-jin-yuan'),
    ('明', 'ming'), ('清', 'qing'), ('民國', 'modern'), ('中華民國', 'modern'),
    ('唐', 'sui-tang'), ('隋', 'sui-tang'), ('五代', 'five-dynasties'),
    ('日本江戶', 'qing'), ('日本寬永', 'ming'), ('日本慶長', 'ming'),
    ('日本元祿', 'qing'), ('日本享保', 'qing'), ('日本寶曆', 'qing'),
    ('日本安永', 'qing'), ('日本天明', 'qing'), ('日本寬政', 'qing'),
    ('日本文化', 'qing'), ('日本文政', 'qing'), ('日本天保', 'qing'),
    ('日本弘化', 'qing'), ('日本嘉永', 'qing'), ('日本安政', 'qing'),
    ('日本萬延', 'qing'), ('日本文久', 'qing'), ('日本元治', 'qing'),
    ('日本慶應', 'qing'), ('日本明治', 'modern'), ('日本大正', 'modern'),
    ('日本昭和', 'modern'),
    ('朝鮮', None), ('高麗', None),          # 未著其年者不可用
]
# 現代影印／整理之叢編，其年代不限原書
MODERN_REPRINT = ('中華再造善本', '四庫全書存目叢書', '續修四庫全書', '簡帛集成',
                  '出土文獻', '影印', '景印', '整理本', '點校本', '排印本')


def edition_bound(edition):
    """自 edition 字串推時代上限；不可用者返 None。"""
    if not edition:
        return None
    if any(m in edition for m in MODERN_REPRINT):
        return None
    for pre, p in EDITION_BOUND:
        if edition.startswith(pre):
            return p
    return None


# ═══ 各 period 之年代區間 ═══
# `period` 是政權軸非時間軸（見 SCHEMA），song 與 liao-jin-yuan 全重疊 319 年。
# 故比較「某上限是否與某 period 相斥」不可逕用 ORD 之序——遼行均《龍龕手鑑》
# period 為 liao-jin-yuan 而有宋刻本，序上 song(7) < liao-jin-yuan(8) 似相斥，
# 實則遼與宋同時，宋刻本正可載遼人之書。
#
# 正解：**相斥 iff period 之起年 > 上限之訖年**。
PERIOD_YEARS = {
    'pre-qin': (-2100, -221), 'qin-han': (-221, 220), 'three-kingdoms': (220, 280),
    'jin': (265, 420), 'nanbeichao': (420, 589), 'sui-tang': (581, 907),
    'five-dynasties': (907, 979), 'song': (960, 1279), 'liao-jin-yuan': (907, 1368),
    'ming': (1368, 1644), 'qing': (1644, 1912), 'modern': (1912, 2100),
}


def conflicts_with_bound(period, bound):
    """period 是否與某時代上限相斥——起年晚於上限之訖年方為相斥。"""
    if not period or not bound:
        return False
    ps = PERIOD_YEARS.get(period)
    be = PERIOD_YEARS.get(bound)
    if not ps or not be:
        return False
    return ps[0] > be[1]


# ═══ 出土文獻：簡帛之年即其抄寫之年，為成書之上限 ═══
# 出土之本亦本也，與傳世刊本同理：抄本之年不早於成書之年。
# 戰國竹書之上限即 pre-qin，而 pre-qin 為軸之首，上限至此即成定判——
# 故此類逕定 period，不止標 upper。
EXCAVATION = [
    ('清華大學藏戰國竹簡', 'pre-qin', '戰國楚簡'),
    ('清華大學藏戰國竹簡', 'pre-qin', '戰國楚簡'),
    ('郭店楚墓竹簡', 'pre-qin', '戰國楚簡'),
    ('上海博物館藏戰國楚竹書', 'pre-qin', '戰國楚簡'),
    ('馬王堆', 'qin-han', '西漢初長沙馬王堆帛書'),
    ('銀雀山', 'qin-han', '西漢銀雀山漢簡'),
    ('定州漢墓', 'qin-han', '西漢定州漢簡'),
    ('海昏', 'qin-han', '西漢海昏侯墓簡牘'),
    ('睡虎地', 'qin-han', '秦睡虎地秦簡'),
    ('里耶', 'qin-han', '秦里耶秦簡'),
    ('張家山', 'qin-han', '西漢張家山漢簡'),
    ('北京大學藏西漢竹書', 'qin-han', '西漢北大漢簡'),
]


# 今人就出土文獻所作之釋文／校釋／研究，**不是出土文獻本身**——
# 其書成於發掘之後，簡帛之年不為其上限。書名帶此類語者即是。
# （實測攔下《馬王堆帛書周易經傳釋文》廖名春撰一條：其 description 本已明言
#  「爲今人整理研究之作，非帛書本身」，而關鍵詞「馬王堆」仍令其上限誤作 qin-han。）
EXCAVATION_MODERN = re.compile(
    r'釋文|校釋|考釋|彙釋|集釋|校注|校證|彙校|新證|研究|整理|集成|'
    r'通解|今譯|譯注|讀本|索引|文字編|導論|概論')


def excavation_bound(blob, title=None):
    """自描述文字（text + sources）辨出土批次，返 (上限, 批次名)。

    title 給出時，書名帶今人著述之語者不適用——今人之釋文非出土之物。
    """
    if not blob:
        return None, None
    if title and EXCAVATION_MODERN.search(title):
        return None, None
    for key, p, name in EXCAVATION:
        if key in blob:
            return p, name
    return None, None


# ═══ 志書之子目斷代：目錄之類目自言其代者，即斷代之判 ═══
# 孫楷第《中國通俗小說書目》雖為今人之作（catalog_bound 得 modern 而無用），
# 其卷次類目「宋元部」「明清講史部」等自標所收之代，是為斷代之判。
CATALOG_SECTION_BOUND = [
    ('中國通俗小說書目', '宋元部', 'liao-jin-yuan', '宋元'),
    ('中國通俗小說書目', '明清講史部', 'qing', '明清'),
    ('中國通俗小說書目', '明清小說部', 'qing', '明清'),
]
# 存疑目、附錄之屬不入斷代之列
CATALOG_SECTION_SKIP = ('存疑目', '附錄')


def catalog_section_bound(sources):
    """自 description.sources 之卷次類目取上限，返 (上限, 據語)。"""
    for s in sources or []:
        if isinstance(s, dict):
            s = s.get('title') or ''
        if not isinstance(s, str) or any(k in s for k in CATALOG_SECTION_SKIP):
            continue
        for cat, sec, p, era in CATALOG_SECTION_BOUND:
            if cat in s and sec in s:
                return p, f'《{cat}》{sec}'
    return None, None


# ═══ 自 description.text 取版本語 ═══
# 有本無 Book 而版本語具於描述者（如故宮善本舊籍諸條），亦可據以定上限。
# 限以「朝代冠首 + 版本術語收尾」且不含書名號者——含《》者多是稱引他書之本，
# 非本書之本。
_DESC_EDITION = re.compile(
    r'^(宋|遼|金|元|明|清|民國|唐|隋|五代|日本[^\s，,]{0,6})'
    r'[^《》，,、]{0,30}?'
    r'(刊本|刻本|寫本|鈔本|抄本|印本|活字本|聚珍本|殿本|稿本|重刊本|覆刻本|影鈔本|'
    r'景印本|縮印本|鉛印本|石印本)$')


def desc_edition(text):
    """自描述文字末尾取版本語；無者返 None。"""
    if not text:
        return None
    for seg in reversed([s.strip() for s in re.split(r'[。；;]', text) if s.strip()]):
        if _DESC_EDITION.match(seg):
            return seg
    return None


# ═══ 叢書之收書範圍：叢編自限所收之代者，其代即上限 ═══
# 與 MODERN_REPRINT 之別：彼禁以「影印之年」為據（影印之年不限原書），
# 此取「編者自定之收書下限」——二事不相妨。《續修四庫全書》1995 年影印，
# 而其收書止於辛亥（1911），故所收者無一晚於 qing。
COLLECTION_BOUND = {
    '續修四庫全書':     ('qing',     '其書收錄止於辛亥（1911）以前之著作'),
    '四庫全書存目叢書': ('qing',     '所收為《四庫總目》存目之書，皆乾隆以前'),
    '中華再造善本':     ('qing',     '所收為唐宋金元明清之善本'),
    # 馬國翰（1794–1857）。世稱其所輯為「唐以前佚書」，然實測所輯兼有
    # 宋人之書（《太平寰宇記佚文》《桂海虞衡志佚文》《後山談叢佚文》等），
    # 「唐以前」不足為據；可據者惟輯者之世。
    '玉函山房輯佚書':   ('qing',     '馬國翰（1794–1857）所輯，其所輯之書必在咸豐以前'),
}


def collection_bound(blob):
    """自描述／案語辨所屬叢編，返 (上限, 叢編名, 據語)。"""
    if not blob:
        return None, None, None
    for name, (p, why) in COLLECTION_BOUND.items():
        if name in blob:
            return p, name, why
    return None, None, None


# ═══ 歧義朝代名：取諸解中最晚者為上限 ═══
# 「宋」或劉宋（nanbeichao）或趙宋（song），無論何解皆不晚於 song——
# 消歧不成，上限猶可得。此表之值即諸解中最晚之 period。
AMBIGUOUS_LATEST = {
    '宋': 'song',              # 南朝宋 | 北宋南宋
    '魏': 'nanbeichao',        # 三國魏 | 北魏東魏西魏 | 冉魏
    '周': 'five-dynasties',    # 西周東周 | 北周 | 武周 | 後周
    '吳': 'five-dynasties',    # 三國吳 | 十國吳 | 吳越
    '蜀': 'five-dynasties',    # 三國蜀 | 前蜀後蜀
    '齊': 'nanbeichao',        # 戰國齊 | 南朝齊 | 北齊
    '梁': 'five-dynasties',    # 南朝梁 西梁 | 後梁
    '陳': 'nanbeichao',        # 戰國陳 | 南朝陳
    '燕': 'nanbeichao',        # 戰國燕 | 前後南北燕
    '涼': 'nanbeichao',        # 前後南北西涼
    '漢': 'five-dynasties',    # 西漢東漢 | 蜀漢 | 成漢 | 後漢南漢北漢
    '唐': 'five-dynasties',    # 唐 | 後唐
    '晉': 'five-dynasties',    # 西晉東晉 | 後晉
    '秦': 'nanbeichao',        # 秦 | 前秦後秦西秦
    '西夏': 'liao-jin-yuan',
    '宋末元初': 'liao-jin-yuan',
    '江戶時代': 'qing',        # 日本江戶 1603–1868
}


def ambiguous_dynasty_bound(dynasty):
    """歧義朝代名之上限；不在表者返 None。"""
    return AMBIGUOUS_LATEST.get((dynasty or '').strip())
