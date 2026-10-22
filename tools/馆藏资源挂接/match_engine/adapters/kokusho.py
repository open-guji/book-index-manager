"""国書データベース适配器：`kokusho/part-*.json` → 统一 Record（含解析好的 parsed，供 tier 用）。
规则承 D3 match_kokusho.py：著作名＋bookName「／」分段为题名候选；责任者缺失借同著作组兄弟的（>4 个名字不借）。"""
import glob
import json
import os
import re
import unicodedata

import groups
from normalize import norm_title, parse_kokusho_author
from titleparse import cn2int

SOURCE = 'kokusho'
VOLCH = set('前後后续續正別别首末上中下天地人乾坤元亨利貞贞集編篇附録录初二三四五六七八九十百千卷巻冊册完全第之補补遺遗拾')


def clean_work_name(n):
    """「古文真宝（こぶんしんぽう）（Kobunshinpou）」→「古文真宝」"""
    n = unicodedata.normalize('NFKC', n or '')
    return re.sub(r'[（(][^）)]*[）)]', '', n).strip()


def real_segments(book_name):
    """bookName 按「／」切段，剔除罗马字段与卷次段。"""
    out = []
    for s in (x.strip() for x in unicodedata.normalize('NFKC', book_name or '').split('/')):
        k = norm_title(s)
        if not k or not re.search(r'[㐀-鿿]', k) or all(ch in VOLCH or ch.isdigit() for ch in k):
            continue
        out.append(s)
    return out


def alt_titles(det):
    out = []
    for t in (det.get('kshomei') or []) + ([det['hshomei']] if det.get('hshomei') else []):
        t = re.sub(r'^\d+．', '', unicodedata.normalize('NFKC', t))
        t = t.split('，')[0] if '，' in t else t
        t = re.sub(r'[（(][^）)]*[）)]', '', t).strip()
        if t:
            out.append(t)
    return out


def parse_juan(rec):
    det = rec['raw']['detail']
    for src in (det.get('kansu') or '', rec['bookName']):
        m = re.search(r'([〇零一二三四五六七八九十百千廿卅\d]+)[卷巻]', unicodedata.normalize('NFKC', src))
        if m:
            try:
                return cn2int(m.group(1))
            except Exception:
                pass
    return None


def prep(rec):
    det = rec['raw']['detail']
    w0 = (det.get('work') or [{}])[0] if det.get('work') else {}
    names, era = parse_kokusho_author(rec.get('author'), primary_only=True)
    for a in det.get('author') or []:
        n, e = parse_kokusho_author(a, primary_only=True)
        names |= n
        era = era or e
    return dict(wid=str(w0.get('wid', '')) if w0 else '', wname=clean_work_name(w0.get('name', '')) if w0 else '', names=names,
                era_token=era, juan=parse_juan(rec), segs=real_segments(rec['bookName']), alts=alt_titles(det), sort=rec.get('sort') or '')


def load(data_root, path='kokusho'):
    raw = []
    for f in sorted(glob.glob(os.path.join(data_root, path, 'part-*.json'))):
        raw += json.load(open(f, encoding='utf-8'))
    P = [prep(r) for r in raw]
    by_wid = {}
    for p in P:
        if p['names']:
            by_wid.setdefault(p['wid'], []).append(p['names'])
    borrow = groups.group_names(by_wid)
    out = []
    for r, p in zip(raw, P):
        if not p['names'] and borrow.get(p['wid']):
            p['names'] = borrow[p['wid']]
            p['borrowed'] = True
        image = r.get('image_url') or ''
        out.append(dict(source=SOURCE, source_record_id=str(r['source_record_id']), group_key=p['wid'], title_raw=r['bookName'],
                        author_raw=r.get('author') or '', author_book=' '.join(((r.get('raw') or {}).get('detail') or {}).get('author') or []),
                        detail_works=[' '.join(a.get('name', '') for a in (w.get('author') or [])) for w in (((r.get('raw') or {}).get('detail') or {}).get('work') or [])],
                        kshomei=((r.get('raw') or {}).get('detail') or {}).get('kshomei') or '', version_raw=r.get('version') or '', juan=p['juan'], class_raw=p['sort'],
                        url=r.get('url') or '', image_url=image, has_image=bool(image),
                        extra=dict(kind=(r['raw'] or {}).get('shubetsu', ''), holder=(r['raw'] or {}).get('collection', ''), iiif_manifest=image),
                        parsed=p))
    return out
