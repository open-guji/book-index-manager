"""块 D 步 3：朝代序判据，改读 #580 的 dynasty_reign_keys.json（+政权映射.tsv），取代各源内置 RANK。

键表是 book-index 的派生产物（不入仓）：
  python3 build/build_derived.py --root <book-index> --text-index <空目录> --out <DIR>   （约 2 分钟）
当前基准 book-index@7e7247c8fa，dynasty_reign_keys.json sha256 前缀 9726ab13417d（Edwin 验证记录：
overview 项目进展/朝代年号录入/对勘产出/键表体检-7e7247c8.md）。通过环境变量 DYNASTY_KEYS 或 load_keys(path) 指定。

粒度保持旧引擎的 0–9 序（回归要求与旧判定一致）：按朝代 [start,end] 中点落桶。
对不上键表的朝代名**不静默**：记入 MISSES，由 report 打印；旧 RANK 里键表没有的词只作兜底（来源标 legacy）。
"""
import collections
import csv
import json
import os
import re

import roots

# 桶界（公元年）：中点 ≤ 界 → 对应序。与旧 RANK 的语义一致：
# 先秦0；秦汉1；三国晋南北朝2；隋3；唐4；五代4.5；宋辽金5；元6；明7；清8；民国9
_BUCKETS = [(-221, 0), (220, 1), (581, 2), (618, 3), (907, 4), (960, 4.5), (1271, 5), (1368, 6), (1644, 7), (1911, 8)]

# 旧引擎内置词（键表里没有的才用到；来源标 legacy 以便审计）
LEGACY = {'先秦': 0, '周': 0, '秦': 0, '漢': 1, '汉': 1, '西漢': 1, '東漢': 1, '前漢': 1, '後漢': 1, '三國': 2, '魏': 2, '蜀': 2, '吳': 2,
          '吴': 2, '晉': 2, '晋': 2, '南朝': 2, '北朝': 2, '劉宋': 2, '南齊': 2, '蕭梁': 2, '隋': 3, '唐': 4, '五代': 4.5, '宋': 5, '北宋': 5,
          '南宋': 5, '遼': 5, '辽': 5, '金': 5, '元': 6, '明': 7, '清': 8, '民國': 9, '民国': 9, '近代': 9, '現代': 9, '北魏': 2, '東魏': 2,
          '西魏': 2, '北齊': 2, '北周': 2, '南北朝': 2, '上古': 0, '上古傳說': 0}

MISSES = collections.Counter()      # token -> 次数：键表和旧词表都认不出的朝代写法
_spans = {}                          # 名 -> (start, end)，仅唯一政权
AMBIGUOUS = set()                    # 键表里同名多个 dynasty 的名字：只能靠 LEGACY 兜底
_loaded = {'path': None}


def bucket(start, end):
    mid = (start + end) / 2.0
    for edge, r in _BUCKETS:
        if mid <= edge:
            return r
    return 9


def load_keys(path=None, mapping_tsv=None):
    """读键表。返回 (dynasty 名数, 政权映射条数)。"""
    path = path or roots.dynasty_keys()
    d = json.load(open(path, encoding='utf-8'))
    _spans.clear(); AMBIGUOUS.clear()
    for name, entries in d['keys'].items():
        ds = [e for e in entries if e.get('subtype') == 'dynasty' and e.get('start') is not None]
        if len({e['id'] for e in ds}) > 1:
            AMBIGUOUS.add(name)      # 同名多政权（宋／漢／晉／周／魏／齊…）：并集区间无意义，见 rank_of
        elif ds:      # 缺 end＝延续至今的政权（中華民國等），按 start 落桶
            _spans[name] = (ds[0]['start'], ds[0].get('end', ds[0]['start']))
    n_map = 0
    if mapping_tsv and os.path.exists(mapping_tsv):
        by_id = {}
        for name, entries in d['keys'].items():
            for e in entries:
                if e.get('subtype') == 'dynasty' and e.get('start') is not None:
                    by_id[e['id']] = (e['start'], e.get('end', e['start']))
        rows = collections.defaultdict(list)
        for r in csv.reader((l for l in open(mapping_tsv, encoding='utf-8') if not l.startswith('#')), delimiter='\t'):
            if len(r) >= 3 and r[1] != '朝代(源写法)' and r[2] in by_id:
                rows[r[1]].append(by_id[r[2]])
        for src, spans in rows.items():
            # 源写法没有直接键名、且映射到唯一政权时才借用；多行＝歧义（宋／齊…），不并集，交 LEGACY 兜底或记 MISSES
            if src not in _spans and src not in AMBIGUOUS and len(set(spans)) == 1:
                _spans[src] = spans[0]
                n_map += 1
    _loaded['path'] = path
    return len(_spans), n_map


def rank_of(token):
    """朝代名 → (序, 来源)；来源 keys／legacy／None。认不出时记 MISSES。"""
    if not token:
        return None, None
    if _loaded['path'] is None:
        load_keys()
    t = token.strip()
    if t in _spans:
        return bucket(*_spans[t]), 'keys'
    if t in LEGACY:
        return LEGACY[t], 'legacy-ambiguous' if t in AMBIGUOUS else 'legacy'
    if t in AMBIGUOUS:
        MISSES['歧义:' + t] += 1
        return None, None
    MISSES[t] += 1
    return None, None


_ERATOK = None


def _tokens():
    global _ERATOK
    # 单字词只认旧引擎的 LEGACY；键表新增的名字须 ≥2 字——否则 商→「商務印書館」、前／後 之类前缀会误判
    names = set(LEGACY) | {n for n in (set(_spans) | AMBIGUOUS) if len(n) >= 2}
    if _ERATOK is None or len(_ERATOK) != len(names):
        _ERATOK = sorted(names, key=len, reverse=True)
    return _ERATOK


def lead_era(s):
    """字符串开头（可含括号）的朝代标记 → 序或 None（版本串用）。"""
    s = re.sub(r'^[\s\[\(（［【〔題题]+', '', s or '')
    for t in _tokens():
        if s.startswith(t):
            r, _ = rank_of(t)
            if r is not None:
                return r
    return None


_ERA_SUFFIX = re.compile(r'[\s朝代末初释釋]*')   # 「(唐 )」「(宋释)」「(明末)」


def author_era(raw, strict=True):
    """责任者串开头 [朝代]／(朝代) 标注 → 序或 None。
    strict（默认）：括号内必须**整体**是朝代名（可带 朝／代／末／初），否则「[唐順之撰]」「[陳琯]」
    会把人名首字当朝代（旧引擎的隐患）；strict=False 复刻旧行为，仅供回归对照。"""
    m = re.match(r'^[\s題题]*[\[\(（［【〔]([^\]\)）］】〕]{1,4})[\]\)）］】〕]', raw or '')
    if m:
        g = m.group(1)
        for t in _tokens():
            if g.startswith(t) and (not strict or _ERA_SUFFIX.fullmatch(g[len(t):])):
                r, _ = rank_of(t)
                if r is not None:
                    return r
    return None


_MODIFIERS = {'前', '後', '后', '東', '西', '北', '南', '南朝', '北朝', '春秋', '戰國', '三國', '五代', '十六國'}


def _is_prefix_ok(x):
    if not x:
        return True
    return x in _MODIFIERS or x in LEGACY or x in _spans or x in AMBIGUOUS


def work_era(a):
    """Work.authors[] 项的 dynasty 字段 → 序或 None。"""
    d = a.get('dynasty') or ''
    for t in _tokens():
        # 旧引擎 endswith 会把「不明」判成明朝；后缀匹配只在前面部分也是朝代词／修饰词时成立（南朝宋、三國吳、春秋晉…）
        if d.startswith(t) or (d.endswith(t) and _is_prefix_ok(d[:-len(t)])):
            r, _ = rank_of(t)
            if r is not None:
                return r
    return None


def report():
    return dict(MISSES)
