"""S1-S5 新字段校验器（issue open-guji-core/overview#278）。

原子校验语义与 book-index 仓 `.claude/qa/verify.py` 对齐；
顶层 `validate_*_fields()` 聚合成 `List[str]`，与 `ResourceEntry.validate()` 约定一致。

规则：无该字段（键不存在）一律视为通过，不报错（「只标异常，不标正常」）。
"""

import re
from typing import Dict, List, Optional, Tuple

# ---- Work.classification ----

# vocab 四元组：(l1s, l12_set, l123_set, l1234_set)
Vocab = Tuple[set, set, set, set]


def build_vocab(rows) -> Vocab:
    """由 classific.json 行（每行含 cata_l1..cata_l4，l3/l4 可能缺失）转成 vocab 四元组。"""
    l1s: set = set()
    l12: set = set()
    l123: set = set()
    l1234: set = set()
    for r in rows:
        if not isinstance(r, dict):
            continue
        l1 = (r.get("cata_l1") or "").strip()
        l2 = (r.get("cata_l2") or "").strip()
        l3 = (r.get("cata_l3") or "").strip()
        l4 = (r.get("cata_l4") or "").strip()
        if not l1:
            continue
        l1s.add(l1)
        if l2:
            l12.add((l1, l2))
        if l2 and l3:
            l123.add((l1, l2, l3))
        if l2 and l3 and l4:
            l1234.add((l1, l2, l3, l4))
    return (l1s, l12, l123, l1234)


def classification_ok(c: dict, vocab: Vocab) -> bool:
    l1s, l12, l123, l1234 = vocab
    l1, l2, l3, l4 = c.get('l1') or '', c.get('l2') or '', c.get('l3') or '', c.get('l4') or ''
    if not l1:
        return l2 == '' and l3 == '' and l4 == ''
    if l1 not in l1s:
        return False
    if not l2:
        return l3 == '' and l4 == ''
    if (l1, l2) not in l12:
        return False
    if not l3:
        return l4 == ''
    if (l1, l2, l3) not in l123:
        return False
    if not l4:
        return True
    return (l1, l2, l3, l4) in l1234


# ---- Book.edition_type ----

EDITION_TYPES = {'刻本', '抄本', '稿本', '活字本', '石印本', '鉛印本', '影印本', '套印本', '拓本', '印刷本', '其他'}


def edition_type_ok(v) -> bool:
    return v in EDITION_TYPES


# ---- Book.provenance ----

def provenance_ok(prov) -> bool:
    if not isinstance(prov, list):
        return False
    for item in prov:
        if not isinstance(item, dict):
            return False
        inst = item.get('institution')
        if not isinstance(inst, str) or not inst.strip():
            return False
        if not isinstance(item.get('call_number', ''), str):
            return False
    return True


# ---- Book.physical_description ----

def physical_description_ok(pd) -> bool:
    if not isinstance(pd, dict):
        return False
    content_fields = ('leaf_style', 'binding', 'dimensions', 'condition')
    for f in content_fields + ('source',):
        v = pd.get(f)
        if v is not None and not isinstance(v, str):
            return False
    if not isinstance(pd.get('source'), str) or not pd.get('source').strip():
        return False
    return any((pd.get(f) or '').strip() for f in content_fields)


# ---- Book.base_edition ----

BASE_EDITION_ROLES = {'底本', '配補', '參校'}


def base_edition_ok(be, self_id, book_ids, work_ids) -> bool:
    if not isinstance(be, list):
        return False
    for item in be:
        if not isinstance(item, dict):
            return False
        if item.get('role') not in BASE_EDITION_ROLES:
            return False
        if not isinstance(item.get('name'), str) or not item.get('name').strip():
            return False
        if not isinstance(item.get('source'), str) or not item.get('source').strip():
            return False
        bid = item.get('book_id')
        if bid is not None:
            if not isinstance(bid, str) or bid == self_id or bid not in book_ids:
                return False
        wid = item.get('work_id')
        if wid is not None:
            if not isinstance(wid, str) or wid not in work_ids:
                return False
    return True


# ---- Entity.dates ----

def dates_ok(d: dict):
    """返回 None 表示过；否则返回一句话说明哪里错（无 dates 键即过）。"""
    dt = d.get('dates')
    if dt is None:
        return None
    birth, death, floruit = dt.get('birth'), dt.get('death'), dt.get('floruit')
    for name, v in (('birth', birth), ('death', death)):
        if v is not None and not isinstance(v, int):
            return f'{name} 非整数：{v!r}'
    if floruit is not None:
        if not (isinstance(floruit, list) and len(floruit) == 2):
            return f'floruit 非二元数组：{floruit!r}'
        for v in floruit:
            if not isinstance(v, int):
                return f'floruit 含非整数：{floruit!r}'
        if floruit[0] > floruit[1]:
            return f'floruit 起 > 止：{floruit!r}'
    if birth is not None and death is not None and birth > death:
        return f'birth > death：{birth} > {death}'
    by, dy = d.get('birth_year'), d.get('death_year')
    if birth is not None and by is not None and birth != by:
        return f'dates.birth={birth} 与 birth_year={by} 不一致'
    if death is not None and dy is not None and death != dy:
        return f'dates.death={death} 与 death_year={dy} 不一致'
    return None


# ---- Entity.external_ids ----

_QID_RE = re.compile(r'^Q\d+$')


def external_ids_ok(d: dict):
    """返回 None 表示过（无 external_ids 键即过），否则返回错误说明。"""
    ext = d.get('external_ids')
    if not ext:
        return None
    wd = ext.get('wikidata_id')
    if wd is not None and not (isinstance(wd, str) and _QID_RE.match(wd)):
        return f'wikidata_id 形狀不合：{wd!r}'
    viaf = ext.get('viaf_id')
    if viaf is not None and not (isinstance(viaf, str) and viaf.isdigit()):
        return f'viaf_id 非純數字字串：{viaf!r}'
    return None


# ---- Collection._member_type ----

MEMBER_TYPES = {'Work', 'Book', 'Collection', 'mixed'}


def derive_member_type(d, reverse_has_book=False, reverse_has_work=False):
    has_b = bool(d.get('books')) or reverse_has_book
    has_w = bool(d.get('contained_works')) or reverse_has_work
    if has_b and has_w:
        return 'mixed'
    if has_b:
        return 'Book'
    if has_w:
        return 'Work'
    return None


def member_type_ok(d, reverse_has_book=False, reverse_has_work=False):
    v = d.get('_member_type')
    if v is None:
        return True
    if v not in MEMBER_TYPES:
        return False
    return v == derive_member_type(d, reverse_has_book, reverse_has_work)


# ---- 顶层聚合（返回 List[str]） ----

def validate_work_fields(work: dict, vocab: Optional[Vocab] = None) -> List[str]:
    errors: List[str] = []
    if 'classification' in work and work.get('classification') is not None:
        c = work.get('classification')
        if not isinstance(c, dict):
            errors.append('classification 非对象')
        elif vocab is not None and not classification_ok(c, vocab):
            errors.append(f'classification 非法：{c!r}')
    return errors


def validate_book_fields(book: dict, book_ids=None, work_ids=None) -> List[str]:
    errors: List[str] = []
    if 'edition_type' in book and book.get('edition_type') is not None:
        if not edition_type_ok(book.get('edition_type')):
            errors.append(f"edition_type 非法：{book.get('edition_type')!r}")
    if 'provenance' in book and book.get('provenance') is not None:
        if not provenance_ok(book.get('provenance')):
            errors.append(f"provenance 非法：{book.get('provenance')!r}")
    if 'physical_description' in book and book.get('physical_description') is not None:
        if not physical_description_ok(book.get('physical_description')):
            errors.append(f"physical_description 非法：{book.get('physical_description')!r}")
    if 'base_edition' in book and book.get('base_edition') is not None:
        if not base_edition_ok(book.get('base_edition'), book.get('id'),
                               book_ids if book_ids is not None else {},
                               work_ids if work_ids is not None else {}):
            errors.append(f"base_edition 非法：{book.get('base_edition')!r}")
    return errors


def validate_entity_fields(entity: dict) -> List[str]:
    errors: List[str] = []
    if 'dates' in entity and entity.get('dates') is not None:
        msg = dates_ok(entity)
        if msg is not None:
            errors.append(f'dates 非法：{msg}')
    if 'external_ids' in entity and entity.get('external_ids'):
        msg = external_ids_ok(entity)
        if msg is not None:
            errors.append(f'external_ids 非法：{msg}')
    return errors


def validate_collection_fields(collection: dict, reverse_has_book=False,
                               reverse_has_work=False) -> List[str]:
    errors: List[str] = []
    if '_member_type' in collection and collection.get('_member_type') is not None:
        if not member_type_ok(collection, reverse_has_book, reverse_has_work):
            errors.append(
                f"_member_type 非法：{collection.get('_member_type')!r}，"
                f"应为 {derive_member_type(collection, reverse_has_book, reverse_has_work)!r}"
            )
    return errors


__all__ = [
    'Vocab', 'build_vocab',
    'classification_ok', 'EDITION_TYPES', 'edition_type_ok',
    'provenance_ok', 'physical_description_ok',
    'BASE_EDITION_ROLES', 'base_edition_ok',
    'dates_ok', 'external_ids_ok',
    'MEMBER_TYPES', 'derive_member_type', 'member_type_ok',
    'validate_work_fields', 'validate_book_fields',
    'validate_entity_fields', 'validate_collection_fields',
]
