"""東京大学東洋文化研究所 漢籍善本全文影像資料庫（C1，ioc_shanben；A9）。一条记录＝一部书（叢書子目各自一条，各有影像）。
责任者优先用 detail.撰者 的结构化 [朝代, 名, 拼音, 役割]；影像以 list.has_text_image 为准（叢書总条为 False）。
题名前的「[雜腔唱本]」「[唱本一百九十冊]」是所属丛书，归一时去掉。"""
import re
import unicodedata

from adapters.jpc1 import finalize, load_json, parse_author, parse_title, record

SOURCE = 'ioc'


def series_name(s):
    """「舊小說戊集第二冊」→「舊小說」；「福建刊十三經註疏」原样；去掉冊次／集次。"""
    s = unicodedata.normalize('NFKC', s or '').strip('[]［］ ')
    s = re.sub(r'[甲乙丙丁戊己庚辛壬癸]集.*$|第[\d一二三四五六七八九十]+[集冊册].*$|之一$', '', s)
    return s.strip()
FILE = '東洋文化研究所漢籍善本全文影像.json'


def load(data_root):
    out = []
    for r in load_json(data_root, FILE):
        det = (r.get('raw') or {}).get('detail') or {}
        st = [(a[0], a[1], a[3] if len(a) > 3 else '') for a in det.get('撰者') or [] if len(a) >= 2]
        title, juan, force, _ = parse_title(r['bookName'])
        if re.search(r'[)）]', unicodedata.normalize('NFKC', r['bookName'])):     # 「牡丹亭(勸農)一卷」：曲譜折子，全书之一部
            force.append('LOCAL_PART')
        names, lead, era = parse_author(r.get('author'), st or None)
        ex = r.get('extra') or {}
        out.append(record(SOURCE, r, title, juan, names, lead, era, force, r['source_record_id'], sort=r.get('sort') or '',
                          has_image=bool(ex.get('has_text_image')), extra=dict(series=series_name(ex.get('series', '')), call_no=r.get('holding_id', ''))))
    return finalize(out)
