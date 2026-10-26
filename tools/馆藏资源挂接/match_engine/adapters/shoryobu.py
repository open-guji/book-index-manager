"""宮内庁書陵部 図書寮文庫 漢籍（C1，shoryobu；A9）。多册书有总条（parent）与分册条（child，题名后括注册次），
unit＝parent_id（无则自身）；写入时 url 用总条的 Detail 页（总条缺则用分册页）。影像以 raw.has_image 为准（约 13%）。
分类「総記 > 叢書」→ COLLECTION。"""
import re
import unicodedata

from adapters.jpc1 import finalize, load_json, parse_author, parse_title, record

SOURCE = 'shoryobu'
FILE = '宮内庁書陵部図書寮文庫漢籍.json'


def load(data_root):
    raw = load_json(data_root, FILE)
    by_id = {r['source_record_id']: r for r in raw}
    out = []
    for r in raw:
        ex = r.get('extra') or {}
        pid = ex.get('parent_id') or ''
        bn = unicodedata.normalize('NFKC', r['bookName'])
        cut = re.search(r'\s*\((?=[^)]*[\d第首巻卷冊帙欠目])', bn)      # 「史記 （３４・第８９―９３）」「左伝付註 （５巻・後録（１巻））」：括注是册次／卷数
        title, juan, force, _ = parse_title(bn[:cut.start()] if cut else bn)
        if cut and juan is None:
            mj = re.search(r'(\d+)[巻卷]', bn[cut.start():])
            juan = int(mj.group(1)) if mj and not ex.get('parent_id') else None
        if '叢書' in (r.get('sort') or ''):
            force.append('COLLECTION')
        names, lead, era = parse_author(r.get('author'))
        unit = pid or r['source_record_id']
        par = by_id.get(pid)
        # 单卷零本：无总条而括注以「巻／第」起（「巻４９３（首尾欠）」「第８」「巻上」），或总条括注含「零巻」→ 局部
        own = unicodedata.normalize('NFKC', r['bookName'])
        if (not pid and re.search(r'^[^(]*\((?:巻|卷|第)', own)) or (par and re.search(r'零[巻卷]', unicodedata.normalize('NFKC', par['bookName']))):
            force.append('LOCAL_PART')
        out.append(record(SOURCE, r, title, juan, names, lead, era, force, unit, sort=r.get('sort') or '',
                          has_image=bool(ex.get('has_image')),
                          extra=dict(parent_id=pid, unit_url=(par or r)['url'], unit_record=(par or r)['source_record_id'],
                                     unit_title=(par or r)['bookName'], call_no=(par or r).get('holding_id', ''), basis=ex.get('kanseki_basis', ''))))
    return finalize(out)
