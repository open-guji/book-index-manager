"""块 D 步 4：三档判定核心（纯函数，无 IO）。

judge(rec, wi, pol) -> Result
  rec：统一输入记录（设计 §2.1）。dict，字段 source/title_raw/author_raw/version_raw/juan/extra，
       适配器可另给 rec['parsed']（国書／NDL 已解析的题名段、责任者名集合、朝代标注等），见 prepare()。
  wi ：workindex.WorkIndex（与 pol.profile(source).jp 同模式）
  pol：Policy

确定档四个充分条件（缺任一降存疑）：T_EXACT 题名全等 ∧ A_EQ 责任者主名有交集 ∧ W_UNIQUE 唯一 Work ∧ ERA_OK 朝代无冲突；
另外无 丛书／合刻／方志前缀／局部标记／卷数悬殊／版本早于作者 等降级码。GLM 等模型不参与本函数。
"""
import difflib
import re
from dataclasses import dataclass, field

import era
from normalize import norm_title, norm_author
from titleparse import (COLL_BASE, COLL_EXT, PREF, LOCAL_PART, SUPPLEMENT, supplement_marks, split_title, multi_title, parse_juan, local_part_text)

CONFIRMED, DOUBT, NONE = '确定', '存疑', '无'
EURO = ('bnf', 'bsb', 'sbb', 'loc', 'cudl', 'onb')

CODES_SUFFICIENT = ('T_EXACT', 'A_EQ', 'W_UNIQUE', 'ERA_OK')
CODES_DOUBT = ('T_FUZZY', 'T_AUTHOR_NEAR', 'A_MISSING', 'A_DIFF', 'A_ALIAS_ONLY', 'ERA_CONFLICT', 'ERA_VERSION_EARLIER',
               'JUAN_GAP', 'COLLECTION', 'MULTI_TITLE', 'LOCAL_PART', 'GAZETTEER_PREFIX', 'MULTI_WORK', 'DUP_WORK_SUSPECT',
               'GROUP_SPLIT', 'CAP_DROPPED', 'SUPPLEMENT', 'ALT_TITLE_SIBLING', 'A_SECONDARY_ONLY', 'HUMAN_REJECT')
CODES_NONE = ('T_MISS', 'T_EMPTY', 'NOT_HANZI')
ALL_CODES = CODES_SUFFICIENT + CODES_DOUBT + CODES_NONE

TEXT = {
    'T_EXACT': '题名全等', 'A_EQ': '责任者相合', 'W_UNIQUE': '唯一 Work', 'ERA_OK': '朝代无冲突',
    'T_FUZZY': '去装饰词／异名后题名相合', 'T_AUTHOR_NEAR': '同责任者+近似题名', 'A_MISSING': '责任者缺一方',
    'A_DIFF': '同题名但责任者不合', 'A_ALIAS_ONLY': '责任者仅经 Entity 别名相合', 'ERA_CONFLICT': '作者朝代冲突',
    'ERA_VERSION_EARLIER': '版本早于作者朝代', 'JUAN_GAP': '卷数悬殊', 'COLLECTION': '丛书/合集',
    'MULTI_TITLE': '一条记录含多个题名（合刻/合订）', 'LOCAL_PART': '局部（摘抄/残本/序跋等）',
    'GAZETTEER_PREFIX': '地方志带朝代前缀', 'MULTI_WORK': '同题多 Work', 'DUP_WORK_SUSPECT': '本仓同题同责任者多个 Work（疑重复）',
    'GROUP_SPLIT': '同书成组内各条落到不同 Work', 'CAP_DROPPED': '超出每 Work 每来源藏本上限', 'SUPPLEMENT': '记录题名带续／补等标记而 Work 题名无（疑续集／补编）', 'ALT_TITLE_SIBLING': '仅靠 Work 附加题名命中且有兄弟 Work／额外责任者（疑注疏本）', 'HUMAN_REJECT': '人核否决（data/human_verdicts.tsv）', 'A_SECONDARY_ONLY': '站方首位责任者与 Work 不合，仅非首位责任者相合（疑注疏者／编者）', 'T_MISS': '题名未命中',
    'T_EMPTY': '题名为空', 'NOT_HANZI': '非汉籍',
}


@dataclass
class Profile:
    """每源开关。数值／布尔都由适配器所属源决定，改口径只改这里。"""
    jp: bool = True               # 日文新字体折叠（国图 False）
    style: str = 'raw'            # raw：从 title_raw 拆；parsed：用 rec['parsed']
    coll: object = COLL_BASE      # 丛书正则
    version_era: bool = False     # 版本串早于作者朝代（国图）
    gazetteer: bool = False       # 方志朝代前缀（国图）
    alias: bool = False           # Entity 别名（国書／NDL）
    alt_titles: bool = False      # 异名子目题名召回（国書）
    shi_strip: bool = False       # 「释」前缀两侧剥掉再比
    wildcard: bool = False        # 〓 通配（NDL）
    local_part: bool = True       # 局部标记统一降级（新增）
    multi_mode: str = 'rest'      # rest：题名后附部分含别的题名；segs：≥2 个不同题名段
    alt_sibling_brake: bool = False   # 仅凭 Work 附加题名命中且（有兄弟 Work 或有额外责任者）→ 存疑（R1-E5，Milo 批）
    lead_brake: bool = False          # 站方首位责任者须与 Work 相合（责任方式丢失的源，如早稲田）
    pinyin: bool = False              # 站方罗马字（拼音）责任者与 Work 著者拼音比（A8 欧美馆，loc 只有拼音）


@dataclass
class Policy:
    near_title_ratio: float = 0.8
    min_author_substr_len: int = 3
    juan_gap_abs: int = 5
    juan_gap_ratio: float = 0.5
    profiles: dict = field(default_factory=lambda: {
        'nlc': Profile(jp=False, style='raw', coll=COLL_BASE, version_era=True, gazetteer=True, multi_mode='rest'),
        'ncltw': Profile(jp=False, style='raw', coll=COLL_BASE, version_era=True, gazetteer=True, multi_mode='rest'),   # C3 台湾国图，著录体例同国图
        'kokusho': Profile(jp=True, style='parsed', coll=COLL_EXT, alias=True, alt_titles=True, shi_strip=True, multi_mode='segs'),
        'ndl': Profile(jp=True, style='parsed', coll=COLL_EXT, alias=True, shi_strip=True, wildcard=True, multi_mode='segs'),
        'naikaku': Profile(jp=True, style='parsed', coll=COLL_EXT, alias=True, shi_strip=True, multi_mode='segs'),
        'waseda': Profile(jp=True, style='parsed', coll=COLL_EXT, alias=True, shi_strip=True, multi_mode='segs', alt_sibling_brake=True),   # R1-E5：只出三档表
        **{s: Profile(jp=False, style='parsed', coll=COLL_EXT, alias=True, shi_strip=True, multi_mode='segs', alt_sibling_brake=True,
                      lead_brake=True, pinyin=True) for s in EURO},   # A8 欧美六馆
    })

    def profile(self, source):
        return self.profiles[source]


@dataclass
class Result:
    tier: str
    work_id: str = ''
    candidates: list = field(default_factory=list)
    codes: list = field(default_factory=list)
    evidence: dict = field(default_factory=dict)

    @property
    def reasons_text(self):
        return '；'.join(TEXT[c] for c in self.codes)


# --------------------------------------------------------------------------- 准备
@dataclass
class Query:
    keys: list            # 归一题名候选（先 Work 名后各段）
    names: set            # 责任者归一名
    a_era: object         # 作者朝代序或 None
    v_era: object         # 版本朝代序或 None
    juan: object
    is_coll: bool
    is_multi: bool
    gaz: bool
    local: bool
    alts: list = field(default_factory=list)
    force: list = field(default_factory=list)     # 适配器指定的额外降级码
    borrowed: bool = False
    own_marks: set = field(default_factory=set)   # 记录自身题名里的续／补标记
    lead: set = field(default_factory=set)        # 站方首位责任者（责任方式丢失的源）
    main_key: str = ''                            # 本册自己的题名键（parsed 取 segs[0]，不取丛书／合刻名 wname）
    roman: list = field(default_factory=list)     # 罗马字（拼音）责任者键，首位在前（A8）


def _rank_of_token(tok):
    if not tok:
        return None
    r = era.rank_of(tok)[0]
    return r if r is not None else era.lead_era(tok)


def prepare(rec, prof):
    if prof.style == 'raw':
        title = rec.get('title_raw') or ''
        core, rest, era_hint = split_title(title)
        key = norm_title(core, prof.jp)
        names = {x for x in norm_author(rec.get('author_raw'), prof.jp).split('|') if x}
        juan = rec.get('juan') if rec.get('juan') is not None else parse_juan(rest, core)
        return Query(own_marks=supplement_marks([key]), keys=[key] if key else [], names=names, a_era=era.author_era(rec.get('author_raw')),
                     v_era=era.lead_era(rec.get('version_raw') or '') if prof.version_era else None, juan=juan,
                     is_coll=bool(prof.coll.search(rest) or prof.coll.search(core)),
                     is_multi=multi_title(rest), gaz=bool(era_hint) and prof.gazetteer,
                     local=bool(prof.local_part and LOCAL_PART.search(local_part_text(title, rest))))
    p = rec.get('parsed') or {}
    segs = p.get('segs') or []
    keys, seen = [], set()
    for t in ([p['wname']] if p.get('wname') else []) + segs:
        k = norm_title(t, prof.jp)
        if k and k not in seen:
            seen.add(k); keys.append(k)
    is_coll = bool(prof.coll.search(p.get('wname') or '') or any(prof.coll.search(s) for s in segs[:1])) or (p.get('sort') or '').startswith('叢書')
    uniq = {norm_title(s, prof.jp) for s in segs}
    title = rec.get('title_raw') or ''
    own = [norm_title(t, prof.jp) for t in segs] or [norm_title(title, prof.jp)]
    return Query(own_marks=supplement_marks(own), keys=keys, names=set(p.get('names') or ()), a_era=_rank_of_token(p.get('era_token')), v_era=None,
                 juan=p.get('juan'), is_coll=is_coll, is_multi=len(uniq) >= 2, gaz=False,
                 local=bool(prof.local_part and LOCAL_PART.search(local_part_text(title, '', segs[1:]))),
                 alts=[norm_title(t, prof.jp) for t in (p.get('alts') or [])] if prof.alt_titles else [],
                 force=list(p.get('force') or []), borrowed=bool(p.get('borrowed')),
                 lead=set(p.get('lead') or ()), roman=list(p.get('roman') or ()) if prof.pinyin else [], main_key=norm_title(segs[0], prof.jp) if segs else (keys[0] if keys else ''))


# --------------------------------------------------------------------------- 责任者关系
def _shi(ns):
    return {n[1:] if n.startswith('释') and len(n) > 2 else n for n in ns}


def _wild_eq(a, b):
    return len(a) == len(b) and all(x == '〓' or x == y for x, y in zip(a, b))


_PY = {}


def pinyin_keys(name):
    """归一汉字名 → 拼音键集合（多音字全组合，最多 64 种）；「释」前缀两读都给。"""
    if name not in _PY:
        from pypinyin import pinyin, Style
        import itertools
        out = set()
        for nm in {name, name[1:] if name.startswith('释') and len(name) > 2 else name}:
            ps = pinyin(nm, style=Style.NORMAL, heteronym=True, errors='ignore')
            if not ps or len(ps) != len(nm):
                continue
            combos = 1
            for p in ps:
                combos *= len(p)
            if combos > 64:
                ps = [p[:1] for p in ps]
            for c in itertools.product(*ps):
                out.add(''.join(c).replace('ü', 'v'))
        _PY[name] = out
    return _PY[name]


def _roman_eq(roman, w):
    return any(r in pinyin_keys(a) for r in roman for a in w['authors'])


def auth_relation(lib, w, prof, pol, roman=None):
    """'eq' 有交集／'alias' 仅别名／'missing' 任一方缺／'diff'。roman：站方拼音责任者（prof.pinyin 时用）。"""
    if roman and prof.pinyin and (w['authors'] or w['alias']):
        rel = auth_relation(lib, w, prof, pol) if lib else 'diff'
        if rel == 'eq':
            return rel
        return 'eq' if _roman_eq(roman, w) else rel
    if not lib or not (w['authors'] or (prof.alias and w['alias'])):
        return 'missing'
    if lib & w['authors'] or (prof.shi_strip and _shi(lib) & _shi(w['authors'])):
        return 'eq'
    n = pol.min_author_substr_len
    for a in lib:
        for b in w['authors']:
            if len(a) >= n and len(b) >= n and (a in b or b in a):
                return 'eq'
    if prof.wildcard:
        for a in lib:
            if '〓' in a and any(_wild_eq(a[1:] if a.startswith('释') and len(a) > 2 else a, b[1:] if b.startswith('释') and len(b) > 2 else b)
                                 for b in w['authors']):
                return 'eq'
    if prof.alias and lib & w['alias']:
        return 'alias'
    return 'diff'


def _load_nondup():
    import os
    out = set()
    f = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'known_nondup_pairs.tsv')
    if os.path.exists(f):
        for line in open(f, encoding='utf-8'):
            if line.startswith('#') or line.startswith('work_a'):
                continue
            p = line.rstrip('\n').split('\t')
            if len(p) >= 2 and p[0] and p[1]:
                out.add(frozenset((p[0], p[1])))
    return out


KNOWN_NONDUP = _load_nondup()


def _load_human():
    import os
    out = {}
    f = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'human_verdicts.tsv')
    if os.path.exists(f):
        for line in open(f, encoding='utf-8'):
            p = line.rstrip('\n').split('\t')
            if len(p) >= 3 and p[0] and not p[0].startswith('#') and p[0] != 'source':
                out[(p[0], p[1])] = p[2]
    return out


HUMAN = _load_human()      # {(source, record_id): 'release'|'reject'}：人核定论，release 免 ALT_TITLE_SIBLING 刹车，reject 一律存疑


def _all_known_nondup(ws):
    ids = [w['id'] for w in ws]
    return len(ids) > 1 and all(frozenset((a, b)) in KNOWN_NONDUP for i, a in enumerate(ids) for b in ids[i + 1:])


# --------------------------------------------------------------------------- 判定
def judge(rec, wi, pol):
    prof = pol.profile(rec['source'])
    q = prepare(rec, prof)
    if not q.keys:
        return Result(NONE, codes=['T_EMPTY'])
    if not any(re.search(r'[\u3400-\u9fff]', k) for k in q.keys):
        return Result(NONE, codes=['NOT_HANZI'])
    cands, how = [], 'T_EXACT'
    for k in q.keys:
        for w in wi.idx.get(k, []):
            if w not in cands:
                cands.append(w)
    if not cands:
        how = 'T_FUZZY'
        for k in q.keys:
            k2 = PREF.sub('', k)
            for w in wi.idx2.get(k2, []) + (wi.idx.get(k2, []) if k2 != k else []):
                if w not in cands:
                    cands.append(w)
    if not cands and q.alts:
        for k in q.alts:
            for w in wi.idx.get(k, []):
                if w not in cands:
                    cands.append(w)
    if not cands:
        best = None
        for n in sorted(q.names):
            for kt, w in wi.byauth.get(n, []):
                for key in q.keys[:2]:
                    if abs(len(kt) - len(key)) > max(3, len(key) // 3):
                        continue
                    sc = difflib.SequenceMatcher(None, key, kt).ratio()
                    if sc >= pol.near_title_ratio and (best is None or sc > best[0] or (sc == best[0] and w['id'] < best[1]['id'])):
                        best = (sc, w)
        if best:
            codes = ['T_AUTHOR_NEAR'] + (['COLLECTION'] if q.is_coll else [])
            return Result(DOUBT, best[1]['id'], [best[1]['id']], codes, dict(title_match='near', ratio=round(best[0], 2)))
        return Result(NONE, codes=['T_MISS'] + (['COLLECTION'] if q.is_coll else []))

    scored = []
    for w in cands:
        rel = auth_relation(q.names, w, prof, pol, q.roman)
        flags = []
        if q.a_era is not None and w['eras'] and all(abs(q.a_era - e) > 0.9 for e in w['eras']):
            flags.append('ERA_CONFLICT')
        if q.v_era is not None and w['eras'] and min(w['eras']) > q.v_era + 0.01:
            flags.append('ERA_VERSION_EARLIER')
        if q.juan and w['juan'] and w['juan_unit'] in (None, '卷') and abs(q.juan - w['juan']) > max(pol.juan_gap_abs, pol.juan_gap_ratio * max(q.juan, w['juan'])):
            flags.append('JUAN_GAP')
        if q.own_marks - supplement_marks(w.get('tkeys') or ()):
            flags.append('SUPPLEMENT')
        if rel == 'eq' and prof.lead_brake and (q.lead or q.roman) and auth_relation(q.lead, w, prof, pol, q.roman[:1]) != 'eq':
            flags.append('A_SECONDARY_ONLY')
        hv = HUMAN.get((rec['source'], str(rec.get('source_record_id'))))
        if rel == 'eq' and hv == 'reject':
            flags.append('HUMAN_REJECT')
        if rel == 'eq' and hv != 'release' and prof.alt_sibling_brake and how == 'T_EXACT' and norm_title(w['title'], prof.jp) not in q.keys:
            extra = [n for n in q.names if not any(n in a or a in n for a in w['authors'])]
            if len(cands) > 1 or extra:
                flags.append('ALT_TITLE_SIBLING')
        scored.append((rel, flags, w))
    good = [x for x in scored if x[0] == 'eq' and not x[1]]
    eq_any = [x for x in scored if x[0] == 'eq']
    if len(good) > 1 and _all_known_nondup([x[2] for x in good]):      # 已知非重复的兄弟书：认主题名与记录首个题名一致者，否则仍按多 Work 处理
        pref = [x for x in good if norm_title(x[2]['title'], prof.jp) == (q.main_key or (q.keys[0] if q.keys else ''))]
        if len(pref) == 1:
            good = pref
            eq_any = [x for x in eq_any if x is pref[0] or not _all_known_nondup([x[2], pref[0][2]])]
    cand_ids = [x[2]['id'] for x in scored]
    ev = dict(title_match='exact' if how == 'T_EXACT' else 'fuzzy', author_rel=[x[0] for x in scored][:8],
              era_flag=sorted({f for x in scored for f in x[1] if f.startswith('ERA')}),
              juan_flag='JUAN_GAP' in {f for x in scored for f in x[1]}, n_cands=len(cands))
    codes, wid = [], ''
    if how == 'T_EXACT' and len(good) == 1 and len(eq_any) == 1 and not (q.is_coll or q.gaz or q.is_multi or q.local or q.force):
        return Result(CONFIRMED, good[0][2]['id'], cand_ids, list(CODES_SUFFICIENT), ev)
    if how != 'T_EXACT':
        codes.append('T_FUZZY')
        if len(good) == 1:
            wid = good[0][2]['id']
        elif len(eq_any) == 1:
            wid = eq_any[0][2]['id']
    else:
        if len(eq_any) == 1:
            wid = eq_any[0][2]['id']
        if len(good) > 1:
            codes.append('DUP_WORK_SUSPECT')
        elif len(eq_any) > 1:
            codes.append('MULTI_WORK')
        if any(x[0] == 'missing' for x in scored):
            codes.append('A_MISSING')
        if not eq_any and all(x[0] == 'diff' for x in scored):
            codes.append('A_DIFF')
        if not eq_any and any(x[0] == 'alias' for x in scored):
            codes.append('A_ALIAS_ONLY')
            al = [x for x in scored if x[0] == 'alias']
            if len(al) == 1:
                wid = al[0][2]['id']
        if len(eq_any) == 1:
            codes += eq_any[0][1]
        if len(cands) > 1 and not good and 'MULTI_WORK' not in codes:
            codes.append('MULTI_WORK')
    if q.is_coll:
        codes.append('COLLECTION')
    if q.gaz:
        codes.append('GAZETTEER_PREFIX')
    if q.is_multi:
        codes.append('MULTI_TITLE')
    if q.local:
        codes.append('LOCAL_PART')
    codes += q.force
    if not codes:       # 不可能：确定的充分条件缺任一都会产生码；到这里＝逻辑漏洞，宁可崩
        raise AssertionError('降存疑却无原因码: %r' % (rec,))
    ev['borrowed_author'] = q.borrowed
    return Result(DOUBT, wid, cand_ids, list(dict.fromkeys(codes)), ev)
