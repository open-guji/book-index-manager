"""立命館大学 ARC 古典籍ポータル 漢籍（C1，arc_kanseki；A9）。藏于海外诸馆（UCLA／AIC／UC Berkeley／Leiden…）的和汉古籍影像。
分册记录 holding_id 带「-NN」后缀，unit＝去后缀的 holding_id。责任者「謝肇淛（著）」「【著者】佐藤一斎」。"""
import re

from adapters.jpc1 import finalize, load_json, parse_author, parse_title, record

SOURCE = 'arc'
FILE = '立命館ARC古典籍漢籍.json'


def load(data_root):
    out = []
    for r in load_json(data_root, FILE):
        title, juan, force, _ = parse_title(r['bookName'])
        names, lead, era = parse_author(r.get('author'))
        prov = ((r.get('raw') or {}).get('common') or {}).get('provider', '')
        unit = prov + ':' + re.sub(r'-\d+$', '', r.get('holding_id') or r['source_record_id'])
        out.append(record(SOURCE, r, title, juan, names, lead, era, force, unit, sort=r.get('sort') or '',
                          extra=dict(provider=prov, call_no=r.get('holding_id', ''))))
    return finalize(out)
