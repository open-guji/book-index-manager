"""名古屋大学附属図書館 漢籍（C1，nagoya_kanseki；A9）。几乎只有书目（有影像约 2.5%）；无影像条按 K3 不写。
题名卷数粘连（「荀子集解二十巻首一巻」），责任者朝代粘连（「清 王先謙撰」「淸丁日昌撰」）。"""
from adapters.jpc1 import finalize, load_json, parse_author, parse_title, record

SOURCE = 'nagoya'
FILE = '名古屋大学附属図書館漢籍.json'


def load(data_root):
    out = []
    for r in load_json(data_root, FILE):
        title, juan, force, _ = parse_title(r['bookName'])
        names, lead, era = parse_author(r.get('author'))
        out.append(record(SOURCE, r, title, juan, names, lead, era, force, r['source_record_id'], sort=r.get('sort') or '',
                          extra=dict(call_no=r.get('holding_id', ''))))
    return finalize(out)
