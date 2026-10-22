"""NDL 古典籍适配器：只取汉籍（四库分类首段），按（题名,责任者,版本）成组＝一个藏本，一组一条 Record。
规则承 D3 的 match_ndl.py：N卷切题名、〓 缺字保留当通配、两种责任者格式、合刻（多位各自撰）和 N家 合集降级。"""
import glob
import json
import os
import re
import unicodedata

import era
import groups
from normalize import fold, PUNCT, ROLE, SECONDARY
from titleparse import cn2int

SOURCE = 'ndl'
HAN = ('經部', '史部', '子部', '集部', '叢書部')
DIR = '国立国会图书馆（NDL）古典籍'
JUANSPLIT = re.compile(r'[〇零一二三四五六七八九十百千廿卅\d]+[卷巻]')
MINOR = re.compile(r'^(目錄?|目録|首|卷首|附錄?|附録|附|補遺|拾遺|圖|図|序|跋|總目|总目|續|续|後|后|外集|別集|别集|年譜|年谱)$')


def segs_of(title):
    t = unicodedata.normalize('NFKC', title or '').replace('〓', '')
    parts = [p.strip(' 　,，') for p in JUANSPLIT.split(t)]
    out = [p for p in parts if p and not MINOR.match(PUNCT.sub('', p))]
    return out or ([t] if t else [])


def juan_of(title):
    m = re.search(r'([〇零一二三四五六七八九十百千廿卅\d]+)[卷巻]', unicodedata.normalize('NFKC', title or ''))
    return cn2int(m.group(1)) if m else None


def parse_ndl_author(s):
    """→ (主责任者名集合, 首个朝代标注)。〓 保留，比对时当通配符。"""
    s = unicodedata.normalize('NFKC', s or '')
    names, era_tok = set(), None
    if not s.strip():
        return names, None
    if re.match(r'^[^,;；]{1,3}, [^,;；]{1,4}(,|;|；|$)', s):       # 「何, 焯, 1661-1722；…」
        for p in re.split(r'[；;]', s):
            f = [x.strip() for x in p.split(',')]
            if len(f) >= 2 and re.search(r'[㐀-鿿]', f[0] + f[1]):
                nm = PUNCT.sub('', fold(f[0] + re.sub(r'\s*\d.*$', '', f[1])))
                if 2 <= len(nm) <= 6:
                    names.add(nm)
        return names, None
    dyn = era._tokens()
    for tok in re.split(r'[,，、;；]', s):
        tok = re.sub(r'^\s*[\(（]([^)）]{1,4})[\)）]\s*', lambda m: m.group(1), tok).strip()
        tok = re.sub(r'\s+', '', tok)
        if not tok:
            continue
        ds = [x for x in dyn if tok.startswith(x)]       # dyn 按长度降序；最长者优先
        d = ds[0] if ds else None
        alt = None
        if d:
            # 「明夏樹芳」：最长朝代「明夏」会吃掉姓。若更短的朝代能让剩余人名（去役割词后）≥3 字，两种切法的名字都收，朝代取短的
            rest = lambda x: ROLE.sub('', tok[len(x):])
            sh = next((x for x in ds[1:] if len(rest(d)) <= 2 and len(rest(x)) >= 3), None)
            if sh:
                alt, d = tok[len(sh):], sh
            era_tok = era_tok or d
            tok = tok[len(ds[0]):]
        if alt:
            nm2 = PUNCT.sub('', fold(re.sub(r'等$', '', ROLE.sub('', alt))))
            if 2 <= len(nm2) <= 6:
                names.add(nm2)
        role = ROLE.search(tok)
        core = ROLE.sub('', tok) if role else tok
        core = re.sub(r'等$', '', core)
        if role and SECONDARY.search(role.group(0)) and not re.search(r'[撰著編编輯辑纂述選选注註傳传箋笺]', role.group(0)):
            continue
        nm = PUNCT.sub('', fold(core))
        if nm in ('阙名', '不详', '佚名', '无名氏'):
            continue
        if 2 <= len(nm) <= 6:
            names.add(nm)
    return names, era_tok


def load(data_root, path=DIR):
    raw = []
    for f in sorted(glob.glob(os.path.join(data_root, path, 'part-*.json'))):
        raw += json.load(open(f, encoding='utf-8'))
    recs = [r for r in raw if ((r.get('extra') or {}).get('siku_class') or '').split('/')[0] in HAN]
    out = []
    for key, rs in groups.ndl_groups(recs).items():
        r = rs[0]
        names, era_tok = parse_ndl_author(r.get('author'))
        a = unicodedata.normalize('NFKC', r.get('author') or '')
        force = []
        if len(re.findall(r'撰', a)) >= 2 and len(names) >= 2:
            force.append('MULTI_TITLE')              # 合刻：多位责任者各自撰
        if re.match(r'^[二三四五六七八九十]家', unicodedata.normalize('NFKC', r['bookName'])):
            force.append('COLLECTION')               # 合集（N家）
        img = next((x.get('image_url') for x in rs if x.get('image_url')), '')
        sk = r['extra']['siku_class']
        p = dict(wname='', names=names, era_token=era_tok, juan=juan_of(r['bookName']), segs=segs_of(r['bookName']), alts=[],
                 sort=sk.replace('叢書部', '叢書'), force=force)
        out.append(dict(source=SOURCE, source_record_id=str(r['source_record_id']), group_key='|'.join(key), title_raw=r['bookName'],
                        author_raw=r.get('author') or '', version_raw=r.get('version') or '', juan=p['juan'], class_raw=sk,
                        url=r.get('url') or '', image_url=img, has_image=bool(img),
                        extra=dict(n_vols=len(rs), iiif_manifest=(r.get('extra') or {}).get('iiif_manifest', ''),
                                   parent=(r.get('extra') or {}).get('parent_bib_url', '')), parsed=p))
    return out
