"""東京大学デジタルアーカイブ 漢籍（C1，utokyo_da；A9）。按册著录：同 holding_id 为一个藏本（unit）。
题名「本草綱目 52巻序目1巻圖3巻 (存54巻) ; 圖卷上」：` ; ` 后是册次，不当合刻。"""
from adapters.jpc1 import finalize, Splitter, load_json, parse_author, parse_title, record

SOURCE = 'utokyo'
FILE = '東京大学デジタルアーカイブ漢籍.json'
SPLIT = Splitter(r'\s;\s', multi=False)


def load(data_root):
    out = []
    for r in load_json(data_root, FILE):
        title, juan, force, _ = parse_title(r['bookName'], SPLIT)
        names, lead, era = parse_author(r.get('author'))
        unit = 'h:' + r['holding_id'] if r.get('holding_id') else r['source_record_id']
        out.append(record(SOURCE, r, title, juan, names, lead, era, force, unit, sort=r.get('sort') or '',
                          extra=dict(provider=((r.get('raw') or {}).get('common') or {}).get('provider', '').split('\n')[0])))
    return finalize(out)
