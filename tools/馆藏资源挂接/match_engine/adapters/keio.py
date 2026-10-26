"""慶應義塾図書館 漢籍コレクション（C1，keio_kanseki；A9）。按册著录（同一部书每册一条、各有 IIIF），
unit＝（题名, 责任者, 版本）相同者。题名「宋史紀事本末 10巻. 元史紀事本末 4巻」以「. 」分合刻 → MULTI_TITLE。
责任者「唐李嶠 撰」「明詹淮 撰 明李廷鰲等 校」：朝代粘连人名。"""
from adapters.jpc1 import finalize, Splitter, load_json, parse_author, parse_title, record

SOURCE = 'keio'
FILE = '慶應義塾図書館漢籍コレクション.json'
SPLIT = Splitter(r'\.\s+', multi=True)


def load(data_root):
    out = []
    for r in load_json(data_root, FILE):
        title, juan, force, _ = parse_title(r['bookName'], SPLIT)
        names, lead, era = parse_author(r.get('author'))
        unit = 'u:' + '|'.join((r['bookName'], r.get('author') or '', r.get('version') or ''))
        out.append(record(SOURCE, r, title, juan, names, lead, era, force, unit, extra=dict(call_no=r.get('holding_id', ''))))
    return finalize(out)
