"""整理本 section `type` 之受控詞彙：新舊兩制之對照與判別。

SCHEMA 定「受控詞彙一律英文（2026-08 遷移）」。整理本 section 之 `type` 尚未遷，
盤上是「未遷之舊中文詞」與「已遷之英文枚舉」兩代並存。遷移分三步走：

    1. 消費方兼認新舊（本檔即為此立）
    2. 改資料（138,829 節，一次性）
    3. 拆掉消費方之舊分支，SCHEMA 補枚舉表

**不可逆序。** 先改資料則所有消費方在改完之前一直是壞的，而它們多半
**不報錯，只是篩不到東西**——本輪已反覆栽在這一類上。

用法：

    from sectype import is_book, is_tally, canon, BOOK
    if is_book(sec.get('type')): ...          # 兼認 书／書／book
    if canon(sec.get('type')) == 'preface':   # 兼認 序／部／preface

**現成的傷，本檔正可消之**：`fill_measures.py` 與 `census.py` 原寫死簡體
`'书'`，那 3,415 條 `書`（全在《直齋書錄解題》一部）**一直被靜默漏掉**——
不報錯，只是那部整理本在它們眼裡是空的。
"""

# 舊中文詞 → 新英文枚舉。依據見
# `overview/项目进展/古籍索引网站/整体设计/2026-08-section-type-英文枚举迁移.md`
LEGACY_TO_NEW = {
    '书': 'book',              # 書目條
    '書': 'book',              # 同上（全在《直齋書錄解題》一部，非混用）
    '考证': 'verification',    # 考證條
    '文': 'prose',             # 選本之篇
    '詩': 'poem',              # 選本之詩
    '序': 'preface',           # 總說／敘例／小序
    '小序': 'preface',
    '部': 'preface',           # 「經部總敍」「史部總敘」，與序同歸
    '論': 'comment',
    '论': 'comment',           # 《經義考》附於書條下之諸家論說引文
    '结语': 'tally',           # 「右孝經類凡七家七部」
    '結語': 'tally',
    '类': 'category',          # 部類標目
    '類': 'category',
    '其他': 'page_header',     # 四庫總目之「卷一百八十二 集部三十五」頁眉
}

# `catalog` 之特例：**節之 `catalog` 與清單檔之 `type: catalog` 撞名而義不同**。
# 節之 catalog（38 條，全在《漢書藝文志》）是「賦」「詩」之類體裁標目，
# 當歸 `category`；清單檔之 catalog（36 部）是「這部整理本是書目志」。
# 歸一正可解此撞名，然遷移期內須留意：**此值只在 section 上作 category 解**。
SECTION_CATALOG_IS_CATEGORY = True

NEW_VALUES = set(LEGACY_TO_NEW.values()) | {'reconstruction'}


def canon(t):
    """歸一到新枚舉。已是新值者原樣返回；未知者原樣返回（不吞）。"""
    if t is None:
        return None
    if t == 'catalog' and SECTION_CATALOG_IS_CATEGORY:
        return 'category'
    return LEGACY_TO_NEW.get(t, t)


def _is(name):
    def f(t):
        return canon(t) == name
    f.__name__ = 'is_' + name
    f.__doc__ = f'節之 type 是否為 {name}（兼認新舊兩制）'
    return f


is_book = _is('book')
is_category = _is('category')
is_preface = _is('preface')
is_tally = _is('tally')
is_comment = _is('comment')
is_verification = _is('verification')
is_prose = _is('prose')
is_poem = _is('poem')
is_page_header = _is('page_header')

# 供 `in` 判斷者（有些呼叫處要一次比數個）
BOOK = frozenset(['书', '書', 'book'])
TALLY = frozenset(['结语', '結語', 'tally'])
PREFACE = frozenset(['序', '小序', '部', 'preface'])
CATEGORY = frozenset(['类', '類', 'catalog', 'category'])
